// Sky Lanes: flight corridors, per-lap Boost Cell and obstacle layouts, and the
// swept collision tests that run at flight speed. Pure and deterministic: every
// moving obstacle is a function of race time, and layouts come from fixed data and
// an integer hash, never Math.random. Runs in browsers, Node and Nakama's Goja VM.

import { PI, TAU, clamp, cos, mix, mod, sin, smoothstep } from './math.js';

// Lane positions use [sector, fraction] like the rest of the circuit data.
// `main` lanes replace the road between start and end. `gate` lanes are optional
// side launches that open from `openLap`, flown above the road, which stays below.
const SKY_COURSES = {
  track01: {
    theme: 'rig', crossing: 'plane',
    lanes: [
      // Lanes end on straight road, so a kart landing at flight speed can hold its line.
      { kind: 'main', from: [4, 0.06], to: [7, 0.5], width: 34, floor: 2, ceiling: 26 },
      { kind: 'gate', from: [8, 0.08], to: [9, 0.85], width: 24, floor: 9, ceiling: 30, entry: [6, 14], openLap: 2 },
    ],
  },
  track02: {
    theme: 'rock', crossing: 'birds',
    lanes: [
      { kind: 'main', from: [2, 0.23], to: [4, 0.6], width: 34, floor: 2, ceiling: 26 },
      { kind: 'gate', from: [7, 0.08], to: [7, 0.88], width: 24, floor: 9, ceiling: 30, entry: [-14, -6], openLap: 2 },
    ],
  },
  track03: {
    theme: 'crane', crossing: 'satellite',
    lanes: [
      { kind: 'main', from: [8, 0.1], to: [9, 0.98], width: 34, floor: 2, ceiling: 26 },
      { kind: 'gate', from: [7, 0.06], to: [7, 0.74], width: 24, floor: 9, ceiling: 30, entry: [5, 13], openLap: 2 },
    ],
  },
};

// Cluster programmes per lap, as [type, laneFraction, variant]. Lap 1 teaches the
// lane, lap 2 splits it, lap 3 is the storm with every obstacle type.
const MAIN_PROGRAMME = [
  [['pylons', 0.17], ['squeeze', 0.36], ['pylons', 0.55], ['squeeze', 0.74]],
  [['sweeper', 0.15], ['split', 0.31], ['shutter', 0.5], ['pylons', 0.64, 'dense'], ['sweeper', 0.79]],
  [['fan', 0.13], ['debris', 0.25], ['shutter', 0.38], ['sweeper', 0.5], ['squeeze', 0.61], ['fan', 0.72], ['debris', 0.83]],
];
// The first lap teaches a different flying skill on each new circuit. The
// standard second/third-lap escalation stays in place, with course-seeded layouts.
const OPENING_PROGRAMMES = {
  medieval: { obstacles: [['pylons',.18],['squeeze',.35],['squeeze',.58],['pylons',.76]], crossing:.465 },
  orbital: { obstacles: [['pylons',.16],['debris',.31],['split',.53],['squeeze',.76]], crossing:.435 },
  neon: { obstacles: [['pylons',.16],['sweeper',.32],['pylons',.51],['shutter',.73]], crossing:.415 },
};
const GATE_PROGRAMME = [
  [],
  [['pylons', 0.3], ['shutter', 0.62]],
  [['fan', 0.25], ['debris', 0.5], ['shutter', 0.74]],
];

export const SKY_KART_RADIUS = 1.15;
export const CELL_RADIUS = 1.25;
export const CELL_GRAB_RADIUS = CELL_RADIUS + 1.0;
// A lap's layout never holds more cells than fit in one 31-bit collection mask.
export const MAX_CELLS = 31;
const RUNWAY = 0.08;
const TAPER = 0.1;

