import {cartAxles,cartHalfTrack,cartDriver,cartHandle,cartFloor,basketPoint} from './shopping-cart-layout.js';
import {skipperSection,skipperStations,skipperAxles,skipperHalfTrack,skipperWheelWidth,skipperCabin,skipperMotor,skipperDriver} from './skipper-layout.js';
import {saucerRadius,saucerDriver,saucerProfile,saucerLipHeight,saucerSeatBack,screenPoint} from './saucer-layout.js';
import {mantaSection,mantaSweptZ,mantaEnds,mantaDriver,mantaAxles,mantaHalfTrack,mantaWheelWidth} from './manta-layout.js';
import {crestlineOutline,crestlineRoof,crestlineAxles,crestlineHalfTrack} from './crestline-layout.js';
import {ironhideAxles,ironhideHalfTrack,ironhideTireWidth,ironhideDriver,ironhideBumper,ironhideScreen,ironhideRoof} from './ironhide-layout.js';
import {fullLockCurvature,frontWheelAngle} from './steering.js';
import {barragePerimeter,barrageAxles,barrageHalfTrack,barrageTireWidth,barrageMuzzle,barrageWing,barrageDriver} from './barrage-layout.js';
import {geepScale,geepAxles,geepHalfTrack,geepTireWidthScale} from './geep-layout.js';

export const isGeep = kart => kart.tuning?.id === 'geep';
export const hasShapedBody = kart => kart.tuning?.id==='shopping-cart' || kart.tuning?.id==='skipper' || kart.tuning?.id==='saucer' || kart.tuning?.id==='manta' || kart.tuning?.id==='crestline' || isGeep(kart) || kart.tuning?.id==='barrage' || kart.tuning?.id==='ironhide';
const rotate = (s,x,c,sn) => ({s:s*c-x*sn,x:s*sn+x*c});

function convexHull(points) {
  const sorted=points.sort((a,b)=>a.s-b.s || a.x-b.x);
  function chain(order){
    const result=[];
    for(const p of order){
      while(result.length>=2){
        const a=result[result.length-2],b=result[result.length-1];
        if((b.s-a.s)*(p.x-a.x)-(b.x-a.x)*(p.s-a.s)>1e-9)break;
        result.pop();
      }
      result.push(p);
    }
    result.pop();return result;
  }
  return [...chain(sorted),...chain(sorted.reverse())];
}

function geepOutline(curvature){
  const points=[];
  for(const side of [-1,1]){
    // Outer lamp buckets, curved bumper ends and rear exhaust tips.
    for(const [s,x] of [[2.297,.36],[2.271,.84],[2.16,.94],[-2.10,.65]]){
      points.push({s,x:side*x});
    }
    for(const [z,radius] of geepAxles){
      const front=z<0,angle=front?frontWheelAngle('geep',curvature,side):0;
      const c=Math.cos(angle),sn=Math.sin(angle),width=geepTireWidthScale(front);
      // Tire crown and rounded sidewalls, projected onto the road.
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
  for(const p of points){
    const d=p.s*s+p.x*x;
    lo=Math.min(lo,d);hi=Math.max(hi,d);
  }
  return {lo,hi};
}
function polygon(points){
  const axes=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],ds=b.s-a.s,dx=b.x-a.x,len=Math.hypot(ds,dx);
    const s=-dx/len,x=ds/len;
    if(axes.some(n=>Math.abs(n.s*s+n.x*x)>.999999))continue;
    axes.push({s,x,...span(points,s,x)});
  }
  return {points,axes};
}
export function footprintBox(halfLength,halfWidth){
  return polygon([{s:-halfLength,x:-halfWidth},{s:halfLength,x:-halfWidth},
    {s:halfLength,x:halfWidth},{s:-halfLength,x:halfWidth}]);
}
const stock=footprintBox(1.75,1.25);
const cabin=polygon([{s:-1.081,x:-.933},{s:.61,x:-.955},{s:.61,x:.955},{s:-1.081,x:.933}]
  .map(p=>({s:p.s*geepScale,x:p.x*geepScale})));
