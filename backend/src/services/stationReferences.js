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
  // referenceVestKg: the vest weight scoring.js treats as the "1x extra"
  // unit for its vest-load multiplier (run/burpee_broad_jump/sandbag_lunges)
  // — set to the athlete's actual 9kg vest.
  limits: { loadCap: 3.0, paceCap: 2.0, floor: 0.25, warmupWeight: 1.0, referenceVestKg: 9 },
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

const CATEGORY_KEYS = Object.keys(DEFAULTS.categories);

function sanitizeCategoryPatch(patch) {
  if (!patch || typeof patch !== 'object') return {};
  const out = {};
  if (patch.raceQty !== undefined) { const v = Number(patch.raceQty); if (Number.isFinite(v) && v > 0) out.raceQty = v; }
  if (patch.referenceLoadKg !== undefined) { const v = Number(patch.referenceLoadKg); out.referenceLoadKg = Number.isFinite(v) && v > 0 ? v : null; }
  if (patch.targetPaceSecPerKm !== undefined) { const v = Number(patch.targetPaceSecPerKm); out.targetPaceSecPerKm = Number.isFinite(v) && v > 0 ? v : null; }
  return out;
}

function sanitizeLimits(limits) {
  if (!limits || typeof limits !== 'object') return {};
  const out = {};
  for (const key of ['loadCap', 'paceCap', 'floor', 'warmupWeight', 'referenceVestKg']) {
    if (limits[key] === undefined) continue;
    const v = Number(limits[key]);
    if (Number.isFinite(v) && v > 0) out[key] = v;
  }
  return out;
}

// Merge-updates categories/limits — only fields explicitly present in the
// patch are touched, so editing one category's reference load never
// clobbers another's, and the athlete's own edits never get reset back to
// the hardcoded defaults on a later read.
export async function updateStationReferences({ categories, limits } = {}) {
  const current = await getStationReferences();
  const nextCategories = { ...current.categories };
  for (const key of CATEGORY_KEYS) {
    if (categories?.[key]) nextCategories[key] = { ...nextCategories[key], ...sanitizeCategoryPatch(categories[key]) };
  }
  const nextLimits = { ...current.limits, ...sanitizeLimits(limits) };

  await collections.stationReferences().doc(DOC_ID).set({
    categories: nextCategories,
    limits: nextLimits,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { categories: nextCategories, limits: nextLimits };
}
