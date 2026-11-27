// RaceRunner: the one interface a game loop uses to drive a race, offline or online.
//
// Both kinds of race run on the same engine, `createSimWorld`. The game loop does not
// need to know which kind it has:
//
//   const steps = runner.advance(dtSeconds, sampleControls);
//   draw(runner.world, runner.alpha);
//   for (const ev of runner.drainEvents()) playCue(ev);
//
// The interface (both implementations provide all of it):
//
//   kind                 'local' | 'online'
//   world                the SimWorld to draw, or null before an online race is set up.
//                        Read world.state.actors, world.track and world.play; never write.
//   localSeat            index into world.state.actors of the kart this player drives.
//                        Use it instead of world.state.player (always seat 0, which
//                        online is somebody else for most players).
//   localActor           world.state.actors[localSeat], or null.
//   phase                'waiting' | 'countdown' | 'racing' | 'finished'
//   advance(dt, sample)  call once per rendered frame. `sample(tick)` is called once per
//                        new tick and returns that tick's controls: the object
//                        `input.poll()` produces, with button presses latched since the
//                        last call. Returns how many new ticks were simulated. Offline
//                        this is a fixed 60 Hz accumulator; online the pace follows the
//                        server and `dt` only feeds smoothing.
//   tick(controls)       simulate exactly one tick now (tools and tests). The local
//                        runner also accepts a step size, tick(controls, dt), which
//                        defaults to 1/60 s; online the step is always 1/60 s.
//   alpha                0..1: how far the frame is between the previous tick and the
//                        current one, for interpolation.
//   previousKart(seat)   that seat's kart fields one tick ago (interpolate from here).
//                        A shallow copy: its `fall` object is shared with the live
//                        kart, so read `fall` from the live kart, never from here.
//   correction(seat)     { s, x, y, yaw } to add when drawing that seat, or null. Online
//                        it eases a kart to its corrected place after a rollback;
//                        offline it is always null.
//   resimulating         true while old ticks are being replayed. Visual and audio
//                        hooks fired from inside the simulation must be ignored then.
//   hud()                { lap, laps, sector, position, racers, elapsed, countdown, done,
//                          finish, split: { sector, seconds, at } | null } for the local seat.
//   drainEvents()        events since the last call, each delivered once:
//                        { type: 'tone'|'pickup'|'skyBox'|'bump'|'boost'|'finish', tick, seat, ... }.
//                        Online, an event predicted and then undone by a rollback is
//                        followed by { type: 'cancel', event }, and one that only shows
//                        up after a rollback carries late: true. 'finish' is only ever
//                        delivered once it is final.
//   results()            once phase is 'finished':
//                        { tick, hash, standings: [{ place, seat, car, driver, finishUs,
//                          human, name }] } (see race-results.js); null before that.
//                        Online it is the host's result, so it is null until that arrives.
//   net                  null offline; online { rttMs, leadTicks, predictedTicks, stalled, synced }.
//
// Not part of this interface, because they belong to one player on one machine. Single
// player adds them on top of the local runner in src/session.js:
//   - Time Trial ghosts: recording, the stored best lap, playback, saving records.
//   - Test Drive tools: the item picker, the hazards switch, starting from a chosen sector.
//   - Formatted split text. `hud().split` gives the numbers; `timeText` is in session.js.
//   - Pausing. An online race cannot pause; offline the loop simply stops calling advance.

import { createSimWorld, SIM_DT } from './sim/world.js';
import { controlsToIntentFrame } from './sim/intent.js';
import { createTrackSample } from './sim/track-core.js';
import { buildRaceResults } from './race-results.js';

/**
 * Lap, sector, split and position for one seat. `world.state.lap` and `.sector` follow
 * seat 0 only, so each runner tracks its own seat here, outside the simulation.
 */
