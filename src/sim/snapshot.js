// Deterministic full-world snapshots and compact wire snapshots for Sproto Racer.
// Note: kart.s is NEVER wrapped modulo track.length — cumulative unwrapped s drives
// laps, standings, finish-line crossings, and off-track respawnS.

import { carById } from '../roster.js';
import { createKart } from '../driving.js';
import { createBoost } from '../boost.js';

function cloneKart(k) {
  return {
    ...k,
    tuning: k.tuning,
    fall: k.fall ? { ...k.fall } : null,
  };
}

function cloneBoost(b) {
  return { ...b };
}

/**
 * Full deterministic state snapshot for exact rollback/reconciliation and server checkpoints.
 * Restoring via `applySnapshot` yields bit-identical future simulation steps and `stateHash`.
 */
export function captureSnapshot(world, ackBySeat = null) {
  const { state, track, play, rng } = world;
  const hiddenPickups = [];
  const pickups = track.pickups || [];
  for (let i = 0; i < pickups.length; i++) {
    if (pickups[i].hidden) hiddenPickups.push([i, pickups[i].readyAt]);
  }
  return {
    v: 1,
    tick: state.tick,
    seed: state.seed,
    mode: state.mode,
    laps: state.laps,
    elapsed: state.elapsed,
    countdown: state.countdown,
    beep: state.beep,
    lap: state.lap,
    sector: state.sector,
    done: state.done,
    firstFinishAt: state.firstFinishAt,
    ack: ackBySeat ? { ...ackBySeat } : undefined,
    rng: rng.getState(),
    fixtures: track.getFixtureState ? track.getFixtureState() : null,
    hiddenPickups,
    actors: state.actors.map((a) => ({
      id: a.id,
      kind: a.kind,
      car: a.car,
      driver: a.driver,
      isPlayer: a.isPlayer,
      isHuman: a.isHuman,
      kart: cloneKart(a.kart),
      boost: cloneBoost(a.boost),
      held: a.held,
      roulette: a.roulette ? { ...a.roulette } : null,
      charges: a.charges,
      unlimited: a.unlimited,
      finish: a.finish,
      finishUs: a.finishUs,
      hazardCooldown: a.hazardCooldown,
      touchingMask: a.touchingMask,
      shield: a.shield,
      draft: a.draft,
      incoming: a.incoming,
      notice: a.notice,
      noticeTime: a.noticeTime,
      splitStart: a.splitStart,
      pickupDistance: a.pickupDistance,
    })),
    gameplay: play.captureState ? play.captureState(state.actors) : null,
  };
}

