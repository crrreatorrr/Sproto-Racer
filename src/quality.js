// Graphics quality tiers and automatic resolution scaling.
// No DOM and no Three.js in here: storage and the page's query string are passed in,
// and the scaler only ever sees frame durations. That keeps all of it unit-testable.

export const QUALITY_KEY = 'sproto.quality';
export const DEFAULT_TIER = 'auto';
export const TIER_IDS = ['auto', 'high', 'medium', 'low'];

/**
 * maxPixelRatio  the sharpest the tier renders (the screen's own ratio wins when it is lower).
 * minPixelRatio  how far the scaler may drop it when frames run slow. Equal to the maximum
 *                means the resolution is fixed.
 * antialias      a WebGL context attribute: it can only be chosen when the renderer is created,
 *                so a change takes effect on the next page load.
 * anisotropy     texture filtering cap for modules that load textures (see anisotropyCap()).
 */
export const TIERS = {
  auto: {
    id: 'auto', label: 'Auto', maxPixelRatio: 1.6, minPixelRatio: 0.75, antialias: true, anisotropy: 8,
    blurb: 'Sharpest picture your screen allows. Lowers the resolution by itself if the frame rate drops, and raises it again when it recovers.',
  },
  high: {
    id: 'high', label: 'High', maxPixelRatio: 1.6, minPixelRatio: 1.6, antialias: true, anisotropy: 8,
    blurb: 'Sharpest picture, never lowered. Choose this if the game already runs smoothly.',
  },
  medium: {
    id: 'medium', label: 'Medium', maxPixelRatio: 1.3, minPixelRatio: 1, antialias: true, anisotropy: 4,
    blurb: 'Lower resolution for a steadier frame rate.',
  },
  low: {
    id: 'low', label: 'Low', maxPixelRatio: 1, minPixelRatio: 0.75, antialias: false, anisotropy: 2,
    blurb: 'Lowest resolution and no edge smoothing. Best for older laptops and phones.',
  },
};

export function normalizeTier(value) {
  const id = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return Object.hasOwn(TIERS, id) ? id : null;
}

/** `?quality=low|medium|high|auto`, a testing override that is never saved. */
export function tierFromSearch(search) {
  if (!search) return null;
  try {
    return normalizeTier(new URLSearchParams(search).get('quality'));
  } catch {
    return null;
  }
}

export function savedTier(storage) {
  try {
    return normalizeTier(storage?.getItem(QUALITY_KEY));
  } catch {
    return null;
  }
}

export function saveTier(storage, id) {
  const tier = normalizeTier(id);
  if (!tier) return false;
  try {
    storage?.setItem(QUALITY_KEY, tier);
    return !!storage;
  } catch {
    return false;
  }
}

/** The URL override wins, then the saved choice, then Auto. */
export function loadTier(storage, search) {
  return TIERS[tierFromSearch(search) ?? savedTier(storage) ?? DEFAULT_TIER];
}

let active = TIERS[DEFAULT_TIER];
export function setActiveTier(id) {
  active = TIERS[normalizeTier(typeof id === 'string' ? id : id?.id) ?? DEFAULT_TIER];
  return active;
}
export function activeTier() {
  return active;
}
/** Texture loaders can clamp to this: Math.min(anisotropyCap(), renderer.capabilities.getMaxAnisotropy()). */
export function anisotropyCap() {
  return active.anisotropy;
}

/** The pixel ratio a tier renders at before any scaling, on a screen with this devicePixelRatio. */
export function basePixelRatio(tier, devicePixelRatio) {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(dpr, tier.maxPixelRatio);
}

/** The lowest scale the scaler may reach for this tier and screen (1 means no room to scale). */
export function minScaleFor(tier, devicePixelRatio) {
  const base = basePixelRatio(tier, devicePixelRatio);
  return Math.min(1, tier.minPixelRatio / base);
}

