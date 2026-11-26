import * as T from 'three';

// Static, visual-only terrain. Batches are cut into spatial cells rather than
// one race-wide mesh so the race camera can cull whole forests and rock faces.
const SNOW={
 ground:[0x9cbfd5,0xb9d9eb,0xd1e9f3,0xe2f2fa,0xf4faff], rock:[0x506985,0x6f8aa8,0x8babc0,0xa9c1d2,0xbfceda],
 pine:[0x153d50,0x204d5a,0x276171,0x3c747b,0x578785], frost:[0x93bcd4,0xb5d8e8,0xd0eaf4,0xf5fbff],
 cliff:[0x2f6c89,0x438eab,0x53a9bc,0x7dc8d8,0xa8d8e5,0xe0f0f9],
};
const ALPINE={
 ground:[0x475340,0x59654a,0x6d7754,0x81815a,0xa29668],rock:[0x444d51,0x5d5d59,0x73695d,0x90816c,0xb6a88f],
 pine:[0x20382f,0x2d4939,0x40543c,0x576d46,0x697b4c],frost:[0x728569,0x879578,0xa7a77c],
 cliff:[0x454c4f,0x555a56,0x6d6259,0x867360,0x9c8a72,0xc0ad8d],
};
const TAU=Math.PI*2, GROUND=-6.35, clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const pick=(xs,n)=>xs[Math.min(xs.length-1,Math.floor(n*xs.length))];
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
const pt=(x,y,z)=>[x,y,z];

function batches(group){
 const tiles=new Map(), ink=new Map();
 const worked=new T.Color(), coolShadow=new T.Color(0x83a9ce), warmSediment=new T.Color(0xc1a383);
 const mat=new T.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:.94,metalness:.01,side:T.DoubleSide});
 function bucket(p){const key=Math.floor(p[0]/340)+':'+Math.floor(p[2]/340);let v=tiles.get(key);
   if(!v){v={p:[],color:[]};tiles.set(key,v);}return v;}
 function painter(origin){
  const b=bucket(origin);
  function swatch(value){
   let v=ink.get(value);
   if(!v){v=new T.Color(value);ink.set(value,v);}
   return v;
  }
  const tri=(a,c,d,color,weather=0)=>{
   const tripled=Array.isArray(color);
   const rgb=swatch(tripled?color[0]:color);
   b.p.push(...a,...c,...d);
   if(!weather&&!tripled){
    for(let j=0;j<3;j++)b.color.push(rgb.r,rgb.g,rgb.b);
    return;
   }
   const slope=(a[0]-origin[0])*(a[2]-origin[2])*.00063;
   const light=Math.sin(slope+origin[0]*.014+origin[2]*.003)*.055;
   let i=0;
   for(const v of [a,c,d]){
    worked.copy(tripled?swatch(color[i++]):rgb);
    // A continuous world-coordinate wash keeps tessellation from reading like
    // random triangles and puts lavender/teal shadows against warm stone.
    const stain=Math.sin(v[0]*.061+v[2]*.019)*.5+.5;
    const dust=Math.sin(v[2]*.076-v[0]*.012+v[1]*.022)*.5+.5;
    if(weather===1)worked.lerp(coolShadow,.05+.14*stain*dust);
    else if(weather===2)worked.lerp(warmSediment,.06+.16*stain*dust);
    worked.multiplyScalar(.97+light+.145*stain-.075*dust);
    b.color.push(worked.r,worked.g,worked.b);
   }
  };
  return {tri, quad(a,c,d,e,color,weather){tri(a,c,d,color,weather);tri(a,d,e,color,weather);}};
 }
 function finish(){
  for(const [cell,{p,color}] of tiles){
   if(!p.length)continue;
   const g=new T.BufferGeometry();
   g.setAttribute('position',new T.Float32BufferAttribute(p,3));
   g.setAttribute('color',new T.Float32BufferAttribute(color,3));
   g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
   const m=new T.Mesh(g,mat);
   m.name='Biome scenery '+cell;
   group.add(m);
  }
  if(!group.children.length)mat.dispose();
 }
 return {painter,finish};
}

