import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

// Bake each rigid assembly once. Preview, grid and ghost instances share the geometry.
export function assembly(hardware,grade) {
  const buckets=new Map();
  function add(geometry,material,color,position=[0,0,0],rotation=[0,0,0]) {
    const g=geometry.index?geometry.toNonIndexed():geometry;
    if(g!==geometry)geometry.dispose();
    const q=rotation.isQuaternion?rotation:new T.Quaternion().setFromEuler(new T.Euler(...rotation));
    g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...position),q,new T.Vector3(1,1,1)));
    if(material.vertexColors){
      g.deleteAttribute('uv');
      const rgb=new T.Color(color), data=new Float32Array(g.attributes.position.count*3);
      const normals=g.getAttribute('normal'),vertices=g.getAttribute('position');
      if(grade&&normals){
        const sample=new T.Color();
        for(let j=0;j<vertices.count;j++){
          grade(sample.copy(rgb),vertices.getY(j),normals.getY(j),material).toArray(data,j*3);
        }
      }else for(let i=0;i<data.length;i+=3)rgb.toArray(data,i);
      g.setAttribute('color',new T.BufferAttribute(data,3));
    }
    if(!buckets.has(material))buckets.set(material,[]);
    buckets.get(material).push(g);
  }
  function box(color,position,size,bevel=.015,rx=0,material=hardware){
    add(new RoundedBoxGeometry(...size,1,bevel),material,color,position,[rx,0,0]);
  }
  function pipe(color,a,b,r,material=hardware,r2=r,segments=10) {
    const v=new T.Vector3(...a),end=new T.Vector3(...b),along=end.clone().sub(v);
    const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),along.clone().normalize());
    add(new T.CylinderGeometry(r2,r,along.length(),segments),material,color,v.lerp(end,.5).toArray(),q);
  }
  return {add,box,pipe,finish(){
    return [...buckets].map(([material,parts])=>{
      const geometry=mergeGeometries(parts);
      parts.forEach(g=>g.dispose());
      return new T.Mesh(geometry,material);
    });
  }};
}

export function surface(points,indices,uv) {
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(points.flat(),3));
  g.setIndex(indices);
  if(uv)g.setAttribute('uv',new T.Float32BufferAttribute(uv.flat(),2));
  const flat=g.toNonIndexed();g.dispose();flat.computeVertexNormals();
  return flat;
}

// A small linear-radiance reflection map gives the nacre a horizon and long
// highlights in both daylight scenes, which otherwise only use direct lights.
let skyTexture;
export function alloyReflections(){
  if(skyTexture)return skyTexture;
  const width=256,height=128,data=new Uint16Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const lat=(y+.5)/height*Math.PI-Math.PI/2, lon=(x+.5)/width*2*Math.PI;
    const sky=Math.max(0,Math.sin(lat)),horizon=Math.exp(-((lat/.11)**2));
    const strip=(angle,elevation,height)=>Math.exp(-((Math.atan2(Math.sin(lon-angle),Math.cos(lon-angle))/1.04)**4)-(((lat-elevation)/height)**4));
    const warm=strip(1.1,.26,.075),cool=strip(4.6,.74,.12);
    const base=.045+.40*sky+.14*horizon;
    const rgb=[base+4.3*warm+1.9*cool,base+.07*sky+3.0*warm+2.6*cool,base+.23*sky+2.35*warm+4.1*cool];
    data.set([...rgb,1].map(T.DataUtils.toHalfFloat),4*(y*width+x));
  }
  const map=new T.DataTexture(data,width,height,T.RGBAFormat,T.HalfFloatType);
  map.mapping=T.EquirectangularReflectionMapping;map.needsUpdate=true;
  skyTexture=map;
  return map;
}

