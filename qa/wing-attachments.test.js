import {describe,it,beforeAll} from 'vitest';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createKart,stepKart} from '../src/driving.js';
import {CARS,DRIVERS} from '../src/roster.js';
import {animateKart,disposeKart,makeKart,resetKartWingPose} from '../src/kart-art.js';
import * as wingsApi from '../src/kart-wings.js';

const {createKartWings:create,updateKartWings:update,disposeKartWings:dispose}=wingsApi;
const excluded=new Set(['saucer','violet-orbit']);
const stock={s:0,x:0,y:0,speed:0,steer:0,stunRemaining:0};
const roll={s:72,x:3.2,y:1.2,speed:38,steer:.9,suspension:.13,hopLift:.55,slipAngle:.32,stunRemaining:.31,hitRollSide:-1};
const boosted={meter:.8,plume:.8,flameTier:2,ignition:.7};
const step=1/60, newVec=()=>new T.Vector3(), close=(a,b,tol=1e-6)=>Math.abs(a-b)<=tol;
const matrixEqual=(a,b)=>a.elements.every((v,j)=>close(v,b.elements[j]));
const meshNodes=(o,shown=false)=>{
  const result=[];(shown?o.traverseVisible.bind(o):o.traverse.bind(o))(n=>{if(n.isMesh)result.push(n);});
  return result;
};
const isVisible=(o)=>{
  for(let p=o;p;p=p.parent)if(!p.visible)return false;
  return true;
};
const under=(node,ancestor)=>{for(let n=node;n;n=n.parent)if(n===ancestor)return true;return false;};
const stampNode=n=>[n.visible,...n.position,...n.quaternion,...n.scale];
const stamp=o=>{const r=[];o.traverseVisible(n=>r.push(stampNode(n)));return r;};
const worldBounds=(meshes,space)=> {
  const box=new T.Box3(),scratch=new T.Box3();
  const inverse=space?.matrixWorld.clone().invert();
  for(const mesh of meshes){
    if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
    const m=mesh.matrixWorld;
    const local=inverse?inverse.clone().multiply(m):m;
    box.union(scratch.copy(mesh.geometry.boundingBox).applyMatrix4(local));
  }
  return box;
};
const frame=(kit,flying,dt=step)=>update(kit,flying,dt);
const advance=(kit,flying,frames=180)=>{for(let i=0;i<frames;i++)frame(kit,flying);};
const sizeX=(root,kit)=>{
  root.updateMatrixWorld(true);
  return worldBounds(meshNodes(kit,true),root.userData.body).getSize(newVec()).x;
};
const mustHide=(kit,message)=>assert.equal(meshNodes(kit,true).length,0,message);
const make=(car,driver,id=0,ghost=false)=>makeKart(id,car,driver,ghost,{flightWings:true});
const install=(kart,car)=>{
  if(Object.hasOwn(kart.userData,'wings'))return kart.userData.wings;
  const kit=create(car.id);
  if(kit)kart.userData.body.add(kit);
  return kit;
};
function assertSleevesAttached(kit){
  const state=kit.userData.kartWings;
  for(const [i,hinge] of (state.hinges??[]).entries()){
    if(!hinge.visible)continue;
    hinge.updateMatrix();
    const socket=new T.Vector3(0,-.5,0).applyMatrix4(hinge.matrix);
    const wingRoot=new T.Vector3(0,.5,0).applyMatrix4(hinge.matrix);
    assert.ok(socket.distanceTo(state.sides[i].pivot)<.025,'Moving sleeve lifted away from its socket');
    assert.ok(wingRoot.distanceTo(state.nodes[i].position)<1e-6,'Moving sleeve detached from the wing root');
  }
}
const matrixSaved=o=>{const mats=[];o.traverse(n=>mats.push(n.matrixWorld.clone()));return mats;};

beforeAll(()=>{
  HTMLCanvasElement.prototype.getContext=function(){
    const gradient={addColorStop(){}};
    return new Proxy({canvas:this,createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,
      getImageData:(_x,_y,w,h)=>({data:new Uint8ClampedArray(Math.max(0,w*h*4))}),
      measureText:()=>({width:20})},{get:(obj,key)=>key in obj?obj[key]:(()=>{})});
  };
});

