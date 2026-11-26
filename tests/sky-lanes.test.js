import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CIRCUITS, createTrackCore } from '../src/sim/track-core.js';
import { createSimWorld } from '../src/sim/world.js';
import { captureSnapshot, applySnapshot } from '../src/sim/snapshot.js';
import { stateHash } from '../src/sim/hash.js';
import { controlsToIntentFrame, intentFrameToControls } from '../src/sim/intent.js';
import {
  CRUISE_SPEED, SKY_MAX_SPEED, SKY_TIER_SPEED, createKart, startFlight, stepKart,
} from '../src/driving.js';
import { createBoost, grantCell, stepBoost, stepSkyChain, SKY_TIER_CHAIN } from '../src/boost.js';
import { catapultCrossed, partPose, sweepCells, sweepObstacles } from '../src/sim/sky.js';

const DT = 1 / 60;

function testWorld(course, extra = {}) {
  return createSimWorld({
    course,
    mode: 'test',
    settings: { sector: 1, speed: 'cruise', lap: 1, rivals: extra.rivals ?? 'solo', hazards: false },
    seats: extra.seats ?? [{ kind: 'local' }],
  });
}

function roadFor(track) {
  return { sky: track.sky, length: track.length, heightAt: track.heightAt };
}

const mainLane = (track) => track.sky.lanes.findIndex((lane) => !lane.optional);

// Puts a kart into flight at a lane-local distance, height and lap.
function fly(world, actor, laneIndex, local, x, y, lap = 1, speed = SKY_TIER_SPEED[0] * CRUISE_SPEED) {
  const k = actor.kart;
  k.s = (lap - 1) * world.track.length + local;
  k.x = x;
  k.speed = speed;
  startFlight(k, roadFor(world.track), laneIndex);
  k.skyY = y;
  k.skyVY = 0;
  k.skyLaunch = 0;
  k.skyPrevS = local;
  k.skyPrevX = x;
  k.skyPrevY = y;
  k.y = y;
  return k;
}

function emptyLayouts(track, laneIndex) {
  for (const layout of track.sky.lanes[laneIndex].layouts) {
    layout.cells.length = 0;
    layout.obstacles.length = 0;
  }
}