function hash(n) {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function boxPart(s, x, y, hs, hx, hy, motion = null) {
  return { shape: 'box', s, x, y, hs, hx, hy, motion };
}

// Builds one lap's layout. `seed` keeps every lane and lap distinct.
function buildLayout(lane, programme, seed, storm, crossing, lapIndex, openingCrossing) {
  const half = lane.width / 2;
  const floor = lane.floor;
  const ceiling = lane.ceiling;
  const mid = (floor + ceiling) / 2;
  const span = lane.end - lane.start;
  const speedUp = storm ? 1.35 : 1;
  const obstacles = [];
  const keys = [{ u: RUNWAY * 0.5, x: 0, y: mid, mega: false }];
  const extraCells = [];
  let r = seed * 977;
  const rand = () => hash(r++);

  for (let c = 0; c < programme.length; c++) {
    const [type, u, variant] = programme[c];
    const s0 = lane.start + u * span;
    const gx = (rand() * 2 - 1) * half * 0.45;
    const gy = mix(floor + 4, ceiling - 4, rand());
    const ob = { type, s: s0, depth: 0, parts: [], warn: s0 - 8 };
    if (type === 'pylons') {
      const dense = variant === 'dense';
      const count = dense ? 13 : 8;
      const band = half * (dense ? 0.82 : 0.66);
      const gap = dense ? 2.8 : 3.4;
      for (let i = 0; i < count; i++) {
        let px = (rand() * 2 - 1) * band;
        if (Math.abs(px - gx) < gap) px = gx + (px >= gx ? 1 : -1) * (gap + rand() * 2);
        const ps = s0 + (i / count) * (dense ? 74 : 58) + rand() * 4;
        ob.parts.push(boxPart(ps, px, mid, 1.3, 1.3, (ceiling - floor) / 2 + 2));
      }
      ob.depth = dense ? 80 : 64;
      keys.push({ u: u + 0.012, x: gx, y: gy, mega: false });
      keys.push({ u: u + (ob.depth / span) * 0.8, x: gx, y: gy, mega: false });
    } else if (type === 'squeeze') {
      const slot = 2.3;
      const top = ceiling - 7;
      const h = (top - floor) / 2;
      const cy = floor + h;
      const leftHalf = (gx - slot + half) / 2;
      const rightHalf = (half - (gx + slot)) / 2;
      ob.parts.push(boxPart(s0 + 6, -half + leftHalf, cy, 6, leftHalf + 1, h));
      ob.parts.push(boxPart(s0 + 6, gx + slot + rightHalf, cy, 6, rightHalf + 1, h));
      ob.depth = 12;
      const slotY = mix(floor + 2.5, top - 2.5, rand());
      keys.push({ u: u + 6 / span, x: gx, y: slotY, mega: true });
    } else if (type === 'sweeper') {
      const vertical = rand() < 0.5;
      const w = (1.6 + rand() * 0.6) * speedUp;
      const ph = rand() * TAU;
      if (vertical) {
        ob.parts.push(boxPart(s0 + 4, 0, mid, 1.2, half + 1, 1.0, { ay: (ceiling - floor) / 2 - 1.8, w, ph }));
      } else {
        ob.parts.push(boxPart(s0 + 4, 0, mid, 1.2, 1.1, (ceiling - floor) / 2 + 2, { ax: half - 2.2, w, ph }));
      }
      if (storm) {
        ob.parts.push(boxPart(s0 + 22, 0, mid, 1.2, half + 1, 1.0, { ay: (ceiling - floor) / 2 - 1.8, w: w * 1.2, ph: ph + PI }));
        ob.depth = 26;
      } else ob.depth = 8;
      keys.push({ u: u + 4 / span, x: gx * 0.5, y: mid, mega: false });
    } else if (type === 'shutter') {
      const w = (TAU / 2.4) * speedUp;
      const ph = rand() * TAU;
      ob.parts.push({ shape: 'door', s: s0 + 3, side: -1, gx, hs: 0.8, open: 1.2, swing: 6.5, w, ph, half, floor, ceiling });
      ob.parts.push({ shape: 'door', s: s0 + 3, side: 1, gx, hs: 0.8, open: 1.2, swing: 6.5, w, ph, half, floor, ceiling });
      ob.depth = 6;
      keys.push({ u: u + 3 / span, x: gx, y: mid, mega: false });
      extraCells.push({ s: s0 + 14, x: gx, y: mid, mega: true });
    } else if (type === 'fan') {
      const radius = Math.min(half, (ceiling - floor) / 2) - 1.5;
      const w = (1.5 + rand() * 0.4) * speedUp * (rand() < 0.5 ? -1 : 1);
      const ph = rand() * TAU;
      const hubX = clamp(gx, -half + radius + 1, half - radius - 1);
      for (let b = 0; b < 3; b++) {
        ob.parts.push({ shape: 'blade', s: s0 + 4, hs: 0.8, cx: hubX, cy: mid, length: radius, width: 1.2, w, ph: ph + (b * TAU) / 3 });
      }
      ob.parts.push(boxPart(s0 + 4, hubX, mid, 1.0, 1.4, 1.4));
      ob.depth = 8;
      // The open wedge between blades is the line; cells sit either side of the fan.
      keys.push({ u: u - 10 / span, x: hubX + radius * 0.55, y: mid, mega: false });
      keys.push({ u: u + 18 / span, x: hubX - radius * 0.3, y: mid + 3, mega: false });
    } else if (type === 'debris') {
      const count = storm ? 5 : 4;
      for (let i = 0; i < count; i++) {
        const w = (0.9 + rand() * 0.9) * speedUp;
        ob.parts.push(boxPart(
          s0 + i * 18 + rand() * 6,
          (rand() * 2 - 1) * half * 0.3,
          mix(floor + 4, ceiling - 4, rand()),
          1.8, 1.8, 1.8,
          { ax: half * 0.6, ay: (ceiling - floor) * 0.25, w, ph: rand() * TAU, w2: w * 0.7 },
        ));
      }
      ob.depth = count * 18 + 6;
      keys.push({ u: u + (ob.depth / span) * 0.5, x: gx, y: gy, mega: false });
    } else if (type === 'split') {
      // A long horizontal plate splits the lane: rich cell trail above, Mega Cells below.
      const length = 130;
      ob.parts.push(boxPart(s0 + length / 2, 0, mid, length / 2, half + 1, 0.8));
      for (let i = 0; i < 5; i++) {
        ob.parts.push(boxPart(s0 + 18 + i * 24, (i % 2 ? 1 : -1) * half * 0.42, mid + 6, 1.3, 1.3, 6));
      }
      ob.depth = length;
      for (let i = 0; i < 6; i++) {
        extraCells.push({ s: s0 + 12 + i * 21, x: (i % 2 ? -1 : 1) * half * 0.12, y: mid + 5, mega: false });
      }
      extraCells.push({ s: s0 + 45, x: half * 0.55, y: floor + 3, mega: true });
      extraCells.push({ s: s0 + 95, x: -half * 0.55, y: floor + 3, mega: true });
      keys.push({ u: u + (length / span) + 0.01, x: 0, y: mid, mega: false });
    }
    obstacles.push(ob);
  }
  if(crossing){
    // These are reserved open windows between the stock obstacle clusters. Add
    // crossings without drawing from the seeded stream that places those clusters.
    const u=openingCrossing??[.445,.565,.454][lapIndex];
    const s=lane.start+u*span;
    const [hx,hy,hs]=crossing==='plane'?[5.4,1.35,2.7]:crossing==='birds'?[4.1,1.28,2.4]:[4.6,1.68,2.3];
    const phase=hash(seed+790)*TAU;
    const y=mid+([5.7,-4.8,.8][lapIndex]);
    const motion={ax:half+hx+3,ay:.85,w:(crossing==='birds'?1.16:.99)*speedUp,ph:phase,w2:.43};
    const part=boxPart(s,0,y,hs,hx,hy,motion);
    part.crossing=crossing;
    obstacles.push({type:'crossing',variant:crossing,s:s-hs,depth:hs*2,parts:[part],warn:s-72});
    obstacles.sort((a,b)=>a.s-b.s);
  }
  keys.push({ u: 1 - TAPER, x: 0, y: mix(floor, ceiling, 0.3), mega: false });
  keys.sort((a, b) => a.u - b.u);

  // The cell line runs through every cluster's risky gap; between keys it eases
  // smoothly so a cell trail reads as a line to follow.
  const cells = [];
  const regular = Math.max(10, Math.round(span / 75));
  for (let i = 0; i < regular; i++) {
    const u = RUNWAY + ((1 - RUNWAY - TAPER) * (i + 0.5)) / regular;
    let k = 0;
    while (k < keys.length - 2 && keys[k + 1].u < u) k++;
    const a = keys[k];
    const b = keys[k + 1];
    const t = smoothstep(0, 1, clamp((u - a.u) / Math.max(1e-6, b.u - a.u), 0, 1));
    cells.push({ s: lane.start + u * span, x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), mega: false });
  }
  for (const key of keys) if (key.mega) cells.push({ s: lane.start + key.u * span, x: key.x, y: key.y, mega: true });
  for (const cell of extraCells) cells.push(cell);
  cells.sort((a, b) => a.s - b.s);
  // Drop regular cells buried inside a solid part at race start, then cap the count.
  const kept = cells.filter((cell) => cell.mega || !insideStatic(obstacles, cell));
  kept.length = Math.min(kept.length, MAX_CELLS);
  kept.forEach((cell, i) => { cell.index = i; });
  // About one row per 300 m, matching the item rows the lane's road used to have.
  const rows = Math.max(2, Math.round(span / 300) + (programme.length > 4 || storm ? 1 : 0));
  return { obstacles, cells: kept, boxes: boxRows(lane, obstacles, rows), sMin: lane.start, sMax: lane.end };
}

