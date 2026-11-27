// Online race protocol: opcodes and payload codecs for input relay with rollback.
//
// Rare control messages (hello, welcome, lobby, ready, start, result, error) are JSON.
// Everything sent many times a second is binary:
//
//   INPUT        client -> server   [u8 seat][u8 count][count x 12-byte intent frame]
//                                   (the existing `encodeInputPacket`, newest frame first)
//   INPUTS       server -> clients  the inputs the server actually used, in tick order:
//                                   [u8 flags][u32 startTick][u8 tickCount][u16 seatMask]
//                                   per seat in the mask: [i8 margin][change bits][8 bytes per changed tick]
//                                   optional trailer when flags&1: [u32 hashTick][8-byte state hash]
//   HASH         server -> clients  [u32 tick][8-byte state hash] (standalone form of the trailer)
//   SEAT         server -> clients  [u8 seat][u8 kind][u32 tick]  a seat changes driver at `tick`
//   KEYFRAME_REQ client -> server   [u8 reason][u32 tick]
//   KEYFRAME     server -> client   chunked: [u16 id][u8 index][u8 count][bytes]; assembled payload is
//                                   [u8 reason][u32 tick][8-byte hash][u16 seatMask][8 bytes per seat][snapshot]
//   PING         client -> server   [u32 clientMs]
//   PONG         server -> client   [u32 clientMs echo][u32 serverTick]
//
// No DOM, timers or platform text codecs here: the server half must run in Nakama's Goja engine.

import {
  BUTTONS_MASK,
  EDGE_BUTTON_MASK,
  INTENT_FRAME_BYTES,
  decodeIntentFrame,
  encodeIntentFrame,
} from '../sim/intent.js';
import { OP } from './protocol.js';
import { bytesToString, stringToBytes } from './keyframe.js';

/** Existing opcodes plus the ones this layer adds. Values 1-13 are unchanged. */
export const NET_OP = Object.freeze({
  ...OP,
  INPUTS: 14,
  HASH: 15,
  KEYFRAME_REQ: 16,
  KEYFRAME: 17,
  SEAT: 18,
  ERROR: 19,
  LOBBY: OP.PEER,
});

export const SEAT_KIND_AI = 0;
export const SEAT_KIND_HUMAN = 1;

export const KEYFRAME_REASON = Object.freeze({ JOIN: 1, DESYNC: 2, BEHIND: 3, REQUEST: 4 });

/** Packed input payload: everything in an intent frame except its tick. */
export const INPUT_PAYLOAD_BYTES = 8;
export const HASH_BYTES = 8;
export const MAX_INPUT_FRAMES_PER_PACKET = 4;
export const MARGIN_NONE = -128;

// ---- Packed frames: two unsigned 32-bit words per (tick, seat), no garbage. ----

export function packFrameA(frame) {
  return ((frame.steer & 0xffff) | ((frame.throttle & 0xff) << 16) | ((frame.brake & 0xff) << 24)) >>> 0;
}

export function packFrameB(frame) {
  return ((frame.reverse & 0xff) | ((frame.buttons & BUTTONS_MASK) << 8)) >>> 0;
}

export function unpackFrame(a, b, tick, out = {}) {
  out.tick = tick >>> 0;
  out.steer = (a << 16) >> 16;
  out.throttle = (a >>> 16) & 0xff;
  out.brake = (a >>> 24) & 0xff;
  out.reverse = b & 0xff;
  out.buttons = (b >>> 8) & BUTTONS_MASK;
  return out;
}

/** The same input with its one-shot button presses removed (what "still holding" means). */
export const stripEdgesB = (b) => (b & ~(EDGE_BUTTON_MASK << 8)) >>> 0;

// ---- Small byte helpers ----

function writeU32(bytes, offset, v) {
  bytes[offset] = v & 0xff;
  bytes[offset + 1] = (v >>> 8) & 0xff;
  bytes[offset + 2] = (v >>> 16) & 0xff;
  bytes[offset + 3] = (v >>> 24) & 0xff;
}

function readU32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

const HEX = '0123456789abcdef';

