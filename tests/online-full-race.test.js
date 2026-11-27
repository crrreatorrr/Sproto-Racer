// Full three-lap online races, start to finish, on all three circuits: a real match host
// and real rollback clients over simulated links with latency, jitter and stalls.
// Kept apart from online-netcode.test.js so the two files run in parallel.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { stateHash } from '../src/sim/hash.js';
import { createTestMatch, tally } from './net-harness.js';

const STALLS = { stallChance: 0.0004, stallMinMs: 200, stallMaxMs: 600 };

function assertHashesMatch(m, player) {
  const client = player.ep.client;
  assert.ok(player.hashChecks.length > 0);
  for (const [tick, local, host] of player.hashChecks) {
    assert.equal(host, m.hostHashes.get(tick), `${player.id}: host hash relayed intact for tick ${tick}`);
    assert.equal(local, host, `${player.id}: confirmed state hash at tick ${tick}`);
  }
  assert.equal(client.stats.hashMismatches, 0, `${player.id}: no mismatches`);
  const checked = new Set(player.hashChecks.map((c) => c[0]));
  for (const tick of m.hostHashes.keys()) {
    if (tick >= 30) assert.ok(checked.has(tick), `${player.id}: hash tick ${tick} was checked`);
  }
}

describe('rollback netcode: full races', () => {
  function assertEventsOnce(m, player, finalTick) {
    const cancelled = new Set(player.events.filter((e) => e.type === 'cancel').map((e) => e.event));
    const seen = new Set();
    for (const ev of player.events) {
      assert.ok(!seen.has(ev), 'no event object delivered twice');
      seen.add(ev);
    }
    const predicted = player.events.filter((e) => e.type !== 'cancel' && e.type !== 'finish' && !cancelled.has(e));
    const hostPredicted = m.hostEvents.filter((e) => e.type !== 'finish' && e.tick < finalTick);
    assert.deepEqual(
      [...tally(predicted)].sort(),
      [...tally(hostPredicted)].sort(),
      `${player.id}: every event once (after cancellations), none missing, none doubled`,
    );
    const finishes = player.events.filter((e) => e.type === 'finish').map((e) => [e.tick, e.seat, e.finishUs]);
    const hostFinishes = m.hostEvents.filter((e) => e.type === 'finish').map((e) => [e.tick, e.seat, e.finishUs]);
    assert.deepEqual(finishes, hostFinishes, `${player.id}: finishes delivered once, only when final`);
    assert.ok(player.events.filter((e) => e.type === 'finish').every((e) => e.confirmed));
  }

  function runFullRace(options) {
    const flying = { ticks: 0 };
    const m = createTestMatch({
      ...options,
      // Wait for every human, however far behind the leading AI. These "humans" are the rival
      // autopilot sent through human controls, so mid-slide steering easing slows them: the
      // slowest finishes about 130 s after the winner on track01.
      host: { finishGraceSeconds: 200 },
      onHostTick() {
        const actors = m.host.world.state.actors;
        for (let i = 0; i < options.humans; i++) if (actors[i].kart.flying) flying.ticks++;
      },
    });
    m.start();
    assert.ok(m.runRace(560), 'the race finished');
    const results = m.host.results;
    assert.equal(results.tick, m.host.raceTick);
    assert.equal(results.standings.length, options.seatCount);
    assert.ok(flying.ticks > 200, `humans flew Sky Lanes (${flying.ticks} kart-ticks)`);
    const humansFinished = results.standings.filter((r) => r.human && r.finishUs != null).length;
    assert.equal(humansFinished, options.humans, 'every human completed three laps');
    for (const p of m.players) {
      const client = p.ep.client;
      assert.equal(client.phase, 'finished');
      assert.deepEqual(client.results, results);
      assert.equal(client.frontier, results.tick);
      assert.equal(stateHash(client.world), results.hash, `${p.id}: final state equals the host's`);
      assertHashesMatch(m, p);
      assert.ok(p.hashChecks.some((c) => c[0] === results.tick), 'the final hash was checked');
      assert.equal(client.stats.keyframesApplied, 0);
      assertEventsOnce(m, p, results.tick);
      // Presses: everything sampled well before the end was applied, nothing was doubled.
      const seat = client.localSeat;
      const early = { drift: 0, boost: 0, item: 0, swap: 0 };
      for (const [tick, buttons] of p.driver.log) {
        if (tick < results.tick - 150) {
          if (buttons & 2) early.drift++;
          if (buttons & 8) early.boost++;
          if (buttons & 16) early.item++;
          if (buttons & (1 << 16)) early.swap++;
        }
      }
      for (const k of Object.keys(early)) {
        assert.ok(m.hostPresses[seat][k] >= early[k], `${p.id}: no ${k} press lost`);
        assert.ok(m.hostPresses[seat][k] <= p.driver.pressed[k], `${p.id}: no ${k} press applied twice`);
      }
    }
    return m;
  }

  it('track01: 6 seats, 3 humans at 20, 60 and 120 ms, three laps to the finish', () => {
    const m = runFullRace({
      courseId: 'track01',
      seed: 4242,
      humans: 3,
      seatCount: 6,
      conditions: [
        { latencyMs: 20, jitterMs: 6, ...STALLS },
        { latencyMs: 60, jitterMs: 15, ...STALLS },
        { latencyMs: 120, jitterMs: 30, ...STALLS },
      ],
    });
    const stalls = m.players.reduce((n, p) => n + p.ep.up.stalls + p.ep.down.stalls, 0);
    assert.ok(stalls >= 3, `links stalled ${stalls} times during the race`);
  });

  it('track02: 2 humans at 60 and 250 ms, three laps to the finish', () => {
    runFullRace({
      courseId: 'track02',
      seed: 777,
      humans: 2,
      seatCount: 2,
      conditions: [
        { latencyMs: 60, jitterMs: 15, ...STALLS },
        { latencyMs: 250, jitterMs: 40, ...STALLS },
      ],
    });
  });

  it('track03: 2 humans at 20 and 120 ms, three laps to the finish', () => {
    runFullRace({
      courseId: 'track03',
      seed: 31337,
      humans: 2,
      seatCount: 2,
      conditions: [
        { latencyMs: 20, jitterMs: 6, ...STALLS },
        { latencyMs: 120, jitterMs: 30, ...STALLS },
      ],
    });
  });
});
