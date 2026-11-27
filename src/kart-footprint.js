import {conceptCarById} from './concept-roster.js';
import {cartAxles,cartHalfTrack,cartDriver,cartHandle,cartFloor,basketPoint} from './shopping-cart-layout.js';
import {skipperSection,skipperStations,skipperAxles,skipperHalfTrack,skipperWheelWidth,skipperCabin,skipperMotor,skipperDriver} from './skipper-layout.js';
import {saucerRadius,saucerDriver,saucerProfile,saucerLipHeight,saucerSeatBack,screenPoint} from './saucer-layout.js';
import {mantaSection,mantaSweptZ,mantaEnds,mantaDriver,mantaAxles,mantaHalfTrack,mantaWheelWidth} from './manta-layout.js';
import {crestlineOutline,crestlineRoof,crestlineAxles,crestlineHalfTrack} from './crestline-layout.js';
import {ironhideAxles,ironhideHalfTrack,ironhideTireWidth,ironhideDriver,ironhideBumper,ironhideScreen,ironhideRoof} from './ironhide-layout.js';
import {fullLockCurvature,frontWheelAngle} from './steering.js';
import {barragePerimeter,barrageAxles,barrageHalfTrack,barrageTireWidth,barrageMuzzle,barrageWing,barrageDriver} from './barrage-layout.js';
import {geepScale,geepAxles,geepHalfTrack,geepTireWidthScale} from './geep-layout.js';
import {PI,cos,hypot,sin} from './sim/math.js';

export const isGeep = kart => kart.tuning?.id === 'geep';
export const hasShapedBody = kart => !!conceptCarById(kart.tuning?.id) || kart.tuning?.id==='shopping-cart' || kart.tuning?.id==='skipper' || kart.tuning?.id==='saucer' || kart.tuning?.id==='manta' || kart.tuning?.id==='crestline' || isGeep(kart) || kart.tuning?.id==='barrage' || kart.tuning?.id==='ironhide';
const rotate = (s,x,c,sn) => ({s:s*c-x*sn,x:s*sn+x*c});

function convexHull(points) {
  const sorted=points.slice().sort((a,b)=>a.s-b.s || a.x-b.x);
  function chain(order){
    const result=[];
    for(let i=0;i<order.length;i++){
      const p=order[i];
      while(result.length>=2){
        const a=result[result.length-2],b=result[result.length-1];
        if((b.s-a.s)*(p.x-a.x)-(b.x-a.x)*(p.s-a.s)>1e-9)break;
        result.pop();
      }
      result.push(p);
    }
    result.pop();return result;
  }
  const lower=chain(sorted);
  sorted.reverse();
  return [...lower,...chain(sorted)];
}

function geepOutline(curvature){
  const points=[];
  for(const side of [-1,1]){
    for(const [s,x] of [[2.297,.36],[2.271,.84],[2.16,.94],[-2.10,.65]]){
      points.push({s,x:side*x});
    }
    for(const [z,radius] of geepAxles){
      const front=z<0,angle=front?frontWheelAngle('geep',curvature,side):0;
      const c=cos(angle),sn=sin(angle),width=geepTireWidthScale(front);
      for(const [w,r] of [[.10,1],[.151,.94],[.17,.886],[.184,.761],[.196,.09]])for(const end of [-1,1])for(const edge of [-1,1]){
        const p=rotate(end*r*radius,edge*w*width,c,sn);
        points.push({s:p.s-z,x:p.x+side*geepHalfTrack});
      }
    }
  }
  return convexHull(points).map(p=>({s:p.s*geepScale,x:p.x*geepScale}));
}

function span(points,s,x){
  let lo=Infinity,hi=-Infinity;
  for(let i=0;i<points.length;i++){
    const p=points[i];
    const d=p.s*s+p.x*x;
    if(d<lo)lo=d;
    if(d>hi)hi=d;
  }
  return {lo,hi};
}

function polygon(points){
  const axes=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],ds=b.s-a.s,dx=b.x-a.x,len=hypot(ds,dx);
    const s=-dx/len,x=ds/len;
    if(axes.some(n=>Math.abs(n.s*s+n.x*x)>.999999))continue;
    axes.push({s,x,...span(points,s,x)});
  }
  return {points,axes};
}

// A circle around a convex outline, and how sharp its sharpest corner is (the sine of half the
// smallest interior angle; 0 when the outline is not a proper convex polygon). See hullsApart.
function discOf(shape){
  if(shape.disc)return shape.disc;
  const points=shape.points,count=points.length;
  let minS=Infinity,maxS=-Infinity,minX=Infinity,maxX=-Infinity;
  for(let i=0;i<count;i++){
    const p=points[i];
    minS=Math.min(minS,p.s);maxS=Math.max(maxS,p.s);minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);
  }
  const s=(minS+maxS)/2,x=(minX+maxX)/2;
  let radius=0,sharp=count>=3?1:0,turning=0;
  for(let i=0;i<count;i++){
    const a=points[(i+count-1)%count],p=points[i],b=points[(i+1)%count];
    radius=Math.max(radius,hypot(p.s-s,p.x-x));
    const us=a.s-p.s,ux=a.x-p.x,vs=b.s-p.s,vx=b.x-p.x,lu=hypot(us,ux),lv=hypot(vs,vx);
    const cross=us*vx-ux*vs;
    // Every corner must turn the same way, or this is not a convex outline in order.
    if(!(lu>0&&lv>0) || cross*turning<0)sharp=0;
    else if(cross!==0){
      turning=cross;
      sharp=Math.min(sharp,Math.sqrt(Math.max(0,(1-(us*vs+ux*vx)/(lu*lv))/2)));
    }
  }
  if(!(radius>=0))sharp=0;
  return shape.disc={s,x,radius,sharp};
}

