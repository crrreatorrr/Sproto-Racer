// The Low graphics tier holds car textures to 1024 pixels a side to save graphics memory.

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { TIERS } from '../src/quality.js';
import { fitWithin, setTextureSizeLimit, textureSizeLimit } from '../src/texture-budget.js';

const realLocation = globalThis.location;
afterEach(() => {
  setTextureSizeLimit(null);
  if (realLocation === undefined) delete globalThis.location;
  else globalThis.location = realLocation;
});

describe('texture size limit', () => {
  it('only the Low tier has one', () => {
    assert.equal(TIERS.low.maxTextureSize, 1024);
    for (const id of ['auto', 'high', 'medium']) assert.equal(TIERS[id].maxTextureSize, undefined, id);
  });

  it('follows the graphics tier, read once on first use', () => {
    globalThis.location = { search: '' };
    assert.equal(textureSizeLimit(), Infinity);
    setTextureSizeLimit(null);
    globalThis.location = { search: '?quality=low' };
    assert.equal(textureSizeLimit(), 1024);
    // Read once: a later change of tier applies from the next page load.
    globalThis.location = { search: '?quality=high' };
    assert.equal(textureSizeLimit(), 1024);
  });

  it('shrinks only what is over the limit, and keeps the shape', () => {
    assert.equal(fitWithin(1024, 1024, 1024), null);
    assert.equal(fitWithin(896, 680, 1024), null);
    assert.equal(fitWithin(2048, 2048, Infinity), null);
    assert.deepEqual(fitWithin(2048, 2048, 1024), { width: 1024, height: 1024 });
    assert.deepEqual(fitWithin(2048, 720, 1024), { width: 1024, height: 360 });
    assert.deepEqual(fitWithin(1536, 256, 1024), { width: 1024, height: 171 });
    assert.deepEqual(fitWithin(4096, 1, 1024), { width: 1024, height: 1 });
    // Nothing to do for an image that has not loaded.
    assert.equal(fitWithin(0, 0, 1024), null);
    assert.equal(fitWithin(undefined, undefined, 1024), null);
  });
});
