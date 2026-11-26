import {describe,it,expect} from 'vitest';
import * as T from 'three';
import {conceptArt} from '../src/concept-art.js';
import {animateKart,disposeKart,makeKart} from '../src/kart-art.js';
import {kartFootprint} from '../src/kart-footprint.js';
import {CARS,DRIVERS,carById} from '../src/roster.js';

describe('reference concept roster',()=>{
  it('lists 36 distinct playable additions without replacing any existing car',()=>{
    expect(conceptArt.length).toBe(36);
    expect(new Set(CARS.map(c=>c.id)).size).toBe(CARS.length);
    expect(CARS.length).toBe(50);
    expect(conceptArt.every(c=>carById(c.id).id===c.id)).toBe(true);
  });
  for(const design of conceptArt)it(`builds and animates ${design.name} with all four drivers`,()=>{
    const car=carById(design.id),[halfWidth,minZ,maxZ]=design.bounds;
    expect(car.bounds).toEqual(design.bounds);
    expect(halfWidth).toBeGreaterThan(0);
    expect(minZ).toBeLessThan(0);
    expect(maxZ).toBeGreaterThan(0);
    const footprint=kartFootprint({tuning:car,steer:0,yaw:0});
    expect(footprint.body.points.length).toBeGreaterThan(3);
    expect(design.wheels.length===0).toBe(!!design.hover);
    for(const person of DRIVERS){
      const kart=makeKart(0,car,person),{body,driver,wheels,flames}=kart.userData;
      const visual=new T.Box3();
      for(const child of body.children){
        if(!flames.some(f=>f.nozzle===child))visual.expandByObject(child,true);
      }
      const box=visual;
      expect(wheels.length).toBe(design.wheels.length);
      expect(box.isEmpty()).toBe(false);
      expect(box.min.y).toBeGreaterThan(-.12);
      expect(Math.max(-box.min.x,box.max.x)-halfWidth).toBeLessThan(.35);
      expect(minZ-box.min.z).toBeLessThan(.35);
      expect(box.max.z-maxZ).toBeLessThan(.35);
      const driverBox=new T.Box3().setFromObject(driver,true);
      expect(driverBox.isEmpty()).toBe(false);
      expect(driverBox.min.y).toBeGreaterThan(.1);
      expect(driver.scale.x).toBeGreaterThan(.42);
      let triangles=0, meshes=0;
      body.traverse(m=>{
        if(!m.isMesh)return;
        triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;
        meshes++;
      });
      expect(triangles).toBeLessThan(30000);
      expect(meshes).toBeLessThan(35);
      animateKart(kart,{speed:16,steer:.5,s:20,y:.12,hopLift:.2},{},3);
      for(const w of wheels){
        const r=w.rotation[w.userData.spinAxis];
        expect(Number.isFinite(r)).toBe(true);
        expect(Math.abs(r)).toBeGreaterThan(0);
        if(w.userData.steer)expect(Math.abs(w.rotation.y)).toBeGreaterThan(0);
      }
      disposeKart(kart);
    }
  });
});
