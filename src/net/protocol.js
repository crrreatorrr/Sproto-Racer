// Wire protocol, room codes, Nakama match queries, and payload validators for Sproto Racer.
// Built for @metaverse/hub-sdk/realtime (`MatchHandle` + socket RPCs) without exposing live MP UI yet.

import { CIRCUITS } from '../sim/track-core.js';
import { RACER_SIM_VERSION } from '../sim/version.js';
import { decodeIntentFrame, encodeIntentFrame, INTENT_FRAME_BYTES } from '../sim/intent.js';
import { CARS, DRIVERS } from '../roster.js';
import { isUnlocked, RELIC_UNLOCKS } from '../hub/unlocks.js';

export { RACER_SIM_VERSION };

export const GAME_ID = 'sproto-racer';
export const MATCH_KIND = 'sproto_racer';
export const NET_VERSION = '2';
export const DEFAULT_MAX_SEATS = 6;
export const MAX_SEATS_LIMIT = 12;

export const RPC_IDS = Object.freeze({
  ROOM_CREATE: 'racer.room_create',
  ROOM_JOIN: 'racer.room_join',
  ONLINE_COUNT: 'racer.online_count',
});

export const OP = Object.freeze({
  HELLO: 1,
  WELCOME: 2,
  READY: 3,
  START: 4,
  INPUT: 5,
  SNAPSHOT: 6,
  RESULT: 7,
  OUTCOME: 8,
  PEER: 9,
  PING: 10,
  PONG: 11,
  RESYNC: 12,
  LOG: 13,
});

export const ROOM_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 6;

const ROOM_CHAR_SET = new Set(ROOM_ALPHABET);
const CAR_IDS = new Set(CARS.map((c) => c.id));
const DRIVER_IDS = new Set(DRIVERS.map((d) => d.id));
const COURSE_IDS = new Set(CIRCUITS.map((c) => c.id));

// Economy/authority keys that a client payload is never permitted to supply.
export const HOSTILE_KEYS = new Set([
  'winner',
  'earn',
  'tickets',
  'god',
  'stake',
  'reward',
  'payout',
  'admin',
  'balance',
  'relics',
  '__proto__',
  'constructor',
  'prototype',
]);

export function hasHostileKey(value, depth = 0) {
  if (depth > 6 || !value || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (hasHostileKey(value[i], depth + 1)) return true;
    }
    return false;
  }
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (HOSTILE_KEYS.has(k)) return true;
    if (hasHostileKey(value[k], depth + 1)) return true;
  }
  return false;
}

export function generateRoomCode(random = Math.random) {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const idx = Math.min(ROOM_ALPHABET.length - 1, Math.max(0, Math.floor(random() * ROOM_ALPHABET.length)));
    out += ROOM_ALPHABET[idx];
  }
  return out;
}

export function normalizeRoomCode(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toUpperCase().replace(/[\s-]+/g, '');
  if (cleaned.length !== ROOM_CODE_LENGTH) return null;
  for (let i = 0; i < cleaned.length; i++) {
    if (!ROOM_CHAR_SET.has(cleaned[i])) return null;
  }
  return cleaned;
}

/**
 * JSON match label indexed by Nakama (and `@metaverse/hub-sdk/mock`'s `mockLabelMatches`).
 * Note: `open` MUST be a JSON boolean (`true`/`false`) so Nakama Bleve `+label.open:T` matches.
 */
export function makeMatchLabel(opts = {}) {
  const maxSeats = Math.max(2, Math.min(MAX_SEATS_LIMIT, Math.trunc(opts.maxSeats ?? DEFAULT_MAX_SEATS)));
  const players = Math.max(0, Math.min(maxSeats, Math.trunc(opts.players ?? 0)));
  const courseId = COURSE_IDS.has(opts.courseId) ? opts.courseId : CIRCUITS[0].id;
  const mode = opts.mode === 'trial' ? 'trial' : 'race';
  const label = {
    kind: MATCH_KIND,
    game: GAME_ID,
    open: Boolean(opts.open ?? true),
    version: NET_VERSION,
    simVersion: RACER_SIM_VERSION,
    courseId,
    mode,
    players,
    maxSeats,
  };
  const code = opts.code ? normalizeRoomCode(opts.code) : null;
  if (code) label.code = code;
  return JSON.stringify(label);
}

