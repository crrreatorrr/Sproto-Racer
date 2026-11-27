import * as T from 'three';
import {assembly,surface} from './kart-assembly.js';
import {kartDetail,lowDetail,once} from './kart-detail.js';
import {ironhideAxles,ironhideBumper,ironhideDriver,ironhideScreen,ironhideRoof,ironhideTireWidth} from './ironhide-layout.js';
import hardtopUrl from './assets/ironhide-hardtop.webp';
import wheelUrl from './assets/ironhide-wheel.webp';
import treadUrl from './assets/ironhide-tread.webp';
import contactUrl from './assets/ironhide-contact.png';
import surfaceUrl from './assets/ironhide-surface.webp';
import panelsUrl from './assets/ironhide-panels.webp';

let paint;
function initMaterials(){
  if(!paint)paint=new T.MeshStandardMaterial({vertexColors:true,metalness:.16,roughness:.79});
}
// Edge grime and hairline scratches give the upright pane a visible surface in both cameras.
function windshieldMaterial(){
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=384;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='rgba(165,188,190,.17)';ctx.fillRect(0,0,768,384);
  const dust=ctx.createRadialGradient(384,192,120,384,192,408);
  dust.addColorStop(0,'rgba(172,150,119,0)');dust.addColorStop(1,'rgba(172,150,119,.35)');
  ctx.fillStyle=dust;ctx.fillRect(0,0,768,384);
  let seed=307;
  const random=()=>(seed=seed*16807%2147483647)/2147483647;
  for(let i=0;i<710;i++){
    const x=random()*768,y=random()*384;
    ctx.strokeStyle='rgba(223,213,190,'+(.05+random()*.18)+')';
    ctx.beginPath();ctx.moveTo(x,y);
    const length=random()**8*45+1;ctx.lineTo(x+length*.70,y-length);ctx.stroke();
  }
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
  return new T.MeshBasicMaterial({map,transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true});
}
const olive='#5d513b',edge='#75614a',iron='#463d33',dark='#24221f',leather='#322d29';
const templates=[];
const contactPlane=new T.PlaneGeometry(2,2);
let contactMap;
export function ironhideShadow(shadow){
  if(!contactMap)contactMap=new T.TextureLoader().load(contactUrl);
  shadow.geometry=contactPlane;
  shadow.material.alphaMap=contactMap;
  shadow.material.opacity=.87;
  shadow.scale.set(1.77,2.43,1);
}

