// Run once with node qa/projectiles.mjs. Flat lanes give each shot a known range.
import assert from 'node:assert/strict';
import {Scene,Vector3} from 'three';
import {createGameplay} from '../src/gameplay.js';
import {createKart} from '../src/driving.js';
import {createBoost} from '../src/boost.js';
import {ITEMS,startPickup,settlePickup,pickupPreview,PICKUP_SPIN_SECONDS,pickupWeights} from '../src/items.js';
import {contactTime} from '../src/projectile-contact.js';

const dt=1/60;
function fixture(positions=[100,118]){
  const track={length:500,widthAt:()=>34,pads:[],pickups:[],hazards:[],
    sample(s,x=0){return {position:new Vector3(x,0,s),curvature:0,width:34,forward:new Vector3(0,0,1),right:new Vector3(1,0,0)};}};
  const scene=new Scene(),game=createGameplay(scene,track);
  const racers=positions.map((s,id)=>({id,isPlayer:!id,finish:null,kart:{...createKart(),s},boost:createBoost(),held:null,charges:0}));
  const [a,b]=racers;
  function fire(i,owner=a,back=false){owner.held=i;owner.charges=ITEMS[i].charges??1;return game.use(owner,i,racers,back);}
  function tick(n=1){for(let i=0;i<n;i++)game.update(dt,racers);}
  function until(predicate,frames=360){for(let i=0;i<frames&&!predicate();i++)tick();assert(predicate(),'expected event within '+frames+' ticks');}
  const models=name=>scene.children[0].children.filter(m=>m.name===name&&m.visible);
  return {a,b,racers,fire,tick,until,models,game,track};
}
let passed=0;
function check(name,body){try{body();passed++;console.log('PASS',name);}catch(error){console.error('FAIL',name);throw error;}}
for(const [slot,offset,label] of [[1,16,'BUMPER HIT'],[3,-3.5,'SLIPPERY!'],[5,18,'CURSOR HIT'],
  [6,5,'BASS BUMP'],[10,12,'DISC HIT'],[11,20,'CONFETTI HIT'],[12,24,'JELLY BURST'],
  [13,16,'RING HIT'],[14,-3.8,'STATIC SHOCK'],[18,50,'RELAY HIT']]){
  check(ITEMS[slot].name+' hits rivals, spares owner and respects one-use shield',()=>{
    for(const shield of [false,true]){
      const f=fixture([100,100+offset]);if(slot===10)f.b.kart.x=2;
      if(shield)f.fire(2,f.b);
      assert(f.fire(slot));f.until(()=>f.b.notice===(shield?'SHIELD BLOCK':label));
      assert.equal(f.a.kart.stunRemaining,0);assert.equal(f.b.kart.stunRemaining>0,!shield);
      if(shield){assert.equal(f.b.shield,0);assert.equal(f.models('bubble').length,0);}
    }
  });
}
check('Pop-Up Box can be shielded, shaken off, or left to explode',()=>{
  for(const result of ['shield','disarm','explode']){
    const f=fixture([100,96.3]);if(result==='shield')f.fire(2,f.b);
    f.fire(4);f.tick();
    if(result==='shield'){assert.equal(f.b.notice,'SHIELD BLOCK');continue;}
    assert.equal(f.b.notice,'HOP TWICE!');
    if(result==='disarm'){for(let i=0;i<2;i++){f.b.kart.grounded=false;f.tick();f.b.kart.grounded=true;f.tick();}assert.equal(f.b.notice,'BOX SHAKEN OFF');}
    else f.until(()=>f.b.notice==='BOX POP');
  }
});
for(const slot of [1,10,11])check(ITEMS[slot].name+' rear fire reaches follower and misses adjacent lane',()=>{
  const f=fixture([100,84,117]);if(slot===10)f.b.kart.x=-2.3;f.fire(slot,f.a,true);
  f.until(()=>f.b.kart.stunRemaining>0);assert.equal(f.racers[2].kart.stunRemaining,0);
  const miss=fixture([100,116]);miss.b.kart.x=-12;miss.fire(slot);miss.tick(75);assert.equal(miss.b.kart.stunRemaining,0);
});
check('Homing picks nearest and Relay picks frontmost within range',()=>{
  for(const [slot,index] of [[5,1],[18,2]]){
    const f=fixture([100,125,190,405]);assert(f.fire(slot));f.until(()=>f.racers[index].kart.stunRemaining>0);
    assert.equal(f.racers[index===1?2:1].kart.stunRemaining,0);assert.equal(f.racers[3].kart.stunRemaining,0);
  }
});
check('Unguided shots spend the pickup and can hit a rival who crosses their path',()=>{
  for(const slot of [5,18]){
    const f=fixture([100,70]);
    assert(f.fire(slot));assert.equal(f.a.held,null);assert.equal(f.a.charges,0);
    assert.equal(f.models(ITEMS[slot].model).length,1);
    f.tick();assert.equal(f.b.incoming,'');
    f.b.kart.s=118;
    f.until(()=>f.b.kart.stunRemaining>0);
  }
});
check('A solo driver spends each targeting item in a race and can reuse it in Test Drive',()=>{
  for(const slot of [5,7,17,18])for(const unlimited of [false,true]){
    const f=fixture([100]);f.a.unlimited=unlimited;
    assert(f.fire(slot));assert.equal(f.a.held,unlimited?slot:null);assert.equal(f.a.charges,unlimited?1:0);
    if(unlimited)assert(f.game.use(f.a,slot,f.racers));
    f.tick(440);assert.equal(f.a.boost.reserve,0);assert.equal(f.a.kart.speed,0);
    assert.equal(f.models(ITEMS[slot].model).length,0);
  }
});
check('Airborne ball clears ground rivals and traps, lands, then hits downrange',()=>{
  const f=fixture([100,110,170]);Object.assign(f.a.kart,{grounded:false,y:7,vy:1});f.fire(3,f.b);f.fire(1);
  assert(f.models('ball')[0].position.y>7);f.tick(15);assert.equal(f.b.kart.stunRemaining,0);assert.equal(f.models('slip').length,1);
  f.until(()=>f.racers[2].kart.stunRemaining>0);assert.equal(f.a.kart.stunRemaining,0);
});
check('A crossing projectile hits the first rival along its path across the lap seam',()=>{
  const f=fixture([495,508,502]);f.fire(1);f.game.update(.25,f.racers);
  assert.equal(f.racers[2].notice,'BUMPER HIT');assert.equal(f.racers[1].kart.stunRemaining,0);
  const path={s0:490,s:510,x0:0,x:0,y0:1,y:1},target={s0:3,s:1,x0:0,x:0,y0:1,y:1};
  assert(Math.abs(contactTime(path,target,2,1,1,500)-.5)<1e-9);
  assert.equal(contactTime(path,{...target,y0:7,y:7},2,1,1,500),Infinity);
});
check('Solid divider blocks a low shot, an open lane or high shot clears it',()=>{
  for(const [x,y,blocked] of [[0,0,true],[6,0,false],[0,6,false]]){
    const f=fixture([100,125]);f.track.hazards.push({s:112,x:0,height:1.7,depth:1.2,width:4});
    for(const a of f.racers)Object.assign(a.kart,{x,y,grounded:!y});
    f.fire(1);f.tick(35);assert.equal(f.b.kart.stunRemaining>0,!blocked);
  }
});
check('Ricochet Disc rebounds off a rail, Return Ring catches a rival on its way home',()=>{
  const f=fixture([100,130]);Object.assign(f.a.kart,{x:15,yaw:.7});f.b.kart.x=7;f.fire(10);
  let max=-Infinity;for(let i=0;i<28;i++){f.tick();const m=f.models('disc')[0];if(m)max=Math.max(max,m.position.x);}
  assert(max>15);assert(f.b.kart.stunRemaining>0);
  const r=fixture([100,115]);r.b.kart.x=10;r.fire(13);r.tick(53);r.b.kart.x=0;r.until(()=>r.b.kart.stunRemaining>0);r.tick(100);assert.equal(r.models('ring').length,0);
});
check('Confetti spread counts one hit per rival, even with overlapping pellets',()=>{
  const f=fixture([100,106]);f.fire(2,f.b);f.fire(11);assert.equal(f.models('bolt').length,3);f.tick(20);
  assert.equal(f.b.shield,0);assert.equal(f.b.kart.stunRemaining,0);
});
check('Ball intercepts opposing traps and a head-on cursor; friendly traps survive',()=>{
  for(const slot of [3,4,14]){
    const f=fixture([100,118]);f.fire(slot,f.b);f.fire(1);f.tick(35);
    assert.equal(f.models(ITEMS[slot].model).length,0);assert.equal(f.b.kart.stunRemaining,0);
  }
  const f=fixture([100,130]);f.fire(5);f.fire(1,f.b,true);f.tick(70);assert.equal(f.b.kart.stunRemaining,0);assert.equal(f.a.kart.stunRemaining,0);
  const friendly=fixture([100]);friendly.fire(3);friendly.fire(1,friendly.a,true);friendly.tick(5);assert.equal(friendly.models('slip').length,1);
});
check('A Broom Bot intercepts a shot, then protection expires',()=>{
  const f=fixture([100,122]);f.fire(15,f.b);f.fire(1);f.tick(60);assert.equal(f.b.kart.stunRemaining,0);
  f.tick(112);f.fire(1);f.until(()=>f.b.kart.stunRemaining>0);
});
check('Jelly splash reaches a second lane, pops a shield and spares a high jumper',()=>{
  const f=fixture([100,124,124,124]);
  f.racers[2].kart.x=4;f.fire(2,f.racers[2]);
  Object.assign(f.racers[3].kart,{x:-3,y:12,grounded:false});
  f.fire(12);f.until(()=>f.b.notice==='JELLY BURST');
  assert.equal(f.racers[2].notice,'SHIELD BLOCK');assert.equal(f.racers[2].kart.stunRemaining,0);
  assert.equal(f.racers[3].kart.stunRemaining,0);
});
check('Static Puck waits to arm and triggers only once for the group',()=>{
  const f=fixture([100,96,96]);f.racers[2].kart.x=4.8;f.fire(14);f.tick(24);
  assert.equal(f.b.kart.stunRemaining,0);assert.equal(f.models('puck').length,1);
  f.until(()=>f.b.notice==='STATIC SHOCK');assert.equal(f.racers[2].notice,'STATIC SHOCK');
  assert.equal(f.models('puck').length,0);assert.equal(f.a.kart.stunRemaining,0);
});
check('Broom Bot leaves its owner’s shots and distant airborne attacks in flight',()=>{
  const f=fixture([100,110]);f.fire(15);f.fire(1);f.tick();assert.equal(f.models('ball').length,1);
  Object.assign(f.b.kart,{y:10,grounded:false});f.fire(11,f.b,true);f.tick(10);
  assert.equal(f.models('bolt').length,3);assert.equal(f.a.kart.stunRemaining,0);
});
check('Finished racers cannot collect a box, fire an item, or receive a new lock',()=>{
  const f=fixture();f.b.finish=2;startPickup(f.b,f.racers,0);assert(!f.b.roulette);
  assert.equal(f.fire(1,f.b),false);assert(f.fire(18));assert(f.fire(5));f.tick();assert(!f.b.incoming);
});
check('Lock warning prioritizes the rocket, prompts a defensive AI, and clears on impact',()=>{
  const f=fixture([100,165]);f.fire(5);f.tick();assert.equal(f.b.incoming,'CURSOR INCOMING');
  f.fire(18);f.tick();assert.equal(f.b.incoming,'RELAY INCOMING');
  f.b.held=2;assert.equal(f.game.decide(f.b,f.a,dt).itemPressed,true);
  f.fire(2,f.b);f.until(()=>f.b.notice==='SHIELD BLOCK');f.until(()=>!f.b.incoming);
  assert.equal(f.models('rocket').length,0);assert.equal(f.models('cursor').length,0);
});
check('Utility items grant their advertised effects and share strips only once',()=>{
  const f=fixture([100,108]);f.fire(0);assert(f.a.boost.reserve>1);
  f.fire(7);f.tick(4);assert(f.a.kart.speed>0);
  f.fire(9);f.tick();assert(f.b.boost.reserve>.5);assert.equal(f.models('strip').length,4);const reserve=f.b.boost.reserve;f.tick(2);assert.equal(f.b.boost.reserve,reserve);
  f.a.held=8;f.a.charges=3;for(const left of [2,1,0]){f.game.use(f.a,8,f.racers);assert.equal(f.a.charges,left);}assert.equal(f.a.held,null);
  f.fire(16);assert(!f.a.kart.grounded&&f.a.kart.vy>=9);assert(!f.fire(16));assert.equal(f.a.held,16);
  f.fire(19);assert.equal(f.a.boost.tier,2);assert.equal(f.a.shield,3);
});
check('Siphon transfers actual reserve, respects shields and spends a missed use',()=>{
  const f=fixture();assert(f.fire(17));assert.equal(f.a.held,null);assert.equal(f.a.notice,'SIPHON MISSED');
  f.b.boost.reserve=2;f.b.boost.tier=2;f.fire(2,f.b);f.fire(17);assert.equal(f.b.boost.reserve,2);assert.equal(f.b.shield,0);
  f.fire(17);assert.equal(f.a.boost.reserve,1.5);assert.equal(f.b.boost.reserve,.5);f.fire(17);
  assert.equal(f.b.boost.tier,0);assert.equal(f.a.boost.reserve,2);
});
check('A box reserves one roll, shows changing icons, then awards the correct charges',()=>{
  const f=fixture(),a=f.a;
  startPickup(a,f.racers,5);
  const roll=a.roulette,previews=new Set();
  startPickup(a,f.racers,5.1);assert.equal(a.roulette,roll);
  for(let n=0;n<90;n++){
    const now=5+n/60;
    settlePickup(a,now);assert.equal(a.held,null);
    previews.add(pickupPreview(roll,now));
  }
  assert(previews.size>5);
  settlePickup(a,5+PICKUP_SPIN_SECONDS);
  assert.equal(a.held,roll.item);assert.equal(a.charges,ITEMS[roll.item].charges??1);assert.equal(a.roulette,null);
  // One held item leaves the second slot open; two fill the kart.
  startPickup(a,f.racers,8);assert.ok(a.roulette);settlePickup(a,8+PICKUP_SPIN_SECONDS);
  assert.equal(a.held,roll.item);assert.notEqual(a.reserve,null);
  startPickup(a,f.racers,10);assert.equal(a.roulette,null);
  a.held=null;a.reserve=null;a.unlimited=true;startPickup(a,f.racers,9);assert.equal(a.roulette,null);
});
check('Rank-weighted draws use full race distance and award stronger items to trailing karts',()=>{
  const f=fixture([502,501,499,498,497,496]),strong=[8,17,18,19];let previous=0;
  for(const a of f.racers){const w=pickupWeights(a,f.racers),chance=strong.reduce((p,i)=>p+w[i],0)/w.reduce((x,y)=>x+y,0);
    assert(chance>previous);previous=chance;}
  assert(previous>.30);assert.equal(pickupWeights(f.a,f.racers)[19],0);
  const random=Math.random;
  try{for(const a of [f.a,f.racers.at(-1)]){const counts=Array(20).fill(0);
    for(let i=0;i<10000;i++){Math.random=()=>(i+.5)/10000;a.held=null;startPickup(a,f.racers,0);settlePickup(a,PICKUP_SPIN_SECONDS);counts[a.held]++;}
    console.log('  strong draws per 10,000, '+(a===f.a?'first':'last')+': '+strong.reduce((n,i)=>n+counts[i],0));assert.equal(counts.reduce((x,y)=>x+y),10000);
  }}finally{Math.random=random;}
});
console.log(passed+' item and projectile checks passed.');
