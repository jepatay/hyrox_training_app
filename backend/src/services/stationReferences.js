import admin from 'firebase-admin';
import { collections } from './firebase.js';

const DOC_ID = 'main';

// Defaults per HYROX_APP_CHANGES_V2.md section 3. The weighted-station values
// (150/100/48/20/6 kg) match the Open Men race demands already hardcoded in
// claude.js's STATION_BENCHMARKS — this doc is the new single source of truth
// for them going forward, but the numbers themselves aren't new.
const DEFAULTS = {
  categories: {
    run: { raceQty: 8000, unit: 'm', targetPaceSecPerKm: null },
    skierg: { raceQty: 1000, unit: 'm', targetPaceSecPerKm: null },
    sled_push: { raceQty: 50, unit: 'm', referenceLoadKg: 150 },
    sled_pull: { raceQty: 50, unit: 'm', referenceLoadKg: 100 },
    burpee_broad_jump: { raceQty: 80, unit: 'm' },
    row: { raceQty: 1000, unit: 'm', targetPaceSecPerKm: null },
    farmers_carry: { raceQty: 200, unit: 'm', referenceLoadKg: 48 },
    sandbag_lunges: { raceQty: 100, unit: 'm', referenceLoadKg: 20 },
    wall_balls: { raceQty: 100, unit: 'reps', referenceLoadKg: 6 },
    core: { raceQty: 100, unit: 'reps' },
  },
  limits: { loadCap: 3.0, paceCap: 2.0, floor: 0.25, warmupWeight: 1.0 },
};

// Reads the single stationReferences/main doc, seeding it with the defaults
// above on first read. Saved values are merged over the defaults per-category
// and per-limit, so a partially-customized doc (e.g. only wall_balls edited)
// still returns every field the callers expect.
export async function getStationReferences() {
  const ref = collections.stationReferences().doc(DOC_ID);
  const doc = await ref.get();
  if (!doc.exists) {
    const now = admin.firestore.FieldValue.serverTimestamp();
    await ref.set({ ...DEFAULTS, createdAt: now, updatedAt: now });
    return DEFAULTS;
  }
  const saved = doc.data();
  return {
    categories: Object.fromEntries(
      Object.entries(DEFAULTS.categories).map(([key, base]) => [
        key,
        { ...base, ...(saved.categories?.[key] || {}) },
      ])
    ),
    limits: { ...DEFAULTS.limits, ...(saved.limits || {}) },
  };
}