function makeBody(){
  const p=assembly(paint);
  const skin=once('ironhide:skin',()=>{
    const map=new T.TextureLoader().load(panelsUrl);
    map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;
    const bumpMap=new T.TextureLoader().load(surfaceUrl);
    bumpMap.anisotropy=8;
    return new T.MeshStandardMaterial({map,bumpMap,bumpScale:.011,metalness:.12,roughness:.76,side:T.DoubleSide});
  });
  // The hood, grille, doors and battered steel in this atlas come from the approved painting.
  function tileUV(tile){
    const u=(tile%2)*1024,v=Math.floor(tile/2)*256;
    return [[8,4],[1016,4],[1016,252],[8,252]].map(([x,y])=>[(u+x)/2048,1-(v+y)/2048]);
  }
  function face(tile,points,material=skin){
    p.add(surface(points,[0,1,2,0,2,3],tileUV(tile)),material);
  }
  const lens=once('ironhide:lens',()=>{
    const lit=skin.clone();lit.emissive.set('#ffac46');lit.emissiveMap=skin.map;lit.emissiveIntensity=.75;
    return lit;
  });
  function beam(a,b,r=.028,color=edge){p.pipe(color,a,b,r);}
  p.box(dark,[0,.54,.01],[2.04,.34,4.09],.05);
  p.box(olive,[0,.77,.63],[2.45,.16,2.88],.055);
  p.box(iron,[0,.94,-1.23],[2.12,.56,1.49],.055);
  const width=1.31;
  // The deck slopes back to the tall cowl. Its front lip overhangs the recessed lamps.
  p.box(olive,[0,1.328,-1.28],[2*width,.13,1.50],.045,-.083);
  face(0,[[width,1.461,-.535],[-width,1.461,-.535],[-width,1.337,-2.025],[width,1.337,-2.025]]);
  p.box(iron,[0,.96,-1.982],[2.55,.62,.09],.04);
  face(1,[[.65,1.245,-2.032],[-.65,1.245,-2.032],[-.65,.685,-2.032],[.65,.685,-2.032]]);
  // Cut a slotted grille with real depth and a dark radiator behind it.
  const grille=new T.Shape();
  grille.moveTo(-.64,-.252);grille.lineTo(.64,-.252);grille.lineTo(.64,.252);grille.lineTo(-.64,.252);grille.closePath();
  for(let i=-2;i<=2;i++){
    const x=i*.242,hole=new T.Path();
    hole.absellipse(x,0,.074,.209,0,Math.PI*2,true,0);
    grille.holes.push(hole);
  }
  const grilleMesh=new T.ExtrudeGeometry(grille,{depth:.026,bevelEnabled:true,bevelThickness:.009,bevelSize:.010,bevelSegments:2,curveSegments:6});
  const gp=grilleMesh.attributes.position,guv=grilleMesh.attributes.uv;
  const [[ul,vt],[ur],[,vb]]=tileUV(1);
  for(let i=0;i<gp.count;i++)guv.setXY(i,ul+(ur-ul)*(.5-gp.getX(i)/1.28),vb+(vt-vb)*(.5+gp.getY(i)/.504));
  p.add(grilleMesh,skin,null,[0,.961,-2.053]);
  for(let i=-2;i<=2;i++)p.box('#1d1c18',[i*.242,.962,-2.036],[.115,.375,.008],.035);
  face(6,[[-.13,1.00,-2.071],[-.73,1.02,-2.071],[-.70,.696,-2.071],[-.12,.71,-2.071]]);
  const bumper=ironhideBumper;
  p.box(iron,[0,.57,bumper.front+.12],[bumper.halfWidth*2,.30,.24],.035);
  face(10,[[1.14,.697,bumper.front-.001],[-1.14,.697,bumper.front-.001],[-1.14,.437,bumper.front-.001],[1.14,.437,bumper.front-.001]]);
  for(const side of [-1,1]){
    const x=side*.91;
    const left=x+.32,right=x-.32;
    face(side===1?8:9,[[left,1.285,-2.041],[right,1.285,-2.041],[right,.817,-2.041],[left,.817,-2.041]]);
    p.box(dark,[x,1.105,-2.04],[.57,.205,.065],.032);
    face(13,[[x+.224,1.165,-2.082],[x-.224,1.165,-2.082],[x-.211,1.055,-2.082],[x+.202,1.055,-2.082]],lens);
    p.add(new T.TorusGeometry(.091,.025,7,14).scale(.86,1,1),paint,edge,[side*.85,.53,-2.217]);
    p.box(iron,[side*.85,.644,-2.19],[.15,.10,.10]);
    // Short welded hood handles.
    p.pipe('#806a51',[side*.85-.088,.623,-2.213],[side*.85+.088,.623,-2.213],.032,paint,.032,12);
    const hx=side*1.01;
    beam([hx,1.45,-.97],[hx,1.52,-.95],.021);
    beam([hx,1.52,-.95],[hx,1.52,-.77],.021);
    beam([hx,1.52,-.77],[hx,1.45,-.75],.021);
    // A real open wheel well. The near front lip has a ragged, peeled-out metal edge.
    for(const [z] of ironhideAxles){
      const torn=side===-1&&z<0;
      const arch=[[-.68,.79],[-.56,1.11],[-.31,1.29],[.28,1.31],[.55,1.15],[.68,.84]];
      for(let i=1;i<arch.length;i++){
        const [za,ya]=arch[i-1],[zb,yb]=arch[i];
        const xa=side*(torn&&i===2?1.44:1.37),xb=side*(torn&&i===3?1.44:1.37);
        const lowerA=ya-(torn&&i===2?.135:.064),lowerB=yb-(torn&&i===4?.15:.065);
        face(z<0&&torn?4:5,[[side*1.02,ya,z+za],[side*1.02,yb,z+zb],[xb,yb,z+zb],[xa,ya,z+za]]);
        face(torn?4:5,[[xa,ya,z+za],[xb,yb,z+zb],[xb,lowerB,z+zb],[xa,lowerA,z+za]]);
        const upperA=[side*1.25,1.39,z+za],upperB=[side*1.25,1.39,z+zb];
        face(5,[upperA,upperB,[xb,yb,z+zb],[xa,ya,z+za]]);
        if(torn){
          const tip=[(xa+xb)/2-.018,(lowerA+lowerB)/2-(i===2?.094:.028),z+(za+zb)/2];
          const flap=surface([[xa,lowerA,z+za],[xb,lowerB,z+zb],tip],[0,1,2,2,1,0]);
          p.add(flap,paint,i===2?'#a39079':'#796d5f');
          beam([xa,lowerA,z+za],tip,.009,'#b7a391');
        }
      }
    }
    // The half doors stop below the character's shoulders.
    const doorX=side*1.18;
    p.box(olive,[doorX,.99,.055],[.12,.79,1.11],.038);
    face(2,[[side*1.243,1.38,-.483],[side*1.243,1.38,.59],[side*1.243,.603,.59],[side*1.243,.603,-.483]]);
    p.box(iron,[side*1.20,.55,.075],[.18,.105,1.18],.022);
    p.box(olive,[side*1.17,1.185,1.34],[.13,.405,1.43],.026);
    face(5,[[side*1.238,1.38,.64],[side*1.238,1.38,2.035],[side*1.238,1.00,2.035],[side*1.238,1.00,.64]]);
    beam([side*1.19,1.39,.64],[side*1.19,1.39,2.03],.023);
    face(14,[[side*1.247,.61,-.54],[side*1.247,.61,.64],[side*1.247,.49,.64],[side*1.247,.49,-.54]]);
    for(const z of [-.423,.499]){
      for(const y of [.69,1.29])p.pipe('#937c5c',[side*1.244,y,z],[side*1.254,y,z],.021,paint,.019,6);
    }
    p.box(iron,[side*1.255,1.228,.449],[.036,.092,.188],.016);
    p.box(dark,[side*1.276,1.221,.449],[.012,.049,.135],.01);
    const sx=side*Math.abs(ironhideDriver.x);
    p.box(leather,[sx,1.045,.26],[.74,.16,.71],.065);
    p.box(leather,[sx,1.42,.632],[.76,.87,.17],.065,.12);
    p.box(dark,[sx,1.87,.697],[.53,.315,.16],.062,.12);
    for(const dir of [-1,1]){
      p.box(leather,[sx+dir*.325,1.38,.57],[.105,.68,.22],.038,.12);
      beam([sx+dir*.254,1.11,.726],[sx+dir*.254,1.75,.799],.010,'#695448');
      p.box('#50453c',[sx+dir*.155,1.552,.725],[.036,.40,.022],.008,.12);
      p.box('#5b5144',[sx+dir*.212,1.45,.547],[.075,.65,.036],.013,.12);
      p.box(dark,[sx+dir*.187,1.844,.602],[.098,.077,.035],.019);
    }
  }
  p.box(dark,[0,1.23,-.49],[2.30,.38,.19],.035);
  p.box(olive,[0,1.00,1.41],[2.25,.09,1.22],.02);
  for(let i=-4;i<=4;i++)p.box(iron,[i*.225,1.053,1.43],[.042,.023,1.14],.007);
  p.box(olive,[0,1.14,2.04],[2.43,.51,.115],.025);
  face(11,[[-1.19,1.38,2.10],[1.19,1.38,2.10],[1.19,.90,2.10],[-1.19,.90,2.10]]);
  // Stamped tailgate, release handle, hinge barrels and light guards read in chase view.
  for(const y of [.997,1.225])p.box(edge,[0,y,2.111],[1.43,.036,.035],.012);
  p.box(dark,[0,1.296,2.123],[.27,.078,.037],.016);
  p.box(edge,[0,1.31,2.144],[.208,.025,.023],.009);
  p.box(iron,[0,.72,2.10],[2.34,.22,.18],.035);
  for(const side of [-1,1]){
    p.box(dark,[side*1.00,1.15,2.111],[.24,.18,.052],.025);
    p.box('#b44429',[side*1.00,1.15,2.141],[.18,.11,.024],.013);
    for(const y of [1.128,1.170])p.box(iron,[side*1.00,y,2.157],[.198,.012,.011],.002);
    p.box(edge,[side*.78,.968,2.111],[.16,.153,.042],.009);
    beam([side*.78-.095,.923,2.15],[side*.78+.095,.923,2.15],.028);
    p.box('#39342d',[side*1.12,.58,1.938],[.44,.38,.045],.015,.1);
    for(const x of [-.135,.135])p.pipe(edge,[side*1.12+x,.725,1.956],[side*1.12+x,.725,1.985],.018,paint,.018,6);
  }
  const w=ironhideScreen;
  const corners=[[-w.halfWidth,w.bottom,w.baseZ],[w.halfWidth,w.bottom,w.baseZ],
    [w.halfWidth,w.top,w.topZ],[-w.halfWidth,w.top,w.topZ]];
  p.add(surface(corners,[0,1,2,0,2,3],[[0,0],[1,0],[1,1],[0,1]]),once('ironhide:windshield',windshieldMaterial));
  const center=new T.Vector3(0,(w.top+w.bottom)/2,(w.baseZ+w.topZ)/2);
  const glassEdge=corners.map(c=>new T.Vector3(...c).lerp(center,.034).toArray());
  for(let i=0;i<4;i++){
    beam(corners[i],corners[(i+1)%4],.039,edge);
    beam(glassEdge[i],glassEdge[(i+1)%4],.018,'#322f28');
  }
  for(const side of [-1,1]){
    for(let i=0;i<6;i++){
      const x=side*(.13+.186*i);
      p.pipe('#b09a76',[x,w.top,w.topZ-.036],[x,w.top,w.topZ-.043],.012,paint,.011,6);
    }
    p.box(iron,[side*1.125,1.466,-.55],[.18,.074,.14],.011);
  }
  for(const side of [-1,1])for(let i=0;i<3;i++){
    const f=.06+i*.44;
    p.box(edge,[side*w.halfWidth,w.bottom+(w.top-w.bottom)*f,w.baseZ+(w.topZ-w.baseZ)*f-.029],[.04,.04,.025],.006);
  }
  const roof=ironhideRoof,midZ=(roof.front+roof.rear)/2,depth=roof.rear-roof.front;
  const thickness=roof.top-roof.bottom;
  p.box('#5c5944',[0,roof.bottom+thickness/2,midZ],[2*roof.halfWidth,thickness,depth],.040);
  const roofPaint=once('ironhide:roof',()=>{
    const roofMap=new T.TextureLoader().load(hardtopUrl);
    roofMap.colorSpace=T.SRGBColorSpace;roofMap.anisotropy=8;
    return new T.MeshStandardMaterial({map:roofMap,roughness:.81,metalness:.12});
  });
  const top=new T.PlaneGeometry(2*roof.halfWidth-.09,depth-.09).rotateX(-Math.PI/2);
  p.add(top,roofPaint,null,[0,roof.top+.001,midZ]);
  for(const side of [-1,1]){
    const x=side*roof.postX;
    p.box(iron,[x,(roof.bottom+roof.postBase)/2,roof.postZ],
      [roof.postHalf*2,roof.bottom-roof.postBase,roof.postHalf*2],.014);
    p.box(edge,[x,roof.postBase+.025,roof.postZ],[.13,.056,.17],.009);
    for(const offset of [.54,.92]){
      p.box('#595842',[side*offset,roof.top+.005,midZ],[.058,.024,depth-.22],.011);
    }
    for(const z of [roof.front+.10,midZ,roof.rear-.10]){
      const boltX=side*(roof.halfWidth-.09);
      p.pipe('#8a8067',[boltX,roof.top,z],[boltX,roof.top+.010,z],.022,paint,.022,6);
    }
  }
  return p.finish();
}

