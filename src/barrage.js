import * as T from 'three';
import {alloyReflections} from './kart-assembly.js';
import liveryUrl from './assets/barrage-livery.webp';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {barrageAxles,barrageHalfTrack,barrageDriver,barrageMuzzle,barragePerimeter,barrageTireWidth,barrageWing} from './barrage-layout.js';

const vermilion=0xe95823,orange=0xfa702a,amber=0xff9442;
const graphite=0x242b36,carbon=0x151c27,steel=0x535d69,cyan=0x53efff;
let enamel,alloy,rubber,graphics,sidewall,luminous;
function initMaterials(){
  if(enamel)return;
  enamel=new T.MeshPhysicalMaterial({vertexColors:true,metalness:.32,roughness:.35,
    clearcoat:.85,clearcoatRoughness:.18,envMapIntensity:.58});
  alloy=new T.MeshStandardMaterial({vertexColors:true,metalness:.80,roughness:.31,envMapIntensity:.85});
  rubber=new T.MeshStandardMaterial({vertexColors:true,roughness:.84,metalness:.015});
  graphics=new T.MeshPhysicalMaterial({metalness:.24,roughness:.37,clearcoat:.78,clearcoatRoughness:.19,
    envMapIntensity:.52,side:T.DoubleSide});
  sidewall=new T.MeshStandardMaterial({roughness:.81,side:T.DoubleSide});
  luminous=new T.MeshBasicMaterial({vertexColors:true,toneMapped:false});
}
const tiles={hood:[0,0,1024,1280],wing:[1024,0,1024,384],pod:[1024,384,512,768],
  tire:[1536,384,512,512],sill:[0,1280,1024,208],deck:[0,1488,1024,512],fender:[1024,1152,512,848]};
function atlasUV(tile,u,v){
  const [x,y,w,h]=tiles[tile];
  return [(x+2+(w-4)*u)/2048,1-(y+2+(h-4)*v)/2048];
}
const master=new Map();

// Bake the rigid pieces once. Every garage preview and racer reuses the same buffers.
function assembly(){
  const groups=new Map();
  function add(geometry,color,material=enamel){
    const part=geometry.index?geometry.toNonIndexed():geometry;
    if(part!==geometry)geometry.dispose();
    if(!part.hasAttribute('normal'))part.computeVertexNormals();
    if(material.vertexColors){
      part.deleteAttribute('uv');
      const count=part.getAttribute('position').count,colors=new Float32Array(count*3),tint=new T.Color(color);
      for(let i=0;i<count;i++)tint.toArray(colors,i*3);
      part.setAttribute('color',new T.BufferAttribute(colors,3));
    }
    if(!groups.has(material))groups.set(material,[]);
    groups.get(material).push(part);
  }
  function box(color,x,y,z,w,h,d,rx=0,rz=0){
    add(new T.BoxGeometry(w,h,d).rotateX(rx).rotateZ(rz).translate(x,y,z),color);
  }
  // Eight-sided stations give the body panels bevels and allow both sides of a
  // panel to sweep independently around the wheel wells and cockpit.
  function panel(color,stations,material=enamel,graphic=null){
    const vertices=[],indices=[];
    for(const [z,l,r,b,t] of stations){
      const bevel=Math.min((r-l)*.15,(t-b)*.45);
      for(const [x,y] of [[l+bevel,b],[l,b+bevel],[l,t-bevel],[l+bevel,t],
        [r-bevel,t],[r,t-bevel],[r,b+bevel],[r-bevel,b]])vertices.push(x,y,z);
    }
    const last=vertices.length/3-8;
    for(let i=1;i<7;i++)indices.push(0,i,i+1,last,last+i+1,last+i);
    for(let j=0;j<last;j+=8)for(let i=0;i<8;i++){
      if(i===graphic?.face)continue;
      const a=j+i,b=j+(i+1)%8;indices.push(a,a+8,b+8,a,b+8,b);
    }
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);
    // Let reflections roll across the stamped edges while retaining the broad planar faces.
    g.computeVertexNormals();
    const bevelled=g.toNonIndexed(),averaged=bevelled.getAttribute('normal').clone();
    g.dispose();bevelled.computeVertexNormals();
    const normals=bevelled.getAttribute('normal'),n=new T.Vector3(),soft=new T.Vector3();
    for(let i=0;i<normals.count;i++){
      n.fromBufferAttribute(normals,i).lerp(soft.fromBufferAttribute(averaged,i),.28).normalize();
      normals.setXYZ(i,n.x,n.y,n.z);
    }
    add(bevelled,color,material);
    if(graphic){
      // Replace the painted face with a UV-mapped strip that follows every bevel station.
      const positions=[],uv=[],faces=[],firstZ=stations[0][0],lastZ=stations.at(-1)[0];
      stations.forEach(([z],row)=>{
        const t=(z-firstZ)/(lastZ-firstZ);
        for(const edge of [0,1]){
          const start=(8*row+(graphic.face+edge)%8)*3;
          positions.push(...vertices.slice(start,start+3));
          const u=graphic.side?t:edge,v=graphic.side?edge:t;
          uv.push(...atlasUV(graphic.tile,graphic.flipU?1-u:u,graphic.flipV?1-v:v));
        }
        if(row){const a=2*row-2;faces.push(a,a+2,a+3,a,a+3,a+1);}
      });
      const skin=new T.BufferGeometry();
      skin.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      skin.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
      skin.setIndex(faces);skin.computeVertexNormals();
      if(graphic.face===3){
        const roof=skin.getAttribute('normal');
        for(let i=0;i<roof.count;i++){
          n.fromBufferAttribute(roof,i);
          n.x+=(i%2===0?-.092:.092);n.normalize();roof.setXYZ(i,n.x,n.y,n.z);
        }
      }
      add(skin,0xffffff,graphics);
    }
  }
  function disc(color,x,y,z,r,depth,axis,material=enamel){
    const g=new T.CylinderGeometry(r,r,depth,r<.022?8:32);
    if(axis==='x')g.rotateZ(Math.PI/2);else g.rotateX(Math.PI/2);
    add(g.translate(x,y,z),color,material);
  }
  function finish(){
    return [...groups].map(([material,geometries])=>{
      const geometry=mergeGeometries(geometries);
      geometries.forEach(g=>g.dispose());return {geometry,material};
    });
  }
  return {panel,box,disc,add,finish};
}

