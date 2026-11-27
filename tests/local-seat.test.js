// The game loop reads the player's lap, sector, place and events from the race runner,
// for whichever seat the player holds. These tests pin that to what single player showed
// when it read seat 0 straight from the simulation, and check a seat other than 0.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CIRCUITS, createTrackCore } from '../src/sim/track-core.js';
import { createGameplayCore } from '../src/sim/gameplay-core.js';
import { createSimWorld } from '../src/sim/world.js';
import { stateHash } from '../src/sim/hash.js';
import { createLocalRaceRunner } from '../src/race-runner.js';
import { createSession, splitText, timeText } from '../src/session.js';
import { cueEvent } from '../src/race-cues.js';
import { createLoopbackMatch, createSimNet } from '../src/net/sim-net.js';
import { createScriptedDriver, tally } from './net-harness.js';

function makeSession(course) {
  const track = createTrackCore(course);
  const play = createGameplayCore(track);
  const session = createSession(track, play, { reset() {}, tone() {} }, { get: () => null, commit: () => null }, () => {});
  return { session, track };
}

// Drives the runner's own kart with the AI's decision code, so it laps the whole circuit.
function selfDriving(runner) {
  const driver = createScriptedDriver({ style: 'stick' });
  const client = { get world() { return runner.world; }, get localSeat() { return runner.localSeat; } };
  return (tick) => driver.controls(tick, client);
}

describe('the runner\'s view of the player matches what the simulation keeps for seat 0', () => {
  for (const course of CIRCUITS) {
    it(`${course.name}: lap, sector, place and splits through a whole race`, () => {
      const { session, track } = makeSession(course);
      const state = session.start('race', { seed: 11 });
      const runner = session.runner;
      const drive = selfDriving(runner);
      // The split text exactly as the session used to build it from the simulation's sector.
      let expectedSplit = '';
      let expectedUntil = 0;
      let splitStart = 0;
      let splits = 0;
      for (let tick = 0; tick < 45000 && !state.done; tick++) {
        const counting = state.countdown > 0;
        const sector = state.sector;
        session.tick(drive(tick), 1 / 60);
        if (!counting && state.sector !== sector) {
          expectedSplit = 'S' + String(sector + 1).padStart(2, '0') + '   ' + timeText(state.elapsed - splitStart);
          splitStart = state.elapsed;
          expectedUntil = state.elapsed + 2.2;
          splits++;
        }
        const hud = runner.hud();
        if (hud.lap !== state.lap || hud.sector !== state.sector) {
          assert.fail(`tick ${tick}: runner says lap ${hud.lap} sector ${hud.sector}, simulation says lap ${state.lap} sector ${state.sector}`);
        }
        assert.equal(hud.position, session.position());
        assert.equal(hud.split ? splitText(hud.split) : '', expectedSplit, `split text at tick ${tick}`);
        if (hud.split) assert.equal(hud.split.at + 2.2, expectedUntil);
      }
      assert.equal(state.done, true, 'the race did not finish');
      assert.ok(splits >= track.sections.length * 3 - 1, `only ${splits} splits in three laps`);
      assert.equal(runner.hud().racers, 6);
    });
  }

  it('Test Drive: every start sector and lap, and the lap counter wrapping round', () => {
    for (const course of CIRCUITS) {
      const { session, track } = makeSession(course);
      const runner = session.runner;
      for (let sector = 0; sector < track.sections.length; sector++) {
        const lap = 1 + (sector % 3);
        const state = session.start('test', { sector, lap, speed: 'cruise', seed: 2 });
        const first = runner.hud();
        assert.equal(first.sector, state.sector, `${course.id} start sector ${sector}`);
        assert.equal(first.lap, state.lap, `${course.id} start lap ${lap}`);
        assert.equal(first.split, null);
      }
      // From the last sector of lap 3, across the line: Test Drive goes back to lap 1.
      const state = session.start('test', { sector: track.sections.length - 1, lap: 3, speed: 'super', seed: 2 });
      const drive = selfDriving(runner);
      let wrapped = false;
      for (let tick = 0; tick < 3000; tick++) {
        session.tick(drive(tick), 1 / 60);
        const hud = runner.hud();
        assert.equal(hud.lap, state.lap, `${course.id} lap at tick ${tick}`);
        assert.equal(hud.sector, state.sector, `${course.id} sector at tick ${tick}`);
        wrapped = wrapped || state.lap === 1;
      }
      assert.ok(wrapped, `${course.id}: never crossed the line, so the wrap was not tested`);
    }
  });
});