function makeWheel(){
  const p=assembly(paint),r=ironhideAxles[0][1],w=ironhideTireWidth/2;
  const profile=[[-w,.78],[-w,.85],[-w*.85,.93],[w*.85,.93],[w,.85],[w,.78]];
  p.add(new T.LatheGeometry(profile.map(([x,k])=>new T.Vector2(r*k,x)),48).rotateZ(-Math.PI/2),paint,'#18191a');
  const rubber=once('ironhide:tread',()=>{
    const map=new T.TextureLoader().load(treadUrl);
    map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;
    const tread=new T.MeshStandardMaterial({map,roughness:.92,bumpMap:map,bumpScale:.006});
    // From the switch distance the tread print is a flat dark rubber.
    tread.userData.distant={color:'#1d1e1f'};
    return tread;
  });
  const wallPaint=once('ironhide:sidewall',()=>{
    const sidewall=new T.TextureLoader().load(wheelUrl);
    sidewall.colorSpace=T.SRGBColorSpace;sidewall.anisotropy=8;
    return new T.MeshStandardMaterial({map:sidewall,roughness:.83,metalness:.08,side:T.DoubleSide});
  });
  // Three staggered tread rows with chamfered block corners and shoulder lugs.
  // The distant build carries half as many lugs, each twice as long around the tire.
  const low=lowDetail(),lugs=low?12:24,turns=low?24:48;
  for(let i=0;i<lugs;i++)for(const row of [-1,0,1]){
    const angle=(i+(row===0?.33:row>0?.58:0))*2*Math.PI/lugs;
    const lug=(low?new T.BoxGeometry(1.7,.052,1.5):new T.CylinderGeometry(1,1,.052,6)).scale(.121,1,low?.17:.085)
      .rotateY(row<0?-.4:.4).translate(row*.14,r-.029,0).rotateX(angle);
    p.add(lug,rubber);
  }
  p.pipe('#161819',[-w,0,0],[w,0,0],r*.81,paint,r*.81,48);
  function hoop(radius,tube,x,color){
    const g=new T.TorusGeometry(radius,tube,6,48).rotateY(Math.PI/2);
    p.add(g,paint,color,[x,0,0]);
  }
  for(let i=0;i<lugs;i++){
    const a=i*2*Math.PI/lugs;
    const shoulder=(low?new T.BoxGeometry(1.7,.039,1.5):new T.CylinderGeometry(1,1,.039,5)).scale(.059,1,low?.156:.078)
      .rotateZ(-1.12).translate(w-.002,r*.846,0).rotateX(a);
    p.add(shoulder,rubber);
  }
  // Carry the painted sidewall onto a dished surface, from rubber bead to steel rim.
  const dish=[[r*.87,w-.003],[r*.81,w+.012],[r*.58,w+.018],[r*.51,w+.026],[r*.45,w+.012],[r*.26,w+.018]];
  const pts=[],uv=[],indices=[];
  for(const [radius,x] of dish){
    for(let i=0;i<=turns;i++){
      const angle=i*2*Math.PI/turns,y=radius*Math.cos(angle),z=radius*Math.sin(angle);
      pts.push([x,y,z]);uv.push([.5+z/(r*1.76),.5+y/(r*1.76)]);
      if(pts.length>turns+1&&i){const j=pts.length-1;indices.push(j-turns-2,j-turns-1,j,j-turns-2,j,j-1);}
    }
  }
  p.add(surface(pts,indices,uv),wallPaint);
  hoop(r*.827,.012,w-.006,'#222426');
  hoop(r*.735,.009,w+.002,'#292b2c');
  p.pipe('#26292b',[w-.014,0,0],[w+.008,0,0],.332,paint,.332,36);
  hoop(.31,.018,w+.012,'#494c4e');
  p.pipe('#1b1e20',[w+.009,0,0],[w+.011,0,0],.281,paint,.281,32);
  p.pipe('#34383a',[w+.011,0,0],[w+.030,0,0],.204,paint,.164,24);
  p.pipe('#2f3335',[w+.031,0,0],[w+.046,0,0],.097,paint,.085,12);
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4,y=.247*Math.cos(a),z=.247*Math.sin(a);
    p.pipe('#17191a',[w+.011,y,z],[w+.014,y,z],.036,paint,.040,10);
    const by=.137*Math.cos(a+.18),bz=.137*Math.sin(a+.18);
    p.pipe('#676a6b',[w+.03,by,bz],[w+.044,by,bz],.024,paint,.022,6);
  }
  return p.finish();
}

export function attachIronhide(body,wheels){
  initMaterials();
  const built=templates[kartDetail()]??={body:makeBody(),wheel:makeWheel()};
  function attach(group,parts,flip=false){
    for(const {geometry,material} of parts){
      const mesh=new T.Mesh(geometry,material);
      mesh.userData.sharedKartPart=true;
      if(flip)mesh.rotation.y=Math.PI;
      group.add(mesh);
    }
  }
  attach(body,built.body);
  for(const axle of wheels)attach(axle,built.wheel,axle.position.x<0);
}
