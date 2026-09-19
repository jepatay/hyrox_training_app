import { Router } from 'express';
import { collections, docToObj } from '../services/firebase.js';
import { rebuildWeekDigest } from '../services/trainingLoad.js';
import { extractExercisesFromNotes, generateStationScores, renderExtractionSummary, parseExtractionSummary, extractExercisesFromNotesV2, renderExtractionSummaryV2, parseExtractionSummaryV2, ensureRunLines } from '../services/claude.js';
import { resolveExercisesAgainstLibrary, listLibrary } from '../services/exerciseLibrary.js';
import admin from 'firebase-admin';

const router = Router();

async function runBackgroundJobs(session, { notesChanged = false, isEdit = false } = {}) {
  if (!session?.date) return;
  await rebuildWeekDigest(session.date);

  // Extract structured exercise data from notes and store back on the session.
  // Re-run whenever notes changed so stale extraction never lingers after an edit.
  const needsExtraction = session.notes?.trim() && session.status === 'completed' && (notesChanged || !session.extractedExercises);
  if (needsExtraction) {
    const rawExtracted = await extractExercisesFromNotes({ type: session.type, notes: session.notes });
    if (rawExtracted && session.id) {
      const { exercises } = await resolveExercisesAgainstLibrary(rawExtracted.exercises);
      const extracted = { ...rawExtracted, exercises };
      await collections.sessions().doc(session.id).update({ extractedExercises: extracted });
      session = { ...session, extractedExercises: extracted };
    }
  }

  // Refresh station impact scores after an edit changes the underlying training data.
  // (On creation, the frontend already triggers this explicitly — skip to avoid a duplicate call.)
  if (isEdit && notesChanged && session.status === 'completed') {
    const [knowledgeDoc, profileDoc, library] = await Promise.all([
      collections.knowledge().doc('exercise_transferability').get(),
      collections.profile().doc('main').get(),
      listLibrary(),
    ]);
    const knowledge = knowledgeDoc.exists ? knowledgeDoc.data().content : null;
    const stationModel = profileDoc.exists ? profileDoc.data().stationModel : null;
    const result = await generateStationScores({ session, knowledge, stationModel, library });
    if (result && session.id) {
      await collections.sessions().doc(session.id).update({
        stationScores: result.scores,
        stationEquivalence: result.equivalence,
      });
    }
  }
}

