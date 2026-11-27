#!/usr/bin/env node
// Golden-hash comparison for the deterministic simulation.
//
// Any change that is meant to be "the same results, cheaper" must leave every hash here
// untouched. Capture a baseline on the commit you trust, then check after each edit:
//
//   node --import ./tests/register-sdk-hook.js scripts/bench/sim-hashes.mjs --write /tmp/base.json
//   node --import ./tests/register-sdk-hook.js scripts/bench/sim-hashes.mjs --check /tmp/base.json
//
// The baseline is not committed: an intentional gameplay change is allowed to move it.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const { createSimWorld } = await load('src/sim/world.js');
const { captureSnapshot, applySnapshot } = await load('src/sim/snapshot.js');
const { stateHash } = await load('src/sim/hash.js');
const { CIRCUITS } = await load('src/sim/track-core.js');
const { controlsToIntentFrame } = await load('src/sim/intent.js');
const { ITEMS } = await load('src/items.js');
const { CARS } = await load('src/roster.js');
const simMath = await load('src/sim/math.js');

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const quick = args.includes('--quick');
const TICKS = quick ? 2400 : 9600;
const EVERY = 600;
const SEEDS = [1, 77, 424242];

const ai = (n) => Array.from({ length: n }, () => ({ kind: 'ai' }));
// Every collision-outline family: stock box, each hand-built body, wheeled and hover concepts.
const SHAPED = ['shopping-cart', 'skipper', 'saucer', 'manta', 'crestline', 'geep', 'barrage', 'ironhide',
  'track-formula', 'arctic-skip', 'apex', 'ringrunner'];

/** Scripted "human" controls: steering sweeps, drifts with boost taps, items, swaps, blasters, pitch. */
function human(seat, t) {
  const phase = t + seat * 37;
  const drifting = phase % 240 >= 60 && phase % 240 < 150;
  return {
    throttle: phase % 900 < 840 ? 1 : 0.3,
    brake: phase % 900 >= 870 ? 0.6 : 0,
    reverse: phase % 2700 >= 2640 ? 1 : 0,
    steer: simMath.sin(phase * 0.031 + seat) * 0.8,
    pitch: simMath.sin(phase * 0.017) * 0.7,
    driftHeld: drifting,
    driftPressed: phase % 240 === 60 || phase % 331 === 0,
    driftReleased: phase % 240 === 150,
    driftBoostPressed: phase % 240 === 105 || phase % 240 === 135,
    itemPressed: phase % 97 === 0,
    itemSwapPressed: phase % 413 === 0,
    itemBackward: phase % 194 === 0,
    blasters: phase % 120 < 30,
    blastersPressed: phase % 120 === 0,
  };
}

// stateHash rounds to millimetres. This digest does not: it covers every number, string and flag
// on every kart, boost, actor, item object and per-actor gameplay record at full float precision,
// so a single differing bit anywhere in the simulation state fails the comparison.
function canon(value, depth = 0) {
  if (value === null || value === undefined) return 'n';
  const t = typeof value;
  if (t === 'number') return Object.is(value, -0) ? '-0' : String(value);
  if (t === 'string' || t === 'boolean') return JSON.stringify(value);
  if (t === 'function') return 'f';
  if (depth > 6) return '?';
  if (value instanceof Set) return 'S[' + Array.from(value, (v) => v?.id ?? canon(v, depth + 1)).join(',') + ']';
  if (Array.isArray(value)) return '[' + value.map((v) => canon(v, depth + 1)).join(',') + ']';
  return '{' + Object.keys(value).sort().map((k) => {
    const v = value[k];
    if (k === 'tuning') return 'tuning:' + v?.id;
    if (k === 'owner' || k === 'target') return k + ':' + (v ? v.id : 'n');
    return k + ':' + canon(v, depth + 1);
  }).join(',') + '}';
}
function exactDigest(world) {
  const { state, track, play, rng } = world;
  const h = crypto.createHash('sha256');
  h.update(canon([state.tick, state.elapsed, state.countdown, state.beep, state.lap, state.sector, state.done, state.firstFinishAt]));
  h.update(canon(Array.from(rng.getState())));
  h.update(canon(track.getFixtureState ? track.getFixtureState() : null));
  h.update(canon((track.pickups || []).map((p) => [p.hidden, p.readyAt])));
  for (const a of state.actors) h.update(canon(a));
  h.update(canon(play.objects));
  h.update(canon(play.captureState(state.actors)));
  return h.digest('hex').slice(0, 16);
}
const sample = (world) => stateHash(world) + ':' + exactDigest(world);

function run(name, options, inputsAt = () => ({}), ticks = TICKS, roundTripEvery = 0) {
  const world = createSimWorld({ finishRule: 'all_racers', finishGraceSeconds: 600, ...options });
  const hashes = [];
  for (let t = 0; t < ticks; t++) {
    world.step(inputsAt(t, world));
    if (roundTripEvery && t % roundTripEvery === roundTripEvery - 1) {
      // Rollback path: restore the world's own snapshot, as the predictor does.
      applySnapshot(world, JSON.parse(JSON.stringify(captureSnapshot(world), (k, v) => (v === Infinity ? '__inf' : v)),
        (k, v) => (v === '__inf' ? Infinity : v)));
    }
    if (t % EVERY === EVERY - 1) hashes.push(sample(world));
  }
  hashes.push(sample(world));
  return [name, hashes];
}

