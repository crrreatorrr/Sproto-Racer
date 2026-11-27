// The match host ships inside build/racer-sim.js, the bundle the server loads. This replays
// a recorded stretch of an online race against that bundle in a bare VM (no Node globals,
// as on the server) and checks it ends in the same race as the live host built from source.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { describe, it } from 'node:test';

import { stateHash } from '../src/sim/hash.js';
import { RACER_SIM_VERSION } from '../src/sim/version.js';
import { NET_VERSION } from '../src/net/protocol.js';
import { NET_OP } from '../src/net/wire.js';
import { createTestMatch } from './net-harness.js';

const BUNDLE = fs.readFileSync(new URL('../build/racer-sim.js', import.meta.url), 'utf8');
const DRIVER = fs.readFileSync(new URL('../scripts/bench/host-replay.js', import.meta.url), 'utf8');

function bareVm() {
  const sandbox = vm.createContext({});
  vm.runInContext(BUNDLE, sandbox);
  return sandbox;
}

describe('match host in the server bundle', () => {
  it('reports the wire versions and op codes a match handler needs', () => {
    const info = JSON.parse(vm.runInContext('JSON.stringify(RacerSim.netInfo())', bareVm()));
    assert.equal(info.simVersion, RACER_SIM_VERSION);
    assert.equal(info.netVersion, NET_VERSION);
    assert.equal(info.tickRate, 60);
    assert.deepEqual(info.op, { ...NET_OP });
  });

  it('replays a recorded race to the same state as the live host', () => {
    const hostOptions = { courseId: 'track01', seed: 77, laps: 3, seatCount: 6, startDelayTicks: 90 };
    const match = createTestMatch({ ...hostOptions, humans: 0 });
    const host = match.host;
    const calls = [];
    const { join, leave, receive, tick } = host;
    host.join = (id, meta) => { calls.push(['j', id, meta?.name ?? id]); return join(id, meta); };
    host.leave = (id) => { calls.push(['l', id]); return leave(id); };
    host.receive = (id, op, data) => {
      calls.push(typeof data === 'string' ? ['r', id, op, 0, data] : ['r', id, op, 1, Buffer.from(data).toString('hex')]);
      return receive(id, op, data);
    };
    host.tick = () => { calls.push(['t']); return tick(); };

    match.addPlayer(0, { latencyMs: 40, jitterMs: 8 });
    match.addPlayer(1, { latencyMs: 120, jitterMs: 30 });
    match.start();
    match.net.runFor(12000);
    match.players[1].ep.disconnect();
    match.net.runFor(2000);
    match.players[1].ep.reconnect();
    match.net.runFor(8000);
    assert.equal(host.phase, 'race');
    assert.ok(host.raceTick > 900, 'the recorded stretch is too short to mean anything');

    const sandbox = bareVm();
    vm.runInContext(DRIVER, sandbox);
    sandbox.transcript = JSON.stringify({ options: hostOptions, calls });
    vm.runInContext('hostReplayLoad(transcript); while (hostReplayNext()) {}', sandbox);
    const replayed = JSON.parse(vm.runInContext('hostReplaySummary()', sandbox));

    assert.equal(replayed.phase, host.phase);
    assert.equal(replayed.serverTick, host.serverTick);
    assert.equal(replayed.raceTick, host.raceTick);
    assert.equal(replayed.hash, stateHash(host.world));
    assert.deepEqual(replayed.stats, { ...host.stats });
    assert.ok(replayed.stats.keyframesSent >= 1, 'the rejoin did not get a keyframe');
    assert.ok(replayed.sends > 500);
  });
});