// Floating item boxes: rows of three across the corridor in the open stretches
// between obstacle clusters, so the air race keeps its item fights.
function boxRows(lane, obstacles, rows) {
  const span = lane.end - lane.start;
  const lo = lane.start + span * RUNWAY + 30;
  const hi = lane.end - span * TAPER - 40;
  const blocked = (s) => obstacles.some((ob) => s > ob.s - 26 && s < ob.s + ob.depth + 18);
  const half = lane.width / 2;
  const mid = (lane.floor + lane.ceiling) / 2;
  const boxes = [];
  for (let r = 0; r < rows; r++) {
    const target = mix(lo, hi, (r + 0.5) / rows);
    let s = null;
    for (let d = 0; d < span && s === null; d += 6) {
      if (target + d < hi && !blocked(target + d)) s = target + d;
      else if (target - d > lo && !blocked(target - d)) s = target - d;
    }
    if (s === null || boxes.some((b) => Math.abs(b.s - s) < 60)) continue;
    const lift = (r % 3 - 1) * (lane.ceiling - lane.floor) * 0.18;
    for (let i = -1; i <= 1; i++) {
      boxes.push({ index: boxes.length, s, x: i * half * 0.46, y: mid + lift + Math.abs(i) * 1.5 });
    }
  }
  return boxes;
}

