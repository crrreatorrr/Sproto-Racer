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
    box(g,C.light,[s*x,y+.008,z-.091],[w*.81,h*.73,.015],.028,0,'light');
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
function cab(g,{x=0,z=-.76,y=1.0,w=1.78,d=1.20,roof=2.54,c=C.yellow,trim=c,open=false,panel=true}){
  const front=z-d*.5,back=z+d*.5,wend=x-w*.5,wplus=x+w*.5;
  box(g,c,[x,y-.12,z],[w,.27,d],.10);
  box(g,trim,[x,roof,z+.045],[w+.075,.16,d+.045],.082);
  // Painted visor lip and nested roof insert read as two pieces, but are one rigid assembly.
  box(g,trim,[x,roof+.088,z+.07],[w*.87,.060,d*.86],.028);
  for(const v of [wend+.09,wplus-.09]){
    const s=Math.sign(v-x);
    box(g,c,[v+s*.041,y+.170,z+.085],[.040,.25,d*.72],.026);
    box(g,0x4f4b48,[v+s*.070,y+.328,z+.29],[.040,.051,.161],.017,0,'steel');
    beam(g,c,[v,y+.10,front],[v,roof,front+.14],.14,.13,.042);
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
  box(g,y,[0,.97,-1.58],[1.81,.61,.51],.10);
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
  // Deep open bed: floor, flared sides and individually visible reinforcing ribs.
  box(g,0x4a4440,[0,1.29,.71],[1.38,.274,1.64],.082,0,'steel');
  for(const side of I)beam(g,0xa18d6c,[side*.46,.725,.21],[side*.46,1.178,.79],.160,.194,.055,'steel');
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
  box(g,red,[0,.88,.37],[1.65,.55,2.72],.13);
  box(g,red,[0,1.40,1.18],[1.66,.85,.99],.17);
  box(g,0xd4462d,[0,1.838,1.18],[1.23,.123,.727],.051);
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
  box(g,red,[0,2.62,.19],[1.79,.17,1.30],.087);
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
  box(g,y,[0,2.55,.06],[.65,.37,3.51],.091,.025);
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
function excavator(g){
  const q=C.mint;
  frame(g,0,.56,.12,1.50,3.16);
  cylinder(g,0x45474b,[0,.92,.23],.70,.76,.24,0,'steel',28);
  cylinder(g,0x34363a,[0,.847,.23],.781,.757,.066,0,'steel',28);
  box(g,0x72d9af,[0,1.902,1.183],[1.46,.096,.684],.043);
  rearGuard(g,{z:1.567,y:1.135,w:1.72,c:0x3b9e7b});
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
  for(const p of [a,b,d]){
    sidePin(g,p[0]-.193,p[1],p[2],.151);
    sidePin(g,p[0]-.224,p[1],p[2],.095,0xa59c8a);
    fastener(g,[p[0]-.253,p[1],p[2]],'x',.041);
  }
  tube(g,0x324138,[x+.145,1.43,.21],[x+.13,2.55,-.418],.028,'rubber');
  tube(g,0x324138,[x+.13,2.55,-.418],[x+.116,2.658,-.70],.028,'rubber');
  tube(g,0x324138,[x+.116,2.658,-.70],[x+.086,1.43,-1.68],.028,'rubber');
  for(const sign of I)box(g,0x6d6c63,[x+sign*.238,1.184,-1.8],[.045,.177,.37],.032,-.40,'steel');
  box(g,0x454044,[x,1.18,-1.80],[.47,.26,.48],.09,-.40);
  for(let k=-1;k<=1;k++)box(g,C.metal,[x+k*.14,1.08,-2.02],[.095,.10,.17],.027,-.37,'steel');
  seat(g,.27,1.22,-.28,.66);
}
function forklift(g){
  const b=C.cobalt;
  frame(g,0,.55,.12,1.45,2.82,b);
  box(g,b,[0,.83,.12],[1.66,.44,2.52],.10);
  box(g,C.lime,[0,1.23,1.145],[1.65,.86,.73],.17);
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
  for(let k=-2;k<=2;k++)box(g,C.ink,[k*.30,2.49,.31],[.075,.11,1.29],.033);
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
