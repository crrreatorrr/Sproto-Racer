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
function toyCapsule(b,p,heading,scale,col,type='candy'){
  const {add,profile}=b,s=scale;
  const toWorld=(point,rotate)=>{const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),heading);
    point.multiplyScalar(s).applyQuaternion(q).add(new THREE.Vector3(...p));
    return [point.toArray(),q.multiply(rotate)];};
  const put=(g,c,pos,rot,m)=>{const [xyz,q]=toWorld(new THREE.Vector3(...pos),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)));
    add(g,c,xyz,q,m,[s,s,s]);};
  const shell=(rows,c,m)=>put(new THREE.LatheGeometry(rows.map(v=>new THREE.Vector2(...v)),18),c,[0,0,0],[X,0,0],m);
  const ring=(r,t,z,c,m)=>put(new THREE.TorusGeometry(r,t,5,14),c,[0,0,z],[0,0,0],m);
  const rocket=type==='rocket',bud=type==='light';
  const a=rocket?.485:bud?.149:.182;
  shell([[0,-.92],[a*.61,-.92],[a*.89,-.79],[a,-.42],[a,.31],[a*.987,.52],
    [a*.88,.70],[a*.55,.92],[a*.18,1.026],[0,1.055]],col,'paint');
  shell([[0,-1.067],[a*.69,-1.067],[a*.82,-.942],[a*.611,-.877],[0,-.88]],ink,'paint');
  if(!bud){
    ring(a*.982,a*.112,.435,cream,'paint');
    ring(a*.991,a*.072,-.485,rocket?alloy:white,'metal');
    ring(a*.732,a*.12,-.97,rocket?orange:mint,'glow');
    if(rocket){
      // Arcade capsule livery, with a sculpted cream nose and broad rose shoulder band.
      shell([[a*.987,.52],[a*.906,.679],[a*.818,.738],[a*.773,.799],[a*.708,.847],
        [a*.639,.897],[a*.512,.943],[a*.288,1.013],[0,1.060]],0xff776f,'paint');
      shell([[a*.998,-.092],[a*1.018,-.087],[a*1.018,.037],[a*.997,.056]],cream,'paint');
      ring(a,.065*a,.098,0xff9d75,'metal');
    }else{
      // Two colored paper-wrap twists make the confetti capsule readable as candy.
      const candy=Array.from({length:19},(_,i)=>{const t=i/18,v=t*8.8;
        return new THREE.Vector3(Math.cos(v)*a*1.013,Math.sin(v)*a*1.013,-.39+t*.726);
      });
      put(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(candy),18,a*.093,5,false),0xffeef5,
        [0,0,0],[0,0,0],'paint');
    }
  }
  for(let i=0;i<(rocket?4:bud?0:3);i++){
    const angle=i*(rocket?X:TAU/3);
    const poly=[[a*.62,-.76],[a*(rocket?1.70:1.40),-.88],[a*(rocket?1.54:1.35),-.57],[a*.85,-.29]];
    const shape=new THREE.Shape(poly.map(v=>new THREE.Vector2(...v)));
    const fin=new THREE.ExtrudeGeometry(shape,{depth:.09,steps:1,bevelEnabled:false}).rotateX(X).translate(0,.045,0);
    put(fin,rocket?0xbc374a:gold,[0,0,0],[0,0,angle],'paint');
  }
  put(new THREE.SphereGeometry(1,12,8).scale(a*.54,a*.54,a*.15),bud?white:cream,[0,0,1.009],[0,0,0],'glow');
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
      break;
    }
    case 'ball':{
      sphere(orange,[0,0,0],[.81,.81,.81],[0,0,0],'paint',22);
      profile(0x293047,[[.795,-.202],[.816,-.154],[.819,.156],[.795,.203]],[0,0,0],[0,0,0],'paint',24);
      for(const y of [-.174,.173])torus(gold,[0,y,0],.805,.024);
      for(let i=0;i<6;i++){
        const a=TAU*i/6,p=(f,y)=>[Math.sin(a)*f,y,Math.cos(a)*f];
        tube(0xce532e,p(.75,0),p(.835,0),.16,.146);
        tube(cream,p(.834,0),p(.85,0),.096,.079,'glow',10);
        gem(cream,p(.698,.445),[.079,.105,.039],[0,a,0]);
      }
      tube(gold,[0,.763,0],[0,.826,0],.235,.194,'metal');tube(ink,[0,.822,0],[0,.839,0],.103,.098);
      break;
    }
    case 'bubble':{
      sphere(0x7beaff,[0,0,0],[1,1,1],[0,0,0],'film',24);
      // Small floating fittings give the shield a reference frame without obstructing play.
      for(const [rx,ry,rz,c] of [[X,0,0,0x89fff0],[.34,.85,.61,0x51cce8]])torus(c,[0,0,0],.942,.034,[rx,ry,rz],'metal',32);
      for(const [x,y,z] of [[.67,.35,.621],[-.69,.26,.64],[.4,.60,-.664]])gem(white,[x,y,z],[.095,.141,.089],[.36,.72,.51],'glow');
      for(const [x,y,z] of [[-.47,.62,.60],[-.28,.78,.53]]){
        sphere(white,[x,y,z],[.13,.052,.04],[0,.38,.58],'film');
      }
      break;
    }
    case 'slip':{
      sphere(0x9f6fe6,[-.09,-.15,.004],[.81,.41,.713],[0,0,-.16],'paint',22);
      sphere(0xc48ef0,[.192,.15,.075],[.53,.58,.537],[0,0,.41],'paint',18);
      sphere(0xba86ef,[-.465,-.24,.285],[.43,.32,.41],[.08,.17,-.17],'paint',16);
      for(const [x,y,z,s] of [[.51,-.29,.400,.24],[-.59,-.42,-.30,.22],[.24,-.405,-.43,.27],[-.118,-.451,.661,.148]])
        sphere(0xa977e2,[x,y,z],[s,.137,s*.91],[0,0,0],'paint',12);
      for(const [x,y,z] of [[.031,.233,.569],[.350,.240,.540]])sphere(cocoa,[x,y,z],[.080,.104,.029],[0,0,-.13]);
      sphere(0xf4cae9,[.358,.513,.346],[.138,.073,.029],[0,0,-.37]);
      break;
    }
    case 'box':{
      box(0xf38750,[0,-.034,0],1.02,.915,1.02,.082);
      box(0x853244,[0,.448,0],1.086,.171,1.086,.049);
      box(0xffd678,[0,.534,0],.902,.038,.902,.057);
      for(const y of [-.425,.234])box(0xdd6549,[0,y,0],1.04,.112,1.04,.031);
      for(let side=0;side<4;side++){
        const a=side*X,pt=(x,y,z)=>[Math.sin(a)*z+Math.cos(a)*x,y,Math.cos(a)*z-Math.sin(a)*x];
        box(0xa1444b,pt(0,-.038,.504),.662,.32,.082,.016,[0,a,0]);
        box(cream,pt(0,.104,.551),.695,.047,.028,.015,[0,a,0]);
        for(const x of [-.145,.145]){
          sphere(white,pt(x,-.033,.560),[.105,.094,.039],[0,a,0],'paint',12);
          sphere(cocoa,pt(x+.021,-.047,.588),[.046,.057,.022],[0,a,0],'paint',8);
        }
        for(const x of [-.424,.424])box(cream,pt(x,.375,.540),.091,.173,.028,.010,[0,a,0]);
      }
      break;
    }
    case 'cursor':{
      const pointer=[[-.603,-.246],[0,1.063],[.591,-.241],[.224,-.348],[.246,-.964],[.145,-1.178],[-.18,-1.178],[-.249,-.963],[-.224,-.348]];
      badgeXZ(cocoa,pointer,-.18,.272);
      badgeXZ(0xfc5ca6,pointer.map(([x,z])=>[x*.925,z*.918+.032]),.084,.077);
      badgeXZ(0xffb1d1,[[0,.862],[.348,-.115],[.119,-.091],[.109,-.761],[-.073,-.761],[-.091,-.089],[-.344,-.116]],.170,.029);
      badgeXZ(cream,[[0,.806],[.166,.323],[-.166,.323]],.202,.026,'glow');
      for(const x of [-.148,.146])tube(cream,[x,.044,-1.065],[x,.044,-1.338],.096,.064,'metal');
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
      line(cream,[[.15,-.365,.438],[.46,-.473,.49],[.666,-.431,.58],[.772,-.571,.58],
        [.721,-.784,.59],[.529,-.915,.59],[.364,-.882,.59],[.314,-.725,.59],[.395,-.647,.59]],.065,'metal');
      break;
    }
    case 'strip':{
      box(0x263741,[0,.004,0],.99,.074,.994,.04);
      box(0x3d6a68,[0,.045,0],.918,.045,.930,.032);
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
      profile(0x20516b,[[0,-.142],[.74,-.142],[.928,-.135],[1.02,-.064],[1.049,.004],
        [.990,.098],[.854,.160],[.783,.175],[0,.175]]);
      profile(0x4bd9f3,[[.797,.146],[.887,.119],[.984,.065],[1.026,.017],[1.061,.053],[1.020,.124],
        [.931,.207],[.787,.271],[.697,.283]], [0,0,0],[0,0,0],'metal');
      torus(mint,[0,.186,0],.796,.035,[X,0,0],'glow');
      profile(ink,[[0,.281],[.533,.281],[.544,.319],[.489,.357],[0,.364]]);
      gem(cream,[0,.383,0],[.341,.118,.344],[0,.45,0],'glow');
      for(let i=0;i<5;i++){
        const a=TAU*i/5;box(i===0?gold:0x4795ad,[Math.sin(a)*.78,.231,Math.cos(a)*.78],.250,.133,.18,.024,[0,a,0]);
      }
      break;
    }
    case 'fan':
      for(const [heading,col] of [[-.315,0x46dddb],[0,0xf887c9],[.315,0xffc75c]])toyCapsule(b,[heading*1.49,0,.07-Math.abs(heading)*.53],heading,.91,col);
      break;
    case 'lightbolt':{
      // A fantastical Barrage glow capsule: white pearl, transparent teal outer
      // band, chunky ceramic tail plug. No photo-real ammunition shapes/colors.
      profile(0x1a8ea8,[[0,-.326],[.065,-.326],[.083,-.274],[.077,.116],[.069,.231],[0,.231]],[0,0,0],[X,0,0]);
      profile(0x62f5fc,[[.089,-.197],[.103,-.144],[.103,.111],[.086,.209]],[0,0,0],[X,0,0],'glow',16);
      torus(0xd6fdff,[0,0,-.167],.086,.009,[0,0,0],'glow',16);
      sphere(white,[0,0,.258],[.091,.091,.146],[0,0,0],'glow',16);
      sphere(0x67e5e4,[0,0,.142],[.102,.102,.298],[0,0,0],'film',14);
      break;
    }
    case 'bolt':toyCapsule(b,[0,0,0],0,1,0xfa73ad);break;
    case 'lob':{
      sphere(0x75c248,[0,-.07,0],[.784,.729,.801],[0,0,0],'paint',22);
      profile(0xbde357,[[.792,.025],[.829,.064],[.824,.182],[.767,.236]],[0,0,0],[0,0,0],'paint');
      torus(0xe8ef99,[0,.103,0],.814,.028,[X,0,0],'glow');
      for(let i=0;i<6;i++){
        const a=i*TAU/6;const p=(r,y)=>[Math.sin(a)*r,y,Math.cos(a)*r];
        sphere(0x387249,p(.797,.075),[.141,.105,.056],[0,a,0],'paint',12);
        sphere(0xefffb0,p(.849,.075),[.077,.055,.012],[0,a,0],'glow',12);
      }
      profile(0x3b6542,[[0,.56],[.214,.56],[.289,.665],[.261,.866],[.232,.920],[0,.920]]);
      gem(0xfaf491,[.08,.963,.018],[.173,.198,.151],[.55,.28,.22],'glow');
      break;
    }
    case 'ring':{
      profile(0xbb6a33,[[.75,-.015],[.775,-.099],[.864,-.145],[1.005,-.139],[1.108,-.067],
        [1.132,.002],[1.117,.083],[1.027,.124],[.898,.122],[.819,.069],[.766,.010],[.75,-.015]]);
      torus(gold,[0,.074,0],.942,.078,[X,0,0],'metal',32);
      torus(0xffeda0,[0,.127,0],.941,.023,[X,0,0],'glow',32);
      for(let n=0;n<4;n++){
        const a=n*X,r=(x,z)=>[Math.cos(a)*x+Math.sin(a)*z,Math.cos(a)*z-Math.sin(a)*x];
        badgeXZ(0xff8847,[[.821,-.192],[1.023,-.221],[1.203,-.132],[1.137,.148],[.883,.203],[.827,.121]].map(([x,z])=>r(x,z)),.039,.077);
      }
      break;
    }
    case 'puck':{
      profile(0x33294e,[[0,-.311],[.650,-.311],[.846,-.297],[.912,-.223],[.933,-.128],
        [.927,-.033],[.857,.074],[.770,.113],[0,.113]]);
      profile(0x9965dc,[[.639,.018],[.763,.026],[.790,.131],[.720,.200],[.568,.258],[.471,.271],[0,.273]]);
      torus(0xefa9ff,[0,.165,0],.744,.042,[X,0,0],'metal');
      torus(0xf7c6ff,[0,.244,0],.472,.022,[X,0,0],'glow');
      gem(0xf2d1ff,[0,.522,0],[.288,.340,.291],[.08,.385,.06],'film');
      gem(0xffe5ff,[0,.516,0],[.131,.260,.135],[.08,.385,.06],'glow');
      for(let i=0;i<4;i++){
        const a=TAU*(i+.5)/4;box(0xdea0ff,[Math.sin(a)*.711,.163,Math.cos(a)*.711],.136,.125,.278,.026,[0,a,0]);
      }
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
      for(const x of [-.293,.293])sphere(gold,[x,-.467,.830],[.069,.058,.034],[0,0,0],'glow',12);
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
      break;
    }
    case 'rocket':toyCapsule(b,[0,0,0],0,1,0xf45a64,'rocket');break;
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
