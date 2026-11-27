import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CIRCUITS,createTrackCore} from '../src/sim/track-core.js';
import {partPose,sweepObstacles} from '../src/sim/sky.js';

test('each main lane has a readable, avoidable timed crossing and unchanged optional gates',()=>{
 const types={track01:'plane',track02:'birds',track03:'satellite',track04:'birds',track05:'satellite',track06:'plane'};
 for(const course of CIRCUITS){
  const track=createTrackCore(course), expected=types[course.id];
  const lane=track.sky.lanes.find(l=>!l.optional);
  for(const layout of lane.layouts){
   const [ob,...rest]=layout.obstacles.filter(o=>o.type==='crossing');
   assert.equal(rest.length,0);assert.equal(ob.variant,expected);
   const part=ob.parts[0],t=(2*Math.PI-part.motion.ph)/part.motion.w;
   const pose=partPose(part,t,{});
   assert.ok(Math.abs(pose.x)<.01);
   assert.ok(ob.warn<part.s-70&&part.s<lane.end-120);
   const hit=sweepObstacles({obstacles:[ob]},t,part.s-9,0,pose.y,part.s+9,0,pose.y,lane);
   assert.equal(hit?.part?.crossing,expected);
   const freeY=pose.y<13?pose.y+5.5:pose.y-5.5;
   assert.ok(freeY>lane.floor&&freeY<lane.ceiling);
   assert.equal(sweepObstacles({obstacles:[ob]},t,part.s-9,0,freeY,part.s+9,0,freeY,lane),null);
   assert.ok(Math.abs(partPose(part,t+Math.PI/(part.motion.w*2),{}).x)>lane.width/2+part.hx);
  }
  assert.ok(track.sky.lanes.filter(l=>l.optional).every(l=>l.layouts.every(o=>o.obstacles.every(x=>x.type!=='crossing'))));
 }
});
