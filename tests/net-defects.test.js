import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  BTN_DRIFT_HELD,
  BTN_DRIFT_PRESSED,
  BTN_ITEM_PRESSED,
  BTN_ITEM_SWAP_PRESSED,
  EDGE_BUTTON_MASK,
  controlsToIntentFrame,
} from '../src/sim/intent.js';
import { createSimWorld } from '../src/sim/world.js';
import { applySnapshot, captureSnapshot, decodeWireKart, encodeWireSnapshot } from '../src/sim/snapshot.js';
import { stateHash } from '../src/sim/hash.js';
import { createSeatInputBuffer } from '../src/net/input-buffer.js';

const jsonRoundTrip = (value) => JSON.parse(JSON.stringify(value));

describe('wire snapshot keys', () => {
  it('carries reverse speed and the reserve item under separate keys', () => {
    const world = createSimWorld({ courseId: 'track01', seed: 5, seats: [{ kind: 'ai' }, { kind: 'ai' }] });
    const a = world.state.actors[0];
    a.kart.reverseSpeed = 4.2;
    a.reserve = 7;
    a.reserveCharges = 2;
    const decoded = decodeWireKart(jsonRoundTrip(encodeWireSnapshot(world)).k[0]);
    assert.equal(decoded.reverseSpeed, 4.2);
    assert.equal(decoded.reserve, 7);
    assert.equal(decoded.reserveCharges, 2);
  });

  it('round-trips every kart field to its own value', () => {
    const world = createSimWorld({ courseId: 'track02', seed: 5, seats: [{ kind: 'ai' }, { kind: 'ai' }] });
    const a = world.state.actors[1];
    const k = a.kart;
    const b = a.boost;
    // A different value in every field: two fields sharing a wire key would decode equal.
    Object.assign(k, {
      s: 101.001, x: -2.002, y: 3.003, vy: -4.004, speed: 55.005, reverseSpeed: 6.006,
      yaw: 0.0707, travelYaw: -0.0808, steer: 0.0909, slipAngle: -0.101, pitch: 0.1111, roll: -0.1212,
      hopLift: 0.013, suspension: -0.014, stunRemaining: 0.015, rescues: 16, grounded: false,
      sliding: true, driftDirection: -1, fall: { time: 0.017, exitS: 18.018, respawnS: 19.019 },
      flying: true, skyLane: 1, skyY: 20.02, skyVX: -21.021, skyVY: 22.022, rollTime: 0.023, tumble: 0.024,
      skyBoxKey: 25, skyBoxGot: 26, skyHurt: 0.034, trickCount: 2, trickKind: 3, trickTime: 0.027,
    });
    Object.assign(b, { tier: 2, reserve: 1.028, meter: 0.029, pips: 3, skyChain: 4, skyTier: 1, skyTimer: 0.031 });
    Object.assign(a, { held: 12, charges: 3, reserve: 9, reserveCharges: 1, shield: 0.032, incoming: 'CURSOR INCOMING', finishUs: 33000033 });

    const decoded = decodeWireKart(jsonRoundTrip(encodeWireSnapshot(world)).k[1]);
    const expected = {
      id: 1, s: k.s, x: k.x, y: k.y, vy: k.vy, speed: k.speed, reverseSpeed: k.reverseSpeed,
      yaw: k.yaw, travelYaw: k.travelYaw, steer: k.steer, slipAngle: k.slipAngle, pitch: k.pitch, roll: k.roll,
      hopLift: k.hopLift, suspension: k.suspension, stunRemaining: k.stunRemaining, rescues: 16, grounded: false,
      sliding: true, driftDirection: -1, fall: { time: 0.017, exitS: 18.018, respawnS: 19.019 },
      boostTier: 2, boostReserve: 1.028, boostMeter: 0.029, boostPips: 3,
      held: 12, charges: 3, reserve: 9, reserveCharges: 1, shield: 0.032, incoming: 'CURSOR INCOMING',
      finishUs: 33000033, finish: 33.000033,
      flying: true, skyLane: 1, skyY: k.skyY, skyVX: k.skyVX, skyVY: k.skyVY, rollTime: 0.023, tumble: 0.024,
      skyChain: 4, skyTier: 1, skyTimer: 0.031, skyBoxKey: 25, skyBoxGot: 26, skyHurt: 0.034,
      trickCount: 2, trickKind: 3, trickTime: 0.027,
    };
    assert.deepEqual(Object.keys(decoded).sort(), Object.keys(expected).sort());
    for (const key of Object.keys(expected)) {
      if (typeof expected[key] === 'number') {
        assert.ok(Math.abs(decoded[key] - expected[key]) < 6e-4, `${key}: ${decoded[key]} vs ${expected[key]}`);
      } else {
        assert.deepEqual(decoded[key], expected[key], key);
      }
    }
  });

  it('never writes the same key twice in one record', () => {
    // A repeated key in an object literal is legal JavaScript and silently keeps the last value,
    // so nothing at run time can see it. Read the encoder's source instead.
    const source = readFileSync(new URL('../src/sim/snapshot.js', import.meta.url), 'utf8');
    const start = source.indexOf('export function encodeWireSnapshot');
    const end = source.indexOf('export function decodeWireKart');
    assert.ok(start > 0 && end > start);
    const keysByIndent = new Map();
    for (const line of source.slice(start, end).split('\n')) {
      const m = /^(\s+)([A-Za-z_]\w*):/.exec(line);
      if (!m) continue;
      const indent = m[1].length;
      if (!keysByIndent.has(indent)) keysByIndent.set(indent, []);
      keysByIndent.get(indent).push(m[2]);
    }
    assert.ok(keysByIndent.size >= 3, 'expected the snapshot, kart and object records');
    for (const [indent, keys] of keysByIndent) {
      const repeated = keys.filter((key, i) => keys.indexOf(key) !== i);
      assert.deepEqual(repeated, [], `repeated keys at indent ${indent}`);
    }
  });
});