function bodywork(){
  const p=assembly();
  p.panel(carbon,barragePerimeter.map(([z,w])=>[z,-w,w,.19,.265]));
  p.panel(graphite,[[-2.19,-.65,.65,.255,.34],[-1.77,-.92,.92,.25,.43],
    [-.51,-.78,.78,.24,.48],[.93,-.91,.91,.25,.59],[1.94,-.78,.78,.28,.55]]);
  const hood=[[-2.21,.62,.37],[-1.85,.69,.50],[-1.12,.65,.73],[-.53,.55,.84]];
  p.panel(orange,hood.map(([z,w,t])=>[z,-w,w,.31,t]),enamel,{face:3,tile:'hood',flipU:true,flipV:true});
  p.panel(vermilion,[[.76,-.74,.74,.39,.79],[1.06,-.87,.87,.36,.88],[1.85,-.97,.97,.37,.65],[1.99,-.75,.75,.30,.60]],enamel,{face:3,tile:'deck'});
  for(const side of [-1,1]){
    const flank=(color,rows,material,graphic)=>p.panel(color,rows.map(([z,l,r,b,t])=>
      [z,side===1?l:-r,side===1?r:-l,b,t]),material,graphic);
    // Low forked nose, black headlamp recesses and short bright cyan blades.
    flank(vermilion,[[-2.14,.69,1.08,.27,.34],[-1.88,.63,1.21,.28,.54],[-1.68,.60,1.19,.30,.66],[-1.50,.61,.99,.34,.83]]);
    flank(carbon,[[-2.025,.71,1.075,.384,.462],[-1.91,.69,1.125,.458,.524]]);
    flank(cyan,[[-2.033,.74,1.047,.426,.447],[-2.014,.74,1.052,.444,.464]],luminous);
    // The copper cockpit lip runs from the cowl up to the seat shoulders.
    flank(amber,[[-.58,.51,.55,.78,.81],[-.34,.52,.56,.79,.82],[.49,.53,.57,.86,.89],[.82,.47,.53,.88,.92]]);
    // Folded fender spines rise from the nose to the blaster saddles.
    flank(orange,[[-1.87,.63,.87,.44,.53],[-1.41,.61,.96,.58,.94],[-1.14,.59,1.02,.74,1.01],[-.58,.55,1.05,.53,.91],[-.32,.54,.91,.43,.78]]);
    flank(graphite,[[-.72,.57,.94,.30,.67],[-.42,.60,1.19,.26,.80],[.61,.60,1.24,.26,.87],[.92,.66,1.11,.34,.92]]);
    flank(vermilion,[[-.69,.55,.72,.48,.75],[-.32,.54,.97,.48,.84],[.57,.55,1.10,.5,.91],[.97,.66,1.22,.63,1.05]]);
    flank(orange,[[-.72,.84,1.04,.23,.29],[-.45,.82,1.26,.23,.37],[.51,.82,1.26,.23,.42],[.76,.85,1.18,.29,.49]]);
    flank(vermilion,[[-.48,1.06,1.185,.56,.72],[-.31,1.08,1.215,.62,.78],[.51,1.11,1.25,.72,.88],[.75,1.06,1.22,.70,.92]],enamel,
      {tile:'sill',face:side===1?5:1,side:true,flipU:side===1,flipV:side<0});
    for(let j=0;j<3;j++){
      const z=-.40+j*.21;
      flank(steel,[[z,1.16,1.221,.40,.434],[z+.17,1.17,1.24,.52,.554]]);
    }
    flank(orange,[[.66,.62,1.12,.61,.89],[.98,.63,1.29,.88,1.09],[1.43,.65,1.30,.90,1.10],[1.76,.64,1.22,.60,.87],[1.90,.64,1.04,.46,.66]],enamel,{face:3,tile:'fender',flipU:side<0});
    // The raised pods have an orange armored casing, a dark bezel, and three lenses.
    const m=barrageMuzzle;
    flank(graphite,[[m.z,m.x-.245,m.x+.245,.968,1.218],[-1.14,.64,1.18,.94,1.27],[-.39,.70,1.14,.85,1.18],[-.18,.75,1.08,.83,1.10]]);
    flank(vermilion,[[-1.24,.675,1.145,1.01,1.24],[-1.06,.635,1.185,.98,1.30],[-.53,.66,1.16,.94,1.27],[-.29,.71,1.11,.92,1.17]],enamel,{face:3,tile:'pod',flipU:true,flipV:true});
    flank(carbon,[[-.98,.78,1.04,1.284,1.301],[-.73,.78,1.04,1.275,1.297]]);
    for(const z of [-.94,-.85,-.76]){
      flank(steel,[[z,.83,1.01,1.298,1.304],[z+.025,.83,1.01,1.298,1.304]]);
    }
    for(const dx of [-.15,0,.15]){
      const x=side*(m.x+dx);
      p.disc(0xb19d83,x,m.y,m.z-.005,.074,.03,'z',alloy);
      p.disc(0x126277,x,m.y,m.z-.025,.060,.016,'z');
      p.disc(cyan,x,m.y,m.z-.036,.047,.009,'z',luminous);
      p.disc(0xe3ffff,x,m.y,m.z-.042,.024,.005,'z',luminous);
    }
    // Backlit heat-exchanger slots are visible at each shoulder from the chase camera.
    flank(0x465966,[[-.205,.762,1.068,.898,1.083],[-.174,.771,1.060,.903,1.077]],alloy);
    for(const y of [.93,.978,1.026]){
      flank(0x122937,[[-.175,.794,1.038,y,y+.017],[-.171,.794,1.038,y,y+.017]]);
    }
    // A dark inspection panel and its stepped cyan charge bars sit on the outboard casing.
    flank(0x224454,[[-1.036,1.146,1.189,1.055,1.17],[-.63,1.13,1.168,1.045,1.15]],alloy);
    for(let j=0;j<3;j++){
      const z=-.97+j*.092,x=1.19-j*.005;
      flank(j===2?0xffbf68:0x6af4e0,[[z,x-.012,x,1.087,1.124],[z+.044,x-.013,x-.001,1.085,1.122]],luminous);
    }
    // Two separate wing blades leave the driver visible in chase view.
    p.box(graphite,side*.84,1.01,1.63,.105,.76,.16,.23);
    const w=barrageWing;
    flank(graphite,[[w.front,.22,1.21,1.29,1.33],[w.rear,w.inner,w.outer,1.36,1.40]]);
    flank(orange,[[w.front,.22,1.21,1.32,1.35],[w.rear,w.inner,w.outer,1.39,w.top]],enamel,{face:3,tile:'wing'});
    flank(vermilion,[[1.54,1.19,1.22,1.31,1.36],[2.02,1.28,1.32,1.28,1.45]]);
    flank(carbon,[[1.84,.58,1.06,.42,.62],[1.99,.55,.95,.41,.59]]);
    flank(0xff5238,[[1.984,.63,.93,.535,.563],[2.00,.63,.91,.53,.558]],luminous);
    // Segmented tail lamps remain visible either side of the timing lights.
    flank(0x392333,[[1.994,.56,.98,.478,.598],[2.010,.56,.97,.48,.593]]);
    for(let j=0;j<4;j++){
      const x=.585+j*.093;
      flank(j===3?0xffa447:0xff4e49,[[2.011,x,x+.063,.50,.569],[2.018,x,x+.063,.503,.565]],luminous);
    }
    flank(0x27505d,[[1.955,.53,1.00,.337,.40],[2.006,.55,.96,.327,.38]],alloy);
    for(const x of [.61,.76,.91]){
      p.box(steel,side*x,.34,1.958,.022,.105,.145,-.19);
    }
    p.box(carbon,side*.82,.30,1.90,.055,.22,.24,-.22);
    for(let i=0;i<4;i++){
      const z=1.17+i*.115,deck=.88-(z-1.06)*.23/.79;
      flank(carbon,[[z,.24,.61,deck,deck+.012],[z+.046,.24,.60,deck-.013,deck+.001]]);
    }
  }
  // Recessed instrument binnacle and a cool shift-light strip under the lip of the cowl.
  p.panel(graphite,[[-.54,-.34,.34,.74,.875],[-.39,-.34,.34,.74,.847]]);
  for(let i=0;i<7;i++){
    const x=(i-3)*.06;
    p.box(i<4?0x64e9e0:i<6?0xffbd4e:0xf76746,x,.816,-.386,.042,.018,.011);
  }
  const seat=barrageDriver;
  p.box(graphite,0,seat.y-.096,seat.z,.68,.14,.65);
  p.box(graphite,0,seat.y+.22,.56,.71,.71,.13,.16);
  p.box(carbon,0,seat.y+.60,.64,.45,.22,.15,.15);
  for(const side of [-1,1]){
    p.box(amber,side*.19,seat.y+.22,.485,.08,.65,.032,.16);
    p.box(steel,side*.19,seat.y+.35,.493,.108,.043,.035,.16);
    p.box(0x1c5360,side*.31,seat.y+.23,.555,.032,.56,.055,.16);
    p.box(graphite,side*.33,seat.y-.01,.20,.088,.16,.57);
  }
  // Stitching and an inset backplate on the rear-facing seat shell.
  p.box(0x354653,0,seat.y+.54,.716,.355,.152,.026,.15);
  p.box(0xdb9553,0,seat.y+.557,.732,.128,.018,.010,.15);
  for(const side of [-1,1]){
    p.box(0x287581,side*.28,seat.y+.26,.665,.044,.45,.02,.16);
  }
  return p.finish();
}

