import admin from 'firebase-admin';
import { collections, docToObj } from './firebase.js';
import { listLibrary, resolveExercisesAgainstLibrary, findDuplicateGroups, mergedAliases, remapSessionLibraryKeys } from './exerciseLibrary.js';
import { getStationReferences } from './stationReferences.js';
import { extractExercisesFromNotesV2, ensureRunLines, normalizeV2Part } from './claude.js';
import { scoreSession, linesFromExtractionV2 } from './scoring.js';
import { recomputeDailyTotal } from './dailyTotals.js';

// One place for "notes -> extractionV2 -> v2 score -> dailyTotal", shared by
// the Log Session flow, the reprocess passes, and every other way a session
// gets created or edited (Training Log, Strava sync, draft convert). Before
// this, only the Log Session flow and a manual reprocess ever scored a
// session, so anything else stayed at 0 on Home until someone remembered to
// reprocess.

// Which objective's targetSplits (if any) is "active" for the pace factor's
// reference lookup — "nearest upcoming", same convention as reports.js.
export async function getActiveObjective() {
  const today = new Date().toISOString().slice(0, 10);
  const snap = await collections.objectives().orderBy('date', 'asc').get();
  const objectives = snap.docs.map(docToObj).filter(Boolean);
  return objectives.find(o => o.date >= today) || null;
}

// Runs v2 extraction for one session and caches it on `extractionV2`.
// Throws when the AI read fails rather than caching an empty extraction —
// an empty one would look like "nothing trained" and never be retried.
// `library` may be passed (and is mutated with new pending entries) so a
// batch shares one fetch.
export async function extractV2ForSession(session, library) {
  const raw = session.notes?.trim()
    ? await extractExercisesFromNotesV2({ type: session.type, notes: session.notes })
    : { lines: [] };
  if (!raw) throw new Error("Couldn't read the session notes (AI extraction failed)");
  // Filtered before resolving so `lines` and `resolvedLines` stay
  // index-aligned — resolveExercisesAgainstLibrary silently drops any entry
  // with no name.
  const lines = ensureRunLines(raw.lines, session)
    .filter(l => l.exercise)
    .map(l => ({ ...l, part: normalizeV2Part(l.part) }));
  const { exercises: resolvedLines } = await resolveExercisesAgainstLibrary(
    lines.map(l => ({ ...l, name: l.exercise })), library
  );
  const finalLines = lines.map((l, i) => ({ ...l, libraryKey: resolvedLines[i]?.libraryKey }));
  const extractionV2 = { promptVersion: 1, lines: finalLines, extractedAt: new Date().toISOString() };
  await collections.sessions().doc(session.id).update({
    extractionV2,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return extractionV2;
}

// Scores one already-fetched session doc from its cached extractionV2,
// writing `v2` (or explicit `null` for a session with nothing to score) and
// recomputing that day's dailyTotal.
export async function scoreOneSession(session, library, references, objective) {
  const hasExtraction = session.extractionV2?.lines?.length > 0;
  if (!hasExtraction) {
    await collections.sessions().doc(session.id).update({ v2: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    await recomputeDailyTotal(session.date);
    return null;
  }
  const scoringLines = linesFromExtractionV2(session.extractionV2.lines, library);
  const scored = scoreSession(scoringLines, library, references, objective, { weightVestKg: session.weightVestKg });
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

// Full pipeline for one session id: re-extract from the current notes, then
// score. Used after any create/edit outside the Log Session review flow.
export async function extractAndScoreSession(sessionId) {
  const session = docToObj(await collections.sessions().doc(sessionId).get());
  if (!session || session.status === 'planned') return null;
  if (!session.notes?.trim() && !session.runningDistance) return null;
  const library = await listLibrary();
  const extractionV2 = await extractV2ForSession(session, library);
  const [references, objective] = await Promise.all([getStationReferences(), getActiveObjective()]);
  return scoreOneSession({ ...session, extractionV2 }, library, references, objective);
}

// Background helper: runs the pipeline for several sessions one after
// another (each is an AI call), logging rather than throwing per session.
export async function extractAndScoreSessions(ids, label = 'auto-score') {
  for (const id of [...new Set(ids.filter(Boolean))]) {
    try {
      await extractAndScoreSession(id);
    } catch (err) {
      console.error(`${label} failed for session ${id}:`, err);
    }
  }
}

// Folds `sourceKeys` into `targetKey`: the target picks up every source
// spelling as an alias, every session pointing at a source is repointed at
// the target, the sources are deleted, and each affected session is
// rescored — so one movement has exactly one entry and one credit mapping,
// and past sessions are re-evaluated under it.
export async function mergeExercises(sourceKeys, targetKey) {
  const sources = [...new Set(sourceKeys)].filter(k => k && k !== targetKey);
  if (!sources.length) throw new Error('Nothing to merge');
  const library = await listLibrary();
  const target = library.find(e => e.key === targetKey);
  if (!target) throw new Error(`Unknown target exercise: ${targetKey}`);
  const sourceEntries = sources.map(k => library.find(e => e.key === k));
  if (sourceEntries.some(e => !e)) throw new Error('Unknown source exercise');

  const now = admin.firestore.FieldValue.serverTimestamp();
  const aliases = mergedAliases(target, sourceEntries);
  await collections.exerciseLibrary().doc(targetKey).update({ aliases, updatedAt: now });

  const snap = await collections.sessions().get();
  const affected = [];
  for (const doc of snap.docs) {
    const session = docToObj(doc);
    const patch = remapSessionLibraryKeys(session, sources, targetKey);
    if (!patch) continue;
    await doc.ref.update({ ...patch, updatedAt: now });
    affected.push({ ...session, ...patch });
  }

  await Promise.all(sources.map(k => collections.exerciseLibrary().doc(k).delete()));

  const merged = { ...target, aliases };
  const freshLibrary = library.filter(e => !sources.includes(e.key)).map(e => e.key === targetKey ? merged : e);
  const [references, objective] = await Promise.all([getStationReferences(), getActiveObjective()]);
  let rescored = 0;
  for (const s of affected) {
    if (s.status === 'planned') continue;
    try {
      await scoreOneSession(s, freshLibrary, references, objective);
      rescored++;
    } catch (err) {
      console.error(`merge rescore failed for session ${s.id}:`, err);
    }
  }
  return { targetKey, merged: sources, sessionsUpdated: affected.length, sessionsRescored: rescored };
}

// Merges every clear duplicate group in the library (see
// findDuplicateGroups) into its canonical entry.
export async function mergeAllDuplicates() {
  const groups = findDuplicateGroups(await listLibrary());
  const results = [];
  for (const g of groups) {
    results.push(await mergeExercises(g.sources.map(s => s.key), g.targetKey));
  }
  return results;
}
