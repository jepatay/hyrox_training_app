import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderExtractionSummaryV2, parseExtractionSummaryV2,
  parseStravaLapsFromNotes, ensureRunLines,
} from './claude.js';

test('renders the section-4 worked example exactly', () => {
  const extractionV2 = {
    lines: [
      { part: 'warmup', exercise: 'Row', intervals: 1, distanceM: 500 },
      { part: 'main', exercise: 'Wall Ball', intervals: 3, reps: 20, weightKg: 9 },
      { part: 'main', exercise: 'Ski', intervals: 10, distanceM: 200, timeSec: 32 },
      { part: 'finisher', exercise: 'Thruster', intervals: 1, reps: 50, weightKg: 30 },
      { part: 'core', exercise: 'Sit-up', intervals: 1, reps: 100 },
    ],
  };
  const text = renderExtractionSummaryV2(extractionV2);
  assert.equal(text, [
    'Warm-up',
    'Row: 500 m',
    'Main',
    'Wall Ball: 3 × 20 reps @ 9 kg = 60 reps',
    'Ski: 10 × 200 m @ 0:32 = 2,000 m',
    'Then',
    'Thruster: 50 reps @ 30 kg',
    'Core',
    'Sit-up: 100 reps',
  ].join('\n'));
});

test('render -> parse round trip preserves every field', () => {
  const original = [
    { part: 'warmup', exercise: 'Row', intervals: 1, reps: null, distanceM: 500, calories: null, weightKg: null, timeSec: null, notes: null },
    { part: 'main', exercise: 'Wall Ball', intervals: 3, reps: 20, distanceM: null, calories: null, weightKg: 9, timeSec: null, notes: null },
    { part: 'main', exercise: 'Ski', intervals: 10, reps: null, distanceM: 200, calories: null, weightKg: null, timeSec: 32, notes: null },
    { part: 'main', exercise: 'Echo Bike', intervals: 1, reps: null, distanceM: null, calories: 30, weightKg: null, timeSec: null, notes: null },
    { part: 'finisher', exercise: 'Thruster', intervals: 1, reps: 50, distanceM: null, calories: null, weightKg: 30, timeSec: null, notes: null },
    { part: 'core', exercise: 'Sit-up', intervals: 1, reps: 100, distanceM: null, calories: null, weightKg: null, timeSec: null, notes: null },
    { part: 'cooldown', exercise: 'Walk', intervals: 1, reps: null, distanceM: 300, calories: null, weightKg: null, timeSec: null, notes: null },
  ];
  const text = renderExtractionSummaryV2({ lines: original });
  const parsed = parseExtractionSummaryV2(text);

  assert.equal(parsed.lines.length, original.length);
  original.forEach((line, i) => {
    const p = parsed.lines[i];
    assert.equal(p.part, line.part);
    assert.equal(p.exercise, line.exercise);
    assert.equal(p.intervals, line.intervals);
    assert.equal(p.reps, line.reps);
    assert.equal(p.distanceM, line.distanceM);
    assert.equal(p.calories, line.calories);
    assert.equal(p.weightKg, line.weightKg);
    assert.equal(p.timeSec, line.timeSec);
  });
});

test('parser assigns a part from whichever section header precedes a line, defaulting to main', () => {
  const text = 'Sit-up: 100 reps'; // no header at all
  const parsed = parseExtractionSummaryV2(text);
  assert.equal(parsed.lines[0].part, 'main');
});

test('parser strips the pending-review tag and the redundant total', () => {
  const text = 'Devils Press: 3 × 10 reps @ 24 kg = 30 reps [new — pending review in Exercise Library]';
  const parsed = parseExtractionSummaryV2(text);
  assert.equal(parsed.lines[0].exercise, 'Devils Press');
  assert.equal(parsed.lines[0].intervals, 3);
  assert.equal(parsed.lines[0].reps, 10);
  assert.equal(parsed.lines[0].weightKg, 24);
});

test('parseStravaLapsFromNotes reads a "Laps (N):" block into one line per lap', () => {
  const notes = [
    'Easy run around the lake.',
    '',
    'Laps (3):',
    '  Lap 1: 1000m @ 4:30/km (4:30) · 145 bpm',
    '  Lap 2: 1000m @ 4:15/km (4:15) · 150 bpm · +8m',
    '  Lap 3: 1000m @ 4:45/km (4:45) · 148 bpm',
  ].join('\n');
  const laps = parseStravaLapsFromNotes(notes);
  assert.equal(laps.length, 3);
  assert.equal(laps[0].distanceM, 1000);
  assert.equal(laps[0].timeSec, 270); // 4:30
  assert.equal(laps[1].timeSec, 255); // 4:15
  assert.equal(laps[2].distanceM, 1000);
});

test('parseStravaLapsFromNotes falls back to "Km splits:" when there are no laps', () => {
  const notes = [
    'Recovery jog.',
    '',
    'Km splits:',
    '  km 1: 5:30/km · 130 bpm',
    '  km 2: 5:20/km',
  ].join('\n');
  const splits = parseStravaLapsFromNotes(notes);
  assert.equal(splits.length, 2);
  assert.equal(splits[0].distanceM, 1000);
  assert.equal(splits[0].timeSec, 330); // 5:30
  assert.equal(splits[1].timeSec, 320); // 5:20
});

test('parseStravaLapsFromNotes returns nothing when neither section is present', () => {
  assert.deepEqual(parseStravaLapsFromNotes('Just an easy run, felt good.'), []);
  assert.deepEqual(parseStravaLapsFromNotes(''), []);
  assert.deepEqual(parseStravaLapsFromNotes(null), []);
});

test('ensureRunLines never touches an extraction that already found a run', () => {
  const lines = [{ part: 'main', exercise: 'Run', intervals: 1, distanceM: 5000 }];
  const session = { type: 'running', notes: 'Laps (2):\n  Lap 1: 1000m @ 4:00/km (4:00)', runningDistance: 5 };
  assert.deepEqual(ensureRunLines(lines, session), lines);
});

test('ensureRunLines falls back to Strava laps when extraction found none', () => {
  const session = {
    type: 'running',
    notes: 'Laps (2):\n  Lap 1: 1000m @ 4:00/km (4:00)\n  Lap 2: 1000m @ 3:55/km (3:55)',
    runningDistance: 2,
  };
  const result = ensureRunLines([], session);
  assert.equal(result.length, 2);
  assert.equal(result[0].exercise, 'Run');
  assert.equal(result[0].timeSec, 240);
});

test('ensureRunLines falls back to runningDistance when notes have no lap/split data either', () => {
  const session = { type: 'running', notes: 'Easy 5k, no watch.', runningDistance: 5, duration: 30 };
  const result = ensureRunLines([], session);
  assert.equal(result.length, 1);
  assert.equal(result[0].distanceM, 5000);
  assert.equal(result[0].timeSec, 1800);
  assert.ok(result[0].notes.includes('no per-interval pace'));
});

test('ensureRunLines does nothing for a non-running session type', () => {
  const session = { type: 'hyrox_training', notes: 'no run here', runningDistance: null };
  assert.deepEqual(ensureRunLines([], session), []);
});