export function applySnapshot(world, snap) {
  if (!snap || snap.v !== 1) return false;
  const { state, track, play, rng } = world;
  state.tick = snap.tick >>> 0;
  state.seed = snap.seed >>> 0;
  state.mode = snap.mode || state.mode;
  state.laps = snap.laps ?? state.laps;
  state.elapsed = snap.elapsed;
  state.countdown = snap.countdown;
  state.beep = snap.beep;
  state.lap = snap.lap;
  state.sector = snap.sector;
  state.done = Boolean(snap.done);
  state.firstFinishAt = snap.firstFinishAt ?? null;
  state.events.length = 0;

  rng.setState(snap.rng);
  if (track.setFixtureState && snap.fixtures) track.setFixtureState(snap.fixtures);

  const pickups = track.pickups || [];
  for (let i = 0; i < pickups.length; i++) {
    pickups[i].hidden = state.mode === 'trial';
    pickups[i].readyAt = Infinity;
  }
  if (Array.isArray(snap.hiddenPickups)) {
    for (let i = 0; i < snap.hiddenPickups.length; i++) {
      const [idx, readyAt] = snap.hiddenPickups[i];
      if (pickups[idx]) {
        pickups[idx].hidden = true;
        pickups[idx].readyAt = readyAt;
      }
    }
  }

  // Reuse actor object identities when seat count matches so references stay fast.
  if (state.actors.length !== snap.actors.length) {
    state.actors = snap.actors.map((raw) => {
      const car = carById(raw.car);
      return {
        ...raw,
        kart: Object.assign(createKart(car), raw.kart, {
          tuning: car,
          fall: raw.kart.fall ? { ...raw.kart.fall } : null,
        }),
        boost: Object.assign(createBoost(), raw.boost),
        roulette: raw.roulette ? { ...raw.roulette } : null,
      };
    });
  } else {
    for (let i = 0; i < snap.actors.length; i++) {
      const raw = snap.actors[i];
      const actor = state.actors[i];
      const car = carById(raw.car);
      actor.id = raw.id;
      actor.kind = raw.kind;
      actor.car = raw.car;
      actor.driver = raw.driver;
      actor.isPlayer = raw.isPlayer;
      actor.isHuman = raw.isHuman;
      Object.assign(actor.kart, createKart(car), raw.kart, {
        tuning: car,
        fall: raw.kart.fall ? { ...raw.kart.fall } : null,
      });
      Object.assign(actor.boost, createBoost(), raw.boost);
      actor.held = raw.held;
      actor.roulette = raw.roulette ? { ...raw.roulette } : null;
      actor.charges = raw.charges;
      actor.unlimited = raw.unlimited;
      actor.finish = raw.finish;
      actor.finishUs = raw.finishUs;
      actor.hazardCooldown = raw.hazardCooldown;
      actor.touchingMask = raw.touchingMask;
      actor.shield = raw.shield;
      actor.draft = raw.draft;
      actor.incoming = raw.incoming;
      actor.notice = raw.notice;
      actor.noticeTime = raw.noticeTime;
      actor.splitStart = raw.splitStart;
      actor.pickupDistance = raw.pickupDistance;
    }
  }
  state.player = state.actors[0] || null;
  if (play.applyState && snap.gameplay) play.applyState(snap.gameplay, state.actors);
  return true;
}

/**
 * Compact network wire snapshot (~400-900 B for 6 karts + projectiles at 20 Hz, well below
 * Nakama's 8192-byte socket.max_message_size_bytes limit).
 * Keeps kart.s unwrapped in integer millimeters (int32 covers +-2,147 km).
 */
const MM = 1000;
const RAD_Q = 10000;

