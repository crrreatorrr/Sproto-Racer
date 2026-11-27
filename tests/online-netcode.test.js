// End-to-end tests for input relay with rollback: a real match host and real rollback
// clients joined by simulated links (ordered, delayed, jittery, occasionally stalled).

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NET_OP } from '../src/net/index.js';
import { createTestMatch } from './net-harness.js';

const STALLS = { stallChance: 0.0004, stallMinMs: 200, stallMaxMs: 600 };

/**
 * Every hash the client checked equals the host's for that tick, and (when `complete`)
 * the client checked every hash tick the host produced, with none skipped.
 */
function assertHashesMatch(m, player, { complete = true, from = 0, repaired = false } = {}) {
  const client = player.ep.client;
  const checks = player.hashChecks.filter((c) => c[0] >= from);
  assert.ok(checks.length > 0, `${player.id} checked some hashes`);
  for (const [tick, local, host] of checks) {
    assert.equal(host, m.hostHashes.get(tick), `${player.id}: host hash relayed intact for tick ${tick}`);
    assert.equal(local, host, `${player.id}: confirmed state hash at tick ${tick}`);
  }
  if (complete) {
    if (!repaired) assert.equal(client.stats.hashMismatches, 0, `${player.id}: no mismatches`);
    const checked = new Set(checks.map((c) => c[0]));
    const last = checks[checks.length - 1][0];
    for (const tick of m.hostHashes.keys()) {
      if (tick >= Math.max(from, 30) && tick <= last) assert.ok(checked.has(tick), `${player.id}: hash tick ${tick} was checked`);
    }
    assert.ok(m.host.raceTick - last <= 90, `${player.id}: checks kept up to the end (${last} of ${m.host.raceTick})`);
  }
}

function assertPressesExact(m, player) {
  const seat = player.ep.client.localSeat;
  assert.deepEqual(m.hostPresses[seat], player.driver.pressed, `${player.id}: every press applied exactly once`);
}

describe('rollback netcode: every client agrees with the host', () => {
  // Seats 2, 6 and 12 mixing humans and AI, at 20, 60, 120 and 250 ms one way, with
  // jitter and occasional stalls. Scripted humans drift, boost, use and swap items.
  const cases = [];
  const circuits = ['track01', 'track02', 'track03'];
  let n = 0;
  for (const [seatCount, humans, seconds] of [[2, 2, 26], [6, 3, 18], [12, 4, 11]]) {
    for (const latencyMs of [20, 60, 120, 250]) {
      cases.push({ seatCount, humans, seconds, latencyMs, courseId: circuits[n++ % 3] });
    }
  }

  for (const c of cases) {
    it(`${c.seatCount} seats (${c.humans} human), ${c.latencyMs} ms, ${c.courseId}`, () => {
      const m = createTestMatch({
        courseId: c.courseId,
        seed: 1000 + c.latencyMs + c.seatCount,
        netSeed: 77 + c.latencyMs * c.seatCount,
        humans: c.humans,
        seatCount: c.seatCount,
        conditions: { latencyMs: c.latencyMs, jitterMs: Math.max(4, c.latencyMs / 4), ...STALLS },
      });
      m.start();
      m.net.runFor(c.seconds * 1000);
      m.settle();
      assert.equal(m.host.phase, 'race');
      assert.ok(m.host.raceTick > (c.seconds - 4) * 60, 'the race ran');
      assert.equal(m.host.stats.rejectedRate + m.host.stats.rejectedSeat + m.host.stats.rejectedMalformed, 0);
      for (const p of m.players) {
        const client = p.ep.client;
        assert.equal(client.phase, 'racing');
        assertHashesMatch(m, p);
        assertPressesExact(m, p);
        assert.equal(client.stats.keyframesApplied, 0, 'no resync was needed');
        assert.ok(client.world.state.actors[client.localSeat].kart.s > 50, `${p.id} drove`);
        // Lead covers the one-way trip; the present stays inside the rollback window.
        assert.ok(client.leadTicks >= Math.ceil(c.latencyMs / (1000 / 60)) + 1);
        assert.ok(client.stats.maxResimTicks <= 120);
      }
      const total = { drift: 0, boost: 0, item: 0, swap: 0 };
      for (const p of m.players) for (const k of Object.keys(total)) total[k] += p.driver.pressed[k];
      assert.ok(total.drift > 0 && total.boost > 0 && total.item > 0 && total.swap > 0, 'every button was pressed');
    });
  }
});

