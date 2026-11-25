// Run with node qa/drift-boost.mjs.
import assert from 'node:assert/strict';
import {Scene,Vector3} from 'three';
import {createBoost,stepBoost,grantBoost} from '../src/boost.js';
import {createKart,stepKart} from '../src/driving.js';
import {createGameplay} from '../src/gameplay.js';
import {createSession} from '../src/session.js';

const dt=1/60;
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
function drift(){
  const b=createBoost(),k=Object.assign(createKart(),{sliding:true,slideId:1,speed:40,driftWasHeld:true});
  const road={width:10000};
  function frame(input){
    stepKart(k,input,road,b,dt);
    stepBoost(b,k,input,dt);
  }
  function press(time,release=false){
    while(b.meter+1e-9<time){
      assert(k.sliding&&!b.chainClosed);
      frame({throttle:1,driftHeld:true});
    }
    const before=Math.max(0,b.reserve-dt);
    frame({throttle:1,driftHeld:!release,driftBoostPressed:!release,driftReleased:release});
    return b.reserve-before;
  }
  return {b,k,frame,press};
}
// Exercise all eight grade orders, including the release-and-regrip control.
// Start with an item-sized reserve so the countdown runs throughout the combo.
for(const release of [false,true])for(let mask=0;mask<8;mask++){
  const f=drift();
  grantBoost(f.b,2.6,2);
  let total=0,frames=0;
  for(let i=0;i<3;i++){
    const perfect=Boolean(mask & (1<<i)),ticks=perfect?54:45;
    const expected=perfect ? 1.2 : 0.8;
    near(f.press(ticks*dt,release),expected);
    total+=expected;frames+=ticks+1;
    assert.equal(f.b.comboLength,i+1);
    assert(f.b.feedback.endsWith(`${perfect?'PERFECT':'GOOD'} +${expected.toFixed(1)}s`));
  }
  near(f.b.reserve,2.6+total-frames*dt);
  assert(f.b.chainClosed && f.b.pips===3);
  for(let i=0,n=Math.ceil(f.b.reserve/dt)+1;i<n;i++)f.frame({});
  assert.equal(f.b.tier,0);
}
for(const reset of ['early','new slide']){
  const f=drift();
  f.press(.75);
  if(reset==='early')f.frame({driftHeld:true,driftBoostPressed:true});
  else{
    f.frame({driftReleased:true});
    assert.equal(f.k.sliding,false);
    Object.assign(f.k,{sliding:true,slideId:2});
  }
  near(f.press(.9),1.2);
  assert.equal(f.b.comboLength,1);
}

const track={length:1000,widthAt:()=>18,edgeAt:()=>9,pads:[],pickups:[],ramps:[],hazards:[],
  sections:[{start:0,name:'Straight'}],reset(){},update(){},
  sample(s,x=0){return {position:new Vector3(x,0,s),curvature:0,width:18,grade:0,bank:0,section:0,
    forward:new Vector3(0,0,1),right:new Vector3(1,0,0)};}};
function race(options={}){
  const play=createGameplay(new Scene(),track);
  const session=createSession(track,play,{reset(){},tone(){}});
  const {player,actors}=session.start('test',{speed:'cruise',...options});
  for(const a of actors){
    Object.assign(a.kart,{s:100,speed:42});
    grantBoost(a.boost,4,2);
    Object.assign(a.boost,{pips:1,comboLength:1,plume:1,meter:.9});
  }
  return {session,play,player,actors};
}
{
  const {play,player,actors}=race();
  near(player.boost.reserve,4);
  play.use(player,0,actors);
  near(player.boost.reserve,5.45);
  play.use(player,19,actors);
  near(player.boost.reserve,8.05);
  assert.equal(player.boost.comboLength,1,'items preserve the drift combo');
}
function stopped(b){
  for(const key of ['reserve','tier','ignition','plume','meter','comboLength','pips'])assert.equal(b[key],0,key);
}
{
  const {session,player}=race();
  Object.assign(player.kart,{x:8.10,travelYaw:.22,yaw:.22});
  session.tick({throttle:1},dt);
  assert(player.kart.wallImpact>0 && player.kart.wallImpact<.65,'sideways rail impact below hard-crash threshold');
  stopped(player.boost);
}
{
  const {session,actors:[a,b]}=race({rivals:'alongside'});
  Object.assign(a.kart,{x:0,travelYaw:.23,yaw:.23,sliding:true,slideId:4,driftWasHeld:true,driftDirection:1});
  Object.assign(a.boost,{activeSlide:4,meter:.25});
  Object.assign(b.kart,{x:2.35});
  session.tick({throttle:1,driftHeld:true},dt);
  assert(a.kart.kartImpact>3 && b.kart.kartImpact>3);
  assert(a.kart.sliding && a.boost.activeSlide===4 && a.boost.meter>.25);
  for(const racer of [a,b]){
    near(racer.boost.reserve,4-dt);
    assert.equal(racer.boost.tier,2);
    assert.equal(racer.boost.comboLength,1);
    assert.equal(racer.boost.pips,1);
  }
}
for(const shield of [false,true]){
  track.hazards=[{s:100.45,x:0,width:2,depth:.3,height:1.4,type:'laneDivider'}];
  track.pads=[{s:100.4,x:0,width:4,tier:2}];
  const {session,player,play,actors}=race();
  if(shield)play.use(player,2,actors);
  session.tick({throttle:1},dt);
  if(shield)assert(player.boost.reserve>4 && player.notice==='SHIELD BLOCK');
  else{
    stopped(player.boost);
    track.pads[0].s=player.kart.s+.18;
    session.tick({throttle:1},dt);
    assert(player.boost.reserve>2,'fresh pad after the crash works');
  }
}
track.hazards=[];track.pads=[];
{
  const {play,actors:[a,b]}=race({rivals:'ahead'});
  b.kart.s+=16;
  play.use(b,1,[a,b],true);
  for(let i=0;i<80&&!a.kart.stunRemaining;i++)play.update(dt,[a,b]);
  assert(a.kart.stunRemaining>0);
  stopped(a.boost);
}
console.log('Good and Perfect streaks, kart bumps, both drift controls and boost interruptions passed.');