// True only when two outlines are certainly clear of each other, in which case
// footprintContact(a,b,ds,dx) is null and need not be run. It never changes an answer:
//
// - footprintContact reports contact only if the outlines overlap by more than 0.1 mm along
//   every edge normal it keeps. polygon() drops a normal that is within 0.999999 (cosine) of one
//   it already has, so each true edge normal is represented to within 1.42 mrad.
// - Two convex outlines a distance d apart are separated by d along some edge normal when the
//   nearest points involve an edge, and by at least d * sin(corner / 2) when corner meets
//   corner. `sharp` is that sine for the sharpest corner of an outline.
// - Swinging the axis by 1.42 mrad moves the projected gap by at most 1.42 mm per metre of the
//   pair's extent, which is under twice the two radii plus the gap.
//
// So a gap of (0.003 * reach + 0.001) / (sharp - 0.002) metres beyond the two circles is more
// than enough for one kept axis to show the outlines apart. Outlines with very sharp corners
// (or none measured) are never skipped.
export function hullsApart(a,b,ds,dx){
  const sharp=Math.max(a.sharp,b.sharp);
  if(!(sharp>.05))return false;
  const reach=a.radius+b.radius,clear=reach+(.003*reach+.001)/(sharp-.002);
  const s=ds+b.centerS-a.centerS,x=dx+b.centerX-a.centerX;
  return s*s+x*x>clear*clear;
}

export function footprintBox(halfLength,halfWidth){
  return polygon([{s:-halfLength,x:-halfWidth},{s:halfLength,x:-halfWidth},
    {s:halfLength,x:halfWidth},{s:-halfLength,x:halfWidth}]);
}

function bodySection(rows){
  const pts=[];
  for(let i=0;i<rows.length;i++){
    const [z,x]=rows[i];
    pts.push({s:-z,x},{s:-z,x:-x});
  }
  return polygon(convexHull(pts));
}

function blockFootprint(x,z,halfWidth,halfLength){
  return polygon(footprintBox(halfLength,halfWidth).points.map(p=>({s:p.s-z,x:p.x+x})));
}

function orient(shape,yaw){
  const c=cos(yaw),sn=sin(yaw);
  const points=shape.points.map(p=>rotate(p.s,p.x,c,sn));
  return {points,along:span(points,1,0),across:span(points,0,1),
    axes:shape.axes.map(n=>({...rotate(n.s,n.x,c,sn),lo:n.lo,hi:n.hi}))};
}

// The same turn as orient(), written into a hull a kart already owns. A kart's heading changes
// every tick, so this runs for every kart on every tick: it must not allocate once the hull has
// reached its size. The arithmetic and its order match rotate() and span() exactly, so the
// numbers are the same bit for bit.
//
// Only the points are turned straight away, because the rail limits need them every tick. The
// edge normals and the two road-axis spans are worked out the first time something reads
// `axes`, `along` or `across`, which only happens when another kart, a hazard or an item is near.
function Hull(){
  this.points=[];
  this.discS=0;this.discX=0;this.centerS=0;this.centerX=0;this.radius=0;this.sharp=0;
  this.shape=null;this.cos=1;this.sin=0;
  this.pending=false;
  this.normals=[];
  this.spanAlong={lo:0,hi:0};this.spanAcross={lo:0,hi:0};
}

function settle(hull){
  const points=hull.points,c=hull.cos,sn=hull.sin;
  let alongLo=Infinity,alongHi=-Infinity,acrossLo=Infinity,acrossHi=-Infinity;
  for(let i=0;i<points.length;i++){
    const q=points[i],along=q.s*1+q.x*0,across=q.s*0+q.x*1;
    if(along<alongLo)alongLo=along;
    if(along>alongHi)alongHi=along;
    if(across<acrossLo)acrossLo=across;
    if(across>acrossHi)acrossHi=across;
  }
  hull.spanAlong.lo=alongLo;hull.spanAlong.hi=alongHi;
  hull.spanAcross.lo=acrossLo;hull.spanAcross.hi=acrossHi;
  const from=hull.shape.axes,count=from.length,axes=hull.normals;
  for(let i=0;i<count;i++){
    const n=from[i];
    let a=axes[i];
    if(a===undefined)a=axes[i]={s:0,x:0,lo:0,hi:0};
    a.s=n.s*c-n.x*sn;a.x=n.s*sn+n.x*c;
    a.lo=n.lo;a.hi=n.hi;
  }
  if(axes.length!==count)axes.length=count;
  hull.pending=false;
}

