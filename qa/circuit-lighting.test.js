import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {createCircuitLighting} from '../src/circuit-lighting.js';

describe('bounded local circuit lighting',()=>{
 const renderer=()=>({shadowMap:{},capabilities:{maxTextureSize:4096}});
 const make=(geometry=new THREE.BoxGeometry(),material=new THREE.MeshLambertMaterial())=>new THREE.Mesh(geometry,material);
 it('keeps only opaque useful casters and stays inside the local map budget',()=>{
  const world=new THREE.Scene(),r=renderer(),a=createCircuitLighting(world,r);
  const road=make(),floor=make(new THREE.PlaneGeometry(18000,18000)),sign=make(undefined,new THREE.MeshBasicMaterial()),crate=make();
  crate.name='pickupCrates';
  const group=new THREE.Group();group.add(road,floor,sign,crate);
  a.prepareTrack(group);a.prepareTrack(group);
  expect(road.castShadow&&road.receiveShadow).toBe(true);
  expect(!floor.castShadow&&floor.receiveShadow).toBe(true);
  expect(sign.castShadow||sign.receiveShadow).toBe(false);
  expect(!crate.castShadow&&crate.receiveShadow).toBe(true);
  expect(a.sun.shadow.mapSize.x).toBe(2048);
  expect(r.shadowMap.autoUpdate).toBe(false);
  const car=new THREE.Group(),body=new THREE.Group(),tire=make();car.userData.body=body;body.add(tire);
  a.prepareKart(car,true);expect(tire.castShadow).toBe(false);
  a.prepareKart(car);expect(tire.castShadow).toBe(true);
 });
 it('changes palette and softly follows the player on a throttled, snapped grid',()=>{
  const r=renderer(),a=createCircuitLighting(new THREE.Scene(),r);
  const track={sample:s=>({position:{x:s*.761,y:17.13,z:-39.24}})},k={s:100,x:0};
  a.atmosphere('track02');const winter=a.sun.color.getHex();
  a.focus(track,k,0);expect(r.shadowMap.needsUpdate).toBe(true);
  const old=a.sun.target.position.x;
  r.shadowMap.needsUpdate=false;k.s+=7;a.focus(track,k,.01);
  expect(r.shadowMap.needsUpdate).toBe(false);expect(a.sun.target.position.x).toBe(old);
  a.focus(track,k,.04);expect(r.shadowMap.needsUpdate).toBe(true);expect(a.sun.target.position.x).toBeGreaterThan(old);
  a.atmosphere('track03');expect(a.sun.color.getHex()).not.toBe(winter);
 });
 it('keeps a clean map-free escape hatch for low-power GPUs',()=>{
  const a=createCircuitLighting(new THREE.Scene(),renderer(),{enabled:false});
  const group=new THREE.Group(),m=make();group.add(m);a.prepareTrack(group);
  expect(a.sun.castShadow||m.receiveShadow||m.castShadow).toBe(false);
 });
});
