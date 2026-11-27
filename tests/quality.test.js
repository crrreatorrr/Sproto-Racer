import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  QUALITY_KEY, SCALER_DEFAULTS, TIERS, TIER_IDS,
  basePixelRatio, createResolutionScaler, loadTier, minScaleFor,
  normalizeTier, saveTier, savedTier, tierFor, tierFromSearch,
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
/** A scaler that has seen ten seconds of paddock on a 60 Hz screen and is past its warm-up. */
function warmScaler(minScale, options) {
  const scaler = createResolutionScaler({ minScale, ...options });
  for (let i = 0; i < 600; i++) scaler.observe(FRAME);
  run(scaler, 90, () => FRAME);
  assert.equal(scaler.scale, 1);
  return scaler;
}
/** Repeatable random numbers in [0, 1). */
function random(seed) {
  let state = seed >>> 0;
  return () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const share = (seen, test) => seen.filter(test).length / seen.length;
const near = (a, b) => Math.abs(a - b) < 1e-9;
/** The budget is an average of measured frame times, so it is only compared loosely. */
const about = (a, b) => Math.abs(a - b) < 0.05;
// A typical floor for the scaler tests: a base ratio of 1.6 that may fall to 0.75.
const AUTO_RETINA = 0.75 / 1.6;

describe('quality tiers', () => {
  it('defines Auto, High, Medium and Low with the expected limits', () => {
    assert.deepEqual(TIER_IDS, ['auto', 'high', 'medium', 'low']);
    for (const id of TIER_IDS) {
      const tier = TIERS[id];
      assert.equal(tier.id, id);
      assert.ok(tier.minPixelRatio <= tier.maxPixelRatio, id);
      assert.ok(tier.blurb.length > 10, id);
    }
    // High goes up to 2.5 device pixels per CSS pixel within a 6-megapixel frame, and never scales.
    assert.equal(TIERS.high.maxPixelRatio, 2.5);
    assert.equal(TIERS.high.pixelBudget, 6_000_000);
    assert.equal(TIERS.high.minPixelRatio, TIERS.high.maxPixelRatio);
    assert.equal(TIERS.high.antialias, true);
    // Auto starts where High is.
    assert.equal(TIERS.auto.maxPixelRatio, TIERS.high.maxPixelRatio);
    assert.equal(TIERS.auto.pixelBudget, TIERS.high.pixelBudget);
    assert.equal(TIERS.auto.antialias, TIERS.high.antialias);
    // Low can go below one canvas pixel per CSS pixel, and drops antialiasing.
    assert.equal(TIERS.low.maxPixelRatio, 1);
    assert.ok(TIERS.low.minPixelRatio < 1);
    assert.equal(TIERS.low.antialias, false);
    // Only Low goes without the sunlight shadow map.
    assert.deepEqual(TIER_IDS.filter((id) => !TIERS[id].shadows), ['low']);
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

  it('looks a tier up by id and falls back to Auto', () => {
    assert.equal(tierFor('low'), TIERS.low);
    assert.equal(tierFor(' Medium '), TIERS.medium);
    assert.equal(tierFor('nonsense'), TIERS.auto);
    assert.equal(tierFor(undefined), TIERS.auto);
  });

  it('turns a tier and a screen into a pixel ratio and a scaling floor', () => {
    assert.equal(basePixelRatio(TIERS.high, 2), 2);
    assert.equal(basePixelRatio(TIERS.high, 1), 1);
    assert.equal(basePixelRatio(TIERS.auto, 3), 2.5);
    // The pixel budget holds the ratio down on a large window, but never below 1.
    assert.equal(basePixelRatio(TIERS.high, 2, 1512 * 982), 2);
    assert.ok(Math.abs(basePixelRatio(TIERS.high, 2, 2560 * 1440) - Math.sqrt(6_000_000 / (2560 * 1440))) < 1e-12);
    assert.equal(basePixelRatio(TIERS.auto, 2, 3840 * 2160), 1);
    assert.equal(basePixelRatio(TIERS.auto, 3, 390 * 844), 2.5);
    assert.equal(basePixelRatio(TIERS.medium, 2, 3840 * 2160), 1.3);
    assert.equal(basePixelRatio(TIERS.medium, 2), 1.3);
    assert.equal(basePixelRatio(TIERS.low, 3), 1);
    assert.equal(basePixelRatio(TIERS.low, 0), 1);
    assert.equal(basePixelRatio(TIERS.low, undefined), 1);
    // High never scales.
    assert.equal(minScaleFor(TIERS.high, 2), 1);
    assert.equal(minScaleFor(TIERS.high, 1), 1);
    assert.equal(minScaleFor(TIERS.high, 2, 2560 * 1440), 1);
    // Auto on a high-DPI screen can fall from the screen's ratio to 0.75, with or without the budget.
    assert.ok(Math.abs(basePixelRatio(TIERS.auto, 2, 2560 * 1440) * minScaleFor(TIERS.auto, 2, 2560 * 1440) - 0.75) < 1e-9);
    assert.ok(Math.abs(basePixelRatio(TIERS.auto, 2) * minScaleFor(TIERS.auto, 2) - 0.75) < 1e-9);
    assert.ok(Math.abs(basePixelRatio(TIERS.medium, 2) * minScaleFor(TIERS.medium, 2) - 0.85) < 1e-9);
    assert.equal(minScaleFor(TIERS.low, 2), 0.75);
    // On a screen whose own ratio is 1, Medium starts where High does but may still lower it.
    assert.equal(basePixelRatio(TIERS.medium, 1), basePixelRatio(TIERS.high, 1));
    assert.equal(minScaleFor(TIERS.medium, 1), 0.85);
    assert.ok(minScaleFor(TIERS.low, 1) < minScaleFor(TIERS.medium, 1));
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
    // A 120 Hz screen running flat out is on time too, and so is one that only manages 60 fps:
    // the scaler never trades resolution for more than 60 fps.
    run(scaler, 120 * 60, () => 1000 / 120);
    run(scaler, 60 * 60, () => FRAME);
    assert.equal(scaler.changes, 0);
    assert.ok(about(scaler.budget, FRAME));
  });

  it('steps down under sustained slow frames and settles where frames are on time', () => {
    // 25 ms at full resolution, 18.9 ms one step down, 14.5 ms two steps down.
    const cost = fillBound(25);
    const scaler = warmScaler(AUTO_RETINA);
    run(scaler, 40, (scale) => vsync(cost(scale)));
    assert.equal(scaler.scale, 1, 'forty frames are not yet sustained');
    run(scaler, 200, (scale) => vsync(cost(scale)));
    assert.ok(near(scaler.scale, 0.85 * 0.85), `settled at ${scaler.scale}`);
    assert.equal(scaler.changes, 2);
    assert.equal(vsync(cost(scaler.scale)), FRAME);
  });

  it('takes two steps at once when frames are far over budget', () => {
    const scaler = warmScaler(AUTO_RETINA);
    run(scaler, 70, () => 50);
    assert.equal(scaler.changes, 1);
    assert.equal(scaler.level, 2);
  });

  it('steps down for scattered late frames that a lower resolution fixes', () => {
    // One frame in nine misses at full resolution and none one step down.
    const scaler = warmScaler(AUTO_RETINA);
    const seen = run(scaler, 60 * 180, (scale, i) => (scale === 1 && i % 9 === 8 ? 2 * FRAME : FRAME));
    const first = seen.findIndex((scale) => scale < 1);
    assert.ok(first > 120 && first <= 600, `first step after ${first} frames`);
    assert.ok(seen.every((scale) => scale >= 0.85 - 1e-9), 'one step is enough');
    const settled = share(seen.slice(600), (scale) => near(scale, 0.85));
    assert.ok(settled > 0.85, `${(settled * 100).toFixed(1)}% of frames one step down`);

    // A worse stretch is acted on sooner: one frame in three.
    const worse = warmScaler(AUTO_RETINA);
    const quick = run(worse, 60 * 10, (scale, i) => (scale === 1 && i % 3 === 2 ? 2 * FRAME : FRAME));
    assert.ok(quick.findIndex((scale) => scale < 1) < 200);

    // One in fifteen is under the bar and moves nothing.
    const under = warmScaler(AUTO_RETINA);
    run(under, 60 * 300, (scale, i) => (i % 15 === 14 ? 2 * FRAME : FRAME));
    assert.equal(under.changes, 0);
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
    const atGoodStep = share(lastFive, (scale) => near(scale, 0.85));
    assert.ok(atGoodStep > 0.97, `${(atGoodStep * 100).toFixed(1)}% of frames at the stable step`);
    assert.ok(seen.every((scale) => scale >= 0.85 - 1e-9), 'never overshoots below the stable step');
  });

  it('holds still when frames sit between the calm and slow thresholds', () => {
    // A fifth of frames at 20 ms on a 60 Hz screen: not calm, not slow.
    const scaler = warmScaler(AUTO_RETINA);
    run(scaler, 60 * 300, (scale, i) => (i % 5 === 4 ? 20 : FRAME));
    assert.equal(scaler.changes, 0);
    assert.ok(about(scaler.budget, FRAME));
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
    // Nor is one right after a race starts, when there is little history to weigh it against.
    for (let offset = 0; offset < 20; offset++) {
      scaler.restart();
      run(scaler, 70 + offset, () => FRAME);
      run(scaler, 12, () => 60);
      run(scaler, 400, () => FRAME);
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
    // Slow at any resolution, but faster the lower it goes: it should go to the floor and stay.
    const scaler = warmScaler(0.75);
    const seen = run(scaler, 60 * 120, (scale) => 20 + 60 * scale * scale);
    assert.equal(scaler.levels, 2);
    assert.ok(seen.every((scale) => scale >= 0.75 && scale <= 1));
    const atFloor = share(seen, (scale) => scale === 0.75);
    assert.ok(atFloor > 0.9, `${(atFloor * 100).toFixed(1)}% of frames at the floor`);

    // A fixed tier (High) has no room: nothing moves it.
    const fixed = warmScaler(1);
    run(fixed, 60 * 60, () => 80);
    assert.equal(fixed.scale, 1);
    assert.equal(fixed.changes, 0);

    // Fast frames never push it above 1.
    run(scaler, 60 * 120, () => 4);
    assert.equal(scaler.scale, 1);
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
    const seen = run(scaler, 60 * 30, (scale) => 30 + 90 * scale * scale);
    assert.ok(near(Math.min(...seen), AUTO_RETINA));
    // Moved to a 1x screen: Auto's floor is now 0.75 of the base ratio.
    assert.equal(scaler.setMinScale(minScaleFor(TIERS.auto, 1)), 0.75);
    assert.equal(scaler.levels, 2);
    assert.equal(scaler.setMinScale(1), 1);
    assert.equal(scaler.levels, 0);
    // Garbage in leaves it fixed rather than broken.
    assert.equal(scaler.setMinScale(NaN), 1);
    assert.equal(scaler.sample(NaN), 1);
    assert.equal(scaler.sample(-5), 1);
    scaler.observe(NaN);
    scaler.observe(-5);
    assert.ok(about(scaler.budget, FRAME));
  });
});

describe('resolution scaler: late frames that resolution does not cause', () => {
  const MINUTES = 10;

  it('leaves the resolution alone when 5% of frames drop whatever the resolution', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const rand = random(seed * 7919);
      const scaler = warmScaler(AUTO_RETINA);
      const seen = run(scaler, 60 * 60 * MINUTES, () => (rand() < 0.05 ? 2 * FRAME : FRAME));
      assert.ok(seen.every((scale) => scale > AUTO_RETINA + 1e-9), `seed ${seed}: reached the floor`);
      const full = share(seen, (scale) => scale === 1);
      assert.ok(full > 0.97, `seed ${seed}: ${(full * 100).toFixed(1)}% of frames at full resolution`);
      assert.equal(scaler.scale, 1, `seed ${seed}`);
    }
  });

  it('tries one step when 10% of frames drop, finds it does not help, and undoes it', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const rand = random(seed * 104729);
      const scaler = warmScaler(AUTO_RETINA);
      const seen = run(scaler, 60 * 60 * MINUTES, () => (rand() < 0.1 ? 2 * FRAME : FRAME));
      assert.ok(seen.every((scale) => scale > AUTO_RETINA + 1e-9), `seed ${seed}: reached the floor`);
      const lowest = Math.min(...seen);
      assert.ok(lowest >= 0.85 * 0.85 - 1e-9, `seed ${seed}: went down to ${lowest}`);
      const full = share(seen, (scale) => scale === 1);
      assert.ok(full > 0.9, `seed ${seed}: ${(full * 100).toFixed(1)}% of frames at full resolution`);
    }
    // The first try comes early, is undone, and the next one waits.
    const rand = random(31337);
    const scaler = warmScaler(AUTO_RETINA);
    const seen = run(scaler, 60 * 60, () => (rand() < 0.1 ? 2 * FRAME : FRAME));
    assert.ok(seen.some((scale) => scale < 1), 'it tried');
    assert.equal(scaler.scale, 1);
    assert.equal(scaler.holding, true);
  });

  it('goes back to full resolution after a descent that was interrupted and bought nothing', () => {
    // Mostly-late stretches with on-time frames in between, the same at every resolution. The
    // on-time blocks must not make it forget where the descent started.
    const scaler = warmScaler(AUTO_RETINA);
    const seen = run(scaler, 60 * 120, (scale, i) => (i % 100 < 70 ? 2 * FRAME : FRAME));
    assert.ok(near(Math.min(...seen), AUTO_RETINA), 'it went all the way down first');
    const atFloor = share(seen, (scale) => near(scale, AUTO_RETINA));
    assert.ok(atFloor < 0.05, `${(atFloor * 100).toFixed(1)}% of frames at the floor`);
    assert.equal(scaler.scale, 1);
    assert.equal(scaler.holding, true);
    const changes = scaler.changes;
    run(scaler, 60 * 60, (scale, i) => (i % 100 < 70 ? 2 * FRAME : FRAME));
    assert.equal(scaler.changes, changes, 'stays at full resolution while holding');
  });

  it('gives up and restores full resolution when every frame is late at any resolution', () => {
    // A processor-bound device: the paddock ran at 60 fps, the race runs at 30 whatever the size.
    const scaler = warmScaler(AUTO_RETINA);
    const seen = run(scaler, 30 * 20, () => 2 * FRAME);
    assert.ok(Math.min(...seen) <= AUTO_RETINA + 1e-9, 'it tried the floor first');
    assert.equal(scaler.scale, 1);
    assert.equal(scaler.holding, true);
    const changes = scaler.changes;
    // From here on 30 fps is this device's pace, and it is not tried again.
    run(scaler, 30 * 60 * 20, () => 2 * FRAME);
    assert.equal(scaler.scale, 1);
    assert.equal(scaler.changes, changes);
    assert.ok(about(scaler.budget, 2 * FRAME));
  });

  it('keeps retrying a lowered resolution even when frames never become calm', () => {
    // A heavy minute lowers it; afterwards the scene is light but 5% of frames still drop.
    const rand = random(2024);
    const scaler = warmScaler(AUTO_RETINA);
    run(scaler, 60 * 20, (scale) => vsync(fillBound(35)(scale)));
    assert.ok(scaler.level >= 2);
    const seen = run(scaler, 60 * 180, () => (rand() < 0.05 ? 2 * FRAME : FRAME));
    assert.equal(scaler.scale, 1);
    assert.ok(seen.indexOf(1) < 60 * 120, `back at full resolution after ${seen.indexOf(1)} frames`);
  });
});

