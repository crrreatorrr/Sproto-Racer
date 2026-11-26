import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

const C={ink:0x25272c,rubber:0x262528,metal:0x888689,bright:0xc3bbac,glass:0x9cd4e7,
  amber:0xff8505,light:0xffebad,cream:0xffedce,yellow:0xffbd0b,red:0xd9402c,blue:0x36a8dc,
  crane:0x9f3566,mint:0x45cf9b,cobalt:0x1662d9,lime:0xb7d023};
const paintCache=new Map();
function mat(c,style='paint'){
  const key=c+':'+style;
  if(!paintCache.has(key)){
    const M=new T.MeshStandardMaterial({color:c,
      metalness:style==='steel'?.53:style==='glass'?.03:.13,
      roughness:style==='steel'?.38:style==='glass'?.19:.53});
    if(style==='glass'){M.transparent=true;M.opacity=.19;M.depthWrite=false;M.side=T.DoubleSide;}
    if(style==='light'){M.emissive.set(c);M.emissiveIntensity=.45;}
    paintCache.set(key,M);
  }
  return paintCache.get(key);
}
function mesh(group,g,c,p,rotation,style){
  const part=new T.Mesh(g,mat(c,style));part.position.set(...p);
  if(rotation)part.rotation.set(...rotation);
  group.add(part);return part;
}
function box(group,c,p,s,r=.035,angle=0,style){
  return mesh(group,new RoundedBoxGeometry(...s,1,Math.min(r,Math.min(...s)*.45)),c,p,angle?[angle,0,0]:null,style);
}
function cylinder(group,c,p,a,b,h,angle=0,style,segments=20){
  return mesh(group,new T.CylinderGeometry(a,b,h,segments),c,p,angle?[angle,0,0]:null,style);
}
function beam(g,c,a,b,w,d=w,r=.025,style){
  const u=new T.Vector3(...a),v=new T.Vector3(...b);
  const part=box(g,c,u.clone().lerp(v,.5).toArray(),[w,u.distanceTo(v),d],r,0,style);
  part.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.sub(u).normalize());
  return part;
}
function tube(g,c,a,b,r,style){
  const u=new T.Vector3(...a),v=new T.Vector3(...b);
  const part=cylinder(g,c,u.clone().lerp(v,.5).toArray(),r,r,u.distanceTo(v),0,style,12);
  part.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.sub(u).normalize());
  return part;
}
function sidePin(g,x,y,z,r,c=C.bright){return mesh(g,new T.CylinderGeometry(r,r,.063,12),c,[x,y,z],[0,0,Math.PI/2],'steel');}
function beacon(g,x,y,z){
  cylinder(g,C.ink,[x,y,z],.125,.127,.055);
  cylinder(g,C.amber,[x,y+.090,z],.093,.105,.12,0,'light',14);
  cylinder(g,0xffd852,[x,y+.151,z],.061,.093,.027,0,'light',14);
}
function frontLights(g,z,y,x=.58,w=.26,h=.23){
  for(const s of [-1,1]){
    box(g,C.ink,[s*x,y,z],[w+.07,h+.06,.11]);
    box(g,C.light,[s*x,y,z-.06],[w,h,.05],.045,0,'light');
  }
}
function grille(g,z,y,w=.66,h=.35,bars=4){
  box(g,C.ink,[0,y,z],[w,h,.065],.05);
  for(let i=0;i<bars;i++)box(g,C.bright,[0,y-h*.31+i*h*.62/Math.max(1,bars-1),z-.039],[w*.87,.027,.028],.012,0,'steel');
}
function sideVents(g,x,y,z,count=3){
  for(let i=0;i<count;i++)box(g,C.ink,[x,y-i*.125,z],[.026,.047,.37],.021);
}
function frame(g,x,y,z,w,l,c=C.ink){
  box(g,c,[x,y,z],[w,.25,l],.075);
  for(const side of [-1,1])box(g,0x37373b,[x+side*w*.39,y-.14,z],[.12,.16,l*.77],.026);
}
function archedFender(g,x,y,z,r,w,c){
  const geo=new T.CylinderGeometry(r+.105,r+.105,w,20,1,true,0,Math.PI);
  const f=mesh(g,geo,c,[x,y,z],[0,0,Math.PI/2]);
  f.material.side=T.DoubleSide;
  const edge=new T.TorusGeometry(r+.105,.038,6,20,Math.PI);
  mesh(g,edge,c,[x+(x>0?w*.5:-w*.5),y,z],[0,Math.PI/2,0]);
}
function seat(g,x,y,z,w=.67){
  box(g,0x302a2b,[x,y-.10,z+.03],[w,.15,.52],.07);
  box(g,0x302a2b,[x,y+.29,z+.42],[w,.70,.20],.075,-.13);
  box(g,0x3e3230,[x,y+.38,z+.307],[w*.74,.50,.05],.021,-.13);
}
function windowPane(g,p,w,h,rotation){
  return mesh(g,new T.PlaneGeometry(w,h),C.glass,p,rotation,'glass');
}
function cab(g,{x=0,z=-.76,y=1.0,w=1.78,d=1.20,roof=2.54,c=C.yellow,trim=c,open=false,panel=true}){
  const front=z-d*.5,back=z+d*.5,wend=x-w*.5,wplus=x+w*.5;
  box(g,c,[x,y-.12,z],[w,.27,d],.10);
  box(g,trim,[x,roof,z+.045],[w+.075,.16,d+.045],.082);
  for(const v of [wend+.09,wplus-.09]){
    beam(g,c,[v,y+.10,front],[v,roof,front+.14],.14,.13,.042);
    beam(g,c,[v,y+.08,back],[v,roof,back+.05],.12,.13,.036);
    box(g,trim,[v,y+.12,z+.01],[.14,.19,d],.049);
    if(!open){
      windowPane(g,[v,y+(roof-y)*.52,z+.06],d-.26,roof-y-.38,[0,v<x?-Math.PI/2:Math.PI/2,0]);
      box(g,C.metal,[v,y+.67,front-.06],[.16,.28,.17],.062,0,'steel');
    }
  }
  box(g,c,[x,y+.23,front+.017],[w,.19,.12],.057);
  box(g,C.ink,[x,roof-.14,front+.10],[w-.12,.075,.10],.035);
  if(!open){
    const angle=Math.atan2(.14,roof-y-.23);
    windowPane(g,[x,(roof+y+.23)*.5,front+.076],w-.23,roof-y-.33,[angle,Math.PI,0]);
    box(g,0x27383e,[x,y+.285,front+.083],[w-.20,.058,.16],.025);
    for(const s of [-1,1])beam(g,C.ink,[x+s*.24,y+.295,front+.033],[x+s*.43,y+.49,front+.051],.027,.027,.012);
  }
  if(panel)box(g,0x2e2b31,[x,y+.60,back+.055],[w-.22,.87,.07],.043);
}
const I=[-1,1];
function dump(g){
  const y=C.yellow, black=C.ink;
  frame(g,0,.61,0,1.48,3.52);
  cab(g,{z:-.95,y:1.00,w:1.83,d:1.05,roof:2.49,c:y});
  box(g,y,[0,.97,-1.58],[1.81,.61,.51],.10);
  box(g,black,[0,.61,-1.91],[1.97,.28,.28],.08);
  for(let k=-2;k<=2;k++){
    const stripe=box(g,y,[k*.36,.61,-2.060],[.142,.233,.019],.008);
    stripe.rotation.z=-.43;
  }
  grille(g,-1.844,1.018,.70,.40);
  frontLights(g,-1.862,1.03,.67,.25,.25);
  for(const x of [-.44,0,.44])box(g,C.amber,[x,2.541,-1.435],[.19,.09,.18],.034,0,'light');
  // Deep open bed: floor, flared sides and individually visible reinforcing ribs.
  box(g,0xd69000,[0,1.57,.73],[1.75,.15,1.79],.05);
  for(const side of I){
    const wall=box(g,y,[side*.93,1.96,.72],[.095,.90,1.90],.035);
    wall.rotation.z=-side*.14;
    box(g,0xffcb26,[side*1.01,2.41,.72],[.20,.15,2.08],.062);
    for(let k=0;k<4;k++)beam(g,0xe49f0c,[side*.981,1.64,.02+k*.44],[side*1.05,2.33,.08+k*.44],.078,.115,.016);
  }
  for(const z of [-.18,1.68]){
    const wall=box(g,y,[0,1.98,z],[1.9,.91,.13],.041);wall.rotation.x=z<0?-.20:.27;
    box(g,0xffd140,[0,2.424,z],[2.15,.17,.20],.061);
  }
  for(const x of I)for(const z of [-1.12,1.04])archedFender(g,x*1.00,.56,z,.56,.46,0x363439);
  seat(g,0,1.10,-.80,.70);
}
function loader(g){
  const red=C.red,y=C.yellow;
  frame(g,0,.57,.17,1.54,3.36);
  box(g,red,[0,.88,.37],[1.65,.55,2.72],.13);
  box(g,red,[0,1.40,1.18],[1.66,.85,.99],.17);
  for(const s of I){
    sideVents(g,s*.836,1.56,1.10);
    archedFender(g,s*1.02,.59,-.82,.54,.40,red);
    archedFender(g,s*1.02,.59,1.03,.54,.40,red);
    for(const end of [-.32,.58])beam(g,C.ink,[s*.71,1.04,end],[s*.79,2.63,end+.23],.12,.14,.052);
    const a=[s*.65,1.46,-.25],b=[s*.69,.76,-1.64];
    beam(g,red,a,b,.22,.19,.062);
    tube(g,C.metal,[s*.72,1.34,.00],[s*.75,1.03,-.96],.071,'steel');
    tube(g,C.bright,[s*.75,1.03,-.96],[s*.75,.80,-1.53],.046,'steel');
    sidePin(g,s*.77,1.46,-.25,.115);
  }
  box(g,red,[0,2.62,.19],[1.79,.17,1.30],.087);
  beacon(g,0,2.74,.22);
  frontLights(g,-.487,2.60,.48,.26,.16);
  frontLights(g,-.91,1.03,.83,.22,.15);
  // A shallow, open yellow scoop under a fixed pair of hydraulic cylinders.
  const blade=box(g,y,[0,.31,-1.94],[2.16,.13,.85],.050);blade.rotation.x=-.18;
  box(g,0xe7a90a,[0,.62,-1.54],[2.12,.63,.12],.072,.24);
  for(const s of I){
    const wall=box(g,y,[s*1.025,.59,-1.91],[.12,.65,.78],.045,.15);wall.rotation.z=s*.08;
  }
  for(let k=-2;k<=2;k++)box(g,0xffd230,[k*.42,.32,-2.41],[.28,.11,.24],.033,-.17);
  seat(g,0,1.22,.24,.68);
}
function mixer(g){
  const b=C.blue, c=C.cream;
  frame(g,0,.55,0,1.48,3.72,b);
  cab(g,{z:-.99,y:.98,w:1.91,d:1.12,roof:2.48,c,trim:c});
  box(g,c,[0,.96,-1.64],[1.89,.59,.57],.095);
  box(g,b,[0,.62,-1.972],[1.99,.27,.26],.08);
  grille(g,-1.947,1.030,.70,.37);
  frontLights(g,-1.946,1.028,.66,.23,.24);
  for(const x of [-.42,0,.42])box(g,C.amber,[x,2.528,-1.464],[.18,.080,.16],.037,0,'light');
  for(const x of I){
    box(g,b,[x*.84,.84,.61],[.17,.16,2.42],.060);
    archedFender(g,x*.91,.46,-1.24,.44,.39,b);
    for(const z of [.67,1.39])archedFender(g,x*.91,.46,z,.44,.40,c);
  }
  const bucket=new T.Group();
  bucket.position.set(0,1.76,.65);bucket.rotation.x=.998;g.add(bucket);
  // Lathe-like rotating silhouette, baked as five continuous bands on the rigid chassis.
  const drum=[[-1.05,.34],[-.84,.64],[-.52,.80],[-.13,.83],[.26,.78],[.62,.65],[.89,.43],[1.04,.29]];
  for(let j=0;j<drum.length-1;j++){
    const [a,r0]=drum[j],[b,r1]=drum[j+1];
    cylinder(bucket,j%2?c:C.blue,[0,(a+b)/2,0],r1,r0,b-a+.008,0,undefined,24);
  }
  for(const s of I){
    beam(g,C.blue,[s*.62,.94,1.65],[s*.28,2.54,1.62],.17,.16,.049);
    sidePin(g,s*.33,2.47,1.61,.13);
  }
  cylinder(g,C.metal,[0,2.67,1.64],.40,.24,.26,0,'steel');
  cylinder(g,C.ink,[0,2.805,1.64],.345,.345,.018);
  box(g,C.metal,[0,.97,1.92],[.62,.16,.35],.056,.54,'steel');
  seat(g,0,1.10,-.82,.72);
}
function crane(g){
  const p=C.crane,y=C.yellow;
  frame(g,0,.54,.04,1.62,3.86,p);
  box(g,p,[0,.82,.09],[1.97,.43,3.59],.10);
  cab(g,{z:-1.03,y:.91,w:1.78,d:1.06,roof:2.34,c:p,trim:0xb95284,open:true,panel:true});
  box(g,p,[0,.87,-1.60],[1.94,.48,.48],.075);
  box(g,C.bright,[0,.63,-1.94],[2.02,.22,.32],.067,0,'steel');
  grille(g,-1.854,.859,.75,.23,3);
  frontLights(g,-1.862,.923,.70,.28,.23);
  box(g,C.metal,[0,1.05,.55],[1.74,.105,2.10],.025,0,'steel');
  for(let i=0;i<8;i++){
    box(g,C.bright,[0,1.111,-.39+i*.24],[1.63,.031,.075],.013,0,'steel');
  }
  for(const s of I){
    sideVents(g,s*1.0,1.01,.74);
    for(const z of [-1.08,1.10])archedFender(g,s*1.0,.45,z,.43,.39,p);
  }
  cylinder(g,p,[0,1.18,1.24],.57,.59,.20);
  box(g,p,[0,1.58,1.25],[.78,.61,.76],.10);
  for(const s of I)sidePin(g,s*.42,1.90,1.26,.153);
  box(g,y,[0,2.55,.06],[.65,.37,3.51],.091,.025);
  box(g,0xfac93e,[0,2.57,-.77],[.47,.260,2.68],.055,.023);
  for(const z of [-1.48,-.89,-.30,.29,.88]){
    box(g,0xffd160,[0,2.751,z],[.58,.025,.050],.009);
  }
  box(g,C.metal,[0,2.53,-1.95],[.69,.42,.33],.061,0,'steel');
  seat(g,0,1.00,-.87,.68);
}
function excavator(g){
  const q=C.mint;
  frame(g,0,.56,.12,1.50,3.16);
  cylinder(g,0x45474b,[0,.92,.23],.70,.76,.24);
  box(g,q,[0,1.13,.17],[1.91,.36,2.76],.12);
  box(g,q,[0,1.52,.95],[1.83,.76,1.39],.18);
  cab(g,{x:.27,z:-.46,y:1.13,w:1.52,d:1.16,roof:2.64,c:C.cream,trim:q});
  box(g,q,[0,.84,-1.40],[1.63,.35,.43],.08);
  frontLights(g,-1.635,.87,.52,.28,.18);
  frontLights(g,-.99,2.65,.34,.23,.14);
  beacon(g,.60,2.755,-.30);
  for(const s of I){
    sideVents(g,s*.921,1.65,1.01);
    box(g,0x45474b,[s*1.01,.76,-.38],[.25,.12,.52],.043);
  }
  const x=-.67,a=[x,1.36,.23],b=[x,2.79,-.60],d=[x,1.41,-1.73];
  beam(g,q,a,b,.40,.31,.10);
  beam(g,q,b,d,.29,.26,.077);
  tube(g,C.metal,[x-.15,1.60,.22],[x-.15,2.52,-.39],.081,'steel');
  tube(g,C.bright,[x-.15,2.52,-.39],[x-.15,2.68,-.60],.054,'steel');
  tube(g,C.metal,[x-.16,2.67,-.72],[x-.16,1.83,-1.43],.064,'steel');
  tube(g,C.bright,[x-.16,1.83,-1.43],[x-.16,1.52,-1.67],.044,'steel');
  for(const p of [a,b,d])sidePin(g,p[0]-.19,p[1],p[2],.13);
  box(g,0x454044,[x,1.18,-1.80],[.47,.26,.48],.09,-.40);
  for(let k=-1;k<=1;k++)box(g,C.metal,[x+k*.14,1.08,-2.02],[.095,.10,.17],.027,-.37,'steel');
  seat(g,.27,1.22,-.28,.66);
}
function forklift(g){
  const b=C.cobalt;
  frame(g,0,.55,.12,1.45,2.82,b);
  box(g,b,[0,.83,.12],[1.66,.44,2.52],.10);
  box(g,C.lime,[0,1.23,1.145],[1.65,.86,.73],.17);
  for(const s of I){
    for(const z of [-.43,.92])beam(g,C.ink,[s*.60,.94,z],[s*.66,2.47,z+.10],.105,.12,.043);
    archedFender(g,s*.83,.39,-.67,.40,.35,b);
    sideVents(g,s*.831,1.40,1.08);
  }
  box(g,C.ink,[0,2.49,-.29],[1.51,.13,.14],.059);
  box(g,C.ink,[0,2.49,.91],[1.51,.13,.14],.059);
  for(let k=-2;k<=2;k++)box(g,C.ink,[k*.30,2.49,.31],[.075,.11,1.29],.033);
  frontLights(g,-.366,2.49,.40,.23,.14);
  for(const s of I){
    box(g,0x4a4d53,[s*.40,1.50,-1.15],[.18,2.02,.23],.060);
    box(g,C.ink,[s*.29,1.43,-1.142],[.08,1.75,.135],.026);
    box(g,C.yellow,[s*.36,.55,-1.32],[.19,.61,.19],.044);
    box(g,C.yellow,[s*.36,.312,-1.77],[.21,.105,1.05],.040);
  }
  for(const y of [.44,.77,1.04,2.44])box(g,C.metal,[0,y,-1.23],[1.02,.087,.158],.038,0,'steel');
  seat(g,0,1.06,.27,.77);
}

