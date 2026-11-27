// Shared helpers for the online netcode tests and benchmark: scripted drivers and a
// one-call simulated match. Not a test file itself (no `.test.js` suffix).

import {
  BTN_DRIFT_BOOST_PRESSED,
  BTN_DRIFT_PRESSED,
  BTN_ITEM_PRESSED,
  BTN_ITEM_SWAP_PRESSED,
  EDGE_BUTTON_MASK,
  controlsToIntentFrame,
} from '../src/sim/intent.js';
import { stateHash } from '../src/sim/hash.js';
import { createGameplayCore } from '../src/sim/gameplay-core.js';
import { createLoopbackMatch, createSimNet } from '../src/net/sim-net.js';

/**
 * A scripted human. It drives with the same decision code the AI rivals use, read from
 * this client's own predicted world, so it laps properly, drifts, flies Sky Lanes and
 * uses items. On top of that it presses hop, drift-boost, item and item-swap on a fixed
 * schedule so every button is exercised.
 *
 * The decision code keeps per-kart notes (chosen lane, drift in progress, item timer).
 * The driver keeps its notes in a private gameplay core of its own, so the client's race
 * state is never touched and stays bit-identical with the server, and the notes survive
 * rollbacks.
 *
 * `style: 'keys'` snaps steering to full left, centre or full right like a keyboard;
 * `'stick'` keeps the analog value, which changes almost every tick.
 */
export function createScriptedDriver(options = {}) {
  const style = options.style ?? 'stick';
  const swapEvery = options.swapEvery ?? 211;
  const boostEvery = options.boostEvery ?? 97;
  const itemEvery = options.itemEvery ?? 157;
  const hopEvery = options.hopEvery ?? 293;
  let brain = null;
  let brainTrack = null;
  let notes = null;
  let keySteer = 0;
  const pressed = { drift: 0, boost: 0, item: 0, swap: 0 };
  const log = options.log ? [] : null;
  const state = { quiet: false };

  function controls(tick, client) {
    // Quiet: hands off, so every earlier press has time to land before counts are compared.
    if (state.quiet) return { steer: 0, throttle: 0 };
    const world = client.world;
    const actor = world.state.actors[client.localSeat];
    if (brainTrack !== world.track) {
      brain = createGameplayCore(world.track);
      brainTrack = world.track;
      notes = null;
    }
    const out = { steer: 0, throttle: 1, brake: 0, reverse: 0 };
    if (!actor.kart.fall) {
      brain.applyState(
        { elapsed: world.play.elapsed, actorStates: notes ? { [actor.id]: notes } : {}, objects: [] },
        world.state.actors,
      );
      Object.assign(out, brain.decide(actor, world.state.player, 1 / 60));
      notes = brain.captureState([actor]).actorStates[actor.id];
    }
    if (style === 'keys') {
      // Hysteresis so the "key" is not tapped every tick.
      if (out.steer > 0.35) keySteer = 1;
      else if (out.steer < -0.35) keySteer = -1;
      else if (Math.abs(out.steer) < 0.12) keySteer = 0;
      out.steer = keySteer;
    }
    if (tick > 200) {
      if (tick % swapEvery === 0) out.itemSwapPressed = true;
      if (tick % boostEvery === 0) out.driftBoostPressed = true;
      if (tick % itemEvery === 0) out.itemPressed = true;
      if (tick % hopEvery === 0) out.driftPressed = true;
    }
    const buttons = controlsToIntentFrame(tick, out).buttons;
    if (buttons & BTN_DRIFT_PRESSED) pressed.drift++;
    if (buttons & BTN_DRIFT_BOOST_PRESSED) pressed.boost++;
    if (buttons & BTN_ITEM_PRESSED) pressed.item++;
    if (buttons & BTN_ITEM_SWAP_PRESSED) pressed.swap++;
    if (log && (buttons & EDGE_BUTTON_MASK)) log.push([tick, buttons & EDGE_BUTTON_MASK]);
    return out;
  }

  return { controls, pressed, log, state };
}

