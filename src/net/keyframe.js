// Binary keyframe codec: a full `captureSnapshot` state that restores bit-identically.
//
// A keyframe is the whole race at one tick: every kart, boost, item, projectile, the
// random-number state and the AI state. It is what a late joiner, a rejoiner or a
// desynced client needs to continue the simulation exactly.
//
// The encoder is schema-free: it walks whatever `captureSnapshot` returns, so a field
// added to the simulation later is carried without touching this file. Three tables keep
// it small: strings and object shapes (the list of keys) are written once and referenced
// by index, and numbers use the shortest exact form (one byte for 0..63, a varint for
// other integers, float32 when that is exact, float64 otherwise). Nothing is rounded:
// Infinity, -0 and NaN survive, which JSON does not manage.
//
// Plain JS on typed arrays only (no platform text codecs, no DOM), so the same file runs in the
// browser, Node and Nakama's Goja engine.

export const KEYFRAME_FORMAT = 1;
// Comfortable single-message size. 4,096 binary bytes is 5,464 base64 characters plus
// about 120 bytes of envelope, well under Nakama's 8,192-byte cap on incoming messages.
export const KEYFRAME_CHUNK_BYTES = 4096;
export const KEYFRAME_CHUNK_HEADER_BYTES = 4;

const T_NULL = 0x00;
const T_UNDEFINED = 0x01;
const T_FALSE = 0x02;
const T_TRUE = 0x03;
const T_F64 = 0x04;
const T_F32 = 0x05;
const T_UINT = 0x06;
const T_NEG_INT = 0x07;
const T_STRING = 0x08;
const T_ARRAY = 0x09;
const T_OBJECT = 0x0a;
const T_SMALL_INT = 0x40; // 0x40..0x7f carry 0..63 in the tag itself

// `kart.tuning` is the car definition. `applySnapshot` restores it from the car id.
const DEFAULT_OMIT = ['tuning'];

function createWriter(initial = 4096) {
  let bytes = new Uint8Array(initial);
  let view = new DataView(bytes.buffer);
  let length = 0;

  function reserve(extra) {
    if (length + extra <= bytes.length) return;
    let size = bytes.length * 2;
    while (size < length + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(bytes.subarray(0, length));
    bytes = next;
    view = new DataView(bytes.buffer);
  }

  return {
    u8(v) {
      reserve(1);
      bytes[length++] = v & 0xff;
    },
    varint(v) {
      // Unsigned LEB128 for integers up to 2^53.
      reserve(8);
      let n = v;
      while (n >= 0x80) {
        bytes[length++] = (n % 0x80) | 0x80;
        n = Math.floor(n / 0x80);
      }
      bytes[length++] = n;
    },
    f32(v) {
      reserve(4);
      view.setFloat32(length, v, true);
      length += 4;
    },
    f64(v) {
      reserve(8);
      view.setFloat64(length, v, true);
      length += 8;
    },
    raw(src) {
      reserve(src.length);
      bytes.set(src, length);
      length += src.length;
    },
    get length() { return length; },
    finish() { return bytes.slice(0, length); },
    view() { return bytes.subarray(0, length); },
  };
}

function utf8Encode(str, w) {
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const d = str.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) w.u8(c);
    else if (c < 0x800) {
      w.u8(0xc0 | (c >> 6));
      w.u8(0x80 | (c & 0x3f));
    } else if (c < 0x10000) {
      w.u8(0xe0 | (c >> 12));
      w.u8(0x80 | ((c >> 6) & 0x3f));
      w.u8(0x80 | (c & 0x3f));
    } else {
      w.u8(0xf0 | (c >> 18));
      w.u8(0x80 | ((c >> 12) & 0x3f));
      w.u8(0x80 | ((c >> 6) & 0x3f));
      w.u8(0x80 | (c & 0x3f));
    }
  }
}

function utf8Decode(bytes, start, end) {
  let out = '';
  let i = start;
  while (i < end) {
    const b = bytes[i++];
    let c;
    if (b < 0x80) c = b;
    else if (b < 0xe0) c = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
    else if (b < 0xf0) {
      c = ((b & 0x0f) << 12) | ((bytes[i] & 0x3f) << 6) | (bytes[i + 1] & 0x3f);
      i += 2;
    } else {
      c = ((b & 0x07) << 18) | ((bytes[i] & 0x3f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
      i += 3;
    }
    if (c >= 0x10000) {
      c -= 0x10000;
      out += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff));
    } else {
      out += String.fromCharCode(c);
    }
  }
  return out;
}

