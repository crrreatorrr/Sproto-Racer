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
function landmark(batch,core,clear,random,snow){
 const specs=snow?[[0,.43,1,'hut'],[1,.61,-1,'ice'],[4,.43,1,'ice'],[7,.58,-1,'ice'],[9,.55,-1,'hut']]
  :[[0,.61,1,'hut'],[2,.64,-1,'peak'],[4,.61,1,'falls'],[7,.51,-1,'hut'],[9,.54,1,'peak']];
 const palette=snow?SNOW:ALPINE;
 let made=0;
 for(const [sector,t,side,kind] of specs){
  const section=core.sections[sector],s=lerp(section.start,section.end,t);
  const f=at(core,s,0),r=kind==='hut'?17:31;
  for(const offset of [f.w*.5+r+19,f.w*.5+r+31,f.w*.5+r+48,f.w*.5+r+64]){
   const a=at(core,s,side*offset);
   if(!clear(a.x,a.z,r,14))continue;
   const yaw=Math.atan2(-side*a.rz,-side*a.rx)-Math.PI*.5;
   const y=Math.max(GROUND,a.y-(snow?7:5)),o=pt(a.x,y,a.z);
   if(kind==='hut'){
    loaf(batch,[a.x,GROUND-.4,a.z],r*.94,r*.76,Math.max(1,y-GROUND+.34),palette.ground,random,'mound',yaw,snow?1:2);
    cabin(batch,o,yaw,snow);
    for(const x of [-11,10])fir(batch,basis(o,x,-.3,-5,yaw),snow?7.9:10,2.7,palette,random,snow,true);
   }else{
    const H=kind==='peak'?39:kind==='falls'?26:22;
    const colors=kind==='ice'?palette.cliff:palette.rock.concat(kind==='peak'?0xd2c6ae:0xb7ab9d);
    for(const [x,z,scale] of [[-14,-4,.72],[0,-7,1],[12,-11,.64]]){
     const p=basis(o,x,0,z,yaw);
     loaf(batch,[p[0],GROUND-.4,p[2]],13.3*scale,17.6*scale,Math.max(4,p[1]-GROUND+H*scale),colors,random,kind==='ice'?'ice':'ridge',yaw+.3,snow?1:2);
    }
    if(kind==='falls'||kind==='ice')waterfall(batch,basis(o,.9,-2,6.3,yaw),yaw,kind==='ice'?4.1:5.8,H*.52,kind==='ice'?0x6dc8ed:0x83bbca);
   }
   made++;break;
  }
 }
 return made;
}

/** Local set dressing only. No track state, surfaces, collision or simulation changes. */
export function buildCircuitBiome(core){
 if(core.id!=='track02'&&core.id!=='track03')return null;
 const snow=core.id==='track02',palette=snow?SNOW:ALPINE,r= rng(snow?0x27d58b39:0xb63cea28);
 const g=new T.Group();
 g.name=snow?'Snow biome · blue ice and frost pines':'Mountain biome · alpine rock shelves';
 const b=batches(g),clear=routeGuard(core);
 const count={drifts:0,rocks:0,trees:0,landmarks:0,terrainFragments:0};
 const weather=snow?1:2;
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
   const radius=13+r()*(snow?17:25), offset=f.w*.5+radius+25+r()*54;
   const a=at(core,s+(r()-.5)*32,side*offset*(1+v*.49));
   if(!clear(a.x,a.z,radius+4,10))continue;
   const nearHeight=Math.max(0,a.y-GROUND-8), h=(snow?14:24)+r()*(snow?24:47)+nearHeight*(snow?.94:.46);
   const colors=snow?(r()>.36?palette.cliff:palette.rock.concat(0xe0f4fb)):palette.cliff;
   loaf(b,[a.x,GROUND-.3,a.z],radius,radius*(.66+(r()*.25)),h,colors,r,snow&&v===0?'ice':'ridge',r()*TAU,weather);
   count.rocks++;
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
  const side=r()>.5?-1:1,f=at(core,s,0),center=f.w*.5+(snow?26:31)+r()*22;
  const n=2+Math.floor(r()*4);
  for(let j=0;j<n;j++){
   const a=at(core,s+(j-(n-1)/2)*5.9+(r()-.5)*6,side*(center+(r()-.5)*18));
   const h=6+r()*(snow?11:12),w=h*(.20+r()*.065);
   if(!clear(a.x,a.z,w+2,8))continue;
   const hill=Math.min(Math.max(0,(a.y-GROUND)*(snow?.87:1)-7),snow?66:16);
   if(hill>3)loaf(b,[a.x,GROUND-.23,a.z],w+3.8,w+3.2,hill,palette.ground,r,'mound',r()*TAU,weather);
   fir(b,[a.x,GROUND+hill*.89,a.z],h,w,palette,r,snow,true);
   count.trees++;
  }
 }
 count.landmarks=landmark(b,core,clear,r,snow);
 g.userData.biomeStats=count;
 b.finish();
 return g;
}
