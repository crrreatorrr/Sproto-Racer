// Three scenic reference points for Test Track 01. Entirely decorative;
// matched to the test-campus fleet, with one individually cullable mesh each.
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ink=0x24383c, slate=0x557377, white=0xf2f0d4, teal=0x67bdba, blue=0x3c7888;
const amber=0xffad39, orange=0xe56236, lime=0xd9ed64, rubber=0x293139;
const glass=0x2b5967, cement=0x73827e, darkGlass=0x294650;
const Y=new T.Vector3(0,1,0);
function workshop(name){
  const pieces=[], material=new T.MeshStandardMaterial({vertexColors:true,roughness:.74,metalness:.045});
  function add(source,color,x=0,y=0,z=0){
    const g=source.index?source.toNonIndexed():source;
    if(g!==source)source.dispose();
    g.translate(x,y,z);
    g.deleteAttribute('uv');
    const c=new T.Color(color), a=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<a.length;i+=3)c.toArray(a,i);
    g.setAttribute('color',new T.BufferAttribute(a,3));pieces.push(g);
  }
  const cube=(x,y,z,w,h,d,c)=>add(new T.BoxGeometry(w,h,d),c,x,y,z);
  function beam(a,b,r,c,tip=r,n=8){
    const start=new T.Vector3(...a), delta=new T.Vector3(...b).sub(start);
    const q=new T.Quaternion().setFromUnitVectors(Y,delta.clone().normalize());
    const m=new T.Matrix4().makeRotationFromQuaternion(q);
    const mid=start.addScaledVector(delta,.5);
    add(new T.CylinderGeometry(tip,r,delta.length(),n),c,mid.x,mid.y,mid.z);
    // Rotate about the midpoint after placing the color/normal-bearing cylinder.
    const g=pieces.at(-1);
    g.translate(-mid.x,-mid.y,-mid.z).applyMatrix4(m).translate(mid.x,mid.y,mid.z);
  }
  const lens=(x,y,z,sx,sy,sz,c)=>add(new T.IcosahedronGeometry(1,0).scale(sx,sy,sz),c,x,y,z);
  const dash=(x,y,z,d,side,c=white)=>cube(x,y,z,side?d:.17,.043,side?.17:d,c);
  function base(w,d,depth){
    cube(0,-.27,0,w,.55,d,cement);
    cube(0,-.03,0,w+.16,.12,d+.16,0x536165);
    if(depth>.83)cube(0,-depth*.5-.13,0,w-.8,depth,d-.8,0x52635f);
    for(const x of [-w*.46,w*.46])for(const z of [-d*.38,d*.38]){
      cube(x,-.13,z,.55,.28,2.9,lime);
      cube(x,.52,z,.19,1,.19,ink);
      cube(x,.94,z,.22,.13,.22,amber);
    }
  }
  function finish(){
    const geometry=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const mesh=new T.Mesh(geometry,material);mesh.name=name;return mesh;
  }
  return {add,cube,beam,lens,dash,base,finish};
}