Object.defineProperties(Hull.prototype,{
  axes:{get(){if(this.pending)settle(this);return this.normals;},enumerable:true,configurable:true},
  along:{get(){if(this.pending)settle(this);return this.spanAlong;},enumerable:true,configurable:true},
  across:{get(){if(this.pending)settle(this);return this.spanAcross;},enumerable:true,configurable:true},
});

function orientInto(hull,shape,c,sn){
  const from=shape.points,count=from.length,points=hull.points;
  for(let i=0;i<count;i++){
    const p=from[i];
    let q=points[i];
    if(q===undefined)q=points[i]={s:0,x:0};
    const s=p.s*c-p.x*sn,x=p.s*sn+p.x*c;
    q.s=s;q.x=x;
  }
  if(points.length!==count)points.length=count;
  if(hull.shape!==shape){
    const disc=discOf(shape);
    hull.shape=shape;hull.discS=disc.s;hull.discX=disc.x;hull.radius=disc.radius;hull.sharp=disc.sharp;
  }
  hull.centerS=hull.discS*c-hull.discX*sn;hull.centerX=hull.discS*sn+hull.discX*c;
  hull.cos=c;hull.sin=sn;
  hull.pending=true;
  return hull;
}

function horizontalDisc(radius){
  const points=Array.from({length:48},(_,i)=>{
    const t=i*PI/24;
    return {s:radius*cos(t),x:radius*sin(t)};
  });
  const shape=polygon(points),disc=discOf(shape);
  return Object.assign(orient(shape,0),{centerS:disc.s,centerX:disc.x,radius:disc.radius,sharp:disc.sharp});
}

function cartShape(){
  const bands=[];
  function band(shape,low,high){bands.push({shape,low,high});}
  for(const [z,r] of cartAxles)for(const side of [-1,1]){
    band(blockFootprint(side*cartHalfTrack,z,.21,r+.01),0,.53);
  }
  band(bodySection([[-1.58,.71],[1.45,.89]]),.47,.65);
  const rim=(along,h)=>{
    const [x,y,z]=basketPoint(1,along,h);
    return [z,x,y];
  };
  band(bodySection([rim(0,.03),rim(1,.03)]),cartFloor-.04,cartFloor+.04);
  for(const side of [-1,1])for(let i=0;i<4;i++){
    const a=i/4,b=(i+1)/4;
    const rows=[rim(a,0),rim(b,0),rim(b,1),rim(a,1)];
    const points=[];
    for(const [z,x] of rows)for(const dx of [-.04,.04])for(const dz of [-.04,.04]){
      points.push({s:-z+dz,x:side*x+dx});
    }
    band(polygon(convexHull(points)),cartFloor-.04,rows[2][2]+.04);
  }
  for(const end of [0,1]){
    const [z0,,y0]=rim(end,0),[z1,x1,y1]=rim(end,1);
    band(blockFootprint(0,(z0+z1)/2,x1+.05,Math.abs(z1-z0)/2+.05),y0,y1+.05);
  }
  const h=cartHandle,d=cartDriver;
  band(blockFootprint(0,h.z,h.halfWidth,h.radius),h.y-h.radius,h.y+h.radius);
  for(const side of [-1,1])band(blockFootprint(side*.95,1.52,.16,.26),.53,h.y);
  band(blockFootprint(0,d.z,.87*d.scale,.62*d.scale),cartFloor,d.y+1.78*d.scale);
  const allPoints=[];
  for(let i=0;i<bands.length;i++)allPoints.push(...bands[i].shape.points);
  return {outline:polygon(convexHull(allPoints)),bands};
}

function mantaPanel(start,end,low,high,side=0){
  const points=[];
  for(let i=0;i<=24;i++){
    const z=start+(end-start)*i/24, section=mantaSection(z);
    const sides=side?[side]:[-1,1];
    for(const sign of sides)for(let j=0;j<section.length-1;j++){
      const [x,y]=section[j],[x2,y2]=section[j+1];
      const add=px=>points.push({s:-mantaSweptZ(px,z),x:sign*px});
      if(y>=low && y<=high)add(x);
      for(const h of [low,high])if((y<h)!==(y2<h))add(x+(x2-x)*(h-y)/(y2-y));
    }
  }
  return points.length?{shape:polygon(convexHull(points)),low,high}:null;
}

function mantaPanels(){
  const [front,rear]=mantaEnds;
  const bands=[mantaPanel(front,rear,.18,.49),mantaPanel(front,rear,.49,.76)];
  for(const [a,b] of [[front,-1.82],[1.86,rear]]){
    const blade=[];
    for(let i=0;i<=12;i++){
      const z=a+(b-a)*i/12,x=mantaSection(z)[5][0]*1.012;
      const tip=z===front?z-.025:z;
      blade.push({s:-mantaSweptZ(x,tip),x},{s:-mantaSweptZ(x,tip),x:-x},{s:-tip,x:0});
      if(z===front)for(let across=1;across<8;across++){
        const edge=x*across/8,s=-mantaSweptZ(edge,tip);
        blade.push({s,x:edge},{s,x:-edge});
      }
    }
    bands.push({shape:polygon(convexHull(blade)),low:.177,high:.23});
  }
  for(const side of [-1,1]){
    for(const [a,b] of [[front,-.71],[-.71,.68],[.68,rear]]){
      bands.push(mantaPanel(a,b,.76,.95,side),mantaPanel(a,b,.95,1.14,side));
    }
  }
  const d=mantaDriver;
  bands.push(mantaPanel(.67,1.65,1.14,1.30),
    {shape:blockFootprint(0,d.z,.89*d.scale,.61*d.scale),low:.76,high:d.y+1.78*d.scale+.03},
    {shape:blockFootprint(0,-.56,.46,.21),low:.79,high:1.015},
    {shape:blockFootprint(0,.67,.21,.11),low:1.14,high:1.34});
  return bands.filter(Boolean);
}

