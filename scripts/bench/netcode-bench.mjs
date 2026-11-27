#!/usr/bin/env node
// Measures the online netcode in a simulated match: bandwidth per player (including
// base64 and the Nakama JSON envelope), messages per second, how many ticks each client
// re-simulates per frame and what that costs, and keyframe sizes.
//
//   node --import ./tests/register-sdk-hook.js scripts/bench/netcode-bench.mjs [seconds] [--quick]
//
// Every seat is human (the worst case for bandwidth and rollback). Half the scripted
// drivers steer like a keyboard, half like an analog stick.

import { createTestMatch } from '../../tests/net-harness.js';
import { captureSnapshot } from '../../src/sim/snapshot.js';
import { chunkBytes, encodeKeyframe, socketBytes, NET_OP } from '../../src/net/index.js';

const seconds = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 45;
const quick = process.argv.includes('--quick');
const kb = (n) => (n / 1000).toFixed(2);

function run({ seatCount, latencyMs, batch = 2, humans = seatCount, sendEvery = 2 }) {
  const m = createTestMatch({
    courseId: 'track01',
    seed: 2026,
    humans,
    seatCount,
    perfNow: () => performance.now(),
    host: { inputBatchTicks: batch },
    client: { sendEveryTicks: sendEvery },
    conditions: { latencyMs, jitterMs: Math.max(4, latencyMs / 4) },
  });
  m.start();
  // Skip the lobby, the countdown and the first second of racing.
  while (m.host.raceTick < 240) m.net.runFor(100);
  const t0 = m.net.now();
  const base = m.players.map((p) => ({ traffic: { ...p.ep.traffic }, stats: { ...p.ep.client.stats } }));
  const keyframes = [];
  while (m.net.now() - t0 < seconds * 1000) {
    m.net.runFor(1000);
    keyframes.push(encodeKeyframe(captureSnapshot(m.host.world)).length);
  }
  const elapsed = (m.net.now() - t0) / 1000;
  const acc = { down: 0, up: 0, downRaw: 0, upRaw: 0, downMsgs: 0, upMsgs: 0, resim: 0, frames: 0, maxResim: 0, resimMs: 0, maxResimMs: 0, lead: 0, predicted: 0, mismatches: 0, late: 0, cancelled: 0, events: 0, own: 0, ownLate: 0, ownCancelled: 0 };
  m.players.forEach((p, i) => {
    const t = p.ep.traffic;
    const s = p.ep.client.stats;
    const b = base[i];
    acc.down += t.downSocketBytes - b.traffic.downSocketBytes;
    acc.up += t.upSocketBytes - b.traffic.upSocketBytes;
    acc.downRaw += t.downBytes - b.traffic.downBytes;
    acc.upRaw += t.upBytes - b.traffic.upBytes;
    acc.downMsgs += t.downMessages - b.traffic.downMessages;
    acc.upMsgs += t.upMessages - b.traffic.upMessages;
    acc.resim += s.resimTicks - b.stats.resimTicks;
    acc.frames += s.updates - b.stats.updates;
    acc.resimMs += s.resimMs - b.stats.resimMs;
    acc.maxResim = Math.max(acc.maxResim, s.maxResimTicks);
    acc.maxResimMs = Math.max(acc.maxResimMs, s.maxResimMs);
    acc.lead += p.ep.client.leadTicks;
    acc.predicted += p.ep.client.predictedTicks;
    acc.mismatches += s.hashMismatches;
    acc.late += s.eventsLate - b.stats.eventsLate;
    acc.cancelled += s.eventsCancelled - b.stats.eventsCancelled;
    acc.events += s.eventsEmitted - b.stats.eventsEmitted;
    // The same shares for the player's own kart only (what their audio cues hang on).
    const seat = p.ep.client.localSeat;
    for (const ev of p.events) {
      if (ev.type === 'cancel') {
        if (ev.event.seat === seat) acc.ownCancelled++;
      } else if (ev.seat === seat) {
        acc.own++;
        if (ev.late) acc.ownLate++;
      }
    }
  });
  const n = m.players.length;
  return {
    seatCount, humans, latencyMs, batch, sendEvery,
    downKBs: acc.down / n / elapsed / 1000,
    upKBs: acc.up / n / elapsed / 1000,
    downRawKBs: acc.downRaw / n / elapsed / 1000,
    upRawKBs: acc.upRaw / n / elapsed / 1000,
    downMsgs: acc.downMsgs / n / elapsed,
    upMsgs: acc.upMsgs / n / elapsed,
    resimPerFrame: acc.resim / acc.frames,
    maxResim: acc.maxResim,
    resimMsPerFrame: acc.resimMs / acc.frames,
    maxResimMs: acc.maxResimMs,
    lead: acc.lead / n,
    predicted: acc.predicted / n,
    mismatches: acc.mismatches,
    lateShare: acc.late / Math.max(1, acc.events),
    cancelledShare: acc.cancelled / Math.max(1, acc.events),
    ownLateShare: acc.ownLate / Math.max(1, acc.own),
    ownCancelledShare: acc.ownCancelled / Math.max(1, acc.own),
    keyframeMin: Math.min(...keyframes),
    keyframeMean: keyframes.reduce((x, y) => x + y, 0) / keyframes.length,
    keyframeMax: Math.max(...keyframes),
  };
}

