import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {alloyReflections} from './kart-assembly.js';

// Bake each material family once per item, then clone shared meshes for the track pool. +Z is forward
// for moving items; visual dimensions/origins stay compatible with the simulation and HUD.
const X=Math.PI/2, TAU=2*Math.PI;
const ink=0x203146, rubber=0x263449, cream=0xfff4c6, mint=0x5af1d9, orange=0xff7251,
  gold=0xffcb54, white=0xfff9e4, alloy=0xa4c1c8, cocoa=0x472e58;
const env=alloyReflections();
const paint=new THREE.MeshPhysicalMaterial({vertexColors:true,roughness:.41,metalness:.08,clearcoat:.54,
  clearcoatRoughness:.22,envMap:env,envMapIntensity:.38});
const polished=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.54,roughness:.33,envMap:env,envMapIntensity:.51});
const highlight=new THREE.MeshBasicMaterial({vertexColors:true});
const shell=new THREE.MeshPhysicalMaterial({vertexColors:true,roughness:.16,metalness:.12,clearcoat:1,
  transparent:true,opacity:.23,depthWrite:false,envMap:env,envMapIntensity:.58});
const mat={paint,metal:polished,glow:highlight,film:shell};
const templates=new Map(), trails=new Map();

// Deliberately retain the previous, asymmetric preview bounds including tail overhangs and raised
// trap skids. These are rendering bounds only; item dimensions used by physics are unchanged.
const envelopes={
  pickup:[[-.73,-.68,-.73],[.73,.68,.73]],
  soda:[[-.565,-.755,-.565],[.565,.755,.565]],
  triple:[[-.8537,-.8062,-.7438],[.8537,.9862,.5738]],
  ball:[[-.8645,-.83,-.87],[.8645,.83,.87]],
  bubble:[[-1,-1,-1],[1,1,1]],
  slip:[[-.8507,-.6184,-.7486],[.8507,.90,.7486]],
  box:[[-.55,-.5,-.56],[.55,.555,.56]],
  cursor:[[-.6062,-.30,-1.375],[.6062,.22,1.045]],
  speaker:[[-.575,-.74,-.335],[.575,.74,.62]],
  spool:[[-.59,-.971,-.71],[.887,.71,.71]],
  strip:[[-.50,-.035,-.50],[.50,.08,.50]],
  disc:[[-1.05,-.165,-1.05],[1.05,.52,1.05]],
  fan:[[-.8337,-.28,-1.0271],[.8337,.28,1.09]],
  lightbolt:[[-.10,-.10,-.325],[.10,.10,.46]],
  bolt:[[-.31,-.31,-1.005],[.31,.31,.84]],
  lob:[[-.8455,-.75,-.8455],[.8455,1.1567,.8455]],
  ring:[[-1.216,-.1952,-1.216],[1.216,.162,1.216]],
  puck:[[-.925,-.33,-.925],[.925,.86,.925]],
  broom:[[-.79,-.655,-.62],[.79,.47,.68]],
  spring:[[-.59,-.655,-.61],[.59,.59,.91]],
  siphon:[[-.62,-.62,-.79],[.62,.62,1.21]],
  rocket:[[-.9436,-.6273,-1.37],[.9436,.6273,1.495]],
  comet:[[-.844,-.76,-1.60],[.844,.76,1]],
};

function builder(){
  const buckets=new Map();
  function add(geometry,color,xyz=[0,0,0],rot=[0,0,0],type='paint',scale=[1,1,1]){
    const g=geometry.index?geometry.toNonIndexed():geometry;
    if(g!==geometry)geometry.dispose();
    const quaternion=rot.isQuaternion?rot:new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot));
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...xyz),quaternion,new THREE.Vector3(...scale)));
    g.deleteAttribute('uv');g.deleteAttribute('uv1');
    const tint=new THREE.Color(color), count=g.attributes.position.count, rgb=new Float32Array(count*3);
    for(let i=0;i<count;i++)tint.toArray(rgb,i*3);
    g.setAttribute('color',new THREE.BufferAttribute(rgb,3));
    if(!buckets.has(type))buckets.set(type,[]);
    buckets.get(type).push(g);
  }
  function box(c,p,w,h,d,bevel=.04,rot=[0,0,0],m='paint'){
    const rounded=bevel>.01&&Math.min(w,h,d)>.028;
    const g=rounded?new RoundedBoxGeometry(w,h,d,1,bevel):new THREE.BoxGeometry(w,h,d);
    add(g,c,p,rot,m);
  }
  function sphere(c,p,scale,rot=[0,0,0],m='paint',s=16){
    add(new THREE.SphereGeometry(1,s,Math.max(8,Math.round(s*.57))),c,p,rot,m,scale);
  }
  function gem(c,p,scale,rot=[0,0,0],m='paint'){
    add(new THREE.OctahedronGeometry(1),c,p,rot,m,scale);
  }
  function tube(c,a,b,r,r2=r,m='paint',n=14){
    const v=new THREE.Vector3(...a),to=new THREE.Vector3(...b),axis=to.sub(v);
    const rot=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),axis.clone().normalize());
    add(new THREE.CylinderGeometry(r2,r,axis.length(),n),c,v.addScaledVector(axis,.5).toArray(),rot,m);
  }
  function profile(c,points,p=[0,0,0],rot=[0,0,0],m='paint',n=24){
    add(new THREE.LatheGeometry(points.map(([r,y])=> new THREE.Vector2(r,y)),n),c,p,rot,m);
  }
  function torus(c,p,r,t,rot=[X,0,0],m='paint',n=24){
    add(new THREE.TorusGeometry(r,t,6,n),c,p,rot,m);
  }
  function line(c,pts,r,m='paint',n){
    const curve=new THREE.CatmullRomCurve3(pts.map(v=>new THREE.Vector3(...v)));
    add(new THREE.TubeGeometry(curve,n??Math.min(24,pts.length*3),r,5,false),c,[0,0,0],[0,0,0],m);
  }
  function badgeXZ(c,points,y,depth,m='paint'){
    const shape=new THREE.Shape(points.map(([x,z])=>new THREE.Vector2(x,-z)));
    const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,steps:1}).rotateX(-X);
    add(g,c,[0,y,0],[0,0,0],m);
  }
  function finish(type){
    const target=envelopes[type];
    const raw=new THREE.Box3();
    for(const list of buckets.values())for(const g of list){g.computeBoundingBox();raw.union(g.boundingBox);}
    const size=raw.getSize(new THREE.Vector3()),old=raw.getCenter(new THREE.Vector3());
    const lo=new THREE.Vector3(...target[0]),hi=new THREE.Vector3(...target[1]),span=hi.clone().sub(lo),center=lo.addScaledVector(span,.5);
    const merged=[];
    for(const [type,parts] of buckets){
      for(const g of parts)g.translate(-old.x,-old.y,-old.z).scale(span.x/size.x,span.y/size.y,span.z/size.z)
        .translate(center.x,center.y,center.z);
      const geo=mergeGeometries(parts);parts.forEach(g=>g.dispose());
      if(!geo)throw Error('Item material batch failed: '+type);
      const p=new THREE.Mesh(geo,mat[type]);p.name=type;merged.push(p);
    }
    const main=merged.find(x=>x.material===paint)??merged[0];
    for(const m of merged)if(m!==main){if(m.material===shell)m.renderOrder=2;main.add(m);}
    main.name=type;return main;
  }
  return {add,box,sphere,tube,profile,torus,line,gem,badgeXZ,finish};
}