describe('resolution scaler: screens that are not 60 Hz', () => {
  const MINUTES = 10;
  const steady = (hz, jitter, seed = 99) => {
    const rand = random(seed);
    return () => 1000 / hz + (rand() * 2 - 1) * jitter;
  };

  it('treats a 50 Hz screen as on time, with or without jitter', () => {
    for (const jitter of [0, 1.5]) {
      const scaler = createResolutionScaler({ minScale: AUTO_RETINA });
      run(scaler, 50 * 60 * MINUTES, steady(50, jitter));
      assert.equal(scaler.changes, 0, `jitter ${jitter} ms`);
      assert.ok(Math.abs(scaler.budget - 20) < 0.3, `budget ${scaler.budget}`);
    }
  });

  it('treats 48 Hz, a 30 fps cap and faster screens as on time', () => {
    for (const [hz, jitter] of [[48, 0], [48, 1.5], [30, 0], [30, 2], [75, 1.5], [90, 1], [144, 1]]) {
      const scaler = createResolutionScaler({ minScale: AUTO_RETINA });
      const seen = run(scaler, hz * 60 * MINUTES, steady(hz, jitter));
      assert.equal(scaler.changes, 0, `${hz} Hz, jitter ${jitter} ms`);
      assert.ok(seen.every((scale) => scale === 1));
      assert.ok(Math.abs(scaler.budget - Math.max(FRAME, 1000 / hz)) < 0.4, `${hz} Hz: budget ${scaler.budget}`);
    }
  });

  it('accepts a 30 fps cap that arrives mid-race after one look', () => {
    // A battery saver switches on: 60 fps until then, 30 fps after, whatever the resolution.
    const scaler = warmScaler(AUTO_RETINA);
    run(scaler, 60 * 60, () => FRAME);
    const seen = run(scaler, 30 * 60 * MINUTES, () => 2 * FRAME);
    const below = share(seen, (scale) => scale < 1);
    assert.ok(below < 0.03, `${(below * 100).toFixed(1)}% of frames below full resolution`);
    assert.equal(scaler.scale, 1);
    assert.ok(about(scaler.budget, 2 * FRAME));
    const changes = scaler.changes;
    run(scaler, 30 * 60 * MINUTES, () => 2 * FRAME);
    assert.equal(scaler.changes, changes);
  });

  it('still scales on a 50 Hz screen when frames miss its refresh', () => {
    // 24 ms at full resolution shows as 40 ms on a 50 Hz screen; one step down fits in 20 ms.
    const refresh = 20;
    const shown = (cost) => Math.max(1, Math.ceil(cost / refresh - 1e-9)) * refresh;
    const scaler = createResolutionScaler({ minScale: AUTO_RETINA });
    for (let i = 0; i < 500; i++) scaler.observe(refresh);
    const seen = run(scaler, 50 * 60, (scale) => shown(fillBound(24)(scale)));
    assert.ok(seen.every((scale) => scale >= 0.85 - 1e-9));
    assert.ok(share(seen, (scale) => near(scale, 0.85)) > 0.8);
  });

  it('learns the pace of the screen from paddock and pause frames', () => {
    // With no history, a race that only ever shows 33 ms frames looks like a 30 fps screen.
    const cost = fillBound(25);
    const blind = createResolutionScaler({ minScale: AUTO_RETINA });
    run(blind, 30 * 60, (scale) => vsync(cost(scale)));
    assert.equal(blind.changes, 0);
    // A few seconds of pause menu at 60 fps is enough to show it is not.
    for (let i = 0; i < 180; i++) blind.observe(FRAME);
    run(blind, 30 * 10, (scale) => vsync(cost(scale)));
    assert.equal(blind.level, 2);
    assert.equal(vsync(cost(blind.scale)), FRAME);
    // Stalls in the paddock teach it nothing.
    const stalled = createResolutionScaler({ minScale: AUTO_RETINA });
    for (let i = 0; i < 600; i++) stalled.observe(i % 2 ? FRAME : 400);
    assert.ok(about(stalled.budget, FRAME));
  });
});
