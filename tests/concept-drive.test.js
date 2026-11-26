import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {CONCEPT_CARS} from '../src/concept-roster.js';
import {DRIVERS} from '../src/roster.js';
import {createSimWorld} from '../src/sim/world.js';
import {controlsToIntentFrame} from '../src/sim/intent.js';
import {captureSnapshot,applySnapshot} from '../src/sim/snapshot.js';
import {stateHash} from '../src/sim/hash.js';

describe('concept vehicles in the race simulation',()=>{
  for(const [i,car] of CONCEPT_CARS.entries())it(`${car.name} spawns, drives, turns and round-trips a race snapshot`,()=>{
    const options={courseId:`track0${1+i%3}`,seed:141+i,mode:'trial',
      seats:[{id:0,kind:'local',car:car.id,driver:DRIVERS[i%DRIVERS.length].id}]};
    const world=createSimWorld(options);
    const driver=world.state.actors[0];
    assert.equal(driver.car,car.id);
    const initial=driver.kart.s;
    let topSpeed=0;
    for(let t=0;t<300;t++){
      world.step({0:controlsToIntentFrame(t,{throttle:1,steer:t<220?0:Math.sin(t*.06)*.45})});
      topSpeed=Math.max(topSpeed,driver.kart.speed);
    }
    assert.ok(topSpeed>5,`did not accelerate, max speed ${topSpeed}`);
    assert.ok(driver.kart.s>initial+3);
    for(const key of ['s','x','y','yaw','speed'])assert.ok(Number.isFinite(driver.kart[key]),key);
    const restored=createSimWorld(options);
    applySnapshot(restored,captureSnapshot(world));
    assert.equal(restored.state.actors[0].car,car.id);
    assert.equal(stateHash(restored),stateHash(world));
  });
});
