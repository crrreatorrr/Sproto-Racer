import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ITEMS, PICKUP_SPIN_SECONDS, hasItemRoom, promoteReserve, settlePickup, startPickup, swapItems } from '../src/items.js';
import { CIRCUITS } from '../src/sim/track-core.js';
import { createSimWorld } from '../src/sim/world.js';
import { applySnapshot, captureSnapshot, decodeWireKart, encodeWireSnapshot } from '../src/sim/snapshot.js';
import { stateHash } from '../src/sim/hash.js';
import {
  BTN_ITEM_PRESSED,
  BTN_ITEM_SWAP_PRESSED,
  controlsToIntentFrame,
  decodeIntentFrame,
  encodeIntentFrame,
  intentFrameToControls,
  intentFrameToTuple,
  tupleToIntentFrame,
} from '../src/sim/intent.js';
import { createRemoteInputBuffer } from '../src/net/index.js';

const item = (name) => ITEMS.findIndex((it) => it.name === name);
const SODA = item('Soda Turbo');
const BUBBLE = item('Bubble Wrap');
const TRIPLE = item('Triple Soda');

const racer = (extra = {}) => ({
  kart: { s: 100 },
  finish: null,
  held: null,
  charges: 0,
  reserve: null,
  reserveCharges: 0,
  roulette: null,
  ...extra,
});

// A race world with the countdown run out and both seats driven by the test.
function raceWorld() {
  const world = createSimWorld({
    course: CIRCUITS[0],
    seed: 7,
    seats: [{ kind: 'local', gridIndex: 0 }, { kind: 'local', gridIndex: 1 }],
  });
  while (world.state.countdown > 0) world.step({ 0: {}, 1: {} });
  return world;
}

