import {conceptCarById} from '../concept-roster.js';
// Pure Three.js-free deterministic 60 Hz race simulation world (1..12 seats).
// Supports local, AI, remote, and replay seats identically in browser, Node, and Nakama Goja.

import { skipperAxles, skipperHalfTrack } from '../skipper-layout.js';
import { cartAxles, cartHalfTrack } from '../shopping-cart-layout.js';
import { mantaAxles, mantaHalfTrack } from '../manta-layout.js';
import { crestlineAxles, crestlineHalfTrack } from '../crestline-layout.js';
import { ironhideAxles, ironhideHalfTrack } from '../ironhide-layout.js';
import { geepAxles, geepScale, geepHalfTrack } from '../geep-layout.js';
import { barrageAxles, barrageHalfTrack } from '../barrage-layout.js';
import { hasShapedBody, kartFootprint, footprintBox, footprintContact } from '../kart-footprint.js';
import { ITEMS, startPickup, settlePickup, hasItemRoom, swapItems } from '../items.js';
import { carById, driverById, racerSetup } from '../roster.js';
import {
  createKart,
  stepKart,
  launchFromRamp,
  CRUISE_SPEED,
  HALF_KART_WIDTH,
  HALF_KART_LENGTH,
  KART_CONTACT_HEIGHT,
  settleInSky,
} from '../driving.js';
import { createBoost, stepBoost, grantBoost, updateRevs, gradeLaunch } from '../boost.js';
import { atan2, mod } from './math.js';
import { createRng } from './rng.js';
import { CIRCUITS, courseById, createTrackCore, createTrackSample, gridSlot } from './track-core.js';
import { grabSkyBox } from './sky.js';
import { createGameplayCore } from './gameplay-core.js';
import { intentFrameToControls } from './intent.js';
import { createRoadIndex, itemsAhead } from './road-index.js';

export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;
export const MAX_SEATS = 12;

function legacyContactMetrics(id) {
  const geep = id === 'geep';
  if (id === 'shopping-cart') return { halfTrack: cartHalfTrack, front: -cartAxles[0][0], rear: cartAxles[1][0] };
  if (id === 'skipper') return { halfTrack: skipperHalfTrack, front: -skipperAxles[0][0], rear: skipperAxles[1][0] };
  if (id === 'manta') return { halfTrack: mantaHalfTrack, front: -mantaAxles[0][0], rear: mantaAxles[1][0] };
  if (id === 'crestline') return { halfTrack: crestlineHalfTrack, front: -crestlineAxles[0][0], rear: crestlineAxles[1][0] };
  if (id === 'ironhide') return { halfTrack: ironhideHalfTrack, front: -ironhideAxles[0][0], rear: ironhideAxles[1][0] };
  if (geep) return { halfTrack: geepHalfTrack * geepScale, front: -geepAxles[0][0] * geepScale, rear: geepAxles[1][0] * geepScale };
  if (id === 'barrage') return { halfTrack: barrageHalfTrack, front: -barrageAxles[0][0], rear: barrageAxles[1][0] };
  return { halfTrack: 0.8, front: 1.1, rear: 1.1 };
}

// One record per car, built on first use (after Nakama's post-init freeze) and then shared:
// this is read for every grounded kart on every tick. Callers must not change what it returns.
let contactMetrics = null;

export function chassisContactMetrics(kart) {
  const id = kart.tuning?.id;
  const concept = conceptCarById(id);
  if (concept) return concept.contact;
  if (!contactMetrics) contactMetrics = Object.create(null);
  return contactMetrics[id] || (contactMetrics[id] = legacyContactMetrics(id));
}