export function countEdges(buttons, into) {
  if (buttons & BTN_DRIFT_PRESSED) into.drift++;
  if (buttons & BTN_DRIFT_BOOST_PRESSED) into.boost++;
  if (buttons & BTN_ITEM_PRESSED) into.item++;
  if (buttons & BTN_ITEM_SWAP_PRESSED) into.swap++;
  return into;
}

/**
 * Builds a match with `humans` scripted players and AI in the remaining seats, readies
 * everyone, and returns it with per-player bookkeeping:
 *   - the host's state hash at every hash tick and every event it produced
 *   - each client's hash checks, events and the button presses its driver made
 */
export function createTestMatch(options = {}) {
  const humans = options.humans ?? 2;
  const seatCount = options.seatCount ?? 6;
  const net = createSimNet({ seed: options.netSeed ?? 0x51a7 });
  const hostHashes = new Map();
  const hashEvery = options.host?.hashIntervalTicks ?? 30;
  const hostEvents = [];
  const hostPresses = [];
  for (let i = 0; i < seatCount; i++) hostPresses.push({ drift: 0, boost: 0, item: 0, swap: 0 });

  const match = createLoopbackMatch({
    net,
    host: {
      courseId: options.courseId ?? 'track01',
      seed: options.seed ?? 1234,
      laps: options.laps ?? 3,
      seatCount,
      startDelayTicks: options.startDelayTicks ?? 90,
      ...options.host,
      onTick(tick, events, inputs, mask) {
        for (let i = 0; i < events.length; i++) hostEvents.push({ ...events[i], tick });
        for (let s = 0; s < seatCount; s++) {
          if (mask & (1 << s)) countEdges(inputs[s].buttons, hostPresses[s]);
        }
        const w = match.host.world;
        if (w.state.tick % hashEvery === 0 || w.state.done) hostHashes.set(w.state.tick, stateHash(w));
        if (options.onHostTick) options.onHostTick(tick, events, inputs, mask);
      },
    },
  });

  const players = [];
  function addPlayer(index, conditions, extra = {}) {
    const driver = createScriptedDriver({ style: extra.style ?? (index % 2 ? 'keys' : 'stick'), log: true, ...extra.driver });
    const record = { id: 'p' + index, driver, events: [], hashChecks: [], ep: null };
    record.ep = match.connect(record.id, conditions, {
      hello: { car: extra.car ?? 'apex', driver: 'sproto', name: 'Player ' + index },
      controls: driver.controls,
      frameMs: extra.frameMs,
      frameOffsetMs: 1 + ((index * 5) % 13),
      perfNow: options.perfNow,
      onEvent: (ev) => record.events.push(ev),
      onHashCheck: (tick, local, host) => record.hashChecks.push([tick, local, host]),
      ...options.client,
      ...extra.client,
    });
    players.push(record);
    return record;
  }

  const conditions = options.conditions ?? { latencyMs: 60, jitterMs: 10 };
  for (let i = 0; i < humans; i++) {
    addPlayer(i, Array.isArray(conditions) ? conditions[i % conditions.length] : conditions, options.playerOptions?.[i]);
  }

  /** Lets hellos land, then readies everyone so the host starts the race. */
  function start() {
    net.runFor(options.lobbyMs ?? 1500);
    for (const p of players) p.ep.client.setReady(true);
  }

  /** Runs until the host finishes the race or `maxSeconds` of race time pass. */
  function runRace(maxSeconds = 600) {
    const end = net.now() + maxSeconds * 1000;
    while (match.host.phase !== 'finished' && net.now() < end) net.runFor(500);
    // Let the last messages reach every client.
    net.runFor(3000);
    return match.host.phase === 'finished';
  }

  /** Drivers let go of everything, then the network drains. */
  function settle(ms = 2500) {
    for (const p of players) p.driver.state.quiet = true;
    net.runFor(ms);
  }

  return { net, match, host: match.host, players, addPlayer, start, runRace, settle, hostHashes, hostEvents, hostPresses };
}

/** Multiset comparison key for an event: what happened to whom, ignoring the tick. */
export function eventKey(ev) {
  return ev.type + '|' + (ev.seat ?? '') + '|' + (ev.name ?? ev.pickupIndex ?? '');
}

export function tally(events) {
  const counts = new Map();
  for (const ev of events) {
    const key = eventKey(ev);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
