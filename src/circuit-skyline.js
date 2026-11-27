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
    name:'The Greenbelt', zenith:0x418ebd, high:0x80b9d2, horizon:0xd7ecdd, floor:0xbcd7cc,
    cloud:0xfff5e4, cloudBase:0x9cb5be, sunlight:0xffeed2, sun:[-.49,.52,-.7],
    cover:.51, puff:.91, glow:.40, radius:.008, fold:1.82,
    strata:[
      [1475,1760,.179,0x2e543d,0x83ad63,0xb9c977,0xb1cdba,.16],
      [2020,2440,.168,0x426e67,0x8caf93,0xb0c09b,0xbad3c7,.32],
      [2870,3400,.171,0x647d82,0xaac3b2,0xb5cdb6,0xc4ddce,.50],
    ],
  },
  track02: {
    name:'The Icewall', zenith:0x738ba9, high:0xa9bbcd, horizon:0xe2edf4, floor:0xbec9d9,
    cloud:0xf0f5fa, cloudBase:0x95a7bd, sunlight:0xe3efff, sun:[.42,.67,-.62],
    cover:.39, puff:.78, glow:.095, radius:0, fold:1.04,
    strata:[
      [1730,2040,.248,0x35495f,0x6d95b7,0xebf6ff,0xb9d0e0,.14],
      [2260,2650,.269,0x54779e,0x99b9ce,0xe7f1f8,0xc6d8e7,.26],
      [3000,3470,.258,0x8198ac,0xbeccd8,0xe1edf3,0xd5e3ed,.50],
    ],
  },
  track03: {
    name:'The Granite Ramparts', zenith:0x588fbb, high:0xaabacb, horizon:0xffdbb5, floor:0xd0b9a8,
    cloud:0xffecd3, cloudBase:0xafa2af, sunlight:0xffcf7f, sun:[-.31,.255,-.913],
    cover:.53, puff:.83, glow:.63, radius:.012, fold:.91,
    strata:[
      [1570,1970,.329,0x4a5361,0xa58673,0xf0bf8d,0xcab2a2,.10],
      [2190,2690,.329,0x615971,0xb38c7c,0xedc39f,0xd4beba,.22],
      [2920,3550,.328,0x7a758f,0xb3a5b5,0xe7cbc3,0xe0cbd0,.35],
    ],
  },
};

