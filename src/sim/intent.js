// Seat IntentSource contract and high-precision quantized IntentFrame wire codec.
// Uses int16 steering ([-32767..32767]) so 313 km/h straightRun micro-steering and
// powerslide counter-steering never chatter, plus explicit sub-tick edge flags for
// 120/144/240 Hz displays inside the 6-tick (100 ms) Perfect drift-boost window.

import { clamp } from './math.js';

export const BTN_DRIFT_HELD = 1 << 0;
export const BTN_DRIFT_PRESSED = 1 << 1;
export const BTN_DRIFT_RELEASED = 1 << 2;
export const BTN_DRIFT_BOOST_PRESSED = 1 << 3;
export const BTN_ITEM_PRESSED = 1 << 4;
export const BTN_ITEM_BACKWARD = 1 << 5;
export const BTN_BLASTERS_HELD = 1 << 6;
export const BTN_BLASTERS_PRESSED = 1 << 7;

export const HELD_BUTTON_MASK = BTN_DRIFT_HELD | BTN_ITEM_BACKWARD | BTN_BLASTERS_HELD;
export const EDGE_BUTTON_MASK =
  BTN_DRIFT_PRESSED | BTN_DRIFT_RELEASED | BTN_DRIFT_BOOST_PRESSED | BTN_ITEM_PRESSED | BTN_BLASTERS_PRESSED;

export const INTENT_FRAME_BYTES = 11;

export function quantizeSteer(steer) {
  return Math.round(clamp(steer || 0, -1, 1) * 32767);
}

export function dequantizeSteer(q) {
  return clamp((q | 0) / 32767, -1, 1);
}

export function quantizePedal(v) {
  return Math.round(clamp(v || 0, 0, 1) * 255);
}

export function dequantizePedal(q) {
  return clamp((q & 0xff) / 255, 0, 1);
}

export function packButtons(controls = {}) {
  let mask = 0;
  if (controls.driftHeld) mask |= BTN_DRIFT_HELD;
  if (controls.driftPressed) mask |= BTN_DRIFT_PRESSED;
  if (controls.driftReleased) mask |= BTN_DRIFT_RELEASED;
  if (controls.driftBoostPressed) mask |= BTN_DRIFT_BOOST_PRESSED;
  if (controls.itemPressed) mask |= BTN_ITEM_PRESSED;
  const itemBack = controls.itemBackward ?? ((controls.brake || 0) > 0.25 || (controls.reverse || 0) > 0.5);
  if (itemBack) mask |= BTN_ITEM_BACKWARD;
  if (controls.blasters) mask |= BTN_BLASTERS_HELD;
  if (controls.blastersPressed) mask |= BTN_BLASTERS_PRESSED;
  return mask;
}

export function controlsToIntentFrame(tick, controls = {}) {
  return {
    tick: tick >>> 0,
    steer: quantizeSteer(controls.steer),
    throttle: quantizePedal(controls.throttle),
    brake: quantizePedal(controls.brake),
    reverse: quantizePedal(controls.reverse),
    buttons: packButtons(controls),
  };
}

export function intentFrameToControls(frame, out = {}) {
  if (!frame) {
    out.steer = 0;
    out.throttle = 0;
    out.brake = 0;
    out.reverse = 0;
    out.driftHeld = false;
    out.driftPressed = false;
    out.driftReleased = false;
    out.driftBoostPressed = false;
    out.itemPressed = false;
    out.itemBackward = false;
    out.blasters = false;
    out.blastersPressed = false;
    return out;
  }
  const b = frame.buttons >>> 0;
  out.steer = dequantizeSteer(frame.steer);
  out.throttle = dequantizePedal(frame.throttle);
  out.brake = dequantizePedal(frame.brake);
  out.reverse = dequantizePedal(frame.reverse);
  out.driftHeld = Boolean(b & BTN_DRIFT_HELD);
  out.driftPressed = Boolean(b & BTN_DRIFT_PRESSED);
  out.driftReleased = Boolean(b & BTN_DRIFT_RELEASED);
  out.driftBoostPressed = Boolean(b & BTN_DRIFT_BOOST_PRESSED);
  out.itemPressed = Boolean(b & BTN_ITEM_PRESSED);
  out.itemBackward = Boolean(b & BTN_ITEM_BACKWARD);
  out.blasters = Boolean(b & BTN_BLASTERS_HELD);
  out.blastersPressed = Boolean(b & BTN_BLASTERS_PRESSED);
  return out;
}

