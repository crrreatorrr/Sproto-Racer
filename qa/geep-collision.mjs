// Run with node qa/geep-collision.mjs.
import assert from 'node:assert/strict';
import {carById} from '../src/roster.js';
import {createKart,stepKart,HALF_KART_WIDTH} from '../src/driving.js';
import {kartFootprint,laneBounds} from '../src/kart-footprint.js';
import {resolveKartContacts} from '../src/kart-contact.js';
import {createSession} from '../src/session.js';
import {contactTime} from '../src/projectile-contact.js';

const track={length:500,widthAt:()=>18,edgeAt:()=>8.5,
  sample(){return {position:{y:0},width:18,grade:0,bank:0,curvature:0,section:0};}};
function racer(id,s,x,y=0,car=id?'apex':'geep'){
  return {id,kart:Object.assign(createKart(carById(car)),{s,x,y})};
}
function pair(ds,dx,y=0){
  const a=racer(0,100,0),b=racer(1,100+ds,dx,y);
  resolveKartContacts(track,[a,b]);
  return a.kart.s!==100 || a.kart.x!==0;
}
assert(pair(3.69,0),'front lamps touch a stock rear bumper');
assert(pair(-3.55,0),'rear tires touch a following nose');
assert(!pair(3.69,2.4),'clearance alongside the tapered nose');
assert(!pair(3.80,0),'visible bumper gap');
assert(pair(0,2.46),'sidewall to sidewall');
assert(!pair(3.4,0,1.65),'airborne kart clears low nose');
assert(pair(0,0,1.65),'airborne kart catches cockpit');
assert(!pair(0,0,2.3),'clean jump over roll hoop');

const a=racer(0,499,0),b=racer(1,2.66,0);
a.kart.speed=40;b.kart.speed=10;resolveKartContacts(track,[a,b]);
assert(a.kart.kartImpact>25 && b.kart.speed>10,'bumper impact crosses start/finish');

// Head-on impact with the Geep pointing back down the circuit. The bump must
// slow both cars, including the one whose velocity is negative in track space.
const backwards=racer(0,103,0),oncoming=racer(1,100,0);
Object.assign(backwards.kart,{yaw:Math.PI,travelYaw:Math.PI,speed:25});
oncoming.kart.speed=25;
resolveKartContacts(track,[backwards,oncoming]);
assert(backwards.kart.kartImpact>49 && backwards.kart.speed<1 && oncoming.kart.speed<1);
const sideways=racer(0,101,0),follower=racer(1,98.2,0);
sideways.kart.travelYaw=sideways.kart.yaw=Math.PI/2;
follower.kart.speed=30;
resolveKartContacts(track,[sideways,follower]);
assert(sideways.kart.bumpVelocityS>10 && sideways.kart.speed<1,'broadside impulse pushes in direction of impact');

for(const side of [-1,1]){
  const g=racer(0,100,side*7.5).kart;
  Object.assign(g,{speed:43,yaw:side*.6,travelYaw:side*.45,sliding:true,driftDirection:side});
  for(let i=0;i<45;i++){
    stepKart(g,{throttle:1,steer:side,driftHeld:true},track,{},1/60);
    const points=kartFootprint(g).body.points;
    assert(points.every(p=>Math.abs(g.x+p.x)<=8.50001),'drifting tire stays inside rail');
  }
  Object.assign(g,{speed:0,reverseSpeed:4});
  for(let i=0;i<12;i++)stepKart(g,{reverse:1,steer:-side},track,{},1/60);
  const [lower,upper]=[laneBounds(g,track,HALF_KART_WIDTH).min,laneBounds(g,track,HALF_KART_WIDTH).max];
  assert(g.x>=lower && g.x<=upper,'reverse respects rail');
  const against=racer(0,100,side*7.5),inside=racer(1,100,side*5.8);
  resolveKartContacts(track,[against,inside]);
  assert(kartFootprint(against.kart).body.points.every(p=>Math.abs(against.kart.x+p.x)<=8.50001),'pack cannot push Geep through rail');
}

const gapRoad={...track,length:500,width:18,edgeAt:(s,side)=>side>0?Infinity:8.5,
  dropAt:(s,side)=>side>0?{start:90}:null};
const exiting=racer(0,100,8.99).kart;
Object.assign(exiting,{speed:30,yaw:.6,travelYaw:.6});
stepKart(exiting,{},gapRoad,{},1/60);
assert(exiting.fall,'an open track edge allows the Geep to leave');

const g=racer(0,0,0).kart;
const hull=kartFootprint(g).body;
const path={s0:490,s:510,x0:0,x:0,y0:.8,y:.8},target={s0:1,s:1,x0:0,x:0,y0:.8,y:.8};
const t=contactTime(path,target,.7,.4,1.5,500,hull);
assert(t>0 && t<1,'fast projectile sweeps through lap seam');
assert.equal(contactTime({...path,x0:2,x:2},target,.7,.4,1.5,500,hull),Infinity,'shot in adjacent lane misses');

function hazardHit(ds,dx,height=0,type='laneDivider'){
  const hazard= type==='rollingDrum'?{s:100+ds,x:dx,width:4.6,depth:4.6,height:4.6,type}:
    {s:100+ds,x:dx,width:4,depth:1.2,height:1.7,type};
  const course={...track,sections:[{start:0,name:'Straight'}],pads:[],pickups:[],ramps:[],hazards:[hazard],update(){},reset(){}};
  let hit=false;
  const play={reset(){},update(dt,actors,after){after();},hitHazard(){hit=true;}};
  const session=createSession(course,play,{reset(){},tone(){}});
  session.start('test',{car:'geep',speed:'cruise'});
  Object.assign(session.state.player.kart,{s:100,speed:0,y:height});
  session.tick({},1/60);return hit;
}
assert(hazardHit(2.52,0),'bumper reaches divider before the cabin');
assert(!hazardHit(2.54,3.23),'divider clears the beveled corner');
assert(!hazardHit(0,0,2),'jump clears divider');
assert(hazardHit(0,2.9,0,'rollingDrum'),'rolling drum strikes near tire');
assert(!hazardHit(0,3.5,3.9,'rollingDrum'),'jump grazes past curved drum');
console.log('Geep bumper, tire, rail, pack, airborne, hazard and swept projectile checks passed.');
