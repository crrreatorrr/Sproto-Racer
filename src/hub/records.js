import { encodeSave, SAVE_MAX_BYTES } from '@metaverse/hub-sdk/core';
import { createProgressStore } from '@metaverse/hub-sdk/progress';
import { LEGACY_GHOST, RECORD_KEY, TRIAL_LAYOUT } from './config.js';

/**
 * Time-trial records, one per circuit. Progress only advances: the faster time wins, and two
 * devices can merge in any order. Ghost frames stay on this browser (a full ghost is larger
 * than the hub's 16 KB cloud save). The cloud body is the times, the car and the driver.
 *
 * Play outside a hub session keeps the browser's own records, including ghosts saved before
 * this store existed. An account's records never mix with that copy or with another account.
 */

const TRACK_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const NAME = /^[\w .'-]{1,40}$/;
const MAX_TIME = 60 * 60;
const MAX_FRAMES = 20000;

function cleanName(value) {
  return typeof value === 'string' && NAME.test(value) ? value : '';
}

function cleanFrames(frames) {
  if (!Array.isArray(frames) || frames.length < 2 || frames.length > MAX_FRAMES) return undefined;
  let previous = -Infinity;
  for (const frame of frames) {
    if (!Array.isArray(frame) || (frame.length < 5 || frame.length > 7)) return undefined;
    if (!frame.every((n) => typeof n === 'number' && Number.isFinite(n))) return undefined;
    if (frame.length === 7 && frame[6] !== 0 && frame[6] !== 1) return undefined;
    if (frame[0] <= previous) return undefined;
    previous = frame[0];
  }
  return frames.map((frame) => frame.slice(0, 7));
}

/** One stored record, or null. Bad frames are dropped; the time remains. A record set on an
 * older circuit layout is null. */
export function normalizeTrial(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.layout !== TRIAL_LAYOUT) return null;
  const time = typeof raw.time === 'number' ? raw.time : (typeof raw.t === 'number' ? raw.t / 1000 : NaN);
  const length = typeof raw.length === 'number' ? raw.length : raw.len;
  if (!Number.isFinite(time) || time <= 0 || time > MAX_TIME) return null;
  if (!Number.isFinite(length) || length <= 0 || length > 100000) return null;
  const car = cleanName(raw.car);
  const driver = cleanName(raw.driver);
  if (!car || !driver) return null;
  const frames = cleanFrames(raw.frames);
  const layout = TRIAL_LAYOUT;
  return frames ? { time, length, car, driver, layout, frames } : { time, length, car, driver, layout };
}

function trialsOf(raw) {
  const trials = Object.create(null);
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.trials : null;
  if (!src || typeof src !== 'object' || Array.isArray(src)) return trials;
  for (const [id, row] of Object.entries(src)) {
    if (!TRACK_ID.test(id)) continue;
    const trial = normalizeTrial(row);
    if (trial) trials[id] = trial;
  }
  return trials;
}

export function emptyRecords() {
  return { trials: Object.create(null) };
}

export function normalizeRecords(raw) {
  return { trials: trialsOf(raw) };
}

/** Total order: a faster time, then a copy that still has its ghost, then the text. */
function rank(trial) {
  if (!trial) return [0, 0, 0, ''];
  return [1, -trial.time, trial.frames ? 1 : 0, JSON.stringify(trial)];
}

function compareTrials(a, b) {
  const x = rank(a);
  const y = rank(b);
  for (let i = 0; i < x.length; i += 1) {
    if (x[i] < y[i]) return -1;
    if (x[i] > y[i]) return 1;
  }
  return 0;
}

export function betterTrial(a, b) {
  return compareTrials(a, b) >= 0 ? a : b;
}

export function mergeRecords(a, b) {
  const trials = Object.create(null);
  for (const id of new Set([...Object.keys(a.trials), ...Object.keys(b.trials)])) {
    const trial = betterTrial(a.trials[id], b.trials[id]);
    if (trial) trials[id] = trial;
  }
  return { trials };
}

/** Cloud body: times in milliseconds, no ghost frames. */
export function recordsCloudBody(value) {
  const trials = Object.create(null);
  for (const [id, trial] of Object.entries(value.trials)) {
    trials[id] = {
      t: Math.round(trial.time * 1000),
      len: trial.length,
      car: trial.car,
      driver: trial.driver,
      lay: trial.layout,
    };
  }
  return { v: 1, trials };
}

export function recordsFromCloud(data) {
  return { trials: trialsOf({ trials: cloudRows(data) }) };
}

function cloudRows(data) {
  const src = data?.trials;
  if (!src || typeof src !== 'object' || Array.isArray(src)) return {};
  const rows = Object.create(null);
  for (const [id, row] of Object.entries(src)) {
    if (!row || typeof row !== 'object') continue;
    rows[id] = { time: row.t / 1000, length: row.len, car: row.car, driver: row.driver, layout: row.lay };
  }
  return rows;
}

