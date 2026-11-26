// Multi-seat jitter-absorbing RemoteInputBuffer for authoritative server / host-relay simulation.
// Preserves sub-tick button edges across skipped/coalesced ticks while stripping edges on
// held-last fallback frames and clearing held buttons cleanly on disconnect.

import {
  EDGE_BUTTON_MASK,
  HELD_BUTTON_MASK,
  neutralIntentFrame,
} from '../sim/intent.js';
import { DEFAULT_MAX_SEATS, MAX_SEATS_LIMIT } from './protocol.js';

export function createSeatInputBuffer(options = {}) {
  const maxHistoryTicks = options.maxHistoryTicks ?? 180;
  const maxLeadTicks = options.maxLeadTicks ?? 16;
  const maxHoldTicks = options.maxHoldTicks ?? 15;

  const byTick = new Map();
  let lastConsumedTick = -1;
  let lastKnown = neutralIntentFrame(0);
  let lastReceivedTick = -1;
  let disconnected = false;

  function push(frame, referenceTick = null) {
    if (!frame || typeof frame.tick !== 'number' || frame.tick < 0) return false;
    const tick = frame.tick >>> 0;
    if (referenceTick !== null && tick > referenceTick + maxLeadTicks) return false;
    if (tick <= lastConsumedTick - maxHistoryTicks) return false;

    disconnected = false;
    const existing = byTick.get(tick);
    if (existing) {
      // Merge any edge flags if duplicate/coalesced packets report edges on the same tick.
      existing.steer = frame.steer;
      existing.throttle = frame.throttle;
      existing.brake = frame.brake;
      existing.reverse = frame.reverse;
      existing.buttons = (frame.buttons & ~EDGE_BUTTON_MASK) | ((existing.buttons | frame.buttons) & EDGE_BUTTON_MASK);
    } else {
      byTick.set(tick, {
        tick,
        steer: frame.steer | 0,
        throttle: frame.throttle & 0xff,
        brake: frame.brake & 0xff,
        reverse: frame.reverse & 0xff,
        buttons: frame.buttons & 0xffff,
        edgesConsumed: false,
      });
    }
    if (tick > lastReceivedTick) {
      lastReceivedTick = tick;
    }
    // Prune ancient ticks.
    if (byTick.size > maxHistoryTicks * 2) {
      const cutoff = tick - maxHistoryTicks;
      for (const k of byTick.keys()) {
        if (k < cutoff) byTick.delete(k);
      }
    }
    return true;
  }

  function pushMany(frames, referenceTick = null) {
    let accepted = 0;
    for (let i = 0; i < frames.length; i++) {
      if (push(frames[i], referenceTick)) accepted++;
    }
    return accepted;
  }

  function next(tick) {
    const t = tick >>> 0;
    if (disconnected) {
      lastConsumedTick = t;
      lastKnown = neutralIntentFrame(t);
      return lastKnown;
    }

    // Collect any unconsumed button edges from frames in (lastConsumedTick .. t]
    // so late-arriving or skipped frames never drop a drift hop, drift boost, or item use.
    let carriedEdges = 0;
    for (const [k, rec] of byTick.entries()) {
      if (k > lastConsumedTick && k <= t && !rec.edgesConsumed) {
        carriedEdges |= rec.buttons & EDGE_BUTTON_MASK;
        rec.edgesConsumed = true;
      }
      if (k < t - maxHistoryTicks) byTick.delete(k);
    }

    const exact = byTick.get(t);
    lastConsumedTick = t;

    if (exact) {
      exact.edgesConsumed = true;
      const out = {
        tick: t,
        steer: exact.steer,
        throttle: exact.throttle,
        brake: exact.brake,
        reverse: exact.reverse,
        buttons: (exact.buttons & HELD_BUTTON_MASK) | ((exact.buttons | carriedEdges) & EDGE_BUTTON_MASK),
      };
      lastKnown = { ...out, buttons: out.buttons & HELD_BUTTON_MASK };
      return out;
    }

    // Check if there is a slightly older frame <= t newer than lastKnown to refresh held state.
    let newestPast = null;
    for (const [k, rec] of byTick.entries()) {
      if (k < t && (!newestPast || k > newestPast.tick)) newestPast = rec;
    }
    if (newestPast && newestPast.tick > lastKnown.tick) {
      lastKnown = {
        tick: newestPast.tick,
        steer: newestPast.steer,
        throttle: newestPast.throttle,
        brake: newestPast.brake,
        reverse: newestPast.reverse,
        buttons: newestPast.buttons & HELD_BUTTON_MASK,
      };
    }

    const starvedTicks = lastReceivedTick < 0 ? Infinity : t - lastReceivedTick;
    if (starvedTicks > maxHoldTicks) {
      return {
        tick: t,
        steer: 0,
        throttle: 0,
        brake: 0,
        reverse: 0,
        buttons: carriedEdges & EDGE_BUTTON_MASK,
      };
    }

    return {
      tick: t,
      steer: lastKnown.steer,
      throttle: lastKnown.throttle,
      brake: lastKnown.brake,
      reverse: lastKnown.reverse,
      buttons: (lastKnown.buttons & HELD_BUTTON_MASK) | (carriedEdges & EDGE_BUTTON_MASK),
    };
  }

  /**
   * Non-destructive held-input peek for client-side forward prediction of remote karts.
   * Never consumes or emits one-shot edge flags.
   */
  function peekHeld(tick) {
    const t = tick >>> 0;
    if (disconnected) return neutralIntentFrame(t);
    const exact = byTick.get(t);
    if (exact) {
      return {
        tick: t,
        steer: exact.steer,
        throttle: exact.throttle,
        brake: exact.brake,
        reverse: exact.reverse,
        buttons: exact.buttons & HELD_BUTTON_MASK,
      };
    }
    return {
      tick: t,
      steer: lastKnown.steer,
      throttle: lastKnown.throttle,
      brake: lastKnown.brake,
      reverse: lastKnown.reverse,
      buttons: lastKnown.buttons & HELD_BUTTON_MASK,
    };
  }

  function markDisconnected() {
    disconnected = true;
    byTick.clear();
    lastKnown = neutralIntentFrame(Math.max(0, lastConsumedTick));
  }

  function reset() {
    disconnected = false;
    byTick.clear();
    lastConsumedTick = -1;
    lastReceivedTick = -1;
    lastKnown = neutralIntentFrame(0);
  }

  return {
    push,
    pushMany,
    next,
    peekHeld,
    markDisconnected,
    reset,
    get lastReceivedTick() { return lastReceivedTick; },
    get lastConsumedTick() { return lastConsumedTick; },
  };
}