describe('flight kit public contract',()=>{
  it('permits exactly 48 and excludes precisely the two native flyers',()=>{
    assert.equal(CARS.length,50);
    assert.equal(new Set(CARS.map(c=>c.id)).size,50);
    let eligible=0;
    for(const car of CARS){
      const kit=create(car.id);
      assert.equal(!!kit,!excluded.has(car.id),car.id);
      if(kit){eligible++;mustHide(kit,car.id);dispose(kit);}
    }
    assert.equal(eligible,48);
    for(const id of ['__unknown-car__',null,undefined])assert.equal(!!create(id),false);
  });

  for(const car of CARS)it(`${car.id}: variants, stock silhouette, launch progression, reversals, roll and restart`,()=>{
    for(const driver of DRIVERS){
      const kart=make(car,driver),body=kart.userData.body;
      const originalNodes=[];kart.traverse(n=>{if(!kart.userData.wings||!under(n,kart.userData.wings))originalNodes.push(n);});
      const originalMeshes=originalNodes.filter(n=>n.isMesh);
      animateKart(kart,stock,{},0);
      kart.updateMatrixWorld(true);
      const before=originalNodes.map(stampNode),beforeBox=worldBounds(originalMeshes.filter(isVisible),body);
      const kit=install(kart,car);
      if(excluded.has(car.id)){assert.equal(!!kit,false);disposeKart(kart);continue;}
      try{
        assert.equal(kit.parent,body);
        frame(kit,false);
        mustHide(kit,'Stock road silhouette requires zero visible flight meshes');
        kart.updateMatrixWorld(true);
        const after=originalNodes.map(stampNode);
        assert.deepEqual(after,before,'Ground pose changed legacy meshes or driver/wheels/exhaust');
        const afterBox=worldBounds(meshNodes(kart,true),body);
        if(driver===DRIVERS[0]){
          const untouched=makeKart(0,car,driver);
          try{
            assert.equal(!!untouched.userData.wings,false,'Default garage assembly added wing geometry');
            animateKart(untouched,stock,{},0);untouched.updateMatrixWorld(true);
            const pure=worldBounds(meshNodes(untouched,true),untouched.userData.body);
            assert.ok(pure.min.distanceTo(beforeBox.min)<1e-7&&pure.max.distanceTo(beforeBox.max)<1e-7,'Opted-in shell differs from stock garage silhouette');
            assert.equal(meshNodes(untouched).length,originalMeshes.length,'Wing geometry infiltrated the stock traversal');
          }finally{disposeKart(untouched);}
        }
        assert.ok(afterBox.min.distanceTo(beforeBox.min)<1e-7 && afterBox.max.distanceTo(beforeBox.max)<1e-7,'Stock envelope changed');
        const safePose=Object.freeze({...roll}),safeBoost=Object.freeze({...boosted});
        const stockParts=kart.userData.solidMeshes.slice();
        animateKart(kart,safePose,safeBoost,1.2);

        const states=new Set(),breadth=[];
        let launchFrames=0,peakDrawCalls=0;
        const allGeometry=new Set(meshNodes(kit).map(m=>m.geometry));
        for(let i=0;i<125;i++){
          frame(kit,true);
          const drawCalls=meshNodes(kit,true).length;
          if(drawCalls)launchFrames++;
          peakDrawCalls=Math.max(peakDrawCalls,drawCalls);
          if(i<35)assertSleevesAttached(kit);
          if(i<75){
            states.add(JSON.stringify(stamp(kit)));
            breadth.push(sizeX(kart,kit));
          }
        }
        assert.ok(launchFrames>100,'Did not visibly deploy and stay open');
        assert.ok(states.size>=4,'Launch snapped instead of playing lift/deploy frames');
        const open=stamp(kit),full=sizeX(kart,kit);
        assert.ok(full>.8,'Deployed flight silhouette is not appreciable');
        assert.ok(breadth.some(width=>width>0&&Math.abs(full-width)>.055),'No measurable growth during deployment');
        const meshes=meshNodes(kit,true),verts=meshes.reduce((n,m)=>n+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0);
        assert.ok(peakDrawCalls<=12,`Wing draw-call budget exceeded (${peakDrawCalls})`);
        assert.ok(verts<=9000,`Wing triangle budget exceeded (${verts})`);
        assert.deepEqual(kart.userData.solidMeshes,stockParts,'Flight visual changed stock collision/occlusion solids');
        const inv=body.matrixWorld.clone().invert();
        const relatives=matrixSaved(kit).map(m=>inv.clone().multiply(m));
        kart.position.set(-8,23,15);kart.rotation.set(.22,1.01,-.30);
        animateKart(kart,{...safePose,stunRemaining:.08,hitRollSide:1,rollTime:.24,rollDir:-1,tumble:.19,trickTime:.10,trickKind:1},safeBoost,1.8);
        kart.updateMatrixWorld(true);
        const invAfter=body.matrixWorld.clone().invert();
        matrixSaved(kit).forEach((m,i)=>{
          assert.ok(m.elements.every(Number.isFinite),'Nonfinite flight world transform');
          assert.ok(matrixEqual(invAfter.clone().multiply(m),relatives[i]),'Wing slipped relative to a rolling vehicle');
        });

        advance(kit,false,3); advance(kit,true);
        assert.deepEqual(stamp(kit),open,'Retract interruption did not settle identically');
        advance(kit,false);mustHide(kit,'Retraction left a visible orphan');
        advance(kit,true,3);advance(kit,false);
        mustHide(kit,'Launch interruption left a visible orphan');
        advance(kit,true);advance(kit,false);
        assert.deepEqual(new Set(meshNodes(kit).map(m=>m.geometry)),allGeometry,'Animator allocates new geometries');
        mustHide(kit,'Repeat deploy/retract left geometry visible');
      }finally{dispose(kit);disposeKart(kart);}
      assert.equal(kit.parent,null,'Disposed wing group still parented');
      const fresh=make(car,driver);
      const replacement=install(fresh,car);
      mustHide(replacement,'Restart carried deployed state to a fresh kart');
      dispose(replacement);disposeKart(fresh);
    }
  },15000);

  it('uses render seconds consistently at 30, 60, and 144 Hz',()=>{
    const kits=[30,60,144].map(()=>create('apex'));
    try{
      for(const [i,fps] of [30,60,144].entries()){
        for(let n=0;n<fps*.5;n++)frame(kits[i],true,1/fps);
        for(let n=0;n<fps/6;n++)frame(kits[i],false,1/fps);
      }
      const progress=kits.map(k=>k.userData.kartWings.progress);
      assert.ok(progress.every(p=>p>0&&p<1),'Expected mid-retract pose');
      assert.ok(progress.every(p=>close(p,progress[0])),'Animation timing varies with frame rate');
      const visible=stamp(kits[0]);
      for(const dt of [0,NaN,Infinity,-.1])frame(kits[0],true,dt);
      assert.deepEqual(stamp(kits[0]),visible,'Invalid/paused delta changed pose');
      advance(kits[0],true);
      frame(kits[0],false,.419);
      assert.ok(kits[0].visible,'Wing disappeared before the 420ms landing-stow finished');
      frame(kits[0],false,.001);
      mustHide(kits[0],'Wing was still visible at 420ms after a continuous stow');
    }finally{kits.forEach(dispose);}
  });

  it('resets a reused kart on ground and in-air starts, and supports reduced motion',()=>{
    const car=CARS.find(c=>c.id==='ringrunner'),kart=make(car,DRIVERS[0]);
    const kit=install(kart,car);
    try{
      for(let i=0;i<40;i++)animateKart(kart,{...stock,flying:true},{},10+i*step,step);
      assert.ok(meshNodes(kit,true).length>0,'Integrated renderer did not deploy');
      const opened=stamp(kit);
      resetKartWingPose(kart,false);mustHide(kit,'Reused stock kart retained old race wings');
      resetKartWingPose(kart,true);
      assert.deepEqual(stamp(kit),opened,'In-flight test sector starts should not animate from closed');
      const oldStamp=stamp(kit);
      animateKart(kart,{...stock,flying:false},{},11,0);
      assert.deepEqual(stamp(kit),oldStamp,'Paused clock advanced wing pose');
      animateKart(kart,{...stock,flying:false},{},11,step,true);
      mustHide(kit,'Reduced motion ignored stow');
      animateKart(kart,{...stock,flying:true},{},11,step,true);
      assert.deepEqual(stamp(kit),opened,'Reduced motion ignored deployment');
    }finally{disposeKart(kart);}
    assert.equal(kit.parent,null,'Integrated kart disposal failed to remove the wings');
  });

  it('shares immutable parts but not flight state across player, AI and ghost instances',()=>{
    const car=CARS.find(c=>c.id==='apex'),driver=DRIVERS[0],scene=new T.Scene();
    const player=make(car,driver),ai=make(car,driver,3),ghost=make(car,driver,0,true);
    const groups=[player,ai,ghost].map(k=>install(k,car));
    [player,ai,ghost].forEach(k=>scene.add(k));
    const geometries=groups.map(g=>meshNodes(g).map(m=>m.geometry));
    assert.notEqual(groups[0],groups[1]);
    assert.ok(geometries[0].some(g=>geometries[1].includes(g)&&geometries[2].includes(g)),'No cross-instance cached wing geometry');
    const shared=[...new Set(geometries[0].filter(g=>geometries.slice(1).every(set=>set.includes(g))))];
    const disposal=new Map(shared.map(g=>[g,0]));
    for(const g of shared)g.addEventListener('dispose',()=>disposal.set(g,disposal.get(g)+1));
    assert.equal(wingsApi.disposeKartWingAssets(),false,'Global teardown accepted live kit instances');
    advance(groups[0],true);
    mustHide(groups[1],'Player deploy changed AI state');
    mustHide(groups[2],'Player deploy changed ghost state');
    advance(groups[1],true);advance(groups[2],true);
    const aiPose=stamp(groups[1]),ghostPose=stamp(groups[2]);
    dispose(groups[0]);disposeKart(player);
    assert.equal(scene.children.length,2);
    assert.ok([...disposal.values()].every(v=>v===0),'Disposing player freed assets still owned by AI or ghost');
    assert.deepEqual(stamp(groups[1]),aiPose);assert.deepEqual(stamp(groups[2]),ghostPose);
    for(const [i,k] of [ai,ghost].entries()){dispose(groups[i+1]);disposeKart(k);}
    assert.equal(scene.children.length,0);
    assert.equal(wingsApi.disposeKartWingAssets(),true,'Cache teardown refused after all instances were removed');
    assert.ok([...disposal.values()].every(v=>v===1),'Global teardown did not release cached geometry once');
    const fresh=create(car.id);
    try{
      assert.ok(meshNodes(fresh).every(n=>!disposal.has(n.geometry)),'Reinitialization reused previously disposed geometry');
      mustHide(fresh,'New renderer after teardown inherited in-flight state');
    }finally{dispose(fresh);}
  });
});

