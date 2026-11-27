import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const c={ink:0x283846,pipe:0x5e747d,silver:0x94a5a7,cream:0xf3e3c3,teal:0x4d999c,
 glass:0x428a9b,brightGlass:0xa1dce0,yellow:0xfbc24b,orange:0xe26943,charcoal:0x354651,
 timber:0x805e46,lightWood:0xb69066,fir:0x36584b,pine:0x477451};

function assembly(){
 const parts=[];
 function add(input,color,position=[0,0,0],rot=[0,0,0]){
  const g=input.index?input.toNonIndexed():input;
  if(g!==input)input.dispose();
  g.deleteAttribute('uv');g.rotateX(rot[0]);g.rotateY(rot[1]);g.rotateZ(rot[2]);g.translate(...position);
  const n=g.attributes.position.count, rgb=new Float32Array(n*3), h=new T.Color(color);
  for(let i=0;i<n;i++)h.toArray(rgb,i*3);
  g.setAttribute('color',new T.BufferAttribute(rgb,3));parts.push(g);
 }
 const box=(hex,p,size,turn)=>add(new T.BoxGeometry(...size),hex,p,turn);
 const ball=(hex,p,[x,y,z],n=9,m=6)=>add(new T.SphereGeometry(1,n,m).scale(x,y,z),hex,p);
 const cone=(hex,p,rt,rb,h,n=10)=>add(new T.CylinderGeometry(rt,rb,h,n),hex,p);
 function pipe(hex,a,b,r,tip=r){
  const axis=new T.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]),d=axis.length();
  const g=new T.CylinderGeometry(tip,r,d,8);
  g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),axis.normalize()));
  add(g,hex,[(a[0]+b[0])*.5,(a[1]+b[1])*.5,(a[2]+b[2])*.5]);
 }
 return {box,ball,cone,pipe,add,finish(){
  const merged=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());
  merged.computeBoundingBox();
  const b=merged.boundingBox,dim=b.getSize(new T.Vector3()),mid=b.getCenter(new T.Vector3());
  merged.translate(-mid.x,-mid.y,-mid.z);merged.scale(1/dim.x,1/dim.y,1/dim.z);
  merged.computeBoundingBox();merged.computeBoundingSphere();
  return merged;
 }};
}

function fan(a,style){
 const jackets=[0xef7540,0x38a9bd,0xa65aa7], skin=[0xa9c773,0x8ac1d7,0xe9ab86], j=jackets[style], person=skin[style];
 // The bleachers face +X. A person has a cap/eyes, scarf, hands, jacket,
 // separate boots and a molded seat; the old single colored glob was removed.
 a.box(0x344854,[-.10,-.4,0],[.34,.09,.46]);
 a.box(0x577585,[-.24,-.19,0],[.11,.43,.46]);
 a.ball(j,[.0,.0,0],[.23,.29,.25],6,3);
 a.ball(person,[.022,.36,0],[.204,.205,.196],7,3);
 a.ball(style===1?c.yellow:c.ink,[.005,.505,0],[.19,.095,.198],7,3);
 a.box(style===1?0xe0af40:c.ink,[.16,.44,0],[.17,.036,.30]);
 a.ball(style===2?c.cream:c.yellow,[.105,.19,0],[.15,.067,.201],7,3);
 for(const side of [-1,1]){
  a.ball(c.ink,[.186,.369,side*.085],[.022,.032,.026],6,3);
  const wrist=style===0&&side===1?[.19,.44,.40]:[.24,-.13,.26*side];
  a.pipe(j,[.008,.078,.203*side],wrist,.067,.055);
  a.ball(person,wrist,[.062,.06,.057],7,3);
  a.pipe(0x394155,[.16,-.15,.105*side],[.29,-.38,.122*side],.066,.06);
  a.ball(c.ink,[.35,-.41,.122*side],[.101,.05,.073],7,3);
 }
}

