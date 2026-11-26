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
  part.userData.finish=style==='glass'?'glass':style==='light'?'glow':style==='steel'?'metal':
    style==='rubber'?'rubber':style==='matte'||c===C.ink?'solid':'coat';
  if(rotation)part.rotation.set(...rotation);
  group.add(part);return part;
}
function box(group,c,p,s,r=.035,angle=0,style){
  return mesh(group,new RoundedBoxGeometry(...s,r>=.095?2:1,Math.min(r,Math.min(...s)*.45)),c,p,angle?[angle,0,0]:null,style);
}
// A small ring-lathe utility for sculpted, tapering chassis and hollow braced beds.
// Closed horizontal profiles keep deliberate bevel breaks but smooth the rounded corners.
function rectRing(x,y,z,hw,hd,rx=.10,rz=rx) {
  const out=[];
  for(const [sx,sz,start] of [[1,1,0],[-1,1,Math.PI*.5],[-1,-1,Math.PI],[1,-1,Math.PI*1.5]]){
    for(let n=0;n<3;n++){
      const a=start+n*Math.PI*.25;
      out.push([x+sx*(hw-rx)+rx*Math.cos(a),y,z+sz*(hd-rz)+rz*Math.sin(a)]);
    }
  }
  return out;
}
function profileSkin(g,rows,c,style='paint',closeBottom=false,closeTop=false){
  const rings=rows.map(row=>rectRing(...row)),n=rings[0].length,vertices=rings.flat(2),uv=[],idx=[];
  for(let i=0;i<rows.length;i++)for(let j=0;j<n;j++)uv.push(j/n,i/(rows.length-1));
  for(let i=0;i<rows.length-1;i++)for(let j=0;j<n;j++){
    const a=i*n+j,b=i*n+(j+1)%n;
    idx.push(a,a+n,b,b,a+n,b+n);
  }
  for(const [enable,layer,invert] of [[closeBottom,0,false],[closeTop,rows.length-1,true]]){
    if(!enable)continue;
    const k=layer*n;
    for(let i=1;i<n-1;i++){
      if(invert)idx.push(k,k+i+1,k+i);else idx.push(k,k+i,k+i+1);
    }
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geo.setIndex(idx);geo.computeVertexNormals();
  return mesh(g,geo,c,[0,0,0],null,style);
}
function sculptedHood(g,{x=0,y,z,w,h,d,c,lip=c}){
  profileSkin(g,[
    [x,y-h*.48,z+.030,w*.46,d*.48,.090,.085],
    [x,y-h*.32,z-.011,w*.501,d*.505,.138,.122],
    [x,y+h*.21,z+.011,w*.485,d*.473,.132,.092],
    [x,y+h*.46,z+.039,w*.426,d*.376,.102,.071],
    [x,y+h*.50,z+.055,w*.387,d*.336,.091,.067],
  ],c,'paint',true,true);
  if(lip!==c)box(g,lip,[x,y+h*.491,z+.014],[w*.70,.022,d*.541],.011);
}
function lens(g,x,y,z,w,h,rgb=0xffe19d) {
  // Slight outward glass bulge over a metallic bezel rather than a flat glowing block.
  const dome=new T.SphereGeometry(1,14,6,0,Math.PI*2,0,Math.PI*.34);
  dome.rotateX(-Math.PI*.5);
  dome.scale(w*.51,h*.51,.065);
  mesh(g,dome,rgb,[x,y,z+.035],null,'light');
  mesh(g,new T.BoxGeometry(w*.29,.023,.016),0xfff4c2,[x-w*.11,y+h*.14,z-.029],null,"light");
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
    box(g,C.ink,[s*x,y,z],[w+.082,h+.079,.107],.047);
    box(g,0x6c6862,[s*x,y,z-.051],[w+.038,h+.036,.034],.043,0,'steel');
    box(g,0xf5bf65,[s*x,y,z-.068],[w,h,.04],.043);
    lens(g,s*x,y+.008,z-.073,w*.86,h*.79,C.light);
  }
}
function rearLights(g,z,y,x,w=.26){
  for(const s of [-1,1]){
    box(g,C.ink,[s*x,y,z],[w+.04,.143,.065],.027);
    box(g,0xcc3b23,[s*x,y,z+.031],[w*.62,.094,.023],.020,0,'light');
    box(g,0xe78a2f,[s*x-s*w*.27,y,z+.032],[w*.16,.080,.025],.010,0,'light');
  }
}
function fastener(g,p,axis='x',r=.032){
  const rotation=axis==='x'?[0,0,Math.PI/2]:axis==='z'?[Math.PI/2,0,0]:[0,0,0];
  return mesh(g,new T.CylinderGeometry(r,r,.021,6),0x938d84,p,rotation,'steel');
}
function grille(g,z,y,w=.66,h=.35,bars=4){
  box(g,0x7e736b,[0,y,z],[w+.058,h+.064,.062],.047,0,'steel');
  box(g,C.ink,[0,y,z-.033],[w,h,.042],.043);
  for(let i=0;i<bars;i++)box(g,C.bright,[0,y-h*.31+i*h*.62/Math.max(1,bars-1),z-.055],[w*.85,.027,.026],.012,0,'steel');
}
function sideVents(g,x,y,z,count=3){
  for(let i=0;i<count;i++){
    box(g,C.ink,[x,y-i*.125,z],[.019,.050,.37],.022);
    box(g,0x5c5b5f,[x+Math.sign(x)*.013,y-i*.125-.017,z],[.015,.014,.315],.008,0,'steel');
  }
}
function frame(g,x,y,z,w,l,c=C.ink){
  box(g,c,[x,y,z],[w,.25,l],.075);
  for(const side of [-1,1]){
    box(g,0x37373b,[x+side*w*.39,y-.14,z],[.12,.16,l*.77],.026);
    box(g,0x5f5c55,[x+side*w*.505,y-.016,z+.13],[.106,.18,l*.27],.030,0,'steel');
  }
}
// Four-section cross-section for a real rolled arch instead of a zero-thickness fender.
function archedFender(g,x,y,z,r,w,c){
  const R=r+.105;
  const outline=[[-w*.5,R-.025],[-w*.5,R+.012],[-w*.42,R+.045],[w*.42,R+.045],
    [w*.5,R+.012],[w*.5,R-.025],[w*.39,R-.042],[-w*.39,R-.042],[-w*.5,R-.025]];
  const vertices=[],uv=[],indices=[],segments=28;
  for(let i=0;i<=segments;i++){
    const a=i*Math.PI/segments;
    for(let j=0;j<outline.length;j++){
      const [X,R]=outline[j];
      vertices.push(x+X,y+Math.sin(a)*R,z+Math.cos(a)*R);
      uv.push(j/(outline.length-1),i/segments);
    }
  }
  const n=outline.length;
  for(let i=0;i<segments;i++)for(let j=0;j<n-1;j++){
    const a=i*n+j,b=a+n;
    indices.push(a,a+1,b,b,a+1,b+1);
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geo.setIndex(indices);geo.computeVertexNormals();mesh(g,geo,c,[0,0,0]);
  for(const s of [-1,1])box(g,c,[x,y,z+s*(R+.003)],[w,.059,.091],.026);
}
function seat(g,x,y,z,w=.67){
  box(g,0x302a2b,[x,y-.10,z+.03],[w,.15,.52],.07);
  box(g,0x302a2b,[x,y+.29,z+.42],[w,.70,.20],.075,-.13);
  box(g,0x3e3230,[x,y+.38,z+.307],[w*.74,.50,.05],.021,-.13);
}
function windowPane(g,p,w,h,rotation){
  const q=new T.Quaternion().setFromEuler(new T.Euler(...rotation)),world=(x,y,z)=>
    new T.Vector3(x,y,z).applyQuaternion(q).add(new T.Vector3(...p)).toArray();
  // The glass is one plane to avoid doubling the tint over the visible character.
  const pane=mesh(g,new T.PlaneGeometry(w,h),C.glass,p,rotation,'glass');
  for(const s of [-1,1]){
    beam(g,0x24363d,world(-w*.5,s*h*.5,.006),world(w*.5,s*h*.5,.006),.043,.045,.015,'matte');
    beam(g,0x24363d,world(s*w*.5,-h*.5,.006),world(s*w*.5,h*.5,.006),.043,.045,.014,'matte');
  }
  return pane;
}
function cab(g,{x=0,z=-.76,y=1.0,w=1.78,d=1.20,roof=2.54,c=C.yellow,trim=c,open=false,panel=true,rake=.22,dome=true}){
  const front=z-d*.5,back=z+d*.5,wend=x-w*.5,wplus=x+w*.5;
  box(g,c,[x,y-.12,z],[w,.27,d],.10);
  if(dome)profileSkin(g,[
    [x,roof-.074,z+.045,w*.448,d*.433,.12,.107],
    [x,roof-.043,z+.047,w*.508,d*.495,.135,.115],
    [x,roof+.021,z+.056,w*.507,d*.491,.133,.113],
    [x,roof+.072,z+.074,w*.456,d*.464,.109,.089],
    [x,roof+.088,z+.096,w*.392,d*.405,.096,.076],
  ],trim,'paint',true,true);
  else box(g,trim,[x,roof,z+.045],[w+.075,.16,d+.045],.082);
  // Painted visor lip and nested roof insert read as two pieces, but are one rigid assembly.
  box(g,trim,[x,roof-.035,front+rake-.065],[w*.865,.041,.132],.019);
  box(g,0x384044,[x,roof-.062,front+rake-.105],[w*.74,.027,.030],.012,0,'matte');
  for(const v of [wend+.09,wplus-.09]){
    const s=Math.sign(v-x);
    box(g,c,[v+s*.041,y+.170,z+.085],[.040,.25,d*.72],.026);
    box(g,0x4f4b48,[v+s*.070,y+.328,z+.29],[.040,.051,.161],.017,0,'steel');
    beam(g,c,[v,y+.10,front],[v,roof,front+rake],.154,.148,.053);
    beam(g,c,[v,y+.08,back],[v,roof,back+.05],.12,.13,.036);
    box(g,trim,[v,y+.12,z+.01],[.14,.19,d],.049);
    if(!open){
      windowPane(g,[v,y+(roof-y)*.52,z+.06],d-.26,roof-y-.38,[0,v<x?-Math.PI/2:Math.PI/2,0]);
      tube(g,0x5a5551,[v+s*.015,y+.67,front+.17],[v+s*.057,y+.67,front-.048],.028,'steel');
      box(g,0x5f6063,[v+s*.053,y+.67,front-.06],[.146,.279,.173],.057,0,'steel');
      box(g,0xcad1d2,[v+s*.060,y+.67,front+.030],[.116,.219,.026],.021,0,'steel');
    }
  }
  box(g,c,[x,y+.23,front+.017],[w,.19,.12],.057);
  box(g,C.ink,[x,roof-.14,front+rake-.024],[w-.12,.075,.10],.035);
  if(!open){
    const angle=Math.atan2(rake,roof-y-.23);
    windowPane(g,[x,(roof+y+.23)*.5,front+rake*.5-.013],w-.23,roof-y-.33,[angle,Math.PI,0]);
    box(g,0x27383e,[x,y+.285,front+.083],[w-.20,.058,.16],.025);
    for(const s of [-1,1])beam(g,C.ink,[x+s*.24,y+.295,front+.033],[x+s*.43,y+.49,front+.051],.027,.027,.012);
  }
  if(panel)box(g,0x2e2b31,[x,y+.60,back+.055],[w-.22,.87,.07],.043);
}
const I=[-1,1];
function rearGuard(g,{z,y,w,c=0x363638,a=.48}){
  box(g,c,[0,y,z],[w,.22,.20],.060,0,'steel');
  box(g,0x242629,[0,y-.104,z-.055],[w*.75,.067,.13],.029,0,'matte');
  rearLights(g,z+.096,y+.050,w*.388,.198);
  for(const s of I){
    fastener(g,[s*a,y-.041,z+.106],'z',.038);
    box(g,0xa23a26,[s*.22,y-.124,z+.034],[.12,.071,.031],.014);
  }
}
function dump(g){
  const y=C.yellow, black=C.ink;
  frame(g,0,.61,0,1.48,3.52);
  cab(g,{z:-.95,y:1.00,w:1.83,d:1.05,roof:2.49,c:y});
  sculptedHood(g,{y:.968,z:-1.572,w:1.85,h:.645,d:.493,c:y,lip:0xffd143});
  box(g,black,[0,.61,-1.91],[1.97,.28,.28],.08);
  for(let k=-2;k<=2;k++){
    const stripe=box(g,y,[k*.36,.61,-2.060],[.142,.233,.019],.008);
    stripe.rotation.z=-.43;
  }
  grille(g,-1.844,1.018,.70,.40);
  box(g,0xffd244,[0,1.286,-1.642],[1.26,.065,.329],.031);
  for(const side of I){
    box(g,0x493b24,[side*.81,.839,-.71],[.32,.085,.58],.027,0,'matte');
    box(g,0x7e7153,[side*.947,.845,-.72],[.071,.038,.412],.016,0,'steel');
    fastener(g,[side*.84,.744,-.94],'x');
  }
  rearGuard(g,{z:1.694,y:.685,w:1.78});
  frontLights(g,-1.862,1.03,.67,.25,.25);
  for(const x of [-.44,0,.44])box(g,C.amber,[x,2.541,-1.435],[.19,.09,.18],.034,0,'light');
  // Deep flared bed with an actual continuous interior and a boxed rim.
  box(g,0x4a4440,[0,1.29,.71],[1.38,.274,1.64],.082,0,'steel');
  for(const side of I)beam(g,0xa18d6c,[side*.46,.725,.21],[side*.46,1.178,.79],.160,.194,.055,'steel');
  profileSkin(g,[
    [0,1.504,.745,.741,.764,.074,.071],
    [0,1.581,.723,.807,.832,.093,.091],
    [0,1.705,.715,.871,.899,.104,.108],
    [0,2.294,.711,1.022,.995,.139,.117],
    [0,2.407,.711,1.094,1.054,.132,.113],
    [0,2.497,.711,1.081,1.034,.112,.108],
    [0,2.496,.705,.937,.910,.094,.090],
    [0,2.396,.708,.930,.908,.087,.087],
    [0,1.699,.724,.740,.713,.078,.073],
    [0,1.621,.728,.682,.678,.066,.061],
  ],y,'paint',true,true);
  box(g,0xcc8909,[0,1.618,.727],[1.345,.021,1.35],.011);
  for(const side of I){
    for(let k=0;k<4;k++){
      const z=.044+k*.434;
      beam(g,0xf2ab0b,[side*.859,1.686,z+.075],[side*.996,2.302,z-.050],.085,.141,.022);
      box(g,0xfbc439,[side*.995,2.251,z-.039],[.071,.083,.156],.030);
    }
    beam(g,0xe09805,[side*.850,1.704,-.083],[side*.863,1.704,1.425],.098,.091,.029);
  }
  // Upper gate seam and its hinges stay clear of the pipe apertures below the bed.
  box(g,0xc48412,[0,1.712,1.704],[1.68,.107,.094],.044);
  for(const s of I){
    box(g,0xffcb26,[s*.68,2.171,1.761],[.12,.31,.079],.031);
    fastener(g,[s*.68,2.221,1.807],'z',.034);
    sidePin(g,s*.88,1.62,1.58,.069);
  }
  for(const x of I)for(const z of [-1.12,1.04])archedFender(g,x*1.00,.56,z,.56,.46,0x363439);
  seat(g,0,1.10,-.80,.70);
}
function loader(g){
  const red=C.red,y=C.yellow;
  frame(g,0,.57,.17,1.54,3.23);
  profileSkin(g,[
    [0,.635,.372,.749,1.199,.115,.104],
    [0,.706,.364,.819,1.322,.144,.126],
    [0,.972,.382,.817,1.345,.157,.111],
    [0,1.126,.454,.723,1.214,.150,.127],
    [0,1.160,.492,.659,1.120,.137,.126],
  ],red,'paint',true,true);
  profileSkin(g,[
    [0,1.007,1.193,.704,.445,.126,.088],
    [0,1.115,1.181,.825,.482,.126,.110],
    [0,1.469,1.188,.831,.490,.128,.113],
    [0,1.674,1.178,.789,.460,.143,.118],
    [0,1.818,1.160,.701,.399,.148,.109],
    [0,1.866,1.155,.597,.343,.126,.100],
  ],red,'paint',true,true);
  box(g,0xe34d35,[0,1.864,1.175],[1.101,.040,.630],.018);
  box(g,0x363134,[0,1.471,1.675],[1.202,.39,.072],.043,0,'matte');
  for(let k=0;k<4;k++)box(g,0x756d67,[0,1.334+k*.084,1.711],[1.016,.027,.026],.010,0,'steel');
  rearGuard(g,{z:1.676,y:.927,w:1.72,c:0x70504c,a:.41});
  for(const s of I){
    sideVents(g,s*.836,1.56,1.10);
    archedFender(g,s*1.02,.59,-.82,.54,.40,red);
    archedFender(g,s*1.02,.59,1.03,.54,.40,red);
    for(const end of [-.32,.58])beam(g,C.ink,[s*.71,1.04,end],[s*.79,2.63,end+.23],.12,.14,.052);
    const a=[s*.65,1.46,-.25],b=[s*.69,.76,-1.337];
    beam(g,red,a,b,.22,.19,.062);
    tube(g,C.metal,[s*.72,1.34,.00],[s*.75,1.03,-.96],.071,'steel');
    tube(g,C.bright,[s*.75,1.03,-.96],[s*.75,.80,-1.329],.046,'steel');
    box(g,0xe7a717,[s*.69,.733,-1.424],[.209,.190,.136],.037);
    sidePin(g,s*.806,.765,-1.369,.072);
    sidePin(g,s*.77,1.46,-.25,.115);
    sidePin(g,s*.807,1.46,-.25,.059,0x60534b);
    fastener(g,[s*.823,1.46,-.25],'x');
    box(g,0x393237,[s*.83,1.03,.31],[.19,.094,.38],.031,0,'matte');
    beam(g,0xd34c32,[s*.68,.92,-.36],[s*.88,1.16,-.91],.104,.089,.043);
  }
  profileSkin(g,[
    [0,2.552,.198,.786,.569,.090,.081],
    [0,2.588,.192,.895,.638,.134,.115],
    [0,2.648,.202,.867,.615,.128,.107],
    [0,2.707,.224,.754,.529,.112,.096],
  ],red,'paint',true,true);
  beacon(g,0,2.74,.22);
  frontLights(g,-.487,2.60,.48,.26,.16);
  frontLights(g,-.91,1.03,.83,.22,.15);
  // Curved welded scoop: side walls, concave cutting face, replaceable teeth.
  const points=[[.25,-2.37],[.24,-1.94],[.29,-1.74],[.40,-1.57],[.57,-1.495],
    [.76,-1.49],[.92,-1.53]];
  const vertices=[],uv=[],indices=[];
  for(const [j,[Y,Z]] of points.entries()){
    vertices.push(-1.015,Y,Z,1.015,Y,Z);uv.push(0,j/6,1,j/6);
    if(j){const i=(j-1)*2;indices.push(i,i+2,i+1,i+1,i+2,i+3);}
  }
  const skin=new T.BufferGeometry();
  skin.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  skin.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  // Facing the fixed scoop mouth (-Z and up); separate supports under the face hide the back.
  skin.setIndex(indices); skin.computeVertexNormals();
  mesh(g,skin,0xf2ae00,[0,0,0]);
  const wall=new T.Shape();
  wall.moveTo(-2.415,.26);wall.lineTo(-1.91,.83);wall.lineTo(-1.54,.955);
  wall.quadraticCurveTo(-1.42,.62,-1.47,.42);wall.quadraticCurveTo(-1.54,.19,-1.97,.19);
  wall.lineTo(-2.39,.19);wall.closePath();
  for(const sign of I){
    const thickness=.105,v=new T.ExtrudeGeometry(wall,{depth:thickness,steps:1,bevelEnabled:true,
      bevelSize:.025,bevelThickness:.024,bevelSegments:2,curveSegments:6});
    mesh(g,v,y,[sign===-1?-1.07:.965,0,0],[0,-Math.PI/2,0]);
    // Rotate maps local X to world +Z and local extrusion to -X, so offset to the outside face.
    g.children.at(-1).position.x+=.105;
  }
  box(g,y,[0,.278,-2.37],[2.12,.128,.135],.042);
  box(g,0xffc225,[0,.918,-1.533],[2.13,.09,.098],.035);
  box(g,0xdda11a,[0,.24,-1.88],[1.95,.080,.84],.044);
  for(let k=-2;k<=2;k++){
    box(g,0xffd230,[k*.42,.278,-2.41],[.251,.137,.24],.046,-.14);
    fastener(g,[k*.42,.354,-2.34],'y',.021);
  }
  seat(g,0,1.22,.24,.68);
}
function mixer(g){
  const b=C.blue, c=C.cream;
  frame(g,0,.55,0,1.48,3.72,b);
  cab(g,{z:-.99,y:.98,w:1.91,d:1.12,roof:2.48,c,trim:c});
  sculptedHood(g,{y:.952,z:-1.618,w:1.875,h:.617,d:.553,c,lip:0xfff1dd});
  profileSkin(g,[
    [0,.476,-1.952,.867,.105,.101,.038],
    [0,.546,-1.972,.993,.129,.130,.055],
    [0,.689,-1.967,.997,.132,.137,.056],
    [0,.753,-1.921,.930,.125,.126,.056],
  ],b,'paint',true,true);
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
  const drum=[[-1.05,.34],[-.84,.60],[-.52,.78],[-.13,.83],[.26,.78],[.62,.65],[.89,.43],[1.04,.29]];
  const curve=new T.CatmullRomCurve3(drum.map(([h,r])=>new T.Vector3(r,h,0)),false,'centripetal');
  const bands=[0,.19,.39,.62,.82,1],segments=36,steps=5;
  for(let j=0;j<bands.length-1;j++){
    const profile=[],tangents=[];
    for(let k=0;k<=steps;k++){
      const t=T.MathUtils.lerp(bands[j],bands[j+1],k/steps),v=curve.getPoint(t);
      profile.push(new T.Vector2(v.x,v.y));
      tangents.push(curve.getTangent(t));
    }
    const lathe=new T.LatheGeometry(profile,segments),normals=lathe.getAttribute('normal');
    for(let i=0;i<=segments;i++){
      const phi=i/segments*Math.PI*2;
      // Use the complete curve tangent at seams so adjacent paint bands share normals.
      for(let k=0;k<=steps;k++){
        const d=tangents[k];
        normals.setXYZ(i*(steps+1)+k,d.y*Math.sin(phi),-d.x,d.y*Math.cos(phi));
      }
    }
    mesh(bucket,lathe,j%2?c:b,[0,0,0]);
  }
  cylinder(bucket,C.bright,[0,-1.057,0],.35,.33,.075,0,'steel',28);
  cylinder(bucket,0x595759,[0,1.072,0],.287,.313,.085,0,'steel',28);
  cylinder(bucket,C.ink,[0,1.117,0],.251,.251,.016);
  for(const s of I){
    box(g,0x57565b,[s*.787,.735,-.39],[.264,.16,.44],.069,0,'steel');
    box(g,0xf2d7b0,[s*.902,.928,.694],[.118,.119,1.32],.049);
  }
  rearGuard(g,{z:1.918,y:.66,w:1.62,c:0x3693b8});
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
  cab(g,{z:-1.03,y:.91,w:1.78,d:1.06,roof:2.34,c:p,trim:0xb95284,open:true,panel:true,rake:.23});
  sculptedHood(g,{y:.873,z:-1.599,w:1.93,h:.48,d:.47,c:p,lip:0xba4c7e});
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
  rearGuard(g,{z:1.781,y:.72,w:1.86,c:0x777379});
  box(g,0x65415a,[0,1.065,1.68],[1.72,.143,.18],.032);
  cylinder(g,0x5f4155,[0,1.13,1.24],.66,.64,.110,0,'steel',28);
  cylinder(g,p,[0,1.18,1.24],.57,.59,.20);
  for(let i=0;i<10;i++){
    const a=i*Math.PI/5;
    fastener(g,[.548*Math.sin(a),1.29,1.24+.548*Math.cos(a)],'y',.025);
  }
  box(g,p,[0,1.58,1.25],[.78,.61,.76],.10);
  for(const s of I)sidePin(g,s*.42,1.90,1.26,.153);
  // Closed trapezoid boom shell, rigid in the stowed position.
  profileSkin(g,[
    [0,2.369,.050,.230,1.597,.068,.071],
    [0,2.419,.059,.323,1.733,.086,.090],
    [0,2.646,.063,.333,1.751,.085,.100],
    [0,2.719,.071,.280,1.713,.073,.098],
    [0,2.746,.073,.243,1.658,.064,.076],
  ],y,'paint',true,true);
  box(g,0xfac93e,[0,2.57,-.77],[.47,.260,2.68],.055,.023);
  for(const z of [-1.48,-.89,-.30,.29,.88]){
    box(g,0xffd160,[0,2.751,z],[.58,.025,.050],.009);
  }
  box(g,C.metal,[0,2.53,-1.95],[.69,.42,.33],.061,0,'steel');
  box(g,0x56514f,[0,2.53,-2.117],[.56,.314,.028],.034,0,'steel');
  for(const side of I){
    box(g,0xe1a219,[side*.33,2.515,-.080],[.047,.185,1.73],.028);
    box(g,0x8d637c,[side*.91,.999,1.109],[.17,.105,.64],.052,0,'steel');
    fastener(g,[side*.353,2.531,-1.842],'x');
    sidePin(g,side*.437,1.90,1.26,.074,0x52414a);
  }
  seat(g,0,1.00,-.87,.68);
}
function diggerCup(g,x){
  // Cast back and scoop liner are separate curved surfaces. The cheeks close their real thickness.
  const profile=[[1.065,-2.028],[1.037,-1.936],[1.044,-1.797],[1.090,-1.708],
    [1.181,-1.660],[1.282,-1.652],[1.374,-1.679]];
  for(const outer of [false,true]){
    const vertices=[],uv=[],indices=[];
    for(const [i,[y,z]] of profile.entries()){
      const width=outer?.256:.239,dz=outer?.018:0,dy=outer?-.032:0;
      vertices.push(x-width,y+dy,z+dz,x+width,y+dy,z+dz);
      uv.push(0,i/6,1,i/6);
      if(i){
        const j=(i-1)*2;
        if(outer)indices.push(j,j+1,j+2,j+1,j+3,j+2);
        else indices.push(j,j+2,j+1,j+1,j+2,j+3);
      }
    }
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    geo.setIndex(indices);geo.computeVertexNormals();
    mesh(g,geo,outer?0x45464a:0x646268,[0,0,0],null,'steel');
  }
  const cheek=new T.Shape();
  cheek.moveTo(-2.051,1.040);cheek.lineTo(-1.994,1.184);
  cheek.quadraticCurveTo(-1.923,1.337,-1.699,1.407);
  cheek.quadraticCurveTo(-1.589,1.257,-1.641,1.128);
  cheek.quadraticCurveTo(-1.749,.974,-1.961,1.010);
  cheek.lineTo(-2.051,1.040);cheek.closePath();
  for(const side of I){
    const geo=new T.ExtrudeGeometry(cheek,{depth:.056,steps:1,curveSegments:6,
      bevelEnabled:true,bevelSegments:2,bevelSize:.014,bevelThickness:.013});
    mesh(g,geo,0x53535a,[x+side*.259+.027,0,0],[0,-Math.PI/2,0],'steel');
    sidePin(g,x+side*.295,1.265,-1.751,.063,0xaaa198);
  }
  box(g,0x636167,[x,1.064,-2.013],[.528,.063,.084],.026,-.18,'steel');
  for(const i of [-1,0,1])box(g,0x88847e,[x+i*.150,1.067,-2.068],[.094,.065,.111],.023,-.21,'steel');
}
function excavator(g){
  const q=C.mint;
  frame(g,0,.56,.12,1.50,3.16);
  cylinder(g,0x45474b,[0,.92,.23],.70,.76,.24,0,'steel',28);
  cylinder(g,0x34363a,[0,.847,.23],.781,.757,.066,0,'steel',28);
  box(g,0x72d9af,[0,1.902,1.183],[1.46,.096,.684],.043);
  rearGuard(g,{z:1.567,y:1.135,w:1.72,c:0x3b9e7b});
  box(g,q,[0,1.13,.17],[1.91,.36,2.76],.12);
  profileSkin(g,[
    [0,1.184,.949,.812,.618,.176,.133],
    [0,1.289,.949,.912,.704,.188,.191],
    [0,1.651,.963,.916,.696,.186,.199],
    [0,1.790,.942,.858,.665,.193,.195],
    [0,1.895,.910,.736,.564,.170,.166],
    [0,1.927,.917,.666,.504,.152,.152],
  ],q,'paint',true,true);
  cab(g,{x:.27,z:-.46,y:1.13,w:1.52,d:1.16,roof:2.64,c:C.cream,trim:q,rake:.151});
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
  for(const p of [a,b,d]){
    sidePin(g,p[0]-.193,p[1],p[2],.151);
    sidePin(g,p[0]-.224,p[1],p[2],.095,0xa59c8a);
    fastener(g,[p[0]-.253,p[1],p[2]],'x',.041);
  }
  tube(g,0x324138,[x+.145,1.43,.21],[x+.13,2.55,-.418],.028,'rubber');
  tube(g,0x324138,[x+.13,2.55,-.418],[x+.116,2.658,-.70],.028,'rubber');
  tube(g,0x324138,[x+.116,2.658,-.70],[x+.086,1.43,-1.68],.028,'rubber');
  diggerCup(g,x);
  seat(g,.27,1.22,-.28,.66);
}
function forklift(g){
  const b=C.cobalt;
  frame(g,0,.55,.12,1.45,2.82,b);
  profileSkin(g,[
    [0,.61,.124,.732,1.172,.129,.123],
    [0,.706,.128,.823,1.254,.115,.136],
    [0,.966,.118,.829,1.185,.135,.141],
    [0,1.038,.127,.759,1.113,.123,.128],
  ],b,'paint',true,true);
  profileSkin(g,[
    [0,.830,1.129,.730,.338,.160,.084],
    [0,.937,1.141,.823,.359,.150,.090],
    [0,1.303,1.144,.827,.364,.163,.104],
    [0,1.530,1.138,.774,.363,.167,.120],
    [0,1.636,1.106,.657,.329,.134,.103],
    [0,1.672,1.088,.589,.311,.120,.100],
  ],C.lime,'paint',true,true);
  box(g,0xc7d94c,[0,1.664,1.153],[1.210,.076,.498],.031);
  box(g,0x3a3b3d,[0,1.240,1.514],[1.122,.284,.055],.054,0,'matte');
  for(let k=0;k<3;k++)box(g,0x6b6b64,[0,1.166+k*.062,1.525],[.944,.022,.029],.012,0,'steel');
  rearGuard(g,{z:1.399,y:.738,w:1.540,c:0x4b4962});
  for(const s of I){
    for(const z of [-.43,.92])beam(g,C.ink,[s*.60,.94,z],[s*.66,2.47,z+.10],.105,.12,.043);
    archedFender(g,s*.83,.39,-.67,.40,.35,b);
    sideVents(g,s*.831,1.40,1.08);
  }
  box(g,C.ink,[0,2.49,-.29],[1.51,.13,.14],.059);
  box(g,C.ink,[0,2.49,.91],[1.51,.13,.14],.059);
  for(const side of I){
    box(g,0x4e5257,[side*.754,2.509,.312],[.092,.087,1.244],.043,0,'steel');
    box(g,0x333941,[side*.673,2.464,.289],[.082,.088,1.229],.037);
  }
  for(let k=-2;k<=2;k++)box(g,C.ink,[k*.30,2.527,.31],[.084,.082,1.26],.031);
  box(g,0x505159,[0,2.518,-.356],[1.385,.044,.061],.016,0,'steel');
  frontLights(g,-.366,2.49,.40,.23,.14);
  for(const s of I){
    box(g,0x4a4d53,[s*.40,1.50,-1.15],[.18,2.02,.23],.060);
    box(g,C.ink,[s*.29,1.43,-1.142],[.08,1.75,.135],.026);
    box(g,C.yellow,[s*.36,.55,-1.32],[.19,.61,.19],.044);
    box(g,C.yellow,[s*.36,.312,-1.77],[.208,.108,1.05],.040);
    box(g,0xe8ad20,[s*.36,.367,-2.011],[.126,.023,.455],.009);
    box(g,0x74757b,[s*.391,1.414,-1.283],[.054,1.486,.037],.019,0,'steel');
    tube(g,0x353134,[s*.273,1.733,-1.261],[s*.273,.614,-1.261],.022,'rubber');
    fastener(g,[s*.42,.861,-1.308],'z',.035);
    fastener(g,[s*.42,1.02,-1.329],'z',.034);
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
      const style=part.userData.finish;
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
