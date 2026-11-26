// One thin resource for all road treasure chests and each Sky Lane layout.
// Part ID lets one instanced draw articulate the lid and light the opening.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const gold=0xffc455, brass=0xad641e, trim=0xffeaab;
const plum=0x52213b, wood=[0x923960,0xb0405d,0xc25665,0xa44462,0x803352,0x642643,0x793055,0x893455];
const jade=0x60ffdd, deep=0x25183a;
const BODY=0,LID=1,KEY=2,LID_GEM=3,LINE=4,HALO=5,SPARK=6,CORE=7;
const hingeY=.03;
const left=[-1,0,0], right=[1,0,0];
const N=8;

export function makePickupGeometry() {
  const parts=[];
  const colors=new Map();
  function piece(source,color,kind,specialUV=false) {
    const g=source.index?source.toNonIndexed():source;
    if(g!==source)source.dispose();
    const n=g.getAttribute('position').count, tint=new Float32Array(n*3);
    if(!colors.has(color))colors.set(color,new THREE.Color(color));
    const c=colors.get(color);
    for(let i=0;i<n;i++)c.toArray(tint,i*3);
    const panel=new Float32Array(n*2);
    if(specialUV)panel.set(g.getAttribute('uv').array);
    g.deleteAttribute('uv');
    g.setAttribute('color',new THREE.BufferAttribute(tint,3));
    g.setAttribute('aPickupPart',new THREE.BufferAttribute(new Float32Array(n).fill(kind),1));
    g.setAttribute('aPickupPanel',new THREE.BufferAttribute(panel,2));
    parts.push(g);
  }
  const box=(x,y,z,w,h,d,color,kind=BODY)=>piece(new THREE.BoxGeometry(w,h,d).translate(x,y,z),color,kind);
  // Custom broad faces, without hidden box subdivisions. Verify triangle winding
  // against requested normals for rear/front and the upper and lower arch shells.
  function poly(points,normals,color,kind) {
    const p=[],n=[];
    const head=new THREE.Vector3(...points[0]),want=new THREE.Vector3(...normals[0]);
    for(let i=1;i<points.length-1;i++) {
      const a=new THREE.Vector3(...points[i]).sub(head),b=new THREE.Vector3(...points[i+1]).sub(head);
      for(const j of a.cross(b).dot(want)>0?[0,i,i+1]:[0,i+1,i]){
        p.push(...points[j]);n.push(...normals[j]);
      }
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));
    piece(g,color,kind);
  }
  const face=(pts,normal,color,kind=BODY)=>poly(pts,pts.map(()=>normal),color,kind);
  // Deep base and real interior. Side walls are wide, permitting a hollow
  // inner chamber without a second draw or appearing solid on the opening pose.
  box(0,-.56,0,1.65,.13,.99,brass);
  box(0,-.475,0,1.71,.075,1.05,gold);
  box(0,-.423,0,1.61,.083,.99,deep);
  function panel(x,y,z,w,h,dir,color){
    const side=dir[0]!==0;
    const dx=side?0:w*.5,dz=side?w*.5:0,dy=h*.5;
    face([[x-dx,y-dy,z-dz],[x+dx,y-dy,z+dz],[x+dx,y+dy,z+dz],[x-dx,y+dy,z-dz]],dir,color);
  }
  for(const s of [-1,1]) {
    const close=[0,0,s],out=[s,0,0];
    panel(0,-.235,s*.507,1.61,.40,close,plum);
    panel(s*.804,-.235,0,1.01,.40,out,plum);
    panel(0,-.235,s*.397,1.52,.40,[0,0,-s],plum);
    panel(s*.697,-.235,0,.80,.40,[-s,0,0],plum);
    box(0,-.018,s*.475,1.67,.067,.095,gold);
    box(s*.787,-.018,0,.092,.067,.89,gold);
    panel(0,-.396,s*.513,1.305,.026,close,brass);
    // Contrasting horizontal wood panels, separated by dark seams.
    for(let i=0;i<3;i++) {
      panel(0,-.336+i*.116,s*.526,1.31,.102,close,wood[[5,0,2][i]]);
      panel(s*.820,-.336+i*.116,0,.93,.102,out,wood[[5,0,2][i]]);
    }
    for(const x of [-.692,.692]) {
      box(x,-.234,s*.539,.127,.41,.052,gold);
      piece(new THREE.IcosahedronGeometry(.043,0).scale(1,1,.57).translate(x,-.337,s*.570),trim,BODY);
    }
  }

  // Barrel lid, parallel gold straps, shadowed underside, and curved side caps.
  const arch=(x,i,d,h,offset=0)=>[x,hingeY+offset+h*Math.sin(Math.PI*i/N),d*Math.cos(Math.PI*i/N)];
  const normal=(i,d,h,s=1)=>[0,s*Math.sin(Math.PI*i/N)*d,s*Math.cos(Math.PI*i/N)*h].map(
    (v,_,n)=>v/Math.hypot(...n));
  function archStrip(x0,x1,d,h,co,kind=LID,s=1,offset=0) {
    for(let i=0;i<N;i++)poly(
      [arch(x0,i,d,h,offset),arch(x1,i,d,h,offset),arch(x1,i+1,d,h,offset),arch(x0,i+1,d,h,offset)],
      [normal(i,d,h,s),normal(i,d,h,s),normal(i+1,d,h,s),normal(i+1,d,h,s)],Array.isArray(co)?co[i]:co,kind);
  }
  archStrip(-.814,.814,.505,.53,wood);
  archStrip(-.760,.760,.465,.455,0x601c37,LID,-1);
  for(const s of [-1,1]){
    const x=s*.814;
    const pts=Array.from({length:N+1},(_,i)=>arch(x,i,.505,.53));
    face(pts,s===-1?left:right,0x673254,LID);
    archStrip(x-s*.157,x+s*.024,.524,.553,gold);
    archStrip(x-s*.101,x-s*.080,.526,.555,trim);
    // Rear hinge hardware also reads as a second golden band from behind.
    box(s*.552,.043,-.530,.194,.091,.085,brass,LID);
  }
  for(const s of [-1,1]){
    box(0,hingeY,s*.495,1.652,.064,.073,gold,LID);
  }
  // Plated lock, clean dark keyhole picked out by a derivative-filtered face.
  box(0,-.117,.558,.34,.342,.099,brass);
  box(0,-.117,.617,.251,.243,.037,gold);
  piece(new THREE.PlaneGeometry(.242,.232).translate(0,-.117,.636),gold,KEY,true);
  box(0,.075,.560,.186,.094,.102,gold,LID);
  const oct=(r,x,y,z,sx,sy,sz,c,k)=>piece(new THREE.OctahedronGeometry(r).scale(sx,sy,sz).translate(x,y,z),c,k);
  oct(.091,0,.43,.372,1,1.2,.49,jade,LID_GEM);
  for(const s of [-1,1])box(s*.37,-.022,.531,.23,.026,.019,jade,LINE);

  for(let i=0;i<4;i++){
    const a=Math.PI*.5*i;
    const ring=new THREE.RingGeometry(.94,1.05,5,1,.12,1.08).rotateX(-Math.PI*.5).rotateY(a);
    piece(ring,i%2?jade:trim,HALO);
    oct(.082,Math.cos(a)*1.13,i%2?.74:.22,Math.sin(a)*1.13,.74,1.38,.74,i%2?jade:trim,SPARK);
  }
  oct(.236,0,-.245,0,.70,1.42,.75,0xffea9c,CORE);

  const out=mergeGeometries(parts);
  parts.forEach(g=>g.dispose());
  out.computeBoundingSphere();
  return out;
}