describe('Sky Lane flight', () => {
  it('a catapult launches the kart into flight at well above ground speed', () => {
    const world = testWorld(CIRCUITS[1]);
    const lane = world.track.sky.lanes[mainLane(world.track)];
    const k = world.state.player.kart;
    Object.assign(k, { s: lane.start - 30, x: 0, speed: 60, grounded: true });
    let launched = -1;
    for (let t = 0; t < 120 && launched < 0; t++) {
      world.step({ 0: { throttle: 1 } });
      if (k.flying) launched = t;
    }
    assert.ok(launched >= 0, 'catapult starts flight');
    assert.equal(k.skyLane, mainLane(world.track));
    for (let t = 0; t < 60; t++) world.step({ 0: {} });
    assert.ok(k.speed > 1.55 * CRUISE_SPEED, `flight reaches air speed, got ${k.speed}`);
    assert.ok(k.speed > 1.4 * CRUISE_SPEED * 1.05, 'flight beats the top ground boost');
  });

  it('flying straight through every lap-1 main lane lands back on the road without a fall', () => {
    for (const course of CIRCUITS) {
      const world = testWorld(course);
      const index = mainLane(world.track);
      const lane = world.track.sky.lanes[index];
      const k = fly(world, world.state.player, index, lane.start + 2, 0, (lane.floor + lane.ceiling) / 2);
      let landed = false;
      for (let t = 0; t < 60 * 40 && !landed; t++) {
        world.step({ 0: {} });
        assert.equal(k.fall, null, `${course.id}: no fall while flying level`);
        landed = !k.flying && k.grounded;
      }
      assert.ok(landed, `${course.id}: the kart touches down after the lane`);
      assert.equal(k.rescues, 0);
    }
  });

  it('a Test Drive sector inside a main lane starts in flight, not on missing road', () => {
    const course = CIRCUITS[0];
    const probe = createTrackCore(course);
    const lane = probe.sky.lanes[mainLane(probe)];
    const sector = probe.sections.findIndex((s) => s.start > lane.start + 30 && s.start < lane.end - 30);
    assert.ok(sector > 0, 'some sector starts inside the lane');
    const world = createSimWorld({ course, mode: 'test', settings: { sector, speed: 'standstill', lap: 1, rivals: 'pack' } });
    for (const a of world.state.actors) assert.ok(a.kart.flying, `#${a.id} starts flying`);
    world.step({ 0: {} });
    assert.ok(world.state.player.kart.speed > 1.5 * CRUISE_SPEED);
  });

  it('rolling back off a landing deck drops out and is rescued onto the deck', () => {
    const world = testWorld(CIRCUITS[1]);
    const lane = world.track.sky.lanes[mainLane(world.track)];
    const k = world.state.player.kart;
    Object.assign(k, { s: lane.end + 6, x: 0, speed: 0, grounded: true });
    let fell = false;
    for (let t = 0; t < 60 * 6; t++) {
      world.step({ 0: { reverse: k.fall ? 0 : 1 } });
      fell ||= !!k.fall;
      if (k.grounded && !k.fall) assert.ok(k.s >= lane.end - 1, 'never drives on the missing road');
    }
    assert.ok(fell);
    assert.equal(k.rescues, 1);
    assert.ok(k.s > lane.end, 'rescued onto the deck');
  });

  it('a Sky Gate launch from the edge of its pad starts inside the corridor', () => {
    const world = testWorld(CIRCUITS[0]);
    const gateIndex = world.track.sky.lanes.findIndex((lane) => lane.optional);
    const gate = world.track.sky.lanes[gateIndex];
    const k = world.state.player.kart;
    k.x = gate.entry[1] - 0.2;
    startFlight(k, roadFor(world.track), gateIndex);
    assert.ok(Math.abs(k.x) <= gate.width / 2);
  });

  it('corridor walls clamp and scrape the kart', () => {
    const world = testWorld(CIRCUITS[0]);
    const index = mainLane(world.track);
    emptyLayouts(world.track, index);
    const lane = world.track.sky.lanes[index];
    const k = fly(world, world.state.player, index, lane.start + 60, 0, 10);
    let scraped = false;
    for (let t = 0; t < 120; t++) {
      world.step({ 0: { steer: 1 } });
      scraped ||= k.skyScraped;
      assert.ok(Math.abs(k.x) <= lane.width / 2, 'kart stays inside the corridor');
    }
    assert.ok(scraped, 'hitting the wall scrapes');
  });
});

describe('Sky Lane speed', () => {
  it('tier speeds run 1.6x to 2.2x ground cruise and never exceed the ceiling', () => {
    assert.deepEqual(SKY_TIER_SPEED, [1.6, 1.8, 2.0, 2.2]);
    const world = testWorld(CIRCUITS[0]);
    const index = mainLane(world.track);
    emptyLayouts(world.track, index);
    const lane = world.track.sky.lanes[index];
    const a = world.state.player;
    const k = fly(world, a, index, lane.start + 30, 0, 12);
    let peak = 0;
    for (let t = 0; t < 240; t++) {
      a.boost.skyTier = 3;
      a.boost.skyChain = 10;
      a.boost.skyTimer = 2.5;
      a.boost.reserve = 2;
      k.towing = 1;
      world.step({ 0: {} });
      peak = Math.max(peak, k.speed);
    }
    // The stock car is an All-rounder, so its ceiling is 2.2x its own Speed stat.
    const tuning = k.tuning.speed;
    assert.ok(peak <= SKY_MAX_SPEED * CRUISE_SPEED * tuning + 1e-9, `capped at 2.2x, got ${peak / CRUISE_SPEED}`);
    assert.ok(peak > 2.15 * CRUISE_SPEED * tuning, 'tier 3 reaches the ceiling');
  });

  it("the ceiling scales with the car's Speed stat", () => {
    const world = testWorld(CIRCUITS[0], { seats: [{ kind: 'local', car: 'manta' }] });
    const index = mainLane(world.track);
    emptyLayouts(world.track, index);
    const lane = world.track.sky.lanes[index];
    const a = world.state.player;
    const tuning = a.kart.tuning.speed;
    assert.ok(tuning > 1.005, 'a Speedster');
    const k = fly(world, a, index, lane.start + 30, 0, 12);
    let peak = 0;
    for (let t = 0; t < 240; t++) {
      Object.assign(a.boost, { skyTier: 3, skyChain: 10, skyTimer: 2.5, reserve: 2 });
      k.towing = 1;
      world.step({ 0: {} });
      peak = Math.max(peak, k.speed);
    }
    assert.ok(peak <= SKY_MAX_SPEED * CRUISE_SPEED * tuning + 1e-9, `capped at 2.2x its speed stat, got ${peak / CRUISE_SPEED}`);
    assert.ok(peak > SKY_MAX_SPEED * CRUISE_SPEED + 0.5, 'a Speedster flies past the stock ceiling');
  });

  it('eases down from flight speed after landing instead of stopping hard', () => {
    const world = testWorld(CIRCUITS[0]);
    const index = mainLane(world.track);
    emptyLayouts(world.track, index);
    const lane = world.track.sky.lanes[index];
    const k = fly(world, world.state.player, index, lane.end - 40, 0, 3, 1, 2 * CRUISE_SPEED);
    let t = 0;
    while (!k.grounded && t++ < 240) world.step({ 0: { throttle: 1, pitch: 0.8 } });
    assert.ok(k.grounded && !k.flying);
    const landing = k.speed;
    for (let i = 0; i < 30; i++) world.step({ 0: { throttle: 1 } });
    assert.ok(k.speed > 0.7 * landing, 'half a second later most of the speed remains');
  });
});

