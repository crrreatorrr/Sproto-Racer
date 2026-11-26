import * as T from 'three';
import {createTrackSample} from './sim/track-core.js';

// Presentation only. Each impact recipe is recognisable by shape as well as hue:
// candy chips, cyan crystal, amber ricochet, jelly globs, or static zigzags.
const V={
  soda:      [0xe0f35c,0xa5ff31,'rays'], triple:[0xffe368,0xbefb43,'rays'], comet:[0xffec84,0xff8935,'rays'],
  ball:      [0xffb77a,0xff623a,'rays'], disc:[0x6ceeff,0x217ce6,'metal'],
  bubble:    [0xc0ffff,0x487fe4,'shard'], slip:[0xe4a8ff,0x932fe7,'jelly'],
  box:       [0xffaf55,0xff537e,'chip'], pop:[0xffd463,0xff596d,'chip'],
  cursor:    [0xff98d7,0xe43a91,'shard'], pulse:[0xedafff,0x824deb,'bass'], speaker:[0xedafff,0x824deb,'bass'],
  spool:     [0x9af6ff,0x509ce4,'metal'], strip:[0x84ffd4,0x22b980,'rays'],
  bolt:      [0xff9bcf,0xffd95c,'chip'], fan:[0xff9bcf,0xffd95c,'chip'],
  lob:       [0xe1ff8b,0x68bd21,'jelly'], ring:[0xffdf89,0xf09a29,'metal'],
  puck:      [0xf4e0ff,0x8847e9,'shock'], broom:[0xcbffe8,0x21c8a7,'shard'],
  spring:    [0xffe3ad,0xf27428,'metal'], siphon:[0x9afff1,0x27bcba,'shard'],
  rocket:    [0xffc66f,0xff4e37,'rays'], lightbolt:[0xb2fff6,0x58bcff,'shock'],
  obstacle:  [0xffe3bd,0xd48e62,'shard'], pickup:[0xe5fff8,0x45cbc7,'shard'],
};
export function itemCueLook(phase,type) {
  const key=phase==='block'?'bubble':phase==='clear'?'broom':phase==='pickup'?'pickup':type;
  return V[key]??V.obstacle;
}
const DECALS={pulse:'speaker',pop:'box',bolt:'fan',lightbolt:'',obstacle:''};
export function cueIconType(phase,type){
  return phase==='block'?'bubble':phase==='clear'?'broom':DECALS[type]??type;
}
const CAP=24, COUNT=12;
const TAU=2*Math.PI;
const palette=['#6ff6da','#ff8fca','#ffdc74','#a89aff'].map(c=>new T.Color(c));
function star(){
  const sh=new T.Shape();for(let i=0;i<12;i++){
    const a=i*TAU/12,r=i%2?.32:1,x=Math.cos(a)*r,y=Math.sin(a)*r;
    if(i===0)sh.moveTo(x,y);else sh.lineTo(x,y);
  }sh.closePath();return new T.ShapeGeometry(sh);
}
function instances(geometry,n){
  const mat=new T.MeshBasicMaterial({color:0xffffff,side:T.DoubleSide,transparent:true,opacity:.90,
    depthWrite:false,toneMapped:false});
  const pool=new T.InstancedMesh(geometry,mat,n);pool.count=0;pool.frustumCulled=false;
  pool.instanceMatrix.setUsage(T.DynamicDrawUsage);return pool;
}
export function createItemFx(scene,initialTrack,{reduced=false,onSignal}={}){
  const group=new T.Group();group.name='Item impact FX';scene.add(group);
  let track=initialTrack, head=0, serial=0;
  const ring=instances(new T.TorusGeometry(1,.047,5,28),CAP*3);
  const flash=instances(star(),CAP);
  const shards=instances(new T.OctahedronGeometry(1),CAP*COUNT);
  const chips=instances(new T.BoxGeometry(1,1,1),CAP*COUNT);
  const drops=instances(new T.IcosahedronGeometry(1,0),CAP*COUNT);
  group.add(ring,flash,shards,chips,drops);
  const buckets=[ring,flash,shards,chips,drops];
  const slots=Array.from({length:CAP},()=>({age:Infinity,p:new T.Vector3(),color:new T.Color(),edge:new T.Color()}));
  const road=createTrackSample();
  const pos=new T.Vector3(),eye=new T.Vector3(),tmp=new T.Color(),white=new T.Color(0xffffff);
  const ringRot=new T.Euler(-Math.PI/2,0,0),rotScratch=new T.Euler(),m=new T.Object3D();
  function put(b,p,sx,sy,sz,c,rotation){
    const i=b.count;if(i>=b.instanceMatrix.count)return;
    m.position.copy(p);m.scale.set(sx,sy,sz);
    if(rotation)m.rotation.copy(rotation);else m.rotation.set(0,0,0);
    m.updateMatrix();b.setMatrixAt(i,m.matrix);b.setColorAt(i,c);b.count++;
  }
  function cue(event){
    if(!Number.isFinite(event.s)||!Number.isFinite(event.x))return;
    const {phase,type}=event;
    const [fill,edge,style]=itemCueLook(phase,type);
    const short=phase==='use'||phase==='miss'||phase==='bounce'||phase==='muzzle';
    const e=slots[head];head=(head+1)%CAP;
    if(track.sampleInto)track.sampleInto(event.s,event.x,road);
    else {const r=track.sample(event.s,event.x);road.position=r.position;}
    e.p.set(road.position.x,road.position.y+(event.height??.9),road.position.z);
    e.age=0;e.seed=serial++;e.phase=phase;e.type=type;e.style=style;
    e.life=short?.37:phase==='blast'?.63:.53;
    e.strength=phase==='miss'?.44:phase==='use'?.73:phase==='bounce'?.60:phase==='blast'?1.32:1;
    e.color.setHex(fill);e.edge.setHex(edge);
    if(event.isPlayer)onSignal?.(event,fill);
  }
  function update(dt,camera){
    for(const b of buckets)b.count=0;
    if(camera)eye.copy(camera.position);
    for(const e of slots){
      if(e.age>=e.life||!Number.isFinite(e.age))continue;
      e.age+=Math.max(0,dt);const t=e.age/e.life;
      if(t>=1)continue;
      const spread=(1-(1-t)**2)*e.strength;
      const width=(.70+spread*2.1)*Math.max(.40,1-t*.41);
      const life=1-t;
      const c=tmp.copy(e.edge).lerp(e.color,Math.max(0,1-t*1.15)).multiplyScalar(.46+.54*life);
      // Shields fracture into two pale hoops; bass and splash travel as a wider wave.
      const loops=e.style==='bass'||e.phase==='block'?3:e.phase==='miss'?1:2;
      for(let i=0;i<loops;i++){
        const d=Math.max(.10,width*(1-i*.19)),h=e.style==='bass'?i*.27:i*.08;
        pos.copy(e.p);pos.y+=h;
        put(ring,pos,d,d,d*.75,c,ringRot);
      }
      if(t<.19&&!reduced&&camera){
        m.position.copy(e.p);
        m.lookAt(eye);
        rotScratch.copy(m.rotation);
        const z=(.29+(1-t/.19)*.94)*e.strength;
        put(flash,e.p,z,z,.2,white,rotScratch);
      }
      if(reduced)continue;
      for(let i=0;i<COUNT;i++){
        const a=(i/COUNT+e.seed*.071)*TAU;
        const rate=1.05+(i%4)*.32;
        const range=(.18+spread*rate);
        pos.set(e.p.x+Math.cos(a)*range,e.p.y+.08+Math.sin(t*Math.PI)*(.38+(i%3)*.19)*e.strength,e.p.z+Math.sin(a)*range);
        const chosen=e.style==='chip'?chips:e.style==='jelly'?drops:shards;
        const color=e.style==='chip'?palette[(i+e.seed)%4]:i%3===0?e.edge:e.color;
        const q=(.085+(i%3)*.025)*Math.max(.1,life)*e.strength;
        if(e.style==='shock'){
          put(chosen,pos,q*.64,q*.59,q*3.55,color,rotScratch.set(.29,Math.PI*.5-a,(i%2?1:-1)*.35));
        }else if(e.style==='jelly'){
          put(chosen,pos,q*1.65,q*.9,q*1.49,color);
        }else{
          put(chosen,pos,q,e.style==='chip'?q*.36:q*.69,e.style==='metal'?q*2.7:q*1.64,
            color,rotScratch.set(i+t,a+t*2,.4+i));
        }
      }
    }
    for(const b of buckets){b.visible=b.count>0;if(b.count){b.instanceMatrix.needsUpdate=true;b.instanceColor.needsUpdate=true;}}
  }
  function reset(){
    for(const e of slots)e.age=Infinity;
    for(const b of buckets){b.count=0;b.visible=false;}
    head=0;serial=0;
  }
  function dispose(){reset();group.removeFromParent();for(const b of buckets){b.dispose();b.geometry.dispose();b.material.dispose();}}
  reset();
  return {cue,update,reset,group,dispose,setTrack(next){track=next;reset();}};
}