function bodySection(rows){
  return polygon(convexHull(rows.flatMap(([z,x])=>[{s:-z,x},{s:-z,x:-x}])));
}
function blockFootprint(x,z,halfWidth,halfLength){
  return polygon(footprintBox(halfLength,halfWidth).points.map(p=>({s:p.s-z,x:p.x+x})));
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
  // Narrow bands follow the taper and the rising rim along the side panels.
  for(const side of [-1,1])for(let i=0;i<4;i++){
    const a=i/4,b=(i+1)/4;
    const rows=[rim(a,0),rim(b,0),rim(b,1),rim(a,1)];
    const points=rows.flatMap(([z,x])=>[-.04,.04].flatMap(dx=>
      [-.04,.04].map(dz=>({s:-z+dz,x:side*x+dx}))));
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
  return {outline:polygon(convexHull(bands.flatMap(b=>b.shape.points))),bands};
}
const shoppingCart=cartShape();
const tourerBase=bodySection(crestlineOutline);
const tourerShapes=new Map();
function tourerOutline(steering){
  if(!tourerShapes.has(steering)){
    const points=tourerBase.points.slice();
    const [z,r]=crestlineAxles[0];
    for(const side of [-1,1]){
      const angle=frontWheelAngle('crestline',steering/512,side);
      for(const end of [-1,1])for(const edge of [-1,1]){
        const offset=rotate(end*r,edge*.135,Math.cos(angle),Math.sin(angle));
        points.push({s:offset.s-z,x:offset.x+side*crestlineHalfTrack});
      }
    }
    tourerShapes.set(steering,polygon(convexHull(points)));
  }
  return tourerShapes.get(steering);
}
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
const geepShapes=new Map(),barrageShapes=new Map(),cache=new WeakMap();
function barrageShape(curvature){
  const points=bodySection(barragePerimeter).points.slice(),wheelBands=[];
  points.push({s:-2.09,x:.42},{s:-2.09,x:-.42});
  for(const side of [-1,1])for(const [z,r] of barrageAxles){
    const angle=z<0?frontWheelAngle('barrage',curvature,side):0;
    const tirePoints=[];
    function tirePoint(s,x){
      const offset=rotate(s,x,Math.cos(angle),Math.sin(angle));
      return {s:offset.s-z,x:offset.x+side*barrageHalfTrack};
    }
    for(const end of [-1,1])for(const edge of [-1,1]){
      for(const [width,radius] of [[barrageTireWidth*.35,r],[barrageTireWidth*.5,r*.89],[barrageTireWidth*.5+.062,r*.23]]){
        const point=tirePoint(end*radius,edge*width);
        points.push(point);tirePoints.push(point);
      }
    }
    wheelBands.push({shape:polygon(convexHull(tirePoints)),low:.49,high:r*2});
  }
  const lower=polygon(convexHull(points));
  const outline=polygon(convexHull([...lower.points,...barrageUpper.flatMap(b=>b.shape.points)]));
  return {outline,bands:[{shape:lower,low:0,high:.49},...barrageUpper,...wheelBands]};
}
const ironhideShapes=new Map();
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
      const points=[];
      for(const end of [-1,1])for(const edge of [-1,1]){
        for(const [radius,width] of [[r,ironhideTireWidth/2],[r*.83,ironhideTireWidth/2+.012],[r*.25,ironhideTireWidth/2+.046]]){
          const p=rotate(end*radius,edge*width,Math.cos(angle),Math.sin(angle));
          points.push({s:p.s-z,x:p.x+side*ironhideHalfTrack});
        }
      }
      bands.push({shape:polygon(convexHull(points)),low:0,high:r*2});
      const lip=side<0&&z<0?1.46:1.37;
      bands.push({shape:blockFootprint(side*(lip+1.02)/2,z,(lip-1.02)/2,.68),low:.78,high:1.39});
    }
  }
  // The glass and both buckets sit above the half doors. Nothing spans the open bed.
  const outline=polygon(convexHull(bands.flatMap(band=>band.shape.points)));
  return {outline,bands};
}
// Slice the same cross sections used to build the speedster. A car or item
// crossing above the nose can still catch a fender, the headrest or the driver.
function mantaPanel(start,end,low,high,side=0){
  const points=[];
  for(let i=0;i<=24;i++){
    const z=start+(end-start)*i/24, section=mantaSection(z);
    const sides=side?[side]:[-1,1];
    for(const sign of sides)for(let j=0;j<section.length-1;j++){
      const [x,y]=section[j],[x2,y2]=section[j+1];
      const add=x=>points.push({s:-mantaSweptZ(x,z),x:sign*x});
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
const mantaShapes=new Map();
let fixedMantaBands;
function mantaShape(curvature){
  fixedMantaBands??=mantaPanels();
  const bands=fixedMantaBands.slice();
  for(const side of [-1,1])for(const [z,r] of mantaAxles){
    const angle=z<0?frontWheelAngle('manta',curvature,side):0;
    for(const [low,high,reach] of [[0,.18,Math.sqrt(r*r-(r-.18)**2)],[.18,2*r-.18,r],[2*r-.18,2*r,Math.sqrt(r*r-(r-.18)**2)]]){
      const points=[];
      for(const end of [-1,1])for(const face of [-1,1]){
        for(const [width,length] of [[mantaWheelWidth*.5,reach*.92],[mantaWheelWidth*.33,reach]]){
          const p=rotate(end*length,face*width,Math.cos(angle),Math.sin(angle));
          points.push({s:p.s-z,x:p.x+side*mantaHalfTrack});
        }
      }
      bands.push({shape:polygon(convexHull(points)),low,high});
    }
  }
  const outline=polygon(convexHull(bands.flatMap(b=>b.shape.points)));
  return {outline,bands};
}
// Project only the portion of the actual hull skin that lies within each
// height band. In particular, the keel starts behind and below the stem cap.
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
          return [...outer,[outer.at(-1)[0]*.88,row[2],row[0]],[side*row[1]*.80,1.015,row[0]]];
        });
        bands.push(slicedSkipperHull(rails,low,high));
      }
    }
  }
  const c=skipperCabin,m=skipperMotor,d=skipperDriver;
  function box(x,z,w,l,low,high){bands.push({shape:blockFootprint(x,z,w,l),low,high});}
  box(0,.45,.82,1.20,.96,1.055);                 // cockpit sole
  box(0,1.66,.87,.055,1.03,1.42);                // transom
  box(0,(c.front-.52)/2,c.halfWidth,.16,c.sill,c.roofBottom);
  box(0,(c.roofFront+c.roofRear)/2,c.roofWidth,.817,c.roofBottom,c.roofTop);
  box(d.x,d.z,.90*d.scale,.62*d.scale,1.25,d.y+1.82*d.scale);
  box(d.x,d.z+.43,.36,.082,1.15,1.76);
  box(0,m.z,m.halfWidth,m.halfDepth,m.bottom,m.top);
  box(0,2.12,.23,.215,.715,1.35);                 // tilted motor leg and propeller
  for(const side of [-1,1]){
    box(side*.765,.819,.085,.209,c.sill,c.roofBottom);
    box(side*.52,1.71,.14,.16,1.02,1.30);         // stern boost outlets
    for(const [z] of skipperAxles)box(side*.86,z,.19,.21,.49,1.105);
  }
  return bands;
}
const skipperShapes=new Map();
let skipperFixed;
function skipperShape(curvature){
  skipperFixed??=fixedSkipperBands();
  const bands=skipperFixed.slice();
  for(const side of [-1,1])for(const [z,r] of skipperAxles){
    const angle=z<0?frontWheelAngle('skipper',curvature,side):0;
    for(const [low,high] of [[0,.13],[.13,2*r-.13],[2*r-.13,2*r]]){
      const dy=Math.max(0,low-r,r-high),reach=Math.sqrt(r*r-dy*dy);
      const points=[];
      for(const end of [-1,1])for(const face of [-1,1])for(const [s,x] of [[reach,.132],[reach*.87,skipperWheelWidth/2],[reach*.34,.197]]){
        const p=rotate(end*s,face*x,Math.cos(angle),Math.sin(angle));
        points.push({s:p.s-z,x:p.x+side*skipperHalfTrack});
      }
      bands.push({shape:polygon(convexHull(points)),low,high});
    }
  }
  return {outline:polygon(convexHull(bands.flatMap(b=>b.shape.points))),bands};
}
function orient(shape,yaw){
  const c=Math.cos(yaw),sn=Math.sin(yaw);
  const points=shape.points.map(p=>rotate(p.s,p.x,c,sn));
  return {points,along:span(points,1,0),across:span(points,0,1),
    axes:shape.axes.map(n=>({...rotate(n.s,n.x,c,sn),lo:n.lo,hi:n.hi}))};
}

