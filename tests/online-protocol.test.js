import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  BTN_DRIFT_BOOST_PRESSED,
  BTN_DRIFT_HELD,
  BTN_ITEM_PRESSED,
  BTN_ITEM_SWAP_PRESSED,
  controlsToIntentFrame,
} from '../src/sim/intent.js';
import { createSimWorld } from '../src/sim/world.js';
import { captureSnapshot } from '../src/sim/snapshot.js';
import { stateHash } from '../src/sim/hash.js';
import { FLYING_TYPES } from '../src/sim/gameplay-core.js';
import {
  KEYFRAME_CHUNK_BYTES,
  NET_OP,
  NET_VERSION,
  RACER_SIM_VERSION,
  chunkBytes,
  createChunkAssembler,
  createClockSync,
  createInputsBatcher,
  createMatchHost,
  createSeatInputQueue,
  createTickPacer,
  decodeClientInput,
  decodeInputs,
  decodeJson,
  decodeKeyframe,
  decodePong,
  decodeValue,
  encodeClientInput,
  encodeJson,
  encodeKeyframe,
  encodePing,
  encodeValue,
  packFrameA,
  packFrameB,
  restoreSnapshot,
  socketBytes,
  unpackFrame,
} from '../src/net/index.js';

// Deep equality where numbers must be the same bits (Object.is), `tuning` is skipped
// (restored from the car id) and a missing key equals an undefined one.
function exactlyEqual(a, b, path = '') {
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    assert.ok(Object.is(a, b), `${path}: ${String(a)} !== ${String(b)}`);
    return;
  }
  assert.equal(Array.isArray(a), Array.isArray(b), path);
  if (Array.isArray(a)) assert.equal(a.length, b.length, `${path} length`);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.delete('tuning');
  for (const k of keys) exactlyEqual(a[k], b[k], `${path}.${k}`);
}