function craneYard(h,depth){
  const {cube,beam,lens,base,dash}=h;
  base(19,24,depth);
  // Wheeled gantry service crane, angled lattice mast, counterweight hook.
  cube(2,1.18,4.4,5.85,.85,5.2,ink);cube(2,1.65,4.4,5.5,.42,4.8,amber);
  for(const x of [-1.12,5.12])for(const z of [2.65,6.14]){
    beam([x-.31,.78,z],[x+.31,.78,z],.76,rubber);
    beam([x-.33,.78,z],[x+.33,.78,z],.43,slate);
    beam([x-.35,.78,z],[x+.35,.78,z],.19,amber);
  }
  beam([2,1.8,4.4],[2,3.1,4.4],2.12,ink,1.82,12);
  cube(2,3.49,5.76,4.0,1.36,2.15,orange);
  cube(.79,4,2.2,1.72,2.75,2.75,amber);
  cube(.79,4.3,.803,1.46,1.24,.08,darkGlass);
  cube(-.091,4.27,1.91,.08,1.28,1.85,glass);
  cube(-.148,4.37,1.57,.05,.94,.19,blue);
  const from=[2.38,3.64,2.33], to=[2.38,16.1,-5.46];
  const lerp=(a,b,t)=>a+(b-a)*t;
  const pt=(t,side,up)=>[from[0]+side*lerp(.70,.32,t),lerp(from[1],to[1],t)+up*lerp(.49,.27,t),lerp(from[2],to[2],t)+up*.17];
  for(const k of [-1,1])for(const i of [-1,1])beam(pt(0,k,i),pt(1,k,i),.118,amber,.071,5);
  for(let i=0;i<8;i++){
    const a=i/8,b=(i+1)/8;
    for(const k of [-1,1]){
      beam(pt(a,k,-1),pt(b,k,1),.074,orange,.067,4);
      beam(pt(a,k,-1),pt(a,k,1),.076,amber,.074,4);
      beam(pt(a,-1,k),pt(a,1,k),.077,ink,.073,4);
    }
  }
  beam([2.38,16.3,-5.4],[2.38,7.4,-5.4],.042,ink,.042,5);
  lens(2.38,7.2,-5.4,.27,.38,.28,orange);
  beam([2.38,7.12,-5.42],[2.69,6.63,-5.46],.11,ink,.095,6);
  beam([2.69,6.63,-5.46],[3.00,6.91,-5.47],.095,ink,.072,6);
  // Four-wheel service hauler and cones on the road-facing foreground.
  const x=-4.16,z=-3.2;
  cube(x,.69,z,3.35,.48,7.75,ink);
  for(const dx of [-1.61,1.61])for(const zz of [z-2.33,z+2.3]){
    beam([x+dx-.24,.64,zz],[x+dx+.24,.64,zz],.59,rubber,.59,10);
    beam([x+dx-.245,.64,zz],[x+dx+.245,.64,zz],.29,slate,.29,8);
  }
  cube(x,1.6,z-2.18,3.36,1.48,3.04,white);
  cube(x,2.69,z-1.70,3.21,1.05,2.06,white);
  cube(x,2.69,z-2.762,2.81,.71,.07,glass);
  for(const dx of [-1.63,1.63]){
    cube(x+dx,2.68,z-1.75,.067,.70,1.38,darkGlass);
    cube(x+dx*.74,1.30,z-3.72,.55,.32,.14,amber);
  }
  cube(x,1.6,z-3.75,1.44,.40,.11,ink);
  cube(x,1.55,z+1.69,3.30,1.56,4.25,teal);
  cube(x,2.42,z+1.69,3.34,.15,4.20,white);
  cube(x,3.245,z-1.52,1.35,.19,.43,orange);
  for(let i=0;i<5;i++){
    cube(x-1.676,1.56,z+.39+i*.57,.11,.82,.43,i%2?blue:slate);
    const zz=-10.2+i*1.18;
    cube(-6.81,.063,zz,.49,.13,.49,ink);
    beam([-6.81,.11,zz],[-6.81,.73,zz],.23,orange,.075,8);
    beam([-6.81,.33,zz],[-6.81,.42,zz],.185,white,.153,8);
  }
  for(let i=0;i<7;i++){dash(-8.25,.058,-8.6+2.78*i,1.52,false,lime);dash(7.3,.058,-8.6+2.78*i,1.52,false);}
}

