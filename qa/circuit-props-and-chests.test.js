import {expect,it} from 'vitest';
import * as T from 'three';
import {makeCircuitProp,CIRCUIT_PROP_NAMES} from '../src/circuit-props.js';
import {createSkyChests,makePickupGeometry} from '../src/pickup-chest.js';

it('uses real painted scene kits with bounded reusable placement geometry',()=>{
 expect(CIRCUIT_PROP_NAMES.length).toBeGreaterThan(10);
 for(const name of CIRCUIT_PROP_NAMES){
   const g=makeCircuitProp(name);
   const a=g.attributes.position,color=g.attributes.color;
   expect(a.count).toBeGreaterThan(200);
   expect(color.count).toBe(a.count);
   for(const value of [...g.boundingBox.min,...g.boundingBox.max])expect(Math.abs(value)).toBeLessThanOrEqual(.50001);
   expect(a.count/3).toBeLessThan(1000);
   g.dispose();
 }
});
it('gives each chest a hinge and preserves one instanced air batch with independent claim flags',()=>{
 const g=makePickupGeometry();
 const a=g.attributes.aPickupPart;
 expect(a.count/3).toBeLessThan(1000);
 expect(new Set(a.array).size).toBeGreaterThanOrEqual(4);
 g.dispose();
 const batch=createSkyChests([2,4,8].map(index=>({index,position:new T.Vector3(index,0,0),yaw:.5})));
 const mesh=batch.mesh,attr=mesh.geometry.attributes.aPickupState;
 expect(mesh.count).toBe(3);
 expect(mesh.isInstancedMesh).toBe(true);
 const startVersion=attr.version;
 batch.update(.1,0);expect(attr.version).toBe(startVersion);
 batch.update(.2,1<<4);expect(attr.getY(0)).toBe(0);expect(attr.getY(1)).toBe(1);expect(attr.getY(2)).toBe(0);
 const open=attr.version;
 batch.update(.35,1<<4);expect(attr.version).toBe(open);
 batch.update(0,0);expect(attr.getY(1)).toBe(0);
 mesh.geometry.dispose();mesh.material.dispose();mesh.dispose();
});
