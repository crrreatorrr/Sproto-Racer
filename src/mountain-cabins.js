import * as T from 'three';

const GROUND=-6.35, RAD=12.9;
const LOCATIONS=[
 [0,.42,-1,29,1.04,'Trailhead Lodge'],
 [2,.30,-1,28,.94,'Granite Lookout'],
 [4,.43, 1,28,1.00,'Brake Shelf Cabin'],
 [6,.31,-1,30,1.09,'Timberline Lodge'],
 [11,.38,-1,28,1.00,'Ranger Homestead'],
];
const COLORS=[
 {wood:[0x9a5d37,0x754525,0xab7046,0x855035,0x68412a],roof:[0x5a3931,0x6a4336,0x783e31,0x4c3930],trim:0xb8804e},
 {wood:[0x88543b,0x714836,0x96684e,0xa36c4b,0x77432b],roof:[0x435151,0x506061,0x38454a,0x525c54],trim:0xb38c62},
 {wood:[0x9a663a,0x87532d,0xa27348,0x75472d,0xb78048],roof:[0x52392f,0x664938,0x775644,0x3c3934],trim:0xc39150},
 {wood:[0x714833,0x955c37,0xa5744b,0x825d43,0x996546],roof:[0x38494c,0x495854,0x455647,0x56635a],trim:0xd1a56d},
 {wood:[0x895931,0x925d39,0xa27142,0x7b4a31,0x9d6e49],roof:[0x624439,0x795344,0x533b2e,0x684639],trim:0xbc8252},
];
const STONE=[0x6b6861,0x85817a,0x797164,0x585953,0x9b8d74,0x665d55];
function rand32(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}

export function mountainCabinSites(core) {
 if(core?.id!=='track03')return [];
 const frame={},route=[];
 for(let s=0;s<core.length;s+=4){
  core.evalFrame(s,frame);
  let half=frame.width*.5;
  for(const lane of core.sky?.lanes??[]){
   if(s>=lane.start-20&&s<=lane.end+20)half=Math.max(half,lane.width*.5+7);
  }
  if(s<180||s>core.length-28)half=Math.max(half,39);
  route.push([frame.centerX,frame.centerZ,half]);
 }
 return LOCATIONS.flatMap(([sector,fraction,side,edge,scale,name],index)=>{
  const q=core.sections[sector], radius=RAD*scale;
  for(const seek of [0,.044,-.047,.086,-.10,.127,-.14]){
   const s=q.start+(q.end-q.start)*(fraction+seek);
   core.evalFrame(s,frame);
   for(const extra of [0,5,11,18,26]){
    const offset=side*(frame.width*.5+edge+extra);
    const x=frame.centerX+frame.rightX*offset,z=frame.centerZ+frame.rightZ*offset;
    let clearance=Infinity;
    for(const [qx,qz,half] of route)clearance=Math.min(clearance,Math.hypot(x-qx,z-qz)-half-radius);
    // The continuous route can approach by another 2 m between samples.
    if(clearance<12.1)continue;
    const vx=-frame.rightX*side-frame.forwardX*.64;
    const vz=-frame.rightZ*side-frame.forwardZ*.64;
    return [{sector,s,x,z,y:frame.centerY-2.25,side,scale,index,name,yaw:Math.atan2(-vx,vz),radius,clearance}];
   }
  }
  return [];
 });
}