describe('keyframe codec', () => {
  it('round-trips every value JSON loses: Infinity, -0, NaN, undefined, big integers', () => {
    const value = {
      a: [0, 1, 63, 64, -1, 2 ** 31, 2 ** 53 - 1, -(2 ** 40), 0.5, 0.1, -0, Infinity, -Infinity, NaN, 1e300, 5e-324],
      b: { deep: [null, undefined, true, false, 'text', 'ünïcödé 🏁', ''] },
      c: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { y: 5, x: 6 }],
      empty: {},
      list: [],
    };
    const bytes = encodeValue(value, []);
    exactlyEqual(value, decodeValue(bytes));
    assert.ok('1' in decodeValue(bytes).b.deep && decodeValue(bytes).b.deep[1] === undefined);
  });

  it('rejects truncated or garbage keyframes without throwing', () => {
    const world = createSimWorld({ courseId: 'track01', seed: 3, seats: [{ kind: 'ai' }, { kind: 'ai' }] });
    for (let i = 0; i < 400; i++) world.step({});
    const bytes = encodeKeyframe(captureSnapshot(world));
    assert.ok(decodeKeyframe(bytes));
    for (const cut of [0, 1, 2, 10, bytes.length >> 1, bytes.length - 1]) {
      assert.equal(decodeKeyframe(bytes.subarray(0, cut)), null, `cut at ${cut}`);
    }
    assert.equal(decodeKeyframe(new Uint8Array(64).fill(0xff)), null);
    assert.equal(decodeKeyframe('nope'), null);
  });

  it('restores bit-identically with items in flight, a kart falling, a kart in a Sky Lane and an active shield', () => {
    const config = {
      courseId: 'track01',
      seed: 7,
      finishRule: 'all_racers',
      seats: Array.from({ length: 12 }, () => ({ kind: 'ai' })),
    };
    const world = createSimWorld(config);
    const wanted = {
      'items in flight': (w) => w.play.objects.some((o) => FLYING_TYPES.has(o.type)),
      'kart falling': (w) => w.state.actors.some((a) => a.kart.fall),
      'kart in a Sky Lane': (w) => w.state.actors.some((a) => a.kart.flying),
      'active shield': (w) => w.state.actors.some((a) => a.shield > 0) && w.play.objects.some((o) => o.type === 'shield'),
    };
    const shadows = [];
    const seen = new Set();
    let sawInfinity = false;
    while (!world.state.done && world.state.tick < 60 * 400) {
      for (const [name, test] of Object.entries(wanted)) {
        if (seen.has(name) || !test(world)) continue;
        seen.add(name);
        const snap = captureSnapshot(world);
        const bytes = encodeKeyframe(snap);
        const decoded = decodeKeyframe(bytes);
        exactlyEqual(snap, decoded, name);
        if (JSON.stringify(snap).includes('null') && bytes.length) sawInfinity ||= snap.actors.some((a) => !Number.isFinite(a.pickupDistance)) || snap.gameplay.objects.some((o) => o.life === Infinity);
        const copy = createSimWorld(config);
        assert.ok(restoreSnapshot(copy, decoded));
        assert.equal(stateHash(copy), stateHash(world), `${name}: hash right after restore`);
        shadows.push({ name, copy, until: world.state.tick + 600 });
      }
      world.step({});
      for (const shadow of shadows) {
        if (world.state.tick > shadow.until) continue;
        shadow.copy.step({});
        if (world.state.tick % 20 === 0 || world.state.tick === shadow.until) {
          assert.equal(stateHash(shadow.copy), stateHash(world), `${shadow.name}: tick ${world.state.tick}`);
        }
        if (world.state.tick === shadow.until) {
          exactlyEqual(captureSnapshot(world), captureSnapshot(shadow.copy), `${shadow.name} after 600 ticks`);
          shadow.done = true;
        }
      }
      if (seen.size === 4 && shadows.every((s) => s.done)) break;
    }
    assert.deepEqual([...seen].sort(), Object.keys(wanted).sort(), 'every situation was reached');
    assert.ok(shadows.every((s) => s.done), 'every restored copy ran its 600 ticks');
    assert.ok(sawInfinity, 'a snapshot with an infinite value was covered');
  });

  it('keeps keyframes small and splits them into messages under the 8,192-byte cap', () => {
    const sizes = {};
    for (const seatCount of [6, 12]) {
      const world = createSimWorld({
        courseId: 'track02',
        seed: 11,
        finishRule: 'all_racers',
        seats: Array.from({ length: seatCount }, () => ({ kind: 'ai' })),
      });
      let largest = 0;
      const assembler = createChunkAssembler();
      for (let i = 0; i < 4200; i++) {
        world.step({});
        if (i % 150 !== 0) continue;
        const payload = encodeKeyframe(captureSnapshot(world));
        largest = Math.max(largest, payload.length);
        const chunks = chunkBytes(payload, i & 0xffff);
        let whole = null;
        for (const chunk of chunks) {
          assert.ok(chunk.length <= KEYFRAME_CHUNK_BYTES);
          assert.ok(socketBytes(chunk.length, 'up', NET_OP.KEYFRAME) < 8192, 'fits a client-to-server message');
          assert.equal(whole, null);
          whole = assembler.push(chunk);
        }
        assert.deepEqual(whole, payload);
      }
      sizes[seatCount] = largest;
    }
    assert.ok(sizes[6] < 9000, `6-kart keyframe ${sizes[6]} B`);
    assert.ok(sizes[12] < 15000, `12-kart keyframe ${sizes[12]} B`);
  });
});

