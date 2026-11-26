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
const solid = new T.MeshStandardMaterial({vertexColors:true,roughness:.59,metalness:.03,envMap:studio,envMapIntensity:.18});
const coat = new T.MeshPhysicalMaterial({vertexColors:true,roughness:.32,metalness:.10,
  clearcoat:.82,clearcoatRoughness:.19,envMap:studio,envMapIntensity:.61});
const metal = new T.MeshStandardMaterial({vertexColors:true,roughness:.32,metalness:.59,envMap:studio,envMapIntensity:.67});
const rubber = new T.MeshStandardMaterial({vertexColors:true,roughness:.88});
const glow = new T.MeshBasicMaterial({vertexColors:true});
const glassMats = new Map();
const tirePaint = '#24282e';

function materialOf(type,color){
  if(type==='glass'){
    if(!glassMats.has(color))glassMats.set(color,new T.MeshPhysicalMaterial({
      color,roughness:.16,metalness:.05,clearcoat:.58,clearcoatRoughness:.19,opacity:.25,transparent:true,depthWrite:false,envMap:studio,envMapIntensity:.52
    }));
    return glassMats.get(color);
  }
  return type==='glow'?glow:type==='metal'?metal:type==='rubber'?rubber:type==='coat'?coat:solid;
}
function gradeBody(rgb,y,ny,material){
  if(material===glow||material===rubber)return rgb;
  // To keep painted forms readable with flat outdoor lighting, add only a subtle
  // body-local bounce/undercut tint. Wheels opt out so their shade cannot spin.
  const low=1-T.MathUtils.smoothstep(y,.27,1.36);
  const down=T.MathUtils.clamp(-ny,0,1);
  const amt=1-.13*low-.11*down;
  rgb.r*=amt*(1-.034*down);
  rgb.g*=amt;
  rgb.b*=amt*(1+.025*down);
  return rgb;
}
function model(body=false){
  const a=assembly(solid,body?gradeBody:undefined);
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
    if(spec.rimPads==='magnetic'){
      // Broad graphite/silver drive shoes with low cyan glazing in the gaps. These
      // ride on the actual wheel instance, not a static ring forced onto the body.
      for(let i=0;i<12;i++){
        const a=i*Math.PI/6;
        const y=Math.cos(a)*(r-.030),z=Math.sin(a)*(r-.030);
        h.mesh(i%3===0?'#a8bcc4':'#50616b',new T.BoxGeometry(width*.83,.052,r*.205),[0,y,z],[a,0,0],'metal');
        h.mesh('#73e9fb',new T.BoxGeometry(width*.31,.020,r*.062),
          [side*width*.30,Math.cos(a+.16)*(r-.047),Math.sin(a+.16)*(r-.047)],[a+.16,0,0],'glow');
      }
    }
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
      // A real oval tire cross-section blends the tread to the shoulder in one
      // smooth surface, instead of stacking rings over a sharp-edged cylinder.
      const profile=[[.51,-.45],[.83,-.48],[.94,-.42],[.991,-.31],[1,-.19],
        [1,.19],[.991,.31],[.94,.42],[.83,.48],[.51,.45]];
      const points=profile.map(([rr,ww])=>new T.Vector2(r*rr,width*ww));
      h.mesh(color,new T.LatheGeometry(points,24),[0,0,0],[0,0,Math.PI/2],'rubber');
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
    if(style!=='spoke'){
      // The chromed rim face is dished: the axle sits inward of the bead and the
      // road lip curves back into the sidewall. It replaces the old flat disk.
      const dish=[[.19,-.025],[.38,-.021],[.56,-.012],[.635,.018],[.70,.023],[.704,-.012]];
      const dishGeometry=new T.LatheGeometry(dish.slice().reverse().map(([rr,dd])=>new T.Vector2(r*rr,dd)),16)
        .rotateZ(-side*Math.PI/2);
      h.mesh(rim,dishGeometry,[inset,0,0],[0,0,0],'metal');
    }
    if(style==='spoke'){
      const spokeR=r-Math.min(r*.16,width*.48)*1.65;
      torus(rim,spokeR,r*.039,[inset,0,0]);
      for(let i=0;i<12;i++){
        const a=i*Math.PI/6;h.pipe(rim,[inset,0,0],[inset,spokeR*Math.cos(a),spokeR*Math.sin(a)],r*.035,r*.035,7);
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
    const h=model(true);
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
