// Authoritative match host for online races (input relay with rollback).
//
// The host owns the one true `createSimWorld`. Players send their inputs a few ticks
// ahead of time; on every `tick()` the host takes each human seat's input for that tick,
// steps the world, and tells every client exactly which inputs it used. Clients run the
// same simulation and correct themselves from that stream.
//
// This file is plain JS driven by explicit calls: no timers, no DOM, no Math.random, no
// Nakama API. A Nakama match handler (or the in-page loopback in sim-net.js) calls
// `join` / `leave` / `receive` as presences and messages arrive and `tick()` once per
// 60 Hz match loop, and supplies `send(playerId, opCode, data)` where data is a
// Uint8Array (binary messages) or a string (JSON control messages).

import { createSimWorld } from '../sim/world.js';
import { captureSnapshot } from '../sim/snapshot.js';
import { stateHash } from '../sim/hash.js';
import { createRng } from '../sim/rng.js';
import { CIRCUITS } from '../sim/track-core.js';
import { EDGE_BUTTON_MASK, HELD_BUTTON_MASK } from '../sim/intent.js';
import { racerSetup } from '../roster.js';
import { MAX_SEATS_LIMIT, NET_VERSION, RACER_SIM_VERSION, validateRacerChoice } from './protocol.js';
import { chunkBytes, encodeKeyframe, KEYFRAME_CHUNK_BYTES } from './keyframe.js';
import {
  KEYFRAME_REASON,
  MARGIN_NONE,
  NET_OP,
  SEAT_KIND_AI,
  SEAT_KIND_HUMAN,
  asBytes,
  createInputsBatcher,
  decodeClientInput,
  decodeJson,
  decodeKeyframeRequest,
  decodePing,
  encodeJson,
  encodeKeyframePayload,
  encodePong,
  encodeSeat,
  packFrameA,
  packFrameB,
  unpackFrame,
} from './wire.js';

export const HOST_DEFAULTS = Object.freeze({
  laps: 3,
  seatCount: 6,
  minPlayers: 1,
  // Ticks between START and race tick 0, so every client has the message and a clock fix.
  startDelayTicks: 120,
  // Relayed inputs are flushed every 2 ticks: 30 messages a second instead of 60, at the
  // price of at most one tick (16.7 ms) of extra delay on half the remote inputs.
  inputBatchTicks: 2,
  hashIntervalTicks: 30,
  // Input acceptance window around the tick the host is about to run.
  maxLeadTicks: 60,
  maxLateTicks: 120,
  // With no fresh input the host repeats the last one for this long, then coasts.
  maxHoldTicks: 30,
  // Per-player budgets (token buckets, refilled every tick).
  // Inputs: a stalled connection delivers everything it held back at once, so the burst
  // allowance covers four seconds of honest input while the steady rate stays near 60.
  inputRatePerSecond: 72,
  inputBurst: 240,
  controlRatePerSecond: 5,
  controlBurst: 10,
  keyframeMinIntervalTicks: 60,
  allowLateJoin: true,
  finishRule: 'all_humans',
  finishGraceSeconds: 25,
  keyframeChunkBytes: KEYFRAME_CHUNK_BYTES,
});

const EDGE_BITS = [];
for (let bit = 0; bit < 24; bit++) {
  if (EDGE_BUTTON_MASK & (1 << bit)) EDGE_BITS.push(bit);
}

/**
 * One human seat's inputs waiting to be used. Frames for future ticks wait in a map.
 * A frame that arrives after its tick has run is too late to steer with, but its button
 * presses are kept and delivered on the next ticks, one press per button per tick, so a
 * press is never lost and never applied twice.
 */
