// Pure Three.js-free circuit spline, surface, hazard, pickup, and fixture math.
// Runs identically in browsers, Node tests, and Nakama's Goja VM (lazy caches only).

import { PI, atan2, clamp, damp, hypot, mix, mod, sin, cos, smoothstep } from './math.js';
import { createSky } from './sky.js';

const NAMES = [
  'Launch Grid', 'Linked Switchbacks', 'Rolling Drum Floor', 'Uphill Drift Spiral',
  'Banked Dish', 'Half-Pipe Chute', 'Downhill Slalom', 'Drafting Straight',
  'Brake Basin', 'Switch Bridge', 'Ramp Yard', 'Loading Dock Finish',
];

function original(sector) {
  sector([[-650, -400, 4], [-650, -310, 4], [-636, -251, 5], [-584, -200, 6], [-540, -168, 6]]);
  sector([
    [-511, -120, 7], [-508, -77, 8], [-552, -46, 9], [-634, -48, 10], [-674, -16, 10],
    [-668, 31, 11], [-611, 55, 12], [-574, 109, 13],
  ]);
  sector([[-606, 152, 14], [-678, 187, 14], [-717, 237, 14], [-697, 286, 15], [-642, 310, 16], [-621, 352, 17]]);
  const helix = [];
  const spiralSteps = 36;
  for (let i = 0; i < spiralSteps; i++) {
    const angle = (i / spiralSteps) * 3 * PI;
    helix.push([-525 - 96 * cos(angle), 410 + 83 * sin(angle), 21 + (72 * i) / spiralSteps]);
  }
  sector(helix);
  sector([
    [-429, 410, 93], [-427, 350, 96], [-410, 301, 96], [-371, 266, 92], [-319, 264, 84],
    [-265, 300, 77], [-248, 361, 73], [-269, 421, 70], [-311, 463, 68],
  ]);
  sector([[-327, 517, 65], [-306, 571, 60], [-251, 616, 53], [-167, 631, 43], [-85, 608, 36], [-10, 586, 29]]);
  sector([
    [52, 604, 26], [106, 671, 24], [161, 707, 22], [211, 690, 21], [231, 640, 20], [221, 581, 19],
    [250, 542, 18], [301, 544, 16], [347, 606, 14], [401, 617, 13], [443, 572, 11],
  ]);
  sector([[470, 468, 10], [532, 443, 9], [599, 405, 8], [628, 338, 8], [629, 222, 8], [629, 105, 8]]);
  sector([
    [633, 36, 8], [678, -5, 7], [761, -7, 7], [816, -37, 8], [829, -85, 8], [798, -129, 8],
    [737, -144, 8], [655, -115, 7], [590, -95, 6], [548, -128, 5],
  ]);
  sector([
    [530, -192, 5], [556, -254, 5], [548, -308, 5], [495, -337, 6], [432, -312, 6],
    [390, -270, 7], [342, -266, 7], [302, -298, 8], [278, -348, 9],
  ]);
  sector([[233, -409, 10], [180, -469, 11], [99, -492, 9], [7, -480, 7], [-82, -504, 6]]);
  sector([
    [-156, -550, 6], [-255, -570, 6], [-319, -534, 6], [-369, -544, 6], [-415, -608, 5],
    [-491, -646, 5], [-564, -620, 4], [-626, -558, 4], [-650, -486, 4],
  ]);
}

const ridge = [
  [[-690, -440, 12], [-690, -295, 12], [-674, -202, 17]],
  [[-600, -140, 24], [-498, -145, 40], [-441, -125, 53], [-424, -79, 66], [-466, -37, 76],
    [-521, -13, 83], [-546, 23, 88], [-540, 68, 96]],
  [[-570, 112, 108], [-667, 138, 119], [-730, 170, 128], [-748, 217, 135], [-713, 259, 140],
    [-627, 275, 144], [-572, 309, 147], [-535, 341, 148]],
  [[-485, 343, 144], [-402, 310, 131], [-330, 245, 109], [-256, 228, 108]],
  [[-192, 279, 119], [-141, 352, 128], [-79, 382, 118], [5, 350, 101], [68, 288, 105]],
  [[143, 249, 112], [224, 282, 95], [298, 369, 70], [380, 393, 56]],
  [[478, 378, 51], [559, 320, 66], [621, 239, 78], [668, 140, 69]],
  [[701, 42, 55], [749, -16, 49], [815, -52, 43], [838, -109, 37], [804, -160, 32],
    [715, -172, 27], [640, -210, 23], [573, -222, 20], [521, -182, 18]],
  [[423, -154, 15], [340, -93, 27], [255, -88, 42], [204, -154, 55]],
  [[233, -241, 49], [319, -288, 32], [333, -366, 18], [275, -416, 14]],
  [[167, -450, 16], [64, -453, 25], [-41, -487, 32], [-146, -531, 23], [-251, -507, 15]],
  [[-366, -484, 12], [-465, -529, 18], [-562, -572, 18], [-654, -543, 12]],
];

