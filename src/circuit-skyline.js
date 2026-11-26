import * as THREE from 'three';

// Only the distant world. Mountain geometry is stationary, while the gradient
// sky follows camera translation (never heading); no terrain collision.
export const CIRCUIT_ATMOSPHERE = Object.freeze({
  track01: Object.freeze({ background: 0xb9d7d7, fog: 0xb9d4ca, density: .00080 }),
  track02: Object.freeze({ background: 0xaebed3, fog: 0xb8cbdc, density: .00093 }),
  track03: Object.freeze({ background: 0xe5c1a8, fog: 0xd1beac, density: .00072 }),
});

const themes = {
  track01: {
    name:'The Greenbelt', zenith:0x6faed0, high:0x99c7d7, horizon:0xd9ebdc, floor:0xbcd7cc,
    cloud:0xf7edde, cloudBase:0xaac5c3, sunlight:0xffeed2, sun:[-.49,.52,-.7],
    cover:.51, puff:.91, glow:.40, radius:.009, fold:1.82,
    strata:[
      [1475,1760,.168,0x405e46,0x91b078,0xb6c88b,0xb1cdba,.18],
      [2020,2440,.162,0x5b7d73,0x95b8a2,0xaebc99,0xbad3c7,.35],
      [2870,3400,.167,0x71928c,0xaac3b2,0xb5cdb6,0xc4ddce,.54],
    ],
  },
  track02: {
    name:'The Icewall', zenith:0x8b9fbc, high:0xb0becf, horizon:0xe0e8ee, floor:0xbec9d9,
    cloud:0xe5edf6, cloudBase:0x9eadc7, sunlight:0xe3efff, sun:[.42,.67,-.62],
    cover:.39, puff:.78, glow:.095, radius:0, fold:1.04,
    strata:[
      [1730,2040,.245,0x435d79,0x87a3b7,0xddebf4,0xb9d0e0,.16],
      [2260,2650,.267,0x607f9d,0xabc1d1,0xe3eff8,0xc6d8e7,.27],
      [3000,3470,.258,0x8198ac,0xbeccd8,0xe1edf3,0xd5e3ed,.50],
    ],
  },
  track03: {
    name:'The Granite Ramparts', zenith:0x73a1c6, high:0xc2cad6, horizon:0xffdfbd, floor:0xd0b9a8,
    cloud:0xffead0, cloudBase:0xc9b3b4, sunlight:0xffcf7f, sun:[-.31,.255,-.913],
    cover:.53, puff:.83, glow:.63, radius:.014, fold:.91,
    strata:[
      [1570,1970,.323,0x4d535e,0x9e897e,0xebbf94,0xcbb3a4,.11],
      [2190,2690,.327,0x716d7f,0xb99989,0xe6c4a6,0xd4beba,.27],
      [2920,3550,.328,0x868396,0xb9aeb4,0xe7cbc3,0xe0cbd0,.42],
    ],
  },
};