/** UTF-8 helpers exported for the JSON control messages (Goja has no built-in text codec). */
export function stringToBytes(str) {
  const w = createWriter(Math.max(16, str.length + 8));
  utf8Encode(str, w);
  return w.finish();
}

export function bytesToString(bytes) {
  return utf8Decode(bytes, 0, bytes.length);
}

/**
 * Encodes any JSON-like value (plus undefined, Infinity, -0, NaN) to bytes.
 * `omitKeys` lists object keys to leave out wherever they appear.
 */
export function encodeValue(root, omitKeys = DEFAULT_OMIT) {
  const omit = Object.create(null);
  for (let i = 0; i < omitKeys.length; i++) omit[omitKeys[i]] = true;

  const strings = [];
  const stringIndex = new Map();
  const shapes = [];
  const shapeIndex = new Map();
  const body = createWriter(4096);

  function internString(s) {
    let idx = stringIndex.get(s);
    if (idx === undefined) {
      idx = strings.length;
      strings.push(s);
      stringIndex.set(s, idx);
    }
    return idx;
  }

  function write(v) {
    if (v === null) return body.u8(T_NULL);
    if (v === undefined) return body.u8(T_UNDEFINED);
    if (v === true) return body.u8(T_TRUE);
    if (v === false) return body.u8(T_FALSE);
    const type = typeof v;
    if (type === 'number') {
      if (Number.isInteger(v) && !Object.is(v, -0) && v > -9007199254740992 && v < 9007199254740992) {
        if (v >= 0 && v < 64) return body.u8(T_SMALL_INT + v);
        if (v >= 0) {
          body.u8(T_UINT);
          return body.varint(v);
        }
        body.u8(T_NEG_INT);
        return body.varint(-v);
      }
      if (Math.fround(v) === v && !Object.is(v, -0)) {
        body.u8(T_F32);
        return body.f32(v);
      }
      body.u8(T_F64);
      return body.f64(v);
    }
    if (type === 'string') {
      body.u8(T_STRING);
      return body.varint(internString(v));
    }
    if (Array.isArray(v)) {
      body.u8(T_ARRAY);
      body.varint(v.length);
      for (let i = 0; i < v.length; i++) write(v[i]);
      return undefined;
    }
    if (type === 'object') {
      const all = Object.keys(v);
      const keys = [];
      for (let i = 0; i < all.length; i++) {
        if (!omit[all[i]]) keys.push(all[i]);
      }
      const signature = keys.join('\u0001');
      let idx = shapeIndex.get(signature);
      if (idx === undefined) {
        idx = shapes.length;
        shapes.push(keys.map(internString));
        shapeIndex.set(signature, idx);
      }
      body.u8(T_OBJECT);
      body.varint(idx);
      for (let i = 0; i < keys.length; i++) write(v[keys[i]]);
      return undefined;
    }
    throw new Error(`keyframe: cannot encode a ${type}`);
  }

  write(root);

  const out = createWriter(body.length + 1024);
  out.u8(KEYFRAME_FORMAT);
  out.varint(strings.length);
  for (let i = 0; i < strings.length; i++) {
    const s = createWriter(Math.max(16, strings[i].length * 3));
    utf8Encode(strings[i], s);
    out.varint(s.length);
    out.raw(s.view());
  }
  out.varint(shapes.length);
  for (let i = 0; i < shapes.length; i++) {
    out.varint(shapes[i].length);
    for (let j = 0; j < shapes[i].length; j++) out.varint(shapes[i][j]);
  }
  out.raw(body.view());
  return out.finish();
}

