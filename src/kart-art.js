import {attachConcept,conceptFor} from './concept-art.js';
import {attachSkipper} from './skipper.js';
import {skipperAxles,skipperHalfTrack,skipperDriver} from './skipper-layout.js';
import {attachShoppingCart} from './shopping-cart.js';
import {cartAxles,cartHalfTrack,cartDriver} from './shopping-cart-layout.js';
import {attachSaucer} from './saucer.js';
import {saucerDriver,saucerRadius} from './saucer-layout.js';
import {attachManta} from './manta.js';
import {mantaAxles,mantaHalfTrack,mantaDriver,mantaTail} from './manta-layout.js';
import {attachCrestline} from './crestline.js';
import {crestlineAxles,crestlineHalfTrack,crestlineDriver} from './crestline-layout.js';
import {attachIronhide,ironhideShadow} from './ironhide.js';
import {ironhideAxles,ironhideHalfTrack,ironhideDriver,ironhideTail} from './ironhide-layout.js';
import {fullLockCurvature,frontWheelAngle} from './steering.js';
import * as THREE from 'three';
import {attachHexshift,hexshiftDriver,styleHexshiftShadow,makeLunarWake,animateLunarWake} from './hexshift.js';
import {attachBarrage} from './barrage.js';
import {barrageDriver,barrageAxles,barrageHalfTrack,barrageTail} from './barrage-layout.js';
import {attachGeep,geepDriver} from './geep.js';
import {geepAxles,geepScale,geepHalfTrack} from './geep-layout.js';
import {releaseKartFade} from './kart-visibility.js';
import {HIT_STUN_SECONDS} from './driving.js';
import {CARS,DRIVERS} from './roster.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const palette = new Map();
function paint(color, roughness=.65) {
  const key=color+':'+roughness;
  if(!palette.has(key)) palette.set(key,new THREE.MeshStandardMaterial({color,roughness,flatShading:true}));
  return palette.get(key);
}
const box=new THREE.BoxGeometry(), ball=new THREE.IcosahedronGeometry(1,1), tire=new THREE.CylinderGeometry(1,1,1,12);
function piece(group,geometry,material,x,y,z,w,h,d) {
  const mesh=new THREE.Mesh(geometry,material);
  mesh.position.set(x,y,z);mesh.scale.set(w,h,d);group.add(mesh);return mesh;
}
const cube=(g,col,x,y,z,w,h,d)=>piece(g,box,paint(col),x,y,z,w,h,d);
const blob=(g,col,x,y,z,w,h,d)=>piece(g,ball,paint(col),x,y,z,w,h,d);
const decals=new Map();
function plate(group,text,x,y,z,w,h,rotY=0) {
  if(!decals.has(text)){
    const c=document.createElement('canvas'); c.width=192;c.height=112;
    const ctx=c.getContext('2d');ctx.fillStyle='#f4eaca';ctx.fillRect(0,0,192,112);
    ctx.fillStyle='#18282b';ctx.font='italic 900 96px Arial';ctx.textAlign='center';ctx.fillText(text,91,92);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    decals.set(text,new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));
  }
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),decals.get(text));m.position.set(x,y,z);m.rotation.y=rotY;group.add(m);return m;
}
// Wheels, driver and chassis animate separately. Fold the rigid colored pieces of
// each into a vertex-colored draw call so a packed grid stays inexpensive.
const solidParts=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.65,flatShading:true});
function batchParts(group) {
  const originals=group.children.filter(m=>m.isMesh&&m.material.isMeshStandardMaterial&&!m.material.map);
  if(originals.length<2)return;
  const pieces=originals.map(m=>{
    m.updateMatrix();
    const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();
    g.applyMatrix4(m.matrix);
    g.deleteAttribute('uv');
    const n=g.attributes.position.count,colors=new Float32Array(n*3);
    for(let i=0;i<n;i++)m.material.color.toArray(colors,i*3);
    g.setAttribute('color',new THREE.BufferAttribute(colors,3));
    return g;
  });
  const combined=mergeGeometries(pieces);
  if(combined){group.remove(...originals);group.add(new THREE.Mesh(combined,solidParts));}
  pieces.forEach(g=>g.dispose());
}
const ink='#202c32',metal='#809397',white='#f8edcc';
const steering=new THREE.TorusGeometry(.29,.048,6,16);
const pipeShape=new THREE.CylinderGeometry(1,1,1,8);
const tuftShape=new THREE.ConeGeometry(1,1,3);
const sharedGeometry=new Set([box,ball,tire,steering,pipeShape,tuftShape]);
function rod(group,color,a,b,radius) {
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b);
  const axis=end.clone().sub(start);
  const mesh=new THREE.Mesh(pipeShape,paint(color));
  mesh.position.copy(start).lerp(end,.5);
  mesh.scale.set(radius,axis.length(),radius);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis.normalize());group.add(mesh);
}
function buildShell(body,car) {
  const {id,color,trim}=car;
  // Keep the cabin between the axles open. Side pods and body panels wrap the same seat.
  cube(body,ink,0,.32,.02,1.60,.22,3.08);
  for(const side of [-1,1]){
    const x=side*.77;
    if(id==='apex'){
      cube(body,color,x,.54,.16,.35,.34,1.66);
      cube(body,trim,x+side*.18,.56,.13,.025,.07,1.05);
      cube(body,ink,side*.69,1.01,1.26,.10,.76,.16);
      cube(body,color,side*.97,1.38,1.34,.10,.29,.53);
    }else if(id==='needle'){
      blob(body,color,x,.47,.31,.26,.21,.88);
      rod(body,ink,[side*.40,.38,-.78],[side*1.10,.45,-1.12],.065);
      cube(body,trim,side*.9,.39,-1.60,.10,.24,.52);
      rod(body,metal,[side*.49,.51,1.05],[side*.64,1.08,1.41],.065);
    }else if(id==='pogo'){
      for(const z of [-1.04,1.03])blob(body,color,side*.89,.75,z,.36,.28,.56);
      rod(body,trim,[x,.44,-.84],[x,.78,-.35],.074);
      rod(body,trim,[x,.78,-.35],[x,.66,.70],.074);
      rod(body,trim,[side*.65,.59,1.32],[side*.65,1.55,1.08],.071);
      rod(body,metal,[side*.66,.55,.72],[side*.65,1.55,1.08],.052);
    }else if(id==='gecko'){
      const pod=blob(body,color,side*.80,.57,-.04,.35,.29,1.68);pod.rotation.y=side*.055;
      const fin=cube(body,trim,side*.92,.85,1.02,.09,.39,.82);fin.rotation.x=.29;
      blob(body,'#e2fa9a',side*.87,.69,-1.25,.13,.06,.32);
    }else{
      cube(body,color,x,.64,.01,.32,.50,1.98);
      cube(body,trim,x+side*.17,.62,.02,.025,.10,1.68);
      cube(body,color,side*.78,.82,1.12,.25,.39,.83);
      cube(body,ink,side*.69,1.06,.88,.11,.68,.12);
      cube(body,trim,side*.67,1.4,.88,.20,.13,.22);
    }
  }
  if(id==='apex'){
    const nose=cube(body,color,0,.62,-1.12,1.15,.33,1.09);nose.rotation.x=-.13;
    const stripe=cube(body,trim,0,.80,-1.14,.20,.025,1.01);stripe.rotation.x=-.13;
    cube(body,ink,0,.37,-1.67,1.93,.19,.26);
    cube(body,color,0,1.36,1.34,1.96,.14,.50);
  }else if(id==='needle'){
    blob(body,color,0,.54,-1.19,.39,.29,.76);
    cube(body,trim,0,.76,-.97,.11,.06,.87);
    cube(body,color,0,.32,-1.62,1.87,.10,.42);
    cube(body,color,0,1.11,1.40,1.70,.11,.46);
    cube(body,trim,0,1.23,1.51,1.60,.065,.21);
  }else if(id==='pogo'){
    blob(body,color,0,.65,-1.10,.69,.32,.55);
    cube(body,trim,0,.39,-1.61,1.51,.15,.21);
    for(const side of [-1,1])blob(body,white,side*.53,.76,-1.43,.14,.13,.10);
    rod(body,trim,[-.65,1.55,1.08],[.65,1.55,1.08],.072);
    cube(body,metal,0,.64,1.26,1.06,.36,.52);
  }else if(id==='gecko'){
    blob(body,trim,0,.52,-.98,.69,.19,.45);
    blob(body,color,0,.58,1.20,.84,.23,.50);
  }else{
    cube(body,color,0,.69,-1.07,1.64,.46,1.12);
    cube(body,ink,0,.59,-1.64,1.32,.24,.055);
    for(const side of [-1,1])cube(body,trim,side*.65,.74,-1.65,.22,.14,.06);
    cube(body,ink,0,.62,1.17,1.42,.13,.71);
    cube(body,color,0,.81,1.52,1.68,.33,.14);
  }
}
function buildDriver(driver,person){
  const {skin,suit,accent,cap,id}=person;
  blob(driver,suit,0,.29,.15,.43,.45,.38);
  blob(driver,skin,0,.94,.04,.62,.60,.53);
  for(const side of [-1,1]){
    const ear=blob(driver,skin,side*.55,1.07,.02,.34,.19,.16);
    ear.rotation.z=side*(id==='pip'?.90:.42);
    blob(driver,white,side*.232,1.01,-.398,.255,.25,.15);
    blob(driver,ink,side*.215,1.015,-.526,.099,.14,.048);
    blob(driver,white,side*.196,1.065,-.565,.03,.04,.017);
    rod(driver,suit,[side*.19,.04,.06],[side*.25,.04,-.32],.106);
    rod(driver,suit,[side*.25,.04,-.32],[side*.24,-.10,-.43],.09);
    blob(driver,ink,side*.24,-.11,-.47,.11,.08,.14);
    rod(driver,suit,[side*.33,.43,.04],[side*.29,.34,-.47],.115);
    blob(driver,accent,side*.29,.33,-.55,.106,.105,.13);
  }
  blob(driver,skin,0,.80,-.47,.13,.11,.12);
  blob(driver,'#534538',0,.68,-.41,.20,.045,.056);
  if(id==='sproto'){
    blob(driver,cap,0,1.395,.06,.60,.31,.54);
    blob(driver,accent,0,1.422,.04,.12,.31,.54);
    cube(driver,ink,0,1.34,-.28,1.0,.07,.40);
  }else if(id==='pip'){
    blob(driver,cap,0,1.38,.07,.59,.30,.52);
    for(const side of [-1,1]){
      blob(driver,accent,side*.24,1.39,-.36,.21,.20,.13);
      blob(driver,'#88d6e3',side*.24,1.40,-.45,.145,.13,.065);
    }
    cube(driver,accent,0,1.39,.52,.74,.093,.07);
  }else if(id==='miso'){
    for(const side of [-1,1]){
      const tuft=piece(driver,tuftShape,paint(skin),side*.36,1.51,.035,.22,.53,.21);
      tuft.rotation.z=-side*.22;
    }
    blob(driver,cap,0,.60,.06,.49,.12,.40);
    const scarf=cube(driver,accent,.16,.47,.44,.19,.37,.07);scarf.rotation.z=.28;
  }else{
    blob(driver,cap,0,1.31,.07,.64,.38,.56);
    for(const side of [-1,1]){
      rod(driver,accent,[side*.51,1.38,.06],[side*.67,1.55,.08],.112);
      rod(driver,accent,[side*.67,1.55,.08],[side*.63,1.69,.05],.073);
    }
    cube(driver,accent,0,1.38,-.42,.60,.072,.11);
  }
}
export function makeKart(id=0,car=CARS[0],person=DRIVERS[0],ghost=false) {
  const g=new THREE.Group(),body=new THREE.Group();g.add(body);
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(1,24),new THREE.MeshBasicMaterial({color:0x16252c,transparent:true,opacity:.28,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
  shadow.rotation.x=-Math.PI/2;shadow.scale.set(1.32,2,1);shadow.position.y=.025;g.add(shadow);
  const geep=car.id==='geep',hexshift=car.id==='hexshift',barrage=car.id==='barrage';
  const manta=car.id==='manta',crestline=car.id==='crestline';
  const cart=car.id==='shopping-cart';
  const skipper=car.id==='skipper',saucer=car.id==='saucer';
  const concept=conceptFor(car.id);
  const ironhide=car.id==='ironhide',customShell=concept||cart||skipper||saucer||manta||crestline||geep||hexshift||barrage||ironhide;
  if(hexshift)styleHexshiftShadow(shadow);
  if(geep)body.scale.setScalar(geepScale);else if(!customShell)buildShell(body,car);
  const wheels=[];
  const exhaustY=concept?(concept.tail?.[0]??.62):cart?.54:skipper?1.16:saucer?.72:manta?.38:crestline?.345:geep?.735:.5,tailZ=concept?(concept.tail?.[1]??concept.bounds[2]):cart?1.28:skipper?1.69:saucer?1.70:manta?mantaTail:crestline?1.93:ironhide?ironhideTail:geep?1.93:barrage?barrageTail:1.65;
  for(const side of (saucer||concept)?[]:[-1,1]){
    const stockRadius=car.id==='pogo'?.50:car.id==='gecko'?.40:.45;
    for(const [z,radius] of (cart?cartAxles:skipper?skipperAxles:manta?mantaAxles:crestline?crestlineAxles:ironhide?ironhideAxles:geep?geepAxles:barrage?barrageAxles:[[-1.10,stockRadius],[1.03,stockRadius]])){
      const axle=new THREE.Group();axle.position.set(side*(cart?cartHalfTrack:skipper?skipperHalfTrack:manta?mantaHalfTrack:crestline?crestlineHalfTrack:ironhide?ironhideHalfTrack:geep?geepHalfTrack:barrage?barrageHalfTrack:1.015),radius,z);body.add(axle);
      axle.userData.rideHeight=radius;
      axle.rotation.order='YXZ';
      wheels.push(axle);
      if(customShell)continue;
      const rubber=piece(axle,tire,paint(ink),0,0,0,radius,.37,radius);rubber.rotation.z=Math.PI/2;
      const rim=piece(axle,tire,paint(car.trim),side*.19,0,0,radius*.63,.04,radius*.63);rim.rotation.z=Math.PI/2;
      const hub=piece(axle,tire,paint(ink),side*.22,0,0,.15,.03,.15);hub.rotation.z=Math.PI/2;
      for(let i=0;i<3;i++){const spoke=cube(axle,car.color,side*.241,0,0,.025,.40,.05);spoke.rotation.x=i*Math.PI/3;}
    }
    const pipe=piece(body,tire,paint(metal),side*.52,exhaustY,tailZ-.09,.14,.49,.14);pipe.rotation.x=Math.PI/2;
    const hole=piece(body,tire,paint(ink),side*.52,exhaustY,tailZ+.17,.103,.01,.103);hole.rotation.x=Math.PI/2;
  }
  if(!customShell){
    cube(body,ink,0,.61,.14,.98,.22,.95);
    const back=cube(body,ink,0,.875,.67,.96,.52,.15);back.rotation.x=.12;
  }
  const mount=concept?concept.mount:cart?cartDriver:skipper?skipperDriver:saucer?saucerDriver:manta?mantaDriver:crestline?crestlineDriver:ironhide?ironhideDriver:geep?geepDriver:barrage?barrageDriver:hexshift?hexshiftDriver:{x:0,y:.80,z:.12,scale:1};
  const driver=new THREE.Group();
  driver.position.set(mount.x,mount.y,mount.z);driver.scale.setScalar(mount.scale);
  body.add(driver);buildDriver(driver,person);
  if(concept?.controls!==false){
  const wheelY=mount.y+.33*mount.scale,wheelZ=mount.z-.55*mount.scale;
  rod(body,metal,[mount.x,wheelY-.47*mount.scale,wheelZ-.09*mount.scale],[mount.x,wheelY,wheelZ],.045*mount.scale);
  rod(body,ink,[mount.x-.28*mount.scale,wheelY,wheelZ],[mount.x+.28*mount.scale,wheelY,wheelZ],.025*mount.scale);
  const wheel=new THREE.Mesh(steering,paint(ink));
  wheel.position.set(mount.x,wheelY,wheelZ);wheel.scale.setScalar(mount.scale);wheel.rotation.x=-.6;body.add(wheel);
  }
  const num=String(id+1).padStart(2,'0');
  const plateY=cart?.59:skipper?1.34:manta?.39:crestline?.70:ironhide?.78:geep?.991:barrage?.49:.62;
  const plateZ=cart?1.38:manta?2.13:crestline?1.94:ironhide?2.14:barrage?2.00:tailZ;
  if(!saucer&&!skipper&&!concept){
    cube(body,ink,0,plateY,plateZ,.88,.24,.12);
    if(!crestline)plate(body,num,0,plateY,plateZ+.065,.33,.16);
  }
  const timingLamp=new THREE.MeshBasicMaterial({color:0x411e18});
  for(const x of [-.32,.32]){
    if(concept)continue;
    if(saucer){
      const lamp=piece(body,ball,timingLamp,x,.826,1.917,.077,.028,.032);
      lamp.rotation.y=Math.atan2(x,1.917);
    }else if(skipper)piece(body,box,timingLamp,x*2.35,plateY,1.712,.14,.055,.033);
    else piece(body,box,timingLamp,x,plateY+.02,plateZ+.072,.18,.08,.035);
  }
  const flames=[];
  for(const side of [-1,1]){
    const nozzle=new THREE.Group();nozzle.visible=false;nozzle.position.set(side*.52,exhaustY,tailZ+.16);
    const outer=new THREE.Mesh(new THREE.ConeGeometry(.19,1,8),new THREE.MeshBasicMaterial({color:0xff8c34}));
    const core=new THREE.Mesh(new THREE.ConeGeometry(.12,1,7),new THREE.MeshBasicMaterial({color:0xfff3b6}));
    for(const cone of [outer,core]){cone.rotation.x=Math.PI/2;nozzle.add(cone);}
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.18,.024,5,12),
      new THREE.MeshBasicMaterial({color:0xffcf73,transparent:true,depthWrite:false}));
    nozzle.add(ring);body.add(nozzle);flames.push({nozzle,outer,core,ring,side,outerPaint:outer.material,corePaint:core.material,ringPaint:ring.material});
  }
  for(const w of wheels)batchParts(w);
  batchParts(driver);batchParts(body);
  if(concept)attachConcept(body,wheels,concept);
  if(skipper)attachSkipper(body,wheels,shadow);
  if(cart)attachShoppingCart(body,wheels);
  if(saucer)attachSaucer(body);
  if(manta)attachManta(body,wheels,shadow,id===0,ghost);
  if(crestline)attachCrestline(body,wheels,shadow);
  if(ironhide){attachIronhide(body,wheels);ironhideShadow(shadow);}
  if(geep)attachGeep(body,wheels);
  if(barrage)attachBarrage(body,wheels,shadow);
  const gem=hexshift?attachHexshift(body,wheels):null;
  const solidMeshes=[...body.children.filter(m=>m.isMesh),...driver.children,...wheels.flatMap(w=>(w.userData.conceptParts??w.children).concat(w.userData.fork?.children??[]))];
  const moons=hexshift?makeLunarWake(body):null;
  g.userData={body,wheels,gem,moons,driver,driverHeight:mount.y,flames,shadow,timingLamp,solidMeshes,car:car.id,concept,character:person.id};return g;
}
export function animateKart(g,k,b,time) {
  const a=g.userData;
  const lift=k.y||0, hop=THREE.MathUtils.clamp((k.hopLift||0)/.57,0,1);
  const suspension=k.suspension||0, slip=k.slipAngle||0;
  const progress=k.stunRemaining>0?1-k.stunRemaining/HIT_STUN_SECONDS:0;
  const roll=(k.hitRollSide||1)*2*Math.PI*THREE.MathUtils.smoothstep(progress,0,1);
  const bounce=1.15*Math.sin(Math.PI*progress);
  // Rotate the whole assembly around the seat. Its normal origin is at the tires.
  const pivot=1.2;
  a.body.position.x=pivot*Math.sin(roll);
  a.body.position.y=lift+suspension+bounce+pivot*(1-Math.cos(roll));
  a.body.rotation.x=hop*.12+suspension*.42;
  a.body.rotation.z=roll-slip*hop*.36;
  // Scale the smaller buggy occupant’s excursion to the bucket and wheel.
  const driverMotion=a.driver.scale.x**2*(a.concept?.hover?.9:a.concept?.mount?.scale<.85?.55:1);
  a.driver.rotation.z=driverMotion*(Math.sin(time*10)*Math.min(k.speed/450,.045)-slip*.26);
  const meter=k.sliding&&!b.chainClosed?b.meter:0;
  a.timingLamp.color.setHex(meter>=.9?0xe8ff75:meter>=.7?0xffa247:a.car==='saucer'?0xffad4f:0x411e18);
  a.driver.position.y=a.driverHeight+driverMotion*(Math.sin(time*17)*Math.min(k.speed/850,.035)+suspension*.42);
  const rack=(k.steer||0)*fullLockCurvature(k);
  for(const w of a.wheels){
    w.position.y=w.userData.rideHeight-(suspension+hop*.10)/a.body.scale.y;
    const spin=a.concept?1/w.userData.rideHeight:(a.car==='shopping-cart'||a.car==='skipper'||a.car==='manta'||a.car==='crestline'||a.car==='barrage'||a.car==='ironhide')?1/w.userData.rideHeight:a.car==='geep'?1/(w.userData.rideHeight*geepScale):2.2;
    w.rotation[w.userData.spinAxis??'x']=-(k.s||0)*spin;
    w.rotation.y=(a.concept?w.userData.steer:w.position.z<0)?-frontWheelAngle(a.car,rack,Math.sign(w.position.x)):0;
    const fork=w.userData.fork;
    if(fork){fork.position.y=w.position.y;fork.rotation.y=w.rotation.y;}
  }
  a.shadow.visible=!k.fall && lift>=0;
  const shadowSize=1/(1+Math.max(0,lift+bounce)*.19);
  a.shadow.scale.set((a.concept?a.concept.bounds[0]:a.car==='saucer'?saucerRadius:a.car==='ironhide'?1.77:a.car==='manta'?1.65:1.32)*shadowSize,(a.concept?Math.max(-a.concept.bounds[1],a.concept.bounds[2]):a.car==='saucer'?saucerRadius:a.car==='ironhide'?2.43:a.car==='manta'?2.60:2)*shadowSize,1);
  if(a.concept?.hover)a.body.position.y+=.035*Math.sin(time*3.8);
  const flash=b.ignition||0, power=b.plume||0;
  if(a.gem){
    animateLunarWake(a.moons,power,slip,time);
    a.gem.rotation.y=time*1.4;
    a.gem.position.y=.47+.018*Math.sin(time*3);
  }
  a.driver.rotation.x=driverMotion*(flash*.13-hop*.10);
  for(const {nozzle,outer,core,ring,side,outerPaint,corePaint,ringPaint} of a.flames){
    nozzle.visible=power>.015 || flash>.02;
    if(!nozzle.visible)continue;
    const superFire=b.flameTier===2;
    const ripple=1+.07*Math.sin(time*31+side*.7);
    const length=((superFire?1.50:.98)*power+.84*flash)*ripple;
    outerPaint.color.setHex((a.gem||a.car==='saucer')?(superFire?0xa389ff:0x51efbc):(superFire?0x34aefa:0xff6729));
    corePaint.color.setHex(superFire?0xdcffff:0xffee95);
    const radius=Math.sqrt(power+.7*flash);
    outer.scale.set(radius,length,radius);
    outer.position.z=length*.50;
    core.scale.set(radius,length*.68,radius);
    core.position.set(0,.055,length*.34);
    ring.visible=flash>.14;
    ring.scale.setScalar(1+(1-flash)*2);
    ring.position.z=.12+(1-flash)*1.9;
    ringPaint.opacity=flash*.8;
    ringPaint.color.copy(corePaint.color);
  }
}

// Only release resources owned by this instance. Color/number materials are pooled.
export function disposeKart(kart) {
  releaseKartFade(kart);
  const sharedMaterials=new Set([solidParts,...palette.values(),...decals.values()]);
  const geometries=new Set(),materials=new Set();
  kart.traverse(mesh=>{
    if(!mesh.isMesh||mesh.userData.sharedGeepPart||mesh.userData.sharedKartPart)return;
    if(!sharedGeometry.has(mesh.geometry))geometries.add(mesh.geometry);
    if(!sharedMaterials.has(mesh.material))materials.add(mesh.material);
  });
  for(const g of geometries)g.dispose();
  if(kart.userData.concept)materials.add(kart.userData.timingLamp);
  for(const m of materials)m.dispose();
  kart.removeFromParent();
}
