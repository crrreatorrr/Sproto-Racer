import {HALF_KART_WIDTH} from './driving.js';
import {kartFootprint,footprintContact,laneBounds} from './kart-footprint.js';
import {cos,sin} from './sim/math.js';
import {createTrackSample} from './sim/track-core.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
// Includes both chassis at any steering angle. Most pairs exit before track sampling.
const diameter = 5.4;

function applyImpulse(kart, along, across) {
  const oldSpeed = kart.speed - kart.reverseSpeed;
  const c=cos(kart.travelYaw),s=sin(kart.travelYaw);
  const speed=clamp(oldSpeed+along*c+across*s,kart.grounded?-8:0,140);
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

let sampleScratchA = null;
let sampleScratchB = null;

function resolvePair(track, first, second) {
  const a = first.kart, b = second.kart;
  if(a.fall || b.fall)return false;
  const gap = b.s - a.s;
  const ds = gap - Math.round(gap / track.length) * track.length;
  const dx = b.x - a.x;
  if (Math.abs(ds) > diameter / .55 || Math.abs(dx) > diameter) return false;

  let roadA, roadB;
  if (track.sampleInto) {
    if (!sampleScratchA) {
      sampleScratchA = createTrackSample();
      sampleScratchB = createTrackSample();
    }
    roadA = track.sampleInto(a.s, a.x, sampleScratchA);
    roadB = track.sampleInto(b.s, b.x, sampleScratchB);
  } else {
    roadA = track.sample(a.s, a.x);
    roadB = track.sample(b.s, b.x);
  }
  const height=roadB.position.y+b.y-roadA.position.y-a.y;
  const shapeA=kartFootprint(a),shapeB=kartFootprint(b);
  const scale = clamp(1 - (a.x + b.x) * (roadA.curvature + roadB.curvature) / 4, .55, 1.65);
  const tie=first.id<second.id?1:-1;
  const envelope=footprintContact(shapeA.body,shapeB.body,ds*scale,dx,tie);
  if(!envelope)return false;
  let contact=null;
  for(const bandA of shapeA.bands)for(const bandB of shapeB.bands){
    if(bandA.high<=height+bandB.low || bandA.low>=height+bandB.high)continue;
    const hit=bandA.hull===shapeA.body && bandB.hull===shapeB.body ? envelope :
      footprintContact(bandA.hull,bandB.hull,ds*scale,dx,tie);
    if(hit && (!contact || hit.depth>contact.depth))contact=hit;
  }
  if(!contact)return false;
  const {depth,normalS,normalX}=contact;

  const forwardPush = depth * normalS / (2 * scale);
  a.s -= forwardPush;
  b.s += forwardPush;
  const boundsA=a.flying?skyBounds(track,a):laneBounds(a,track,HALF_KART_WIDTH,roadA.curvature);
  const boundsB=b.flying?skyBounds(track,b):laneBounds(b,track,HALF_KART_WIDTH,roadB.curvature);
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
  for (const {kart} of racers) kart.kartImpact = 0;
  // A correction in a pack can bring a third kart into contact.
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (let i = 0; i < racers.length; i++) {
      for (let j = i + 1; j < racers.length; j++) {
        if (resolvePair(track, racers[i], racers[j])) changed = true;
      }
    }
    if (!changed) break;
  }
}
