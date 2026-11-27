import * as T from 'three';
import {createTrackSample} from './sim/track-core.js';

// Presentation only. Family silhouettes remain distinct even without their colors:
// candy chips, disc crescents, afterburn streaks and round jelly orbits.
const V={
  soda:      [0xe0f35c,0xa5ff31,'rays'], triple:[0xffe368,0xbefb43,'rays'], comet:[0xffec84,0xff8935,'rays'],
  ball:      [0xffb77a,0xff623a,'ember'], disc:[0x6ceeff,0x217ce6,'crescent'],
  bubble:    [0xc0ffff,0x487fe4,'shard'], slip:[0xe4a8ff,0x932fe7,'jelly'],
  box:       [0xffaf55,0xff537e,'chip'], pop:[0xffd463,0xff596d,'chip'],
  cursor:    [0xff98d7,0xe43a91,'lock'], pulse:[0xedafff,0x824deb,'bass'], speaker:[0xedafff,0x824deb,'bass'],
  spool:     [0x9af6ff,0x509ce4,'metal'], strip:[0x84ffd4,0x22b980,'rays'],
  bolt:      [0xff9bcf,0xffd95c,'chip'], fan:[0xff9bcf,0xffd95c,'chip'],
  lob:       [0xe1ff8b,0x68bd21,'jelly'], ring:[0xffdf89,0xf09a29,'orbital'],
  puck:      [0xf4e0ff,0x8847e9,'shock'], broom:[0xcbffe8,0x21c8a7,'shard'],
  spring:    [0xffe3ad,0xf27428,'metal'], siphon:[0x9afff1,0x27bcba,'shard'],
  rocket:    [0xffc66f,0xff4e37,'thruster'], lightbolt:[0xb2fff6,0x58bcff,'plasma'],
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
  const mat=new T.MeshBasicMaterial({color:0xffffff,side:T.DoubleSide,forceSinglePass:true,transparent:true,opacity:.89,
    depthWrite:false,toneMapped:false});
  const pool=new T.InstancedMesh(geometry,mat,n);pool.count=0;pool.frustumCulled=false;
  pool.instanceMatrix.setUsage(T.DynamicDrawUsage);return pool;
}
const STYLE={
  rays:{parts:8,height:.56,spread:1.08,loops:1},shard:{parts:9,height:.64,spread:.97,loops:1},
  metal:{parts:8,height:.41,spread:1.05,loops:1},jelly:{parts:9,height:.44,spread:.91,loops:1},
  chip:{parts:12,height:1.06,spread:.99,loops:1},bass:{parts:8,height:.36,spread:1.26,loops:2},
  shock:{parts:10,height:.51,spread:1.17,loops:1},ember:{parts:10,height:.84,spread:1.00,loops:1},
  crescent:{parts:8,height:.43,spread:1.27,loops:0},lock:{parts:8,height:.58,spread:.92,loops:0},
  orbital:{parts:8,height:.52,spread:1.05,loops:1},thruster:{parts:12,height:1.32,spread:1.10,loops:2},
  plasma:{parts:8,height:.63,spread:.96,loops:0},
};
function slash(){
  const data=[-1,-.08,0, .35,-.20,0,1,0,0, -1,-.08,0,1,0,0,-.40,.21,0];
  return new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(data,3));
}
export function createItemFx(scene,initialTrack,{reduced=false,onSignal}={}){
  const group=new T.Group();group.name='Item impact FX';scene.add(group);
  let track=initialTrack, head=0, serial=0;
  const ring=instances(new T.TorusGeometry(1,.044,5,24),CAP*3);
  const arc=instances(new T.TorusGeometry(1,.059,4,16,Math.PI*.70),CAP*3);
  const flash=instances(star(),CAP);
  const shards=instances(new T.OctahedronGeometry(1),CAP*COUNT);
  const chips=instances(new T.BoxGeometry(1,1,1),CAP*COUNT);
  const drops=instances(new T.IcosahedronGeometry(1,0),CAP*COUNT);
  const strokes=instances(slash(),CAP*COUNT);
  for(const [b,name] of [[ring,'impact-rings'],[arc,'impact-sections'],[flash,'impact-stars'],[shards,'impact-shards'],[chips,'impact-confetti'],[drops,'impact-droplets'],[strokes,'impact-streaks']])b.name=name;
  group.add(ring,arc,flash,shards,chips,drops,strokes);
  const buckets=[ring,arc,flash,shards,chips,drops,strokes];
  const slots=Array.from({length:CAP},()=>({age:Infinity,p:new T.Vector3(),color:new T.Color(),edge:new T.Color(),heading:new T.Vector3()}));
  const road=createTrackSample();
  const pos=new T.Vector3(),eye=new T.Vector3(),tmp=new T.Color(),partColor=new T.Color(),white=new T.Color(0xffffff);
  const ringRot=new T.Euler(-Math.PI/2,0,0,'YXZ'),rotScratch=new T.Euler(),m=new T.Object3D();
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
    else Object.assign(road,track.sample(event.s,event.x));
    e.p.set(road.position.x,road.position.y+(event.height??.9),road.position.z);
    e.age=0;e.seed=serial++;e.phase=phase;e.type=type;e.style=style;e.recipe=STYLE[style]??STYLE.shard;
    e.life=phase==='muzzle'?.18:phase==='bounce'?.29:short?.34:phase==='blast'?.63:phase==='intercept'?.39:.51;
    e.strength=phase==='miss'?.38:phase==='use'?.67:phase==='muzzle'?.54:phase==='bounce'?.60:phase==='blast'?1.18:1;
    e.heading.set(road.forward?.x??0,0,road.forward?.z??1).normalize();
    e.yaw=Math.atan2(e.heading.x,e.heading.z);
    e.grade=road.grade??0;e.bank=road.bank??0;
    e.color.setHex(fill);e.edge.setHex(edge);
    if(event.isPlayer)onSignal?.(event,fill,e.seed);
    return e.seed;
  }
  // Takes back the effect `cue` returned this token for, if it is still playing.
  function cancel(token){
    for(const e of slots)if(e.seed===token&&e.age<e.life){e.age=Infinity;return true;}
    return false;
  }
  function update(dt,camera){
    for(const b of buckets)b.count=0;
    if(camera)eye.copy(camera.position);
    for(const e of slots){
      if(e.age>=e.life||!Number.isFinite(e.age))continue;
      e.age+=Number.isFinite(dt)?Math.max(0,dt):0;
      const t=e.age/e.life;
      if(t>=1)continue;
      const life=1-t,curve=1-life*life;
      const spread=curve*e.strength;
      const r=e.recipe;
      const width=(.57+spread*2.25*r.spread)*Math.max(.44,1-t*.48);
      const brightness=.45+.50*life;
      const c=tmp.copy(e.edge).lerp(e.color,Math.max(0,1-t*1.21)).multiplyScalar(brightness);
      const style=e.style;
      const rebound=e.phase==='bounce',beam=e.phase==='muzzle',block=e.phase==='block',blast=e.phase==='blast',sweep=e.phase==='clear';
      const loops=reduced?1:block?2:rebound||beam||sweep?0:r.loops;
      for(let i=0;i<loops;i++){
        const d=Math.max(.10,width*(1-i*.24));
        pos.copy(e.p);pos.y+=(style==='bass'?i*.25:i*.12)+.028;
        ringRot.set(-Math.PI/2+e.grade*.72,0,e.bank*.57,'YXZ');
        if(block)ringRot.set(i?-.66:-.91,i?-.37:.41,t*(i?-.96:1.11));
        put(ring,pos,d,d,Math.max(.15,d*(.53+.31*life)),c,ringRot);
      }
      if(!reduced&&(rebound||block||sweep||style==='crescent'||style==='lock'||style==='orbital'||style==='plasma')){
        const n=rebound||style==='plasma'?1:block||style==='lock'?3:2;
        for(let j=0;j<n;j++){
          const a=e.yaw+t*.88+j*TAU/n+(style==='lock'?Math.PI*.21:0);
          pos.copy(e.p);
          if(rebound)pos.addScaledVector(e.heading,(j+.1)*spread*.37);
          pos.y+=(block?j*.20:sweep?j*.11:.15);
          const d=width*(1-j*.17);
          ringRot.set(sweep||rebound||style==='crescent'?-Math.PI/2+e.grade*.55:-.65+a*.11,a,j*.07);
          put(arc,pos,d*(style==='plasma'?.68:1),d,d*(.67+.18*life),c,ringRot);
        }
      }
      if(t<.18&&!reduced&&camera&&!rebound&&!sweep){
        m.position.copy(e.p);m.scale.setScalar(1);m.lookAt(eye);
        rotScratch.copy(m.rotation);
        const z=(.14+(1-t/.18)*(blast?.92:beam?.35:.60))*e.strength;
        partColor.copy(white).lerp(e.color,.58);
        put(flash,e.p,z,z,.15,partColor,rotScratch);
      }
      if(reduced)continue;
      for(let i=0;i<r.parts;i++){
        const u=i/r.parts;
        const a=(u+e.seed*.071)*TAU;
        const rate=.90+(i%4)*.30;
        const range=.15+spread*rate*r.spread;
        const upward=Math.sin(t*Math.PI)*(r.height+(i%3)*.14)*e.strength;
        const gravity=t*t*(style==='jelly'?.55:style==='chip'?.42:.29);
        pos.set(e.p.x+Math.cos(a)*range,e.p.y+.08+upward-gravity,e.p.z+Math.sin(a)*range);
        if(beam){
          pos.copy(e.p).addScaledVector(e.heading,i*.085+spread*(1.16+i%4*.31));
          pos.x+=Math.cos(a)*(i%3)*.050;pos.y+=.05+Math.sin(a)*.12;pos.z+=Math.sin(a)*(i%3)*.042;
        }else if(rebound){
          pos.addScaledVector(e.heading,spread*.69);
          pos.y=e.p.y+.06+upward*.55;
        }else if(style==='crescent') pos.y=e.p.y+.09+upward*.44;
        const chosen=style==='chip'?chips:style==='jelly'||style==='ember'&&i%3===1?drops:style==='plasma'||style==='thruster'||style==='shock'||rebound||sweep?strokes:shards;
        const color=partColor.copy(style==='chip'?palette[(i+e.seed)%4]:i%3===0?e.edge:e.color).multiplyScalar(.36+life*.64);
        const q=(.088+(i%3)*.025)*Math.max(.06,life)*e.strength;
        if(chosen===strokes){
          const heading=beam?e.yaw:a+Math.PI*.5;
          put(chosen,pos,q*(beam?2.4:blast?3.6:2.62),q*.52,q*1.14,color,rotScratch.set(.25,heading,blast?.66+(i%3)*.16:.10));
        }else if(style==='jelly'){
          put(chosen,pos,q*1.70,q*(.75+.35*Math.sin(t*Math.PI)),q*1.50,color);
        }else{
          put(chosen,pos,q,style==='chip'?q*.34:q*.76,style==='metal'||style==='crescent'?q*2.46:q*1.41,
            color,rotScratch.set(i+t*(style==='chip'?7:3),a+t*2,.4+i));
        }
      }
    }
    for(const b of buckets){
      b.visible=b.count>0;
      if(!b.count)continue;
      b.instanceMatrix.clearUpdateRanges();b.instanceMatrix.addUpdateRange(0,b.count*16);
      b.instanceColor.clearUpdateRanges();b.instanceColor.addUpdateRange(0,b.count*3);
      b.instanceMatrix.needsUpdate=true;b.instanceColor.needsUpdate=true;
    }
  }
  function reset(){
    for(const e of slots)e.age=Infinity;
    for(const b of buckets){b.count=0;b.visible=false;}
    head=0;serial=0;
  }
  function dispose(){reset();group.removeFromParent();for(const b of buckets){b.dispose();b.geometry.dispose();b.material.dispose();}}
  reset();
  return {cue,cancel,update,reset,group,dispose,setTrack(next){track=next;reset();}};
}
