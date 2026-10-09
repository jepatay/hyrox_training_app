import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeExerciseName, matchExercise, findDuplicateGroups,
  mergedAliases, remapSessionLibraryKeys,
} from './exerciseLibrary.js';

test('normalizeExerciseName collapses plural, hyphen, spacing and case variants', () => {
  assert.equal(normalizeExerciseName('Bar Muscle Ups'), normalizeExerciseName('Bar Muscle Up'));
  assert.equal(normalizeExerciseName('pull-ups'), normalizeExerciseName('Pullups'));
  assert.equal(normalizeExerciseName('Pull Ups'), normalizeExerciseName('pull up'));
  assert.equal(normalizeExerciseName('Clean & Jerk'), normalizeExerciseName('clean and jerk'));
  assert.equal(normalizeExerciseName("Devil's Press"), normalizeExerciseName('devils press'));
  assert.equal(normalizeExerciseName('Bench Presses'), normalizeExerciseName('Bench Press'));
  assert.notEqual(normalizeExerciseName('Push Press'), normalizeExerciseName('Push Up'));
});

const lib = [
  { key: 'barMuscleUp', label: 'Bar Muscle Up', aliases: [], status: 'pending', source: 'ai_suggested', credits: { core: 0.3 } },
  { key: 'barMuscleUps', label: 'Bar Muscle Ups', aliases: [], status: 'pending', source: 'ai_suggested', credits: { core: 0.5 } },
  { key: 'pullUp', label: 'Pull Up', aliases: ['chin up'], status: 'approved', source: 'builtin', credits: {} },
  { key: 'pullUps', label: 'Pull-Ups', aliases: [], status: 'pending', source: 'ai_suggested', credits: { sled_pull: 0.2 } },
  { key: 'thruster', label: 'Thruster', aliases: ['thrusters'], status: 'approved', source: 'builtin', credits: {} },
];

test('matchExercise resolves a spelling variant to the existing entry instead of missing', () => {
  assert.equal(matchExercise('bar muscle-ups', lib.slice(0, 1))?.key, 'barMuscleUp');
  assert.equal(matchExercise('Chin-Ups', lib)?.key, 'pullUp');
  // approved builtin wins over a pending duplicate
  assert.equal(matchExercise('pull ups', lib)?.key, 'pullUp');
  assert.equal(matchExercise('Muscle Clean', lib), null);
});

test('findDuplicateGroups groups same-movement entries and keeps the canonical one', () => {
  const groups = findDuplicateGroups(lib);
  assert.equal(groups.length, 2);
  const pull = groups.find(g => g.targetKey === 'pullUp');
  assert.deepEqual(pull.sources.map(s => s.key), ['pullUps']);
  const mu = groups.find(g => g.targetKey === 'barMuscleUp');
  assert.deepEqual(mu.sources.map(s => s.key), ['barMuscleUps']);
});

test('mergedAliases folds source spellings into the target without duplicates', () => {
  assert.deepEqual(mergedAliases(lib[2], [lib[3]]), ['chin up', 'Pull-Ups']);
  assert.deepEqual(mergedAliases(lib[0], [lib[1]]), ['Bar Muscle Ups']);
});

test('remapSessionLibraryKeys repoints v2 and v1 extraction lines', () => {
  const session = {
    extractionV2: { promptVersion: 1, lines: [{ libraryKey: 'barMuscleUps', reps: 50 }, { libraryKey: 'thruster' }] },
    extractedExercises: { exercises: [{ name: 'Bar Muscle Ups', libraryKey: 'barMuscleUps' }] },
  };
  const patch = remapSessionLibraryKeys(session, ['barMuscleUps'], 'barMuscleUp');
  assert.deepEqual(patch.extractionV2.lines.map(l => l.libraryKey), ['barMuscleUp', 'thruster']);
  assert.equal(patch.extractionV2.promptVersion, 1);
  assert.equal(patch.extractedExercises.exercises[0].libraryKey, 'barMuscleUp');
  assert.equal(remapSessionLibraryKeys({ extractionV2: { lines: [{ libraryKey: 'thruster' }] } }, ['barMuscleUps'], 'barMuscleUp'), null);
});
