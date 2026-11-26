// Client-side prediction, server-snapshot reconciliation, remote-pack forward-stepping,
// and visual error smoothing for Sproto Racer's 60 Hz deterministic SimWorld.

import { damp, wrapAngle } from '../sim/math.js';
import { EDGE_BUTTON_MASK, HELD_BUTTON_MASK, neutralIntentFrame } from '../sim/intent.js';
import { applySnapshot, captureSnapshot } from '../sim/snapshot.js';
import { SIM_DT } from '../sim/world.js';

export function createPredictionSmoother(options = {}) {
  const snapThresholdMeters = options.snapThresholdMeters ?? 3.5;
  const decayRate = options.decayRate ?? 18;

  let offsetS = 0;
  let offsetX = 0;
  let offsetY = 0;
  let offsetYaw = 0;

  function recordCorrection(beforeKart, afterKart) {
    if (!beforeKart || !afterKart) {
      reset();
      return;
    }
    if ((beforeKart.rescues ?? 0) !== (afterKart.rescues ?? 0) || Boolean(beforeKart.fall) !== Boolean(afterKart.fall)) {
      reset();
      return;
    }
    const ds = beforeKart.s - afterKart.s;
    const dx = beforeKart.x - afterKart.x;
    const dy = beforeKart.y - afterKart.y;
    const distSq = ds * ds + dx * dx + dy * dy;
    if (distSq > snapThresholdMeters * snapThresholdMeters) {
      reset();
      return;
    }
    offsetS += ds;
    offsetX += dx;
    offsetY += dy;
    offsetYaw = wrapAngle(offsetYaw + wrapAngle((beforeKart.yaw || 0) - (afterKart.yaw || 0)));
  }

  function update(dt) {
    if (dt <= 0) return;
    offsetS = damp(offsetS, 0, decayRate, dt);
    offsetX = damp(offsetX, 0, decayRate, dt);
    offsetY = damp(offsetY, 0, decayRate, dt);
    offsetYaw = damp(offsetYaw, 0, decayRate, dt);
    if (Math.abs(offsetS) < 1e-4) offsetS = 0;
    if (Math.abs(offsetX) < 1e-4) offsetX = 0;
    if (Math.abs(offsetY) < 1e-4) offsetY = 0;
    if (Math.abs(offsetYaw) < 1e-4) offsetYaw = 0;
  }

  function applyToPose(pose, out = {}) {
    Object.assign(out, pose);
    out.s = pose.s + offsetS;
    out.x = pose.x + offsetX;
    out.y = pose.y + offsetY;
    out.yaw = (pose.yaw || 0) + offsetYaw;
    return out;
  }

  function reset() {
    offsetS = 0;
    offsetX = 0;
    offsetY = 0;
    offsetYaw = 0;
  }

  return {
    recordCorrection,
    update,
    applyToPose,
    reset,
    get errorMagnitude() {
      return Math.hypot(offsetS, offsetX, offsetY);
    },
    get offsets() {
      return { s: offsetS, x: offsetX, y: offsetY, yaw: offsetYaw };
    },
  };
}

