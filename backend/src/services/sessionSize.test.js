import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifySessionSize } from './claude.js';

const recent = [
  { duration: 60, rpe: 7 },
  { duration: 55, rpe: 8 },
  { duration: 70, rpe: 6 },
];

test('5-minute warm-up is very light', () => {
  assert.equal(classifySessionSize({ duration: 5, rpe: 4 }, recent).size, 'very_light');
});

test('session far below typical load is very light even without short duration flag', () => {
  assert.equal(classifySessionSize({ duration: 40, rpe: 3 }, recent).size, 'very_light');
});

test('normal session is typical', () => {
  assert.equal(classifySessionSize({ duration: 60, rpe: 7 }, recent).size, 'typical');
});

test('much bigger session is big', () => {
  assert.equal(classifySessionSize({ duration: 100, rpe: 8 }, recent).size, 'big');
});

test('no duration or history is unknown', () => {
  assert.equal(classifySessionSize({ notes: '10 burpees' }, []).size, 'unknown');
});
