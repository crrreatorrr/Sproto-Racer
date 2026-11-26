import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {CIRCUITS} from '../src/sim/track-core.js';
import {createSimWorld} from '../src/sim/world.js';
import {stateHash} from '../src/sim/hash.js';
import {createKartWings,updateKartWings,disposeKartWings} from '../src/kart-wings.js';

describe('real Sky Lane flight transitions never alter deterministic sim',()=>{
 for(const course of CIRCUITS)it(course.id,()=>{
   const cars=['geep','ringrunner','skipper','violet-orbit','manta','sky-mixer'];
   const seats=cars.map((car,i)=>({id:i,kind:'ai',car,driver:['sproto','pip','miso','rook'][i%4],gridIndex:i}));
   const setup={course,seed:7,finishRule:'all_racers',laps:1,seats};
   const headless=createSimWorld(setup),visual=createSimWorld(setup);
   const wings=cars.map(createKartWings);
   let launches=0,landings=0,expanded=0;
   assert.equal(wings[3],null,'Native flyer must not have clip-on wings');
   let last=visual.state.actors.map(()=>false);
   try{
     for(let t=0;t<60*240&&!visual.state.done;t++){
       headless.step({});visual.step({});
       visual.state.actors.forEach(({kart},i)=>{
         const wing=wings[i],flying=!!kart.flying;
         updateKartWings(wing,flying,1/60);
         if(wing && !last[i] && flying){ launches++;assert.ok(wing.visible,'Real launch did not enter deployment'); }
         if(wing && last[i] && !flying)landings++;
         if(wing?.userData.kartWings.progress===1)expanded++;
         last[i]=flying;
       });
       if(t%60===59)assert.equal(stateHash(headless),stateHash(visual),`sim divergence at tick ${t}`);
     }
     assert.equal(stateHash(headless),stateHash(visual));
     assert.ok(visual.state.done,'Real race did not finish');
     assert.ok(launches>0&&landings>0&&expanded>0,`launches ${launches}, landings ${landings}, expanded ${expanded}`);
   }finally{wings.forEach(disposeKartWings);}
   process.stderr.write(`WING_SIM ${course.id} ${launches} launches ${landings} landings ${expanded} fully-deployed frames\n`);
 },70000);
});
