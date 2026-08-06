import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OneEuroFilter, PinchDetector, GrabController, mapNormalizedToCanvas } from '../lib/interaction.js';

const variance = (a) => { const m = a.reduce((s, x) => s + x, 0) / a.length; return a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length; };

test('one-euro filter reduces jitter on a noisy steady signal', () => {
  const f = new OneEuroFilter();
  // Deterministic pseudo-noise around 100 (no Math.random).
  const noise = [3, -4, 2, -3, 5, -2, 4, -5, 1, -1, 3, -4, 2, -2, 4, -3];
  const raw = [], smooth = [];
  noise.forEach((n, i) => { const x = 100 + n; raw.push(x); smooth.push(f.filter(x, i * 33)); });
  // Ignore the warm-up sample.
  assert.ok(variance(smooth.slice(3)) < variance(raw.slice(3)), 'smoothed variance should be lower');
});

test('pinch debounces chatter — no double fire', () => {
  const d = new PinchDetector({ debounceMs: 60 });
  const events = [];
  // Rapid flicker around the threshold, each 10ms apart (< debounce): no commit.
  const flicker = [0.04, 0.09, 0.04, 0.09, 0.04, 0.09];
  flicker.forEach((dist, i) => { const e = d.update(dist, i * 10); if (e) events.push(e); });
  assert.deepEqual(events, [], 'chatter within the debounce window must not fire');
  assert.equal(d.isPinched, false);
});

test('a held pinch fires exactly one pinchstart, then one pinchend', () => {
  const d = new PinchDetector({ debounceMs: 60 });
  const events = [];
  // Hold closed for > 60ms.
  for (const t of [0, 20, 40, 60, 80]) { const e = d.update(0.03, t); if (e) events.push(e); }
  // Then hold open for > 60ms.
  for (const t of [100, 120, 140, 160, 180]) { const e = d.update(0.12, t); if (e) events.push(e); }
  assert.deepEqual(events, ['pinchstart', 'pinchend']);
  assert.equal(d.isPinched, false);
});

test('grab controller grabs on the object and follows the cursor', () => {
  const obj = { x: 100, y: 100, r: 30 };
  const g = new GrabController(obj, { grabRadius: 40 });
  assert.equal(g.tryGrab({ x: 110, y: 105 }), true);
  g.drag({ x: 160, y: 130 });
  assert.equal(obj.x, 150); // moved by (+50) preserving grab offset (-10)
  assert.equal(obj.y, 125); // moved by (+25) preserving grab offset (-5)
  g.release();
  g.drag({ x: 300, y: 300 });
  assert.equal(obj.x, 150, 'released object does not follow');
});

test('grab misses when the cursor is far from the object', () => {
  const g = new GrabController({ x: 100, y: 100, r: 20 }, { grabRadius: 30 });
  assert.equal(g.tryGrab({ x: 400, y: 400 }), false);
  assert.equal(g.grabbed, false);
});

test('normalized coords map to canvas with mirroring', () => {
  assert.deepEqual(mapNormalizedToCanvas({ x: 0, y: 0.5 }, 640, 480), { x: 640, y: 240 });
  assert.deepEqual(mapNormalizedToCanvas({ x: 0.25, y: 1 }, 640, 480, { mirror: false }), { x: 160, y: 480 });
});
