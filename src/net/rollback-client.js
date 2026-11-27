// Rollback client for online races (input relay with rollback).
//
// The client runs the whole race itself, a few ticks ahead of the server:
//
//   present   how many ticks this client has simulated (what is on screen)
//   frontier  the server has told us every human seat's input for all ticks below this
//
// Ticks below the frontier are final. Ticks from the frontier to the present are a
// prediction: the local player's own recorded inputs, and for every other human the last
// input the server reported, held. When the server's inputs for a tick arrive and differ
// from what was predicted, the client restores a saved state from at or before that tick
// and re-simulates up to the present. When they match, nothing is re-simulated: the
// prediction already was the truth.
//
// The saved states are `captureSnapshot` checkpoints taken as the simulation runs. The
// newest checkpoint at or below the frontier is the confirmed state.
//
// The client never trusts itself: every `hashIntervalTicks` it compares its state hash
// with the server's, and asks for a keyframe (the full state) on a mismatch, when it has
// fallen too far behind, or when it joins a race in progress.

import { createSimWorld } from '../sim/world.js';
import { captureSnapshot } from '../sim/snapshot.js';
import { stateHash } from '../sim/hash.js';
import { controlsToIntentFrame } from '../sim/intent.js';
import { MAX_SEATS_LIMIT, NET_VERSION, RACER_SIM_VERSION } from './protocol.js';
import { createPredictionSmoother } from './predictor.js';
import { createClockSync, createTickPacer } from './clock-sync.js';
import { createChunkAssembler, decodeKeyframe } from './keyframe.js';
import { restoreSnapshot } from './restore.js';
import {
  KEYFRAME_REASON,
  NET_OP,
  SEAT_KIND_HUMAN,
  asBytes,
  decodeHash,
  decodeInputs,
  decodeJson,
  decodeKeyframePayload,
  decodePong,
  decodeSeat,
  encodeClientInput,
  encodeJson,
  encodeKeyframeRequest,
  encodePing,
  packFrameA,
  packFrameB,
  socketBytes,
  stripEdgesB,
  unpackFrame,
} from './wire.js';

export const CLIENT_DEFAULTS = Object.freeze({
  // Furthest the present may run ahead of the frontier (2 s). Past this the client waits
  // for the server instead of predicting further.
  rollbackWindowTicks: 120,
  // Confirmed ticks waiting to be simulated before a keyframe is the cheaper way to catch up.
  keyframeBehindTicks: 600,
  // A checkpoint every N new ticks. A rare rollback replays at most N-1 extra ticks.
  checkpointEveryTicks: 4,
  // Send inputs every N ticks with this many already-sent frames repeated. Two ticks per
  // message halves the upload and the server's message load (the envelope, not the
  // payload, is most of the bytes) for one extra tick of lead.
  sendEveryTicks: 2,
  inputRedundancy: 2,
  keyframeRetryMs: 1500,
});

const RING = 1024; // ticks of input history; a power of two
const RING_MASK = RING - 1;
const SEATS = MAX_SEATS_LIMIT;
const NO_ROLLBACK = 0x7fffffff;
// Events that are only announced once their tick is final. Everything else is announced
// the first time it is predicted.
const CONFIRMED_ONLY = { finish: true };

function eventKey(ev) {
  return ev.type + '|' + (ev.seat ?? '') + '|' + (ev.name ?? ev.pickupIndex ?? '');
}

