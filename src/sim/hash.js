// Two-lane 64-bit FNV-1a state hash (16 hex digits) over every outcome-relevant
// simulation quantity. Identical across V8, SpiderMonkey, JSC, and Nakama Goja.

function mixLane(h, v, prime) {
  const u = v >>> 0;
  h = Math.imul(h ^ (u & 0xff), prime) >>> 0;
  h = Math.imul(h ^ ((u >>> 8) & 0xff), prime) >>> 0;
  h = Math.imul(h ^ ((u >>> 16) & 0xff), prime) >>> 0;
  h = Math.imul(h ^ ((u >>> 24) & 0xff), prime) >>> 0;
  return h;
}

const P1 = 0x01000193;
const P2 = 0x01000193;

export function createHasher() {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  return {
    int(n) {
      const v = (n | 0) >>> 0;
      h1 = mixLane(h1, v, P1);
      h2 = mixLane(h2, (v ^ 0x85ebca6b) >>> 0, P2);
    },
    q(value, scale = 1000) {
      this.int(Math.round((value || 0) * scale));
    },
    hex() {
      return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
    },
  };
}

export function stateHash(world) {
  const hash = createHasher();
  const { state, track, play, rng } = world;

  hash.int(state.tick);
  hash.q(state.elapsed, 10000);
  hash.q(state.countdown, 10000);
  hash.int(state.done ? 1 : 0);

  const rngState = rng.getState();
  for (let i = 0; i < 4; i++) hash.int(rngState[i]);

  if (track.getFixtureState) {
    const fx = track.getFixtureState();
    hash.q(fx.bridgeAngle, 10000);
    hash.q(fx.bridgeTimer, 10000);
    hash.q(fx.drumX, 1000);
    hash.int(fx.doorActive ? 1 : 0);
  }

  const pickups = track.pickups || [];
  for (let i = 0; i < pickups.length; i++) {
    if (pickups[i].hidden) {
      hash.int(i);
      hash.q(Number.isFinite(pickups[i].readyAt) ? pickups[i].readyAt : -1, 1000);
    }
  }

  for (let i = 0; i < state.actors.length; i++) {
    const a = state.actors[i];
    const k = a.kart;
    const b = a.boost;
    hash.int(a.id);
    hash.q(k.s, 1000);
    hash.q(k.x, 1000);
    hash.q(k.y, 1000);
    hash.q(k.vy, 1000);
    hash.q(k.speed, 1000);
    hash.q(k.reverseSpeed, 1000);
    hash.q(k.yaw, 10000);
    hash.q(k.travelYaw, 10000);
    hash.q(k.steer, 10000);
    hash.q(k.cornerRate, 10000);
    hash.q(k.slipAngle, 10000);
    hash.q(k.straightRun, 10000);
    hash.int((k.grounded ? 1 : 0) | (k.sliding ? 2 : 0) | (k.hopping ? 4 : 0));
    hash.int(k.slideId);
    hash.int(k.driftDirection);
    hash.int(k.rescues);
    hash.q(k.stunRemaining, 1000);
    hash.int(b.tier);
    hash.q(b.reserve, 1000);
    hash.q(b.meter, 1000);
    hash.int(b.pips);
    hash.int(b.chainClosed ? 1 : 0);
    hash.int(a.held == null ? -1 : a.held);
    hash.int(a.charges);
    hash.int(a.reserve == null ? -1 : a.reserve);
    hash.int(a.reserveCharges ?? 0);
    hash.int(a.roulette ? a.roulette.item : -1);
    hash.int(a.finishUs == null ? -1 : a.finishUs);
    hash.int(k.flying ? k.skyLane : -1);
    hash.q(k.skyY || 0, 1000);
    hash.q(k.tumble || 0, 1000);
    hash.q(k.rollTime || 0, 1000);
    hash.int(b.skyChain || 0);
    hash.int(b.skyTier || 0);
    hash.int(k.trickCount || 0);
    hash.int(k.skyBoxGot || 0);
  }

  const objects = play.objects || [];
  hash.int(objects.length);
  for (let i = 0; i < objects.length; i++) {
    const o = objects[i];
    hash.int(o.id);
    hash.int(o.owner?.id ?? -1);
    hash.int(o.target ? o.target.id : -1);
    hash.q(o.s, 1000);
    hash.q(o.x, 1000);
    hash.q(o.y, 1000);
    hash.q(o.life, 1000);
  }

  return hash.hex();
}