// Tests the complete circuit, not just the current local cross-section. Circle
// padding is conservative for irregular props, overlapping turns and ledges.
function routeGuard(core){
 const cells=new Map(), stride=8, bin=88, frame={};
 for(let s=0;s<core.length;s+=stride){
  core.evalFrame(s,frame);
  let half=s<180||s>core.length-28?Math.max(40,frame.width*.5):frame.width*.5;
  const lane=core.sky?.laneAt(s)??-1;
  if(lane>=0)half=Math.max(half,core.sky.lanes[lane].width*.5+8);
  const x=frame.centerX,z=frame.centerZ;
  const key=Math.floor(x/bin)+','+Math.floor(z/bin);
  if(!cells.has(key))cells.set(key,[]);
  cells.get(key).push([x,z,half]);
 }
 return (x,z,r=0,margin=6)=>{
  const n=r+70, a=Math.floor((x-n)/bin), b=Math.floor((x+n)/bin),
        c=Math.floor((z-n)/bin),d=Math.floor((z+n)/bin);
  for(let i=a;i<=b;i++)for(let j=c;j<=d;j++)for(const [cx,cz,half] of cells.get(i+','+j)??[]){
   if((x-cx)**2+(z-cz)**2<(half+r+margin)**2)return false;
  }
  return true;
 };
}
function at(core,s,x){const f={};core.evalFrame(s,f);return {
 x:f.centerX+f.rightX*x,z:f.centerZ+f.rightZ*x,y:f.centerY,w:f.width,
 rx:f.rightX,rz:f.rightZ,u:f.distance,
};}
function basis(o,lx,y,lz,yaw=0){
 const a=Math.cos(yaw),b=Math.sin(yaw);
 return [o[0]+lx*a-lz*b,o[1]+y,o[2]+lx*b+lz*a];
}
function box(p,o,w,h,d,color,yaw=0,roof=false){
 const q=(x,y,z)=>basis(o,x*w*.5,y*h,z*d*.5,yaw);
 const a=q(-1,0,-1),b=q(1,0,-1),c=q(1,0,1),e=q(-1,0,1);
 const f=q(-1,1,-1),g=q(1,1,-1),i=q(1,1,1),j=q(-1,1,1);
 p.quad(a,b,g,f,color);p.quad(b,c,i,g,color);p.quad(c,e,j,i,color);p.quad(e,a,f,j,color);
 if(!roof)p.quad(f,g,i,j,color);
 return {f,g,i,j,q};
}
function loaf(batch,o,rx,rz,h,palette,random,mode='mound',yaw=0,weather=0){
 const p=batch.painter(o);
 const small=Math.max(rx,rz)<9;
 const n=mode==='ridge'?(small?9:11):mode==='ice'?(small?8:9):10;
 const phase=random()*TAU;
 const jitter=Array.from({length:n},()=>.78+random()*.23);
 const yJ=Array.from({length:n},()=>random()-.5);
 // A ledge is modeled as a shallow shoulder followed by a sharp recessed face.
 // Do not uniformly subdivide the distant silhouette: spend on the two contours
 // that hold the stratum shadow when the light slides across the formation.
 const rings=mode==='ridge'?(small?[[1,0],[.89,.19],[.83,.34],[.70,.39],[.49,.60],[.23,.91]]:
      [[1,0],[.90,.208],[.83,.32],[.70,.365],[.60,.51],[.48,.61],[.22,.89]])
   :mode==='ice'?(small?[[1,0],[.90,.22],[.71,.46],[.49,.78],[.18,.96]]:
      [[1,0],[.92,.14],[.78,.29],[.61,.53],[.43,.77],[.18,.96]])
   :[[1,0],[.91,.19],[.73,.52],[.43,.82],[.22,.955]];
 const shifts=Array.from({length:rings.length},(_,i)=>[(random()-.5)*rx*.27*i/rings.length,(random()-.5)*rz*.38*i/rings.length]);
 const R=rings.map(([s,y],r)=>jitter.map((v,i)=>{
  const base=i/n*TAU;
  const a=base+(mode==='mound'?r*.055:r*.031);
  const slip=Math.sin(base*2+phase)*(.065+(mode==='ridge'?.025:0));
  const frost=mode==='ice'?.048:mode==='ridge'?.058:.04;
  const run=s*(v+Math.sin(base*3+phase)*frost*(r>0?1:0));
  const dh=r===0?0:yJ[i]*(mode==='ridge'?.20:.14)+slip*Math.min(1,r*.6);
  return basis(o,Math.cos(a)*rx*run+shifts[r][0],h*(y+dh),Math.sin(a)*rz*run+shifts[r][1],yaw);
 }));
 const last=palette.length-1;
 const color=(r,az,extra=0)=>{
  const course=r/(rings.length-1), face=Math.sin(az/n*TAU+yaw+1.25);
  let l=course*(last+.7)+face*.66+extra;
  if(mode==='ridge'&&(r===2||r===4))l-=.89;
  if(mode==='ice'&&(az%6===2||az%6===3))l-=.52;
  return palette[clamp(Math.round(l),0,last)];
 };
 for(let r=0;r<R.length-1;r++)for(let i=0;i<n;i++){
  const j=(i+1)%n,a=R[r][i],b=R[r][j],c=R[r+1][j],d=R[r+1][i];
  if(mode==='ridge'&&(r===2||r===4)){
   p.tri(a,b,c,color(r,i,-.52),weather);p.tri(a,c,d,color(r,i,-.19),weather);
  }else if(mode==='ice'&&(i+r)%5===1){
   const strata=[color(r,i,-.3),color(r,j,.05),color(r+1,j,.15)];
   p.tri(a,b,c,strata,weather);p.tri(a,c,d,[strata[0],strata[2],color(r+1,i,.18)],weather);
  }else{
   p.tri(a,b,c,[color(r,i),color(r,j),color(r+1,j)],weather);
   p.tri(a,c,d,[color(r,i),color(r+1,j),color(r+1,i)],weather);
  }
 }
 const summit=basis(o,shifts.at(-1)[0]+Math.sin(phase)*rx*.075,h*(mode==='mound'?1:1.07),shifts.at(-1)[1],yaw);
 for(let i=0;i<n;i++)p.tri(R.at(-1)[i],R.at(-1)[(i+1)%n],summit,palette.at(-1),weather);
 return {top:summit[1]};
}
function fir(batch,o,h,r,pal,random,snow,detail=false){
 const p=batch.painter(o),a=random()*TAU, lean=(random()-.5)*r*.85, bend=(random()-.5)*r*.55;
 box(p,o,r*.29,h*.52,r*.32,snow?0x574b50:0x4d3b34,a);
 const tiers=snow?4:3,n=6;
 const branchReach=Array.from({length:n},()=>.82+random()*.23);
 for(let t=0;t<tiers;t++){
  const y=h*(.23+t*(snow?.150:.208)), width=r*(1-t*(snow?.177:.248));
  const angle=a+t*.49, rise=h*(detail?.40:.37);
  const tip=pt(o[0]+lean*(t+1)/tiers,o[1]+Math.min(h,y+rise),o[2]+bend*(t+1)/tiers);
  const ring=branchReach.map((factor,i)=>{
   const phase=angle+i/n*TAU, rr=width*factor*(.94+random()*.125);
   return pt(o[0]+Math.cos(phase)*rr+lean*t*.12,o[1]+y+(random()-.54)*h*.064,o[2]+Math.sin(phase)*rr+bend*t*.12);
  });
  // High-detail trees have a turned-under skirt and a broader crown shoulder
  // rather than dark paper cones. A mixed frost skirt exposes a natural
  // irregular evergreen edge around the sculpted top facets.
  const crown=(detail||snow)?ring.map((v,i)=>v.map((x,k)=>lerp(x,tip[k],detail?.26+(i%3)*.09:.46+(i%3)*.06))):null;
  const lip=detail?ring.map(([x,y,z])=>[lerp(x,o[0],.09),y-h*.061,lerp(z,o[2],.09)]):null;
  for(let i=0;i<n;i++){
   const j=(i+1)%n,C=pal.pine[(t+i)%pal.pine.length];
   const dark=pal.pine[(i+t+3)%pal.pine.length];
   if(crown&&detail){
    p.quad(ring[i],ring[j],crown[j],crown[i],C,snow?1:2);
    const frosted=snow&&((i+2*t)%5!==0||t===tiers-1);
    p.tri(crown[i],crown[j],tip,frosted?[pal.frost[(t+i)%pal.frost.length],pal.frost[(t+j+1)%pal.frost.length],pal.frost.at(-1)]:[C,dark,pal.pine.at(-1)],snow?1:2);
    if(lip&&i%2===0)p.quad(lip[i],lip[j],ring[j],ring[i],pal.pine[0]);
   }else{
    p.tri(ring[i],ring[j],tip,[C,dark,pal.pine.at(-1)],snow?1:2);
    if(snow&&((i+2*t)%5!==0||t===tiers-1)){
     const A=crown[i].slice(),B=crown[j].slice(),D=tip.slice();
     A[1]+=.06;B[1]+=.06;D[1]+=.06;
     p.tri(A,B,D,[pal.frost[(i+t)%pal.frost.length],pal.frost[(j+t)%pal.frost.length],pal.frost.at(-1)],1);
    }
   }
  }
 }
}
function surfaceFragments(batch,x,y,z,span,yaw,palette,random,snow){
 const o=[x,y,z],p=batch.painter(o),weather=snow?1:2;
 const detailCount=2+Math.floor(random()*3);
 for(let n=0;n<detailCount;n++){
  const az=random()*TAU,d=span*(.28+random()*.52),s=.21+random()*.48;
  const center=basis(o,Math.sin(az)*d,-.10,Math.cos(az)*d,yaw);
  const ink=pick(snow?palette.cliff:palette.rock,random()*.81);
  if(snow){
   const a=basis(center,-s,.01,-.5*s,yaw),b=basis(center,s,.04,-.47*s,yaw),c=basis(center,.37*s,.02,s,yaw);
   const peak=basis(center,.25*s,.22+s*.86,.18*s,yaw);
   p.tri(a,b,peak,ink,weather);p.tri(b,c,peak,palette.cliff[3],weather);p.tri(c,a,peak,palette.cliff.at(-1),weather);
  }else{
   const a=basis(center,-s,.0,-.6*s,yaw),b=basis(center,s,.0,-.38*s,yaw),c=basis(center,.50*s,0,s,yaw);
   const ridge=basis(center,.15*s,.13+s*.25,.12*s,yaw);
   p.tri(a,b,ridge,ink,weather);p.tri(b,c,ridge,palette.rock[3],weather);p.tri(c,a,ridge,palette.rock[2],weather);
   if(n%2){
    const v=basis(center,s*.49,.033,s*.92,yaw),tuft=basis(center,s*.42,.45+s*.37,s*1.03,yaw);
    p.tri(a,v,tuft,palette.pine[3],2);
   }
  }
 }
 return detailCount;
}
// Tiny geometry font. Legibility lives in the same batch as every other prop.
const GLYPHS={
 A:[14,17,17,31,17,17,17],B:[30,17,17,30,17,17,30],C:[14,17,16,16,16,17,14],
 D:[30,17,17,17,17,17,30],E:[31,16,16,30,16,16,31],F:[31,16,16,30,16,16,16],
 G:[14,17,16,23,17,17,15],H:[17,17,17,31,17,17,17],I:[31,4,4,4,4,4,31],
 K:[17,18,20,24,20,18,17],L:[16,16,16,16,16,16,31],M:[17,27,21,21,17,17,17],
 N:[17,25,25,21,19,19,17],O:[14,17,17,17,17,17,14],P:[30,17,17,30,16,16,16],
 R:[30,17,17,30,20,18,17],S:[15,16,16,14,1,1,30],T:[31,4,4,4,4,4,4],
 U:[17,17,17,17,17,17,14],V:[17,17,17,17,17,10,4],W:[17,17,17,21,21,27,17],
 X:[17,17,10,4,10,17,17],Y:[17,17,10,4,4,4,4],Z:[31,1,2,4,8,16,31],
};
function sign(batch,o,yaw,label,w,h,bg=0x30494d,fg=0xf5e6ba,post=false){
 const p=batch.painter(o),a=(x,y,z)=>basis(o,x,y,z,yaw);
 box(p,o,w,h,.20,bg,yaw);
 const B=.106,z=.113;
 const border=0xab9374;
 p.quad(a(-w*.5,.055,B),a(w*.5,.055,B),a(w*.5,.125,B),a(-w*.5,.125,B),border);
 p.quad(a(-w*.5,h-.112,B),a(w*.5,h-.112,B),a(w*.5,h-.052,B),a(-w*.5,h-.052,B),border);
 const pixel=Math.min(w/(label.length*6+.4),h*.109);
 const top=(h+pixel*7)*.5, left=-label.length*pixel*3;
 for(let i=0;i<label.length;i++){
  const glyph=GLYPHS[label[i]];
  if(!glyph)continue;
  for(let row=0;row<7;row++)for(let j=0;j<5;j++)if(glyph[row]&(16>>j)){
   const x=left+(i*6+j)*pixel, y=top-(row+1)*pixel;
   p.quad(a(x,y,z),a(x+pixel,y,z),a(x+pixel,y+pixel,z),a(x,y+pixel,z),fg);
  }
 }
 if(post)for(const x of [-w*.36,w*.36])box(p,basis(o,x,-2,-.10,yaw),.22,2.08,.30,0x655044,yaw);
}
function beam(p,A,B,r,color,end=r,num=7){
 const ax=B[0]-A[0],ay=B[1]-A[1],az=B[2]-A[2],d=Math.hypot(ax,ay,az);
 if(d<.005)return;
 const u=Math.abs(ay/d)<.91?[az,0,-ax]:[0,az,-ay];
 const len=Math.hypot(...u),x=u.map(v=>v/len),v=[(ay*x[2]-az*x[1])/d,(az*x[0]-ax*x[2])/d,(ax*x[1]-ay*x[0])/d];
 const point=(P,q,angle)=>P.map((a,i)=>a+q*(Math.cos(angle)*x[i]+Math.sin(angle)*v[i]));
 for(let i=0;i<num;i++){
  const s=i/num*TAU,t=(i+1)/num*TAU,C=point(A,r,s),D=point(A,r,t),E=point(B,end,t),F=point(B,end,s);
  p.quad(C,D,E,F,color);
  p.tri(B,E,F,color);
 }
}
function terrace(batch,o,rx,rz,depth,pal,random,yaw,weather){
 if(depth<.76)return;
 const p=batch.painter(o),n=12;
 const layers=[[1,0],[.96,-.58],[1.14,-depth*.25],[1.26,-depth*.46],[1.49,-depth]];
 const span=Array.from({length:n},()=>.90+random()*.14);
 const R=layers.map(([scale,dy],j)=>span.map((s,i)=>{
  const a=i/n*TAU;
  return basis(o,Math.cos(a)*rx*scale*s,dy+(j>1?Math.sin(a*2+j)*depth*.065:0),Math.sin(a)*rz*scale*s,yaw);
 }));
 for(let i=0;i<n;i++){
  const k=(i+1)%n;
  p.tri(o,R[0][i],R[0][k],pal.at(-2),weather);
  for(let j=0;j<R.length-1;j++){
   const colors=[pal.at(-2),pal[1],pal[2],pal[0]];
   p.quad(R[j][i],R[j][k],R[j+1][k],R[j+1][i],colors[j],weather);
  }
 }
}
function fence(batch,o,yaw,span,snow=false){
 const p=batch.painter(o),n=snow?8:6, a=(x,y,z)=>basis(o,x,y,z,yaw);
 const light=snow?0x7f6860:0x9c8166,dark=snow?0x665a52:0x79604c;
 for(let i=0;i<=n;i++){
  const x=(i/n-.5)*span;
  box(p,a(x,0,0),.25,snow?2.55:1.46,.27,dark,yaw);
  box(p,a(x,snow?2.53:1.45,0),.34,.12,.35,snow?0xb5cbd6:0x9f8c70,yaw);
  if(i===n)break;
  const nx=x+span/n;
  for(const y of snow?[.41,1.03,1.66,2.18]:[.53,1.11]){
   box(p,a((x+nx)*.5,y,.14),span/n+.07,.19,.16,light,yaw);
  }
  if(i%2===0)beam(p,a(x,.17,-.89),a(x+.03,snow?1.64:1.06,.03),.08,dark,.07,5);
 }
}
function utility(batch,o,yaw,snow,serial){
 const p=batch.painter(o),a=(x,y,z)=>basis(o,x,y,z,yaw);
 const steel=snow?0x6c8596:0x63665b,dark=0x333a3b,white=snow?0xd6ecf3:0xbdc4b6,signal=snow?0xe77e42:0xd49344;
 if(snow){
  // Rescue tool box, sled with curled runners, removable avalanche probes.
  box(p,a(3.3,0,.2),1.63,1.13,1.03,signal,yaw);
  box(p,a(3.3,1.12,.2),1.69,.17,1.12,0xf2b164,yaw);
  box(p,a(3.3,.81,.74),.20,.14,.08,dark,yaw);
  const z=-1.25;
  box(p,a(-2,.53,z),3.3,.27,1.45,signal,yaw);
  box(p,a(-2,.86,z),2.18,.31,.93,white,yaw);
  for(const offset of [-.46,.46]){
   const b=z+offset;
   beam(p,a(-3.6,.17,b),a(-.39,.17,b),.099,steel,.099,6);
   beam(p,a(-.39,.17,b),a(.08,.48,b),.099,steel,.07,6);
   for(const x of [-3.12,-1.04])beam(p,a(x,.17,b),a(x,.53,b),.087,steel,.075,5);
  }
  for(const x of [.9,1.33,1.75])beam(p,a(x,0,1.0),a(x-.16,2.15,1.05),.053,signal,.048,6);
 }else{
  // Stacked split timber behind a forestry bench and brass vista scope.
  for(let row=0;row<3;row++)for(let i=0;i<4-row;i++){
   const x=.35*(i-(3-row)*.5)+2.4;
   beam(p,a(x,.19+row*.29,-1.37),a(x,.20+row*.29,.37),.178,0x795b40,.163,7);
   beam(p,a(x,.20+row*.29,.37),a(x,.20+row*.29,.40),.111,0xc29b72,.073,7);
  }
  const z=.43,x=-2.2;
  box(p,a(x,0,z),.93,.29,.94,0x686c61,yaw);
  beam(p,a(x,.22,z),a(x,1.73,z),.125,steel,.14,8);
  beam(p,a(x,1.63,z-.67),a(x,1.97,z+.75),.229,0xb99254,.175,10);
  beam(p,a(x,1.97,z+.75),a(x,2.04,z+1.03),.199,dark,.201,8);
  beam(p,a(x,1.63,z-.64),a(x,1.59,z-.83),.137,dark,.181,8);
 }
 if(serial%2){
  for(const x of [-3.8,3.8])box(p,a(x,0,-1.31),.21,1.25,.23,steel,yaw);
  box(p,a(0,1.1,-1.31),7.78,.16,.38,dark,yaw);
 }
}
function weatherStation(batch,o,yaw,snow,serial){
 const p=batch.painter(o),a=(x,y,z)=>basis(o,x,y,z,yaw);
 const iron=snow?0x668193:0x68665b, pale=snow?0xd4e3e9:0xd6cdb9, stripe=snow?0xe07d51:0xe7aa55;
 box(p,a(0,0,0),4.6,.27,3.65,0x777c78,yaw);
 const h=snow?8.6:7.4;
 for(const x of [-1.17,1.17])for(const z of [-.91,.91]){
  beam(p,a(x,.24,z),a(x*.29,h,z*.27),.085,iron,.061,6);
  beam(p,a(x,.24,z),a(-x*.68,2.7,z*.76),.048,iron,.050,5);
  beam(p,a(-x*.68,2.7,z*.76),a(x*.49,5.02,z*.48),.051,iron,.049,5);
  beam(p,a(x*.49,5.02,z*.48),a(-x*.29,h,z*.27),.041,iron,.048,5);
 }
 for(const y of [2.7,5.0,7.0])box(p,a(0,y,0),1.89-y*.113,.12,1.53-y*.105,pale,yaw);
 beam(p,a(0,h-.45,0),a(0,h+.81,0),.16,iron,.064,8);
 if(snow&&serial%2===0){
  const C=a(.00,h+.29,.19),D=a(.00,h+.85,1.14);
  beam(p,a(0,h+.13,0),C,.16,iron,.24,8);
  beam(p,C,D,.31,pale,1.03,12);
  beam(p,D,a(.00,h+.90,1.23),1.04,0x496171,.98,12);
  beam(p,D,a(.00,h+1.04,1.78),.077,stripe,.11,7);
 }else{
  for(const az of [0,TAU/3,2*TAU/3]){
   const x=Math.cos(az)*.94,z=Math.sin(az)*.94;
   beam(p,a(0,h+.71,0),a(x,h+.72,z),.045,iron,.04,6);
   beam(p,a(x,h+.71,z),a(x,h+.72,z+.22),.142,stripe,.245,8);
  }
  const A=a(-.13,h+.24,0),B=a(-1.09,h+.46,0),C=a(-.10,h+.49,0),D=a(-.48,h+.98,0);
  p.tri(A,B,D,stripe);p.tri(A,D,C,pale);
 }
 box(p,a(-2.83,0,-.37),1.7,1.76,1.28,iron,yaw);
 box(p,a(-2.83,1.72,-.37),1.89,.17,1.52,pale,yaw);
 box(p,a(-2.83,1.06,.32),.54,.49,.10,0x324941,yaw);
 sign(batch,a(2.7,1.55,1.27),yaw,snow?(serial%2?'WIND MONITOR':'ICE RADAR'):'RIDGE WIND',4.55,.86,0x425552,0xe8edcc);
}
function cabin(batch,o,yaw,snow){
 const p=batch.painter(o), w=11.5,d=7.8,h=4.55;
 box(p,[o[0],o[1]-.58,o[2]],12.2,.66,8.6,snow?0x8096a6:0x777066,yaw);
 box(p,o,w,h,d,snow?0x466173:0x925638,yaw,true);
 const a=(x,y,z)=>basis(o,x,y,z,yaw);
 const A=a(-6.15,h,-4.4),B=a(6.15,h,-4.4),C=a(6.15,h,4.4),D=a(-6.15,h,4.4),E=a(-6.15,7.2,0),F=a(6.15,7.2,0);
 const roof=snow?0xe7f8ff:0x303e45;
 p.quad(A,B,F,E,roof);p.quad(E,F,C,D,snow?0xc7e8f2:0x48545b);
 p.tri(A,D,E,snow?0x5e7e8d:0xb97c50);p.tri(B,C,F,snow?0x6b8595:0xa76948);
 p.quad(a(-6.15,h-.15,4.41),a(6.15,h-.15,4.41),a(6.15,h+.1,4.41),a(-6.15,h+.1,4.41),snow?0xb5d7e4:0x861f32);
 for(const z of [-3.94,3.94]){
  for(let i=0;i<7;i++){
   const y=.57+i*.52, tone=snow?(i%3===0?0x557285:0x698a9d):(i%3===0?0x714732:0xa46943);
   p.quad(a(-5.8,y,z),a(5.8,y,z),a(5.8,y+.14,z),a(-5.8,y+.14,z),tone);
  }
 }
 for(const x of [-5.45,5.45])box(p,basis(o,x,-.11,3.95,yaw),.31,4.82,.41,snow?0x9fc7d7:0x563f35,yaw);
 for(const x of [-3.8,-1.35,1.35,3.8]){
  const glow=snow?0xffd48d:0xffcb81;
  const z=3.93,y=1.9;
  p.quad(a(x-.71,y,z),a(x+.71,y,z),a(x+.71,y+1.11,z),a(x-.71,y+1.11,z),0x25313a);
  p.quad(a(x-.54,y+.12,z+.018),a(x+.54,y+.12,z+.018),a(x+.54,y+.99,z+.018),a(x-.54,y+.99,z+.018),glow);
  p.quad(a(x-.07,y+.11,z+.029),a(x+.07,y+.11,z+.029),a(x+.07,y+1,z+.029),a(x-.07,y+1,z+.029),0x444048);
 }
 box(p,basis(o,3.2,5.75,-1.48,yaw),1.03,2.8,1.06,snow?0xa3524c:0x53443a,yaw);
 box(p,basis(o,3.2,8.18,-1.48,yaw),1.27,.66,1.28,snow?0xccdde5:0x313c45,yaw);
 const wood=snow?0x587788:0x8c6046,eave=snow?0xaac3d3:0x613c32;
 for(const x of [-5.34,5.34])box(p,a(x,0,5.55),.24,3.42,.25,wood,yaw);
 p.quad(a(-5.70,3.37,5.76),a(5.70,3.37,5.76),a(5.72,3.89,3.72),a(-5.72,3.89,3.72),roof);
 p.quad(a(-5.76,3.30,5.79),a(5.76,3.30,5.79),a(5.76,3.44,5.79),a(-5.76,3.44,5.79),eave);
 box(p,a(0,0,4.77),11.65,.27,2.06,wood,yaw);
 for(const [z,depth] of [[5.91,.75],[6.32,.63]])box(p,a(0,0,z),3.1,.15,depth,eave,yaw);
 box(p,a(0,.25,3.96),1.44,2.12,.21,eave,yaw);
 box(p,a(0,.34,4.067),1.17,1.91,.11,snow?0x3c586d:0x604337,yaw);
 box(p,a(.30,1.10,4.14),.105,.105,.09,0xd0b782,yaw);
 for(const x of [-4.32,4.32]){
  box(p,a(x,2.75,4.01),.22,.23,.17,0xffca86,yaw);
  box(p,a(x,2.69,4.01),.27,.075,.20,eave,yaw);
 }
 sign(batch,a(0,3.94,4.12),yaw,snow?'SNOW RESCUE':'RANGER LODGE',7.5,.47,
   snow?0x40536a:0x3f5141,snow?0xffdec2:0xf8e6bd);
}
function waterfall(batch,o,yaw,width,h,color=0x79bcdb,frost=0xcde9ef){
 const p=batch.painter(o),a=(u,y,z)=>basis(o,u,y,z,yaw);
 const r=[[0,0],[.22,.12],[.57,.21],[1,.63]];
 for(let s=0;s<r.length-1;s++){
  const [u,z]=r[s],[v,w]=r[s+1];
  for(let i=0;i<5;i++){
   const x1=width*(i/5-.5),x2=width*((i+1)/5-.5);
   p.quad(a(x1,h*(1-u),z),a(x2,h*(1-u),z),a(x2*.82,h*(1-v),w),a(x1*.82,h*(1-v),w),i%3===1?frost:color);
  }
 }
 for(let i=0;i<4;i++){
  const x=i*.44*width-.66*width;
  p.tri(a(x,0,-1),a(x+.8,.3,2),a(x-1.2,.1,2.6),frost);
 }
}
function landmark(batch,core,clear,random,snow,reserve=()=>{}){
 const specs=snow?[[0,.43,1,'hut'],[1,.61,-1,'ice'],[4,.43,1,'ice'],[7,.58,-1,'ice'],[9,.55,-1,'hut']]
  :[[0,.61,1,'hut'],[2,.64,-1,'peak'],[4,.61,1,'falls'],[7,.51,-1,'hut'],[9,.54,1,'peak']];
 const palette=snow?SNOW:ALPINE;
 let made=0;
 for(const [sector,t,side,kind] of specs){
  const section=core.sections[sector],s=lerp(section.start,section.end,t);
  const f=at(core,s,0),r=kind==='hut'?22:31;
  for(const offset of [f.w*.5+r+19,f.w*.5+r+31,f.w*.5+r+48,f.w*.5+r+64]){
   const a=at(core,s,side*offset);
   if(!clear(a.x,a.z,r,14))continue;
   const yaw=Math.atan2(-side*a.rz,-side*a.rx)-Math.PI*.5;
   const y=Math.max(GROUND,a.y-(snow?7:5)),o=pt(a.x,y,a.z);
   if(kind==='hut'){
    terrace(batch,o,13.3,10.1,Math.max(.75,y-GROUND+.42),palette.ground,random,yaw,snow?1:2);
    cabin(batch,o,yaw,snow);
    fence(batch,basis(o,-.5,0,7.5,yaw),yaw,12.8,snow);
    utility(batch,basis(o,7.8,0,-1.7,yaw),yaw,snow,sector);
    for(const x of [-9.3,9.7])fir(batch,basis(o,x,-.03,-4.3,yaw),snow?7.9:10,2.7,palette,random,snow,true);
   }else{
    const H=kind==='peak'?39:kind==='falls'?26:22;
    const colors=kind==='ice'?palette.cliff:palette.rock.concat(kind==='peak'?0xd2c6ae:0xb7ab9d);
    for(const [x,z,scale] of [[-14,-4,.72],[0,-7,1],[12,-11,.64]]){
     const p=basis(o,x,0,z,yaw);
     loaf(batch,[p[0],GROUND-.4,p[2]],13.3*scale,17.6*scale,Math.max(4,p[1]-GROUND+H*scale),colors,random,kind==='ice'?'ice':'ridge',yaw+.3,snow?1:2);
    }
    if(kind==='falls'||kind==='ice')waterfall(batch,basis(o,.9,-2,6.3,yaw),yaw,kind==='ice'?4.1:5.8,H*.52,kind==='ice'?0x6dc8ed:0x83bbca);
   }
   reserve(a.x,a.z,r);
   made++;break;
  }
 }
 return made;
}
function siteDressing(batch,core,clear,pal,random,snow,reserve=()=>{}){
 const sites=snow?[[0,.30,1,'weather'],[1,.43,1,'fence'],[2,.68,-1,'weather'],[3,.56,-1,'cache'],
   [5,.22,1,'weather'],[6,.59,1,'fence'],[8,.41,-1,'cache'],[10,.43,1,'fence']]
  :[[0,.31,1,'weather'],[1,.55,-1,'overlook'],[2,.52,1,'cache'],[3,.47,1,'overlook'],
   [5,.67,-1,'weather'],[6,.48,1,'cache'],[8,.44,-1,'overlook'],[10,.40,1,'weather']];
 let made=0;
 for(const [index,t,side,kind] of sites){
  const row=core.sections[index],original=lerp(row.start,row.end,t);
  for(const shift of [0,24,-29,49]){
   const s=original+shift,f=at(core,s,0),span=kind==='fence'?16:13;
   const a=at(core,s,side*(f.w*.5+span+15+Math.abs(shift)*.13));
   if(!clear(a.x,a.z,span+1,10))continue;
   const yaw=Math.atan2(-side*a.rz,-side*a.rx)-Math.PI*.5;
   const y=Math.max(GROUND+.10,a.y-(kind==='weather'?4.6:5.4)),o=pt(a.x,y,a.z);
   terrace(batch,o,kind==='fence'?9.5:7.8,kind==='weather'?5.2:5.7,
    Math.max(0,y-GROUND+.29),pal.ground,random,yaw,snow?1:2);
   if(kind==='weather'){
    weatherStation(batch,o,yaw,snow,made);
    fence(batch,basis(o,0,0,-3.75,yaw),yaw,8.4,false);
   }else{
    utility(batch,basis(o,.1,0,-1.43,yaw),yaw,snow,index);
    const fenceYaw=yaw+(kind==='overlook'?.13:0);
    fence(batch,basis(o,0,0,3.54,yaw),fenceYaw,kind==='fence'?15.2:10.9,snow);
    const label=snow?(kind==='fence'?'AVALANCHE FENCE':'RESCUE CACHE'):(kind==='overlook'?'RIDGE VISTA':'RANGER CACHE');
    sign(batch,basis(o,0,2.4,3.72,yaw),yaw,label,kind==='fence'?6.5:5.7,.82,
     snow?0x80543b:0x435144,0xffe0ad,true);
   }
   reserve(a.x,a.z,span+1);
   made++;
   break;
  }
 }
 return made;
}

