import {HALF_KART_WIDTH,flightCeiling} from './driving.js';
import {kartFootprint,footprintContact,laneBounds,separatedOn,lastSeparatingAxis,hullsApart} from './kart-footprint.js';
import {cos,sin} from './sim/math.js';
import {createTrackSample} from './sim/track-core.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
// Includes both chassis at any steering angle. Most pairs exit before track sampling.
const diameter = 5.4;

function applyImpulse(kart, along, across) {
  const oldSpeed = kart.speed - kart.reverseSpeed;
  const c=cos(kart.travelYaw),s=sin(kart.travelYaw);
  // A bump never shoves a flying kart past its own flight ceiling (scaled by its Speed stat).
  const ceiling=kart.flying?Math.max(oldSpeed,flightCeiling(kart)):140;
  const speed=clamp(oldSpeed+along*c+across*s,kart.grounded?-8:0,ceiling);
  kart.speed=Math.max(0,speed);
  kart.reverseSpeed=Math.max(0,-speed);
  // The part of the impulse across the driver's heading is tire slip. Both road
  // axes matter when a kart is broadside or facing back along the circuit.
  kart.bumpVelocityS=(kart.bumpVelocityS||0)+along-(speed-oldSpeed)*c;
  kart.bumpVelocityX+=across-(speed-oldSpeed)*s;
  kart.lateralSpeed=speed*s+kart.bumpVelocityX;
}

// Flying karts are bounded by their Sky Lane corridor, not the road beneath it.
function skyBounds(track, kart) {
  const lane = track.sky?.lanes[kart.skyLane];
  const half = (lane ? lane.width / 2 : 16) - HALF_KART_WIDTH;
  return { min: -half, max: half };
}

// Working storage for one call of resolveKartContacts, created on first use.
let sampleScratch = null;
// The road under each racer, by position in the list. A kart is tested against many neighbours,
// often over several passes, and only moves when one of those tests finds a contact.
let roads = null;
// For each pair, the edge normal that last showed them apart (see separatedOn). It only decides
// which axis is tried first, never the outcome, so it is safe to keep between ticks and races.
let hints = null;
const HINT_STRIDE = 32;
// Within one call a pair that was found clear stays clear until one of the two karts is moved
// by a contact with someone else. Each racer carries a stamp that changes when it is moved; a
// pair remembers the two stamps it was last found clear at.
let stamps = null;
let clearA = null;
let clearB = null;
let stamp = 0;
// The parts of each car within reach of the other, for the pair being resolved.
let nearA = null;
let nearB = null;

function roadUnder(track, kart, slot) {
  const road = roads[slot] || (roads[slot] = { valid: false, s: 0, x: 0, y: 0, curvature: 0 });
  const s = kart.s, x = kart.x;
  if (road.valid && road.s === s && road.x === x && (x !== 0 || 1 / road.x === 1 / x)) return road;
  let sample;
  if (track.sampleInto) {
    if (!sampleScratch) sampleScratch = createTrackSample();
    sample = track.sampleInto(s, x, sampleScratch);
  } else {
    sample = track.sample(s, x);
  }
  road.valid = true;
  road.s = s;
  road.x = x;
  road.y = sample.position.y;
  road.curvature = sample.curvature;
  return road;
}

