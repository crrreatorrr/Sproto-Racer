import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {assembly,surface,alloyReflections} from './kart-assembly.js';
import {kartDetail,lowDetail} from './kart-detail.js';
import {skipperAxles,skipperWheelWidth,skipperCabin as c,skipperMotor as motor,
  skipperDriver,skipperSection,skipperStations} from './skipper-layout.js';
import hullUrl from './assets/skipper-hull.webp';

import metalUrl from './assets/skipper-alloy.webp';
import shadowUrl from './assets/skipper-shadow.png';

const navy='#17314e',ivory='#f0e1bb',alloy='#a4a7a3',orange='#e36b16',ink='#232a2d';
let enamel,metal,rubber,glass;
function initMaterials(){
  if(enamel)return;
  enamel=new T.MeshPhysicalMaterial({vertexColors:true,roughness:.37,clearcoat:.47,side:T.DoubleSide});
  metal=new T.MeshStandardMaterial({vertexColors:true,metalness:.72,roughness:.36,side:T.DoubleSide});
  rubber=new T.MeshStandardMaterial({vertexColors:true,roughness:.88,side:T.DoubleSide});
  glass=new T.MeshPhysicalMaterial({color:'#99cbd4',transparent:true,opacity:.21,roughness:.13,
    depthWrite:false,side:T.DoubleSide,forceSinglePass:true});
}
const templates=[];
let finishes;

