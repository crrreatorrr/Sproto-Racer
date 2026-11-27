// Run with node qa/steering-edges.mjs.
import assert from 'node:assert/strict';
import {Scene} from 'three';
import {createKart, stepKart, steerForTurn} from '../src/driving.js';
import {createBoost, grantBoost} from '../src/boost.js';
import {tireTurnRate,frontWheelAngle,fullLockCurvature} from '../src/steering.js';
import {CARS} from '../src/roster.js';
import {CIRCUITS} from '../src/circuits.js';
import {createTrack} from '../src/track.js';
import {createGameplay} from '../src/gameplay.js';
import {createSession} from '../src/session.js';

const dt=1/60;
for(const car of CARS){
  const k=createKart(car);
  for(const speed of [6,30,65]){
    k.speed=speed;
    const inner=frontWheelAngle(car.id,fullLockCurvature(k),1);
    const outer=frontWheelAngle(car.id,fullLockCurvature(k),-1);
    assert(inner>outer && outer>0);
    for(const steer of [.2,.65,1]){
      const rate=tireTurnRate(k,steer,0);
      assert(Math.abs(steerForTurn(k,rate)-steer)<1e-8,'AI and player use the same grip curve');
      assert.equal(tireTurnRate(k,-steer,0),-rate);
    }
  }
  const fastRadius=k.speed/tireTurnRate(k,1,0);
  assert(tireTurnRate(k,1,.9)<tireTurnRate(k,1,0));
  k.offroad=true;assert(k.speed/tireTurnRate(k,1,0)>fastRadius);k.offroad=false;
  k.speed=30;assert(fastRadius>2*(k.speed/tireTurnRate(k,1,0)));
}
{
  const k=createKart(),flat={width:10000},boost=createBoost();
  k.speed=50;
  const hold=(steer,frames)=>{for(let i=0;i<frames;i++)stepKart(k,{steer,throttle:1},flat,boost,dt);};
  hold(1,30);const right=k.cornerRate;
  hold(-1,1);assert(k.cornerRate>0 && k.steer>0,'reversing takes up the existing steering angle');
  hold(-1,25);assert(k.cornerRate<-.7*right,'kart responds to opposite lock');
  hold(0,60);assert(k.steer===0 && Math.abs(k.cornerRate)<.001,'steering and cornering settle after release');
  Object.assign(k,{grounded:false,y:.005,vy:-3,airPivot:.6,takeoffPitch:0,takeoffRoll:0});
  const heading=k.travelYaw;
  stepKart(k,{},flat,boost,dt);
  assert(k.grounded && Math.abs(k.travelYaw-heading)<.1,'touchdown preserves momentum');
  hold(0,30);
  assert(Math.abs(k.airPivot)<.01 && k.travelYaw-heading>.57,'tires pick up the airborne rotation');
}
console.log('Steering geometry, braking grip, countersteer and landing recovery passed');
for(const curvature of [-.012,.012]){
  const road={curvature,width:300},boost=createBoost();
  for(const mode of ['forward','airborne','reverse']){
    const k=createKart(),reverse=mode==='reverse';
    Object.assign(k,{travelYaw:.21,yaw:.21,speed:reverse?0:48,reverseSpeed:reverse?5:0});
    if(mode==='airborne')Object.assign(k,{grounded:false,y:40,vy:0,takeoffPitch:0,takeoffRoll:0});
    for(let i=0;i<60;i++)stepKart(k,reverse?{reverse:1}:{throttle:1},road,boost,dt);
    assert(Math.abs(k.travelYaw+curvature*k.s-.21)<1e-7,mode+' holds world heading');
  }
  const k=createKart();k.speed=50;
  for(let i=0;i<180;i++)stepKart(k,{throttle:1,steer:steerForTurn(k,curvature*k.speed)},road,boost,dt);
  assert(Math.abs(k.x)<15,'deliberate steering follows the bend');
  console.log('Manual steering, airborne travel and reverse passed on',curvature<0?'left bends':'right bends');
}

for(const course of CIRCUITS){
  const t=createTrack(new Scene(),course),game=createGameplay(new Scene(),t);
  const session=createSession(t,game,{tone(){},reset(){}});
  for(const [sector,from,to,side] of course.drops){
    const sec=t.sections[sector],s=sec.start+(sec.end-sec.start)*(from+to)/2;
    // A main Sky Lane replaces this stretch of road, so its drop no longer exists.
    if(t.sky.inMainLane(s,20)){assert(!t.dropAt(s,side));continue;}
    const gap=t.dropAt(s,side);
    assert(gap && !t.dropAt(s,-side) && !t.dropAt(gap.start-1,side) && !t.dropAt(gap.end+1,side));
    assert.equal(t.edgeAt(s,side),Infinity);
    assert(Number.isFinite(t.edgeAt(s,-side)));
    for(const car of ['apex','geep']){
      for(const outward of [side,-side]){
        // Use a grounded start before placing the kart at the lip. A sector
        // can start within a Sky Lane and have a grounded drop farther on.
        const st=session.start('test',{sector:0,speed:'cruise',lap:2,rivals:'solo',car,item:2});
        const a=st.player,k=a.kart;
        assert(k.grounded && !k.flying, 'edge fixture must start in ground mode');
        const heading=outward*.52;
        Object.assign(k,{s:s+t.length,x:outward*(t.widthAt(s)/2-4),speed:40,travelYaw:heading,yaw:heading});
        grantBoost(a.boost,3,2);session.useItem(a);
        let impact=0;
        for(let i=0;i<30&&!k.fall&&!impact;i++){
          session.tick({throttle:1},dt);impact=k.wallImpact;
        }
        if(outward!==side){
          assert(impact>0&&!k.fall,'opposite rail stops '+car);
          continue;
        }
        assert(k.fall,'kart leaves the marked edge');assert.equal(impact,0);
        assert.equal(a.boost.reserve,0);assert.equal(a.shield,0);
        assert.equal(session.useItem(a),false);
        const departure=st.elapsed;
        let lowest=0;
        for(let i=0;i<90&&!k.rescues;i++){
          session.tick({throttle:1,driftHeld:true,itemPressed:true},dt);lowest=Math.min(lowest,k.y);
        }
        assert(lowest < -5 && k.rescues===1 && k.grounded && !k.fall);
        assert(Math.abs(k.s-(t.length+gap.start-10))<1e-6 && k.x===0);
        assert(st.elapsed-departure>=1.24&&st.lap===2&&!st.done);
        const rejoin=k.s;
        session.tick({throttle:1},dt);assert(k.s>rejoin);
      }
    }
    console.log(course.name+' / '+sec.name+' passed for both sides and chassis footprints');
  }
  t.dispose();
}