function slicedSkipperHull(rows,low,high){
  const points=[];
  function edge(a,b){
    if(a[1]>=low&&a[1]<=high)points.push({s:-a[2],x:a[0]});
    for(const y of [low,high]){
      if((a[1]-y)*(b[1]-y)>=0)continue;
      const t=(y-a[1])/(b[1]-a[1]);
      points.push({s:-(a[2]+t*(b[2]-a[2])),x:a[0]+t*(b[0]-a[0])});
    }
  }
  for(let i=0;i<rows.length;i++)for(let j=0;j<rows[i].length;j++){
    const a=rows[i][j];
    edge(a,rows[i][Math.min(j+1,rows[i].length-1)]);
    if(i+1<rows.length)edge(a,rows[i+1][j]);
  }
  return {shape:polygon(convexHull(points)),low,high};
}

function fixedSkipperBands(){
  const rows=skipperStations.map(row=>[...skipperSection(row,-1).reverse(),...skipperSection(row,1).slice(1)]);
  const bands=[];
  for(const [low,high] of [[.59,.78],[.78,1.015],[1.015,1.22],[1.22,1.43],[1.43,1.76]]){
    bands.push(slicedSkipperHull(rows.slice(0,6),low,high));
    if(low<1.015){
      bands.push(slicedSkipperHull(rows.slice(5),low,high));
    }else{
      for(const side of [-1,1]){
        const rails=skipperStations.slice(5).map(row=>{
          const outer=skipperSection(row,side);
          const tail=outer[outer.length-1];
          return [...outer,[tail[0]*.88,row[2],row[0]],[side*row[1]*.80,1.015,row[0]]];
        });
        bands.push(slicedSkipperHull(rails,low,high));
      }
    }
  }
  const c=skipperCabin,m=skipperMotor,d=skipperDriver;
  function box(x,z,w,l,low,high){bands.push({shape:blockFootprint(x,z,w,l),low,high});}
  box(0,.45,.82,1.20,.96,1.055);
  box(0,1.66,.87,.055,1.03,1.42);
  box(0,(c.front-.52)/2,c.halfWidth,.16,c.sill,c.roofBottom);
  box(0,(c.roofFront+c.roofRear)/2,c.roofWidth,.817,c.roofBottom,c.roofTop);
  box(d.x,d.z,.90*d.scale,.62*d.scale,1.25,d.y+1.82*d.scale);
  box(d.x,d.z+.43,.36,.082,1.15,1.76);
  box(0,m.z,m.halfWidth,m.halfDepth,m.bottom,m.top);
  box(0,2.12,.23,.215,.715,1.35);
  for(const side of [-1,1]){
    box(side*.765,.819,.085,.209,c.sill,c.roofBottom);
    box(side*.52,1.71,.14,.16,1.02,1.30);
    for(const [z] of skipperAxles)box(side*.86,z,.19,.21,.49,1.105);
  }
  return bands;
}

