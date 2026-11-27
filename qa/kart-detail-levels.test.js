import {describe,it,expect} from 'vitest';
import * as T from 'three';
import {CARS,DRIVERS} from '../src/roster.js';
import {makeKart,animateKart,disposeKart,setKartDetail,updateKartDetail,kartRenderStats,
  KART_LOD_NEAR,KART_LOD_FAR} from '../src/kart-art.js';
import {updateRivalVisibility,kartIsFaded} from '../src/kart-visibility.js';

HTMLCanvasElement.prototype.getContext=function(){
  const canvas=this,gradient={addColorStop(){}};
  return new Proxy({canvas,createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,
    getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(Math.max(0,w*h*4))}),
    measureText:()=>({width:20})},{get:(obj,key)=>key in obj?obj[key]:(()=>{})});
};

// Triangles of each car as the player gets it in a race (flight wings attached, every
// mesh counted whether shown or not). Recorded from `main` at a4cd91f; the one change is
// the Manta, +2 for the painted headlight pool that replaced its two spotlights.
// A car's art changing on purpose means updating its line here.
const FULL_TRIANGLES={
  apex:8934,needle:9230,pogo:9950,gecko:9294,relay:8982,geep:58950,hexshift:109022,barrage:31736,
  ironhide:48988,crestline:88576,manta:86158,saucer:51324,'shopping-cart':34554,skipper:64872,
  'track-formula':26322,'track-rally':29728,'track-prototype':31446,'track-hot-rod':29894,
  'track-drift':30928,'track-electric':30454,ringrunner:26236,windskiff:23108,'arctic-skip':17932,
  'bamboo-trike':25816,'mud-marauder':27324,'tarmac-press':21536,'violet-orbit':28352,'volt-fork':20968,
  'twin-current':31980,'rail-ghost':20432,'solar-cushion':27212,'sunny-sidecar':19840,
  'market-dragster':29492,'ramp-tug':24284,'tiki-barrel':30528,'ice-cream-van':24484,
  'groove-racer':25720,'bumper-bolt':20888,'bronze-bell':22580,'reed-skimmer':19928,
  'steam-sprint':32712,'amber-beetle':28988,'violet-marble':20700,'bone-wyrm':27484,
  'quarry-dumper':30518,'vermilion-loader':26516,'sky-mixer':32146,'boom-crane':29440,
  'mint-digger':27082,'forklift-rat':24724,
};
// What a rival may cost once it is beyond the switch distance.
const DISTANT_TRIANGLES=13500,DISTANT_DRAW_CALLS=10;
const FLEET_MEAN_TRIANGLES=8000,FLEET_MEAN_DRAW_CALLS=7;

const trianglesOf=geometry=>(geometry.index?geometry.index.count:geometry.attributes.position.count)/3;
function builtTriangles(kart){
  let total=0;
  kart.traverse(o=>{if(o.isMesh)total+=trianglesOf(o.geometry)*(o.isInstancedMesh?o.count:1);});
  return Math.round(total);
}
const rival=(car,driver=DRIVERS[1],id=1)=>makeKart(id,car,driver,false,{flightWings:true,lowDetail:true});
const cruising={speed:30,s:12,steer:.3};
function shownBounds(kart){
  const box=new T.Box3(),part=new T.Box3();
  kart.updateMatrixWorld(true);
  (function walk(o){
    if(!o.visible||o===kart.userData.shadow)return;
    if(o.isInstancedMesh){o.boundingBox=null;o.computeBoundingBox();box.union(part.copy(o.boundingBox).applyMatrix4(o.matrixWorld));}
    else if(o.isMesh){o.geometry.computeBoundingBox();box.union(part.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));}
    for(const child of o.children)walk(child);
  })(kart);
  return box;
}

