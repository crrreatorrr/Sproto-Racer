// Sky Lane scenery: the Sky Stream ribbon, corridor light posts, catapults and
// landing decks, Boost Cells, and each lap's obstacle course. Obstacle motion
// reads the same pure functions as the simulation, so what you see is what hits.

import * as THREE from 'three';
import { bladeAngle, partPose } from './sim/sky.js';
import { itemModel } from './item-art.js';

const THEMES = {
  rig: { solid: 0xff8f4a, trim: 0xf3efd9, moving: 0xff5d6c, accent: 0x7defff, below: 0xc7b9a0 },
  rock: { solid: 0x8a7663, trim: 0xb8a68b, moving: 0x6f5d4f, accent: 0xa5f2ff, below: 0x9c8b75 },
  crane: { solid: 0xf5b147, trim: 0x71838a, moving: 0xe86241, accent: 0x9dffb0, below: 0x6e7c82 },
};
const CELL_COLOR = 0x6ff6ff;
const MEGA_COLOR = 0xffd34a;

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
    cell: keep(new THREE.OctahedronGeometry(1, 0)),
    halo: keep(new THREE.TorusGeometry(1.55, 0.09, 6, 28)),
  };
  const mat = {
    solid: keep(new THREE.MeshLambertMaterial({ color: theme.solid, flatShading: true })),
    trim: keep(new THREE.MeshLambertMaterial({ color: theme.trim, flatShading: true })),
    moving: keep(new THREE.MeshLambertMaterial({ color: theme.moving, flatShading: true, emissive: theme.moving, emissiveIntensity: 0.18 })),
    post: keep(new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.55 })),
    warn: keep(new THREE.MeshBasicMaterial({ color: 0xffa23a, transparent: true, opacity: 0.75 })),
    cell: keep(new THREE.MeshBasicMaterial({ color: CELL_COLOR })),
    cellHalo: keep(new THREE.MeshBasicMaterial({ color: CELL_COLOR, transparent: true, opacity: 0.55, depthWrite: false })),
    mega: keep(new THREE.MeshBasicMaterial({ color: MEGA_COLOR })),
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

  // Scrolling stream texture: soft chevrons that race forward along the lane.
  const streamTexture = paintedTexture(64, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      const y = i * 64;
      g.moveTo(0, y + 40);
      g.lineTo(32, y + 10);
      g.lineTo(64, y + 40);
      g.lineTo(64, y + 56);
      g.lineTo(32, y + 26);
      g.lineTo(0, y + 56);
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
    const step = 6;
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
    const mesh = new THREE.Mesh(geo.box, material);
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
      const props = keep(new THREE.InstancedMesh(geo.box, mat.below, 80));
      let n = 0;
      for (let s = lane.start; s < lane.end && n < 80; s += 20) {
        const r = Math.sin(s * 12.9898) * 43758.5453;
        const u = r - Math.floor(r);
        const side = u > 0.5 ? 1 : -1;
        const x = side * (half + 6 + u * 40);
        lanePoint(s, x, 0, vec);
        const h = 6 + u * 22;
        dummy.position.set(vec.x, -6.4 + h / 2, vec.z);
        dummy.rotation.set(0, laneYaw(s) + u, 0);
        dummy.scale.set(4 + u * 8, h, 4 + u * 8);
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
        const warnS = ob.s - 8;
        boxAt(lapGroup, mat.warn, warnS, 0, lane.floor + 0.2, lane.width, 0.3, 0.3);
        boxAt(lapGroup, mat.warn, warnS, 0, lane.ceiling - 0.2, lane.width, 0.3, 0.3);
        for (const side of [-1, 1]) boxAt(lapGroup, mat.warn, warnS, side * half, mid, 0.3, lane.ceiling - lane.floor, 0.3);
        for (const part of ob.parts) {
          if (part.shape === 'blade') {
            const hub = new THREE.Group();
            place(hub, part.s, part.cx, part.cy);
            const pivot = new THREE.Group();
            hub.add(pivot);
            const blade = new THREE.Mesh(geo.box, mat.moving);
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
          const mesh = new THREE.Mesh(geo.box, material);
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
