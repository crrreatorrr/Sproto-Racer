// Pure Three.js-free gameplay simulation: 20 items, projectiles, traps, shields,
// slipstreams, hazards, Barrage blasters, kart contacts, and pack AI.

import { barrageMuzzle } from '../barrage-layout.js';
import { hasShapedBody } from '../kart-footprint.js';
import { resolveKartContacts } from '../kart-contact.js';
import { CRUISE_SPEED, GRAVITY, SKY_MAX_SPEED, steerForTurn, stunKart, springJump, tumbleKart } from '../driving.js';
import { interruptBoost, grantBoost, grantCell, dropSkyTier, stepSkyChain, clearSky } from '../boost.js';
import { lapOf, laneCeiling, sweepCells, sweepObstacles, SKY_KART_RADIUS } from './sky.js';

// Per-rival Sky Lane temperament, by rival id 1-5.
const RIVAL_SKY = [
  { skill: 0.92, bold: 0.8, aggression: 0.3, gate: true, tricks: 0.7 },
  { skill: 0.74, bold: 0.3, aggression: 0.75, gate: false, tricks: 0.35 },
  { skill: 0.62, bold: 0.6, aggression: 0.2, gate: true, tricks: 0.5 },
  { skill: 0.84, bold: 0.45, aggression: 0.9, gate: false, tricks: 0.6 },
  { skill: 0.68, bold: 0.9, aggression: 0.5, gate: true, tricks: 0.85 },
];
import { ITEMS } from '../items.js';
import { contactTime, shapedItemContactTime } from '../projectile-contact.js';
import { atan2, clamp, cos, damp, hypot3, mix, mod, sin } from './math.js';
import { createTrackSample } from './track-core.js';

export { ITEMS } from '../items.js';

const blankInput = () => ({
  throttle: 1,
  brake: 0,
  steer: 0,
  driftHeld: false,
  driftPressed: false,
  itemPressed: false,
});

export const FLYING_TYPES = new Set(['ball', 'disc', 'bolt', 'lightbolt', 'lob', 'ring', 'cursor', 'rocket']);
export const TRAP_TYPES = new Set(['slip', 'box', 'puck']);

const hitLabels = {
  lightbolt: 'PULSE HIT',
  pop: 'BOX POP',
  cursor: 'CURSOR HIT',
  ball: 'BUMPER HIT',
  disc: 'DISC HIT',
  bolt: 'CONFETTI HIT',
  lob: 'JELLY BURST',
  ring: 'RING HIT',
  puck: 'STATIC SHOCK',
  rocket: 'RELAY HIT',
};

function notify(actor, text) {
  actor.notice = text;
  actor.noticeTime = 1.3;
}

function defaultActorState(id = 0) {
  return {
    shield: 0,
    bubbleId: null,
    invincible: 0,
    slip: 0,
    slipDirection: 1,
    box: 0,
    hops: 0,
    wasGrounded: true,
    draft: 0,
    draftTargetId: null,
    draftRest: 0,
    itemCooldown: 1 + id * 0.65,
    aiDirection: 0,
    aiRest: 0.35,
    aiLane: 0,
    aiGoalX: 0,
    wasJumpRequested: false,
    blasterReady: 0,
    lastPosition: null,
    skyKey: -1,
    skyGot: 0,
    skyHitCool: 0,
    rollRammed: false,
  };
}

