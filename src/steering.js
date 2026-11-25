import {skipperAxles,skipperHalfTrack} from './skipper-layout.js';
import {cartAxles,cartHalfTrack} from './shopping-cart-layout.js';
import {mantaAxles,mantaHalfTrack} from './manta-layout.js';
import {crestlineAxles,crestlineHalfTrack} from './crestline-layout.js';
import {ironhideAxles,ironhideHalfTrack,ironhideSteeringAngle} from './ironhide-layout.js';
import {geepAxles, geepHalfTrack, geepScale, geepSteeringAngle} from './geep-layout.js';
import {barrageAxles, barrageHalfTrack, barrageSteeringAngle} from './barrage-layout.js';

function axleGeometry(wheelbase,halfTrack,lock){
  return {wheelbase,halfTrack,minRadius:wheelbase/Math.tan(lock)};
}
const stock = axleGeometry(2.13,1.015,.37);
const chassis = {
  'shopping-cart':{...stock,wheelbase:cartAxles[1][0]-cartAxles[0][0],halfTrack:cartHalfTrack},
  skipper:axleGeometry(skipperAxles[1][0]-skipperAxles[0][0],skipperHalfTrack,.39),
  manta:axleGeometry(mantaAxles[1][0]-mantaAxles[0][0],mantaHalfTrack,.36),
  crestline:axleGeometry(crestlineAxles[1][0]-crestlineAxles[0][0],crestlineHalfTrack,.42),
  ironhide:axleGeometry(ironhideAxles[1][0]-ironhideAxles[0][0],ironhideHalfTrack,ironhideSteeringAngle),
  geep:axleGeometry((geepAxles[1][0]-geepAxles[0][0])*geepScale,geepHalfTrack*geepScale,geepSteeringAngle),
  barrage:axleGeometry(barrageAxles[1][0]-barrageAxles[0][0],barrageHalfTrack,barrageSteeringAngle)
};

// Low-speed lock follows the actual chassis. A longer steering ratio at speed
// gives the driver room for small corrections before the tires saturate.
export function fullLockCurvature(kart){
  const g=chassis[kart.tuning?.id]??stock;
  const speed=kart.speed||kart.reverseSpeed||0;
  return (kart.tuning?.turn??1)/(g.minRadius+stock.minRadius*speed/12);
}

export function frontWheelAngle(id,curvature,side){
  const g=chassis[id]??stock;
  return Math.atan2(g.wheelbase*curvature,1-side*g.halfTrack*curvature);
}

// Available lateral acceleration is tuned for the race speeds and corner radii
// of these circuits. Braking shares the contact patch with cornering.
function lateralGrip(kart,brake){
  return 66*kart.tuning.turn*(kart.offroad ? .68 : 1)*(kart.sliding ? 1.40 : 1)
    *Math.sqrt(1-(.78*brake)**2);
}

export function tireTurnRate(kart,demand,brake){
  const wheelRate=kart.speed*fullLockCurvature(kart)*demand;
  return wheelRate/Math.hypot(1,wheelRate*kart.speed/lateralGrip(kart,brake));
}

// Inverse of the same tire curve, so rivals have the same steering limits.
export function demandForRate(kart,rate){
  if(kart.speed<.01)return 0;
  const load=rate*kart.speed/lateralGrip(kart,0);
  return rate/(kart.speed*fullLockCurvature(kart)*Math.sqrt(Math.max(.0001,1-load*load)));
}