export function createSeatInputQueue(options = {}) {
  const maxLateTicks = options.maxLateTicks ?? HOST_DEFAULTS.maxLateTicks;
  const maxLeadTicks = options.maxLeadTicks ?? HOST_DEFAULTS.maxLeadTicks;
  const maxHoldTicks = options.maxHoldTicks ?? HOST_DEFAULTS.maxHoldTicks;

  const future = new Map();
  const pendingEdges = new Int32Array(24);
  let lastSeenTick = -1;
  let heldA = 0;
  let heldB = 0;
  let heldTick = -1;
  let received = 0;

  function addEdges(buttons) {
    for (let i = 0; i < EDGE_BITS.length; i++) {
      if (buttons & (1 << EDGE_BITS[i])) pendingEdges[EDGE_BITS[i]]++;
    }
  }

  function hold(frame) {
    heldA = packFrameA(frame);
    heldB = packFrameB({ reverse: frame.reverse, buttons: frame.buttons & HELD_BUTTON_MASK });
    heldTick = frame.tick;
  }

  return {
    get lastSeenTick() { return lastSeenTick; },
    get received() { return received; },
    /**
     * Offers one frame while the host is about to run `nowTick`.
     * Returns 'ok', 'late' (presses kept, steering discarded), 'duplicate', 'too_old' or 'too_far'.
     */
    push(frame, nowTick) {
      const tick = frame.tick;
      if (tick <= lastSeenTick) return 'duplicate';
      if (tick > nowTick + maxLeadTicks) return 'too_far';
      if (tick < nowTick - maxLateTicks) {
        lastSeenTick = tick;
        return 'too_old';
      }
      lastSeenTick = tick;
      received++;
      if (tick < nowTick) {
        addEdges(frame.buttons);
        if (tick > heldTick) hold(frame);
        return 'late';
      }
      future.set(tick, { a: packFrameA(frame), b: packFrameB(frame), buttons: frame.buttons, frame });
      return 'ok';
    },
    /** The input to use for `tick`, written into `out` as { a, b, margin }. */
    take(tick, out) {
      const exact = future.get(tick);
      if (exact) {
        future.delete(tick);
        addEdges(exact.buttons);
        hold(exact.frame);
      }
      let edges = 0;
      for (let i = 0; i < EDGE_BITS.length; i++) {
        const bit = EDGE_BITS[i];
        if (pendingEdges[bit] > 0) {
          pendingEdges[bit]--;
          edges |= 1 << bit;
        }
      }
      if (heldTick < 0 || tick - heldTick > maxHoldTicks) {
        out.a = 0;
        out.b = (edges << 8) >>> 0;
      } else {
        out.a = heldA;
        out.b = (heldB | (edges << 8)) >>> 0;
      }
      out.margin = lastSeenTick < 0 ? MARGIN_NONE : Math.max(-127, Math.min(127, lastSeenTick - tick));
      return out;
    },
    reset() {
      future.clear();
      pendingEdges.fill(0);
      lastSeenTick = -1;
      heldA = 0;
      heldB = 0;
      heldTick = -1;
      received = 0;
    },
  };
}

function defaultValidateHello(playerId, payload) {
  return validateRacerChoice({ car: payload.car, driver: payload.driver }, []);
}