export const BOX_GRAB_RADIUS = 2.4;

/**
 * Grabs any floating item box a flying kart flew through this tick. Boxes are
 * per kart, keyed by lane and lap like Boost Cells. Returns true on a grab.
 */
export function grabSkyBox(sky, length, kart) {
  if (!kart.flying || !sky) return false;
  const lane = sky.lanes[kart.skyLane];
  if (!lane) return false;
  const lap = lapOf(kart.s, length);
  const key = lane.index * 4 + lap;
  if (kart.skyBoxKey !== key) {
    kart.skyBoxKey = key;
    kart.skyBoxGot = 0;
  }
  const local = kart.s - Math.floor(kart.s / length) * length;
  const got = sweepBoxes(lane.layouts[lap - 1], kart.skyBoxGot, kart.skyPrevS, kart.skyPrevX, kart.skyPrevY, local, kart.x, kart.skyY);
  if (!got) return false;
  // One grab per tick, like a ground box row.
  kart.skyBoxGot |= got & -got;
  return true;
}

/** Bitmask of floating item boxes (not already in `got`) the segment passes through. */
export function sweepBoxes(layout, got, s0, x0, y0, s1, x1, y1) {
  return sweepCells({ cells: layout.boxes }, got, s0, x0, y0, s1, x1, y1, BOX_GRAB_RADIUS);
}

