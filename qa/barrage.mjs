// Run with node qa/barrage.mjs.
import assert from 'node:assert/strict';
import {Scene,Vector3} from 'three';
import {createSession} from '../src/session.js';
import {createGameplay} from '../src/gameplay.js';
import {createKart} from '../src/driving.js';
import {resolveKartContacts} from '../src/kart-contact.js';
import {kartFootprint,laneBounds} from '../src/kart-footprint.js';
import {shapedItemContactTime} from '../src/projectile-contact.js';
import {carById} from '../src/roster.js';

const dt=1/60;
const track={length:500,widthAt:()=>18,edgeAt:()=>8.5,sections:[{start:0,name:'Straight'}],
  hazards:[],pads:[],pickups:[],ramps:[],reset(){},update(){},
  sample(s,x=0){return {position:new Vector3(x,0,s),width:18,section:0,grade:0,bank:0,curvature:0,
    forward:new Vector3(0,0,1),right:new Vector3(1,0,0)};}};
function racer(id,s,x,y,car){
  return {id,kart:Object.assign(createKart(carById(car)),{s,x,y})};
}
function touches(ds,dx,height=0,yaw=0){
  const a=racer(0,499,0,0,'barrage'),b=racer(1,(499+ds)%500,dx,height,'apex');
  a.kart.yaw=yaw;
  resolveKartContacts(track,[a,b]);
  return a.kart.s!==499 || a.kart.x!==0;
}
assert(touches(3.99,0),'splitter crosses the lap seam');
assert(!touches(4.04,0),'gap beyond splitter');
assert(!touches(3.99,2.42),'clear beside tapered front corner');
assert(touches(-3.70,0),'contact at tail');
assert(touches(3,1.2,1.10),'jump catches raised blaster pod');
assert(!touches(3.85,0,.92),'jump clears low nose');
assert(touches(-3.69,1.18,1.35),'split wing catches jumper');
assert(!touches(-3.69,1.18,1.52),'jumper clears wing');
assert(touches(0,0,1.6),'driver is inside upper contact band');
assert(!touches(0,0,2.1),'jumper clears driver');
assert(touches(0,3.45,0,Math.PI/2),'broadside projects the nose toward the next lane');

const kart=racer(0,50,0,0,'barrage').kart;
for(const yaw of [0,.72,Math.PI/2,Math.PI])for(const steer of [-1,0,1]){
  Object.assign(kart,{yaw,steer});
  const bounds=laneBounds(kart,track,1),shape=kartFootprint(kart).body;
  assert(Math.abs(bounds.max+shape.across.hi-8.5)<1e-6);
  assert(Math.abs(bounds.min+shape.across.lo+8.5)<1e-6);
}
Object.assign(kart,{yaw:0,steer:0});
const path={s0:1,s:1,x0:0,x:0,y0:.8,y:.8,roadScale:1};
function shot(s0,s,x,y){
  return shapedItemContactTime({s0,s,x0:x,x,y0:y,y},path,kart,.1,track.length);
}
assert(shot(493,6,0,1)<1,'swept shot crosses finish');
assert.equal(shot(493,6,2.2,1),Infinity,'shot clears the side');
assert.equal(shot(3.85,3.85,0,2.30),Infinity,'high shot clears splitter');
assert(shot(1,1,0,2.30)<1,'same shot height catches the driver');

const scene=new Scene(),play=createGameplay(scene,track);
const session=createSession(track,play,{reset(){},tone(){}});
function start(options={}){
  return session.start('test',{car:'barrage',speed:'cruise',...options});
}
function hitsDivider(gap,x,y=0){
  const h={s:100+gap,x,width:.3,depth:.3,height:1.2,type:'laneDivider'};
  track.hazards=[h];
  const {player}=start();
  Object.assign(player.kart,{s:100,speed:0,y});
  session.tick({},dt);track.hazards=[];
  return (player.touchingMask&1)!==0;
}
assert(hitsDivider(2.36,0),'tapered nose reaches a divider');
assert(!hitsDivider(2.36,1.3),'divider misses the nose corner');
assert(!hitsDivider(0,0,1.4),'jump clears divider');

for(const shielded of [false,true]){
  const {player,actors}=start({rivals:'ahead'}),rival=actors[1];
  player.kart.speed=rival.kart.speed=0;
  if(shielded){rival.held=2;play.use(rival,2,actors);}
  const inventory=player.held;
  session.tick({blastersPressed:true},dt);
  const bolts=scene.children[0].children.filter(m=>m.name==='lightbolt');
  assert.equal(bolts.length,2);
  assert(bolts[0].position.x*bolts[1].position.x<0);
  assert.equal(play.fireBlasters(player),false,'cooldown blocks extra shots');
  for(let i=0;i<24 && !rival.notice;i++)play.update(dt,actors);
  if(shielded)for(let i=0;i<24 && rival.shield;i++)play.update(dt,actors);
  assert.equal(rival.notice,shielded?'SHIELD BLOCK':'PULSE HIT');
  assert.equal(rival.kart.stunRemaining>0,!shielded);
  assert.equal(player.kart.stunRemaining,0);
  assert.equal(player.held,inventory,'blasters preserve held pickup');
}
console.log('Barrage body, wing, cockpit, rail, hazard, projectile and blaster checks passed.');
