import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CIRCUITS } from './circuits.js';
import { itemModel } from './item-art.js';
import { createTrackCore, createTrackSample } from './sim/track-core.js';
import { createSkyVisuals } from './sky-visuals.js';

const TAU = Math.PI * 2;
const mix = THREE.MathUtils.lerp;
const defaultColors = {
  tarmac: 0x48535d, shoulder: 0x36434b, asphaltEdge: 0x273d45,
  milk: 0xf1f1da, orange: 0xff663e, lime: 0xddff53, dark: 0x24333c,
  steel: 0x7b9a96, foam: 0xd2e7db, mint: 0x84bdb0, ink: 0x263e44,
  floor: 0x8fb198, grass: 0xb3c9a5, super: 0x6cebdc,
};

function applyPickupVertexShader(material, uniforms) {
  material.customProgramCacheKey = () => 'racer-pickup-v1';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        {
          float pId = float(gl_InstanceID);
          float ay = uTime * 1.2 + pId * 0.36;
          float cx = cos(0.15), sx = sin(0.15);
          float cy = cos(ay), sy = sin(ay);
          float cz = cos(0.16), sz = sin(0.16);
          vec3 n0 = vec3(objectNormal.x * cz - objectNormal.y * sz, objectNormal.x * sz + objectNormal.y * cz, objectNormal.z);
          vec3 n1 = vec3(n0.x * cy + n0.z * sy, n0.y, -n0.x * sy + n0.z * cy);
          objectNormal = vec3(n1.x, n1.y * cx - n1.z * sx, n1.y * sx + n1.z * cx);
        }`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float pId = float(gl_InstanceID);
          float ay = uTime * 1.2 + pId * 0.36;
          float cx = cos(0.15), sx = sin(0.15);
          float cy = cos(ay), sy = sin(ay);
          float cz = cos(0.16), sz = sin(0.16);
          vec3 p0 = vec3(transformed.x * cz - transformed.y * sz, transformed.x * sz + transformed.y * cz, transformed.z);
          vec3 p1 = vec3(p0.x * cy + p0.z * sy, p0.y, -p0.x * sy + p0.z * cy);
          transformed = vec3(p1.x, p1.y * cx - p1.z * sx, p1.y * sx + p1.z * cx);
          transformed.y += ${(0.21 / 1.16).toFixed(6)} * sin(uTime * 2.0 + pId * 0.57);
        }`,
      );
  };
}