describe('a player in a seat other than 0', () => {
  const seats = [0, 1, 2, 3, 4, 5].map((i) => ({ kind: i === 3 ? 'local' : 'ai', gridIndex: i }));

  it('gets its own lap, sector, place and splits, with no split for the run up to the start line', () => {
    const runner = createLocalRaceRunner({ courseId: 'track01', seed: 21, seats, localSeat: 3, finishRule: 'all_racers' });
    const world = runner.world;
    const drive = selfDriving(runner);
    const mine = world.state.actors[3];
    assert.equal(runner.localActor, mine);
    assert.ok(mine.kart.s < 0, 'the grid is expected to sit behind the start line');
    assert.equal(runner.hud().sector, 0, 'on the grid the player is in sector 0, not the lap\'s last stretch');

    let firstSplit = null;
    let differed = false;
    for (let tick = 0; tick < 4000; tick++) {
      runner.tick(drive(tick));
      const hud = runner.hud();
      const section = world.track.sample(mine.kart.fall?.exitS ?? mine.kart.s, mine.kart.x).section;
      if (hud.sector === 0 && section === 0) assert.equal(hud.split, null, `a split was shown before the first sector ended (tick ${tick})`);
      if (hud.split && !firstSplit) firstSplit = { ...hud.split };
      assert.equal(hud.position, world.positionOf(3));
      // Seat 0 is somewhere else on the road: the view must not be reading it.
      if (hud.sector !== world.state.sector || hud.position !== world.positionOf(0)) differed = true;
    }
    assert.ok(firstSplit, 'no split in 66 seconds of racing');
    assert.equal(firstSplit.sector, 0);
    assert.ok(firstSplit.seconds > 1);
    assert.ok(differed, 'seat 3 and seat 0 never differed, so the test proved nothing');
  });

  it('local runner hands back events reported by simulation hooks, stamped with their tick', () => {
    const heard = [];
    const runner = createLocalRaceRunner({ courseId: 'track01', seed: 3, onEvent: (ev) => heard.push(ev) });
    runner.tick({ throttle: 1 });
    runner.tick({ throttle: 1 });
    runner.noteEvent(cueEvent({ phase: 'use', type: 'ball', seat: 0 }));
    const events = runner.drainEvents().filter((ev) => ev.type === 'cue');
    assert.equal(events.length, 1);
    assert.equal(events[0].tick, 1);
    assert.equal(events[0].name, 'use:ball');
    assert.equal(heard.filter((ev) => ev.type === 'cue').length, 1);
    assert.equal(runner.drainEvents().length, 0);
  });
});

