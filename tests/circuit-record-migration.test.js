import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RECORD_KEY, TRIAL_LAYOUT, trialRecordId } from '../src/hub/config.js';
import {
  acceptTrial, cloudBytes, createRecordBook, mergeRecords, normalizeRecords,
  normalizeTrial, noteTrial, recordsCloudBody, recordsFromCloud, SAVE_MAX_BYTES,
} from '../src/hub/records.js';

const ghost = [[1, 0, 0, 0, 0], [2, 1, 0, 0, 0]];
const trial = (time, layout, extra = {}) => ({
  time, layout, length: 100, car: 'apex', driver: 'sproto', ...extra,
});
const cloudTrial = (time, lay) => ({ t: time * 1000, lay, len: 100, car: 'apex', driver: 'sproto' });

function memory() {
  const entries = new Map();
  return {
    keys: () => [...entries.keys()],
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  };
}

test('archives known layout-2 variants idempotently, without exposing them as eligible runs', () => {
  assert.equal(TRIAL_LAYOUT, 3);
  const base = trial(7, 2, { frames: ghost });
  const old = trial(8, 2);
  const current = trial(21, 3);
  const renamed = normalizeRecords({ trials: {
    track01: base,
    'track01-crossings': old,
    'track01-crossings-l2': trial(6, 2),
    'track02-crossings': current,
    'track02-crossings-l2': trial(1, 3),
    track03: trial(1, 9),
    'unknown-course': trial(1, 2),
  } });
  assert.deepEqual(Object.keys(renamed.trials).sort(), ['track01-crossings-l2', 'track01-l2', 'track02-crossings']);
  assert.deepEqual(renamed.trials['track01-l2'].frames, ghost);
  assert.equal(renamed.trials['track01-crossings-l2'].time, 6);
  assert.equal(normalizeTrial(base), null);
  assert.equal(acceptTrial(base, 100), null);
  assert.equal(acceptTrial(current, 101), null);
  assert.deepEqual(normalizeRecords(renamed), renamed);
  const cloud = recordsCloudBody(renamed);
  assert.ok(cloudBytes(cloud) < SAVE_MAX_BYTES);
  assert.equal(JSON.stringify(cloud).includes('frames'), false);
  const roundtrip = recordsFromCloud(cloud);
  assert.deepEqual(mergeRecords(renamed, roundtrip), renamed);
  assert.deepEqual(mergeRecords(roundtrip, renamed), renamed);
});

test('legacy device ghosts and old cloud rows survive a new slower time in their own scopes', async () => {
  const storage = memory();
  const slot = trialRecordId('track01');
  assert.equal(slot, 'track01-crossings');
  storage.setItem(`sproto.${slot}.ghost.v1`, JSON.stringify(trial(6, 2, { frames: ghost })));
  storage.setItem(RECORD_KEY, JSON.stringify({ trials: { [slot]: trial(7, 2) } }));
  storage.setItem(`${RECORD_KEY}@player-a`, JSON.stringify({ trials: {
    'track02-crossings': trial(9, 2, { frames: ghost }),
  } }));
  let remote = { v: 1, trials: { track01: cloudTrial(19, 3), [slot]: cloudTrial(5, 2) } };
  const api = {
    loadSave: async () => ({ data: remote, updatedAt: 1 }),
    writeSave: async (data) => {
      remote = data;
      return { data, updatedAt: 2 };
    },
  };
  const book = createRecordBook({ storage });
  assert.equal(book.get(slot), null);
  assert.equal(noteTrial(book, slot, book.get(slot), trial(25, 3)).time, 25);
  const device = JSON.parse(storage.getItem(RECORD_KEY));
  assert.deepEqual(device.trials[`${slot}-l2`].frames, ghost);
  assert.equal(device.trials[`${slot}-l2`].time, 6);
  assert.equal(createRecordBook({ storage }).get(slot).time, 25);

  await book.follow({ bankable: true, playerId: 'player-a', api });
  assert.equal(book.get(slot), null);
  assert.equal(noteTrial(book, slot, book.get(slot), trial(24, 3)).time, 24);
  await book.flush();
  assert.deepEqual(remote.trials[slot], cloudTrial(24, 3));
  assert.deepEqual(remote.trials[`${slot}-l2`], cloudTrial(5, 2));
  assert.deepEqual(remote.trials.track01, cloudTrial(19, 3));
  assert.deepEqual(remote.trials['track02-crossings-l2'], cloudTrial(9, 2));
  assert.equal(JSON.stringify(remote).includes('frames'), false);
  assert.deepEqual(JSON.parse(storage.getItem(RECORD_KEY)), device);
  assert.deepEqual(JSON.parse(storage.getItem(`${RECORD_KEY}@player-a`)).trials['track02-crossings-l2'].frames, ghost);
  const returning = createRecordBook({ storage });
  await returning.follow({ bankable: true, playerId: 'player-a', api });
  assert.equal(returning.get(slot).time, 24);
  assert.deepEqual(returning.get('track02-crossings-l2').frames, ghost);
  const fresh = createRecordBook({ storage: memory() });
  await fresh.follow({ bankable: true, playerId: 'player-a', api });
  assert.equal(fresh.get(slot).time, 24);
  assert.equal(fresh.get('track02-crossings-l2').time, 9);
  assert.equal(fresh.get('track02-crossings-l2').frames, undefined);

});