export function createClientPredictor(options = {}) {
  const { world, localSeat = 0, remoteInputBuffer = null } = options;
  if (!world) throw new Error('createClientPredictor requires a SimWorld');
  const maxRollbackTicks = options.maxRollbackTicks ?? 180;
  const smoother = options.smoother ?? createPredictionSmoother(options.smootherOptions);

  const localHistory = new Map();
  const remoteHeldHistory = new Map();
  let lastAckTick = -1;

  function prune(olderThanTick) {
    for (const k of localHistory.keys()) {
      if (k < olderThanTick) localHistory.delete(k);
    }
    for (const k of remoteHeldHistory.keys()) {
      if (k < olderThanTick) remoteHeldHistory.delete(k);
    }
  }

  function buildSeatInputsForTick(tick, localFrame, explicitRemote = null) {
    const inputs = Object.create(null);
    inputs[localSeat] = localFrame;
    const actors = world.state.actors;
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i];
      if (a.id === localSeat || a.kind === 'ai') continue;
      if (explicitRemote && explicitRemote[a.id]) {
        const rf = explicitRemote[a.id];
        inputs[a.id] = { ...rf, tick, buttons: rf.buttons & ~EDGE_BUTTON_MASK };
      } else if (remoteInputBuffer) {
        inputs[a.id] = remoteInputBuffer.seat(a.id)?.peekHeld(tick) ?? neutralIntentFrame(tick);
      } else {
        const cached = remoteHeldHistory.get(tick)?.[a.id];
        inputs[a.id] = cached ? { ...cached, tick } : neutralIntentFrame(tick);
      }
    }
    return inputs;
  }

  /**
   * Steps the predicted client world forward by 1 tick (60 Hz) using local input
   * while forward-predicting remote human seats with their held steering/throttle
   * so high-speed pack racing never hits frozen remote karts.
   */
  function stepLocal(localIntentFrame, explicitRemoteBySeat = null) {
    const tick = world.state.tick;
    const frame = { ...localIntentFrame, tick };
    localHistory.set(tick, frame);

    const seatInputs = buildSeatInputsForTick(tick, frame, explicitRemoteBySeat);
    const heldRecord = Object.create(null);
    for (const [seatStr, inp] of Object.entries(seatInputs)) {
      const sId = Number(seatStr);
      if (sId !== localSeat && inp) {
        heldRecord[sId] = { ...inp, buttons: inp.buttons & HELD_BUTTON_MASK };
      }
    }
    remoteHeldHistory.set(tick, heldRecord);

    if (localHistory.size > maxRollbackTicks * 2) {
      prune(tick - maxRollbackTicks);
    }

    return world.step(seatInputs, SIM_DT);
  }

  /**
   * Reconciles local predicted `SimWorld` against an authoritative server snapshot at `snap.tick`:
   * 1. Captures pre-reconcile local kart pose.
   * 2. Restores authoritative `snap` (making server RNG & item roulette outcomes authoritative).
   * 3. Replays unacknowledged ticks `(snap.tick .. targetLocalTick)` with recorded local inputs
   *    and forward-stepped remote held inputs.
   * 4. Feeds any pose delta into `smoother` so small corrections blend imperceptibly.
   */
  function reconcile(authoritativeSnapshot) {
    if (!authoritativeSnapshot || typeof authoritativeSnapshot.tick !== 'number') return false;
    if (authoritativeSnapshot.tick <= lastAckTick) return false;

    const targetTick = world.state.tick;
    if (targetTick - authoritativeSnapshot.tick > maxRollbackTicks) {
      // Too far behind (e.g. tab backgrounded or socket rejoin): hard snap to authoritative state.
      applySnapshot(world, authoritativeSnapshot);
      smoother.reset();
      lastAckTick = authoritativeSnapshot.tick;
      prune(lastAckTick);
      return { resimulatedTicks: 0, hardSnapped: true };
    }

    const localActorBefore = world.state.actors[localSeat];
    const beforeKart = localActorBefore ? { ...localActorBefore.kart } : null;

    // Save authoritative roulette/held outcomes from server snapshot so client prediction
    // never overrides a contested pickup draw settled on the server (`M6`).
    applySnapshot(world, authoritativeSnapshot);
    lastAckTick = authoritativeSnapshot.tick;

    let resimulated = 0;
    while (world.state.tick < targetTick && !world.state.done) {
      const t = world.state.tick;
      const recordedLocal = localHistory.get(t) ?? neutralIntentFrame(t);
      const recordedRemote = remoteHeldHistory.get(t) ?? null;
      const seatInputs = buildSeatInputsForTick(t, recordedLocal, recordedRemote);
      world.step(seatInputs, SIM_DT);
      resimulated++;
    }

    const localActorAfter = world.state.actors[localSeat];
    const afterKart = localActorAfter ? localActorAfter.kart : null;
    smoother.recordCorrection(beforeKart, afterKart);
    prune(lastAckTick);

    return { resimulatedTicks: resimulated, hardSnapped: false };
  }

  function resync(authoritativeSnapshot) {
    localHistory.clear();
    remoteHeldHistory.clear();
    applySnapshot(world, authoritativeSnapshot);
    lastAckTick = authoritativeSnapshot.tick;
    smoother.reset();
  }

  function recentOutgoingFrames(count = 3) {
    const latest = world.state.tick - 1;
    const out = [];
    for (let i = 0; i < count; i++) {
      const f = localHistory.get(latest - i);
      if (f) out.push(f);
    }
    return out;
  }

  return {
    world,
    localSeat,
    smoother,
    stepLocal,
    reconcile,
    resync,
    recentOutgoingFrames,
    captureSnapshot: () => captureSnapshot(world),
    get lastAckTick() { return lastAckTick; },
  };
}
