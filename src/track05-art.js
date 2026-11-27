import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const TAU=Math.PI*2;
const A=TAU/12;
const PI2=Math.PI/2;
const rgb=c=>new T.Color(c);
const pale=0xb5c8d5, chalk=0xe1e0d9, hull=0x526780, metal=0x293952,
  carbon=0x293556, solar=0x293c76, ocean=0x4581a3, ice=0x64d3ed, gold=0xfcad63;

function celestial(){
  const shader=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,depthTest:true,fog:false,toneMapped:false,
    vertexShader:`varying vec3 direction;
      void main(){direction=position;vec4 p=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);gl_Position=p.xyww;}`,
    fragmentShader:`
      varying vec3 direction;
      float hash(vec2 p){vec3 h=fract(vec3(p.xyx)*.1031);h+=dot(h,h.yzx+33.33);return fract((h.x+h.y)*h.z);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
      vec2 sphereMap(vec3 d){
        d/=abs(d.x)+abs(d.y)+abs(d.z);
        vec2 f=d.xy;
        if(d.z<0.)f=(1.-abs(f.yx))*sign(f+1e-6);
        return f*.5+.5;
      }
      vec3 stars(vec3 d){
        vec2 p=sphereMap(d)*132.;
        vec2 i=floor(p), q=fract(p)-.5;
        float seed=hash(i+9.71);
        vec2 offset=vec2(hash(i+13.6),hash(i-7.83))*.42-.21;
        float dist=length(q-offset), r=mix(.022,.079,seed*seed*seed);
        float core=1.-smoothstep(r*.27,r*1.34,dist);
        float glow=(1.-smoothstep(r,r*2.75,dist))*.12;
        vec3 tint=mix(vec3(.36,.57,.96),vec3(1.,.79,.61),hash(i+24.69));
        return tint*(core+glow)*smoothstep(.64,.98,seed)*.76;
      }
      void main(){
        vec3 d=normalize(direction);
        float y=d.y;
        vec3 bg=mix(vec3(.016,.023,.046),vec3(.0024,.0048,.017),smoothstep(-.02,.72,y));
        bg=mix(bg,vec3(.033,.041,.068),smoothstep(.04,.30,-y)*.8);
        vec2 sky=vec2(dot(d,vec3(.94,.24,.10)),dot(d,vec3(-.21,.88,.44)))*4.6;
        float galaxy=smoothstep(.28,.72,noise(sky)+.29*noise(sky*2.5+2.1));
        float lane=pow(max(0.,1.-abs(dot(d,normalize(vec3(.45,.89,.12))))),7.);
        bg+=vec3(.028,.022,.066)*galaxy*lane*.92+stars(d);
        vec3 sun=normalize(vec3(-.72,.66,-.15));
        float softSun=pow(max(dot(d,sun),0.),37.);
        bg+=vec3(.38,.57,.90)*softSun*.09;
        vec3 key=normalize(vec3(-.47,.63,.62));
        vec3 center=normalize(vec3(-.21,.25,-1.))*3.15;
        float radius=.51;
        float b=dot(center,d), discr=radius*radius-dot(center,center)+b*b;
        float body=1e9;
        if(b>0. && discr>0.){
          body=b-sqrt(discr);
          vec3 n=(d*body-center)/radius;
          vec3 spin=normalize(vec3(.20,.96,.27));
          float a=dot(n,spin);
          float bands=sin(a*26.+noise(n.xz*5.)*1.7)*.16+sin(a*63.+n.x*4.)*.075;
          float haze=noise(n.xz*11.+vec2(a*15.,a*8.))*.07;
          vec3 bandsColor=mix(vec3(.34,.103,.125),vec3(.80,.422,.219),.55+bands+haze);
          bandsColor=mix(bandsColor,vec3(.85,.61,.39),smoothstep(.40,.81,sin(a*12.+.9))*.52);
          float light=clamp((dot(n,key)+.16)*.78,0.,1.);
          bg=bandsColor*(.08+light*.99)+vec3(.16,.082,.13)*pow(1.-max(0.,-dot(n,d)),3.)*.62;
        }
        vec3 pole=normalize(vec3(.20,.94,.27));
        float den=dot(d,pole);
        float t=dot(center,pole)/(sign(den)*max(abs(den),.0001)+.000001);
        if(t>0. && t<body){
          vec3 p=d*t-center;
          float r=length(p);
          if(r>.66&&r<1.12){
            float inner=smoothstep(.66,.693,r), outer=1.-smoothstep(1.083,1.12,r);
            float gap=1.-.72*smoothstep(.804,.813,r)*(1.-smoothstep(.834,.840,r));
            float v=.52+.15*sin(r*104.)+.20*sin(r*54.)+.05*sin(r*173.);
            float shadow=smoothstep(.47,.54,length(cross(p,key)));
            if(dot(p,key)>0.)shadow=1.;
            vec3 dust=mix(vec3(.42,.18,.21),vec3(.90,.55,.30),v);
            bg=mix(bg,dust*(.22+shadow*.57),inner*outer*gap*(.54+v*.28));
          }
        }
        vec3 moonAxis=normalize(vec3(.68,.27,.69));
        float moon=dot(d,moonAxis), moonDisk=smoothstep(.99825,.99853,moon);
        if(moonDisk>0.){
          vec3 rel=(d-moon*moonAxis)*17.70;
          vec3 N=normalize(rel-moonAxis*sqrt(max(0.,1.-dot(rel,rel))));
          float light=clamp(.09+dot(N,normalize(vec3(-.8,.55,.06)))*1.13,.07,1.);
          float regolith=.73+.35*noise(rel.xy*5.8)+.10*noise(rel.xy*19.5+3.0);
          vec3 iceMoon=mix(vec3(.015,.03,.092),vec3(.26,.51,.76),light)*regolith;
          bg=mix(bg,iceMoon,moonDisk);
        }
        gl_FragColor=vec4(bg,1.);
        #include <colorspace_fragment>
      }`,
  });
  const o=new T.Mesh(new T.SphereGeometry(1,36,20),shader);
  o.name='Ringed gas giant and fixed stars';o.renderOrder=1400;o.frustumCulled=false;
  return o;
}