function cabin(site){
 const {x,y,z,yaw,scale,index,name}=site,pal=COLORS[index],rnd=rand32(0x6ac1b900+index*1171);
 const group=new T.Group();group.name=name;group.position.set(x,y,z);group.rotation.y=-yaw;group.scale.setScalar(scale);
 const shell={p:[],v:[]},light={p:[],v:[]},tones=new Map();
 const swatch=k=>{if(!tones.has(k))tones.set(k,new T.Color(k));return tones.get(k);};
 function face(a,b,d,color,target=shell){
  const ink=swatch(color);
  target.p.push(...a,...b,...d);
  for(let i=0;i<3;i++)target.v.push(ink.r,ink.g,ink.b);
 }
 function quad(a,b,c,d,color,target=shell){face(a,b,c,color,target);face(a,c,d,color,target);}
 const V=(x,y,z)=>[x,y,z];
 function box(x,y,z,w,h,d,color,target=shell){
  const a=x-w*.5,b=x+w*.5,f=z-d*.5,g=z+d*.5,q=y+h;
  const a0=V(a,y,f),b0=V(b,y,f),c0=V(b,y,g),d0=V(a,y,g);
  const a1=V(a,q,f),b1=V(b,q,f),c1=V(b,q,g),d1=V(a,q,g);
  quad(a0,b0,b1,a1,color,target);quad(b0,c0,c1,b1,color,target);
  quad(c0,d0,d1,c1,color,target);quad(d0,a0,a1,d1,color,target);
  quad(a1,b1,c1,d1,color,target);
 }
 const pick=arr=>arr[Math.min(arr.length-1,Math.floor(rnd()*arr.length))];
 // Each wall course is a genuine faceted round log. Splitting the surface
 // into tones, not materials, keeps every cabin to two draw calls.
 function log(axis,left,right,base,across,r,wood,detail=true){
  const n=6,sw=[wood,pick(pal.wood),wood,wood,pick(pal.wood),wood];
  const point=(t,k,m=1)=>{const q=(k+.18)/n*Math.PI*2;
   return axis===0?V(t,base+r*m*Math.sin(q),across+r*m*Math.cos(q))
      :V(across+r*m*Math.cos(q),base+r*m*Math.sin(q),t);};
  for(let j=0;j<n;j++){
   quad(point(left,j),point(right,j),point(right,j+1),point(left,j+1),sw[j]);
   for(const [end,dir] of [[left,-1],[right,1]]){
    const stop=end+.002*dir, b=axis===0?V(stop,base,across):V(across,base,stop);
    if(!detail){face(b,point(end,j),point(end,j+1),0xc29361);continue;}
    quad(point(end,j),point(end,j+1),point(stop,j+1,.67),point(stop,j,.67),0x996743);
    face(b,point(stop,j,.67),point(stop,j+1,.67),0xd9ab73);
   }
  }
 }
 // Tapered ledge and mortared base join raised roadside models to terrain.
 // A radial flat upper terrace leaves the porch/wood pile a place to rest.
 const count=12,baseBottom=(GROUND-y)/scale,ring=(k,l)=>{
  const a=k/count*Math.PI*2,wash=1+Math.sin(k*2.87+index)*.08;
  const r=l===0?11.65:l===1?10.15:10.2;
  return V(Math.cos(a)*r*wash,l===0?baseBottom:l===1?-.9:-.05,
    Math.sin(a)*r*.91*wash);
 };
 for(let k=0;k<count;k++){
  quad(ring(k,0),ring(k+1,0),ring(k+1,1),ring(k,1),STONE[(k+index)%STONE.length]);
  quad(ring(k,1),ring(k+1,1),ring(k+1,2),ring(k,2),pick([0x697054,0x565b45,0x67624c,0x84795a]));
  face(ring(k,2),ring(k+1,2),V(0,-.05,0),pick([0x726a4c,0x7a7054,0x68674a]));
 }
 const W=11.7,D=7.5,H=4.35,R=7.22;
 box(0,-.02,0,W+.6,.43,D+.55,0x55544e);
 for(let j=0;j<2;j++)for(let i=0;i<12;i++){
  const X=-5.59+i*1.02+.13*(j%2);
  if(X>5.70)continue;
  for(const z of [-3.93,3.93])box(X,j*.17+.027,z,.82+rnd()*.16,.13,.12,pick(STONE));
 }
 box(0,.35,0,W-.27,H-.32,D-.24,0x69462f);
 for(let j=0;j<9;j++){
  const h=.63+j*.448;
  const alongX=W*.5+(j%2?.43:.77),alongZ=D*.5+(j%2?.78:.44);
  const wobble=(rnd()-.5)*.033;
  for(let k=-1;k<=1;k+=2){
   log(0,-alongX*1.006,alongX,h+wobble,k*D*.5,.246,pal.wood[(j+(k>0?1:0))%5],k===1||j%2===0);
   // Stagger X-facade slightly vertically: the alternate notches visibly lock.
   log(2,-alongZ,alongZ,h+.105+wobble,k*W*.5,.227,pal.wood[(j+3)%5],j%2===0);
  }
  for(let i=0;i<7;i++){
   const L=-5.5+i*1.58+rnd()*.43, U=L+.36+rnd()*.67;
   const Y=h+(rnd()-.5)*.17,Z=D*.5+.235+(rnd()*.011);
   quad(V(L,Y,Z),V(U,Y+(rnd()-.5)*.038,Z),V(U-.08,Y+.019,Z),V(L+.08,Y+.015,Z),pick([0x704829,0xa68356,0xba8c5a]));
  }
 }
 // Stepped gable timbers sit beneath the deep eaves on both end walls.
 for(let j=0;j<6;j++){
  const h=H+.075+j*.424,w=(D*.52)*(1-(h-H)/(R-H));
  if(w>.24)for(const side of [-1,1])log(2,-w,w,h,side*(W*.5-.08),.23,pal.wood[(j+2)%5],false);
 }
 function roofPoint(x,u,side,raise=0){return V(x,R+(H-R-.19)*u+raise,side*4.52*u);}
 for(const side of [-1,1]){
  quad(roofPoint(-6.7,0,side),roofPoint(6.7,0,side),roofPoint(6.7,1,side),roofPoint(-6.7,1,side),pal.roof[0]);
  for(let row=0;row<8;row++){
   const u=row/8, v=(row+1)/8+.009;
   for(let col=0;col<15;col++){
    const x0=Math.max(-6.68,-6.68+(col-(row%2)*.47)*.95),x1=Math.min(6.68,-6.68+(col+1-(row%2)*.47)*.95-.028);
    if(x1-x0<.08)continue;
    const raise=.037+(rnd()*.012);
    quad(roofPoint(x0,u,side,raise),roofPoint(x1,u,side,raise),
       roofPoint(x1,v,side,raise+.022),roofPoint(x0,v,side,raise+.022),pick(pal.roof));
   }
  }
  for(const x of [-6.72,6.72]) {
   quad(roofPoint(x,0,side,.05),roofPoint(x+.08,0,side,-.17),
       roofPoint(x+.08,1,side,-.22),roofPoint(x,1,side,.06),pal.trim);
   quad(roofPoint(x,0,side,.09),roofPoint(x+.04,1,side,.10),
       roofPoint(x+.16,1,side,.10),roofPoint(x+.13,0,side,.09),0x59422f);
  }
  box(0,H-.24,side*4.5,13.57,.21,.16,pal.trim);
 }
 box(0,R+.018,0,13.50,.13,.13,pal.roof[1]);
 // Split fieldstone chimney, capped lintel, and terracotta mouth.
 const chimX=index%2===0?3.4:-3.55,chimZ=-1.54;
 box(chimX,5.54,chimZ,1.25,2.92,1.30,0x59554c);
 for(let row=0;row<6;row++)for(let j=0;j<3;j++){
  const f=chimX-.44+j*.435+(row%2?.04:-.045),y=5.64+row*.435;
  for(const side of [-1,1])box(f,y,chimZ+side*.652,.36+rnd()*.065,.365,.104,pick(STONE));
  const t=chimZ-.43+j*.433+(row%2?.028:-.039);
  for(const side of [-1,1])box(chimX+side*.622,y,t,.102,.365,.36+rnd()*.065,pick(STONE));
 }
 box(chimX,8.30,chimZ,1.47,.18,1.50,0x9c8b77);
 box(chimX,8.49,chimZ,.72,.35,.74,0x775446);
 box(chimX,8.828,chimZ,.53,.018,.55,0x353431);
 // Visible glazing is independently batched; restrained emissive tint gives
 // the warmly occupied windows a highlight without lighting the whole road.
 function window(axis,a,b,y,w,h,sign,kind=0){
  const bBox=(v,Y,t,WW,HH,DD,col,target=shell)=>axis===0?box(v,Y,t,WW,HH,DD,col,target):box(t,Y,v,DD,HH,WW,col,target);
  bBox(a,y,b,w+.25,h+.22,.19,0x4f3223);bBox(a,y+.062,b+.055*sign,w+.052,h+.068,.19,pal.trim);
  const glass=kind===0?0xffbc6a:0xffd48b;
  bBox(a,y+.164,b+.167*sign,w-.242,h-.176,.026,glass,light);
  bBox(a+(kind===0?-.11:.08),y+.168,b+.186*sign,(w-.22)*.30,h-.176,.015,0xffe5a8,light);
  bBox(a,y+.109,b+.204*sign,.092,h+.02,.10,0x5b412b);
  bBox(a,y+h*.52,b+.205*sign,w+.01,.085,.10,0x604833);
  bBox(a,y-.025,b+.17*sign,w+.33,.12,.33,pal.trim);
  for(const surf of [-1,1])bBox(a+surf*(w*.5+.24),y+.115,b+.104*sign,.26,h-.02,.115,pal.roof[0]);
 }
 for(const q of [-3.7,3.65])window(0,q,D*.5+.19,1.78,1.72,1.48,1,q>0?0:1);
 for(const sign of [-1,1])window(2,.05,sign*(W*.5+.19),2.0,1.72,1.47,sign,index%2);
 window(0,2.55,-D*.5-.19,1.78,1.45,1.38,-1,index%2);
 const front=D*.5+.27;
 box(0,.35,front,1.80,2.99,.25,pal.trim);
 box(0,.47,front+.148,1.48,2.69,.11,0x644329);
 for(let j=0;j<6;j++)box(-.62+j*.245,.53,front+.215,.035,2.53,.035,0x9d673d);
 window(0,0,front+.243,2.17,.79,.68,1,1);
 box(.48,1.48,front+.310,.12,.12,.14,0xb49750);
 // Porch deck and hardware; asymmetrical woodshed list keeps silhouettes from
 // repeating, while firewood end grain holds clear at camera distance.
 const deckZ=4.96,deckW=8.66;
 box(0,.095,deckZ,deckW,.37,2.95,0x563a2a);
 for(let j=0;j<11;j++)box(0,.485,deckZ-1.34+j*.265,deckW,.07,.245,pick(pal.wood));
 for(const q of [-3.95,3.95]){
  box(q,.48,6.17,.28,3.11,.30,0x60462e);
  box(q,.53,6.31,.36,.16,.33,0x94704c);
  box(q,.58,5.94,.18,1.08,.20,0x674937);
 }
 box(0,3.45,6.19,8.35,.20,.28,pal.trim);
 for(const side of [-1,1]){
  const x0=side*3.68,x1=side*1.37;
  box((x0+x1)*.5,1.52,6.23,Math.abs(x1-x0),.12,.15,0x9b704a);
  for(let i=0;i<4;i++)box(x0+(x1-x0)*i/3,.58,6.23,.12,.94,.12,0x8e6442);
 }
 for(let j=0;j<3;j++)box(0,.09+j*.13,7.01-j*.29,2.79,.13,1.10-j*.1,pick(pal.wood));
 const aW=4.50;
 for(let k=0;k<6;k++)for(let h=0;h<9;h++){
  const dz1=k*.41,dz2=(k+1)*.41+.021;
  const x1=-aW+h, x2=Math.min(aW,x1+.97);
  const A=(x,u)=>V(x,4.31-.286*u,4.18+u);
  quad(A(x1,dz1),A(x2,dz1),A(x2,dz2),A(x1,dz2),pick(pal.roof));
 }
 const woodX=index%2?-7.13:7.13;
 for(let row=0;row<4;row++)for(let j=0;j<5-row;j++){
  const f=woodX-.82+j*.49+row*.23,h=.15+row*.39;
  log(2,2.8+rnd()*.13,4.54-rnd()*.18,h,f,.197,pick(pal.wood),row<2);
 }
 for(const side of [-1,1])box(woodX+side*1.06,-.01,3.71,.14,1.89,.17,0x654929);
 for(const target of [shell,light]){
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(target.p,3));
  g.setAttribute('color',new T.Float32BufferAttribute(target.v,3));
  g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
  const glow=target===light;
  const m=new T.Mesh(g,new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,
   roughness:glow?.45:.93,metalness:glow?.03:0,emissive:glow?0xe06a2a:0,emissiveIntensity:glow?.6:0}));
  m.name=glow?'Warm glass · '+name:'Log timber and slate · '+name;
  group.add(m);
 }
 return group;
}

export function buildMountainCabins(core, sites=mountainCabinSites(core)) {
 if(core?.id!=='track03')return null;
 const out=new T.Group();
 out.name='Switchback Summit log cabins';out.userData.sites=sites;
 for(const site of sites)out.add(cabin(site));
 return out;
}
