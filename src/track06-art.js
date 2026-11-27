import * as T from 'three';

const DARK=0x27364d, METAL=0x4d6782, EDGE=0x729bb1, CYAN=0x43dbde, AQUA=0x79f0ed,
  BLUE=0x4599df, AMBER=0xf1ad5c, PINK=0xdc70a9, STREET=0x253440, STONE=0x354451;
const PALETTES=[[0x283d51,0x506779,0x315661,CYAN],[0x35394a,0x6b607c,0x514c68,PINK],
  [0x303b4b,0x726459,0x544c55,AMBER],[0x21374e,0x4f6f88,0x326790,BLUE]];
const TAU=Math.PI*2;
function seeded(n){return ()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);}
const p=(x,y,z)=>new T.Vector3(x,y,z);

function cityDusk(){
  const material=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,depthTest:true,fog:false,toneMapped:false,
    uniforms:{
      high:{value:new T.Color(0x12183f)},mid:{value:new T.Color(0x354d7f)},
      horizon:{value:new T.Color(0x827ca0)},lights:{value:new T.Color(0x926f8b)},
      lower:{value:new T.Color(0x333b60)}
    },
    vertexShader:`
      varying vec3 ray;
      void main(){
        ray=position;
        vec4 p=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);
        gl_Position=p.xyww;
      }`,
    fragmentShader:`
      varying vec3 ray;
      uniform vec3 high,mid,horizon,lights,lower;
      void main(){
        vec3 d=normalize(ray);float y=d.y;
        float a=atan(d.z,d.x);
        float glow=.5+.5*sin(a*3.0-.9);
        float film=sin(a*9.0+y*19.8+sin(a*3.0)*1.5);
        vec3 c=mix(horizon,mid,smoothstep(-.02,.27,y));
        c=mix(c,high,smoothstep(.16,.82,y));
        c=mix(c,lower,smoothstep(-.03,.29,-y));
        float cloud=.5+.5*sin(a*23.0+y*35.1+film*1.6);
        float band=exp(-pow(abs(y-.052)/.105,2.8));
        c=mix(c,lights,smoothstep(.27,.75,cloud)*(.13+.19*glow)*band);
        c+=.0016*(fract(sin(dot(gl_FragCoord.xy,vec2(9.41,7.19)))*13278.4)-.5);
        gl_FragColor=vec4(c,1.);
        #include <colorspace_fragment>
      }`,
  });
  const mesh=new T.Mesh(new T.SphereGeometry(1,30,18),material);
  mesh.name='Scenery prop fan-Neon dusk';mesh.frustumCulled=false;mesh.renderOrder=1000;
  return mesh;
}

