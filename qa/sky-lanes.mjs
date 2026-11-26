// Run with node --import ./tests/register-sdk-hook.js qa/sky-lanes.mjs.
// Tuning report for Sky Lanes: per circuit and lane, an all-rival race's time in
// the air, flight speed against ground speed, peak tier, and Cell and clip rates.
import assert from 'node:assert/strict';
import { CIRCUITS } from '../src/sim/track-core.js';
import { createSimWorld } from '../src/sim/world.js';
import { CRUISE_SPEED } from '../src/driving.js';

const dt = 1 / 60;
for (const course of CIRCUITS) {
  const seats = Array.from({ length: 6 }, (_, i) => ({ kind: 'ai', gridIndex: i }));
  const world = createSimWorld({ course, seed: 7, finishRule: 'all_racers', seats });
  const lanes = world.track.sky.lanes.map((lane) => ({
    lane, flights: 0, air: 0, speed: 0, ground: 0, groundTicks: 0, peak: 0, cells: 0, offered: 0, clips: 0,
  }));
  const was = world.state.actors.map(() => ({ flying: false, lane: -1, cells: 0, notice: '' }));
  for (let t = 0; t < 60 * 600 && !world.state.done; t++) {
    world.step({});
    world.state.actors.forEach((a, i) => {
      const k = a.kart;
      const prev = was[i];
      if (k.flying) {
        const row = lanes[k.skyLane];
        if (!prev.flying) {
          row.flights++;
          const lap = Math.min(3, Math.max(1, Math.floor(k.s / world.track.length) + 1));
          row.offered += row.lane.layouts[lap - 1].cells.length;
        }
        row.air += dt;
        row.speed += k.speed * dt;
        row.peak = Math.max(row.peak, a.boost.skyTier);
        if (a.boost.skyCells > prev.cells) row.cells += a.boost.skyCells - prev.cells;
        if (a.noticeTime > 1.25 && a.notice !== prev.notice && (a.notice === 'CRASH' || a.notice === 'CLIPPED')) row.clips++;
      } else if (k.grounded && !k.fall) {
        for (const row of lanes) {
          row.ground += k.speed;
          row.groundTicks++;
        }
      }
      was[i] = { flying: k.flying, lane: k.skyLane, cells: k.flying ? a.boost.skyCells : 0, notice: a.notice };
    });
  }
  assert.ok(world.state.done, `${course.id} race finishes`);
  console.log(`${course.name}: race ${world.state.elapsed.toFixed(1)} s`);
  for (const row of lanes) {
    if (!row.flights) {
      console.log(`  ${row.lane.kind.padEnd(4)} no flights`);
      continue;
    }
    const air = row.speed / Math.max(row.air, 1e-6) / CRUISE_SPEED;
    const ground = row.ground / Math.max(1, row.groundTicks) / CRUISE_SPEED;
    console.log(
      `  ${row.lane.kind.padEnd(4)} ${(row.lane.end - row.lane.start).toFixed(0)} m · ${row.flights} flights · ` +
      `${(row.air / row.flights).toFixed(1)} s each · air ${air.toFixed(2)}x vs ground ${ground.toFixed(2)}x · ` +
      `peak tier ${row.peak} · cells ${(100 * row.cells / Math.max(1, row.offered)).toFixed(0)}% · ` +
      `${(row.clips / row.flights).toFixed(1)} hits per flight`,
    );
    assert.ok(air > ground * 1.3, `${course.id} ${row.lane.kind}: flight is much faster than the ground`);
  }
}
console.log('Sky Lane tuning report passed');