export function applyPickupVertexShader(material, uniforms, {air=false}={}) {
  material.customProgramCacheKey=()=>air?'treasure-chest-air-v1':'treasure-chest-road-v1';
  material.onBeforeCompile=(shader)=>{
    shader.uniforms.uTime=uniforms.uTime;
    shader.vertexShader=`uniform float uTime;
      attribute vec2 aPickupState;
      attribute float aPickupPart;
      attribute vec2 aPickupPanel;
      varying vec2 vChestUV;
      varying float vChestPart, vChestVisible, vChestGlow, vChestDim, vChestOpen;
      const bool airChest=${air?'true':'false'};
      vec3 chestY(vec3 p,float a){
        float c=cos(a),s=sin(a);
        return vec3(c*p.x+s*p.z,p.y,c*p.z-s*p.x);
      }
      vec3 chestX(vec3 p,float a){
        float c=cos(a),s=sin(a);
        return vec3(p.x,c*p.y-s*p.z,s*p.y+c*p.z);
      }
      vec3 chestZ(vec3 p,float a){
        float c=cos(a),s=sin(a);
        return vec3(c*p.x-s*p.y,s*p.x+c*p.y,p.z);
      }
      `+shader.vertexShader.replace('#include <beginnormal_vertex>',`
        #include <beginnormal_vertex>
        float pId=float(gl_InstanceID), age=max(0.,uTime-aPickupState.x);
        bool taken=aPickupState.y>.5, disabled=aPickupState.y>1.5;
        bool lid=(aPickupPart>.5&&aPickupPart<1.5)||(aPickupPart>2.5&&aPickupPart<3.5);
        float turn=(airChest?.51:.67)*sin(uTime*1.35+pId*.64);
        float tilt=.065*sin(uTime*1.7+pId*.46);
        float hinge=-1.42*smoothstep(0.,.18,age)+.10*sin(min(age,.4)*21.)*smoothstep(0.,.06,age);
        float opening=taken ? hinge : 0.0;
        if(aPickupPart<4.5 || aPickupPart>5.5){
          if(lid)objectNormal=chestX(objectNormal,opening);
          objectNormal=chestY(chestZ(objectNormal,tilt),turn);
        }
      `).replace('#include <begin_vertex>',`
        #include <begin_vertex>
        vChestPart=aPickupPart;
        vChestUV=aPickupPanel;
        vChestVisible=1.;
        vChestGlow=0.;
        vChestDim=1.;
        float reveal=smoothstep(0.,.38,age);
        float close=smoothstep(.18,.44,age);
        float openGlow=taken?smoothstep(.015,.14,age)*(1.-close):0.;
        vChestOpen=openGlow;
        float pulse=.5+.5*sin(uTime*5.+pId*.49);
        float bob=.25*sin(uTime*2.7+pId*.65);
        float scale=taken ? 1.-close : .18+.82*reveal+.14*sin(reveal*3.141593);
        if(aPickupPart<4.5){
          if(lid){
            vec3 pin=vec3(0.,.03,-.49);
            transformed=pin+chestX(transformed-pin,opening);
          }
          transformed=chestY(chestZ(transformed*max(.001,scale),tilt),turn);
          transformed.y+=bob+(taken?.20*smoothstep(0.,.26,age):-.13*(1.-reveal));
          vChestVisible=taken&&age>=.44?0.:1.;
          vChestGlow= aPickupPart>2.5 ? .70+.27*pulse : .085;
        }else if(aPickupPart<5.5){
          transformed=chestY(transformed,uTime*(taken?-.8:1.5)+pId*.44);
          if(airChest){
            transformed.y=-.78+bob;
            transformed.xz*=1.+.065*pulse;
            vChestVisible=taken?0.:1.;
          }else{
            transformed.y=-(2.0-.215)/(taken?.98:1.16);
            transformed.xz*=taken?.77+.07*pulse:1.04+.10*pulse;
          }
          vChestGlow=taken?.10:.82+.15*pulse;
          vChestDim=taken?.32:1.;
        }else if(aPickupPart<6.5){
          float spread=taken?1.+1.34*smoothstep(0.,.44,age): .96+.18*(1.-reveal);
          transformed=chestY(transformed,uTime*(taken?5.7:1.52)+pId*.63);
          transformed.xz*=spread;
          transformed.y+=bob+(taken?.16+2.9*min(age,.44)-3.0*min(age,.44)*min(age,.44):.09*sin(turn));
          vChestVisible=taken&&age>=.47?0.:1.;
          vChestGlow=taken?.97:.63+.26*pulse;
          vChestDim=taken?max(.20,1.-smoothstep(.23,.47,age)):1.;
        }else{
          transformed=chestY(transformed*(taken? .26+1.37*sin(3.141593*min(age/.46,1.)):1.),uTime*4.);
          transformed.y+=bob+.22+min(age,.45)*2.2;
          vChestVisible=taken&&age>.028&&age<.46?1.:0.;
          vChestGlow=1.;
          vChestDim=.55+openGlow*.45;
        }
        if(disabled)vChestVisible=0.;
      `);
    shader.fragmentShader=`varying vec2 vChestUV;
      varying float vChestPart, vChestVisible, vChestGlow, vChestDim, vChestOpen;
      `+shader.fragmentShader.replace('#include <opaque_fragment>',`
      if(vChestVisible<.5) discard;
      outgoingLight=mix(outgoingLight,diffuseColor.rgb,vChestGlow)*vChestDim;
      if(vChestPart<4.5)outgoingLight+=vec3(.34,.17,.035)*vChestOpen*.43;
      if(vChestPart<2.5&&vChestPart>1.5){
        vec2 p=vChestUV-.5;
        float disk=length(p-vec2(0.,.10))-.106;
        float stem=max(abs(p.x)-(.045+max(-p.y,0.)*.16),max(p.y-.11,-p.y-.245));
        float ink=min(disk,stem);
        float aa=max(fwidth(ink),.01);
        float mark=1.-smoothstep(-aa,aa,ink);
        outgoingLight=mix(outgoingLight,vec3(.025,.011,.026),mark*.96);
      }
      #include <opaque_fragment>`);
  };
}

