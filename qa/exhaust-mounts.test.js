import {describe,it,expect} from 'vitest';
import * as T from 'three';
import {CARS,DRIVERS} from '../src/roster.js';
import {animateKart,disposeKart,makeKart} from '../src/kart-art.js';
import {exhaustSpec} from '../src/kart-exhaust.js';
HTMLCanvasElement.prototype.getContext=function(){
  const canvas=this,gradient={addColorStop(){}};
  return new Proxy({canvas,createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,
    getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(Math.max(0,w*h*4))}),
    measureText:()=>({width:20})},{get:(obj,key)=>key in obj?obj[key]:(()=>{})});
};


const axis=new T.Vector3(0,0,-1);
function inspectOutletSpace(kart){
  const {body,flames,wheels,driver}=kart.userData;
  const shell=body.children.filter(n=>n.isMesh&&n.name!=='exhaust-hardware');
  const rolling=wheels.flatMap(w=>w.userData.conceptParts??w.children).filter(n=>n.isMesh);
  const blockers=[...shell,...rolling,...driver.children.filter(n=>n.isMesh)];
  kart.updateMatrixWorld(true);
  const materials=new Map(blockers.map(n=>[n.material,n.material.side]));
  try{
    for(const mat of materials.keys())mat.side=T.DoubleSide;
    const dir=axis.clone().transformDirection(body.matrixWorld);
    for(const {spec} of flames){
      const {x,y,z,r}=spec;
      let reachesMount=false;
      for(const [dx,dy] of [[0,0],[-.55,0],[.55,0],[0,.55],[0,-.55]]){
        const origin=body.localToWorld(new T.Vector3(x+dx*r,y+dy*r,z+2));
        const ray=new T.Raycaster(origin,dir,0,8);
        const hits=ray.intersectObjects(blockers,false);
        if(hits.length){
          const rear=body.worldToLocal(hits[0].point).z;
          expect(rear, `${kart.userData.car} rear geometry blocks exhaust`).toBeLessThanOrEqual(z+.008);
        }
        const backing=ray.intersectObjects(shell,false)[0];
        if(backing){
          const backZ=body.worldToLocal(backing.point).z;
          reachesMount ||= z-backZ <= (spec.depth??(spec.kind==='jets'?.22:.19))+.014;
        }
      }
      expect(reachesMount,`${kart.userData.car} has an unsupported outlet`).toBe(true);
    }
  }finally{for(const [mat,side] of materials)mat.side=side;}
}

const mountTestState={speed:38,steer:.55,s:42,y:.18,hopLift:.25,suspension:.09,
  stunRemaining:.2,hitRollSide:1,slipAngle:.16};
describe('physical exhaust outlets and animated boosts',()=>{
  for(const car of CARS)it(`${car.name} emits only at real outlets through hop and roll`,()=>{
    const kart=makeKart(0,car,DRIVERS[0]),{flames,body}=kart.userData;
    expect(flames.length).toBe(exhaustSpec(car.id).length);
    expect(flames.length).toBeGreaterThan(0);
    inspectOutletSpace(kart);
    expect(new Set(flames.flatMap(x=>x.hardware)).size).toBe(1);
    for(const effect of flames){
      const {aperture,nozzle,hardware,spec}=effect;
      expect([spec.x,spec.y,spec.z,spec.r].every(Number.isFinite)).toBe(true);
      expect(spec.r).toBeGreaterThan(.045);
      expect(hardware.length).toBeGreaterThan(0);
      expect(nozzle.parent).toBe(body);
      expect(nozzle.position.distanceTo(aperture)).toBeLessThan(1e-7);
      for(const part of hardware){
        expect(part.parent).toBe(body);
        expect(part.geometry.attributes.position.count).toBeGreaterThan(20);
        expect(kart.userData.solidMeshes).toContain(part);
      }
      expect(nozzle.visible).toBe(false);
    }
    animateKart(kart,mountTestState,{plume:.71,ignition:.82,flameTier:1},.3);
    const normalColors=flames.map(({outerPaint})=>outerPaint.color.getHex());
    kart.updateMatrixWorld(true);
    for(const effect of flames){
      const {nozzle,outer,hardware,ring,spec,aperture}=effect;
      expect(nozzle.visible).toBe(true);
      expect(ring.visible).toBe(true);
      const world=body.localToWorld(aperture.clone());
      const exit=outer.localToWorld(new T.Vector3());
      const worldAxis=body.localToWorld(aperture.clone().add(new T.Vector3(0,0,1))).sub(world);
      expect(exit.distanceTo(world.clone().addScaledVector(worldAxis,.006))).toBeLessThan(1e-6);
      expect(hardware[0].localToWorld(aperture.clone()).distanceTo(world)).toBeLessThan(1e-6);
      expect(outer.scale.x).toBeLessThan(spec.r*.71);
      expect(outer.scale.z).toBeGreaterThan(.5);
    }
    animateKart(kart,mountTestState,{plume:.75,ignition:.1,flameTier:2},.8);
    expect(flames.every(({outerPaint},i)=>outerPaint.color.getHex()!==normalColors[i])).toBe(true);
    animateKart(kart,mountTestState,{plume:0,ignition:0,flameTier:0},1.8);
    expect(flames.every(({nozzle,hardware})=>!nozzle.visible&&hardware.every(part=>part.visible))).toBe(true);
    disposeKart(kart);
  });
  it('keeps shared geometry alive when replacing one preview and keeps ghost exhaust off',()=>{
    const car=CARS.find(x=>x.id==='track-formula');
    const player=makeKart(0,car),other=makeKart(1,car,DRIVERS[3],true);
    let disposed=false;
    player.userData.flames[0].outer.geometry.addEventListener('dispose',()=>{disposed=true});
    animateKart(player,mountTestState,{plume:.8,ignition:.65,flameTier:2},.4);
    animateKart(other,mountTestState,{tier:0},.4);
    expect(other.userData.flames.every(f=>!f.nozzle.visible)).toBe(true);
    expect(player.userData.flames[0].outer.material).not.toBe(other.userData.flames[0].outer.material);
    disposeKart(player);
    expect(disposed).toBe(false);
    disposeKart(other);
  });
});
