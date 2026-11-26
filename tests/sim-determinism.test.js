import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, it } from 'node:test';

import * as simMath from '../src/sim/math.js';
import { createRng } from '../src/sim/rng.js';
import { CIRCUITS, createTrackCore } from '../src/sim/track-core.js';
import {
  BTN_DRIFT_BOOST_PRESSED,
  BTN_DRIFT_HELD,
  BTN_DRIFT_PRESSED,
  BTN_ITEM_PRESSED,
  controlsToIntentFrame,
} from '../src/sim/intent.js';
import { createSimWorld } from '../src/sim/world.js';
import { applySnapshot, captureSnapshot } from '../src/sim/snapshot.js';
import { stateHash } from '../src/sim/hash.js';
import { chunkLog, createLogRecorder, replayLog } from '../src/sim/replay.js';
import { RACER_SIM_VERSION } from '../src/sim/version.js';

function deepFreeze(obj, seen = new Set()) {
  if (!obj || (typeof obj !== 'object' && typeof obj !== 'function') || seen.has(obj)) return obj;
  seen.add(obj);
  for (const key of Reflect.ownKeys(obj)) {
    try {
      deepFreeze(obj[key], seen);
    } catch {
      /* ignore non-configurable host getters */
    }
  }
  try {
    Object.freeze(obj);
  } catch {
    /* ignore non-freezable host intrinsics */
  }
  return obj;
}

function loadFrozenVmRacerSim() {
  const bundleCode = readFileSync(new URL('../build/racer-sim.js', import.meta.url), 'utf8');
  const ctx = vm.createContext({});
  vm.runInContext(
    `
    for (const fn of ['sin', 'cos', 'tan', 'atan', 'atan2', 'exp', 'pow', 'hypot', 'random']) {
      delete Math[fn];
    }
    `,
    ctx,
  );
  vm.runInContext(bundleCode, ctx);
  deepFreeze(ctx);
  return ctx.RacerSim;
}

describe('deterministic math & PRNG', () => {
  it('matches IEEE-754 Math transcendentals within < 1e-14 across [-50000, 50000]', () => {
    for (let i = -500; i <= 500; i++) {
      const x = i * 97.31847 + 0.1234567;
      assert.ok(Math.abs(simMath.sin(x) - Math.sin(x)) < 1e-14, `sin(${x})`);
      assert.ok(Math.abs(simMath.cos(x) - Math.cos(x)) < 1e-14, `cos(${x})`);
      const small = (i / 500) * 1.4;
      assert.ok(Math.abs(simMath.tan(small) - Math.tan(small)) < 1e-14, `tan(${small})`);
      assert.ok(Math.abs(simMath.atan(x) - Math.atan(x)) < 1e-14, `atan(${x})`);
    }
    for (const [y, x] of [[0, 1], [1, 0], [-1, 0], [0, -1], [3.7, -8.2], [-19.4, -0.02], [1e-9, -5]]) {
      assert.ok(Math.abs(simMath.atan2(y, x) - Math.atan2(y, x)) < 1e-14, `atan2(${y},${x})`);
    }
    for (let x = -20; x <= 20; x += 0.37) {
      const rel = Math.abs(simMath.exp(x) - Math.exp(x)) / Math.max(1, Math.exp(x));
      assert.ok(rel < 1e-14, `exp(${x})`);
    }
  });

  it('snapshots and restores seeded sfc32 PRNG bit-identically', () => {
    const a = createRng(0xdeadbeef);
    for (let i = 0; i < 25; i++) a.nextUint32();
    const saved = a.getState();
    const b = createRng(1);
    b.setState(saved);
    for (let i = 0; i < 100; i++) {
      assert.equal(a.nextFloat(), b.nextFloat());
    }
  });
});

