// Graphics quality tiers and automatic resolution scaling.
// No DOM and no Three.js in here: storage and the page's query string are passed in,
// and the scaler only ever sees frame durations. That keeps all of it unit-testable.

export const QUALITY_KEY = 'sproto.quality';
export const DEFAULT_TIER = 'auto';
export const TIER_IDS = ['auto', 'high', 'medium', 'low'];

/**
 * maxPixelRatio  the sharpest the tier renders (the screen's own ratio wins when it is lower).
 * pixelBudget    optional cap on the pixels drawn per frame at full resolution, so a large
 *                high-density window is not rendered at its full ratio (never pushes below 1).
 * minPixelRatio  how far the scaler may drop it when frames run slow. Equal to the maximum
 *                means the resolution is fixed.
 * antialias      a WebGL context attribute: it can only be chosen when the renderer is created,
 *                so a change takes effect on the next page load.
 * shadows        whether the circuit's sunlight shadow map is drawn. Also set up once, when the
 *                page loads.
 * maxTextureSize optional longest side for car textures in pixels (src/texture-budget.js).
 *                Applies to textures loaded after the choice is made.
 *
 * Medium's floor is below 1 so that it still differs from High on a screen whose own ratio is 1:
 * there both start at 1, and only Medium may lower it.
 */