describe('wire codecs', () => {
  it('packs an input frame into two words and back without loss', () => {
    const frame = controlsToIntentFrame(77, { steer: -0.8123, throttle: 1, brake: 0.31, driftHeld: true, itemPressed: true, itemSwapPressed: true, pitch: -0.6 });
    const back = unpackFrame(packFrameA(frame), packFrameB(frame), 77);
    assert.deepEqual(back, frame);
  });

  it('accepts only well-formed client input packets', () => {
    const frames = [3, 2, 1].map((t) => controlsToIntentFrame(t, { throttle: 1, steer: t / 10 }));
    const bytes = encodeClientInput(4, frames);
    assert.equal(bytes.length, 2 + 3 * 12);
    const decoded = decodeClientInput(bytes);
    assert.equal(decoded.seat, 4);
    assert.deepEqual(decoded.frames, frames);
    assert.equal(decodeClientInput(bytes.subarray(0, bytes.length - 1)), null, 'short');
    assert.equal(decodeClientInput(new Uint8Array([...bytes, 0])), null, 'long');
    const zeroCount = bytes.slice();
    zeroCount[1] = 0;
    assert.equal(decodeClientInput(zeroCount), null);
    const tooMany = bytes.slice();
    tooMany[1] = 9;
    assert.equal(decodeClientInput(tooMany), null);
  });

  it('relays inputs so a held input costs one bit, across batches, with the hash riding along', () => {
    const batcher = createInputsBatcher(12);
    const previous = [new Uint32Array(12), new Uint32Array(12)];
    const sent = [];
    const got = [];
    const frameFor = (tick, seat) => controlsToIntentFrame(tick, {
      throttle: 1,
      steer: seat === 5 ? Math.sin(tick) : 0.25, // seat 5 changes every tick, the others hold
      itemPressed: seat === 2 && tick === 7,
    });
    let total = 0;
    for (let tick = 0; tick < 12; tick++) {
      batcher.beginTick(tick, (1 << 2) | (1 << 5) | (1 << 9));
      for (const seat of [2, 5, 9]) {
        const f = frameFor(tick, seat);
        batcher.add(seat, packFrameA(f), packFrameB(f), seat === 9 ? -3 : 4);
        sent.push([tick, seat, packFrameA(f), packFrameB(f)]);
      }
      if (tick % 3 === 2) {
        const bytes = batcher.flush(tick === 11 ? 12 : -1, tick === 11 ? '0123456789abcdef' : null);
        total += bytes.length;
        const margins = {};
        const info = decodeInputs(
          bytes,
          (seat) => [previous[0][seat], previous[1][seat]],
          (t, seat, a, b) => {
            got.push([t, seat, a, b]);
            previous[0][seat] = a;
            previous[1][seat] = b;
          },
          (seat, margin) => { margins[seat] = margin; },
        );
        assert.equal(info.startTick, tick - 2);
        assert.equal(info.count, 3);
        assert.deepEqual(margins, { 2: 4, 5: 4, 9: -3 });
        assert.equal(info.hash, tick === 11 ? '0123456789abcdef' : null);
        if (tick === 11) assert.equal(info.hashTick, 12);
      }
    }
    const byTick = (x, y) => x[0] - y[0] || x[1] - y[1];
    assert.deepEqual(got.sort(byTick), sent.sort(byTick));
    // Seat 9 never changes after its first frame, seat 2 changes for one press and back.
    assert.ok(total < 4 * 8 + 12 + 12 * 8 + 3 * 8 + 4 * 3 * 2 + 16, `batches stay small (${total} B)`);
  });

  it('counts socket bytes the way the Nakama envelope really costs them', () => {
    const matchId = 'a'.repeat(36) + '.nakama1';
    for (const n of [0, 1, 38, 200, 4096]) {
      const data = Buffer.alloc(n).toString('base64');
      const up = JSON.stringify({ match_data_send: { match_id: matchId, op_code: '5', data, reliable: true } });
      const down = JSON.stringify({ match_data: { match_id: matchId, op_code: '14', data, reliable: true } });
      assert.equal(socketBytes(n, 'up', 5, matchId.length), up.length + (up.length < 126 ? 2 : 4) + 4);
      assert.equal(socketBytes(n, 'down', 14, matchId.length), down.length + (down.length < 126 ? 2 : 4));
    }
  });
});

