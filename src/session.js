// Single player: Quick Race, Time Trial and Test Drive.
//
// The race itself runs on `createSimWorld` (src/sim/world.js), the same engine an online
// race runs on, driven through the local race runner (src/race-runner.js). This file adds
// only what belongs to one player on one machine: the Time Trial ghost and stored best,
// the Test Drive item picker, split text for the HUD, and sound and visual cues.

import { ITEMS } from './items.js';
import { acceptTrial, noteTrial, pageRecords } from './hub/records.js';
import { trialRecordId } from './hub/config.js';
import { mod } from './sim/math.js';
import { createSimWorld, SIM_DT } from './sim/world.js';
import { createLocalRaceRunner } from './race-runner.js';

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

export function createSession(track, play, fx, records = pageRecords, onVisualCue) {
  const world = createSimWorld({ track, play, finishRule: 'primary', deferReset: true });
  const runner = createLocalRaceRunner({ world, onEvent });
  // The engine's own state object, so the HUD, the camera and tools read the race directly.
  const state = Object.assign(world.state, { split: '', splitUntil: 0 });
  let settings = { ...DEFAULT_TEST };
  let rec = [];
  let best = null;
  let nextSample = 0;
  let ghostCursor = 0;
  let splitStart = 0;

  // Records are kept per layout of a circuit, so times set before a layout change are kept apart.
  const recordId = trialRecordId(track.id);
  const readBest = () => acceptTrial(records.get(recordId), track.length);
  function reloadBest() {
    best = readBest();
    ghostCursor = 0;
  }
  reloadBest();

  // Sounds and pickup sparkles for what the engine reports each tick.
  function onEvent(ev) {
    if (ev.type === 'tone') fx.tone?.(ev.name);
    else if ((ev.type === 'bump' || ev.type === 'boost') && ev.seat === 0) fx.tone?.(ev.type);
    else if (ev.type === 'pickup' && onVisualCue) {
      const p = track.pickups[ev.pickupIndex];
      if (p) onVisualCue({ phase: 'pickup', type: 'pickup', seat: ev.seat, isPlayer: ev.seat === 0, s: p.s, x: p.x, height: 1.05 });
    }
  }

  function start(mode, options = {}) {
    settings = { ...DEFAULT_TEST, ...options };
    runner.restart({ mode, seed: options.seed ?? freshSeed(), settings });
    fx.reset();
    state.split = '';
    state.splitUntil = 0;
    splitStart = 0;
    rec = [];
    nextSample = 0;
    ghostCursor = 0;
    // The Sky Lane obstacle course drawn is the player's lap, not the race leader's.
    track.setViewLap?.(state.lap);
    return state;
  }

  function select(index) {
    if (state.mode !== 'test') return;
    const a = state.player;
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
    if (state.mode !== 'trial' || (state.elapsed < nextSample && state.player.finish === null)) return;
    const { s, x, y, yaw, rescues, flying } = state.player.kart;
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

  function tick(input, dt = SIM_DT) {
    if (state.done) return;
    if (state.mode === 'test') {
      if (input.slot !== null && input.slot !== undefined) select(input.slot);
      else if (input.prevPressed) select(state.player.held - 1);
      else if (input.nextPressed) select(state.player.held + 1);
    }
    const counting = state.countdown > 0;
    const sector = state.sector;
    runner.tick(input, dt);
    runner.drainEvents();
    if (counting) return;
    if (state.sector !== sector) {
      state.split = 'S' + String(sector + 1).padStart(2, '0') + '   ' + timeText(state.elapsed - splitStart);
      splitStart = state.elapsed;
      state.splitUntil = state.elapsed + 2.2;
    }
    track.setViewLap?.(state.lap);
    recordGhost();
    if (state.done && state.mode === 'trial' && (!best || best.time >= state.elapsed)) {
      best = noteTrial(records, recordId, best, {
        time: state.elapsed,
        length: track.length,
        car: state.player.car,
        driver: state.player.driver,
        frames: rec,
      }) ?? best;
    }
  }

  return {
    state,
    runner,
    start,
    tick,
    select,
    useItem,
    ghost,
    position: () => world.positionOf(0),
    reloadBest,
    get ghostSetup() { return { car: best?.car, driver: best?.driver }; },
    get settings() { return { ...settings }; },
    get best() { return best?.time ?? null; },
  };
}