const yard = [
  [[-690, -455, 7], [-690, -285, 7], [-690, -110, 7]],
  [[-680, 32, 7], [-622, 112, 8], [-619, 175, 9], [-684, 251, 10], [-684, 328, 11]],
  [[-614, 397, 12], [-535, 455, 12], [-444, 463, 12], [-361, 439, 11], [-321, 386, 11],
    [-326, 329, 10], [-366, 287, 9], [-420, 276, 9]],
  [[-479, 245, 9], [-540, 215, 9], [-556, 161, 9], [-518, 115, 9], [-451, 117, 9],
    [-401, 150, 10], [-359, 146, 10], [-330, 100, 11], [-326, 36, 11]],
  [[-314, -56, 11], [-349, -120, 11], [-403, -158, 10], [-430, -214, 9], [-405, -271, 8],
    [-351, -294, 7], [-284, -277, 7], [-232, -291, 7], [-190, -273, 7], [-173, -227, 7]],
  [[-159, -133, 7], [-154, -47, 9], [-91, 38, 12], [-106, 121, 14], [-169, 204, 14]],
  [[-172, 295, 13], [-100, 357, 12], [28, 379, 12], [157, 376, 11]],
  [[266, 367, 11], [326, 389, 11], [401, 404, 10], [455, 376, 10], [470, 318, 9], [450, 266, 9],
    [388, 239, 9], [310, 236, 9], [248, 197, 9], [183, 151, 9]],
  [[137, 96, 8], [146, 27, 8], [203, -9, 8], [258, 9, 9], [291, 59, 9], [332, 70, 10], [369, 39, 10]],
  [[400, -72, 11], [481, -96, 13], [548, -47, 14], [588, 34, 13], [664, 39, 12], [709, -21, 10]],
  [[718, -152, 9], [708, -283, 8], [659, -368, 7], [564, -401, 7], [432, -396, 7]],
  [[298, -383, 7], [183, -429, 8], [61, -453, 8], [-73, -417, 8], [-207, -440, 8], [-346, -502, 7], [-487, -539, 7], [-609, -532, 7]],
];