// Lazy singleton tables so Nakama 3.41 post-InitModule Object.freeze never freezes mutable caches.
let tables = null;
function getTables(){
  if(tables)return tables;
  const stock=footprintBox(1.75,1.25);
  const cabin=polygon([{s:-1.081,x:-.933},{s:.61,x:-.955},{s:.61,x:.955},{s:-1.081,x:.933}]
    .map(p=>({s:p.s*geepScale,x:p.x*geepScale})));
  const shoppingCart=cartShape();
  const tourerBase=bodySection(crestlineOutline);
  const tourerBonnet=bodySection([[-2.065,.43],[-.61,.71],[-.44,.80],[1.84,.80],[1.95,.69]]);
  const tourerCabin=bodySection([[-.54,.72],[-.41,.80],[1.77,.80],[1.90,.69]]);
  const tourerSpare=blockFootprint(-.80,-.64,.14,.39);
  const barrageUpper=[
    {shape:bodySection([[-1.79,.75],[-1.16,1.19],[1.50,1.29],[1.97,.76]]),low:.49,high:.86},
    {shape:blockFootprint(0,barrageDriver.z,.58,.43),low:.86,high:barrageDriver.y+1.78*barrageDriver.scale}
  ];
  for(const side of [-1,1]){
    barrageUpper.push({shape:blockFootprint(side*barrageMuzzle.x,-.77,.28,.58),low:.86,high:1.30});
    const w=barrageWing;
    barrageUpper.push({shape:blockFootprint(side*(w.inner+w.outer)/2,(w.front+w.rear)/2,
      (w.outer-w.inner)/2,(w.rear-w.front)/2),low:.86,high:w.top});
    barrageUpper.push({shape:blockFootprint(side*barrageHalfTrack,1.20,.22,.43),low:.86,high:1.09});
  }
  const saucerOutline=horizontalDisc(saucerRadius);
  const saucerBands=[];
  for(const [first,last] of [[0,4],[4,7],[7,10],[10,13],[13,17],[17,19],[19,20],[20,21],[21,23]]){
    const profile=saucerProfile.slice(first,last+1);
    let maxR=0;
    for(let i=0;i<profile.length;i++)if(profile[i][0]>maxR)maxR=profile[i][0];
    saucerBands.push({hull:horizontalDisc(maxR),low:profile[0][1],high:profile[profile.length-1][1]});
  }
  const saucerUpper=[
    {shape:blockFootprint(0,saucerSeatBack.z,saucerSeatBack.halfWidth,.14),low:saucerLipHeight,high:saucerSeatBack.top},
    {shape:blockFootprint(0,saucerDriver.z,.87*saucerDriver.scale,.62*saucerDriver.scale),
      low:saucerLipHeight,high:saucerDriver.y+1.8*saucerDriver.scale}
  ];
  for(const [start,end] of [[-1,-.4],[-.4,.4],[.4,1]]){
    const points=[];
    let high=0;
    for(let i=0;i<=6;i++)for(const top of [false,true]){
      const [x,y,z]=screenPoint(start+(end-start)*i/6,top);
      for(const dx of [-.014,.014])for(const dz of [-.014,.014])points.push({s:-z+dz,x:x+dx});
      high=Math.max(high,y+.006);
    }
    saucerUpper.push({shape:polygon(convexHull(points)),low:saucerLipHeight,high});
  }
  tables={
    stock,cabin,shoppingCart,tourerBase,tourerBonnet,tourerCabin,tourerSpare,barrageUpper,
    saucerOutline,saucerBands,saucerUpper,
    fixedMantaBands:null,skipperFixed:null,
    tourerShapes:Object.create(null),
    geepShapes:Object.create(null),
    barrageShapes:Object.create(null),
    ironhideShapes:Object.create(null),
    mantaShapes:Object.create(null),
    skipperShapes:Object.create(null),
    // What a car's outline is made of, before it is turned to the kart's heading.
    // Keyed by car id, then by quantised steering for cars whose wheels move the outline.
    sources:Object.create(null),
    stockSource:null,
  };
  return tables;
}

function tourerOutline(t,steering){
  if(!t.tourerShapes[steering]){
    const points=t.tourerBase.points.slice();
    const [z,r]=crestlineAxles[0];
    for(const side of [-1,1]){
      const angle=frontWheelAngle('crestline',steering/512,side);
      const c=cos(angle),sn=sin(angle);
      for(const end of [-1,1])for(const edge of [-1,1]){
        const offset=rotate(end*r,edge*.135,c,sn);
        points.push({s:offset.s-z,x:offset.x+side*crestlineHalfTrack});
      }
    }
    t.tourerShapes[steering]=polygon(convexHull(points));
  }
  return t.tourerShapes[steering];
}

function barrageShape(t,curvature){
  const points=bodySection(barragePerimeter).points.slice(),wheelBands=[];
  points.push({s:-2.09,x:.42},{s:-2.09,x:-.42});
  for(const side of [-1,1])for(const [z,r] of barrageAxles){
    const angle=z<0?frontWheelAngle('barrage',curvature,side):0;
    const c=cos(angle),sn=sin(angle);
    const tirePoints=[];
    for(const end of [-1,1])for(const edge of [-1,1]){
      for(const [width,radius] of [[barrageTireWidth*.35,r],[barrageTireWidth*.5,r*.89],[barrageTireWidth*.5+.062,r*.23]]){
        const offset=rotate(end*radius,edge*width,c,sn);
        const point={s:offset.s-z,x:offset.x+side*barrageHalfTrack};
        points.push(point);tirePoints.push(point);
      }
    }
    wheelBands.push({shape:polygon(convexHull(tirePoints)),low:.49,high:r*2});
  }
  const lower=polygon(convexHull(points));
  const upperPoints=[];
  for(let i=0;i<t.barrageUpper.length;i++)upperPoints.push(...t.barrageUpper[i].shape.points);
  const outline=polygon(convexHull([...lower.points,...upperPoints]));
  return {outline,bands:[{shape:lower,low:0,high:.49},...t.barrageUpper,...wheelBands]};
}