describe('rollback netcode: display refresh rate', () => {
  it('agrees with the host at 30, 60 and 144 frames per second', () => {
    const m = createTestMatch({
      courseId: 'track02',
      humans: 3,
      seatCount: 6,
      conditions: { latencyMs: 60, jitterMs: 12 },
      playerOptions: [{ frameMs: 1000 / 30 }, { frameMs: 1000 / 60 }, { frameMs: 1000 / 144 }],
    });
    m.start();
    m.net.runFor(16000);
    m.settle();
    for (const p of m.players) {
      assertHashesMatch(m, p);
      assertPressesExact(m, p);
      const client = p.ep.client;
      assert.ok(Math.abs(client.present - m.host.raceTick - client.leadTicks) <= 4, `${p.id} holds its lead`);
    }
    const [slow, , fast] = m.players.map((p) => p.ep.client.stats);
    assert.ok(slow.updates < 700 && fast.updates > 2400, 'the frame loops really ran at different rates');
    assert.ok(Math.abs(slow.ticks - fast.ticks) <= 4, 'and simulated the same number of ticks');
  });
});

describe('rollback netcode: seats changing hands', () => {
  it('a leaver is driven by AI from the same tick on every client, and gets the seat back on rejoin', () => {
    const m = createTestMatch({ humans: 3, seatCount: 6, conditions: { latencyMs: 60, jitterMs: 12 } });
    m.start();
    m.net.runFor(9000);
    const leaver = m.players[1];
    const stayers = [m.players[0], m.players[2]];
    const seat = leaver.ep.client.localSeat;
    const sBefore = m.host.world.state.actors[seat].kart.s;

    leaver.ep.disconnect();
    const leftAt = m.host.raceTick;
    m.net.runFor(5000);
    assert.equal(m.host.seats[seat].human, false);
    assert.equal(m.host.seats[seat].owner, leaver.id, 'the seat stays reserved');
    assert.equal(m.host.world.state.actors[seat].kind, 'ai');
    assert.ok(m.host.world.state.actors[seat].kart.s > sBefore + 100, 'the AI kept the kart racing');
    for (const p of stayers) {
      assert.equal(p.ep.client.world.state.actors[seat].kind, 'ai', `${p.id} sees the AI takeover`);
      assertHashesMatch(m, p);
    }

    const before = leaver.hashChecks.length;
    leaver.ep.reconnect();
    m.net.runFor(6000);
    assert.equal(m.host.seats[seat].human, true, 'the rejoiner drives again');
    assert.equal(leaver.ep.client.localSeat, seat);
    assert.ok(leaver.ep.client.stats.keyframesApplied >= 1, 'resynced from a keyframe');
    assert.ok(leaver.hashChecks.length > before + 5, 'and is checking hashes again');
    for (const p of stayers) assert.equal(p.ep.client.world.state.actors[seat].kind, 'remote');

    m.settle();
    for (const p of stayers) {
      assertHashesMatch(m, p);
      assertPressesExact(m, p);
      assert.equal(p.ep.client.stats.keyframesApplied, 0);
    }
    assertHashesMatch(m, leaver, { complete: false });
    assertHashesMatch(m, leaver, { from: leftAt + 5 * 60 + 240, complete: true });
  });

  it('a late joiner takes over an AI seat mid-race from a keyframe', () => {
    const m = createTestMatch({ humans: 2, seatCount: 6, conditions: { latencyMs: 60, jitterMs: 12 } });
    m.start();
    m.net.runFor(9000);
    const joinedAt = m.host.raceTick;
    assert.ok(joinedAt > 300);
    const late = m.addPlayer(2, { latencyMs: 120, jitterMs: 20 });
    m.net.runFor(9000);

    const client = late.ep.client;
    assert.equal(client.phase, 'racing');
    assert.equal(client.stats.keyframesApplied, 1);
    const seat = client.localSeat;
    assert.ok(seat >= 2, 'took a seat that was AI');
    assert.equal(m.host.seats[seat].human, true);
    assert.equal(m.host.seats[seat].owner, late.id);
    assert.ok(late.driver.pressed.boost > 0);

    m.settle();
    for (const p of m.players) {
      assert.equal(p.ep.client.world.state.actors[seat].kind, 'remote', `${p.id} sees the new driver`);
      assert.equal(p.ep.client.stats.hashMismatches, 0);
    }
    assertHashesMatch(m, m.players[0]);
    assertHashesMatch(m, m.players[1]);
    assertHashesMatch(m, late, { from: joinedAt + 240 });
    assertPressesExact(m, late);
    // AI seats remain, so one more player can still come in, into a different seat.
    const another = m.addPlayer(3, { latencyMs: 20 });
    m.net.runFor(4000);
    assert.equal(another.ep.client.phase, 'racing');
    assert.notEqual(another.ep.client.localSeat, seat);
  });

  it('refuses a late joiner when late join is off', () => {
    const m = createTestMatch({ humans: 1, seatCount: 2, host: { allowLateJoin: false }, conditions: { latencyMs: 20 } });
    m.start();
    m.net.runFor(5000);
    const late = m.addPlayer(1, { latencyMs: 20 });
    m.net.runFor(2000);
    assert.equal(late.ep.client.phase, 'error');
    assert.equal(late.ep.client.error, 'room_full');
  });
});

