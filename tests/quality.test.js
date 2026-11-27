import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  QUALITY_KEY, SCALER_DEFAULTS, TIERS, TIER_IDS,
  activeTier, anisotropyCap, basePixelRatio, createResolutionScaler, loadTier, minScaleFor,
  normalizeTier, saveTier, savedTier, setActiveTier, tierFromSearch,
} from '../src/quality.js';

const FRAME = 1000 / 60;
/** What a 60 Hz screen shows for a frame that took `cost` ms to produce. */
const vsync = (cost) => Math.max(1, Math.ceil(cost / FRAME - 1e-9)) * FRAME;
/** A device whose frame cost is a fixed part plus a part that grows with the pixel count. */
const fillBound = (full, fixed = 3) => (scale) => fixed + (full - fixed) * scale * scale;

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
}
const brokenStorage = {
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('blocked'); },
};

/** Run `frames` frames; `frameMs(scale, i)` is the plant. Returns every scale the scaler chose. */
function run(scaler, frames, frameMs) {
  const seen = [];
  for (let i = 0; i < frames; i++) seen.push(scaler.sample(frameMs(scaler.scale, i)));
  return seen;
}
/** A scaler that is already past its one-second warm-up. */
function warmScaler(minScale, options) {
  const scaler = createResolutionScaler({ minScale, ...options });
  run(scaler, 90, () => FRAME);
  assert.equal(scaler.scale, 1);
  return scaler;
}
const AUTO_RETINA = minScaleFor(TIERS.auto, 2); // 0.75 / 1.6

