import {fullLockCurvature,tireTurnRate,demandForRate} from './steering.js';
import {hasShapedBody,laneBounds} from './kart-footprint.js';
// SI units throughout. s measures progress along the centre line; x is right
// of it. Both yaw and travelYaw are relative to the local road tangent.
export const CRUISE_SPEED = 55;
const SPEED_TIERS = [1, 1.2, 1.4];
const STRAIGHT_SPEED_GAIN = .18;
export const GRAVITY = 20;
export const HALF_KART_WIDTH = 0.88;
export const HALF_KART_LENGTH = 1.45;
export const KART_CONTACT_HEIGHT = 1.4;
export const HARD_WALL_IMPACT = 0.65;
export const HIT_STUN_SECONDS = 0.9;
const MIN_DRIFT_SPEED = 5;
const HOP_SPEED = 6.25;
const HOP_GRAVITY = 34;
const NEUTRAL_SLIDE_TURN = .69;
const INSIDE_STEER = 1.48;
const OUTSIDE_STEER = .98;

export function driftBoostReady(boost) {
  return !boost.chainClosed && boost.meter + 1e-9 >= 0.70;
}

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const approach = (current, target, rate, dt) =>
  target + (current - target) * Math.exp(-rate * dt);

// Inverse of the player's steering curve, used by rivals to follow a racing line.
export function steerForTurn(kart,rate) {
  const demand=demandForRate(kart,rate);
  if(!kart.sliding)return clamp(demand,-1,1);
  const side=kart.driftDirection;
  const extra=demand*side-NEUTRAL_SLIDE_TURN;
  return side*clamp(extra/(extra>0?INSIDE_STEER:OUTSIDE_STEER),-1,1);
}

export function createKart(tuning = {speed:1, accel:1, turn:1}) {
  return {
    tuning, s: 0, x: 0, speed: 0, yaw: 0, travelYaw: 0, lateralSpeed: 0, fall:null, rescues:0,
    y: 0, vy: 0, grounded: true, airtime: 0, lastAirTime: 0, landed: false,
    sliding: false, slideId: 0, driftDirection: 0, wallImpact: 0, kartImpact:0, bumpVelocityX:0, bumpVelocityS:0,
    reverseSpeed: 0, steer: 0, roll: 0, pitch: 0, offroad: false, straightRun:0,
    pendingDrift: false, pendingDirection: 0, airPivot: 0, cornerRate:0, slipAngle:0,
    hopping:false, hopLift:0, suspension:0, suspensionVelocity:0,
    stunRemaining:0, hitRollSide:1,
    wallCooldown: 0, rampContact: false, driftWasHeld: false, regripTime: 0, boostRelease: false,
  };
}

function leaveSlide(kart) {
  kart.sliding = false;
  kart.driftDirection = 0;
  kart.regripTime = 0;
}

export function stunKart(kart,side) {
  leaveSlide(kart);
  kart.stunRemaining=HIT_STUN_SECONDS;
  kart.hitRollSide=side;
  kart.speed*=.35;
  kart.reverseSpeed*=.35;
  kart.straightRun=0;
  kart.pendingDrift=false;
  kart.pendingDirection=0;
  kart.boostRelease=false;
  kart.slipAngle=0;
  kart.cornerRate=0;
  kart.airPivot=0;
}

function takeOff(kart, impulse) {
  if (kart.grounded) {
    kart.airtime = 0;
    kart.airFloorY = null;
    kart.takeoffPitch = kart.pitch;
    kart.takeoffRoll = kart.roll;
  }
  kart.grounded = false;
  kart.vy = Math.max(kart.vy, impulse);
  kart.y = Math.max(kart.y, 0.001);
  leaveSlide(kart);
}

export function springJump(kart){
  if(!kart.grounded || kart.stunRemaining>0)return false;
  kart.hopping=false;
  kart.pendingDrift=false;
  kart.pendingDirection=0;
  takeOff(kart,10+kart.speed*Math.sin(kart.pitch));
  return true;
}

