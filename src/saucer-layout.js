// Track metres, centered on the disc, with the windshield facing negative Z.
export const saucerDriver={x:0,y:.79,z:.035,scale:.74};
export const saucerCockpitRadius=.80;
export const saucerRadius=1.96;
export const saucerLipHeight=1.17;
export const saucerSeatBack={z:.53,bottom:.75,top:1.55,halfWidth:.38};

// The lathed aluminum shell, from the belly to the rolled cockpit lip.
// Changes in radius define the shape used by the contact solver as well.
export const saucerProfile=[
  [0,.29],[.65,.29],[.72,.305],[.77,.345],[.78,.37],
  [1.11,.39],[1.18,.425],[1.20,.46],[1.48,.49],[1.54,.53],
  [1.59,.575],[1.78,.62],[1.89,.67],[1.94,.718],
  [saucerRadius,.755],[saucerRadius,.795],[1.949,.832],
  [1.92,.862],[1.82,.926],[1.64,1.007],[1.42,1.076],
  [1.17,1.129],[.91,1.159],[saucerCockpitRadius,saucerLipHeight]
];

import {sin,cos} from './sim/math.js';

export function screenPoint(t,top=false){
  const angle=t*1.04,r=top?.718:.758;
  return [sin(angle)*r,saucerLipHeight+(top?.14+.118*(1-t*t):.012),-cos(angle)*r];
}