export function createMatchHost(options = {}) {
  const cfg = { ...HOST_DEFAULTS, ...options };
  const seatCount = Math.max(1, Math.min(MAX_SEATS_LIMIT, cfg.seatCount | 0));
  const maxHumans = Math.max(1, Math.min(seatCount, options.maxHumans ?? seatCount));
  const courseId = CIRCUITS.some((c) => c.id === cfg.courseId) ? cfg.courseId : CIRCUITS[0].id;
  const seed = (cfg.seed ?? 1) >>> 0;
  const sendRaw = cfg.send;
  if (typeof sendRaw !== 'function') throw new Error('createMatchHost requires send(playerId, opCode, data)');
  const validateHello = cfg.validateHello ?? defaultValidateHello;
  const aiSetup = cfg.aiSetup ?? ((index) => {
    const { car, driver } = racerSetup(index, {});
    return { car: car.id, driver: driver.id };
  });

  const players = new Map(); // playerId -> player record
  const lobby = []; // players who said hello, in join order
  let seats = []; // fixed at START
  let world = null;
  let phase = 'lobby'; // 'lobby' | 'starting' | 'race' | 'finished'
  let serverTick = 0;
  let startTick = -1;
  let results = null;
  let keyframeId = 0;
  let pendingHash = null;
  const batcher = createInputsBatcher(MAX_SEATS_LIMIT);
  const takeScratch = { a: 0, b: 0, margin: 0 };
  const frameScratch = [];
  for (let i = 0; i < MAX_SEATS_LIMIT; i++) frameScratch.push({ tick: 0, steer: 0, throttle: 0, brake: 0, reverse: 0, buttons: 0 });
  const seatInputs = Object.create(null);

  const stats = {
    inputMessages: 0,
    inputFrames: 0,
    lateFrames: 0,
    rejectedSeat: 0,
    rejectedWindow: 0,
    rejectedRate: 0,
    rejectedMalformed: 0,
    keyframesSent: 0,
    keyframeBytes: 0,
    batchesSent: 0,
    heldTicks: 0,
  };

  function send(playerId, op, data) {
    sendRaw(playerId, op, data);
  }

  function broadcast(op, data) {
    if (cfg.broadcast) {
      cfg.broadcast(op, data);
      return;
    }
    for (const player of players.values()) send(player.id, op, data);
  }

  function sendError(playerId, error) {
    send(playerId, NET_OP.ERROR, encodeJson({ error }));
  }

  // ---- Lobby ----

  function lobbyView() {
    if (phase === 'lobby') {
      return lobby.map((p, slot) => ({ slot, name: p.name, car: p.car, driver: p.driver, ready: p.ready }));
    }
    return seats.map((s) => ({
      seat: s.id,
      name: s.name,
      car: s.car,
      driver: s.driver,
      human: s.human,
      connected: s.connected,
    }));
  }

  function broadcastLobby() {
    broadcast(NET_OP.LOBBY, encodeJson({ phase, players: lobbyView() }));
  }

  function raceConfig() {
    return {
      courseId,
      laps: cfg.laps,
      seed,
      startTick,
      finishRule: cfg.finishRule,
      finishGraceSeconds: cfg.finishGraceSeconds,
      inputBatchTicks: cfg.inputBatchTicks,
      hashIntervalTicks: cfg.hashIntervalTicks,
      seats: seats.map((s) => ({
        kind: s.human ? 'remote' : 'ai',
        car: s.car,
        driver: s.driver,
        gridIndex: s.gridIndex,
        name: s.name,
      })),
    };
  }

  function welcome(player, you) {
    send(player.id, NET_OP.WELCOME, encodeJson({
      v: NET_VERSION,
      sim: RACER_SIM_VERSION,
      phase,
      serverTick,
      tickRate: 60,
      you,
      room: { courseId, laps: cfg.laps, seatCount, maxHumans },
      race: phase === 'lobby' ? null : raceConfig(),
      players: lobbyView(),
    }));
  }

  function startRace() {
    if (phase !== 'lobby' || lobby.length === 0) return false;
    // Humans take the first seats in join order; AI fills the rest. Grid slots are
    // shuffled from the seed so no seat is always at the back.
    const order = [];
    for (let i = 0; i < seatCount; i++) order.push(i);
    const rng = createRng(seed ^ 0x47524944);
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.nextInt(i + 1);
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
    seats = [];
    for (let i = 0; i < seatCount; i++) {
      const p = lobby[i] ?? null;
      const setup = p ? { car: p.car, driver: p.driver } : aiSetup(i);
      seats.push({
        id: i,
        human: !!p,
        owner: p ? p.id : null,
        connected: !!p,
        pending: false,
        name: p ? p.name : 'CPU',
        car: setup.car,
        driver: setup.driver,
        gridIndex: order[i],
        queue: createSeatInputQueue(cfg),
      });
      if (p) p.seat = i;
    }
    world = createSimWorld({
      courseId,
      seed,
      laps: cfg.laps,
      mode: 'race',
      finishRule: cfg.finishRule,
      finishGraceSeconds: cfg.finishGraceSeconds,
      seats: raceConfig().seats,
    });
    startTick = serverTick + cfg.startDelayTicks;
    phase = 'starting';
    const race = raceConfig();
    for (const player of players.values()) {
      send(player.id, NET_OP.START, encodeJson({ serverTick, you: player.seat, race }));
    }
    return true;
  }

  function maybeStart() {
    if (phase !== 'lobby' || lobby.length < cfg.minPlayers) return;
    for (let i = 0; i < lobby.length; i++) {
      if (!lobby[i].ready) return;
    }
    startRace();
  }

  // ---- Seats ----

  function humanMask() {
    let mask = 0;
    for (let i = 0; i < seats.length; i++) {
      if (seats[i].human) mask |= 1 << i;
    }
    return mask;
  }

  function flushBatch() {
    const bytes = batcher.flush(pendingHash ? pendingHash.tick : -1, pendingHash ? pendingHash.hash : null);
    pendingHash = null;
    if (bytes) {
      stats.batchesSent++;
      broadcast(NET_OP.INPUTS, bytes);
    }
  }

  /** Switches who drives a seat, effective at the tick the host runs next. */
  function setSeatDriver(seat, human) {
    if (seat.human === human) return;
    flushBatch();
    const tick = world.state.tick;
    const actor = world.state.actors[seat.id];
    actor.kind = human ? 'remote' : 'ai';
    actor.isHuman = human;
    seat.human = human;
    seat.pending = false;
    if (human) batcher.setPrevious(seat.id, 0, 0);
    broadcast(NET_OP.SEAT, encodeSeat(seat.id, human ? SEAT_KIND_HUMAN : SEAT_KIND_AI, tick));
  }

  function sendKeyframe(player, reason) {
    if (!world) return false;
    // Flush first so the keyframe sits on a batch boundary for every client.
    flushBatch();
    const tick = world.state.tick;
    const previous = [];
    for (let i = 0; i < seats.length; i++) {
      if (seats[i].human) {
        const p = batcher.previous(i);
        previous.push([i, p[0], p[1]]);
      }
    }
    const payload = encodeKeyframePayload(reason, tick, stateHash(world), previous, encodeKeyframe(captureSnapshot(world)));
    const chunks = chunkBytes(payload, keyframeId, cfg.keyframeChunkBytes);
    keyframeId = (keyframeId + 1) & 0xffff;
    for (let i = 0; i < chunks.length; i++) send(player.id, NET_OP.KEYFRAME, chunks[i]);
    player.lastKeyframeTick = serverTick;
    stats.keyframesSent++;
    stats.keyframeBytes += payload.length;
    return true;
  }

  // ---- Presence ----

  function join(playerId, meta = {}) {
    let player = players.get(playerId);
    if (!player) {
      player = {
        id: playerId,
        name: String(meta.name ?? playerId).slice(0, 24),
        car: null,
        driver: null,
        ready: false,
        seat: null,
        inLobby: false,
        inputTokens: cfg.inputBurst,
        controlTokens: cfg.controlBurst,
        lastKeyframeTick: -1e9,
      };
      players.set(playerId, player);
    }
    return true;
  }

  function leave(playerId) {
    const player = players.get(playerId);
    if (!player) return false;
    players.delete(playerId);
    if (phase === 'lobby') {
      const idx = lobby.indexOf(player);
      if (idx >= 0) {
        lobby.splice(idx, 1);
        broadcastLobby();
        maybeStart();
      }
      return true;
    }
    const seat = player.seat != null ? seats[player.seat] : null;
    if (seat && seat.owner === playerId) {
      // The seat stays reserved for this player; the AI drives it from the next tick.
      seat.connected = false;
      seat.pending = false;
      seat.queue.reset();
      if (phase !== 'finished') setSeatDriver(seat, false);
      broadcastLobby();
    }
    return true;
  }

  function onHello(player, data) {
    const payload = decodeJson(data);
    if (!payload) return sendError(player.id, 'bad_hello');
    if (String(payload.v) !== NET_VERSION) return sendError(player.id, 'version_mismatch');
    if (String(payload.sim) !== RACER_SIM_VERSION) return sendError(player.id, 'sim_version_mismatch');
    const choice = validateHello(player.id, payload);
    if (!choice || !choice.ok) return sendError(player.id, (choice && choice.error) || 'invalid_choice');
    if (typeof payload.name === 'string' && payload.name) player.name = payload.name.slice(0, 24);

    if (phase === 'lobby') {
      if (!player.inLobby) {
        if (lobby.length >= maxHumans) return sendError(player.id, 'room_full');
        lobby.push(player);
        player.inLobby = true;
      }
      player.car = choice.value.car;
      player.driver = choice.value.driver;
      welcome(player, lobby.indexOf(player));
      broadcastLobby();
      return undefined;
    }

    // Race already set up: give this player their old seat back, or a free AI seat.
    let seat = seats.find((s) => s.owner === player.id) ?? null;
    if (!seat && cfg.allowLateJoin && phase !== 'finished') {
      seat = seats.find((s) => s.owner == null && !s.human) ?? null;
      if (seat) {
        seat.owner = player.id;
        seat.name = player.name;
      }
    }
    if (!seat) return sendError(player.id, phase === 'finished' ? 'race_over' : 'room_full');
    player.seat = seat.id;
    seat.connected = true;
    if (!seat.human) {
      // The AI keeps driving until this player's first input arrives.
      seat.pending = phase !== 'finished';
      seat.queue.reset();
    }
    welcome(player, seat.id);
    sendKeyframe(player, KEYFRAME_REASON.JOIN);
    broadcastLobby();
    return undefined;
  }

  function onInput(player, data) {
    stats.inputMessages++;
    if (player.inputTokens < 1) {
      stats.rejectedRate++;
      return;
    }
    player.inputTokens -= 1;
    const bytes = asBytes(data);
    const packet = bytes ? decodeClientInput(bytes) : null;
    if (!packet) {
      stats.rejectedMalformed++;
      return;
    }
    const seat = player.seat != null ? seats[player.seat] : null;
    if (!seat || packet.seat !== seat.id || seat.owner !== player.id || (phase !== 'race' && phase !== 'starting')) {
      stats.rejectedSeat++;
      return;
    }
    if (!seat.human && !seat.pending) {
      stats.rejectedSeat++;
      return;
    }
    const nowTick = world.state.tick;
    // Frames arrive newest first; feed them oldest first.
    for (let i = packet.frames.length - 1; i >= 0; i--) {
      const result = seat.queue.push(packet.frames[i], nowTick);
      if (result === 'ok') stats.inputFrames++;
      else if (result === 'late') {
        stats.inputFrames++;
        stats.lateFrames++;
      } else if (result !== 'duplicate') stats.rejectedWindow++;
    }
  }

  function receive(playerId, op, data) {
    const player = players.get(playerId);
    if (!player) return false;
    if (op === NET_OP.INPUT) {
      onInput(player, data);
      return true;
    }
    if (player.controlTokens < 1) {
      stats.rejectedRate++;
      return false;
    }
    player.controlTokens -= 1;
    switch (op) {
      case NET_OP.HELLO:
        onHello(player, data);
        return true;
      case NET_OP.READY: {
        const payload = decodeJson(data);
        if (!payload || phase !== 'lobby' || !player.inLobby) return false;
        player.ready = payload.ready !== false;
        broadcastLobby();
        maybeStart();
        return true;
      }
      case NET_OP.PING: {
        const ping = decodePing(asBytes(data));
        if (!ping) return false;
        send(player.id, NET_OP.PONG, encodePong(ping.clientMs, serverTick));
        return true;
      }
      case NET_OP.KEYFRAME_REQ: {
        const req = decodeKeyframeRequest(asBytes(data));
        if (!req || !world || player.seat == null || phase === 'lobby') return false;
        if (serverTick - player.lastKeyframeTick < cfg.keyframeMinIntervalTicks) return false;
        return sendKeyframe(player, req.reason === KEYFRAME_REASON.DESYNC ? KEYFRAME_REASON.DESYNC : KEYFRAME_REASON.REQUEST);
      }
      default:
        return false;
    }
  }

  // ---- The tick ----

  function finishRace() {
    flushBatch();
    const table = world.standings();
    results = {
      tick: world.state.tick,
      hash: stateHash(world),
      standings: table.map((row) => ({
        place: row.place,
        seat: row.seat,
        car: row.car,
        driver: row.driver,
        finishUs: row.finishUs,
        human: seats[row.seat].owner != null,
        name: seats[row.seat].name,
      })),
    };
    phase = 'finished';
    broadcast(NET_OP.RESULT, encodeJson(results));
  }

  function stepRace() {
    const tick = world.state.tick;
    // A late joiner or rejoiner takes the wheel on the tick their first input is in hand.
    for (let i = 0; i < seats.length; i++) {
      const seat = seats[i];
      if (seat.pending && seat.connected && seat.queue.lastSeenTick >= 0) setSeatDriver(seat, true);
    }
    const mask = humanMask();
    batcher.beginTick(tick, mask);
    for (let i = 0; i < seats.length; i++) {
      const seat = seats[i];
      if (!seat.human) {
        delete seatInputs[i];
        continue;
      }
      seat.queue.take(tick, takeScratch);
      if (takeScratch.margin < 0) stats.heldTicks++;
      batcher.add(i, takeScratch.a, takeScratch.b, takeScratch.margin);
      seatInputs[i] = unpackFrame(takeScratch.a, takeScratch.b, tick, frameScratch[i]);
    }
    const events = world.step(seatInputs);
    if (cfg.onTick) cfg.onTick(tick, events, seatInputs, mask);
    if (world.state.tick % cfg.hashIntervalTicks === 0) {
      pendingHash = { tick: world.state.tick, hash: stateHash(world) };
    }
    if (world.state.done) {
      finishRace();
      return;
    }
    if (batcher.count >= cfg.inputBatchTicks || batcher.full) flushBatch();
  }

  function tick() {
    if (phase === 'starting' && serverTick >= startTick) phase = 'race';
    if (phase === 'race') stepRace();
    const inputRefill = cfg.inputRatePerSecond / 60;
    const controlRefill = cfg.controlRatePerSecond / 60;
    for (const player of players.values()) {
      player.inputTokens = Math.min(cfg.inputBurst, player.inputTokens + inputRefill);
      player.controlTokens = Math.min(cfg.controlBurst, player.controlTokens + controlRefill);
    }
    serverTick++;
  }

  return {
    join,
    leave,
    receive,
    tick,
    /** Starts the race now with whoever is in the lobby (for a lobby timeout). */
    start: startRace,
    stats,
    get phase() { return phase; },
    get serverTick() { return serverTick; },
    get startTick() { return startTick; },
    get raceTick() { return world ? world.state.tick : -1; },
    get world() { return world; },
    get results() { return results; },
    get seats() {
      return seats.map((s) => ({ id: s.id, human: s.human, owner: s.owner, connected: s.connected, pending: s.pending, name: s.name, car: s.car, driver: s.driver }));
    },
    get playerCount() { return players.size; },
    get connectedHumans() {
      let n = 0;
      for (let i = 0; i < seats.length; i++) if (seats[i].human && seats[i].connected) n++;
      return n;
    },
    lobby: lobbyView,
  };
}