// Distinguish bounding-box proximity from actual geometry bounds penetration:
// shared interior along lateral probe intervals in the body frame. This is a sampling
// diagnostic rather than mesh CSG; report physical risk, don't veto harmless tangency.
const directions=new T.Vector3(-1,0,0);
function getIntervals(ray,mesh,body){
  const xs=ray.intersectObject(mesh,false).map(hit=>body.worldToLocal(hit.point).x);
  const hits=xs.filter((x,i)=>i===0||Math.abs(x-xs[i-1])>1e-5);
  const result=[];
  for(let i=1;i<hits.length;i+=2)result.push([hits[i],hits[i-1]]);
  return result;
}
function overlapProbe(a,b,body,box,details){
  const yWidth=box.max.y-box.min.y,zWidth=box.max.z-box.min.z;
  if(yWidth<.028||zWidth<.028||box.max.x-box.min.x<.028)return 0;
  const dir=directions.clone().transformDirection(body.matrixWorld);
  const ray=new T.Raycaster(newVec(),dir,0,18);
  let count=0;
  for(let yi=0;yi<4;yi++)for(let zi=0;zi<5;zi++){
    ray.ray.origin.copy(body.localToWorld(new T.Vector3(8,box.min.y+yWidth*(yi+.5)/4,box.min.z+zWidth*(zi+.5)/5)));
    const ah=getIntervals(ray,a,body),bh=getIntervals(ray,b,body);
    let found=false;
    for(const [al,ar] of ah)for(const [bl,br] of bh){
      const low=Math.max(al,bl),high=Math.min(ar,br),penetration=high-low;
      if(penetration<=.045)continue;
      found=true;
      if(penetration>(details.penetration??0)){
        details.penetration=+penetration.toFixed(3);
        const pt=body.worldToLocal(ray.ray.origin.clone());
        details.at=[(low+high)/2,pt.y,pt.z].map(x=>+x.toFixed(3));
        details.wing=a.parent.name;
        details.blocker=b.name;
      }
    }
    if(found)count++;
  }
  return count;
}
function exhaustProbe(meshes,body,spec){
  const hits=[];
  const dir=new T.Vector3(0,0,1).transformDirection(body.matrixWorld);
  for(const [x,y] of [[0,0],[.32,0],[-.32,0],[0,.32],[0,-.32]]){
    const pt=body.localToWorld(new T.Vector3(spec.x+x*spec.r,spec.y+y*spec.r,spec.z+.01));
    const ray=new T.Raycaster(pt,dir,0,.8*body.scale.x);
    if(ray.intersectObjects(meshes,false).length)hits.push([x,y]);
  }
  return hits.length;
}

