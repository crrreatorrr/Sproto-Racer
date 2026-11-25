import assert from 'node:assert/strict';
import {createKart,stepKart} from '../src/driving.js';
import {resolveKartContacts} from '../src/kart-contact.js';
import {kartFootprint,laneBounds} from '../src/kart-footprint.js';
import {carById} from '../src/roster.js';
import {shapedItemContactTime} from '../src/projectile-contact.js';
import {createSession} from '../src/session.js';

const track={length:500,widthAt:()=>18,edgeAt:()=>8.5,
  sample:()=>({position:{y:0},width:18,curvature:0,grade:0,bank:0,section:0})};
function racer(id,car,s,x,y=0){
  return {id,kart:Object.assign(createKart(carById(car)),{s,x,y})};
}
function contact(ds,dx,height=0,yaw=0){
  const a=racer(0,'ironhide',499,0),b=racer(1,'apex',(499+ds)%500,dx,height);
  a.kart.yaw=yaw;
  resolveKartContacts(track,[a,b]);
  return a.kart.s!==499 || a.kart.x!==0;
}
assert(contact(3.98,0),'front bumper catches a rival across the start line');
assert(!contact(4.02,0),'clearance in front of bumper');
assert(contact(-3.94,0),'contact at tail');
assert(contact(0,3.45,0,Math.PI/2),'broadside contact uses truck length');
assert(!contact(3.88,0,.97),'airborne rival clears front tow hooks');
assert(contact(1.96,0,2.64),'windshield upper frame catches airborne kart');
assert(contact(-2.68,0,2.72),'rear of hardtop catches an airborne kart above the seats');
assert(!contact(-2.72,0,2.72),'airborne kart clears the trimmed rear overhang');
assert(!contact(-2.72,0,2.82),'kart clears the hardtop');
assert(!contact(-3.44,0,1.55),'airborne kart clears open cargo bed');

const truck=racer(0,'ironhide',100,0).kart;
for(const yaw of [-.71,0,.73,Math.PI/2])for(const steer of [-1,0,1]){
  Object.assign(truck,{yaw,steer});
  const body=kartFootprint(truck).body,bounds=laneBounds(truck,track,1);
  assert(Math.abs(bounds.min+body.across.lo+8.5)<.00001);
  assert(Math.abs(bounds.max+body.across.hi-8.5)<.00001);
}
for(const side of [-1,1]){
  Object.assign(truck,{x:side*7,speed:30,steer:side,travelYaw:side*.5,yaw:side*.5});
  for(let i=0;i<35;i++){
    stepKart(truck,{throttle:1,steer:side},track,{},1/60);
    assert(kartFootprint(truck).body.points.every(p=>Math.abs(p.x+truck.x)<=8.5001));
  }
}
Object.assign(truck,{yaw:0,steer:0});
const path={s0:1,s:1,x:0,x0:0,y:.8,y0:.8,roadScale:1};
function shot(start,end,x,y){
  return shapedItemContactTime({s0:start,s:end,x0:x,x,y0:y,y},path,truck,.1,500);
}
assert(shot(493,6,0,1)<1,'swept item crosses lap seam');
assert.equal(shot(493,6,2,1),Infinity,'item misses tires');
assert(shot(1.45,1.45,.95,3.37)<1,'high item catches windshield');
assert(shot(.04,.04,0,3.55)<1,'high item hits the back of the roof');
assert.equal(shot(.04,.04,0,3.65),Infinity,'high item passes over the roof');
assert.equal(shot(499,499,0,2.45),Infinity,'item clears open bed');
assert.equal(shot(3.65,3.65,0,2.2),Infinity,'item over bumper misses');

function divider(s,x,y=0){
  const h={s:100+s,x,width:.2,depth:.2,height:1.3,type:'laneDivider'};
  const course={...track,sections:[{start:0,name:'Straight'}],pads:[],pickups:[],ramps:[],hazards:[h],update(){},reset(){}};
  let hit=false;
  const play={reset(){},update(dt,actors,after){after();},hitHazard(){hit=true;}};
  const session=createSession(course,play,{reset(){},tone(){}});
  const {player}=session.start('test',{car:'ironhide',speed:'cruise'});
  Object.assign(player.kart,{s:100,speed:0,y});
  session.tick({},1/60);
  return hit;
}
assert(divider(2.32,0),'bumper reaches divider');
assert(!divider(2.36,0),'clearance ahead of divider');
assert(!divider(2.32,1.5),'divider clears front corner');
assert(!divider(0,0,1.55),'truck jumps divider');
console.log('Ironhide bumper, tires, windshield, hardtop, cargo bed, drift rails, hazards and projectile checks passed.');
