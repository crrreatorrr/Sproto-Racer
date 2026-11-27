// The online test race: a whole match inside the page, for building and measuring the
// client before a real server exists. Loaded only by the development switch
// (src/online-switch.js); a production build does not contain this file.
//
// What runs here is the real thing on both ends: the authoritative match host
// (src/net/match-host.js, the code the server will run) and, for this player, the real
// online race runner. They talk over simulated connections that delay messages the way a
// socket does (src/net/sim-net.js). The other "players" are rollback clients too, driven
// by the same decision code as the AI rivals, so their steering changes every tick like
// an analog stick: the hardest case for prediction.

import { racerSetup } from './roster.js';
import { createGameplayCore } from './sim/gameplay-core.js';
import { createLoopbackMatch, createSimNet } from './net/sim-net.js';
import { createOnlineRaceRunner } from './net/online-runner.js';

const TICK = 1 / 60;
const IDLE = Object.freeze({ steer: 0, throttle: 0 });

/**
 * A stand-in for a remote player. It keeps its driving notes (chosen lane, drift in
 * progress, item timer) in a gameplay core of its own, so the race state of the client it
 * drives is never touched and stays identical to the server's.
 */
function createBotDriver() {
  let brain = null;
  let brainTrack = null;
  let notes = null;
  const rev = { steer: 0, throttle: 0 };
  return function controls(_tick, client) {
    const world = client.world;
    const actor = world?.state.actors[client.localSeat];
    if (!actor || actor.kart.fall) return IDLE;
    if (world.state.countdown > 0) {
      // Rev for the start the way the AI seats do.
      rev.throttle = world.state.countdown < 0.52 + actor.id * 0.027 ? 1 : 0;
      return rev;
    }
    if (brainTrack !== world.track) {
      brain = createGameplayCore(world.track);
      brainTrack = world.track;
      notes = null;
    }
    brain.applyState(
      { elapsed: world.play.elapsed, actorStates: notes ? { [actor.id]: notes } : {}, objects: [] },
      world.state.actors,
    );
    const out = brain.decide(actor, world.state.player, TICK);
    notes = brain.captureState([actor]).actorStates[actor.id];
    return out;
  };
}

const sorted = (values) => Float64Array.from(values).sort();
const spread = (values) => {
  if (!values.length) return { mean: 0, p99: 0, max: 0 };
  const s = sorted(values);
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += s[i];
  const round = (v) => Math.round(v * 1000) / 1000;
  return { mean: round(sum / s.length), p99: round(s[Math.min(s.length - 1, Math.floor(s.length * 0.99))]), max: round(s[s.length - 1]) };
};

/**
 * `settings` is what `onlineSwitch` returned. `hello` is this player's { car, driver,
 * name }. `createWorld(config)` builds the race world to draw (the game passes its own
 * track and item layer). Returns the runner and what the game loop needs around it.
 */