describe('Boost Cells', () => {
  it('swept grabs catch a cell crossed between two ticks', () => {
    const layout = { cells: [{ index: 0, s: 105, x: 0, y: 10, mega: false }], obstacles: [] };
    assert.equal(sweepCells(layout, 0, 100, 0, 10, 110, 0, 10), 1);
    assert.equal(sweepCells(layout, 0, 100, 3.5, 10, 110, 3.5, 10), 0, 'a line 3.5 m away misses');
    assert.equal(sweepCells(layout, 1, 100, 0, 10, 110, 0, 10), 0, 'already collected');
  });

  it('chain thresholds 3, 6 and 10 set tiers 1-3, and a Mega Cell is worth 1.5 s and +2 chain', () => {
    const b = createBoost();
    for (let i = 1; i <= 10; i++) {
      grantCell(b);
      const expected = SKY_TIER_CHAIN.reduce((tier, need, t) => (i >= need ? t : tier), 0);
      assert.equal(b.skyTier, expected, `chain ${i}`);
    }
    const m = createBoost();
    grantCell(m, true);
    assert.equal(m.skyChain, 2);
    assert.ok(Math.abs(m.reserve - 1.5) < 1e-9);
    assert.equal(m.tier, 2);
  });

  it('with no grab for 2.5 s the tier drops one step, never to zero', () => {
    const b = createBoost();
    for (let i = 0; i < 10; i++) grantCell(b);
    const kart = { flying: true, skyScraped: false };
    for (let t = 0; t < Math.ceil(2.5 / DT) + 1; t++) stepSkyChain(b, kart, DT);
    assert.equal(b.skyTier, 2);
    assert.equal(b.skyChain, 6);
  });

  it('cells are collected per kart: two karts can each grab the same cell', () => {
    const world = testWorld(CIRCUITS[1], { rivals: 'alongside', seats: [{ kind: 'local' }, { kind: 'local' }] });
    const index = mainLane(world.track);
    const layout = world.track.sky.lanes[index].layouts[0];
    layout.obstacles.length = 0;
    const cell = layout.cells[3];
    const [a, b] = world.state.actors;
    fly(world, a, index, cell.s - 1, cell.x, cell.y);
    fly(world, b, index, cell.s - 1.5, cell.x, cell.y);
    b.kart.skyY = cell.y + 1.6;
    for (let t = 0; t < 3; t++) world.step({ 0: {}, 1: {} });
    assert.ok(a.boost.skyCells >= 1, 'first kart grabs it');
    assert.ok(b.boost.skyCells >= 1, 'second kart grabs it too');
  });

  it('nothing else in the air gives boost: carve, tow, roll, obstacles and the landing', () => {
    const world = testWorld(CIRCUITS[0], { rivals: 'ahead', seats: [{ kind: 'local' }, { kind: 'local' }] });
    const index = mainLane(world.track);
    emptyLayouts(world.track, index);
    const lane = world.track.sky.lanes[index];
    const [a, b] = world.state.actors;
    fly(world, a, index, lane.start + 40, 0, 10);
    fly(world, b, index, lane.start + 48, 0, 10);
    let t = 0;
    while ((a.kart.flying || !a.kart.grounded) && t++ < 60 * 40) {
      world.step({
        0: { throttle: 1, driftHeld: t % 90 < 40, driftPressed: t % 90 === 0, steer: t % 90 === 0 ? 1 : 0 },
        1: { throttle: 1 },
      });
      assert.equal(a.boost.reserve, 0, `no boost at tick ${t}`);
    }
    assert.ok(a.kart.grounded, 'the run ends on the road');
    for (let i = 0; i < 10; i++) world.step({ 0: { throttle: 1 }, 1: { throttle: 1 } });
    assert.equal(a.boost.reserve, 0, 'the landing gives no air boost');
  });
});