function igloo(batch,o,yaw,scale,variant){
 const p=batch.painter(o),R=5.35*scale;
 const shades=[0x6da5c7,0x83bad6,0x9accdf,0xbcdeed,0xd6edf4,0xe9f8fc];
 const a=(u,y,z)=>basis(o,u*scale,y*scale,z*scale,yaw);
 const seam=0x517c9c;
 const steps=[0,.22,.42,.62,.81,1.02,1.22,1.40,Math.PI/2];
 // Lower ice blocks have staggered narrow bevels and darker mortar pockets;
 // a quiet polar gradient and cool bevel edges keep the courses readable.
 const point=(e,w,r=R)=>basis(o,Math.cos(w)*Math.cos(e)*r,
   .09+Math.sin(e)*r*.81,Math.sin(w)*Math.cos(e)*r,yaw);
 for(let r=0;r<steps.length-1;r++){
  const n=r<4?16:r<6?13:r<7?10:7;
  const phase=Math.PI/2+(r<2||r%2===0?-.5:0)*TAU/n;
  for(let k=0;k<n;k++){
   const C=k/n*TAU+phase,D=(k+1)/n*TAU+phase,M=(C+D)*.5;
   // The arch tangent cuts the dome's first two courses open on the street side.
   if(r<2&&Math.sin(M)>.972)continue;
   const low=steps[r],high=steps[r+1];
   const u=point(low,C,R-.072),v=point(low,D,R-.072),w=point(high,D,R-.072),q=point(high,C,R-.072);
   p.quad(u,v,w,q,seam,1);
   const W=(D-C)*.018, H=(high-low)*.046;
   const U=point(low+H,C+W),V=point(low+H,D-W),X=point(high-H,D-W),Y=point(high-H,C+W);
   const e=point(low+H*2,C+W*2,R+.014),f=point(low+H*2,D-W*2,R+.014),
      g=point(high-H*2,D-W*2,R+.014),h=point(high-H*2,C+W*2,R+.014);
   const bottom=clamp(Math.round(1+r*.45+Math.cos(M+variant*.50)*.76),0,shades.length-1);
   const lip=Math.min(shades.length-1,bottom+1);
   p.quad(U,V,f,e,shades[Math.max(0,bottom-1)],1);
   p.quad(V,X,g,f,shades[Math.max(0,bottom-1)],1);
   p.quad(X,Y,h,g,shades[lip],1);
   p.quad(Y,U,e,h,shades[lip],1);
   p.tri(e,f,g,[shades[bottom],shades[bottom],shades[lip]],1);
   p.tri(e,g,h,[shades[bottom],shades[lip],shades[lip]],1);
  }
 }
 // Real open arch, carried by thick individual voussoirs, with a recessed dark
 // face well behind the entrance rather than a door decal on the outside.
 const arc=(t,r,z)=>a(Math.cos(t)*r,.69+Math.sin(t)*r,z);
 for(const side of [-1,1])for(let i=0;i<2;i++){
  const z=4.1+i*1.35;
  box(p,a(side*1.06,0,z),.43*scale,.67*scale,1.335*scale,shades[i+1],yaw);
 }
 for(let i=0;i<10;i++){
  const t=i*Math.PI/10,u=(i+1)*Math.PI/10,inside=.85,outside=1.26;
  for(let j=0;j<3;j++){
   const z=3.19+j*1.18,w=z+1.16;
   const T=t+.015,U=u-.015;
   p.quad(arc(T,outside,z),arc(U,outside,z),arc(U,outside,w),arc(T,outside,w),shades[2+(i+variant)%3],1);
   p.quad(arc(T,inside,z),arc(T,inside,w),arc(U,inside,w),arc(U,inside,z),0x37546c,1);
   p.quad(arc(T,inside,w),arc(U,inside,w),arc(U,outside,w),arc(T,outside,w),shades[1+(i%4)],1);
   p.quad(arc(T,inside,z),arc(T,outside,z),arc(T,outside,w),arc(T,inside,w),seam,1);
  }
  p.tri(a(0,.69,2.99),arc(t,.86,2.99),arc(u,.86,2.99),0x1c344d);
 }
 p.quad(a(-.86,0,2.99),a(.86,0,2.99),a(.86,.69,2.99),a(-.86,.69,2.99),0x1c344d);
 p.quad(a(-.82,.014,3.0),a(.82,.014,3.0),a(1.10,.015,7.6),a(-1.10,.015,7.6),0x9ebfd1,1);
 // Split bamboo trail poles and angled fabric flags define the wind path.
 for(const [i,x] of [-2.42,2.53].entries()){
  const z=6.35+i*.22,H=2.65+i*.30;
  beam(p,a(x,0,z),a(x+.08,H,z),.051*scale,0x465669,.041*scale,7);
  const color=i===0?0xf98740:0xe44e40;
  p.tri(a(x+.07,H,z-.015),a(x+.88,H-.22,z+.14),a(x+.07,H-.61,z-.015),color);
  box(p,a(x,0,z),.23*scale,.12*scale,.23*scale,0x9dc1d4,yaw);
 }
}
function iglooSites(batch,core,clear,palette,random,reserve){
 const sites=[[0,.49,-1],[1,.24,1],[8,.23,1],[9,.78,-1],[11,.43,1]];
 let count=0;
 for(const [sector,t,side] of sites){
  const row=core.sections[sector],start=lerp(row.start,row.end,t);
  for(const shift of [0,-34,44,71,-75]){
   const s=start+shift,f=at(core,s,0),r=15.5;
   if(core.sky.inMainLane(s,36))continue;
   const a=at(core,s,side*(f.w*.5+27+Math.abs(shift)*.13));
   if(!clear(a.x,a.z,r,9))continue;
   const yaw=Math.atan2(-side*a.rz,-side*a.rx)-Math.PI*.5;
   const y=Math.max(GROUND+.12,a.y-5.55),o=pt(a.x,y,a.z);
   terrace(batch,o,7.6,9.0,Math.max(.12,y-GROUND+.28),palette.ground,random,yaw,1);
   igloo(batch,o,yaw,.88+random()*.32,count);
   if(count%2===0)sign(batch,basis(o,-4.8,1.66,5.19,yaw),yaw,'IGLOO SHELTER',3.8,.61,0x506475,0xf7dcb3,true);
   reserve(a.x,a.z,r);
   count++;break;
  }
 }
 return count;
}

