import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreSession } from './scoring.js';

// Fixture library/references, independent of Firestore and the real seeded
// builtins (scoring.js is pure — these tests only need shapes that match the
// worked examples in Change Brief V2 section 2.6).
const LIBRARY = [
  { key: 'wallBalls', unit: 'reps', credits: { wall_balls: 1 }, referenceLoadKg: 6, status: 'approved' },
  { key: 'sledPushNoRef', unit: 'm', credits: { sled_push: 1 }, referenceLoadKg: null, status: 'approved' },
  { key: 'thruster', unit: 'reps', credits: { wall_balls: 0.4, sled_push: 0.2 }, referenceLoadKg: 20, status: 'approved' },
  { key: 'pushUp', unit: 'reps', credits: { core: 0.3 }, status: 'approved' },
  { key: 'situp', unit: 'reps', credits: { core: 1 }, status: 'approved' },
  { key: 'run', unit: 'm', credits: { running: 1 }, status: 'approved' },
  { key: 'rowErg', unit: 'm', credits: { row_erg: 1 }, status: 'approved' },
  { key: 'skiErg', unit: 'm', credits: { skierg: 1 }, status: 'approved' },
  { key: 'assaultBike', unit: 'cal', metersPerCal: 12, credits: { running: 0.3, skierg: 0.5, row_erg: 0.4 }, status: 'approved' },
  { key: 'notYetApproved', unit: 'reps', credits: { core: 0.5 }, status: 'pending' },
];