export function overlapsTrackHazard(track, sampleScratch, heightAt, k, h) {
  const ds = mod(k.s - h.s + track.length / 2, track.length) - track.length / 2;
  if (hasShapedBody(k)) {
    if (Math.abs(ds) > (h.depth / 2 + 2.7) / 0.55 || Math.abs(k.x - h.x) > h.width / 2 + 2.7) return false;
    const road = track.sampleInto ? track.sampleInto(k.s, k.x, sampleScratch) : track.sample(k.s, k.x);
    const bottom = k.y + road.position.y - heightAt(h.s, h.x);
    if (bottom >= h.height) return false;
    const shape = kartFootprint(k);
    const along = ds * Math.max(0.55, Math.min(1.65, 1 - (k.x + h.x) * 0.5 * road.curvature));
    for (let i = 0; i < shape.bands.length; i++) {
      // Height first: a band's outline is only turned to the kart's heading when it is read.
      const band = shape.bands[i];
      const low = bottom + band.low;
      const high = bottom + band.high;
      if (low >= h.height || high <= 0) continue;
      let width = h.width / 2;
      if (h.type === 'rollingDrum') {
        const r = h.height / 2;
        const dy = Math.max(0, low - r, r - high);
        width = Math.sqrt(Math.max(0, r * r - dy * dy));
      }
      if (footprintContact(band.hull, footprintBox(h.depth / 2, width), -along, h.x - k.x)) return true;
    }
    return false;
  }
  if (Math.abs(ds) > HALF_KART_LENGTH + h.depth / 2) return false;
  const dx = Math.max(0, Math.abs(k.x - h.x) - HALF_KART_WIDTH);
  if (dx > h.width / 2) return false;
  const bottom = k.y + heightAt(k.s, k.x) - heightAt(h.s, h.x);
  if (h.type === 'rollingDrum') {
    const radius = h.height / 2;
    const dy = Math.max(0, bottom - radius, radius - (bottom + KART_CONTACT_HEIGHT));
    return dx * dx + dy * dy <= radius * radius;
  }
  return bottom < h.height && bottom + KART_CONTACT_HEIGHT > 0;
}

export function crossedTrackRamp(track, startS, startX, endS, endX) {
  const distance = endS - startS;
  if (distance <= 0) return 0;
  const ramps = track.ramps || [];
  for (let i = 0; i < ramps.length; i++) {
    const ramp = ramps[i];
    const offset = mod(ramp.s - startS, track.length);
    if (offset <= 0 || offset > distance) continue;
    const x = startX + ((endX - startX) * offset) / distance;
    if (Math.abs(x - ramp.x) < ramp.width / 2) return ramp.power;
  }
  return 0;
}

function normalizeSeats(seats, settings = {}, mode = 'race') {
  if (Array.isArray(seats) && seats.length > 0) {
    return seats.slice(0, MAX_SEATS).map((s, idx) => {
      const fallback = racerSetup(idx, settings);
      const car = s.car ? carById(s.car) : fallback.car;
      const driver = s.driver ? driverById(s.driver) : fallback.driver;
      return {
        id: idx,
        kind: s.kind || (idx === 0 ? 'local' : 'ai'),
        car: car.id,
        driver: driver.id,
        gridIndex: Number.isInteger(s.gridIndex) ? s.gridIndex : undefined,
      };
    });
  }
  if (mode === 'trial') {
    const { car, driver } = racerSetup(0, settings);
    return [{ id: 0, kind: 'local', car: car.id, driver: driver.id, gridIndex: 0 }];
  }
  if (mode === 'test') {
    const offsets = {
      pack: 5,
      ahead: 1,
      behind: 1,
      alongside: 1,
      solo: 0,
    };
    const count = 1 + (offsets[settings.rivals] ?? 0);
    return Array.from({ length: count }, (_, i) => {
      const { car, driver } = racerSetup(i, settings);
      return { id: i, kind: i === 0 ? 'local' : 'ai', car: car.id, driver: driver.id };
    });
  }
  // Default 6-kart Quick Race: seat 0 starts at grid[5] (back of pack) and AI karts 1..5 at grid[0..4].
  return Array.from({ length: 6 }, (_, i) => {
    const { car, driver } = racerSetup(i, settings);
    return {
      id: i,
      kind: i === 0 ? 'local' : 'ai',
      car: car.id,
      driver: driver.id,
      gridIndex: i === 0 ? 5 : i - 1,
    };
  });
}