describe('host input queue: every press exactly once', () => {
  const frame = (tick, controls) => controlsToIntentFrame(tick, controls);
  const out = { a: 0, b: 0, margin: 0 };
  const buttonsOf = (o) => unpackFrame(o.a, o.b, 0).buttons;

  it('uses on-time inputs as sent and reports how early they arrived', () => {
    const q = createSeatInputQueue();
    assert.equal(q.push(frame(10, { throttle: 1, steer: 0.5, driftHeld: true, itemPressed: true }), 8), 'ok');
    assert.equal(q.push(frame(11, { throttle: 1, steer: 0.5, driftHeld: true }), 8), 'ok');
    q.take(10, out);
    assert.equal(out.margin, 1);
    assert.ok(buttonsOf(out) & BTN_ITEM_PRESSED);
    q.take(11, out);
    assert.equal(buttonsOf(out) & BTN_ITEM_PRESSED, 0, 'a press is not repeated');
    assert.ok(buttonsOf(out) & BTN_DRIFT_HELD);
  });

  it('ignores repeated copies of a frame, so redundancy never doubles a press', () => {
    const q = createSeatInputQueue();
    const f = frame(5, { itemPressed: true });
    assert.equal(q.push(f, 3), 'ok');
    assert.equal(q.push(f, 3), 'duplicate');
    assert.equal(q.push(frame(4, { itemPressed: true }), 3), 'duplicate', 'older than something already seen');
    let presses = 0;
    for (let t = 3; t < 12; t++) {
      q.take(t, out);
      if (buttonsOf(out) & BTN_ITEM_PRESSED) presses++;
    }
    assert.equal(presses, 1);
  });

  it('keeps presses from late frames and delivers them one per tick', () => {
    const q = createSeatInputQueue({ maxHoldTicks: 30 });
    q.push(frame(20, { throttle: 1, steer: -1 }), 20);
    q.take(20, out);
    // Ticks 21..25 run with nothing new (a stall): the last input is held, no presses.
    for (let t = 21; t <= 25; t++) {
      q.take(t, out);
      assert.equal(out.margin, 20 - t);
      assert.equal(unpackFrame(out.a, out.b, t).steer, -32767);
      assert.equal(buttonsOf(out) & (BTN_ITEM_PRESSED | BTN_ITEM_SWAP_PRESSED | BTN_DRIFT_BOOST_PRESSED), 0);
    }
    // The stalled frames land together: two item presses, a swap and a boost press, all late.
    assert.equal(q.push(frame(21, { throttle: 1, itemPressed: true }), 26), 'late');
    assert.equal(q.push(frame(22, { throttle: 1, itemSwapPressed: true }), 26), 'late');
    assert.equal(q.push(frame(23, { throttle: 1, itemPressed: true, driftBoostPressed: true }), 26), 'late');
    assert.equal(q.push(frame(24, { throttle: 1, steer: 0.4 }), 26), 'late');
    const seen = { item: 0, swap: 0, boost: 0 };
    for (let t = 26; t < 34; t++) {
      q.take(t, out);
      const b = buttonsOf(out);
      if (b & BTN_ITEM_PRESSED) seen.item++;
      if (b & BTN_ITEM_SWAP_PRESSED) seen.swap++;
      if (b & BTN_DRIFT_BOOST_PRESSED) seen.boost++;
      assert.ok(unpackFrame(out.a, out.b, t).steer > 0, 'the newest late frame becomes the held input');
    }
    assert.deepEqual(seen, { item: 2, swap: 1, boost: 1 });
  });

  it('rejects inputs outside the tick window and coasts when starved', () => {
    const q = createSeatInputQueue({ maxLeadTicks: 60, maxLateTicks: 120, maxHoldTicks: 30 });
    assert.equal(q.push(frame(500, { throttle: 1 }), 100), 'too_far');
    assert.equal(q.push(frame(100, { throttle: 1, steer: 1 }), 100), 'ok');
    q.take(100, out);
    q.take(131, out);
    assert.equal(out.a, 0, 'no input for more than maxHoldTicks: neutral');
    assert.equal(q.push(frame(101, { itemPressed: true }), 400), 'too_old');
    q.take(400, out);
    assert.equal(buttonsOf(out) & BTN_ITEM_PRESSED, 0, 'a press two seconds stale is dropped');
  });
});

function createHostRig(options = {}) {
  const sent = [];
  const host = createMatchHost({
    courseId: 'track01',
    seed: 99,
    seatCount: 4,
    startDelayTicks: 30,
    ...options,
    send: (playerId, op, data) => sent.push({ to: playerId, op, data }),
  });
  const hello = (id, extra = {}) => host.receive(id, NET_OP.HELLO, encodeJson({ v: NET_VERSION, sim: RACER_SIM_VERSION, car: 'apex', driver: 'sproto', ...extra }));
  const last = (id, op) => {
    for (let i = sent.length - 1; i >= 0; i--) {
      if (sent[i].to === id && sent[i].op === op) return sent[i];
    }
    return null;
  };
  const count = (id, op) => sent.filter((m) => m.to === id && m.op === op).length;
  return { host, sent, hello, last, count };
}

