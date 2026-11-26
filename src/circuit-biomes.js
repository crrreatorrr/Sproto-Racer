import * as T from 'three';

// Static, visual-only terrain. Batches are cut into spatial cells rather than
// one race-wide mesh so the race camera can cull whole forests and rock faces.
const SNOW={
 ground:[0xb8dce9,0xccedf6,0xe7f6fc,0xf5fbff], rock:[0x6587a1,0x809eb3,0x95b5c9,0xb7cedc],
 pine:[0x194f63,0x225e69,0x326c74,0x427c7e], frost:[0xaad7e7,0xccedf6,0xebf9ff],
 cliff:[0x367c9c,0x4ca4bf,0x6bbcd2,0x9bdbeb,0xc6edf7],
};
const ALPINE={
 ground:[0x53644c,0x657455,0x79805a,0x949065],rock:[0x4a5056,0x676661,0x837b6e,0xaca092],
 pine:[0x253f36,0x314e41,0x426047,0x576d46],frost:[0x80917b,0x91a080,0xa6a583],
 cliff:[0x464f53,0x5f605b,0x776c60,0x9c8973,0xb6a68c],
};
const TAU=Math.PI*2, GROUND=-6.35, clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const pick=(xs,n)=>xs[Math.min(xs.length-1,Math.floor(n*xs.length))];
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
const pt=(x,y,z)=>[x,y,z];

