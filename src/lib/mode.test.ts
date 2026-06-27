import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modeToStyle, normalizeMode } from './mode.js';

test('modeToStyle: known modes', () => {
  assert.equal(modeToStyle('zoom'), 5);
  assert.equal(modeToStyle('fill'), 4);
  assert.equal(modeToStyle('fit'), 3);
  assert.equal(modeToStyle('center'), 2);
});
test('modeToStyle: unknown/undefined -> zoom (5)', () => {
  assert.equal(modeToStyle('spanned'), 5);
  assert.equal(modeToStyle('XYZ'), 5);
  assert.equal(modeToStyle(undefined), 5);
});
test('normalizeMode: passthrough known, else zoom', () => {
  assert.equal(normalizeMode('center'), 'center');
  assert.equal(normalizeMode('nope'), 'zoom');
  assert.equal(normalizeMode(undefined), 'zoom');
});
