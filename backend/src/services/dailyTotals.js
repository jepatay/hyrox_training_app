import admin from 'firebase-admin';
import { collections } from './firebase.js';
import { CATEGORY_KEYS } from './scoring.js';

// Pure: sums a day's already-scored sessions into one totals doc. Split out
// from the Firestore I/O below so it's directly unit-testable.
export function computeDailyTotal(date, sessions) {
  const scored = (sessions || []).filter(s => s.v2?.re);
  const re = Object.fromEntries(CATEGORY_KEYS.map(k => [k, 0]));
  let coreReps = 0;
  const sessionIds = [];

  for (const s of scored) {
    sessionIds.push(s.id);
    for (const k of CATEGORY_KEYS) re[k] += s.v2.re[k] || 0;
    for (const line of s.v2.lines || []) {
      // Raw core volume, distinct from core RE — every rep counts at face
      // value here even when its credit weight to `core` is partial (e.g. a
      // push-up at 0.3), because this is "how much core work", not a score.
      if (line.credits?.core) coreReps += line.qty || 0;
    }
  }

  return { date, re, coreReps, sessionIds };
}

// Always recomputed from that day's sessions, never incremented — so a
// changed weight, a rescored session, or a deleted one is reflected exactly,
// with no drift from a missed decrement anywhere. Home and Objectives read
// this collection only, never summing raw sessions themselves, which is
// what let the old aggregation break past 10-12 sessions.
export async function recomputeDailyTotal(date) {
  if (!date) return null;
  const snap = await collections.sessions().where('date', '==', date).get();
  const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const totals = computeDailyTotal(date, sessions);
  const doc = { ...totals, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  await collections.dailyTotals().doc(date).set(doc);
  return doc;
}

export async function recomputeDailyTotalsForDates(dates) {
  const unique = [...new Set((dates || []).filter(Boolean))];
  return Promise.all(unique.map(recomputeDailyTotal));
}

// Rebuilds every date from scratch (section 8 step 6) — used by the
// reprocess flow after a scoring pass, or whenever Station References
// change in a way that should ripple through every session's dailyTotal.
export async function recomputeAllDailyTotals() {
  const snap = await collections.sessions().get();
  const dates = new Set();
  snap.docs.forEach(d => { const date = d.data().date; if (date) dates.add(date); });
  const results = await recomputeDailyTotalsForDates([...dates]);
  return { datesRebuilt: results.length };
}