export const RECORD_MODEL = Object.freeze({
  empty: emptyRecords,
  normalize: normalizeRecords,
  merge: mergeRecords,
  toCloud: recordsCloudBody,
  fromCloud: recordsFromCloud,
});

/** True when this record can be shown for a circuit of `length`. */
export function acceptTrial(raw, length) {
  const trial = normalizeTrial(raw);
  if (!trial) return null;
  if (length != null && Math.abs(trial.length - length) > 1e-6) return null;
  return trial;
}

/**
 * Keep the faster run. An equal time is written too, so a ghost can attach to a cloud time
 * that arrived without frames. A slower run is ignored.
 */
export function noteTrial(records, trackId, previous, result) {
  if (previous && result.time > previous.time) return previous;
  const saved = records.commit(trackId, result);
  return acceptTrial(saved, result.length) ?? previous ?? null;
}

function legacyTrials(storage) {
  const trials = Object.create(null);
  let keys = [];
  try {
    keys = typeof storage.keys === 'function' ? storage.keys() : [];
  } catch {
    keys = [];
  }
  for (const key of keys) {
    const match = LEGACY_GHOST.exec(key);
    if (!match) continue;
    let raw = null;
    try { raw = JSON.parse(storage.getItem(key) || 'null'); } catch { raw = null; }
    const trial = normalizeTrial(raw);
    if (trial) trials[match[1]] = trial;
  }
  return { trials };
}

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * A storage the progress store can use. `keys` is extra, for the legacy ghosts; the SDK only
 * needs getItem / setItem / removeItem.
 */
export function storageFrom(source) {
  if (!source) return null;
  return {
    getItem: (key) => source.getItem(key),
    setItem: (key, value) => source.setItem(key, value),
    removeItem: (key) => source.removeItem(key),
    keys: () => {
      try {
        if (typeof source.keys === 'function') return source.keys();
        const keys = [];
        for (let i = 0; i < source.length; i += 1) keys.push(source.key(i));
        return keys;
      } catch {
        return [];
      }
    },
  };
}

export function createRecordBook(opts = {}) {
  const storage = opts.storage === undefined ? storageFrom(browserStorage()) : opts.storage;
  const listeners = new Set();
  const emit = () => {
    for (const fn of listeners) fn();
  };
  let onSyncError = null;
  const store = createProgressStore({
    key: RECORD_KEY,
    model: RECORD_MODEL,
    storage,
    pushDelayMs: opts.pushDelayMs,
    retryDelayMs: opts.retryDelayMs,
    readLegacy: (kv) => legacyTrials(storage ?? kv),
    onError: (err) => {
      console.warn('[hub] cloud save failed', err?.code ?? err);
      try { onSyncError?.(err); } catch { /* the store retries */ }
    },
  });
  store.subscribe(emit);

  function writeLegacy(trackId, trial) {
    if (!storage || store.owner().kind !== 'device' || !trial) return;
    try { storage.setItem(`sproto.${trackId}.ghost.v1`, JSON.stringify(trial)); } catch { /* the store copy remains */ }
  }

  return {
    get(trackId) {
      return store.get().trials[trackId] ?? null;
    },
    commit(trackId, result) {
      if (!TRACK_ID.test(trackId)) return null;
      // A run just driven is on the current layout.
      const trial = normalizeTrial({ ...result, layout: TRIAL_LAYOUT });
      if (!trial) return this.get(trackId);
      store.update((current) => {
        const trials = Object.create(null);
        Object.assign(trials, current.trials);
        trials[trackId] = trial;
        return { trials };
      });
      const saved = store.get().trials[trackId] ?? null;
      writeLegacy(trackId, saved);
      return saved;
    },
    owner() {
      return store.owner().kind;
    },
    sync() {
      return this.owner() === 'account' ? store.sync() : 'local';
    },
    hold() {
      store.hold();
    },
    async follow(link) {
      const api = link?.api;
      if (link && link.bankable && link.playerId && api?.loadSave && api?.writeSave) {
        onSyncError = (err) => link.noteSessionError?.(err);
        try {
          await store.attach({ loadSave: () => api.loadSave(), writeSave: (data, o) => api.writeSave(data, o) }, link.playerId);
          return;
        } catch (err) {
          console.warn('[hub] could not attach the hub account', err);
        }
      }
      onSyncError = null;
      store.release();
    },
    flush() {
      return store.flush();
    },
    flushKeepalive() {
      return store.flushKeepalive();
    },
    watches(key) {
      return store.watches(key);
    },
    refresh() {
      store.refresh();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** The cloud body the store would put. Tests check it fits. */
    cloudBody() {
      return recordsCloudBody(store.get());
    },
  };
}

export function cloudBytes(body) {
  return new TextEncoder().encode(encodeSave(body)).length;
}

export { SAVE_MAX_BYTES };

/** This page's records. */
export const pageRecords = createRecordBook();