function can(b,x,y,z,scale,color){
  const {profile,box,torus,tube}=b,S=scale,detail=S<.9?16:24;
  const bands=(rows,c,m)=>profile(c,rows.map(([rY,yY])=>[rY*S,yY*S]),[x,y,z],[0,0,0],m,detail);
  bands([[0,-.67],[.40,-.67],[.49,-.60],[.505,-.45],[.505,.49],[.48,.59],[.403,.676],[0,.676]],color);
  bands([[.40,-.664],[.491,-.664],[.521,-.630],[.520,-.585],[.492,-.566]],alloy,'metal');
  bands([[.40,.671],[.493,.671],[.53,.70],[.522,.741],[.488,.754],[.391,.752],[.37,.721],[.001,.72]],alloy,'metal');
  bands([[.506,-.438],[.514,-.438],[.514,-.300],[.506,-.285]],ink);
  bands([[.509,-.303],[.516,-.300],[.515,-.277],[.508,-.267]],gold);
  for(let i=0;i<8;i++){
    const a=i*TAU/8;
    sector(b,i%2?0xdde473:0xcaf28c,[[.511*S,.439*S],[.514*S,.468*S],[.509*S,.508*S]],
      a+.019,.323,'paint',[x,y,z],[0,0,0],5);
  }
  torus(ink,[x,y+.729*S,z+.034*S],.124*S,.024*S,[X,0,0],'paint',16);
  torus(alloy,[x,y+.751*S,z+.030*S],.105*S,.021*S,[X,0,0],'metal',16);
  tube(ink,[x,y+.721*S,z-.220*S],[x,y+.735*S,z-.220*S],.093*S,.082*S,'paint',16);
  for(let i=0;i<4;i++){
    const a=i*X;
    const p=(dx,Y,depth)=>[x+(Math.sin(a)*depth+Math.cos(a)*dx)*S,y+Y*S,z+(Math.cos(a)*depth-Math.sin(a)*dx)*S];
    box(white,p(.013,.24,.501),.182*S,.431*S,.048*S,.010,[0,a,-.56]);
    box(cream,p(-.009,.06,.512),.125*S,.272*S,.025*S,.004,[0,a,.44]);
    box(0x637b43,p(0,-.19,.509),.294*S,.047*S,.026*S,.005,[0,a,0]);
  }
}
// Surface of revolution over a limited angle: shell panels, vents, lamps and
// decaled stripes fit the actual plastic contour rather than floating in boxes.
function sector(b,c,rows,start,angle,m='paint',pos=[0,0,0],rot=[0,0,0],segments=10){
  const g=new THREE.LatheGeometry(rows.map(([r,y])=>new THREE.Vector2(r,y)),segments,start,angle);
  b.add(g,c,pos,rot,m);
}

function radialXZ(cells,angle){
  const cs=Math.cos(angle),sn=Math.sin(angle);
  return cells.map(([x,z])=>[cs*x+sn*z,cs*z-sn*x]);
}

function frontDecal(b,c,points,z,depth=.013,where=[0,0,0],m='paint'){
  const g=new THREE.ExtrudeGeometry(new THREE.Shape(points.map(v=>new THREE.Vector2(...v))),{
    depth,bevelEnabled:false,steps:1});
  const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),where[2]);
  const pos=new THREE.Vector3(0,where[1],z).applyQuaternion(q);pos.x+=where[0];
  b.add(g,c,pos.toArray(),q,m);
}