function insideStatic(obstacles, cell) {
  for (const ob of obstacles) {
    for (const p of ob.parts) {
      if (p.shape !== 'box' || p.motion) continue;
      if (Math.abs(cell.s - p.s) < p.hs + CELL_RADIUS && Math.abs(cell.x - p.x) < p.hx + CELL_RADIUS && Math.abs(cell.y - p.y) < p.hy + CELL_RADIUS) return true;
    }
  }
  return false;
}

/** Resolves a course's lanes against a track core's sections. */
export function createSky(course, sections, length) {
  const def = course.sky ?? SKY_COURSES[course.id];
  if (!def) return { theme: 'rig', lanes: [], laneAt: () => -1, inMainLane: () => false };
  const at = ([i, f]) => mix(sections[i].start, sections[i].end, f);
  const lanes = def.lanes.map((raw, index) => {
    const lane = {
      index,
      kind: raw.kind,
      optional: raw.kind === 'gate',
      start: at(raw.from),
      end: at(raw.to),
      width: raw.width,
      floor: raw.floor,
      ceiling: raw.ceiling,
      entry: raw.entry ?? null,
      openLap: raw.openLap ?? 1,
    };
    const programme = lane.optional ? GATE_PROGRAMME : MAIN_PROGRAMME;
    const opening = lane.optional ? null : OPENING_PROGRAMMES[def.theme];
    lane.layouts = programme.map((p, lap) => buildLayout(lane,
      lap === 0 && opening ? opening.obstacles : p,
      (course.number | 0) * 31 + index * 7 + lap + 1, lap === 2,
      lane.optional ? null : def.crossing, lap, lap === 0 ? opening?.crossing : undefined));
    return lane;
  });

  function laneAt(s) {
    const d = mod(s, length);
    for (let i = 0; i < lanes.length; i++) if (d >= lanes[i].start && d < lanes[i].end) return i;
    return -1;
  }

  function inMainLane(s, margin = 0) {
    const d = mod(s, length);
    for (let i = 0; i < lanes.length; i++) {
      const lane = lanes[i];
      if (!lane.optional && d >= lane.start - margin && d < lane.end + margin) return true;
    }
    return false;
  }

  return { theme: def.theme, lanes, laneAt, inMainLane };
}

/** The race lap (1-3) a kart is on, from its unwrapped distance. */
export function lapOf(s, length) {
  return clamp(Math.floor(s / length) + 1, 1, 3);
}

/** The lane a kart launches into when it crosses a catapult this tick, or -1. */
export function catapultCrossed(sky, length, s0, x0, s1, x1) {
  if (!sky || s1 <= s0) return -1;
  for (let i = 0; i < sky.lanes.length; i++) {
    const lane = sky.lanes[i];
    const offset = mod(lane.start - s0, length);
    if (offset <= 0 || offset > s1 - s0) continue;
    if (lane.optional) {
      if (lapOf(s1, length) < lane.openLap) continue;
      const t = offset / (s1 - s0);
      const x = mix(x0, x1, t);
      if (x < lane.entry[0] || x > lane.entry[1]) continue;
    }
    return i;
  }
  return -1;
}