function ironhideShape(curvature){
  const b=ironhideBumper,w=ironhideScreen,seat=ironhideDriver,roof=ironhideRoof;
  const bands=[
    {shape:bodySection([[b.front-.025,b.halfWidth],[-2.03,1.31],[2.10,1.22],[b.rear+.02,b.halfWidth]]),low:.41,high:.81},
    {shape:blockFootprint(0,2.14,.44,.09),low:.65,high:.91},
    {shape:blockFootprint(0,-1.26,1.31,.80),low:.81,high:1.337},
    {shape:blockFootprint(0,-.89,1.31,.43),low:1.337,high:w.bottom},
    {shape:blockFootprint(0,1.40,1.15,.67),low:.81,high:1.06},
    {shape:blockFootprint(0,2.04,1.22,.08),low:1.06,high:1.40},
    {shape:blockFootprint(0,(w.baseZ+w.topZ)/2,w.halfWidth+.04,(w.topZ-w.baseZ)/2+.04),low:w.bottom,high:w.top+.04},
    {shape:blockFootprint(0,(roof.front+roof.rear)/2,roof.halfWidth,(roof.rear-roof.front)/2),low:roof.bottom,high:roof.top+.017},
    {shape:blockFootprint(seat.x,seat.z,.86*seat.scale,.59*seat.scale),low:.81,high:seat.y+1.78*seat.scale}
  ];
  for(const side of [-1,1]){
    bands.push({shape:blockFootprint(side*roof.postX,roof.postZ,roof.postHalf,roof.postHalf),low:roof.postBase,high:roof.bottom},
      {shape:blockFootprint(side*1.18,.78,.07,1.28),low:.81,high:1.40},
      {shape:blockFootprint(side*Math.abs(seat.x),.68,.38,.14),low:.81,high:2.04});
    for(const [z,r] of ironhideAxles){
      const angle=z<0?frontWheelAngle('ironhide',curvature,side):0;
      const c=cos(angle),sn=sin(angle);
      const points=[];
      for(const end of [-1,1])for(const edge of [-1,1]){
        for(const [radius,width] of [[r,ironhideTireWidth/2],[r*.83,ironhideTireWidth/2+.012],[r*.25,ironhideTireWidth/2+.046]]){
          const p=rotate(end*radius,edge*width,c,sn);
          points.push({s:p.s-z,x:p.x+side*ironhideHalfTrack});
        }
      }
      bands.push({shape:polygon(convexHull(points)),low:0,high:r*2});
      const lip=side<0&&z<0?1.46:1.37;
      bands.push({shape:blockFootprint(side*(lip+1.02)/2,z,(lip-1.02)/2,.68),low:.78,high:1.39});
    }
  }
  const allPoints=[];
  for(let i=0;i<bands.length;i++)allPoints.push(...bands[i].shape.points);
  return {outline:polygon(convexHull(allPoints)),bands};
}

function mantaShape(t,curvature){
  if(!t.fixedMantaBands)t.fixedMantaBands=mantaPanels();
  const bands=t.fixedMantaBands.slice();
  for(const side of [-1,1])for(const [z,r] of mantaAxles){
    const angle=z<0?frontWheelAngle('manta',curvature,side):0;
    const c=cos(angle),sn=sin(angle);
    const edgeReach=Math.sqrt(r*r-(r-.18)*(r-.18));
    for(const [low,high,reach] of [[0,.18,edgeReach],[.18,2*r-.18,r],[2*r-.18,2*r,edgeReach]]){
      const points=[];
      for(const end of [-1,1])for(const face of [-1,1]){
        for(const [width,length] of [[mantaWheelWidth*.5,reach*.92],[mantaWheelWidth*.33,reach]]){
          const p=rotate(end*length,face*width,c,sn);
          points.push({s:p.s-z,x:p.x+side*mantaHalfTrack});
        }
      }
      bands.push({shape:polygon(convexHull(points)),low,high});
    }
  }
  const allPoints=[];
  for(let i=0;i<bands.length;i++)allPoints.push(...bands[i].shape.points);
  return {outline:polygon(convexHull(allPoints)),bands};
}

function skipperShape(t,curvature){
  if(!t.skipperFixed)t.skipperFixed=fixedSkipperBands();
  const bands=t.skipperFixed.slice();
  for(const side of [-1,1])for(const [z,r] of skipperAxles){
    const angle=z<0?frontWheelAngle('skipper',curvature,side):0;
    const c=cos(angle),sn=sin(angle);
    for(const [low,high] of [[0,.13],[.13,2*r-.13],[2*r-.13,2*r]]){
      const dy=Math.max(0,low-r,r-high),reach=Math.sqrt(r*r-dy*dy);
      const points=[];
      for(const end of [-1,1])for(const face of [-1,1])for(const [s,x] of [[reach,.132],[reach*.87,skipperWheelWidth/2],[reach*.34,.197]]){
        const p=rotate(end*s,face*x,c,sn);
        points.push({s:p.s-z,x:p.x+side*skipperHalfTrack});
      }
      bands.push({shape:polygon(convexHull(points)),low,high});
    }
  }
  const allPoints=[];
  for(let i=0;i<bands.length;i++)allPoints.push(...bands[i].shape.points);
  return {outline:polygon(convexHull(allPoints)),bands};
}

// One height band of a car: a flat outline (`shape`) that applies between `low` and `high`.
// `body` marks the band whose outline is the whole-car outline; `fixed` is an outline that never
// turns (the saucer's discs).
const part=(shape,low,high)=>({shape,low,high,body:false,fixed:null});
const bodyPart=(low,high)=>({shape:null,low,high,body:true,fixed:null});
const fixedPart=(hull,low,high)=>({shape:null,low,high,body:false,fixed:hull});
const partsOf=bands=>bands.map(({shape,low,high})=>part(shape,low,high));

