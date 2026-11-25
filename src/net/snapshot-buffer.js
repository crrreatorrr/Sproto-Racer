// Remote snapshot interpolation buffer for Sproto Racer.
// Critical invariant: `kart.s` is cumulative unwrapped race distance (-23.6m -> 3*track.length)
// and MUST NEVER be wrapped modulo track.length! Angles (`yaw`, `travelYaw`) use shortest-arc
// `lerpAngle`, and rescue teleports (`rescues` change or `fall` state transition) snap cleanly.

import { clamp, lerpAngle, mix } from '../sim/math.js';
import { SIM_HZ } from '../sim/world.js';
import { decodeWireKart } from '../sim/snapshot.js';

const TICK_MS = 1000 / SIM_HZ;

function normalizeSnapshotEntry(raw) {
  if (!raw) return null;
  // Supports both compact wire snapshots (`{ t, ms, k: [...] }`) and full world snapshots (`{ tick, actors }`).
  if (typeof raw.t === 'number' && Array.isArray(raw.k)) {
    const karts = raw.k.map(decodeWireKart);
    return {
      tick: raw.t >>> 0,
      timeMs: raw.t * TICK_MS,
      elapsed: (raw.ms ?? raw.t * TICK_MS) / 1000,
      countdown: (raw.cd ?? 0) / 1000,
      done: Boolean(raw.done),
      ack: raw.ack || null,
      karts,
      raw,
    };
  }
  if (typeof raw.tick === 'number' && Array.isArray(raw.actors)) {
    return {
      tick: raw.tick >>> 0,
      timeMs: raw.tick * TICK_MS,
      elapsed: raw.elapsed ?? (raw.tick / SIM_HZ),
      countdown: raw.countdown ?? 0,
      done: Boolean(raw.done),
      ack: raw.ack || null,
      karts: raw.actors.map((a) => ({
        id: a.id,
        ...a.kart,
        boostTier: a.boost?.tier ?? 0,
        boostReserve: a.boost?.reserve ?? 0,
        boostMeter: a.boost?.meter ?? 0,
        boostPips: a.boost?.pips ?? 0,
        held: a.held,
        charges: a.charges,
        shield: a.shield ?? 0,
        incoming: a.incoming ?? '',
        finishUs: a.finishUs ?? null,
      })),
      raw,
    };
  }
  return null;
}

function interpolateKart(a, b, alpha) {
  if (!a) return { ...b };
  if (!b) return { ...a };
  // Rescue teleport or fall transition: snap rather than dragging the kart across the circuit!
  if ((a.rescues ?? 0) !== (b.rescues ?? 0) || Boolean(a.fall) !== Boolean(b.fall)) {
    return alpha < 1 ? { ...a } : { ...b };
  }
  return {
    ...b,
    // Unwrapped cumulative distance along the race — NEVER modulo track.length!
    s: mix(a.s, b.s, alpha),
    x: mix(a.x, b.x, alpha),
    y: mix(a.y, b.y, alpha),
    vy: mix(a.vy ?? 0, b.vy ?? 0, alpha),
    speed: mix(a.speed ?? 0, b.speed ?? 0, alpha),
    reverseSpeed: mix(a.reverseSpeed ?? 0, b.reverseSpeed ?? 0, alpha),
    yaw: lerpAngle(a.yaw ?? 0, b.yaw ?? 0, alpha),
    travelYaw: lerpAngle(a.travelYaw ?? 0, b.travelYaw ?? 0, alpha),
    steer: mix(a.steer ?? 0, b.steer ?? 0, alpha),
    slipAngle: mix(a.slipAngle ?? 0, b.slipAngle ?? 0, alpha),
    pitch: mix(a.pitch ?? 0, b.pitch ?? 0, alpha),
    roll: mix(a.roll ?? 0, b.roll ?? 0, alpha),
    hopLift: mix(a.hopLift ?? 0, b.hopLift ?? 0, alpha),
    suspension: mix(a.suspension ?? 0, b.suspension ?? 0, alpha),
    stunRemaining: (b.stunRemaining ?? 0) > (a.stunRemaining ?? 0)
      ? (b.stunRemaining ?? 0)
      : mix(a.stunRemaining ?? 0, b.stunRemaining ?? 0, alpha),
  };
}