/** Local set dressing only. No track state, surfaces, collision or simulation changes. */
export function buildCircuitBiome(core,{reservedSites=[]}={}){
 if(core.id!=='track02'&&core.id!=='track03')return null;
 const snow=core.id==='track02',palette=snow?SNOW:ALPINE,r= rng(snow?0x27d58b39:0xb63cea28);
 const g=new T.Group();
 g.name=snow?'Snow biome · blue ice and frost pines':'Mountain biome · alpine rock shelves';
 const b=batches(g),roadClear=routeGuard(core);
 const reserves=reservedSites.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.radius>0)
  .map(p=>[p.x,p.z,p.radius]);
 const reserve=(x,z,r)=>reserves.push([x,z,r]);
 const clear=(x,z,r=0,margin)=>roadClear(x,z,r,margin)&&reserves.every(([a,b,s])=>(x-a)**2+(z-b)**2>(r+s+1.7)**2);
 const count={drifts:0,rocks:0,trees:0,landmarks:0,terrainFragments:0,forestShelves:0,utilitySites:0};
 const weather=snow?1:2;
 if(snow){
  const art=rng(0xfbc3671);
  // Authored sites get first choice so random greenery can never cut through the
  // entrance or hide the silhouette from the racing line.
  count.igloos=iglooSites(b,core,clear,palette,art,reserve);
  count.landmarks=landmark(b,core,clear,art,snow,reserve);
  count.utilitySites=siteDressing(b,core,clear,palette,art,snow,reserve);
 }
 // Rolling shoulders descending toward the snowfield or the warm alpine talus.
 // Irregular overlap breaks up the course-offset pattern. Retain open valley
 // views by varying both the chosen side and ridge/forest density by sector.
 for(let s=22;s<core.length;s+=snow?25:29){
  const f=at(core,s,0);
  for(const side of [-1,1]){
   const wave=.5+.5*Math.sin(s*.007+side*1.7);
   const stretch=8+r()*5.3,dep=7+r()*5, lateral=f.w*.5+dep+8+r()*9;
   const a=at(core,s+(r()-.5)*9,side*lateral);
   if(!clear(a.x,a.z,Math.max(stretch,dep)+3))continue;
   const base=Math.max(GROUND-.15,Math.min(a.y-(snow?6.5:3.5),GROUND+(snow?39:20)));
   loaf(b,[a.x,GROUND-.35,a.z],stretch,dep,Math.max(1.2,base-GROUND+(snow?1.4:2)+r()*2.4),palette.ground,r,'mound',Math.atan2(-a.rx,a.rz)+(r()-.5)*.6,weather);
   if(r()<.67){
    const az=Math.atan2(-a.rx,a.rz);
    const top=[a.x,GROUND,a.z];
    const edge=basis(top,0,0,Math.min(dep,.89*stretch)*.82,az);
    if(clear(edge[0],edge[2],3.8,8))count.terrainFragments+=surfaceFragments(b,edge[0],GROUND+.12,edge[2],3.2,az,palette,r,snow);
   }
   count.drifts++;
   if(r()<.20+.18*wave){
    const ice=snow&&r()>.65, size=2.4+r()*4.7;
    loaf(b,[a.x,base-1,a.z],size,size*(.65+r()*.4),2.5+r()*(snow?4.8:6.6),ice?palette.cliff:palette.rock,r,ice?'ice':'ridge',r()*TAU,weather);
    count.rocks++;
   }
  }
 }
 // Broken skyline bands. Silhouettes are asymmetric lofts with real stratified
 // faces instead of cones. Larger forms are kept well beyond the camera/road.
 for(let s=47;s<core.length;s+=snow?94:82){
  const f=at(core,s,0),side=Math.sin(s*.0032)>0?-1:1;
  for(let v=0;v<2;v++){
   const radius=15+r()*(snow?21:31),offset=f.w*.5+radius+25+r()*54;
   const a=at(core,s+(r()-.5)*32,side*offset*(1+v*.49));
   if(!clear(a.x,a.z,radius+4,10))continue;
   const nearHeight=Math.max(0,a.y-GROUND-8), h=(snow?12:17)+r()*(snow?22:31)+nearHeight*(snow?.89:.44);
   const colors=snow?(r()>.33?palette.cliff:palette.rock.concat(0xe0f4fb)):palette.cliff;
   const ridgeYaw=Math.atan2(a.rz,a.rx)+Math.PI*.5+(r()-.5)*.94;
   loaf(b,[a.x,GROUND-.3,a.z],radius,radius*(.57+(r()*.26)),h,colors,r,snow&&v===0?'ice':'ridge',ridgeYaw,weather);
   count.rocks++;
   if(v===0&&r()>.44){
    // Footwall merges into the larger exposure; far masses don't stand as scattered identical monoliths.
    for(const side of [-1,1]){
     const p=basis([a.x,GROUND-.31,a.z],side*radius*(.44+r()*.08),0,radius*(.13+r()*.08),ridgeYaw);
     loaf(b,p,radius*.38,radius*.37,Math.max(4,h*(.25+r()*.28)),snow?palette.rock:palette.cliff,r,'ridge',ridgeYaw+side*.4,weather);
     count.rocks++;
    }
   }
   for(let j=0;j<(snow?4:3);j++){
    const turn=r()*TAU,d=radius*(.78+r()*.45),x=a.x+d*Math.cos(turn),z=a.z+d*Math.sin(turn);
    const h=7+r()*(snow?8:10), width=h*(.21+r()*.08);
    if(!clear(x,z,width+1,9))continue;
    fir(b,[x,GROUND,z],h,width,palette,r,snow);
    count.trees++;
   }
  }
 }
 // Smaller foreground tree groves make the biome unmistakable at chase height;
 // distances vary within each copse and every tree independently clears the road.
 for(let s=24;s<core.length;s+=snow?59:83){
  const side=r()>.5?-1:1,f=at(core,s,0),center=f.w*.5+(snow?32:36)+r()*23;
  const n=2+Math.floor(r()*4);
  const a=at(core,s,side*center),yaw=Math.atan2(a.rz,a.rx)+(r()-.5)*.40;
  const hill=Math.min(Math.max(0,(a.y-GROUND)*(snow?.85:1)-6),snow?61:17);
  const r1=7.2+r()*2.7,r2=9.5+r()*3.4;
  const raised=hill>2.8&&clear(a.x,a.z,r2*1.51+2,8);
  if(raised){
   terrace(b,[a.x,GROUND+hill,a.z],r1,r2,hill+.43,palette.ground,r,yaw,weather);
   count.forestShelves++;
  }
  for(let j=0;j<n;j++){
   const h=6+r()*(snow?10:12),w=h*(.20+r()*.065);
   const p=basis([a.x,GROUND+(raised?hill:0),a.z],(r()-.5)*r1*.98,0,
    (j/(n-1)-.5)*r2*1.15+(r()-.5)*1.4,yaw);
   if(!clear(p[0],p[2],w+2,8))continue;
   fir(b,p,h,w,palette,r,snow,true);
   count.trees++;
  }
 }
 if(!snow){
  count.landmarks=landmark(b,core,clear,r,snow);
  count.utilitySites=siteDressing(b,core,clear,palette,r,snow);
 }
 g.userData.biomeStats=count;
 b.finish();
 return g;
}
