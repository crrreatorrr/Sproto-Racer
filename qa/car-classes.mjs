// Run with node --import ./tests/register-sdk-hook.js qa/car-classes.mjs.
// Balance report for car classes, from AI-only races in the deterministic sim:
// - same-class packs (six karts of one class) give each class's raw pace per circuit;
// - mixed packs (one kart per class, grid rotated by seed) give wins and mean place.
// Each class races its rival car. Every mixed seed runs all six grid rotations, so every class
// starts from every slot on the same seed and grid luck cancels out.
// Targets: every class's mean finish within 1.5% of the all-class mean, no class wins more
// than 30% of mixed races, every class averages within 0.4 of 3.5th place in mixed races,
// and no class is fastest on every circuit.
import assert from 'node:assert/strict';
import { CIRCUITS } from '../src/sim/track-core.js';
import { createSimWorld } from '../src/sim/world.js';
import { CAR_CLASSES } from '../src/car-classes.js';

const CAR_FOR = { allrounder: 'apex', speedster: 'needle', sprinter: 'pogo', drifter: 'gecko', booster: 'relay', lucky: 'hexshift' };
import { ITEMS } from '../src/items.js';

const CLASSES = Object.keys(CAR_CLASSES);
const SAME_SEEDS = [1, 2, 3, 4];
const MIXED_SEEDS = [11, 12, 13, 14, 15, 16];
const strength = ITEMS.map(({ weights: [first, last] }) => last / Math.max(1e-9, first + last));

const stats = Object.fromEntries(CLASSES.map((c) => [c, {
  time: {}, wins: 0, places: 0, mixed: 0, drifts: 0, perfect: 0, items: 0, itemStrength: 0, minutes: 0,
}]));

function race(course, seed, classes) {
  const seats = classes.map((cls, i) => ({ kind: 'ai', gridIndex: i, car: CAR_FOR[cls] }));
  const world = createSimWorld({ course, seed, finishRule: 'all_racers', seats, finishGraceSeconds: 300 });
  const prev = world.state.actors.map(() => ({ pips: 0, roulette: null }));
  for (let t = 0; t < 60 * 900 && !world.state.done; t++) {
    world.step({});
    world.state.actors.forEach((a, i) => {
      const s = stats[a.kart.tuning.class], p = prev[i];
      if (a.boost.pips > p.pips) {
        s.drifts++;
        if (/^(COMBO ×\d+ · )?PERFECT/.test(a.boost.feedback)) s.perfect++;
      }
      if (a.roulette && !p.roulette) {
        s.items++;
        s.itemStrength += strength[a.roulette.item];
      }
      p.pips = a.boost.pips;
      p.roulette = a.roulette;
    });
  }
  assert.ok(world.state.done, `${course.id} seed ${seed} finishes`);
  return world.state.actors.map((a) => ({ cls: a.kart.tuning.class, finish: a.finish ?? Infinity }));
}

for (const course of CIRCUITS) {
  for (const cls of CLASSES) {
    const times = [];
    for (const seed of SAME_SEEDS) {
      for (const r of race(course, seed, Array(6).fill(cls))) {
        times.push(r.finish);
        stats[cls].minutes += r.finish / 60;
      }
    }
    stats[cls].time[course.id] = times.reduce((a, b) => a + b, 0) / times.length;
  }
  for (const seed of MIXED_SEEDS) {
    for (let shift = 0; shift < CLASSES.length; shift++) {
      const order = CLASSES.map((_, i) => CLASSES[(i + shift) % CLASSES.length]);
      const results = race(course, seed, order).sort((a, b) => a.finish - b.finish);
      results.forEach((r, place) => {
        stats[r.cls].places += place + 1;
        stats[r.cls].mixed++;
      });
      stats[results[0].cls].wins++;
    }
  }
}

const races = CIRCUITS.length * MIXED_SEEDS.length * CLASSES.length;
const mean = (cls) => CIRCUITS.reduce((sum, c) => sum + stats[cls].time[c.id], 0) / CIRCUITS.length;
const overall = CLASSES.reduce((sum, c) => sum + mean(c), 0) / CLASSES.length;
console.log('class        pace vs mean   per circuit (s)                 wins   place  perfect  item str  drifts/min');
for (const cls of CLASSES) {
  const s = stats[cls];
  const delta = 100 * (mean(cls) / overall - 1);
  const per = CIRCUITS.map((c) => s.time[c.id].toFixed(1).padStart(7)).join(' ');
  console.log(
    `${cls.padEnd(12)} ${(delta >= 0 ? '+' : '') + delta.toFixed(2)}%`.padEnd(28) + per +
    `   ${String(s.wins).padStart(2)}/${races}  ${(s.places / s.mixed).toFixed(2)}` +
    `   ${(100 * s.perfect / Math.max(1, s.drifts)).toFixed(0).padStart(3)}%   ${(s.itemStrength / Math.max(1, s.items)).toFixed(3)}` +
    `   ${(s.drifts / Math.max(1e-9, s.minutes)).toFixed(1)}`,
  );
}

const problems = [];
for (const cls of CLASSES) {
  const delta = Math.abs(mean(cls) / overall - 1);
  if (delta > 0.015) problems.push(`${cls} pace is ${(100 * delta).toFixed(2)}% off the mean`);
  if (stats[cls].wins / races > 0.30) problems.push(`${cls} wins ${stats[cls].wins}/${races} mixed races`);
  const place = stats[cls].places / stats[cls].mixed;
  if (Math.abs(place - 3.5) > 0.4) problems.push(`${cls} averages place ${place.toFixed(2)} in mixed races`);
}
const fastest = CIRCUITS.map((c) => CLASSES.reduce((best, cls) => (stats[cls].time[c.id] < stats[best].time[c.id] ? cls : best), CLASSES[0]));
if (new Set(fastest).size === 1) problems.push(`${fastest[0]} is fastest on every circuit`);
console.log(`fastest per circuit: ${CIRCUITS.map((c, i) => `${c.id} ${fastest[i]}`).join(', ')}`);
if (problems.length) {
  for (const p of problems) console.log(`FAIL ${p}`);
  process.exit(1);
}
console.log('Car classes are balanced.');