export function createSeatView() {
  const scratch = createTrackSample();
  let sector = -1;
  let splitStart = 0;
  let split = null;
  const out = { lap: 1, laps: 3, sector: 0, position: 1, racers: 0, elapsed: 0, countdown: 0, done: false, finish: null, split: null };

  return {
    reset() {
      sector = -1;
      splitStart = 0;
      split = null;
    },
    read(world, seat) {
      const state = world.state;
      const actor = state.actors[seat];
      out.laps = state.laps;
      out.racers = state.actors.length;
      out.elapsed = state.elapsed;
      out.countdown = state.countdown;
      out.done = state.done;
      if (!actor) return out;
      const k = actor.kart;
      const track = world.track;
      const raceS = k.fall?.exitS ?? k.s;
      out.lap = Math.max(1, Math.min(state.laps, Math.floor(raceS / track.length) + 1));
      const section = track.sampleInto ? track.sampleInto(raceS, k.x, scratch).section : track.sample(raceS, k.x).section;
      if (sector < 0) sector = section;
      else if (k.s >= 0 && section !== sector) {
        split = { sector, seconds: state.elapsed - splitStart, at: state.elapsed };
        splitStart = state.elapsed;
        sector = section;
      }
      out.sector = sector;
      out.position = world.positionOf(seat);
      out.finish = actor.finish;
      out.split = split;
      return out;
    },
  };
}

function copyKarts(world, into) {
  const actors = world.state.actors;
  for (let i = 0; i < actors.length; i++) {
    into[i] = Object.assign(into[i] ?? {}, actors[i].kart);
  }
}

/**
 * Offline race: one human seat, AI rivals, no network. A thin shell over `createSimWorld`.
 *
 * Options are passed to `createSimWorld` (courseId, seed, laps, seats, mode, settings,
 * track, play, finishRule). `name` is the player's name in the results. Controls go through the same quantised input frame the
 * online game sends, so an offline lap and an online lap respond identically; pass
 * `quantize: false` to feed raw controls instead.
 */
export function createLocalRaceRunner(options = {}) {
  const localSeat = options.localSeat ?? 0;
  const quantize = options.quantize !== false;
  const playerName = typeof options.name === 'string' && options.name ? options.name : 'Player';
  const world = options.world ?? createSimWorld({ finishRule: 'primary', ...options });
  const view = createSeatView();
  const previous = [];
  const events = [];
  const seatInputs = Object.create(null);
  let accumulator = 0;

  function tick(controls, dt = SIM_DT) {
    copyKarts(world, previous);
    const t = world.state.tick;
    seatInputs[localSeat] = quantize ? controlsToIntentFrame(t, controls || {}) : controls || {};
    const produced = world.step(seatInputs, dt);
    for (let i = 0; i < produced.length; i++) {
      const ev = { ...produced[i], tick: t };
      events.push(ev);
      if (options.onEvent) options.onEvent(ev);
    }
    return produced;
  }

  copyKarts(world, previous);

  return {
    kind: 'local',
    world,
    localSeat,
    get localActor() { return world.state.actors[localSeat] ?? null; },
    get phase() {
      if (world.state.done) return 'finished';
      return world.state.countdown > 0 ? 'countdown' : 'racing';
    },
    get alpha() { return Math.min(1, accumulator / SIM_DT); },
    get resimulating() { return false; },
    net: null,
    tick,
    advance(dtSeconds, sampleControls) {
      // Same pacing as the game loop today: fixed steps, at most 0.1 s of catch-up.
      accumulator += Math.min(0.1, Math.max(0, dtSeconds));
      let steps = 0;
      while (accumulator >= SIM_DT && !world.state.done) {
        tick(sampleControls ? sampleControls(world.state.tick) : null);
        accumulator -= SIM_DT;
        steps++;
      }
      if (world.state.done) accumulator = 0;
      return steps;
    },
    previousKart: (seat) => previous[seat] ?? null,
    correction: () => null,
    hud: () => view.read(world, localSeat),
    drainEvents() {
      return events.splice(0, events.length);
    },
    results: () => (world.state.done
      ? buildRaceResults(world, (seat) => {
        const human = world.state.actors[seat].kind !== 'ai';
        return { human, name: human ? playerName : 'CPU' };
      })
      : null),
    /** Starts the same race again (or another mode/seed through `startOptions`). */
    restart(startOptions) {
      world.reset(startOptions);
      view.reset();
      accumulator = 0;
      events.length = 0;
      copyKarts(world, previous);
    },
  };
}

export { copyKarts as copyKartPoses };