// The confetti darts read as wrapped candy even in silhouette: tapered sugar
// gem, contrasting spool collar and twisted paper fins, no realistic cartridge.
function candyDart(b,p,heading,scale,col){
  const dark=col===0x46dddb?0x297d92:col===0xffc75c?0xc75a30:0x9b2c70;
  const head=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),heading);
  const put=(g,c,xyz,rot,m)=>{
    const cp=new THREE.Vector3(...xyz).multiplyScalar(scale).applyQuaternion(head).add(new THREE.Vector3(...p));
    const q=head.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)));
    b.add(g,c,cp.toArray(),q,m,[scale,scale,scale]);
  };
  const cap=(c,rows,m='paint',n=16)=>put(new THREE.LatheGeometry(rows.map(v=>new THREE.Vector2(...v)),n),c,[0,0,0],[X,0,0],m);
  cap(col,[[0,-.66],[.12,-.66],[.176,-.57],[.181,-.33],[.201,.03],[.174,.34],[.094,.56],[0,.60]]);
  cap(cream,[[.143,-.570],[.178,-.553],[.183,-.470],[.165,-.451]]);
  cap(dark,[[0,-1.00],[.087,-1.00],[.129,-.948],[.133,-.605],[.149,-.586],[0,-.586]]);
  cap(mint,[[.088,-.986],[.125,-.954],[.126,-.899],[.115,-.873]],'glow');
  cap(white,[[.158,.406],[.155,.431],[.113,.549],[.074,.644],[0,.736]],'paint');
  put(new THREE.OctahedronGeometry(1).scale(.073,.073,.128),cream,[0,0,.65],[0,0,0],'glow');
  for(let i=0;i<3;i++){
    const ang=i*TAU/3;
    const pts=Array.from({length:13},(_,j)=>{
      const u=j/12,a=ang+u*3.65,z=-.414+u*.760;
      const r=z<.03?.185+u*.029:.205-(z-.03)*.095;
      return new THREE.Vector3(Math.cos(a)*r,Math.sin(a)*r,z);
    });
    put(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),14,.014,5,false),
      i===0?0xfff3dc:0xffc5e3,[0,0,0],[0,0,0],'paint');
    const g=new THREE.ExtrudeGeometry(new THREE.Shape([[.097,-.879],[.298,-.961],[.264,-.704],[.167,-.427],[.099,-.55]]
      .map(v=>new THREE.Vector2(...v))),{depth:.039,steps:1,bevelEnabled:false}).rotateX(X).translate(0,.0195,0);
    put(g,i===1?cream:dark,[0,0,0],[0,0,ang],'paint');
  }
}

function relayRocket(b){
  const red=0xd82a46, cherry=0xff6a56, creamFoil=0xffe9ae, dark=0x422844;
  const rows=(c,part,m='paint',n=24)=>b.profile(c,part,[0,0,0],[X,0,0],m,n);
  rows(red,[[0,-.922],[.276,-.918],[.38,-.824],[.461,-.626],[.469,.197],[.441,.481],
    [.362,.736],[.246,.946],[.119,1.095],[.044,1.163],[0,1.174]]);
  rows(cherry,[[.414,.566],[.382,.699],[.326,.816],[.246,.956],[.119,1.101],[.042,1.172],[0,1.182]]);
  rows(creamFoil,[[.459,-.591],[.471,-.565],[.475,-.455],[.464,-.427]]);
  rows(creamFoil,[[.453,.350],[.459,.362],[.438,.502],[.424,.55]]);
  rows(dark,[[0,-1.332],[.21,-1.33],[.32,-1.248],[.35,-1.081],[.302,-.928],[.240,-.880],[0,-.88]]);
  b.torus(alloy,[0,0,-1.19],.325,.026,[0,0,0],'metal');
  b.tube(0x632c3f,[0,0,-1.293],[0,0,-1.235],.159,.143,'metal',16);
  for(let i=0;i<3;i++){
    const a=TAU*i/3+X, x=.188*Math.cos(a), y=.188*Math.sin(a);
    b.tube(0x94334d,[x,y,-1.335],[x,y,-1.238],.104,.085,'metal',10);
    b.torus(0xff962e,[x,y,-1.342],.081,.016,[0,0,0],'glow',12);
    b.sphere(0xffe3a4,[x,y,-1.353],[.064,.065,.017],[0,0,0],'glow',10);
  }
  for(let i=0;i<4;i++){
    const a=i*X;
    const f=[[.30,-.893],[.697,-.954],[.793,-.778],[.698,-.664],[.47,-.430],[.361,-.365]];
    const g=new THREE.ExtrudeGeometry(new THREE.Shape(f.map(v=>new THREE.Vector2(...v))),
      {depth:.100,steps:1,bevelEnabled:true,bevelSegments:1,bevelSize:.016,bevelThickness:.01}).rotateX(X).translate(0,.05,0);
    b.add(g,i%2?red:0x992d4c,[0,0,0],[0,0,a]);
    const fn=(r,z)=>[r*Math.cos(a),r*Math.sin(a),z];
    b.line(creamFoil,[fn(.740,-.806),fn(.659,-.740),fn(.556,-.636),fn(.465,-.578)],.028,'paint',9);
    sector(b,0xffc17b,[[.465,-.362],[.472,-.303],[.471,.238],[.456,.298]],a-.103,.206,
      'paint',[0,0,0],[X,0,0],4);
    b.box(0x6f2747,fn(.463,-.23),.05,.153,.245,.026,[0,0,a],'paint');
  }
  b.torus(creamFoil,[0,0,.943],.237,.017,[0,0,0],'metal',16);
  b.sphere(0xfff0c9,[0,0,1.193],[.060,.060,.044],[0,0,0],'glow',12);
}

