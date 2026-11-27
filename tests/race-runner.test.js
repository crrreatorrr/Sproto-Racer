// The RaceRunner interface: one way to drive a race, offline or online.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createSimWorld } from '../src/sim/world.js';
import { stateHash } from '../src/sim/hash.js';
import { controlsToIntentFrame } from '../src/sim/intent.js';
import { createLocalRaceRunner } from '../src/race-runner.js';
import { createLoopbackMatch, createOnlineRaceRunner, createSimNet } from '../src/net/index.js';
import { createScriptedDriver } from './net-harness.js';

const MEMBERS = [
  'kind', 'world', 'localSeat', 'localActor', 'phase', 'advance', 'tick', 'alpha', 'previousKart',
  'correction', 'resimulating', 'hud', 'drainEvents', 'results', 'net',
];

// Inputs that depend only on the tick, so two separate runs can be fed identically.
const tickControls = (tick) => ({
  throttle: 1,
  steer: Math.sin(tick / 47) * 0.35,
  driftPressed: tick % 173 === 0,
  driftBoostPressed: tick % 97 === 0,
  itemPressed: tick % 151 === 0,
  itemSwapPressed: tick % 211 === 0,
});

describe('local race runner', () => {
  it('is createSimWorld and nothing more: same inputs, same race', () => {
    const config = { courseId: 'track02', seed: 5 };
    const runner = createLocalRaceRunner(config);
    const bare = createSimWorld({ finishRule: 'primary', ...config });
    for (let t = 0; t < 900; t++) {
      runner.tick(tickControls(t));
      bare.step({ 0: controlsToIntentFrame(t, tickControls(t)) });
    }
    assert.equal(runner.world.state.tick, 900);
    assert.equal(stateHash(runner.world), stateHash(bare));
  });

  it('paces at a fixed 60 Hz from frame time and reports interpolation alpha', () => {
    const runner = createLocalRaceRunner({ courseId: 'track01', seed: 1 });
    let sampled = 0;
    const sample = (tick) => {
      sampled++;
      return tickControls(tick);
    };
    assert.equal(runner.advance(1 / 120, sample), 0, 'half a tick of time: nothing yet');
    assert.ok(Math.abs(runner.alpha - 0.5) < 1e-9);
    assert.equal(runner.advance(1 / 120, sample), 1);
    assert.equal(runner.advance(1 / 24, sample), 2, 'a slow frame steps twice');
    assert.equal(runner.advance(5, sample), 6, 'a long hitch is capped at 0.1 s');
    assert.equal(sampled, 9, 'controls sampled once per tick');
    assert.equal(runner.world.state.tick, 9);
  });

  it('delivers each event once and tracks lap, sector, position and the finish', () => {
    const runner = createLocalRaceRunner({ courseId: 'track01', seed: 21, laps: 1 });
    const driver = createScriptedDriver();
    const proxy = { world: runner.world, localSeat: runner.localSeat };
    const seen = [];
    const phases = new Set();
    const sectors = new Set();
    let previousS = null;
    while (runner.phase !== 'finished' && runner.world.state.tick < 60 * 200) {
      phases.add(runner.phase);
      runner.advance(1 / 60, (tick) => driver.controls(tick, proxy));
      seen.push(...runner.drainEvents());
      const hud = runner.hud();
      sectors.add(hud.sector);
      assert.ok(hud.position >= 1 && hud.position <= 6);
      if (runner.world.state.tick === 400) previousS = runner.previousKart(0).s;
      if (runner.world.state.tick === 400) assert.ok(runner.localActor.kart.s > previousS, 'previousKart is one tick behind');
    }
    assert.deepEqual([...phases], ['countdown', 'racing']);
    assert.equal(runner.phase, 'finished');
    assert.equal(runner.drainEvents().length, 0, 'drained events do not come back');
    assert.deepEqual(seen.filter((e) => e.type === 'tone').map((e) => e.name), ['count', 'count', 'go']);
    const finishes = seen.filter((e) => e.type === 'finish' && e.seat === 0);
    assert.equal(finishes.length, 1);
    const hud = runner.hud();
    assert.equal(hud.done, true);
    assert.equal(hud.finish, finishes[0].finish);
    assert.equal(hud.laps, 1);
    assert.ok(sectors.size >= 10, 'the sector readout followed the lap');
    assert.ok(hud.split && hud.split.seconds > 0);
    assert.equal(runner.results().length, 6);
    assert.equal(runner.correction(0), null);
    assert.equal(runner.net, null);

    runner.restart();
    assert.equal(runner.phase, 'countdown');
    assert.equal(runner.world.state.tick, 0);
  });
});