describe('Floating item boxes', () => {
  function boxRun(mode, held) {
    const world = createSimWorld({ course: CIRCUITS[1], mode, settings: { sector: 1, speed: 'cruise', lap: 1, rivals: 'solo' }, seats: [{ kind: 'local' }] });
    const index = mainLane(world.track);
    const layout = world.track.sky.lanes[index].layouts[0];
    layout.obstacles.length = 0;
    const box = layout.boxes[1];
    const a = world.state.player;
    a.held = held;
    a.unlimited = false;
    fly(world, a, index, box.s - 1.2, box.x, box.y);
    world.state.countdown = 0;
    world.step({ 0: {} });
    return { a, k: a.kart };
  }

  it('every lane lap has rows of three boxes in its open stretches', () => {
    const track = createTrackCore(CIRCUITS[0]);
    for (const lane of track.sky.lanes) {
      for (const layout of lane.layouts) {
        assert.ok(layout.boxes.length >= 6 && layout.boxes.length % 3 === 0, `${lane.kind}: ${layout.boxes.length} boxes`);
        for (const b of layout.boxes) {
          assert.equal(sweepObstacles(layout, 0, b.s - 2, b.x, b.y, b.s + 2, b.x, b.y, lane, 1.5), null, 'no obstacle sits on a box');
        }
      }
    }
  });

  it('a flying kart with an empty slot grabs a box and starts the roulette', () => {
    const { a, k } = boxRun('race', null);
    assert.ok(a.roulette, 'roulette started');
    assert.notEqual(k.skyBoxGot, 0);
  });

  it('a full slot or a Time Trial leaves the box alone', () => {
    const full = boxRun('race', 0);
    assert.equal(full.a.roulette, null);
    assert.equal(full.k.skyBoxGot, 0);
    const trial = boxRun('trial', null);
    assert.equal(trial.a.roulette, null);
  });
});