function makeAirResources(count){
  const geometry=makePickupGeometry();
  const material=new THREE.MeshLambertMaterial({vertexColors:true});
  const states=new THREE.InstancedBufferAttribute(new Float32Array(count*2),2).setUsage(THREE.DynamicDrawUsage);
  const uniforms={uTime:{value:0}};
  geometry.setAttribute('aPickupState',states);
  applyPickupVertexShader(material,uniforms,{air:true});
  const mesh=new THREE.InstancedMesh(geometry,material,count);
  mesh.name='skyTreasureChests';
  return {mesh,geometry,material,states,uniforms};
}

/** One draw per lap layout. Entries use the previous lane sampling and radius. */
export function createSkyChests(entries){
  const {mesh,states,uniforms}=makeAirResources(entries.length);
  const pose=new THREE.Object3D();
  for(let i=0;i<entries.length;i++){
    const {position,yaw}=entries[i];
    pose.position.copy(position);
    pose.rotation.y=yaw;
    pose.scale.setScalar(1.48);
    pose.updateMatrix();
    mesh.setMatrixAt(i,pose.matrix);
    states.setXY(i,-1,0);
  }
  mesh.computeBoundingSphere();
  mesh.boundingSphere.radius+=5;
  let prev=0,lastTime=-1;
  function update(time,taken,{silent=false}={}){
    uniforms.uTime.value=time;
    if(taken!==prev||time<lastTime){
      const reset=time<lastTime;
      for(let i=0;i<entries.length;i++){
        const bit=1<<entries[i].index;
        if(!reset&&!(bit&(taken^prev)))continue;
        const isTaken=!!(taken&bit);
        states.setXY(i,(silent||reset) ? time-1:time,isTaken?1:0);
        states.addUpdateRange(i*2,2);
      }
      states.needsUpdate=true;
      prev=taken;
    }
    lastTime=time;
  }
  return {mesh,update};
}

/** Single static chest helper for showcases (normal race uses batched layouts). */
export function createSkyChest(){
  return createSkyChests([{index:0,position:new THREE.Vector3(),yaw:0}]).mesh;
}