const rows = [];
for (const seatCount of [6, 12]) {
  for (const latencyMs of quick ? [60] : [20, 60, 120, 250]) {
    const r = run({ seatCount, latencyMs });
    rows.push(r);
    console.error(`done ${seatCount} seats @ ${latencyMs} ms`);
  }
}

console.log(`\n### Per player, every seat human, ${seconds} s of racing, relay batch 2 ticks, inputs sent every 2 ticks\n`);
console.log('| Seats | One-way latency | Down KB/s (payload only) | Up KB/s (payload only) | Msgs/s down / up | Input lead (ticks) | Re-simulated ticks per frame: mean / worst | Cost per frame: mean / worst (ms) | Hash mismatches |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of rows) {
  console.log(`| ${r.seatCount} | ${r.latencyMs} ms | ${r.downKBs.toFixed(2)} (${r.downRawKBs.toFixed(2)}) | ${r.upKBs.toFixed(2)} (${r.upRawKBs.toFixed(2)}) | ${r.downMsgs.toFixed(1)} / ${r.upMsgs.toFixed(1)} | ${r.lead.toFixed(1)} | ${r.resimPerFrame.toFixed(1)} / ${r.maxResim} | ${r.resimMsPerFrame.toFixed(2)} / ${r.maxResimMs.toFixed(2)} | ${r.mismatches} |`);
}

console.log('\n### Events revised by rollback (share of all events delivered)\n');
console.log('| Seats | Latency | All karts: first seen after a rollback | All karts: predicted, then undone | Own kart: first seen after a rollback | Own kart: predicted, then undone |');
console.log('| --- | --- | --- | --- | --- | --- |');
for (const r of rows) console.log(`| ${r.seatCount} | ${r.latencyMs} ms | ${(r.lateShare * 100).toFixed(1)}% | ${(r.cancelledShare * 100).toFixed(1)}% | ${(r.ownLateShare * 100).toFixed(1)}% | ${(r.ownCancelledShare * 100).toFixed(1)}% |`);

console.log('\n### Keyframe size (binary, before base64)\n');
console.log('| Seats | Smallest | Mean | Largest | Messages at 4,096 B per chunk | Largest on the socket |');
console.log('| --- | --- | --- | --- | --- | --- |');
for (const seatCount of [6, 12]) {
  const group = rows.filter((r) => r.seatCount === seatCount);
  const min = Math.min(...group.map((r) => r.keyframeMin));
  const max = Math.max(...group.map((r) => r.keyframeMax));
  const mean = group.reduce((x, r) => x + r.keyframeMean, 0) / group.length;
  const chunks = chunkBytes(new Uint8Array(max + 15 + seatCount * 8), 0);
  const onSocket = chunks.reduce((x, c) => x + socketBytes(c.length, 'down', NET_OP.KEYFRAME), 0);
  console.log(`| ${seatCount} | ${min} B | ${Math.round(mean)} B | ${max} B | ${chunks.length} | ${kb(onSocket)} KB |`);
}

if (!quick) {
  console.log('\n### Relay batch size and input send rate (12 seats, 60 ms)\n');
  console.log('| Relay batch | Client sends every | Down KB/s | Up KB/s | Msgs/s down / up | Re-simulated ticks per frame (mean) |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const [batch, sendEvery] of [[1, 1], [2, 1], [2, 2], [3, 2], [3, 3]]) {
    const r = run({ seatCount: 12, latencyMs: 60, batch, sendEvery });
    console.log(`| ${batch} tick${batch > 1 ? 's' : ''} | ${sendEvery} tick${sendEvery > 1 ? 's' : ''} | ${r.downKBs.toFixed(2)} | ${r.upKBs.toFixed(2)} | ${r.downMsgs.toFixed(1)} / ${r.upMsgs.toFixed(1)} | ${r.resimPerFrame.toFixed(1)} |`);
    console.error(`done batch ${batch} send ${sendEvery}`);
  }
  console.log('\n### Typical room: 6 seats, 3 humans and 3 AI\n');
  console.log('| Latency | Down KB/s | Up KB/s | Re-simulated ticks per frame: mean / worst | Cost per frame: mean / worst (ms) |');
  console.log('| --- | --- | --- | --- | --- |');
  for (const latencyMs of [20, 60, 120, 250]) {
    const r = run({ seatCount: 6, humans: 3, latencyMs });
    console.log(`| ${latencyMs} ms | ${r.downKBs.toFixed(2)} | ${r.upKBs.toFixed(2)} | ${r.resimPerFrame.toFixed(1)} / ${r.maxResim} | ${r.resimMsPerFrame.toFixed(2)} / ${r.maxResimMs.toFixed(2)} |`);
  }
}