function stepVertical(kart, input, steer, dt, groundDelta) {
  if (kart.grounded) return;
  kart.airtime += dt;
  const gravity=kart.hopping?HOP_GRAVITY:GRAVITY;
  kart.y += kart.vy * dt - 0.5 * gravity * dt * dt - groundDelta;
  kart.vy -= gravity * dt;
  if (kart.y > 0) return;

  kart.y = 0;
  const impactSpeed=Math.max(0,groundDelta/dt-kart.vy);
  kart.suspensionVelocity=-clamp(impactSpeed*.43,.8,3.4);
  kart.hopping=false;
  kart.vy = 0;
  kart.grounded = true;
  kart.landed = true;
  kart.lastAirTime = kart.airtime;
  kart.airtime = 0;
  // The grounded tire update takes up any remaining air-brake angle.

  const direction = kart.pendingDirection || (Math.abs(steer) > 0.12 ? Math.sign(steer) : 0);
  if (kart.pendingDrift && input.driftHeld && direction && kart.speed >= MIN_DRIFT_SPEED) {
    kart.sliding = true;
    kart.slideId++;
    kart.driftDirection = direction;
  }
  kart.pendingDrift = false;
  kart.pendingDirection = 0;
}

export function launchFromRamp(kart,ramp,input,steer) {
  if (ramp > 0 && kart.y < 0.65 && kart.speed > 4) {
    if (!kart.pendingDrift) {
      kart.pendingDrift = !!input.driftHeld;
      kart.pendingDirection = kart.driftDirection || (Math.abs(steer) > 0.12 ? Math.sign(steer) : 0);
    }
    const lipBonus = !kart.grounded && kart.vy > 0 ? Math.min(1.65, kart.vy * 0.60) : 0;
    kart.hopping=false;
    takeOff(kart, ramp + lipBonus);
  }
}

// Subtract the moving road frame's full rotation to preserve the kart's world
// heading when the driver holds a straight line, including while reversing.
function advanceKart(kart,road,signedSpeed,dt){
  const curve=road.curvature||0, radius=clamp(1-kart.x*curve,.55,1.65);
  const midpointYaw=kart.travelYaw-.5*curve*signedSpeed*Math.cos(kart.travelYaw)*dt/radius;
  const ds=(signedSpeed*Math.cos(midpointYaw)+(kart.bumpVelocityS||0))*dt/radius;
  kart.s+=ds;
  kart.lateralSpeed=signedSpeed*Math.sin(midpointYaw)+kart.bumpVelocityX;
  kart.x+=kart.lateralSpeed*dt;
  kart.travelYaw-=curve*ds;
  kart.yaw-=curve*ds;

  const bounds=laneBounds(kart,road,HALF_KART_WIDTH);
  if(kart.x>=bounds.min && kart.x<=bounds.max){
    if(Math.abs(kart.x)>=(road.widthAt?.(kart.s)??road.width??16)/2){
      const side=Math.sign(kart.x), gap=road.dropAt?.(kart.s,side);
      if(gap){
        kart.fall={time:0,exitS:kart.s,respawnS:Math.floor(kart.s/road.length)*road.length+gap.start-10,
          along:ds/dt,across:side*Math.max(3,side*kart.lateralSpeed)};
        kart.grounded=false;kart.hopping=false;kart.pendingDrift=false;
        if(kart.y<=0)kart.vy=0;
        leaveSlide(kart);
      }
    }
    return;
  }
  const side=kart.x>bounds.max?1:-1;
  kart.x=side>0?bounds.max:bounds.min;
  if(kart.lateralSpeed*side<=0)return;
  const severity=clamp(Math.abs(kart.lateralSpeed)/18,0,1);
  if(kart.wallCooldown===0 && severity>.15){
    kart.wallImpact=Math.max(kart.wallImpact,severity);
    const retain=1-.42*severity*severity;
    kart.speed*=retain;kart.reverseSpeed*=retain;
    kart.suspensionVelocity=-Math.max(.65,2.4*severity);
    kart.wallCooldown=.3;
  }
  if(signedSpeed*Math.sin(kart.travelYaw)*side>0){
    const rebound=Math.atan2(-.12*Math.sin(kart.travelYaw),Math.cos(kart.travelYaw));
    const change=rebound-kart.travelYaw;
    kart.travelYaw+=Math.atan2(Math.sin(change),Math.cos(change));
  }
  if(kart.bumpVelocityX*side>0)kart.bumpVelocityX=0;
  kart.lateralSpeed=(kart.speed-kart.reverseSpeed)*Math.sin(kart.travelYaw)+kart.bumpVelocityX;
}