const color = value => new THREE.Color(value);
const direction = t => new THREE.Vector3(...t.sun).normalize();
function skyDome(t) {
  const geometry = new THREE.SphereGeometry(1,32,20);
  const material = new THREE.ShaderMaterial({
    fog:false, side:THREE.BackSide, depthTest:true, depthWrite:false, toneMapped:false,
    uniforms:{
      zenith:{value:color(t.zenith)}, high:{value:color(t.high)}, horizon:{value:color(t.horizon)},
      below:{value:color(t.floor)}, cloud:{value:color(t.cloud)}, cloudBase:{value:color(t.cloudBase)},
      sunlight:{value:color(t.sunlight)}, sunRay:{value:direction(t)}, sunRadius:{value:t.radius},
      sunlightAmount:{value:t.glow}, cloudDensity:{value:t.cover}, cloudAmount:{value:t.puff},
    },
    vertexShader:`
      varying vec3 ray;
      void main(){
        ray=position;
        vec4 p=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);
        gl_Position=p.xyww;
      }
    `,
    fragmentShader:`
      varying vec3 ray;
      uniform vec3 zenith, high, horizon, below, cloud, cloudBase, sunlight, sunRay;
      uniform float sunRadius,sunlightAmount,cloudDensity,cloudAmount;
      float hash(vec2 p){
        vec3 a=fract(vec3(p.xyx)*.1031);
        a+=dot(a,a.yzx+33.33);
        return fract((a.x+a.y)*a.z);
      }
      float n2(vec2 p){
        vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),
                   mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
      }
      float smoke(vec2 p){
        const mat2 K=mat2(.83,.55,-.55,.83);
        float v=.58*n2(p);
        p=K*p*2.03+12.3; v+=.27*n2(p);
        p=K*p*2.06+5.1; v+=.11*n2(p);
        p=K*p*2.13; v+=.04*n2(p);
        return v;
      }
      void main(){
        vec3 d=normalize(ray);
        float y=d.y;
        vec3 sky=mix(horizon,high,smoothstep(-.005,.47,y));
        sky=mix(sky,zenith,smoothstep(.14,.92,y));
        sky=mix(sky,below,smoothstep(0.,.20,-y));
        float sun=max(0.,dot(d,sunRay));
        sky=mix(sky,sunlight,sunlightAmount*(pow(sun,8.)*.25+pow(sun,38.)*.34+pow(sun,240.)*.23));
        if(y>-.018){
          vec2 p=d.xz/(.205+max(0.,y));
          vec2 warp=vec2(n2(p*1.24+4.3),n2(p*1.49+12.1))-.5;
          vec2 coord=p*vec2(2.52,3.34)+warp*.72;
          float mist=smoke(coord+12.71);
          float edge=smoke(coord+vec2(.11,-.17));
          float upper=smoke(p*vec2(3.92,1.76)-12.34);
          float fade=smoothstep(-.018,.14,y);
          float wisps=smoothstep(.47,.69,upper)*fade*.20;
          vec3 vapor=mix(cloudBase,cloud,smoothstep(-.042,.048,mist-edge)*.37+smoothstep(cloudDensity,.81,mist)*.63);
          vapor=mix(vapor,sunlight,sunlightAmount*pow(sun,9.)*.24);
          sky=mix(sky,cloud,wisps);
          sky=mix(sky,vapor,cloudAmount*fade*smoothstep(cloudDensity-.025,cloudDensity+.19,mist));
          if(sunRadius>0.){
            float disk=smoothstep(cos(sunRadius*1.11),cos(sunRadius*.93),sun);
            sky=mix(sky,mix(sunlight,vec3(1.0),.75),disk*(1.-.50*smoothstep(cloudDensity+.01,.76,mist)));
          }
        }
        // Tiny stochastic dither keeps the broad gradients from banding.
        sky+=((hash(gl_FragCoord.xy)-.5)*.003);
        gl_FragColor=vec4(sky,1.);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry,material);
  mesh.frustumCulled=false;
  // Opaque world renders first; far depth rejects hidden sky pixels.
  mesh.renderOrder=1000;
  mesh.name='Camera-centered painted sky';
  return mesh;
}

const TAU=Math.PI*2;
const clamp=THREE.MathUtils.clamp;
const mix=THREE.MathUtils.lerp;
const smooth=(a,b,t)=>THREE.MathUtils.smoothstep(t,a,b);
const arc=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const wave=(a,f,p)=>Math.sin(a*f+p);

// Long shoulders give the rock distinct broad formations; angular scree and
// ridges layer on top instead of placing repeated cone boulders along the rim.
const massifs=[
  [[.32,.42,.51],[1.29,.31,.65],[2.49,.37,.61],[3.64,.40,.46],[4.60,.43,.39],[5.43,.31,.56]],
  [[.05,.32,.73],[.92,.24,.72],[1.94,.35,.55],[2.67,.24,.80],[3.80,.32,.61],[4.61,.45,.79],[5.53,.38,.66]],
  [[.52,.29,.89],[1.29,.24,.78],[2.54,.35,.76],[3.47,.25,.80],[4.26,.21,.88],[4.74,.31,1.04],[5.83,.38,.76]],
];

function ridgeHeight(a, index, layer, t){
  const drift=layer*.41, p=1.9+layer*1.41+index*.87;
  let h=.11;
  for(const [center,w,amp] of massifs[index]){
    const dx=arc(a,center+drift);
    const slope=1.79+.28*Math.sin(center*3.6)*(dx<0?-1:1);
    const shoulder=Math.pow(Math.max(0,1-Math.abs(dx)/(w*slope)),t.fold);
    h+=shoulder*amp;
  }
  const bands=wave(a,7,p)*.071+wave(a,13,p*.8)*.079;
  const serration=Math.abs(wave(a,21,p*.7))*.10+wave(a,39,p*1.94)*.032+wave(a,67,p*1.21)*.016;
  return clamp(h+bands+serration*(index===0?.46:1),.10,1.42);
}

function ridgeMesh(t,index) {
  const count=256, rise=[0,.11,.23,.36,.50,.65,.78,.90,1,1.10,1.22], rows=rise.length;
  const positions=[], shading=[], facets=[];
  const sun=direction(t);
  const axis=new THREE.Vector3(sun.x,.95,sun.z).normalize();
  const n=new THREE.Vector3(), aV=new THREE.Vector3(), bV=new THREE.Vector3(), cV=new THREE.Vector3();
  const outColor=new THREE.Color(), shadow=new THREE.Color(), faceLight=new THREE.Color();
  const edgeColor=new THREE.Color();

  for(let layer=t.strata.length-1;layer>=0;layer--){
    const [near,rim,scale,dark,lit,cap,haze,veil]=t.strata[layer];
    const low=color(dark), bright=color(lit), summit=color(cap), air=color(haze);
    const grid=[];
    for(let j=0;j<rows;j++){
      const u=rise[j];
      for(let i=0;i<count;i++){
        const q=i*TAU/count;
        const jitter=.005*wave(q,27,layer+u)+.006*wave(q,9,u*3.7+index);
        const angle=q+jitter*Math.sin(Math.PI*u);
        const r=mix(near,rim,Math.min(u,1))+(u>1?(u-1)*1350:0)
          + wave(q,4,layer+.2)*86 + wave(q,9,layer+index)*54
          + wave(q,23,u*.8+layer)*30;
        const cr=ridgeHeight(angle+.045*Math.sin(u*2.2+q*2)*Math.sin(Math.PI*u),index,layer,t);
        const t0=u<=1 ? Math.pow(Math.sin(u*Math.PI*.5),index===0?1.44:1.10)
          : 1-(u-1)*(index===0?2.70:3.91);
        const grooves=.065*wave(q,36,.3+j*.67+layer)+.038*wave(q,64,1+j*.20)
          +.020*wave(q,101,1+j*.58);
        const breakup=grooves*(Math.sin(Math.PI*Math.min(1,u))*.62+.38);
        const h= -42 + (cr*t0+breakup*Math.min(1,u*4))*rim*scale;
        grid.push([Math.cos(angle)*r,h,Math.sin(angle)*r,u,cr,grooves,q]);
      }
    }

    function tri(a,b,c){
      aV.set(a[0],a[1],a[2]); bV.set(b[0],b[1],b[2]).sub(aV); cV.set(c[0],c[1],c[2]).sub(aV);
      n.crossVectors(bV,cV).normalize();
      if(n.y<0)n.negate();
      const face=clamp(.41+n.dot(axis)*.69,0,1);
      const wall=1-Math.abs(n.y);
      const offset=.03*Math.sin((a[0]+b[0]+c[0])*.115+(a[2]+b[2]+c[2])*.090);
      for(const [x,y,z,u,cr,g,q] of [a,b,c]){
        if(index===0){
          const meadow=smooth(.05,.75,u)+.21*wave(q,17,layer+u*4);
          outColor.copy(low).lerp(bright,clamp(face*.69+meadow*.23+g*.41+offset,.04,.94));
          outColor.lerp(summit,smooth(.34,.75,y/(rim*scale))*.32+wall*.08);
        }else if(index===1){
          const snowLine=.255+wall*.15+g*.85+.071*wave(q,21,layer+u*6)+.064*wave(q,29,layer-u*5.7);
          const exposed=wall*smooth(.37,.87,Math.sin(q*33.0+wave(q,12.0,u*4.1)+u*3.2));
          const blanket=smooth(snowLine-.08,snowLine+.16,y/(rim*scale))*(1-.36*exposed);
          faceLight.copy(bright).lerp(summit,.48+face*.46);
          outColor.copy(low).lerp(bright,.16+face*.48+offset).lerp(faceLight,blanket*(.84+.16*face));
        }else{
          const striation=wave(q,38+layer*5,u*6.7)+.48*wave(q,65,u*12.4);
          faceLight.copy(low).lerp(bright,clamp(.07+face*.84+striation*.055+offset,.02,.94));
          edgeColor.copy(bright).lerp(summit,.37+face*.62);
          outColor.copy(faceLight).lerp(edgeColor,smooth(.22,.89,y/(rim*scale))*(.31+face*.52));
        }
        shadow.copy(air);
        // Low valley haze joins each range to the world fog/ground.
        const baseMist=(1-smooth(.02,.51,u))*(index===2?.73:.62);
        const litMist=clamp(veil+baseMist+(cr<.35?.05:0),0,.98);
        outColor.lerp(shadow,litMist);
        positions.push(x,y,z);shading.push(outColor.r,outColor.g,outColor.b);
        facets.push(y/(scale*rim),wall,layer);
      }
    }
    for(let j=0;j<rows-1;j++)for(let i=0;i<count;i++){
      const k=(i+1)%count;
      const a=grid[j*count+i],b=grid[j*count+k],c=grid[(j+1)*count+k],d=grid[(j+1)*count+i];
      if((i+j)%2){tri(a,b,d);tri(b,c,d);}
      else {tri(a,b,c);tri(a,c,d);}
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('paint',new THREE.Float32BufferAttribute(shading,3));
  geometry.setAttribute('facet',new THREE.Float32BufferAttribute(facets,3));
  geometry.computeBoundingSphere();
  const material=new THREE.ShaderMaterial({
    side:THREE.DoubleSide,fog:false,toneMapped:false,
    uniforms:{granite:{value:index===2?1:0}},
    vertexShader:`
      attribute vec3 paint,facet;
      varying vec3 pigment,rock,detail;
      void main(){
        pigment=paint; rock=position; detail=facet;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }
    `,
    fragmentShader:`
      varying vec3 pigment,rock,detail;
      uniform float granite;
      void main(){
        // Low-amplitude brush-like slate layers; loss of detail with distance
        // is built into the paint rather than theater-flat view-space fog.
        float g=sin(rock.y*.115 + sin(rock.x*.023+rock.z*.018)*.65);
        float n=sin(rock.x*.067+rock.z*.078)*sin(rock.y*.048+rock.z*.038);
        float a=(.024+.019*granite)*(1.-detail.z*.23);
        vec3 tinted=pigment*(1.+a*(g*(.22+granite*.56)+n*.44)*(.40+detail.y*.60));
        gl_FragColor=vec4(tinted,1.);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='Atmospheric painted ranges';
  return mesh;
}

export function createCircuitSkyline(levelId) {
  const id=Object.hasOwn(themes,levelId)?levelId:'track01';
  const t=themes[id], index=Number(id.at(-1))-1;
  const root=new THREE.Group();
  root.name='Circuit Skyline / '+t.name;
  root.add(skyDome(t),ridgeMesh(t,index));
  return root;
}
