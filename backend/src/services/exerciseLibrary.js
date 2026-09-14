import admin from 'firebase-admin';
import { collections } from './firebase.js';
import { STATION_KEYS, suggestExerciseStationCredits } from './claude.js';

// The single source of truth for "what does this exercise count toward, and
// how much" — replaces the old hardcoded EXTRACTION_NAME_TO_STATION map.
// Builtins cover the 9 literal HYROX movements (full credit) plus a couple of
// very common gym/conditioning substitutes seen constantly in logged sessions.
// Anything else the AI extracts that doesn't match one of these (by key,
// label, or alias) gets a new 'pending' entry created automatically, with an
// AI-suggested credit mapping — visible and editable on the Exercise Library
// page, but excluded from scoring until the athlete approves it.
const BUILTIN_EXERCISES = [
  { key: 'sledPush', label: 'Sled Push', aliases: ['sled push'], unit: 'm', credits: { sled_push: 1 } },
  { key: 'sledPull', label: 'Sled Pull', aliases: ['sled pull'], unit: 'm', credits: { sled_pull: 1 } },
  { key: 'farmersCarry', label: 'Farmers Carry', aliases: ['farmers carry', 'farmer carry', 'farmers walk'], unit: 'm', credits: { farmers_carry: 1 } },
  { key: 'wallBalls', label: 'Wall Balls', aliases: ['wall ball', 'wallballs', 'wall balls'], unit: 'reps', credits: { wall_balls: 1 } },
  { key: 'skiErg', label: 'Ski Erg', aliases: ['skierg', 'ski erg'], unit: 'm', credits: { skierg: 1 } },
  { key: 'rowErg', label: 'Row Erg', aliases: ['rowing', 'row erg', 'rower'], unit: 'm', credits: { row_erg: 1 } },
  { key: 'burpeeBroadJump', label: 'Burpee Broad Jump', aliases: ['burpee broad jump', 'burpee broad jumps', 'bbj'], unit: 'm', credits: { burpee_broad_jump: 1 } },
  { key: 'walkingLunges', label: 'Walking Lunges', aliases: ['walking lunge', 'sandbag lunges', 'lunges'], unit: 'm', credits: { sandbag_lunges: 1 } },
  { key: 'run', label: 'Run', aliases: ['running'], unit: 'm', credits: { running: 1 } },
  { key: 'thruster', label: 'Thruster', aliases: ['thrusters'], unit: 'reps', credits: { wall_balls: 1 } },
  { key: 'squat', label: 'Squat', aliases: ['squats', 'back squat', 'front squat'], unit: 'reps', credits: { wall_balls: 0.35 } },
  { key: 'deadlift', label: 'Deadlift', aliases: ['deadlifts'], unit: 'reps', credits: {} },
  { key: 'benchPress', label: 'Bench Press', aliases: ['bench press', 'bench'], unit: 'reps', credits: {} },
  { key: 'pullUp', label: 'Pull Up', aliases: ['pull ups', 'pullups', 'pull-ups'], unit: 'reps', credits: {} },
  {
    key: 'kettlebellSwing', label: 'Kettlebell Swing', aliases: ['kb swing', 'swings', 'side swings', 'kettlebell swings'],
    unit: 'reps', credits: { burpee_broad_jump: 0.4, sandbag_lunges: 0.3 },
    reasoning: 'Explosive hip-hinge drive transfers partially to the broad jump\'s hip extension and general posterior-chain conditioning for lunges.',
  },
  {
    key: 'assaultBike', label: 'Assault Bike', aliases: ['assault bike', 'air bike', 'airbike', 'fan bike', 'echo bike', 'bike erg'],
    unit: 'cal', metersPerCal: 12, credits: { running: 0.4, skierg: 0.3, row_erg: 0.3 },
    reasoning: 'Full-body cardio machine — real aerobic output, shared across running/ski/row rather than any one station.',
  },
  { key: 'other', label: 'Other', aliases: [], unit: 'reps', credits: {} },
];

async function ensureBuiltinsSeeded() {
  const snap = await collections.exerciseLibrary().limit(1).get();
  if (!snap.empty) return;
  const now = admin.firestore.FieldValue.serverTimestamp();
  await Promise.all(BUILTIN_EXERCISES.map(e => collections.exerciseLibrary().doc(e.key).set({
    label: e.label,
    aliases: e.aliases,
    unit: e.unit,
    metersPerCal: e.metersPerCal ?? null,
    credits: e.credits,
    reasoning: e.reasoning || null,
    status: 'approved',
    source: 'builtin',
    createdAt: now,
    updatedAt: now,
  })));
}

export async function listLibrary() {
  await ensureBuiltinsSeeded();
  const snap = await collections.exerciseLibrary().orderBy('label').get();
  return snap.docs.map(d => ({ key: d.id, ...d.data() }));
}

export function matchExercise(name, library) {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  if (!n) return null;
  return library.find(e => e.key.toLowerCase() === n)
    || library.find(e => e.label?.toLowerCase() === n)
    || library.find(e => (e.aliases || []).some(a => a.toLowerCase() === n))
    || null;
}

export function slugify(name) {
  const words = (name || '').trim().replace(/[^a-zA-Z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  if (!words.length) return 'exercise';
  return words.map((w, i) => i === 0
    ? w.charAt(0).toLowerCase() + w.slice(1)
    : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  ).join('');
}

function uniqueSlug(name, library) {
  const base = slugify(name);
  const existingKeys = new Set(library.map(e => e.key));
  let key = base, i = 2;
  while (existingKeys.has(key)) key = `${base}${i++}`;
  return key;
}

function titleCase(name) {
  return name.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Clamps to valid station keys and a 0-1 weight — defensive against a
// malformed AI response or a hand-typed credit value.
export function sanitizeCredits(credits) {
  const out = {};
  for (const key of STATION_KEYS) {
    const v = Number(credits?.[key]);
    if (Number.isFinite(v) && v > 0) out[key] = Math.min(1, v);
  }
  return out;
}

async function createPendingEntry(name, notes, library) {
  const key = uniqueSlug(name, library);
  const suggestion = await suggestExerciseStationCredits({ name, notes }).catch(() => null);
  const unit = suggestion?.unit === 'cal' || suggestion?.unit === 'm' ? suggestion.unit : 'reps';
  const entry = {
    label: titleCase(name),
    aliases: [],
    unit,
    metersPerCal: unit === 'cal' ? (Number(suggestion?.metersPerCal) || 10) : null,
    credits: sanitizeCredits(suggestion?.credits),
    reasoning: suggestion?.reasoning || null,
    status: 'pending',
    source: 'ai_suggested',
  };
  await collections.exerciseLibrary().doc(key).set({
    ...entry,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { key, ...entry };
}

// Resolves each raw extracted exercise's freeform name against the library —
// matching an existing entry (by key, label or alias) or creating a new
// pending one via AI suggestion — and stamps the resolved libraryKey onto it.
// This is the one place scoring, rendering and the review UI all trace back
// to, so what an exercise counts toward is never a silent per-call guess.
export async function resolveExercisesAgainstLibrary(rawExercises) {
  const library = await listLibrary();
  const resolved = [];
  for (const e of rawExercises || []) {
    if (!e?.name) continue;
    let entry = matchExercise(e.name, library);
    if (!entry) {
      entry = await createPendingEntry(e.name, e.notes, library);
      library.push(entry);
    }
    resolved.push({ ...e, libraryKey: entry.key });
  }
  return { exercises: resolved, library };
}
