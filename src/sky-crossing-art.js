import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Draw each flight obstacle in one call; code below uses -Z bird/plane noses
// before baking the final +X flight heading. Each instance owns its resources.
const C={navy:0x142139,white:0xfff5e6,coral:0xf55632,gold:0xffc144,
  mint:0x38d1db,silver:0xb2bfd3,ice:0xd8f5ff,blue:0x285fae,copper:0xad7141};

function assembly(flap){
  const parts=[];
  function add(input,hex,p=[0,0,0],rx=0,ry=0,rz=0,hinge){
    const g=input.index?input.toNonIndexed():input;
    if(g!==input)input.dispose();
    g.deleteAttribute('uv');
    g.rotateX(rx);g.rotateY(ry);g.rotateZ(rz);g.translate(...p);
    const count=g.getAttribute('position').count, colors=new Float32Array(count*3);
    const color=new T.Color(hex);
    for(let i=0;i<count;i++)color.toArray(colors,i*3);
    g.setAttribute('color',new T.BufferAttribute(colors,3));
    if(flap){
      const data=new Float32Array(count*4);
      if(hinge)for(let i=0;i<count;i++)data.set(hinge,i*4);
      g.setAttribute('aCrossingHinge',new T.BufferAttribute(data,4));
    }
    parts.push(g);
  }
  const box=(h,p,s,rx=0,ry=0,rz=0)=>add(new T.BoxGeometry(...s),h,p,rx,ry,rz);
  const ball=(h,p,s,n=12)=>add(new T.SphereGeometry(1,n,7).scale(...s),h,p);
  function tube(h,p,q,r1,r2=r1,n=10){
    const a=new T.Vector3(...p),b=new T.Vector3(...q), axis=b.clone().sub(a);
    const g=new T.CylinderGeometry(r2,r1,axis.length(),n);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),axis.normalize()));
    add(g,h,a.lerp(b,.5).toArray());
  }
  function solid(h,points,th,p=[0,0,0],rx=Math.PI*.5,ry=0,hinge){
    const shape=new T.Shape();
    points.forEach(([x,y],i)=> i?shape.lineTo(x,y):shape.moveTo(x,y));
    shape.closePath();
    const g=new T.ExtrudeGeometry(shape,{depth:th,bevelEnabled:false});
    g.translate(0,0,-th*.5);
    add(g,h,p,rx,ry,0,hinge);
  }
  function skin(h,rows,n=16,p=[0,0,0]){
    add(new T.LatheGeometry(rows.map(([z,r])=>new T.Vector2(r,z)),n),h,p,Math.PI*.5);
  }
  return {add,box,ball,tube,solid,skin,finish(){
    const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());return g;
  }};
}

function plane(h){
  h.skin(C.white,[[-.480,0],[-.451,.060],[-.379,.099],[-.280,.113],
    [.152,.103],[.302,.071],[.430,.018],[.446,0]]);
  h.skin(C.coral,[[-.480,0],[-.451,.061],[-.379,.102],[-.342,.108]]);
  h.ball(C.navy,[0,.071,-.310],[.091,.046,.084]);
  h.ball(C.mint,[0,.105,-.340],[.057,.016,.037],10);
  h.solid(C.coral,[[.165,.048],[.300,.288],[.374,.288],[.416,.044]],.043,[0,0,0],0,-Math.PI*.5);
  h.solid(C.white,[[.286,.179],[.363,.214],[.380,.168],[.297,.121]],.045,[0,0,0],0,-Math.PI*.5);
  for(const side of [-1,1]){
    const sym=points=>points.map(([x,z])=>[x*side,z]);
    h.solid(C.coral,sym([[.035,-.163],[.204,-.173],[.485,-.040],[.474,.055],[.207,.123],[.036,.137]]),.054,[0,-.034,0]);
    h.solid(C.white,sym([[.126,-.143],[.405,-.061],[.454,-.032],[.406,.040],[.144,.082]]),.009,[0,-.002,0]);
    h.solid(C.coral,sym([[.018,.245],[.210,.300],[.225,.340],[.112,.395],[.017,.395]]),.029,[0,.043,0]);
    const x=side*.223;
    h.tube(C.silver,[x,-.062,.082],[x,-.062,-.143],.049,.062,12);
    h.tube(C.navy,[x,-.062,-.143],[x,-.062,-.159],.049);
    h.tube(0x6c8499,[x,-.062,-.157],[x,-.062,-.166],.024);
    for(let i=0;i<4;i++)h.box(C.navy,[side*.101,.015,-.194+i*.087],[.020,.032,.045]);
    h.ball(side===1?C.mint:C.coral,[side*.461,.002,-.043],[.026,.020,.025],8);
  }
}