function wheel(radius){
  const p=assembly(),w=barrageTireWidth/2;
  // A continuous slick with shallow circumferential grooves and a printed shoulder.
  const profile=[[-1,.76],[-1,.87],[-.86,.97],[-.70,1]];
  for(const offset of [-.43,0,.43]){
    profile.push([offset-.045,1],[offset-.027,.981],[offset+.027,.981],[offset+.045,1]);
  }
  profile.push([.70,1]);
  function turned(rows){
    return new T.LatheGeometry(rows.map(([x,r])=>new T.Vector2(r*radius,x*w)),64).rotateZ(-Math.PI/2);
  }
  p.add(turned(profile),0x30323a,rubber);
  const shoulder=turned([[.70,1],[.86,.97],[1,.87],[1,.76]]);
  const positions=shoulder.getAttribute('position'),uv=shoulder.getAttribute('uv');
  for(let i=0;i<positions.count;i++){
    uv.setXY(i,...atlasUV('tire',.5-positions.getZ(i)/(2*radius),.5-positions.getY(i)/(2*radius)));
  }
  p.add(shoulder,0xffffff,sidewall);
  p.disc(0x252c36,0,0,0,radius*.81,barrageTireWidth*.96,'x',rubber);
  p.disc(0xb9c3ca,w-.007,0,0,radius*.755,.022,'x',alloy);
  p.disc(0xd07943,w-.001,0,0,radius*.715,.019,'x',alloy);
  p.disc(0x263741,w+.007,0,0,radius*.66,.018,'x',alloy);
  p.disc(0x83939a,w+.014,0,0,radius*.51,.014,'x',alloy);
  for(let i=0;i<15;i++){
    const a=i*2*Math.PI/15;
    p.disc(0x263139,w+.023,radius*.425*Math.cos(a),radius*.425*Math.sin(a),.011,.009,'x',alloy);
  }
  // Split bronze spokes reveal the drilled rotor in the gaps.
  for(let i=0;i<5;i++){
    const a=i*2*Math.PI/5;
    for(const side of [-1,1]){
      const spoke=new T.BoxGeometry(.028,radius*.48,.031)
        .rotateX(side*.21).translate(w+.029,radius*.42,side*radius*.07).rotateX(a);
      p.add(spoke,0xcc965b,alloy);
    }
  }
  p.disc(0x33434d,w+.035,0,0,radius*.25,.030,'x',alloy);
  for(let i=0;i<5;i++){
    const a=i*2*Math.PI/5;
    p.disc(0xc0c8c8,w+.056,radius*.18*Math.cos(a),radius*.18*Math.sin(a),.014,.014,'x',alloy);
  }
  p.disc(0xc56637,w+.049,0,0,radius*.12,.022,'x',alloy);
  p.disc(0x4fdacc,w+.061,0,0,radius*.072,.008,'x',luminous);
  return p.finish();
}