export function decodeValue(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 3) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;

  function varint() {
    let result = 0;
    let scale = 1;
    for (;;) {
      if (pos >= bytes.length) throw new Error('keyframe: truncated');
      const b = bytes[pos++];
      result += (b & 0x7f) * scale;
      if (b < 0x80) return result;
      scale *= 0x80;
    }
  }

  if (bytes[pos++] !== KEYFRAME_FORMAT) throw new Error('keyframe: unknown format');
  const stringCount = varint();
  const strings = new Array(stringCount);
  for (let i = 0; i < stringCount; i++) {
    const len = varint();
    if (pos + len > bytes.length) throw new Error('keyframe: truncated');
    strings[i] = utf8Decode(bytes, pos, pos + len);
    pos += len;
  }
  const shapeCount = varint();
  const shapes = new Array(shapeCount);
  for (let i = 0; i < shapeCount; i++) {
    const n = varint();
    const keys = new Array(n);
    for (let j = 0; j < n; j++) {
      const idx = varint();
      if (idx >= stringCount) throw new Error('keyframe: bad key');
      keys[j] = strings[idx];
    }
    shapes[i] = keys;
  }

  function read() {
    if (pos >= bytes.length) throw new Error('keyframe: truncated');
    const tag = bytes[pos++];
    if (tag >= T_SMALL_INT && tag < T_SMALL_INT + 64) return tag - T_SMALL_INT;
    switch (tag) {
      case T_NULL: return null;
      case T_UNDEFINED: return undefined;
      case T_FALSE: return false;
      case T_TRUE: return true;
      case T_F64: {
        if (pos + 8 > bytes.length) throw new Error('keyframe: truncated');
        const v = view.getFloat64(pos, true);
        pos += 8;
        return v;
      }
      case T_F32: {
        if (pos + 4 > bytes.length) throw new Error('keyframe: truncated');
        const v = view.getFloat32(pos, true);
        pos += 4;
        return v;
      }
      case T_UINT: return varint();
      case T_NEG_INT: return -varint();
      case T_STRING: {
        const idx = varint();
        if (idx >= stringCount) throw new Error('keyframe: bad string');
        return strings[idx];
      }
      case T_ARRAY: {
        const n = varint();
        if (n > bytes.length) throw new Error('keyframe: bad array');
        const arr = new Array(n);
        for (let i = 0; i < n; i++) arr[i] = read();
        return arr;
      }
      case T_OBJECT: {
        const idx = varint();
        if (idx >= shapeCount) throw new Error('keyframe: bad shape');
        const keys = shapes[idx];
        const obj = {};
        for (let i = 0; i < keys.length; i++) obj[keys[i]] = read();
        return obj;
      }
      default:
        throw new Error('keyframe: bad tag');
    }
  }

  return read();
}

/** Full snapshot (from `captureSnapshot`) to bytes. */
export function encodeKeyframe(snapshot) {
  return encodeValue(snapshot, DEFAULT_OMIT);
}

/** Bytes back to a snapshot `applySnapshot` accepts. Returns null on malformed input. */
export function decodeKeyframe(bytes) {
  try {
    const snap = decodeValue(bytes);
    return snap && typeof snap === 'object' && snap.v === 1 && Array.isArray(snap.actors) ? snap : null;
  } catch {
    return null;
  }
}

/**
 * Splits a payload into messages of at most `chunkBytes` (header included).
 * Each chunk: [u16 id][u8 index][u8 count][payload slice].
 */
export function chunkBytes(payload, id = 0, chunkSize = KEYFRAME_CHUNK_BYTES) {
  const room = Math.max(1, chunkSize - KEYFRAME_CHUNK_HEADER_BYTES);
  const count = Math.max(1, Math.ceil(payload.length / room));
  if (count > 255) throw new Error('keyframe: payload too large to chunk');
  const chunks = [];
  for (let i = 0; i < count; i++) {
    const slice = payload.subarray(i * room, Math.min(payload.length, (i + 1) * room));
    const out = new Uint8Array(KEYFRAME_CHUNK_HEADER_BYTES + slice.length);
    out[0] = id & 0xff;
    out[1] = (id >> 8) & 0xff;
    out[2] = i;
    out[3] = count;
    out.set(slice, KEYFRAME_CHUNK_HEADER_BYTES);
    chunks.push(out);
  }
  return chunks;
}

/**
 * Reassembles chunks that arrive in order on a reliable channel. `push` returns the whole
 * payload when the last chunk lands, or null while waiting. A chunk from a newer id
 * abandons the older partial payload.
 */
export function createChunkAssembler() {
  let id = -1;
  let count = 0;
  let parts = [];
  return {
    push(chunk) {
      if (!(chunk instanceof Uint8Array) || chunk.length < KEYFRAME_CHUNK_HEADER_BYTES) return null;
      const chunkId = chunk[0] | (chunk[1] << 8);
      const index = chunk[2];
      const total = chunk[3];
      if (total < 1 || index >= total) return null;
      if (chunkId !== id || total !== count) {
        id = chunkId;
        count = total;
        parts = [];
      }
      if (index !== parts.length) {
        // Out of sequence: drop the partial payload and wait for a fresh one.
        parts = [];
        if (index !== 0) return null;
      }
      parts.push(chunk.subarray(KEYFRAME_CHUNK_HEADER_BYTES));
      if (parts.length < count) return null;
      let size = 0;
      for (let i = 0; i < parts.length; i++) size += parts[i].length;
      const out = new Uint8Array(size);
      let offset = 0;
      for (let i = 0; i < parts.length; i++) {
        out.set(parts[i], offset);
        offset += parts[i].length;
      }
      parts = [];
      id = -1;
      return out;
    },
    reset() {
      id = -1;
      parts = [];
    },
  };
}
