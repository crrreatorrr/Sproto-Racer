import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CIRCUITS, createTrackCore, createTrackSample } from '../src/sim/track-core.js';
import { createSimWorld } from '../src/sim/world.js';
import { contentManifest } from '../src/sim/server-entry.js';
import { trialRecordId } from '../src/hub/config.js';

const expansion = CIRCUITS.slice(3);
const expected = [
  ['track04', 'Crown & Cloister', 'medieval', 'birds', 'squeeze'],
  ['track05', 'Selene Station', 'orbital', 'satellite', 'debris'],
  ['track06', 'Neon Grid', 'neon', 'plane', 'shutter'],
];

describe('the six-circuit roster', () => {
  it('lists three new circuits without renaming existing records or server course IDs', () => {
    assert.deepEqual(CIRCUITS.map(c=>c.id), ['track01','track02','track03',...expected.map(e=>e[0])]);
    assert.deepEqual(contentManifest().circuits.map(c=>c.id),CIRCUITS.map(c=>c.id));
    assert.deepEqual(CIRCUITS.map(c=>trialRecordId(c.id)),['track01-crossings','track02-crossings','track03-crossings','track04','track05','track06']);
  });

  for (const [index,[id, name, theme, crossing, signature]] of expected.entries()) {
    it(`${name}: full-length closed course with right and left turns and two coherent Sky Lanes`, () => {
      const course=expansion[index], track=createTrackCore(course);
      assert.equal(course.id,id);
      assert.equal(course.name,name);
      assert.equal(track.sections.length,12);
      assert.equal(new Set(track.sections.map(s=>s.name)).size,12);
      assert.ok(track.length>6600 && track.length<9250);
      assert.ok(track.nodes[0].p && track.nodes.at(-1).p);
      assert.deepEqual(track.nodes.at(-1).p,track.nodes[0].p);
      const f={}, q=createTrackSample();
      const ground=[0,0];
      for(let s=0;s<track.length;s+=2.5){
        track.evalFrame(s,f);
        track.sampleInto(s,0,q);
        assert.ok([f.grade,f.width,f.curvature,q.grip,q.deckY].every(Number.isFinite));
        assert.ok(f.width>=22&&f.width<=42);
        if(!track.sky.inMainLane(s)){
          if(f.curvature<-.012)ground[0]++;
          if(f.curvature>.012)ground[1]++;
        }
      }
      assert.ok(ground.every(n=>n>=12),'both turn directions include technical sections on the road');
      assert.ok(track.pickups.length>100);
      assert.ok(track.hazards.length<=32,'deterministic hazard-contact mask capacity');
      assert.equal(track.sky.theme,theme);
      const [main,gate]=track.sky.lanes;
      assert.equal(track.sky.lanes.length,2);
      assert.equal(main.optional,false);
      assert.equal(gate.optional,true);
      assert.equal(gate.openLap,2);
      assert.ok(main.end-main.start>=1200 && gate.end-gate.start>=425);
      assert.ok(gate.end<main.start||gate.start>main.end,'lanes are disjoint');
      assert.ok(main.layouts[0].obstacles.some(o=>o.type===signature));
      assert.ok(main.layouts[0].obstacles.some(o=>o.variant===crossing));
      assert.ok(gate.layouts[1].boxes.length>0);
      for(const lane of [main,gate]){
        for(let s=lane.end;s<lane.end+115;s+=2){
          track.evalFrame(s,f);
          assert.ok(Math.abs(f.curvature)<.0075,'landing has an extended safe runout');
        }
        for(const layout of lane.layouts)assert.ok(layout.cells.length<=31&&layout.boxes.length<=31);
      }
    });

    it(`${name}: completes three ordinary race laps and naturally transitions between wheels and flight`, () => {
      const sim=createSimWorld({courseId:id,seed:20261127,mode:'race',laps:3,seats:[
        {id:0,kind:'ai',car:'apex',driver:'sproto',gridIndex:2},
        {id:1,kind:'ai',car:'barrage',driver:'cone',gridIndex:0},
        {id:2,kind:'ai',car:'ironhide',driver:'milady',gridIndex:1},
      ]});
      let opened=0,landed=0,air=false,touched=false;
      for(let i=0;i<60*600&&!sim.state.done;i++){
        sim.step({});
        const p=sim.state.player;
        touched ||= Boolean(p.roulette)||p.held!==null;
        if(!air&&p.kart.flying)opened++;
        if(air&&!p.kart.flying&&p.kart.grounded)landed++;
        air=p.kart.flying;
      }
      assert.ok(sim.state.done);
      assert.ok(sim.state.player.finish>0);
      assert.ok(opened>=3&&landed>=3);
      assert.ok(touched,'ordinary race actually awards an item');
    });
  }
});
