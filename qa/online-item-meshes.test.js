// The game's item layer (src/gameplay.js) in an online race: a correction puts back a
// saved state and re-runs a few ticks, which removes and re-creates every item object.
// The meshes must survive that, and the layer must save and restore its state exactly.
import {describe,it,expect} from 'vitest';
import * as T from 'three';
import {createGameplay} from '../src/gameplay.js';
import {CIRCUITS,createTrackCore} from '../src/sim/track-core.js';
import {createSimWorld} from '../src/sim/world.js';
import {stateHash} from '../src/sim/hash.js';
import {captureSnapshot} from '../src/sim/snapshot.js';
import {restoreSnapshot} from '../src/net/restore.js';
import {createLoopbackMatch,createSimNet} from '../src/net/sim-net.js';
import {createScriptedDriver} from '../tests/net-harness.js';

const FRAME=1000/60;
// A 6-kart match with three players who use items often. Player 0's world is built on the
// game's item layer; `keepMeshes` is what the game passes it.
function race(keepMeshes,seconds=40,latencyMs=120){
  const net=createSimNet({seed:0x17e5});
  const match=createLoopbackMatch({net,host:{courseId:'track01',seed:404,laps:3,seatCount:6,startDelayTicks:90}});
  const scene=new T.Scene();
  let play=null,client=null;
  for(let i=0;i<3;i++){
    const driver=createScriptedDriver({style:i%2?'keys':'stick',itemEvery:47});
    const ep=match.connect('p'+i,{latencyMs,jitterMs:latencyMs/4},{
      hello:{car:'apex',driver:'sproto',name:'P'+i},controls:driver.controls,frameOffsetMs:1+i*4,
      createWorld:i?undefined:config=>{
        const track=createTrackCore(CIRCUITS.find(c=>c.id===config.courseId));
        play=createGameplay(scene,track,{replaying:keepMeshes?()=>client.resimulating:undefined});
        return createSimWorld({...config,track,play});
      },
    });
    if(!i)client=ep.client;
  }
  net.runFor(1500);
  for(const ep of match.endpoints.values())ep.client.setReady(true);
  const root=()=>scene.children.find(o=>o.name==='item-effects');
  let frames=0,framesWithShots=0,fill=0,mostObjects=0,loose=0;
  const end=net.now()+seconds*1000;
  while(net.now()<end){
    net.runFor(FRAME);
    if(!play)continue;
    // What the game does each frame after the race has advanced.
    play.settle();
    frames++;
    const stats=play.meshStats;
    mostObjects=Math.max(mostObjects,play.objects.length);
    // One mesh in the scene per live object, none left over from a replay.
    if(stats.active!==play.objects.length||stats.waiting!==0||root().children.length!==stats.active)loose++;
    const f=play.trailFill();
    if(f>=0){framesWithShots++;fill+=f;}
  }
  return {client,play,frames,framesWithShots,trailFill:fill/Math.max(1,framesWithShots),mostObjects,loose,stats:play.meshStats};
}

describe('item meshes in an online race',()=>{
  it('saves and restores item state, so a world drawn by the game stays in step with the host',()=>{
    const {client,play,mostObjects}=race(true,30);
    expect(mostObjects).toBeGreaterThan(2);
    expect(client.stats.rollbacks).toBeGreaterThan(300);
    expect(client.stats.hashChecks).toBeGreaterThan(40);
    expect(client.stats.hashMismatches).toBe(0);
    expect(client.stats.keyframeRequests).toBe(0);
    // A snapshot of this world carries its items and comes back to the same fingerprint.
    const world=client.world,before=stateHash(world),snap=captureSnapshot(world);
    expect(snap.gameplay.objects.length).toBe(play.objects.length);
    for(let i=0;i<30;i++)world.step({});
    expect(stateHash(world)).not.toBe(before);
    restoreSnapshot(world,snap);
    expect(stateHash(world)).toBe(before);
    play.dispose();
  });

  it('keeps each object\'s mesh and trail through corrections instead of rebuilding them',()=>{
    // A good connection: corrections are frequent but only reach back a few ticks.
    const kept=race(true,40,20),rebuilt=race(false,40,20);
    for(const run of [kept,rebuilt]){
      expect(run.client.stats.hashMismatches).toBe(0);
      expect(run.framesWithShots).toBeGreaterThan(100);
      expect(run.loose,'frames where meshes and objects did not match one to one').toBe(0);
    }
    // Same race either way.
    expect(kept.client.stats.rollbacks).toBe(rebuilt.client.stats.rollbacks);
    expect(kept.stats.reclaimed).toBeGreaterThan(1000);
    expect(rebuilt.stats.reclaimed).toBe(0);
    // Without keeping them, every correction starts every live object's mesh from scratch.
    expect(kept.stats.fresh).toBeLessThan(rebuilt.stats.fresh/3);
    // A shot's trail is a short history of where it has been. A rebuilt mesh only has the
    // few ticks the correction re-ran, so its trail is cut short; a kept one has it all.
    // (Measured here: 0.93 of the full trail kept, 0.70 rebuilt.)
    expect(kept.trailFill).toBeGreaterThan(.6);
    expect(rebuilt.trailFill).toBeLessThan(kept.trailFill*.8);
    kept.play.dispose();rebuilt.play.dispose();
  });
});