function fuelCanopy(h,depth){
  const {cube,beam,lens,base,dash}=h;
  base(20,25,depth);
  for(const x of [-5.0,5.0])for(const z of [-8.5,8.5]){
    cube(x,.44,z,1.29,.89,1.31,cement);
    cube(x,3.83,z,.63,7.0,.69,ink);
    cube(x-.333,3.73,z,.088,5.93,.43,teal);
    cube(x,7.12,z,1.12,.49,1.08,slate);
  }
  cube(0,7.35,0,14.7,.47,21.1,slate);
  cube(0,7.74,0,15.33,.63,21.8,white);
  cube(0,8.15,0,15.52,.21,22.1,teal);
  for(const s of [-1,1]){
    cube(s*7.74,7.82,0,.12,.26,22.2,lime);
    cube(0,7.82,s*11.02,15.52,.26,.13,lime);
  }
  for(let i=0;i<6;i++)cube(0,8.47,-8.25+i*3.25,10.9,.28,2.29,i%2?blue:glass);
  for(let i=0;i<3;i++){
    const z=-6+i*6;
    cube(-2,.25,z,2.4,.34,2.38,white);
    cube(-2,1.71,z,1.34,2.7,1.53,teal);
    cube(-2,2.90,z,1.55,.48,1.68,white);
    cube(-2.692,2.22,z,.10,.65,1.15,darkGlass);
    cube(-2.756,2.25,z,.036,.23,.57,lime);
    cube(-2.772,1.05,z,.047,.13,.63,orange);
    beam([-2.68,2.13,z+.61],[-3.16,1.17,z+.79],.039,ink,.039,6);
    beam([-3.16,1.17,z+.79],[-3.16,.85,z+.19],.041,ink,.041,6);
    beam([-3.16,.85,z+.19],[-2.65,1.33,z-.37],.041,ink,.061,6);
    cube(-2,7.11,z,5.15,.11,.19,white);
    dash(-5.8,.061,z,4.2,false,white);
  }
  // Tall four-sided fuel marker with a geometric lightning badge.
  cube(-7.4,1.2,-9.0,.68,2.3,.76,ink);
  cube(-7.4,3.02,-9.0,1.65,2.60,1.81,slate);
  cube(-8.24,3.02,-9.0,.11,1.94,1.46,glass);
  cube(-7.4,4.43,-9.0,1.74,.23,1.9,lime);
  const pts=[[-.13,.66],[.43,.66],[.04,.11],[.40,.11],[-.46,-.66],[-.15,-.06],[-.41,-.06]];
  const shape=new T.Shape(pts.map(p=>new T.Vector2(...p)));
  h.add(new T.ShapeGeometry(shape).rotateY(-Math.PI/2),lime,-8.31,3.03,-9.0);
  for(let i=0;i<3;i++)lens(-8.3,1.83+i*.16,-9.0,.035,.049,.32,i?teal:orange);
  for(let i=0;i<7;i++)dash(-7.7,.062,-8.6+i*2.8,1.6,false,lime);
}

function telemetryDish(h,depth){
  const {cube,beam,lens,base}=h;
  base(21,18,depth);
  cube(0,.72,0,8.2,1.46,8.2,cement);
  beam([0,1.2,0],[0,2.33,0],3.17,ink,2.78,16);
  beam([0,2.3,0],[0,5.42,0],2.58,slate,1.60,16);
  beam([0,5.41,0],[0,6.04,0],1.58,teal,1.46,16);
  beam([0,5.97,.26],[.85,8.57,1.02],.57,ink,.38,12);
  beam([.85,8.57,1.02],[.33,8.93,.44],.63,teal,.48,12);
  // Dished paraboloid made from tessellated porcelain panels, not a solid dome.
  // Face points above and obliquely toward the road and approaching driver.
  const axis=new T.Vector3(-.62,.423,-.66).normalize(), u=new T.Vector3(0,1,0).cross(axis).normalize(), v=axis.clone().cross(u);
  const origin=new T.Vector3(.2,9.0,.3),n=24;
  const P=(r,a,back=0)=>origin.clone().addScaledVector(u,r*Math.cos(a)).addScaledVector(v,r*Math.sin(a))
    .addScaledVector(axis,.047*r*r-back).toArray();
  const wrap=(p,color)=>{
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(p.flat(),3));
    g.computeVertexNormals();h.add(g,color);
  };
  for(let i=0;i<n;i++){
    const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2;
    wrap([P(0,a),P(2.1,a),P(2.1,b)],i%2?0xbbd8d0:0xcfe2d6);
    for(const [r,s,col] of [[2.1,4.4,0xd9e4d5],[4.4,6.6,0xf6efd2],[6.6,6.76,teal]]){
      wrap([P(r,a),P(s,a),P(s,b),P(r,a),P(s,b),P(r,b)],col);
    }
    wrap([P(0,a,.13),P(5.4,b,.13),P(5.4,a,.13),P(5.4,a,.13),P(5.4,b,.13),P(6.78,b,.13),P(5.4,a,.13),P(6.78,b,.13),P(6.78,a,.13)],slate);
    if(i%3===0){
      const rib=[.78,2.73,4.71,6.69];
      for(let j=0;j<rib.length-1;j++)beam(P(rib[j],a,.30),P(rib[j+1],a,.30),.072,ink,.055,5);
    }
  }
  const focal=origin.clone().addScaledVector(axis,5.75);
  for(let i=0;i<3;i++)beam(P(5.9,(i/3+.17)*Math.PI*2),focal.toArray(),.089,teal,.055,6);
  const receiverEnd=focal.clone().addScaledVector(axis,.39);
  beam(focal.toArray(),receiverEnd.toArray(),.35,white,.27,10);
  lens(receiverEnd.x,receiverEnd.y,receiverEnd.z,.22,.22,.25,amber);
  const mast=[6.8,.0,5.9];
  beam(mast,[6.8,10.3,5.9],.145,ink,.082,7);
  for(const y of [5.0,6.3,7.75])beam([5.18,y,5.9],[8.42,y,5.9],.075,teal,.075,6);
  lens(6.8,10.44,5.9,.22,.33,.22,orange);
  for(const zz of [-1.1,1.1]){
    cube(4.1,1.03,zz,1.4,2.04,1.2,ink);
    cube(3.36,1.31,zz,.11,.83,.97,blue);
    cube(3.27,1.40,zz,.074,.16,.64,lime);
  }
}