describe('late input frames', () => {
  const pressed = (tick, controls) => controlsToIntentFrame(tick, { throttle: 1, ...controls });
  const EDGES = BTN_ITEM_PRESSED | BTN_DRIFT_PRESSED | BTN_ITEM_SWAP_PRESSED;

  it('delivers presses from a frame that arrives after its tick was consumed, once', () => {
    const buf = createSeatInputBuffer({ maxHoldTicks: 4 });
    buf.push(pressed(4, {}));
    buf.next(4);
    buf.next(5); // nothing had arrived for tick 5
    assert.equal(buf.push(pressed(5, { itemPressed: true, driftPressed: true, driftHeld: true })), true);

    const at6 = buf.next(6);
    assert.ok(at6.buttons & BTN_ITEM_PRESSED, 'late item press reaches the next consumed tick');
    assert.ok(at6.buttons & BTN_DRIFT_PRESSED, 'late drift press reaches the next consumed tick');
    assert.ok(at6.buttons & BTN_DRIFT_HELD, 'the late frame also refreshes held buttons');
    assert.equal(buf.next(7).buttons & EDGES, 0, 'and is not repeated');
  });

  it('merges a late press into a tick that has its own frame', () => {
    const buf = createSeatInputBuffer();
    buf.next(9);
    buf.push(pressed(9, { itemPressed: true }));
    buf.push(pressed(10, { itemSwapPressed: true, steer: 0.5 }));
    const at10 = buf.next(10);
    assert.ok(at10.buttons & BTN_ITEM_PRESSED);
    assert.ok(at10.buttons & BTN_ITEM_SWAP_PRESSED);
    assert.equal(at10.steer, controlsToIntentFrame(10, { steer: 0.5 }).steer);
    assert.equal(buf.next(11).buttons & EDGES, 0);
  });

  it('does not let a late copy through after the seat disconnected and came back', () => {
    const buf = createSeatInputBuffer();
    const frame = pressed(5, { itemPressed: true });
    buf.push(frame);
    assert.ok(buf.next(5).buttons & BTN_ITEM_PRESSED);
    buf.markDisconnected();
    buf.next(6);
    assert.equal(buf.push(frame), false, 'a frame for a consumed tick is refused once its record is gone');
    buf.push(pressed(7, {}));
    assert.equal(buf.next(7).buttons & EDGES, 0);
  });

  it('never delivers a press twice when redundant copies of a frame arrive', () => {
    const buf = createSeatInputBuffer();
    const frame = pressed(5, { itemPressed: true });
    buf.next(5);
    buf.push(frame);
    buf.push(frame);
    assert.ok(buf.next(6).buttons & BTN_ITEM_PRESSED);
    buf.push(frame); // another copy, after delivery
    assert.equal(buf.next(7).buttons & EDGES, 0);
    buf.push(frame);
    assert.equal(buf.next(8).buttons & EDGES, 0);

    // On time, then repeated late: still once.
    const onTime = pressed(9, { driftPressed: true });
    buf.push(onTime);
    assert.ok(buf.next(9).buttons & BTN_DRIFT_PRESSED);
    buf.push(onTime);
    assert.equal(buf.next(10).buttons & EDGES, 0);
  });

  it('delivers a press added by a later copy of an already consumed frame', () => {
    const buf = createSeatInputBuffer();
    buf.push(pressed(5, { driftPressed: true }));
    assert.ok(buf.next(5).buttons & BTN_DRIFT_PRESSED);
    // A sub-tick press folded into a re-send of tick 5 (120 Hz display, 60 Hz sim).
    buf.push(pressed(5, { driftPressed: true, itemPressed: true }));
    const at6 = buf.next(6);
    assert.ok(at6.buttons & BTN_ITEM_PRESSED, 'the new press is delivered');
    assert.equal(at6.buttons & BTN_DRIFT_PRESSED, 0, 'the old press is not repeated');
  });

  it('does not re-deliver a press when its record was pruned and a copy arrives again', () => {
    const buf = createSeatInputBuffer({ maxHistoryTicks: 4 });
    const frame = pressed(20, { itemPressed: true });
    buf.push(frame);
    assert.ok(buf.next(20).buttons & BTN_ITEM_PRESSED);
    // Enough newer frames to make the buffer drop its record of tick 20.
    for (let t = 21; t <= 40; t++) buf.push(pressed(t, {}));
    buf.push(frame);
    for (let t = 21; t <= 40; t++) assert.equal(buf.next(t).buttons & EDGE_BUTTON_MASK, 0, `tick ${t}`);
  });

  it('gives the same answer when one tick is sampled twice, without repeating presses', () => {
    const buf = createSeatInputBuffer();
    buf.push(pressed(3, { itemPressed: true, steer: -0.25 }));
    const first = buf.next(3);
    const again = buf.next(3);
    assert.ok(first.buttons & BTN_ITEM_PRESSED);
    assert.equal(again.buttons & EDGES, 0);
    assert.equal(again.steer, first.steer);
  });
});

