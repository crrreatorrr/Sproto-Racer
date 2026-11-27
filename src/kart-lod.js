import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {alloyReflections} from './kart-assembly.js';

// The distant build of a rival kart. A kart assembled at LOW detail (kart-detail.js) is
// folded into a handful of draw calls:
//   - every plain painted, metal and rubber part of the body becomes one mesh whose
//     roughness, metalness and reflection strength ride along as vertex attributes;
//   - signature finishes (pearl, clearcoat, liveries, glass) keep their own material, so
//     the paint is the very same shader on both builds and cannot shift in colour;
//   - lamps and other glowing parts join that mesh as emitted light, except the few that
//     bypass tone mapping, which share one unlit mesh;
//   - the wheels, which still spin, steer and ride the suspension, are instances of one
//     shared wheel.
// The switch between the two builds is a visibility toggle; nothing is rebuilt mid-race.

const programKey='kart-lod-lit-v1';
function patch(shader){
  shader.vertexShader=shader.vertexShader
    .replace('#include <common>','#include <common>\nattribute vec3 lodSurface;\nattribute vec3 lodGlow;\nvarying vec3 vLodSurface;\nvarying vec3 vLodGlow;')
    .replace('#include <begin_vertex>','#include <begin_vertex>\nvLodSurface=lodSurface;\nvLodGlow=lodGlow;');
  shader.fragmentShader=shader.fragmentShader
    .replace('#include <common>','#include <common>\nvarying vec3 vLodSurface;\nvarying vec3 vLodGlow;')
    .replace('#include <envmap_physical_pars_fragment>',
      T.ShaderChunk.envmap_physical_pars_fragment.replaceAll('envMapIntensity','(envMapIntensity*vLodSurface.z)'))
    .replace('#include <roughnessmap_fragment>','float roughnessFactor=vLodSurface.x;')
    .replace('#include <metalnessmap_fragment>','float metalnessFactor=vLodSurface.y;')
    .replace('#include <emissivemap_fragment>','totalEmissiveRadiance=vLodGlow;');
}
// One shader for every car. The reflection map follows the car's own metalwork, so a
// car lit by its studio map keeps that map on its distant build.
const litByAnchor=new Map();
function litFor(anchor){
  const key=anchor??null;
  if(!litByAnchor.has(key)){
    const material=new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,envMap:alloyReflections()});
    material.name='kart-lod-lit';
    material.onBeforeCompile=patch;
    material.customProgramCacheKey=()=>programKey;
    material.userData.anchor=anchor??null;
    litByAnchor.set(key,material);
  }
  return litByAnchor.get(key);
}
// Some cars swap in a studio reflection map once it has downloaded. True when the shared
// material just followed such a swap (its shader then needs compiling again).
export function followAnchor(material){
  const anchor=material.userData.anchor;
  if(!anchor?.envMap||material.envMap===anchor.envMap)return false;
  material.envMap=anchor.envMap;
  material.envMapRotation.copy(anchor.envMapRotation);
  return true;
}
let unlitRaw;
const unlit=()=>unlitRaw??=Object.assign(new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,toneMapped:false}),{name:'kart-lod-unlit'});

// 'lit': folds into the shared mesh. 'glow': an unlit colour, carried there as emitted
// light (the same tone-mapped result). 'raw': unlit and not tone mapped. 'special': the
// finish keeps its own material. A textured finish may opt in to folding by naming the
// flat colour it averages to at a distance: material.userData.distant={color,roughness}.
function classify(material){
  if(material.userData.distant)return 'lit';
  if(material.transparent||material.alphaTest>0||material.map||material.alphaMap||material.bumpMap||
    material.normalMap||material.roughnessMap||material.metalnessMap||material.emissiveMap)return 'special';
  if(material.isMeshBasicMaterial)return material.toneMapped?'glow':'raw';
  if(material.isMeshStandardMaterial&&!material.isMeshPhysicalMaterial)return 'lit';
  return 'special';
}

const identity=new T.Matrix4();
const isIdentity=matrix=>matrix.equals(identity);
function close(a,b){
  for(let i=0;i<16;i++)if(Math.abs(a.elements[i]-b.elements[i])>1e-6)return false;
  return true;
}
const triangles=geometry=>(geometry.index?geometry.index.count:geometry.attributes.position.count)/3;