export const CIRCUITS = [
  {
    id: 'track01', number: '01', name: 'Test Track 01', hero: ['Test Track', '01'],
    focus: 'Deep switchbacks and a sweeping uphill drift spiral.',
    names: NAMES, widths: [31, 26, 33, 28, 35, 34, 30, 32, 33, 32, 37, 31], layout: original,
    drops: [[3, 0.28, 0.37, -1], [4, 0.48, 0.61, 1]],
    pickupRows: [
      [0.125, 0.463, 0.647, 0.83],
      [0.039, 0.20, 0.367, 0.533, 0.858],
      [0.019, 0.435, 0.65, 0.859],
      [0.03, 0.12, 0.29, 0.46, 0.55, 0.64, 0.73, 0.82, 0.918],
      [0.024, 0.18, 0.333, 0.487, 0.64, 0.872],
      [0.013, 0.296, 0.513, 0.69, 0.875],
      [0.037, 0.15, 0.26, 0.37, 0.48, 0.653, 0.84, 0.948],
      [0.079, 0.23, 0.397, 0.557, 0.72, 0.973],
      [0.079, 0.297, 0.415, 0.532, 0.65, 0.773, 0.896],
      [0.022, 0.17, 0.302, 0.566, 0.698, 0.83, 0.979],
      [0.16, 0.436, 0.67, 0.84, 0.976],
      [0.068, 0.268, 0.386, 0.504, 0.622, 0.74, 0.941],
    ],
  },
  {
    id: 'track02', number: '02', name: 'Crestline Ridge', hero: ['Crestline', 'Ridge'],
    focus: 'Crests, jump landings and chase-camera visibility.',
    drops: [[2, 0.36, 0.48, -1], [5, 0.19, 0.32, 1]],
    names: ['Survey Grid', 'Staircase Climb', 'Summit Approach', 'Blind Crest', 'Twin Rollers', 'Gravity Chute', 'High Traverse', 'Long Descent', 'Uphill Landing', 'Dropaway Bend', 'Jump Calibration', 'Return Shelf'],
    widths: [32, 29, 30, 33, 36, 35, 30, 34, 38, 32, 39, 33], points: ridge, scale: 1.48,
    colors: { floor: 0xb8a68b, mint: 0xa8c9d1, orange: 0xe58656, foam: 0xe4e5d4, steel: 0x7598ac },
    pads: [[0, 0.68, 0, 6, 1], [1, 0.39, -5, 5, 1], [2, 0.61, 4, 6, 2], [3, 0.62, -5, 5, 1], [4, 0.19, 5, 6, 1], [5, 0.44, 0, 6, 2], [6, 0.82, 4, 7, 1], [7, 0.27, -4, 5, 2], [8, 0.25, 0, 6, 1], [10, 0.13, -7, 5, 1], [11, 0.66, 5, 5, 1]],
    ramps: [[2, 0.83, 4, 8, 7], [3, 0.32, -5, 8, 10], [4, 0.28, 5, 8, 6], [4, 0.50, 5, 8, 8], [4, 0.73, 5, 8, 10], [5, 0.61, 0, 8, 11], [7, 0.48, -4, 7, 10], [8, 0.38, 0, 9, 9], [9, 0.41, 4, 7, 8], [10, 0.25, -7, 7, 6], [10, 0.25, 6, 8, 11], [10, 0.63, 0, 8, 9]],
    pickupRows: [
      [0.084, 0.28, 0.412, 0.545, 0.664, 0.81, 0.954],
      [0.069, 0.17, 0.36, 0.55, 0.653, 0.757, 0.86, 0.977],
      [0.084, 0.19, 0.385, 0.58, 0.68, 0.779, 0.879, 0.979],
      [0.12, 0.28, 0.44, 0.60, 0.881],
      [0.001, 0.232, 0.363, 0.469, 0.627, 0.762, 0.982],
      [0.08, 0.302, 0.424, 0.546, 0.668, 0.79, 0.909],
      [0.026, 0.138, 0.25, 0.47, 0.69, 0.806, 0.944],
      [0.043, 0.12, 0.20, 0.28, 0.36, 0.44, 0.52, 0.60, 0.68, 0.813, 0.943],
      [0.012, 0.13, 0.266, 0.416, 0.666, 0.80, 0.917],
      [0.034, 0.15, 0.303, 0.455, 0.607, 0.76, 0.999],
      [0.08, 0.175, 0.274, 0.46, 0.555, 0.654, 0.745, 0.924],
      [0.011, 0.23, 0.363, 0.495, 0.628, 0.76, 0.932],
    ],
  },
  {
    id: 'track03', number: '03', name: 'Switchyard GP', hero: ['Switchyard', 'GP'],
    focus: 'Drift reversals, pack traffic and braking under boost.',
    drops: [[2, 0.49, 0.60, -1], [9, 0.18, 0.28, 1]],
    names: ['Freight Grid', 'Offset Chicane', 'Freight Hairpin', 'Double Reversal', 'Brake Box', 'Weave Gates', 'Passing Straight', 'Return Hairpin', 'Container Esses', 'Transfer Siding', 'Turbo Runout', 'Depot Finish'],
    widths: [35, 24, 32, 26, 24, 30, 36, 31, 24, 27, 38, 33], points: yard, scale: 1.30,
    colors: { floor: 0x929b9c, mint: 0x83b6ae, orange: 0xf5b147, foam: 0xdbdfca, steel: 0x71838a, tarmac: 0x4e5161 },
    pads: [[0, 0.54, -6, 6, 1], [1, 0.84, 3, 5, 1], [2, 0.81, -4, 5, 1], [3, 0.76, 4, 5, 1], [4, 0.12, 0, 7, 2], [5, 0.89, 5, 5, 1], [6, 0.22, -6, 6, 2], [6, 0.64, 7, 6, 2], [7, 0.86, 4, 5, 1], [9, 0.80, 0, 6, 1], [10, 0.30, 0, 7, 2], [10, 0.65, -6, 6, 2], [11, 0.64, 6, 5, 1]],
    ramps: [[0, 0.84, -7, 6, 6], [6, 0.43, 8, 7, 7], [9, 0.33, -5, 7, 8], [11, 0.41, 7, 7, 7]],
    pickupRows: [
      [0.066, 0.25, 0.383, 0.517, 0.65, 0.769, 0.888],
      [0.008, 0.14, 0.274, 0.415, 0.552, 0.69, 0.944],
      [0.054, 0.15, 0.238, 0.412, 0.50, 0.673, 0.76, 0.859, 0.958],
      [0.059, 0.262, 0.364, 0.47, 0.67, 0.779, 0.887, 0.996],
      [0.093, 0.29, 0.39, 0.49, 0.59, 0.69, 0.79, 0.947],
      [0.034, 0.14, 0.263, 0.48, 0.697, 0.83, 0.926],
      [0.022, 0.26, 0.398, 0.54, 0.68, 0.82, 0.949],
      [0.053, 0.23, 0.32, 0.41, 0.50, 0.593, 0.687, 0.78, 0.954],
      [0.061, 0.19, 0.312, 0.444, 0.678, 0.80, 0.933],
      [0.056, 0.17, 0.366, 0.464, 0.66, 0.765, 0.87, 0.975],
      [0.074, 0.268, 0.367, 0.465, 0.563, 0.662, 0.76, 0.946],
      [0.022, 0.075, 0.18, 0.30, 0.36, 0.424, 0.54, 0.60, 0.66, 0.72, 0.782, 0.844, 0.907, 0.969],
    ],
    gates: [[1, 0.3, -5], [1, 0.52, 5], [3, 0.45, 5], [4, 0.32, 0], [5, 0.24, -5], [5, 0.40, 5], [5, 0.56, -5], [5, 0.72, 5], [8, 0.42, 4], [8, 0.62, -4], [10, 0.83, 0]],
  },
];