describe('rollback netcode: recovery', () => {
  it('detects a corrupted client state by hash and repairs it with a keyframe', () => {
    // One human and AI rivals: nothing triggers a rollback, so the damage would stay.
    const m = createTestMatch({ humans: 1, seatCount: 6, conditions: { latencyMs: 60, jitterMs: 10 } });
    m.start();
    m.net.runFor(9000);
    const p = m.players[0];
    const client = p.ep.client;
    assert.equal(client.stats.hashMismatches, 0);
    assert.equal(client.stats.rollbacks, 0);

    client.world.state.actors[3].kart.x += 1.5;
    client.world.state.actors[3].kart.speed *= 0.9;
    const corruptedAt = client.present;
    m.net.runFor(3000);
    assert.ok(client.stats.hashMismatches >= 1, 'the mismatch was noticed');
    assert.ok(client.stats.keyframeRequests >= 1);
    assert.ok(client.stats.keyframesApplied >= 1, 'a keyframe arrived');
    assert.ok(m.host.stats.keyframesSent >= 1);

    const mismatchesAfterRepair = client.stats.hashMismatches;
    m.net.runFor(8000);
    m.settle();
    assert.equal(client.stats.hashMismatches, mismatchesAfterRepair, 'no further mismatches');
    assertHashesMatch(m, p, { from: corruptedAt + 240, repaired: true });
    assert.ok(m.host.raceTick - client.frontier <= 12, 'following the host again');
  });

  it('catches up after a short freeze and resyncs from a keyframe after a long one', () => {
    const m = createTestMatch({ humans: 2, seatCount: 4, conditions: { latencyMs: 60, jitterMs: 10 } });
    m.start();
    m.net.runFor(7000);
    const frozen = m.players[0];
    const client = frozen.ep.client;

    // 1.5 s hidden tab: the stream kept arriving, so the client fast-forwards through it.
    frozen.ep.frame.pause(1500);
    m.net.runFor(1500);
    assert.ok(m.host.raceTick - client.present > 60, 'fell behind while frozen');
    m.net.runFor(1500);
    assert.ok(Math.abs(client.present - m.host.raceTick - client.leadTicks) <= 6, 'caught up to its usual lead');
    assert.equal(client.stats.keyframesApplied, 0, 'no keyframe needed for a short freeze');
    assertHashesMatch(m, frozen);

    // 14 s frozen: too far behind to replay, so it asks for the full state instead.
    frozen.ep.frame.pause(14000);
    m.net.runFor(14000);
    const behind = m.host.raceTick - client.present;
    assert.ok(behind > 700);
    m.net.runFor(4000);
    assert.equal(client.stats.keyframesApplied, 1);
    assert.ok(Math.abs(client.present - m.host.raceTick - client.leadTicks) <= 6);
    m.net.runFor(3000);
    m.settle();
    assert.equal(client.stats.hashMismatches, 0);
    assertHashesMatch(m, frozen, { complete: false });
    assertHashesMatch(m, m.players[1]);
    assert.equal(m.players[1].ep.client.stats.keyframesApplied, 0, 'the other player was unaffected');
  });

  it('waits at the edge of the rollback window when the server goes quiet, then carries on', () => {
    const m = createTestMatch({ humans: 2, seatCount: 4, conditions: { latencyMs: 60, jitterMs: 10 } });
    m.start();
    m.net.runFor(7000);
    const p = m.players[0];
    const client = p.ep.client;
    p.ep.down.stall(3000);
    m.net.runFor(2500);
    assert.ok(client.stalled, 'holding instead of predicting further');
    assert.equal(client.predictedTicks, 120);
    assert.ok(client.stats.stalledUpdates > 0);
    m.net.runFor(4000);
    assert.equal(client.stalled, false);
    assert.ok(client.predictedTicks < 40);
    m.settle();
    assert.equal(client.stats.keyframesApplied, 0, 'late is not lost: no keyframe needed');
    assertHashesMatch(m, p);
    assertHashesMatch(m, m.players[1]);
  });

  // Each of these used to leave the client waiting for a keyframe that never came.
  function tamper(link, change) {
    const deliver = link.deliver;
    link.deliver = (message) => {
      const out = change(message);
      if (out) deliver(out);
    };
  }

  it('asks again when a keyframe arrives damaged', () => {
    const m = createTestMatch({ humans: 1, seatCount: 4, conditions: { latencyMs: 60, jitterMs: 10 } });
    m.start();
    m.net.runFor(7000);
    const late = m.addPlayer(1, { latencyMs: 60, jitterMs: 10 });
    let damaged = 0;
    tamper(late.ep.down, (message) => {
      // First chunk of the first keyframe: flip a bit of the hash it carries.
      if (message.op === NET_OP.KEYFRAME && damaged === 0 && message.data[2] === 0) {
        damaged++;
        const data = message.data.slice();
        data[4 + 6] ^= 0x10;
        return { op: message.op, data };
      }
      return message;
    });
    m.net.runFor(8000);
    const client = late.ep.client;
    assert.equal(damaged, 1);
    assert.equal(client.stats.keyframeFailures, 1, 'the damaged keyframe was refused');
    assert.equal(client.stats.keyframesApplied, 1, 'a second one was fetched');
    assert.equal(client.phase, 'racing');
    assert.ok(client.synced);
    m.settle();
    assert.equal(client.stats.hashMismatches, 0);
    assert.ok(late.hashChecks.length > 5);
    assert.ok(m.host.raceTick - client.frontier <= 12);
  });

  it('resyncs after a gap in the stream, even right after a keyframe', () => {
    const m = createTestMatch({ humans: 1, seatCount: 4, conditions: { latencyMs: 60, jitterMs: 10 } });
    m.start();
    m.net.runFor(7000);
    const late = m.addPlayer(1, { latencyMs: 60, jitterMs: 10 });
    let keyframeSeen = false;
    let dropped = 0;
    tamper(late.ep.down, (message) => {
      if (message.op === NET_OP.KEYFRAME) keyframeSeen = true;
      // Lose the third batch after the first keyframe, well inside the host's one-second limit.
      if (message.op === NET_OP.INPUTS && keyframeSeen && ++dropped === 3) return null;
      return message;
    });
    m.net.runFor(8000);
    const client = late.ep.client;
    assert.equal(client.stats.streamGaps, 1);
    assert.equal(client.stats.keyframesApplied, 2);
    assert.ok(client.synced, 'not stuck waiting');
    assert.equal(client.phase, 'racing');
    m.settle();
    assert.equal(client.stats.hashMismatches, 0);
    assert.ok(m.host.raceTick - client.frontier <= 12);
  });

  it('says hello again when the first hello after a reconnect is lost', () => {
    const m = createTestMatch({ humans: 2, seatCount: 4, conditions: { latencyMs: 60, jitterMs: 10 } });
    m.start();
    m.net.runFor(7000);
    const p = m.players[0];
    const seat = p.ep.client.localSeat;
    p.ep.disconnect();
    m.net.runFor(2000);
    let lost = 0;
    tamper(p.ep.up, (message) => {
      if (message.op === NET_OP.HELLO && lost === 0) {
        lost++;
        return null;
      }
      return message;
    });
    p.ep.reconnect();
    m.net.runFor(1000);
    assert.equal(lost, 1);
    assert.equal(p.ep.client.synced, false, 'still waiting');
    m.net.runFor(6000);
    assert.ok(p.ep.client.synced, 'the retry got through');
    assert.equal(m.host.seats[seat].human, true);
    assert.equal(p.ep.client.stats.keyframesApplied, 1);
    m.settle();
    assert.equal(p.ep.client.stats.hashMismatches, 0);
  });

  it('retries the very first hello too', () => {
    const m = createTestMatch({ humans: 0, seatCount: 2, conditions: { latencyMs: 20 } });
    const net = m.net;
    // Open the player by hand so the first HELLO can be lost on the way up.
    const p = m.addPlayer(0, { latencyMs: 20 });
    p.ep.up.clear();
    net.runFor(1000);
    assert.equal(p.ep.client.phase, 'idle');
    net.runFor(2500);
    assert.equal(p.ep.client.phase, 'lobby', 'hello was sent again');
  });

  it('does not report a desync when the race ends earlier than this client predicted', () => {
    // Each driver brakes just before the finish line and floors it again eight ticks
    // out. The other client is still predicting "braking", so in its guess the race runs
    // a little longer than it really does. A hash on every tick makes the true final
    // tick a hash tick: the client must compare the final hash with the corrected state,
    // not with one taken along the abandoned guess.
    const brakeThenGo = (drive) => (tick, client) => {
      const controls = drive(tick, client);
      const world = client.world;
      const kart = world.state.actors[client.localSeat].kart;
      const left = world.track.length * world.state.laps - kart.s;
      if (left > 0 && left < 28) {
        const go = left <= kart.speed * (8 / 60) || kart.speed < 8;
        controls.throttle = go ? 1 : 0;
        controls.brake = go ? 0 : 1;
      }
      return controls;
    };
    let predictedLonger = 0;
    for (const seed of [5, 6, 7]) {
      const m = createTestMatch({
        courseId: 'track01',
        seed,
        laps: 1,
        humans: 2,
        seatCount: 2,
        host: { hashIntervalTicks: 1, finishGraceSeconds: 120 },
        conditions: { latencyMs: 120, jitterMs: 20 },
        playerOptions: [{ wrapControls: brakeThenGo }, { wrapControls: brakeThenGo }],
      });
      m.start();
      assert.ok(m.runRace(300), 'the race finished');
      const results = m.host.results;
      for (const p of m.players) {
        const client = p.ep.client;
        assert.equal(client.phase, 'finished');
        assert.equal(client.stats.hashMismatches, 0, `${p.id}: no false desync at the finish (seed ${seed})`);
        assert.equal(client.stats.keyframeRequests, 0);
        assert.ok(p.hashChecks.some((c) => c[0] === results.tick), 'the final hash was checked');
        // One hash rides on each two-tick batch, so about every second tick is checked.
        assert.ok(p.hashChecks.length > results.tick / 2 - 200, 'hashes were checked all race long');
        if (client.present > results.tick) predictedLonger++;
      }
    }
    assert.ok(predictedLonger >= 1, 'at least one client had predicted past the real end of the race');
  });
});