function buildSource(t,id,steering,concept){
  if(concept){
    const [w,minZ,maxZ]=concept.bounds;
    return {outline:bodySection([[minZ,w*.78],[minZ*.78,w],[maxZ*.78,w],[maxZ,w*.78]]),fixedBody:null,
      parts:[bodyPart(concept.hover?.18:0,concept.height)]};
  }
  if(id==='shopping-cart')return {outline:t.shoppingCart.outline,fixedBody:null,parts:partsOf(t.shoppingCart.bands)};
  if(id==='saucer'){
    return {outline:null,fixedBody:t.saucerOutline,
      parts:t.saucerBands.map(({hull,low,high})=>fixedPart(hull,low,high)).concat(partsOf(t.saucerUpper))};
  }
  if(id==='manta'||id==='skipper'){
    const shapes=id==='skipper'?t.skipperShapes:t.mantaShapes;
    if(!shapes[steering])shapes[steering]=id==='skipper'?skipperShape(t,steering/512):mantaShape(t,steering/512);
    return {outline:shapes[steering].outline,fixedBody:null,parts:partsOf(shapes[steering].bands)};
  }
  if(id==='crestline'){
    return {outline:tourerOutline(t,steering),fixedBody:null,parts:[bodyPart(0,1.08),part(t.tourerBonnet,1.08,1.33),
      part(t.tourerSpare,1.08,1.32),part(t.tourerCabin,1.33,crestlineRoof.top)]};
  }
  if(id==='barrage'||id==='ironhide'){
    const shapes=id==='ironhide'?t.ironhideShapes:t.barrageShapes;
    if(!shapes[steering])shapes[steering]=id==='ironhide'?ironhideShape(steering/512):barrageShape(t,steering/512);
    return {outline:shapes[steering].outline,fixedBody:null,parts:partsOf(shapes[steering].bands)};
  }
  if(id==='geep'){
    if(!t.geepShapes[steering])t.geepShapes[steering]=polygon(geepOutline(steering/512));
    return {outline:t.geepShapes[steering],fixedBody:null,
      parts:[bodyPart(0,geepLowerHeight),part(t.cabin,geepLowerHeight,geepOverallHeight)]};
  }
  return {outline:t.stock,fixedBody:null,parts:[bodyPart(0,1.4)]};
}

// The furthest any point of the car is from its center. Turning the car cannot move a point
// further out than this, so it bounds every band at every heading.
function reachOf(source){
  let reach=0;
  const cover=points=>{
    for(let i=0;i<points.length;i++)reach=Math.max(reach,hypot(points[i].s,points[i].x));
  };
  cover((source.fixedBody||source.outline).points);
  for(let i=0;i<source.parts.length;i++){
    const from=source.parts[i];
    if(!from.body)cover((from.fixed||from.shape).points);
  }
  return reach;
}

function sourceFor(t,id,steering,concept,shaped){
  let source;
  if(!shaped)source=t.stockSource;
  else source=(t.sources[id]||(t.sources[id]=Object.create(null)))[steering];
  if(!source){
    source=buildSource(t,id,steering,concept);
    source.reach=reachOf(source);
    if(shaped)t.sources[id][steering]=source;
    else t.stockSource=source;
  }
  return source;
}

// A band of one kart's footprint. `hull` is turned to the kart's heading the first time it is read
// after the heading changes: most ticks only the body outline is needed (rail limits), and the
// bands only when another kart, a hazard or an item is close enough to test against.
function Band(footprint){
  this.low=0;this.high=0;
  this.footprint=footprint;
  this.shape=null;this.fixed=null;
  this.own=null;this.turn=-1;
}
Object.defineProperty(Band.prototype,'hull',{get(){
  if(this.fixed!==null)return this.fixed;
  const fp=this.footprint;
  if(this.turn!==fp.turn){
    orientInto(this.own||(this.own=new Hull()),this.shape,fp.cos,fp.sin);
    this.turn=fp.turn;
  }
  return this.own;
},enumerable:true,configurable:true});

function createFootprint(){
  return {yaw:NaN,steering:0,id:undefined,body:null,bands:[],reach:0,
    source:null,ownBody:new Hull(),cos:1,sin:0,turn:0};
}

// The oriented outline of a kart: `body` is the whole-car outline, `bands` its height slices.
// The result belongs to the kart and is refreshed in place when its heading, steering or car
// changes, so read it before the next call for the same kart rather than holding on to it.
export function kartFootprint(kart){
  const id=kart.tuning?.id,yaw=kart.yaw||0,concept=conceptCarById(id);
  const shaped=hasShapedBody(kart);
  const steering=!concept&&id!=='saucer'&&id!=='shopping-cart'&&shaped?Math.round((kart.steer||0)*fullLockCurvature(kart)*512):0;
  let fp=kart._fp;
  if(fp && fp.yaw===yaw && fp.steering===steering && fp.id===id)return fp;
  if(!fp){
    fp=createFootprint();
    // Not enumerable: snapshots, hashes and copies of the kart never see the cache.
    Object.defineProperty(kart,'_fp',{value:fp,writable:true,configurable:true,enumerable:false});
  }
  const source=sourceFor(getTables(),id,steering,concept,shaped);
  fp.yaw=yaw;fp.steering=steering;fp.id=id;
  fp.cos=cos(yaw);fp.sin=sin(yaw);
  fp.turn++;
  fp.body=source.fixedBody||orientInto(fp.ownBody,source.outline,fp.cos,fp.sin);
  if(fp.source!==source){
    fp.source=source;
    fp.reach=source.reach;
    const parts=source.parts,bands=fp.bands;
    for(let i=0;i<parts.length;i++){
      const from=parts[i],band=bands[i]||(bands[i]=new Band(fp));
      band.low=from.low;band.high=from.high;
      band.shape=from.shape;
      band.fixed=from.body?fp.body:from.fixed;
      band.turn=-1;
    }
    if(bands.length!==parts.length)bands.length=parts.length;
  }
  return fp;
}

