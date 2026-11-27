// Single player runs on the same engine as online play: `createSession` is a thin layer
// over `createSimWorld`, so the same seed and inputs give the same race either way.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createSimWorld } from '../src/sim/world.js';
import { stateHash } from '../src/sim/hash.js';
import { controlsToIntentFrame } from '../src/sim/intent.js';
import { CIRCUITS, createTrackCore } from '../src/sim/track-core.js';
import { createGameplayCore } from '../src/sim/gameplay-core.js';
import { createSession } from '../src/session.js';

const tickControls = (tick) => ({
  throttle: 1,
  steer: Math.sin(tick / 47) * 0.35,
  driftPressed: tick % 173 === 0,
  driftBoostPressed: tick % 97 === 0,
  itemPressed: tick % 151 === 0,
  itemSwapPressed: tick % 211 === 0,
});

function makeSession(course, records = { get: () => null, commit: () => null }, cues = []) {
  const track = createTrackCore(course);
  const play = createGameplayCore(track);
  const tones = [];
  const fx = { reset() {}, tone: (name) => tones.push(name) };
  const session = createSession(track, play, fx, records, (cue) => cues.push(cue));
  return { session, track, tones, cues };
}

describe('single-player session on the shared engine', () => {
  it('exposes the engine state itself and starts nothing until asked', () => {
    const { session } = makeSession(CIRCUITS[0]);
    assert.equal(session.state, session.runner.world.state);
    assert.equal(session.state.actors.length, 0);
    assert.equal(session.runner.kind, 'local');
  });

  for (const course of CIRCUITS) {
    it(`a Quick Race on ${course.id} matches a plain createSimWorld run tick for tick`, () => {
      const { session } = makeSession(course);
      session.start('race', { seed: 9 });
      const world = createSimWorld({ courseId: course.id, seed: 9, finishRule: 'primary' });
      assert.equal(session.state.actors.length, 6);
      for (let tick = 0; tick < 1500; tick++) {
        const controls = tickControls(tick);
        session.tick(controls, 1 / 60);
        world.step({ 0: controlsToIntentFrame(tick, controls) });
        if (tick % 250 === 249) assert.equal(stateHash(session.runner.world), stateHash(world), `diverged by tick ${tick}`);
      }
    });
  }

  it('gives each start a new item seed unless one is passed, and repeats exactly when it is', () => {
    const { session } = makeSession(CIRCUITS[0]);
    session.start('race');
    const first = session.state.seed;
    session.start('race');
    assert.notEqual(session.state.seed, first);
    const run = () => {
      session.start('race', { seed: 3 });
      for (let tick = 0; tick < 600; tick++) session.tick(tickControls(tick), 1 / 60);
      return stateHash(session.runner.world);
    };
    assert.equal(run(), run());
  });

  it('plays countdown tones and reports pickups with their place on the road', () => {
    const { session, track, tones, cues } = makeSession(CIRCUITS[0]);
    session.start('race', { seed: 4 });
    for (let tick = 0; tick < 1800; tick++) session.tick({ throttle: 1 }, 1 / 60);
    assert.deepEqual(tones.filter((t) => t === 'count' || t === 'go'), ['count', 'count', 'go']);
    assert.ok(cues.length > 0, 'no pickup was reported in 27 seconds of racing');
    for (const cue of cues) {
      assert.equal(cue.type, 'pickup');
      assert.ok(track.pickups.some((p) => p.s === cue.s && p.x === cue.x));
    }
  });

  it('Test Drive keeps its tools: sector start, item picker, hazards switch', () => {
    const { session, track } = makeSession(CIRCUITS[0]);
    const state = session.start('test', { sector: 3, speed: 'cruise', rivals: 'pack', item: 4, lap: 2, hazards: false });
    assert.equal(state.actors.length, 6);
    assert.equal(state.countdown, 0);
    assert.equal(state.sector, 3);
    assert.equal(state.lap, 2);
    assert.equal(state.player.kart.s, track.sections[3].start + track.length);
    assert.equal(state.player.held, 4);
    assert.equal(state.player.unlimited, true);
    session.tick({ nextPressed: true }, 1 / 60);
    assert.equal(state.player.held, 5);
    session.tick({ slot: 2 }, 1 / 60);
    assert.equal(state.player.held, 2);
    assert.equal(session.settings.item, 2);

    // With hazards off, a hazard placed on the kart is never touched; with them on it is.
    const touched = (hazards) => {
      const s = session.start('test', { sector: 1, hazards });
      const k = s.player.kart;
      track.hazards.push({ s: k.s + 0.5, x: k.x, width: 3, depth: 3, height: 2, type: 'laneDivider' });
      session.tick({}, 1 / 60);
      track.hazards.pop();
      return s.player.touchingMask !== 0;
    };
    assert.equal(touched(false), false);
    assert.equal(touched(true), true);
  });

  it('Test Drive fixtures follow the player, so rivals on another lap cannot shut the lap-3 door', () => {
    const { session, track } = makeSession(CIRCUITS[0]);
    const door = track.hazards.find((h) => h.type === 'loadingDoor');
    assert.ok(door, 'Test Track 01 lost its loading door');
    // Start on lap 3 (door open) with a full pack; drive until a rival has wrapped past the lap.
    const state = session.start('test', { sector: 10, lap: 3, rivals: 'pack', speed: 'cruise', seed: 6 });
    let rivalWrapped = false;
    for (let tick = 0; tick < 2400; tick++) {
      session.tick({ throttle: 1 }, 1 / 60);
      const playerLap = Math.floor(state.player.kart.s / track.length) % 3;
      const ahead = state.actors.some((a) => a !== state.player && Math.floor(a.kart.s / track.length) % 3 !== playerLap);
      rivalWrapped = rivalWrapped || ahead;
      if (playerLap === 2) assert.notEqual(door.active, true, `door shut on the player's lap 3 at tick ${tick}`);
    }
    assert.ok(rivalWrapped, 'no rival ever reached another lap, so the test proved nothing');
  });

  it('Time Trial records a ghost and saves the best time at the finish', () => {
    let saved = null;
    const records = { get: () => null, commit: (_id, value) => (saved = value) };
    const { session, track } = makeSession(CIRCUITS[0], records);
    const state = session.start('trial', {});
    assert.equal(state.actors.length, 1);
    state.countdown = 0;
    for (let i = 0; i < 30; i++) session.tick({ throttle: 1 }, 1 / 60);
    Object.assign(state.player.kart, { s: track.length * 3 - 0.05, x: 0, y: 0, speed: 38, grounded: true, fall: null });
    session.tick({ throttle: 1 }, 1 / 60);
    assert.equal(state.done, true);
    assert.ok(saved?.frames?.length > 2);
    assert.equal(saved.time, state.elapsed);
    session.tick({ throttle: 1 }, 1 / 60);
    assert.equal(saved.time, state.elapsed, 'a finished session kept running');
  });
});