describe('snapshots through JSON', () => {
  function shieldedWorld() {
    const seats = [
      { kind: 'local', car: 'apex' }, { kind: 'ai', car: 'manta' }, { kind: 'ai', car: 'skipper' }, { kind: 'ai', car: 'geep' },
    ];
    const world = createSimWorld({ courseId: 'track01', seed: 808, seats });
    for (let t = 0; t < 200; t++) world.step({ 0: { throttle: 1 } });
    const player = world.state.actors[0];
    player.held = 2; // Bubble Shield
    player.charges = 1;
    world.step({ 0: { throttle: 1, itemPressed: true } });
    assert.ok(player.shield > 0, 'the shield item was used');
    for (let t = 0; t < 20; t++) world.step({ 0: { throttle: 1 } });
    return { world, seats };
  }

  it('keeps an active shield bubble through a JSON round trip of captureSnapshot', () => {
    const { world, seats } = shieldedWorld();
    const bubble = world.play.objects.find((o) => o.type === 'shield');
    assert.ok(bubble, 'the shield bubble is live');
    assert.equal(bubble.life, Infinity);
    assert.ok(world.state.actors[0].shield > 0);

    const restored = createSimWorld({ courseId: 'track01', seed: 1, seats });
    assert.equal(applySnapshot(restored, jsonRoundTrip(captureSnapshot(world))), true);
    assert.equal(stateHash(restored), stateHash(world));
    assert.equal(restored.play.objects.find((o) => o.type === 'shield')?.life, Infinity);

    for (let t = 0; t < 600; t++) {
      world.step({ 0: { throttle: 1, steer: 0.1 } });
      restored.step({ 0: { throttle: 1, steer: 0.1 } });
      if (t % 30 === 0) assert.equal(stateHash(restored), stateHash(world), `diverged ${t} ticks after the restore`);
    }
    assert.equal(stateHash(restored), stateHash(world));
  });

  it('holds no value that JSON cannot carry', () => {
    const { world } = shieldedWorld();
    const snap = captureSnapshot(world);
    // Nothing in a snapshot may be a value JSON cannot carry.
    const bad = [];
    (function walk(value, path) {
      if (typeof value === 'number' && !Number.isFinite(value)) bad.push(path);
      else if (value && typeof value === 'object') for (const key of Object.keys(value)) walk(value[key], `${path}.${key}`);
    })(snap, 'snap');
    assert.deepEqual(bad, []);
  });

  it('keeps Time Trial pickups hidden after a JSON round trip', () => {
    const world = createSimWorld({ courseId: 'track01', seed: 4, mode: 'trial' });
    for (let t = 0; t < 240; t++) world.step({ 0: { throttle: 1 } });
    assert.ok(world.track.pickups.length > 0 && world.track.pickups.every((p) => p.hidden));
    const restored = createSimWorld({ courseId: 'track01', seed: 4, mode: 'trial' });
    applySnapshot(restored, jsonRoundTrip(captureSnapshot(world)));
    for (let t = 0; t < 120; t++) {
      world.step({ 0: { throttle: 1 } });
      restored.step({ 0: { throttle: 1 } });
    }
    assert.ok(restored.track.pickups.every((p) => p.hidden), 'pickups stay hidden in a trial');
    assert.equal(stateHash(restored), stateHash(world));
  });

  it('sends a finite life for a shield bubble in the wire snapshot', () => {
    const { world } = shieldedWorld();
    const wire = jsonRoundTrip(encodeWireSnapshot(world));
    const index = world.play.objects.findIndex((o) => o.type === 'shield');
    assert.equal(wire.o[index].tp, 'shield');
    assert.equal(wire.o[index].lf, -1, 'no expiry is sent as -1, never null');
    for (const o of wire.o) assert.equal(typeof o.lf, 'number');
  });
});