/*
 * The scaler's numbers, and why.
 *
 * What it can see: only the time between animation frames. On a 60 Hz screen that is 16.7 ms when
 * the frame was ready in time and 33.3 ms when it was not, with nothing in between. So it can tell
 * "too slow", but never "how much room is left". That shapes everything below.
 *
 * step 0.85        Each step multiplies the pixel ratio by 0.85, about 28% fewer pixels. Big enough
 *                  to move a frame that just missed, small enough that a step is hard to notice.
 * blockFrames 20   Frames are judged in blocks of 20 (a third of a second at 60 fps).
 * slowMs 21        A frame counts as slow above 21 ms: under a missed frame on every common screen
 *                  (22.2 ms at 90 Hz, 25 ms at 120 Hz, 33.3 ms at 60 Hz) and above a 50 Hz
 *                  screen's normal 20 ms.
 * blockSlow 2      A block is slow when 2 of its 20 frames are slow, which is the block's 90th
 *                  percentile crossing 21 ms.
 * downBlocks 3     Step down after 3 slow blocks in a row (60 frames). Requiring every block to be
 *                  slow is what makes it "sustained": a shader compile, a garbage collection or a
 *                  burst of a dozen bad frames lands in one or two blocks and moves nothing.
 * settleFrames 8   The frames right after a change are skipped: the browser is reallocating the
 *                  canvas, and they say nothing about the new resolution.
 * heavyMs 40       If those 60 frames average 40 ms (under 25 fps) one step cannot be enough, so
 *                  it takes two at once.
 * calmMs 19        Stepping back up needs calm blocks: no frame over 19 ms. A block with one such
 *                  frame neither counts nor resets the run; more than calmSpikes (1) resets it.
 *                  The 19 to 21 ms gap is the hysteresis band; frames in it move nothing.
 * upBlocks 12      Calm has to last 12 blocks (240 frames, 4 s at 60 fps) before a step up, four
 *                  times the evidence needed to step down.
 * probeFrames 600  Because headroom is invisible, a step up is a probe. If it has to be undone
 *                  within 600 frames, the wait before the next probe doubles, up to
 *                  maxBackoff (4) doublings: 4 s, 8 s, 16 s, 32 s, 64 s. A probe that survives
 *                  resets the wait. This is what stops a slow device flickering between two steps.
 * spikeMs 100      Frames of 100 ms or more are dropped as one-off stalls (tab switch, shader
 *                  compile; the game loop clamps them to 0.1 s too) unless spikeRun (3) arrive in
 *                  a row, which means the device really is that slow.
 * warmupMs 1000    The first second after restart() is ignored: race start, canvas resize.
 * futile*          If the scaler runs all the way to the floor and the frames are still slow and
 *                  less than 15% shorter than when it started (futileGain 0.85), having removed
 *                  at least 36% of the pixels (futileSpan 0.8), resolution is not what is slow:
 *                  the processor is, or the browser is capping the frame rate (battery savers
 *                  cap at 30 fps). It returns to full resolution and stays there for futileHoldMs
 *                  (2 minutes of play, doubling each time up to 16) rather than blur the picture
 *                  for nothing.
 *
 * None of this has been tuned on a real low-end device. slowMs, blockSlow, downBlocks, upBlocks
 * and the futile* values are the ones to revisit once one is available.
 */
export const SCALER_DEFAULTS = Object.freeze({
  step: 0.85,
  blockFrames: 20,
  blockSlow: 2,
  downBlocks: 3,
  settleFrames: 8,
  warmupMs: 1000,
  slowMs: 21,
  heavyMs: 40,
  calmMs: 19,
  calmSpikes: 1,
  upBlocks: 12,
  maxBackoff: 4,
  probeFrames: 600,
  spikeMs: 100,
  spikeRun: 3,
  futileGain: 0.85,
  futileSpan: 0.8,
  futileHoldMs: 120000,
  futileMaxDoublings: 3,
});

/**
 * Feed it one frame duration per rendered race frame; it returns the pixel-ratio scale to use,
 * between minScale and 1. It keeps a handful of counters and allocates nothing per frame.
 */