// Item effects (a shot fired, a hit, a shield block) come from a hook inside the
// simulation, which fires again every time a tick is replayed. Reported through the
// client's `noteEvent`, each must come out once, and one that a replay no longer
// produces must be cancelled: in the end exactly the effects of the real race remain.
describe('item effects in an online race', () => {
  it('are announced once each; the ones a correction undid are cancelled; restores are flagged as replays', () => {
    const net = createSimNet({ seed: 0xc0e5 });
    const hostInputs = [];
    const match = createLoopbackMatch({
      net,
      host: {
        courseId: 'track02',
        seed: 77,
        laps: 2,
        seatCount: 6,
        startDelayTicks: 90,
        onTick(tick, _events, inputs, mask) {
          const row = {};
          for (let s = 0; s < 6; s++) if (mask & (1 << s)) row[s] = { ...inputs[s] };
          hostInputs[tick] = row;
        },
      },
    });

    const players = [];
    for (let i = 0; i < 3; i++) {
      const record = { announced: [], cancelled: [], spawnsOutsideReplay: 0, staleSpawns: 0, ep: null };
      const driver = createScriptedDriver({ style: i % 2 ? 'keys' : 'stick', itemEvery: 61 });
      record.ep = match.connect('p' + i, { latencyMs: 40 + i * 120, jitterMs: 15 + i * 25 }, {
        hello: { car: 'apex', driver: 'sproto', name: 'P' + i },
        controls: driver.controls,
        frameOffsetMs: 1 + i * 4,
        createWorld(config) {
          const track = createTrackCore(CIRCUITS.find((c) => c.id === config.courseId));
          let play = null;
          play = createGameplayCore(track, {
            onVisualCue: (cue) => record.ep.client.noteEvent(cueEvent(cue)),
            onSpawn(object, elapsed) {
              if (record.ep.client.resimulating) return;
              record.spawnsOutsideReplay++;
              // Outside a replay only brand-new objects appear. One made earlier can only
              // come from putting a saved state back, which must count as a replay.
              if (Math.abs((object.born ?? elapsed) - elapsed) > 1e-9) record.staleSpawns++;
            },
          });
          return createSimWorld({ ...config, track, play });
        },
        onEvent(ev) {
          if (ev.type === 'cue') record.announced.push(ev);
          else if (ev.type === 'cancel' && ev.event.type === 'cue') record.cancelled.push(ev.event);
        },
      });
      players.push(record);
    }
    net.runFor(1500);
    for (const p of players) p.ep.client.setReady(true);
    const end = net.now() + 400000;
    while (match.host.phase !== 'finished' && net.now() < end) net.runFor(500);
    net.runFor(3000);
    assert.equal(match.host.phase, 'finished');

    // The real race, replayed once from the inputs the host used.
    const race = players[0].ep.client.race;
    const track = createTrackCore(CIRCUITS.find((c) => c.id === race.courseId));
    const truth = [];
    const play = createGameplayCore(track, { onVisualCue: (cue) => truth.push(cueEvent(cue)) });
    const world = createSimWorld({
      courseId: race.courseId, seed: race.seed, laps: race.laps, mode: 'race', finishRule: race.finishRule,
      finishGraceSeconds: race.finishGraceSeconds, track, play,
      seats: race.seats.map((s) => ({ kind: s.kind, car: s.car, driver: s.driver, gridIndex: s.gridIndex })),
    });
    for (let tick = 0; tick < hostInputs.length; tick++) world.step(hostInputs[tick]);
    assert.equal(world.state.done, true);
    assert.ok(truth.length > 40, `only ${truth.length} item effects in the race`);
    const expected = tally(truth);

    for (const [index, p] of players.entries()) {
      const stats = p.ep.client.stats;
      assert.equal(stats.hashMismatches, 0);
      assert.ok(stats.rollbacks > 100);
      const undone = new Set(p.cancelled);
      assert.equal(undone.size, p.cancelled.length, 'an effect was cancelled twice');
      for (const ev of undone) assert.ok(p.announced.includes(ev), 'a cancel named an effect that was never announced');
      const left = tally(p.announced.filter((ev) => !undone.has(ev)));
      assert.deepEqual([...left].sort(), [...expected].sort(), `player ${index}: effects left on screen differ from the real race`);
      assert.ok(p.spawnsOutsideReplay > 10);
      assert.equal(p.staleSpawns, 0, 'a saved state was put back without being flagged as a replay');
    }
    // A slow connection predicts further ahead, so it has effects to take back.
    const takenBack = players.reduce((sum, p) => sum + p.cancelled.length, 0);
    assert.ok(takenBack > 0, 'nothing was ever cancelled, so cancelling was not tested');
  });
});

// The game draws a race with its own track object, which wraps the simulation's track and
// passes on only some of its functions. The server uses the bare one. The AI must drive
// the same on both, or an online race drifts as soon as a rival does something the two
// sides decide differently (found with the in-page test race: the AI eased its steering
// on ice and puddles only when the track object lacked `evalFrame`).
describe('AI rivals drive the same on the game\'s track as on the server\'s', () => {
  for (const course of CIRCUITS) {
    it(`${course.name}: same race from the bare track and from one without evalFrame`, () => {
      const worlds = [false, true].map((asInGame) => {
        const core = createTrackCore(course);
        const track = asInGame ? { ...core, evalFrame: undefined } : core;
        const play = createGameplayCore(track);
        return createSimWorld({ course, seed: 31, track, play, seats: Array.from({ length: 6 }, () => ({ kind: 'ai' })), finishRule: 'all_racers' });
      });
      for (let tick = 0; tick < 4800; tick++) {
        for (const world of worlds) world.step({});
        if (tick % 200 === 199 && stateHash(worlds[0]) !== stateHash(worlds[1])) {
          assert.fail(`the two races differ by tick ${tick}`);
        }
      }
    });
  }

  it('is checked on circuits that have ice or wet road', () => {
    // Grip is what the two tracks disagreed about. If no circuit had any, the races above would prove little.
    const lowGrip = CIRCUITS.filter((course) => {
      const core = createTrackCore(course);
      return (core.icePatches?.length ?? 0) + (core.wetPatches?.length ?? 0) > 0;
    });
    assert.ok(lowGrip.length >= 3, `only ${lowGrip.length} circuits have ice or wet road`);
  });
});