export function createSimWorld(options = {}) {
  const course = options.course ?? courseById(options.courseId ?? CIRCUITS[0].id);
  const track = options.track ?? createTrackCore(course);
  const play = options.play ?? createGameplayCore(track);
  const rng = createRng(options.seed ?? 1);
  const laps = options.laps ?? 3;
  const finishRule = options.finishRule ?? 'primary'; // 'primary' | 'all_humans' | 'all_racers'
  const finishGraceSeconds = options.finishGraceSeconds ?? 25;

  const state = {
    seed: (options.seed ?? 1) >>> 0,
    tick: 0,
    mode: options.mode || 'race',
    laps,
    actors: [],
    seats: [],
    player: null,
    elapsed: 0,
    countdown: 0,
    beep: 3,
    lap: 1,
    sector: 0,
    done: false,
    firstFinishAt: null,
    events: [],
  };

  const sampleScratch = createTrackSample();
  const roadScratch = createTrackSample();
  // Reused every tick, so a step allocates nothing for bookkeeping: decoded controls per seat,
  // one move record per kart, and each kart's boost pips before the step.
  const controlScratch = [];
  const moves = [];
  const oldPips = [];
  let stepDt = SIM_DT;
  const pickupIndex = createRoadIndex(track.pickups, track.length);
  const heightAt = (s, x) => (track.heightAt ? track.heightAt(s, x) : track.sampleInto(s, x, sampleScratch).position.y);
  const crossedRamp = (s0, x0, s1, x1) => crossedTrackRamp(track, s0, x0, s1, x1);

  function makeActor(seatDef, s, x, entrySpeed) {
    const car = carById(seatDef.car);
    const driver = driverById(seatDef.driver);
    const isHuman = seatDef.kind !== 'ai';
    return {
      id: seatDef.id,
      kind: seatDef.kind,
      car: car.id,
      driver: driver.id,
      isPlayer: seatDef.id === 0,
      isHuman,
      kart: { ...createKart(car), s, x, speed: entrySpeed * car.speed },
      boost: createBoost(car.boostGain),
      held: null,
      roulette: null,
      charges: 0,
      reserve: null,
      reserveCharges: 0,
      unlimited: seatDef.id === 0 && state.mode === 'test',
      finish: null,
      finishUs: null,
      hazardCooldown: 0,
      touchingMask: 0,
      shield: 0,
      draft: 0,
      incoming: '',
      notice: '',
      noticeTime: 0,
      splitStart: 0,
      pickupDistance: -Infinity,
    };
  }

  function reset(startOpts = {}) {
    const mode = startOpts.mode ?? state.mode;
    const seed = (startOpts.seed ?? state.seed) >>> 0;
    const settings = {
      sector: 0,
      speed: 'standstill',
      rivals: 'solo',
      item: 0,
      lap: 1,
      hazards: true,
      ...options.settings,
      ...startOpts.settings,
    };
    rng.setState(createRng(seed).getState());
    state.seed = seed;
    state.tick = 0;
    state.mode = mode;
    state.elapsed = 0;
    state.done = false;
    state.firstFinishAt = null;
    state.events.length = 0;

    const test = mode === 'test';
    const base = test ? track.sections[settings.sector].start + (settings.lap - 1) * track.length : 0;
    const speed = test ? CRUISE_SPEED * ({ standstill: 0, cruise: 1, turbo: 1.2, super: 1.4 }[settings.speed] ?? 0) : 0;
    const seatDefs = normalizeSeats(startOpts.seats ?? options.seats, settings, mode);
    state.seats = seatDefs;
    state.actors = [];

    if (mode === 'race') {
      for (let i = 0; i < seatDefs.length; i++) {
        const seat = seatDefs[i];
        const gIdx = seat.gridIndex ?? i;
        const slot = gIdx < track.grid.length ? track.grid[gIdx] : gridSlot(gIdx);
        state.actors.push(makeActor(seat, slot.s, slot.x, speed));
      }
    } else if (test) {
      state.actors.push(makeActor(seatDefs[0], base, 0, speed));
      const offsets = {
        pack: [[0, 3], [8, -2.6], [8, 3], [14, -2.6], [14, 3]],
        ahead: [[12, 0]],
        behind: [[-12, 0]],
        alongside: [[0, 3.25]],
      }[settings.rivals] ?? [];
      for (let i = 0; i < offsets.length && i + 1 < seatDefs.length; i++) {
        const [d, x] = offsets[i];
        state.actors.push(makeActor(seatDefs[i + 1], base + d, x, speed));
      }
    } else {
      state.actors.push(makeActor(seatDefs[0], 0, 0, 0));
    }

    state.player = state.actors[0] || null;
    // Build each car's collision outline now. The shape tables are made on first use, which
    // takes tens of milliseconds on the server and would otherwise land on the first race tick.
    for (let i = 0; i < state.actors.length; i++) kartFootprint(state.actors[i].kart);
    // A Test Drive sector inside a main Sky Lane starts in flight: its road is gone.
    if (test) {
      const road = { sky: track.sky, length: track.length, heightAt };
      for (let i = 0; i < state.actors.length; i++) settleInSky(state.actors[i].kart, road);
    }
    if (test && state.player) {
      state.player.inventoryCharges = ITEMS.map((it) => it.charges ?? 1);
      state.player.held = mod(settings.item, ITEMS.length);
      state.player.charges = state.player.inventoryCharges[state.player.held];
      if (['turbo', 'super'].includes(settings.speed)) {
        for (let i = 0; i < state.actors.length; i++) {
          grantBoost(state.actors[i].boost, 5, settings.speed === 'super' ? 2 : 1, false);
        }
      }
    }

    play.reset();
    track.reset();
    for (let i = 0; i < track.pickups.length; i++) {
      track.pickups[i].hidden = mode === 'trial';
      track.pickups[i].readyAt = Infinity;
    }
    state.countdown = test && !(settings.sector === 0 && speed === 0) ? 0 : 3;
    state.beep = 3;
    state.sector = test ? settings.sector : 0;
    state.lap = test ? settings.lap : 1;
    track.update(0, 0, base, state.lap);
    return state;
  }

  // Did a kart that moved `dist` metres forward from `oldS` pass over `o`, in its lane?
  function crossed(o, oldS, dist, x) {
    const length = track.length;
    const offset = (((o.s - oldS) % length) + length) % length;
    return offset > 0 && offset <= dist && Math.abs(x - o.x) < (o.width ?? 3.2) / 2 + 0.45;
  }

  function features(a, oldS, dt, checkHazards = true) {
    const k = a.kart;
    const dist = k.s - oldS;
    a.hazardCooldown = Math.max(0, a.hazardCooldown - dt);
    if (checkHazards) {
      const hazards = track.hazards || [];
      for (let i = 0; i < hazards.length; i++) {
        const h = hazards[i];
        const bit = 1 << i;
        if (h.active === false || !overlapsTrackHazard(track, sampleScratch, heightAt, k, h)) {
          a.touchingMask &= ~bit;
        } else if (!(a.touchingMask & bit)) {
          a.touchingMask |= bit;
          if (!a.hazardCooldown) {
            play.hitHazard(a, h.type);
            a.hazardCooldown = 1.2;
          }
        }
      }
    }
    if (dist <= 0) return;
    if (!k.stunRemaining && k.y < 1.4) {
      const pads = track.pads || [];
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        if (crossed(p, oldS, dist, k.x)) grantBoost(a.boost, p.tier === 2 ? 2.2 : 1.35, p.tier);
      }
    }
    // Floating item boxes in a Sky Lane draw from the same seeded roulette.
    if (k.flying && state.mode !== 'trial' && a.finish == null && !a.roulette && (hasItemRoom(a) || a.unlimited)) {
      if (grabSkyBox(track.sky, track.length, k)) {
        if (!a.unlimited) startPickup(a, state.actors, state.elapsed, rng.nextFloat);
        state.events.push({ type: 'skyBox', seat: a.id });
      }
    }
    if (k.y < 2.5 && state.mode !== 'trial' && a.finish == null && !a.roulette && (hasItemRoom(a) || a.unlimited)) {
      // Only the pickups on the stretch of road covered this tick, lowest array position first,
      // each put through the same exact test a full scan would use.
      const pickups = track.pickups || [];
      const near = itemsAhead(pickupIndex, oldS, dist);
      const found = pickupIndex.found;
      for (let j = 0; j < near; j++) {
        const i = found[j];
        const p = pickups[i];
        if (!p.hidden && crossed(p, oldS, dist, k.x)) {
          if (!a.unlimited) startPickup(a, state.actors, state.elapsed, rng.nextFloat);
          p.hidden = true;
          p.readyAt = state.elapsed + 1.8;
          state.events.push({ type: 'pickup', seat: a.id, pickupIndex: i });
          break;
        }
      }
    }
    if (track.switchTrigger && crossed(track.switchTrigger, oldS, dist, k.x)) track.triggerSwitch();
  }

  function driveActor(a, controls, dt, move) {
    const k = a.kart;
    const old = k.s;
    const road = track.sampleInto ? track.sampleInto(old, k.x, roadScratch) : Object.assign(roadScratch, track.sample(old, k.x));
    road.heightAt = heightAt;
    road.widthAt = track.widthAt;
    road.edgeAt = track.edgeAt;
    road.edgesAt = track.edgesAt;
    road.dropAt = track.dropAt;
    road.length = track.length;
    const wasFalling = !!k.fall;
    if (k.grounded) {
      const { halfTrack, front, rear } = chassisContactMetrics(k);
      road.bank = atan2(heightAt(old, k.x + halfTrack) - heightAt(old, k.x - halfTrack), 2 * halfTrack);
      const rise = heightAt(old + front, k.x) - heightAt(old - rear, k.x);
      road.grade = rise / ((front + rear) * Math.max(0.55, 1 - k.x * road.curvature));
    }
    road.crossedRamp = crossedRamp;
    road.sky = track.sky;
    stepKart(k, controls, road, a.boost, dt);
    if (k.fall && !wasFalling) {
      Object.assign(a.boost, createBoost(a.boost.gain));
      play.withdraw(a);
    }
    move.a = a;
    move.recovering = wasFalling || !!k.fall;
    if (move.recovering) return;
    stepBoost(a.boost, k, controls, dt);
    // No copy of the controls: each seat's are its own object for the whole tick (see
    // resolveSeatControls and the gameplay core's decide), and nothing here writes to them.
    move.controls = controls;
    move.old = old;
    move.s = k.s;
    move.x = k.x;
  }

  function resolveSeatControls(a, seatInputs) {
    if (a.kart.fall) return {};
    const provided = seatInputs ? seatInputs[a.id] : undefined;
    if (a.kind === 'ai' && provided === undefined) {
      return play.decide(a, state.player, SIM_DT);
    }
    if (provided && typeof provided.tick === 'number' && typeof provided.buttons === 'number') {
      return intentFrameToControls(provided, controlScratch[a.id] || (controlScratch[a.id] = {}));
    }
    return provided || {};
  }

  function evaluateRaceDone() {
    if (state.mode === 'test' || state.done) return;
    if (finishRule === 'primary') {
      if (state.player?.finish !== null) state.done = true;
      return;
    }
    const actors = state.actors;
    let humansOnly = false;
    if (finishRule === 'all_humans') {
      for (let i = 0; i < actors.length && !humansOnly; i++) humansOnly = actors[i].isHuman;
    }
    let allFinished = true;
    for (let i = 0; i < actors.length && allFinished; i++) {
      if (humansOnly && !actors[i].isHuman) continue;
      allFinished = actors[i].finish !== null;
    }
    if (allFinished) {
      state.done = true;
      return;
    }
    if (state.firstFinishAt !== null && state.elapsed - state.firstFinishAt >= finishGraceSeconds) {
      state.done = true;
    }
  }

  // Runs inside play.update once kart-to-kart contacts are settled: ramps, pads, pickups,
  // hazards, item use and the finish line for every kart that drove this tick.
  function afterContacts() {
    const dt = stepDt;
    const line = track.length * laps;
    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      if (move.recovering) continue;
      const a = move.a;
      const controls = move.controls;
      const old = move.old;
      const s = move.s;
      const x = move.x;
      const k = a.kart;
      if (k.s > s && k.grounded) {
        const ramp = crossedRamp(s, x, k.s, k.x);
        if (ramp) launchFromRamp(k, ramp, controls, controls.steer || 0);
      }
      if (k.kartImpact > 3 || k.wallImpact > 0.15) {
        state.events.push({ type: 'bump', seat: a.id });
      }
      features(a, old, dt, true);
      if (a.car === 'barrage' && state.mode !== 'trial' && (controls.blasters || controls.blastersPressed)) {
        play.fireBlasters(a);
      }
      if (controls.itemSwapPressed && state.mode !== 'trial') swapItems(a);
      if (controls.itemPressed && state.mode !== 'trial') {
        play.use(a, a.held, state.actors, controls.itemBackward ?? (controls.brake > 0.25 || controls.reverse > 0.5));
      }
      if (state.mode !== 'test' && a.finish === null && old < line && k.s >= line) {
        a.finish = state.elapsed - (dt * (k.s - line)) / (k.s - old);
        a.finishUs = Math.round(a.finish * 1e6);
        if (state.firstFinishAt === null) state.firstFinishAt = a.finish;
        state.events.push({ type: 'finish', seat: a.id, finish: a.finish, finishUs: a.finishUs });
      }
    }
  }

  function step(seatInputs = {}, dt = SIM_DT) {
    state.events.length = 0;
    if (state.done) return state.events;
    const currentTick = state.tick++;

    if (state.countdown > 0) {
      for (let i = 0; i < state.actors.length; i++) {
        const a = state.actors[i];
        if (a.kind === 'ai' && seatInputs[a.id] === undefined) {
          updateRevs(a.boost, state.countdown < 0.52 + a.id * 0.027 ? 1 : 0, dt);
        } else {
          const c = resolveSeatControls(a, seatInputs);
          updateRevs(a.boost, c.throttle || 0, dt);
        }
      }
      state.countdown = state.countdown <= dt + 1e-9 ? 0 : state.countdown - dt;
      if (Math.ceil(state.countdown) < state.beep) {
        state.beep = Math.ceil(state.countdown);
        state.events.push({ type: 'tone', name: state.beep ? 'count' : 'go', tick: currentTick });
      }
      if (state.countdown === 0) {
        for (let i = 0; i < state.actors.length; i++) gradeLaunch(state.actors[i].boost);
      }
      return state.events;
    }

    state.elapsed += dt;
    const pickups = track.pickups || [];
    for (let i = 0; i < pickups.length; i++) {
      if (pickups[i].hidden && state.elapsed >= pickups[i].readyAt) pickups[i].hidden = false;
    }

    // Track fixtures follow the leading active lap so loading doors open for the front-runner in MP too.
    let maxS = state.player ? (state.player.kart.fall?.exitS ?? state.player.kart.s) : 0;
    for (let i = 0; i < state.actors.length; i++) {
      const s = state.actors[i].kart.fall?.exitS ?? state.actors[i].kart.s;
      if (s > maxS) maxS = s;
    }
    const leadLap = state.mode === 'test'
      ? 1 + mod(Math.floor(maxS / track.length), laps)
      : Math.max(1, Math.min(laps, Math.floor(maxS / track.length) + 1));
    track.update(state.elapsed, dt, maxS, leadLap);

    const actors = state.actors;
    for (let i = 0; i < actors.length; i++) oldPips[i] = actors[i].boost.pips;
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i];
      driveActor(a, resolveSeatControls(a, seatInputs), dt, moves[i] || (moves[i] = { a: null, controls: null, old: 0, s: 0, x: 0, recovering: false }));
    }
    moves.length = actors.length;
    stepDt = dt;
    play.update(dt, state.actors, afterContacts);

    for (let i = 0; i < state.actors.length; i++) {
      const actor = state.actors[i];
      settlePickup(actor, state.elapsed);
      if (actor.boost.pips > oldPips[i]) state.events.push({ type: 'boost', seat: actor.id });
    }

    if (state.player) {
      const k = state.player.kart;
      const raceS = k.fall?.exitS ?? k.s;
      const f = track.sampleInto ? track.sampleInto(raceS, k.x, sampleScratch) : track.sample(raceS, k.x);
      state.lap = state.mode === 'test'
        ? 1 + mod(Math.floor(raceS / track.length), laps)
        : Math.max(1, Math.min(laps, Math.floor(raceS / track.length) + 1));
      if ((state.mode === 'test' || k.s >= 0) && f.section !== state.sector) {
        state.sector = f.section;
      }
    }

    evaluateRaceDone();
    return state.events;
  }

  function progressOf(a) {
    return a.kart.fall?.exitS ?? a.kart.s;
  }

  function positionOf(seatId = 0) {
    const me = state.actors[seatId] ?? state.player;
    if (!me) return 1;
    let ahead = 0;
    const myS = progressOf(me);
    for (let i = 0; i < state.actors.length; i++) {
      const other = state.actors[i];
      if (other === me) continue;
      if (other.finish !== null) {
        if (me.finish === null || other.finish < me.finish || (other.finish === me.finish && other.id < me.id)) ahead++;
      } else if (me.finish === null && progressOf(other) >= myS) {
        ahead++;
      }
    }
    return 1 + ahead;
  }

  function standings() {
    return state.actors
      .slice()
      .sort((a, b) => {
        if (a.finish !== null && b.finish !== null) return a.finishUs - b.finishUs || a.id - b.id;
        if (a.finish !== null) return -1;
        if (b.finish !== null) return 1;
        return progressOf(b) - progressOf(a) || a.id - b.id;
      })
      .map((a, index) => ({
        place: index + 1,
        seat: a.id,
        car: a.car,
        driver: a.driver,
        kind: a.kind,
        s: progressOf(a),
        finish: a.finish,
        finishUs: a.finishUs,
      }));
  }

  reset(options);

  return {
    course,
    track,
    play,
    rng,
    state,
    reset,
    step,
    positionOf,
    standings,
  };
}