export function createLoopbackRace({ settings, courseId, hello, createWorld, seed = (Math.random() * 0x100000000) >>> 0 }) {
  const net = createSimNet({ seed: seed ^ 0x4e4554 });
  const link = { latencyMs: settings.latencyMs, jitterMs: settings.jitterMs, stallChance: settings.stallChance };
  const match = createLoopbackMatch({
    net,
    host: {
      courseId,
      seed,
      laps: settings.laps,
      seatCount: settings.seats,
      // The garage has already applied the player's unlocks; the test host takes any racer.
      validateHello: (_id, choice) => ({ ok: true, value: { car: choice.car, driver: choice.driver } }),
    },
  });

  // The other players join first, so this player does not get seat 0: nothing drawn or
  // heard may depend on which seat the player holds.
  const bots = [];
  for (let i = 1; i < settings.humans; i++) {
    const setup = racerSetup(i, hello);
    const ep = match.connect('remote-' + i, link, {
      hello: { car: setup.car.id, driver: setup.driver.id, name: 'Remote ' + i },
      controls: createBotDriver(),
      frameOffsetMs: 1 + ((i * 5) % 13),
    });
    bots.push(ep);
    // They take a moment to ready up, like people do.
    const ready = net.every(1e9, 900 + i * 450, () => {
      ep.client.setReady(true);
      ready.stop();
    });
  }

  const hashChecks = { count: 0, different: 0, lastTick: -1 };
  const local = match.open('you', link, { name: hello.name });
  const runner = createOnlineRaceRunner({
    transport: local.transport,
    now: net.now,
    hello,
    autoHello: false,
    createWorld,
    client: {
      perfNow: () => performance.now(),
      onHashCheck(tick, mine, hosts) {
        hashChecks.count++;
        hashChecks.lastTick = tick;
        if (mine !== hosts) hashChecks.different++;
      },
    },
  });

  // This player says hello once the others' hellos have landed, and so sits after them.
  const greet = net.every(1e9, settings.jitterMs + 40, () => {
    runner.client.hello();
    greet.stop();
  });

  // Time on the simulated network follows the page's frame clock, starting at zero.
  let base = NaN;
  let lastFrame = 0;
  let lastReal = 0;
  const advanceMs = [];
  const pumpMs = [];
  const resimTicks = [];
  const itemFrameMs = [];
  let itemObjects = 0;
  let trailSum = 0;
  let trailFrames = 0;
  let resimSeen = 0;
  let racingFrames = 0;
  let resultsShown = false;

  function pump(now) {
    if (Number.isNaN(base)) base = now;
    lastFrame = now;
    lastReal = performance.now();
    const t0 = lastReal;
    net.runUntil(now - base);
    if (racingFrames) pumpMs.push(performance.now() - t0);
  }

  // A hidden page gets no frames, but a server would carry on: keep the host and the
  // other players running, so coming back exercises the client's catch-up.
  const background = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden && !Number.isNaN(base)) {
      net.runUntil(lastFrame - base + (performance.now() - lastReal));
    }
  }, 250);

  return {
    kind: 'loopback',
    settings,
    runner,
    match,
    // The game's own notes on this race: READY pressed, the lobby list last drawn, and
    // whether the first countdown beep has played.
    saidReady: false,
    shownLobby: '',
    counting: false,
    pump,
    /** Call after each `runner.advance` of a race frame with what that took. */
    noteFrame(ms) {
      if (runner.phase === 'waiting') return;
      racingFrames++;
      advanceMs.push(ms);
      const objects = runner.world.play.objects.length;
      if (objects > 0) {
        itemFrameMs.push(ms);
        itemObjects += objects;
        const fill = runner.world.play.trailFill?.() ?? -1;
        if (fill >= 0) {
          trailSum += fill;
          trailFrames++;
        }
      }
      const total = runner.client.stats.resimTicks;
      resimTicks.push(total - resimSeen);
      resimSeen = total;
    },
    /** True once, when the server's result has arrived. */
    finished() {
      if (resultsShown || runner.phase !== 'finished' || !runner.results()) return false;
      resultsShown = true;
      return true;
    },
    /** What the race cost and whether the client stayed in step with the host. */
    report() {
      const stats = runner.client.stats;
      const hostWorld = match.host.world;
      return {
        seats: settings.seats,
        humans: settings.humans,
        latencyMs: settings.latencyMs,
        jitterMs: settings.jitterMs,
        localSeat: runner.localSeat,
        phase: runner.phase,
        raceTicks: hostWorld ? hostWorld.state.tick : 0,
        frames: racingFrames,
        // Milliseconds per frame in this client's own online work: correcting, replaying
        // and stepping the race, then tidying item meshes and playing cues.
        clientMs: spread(advanceMs),
        // The same, over the frames that had item objects (shots, traps, shields) alive.
        clientMsWithItems: { ...spread(itemFrameMs), frames: itemFrameMs.length, objectsPerFrame: itemFrameMs.length ? Math.round(itemObjects / itemFrameMs.length * 10) / 10 : 0 },
        itemMeshes: runner.world.play.meshStats ?? null,
        // How complete the trails of shots in flight were when drawn, 0 to 1.
        trailFill: trailFrames ? Math.round(trailSum / trailFrames * 1000) / 1000 : null,
        // The in-page server and the other players. A real client does not pay this.
        loopbackMs: spread(pumpMs),
        replayedTicksPerFrame: spread(resimTicks),
        rollbacks: stats.rollbacks,
        replayMs: { total: Math.round(stats.resimMs), worst: Math.round(stats.maxResimMs * 1000) / 1000 },
        leadTicks: runner.net.leadTicks,
        rttMs: Math.round(runner.net.rttMs),
        hashChecks: hashChecks.count,
        hashDifferences: hashChecks.different,
        lastHashTick: hashChecks.lastTick,
        keyframeRequests: stats.keyframeRequests,
        keyframesApplied: stats.keyframesApplied,
        stalledFrames: stats.stalledUpdates,
        events: { announced: stats.eventsEmitted, late: stats.eventsLate, cancelled: stats.eventsCancelled },
        results: runner.results(),
      };
    },
    dispose() {
      clearInterval(background);
      match.stop();
      runner.dispose();
    },
  };
}