function stepFall(kart,road,dt){
  const f=kart.fall;
  f.time+=dt;
  const drag=Math.exp(-1.9*f.time),oldFloor=road.heightAt?.(kart.s,kart.x)??0;
  kart.s+=f.along*drag*dt;kart.x+=f.across*drag*dt;
  kart.y+=oldFloor-(road.heightAt?.(kart.s,kart.x)??0)+kart.vy*dt-.5*GRAVITY*dt*dt;
  kart.vy-=GRAVITY*dt;
  kart.roll+=Math.sign(f.across)*.75*dt;
  if(f.time>=1.25){
    const rescues=kart.rescues+1;
    Object.assign(kart,createKart(kart.tuning),{s:f.respawnS,speed:8,rescues});
  }
}

function driveFrame(kart, input, road, boost, steer, throttle, brake, dt) {
  const width = Math.max(3, road.width ?? 16);
  const curvature = road.curvature || 0;
  const gradeAngle = Math.atan(road.grade || 0);
  const bank = clamp(road.bank || 0, -0.8, 0.8);
  const tier = clamp(Math.trunc(boost.tier || 0), 0, 2);
  const topSpeed = CRUISE_SPEED * kart.tuning.speed * (SPEED_TIERS[tier]+STRAIGHT_SPEED_GAIN*kart.straightRun)
    * clamp(boost.speedScale ?? 1, 0.1, 2);
  const edgeDepth = Math.abs(kart.x) - (width / 2 - HALF_KART_WIDTH - Math.min(1.0, width * 0.06));
  kart.offroad = edgeDepth > 0;
  kart.wallCooldown = Math.max(0, kart.wallCooldown - dt);
  const bumpDecay=Math.exp(-5*dt);
  kart.bumpVelocityX *= bumpDecay;
  kart.bumpVelocityS = (kart.bumpVelocityS||0)*bumpDecay;
  kart.suspensionVelocity+=(-240*kart.suspension-18*kart.suspensionVelocity)*dt;
  kart.suspension+=kart.suspensionVelocity*dt;

  // Pulling back at walking speed engages reverse. Throttle first arrests
  // backward motion, so the chase view and kart never flip at a gear change.
  const reversing=kart.grounded && kart.speed<.8 && (input.reverse||0)>.25 && throttle<.15;
  if(reversing || kart.reverseSpeed>0){
    kart.straightRun=0;
    const target=reversing?5*(input.reverse||0):0;
    const change=(reversing?8:18)*dt;
    kart.reverseSpeed+=clamp(target-kart.reverseSpeed,-change,change);
    kart.speed=0;
    kart.steer=approach(kart.steer,steer,8,dt);
    kart.travelYaw-=kart.steer*kart.reverseSpeed*fullLockCurvature(kart)*dt;
    advanceKart(kart,road,-kart.reverseSpeed,dt);
    kart.yaw=approach(kart.yaw,kart.travelYaw,9,dt);
    return;
  }

  const groundedBrake = kart.grounded ? brake : 0;
  const speedRatio = kart.speed / topSpeed;
  // Extra boost thrust is available during both acceleration and a launch.
  // Smooth drag on tier loss lets the player feel the transition out of turbo.
  const ignitionThrust=tier?24*(boost.ignition||0):0;
  const driveThrottle=throttle*(1-.65*groundedBrake);
  const thrust = (28 + tier * 14 + ignitionThrust) * kart.tuning.accel * driveThrottle * Math.max(0, 1 - speedRatio ** 4);
  const rollingDrag = 0.6 + (1 - throttle) * (1.1 + 0.035 * kart.speed);
  const engineDrag = Math.max(0, kart.speed - topSpeed) * 2.8;
  const gravel = kart.offroad && kart.grounded ? 3.0 + kart.speed * 0.10 : 0;
  const gravity = kart.grounded ? 7 * Math.sin(gradeAngle) : 0;
  const accel = thrust - rollingDrag - engineDrag - gravel - 41 * groundedBrake - gravity;
  kart.speed = clamp(kart.speed + accel * dt, 0, 100);

  const pace=clamp(kart.speed/CRUISE_SPEED,0,1);
  const unwinding=kart.steer*steer<0 || Math.abs(steer)<Math.abs(kart.steer);
  const rackStep=(unwinding?9:7-2*pace)*dt;
  kart.steer+=clamp(steer-kart.steer,-rackStep,rackStep);
  // Entering a turn rotates the nose; the velocity vector follows a shallower
  // arc under countersteer. This gives the player room to widen an active slide.
  const inside=kart.steer*kart.driftDirection;
  let turn = kart.steer;
  if (kart.sliding) turn = kart.driftDirection*(NEUTRAL_SLIDE_TURN+
    inside*(inside>0?INSIDE_STEER:OUTSIDE_STEER));

  if (!kart.grounded && brake > 0.35 && throttle < 0.25) {
    // A quarter of the brake-turn changes the airborne line. The remainder
    // points the nose toward the exit while momentum carries the kart forward.
    const rotation=kart.steer*brake*(input.reverse>.35 ? 3.2 : 2.45)*dt;
    const pivot=clamp(kart.airPivot+rotation*.75,-.92,.92);
    kart.travelYaw+=(pivot-kart.airPivot)/3;
    kart.airPivot=pivot;
  }
  const tireRate=tireTurnRate(kart,turn,groundedBrake);
  const targetRate=kart.grounded?tireRate:tireRate*(kart.hopping ? .42 : .12);
  const response=kart.sliding?8:kart.grounded?16-6*pace:11;
  kart.cornerRate=approach(kart.cornerRate,targetRate,response,dt);
  const lateralAccel=kart.speed*kart.cornerRate;
  if(kart.grounded){
    const tireLoad=clamp(Math.abs(lateralAccel)/66,0,1);
    const scrub=(kart.sliding ? .032 : .052)*Math.abs(lateralAccel)*tireLoad;
    kart.speed=Math.max(0,kart.speed-scrub*dt);
    // Transfer airborne rotation into the new line as the tires regain grip.
    const pivot=kart.airPivot;
    kart.airPivot=approach(pivot,0,9,dt);
    kart.travelYaw+=pivot-kart.airPivot;
  }
  // Rear grip returns progressively on exit. Some of the angle the player
  // held in the slide carries into the exit line before the wheels hook up.
  const priorSlip=kart.slipAngle;
  const slipTarget=kart.sliding ? kart.driftDirection*(.45+.20*inside)
    : kart.hopping && input.driftHeld ? kart.pendingDirection*.30 : 0;
  kart.slipAngle=approach(priorSlip,slipTarget,kart.sliding?9:12,dt);
  const exitRotation=kart.grounded&&!kart.sliding?(priorSlip-kart.slipAngle)*.38:0;
  const previousYaw=kart.travelYaw;
  const previousS=kart.s,previousX=kart.x;
  kart.travelYaw+=kart.cornerRate*dt+exitRotation;
  advanceKart(kart,road,kart.speed,dt);
  if(kart.fall)return;

  // travelYaw is relative to the road. Add the road's rotation to measure
  // the actual driven line.
  const headingRate=Math.abs(kart.travelYaw-previousYaw+curvature*(kart.s-previousS))/dt;
  const onPower=kart.grounded && !kart.sliding && !kart.offroad && kart.speed>10 && brake<.08;
  const straightTarget=onPower ? Math.min(
    clamp((throttle-.65)/.30,0,1),
    clamp((.52-Math.abs(kart.steer))/.34,0,1),
    clamp((.40-headingRate)/.26,0,1)
  ) : 0;
  const rate=straightTarget>kart.straightRun ? .32 : 1.5;
  kart.straightRun+=clamp(straightTarget-kart.straightRun,-rate*dt,rate*dt);

  let groundDelta = 0;
  if (!kart.grounded && road.heightAt) {
    const floorY = road.heightAt(kart.s, kart.x);
    groundDelta = floorY - (kart.airFloorY ?? road.heightAt(previousS, previousX));
    kart.airFloorY = floorY;
  }
  stepVertical(kart, input, steer, dt, groundDelta);
  if(road.crossedRamp){
    const impulse=road.crossedRamp(previousS,previousX,kart.s,kart.x);
    if(impulse)launchFromRamp(kart,impulse,input,steer);
  }
  kart.hopLift=kart.hopping?clamp(kart.y,0,.8):approach(kart.hopLift,0,24,dt);
  const nose = kart.travelYaw + kart.slipAngle + kart.airPivot + (kart.grounded&&!kart.sliding?clamp(lateralAccel*.0017,-.11,.11):0);
  kart.yaw = approach(kart.yaw, nose, 17, dt);
  if(hasShapedBody(kart) && Math.abs(kart.x)>width/2-3.5){
    const rotated=laneBounds(kart,road,HALF_KART_WIDTH);
    kart.x=clamp(kart.x,rotated.min,rotated.max);
  }
  const rollTarget=kart.grounded ? bank + clamp(lateralAccel*.00135,-.105,.105) : kart.takeoffRoll * Math.exp(-3*kart.airtime);
  const pitchTarget=kart.grounded ? gradeAngle : kart.takeoffPitch * Math.exp(-3*kart.airtime) + clamp(kart.vy * 0.015, -0.16, 0.16);
  kart.roll = approach(kart.roll, rollTarget, 7, dt);
  kart.pitch = approach(kart.pitch, pitchTarget, 7, dt);
}

