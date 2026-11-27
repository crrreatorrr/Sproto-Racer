// In-page measurement harness for the dev server. See browser-harness.md.
//
//   const A = (await import('/scripts/bench/browser-harness.js')).default;
//   await A.start('track01'); await A.runRace(); A.summary();
//
// Dev server only: it imports the app's own module instances by URL, so it
// measures the game exactly as it runs and needs no change to the game code.
const A = window.__A = { frames: [], auto: true, q: [], rec: false, programLog: [], goFrame: -1 };
export default A;

const threeUrl = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/deps\/three\.js\?/.test(n));
if (!threeUrl) throw new Error('three.js dev bundle not found: load this from the Vite dev server after the lobby appears');
const THREE = await import(/* @vite-ignore */ new URL(threeUrl).pathname + new URL(threeUrl).search);
const core = await import('/src/sim/gameplay-core.js');
const tc = await import('/src/sim/track-core.js');

// Capture the renderer, the race scene (the one with fog) and its camera.
THREE.Scene.prototype.onBeforeRender = function (r, s, c) { A.r = r; if (s.fog) { A.s = s; A.c = c; } };

// begin() calls state.actors.map(...) when a race starts: capture that array the first time after arm().
const origMap = Array.prototype.map;
A.arm = () => {
  Array.prototype.map = function (fn, t) {
    if (this.length && this[0] && this[0].kart && this[0].boost && 'isPlayer' in this[0]) { A.actors = this; Array.prototype.map = origMap; }
    return origMap.call(this, fn, t);
  };
};
A.setCourse = (id) => {
  const track = tc.createTrackCore(tc.courseById(id));
  A.core = core.createGameplayCore(track); A.len = track.length;
};

// Autopilot: overwrite the player's polled input with the AI's decision.
const origAssign = Object.assign;
Object.assign = function (t, ...src) {
  const out = origAssign.call(Object, t, ...src); const s0 = src[0];
  if (A.auto && A.actors && A.core && s0 && typeof s0 === 'object' && 'pausePressed' in s0 && 'throttle' in s0) {
    const p = A.actors[0];
    if (p && p.isPlayer && !p.kart.fall) {
      const c = A.core.decide(p, p, 1 / 60);
      t.throttle = c.throttle; t.brake = c.brake || 0; t.steer = c.steer || 0; t.pitch = c.pitch || 0;
      t.driftHeld = !!c.driftHeld; t.driftPressed = !!c.driftPressed; t.driftReleased = !!c.driftReleased;
      t.driftBoostPressed = !!c.driftBoostPressed; t.itemPressed = !!c.itemPressed;
    }
  }
  return out;
};

// The Browser pane delivers one animation frame a second, so pump the callbacks by hand.
window.requestAnimationFrame = (cb) => { A.q.push(cb); return 1; };
const ch = new MessageChannel(); let res = null;
ch.port1.onmessage = () => { const r2 = res; res = null; r2 && r2(); };
A.yield = () => new Promise((r2) => { res = r2; ch.port2.postMessage(0); });
A.t = performance.now(); A.renderMs = 0; A.gpuLast = -1; A.gpuNew = false;

A.wrap = () => {
  const r = A.r, gl = r.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); const pending = []; const orig = r.render;
  r.render = function (s, c) {
    const t0 = performance.now(); let q = null;
    if (ext && s.fog && !A.noq && pending.length < 8) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }
    orig.call(this, s, c); if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(q); } A.renderMs += performance.now() - t0;
    while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const qq = pending.shift();
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) { A.gpuLast = gl.getQueryParameter(qq, gl.QUERY_RESULT) / 1e6; A.gpuNew = true; } gl.deleteQuery(qq);
    }
  };
  A.wrapped = true;
};

// Which scene objects use the programs that appeared this frame.
const seenPrograms = new Set();
function path(o) { const names = []; for (let n = o; n && names.length < 4; n = n.parent) names.push(n.name || n.type); return names.reverse().join('/'); }
function noteNewPrograms(frame, js) {
  const fresh = A.r.info.programs.filter((p) => !seenPrograms.has(p.id));
  if (!fresh.length) return;
  for (const p of fresh) seenPrograms.add(p.id);
  const ids = new Set(fresh.map((p) => p.id)); const users = new Map();
  A.s?.traverse((o) => {
    const m = o.material; if (!m || Array.isArray(m)) return;
    const pr = A.r.properties.get(m).currentProgram;
    if (pr && ids.has(pr.id) && !users.has(pr.id)) users.set(pr.id, path(o) + ' [' + m.type + (m.transparent ? ' transparent' : '') + (o.isInstancedMesh ? ' instanced' : '') + ']');
  });
  A.programLog.push({ frame, js: +js.toFixed(1), total: A.r.info.programs.length, added: fresh.map((p) => users.get(p.id) || p.name + ' (not in scene graph)') });
}