function exitTaper(lane, s, length) {
  const d = mod(s, length);
  const u = (d - lane.start) / (lane.end - lane.start);
  return smoothstep(1 - TAPER - 0.04, 1, u);
}

/** Corridor ceiling, tapering down onto the landing deck over the final stretch. */
export function laneCeiling(lane, s, length) {
  return mix(lane.ceiling, 1.2, exitTaper(lane, s, length));
}

/** Corridor floor, easing down to the deck so a kart touches down as the lane ends. */
export function laneFloor(lane, s, length) {
  return mix(lane.floor, 0.3, exitTaper(lane, s, length));
}

const pose = { s: 0, x: 0, y: 0, hs: 0, hx: 0, hy: 0 };

/** Writes a box or door part's centre and half sizes at race time `t`. */
export function partPose(p, t, out = pose) {
  if (p.shape === 'door') {
    const opening = p.open + p.swing * Math.max(0, sin(p.w * t + p.ph));
    const edge = p.gx + p.side * opening;
    const wall = p.side * p.half;
    out.s = p.s;
    out.hs = p.hs;
    out.x = (edge + wall) / 2 + p.side * 0.5;
    out.hx = Math.abs(wall - edge) / 2 + 0.5;
    out.y = (p.floor + p.ceiling) / 2;
    out.hy = (p.ceiling - p.floor) / 2 + 2;
    return out;
  }
  out.s = p.s;
  out.hs = p.hs;
  out.hx = p.hx;
  out.hy = p.hy;
  out.x = p.x;
  out.y = p.y;
  const m = p.motion;
  if (m) {
    if (m.ax) out.x += m.ax * sin(m.w * t + m.ph);
    if (m.ay) out.y += m.ay * (m.w2 ? cos(m.w2 * t + m.ph) : sin(m.w * t + m.ph));
  }
  return out;
}

/** Blade angle at race time `t`. */
export function bladeAngle(p, t) {
  return p.w * t + p.ph;
}

const hitScratch = { hit: false, head: false, nx: 0, ny: 0, push: 0, part: null, obstacle: -1, s: 0 };

function testBox(p, t, s, x, y, r, out) {
  partPose(p, t, pose);
  const ds = Math.abs(s - pose.s) - pose.hs;
  if (ds > r) return false;
  const dx = Math.abs(x - pose.x) - pose.hx;
  const dy = Math.abs(y - pose.y) - pose.hy;
  if (dx > r || dy > r) return false;
  const ex = Math.max(0, ds);
  const ey = Math.max(0, dx);
  const ez = Math.max(0, dy);
  if (ex * ex + ey * ey + ez * ez > r * r) return false;
  out.hit = true;
  out.head = dx < 0 && dy < 0;
  // Push out through the nearest cross-section face that stays inside the corridor.
  const b = bounds;
  const right = pose.x + pose.hx + r - x;
  const left = x - (pose.x - pose.hx - r);
  const up = pose.y + pose.hy + r - y;
  const down = y - (pose.y - pose.hy - r);
  let best = Infinity;
  out.nx = 0;
  out.ny = 0;
  out.push = 0;
  if (x + right <= b.half && right < best) { best = right; out.nx = 1; out.ny = 0; }
  if (x - left >= -b.half && left < best) { best = left; out.nx = -1; out.ny = 0; }
  if (y + up <= b.ceiling && up < best) { best = up; out.nx = 0; out.ny = 1; }
  if (y - down >= b.floor && down < best) { best = down; out.nx = 0; out.ny = -1; }
  out.push = Number.isFinite(best) ? best : 0;
  out.s = pose.s - pose.hs;
  return true;
}

// Corridor limits for push-out, set per sweep.
const bounds = { half: 16, floor: 2, ceiling: 26 };

