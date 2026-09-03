import { Router } from 'express';
import { collections, docToObj } from '../services/firebase.js';
import { rebuildWeekDigest } from '../services/trainingLoad.js';
import { extractExercisesFromNotes, generateStationScores } from '../services/claude.js';
import admin from 'firebase-admin';

const router = Router();

async function runBackgroundJobs(session, { notesChanged = false, isEdit = false } = {}) {
  if (!session?.date) return;
  await rebuildWeekDigest(session.date);

  // Extract structured exercise data from notes and store back on the session.
  // Re-run whenever notes changed so stale extraction never lingers after an edit.
  const needsExtraction = session.notes?.trim() && session.status === 'completed' && (notesChanged || !session.extractedExercises);
  if (needsExtraction) {
    const extracted = await extractExercisesFromNotes({ type: session.type, notes: session.notes });
    if (extracted && session.id) {
      await collections.sessions().doc(session.id).update({ extractedExercises: extracted });
      session = { ...session, extractedExercises: extracted };
    }
  }

  // Refresh station impact scores after an edit changes the underlying training data.
  // (On creation, the frontend already triggers this explicitly — skip to avoid a duplicate call.)
  if (isEdit && notesChanged && session.status === 'completed') {
    const [knowledgeDoc, profileDoc] = await Promise.all([
      collections.knowledge().doc('exercise_transferability').get(),
      collections.profile().doc('main').get(),
    ]);
    const knowledge = knowledgeDoc.exists ? knowledgeDoc.data().content : null;
    const stationModel = profileDoc.exists ? profileDoc.data().stationModel : null;
    const result = await generateStationScores({ session, knowledge, stationModel });
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