// GET sessions with optional filters
router.get('/', async (req, res) => {
  try {
    let query = collections.sessions().orderBy('date', 'desc');
    if (req.query.type) query = query.where('type', '==', req.query.type);
    if (req.query.status) query = query.where('status', '==', req.query.status);
    if (req.query.limit) query = query.limit(parseInt(req.query.limit));
    const snap = await query.get();
    res.json(snap.docs.map(docToObj).filter(Boolean));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// GET station-equivalence trends across recent sessions, grouped by station.
// Registered before GET /:id so "station-trends" isn't swallowed as an id.
router.get('/station-trends', async (req, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days) : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const snap = await collections.sessions()
      .where('date', '>=', cutoffStr)
      .orderBy('date', 'asc')
      .get();

    const sessions = snap.docs.map(docToObj).filter(s => s && s.stationEquivalence);

    const trends = {};
    for (const s of sessions) {
      for (const [key, data] of Object.entries(s.stationEquivalence)) {
        (trends[key] ||= []).push({
          date: s.date,
          sessionId: s.id,
          type: s.type,
          ratio: data.ratio,
          volumeRatio: data.volumeRatio,
          loadRatio: data.loadRatio,
          basis: data.basis,
        });
      }
    }

    res.json({ days, from: cutoffStr, to: new Date().toISOString().slice(0, 10), trends });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch station trends' });
  }
});

// GET single session
router.get('/:id', async (req, res) => {
  try {
    const doc = await collections.sessions().doc(req.params.id).get();
    const session = docToObj(doc);
    if (!session) return res.status(404).json({ error: 'Not found' });
    res.json(session);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// POST run exercise extraction for a session's current notes and return it,
// without touching station scores. Used by the frontend's review step so the
// athlete can see and correct what was parsed from freeform notes before any
// score gets computed from it — extraction misreads (a missed round count, a
// misclassified movement) have repeatedly turned into silently wrong scores.
// Also returns a plain-text, one-line-per-exercise rendering of the computed
// totals (e.g. "Thruster: 13 × 15 reps @ 11kg = 195 reps total") — that's what
// the athlete actually reviews/edits, not a table of separate fields.
router.post('/:id/extract', async (req, res) => {
  try {
    const doc = await collections.sessions().doc(req.params.id).get();
    const session = docToObj(doc);
    if (!session) return res.status(404).json({ error: 'Not found' });
    if (!session.notes?.trim()) return res.json({ extractedExercises: null, summaryText: '' });

    const rawExtracted = await extractExercisesFromNotes({ type: session.type, notes: session.notes });
    const { exercises, library } = await resolveExercisesAgainstLibrary(rawExtracted?.exercises);
    const extracted = rawExtracted ? { ...rawExtracted, exercises } : null;
    await collections.sessions().doc(req.params.id).update({
      extractedExercises: extracted,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ extractedExercises: extracted, summaryText: renderExtractionSummary(extracted, library) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to extract exercises' });
  }
});

// POST re-parse the athlete's (possibly hand-edited) review text back into
// structured exercises and persist it. Deterministic regex parsing, not
// another AI guess — the confirmed text is exactly what scoring will see.
// Any line naming an exercise not yet in the library (including one the
// athlete typed in by hand) gets resolved the same way as a fresh AI
// extraction: matched if recognized, or added as a new pending entry.
router.post('/:id/confirm-extraction', async (req, res) => {
  try {
    const { text } = req.body;
    const raw = parseExtractionSummary(text);
    const { exercises, library } = await resolveExercisesAgainstLibrary(raw.exercises);
    const extracted = { exercises };
    await collections.sessions().doc(req.params.id).update({
      extractedExercises: extracted,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ extractedExercises: extracted, summaryText: renderExtractionSummary(extracted, library) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to confirm extraction' });
  }
});

// POST run v2 extraction (Change Brief V2 Phase 3) for a session and cache it
// on `extractionV2` — separate from the v1 `extractedExercises` field above,
// which is untouched and keeps feeding v1 scoring. Every part of the session
// (warm-up, runs, abs, cool-down) is extracted, and a running session whose
// extraction found no run line gets one filled in from Strava lap/split text
// already in the notes, or from `runningDistance` as a last resort.
router.post('/:id/extract-v2', async (req, res) => {
  try {
    const doc = await collections.sessions().doc(req.params.id).get();
    const session = docToObj(doc);
    if (!session) return res.status(404).json({ error: 'Not found' });
    if (!session.notes?.trim() && !session.runningDistance) {
      return res.json({ extractionV2: null, summaryText: '' });
    }

    const raw = session.notes?.trim()
      ? await extractExercisesFromNotesV2({ type: session.type, notes: session.notes })
      : { lines: [] };
    // Filtered before resolving so `lines` and `resolvedLines` stay
    // index-aligned — resolveExercisesAgainstLibrary silently drops any
    // entry with no name.
    const lines = ensureRunLines(raw?.lines, session).filter(l => l.exercise);
    const { exercises: resolvedLines } = await resolveExercisesAgainstLibrary(
      lines.map(l => ({ ...l, name: l.exercise }))
    );
    // resolveExercisesAgainstLibrary works off `name` (v1 field name) but
    // stamps `libraryKey` back on — carry that onto the v2 line shape
    // without losing any v1 field it might also read.
    const finalLines = lines.map((l, i) => ({ ...l, libraryKey: resolvedLines[i]?.libraryKey }));
    const library = await listLibrary();

    const extractionV2 = { promptVersion: 1, lines: finalLines, extractedAt: new Date().toISOString() };
    await collections.sessions().doc(req.params.id).update({
      extractionV2,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ extractionV2, summaryText: renderExtractionSummaryV2(extractionV2, library) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to run v2 extraction' });
  }
});

// POST re-parse a hand-edited v2 review text back into extractionV2 lines.
// Deterministic regex parsing (parseExtractionSummaryV2), not another AI call.
router.post('/:id/confirm-extraction-v2', async (req, res) => {
  try {
    const { text } = req.body;
    const raw = parseExtractionSummaryV2(text);
    const lines = raw.lines.filter(l => l.exercise);
    const { exercises: resolvedLines } = await resolveExercisesAgainstLibrary(
      lines.map(l => ({ ...l, name: l.exercise }))
    );
    const finalLines = lines.map((l, i) => ({ ...l, libraryKey: resolvedLines[i]?.libraryKey }));
    const library = await listLibrary();

    const extractionV2 = { promptVersion: 1, lines: finalLines, extractedAt: new Date().toISOString() };
    await collections.sessions().doc(req.params.id).update({
      extractionV2,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ extractionV2, summaryText: renderExtractionSummaryV2(extractionV2, library) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to confirm v2 extraction' });
  }
});

// POST create session
router.post('/', async (req, res) => {
  try {
    const {
      date, type, status, isClass, weightVest, location, equipment,
      exercises, runningDistance, intervals, weights, duration,
      rpe, volume, notes,
    } = req.body;

    if (!date || !type) {
      return res.status(400).json({ error: 'date and type are required' });
    }

    const rpeNum = rpe ? Number(rpe) : null;
    const durNum = duration ? Number(duration) : null;
    const sessionLoad = rpeNum && durNum ? Math.round(rpeNum * durNum) : null;

    const now = admin.firestore.FieldValue.serverTimestamp();
    const ref = await collections.sessions().add({
      date,
      type,
      status: status || 'completed',
      isClass: isClass || false,
      weightVest: weightVest || false,
      location: location || null,
      equipment: equipment || null,
      exercises: exercises || [],
      runningDistance: runningDistance || null,
      intervals: intervals || [],
      weights: weights || null,
      duration: durNum,
      rpe: rpeNum,
      volume: volume || null,
      sessionLoad,
      notes: notes || '',
      coachingThread: null,
      stationScores: null,
      createdAt: now,
      updatedAt: now,
    });
    const created = docToObj(await ref.get());
    res.status(201).json(created);

    // Background: rebuild weekly digest + extract exercise data from notes
    runBackgroundJobs(created, { notesChanged: true }).catch(err => console.error('Background jobs failed (create):', err));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// PUT update session
router.put('/:id', async (req, res) => {
  try {
    const before = docToObj(await collections.sessions().doc(req.params.id).get());
    const updates = { ...req.body, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    delete updates.id;
    delete updates.createdAt;
    // Recalculate sessionLoad whenever rpe or duration is present in the update
    const rpeNum = updates.rpe ? Number(updates.rpe) : null;
    const durNum = updates.duration ? Number(updates.duration) : null;
    updates.sessionLoad = rpeNum && durNum ? Math.round(rpeNum * durNum) : null;
    // If notes changed, clear the now-stale extraction so it's recomputed in the background
    const notesChanged = 'notes' in req.body && req.body.notes !== before?.notes;
    if (notesChanged) updates.extractedExercises = null;
    await collections.sessions().doc(req.params.id).update(updates);
    const updated = docToObj(await collections.sessions().doc(req.params.id).get());
    res.json(updated);

    // Background: rebuild weekly digest, re-extract exercises and refresh station scores if notes changed
    runBackgroundJobs(updated, { notesChanged, isEdit: true }).catch(err => console.error('Background jobs failed (update):', err));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// DELETE session
router.delete('/:id', async (req, res) => {
  try {
    const doc = await collections.sessions().doc(req.params.id).get();
    if (doc.exists) {
      const data = doc.data();
      // If this was a Strava-synced session, add its activity ID to the blocklist
      // so it never gets re-imported on future syncs
      if (data.stravaActivityId) {
        await collections.profile().doc('main').update({
          stravaBlocklist: admin.firestore.FieldValue.arrayUnion(data.stravaActivityId),
        });
      }
    }
    await collections.sessions().doc(req.params.id).delete();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

export default router;