describe('flight reach and mechanical clearance sweep',()=>{
  const reports=[];
  const sprung=new Set(['geep','hexshift','skipper','track-formula','track-hot-rod','steam-sprint','bone-wyrm']);
  for(const car of CARS.filter(car=>!excluded.has(car.id)))it(`${car.id} deployed and transition geometry probes`,()=>{
    for(const driver of DRIVERS){
      const kart=make(car,driver),{body,wheels,flames}=kart.userData;
      const kit=install(kart,car);
      try{
        const buckets={driver:meshNodes(kart.userData.driver),
          wheel:wheels.flatMap(w=>[...meshNodes(w),...(w.userData.fork?meshNodes(w.userData.fork):[])]),};
        const blockerSet=Object.values(buckets).flat(),materialSides=new Map(blockerSet.map(n=>[n.material,n.material.side]));
        try{
          for(const mat of materialSides.keys())mat.side=T.DoubleSide;
          let previousTick=0,previousPass='launch';
          const openFrames=[1,7,14,21,28,35],settleFrames=[1,6,12,18,24,26];
          const phases=[...openFrames.map(tick=>({tick,pass:'launch'})),
            ...settleFrames.map(tick=>({tick,pass:'land'})),
            ...(sprung.has(car.id)?settleFrames.map(tick=>({tick,pass:'spring'})):[])];
          const landed=createKart(car),flat={width:80,curvature:0,grade:0,bank:0};
          Object.assign(landed,{s:48,speed:48,steer:-.83,suspensionVelocity:-1.6,landed:true});
          let groundFrames=0;
          for(const {tick,pass} of phases){
            const launching=pass==='launch';
            if(pass!==previousPass){
              previousTick=0;previousPass=pass;
              if(pass==='spring')advance(kit,true);
            }
            if(pass==='spring')while(groundFrames<tick-1){
              stepKart(landed,{throttle:1,steer:tick%2?-.83:.81},flat,{},step);
              groundFrames++;
            }
            const n=tick-previousTick;
            previousTick=tick;
            for(let i=0;i<n;i++)frame(kit,launching);
            const motion=launching ? {...roll,steer:tick%2?.82:-.9,s:22+tick*.5,stunRemaining:.34-tick*.008}
              : pass==='spring'?landed
              : {...stock,s:48+tick*.7,speed:48,steer:tick%2?-.83:.81,suspension:.05*Math.sin(tick*.22),hopLift:.10*Math.max(0,1-tick/10)};
            animateKart(kart,motion,boosted,tick/60);
            kart.updateMatrixWorld(true);
            const wings=meshNodes(kit,true),stats={};
            for(const [label,blockers] of Object.entries(buckets)){
              // Wheel geometry can use separate rubber and rim; report the largest
              // exact overlap score rather than summing coplanar sub-meshes.
              let max=0;const details={};
              for(const wing of wings){
                const wb=worldBounds([wing],body);
                for(const blocker of blockers){
                  const overlap=worldBounds([blocker],body).intersect(wb);
                  if(!overlap.isEmpty())max=Math.max(max,overlapProbe(wing,blocker,body,overlap,details));
                }
              }
              if(max>1)stats[label==='driver'?'rider':label]={rays:max,...details};
            }
            const clearance=flames.map(f=>exhaustProbe(wings,body,f.spec));
            if(clearance.some(n=>n>0))stats.exhaust=clearance;
            if(Object.keys(stats).length)reports.push({car:car.id,driver:driver.id,pass,tick,...stats});
            if(!launching&&tick===26)mustHide(kit,'Wing mesh remained after the landing stow duration');
          }
        }finally{for(const [mat,side] of materialSides)mat.side=side;}
      }finally{dispose(kit);disposeKart(kart);}
    }
  },20000);
  it('does not obstruct the rider, wheels or exhaust through deployment or land-stow',()=>{
    if(reports.length){
      process.stderr.write('WING_CLEARANCE '+JSON.stringify(reports)+'\n');
      const first=reports.slice(0,8).map(({car,driver,pass,tick,...parts})=>
        `${car}/${driver} ${pass} @ ${tick}f: ${Object.entries(parts).map(([label,v])=>
          Array.isArray(v)?`blocked ${label} rays [${v}]`:`${label} ${v.penetration}m (${v.rays} rays) at [${v.at}]`).join('; ')}`).join(' | ');
      assert.fail(`${reports.length} sampled wing interferences: ${first}`);
    }
  });
});