const craters=[
  [-1048,-795,390,37],[-577,-229,205,19],[311,-710,334,55],[660,-1002,312,45],
  [1061,-1035,490,60],[1174,-210,236,36],[1670,144,505,64],[645,679,203,31],
  [-162,743,267,32],[-1279,209,430,55],[-1740,-1125,365,45],[2076,725,393,38],
  [-1269,1242,431,50],[803,1647,643,80],[1827,-1742,775,84],[-2184,781,814,128],
];
const low=new T.Color(0x35394e), light=new T.Color(0x5f667e), mica=new T.Color(0x887a84), tint=new T.Color();
function surfaceAt(x,z){
  let y=-24+5*Math.sin(x*.007+z*.004)+3*Math.sin(z*.023+x*.009);
  for(const [cx,cz,r,depth] of craters){
    const d=Math.hypot((x-cx)*1.03,z-cz)/r;
    if(d<1.8){
      y-=depth*Math.max(0,1-d*d)**2;
      y+=depth*.26*Math.exp(-((d-.83)**2)*62);
    }
  }
  return Math.min(4,y);
}
function regolith(){
  const size=3500, n=166, pos=[],colors=[],indices=[];
  const f=(x,z)=>{const y=surfaceAt(x,z),edge=.5+.5*Math.sin(x*.047+Math.sin(z*.029))*Math.cos(z*.046);
    const g=T.MathUtils.clamp(.14+(y-surfaceAt(x-9,z+7))*.102+edge*.50,.04,.96);
    tint.copy(low).lerp(light,g).lerp(mica,.12*Math.max(0,Math.sin(x*.017-z*.013)));return [x,y,z,tint.r,tint.g,tint.b];};
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
    const x=(i/n*2-1)*size, z=(j/n*2-1)*size;
    const [X,Y,Z,r,g,b]=f(x,z);pos.push(X,Y,Z);colors.push(r,g,b);
    if(i<n&&j<n){const k=j*(n+1)+i;indices.push(k,k+n+1,k+1,k+1,k+n+1,k+n+2);}
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();
  const mat=new T.ShaderMaterial({fog:true,vertexColors:true,toneMapped:false,
    uniforms:T.UniformsUtils.merge([T.UniformsLib.fog]),
    vertexShader:`varying vec3 soil,world;
      #include <fog_pars_vertex>
      void main(){soil=color;world=position;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader:`varying vec3 soil,world;
      #include <fog_pars_fragment>
      float hash(vec2 p){vec3 a=fract(vec3(p.xyx)*.1031);a+=dot(a,a.yzx+33.33);return fract((a.x+a.y)*a.z);}
      float grit(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      void main(){vec2 p=world.xz*.14;
        float aa=1.-smoothstep(.7,2.2,length(fwidth(p)));
        float g=(grit(p)-.5)*aa*.23+(grit(p*.25)-.5)*.31+(grit(p*.037)-.5)*.18;
        gl_FragColor=vec4(soil*(1.+g),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh=new T.Mesh(g,mat);mesh.name='Regolith and basin floor';return mesh;
}

function installation(core){
  const records=new Map();
  const q=new T.Quaternion(), rotation=new T.Euler(), p=new T.Vector3(), scale=new T.Vector3(), mat4=new T.Matrix4();
  const unit={
    cube:new T.BoxGeometry(1,1,1),
    column:new T.CylinderGeometry(1,1,1,14),
    sphere:new T.SphereGeometry(1,14,8),
    dome:new T.SphereGeometry(1,36,16,0,TAU,0,PI2),
    habitatSkin:new T.SphereGeometry(1,5,8,.028,A-.056,0,PI2),
    habitatRib:new T.SphereGeometry(1,2,10,0,.025,0,PI2),
    column12:new T.CylinderGeometry(1,1,1,12),
    flange:new T.CylinderGeometry(1.02,1.12,1,12),
    bevel:new T.CylinderGeometry(1.00,1.17,1,8),
    strut:new T.CylinderGeometry(1,1,1,6),
    torus:new T.TorusGeometry(1,.045,5,24),
    rock:new T.IcosahedronGeometry(1,0),
    dish:new T.LatheGeometry([[0,0],[.19,.023],[.50,.110],[.79,.237],[1,.389],[.979,.365],[.76,.211],[.48,.082],[.14,-.013],[0,-.019]].map(x=>new T.Vector2(...x)),22),
  };
  function stock(name,x,y,z,w,h,d,c,rx=0,ry=0,rz=0,glow=false){
    const key=(glow?'e':'p')+Math.floor(x/780)+':'+Math.floor(z/780);
    if(!records.has(key))records.set(key,[]);
    const g=unit[name].index?unit[name].toNonIndexed():unit[name].clone();
    g.deleteAttribute('uv');g.deleteAttribute('uv1');
    const tint=rgb(c),cl=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<cl.length;i+=3)tint.toArray(cl,i);
    g.setAttribute('color',new T.BufferAttribute(cl,3));
    if(rx?.isQuaternion)q.copy(rx);else q.setFromEuler(rotation.set(rx,ry,rz,'YXZ'));
    g.applyMatrix4(mat4.compose(p.set(x,y,z),q,scale.set(w,h,d)));
    records.get(key).push(g);
  }
  const rz=(x,z,angle,dx,dz)=>[x+dx*Math.cos(angle)+dz*Math.sin(angle),z-dx*Math.sin(angle)+dz*Math.cos(angle)];
  function along(sector,u,lateral){
    const section=core.sections[sector], f=core.sample(T.MathUtils.lerp(section.start,section.end,u),0);
    const {x,z}=f.position, {right,forward}=f;
    return [x+right.x*lateral,z+right.z*lateral,Math.atan2(forward.x,forward.z)];
  }
  const slab=(x,y,z,w,h,d,c,yaw)=>stock('cube',x,y,z,w,h,d,c,0,yaw);
  const lightAt=(x,y,z,w,h,d,c,yaw=0)=>stock('cube',x,y,z,w,h,d,c,0,yaw,0,true);
  const V=a=>new T.Vector3(...a);
  const beam=(a,b,w,c,glow=false)=>{
    const u=V(a), v=V(b), d=v.clone().sub(u);
    const turn=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.clone().normalize());
    stock('strut',...(u.addScaledVector(d,.5).toArray()),w,d.length(),w,c,turn,0,0,glow);
  };
  const local=(x,y,z,angle,dx,dy,dz)=>{
    const v=rz(x,z,angle,dx,dz);return [v[0],y+dy,v[1]];
  };
  function habitat(x,z,s,yaw,ind=0){
    const y=surfaceAt(x,z)+1;
    const place=(dx,dy,dz)=>local(x,y,z,yaw,dx*s,dy*s,dz*s);
    const deck=(dx,dy,dz,w,h,d,c,kind='cube')=>stock(kind,...place(dx,dy,dz),w*s,h*s,d*s,c,0,yaw);
    const panel=(dx,dy,dz,w,h,d,c)=>lightAt(...place(dx,dy,dz),w*s,h*s,d*s,c,yaw);
    deck(0,2,0,27.4,4.2,27.4,0x344866,'flange');
    deck(0,5.6,0,25.6,5.8,25.6,0x637b95,'column12');
    deck(0,9.8,0,26.9,2.7,26.9,pale,'flange');
    const glass=ind%2?[0x317a99,0x4084a2,0x265e7a]:[0x2e7399,0x365ca2,0x478ab3];
    stock('dome',x,y+11*s,z,22.5*s,23.8*s,22.5*s,0x28425b,0,yaw);
    for(let j=0;j<12;j++){
      const a=j*A+yaw;
      stock('habitatSkin',x,y+11*s,z,22.63*s,23.94*s,22.63*s,glass[j%3],0,a);
      stock('habitatRib',x,y+11*s,z,22.88*s,24.23*s,22.88*s,j%3===0?chalk:pale,0,a);
      const f=(j+.5)*A;
      const pt=place(Math.sin(f)*25.3,7.4,Math.cos(f)*25.3);
      stock('cube',...pt,8.9*s,2.8*s,.62*s,metal,0,yaw+f);
      for(const j of [-1,0,1]) {
        const p=place(Math.sin(f)*25.69+Math.cos(f)*j*2.6,7.46,Math.cos(f)*25.69-Math.sin(f)*j*2.6);
        lightAt(...p,1.74*s,.89*s,.22*s,j===0?gold:ice,yaw+f);
      }
    }
    for(const [v,c,scale] of [[.3,0x7089aa,1],[8.4,pale,.68],[14.8,0xabc8d6,.53],[19.8,pale,.41]]){
      const r=22.63*Math.sqrt(1-(v/23.94)**2);
      stock('torus',x,y+(11+v)*s,z,r*s,r*s,r*s*scale,c,PI2);
    }
    // Double vestibule and warm-lit lockways break up the circular footprint.
    deck(0,5.8,25.4,13.9,10.6,18.4,metal);
    deck(0,11.7,27,15.6,2.7,15.5,chalk);
    deck(0,6.15,35,11.7,8.8,1.7,0x64809b);
    deck(0,6.15,36,8.7,6.6,.54,0x223e58);
    panel(0,10.8,36.2,10.3,.63,.29,ice);
    for(const a of [-5.9,5.9]){
      deck(a,6,35.7,1.7,10.0,2.2,0xd1cab5);
      deck(a,2.4,39,5.4,2.8,7.6,0x40556d,'bevel');
      panel(a,8.17,36.9,1.1,.95,.17,gold);
    }
    deck(0,35.4,0,5.4,3.2,5.4,chalk,'bevel');
    deck(0,39,0,2.4,5.9,2.4,metal,'column12');
    panel(0,42.05,0,2.7,.90,2.7,gold);
    for(const a of [-1,1]){
      deck(a*19,4.1,-20,9.8,7.3,11.2,ind?0x536e88:0xb59a78);
      panel(a*19,5.5,-25.7,4.1,.64,.22,ice);
    }
  }
  function array(x,z,yaw,k){
    const y=surfaceAt(x,z);
    const place=(dx,dy,dz)=>local(x,y,z,yaw,dx,dy,dz);
    const part=(dx,dy,dz,w,h,d,c,rx=0)=>stock('cube',...place(dx,dy,dz),w,h,d,c,rx,yaw);
    part(0,.9,0,10,2.0,8,metal);stock('column12',x,y+7.8,z,1.6,14.5,1.6,pale);
    part(0,14,0,4.6,3.3,5.3,hull);
    const tilt=k%2?-.34:-.28;
    for(const side of [-1,1]){
      const cx=side*14;
      part(cx,16.6,0,23.6,1.5,12.8,0xa4b7c8,tilt);
      part(cx,17.6,0,22.4,.92,11.9,0x243455,tilt);
      beam(place(0,8.2,0),place(cx,16.4,0),.49,hull);
      for(let j=0;j<7;j++)for(let row=0;row<2;row++){
        const z=.25+(row-.5)*5.69;
        const px=cx+(j-3)*3.12;
        const py=18.11+Math.sin(-tilt)*z;
        part(px,py,z,2.97,.28,5.37,(j+row+k)%3===0?0x425eaa:0x314e87,tilt);
      }
      lightAt(...place(cx,18.7,6.7),7.6,.39,.14,ice,yaw);
    }
    lightAt(x,y+17.8,z,2.3,.57,2.1,gold,yaw);
  }
  function antenna(x,z,w,yaw){
    const y=surfaceAt(x,z);
    const at=(dx,dy,dz)=>local(x,y,z,yaw,dx*w,dy*w,dz*w);
    stock('bevel',x,y+2.5*w,z,12*w,5*w,12*w,0x687a92,0,yaw);
    stock('column12',x,y+4.8*w,z,8.8*w,3.6*w,8.8*w,metal,0,yaw);
    // Unmistakably an open lattice pedestal, with diagonal steel bracing.
    for(const side of [-1,1])for(const dz of [-1,1]){
      beam(at(5.7*side,6,5.1*dz),at(2.5*side,30.6,2.3*dz),.61*w,pale);
      beam(at(5.1*side,6,4.9*dz),at(-4.3*side,14.6,4.2*dz),.36*w,hull);
      beam(at(4.34*side,14.6,4.2*dz),at(-3.5*side,22.9,3.2*dz),.33*w,hull);
      beam(at(3.32*side,22.9,3.13*dz),at(-2.5*side,30.6,2.3*dz),.31*w,hull);
    }
    stock('flange',x,y+31.5*w,z,5.6*w,4.7*w,5.6*w,pale,0,yaw);
    stock('sphere',x,y+36.5*w,z,5*w,3.7*w,4.3*w,metal);
    const angle=.84;
    const q=new T.Quaternion().setFromEuler(new T.Euler(angle,yaw,0,'YXZ'));
    const origin=new T.Vector3(x,y+39.9*w,z);
    const jet=(dx,dy,dz)=>new T.Vector3(dx*w,dy*w,dz*w).applyQuaternion(q).add(origin).toArray();
    stock('dish',...origin.toArray(),20.4*w,17.6*w,20.4*w,0xd8e4e9,angle,yaw);
    stock('torus',...jet(0,6.85,0),20.3*w,20.3*w,20.3*w,0x859db7,angle+PI2,yaw);
    for(let j=0;j<12;j++){
      const a=j*TAU/12, X=Math.sin(a), Z=Math.cos(a);
      beam(jet(3.3*X,-.33,3.3*Z),jet(11.2*X,2.05,11.2*Z),.43*w,j%2?pale:hull);
      beam(jet(11.2*X,2.05,11.2*Z),jet(19.4*X,6.15,19.4*Z),.38*w,pale);
      if(j%3===0)beam(jet(17.4*X,5.6,17.4*Z),jet(0,15,0),.45*w,0xb3bed0);
    }
    stock('sphere',...jet(0,15.0,0),2.3*w,2.0*w,2.3*w,0xf2ab69,q,0,0);
    stock('sphere',...jet(0,16.53,0),.92*w,.92*w,.92*w,0xffc681,q,0,0,true);
  }
  function docking(x,z,yaw,s=1){
    const y=surfaceAt(x,z), at=(x0,y0,z0)=>local(x,y,z,yaw,x0*s,y0*s,z0*s);
    const part=(x0,y0,z0,w,h,d,c)=>slab(...at(x0,y0,z0),w*s,h*s,d*s,c,yaw);
    part(0,1.5,0,48,3.1,37,metal);
    part(0,5,0,44,4.8,35,hull);
    part(0,10.2,-6.4,34,7.7,23.8,0xa7b5c8);
    part(0,14.2,-8.6,38,2.4,24.8,chalk);
    for(const d of [-1,1]){
      part(d*21.2,11,0,6.3,22,27,0x435e80);
      part(d*21.2,23.2,0,8.3,3,28.4,pale);
      lightAt(...at(d*21.2,24.95,0),2.8*s,.76*s,8*s,ice,yaw);
      for(const z0 of [-12,-5,2,9,16])part(d*20.58,10,z0,5.3,1.12,1.1,gold);
    }
    const stand=at(0,15.65,8.2);
    stock('torus',...stand,12.1*s,11.3*s,12.1*s,0xc6d7de,0,yaw);
    stock('torus',...at(0,15.65,8.34),10.2*s,9.4*s,9.5*s,ice,0,yaw,0,true);
    for(const d of [-1,1])beam(at(d*9,7.1,8.2),at(d*20.1,19.5,8.2),.71*s,metal);
    for(let i=-3;i<=3;i++)lightAt(...at(i*3.6,5.68,18),2.1*s,.54*s,.23*s,i%2?ice:gold,yaw);
  }
  function prop(sector,u,lateral,fn,...args){
    const [x,z,yaw]=along(sector,u,lateral);fn(x,z,...args,yaw);
  }
  for(const [u,s,ind] of [[.06,1.88,0],[.29,1.44,1],[.51,1.12,2]]){
    const [x,z,yaw]=along(0,u,-96);
    habitat(x,z,s,yaw+.36,ind);
  }
  for(const [sector,u,side,sz] of [[0,.66,91,1.48],[5,.64,-107,1.62],[6,.32,89,1.39],[8,.22,-111,1.76],[11,.60,100,1.15]]){
    const [x,z,yaw]=along(sector,u,side);habitat(x,z,sz,yaw,sector);
  }
  for(const [sector,u,side,sz] of [[0,.42,115,1.62],[2,.79,-100,1.88],[6,.26,-107,2.08],[7,.62,139,1.59],[10,.47,-113,1.52]]){
    prop(sector,u,side,antenna,sz);
  }
  for(const [i,u] of [[1,.08],[1,.24],[1,.40],[3,.18],[8,.31],[8,.55],[10,.40],[10,.62]]){
    for(const side of [-1,1])for(let r=0;r<2;r++){
      const [x,z,yaw]=along(i,u+.04*r,side*(55+25*r));
      array(x,z,yaw+.29,r);
    }
  }
  for(const [i,u,side,sz] of [[5,.18,109,1.30],[6,.49,-126,1.11],[8,.43,-143,1.27]]){
    const [x,z,yaw]=along(i,u,side);docking(x,z,yaw+.22,sz);
  }

  // Excavation cranes remain far outside the flight corridor. Their silhouette
  // repeats just enough to telegraph the trench as a working industrial site.
  for(const [u,side] of [[.23,-1],[.37,1],[.54,-1],[.66,1],[.83,-1]]){
    const [x,z,yaw]=along(4,u,side*143), y=surfaceAt(x,z);
    slab(x,y+2,z,30,4.2,30,metal,yaw);
    const at=(x0,y0,z0)=>local(x,y,z,yaw,x0,y0,z0);
    const c=0xcca274;
    for(const d of [-1,1]){
      beam(at(d*7,3,-5),at(d*3.4,41,-5),.76,c);
      beam(at(d*7,3,4),at(d*3.4,41,4),.76,c);
      for(let i=0;i<4;i++){
        const frac=i/4, w=7-frac*3.6, y0=3+frac*38;
        beam(at(d*w,y0,-5),at(-d*(w-.9),y0+9.5,-5),.39,pale);
        beam(at(d*w,y0,4),at(-d*(w-.9),y0+9.5,4),.39,pale);
      }
      beam(at(d*1.95,46,-8),at(d*1.95,48,46),.74,gold);
      beam(at(d*1.95,51,-8),at(d*1.95,48,46),.55,gold);
      for(let j=0;j<6;j++){
        const z0=-8+j*9;
        beam(at(d*1.95,50.5-j*.41,z0),at(d*1.95,46.1+j*.30,z0+8),.33,c);
      }
    }
    slab(...at(0,43.5,0),12.8,7.4,12.3,pale,yaw);
    lightAt(...at(0,44.9,6.25),6.8,1.6,.22,ice,yaw);
    slab(...at(0,45.3,37),5.1,3.3,3.7,hull,yaw);
    beam(at(-1.1,44,37),at(-1.1,29,37),.19,metal);
    beam(at(1.1,44,37),at(1.1,29,37),.19,metal);
    slab(...at(0,27.8,37),7.7,3.0,5.5,0x98765d,yaw);
    lightAt(...at(0,52.8,-2),3.6,1.2,3.3,gold,yaw);
    for(let j=0;j<5;j++){
      const [cx,cz]=rz(x,z,yaw,side*(19+j*6),-8+j*4);
      slab(cx,surfaceAt(cx,cz)+2.5,cz,5.5,5.3,8.8,j%2?hull:0x9d735f,yaw);
    }
  }
  // Vehicle-sized boulder clusters on the skyline-side of the road only.
  let seed=0x1225531;
  const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<136;i++){
    const sec=i%12, u=rng(), xoff=(rng()<.5?-1:1)*(78+rng()*278);
    const [x,z]=along(sec,u,xoff);
    const nearTrack=core.nodes.some((o,j)=>j%3===0&&Math.hypot(o.p.x-x,o.p.z-z)<43);
    if(nearTrack)continue;
    const r=2.6+rng()*11.8,y=surfaceAt(x,z);
    stock('rock',x,y+r*.23,z,r,r*(.52+rng()*.38),r*.83,i%3?0x646c80:0x7d7e88,0,rng()*TAU,rng()*.3);
  }
  const root=new T.Group();root.name='Orbital habitat and mining installations';
  const solid=new T.MeshLambertMaterial({vertexColors:true});
  const glow=new T.MeshBasicMaterial({vertexColors:true,toneMapped:false,fog:true});
  for(const [key,list] of records){
    const g=mergeGeometries(list);list.forEach(v=>v.dispose());if(!g)continue;
    g.computeBoundingSphere();const prop=new T.Mesh(g,key[0]==='e'?glow:solid);prop.name=key;root.add(prop);
  }
  Object.values(unit).forEach(g=>g.dispose());
  return root;
}

export function buildTrackArt(core){
  const group=new T.Group();
  group.name='Selene Station lunar atmosphere and scenery';
  group.add(celestial(),regolith(),installation(core));
  return group;
}
