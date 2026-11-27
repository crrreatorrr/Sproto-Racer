// Single player: Quick Race, Time Trial and Test Drive.
//
// The race itself runs on `createSimWorld` (src/sim/world.js), the same engine an online
// race runs on, driven through the local race runner (src/race-runner.js). This file adds
// only what belongs to one player on one machine: the Time Trial ghost and stored best,
// the Test Drive item picker and the split text for the HUD. The game loop drives the race
// through `session.runner`, the same RaceRunner interface an online race offers; the
// extras hang on the runner's per-tick hooks, so they run whoever asks for a tick.

import { ITEMS } from './items.js';
import { acceptTrial, noteTrial, pageRecords } from './hub/records.js';
import { mod } from './sim/math.js';
import { createSimWorld, SIM_DT } from './sim/world.js';
import { createLocalRaceRunner } from './race-runner.js';
import { createCuePlayer } from './race-cues.js';

export const DEFAULT_TEST = { sector: 0, speed: 'standstill', rivals: 'solo', item: 0, lap: 1, hazards: true };

export const timeText = (n) => {
  const ms = Math.max(0, Math.floor(n * 1000));
  return (
    String(Math.floor(ms / 60000)).padStart(2, '0') +
    ':' +
    String(Math.floor(ms / 1000) % 60).padStart(2, '0') +
    '.' +
    String(ms % 1000).padStart(3, '0')
  );
};

// Item draws are seeded. A new seed per start keeps single-player races from repeating.
const freshSeed = () => (Math.random() * 0x100000000) >>> 0;

/** The HUD line for a finished sector, from `runner.hud().split`. */
export const splitText = (split) => 'S' + String(split.sector + 1).padStart(2, '0') + '   ' + timeText(split.seconds);
/** How long a split stays on the HUD, in race seconds. */
export const SPLIT_SHOWN = 2.2;

export function createSession(track, play, fx, records = pageRecords, onVisualCue) {
  const world = createSimWorld({ track, play, finishRule: 'primary', deferReset: true });
  const runner = createLocalRaceRunner({ world, onBeforeTick, onAfterTick });
  // The engine's own state object, so the HUD, the camera and tools read the race directly.
  const state = world.state;
  // Sounds and pickup sparkles for what the engine reports each tick.
  const cues = createCuePlayer({ fx, cue: onVisualCue, localSeat: () => runner.localSeat, track: () => track });
  let settings = { ...DEFAULT_TEST };
  let rec = [];
  let best = null;
  let nextSample = 0;
  let ghostCursor = 0;
  let counting = false;

  const readBest = () => acceptTrial(records.get(track.id), track.length);
  function reloadBest() {
    best = readBest();
    ghostCursor = 0;
  }
  reloadBest();

  function start(mode, options = {}) {
    settings = { ...DEFAULT_TEST, ...options };
    runner.restart({ mode, seed: options.seed ?? freshSeed(), settings });
    fx.reset();
    rec = [];
    nextSample = 0;
    ghostCursor = 0;
    // The Sky Lane obstacle course drawn is the player's lap, not the race leader's.
    track.setViewLap?.(state.lap);
    return state;
  }

  function select(index) {
    if (state.mode !== 'test') return;
    const a = runner.localActor;
    index = mod(index, ITEMS.length);
    if (a.held !== index) {
      if (a.held !== null) a.inventoryCharges[a.held] = a.charges;
      a.held = index;
      a.charges = a.inventoryCharges[index];
    }
    settings.item = index;
  }

  function useItem(a, backwards = false) {
    if (a.held == null) return;
    return play.use(a, a.held, state.actors, backwards);
  }

  function recordGhost() {
    const me = runner.localActor;
    if (state.mode !== 'trial' || (state.elapsed < nextSample && me.finish === null)) return;
    const { s, x, y, yaw, rescues, flying } = me.kart;
    const frame = [state.elapsed, s, x, y, yaw, rescues].map((v) => Math.round(v * 1000) / 1000);
    // Local ghost pose only. The cloud leaderboard save still contains no frames.
    rec.push([...frame, flying ? 1 : 0]);
    nextSample = state.elapsed + 0.095;
  }

  function ghost() {
    if (state.mode !== 'trial' || !best?.frames || state.elapsed > best.time) return null;
    const frames = best.frames;
    while (ghostCursor < frames.length - 2 && frames[ghostCursor + 1][0] < state.elapsed) ghostCursor++;
    const a = frames[ghostCursor];
    const b = frames[ghostCursor + 1];
    const f = (a[5] ?? 0) !== (b[5] ?? 0) ? 0 : Math.max(0, Math.min(1, (state.elapsed - a[0]) / (b[0] - a[0] || 1)));
    return {
      s: a[1] + (b[1] - a[1]) * f,
      x: a[2] + (b[2] - a[2]) * f,
      y: a[3] + (b[3] - a[3]) * f,
      yaw: a[4] + (b[4] - a[4]) * f,
      // Old recordings do not distinguish ground ramps from Sky Lanes.
      flying: (state.elapsed >= b[0] ? b[6] : a[6]) === 1,
      speed: 0,
    };
  }

  // The runner calls these around every tick, whether the game loop asked for it
  // (`runner.advance`) or a tool did (`tick` below).
  function onBeforeTick(_world, _tick, input) {
    if (state.mode === 'test' && input) {
      const held = runner.localActor.held;
      if (input.slot !== null && input.slot !== undefined) select(input.slot);
      else if (input.prevPressed) select(held - 1);
      else if (input.nextPressed) select(held + 1);
    }
    counting = state.countdown > 0;
  }

  function onAfterTick() {
    cues.playAll(runner.drainEvents());
    if (counting) return;
    track.setViewLap?.(state.lap);
    recordGhost();
    if (state.done && state.mode === 'trial' && (!best || best.time >= state.elapsed)) {
      const me = runner.localActor;
      best = noteTrial(records, track.id, best, {
        time: state.elapsed,
        length: track.length,
        car: me.car,
        driver: me.driver,
        frames: rec,
      }) ?? best;
    }
  }

  /** One tick now, for tools and tests. The game loop uses `runner.advance`. */
  function tick(input, dt = SIM_DT) {
    if (state.done) return;
    runner.tick(input, dt);
  }

  return {
    state,
    runner,
    start,
    tick,
    select,
    useItem,
    ghost,
    position: () => world.positionOf(runner.localSeat),
    reloadBest,
    get ghostSetup() { return { car: best?.car, driver: best?.driver }; },
    get settings() { return { ...settings }; },
    get best() { return best?.time ?? null; },
  };
}
