import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {assembly,alloyReflections} from './kart-assembly.js';
import {concepts as tracks} from './concepts/track.mjs';
import {concepts as terrain} from './concepts/terrain.mjs';
import {concepts as oddballs} from './concepts/oddballs.mjs';
import {concepts as construction} from './concepts/construction.mjs';

export const conceptArt = [...tracks,...terrain,...oddballs,...construction];
const byId = new Map(conceptArt.map(c=>[c.id,c]));
export const conceptFor = id => byId.get(id);
const cache = new Map();
const studio=alloyReflections();
const solid = new T.MeshStandardMaterial({vertexColors:true,roughness:.57,metalness:.055,envMap:studio,envMapIntensity:.20});
const coat = new T.MeshPhysicalMaterial({vertexColors:true,roughness:.37,metalness:.12,
  clearcoat:.64,clearcoatRoughness:.25,envMap:studio,envMapIntensity:.53});
const metal = new T.MeshStandardMaterial({vertexColors:true,roughness:.32,metalness:.59,envMap:studio,envMapIntensity:.67});
const rubber = new T.MeshStandardMaterial({vertexColors:true,roughness:.88});
const glow = new T.MeshBasicMaterial({vertexColors:true});
const glassMats = new Map();
const tirePaint = '#24282e';

function materialOf(type,color){
  if(type==='glass'){
    if(!glassMats.has(color))glassMats.set(color,new T.MeshStandardMaterial({
      color,roughness:.17,metalness:.09,opacity:.24,transparent:true,depthWrite:false,envMap:studio,envMapIntensity:.47
    }));
    return glassMats.get(color);
  }
  return type==='glow'?glow:type==='metal'?metal:type==='rubber'?rubber:type==='coat'?coat:solid;
}
function model(){
  const a=assembly(solid);
  const mesh=(color,geometry,p=[0,0,0],q=[0,0,0],type='solid')=>a.add(geometry,materialOf(type,color),color,p,q);
  const rounded=(color,p,size,bevel,q,type)=>mesh(color,new RoundedBoxGeometry(...size,1,
    Math.max(0,Math.min(bevel,Math.min(...size)*.46))),p,q,type);
  const box=(color,p,size,bevel=.03,q=[0,0,0],type='solid')=>rounded(color,p,size,bevel,q,type);
  const glass=(color,p,size,bevel=.03,q=[0,0,0])=>rounded(color,p,size,bevel,q,'glass');
  const pipe=(color,p,q,r,r2=r,n=12)=>a.pipe(color,p,q,r,solid,r2,n);
  const sphere=(color,p,[x,y,z],q=[0,0,0],type='solid')=>mesh(color,new T.SphereGeometry(1,16,12).scale(x,y,z),p,q,type);
  return {T,mesh,box,pipe,sphere,glass,finish:a.finish};
}
function makeWheel(spec,car){
  const h=model(),{r,width,style,x}=spec,n=style==='ring'?40:24, side=Math.sign(x)||1;
  const color=spec.tire??tirePaint, rim=spec.rim??car.trim;
  const barrel=(c,rr,w,p=[0,0,0],m='solid')=>h.mesh(c,new T.CylinderGeometry(rr,rr,w,n),p,[0,0,Math.PI/2],m);
  const torus=(c,rr,th,p,segments=32)=>h.mesh(c,new T.TorusGeometry(rr,th,6,segments),p,[0,Math.PI/2,0]);
  if(style==='ring'){
    const thickness=width*.42;
    h.mesh(color,new T.TorusGeometry(r-thickness,thickness,14,48).scale(1,1,width/(2*thickness)),[0,0,0],[0,Math.PI/2,0]);
    for(const d of [-1,1])torus(rim,r-thickness,width*.10,[d*width*.48,0,0]);
    for(let i=0;i<24;i++){
      const a=i*Math.PI/12;
      h.box(color,[0,(r-.027)*Math.cos(a),(r-.027)*Math.sin(a)],[width*.72,.055,r*.15],.015,[a,0,0]);
    }
  }else if(style==='wood'){
    barrel('#a06b40',r,width);
    for(const d of [-1,1]){
      const face=[d*width*.51,0,0];
      barrel('#cf985b',r*.93,.026,face);
      for(const f of [.30,.50,.72,.88])torus('#93613b',r*f,r*.019,[d*width*.535,0,0],16);
    }
  }else if(style==='speaker'){
    barrel('#2d262d',r,width);
    for(const d of [-1,1]){
      const face=d*width*.51;
      barrel('#18171b',r*.88,.030,[face,0,0]);
      torus(rim,r*.87,r*.065,[face,0,0]);
      h.mesh('#4a444f',new T.CylinderGeometry(r*.37,r*.68,.095,n),[face-d*.007,0,0],[0,0,-d*Math.PI/2]);
      barrel('#161418',r*.27,.038,[face+d*.05,0,0]);
    }
  }else if(style==='drum'){
    barrel('#808487',r,width,[0,0,0],'metal');
    for(const d of [-1,1])barrel(rim,r*.91,.045,[d*width*.51,0,0]);
  }else{
    if(style==='spoke'){
      const th=Math.min(r*.16,width*.48);
      h.mesh(color,new T.TorusGeometry(r-th,th,12,32).scale(1,1,width/(2*th)),[0,0,0],[0,Math.PI/2,0]);
    }else{
      barrel(color,r,width*.86);
      for(const d of [-1,1])torus(color,r*.91,r*.085,[d*width*.39,0,0]);
    }
    if(style==='offroad'){
      for(let i=0;i<16;i++){
        const a=i*Math.PI/8;
        h.mesh('#343238',new T.BoxGeometry(width*.77,.072,r*.27),
          [(i%2?1:-1)*width*.08,(r-.026)*Math.cos(a),(r-.026)*Math.sin(a)],[a,0,0]);
      }
    }
    const face=side*width*.49;
    if(style==='whitewall')barrel('#fff0cc',r*.92,.027,[face,0,0]);
    const inset=face+side*.025;
    if(style!=='spoke')barrel(rim,r*.70,.035,[inset,0,0]);
    if(style==='spoke'){
      const spokeR=r-Math.min(r*.16,width*.48)*1.65;
      torus(rim,spokeR,r*.039,[inset,0,0]);
      for(let i=0;i<12;i++){
        const a=i*Math.PI/6;h.pipe(rim,[inset,0,0],[inset,spokeR*Math.cos(a),spokeR*Math.sin(a)],r*.035);
      }
    }
    const hubX=inset+side*.035;
    barrel('#a18560',r*.29,.048,[hubX,0,0],'metal');
    barrel('#3c414b',r*.135,.034,[hubX+side*.023,0,0],'metal');
    for(let i=0;i<5;i++){
      const a=i*Math.PI*.4;
      h.mesh('#ded3bb',new T.CylinderGeometry(r*.037,r*.048,.021,5),
        [hubX+side*.026,r*.209*Math.cos(a),r*.209*Math.sin(a)],[0,0,Math.PI/2],'metal');
    }
  }
  return h.finish();
}
function blueprint(spec){
  if(!cache.has(spec.id)){
    const h=model();
    if(spec.seat!==false){
      const {x,y,z,scale:s}=spec.mount;
      h.box('#322825',[x,y-.14*s,z+.08*s],[.94*s,.18*s,.82*s],.07*s);
      h.box('#49362d',[x,y+.34*s,z+.52*s],[.92*s,.93*s,.21*s],.10*s,[.09,0,0]);
    }
    spec.build(h);
    cache.set(spec.id,{shell:h.finish(),rolling:spec.wheels.map(w=>makeWheel(w,spec))});
  }
  return cache.get(spec.id);
}
function clonePart(part,group){
  const mesh=part.clone();
  mesh.userData.sharedKartPart=true;
  group.add(mesh);
}
export function attachConcept(body,wheels,spec){
  const {shell,rolling}=blueprint(spec);
  for(const part of shell)clonePart(part,body);
  for(let i=0;i<spec.wheels.length;i++){
    const w=spec.wheels[i];
    const axle=new T.Group();
    axle.position.set(w.x,w.r,w.z);axle.rotation.order='YXZ';
    axle.userData={rideHeight:w.r,steer:!!w.steer,spinAxis:w.axis??'x'};
    if(w.axis==='z'){
      const roll=new T.Group();roll.rotation.y=Math.PI/2;axle.add(roll);
      for(const part of rolling[i])clonePart(part,roll);
      axle.userData.conceptParts=roll.children;
    }else for(const part of rolling[i])clonePart(part,axle);
    body.add(axle);wheels.push(axle);
  }
}

let shadowMap;
export function styleConceptShadow(mesh){
  if(!shadowMap){
    const n=64,rgba=new Uint8Array(n*n*4);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const r=Math.hypot((x+.5)/n*2-1,(y+.5)/n*2-1);
      const fall=Math.max(0,1-r*r);
      const i=(y*n+x)*4;
      rgba[i]=rgba[i+1]=rgba[i+2]=255;rgba[i+3]=Math.round(255*fall*fall);
    }
    shadowMap=new T.DataTexture(rgba,n,n,T.RGBAFormat);
    shadowMap.magFilter=T.LinearFilter;shadowMap.minFilter=T.LinearFilter;
    shadowMap.needsUpdate=true;
  }
  mesh.material.map=shadowMap;
  mesh.material.opacity=.56;
}