// A part prepared for the shared lit or unlit mesh: plain triangles carrying their paint.
function bake(entry,kind,matrix){
  const {mesh}=entry,material=mesh.material,source=mesh.geometry;
  const geometry=source.index?source.toNonIndexed():source.clone();
  for(const name of Object.keys(geometry.attributes)){
    if(name!=='position'&&name!=='normal'&&name!=='color')geometry.deleteAttribute(name);
  }
  geometry.morphAttributes={};
  if(matrix&&!isIdentity(matrix)){
    geometry.applyMatrix4(matrix);
    if(matrix.determinant()<0){
      // A mirrored part keeps facing outward: swap two corners of every triangle.
      for(const attribute of Object.values(geometry.attributes)){
        const {array,itemSize}=attribute;
        for(let i=0;i<array.length;i+=3*itemSize)for(let k=0;k<itemSize;k++){
          const t=array[i+itemSize+k];array[i+itemSize+k]=array[i+2*itemSize+k];array[i+2*itemSize+k]=t;
        }
      }
    }
  }
  if(material.flatShading||!geometry.attributes.normal)geometry.computeVertexNormals();
  const count=geometry.attributes.position.count,distant=material.userData.distant;
  const tint=entry.color??(distant?.color!=null?scratchColor.set(distant.color):material.color);
  const painted=material.vertexColors&&!distant?geometry.attributes.color:null;
  const colors=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    colors[i*3]=tint.r*(painted?painted.getX(i):1);
    colors[i*3+1]=tint.g*(painted?painted.getY(i):1);
    colors[i*3+2]=tint.b*(painted?painted.getZ(i):1);
  }
  if(kind==='raw'){
    geometry.setAttribute('color',new T.BufferAttribute(colors,3));
    geometry.deleteAttribute('normal');
    return geometry;
  }
  const surface=new Float32Array(count*3),glow=new Float32Array(count*3);
  if(kind==='glow'){
    // A matt black surface that only emits: what an unlit, tone-mapped colour looks like.
    for(let i=0;i<count;i++)surface[i*3]=1;
    glow.set(colors);colors.fill(0);
  }else{
    const reflect=material.envMap?material.envMapIntensity:0;
    const roughness=distant?.roughness??material.roughness,metalness=distant?.metalness??material.metalness;
    const e=material.emissive,strength=material.emissiveIntensity;
    for(let i=0;i<count;i++){
      surface[i*3]=roughness;surface[i*3+1]=metalness;surface[i*3+2]=reflect;
      glow[i*3]=e.r*strength;glow[i*3+1]=e.g*strength;glow[i*3+2]=e.b*strength;
    }
  }
  geometry.setAttribute('color',new T.BufferAttribute(colors,3));
  geometry.setAttribute('lodSurface',new T.BufferAttribute(surface,3));
  geometry.setAttribute('lodGlow',new T.BufferAttribute(glow,3));
  return geometry;
}
const scratchColor=new T.Color();
function join(parts){
  if(parts.length===1)return parts[0];
  const merged=mergeGeometries(parts);
  for(const part of parts)part.dispose();
  return merged;
}

// Fold a set of parts that share one frame into as few meshes as their finishes allow.
// `relative` maps each part into that frame; null leaves the parts where they are.
function fold(entries){
  const lit=[],raw=[],special=new Map(),out=[];
  for(const entry of entries){
    const kind=entry.kind??classify(entry.mesh.material);
    if(kind==='special'){
      const list=special.get(entry.mesh.material)??[];
      special.set(entry.mesh.material,list);list.push(entry);
    }else (kind==='raw'?raw:lit).push(bake(entry,kind,entry.relative));
  }
  // `null` stands for the car's shared lit material, filled in when the build is mounted.
  if(lit.length)out.push({geometry:join(lit),material:null});
  if(raw.length)out.push({geometry:join(raw),material:unlit()});
  for(const [material,list] of special){
    const parts=list.map(({mesh,relative})=>{
      // Template geometry already in place is shared outright.
      if(!relative||isIdentity(relative))return {geometry:mesh.geometry,owned:false};
      return {geometry:mesh.geometry.clone().applyMatrix4(relative),owned:true};
    });
    let merged=null;
    if(parts.length>1){
      const same=parts.every(p=>!!p.geometry.index===!!parts[0].geometry.index);
      merged=same?mergeGeometries(parts.map(p=>p.geometry)):null;
    }
    if(merged){
      for(const p of parts)if(p.owned)p.geometry.dispose();
      out.push({geometry:merged,material});
    }else for(const p of parts)out.push({geometry:p.geometry,material});
  }
  return out;
}

