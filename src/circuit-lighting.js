import * as THREE from 'three';

// The shadow map is a local bubble around the racing line, not a texture of the
// entire 8 km course. Foreground models get crisp contact while the skyline is
// always the painted atmosphere and does not enter the shadow pass.
export const CIRCUIT_LIGHT = Object.freeze({
  track01:{sun:0xffddb0,day:0xe3f5ff,bounce:0x81988a,key:2.72,ambient:1.24,dir:[-.48,.72,-.5],contrast:.72},
  track02:{sun:0xf3f7ff,day:0xd5e9ff,bounce:0x91a8c6,key:2.07,ambient:1.57,dir:[.43,.82,-.39],contrast:.49},
  track03:{sun:0xffca8c,day:0xc3d9f5,bounce:0xa1908c,key:2.92,ambient:1.24,dir:[-.30,.56,-.74],contrast:.78},
});

function lit(material){
 return material&&(material.isMeshLambertMaterial||material.isMeshPhongMaterial||material.isMeshStandardMaterial)&&!material.transparent;
}

export function createCircuitLighting(world,renderer,{enabled=true}={}){
 const ambient=new THREE.HemisphereLight();
 const sun=new THREE.DirectionalLight();
 world.add(ambient,sun,sun.target);
 const active=!!enabled;
 if(active){
   renderer.shadowMap.enabled=true;
   renderer.shadowMap.type=THREE.PCFShadowMap;
   renderer.shadowMap.autoUpdate=false;
 }
 sun.castShadow=active;
 const film=sun.shadow;
 const size=Math.min(2048,renderer.capabilities?.maxTextureSize??2048);
 film.mapSize.set(size,size);
 film.radius=2.2;
 film.normalBias=.07;
 film.bias=-.00045;
 film.camera.left=-66;film.camera.right=66;
 film.camera.top=66;film.camera.bottom=-66;
 film.camera.near=4;film.camera.far=272;
 film.camera.updateProjectionMatrix();
 const seen=new WeakSet(), direction=new THREE.Vector3(), stamp=new THREE.Vector3(Infinity,Infinity,Infinity);
 let last=-1,force=true;
 function atmosphere(id){
   const p=CIRCUIT_LIGHT[id]??CIRCUIT_LIGHT.track01;
   sun.color.setHex(p.sun);sun.intensity=p.key;
   ambient.color.setHex(p.day);ambient.groundColor.setHex(p.bounce);ambient.intensity=p.ambient;
   direction.set(...p.dir).normalize();
   film.intensity=p.contrast;
   force=true;
 }
 function prepareTrack(root){
   if(!active||!root||seen.has(root))return;
   seen.add(root);
   root.traverse(m=>{
    if(!m.isMesh||!lit(m.material))return;
    m.receiveShadow=true;
    // Opaque decks, terrain and props cast. The unbounded ground and the GPU
    // animated item crates are receivers only; their local cue already exists.
    const ground=m.geometry?.type==='PlaneGeometry'&&m.geometry?.parameters?.width>1000;
    m.castShadow=!ground&&m.name!=='pickupCrates'&&m.name!=='Circuit puddle patches';
   });
   force=true;
 }
 function prepareKart(kart,ghost=false){
   if(!active||ghost||!kart)return;
   kart.userData.body.traverse(m=>{
    if(!m.isMesh||!lit(m.material))return;
    m.castShadow=true;
    // Keep the faceted characters readable at chase size; machinery and
    // mountains still receive sunlight shadows instead of floating above.
   });
 }
 function focus(track,kart,time,forceNow=false){
   if(!active||!kart)return;
   const jumped=time<last||time-last>.3;
   if(!force&&!forceNow&&!jumped&&time-last<1/28)return;
   const f=track.sample(kart.s+31,kart.x);
   const q=.24;
   const y=f.position.y+(kart.flying?8:2.3);
   stamp.set(Math.round(f.position.x/q)*q,Math.round(y/q)*q,Math.round(f.position.z/q)*q);
   sun.target.position.copy(stamp);
   sun.position.copy(stamp).addScaledVector(direction,125);
   renderer.shadowMap.needsUpdate=true;
   last=time;
   force=false;
 }
 atmosphere('track01');
 return {atmosphere,prepareTrack,prepareKart,focus,sun,active};
}
