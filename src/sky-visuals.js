// Sky Lane scenery: the Sky Stream ribbon, corridor light posts, catapults and
// landing decks, Boost Cells, and each lap's obstacle course. Obstacle motion
// reads the same pure functions as the simulation, so what you see is what hits.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { bladeAngle, partPose } from './sim/sky.js';
import { createSkyChests } from './pickup-chest.js';
import { createSkyCrossingArt } from './sky-crossing-art.js';
import { makeCircuitProp } from './circuit-props.js';

const THEMES = {
  rig: { solid: 0xed9a59, trim: 0xf5e8c3, moving: 0xff6959, accent: 0x78f3f7, below: 0x6f9290, texture:'rig' },
  rock: { solid: 0x537997, trim: 0x8bbdd9, moving: 0xdb814b, accent: 0x96eaff, below: 0xb6d2e6, texture:'snow' },
  crane: { solid: 0x616979, trim: 0xa48b75, moving: 0xdd6b4b, accent: 0xacffd7, below: 0x746c5f, texture:'summit' },
};
const CELL_COLOR = 0x6ff6ff;
const MEGA_COLOR = 0xffd34a;

// A cut rather than round gem: crown, bevel and broad center faces stay
// readable against the horizon while the emissive material catches light.
function boostCrystal(){
 const n=6,profile=[[0,-1],[.51,-.58],[.78,-.27],[.78,.26],[.51,.62],[0,1]];
 const pos=[],tone=[],u=new THREE.Color();
 const bands=[.77,.93,.85,1,.88,.99];
 const point=(r,y,x)=>[Math.cos(x*Math.PI/3)*r,y,Math.sin(x*Math.PI/3)*r];
 function push(a,b,c,shade){
  pos.push(...a,...b,...c);
  u.setRGB(shade,shade,shade);
  for(let i=0;i<3;i++)tone.push(u.r,u.g,u.b);
 }
 for(let i=0;i<profile.length-1;i++)for(let j=0;j<n;j++){
  const [r0,y0]=profile[i],[r1,y1]=profile[i+1],a=point(r0,y0,j),b=point(r0,y0,j+1),c=point(r1,y1,j+1),d=point(r1,y1,j);
  const g=bands[(i+j)%n];
  if(r0>0)push(a,d,b,g);
  if(r1>0)push(d,c,b,Math.min(1,g+.065));
 }
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
 g.setAttribute('color',new THREE.Float32BufferAttribute(tone,3));g.computeVertexNormals();
 return g;
}