export function createTrack(scene, course = CIRCUITS[0], options = {}) {
  const { deferVisuals = false } = options;
  const core = createTrackCore(course);
  const {
    nodes, sections, length, segments, segmentLength, drops,
    pads, pickups, ramps, hazards, drum, bridge, door, switchTrigger,
    grid, mapPoints,
  } = core;

  const original = course.id === 'track01';
  const C = { ...defaultColors, ...course.colors };
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
  // Road, paint and roadside props stop where a main Sky Lane replaces the road.
  const roadGone = (s) => core.sky.inMainLane(s);
  let syncFixtureVisuals = () => {};
  let pickupMesh = null;
  let pickupPositions = null;
  let lastHidden = null;
  const pickupUniforms = { uTime: { value: 0 } };
  const pickupTransform = new THREE.Object3D();

  function writePickupMatrix(index, hiddenFlag) {
    const pos = pickupPositions[index];
    pickupTransform.position.set(pos.x, pos.y + 2, pos.z);
    pickupTransform.rotation.set(0, 0, 0);
    pickupTransform.scale.setScalar(hiddenFlag ? 0 : 1.16);
    pickupTransform.updateMatrix();
    pickupMesh.setMatrixAt(index, pickupTransform.matrix);
  }

  function syncPickups(force = false) {
    if (!pickupMesh) return;
    let dirty = false;
    for (let i = 0; i < pickups.length; i++) {
      const h = pickups[i].hidden ? 1 : 0;
      if (force || h !== lastHidden[i]) {
        lastHidden[i] = h;
        writePickupMatrix(i, h);
        dirty = true;
      }
    }
    if (dirty) pickupMesh.instanceMatrix.needsUpdate = true;
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
    };
    const solid = new THREE.MeshLambertMaterial({ flatShading: true });
    const dirt = new THREE.MeshLambertMaterial({ color: C.floor });
    extraDisposables = [...Object.values(geo), solid, dirt];

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
    const colorCache = new Map();
    function colorValue(n) {
      if (!colorCache.has(n)) colorCache.set(n, new THREE.Color(n));
      return colorCache.get(n);
    }
    function tri(a, b, c, color) {
      const key = tile(a);
      if (!surfaceTiles.has(key)) surfaceTiles.set(key, { positions: [], colors: [] });
      const { positions, colors } = surfaceTiles.get(key);
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      const v = colorValue(color);
      for (let i = 0; i < 3; i++) colors.push(v.r, v.g, v.b);
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
      const offsets = [0.15, 0.5];
      const corners = (f, height) => offsets.map((offset) => lp(f, side * (f.width * 0.5 - offset), height));
      const [aOuter, aInner] = corners(a, tall ? 0.55 : 0);
      const [bOuter, bInner] = corners(b, tall ? 0.55 : 0);
      const [aTop, aRim] = corners(a, tall ? 1.05 : 0.28);
      const [bTop, bRim] = corners(b, tall ? 1.05 : 0.28);
      const color = a.index === 3 ? C.mint : C.foam;
      quad(aOuter, bOuter, bTop, aTop, color);
      quad(aInner, bInner, bRim, aRim, color);
      quad(aTop, aRim, bRim, bTop, C.milk);
      quad(aOuter, aInner, bInner, bOuter, C.steel);
    }

    let a = frame(0);
    for (let n = 0; n < segments; n++) {
      const b = frame(((n + 1) * length) / segments);
      const halfA = a.width * 0.5;
      const halfB = b.width * 0.5;
      const cuts = [-1, -0.875, -0.72, -0.57, -0.40, -0.21, 0, 0.21, 0.40, 0.57, 0.72, 0.875, 1];
      for (let k = 0; k < cuts.length - 1; k++) {
        strip(
          a, b,
          cuts[k] * halfA, cuts[k + 1] * halfA,
          cuts[k] * halfB, cuts[k + 1] * halfB,
          k === 0 || k === cuts.length - 2 ? C.shoulder : C.tarmac,
          0,
        );
      }
      const curbColor = Math.floor(n / 2) % 2 === 0 ? C.milk : C.orange;
      if (roadGone(a.distance) && roadGone(b.distance)) {
        a = b;
        continue;
      }
      for (const sign of [-1, 1]) {
        const open = core.dropAt((n + 0.5) * segmentLength, sign);
        const edgeColor = open ? (n % 2 ? 0xffca33 : C.ink) : curbColor;
        strip(a, b, sign * halfA, sign * (halfA - (open ? 1.04 : 0.62)), sign * halfB, sign * (halfB - (open ? 1.04 : 0.62)), edgeColor);
        strip(a, b, sign * (halfA - 1.26), sign * (halfA - 1.07), sign * (halfB - 1.26), sign * (halfB - 1.07), C.milk);
        const p1 = lp(a, sign * halfA, 0);
        const p2 = lp(b, sign * halfB, 0);
        const p3 = p2.clone();
        const p4 = p1.clone();
        p3.y -= 1.32;
        p4.y -= 1.32;
        quad(p1, p2, p3, p4, C.asphaltEdge);
        if (!open) railSegment(a, b, sign, hasGuardrail(a));
      }
      if (n % 8 === 0) strip(a, b, -0.11, 0.11, -0.11, 0.11, 0x94a5a8);
      a = b;
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
    function arch(s, title, kicker) {
      const f = frame(s);
      const x = f.width * 0.5 + 2.2;
      const height = 11.4;
      for (const side of [-1, 1]) {
        trackShape('box', s, side * x, height / 2, 1.25, height, 2, C.dark);
        trackShape('box', s, side * x, 3.15, 1.48, 5.7, 2.2, C.orange);
        trackShape('box', s, side * x, 6.8, 1.49, 0.34, 2.22, C.lime);
      }
      trackShape('box', s, 0, height, x * 2 + 1.6, 2.5, 1.55, C.dark);
      textPanel(s - 0.84, 0, height, 2 * x + 0.95, 2.38, title, kicker, C.dark, C.milk);
      trackShape('box', s, 0, height + 1.37, 2 * x + 1.68, 0.26, 1.6, C.lime);
    }
    arch(0, original ? 'SPROTO RACING' : course.name.toUpperCase(), 'START  /  FINISH                              COMPETITION RESEARCH UNIT');

    let seed = 0x5350;
    function rand() {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    const fans = [C.orange, C.lime, 0x5686a0, 0x9d7495, C.milk, C.ink];
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
      for (let k = 0; k < 4; k++) quad(R[k], S[k], S[(k + 1) % 4], R[(k + 1) % 4], k === 0 ? C.lime : C.mint);
      if (s === 31 || s === 136) {
        const end = s === 31 ? R : S;
        quad(...end, C.mint);
        const wall = s === 31 ? A : B;
        for (let k = 1; k < wall.length - 1; k++) tri(wall[0], wall[k], wall[k + 1], C.steel);
      }
    }
    for (const s of [48, 84, 120]) {
      for (let row = 0; row < 4; row++) {
        for (let j = 0; j < 15; j++) {
          const pos = s - 14 + j * 1.95 + rand() * 0.5;
          trackShape('sphere', pos, -26.8 - row * 1.8, 2.17 + row * 0.88, 0.82 + rand() * 0.45, 0.95 + rand() * 0.65, 0.91, fans[Math.floor(rand() * fans.length)]);
        }
      }
      for (const d of [-13, 13]) trackShape('box', s + d, -34.2, 4.45, 0.47, 9.1, 0.48, C.dark);
    }
    for (const s of [34, 60, 86, 112, 138, 164]) {
      trackShape('pillar', s, 19.4, 5.5, 0.19, 11, 0.19, C.dark);
      trackShape('box', s, 20.9, 9.9, 3, 0.95, 0.09, C.orange);
    }
    trackShape('box', 87, 35, 9, 14, 18, 16, C.foam);
    trackShape('box', 87, 35, 18.1, 15, 0.8, 17, C.lime);
    trackShape('box', 87, 35, 13, 14.3, 3.8, 16.4, C.ink);
    textPanel(87, 35, 6.8, 11.9, 5, course.number, 'TEST FACILITY', C.orange, C.ink, 8.035);
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
      const drumBody = new THREE.Mesh(geo.drum, new THREE.MeshLambertMaterial({ color: C.orange }));
      drumBody.scale.set(drum.width, drum.depth, drum.height);
      drumBody.rotation.x = Math.PI / 2;
      movingDrum.add(drumBody);
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
      trackGroup.add(doorMesh);
      textPanel(door.s - 1.16, door.x, 7.15, 9.9, 0.8, '03     DOCK  ACCESS', '', C.dark, C.lime);

      for (let j = 0; j < 30; j++) {
        const s = at(11, 0.1 + rand() * 0.67);
        const x = (j % 2 ? -1 : 1) * (24 + rand() * 17);
        const ht = 3.1 + (j % 4) * 1.5;
        trackShape('box', s, x, ht / 2, 4 + rand() * 4, ht, 7 + rand() * 6, [C.steel, C.mint, C.foam, C.orange][j % 4]);
        trackShape('box', s, x, ht + 0.03, 4, 0.12, 5, C.ink);
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
        trackShape('box', gate.s, gate.x, gate.height / 2, gate.width, gate.height, gate.depth, C.orange);
        trackShape('box', gate.s, gate.x, 1.42, gate.width + 0.06, 0.24, 1.25, C.dark);
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
      const AH = 2048;
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

    // GPU-animated pickup crates: 1 uniform update per frame, dirty-only matrix uploads.
    const crate = itemModel('pickup');
    const pickupMat = crate.material.clone();
    applyPickupVertexShader(pickupMat, pickupUniforms);
    pickupMesh = new THREE.InstancedMesh(crate.geometry.clone(), pickupMat, pickups.length);
    pickupMesh.name = 'pickupCrates';
    pickupPositions = pickups.map((item) => {
      core.sampleInto(item.s, item.x, sampleScratch, true);
      return { x: sampleScratch.position.x, y: sampleScratch.position.y, z: sampleScratch.position.z };
    });
    lastHidden = new Uint8Array(pickups.length);
    lastHidden.fill(255);
    for (const item of pickups) {
      trackShape('pillar', item.s, item.x, 0.05, 1.92, 0.12, 1.92, C.dark);
      trackShape('pillar', item.s, item.x, 0.12, 1.22, 0.08, 1.22, C.lime);
    }
    syncPickups(true);
    pickupMesh.computeBoundingSphere();
    if (pickupMesh.boundingSphere) pickupMesh.boundingSphere.radius += 2.5;
    trackGroup.add(pickupMesh);

    const outerRadius = original ? 1240 : Math.max(...nodes.map((n) => Math.hypot(n.p.x, n.p.z))) + 400;
    const hills = [0x779a94, 0x829f97, 0x6f928d, 0xa1bba5, 0x78938d];
    for (let i = 0; i < 80; i++) {
      const angle = (i * TAU) / 80 + rand() * 0.025;
      const rad = outerRadius + rand() * 380;
      const x = Math.cos(angle) * rad;
      const z = Math.sin(angle) * rad;
      const h = 135 + rand() * 310;
      world('cone', x, -10 + h / 2, z, 350 + rand() * 340, h, 300 + rand() * 240, hills[i % hills.length], rand() * Math.PI);
    }
    const siteColors = [C.mint, C.foam, C.steel, 0xabc2af];
    for (const [sIdx, u, side] of [[0, 0.6, 1], [1, 0.7, -1], [2, 0.2, 1], [6, 0.88, 1], [7, 0.47, 1], [9, 0.3, 1], [10, 0.81, -1]]) {
      const f = frame(at(sIdx, u));
      for (let j = 0; j < 5; j++) {
        const p = f.center.clone().addScaledVector(f.right, side * (60 + rand() * 65)).addScaledVector(f.forward, (rand() - 0.5) * 96);
        const w = 11 + rand() * 12;
        const d = 13 + rand() * 16;
        const h = 8 + rand() * 14;
        if (nodes.some((n, i) => i % 6 === 0 && n.p.y < h + 4 && Math.hypot(n.p.x - p.x, n.p.z - p.z) < 20 + Math.max(w, d))) continue;
        p.y = -6.3 + h / 2;
        shape('box', p, w, h, d, siteColors[j % 4]);
        p.y += h / 2;
        shape('box', p, w + 1, 0.72, d + 1, C.foam);
        if (j % 2 === 0) {
          p.y += 1.6;
          shape('box', p, 4, 3, 4, C.steel);
        }
      }
    }
    for (let i = 0; i < 165; i++) {
      const s = rand() * length;
      const f = frame(s);
      if (f.index === 3 || f.index === 4) continue;
      const offset = (rand() > 0.5 ? -1 : 1) * (43 + rand() * 65);
      const p = f.center.clone().addScaledVector(f.right, offset);
      const size = 2.8 + rand() * 4;
      if (nodes.some((n, index) => index % 10 === 0 && n.p.y < 16 && (n.p.x - p.x) ** 2 + (n.p.z - p.z) ** 2 < 21 ** 2)) continue;
      p.y = -4.2;
      shape('pillar', p, 0.75, 4.6, 0.75, C.ink);
      p.y = -2.6 + size * 0.45;
      shape('sphere', p, size * 1.28, size * 1.5, size, siteColors[i % 4]);
    }
    const roadMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
    extraDisposables.push(roadMaterial);
    for (const { positions, colors } of surfaceTiles.values()) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      trackGroup.add(new THREE.Mesh(geometry, roadMaterial));
    }

    for (const { kind, parts } of instances.values()) {
      const mesh = new THREE.InstancedMesh(geo[kind], solid, parts.length);
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

  function update(time = 0, dt = 0, playerS = 0, lap = 1) {
    lastTime = time;
    lastLap = lap;
    core.update(time, dt, playerS, lap);
    if (!visualsMounted) return;
    pickupUniforms.uTime.value = time;
    syncFixtureVisuals(time);
    syncPickups(false);
    skyVisuals?.update(time, lap);
  }

  /** Hides the Boost Cells the player has grabbed in a lane this lap. */
  function setSkyCollected(laneIndex, mask) {
    skyVisuals?.setCollected(laneIndex, mask);
  }

  function reset() {
    lastTime = 0;
    core.reset();
    if (!visualsMounted) return;
    pickupUniforms.uTime.value = 0;
    syncFixtureVisuals(0);
    syncPickups(false);
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
    switchTrigger,
    sky: core.sky,
    setSkyCollected,
    triggerSwitch: core.triggerSwitch,
    getFixtureState: core.getFixtureState,
    setFixtureState: core.setFixtureState,
    reset,
    update,
    mapPoints,
  };
}
