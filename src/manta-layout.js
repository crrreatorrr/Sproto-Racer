// All dimensions are in track metres, with the nose toward negative Z.
export const mantaDriver = {x:0, y:.57, z:.16, scale:.64};
export const mantaAxles = [[-1.32,.435],[1.33,.465]];
export const mantaHalfTrack = 1.055;
export const mantaWheelWidth = .288;
export const mantaTail = 2.02;
export const mantaEnds = [-2.43,2.17];
export const mantaCockpit = {z:.04, length:.81, width:.62};

import {exp,sq} from './sim/math.js';

export function cockpitWidth(z) {
  const offset = (z-mantaCockpit.z)/mantaCockpit.length;
  return mantaCockpit.width*Math.sqrt(Math.max(0,1-offset*offset));
}

const bulge = (distance,radius) => exp(-sq(distance/radius));
function smooth(t){
  t=Math.min(1,Math.max(0,t));
  return t*t*(3-2*t);
}

// Each transverse section runs from the cockpit lip over the fender, around
// the wheel opening and back under the sill. The sculpted waist sets the intake.
export function mantaSection(z) {
  const [nose,tail]=mantaEnds;
  const front=smooth((z-nose)/.90), rear=smooth((tail-z)/.66);
  const frontWheel=bulge(z+1.32,.66), rearWheel=bulge(z-1.33,.72);
  const scoop=bulge(z-.12,.62);
  const width=(1.17+.082*frontWheel+.115*rearWheel-.035*scoop)
    *(1-.103*sq(1-front))*(1-.36*sq(1-rear));
  const inner=cockpitWidth(z);
  const deck=.424+.366*front-.13*(1-rear)+.018*bulge(z+1.25,.73);
  const fairing=.48*bulge(z-1.09,.46)*smooth((z-.53)/.51);
  const innerY=deck+.055*(inner/mantaCockpit.width)+fairing;
  const shoulder=.575+.25*front+.248*frontWheel+.28*rearWheel-.16*(1-rear);
  let arch=.19;
  for(const [axle,r] of mantaAxles){
    const dz=z-axle;
    if(Math.abs(dz)<r+.095){
      const archTop=r+Math.sqrt(Math.max(0,sq(r+.068)-dz*dz));
      arch=Math.max(arch,.19+(archTop-.19)*smooth((r+.095-Math.abs(dz))/.055));
    }
  }
  const edgeTop=Math.max(shoulder-.086,arch+.049);
  const edgeBottom=Math.max(arch,.265-.035*(1-front)+.08*(1-rear));
  const height=edgeTop-edgeBottom;
  const blend=t=>inner+(width-inner)*t;
  return [[inner,innerY],[blend(.26),deck+.028*(inner/mantaCockpit.width)+fairing*.77],[blend(.56),shoulder-.025+fairing*.16],
    [blend(.79),shoulder+.024],[width*.978,edgeTop+.034],[width,edgeTop],
    [width-.015,edgeBottom+.77*height],[width-.028-.19*scoop,edgeBottom+.48*height],
    [width-.04-.235*scoop,edgeBottom+.24*height],[width-.009,edgeBottom+.045*height],
    [width-.018,edgeBottom],[width-.17,edgeBottom-.008]];
}

// Sweep the leading corners rearward so the blades and lamps turn toward
// the viewer at the nose. Physics samples the same plan-view deformation.
export function mantaSweptZ(x,z){
  const t=Math.max(0,Math.min(1,(-1.61-z)/(-1.61-mantaEnds[0])));
  return z+.34*x*x*t*t;
}