export const courseById = (id) => CIRCUITS.find((c) => c.id === id) ?? CIRCUITS[0];

// Lazy cache so Nakama 3.41 post-InitModule Object.freeze never freezes a pre-allocated Map.
let blueprintCache = null;

function distSq3(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function dist3(a, b) {
  return Math.sqrt(distSq3(a, b));
}

function evalNonuniformCatmullRom(x0, x1, x2, x3, dt0, dt1, dt2, w) {
  let t1 = (x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1;
  let t2 = (x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2;
  t1 *= dt1;
  t2 *= dt1;
  const c0 = x1;
  const c1 = t1;
  const c2 = -3 * x1 + 3 * x2 - 2 * t1 - t2;
  const c3 = 2 * x1 - 2 * x2 + t1 + t2;
  const w2 = w * w;
  return c0 + c1 * w + c2 * w2 + c3 * w2 * w;
}

function evalClosedCentripetalPoint(points, t) {
  const l = points.length;
  const p = l * t;
  let intPoint = Math.floor(p);
  const weight = p - intPoint;
  intPoint += intPoint > 0 ? 0 : (Math.floor(Math.abs(intPoint) / l) + 1) * l;
  const p0 = points[(intPoint - 1) % l];
  const p1 = points[intPoint % l];
  const p2 = points[(intPoint + 1) % l];
  const p3 = points[(intPoint + 2) % l];
  let dt0 = Math.sqrt(Math.sqrt(distSq3(p0, p1)));
  let dt1 = Math.sqrt(Math.sqrt(distSq3(p1, p2)));
  let dt2 = Math.sqrt(Math.sqrt(distSq3(p2, p3)));
  if (dt1 < 1e-4) dt1 = 1.0;
  if (dt0 < 1e-4) dt0 = dt1;
  if (dt2 < 1e-4) dt2 = dt1;
  return {
    x: evalNonuniformCatmullRom(p0.x, p1.x, p2.x, p3.x, dt0, dt1, dt2, weight),
    y: evalNonuniformCatmullRom(p0.y, p1.y, p2.y, p3.y, dt0, dt1, dt2, weight),
    z: evalNonuniformCatmullRom(p0.z, p1.z, p2.z, p3.z, dt0, dt1, dt2, weight),
  };
}

export function blueprint(course = CIRCUITS[0]) {
  if (!blueprintCache) blueprintCache = Object.create(null);
  if (blueprintCache[course.id]) return blueprintCache[course.id];
  const points = [];
  const starts = [];
  function sector(list) {
    starts.push(points.length);
    const scale = course.scale ?? 1;
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      points.push({ x: row[0] * scale, y: row[2], z: -row[1] * scale });
    }
  }
  if (course.points) course.points.forEach(sector);
  else course.layout(sector);

  const subdivisions = 24;
  const count = points.length * subdivisions;
  const nodes = [];
  let distance = 0;
  for (let i = 0; i <= count; i++) {
    const p = evalClosedCentripetalPoint(points, i / count);
    if (i > 0) distance += dist3(p, nodes[i - 1].p);
    nodes.push({ p, s: distance, f: null, curve: 0, section: 0 });
  }
  const sections = starts.map((index, i) => ({
    name: course.names[i],
    start: nodes[index * subdivisions].s,
    end: i === starts.length - 1 ? distance : nodes[starts[i + 1] * subdivisions].s,
  }));
  // Precompute section index per node for O(1) lookup after binary search.
  let secIdx = 0;
  for (let i = 0; i <= count; i++) {
    while (secIdx < sections.length - 1 && i >= starts[secIdx + 1] * subdivisions) secIdx++;
    nodes[i].section = i === count ? 0 : secIdx;
  }
  for (let i = 0; i < count; i++) {
    const prev = nodes[mod(i - 1, count)].p;
    const next = nodes[(i + 1) % count].p;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const dz = next.z - prev.z;
    const inv = 1 / (Math.sqrt(dx * dx + dy * dy + dz * dz) || 1);
    nodes[i].f = { x: dx * inv, y: dy * inv, z: dz * inv };
  }
  for (let i = 0; i < count; i++) {
    const pre = nodes[mod(i - 1, count)];
    const next = nodes[(i + 1) % count];
    const rotation = atan2(
      pre.f.x * next.f.z - pre.f.z * next.f.x,
      pre.f.x * next.f.x + pre.f.z * next.f.z,
    );
    const run = dist3(pre.p, nodes[i].p) + dist3(nodes[i].p, next.p);
    nodes[i].curve = rotation / Math.max(0.01, run);
  }
  nodes[count].f = nodes[0].f;
  nodes[count].curve = nodes[0].curve;
  const result = { nodes, sections, length: distance };
  blueprintCache[course.id] = result;
  return result;
}

export function createTrackSample() {
  return {
    position: { x: 0, y: 0, z: 0 },
    forward: { x: 0, y: 0, z: 1 },
    right: { x: 1, y: 0, z: 0 },
    curvature: 0,
    deckY: 0,
    grade: 0,
    bank: 0,
    width: 16,
    section: 0,
  };
}

export function gridSlot(index) {
  return {
    s: -7.6 - Math.floor(index / 2) * 8,
    x: index % 2 ? 4 : -4,
  };
}

export function createTrackCore(course = CIRCUITS[0]) {
  const { nodes, sections, length } = blueprint(course);
  const originalCourse = course.id === 'track01';
  const widths = course.widths;
  const at = (i, t) => mix(sections[i].start, sections[i].end, t);
  const segments = Math.ceil(length / 3.1);
  const segmentLength = length / segments;
  const railBoundary = (s) => Math.round(s / segmentLength) * segmentLength;
  // Main Sky Lanes replace their stretch of road, so nothing on that road survives.
  const sky = createSky(course, sections, length);
  const offRoad = (s, margin = 0) => sky.inMainLane(s, margin);
  const drops = (course.drops ?? []).map(([i, from, to, side]) => ({
    start: railBoundary(at(i, from)),
    end: railBoundary(at(i, to)),
    side,
  })).filter((gap) => !offRoad(gap.start, 20) && !offRoad(gap.end, 20));

  function dropAt(s, side) {
    const d = mod(s, length);
    for (let i = 0; i < drops.length; i++) {
      const gap = drops[i];
      if (gap.side === side && d >= gap.start && d < gap.end) return gap;
    }
    return undefined;
  }

  // Scratch locate record to avoid per-call object allocation in hot paths.
  const loc = { distance: 0, index: 0, a: nodes[0], b: nodes[1], t: 0 };
  // Where the last lookup landed. Lookups come in runs around one kart, so the same stretch
  // between two nodes usually answers the next one and the search is skipped. Nodes are in
  // road order, so a stretch that contains the distance is the one the search would find.
  let lastNode = 0;
  function locateInto(s, out) {
    const distance = mod(s, length);
    let lo = lastNode;
    let hi = lo + 1;
    if (!(nodes[lo].s <= distance && distance < nodes[hi].s)) {
      lo = 0;
      hi = nodes.length - 1;
      while (lo + 1 < hi) {
        const mid = (lo + hi) >>> 1;
        if (nodes[mid].s <= distance) lo = mid;
        else hi = mid;
      }
      lastNode = lo;
    }
    let sec = nodes[lo].section;
    if (distance + 1e-8 >= sections[sec].end) {
      sec = sec + 1 < sections.length ? sec + 1 : 0;
    }
    out.distance = distance;
    out.index = sec;
    out.a = nodes[lo];
    out.b = nodes[hi];
    out.t = (distance - nodes[lo].s) / (nodes[hi].s - nodes[lo].s);
    return out;
  }

  const pads = (course.pads ?? [
    [0, 0.76, -7, 5, 1], [1, 0.84, 5, 5, 1], [2, 0.68, -8, 5, 1], [4, 0.52, 10, 5.8, 2],
    [6, 0.89, -6, 5, 1], [7, 0.38, 8, 5, 1], [7, 0.77, -9, 5, 1], [8, 0.86, 5, 5, 1],
    [10, 0.18, -6, 5, 2], [11, 0.67, 8, 5, 1],
  ]).map(([i, f, x, width, tier]) => ({ s: at(i, f), x, width, tier })).filter((p) => !offRoad(p.s, 10));

  const allRamps = (course.ramps ?? [
    [2, 0.79, -9, 6, 6.5], [4, 0.91, 8, 9, 10], [5, 0.34, -10, 7, 7], [6, 0.68, 8, 6, 6.5],
    [9, 0.64, -6.5, 9, 0], [10, 0.48, -10, 7, 6.8], [10, 0.54, 7, 8, 11], [11, 0.35, -9, 7, 7.5],
  ]).map(([i, f, x, width, power]) => ({ s: at(i, f), x, width, power }));
  // Test Track 01's switch bridge is the fifth ramp; keep it by identity after filtering.
  const bridge = originalCourse ? allRamps[4] : null;
  const ramps = allRamps.filter((ramp) => ramp === bridge || !offRoad(ramp.s, 25));

  const drum = { s: at(2, 0.52), x: 0, width: 4.6, height: 4.6, depth: 4.6, type: 'rollingDrum' };
  const switchTrigger = originalCourse ? { s: at(9, 0.38), x: -9, width: 5, type: 'bridgeSwitch' } : null;
  const door = { s: at(11, 0.57), x: -8, width: 8.1, height: 5.6, depth: 0.85, type: 'loadingDoor', active: true };
  const hazards = originalCourse
    ? [drum, door]
    : (course.gates ?? []).map(([i, f, x]) => ({
        s: at(i, f), x, width: 4, height: 1.7, depth: 1.2, type: 'laneDivider',
      })).filter((h) => !offRoad(h.s, 10));

  let bridgeAngle = 0;
  let bridgeTimer = 0;
  function triggerSwitch() {
    bridgeTimer = 8;
  }

  const widthAtSection = (i, u) => mix(widths[mod(i - 1, widths.length)], widths[i], smoothstep(0, 0.12, u));

  function widthAt(s) {
    locateInto(s, loc);
    const sec = sections[loc.index];
    return widthAtSection(loc.index, (loc.distance - sec.start) / (sec.end - sec.start));
  }

  const scratchFrame = {
    centerX: 0, centerY: 0, centerZ: 0,
    forwardX: 0, forwardY: 0, forwardZ: 1,
    rightX: 1, rightZ: 0,
    curvature: 0, bank: 0, width: 16, index: 0, u: 0, distance: 0, grade: 0,
  };

  // The road distance scratchFrame currently holds. A kart asks about the same place several
  // times a tick (surface, bank, tyre heights), and a frame depends on nothing but `s`.
  let scratchFrameS = NaN;

  function evalFrame(s, f) {
    if (f === scratchFrame) {
      if (s === scratchFrameS) return f;
      scratchFrameS = s;
    }
    locateInto(s, loc);
    const { a, b, t, distance, index: i } = loc;
    f.centerX = a.p.x + (b.p.x - a.p.x) * t;
    f.centerY = a.p.y + (b.p.y - a.p.y) * t;
    f.centerZ = a.p.z + (b.p.z - a.p.z) * t;
    const fx = a.f.x + (b.f.x - a.f.x) * t;
    const fy = a.f.y + (b.f.y - a.f.y) * t;
    const fz = a.f.z + (b.f.z - a.f.z) * t;
    const fInv = 1 / (Math.sqrt(fx * fx + fy * fy + fz * fz) || 1);
    f.forwardX = fx * fInv;
    f.forwardY = fy * fInv;
    f.forwardZ = fz * fInv;
    const rLen = Math.sqrt(f.forwardZ * f.forwardZ + f.forwardX * f.forwardX) || 1;
    f.rightX = -f.forwardZ / rLen;
    f.rightZ = f.forwardX / rLen;
    f.curvature = mix(a.curve, b.curve, t);
    const sec = sections[i];
    f.u = (distance - sec.start) / (sec.end - sec.start);
    f.width = widthAtSection(i, f.u);
    f.bank = -clamp(f.curvature * 4.2, -0.13, 0.13);
    f.index = i;
    f.distance = distance;
    f.grade = f.forwardY / Math.max(0.02, hypot(f.forwardX, f.forwardZ));
    return f;
  }

  const pickupLanes = [[-2, 0, 1], [-1, 2], [-2, -1, 1], [0, 1, 2], [-2, 1], [-1, 0, 2], [-2, 0, 2], [-2, -1, 2]];
  let pickupRow = 0;
  const pickups = [];
  for (let section = 0; section < course.pickupRows.length; section++) {
    const fractions = course.pickupRows[section];
    for (let j = 0; j < fractions.length; j++) {
      const s = at(section, fractions[j]);
      if (offRoad(s, 10)) continue;
      evalFrame(s, scratchFrame);
      const lanes = pickupLanes[pickupRow % pickupLanes.length];
      const offset = (pickupRow % 2 === 0 ? 1 : -1) * Math.sign(scratchFrame.curvature) * 0.04;
      pickupRow++;
      for (let k = 0; k < lanes.length; k++) {
        pickups.push({
          index: pickups.length,
          s,
          x: (lanes[k] * 0.18 + offset) * scratchFrame.width,
          hidden: false,
          readyAt: Infinity,
        });
      }
    }
  }


  function crossHeight(f, x) {
    let h = f.bank * x;
    const edge = Math.min(1.1, Math.abs(x) / (f.width * 0.5));
    if (originalCourse && f.index === 4) {
      h += 4.2 * edge * edge * smoothstep(0, 0.16, f.u) * (1 - smoothstep(0.84, 1, f.u));
    }
    if (originalCourse && f.index === 5) {
      const blend = smoothstep(0, 0.13, f.u) * (1 - smoothstep(0.83, 1, f.u));
      h += blend * (4.8 * edge * edge + 2.4 * smoothstep(5, 12, -x));
    }
    return h;
  }

  function rampHeight(s, x, includeBridge) {
    let h = 0;
    for (let i = 0; i < ramps.length; i++) {
      const ramp = ramps[i];
      const d = s - ramp.s;
      if (d < -17 || d > 12 || Math.abs(x - ramp.x) > ramp.width / 2) continue;
      const lateral = 1 - smoothstep(ramp.width / 2 - 1.25, ramp.width / 2, Math.abs(x - ramp.x));
      const crest = ramp === bridge ? (includeBridge ? bridgeAngle * 3.6 : 0) : ramp.power * 0.31;
      h += crest * lateral * (d < 0 ? smoothstep(-17, 0, d) : 1 - smoothstep(0, 12, d));
    }
    return h;
  }

  function sampleInto(s, x = 0, out = createTrackSample(), includeBridge = true) {
    evalFrame(s, scratchFrame);
    const ch = crossHeight(scratchFrame, x);
    const rh = rampHeight(scratchFrame.distance, x, includeBridge);
    out.position.x = scratchFrame.centerX + scratchFrame.rightX * x;
    out.position.y = scratchFrame.centerY + ch + rh;
    out.position.z = scratchFrame.centerZ + scratchFrame.rightZ * x;
    out.forward.x = scratchFrame.forwardX;
    out.forward.y = scratchFrame.forwardY;
    out.forward.z = scratchFrame.forwardZ;
    out.right.x = scratchFrame.rightX;
    out.right.y = 0;
    out.right.z = scratchFrame.rightZ;
    out.curvature = scratchFrame.curvature;
    out.deckY = scratchFrame.centerY + ch;
    out.grade = scratchFrame.grade;
    out.bank = scratchFrame.bank;
    out.width = scratchFrame.width;
    out.section = scratchFrame.index;
    return out;
  }

  function sample(s, x = 0) {
    return sampleInto(s, x, createTrackSample(), true);
  }

  function heightAt(s, x = 0) {
    evalFrame(s, scratchFrame);
    return scratchFrame.centerY + crossHeight(scratchFrame, x) + rampHeight(scratchFrame.distance, x, true);
  }

  function mapXYAt(s, out) {
    evalFrame(s, scratchFrame);
    out.x = scratchFrame.centerX;
    out.z = scratchFrame.centerZ;
    return out;
  }

  const halfWidths = new Float64Array(segments + 1);
  const closedRails = new Uint8Array(segments);
  evalFrame(0, scratchFrame);
  halfWidths[0] = scratchFrame.width * 0.5;
  for (let n = 0; n < segments; n++) {
    evalFrame(((n + 1) * length) / segments, scratchFrame);
    halfWidths[n + 1] = scratchFrame.width * 0.5;
    const midS = (n + 0.5) * segmentLength;
    if (!dropAt(midS, -1)) closedRails[n] |= 1;
    if (!dropAt(midS, 1)) closedRails[n] |= 2;
  }

  function edgeAt(s, side) {
    const u = (mod(s, length) * segments) / length;
    const i = Math.min(segments - 1, Math.floor(u));
    if (!(closedRails[i] & (side < 0 ? 1 : 2))) return Infinity;
    return mix(halfWidths[i], halfWidths[i + 1], u - i) - 0.5;
  }

  // Both rails at one road distance, for callers that test every point of a kart's outline.
  // `left` and `right` are exactly edgeAt(s, -1) and edgeAt(s, 1). The record is reused: read
  // it before the next call.
  const edgePair = { left: 0, right: 0 };
  function edgesAt(s) {
    const u = ((((s % length) + length) % length) * segments) / length;
    const i = Math.min(segments - 1, Math.floor(u));
    const closed = closedRails[i];
    const inside = closed ? halfWidths[i] + (halfWidths[i + 1] - halfWidths[i]) * (u - i) - 0.5 : Infinity;
    edgePair.left = closed & 1 ? inside : Infinity;
    edgePair.right = closed & 2 ? inside : Infinity;
    return edgePair;
  }

  const grid = Array.from({ length: 6 }, (_, i) => gridSlot(i));

  const mapPoints = [];
  for (let i = 0; i < 360; i++) {
    evalFrame((i / 360) * length, scratchFrame);
    mapPoints.push({ x: scratchFrame.centerX, z: scratchFrame.centerZ });
  }

  function updateFixtures(time = 0, dt = 0, lap = 1) {
    if (!originalCourse) return;
    bridgeTimer = Math.max(0, bridgeTimer - dt);
    bridgeAngle = damp(bridgeAngle, bridgeTimer > 0 ? 1 : 0, 4, dt);
    bridge.power = bridgeAngle > 0.32 ? bridgeAngle * 9 : 0;
    drum.x = sin(time * 0.9) * 10.4;
    door.active = lap < 3;
  }

  function update(time = 0, dt = 0, _playerS = 0, lap = 1) {
    updateFixtures(time, dt, lap);
  }

  function reset() {
    bridgeTimer = 0;
    bridgeAngle = 0;
    for (let i = 0; i < pickups.length; i++) {
      pickups[i].hidden = false;
      pickups[i].readyAt = Infinity;
    }
    updateFixtures(0, 0, 1);
  }

  function getFixtureState() {
    return {
      bridgeAngle,
      bridgeTimer,
      drumX: drum.x,
      doorActive: door.active,
    };
  }

  function setFixtureState(fxState) {
    if (!fxState) return;
    bridgeAngle = fxState.bridgeAngle ?? 0;
    bridgeTimer = fxState.bridgeTimer ?? 0;
    if (bridge) bridge.power = bridgeAngle > 0.32 ? bridgeAngle * 9 : 0;
    drum.x = fxState.drumX ?? 0;
    door.active = fxState.doorActive ?? true;
  }

  reset();

  return {
    id: course.id,
    number: course.number,
    name: course.name,
    course,
    nodes,
    segments,
    segmentLength,
    halfWidths,
    closedRails,
    drops,
    grid,
    length,
    sections,
    pads,
    pickups,
    ramps,
    hazards,
    drum,
    bridge,
    door,
    switchTrigger,
    triggerSwitch,
    sky,
    sample,
    sampleInto,
    heightAt,
    mapXYAt,
    evalFrame,
    crossHeight,
    rampHeight,
    widthAt,
    edgeAt,
    edgesAt,
    dropAt,
    reset,
    update,
    getFixtureState,
    setFixtureState,
    mapPoints,
  };
}