export function buildTrackArt(core) {
  const group=new T.Group();
  group.name='Neon Grid / districts';
  group.add(cityDusk());
  const random=seeded(0x231caf81);
  const base=-6.38;
  const dims={
    box:new T.BoxGeometry(1,1,1),
    hex:new T.CylinderGeometry(.47,.5,1,6),
    chamfer:new T.CylinderGeometry(.36,.52,1,4,1,false,Math.PI*.25),
    ring:new T.TorusGeometry(1,.075,5,20),
    ball:new T.IcosahedronGeometry(1,1),
    blade:new T.CylinderGeometry(.22,.5,1,4,1,false,Math.PI*.25),
    pipe:new T.CylinderGeometry(.5,.5,1,8),
    cabin:new T.CylinderGeometry(.42,.49,1,8,1,false,Math.PI/8)
  };
  const solid=new T.MeshLambertMaterial({flatShading:true});
  const signal=new T.MeshBasicMaterial({toneMapped:true});
  const alloy=new T.MeshPhongMaterial({shininess:55,specular:0x7693a5,flatShading:true});
  const buckets=new Map();
  const part=new T.Object3D(), tint=new T.Color(), axis=p(0,1,0), vector=p(0,0,0);
  const frames=[];
  let clearanceMin=Infinity;
  for(let s=0;s<core.length;s+=15){
    const f={};core.evalFrame(s,f);
    frames.push([f.centerX,f.centerZ,Math.max(f.width*.5,core.sky?.inMainLane(s)?18.6:0),s]);
  }
  function nearestMargin(x,z,r){
    let best=Infinity;
    for(const [a,b,h] of frames)best=Math.min(best,Math.hypot(a-x,b-z)-h-r);
    return best;
  }
  function safe(x,z,r,gap=12){return nearestMargin(x,z,r)>=gap;}
  function artFrame(s){
    const f={};core.evalFrame(s,f);
    return {...f,center:p(f.centerX,f.centerY,f.centerZ),right:p(f.rightX,0,f.rightZ),
      yaw:Math.atan2(-f.forwardX,-f.forwardZ)};
  }
  function point(f,x,y=0){
    const q=f.center.clone().addScaledVector(f.right,x);
    q.y+=core.crossHeight(f,x)+y;return q;
  }
  function put(geo,pos,w,h,d,color,yaw=0,mode='solid',rotation){
    const bin=geo+'/'+mode+'/'+Math.floor(pos.x/460)+','+Math.floor(pos.z/460);
    if(!buckets.has(bin))buckets.set(bin,{geo,mode,items:[]});
    part.position.copy(pos);part.scale.set(w,h,d);
    if(rotation)part.quaternion.copy(rotation);else part.rotation.set(0,yaw,0);
    part.updateMatrix();
    buckets.get(bin).items.push([part.matrix.clone(),color]);
  }
  function beam(a,b,w,d,color,mode='solid'){
    vector.subVectors(b,a);const length=vector.length();
    if(length<.09)return;
    const rot=new T.Quaternion().setFromUnitVectors(axis,vector.multiplyScalar(1/length));
    put('box',a.clone().lerp(b,.5),w,length,d,color,0,mode,rot);
  }
  function marker(pos,w,d,color,yaw=0){
    put('box',pos,w,.15,d,color,yaw,'signal');
  }
  function at(i,t){return T.MathUtils.lerp(core.sections[i].start,core.sections[i].end,t);}
  function setY(v,y){return v.clone().setY(y);}
  function addTower(x,z,w,d,h,index,detail=false){
    if(!safe(x,z,Math.hypot(w,d)*.56,12))return false;
    clearanceMin=Math.min(clearanceMin,nearestMargin(x,z,Math.hypot(w,d)*.56));
    const [wall,ridge,glass,light]=PALETTES[index%4], y=base+.6;
    const tall=index%3!==1;
    put('box',p(x,y+1.6,z),w*1.18,3.2,d*1.16,STREET);
    put('box',p(x,y+h*.455,z),w,h*.91,d,wall);
    put('box',p(x+w*.081,y+h*.79,z-d*.075),w*.73,h*.55,d*.74,glass);
    put('box',p(x-w*.42,y+h*.48,z),w*.12,h*.84,d*1.02,ridge);
    put('box',p(x+w*.37,y+h*.46,z),w*.11,h*.81,d*1.03,ridge);
    put('box',p(x,y+h*.31,z+d*.499),w*.82,h*.571,.22,glass);
    put('box',p(x,y+h*.71,z-d*.502),w*.84,h*.15,.30,ridge);
    put(tall?'chamfer':'box',p(x+w*.073,y+h*1.109,z-d*.075),w*.69,h*.114,d*.72,ridge);
    if(tall){
      put('box',p(x+w*.093,y+h*1.19,z-d*.073),w*.21,h*.14,d*.21,wall);
      put('box',p(x+w*.090,y+h*1.264,z-d*.079),w*.21,.55,d*.22,light,0,'signal');
    }
    const levels=detail?7:3;
    for(let j=0;j<levels;j++){
      const yy=y+h*(.21+j*.60/levels);
      // Restrict bright paint to interrupted window strips; silhouette remains dark.
      put('box',p(x+((j%3)-1)*w*.11,yy,z+d*.51),w*(j%3===1?.49:.69),detail?.75:1.46,.15,light,0,'signal');
      if(detail&&j%2===0)put('box',p(x+w*.51,yy,z-d*.081),.18,.79,d*.64,light,0,'signal');
    }
    if(detail){
      // Facing rows of windows also on the sides seen from the inner ring.
      for(const front of [-1,1]){
        for(const k of [-.5,.5]){
          put('box',p(x+w*k*.39,y+h*.46,z+front*d*.507),w*.037,h*.72,.72,ridge);
          put('box',p(x+w*k*.38,y+h*.26,z+front*d*.516),w*.072,h*.26,.69,light,0,'signal');
        }
      }
      // Stepped wedge and split crown silhouettes are spaced through the near skyline.
      if(index%2===0){
        put('chamfer',p(x-w*.13,y+h*1.16,z+d*.05),w*.59,h*.18,d*.57,glass);
        put('box',p(x-w*.13,y+h*1.238,z+d*.05),w*.52,.74,d*.54,light,0,'signal');
      }
    }
    return true;
  }

  let towers=0;
  const occupied=[];
  // Distant skyline around the perimeter; buildings step down at districts between
  // the larger packages so the skyline has silhouettes instead of a repeated wall.
  for(let i=0;i<46;i++){
    const angle=i/46*TAU+.012, radius=1420+random()*270;
    for(let j=0;j<(i%4===0?3:2);j++){
      const x=Math.cos(angle)*(radius+j*104)+(random()-.5)*75;
      const z=Math.sin(angle)*(radius+j*104)+(random()-.5)*75;
      const w=40+random()*47,d=37+random()*55;
      const h=(65+random()*116)*(i%4===0?1.55:.91);
      if(addTower(x,z,w,d,h,i+j))towers++;
    }
  }
  // Near skyline follows the course but clears all other ground and air sectors.
  for(let s=100;s<core.length;s+=164){
    const f=artFrame(s), sector=f.index;
    for(const side of [-1,1]){
      if(random()<.19)continue;
      for(let j=0;j<2;j++){
        const q=point(f,side*(f.width*.5+57+j*76+random()*54));
        const w=25+random()*27,d=24+random()*33;
        if(occupied.some(([x,z,R])=>Math.hypot(q.x-x,q.z-z)<R+Math.max(w,d)*.66))continue;
        const h=(33+random()*60)*(sector>=4&&sector<=6?1.80:1);
        if(addTower(q.x,q.z,w,d,h,sector+j+(side>0?1:0),j===0)){
          towers++;occupied.push([q.x,q.z,Math.max(w,d)*.76]);
          if(j===0&&safe(q.x,q.z,Math.max(w,d)*.76,4)){
            const yard=p(q.x,base+.075,q.z);
            put('box',yard,w*1.70,.14,d*1.62,STREET);
            for(const sx of [-1,1]) marker(p(q.x+sx*w*.72,base+.17,q.z),.36,d*1.40,0x436278);
          }
        }
      }
    }
  }

  let gatewayBanks=0;
  // Landmark 1: machine-view launch boulevard garages with sloped caps and flood racks.
  for(const [sector,t,side] of [[0,.07,1],[0,.13,1],[0,.19,1],[0,.28,-1],[1,.30,1],[11,.65,-1]]){
    const f=artFrame(at(sector,t)), x=side*(f.width*.5+24);
    const q=point(f,x);
    if(!safe(q.x,q.z,15.2,8))continue;
    gatewayBanks++;
    const [wall,trim,glass,light]=PALETTES[sector%4];
    const deck=Math.max(base,q.y-1.15), pierHeight=deck-base;
    const long=p(Math.sin(f.yaw),0,Math.cos(f.yaw));
    const local=(dx,dy,dz)=>setY(q,deck+dy).addScaledVector(f.right,side*dx).addScaledVector(long,dz);
    // A pier-supported gallery brings the garage doors to road level, topped by
    // two angular shade canopies rather than a plain single roof slab.
    if(pierHeight>.3){
      put('chamfer',setY(q,base+pierHeight*.5),17.4,pierHeight,23.9,wall,f.yaw);
      for(const z of [-8.3,8.3])put('box',local(-4,-pierHeight*.5,z),2.1,pierHeight,2.4,METAL,f.yaw);
    }
    put('box',local(0,2.52,0),14.8,5.1,21.2,wall,f.yaw);
    put('box',local(-.65,5.07,0),17.3,.72,22.8,trim,f.yaw);
    put('chamfer',local(1,6.12,0),13.3,1.55,18.2,glass,f.yaw,'alloy');
    put('box',local(-7.12,2.29,0),.79,3.94,19.4,0x183045,f.yaw);
    put('box',local(-8.15,4.68,0),.27,.25,21.27,light,f.yaw,'signal');
    put('box',local(-7.79,.28,0),.23,.19,20.3,AMBER,f.yaw,'signal');
    for(let z=-2;z<=2;z++){
      const d=z*3.38;
      put('box',local(-7.66,2.14,d),.31,2.89,2.7,0x426481,f.yaw,'alloy');
      put('box',local(-7.87,2.62,d),.14,.36,2.23,z%2?AQUA:light,f.yaw,'signal');
      put('box',local(-7.74,1.36,d+1.49),.41,2.93,.19,trim,f.yaw);
    }
    for(const z of [-8.4,8.4]){
      beam(local(-7.75,3.35,z),local(-8.34,5.95,z),.29,.29,EDGE);
      put('blade',local(-6.62,6.18,z),2.18,2.05,4.35,trim,f.yaw);
      put('box',local(-6.42,7.25,z),.42,.25,2.81,light,f.yaw,'signal');
    }
  }

  let relaySpines=0;
  // Landmark 2: the photon exchange, power rings and external packet elevators.
  // Every part stays outside ground and air clearances, including the top cap.
  for(const [sector,t,side,raise] of [[2,.66,-1,37],[3,.42,-1,71],[4,.31,1,88],
      [5,.27,1,124],[5,.62,-1,115],[6,.23,1,82],[9,.68,-1,40],[10,.62,-1,51]]){
    const f=artFrame(at(sector,t)), x=side*(f.width*.5+31), q=point(f,x);
    if(!safe(q.x,q.z,14.2,10))continue;
    relaySpines++;
    const [wall,trim,glass,light]=PALETTES[(sector+1)%4];
    const altitude=Math.max(base+raise,f.centerY+(sector>=4&&sector<=6?27:14));
    const column=altitude-base, long=p(Math.sin(f.yaw),0,Math.cos(f.yaw));
    const detail=(dx,y,dz)=>setY(q,y).addScaledVector(f.right,side*dx).addScaledVector(long,dz);
    // A tall crown now reads above the flight corridor, with open wishbone
    // supports, a wide inset ferrite ring and a second luminous inner aperture.
    put('hex',setY(q,base+column*.42),12.4,column*.84,12.4,wall,f.yaw);
    put('chamfer',setY(q,altitude-7.36),14.6,7.8,14.6,trim,f.yaw,'alloy');
    put('box',setY(q,altitude-8.06),15.15,.66,15.15,light,f.yaw,'signal');
    const axial=new T.Quaternion().setFromAxisAngle(p(0,1,0),f.yaw);
    put('ring',setY(q,altitude+2.1),10.1,10.1,7.1,METAL,0,'alloy',axial);
    put('ring',setY(q,altitude+2.1),9.8,9.8,2.4,light,0,'signal',axial);
    put('ring',setY(q,altitude+2.1),6.5,6.5,1.25,0x83ece0,0,'signal',axial);
    put('ball',setY(q,altitude+2.1),2.45,3.78,2.45,light,0,'signal');
    for(const n of [-1,1]){
      beam(detail(n*8.75,altitude-14,0),detail(n*6.1,altitude+9.4,0),1.58,2.16,trim,'alloy');
      beam(detail(n*7.22,altitude-13.4,-1.06),detail(n*5.95,altitude+6.4,-1.06),.40,.56,light,'signal');
      beam(detail(n*6.65,altitude-4.6,-3.1),detail(n*.8,altitude-13.9,-3.1),.83,.87,EDGE);
      put('blade',detail(n*6.1,altitude+12.1,0),2.6,6.0,3.5,glass,f.yaw);
      marker(detail(n*6.1,altitude+15.2,0),.99,1.2,AMBER,f.yaw);
    }
    put('box',detail(0,base+column*.48,-6.55),.88,column*.58,.44,light,f.yaw,'signal');
  }

  let coolingPools=0;
  // Landmark 3: terraced heat-exchanger reservoirs and paired conduit runs.
  for(const [sec,t,side] of [[7,.30,-1],[8,.30,1],[8,.56,-1],[9,.28,1],[10,.38,1]]){
    const f=artFrame(at(sec,t)), x=side*(f.width*.5+51), q=point(f,x);
    if(!safe(q.x,q.z,34,11))continue;
    coolingPools++;
    const color=sec===8?0x367a99:0x336675;
    const coolant=Math.max(base,q.y-8.2);
    const support=coolant-base;
    if(support>.5)put('chamfer',setY(q,base+support*.5),41,support,46,0x314d63,f.yaw);
    const long=p(Math.sin(f.yaw),0,Math.cos(f.yaw));
    for(const n of [-1,1]){
      const a=setY(q,coolant+2.6).addScaledVector(f.right,n*9.9).addScaledVector(long,-17);
      const b=a.clone().addScaledVector(long,34);
      beam(a,b,.82,1.02,0x80b0c4,'alloy');
      for(const o of [-1,1]){
        const end=(o>0?b:a).clone();
        put('pipe',end.clone().add(p(0,-.34,0)),1.58,2.12,1.58,0x497789,f.yaw,'alloy');
        marker(end.clone().add(p(0,1.12,0)),1.03,1.03,CYAN,f.yaw);
      }
    }
    put('box',setY(q,coolant+.32),45,.64,52,0x364d64,f.yaw);
    put('box',setY(q,coolant+.68),41,.19,47,color,f.yaw);
    put('box',setY(q,coolant+.81),33,.16,39,0x44899c,f.yaw);
    for(const k of [-1,1]){
      const face=setY(q,coolant+.85).addScaledVector(f.right,18.5*k);
      marker(face,.37,45,CYAN,f.yaw);
      const bar=face.clone().addScaledVector(f.right,2.65*k);bar.y=coolant+1.35;
      put('box',bar,2.1,2.7,49,0x4b7188,f.yaw);
      for(const j of [-1,0,1]){
        const beside=bar.clone().add(p(Math.sin(f.yaw)*j*14,2.95,Math.cos(f.yaw)*j*14));
        put('hex',beside,2.9,3.6,2.9,0x497b95,f.yaw);
        marker(beside.clone().add(p(0,1.91,0)),1.73,1.73,AMBER,f.yaw);
      }
    }
  }

  // Short elevated monorail sections run near, not across, the raceway.
  let guideways=0;
  for(const [sec,u,sgn] of [[1,.58,-1],[3,.69,1],[6,.53,-1],[9,.71,1],[10,.51,-1],[11,.29,1]]){
    const origin=at(sec,u), way=[];
    for(let j=-3;j<=3;j++){
      const f=artFrame(origin+j*16), q=point(f,sgn*(f.width*.5+20.5));
      if(safe(q.x,q.z,3.8,9))way.push(setY(q,Math.max(base+11,Math.min(f.centerY-3,32))));
      else way.push(null);
    }
    for(let i=1;i<way.length;i++){
      const a=way[i-1],b=way[i];if(!a||!b)continue;
      beam(a,b,2.46,1.88,0x425771);beam(a.clone().add(p(0,.52,0)),b.clone().add(p(0,.52,0)),.24,.18,CYAN,'signal');
      guideways++;
      if(i%2===0)beam(setY(b,base),b,.87,.93,0x45617a);
    }
    const q=way[3];
    if(q&&way[4]){
      const d=way[4].clone().sub(q), yaw=Math.atan2(d.x,d.z);
      const polar=p(Math.sin(yaw),0,Math.cos(yaw)), lateral=p(polar.z,0,-polar.x);
      put('cabin',q.clone().add(p(0,1.89,0)),3.56,2.62,13.6,0x628897,yaw,'alloy');
      put('box',q.clone().add(p(0,2.72,0)),3.22,1.03,9.55,0x305b70,yaw);
      put('box',q.clone().add(p(0,3.26,0)),2.77,.15,7.22,AMBER,yaw,'signal');
      for(const side of [-1,1]){
        const band=q.clone().add(p(0,2.45,0)).addScaledVector(lateral,side*1.58);
        put('box',band,.11,.51,8.1,AQUA,yaw,'signal');
        for(const j of [-1,0,1])put('box',band.clone().addScaledVector(polar,j*2.11),.17,.68,.13,DARK,yaw);
      }
      for(const n of [-1,1]){
        const k=q.clone().add(p(0,1.64,0)).addScaledVector(polar,n*6.38);
        put('box',k,1.65,.22,.28,n>0?AQUA:AMBER,yaw,'signal');
      }
    }
  }

  // Compact navigation beacons frame the fast curves without pretending to be
  // hazards. These are shorter than the scripted flight objects and well outside.
  for(let s=170;s<core.length;s+=98){
    const f=artFrame(s), inAir=core.sky?.inMainLane(s), side=f.curvature>0?1:-1;
    const pos=point(f,side*(f.width*.5+(inAir?16:10.5)));
    if(!safe(pos.x,pos.z,1.65,7))continue;
    const y=pos.y;
    put('box',setY(pos,y+.89),2.0,1.8,1.8,0x465b72,f.yaw);
    put('box',setY(pos,y+3.41),.74,5.41,.82,0x3c506a,f.yaw);
    put('box',setY(pos,y+6.03),1.88,.45,1.04,0x5e7891,f.yaw);
    put('box',setY(pos,y+6.06),1.58,.29,1.09,inAir?CYAN:AMBER,f.yaw,'signal');
  }

  let triangles=0,instances=0;
  const usedGeometry=new Set();
  for(const {geo,mode,items} of buckets.values()){
    const geometry=dims[geo];
    usedGeometry.add(geometry);
    const batch=new T.InstancedMesh(geometry,mode==='signal'?signal:mode==='alloy'?alloy:solid,items.length);
    batch.name=mode==='signal'?'Neon district lights':'Neon district structures';
    for(let i=0;i<items.length;i++){
      batch.setMatrixAt(i,items[i][0]);batch.setColorAt(i,tint.setHex(items[i][1]));
    }
    batch.computeBoundingSphere();
    group.add(batch);
    instances+=items.length;
    triangles+=(geometry.index?.count??geometry.attributes.position.count)/3*items.length;
  }
  for(const geometry of Object.values(dims))if(!usedGeometry.has(geometry))geometry.dispose();
  group.userData.artStats={towers,gatewayBanks,relaySpines,coolingPools,guideways,batches:buckets.size,instances,triangles,
    minimumTowerRoadMargin:clearanceMin};
  return group;
}