export function createRollbackClient(options = {}) {
  const cfg = { ...CLIENT_DEFAULTS, ...options };
  const sendRaw = options.send;
  if (typeof sendRaw !== 'function') throw new Error('createRollbackClient requires send(opCode, data)');
  const createWorld = options.createWorld ?? ((config) => createSimWorld(config));
  const perfNow = options.perfNow ?? null;
  const clock = options.clock ?? createClockSync(options.clockOptions);
  const pacer = createTickPacer(options.pacerOptions);
  const assembler = createChunkAssembler();

  let phase = 'idle'; // 'idle' | 'lobby' | 'starting' | 'racing' | 'finished' | 'error'
  let error = null;
  let room = null;
  let race = null;
  let lobby = [];
  let results = null;
  let world = null;
  let localSeat = -1;
  let startTick = 0;
  let hashInterval = 30;

  let present = 0;
  let frontier = 0;
  let started = false;
  let awaitingKeyframe = false;
  let resimulating = false;
  let stalled = false;
  let rollbackTo = NO_ROLLBACK;
  let lastNowMs = 0;
  let lastUpdateMs = NaN;
  let lastKeyframeRequestMs = -Infinity;
  // A hello that has not been answered yet: { choice, sentMs }.
  let pendingHello = null;
  let sampledThrough = -1;
  let sentThrough = -1;
  let finalCursor = 0;

  const confA = new Uint32Array(RING * SEATS);
  const confB = new Uint32Array(RING * SEATS);
  const confMask = new Uint16Array(RING);
  const usedA = new Uint32Array(RING * SEATS);
  const usedB = new Uint32Array(RING * SEATS);
  const usedMask = new Uint16Array(RING);
  const localA = new Uint32Array(RING);
  const localB = new Uint32Array(RING);
  const localTick = new Int32Array(RING).fill(-1);
  const lastA = new Uint32Array(SEATS);
  const lastB = new Uint32Array(SEATS);
  const previousScratch = [0, 0];
  const frameScratch = [];
  for (let i = 0; i < SEATS; i++) frameScratch.push({ tick: 0, steer: 0, throttle: 0, brake: 0, reverse: 0, buttons: 0 });
  const seatInputs = Object.create(null);

  let checkpoints = []; // ascending by tick: { tick, snap }
  let seatEvents = []; // ascending by tick: { tick, seat, human }
  const hostHashes = new Map();
  const localHashes = new Map();

  // Events: predicted ones already announced for unconfirmed ticks, and confirmed-only
  // ones waiting for their tick to become final.
  let emitted = [];
  let oldEvents = null;
  const pendingFinal = new Map();
  const outEvents = [];
  // Presentation events reported through `noteEvent` while a tick is being simulated.
  const noted = [];
  const smoothers = [];
  const beforePoses = [];
  for (let i = 0; i < SEATS; i++) {
    smoothers.push(createPredictionSmoother(options.smootherOptions));
    beforePoses.push({ s: 0, x: 0, y: 0, yaw: 0, rescues: 0, fall: null });
  }

  const stats = {
    updates: 0,
    ticks: 0,
    rollbacks: 0,
    resimTicks: 0,
    maxResimTicks: 0,
    resimMs: 0,
    maxResimMs: 0,
    hashChecks: 0,
    hashMismatches: 0,
    keyframeRequests: 0,
    keyframesApplied: 0,
    keyframeFailures: 0,
    helloRetries: 0,
    keyframeRetries: 0,
    stalledUpdates: 0,
    streamGaps: 0,
    eventsEmitted: 0,
    eventsLate: 0,
    eventsCancelled: 0,
    sentMessages: 0,
    sentBytes: 0,
    sentSocketBytes: 0,
    receivedMessages: 0,
    receivedBytes: 0,
    receivedSocketBytes: 0,
    lastHashTick: -1,
  };

  function send(op, data) {
    const length = typeof data === 'string' ? data.length : data.length;
    stats.sentMessages++;
    stats.sentBytes += length;
    stats.sentSocketBytes += socketBytes(length, 'up', op);
    sendRaw(op, data);
  }

  function emit(ev) {
    stats.eventsEmitted++;
    if (options.onEvent) options.onEvent(ev);
    else outEvents.push(ev);
  }

  // ---- Race setup ----

  function resetStream() {
    present = 0;
    frontier = 0;
    started = false;
    rollbackTo = NO_ROLLBACK;
    sampledThrough = -1;
    sentThrough = -1;
    finalCursor = 0;
    localTick.fill(-1);
    lastA.fill(0);
    lastB.fill(0);
    checkpoints = [];
    seatEvents = [];
    hostHashes.clear();
    localHashes.clear();
    emitted = [];
    pendingFinal.clear();
    for (let i = 0; i < SEATS; i++) smoothers[i].reset();
  }

  function setupRace(config, you) {
    const same = race && world && race.seed === config.seed && race.startTick === config.startTick && race.courseId === config.courseId;
    race = config;
    localSeat = you ?? -1;
    startTick = config.startTick;
    hashInterval = config.hashIntervalTicks || 30;
    if (same) return;
    world = createWorld({
      courseId: config.courseId,
      seed: config.seed,
      laps: config.laps,
      mode: 'race',
      finishRule: config.finishRule ?? 'all_humans',
      finishGraceSeconds: config.finishGraceSeconds,
      seats: config.seats.map((s) => ({ kind: s.kind, car: s.car, driver: s.driver, gridIndex: s.gridIndex })),
    });
    results = null;
    resetStream();
  }

  // ---- Simulation ----

  function saveCheckpoint(t) {
    while (checkpoints.length && checkpoints[checkpoints.length - 1].tick > t) checkpoints.pop();
    const last = checkpoints[checkpoints.length - 1];
    if (last && last.tick === t) return;
    checkpoints.push({ tick: t, snap: captureSnapshot(world) });
  }

  function applySeatEvents(t) {
    for (let i = 0; i < seatEvents.length; i++) {
      const ev = seatEvents[i];
      if (ev.tick > t) break;
      if (ev.tick !== t) continue;
      const actor = world.state.actors[ev.seat];
      if (!actor) continue;
      actor.kind = ev.human ? 'remote' : 'ai';
      actor.isHuman = ev.human;
    }
  }

  function handleEvents(t, events, isNew) {
    // A replayed tick that was already final reproduces events that were already
    // delivered: say nothing.
    if (!isNew && t < finalCursor) return;
    pendingFinal.delete(t);
    for (let i = 0; i < events.length; i++) {
      const ev = { ...events[i], tick: t };
      if (CONFIRMED_ONLY[ev.type]) {
        const list = pendingFinal.get(t);
        if (list) list.push(ev);
        else pendingFinal.set(t, [ev]);
        continue;
      }
      const key = eventKey(ev);
      if (!isNew && oldEvents) {
        // Re-simulated tick: an event already announced in the old timeline is not
        // announced again, even if it moved by a tick or two.
        let match = -1;
        let best = Infinity;
        for (let j = 0; j < oldEvents.length; j++) {
          const old = oldEvents[j];
          if (old.matched || old.key !== key) continue;
          const d = Math.abs(old.tick - t);
          if (d < best) {
            best = d;
            match = j;
          }
        }
        if (match >= 0) {
          oldEvents[match].matched = true;
          emitted.push({ tick: t, key, event: oldEvents[match].event, matched: false });
          continue;
        }
        ev.late = true;
        stats.eventsLate++;
      }
      emitted.push({ tick: t, key, event: ev, matched: false });
      emit(ev);
    }
  }

  function simulateTick(t, isNew) {
    const live = world.state.tick === t && !world.state.done;
    if (live) {
      applySeatEvents(t);
      if (t === frontier || t % cfg.checkpointEveryTicks === 0) saveCheckpoint(t);
      if (t % hashInterval === 0) localHashes.set(t, stateHash(world));
    } else {
      // The race has ended before this tick in this timeline: any hash kept for it
      // belongs to an abandoned one.
      localHashes.delete(t);
    }
    const ring = t & RING_MASK;
    const base = ring * SEATS;
    const actors = world.state.actors;
    const confirmed = t < frontier;
    let mask = 0;
    for (let i = 0; i < actors.length; i++) {
      if (actors[i].kind === 'ai') {
        delete seatInputs[i];
        continue;
      }
      mask |= 1 << i;
      let a;
      let b;
      if (confirmed && (confMask[ring] & (1 << i))) {
        a = confA[base + i];
        b = confB[base + i];
      } else if (!confirmed && i === localSeat && localTick[ring] === t) {
        a = localA[ring];
        b = localB[ring];
      } else {
        // Prediction: the last input the server reported for this seat, still held.
        a = lastA[i];
        b = stripEdgesB(lastB[i]);
      }
      usedA[base + i] = a;
      usedB[base + i] = b;
      seatInputs[i] = unpackFrame(a, b, t, frameScratch[i]);
    }
    usedMask[ring] = mask;
    noted.length = 0;
    const events = world.step(seatInputs);
    handleEvents(t, noted.length ? events.concat(noted) : events, isNew);
    noted.length = 0;
  }

  function rollback(toTick) {
    while (checkpoints.length && checkpoints[checkpoints.length - 1].tick > toTick) checkpoints.pop();
    const base = checkpoints[checkpoints.length - 1];
    if (!base) {
      requestKeyframe(KEYFRAME_REASON.BEHIND);
      return;
    }
    const t0 = perfNow ? perfNow() : 0;
    const actors = world.state.actors;
    for (let i = 0; i < actors.length; i++) {
      const k = actors[i].kart;
      const p = beforePoses[i];
      p.s = k.s;
      p.x = k.x;
      p.y = k.y;
      p.yaw = k.yaw;
      p.rescues = k.rescues;
      p.fall = k.fall;
    }
    oldEvents = [];
    const kept = [];
    for (let i = 0; i < emitted.length; i++) {
      if (emitted[i].tick >= base.tick) oldEvents.push(emitted[i]);
      else kept.push(emitted[i]);
    }
    emitted = kept;

    // From here until the replay is done, hooks fired by the simulation (item meshes
    // removed and re-created, visual cues) belong to old ticks, not to new play.
    resimulating = true;
    restoreSnapshot(world, base.snap);
    // Hashes taken along the abandoned timeline are void. The replay takes them again.
    for (const tick of localHashes.keys()) {
      if (tick >= base.tick) localHashes.delete(tick);
    }
    for (let t = base.tick; t < present; t++) {
      if (t === present - 1 && options.onBeforeTick) options.onBeforeTick(world, t);
      simulateTick(t, false);
    }
    resimulating = false;

    for (let i = 0; i < oldEvents.length; i++) {
      if (!oldEvents[i].matched) {
        stats.eventsCancelled++;
        emit({ type: 'cancel', tick: oldEvents[i].tick, event: oldEvents[i].event });
      }
    }
    oldEvents = null;
    for (let i = 0; i < actors.length; i++) smoothers[i].recordCorrection(beforePoses[i], actors[i].kart);

    const n = present - base.tick;
    stats.rollbacks++;
    stats.resimTicks += n;
    if (n > stats.maxResimTicks) stats.maxResimTicks = n;
    if (perfNow) {
      const ms = perfNow() - t0;
      stats.resimMs += ms;
      if (ms > stats.maxResimMs) stats.maxResimMs = ms;
    }
  }

  function verifyHashes() {
    if (hostHashes.size === 0) return;
    for (const [tick, hash] of hostHashes) {
      if (tick > frontier || tick > present) continue;
      let local = localHashes.get(tick);
      // The world sits exactly on this tick (the race just ended, or nothing newer has
      // been simulated): hash it directly.
      if (local === undefined && world.state.tick === tick) local = stateHash(world);
      hostHashes.delete(tick);
      if (local === undefined) continue;
      stats.hashChecks++;
      stats.lastHashTick = tick;
      if (options.onHashCheck) options.onHashCheck(tick, local, hash);
      if (local !== hash) {
        stats.hashMismatches++;
        requestKeyframe(KEYFRAME_REASON.DESYNC);
      }
    }
    for (const tick of localHashes.keys()) {
      if (tick < frontier - hashInterval * 2) localHashes.delete(tick);
    }
  }

  function flushFinalEvents() {
    const limit = Math.min(frontier, present);
    while (finalCursor < limit) {
      const list = pendingFinal.get(finalCursor);
      if (list) {
        for (let i = 0; i < list.length; i++) emit({ ...list[i], confirmed: true });
        pendingFinal.delete(finalCursor);
      }
      finalCursor++;
    }
    if (emitted.length && emitted[0].tick < limit) {
      emitted = emitted.filter((e) => e.tick >= limit);
    }
    // Checkpoints: the newest one at or below the frontier is the confirmed state;
    // anything older can never be rolled back to.
    let keepFrom = 0;
    for (let i = 0; i < checkpoints.length; i++) {
      if (checkpoints[i].tick <= limit) keepFrom = i;
    }
    if (keepFrom > 0) checkpoints.splice(0, keepFrom);
    if (seatEvents.length && checkpoints.length && seatEvents[0].tick < checkpoints[0].tick) {
      const floor = checkpoints[0].tick;
      seatEvents = seatEvents.filter((e) => e.tick >= floor);
    }
  }

  // ---- Keyframes ----

  function requestKeyframe(reason) {
    if (lastNowMs - lastKeyframeRequestMs < cfg.keyframeRetryMs) return false;
    lastKeyframeRequestMs = lastNowMs;
    stats.keyframeRequests++;
    send(NET_OP.KEYFRAME_REQ, encodeKeyframeRequest(reason, frontier));
    return true;
  }

  function applyKeyframe(payload) {
    const kf = decodeKeyframePayload(payload);
    const snap = kf ? decodeKeyframe(kf.snapshotBytes) : null;
    if (!kf || !snap || !world || snap.actors.length !== world.state.actors.length) {
      stats.keyframeFailures++;
      return;
    }
    const wasPresent = present;
    const hadStream = started && !awaitingKeyframe;
    if (hadStream) {
      const actors = world.state.actors;
      for (let i = 0; i < actors.length; i++) {
        const k = actors[i].kart;
        const p = beforePoses[i];
        p.s = k.s;
        p.x = k.x;
        p.y = k.y;
        p.yaw = k.yaw;
        p.rescues = k.rescues;
        p.fall = k.fall;
      }
    }
    const lastGood = captureSnapshot(world);
    resimulating = true;
    restoreSnapshot(world, snap);
    if (stateHash(world) !== kf.hash) {
      // The state did not survive the trip: wrong build or a codec fault. Put back what
      // was on screen and ask again; `update` keeps asking until a good one arrives.
      restoreSnapshot(world, lastGood);
      resimulating = false;
      stats.keyframeFailures++;
      lastKeyframeRequestMs = -Infinity;
      awaitingKeyframe = true;
      requestKeyframe(KEYFRAME_REASON.DESYNC);
      return;
    }
    stats.keyframesApplied++;
    const tick = kf.tick;
    frontier = tick;
    awaitingKeyframe = false;
    rollbackTo = NO_ROLLBACK;
    lastA.fill(0);
    lastB.fill(0);
    for (let i = 0; i < kf.seatInputs.length; i++) {
      lastA[kf.seatInputs[i][0]] = kf.seatInputs[i][1];
      lastB[kf.seatInputs[i][0]] = kf.seatInputs[i][2];
    }
    checkpoints = [{ tick, snap }];
    seatEvents = seatEvents.filter((e) => e.tick >= tick);
    localHashes.clear();
    for (const t of hostHashes.keys()) {
      if (t <= tick) hostHashes.delete(t);
    }
    for (const t of pendingFinal.keys()) {
      if (t < tick) pendingFinal.delete(t);
    }
    if (finalCursor < tick) finalCursor = tick;

    if (hadStream && wasPresent >= tick && wasPresent - tick <= cfg.rollbackWindowTicks) {
      // Close enough: replay our own recorded inputs on top of the keyframe.
      present = wasPresent;
      emitted = emitted.filter((e) => e.tick >= tick);
      oldEvents = emitted;
      emitted = [];
      for (let t = tick; t < present; t++) {
        if (t === present - 1 && options.onBeforeTick) options.onBeforeTick(world, t);
        simulateTick(t, false);
      }
      resimulating = false;
      for (let i = 0; i < oldEvents.length; i++) {
        if (!oldEvents[i].matched) {
          stats.eventsCancelled++;
          emit({ type: 'cancel', tick: oldEvents[i].tick, event: oldEvents[i].event });
        }
      }
      oldEvents = null;
      const actors = world.state.actors;
      for (let i = 0; i < actors.length; i++) smoothers[i].recordCorrection(beforePoses[i], actors[i].kart);
    } else {
      // Too far apart (or first sync): start again from the keyframe and catch up.
      present = tick;
      emitted = [];
      started = true;
      pacer.reset(tick);
      if (sampledThrough < tick - 1) sampledThrough = tick - 1;
      if (sentThrough < tick - 1) sentThrough = tick - 1;
      for (let i = 0; i < SEATS; i++) smoothers[i].reset();
    }
    resimulating = false;
    if (phase !== 'finished') phase = 'racing';
  }

  // ---- Incoming messages ----

  function previousOf(seat) {
    previousScratch[0] = lastA[seat];
    previousScratch[1] = lastB[seat];
    return previousScratch;
  }

  function onConfirmedFrame(tick, seat, a, b) {
    const ring = tick & RING_MASK;
    const idx = ring * SEATS + seat;
    confA[idx] = a;
    confB[idx] = b;
    if (tick < present && tick < rollbackTo) {
      if (!(usedMask[ring] & (1 << seat)) || usedA[idx] !== a || usedB[idx] !== b) rollbackTo = tick;
    }
    lastA[seat] = a;
    lastB[seat] = b;
  }

  function onMargin(seat, margin) {
    if (seat === localSeat) clock.onMargin(margin, lastNowMs);
  }

  function onInputs(bytes) {
    if (!world || awaitingKeyframe) return;
    // Peek at the header before touching any state.
    if (bytes.length < 8) return;
    const start = (bytes[1] | (bytes[2] << 8) | (bytes[3] << 16) | (bytes[4] << 24)) >>> 0;
    const count = bytes[5];
    const mask = bytes[6] | (bytes[7] << 8);
    if (count > 0) {
      if (start + count <= frontier) return; // already have it
      if (start !== frontier) {
        // A hole in an ordered stream means we missed something: resync.
        stats.streamGaps++;
        awaitingKeyframe = true;
        lastKeyframeRequestMs = -Infinity;
        requestKeyframe(KEYFRAME_REASON.BEHIND);
        return;
      }
      const oldest = checkpoints.length ? checkpoints[0].tick : Math.min(present, frontier);
      if (start + count - oldest >= RING - 8) {
        // Out of input history: drop the stream until a keyframe arrives.
        awaitingKeyframe = true;
        lastKeyframeRequestMs = -Infinity;
        requestKeyframe(KEYFRAME_REASON.BEHIND);
        return;
      }
    }
    const info = decodeInputs(bytes, previousOf, onConfirmedFrame, onMargin);
    if (!info) return;
    for (let t = 0; t < count; t++) {
      const tick = start + t;
      const ring = tick & RING_MASK;
      confMask[ring] = mask;
      // A seat we simulated as human that the server says was not: redo from there.
      if (tick < present && tick < rollbackTo && usedMask[ring] !== mask) rollbackTo = tick;
    }
    if (count > 0) frontier = start + count;
    if (info.hash) hostHashes.set(info.hashTick, info.hash);
  }

  function onSeat(bytes) {
    const ev = decodeSeat(bytes);
    if (!ev || !world || awaitingKeyframe) return;
    const human = ev.kind === SEAT_KIND_HUMAN;
    seatEvents.push({ tick: ev.tick, seat: ev.seat, human });
    seatEvents.sort((x, y) => x.tick - y.tick);
    if (human) {
      lastA[ev.seat] = 0;
      lastB[ev.seat] = 0;
    }
    if (ev.tick < present && ev.tick < rollbackTo) rollbackTo = ev.tick;
    if (race && race.seats[ev.seat]) race.seats[ev.seat].kind = human ? 'remote' : 'ai';
  }

  function receive(op, data) {
    const length = data == null ? 0 : data.length ?? data.byteLength ?? 0;
    stats.receivedMessages++;
    stats.receivedBytes += length;
    stats.receivedSocketBytes += socketBytes(length, 'down', op);
    switch (op) {
      case NET_OP.INPUTS:
        onInputs(asBytes(data));
        break;
      case NET_OP.HASH: {
        const h = decodeHash(asBytes(data));
        if (h && world && !awaitingKeyframe) hostHashes.set(h.tick, h.hash);
        break;
      }
      case NET_OP.SEAT:
        onSeat(asBytes(data));
        break;
      case NET_OP.KEYFRAME: {
        const whole = assembler.push(asBytes(data));
        if (whole) applyKeyframe(whole);
        break;
      }
      case NET_OP.PONG: {
        const pong = decodePong(asBytes(data));
        if (pong) clock.onPong(pong.clientMs, pong.serverTick, options.now ? options.now() : lastNowMs);
        break;
      }
      case NET_OP.WELCOME: {
        const msg = decodeJson(data);
        if (!msg) break;
        pendingHello = null;
        room = msg.room ?? room;
        lobby = msg.players ?? lobby;
        if (msg.race) {
          setupRace(msg.race, msg.you);
          // A keyframe follows on the same ordered channel; ignore the stream until then.
          // If it has not come within the retry time, `update` asks for it.
          awaitingKeyframe = true;
          lastKeyframeRequestMs = lastNowMs;
          phase = msg.phase === 'finished' ? 'finished' : 'starting';
        } else {
          phase = 'lobby';
        }
        break;
      }
      case NET_OP.START: {
        const msg = decodeJson(data);
        if (!msg || !msg.race) break;
        setupRace(msg.race, msg.you);
        awaitingKeyframe = false;
        phase = 'starting';
        break;
      }
      case NET_OP.LOBBY: {
        const msg = decodeJson(data);
        if (msg) lobby = msg.players ?? lobby;
        break;
      }
      case NET_OP.RESULT: {
        const msg = decodeJson(data);
        if (msg && Number.isInteger(msg.tick) && typeof msg.hash === 'string' && Array.isArray(msg.standings)) {
          results = msg;
          if (world && !awaitingKeyframe) hostHashes.set(msg.tick, msg.hash);
        }
        break;
      }
      case NET_OP.ERROR: {
        const msg = decodeJson(data);
        pendingHello = null;
        error = (msg && typeof msg.error === 'string' && msg.error) || 'error';
        phase = 'error';
        break;
      }
      default:
        break;
    }
  }

  function sendHello(choice) {
    pendingHello = { choice, sentMs: options.now ? options.now() : lastNowMs };
    send(NET_OP.HELLO, encodeJson({ v: NET_VERSION, sim: RACER_SIM_VERSION, car: choice.car, driver: choice.driver, name: choice.name }));
  }

  // ---- Outgoing inputs ----

  const outFrames = [];
  function sendInputs(force) {
    if (localSeat < 0 || sampledThrough <= sentThrough) return;
    if (!force && sampledThrough - sentThrough < cfg.sendEveryTicks) return;
    let next = sentThrough + 1;
    while (next <= sampledThrough) {
      const last = Math.min(sampledThrough, next + 3);
      outFrames.length = 0;
      // Newest first, then already-sent frames as a safety net while there is room.
      const lowest = Math.max(0, next - cfg.inputRedundancy);
      for (let t = last; t >= lowest && outFrames.length < 4; t--) {
        const ring = t & RING_MASK;
        if (localTick[ring] !== t) continue;
        outFrames.push(unpackFrame(localA[ring], localB[ring], t, {}));
      }
      if (outFrames.length) send(NET_OP.INPUT, encodeClientInput(localSeat, outFrames));
      next = last + 1;
    }
    sentThrough = sampledThrough;
  }

  // ---- The frame ----

  /**
   * Call once per rendered frame with the current time in milliseconds.
   * `sampleControls(tick)` is called once for each new tick and returns the controls
   * object (steer, throttle, brake, drift and item flags) for that tick.
   * Returns the number of new ticks simulated.
   */
  function update(nowMs, sampleControls) {
    lastNowMs = nowMs;
    const dtMs = Number.isNaN(lastUpdateMs) ? 0 : Math.max(0, nowMs - lastUpdateMs);
    lastUpdateMs = nowMs;
    stats.updates++;
    stalled = false;

    const token = clock.pingDue(nowMs);
    if (token >= 0) send(NET_OP.PING, encodePing(token));
    // Nothing the client waits for may be lost for good: an unanswered hello is said
    // again, and a keyframe that has not arrived is asked for again.
    if (pendingHello) {
      if (nowMs - pendingHello.sentMs >= cfg.keyframeRetryMs) {
        stats.helloRetries++;
        sendHello(pendingHello.choice);
      }
    } else if (awaitingKeyframe && world && phase !== 'error') {
      if (nowMs - lastKeyframeRequestMs >= cfg.keyframeRetryMs) {
        stats.keyframeRetries++;
        requestKeyframe(KEYFRAME_REASON.BEHIND);
      }
    }
    if (!world || awaitingKeyframe || phase === 'error' || phase === 'idle' || phase === 'lobby') return 0;

    if (rollbackTo < present) rollback(rollbackTo);
    rollbackTo = NO_ROLLBACK;
    verifyHashes();

    const dtSeconds = dtMs / 1000;
    for (let i = 0; i < world.state.actors.length; i++) smoothers[i].update(dtSeconds);

    let steps = 0;
    const finishedHere = world.state.done && frontier >= world.state.tick;
    if (finishedHere) {
      phase = 'finished';
    } else if (clock.synced) {
      const target = clock.serverTickAt(nowMs) - startTick + clock.leadTicks(cfg.sendEveryTicks - 1);
      if (!started) {
        pacer.reset(Math.min(target, 0));
        if (target >= 0) started = true;
      }
      if (started) {
        if (phase === 'starting') phase = 'racing';
        steps = pacer.advance(dtMs, target, present);
        const room2 = frontier + cfg.rollbackWindowTicks - present;
        if (steps > room2) {
          // The server has gone quiet: hold here rather than predict further.
          steps = Math.max(0, room2);
          stalled = true;
          stats.stalledUpdates++;
        }
        if (frontier - present > cfg.keyframeBehindTicks) requestKeyframe(KEYFRAME_REASON.BEHIND);
      }
    }

    for (let i = 0; i < steps; i++) {
      const t = present;
      if (t >= frontier && t > sampledThrough && localSeat >= 0) {
        // No sampler, or one with nothing to say this tick (a menu is open): hands off.
        const frame = controlsToIntentFrame(t, (sampleControls && sampleControls(t)) || undefined);
        const ring = t & RING_MASK;
        localA[ring] = packFrameA(frame);
        localB[ring] = packFrameB(frame);
        localTick[ring] = t;
        sampledThrough = t;
      }
      if (i === steps - 1 && options.onBeforeTick) options.onBeforeTick(world, t);
      simulateTick(t, true);
      present++;
      stats.ticks++;
    }
    if (steps > 0 && phase !== 'finished') sendInputs(false);

    verifyHashes();
    flushFinalEvents();
    return steps;
  }

  return {
    receive,
    update,
    /** Introduce ourselves (also after a reconnect: the host answers with a keyframe). */
    hello(choice = options.hello ?? {}) {
      if (world) {
        awaitingKeyframe = true;
        assembler.reset();
      }
      sendHello(choice);
    },
    setReady(ready = true) {
      send(NET_OP.READY, encodeJson({ ready }));
    },
    requestKeyframe: () => {
      lastKeyframeRequestMs = -Infinity;
      return requestKeyframe(KEYFRAME_REASON.REQUEST);
    },
    /**
     * Reports a presentation event (for example an item's visual cue) produced by a
     * simulation hook during the tick now being simulated. It is delivered with that
     * tick's events, so it gets the same treatment: announced once, not repeated when
     * the tick is replayed, marked `late` if it first appears in a replay, and followed
     * by a `cancel` if a replay no longer produces it. `name` tells events of one type
     * and seat apart.
     */
    noteEvent(ev) {
      noted.push(ev);
    },
    /** Events since the last call, each exactly once. Not used when `onEvent` is given. */
    drainEvents() {
      return outEvents.splice(0, outEvents.length);
    },
    /** Decaying pose offset to add when drawing a seat, so corrections glide instead of snap. */
    correction(seat) {
      return smoothers[seat] ? smoothers[seat].offsets : null;
    },
    smoother: (seat) => smoothers[seat] ?? null,
    clock,
    stats,
    get phase() { return phase; },
    get error() { return error; },
    get world() { return world; },
    get localSeat() { return localSeat; },
    get room() { return room; },
    get race() { return race; },
    get lobby() { return lobby; },
    get results() { return results; },
    get present() { return present; },
    get frontier() { return frontier; },
    get resimulating() { return resimulating; },
    /** 0..1 position of this frame between the previous tick and the present one. */
    get alpha() { return started ? Math.max(0, Math.min(1, pacer.clock - present)) : 1; },
    get stalled() { return stalled; },
    get synced() { return !!world && started && !awaitingKeyframe; },
    get leadTicks() { return clock.leadTicks(cfg.sendEveryTicks - 1); },
    get predictedTicks() { return Math.max(0, present - frontier); },
  };
}