let contactMap;
function groundShadow(shadow){
  // Paint a broad underbody penumbra and four tighter patches under the tires.
  // The plane shares the stock animation's scale as the car hops or lands.
  if(!contactMap){
    const c=document.createElement('canvas');c.width=256;c.height=384;
    const ctx=c.getContext('2d');
    ctx.fillStyle='#000';ctx.fillRect(0,0,c.width,c.height);
    ctx.translate(c.width/2,c.height/2);ctx.scale(c.width/3.55,c.height/5.35);
    function patch(x,z,rx,rz,strength){
      ctx.save();ctx.translate(x,z);ctx.scale(rx,rz);
      const gradient=ctx.createRadialGradient(0,0,0,0,0,1);
      gradient.addColorStop(0,'rgba(255,255,255,'+strength+')');
      gradient.addColorStop(.55,'rgba(255,255,255,'+strength*.78+')');
      gradient.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=gradient;ctx.fillRect(-1,-1,2,2);ctx.restore();
    }
    patch(0,0,1.58,2.48,.8);
    for(const [z,r] of barrageAxles)for(const side of [-1,1])patch(side*barrageHalfTrack,z,.43,r*1.35,.98);
    contactMap=new T.CanvasTexture(c);
  }
  shadow.geometry.dispose();
  shadow.geometry=new T.PlaneGeometry(3.55/1.32,5.35/2);
  shadow.material.alphaMap=contactMap;
  shadow.material.opacity=.72;
}

export function attachBarrage(body,wheels,shadow){
  if(!master.size){
    initMaterials();
    const reflections=alloyReflections();
    for(const material of [enamel,alloy,graphics])material.envMap=reflections;
    const map=new T.TextureLoader().load(liveryUrl);
    map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;
    graphics.map=sidewall.map=map;
    master.set('body',bodywork());
    for(const [,radius] of barrageAxles)master.set(radius,wheel(radius));
  }
  function attach(group,key,flip=false){
    for(const {geometry,material} of master.get(key)){
      const mesh=new T.Mesh(geometry,material);
      mesh.userData.sharedKartPart=true;
      if(flip)mesh.rotation.y=Math.PI;
      group.add(mesh);
    }
  }
  groundShadow(shadow);
  attach(body,'body');
  for(const axle of wheels)attach(axle,axle.userData.rideHeight,axle.position.x<0);
}
