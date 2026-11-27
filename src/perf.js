// Optional frame-time & WebGL draw-call telemetry overlay (?perf=1). It also shows the graphics
// tier and the pixel ratio in use (see quality.js; ?quality=low|medium|high|auto overrides the tier).
// Zero allocations in steady state and zero debug globals exposed in production.

const SAMPLE_WINDOW = 180;

export function isPerfEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  if (!search) return false;
  try {
    return new URLSearchParams(search).get('perf') === '1';
  } catch {
    return false;
  }
}

export function createPerfMonitor(options = {}) {
  const enabled = options.enabled ?? isPerfEnabled();
  if (!enabled) {
    return {
      enabled: false,
      beginSim() {},
      endSim() {},
      recordFrame() {},
      noteQuality() {},
      dispose() {},
    };
  }

  const frameRing = new Float64Array(SAMPLE_WINDOW);
  const simRing = new Float64Array(SAMPLE_WINDOW);
  const sortScratch = new Float64Array(SAMPLE_WINDOW);
  let cursor = 0;
  let count = 0;
  let simStart = 0;
  let simAccumMs = 0;
  let lastPaintAt = 0;
  let qualityTier = '';
  let qualityRatio = 0;
  let qualityScale = 1;

  let panel = null;
  if (typeof document !== 'undefined' && document.body) {
    panel = document.createElement('aside');
    panel.id = 'perf-hud';
    panel.setAttribute('aria-hidden', 'true');
    panel.style.cssText = [
      'position:fixed',
      'left:10px',
      'bottom:10px',
      'z-index:9999',
      'pointer-events:none',
      'padding:6px 9px',
      'border-radius:6px',
      'background:rgba(16,24,28,0.82)',
      'color:#d8f5e5',
      'font:600 11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace',
      'letter-spacing:0.02em',
      'white-space:pre',
    ].join(';');
    document.body.append(panel);
  }

  function beginSim() {
    simStart = performance.now();
  }

  function endSim() {
    simAccumMs += performance.now() - simStart;
  }

  /** The graphics tier, the pixel ratio in use and the scaler's share of it. Call when they change. */
  function noteQuality(tier, pixelRatio, scale = 1) {
    qualityTier = tier;
    qualityRatio = pixelRatio;
    qualityScale = scale;
  }

  function summarize() {
    if (!count) return { fps: 0, avgMs: 0, p95Ms: 0, maxMs: 0, simMs: 0 };
    let sum = 0;
    let maxMs = 0;
    let simSum = 0;
    for (let i = 0; i < count; i++) {
      const f = frameRing[i];
      sum += f;
      simSum += simRing[i];
      if (f > maxMs) maxMs = f;
      sortScratch[i] = f;
    }
    const sub = sortScratch.subarray(0, count);
    sub.sort();
    const p95Idx = Math.min(count - 1, Math.floor(count * 0.95));
    const avgMs = sum / count;
    return {
      fps: avgMs > 0 ? 1000 / avgMs : 0,
      avgMs,
      p95Ms: sub[p95Idx],
      maxMs,
      simMs: simSum / count,
    };
  }

  function recordFrame(frameMs, renderer, now = performance.now()) {
    frameRing[cursor] = frameMs;
    simRing[cursor] = simAccumMs;
    simAccumMs = 0;
    cursor = (cursor + 1) % SAMPLE_WINDOW;
    if (count < SAMPLE_WINDOW) count++;

    if (panel && now - lastPaintAt >= 250) {
      lastPaintAt = now;
      const stats = summarize();
      const renderInfo = renderer?.info?.render;
      const calls = renderInfo?.calls ?? 0;
      const tris = renderInfo?.triangles ?? 0;
      const canvas = renderer?.domElement;
      panel.textContent =
        `FPS ${Math.round(stats.fps)}  ${stats.avgMs.toFixed(1)}ms (p95 ${stats.p95Ms.toFixed(1)} / max ${stats.maxMs.toFixed(1)})\n` +
        `SIM ${stats.simMs.toFixed(2)}ms  DRAW ${calls}  TRI ${(tris / 1000).toFixed(1)}k` +
        (qualityTier
          ? `\nGFX ${qualityTier}  PR ${qualityRatio.toFixed(2)} (x${qualityScale.toFixed(2)})  ${canvas?.width ?? 0}x${canvas?.height ?? 0}`
          : '');
    }
  }

  function dispose() {
    panel?.remove();
    panel = null;
  }

  return {
    enabled: true,
    beginSim,
    endSim,
    recordFrame,
    noteQuality,
    summarize,
    dispose,
  };
}
