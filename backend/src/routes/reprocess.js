import { Router } from 'express';
import admin from 'firebase-admin';
import { collections, docToObj } from '../services/firebase.js';
import { listLibrary, matchExercise } from '../services/exerciseLibrary.js';
import { getStationReferences } from '../services/stationReferences.js';
import { extractExercisesFromNotesV2, ensureRunLines } from '../services/claude.js';
import { resolveExercisesAgainstLibrary } from '../services/exerciseLibrary.js';
import { scoreSession, linesFromExtractionV2 } from '../services/scoring.js';
import { recomputeDailyTotal, recomputeAllDailyTotals } from '../services/dailyTotals.js';

const router = Router();

// Section 8 step 3: which objective's targetSplits (if any) is "active" for
// the pace factor's reference lookup — same "nearest upcoming" convention
// reports.js already uses elsewhere in this app.
async function getActiveObjective() {
  const today = new Date().toISOString().slice(0, 10);
  const snap = await collections.objectives().orderBy('date', 'asc').get();
  const objectives = snap.docs.map(docToObj).filter(Boolean);
  return objectives.find(o => o.date >= today) || null;
}

// Newest first — the extraction pass is batched (20 at a time), and Home
// only ever shows the most recent sessions, so without this ordering a
// batch could spend clicks working through old history while the sessions
// actually visible on Home stayed untouched.
async function allSessions() {
  const snap = await collections.sessions().orderBy('date', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// GET dry run (section 8 step 2) — counts only, no writes. Always safe to
// call, including repeatedly, to check progress of the extraction/scoring
// passes below.
router.get('/dry-run', async (_req, res) => {
  try {
    const sessions = await allSessions();
    const library = await listLibrary();

    const names = new Set();
    for (const s of sessions) {
      for (const e of s.extractedExercises?.exercises || []) {
        if (e?.name?.trim()) names.add(e.name.trim());
      }
    }
    const namesNotInLibrary = [...names].filter(n => !matchExercise(n, library));

    res.json({
      sessionsTotal: sessions.length,
      withNotes: sessions.filter(s => s.notes?.trim()).length,
      importedFromStrava: sessions.filter(s => s.stravaActivityId).length,
      needingExtractionV2: sessions.filter(s => (s.notes?.trim() || s.runningDistance) && !s.extractionV2).length,
      needingScoring: sessions.filter(s => s.extractionV2 && !s.v2).length,
      distinctExerciseNames: names.size,
      namesNotInLibrary: namesNotInLibrary.length,
      namesNotInLibraryList: namesNotInLibrary,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to compute dry run' });
  }
});

// POST extraction pass (section 8 step 4) — runs v2 extraction for every
// session that doesn't have it yet (or every session, with force: true),
// caching each result on `extractionV2`. Resumable: call again and only the
// sessions still missing it (or still erroring) get retried, since already-
// processed ones are skipped unless forced. Batched via `limit` so a single
// call never has to process the whole history at once.
router.post('/extract', async (req, res) => {
  try {
    const { limit = 20, force = false } = req.body || {};
    const sessions = await allSessions();
    const pending = sessions
      .filter(s => (s.notes?.trim() || s.runningDistance) && (force || !s.extractionV2))
      .slice(0, limit);

    const results = { processed: 0, errors: [] };
    for (const session of pending) {
      try {
        const raw = session.notes?.trim()
          ? await extractExercisesFromNotesV2({ type: session.type, notes: session.notes })
          : { lines: [] };
        const lines = ensureRunLines(raw?.lines, session).filter(l => l.exercise);
        const { exercises: resolvedLines } = await resolveExercisesAgainstLibrary(
          lines.map(l => ({ ...l, name: l.exercise }))
        );
        const finalLines = lines.map((l, i) => ({ ...l, libraryKey: resolvedLines[i]?.libraryKey }));
        const extractionV2 = { promptVersion: 1, lines: finalLines, extractedAt: new Date().toISOString() };
        await collections.sessions().doc(session.id).update({
          extractionV2,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        results.processed++;
      } catch (err) {
        console.error(`Reprocess extract failed for session ${session.id}:`, err);
        results.errors.push({ sessionId: session.id, error: err.message });
      }
    }
    results.remaining = sessions.filter(s => (s.notes?.trim() || s.runningDistance) && (force || !s.extractionV2)).length - results.processed;
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to run extraction pass' });
  }
});

// Scores one already-fetched session doc, writing `v2` (or explicit `null`
// per section 8 step 8 for a session with nothing to score) and recomputing
// that day's dailyTotal. Shared by the bulk scoring pass and the
// per-session Rescore action.
async function scoreOneSession(session, library, references, objective) {
  const hasExtraction = session.extractionV2?.lines?.length > 0;
  if (!hasExtraction) {
    await collections.sessions().doc(session.id).update({ v2: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    await recomputeDailyTotal(session.date);
    return null;
  }
  const scoringLines = linesFromExtractionV2(session.extractionV2.lines, library);
  const scored = scoreSession(scoringLines, library, references, objective);
  const v2 = {
    version: 1,
    lines: scored.lines,
    re: scored.re,
    sessionLoadRE: scored.sessionLoadRE,
    computedAt: new Date().toISOString(),
    libraryVersion: library.length,
  };
  await collections.sessions().doc(session.id).update({ v2, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  await recomputeDailyTotal(session.date);
  return v2;
}

// POST scoring pass (section 8 step 5) — pure and instant per session (no
// LLM call), so this re-runs in full every time a weight, a Station
// Reference or a limit changes; only extraction is ever cached long-term.
router.post('/score', async (req, res) => {
  try {
    const { force = false } = req.body || {};
    const [sessions, library, references, objective] = await Promise.all([
      allSessions(), listLibrary(), getStationReferences(), getActiveObjective(),
    ]);
    // Score every session that has extractionV2 and no v2 yet, or (when
    // force) every session — including those with no extraction, which get
    // explicitly set to v2: null (section 8 step 8) rather than left
    // silently unprocessed.
    const toScore = force ? sessions : sessions.filter(s => s.extractionV2 && !s.v2);

    let scored = 0;
    const errors = [];
    for (const session of toScore) {
      try {
        await scoreOneSession(session, library, references, objective);
        scored++;
      } catch (err) {
        console.error(`Reprocess score failed for session ${session.id}:`, err);
        errors.push({ sessionId: session.id, error: err.message });
      }
    }
    res.json({ scored, errors });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to run scoring pass' });
  }
});

// POST rebuild dailyTotals for every date from scratch (section 8 step 6).
router.post('/rebuild-daily-totals', async (_req, res) => {
  try {
    res.json(await recomputeAllDailyTotals());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to rebuild daily totals' });
  }
});

// GET report (section 8 step 7) — sessions needing a look: zero extracted
// lines despite having notes, an unresolved/pending exercise, or scored but
// flagged needs_library.
router.get('/report', async (_req, res) => {
  try {
    const sessions = await allSessions();
    const needsReview = [];
    for (const s of sessions) {
      const reasons = [];
      if (s.notes?.trim() && s.extractionV2 && !s.extractionV2.lines?.length) {
        reasons.push('extraction found nothing despite notes');
      }
      const flaggedLines = (s.v2?.lines || []).filter(l => l.flags?.includes('needs_library'));
      if (flaggedLines.length) {
        reasons.push(`${flaggedLines.length} line(s) need a library entry`);
      }
      if (reasons.length) {
        needsReview.push({ id: s.id, date: s.date, type: s.type, reasons });
      }
    }
    res.json({ needsReview });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to build report' });
  }
});

// POST rescore a single session from its cached extractionV2 (no re-
// extraction) — the "fixing one and clicking Rescore" flow from section 8
// step 7's report.
router.post('/sessions/:id/rescore', async (req, res) => {
  try {
    const doc = await collections.sessions().doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    const session = { id: doc.id, ...doc.data() };
    const [library, references, objective] = await Promise.all([
      listLibrary(), getStationReferences(), getActiveObjective(),
    ]);
    const v2 = await scoreOneSession(session, library, references, objective);
    res.json({ v2 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to rescore session' });
  }
});

export default router;
