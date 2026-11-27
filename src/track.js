import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CIRCUITS } from './circuits.js';
import { createTrackCore, createTrackSample } from './sim/track-core.js';
import { createSkyVisuals } from './sky-visuals.js';
import { createCircuitSkyline } from './circuit-skyline.js';
import { buildCircuitBiome } from './circuit-biomes.js';
import { makeCircuitProp } from './circuit-props.js';
import { buildTestTrackLandmarks } from './test-track-landmarks.js';
import { buildMountainCabins, mountainCabinSites } from './mountain-cabins.js';
import { makePickupGeometry, applyPickupVertexShader } from './pickup-chest.js';

const TAU = Math.PI * 2;
const mix = THREE.MathUtils.lerp;
const defaultColors = {
  tarmac: 0x48535d, shoulder: 0x36434b, asphaltEdge: 0x273d45,
  milk: 0xf1f1da, orange: 0xff663e, lime: 0xddff53, dark: 0x24333c,
  steel: 0x7b9a96, foam: 0xd2e7db, mint: 0x84bdb0, ink: 0x263e44,
  floor: 0x8fb198, grass: 0xb3c9a5, super: 0x6cebdc,
};

const roadLooks = {
  track01: { floor: 0x8fb198, tarmac: 0x36424d, shoulder: 0x394d51, snow: 0x88aaa1, curb: 0xff6b43, rails: 0xa8cfc6, fascia: 0x244747 },
  track02: { floor: 0xaccee0, tarmac: 0x3f5568, shoulder: 0x607883, snow: 0xddecf5, curb: 0x287caa, rails: 0x8fbfda, fascia: 0x294459, orange: 0xf37b39, foam: 0xcde4ee, mint: 0x74b8ce, steel: 0x456278, milk: 0xeaf4f8 },
  track03: { floor: 0x87917b, tarmac: 0x414753, shoulder: 0x505d66, snow: 0xcbd6de, curb: 0xeeb540, rails: 0x91a5ac, fascia: 0x2a373f, orange: 0xf2a72b, steel: 0x526776, mint: 0x76aea8, milk: 0xf2eddb },
};

// Vertex coordinates identify painted road space independent of its world winding.
// Grain is derivative-filtered so early camera switch/long-distance views do not shimmer.
function styleRoad(material) {
  material.customProgramCacheKey = () => 'sproto-paved-ribbon-hd';
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'attribute vec3 aPavement; varying vec3 vPavement;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\n vPavement = aPavement;'
    );
    shader.fragmentShader = `
      varying vec3 vPavement;
      float roadHash(vec2 q) { vec3 v=fract(vec3(q.xyx)*.1031); v+=dot(v,v.yzx+33.33); return fract((v.x+v.y)*v.z); }
      float roadNoise(vec2 p) {
        vec2 i=floor(p), f=fract(p), w=f*f*(3.-2.*f);
        return mix(mix(roadHash(i),roadHash(i+vec2(1,0)),w.x),mix(roadHash(i+vec2(0,1)),roadHash(i+vec2(1)),w.x),w.y);
      }
    ` + shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      if(vPavement.z>=0.) {
        vec2 q=vPavement.xy;
        float lod=max(length(dFdx(q)),length(dFdy(q)));
        float detail=1.-smoothstep(.055,.30,lod);
        float aggregate=(roadNoise(q*13.)-.5)*detail;
        float macro=roadNoise(q*vec2(.31,.045));
        float weather=roadNoise(q*vec2(1.14,.17));
        float wander=sin(q.y*.043)*.88+sin(q.y*.015)*1.37;
        float tire=abs(abs(q.x-wander)-1.022);
        float strip=1.-smoothstep(.14,.52,tire);
        float shoulders=smoothstep(9.0,18.5,abs(q.x));
        float polishedRuts=strip*(.04+weather*.105)*(1.-shoulders);
        float seamX=abs(fract(q.x/6.35+.515+(weather-.5)*.026)-.5)*6.35;
        float seamY=abs(fract(q.y/22.6+.5+q.x*.002+macro*.009)-.5)*22.6;
        float groove=1.-smoothstep(.035,.089+lod*.14,min(seamX,seamY));
        float joints=groove*.068*(1.-smoothstep(.25,.88,lod));
        vec3 tar=diffuseColor.rgb*(.93+macro*.12+weather*.08+aggregate*.23-polishedRuts-joints);
        tar+=vec3(.010,.014,.014)*shoulders*weather;
        if(vPavement.z>.001) {
          vec2 lens=vec2(q.x*.95+q.y*.13,q.y*.19-q.x*.24);
          float sheet=roadNoise(lens*.37), ripple=roadNoise(lens*1.06);
          float fracture=1.-smoothstep(.013,.047+lod*.035,abs(ripple-.51));
          float snowFrost=smoothstep(.57,.80,sheet*.68+ripple*.32);
          float edge=vPavement.z*(.87+weather*.13);
          vec3 ice=mix(vec3(.048,.148,.224),vec3(.153,.31,.41),sheet*.82+ripple*.18);
          ice+=vec3(.11,.17,.20)*fracture*.24*(1.-smoothstep(.25,.79,lod));
          ice=mix(ice,vec3(.20,.37,.48),snowFrost*.30);
          diffuseColor.rgb=mix(tar,ice,clamp(edge,0.,1.));
        } else diffuseColor.rgb=tar;
      }
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>', `
      if(vPavement.z>.001) {
        float glancing=1.-abs(dot(normalize(vViewPosition),normal));
        float contrast=abs(sin(vPavement.y*.080 + vPavement.x*.11+roadNoise(vPavement.xy*.061)*2.6));
        outgoingLight+=vec3(.022,.047,.068)*pow(glancing,2.7)*contrast*vPavement.z;
      }
      #include <opaque_fragment>
    `);

  };
}

function styleGround(material) {
  material.customProgramCacheKey=()=> 'ground-paint-hd';
  material.onBeforeCompile=(shader)=>{
    shader.vertexShader='varying vec2 vGround;\n'+shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vGround=position.xy;');
    shader.fragmentShader='varying vec2 vGround;\n'+shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec2 q=vGround;
      float b=sin(q.x*.014 + sin(q.y*.016))*.50+sin((q.x+q.y)*.031)*.28;
      float g=sin(q.x*.142+q.y*.19)*sin(q.y*.116-q.x*.217);
      float closeDetail=1.-smoothstep(.15,1.55,max(length(dFdx(q)),length(dFdy(q))));
      diffuseColor.rgb*=1.+b*.14+g*.052*closeDetail;
    `);
  };
}
function styleRunoff(material) {
  material.customProgramCacheKey=()=> 'runoff-hd';
  material.onBeforeCompile=(shader)=>{
    shader.vertexShader='attribute vec2 aRunoff; varying vec2 vRunoff;\n'+shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vRunoff=aRunoff;');
    shader.fragmentShader='varying vec2 vRunoff;\n'+shader.fragmentShader.replace('#include <opaque_fragment>', `
      vec2 q=vRunoff;
      float glancing=1.-abs(dot(normalize(vViewPosition),normal));
      float ripples=.53+.16*sin(q.x*30.+sin(q.y*17.)*.45)+.17*sin(q.y*55.+q.x*8.);
      float edge=smoothstep(.66,1.,max(abs(q.x),abs(q.y)));
      outgoingLight*=1.+ripples*.11-edge*.18;
      outgoingLight+=vec3(.027,.052,.068)*glancing*glancing*ripples*(1.-edge*.38);
      #include <opaque_fragment>
    `);
  };
}

// The case has six planes, 12 edge facets and eight trimmed corners: 44
// triangles instead of a subdivided box. All pickups share one instanced draw.
function chamferCase(w, h, d, bevel) {
  const half = [w * .5, h * .5, d * .5], inner = half.map(x => x - bevel);
  const positions = [], normals = [];
  const cross = new THREE.Vector3(), first = new THREE.Vector3(), second = new THREE.Vector3();
  function polygon(verts) {
    first.fromArray(verts[1]).sub(new THREE.Vector3(...verts[0]));
    second.fromArray(verts[2]).sub(new THREE.Vector3(...verts[0]));
    cross.crossVectors(first, second).normalize();
    if (cross.dot(new THREE.Vector3(...verts[0])) < 0) {
      verts.reverse(); cross.negate();
    }
    for (let n = 1; n < verts.length - 1; n++) for (const p of [verts[0], verts[n], verts[n + 1]]) {
      positions.push(...p); normals.push(...cross);
    }
  }
  const signs = [-1, 1];
  for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3, c = (a + 2) % 3;
    for (const s of signs) polygon([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
      const p = []; p[a] = s * half[a]; p[b] = u * inner[b]; p[c] = v * inner[c]; return p;
    }));
  }
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
    const c = 3 - a - b;
    for (const sa of signs) for (const sb of signs) polygon([[0, -1], [1, -1], [1, 1], [0, 1]].map(([along, sc]) => {
      const p = []; p[a] = sa * (along ? inner[a] : half[a]); p[b] = sb * (along ? half[b] : inner[b]);
      p[c] = sc * inner[c]; return p;
    }));
  }
  for (const x of signs) for (const y of signs) for (const z of signs) {
    const sign = [x, y, z];
    polygon([0, 1, 2].map(a => sign.map((s, i) => s * (a === i ? half[i] : inner[i]))));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return g;
}

