import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

// Two builds of every car come out of the same construction code. FULL is what the
// garage, the player and the Time Trial ghost use. LOW is the distant-rival build:
// each primitive is regenerated with the fewest segments that keep its outline within
// KART_LOD_TOLERANCE of the full shape, and parts too small to cover a pixel at the
// switch distance are left out.
export const FULL=0, LOW=1;
// Metres. About one device pixel at the 26 m switch distance on a 1440-row canvas.
export const KART_LOD_TOLERANCE=.018;
const DROP_SIZE=.042, THIN_RADIUS=.0055;

let level=FULL;
export const kartDetail=()=>level;
export const lowDetail=()=>level===LOW;
export function withKartDetail(next,build){
  const previous=level;level=next;
  try{return build();}finally{level=previous;}
}
// Parts modelled at one size and mounted at another (the driver sits in every car at
// roughly two-thirds scale) are judged at their mounted size.
let mounted=1;
export function withMountedScale(scale,build){
  const previous=mounted;mounted=scale;
  try{return build();}finally{mounted=previous;}
}

// Fewest sides for a circle of this radius whose flats stay within the tolerance.
// Round parts are stacked on shared axles everywhere (tire, rim, hub cap), and a coarse
// inner polygon can poke through a finer outer one. Side counts therefore come from a
// doubling ladder (6, 12, 24, 48): every coarser polygon then sits wholly inside any
// finer one around the same axis, so the stacking order never changes.
function sides(radius,original,min=6,arc=2*Math.PI){
  let n=min;
  if(radius>KART_LOD_TOLERANCE)n=Math.ceil(arc/(2*Math.acos(1-KART_LOD_TOLERANCE/radius)));
  if(arc===2*Math.PI){let rung=6;while(rung<n)rung*=2;n=rung;}
  return Math.max(Math.min(min,original),Math.min(original,n));
}
// A rod thinner than a pixel can be a three-sided prism; nothing is stacked on it.
const rodSides=(radius,original,arc)=>radius<.03?Math.min(3,original):sides(radius,original,6,arc);

const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),d=new T.Vector3();
const basis=new T.Matrix3(),image=new T.Matrix3();
// The parametric shape was built in its own frame and then scaled, turned and moved by
// the caller. Recover that affine map from the full-detail vertices so that a coarser
// build of the same shape can be placed exactly where the original sits.
function fitAffine(reference,target){
  const n=reference.count;
  if(n<4||target.count!==n)return null;
  const p0=new T.Vector3().fromBufferAttribute(reference,0);
  let i1=0,i2=0,i3=0,best=0;
  for(let i=1;i<n;i++){const l=a.fromBufferAttribute(reference,i).sub(p0).lengthSq();if(l>best){best=l;i1=i;}}
  if(best<1e-12)return null;
  const e1=new T.Vector3().fromBufferAttribute(reference,i1).sub(p0);
  best=0;
  for(let i=1;i<n;i++){const l=a.fromBufferAttribute(reference,i).sub(p0).cross(e1).lengthSq();if(l>best){best=l;i2=i;}}
  if(best<1e-12*e1.lengthSq())return null;
  const e2=new T.Vector3().fromBufferAttribute(reference,i2).sub(p0),normal=new T.Vector3().crossVectors(e1,e2);
  best=0;
  for(let i=1;i<n;i++){const l=Math.abs(a.fromBufferAttribute(reference,i).sub(p0).dot(normal));if(l>best){best=l;i3=i;}}
  // A flat reference leaves the third axis undetermined.
  if(best<1e-7*normal.length()*Math.sqrt(e1.lengthSq()))return null;
  const e3=new T.Vector3().fromBufferAttribute(reference,i3).sub(p0);
  basis.set(e1.x,e2.x,e3.x,e1.y,e2.y,e3.y,e1.z,e2.z,e3.z);
  if(Math.abs(basis.determinant())<1e-14)return null;
  const q0=new T.Vector3().fromBufferAttribute(target,0);
  a.fromBufferAttribute(target,i1).sub(q0);b.fromBufferAttribute(target,i2).sub(q0);c.fromBufferAttribute(target,i3).sub(q0);
  image.set(a.x,b.x,c.x,a.y,b.y,c.y,a.z,b.z,c.z);
  const linear=image.multiply(basis.invert()),m=linear.elements;
  const matrix=new T.Matrix4().set(
    m[0],m[3],m[6],0,
    m[1],m[4],m[7],0,
    m[2],m[5],m[8],0,
    0,0,0,1);
  const shift=p0.clone().applyMatrix4(matrix);
  matrix.setPosition(q0.x-shift.x,q0.y-shift.y,q0.z-shift.z);
  // Any vertex the caller moved by hand shows up as a residual: keep the original then.
  const step=Math.max(1,Math.floor(n/96));
  let size=0,error=0;
  for(let i=0;i<n;i+=step){
    d.fromBufferAttribute(target,i);
    size=Math.max(size,d.distanceToSquared(q0));
    error=Math.max(error,a.fromBufferAttribute(reference,i).applyMatrix4(matrix).distanceToSquared(d));
  }
  if(error>1e-6*Math.max(size,1e-6))return null;
  return matrix;
}