export function hashToBytes(hex, out, offset = 0) {
  for (let i = 0; i < HASH_BYTES; i++) {
    out[offset + i] = parseInt(hex.substr(i * 2, 2), 16) & 0xff;
  }
  return out;
}

export function bytesToHash(bytes, offset = 0) {
  let s = '';
  for (let i = 0; i < HASH_BYTES; i++) {
    const b = bytes[offset + i];
    s += HEX[b >> 4] + HEX[b & 15];
  }
  return s;
}

export function asBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (typeof data === 'string') return stringToBytes(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return null;
}

// ---- JSON control messages ----

export function encodeJson(value) {
  return JSON.stringify(value);
}

export function decodeJson(data) {
  try {
    const text = typeof data === 'string' ? data : bytesToString(asBytes(data) ?? new Uint8Array(0));
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

// ---- INPUT (client -> server) ----

/** Frames newest first, at most four. Same layout as `encodeInputPacket` in protocol.js. */
export function encodeClientInput(seat, frames) {
  const count = Math.min(MAX_INPUT_FRAMES_PER_PACKET, frames.length);
  const out = new Uint8Array(2 + count * INTENT_FRAME_BYTES);
  out[0] = seat & 0xff;
  out[1] = count;
  for (let i = 0; i < count; i++) encodeIntentFrame(frames[i], out, 2 + i * INTENT_FRAME_BYTES);
  return out;
}

/** Strict decode: exact length, sane count. Returns null on anything malformed. */
export function decodeClientInput(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 2 + INTENT_FRAME_BYTES) return null;
  const seat = bytes[0];
  const count = bytes[1];
  if (count < 1 || count > MAX_INPUT_FRAMES_PER_PACKET) return null;
  if (bytes.length !== 2 + count * INTENT_FRAME_BYTES) return null;
  const frames = new Array(count);
  for (let i = 0; i < count; i++) {
    const f = decodeIntentFrame(bytes, 2 + i * INTENT_FRAME_BYTES);
    if (!f) return null;
    if (f.steer < -32767) f.steer = -32767;
    f.buttons &= BUTTONS_MASK;
    frames[i] = f;
  }
  return { seat, frames };
}

// ---- INPUTS (server -> clients) ----

/**
 * Builds relayed-input batches. The server calls `add` once per human seat per tick with
 * the packed input it used, then `flush` every few ticks.
 *
 * A tick's input is written in full only when it differs from that seat's previous tick,
 * so a held input costs one bit. The comparison runs across batches, which is why a
 * keyframe carries each seat's last input (`previous`).
 */
export function createInputsBatcher(maxSeats = 12) {
  const MAX_TICKS = 64;
  const a = new Uint32Array(maxSeats * MAX_TICKS);
  const b = new Uint32Array(maxSeats * MAX_TICKS);
  const prevA = new Uint32Array(maxSeats);
  const prevB = new Uint32Array(maxSeats);
  const margin = new Int8Array(maxSeats);
  let startTick = 0;
  let count = 0;
  let mask = 0;

  return {
    get count() { return count; },
    get startTick() { return startTick; },
    get mask() { return mask; },
    get full() { return count >= MAX_TICKS; },
    /** Starts a tick. All seats in `seatMask` must then be added. */
    beginTick(tick, seatMask) {
      if (count === 0) {
        startTick = tick >>> 0;
        mask = seatMask;
        for (let s = 0; s < maxSeats; s++) margin[s] = 127;
      }
      count++;
    },
    add(seat, wordA, wordB, seatMargin) {
      const i = seat * MAX_TICKS + count - 1;
      a[i] = wordA;
      b[i] = wordB;
      if (seatMargin < margin[seat]) margin[seat] = Math.max(MARGIN_NONE, seatMargin);
    },
    /** Last input each seat used, for a keyframe taken right after a flush. */
    previous(seat) {
      return [prevA[seat], prevB[seat]];
    },
    setPrevious(seat, wordA, wordB) {
      prevA[seat] = wordA >>> 0;
      prevB[seat] = wordB >>> 0;
    },
    /** Returns the encoded batch (or null when empty) and resets. */
    flush(hashTick = -1, hashHex = null) {
      if (count === 0 && hashHex == null) return null;
      const bitBytes = (count + 7) >> 3;
      let size = 8 + (hashHex != null ? 4 + HASH_BYTES : 0);
      for (let s = 0; s < maxSeats; s++) {
        if (!(mask & (1 << s))) continue;
        size += 1 + bitBytes;
        let pa = prevA[s];
        let pb = prevB[s];
        for (let t = 0; t < count; t++) {
          const i = s * MAX_TICKS + t;
          if (a[i] !== pa || b[i] !== pb) size += INPUT_PAYLOAD_BYTES;
          pa = a[i];
          pb = b[i];
        }
      }
      const out = new Uint8Array(size);
      out[0] = hashHex != null ? 1 : 0;
      writeU32(out, 1, startTick);
      out[5] = count;
      out[6] = mask & 0xff;
      out[7] = (mask >> 8) & 0xff;
      let pos = 8;
      for (let s = 0; s < maxSeats; s++) {
        if (!(mask & (1 << s))) continue;
        out[pos++] = margin[s] & 0xff;
        const bitsAt = pos;
        pos += bitBytes;
        for (let t = 0; t < count; t++) {
          const i = s * MAX_TICKS + t;
          if (a[i] !== prevA[s] || b[i] !== prevB[s]) {
            out[bitsAt + (t >> 3)] |= 1 << (t & 7);
            writeU32(out, pos, a[i]);
            writeU32(out, pos + 4, b[i]);
            pos += INPUT_PAYLOAD_BYTES;
            prevA[s] = a[i];
            prevB[s] = b[i];
          }
        }
      }
      if (hashHex != null) {
        writeU32(out, pos, hashTick);
        hashToBytes(hashHex, out, pos + 4);
      }
      count = 0;
      return out;
    },
  };
}

/**
 * Decodes one INPUTS batch. `previous(seat)` returns that seat's last known packed input
 * as [a, b]; `onFrame(tick, seat, a, b)` is called for every tick and seat in order;
 * `onMargin(seat, margin)` reports how many ticks early that seat's inputs arrived.
 * Returns { startTick, count, mask, hashTick, hash } or null when malformed.
 */
export function decodeInputs(bytes, previous, onFrame, onMargin) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 8) return null;
  const flags = bytes[0];
  const startTick = readU32(bytes, 1);
  const count = bytes[5];
  const mask = bytes[6] | (bytes[7] << 8);
  const bitBytes = (count + 7) >> 3;
  let pos = 8;
  for (let s = 0; s < 16; s++) {
    if (!(mask & (1 << s))) continue;
    if (pos + 1 + bitBytes > bytes.length) return null;
    const m = (bytes[pos++] << 24) >> 24;
    const bitsAt = pos;
    pos += bitBytes;
    const prev = previous(s);
    let pa = prev[0] >>> 0;
    let pb = prev[1] >>> 0;
    for (let t = 0; t < count; t++) {
      if (bytes[bitsAt + (t >> 3)] & (1 << (t & 7))) {
        if (pos + INPUT_PAYLOAD_BYTES > bytes.length) return null;
        pa = readU32(bytes, pos);
        pb = readU32(bytes, pos + 4);
        pos += INPUT_PAYLOAD_BYTES;
      }
      onFrame((startTick + t) >>> 0, s, pa, pb);
    }
    if (onMargin) onMargin(s, m);
  }
  let hashTick = -1;
  let hash = null;
  if (flags & 1) {
    if (pos + 4 + HASH_BYTES > bytes.length) return null;
    hashTick = readU32(bytes, pos);
    hash = bytesToHash(bytes, pos + 4);
  }
  return { startTick, count, mask, hashTick, hash };
}