function extrapolateKart(b, extraSec) {
  if (extraSec <= 0 || b.fall || (b.rescues ?? 0) < 0) return { ...b };
  // Mild dead-reckoning along s & x capped to maxExtrapolateMs when a single snapshot is late.
  const fwdSpeed = (b.speed ?? 0) - (b.reverseSpeed ?? 0);
  const cosYaw = Math.cos(b.travelYaw ?? 0);
  const sinYaw = Math.sin(b.travelYaw ?? 0);
  return {
    ...b,
    s: b.s + fwdSpeed * cosYaw * extraSec,
    x: b.x + fwdSpeed * sinYaw * extraSec,
  };
}

export function createSnapshotBuffer(options = {}) {
  const interpolationDelayMs = options.interpolationDelayMs ?? 66;
  const maxSnapshots = options.maxSnapshots ?? 32;
  const maxExtrapolateMs = options.maxExtrapolateMs ?? 50;

  const buffer = [];

  function push(rawSnap) {
    const entry = normalizeSnapshotEntry(rawSnap);
    if (!entry) return false;
    // Ignore out-of-order or duplicate ticks.
    if (buffer.length > 0 && entry.tick <= buffer[buffer.length - 1].tick) {
      const existingIdx = buffer.findIndex((s) => s.tick === entry.tick);
      if (existingIdx >= 0) {
        buffer[existingIdx] = entry;
        return true;
      }
      if (entry.tick < buffer[0].tick) return false;
      buffer.push(entry);
      buffer.sort((a, b) => a.tick - b.tick);
    } else {
      buffer.push(entry);
    }
    while (buffer.length > maxSnapshots) buffer.shift();
    return true;
  }

  /**
   * Fast-resync after `MatchHandle.onRejoin`: drops stale pre-disconnect snapshots
   * and immediately anchors interpolation at the post-rejoin authoritative snapshot.
   */
  function resync(rawSnap) {
    buffer.length = 0;
    return push(rawSnap);
  }

  function sample(renderTimeMs) {
    if (buffer.length === 0) return null;
    const targetMs = renderTimeMs - interpolationDelayMs;

    if (buffer.length === 1 || targetMs <= buffer[0].timeMs) {
      const first = buffer[0];
      return {
        tick: first.tick,
        elapsed: first.elapsed,
        countdown: first.countdown,
        done: first.done,
        alpha: 0,
        karts: first.karts.map((k) => ({ ...k })),
      };
    }

    const last = buffer[buffer.length - 1];
    if (targetMs >= last.timeMs) {
      const extraMs = clamp(targetMs - last.timeMs, 0, maxExtrapolateMs);
      const extraSec = extraMs / 1000;
      return {
        tick: last.tick,
        elapsed: last.elapsed + extraSec,
        countdown: Math.max(0, last.countdown - extraSec),
        done: last.done,
        alpha: 1,
        karts: last.karts.map((k) => extrapolateKart(k, extraSec)),
      };
    }

    let idx = 0;
    while (idx + 1 < buffer.length - 1 && buffer[idx + 1].timeMs <= targetMs) {
      idx++;
    }
    const snapA = buffer[idx];
    const snapB = buffer[idx + 1];
    const span = Math.max(1e-6, snapB.timeMs - snapA.timeMs);
    const alpha = clamp((targetMs - snapA.timeMs) / span, 0, 1);

    const byIdA = new Map();
    for (let i = 0; i < snapA.karts.length; i++) byIdA.set(snapA.karts[i].id, snapA.karts[i]);

    const karts = snapB.karts.map((kb) => interpolateKart(byIdA.get(kb.id), kb, alpha));
    return {
      tick: snapA.tick,
      elapsed: mix(snapA.elapsed, snapB.elapsed, alpha),
      countdown: mix(snapA.countdown, snapB.countdown, alpha),
      done: alpha >= 1 ? snapB.done : snapA.done,
      alpha,
      karts,
    };
  }

  function clear() {
    buffer.length = 0;
  }

  return {
    push,
    resync,
    sample,
    clear,
    get size() { return buffer.length; },
    get latestTick() { return buffer.length ? buffer[buffer.length - 1].tick : -1; },
    get latestTimeMs() { return buffer.length ? buffer[buffer.length - 1].timeMs : 0; },
  };
}