const color = value => new THREE.Color(value);
const direction = t => new THREE.Vector3(...t.sun).normalize();
function skyDome(t) {
  const geometry = new THREE.SphereGeometry(1,40,24);
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
        if(y>-.043){
          vec2 p=d.xz/(.22+max(0.,y));
          vec2 warp=vec2(n2(p*1.31+4.3),n2(p*1.49+12.1))-.5;
          vec2 coord=p*vec2(2.27,3.02)+warp*.93;
          float mist=smoke(coord+12.71);
          vec2 cloudSun=normalize(sunRay.xz)*.25;
          float sh=smoke(coord+12.71+cloudSun);
          float cirrus=smoke(d.xz/(.35+max(0.,y))*vec2(4.68,1.54)+vec2(12.13,21.1));
          float horizonBand=smoothstep(-.043,.13,y);
          float upper=smoothstep(.46,.69,cirrus)*horizonBand;
          float uplight=pow(sun,12.);
          sky=mix(sky,mix(cloud,high,.30),upper*.29);
          float mass=smoothstep(cloudDensity-.023,cloudDensity+.147,mist);
          float inward=smoothstep(-.11,.113,mist-sh);
          float brightness=clamp(.18+inward*.64+smoothstep(cloudDensity,.82,mist)*.33+uplight*.08,0.,1.);
          vec3 vapor=mix(cloudBase,cloud,brightness);
          float fringe=max(0.,mass-smoothstep(cloudDensity+.018,cloudDensity+.23,mist));
          vapor=mix(vapor,sunlight,sunlightAmount*uplight*(.16+.38*fringe));
          sky=mix(sky,vapor,cloudAmount*horizonBand*mass);
          float scatter=pow(sun,122.)*sunlightAmount*.10;
          sky=mix(sky,sunlight,scatter*(1.-mass*.54));
          if(sunRadius>0.){
            float disk=smoothstep(cos(sunRadius*1.125),cos(sunRadius*.93),sun);
            sky=mix(sky,mix(sunlight,vec3(1.0),.76),disk*(1.-.72*mass));
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
  const offset=.017*wave(a,19,p)+.009*wave(a,61,p*.6);
  const crest=Math.abs(wave(a+offset,21,p*.7))*.089+wave(a+offset,39,p*1.94)*.034+wave(a,67,p*1.21)*.017;
  const chips=(wave(a+offset,93,p*.78)*.53+wave(a,127,p*.96)*.29+wave(a,171,p*1.4)*.18)
    *(index===0?.009:.023)*(layer===2?.50:1);
  return clamp(h+bands+crest*(index===0?.46:1)+chips,.10,1.42);
}

function ridgeMesh(t,index) {
  // 384 shared azimuth columns maintain jagged silhouettes without multiplying
  // vertex bandwidth for each adjacent face. Rows are denser at the crest.
  const count=384, rises=[0,.05,.11,.18,.25,.32,.39,.46,.53,.60,.67,.73,.79,.845,.89,.925,.953,.978,1,1.055,1.125,1.215];
  const rows=rises.length;
  const positions=new Float32Array(count*rows*t.strata.length*3);
  const shading=new Float32Array(positions.length), facets=new Float32Array(positions.length);
  const indices=new Uint16Array(count*(rows-1)*t.strata.length*6);
  const sun=direction(t);
  // The sun vector is also used in the sky; an elevated bounce term leaves
  // shadowed slopes readable and does not flatten the warm/cool contrast.
  const axis=new THREE.Vector3(sun.x,.49,sun.z).normalize();
  const n=new THREE.Vector3(), aV=new THREE.Vector3(), bV=new THREE.Vector3();
  const outColor=new THREE.Color(), faceLight=new THREE.Color(), edgeColor=new THREE.Color();
  let idx=0, base=0;

  for(let layer=t.strata.length-1;layer>=0;layer--){
    const [near,rim,scale,dark,lit,cap,haze,veil]=t.strata[layer];
    const low=color(dark), bright=color(lit), summit=color(cap), air=color(haze);
    const grid=[];
    for(let j=0;j<rows;j++){
      const u=rises[j];
      for(let i=0;i<count;i++){
        const q=i*TAU/count, detail=index===0?.52:1;
        const jitter=.004*wave(q,31,layer+u)+.005*wave(q,14,u*4.7+index);
        const angle=q+jitter*Math.sin(Math.PI*u);
        const r=mix(near,rim,Math.min(u,1))+(u>1?(u-1)*1350:0)
          + wave(q,4,layer+.2)*86 + wave(q,9,layer+index)*54 + wave(q,23,u*.8+layer)*30;
        const bent=angle+.043*wave(q,2,u*2.2)*Math.sin(Math.PI*u);
        const cr=ridgeHeight(bent,index,layer,t);
        const t0=u<=1 ? Math.pow(Math.sin(u*Math.PI*.5),index===0?1.44:1.1)
          : 1-(u-1)*(index===0?2.7:3.9);
        // Nested drainage lines split from broader winding, quieter shoulders.
        const gully=wave(q+.012*wave(q,13,u*5.7),36,layer+u*6.2);
        const flutes=wave(q+.009*wave(q,24,u*4.3),52,layer+u*3.2);
        const breakup=detail*(.046*gully+.024*flutes+.014*wave(q,79,layer+u*3.8)
          +.009*wave(q,137,layer+u*7.1))*(.56+.44*Math.sin(Math.PI*Math.min(u,1)));
        const crest=u<1?.009*wave(q,27,(u+.38)*20+layer)*Math.sin(Math.PI*u):0;
        const h=-42+(cr*t0+(breakup+crest)*Math.min(1,u*4))*rim*scale;
        grid.push([Math.cos(angle)*r,h,Math.sin(angle)*r,cr,gully,flutes,q]);
      }
    }
    for(let j=0;j<rows;j++)for(let i=0;i<count;i++){
      const at=j*count+i,k=(i+1)%count,p=(i+count-1)%count;
      const [x,y,z,cr,gully,flutes,q]=grid[at], u=rises[j];
      const l=grid[j*count+p], r=grid[j*count+k];
      const lo=grid[Math.max(0,j-1)*count+i], hi=grid[Math.min(rows-1,j+1)*count+i];
      aV.set(r[0]-l[0],r[1]-l[1],r[2]-l[2]);
      bV.set(hi[0]-lo[0],hi[1]-lo[1],hi[2]-lo[2]);
      n.crossVectors(aV,bV).normalize();
      if(n.y<0)n.negate();
      const face=clamp(.48+n.dot(axis)*.74,0,1);
      const wall=1-n.y, height=y/(rim*scale);
      const shadePocket=.5+.5*wave(q,19+layer,3.2+u*3.1);
      const cloudShadow=.5+.5*wave(q,9,u*4.1+layer*5.3)*wave(q,14,3.3-layer*.82);
      if(index===0){
        const meadow=smooth(.06,.71,u)+.24*wave(q,15,layer+u*4)+.11*flutes;
        outColor.copy(low).lerp(bright,clamp(face*.69+meadow*.25+.07*gully-.09*cloudShadow,.035,.97));
        const heath=smooth(.32,.69,height)*.29 + smooth(.30,.74,wall)*.11;
        outColor.lerp(summit,heath);
      }else if(index===1){
        const snowLine=.285+wall*.18+gully*.092+flutes*.062+.089*wave(q,17,layer+u*3.7);
        const exposed=wall*smooth(.30,.94,Math.sin(q*47.0+wave(q,16,u*4.1)+u*5.2));
        const blanket=smooth(snowLine-.08,snowLine+.141,height)*(1-.47*exposed);
        faceLight.copy(bright).lerp(summit,.45+face*.52);
        outColor.copy(low).lerp(bright,.16+face*.55-.08*shadePocket)
          .lerp(faceLight,blanket*(.88+.12*face));
      }else{
        const ledges=wave(q,38+layer*5,u*12.7)+.48*wave(q,65,u*21.4);
        faceLight.copy(low).lerp(bright,clamp(.05+face*.91+ledges*.039-.12*shadePocket,.025,.98));
        edgeColor.copy(bright).lerp(summit,.29+face*.68);
        const sheer=smooth(.20,.88,wall)*.15;
        outColor.copy(faceLight).lerp(edgeColor,smooth(.18,.87,height)*(.25+face*.53)+sheer*.30);
      }
      // Fade low foothills into valleys, keeping sky contrast on the ridges.
      const baseMist=(1-smooth(.025,.55,u))*(index===2?.73:.59);
      const ravine=smooth(.20,.85,-gully)*(.065+.035*wall)*(1-smooth(.38,.81,height));
      outColor.lerp(air,clamp(veil+baseMist+ravine+(cr<.35?.037:0),0,.97));

      const off=(base+at)*3;
      positions[off]=x;positions[off+1]=y;positions[off+2]=z;
      shading[off]=outColor.r;shading[off+1]=outColor.g;shading[off+2]=outColor.b;
      facets[off]=height; facets[off+1]=wall; facets[off+2]=layer;
      if(j<rows-1){
        const a=base+at,b=base+j*count+k,c=b+count,d=a+count;
        if((i+j)%2){indices[idx++]=a;indices[idx++]=b;indices[idx++]=d;
          indices[idx++]=b;indices[idx++]=c;indices[idx++]=d;}
        else {indices[idx++]=a;indices[idx++]=b;indices[idx++]=c;
          indices[idx++]=a;indices[idx++]=c;indices[idx++]=d;}
      }
    }
    base+=count*rows;
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geometry.setAttribute('paint',new THREE.BufferAttribute(shading,3));
  geometry.setAttribute('facet',new THREE.BufferAttribute(facets,3));
  geometry.setIndex(new THREE.BufferAttribute(indices,1));
  geometry.computeBoundingSphere();
  const material=new THREE.ShaderMaterial({
    side:THREE.DoubleSide,fog:false,toneMapped:false,
    uniforms:{biome:{value:index}},
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
      uniform float biome;
      float hash(vec2 p){
        vec3 a=fract(vec3(p.xyx)*.1031);
        a+=dot(a,a.yzx+33.33);
        return fract((a.x+a.y)*a.z);
      }
      float grain(vec2 p){
        vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),
          mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
      }
      void main(){
        vec2 p=vec2(rock.x*.721+rock.z*.69,rock.y*.96+rock.z*.13);
        float relief=grain(p*.040)-.5;
        float stone=grain(p*.094 + 14.9)-.5;
        float bedding=sin(rock.y*.128+rock.z*.017+relief*1.76);
        // Suppress unresolved detail instead of letting granite stripes shimmer
        // on fast chase-camera motion or at reduced resolution.
        float detailAA=1.-smoothstep(.84,1.9,length(fwidth(p))*.095);
        float bedAA=1.-smoothstep(.76,2.35,fwidth(rock.y*.128+rock.z*.017));
        float haze=1.-detail.z*.27;
        float slope=detail.y;
        vec3 tinted;
        if(biome<.5){
          float texture=relief*.20+stone*.18*detailAA;
          tinted=pigment*(1.+texture*haze*mix(.84,1.02,slope));
        }else if(biome<1.5){
          float iceGrain=(relief*.24+stone*.16*detailAA+bedding*.024*bedAA*slope);
          tinted=pigment*(1.+iceGrain*haze);
          tinted+=vec3(-.013,.003,.022)*haze*max(0.,relief)*slope;
        }else{
          float layers=bedding*.071*bedAA*(.07+slope*.72)+relief*.23+stone*.16*detailAA;
          tinted=pigment*(1.+layers*haze);
          float mineral=clamp(relief+.14,0.,.45)*haze*(.24+slope*.76);
          tinted=mix(tinted,tinted*vec3(1.11,1.025,.90),mineral);
        }
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
