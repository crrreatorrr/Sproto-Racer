import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTrackCore,CIRCUITS,createTrackSample} from '../src/sim/track-core.js';
import {createKart,stepKart} from '../src/driving.js';
import {trialRecordId} from '../src/hub/config.js';
import {createRecordBook} from '../src/hub/records.js';

const ice=createTrackCore(CIRCUITS[1]);
const dry=ice.sample(ice.icePatches[0].s0-9);
const frozen=ice.sample((ice.icePatches[0].s0+ice.icePatches[0].s1)/2);
test('Crestline marks and smoothly feathers three real road intervals; other courses stay dry',()=>{
 assert.equal(ice.icePatches.length,3);
 assert.equal(dry.grip,1);
 assert.equal(frozen.grip,.70);
 const reused=createTrackSample();
 for(const {s0,s1} of ice.icePatches){
  assert.ok(Math.abs(ice.distanceToIce(s0-48)-48)<1e-8);
  assert.equal(ice.distanceToIce(s0+ice.length+8),0);
  assert.equal(ice.sample(s0).grip,1);
  assert.ok(ice.sample(s0+3).grip<1&&ice.sample(s0+3).grip>.70);
  assert.equal(ice.sample(s1+2).grip,1);
  for(let s=s0;s<s1;s+=2)assert.equal(ice.sky.inMainLane(s),false);
  ice.sampleInto(s0+8,0,reused);assert.equal(reused.grip,.70);
  ice.sampleInto(s1+8,0,reused);assert.equal(reused.grip,1);
 }
 for(const i of [0,2]){
  const t=createTrackCore(CIRCUITS[i]);assert.equal(t.icePatches.length,0);
  assert.equal(t.sampleInto(0,0,reused).grip,1);
 }
});
test('ice extends braking and reduces turn response, but does not alter airborne steering',()=>{
 const k=()=>Object.assign(createKart(),{speed:40});
 const a=k(),b=k(), controls={steer:.6,brake:1};
 for(let i=0;i<12;i++){stepKart(a,controls,{width:40,grip:1});stepKart(b,controls,{width:40,grip:.70});}
 assert.ok(b.speed>a.speed+1);
 assert.ok(Math.abs(b.cornerRate)<Math.abs(a.cornerRate));
 const c=k(),d=k();Object.assign(c,{grounded:false,y:8});Object.assign(d,{grounded:false,y:8});
 stepKart(c,controls,{width:40,grip:1});stepKart(d,controls,{width:40,grip:.70});assert.deepEqual(c,d);
});
test('crossing-season records do not overwrite older times and ghosts',()=>{
 const values=new Map(), book=createRecordBook({storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}});
 const run={time:80,length:ice.length,car:'apex',driver:'sproto'};
 book.commit('track02',run);
 book.commit(trialRecordId('track02'),{...run,time:88});
 assert.equal(book.get('track02').time,80);
 assert.equal(book.get(trialRecordId('track02')).time,88);
 assert.equal(trialRecordId('track01'),'track01-crossings');
 assert.equal(trialRecordId('track03'),'track03-crossings');
});

test('test track and Summit puddles reduce grip locally, with a dry alternate line',()=>{
 for(const i of [0,2]){
  const t=createTrackCore(CIRCUITS[i]);
  assert.equal(t.wetPatches.length,3);
  assert.equal(t.icePatches.length,0);
  for(const p of t.wetPatches){
   const s=(p.s0+p.s1)/2;
   assert.ok(Math.abs(t.distanceToWet(p.s0-30)-30)<1e-8);
   assert.equal(t.wetAt(s,p.x),1);
   assert.ok(Math.abs(t.sample(s,p.x).grip-.82)<1e-10);
   assert.equal(t.sample(s,-p.x).grip,1);
   assert.equal(t.sample(s,p.x+p.width*.6).grip,1);
   assert.ok(t.sample(s,p.x).grip>frozen.grip);
   for(let k=p.s0;k<p.s1;k+=2)assert.equal(t.sky.inMainLane(k),false);
  }
 }
 assert.equal(ice.wetPatches.length,0);
});
