import assert from 'node:assert/strict';
import {createKart} from '../src/driving.js';
import {carById} from '../src/roster.js';
import {kartFootprint,laneBounds} from '../src/kart-footprint.js';
import {resolveKartContacts} from '../src/kart-contact.js';
import {shapedItemContactTime} from '../src/projectile-contact.js';
import {createSession} from '../src/session.js';
import {saucerRadius} from '../src/saucer-layout.js';

const car=carById('saucer');
assert.equal(car.id,'saucer');
const road={length:500,widthAt:()=>18,edgeAt:()=>8.5,
  sample:()=>({position:{y:0},width:18,curvature:0,bank:0,grade:0,section:0})};

function collide(ds,x,height=0){
  const a={id:0,kart:Object.assign(createKart(car),{s:499})};
  const b={id:1,kart:Object.assign(createKart(carById('apex')),{s:(499+ds)%500,x,y:height})};
  resolveKartContacts(road,[a,b]);
  return a.kart.s!==499 || a.kart.x!==0;
}
assert(collide(3.68,0),'rim meets a bumper across the lap seam');
assert(!collide(3.76,0),'gap between bumper and rim');
assert(!collide(3.4,2.55),'diagonal gap outside the disc');
assert(!collide(3.55,0,1.10),'airborne bumper clears the sloping perimeter');
assert(collide(0,0,1.7),'driver contact above the rim');
assert(!collide(0,0,2.2),'jump clears the pilot');

const kart=createKart(car);
for(const yaw of [-1,.2,2.65]){
  Object.assign(kart,{yaw,steer:1});
  const bounds=laneBounds(kart,road,1.25);
  assert(Math.abs(bounds.max-(8.5-saucerRadius))<.001);
  assert(Math.abs(bounds.min+bounds.max)<.001);
}
assert(kartFootprint(kart).bands.every(b=>b.low>=.29),'underbody clearance');
const path={s0:0,s:0,x0:0,x:0,y0:.8,y:.8,roadScale:1};
function sweep(x,y){
  return shapedItemContactTime({s0:496,s:504,x0:x,x,y0:y,y},path,kart,.12,road.length);
}
assert(Number.isFinite(sweep(0,.8)),'swept projectile hits across the lap seam');
assert.equal(sweep(1.7,2.1),Infinity,'projectile clears raised shoulder');
assert(Number.isFinite(sweep(0,2.1)),'same projectile hits occupied cockpit');

function hazard(s,x,height){
  const track={...road,pads:[],pickups:[],ramps:[],sections:[{start:0,name:'Straight'}],
    hazards:[{s:100+s,x,width:.08,depth:.08,height,type:'laneDivider'}],update(){},reset(){}};
  let hit=false;
  const session=createSession(track,{reset(){},update(dt,actors,after){after();},hitHazard(){hit=true;}},{reset(){},tone(){}});
  session.start('test',{car:'saucer',speed:'cruise'});
  Object.assign(session.state.player.kart,{s:100,speed:0});
  session.tick({},1/60);
  return hit;
}
assert(!hazard(0,0,.24),'low obstacle fits under the hovering belly');
assert(hazard(0,0,.4),'taller obstacle strikes belly');
assert(hazard(1.90,0,.8),'rim grazes narrow divider');
assert(!hazard(1.50,1.50,.8),'empty corner clears divider');
console.log('Silver Saucer rim, cockpit, hover clearance, rail and swept projectile checks passed.');
