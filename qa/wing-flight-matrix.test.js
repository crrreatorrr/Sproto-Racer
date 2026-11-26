import {afterAll,beforeAll,describe,it,expect,vi} from 'vitest';
import {CARS,DRIVERS} from '../src/roster.js';
import {CIRCUITS} from '../src/sim/track-core.js';
import {createSimWorld} from '../src/sim/world.js';
import {animateKart,disposeKart,makeKart} from '../src/kart-art.js';

let canvas2d;
beforeAll(()=>{
  const gradient={addColorStop(){}};
  canvas2d=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation(function(){
    return new Proxy({canvas:this,createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,
      getImageData:(_x,_y,w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
      measureText:()=>({width:20})},{get:(obj,key)=>key in obj?obj[key]:(()=>{})});
  });
});
afterAll(()=>canvas2d.mockRestore());

const EXCLUDED=new Set(['saucer','violet-orbit']);
const STEP=1/60;
const launchInput={0:{throttle:1}};
const noInput={};
const highReach=28; // frames until the outside boards have visibly moved
const calmReach=32; // 0.48 s to reach the final shape at 60 Hz
const foldReach=28; // 0.42 s to stow at 60 Hz

describe('every vehicle through the live flight state machine',()=>{
  for(const course of CIRCUITS)it(`${course.name}: all 50 enter a real catapult and take the lane to landing`,()=>{
    let wingsSeen=0;
    for(const [i,car] of CARS.entries()){
      const driver=DRIVERS[i%DRIVERS.length];
      const world=createSimWorld({course,mode:'test',settings:{sector:0,speed:'standstill',hazards:false},seats:[{kind:'local',car:car.id,driver:driver.id}]});
      const lane=world.track.sky.lanes.find(l=>!l.optional);
      const act=world.state.player;
      Object.assign(act.kart,{s:lane.start-25,x:0,speed:55,grounded:true});
      const model=makeKart(0,car,driver,false,{flightWings:true});
      const {wings}=model.userData;
      const skip=EXCLUDED.has(car.id);
      try{
        expect(!!wings,car.name).toBe(!skip);
        let tick=0,entered=-1,landed=-1,early=false,max=0;
        for(;tick<60*43;tick++){
          world.step(entered<0?launchInput:noInput);
          const k=act.kart;
          if(entered<0&&k.flying)entered=tick;
          if(entered>=0&&!k.flying&&k.grounded&&landed<0)landed=tick;
          const sampled=tick===0||tick===entered||tick===entered+highReach||tick===landed||tick===landed+foldReach;
          const stored=sampled?JSON.stringify(k):null;
          animateKart(model,k,act.boost,tick*STEP,STEP);
          if(sampled)expect(JSON.stringify(k),`${car.id}: visual pass never mutates race state`).toBe(stored);
          if(wings){
            const p=wings.userData.kartWings.progress;
            if(wings.visible!==(p>0))throw new Error(`${car.id}: visibility does not match the wing pose`);
            if(entered<0&&p!==0)throw new Error(`${car.id}: wings on before catapult`);
            if(k.flying&&tick===entered)early=p>0&&p<.1;
            if(k.flying&&tick>=entered+calmReach&&p!==1)throw new Error(`${car.id}: incomplete unfold`);
            max=Math.max(max,p);
          }
          if(landed>=0&&tick-landed>=foldReach)break;
        }
        expect(entered,`${car.id} crosses a real catapult`).toBeGreaterThan(0);
        expect(landed,`${car.id} lands rather than dropping out`).toBeGreaterThan(entered+60);
        if(wings){
          expect(early,car.id).toBe(true);
          expect(max,car.id).toBe(1);
          expect(wings.visible,car.id).toBe(false);
          wingsSeen++;
        }
      }finally{disposeKart(model)}
    }
    expect(wingsSeen).toBe(48);
  },90000);
});