function birds(h){
  const flock=[[-.176,-.102,-.243,.77],[.031,.135,.017,.90],[.168,-.103,.296,.73]];
  for(const [i,[x,y,z,k]] of flock.entries()){
    const p=(a,b,c)=>[x+a*k,y+b*k,z+c*k];
    h.ball(C.white,p(0,0,0),[.061*k,.055*k,.135*k]);
    h.ball(C.white,p(0,.018,-.099),[.045*k,.050*k,.055*k]);
    h.tube(C.gold,p(0,.005,-.136),p(0,.001,-.211),.026*k,.006*k,8);
    h.solid(0xaecad7,[[-.056,.112],[0,.075],[.056,.112],[.041,.160],[-.041,.160]].map(v=>v.map(a=>a*k)),.019*k,p(0,.003,0));
    for(const s of [-1,1]){
      h.ball(C.navy,p(s*.034,.033,-.134),[.009*k,.012*k,.013*k],8);
      // This attribute contains the unrotated hinge coordinates and phase.
      const hinge=[x+s*.035*k,y+.020*k,s,i*1.17];
      const sym=pts=>pts.map(([a,b])=>[a*s*k,b*k]);
      h.solid(C.ice,sym([[.024,-.089],[.111,-.097],[.259,.031],[.281,.074],[.211,.087],[.121,.060],[.039,.038]]),
        .028*k,p(0,.020,0),Math.PI*.5,0,hinge);
      h.solid(C.navy,sym([[.200,-.023],[.259,.031],[.281,.074],[.211,.087],[.171,.066]]),
        .022*k,p(0,.028,0),Math.PI*.5,0,hinge);
    }
  }
}

function satellite(h){
  h.skin(C.copper,[[-.156,.120],[-.103,.162],[.100,.162],[.166,.115]],8);
  h.skin(C.gold,[[-.151,.126],[-.104,.167],[-.083,.166],[-.071,.157]],8);
  h.skin(C.gold,[[.072,.164],[.101,.167],[.140,.143],[.153,.125]],8);
  // Panel faces sit at 42°: distinctly blue from approach and side-on.
  for(const side of [-1,1]){
    const angle=Math.PI*.23;
    const p=(x,y,z)=>[Math.cos(angle)*side*x+Math.sin(angle)*z,y,-Math.sin(angle)*side*x+Math.cos(angle)*z];
    h.box(C.silver,p(.289,.013,.055),[.370,.264,.035],0,angle);
    h.box(C.navy,p(.291,.013,.033),[.350,.237,.018],0,angle);
    h.box(C.navy,p(.291,.013,.078),[.350,.237,.015],0,angle);
    for(let row=0;row<3;row++)for(let col=0;col<4;col++){
      const x=.161+col*.086, y=-.065+row*.078;
      h.box((row+col)%2?0x2981d1:C.blue,p(x,y,.019),[.076,.066,.014],0,angle);
      h.box(0x76d6eb,p(x,y+.020,.011),[.056,.005,.003],0,angle);
      h.box((row+col)%2?0x1c65b5:C.blue,p(x,y,.087),[.076,.066,.006],0,angle);
    }
    h.tube(C.silver,[side*.11,.02,.03],p(.165,.02,.057),.022);
    h.tube(C.silver,[side*.076,.120,.004],[side*.13,.355,.067],.009,.003,8);
    h.ball(side===1?C.mint:C.gold,[side*.13,.356,.067],[.016,.015,.016],8);
  }
  // Thick curved dish with a darker throat, open toward the driver.
  const dish=[
    [-.168,0],[-.179,.057],[-.202,.099],[-.235,.132],[-.284,.151],
    [-.306,.150],[-.304,.135],[-.257,.124],[-.219,.087],[-.195,.039],[-.194,0],
  ];
  h.skin(C.ice,dish,16,[0,.029,0]);
  h.tube(C.navy,[0,.027,-.189],[0,.027,-.373],.012,.008,8);
  h.ball(C.gold,[0,.028,-.371],[.024,.025,.022],9);
  h.tube(C.silver,[0,-.065,.163],[0,-.065,.234],.063,.041);
  h.ball(C.mint,[0,-.065,.236],[.033,.034,.019],9);
}

