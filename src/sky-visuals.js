// Sky Lane scenery: the Sky Stream ribbon, corridor light posts, catapults and
// landing decks, Boost Cells, and each lap's obstacle course. Obstacle motion
// reads the same pure functions as the simulation, so what you see is what hits.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { bladeAngle, partPose } from './sim/sky.js';
import { itemModel } from './item-art.js';
import { createSkyCrossingArt } from './sky-crossing-art.js';

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
    scenery: keep(theme.texture==='rig'?new THREE.BoxGeometry(1,1,1):new THREE.IcosahedronGeometry(0.70,1)),
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
    below: keep(new THREE.MeshLambertMaterial({ color: theme.below, flatShading: true })),
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
  const glow = {
    cell: keep(new THREE.SpriteMaterial({ map: glowTexture, color: CELL_COLOR, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })),
    mega: keep(new THREE.SpriteMaterial({ map: glowTexture, color: MEGA_COLOR, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })),
  };

  // Floating item boxes reuse the road's item crate, without its ground animation.
  const crate = itemModel('pickup');
  const crateGeometry = keep(crate.geometry.clone());
  const crateMaterial = keep(crate.material.clone());
  const boxGlow = keep(new THREE.SpriteMaterial({ map: glowTexture, color: 0xffd0f4, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));

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

  function boxAt(parent, material, s, x, y, w, h, d) {
    const mesh = new THREE.Mesh(material.map===livery?geo.structure:geo.box, material);
    place(mesh, s, x, y);
    mesh.scale.set(w, h, d);
    parent.add(mesh);
    return mesh;
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

    // Scenery far below gives the speed something to rush past.
    if (!lane.optional) {
      const props = keep(new THREE.InstancedMesh(geo.scenery, mat.below, 80));
      let n = 0;
      for (let s = lane.start; s < lane.end && n < 80; s += 20) {
        const r = Math.sin(s * 12.9898) * 43758.5453;
        const u = r - Math.floor(r);
        const side = u > 0.5 ? 1 : -1;
        const x = side * (half + 6 + u * 40);
        lanePoint(s, x, 0, vec);
        const h = (theme.texture==='rig'?6:3) + u * (theme.texture==='rig'?22:10);
        dummy.position.set(vec.x, -6.4 + h / 2, vec.z);
        dummy.rotation.set(0, laneYaw(s) + u, 0);
        const girth=theme.texture==='rig'?4+u*8:7+u*15;
        dummy.scale.set(girth, h, girth);
        dummy.updateMatrix();
        props.setMatrixAt(n++, dummy.matrix);
      }
      props.count = n;
      laneGroup.add(props);
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
      gateBarrier = boxAt(laneGroup, mat.closed, lane.start - 2, entryX, 1.4, entryHalf * 2, 2.6, 0.4);
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
          const mesh = new THREE.Mesh(geo.structure, material);
          place(mesh, pose.s, pose.x, pose.y);
          mesh.scale.set(pose.hx * 2, pose.hy * 2, pose.hs * 2);
          lapGroup.add(mesh);
          if (part.motion || part.shape === 'door') moving.push({ part, mesh });
        }
      }
      const cells = layout.cells.map((cell) => {
        const holder = new THREE.Group();
        place(holder, cell.s, cell.x, cell.y);
        const size = cell.mega ? 2 : 1.3;
        const gem = new THREE.Mesh(geo.cell, cell.mega ? mat.mega : mat.cell);
        gem.scale.setScalar(size);
        const halo = new THREE.Mesh(geo.halo, cell.mega ? mat.megaHalo : mat.cellHalo);
        halo.scale.setScalar(size * 0.9);
        const aura = new THREE.Sprite(cell.mega ? glow.mega : glow.cell);
        aura.scale.setScalar(size * 5.5);
        holder.add(gem, halo, aura);
        lapGroup.add(holder);
        return { cell, holder, gem, halo, baseY: holder.position.y };
      });
      const boxes = (layout.boxes || []).map((box) => {
        const holder = new THREE.Group();
        place(holder, box.s, box.x, box.y);
        const mesh = new THREE.Mesh(crateGeometry, crateMaterial);
        mesh.scale.setScalar(1.7);
        const aura = new THREE.Sprite(boxGlow);
        aura.scale.setScalar(6);
        holder.add(mesh, aura);
        lapGroup.add(holder);
        return { box, holder, mesh, baseY: holder.position.y };
      });
      return { group: lapGroup, moving, cells, boxes };
    });
    lanes.push({ lane, laps, gateBarrier, collected: 0, boxesTaken: 0, lapShown: -1 });
  }

  function update(time, lap) {
    streamTexture.offset.y = -time * 2.6;
    const shown = Math.max(1, Math.min(3, lap)) - 1;
    for (const entry of lanes) {
      if (entry.lapShown !== shown) {
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
      for (let i = 0; i < view.cells.length; i++) {
        const c = view.cells[i];
        const visible = !(entry.collected & (1 << c.cell.index));
        c.holder.visible = visible;
        if (!visible) continue;
        c.gem.rotation.y = time * 2.4 + i;
        c.halo.rotation.y = time * 1.3;
        c.holder.position.y = c.baseY + Math.sin(time * 3 + i) * 0.25;
      }
      for (let i = 0; i < view.boxes.length; i++) {
        const b = view.boxes[i];
        const visible = !(entry.boxesTaken & (1 << b.box.index));
        b.holder.visible = visible;
        if (!visible) continue;
        b.mesh.rotation.set(time * 0.9 + i, time * 1.7 + i, 0);
        b.holder.position.y = b.baseY + Math.sin(time * 2.2 + i) * 0.35;
      }
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
