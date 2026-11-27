// Sim tick cost, allocation per tick, snapshot sizes and rollback cost in Node (V8).
// Run from the repo root:
//   node --expose-gc --max-semi-space-size=256 --import ./tests/register-sdk-hook.js scripts/bench/bench-sim.mjs
// --max-semi-space-size keeps the young generation from being collected during the timed loop,
// so "alloc B/tick" is the heap growth per tick.
import { performance } from 'node:perf_hooks';
import zlib from 'node:zlib';
const ROOT = process.cwd();
const { createSimWorld } = await import(ROOT + '/src/sim/world.js');
const { captureSnapshot, applySnapshot, encodeWireSnapshot } = await import(ROOT + '/src/sim/snapshot.js');
const { stateHash } = await import(ROOT + '/src/sim/hash.js');
const { CIRCUITS } = await import(ROOT + '/src/sim/track-core.js');

const pct = (arr, p) => { const a = Float64Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(a.length * p))]; };
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const bytes = (v) => Buffer.byteLength(JSON.stringify(v));

function seatsOf(n) { return Array.from({ length: n }, () => ({ kind: 'ai' })); }

const rows = [];
for (const course of CIRCUITS) {
  for (const n of [6, 12]) {
    const world = createSimWorld({ courseId: course.id, seed: 77, seats: seatsOf(n), finishRule: 'all_racers', finishGraceSeconds: 600 });
    // warm up JIT through the countdown and first 10 s
    for (let i = 0; i < 180 + 600; i++) world.step({});
    const tickMs = [], wire = [], wireGz = [], objs = [];
    let flyingTicks = 0;
    const RACE_TICKS = 60 * 150; // up to 150 s of racing
    globalThis.gc?.();
    const heap0 = process.memoryUsage().heapUsed;
    let ticks = 0;
    for (; ticks < RACE_TICKS && !world.state.done; ticks++) {
      const t0 = performance.now();
      world.step({});
      tickMs.push(performance.now() - t0);
    }
    const heap1 = process.memoryUsage().heapUsed;
    // second pass on a fresh world for sizes (kept out of the timing/alloc loop)
    const w2 = createSimWorld({ courseId: course.id, seed: 77, seats: seatsOf(n), finishRule: 'all_racers', finishGraceSeconds: 600 });
    let encMs = 0, capMs = 0, hashMs = 0, applyMs = 0, capBytes = 0, samples = 0;
    for (let i = 0; i < 180 + RACE_TICKS && !w2.state.done; i++) {
      w2.step({});
      if (w2.state.actors.some((a) => a.kart.flying)) flyingTicks++;
      if (i % 3 === 0) {
        let t = performance.now();
        const ws = encodeWireSnapshot(w2, { 0: i });
        const json = JSON.stringify(ws);
        encMs += performance.now() - t;
        wire.push(Buffer.byteLength(json));
        objs.push(ws.o.length);
        if (i % 30 === 0) wireGz.push(zlib.deflateRawSync(json).length);
      }
      if (i % 60 === 0) {
        let t = performance.now(); const snap = captureSnapshot(w2); capMs += performance.now() - t;
        capBytes += bytes(snap);
        t = performance.now(); stateHash(w2); hashMs += performance.now() - t;
        t = performance.now(); applySnapshot(w2, snap); applyMs += performance.now() - t;
        samples++;
      }
    }
    rows.push({
      course: course.id, seats: n, ticks,
      'tick mean ms': +mean(tickMs).toFixed(4), 'p95': +pct(tickMs, 0.95).toFixed(4), 'p99': +pct(tickMs, 0.99).toFixed(4), 'max': +Math.max(...tickMs).toFixed(3),
      'alloc B/tick (approx)': Math.round((heap1 - heap0) / ticks),
      'wire mean B': Math.round(mean(wire)), 'wire max B': Math.max(...wire), 'wire deflate mean': Math.round(mean(wireGz)),
      'objs max': Math.max(...objs),
      'encode+stringify ms': +(encMs / wire.length).toFixed(4),
      'full snap B': Math.round(capBytes / samples), 'capture ms': +(capMs / samples).toFixed(4), 'apply ms': +(applyMs / samples).toFixed(4), 'hash ms': +(hashMs / samples).toFixed(4),
      'flying %': Math.round(100 * flyingTicks / (180 + ticks)),
    });
  }
}
console.table(rows);

// Rollback cost: restore + resimulate N ticks (what a predictor pays per authoritative snapshot).
{
  const world = createSimWorld({ courseId: 'track02', seed: 5, seats: seatsOf(12), finishRule: 'all_racers' });
  for (let i = 0; i < 180 + 1800; i++) world.step({});
  const out = [];
  for (const n of [3, 6, 9, 12, 18, 30]) {
    const times = [];
    for (let r = 0; r < 200; r++) {
      const snap = captureSnapshot(world);
      const t0 = performance.now();
      applySnapshot(world, snap);
      for (let i = 0; i < n; i++) world.step({});
      times.push(performance.now() - t0);
    }
    out.push({ 'resim ticks': n, 'mean ms': +mean(times).toFixed(3), 'p95 ms': +pct(times, 0.95).toFixed(3) });
  }
  console.log('Rollback + resim cost, 12 seats, track02 (full world incl. AI):');
  console.table(out);
}