describe('quality tiers', () => {
  it('defines Auto, High, Medium and Low with the expected limits', () => {
    assert.deepEqual(TIER_IDS, ['auto', 'high', 'medium', 'low']);
    for (const id of TIER_IDS) {
      const tier = TIERS[id];
      assert.equal(tier.id, id);
      assert.ok(tier.minPixelRatio <= tier.maxPixelRatio, id);
      assert.ok(tier.anisotropy >= 1, id);
      assert.ok(tier.blurb.length > 10, id);
    }
    // High keeps the cap the game shipped with, and never scales.
    assert.equal(TIERS.high.maxPixelRatio, 1.6);
    assert.equal(TIERS.high.minPixelRatio, 1.6);
    assert.equal(TIERS.high.antialias, true);
    // Auto starts where High is.
    assert.equal(TIERS.auto.maxPixelRatio, TIERS.high.maxPixelRatio);
    assert.equal(TIERS.auto.antialias, TIERS.high.antialias);
    assert.equal(TIERS.auto.anisotropy, TIERS.high.anisotropy);
    // Low can go below one canvas pixel per CSS pixel, and drops antialiasing.
    assert.equal(TIERS.low.maxPixelRatio, 1);
    assert.ok(TIERS.low.minPixelRatio < 1);
    assert.equal(TIERS.low.antialias, false);
    assert.ok(TIERS.low.anisotropy < TIERS.medium.anisotropy && TIERS.medium.anisotropy < TIERS.high.anisotropy);
  });

  it('reads the tier from the URL first, then storage, then defaults to Auto', () => {
    assert.equal(loadTier(null, ''), TIERS.auto);
    assert.equal(loadTier(memoryStorage(), ''), TIERS.auto);
    assert.equal(loadTier(memoryStorage({ [QUALITY_KEY]: 'low' }), ''), TIERS.low);
    assert.equal(loadTier(memoryStorage({ [QUALITY_KEY]: 'low' }), '?perf=1&quality=high'), TIERS.high);
    assert.equal(loadTier(memoryStorage({ [QUALITY_KEY]: 'medium' }), '?quality=ultra'), TIERS.medium);
    assert.equal(loadTier(memoryStorage({ [QUALITY_KEY]: 'potato' }), ''), TIERS.auto);
    assert.equal(tierFromSearch('?quality=MEDIUM'), 'medium');
    assert.equal(tierFromSearch('?quality='), null);
    assert.equal(normalizeTier('constructor'), null);
    assert.equal(normalizeTier(undefined), null);
  });

  it('saves the choice and survives storage that throws', () => {
    const storage = memoryStorage();
    assert.equal(saveTier(storage, 'medium'), true);
    assert.equal(savedTier(storage), 'medium');
    assert.equal(saveTier(storage, 'ultra'), false);
    assert.equal(savedTier(storage), 'medium');
    assert.equal(saveTier(brokenStorage, 'low'), false);
    assert.equal(savedTier(brokenStorage), null);
    assert.equal(loadTier(brokenStorage, ''), TIERS.auto);
  });

  it('exposes the active tier and its anisotropy cap to other modules', () => {
    assert.equal(setActiveTier('low'), TIERS.low);
    assert.equal(anisotropyCap(), TIERS.low.anisotropy);
    assert.equal(setActiveTier(TIERS.medium), TIERS.medium);
    assert.equal(activeTier(), TIERS.medium);
    assert.equal(setActiveTier('nonsense'), TIERS.auto);
    assert.equal(anisotropyCap(), 8);
  });

  it('turns a tier and a screen into a pixel ratio and a scaling floor', () => {
    assert.equal(basePixelRatio(TIERS.high, 2), 1.6);
    assert.equal(basePixelRatio(TIERS.high, 1), 1);
    assert.equal(basePixelRatio(TIERS.auto, 3), 1.6);
    assert.equal(basePixelRatio(TIERS.medium, 2), 1.3);
    assert.equal(basePixelRatio(TIERS.low, 3), 1);
    assert.equal(basePixelRatio(TIERS.low, 0), 1);
    assert.equal(basePixelRatio(TIERS.low, undefined), 1);
    // High never scales.
    assert.equal(minScaleFor(TIERS.high, 2), 1);
    assert.equal(minScaleFor(TIERS.high, 1), 1);
    // Auto on a high-DPI screen can fall from 1.6 to 0.75.
    assert.ok(Math.abs(basePixelRatio(TIERS.auto, 2) * minScaleFor(TIERS.auto, 2) - 0.75) < 1e-9);
    assert.ok(Math.abs(basePixelRatio(TIERS.medium, 2) * minScaleFor(TIERS.medium, 2) - 1) < 1e-9);
    assert.equal(minScaleFor(TIERS.low, 2), 0.75);
    // A screen already below the floor is left alone.
    assert.equal(minScaleFor(TIERS.auto, 0.5), 1);
  });
});