describe('two item slots', () => {
  it('a first pickup fills the front slot and a second pickup fills the second slot', () => {
    const a = racer();
    const pack = [a, racer({ kart: { s: 300 } })];
    startPickup(a, pack, 0, () => 0);
    settlePickup(a, PICKUP_SPIN_SECONDS);
    assert.equal(a.held, 0);
    assert.equal(a.reserve, null);
    assert.ok(hasItemRoom(a));

    startPickup(a, pack, 10, () => 0);
    assert.ok(a.roulette, 'a kart holding one item still rolls for a second');
    settlePickup(a, 10 + PICKUP_SPIN_SECONDS);
    assert.equal(a.held, 0);
    assert.equal(a.reserve, 0);
    assert.equal(hasItemRoom(a), false);

    startPickup(a, pack, 20, () => 0);
    assert.equal(a.roulette, null, 'a full kart draws nothing');
  });

  it('swap trades the two items and their charges', () => {
    const a = racer({ held: TRIPLE, charges: 2, reserve: BUBBLE, reserveCharges: 1 });
    assert.equal(swapItems(a), true);
    assert.deepEqual([a.held, a.charges, a.reserve, a.reserveCharges], [BUBBLE, 1, TRIPLE, 2]);
    assert.equal(swapItems(a), true);
    assert.deepEqual([a.held, a.charges, a.reserve, a.reserveCharges], [TRIPLE, 2, BUBBLE, 1]);
  });

  it('swap does nothing with fewer than two items or an unlimited inventory', () => {
    const one = racer({ held: SODA, charges: 1 });
    assert.equal(swapItems(one), false);
    assert.deepEqual([one.held, one.reserve], [SODA, null]);
    const unlimited = racer({ held: SODA, charges: 1, reserve: BUBBLE, reserveCharges: 1, unlimited: true });
    assert.equal(swapItems(unlimited), false);
    assert.equal(unlimited.held, SODA);
  });

  it('the second item moves up once the front slot empties', () => {
    const a = racer({ reserve: BUBBLE, reserveCharges: 1 });
    promoteReserve(a);
    assert.deepEqual([a.held, a.charges, a.reserve, a.reserveCharges], [BUBBLE, 1, null, 0]);
  });

  it('in a race, swapping then using fires the second item and leaves the first', () => {
    const world = raceWorld();
    const a = world.state.actors[0];
    Object.assign(a, { held: SODA, charges: 1, reserve: BUBBLE, reserveCharges: 1 });

    world.step({ 0: controlsToIntentFrame(world.state.tick, { throttle: 1, itemSwapPressed: true }), 1: {} });
    assert.deepEqual([a.held, a.reserve], [BUBBLE, SODA]);

    world.step({ 0: controlsToIntentFrame(world.state.tick, { throttle: 1, itemPressed: true }), 1: {} });
    assert.ok(a.shield > 0, 'Bubble Wrap was used');
    assert.deepEqual([a.held, a.reserve], [SODA, null], 'Soda Turbo moved to the front');
  });

  it('a Triple Soda keeps its charges through swaps and only frees its slot on the last one', () => {
    const world = raceWorld();
    const a = world.state.actors[0];
    Object.assign(a, { held: TRIPLE, charges: 3, reserve: SODA, reserveCharges: 1 });
    world.step({ 0: { throttle: 1, itemPressed: true }, 1: {} });
    assert.deepEqual([a.held, a.charges, a.reserve], [TRIPLE, 2, SODA]);
    world.step({ 0: { throttle: 1, itemSwapPressed: true }, 1: {} });
    world.step({ 0: { throttle: 1, itemSwapPressed: true }, 1: {} });
    assert.deepEqual([a.held, a.charges, a.reserve, a.reserveCharges], [TRIPLE, 2, SODA, 1]);
  });

  it('snapshots and the state hash carry the second slot', () => {
    const world = raceWorld();
    const a = world.state.actors[0];
    Object.assign(a, { held: SODA, charges: 1, reserve: TRIPLE, reserveCharges: 3 });
    const before = stateHash(world);

    const other = raceWorld();
    assert.equal(applySnapshot(other, captureSnapshot(world)), true);
    assert.deepEqual([other.state.actors[0].reserve, other.state.actors[0].reserveCharges], [TRIPLE, 3]);
    assert.equal(stateHash(other), before);

    a.reserve = null;
    a.reserveCharges = 0;
    assert.notEqual(stateHash(world), before, 'the hash sees the second slot');

    a.reserve = BUBBLE;
    a.reserveCharges = 1;
    const wire = encodeWireSnapshot(world);
    const kart = decodeWireKart(wire.k[0]);
    assert.deepEqual([kart.reserve, kart.reserveCharges], [BUBBLE, 1]);
  });
});

describe('swap button on the wire', () => {
  it('survives binary and tuple encoding alongside the other buttons', () => {
    const frame = controlsToIntentFrame(42, { throttle: 1, itemPressed: true, itemSwapPressed: true, pitch: -1 });
    assert.ok(frame.buttons & BTN_ITEM_SWAP_PRESSED);
    const decoded = decodeIntentFrame(encodeIntentFrame(frame));
    assert.equal(decoded.buttons, frame.buttons);
    assert.deepEqual(tupleToIntentFrame(intentFrameToTuple(frame)), frame);
    const controls = intentFrameToControls(decoded);
    assert.equal(controls.itemSwapPressed, true);
    assert.equal(controls.itemPressed, true);
    assert.equal(controls.pitch, -1);
  });

  it('carries a swap press across a skipped tick exactly once', () => {
    const buf = createRemoteInputBuffer({ seatCount: 2, maxHoldTicks: 4 });
    buf.push(1, controlsToIntentFrame(5, { throttle: 1, itemSwapPressed: true }));
    assert.ok(buf.seat(1).next(6).buttons & BTN_ITEM_SWAP_PRESSED);
    assert.equal(buf.seat(1).next(7).buttons & (BTN_ITEM_SWAP_PRESSED | BTN_ITEM_PRESSED), 0);
  });
});