const out = [];
for (const course of CIRCUITS) {
  const id = course.id;
  for (const n of [2, 6, 12]) {
    for (const seed of SEEDS) out.push(run(`${id} ai${n} seed${seed}`, { courseId: id, seed, seats: ai(n) }));
  }
  // Every outline family in one pack, so each branch of the footprint code is exercised.
  for (const seed of SEEDS) {
    out.push(run(`${id} shaped12 seed${seed}`, {
      courseId: id, seed, seats: SHAPED.map((car, i) => ({ kind: 'ai', car, gridIndex: (i * 5) % 12 })),
    }));
  }
  // Concept roster sweep: 12 seats drawn across the whole car list.
  out.push(run(`${id} roster12`, {
    courseId: id, seed: 9, seats: Array.from({ length: 12 }, (_, i) => ({ kind: 'ai', car: CARS[(i * 7 + 3) % CARS.length].id })),
  }));
  // Human-style inputs for some seats, as quantised intent frames and as raw control objects.
  for (const seed of SEEDS) {
    out.push(run(`${id} humans4of8 frames seed${seed}`, {
      courseId: id, seed,
      seats: Array.from({ length: 8 }, (_, i) => ({ kind: i < 4 ? 'remote' : 'ai', car: i < 4 ? ['barrage', 'manta', 'skipper', 'geep'][i] : undefined })),
    }, (t) => ({ 0: controlsToIntentFrame(t, human(0, t)), 1: controlsToIntentFrame(t, human(1, t)),
      2: controlsToIntentFrame(t, human(2, t)), 3: controlsToIntentFrame(t, human(3, t)) })));
  }
  out.push(run(`${id} humans12 raw`, { courseId: id, seed: 5, seats: Array.from({ length: 12 }, () => ({ kind: 'remote' })) },
    (t) => { const o = {}; for (let i = 0; i < 12; i++) o[i] = human(i, t); return o; }));
  out.push(run(`${id} humans3of6 raw, snapshot round trip every 45 ticks`, {
    courseId: id, seed: 31, seats: Array.from({ length: 6 }, (_, i) => ({ kind: i < 3 ? 'local' : 'ai', car: ['ironhide', 'crestline', 'saucer', 'shopping-cart', 'barrage', 'manta'][i] })),
  }, (t) => ({ 0: human(0, t), 1: human(1, t), 2: human(2, t) }), TICKS, 45));

  // Test Drive: every item, started from each sector that begins in flight (a main Sky Lane) and from sector 0.
  const probe = createSimWorld({ courseId: id, mode: 'test', settings: { sector: 0 } });
  const sectors = [0];
  for (let s = 1; s < probe.track.sections.length; s++) {
    probe.reset({ mode: 'test', settings: { sector: s, speed: 'cruise' } });
    if (probe.state.player.kart.flying) sectors.push(s);
  }
  for (const sector of sectors) {
    for (let item = 0; item < ITEMS.length; item++) {
      const rivals = ['pack', 'ahead', 'behind', 'alongside'][item % 4];
      const speed = ['cruise', 'turbo', 'super', 'standstill'][item % 4];
      out.push(run(`${id} test sector${sector} item${item} ${rivals} ${speed}`, {
        courseId: id, seed: 3 + item, mode: 'test', finishRule: 'primary',
        settings: { sector, speed, rivals, item, lap: 1 + (item % 3), car: SHAPED[item % SHAPED.length] },
      }, (t) => ({ 0: human(0, t) }), quick ? 900 : 2400));
    }
  }
}

const result = Object.fromEntries(out);
const count = out.reduce((n, [, h]) => n + h.length, 0);
const writeTo = flag('--write');
const checkAgainst = flag('--check');
if (writeTo) {
  fs.writeFileSync(writeTo, JSON.stringify(result, null, 1) + '\n');
  console.log(`wrote ${out.length} runs, ${count} hashes to ${writeTo}`);
} else if (checkAgainst) {
  const base = JSON.parse(fs.readFileSync(checkAgainst, 'utf8'));
  let bad = 0;
  for (const name of new Set([...Object.keys(base), ...Object.keys(result)])) {
    const a = base[name], b = result[name];
    if (!a || !b) { bad++; console.error(`MISSING ${name}`); continue; }
    const at = a.findIndex((h, i) => h !== b[i]);
    if (at >= 0 || a.length !== b.length) { bad++; console.error(`MISMATCH ${name}: first difference at sample ${at} (tick ${(at + 1) * EVERY})`); }
  }
  if (bad) { console.error(`${bad} of ${out.length} runs differ`); process.exit(1); }
  console.log(`all ${out.length} runs match (${count} hashes)`);
} else {
  console.log(JSON.stringify(result, null, 1));
}