export function createResolutionScaler(options = {}) {
  const cfg = { ...SCALER_DEFAULTS, ...options };

  // The block being filled.
  let frames = 0;
  let sum = 0;
  let slow = 0; // frames over slowMs
  let rough = 0; // frames over calmMs
  // Runs of finished blocks.
  let slowBlocks = 0;
  let slowSum = 0;
  let calmBlocks = 0;

  let minScale = 1;
  let maxLevel = 0;
  let level = 0;
  let scale = 1;
  let changes = 0;

  let warm = 0;
  let settle = 0;
  let longRun = 0;
  let probe = 0;
  let failures = 0;
  let holdMs = 0;
  let futileCount = 0;
  let descent = false;
  let descentFrom = 1;
  let descentMean = 0;
  let floorJudged = false;

  function clearEvidence() {
    frames = 0;
    sum = 0;
    slow = 0;
    rough = 0;
    slowBlocks = 0;
    slowSum = 0;
    calmBlocks = 0;
  }

  function scaleAt(lv) {
    return lv >= maxLevel ? minScale : Math.pow(cfg.step, lv);
  }

  function moveTo(next) {
    level = next;
    scale = scaleAt(level);
    changes++;
    settle = cfg.settleFrames;
    clearEvidence();
  }

  function setMinScale(value) {
    const next = value > 0 && value < 1 ? value : 1;
    if (next === minScale) return scale;
    minScale = next;
    // The last level lands exactly on the floor; rounding avoids a final step too small to matter.
    maxLevel = minScale >= 1 ? 0 : Math.max(1, Math.round(Math.log(minScale) / Math.log(cfg.step)));
    const before = scale;
    level = Math.min(level, maxLevel);
    scale = scaleAt(level);
    if (scale !== before) {
      settle = cfg.settleFrames;
      clearEvidence();
    }
    descent = false;
    floorJudged = false;
    return scale;
  }

  /** A race started or the canvas changed size: keep what was learned, ignore the next second. */
  function restart() {
    warm = 0;
    settle = 0;
    longRun = 0;
    probe = 0;
    descent = false;
    clearEvidence();
  }

  /** Forget everything and return to full resolution (the tier changed). */
  function reset() {
    restart();
    level = 0;
    scale = scaleAt(0);
    failures = 0;
    holdMs = 0;
    futileCount = 0;
    floorJudged = false;
  }

  function stepDown(mean) {
    if (level >= maxLevel) {
      // Already at the floor and still slow: decide once whether the descent bought anything.
      if (maxLevel === 0 || floorJudged) return;
      floorJudged = true;
      if (descent && minScale / descentFrom <= cfg.futileSpan && mean > cfg.futileGain * descentMean) {
        holdMs = cfg.futileHoldMs * (1 << Math.min(futileCount, cfg.futileMaxDoublings));
        futileCount++;
        descent = false;
        floorJudged = false;
        moveTo(0);
      }
      return;
    }
    if (holdMs > 0) return;
    if (probe > 0) {
      failures = Math.min(cfg.maxBackoff, failures + 1);
      probe = 0;
    }
    if (!descent) {
      descent = true;
      descentFrom = scale;
      descentMean = mean;
    }
    moveTo(Math.min(maxLevel, level + (mean >= cfg.heavyMs ? 2 : 1)));
  }

  function sample(frameMs) {
    if (!(frameMs > 0)) return scale;
    if (frameMs >= cfg.spikeMs) {
      if (++longRun < cfg.spikeRun) return scale;
    } else longRun = 0;
    if (warm < cfg.warmupMs) {
      warm += frameMs;
      return scale;
    }
    if (holdMs > 0) holdMs -= frameMs;
    if (settle > 0) {
      settle--;
      return scale;
    }
    if (probe > 0 && --probe === 0) failures = 0;

    frames++;
    sum += frameMs;
    if (frameMs > cfg.slowMs) slow++;
    if (frameMs > cfg.calmMs) rough++;
    if (frames < cfg.blockFrames) return scale;

    // A block is complete.
    const blockSum = sum;
    const blockIsSlow = slow >= cfg.blockSlow;
    const blockRough = rough;
    frames = 0;
    sum = 0;
    slow = 0;
    rough = 0;

    if (blockIsSlow) {
      calmBlocks = 0;
      slowSum += blockSum;
      if (++slowBlocks >= cfg.downBlocks) {
        const mean = slowSum / (slowBlocks * cfg.blockFrames);
        slowBlocks = 0;
        slowSum = 0;
        stepDown(mean);
      }
      return scale;
    }

    slowBlocks = 0;
    slowSum = 0;
    descent = false;
    if (blockRough === 0) calmBlocks++;
    else if (blockRough > cfg.calmSpikes) calmBlocks = 0;
    if (level > 0 && calmBlocks >= cfg.upBlocks * (1 << failures)) {
      floorJudged = false;
      moveTo(level - 1);
      probe = cfg.probeFrames;
    }
    return scale;
  }

  setMinScale(options.minScale ?? 1);

  return {
    sample,
    setMinScale,
    restart,
    reset,
    get scale() { return scale; },
    get level() { return level; },
    get levels() { return maxLevel; },
    get minScale() { return minScale; },
    /** How many times the scale has moved since creation. */
    get changes() { return changes; },
    get holding() { return holdMs > 0; },
  };
}