const flapAmplitude=.58;

function setFlap(material,uniforms){
  material.customProgramCacheKey=()=> 'sproto-sky-crossing-flap-v1';
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=`uniform float uCrossingTime;
      uniform float uCrossingDirection;
      attribute vec4 aCrossingHinge;
      vec3 crossingFlap(vec3 p,float angle){
        float c=cos(angle),s=sin(angle);
        return vec3(p.x,c*p.y+s*p.z,c*p.z-s*p.y);
      }
    `+shader.vertexShader
      .replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
        float flap=aCrossingHinge.z*${flapAmplitude.toFixed(2)}*sin(uCrossingTime*15.1+aCrossingHinge.w+.35*uCrossingDirection);
        objectNormal=crossingFlap(objectNormal,flap);`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        vec3 hinge=vec3(0.0,aCrossingHinge.y,aCrossingHinge.x);
        transformed=crossingFlap(transformed-hinge,flap)+hinge;`);
  };
}

function poseBounds(geometry, animated) {
  const bounds=geometry.boundingBox.clone();
  if(!animated)return bounds;
  const p=geometry.getAttribute('position'), hinges=geometry.getAttribute('aCrossingHinge');
  const point=new T.Vector3();
  for(let i=0;i<p.count;i++){
    if(!hinges.getZ(i))continue;
    const x=p.getX(i),hy=hinges.getY(i),hz=hinges.getX(i);
    const dy=p.getY(i)-hy,dz=p.getZ(i)-hz;
    const include = a=>{
      const c=Math.cos(a),s=Math.sin(a);
      bounds.expandByPoint(point.set(x,hy+c*dy+s*dz,hz+c*dz-s*dy));
    };
    include(-flapAmplitude);include(flapAmplitude);
    // Include the exact stationary points of Y and Z over the flap's arc.
    for(const a of [Math.atan2(dz,dy),Math.atan2(-dy,dz)]){
      for(const shift of [-Math.PI,0,Math.PI]){
        if(Math.abs(a+shift)<flapAmplitude)include(a+shift);
      }
    }
  }
  return bounds;
}

export function createSkyCrossingArt(type){
  const key=type==='birds'?'birds':type==='satellite'?'satellite':'plane';
  const h=assembly(key==='birds');
  ({plane,birds,satellite})[key](h);
  const geometry=h.finish();
  // Original -Z becomes the positive cross-track flight axis (+X).
  geometry.rotateY(-Math.PI*.5);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const material=new T.MeshStandardMaterial({vertexColors:true,roughness:.63,metalness:key==='satellite'?.23:.077});
  const mesh=new T.Mesh(geometry,material);
  const bounds=poseBounds(geometry,key==='birds');
  const size=bounds.getSize(new T.Vector3()), pivot=bounds.getCenter(new T.Vector3());
  mesh.scale.set(.96/size.x,.96/size.y,.96/size.z);
  mesh.position.copy(pivot).multiply(mesh.scale).negate();
  // Use the pose envelope for frustum culling and public bbox inspection.
  geometry.boundingBox=bounds;
  geometry.boundingSphere=bounds.getBoundingSphere(new T.Sphere());
  const art=new T.Group();
  art.name='skyCrossing:'+key;
  art.add(mesh);
  if(key==='birds'){
    const uniforms={uCrossingTime:{value:0},uCrossingDirection:{value:1}};
    setFlap(material,uniforms);
    art.userData.animateCrossing=(time,direction=1)=>{
      uniforms.uCrossingTime.value=Number.isFinite(time)?time:0;
      uniforms.uCrossingDirection.value=direction<0?-1:1;
    };
  }
  let disposed=false;
  art.userData.disposeCrossing=()=>{
    if(disposed)return;
    disposed=true;geometry.dispose();material.dispose();art.removeFromParent();
  };
  return art;
}
