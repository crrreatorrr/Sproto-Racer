import * as T from 'three';

// Crown & Cloister uses the same warm sandstone/indigo palette from the grid
// keep to the far abbey. All silhouettes have readable medieval architecture
// without ever adding collision or altering the route.
const C={
 ash:0x827663, stone:[0x94816b,0xa99073,0xb69e78,0xcbb78f,0xd7c19a],
 cream:0xe5d0a4, mortar:0x7b7061, teal:0x297063, dark:0x38465a,
 timber:0x5d4237, oak:0x916449, wall:0xe0bf8b, wine:0x803940,
 slate:[0x343d56,0x404b62,0x596a7a], roof:[0x633b39,0x8f493d,0xad6149],
 thread:[0xa83f55,0x4b5582,0xe0aa52,0x4d8070],
 turf:[0x627444,0x768451,0x89935d,0x9c9d65],
 cliff:[0x6b7161,0x8c8068,0xa49474,0xc4ad82], water:[0x5b9b94,0x72b4a8,0xa3c6ac], iron:0x62646b
};
const GROUND=-6.35,TAU=Math.PI*2,mix=(a,b,t)=>a+(b-a)*t, P=(x,y,z)=>[x,y,z];
const rng=(s)=>()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296;};
const choose=(a,r)=>a[Math.floor(r()*a.length)];
const frame=(core,s,dx=0)=>{const f={};core.evalFrame(s,f);return {
 x:f.centerX+dx*f.rightX,y:f.centerY,z:f.centerZ+dx*f.rightZ,w:f.width,rx:f.rightX,rz:f.rightZ,along:f.distance
};};
function createBatch(group){
 const tiles=new Map(),colors=new Map();
 const material=new T.MeshStandardMaterial({vertexColors:true,roughness:.92,side:T.DoubleSide});
 function painter(o,yaw=0){
  const key=Math.floor(o[0]/325)+','+Math.floor(o[2]/325),c=Math.cos(yaw),s=Math.sin(yaw);
  if(!tiles.has(key))tiles.set(key,{p:[],c:[]});
  const tile=tiles.get(key);
  function local(x,y,z){return [o[0]+x*c-z*s,o[1]+y,o[2]+x*s+z*c];}
  function tri(A,B,D,color){
   tile.p.push(...A,...B,...D);
   if(!colors.has(color))colors.set(color,new T.Color(color));
   const v=colors.get(color);
   for(let i=0;i<3;i++)tile.c.push(v.r,v.g,v.b);
  }
  return {a:local,tri,quad(A,B,C,D,color){tri(A,B,C,color);tri(A,C,D,color);},sub(x,y,z,yawOffset=0){return painter(local(x,y,z),yaw+yawOffset);}};
 }
 function finish(){
  for(const [cell,{p,c}] of tiles){
   if(p.length===0)continue;
   const g=new T.BufferGeometry();
   g.setAttribute('position',new T.Float32BufferAttribute(p,3));
   g.setAttribute('color',new T.Float32BufferAttribute(c,3));
   g.computeVertexNormals();g.computeBoundingSphere();
   const m=new T.Mesh(g,material);
   m.name='Crown & Cloister stonework '+cell;group.add(m);
  }
  if(!group.children.length)material.dispose();
 }
 return {painter,finish};
}
function box(p,x,y,z,w,h,d,color){
 const A=p.a(x-w*.5,y,z-d*.5),B=p.a(x+w*.5,y,z-d*.5),D=p.a(x+w*.5,y,z+d*.5),E=p.a(x-w*.5,y,z+d*.5),
 a=p.a(x-w*.5,y+h,z-d*.5),b=p.a(x+w*.5,y+h,z-d*.5),c=p.a(x+w*.5,y+h,z+d*.5),e=p.a(x-w*.5,y+h,z+d*.5);
 p.quad(A,B,b,a,color);p.quad(B,D,c,b,color);p.quad(D,E,e,c,color);p.quad(E,A,a,e,color);p.quad(a,b,c,e,color);
}
function rod(p,x,y,z,dx,dy,dz,r,color,end=r,n=7){
 const len=Math.hypot(dx,dy,dz);
 if(len<.005)return;
 const u=Math.abs(dy/len)<.90?[dz,0,-dx]:[0,dz,-dy],d=Math.hypot(...u),a=u.map(v=>v/d);
 const b=[(dy*a[2]-dz*a[1])/len,(dz*a[0]-dx*a[2])/len,(dx*a[1]-dy*a[0])/len];
 const point=(t,r,k)=>p.a(x+dx*t+r*(Math.cos(k)*a[0]+Math.sin(k)*b[0]),y+dy*t+r*(Math.cos(k)*a[1]+Math.sin(k)*b[1]),z+dz*t+r*(Math.cos(k)*a[2]+Math.sin(k)*b[2]));
 for(let i=0;i<n;i++){
  const s=i/n*TAU,t=(i+1)/n*TAU;
  const a=point(0,r,s),c=point(0,r,t),d=point(1,end,t),e=point(1,end,s);
  p.quad(a,c,d,e,color);p.tri(point(1,0,0),d,e,color);
 }
}
function plank(p,x1,y1,x2,y2,z,width,color){
 const l=Math.hypot(x2-x1,y2-y1),a=(y2-y1)/l*width*.5,b=(x1-x2)/l*width*.5;
 p.quad(p.a(x1-a,y1-b,z),p.a(x2-a,y2-b,z),p.a(x2+a,y2+b,z),p.a(x1+a,y1+b,z),color);
}
function flag(p,x,y,z,hue,hang=false){
 if(hang){
  const f=(x,y,z)=>p.a(x,y,z);const w=1.40,h=2.24;
  p.quad(f(x-w/2,y,z),f(x+w/2,y,z+.065),f(x+w*.46,y-h*.69,z+.12),f(x-w*.46,y-h*.68,z+.16),hue);
  p.tri(f(x-w*.46,y-h*.68,z+.16),f(x+w*.46,y-h*.69,z+.12),f(x,y-h,z+.20),hue);
  p.quad(f(x-.63,y-.14,z+.13),f(x+.64,y-.14,z+.13),f(x+.64,y-.25,z+.14),f(x-.63,y-.25,z+.13),0xe4bc70);
  p.tri(f(x,y-.75,z+.18),f(x+.39,y-1.37,z+.19),f(x-.4,y-1.34,z+.18),0xf0d498);
 }else{
  rod(p,x,y-4,z,0,4.2,0,.075,0x655545,.045,6);
  p.quad(p.a(x,y,z),p.a(x+1.67,y-.08,z+.29),p.a(x+1.77,y-.69,z+.32),p.a(x,y-.83,z),hue);
  p.tri(p.a(x+1.67,y-.08,z+.29),p.a(x+2.27,y-.42,z+.20),p.a(x+1.77,y-.69,z+.32),hue);
 }
}
function roof(p,w,y,d,h,tiles,heading=0){
 const q=p.sub(0,0,0,heading);
 const P=(x,r,side)=>q.a(x,y+h*r,side*d*.5*(1-r));
 for(const side of [-1,1]){
  for(let row=0;row<5;row++){
   const a=row/5,b=(row+1)/5;
   for(let col=0;col<8;col++){
    const u=(col/8-.5)*w,v=((col+1)/8-.5)*w;
    const colr=tiles[(col*5+row*2+(side===1?1:0))%tiles.length];
    q.quad(P(u,a,side),P(v,a,side),P(v,b,side),P(u,b,side),colr);
   }
  }
  if(side===1)for(const x of [-w*.5,w*.5])q.tri(P(x,0,-1),P(x,0,1),P(x,1,side),C.timber);
 }
 box(q,0,y+h-.03,0,w+.17,.15,.25,tiles[0]);
}
function opening(p,x,y,z,w,h,rim,inside=C.dark,arch=false){
 if(!arch){
  box(p,x,y,z,w+0.29,h+.22,.15,rim);
  box(p,x,y+.12,z+.088,w,h-.05,.075,inside);return;
 }
 const r=w*.5,h0=h-r;
 for(let i=0;i<9;i++){
  const s=i/9*Math.PI,t=(i+1)/9*Math.PI;
  const v=(r,e)=>p.a(x+Math.cos(e)*r,y+h0+Math.sin(e)*r,z+.105);
  p.tri(p.a(x,y+h0,z+.105),v(r,s),v(r,t),inside);
  p.quad(v(r,s),v(r,t),v(r+.19,t),v(r+.19,s),C.stone[(i+2)%5]);
 }
 box(p,x,y,z,w,h0,.13,inside);
 for(const side of [-1,1])box(p,x+side*(r+.095),y,z,.24,h0+.08,.26,rim);
}
// Shallow trim is modeled rather than painted, so it holds a silhouette and
// catches sidelight in the actual chase camera.
function pilaster(p,x,z,h,width=1.12){
 box(p,x,0,z,width*1.39,.60,.87,C.stone[1]);
 box(p,x,.59,z,width,h-.69,.69,C.stone[3]);
 box(p,x,h-.31,z,width*1.39,.31,.86,C.cream);
}
function glassRose(p,x,y,z,r){
 const n=24,hues=[0x2595ad,0x5378b0,0xc78736,0x9a536b,0x86bba8,0xe5ab53];
 const L=(a,r,d)=>p.a(x+Math.cos(a)*r,y+Math.sin(a)*r,z+d);
 for(let k=0;k<n;k++){
  const a=k/n*TAU,b=(k+1)/n*TAU;
  p.quad(L(a,r,0),L(b,r,0),L(b,r*1.17,.075),L(a,r*1.17,.075),C.cream);
  p.quad(L(a,.37*r,.031),L(b,.37*r,.031),L(b,.91*r,.03),L(a,.91*r,.03),hues[(k>>1)%hues.length]);
  p.tri(L(a,.37*r,.035),L(b,.37*r,.035),L(0,0,.035),hues[(k+2)%hues.length]);
  if(k%3===0)plank(p,x+Math.cos(a)*.16*r,y+Math.sin(a)*.16*r,x+Math.cos(a)*.94*r,y+Math.sin(a)*.94*r,z+.098,.063,0x514950);
 }
}
function shield(p,x,y,z,w,h,palette){
 const A=p.a(x-w*.5,y+h,z),B=p.a(x+w*.5,y+h,z),D=p.a(x+w*.44,y+h*.4,z+.06),E=p.a(x,y,z+.12),F=p.a(x-w*.45,y+h*.4,z+.06);
 p.quad(A,B,D,F,C.cream);p.tri(F,D,E,C.cream);
 const X=(q,j)=>p.a(x+q*w,y+j*h,z+.13);
 p.quad(X(-.41,.92),X(.41,.92),X(.35,.42),X(-.35,.42),palette);
 p.tri(X(-.35,.42),X(.35,.42),X(0,.12),palette);
 for(const I of [-1,0,1])p.tri(X(I*.19,.77),X(I*.19+.07,.49),X(I*.19-.07,.49),0xf0c478);
}
function lantern(p,x,y,z){
 const hue=0xffb555;
 box(p,x-.16,y+.38,z,.36,.09,.68,C.iron);
 box(p,x,y+.34,z+.28,.35,.12,.34,C.iron);
 box(p,x,y,z+.28,.26,.35,.25,hue);
 box(p,x,y-.04,z+.28,.39,.07,.39,C.iron);
 for(const dx of [-.142,.142])box(p,x+dx,y,z+.418,.036,.34,.035,C.iron);
}
function steppedPortal(p,z,w,h){
 const n=14,crown=h-w*.45;
 const ring=(a,r,d)=>p.a(Math.cos(a)*r,crown+Math.sin(a)*r*1.06,z+d);
 const t=w*.5;
 for(let i=0;i<n;i++){
  const a=i/n*Math.PI,b=(i+1)/n*Math.PI;
  p.quad(ring(a,t,.12),ring(b,t,.12),ring(b,t+.39,.23),ring(a,t+.39,.23),i%3===1?C.cream:C.stone[(i+2)%5]);
  p.quad(ring(a,t,-.84),ring(b,t,-.84),ring(b,t,.12),ring(a,t,.12),C.mortar);
  p.quad(ring(a,t+.39,.23),ring(b,t+.39,.23),ring(b,t+.54,.32),ring(a,t+.54,.32),C.stone[0]);
  p.tri(ring(a,t,-.10),ring(b,t,-.10),p.a(0,crown,z-.22),0x303144);
 }
 for(const side of [-1,1])pilaster(p,side*(t+.39),z+.145,crown+.2,.84);
 box(p,0,0,z-.285,w,crown,.12,0x333446);
 for(let i=0;i<7;i++){
  const x=((i+.5)/7-.5)*w;
  box(p,x,.09,z-.19,.069,crown+.72,.069,0x756b5e);
 }
 for(const y of [1.32,2.91,4.96])box(p,0,y,z-.15,w,.073,.073,0x8a7a62);
 for(let m=0;m<3;m++)box(p,0,.11*m,z+.99+m*.43,w+1.05-.24*m,.12,.62,C.stone[(m+2)%5]);
}
function castleTower(p,r,h,serial){
 const sides=12;
 const Q=(k,r,y)=>p.a(Math.cos(k/sides*TAU)*r,y,Math.sin(k/sides*TAU)*r);
 const steps=[[0,r*1.14],[1.7,r*1.08],[2.25,r],[h-3,r*.94],[h-2.78,r*1.04],[h-2.44,r*1.05],[h-2.21,r*.95],[h-1.48,r*1.07],[h,r*1.09]];
 for(let j=0;j<steps.length-1;j++){
  const [a,l]=steps[j],[b,u]=steps[j+1],rows=j===2?10:1;
  for(let i=0;i<sides;i++)for(let row=0;row<rows;row++){
   const v=row/rows,w=(row+1)/rows;
   p.quad(Q(i,mix(l,u,v),mix(a,b,v)),Q(i+1,mix(l,u,v),mix(a,b,v)),
    Q(i+1,mix(l,u,w),mix(a,b,w)),Q(i,mix(l,u,w),mix(a,b,w)),C.stone[(i+j+row+serial)%5]);
  }
 }
 for(let i=0;i<sides;i++){
  const k=i/sides*TAU,rim=p.sub(Math.cos(k)*r*.92,0,Math.sin(k)*r*.92,k);
  box(rim,0,h-.11,0,1.05,1.48,1.52,C.stone[(i+2)%5]);
  box(rim,0,h+1.31,0,1.21,.19,1.68,C.cream);
  if(i%2===0)box(rim,0,h-1.94,0,1.07,.45,1.82,C.stone[(i+1)%5]);
 }
 if(serial%2===0){
  rod(p,0,h-.1,0,0,6.1,0,r*.83,C.slate[0],.035,9);
  flag(p,0,h+6.14,0,C.thread[serial%4]);
 }else flag(p,0,h+3.71,0,C.thread[serial%4]);
 for(const az of [-.70,0,.70]){
  const b=p.sub(Math.sin(az)*r*.95,0,Math.cos(az)*r*.95,-az);
  opening(b,0,h*.54,.085,.71,2.91,C.stone[1],C.dark,true);
  box(b,0,h*.54-.20,.16,1.02,.22,.36,C.cream);
 }
 if(r>4)shield(p,0,h*.30,r+.062,1.81,2.28,C.thread[serial%4]);
}
function wall(p,w,h,style=0){
 box(p,0,0,0,w,h,2.2,C.stone[1]);
 box(p,0,h-.2,0,w+.14,.36,2.54,C.stone[3]);
 const columns=Math.max(2,Math.floor(w/2.37)),rows=Math.floor(h/.94);
 for(let r=0;r<rows;r++)for(let j=0;j<columns;j++){
  const x=(j+.5)/columns*w-w*.5,y=r*h/rows+.06;
  box(p,x,y,1.105,w/columns-.11,h/rows-.1,.106,C.stone[(j*3+r+style)%5]);
 }
 const n=Math.floor(w/2.4);
 for(let i=0;i<n;i++)box(p,(i+.5)*w/n-w*.5,h,0,1.25,1.25,1.88,C.stone[(i+1)%5]);
}
function keep(p){
 box(p,0,0,-6,22,22,13.5,C.stone[2]);
 for(const side of [-1,1])castleTower(p.sub(side*10,0,1),4.9,24,side<0?0:2);
 for(const side of [-1,1])castleTower(p.sub(side*13,0,-10),4.40,21,side<0?1:3);
 wall(p.sub(0,0,2.75),16.8,13.5,1);
 wall(p.sub(0,0,-11.5),23,10,4);
 roof(p.sub(0,0,-5.1),15.4,22,14.7,5.38,C.slate,.06);
 // Square gatehouse in front of the round drum towers: shadowed opening,
 // raised central crest, adjacent stone buttresses and a slate visor.
 box(p,0,.08,3.6,9.95,13.5,1.44,C.stone[2]);
 for(const side of [-1,1]){
  pilaster(p,side*4.43,4.45,12.95,1.03);
  lantern(p,side*3.30,4.7,4.38);
 }
 steppedPortal(p,4.59,4.65,6.80);
 box(p,0,10.05,4.59,8.26,.38,.90,C.stone[0]);
 box(p,0,10.42,4.52,8.44,.22,1.04,C.cream);
 for(let i=0;i<7;i++)box(p,(i-3)*1.04,9.93,4.88,.25,.21,.42,C.stone[2]);
 shield(p,0,10.68,4.39,2.88,2.63,C.wine);
 for(const x of [-5.2,5.2]){
  flag(p.sub(x,0,8.25,x<0?.05:-.08),0,4.50,0,C.thread[x<0?0:1]);
  box(p,x,0,8.11,1.05,.39,.99,C.stone[1]);
 }

 for(const x of [-5,5]){
  opening(p,x,8.5,3.91,.86,2.1,C.stone[3],0x52637a,true);
  flag(p,x,13.3,4.16,C.thread[x<0?0:1],true);
 }
 for(const x of [-4.5,4.5])box(p,x,0,6.2,2.2,.3,4.3,C.stone[1]);
}
function guildHouse(p,w,d,H,serial){
 box(p,0,0,0,w,H*.45,d,C.stone[(serial+1)%5]);
 box(p,0,H*.45,0,w*1.045,H*.55,d*1.04,C.wall);
 roof(p,w*1.13,H,d*1.13,w*.28,serial%3===0?C.slate:C.roof);
 const z=d*.526;
 const slurry=serial%3===0?0x90a99c:serial%3===1?0xdcb675:0xca9375;
 box(p,0,H*.467,z-.086,w*1.039,H*.49,.17,slurry);
 for(const q of [-1,0,1])box(p,q*w*.45,H*.44,z,.19,H*.53,.153,C.timber);
 for(const y of [H*.43,H*.69,H*.96])box(p,0,y,z,w*1.05,.16,.139,C.timber);
 for(const sign of [-1,1]){
  plank(p,sign*w*.4,H*.47,sign*.18,H*.94,z+.1,.16,C.oak);
  opening(p,sign*w*.24,H*.59,z,.9,1.23,C.timber,0x5b7069);
  box(p,sign*w*.24,H*.57,z+.18,1.23,.16,.23,C.timber);
  box(p,sign*w*.24,H*.68,z+.27,.074,1.08,.056,C.cream);
  for(const dx of [-.65,.65])box(p,sign*w*.24+dx,H*.61,z+.14,.24,1.11,.21,serial%2?C.teal:C.wine);
 }
 opening(p,0,.06,z,1.35,2.25,C.timber,C.dark,true);
 lantern(p,.95,2.46,z+.02);
 for(const t of [-1,1])box(p,t*w*.46,.05,z,.21,H*.39,.24,C.stone[3]);
 if(serial%2===0){
  box(p,-w*.42,3.01,z+.24,.10,.10,1.26,C.iron);
  shield(p,-w*.42,2.19,z+.87,.91,.83,C.teal);
 }
 box(p,w*.31,H+.7,-d*.17,.66,H*.27,.69,C.stone[serial%5]);
 box(p,w*.31,H+.61+H*.27,-d*.17,.88,.22,.83,C.stone[1]);
}
function cart(p,x,z,scale=1){
 const q=p.sub(x,0,z,.17);
 box(q,0,.82*scale,0,1.41*scale,.19*scale,2.65*scale,0x766149);
 for(const side of [-1,1]){
  box(q,side*.69*scale,1*scale,0,.16*scale,.43*scale,2.59*scale,0x9c7351);
  const plate=q.sub(side*.84*scale,.53*scale,0,0);
  rod(plate,0,0,0,side*.11,0,0,.48*scale,0x6c4b3e,.47*scale,10);
  rod(plate,side*.04,0,0,side*.1,0,0,.188*scale,0x98907f,.17*scale,10);
 }
 for(const side of [-1,1])box(q,side*.5*scale,.79*scale,1.75*scale,.12*scale,.12*scale,1.42*scale,0x684e40);
}
function booth(p,hue){
 for(const x of [-1.54,1.54])for(const z of [-1.05,1.05]){
  box(p,x,0,z,.13,2.64,.13,C.timber);
 }
 box(p,0,.93,.25,3.37,.21,1.15,C.oak);
 for(let j=0;j<8;j++){
  const a=j/8*3.9-1.95,b=a+3.9/8;
  p.quad(p.a(a,2.86,-1.46),p.a(b,2.86,-1.46),p.a(b,2.42,1.56),p.a(a,2.42,1.56),j%2?hue:C.cream);
  p.quad(p.a(a,2.42,1.56),p.a(b,2.42,1.56),p.a(b,2.19,1.57),p.a(a,2.19,1.57),j%2?hue:C.cream);
 }
 for(const x of [-1.12,-.5,.37])box(p,x,1.14,.46,.49,.31,.56,0x977955);
}
function village(p,r){
 for(let i=0;i<4;i++)guildHouse(p.sub((i-1.5)*8.7,0,-4.3-r()*2.4,(r()-.5)*.2),6.7+r()*.9,9+r()*1.5,6.7+r()*1.3,i);
 for(let i=0;i<3;i++)booth(p.sub((i-1)*7,0,5.2,(r()-.5)*.08),C.thread[i]);
 cart(p,-12.1,5.7,.98);cart(p,12,7.1,.92);
 for(const x of [-12,-6,0,6,12])flag(p.sub(x,0,3.0),0,6.2,0,C.thread[Math.round(x+12)%4]);
}
function abbey(p,r){
 // Nave and side aisle arcade. The broken right wall is represented as a real
 // open arch sequence, not black textures painted onto stone.
 for(let k=-2;k<=2;k++){
  const q=p.sub(k*5.4,0,3.38);
  for(const x of [-2.68,2.68]){
   box(q,x,0,0,.92,6.2,1.07,C.stone[2]);
   box(q,x,5.14,0,1.19,.48,1.26,C.stone[3]);
  }
  for(let i=0;i<9;i++){
   const a=i/9*Math.PI,b=(i+1)/9*Math.PI;
   const point=(e,r,z)=>q.a(Math.cos(e)*r,5.65+Math.sin(e)*r,z);
   q.quad(point(a,2.35,.47),point(b,2.35,.47),point(b,2.82,.47),point(a,2.82,.47),C.stone[(i+2)%5]);
   q.quad(point(a,2.35,-.47),point(b,2.35,-.47),point(b,2.35,.47),point(a,2.35,.47),C.mortar);
   q.quad(point(a,2.37,.49),point(b,2.37,.49),point(b,2.48,.62),point(a,2.48,.62),C.cream);
  }
 }
 box(p,-1,0,-6,15.1,7.6,11.0,C.stone[2]);
 roof(p.sub(-1,0,-6,.015),16.4,7.6,12.6,4.1,C.slate);
 for(const x of [-8.4,-4.2,.8,6.5])pilaster(p,x,-.33,7.57,.56);
 glassRose(p,-1,5.61,-.36,1.55);
 box(p,-1,7.26,-.31,14.82,.20,.42,C.cream);
 for(const [x,z] of [[-7.8,-.16],[6.6,-.16]]){
  box(p,x,7.43,z,.63,.89,.67,C.stone[2]);
  rod(p,x,8.31,z,0,1.19,0,.40,C.stone[3],.05,7);
 }
 for(const x of [-6.6,-1,4.6])opening(p,x,1.15,-.46,1.34,4.65,C.stone[4],0x557069,true);
 box(p,-10.6,0,-4.45,5.5,18.5,6.1,C.stone[3]);
 roof(p.sub(-10.6,0,-4.45),6.04,18.4,6.4,3.6,C.slate,.03);
 opening(p,-10.6,14.3,-1.34,1.82,3.33,C.stone[1],C.dark,true);
 rod(p,-10.6,14.62,-.996,0,1.48,0,.42,0x9d8857,.36,10);
 for(const x of [-11.6,-6.6,4.7,11.5]){
  box(p,x,0,7.2,1.25,.72,1.1,C.stone[0]);
  box(p,x,0,8.26,1.43,.34,1.2,C.mortar);
 }
}
function mill(p,water=false){
 if(water){
  guildHouse(p.sub(-4.2,0,-1.6,.1),8.9,9.3,7.7,2);
  const q=p.sub(3.1,0,3.1);
  const n=16,r=3.7,y=3.9;
  for(let i=0;i<n;i++){
   const a=i/n*TAU,b=(i+1)/n*TAU;
   for(const z of [-.42,.42]){
    const v=(a,r)=>q.a(Math.cos(a)*r,y+Math.sin(a)*r,z);
    q.quad(v(a,r-.21),v(b,r-.21),v(b,r+.19),v(a,r+.19),i%2?0x765e4d:0x8d6e4e);
   }
   const X=Math.cos(a)*r,Y=y+Math.sin(a)*r;
   rod(q,0,y,0,X,Y-y,0,.105,C.timber,.075,6);
   box(q,X,Y-.11,0,.62,.21,1.36,C.oak);
  }
  rod(q,0,y,-.58,0,0,1.2,.36,0x736853,.31,9);
  for(const x of [-1.12,1.12]){
   box(q,x,0,.0,.23,2.72,1.38,C.stone[2]);
   box(q,x,2.48,0,.45,.17,1.55,C.stone[3]);
  }
  for(let i=0;i<n;i++){
   const a=i/n*TAU,b=(i+1)/n*TAU;
   const v=(a,r)=>q.a(Math.cos(a)*r,y+Math.sin(a)*r,.46);
   q.quad(v(a,r+.12),v(b,r+.12),v(b,r+.20),v(a,r+.20),C.iron);
  }
 }else{
  castleTower(p.sub(0,0,-.9),3.4,13,1);
  roof(p.sub(0,0,-.9),7.85,13.75,7.64,3.8,C.roof,.12);
  const P=(a,r,z)=>p.a(Math.cos(a)*r,11.14+Math.sin(a)*r,z);
  for(let i=0;i<4;i++){
   const a=i*TAU/4+.56;
   p.quad(P(a-.055,.56,3.53),P(a-.055,6.38,3.56),P(a+.055,6.36,3.63),P(a+.055,.56,3.57),C.timber);
   p.quad(P(a+.035,2.1,3.56),P(a+.035,6.38,3.56),P(a+.27,6.38,3.57),P(a+.55,2.63,3.56),0xe2c395);
   for(let m=0;m<4;m++){
    const t=2.56+m*.87;
    p.quad(P(a+.03,t,3.59),P(a+.03,t+.13,3.59),P(a+.33,t+.13,3.59),P(a+.34,t,3.59),0x957654);
    if(m%2===0)p.quad(P(a+.06,t,3.635),P(a+.10,t,3.635),P(a+.10,t+.70,3.635),P(a+.06,t+.70,3.635),0xe5c997);
   }
  }
  rod(p,0,11.14,3.52,0,0,.37,.29,C.oak,.23,8);
 }
}
function canopy(p,h,w,r,fall=false){
 rod(p,0,0,0,(r()-.5)*.65,h*.66,(r()-.5)*.45,w*.10,C.timber,w*.053,7);
 const colors=fall?[0x7e663c,0xae7b47,0xc19b5d,0xcdac65]:[0x4f6946,0x617a4f,0x7d8c56,0x97a262];
 const lobes=[[0,h*.63,0,w],[-w*.38,h*.53,w*.18,w*.72],[w*.42,h*.69,-w*.22,w*.72]];
 for(const [x,y,z,R] of lobes){
  const n=7,A=[],B=[];
  for(let i=0;i<n;i++){
   const az=i/n*TAU,L=R*(.85+r()*.23);
   A.push(p.a(x+Math.cos(az)*L,y+(r()-.5)*.43,z+Math.sin(az)*L));
   B.push(p.a(x+Math.cos(az+.16)*L*.70,y+R*.58+(r()-.5)*.25,z+Math.sin(az+.16)*L*.70));
  }
  for(let i=0;i<n;i++){
   const j=(i+1)%n;
   p.quad(A[i],A[j],B[j],B[i],colors[(i+1)%4]);
   p.tri(B[i],B[j],p.a(x-.19,y+R*.94,z+.21),colors[(i+2)%4]);
   p.tri(A[j],A[i],p.a(x+.12,y-R*.40,z-.13),colors[0]);
  }
 }
}
function hill(p,h,rx,rz,colors,r,terrace=false){
 if(h<.90)return;
 const n=11,shape=Array.from({length:n},()=>.84+r()*.22);
 const steps=terrace?[[1,0],[.99,.32],[.93,.55],[.89,.69],[.83,.86],[.79,1.0]]:[[1,0],[.93,.24],[.74,.54],[.58,.71],[.27,.91]];
 const rings=steps.map(([r,y],j)=>shape.map((v,i)=>{
  const a=i/n*TAU+j*.054;
  return p.a(Math.cos(a)*rx*r*v+j*rx*.018,h*(y+(j===0||(terrace&&j===steps.length-1)?0:Math.sin(a*2+j)*.065)),Math.sin(a)*rz*r*v);
 }));
 for(let i=0;i<n;i++){
  const k=(i+1)%n;
  for(let j=0;j<rings.length-1;j++){
   p.quad(rings[j][i],rings[j][k],rings[j+1][k],rings[j+1][i],colors[(j+(i%3===1?1:0))%colors.length]);
  }
  p.tri(rings.at(-1)[i],rings.at(-1)[k],p.a(rx*.09,h,0),colors.at(-1));
 }
}
function gearFence(p,w,h=1.14){
 const n=Math.ceil(w/2.6);
 for(let i=0;i<=n;i++){
  const x=(i/n-.5)*w;
  box(p,x,0,0,.16,h,.18,C.timber);
  if(i<n)for(const y of [.27,h*.73])box(p,x+w/(2*n),y,0,w/n+.08,.15,.16,C.oak);
 }
}
function bridgeOutpost(p,r){
 guildHouse(p.sub(-6,0,-4.7,.14),6,7,6.3,0);
 guildHouse(p.sub(4,0,-5.4,-.1),7,8,7.1,3);
 castleTower(p.sub(10,0,2.3),3.4,15,3);
 gearFence(p.sub(-4.0,0,4.8,.085),14.4);
 cart(p,-7,2.6);
}
function ridgeRuins(p,r){
 wall(p.sub(-4,0,-5,.07),16.8,6.6,3);
 castleTower(p.sub(-10.2,0,1.0),3.6,14.9,5);
 castleTower(p.sub(8,0,-5),4.1,13.2,7);
 for(const x of [-7,-2.6,2.3,7,10.4]){
  const h=1.33+r()*3.85;
  box(p,x,0,3+r()*2,1.11,h,1.14,choose(C.stone,r));
  box(p,x,h,3,.79,.31,1.0,C.stone[3]);
 }
}
function basin(p,radius,length,r){
 const n=17, outer=[],foot=[],inside=[],middle=[];
 for(let i=0;i<n;i++){
  const a=i/n*TAU,u=radius*(.78+r()*.23),v=length*(.81+r()*.22);
  outer.push(p.a(Math.cos(a)*u,0,Math.sin(a)*v));
  foot.push(p.a(Math.cos(a)*u*1.09,-.68,Math.sin(a)*v*1.092));
  inside.push(p.a(Math.cos(a)*u*.77,-.42,Math.sin(a)*v*.78));
  middle.push(p.a(Math.cos(a)*u*.53,-.37,Math.sin(a)*v*.54));
 }
 for(let i=0;i<n;i++){
  const j=(i+1)%n;
  p.quad(foot[i],foot[j],outer[j],outer[i],C.turf[(i+2)%4]);
  p.quad(outer[i],outer[j],inside[j],inside[i],i%2?C.cliff[2]:C.cliff[0]);
  p.quad(inside[i],inside[j],middle[j],middle[i],C.water[i%3]);
  p.tri(middle[i],middle[j],p.a(0,-.36,0),C.water[1]);
 }
 for(let i=0;i<22;i++){
  const x=(r()-.5)*radius*1.52,z=(r()-.5)*length*1.44,y=-.335;
  if((x/radius)**2+(z/length)**2>.51)continue;
  const w=.45+r()*2.3;
  p.tri(p.a(x,y,z),p.a(x+w,y,z+.049),p.a(x+.49*w,y,z+.22),C.water[(i+2)%3]);
 }
}
function clearance(core){
 const grid=new Map(),cell=86,f={},arr=[];
 for(let s=0;s<core.length;s+=7){
  core.evalFrame(s,f);
  const lane=core.sky?.laneAt(s)??-1;
  const raw=Math.max(f.width*.5,lane>=0?core.sky.lanes[lane].width*.5+8:0,s<155||s>core.length-30?33:0);
  const x=f.centerX,z=f.centerZ,key=Math.floor(x/cell)+','+Math.floor(z/cell);
  if(!grid.has(key))grid.set(key,[]);
  grid.get(key).push([x,z,raw]);
 }
 return {
  reserve(x,z,r){arr.push([x,z,r]);},
  ok(x,z,r,margin=8,occupied=true){
   if(occupied&&arr.some(([a,b,rad])=>(x-a)**2+(z-b)**2<(r+rad+2)**2))return false;
   const d=r+58,a=Math.floor((x-d)/cell),b=Math.floor((x+d)/cell),
      c=Math.floor((z-d)/cell),e=Math.floor((z+d)/cell);
   for(let u=a;u<=b;u++)for(let v=c;v<=e;v++)
    for(const [X,Z,k] of grid.get(u+','+v)??[])
     if((x-X)**2+(z-Z)**2<(k+r+margin)**2)return false;
   return true;
  }
 };
}
const SETS=[
 [0,.41,1,'Crown Gate keep',28,keep],[1,.48,1,'Merchant guild houses and market',25,village],
 [2,.39,-1,'Cloister abbey and Gothic arcade',22,abbey],
 [3,.39,1,'Bell tower and waystation',20,bridgeOutpost],
 [4,.38,-1,'Upper gargoyle watchtower ruins',21,ridgeRuins],
 [5,.32,1,'Rampart waystation',20,bridgeOutpost],
 [6,.51,-1,'Stone nave and cloister arch',21,abbey],
 [7,.42,1,'Meadow windmill',13,(p)=>mill(p,false)],
 [8,.57,-1,'Watermill and timber wheel',16,(p)=>mill(p,true)],
 [9,.36,1,'Riverside tithe hamlet',24,village],
 [10,.50,-1,'Orchard farmhouse and mill',14,(p)=>mill(p,false)],
 [11,.38,-1,'King’s Road gate towers',23,ridgeRuins],
];
/** Static visuals only. Normal trackGroup traversal owns and disposes all meshes. */
export function buildTrackArt(core){
 if(core.id!=='track04')return null;
 const group=new T.Group();
 group.name='Crown & Cloister · castle, abbey, village and gorge';
 const b=createBatch(group),guard=clearance(core),r=rng(0xa340fbd2);
 const stats={landmarks:[],woods:0,terrain:0,riverPools:0};
 for(const [index,t,side,label,extent,build] of SETS){
  const {start,end}=core.sections[index],s0=mix(start,end,t);
  let done=false;
  for(const sideSign of [side,-side]){
   for(const seek of [0,30,-31,68,-68,108]){
    const ss=s0+seek,f=frame(core,ss);
    for(const extra of [12,25,39,61]){
     const q=frame(core,ss,sideSign*(f.w*.5+extent+extra));
     if(!guard.ok(q.x,q.z,extent,12))continue;
     const level=Math.max(GROUND+.20,f.y-(index===4?8:4.5));
     const yaw=Math.atan2(-sideSign*q.rz,-sideSign*q.rx)-Math.PI*.5;
     const top=b.painter(P(q.x,level,q.z),yaw);
     if(level>GROUND+.82){
      const plinth=b.painter(P(q.x,GROUND-.40,q.z),yaw);
      const rocks=index>=3&&index<=5;
      hill(plinth,level-GROUND+.45,extent*.90,extent*.83,rocks?C.cliff:C.turf,r,true);
     }
     build(top,r);
     // Cloth pennants frame the approach but leave the facade readable.
     for(const x of [-extent*.48,extent*.48])
      flag(top.sub(x,0,Math.min(6,extent*.32)),0,4.1,0,C.thread[(index+Math.sign(x)+4)%4]);
     stats.landmarks.push({name:label,sector:index+1,distance:Math.round(ss),offset:Math.round(Math.hypot(q.x-f.x,q.z-f.z)),x:q.x,y:level,z:q.z});
     guard.reserve(q.x,q.z,extent+3);
     done=true;break;
    }
    if(done)break;
   }
   if(done)break;
  }
 }
 // Broad cliff-foot rock masses and mixed woods keep the elevated gorge from
 // reading as isolated spires. Dark cliff layers alternate with sandstone seams.
 for(let s=67;s<core.length;s+=73){
  const f=frame(core,s),side=r()>.5?1:-1;
  const rad=13+r()*18,q=frame(core,s,side*(f.w*.5+rad+23+r()*32));
  if(!guard.ok(q.x,q.z,rad+2,11))continue;
  const inGorge=core.sky.inMainLane(s,47);
  const isHigh=f.y>39,h=isHigh?11+r()*14+f.y*.72:2.4+r()*8;
  const yaw=Math.atan2(q.rz,q.rx)+r()*1.3;
  const p=b.painter(P(q.x,GROUND-.25,q.z),yaw);
  hill(p,h,rad*.97,rad*.76,inGorge?C.cliff:isHigh?C.cliff:C.turf,r);
  if(inGorge)hill(p.sub(rad*.42,-.01,rad*.22),h*.66,rad*.43,rad*.48,C.cliff,r);
  stats.terrain++;
 }
 for(let s=38;s<core.length;s+=44){
  const f=frame(core,s),side=r()>.55?1:-1;
  const o=frame(core,s,side*(f.w*.5+22+r()*25));
  if(!guard.ok(o.x,o.z,14,8))continue;
  const yaw=Math.atan2(o.rz,o.rx);
  const h=Math.max(0,Math.min(32,f.y-GROUND-8));
  const raised=h>4;
  if(raised)hill(b.painter(P(o.x,GROUND-.3,o.z),yaw),h,9.3,12.1,C.turf,r,true);
  for(let k=0;k<3;k++){
   const p=b.painter(P(o.x,GROUND+(raised?h*.91:0),o.z),yaw).sub((r()-.5)*6,0,(k-1)*5);
   if(guard.ok(o.x,o.z,13,8)){
    canopy(p,5+r()*7,2.7+r()*2,r,s>core.sections[10].start&&k%2===0);stats.woods++;
   }
  }
  if(r()<.18&&!raised)gearFence(b.painter(P(o.x,GROUND,o.z),yaw+1.37),11.7);
 }
 // Beds contain colored water and current catchlights; they never undercut an
 // elevated deck or create a collision volume. Rivers get most pools, gorge has one.
 for(const [index,fraction,side] of [[4,.58,1],[8,.37,-1],[8,.79,1],[9,.23,-1],[9,.57,-1],[9,.80,1],[11,.49,1]]){
  const sec=core.sections[index],s=mix(sec.start,sec.end,fraction),f=frame(core,s);
  for(const shift of [0,24,-38,64]){
   const q=frame(core,s+shift,side*(f.w*.5+55+Math.abs(shift)*.19));
   if(!guard.ok(q.x,q.z,31,7))continue;
   const yaw=Math.atan2(q.rz,q.rx)+1.57;
   const p=b.painter(P(q.x,GROUND+.63,q.z),yaw);
   hill(p.sub(0,-.64,0),1.25,25,30,C.turf,r,true);
   basin(p,18,25,r);
   stats.riverPools++;break;
  }
 }
 group.userData.medievalStats=stats;
 b.finish();
 return group;
}