function ripplePuddle(b,c,y,m='paint',radius=.74){
  const n=40, rows=[[.02,.14],[.23,.13],[.50,.095],[.68,.05],[1,0],[.91,-.035],[.02,-.044]];
  const pos=[],idx=[];
  for(let j=0;j<rows.length;j++)for(let i=0;i<n;i++){
    const a=i*TAU/n, [r,h]=rows[j], s=(1+.098*Math.sin(a*5+.52)+.05*Math.cos(a*9))*r*radius;
    pos.push(Math.cos(a)*s,y+h+.015*Math.sin(a*3)*r,Math.sin(a)*s*.93);
    if(j<rows.length-1) {
      const k=j*n+i,l=j*n+(i+1)%n;
      idx.push(k,l,k+n,l,l+n,k+n);
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);
  g.computeVertexNormals();b.add(g,c,[0,0,0],[0,0,0],m);
}

function build(type){
  if(!envelopes[type])throw Error('Unknown item model '+type);
  const b=builder();
  const {box,tube,sphere,line,profile,torus,gem,badgeXZ}=b;
  switch(type){
    case 'pickup':{
      box(0xc1ea60,[0,0,0],1.24,1.25,1.24,.148);
      for(const y of [-.58,.58]){
        box(ink,[0,y,0],1.39,.15,1.39,.068);
        box(0xa9df5c,[0,y+Math.sign(y)*.064,0],1.139,.052,1.139,.071);
      }
      for(let i=0;i<4;i++){
        const a=i*X, at=(u,v,d)=>[Math.sin(a)*d+Math.cos(a)*u,v,Math.cos(a)*d-Math.sin(a)*u];
        box(0xd3f889,at(0,0,.628),.845,.818,.063,.054,[0,a,0]);
        const path=[[-.155,.14],[-.121,.240],[.021,.262],[.152,.203],[.158,.126],[.110,.044],[.018,-.029],[.001,-.133]];
        line(ink,path.map(([u,v])=>at(u,v,.676)),.038);
        sphere(ink,at(0,-.235,.676),[.050,.050,.019],[0,a,0]);
        for(const u of [-.462,.462])box(0x79a64c,at(u,0,.636),.054,.534,.022,.010,[0,a,0]);
      }break;
    }
    case 'soda':can(b,0,0,0,1,0x9fdf46);break;
    case 'triple':{
      const trio=[[-.41,-.238,.180],[.41,-.238,.180],[0,.45,-.28]];
      for(const [x,y,z] of trio)can(b,x,y,z,.76,gold);
      box(ink,[0,-.51,.085],1.32,.147,.766,.057);
      box(cream,[0,-.46,.483],.502,.148,.073,.018);
      for(const v of [-.215,0,.215])box(0xb8ff72,[v,-.461,.529],.082,.056,.013,.004,[0,0,0],'glow');
      for(const k of [-1,1])box(0xd1973f,[k*.604,-.414,.419],.115,.083,.161,.014);
      break;
    }
    case 'ball':{
      // Seven-segment bumper wheel: radial bright guard panels sit over
      // a tough dark tire belt with matching silver seam hardware.
      sphere(0x6a352e,[0,0,0],[.784,.784,.784],[0,0,0],'paint',20);
      const petal=[[.557,-.561],[.658,-.456],[.763,-.270],[.800,-.12],[.811,0],
        [.801,.128],[.749,.288],[.659,.457],[.557,.561]];
      for(let i=0;i<7;i++){
        const a=i*TAU/7;
        sector(b,i%2?0xf27932:0xffa847,petal,a+.041,TAU/7-.082,'paint',[0,0,0],[0,0,0],10);
        sector(b,0xffbf55,[[.769,-.270],[.807,-.12],[.818,0],[.808,.128],[.755,.288]],
          a+.044,.094,'paint',[0,0,0],[0,0,0],3);
        const p=(r,y)=>[Math.sin(a)*r,y,Math.cos(a)*r];
        tube(0x713d35,p(.771,.014),p(.835,.014),.103,.086,'metal',8);
        sphere(0xffdb91,p(.837,.014),[.043,.046,.014],[0,a,0],'glow',9);
      }
      for(const side of [-1,1]){
        const h=side*.581;
        torus(0x422e39,[0,h,0],.523,.044,[X,0,0],'paint');
        sphere(0xe55a37,[0,side*.677,0],[.507,.152,.505],[0,0,0],'paint',18);
        tube(0xfab04a,[0,side*.766,0],[0,side*.840,0],.240,.203,'metal',12);
        gem(0xffe2a5,[0,side*.836,0],[.10,.021,.10],[0,.38,0],'glow');
      }
      break;
    }
    case 'bubble':{
      sphere(0x7beaff,[0,0,0],[1,1,1],[0,0,0],'film',24);
      // Break the equatorial halo into unobtrusive light segments and a
      // continuous structural rim; shield still leaves the driver readable.
      for(const [rx,ry,rz,c] of [[X,0,0,0x89fff0],[.34,.85,.61,0x51cce8]])torus(c,[0,0,0],.935,.026,[rx,ry,rz],'metal',32);
      for(let i=0;i<6;i++)sector(b,0xbffff5,[[.935,-.035],[.962,-.014],[.966,.016],[.949,.031]],
        i*TAU/6+.065,.52,'glow',[0,0,0],[0,0,0],7);
      for(const [x,y,z] of [[.67,.35,.621],[-.69,.26,.64],[.4,.60,-.664]])gem(white,[x,y,z],[.095,.141,.089],[.36,.72,.51],'glow');
      for(const [x,y,z] of [[-.47,.62,.60],[-.28,.78,.53]]){
        sphere(white,[x,y,z],[.13,.052,.04],[0,.38,.58],'film');
      }
      break;
    }
    case 'slip':{
      ripplePuddle(b,0x553776,-.434,'paint',.82);
      ripplePuddle(b,0xa164dd,-.331,'paint',.78);
      ripplePuddle(b,0xf2a9f4,-.314,'film',.91);
      sphere(0x9853d7,[-.03,-.14,-.01],[.639,.360,.590],[0,0,-.16],'paint',20);
      sphere(0xba77ee,[.138,.17,.077],[.435,.520,.473],[0,0,.38],'paint',20);
      sphere(0x9c58db,[-.315,-.093,.09],[.424,.310,.408],[0,0,-.24],'paint',14);
      for(const [s,x,y,z] of [[.135,.563,.17,.045],[.121,-.643,.03,-.16],[.093,.664,-.10,-.22]]){
        sphere(0xda8cf0,[x,y,z],[s,s*1.36,s],[0,0,.4],'paint',10);
      }
      for(const dir of [-1,1]){
        const pp=(x,y,z)=>[x+dir*.018,y,z*dir];
        for(const x of [-.115,.205]){
          sphere(0xffc6f3,pp(x,.217,.504),[.097,.128,.031],[0,dir*.20,0],'paint',12);
          sphere(cocoa,pp(x+.02,.227,.534),[.061,.083,.016],[0,dir*.20,0],'paint',10);
        }
        line(0x7539ac,[pp(-.08,-.018,.518),pp(.033,-.078,.565),pp(.174,-.021,.576)],.021,'paint',9);
        line(0xf7b8ef,[pp(-.042,.489,.338),pp(.095,.553,.324),pp(.241,.519,.306)],.027,'paint',9);
      }
      break;
    }
    case 'box':{
      box(0xe4633b,[0,-.059,0],1.02,.770,1.009,.091);
      box(0x622a46,[0,-.418,0],1.087,.141,1.082,.037);
      box(0x54294a,[0,.197,0],1.031,.171,1.029,.046);
      box(0xcd483e,[0,.403,-.023],1.055,.177,1.067,.066,[.088,0,0]);
      box(0xffc269,[0,.501,-.033],.969,.057,.927,.023,[.088,0,0]);
      box(0x5d3048,[0,.343,-.263],.491,.092,.308,.027,[.088,0,0]);
      for(let side=0;side<4;side++){
        const a=side*X, pt=(x,y,z)=>[Math.sin(a)*z+Math.cos(a)*x,y,Math.cos(a)*z-Math.sin(a)*x];
        const decal=(c,pts,z,h=0)=>frontDecal(b,c,pts,z,.012,[0,h,a]);
        box(0xff9855,pt(0,-.102,.5),.770,.502,.069,.034,[0,a,0]);
        if(side%2===0){
          const face=[[-.30,.073],[-.146,.16],[.132,.161],[.306,.077],[.256,-.11],[-.251,-.117]];
          decal(0x642d4d,face,.553,-.035);
          for(const x of [-.154,.151]){
            sphere(0xffedc6,pt(x,-.026,.580),[.091,.078,.026],[0,a,0],'paint',11);
            sphere(0x512548,pt(x+.021,-.036,.601),[.044,.051,.016],[0,a,0],'paint',8);
          }
          for(const x of [-.195,.19])decal(cream,[[x-.027,0],[x+.027,0],[x,-.077]],.601,-.082);
        }else{
          for(let i=-1;i<=1;i++)box(cream,pt(i*.188,-.070,.560),.118,.065,.020,.006,[0,a,-.61]);
        }
        for(const x of [-.405,.405])sphere(alloy,pt(x,-.306,.553),[.041,.037,.024],[0,a,0],'metal',8);
      }
      break;
    }
    case 'cursor':{
      const carrier=[[-.594,-.222],[0,1.04],[.594,-.222],[.241,-.354],[.230,-.907],[.118,-1.132],
        [-.118,-1.132],[-.230,-.907],[-.241,-.354]];
      badgeXZ(0x4d2a59,carrier,-.175,.278);
      badgeXZ(0xd14294,carrier.map(([x,z])=>[x*.922,z*.910-.011]),.107,.062);
      badgeXZ(0xff8fca,[[0,.943],[.465,-.156],[.219,-.221],[.153,-.891],[.093,-1.009],
        [-.093,-1.009],[-.153,-.891],[-.219,-.221],[-.465,-.156]],.173,.025);
      badgeXZ(cocoa,[[0,.799],[.306,-.10],[.154,-.076],[.082,-.497],[-.082,-.497],[-.154,-.076],[-.306,-.10]],.201,.013);
      badgeXZ(0xffddf0,[[0,.675],[.193,.049],[0,.259],[-.193,.049]],.218,.023,'glow');
      badgeXZ(0xfc76c2,[[0,.202],[.089,-.024],[.069,-.615],[-.069,-.615],[-.089,-.024]],.214,.016,'paint');
      for(const k of [-1,1]){
        const x=k*.165;
        tube(0x734974,[x,-.026,-.830],[x,-.026,-1.235],.121,.115,'metal',10);
        torus(0xffa2dc,[x,-.026,-1.219],.093,.019,[0,0,0],'glow',12);
        tube(0xffb3df,[x,-.026,-1.19],[x,-.026,-1.227],.060,.049,'glow',8);
        line(0xffc6ee,[[k*.148,.006,.639],[k*.392,.006,.047],[k*.462,.006,-.104],[k*.334,.006,-.246]],.021,'glow',12);
      }
      break;
    }
    case 'speaker':{
      box(0x30274a,[0,0,0],1.101,1.43,.66,.101);
      box(0x67418a,[0,0,.299],1.018,1.371,.183,.068);
      for(const [y,r] of [[-.264,.438],[.384,.222]]){
        profile(ink,[[0,.363],[r*.45,.363],[r*.76,.408],[r,.49],[r*.983,.532],[r*.927,.535],
          [r*.754,.487],[r*.43,.413],[0,.414]],[0,y,0],[X,0,0]);
        torus(0x9d65ee,[0,y,.531],r*.976,.023,[0,0,0],'metal');
        sphere(0xe6b7fd,[0,y,.419],[r*.351,r*.351,r*.183],[0,0,0],'paint',14);
        for(const k of [-1,1])box(alloy,[k*.911*r,y,.550],.046,.046,.019,.004);
      }
      for(const y of [-.621,.641])box(alloy,[0,y,.355],.676,.039,.031,.006,[0,0,0],'metal');
      line(ink,[[-.246,.676,-.03],[-.203,.744,-.03],[.200,.744,-.03],[.241,.676,-.03]],.036);
      for(const k of [-1,1]){
        box(0x281d49,[k*.473,.515,.401],.078,.073,.019,.004);
        for(let i=0;i<3;i++)box(0xb982ff,[k*.472,.515-i*.155,.400],.047,.058,.021,.006,[0,0,0],'glow');
        box(0x9167c4,[k*.551,-.019,.045],.024,.817,.324,.009,[0,0,0],'metal');
      }
      break;
    }
    case 'spool':{
      tube(0x317d84,[-.49,0,0],[.49,0,0],.390,.390,'metal',20);
      const rounds=5.5, pts=Array.from({length:77},(_,i)=>{const t=i/76,a=t*TAU*rounds;return [(-.368+t*.737),Math.cos(a)*.411,Math.sin(a)*.411];});
      line(0x58ebcb,pts,.062,'paint',100);
      for(const x of [-.49,.49]){
        profile(ink,[[0,-.086],[.59,-.086],[.677,-.056],[.711,-.016],[.706,.059],[.650,.088],[0,.088]],[x,0,0],[0,0,X]);
        torus(0x64b9ad,[x+.087*Math.sign(x),0,0],.663,.033,[0,X,0],'metal');
        tube(alloy,[x,0,0],[x+.107*Math.sign(x),0,0],.191,.151,'metal');
      }
      for(const side of [-1,1]){
        for(let i=0;i<8;i++){
          const a=i*TAU/8;
          box(i%2?0x408b91:0xa5d5c2,[side*.584,Math.sin(a)*.492,Math.cos(a)*.492],
            .014,.093,.182,.004,[a,0,0],'metal');
        }
        sphere(0xaaffea,[side*.603,0,0],[.018,.103,.103],[0,0,0],'glow',11);
      }
      line(cream,[[.15,-.365,.438],[.46,-.473,.49],[.666,-.431,.58],[.772,-.571,.58],
        [.721,-.784,.59],[.529,-.915,.59],[.364,-.882,.59],[.314,-.725,.59],[.395,-.647,.59]],.065,'metal');
      break;
    }
    case 'strip':{
      box(0x263741,[0,.004,0],.99,.074,.994,.04);
      box(0x3d6a68,[0,.045,0],.918,.045,.930,.032);
      for(const k of [-1,1]){
        box(0x142e39,[0,.043,k*.467],.924,.062,.063,.012);
        for(const x of [-.329,-.111,.111,.329])box(0x83fce3,[x,.061,k*.484],.092,.019,.023,.004,[0,0,0],'glow');
      }
      for(const s of [-1,1]){
        box(0x4aefbc,[s*.425,.059,0],.056,.021,.812,.005,[0,0,0],'glow');
        for(const z of [-.366,-.173,.173,.366])box(ink,[s*.425,.065,z],.064,.026,.039,.006);
      }
      for(const z of [-.261,.009,.276]){
        badgeXZ(mint,[[-.315,z-.142],[0,z+.081],[.315,z-.142],[.257,z-.187],[0,z-.018],[-.257,z-.187]],.070,.012,'glow');
      }
      break;
    }
    case 'disc':{
      profile(0x163b59,[[0,-.155],[.736,-.155],[.909,-.137],[1.025,-.059],[1.044,.003],
        [.981,.111],[.854,.159],[.686,.168],[0,.168]]);
      profile(0x26aed1,[[.759,.152],[.893,.116],[1.023,.031],[1.073,.076],[.994,.171],
        [.863,.227],[.771,.250],[.685,.239]],[0,0,0],[0,0,0],'metal');
      torus(0x9feff8,[0,.144,0],.897,.015,[X,0,0],'glow',32);
      profile(0x297da1,[[0,.239],[.589,.239],[.618,.268],[.567,.326],[.412,.350],[0,.350]]);
      for(let i=0;i<6;i++){
        const a=i*TAU/6;
        sector(b,i===0?gold:0xb9effa,[[.591,.262],[.700,.247],[.777,.235],[.867,.219],[.899,.186]],
          a+.054,.4,'paint',[0,0,0],[0,0,0],6);
        sector(b,0x233e63,[[.85,.236],[.916,.219],[.969,.191],[.999,.158]],a+.36,.42,'paint',[0,0,0],[0,0,0],8);
        sphere(0x67e9ff,[Math.sin(a+.78)*.847,.249,Math.cos(a+.78)*.847],
          [.068,.022,.044],[0,a,0],'glow',9);
      }
      torus(0x66bbdf,[0,.355,0],.362,.048,[X,0,0],'metal');
      gem(0xc5ffff,[0,.403,0],[.284,.133,.284],[0,.44,0],'glow');
      break;
    }
    case 'fan':{
      for(const [heading,col] of [[-.315,0x46dddb],[0,0xf887c9],[.315,0xffc75c]])
        candyDart(b,[heading*1.49,0,.07-Math.abs(heading)*.53],heading,.91,col);
      break;
    }
    case 'lightbolt':{
      // Arc crystal in a three-pronged ceramic yoke; high-contrast cyan/white
      // read develops before the brighter trail at the existing projectile size.
      profile(0x276281,[[0,-.31],[.058,-.31],[.081,-.275],[.076,-.197],[.066,-.106],[0,-.106]],
        [0,0,0],[X,0,0],'metal',12);
      const core=[[0,-.16],[.048,-.136],[.077,-.056],[.084,.176],[.056,.320],[.019,.364],[0,.401]];
      profile(0xa0fbff,core,[0,0,0],[X,0,0],'glow',8);
      profile(0x47d8fd,core.map(([r,z])=>[r*1.31,z*1.05]),[0,0,0],[X,0,0],'film',8);
      for(let i=0;i<3;i++){
        const a=i*TAU/3,xyz=(r,z)=>[Math.sin(a)*r,Math.cos(a)*r,z];
        line(0x2e8fa2,[xyz(.062,-.255),xyz(.091,-.185),xyz(.094,-.103),xyz(.075,-.054)],.017,'paint',7);
      }
      torus(0x83fbef,[0,0,-.258],.064,.013,[0,0,0],'glow',10);
      gem(white,[0,0,.218],[.050,.053,.132],[0,0,.42],'glow');
      break;
    }
    case 'bolt':{
      candyDart(b,[0,0,0],0,1,0xf56caf);
      break;
    }
    case 'lob':{
      // Rounded, split jelly seed with a plated green skin and fruit-bright
      // ribbed facets. Broad top fin and cap identify the high-arc grenade.
      sphere(0x376c43,[0,-.086,0],[.787,.700,.786],[0,0,0],'paint',20);
      const rind=[[.428,-.666],[.597,-.542],[.744,-.361],[.800,-.136],[.812,.0],[.785,.158],
        [.690,.372],[.550,.493],[.348,.582]];
      for(let i=0;i<7;i++){
        const a=i*TAU/7;
        sector(b,i%2?0x74bd41:0xa5d854,rind,a+.013,TAU/7-.026,'paint',[0,0,0],[0,0,0],9);
        sector(b,0xc4e875,rind.slice(2,7).map(([r,y])=>[r+.007,y]),a+.058,.070,'paint',[0,0,0],[0,0,0],3);
        const pp=(r,y)=>[Math.sin(a)*r,y,Math.cos(a)*r];
        sphere(0x2f7a4d,pp(.790,-.044),[.100,.115,.059],[0,a,0],'paint',10);
        gem(0xeaff9e,pp(.831,-.040),[.052,.065,.022],[0,a,0],'glow');
      }
      torus(0x31724b,[0,.506,0],.475,.035,[X,0,0],'paint');
      profile(0x418c50,[[0,.50],[.219,.50],[.248,.566],[.25,.784],[.166,.904],[0,.906]]);
      torus(0xcdfa71,[0,.784,0],.216,.033,[X,0,0],'metal');
      gem(0xf5ffb5,[.055,.939,.016],[.161,.193,.148],[.55,.28,.22],'glow');
      line(0x568e50,[[.092,.813,.15],[.26,.914,.10],[.359,1.092,.063],[.281,1.124,.040]],.051,'paint',10);
      break;
    }
    case 'ring':{
      profile(0x824237,[[.737,-.044],[.801,-.128],[.92,-.169],[1.048,-.129],[1.121,-.045],
        [1.127,.053],[1.066,.117],[.968,.133],[.845,.107],[.765,.028],[.737,-.044]]);
      torus(0xf8aa35,[0,.062,0],.964,.094,[X,0,0],'metal',36);
      torus(0xffffbc,[0,.123,0],.843,.019,[X,0,0],'glow',32);
      for(let i=0;i<6;i++){
        const a=i*TAU/6, so=(r,y)=>[Math.sin(a)*r,y,Math.cos(a)*r];
        const plate=[[.801,-.152],[.958,-.207],[1.152,-.174],[1.207,-.088],
          [1.158,.136],[1.039,.201],[.878,.146],[.825,.083]];
        badgeXZ(i%2?0xfb9541:0xfbc053,radialXZ(plate,a),.049,.092);
        badgeXZ(0xffed99,radialXZ([[.990,-.145],[1.119,-.065],[1.065,.123],[.998,.109],[1.05,-.060]],a),.142,.017);
        sphere(0xb07647,so(.929,.149),[.043,.019,.052],[0,a,0],'metal',8);
        sector(b,0xf9d378,[[.846,.133],[.908,.148],[.962,.149],[1.007,.141]],a-.16,.32,'paint',[0,0,0],[0,0,0],5);
      }
      break;
    }
    case 'puck':{
      profile(0x25254e,[[0,-.302],[.619,-.302],[.795,-.279],[.899,-.203],[.923,-.122],
        [.913,-.046],[.809,.046],[.682,.095],[0,.095]]);
      profile(0x7e55c0,[[.567,.076],[.677,.092],[.738,.160],[.699,.226],[.542,.279],[.414,.294],[0,.294]]);
      torus(0xd199f6,[0,.113,0],.727,.037,[X,0,0],'metal');
      torus(0xe7ceff,[0,.283,0],.466,.028,[X,0,0],'glow');
      for(let i=0;i<5;i++){
        const a=i*TAU/5, point=(r,y)=>[Math.sin(a)*r,y,Math.cos(a)*r],
          plate=[[.468,-.112],[.619,-.176],[.790,-.107],[.882,-.071],[.859,.123],[.744,.160],[.562,.111]];
        badgeXZ(0xb287ea,radialXZ(plate,a),.132,.062);
        box(0x5c3985,point(.612,.233),.129,.166,.236,.035,[0,a,0]);
        box(0xf5cfff,point(.710,.237),.069,.081,.078,.015,[0,a,0],'glow');
        sphere(0x9666d2,point(.883,-.064),[.096,.046,.041],[0,a,0],'paint',10);
      }
      const crown=[[-.203,-.126],[0,-.314],[.203,-.126],[.196,.128],[0,.219],[-.196,.128]];
      badgeXZ(0x42315e,crown,.276,.119,'metal');
      gem(0xd99fff,[0,.517,0],[.299,.350,.294],[.08,.385,.06],'film');
      gem(0xffe4ff,[0,.516,0],[.167,.286,.145],[.08,.385,.06],'glow');
      break;
    }
    case 'broom':{
      sphere(0x58ceb3,[0,.08,0],[.725,.409,.566],[0,0,0],'paint',22);
      profile(0x247977,[[.665,-.227],[.714,-.138],[.741,-.04],[.717,.019]],[0,0,0],[0,0,0],'metal');
      box(0x213345,[0,.134,.484],.874,.236,.236,.088);
      for(const x of [-.236,.233])box(0xedfff2,[x,.140,.606],.178,.086,.037,.016,[0,0,0],'glow');
      for(const x of [-.533,0,.533]){
        const z=x===0?.183:.256;
        tube(0x5f7154,[x,-.180,z],[x,-.365,z+.026],.196,.190,'metal',12);
        tube(gold,[x,-.348,z+.022],[x,-.635,z+.158],.194,.115,'paint',12);
        for(let i=0;i<6;i++){
          const a=i*TAU/6;line(i%2?0xc99536:cream,[[x+Math.cos(a)*.177,-.329,z+.017+Math.sin(a)*.153],
            [x+Math.cos(a)*.160,-.457,z+.077+Math.sin(a)*.153],[x+Math.cos(a)*.112,-.611,z+.142+Math.sin(a)*.115]],.017,'paint',4);
        }
      }
      torus(0xa3f9dc,[0,.372,0],.273,.035,[X,0,0],'metal');
      box(ink,[0,.455,-.061],.306,.055,.145,.019,[0,0,0],'metal');
      for(const k of [-1,1]){
        line(0x99f1cf,[[k*.607,.153,.229],[k*.647,.177,0],[k*.613,.182,-.247]],.025,'glow',10);
        sphere(0x425873,[k*.678,.048,-.070],[.059,.106,.157],[0,0,0],'metal',12);
      }
      break;
    }
    case 'spring':{
      for(const x of [-.291,.291]){
        box(0xf06e5b,[x,-.552,.182],.551,.171,1.47,.058);
        box(0x233146,[x,-.408,.052],.478,.092,1.126,.042);
        box(0x32677b,[x,.350,.024],.435,.157,.938,.052);
        box(0xff9572,[x,.498,.158],.461,.195,.887,.075);
        box(cream,[x,.487,.557],.415,.138,.175,.048);
        const rounds=4,pts=Array.from({length:86},(_,i)=>{
          const f=i/85,a=f*TAU*rounds;return [x+Math.cos(a)*.171,-.354+f*.671,Math.sin(a)*.221];
        });
        line(alloy,pts,.053,'metal',56);
      }
      box(0x40566a,[0,-.459,-.051],.16,.163,.845,.044);
      for(const x of [-.293,.293]){
        sphere(gold,[x,-.467,.830],[.069,.058,.034],[0,0,0],'glow',12);
        for(const k of [-1,1]){
          const sx=x+k*.205;
          box(0xf8d090,[sx,.390,.158],.088,.057,.421,.012,[0,.028*k,0],'metal');
          box(0xa5f1ec,[sx,-.451,.270],.088,.043,.289,.008,[0,.028*k,0],'glow');
        }
      }
      break;
    }
    case 'siphon':{
      profile(0x2e7d87,[[0,-.703],[.320,-.704],[.397,-.563],[.397,.577],[.366,.719],[0,.718]],[0,0,0],[X,0,0]);
      profile(0x83f9ec,[[.39,-.459],[.462,-.415],[.469,-.282],[.466,.352],[.408,.434]],[0,0,0],[X,0,0],'film');
      for(const z of [-.572,.455]){
        profile(0x263d59,[[.383,z-.104],[.510,z-.088],[.551,z-.031],[.547,z+.092],[.483,z+.135],[.361,z+.14]],[0,0,0],[X,0,0]);
        torus(0x64efe0,[0,0,z+.132],.465,.026,[0,0,0],'glow');
      }
      profile(0x4bbfc1,[[.240,.55],[.283,.594],[.454,.804],[.576,1.052],[.599,1.128],
        [.576,1.172],[.489,1.174],[.462,1.114],[.363,.939],[.241,.755]],[0,0,0],[X,0,0],'metal');
      torus(cream,[0,0,1.157],.548,.051,[0,0,0],'paint');
      profile(0x204052,[[0,.712],[.225,.712],[.241,.751],[.251,.793],[0,.793]],[0,0,0],[X,0,0]);
      for(const x of [-.289,.289])box(0x75ffee,[x,.373,.015],.091,.039,.637,.016,[0,0,Math.sign(x)*.75],'glow');
      for(let i=0;i<6;i++){
        const a=i*TAU/6;
        sector(b,i%2?0x238493:0xa3ead5,[[.477,.879],[.551,1.027],[.601,1.106]],
          a+.051,.55,'metal',[0,0,0],[X,0,0],5);
        sphere(0xd4fff0,[Math.sin(a)*.565,Math.cos(a)*.565,1.056],[.042,.046,.028],[0,0,-a],'glow',10);
      }
      break;
    }
    case 'rocket':{
      relayRocket(b);
      break;
    }
    case 'comet':{
      sphere(0xffb945,[0,0,.135],[.775,.756,.806],[0,0,0],'paint',24);
      torus(0xffed9d,[0,0,.145],.780,.086,[.67,.34,.43],'metal',32);
      profile(0xe87944,[[0,-1.6],[.071,-1.57],[.237,-1.305],[.370,-1.05],[.502,-.819],
        [.469,-.670],[.376,-.587],[0,-.579]],[0,0,0],[X,0,0]);
      for(let i=0;i<4;i++){
        const a=i*X,fn=(r,z)=>[Math.cos(a)*r,Math.sin(a)*r,z];
        line(0xffca62,[fn(.093,-1.525),fn(.212,-1.297),fn(.332,-1.050),fn(.406,-.819),fn(.371,-.646)],.037,'paint',12);
      }
      const star=Array.from({length:10},(_,i)=>{const a=i*Math.PI/5,r=i%2?.139:.296;return [Math.sin(a)*r,Math.cos(a)*r+.211];});
      badgeXZ(0xffefb1,star,.736,.029,'glow');
      for(let i=0;i<5;i++){
        const a=i*TAU/5;
        sector(b,i%2?0xffaa49:0xffd66e,[[.471,-.331],[.651,-.210],[.755,-.103],[.797,.053],
          [.796,.195],[.737,.384],[.593,.554]],a+.045,.37,'paint',[0,0,.135],[X,0,0],7);
      }
      gem(0xfff7ca,[0,0,.879],[.201,.215,.089],[0,0,.30],'glow');
      break;
    }
  }
  return b.finish(type);
}

export function itemModel(type){
  if(!templates.has(type))templates.set(type,build(type));
  return templates.get(type).clone();
}

const trailShape=new THREE.ConeGeometry(.5,1,4).rotateX(-X).translate(0,0,-.5);
export function projectileModel(type,tint){
  const model=itemModel(type);
  if(type==='lightbolt'||type==='bolt'||type==='cursor'||type==='rocket'){
    const color=tint??(type==='rocket'?0xffad4a:0xff98cc);
    if(!trails.has(color))trails.set(color,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.68,depthWrite:false}));
    const trail=new THREE.Mesh(trailShape,trails.get(color));
    trail.position.z=type==='lightbolt'?-.22:type==='bolt'?-.48:-.87;
    trail.scale.set(.44,.44,2);
    model.add(trail);model.userData.trail=trail;
  }
  return model;
}