function testBlade(p, t, s, x, y, r, out) {
  if (Math.abs(s - p.s) > p.hs + r) return false;
  const a = bladeAngle(p, t);
  const ux = cos(a);
  const uy = sin(a);
  const rx = x - p.cx;
  const ry = y - p.cy;
  const along = clamp(rx * ux + ry * uy, 0, p.length);
  const px = rx - ux * along;
  const py = ry - uy * along;
  const dist = Math.sqrt(px * px + py * py);
  if (dist > p.width + r) return false;
  out.hit = true;
  out.head = dist < p.width;
  const inv = dist > 1e-6 ? 1 / dist : 0;
  out.nx = inv ? px * inv : -uy;
  out.ny = inv ? py * inv : ux;
  out.push = p.width + r - dist;
  out.s = p.s - p.hs;
  return true;
}

/**
 * Swept obstacle test from (s0,x0,y0) to (s1,x1,y1) at race time `t`. Samples the
 * segment every 0.7 m, so nothing is skipped at 2 m per tick. Returns the first hit
 * or null. Distances are lane-local (s already wrapped into the lane's range).
 */
export function sweepObstacles(layout, t, s0, x0, y0, s1, x1, y1, lane = null, r = SKY_KART_RADIUS) {
  bounds.half = lane ? lane.width / 2 - 0.9 : 16;
  bounds.floor = lane ? lane.floor : 2;
  bounds.ceiling = lane ? lane.ceiling : 26;
  const lo = Math.min(s0, s1) - r - 2;
  const hi = Math.max(s0, s1) + r + 2;
  const ls = s1 - s0;
  const lx = x1 - x0;
  const ly = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.sqrt(ls * ls + lx * lx + ly * ly) / 0.7));
  for (let n = 1; n <= steps; n++) {
    const f = n / steps;
    const s = mix(s0, s1, f);
    const x = mix(x0, x1, f);
    const y = mix(y0, y1, f);
    for (let i = 0; i < layout.obstacles.length; i++) {
      const ob = layout.obstacles[i];
      if (ob.s - 4 > hi || ob.s + ob.depth + 4 < lo) continue;
      for (let j = 0; j < ob.parts.length; j++) {
        const p = ob.parts[j];
        hitScratch.hit = false;
        const found = p.shape === 'blade' ? testBlade(p, t, s, x, y, r, hitScratch) : testBox(p, t, s, x, y, r, hitScratch);
        if (found) {
          hitScratch.part = p;
          hitScratch.obstacle = i;
          hitScratch.at = f;
          return hitScratch;
        }
      }
    }
  }
  return null;
}

/** Returns a bitmask of cells (not already in `got`) whose sphere the segment passes through. */
export function sweepCells(layout, got, s0, x0, y0, s1, x1, y1, radius = CELL_GRAB_RADIUS) {
  let found = 0;
  const lo = Math.min(s0, s1) - radius;
  const hi = Math.max(s0, s1) + radius;
  const ds = s1 - s0;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = ds * ds + dx * dx + dy * dy;
  for (let i = 0; i < layout.cells.length; i++) {
    const c = layout.cells[i];
    if (c.s < lo || c.s > hi) continue;
    const bit = 1 << c.index;
    if (got & bit) continue;
    const t = lenSq > 1e-9 ? clamp(((c.s - s0) * ds + (c.x - x0) * dx + (c.y - y0) * dy) / lenSq, 0, 1) : 0;
    const es = s0 + ds * t - c.s;
    const ex = x0 + dx * t - c.x;
    const ey = y0 + dy * t - c.y;
    if (es * es + ex * ex + ey * ey <= radius * radius) found |= bit;
  }
  return found;
}

/** The next uncollected cell ahead of `s` within `range` metres, or null. */
export function nextCell(layout, got, s, range = 140) {
  let best = null;
  for (let i = 0; i < layout.cells.length; i++) {
    const c = layout.cells[i];
    if (c.s < s + 2 || c.s > s + range) continue;
    if (got & (1 << c.index)) continue;
    if (!best || c.s < best.s) best = c;
  }
  return best;
}

export { SKY_COURSES };