describe('Sky Lane obstacles', () => {
  it('swept collision catches a thin obstacle crossed between two ticks', () => {
    const layout = {
      cells: [],
      obstacles: [{ s: 50, depth: 1, parts: [{ shape: 'box', s: 50, x: 0, y: 10, hs: 0.5, hx: 2, hy: 2, motion: null }] }],
    };
    const lane = { width: 34, floor: 2, ceiling: 26 };
    assert.ok(sweepObstacles(layout, 0, 47, 0, 10, 53, 0, 10, lane), 'a 6 m step through a 1 m slab hits');
    assert.equal(sweepObstacles(layout, 0, 47, 6, 10, 53, 6, 10, lane), null, 'passing beside it misses');
  });

  it('moving obstacles are in the same place for the same race time', () => {
    const track = createTrackCore(CIRCUITS[2]);
    for (const lane of track.sky.lanes) {
      for (const layout of lane.layouts) {
        for (const ob of layout.obstacles) {
          for (const part of ob.parts) {
            if (part.shape === 'blade') continue;
            const a = { ...partPose(part, 12.345) };
            const b = { ...partPose(part, 12.345) };
            assert.deepEqual(a, b);
          }
        }
      }
    }
  });

  it('a head-on hit costs 45% speed, two tiers and a tumble; a clip costs 15% and one tier', () => {
    for (const head of [true, false]) {
      const world = testWorld(CIRCUITS[0]);
      const index = mainLane(world.track);
      const layout = world.track.sky.lanes[index].layouts[0];
      layout.cells.length = 0;
      const pylons = layout.obstacles.find((ob) => ob.type === 'pylons');
      const part = pylons.parts[0];
      layout.obstacles = [{ ...pylons, parts: [part] }];
      const a = world.state.player;
      const x = head ? part.x : part.x + part.hx + 0.7;
      const k = fly(world, a, index, part.s - part.hs - 2.5, x, 12, 1, 90);
      a.boost.skyTier = 3;
      a.boost.skyChain = 10;
      a.boost.skyTimer = 2.5;
      const before = k.speed;
      for (let t = 0; t < 6 && a.boost.skyTier === 3; t++) world.step({ 0: {} });
      if (head) {
        assert.equal(a.boost.skyTier, 1);
        assert.ok(k.tumble > 0, 'tumbles');
        assert.ok(k.speed < before * 0.6);
      } else {
        assert.equal(a.boost.skyTier, 2);
        assert.equal(k.tumble, 0);
        assert.ok(k.speed < before * 0.9 && k.speed > before * 0.75);
      }
      assert.equal(a.boost.reserve, 0, 'obstacles never give boost');
    }
  });
});

describe('Sky Lane combat', () => {
  function duel() {
    const world = testWorld(CIRCUITS[1], { rivals: 'ahead', seats: [{ kind: 'local' }, { kind: 'local' }] });
    world.reset({ mode: 'test', settings: { sector: 1, speed: 'cruise', lap: 1, rivals: 'ahead', item: 5, hazards: false }, seats: [{ kind: 'local' }, { kind: 'local' }] });
    const index = mainLane(world.track);
    emptyLayouts(world.track, index);
    const lane = world.track.sky.lanes[index];
    const [a, b] = world.state.actors;
    fly(world, a, index, lane.start + 40, 0, 12);
    fly(world, b, index, lane.start + 70, 0, 12);
    return { world, a, b };
  }

  it('a homing shot tumbles a flying kart without a respawn, but a barrel roll slips it', () => {
    for (const rolling of [false, true]) {
      const { world, a, b } = duel();
      let tumbled = false;
      for (let t = 0; t < 150; t++) {
        if (rolling) b.kart.rollTime = 0.4;
        world.step({ 0: { itemPressed: t === 0 }, 1: {} });
        tumbled ||= b.kart.tumble > 0;
        assert.equal(b.kart.fall, null, 'no respawn above the corridor floor');
      }
      assert.equal(tumbled, !rolling, rolling ? 'the roll dodges' : 'the shot connects');
    }
  });

  it('a barrel roll into a kart alongside rams it out of a tier', () => {
    const world = testWorld(CIRCUITS[1], { rivals: 'alongside', seats: [{ kind: 'local' }, { kind: 'local' }] });
    const index = mainLane(world.track);
    emptyLayouts(world.track, index);
    const lane = world.track.sky.lanes[index];
    const [a, b] = world.state.actors;
    fly(world, a, index, lane.start + 40, 0, 12);
    fly(world, b, index, lane.start + 40, 2.4, 12);
    b.boost.skyTier = 2;
    b.boost.skyChain = 6;
    b.boost.skyTimer = 2.5;
    let rammed = false;
    for (let t = 0; t < 30 && !rammed; t++) {
      world.step({ 0: { steer: 1, driftPressed: t === 0, driftHeld: t === 0 }, 1: {} });
      rammed = b.kart.wobble > 0;
    }
    assert.ok(rammed, 'the victim wobbles');
    assert.equal(b.boost.skyTier, 1);
  });
});