// ---- HASH, SEAT, KEYFRAME_REQ, PING, PONG ----

export function encodeHash(tick, hex) {
  const out = new Uint8Array(4 + HASH_BYTES);
  writeU32(out, 0, tick);
  hashToBytes(hex, out, 4);
  return out;
}

export function decodeHash(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 4 + HASH_BYTES) return null;
  return { tick: readU32(bytes, 0), hash: bytesToHash(bytes, 4) };
}

export function encodeSeat(seat, kind, tick) {
  const out = new Uint8Array(6);
  out[0] = seat;
  out[1] = kind;
  writeU32(out, 2, tick);
  return out;
}

export function decodeSeat(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 6) return null;
  return { seat: bytes[0], kind: bytes[1], tick: readU32(bytes, 2) };
}

export function encodeKeyframeRequest(reason, tick) {
  const out = new Uint8Array(5);
  out[0] = reason;
  writeU32(out, 1, tick);
  return out;
}

export function decodeKeyframeRequest(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 5) return null;
  return { reason: bytes[0], tick: readU32(bytes, 1) };
}

export function encodePing(clientMs) {
  const out = new Uint8Array(4);
  writeU32(out, 0, clientMs >>> 0);
  return out;
}

export function decodePing(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 4) return null;
  return { clientMs: readU32(bytes, 0) };
}

