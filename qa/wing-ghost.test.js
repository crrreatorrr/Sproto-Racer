import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {normalizeTrial,recordsCloudBody} from '../src/hub/records.js';
import {TRIAL_LAYOUT} from '../src/hub/config.js';
import {createSession} from '../src/session.js';
import {createTrackCore,CIRCUITS} from '../src/sim/track-core.js';
import {createGameplayCore} from '../src/sim/gameplay-core.js';
import {startFlight} from '../src/driving.js';

const base={time:12,length:1000,car:'apex',driver:'sproto',layout:TRIAL_LAYOUT};
const modern=[
  [0,0,0,0,0,0,0],
  [1,10,1,8,0,0,1],
  [2,20,2,9,0,0,1],
  [3,30,3,2,0,1,0],
  [4,40,4,0,0,1,0],
];
function sessionWith(frames){
  const track={id:'track01',length:1000,pickups:[],reset(){},update(){}};
  const records={get:()=>({...base,frames})};
  const session=createSession(track,{reset(){}},{reset(){}},records);
  session.start('trial',base);
  return session;
}
function poseAt(session,t){session.state.elapsed=t;return session.ghost();}

describe('time-trial flight ghost backward compatibility',()=>{
  it('preserves the optional discrete bit for local records while keeping it out of cloud saves',()=>{
    const valid=normalizeTrial({...base,frames:modern});
    assert.deepEqual(valid.frames,modern);
    assert.notEqual(valid.frames,modern);
    const cloud=recordsCloudBody({trials:{track01:valid}});
    assert.equal(Object.hasOwn(cloud.trials.track01,'frames'),false);
    const invalid=normalizeTrial({...base,frames:modern.map(row=>[...row.slice(0,-1),.75])});
    assert.equal(invalid.time,base.time);
    assert.equal(invalid.frames,undefined);
  });

  it('plays saved launch and return only at real flight samples, including rescue gaps and restart',()=>{
    const session=sessionWith(modern);
    for(const [t,flying] of [[0,false],[.999,false],[1,true],[1.5,true],[2,true],[2.999,true],[3,false],[4,false]]){
      assert.equal(poseAt(session,t).flying,flying,`flight flag at ${t}s`);
    }
    assert.equal(poseAt(session,4).s,40);
    session.start('trial',base);
    assert.equal(poseAt(session,0).flying,false,'Restart reused last ghost cursor');
    assert.equal(poseAt(session,1).flying,true,'Restart dropped new flight metadata');
  });

  it('records real stepped ground and flight poses with the optional bit',()=>{
    const track=createTrackCore(CIRCUITS[0]),play=createGameplayCore(track);
    let result;
    const records={get:()=>null,commit:(_id,value)=>(result=normalizeTrial({...value,layout:TRIAL_LAYOUT}))};
    const run=createSession(track,play,{reset(){},tone(){}},records);
    run.start('trial',base);
    run.state.countdown=0;
    const k=run.state.player.kart,dt=1/60;
    for(let i=0;i<7;i++)run.tick({throttle:1},dt);
    const lane=track.sky.lanes[0];
    k.s=lane.start+5;
    startFlight(k,track,0);
    for(let i=0;i<8;i++)run.tick({throttle:1},dt);
    assert.equal(k.flying,true,'Fixture did not remain in a real Sky Lane');
    Object.assign(k,{flying:false,skyLane:-1,s:track.length*3-.05,x:0,y:0,speed:38,grounded:true,fall:null});
    run.tick({throttle:1},dt);
    assert.equal(run.state.done,true);
    assert.ok(result?.frames);
    assert.ok(result.frames.every(row=>row.length===7),'Recorder dropped per-pose metadata');
    assert.equal(result.frames[0][6],0);
    assert.ok(result.frames.some(row=>row[6]===1));
    assert.equal(result.frames.at(-1)[6],0);
  });

  for(const width of [5,6])it(`replays a legacy ${width}-column ghost without inferring wings from jump height`,()=>{
    const legacy=modern.map(row=>row.slice(0,width));
    const session=sessionWith(legacy);
    const pose=poseAt(session,1.5);
    assert.equal(pose.y,8.5);
    assert.equal(pose.s,15);
    assert.equal(pose.flying,false);
  });
});