const REFERENCES = {
  categories: {
    run: { raceQty: 8000, unit: 'm', targetPaceSecPerKm: null },
    skierg: { raceQty: 1000, unit: 'm', targetPaceSecPerKm: 240 }, // 4:00/km
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

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

test('T1: 100 Wall Ball @ 6kg (ref 6) -> wall_balls 1.000', () => {
  const s = scoreSession([{ exerciseKey: 'wallBalls', qty: 100, weightKg: 6 }], LIBRARY, REFERENCES);
  assert.equal(round3(s.re.wall_balls), 1.0);
  assert.equal(s.lines[0].credits.wall_balls.estimated, false);
});

test('T2: 100 Wall Ball @ 9kg / 12kg / 4kg -> 1.500 / 2.000 / 0.667', () => {
  const s9 = scoreSession([{ exerciseKey: 'wallBalls', qty: 100, weightKg: 9 }], LIBRARY, REFERENCES);
  const s12 = scoreSession([{ exerciseKey: 'wallBalls', qty: 100, weightKg: 12 }], LIBRARY, REFERENCES);
  const s4 = scoreSession([{ exerciseKey: 'wallBalls', qty: 100, weightKg: 4 }], LIBRARY, REFERENCES);
  assert.equal(round3(s9.re.wall_balls), 1.5);
  assert.equal(round3(s12.re.wall_balls), 2.0);
  assert.equal(round3(s4.re.wall_balls), 0.667);
});

test('T3: 100 Wall Ball @ 20kg -> 3.000 (capped)', () => {
  const s = scoreSession([{ exerciseKey: 'wallBalls', qty: 100, weightKg: 20 }], LIBRARY, REFERENCES);
  assert.equal(round3(s.re.wall_balls), 3.0);
});

test('T4: 50 Thruster @ 30kg (ref 20) -> wall_balls 0.300, sled_push 0.300', () => {
  const s = scoreSession([{ exerciseKey: 'thruster', qty: 50, weightKg: 30 }], LIBRARY, REFERENCES);
  assert.equal(round3(s.re.wall_balls), 0.3);
  assert.equal(round3(s.re.sled_push), 0.3);
});

test('T5: Ski 10x200m each at 2:40/1000m, target 4:00 -> skierg 3.000', () => {
  // 10 x 200m at a constant 160s/km pace collapses to one line: 2000m in 320s.
  const s = scoreSession([{ exerciseKey: 'skiErg', qty: 2000, distanceM: 2000, timeSec: 320 }], LIBRARY, REFERENCES);
  assert.equal(round3(s.re.skierg), 3.0);
});

test('T6: Run 3km, no pace -> run 0.375, estimated', () => {
  const s = scoreSession([{ exerciseKey: 'run', qty: 3000, distanceM: 3000 }], LIBRARY, REFERENCES);
  assert.equal(round3(s.re.run), 0.375);
  assert.equal(s.lines[0].credits.run.estimated, true);
});

test('T7: Echo Bike 30cal, 12m/cal -> run 0.0135, skierg 0.180, row 0.144', () => {
  const s = scoreSession([{ exerciseKey: 'assaultBike', qty: 30, calories: 30 }], LIBRARY, REFERENCES);
  assert.equal(round3(s.re.run), 0.014); // 0.0135 rounds to 0.014 at 3dp
  assert.equal(round3(s.re.skierg), 0.18);
  assert.equal(round3(s.re.row), 0.144);
});

test('T8: exercise not in library or pending -> contributes 0, flagged needs_library', () => {
  const sMissing = scoreSession([{ exerciseKey: 'sandbagGetUp', qty: 10 }], LIBRARY, REFERENCES);
  assert.deepEqual(sMissing.lines[0].credits, {});
  assert.ok(sMissing.lines[0].flags.includes('needs_library'));
  assert.equal(sMissing.sessionLoadRE, 0);

  const sPending = scoreSession([{ exerciseKey: 'notYetApproved', qty: 10 }], LIBRARY, REFERENCES);
  assert.deepEqual(sPending.lines[0].credits, {});
  assert.ok(sPending.lines[0].flags.includes('needs_library'));
});

test('T9: a warmup-tagged line is counted at warmupWeight (default 1.0)', () => {
  const s = scoreSession([{ exerciseKey: 'wallBalls', qty: 100, weightKg: 6, part: 'warmup' }], LIBRARY, REFERENCES);
  assert.equal(round3(s.re.wall_balls), 1.0);

  const halvedRefs = { ...REFERENCES, limits: { ...REFERENCES.limits, warmupWeight: 0.5 } };
  const sHalved = scoreSession([{ exerciseKey: 'wallBalls', qty: 100, weightKg: 6, part: 'warmup' }], LIBRARY, halvedRefs);
  assert.equal(round3(sHalved.re.wall_balls), 0.5);
  // a non-warmup line is untouched by warmupWeight
  const sMain = scoreSession([{ exerciseKey: 'wallBalls', qty: 100, weightKg: 6, part: 'main' }], LIBRARY, halvedRefs);
  assert.equal(round3(sMain.re.wall_balls), 1.0);
});

test('T10: Push-up 30 reps (core 0.3) -> core 0.090', () => {
  const s = scoreSession([{ exerciseKey: 'pushUp', qty: 30 }], LIBRARY, REFERENCES);
  assert.equal(round3(s.re.core), 0.09);
});

test('T11: full session matches every category and the session total', () => {
  const lines = [
    { exerciseKey: 'rowErg', qty: 500, distanceM: 500, part: 'warmup' },
    { exerciseKey: 'wallBalls', qty: 60, weightKg: 9, part: 'main' },
    { exerciseKey: 'pushUp', qty: 30, part: 'main' },
    { exerciseKey: 'run', qty: 3000, distanceM: 3000, part: 'main' },
    { exerciseKey: 'assaultBike', qty: 30, calories: 30, part: 'main' },
    { exerciseKey: 'wallBalls', qty: 75, weightKg: 6, part: 'main' },
    { exerciseKey: 'thruster', qty: 50, weightKg: 30, part: 'main' },
    { exerciseKey: 'sandbagGetUp', qty: 10, part: 'main' }, // new/unrecognized -> 0
    { exerciseKey: 'situp', qty: 100, part: 'core' },
  ];
  const s = scoreSession(lines, LIBRARY, REFERENCES);
  assert.equal(round3(s.re.run), 0.389);
  assert.equal(round3(s.re.skierg), 0.18);
  assert.equal(round3(s.re.sled_push), 0.3);
  assert.equal(round3(s.re.row), 0.644);
  assert.equal(round3(s.re.wall_balls), 1.95);
  assert.equal(round3(s.re.core), 1.09);
  assert.equal(round3(s.sessionLoadRE), 4.553); // sums to 4.5525, matches the brief's rounded 4.55
});

test('missing reference load on a weighted category -> neutral factor, estimated', () => {
  const s = scoreSession([{ exerciseKey: 'sledPushNoRef', qty: 50, weightKg: 200 }], LIBRARY, REFERENCES);
  assert.equal(round3(s.re.sled_push), 1.0); // 50 * 1 * 1.0 / 50
  assert.equal(s.lines[0].credits.sled_push.estimated, true);
});

test('missing load on a line -> neutral factor, estimated', () => {
  const s = scoreSession([{ exerciseKey: 'wallBalls', qty: 100 }], LIBRARY, REFERENCES); // no weightKg
  assert.equal(round3(s.re.wall_balls), 1.0);
  assert.equal(s.lines[0].credits.wall_balls.estimated, true);
});

test('missing pace on a line -> neutral factor, estimated', () => {
  const s = scoreSession([{ exerciseKey: 'skiErg', qty: 1000, distanceM: 1000 }], LIBRARY, REFERENCES); // no timeSec
  assert.equal(round3(s.re.skierg), 1.0);
  assert.equal(s.lines[0].credits.skierg.estimated, true);
});

test('load factor is capped', () => {
  const s = scoreSession([{ exerciseKey: 'wallBalls', qty: 100, weightKg: 100 }], LIBRARY, REFERENCES);
  assert.equal(round3(s.re.wall_balls), 3.0);
});

test('load factor is floored', () => {
  const s = scoreSession([{ exerciseKey: 'wallBalls', qty: 100, weightKg: 1 }], LIBRARY, REFERENCES); // 1/6 = 0.167, floors to 0.25
  assert.equal(round3(s.re.wall_balls), 0.25);
});

test('pace factor is capped and floored', () => {
  const fast = scoreSession([{ exerciseKey: 'skiErg', qty: 1000, distanceM: 1000, timeSec: 60 }], LIBRARY, REFERENCES); // 60s/km, target 240 -> 4x capped to 2x
  assert.equal(round3(fast.re.skierg), 2.0);
  const slow = scoreSession([{ exerciseKey: 'skiErg', qty: 1000, distanceM: 1000, timeSec: 1200 }], LIBRARY, REFERENCES); // 1200s/km, target 240 -> 0.2x floored to 0.25x
  assert.equal(round3(slow.re.skierg), 0.25);
});