export function createSkyVisuals(group, core) {
  const sky = core.sky;
  if (!sky || !sky.lanes.length) return { update() {}, setCollected() {}, dispose() {} };
  const theme = THEMES[sky.theme] ?? THEMES.rig;
  const root = new THREE.Group();
  root.name = 'sky-lanes';
  group.add(root);
  const disposables = [];
  const keep = (item) => {
    disposables.push(item);
    return item;
  };

  const frame = {
    centerX: 0, centerY: 0, centerZ: 0, forwardX: 0, forwardY: 0, forwardZ: 1,
    rightX: 1, rightZ: 0, curvature: 0, bank: 0, width: 16, index: 0, u: 0, distance: 0, grade: 0,
  };
  // World position of a lane point: physics y is height above the centre line.
  function lanePoint(s, x, y, out = new THREE.Vector3()) {
    core.evalFrame(s, frame);
    out.set(frame.centerX + frame.rightX * x, core.heightAt(s, 0) + y, frame.centerZ + frame.rightZ * x);
    return out;
  }
  function laneYaw(s) {
    core.evalFrame(s, frame);
    return Math.atan2(-frame.forwardX, -frame.forwardZ);
  }
  function place(obj, s, x, y) {
    lanePoint(s, x, y, obj.position);
    obj.rotation.set(0, laneYaw(s), 0, 'YXZ');
    return obj;
  }

  const geo = {
    box: keep(new THREE.BoxGeometry(1, 1, 1)),
    cell: keep(boostCrystal()),
    structure: keep(new RoundedBoxGeometry(1,1,1,1,.024)),
    halo: keep(new THREE.TorusGeometry(1.55, 0.09, 6, 28)),
  };
  const mat = {
    solid: keep(new THREE.MeshLambertMaterial({ color: theme.solid, flatShading: true })),
    trim: keep(new THREE.MeshLambertMaterial({ color: theme.trim, flatShading: true })),
    moving: keep(new THREE.MeshLambertMaterial({ color: theme.moving, flatShading: true, emissive: theme.moving, emissiveIntensity: 0.18 })),
    post: keep(new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.55 })),
    warn: keep(new THREE.MeshBasicMaterial({ color: 0xffa23a, transparent: true, opacity: 0.75 })),
    crossingWarn: keep(new THREE.MeshBasicMaterial({color:0xffc36a,transparent:true,opacity:.80,depthWrite:false})),
    cell: keep(new THREE.MeshStandardMaterial({ color: CELL_COLOR,emissive:0x1bb4d5,emissiveIntensity:.55,roughness:.35,metalness:.19,vertexColors:true,side:THREE.DoubleSide })),
    cellHalo: keep(new THREE.MeshBasicMaterial({ color: CELL_COLOR, transparent: true, opacity: 0.55, depthWrite: false })),
    mega: keep(new THREE.MeshStandardMaterial({ color: MEGA_COLOR,emissive:0xec7617,emissiveIntensity:.52,roughness:.35,metalness:.17,vertexColors:true,side:THREE.DoubleSide })),
    megaHalo: keep(new THREE.MeshBasicMaterial({ color: MEGA_COLOR, transparent: true, opacity: 0.6, depthWrite: false })),
    deck: keep(new THREE.MeshLambertMaterial({ color: 0x3e4552, flatShading: true })),
    stripe: keep(new THREE.MeshBasicMaterial({ color: 0xf3efd9 })),
    chevron: keep(new THREE.MeshBasicMaterial({ color: theme.accent })),
    closed: keep(new THREE.MeshLambertMaterial({ color: 0xe0503c, emissive: 0x6a1a10 })),
    below: keep(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.76,metalness:.04})),
  };

  // Canvas textures where a DOM exists; a plain white texel in headless checks.
  function paintedTexture(width, height, paint) {
    const canvas = globalThis.document?.createElement?.('canvas');
    const ctx = canvas?.getContext?.('2d');
    if (!ctx) {
      const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
      texture.needsUpdate = true;
      return keep(texture);
    }
    canvas.width = width;
    canvas.height = height;
    paint(ctx);
    return keep(new THREE.CanvasTexture(canvas));
  }

  // Detailed surface paint preserves the old collision silhouettes. Broad seams
  // read at speed; fine chips and stone/frost striations resolve up close.
  const livery=paintedTexture(384,384,(g)=>{
    const wash=g.createLinearGradient(0,0,0,384);
    wash.addColorStop(0,'#f8f8f8');wash.addColorStop(.55,'#dce1e4');wash.addColorStop(1,'#9ea9ae');
    g.fillStyle=wash;g.fillRect(0,0,384,384);
    g.fillStyle='rgba(44,55,63,.26)';
    for(const x of [18,191,365])g.fillRect(x,0,4,384);
    for(const y of [36,349])g.fillRect(0,y,384,5);
    let salt=theme.texture==='rig'?2:theme.texture==='snow'?736:1879;
    function prng(){salt=(1664525*salt+1013904223)>>>0;return salt/4294967296}
    for(let i=0;i<780;i++){
      const x=prng()*384,y=prng()*384,d=prng();
      g.fillStyle=d>.64?'rgba(255,255,255,.22)':'rgba(27,43,58,.11)';
      g.fillRect(x,y,d*(theme.texture==='summit'?29:14)+1,d*2+1);
    }
    for(const x of [25,184,200,354])for(const y of [25,190,359]){
      g.fillStyle='#6d7a87';g.fillRect(x-3,y-3,6,6);
      g.fillStyle='#f7f9fa';g.fillRect(x-3,y-3,3,2);
    }
    if(theme.texture==='rig'){
      g.fillStyle='rgba(255,255,255,.36)';g.fillRect(0,286,384,14);g.fillRect(0,305,384,3);
    }else if(theme.texture==='snow'){
      g.fillStyle='rgba(243,252,255,.43)';g.fillRect(0,0,384,17);
      for(let i=0;i<65;i++)g.fillRect(prng()*384,prng()*28,prng()*12+2,prng()*11+2);
    }else{
      g.fillStyle='rgba(90,68,58,.15)';
      for(const y of [79,113,201,237,278,325])g.fillRect(0,y,384,3);
    }
  });
  livery.colorSpace=THREE.SRGBColorSpace;
  livery.anisotropy=4;
  for(const m of [mat.solid,mat.trim,mat.moving,mat.deck,mat.closed]){m.map=livery;m.needsUpdate=true;}

  // Scrolling stream texture: soft chevrons that race forward along the lane.
  const streamTexture = paintedTexture(128, 512, (g) => {
    const grad = g.createLinearGradient(0, 0, 128, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      const y = i * 128;
      g.moveTo(0, y + 80);
      g.lineTo(64, y + 20);
      g.lineTo(128, y + 80);
      g.lineTo(128, y + 112);
      g.lineTo(64, y + 52);
      g.lineTo(0, y + 112);
      g.closePath();
      g.fill();
    }
  });
  streamTexture.wrapS = THREE.RepeatWrapping;
  streamTexture.wrapT = THREE.RepeatWrapping;
  const streamMaterial = keep(new THREE.MeshBasicMaterial({
    color: theme.accent, map: streamTexture, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));

  // A soft additive glow so Boost Cells read from the far end of a straight.
  const glowTexture = paintedTexture(64, 64, (gg) => {
    const radial = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
    radial.addColorStop(0, 'rgba(255,255,255,0.95)');
    radial.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    radial.addColorStop(1, 'rgba(255,255,255,0)');
    gg.fillStyle = radial;
    gg.fillRect(0, 0, 64, 64);
  });
  const glowQuad = keep(new THREE.PlaneGeometry(1, 1));
  const glowMaterial = (color) => keep(new THREE.MeshBasicMaterial({ map: glowTexture, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));

  const lanes = [];
  const dummy = new THREE.Object3D();
  const vec = new THREE.Vector3();

  function ribbon(lane, y, halfWidth) {
    const step = 4;
    const count = Math.ceil((lane.end - lane.start) / step) + 1;
    const positions = new Float32Array(count * 2 * 3);
    const uvs = new Float32Array(count * 2 * 2);
    const index = [];
    for (let i = 0; i < count; i++) {
      const s = Math.min(lane.end, lane.start + i * step);
      for (let side = 0; side < 2; side++) {
        lanePoint(s, side ? halfWidth : -halfWidth, y, vec);
        positions.set([vec.x, vec.y, vec.z], (i * 2 + side) * 3);
        uvs.set([side, (s - lane.start) / 24], (i * 2 + side) * 2);
      }
      if (i) index.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2);
    }
    const geometry = keep(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(index);
    return geometry;
  }

  // Boxes that never move are not scene objects of their own. They are collected per parent,
  // shape, material and stretch of lane, and each collection is drawn as one instanced mesh
  // (see flushBoxes). Splitting by stretch keeps off-screen parts of a long lane culled.
  const BOX_STRETCH = 160;
  const boxBatches = new Map();
  function boxAt(parent, material, s, x, y, w, h, d) {
    const geometry = material.map===livery?geo.structure:geo.box;
    const key = parent.id + ':' + geometry.id + ':' + material.id + ':' + Math.floor(s / BOX_STRETCH);
    let batch = boxBatches.get(key);
    if (!batch) boxBatches.set(key, batch = { parent, geometry, material, matrices: [] });
    place(dummy, s, x, y);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    batch.matrices.push(dummy.matrix.clone());
  }
  /** A box that is shown, hidden or moved on its own: a mesh, as before. */
  function looseBoxAt(parent, material, s, x, y, w, h, d) {
    const mesh = new THREE.Mesh(material.map===livery?geo.structure:geo.box, material);
    place(mesh, s, x, y);
    mesh.scale.set(w, h, d);
    parent.add(mesh);
    return mesh;
  }
  function flushBoxes() {
    for (const { parent, geometry, material, matrices } of boxBatches.values()) {
      const mesh = keep(new THREE.InstancedMesh(geometry, material, matrices.length));
      mesh.name = 'Sky Lane boxes';
      for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i]);
      mesh.computeBoundingSphere();
      parent.add(mesh);
    }
    boxBatches.clear();
  }

  // Boost Cell glows face the camera like sprites, but all of one lap's glows are one
  // instanced mesh: the vertex shader takes each instance's place and size from its matrix
  // and spreads the quad in view space.
  function glowBillboard(material) {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
        mvPosition.xy += transformed.xy * vec2( length( instanceMatrix[ 0 ].xyz ), length( instanceMatrix[ 1 ].xyz ) );
        gl_Position = projectionMatrix * mvPosition;`);
    };
    material.customProgramCacheKey = () => 'sky-cell-glow-billboard';
    return material;
  }
  const cellQuat = new THREE.Quaternion();
  const cellSpin = new THREE.Quaternion();
  const cellScale = new THREE.Vector3();
  const cellPosition = new THREE.Vector3();
  const cellMatrix = new THREE.Matrix4();
  const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  const UP = new THREE.Vector3(0, 1, 0);

  const glowCell = glowBillboard(glowMaterial(CELL_COLOR));
  const glowMega = glowBillboard(glowMaterial(MEGA_COLOR));

  /** Spins and bobs one lap's cells; a collected cell shrinks to nothing. */
  function poseCells(cells, time, collected) {
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const { gems, halos, auras } = c.kind;
      const visible = !(collected & (1 << c.cell.index));
      if (!visible) {
        if (c.shown !== false) {
          gems.setMatrixAt(c.slot, hiddenMatrix);
          halos.setMatrixAt(c.slot, hiddenMatrix);
          auras.setMatrixAt(c.slot, hiddenMatrix);
          c.shown = false;
        }
        continue;
      }
      c.shown = true;
      cellPosition.copy(c.position);
      cellPosition.y += Math.sin(time * 3 + i) * 0.25;
      cellQuat.copy(c.quaternion).multiply(cellSpin.setFromAxisAngle(UP, time * 2.4 + i));
      gems.setMatrixAt(c.slot, cellMatrix.compose(cellPosition, cellQuat, cellScale.setScalar(c.size)));
      cellQuat.copy(c.quaternion).multiply(cellSpin.setFromAxisAngle(UP, time * 1.3));
      halos.setMatrixAt(c.slot, cellMatrix.compose(cellPosition, cellQuat, cellScale.setScalar(c.size * 0.9)));
      auras.setMatrixAt(c.slot, cellMatrix.compose(cellPosition, c.quaternion, cellScale.setScalar(c.size * 5.5)));
    }
  }

  for (const lane of sky.lanes) {
    const laneGroup = new THREE.Group();
    root.add(laneGroup);
    const half = lane.width / 2;
    const mid = (lane.floor + lane.ceiling) / 2;

    // Sky Stream: a glowing current along the corridor floor, plus a faint
    // twin overhead so the corridor reads from any height.
    const stream = new THREE.Mesh(ribbon(lane, lane.floor - 0.6, half * 0.42), streamMaterial);
    stream.frustumCulled = false;
    laneGroup.add(stream);

    // Corridor light posts mark both walls every 45 m.
    const postCount = Math.ceil((lane.end - lane.start) / 45) * 2;
    const posts = keep(new THREE.InstancedMesh(geo.box, mat.post, postCount));
    let p = 0;
    for (let s = lane.start; s < lane.end && p < postCount; s += 45) {
      for (const side of [-1, 1]) {
        place(dummy, s, side * (half + 0.4), mid);
        dummy.scale.set(0.35, lane.ceiling - lane.floor, 0.35);
        dummy.updateMatrix();
        posts.setMatrixAt(p++, dummy.matrix);
      }
    }
    posts.count = p;
    posts.frustumCulled = false;
    laneGroup.add(posts);

    // Course-specific utility outposts are recognizable from both chase and
    // aerial cameras. Place well outside every route leg, not just this lane.
    if(!lane.optional){
      const kits=theme.texture==='snow'?['snow-relay','snow-station']:
        theme.texture==='summit'?['alpine-relay','timber-station']:['tanks','workshop','alpine-relay'];
      const placements=new Map();
      let index=0;
      for(let s=lane.start+78;s<lane.end-65;s+=86){
        const phase=Math.sin(s*18.947)*913.151,t=phase-Math.floor(phase),side=index++%2?1:-1;
        const kind=kits[index%kits.length],tower=kind.endsWith('relay');
        const w=tower?7.8:13+t*4,d=tower?8.1:15+t*5,h=tower?27+t*10:7.2+t*5;
        const x=side*(half+29+t*16);
        lanePoint(s,x,0,vec);
        if(core.nodes.some((n,i)=>i%5===0&&Math.hypot(n.p.x-vec.x,n.p.z-vec.z)<36+Math.max(w,d)*.57))continue;
        dummy.position.set(vec.x,-6.4+h*.5,vec.z);
        dummy.rotation.set(0,laneYaw(s)-side*Math.PI*.5,0);
        dummy.scale.set(w,h,d);dummy.updateMatrix();
        if(!placements.has(kind))placements.set(kind,[]);
        placements.get(kind).push(dummy.matrix.clone());
      }
      for(const [kind,matrices] of placements){
        const props=keep(new THREE.InstancedMesh(keep(makeCircuitProp(kind)),mat.below,matrices.length));
        props.name='Sky Lane support scenery '+kind;
        matrices.forEach((m,i)=>props.setMatrixAt(i,m));
        props.computeBoundingSphere();laneGroup.add(props);
      }
    }

    // Catapult: chevrons on the approach, a launch lip and an arch of light.
    const entryX = lane.optional ? (lane.entry[0] + lane.entry[1]) / 2 : 0;
    const entryHalf = lane.optional ? (lane.entry[1] - lane.entry[0]) / 2 : core.widthAt(lane.start) / 2 - 0.6;
    for (let i = 0; i < 5; i++) {
      boxAt(laneGroup, mat.chevron, lane.start - 28 + i * 5.5, entryX, 0.14, entryHalf * 1.6, 0.08, 1.1);
    }
    boxAt(laneGroup, mat.stripe, lane.start - 0.6, entryX, 0.35, entryHalf * 2, 0.7, 1.2);
    const archHeight = lane.optional ? lane.floor + 3 : 9;
    for (const side of [-1, 1]) {
      boxAt(laneGroup, mat.trim, lane.start - 2, entryX + side * (entryHalf + 0.8), archHeight / 2, 0.8, archHeight, 0.8);
    }
    boxAt(laneGroup, mat.post, lane.start - 2, entryX, archHeight, entryHalf * 2 + 2.4, 0.5, 0.8);
    let gateBarrier = null;
    if (lane.optional) {
      gateBarrier = looseBoxAt(laneGroup, mat.closed, lane.start - 2, entryX, 1.4, entryHalf * 2, 2.6, 0.4);
    } else {
      // The road falls away at the lip and the landing deck rises out of the drop.
      boxAt(laneGroup, mat.deck, lane.start + 0.6, 0, -7, core.widthAt(lane.start), 14, 1.2);
      boxAt(laneGroup, mat.deck, lane.end - 0.6, 0, -7, core.widthAt(lane.end), 14, 1.2);
      boxAt(laneGroup, mat.chevron, lane.end + 0.4, 0, 0.12, core.widthAt(lane.end) - 1, 0.1, 0.8);
      for (let d = 10; d <= 60; d += 10) {
        boxAt(laneGroup, mat.stripe, lane.end + d, 0, 0.1, core.widthAt(lane.end + d) * 0.6, 0.06, 0.45);
      }
    }

    // One obstacle course and cell set per lap; only the player's lap shows.
    const laps = lane.layouts.map((layout) => {
      const lapGroup = new THREE.Group();
      lapGroup.visible = false;
      laneGroup.add(lapGroup);
      const moving = [];
      for (const ob of layout.obstacles) {
        // A warning gate frames the corridor about 1.2 s ahead of each cluster.
        const crossing=ob.type==='crossing';
        const warnS = crossing?ob.warn:ob.s-8;
        const warn= crossing?mat.crossingWarn:mat.warn;
        boxAt(lapGroup, warn, warnS, 0, lane.floor + 0.2, lane.width, 0.3, 0.3);
        boxAt(lapGroup, warn, warnS, 0, lane.ceiling - 0.2, lane.width, 0.3, 0.3);
        for (const side of [-1, 1]){
          boxAt(lapGroup,warn,warnS,side*half,mid,crossing?.5:.3,lane.ceiling-lane.floor,.3);
          if(crossing)for(let i=0;i<3;i++)boxAt(lapGroup,warn,warnS+1.7,side*(half-.55),mid-2+i*2,1.3,.35,.35);
        }
        for (const part of ob.parts) {
          if(part.crossing){
            const art=createSkyCrossingArt(part.crossing);
            keep({dispose:()=>art.userData.disposeCrossing?.()});
            lapGroup.add(art);
            moving.push({part,mesh:art,crossing:true});
            continue;
          }
          if (part.shape === 'blade') {
            const hub = new THREE.Group();
            place(hub, part.s, part.cx, part.cy);
            const pivot = new THREE.Group();
            hub.add(pivot);
            const blade = new THREE.Mesh(geo.structure, mat.moving);
            blade.scale.set(part.length, part.width * 2, part.hs * 2);
            blade.position.x = part.length / 2;
            pivot.add(blade);
            lapGroup.add(hub);
            moving.push({ part, pivot });
            continue;
          }
          const material = part.motion || part.shape === 'door' ? mat.moving : ob.type === 'split' && part.hx > half ? mat.trim : mat.solid;
          const pose = partPose(part, 0);
          if (!part.motion && part.shape !== 'door' && pose.hs > 6) {
            // Long static parts follow the corridor's curve in short sections.
            const pieces = Math.ceil((pose.hs * 2) / 8);
            for (let i = 0; i < pieces; i++) {
              const s = pose.s - pose.hs + ((i + 0.5) * pose.hs * 2) / pieces;
              boxAt(lapGroup, material, s, pose.x, pose.y, pose.hx * 2, pose.hy * 2, (pose.hs * 2) / pieces + 0.3);
            }
            continue;
          }
          if (part.motion || part.shape === 'door') {
            const mesh = new THREE.Mesh(geo.structure, material);
            place(mesh, pose.s, pose.x, pose.y);
            mesh.scale.set(pose.hx * 2, pose.hy * 2, pose.hs * 2);
            lapGroup.add(mesh);
            moving.push({ part, mesh });
          } else {
            boxAt(lapGroup, material, pose.s, pose.x, pose.y, pose.hx * 2, pose.hy * 2, pose.hs * 2);
          }
        }
      }
      // Every cell is a crystal, a ring and a glow. A lap's cells of one kind share three
      // instanced meshes, so a corridor of cells is six draw calls instead of three per cell.
      const kinds = [false, true].map((mega) => {
        const count = layout.cells.filter((cell) => !!cell.mega === mega).length;
        if (!count) return null;
        const gems = keep(new THREE.InstancedMesh(geo.cell, mega ? mat.mega : mat.cell, count));
        const halos = keep(new THREE.InstancedMesh(geo.halo, mega ? mat.megaHalo : mat.cellHalo, count));
        const auras = keep(new THREE.InstancedMesh(glowQuad, mega ? glowMega : glowCell, count));
        gems.name = 'Sky Lane boost cells';
        halos.name = 'Sky Lane boost cell rings';
        auras.name = 'Sky Lane boost cell glows';
        lapGroup.add(gems, halos, auras);
        return { gems, halos, auras, used: 0 };
      });
      const cells = layout.cells.map((cell, order) => {
        place(dummy, cell.s, cell.x, cell.y);
        const kind = kinds[cell.mega ? 1 : 0];
        return {
          cell, order, kind, slot: kind.used++, size: cell.mega ? 2 : 1.3,
          position: dummy.position.clone(), quaternion: dummy.quaternion.clone(), shown: null,
        };
      });
      poseCells(cells, 0, 0);
      for (const kind of kinds) {
        if (!kind) continue;
        for (const mesh of [kind.gems, kind.halos, kind.auras]) mesh.computeBoundingSphere();
      }
      const entries=(layout.boxes || []).map(box=>({
        index:box.index,position:lanePoint(box.s,box.x,box.y),yaw:laneYaw(box.s),
      }));
      const chests=entries.length?createSkyChests(entries):null;
      if(chests){
        keep(chests.mesh);
        keep(chests.mesh.geometry);
        keep(chests.mesh.material);
        lapGroup.add(chests.mesh);
      }
      return { group: lapGroup, moving, cells, kinds, chests };
    });
    lanes.push({ lane, laps, gateBarrier, collected: 0, boxesTaken: 0, lapShown: -1 });
  }
  flushBoxes();

  function update(time, lap) {
    streamTexture.offset.y = -time * 2.6;
    const shown = Math.max(1, Math.min(3, lap)) - 1;
    for (const entry of lanes) {
      const changedLap=entry.lapShown!==shown;
      if (changedLap) {
        entry.laps.forEach((l, i) => { l.group.visible = i === shown; });
        entry.lapShown = shown;
      }
      if (entry.gateBarrier) entry.gateBarrier.visible = lap < entry.lane.openLap;
      const view = entry.laps[shown];
      for (const m of view.moving) {
        if (m.pivot) {
          m.pivot.rotation.z = bladeAngle(m.part, time);
          continue;
        }
        const pose = partPose(m.part, time);
        place(m.mesh, pose.s, pose.x, pose.y);
        m.mesh.scale.set(pose.hx * 2, pose.hy * 2, pose.hs * 2);
        if(m.crossing){
          const motion=m.part.motion,direction=Math.cos(motion.w*time+motion.ph)>=0?1:-1;
          if(direction<0)m.mesh.rotation.y+=Math.PI;
          m.mesh.userData.animateCrossing?.(time,direction);
        }
      }
      poseCells(view.cells, time, entry.collected);
      for (const kind of view.kinds) {
        if (!kind) continue;
        kind.gems.instanceMatrix.needsUpdate = true;
        kind.halos.instanceMatrix.needsUpdate = true;
        kind.auras.instanceMatrix.needsUpdate = true;
      }
      view.chests?.update(time,entry.boxesTaken,{silent:changedLap});
    }
  }

  /** Hides the cells and item boxes the player has already grabbed in `laneIndex` this lap. */
  function setCollected(laneIndex, mask, boxMask = 0) {
    for (const entry of lanes) {
      const mine = entry.lane.index === laneIndex;
      entry.collected = mine ? mask : 0;
      entry.boxesTaken = mine ? boxMask : 0;
    }
  }

  function dispose() {
    for (const item of disposables) item.dispose?.();
    root.removeFromParent();
  }

  return { update, setCollected, dispose };
}