export function buildTestTrackLandmarks(core){
  if(core.id!=='track01')return null;
  const group=new T.Group();group.name='Test Track service landmarks';
  const ridge={};const route=[];
  // Straight-through conservative clearance from every road/spawn/Sky Lane.
  for(let s=0;s<core.length;s+=3.5){
    core.evalFrame(s,ridge);
    const lane=core.sky?.laneAt(s)??-1;
    route.push({x:ridge.centerX,z:ridge.centerZ,padding:Math.max(ridge.width*.5,
      s<165||s>core.length-34?43:0,lane>=0?core.sky.lanes[lane].width*.5+3:0)});
  }
  function location(section,fracs,sides,rad){
    const sec=core.sections[section];
    for(const u of fracs){
      const s=sec.start+(sec.end-sec.start)*u,f={};
      core.evalFrame(s,f);
      if((core.sky?.laneAt(s)??-1)>=0||f.centerY>22||Math.abs(f.curvature)>.010)continue;
      for(const side of sides)for(const margin of [7,11,15,20]){
        const offset=f.width*.5+rad+margin;
        const x=f.centerX+f.rightX*side*offset,z=f.centerZ+f.rightZ*side*offset;
        const clearance=Math.min(...route.map(r=>Math.hypot(r.x-x,r.z-z)-r.padding-rad));
        if(clearance<5.5)continue;
        const y=f.centerY-.94;
        const yaw=Math.atan2(-f.rightZ*side,f.rightX*side);
        return {x,y,z,yaw,clearance,s,side,offset};
      }
    }
    return null;
  }
  const names=[
    ['Amber maintenance crane and track rescue truck',craneYard,2,[.29,.11,.22,.34,.41,.48],[-1,1],16.1],
    ['Electric pit-service canopy and pumps',fuelCanopy,0,[.73,.83,.67,.88],[-1,1],16.5],
    ['Porcelain near-track telemetry dish',telemetryDish,10,[.41,.55,.69,.25],[-1,1],14.1],
  ];
  for(const [name,build,sec,ratios,sides,radius] of names){
    const place=location(sec,ratios,sides,radius);
    if(!place)continue;
    const h=workshop(name);
    build(h,place.y+6.44);
    const prop=h.finish();
    // A bounding-circle verification catches future art edits beyond the
    // original conservative placement envelope.
    const b=prop.geometry.boundingBox;
    if(Math.hypot(Math.max(Math.abs(b.min.x),Math.abs(b.max.x)),Math.max(Math.abs(b.min.z),Math.abs(b.max.z)))>radius){
      prop.geometry.dispose();prop.material.dispose();continue;
    }
    prop.position.set(place.x,place.y,place.z);prop.rotation.y=place.yaw;
    prop.userData.landmark={s:place.s,side:place.side,clearance:place.clearance,offset:place.offset,radius};
    group.add(prop);
  }
  return group.children.length?group:null;
}