export const TIERS = {
  auto: {
    id: 'auto', label: 'Auto', maxPixelRatio: 2.5, pixelBudget: 6_000_000, minPixelRatio: 0.75, antialias: true, shadows: true,
    blurb: 'Sharpest picture your screen allows. Lowers the resolution by itself if the frame rate drops, and raises it again when it recovers.',
  },
  high: {
    id: 'high', label: 'High', maxPixelRatio: 2.5, pixelBudget: 6_000_000, minPixelRatio: 2.5, antialias: true, shadows: true,
    blurb: 'Sharpest picture, never lowered. Choose this if the game already runs smoothly.',
  },
  medium: {
    id: 'medium', label: 'Medium', maxPixelRatio: 1.3, minPixelRatio: 0.85, antialias: true, shadows: true,
    blurb: 'Lower resolution for a steadier frame rate. Drops a little further by itself if frames still run slow.',
  },
  low: {
    id: 'low', label: 'Low', maxPixelRatio: 1, minPixelRatio: 0.75, antialias: false, shadows: false, maxTextureSize: 1024,
    blurb: 'Lowest resolution, no edge smoothing, no cast shadows and smaller car textures. Best for older laptops and phones.',
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

/** A tier by id; anything unknown gives Auto. */
export function tierFor(id) {
  return TIERS[normalizeTier(id) ?? DEFAULT_TIER];
}

/**
 * The pixel ratio a tier renders at before any scaling, on a screen with this devicePixelRatio.
 * `cssPixels` is the canvas area in CSS pixels (width times height); with it, a tier's pixel
 * budget holds the ratio down on a large window.
 */
export function basePixelRatio(tier, devicePixelRatio, cssPixels = 0) {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const budget = tier.pixelBudget > 0 && cssPixels > 0 ? Math.max(1, Math.sqrt(tier.pixelBudget / cssPixels)) : Infinity;
  return Math.min(dpr, tier.maxPixelRatio, budget);
}

/** The lowest scale the scaler may reach for this tier and screen (1 means no room to scale). */
export function minScaleFor(tier, devicePixelRatio, cssPixels = 0) {
  const base = basePixelRatio(tier, devicePixelRatio, cssPixels);
  return Math.min(1, tier.minPixelRatio / base);
}

/*
 * The scaler: how it decides, and why the numbers are what they are.
 *
 * What it can see is only the time between animation frames. A screen shows a frame on one of its
 * refreshes, so on a 60 Hz screen that time is 16.7 ms when the frame was ready and 33.3 ms when it
 * was not, with nothing in between. It can tell "late", never "how much room is left", and it
 * cannot tell why a frame was late. So every change of resolution is treated as an experiment: a
 * lower resolution is kept only while it measurably reduces late frames.
 *
 * 1. What counts as late (the frame budget)
 *    The budget is the screen's own steady frame time, learned from the frames themselves, and
 *    never tighter than 60 fps. A 50 Hz screen (20 ms), a 48 Hz one, or a browser capped at 30 fps
 *    by a battery saver is "on time" at its own pace; a 120 Hz screen is only asked for 60 fps.
 *    The estimate is the lowest frame time that at least a tenth of recent frames reach
 *    (intervalShare), averaged with its neighbours, over a history that halves every
 *    intervalHalfLife (1000) frames. Paddock and pause frames feed it too (observe()). It believes
 *    "faster" within a second or two and "slower" only after a minute or two of nothing faster, so
 *    a slow device does not talk it into a longer budget during the time the scaler needs to act.
 *    slowestMs caps it at 30 fps: anything slower is always late.
 *    A frame is slow above slowRatio (1.26) budgets and calm below calmRatio (1.14) budgets: 21 ms
 *    and 19 ms at 60 fps, the same band scaled for other screens. Frames in between move nothing.
 *    A slow frame's lost time is how far past the budget it ran; "lateness" is lost time as a
 *    share of the budget, averaged over frames. 5% of frames each missing one refresh is 0.05.
 *
 * 2. Mostly late: step down now, judge at the bottom
 *    Frames are grouped in blocks of 20. Three blocks in a row (downBlocks) with at least half
 *    their frames slow (denseShare) step the resolution down at once, two steps if the lateness is
 *    1.4 or more (heavyLate: 40 ms frames at 60 fps). One step may show nothing here, because a
 *    frame that goes from 30 ms to 25 ms still misses the same refresh, so it keeps going while
 *    frames stay mostly late and compares only at the floor: if frame time there is not at least
 *    15% shorter than where the descent began (futileGain 0.85), having removed at least 36% of
 *    the pixels (futileSpan 0.8), resolution is not the cause. It goes back to where it started
 *    and does not descend again for futileHoldMs (2 minutes of play, doubling up to 16). The
 *    starting point is remembered until then, however long the descent took.
 *
 * 3. Sometimes late: one step, then prove it
 *    Scattered late frames are judged over the last ringBlocks (30) blocks at the current
 *    resolution. A step down needs lateness of sparseLate (0.1: a tenth of frames each missing
 *    one refresh) over all 30, or proportionally more over fewer (at least minBlocks, 6), so a bad
 *    stretch is acted on in 2 s and a mild one in 10 s, and 5% of frames dropping at random never
 *    qualifies. The late frames also have to be
 *    spread over at least half of those blocks, so one stall (an effect compiling) is not mistaken
 *    for a slow device. One step is then tried and measured for as long as the evidence took to
 *    gather. Unless lateness fell to gain (0.6) of
 *    what it was, the step is undone and no more are tried for the same doubling hold: late frames
 *    that a quarter fewer pixels does not fix (garbage collection, a busy processor) are not a
 *    reason to blur the picture.
 *
 * 4. Stepping back up
 *    After upBlocks (12) calm blocks, 4 s at 60 fps, it tries one step up. If frames are never
 *    calm it tries anyway after patientBlocks (45), so a lowered resolution always has to keep
 *    proving itself. The step up is kept unless lateness becomes clearly worse (the same 0.6
 *    rule, on sparseLate over 12 blocks or more over fewer) before the 30-block history refills,
 *    or frames turn mostly late. Each failed try
 *    doubles both waits, up to maxBackoff (4) doublings: 4 s to 64 s when calm. A try that lasts
 *    resets them. This is what stops a slow device flickering between two steps.
 *
 * 5. Things it ignores
 *    Frames of spikeMs (100 ms) or more, unless spikeRun (3) arrive in a row: tab switches and
 *    shader compiles (the game loop clamps those to 0.1 s as well). The settleFrames (8) after a
 *    change, while the browser reallocates the canvas. The first warmupMs (1000) after restart().
 *
 * step 0.85 multiplies the pixel ratio per step: about 28% fewer pixels, hard to notice singly.
 *
 * Known limits. A device that never reaches its screen's rate anywhere, not in the paddock, not
 * while paused, looks exactly like a slower screen down to 30 fps, and is left alone; Medium and
 * Low are there for it. And none of this has been tuned on a real low-end device: sparseLate,
 * gain, denseShare, patientBlocks and the hold times are the ones to revisit once one is to hand.
 */
export const SCALER_DEFAULTS = Object.freeze({
  step: 0.85,
  blockFrames: 20,
  settleFrames: 8,
  warmupMs: 1000,
  spikeMs: 100,
  spikeRun: 3,
  // 1. the budget
  fastestMs: 1000 / 60,
  slowestMs: 34.5,
  slowRatio: 1.26,
  calmRatio: 1.14,
  intervalShare: 0.1,
  intervalHalfLife: 1000,
  intervalMinFrames: 30,
  // 2. mostly late
  denseShare: 0.5,
  downBlocks: 3,
  heavyLate: 1.4,
  futileGain: 0.85,
  futileSpan: 0.8,
  futileHoldMs: 120000,
  futileMaxDoublings: 3,
  // 3. sometimes late
  ringBlocks: 30,
  minBlocks: 6,
  sparseLate: 0.1,
  gain: 0.6,
  // 4. stepping up
  calmSpikes: 1,
  upBlocks: 12,
  patientBlocks: 45,
  maxBackoff: 4,
});

const BIN_MS = 0.5;
const BINS = 160; // frame times up to 80 ms; anything longer shares the last bin
const NONE = 0;
const DOWN = 1;
const UP = 2;

/**
 * Feed it one frame duration per rendered race frame; it returns the pixel-ratio scale to use,
 * between minScale and 1. Everything it needs is allocated here, nothing per frame.
 */
export function createResolutionScaler(options = {}) {
  const cfg = { ...SCALER_DEFAULTS, ...options };
  const denseFrames = Math.ceil(cfg.denseShare * cfg.blockFrames);
  const decay = Math.pow(0.5, cfg.blockFrames / cfg.intervalHalfLife);

  // The screen's steady frame time: a decaying histogram of frame times.
  const histCount = new Float32Array(BINS);
  const histMs = new Float32Array(BINS);
  let histTotal = 0;
  let histSince = 0;
  let interval = 0; // 0 until enough frames have been seen
  let budget = cfg.fastestMs;
  let budgetMark = budget;
  let slowMs = budget * cfg.slowRatio;
  let calmMs = budget * cfg.calmRatio;

  // The block being filled.
  let frames = 0;
  let late = 0; // ms past the budget, slow frames only
  let slow = 0;
  let rough = 0; // frames over calmMs
  // Finished blocks at the current level.
  const ring = new Float32Array(cfg.ringBlocks);
  let ringAt = 0;
  let ringCount = 0;
  let stayBlocks = 0;
  let calmBlocks = 0;
  let denseBlocks = 0;
  let denseLate = 0;

  let minScale = 1;
  let maxLevel = 0;
  let level = 0;
  let scale = 1;
  let changes = 0;

  let warm = 0;
  let settle = 0;
  let longRun = 0;
  // A step that is still being judged.
  let pending = NONE;
  let pendingRef = 0;
  let pendingBlocks = 0;
  let failures = 0;
  // Where a mostly-late descent began, and how late frames were there.
  let fromLevel = -1;
  let fromLate = 0;
  let floorJudged = false;
  let denseHold = 0;
  let denseFutile = 0;
  let sparseHold = 0;
  let sparseFutile = 0;

  function clearEvidence() {
    frames = 0;
    late = 0;
    slow = 0;
    rough = 0;
    ringAt = 0;
    ringCount = 0;
    stayBlocks = 0;
    calmBlocks = 0;
    denseBlocks = 0;
    denseLate = 0;
  }

  function scaleAt(lv) {
    return lv >= maxLevel ? minScale : Math.pow(cfg.step, lv);
  }

  function move(next, kind) {
    level = next;
    scale = scaleAt(level);
    changes++;
    settle = cfg.settleFrames;
    pending = kind;
    floorJudged = false;
    clearEvidence();
  }

  function holdFor(count) {
    return cfg.futileHoldMs * (1 << Math.min(count, cfg.futileMaxDoublings));
  }

  function setBudget(next) {
    budget = next;
    slowMs = budget * cfg.slowRatio;
    calmMs = budget * cfg.calmRatio;
    // A different budget makes the banked evidence mean something else: start it again.
    if (Math.abs(budget - budgetMark) > 0.05 * budgetMark) {
      budgetMark = budget;
      pending = NONE;
      clearEvidence();
    }
  }

  function note(frameMs) {
    const bin = frameMs >= BINS * BIN_MS ? BINS - 1 : (frameMs / BIN_MS) | 0;
    histCount[bin]++;
    histMs[bin] += frameMs;
    histTotal++;
    if (++histSince < cfg.blockFrames) return;
    histSince = 0;
    if (histTotal >= cfg.intervalMinFrames) {
      // The lowest frame time a tenth of recent frames reach, then the average of that cluster.
      const want = histTotal * cfg.intervalShare;
      let at = 0;
      let seen = histCount[0];
      while (seen < want && at < BINS - 1) seen += histCount[++at];
      // Within 12% either way: wide enough for timer jitter, too narrow to take in a missed refresh.
      const from = Math.floor(at * 0.88);
      const to = Math.min(BINS - 1, Math.ceil(at * 1.12));
      let count = 0;
      let ms = 0;
      for (let i = from; i <= to; i++) {
        count += histCount[i];
        ms += histMs[i];
      }
      interval = ms / count;
      setBudget(Math.min(cfg.slowestMs, Math.max(cfg.fastestMs, interval)));
    }
    for (let i = 0; i < BINS; i++) {
      histCount[i] *= decay;
      histMs[i] *= decay;
    }
    histTotal *= decay;
  }

  /** A frame that is not part of a race (paddock, pause): it only teaches the screen's pace. */
  function observe(frameMs) {
    if (frameMs > 0 && frameMs < cfg.spikeMs) note(frameMs);
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
    pending = NONE;
    fromLevel = -1;
    floorJudged = false;
    return scale;
  }

  /** A race started or the canvas changed size: keep what was learned, ignore the next second. */
  function restart() {
    warm = 0;
    settle = 0;
    longRun = 0;
    pending = NONE;
    clearEvidence();
  }

  /** Forget everything but the screen's pace and return to full resolution (the tier changed). */
  function reset() {
    restart();
    level = 0;
    scale = scaleAt(0);
    failures = 0;
    fromLevel = -1;
    floorJudged = false;
    denseHold = 0;
    denseFutile = 0;
    sparseHold = 0;
    sparseFutile = 0;
  }

  /** Three mostly-late blocks in a row. Returns true when it moved the level. */
  function mostlyLate(lateness) {
    if (maxLevel === 0) return false;
    if (level >= maxLevel) {
      // At the floor and still mostly late: decide once whether the descent bought anything.
      if (fromLevel < 0 || floorJudged) return false;
      floorJudged = true;
      if (minScale / scaleAt(fromLevel) > cfg.futileSpan) return false;
      if (1 + lateness <= cfg.futileGain * (1 + fromLate)) {
        denseFutile = 0;
        return false;
      }
      denseHold = holdFor(denseFutile++);
      const back = fromLevel;
      fromLevel = -1;
      move(back, NONE);
      return true;
    }
    if (denseHold > 0) return false;
    if (pending === UP) failures = Math.min(cfg.maxBackoff, failures + 1);
    if (fromLevel < 0 || level <= fromLevel) {
      fromLevel = level;
      fromLate = lateness;
    }
    move(Math.min(maxLevel, level + (lateness >= cfg.heavyLate ? 2 : 1)), NONE);
    return true;
  }

  function endBlock() {
    ring[ringAt] = late;
    ringAt = (ringAt + 1) % cfg.ringBlocks;
    if (ringCount < cfg.ringBlocks) ringCount++;
    stayBlocks++;
    const blockLate = late;
    const blockSlow = slow;
    const blockRough = rough;
    frames = 0;
    late = 0;
    slow = 0;
    rough = 0;

    if (blockSlow >= denseFrames) {
      denseLate += blockLate;
      if (++denseBlocks >= cfg.downBlocks) {
        const lateness = denseLate / (denseBlocks * cfg.blockFrames * budget);
        denseBlocks = 0;
        denseLate = 0;
        if (mostlyLate(lateness)) return;
      }
    } else {
      denseBlocks = 0;
      denseLate = 0;
    }

    if (blockRough === 0) calmBlocks++;
    else if (blockRough > cfg.calmSpikes) calmBlocks = 0;

    let total = 0;
    let lateBlocks = 0;
    for (let i = 0; i < ringCount; i++) {
      total += ring[i];
      if (ring[i] > 0) lateBlocks++;
    }
    const lateness = total / (ringCount * cfg.blockFrames * budget);
    // Enough late time to act on: spread across at least half the blocks, and the fewer the
    // blocks, the more of it. `weight` is the bar in units of sparseLate over a full history.
    const spread = ringCount >= cfg.minBlocks && 2 * lateBlocks >= ringCount;
    const weight = lateness * Math.sqrt(ringCount) / cfg.sparseLate;

    if (pending === DOWN) {
      // Did the step down pay for itself?
      if (ringCount < pendingBlocks) return;
      pending = NONE;
      if (lateness > cfg.gain * pendingRef) {
        sparseHold = holdFor(sparseFutile++);
        move(level - 1, NONE);
      } else sparseFutile = 0;
      return;
    }
    if (pending === UP) {
      // Did the step up cost anything?
      if (spread && weight >= Math.sqrt(cfg.upBlocks) && pendingRef <= cfg.gain * lateness) {
        failures = Math.min(cfg.maxBackoff, failures + 1);
        move(level + 1, NONE);
        return;
      }
      if (ringCount >= cfg.ringBlocks) {
        pending = NONE;
        failures = 0;
        // Still late up here, and no later than below: the lower level was not helping.
        if (lateness >= cfg.sparseLate && sparseHold <= 0) sparseHold = holdFor(sparseFutile++);
      }
    } else if (spread && weight >= Math.sqrt(cfg.ringBlocks) && level < maxLevel && denseHold <= 0 && sparseHold <= 0) {
      pendingRef = lateness;
      pendingBlocks = ringCount;
      move(level + 1, DOWN);
      return;
    }
    if (level > 0 && (calmBlocks >= cfg.upBlocks << failures || (pending === NONE && stayBlocks >= cfg.patientBlocks << failures))) {
      pendingRef = lateness;
      move(level - 1, UP);
    }
  }

  function sample(frameMs) {
    if (!(frameMs > 0)) return scale;
    if (frameMs >= cfg.spikeMs) {
      if (++longRun < cfg.spikeRun) return scale;
    } else longRun = 0;
    note(frameMs);
    if (warm < cfg.warmupMs) {
      warm += frameMs;
      return scale;
    }
    if (interval === 0) return scale;
    if (denseHold > 0) denseHold -= frameMs;
    if (sparseHold > 0) sparseHold -= frameMs;
    if (settle > 0) {
      settle--;
      return scale;
    }
    frames++;
    if (frameMs > calmMs) {
      rough++;
      if (frameMs > slowMs) {
        slow++;
        late += frameMs - budget;
      }
    }
    if (frames >= cfg.blockFrames) endBlock();
    return scale;
  }

  setMinScale(options.minScale ?? 1);

  return {
    sample,
    observe,
    setMinScale,
    restart,
    reset,
    get scale() { return scale; },
    get level() { return level; },
    get levels() { return maxLevel; },
    get minScale() { return minScale; },
    /** How many times the scale has moved since creation. */
    get changes() { return changes; },
    /** True while it has given up lowering the resolution for now. */
    get holding() { return denseHold > 0 || sparseHold > 0; },
    /** The frame time it currently treats as on time, in ms. */
    get budget() { return budget; },
  };
}
