import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDailyTotal } from './dailyTotals.js';
import { CATEGORY_KEYS } from './scoring.js';

test('computeDailyTotal sums RE per category and raw core reps across a day\'s scored sessions', () => {
  const sessions = [
    {
      id: 's1',
      v2: {
        re: { ...Object.fromEntries(CATEGORY_KEYS.map(k => [k, 0])), wall_balls: 1.0, core: 0.5 },
        lines: [{ credits: { core: { re: 0.5 } }, qty: 50 }],
      },
    },
    {
      id: 's2',
      v2: {
        re: { ...Object.fromEntries(CATEGORY_KEYS.map(k => [k, 0])), wall_balls: 0.5, run: 0.2 },
        lines: [{ credits: { wall_balls: { re: 0.5 } }, qty: 50 }],
      },
    },
    { id: 's3', v2: null }, // not scored -- excluded entirely
  ];

  const totals = computeDailyTotal('2026-09-19', sessions);
  assert.equal(totals.date, '2026-09-19');
  assert.equal(totals.re.wall_balls, 1.5);
  assert.equal(totals.re.core, 0.5);
  assert.equal(totals.re.run, 0.2);
  assert.equal(totals.coreReps, 50);
  assert.deepEqual(totals.sessionIds, ['s1', 's2']);
});

test('computeDailyTotal returns all-zero totals for a day with no scored sessions', () => {
  const totals = computeDailyTotal('2026-09-19', [{ id: 's1', v2: null }]);
  assert.deepEqual(totals.sessionIds, []);
  assert.equal(totals.coreReps, 0);
  for (const k of CATEGORY_KEYS) assert.equal(totals.re[k], 0);
});
