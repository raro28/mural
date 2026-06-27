import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseConfig, normalizeDefault, entryForConnector,
  setMonitorEntry,
} from './config.js';

test('parseConfig: valid object', () => {
  assert.deepEqual(parseConfig('{"default":"/a.jpg"}'), { default: '/a.jpg' });
});
test('parseConfig: invalid JSON -> {}', () => {
  assert.deepEqual(parseConfig('not json'), {});
});
test('parseConfig: non-object JSON -> {}', () => {
  assert.deepEqual(parseConfig('[1,2]'), {});
  assert.deepEqual(parseConfig('"x"'), {});
  assert.deepEqual(parseConfig('null'), {});
});
test('normalizeDefault: bare string -> mode zoom', () => {
  assert.deepEqual(normalizeDefault({ default: '/d.jpg' }), { file: '/d.jpg', mode: 'zoom' });
});
test('normalizeDefault: object with/without mode', () => {
  assert.deepEqual(normalizeDefault({ default: { file: '/d.jpg', mode: 'fit' } }), { file: '/d.jpg', mode: 'fit' });
  assert.deepEqual(normalizeDefault({ default: { file: '/d.jpg' } }), { file: '/d.jpg', mode: 'zoom' });
  assert.deepEqual(normalizeDefault({ default: { file: '/d.jpg', mode: 'bogus' } }), { file: '/d.jpg', mode: 'zoom' });
});
test('normalizeDefault: missing/invalid -> null', () => {
  assert.equal(normalizeDefault({}), null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assert.equal(normalizeDefault({ default: { mode: 'fit' } as any }), null);
});
test('entryForConnector: explicit entry, mode normalized', () => {
  const c = { monitors: { 'DP-1': { file: '/a.jpg', mode: 'center' } } };
  assert.deepEqual(entryForConnector(c, 'DP-1'), { file: '/a.jpg', mode: 'center' });
  assert.deepEqual(entryForConnector({ monitors: { 'DP-1': { file: '/a.jpg' } } }, 'DP-1'), { file: '/a.jpg', mode: 'zoom' });
});
test('entryForConnector: no entry/file -> null', () => {
  assert.equal(entryForConnector({}, 'DP-1'), null);
  assert.equal(entryForConnector({ monitors: { 'DP-1': {} } }, 'DP-1'), null);
});
test('setMonitorEntry: adds without dropping other keys', () => {
  const c = { monitors: { 'HDMI-1': { file: '/b.jpg', mode: 'zoom' } }, default: '/d.jpg' };
  const out = setMonitorEntry(c, 'DP-1', '/a.jpg', 'fit');
  assert.deepEqual(out.monitors!['DP-1'], { file: '/a.jpg', mode: 'fit' });
  assert.deepEqual(out.monitors!['HDMI-1'], { file: '/b.jpg', mode: 'zoom' }); // preserved
  assert.equal(out.default, '/d.jpg'); // preserved
  assert.notEqual(out, c); // new object (no mutation)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assert.equal((c.monitors as any)['DP-1'], undefined); // input untouched
});
test('entryForConnector: empty-string file -> null', () => {
  assert.equal(entryForConnector({ monitors: { 'DP-1': { file: '', mode: 'fit' } } }, 'DP-1'), null);
});
test('normalizeDefault: empty-string file -> null', () => {
  assert.equal(normalizeDefault({ default: '' }), null);
  assert.equal(normalizeDefault({ default: { file: '', mode: 'fit' } }), null);
});
