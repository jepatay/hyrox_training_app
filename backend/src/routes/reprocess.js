import { Router } from 'express';
import admin from 'firebase-admin';
import { collections, docToObj } from '../services/firebase.js';
import { listLibrary, matchExercise } from '../services/exerciseLibrary.js';
import { getStationReferences } from '../services/stationReferences.js';
import { recomputeAllDailyTotals } from '../services/dailyTotals.js';
import { getActiveObjective, extractV2ForSession, scoreOneSession, extractAndScoreSession } from '../services/v2Pipeline.js';

const router = Router();

// Newest first — the extraction pass is batched (20 at a time), and Home
// only ever shows the most recent sessions, so without this ordering a
// batch could spend clicks working through old history while the sessions
// actually visible on Home stayed untouched.
async function allSessions() {
  const snap = await collections.sessions().orderBy('date', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// No extraction yet, or one that came back empty for a session that has
// notes — almost always a failed/truncated AI reply rather than a genuinely
// empty session, so it's retried instead of being skipped forever.
function needsExtraction(s) {
  return !s.extractionV2 || (s.notes?.trim() && !s.extractionV2.lines?.length);
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
      needingExtractionV2: sessions.filter(s => (s.notes?.trim() || s.runningDistance) && needsExtraction(s)).length,
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
    const [sessions, library] = await Promise.all([allSessions(), listLibrary()]);
    const pending = sessions
      .filter(s => (s.notes?.trim() || s.runningDistance) && (force || needsExtraction(s)))
      .slice(0, limit);

    const results = { processed: 0, errors: [] };
    for (const session of pending) {
      try {
        // Same `library` array reused (and mutated in place with any new
        // pending entries) across every session in this batch — one fetch
        // for up to `limit` sessions instead of one per session.
        await extractV2ForSession(session, library);
        results.processed++;
      } catch (err) {
        console.error(`Reprocess extract failed for session ${session.id}:`, err);
        results.errors.push({ sessionId: session.id, error: err.message });
      }
    }
    results.remaining = sessions.filter(s => (s.notes?.trim() || s.runningDistance) && (force || needsExtraction(s))).length - results.processed;
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

// POST re-extract from the current notes AND score one session — the fix
// for a session that was saved but never scored (Home's breakdown lists
// these as "not counted").
router.post('/sessions/:id/extract-and-score', async (req, res) => {
  try {
    const v2 = await extractAndScoreSession(req.params.id);
    res.json({ v2 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to score session' });
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
