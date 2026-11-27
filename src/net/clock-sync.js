// Clock and tick sync for the rollback client.
//
// The server counts ticks; the client needs to know which tick the server is on right
// now, and how far ahead of it to run so its inputs arrive before the server needs them
// (the input lead). Both come from ping/pong round trips:
//
//   - A pong says "when your ping reached me I was on tick S". Half the round trip later
//     the reply lands, so the server is now near S + rtt/2. The fastest recent round trip
//     is the most trustworthy sample, so that one anchors the estimate.
//   - The lead is the one-way trip in ticks, plus a margin for jitter, plus a small
//     safety allowance. The server also reports how early each seat's inputs actually
//     arrived, and that feedback nudges the lead up or down.
//
// The local tick clock never jumps for small errors: `createTickPacer` runs it a few
// percent fast or slow until it lines up. Only a large gap (a hidden tab, a long stall)
// is closed by stepping several ticks at once or by pausing.

const TICK_MS = 1000 / 60;

export function createClockSync(options = {}) {
  const tickMs = options.tickMs ?? TICK_MS;
  const windowSize = options.windowSize ?? 12;
  const fastPings = options.fastPings ?? 6;
  const fastIntervalMs = options.fastIntervalMs ?? 150;
  const intervalMs = options.intervalMs ?? 1000;
  // Fewest ticks of lead beyond the one-way trip: one for the server's tick boundary,
  // one spare.
  const safetyTicks = options.safetyTicks ?? 2;
  const jitterWeight = options.jitterWeight ?? 2;
  const maxLeadTicks = options.maxLeadTicks ?? 40;
  const minAdjust = options.minAdjust ?? -2;
  const maxAdjust = options.maxAdjust ?? 20;
  // Wanted server-side margin in ticks. Below `low` the lead grows; held above `high`
  // for a while it shrinks.
  const marginLow = options.marginLow ?? 1;
  const marginHigh = options.marginHigh ?? 4;
  const shrinkAfterReports = options.shrinkAfterReports ?? 90;
  const stallTicks = options.stallTicks ?? 6;

  const samples = []; // { atMs, serverTick, rttMs }
  const pending = new Map(); // ping token -> exact send time
  let pingsSent = 0;
  let lastPingMs = -Infinity;
  let rttMs = 0;
  let jitterMs = 0;
  let anchor = null;
  let adjust = 0;
  let comfortableReports = 0;
  let growCooldownUntilMs = -Infinity;

  function pickAnchor() {
    anchor = null;
    for (let i = 0; i < samples.length; i++) {
      if (!anchor || samples[i].rttMs <= anchor.rttMs) anchor = samples[i];
    }
  }

  return {
    get synced() { return samples.length >= Math.min(3, fastPings); },
    get rttMs() { return rttMs; },
    get jitterMs() { return jitterMs; },
    get samples() { return samples.length; },
    get adjust() { return adjust; },

    /** Returns the token to put in a PING when one is due, else -1. */
    pingDue(nowMs) {
      const gap = pingsSent < fastPings ? fastIntervalMs : intervalMs;
      if (nowMs - lastPingMs < gap) return -1;
      lastPingMs = nowMs;
      pingsSent++;
      const token = Math.floor(nowMs) >>> 0;
      if (pending.size > 32) pending.clear();
      pending.set(token, nowMs);
      return token;
    },

    /** Feed a PONG: the echoed token, the server's tick, and when the reply arrived. */
    onPong(token, serverTick, nowMs) {
      const sent = pending.get(token >>> 0);
      if (sent === undefined) return;
      pending.delete(token >>> 0);
      const rtt = Math.max(0, nowMs - sent);
      samples.push({ atMs: nowMs, serverTick, rttMs: rtt });
      if (samples.length > windowSize) samples.shift();
      // Median and median deviation, not averages: a pong held up by a stalled
      // connection is seconds late and must not drag the lead up with it.
      const sorted = samples.map((x) => x.rttMs).sort((x, y) => x - y);
      rttMs = sorted[sorted.length >> 1];
      const deviations = sorted.map((x) => Math.abs(x - rttMs)).sort((x, y) => x - y);
      jitterMs = deviations[deviations.length >> 1] * 1.5;
      pickAnchor();
    },

    /** Estimated server tick (fractional) at client time `nowMs`. NaN before the first pong. */
    serverTickAt(nowMs) {
      if (!anchor) return NaN;
      // +0.5: the server answers on a tick boundary, on average half a tick after arrival.
      return anchor.serverTick + 0.5 + (nowMs - anchor.atMs + anchor.rttMs / 2) / tickMs;
    },

    /**
     * Server-reported margin for the local seat: how many ticks before it was needed the
     * newest input had arrived. Late inputs grow the lead at once (with a cooldown so
     * one stall is not counted many times); a comfortable margin shrinks it slowly.
     */
    onMargin(margin, nowMs) {
      if (margin <= -128) return;
      if (margin < marginLow) {
        comfortableReports = 0;
        // Far too late means the connection stalled. No sensible lead covers that, so
        // only ordinary lateness (jitter, a slow route) grows the lead.
        if (marginLow - margin > stallTicks) {
          growCooldownUntilMs = Math.max(growCooldownUntilMs, nowMs + 1000);
        } else if (nowMs >= growCooldownUntilMs) {
          adjust = Math.min(maxAdjust, adjust + Math.min(2, marginLow - margin));
          growCooldownUntilMs = nowMs + Math.max(250, rttMs * 2);
        }
      } else if (margin > marginHigh) {
        comfortableReports++;
        if (comfortableReports >= shrinkAfterReports) {
          comfortableReports = 0;
          adjust = Math.max(minAdjust, adjust - 1);
        }
      } else {
        comfortableReports = 0;
      }
    },

    /** Ticks the client should run ahead of the server. `extraTicks` covers send batching. */
    leadTicks(extraTicks = 0) {
      const oneWay = (rttMs / 2 + jitterWeight * jitterMs) / tickMs;
      return Math.max(1, Math.min(maxLeadTicks, Math.ceil(oneWay) + safetyTicks + extraTicks + adjust));
    },

    reset() {
      samples.length = 0;
      pending.clear();
      anchor = null;
      pingsSent = 0;
      lastPingMs = -Infinity;
    },
  };
}

