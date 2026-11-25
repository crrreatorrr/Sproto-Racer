// Run with node qa/manta.mjs.
import assert from 'node:assert/strict';
import {carById} from '../src/roster.js';
import {createKart} from '../src/driving.js';
import {resolveKartContacts} from '../src/kart-contact.js';
import {kartFootprint,laneBounds} from '../src/kart-footprint.js';
import {shapedItemContactTime} from '../src/projectile-contact.js';
import {createSession} from '../src/session.js';

const road={length:500,widthAt:()=>18,edgeAt:()=>8.5,
  sample:()=>({position:{y:0},width:18,curvature:0,bank:0,grade:0,section:0})};
const car=carById('manta');
assert.equal(car.id,'manta');
function strikes(ds,x,y=0){
  const a={id:0,kart:Object.assign(createKart(car),{s:499,speed:30})};
  const b={id:1,kart:Object.assign(createKart(carById('apex')),{s:(499+ds)%500,x,y})};
  resolveKartContacts(road,[a,b]);
  return a.kart.s!==499 || a.kart.x!==0;
}
assert(strikes(4.18,0),'nose contacts a bumper across the lap seam');
assert(!strikes(4.24,0),'visible gap between bumpers');
assert(!strikes(4.09,2.15),'tapered corner misses an adjacent bumper');
assert(!strikes(3.80,0,1.20),'airborne kart clears the low hood');
assert(strikes(0,0,1.40),'airborne kart strikes the occupied cockpit');
assert(!strikes(0,0,1.78),'clean jump over the driver');

const k=createKart(car);
for(const yaw of [-1.1,0,.75])for(const steer of [-1,0,1]){
  Object.assign(k,{yaw,steer});
  const {body}=kartFootprint(k),bounds=laneBounds(k,road,1.25);
  for(const p of body.points){
    assert(bounds.max+p.x<=8.50001 && bounds.min+p.x>=-8.50001,'rotated chassis stays inside rails');
  }
}
Object.assign(k,{steer:0,yaw:0});
const target={s0:0,s:0,x0:0,x:0,y0:.8,y:.8,roadScale:1};
function shot(from,to,y){
  return shapedItemContactTime({s0:from,s:to,x0:0,x:0,y0:y,y},target,k,.12,road.length);
}
assert(Number.isFinite(shot(496,504,.40)),'fast shot crosses the lap seam and hits');
assert.equal(shot(3.2,2.1,2.05),Infinity,'high shot clears the nose');
assert(Number.isFinite(shot(3.2,-1,2.05)),'same shot catches the driver');

function divider(ds,x,y){
  const track={...road,pads:[],pickups:[],ramps:[],sections:[{start:0,name:'Straight'}],
    hazards:[{s:100+ds,x,width:.26,depth:.26,height:.6,type:'laneDivider'}],update(){},reset(){}};
  let hit=false;
  const session=createSession(track,{reset(){},update(dt,actors,after){after();},hitHazard(){hit=true;}},{reset(){},tone(){}});
  session.start('test',{car:'manta',speed:'cruise'});
  Object.assign(session.state.player.kart,{s:100,speed:0,y});
  session.tick({},1/60);
  return hit;
}
assert(divider(2.40,0,0),'splitter reaches a low hazard');
assert(!divider(2.40,1.2,0),'obstacle outside the swept corner misses');
assert(!divider(0,0,1.3),'jump clears the divider');
console.log('Manta bumper, cockpit, rail, swept projectile and hazard checks passed.');
