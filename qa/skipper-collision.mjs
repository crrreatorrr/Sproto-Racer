// Run with node qa/skipper-collision.mjs.
import assert from 'node:assert/strict';
import {createKart,stepKart} from '../src/driving.js';
import {carById} from '../src/roster.js';
import {resolveKartContacts} from '../src/kart-contact.js';
import {kartFootprint,laneBounds} from '../src/kart-footprint.js';
import {shapedItemContactTime} from '../src/projectile-contact.js';
import {createSession} from '../src/session.js';

const road={length:500,widthAt:()=>18,edgeAt:()=>8.5,
  sample:()=>({position:{y:0},width:18,curvature:0,bank:0,grade:0,section:0})};
const boat=carById('skipper');
assert.equal(boat.id,'skipper');
function bump(ds,x,y=0){
  const a={id:0,kart:Object.assign(createKart(boat),{s:499,speed:35})};
  const b={id:1,kart:Object.assign(createKart(carById('apex')),{s:(499+ds)%500,x,y})};
  resolveKartContacts(road,[a,b]);
  return a.kart.s!==499 || a.kart.x!==0;
}
assert(bump(3.84,0),'single bow catches a rival over the start line');
assert(!bump(4.09,0),'visible gap ahead of the stem');
assert(!bump(3.86,1.85),'outside the tapered bow');
assert(bump(-4.05,0),'outboard catches a following bumper');
assert(!bump(-4.15,0),'following bumper clears outboard');
assert(!bump(3.46,0,1.90),'airborne racer clears the foredeck');
assert(bump(0,0,2.72),'airborne racer contacts pilothouse roof');
assert(!bump(0,0,2.85),'clean jump above the roof');

const kart=createKart(boat);
for(const side of [-1,1]){
  Object.assign(kart,{s:100,x:side*7.1,speed:38,steer:side,yaw:side*.62,travelYaw:side*.48});
  for(let i=0;i<32;i++){
    stepKart(kart,{throttle:1,steer:side},road,{},1/60);
    const {min,max}=laneBounds(kart,road,1.25);
    assert(kart.x>=min-1e-6&&kart.x<=max+1e-6,'steering and sideways drift respect rail');
  }
}
Object.assign(kart,{yaw:0,steer:0});
const path={s0:1,s:1,x0:0,x:0,y0:.8,y:.8,roadScale:1};
function shot(from,to,x,y){
  return shapedItemContactTime({s0:from,s:to,x0:x,x,y0:y,y},path,kart,.12,500);
}
assert(Number.isFinite(shot(496,5,0,1.30)),'fast item crosses the lap seam');
assert.equal(shot(496,5,1.65,1),Infinity,'shot passes clear of the outside tires');
assert.equal(shot(3.2,2.9,0,2.75),Infinity,'high item clears the bow');
assert(Number.isFinite(shot(3.2,1,0,2.75)),'same item hits the cabin');
for(const band of kartFootprint(kart).bands)assert(band.hull.axes.length>=2,'every collision band has area');
function obstacle(ds,x,height){
  const track={...road,pads:[],pickups:[],ramps:[],sections:[{start:0,name:'Straight'}],
    hazards:[{s:100+ds,x,width:.08,depth:.08,height,type:'laneDivider'}],reset(){},update(){}};
  let hit=false;
  const session=createSession(track,{reset(){},update(dt,actors,after){after();},hitHazard(){hit=true;}},{tone(){},reset(){}});
  const {player}=session.start('test',{car:'skipper',speed:'cruise'});
  Object.assign(player.kart,{s:100,speed:0});
  session.tick({},1/60);return hit;
}
assert(!obstacle(0,0,.52),'low obstacle passes under the raised keel');
assert(obstacle(0,0,.68),'slightly taller obstacle catches the keel');
assert(obstacle(1.13,1.04,.18),'low obstacle catches the front tire');
assert(!obstacle(0,1.04,.18),'space between the two wheels is clear');
assert(obstacle(2.25,0,1.74),'tip of bow catches a tall divider');
assert(!obstacle(2.25,.70,1.74),'empty corner alongside the bow is clear');
console.log('Skipper bow, wheels, keel, roof, outboard, rails, hazards and swept items passed.');