export function createGameplayCore(track, hooks = {}) {
  let actors = [];
  let elapsed = 0;
  let nextEntityId = 1;
  let nextVolleyId = 1;
  let actorStates = Object.create(null);
  const objects = [];
  let rewards = [...(track.pads || []), ...(track.pickups || [])];
  const sampleA = createTrackSample();
  const sampleB = createTrackSample();

  function sampleTrack(s, x = 0, out = sampleA) {
    if (track.sampleInto) return track.sampleInto(s, x, out);
    const r = track.sample(s, x);
    out.position.x = r.position.x;
    out.position.y = r.position.y;
    out.position.z = r.position.z;
    out.forward.x = r.forward?.x ?? 0;
    out.forward.y = r.forward?.y ?? 0;
    out.forward.z = r.forward?.z ?? 1;
    out.right.x = r.right?.x ?? 1;
    out.right.y = 0;
    out.right.z = r.right?.z ?? 0;
    out.curvature = r.curvature || 0;
    out.width = r.width ?? 16;
    out.bank = r.bank || 0;
    out.grade = r.grade || 0;
    out.section = r.section ?? 0;
    return out;
  }

  function stateKey(a) {
    if (a._simKey === undefined) {
      Object.defineProperty(a, '_simKey', {
        value: a.id ?? 0,
        writable: true,
        configurable: true,
        enumerable: false,
      });
    }
    return a._simKey;
  }

  function state(a) {
    const key = stateKey(a);
    if (!actorStates[key]) actorStates[key] = defaultActorState(a.id || 0);
    return actorStates[key];
  }

  function actorById(pack, id) {
    if (id == null) return null;
    for (let i = 0; i < pack.length; i++) {
      if (pack[i].id === id) return pack[i];
    }
    return null;
  }

  function deltaS(from, to) {
    return mod(to - from + track.length / 2, track.length) - track.length / 2;
  }

  function towInReach(k, other, distance) {
    const cur = sampleTrack(k.s, 0, sampleA).curvature;
    return distance >= 2 && distance <= 80 && Math.abs(other.x - k.x) <= 14 && Math.abs(cur) * distance <= 0.73;
  }

  function nearestAhead(a, pack, maxDistance, eligible) {
    let closest = null;
    let distance = maxDistance;
    for (let i = 0; i < pack.length; i++) {
      const b = pack[i];
      if (a === b || b.finish != null) continue;
      const d = deltaS(a.kart.s, b.kart.s);
      if (d > 0 && d < distance && (!eligible || eligible(a.kart, b.kart, d, b))) {
        closest = b;
        distance = d;
      }
    }
    return closest;
  }

  function pointY(s, x, y = 0) {
    if (track.heightAt) return track.heightAt(s, x) + y;
    return sampleTrack(s, x, sampleA).position.y + y;
  }

  function shotHeight(k, spawnS, offset) {
    if (k.grounded) return offset;
    const floor = pointY(spawnS, k.x, 0);
    return Math.max(offset, pointY(k.s, k.x, k.y + offset) - floor);
  }

  function add(type, actor, s, x, life, extra = {}) {
    const height = extra.height || 0;
    const y = pointY(s, x, height);
    const object = {
      id: nextEntityId++,
      type,
      owner: actor,
      s,
      x,
      y,
      s0: s,
      x0: x,
      y0: y,
      height,
      life,
      born: elapsed,
      rotX: 0,
      rotY: extra.rotY ?? 0,
      rotZ: 0,
      scaleX: extra.scaleX ?? 1,
      scaleY: extra.scaleY ?? 1,
      scaleZ: extra.scaleZ ?? 1,
      trailScaleZ: null,
      visible: true,
      ...extra,
    };
    // A trap dropped from a flying kart falls away into the lane below, harmlessly.
    if (TRAP_TYPES.has(type) && actor?.kart?.flying) object.life = Math.min(object.life, 0.35);
    objects.push(object);
    hooks.onSpawn?.(object, elapsed);
    return object;
  }

  function remove(index) {
    const removed = objects[index];
    objects.splice(index, 1);
    hooks.onRemove?.(removed);
  }

  function reset() {
    for (let i = objects.length - 1; i >= 0; i--) hooks.onRemove?.(objects[i]);
    objects.length = 0;
    actorStates = Object.create(null);
    actors = [];
    elapsed = 0;
    nextEntityId = 1;
    nextVolleyId = 1;
    hooks.onReset?.();
  }

  function withdraw(a) {
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      if (o.target === a || (o.owner === a && ['shield', 'attached', 'broom', 'flair', 'ring', 'beam', 'cable'].includes(o.type))) {
        remove(i);
      }
    }
    delete actorStates[stateKey(a)];
    a.shield = 0;
    a.draft = 0;
    a.incoming = '';
    a.notice = '';
    a.noticeTime = 0;
  }

  function pulseAt(a, s, x, height, color, radius) {
    add('pulse', a, s, x, 0.34, { radius, height, color, rotX: -Math.PI / 2 });
  }

  function pulse(a, color, radius) {
    pulseAt(a, a.kart.s, a.kart.x, a.kart.y + 0.34, color, radius);
  }

  function shield(a, seconds) {
    const st = state(a);
    const k = a.kart;
    let bubble = st.bubbleId != null ? objects.find((o) => o.id === st.bubbleId) : null;
    if (!bubble) {
      bubble = add('shield', a, k.s, k.x, Infinity, {
        height: k.y + 0.96,
        scaleX: 1.9,
        scaleY: 1.65,
        scaleZ: 2.35,
      });
      st.bubbleId = bubble.id;
    }
    a.shield = st.shield = Math.max(st.shield, seconds);
  }

  function flourish(a, itemType) {
    const k = a.kart;
    add('flair', a, k.s, k.x, 0.48, {
      itemType,
      height: k.y + 2.5,
      scaleX: 0.66,
      scaleY: 0.66,
      scaleZ: 0.66,
    });
  }

  function launch(a, type, dir, speed, extra = {}) {
    const k = a.kart;
    const spawnS = k.s + dir * 2.8;
    return add(type, a, spawnS, k.x, extra.duration ?? 3.5, {
      v: dir * speed,
      vx: dir * sin(k.yaw) * 17,
      height: shotHeight(k, spawnS, 0.83),
      // Shots from a flying kart travel level through the Sky Lane corridor.
      vy: k.grounded || k.flying ? null : k.vy,
      remainingBounces: 0,
      ...extra,
    });
  }

  function fireBlasters(a) {
    const k = a.kart;
    const st = state(a);
    if (a.car !== 'barrage' || k.fall || a.finish != null || k.stunRemaining > 0 || elapsed < (st.blasterReady ?? 0)) return false;
    st.blasterReady = elapsed + 0.65;
    const c = cos(k.yaw);
    const sn = sin(k.yaw);
    const m = barrageMuzzle;
    const speed = k.speed + 45;
    const tagged = new Set();
    const volleyId = nextVolleyId++;
    const scale = clamp(1 - k.x * sampleTrack(k.s, k.x, sampleA).curvature, 0.55, 1.65);
    for (const side of [-1, 1]) {
      const s = k.s + (-m.z * c - side * m.x * sn) / scale;
      const x = k.x - m.z * sn + side * m.x * c;
      const height = Math.max(0.2, pointY(k.s, k.x, k.y + m.y) - pointY(s, x, 0));
      add('lightbolt', a, s, x, 1.15, {
        tint: 0x44f3ff,
        height,
        v: (speed * c) / scale,
        vx: speed * sn,
        vy: k.grounded ? null : k.vy,
        tagged,
        volleyId,
      });
      cue('muzzle', 'lightbolt', a, s, x, height);
    }
    return true;
  }

  // Optional presentation callback. Never added to snapshots, hashes, or net state.
  function cue(phase, type, actor, s, x, height) {
    if (!hooks.onVisualCue) return;
    const k = actor.kart;
    hooks.onVisualCue({ phase, type, seat: actor.id ?? 0, isPlayer: !!actor.isPlayer,
      s: s ?? k.s, x: x ?? k.x, height: height ?? k.y + 0.92 });
  }

  function dropShield(a) {
    const s = state(a);
    s.shield = 0;
    a.shield = 0;
    if (s.bubbleId != null) {
      const bubble = objects.find((o) => o.id === s.bubbleId);
      if (bubble) {
        bubble.visible = false;
        bubble.life = 0;
        hooks.onHide?.(bubble);
      }
      s.bubbleId = null;
    }
  }

  function hit(a, effect, fromX) {
    const s = state(a);
    if (s.shield > 0) {
      dropShield(a);
      notify(a, 'SHIELD BLOCK');
      cue('block', effect, a);
      return true;
    }
    if (s.invincible > 0) return effect !== 'obstacle';
    const k = a.kart;
    const side = Math.abs(k.x - fromX) < 0.1 ? (a.id % 2 ? 1 : -1) : Math.sign(k.x - fromX);
    if (k.flying) {
      // Traps fall away under a flying kart, and a barrel roll slips every hit.
      if (effect === 'slip' || effect === 'box' || effect === 'puck' || k.rollTime > 0) return false;
      const lane = track.sky?.lanes[k.skyLane];
      tumbleKart(k, 0.8, lane ? lane.floor : 0);
      dropSkyTier(a.boost, 2);
      k.speed *= 0.75;
      s.invincible = 1.1;
      s.draft = a.draft = 0;
      notify(a, hitLabels[effect] ?? 'ITEM HIT');
      return true;
    }
    if (effect === 'box') {
      if (s.box > 0) return false;
      interruptBoost(a.boost, k);
      s.box = 2.8;
      s.hops = 0;
      add('attached', a, k.s, k.x, 3.1, { itemType: 'box' });
      notify(a, 'HOP TWICE!');
      cue('hit', 'box', a);
      return true;
    }
    if (effect === 'obstacle') {
      k.speed *= 0.78;
      k.travelYaw += side * 0.12;
      interruptBoost(a.boost, k);
      cue('hit', 'obstacle', a);
      return true;
    }

    stunKart(k, side);
    interruptBoost(a.boost, k);
    s.invincible = k.stunRemaining + 0.35;
    s.draft = a.draft = 0;
    s.draftTargetId = null;
    s.aiDirection = 0;
    if (effect === 'slip') {
      s.slip = 1.15;
      s.slipDirection = side;
      k.travelYaw += side * 0.13;
      notify(a, 'SLIPPERY!');
    } else if (effect === 'pulse') {
      k.travelYaw += side * 0.22;
      notify(a, 'BASS BUMP');
    } else {
      k.travelYaw += side * 0.12;
      notify(a, hitLabels[effect] ?? 'ITEM HIT');
    }
    cue('hit', effect, a);
    return true;
  }

  function blast(owner, s, x, height, radius, color, effect, pack, direct = null) {
    pulseAt(owner, s, x, height, color, radius);
    cue('blast', effect, owner, s, x, height);
    const worldY = pointY(s, x, height);
    for (let i = 0; i < pack.length; i++) {
      const b = pack[i];
      if (b === owner || b.finish != null) continue;
      if (b === direct) {
        hit(b, effect, x);
        continue;
      }
      const ds = deltaS(s, b.kart.s);
      if (Math.abs(ds) >= radius) continue;
      if (hypot3(ds, x - b.kart.x, worldY - pointY(b.kart.s, b.kart.x, b.kart.y + 0.8)) < radius) {
        hit(b, effect, x);
      }
    }
  }

  function use(a, index, pack, backward = false) {
    if (a.kart.fall || a.finish != null || a.kart.stunRemaining > 0 || !Number.isInteger(index) || !ITEMS[index]) return false;
    pack = pack.filter((b) => !b.kart.fall);
    const k = a.kart;
    const ahead = () => nearestAhead(a, pack, 125);
    let message = ITEMS[index].name.toUpperCase();
    switch (index) {
      case 0:
      case 8:
        grantBoost(a.boost, 1.45);
        flourish(a, index === 8 ? 'triple' : 'soda');
        if (index === 8) {
          if (!(a.charges > 0)) a.charges = 3;
          a.charges--;
          if (a.charges) message = 'SODA ×' + a.charges;
        }
        break;
      case 1: {
        const dir = backward ? -1 : 1;
        launch(a, 'ball', dir, Math.max(28, k.speed) + 24, { remainingBounces: 1 });
        break;
      }
      case 2:
        shield(a, 6);
        break;
      case 3:
        add('slip', a, k.s - 3.5, k.x, 20, { height: 0.13, scaleX: 2.3, scaleY: 0.20, scaleZ: 1.7 });
        break;
      case 4:
        add('box', a, k.s - 3.7, k.x, 20, { height: 0.72, scaleX: 1.35, scaleY: 1.35, scaleZ: 1.35 });
        break;
      case 5: {
        const target = ahead();
        launch(a, 'cursor', 1, k.speed + 18, { target, height: shotHeight(k, k.s + 2.8, 1.05), duration: 7 });
        if (target) notify(target, 'CURSOR INCOMING');
        else message = 'CURSOR FIRED · NO LOCK';
        break;
      }
      case 6:
        flourish(a, 'speaker');
        blast(a, k.s, k.x, k.y + 0.8, 8.5, 0xdd8cff, 'pulse', pack);
        break;
      case 7: {
        const target = nearestAhead(a, pack, 75, towInReach);
        flourish(a, 'spool');
        if (!target) {
          message = 'CABLE MISSED';
          break;
        }
        add('cable', a, k.s, k.x, 2.15, { target, color: 0x8efaff });
        break;
      }
      case 9:
        for (let i = 0; i < 4; i++) {
          const d = k.s + 8 + i * 12;
          const road = sampleTrack(d, k.x, sampleA);
          const lane = clamp(k.x, -road.width / 2 + 1.9, road.width / 2 - 1.9);
          add('strip', a, d, lane, 9, {
            height: 0.13,
            scaleX: 3.6,
            scaleY: 1,
            scaleZ: 3.7,
            rotY: atan2(road.forward.x, road.forward.z),
            used: new Set(),
          });
        }
        break;
      case 10: {
        const dir = backward ? -1 : 1;
        launch(a, 'disc', dir, Math.max(k.speed + 35, 58), {
          vx: dir * (Math.abs(k.yaw) > 0.12 ? sin(k.yaw) * 31 : 12),
          remainingBounces: 3,
          duration: 4,
        });
        break;
      }
      case 11: {
        const dir = backward ? -1 : 1;
        const tagged = new Set();
        const volleyId = nextVolleyId++;
        const colors = [0x67f2e3, 0xff98cc, 0xffcf5f];
        for (const lane of [-1, 0, 1]) {
          launch(a, 'bolt', dir, Math.max(58, k.speed + 28), {
            vx: dir * (sin(k.yaw) * 15 + lane * 10),
            tint: colors[lane + 1],
            tagged,
            volleyId,
            duration: 1.7,
          });
        }
        break;
      }
      case 12:
        launch(a, 'lob', 1, k.speed + 19, { vy: 10 + k.vy * 0.3, height: shotHeight(k, k.s + 2.8, 1.3) });
        break;
      case 13:
        launch(a, 'ring', 1, k.speed + 37, { tagged: new Set(), duration: 4.2 });
        break;
      case 14:
        add('puck', a, k.s - 3.8, k.x, 18, { height: 0.28 });
        break;
      case 15: {
        const existing = objects.find((o) => o.type === 'broom' && o.owner === a && o.life > 0);
        if (existing) existing.life = 2.8;
        else add('broom', a, k.s, k.x, 2.8, { height: k.y + 1.4 });
        break;
      }
      case 16:
        if (!springJump(k)) {
          notify(a, 'LAND TO USE SPRINGS');
          return false;
        }
        flourish(a, 'spring');
        break;
      case 17: {
        const target = nearestAhead(a, pack, 55, (_, other, _d, rival) => (
          Math.abs(other.x - k.x) < 10 && Math.abs(other.y - k.y) < 5 && rival.boost.reserve > 0.15
        ));
        flourish(a, 'siphon');
        if (!target) {
          message = 'SIPHON MISSED';
          break;
        }
        add('beam', a, k.s, k.x, 0.40, { target, color: 0x59fff0 });
        if (state(target).shield > 0) {
          dropShield(target);
          notify(target, 'SHIELD BLOCK');
          cue('block', 'siphon', target);
          break;
        }
        const stolen = Math.min(1.5, target.boost.reserve);
        target.boost.reserve -= stolen;
        if (target.boost.reserve <= 0) target.boost.tier = 0;
        grantBoost(a.boost, stolen);
        notify(target, 'SODA SIPHONED');
        cue('hit', 'siphon', target);
        break;
      }
      case 18: {
        const local = pack.filter((b) => b !== a && b.finish == null && b.kart.s > k.s && b.kart.s - k.s <= 240);
        const target = local.reduce((best, b) => (!best || b.kart.s > best.kart.s ? b : best), null);
        launch(a, 'rocket', 1, k.speed + 34, { target, duration: 7 });
        if (target) notify(target, 'RELAY INCOMING');
        else message = 'ROCKET FIRED · NO LOCK';
        break;
      }
      case 19:
        grantBoost(a.boost, 2.6, 2);
        shield(a, 3);
        flourish(a, 'comet');
        break;
    }
    if (!a.unlimited && (index !== 8 || a.charges === 0)) {
      a.held = null;
      a.charges = 0;
    } else if (index === 8 && a.unlimited && a.charges === 0) {
      a.charges = 3;
    }
    notify(a, message);
    cue(message.endsWith('MISSED') ? 'miss' : 'use', ITEMS[index].model, a);
    return true;
  }

  function decide(a, _player, dt) {
    const k = a.kart;
    const b = a.boost;
    const s = state(a);
    const input = blankInput();
    s.itemCooldown -= dt;
    s.aiRest = Math.max(0, s.aiRest - dt);
    if (k.flying) {
      decideFlight(a, k, s, input);
      aiItems(a, k, s, a.id || 1, input);
      return input;
    }
    const look = sampleTrack(k.s + 5 + k.speed * 0.20, k.x, sampleA);
    const here = sampleTrack(k.s, k.x, sampleB);
    const curvature = here.curvature * 0.65 + look.curvature * 0.35;
    const id = a.id || 1;
    let lane = clamp(sin(k.s / 128 + id * 2.1) * 2.2 + (id - 3) * 1.3, -7, 7);
    let nearestFeature = 65;
    const targets = a.held == null && !a.roulette ? rewards : track.pads;
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      if (target.hidden) continue;
      const d = deltaS(k.s, target.s);
      if (d < 0 || d > nearestFeature) continue;
      if (d === nearestFeature && Math.abs(target.x - lane) > Math.abs(s.aiGoalX - lane)) continue;
      nearestFeature = d;
      s.aiGoalX = target.x;
    }
    if (nearestFeature < 65) lane = mix(lane, s.aiGoalX, 1 - nearestFeature / 80);
    // From lap 2 some rivals line up on the Sky Gate catapult; the rest stay low.
    const gate = RIVAL_SKY[(id - 1) % RIVAL_SKY.length].gate ? gateAhead(k, 140) : null;
    if (gate) lane = (gate.entry[0] + gate.entry[1]) / 2;
    const trackHazards = track.hazards || [];
    for (let i = 0; i < trackHazards.length; i++) {
      const h = trackHazards[i];
      const d = deltaS(k.s, h.s);
      if (h.active === false || d < 0 || d > 40 || Math.abs(lane - h.x) > h.width / 2 + 1.4) continue;
      lane = h.x + (lane >= h.x ? 1 : -1) * (h.width / 2 + 2);
    }
    for (let i = 0; i < actors.length; i++) {
      const other = actors[i];
      if (other === a) continue;
      const d = deltaS(k.s, other.kart.s);
      if (d > 0 && d < 11 && Math.abs(k.x - other.kart.x) < 2.8) {
        lane = other.kart.x + (k.x >= other.kart.x ? 1 : -1) * 3.1;
        break;
      }
    }
    lane = clamp(lane, -here.width * 0.34, here.width * 0.34);
    s.aiLane = damp(s.aiLane, lane, 2.8, dt);
    const headingError = atan2(sin(k.travelYaw), cos(k.travelYaw));
    const steerCorrection = clamp((s.aiLane - k.x) * 0.15 - headingError * 2.6, -1, 1);
    const feed = (curvature * k.speed * cos(k.travelYaw)) / clamp(1 - curvature * k.x, 0.55, 1.65);
    const turn = Math.sign(curvature);
    if (
      s.aiDirection &&
      ((turn !== s.aiDirection && Math.abs(curvature) > 0.006) ||
        Math.abs(curvature) < 0.0035 ||
        b.chainClosed ||
        (k.grounded && !k.sliding && !k.pendingDrift))
    ) {
      s.aiDirection = 0;
      s.aiRest = 0.24;
    }
    input.steer = steerForTurn(k, (feed + steerCorrection) / (k.grounded ? Math.max(.6, here.grip ?? 1) : 1));
    if (
      !s.aiDirection &&
      s.aiRest === 0 &&
      k.grounded &&
      !k.sliding &&
      k.speed > 16 &&
      Math.abs(curvature) > 0.008 &&
      input.steer * turn > 0.15
    ) {
      s.aiDirection = turn;
      input.driftPressed = true;
    }
    if (s.aiDirection) {
      input.driftHeld = !(k.sliding && !b.chainClosed && b.meter >= 0.77 + (id % 3) * 0.066);
    }
    // Rivals hop at some ramp lips for a trick, set by id, lap and ramp.
    const trickRate = RIVAL_SKY[(id - 1) % RIVAL_SKY.length].tricks;
    if (k.grounded && !k.sliding && !s.aiDirection && k.speed > 18) {
      const ramps = track.ramps || [];
      const lap = lapOf(k.s, track.length);
      for (let i = 0; i < ramps.length; i++) {
        const r = ramps[i];
        if (!(r.power > 0) || Math.abs(k.x - r.x) > r.width / 2 - 0.5) continue;
        const d = deltaS(k.s, r.s);
        if (d < 1.5 || d > k.speed * 0.1) continue;
        if (((id * 31 + i * 17 + lap * 7) % 100) / 100 < trickRate) {
          input.driftPressed = true;
          input.driftHeld = false;
        }
        break;
      }
    }
    if (s.box > 0 && k.grounded && !s.wasJumpRequested) {
      input.driftPressed = true;
      input.driftHeld = true;
      s.wasJumpRequested = true;
    } else {
      s.wasJumpRequested = false;
    }
    if (Math.abs(curvature) * k.speed > 1.7 && Math.abs(k.x) > here.width * 0.29) {
      input.throttle = 0.68;
      input.brake = 0.15;
    }
    aiItems(a, k, s, id, input);
    return input;
  }

  // Rival flight: chase the next Boost Cell, read the obstacle field ahead from
  // its known motion, and dodge to the nearest open gap. Skill sets how far ahead
  // a rival reads, so weaker rivals clip obstacles at speed.
  function decideFlight(a, k, s, input) {
    const lane = track.sky?.lanes[k.skyLane];
    if (!lane) return;
    const id = a.id || 1;
    const profile = RIVAL_SKY[(id - 1) % RIVAL_SKY.length];
    const lap = lapOf(k.s, track.length);
    const layout = lane.layouts[lap - 1];
    const local = k.s - Math.floor(k.s / track.length) * track.length;
    const ceiling = laneCeiling(lane, k.s, track.length);
    const mid = (lane.floor + Math.min(lane.ceiling, ceiling)) / 2;
    const reach = k.speed * (0.45 + 0.45 * profile.skill);
    let tx = 0;
    let ty = mid;
    let aimed = false;
    // With an empty item slot, the nearest floating box ahead comes first.
    if (a.held == null && !a.roulette) {
      const taken = k.skyBoxKey === lane.index * 4 + lap ? k.skyBoxGot : 0;
      let best = null;
      for (let i = 0; i < layout.boxes.length; i++) {
        const b = layout.boxes[i];
        if (b.s < local + 4 || b.s > local + reach + 40 || taken & (1 << b.index)) continue;
        const cost = (b.s - local) + Math.abs(b.x - k.x) * 3;
        if (!best || cost < best.cost) best = { b, cost };
      }
      if (best) {
        tx = best.b.x;
        ty = best.b.y;
        aimed = true;
      }
    }
    for (let i = 0; i < layout.cells.length && !aimed; i++) {
      const c = layout.cells[i];
      if (c.s < local + 4 || c.s > local + reach + 40 || s.skyGot & (1 << c.index)) continue;
      if (c.mega && profile.bold < 0.5) continue;
      tx = c.x;
      ty = c.y;
      break;
    }
    const samples = profile.skill > 0.7 ? 3 : 2;
    const clear = (x, y) => {
      for (let n = 1; n <= samples; n++) {
        const t = (n / samples) * (reach / Math.max(20, k.speed));
        const sp = local + k.speed * t;
        if (sweepObstacles(layout, elapsed + t, sp - 1.5, x, y, sp + 1.5, x, y, lane, 1.9)) return false;
      }
      return true;
    };
    if (!clear(tx, ty)) {
      const half = lane.width / 2 - 2;
      let best = null;
      for (let gx = -4; gx <= 4; gx++) {
        for (let gy = 0; gy <= 3; gy++) {
          const x = (gx / 4) * half;
          const y = mix(lane.floor + 2.5, Math.min(lane.ceiling, ceiling) - 2.5, gy / 3);
          const cost = (x - tx) * (x - tx) + (y - ty) * (y - ty) * 1.4 + (x - k.x) * (x - k.x) * 0.3;
          if (best && cost >= best.cost) continue;
          if (clear(x, y)) best = { x, y, cost };
        }
      }
      if (best) {
        tx = best.x;
        ty = best.y;
      }
    }
    // Thin crossing volumes can slip between the coarse generic probe
    // stations. Pick the taller free side early, and hold altitude through it.
    const crossing=layout.obstacles.find(o=>o.type==='crossing'&&o.s-local<82&&o.s+o.depth+7>=local);
    if(crossing){
      const p=crossing.parts[0];
      ty=p.y>(lane.floor+lane.ceiling)*.5+2?p.y-5.0:p.y+5.0;
    }
    s.aiLane = damp(s.aiLane, tx, 6, 1 / 60);
    input.throttle = 1;
    input.steer = clamp((tx - k.x) / 5 - k.skyVX / 45, -1, 1);
    input.pitch = clamp(-(ty - k.skyY) / 4 + k.skyVY / 30, -1, 1);
    input.driftHeld = Math.abs(tx - k.x) > 9;
    if (lane.end - local < 70) input.pitch = 0.7;
    // Barrel-roll away from incoming fire, or into a kart alongside to ram it.
    if (!k.rollCool && !crossing) {
      let side = 0;
      if (a.incoming) side = k.x > 0 ? -1 : 1;
      else if (profile.aggression > 0.6) {
        for (let i = 0; i < actors.length; i++) {
          const o = actors[i];
          if (o === a || !o.kart.flying) continue;
          const dx = o.kart.x - k.x;
          if (Math.abs(deltaS(k.s, o.kart.s)) < 3 && Math.abs(dx) > 1.8 && Math.abs(dx) < 6 && Math.abs(o.kart.skyY - k.skyY) < 2) {
            side = Math.sign(dx);
            break;
          }
        }
      }
      if (side) {
        input.steer = side;
        input.driftPressed = true;
      }
    }
  }

  function gateAhead(k, range) {
    const lanes = track.sky?.lanes;
    if (!lanes) return null;
    const lap = lapOf(k.s, track.length);
    for (let i = 0; i < lanes.length; i++) {
      const lane = lanes[i];
      if (!lane.optional || lap < lane.openLap) continue;
      const d = mod(lane.start - k.s, track.length);
      if (d > 0 && d < range) return lane;
    }
    return null;
  }

  function aiItems(a, k, s, id, input) {
    const defend = a.incoming && (a.held === 15 || (!a.shield && (a.held === 2 || a.held === 19)));
    if (a.held != null && (s.itemCooldown <= 0 || defend)) {
      input.itemPressed = true;
      if ([1, 10, 11].includes(a.held)) {
        const front = nearestAhead(a, actors, 60);
        input.itemBackward = actors.some(
          (other) =>
            other !== a &&
            other.finish == null &&
            deltaS(other.kart.s, k.s) > 0 &&
            deltaS(other.kart.s, k.s) < (front ? 12 : 40) &&
            Math.abs(other.kart.x - k.x) < 5,
        );
      }
      s.itemCooldown = 1.2 + (id % 3) * 0.7;
    }
    if (a.car === 'barrage') {
      input.blasters = !!nearestAhead(a, actors, 30, (ka, other, d) => Math.abs(other.x - ka.x - sin(ka.yaw) * d) < 1.2);
    }
  }

  // Boost Cell grabs and obstacle hits for a kart in a Sky Lane. Both sweep the
  // segment the kart flew this tick, so nothing is skipped at flight speed.
  function updateSky(a, pack, dt) {
    const s = state(a);
    const k = a.kart;
    const sky = track.sky;
    const lane = sky?.lanes[k.skyLane];
    if (!lane) return;
    const lap = lapOf(k.s, track.length);
    const layout = lane.layouts[lap - 1];
    const key = lane.index * 4 + lap;
    if (s.skyKey !== key) {
      s.skyKey = key;
      s.skyGot = 0;
    }
    const base = Math.floor(k.s / track.length) * track.length;
    const local = k.s - base;
    const got = sweepCells(layout, s.skyGot, k.skyPrevS, k.skyPrevX, k.skyPrevY, local, k.x, k.skyY);
    if (got) {
      s.skyGot |= got;
      for (let i = 0; i < layout.cells.length; i++) {
        const cell = layout.cells[i];
        if (!(got & (1 << cell.index))) continue;
        const tierUp = grantCell(a.boost, cell.mega);
        hooks.onSkyCell?.(a, cell, tierUp);
      }
    }
    if (!s.skyHitCool) {
      const h = sweepObstacles(layout, elapsed, k.skyPrevS, k.skyPrevX, k.skyPrevY, local, k.x, k.skyY, lane);
      if (h) {
        s.skyHitCool = 0.45;
        if (h.head) tumbleKart(k, 0.6, lane.floor);
        if (h.nx) k.x += h.nx * h.push;
        if (h.ny) k.skyY = clamp(k.skyY + h.ny * h.push, lane.floor, lane.ceiling);
        if (h.head) {
          // Flew into it: lose most of the speed and two tiers.
          k.speed *= 0.55;
          dropSkyTier(a.boost, 2);
          k.s = Math.min(k.s, base + h.s - SKY_KART_RADIUS - 0.2);
          notify(a, 'CRASH');
        } else {
          k.speed *= 0.85;
          dropSkyTier(a.boost, 1);
          notify(a, 'CLIPPED');
        }
        k.skyVX *= 0.3;
        k.skyVY *= 0.3;
        hooks.onSkyHit?.(a, h.head);
      }
    }
    // A barrel roll that meets a kart alongside rams it: the victim wobbles, loses
    // a tier and is shoved aside, maybe into an obstacle. One ram per roll.
    if (k.rollTime > 0 && !s.rollRammed) {
      for (let i = 0; i < pack.length; i++) {
        const o = pack[i];
        if (o === a || !o.kart.flying || o.kart.rollTime > 0) continue;
        const ok = o.kart;
        const dx = ok.x - k.x;
        if (Math.abs(deltaS(k.s, ok.s)) > 2.6 || Math.abs(dx) > 2.8 || Math.abs(ok.skyY - k.skyY) > 2.2) continue;
        if (Math.sign(dx || k.rollDir) !== k.rollDir) continue;
        s.rollRammed = true;
        const os = state(o);
        if (os.shield > 0) {
          dropShield(o);
          notify(o, 'SHIELD BLOCK');
          break;
        }
        ok.wobble = 0.6;
        ok.skyVX = k.rollDir * 22;
        dropSkyTier(o.boost, 1);
        notify(o, 'RAMMED');
        notify(a, 'RAM!');
        hooks.onSkyHit?.(o, false);
        break;
      }
    }
    if (!k.rollTime) s.rollRammed = false;
    stepSkyChain(a.boost, k, dt);
  }

  function updateActor(a, pack, dt) {
    const s = state(a);
    const k = a.kart;
    a.noticeTime = Math.max(0, (a.noticeTime || 0) - dt);
    s.invincible = Math.max(0, s.invincible - dt);
    k.stunRemaining = Math.max(0, k.stunRemaining - dt);
    s.shield = Math.max(0, s.shield - dt);
    a.shield = s.shield;
    if (!s.shield && s.bubbleId != null) dropShield(a);
    if (s.slip > 0) {
      s.slip -= dt;
      if (k.grounded) k.travelYaw += s.slipDirection * 0.31 * Math.min(1, s.slip + 0.05) * dt;
    }
    if (s.box > 0) {
      if (s.wasGrounded && !k.grounded) s.hops++;
      if (s.hops >= 2) {
        s.box = 0;
        notify(a, 'BOX SHAKEN OFF');
      } else if ((s.box -= dt) <= 0) {
        hit(a, 'pop', k.x);
        pulse(a, 0xff885e, 3.5);
      }
    }
    s.wasGrounded = k.grounded;
    s.draftRest = Math.max(0, s.draftRest - dt);
    s.skyHitCool = Math.max(0, s.skyHitCool - dt);
    if (k.flying) updateSky(a, pack, dt);
    else if (a.boost.skyChain || a.boost.skyTier || a.boost.skyCells) clearSky(a.boost);
    if (k.stunRemaining > 0) return;
    const target = nearestAhead(a, pack, 20);
    const aligned =
      target &&
      Math.abs(target.kart.x - k.x) < 2.5 &&
      Math.abs(target.kart.y - k.y) < 2.3 &&
      k.speed > 12 &&
      target.kart.speed > 10;
    if (k.flying) {
      // In the air a wake is a tow, never stored boost: Cells are the only boost.
      k.towing = aligned && target.kart.flying ? 1 : 0;
      s.draft = a.draft = k.towing;
      return;
    }
    k.towing = 0;
    const draftTarget = actorById(pack, s.draftTargetId);
    if (aligned && !s.draftRest) {
      s.draft = Math.min(1, s.draft + 0.68 * dt);
      s.draftTargetId = target.id;
    } else if (
      s.draft > 0.70 &&
      draftTarget &&
      !s.draftRest &&
      Math.abs(deltaS(k.s, draftTarget.kart.s)) < 20 &&
      (Math.abs(k.x - draftTarget.kart.x) >= 2.5 || deltaS(k.s, draftTarget.kart.s) <= 0)
    ) {
      grantBoost(a.boost, 0.8);
      s.draft = 0;
      s.draftRest = 1.8;
      notify(a, 'SLIPSTREAM');
    } else {
      s.draft = Math.max(0, s.draft - 0.38 * dt);
    }
    a.draft = s.draft;
  }

  function moveProjectile(o, dt) {
    const k = o.owner.kart;
    if (o.target || (o.type === 'ring' && elapsed - o.born > 0.78)) {
      const target = o.target?.kart ?? k;
      const ds = deltaS(o.s, target.s);
      const closing = o.type === 'rocket' ? 47 : o.type === 'ring' ? 38 : 23;
      o.v = damp(o.v, Math.max(42, target.speed + closing), 4, dt);
      o.s += Math.sign(ds) * Math.min(Math.abs(ds), o.v * dt);
      o.x = damp(o.x, target.x, o.type === 'cursor' ? 3.8 : 6, dt);
      const floorY = pointY(o.s, o.x, 0);
      o.height = Math.max(0.65, damp(o.y0, pointY(target.s, target.x, target.y + 0.95), 5, dt) - floorY);
      if (o.type === 'ring' && Math.abs(ds) < 2 && Math.abs(o.x - k.x) < 2) o.ends = true;
    } else {
      o.s += o.v * dt;
      o.x += o.vx * dt;
      const edge = track.widthAt(o.s) / 2 - (o.type === 'disc' ? 1 : 0.8);
      if (Math.abs(o.x) > edge) {
        if (track.dropAt?.(o.s, Math.sign(o.x))) {
          o.life = 0;
          return;
        }
        if (o.remainingBounces > 0) {
          const side = Math.sign(o.x);
          o.x = side * (2 * edge - Math.abs(o.x));
          o.vx = -side * Math.abs(o.vx);
          o.remainingBounces--;
          cue('bounce', o.type, o.owner, o.s, side * edge, o.height);
        } else {
          o.x = clamp(o.x, -edge, edge);
          o.ends = true;
        }
      }
      if (o.vy != null) {
        const floorY = pointY(o.s, o.x, 0);
        const clearance = o.type === 'lob' ? 0.57 : 0.83;
        const height = o.y0 + o.vy * dt - 0.5 * GRAVITY * dt * dt - floorY;
        o.height = Math.max(clearance, height);
        o.vy = height <= clearance ? null : o.vy - GRAVITY * dt;
        if (o.type === 'lob' && height <= clearance) o.ends = true;
      }
    }
    const road = sampleTrack(o.s, o.x, sampleA);
    o.y = road.position.y + o.height;
    if (o.type === 'ball') {
      o.rotX += o.v * dt;
      return;
    }
    if (o.type === 'disc' || o.type === 'ring') {
      o.rotY += dt * 10;
      o.rotZ = 0.14;
      return;
    }
    if (o.type === 'lob') {
      o.rotZ += dt * 4;
      return;
    }
    const ds = deltaS(o.s0, o.s);
    const dx = o.x - o.x0;
    o.trailScaleZ = (o.type === 'rocket' ? 3.3 : 2.1) + 0.30 * sin((elapsed - o.born) * 35);
    const wx = road.forward.x * ds + road.right.x * dx;
    const wz = road.forward.z * ds + road.right.z * dx;
    if (Math.abs(ds) + Math.abs(dx) > 0.001) {
      o.rotOrder = 'YXZ';
      o.rotY = atan2(wx, wz);
      o.rotX = -atan2(o.y - o.y0, Math.sqrt(wx * wx + wz * wz));
    }
  }

  function updateObjects(dt, pack) {
    const actorPaths = new Map();
    for (let i = 0; i < pack.length; i++) {
      const a = pack[i];
      const { s, x, y } = a.kart;
      const road = sampleTrack(s, x, sampleA);
      const worldY = road.position.y + y + 0.8;
      const st = state(a);
      const prev = st.lastPosition;
      const roadScale = Math.max(0.55, Math.min(1.65, 1 - x * road.curvature));
      actorPaths.set(a, { s, x, y: worldY, roadScale, s0: prev?.s ?? s, x0: prev?.x ?? x, y0: prev?.y ?? worldY });
      st.lastPosition = { s, x, y: worldY, roadScale, s0: s, x0: x, y0: worldY };
    }
    const events = [];
    const brooms = [];
    for (let i = 0; i < objects.length; i++) {
      const o = objects[i];
      if ((o.life -= dt) <= 0) continue;
      const k = o.owner.kart;
      const st = state(o.owner);
      o.s0 = o.s;
      o.x0 = o.x;
      o.y0 = o.y;
      if (FLYING_TYPES.has(o.type)) {
        moveProjectile(o, dt);
        continue;
      }
      switch (o.type) {
        case 'attached':
          if (st.box <= 0) o.life = 0;
          else {
            o.s = k.s;
            o.x = k.x;
            o.height = 2.9 + k.y + sin(elapsed * 18) * 0.12;
            o.y = pointY(o.s, o.x, o.height);
            o.rotY = elapsed * 2;
          }
          break;
        case 'shield':
          if (!st.shield) o.life = 0;
          else {
            o.s = k.s;
            o.x = k.x;
            o.height = 0.96 + k.y;
            o.y = pointY(o.s, o.x, o.height);
            o.rotY = elapsed;
          }
          break;
        case 'cable':
          if (o.owner.boost.interrupted || k.stunRemaining > 0 || !towInReach(k, o.target.kart, deltaS(k.s, o.target.kart.s))) {
            o.life = 0;
            break;
          }
          grantBoost(o.owner.boost, dt * 1.3);
          k.speed += Math.min(4, Math.max(0, o.target.kart.speed + 3 - k.speed)) * dt;
          // The tether's after-drive pull must obey the same in-lane cap as flight.
          if(k.flying)k.speed=Math.min(k.speed,CRUISE_SPEED*SKY_MAX_SPEED);
          break;
        case 'beam':
          break;
        case 'pulse': {
          const sc = Math.max(0.1, o.radius * (1 - o.life / 0.34));
          o.scaleX = o.scaleY = o.scaleZ = sc;
          break;
        }
        case 'flair': {
          o.s = k.s - 1.9;
          o.x = k.x;
          o.height = k.y + 2.3 + (0.48 - o.life) * 2;
          o.y = pointY(o.s, o.x, o.height);
          o.rotY = elapsed * 5;
          const sc = Math.min(0.66, o.life * 3);
          o.scaleX = o.scaleY = o.scaleZ = sc;
          break;
        }
        case 'broom':
          brooms.push(o.owner);
          o.s = k.s + sin(elapsed * 6) * 1.8;
          o.x = k.x + cos(elapsed * 6) * 1.8;
          o.height = k.y + 1.35;
          o.y = pointY(o.s, o.x, o.height);
          o.rotY = elapsed * 6;
          break;
        case 'puck':
          o.rotY = elapsed * (elapsed - o.born > 0.45 ? 4 : 0.6);
          break;
        case 'strip':
          for (let j = 0; j < pack.length; j++) {
            const a = pack[j];
            if (!a.kart.stunRemaining && !o.used.has(a) && a.kart.y < 1.1 && Math.abs(deltaS(o.s, a.kart.s)) < 2.5 && Math.abs(a.kart.x - o.x) < 2.2) {
              o.used.add(a);
              grantBoost(a.boost, 0.6);
            }
          }
          break;
      }
    }

    function queue(time, kind, o, target) {
      if (Number.isFinite(time)) events.push({ time, kind, o, target });
    }

    for (let i = 0; i < objects.length; i++) {
      const o = objects[i];
      if (o.life <= 0 || (!FLYING_TYPES.has(o.type) && !TRAP_TYPES.has(o.type))) continue;
      for (let j = 0; j < brooms.length; j++) {
        const a = brooms[j];
        if (o.owner !== a) queue(contactTime(o, actorPaths.get(a), 7, 6, 4, track.length), 'clear', o);
      }
      if (o.type === 'puck' && elapsed - o.born < 0.45) continue;
      for (let j = 0; j < pack.length; j++) {
        const a = pack[j];
        if (a === o.owner || a.finish != null || o.tagged?.has(a) || (o.target && a !== o.target)) continue;
        const path = o.born === elapsed ? state(a).lastPosition : actorPaths.get(a);
        const reach = o.type === 'puck' ? 4.2 : 0;
        if (!reach && hasShapedBody(a.kart)) {
          const padX = o.type === 'slip' ? 1.10 : 0.40;
          queue(shapedItemContactTime(o, path, a.kart, padX, track.length), 'kart', o, a);
        } else {
          queue(contactTime(o, path, reach || 2.45, reach || (o.type === 'slip' ? 2.35 : 1.65), reach || 1.5, track.length), 'kart', o, a);
        }
      }
      if (!FLYING_TYPES.has(o.type)) continue;
      const trackHazards = track.hazards || [];
      for (let j = 0; j < trackHazards.length; j++) {
        const h = trackHazards[j];
        if (h.active === false || Math.abs(deltaS(o.s, h.s)) > h.depth / 2 + Math.abs(o.s - o.s0) + 2) continue;
        const y = pointY(h.s, h.x, h.height / 2);
        const barrier = { s: h.s, s0: h.s, x: h.x, x0: h.x, y, y0: y };
        queue(contactTime(o, barrier, h.depth / 2 + 0.4, h.width / 2 + 0.4, h.height / 2 + 0.4, track.length), 'barrier', o);
      }
      if (o.type === 'ball' || o.type === 'disc') {
        for (let j = 0; j < objects.length; j++) {
          const other = objects[j];
          if (other.owner === o.owner || other.life <= 0 || !(TRAP_TYPES.has(other.type) || other.type === 'cursor' || other.type === 'rocket')) continue;
          queue(contactTime(o, other, 2.15, 1.8, 1.35, track.length), 'intercept', o, other);
        }
      }
      if (o.ends) queue(1, 'end', o);
    }

    events.sort((a, b) => a.time - b.time || a.o.id - b.o.id);
    for (let i = 0; i < events.length; i++) {
      const { time, kind, o, target } = events[i];
      if (o.life <= 0) continue;
      const s = o.s0 + deltaS(o.s0, o.s) * time;
      const x = o.x0 + (o.x - o.x0) * time;
      const height = Math.max(0.12, o.y0 + (o.y - o.y0) * time - pointY(s, x, 0));
      if (kind === 'clear') {
        o.life = 0;
        pulseAt(o.owner, s, x, height, 0x9ff4da, 2);
        cue('clear', o.type, o.owner, s, x, height);
        continue;
      }
      if (kind === 'intercept') {
        if (target.life <= 0) continue;
        target.life = 0;
        o.life = 0;
        pulseAt(o.owner, s, x, height, 0xffe8be, 2.2);
        cue('intercept', o.type, o.owner, s, x, height);
        continue;
      }
      if (o.type === 'lob' || o.type === 'puck') {
        blast(o.owner, s, x, height, o.type === 'lob' ? 7 : 6.5, o.type === 'lob' ? 0xa6ed48 : 0xc8a1ff, o.type, pack, kind === 'kart' ? target : null);
      } else if (kind === 'kart') {
        if (o.tagged?.has(target)) continue;
        if (!hit(target, o.type, x)) continue;
        o.tagged?.add(target);
        if (FLYING_TYPES.has(o.type)) pulseAt(o.owner, s, x, height, 0xffdb9c, 1.65);
        if (o.type === 'ring') continue;
      } else if (kind === 'barrier') {
        pulseAt(o.owner, s, x, height, 0xffdb9c, 1.65);
        cue('bounce', o.type, o.owner, s, x, height);
      }
      o.life = 0;
    }

    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      if (o.life <= 0 || (o.type === 'cable' && o.owner.boost.interrupted)) remove(i);
    }
    for (let i = 0; i < pack.length; i++) pack[i].incoming = '';
    for (let i = 0; i < objects.length; i++) {
      const o = objects[i];
      if (!o.target) continue;
      if (o.type === 'rocket') o.target.incoming = 'RELAY INCOMING';
      else if (o.type === 'cursor' && !o.target.incoming) o.target.incoming = 'CURSOR INCOMING';
    }
    hooks.onSync?.(objects, elapsed);
  }

  function update(dt, pack, afterContacts) {
    actors = pack.filter((a) => !a.kart.fall);
    elapsed += dt;
    resolveKartContacts(track, actors);
    afterContacts?.();
    for (let i = 0; i < actors.length; i++) updateActor(actors[i], actors, dt);
    updateObjects(dt, actors);
    for (let i = 0; i < actors.length; i++) actors[i].boost.interrupted = false;
  }

  function hitHazard(a, type) {
    const label = type === 'rollingDrum' ? 'DRUM HIT' : type === 'loadingDoor' ? 'DOOR HIT' : 'OBSTACLE HIT';
    const currentShield = state(a).shield;
    if (hit(a, 'obstacle', a.kart.x) && currentShield === 0) notify(a, label);
    return true;
  }

  function setTrack(next) {
    reset();
    track = next;
    rewards = [...(track.pads || []), ...(track.pickups || [])];
  }

  function captureState(allActors) {
    const statesOut = Object.create(null);
    for (let i = 0; i < allActors.length; i++) {
      const a = allActors[i];
      const st = state(a);
      statesOut[a.id] = {
        ...st,
        lastPosition: st.lastPosition ? { ...st.lastPosition } : null,
      };
    }
    const objectsOut = objects.map((o) => ({
      id: o.id,
      type: o.type,
      itemType: o.itemType,
      ownerId: o.owner?.id ?? 0,
      targetId: o.target ? o.target.id : null,
      s: o.s,
      x: o.x,
      y: o.y,
      s0: o.s0,
      x0: o.x0,
      y0: o.y0,
      height: o.height,
      life: o.life,
      born: o.born,
      v: o.v,
      vx: o.vx,
      vy: o.vy,
      remainingBounces: o.remainingBounces,
      ends: o.ends,
      radius: o.radius,
      color: o.color,
      tint: o.tint,
      rotOrder: o.rotOrder,
      rotX: o.rotX,
      rotY: o.rotY,
      rotZ: o.rotZ,
      scaleX: o.scaleX,
      scaleY: o.scaleY,
      scaleZ: o.scaleZ,
      trailScaleZ: o.trailScaleZ,
      visible: o.visible,
      volleyId: o.volleyId ?? null,
      taggedIds: o.tagged ? Array.from(o.tagged, (actor) => actor.id) : null,
      usedIds: o.used ? Array.from(o.used, (actor) => actor.id) : null,
    }));
    return { elapsed, nextEntityId, nextVolleyId, actorStates: statesOut, objects: objectsOut };
  }

  function applyState(snap, allActors) {
    for (let i = objects.length - 1; i >= 0; i--) hooks.onRemove?.(objects[i]);
    objects.length = 0;
    actorStates = Object.create(null);
    actors = allActors.filter((a) => !a.kart.fall);
    elapsed = snap.elapsed ?? 0;
    nextEntityId = snap.nextEntityId ?? 1;
    nextVolleyId = snap.nextVolleyId ?? 1;
    const byId = new Map();
    for (let i = 0; i < allActors.length; i++) byId.set(allActors[i].id, allActors[i]);
    for (const [idStr, st] of Object.entries(snap.actorStates || {})) {
      const id = Number(idStr);
      const a = byId.get(id);
      if (!a) continue;
      actorStates[stateKey(a)] = {
        ...st,
        lastPosition: st.lastPosition ? { ...st.lastPosition } : null,
      };
    }
    const volleySets = new Map();
    for (let i = 0; i < (snap.objects || []).length; i++) {
      const raw = snap.objects[i];
      let tagged;
      if (raw.taggedIds) {
        if (raw.volleyId != null) {
          tagged = volleySets.get(raw.volleyId);
          if (!tagged) {
            tagged = new Set(raw.taggedIds.map((id) => byId.get(id)).filter(Boolean));
            volleySets.set(raw.volleyId, tagged);
          }
        } else {
          tagged = new Set(raw.taggedIds.map((id) => byId.get(id)).filter(Boolean));
        }
      }
      const obj = {
        ...raw,
        owner: byId.get(raw.ownerId) ?? allActors[0],
        target: raw.targetId != null ? byId.get(raw.targetId) ?? null : null,
        tagged,
        used: raw.usedIds ? new Set(raw.usedIds.map((id) => byId.get(id)).filter(Boolean)) : undefined,
      };
      delete obj.ownerId;
      delete obj.targetId;
      delete obj.taggedIds;
      delete obj.usedIds;
      objects.push(obj);
      hooks.onSpawn?.(obj, elapsed);
    }
    hooks.onSync?.(objects, elapsed);
  }

  return {
    get track() { return track; },
    get elapsed() { return elapsed; },
    objects,
    /** Bitmask of Boost Cells this kart has grabbed in its current Sky Lane lap. */
    skyGot(a) {
      const s = state(a);
      const k = a.kart;
      if (!k.flying || !track.sky) return 0;
      return s.skyKey === k.skyLane * 4 + lapOf(k.s, track.length) ? s.skyGot : 0;
    },
    setTrack,
    reset,
    withdraw,
    use,
    fireBlasters,
    update,
    decide,
    hitHazard,
    captureState,
    applyState,
  };
}