// Which edge normal last showed two footprints to be apart: i+1 for the first shape's axis i,
// -(i+1) for the second's. See separatedOn.
let separator=0;
export const lastSeparatingAxis=()=>separator;

// Two karts that were apart along some edge normal a moment ago are nearly always still apart
// along it. Testing that one axis first settles most pairs with a single pass over one outline.
// It is the same arithmetic footprintContact uses for that axis, and footprintContact reports
// no contact as soon as any axis separates the shapes, so a true here is exactly its null.
// A false says nothing: run footprintContact.
export function separatedOn(a,b,ds,dx,code){
  if(a===b)return false;
  const first=code>0,index=(first?code:-code)-1,axes=first?a.axes:b.axes;
  if(index>=axes.length)return false;
  const axis=axes[index],s=axis.s,x=axis.x,points=first?b.points:a.points;
  let lo=Infinity,hi=-Infinity;
  for(let j=0;j<points.length;j++){
    const p=points[j],d=p.s*s+p.x*x;
    if(d<lo)lo=d;
    if(d>hi)hi=d;
  }
  const aLo=first?axis.lo:lo,aHi=first?axis.hi:hi;
  const bLo=first?lo:axis.lo,bHi=first?hi:axis.hi;
  const offset=ds*s+dx*x,positive=aHi-bLo-offset,negative=bHi+offset-aLo;
  return Math.min(positive,negative)<=.0001;
}

// Minimum separating translation, pointing from the first footprint to the second.
export function footprintContact(a,b,ds,dx,tie=1){
  let depth=Infinity,normalS=0,normalX=0;
  // Each shape's edge normals in turn: project the other shape onto the normal and compare spans.
  for(let pass=0;pass<2;pass++){
    // `first` follows the shape, not the pass: two saucers share one fixed disc, so a can be b.
    const shape=pass===0?a:b,first=shape===a,axes=shape.axes,points=first?b.points:a.points;
    for(let i=0;i<axes.length;i++){
      const axis=axes[i],s=axis.s,x=axis.x;
      let lo=Infinity,hi=-Infinity;
      for(let j=0;j<points.length;j++){
        const p=points[j],d=p.s*s+p.x*x;
        if(d<lo)lo=d;
        if(d>hi)hi=d;
      }
      const aLo=first?axis.lo:lo,aHi=first?axis.hi:hi;
      const bLo=first?lo:axis.lo,bHi=first?hi:axis.hi;
      const offset=ds*s+dx*x,positive=aHi-bLo-offset,negative=bHi+offset-aLo;
      const overlap=Math.min(positive,negative);
      if(overlap<=.0001){separator=pass===0?i+1:-(i+1);return null;}
      if(overlap<depth){
        const sign=positive===negative?tie:positive<negative?1:-1;
        depth=overlap;normalS=s*sign;normalX=x*sign;
      }
    }
  }
  return {depth,normalS,normalX};
}

export const geepLowerHeight=1.4, geepOverallHeight=2.504*geepScale;

const halfRoadAt=(road,s)=>Math.max(3,road.widthAt?.(s)??road.width??16)/2;

// The inside face of each rail is sampled along the rotated outline, including
// at transitions into narrower lanes. Stock chassis retain their road margin.
export function laneBounds(kart,road,stockMargin,curvature=road.curvature||0){
  if(!hasShapedBody(kart)){
    const limit=halfRoadAt(road,kart.s)-stockMargin;
    return {min:road.dropAt?.(kart.s,-1)?-Infinity:-limit,max:road.dropAt?.(kart.s,1)?Infinity:limit};
  }
  const scale=Math.max(.55,Math.min(1.65,1-kart.x*curvature));
  let min=-Infinity,max=Infinity;
  const pts=kartFootprint(kart).body.points,base=kart.s;
  if(road.edgesAt){
    // Both rails from one lookup per outline point: the same numbers as edgeAt on each side.
    const edges=road.edgesAt;
    for(let i=0;i<pts.length;i++){
      const p=pts[i],pair=edges(base+p.s/scale);
      min=Math.max(min,-pair.left-p.x);max=Math.min(max,pair.right-p.x);
    }
    return {min,max};
  }
  for(let i=0;i<pts.length;i++){
    const p=pts[i];
    const s=base+p.s/scale;
    const left=road.edgeAt?.(s,-1)??(road.dropAt?.(s,-1)?Infinity:halfRoadAt(road,s));
    const right=road.edgeAt?.(s,1)??(road.dropAt?.(s,1)?Infinity:halfRoadAt(road,s));
    min=Math.max(min,-left-p.x);max=Math.min(max,right-p.x);
  }
  return {min,max};
}