/**
 * Bleve label query for open Sproto Racer matches (`+label.open:T`, never `:true`).
 */
export function buildOpenMatchQuery(opts = {}) {
  const terms = [
    `+label.kind:${MATCH_KIND}`,
    '+label.open:T',
    `+label.version:${NET_VERSION}`,
    `+label.simVersion:${RACER_SIM_VERSION}`,
  ];
  if (opts.courseId && COURSE_IDS.has(opts.courseId)) {
    terms.push(`+label.courseId:${opts.courseId}`);
  }
  if (opts.mode) {
    terms.push(`+label.mode:${opts.mode}`);
  }
  if (Number.isInteger(opts.maxSeats)) {
    terms.push(`+label.players:<${opts.maxSeats}`);
  }
  return terms.join(' ');
}

export function validateClientEnvelope(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'bad_payload' };
  }
  if (hasHostileKey(payload)) {
    return { ok: false, error: 'forbidden_field' };
  }
  if (payload.version !== undefined && String(payload.version) !== NET_VERSION) {
    return { ok: false, error: 'version_mismatch' };
  }
  if (payload.simVersion !== undefined && String(payload.simVersion) !== RACER_SIM_VERSION) {
    return { ok: false, error: 'sim_version_mismatch' };
  }
  return { ok: true };
}

export function validateRacerChoice(payload, ownedRelics = [], unlockTable = RELIC_UNLOCKS) {
  const env = validateClientEnvelope(payload);
  if (!env.ok) return env;

  const { car, driver, courseId } = payload;
  if (typeof car !== 'string' || !CAR_IDS.has(car)) {
    return { ok: false, error: 'invalid_car' };
  }
  if (typeof driver !== 'string' || !DRIVER_IDS.has(driver)) {
    return { ok: false, error: 'invalid_driver' };
  }
  if (!isUnlocked('car', car, ownedRelics, unlockTable)) {
    return { ok: false, error: 'locked_car' };
  }
  if (!isUnlocked('character', driver, ownedRelics, unlockTable)) {
    return { ok: false, error: 'locked_driver' };
  }
  if (courseId !== undefined && (typeof courseId !== 'string' || !COURSE_IDS.has(courseId))) {
    return { ok: false, error: 'invalid_course' };
  }
  return {
    ok: true,
    value: {
      car,
      driver,
      courseId: courseId ?? CIRCUITS[0].id,
    },
  };
}

// Compact binary wire encoding for OP.INPUT:
// [uint8 seat, uint8 frameCount, frame0 (11B), frame1 (11B), ...]
// Bundling up to 3 recent frames provides lightweight redundancy over lossy links.
export function encodeInputPacket(seat, frames) {
  const list = Array.isArray(frames) ? frames : [frames];
  const count = Math.min(4, Math.max(1, list.length));
  const out = new Uint8Array(2 + count * INTENT_FRAME_BYTES);
  out[0] = seat & 0xff;
  out[1] = count;
  for (let i = 0; i < count; i++) {
    encodeIntentFrame(list[i], out, 2 + i * INTENT_FRAME_BYTES);
  }
  return out;
}

export function decodeInputPacket(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 2 + INTENT_FRAME_BYTES) {
    return null;
  }
  const seat = bytes[0];
  const count = bytes[1];
  if (seat >= MAX_SEATS_LIMIT || count < 1 || count > 4) return null;
  if (bytes.byteLength < 2 + count * INTENT_FRAME_BYTES) return null;
  const frames = [];
  for (let i = 0; i < count; i++) {
    const decoded = decodeIntentFrame(bytes, 2 + i * INTENT_FRAME_BYTES);
    if (!decoded) return null;
    frames.push(decoded);
  }
  return { seat, frames };
}