describe('Sky Lane laps and the Sky Gate', () => {
  it('each lap has its own layout, and cells reset for the next lap', () => {
    const world = testWorld(CIRCUITS[0]);
    const index = mainLane(world.track);
    const lane = world.track.sky.lanes[index];
    const counts = lane.layouts.map((l) => l.obstacles.length);
    assert.equal(lane.layouts.length, 3);
    assert.ok(counts[2] > counts[0], 'the lap-3 storm has more clusters than lap 1');
    const a = world.state.player;
    const cell = lane.layouts[0].cells[2];
    lane.layouts[0].obstacles.length = 0;
    fly(world, a, index, cell.s - 1, cell.x, cell.y, 1);
    world.step({ 0: {} });
    assert.ok(world.play.skyGot(a) !== 0, 'grabbed on lap 1');
    fly(world, a, index, cell.s - 1, 0, 25, 2);
    world.step({ 0: {} });
    assert.equal(world.play.skyGot(a), 0, 'a fresh set on lap 2');
  });

  it('the Sky Gate catapult only fires from lap 2 and only inside its entry', () => {
    const track = createTrackCore(CIRCUITS[0]);
    const gateIndex = track.sky.lanes.findIndex((lane) => lane.optional);
    const gate = track.sky.lanes[gateIndex];
    const x = (gate.entry[0] + gate.entry[1]) / 2;
    const L = track.length;
    assert.equal(catapultCrossed(track.sky, L, gate.start - 2, x, gate.start + 2, x), -1, 'closed on lap 1');
    assert.equal(catapultCrossed(track.sky, L, L + gate.start - 2, x, L + gate.start + 2, x), gateIndex, 'open on lap 2');
    assert.equal(catapultCrossed(track.sky, L, 2 * L + gate.start - 2, -x, 2 * L + gate.start + 2, -x), -1, 'outside the entry');
  });
});

describe('Rivals in Sky Lanes', () => {
  it('an all-rival race finishes three laps with every rival clearing every lane', () => {
    for (const course of CIRCUITS.slice(0, 2)) {
      const seats = Array.from({ length: 6 }, (_, i) => ({ kind: 'ai', gridIndex: i }));
      // A long finish grace: a rival rescued at one of Test Track 01's fixed spots (pre-existing)
      // can trail by more than the usual 25 s, which is not what this test checks.
      const world = createSimWorld({ course, seed: 11, finishRule: 'all_racers', seats, finishGraceSeconds: 120 });
      const flights = world.state.actors.map(() => 0);
      const was = world.state.actors.map(() => false);
      let falls = 0;
      for (let t = 0; t < 60 * 480 && !world.state.done; t++) {
        world.step({});
        world.state.actors.forEach((a, i) => {
          if (a.kart.flying && !was[i]) flights[i]++;
          // Only count falls out of a lane; road drops elsewhere are unchanged.
          if (a.kart.fall && was[i]) falls++;
          was[i] = a.kart.flying;
        });
      }
      assert.ok(world.state.done, `${course.id}: race finishes`);
      for (const a of world.state.actors) assert.notEqual(a.finish, null);
      assert.ok(flights.every((n) => n >= 3), `${course.id}: every rival flew the main lane each lap`);
      assert.equal(falls, 0, `${course.id}: no rival fell out of a lane`);
    }
  });

  it('rivals grab some cells but not all of them', () => {
    const seats = Array.from({ length: 6 }, (_, i) => ({ kind: 'ai', gridIndex: i }));
    const world = createSimWorld({ course: CIRCUITS[1], seed: 5, finishRule: 'all_racers', seats });
    const lane = world.track.sky.lanes[mainLane(world.track)];
    const offered = lane.layouts[0].cells.length;
    const exited = new Set();
    const grabbed = new Map();
    for (let t = 0; t < 60 * 200 && exited.size < 6; t++) {
      world.step({});
      for (const a of world.state.actors) {
        if (a.kart.flying) grabbed.set(a.id, a.boost.skyCells);
        else if (grabbed.has(a.id)) exited.add(a.id);
      }
    }
    assert.equal(exited.size, 6);
    const rates = [...grabbed.values()].map((n) => n / offered);
    const mean = rates.reduce((s, r) => s + r, 0) / rates.length;
    assert.ok(mean > 0.25 && mean < 0.95, `average grab rate ${mean.toFixed(2)}`);
  });
});

