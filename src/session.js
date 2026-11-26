import { ITEMS, startPickup, settlePickup, hasItemRoom, swapItems } from './items.js';
import { racerSetup } from './roster.js';
import { createKart, stepKart, launchFromRamp, CRUISE_SPEED, settleInSky } from './driving.js';
import { createBoost, stepBoost, grantBoost, updateRevs, gradeLaunch } from './boost.js';
import { acceptTrial, noteTrial, pageRecords } from './hub/records.js';
import { atan2, mod } from './sim/math.js';
import { createTrackSample } from './sim/track-core.js';
import { grabSkyBox } from './sim/sky.js';
import { chassisContactMetrics, crossedTrackRamp, overlapsTrackHazard } from './sim/world.js';

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

export function createSession(track, play, fx, records = pageRecords, onVisualCue) {
  const state = {
    mode: 'race', actors: [], player: null, elapsed: 0, countdown: 0,
    lap: 1, sector: 0, done: false, split: '', splitUntil: 0,
  };
  let settings = { ...DEFAULT_TEST };
  let rec = [];
  let best = null;
  let nextSample = 0;
  let ghostCursor = 0;
  let beep = 3;

  const sampleScratch = createTrackSample();
  const roadScratch = createTrackSample();
  const readBest = () => acceptTrial(records.get(track.id), track.length);
  function reloadBest() {
    best = readBest();
    ghostCursor = 0;
  }
  reloadBest();

  const heightAt = (s, x) => (
    track.heightAt ? track.heightAt(s, x) : (track.sampleInto ? track.sampleInto(s, x, sampleScratch).position.y : track.sample(s, x).position.y)
  );
  const crossedRamp = (startS, startX, endS, endX) => crossedTrackRamp(track, startS, startX, endS, endX);

  function make(id, s, x, entrySpeed) {
    const { car, driver } = racerSetup(id, settings);
    return {
      id,
      car: car.id,
      driver: driver.id,
      isPlayer: !id,
      kart: { ...createKart(car), s, x, speed: entrySpeed * car.speed },
      boost: createBoost(),
      held: null,
      roulette: null,
      charges: 0,
      reserve: null,
      reserveCharges: 0,
      unlimited: !id && state.mode === 'test',
      finish: null,
      hazardCooldown: 0,
      touchingHazards: new Set(),
    };
  }

  function start(mode, options = {}) {
    settings = { ...DEFAULT_TEST, ...options };
    Object.assign(state, { mode, elapsed: 0, split: '', splitUntil: 0, done: false });
    const test = mode === 'test';
    const base = test ? track.sections[settings.sector].start + (settings.lap - 1) * track.length : 0;
    const speed = test ? CRUISE_SPEED * ({ standstill: 0, cruise: 1, turbo: 1.2, super: 1.4 }[settings.speed] ?? 0) : 0;
    const race = mode === 'race';
    const playerSlot = race ? track.grid[5] : { s: base, x: 0 };
    state.player = make(0, playerSlot.s, playerSlot.x, speed);
    state.actors = [state.player];
    if (race) {
      track.grid.slice(0, 5).forEach(({ s, x }, i) => state.actors.push(make(i + 1, s, x, speed)));
    } else if (test) {
      const offsets = {
        pack: [[0, 3], [8, -2.6], [8, 3], [14, -2.6], [14, 3]],
        ahead: [[12, 0]],
        behind: [[-12, 0]],
        alongside: [[0, 3.25]],
      };
      (offsets[settings.rivals] ?? []).forEach(([d, x], i) => state.actors.push(make(i + 1, base + d, x, speed)));
    }
    if (test) {
      // A sector inside a main Sky Lane starts in flight: its road is gone.
      const road = { sky: track.sky, length: track.length, heightAt };
      for (const a of state.actors) settleInSky(a.kart, road);
      state.player.inventoryCharges = ITEMS.map((item) => item.charges ?? 1);
      select(settings.item);
      for (const a of state.actors) {
        if (['turbo', 'super'].includes(settings.speed)) {
          grantBoost(a.boost, 5, settings.speed === 'super' ? 2 : 1);
        }
      }
    }
    for (const a of state.actors) {
      a.splitStart = 0;
      a.pickupDistance = -Infinity;
    }
    play.reset();
    fx.reset();
    track.reset();
    for (const p of track.pickups) {
      p.hidden = mode === 'trial';
      p.readyAt = Infinity;
    }
    state.countdown = test && !(settings.sector === 0 && speed === 0) ? 0 : 3;
    beep = 3;
    rec = [];
    nextSample = 0;
    ghostCursor = 0;
    state.sector = test ? settings.sector : 0;
    state.lap = test ? settings.lap : 1;
    track.update(0, 0, base, state.lap);
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

  function features(a, oldS, dt) {
    const k = a.kart;
    const dist = k.s - oldS;
    a.hazardCooldown = Math.max(0, a.hazardCooldown - dt);
    if (state.mode !== 'test' || settings.hazards) {
      for (const h of track.hazards) {
        if (h.active === false || !overlapsTrackHazard(track, sampleScratch, heightAt, k, h)) {
          a.touchingHazards.delete(h);
        } else if (!a.touchingHazards.has(h)) {
          a.touchingHazards.add(h);
          if (!a.hazardCooldown) {
            play.hitHazard(a, h.type);
            a.hazardCooldown = 1.2;
          }
        }
      }
    }
    if (dist <= 0) return;
    const cross = (o) => {
      const offset = mod(o.s - oldS, track.length);
      return offset > 0 && offset <= dist && Math.abs(k.x - o.x) < (o.width ?? 3.2) / 2 + 0.45;
    };
    for (const p of track.pads) {
      if (!k.stunRemaining && cross(p) && k.y < 1.4) {
        grantBoost(a.boost, p.tier === 2 ? 2.2 : 1.35, p.tier);
      }
    }
    // Floating item boxes in a Sky Lane draw from the same roulette.
    if (k.flying && state.mode !== 'trial' && a.finish == null && !a.roulette && (hasItemRoom(a) || a.unlimited)) {
      if (grabSkyBox(track.sky, track.length, k) && !a.unlimited) startPickup(a, state.actors, state.elapsed);
    }
    if (state.mode !== 'trial' && a.finish == null && !a.roulette && (hasItemRoom(a) || a.unlimited)) {
      for (const p of track.pickups) {
        if (!p.hidden && cross(p) && k.y < 2.5) {
          if (!a.unlimited) startPickup(a, state.actors, state.elapsed);
          p.hidden = true;
          p.readyAt = state.elapsed + 1.8;
          onVisualCue?.({phase:'pickup',type:'pickup',seat:a.id,isPlayer:!!a.isPlayer,s:p.s,x:p.x,height:1.05});
          break;
        }
      }
    }
    if (track.switchTrigger && cross(track.switchTrigger)) track.triggerSwitch();
  }

  function drive(a, controls, dt) {
    const k = a.kart;
    const old = k.s;
    const road = track.sampleInto ? track.sampleInto(old, k.x, roadScratch) : Object.assign(roadScratch, track.sample(old, k.x));
    road.heightAt = heightAt;
    road.widthAt = track.widthAt;
    road.edgeAt = track.edgeAt;
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
      Object.assign(a.boost, createBoost());
      play.withdraw(a);
    }
    if (wasFalling || k.fall) return { a, recovering: true };
    stepBoost(a.boost, k, controls, dt);
    return { a, controls, old, s: k.s, x: k.x };
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

  function tick(input, dt) {
    if (state.done) return;
    if (state.mode === 'test') {
      if (input.slot !== null && input.slot !== undefined) select(input.slot);
      else if (input.prevPressed) select(state.player.held - 1);
      else if (input.nextPressed) select(state.player.held + 1);
    }
    if (state.countdown > 0) {
      updateRevs(state.player.boost, input.throttle, dt);
      for (const a of state.actors.slice(1)) updateRevs(a.boost, state.countdown < 0.52 + a.id * 0.027 ? 1 : 0, dt);
      state.countdown = state.countdown <= dt + 1e-9 ? 0 : state.countdown - dt;
      if (Math.ceil(state.countdown) < beep) {
        beep = Math.ceil(state.countdown);
        fx.tone(beep ? 'count' : 'go');
      }
      if (state.countdown === 0) {
        for (const a of state.actors) gradeLaunch(a.boost);
      }
      return;
    }
    state.elapsed += dt;
    for (const p of track.pickups) {
      if (p.hidden && state.elapsed >= p.readyAt) p.hidden = false;
    }
    track.update(state.elapsed, dt, state.player.kart.s, state.lap);
    const oldPips = state.player.boost.pips;
    const moves = state.actors.map((a) => drive(a, a.isPlayer ? input : a.kart.fall ? {} : play.decide(a, state.player, dt), dt));
    play.update(dt, state.actors, () => {
      for (const { a, controls, old, s, x, recovering } of moves) {
        if (recovering) continue;
        const k = a.kart;
        if (k.s > s && k.grounded) {
          const ramp = crossedRamp(s, x, k.s, k.x);
          if (ramp) launchFromRamp(k, ramp, controls, controls.steer || 0);
        }
        if (a.isPlayer && (k.kartImpact > 3 || k.wallImpact > 0.15)) fx.tone('bump');
        features(a, old, dt);
        if (a.car === 'barrage' && state.mode !== 'trial' && (controls.blasters || controls.blastersPressed)) play.fireBlasters(a);
        if (controls.itemSwapPressed && state.mode !== 'trial') swapItems(a);
        if (controls.itemPressed && state.mode !== 'trial') useItem(a, controls.itemBackward ?? (controls.brake > 0.25 || controls.reverse > 0.5));
        const line = track.length * 3;
        if (state.mode !== 'test' && a.finish === null && old < line && k.s >= line) {
          a.finish = state.elapsed - (dt * (k.s - line)) / (k.s - old);
        }
      }
    });
    for (const actor of state.actors) settlePickup(actor, state.elapsed);
    if (state.player.boost.pips > oldPips) fx.tone('boost');
    const k = state.player.kart;
    const raceS = k.fall?.exitS ?? k.s;
    const f = track.sampleInto ? track.sampleInto(raceS, k.x, sampleScratch) : track.sample(raceS, k.x);
    state.lap = state.mode === 'test' ? 1 + mod(Math.floor(raceS / track.length), 3) : Math.max(1, Math.min(3, Math.floor(raceS / track.length) + 1));
    if ((state.mode === 'test' || k.s >= 0) && f.section !== state.sector) {
      state.split = 'S' + String(state.sector + 1).padStart(2, '0') + '   ' + timeText(state.elapsed - state.player.splitStart);
      state.player.splitStart = state.elapsed;
      state.splitUntil = state.elapsed + 2.2;
      state.sector = f.section;
    }
    recordGhost();
    if (state.player.finish !== null) {
      state.done = true;
      if (state.mode === 'trial' && (!best || best.time >= state.elapsed)) {
        best = noteTrial(records, track.id, best, {
          time: state.elapsed,
          length: track.length,
          car: state.player.car,
          driver: state.player.driver,
          frames: rec,
        }) ?? best;
      }
    }
  }

  function position() {
    return (
      1 +
      state.actors.filter(
        (a) =>
          a !== state.player &&
          (a.finish !== null
            ? state.player.finish === null || a.finish < state.player.finish
            : (a.kart.fall?.exitS ?? a.kart.s) >= (state.player.kart.fall?.exitS ?? state.player.kart.s)),
      ).length
    );
  }

  return {
    state,
    start,
    tick,
    select,
    useItem,
    ghost,
    position,
    reloadBest,
    get ghostSetup() { return { car: best?.car, driver: best?.driver }; },
    get settings() { return { ...settings }; },
    get best() { return best?.time ?? null; },
  };
}
