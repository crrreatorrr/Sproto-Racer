import {describe,it,expect} from 'vitest';
import * as T from 'three';
import {animateKart,disposeKart,makeKart} from '../src/kart-art.js';
import {conceptArt} from '../src/concept-art.js';
import {CARS,DRIVERS} from '../src/roster.js';

const directVisibilityPoints=[[-.24,1.19,-.62],[.24,1.19,-.62],[0,.76,-.53]];
describe('refined reference drivers',()=>{
  it('faces both recessed wheel dishes outward in the garage',()=>{
    const built=makeKart(0,CARS.find(x=>x.id==='sky-mixer'));
    try{
      built.updateMatrixWorld(true);
      const wheels=built.userData.wheels;
      for(const side of [-1,1]){
        const w=wheels.find(x=>Math.sign(x.position.x)===side);
        const r=w.userData.rideHeight,origin=w.localToWorld(new T.Vector3(side*3,.51*r,.085*r));
        const dir=new T.Vector3(-side,0,0);
        const face=w.children.filter(p=>p.isMesh&&p.material.metalness>.45);
        const result=new T.Raycaster(origin,dir,0,3.5).intersectObjects(face,false)[0];
        expect(result,'wheel dish must be visible from outside').toBeDefined();
        expect(result.face.normal.x*side).toBeGreaterThan(.4);
      }
    }finally{disposeKart(built);}
  });
  it('uses a shared sculpt for each identity without changing the cockpit anchors',()=>{
    const previous=new Map();
    for(const design of conceptArt)for(const person of DRIVERS){
      const car=CARS.find(c=>c.id===design.id),kart=makeKart(0,car,person);
      const driver=kart.userData.driver,{x,y,z,scale}=design.mount;
      try{
        expect(driver.position.toArray()).toEqual([x,y,z]);
        expect(driver.scale.toArray()).toEqual([scale,scale,scale]);
        const geo=driver.children.map(p=>p.geometry);
        if(previous.has(person.id))expect(geo.every((g,i)=>g===previous.get(person.id)[i])).toBe(true);
        else previous.set(person.id,geo);
        expect(driver.children.every(m=>m.userData.sharedKartPart&&m.geometry.hasAttribute('normal'))).toBe(true);
        const native=new T.Box3().setFromObject(driver,true);
        expect((native.max.x-x)/scale).toBeLessThan(.90);
        expect((x-native.min.x)/scale).toBeLessThan(.90);
        expect((native.max.y-y)/scale).toBeLessThan(1.79);
        expect((z-native.min.z)/scale).toBeLessThan(.70);
        for(const steering of [-.65,.65]){
          animateKart(kart,{speed:39,s:16,slipAngle:steering,steer:steering,hopLift:.4,suspension:.07},{plume:.78,ignition:.45,flameTier:2},.42);
          kart.updateMatrixWorld(true);
          const original=directVisibilityPoints.map(pos=>driver.localToWorld(new T.Vector3(...pos)));
          expect(original.every(v=>[v.x,v.y,v.z].every(Number.isFinite))).toBe(true);
        }
      }finally{disposeKart(kart);}
    }
    expect(new Set([...previous.values()].flat()).size).toBeGreaterThanOrEqual(8);
  }, 25000);
});