export function neutralIntentFrame(tick = 0) {
  return { tick: tick >>> 0, steer: 0, throttle: 0, brake: 0, reverse: 0, buttons: 0 };
}

export function intentFramesEqualPayload(a, b) {
  return (
    !!a &&
    !!b &&
    a.steer === b.steer &&
    a.throttle === b.throttle &&
    a.brake === b.brake &&
    a.reverse === b.reverse &&
    a.buttons === b.buttons
  );
}

export function encodeIntentFrame(frame, target, offset = 0) {
  const bytes = target instanceof Uint8Array ? target : new Uint8Array(INTENT_FRAME_BYTES);
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, INTENT_FRAME_BYTES);
  view.setUint32(0, frame.tick >>> 0, true);
  view.setInt16(4, clamp(frame.steer | 0, -32767, 32767), true);
  view.setUint8(6, frame.throttle & 0xff);
  view.setUint8(7, frame.brake & 0xff);
  view.setUint8(8, frame.reverse & 0xff);
  view.setUint16(9, frame.buttons & 0xffff, true);
  return bytes;
}

export function decodeIntentFrame(bytes, offset = 0) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength - offset < INTENT_FRAME_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, INTENT_FRAME_BYTES);
  return {
    tick: view.getUint32(0, true),
    steer: view.getInt16(4, true),
    throttle: view.getUint8(6),
    brake: view.getUint8(7),
    reverse: view.getUint8(8),
    buttons: view.getUint16(9, true),
  };
}

export function intentFrameToTuple(frame) {
  return [
    frame.tick >>> 0,
    clamp(frame.steer | 0, -32767, 32767),
    frame.throttle & 0xff,
    frame.brake & 0xff,
    frame.reverse & 0xff,
    frame.buttons & 0xffff,
  ];
}

export function tupleToIntentFrame(tuple) {
  if (!Array.isArray(tuple) || tuple.length !== 6) return null;
  const [tick, steer, throttle, brake, reverse, buttons] = tuple;
  if (!Number.isInteger(tick) || tick < 0) return null;
  if (!Number.isInteger(steer) || steer < -32768 || steer > 32767) return null;
  if (!Number.isInteger(throttle) || throttle < 0 || throttle > 255) return null;
  if (!Number.isInteger(brake) || brake < 0 || brake > 255) return null;
  if (!Number.isInteger(reverse) || reverse < 0 || reverse > 255) return null;
  if (!Number.isInteger(buttons) || buttons < 0 || buttons > 0xffff) return null;
  return { tick, steer, throttle, brake, reverse, buttons };
}

/**
 * Seat controller adapters matching Sproto Duel's IntentSource architecture.
 * Every seat in a race is driven by a `local`, `ai`, `remote`, or `replay` source.
 */
export function createLocalIntentSource(getControls) {
  return {
    kind: 'local',
    sample(tick) {
      return controlsToIntentFrame(tick, getControls ? getControls(tick) : {});
    },
  };
}

export function createAiIntentSource() {
  return {
    kind: 'ai',
    sample() {
      return null; // AI seats run directly inside SimWorld using exact float steerForTurn.
    },
  };
}

export function createRemoteIntentSource(buffer) {
  return {
    kind: 'remote',
    sample(tick) {
      return buffer.next(tick);
    },
    reset() {
      buffer.reset();
    },
  };
}

export function createReplayIntentSource(framesByTick) {
  let cursor = 0;
  let held = neutralIntentFrame(0);
  return {
    kind: 'replay',
    sample(tick) {
      while (cursor < framesByTick.length && framesByTick[cursor].tick <= tick) {
        const rec = framesByTick[cursor++];
        if (rec.tick === tick) {
          held = { ...rec, buttons: rec.buttons & HELD_BUTTON_MASK };
          return rec;
        }
        held = { ...rec, buttons: rec.buttons & HELD_BUTTON_MASK };
      }
      return { ...held, tick };
    },
    reset() {
      cursor = 0;
      held = neutralIntentFrame(0);
    },
  };
}