function resolvePair(track, first, second, slotA, slotB) {
  const a = first.kart, b = second.kart;
  if(a.fall || b.fall)return false;
  const gap = b.s - a.s;
  const ds = gap - Math.round(gap / track.length) * track.length;
  const dx = b.x - a.x;
  if (Math.abs(ds) > diameter / .55 || Math.abs(dx) > diameter) return false;

  const roadA = roadUnder(track, a, slotA), roadB = roadUnder(track, b, slotB);
  const curvatureA = roadA.curvature, curvatureB = roadB.curvature;
  const height=roadB.y+b.y-roadA.y-a.y;
  const shapeA=kartFootprint(a),shapeB=kartFootprint(b);
  const scale = clamp(1 - (a.x + b.x) * (curvatureA + curvatureB) / 4, .55, 1.65);
  const tie=first.id<second.id?1:-1;
  const bodyA=shapeA.body,bodyB=shapeB.body,gapS=ds*scale;
  const hintSlot=slotB<HINT_STRIDE?slotA*HINT_STRIDE+slotB:-1;
  const hint=hintSlot<0?0:hints[hintSlot];
  if(hint && separatedOn(bodyA,bodyB,gapS,dx,hint))return false;
  const envelope=footprintContact(bodyA,bodyB,gapS,dx,tie);
  if(!envelope){
    if(hintSlot>=0)hints[hintSlot]=lastSeparatingAxis();
    return false;
  }
  let contact=null;
  const bandsA=shapeA.bands,bandsB=shapeB.bands;
  // Most parts of two touching cars are nowhere near the other car. Keep the ones that are, in
  // their original order, before any outline is turned to its kart's heading.
  let countA=0,countB=0;
  for(let i=0;i<bandsA.length;i++){
    if(!hullsApart(bandsA[i].circle,shapeB,gapS,dx))nearA[countA++]=bandsA[i];
  }
  for(let j=0;j<bandsB.length;j++){
    if(!hullsApart(shapeA,bandsB[j].circle,gapS,dx))nearB[countB++]=bandsB[j];
  }
  for(let i=0;i<countA;i++){
    const bandA=nearA[i],circleA=bandA.circle,whole=bandA.fixed===bodyA;
    for(let j=0;j<countB;j++){
      const bandB=nearB[j];
      if(bandA.high<=height+bandB.low || bandA.low>=height+bandB.high)continue;
      const hit=whole && bandB.fixed===bodyB ? envelope :
        hullsApart(circleA,bandB.circle,gapS,dx) ? null : footprintContact(bandA.hull,bandB.hull,gapS,dx,tie);
      if(hit && (!contact || hit.depth>contact.depth))contact=hit;
    }
  }
  if(!contact)return false;
  const {depth,normalS,normalX}=contact;

  const forwardPush = depth * normalS / (2 * scale);
  a.s -= forwardPush;
  b.s += forwardPush;
  const boundsA=a.flying?skyBounds(track,a):laneBounds(a,track,HALF_KART_WIDTH,curvatureA);
  const boundsB=b.flying?skyBounds(track,b):laneBounds(b,track,HALF_KART_WIDTH,curvatureB);
  const sideways = depth * normalX;
  const shareA = clamp(a.x - sideways/2, boundsA.min, boundsA.max) - a.x;
  const shareB = clamp(b.x + sideways + shareA, boundsB.min, boundsB.max) - b.x;
  a.x = clamp(a.x + shareB - sideways, boundsA.min, boundsA.max);
  b.x += shareB;

  const va = a.speed - a.reverseSpeed, vb = b.speed - b.reverseSpeed;
  const along = va * cos(a.travelYaw) + (a.bumpVelocityS||0) - vb * cos(b.travelYaw) - (b.bumpVelocityS||0);
  const across = va * sin(a.travelYaw) + a.bumpVelocityX - vb * sin(b.travelYaw) - b.bumpVelocityX;
  const closing = along * normalS + across * normalX;
  if (closing > 0) {
    const impulse = closing * .53; // Equal masses, with a small rebound.
    applyImpulse(a, -impulse * normalS, -impulse * normalX);
    applyImpulse(b, impulse * normalS, impulse * normalX);
    a.kartImpact = Math.max(a.kartImpact, closing);
    b.kartImpact = Math.max(b.kartImpact, closing);
    if (closing > 3) {
      const jolt = -Math.min(1.8, closing * .10);
      a.suspensionVelocity = Math.min(a.suspensionVelocity, jolt);
      b.suspensionVelocity = Math.min(b.suspensionVelocity, jolt);
    }
  }
  return true;
}

export function resolveKartContacts(track, racers) {
  const count = racers.length;
  if (!roads) {
    roads = [];
    hints = [];
    stamps = [];
    clearA = [];
    clearB = [];
    nearA = [];
    nearB = [];
  }
  for (let i = 0; i < count; i++) {
    racers[i].kart.kartImpact = 0;
    if (roads[i]) roads[i].valid = false;
    stamps[i] = ++stamp;
  }
  // A correction in a pack can bring a third kart into contact.
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const slot = j < HINT_STRIDE ? i * HINT_STRIDE + j : -1;
        if (slot >= 0 && clearA[slot] === stamps[i] && clearB[slot] === stamps[j]) continue;
        if (resolvePair(track, racers[i], racers[j], i, j)) {
          changed = true;
          stamps[i] = ++stamp;
          stamps[j] = ++stamp;
        } else if (slot >= 0) {
          clearA[slot] = stamps[i];
          clearB[slot] = stamps[j];
        }
      }
    }
    if (!changed) break;
  }
  nearA.length = nearB.length = 0;
}