export function encodePong(clientMs, serverTick) {
  const out = new Uint8Array(8);
  writeU32(out, 0, clientMs >>> 0);
  writeU32(out, 4, serverTick >>> 0);
  return out;
}

export function decodePong(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 8) return null;
  return { clientMs: readU32(bytes, 0), serverTick: readU32(bytes, 4) };
}

// ---- KEYFRAME payload (before chunking) ----

/**
 * `seatInputs` is a list of [seat, a, b]: each human seat's last used input, the base
 * the next INPUTS batch is compared against.
 */
export function encodeKeyframePayload(reason, tick, hashHex, seatInputs, snapshotBytes) {
  let mask = 0;
  for (let i = 0; i < seatInputs.length; i++) mask |= 1 << seatInputs[i][0];
  const head = 1 + 4 + HASH_BYTES + 2 + seatInputs.length * INPUT_PAYLOAD_BYTES;
  const out = new Uint8Array(head + snapshotBytes.length);
  out[0] = reason;
  writeU32(out, 1, tick);
  hashToBytes(hashHex, out, 5);
  out[13] = mask & 0xff;
  out[14] = (mask >> 8) & 0xff;
  let pos = 15;
  const sorted = seatInputs.slice().sort((x, y) => x[0] - y[0]);
  for (let i = 0; i < sorted.length; i++) {
    writeU32(out, pos, sorted[i][1]);
    writeU32(out, pos + 4, sorted[i][2]);
    pos += INPUT_PAYLOAD_BYTES;
  }
  out.set(snapshotBytes, pos);
  return out;
}

export function decodeKeyframePayload(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 15) return null;
  const reason = bytes[0];
  const tick = readU32(bytes, 1);
  const hash = bytesToHash(bytes, 5);
  const mask = bytes[13] | (bytes[14] << 8);
  let pos = 15;
  const seatInputs = [];
  for (let s = 0; s < 16; s++) {
    if (!(mask & (1 << s))) continue;
    if (pos + INPUT_PAYLOAD_BYTES > bytes.length) return null;
    seatInputs.push([s, readU32(bytes, pos), readU32(bytes, pos + 4)]);
    pos += INPUT_PAYLOAD_BYTES;
  }
  return { reason, tick, hash, mask, seatInputs, snapshotBytes: bytes.subarray(pos) };
}

/**
 * Bytes one message occupies on the socket: Nakama's JSON envelope around base64 data,
 * plus the WebSocket frame header. Used to report bandwidth honestly.
 */
export function socketBytes(payloadLength, direction = 'down', opCode = 14, matchIdLength = 44) {
  const base64 = Math.ceil(payloadLength / 3) * 4;
  const op = String(opCode).length;
  // {"match_data_send":{"match_id":"…","op_code":"5","data":"…","reliable":true}}
  // {"match_data":{"match_id":"…","op_code":"14","data":"…","reliable":true}}
  const json = (direction === 'up' ? 74 : 69) + matchIdLength + op + base64;
  const frame = (json < 126 ? 2 : 4) + (direction === 'up' ? 4 : 0);
  return json + frame;
}