function batches(group){
 const tiles=new Map(), ink=new Map();
 const mat=new T.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:.94,metalness:.01,side:T.DoubleSide});
 function bucket(p){const key=Math.floor(p[0]/340)+':'+Math.floor(p[2]/340);let v=tiles.get(key);
   if(!v){v={p:[],color:[]};tiles.set(key,v);}return v;}
 function painter(origin){
  const b=bucket(origin);
  const tri=(a,c,d,color)=>{
   let rgb=ink.get(color);if(!rgb){rgb=new T.Color(color);ink.set(color,rgb);}
   b.p.push(...a,...c,...d);
   for(let j=0;j<3;j++)b.color.push(rgb.r,rgb.g,rgb.b);
  };
  return {tri, quad(a,c,d,e,color){tri(a,c,d,color);tri(a,d,e,color);}};
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
function loaf(batch,o,rx,rz,h,palette,random,mode='mound',yaw=0){
 const p=batch.painter(o), n=mode==='ridge'?10:mode==='ice'?7:9;
 const jitter=Array.from({length:n},()=>.80+random()*.21);
 const yJ=Array.from({length:n},()=>random()-.5);
 const rings=mode==='ridge'?[[1,0],[.93,.27],[.72,.45],[.64,.57],[.46,.72],[.20,.96]]
   :mode==='ice'?[[1,0],[.85,.16],[.73,.55],[.49,.83],[.14,1]]
   :[[1,0],[.87,.26],[.62,.66],[.29,.92]];
 const shifts=Array.from({length:rings.length},(_,i)=>[(random()-.5)*rx*.32*i/rings.length,(random()-.5)*rz*.42*i/rings.length]);
 const R=rings.map(([s,y],r)=>jitter.map((v,i)=>{
  const a=i/n*TAU+(mode==='mound'?r*.13:r*.065);
  const dh=(r===0?0:yJ[i])*(mode==='ridge'?.22:.15);
  return basis(o,Math.cos(a)*rx*s*v+shifts[r][0],h*(y+dh),Math.sin(a)*rz*s*v+shifts[r][1],yaw);
 }));
 for(let r=0;r<R.length-1;r++)for(let i=0;i<n;i++){
  const j=(i+1)%n;
  const shade=mode==='ridge'?clamp(r+(i%3===1?1:0),0,palette.length-1)
   :clamp(r+(random()>.65?1:0),0,palette.length-1);
  p.tri(R[r][i],R[r][j],R[r+1][j],palette[shade]);
  p.tri(R[r][i],R[r+1][j],R[r+1][i],palette[mode==='ice'?clamp(shade+(i%2),0,palette.length-1):shade]);
 }
 const tip=basis(o,shifts.at(-1)[0],h*(mode==='mound'?1:1.07),shifts.at(-1)[1],yaw);
 for(let i=0;i<n;i++)p.tri(R.at(-1)[i],R.at(-1)[(i+1)%n],tip,palette.at(-1));
 return {top:tip[1]};
}
function fir(batch,o,h,r,pal,random,snow){
 const p=batch.painter(o),a=random()*TAU, lean=(random()-.5)*r*.6;
 box(p,o,r*.30,h*.55,r*.31,snow?0x574b50:0x4e3e36,a);
 const tiers=snow?4:3, n=6;
 for(let t=0;t<tiers;t++){
  const y=h*(.24+t*(snow?.145:.20)), width=r*(1-t*(snow?.175:.23));
  const tip=pt(o[0]+lean*(t+1)/tiers,o[1]+Math.min(h,y+h*.37),o[2]);
  const ring=Array.from({length:n},(_,i)=>{
   const phase=a+i/n*TAU+t*.37,r=width*(.83+random()*.26);
   return pt(o[0]+Math.cos(phase)*r,o[1]+y+(random()-.5)*h*.065,o[2]+Math.sin(phase)*r);
  });
  for(let i=0;i<n;i++){
   const j=(i+1)%n;
   p.tri(ring[i],ring[j],tip,pal.pine[(t+i)%pal.pine.length]);
   if(snow){
    const A=ring[i].map((x,k)=>lerp(x,tip[k],.35+((i+2*t)%3)*.07)),
          B=ring[j].map((x,k)=>lerp(x,tip[k],.35+((i+2*t+1)%3)*.07));
    A[1]+=.04;B[1]+=.04;
    const d=[tip[0],tip[1]+.04,tip[2]];
    p.tri(A,B,d,pal.frost[(i+t)%pal.frost.length]);
   }
  }
 }
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
   const yaw=Math.atan2(-a.rz,-a.rx)-Math.PI*.5;
   const y=Math.max(GROUND,a.y-(snow?7:5)),o=pt(a.x,y,a.z);
   if(kind==='hut'){
    loaf(batch,[a.x,GROUND-.4,a.z],r*.94,r*.76,Math.max(1,y-GROUND+.34),palette.ground,random);
    cabin(batch,o,yaw,snow);
    for(const x of [-11,10])fir(batch,basis(o,x,-.3,-5,yaw),snow?7.9:10,2.7,palette,random,snow);
   }else{
    const H=kind==='peak'?39:kind==='falls'?26:22;
    const colors=kind==='ice'?palette.cliff:palette.rock.concat(kind==='peak'?0xd2c6ae:0xb7ab9d);
    for(const [x,z,scale] of [[-14,3,.72],[0,6,1],[12,10,.64]]){
     const p=basis(o,x,0,z,yaw);
     loaf(batch,[p[0],GROUND-.4,p[2]],13.3*scale,17.6*scale,Math.max(4,p[1]-GROUND+H*scale),colors,random,kind==='ice'?'ice':'ridge',yaw+.3);
    }
    if(kind==='falls'||kind==='ice')waterfall(batch,basis(o,.9,-2,-7.4,yaw),yaw,kind==='ice'?4.1:5.8,H*.52,kind==='ice'?0x6dc8ed:0x83bbca);
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
 const count={drifts:0,rocks:0,trees:0,landmarks:0};
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
   loaf(b,[a.x,GROUND-.35,a.z],stretch,dep,Math.max(1.2,base-GROUND+(snow?1.4:2)+r()*2.4),palette.ground,r,'mound',Math.atan2(-a.rx,a.rz)+(r()-.5)*.6);
   count.drifts++;
   if(r()<.20+.18*wave){
    const ice=snow&&r()>.65, size=2.4+r()*4.7;
    loaf(b,[a.x,base-1,a.z],size,size*(.65+r()*.4),2.5+r()*(snow?4.8:6.6),ice?palette.cliff:palette.rock,r,ice?'ice':'ridge',r()*TAU);
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
   loaf(b,[a.x,GROUND-.3,a.z],radius,radius*(.66+(r()*.25)),h,colors,r,snow&&v===0?'ice':'ridge',r()*TAU);
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
   if(hill>3)loaf(b,[a.x,GROUND-.23,a.z],w+3.8,w+3.2,hill,palette.ground,r,'mound',r()*TAU);
   fir(b,[a.x,GROUND+hill*.89,a.z],h,w,palette,r,snow);
   count.trees++;
  }
 }
 count.landmarks=landmark(b,core,clear,r,snow);
 g.userData.biomeStats=count;
 b.finish();
 return g;
}
