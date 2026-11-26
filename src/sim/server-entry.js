// Server simulation bundle entry point (built into dist/racer-sim.server.js).
// Zero Three.js, DOM, WebGL, timers, or Math.random. Safe under Nakama 3.41 Object.freeze.

import { CIRCUITS, courseById, createTrackCore } from './track-core.js';
import { SIM_DT, SIM_HZ, MAX_SEATS, createSimWorld } from './world.js';
import { captureSnapshot, applySnapshot, encodeWireSnapshot, decodeWireKart } from './snapshot.js';
import { stateHash } from './hash.js';
import {
  INTENT_FRAME_BYTES,
  controlsToIntentFrame,
  intentFrameToControls,
  encodeIntentFrame,
  decodeIntentFrame,
  intentFrameToTuple,
  tupleToIntentFrame,
} from './intent.js';
import { REPLAY_SCHEMA, createLogRecorder, replayLog, chunkLog, joinChunks } from './replay.js';
import { CARS, DRIVERS } from '../roster.js';
import { ITEMS } from '../items.js';

export const SIM_LIMITS = {
  simHz: SIM_HZ,
  dt: SIM_DT,
  maxSeats: MAX_SEATS,
  intentFrameBytes: INTENT_FRAME_BYTES,
};

export function contentManifest() {
  return {
    circuits: CIRCUITS.map((c) => ({ id: c.id, name: c.name, sectors: c.names.length })),
    cars: CARS.map((c) => ({ id: c.id, speed: c.speed, accel: c.accel, turn: c.turn })),
    drivers: DRIVERS.map((d) => d.id),
    items: ITEMS.map((it) => ({ name: it.name, weights: it.weights, charges: it.charges ?? 1 })),
  };
}

export function createMatch(options = {}) {
  return createSimWorld({
    finishRule: 'all_humans',
    ...options,
  });
}

export {
  CIRCUITS,
  courseById,
  createTrackCore,
  createSimWorld,
  captureSnapshot,
  applySnapshot,
  encodeWireSnapshot,
  decodeWireKart,
  stateHash,
  REPLAY_SCHEMA,
  createLogRecorder,
  replayLog,
  chunkLog,
  joinChunks,
  controlsToIntentFrame,
  intentFrameToControls,
  encodeIntentFrame,
  decodeIntentFrame,
  intentFrameToTuple,
  tupleToIntentFrame,
};