// Use the shared kit's material batching; construction implements stay rigid.
function constructionBody(make) {
  return h => {
    const g=new T.Group();
    make(g);
    g.updateMatrixWorld(true);
    g.traverse(part=>{
      if(!part.isMesh)return;
      const p=new T.Vector3(), q=new T.Quaternion(), scale=new T.Vector3();
      part.matrixWorld.decompose(p,q,scale);
      const e=new T.Euler().setFromQuaternion(q);
      const style=part.material.transparent?'glass':part.material.emissiveIntensity===.45?'glow':part.material.metalness===.53?'metal':'solid';
      const geo=part.geometry.scale(scale.x,scale.y,scale.z);
      h.mesh(part.material.color.getHex(),geo,p.toArray(),[e.x,e.y,e.z],style);
    });
  };
}
function axle(z,x,r,width,rim,steer=false) {
  return I.map(side=>({x:side*x,z,r,width,rim,steer,style:'offroad'}));
}
export const concepts=[
  {
    id:'quarry-dumper',name:'Quarry Dumper',role:'Construction',color:'#ffbd0b',trim:'#343239',
    mount:{x:0,y:1.09,z:-.81,scale:.68},seat:false,bounds:[1.31,-2.08,1.87],
    wheels:[...axle(-1.12,1.03,.56,.49,'#eaa401',true),...axle(1.04,1.03,.56,.49,'#eaa401')],
    build:constructionBody(dump),
  },{
    id:'vermilion-loader',name:'Vermilion Loader',role:'Construction',color:'#d9402c',trim:'#ffbd0b',
    mount:{x:0,y:1.19,z:.25,scale:.70},seat:false,bounds:[1.36,-2.54,1.86],
    wheels:[...axle(-.82,1.05,.55,.55,'#b5aba4',true),...axle(1.03,1.05,.55,.55,'#b5aba4')],
    build:constructionBody(loader),
  },{
    id:'sky-mixer',name:'Sky Mixer',role:'Construction',color:'#36a8dc',trim:'#ffedce',
    mount:{x:0,y:1.08,z:-.84,scale:.68},seat:false,bounds:[1.20,-2.11,2.12],
    wheels:[...axle(-1.24,.91,.44,.39,'#a7a09a',true),...axle(.58,.91,.43,.38,'#a7a09a'),...axle(1.46,.91,.43,.38,'#a7a09a')],
    build:constructionBody(mixer),
  },{
    id:'boom-crane',name:'Boom Crane',role:'Construction',color:'#9f3566',trim:'#ffbd0b',
    mount:{x:0,y:.99,z:-.89,scale:.66},seat:false,bounds:[1.27,-2.14,1.99],
    wheels:[...axle(-1.08,1.00,.43,.42,'#a9a19f',true),...axle(1.10,1.00,.43,.42,'#a9a19f')],
    build:constructionBody(crane),
  },{
    id:'mint-digger',name:'Mint Digger',role:'Construction',color:'#45cf9b',trim:'#ffedce',
    mount:{x:.27,y:1.19,z:-.27,scale:.69},seat:false,bounds:[1.23,-2.13,1.71],
    wheels:[...axle(-.88,.93,.48,.44,'#aaa4a0',true),...axle(1.04,.93,.48,.44,'#aaa4a0')],
    build:constructionBody(excavator),
  },{
    id:'forklift-rat',name:'Forklift Rat',role:'Construction',color:'#1662d9',trim:'#b7d023',
    mount:{x:0,y:1.06,z:.28,scale:.69},seat:false,bounds:[1.11,-2.31,1.54],
    wheels:[...axle(-.67,.83,.40,.42,'#a7a4a0',true),...axle(.94,.83,.40,.37,'#a7a4a0')],
    build:constructionBody(forklift),
  },
];