describe('resolution scaler', () => {
  it('never moves while frames are on time', () => {
    const scaler = createResolutionScaler({ minScale: AUTO_RETINA });
    run(scaler, 60 * 300, () => FRAME);
    assert.equal(scaler.scale, 1);
    assert.equal(scaler.changes, 0);
    // A 120 Hz screen running flat out is on time too.
    run(scaler, 120 * 60, () => 1000 / 120);
    assert.equal(scaler.changes, 0);
  });

  it('steps down under sustained slow frames and settles where frames are on time', () => {
    // 25 ms at full resolution, 18.9 ms one step down, 14.5 ms two steps down.
    const cost = fillBound(25);
    const scaler = warmScaler(AUTO_RETINA);
    run(scaler, 40, (scale) => vsync(cost(scale)));
    assert.equal(scaler.scale, 1, 'forty frames are not yet sustained');
    run(scaler, 200, (scale) => vsync(cost(scale)));
    assert.ok(Math.abs(scaler.scale - 0.85 * 0.85) < 1e-9, `settled at ${scaler.scale}`);
    assert.equal(scaler.changes, 2);
    assert.equal(vsync(cost(scaler.scale)), FRAME);
  });

  it('steps down when one frame in nine is slow, and not when one in fifteen is', () => {
    // The trigger is the 90th percentile: 10% of frames over budget, block after block.
    const under = warmScaler(AUTO_RETINA);
    run(under, 60 * 300, (scale, i) => (i % 15 === 14 ? 2 * FRAME : FRAME));
    assert.equal(under.changes, 0);

    const over = warmScaler(AUTO_RETINA);
    run(over, 60 * 5, (scale, i) => (scale === 1 && i % 9 === 8 ? 2 * FRAME : FRAME));
    assert.equal(over.changes, 1);
    assert.equal(over.level, 1);
  });

  it('takes two steps at once when frames are far over budget', () => {
    const scaler = warmScaler(AUTO_RETINA);
    run(scaler, 70, () => 50);
    assert.equal(scaler.changes, 1);
    assert.equal(scaler.level, 2);
  });

  it('recovers when the load goes away, but only after a longer calm period', () => {
    const scaler = warmScaler(AUTO_RETINA);
    const down = run(scaler, 200, (scale) => vsync(fillBound(25)(scale)));
    assert.equal(scaler.level, 2);
    const framesToStepDown = down.indexOf(0.85) + 1;
    scaler.restart(); // forget the calm frames already banked at this level
    const up = run(scaler, 700, () => FRAME);
    const framesToStepUp = up.findIndex((scale) => scale > 0.85 * 0.85 + 1e-9) + 1;
    assert.ok(framesToStepUp >= SCALER_DEFAULTS.upBlocks * SCALER_DEFAULTS.blockFrames, `first step up after ${framesToStepUp} frames`);
    assert.ok(framesToStepUp >= 4 * framesToStepDown, `up after ${framesToStepUp}, down after ${framesToStepDown}`);
    assert.equal(scaler.scale, 1);
    assert.equal(scaler.level, 0);
  });

  it('does not oscillate when full resolution is just out of reach', () => {
    // Full resolution misses every frame, one step down is comfortable.
    const cost = fillBound(21, 3); // 21 ms -> 16.0 ms
    const scaler = warmScaler(AUTO_RETINA);
    const minutes = 10;
    const seen = run(scaler, 60 * 60 * minutes, (scale) => vsync(cost(scale)));
    const lastFive = seen.slice(-60 * 60 * 5);
    let moves = 0;
    for (let i = 1; i < lastFive.length; i++) if (lastFive[i] !== lastFive[i - 1]) moves++;
    // Probing backs off to once every 64 s: about five probes, two moves each, in five minutes.
    assert.ok(moves <= 10, `${moves} moves in five minutes`);
    const atGoodStep = lastFive.filter((scale) => Math.abs(scale - 0.85) < 1e-9).length / lastFive.length;
    assert.ok(atGoodStep > 0.97, `${(atGoodStep * 100).toFixed(1)}% of frames at the stable step`);
    assert.ok(seen.every((scale) => scale >= 0.85 - 1e-9), 'never overshoots below the stable step');
  });

  it('holds still when frames sit inside the hysteresis band', () => {
    // Noisy frames between the calm and slow thresholds, on a screen that is not vsync-quantised.
    let seed = 12345;
    const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const scaler = warmScaler(AUTO_RETINA);
    run(scaler, 60 * 120, () => 19.2 + noise() * 1.7); // 19.2 to 20.9 ms
    assert.equal(scaler.changes, 0);

    // One step down lands in the band: it steps once and then stays put.
    const banded = warmScaler(AUTO_RETINA);
    run(banded, 60 * 300, (scale) => (scale === 1 ? 24 : 19.5 + noise()));
    assert.equal(banded.changes, 1);
    assert.equal(banded.level, 1);
  });

  it('ignores isolated long frames and short bursts', () => {
    const scaler = warmScaler(AUTO_RETINA);
    run(scaler, 60 * 120, (scale, i) => {
      if (i % 400 === 399) return 620; // a shader compile
      if (i % 400 === 200) return 100; // a frame the loop clamps
      if (i % 45 === 44) return 2 * FRAME; // a dropped frame now and then
      return FRAME;
    });
    assert.equal(scaler.changes, 0);
    // A burst (an item's effects compiling) is not sustained, wherever it falls in a block.
    for (let offset = 0; offset < 20; offset++) {
      run(scaler, 12, () => 60);
      run(scaler, 300 + offset, () => FRAME);
    }
    assert.equal(scaler.changes, 0);
    // Returning from another tab: one huge frame, then normal.
    run(scaler, 1, () => 45000);
    run(scaler, 300, () => FRAME);
    assert.equal(scaler.changes, 0);
  });

  it('still reacts when every frame is 100 ms or longer', () => {
    const scaler = createResolutionScaler({ minScale: AUTO_RETINA });
    run(scaler, 200, (scale) => 20 + 130 * scale * scale);
    assert.ok(scaler.scale < 1, `scale ${scaler.scale}`);
  });

  it('respects the floor and the ceiling', () => {
    // Slow at any resolution, but faster the lower it goes: it should stop at the floor and stay.
    const scaler = warmScaler(0.75);
    const seen = run(scaler, 60 * 120, (scale) => 20 + 60 * scale * scale);
    assert.equal(scaler.scale, 0.75);
    assert.ok(seen.every((scale) => scale >= 0.75 && scale <= 1));
    assert.equal(scaler.levels, 2);

    // A fixed tier (High) has no room: nothing moves it.
    const fixed = warmScaler(1);
    run(fixed, 60 * 60, () => 80);
    assert.equal(fixed.scale, 1);
    assert.equal(fixed.changes, 0);

    // Fast frames never push it above 1.
    run(scaler, 60 * 120, () => 4);
    assert.equal(scaler.scale, 1);
  });

  it('gives up and restores full resolution when lowering it does not help', () => {
    // A browser capped at 30 fps, or a processor-bound device: 33.3 ms whatever the resolution.
    const scaler = warmScaler(AUTO_RETINA);
    const seen = run(scaler, 30 * 20, () => 2 * FRAME);
    assert.ok(Math.min(...seen) <= AUTO_RETINA + 1e-9, 'it tried the floor first');
    assert.equal(scaler.scale, 1);
    assert.equal(scaler.holding, true);
    const changes = scaler.changes;
    run(scaler, 30 * 60, () => 2 * FRAME);
    assert.equal(scaler.scale, 1, 'stays at full resolution while holding');
    assert.equal(scaler.changes, changes);
  });

  it('ignores the first second after a restart and keeps the level it had learned', () => {
    const scaler = createResolutionScaler({ minScale: AUTO_RETINA });
    run(scaler, 29, () => 2 * FRAME); // 967 ms of slow start-up frames
    run(scaler, 600, () => FRAME);
    assert.equal(scaler.changes, 0);

    run(scaler, 200, (scale) => vsync(fillBound(25)(scale)));
    assert.equal(scaler.level, 2);
    scaler.restart();
    assert.equal(scaler.level, 2);
    run(scaler, 29, () => 2 * FRAME);
    assert.equal(scaler.level, 2);

    scaler.reset();
    assert.equal(scaler.scale, 1);
    assert.equal(scaler.level, 0);
  });

  it('follows a floor that changes when the window moves to another screen', () => {
    const scaler = warmScaler(AUTO_RETINA);
    assert.equal(scaler.levels, 5);
    run(scaler, 60 * 30, (scale) => 20 + 90 * scale * scale);
    assert.ok(Math.abs(scaler.scale - AUTO_RETINA) < 1e-9);
    // Moved to a 1x screen: Auto's floor is now 0.75 of the base ratio.
    assert.equal(scaler.setMinScale(minScaleFor(TIERS.auto, 1)), 0.75);
    assert.equal(scaler.levels, 2);
    assert.equal(scaler.setMinScale(1), 1);
    assert.equal(scaler.levels, 0);
    // Garbage in leaves it fixed rather than broken.
    assert.equal(scaler.setMinScale(NaN), 1);
    assert.equal(scaler.sample(NaN), 1);
    assert.equal(scaler.sample(-5), 1);
  });
});