describe('kart detail levels',()=>{
  it('lists every car in the roster',()=>{
    expect(Object.keys(FULL_TRIANGLES).sort()).toEqual(CARS.map(car=>car.id).sort());
  });

  for(const car of CARS)it(`${car.name}: the player's model is untouched and the distant build is within budget`,()=>{
    const player=makeKart(0,car,DRIVERS[0],false,{flightWings:true});
    expect(builtTriangles(player),'full-detail triangle count changed').toBe(FULL_TRIANGLES[car.id]);
    expect(player.userData.low,'the player never carries a distant build').toBeUndefined();
    let lights=0;
    player.traverse(o=>{if(o.isLight)lights++;});
    expect(lights,'a kart must not add lights to the scene').toBe(0);
    disposeKart(player);

    const kart=rival(car);
    animateKart(kart,cruising,{tier:0},1);
    const full=kartRenderStats(kart),fullBox=shownBounds(kart);
    setKartDetail(kart,true);
    animateKart(kart,cruising,{tier:0},1);
    const distant=kartRenderStats(kart),distantBox=shownBounds(kart);
    expect(distant.triangles,'distant build over its triangle budget').toBeLessThanOrEqual(DISTANT_TRIANGLES);
    expect(distant.drawCalls,'distant build over its draw-call budget').toBeLessThanOrEqual(DISTANT_DRAW_CALLS);
    expect(distant.triangles).toBeLessThan(full.triangles);
    expect(distant.drawCalls).toBeLessThan(full.drawCalls);
    if(full.triangles>20000)expect(distant.triangles/full.triangles).toBeLessThan(.5);
    // The two builds occupy the same space: no change of outline at the switch.
    const size=fullBox.getSize(new T.Vector3()),low=distantBox.getSize(new T.Vector3());
    for(const axis of ['x','y','z']){
      expect(Math.abs(size[axis]-low[axis]),`${axis} extent differs`).toBeLessThan(.09);
      expect(Math.abs(fullBox.min[axis]-distantBox.min[axis]),`${axis} edge moved`).toBeLessThan(.08);
    }
    disposeKart(kart);
  });

  it('keeps the whole roster inside the fleet budget',()=>{
    let triangles=0,drawCalls=0;
    for(const car of CARS){
      const kart=rival(car);
      setKartDetail(kart,true);
      animateKart(kart,cruising,{tier:0},1);
      const stats=kartRenderStats(kart);
      triangles+=stats.triangles;drawCalls+=stats.drawCalls;
      disposeKart(kart);
    }
    expect(triangles/CARS.length).toBeLessThanOrEqual(FLEET_MEAN_TRIANGLES);
    expect(drawCalls/CARS.length).toBeLessThanOrEqual(FLEET_MEAN_DRAW_CALLS);
  });

  it('switches by camera distance with a gap between the two thresholds',()=>{
    const player=makeKart(0,CARS[0],DRIVERS[0]),kart=rival(CARS.find(c=>c.id==='skipper'));
    const camera=new T.PerspectiveCamera();
    const at=distance=>{kart.position.set(0,0,-distance);updateKartDetail([player,kart],camera);return kart.userData.low.active;};
    expect(KART_LOD_FAR).toBeGreaterThan(KART_LOD_NEAR+2);
    expect(at(3)).toBe(false);
    expect(at(KART_LOD_FAR-.5),'still the full model inside the far threshold').toBe(false);
    expect(at(KART_LOD_FAR+.5)).toBe(true);
    expect(at(KART_LOD_NEAR+.5),'no flicker between the thresholds').toBe(true);
    expect(at(KART_LOD_NEAR-.5)).toBe(false);
    expect(at(KART_LOD_FAR-.5)).toBe(false);
    // The player's own kart is never asked to switch.
    updateKartDetail([kart,player],camera);
    expect(player.userData.low).toBeUndefined();
    disposeKart(player);disposeKart(kart);
  });

  it('keeps wheels, driver, lamps, exhaust and wings working on the distant build',()=>{
    for(const id of ['apex','shopping-cart','manta','hexshift','mud-marauder','twin-current']){
      const kart=rival(CARS.find(c=>c.id===id)),a=kart.userData;
      setKartDetail(kart,true);
      animateKart(kart,{speed:30,s:4,steer:0},{tier:0},1);
      const wheelBatches=a.low.batches.filter(batch=>!batch.instances[0].fork);
      expect(wheelBatches.reduce((n,batch)=>n+batch.instances.length,0),`${id} wheels`).toBe(a.wheels.length);
      const before=wheelBatches.map(batch=>batch.mesh.instanceMatrix.array.slice());
      // Roll forward, steer and hit a bump: every wheel instance follows its axle.
      animateKart(kart,{speed:30,s:4.7,steer:.6,suspension:.06},{tier:0},1.1);
      wheelBatches.forEach((batch,i)=>expect(batch.mesh.instanceMatrix.array,`${id} wheels follow the axles`).not.toEqual(before[i]));
      const axle=new T.Matrix4(),placed=new T.Matrix4();
      for(const {mesh,instances} of a.low.batches)instances.forEach(({axle:index,fork,local},i)=>{
        const source=fork?a.wheels[index].userData.fork:a.wheels[index];
        mesh.getMatrixAt(i,placed);
        expect(placed.elements.every((v,k)=>Math.abs(v-axle.multiplyMatrices(source.matrix,local).elements[k])<1e-6)).toBe(true);
      });
      // The full model's parts are all hidden; what both builds share is not.
      expect(a.fullParts.every(part=>!part.visible)).toBe(true);
      expect(a.low.driverParts.every(part=>part.visible&&part.parent===a.driver)).toBe(true);
      expect(a.shadow.visible).toBe(true);
      // Boost flames and flight wings ride on the body for both builds.
      animateKart(kart,{speed:40,s:5,steer:0,flying:true},{plume:.8,ignition:.6,flameTier:1,skyTier:1},1.2,1);
      expect(a.flames.every(flame=>flame.nozzle.visible&&flame.nozzle.parent===a.body)).toBe(true);
      if(a.wings)expect(a.wings.visible).toBe(true);
      // A hit tumbles the body, and the distant build is inside it.
      animateKart(kart,{speed:20,s:6,stunRemaining:.5,hitRollSide:1},{tier:0},1.3);
      expect(a.low.group.parent).toBe(a.body);
      expect(Math.abs(a.body.rotation.z)).toBeGreaterThan(.5);
      // The drift lamp lights up only while the meter is in the scoring bands.
      if(a.low.lamp){
        expect(a.low.lamp.visible).toBe(false);
        animateKart(kart,{speed:30,s:7,sliding:true},{meter:.95,chainClosed:false},1.4);
        expect(a.low.lamp.visible).toBe(true);
        expect(a.low.lamp.material).toBe(a.timingLamp);
      }
      setKartDetail(kart,false);
      expect(a.fullParts.every(part=>part.visible)).toBe(true);
      expect(a.low.group.visible||a.low.driverParts.some(part=>part.visible)).toBe(false);
      disposeKart(kart);
    }
  });

  it('never shows the distant build while a rival fades out in front of the camera',()=>{
    const camera=new T.PerspectiveCamera(62,16/9,.15,2300);
    camera.position.set(0,2.5,40);camera.lookAt(0,1.2,0);camera.updateMatrixWorld(true);
    const car=CARS.find(c=>c.id==='ironhide');
    const player=makeKart(0,car,DRIVERS[0]),blocker=rival(car),bystander=rival(car,DRIVERS[2],2);
    // 30 m from the camera, but directly between it and the player.
    blocker.position.set(0,0,10);bystander.position.set(9,0,10);
    for(const kart of [player,blocker,bystander])animateKart(kart,{speed:45,s:10},{tier:0},1);
    const models=[player,blocker,bystander];
    updateKartDetail(models,camera);
    expect(blocker.userData.low.active).toBe(true);
    updateRivalVisibility(camera,models,0);
    updateKartDetail(models,camera);
    expect(kartIsFaded(blocker)).toBe(true);
    expect(blocker.userData.low.active,'a faded rival shows its full model').toBe(false);
    expect(bystander.userData.low.active).toBe(true);
    // The fade never clones or touches the distant build's materials.
    const distant=[];
    blocker.traverse(o=>{if(o.userData.lowDetail)distant.push(o);});
    expect(distant.length).toBeGreaterThan(3);
    expect(distant.every(o=>!o.material.transparent||o.material.opacity>=.2)).toBe(true);
    let shown=0;
    blocker.traverse(o=>{if(o.isMesh&&o.visible&&o.parent.visible&&!o.userData.lowDetail&&o!==blocker.userData.shadow&&o.material.opacity>.2)shown++;});
    expect(shown,'no part of the fading rival is left opaque').toBe(0);
    for(const kart of models)disposeKart(kart);
    expect(kartIsFaded(blocker)).toBe(false);
  });

  it('shares geometry between rivals of the same car and survives their disposal',()=>{
    for(const id of ['apex','skipper','track-formula']){
      const car=CARS.find(c=>c.id===id);
      const first=rival(car,DRIVERS[1],1),second=rival(car,DRIVERS[2],2);
      const parts=kart=>kart.userData.low.group.children.filter(o=>o.isMesh);
      expect(parts(first).length).toBeGreaterThan(1);
      parts(first).forEach((mesh,i)=>{
        expect(parts(second)[i].geometry,`${id} distant part ${i}`).toBe(mesh.geometry);
        if(mesh.material!==first.userData.timingLamp)expect(parts(second)[i].material).toBe(mesh.material);
      });
      // The full model's folded shell, seat and wheels are shared too.
      const folded=kart=>kart.userData.body.children.filter(o=>o.isMesh&&o.geometry.attributes.color&&!o.userData.lowDetail).map(o=>o.geometry);
      expect(folded(first).some(geometry=>folded(second).includes(geometry))).toBe(true);
      expect(first.userData.shadow.material).toBe(second.userData.shadow.material);
      let disposed=0;
      for(const mesh of parts(second))mesh.geometry.addEventListener('dispose',()=>disposed++);
      disposeKart(first);
      expect(disposed,'disposing one rival must not free what another still draws').toBe(0);
      expect(first.userData.low.group.parent).toBe(null);
      setKartDetail(second,true);
      animateKart(second,cruising,{tier:0},1);
      expect(kartRenderStats(second).triangles).toBeGreaterThan(500);
      disposeKart(second);
    }
  });

  it('lights the Manta without scene lights, and only the player casts a pool on the road',()=>{
    const car=CARS.find(c=>c.id==='manta');
    const pool=kart=>kart.getObjectByName('headlight-pool');
    const player=makeKart(0,car,DRIVERS[0]),other=rival(car),ghost=makeKart(0,car,DRIVERS[0],true);
    expect(pool(player)?.parent).toBe(player.userData.shadow);
    expect(pool(other)).toBeUndefined();
    expect(pool(ghost)).toBeUndefined();
    for(const kart of [player,other,ghost]){
      let lights=0;
      kart.traverse(o=>{if(o.isLight)lights++;});
      expect(lights).toBe(0);
      disposeKart(kart);
    }
  });
});