describe('Ground ramp tricks', () => {
  const ramp = { s: 10 };
  const road = {
    width: 40, curvature: 0, length: 1e9,
    heightAt: () => 0,
    crossedRamp: (s0, _x0, s1) => (s0 < ramp.s && s1 >= ramp.s ? 10 : 0),
  };

  function jump(extraPressAt = null) {
    const k = createKart();
    const b = createBoost();
    k.speed = 40;
    let landedTick = -1;
    let feedback = '';
    let before = 0;
    for (let t = 0; t < 240 && landedTick < 0; t++) {
      const hop = k.grounded && k.s > ramp.s - 3.5 && k.s < ramp.s - 1 && !k.trickCount && t < 30;
      const press = hop || (extraPressAt !== null && !k.grounded && k.airtime > extraPressAt && k.trickCount === 1 && !k.trickTime);
      before = k.speed;
      stepKart(k, { throttle: 1, driftPressed: press, driftHeld: false }, road, b, DT);
      stepBoost(b, k, {}, DT);
      if (b.feedback) feedback = b.feedback;
      if (k.landed && t > 5) landedTick = t;
    }
    return { k, b, feedback, before };
  }

  it('a hop at the lip starts a trick that pays 0.5 s on a clean landing', () => {
    const { b, feedback } = jump();
    assert.match(feedback, /TRICK/);
    assert.ok(b.reserve >= 0.5 - 1e-9, `boost ${b.reserve}`);
  });

  it('landing mid-trick is sloppy: no trick boost and scrubbed speed', () => {
    let sloppy = null;
    for (const at of [0.5, 0.6, 0.7, 0.8, 0.9]) {
      const run = jump(at);
      if (run.feedback === 'SLOPPY LANDING') { sloppy = run; break; }
    }
    assert.ok(sloppy, 'a late extra trick lands sloppy');
    assert.ok(sloppy.k.speed < sloppy.before * 0.85, 'speed scrubbed to about 80%');
    assert.ok(sloppy.b.reserve < 0.5, 'no trick boost');
  });
});

describe('Sky Lane determinism and wire state', () => {
  it('same seed, same hash, through the first Sky Lane', () => {
    const seats = Array.from({ length: 4 }, (_, i) => ({ kind: 'ai', gridIndex: i }));
    const a = createSimWorld({ course: CIRCUITS[1], seed: 77, seats });
    const b = createSimWorld({ course: CIRCUITS[1], seed: 77, seats });
    for (let t = 0; t < 60 * 50; t++) {
      a.step({});
      b.step({});
    }
    assert.ok(a.state.actors.some((x) => x.kart.flying || x.kart.s > a.track.sky.lanes[0].end));
    assert.equal(stateHash(a), stateHash(b));
  });

  it('a snapshot mid-flight restores flight, chain and collected cells exactly', () => {
    const seats = Array.from({ length: 4 }, (_, i) => ({ kind: 'ai', gridIndex: i }));
    const a = createSimWorld({ course: CIRCUITS[1], seed: 31, seats });
    let t = 0;
    while (!a.state.actors.some((x) => x.kart.flying && x.boost.skyCells > 0) && t++ < 60 * 80) a.step({});
    assert.ok(a.state.actors.some((x) => x.kart.flying), 'someone is flying');
    const snap = captureSnapshot(a);
    const b = createSimWorld({ course: CIRCUITS[1], seed: 1, seats });
    assert.equal(applySnapshot(b, snap), true);
    assert.equal(stateHash(b), stateHash(a));
    for (let i = 0; i < 240; i++) {
      a.step({});
      b.step({});
    }
    assert.equal(stateHash(b), stateHash(a));
  });

  it('the pitch axis survives the intent wire frame, and level pitch adds no bits', () => {
    const frame = controlsToIntentFrame(3, { throttle: 1, pitch: -0.5 });
    assert.ok(Math.abs(intentFrameToControls(frame).pitch + 0.5) < 0.01);
    assert.equal(controlsToIntentFrame(3, { throttle: 1 }).buttons >>> 8, 0);
  });
});