// The circular sections are invariant under steering and yaw. Only the seat,
// pilot and three curved windshield sections need to turn with the vehicle.
function horizontalDisc(radius){
  const points=Array.from({length:48},(_,i)=>{
    const t=i*Math.PI/24;
    return {s:radius*Math.cos(t),x:radius*Math.sin(t)};
  });
  return orient(polygon(points),0);
}
const saucerOutline=horizontalDisc(saucerRadius);
const saucerBands=[];
for(const [first,last] of [[0,4],[4,7],[7,10],[10,13],[13,17],[17,19],[19,20],[20,21],[21,23]]){
  const profile=saucerProfile.slice(first,last+1);
  saucerBands.push({hull:horizontalDisc(Math.max(...profile.map(([r])=>r))),low:profile[0][1],high:profile.at(-1)[1]});
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

export function kartFootprint(kart){
  const id=kart.tuning?.id,yaw=kart.yaw||0;
  const steering=id!=='saucer'&&id!=='shopping-cart'&&hasShapedBody(kart)?Math.round((kart.steer||0)*fullLockCurvature(kart)*512):0;
  const old=cache.get(kart);
  if(old && old.yaw===yaw && old.steering===steering && old.id===id)return old;
  let body,bands;
  if(id==='shopping-cart'){
    body=orient(shoppingCart.outline,yaw);
    bands=shoppingCart.bands.map(({shape,low,high})=>({hull:orient(shape,yaw),low,high}));
  }else if(id==='saucer'){
    body=saucerOutline;
    bands=saucerBands.concat(saucerUpper.map(({shape,low,high})=>({hull:orient(shape,yaw),low,high})));
  }else if(id==='manta'||id==='skipper'){
    const shapes=id==='skipper'?skipperShapes:mantaShapes;
    if(!shapes.has(steering))shapes.set(steering,id==='skipper'?skipperShape(steering/512):mantaShape(steering/512));
    const shape=shapes.get(steering);
    body=orient(shape.outline,yaw);
    bands=shape.bands.map(({shape,low,high})=>({hull:orient(shape,yaw),low,high}));
  }else if(id==='crestline'){
    body=orient(tourerOutline(steering),yaw);
    bands=[{hull:body,low:0,high:1.08},{hull:orient(tourerBonnet,yaw),low:1.08,high:1.33},
      {hull:orient(tourerSpare,yaw),low:1.08,high:1.32},{hull:orient(tourerCabin,yaw),low:1.33,high:crestlineRoof.top}];
  }else if(id==='barrage'||id==='ironhide'){
    const shapes=id==='ironhide'?ironhideShapes:barrageShapes;
    if(!shapes.has(steering))shapes.set(steering,(id==='ironhide'?ironhideShape:barrageShape)(steering/512));
    const shape=shapes.get(steering);
    body=orient(shape.outline,yaw);
    bands=shape.bands.map(({shape,low,high})=>({hull:orient(shape,yaw),low,high}));
  }else if(id==='geep'){
    if(!geepShapes.has(steering))geepShapes.set(steering,polygon(geepOutline(steering/512)));
    body=orient(geepShapes.get(steering),yaw);
    bands=[{hull:body,low:0,high:geepLowerHeight},{hull:orient(cabin,yaw),low:geepLowerHeight,high:geepOverallHeight}];
  }else{
    body=orient(stock,yaw);
    bands=[{hull:body,low:0,high:1.4}];
  }
  const result={yaw,steering,id,body,bands};
  cache.set(kart,result);
  return result;
}

// Minimum separating translation, pointing from the first footprint to the second.
export function footprintContact(a,b,ds,dx,tie=1){
  let depth=Infinity,normalS=0,normalX=0;
  for(const shape of [a,b])for(const axis of shape.axes){
    const {s,x}=axis,other=span(shape===a?b.points:a.points,s,x);
    const aLo=shape===a?axis.lo:other.lo,aHi=shape===a?axis.hi:other.hi;
    const bLo=shape===a?other.lo:axis.lo,bHi=shape===a?other.hi:axis.hi;
    const offset=ds*s+dx*x,positive=aHi-bLo-offset,negative=bHi+offset-aLo;
    const overlap=Math.min(positive,negative);
    if(overlap<=.0001)return null;
    if(overlap<depth){
      const sign=positive===negative?tie:positive<negative?1:-1;
      depth=overlap;normalS=s*sign;normalX=x*sign;
    }
  }
  return {depth,normalS,normalX};
}

export const geepLowerHeight=1.4, geepOverallHeight=2.504*geepScale;

// The inside face of each rail is sampled along the rotated outline, including
// at transitions into narrower lanes. Stock chassis retain their road margin.
export function laneBounds(kart,road,stockMargin,curvature=road.curvature||0){
  const halfAt=s=>Math.max(3,road.widthAt?.(s)??road.width??16)/2;
  if(!hasShapedBody(kart)){
    const limit=halfAt(kart.s)-stockMargin;
    return {min:road.dropAt?.(kart.s,-1)?-Infinity:-limit,max:road.dropAt?.(kart.s,1)?Infinity:limit};
  }
  const scale=Math.max(.55,Math.min(1.65,1-kart.x*curvature));
  let min=-Infinity,max=Infinity;
  for(const p of kartFootprint(kart).body.points){
    const s=kart.s+p.s/scale;
    const left=road.edgeAt?.(s,-1)??(road.dropAt?.(s,-1)?Infinity:halfAt(s));
    const right=road.edgeAt?.(s,1)??(road.dropAt?.(s,1)?Infinity:halfAt(s));
    min=Math.max(min,-left-p.x);max=Math.min(max,right-p.x);
  }
  return {min,max};
}