describe('match host', () => {
  it('runs lobby, ready and a shared start tick, and fills empty seats with AI', () => {
    const { host, hello, last } = createHostRig();
    host.join('ann');
    host.join('bob');
    hello('ann');
    hello('bob', { car: 'gecko' });
    assert.equal(host.phase, 'lobby');
    assert.equal(decodeJson(last('ann', NET_OP.WELCOME).data).phase, 'lobby');
    assert.equal(decodeJson(last('bob', NET_OP.LOBBY).data).players.length, 2);

    host.receive('ann', NET_OP.READY, encodeJson({ ready: true }));
    assert.equal(host.phase, 'lobby', 'waits for everyone');
    for (let i = 0; i < 5; i++) host.tick();
    host.receive('bob', NET_OP.READY, encodeJson({ ready: true }));
    assert.equal(host.phase, 'starting');

    const startAnn = decodeJson(last('ann', NET_OP.START).data);
    const startBob = decodeJson(last('bob', NET_OP.START).data);
    assert.equal(startAnn.race.startTick, startBob.race.startTick);
    assert.equal(startAnn.race.startTick, host.serverTick + 30);
    assert.equal(startAnn.you, 0);
    assert.equal(startBob.you, 1);
    assert.deepEqual(startAnn.race.seats.map((s) => s.kind), ['remote', 'remote', 'ai', 'ai']);
    assert.equal(startAnn.race.seats[1].car, 'gecko');
    assert.deepEqual(startAnn.race.seats.map((s) => s.gridIndex).sort(), [0, 1, 2, 3]);

    while (host.serverTick < startAnn.race.startTick) {
      host.tick();
      assert.equal(host.raceTick, 0, 'the race does not move before the start tick');
    }
    host.tick();
    assert.equal(host.phase, 'race');
    assert.equal(host.raceTick, 1);
  });

  it('refuses wrong versions, bad cars and a full room', () => {
    const { host, hello, last } = createHostRig({ seatCount: 2, maxHumans: 1 });
    host.join('ann');
    host.receive('ann', NET_OP.HELLO, encodeJson({ v: 'old', sim: RACER_SIM_VERSION, car: 'apex', driver: 'sproto' }));
    assert.equal(decodeJson(last('ann', NET_OP.ERROR).data).error, 'version_mismatch');
    host.receive('ann', NET_OP.HELLO, encodeJson({ v: NET_VERSION, sim: 'other-build', car: 'apex', driver: 'sproto' }));
    assert.equal(decodeJson(last('ann', NET_OP.ERROR).data).error, 'sim_version_mismatch');
    hello('ann', { car: 'not-a-car' });
    assert.equal(decodeJson(last('ann', NET_OP.ERROR).data).error, 'invalid_car');
    hello('ann');
    host.join('bob');
    hello('bob');
    assert.equal(decodeJson(last('bob', NET_OP.ERROR).data).error, 'room_full');
    assert.equal(host.receive('nobody', NET_OP.READY, encodeJson({ ready: true })), false, 'unknown sender');
  });

  it('validates inputs: sender must own the seat, ticks must be in range, floods are dropped', () => {
    const { host, hello } = createHostRig({ inputBurst: 20, inputRatePerSecond: 60 });
    host.join('ann');
    host.join('bob');
    hello('ann');
    hello('bob');
    host.receive('ann', NET_OP.READY, encodeJson({ ready: true }));
    host.receive('bob', NET_OP.READY, encodeJson({ ready: true }));
    for (let i = 0; i < 40; i++) host.tick();
    assert.equal(host.phase, 'race');
    const now = host.raceTick;

    host.receive('bob', NET_OP.INPUT, encodeClientInput(0, [controlsToIntentFrame(now + 2, { itemPressed: true })]));
    assert.equal(host.stats.rejectedSeat, 1, "bob cannot drive ann's seat");
    host.receive('ann', NET_OP.INPUT, new Uint8Array([0, 1, 2, 3]));
    assert.equal(host.stats.rejectedMalformed, 1);
    host.receive('ann', NET_OP.INPUT, encodeClientInput(0, [controlsToIntentFrame(now + 5000, { throttle: 1 })]));
    assert.equal(host.stats.rejectedWindow, 1, 'too far in the future');

    const before = host.stats.inputFrames;
    for (let i = 0; i < 200; i++) {
      host.receive('ann', NET_OP.INPUT, encodeClientInput(0, [controlsToIntentFrame(now + 3 + i, { throttle: 1 })]));
    }
    assert.ok(host.stats.rejectedRate >= 150, 'the flood is cut off');
    assert.ok(host.stats.inputFrames - before <= 30);
    for (let i = 0; i < 120; i++) host.tick();
    assert.equal(host.phase, 'race', 'the race carries on');
  });

  it('answers pings with the server tick and limits how often a keyframe can be requested', () => {
    const { host, hello, last, count } = createHostRig();
    host.join('ann');
    hello('ann');
    for (let i = 0; i < 7; i++) host.tick();
    host.receive('ann', NET_OP.PING, encodePing(123456));
    assert.deepEqual(decodePong(last('ann', NET_OP.PONG).data), { clientMs: 123456, serverTick: 7 });
    host.receive('ann', NET_OP.READY, encodeJson({ ready: true }));
    for (let i = 0; i < 200; i++) host.tick();
    const request = new Uint8Array([4, 0, 0, 0, 0]);
    assert.equal(host.receive('ann', NET_OP.KEYFRAME_REQ, request), true);
    const first = count('ann', NET_OP.KEYFRAME);
    assert.ok(first >= 1);
    host.receive('ann', NET_OP.KEYFRAME_REQ, request);
    assert.equal(count('ann', NET_OP.KEYFRAME), first, 'too soon: held back');
  });

  it('never throws on hostile messages: every bad one is dropped and counted', () => {
    const { host, hello, last } = createHostRig();
    host.join('ann');
    host.join('eve');
    hello('ann');

    // The reported crash: a version field that cannot be turned into a string.
    assert.doesNotThrow(() => host.receive('eve', NET_OP.HELLO, '{"v":{"toString":1},"sim":{"valueOf":2}}'));
    assert.equal(decodeJson(last('eve', NET_OP.ERROR).data).error, 'version_mismatch');

    let seed = 12345;
    const random = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
    const pick = (list) => list[Math.floor(random() * list.length)];
    const nasty = [
      null, true, 0, -1, 1e308, 'x', '', [], {}, { toString: 1 }, { valueOf: 1 }, { length: -5 }, [[[[]]]],
      { __proto__: null }, 'a'.repeat(5000), { car: { toString: 1 }, driver: [] }, -0,
    ];
    const junkJson = () => {
      const o = {};
      for (const key of ['v', 'sim', 'car', 'driver', 'name', 'ready', 'seat', 'tick', 'constructor', 'toString']) {
        if (random() < 0.6) o[key] = pick(nasty);
      }
      return random() < 0.1 ? JSON.stringify(pick(nasty)) ?? 'null' : JSON.stringify(o);
    };
    const junkBytes = () => {
      const bytes = new Uint8Array(Math.floor(random() * 80));
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(random() * 256);
      return bytes;
    };
    const payloads = [
      junkJson, junkBytes,
      () => '{', () => '', () => 'null', () => '[1,2,3]', () => '"str"', () => '{"v":2,"sim":null}',
      () => undefined, () => null, () => 42, () => ({ length: 3 }), () => new ArrayBuffer(7), () => new Uint8Array(0),
      () => `{"v":"${NET_VERSION}","sim":"${RACER_SIM_VERSION}","car":{"toString":1},"driver":"sproto"}`,
      () => `{"v":"${NET_VERSION}","sim":"${RACER_SIM_VERSION}","car":"apex","driver":"sproto","name":{"slice":1}}`,
    ];
    const ops = [...Object.values(NET_OP), 0, -1, 255, 1e9, NaN, 'INPUT', null, undefined, {}];
    const senders = ['ann', 'eve', 'nobody', null, undefined, 7, {}];

    const blast = (rounds) => {
      for (let i = 0; i < rounds; i++) {
        const sender = pick(senders);
        const op = pick(ops);
        const data = pick(payloads)();
        assert.doesNotThrow(() => host.receive(sender, op, data), `receive(${String(sender)}, ${String(op)}, …) threw`);
        if (i % 5 === 0) host.tick();
      }
    };
    blast(1500); // lobby
    assert.doesNotThrow(() => host.join('odd', { name: { toString: 1 } }));
    assert.doesNotThrow(() => host.join('odd2', null));
    host.receive('ann', NET_OP.READY, encodeJson({ ready: true }));
    for (let i = 0; i < 60 && host.phase !== 'race'; i++) host.tick();
    if (host.phase !== 'race') {
      // The fuzz may have readied or unreadied someone; force the start.
      host.start();
      for (let i = 0; i < 60; i++) host.tick();
    }
    assert.equal(host.phase, 'race');
    const before = host.raceTick;
    blast(2500); // racing
    assert.equal(host.phase, 'race');
    assert.equal(host.raceTick, before + 500, 'the race kept ticking through the flood');
    assert.ok(host.stats.rejectedRate + host.stats.rejectedMalformed + host.stats.rejectedSeat > 100, 'bad messages were counted');
    assert.equal(host.stats.rejectedThrown, 0, 'nothing relied on the catch-all');
  });

  it('limits keyframes per player even when HELLO is repeated, and still delivers the one that is owed', () => {
    const { host, hello, count } = createHostRig({ controlRatePerSecond: 600, controlBurst: 600 });
    host.join('ann');
    hello('ann');
    host.receive('ann', NET_OP.READY, encodeJson({ ready: true }));
    for (let i = 0; i < 100; i++) host.tick();
    assert.equal(host.phase, 'race');
    const sentBefore = host.stats.keyframesSent;
    // Ten seconds of a client saying HELLO four times a tick.
    for (let i = 0; i < 600; i++) {
      for (let j = 0; j < 4; j++) hello('ann');
      host.tick();
    }
    const sent = host.stats.keyframesSent - sentBefore;
    assert.ok(sent >= 9 && sent <= 11, `one keyframe a second at most (${sent} in 10 s)`);

    // A request inside the minimum interval is not dropped: it is answered when allowed.
    for (let i = 0; i < 120; i++) host.tick();
    const request = new Uint8Array([4, 0, 0, 0, 0]);
    host.receive('ann', NET_OP.KEYFRAME_REQ, request);
    const chunksAfterFirst = count('ann', NET_OP.KEYFRAME);
    for (let i = 0; i < 5; i++) host.tick();
    host.receive('ann', NET_OP.KEYFRAME_REQ, request);
    assert.equal(count('ann', NET_OP.KEYFRAME), chunksAfterFirst, 'not yet');
    for (let i = 0; i < 70; i++) host.tick();
    assert.ok(count('ann', NET_OP.KEYFRAME) > chunksAfterFirst, 'the owed keyframe arrived');
    const settled = count('ann', NET_OP.KEYFRAME);
    for (let i = 0; i < 200; i++) host.tick();
    assert.equal(count('ann', NET_OP.KEYFRAME), settled, 'and only once');

    // Leaving and coming straight back does not reset the limit for that seat.
    const sentBeforeCycle = host.stats.keyframesSent;
    for (let i = 0; i < 300; i++) {
      host.leave('ann');
      host.join('ann');
      hello('ann');
      host.tick();
    }
    assert.ok(host.stats.keyframesSent - sentBeforeCycle <= 6, 'reconnect cycling is limited too');
  });

  it('is deterministic: the same joins and inputs give the same race', () => {
    const run = () => {
      const { host, hello } = createHostRig();
      host.join('ann');
      hello('ann');
      host.receive('ann', NET_OP.READY, encodeJson({ ready: true }));
      for (let i = 0; i < 700; i++) {
        if (host.phase === 'race') {
          const t = host.raceTick + 3;
          host.receive('ann', NET_OP.INPUT, encodeClientInput(0, [controlsToIntentFrame(t, { throttle: 1, steer: Math.sin(t / 40) * 0.4, itemPressed: t % 90 === 0 })]));
        }
        host.tick();
      }
      return stateHash(host.world);
    };
    assert.equal(run(), run());
  });
});