export function createRemoteInputBuffer(options = {}) {
  const count = Math.max(1, Math.min(MAX_SEATS_LIMIT, options.seatCount ?? DEFAULT_MAX_SEATS));
  const seats = Array.from({ length: count }, () => createSeatInputBuffer(options));

  return {
    seatCount: count,
    seat(index) {
      return seats[index] ?? null;
    },
    push(seatIndex, frameOrFrames, referenceTick = null) {
      const buf = seats[seatIndex];
      if (!buf) return 0;
      return Array.isArray(frameOrFrames)
        ? buf.pushMany(frameOrFrames, referenceTick)
        : buf.push(frameOrFrames, referenceTick) ? 1 : 0;
    },
    sampleAll(tick, skipSeat = -1) {
      const out = Object.create(null);
      for (let i = 0; i < seats.length; i++) {
        if (i === skipSeat) continue;
        out[i] = seats[i].next(tick);
      }
      return out;
    },
    peekAllHeld(tick, skipSeat = -1) {
      const out = Object.create(null);
      for (let i = 0; i < seats.length; i++) {
        if (i === skipSeat) continue;
        out[i] = seats[i].peekHeld(tick);
      }
      return out;
    },
    markDisconnected(seatIndex) {
      seats[seatIndex]?.markDisconnected();
    },
    reset() {
      for (let i = 0; i < seats.length; i++) seats[i].reset();
    },
  };
}