export function createTrack(scene, course = CIRCUITS[0], options = {}) {
  const { deferVisuals = false, externalSkyline = false } = options;
  const core = createTrackCore(course);
  const {
    nodes, sections, length, segments, segmentLength, drops,
    pads, pickups, ramps, hazards, drum, bridge, door, switchTrigger,
    grid, mapPoints,
  } = core;

  const original = course.id === 'track01';
  const look = roadLooks[course.id] ?? roadLooks.track01;
  const C = { ...defaultColors, ...course.colors, ...look };
  const icePatches = core.icePatches ?? [];
  const sampleScratch = createTrackSample();

  function sample(s, x = 0) {
    core.sampleInto(s, x, sampleScratch, true);
    return {
      position: new THREE.Vector3(sampleScratch.position.x, sampleScratch.position.y, sampleScratch.position.z),
      forward: new THREE.Vector3(sampleScratch.forward.x, sampleScratch.forward.y, sampleScratch.forward.z),
      right: new THREE.Vector3(sampleScratch.right.x, 0, sampleScratch.right.z),
      curvature: sampleScratch.curvature,
      deckY: sampleScratch.deckY,
      grade: sampleScratch.grade,
      bank: sampleScratch.bank,
      width: sampleScratch.width,
      section: sampleScratch.section,
    };
  }

  const trackGroup = new THREE.Group();
  trackGroup.name = course.name;
  scene.add(trackGroup);

  let visualsMounted = false;
  let lastTime = 0;
  let extraDisposables = [];
  let skyVisuals = null;
  let lastLap = 1;
  let viewLap = null;
  let visualsPerFrame = false;
  let visualsStale = false;
  // Road, paint and roadside props stop where a main Sky Lane replaces the road.
  const roadGone = (s) => core.sky.inMainLane(s);
  let syncFixtureVisuals = () => {};
  let pickupMesh = null;
  let pickupPositions = null;
  let lastHidden = null;
  let pickupStates = null;
  const pickupUniforms = { uTime: { value: 0 } };
  const pickupTransform = new THREE.Object3D();

  function writePickupMatrix(index, hiddenFlag, partial) {
    const pos = pickupPositions[index];
    pickupTransform.position.set(pos.x, pos.y + 2, pos.z);
    pickupTransform.rotation.set(0,pos.yaw,0);
    pickupTransform.scale.setScalar(hiddenFlag ? .98 : 1.16);
    pickupTransform.updateMatrix();
    pickupMesh.setMatrixAt(index, pickupTransform.matrix);
    if (partial) pickupMesh.instanceMatrix.addUpdateRange(index * 16, 16);
  }

  function syncPickups(force = false, animate = true) {
    if (!pickupMesh) return;
    let dirty = false;
    for (let i = 0; i < pickups.length; i++) {
      const h = !pickups[i].hidden ? 0 : Number.isFinite(pickups[i].readyAt) ? 1 : 2;
      if (force || h !== lastHidden[i]) {
        const initialized = lastHidden[i] !== 255;
        lastHidden[i] = h;
        // Trial mode disables crates with readyAt=Infinity; only collected crates burst.
        const playChange = initialized && animate && h !== 2;
        pickupStates.setXY(i, playChange ? lastTime : lastTime - 1.0, h);
        if (!force) pickupStates.addUpdateRange(i * 2, 2);
        writePickupMatrix(i, h, !force);
        dirty = true;
      }
    }
    if (dirty) {
      if (force) {
        pickupMesh.instanceMatrix.clearUpdateRanges();
        pickupStates.clearUpdateRanges();
      }
      pickupMesh.instanceMatrix.needsUpdate = true;
      pickupStates.needsUpdate = true;
    }
  }

  function mountVisuals() {
    if (visualsMounted) return;
    visualsMounted = true;

    const at = (i, t) => mix(sections[i].start, sections[i].end, t);
    const frameScratch = {
      centerX: 0, centerY: 0, centerZ: 0,
      forwardX: 0, forwardY: 0, forwardZ: 1,
      rightX: 1, rightZ: 0,
      curvature: 0, bank: 0, width: 16, index: 0, u: 0, distance: 0, grade: 0,
    };

    function frame(s) {
      core.evalFrame(s, frameScratch);
      return {
        center: new THREE.Vector3(frameScratch.centerX, frameScratch.centerY, frameScratch.centerZ),
        forward: new THREE.Vector3(frameScratch.forwardX, frameScratch.forwardY, frameScratch.forwardZ),
        right: new THREE.Vector3(frameScratch.rightX, 0, frameScratch.rightZ),
        curvature: frameScratch.curvature,
        bank: frameScratch.bank,
        width: frameScratch.width,
        index: frameScratch.index,
        u: frameScratch.u,
        distance: frameScratch.distance,
        grade: frameScratch.grade,
      };
    }

    function surface(f, x, includeBridge = false) {
      const p = f.center.clone().addScaledVector(f.right, x);
      p.y += core.crossHeight(f, x) + core.rampHeight(f.distance, x, includeBridge);
      return p;
    }

    const instances = new Map();
    const geo = {
      box: new THREE.BoxGeometry(1, 1, 1),
      pillar: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
      cone: new THREE.ConeGeometry(0.5, 1, 6),
      drum: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
      sphere: new THREE.IcosahedronGeometry(0.5, 0),
      bevel: chamferCase(1,1,1,.105),
      glaze: new THREE.BoxGeometry(1,1,1),
    };
    const solid = new THREE.MeshLambertMaterial({ flatShading: true });
    const propMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.78,metalness:.03});
    const dirt = new THREE.MeshLambertMaterial({ color: C.floor });
    styleGround(dirt);
    const windowMaterial = new THREE.MeshPhongMaterial({shininess:68,specular:0x8eafb8,emissive:0x071420});
    extraDisposables = [...Object.values(geo), solid, dirt, windowMaterial,propMaterial];

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(18000, 18000), dirt);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -6.4;
    trackGroup.add(ground);

    const q = new THREE.Quaternion();
    const eul = new THREE.Euler();
    const scale = new THREE.Vector3();
    function tile(p) {
      return Math.floor(p.x / 400) + ',' + Math.floor(p.z / 400);
    }
    function shape(kind, p, w, h, d, color, yaw = 0, tilt = 0, roll = 0) {
      const key = kind + ':' + (w > 250 ? 'horizon' : tile(p));
      if (!instances.has(key)) instances.set(key, { kind, parts: [] });
      q.setFromEuler(eul.set(tilt, yaw, roll, 'YXZ'));
      instances.get(key).parts.push([new THREE.Matrix4().compose(p, q, scale.set(w, h, d)), color]);
    }
    function trackShape(kind, s, x, h, w, height, d, color, relativeYaw = 0) {
      if (roadGone(s)) return;
      const f = frame(s);
      const p = surface(f, x);
      p.y += h;
      shape(kind, p, w, height, d, color, Math.atan2(-f.forward.x, -f.forward.z) + relativeYaw);
    }
    function world(kind, x, y, z, w, h, d, c, yaw = 0) {
      shape(kind, new THREE.Vector3(x, y, z), w, h, d, c, yaw);
    }
    const upright = new THREE.Vector3(0,1,0);
    function beam(a,b,w,d,color,kind='box') {
      const delta=b.clone().sub(a), p=a.clone().lerp(b,.5), length=delta.length();
      if(length<.001)return;
      const key=kind+':'+tile(p);
      if(!instances.has(key))instances.set(key,{kind,parts:[]});
      q.setFromUnitVectors(upright,delta.multiplyScalar(1/length));
      instances.get(key).parts.push([new THREE.Matrix4().compose(p,q,scale.set(w,length,d)),color]);
    }
    // Keep props off the route and clear across crossovers; track tiles are long
    // enough that testing only the nominal sector's center would miss nearby lanes.
    const clearanceFrames=[];
    if(original)for(let s=0;s<length;s+=14){
      const f=frame(s);clearanceFrames.push([f.center.x,f.center.z,f.width*.5]);
    }
    const safeCampus=(x,z,r)=>!clearanceFrames.some(([a,b,half])=>(a-x)**2+(b-z)**2<(half+r+13)**2);
    const positiveHeight = (p) => p.y + 6.4;
    function post(s, x, width = 0.76, topOffset = -0.25, color = C.steel) {
      if (roadGone(s)) return;
      const f = frame(s);
      const p = surface(f, x);
      const h = positiveHeight(p) + topOffset;
      p.y = -6.4 + h / 2;
      shape('box', p, width, h, width, color);
    }

    const surfaceTiles = new Map();
    const iceDistance = (patch, s) => s < patch.s0 ? (s + length) - patch.s0 : s - patch.s0;
    const iceLength = (patch) => patch.s1 < patch.s0 ? length + patch.s1 - patch.s0 : patch.s1 - patch.s0;

    function pavement(a, b, x1, x2, x3, x4, color) {
      if (roadGone(a.distance) && roadGone(b.distance)) return;
      const pa = surface(a, x1), pb = surface(a, x2), pc = surface(b, x4), pd = surface(b, x3);
      const key = tile(pa);
      if (!surfaceTiles.has(key)) surfaceTiles.set(key, { positions: [], colors: [], coords: [] });
      const { positions, colors, coords } = surfaceTiles.get(key);
      const vc = colorValue(color);
      function vertex(p, f, x) {
        positions.push(p.x, p.y, p.z);
        colors.push(vc.r, vc.g, vc.b);
        const ds = f === b && b.distance < a.distance ? length : f.distance;
        let glaze = 0;
        for (const patch of icePatches) {
          const delta = iceDistance(patch, f.distance), span = iceLength(patch);
          if (delta < 0 || delta > span) continue;
          const extent = patch.width == null ? f.width * .5 + .10 : patch.width * .5;
          const lateral = extent - Math.abs(x - (patch.x ?? 0));
          if (lateral < 0) continue;
          glaze = Math.max(glaze, THREE.MathUtils.smoothstep(Math.min(delta, span - delta), 0, 7) *
            (patch.width == null ? 1 : THREE.MathUtils.smoothstep(lateral, 0, 1.1)));
        }
        coords.push(x, ds, glaze);
      }
      vertex(pa,a,x1); vertex(pb,a,x2); vertex(pc,b,x4);
      vertex(pa,a,x1); vertex(pc,b,x4); vertex(pd,b,x3);
    }
    function bankLoft(p, radius, depth, height, heading, style) {
      // Contoured terrain with an inset foot and windward color facets rather than
      // floating prop cones. Fits below race views and lives in their static tiles.
      const shades=style===0?[0x799a78,0x8aa77b,0x95ad81]:[0x708f71,0x7e9a75,0x8ca579];
      const rings=[1,.78,.44,.16], heights=[-.07,.25,.69,.95], radials=10, layers=[];
      const ca=Math.cos(heading),sa=Math.sin(heading);
      for(let j=0;j<rings.length;j++){
        const r=rings[j], y=heights[j];const layer=[];
        for(let i=0;i<radials;i++){
          const t=i*TAU/radials, offset=1+.10*Math.cos(i*2.8+p.x*.013)+.14*Math.sin(i*1.85+p.z*.012);
          const x=Math.cos(t)*radius*r*offset+height*.13*j;
          const z=Math.sin(t)*depth*r*offset;
          layer.push(new THREE.Vector3(p.x+x*ca-z*sa,p.y+height*y*(.92+.12*Math.sin(i*.89+j*.26)),p.z+x*sa+z*ca));
        }
        layers.push(layer);
      }
      const crest=new THREE.Vector3(p.x+.48*height*ca,p.y+height,p.z+.48*height*sa);
      for(let i=0;i<radials;i++){
        const k=(i+1)%radials;
        for(let j=0;j<layers.length-1;j++)quad(layers[j][i],layers[j][k],layers[j+1][k],layers[j+1][i],shades[(j+Math.floor(i*.75))%3]);
        tri(layers[3][i],layers[3][k],crest,shades[1+(i%2)]);
      }
    }
    const colorCache = new Map();
    function colorValue(n) {
      if (!colorCache.has(n)) colorCache.set(n, new THREE.Color(n));
      return colorCache.get(n);
    }
    function tri(a, b, c, color) {
      const key = tile(a);
      if (!surfaceTiles.has(key)) surfaceTiles.set(key, { positions: [], colors: [], coords: [] });
      const { positions, colors, coords } = surfaceTiles.get(key);
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      const v = colorValue(color);
      for (let i = 0; i < 3; i++){ colors.push(v.r, v.g, v.b); coords.push(0,0,-1); }
    }
    function quad(a, b, c, d, color) {
      tri(a, b, c, color);
      tri(a, c, d, color);
    }
    function lp(f, x, y = 0.07) {
      const p = surface(f, x);
      p.y += y;
      return p;
    }
    function strip(a, b, x1, x2, x3, x4, color, offset = 0.09) {
      if (roadGone(a.distance) && roadGone(b.distance)) return;
      quad(lp(a, x1, offset), lp(a, x2, offset), lp(b, x4, offset), lp(b, x3, offset), color);
    }
    function mark(s1, s2, x1, x2, color, offset = 0.103) {
      strip(frame(s1), frame(s2), x1, x2, x1, x2, color, offset);
    }
    function laneArrow(s, x, forward, across, color) {
      const run = Math.hypot(forward, across);
      const ds = forward / run;
      const dx = across / run;
      const paint = (along, side) => lp(frame(s + along * ds - side * dx), x + along * dx + side * ds, 0.15);
      const neck = run - 2.7;
      quad(paint(0, -0.40), paint(0, 0.40), paint(neck, 0.40), paint(neck, -0.40), color);
      tri(paint(neck, -1.4), paint(neck, 1.4), paint(run, 0), color);
    }
    function hasGuardrail(f) {
      return (original && f.index === 3) || f.center.y > 22 || f.distance < 185 || f.distance > length - 115 || Math.abs(f.curvature) > 0.009;
    }
    function railSegment(a, b, side, tall) {
      // Two folded faces and a colored crown read as a W-beam even at chase distance.
      // Keep its original footprint and approximate accident/edge guardrail silhouette.
      const profile = tall ? [[.13,.51],[.10,.67],[.22,.79],[.14,.94],[.21,1.04],[.49,1.04],[.50,.55]]
        : [[.14,0],[.12,.11],[.19,.28],[.46,.28],[.53,.11],[.51,0]];
      const ends = (f) => profile.map(([x,y]) => lp(f, side * (f.width * .5 - x), y));
      const left = ends(a), right = ends(b);
      for (let i=0; i<profile.length-1; i++) {
        const color = i === profile.length-3 ? C.milk : i % 3 === 0 ? C.steel : a.index === 3 && original ? C.mint : C.rails;
        quad(left[i],right[i],right[i+1],left[i+1],color);
      }
    }

    // Refine only curved/banked/raised or icing pieces. Straight sections keep
    // the original station spacing, otherwise the art pass needlessly doubles geometry.
    const crownCuts = [-1, -.91, -.79, -.62, -.38, -.18, 0, .18, .38, .62, .79, .91, 1];
    const flatCuts = [-1,-.91,-.38,0,.38,.91,1];
    const snowBands = [.92, .955, .99, 1.055];
    const edgeLight = course.id === 'track03' ? 0xf4c86a : original ? 0xdafff2 : 0x9fe6ff;
    let a = frame(0);
    for (let n = 0; n < segments; n++) {
      const start = n * segmentLength, end = (n + 1) * segmentLength;
      const b = frame(end);
      const halfA = a.width * .5, halfB = b.width * .5;
      const masked = roadGone(a.distance) && roadGone(b.distance);
      const stations = [a, b];
      const ramp = ramps.find((p) => p !== bridge && p.s - 17 <= end && p.s + 12 >= start);
      const icyBoundaries = icePatches.flatMap((p) => [p.s0,p.s1,p.s0+7,p.s1-7]).filter((s) => s > start + .002 && s < end - .002);
      const extra = [...icyBoundaries];
      if (Math.abs(a.curvature) > .012 || Math.abs(a.bank) > .17 || ramp || a.index === 5 && original || roadGone(a.distance) !== roadGone(b.distance)) extra.push((start+end)*.5);
      if (extra.length) stations.splice(1,0,...extra.sort((x,y)=>x-y).filter((v,i,q)=>!i||v-q[i-1]>.002).map(frame));
      for (let j=0; j<stations.length-1; j++) {
        const u=stations[j], v=stations[j+1];
        const splits = [...(original && (u.index===4||u.index===5) ? crownCuts : flatCuts)];
        if (ramp) for (const delta of [-1,-.75,0,.75,1]) {
          const x=(ramp.x+delta*ramp.width*.5)/(u.width*.5);
          if (Math.abs(x)<.89 && !splits.some((p) => Math.abs(x-p)<.017)) splits.push(x);
        }
        for (const p of icePatches) if (p.width != null && iceDistance(p,u.distance)<=iceLength(p)) {
          for (const delta of [-1,-.84,.84,1]) {
            const x=((p.x??0)+delta*p.width*.5)/(u.width*.5);
            if (Math.abs(x)<.98&&!splits.some(q=>Math.abs(x-q)<.012)) splits.push(x);
          }
        }
        splits.sort((x,y)=>x-y);
        for (let k=0;k<splits.length-1;k++){
          const x=splits[k], z=splits[k+1];
          pavement(u,v,x*u.width*.5,z*u.width*.5,x*v.width*.5,z*v.width*.5,k===0||k===splits.length-2?C.shoulder:C.tarmac);
        }
      }
      if (masked) { a=b; continue; }
      const curbColor = Math.floor(n / 2) % 2 === 0 ? C.milk : C.curb;
      for (const sign of [-1,1]){
        const open=core.dropAt((n+.5)*segmentLength,sign);
        const edgeColor=open?(n%2?0xffca33:C.ink):curbColor;
        strip(a,b,sign*halfA,sign*(halfA-(open?1.04:.73)),sign*halfB,sign*(halfB-(open?1.04:.73)),edgeColor,.105);
        strip(a,b,sign*(halfA-1.51),sign*(halfA-1.31),sign*(halfB-1.51),sign*(halfB-1.31),open?0xf8b535:C.milk,.086);
        if (n%3 !==0 && !open) strip(a,b,sign*(halfA-.91),sign*(halfA-.75),sign*(halfB-.91),sign*(halfB-.75),edgeLight,.109);
        const A0=lp(a,sign*halfA),B0=lp(b,sign*halfB);
        const A1=lp(a,sign*(halfA-.08),-.51), B1=lp(b,sign*(halfB-.08),-.51);
        const A2=lp(a,sign*(halfA-.44),-1.43), B2=lp(b,sign*(halfB-.44),-1.43);
        quad(A0,B0,B1,A1,C.fascia); quad(A1,B1,B2,A2,C.asphaltEdge);
        if (n%5 ===0 && !open) quad(A2,B2,lp(b,sign*(halfB-1.1),-1.43),lp(a,sign*(halfA-1.1),-1.43),C.steel);
        if (!open) railSegment(a,b,sign,hasGuardrail(a));
        // Frost stays in the verge except where the authoritative ice map says otherwise.
        if (!original && !open && n%18 < (course.id==='track02'?15:8)) {
          const offset=(k,f)=>sign*(f.width*.5+(k-.99)*3.4);
          const jag=(.17*Math.sin(n*1.32+sign)+.095*Math.cos(n*.46));
          strip(a,b,offset(snowBands[1]+jag*.06,a),offset(snowBands[3]+jag*.28,a),offset(snowBands[1]-jag*.11,b),offset(snowBands[3]-jag*.25,b),C.snow,.026);
        }
      }
      if (n%9===0) strip(a,b,-.085,.085,-.085,.085,0x83959d,.072);
      a=b;
    }

    for (const i of [1, 3, 4, 6, 8, 11]) {
      const corner = at(i, 0.17);
      for (let k = 1; k <= 3; k++) {
        const s = corner - 8 * k;
        const f = frame(s);
        const outside = -Math.sign(f.curvature || 0.01);
        const x = outside * (f.width / 2 - 2.3);
        for (let j = 0; j < k; j++) mark(s + j * 0.72, s + j * 0.72 + 0.33, x - 1.2, x + 1.2, C.milk, 0.13);
      }
    }
    for (const i of [1, 3, 4, 5, 6, 8, 11]) {
      const begin = i === 3 ? 0.10 : 0.26;
      const end = i === 3 ? 0.88 : 0.60;
      const run = (sections[i].end - sections[i].start) * (end - begin);
      const n = Math.ceil(run / 3.6);
      for (let j = 0; j < n; j++) {
        const u = mix(begin, end, j / n);
        const v = mix(begin, end, (j + 1) / n);
        const A = frame(at(i, u));
        const B = frame(at(i, v));
        const xA = 3.6 * Math.sin(u * 4.7);
        const xB = 3.6 * Math.sin(v * 4.7);
        for (const tire of [-0.78, 0.78]) {
          strip(A, B, xA + tire - 0.065, xA + tire + 0.065, xB + tire - 0.065, xB + tire + 0.065, 0x3b484f, 0.043);
        }
      }
    }
    for (const pad of pads) {
      const color = pad.tier === 2 ? C.super : C.lime;
      const w = pad.width * 0.5;
      mark(pad.s - 5, pad.s + 3, pad.x - w, pad.x + w, C.ink, 0.105);
      for (const edge of [-1, 1]) mark(pad.s - 5, pad.s + 3, pad.x + edge * w - 0.1, pad.x + edge * w + 0.1, color, 0.12);
      for (let j = 0; j < 3; j++) {
        const s = pad.s - 4 + 2.3 * j;
        const left = frame(s);
        const mid = frame(s + 1.4);
        const tip = frame(s + 2.15);
        const back = frame(s + 0.75);
        for (const side of [-1, 1]) {
          quad(
            lp(left, pad.x + side * (w - 0.32), 0.13),
            lp(mid, pad.x, 0.13),
            lp(tip, pad.x, 0.13),
            lp(back, pad.x + side * (w - 0.32), 0.13),
            color,
          );
        }
      }
    }
    for (const ramp of ramps) {
      const w = ramp.width / 2;
      const paintedHalf = course.id === 'track02' ? w - 1.3 : w;
      for (let i = -3; i < 0; i++) {
        const p = ramp.s + i * 3.5;
        mark(p, p + 0.52, ramp.x - paintedHalf + 0.4, ramp.x + paintedHalf - 0.4, ramp === bridge ? C.super : C.orange, 0.19);
      }
      if (course.id === 'track02') {
        mark(ramp.s - 1.7, ramp.s - 0.75, ramp.x - paintedHalf, ramp.x + paintedHalf, C.ink, 0.22);
        mark(ramp.s - 0.75, ramp.s + 0.35, ramp.x - paintedHalf, ramp.x + paintedHalf, C.milk, 0.24);
      } else {
        mark(ramp.s - 0.4, ramp.s + 0.25, ramp.x - w, ramp.x + w, C.milk, 0.23);
      }
    }
    for (let row = 0; row < 2; row++) {
      for (let x = -15; x < 15; x += 1.5) {
        mark(row * 1.5, row * 1.5 + 1.5, x, x + 1.5, (row + Math.round(x / 1.5)) % 2 === 0 ? C.milk : C.ink, 0.13);
      }
    }
    for (const slot of grid) {
      const s = length + slot.s + 1.6;
      const x = slot.x;
      mark(s, s + 0.28, x - 1.65, x + 1.65, C.milk);
      mark(s - 2.5, s, x - 1.65, x - 1.46, C.milk);
      mark(s - 2.5, s, x + 1.46, x + 1.65, C.milk);
    }

    // Collect all track signs and bake into 1 shelf-packed CanvasTexture + 1 merged Mesh.
    const signSpecs = [];
    function textPanel(s, x, h, w, ht, headline, kicker, bg = C.dark, fg = C.milk, frontOffset = 0) {
      if (roadGone(s)) return;
      const f = frame(s);
      const p = surface(f, x);
      p.y += h;
      signSpecs.push({
        p,
        yaw: Math.atan2(-f.forward.x, -f.forward.z),
        w,
        ht,
        headline,
        kicker,
        bg,
        fg,
        frontOffset,
      });
    }

    function mountedSign(s, x, height, w, h, title, caption, bg, fg) {
      const f = frame(s);
      const side = Math.sign(x);
      const edge = side * (f.width * 0.5 - 0.5);
      const top = height - h * 0.5 + 0.04;
      trackShape('box', s, x, top * 0.5 - 0.22, 0.42, top + 0.44, 0.45, C.steel);
      trackShape('box', s, (x + edge) * 0.5, -0.43, Math.abs(x - edge) + 0.45, 0.48, 0.55, C.steel);
      trackShape('box', s, x, height, w, h, 0.3, bg);
      textPanel(s, x, height, w, h, title, caption, bg, fg, 0.165);
    }

    for (let i = 0; i < sections.length; i++) {
      const s = at(i, 0.023);
      const f = frame(s);
      const x = -f.width / 2 - 4.9;
      mountedSign(
        s, x, 6.9, 8.5, 3.1,
        String(i + 1).padStart(2, '0') + ' / ' + (original ? sections[i].name.split(' ')[0] : sections[i].name).toUpperCase(),
        'SPROTO  •  TEST TRACK ' + course.number,
        C.dark, C.milk,
      );
    }
    for (const gap of drops) {
      const s = gap.start - 44;
      const x = gap.side * (core.widthAt(s) / 2 + 3.6);
      mountedSign(s, x, 4.1, 6.4, 2.4, 'DROP', gap.side < 0 ? 'OPEN LEFT EDGE' : 'OPEN RIGHT EDGE', 0xffca33, C.ink);
    }
    for (let s = 5; s < length; s += 12) {
      const f = frame(s);
      const edge = f.width / 2 - 0.32;
      for (const side of [-1, 1]) {
        if (core.dropAt(s, side)) continue;
        if (hasGuardrail(f)) {
          trackShape('box', s, side * edge, 0.36, 0.30, 0.75, 0.48, C.asphaltEdge);
        } else {
          trackShape('box', s, side * edge, 0.48, 0.24, 1.0, 0.32, C.milk);
          trackShape('box', s, side * edge, 0.79, 0.26, 0.21, 0.34, C.orange);
        }
      }
    }
    for (let s = 12; s < length; s += 36) {
      const f = frame(s);
      for (const sign of [-1, 1]) {
        const offset = sign * (f.width * 0.5 + 2.2);
        const support = surface(f, offset);
        const intersectsLowerRoad = nodes.some(
          (n, i) => i % 6 === 0 && n.p.y < support.y - 6 && (n.p.x - support.x) ** 2 + (n.p.z - support.z) ** 2 < 17 ** 2,
        );
        if (!intersectsLowerRoad) post(s, offset, f.index === 3 ? 1.35 : 1.0, -1.35);
      }
      trackShape('box', s, 0, -1.58, f.width + 5.6, 0.64, 1.05, C.steel);
    }
    for (const patch of icePatches) {
      const warn=patch.s0-46;
      const f=frame(warn);
      for(const side of [-1,1]) mountedSign(warn,side*(f.width*.5+3.4),4.6,7.2,3.2,'ICE AHEAD','LIFT EARLY   /   LOW GRIP',0x215777,0xe8faff);
      // Progressively shorter warning bars are laid on the margins instead of
      // filling the racing lane or obscuring boost and landing-pad paint.
      for(const offset of [-27,-16,-8]){
        const s=patch.s0+offset,F=frame(s);
        for(const side of [-1,1]){
          const q=side*(F.width*.5-2.9);
          mark(s,s+.61,q-1.15,q+1.15,0x072b45,.145);
          mark(s+.07,s+.52,q-.91,q+.91,0x7cdef9,.166);
        }
      }
    }

    // Glossy runoff sits on the actual section cross-slope, below markings. The
    // oval silhouette matches the pure grip mask; the opposite lane stays dry.
    if(core.wetPatches.length){
      const wetPos=[],wetColors=[],wetUV=[];
      const material=new THREE.MeshPhongMaterial({vertexColors:true,side:THREE.DoubleSide,
        shininess:115,specular:0x557d9b,flatShading:false});
      styleRunoff(material);
      const swatch=[0x40535c,0x31454f,0x293d48,0x263947,0x2b414c,0x334d57,0x40535c];
      const slices=[-1,-.87,-.43,0,.43,.87,1];
      function sampleWet(p,u,v){
        const f=frame(p.s0+(u+1)*.5*(p.s1-p.s0));
        const r=Math.sqrt(Math.max(0,1-u*u));
        return lp(f,p.x+v*r*p.width*.5,.063);
      }
      function addWet(v,hex,u,x){wetPos.push(v.x,v.y,v.z);wetUV.push(x,u);const c=colorValue(hex);wetColors.push(c.r,c.g,c.b);}
      for(const p of core.wetPatches){
        const steps=Math.max(15,Math.ceil((p.s1-p.s0)/2.4));
        for(let i=0;i<steps;i++){
          const a=i/steps*2-1,b=(i+1)/steps*2-1;
          for(let n=0;n<slices.length-1;n++){
            const lo=slices[n],hi=slices[n+1], low=swatch[Math.min(n,swatch.length-1)],high=swatch[Math.min(n+1,swatch.length-1)];
            const a0=sampleWet(p,a,lo),a1=sampleWet(p,a,hi),b0=sampleWet(p,b,lo),b1=sampleWet(p,b,hi);
            addWet(a0,low,a,lo);addWet(a1,high,a,hi);addWet(b1,high,b,hi);
            addWet(a0,low,a,lo);addWet(b1,high,b,hi);addWet(b0,low,b,lo);
          }
        }
        const s=p.s0-37,f=frame(s),side=Math.sign(p.x);
        mountedSign(s,side*(f.width*.5+3.3),4.5,7.0,3.1,'WET PATCH',side<0?'LEFT SIDE   /   LOW GRIP':'RIGHT SIDE   /   LOW GRIP',0x264b67,0xe2f4ff);
      }
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(wetPos,3));
      geo.setAttribute('aRunoff',new THREE.Float32BufferAttribute(wetUV,2));
      geo.setAttribute('color',new THREE.Float32BufferAttribute(wetColors,3));
      geo.computeVertexNormals();
      const wetMesh=new THREE.Mesh(geo,material);wetMesh.name='Circuit puddle patches';trackGroup.add(wetMesh);
    }

    function arch(s, title, kicker) {
      const f = frame(s);
      const x = f.width * 0.5 + 2.2;
      const height = 11.9;
      const alpine = course.id === 'track02';
      const tower = alpine ? 0x274c65 : C.dark;
      const beacon = alpine ? 0x93e2f4 : original ? C.lime : 0xf2b646;
      for (const side of [-1, 1]) {
        trackShape('box', s, side * x, height / 2, 1.48, height, 2.32, tower);
        trackShape('box', s, side * x, 1.46, 2.2, 2.92, 3.1, C.steel);
        trackShape('box', s, side * x, 5.35, 1.58, 6.4, 2.48, C.orange);
        trackShape('box', s, side * x, 9.05, 1.76, .45, 2.56, beacon);
        trackShape('box', s-.98, side*x, 7.24, .50, 5.3, .40, C.ink);
        for(let p=0;p<3;p++) trackShape('box',s-1.28,side*x,4.8+p*1.17,.74,.33,.18,beacon);
        trackShape('box',s,side*x,height+1.42,2.28,.55,3.3,C.steel);
        trackShape('pillar',s,side*x,height+2.32,.42,1.2,.42,tower);
        trackShape('sphere',s,side*x,height+3.03,.65,.65,.65,beacon);
        trackShape('bevel',s-1.18,side*x,1.74,2.30,1.22,.67,tower);
        for(const offset of [-.42,.42]) {
          trackShape('glaze',s-1.53,side*x+offset,1.75,.34,.48,.085,beacon);
          const f=frame(s-.96);
          beam(lp(f,side*x+offset,2.76),lp(f,side*x-offset,4.25),.09,.16,C.steel);
        }
        for(const z of [-.78,.78]) {
          const f=frame(s+z);
          beam(lp(f,side*x,height-3.9),lp(f,side*(x-2.6),height-1.32),.23,.25,C.steel);
        }

      }
      trackShape('box', s, 0, height, x * 2 + 1.6, 2.5, 1.58, tower);
      textPanel(s - 0.84, 0, height, 2 * x + 0.95, 2.38, title, kicker, tower, C.milk);
      trackShape('box',s,0,height+1.39,2*x+1.82,.22,2.18,beacon);
      trackShape('box',s,0,height-1.30,2*x+1.80,.16,1.93,C.steel);
      for(let p=-4;p<=4;p++){
        const x0=(p/5)*x;
        trackShape('box',s-.91,x0,height-1.34,.89,.16,.42,p%2?C.orange:beacon);
        trackShape('bevel',s+.11,x0,height-1.45,1.37,.31,1.57,tower);
        trackShape('glaze',s+.12,x0,height-1.63,.78,.09,1.07,beacon);
      }
      const trussF=frame(s+.59);
      for(let i=-4;i<4;i++){
        beam(lp(trussF,i*x/4,height+1.33),lp(trussF,(i+1)*x/4,height+2.50),.11,.18,C.steel);
        beam(lp(trussF,i*x/4,height+2.50),lp(trussF,(i+1)*x/4,height+2.50),.10,.14,tower);
      }

    }
    arch(0, original ? 'SPROTO RACING' : course.name.toUpperCase(), 'START  /  FINISH                              COMPETITION RESEARCH UNIT');

    let seed = 0x5350;
    function rand() {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    const summit=course.id==='track03';
    const facilityTint = original ? 0x394c51 : course.id === 'track02' ? 0x264c68 : 0x54493f;
    const glazing = original ? 0x478a92 : 0x486e86;
    const trim = original ? C.lime : course.id==='track02' ? 0x8bdffc : 0xf2b846;
    // Layered cantilever pit modules and ridge viewing pavilions. Base locations
    // are wholly outside the road and avoid all scripted hazards.
    for (const [s,side] of [[47,1],[72,1],[109,1],[131,1]]) {
      const x = side*(frame(s).width*.5+10.9);
      const base = original ? 4.1 : 5.4;
      trackShape('box',s,x,base*.50,12,base,13,facilityTint);
      trackShape('box',s,x,base+.13,14.8,.44,14.3,trim);
      trackShape('box',s,x,base+.55,9.6,.57,9.4,C.steel);
      trackShape('box',s,x-side*6.8,base*.33,.71,1.65,11.6,C.dark);
      for(let j=-2;j<=2;j++){
        trackShape('bevel',s+j*2.3,x-side*6.38,base*.71,.46,1.34,2.01,C.ink);
        trackShape('glaze',s+j*2.3,x-side*6.65,base*.71,.15,1.00,1.78,glazing);
        trackShape('box',s+j*2.3,x-side*6.74,base*.71,.10,1.03,.10,C.steel);
        trackShape('box',s+j*2.3,x-side*7.2,base*.17,.37,.41,1.84,trim);
      }
      for(const z of [-5.4,5.4]){
        const f=frame(s+z), near=x-side*7.1;
        beam(lp(f,near,base*.37),lp(f,near+side*2.55,base+.23),.18,.18,C.steel);
        trackShape('bevel',s+z,near,base*.23,.71,1.46,.73,facilityTint);
        trackShape('glaze',s+z,near-side*.40,base*.62,.083,.25,.78,trim);
      }
      if(!original && !summit){
        trackShape('box',s,x,base+.91,11.8,.29,11.8,C.snow);
        trackShape('box',s,x+side*2.2,base+1.18,5.1,.36,7.5,C.foam);
      }
      if(summit) {
        // Two shingled planes and their timber ridge; still outside the curb.
        const origins=[frame(s-6.6),frame(s+6.6)];
        const ridge=origins.map(f=>lp(f,x,base+3.05));
        for(const side of [-1,1]){
          const eave=origins.map(f=>lp(f,x+side*7.28,base+.42));
          quad(eave[0],ridge[0],ridge[1],eave[1],side<0?0x476357:0x556f60);
          tri(eave[0],ridge[0],lp(origins[0],x,base+.42),0x6f6250);
          tri(eave[1],ridge[1],lp(origins[1],x,base+.42),0x6f6250);
          for(let j=-2;j<=2;j++)trackShape('box',s+j*2.3,x+side*5.6,base+1.10,3.2,.12,.18,0x778b78);
        }
        trackShape('box',s,x,base+3.07,.40,.20,13.5,C.steel);
      }
    }
    if(original){
      // Paired pit-light stacks and a multi-tier lattice mast at the spiral.
      for(const side of [-1,1]) for(const s of [17,143]) {
        const x=side*(frame(s).width*.5+3.20);
        trackShape('box',s,x,3.5,.55,7,.55,C.dark);
        for(let j=0;j<4;j++)trackShape('box',s-.37,x,4.7+j*.49,1.15,.23,.31,j<2?C.orange:C.lime);
      }
    }else{
      // High-route survey masts and summit marker gantries stay outside racing width.
      for(const [i,u,side] of [[1,.55,1],[3,.21,-1],[4,.56,1],[6,.35,1],[8,.63,-1],[10,.54,1]]) {
        const s=at(i,u), f=frame(s), x=side*(f.width*.5+6.15);
        trackShape('box',s,x,.92,4.8,1.84,3.3,C.fascia);
        trackShape('box',s,x,4.66,.76,9.2,.78,C.steel);
        trackShape('box',s,x,8.15,2.8,1.32,3.7,C.foam);
        trackShape('box',s,x,8.95,3.3,.25,4.1,C.snow);
        trackShape('box',s-.89,x,8.18,2.3,.28,.32,trim);
        trackShape('pillar',s,x,10.1,.37,2.4,.37,C.dark);
        trackShape('sphere',s,x,11.38,.67,.6,.67,trim);
      }
    }
    function grandstandProfile(f) {
      const profile = [[-25.9, 1.67], [-27.7, 1.67], [-27.7, 2.55], [-29.5, 2.55],
        [-29.5, 3.43], [-31.3, 3.43], [-31.3, 4.31], [-33.2, 4.31]];
      const seats = profile.map(([x, h]) => lp(f, x, h));
      const front = seats[0].clone();
      const back = seats[seats.length - 1].clone();
      front.y = -6.36;
      back.y = -6.36;
      return [front, ...seats, back];
    }
    function roofProfile(f) {
      return [[-25.4, 8.37], [-25.4, 8.79], [-35.2, 9.05], [-35.2, 8.74]].map(([x, h]) => lp(f, x, h));
    }
    for (let s = 31; s < 139; s += 3) {
      const fa = frame(s);
      const fb = frame(s + 3);
      const A = grandstandProfile(fa);
      const B = grandstandProfile(fb);
      for (let k = 0; k < A.length - 1; k++) quad(A[k], B[k], B[k + 1], A[k + 1], k === 0 || k === A.length - 2 ? C.steel : C.foam);
      const R = roofProfile(fa);
      const S = roofProfile(fb);
      for (let k = 0; k < 4; k++) quad(R[k], S[k], S[(k + 1) % 4], R[(k + 1) % 4], k === 0 ? trim : !original && k===2 ? C.snow : C.mint);
      if (s === 31 || s === 136) {
        const end = s === 31 ? R : S;
        quad(...end, C.mint);
        const wall = s === 31 ? A : B;
        for (let k = 1; k < wall.length - 1; k++) tri(wall[0], wall[k], wall[k + 1], C.steel);
      }
    }
    for(let s=36;s<139;s+=12){
      for(let row=0;row<4;row++) trackShape('box',s,-26.7-row*1.8,1.63+row*.88,.52,.21,10.3,(row+s)%3?C.steel:trim);
      trackShape('box',s,-26.2,8.13,.64,.31,10.2,C.dark);
      trackShape('box',s,-33.9,6.38,.33,6.36,.56,C.fascia);
    }
    for (const s of [48, 84, 120]) {
      for (let row = 0; row < 4; row++) {
        for(let j=0;j<11;j++){
          const pos=s-14+j*2.68+rand()*.5;
          const w=.84+rand()*.22,h=1.34+rand()*.36,variant=Math.floor(rand()*3);
          trackShape('detail-fan-'+variant,pos,-26.8-row*1.8,2.34+row*.88,w,h,.92,0xffffff,(j%3-1)*.16);
        }
      }
      for (const d of [-13, 13]) trackShape('box', s + d, -34.2, 4.45, 0.47, 9.1, 0.48, C.dark);
    }
    for (const s of [34, 60, 86, 112, 138, 164]) {
      trackShape('pillar', s, 19.4, 5.5, 0.19, 11, 0.19, C.dark);
      trackShape('box', s, 20.9, 9.9, 3, 0.95, 0.09, C.orange);
    }
    if(original){
      // Track control booth: paneled concrete, upper control glazing and real roof equipment.
      trackShape('bevel',87,35,8.8,14,17.6,16,C.foam);
      trackShape('box',87,35,18.1,15,.8,17,C.lime);
      trackShape('box',87,35,13,14.3,3.8,16.4,C.ink);
      for(let i=-2;i<=2;i++){
        trackShape('glaze',87+i*2.85,27.73,13.15,.14,2.5,2.53,0x83bbce);
        trackShape('box',87+i*2.85,27.66,12.22,.13,.21,2.67,0x8a9fa1);
      }
      trackShape('pillar',90,36,19.45,.31,2.7,.31,C.steel);
      trackShape('bevel',84,38,18.94,3.4,1.18,3.6,C.steel);
    }else{
      const winter=course.id==='track02';
      trackShape(winter?'detail-snow-station':'detail-timber-station',87,35,7.8,16,15.6,18,0xffffff,Math.PI*.5);
    }
    textPanel(87,35,6.8,11.9,5,course.number,original?'TEST FACILITY':course.id==='track02'?'SNOW RESCUE':'RANGER STATION',C.orange,C.ink,8.035);
    textPanel(150, 28, 9, 20, 7, 'SPROTO', 'RACING DIVISION     /     ' + course.number, C.orange, C.ink);
    trackShape('box', 150, 28, 4.5, 0.56, 9, 0.66, C.dark);

    for (let i = 0; i < 12; i++) {
      for (const u of [0.29, 0.58, 0.79]) {
        const s = at(i, u);
        const f = frame(s);
        if (Math.abs(f.curvature) < 0.004 || i === 3) continue;
        const side = -Math.sign(f.curvature);
        for (let j = 0; j < 3; j++) {
          if (!core.dropAt(s + 6 * j, side)) trackShape('box', s + 6 * j, side * (f.width * 0.5 + 1.8), 1.15, 1, 2.3, 5.3, j % 2 ? C.milk : C.orange);
        }
      }
    }

    function originalFixtures() {
      const drumFrame = frame(drum.s);
      for (const sign of [-1, 1]) trackShape('box', drum.s, sign * (drumFrame.width / 2 + 1.7), 5.3, 0.9, 10.6, 0.9, C.steel);
      trackShape('box', drum.s, 0, 10.4, drumFrame.width + 4, 0.58, 1.4, C.orange);
      for (let x = -12; x < 12; x += 2.4) mark(drum.s - 0.3, drum.s + 0.25, x, x + 1.3, C.orange);
      const movingDrum = new THREE.Group();
      const drumBody = new THREE.Mesh(geo.drum, new THREE.MeshLambertMaterial({ color: 0xe88235 }));
      drumBody.scale.set(drum.width, drum.depth, drum.height);
      drumBody.rotation.x = Math.PI / 2;
      movingDrum.add(drumBody);
      const rollerTrim=new THREE.MeshLambertMaterial({color:0xffca55});
      for(const z of [-2.27,2.27]){
        const ring=new THREE.Mesh(geo.drum,rollerTrim);
        ring.rotation.x=Math.PI*.5;ring.scale.set(drum.width*.87,.057,drum.height*.87);ring.position.z=z;
        movingDrum.add(ring);
      }
      const bands = new THREE.MeshLambertMaterial({ color: C.dark });
      for (const z of [-1.55, 1.55]) {
        const band = new THREE.Mesh(geo.drum, bands);
        band.rotation.x = Math.PI / 2;
        band.scale.set(4.69, 0.38, 4.69);
        band.position.z = z;
        movingDrum.add(band);
      }
      trackGroup.add(movingDrum);

      world('pillar', -525, 40, -410, 12, 92, 12, C.foam);
      world('pillar', -525, 90, -410, 15, 9, 15, C.orange);
      world('pillar', -525, 99, -410, 4.2, 13, 4.2, C.dark);
      world('sphere', -525, 108, -410, 6, 6, 6, C.lime);
      for(let y=5;y<=76;y+=14){
        world('pillar',-525,y,-410,13.8,1.1,13.8,y%3?C.dark:C.orange);
        for(let j=0;j<4;j++){
          const a=j*Math.PI*.5;
          shape('box',new THREE.Vector3(-525+6.1*Math.cos(a),y+5,-410+6.1*Math.sin(a)),.65,12,1.32,C.steel,a,.18);
        }
      }
      world('pillar',-525,85.7,-410,17.1,1.16,17.1,C.ink);
      world('pillar',-525,95,-410,16.0,1.23,16.0,C.lime);
      for (let j = 0; j < 7; j++) {
        const s = at(3, Math.min(0.985, j / 6 + 0.005));
        const f = frame(s);
        const x = f.width / 2 + 2.7;
        mountedSign(s, x, 4.8, 4, 2.5, String(j * 90) + '°', 'SPIRAL    /    04', C.lime, C.ink);
      }
      for (let j = 0; j < 17; j++) {
        const s = at(6, (j + 0.5) / 17);
        const side = j % 2 === 0 ? 1 : -1;
        const h = 10 + ((j * 7) % 22);
        const x = side * (18 + rand() * 9);
        trackShape('pillar', s, x, h / 2, 2.7, h, 2.7, C.mint);
        trackShape('pillar', s, x, h * 0.83, 2.82, 1.7, 2.82, C.orange);
        trackShape('cone', s, x, h + 1.8, 3, 3.6, 3, C.dark);
      }
      for (let i = 0; i < 6; i++) {
        const s = at(7, 0.3 + i * 0.09);
        trackShape('box', s, -21, 6, 0.38, 12, 0.5, C.ink);
        trackShape('box', s, -22.5, 11.6, 3.6, 0.27, 0.5, C.ink);
      }
      for (const side of [-1, 1]) {
        trackShape('box', bridge.s, bridge.x + side * 5.1, 5.4, 0.63, 10.8, 1.3, C.orange);
        trackShape('box', bridge.s, bridge.x + side * 5.1, 9.2, 0.69, 0.55, 1.4, C.lime);
      }
      trackShape('box', bridge.s, bridge.x, 10.4, 10.65, 0.63, 0.8, C.dark);
      mark(switchTrigger.s - 1.3, switchTrigger.s + 1.3, switchTrigger.x - 2.5, switchTrigger.x + 2.5, C.super, 0.16);
      textPanel(switchTrigger.s + 4, -19, 3.3, 8.5, 2.2, 'LIFT  ↗', 'BRIDGE SWITCH', C.dark, C.super);
      trackShape('box', switchTrigger.s + 4, -19, 1.55, 0.4, 3.1, 0.4, C.dark);
      const bridgeMesh = new THREE.Mesh(
        new THREE.BoxGeometry(8.8, 0.28, 16.4),
        new THREE.MeshLambertMaterial({ color: C.mint }),
      );
      const bridgeMetal=new THREE.MeshLambertMaterial({color:C.steel});
      const bridgeRubber=new THREE.MeshLambertMaterial({color:C.ink});
      for(const x of [-4.26,4.26]) {
        const rib=new THREE.Mesh(geo.box,bridgeMetal);
        rib.scale.set(.23,.17,16.15);rib.position.set(x,.10,0);bridgeMesh.add(rib);
      }
      for(const z of [-7.15,-3.57,.00,3.57,7.15]){
        const seam=new THREE.Mesh(geo.box,bridgeRubber);
        seam.scale.set(8.62,.04,.13);seam.position.set(0,.14,z);bridgeMesh.add(seam);
      }
      trackGroup.add(bridgeMesh);
      const bridgeBase = frame(bridge.s - 8);
      const bridgeIdle = surface(bridgeBase, bridge.x);
      bridgeIdle.y += 0.10;
      const bridgeYaw = Math.atan2(-bridgeBase.forward.x, -bridgeBase.forward.z);

      for (const d of [-4.5, 4.5]) {
        trackShape('box', door.s, door.x + d, 3.5, 1.0, 7, 2.2, C.dark);
        trackShape('box', door.s, door.x + d, 2.0, 1.02, 3, 2.24, C.orange);
      }
      trackShape('box', door.s, door.x, 7.2, 10.2, 1.0, 2.2, C.mint);
      const doorMesh = new THREE.Mesh(
        new THREE.BoxGeometry(door.width, door.height, door.depth),
        new THREE.MeshLambertMaterial({ color: C.orange }),
      );
      const doorFrame = frame(door.s);
      const doorBase = surface(doorFrame, door.x);
      doorMesh.rotation.y = Math.atan2(-doorFrame.forward.x, -doorFrame.forward.z);
      const doorBar=new THREE.MeshLambertMaterial({color:C.dark});
      const doorPlate=new THREE.MeshLambertMaterial({color:C.steel});
      for(const face of [-1,1]){
        for(const sign of [-1,1]){
          const leaf=new THREE.Mesh(geo.box,doorPlate);
          leaf.position.set(sign*door.width*.237,0,face*(door.depth*.5-.02));
          leaf.scale.set(door.width*.439,door.height*.82,.08);doorMesh.add(leaf);
        }
        for(const height of [-.31,.31]){
          const bar=new THREE.Mesh(geo.box,doorBar);
          bar.position.set(0,height*door.height,face*(door.depth*.5+.027));
          bar.scale.set(door.width*.94,door.height*.072,.043);doorMesh.add(bar);
        }
      }
      trackGroup.add(doorMesh);
      textPanel(door.s - 1.16, door.x, 7.15, 9.9, 0.8, '03     DOCK  ACCESS', '', C.dark, C.lime);

      for (let j = 0; j < 30; j++) {
        const s = at(11, 0.1 + rand() * 0.67);
        const x = (j % 2 ? -1 : 1) * (24 + rand() * 17);
        const ht = 3.1 + (j % 4) * 1.5;
        const scaleW=4+rand()*4,scaleD=7+rand()*6;
        trackShape(j%4===0?'detail-workshop':'detail-cargo',s,x,ht*.5,scaleW,ht,scaleD,
          [0xece1b9,0xbddccd,0xd4e8e2,0xf4b28f][j%4],j%2?Math.PI*.5:-Math.PI*.5);

      }

      const drumYaw = Math.atan2(-drumFrame.forward.x, -drumFrame.forward.z);
      return (time) => {
        const fx = core.getFixtureState();
        bridgeMesh.position.copy(bridgeIdle);
        bridgeMesh.position.y += fx.bridgeAngle * 1.73;
        bridgeMesh.rotation.set(fx.bridgeAngle * 0.205, bridgeYaw, 0, 'YXZ');
        const dp = surface(drumFrame, drum.x);
        movingDrum.position.set(dp.x, dp.y + drum.height / 2, dp.z);
        movingDrum.rotation.y = drumYaw;
        drumBody.rotation.y = time * 0.8;
        doorMesh.position.copy(doorBase);
        doorMesh.position.y += door.active ? door.height / 2 : 9.8;
      };
    }

    syncFixtureVisuals = original ? originalFixtures() : () => {};

    if (original) {
      const start = sections[1].start;
      const signAt = start - 39;
      mountedSign(signAt, frame(signAt).width / 2 + 4.5, 4.3, 7.2, 2.7, 'NARROWS', '31 → 26 m', C.dark, C.orange);
      for (const d of [-20, -4, 12, 28, 44]) {
        const fa = frame(start + d);
        const fb = frame(start + d + 4.1);
        const edge = fa.width / 2 - 1.5;
        const inner = fb.width / 2 - 3.1;
        strip(fa, fb, edge - 0.75, edge, inner - 0.75, inner, C.orange, 0.14);
      }
    }
    if (course.id === 'track02') {
      for (const ramp of ramps) {
        const f = frame(ramp.s);
        const drop = surface(f, ramp.x).y - surface(frame(ramp.s + 50), ramp.x).y;
        const flatRange = ramp.power <= 6 ? 50 : ramp.power <= 8 ? 70 : 80;
        const downhillAllowance = drop > 10 ? 40 : drop > 5 ? 30 : 0;
        let range = flatRange + downhillAllowance;
        for (const next of ramps) {
          if (next.s > ramp.s && Math.abs(next.x - ramp.x) < (next.width + ramp.width) / 2) {
            range = Math.min(range, next.s - ramp.s - 19);
          }
        }
        for (let d = 10; d <= range; d += 10) {
          const major = d % 20 === 0;
          const half = ramp.width / 2;
          for (const side of [-1, 1]) {
            const x = ramp.x + side * half;
            const inside = x - side * (major ? 2.0 : 1.15);
            mark(ramp.s + d, ramp.s + d + (major ? 0.95 : 0.60), Math.min(x, inside), Math.max(x, inside), C.milk, 0.14);
            mark(ramp.s + d - (major ? 3 : 1.6), ramp.s + d, x - 0.22, x + 0.22, C.milk, 0.14);
          }
        }
        const signSide = ramp.x > 0 ? 1 : -1;
        mountedSign(ramp.s - 19, signSide * (f.width / 2 + 4), 4.4, 6, 2.5, Math.round(ramp.power) + ' m/s', 'JUMP IMPULSE', C.steel, C.milk);
        if (ramp.power >= 9) {
          const at40 = ramp.s + 40;
          mountedSign(at40, signSide * (frame(at40).width / 2 + 3.1), 5.8, 4.6, 2.8, '40 m', 'LANDING', C.dark, C.milk);
        }
      }
      for (const i of [2, 3, 4, 5, 7, 8, 10]) {
        const s = at(i, 0.55);
        const f = frame(s);
        mountedSign(s, f.width / 2 + 4.5, 5, 8, 2.7, Math.round(f.center.y) + ' m', 'DECK ELEVATION', C.dark, C.milk);
      }
    }
    if (course.id === 'track03') {
      for (const gate of hazards) {
        trackShape('box',gate.s,gate.x,gate.height*.5,gate.width,gate.height,gate.depth,C.orange);
        trackShape('box',gate.s,gate.x,gate.height*.81,gate.width+.025,.11,gate.depth+.018,C.dark);
        trackShape('box',gate.s,gate.x,gate.height*.535,gate.width*.92,.20,gate.depth+.026,C.steel);
        for(const d of [-.32,0,.32]) trackShape('box',gate.s,gate.x+d*gate.width,gate.height*.56,.22,gate.height*.39,gate.depth+.046,C.milk);
        for(const d of [-.44,.44]) trackShape('box',gate.s,gate.x+d*gate.width,gate.height*.39,.13,gate.height*.74,gate.depth+.024,C.ink);
        trackShape('box',gate.s,gate.x,gate.height-.038,gate.width*.72,.09,gate.depth*.70,trim);
        const sides = gate.x === 0 ? [-1, 1] : [-Math.sign(gate.x)];
        for (const side of sides) {
          const from = gate.x + side * (gate.x === 0 ? 1.65 : 0.6);
          laneArrow(gate.s - 48, from, 6.1, side * 4.8, C.milk);
          laneArrow(gate.s - 22, from, 6.1, side * 4.8, C.milk);
        }
        for (let k = 1; k <= 2; k++) mark(gate.s - k * 4 - 0.48, gate.s - k * 4, gate.x - 1.8, gate.x + 1.8, C.orange, 0.13);
      }
      for (const i of [1, 2, 4, 5, 7, 8, 10]) {
        const s = at(i, 0.22);
        for (const d of [75, 50, 25]) {
          const f = frame(s - d);
          mountedSign(s - d, -f.width / 2 - 2.8, 3.7, 4.1, 2.2, String(d), 'BRAKE  /  m', C.dark, C.milk);
        }
      }
    }

    // Build single shelf-packed sign atlas + 1 merged sign mesh (when DOM canvas exists).
    if (typeof document !== 'undefined' && signSpecs.length > 0) {
      const AW = 2048;
      const AH = signSpecs.length >= 39 ? 4096 : 2048;
      const PAD = 16;
      const canvas = document.createElement('canvas');
      canvas.width = AW;
      canvas.height = AH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const css = (v) => '#' + v.toString(16).padStart(6, '0');
        ctx.fillStyle = css(C.dark);
        ctx.fillRect(0, 0, AW, AH);
        let curX = 0;
        let curY = 0;
        let shelfH = 0;
        const signParts = [];
        const signObj = new THREE.Object3D();

        for (let i = 0; i < signSpecs.length; i++) {
          const spec = signSpecs[i];
          const aspect = spec.w / Math.max(0.1, spec.ht);
          const iw = aspect > 5 ? 608 : 288;
          const ih = Math.max(48, Math.min(224, Math.round(iw / aspect)));
          const totalW = iw + PAD * 2;
          const totalH = ih + PAD * 2;
          if (curX + totalW > AW) {
            curX = 0;
            curY += shelfH;
            shelfH = 0;
          }
          const ix = curX + PAD;
          const iy = curY + PAD;
          curX += totalW;
          if (totalH > shelfH) shelfH = totalH;

          // Extrude background color into 16px gutter on all sides to prevent mipmap bleed.
          ctx.fillStyle = css(spec.bg);
          ctx.fillRect(ix - PAD, iy - PAD, totalW, totalH);

          ctx.save();
          ctx.beginPath();
          ctx.rect(ix, iy, iw, ih);
          ctx.clip();
          const margin = iw * 0.045;
          const H = ih;
          const small = !!spec.kicker;
          const accent=spec.headline.includes('ICE')||spec.headline.includes('WET') ? 0x89dcf6 : spec.headline==='DROP'?0x253a42:trim;
          ctx.fillStyle=css(accent);
          ctx.fillRect(ix+margin,iy+H*.062,Math.min(iw-2*margin,H*.39),Math.max(2,H*.027));
          ctx.globalAlpha=.72;
          ctx.fillRect(ix+margin,iy+H*.92,iw*.71,Math.max(2,H*.025));
          ctx.globalAlpha=.97;
          for(let k=0;k<3;k++)ctx.fillRect(ix+iw-margin-(k+1)*H*.123,iy+H*.92,H*.063,Math.max(2,H*.025));
          ctx.globalAlpha=1;
          ctx.fillStyle = css(spec.fg);
          if (small) {
            ctx.font = '700 ' + Math.max(10, Math.round(H * 0.16)) + 'px Arial, sans-serif';
            ctx.fillText(spec.kicker, ix + margin, iy + H * 0.25, iw - 2 * margin);
          }
          let fontSize = H * (small ? 0.58 : 0.66);
          ctx.font = 'italic 900 ' + Math.max(12, Math.round(fontSize)) + 'px Arial, sans-serif';
          fontSize = Math.min(fontSize, (fontSize * (iw - 2 * margin)) / Math.max(1, ctx.measureText(spec.headline).width));
          ctx.font = 'italic 900 ' + Math.max(12, Math.round(fontSize)) + 'px Arial, sans-serif';
          ctx.fillText(spec.headline, ix + margin, iy + H * (small ? 0.84 : 0.73));
          ctx.restore();

          const u0 = (ix + 0.5) / AW;
          const u1 = (ix + iw - 0.5) / AW;
          const vTop = 1 - (iy + 0.5) / AH;
          const vBot = 1 - (iy + ih - 0.5) / AH;

          const planeGeo = new THREE.PlaneGeometry(spec.w, spec.ht);
          const uv = planeGeo.attributes.uv;
          uv.setXY(0, u0, vTop);
          uv.setXY(1, u1, vTop);
          uv.setXY(2, u0, vBot);
          uv.setXY(3, u1, vBot);

          signObj.position.copy(spec.p);
          signObj.rotation.set(0, spec.yaw, 0);
          if (spec.frontOffset) signObj.translateZ(spec.frontOffset);
          signObj.updateMatrix();
          planeGeo.applyMatrix4(signObj.matrix);
          signParts.push(planeGeo);
        }

        const mergedSigns = mergeGeometries(signParts);
        for (let i = 0; i < signParts.length; i++) signParts[i].dispose();
        const atlasTexture = new THREE.CanvasTexture(canvas);
        atlasTexture.colorSpace = THREE.SRGBColorSpace;
        atlasTexture.anisotropy = 8;
        const signMesh = new THREE.Mesh(
          mergedSigns,
          new THREE.MeshBasicMaterial({ map: atlasTexture, side: THREE.DoubleSide }),
        );
        signMesh.name = 'trackSigns';
        mergedSigns.computeBoundingSphere();
        trackGroup.add(signMesh);
      }
    }

    // All road chest and availability effects are one draw. Only a uniform changes every frame;
    // updateRanges upload individual instance data on hide/reveal, not all matrices.
    const pickupGeometry = makePickupGeometry();
    pickupStates = new THREE.InstancedBufferAttribute(new Float32Array(pickups.length * 2), 2).setUsage(THREE.DynamicDrawUsage);
    pickupGeometry.setAttribute('aPickupState', pickupStates);
    const pickupMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    applyPickupVertexShader(pickupMat, pickupUniforms);
    pickupMesh = new THREE.InstancedMesh(pickupGeometry, pickupMat, pickups.length);
    pickupMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    pickupMesh.name = 'pickupCrates';
    pickupPositions = pickups.map((item) => {
      core.sampleInto(item.s, item.x, sampleScratch, true);
      return { x: sampleScratch.position.x, y: sampleScratch.position.y, z: sampleScratch.position.z,
        yaw:Math.atan2(-sampleScratch.forward.x,-sampleScratch.forward.z) };
    });
    lastHidden = new Uint8Array(pickups.length);
    lastHidden.fill(255);
    for (const item of pickups) {
      trackShape('pillar', item.s, item.x, 0.05, 1.92, 0.12, 1.92, C.dark);
      trackShape('pillar', item.s, item.x, 0.105, 1.51, 0.07, 1.51, C.steel);
    }
    syncPickups(true);
    pickupMesh.computeBoundingSphere();
    if (pickupMesh.boundingSphere) pickupMesh.boundingSphere.radius += 3.5;
    trackGroup.add(pickupMesh);

    trackGroup.add(createCircuitSkyline(course.id));
    const cabins=mountainCabinSites(core);
    const reservedSites=cabins.map(site=>({...site,radius:Math.max(19,site.radius)}));
    const biome=buildCircuitBiome(core,{reservedSites});
    if(biome)trackGroup.add(biome);
    const finishScenery=original?buildTestTrackLandmarks(core):buildMountainCabins(core,cabins);
    if(finishScenery)trackGroup.add(finishScenery);

    if (original) {
      // Tarmac research campus: three low wind-tunnel/power annexes face the
      // outside of the circuit. All footprints explicitly clear every route leg.
      for(const [i,u,sign,offset] of [[0,.31,1,61],[2,.71,-1,72],[7,.53,1,73],[10,.24,-1,65]]){
        const s=at(i,u), f=frame(s), x=sign*(f.width*.5+offset);
        const pt=surface(f,x), footprint=25;
        if(!safeCampus(pt.x,pt.z,footprint)||roadGone(s))continue;
        const y=-6.36-pt.y;
        trackShape('bevel',s,x,y+.4,38,.8,33,0x677a73);
        trackShape('bevel',s,x,y+3.8,24,7.6,16,0x425d58);
        trackShape('box',s,x,y+8.26,25,.86,17.4,0x90b5a3);
        trackShape('bevel',s,x,y+9.58,11,2.3,12,0x375e62);
        trackShape('glaze',s,x,y+9.96,10.0,1.16,13.0,0x64a9a8);
        for(let k=-2;k<=2;k++){
          trackShape('box',s+k*2.7,x-sign*12.3,y+5.4,.46,2.0,2.30,C.dark);
          trackShape('glaze',s+k*2.7,x-sign*12.6,y+5.4,.23,1.53,1.94,0x70bac6);
          trackShape('box',s+k*2.7,x-sign*12.8,y+3.6,.19,.42,2.25,k%2?C.orange:C.mint);
        }
        for(const k of [-9.3,9.3]){
          trackShape('bevel',s+k,x+sign*6,y+6.8,6.0,13.6,5.0,0x4a706e);
          trackShape('pillar',s+k,x+sign*6,y+14.1,5.7,1.0,5.7,C.foam);
          trackShape('pillar',s+k,x+sign*6,y+11.3,6.05,.62,6.05,C.orange);
          trackShape('pillar',s+k,x+sign*6,y+15.3,.3,2,.3,C.fascia);
        }
        for(const k of [-1,1]){
          const z=s+12.85*k, f=frame(z), xb=x-sign*14;
          const attach=surface(f,xb), y0=-6.37-attach.y;
          beam(lp(f,xb,y0),lp(f,xb+sign*4.5,y0+4.6),.26,.28,C.dark);
          trackShape('glaze',z,xb+sign*4.5,y0+4.74,1.6,.33,.76,C.lime);
        }
      }
      for(let s=95;s<length;s+=107){
        const f=frame(s), sign=Math.sin(s*.012)>0?1:-1;
        const r=12+rand()*20, d=r*.71+rand()*12;
        const off=sign*(f.width*.5+Math.max(r,d)+26+rand()*49);
        const p=surface(f,off);
        if(!safeCampus(p.x,p.z,Math.max(r,d)+2))continue;
        p.y=-6.42;
        const h=4.8+rand()*11;
        bankLoft(p,r,d,h,rand()*TAU,s%2);
        for(let k=0;k<3;k++){
          const ang=rand()*TAU, dx=Math.cos(ang)*r*.34, dz=Math.sin(ang)*d*.34;
          const ht=4+rand()*5;
          world(k%2?'detail-tree':'detail-fir',p.x+dx,p.y+h*.51+ht*.56,p.z+dz,ht*.88,ht*1.12,ht*.84,0xffffff,ang);

        }
      }
      // Roadside verges form an amber/green vegetation rhythm visible from cockpit.
      for(let s=37;s<length;s+=47){
        const f=frame(s);
        if(f.center.y>24||roadGone(s))continue;
        for(const side of [-1,1]){
          const x=side*(f.width*.5+9.8+rand()*4.1);
          const p=surface(f,x);
          // Decorative grasses are tiny and below the actual retaining edge.
          if(f.center.y<12){
            p.y=-4.4+rand()*1.4;
            shape('detail-brush',p,3.2+rand()*4.4,1.5+rand()*1.9,3+rand()*5,side>0?0xffedcb:0xd4e7d3,rand()*TAU);
          }
        }
      }
      // Convert unlabeled blocks into dock workshops and utility systems.
      for(const [section,u,side] of [[0,.64,1],[1,.71,-1],[2,.23,1],[6,.86,1],[7,.47,1],[9,.30,1],[10,.81,-1]]){
        const f=frame(at(section,u));
        const heading=Math.atan2(-f.forward.x,-f.forward.z)-side*Math.PI*.5;
        for(let j=0;j<4;j++){
          const p=f.center.clone().addScaledVector(f.right,side*(61+13*j+rand()*18)).addScaledVector(f.forward,(j-1.5)*27);
          const w=12+rand()*7,d=13+rand()*9,h=j===2?11.5:7+rand()*5.5;
          if(!safeCampus(p.x,p.z,Math.max(w,d)*.64))continue;
          p.y=-6.4+h*.5;
          shape(j===2?'detail-tanks':j===1?'detail-cargo':'detail-workshop',p,w,h,d,j===1?0xf1bfa7:0xffffff,heading);
        }
      }
      // Tree canopies now sit on their own branching trunks; plant less,
      // at better-selected spots so off-camera geometry stays cheap.
      for(let i=0;i<112;i++){
        const s=rand()*length,f=frame(s);
        if(f.index===3||f.index===4)continue;
        const offset=(rand()>.5?-1:1)*(45+rand()*70),p=f.center.clone().addScaledVector(f.right,offset);
        const h=5+rand()*8,w=h*(i%3===0?.68:.8);
        if(!safeCampus(p.x,p.z,w+2))continue;
        p.y=-6.4+h*.5;
        shape(i%3===0?'detail-fir':'detail-tree',p,w,h,w,0xffffff,rand()*TAU);
      }
    } // Winter scenery and mountains are mounted by the biome layer.
    const pavementMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
    styleRoad(pavementMaterial);
    extraDisposables.push(pavementMaterial);
    for (const { positions, colors, coords } of surfaceTiles.values()) {
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
      g.setAttribute('aPavement',new THREE.Float32BufferAttribute(coords,3));
      g.computeVertexNormals(); g.computeBoundingSphere();
      const mesh=new THREE.Mesh(g,pavementMaterial);mesh.name='pavedCircuit';trackGroup.add(mesh);
    }
    for (const { kind, parts } of instances.values()) {
      const detail=kind.startsWith('detail-');
      let g=geo[kind];
      if(detail&&!g){
        g=geo[kind]=makeCircuitProp(kind.slice(7));
        extraDisposables.push(g);
      }
      const mesh = new THREE.InstancedMesh(g, detail?propMaterial:kind==='glaze'?windowMaterial:solid, parts.length);
      if(detail)mesh.name='Scenery prop '+kind.slice(7);
      parts.forEach(([matrix, hex], index) => {
        mesh.setMatrixAt(index, matrix);
        mesh.setColorAt(index, colorValue(hex));
      });
      mesh.computeBoundingSphere();
      trackGroup.add(mesh);
    }

    pickupUniforms.uTime.value = lastTime;
    syncFixtureVisuals(lastTime);
    syncPickups(false);
    skyVisuals = createSkyVisuals(trackGroup, core);
    skyVisuals.update(lastTime, lastLap);
  }

  // `lap` drives the track's moving parts and follows the race leader. The Sky Lane obstacle
  // course that is drawn belongs to one viewer: `setViewLap` names their lap, and until it is
  // called the drawn lap follows `lap` as well.
  //
  // `update` is the simulation's step and can run several times in one frame. By default it
  // also brings everything drawn up to date, which is what tools and tests expect. A game
  // loop that draws calls `setVisualsPerFrame(true)` once and `drawVisuals()` before each
  // render instead, so moving scenery is repositioned once per frame however many steps ran.
  function update(time = 0, dt = 0, playerS = 0, lap = 1) {
    lastTime = time;
    lastLap = viewLap ?? lap;
    core.update(time, dt, playerS, lap);
    if (!visualsMounted) return;
    if (visualsPerFrame) visualsStale = true;
    else syncVisuals();
  }

  function syncVisuals() {
    visualsStale = false;
    pickupUniforms.uTime.value = lastTime;
    syncFixtureVisuals(lastTime);
    syncPickups(false);
    skyVisuals?.update(lastTime, lastLap);
  }

  function setVisualsPerFrame(on) {
    visualsPerFrame = !!on;
  }

  function drawVisuals() {
    if (visualsMounted && visualsStale) syncVisuals();
  }

  function setViewLap(lap) {
    viewLap = lap;
    if (visualsPerFrame && lap != null && lap !== lastLap) {
      lastLap = lap;
      visualsStale = true;
    }
  }

  /** Hides the Boost Cells and item boxes the player has grabbed in a lane this lap. */
  function setSkyCollected(laneIndex, mask, boxMask = 0) {
    skyVisuals?.setCollected(laneIndex, mask, boxMask);
  }

  function reset() {
    lastTime = 0;
    viewLap = null;
    visualsStale = false;
    core.reset();
    if (!visualsMounted) return;
    pickupUniforms.uTime.value = 0;
    syncFixtureVisuals(0);
    syncPickups(true, false);
    skyVisuals?.setCollected(-1, 0);
    skyVisuals?.update(0, 1);
  }

  if (!deferVisuals) mountVisuals();
  reset();

  function dispose() {
    skyVisuals?.dispose();
    skyVisuals = null;
    const geometries = new Set();
    const materials = new Set();
    for (const item of extraDisposables) {
      if (item?.isBufferGeometry) geometries.add(item);
      else if (item?.isMaterial) materials.add(item);
    }
    trackGroup.traverse((obj) => {
      if (!obj.isMesh) return;
      geometries.add(obj.geometry);
      materials.add(obj.material);
      if (obj.isInstancedMesh) obj.dispose();
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) {
      material.map?.dispose();
      material.dispose();
    }
    trackGroup.removeFromParent();
  }

  return {
    id: course.id,
    name: course.name,
    trackGroup,
    dispose,
    mountVisuals,
    get visualsMounted() { return visualsMounted; },
    grid,
    length,
    sections,
    sample,
    sampleInto: core.sampleInto,
    heightAt: core.heightAt,
    mapXYAt: core.mapXYAt,
    widthAt: core.widthAt,
    edgeAt: core.edgeAt,
    dropAt: core.dropAt,
    pads,
    pickups,
    ramps,
    hazards,
    icePatches,
    distanceToIce: core.distanceToIce,
    wetPatches:core.wetPatches,
    wetAt:core.wetAt,
    distanceToWet:core.distanceToWet,
    switchTrigger,
    sky: core.sky,
    setSkyCollected,
    setViewLap,
    setVisualsPerFrame,
    drawVisuals,
    triggerSwitch: core.triggerSwitch,
    getFixtureState: core.getFixtureState,
    setFixtureState: core.setFixtureState,
    reset,
    update,
    mapPoints,
  };
}