export function stepKart(kart, input = {}, road = {}, boost = {}, dt = 1 / 60) {
  kart.landed = false;
  kart.wallImpact = 0;
  const duration = clamp(dt, 0, 0.12);
  if (!duration) return kart;
  if(kart.fall){stepFall(kart,road,duration);return kart;}
  // Keep integrating the road and airborne trajectory while the controls are locked.
  const wasHeld=kart.driftWasHeld;
  kart.driftWasHeld=!!input.driftHeld;
  if(kart.stunRemaining>0)input={};
  const steer = clamp(input.steer || 0, -1, 1);
  const throttle = clamp(input.throttle || 0, 0, 1);
  const brake = clamp(input.brake || 0, 0, 1);
  const held=!!input.driftHeld;
  const pressed=input.driftPressed || (held && !wasHeld);
  const released=input.driftReleased || (!held && wasHeld);
  kart.boostRelease=false;
  // Steer chooses the slide, and countersteer adjusts its radius until exit.
  const across=Math.sin(kart.travelYaw);
  const direction=Math.abs(steer)>.12 ? Math.sign(steer)
    : Math.abs(kart.steer)>.12 ? Math.sign(kart.steer)
    : Math.abs(across)>.09 ? Math.sign(across) : 0;
  if(kart.sliding){
    if(kart.speed<MIN_DRIFT_SPEED || (pressed && kart.regripTime>0 && boost.chainClosed))leaveSlide(kart);
    else if(released){
      kart.boostRelease=true;
      if(driftBoostReady(boost))kart.regripTime=.20;
      else leaveSlide(kart);
    }
    if(held)kart.regripTime=0;
    else if(kart.sliding){
      kart.regripTime=Math.max(0,kart.regripTime-duration);
      if(!kart.regripTime)leaveSlide(kart);
    }
  }
  if(!kart.sliding && pressed){
    kart.pendingDrift=true;
    kart.pendingDirection=direction;
    if(kart.grounded && !kart.reverseSpeed){
      const along=kart.speed*Math.cos(kart.travelYaw)*(road.grade||0);
      const across=kart.speed*Math.sin(kart.travelYaw)*Math.tan(road.bank||0);
      takeOff(kart,HOP_SPEED);
      // Spring away from the moving contact plane, including on the uphill helix.
      kart.vy=HOP_SPEED+along+across;
      kart.hopping=true;
      kart.suspensionVelocity=-1.8;
    }
  }
  const ramp=road.ramp||0;
  if(ramp&&!kart.rampContact)launchFromRamp(kart,ramp,input,steer);
  kart.rampContact=ramp>0;
  const slices = Math.ceil(duration * 120);
  for (let i = 0; i < slices; i++) {
    driveFrame(kart, input, road, boost, steer, throttle, brake, duration / slices);
    if(kart.fall)break;
  }
  if (kart.wallImpact > HARD_WALL_IMPACT) {
    leaveSlide(kart);
    kart.pendingDrift = false;
    kart.pendingDirection = 0;
    kart.boostRelease = false;
    kart.slipAngle=0;
    kart.cornerRate=0;
    kart.straightRun=0;
  }
  return kart;
}