export function encodeWireSnapshot(world, ackBySeat = {}) {
  const { state, track, play } = world;
  const hidden = [];
  const pickups = track.pickups || [];
  for (let i = 0; i < pickups.length; i++) {
    if (pickups[i].hidden) hidden.push(i);
  }
  const fx = track.getFixtureState ? track.getFixtureState() : null;
  return {
    t: state.tick,
    ms: Math.round(state.elapsed * 1000),
    cd: Math.round(state.countdown * 1000),
    done: state.done ? 1 : 0,
    ack: ackBySeat,
    fx: fx ? [Math.round(fx.bridgeAngle * 1000), Math.round(fx.bridgeTimer * 1000), fx.doorActive ? 1 : 0] : null,
    hp: hidden,
    k: state.actors.map((a) => {
      const k = a.kart;
      const b = a.boost;
      return {
        i: a.id,
        s: Math.round(k.s * MM),
        x: Math.round(k.x * MM),
        y: Math.round(k.y * MM),
        vy: Math.round(k.vy * MM),
        sp: Math.round(k.speed * MM),
        rv: Math.round(k.reverseSpeed * MM),
        yw: Math.round(k.yaw * RAD_Q),
        ty: Math.round(k.travelYaw * RAD_Q),
        st: Math.round(k.steer * RAD_Q),
        sl: Math.round(k.slipAngle * RAD_Q),
        pt: Math.round(k.pitch * RAD_Q),
        rl: Math.round(k.roll * RAD_Q),
        hl: Math.round(k.hopLift * MM),
        su: Math.round(k.suspension * MM),
        sn: Math.round(k.stunRemaining * 1000),
        rs: k.rescues,
        gr: k.grounded ? 1 : 0,
        sd: k.sliding ? k.driftDirection : 0,
        fl: k.fall ? [Math.round(k.fall.time * 1000), Math.round(k.fall.exitS * MM), Math.round(k.fall.respawnS * MM)] : null,
        bt: b.tier,
        br: Math.round(b.reserve * 1000),
        bm: Math.round(b.meter * 1000),
        bp: b.pips,
        it: a.held ?? -1,
        ch: a.charges,
        sh: Math.round((a.shield || 0) * 1000),
        in: a.incoming || '',
        fn: a.finishUs,
        // Sky Lane flight: lane, height, lateral and vertical speed, roll, tumble, chain.
        sk: k.flying
          ? [k.skyLane, Math.round(k.skyY * MM), Math.round(k.skyVX * MM), Math.round(k.skyVY * MM),
            Math.round(k.rollTime * 1000), Math.round(k.tumble * 1000), b.skyChain, b.skyTier, Math.round(b.skyTimer * 1000)]
          : null,
        tk: k.trickCount ? [k.trickCount, k.trickKind, Math.round(k.trickTime * 1000)] : null,
      };
    }),
    o: (play.objects || []).map((o) => ({
      id: o.id,
      tp: o.type,
      ow: o.owner?.id ?? 0,
      tg: o.target ? o.target.id : -1,
      s: Math.round(o.s * MM),
      x: Math.round(o.x * MM),
      y: Math.round(o.y * MM),
      v: Math.round((o.v || 0) * MM),
      vx: Math.round((o.vx || 0) * MM),
      vy: o.vy == null ? null : Math.round(o.vy * MM),
      lf: Math.round(o.life * 1000),
      tn: o.tint ?? null,
    })),
  };
}

export function decodeWireKart(w) {
  return {
    id: w.i,
    s: w.s / MM,
    x: w.x / MM,
    y: w.y / MM,
    vy: w.vy / MM,
    speed: w.sp / MM,
    reverseSpeed: w.rv / MM,
    yaw: w.yw / RAD_Q,
    travelYaw: w.ty / RAD_Q,
    steer: w.st / RAD_Q,
    slipAngle: w.sl / RAD_Q,
    pitch: w.pt / RAD_Q,
    roll: w.rl / RAD_Q,
    hopLift: w.hl / MM,
    suspension: w.su / MM,
    stunRemaining: w.sn / 1000,
    rescues: w.rs,
    grounded: w.gr === 1,
    sliding: w.sd !== 0,
    driftDirection: w.sd,
    fall: w.fl ? { time: w.fl[0] / 1000, exitS: w.fl[1] / MM, respawnS: w.fl[2] / MM } : null,
    boostTier: w.bt,
    boostReserve: w.br / 1000,
    boostMeter: w.bm / 1000,
    boostPips: w.bp,
    held: w.it >= 0 ? w.it : null,
    charges: w.ch,
    shield: w.sh / 1000,
    incoming: w.in || '',
    finishUs: w.fn ?? null,
    finish: w.fn != null ? w.fn / 1e6 : null,
    flying: !!w.sk,
    skyLane: w.sk ? w.sk[0] : -1,
    skyY: w.sk ? w.sk[1] / MM : 0,
    skyVX: w.sk ? w.sk[2] / MM : 0,
    skyVY: w.sk ? w.sk[3] / MM : 0,
    rollTime: w.sk ? w.sk[4] / 1000 : 0,
    tumble: w.sk ? w.sk[5] / 1000 : 0,
    skyChain: w.sk ? w.sk[6] : 0,
    skyTier: w.sk ? w.sk[7] : 0,
    skyTimer: w.sk ? w.sk[8] / 1000 : 0,
    trickCount: w.tk ? w.tk[0] : 0,
    trickKind: w.tk ? w.tk[1] : 0,
    trickTime: w.tk ? w.tk[2] / 1000 : 0,
  };
}