describe('pure SimWorld determinism, snapshots, and Nakama Goja VM parity', () => {
  it('produces identical stateHash across independent runs on all 3 circuits with mixed custom cars', () => {
    const cars = ['apex', 'barrage', 'saucer', 'ironhide', 'geep', 'manta'];
    const drivers = ['sproto', 'cone', 'milady', 'remilio', 'pepe', 'wojak'];

    for (const course of CIRCUITS) {
      const seats = cars.map((car, i) => ({
        id: i,
        kind: i < 2 ? 'local' : 'ai',
        car,
        driver: drivers[i % drivers.length],
        gridIndex: i === 0 ? 5 : i - 1,
      }));

      const worldA = createSimWorld({ courseId: course.id, seed: 424242, seats });
      const worldB = createSimWorld({ courseId: course.id, seed: 424242, seats });

      for (let t = 0; t < 420; t++) {
        const p0 = controlsToIntentFrame(t, {
          throttle: t > 145 ? 1 : 0,
          steer: simMath.sin(t * 0.05) * 0.85,
          driftHeld: t >= 220 && t <= 310,
          driftPressed: t === 220,
          driftReleased: t === 311,
          driftBoostPressed: t === 265 || t === 295,
          itemPressed: t === 340,
        });
        const p1 = controlsToIntentFrame(t, {
          throttle: 1,
          steer: simMath.cos(t * 0.04) * 0.65,
          blastersPressed: t === 250 || t === 310,
        });
        worldA.step({ 0: p0, 1: p1 });
        worldB.step({ 0: p0, 1: p1 });
        if (t % 60 === 59) {
          assert.equal(stateHash(worldA), stateHash(worldB), `${course.id} hash mismatch at tick ${t}`);
        }
      }
      assert.equal(stateHash(worldA), stateHash(worldB));
    }
  });

  it('restores mid-race captureSnapshot into a fresh SimWorld with zero future drift', () => {
    const seats = [
      { id: 0, kind: 'local', car: 'barrage', driver: 'sproto', gridIndex: 5 },
      { id: 1, kind: 'local', car: 'skipper', driver: 'cone', gridIndex: 0 },
      { id: 2, kind: 'ai', car: 'hexshift', driver: 'milady', gridIndex: 1 },
      { id: 3, kind: 'ai', car: 'crestline', driver: 'pepe', gridIndex: 2 },
    ];
    const worldA = createSimWorld({ courseId: 'track01', seed: 999111, seats });
    for (let t = 0; t < 260; t++) {
      worldA.step({
        0: controlsToIntentFrame(t, { throttle: 1, steer: 0.4, blastersPressed: t === 210 }),
        1: controlsToIntentFrame(t, { throttle: 1, steer: -0.3, driftHeld: t > 200, driftPressed: t === 201 }),
      });
    }

    const snap = captureSnapshot(worldA);
    const worldB = createSimWorld({ courseId: 'track01', seed: 1, seats });
    assert.equal(applySnapshot(worldB, snap), true);
    assert.equal(stateHash(worldB), stateHash(worldA));

    for (let t = 260; t < 500; t++) {
      const inputs = {
        0: controlsToIntentFrame(t, { throttle: 1, steer: simMath.sin(t * 0.08) * 0.7, itemPressed: t === 330 }),
        1: controlsToIntentFrame(t, { throttle: 1, steer: 0.25 }),
      };
      worldA.step(inputs);
      worldB.step(inputs);
    }
    assert.equal(stateHash(worldB), stateHash(worldA));
  });

  it('verifies recorded replay logs identically in ESM and frozen Math-stripped build/racer-sim.js VM', () => {
    const seats = [
      { id: 0, kind: 'local', car: 'manta', driver: 'sproto', gridIndex: 1 },
      { id: 1, kind: 'local', car: 'shopping-cart', driver: 'cone', gridIndex: 0 },
      { id: 2, kind: 'ai', car: 'saucer', driver: 'milady', gridIndex: 2 },
    ];
    const world = createSimWorld({
      courseId: 'track03',
      seed: 0x778899aa,
      laps: 1,
      finishRule: 'all_humans',
      seats,
    });
    const recorder = createLogRecorder({ seats, finishRule: 'all_humans' });

    for (let t = 0; t < 360 && !world.state.done; t++) {
      const f0 = {
        tick: t,
        steer: Math.round(simMath.sin(t * 0.07) * 20000),
        throttle: t > 148 ? 255 : 0,
        brake: 0,
        reverse: 0,
        buttons:
          (t >= 210 && t <= 270 ? BTN_DRIFT_HELD : 0) |
          (t === 210 ? BTN_DRIFT_PRESSED : 0) |
          (t === 255 ? BTN_DRIFT_BOOST_PRESSED : 0) |
          (t === 300 ? BTN_ITEM_PRESSED : 0),
      };
      const f1 = controlsToIntentFrame(t, { throttle: 1, steer: -0.18 });
      recorder.record(t, 0, f0);
      recorder.record(t, 1, f1);
      world.step({ 0: f0, 1: f1 });
    }

    const log = recorder.finish(world, RACER_SIM_VERSION);
    const esmResult = replayLog(log, RACER_SIM_VERSION);
    assert.equal(esmResult.ok, true);
    assert.equal(esmResult.endHash, log.claimed.endHash);

    // Chunk & reassemble under 4 KB per chunk, then verify inside frozen Nakama-like VM!
    const chunks = chunkLog(JSON.stringify(log), 'race42');
    for (const chunk of chunks) {
      assert.ok(Buffer.byteLength(chunk, 'utf8') <= 4096);
    }

    const RacerSim = loadFrozenVmRacerSim();
    assert.equal(RacerSim.version(), RACER_SIM_VERSION);
    const assembled = RacerSim.joinChunks(chunks);
    assert.ok(assembled, 'expected chunk joiner to reassemble log');
    const vmResult = RacerSim.replay(assembled);
    assert.equal(vmResult.ok, true);
    assert.equal(vmResult.endHash, esmResult.endHash);
    assert.equal(vmResult.winnerSeat, esmResult.winnerSeat);

    // Tampered claimed hash or version must be rejected cleanly.
    const tampered = { ...log, claimed: { ...log.claimed, endHash: '0123456789abcdef' } };
    assert.equal(RacerSim.replay(tampered).ok, false);
    assert.equal(RacerSim.replay(tampered).error, 'claimed_hash_mismatch');
    assert.equal(RacerSim.replay({ ...log, simVersion: 'wrong' }).error, 'version_mismatch');
  });

  it('computes deterministic sub-tick photo-finish microsecond timestamps (finishUs)', () => {
    const track = createTrackCore(CIRCUITS[0]);
    const seats = [
      { id: 0, kind: 'local', car: 'apex', driver: 'sproto', gridIndex: 0 },
      { id: 1, kind: 'local', car: 'apex', driver: 'cone', gridIndex: 1 },
    ];
    const world = createSimWorld({ courseId: 'track01', seed: 7, laps: 1, finishRule: 'all_humans', seats });
    world.state.countdown = 0;
    // Place both karts 1 meter before the finish line at different speeds.
    world.state.actors[0].kart.s = track.length - 1.0;
    world.state.actors[0].kart.speed = 60;
    world.state.actors[1].kart.s = track.length - 1.0;
    world.state.actors[1].kart.speed = 75;

    const f = controlsToIntentFrame(0, { throttle: 1 });
    world.step({ 0: f, 1: f });

    assert.equal(world.state.done, true);
    assert.ok(world.state.actors[1].finishUs < world.state.actors[0].finishUs, 'faster kart wins photo finish');
    assert.equal(world.standings()[0].seat, 1);
  });
});
