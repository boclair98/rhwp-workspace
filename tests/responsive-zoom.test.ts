import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFitResizeHandler } from '../frontend/src/workspace/responsive-zoom.ts';

function setup() {
  let state = {
    loaded: true,
    mode: 'fitWidth' as 'none' | 'fitWidth' | 'fitPage',
  };
  const frames: (() => void)[] = [],
    calls: string[] = [];
  const resize = createFitResizeHandler(
    () => state,
    (mode) => calls.push(mode),
    (callback) => frames.push(callback),
  );
  return {
    resize,
    calls,
    frames,
    state,
    flush: () => frames.splice(0).forEach((callback) => callback()),
  };
}

test('fit width follows rotation and width changes once per pending update', () => {
  const t = setup();
  t.resize(340, 560);
  t.resize(370, 560);
  t.resize(680, 560);
  t.flush();
  assert.deepEqual(t.calls, ['fitWidth']);
  t.resize(680, 560);
  t.flush();
  assert.equal(t.calls.length, 1);
});
test('keyboard height changes do not alter fit-width zoom', () => {
  const t = setup();
  t.resize(370, 640);
  t.resize(370, 280);
  t.flush();
  assert.deepEqual(t.calls, []);
});
test('fit page follows the available height', () => {
  const t = setup();
  t.state.mode = 'fitPage';
  t.resize(370, 640);
  t.resize(370, 280);
  t.flush();
  assert.deepEqual(t.calls, ['fitPage']);
});
test('manual zoom stays selected during rotation and cancels a queued refit', () => {
  const t = setup();
  t.resize(340, 560);
  t.resize(680, 300);
  t.state.mode = 'none';
  t.flush();
  t.resize(370, 640);
  t.flush();
  assert.deepEqual(t.calls, []);
});
test('fit width follows the desktop panel; unloaded documents wait', () => {
  const t = setup();
  t.resize(1400, 700);
  t.resize(1100, 700);
  t.flush();
  assert.deepEqual(t.calls, ['fitWidth']);
  t.state.loaded = false;
  t.resize(1400, 700);
  t.flush();
  assert.deepEqual(t.calls, ['fitWidth']);
});
test('invalid/zero viewport measurements do not overwrite the previous size', () => {
  const t = setup();
  t.resize(340, 560);
  t.resize(0, 0);
  t.resize(NaN, 640);
  t.resize(340, 560);
  t.flush();
  assert.deepEqual(t.calls, []);
});
