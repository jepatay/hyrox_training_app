import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDailyTotal, sumDailyTotalsRE } from './dailyTotals.js';
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

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

test('sumDailyTotalsRE sums per-category RE across days inside the window', () => {
  const dailyTotals = [
    { date: isoDaysAgo(1), re: { ...Object.fromEntries(CATEGORY_KEYS.map(k => [k, 0])), wall_balls: 1.0 } },
    { date: isoDaysAgo(10), re: { ...Object.fromEntries(CATEGORY_KEYS.map(k => [k, 0])), wall_balls: 0.5, run: 0.3 } },
  ];
  const re = sumDailyTotalsRE(dailyTotals, 42);
  assert.equal(re.wall_balls, 1.5);
  assert.equal(re.run, 0.3);
  assert.equal(re.core, 0);
});

test('sumDailyTotalsRE excludes days outside the trailing window', () => {
  const dailyTotals = [
    { date: isoDaysAgo(5), re: { ...Object.fromEntries(CATEGORY_KEYS.map(k => [k, 0])), wall_balls: 2.0 } },
    { date: isoDaysAgo(60), re: { ...Object.fromEntries(CATEGORY_KEYS.map(k => [k, 0])), wall_balls: 5.0 } },
  ];
  const re = sumDailyTotalsRE(dailyTotals, 42);
  assert.equal(re.wall_balls, 2.0);
});

test('sumDailyTotalsRE handles an empty or missing list', () => {
  const re = sumDailyTotalsRE([], 42);
  for (const k of CATEGORY_KEYS) assert.equal(re[k], 0);
  const re2 = sumDailyTotalsRE(undefined, 42);
  for (const k of CATEGORY_KEYS) assert.equal(re2[k], 0);
});