const scratch=new T.Matrix4(),inverse=new T.Matrix4();
function relativeTo(frame,object){
  return new T.Matrix4().copy(inverse.copy(frame.matrixWorld).invert()).multiply(object.matrixWorld);
}

/**
 * Reduce an assembled kart to the template of its distant build. `skip` lists the
 * animated extras that stay on the kart for both builds (exhaust flames, crystal, wake).
 */
export function flattenKart(kart,{skip=[],idleLamp=0x411e18}={}){
  const a=kart.userData,{body,driver,wheels}=a,skipped=new Set(skip);
  kart.updateMatrixWorld(true);
  const forks=wheels.map(w=>w.userData.fork??null);
  const bodyParts=[],driverParts=[],extras=[],lampParts=[];
  const axleParts=wheels.map(()=>[]),forkParts=wheels.map(()=>[]);
  const sources=[];
  (function walk(object,owner,frame){
    if(skipped.has(object))return;
    let index=wheels.indexOf(object);
    if(object===driver){owner=driverParts;frame=driver;}
    else if(index>=0){owner=axleParts[index];frame=object;}
    else if((index=forks.indexOf(object))>=0){owner=forkParts[index];frame=object;}
    if(object.isPoints)extras.push({object,relative:relativeTo(body,object)});
    else if(object.isMesh){
      const relative=relativeTo(frame,object);
      if(object.material===a.timingLamp)lampParts.push({mesh:object,relative});
      else if(object.userData.kartPlate)owner.push(...plateParts(object,relative));
      else{owner.push({mesh:object,relative});sources.push(object);}
    }
    for(const child of object.children)walk(child,owner,frame);
  })(body,bodyParts,body);

  // The car's own reflective metalwork decides which reflection map the shared mesh uses.
  const weight=new Map();
  for(const mesh of sources){
    const material=mesh.material;
    if(classify(material)==='lit'&&material.envMap)weight.set(material,(weight.get(material)??0)+triangles(mesh.geometry));
  }
  const anchor=[...weight].sort((p,q)=>q[1]-p[1])[0]?.[0];
  const lit=litFor(anchor);

  // The drift lamps keep their own mesh so they can light up; a slightly smaller unlit
  // copy in their resting colour stands in while they are dark.
  let lamp=null;
  if(lampParts.length){
    lamp=join(lampParts.map(entry=>bake({...entry,color:new T.Color(1,1,1)},'raw',entry.relative)));
    lamp.deleteAttribute('color');
    const resting=new T.Color(idleLamp),centre=new T.Vector3();
    for(const {mesh,relative} of lampParts){
      mesh.geometry.computeBoundingBox();
      mesh.geometry.boundingBox.getCenter(centre);
      const shrink=new T.Matrix4().makeTranslation(centre.x,centre.y,centre.z)
        .multiply(scratch.makeScale(.9,.9,.9)).multiply(new T.Matrix4().makeTranslation(-centre.x,-centre.y,-centre.z));
      bodyParts.push({mesh,relative:new T.Matrix4().multiplyMatrices(relative,shrink),kind:'glow',color:resting});
    }
  }

  // Wheels that share their parts and their placement on the axle are one instanced
  // batch; the same goes for the caster forks that steer without spinning.
  const sets=new Map();
  function collect(parts,axle,fork){
    if(!parts.length)return;
    const shared=parts.every(p=>close(p.relative,parts[0].relative));
    const key=(fork?'f':'w')+parts.map(p=>p.mesh.geometry.uuid+':'+p.mesh.material.uuid+
      (shared?'':':'+p.relative.elements.map(v=>v.toFixed(5)).join())).sort().join('|');
    if(!sets.has(key)){
      sets.set(key,{parts:fold(parts.map(p=>({...p,relative:shared?null:p.relative}))),instances:[]});
    }
    sets.get(key).instances.push({axle,fork,local:shared?parts[0].relative.clone():new T.Matrix4()});
  }
  wheels.forEach((_,i)=>{collect(axleParts[i],i,false);collect(forkParts[i],i,true);});

  return {statics:fold(bodyParts),driver:fold(driverParts),wheelSets:[...sets.values()],extras,lamp,lit};
}