describe('online race runner', () => {
  function onlineMatch(playerCount, conditions, controlsFor) {
    const net = createSimNet({ seed: 9 });
    const match = createLoopbackMatch({ net, host: { courseId: 'track02', seed: 5, seatCount: 6, startDelayTicks: 90 } });
    const runners = [];
    for (let i = 0; i < playerCount; i++) {
      const ep = match.open('player' + i, conditions);
      const runner = createOnlineRaceRunner({
        transport: ep.transport,
        now: net.now,
        hello: { car: 'apex', driver: 'sproto', name: 'P' + i },
      });
      const record = { runner, ep, events: [], phases: new Set() };
      net.every(1000 / 60, 2 + i * 3, () => {
        record.phases.add(runner.phase);
        runner.advance(1 / 60, (tick) => controlsFor(tick, runner));
        record.events.push(...runner.drainEvents());
      });
      runners.push(record);
    }
    net.runFor(1500);
    for (const r of runners) r.runner.setReady(true);
    return { net, match, runners };
  }

  it('offers the same members as the local runner', () => {
    const local = createLocalRaceRunner({ courseId: 'track01', seed: 1 });
    const { runners } = onlineMatch(1, { latencyMs: 20 }, tickControls);
    for (const name of MEMBERS) {
      assert.ok(name in local, `local runner has ${name}`);
      assert.ok(name in runners[0].runner, `online runner has ${name}`);
      assert.equal(typeof local[name] === 'function', typeof runners[0].runner[name] === 'function', `${name} is the same kind of member`);
    }
  });

  it('runs the same engine: an online race equals the offline race with the same seats and inputs', () => {
    const { net, match, runners } = onlineMatch(1, { latencyMs: 20, jitterMs: 4 }, tickControls);
    net.runFor(22000);
    const host = match.host;
    assert.equal(host.phase, 'race');
    assert.equal(host.stats.heldTicks, 0, 'every input arrived in time');
    const start = JSON.parse(JSON.stringify(runners[0].runner.client.race));
    const offline = createLocalRaceRunner({
      courseId: start.courseId,
      seed: start.seed,
      laps: start.laps,
      finishRule: start.finishRule,
      seats: start.seats.map(({ kind, car, driver, gridIndex }) => ({ kind, car, driver, gridIndex })),
      localSeat: runners[0].runner.localSeat,
    });
    const ticks = host.raceTick;
    assert.ok(ticks > 1000);
    for (let t = 0; t < ticks; t++) offline.tick(tickControls(t));
    assert.equal(stateHash(offline.world), stateHash(host.world), 'offline and online produce the same race');
  });

  it('goes waiting, countdown, racing; draws a predicted world; delivers events once', () => {
    const drivers = [createScriptedDriver({ style: 'stick' }), createScriptedDriver({ style: 'keys' })];
    let index = 0;
    const byRunner = new Map();
    const { net, match, runners } = onlineMatch(2, { latencyMs: 60, jitterMs: 12 }, (tick, runner) => {
      if (!byRunner.has(runner)) byRunner.set(runner, drivers[index++]);
      return byRunner.get(runner).controls(tick, runner.client);
    });
    assert.equal(runners[0].runner.phase, 'waiting');
    assert.equal(runners[0].runner.world, null);
    assert.equal(runners[0].runner.hud(), null);
    net.runFor(20000);

    const hostEvents = [];
    for (const record of runners) {
      const { runner } = record;
      assert.deepEqual([...record.phases], ['waiting', 'countdown', 'racing']);
      assert.equal(runner.kind, 'online');
      assert.equal(runner.client.stats.hashMismatches, 0);
      assert.ok(runner.client.stats.hashChecks > 20);
      assert.ok(runner.client.stats.rollbacks > 0, 'the other human was predicted and corrected');
      const seat = runner.localSeat;
      assert.equal(runner.localActor, runner.world.state.actors[seat]);
      const net2 = runner.net;
      assert.ok(net2.synced && net2.rttMs > 100 && net2.rttMs < 200 && net2.leadTicks >= 5);
      assert.ok(net2.predictedTicks >= net2.leadTicks, 'the drawn world runs ahead of the confirmed one');
      assert.ok(runner.alpha >= 0 && runner.alpha <= 1);
      assert.equal(runner.resimulating, false);
      const hud = runner.hud();
      assert.equal(hud.racers, 6);
      assert.ok(hud.position >= 1 && hud.position <= 6 && hud.elapsed > 10);
      // previousKart is the pose one tick before the drawn one, in the corrected timeline.
      const now = runner.localActor.kart;
      const before = runner.previousKart(seat);
      assert.ok(now.s - before.s > 0.2 && now.s - before.s < 3, `one tick of travel (${now.s - before.s})`);
      const correction = runner.correction(seat === 0 ? 1 : 0);
      assert.deepEqual(Object.keys(correction).sort(), ['s', 'x', 'y', 'yaw']);
      // Tones are predicted events: exactly the three countdown beeps, once each.
      const tones = record.events.filter((e) => e.type === 'tone');
      assert.deepEqual(tones.map((e) => e.name), ['count', 'count', 'go']);
      assert.ok(record.events.some((e) => e.type === 'boost' && e.seat === seat));
      hostEvents.push(seat);
    }
    assert.notEqual(hostEvents[0], hostEvents[1], 'each player has their own seat');
    assert.equal(match.host.stats.rejectedRate + match.host.stats.rejectedSeat, 0);
  });
});
