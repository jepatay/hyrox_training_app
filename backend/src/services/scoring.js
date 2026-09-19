// Pure v2 scoring engine — Change Brief V2 sections 2, 5. No LLM calls, no
// Firestore reads. Every input (lines, library, stationReferences, objective)
// is passed in; every output is computed. This makes it trivially testable
// and re-runnable: re-scoring a session after editing a weight or a Station
// Reference is just calling this again, never re-extracting.

export const CATEGORY_KEYS = [
  'run', 'skierg', 'sled_push', 'sled_pull', 'burpee_broad_jump',
  'row', 'farmers_carry', 'sandbag_lunges', 'wall_balls', 'core',
];

const LOAD_CATEGORIES = new Set(['wall_balls', 'sled_push', 'sled_pull', 'farmers_carry', 'sandbag_lunges']);
const PACE_CATEGORIES = new Set(['run', 'skierg', 'row']);

// The exerciseLibrary schema (Phase 1) still stores credits under the pre-v2
// station names for these two categories — `running` and `row_erg` — because
// renaming them would have broken the v1 scoring engine that reads the same
// `credits` field (see claude.js's STATION_KEYS/computeStationEquivalence).
// Every other category name is already identical between v1 and v2.
const CATEGORY_TO_CREDIT_KEY = { run: 'running', row: 'row_erg' };
function creditKeyFor(category) {
  return CATEGORY_TO_CREDIT_KEY[category] || category;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

const DEFAULT_LIMITS = { loadCap: 3.0, paceCap: 2.0, floor: 0.25, warmupWeight: 1.0 };

// qty = "total quantity of the line, in the exercise's unit (reps, m, or cal
// converted to m via metersPerCal)" — section 2.3. A `km` unit line is
// expected to arrive with `distanceM` already converted (extraction/callers
// never hand this function raw km), same as `m`.
function qtyForLine(line, exercise) {
  const unit = exercise.unit || 'reps';
  if (unit === 'cal') {
    const cal = Number(line.calories ?? line.qty) || 0;
    return cal * (exercise.metersPerCal || 10);
  }
  if (unit === 'm' || unit === 'km') {
    return Number(line.distanceM ?? line.qty) || 0;
  }
  return Number(line.qty) || 0; // reps
}

// Pace in seconds per 1000m. `line.pace` is never trusted from a caller that
// computed it itself (section 2.4: "the LLM extracts numbers, it never
// computes pace") — only a precomputed `paceSecPerKm` or raw distance+time.
function paceSecPerKmFor(line) {
  if (line.paceSecPerKm != null) return line.paceSecPerKm;
  if (line.distanceM && line.timeSec) return (line.timeSec * 1000) / line.distanceM;
  return null;
}

// Reference lookup order (section 2.4): active objective's targetSplits →
// Station References default → none (neutral).
function targetPaceFor(category, references, objective) {
  const fromObjective = objective?.targetSplits?.[category];
  if (fromObjective != null) return fromObjective;
  const fromRef = references?.categories?.[category]?.targetPaceSecPerKm;
  return fromRef != null ? fromRef : null;
}

// Scores every line of a session (each an exercise key the caller has
// already matched against the library, e.g. via resolveExercisesAgainstLibrary)
// against every category it credits. Missing library entry, missing
// approval, missing load/pace/reference are never guessed — they either
// contribute 0 (`needs_library`) or count at a neutral 1.0x factor, flagged
// `estimated`, per section 2.4.
export function scoreSession(lines, library, references, objective) {
  const libraryByKey = new Map((library || []).map(e => [e.key, e]));
  const limits = { ...DEFAULT_LIMITS, ...(references?.limits || {}) };
  const re = Object.fromEntries(CATEGORY_KEYS.map(k => [k, 0]));
  const scoredLines = [];

  for (const rawLine of lines || []) {
    const exercise = libraryByKey.get(rawLine.exerciseKey);
    if (!exercise || exercise.status !== 'approved') {
      scoredLines.push({ ...rawLine, credits: {}, flags: ['needs_library'] });
      continue;
    }

    const exerciseCredits = exercise.credits || {};
    // Only warm-up lines get the (separately editable) warmupWeight — every
    // other part (main/finisher/core/cooldown) always counts at full weight.
    const partWeight = rawLine.part === 'warmup' ? limits.warmupWeight : 1.0;
    const qty = qtyForLine(rawLine, exercise) * partWeight;

    const credits = {};
    const flags = [];

    for (const category of CATEGORY_KEYS) {
      const weight = Number(exerciseCredits[creditKeyFor(category)]) || 0;
      if (!weight) continue;

      const raceQty = references?.categories?.[category]?.raceQty;
      if (!raceQty) continue; // no station reference for this category yet

      let factor = 1.0;
      let estimated = false;
      let basis;

      if (LOAD_CATEGORIES.has(category)) {
        const refLoad = exercise.referenceLoadKg;
        if (refLoad && rawLine.weightKg) {
          factor = clamp(rawLine.weightKg / refLoad, limits.floor, limits.loadCap);
          basis = `${rawLine.weightKg}kg ÷ ${refLoad}kg reference = ${factor.toFixed(2)}x`;
        } else {
          estimated = true;
          basis = 'no load logged, × 1.0';
        }
      } else if (PACE_CATEGORIES.has(category)) {
        const linePace = paceSecPerKmFor(rawLine);
        const targetPace = targetPaceFor(category, references, objective);
        if (linePace && targetPace) {
          factor = clamp(targetPace / linePace, limits.floor, limits.paceCap);
          basis = `target ${targetPace}s/km ÷ logged ${Math.round(linePace)}s/km = ${factor.toFixed(2)}x`;
        } else {
          estimated = true;
          basis = 'no pace logged, × 1.0';
        }
      } else {
        basis = 'volume only, no factor';
      }

      const creditRE = (qty * weight * factor) / raceQty;
      credits[category] = { re: creditRE, factor, estimated, basis };
      re[category] += creditRE;
      if (estimated) flags.push(`${category}_estimated`);
    }

    scoredLines.push({ ...rawLine, qty, credits, flags });
  }

  const sessionLoadRE = CATEGORY_KEYS.reduce((sum, k) => sum + re[k], 0);
  return { lines: scoredLines, re, sessionLoadRE };
}

// Bridges an extractionV2 line (raw AI/parser output — `reps`/`distanceM`/
// `calories` given PER interval, plus `intervals`) into the flat, already-
// totaled shape scoreSession expects. This is the one place "sum repeated
// blocks" happens for v2, same idea as v1's sets×reps multiplication.
// Requires each line to already carry a `libraryKey` (resolved via
// resolveExercisesAgainstLibrary) — a line with none scores as `needs_library`.
export function linesFromExtractionV2(extractionLines, library) {
  const byKey = new Map((library || []).map(e => [e.key, e]));
  return (extractionLines || []).map(l => {
    const exercise = l.libraryKey ? byKey.get(l.libraryKey) : null;
    const unit = exercise?.unit || 'reps';
    const n = l.intervals || 1;
    const distanceM = l.distanceM != null ? l.distanceM * n : undefined;
    const calories = l.calories != null ? l.calories * n : undefined;
    const reps = l.reps != null ? l.reps * n : undefined;
    const timeSec = l.timeSec != null ? l.timeSec * n : undefined;
    const qty = unit === 'cal' ? calories : (unit === 'm' || unit === 'km') ? distanceM : reps;

    return {
      exerciseKey: l.libraryKey,
      qty, weightKg: l.weightKg ?? undefined, distanceM, calories, timeSec,
      part: l.part,
    };
  });
}