// Rollback exactness: a world restored from a snapshot must continue exactly as the world
// the snapshot was taken from, whenever the snapshot was taken.
describe('snapshot restore is exact', () => {
  it('a snapshot taken during the countdown restores into the same race', async () => {
    const { captureSnapshot, applySnapshot } = await import('../src/sim/snapshot.js');
    for (const takenAt of [1, 90, 179]) {
      const live = createSimWorld({ courseId: 'track01', seed: 21 });
      const restored = createSimWorld({ courseId: 'track01', seed: 21 });
      for (let tick = 0; tick < takenAt; tick++) live.step({ 0: controlsToIntentFrame(tick, tickControls(tick)) });
      applySnapshot(restored, JSON.parse(JSON.stringify(captureSnapshot(live))));
      for (let tick = takenAt; tick < 600; tick++) {
        const frame = controlsToIntentFrame(tick, tickControls(tick));
        live.step({ 0: frame });
        restored.step({ 0: frame });
      }
      assert.equal(stateHash(restored), stateHash(live), `snapshot at tick ${takenAt}`);
      assert.deepEqual(
        restored.state.actors.map((a) => a.kart.x),
        live.state.actors.map((a) => a.kart.x),
        `kart lanes differ after a snapshot at tick ${takenAt}`,
      );
    }
  });

  it('restoring a snapshot clears take-off values left by a mispredicted jump', async () => {
    const { captureSnapshot, applySnapshot } = await import('../src/sim/snapshot.js');
    const world = createSimWorld({ courseId: 'track01', seed: 2 });
    for (let tick = 0; tick < 240; tick++) world.step({});
    const snap = captureSnapshot(world);
    const kart = world.state.actors[0].kart;
    Object.assign(kart, { airFloorY: 3.5, takeoffPitch: 0.4, takeoffRoll: -0.3 });
    applySnapshot(world, snap);
    assert.equal(kart.airFloorY, snap.actors[0].kart.airFloorY);
    assert.equal(kart.takeoffPitch, snap.actors[0].kart.takeoffPitch);
    assert.equal(kart.takeoffRoll, snap.actors[0].kart.takeoffRoll);
    assert.equal(kart.airFloorY, null);
  });
});
