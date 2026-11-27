#!/usr/bin/env node
// Records one simulated online match as a transcript of every call the server's match
// handler would make into the match host (join, leave, receive, tick), then replays it
// against the host inside build/racer-sim.js and checks the replay ends in the same race.
//
//   node --import ./tests/register-sdk-hook.js scripts/bench/host-transcript.mjs [out.json] [seats] [humans] [course]
//
// Defaults: 6 seats, 3 humans, track02, written to scripts/bench/prof/host-transcript.json
// (ignored by git). Then run the same transcript in Goja, the server's JavaScript engine:
//
//   cd scripts/bench/gojabench && go run . -host ../prof/host-transcript.json ../../../build/racer-sim.js
//
// Its "summary" line must equal the one printed here.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createTestMatch } from '../../tests/net-harness.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const out = process.argv[2] ?? path.join(HERE, 'prof', 'host-transcript.json');
const seatCount = Number(process.argv[3] ?? 6);
const humans = Number(process.argv[4] ?? 3);
const courseId = process.argv[5] ?? 'track02';

const hostOptions = { courseId, seed: 20261126, laps: 3, seatCount, startDelayTicks: 120 };
const match = createTestMatch({
  ...hostOptions,
  humans: 0,
  conditions: [{ latencyMs: 40, jitterMs: 8 }, { latencyMs: 90, jitterMs: 20 }, { latencyMs: 150, jitterMs: 35, stallChance: 0.002 }],
});

// Record every call into the host, in order. Players are added after the recorder is in
// place, so their joins and hellos are part of the transcript.
const calls = [];
const host = match.host;
const hex = (bytes) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('hex');
const { join, leave, receive, tick } = host;
host.join = (id, meta) => { calls.push(['j', id, meta?.name ?? id]); return join(id, meta); };
host.leave = (id) => { calls.push(['l', id]); return leave(id); };
host.receive = (id, op, data) => {
  calls.push(typeof data === 'string' ? ['r', id, op, 0, data] : ['r', id, op, 1, hex(data)]);
  return receive(id, op, data);
};
host.tick = () => { calls.push(['t']); return tick(); };

const conditions = [{ latencyMs: 40, jitterMs: 8 }, { latencyMs: 90, jitterMs: 20 }, { latencyMs: 150, jitterMs: 35, stallChance: 0.002 }];
for (let i = 0; i < humans; i++) match.addPlayer(i, conditions[i % conditions.length]);
match.start();
// One player drops for three seconds mid-race and comes back, so the transcript covers a
// seat handed to the AI and returned, and a rejoin keyframe.
match.net.runFor(20000);
if (humans > 1) {
  match.players[1].ep.disconnect();
  match.net.runFor(3000);
  match.players[1].ep.reconnect();
}
const finished = match.runRace(600);
if (!finished) throw new Error('the recorded race did not finish');

const live = { phase: host.phase, serverTick: host.serverTick, raceTick: host.raceTick, results: host.results };
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ options: hostOptions, calls }));

// Replay against the built bundle in a bare VM (no Node globals), as the server would load it.
const sandbox = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'build', 'racer-sim.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(HERE, 'host-replay.js'), 'utf8'), sandbox);
sandbox.__transcript = fs.readFileSync(out, 'utf8');
vm.runInContext('hostReplayLoad(__transcript)', sandbox);
const tickMs = [];
for (;;) {
  const t0 = performance.now();
  const kind = vm.runInContext('hostReplayNext()', sandbox);
  if (!kind) break;
  if (kind === 't') tickMs.push(performance.now() - t0);
}
const summary = vm.runInContext('hostReplaySummary()', sandbox);
const replayed = JSON.parse(summary);
const same = JSON.stringify(replayed.results) === JSON.stringify(live.results)
  && replayed.serverTick === live.serverTick && replayed.raceTick === live.raceTick && replayed.phase === live.phase;

tickMs.sort((a, b) => a - b);
const pct = (p) => tickMs[Math.min(tickMs.length - 1, Math.floor(tickMs.length * p))];
console.log(`recorded ${calls.length} calls (${tickMs.length} ticks, ${seatCount} seats, ${humans} humans, ${courseId}) to ${path.relative(ROOT, out)}`);
console.log(`replay in Node matches the live match: ${same ? 'yes' : 'NO'}`);
console.log(`host tick in Node: mean ${(tickMs.reduce((a, b) => a + b, 0) / tickMs.length).toFixed(3)} ms, p99 ${pct(0.99).toFixed(3)} ms, max ${tickMs[tickMs.length - 1].toFixed(2)} ms`);
console.log('summary ' + summary);
if (!same) process.exit(1);