/**
 * Paces the local tick clock toward a moving target without visible jumps.
 * `advance(dtMs, targetTick)` returns how many whole ticks to simulate now.
 */
export function createTickPacer(options = {}) {
  const tickMs = options.tickMs ?? TICK_MS;
  // Rate change per tick of error, and its cap ("a few percent").
  const gain = options.gain ?? 0.03;
  const maxSkew = options.maxSkew ?? 0.04;
  // Beyond this many ticks behind, catch up by stepping extra ticks instead of skewing.
  const catchUpTicks = options.catchUpTicks ?? 10;
  // Beyond this many ticks ahead, wait.
  const waitTicks = options.waitTicks ?? 10;
  const maxTicksPerAdvance = options.maxTicksPerAdvance ?? 12;

  let clock = 0; // the local tick clock, fractional
  let rate = 1;

  return {
    get clock() { return clock; },
    get rate() { return rate; },
    reset(tick) {
      clock = tick;
      rate = 1;
    },
    /**
     * `presentTick` is how many ticks the caller has simulated. Returns how many more to
     * simulate now (never more than `maxTicksPerAdvance`; the rest follow on later calls).
     */
    advance(dtMs, targetTick, presentTick) {
      const error = targetTick - clock;
      if (error > catchUpTicks) {
        // Far behind: move the clock at once and let the caller step in bounded bursts.
        rate = 1;
        clock = targetTick - 1;
      } else if (error < -waitTicks) {
        rate = 0;
      } else {
        rate = 1 + Math.max(-maxSkew, Math.min(maxSkew, error * gain));
        clock += (Math.max(0, dtMs) / tickMs) * rate;
      }
      return Math.max(0, Math.min(maxTicksPerAdvance, Math.floor(clock) - presentTick));
    },
  };
}