function cargo(a){
 a.box(0x52666e,[0,0,0],[1,.88,1]);
 for(const side of [-1,1]){
  for(let i=0;i<12;i++){
   const z=-.45+i*.082;
   a.box(i%3===0?0x829698:0x617981,[side*.504,0,z],[.032,.76,.023]);
  }
  for(const y of [-.44,.44]){
   a.box(0x9faaa5,[side*.49,y,0],[.064,.075,1.02]);
   a.box(c.ink,[0,y,side*.51],[1,.075,.043]);
  }
  for(const x of [-.46,.46])a.box(c.ink,[x,0,side*.51],[.068,.90,.05]);
  a.box(0xadc3c2,[0,.25,side*.516],[.33,.09,.02]);
 }
 for(const x of [-.31,-.09,.09,.31]){
  a.pipe(c.silver,[x,-.34,-.536],[x,.34,-.536],.017);
  a.box(c.cream,[x,.035,-.546],[.11,.038,.024]);
 }
 for(const x of [-.42,.42])a.box(c.yellow,[x,-.35,-.536],[.079,.074,.028]);
}
function workshop(a){
 a.box(0x596c72,[0,-.07,0],[1,.78,.85]);
 a.box(0x374d56,[0,-.42,0],[1.08,.13,.94]);
 a.box(0x8da9a6,[0,.325,0],[1.14,.13,.97]);
 a.box(c.teal,[0,.39,0],[1.02,.055,.85]);
 a.box(c.ink,[0,-.105,-.43],[.55,.60,.04]);
 for(let j=0;j<6;j++)a.box(j%2?0x83a0a5:0x657c81,[0,-.337+j*.092,-.458],[.48,.067,.026]);
 a.box(c.yellow,[0,.223,-.463],[.52,.083,.027]);
 for(const x of [-.37,.37]){
  a.box(c.ink,[x,.023,-.439],[.155,.253,.043]);
  a.box(c.brightGlass,[x,.031,-.466],[.109,.177,.02]);
  a.box(0xdae3d8,[x,.119,-.481],[.104,.024,.011]);
 }
 for(const x of [-.52,.52]){
  for(const z of [-.28,.08,.30])a.box(c.glass,[x,.112,z],[.027,.20,.17]);
  a.pipe(c.orange,[x,-.22,.43],[x,.27,.43],.019);
 }
 a.box(c.ink,[.21,.485,.07],[.36,.14,.44]);
 for(let j=0;j<5;j++)a.box(c.silver,[.21,.562,-.09+j*.082],[.34,.018,.038]);
 a.pipe(c.pipe,[-.33,.42,.27],[-.33,.63,.27],.024);
}
function tanks(a){
 a.box(c.charcoal,[0,-.45,0],[1.12,.13,.82]);
 for(const x of [-.31,.31]){
  a.cone(0xd2e0db,[x,-.02,0],.234,.245,.78,16);
  a.ball(c.silver,[x,.366,0],[.234,.101,.234],13,5);
  for(const y of [-.28,.12])a.cone(y>0?c.teal:c.ink,[x,y,0],.25,.25,.08,16);
  a.box(c.yellow,[x,.025,-.246],[.295,.10,.03]);
  a.pipe(c.pipe,[x,.44,0],[x,.54,0],.050);
 }
 a.pipe(c.silver,[-.33,.52,0],[.33,.52,0],.049);
 a.pipe(c.orange,[0,.50,-.02],[0,.5,-.28],.031);
 for(const x of [-.51,.51])for(const z of [-.35,.35])a.box(c.yellow,[x,-.29,z],[.05,.29,.053]);
}
function tree(a,kind){
 if(kind==='brush'){
  for(let i=0;i<6;i++){
   const q=i*Math.PI*2/6, x=Math.sin(q)*.39,z=Math.cos(q)*.37, y=.13+(i%3)*.09;
   a.pipe(0x54634d,[0,0,0],[x,y,z],.024,.018);
   a.ball([0x548168,0x72945d,0x85a26c][i%3],[x,y,z],[.26,.22,.26],7,4);
   if(i%2===1)a.ball(0xd5be6f,[x,.26+y,z],[.056,.046,.051],6,3);
  }
  return;
 }
 a.pipe(0x625945,[0,-.50,0],[0,.38,0],.061,.033);
 if(kind==='fir'){
  for(let i=0;i<5;i++){
   const y=-.14+i*.15,r=.49-i*.086;
   a.cone([0x375b4a,0x4f7b5a,0x759368][i%3],[0,y,0],.035,r,.27,12);
   for(const d of [-1,1])a.pipe(0x6b8563,[0,y,0],[d*.67*r,y-.055,.24*r],.029,.013);
  }
 }else{
  for(let i=0;i<6;i++){
   const q=i*Math.PI/3,r=i===5?0:.245,x=Math.sin(q)*r,z=Math.cos(q)*r,y=i===5?.39:.20+(i%2)*.09;
   a.pipe(0x655745,[0,-.08,0],[x,y,z],.034,.018);
   a.ball([0x52815c,0x789b65,0x8cab72][i%3],[x,y,z],[.27,.20,.26],8,5);
  }
 }
}
function chalet(a,winter){
 const timber=winter?0x688898:c.timber;
 a.box(0x8c9691,[0,-.45,0],[1.08,.12,.85]);
 a.box(timber,[0,-.09,0],[1,.64,.75]);
 for(let y=-.30;y<.24;y+=.075)for(const x of [-.50,.50])a.box(winter?0xabc3ca:c.lightWood,[x,y,0],[.023,.019,.75]);
 for(const side of [-1,1]){
  a.box(winter?0xe2f2fc:0x424f55,[side*.27,.308,0],[.64,.082,.91],[0,0,-side*.52]);
  a.box(winter?0xafc8d6:0x31424c,[side*.48,.21,0],[.062,.063,.93]);
 }
 a.box(c.ink,[0,-.13,-.392],[.20,.44,.041]);
 a.box(c.cream,[0,-.14,-.42],[.12,.253,.022]);
 for(const x of [-.325,.325]){
  a.box(c.ink,[x,.03,-.40],[.215,.24,.035]);
  a.box(winter?0xfbd278:0xffc178,[x,.03,-.427],[.161,.184,.016]);
  a.box(c.pipe,[x,.03,-.438],[.018,.187,.017]);
  a.box(c.pipe,[x,.03,-.438],[.17,.018,.017]);
 }
 a.box(0x636e6b,[.28,.41,.17],[.128,.31,.136]);
 a.box(c.ink,[.28,.576,.17],[.177,.052,.184]);
}
function relay(a,winter){
 const tint=winter?0x91b9d0:0x859c91;
 a.box(c.charcoal,[0,-.47,0],[1.1,.12,.93]);
 for(const x of [-.36,.36])for(const z of [-.32,.32]){
  a.pipe(c.pipe,[x,-.45,z],[x*.42,.26,z*.4],.026);
  a.pipe(tint,[x,-.38,z],[x*.42,.14,-z*.37],.017);
 }
 for(const y of [-.33,-.04,.24])a.box(tint,[0,y,0],[.72-y*.8,.06,.65-y*.8]);
 a.box(c.cream,[0,.28,0],[.57,.13,.48]);
 a.box(c.ink,[0,.36,0],[.66,.06,.55]);
 a.pipe(c.silver,[0,.38,0],[0,.60,0],.036);
 a.ball(winter?0xe8f5fc:c.orange,[0,.58,0],[.14,.11,.14],12,7);
 a.pipe(c.yellow,[.21,.32,-.11],[.43,.45,-.1],.027);
}

const names=['fan-0','fan-1','fan-2','cargo','workshop','tanks','tree','fir','brush','snow-station','timber-station','snow-relay','alpine-relay'];
export const CIRCUIT_PROP_NAMES=Object.freeze(names);
export function makeCircuitProp(name){
 if(!names.includes(name))throw Error('Unknown circuit prop '+name);
 const a=assembly();
 if(name.startsWith('fan-'))fan(a,Number(name.at(-1)));
 else if(name==='cargo')cargo(a);
 else if(name==='workshop')workshop(a);
 else if(name==='tanks')tanks(a);
 else if(name==='snow-station'||name==='timber-station')chalet(a,name==='snow-station');
 else if(name.endsWith('relay'))relay(a,name==='snow-relay');
 else tree(a,name);
 return a.finish();
}