// A number plate at this distance is a cream tile with a dark smudge of digits.
function plateParts(mesh,relative){
  const paper=new T.Color('#f4eaca'),ink=new T.Color('#18282b');
  const digits=paper.clone().lerp(ink,.62);
  const nudge=new T.Matrix4().makeTranslation(0,-.01*mesh.geometry.parameters.height,.003);
  const inner=new T.Matrix4().multiplyMatrices(relative,nudge).multiply(new T.Matrix4().makeScale(.64,.56,1));
  const backing=new T.Matrix4().multiplyMatrices(relative,new T.Matrix4().makeTranslation(0,0,-.0005));
  return [{mesh,relative:backing,kind:'glow',color:paper},
    {mesh,relative:inner,kind:'glow',color:digits},
    // The plate is two-sided: the same smudge faces the other way too.
    {mesh,relative:new T.Matrix4().multiplyMatrices(inner,new T.Matrix4().makeTranslation(0,0,-.004)),kind:'glow',color:digits}];
}

function part(geometry,material){
  const mesh=new T.Mesh(geometry,material);
  mesh.userData.sharedKartPart=true;mesh.userData.lowDetail=true;
  return mesh;
}

/** Add the distant build to a full kart. Returns the handles the kart animates. */
export function mountLowDetail(kart,template,driver=template.driver){
  const a=kart.userData,group=new T.Group();
  group.name='low-detail';group.visible=false;
  const lit=template.lit;
  for(const {geometry,material} of template.statics)group.add(part(geometry,material??lit));
  for(const {object,relative} of template.extras){
    const copy=object.clone();
    relative.decompose(copy.position,copy.quaternion,copy.scale);
    copy.userData.lowDetail=true;copy.userData.sharedKartPart=true;
    group.add(copy);
  }
  const lamp=template.lamp?part(template.lamp,a.timingLamp):null;
  if(lamp){lamp.visible=false;group.add(lamp);}
  const driverParts=driver.map(({geometry,material})=>{
    const mesh=part(geometry,material??lit);
    mesh.visible=false;a.driver.add(mesh);
    return mesh;
  });
  const batches=[];
  for(const set of template.wheelSets)for(const {geometry,material} of set.parts){
    const mesh=new T.InstancedMesh(geometry,material??lit,set.instances.length);
    mesh.userData.sharedKartPart=true;mesh.userData.lowDetail=true;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    group.add(mesh);
    batches.push({mesh,instances:set.instances});
  }
  a.body.add(group);
  const low={group,lamp,driverParts,batches,lit,active:false};
  followAnchor(lit);
  syncLowDetail(a,low);
  // Suspension and steering move the wheels a little: one generous bound covers them.
  for(const {mesh} of batches){
    mesh.computeBoundingSphere();
    mesh.boundingSphere.radius+=.6;
  }
  return low;
}

const instance=new T.Matrix4();
/** Carry this frame's wheel, fork and lamp pose over to the distant build. */
export function syncLowDetail(a,low,lampLit=false){
  for(const {mesh,instances} of low.batches){
    for(let i=0;i<instances.length;i++){
      const {axle,fork,local}=instances[i],source=fork?a.wheels[axle].userData.fork:a.wheels[axle];
      source.updateMatrix();
      mesh.setMatrixAt(i,instance.multiplyMatrices(source.matrix,local));
    }
    mesh.instanceMatrix.needsUpdate=true;
  }
  if(low.lamp)low.lamp.visible=lampLit;
}

export function disposeLowDetail(low){
  if(!low)return;
  for(const {mesh} of low.batches)mesh.dispose();
  for(const mesh of low.driverParts)mesh.removeFromParent();
  low.group.removeFromParent();
  low.group.clear();
}