A.pump = async (n, budgetMs = 20000) => {
  const start = performance.now(); A.t = Math.max(A.t, performance.now()); let done = 0, first = true;
  for (let i = 0; i < n; i++) {
    if (!A.q.length) { await new Promise((r2) => setTimeout(r2, 1100)); if (!A.q.length) break; }
    const cbs = A.q; A.q = []; A.t += 1000 / 60; A.renderMs = 0; A.gpuNew = false; const t0 = performance.now(); for (const cb of cbs) cb(A.t); const js = performance.now() - t0; done++;
    if (!A.wrapped && A.r) A.wrap();
    if (A.rec && A.r && A.s) noteNewPrograms(A.frames.length, js);
    if (A.rec && A.actors && !first) {
      const p = A.actors[0], inf = A.r.info;
      if (A.goFrame < 0 && (p.kart.speed > 0.01 || document.getElementById('announce')?.textContent === 'GO!')) A.goFrame = A.frames.length;
      A.frames.push([A.t, js, A.renderMs, A.gpuNew ? A.gpuLast : -1, inf.render.calls, inf.render.triangles, inf.memory.geometries, inf.memory.textures, inf.programs.length, p.kart.s, p.kart.flying ? 1 : 0, performance.memory?.usedJSHeapSize ?? 0, p.finish != null ? 1 : 0, p.kart.rescues]);
    }
    first = false; await A.yield(); if (performance.now() - start > budgetMs) break;
  }
  return { done, ms: Math.round(performance.now() - start) };
};

// Quick Race on the given circuit with the default car and driver.
A.start = async (id) => {
  A.setCourse(id); A.actors = null; A.arm(); A.frames = []; A.programLog = []; A.goFrame = -1; A.rec = true;
  await new Promise((r2) => setTimeout(r2, 1200)); // let the pending native frame re-register through the queue
  document.querySelector('[data-track="' + id + '"]').click(); document.querySelector('[data-mode="race"]').click(); document.getElementById('launch').click();
  await A.pump(5); document.getElementById('garage-next').click(); await A.pump(5);
  // The second click runs begin(): circuit build, kart models and the shader warm-up.
  const t0 = performance.now(); document.getElementById('garage-next').click(); A.beginMs = +(performance.now() - t0).toFixed(1);
  await A.pump(3);
};
A.runRace = async (maxFrames = 30000, budget = 24000) => {
  const start = performance.now(); let n = 0;
  while (n < maxFrames && performance.now() - start < budget) { const p = await A.pump(300, budget); n += p.done; if (!A.actors || A.actors[0].finish != null || p.done === 0) break; }
  return { n, frames: A.frames.length, s: A.actors?.[0].kart.s, finished: A.actors?.[0].finish != null };
};

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
A.summary = () => {
  const f = A.frames, go = Math.max(0, A.goFrame), race = f.slice(go);
  const js = race.map((r) => r[1]).sort((a, b) => a - b);
  const gpu = race.map((r) => r[3]).filter((v) => v >= 0).sort((a, b) => a - b);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
  const slow = []; race.forEach((r, i) => { if (r[1] > 50) slow.push({ frame: go + i, seconds: +(i / 60).toFixed(1), ms: +r[1].toFixed(1) }); });
  return {
    frames: f.length, goFrame: go, finished: !!f.at(-1)?.[12], beginMs: A.beginMs,
    countdownFramesMs: A.programLog.filter((e) => e.frame <= go).map((e) => e.js),
    programs: { firstFrame: f[0]?.[8], atGo: f[go]?.[8], end: f.at(-1)?.[8] },
    scriptMs: { mean: +mean(js).toFixed(2), p99: +pct(js, .99).toFixed(2), max: +js.at(-1).toFixed(1) },
    gpuMs: gpu.length ? { mean: +mean(gpu).toFixed(2), p99: +pct(gpu, .99).toFixed(2) } : null,
    framesOver50msAfterGo: slow,
    programsAddedAfterGo: A.programLog.filter((e) => e.frame > go),
  };
};
