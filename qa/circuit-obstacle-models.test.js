import {expect,it} from 'vitest';
import * as THREE from 'three';
import {createSkyCrossingArt} from '../src/sky-crossing-art.js';

for(const id of ['plane','birds','satellite'])it('keeps the '+id+' art inside its one-draw collision envelope',()=>{
 const model=createSkyCrossingArt(id);
 const meshes=[];model.traverse(o=>{if(o.isMesh)meshes.push(o)});
 expect(meshes.length).toBe(1);
 for(const heading of [0,Math.PI]){
  model.rotation.y=heading;
  model.userData.animateCrossing?.(7,heading?-1:1);
  const bounds=new THREE.Box3().setFromObject(model);
  for(const v of [...bounds.min,...bounds.max])expect(Math.abs(v)).toBeLessThanOrEqual(.50001);
 }
 let n=0;
 meshes[0].geometry.addEventListener('dispose',()=>n++);
 model.userData.disposeCrossing();
 model.userData.disposeCrossing();
 expect(n).toBe(1);
});