describe('server-side files stay bundle-safe for Goja', () => {
  it('uses no DOM, timers, wall clock, text codecs, Math.random or non-deterministic Math', () => {
    const banned = [
      [/\bdocument\.|\bwindow\./, 'DOM'],
      [/\bsetTimeout\b|\bsetInterval\b|\brequestAnimationFrame\b/, 'timers'],
      [/\bDate\.now\b|\bnew Date\b|\bperformance\b/, 'wall clock'],
      [/\bTextEncoder\b|\bTextDecoder\b|\bBuffer\b|\batob\b|\bbtoa\b/, 'text codecs'],
      [/\bMath\.(random|sin|cos|tan|atan|atan2|exp|pow|hypot)\b/, 'Math.random or transcendental Math'],
    ];
    for (const file of ['match-host.js', 'wire.js', 'keyframe.js', 'restore.js']) {
      const source = readFileSync(new URL(`../src/net/${file}`, import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/\s\/\/ .*$/gm, '');
      for (const [pattern, label] of banned) {
        assert.ok(!pattern.test(source), `${file} must not use ${label}`);
      }
    }
  });
});

describe('clock sync and tick pacing', () => {
  it('estimates the server tick and a lead that grows with latency', () => {
    const tickMs = 1000 / 60;
    const leads = [];
    for (const oneWay of [20, 60, 120, 250]) {
      const clock = createClockSync();
      let seedState = oneWay * 7919;
      const random = () => ((seedState = (seedState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let now = 0; now < 12000; now += 10) {
        const token = clock.pingDue(now);
        if (token < 0) continue;
        const up = oneWay + random() * 12;
        const down = oneWay + random() * 12;
        const serverTick = Math.floor((now + up) / tickMs);
        clock.onPong(token, serverTick, now + up + down);
      }
      assert.ok(clock.synced);
      const truth = 12000 / tickMs;
      assert.ok(Math.abs(clock.serverTickAt(12000) - truth) < 1.6, `server tick within 1.6 ticks at ${oneWay} ms`);
      assert.ok(Math.abs(clock.rttMs - (2 * oneWay + 12)) < 14);
      const lead = clock.leadTicks();
      assert.ok(lead >= Math.ceil(oneWay / tickMs) + 2, `lead ${lead} covers the trip at ${oneWay} ms`);
      assert.ok(lead <= Math.ceil((oneWay + 12) / tickMs) + 6, `lead ${lead} is not wasteful at ${oneWay} ms`);
      leads.push(lead);
    }
    assert.ok(leads[0] < leads[1] && leads[1] < leads[2] && leads[2] < leads[3]);
  });

  it('grows the lead when the server reports late inputs, shrinks it when early, and shrugs off a stall', () => {
    const clock = createClockSync();
    clock.onPong(clock.pingDue(0), 0, 80);
    const base = clock.leadTicks();
    clock.onMargin(-1, 1000);
    assert.equal(clock.leadTicks(), base + 2);
    clock.onMargin(-1, 1010);
    assert.equal(clock.leadTicks(), base + 2, 'one late spell is counted once');
    clock.onMargin(-30, 5000);
    assert.equal(clock.leadTicks(), base + 2, 'a stall does not inflate the lead');
    for (let i = 0; i < 200; i++) clock.onMargin(8, 6000 + i * 33);
    assert.ok(clock.leadTicks() < base + 2, 'a roomy margin gives the delay back');
  });

  it('skews the tick rate by a few percent for small errors and only jumps for large ones', () => {
    const pacer = createTickPacer();
    const tickMs = 1000 / 60;
    let present = 0;
    let target = 3; // three ticks ahead of the local clock
    let maxRate = 0;
    for (let frame = 0; frame < 600; frame++) {
      const steps = pacer.advance(tickMs, target, present);
      assert.ok(steps <= 2, 'never more than an extra tick in a frame');
      present += steps;
      target += 1;
      maxRate = Math.max(maxRate, pacer.rate);
    }
    assert.ok(maxRate <= 1.04 + 1e-9 && maxRate > 1.01);
    assert.ok(Math.abs(target - pacer.clock) < 0.5, 'converged');

    // The tab was hidden for two seconds: the target is 120 ticks away.
    target += 120;
    let frames = 0;
    while (target - present > 2 && frames < 100) {
      present += pacer.advance(tickMs, target, present);
      target += 1;
      frames++;
    }
    assert.ok(frames <= 14, `caught up in ${frames} frames`);

    // Far ahead: wait rather than run backwards.
    const waiting = createTickPacer();
    waiting.reset(100);
    assert.equal(waiting.advance(tickMs, 50, 100), 0);
    assert.equal(waiting.rate, 0);
  });
});