// A tube rebuilt on the fewest centre-line points that stay within the tolerance of the
// original path: straight runs become one segment and corners keep a ring each.
const tangent=new T.Vector3(),side=new T.Vector3(),up=new T.Vector3(),ring=new T.Vector3();
function tracePath(path,samples,closed,tolerance){
  const points=[];
  for(let k=0;k<=samples;k++)points.push(path.getPointAt(k/samples));
  if(closed)points.pop();
  const keep=new Uint8Array(points.length);keep[0]=keep[points.length-1]=1;
  if(closed)keep[Math.floor(points.length/3)]=keep[Math.floor(2*points.length/3)]=1;
  const line=new T.Line3(),stack=[];
  let last=0;
  for(let k=1;k<points.length;k++)if(keep[k]){stack.push([last,k]);last=k;}
  while(stack.length){
    const [from,to]=stack.pop();
    line.set(points[from],points[to]);
    let worst=0,index=-1;
    for(let k=from+1;k<to;k++){
      const distance=line.closestPointToPoint(points[k],true,a).distanceTo(points[k]);
      if(distance>worst){worst=distance;index=k;}
    }
    if(worst>tolerance){keep[index]=1;stack.push([from,index],[index,to]);}
  }
  return points.filter((_,k)=>keep[k]);
}
function polyTube(points,radius,radial,closed){
  const n=points.length,rings=closed?n+1:n;
  const position=new Float32Array(rings*radial*3),normal=new Float32Array(rings*radial*3),index=[];
  // Builders merge parts by attribute, so the stand-in carries a UV layer like a tube does.
  const uv=new Float32Array(rings*radial*2);
  for(let k=0;k<rings;k++){
    const here=points[k%n];
    const before=closed?points[(k-1+n)%n]:points[Math.max(0,k-1)],after=closed?points[(k+1)%n]:points[Math.min(n-1,k+1)];
    tangent.subVectors(after,before).normalize();
    if(k===0){
      // Any direction square to the path starts the ring; later rings carry it along.
      side.set(1,0,0);if(Math.abs(tangent.x)>.9)side.set(0,1,0);
    }
    side.addScaledVector(tangent,-side.dot(tangent)).normalize();
    up.crossVectors(tangent,side);
    for(let j=0;j<radial;j++){
      const angle=2*Math.PI*j/radial,offset=(k*radial+j)*3;
      ring.copy(side).multiplyScalar(Math.cos(angle)).addScaledVector(up,Math.sin(angle));
      normal[offset]=ring.x;normal[offset+1]=ring.y;normal[offset+2]=ring.z;
      position[offset]=here.x+ring.x*radius;position[offset+1]=here.y+ring.y*radius;position[offset+2]=here.z+ring.z*radius;
      uv[(k*radial+j)*2]=k/(rings-1);uv[(k*radial+j)*2+1]=j/radial;
    }
    if(k)for(let j=0;j<radial;j++){
      const p=(k-1)*radial+j,q=(k-1)*radial+(j+1)%radial;
      index.push(p,q,p+radial,q,q+radial,p+radial);
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.BufferAttribute(position,3));
  geometry.setAttribute('normal',new T.BufferAttribute(normal,3));
  geometry.setAttribute('uv',new T.BufferAttribute(uv,2));
  geometry.setIndex(index);
  return geometry;
}

// Each recipe returns [reference, coarse]: the shape as authored, and its distant build.
// `s` holds the lengths of the fitted frame's axes, so sizes below are in road metres.
const RECIPES={
  CylinderGeometry(p,s,o){
    const radial=Math.max(s.x,s.z),r=Math.max(p.radiusTop,p.radiusBottom)*radial,h=p.height*s.y;
    if(r<THIN_RADIUS)return null;
    const n=rodSides(r,p.radialSegments,p.thetaLength);
    // Long thin rods lose their end caps; nothing wider than a wire does.
    const open=p.openEnded||(!o.keepCaps&&r<.03&&h>8*r);
    return new T.CylinderGeometry(p.radiusTop,p.radiusBottom,p.height,n,1,open,p.thetaStart,p.thetaLength);
  },
  ConeGeometry(p,s){
    const r=p.radius*Math.max(s.x,s.z);
    if(r<THIN_RADIUS)return null;
    return new T.ConeGeometry(p.radius,p.height,rodSides(r,p.radialSegments,p.thetaLength),1,p.openEnded,p.thetaStart,p.thetaLength);
  },
  SphereGeometry(p,s){
    const r=p.radius*Math.max(s.x,s.y,s.z);
    const w=sides(r,p.widthSegments,6,p.phiLength);
    const h=Math.max(Math.min(3,p.heightSegments),Math.min(p.heightSegments,Math.ceil(w*.5*p.thetaLength/Math.PI)));
    return new T.SphereGeometry(p.radius,w,h,p.phiStart,p.phiLength,p.thetaStart,p.thetaLength);
  },
  TorusGeometry(p,s){
    const scale=Math.max(s.x,s.y,s.z),tube=p.tube*scale;
    if(tube<THIN_RADIUS*.8)return null;
    return new T.TorusGeometry(p.radius,p.tube,Math.min(p.radialSegments,tube<.03?3:tube<.08?4:6),
      sides((p.radius+p.tube)*scale,p.tubularSegments,6,p.arc),p.arc);
  },
  LatheGeometry(p,s,o){
    const radial=Math.max(s.x,s.z);
    let r=0;for(const point of p.points)r=Math.max(r,Math.abs(point.x));
    // The profile is kept point for point: trim rings sit a millimetre proud of the
    // surface below them, and any smoothing of either profile would bury them.
    return new T.LatheGeometry(p.points,sides(r*radial,p.segments,6,p.phiLength),p.phiStart,p.phiLength);
  },
  TubeGeometry(p,s,o){
    const scale=Math.max(s.x,s.y,s.z),r=p.radius*scale;
    if(r<THIN_RADIUS)return null;
    const around=Math.min(p.radialSegments,r<.03?3:r<.08?4:6);
    if(o.keepUV)return new T.TubeGeometry(p.path,p.tubularSegments,p.radius,around,p.closed);
    const points=tracePath(p.path,p.tubularSegments,p.closed,KART_LOD_TOLERANCE*.75/scale);
    return polyTube(points,p.radius,around,p.closed);
  },
  RoundedBoxGeometry(p,s,o){
    if(o.keepUV)return undefined;
    const radius=Math.min(p.radius,p.width/2,p.height/2,p.depth/2)*Math.max(s.x,s.y,s.z);
    if(radius<.07)return new T.BoxGeometry(p.width,p.height,p.depth);
    return p.segments>1?new RoundedBoxGeometry(p.width,p.height,p.depth,1,p.radius):undefined;
  },
  BoxGeometry(p){
    if(p.widthSegments*p.heightSegments*p.depthSegments===1)return undefined;
    return new T.BoxGeometry(p.width,p.height,p.depth);
  },
  IcosahedronGeometry(p,s){
    const r=p.radius*Math.max(s.x,s.y,s.z),detail=Math.min(p.detail,r<.3?0:r<.9?1:2);
    return detail<p.detail?new T.IcosahedronGeometry(p.radius,detail):undefined;
  },
  ExtrudeGeometry(p,s,o){
    if(o.keepUV)return undefined;
    const options=p.options??{},curve=options.curveSegments??12,bevel=options.bevelSegments??3;
    const scale=Math.max(s.x,s.y,s.z);
    // A bevel narrower than the tolerance is a square edge from here.
    const bevelled=options.bevelEnabled!==false&&Math.max(options.bevelSize??options.bevelThickness??.2,options.bevelThickness??.2)*scale>KART_LOD_TOLERANCE;
    if(curve<=3&&bevel<=1&&bevelled===(options.bevelEnabled!==false))return undefined;
    return new T.ExtrudeGeometry(p.shapes,{...options,curveSegments:Math.max(3,Math.ceil(curve/3)),bevelSegments:1,bevelEnabled:bevelled});
  },
};
const REBUILD={
  CylinderGeometry:p=>new T.CylinderGeometry(p.radiusTop,p.radiusBottom,p.height,p.radialSegments,p.heightSegments,p.openEnded,p.thetaStart,p.thetaLength),
  ConeGeometry:p=>new T.ConeGeometry(p.radius,p.height,p.radialSegments,p.heightSegments,p.openEnded,p.thetaStart,p.thetaLength),
  SphereGeometry:p=>new T.SphereGeometry(p.radius,p.widthSegments,p.heightSegments,p.phiStart,p.phiLength,p.thetaStart,p.thetaLength),
  TorusGeometry:p=>new T.TorusGeometry(p.radius,p.tube,p.radialSegments,p.tubularSegments,p.arc),
  LatheGeometry:p=>new T.LatheGeometry(p.points,p.segments,p.phiStart,p.phiLength),
  TubeGeometry:p=>new T.TubeGeometry(p.path,p.tubularSegments,p.radius,p.radialSegments,p.closed),
  RoundedBoxGeometry:p=>new RoundedBoxGeometry(p.width,p.height,p.depth,p.segments,p.radius),
  BoxGeometry:p=>new T.BoxGeometry(p.width,p.height,p.depth,p.widthSegments,p.heightSegments,p.depthSegments),
  IcosahedronGeometry:p=>new T.IcosahedronGeometry(p.radius,p.detail),
  ExtrudeGeometry:p=>new T.ExtrudeGeometry(p.shapes,p.options),
};

function sameLayout(expected,actual){
  if(!expected||!actual||expected.count!==actual.count)return !expected&&!actual;
  const step=Math.max(1,Math.floor(expected.count/64));
  for(let i=0;i<expected.count;i+=step){
    if(Math.abs(expected.getX(i)-actual.getX(i))>1e-5||Math.abs(expected.getY(i)-actual.getY(i))>1e-5)return false;
  }
  return true;
}
const box=new T.Box3(),extent=new T.Vector3();

/**
 * At LOW detail, returns a coarser stand-in for `geometry` in the same place, the
 * geometry itself when it is already minimal or was reshaped by hand, or null when the
 * part is too small to see from the switch distance. At FULL detail it is the identity.
 * `keepUV` protects parts whose texture follows the shape's own UV layout.
 */
export function reduceGeometry(geometry,{keepUV=false,keepCaps=false,keepSmall=false}={}){
  if(level===FULL)return geometry;
  const position=geometry.attributes.position;
  if(!position?.count)return geometry;
  box.setFromBufferAttribute(position).getSize(extent);
  if(!keepSmall&&Math.max(extent.x,extent.y,extent.z)*mounted<DROP_SIZE){geometry.dispose();return null;}
  const recipe=RECIPES[geometry.type],parameters=geometry.parameters;
  if(!recipe||!parameters)return geometry;
  const reference=REBUILD[geometry.type](parameters);
  // A textured part whose UVs were re-laid by its builder cannot take a fresh layout.
  const matrix=keepUV&&!sameLayout(reference.attributes.uv,geometry.attributes.uv)?null
    :fitAffine(reference.attributes.position,position);
  reference.dispose();
  if(!matrix)return geometry;
  const e=matrix.elements;
  const scale=new T.Vector3(Math.hypot(e[0],e[1],e[2]),Math.hypot(e[4],e[5],e[6]),Math.hypot(e[8],e[9],e[10])).multiplyScalar(mounted);
  const coarse=recipe(parameters,scale,{keepUV,keepCaps});
  if(coarse===undefined)return geometry;
  geometry.dispose();
  if(coarse===null)return null;
  coarse.applyMatrix4(matrix);
  if(matrix.determinant()<0&&coarse.index){
    const index=coarse.index.array;
    for(let i=0;i<index.length;i+=3){const t=index[i+1];index[i+1]=index[i+2];index[i+2]=t;}
  }
  return coarse;
}

// Paint, textures and other finishes are made once and shared by both builds of a car,
// so the two builds draw with the same GPU program and the same texture memory.
const finishes=new Map();
export function once(key,make){
  if(!finishes.has(key))finishes.set(key,make());
  return finishes.get(key);
}
