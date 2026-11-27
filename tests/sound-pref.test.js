import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MUTE_KEY, muteFromSearch, saveMuted, soundLabel, startMuted } from '../src/sound-pref.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
}
const brokenStorage = {
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('blocked'); },
};

describe('sound preference', () => {
  it('starts with sound on when nothing is saved', () => {
    assert.equal(startMuted(memoryStorage(), ''), false);
  });

  it('starts muted when the player muted last time', () => {
    assert.equal(startMuted(memoryStorage({ [MUTE_KEY]: '1' }), ''), true);
    assert.equal(startMuted(memoryStorage({ [MUTE_KEY]: '0' }), ''), false);
  });

  it('reads ?mute=1 and ?mute=0 from the address, and ignores anything else', () => {
    assert.equal(muteFromSearch('?mute=1'), true);
    assert.equal(muteFromSearch('?quality=low&mute=1'), true);
    assert.equal(muteFromSearch('?mute=0'), false);
    assert.equal(muteFromSearch('?mute=yes'), null);
    assert.equal(muteFromSearch(''), null);
  });

  it('lets the address override the saved choice for this visit', () => {
    assert.equal(startMuted(memoryStorage({ [MUTE_KEY]: '0' }), '?mute=1'), true);
    assert.equal(startMuted(memoryStorage({ [MUTE_KEY]: '1' }), '?mute=0'), false);
  });

  it('starts muted on a test server whatever is saved, unless the address asks for sound', () => {
    assert.equal(startMuted(memoryStorage({ [MUTE_KEY]: '0' }), '', true), true);
    assert.equal(startMuted(memoryStorage(), '', true), true);
    assert.equal(startMuted(memoryStorage(), '?mute=0', true), false);
  });

  it('survives storage that throws', () => {
    assert.equal(startMuted(brokenStorage, ''), false);
    assert.equal(startMuted(brokenStorage, '?mute=1'), true);
    assert.doesNotThrow(() => saveMuted(brokenStorage, true));
  });

  it('saves the choice so the next visit starts the same way', () => {
    const storage = memoryStorage();
    saveMuted(storage, true);
    assert.equal(storage.getItem(MUTE_KEY), '1');
    assert.equal(startMuted(storage, ''), true);
    saveMuted(storage, false);
    assert.equal(storage.getItem(MUTE_KEY), '0');
    assert.equal(startMuted(storage, ''), false);
  });

  it('labels the button with the current state', () => {
    assert.equal(soundLabel(false), 'Sound: on');
    assert.equal(soundLabel(true), 'Sound: off');
  });
});