function strip(p,rows,mat,color,uv){
  const n=rows[0].length,indices=[];
  for(let i=1;i<rows.length;i++)for(let j=1;j<n;j++){
    const a=(i-1)*n+j-1,b=i*n+j-1;indices.push(a,b,a+1,b,b+1,a+1);
  }
  p.add(surface(rows.flat(),indices,uv),mat,color);
}
function rail(p,points,r,color=alloy,mat=metal){
  const curve=new T.CatmullRomCurve3(points.map(pt=>new T.Vector3(...pt)));
  p.add(new T.TubeGeometry(curve,Math.max(14,points.length*5),r,8,false),mat,color);
}
function hull(p,painted,plating){
  const profiles=skipperStations;
  for(const side of [-1,1]){
    const lines=profiles.map(row=>skipperSection(row,side));
    const alloyUV=profiles.flatMap(([z])=>[0,.77,1].map(v=>[(1.7-z)/3.98,v]));
    strip(p,lines.map(row=>row.slice(0,3)),plating,null,alloyUV);
    const bottom=side>0?.5:0;
    const uv=profiles.flatMap(([z])=>[[(1.7-z)/3.98,bottom+.003],[(1.7-z)/3.98,bottom+.497]]);
    strip(p,lines.map(row=>row.slice(2,4)),painted,null,uv);
    strip(p,lines.map(row=>row.slice(3)),enamel,ivory);
    rail(p,lines.map(row=>row[4]),.013,'#aaa89a');
    // Spray rails and flush rivets pick out the aluminum bottom at grazing angles.
    rail(p,lines.slice(1).map(row=>row[0].map((v,i)=>v*.26+row[1][i]*.74)),.014,'#c3c4bd');
    for(const row of lines.slice(1)){
      const [x,y,z]=row[2];p.pipe(alloy,[x,y-.034,z],[x+side*.012,y-.034,z],.014,metal,.012,8);
    }
    const inner=lines.map(row=>[row[5],[row[5][0]*.88,row[5][1]+.007,row[5][2]]]);
    strip(p,inner,enamel,ivory);
    strip(p,inner.slice(5).map(([,[x,y,z]])=>[[x,y,z],[x*.91,1.005,z]]),enamel,'#bdb49a');
  }
  function cap(index){
    const a=skipperSection(profiles[index],1),b=skipperSection(profiles[index],-1);
    strip(p,[[a[0],a[1],a[2]],[b[0],b[1],b[2]]],metal,alloy);
    strip(p,[[a[2],a[3]],[b[2],b[3]]],enamel,navy);
    strip(p,[[a[3],a[5]],[b[3],b[5]]],enamel,ivory);
  }
  cap(0);cap(profiles.length-1);
  // Raised foredeck runs continuously to the center stem. Aft stays open.
  const foredeck=profiles.slice(0,6).map(([z,w,y])=>
    [[-w*.89,y,z],[-.56*w,y+.021,z],[0,y+.041,z],[.56*w,y+.021,z],[w*.89,y,z]]);
  strip(p,foredeck,enamel,ivory);
  // Flush inlaid stripes follow the crown of the deck and converge at the stem.
  for(const side of [-1,1]){
    strip(p,profiles.slice(0,6).map(([z,w,y])=>[[side*.34*w,y+.031,z],[side*.49*w,y+.026,z]]),enamel,'#418a8d');
    strip(p,profiles.slice(0,6).map(([z,w,y])=>[[side*.50*w,y+.025,z],[side*.53*w,y+.024,z]]),enamel,navy);
  }
  // Nonslip inspection hatch with recessed latch and twin hinge leaves.
  p.box('#b1aa95',[0,1.616,-1.22],[.62,.033,.53],.016,.112,metal);
  p.box('#d2c8ac',[0,1.635,-1.22],[.56,.015,.465],.007,.112,enamel);
  for(let i=-3;i<=3;i++)p.box('#b7ad93',[i*.061,1.650,-1.23],[.010,.008,.30],.003,.112);
  for(const x of [-.19,.19])p.box(alloy,[x,1.646,-1.025],[.085,.022,.052],.007,.112,metal);
  p.box(ink,[0,1.659,-1.40],[.105,.022,.039],.01,0,metal);
  const stem=skipperSection(profiles[0],1).map(([,y,z])=>[0,y,z-.009]);
  rail(p,stem,.030,'#ceccc1');
  rail(p,[[-.08,1.71,-2.24],[0,1.738,-2.28],[.08,1.71,-2.24]],.027);
  for(const side of [-1,1]){
    // Polished cleats on small bronze backing plates.
    const x=side*.77,z=-.96;
    p.box('#a18a65',[x,1.56,z],[.085,.019,.191],.009,0,metal);
    p.pipe(alloy,[x,1.56,z],[x,1.614,z],.023,metal);
    p.pipe(alloy,[x,1.612,z-.104],[x,1.612,z+.104],.021,metal);
    rail(p,[[side*.69,1.58,-1.29],[side*.64,1.725,-1.38],[side*.53,1.755,-1.60],
      [side*.30,1.76,-1.92],[side*.27,1.68,-1.97]],.022);
    rail(p,[[side*.92,1.45,.91],[side*.92,1.57,.98],[side*.84,1.55,1.50],[side*.83,1.42,1.56]],.019);
  }
  p.box('#828883',[0,1.00,.41],[1.64,.09,2.54],.05,0,metal);
  for(let i=-6;i<=6;i++)p.box('#a8aaa1',[i*.115,1.052,1.18],[.017,.009,.66],.004,0,metal);
  p.box(ivory,[0,1.23,1.65],[1.70,.36,.098],.036,0,enamel);
}
function pilothouse(p){
  const pane=(rows)=>strip(p,rows,glass);
  for(const side of [-1,1]){
    const xyz=(x,y,z)=>[side*x,y,z];
    const base=xyz(c.halfWidth,c.sill,c.front),top=xyz(.74,c.roofBottom,-.44);
    const back=xyz(.83,c.sill,c.rear),backTop=xyz(.72,c.roofBottom,.81);
    // Wide windshield and open side lights keep the pilot visible from either side.
    strip(p,[[base,xyz(.81,c.sill,c.front+.16)],[top,xyz(.74,c.roofBottom,-.355)]],enamel,ivory);
    strip(p,[[xyz(.83,c.sill,.59),back],[xyz(.72,c.roofBottom,.65),backTop]],enamel,ivory);
    p.pipe(ink,base,top,.037,rubber);
    p.pipe('#b8ac92',back,backTop,.030,metal);
    rail(p,[base,xyz(.87,c.sill+.022,-.25),xyz(.85,c.sill+.004,.42),back],.035,ivory,enamel);
    p.box('#34424a',xyz(.858,1.526,-.055),[.06,.058,.148],.022);
    p.box(side<0?'#e84c3c':'#45bc90',xyz(.883,1.547,-.055),[.031,.055,.10],.015,0,enamel);
    const mid=[0,c.sill+.04,c.front-.063],midTop=[0,c.roofBottom,-.52];
    pane([[base,mid],[top,midTop]]);
    p.pipe(ink,base,mid,.024,rubber);p.pipe(ink,top,midTop,.024,rubber);
    p.pipe(ink,xyz(.53,1.59,-.755),xyz(.37,1.99,-.69),.009,rubber);
    p.pipe(ink,xyz(.32,1.93,-.705),xyz(.54,2.08,-.67),.012,rubber);
  }
  p.pipe(ink,[0,c.sill+.04,c.front-.063],[0,c.roofBottom,-.52],.022,rubber);
  // A lightly crowned, flared roof with a recessed dark liner and a polished gutter.
  const roofRows=[[-.60,.68],[-.55,.87],[-.43,c.roofWidth],[.78,c.roofWidth],[.99,.82],[1.025,.70]];
  const roof=roofRows.map(([z,w])=>[[-w,c.roofBottom+.016,z],[-w*.95,2.714,z],[-w*.68,2.755,z],[0,c.roofTop,z],
    [w*.68,2.755,z],[w*.95,2.714,z],[w,c.roofBottom+.016,z]]);
  strip(p,roof,enamel,navy);
  for(const side of [-1,1]){
    // Two enamel bands track the roof shoulder. Positions interpolate the actual roof panels.
    const rows=roofRows.map(([z,w])=>[.70,.83,.85].map(t=>{
      const y=2.755+(2.714-2.755)*(t-.68)/(.95-.68);
      return [side*w*t,y+.002,z];
    }));
    strip(p,rows.map(r=>r.slice(0,2)),enamel,'#3b8f95');
    strip(p,rows.map(r=>r.slice(1)),enamel,'#e2ce9b');
  }
  strip(p,roof.map(row=>[row[0],row.at(-1)]),rubber,'#303a3d');
  for(const row of [roof[0],roof.at(-1)])strip(p,[row,row.map(([x,,z])=>[x,c.roofBottom+.016,z])],enamel,navy);
  for(const side of [-1,1])rail(p,roofRows.map(([z,w])=>[side*w,c.roofBottom+.025,z]),.012);
  rail(p,[[-.41,2.755,.28],[-.39,2.846,.27],[.39,2.846,.27],[.41,2.755,.28]],.017);
  p.pipe('#555f62',[-.55,2.735,.59],[-.58,2.83,.63],.032,metal,.021);
  p.pipe('#404d54',[-.58,2.83,.63],[-.62,3.08,.72],.009,metal,.004);
  const d=skipperDriver;
  p.box('#303a3f',[d.x,1.20,d.z+.09],[.70,.14,.61],.06);
  p.box('#454e4e',[d.x,1.46,d.z+.43],[.72,.56,.12],.055,.14);
  for(let i=-2;i<=2;i++)p.box('#5f6b69',[d.x+i*.114,1.43,d.z+.352],[.096,.32,.035],.016,.14);
  for(const side of [-1,1])p.box('#536061',[d.x+side*.32,1.29,d.z+.13],[.095,.15,.48],.044);
  p.box(ivory,[0,1.43,-.59],[1.49,.23,.23],.04);
  p.box(ink,[.24,1.48,-.461],[.53,.125,.041],.014);
  for(const x of [.10,.24,.38]){
    p.pipe(alloy,[x,1.48,-.441],[x,1.48,-.43],.049,metal,.049,18);
    p.pipe('#173744',[x,1.48,-.43],[x,1.48,-.428],.039,enamel,.039,18);
    p.pipe(ivory,[x,1.48,-.424],[x+.013,1.502,-.424],.004,enamel);
  }
}
function suspension(p){
  for(const side of [-1,1])for(const [z,r] of skipperAxles){
    const pt=(x,y,offset=0)=>[side*x,y,z+offset];
    for(const off of [-.16,.16]){
      p.pipe(orange,pt(.72,.89,off),pt(1.015,r+.055),.072,enamel,.064);
      p.pipe('#626a6b',pt(.725,.89,off-.065),pt(.725,.89,off+.065),.089,metal);
    }
    // Color the pressed leading arm and its bushing where they emerge beside the tire.
    const arm=[pt(.89,.99,-.26),pt(.93,.98,-.35),pt(1.0,.72,-.41),pt(1.015,.68,-.31)];
    strip(p,[arm,arm.map(([x,y,z])=>[x+side*.053,y,z])],enamel,orange);
    p.add(surface(arm,[0,1,2,0,2,3]),enamel,orange);
    p.add(surface(arm.map(([x,y,z])=>[x+side*.053,y,z]),[0,1,2,0,2,3]),enamel,'#f3872e');
    p.pipe(orange,pt(.90,.955,-.30),pt(1.0,.955,-.30),.066,enamel);
    p.pipe(alloy,pt(1.0,.955,-.30),pt(1.027,.955,-.30),.039,metal,.034,6);
    const a=new T.Vector3(...pt(.75,1.10,.135)),b=new T.Vector3(...pt(.985,r+.095,-.06));
    const axis=b.clone().sub(a).normalize(),u=new T.Vector3(0,0,1).cross(axis).normalize(),v=axis.clone().cross(u);
    p.pipe(alloy,a.toArray(),b.toArray(),.045,metal);
    // From the switch distance the spring reads as its damper: the coil is left out.
    if(lowDetail())continue;
    const coil=Array.from({length:91},(_,i)=>{
      const t=i/90,angle=t*12*Math.PI;
      return a.clone().lerp(b,.08+.77*t).addScaledVector(u,.069*Math.cos(angle)).addScaledVector(v,.069*Math.sin(angle));
    });
    p.add(new T.TubeGeometry(new T.CatmullRomCurve3(coil),96,.014,6,false),metal,alloy);
  }
}
function outboard(p){
  const {z,y}=motor;
  p.box('#364044',[0,1.26,1.77],[.39,.46,.14],.048,.12);
  p.pipe(alloy,[-.24,1.31,1.90],[.24,1.31,1.90],.070,metal);
  p.box('#47515a',[0,1.21,2.02],[.17,.67,.16],.042,-.47,metal);
  p.box('#48565f',[0,1.04,2.115],[.46,.048,.28],.019,-.27,metal);
  p.box('#334351',[0,y,z],[.59,.61,.66],.115,-.29,metal);
  p.box('#657680',[0,y+.178,z-.059],[.553,.32,.63],.10,-.29,metal);
  for(const side of [-1,1]){
    const x=side*.298;
    strip(p,[[[x,1.62,1.78],[x,1.66,1.79]],[[x,1.73,2.17],[x,1.77,2.17]]],enamel,'#cfdbda');
    strip(p,[[[x,1.575,1.79],[x,1.604,1.80]],[[x,1.685,2.17],[x,1.719,2.165]]],enamel,'#3b968e');
    for(let i=0;i<4;i++)p.box(ink,[side*.298,1.80-i*.037,2.09+i*.009],[.016,.017,.115],.006,-.29);
  }
  // Rear shell faces the chase camera. A two-tone service panel sits above the intake.
  p.box('#22666d',[0,1.74,2.295],[.43,.122,.036],.016,-.29,enamel);
  p.box('#e9b676',[0,1.695,2.319],[.423,.017,.026],.006,-.29,enamel);
  p.box('#233746',[0,1.643,2.296],[.37,.132,.047],.016,-.29);
  for(let j=0;j<4;j++)p.box('#99aaa9',[0,1.599+j*.029,2.324-j*.008],[.315,.011,.016],.004,-.29,metal);
  p.pipe('#525b61',[0,.94,2.13],[0,.94,2.32],.084,metal,.060);
  for(let i=0;i<3;i++){
    const blade=new T.SphereGeometry(1,16,9).scale(.079,.146,.023).translate(.049,.115,0).rotateZ(i*2*Math.PI/3);
    p.add(blade,metal,'#809097',[0,.94,2.275]);
  }
}
function wheel(){
  const p=assembly(rubber),r=skipperAxles[0][1],w=skipperWheelWidth/2;
  function turn(profile,color,mat){
    const g=new T.LatheGeometry(profile.map(([x,y])=>new T.Vector2(y,x)),40);
    p.add(g,mat,color,[0,0,0],[0,0,-Math.PI/2]);
  }
  turn([[-w,.247],[-w,.333],[-.15,.398],[-.12,.431],[.12,.431],[.15,.398],[w,.333],[w,.247]],'#282a29',rubber);
  for(let i=0;i<24;i++)for(const side of [-1,1]){
    const a=(i+(side>0?.38:0))*2*Math.PI/24;
    const lug=new RoundedBoxGeometry(.162,.045,.076,1,.008).rotateY(side*.44).translate(side*.081,r-.024,0).rotateX(a);
    p.add(lug,rubber,i%4===0?'#41403b':'#343632');
  }
  p.pipe('#333a3c',[-.17,0,0],[.134,0,0],.249,rubber,.249,32);
  turn([[.123,.19],[.150,.231],[.172,.254],[.185,.250],[.187,.231],[.161,.208],[.144,.16]],'#b8b9b3',metal);
  turn([[.186,.238],[.190,.234],[.190,.222],[.181,.220]],'#cf792e',metal);
  p.pipe('#5e666b',[.126,0,0],[.15,0,0],.203,metal,.202,32);
  for(let i=0;i<7;i++){
    const a=i*2*Math.PI/7,y=.153*Math.cos(a),z=.153*Math.sin(a);
    p.pipe(ink,[.150,y,z],[.154,y,z],.042,rubber,.038,12);
    p.pipe(alloy,[.164,y*.58,z*.58],[.177,y*.58,z*.58],.014,metal,.014,6);
  }
  p.pipe('#a0a5a4',[.15,0,0],[.197,0,0],.092,metal,.070,20);
  return p.finish();
}
function sternDetails(p){
  // The lifebuoy and rope are readable from the chase camera, inside the motor's overhang.
  const x=-.52,y=1.25,z=1.725;
  p.add(new T.TorusGeometry(.154,.039,12,42),enamel,'#e57334',[x,y,z]);
  for(let i=0;i<4;i++){
    const a=i*Math.PI/2+.24;
    p.add(new T.TorusGeometry(.154,.040,10,5,.31),enamel,'#f5e5c3',[x,y,z+.002],[0,0,a]);
  }
  const rope=[];
  for(let i=0;i<=24;i++){
    const a=2*Math.PI*i/24,r=.20+.012*Math.sin(4*a);
    rope.push([x+r*Math.cos(a),y+r*Math.sin(a),z+.010]);
  }
  rail(p,rope,.008,'#d0b791',rubber);
  for(const xx of [.51,.72])rail(p,[[xx,1.42,1.61],[xx,1.455,1.68],[xx,1.39,1.75],[xx,.99,1.76]],.014);
  for(const yy of [1.075,1.234])p.pipe(alloy,[.51,yy,1.76],[.72,yy,1.76],.015,metal);
}
const contactPlane=new T.PlaneGeometry(3.35/1.32,5.22/2);
export function attachSkipper(body,wheels,shadow){
  if(!finishes){
    initMaterials();
    enamel.envMap=metal.envMap=glass.envMap=alloyReflections();
    const map=new T.TextureLoader().load(hullUrl);map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;
    const painted=new T.MeshPhysicalMaterial({map,roughness:.45,clearcoat:.35,envMap:enamel.envMap,side:T.DoubleSide});
    const alloyMap=new T.TextureLoader().load(metalUrl);
    alloyMap.colorSpace=T.SRGBColorSpace;alloyMap.anisotropy=8;
    const plating=new T.MeshStandardMaterial({map:alloyMap,roughness:.45,metalness:.45,envMap:metal.envMap,side:T.DoubleSide});
    finishes={painted,plating,shadow:new T.TextureLoader().load(shadowUrl)};
  }
  const built=templates[kartDetail()]??=(()=>{
    const p=assembly(rubber);
    hull(p,finishes.painted,finishes.plating);pilothouse(p);suspension(p);outboard(p);sternDetails(p);
    return {body:p.finish(),wheel:wheel()};
  })();
  function attach(group,parts,flip=false){
    for(const part of parts){
      const mesh=new T.Mesh(part.geometry,part.material);mesh.userData.sharedKartPart=true;
      if(flip)mesh.rotation.y=Math.PI;group.add(mesh);
    }
  }
  shadow.geometry=contactPlane;
  shadow.material.alphaMap=finishes.shadow;shadow.material.opacity=.90;
  attach(body,built.body);
  for(const axle of wheels)attach(axle,built.wheel,axle.position.x<0);
}
