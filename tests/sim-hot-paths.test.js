// Guards for the simulation's fast paths. Each one is a shortcut that must give exactly the
// answer the plain version gives, so each test compares the shortcut with the plain version.
// (The whole-race check against an earlier commit is scripts/bench/sim-hashes.mjs.)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createRng } from '../src/sim/rng.js';
import { createSimWorld } from '../src/sim/world.js';
import { applySnapshot, captureSnapshot } from '../src/sim/snapshot.js';
import { stateHash } from '../src/sim/hash.js';
import { createRoadIndex, itemsAhead } from '../src/sim/road-index.js';
import { createTrackCore, CIRCUITS } from '../src/sim/track-core.js';
import { carById } from '../src/roster.js';
import { footprintContact, hullsApart, kartFootprint, lastSeparatingAxis, separatedOn } from '../src/kart-footprint.js';
import { contactTime, shapedItemContactTime } from '../src/projectile-contact.js';

const SHAPED = ['shopping-cart', 'skipper', 'saucer', 'manta', 'crestline', 'geep', 'barrage', 'ironhide', 'track-formula', 'arctic-skip', 'apex'];

const plainHull = (hull) => ({
  points: hull.points.map((p) => ({ s: p.s, x: p.x })),
  axes: hull.axes.map((a) => ({ s: a.s, x: a.x, lo: a.lo, hi: a.hi })),
  along: { lo: hull.along.lo, hi: hull.along.hi },
  across: { lo: hull.across.lo, hi: hull.across.hi },
});
const plainFootprint = (fp) => ({
  body: plainHull(fp.body),
  bands: fp.bands.map((b) => ({ low: b.low, high: b.high, isBody: b.hull === fp.body, hull: plainHull(b.hull) })),
});

describe('kart footprint reuse', () => {
  it('gives a reused kart the same outline as a kart that has never been measured', () => {
    const rng = createRng(20261126);
    for (const id of SHAPED) {
      const tuning = carById(id);
      const kart = { tuning, yaw: 0, steer: 0, speed: 20 };
      for (let n = 0; n < 40; n++) {
        kart.yaw = (rng.nextFloat() - 0.5) * 6;
        kart.steer = n % 5 === 0 ? kart.steer : (rng.nextFloat() - 0.5) * 2;
        kart.speed = rng.nextFloat() * 60;
        const reused = kartFootprint(kart);
        // Read only some bands on some turns, so stale, half-read and fresh buffers all occur.
        if (n % 3 === 0) for (let i = 0; i < reused.bands.length; i += 2) void reused.bands[i].hull.axes;
        if (n % 4 !== 0) continue;
        const fresh = kartFootprint({ tuning, yaw: kart.yaw, steer: kart.steer, speed: kart.speed });
        assert.deepEqual(plainFootprint(reused), plainFootprint(fresh), `${id} turn ${n}`);
      }
    }
  });

  it('follows a kart whose car changes', () => {
    const kart = { tuning: carById('manta'), yaw: 0.3, steer: 0.2, speed: 30 };
    kartFootprint(kart);
    for (const id of ['saucer', 'apex', 'ironhide', 'track-formula', 'manta']) {
      kart.tuning = carById(id);
      assert.deepEqual(
        plainFootprint(kartFootprint(kart)),
        plainFootprint(kartFootprint({ tuning: kart.tuning, yaw: 0.3, steer: 0.2, speed: 30 })),
        id,
      );
    }
  });

  it('keeps its cache out of copies, snapshots and JSON', () => {
    const world = createSimWorld({ courseId: 'track01', seed: 3, seats: SHAPED.slice(0, 6).map((car) => ({ kind: 'ai', car })) });
    for (let t = 0; t < 400; t++) world.step({});
    const kart = world.state.actors[3].kart;
    kartFootprint(kart);
    assert.ok(kart._fp, 'the cache exists');
    assert.equal(Object.keys(kart).includes('_fp'), false);
    assert.equal('_fp' in { ...kart }, false);
    assert.equal(JSON.stringify(captureSnapshot(world)).includes('_fp'), false);
  });
});

describe('restoring a snapshot', () => {
  const seats = ['manta', 'ironhide', 'skipper', 'saucer', 'barrage', 'crestline', 'geep', 'shopping-cart'].map((car) => ({ kind: 'ai', car }));

  function hashesOver(world, ticks) {
    const out = [];
    for (let t = 0; t < ticks; t++) {
      world.step({});
      if (t % 10 === 9) out.push(stateHash(world));
    }
    return out;
  }

  it('replays identically in the same world, whose karts hold outlines from the future', () => {
    for (const course of CIRCUITS) {
      const world = createSimWorld({ courseId: course.id, seed: 61, seats });
      for (let t = 0; t < 420; t++) world.step({});
      const snap = captureSnapshot(world);
      const first = hashesOver(world, 360);
      for (let round = 0; round < 2; round++) {
        assert.equal(applySnapshot(world, snap), true);
        assert.deepEqual(hashesOver(world, 360), first, `${course.id} replay ${round + 1}`);
      }
    }
  });

  it('replays identically in a world that was running different cars', () => {
    const world = createSimWorld({ courseId: 'track02', seed: 61, seats });
    for (let t = 0; t < 420; t++) world.step({});
    const snap = JSON.parse(JSON.stringify(captureSnapshot(world)));
    const expected = hashesOver(world, 300);

    const other = createSimWorld({ courseId: 'track02', seed: 9, seats: seats.slice().reverse() });
    for (let t = 0; t < 700; t++) other.step({});
    assert.equal(applySnapshot(other, snap), true);
    assert.deepEqual(hashesOver(other, 300), expected);
  });
});

describe('road index', () => {
  it('returns every item a full scan would accept, in array order', () => {
    const rng = createRng(77);
    for (const length of [100, 6616.9, 9166.6]) {
      const items = [];
      for (let i = 0; i < 240; i++) {
        // Rows that share a distance, as pickups do, plus stragglers in no particular order.
        const s = i % 3 === 0 || !items.length ? rng.nextFloat() * length : items[items.length - 1].s;
        items.push({ s });
      }
      items.push({ s: 0 }, { s: length - 1e-9 }, { s: length / 2 });
      const index = createRoadIndex(items, length);
      for (let n = 0; n < 4000; n++) {
        const from = (rng.nextFloat() * 5 - 1) * length;
        const span = [0, 0.02, 1.3, 65, length * 0.4, length * 1.5][n % 6] * (0.5 + rng.nextFloat());
        const count = itemsAhead(index, from, span);
        const found = index.found.slice(0, count);
        assert.deepEqual(found, found.slice().sort((a, b) => a - b), 'ascending array order');
        assert.equal(new Set(found).size, count, 'no item twice');
        for (let i = 0; i < items.length; i++) {
          // The exact tests the simulation applies: a kart crossing an item, an AI looking ahead.
          const offset = (((items[i].s - from) % length) + length) % length;
          const ahead = ((((items[i].s - from + length / 2) % length) + length) % length) - length / 2;
          if ((offset > 0 && offset <= span) || (ahead >= 0 && ahead <= span && span < length / 2)) {
            assert.ok(found.includes(i), `item ${i} at ${items[i].s} missed from ${from} span ${span}`);
          }
        }
      }
    }
  });

  it('indexes the real circuits and falls back to everything when it cannot index', () => {
    for (const course of CIRCUITS) {
      const track = createTrackCore(course);
      const index = createRoadIndex(track.pickups, track.length);
      assert.equal(index.usable, true);
      assert.ok(itemsAhead(index, track.pickups[0].s - 1, 2) >= 1);
      assert.ok(itemsAhead(index, 0, 3) < track.pickups.length / 4);
    }
    const loose = createRoadIndex([{ s: 1 }, { s: NaN }, { s: 3 }], 100);
    assert.equal(itemsAhead(loose, 0, 1), 3);
    assert.equal(itemsAhead(createRoadIndex([{ s: 1 }, { s: 2 }], 0), 0, 1), 2);
    assert.equal(itemsAhead(createRoadIndex(undefined, 100), 0, 1), 0);
  });
});

describe('contact shortcuts', () => {
  const pose = (rng, id) => ({ tuning: carById(id), yaw: (rng.nextFloat() - 0.5) * 6, steer: (rng.nextFloat() - 0.5) * 2, speed: rng.nextFloat() * 50 });

  it('only skips an overlap test whose answer is "no contact"', () => {
    const rng = createRng(4242);
    let skippedByCircle = 0;
    let skippedByAxis = 0;
    let touching = 0;
    for (let n = 0; n < 2500; n++) {
      const a = kartFootprint(pose(rng, SHAPED[n % SHAPED.length]));
      const b = kartFootprint(pose(rng, SHAPED[(n * 7 + 3) % SHAPED.length]));
      // Mostly close calls: centers a car length or so apart.
      const reach = a.reach + b.reach;
      const ds = (rng.nextFloat() - 0.5) * 2.4 * reach;
      const dx = (rng.nextFloat() - 0.5) * 2.4 * reach;
      const hullsA = [a.body, ...a.bands.map((band) => band.hull)];
      const hullsB = [b.body, ...b.bands.map((band) => band.hull)];
      const circlesA = [a.body, ...a.bands.map((band) => band.circle)];
      const circlesB = [b.body, ...b.bands.map((band) => band.circle)];
      for (let i = 0; i < hullsA.length; i += 1 + (n % 3)) {
        for (let j = 0; j < hullsB.length; j += 1 + (n % 2)) {
          const contact = footprintContact(hullsA[i], hullsB[j], ds, dx);
          const axis = contact ? 0 : lastSeparatingAxis();
          if (contact) touching++;
          if (hullsApart(circlesA[i], circlesB[j], ds, dx)) {
            skippedByCircle++;
            assert.equal(contact, null, 'parts whose circles are clear do not touch');
          }
          // A whole car's circle stands in for any of its parts.
          if (hullsApart(circlesA[i], b, ds, dx) || hullsApart(a, circlesB[j], ds, dx)) {
            assert.equal(contact, null, 'a part clear of the whole other car does not touch it');
          }
          if (axis) {
            assert.equal(separatedOn(hullsA[i], hullsB[j], ds, dx, axis), true, 'the reported axis separates');
            skippedByAxis++;
            // Nudged a little, the remembered axis may or may not still separate. If it says so, it must be right.
            const ds2 = ds + (rng.nextFloat() - 0.5) * 0.4;
            const dx2 = dx + (rng.nextFloat() - 0.5) * 0.4;
            if (separatedOn(hullsA[i], hullsB[j], ds2, dx2, axis)) {
              assert.equal(footprintContact(hullsA[i], hullsB[j], ds2, dx2), null);
            }
          }
        }
      }
    }
    assert.ok(touching > 2000 && skippedByCircle > 2000 && skippedByAxis > 2000, `covered ${touching} / ${skippedByCircle} / ${skippedByAxis}`);
  });

  // The sweep as it was first written: one closure-built slab test per band, in a fixed order.
  function referenceContactTime(a, b, halfS, halfX, halfY, length, hull = null, scale = 1, centerY = 0) {
    const wrap = (d) => d - Math.round(d / length) * length;
    let enter = 0;
    let exit = 1;
    function slab(start, travel, extent, center = 0) {
      start -= center;
      if (Math.abs(travel) < 1e-8) return Math.abs(start) <= extent;
      const t1 = (-extent - start) / travel;
      const t2 = (extent - start) / travel;
      enter = Math.max(enter, Math.min(t1, t2));
      exit = Math.min(exit, Math.max(t1, t2));
      return enter <= exit;
    }
    const s0 = wrap(a.s0 - b.s0) * scale;
    const ds = (wrap(a.s - a.s0) - wrap(b.s - b.s0)) * scale;
    const x0 = a.x0 - b.x0;
    const dx = (a.x - a.x0) - (b.x - b.x0);
    const band = (start, travel, range, padding) => slab(start, travel, (range.hi - range.lo) / 2 + padding, (range.hi + range.lo) / 2);
    if (hull) {
      if (!band(s0, ds, hull.along, halfS) || !band(x0, dx, hull.across, halfX)) return Infinity;
      for (const n of hull.axes) {
        if (!band(s0 * n.s + x0 * n.x, ds * n.s + dx * n.x, n, halfS * Math.abs(n.s) + halfX * Math.abs(n.x))) return Infinity;
      }
    } else if (!slab(s0, ds, halfS) || !slab(x0, dx, halfX)) return Infinity;
    return slab(a.y0 - b.y0, (a.y - a.y0) - (b.y - b.y0), halfY, centerY) ? enter : Infinity;
  }
  function referenceShapedTime(item, path, kart, padX, length) {
    let first = Infinity;
    for (const { hull, low, high } of kartFootprint(kart).bands) {
      first = Math.min(first, referenceContactTime(item, path, 0.70, padX, 0.80 + (high - low) / 2, length, hull, path.roadScale, (low + high) / 2 - 0.8));
    }
    return first;
  }

  it('sweeps items against karts to the same instant as the plain sweep', () => {
    const rng = createRng(991);
    const length = 6616.9;
    let hits = 0;
    for (let n = 0; n < 6000; n++) {
      const kart = pose(rng, SHAPED[n % SHAPED.length]);
      const near = n % 4 !== 0;
      const spread = near ? 4 : 40;
      // Start either side of the finish line now and then, so the wrap is exercised.
      const origin = n % 7 === 0 ? length - 1 : rng.nextFloat() * length;
      const path = { s0: origin, x0: (rng.nextFloat() - 0.5) * 10, y0: 0.8 + rng.nextFloat() * 2, roadScale: 0.55 + rng.nextFloat() * 1.1 };
      path.s = path.s0 + (n % 9 === 0 ? 0 : rng.nextFloat() * 1.2);
      path.x = path.x0 + (rng.nextFloat() - 0.5) * 0.3;
      path.y = path.y0 + (rng.nextFloat() - 0.5) * 0.2;
      const item = { s0: path.s0 + (rng.nextFloat() - 0.5) * spread, x0: path.x0 + (rng.nextFloat() - 0.5) * spread, y0: path.y0 + (rng.nextFloat() - 0.5) * 3 };
      item.s = item.s0 + (n % 5 === 0 ? 0 : (rng.nextFloat() - 0.3) * 2.5);
      item.x = item.x0 + (n % 5 === 0 ? 0 : (rng.nextFloat() - 0.5) * 0.8);
      item.y = item.y0 + (n % 5 === 0 ? 0 : (rng.nextFloat() - 0.5) * 0.4);
      const padX = n % 2 ? 1.10 : 0.40;

      const expected = referenceShapedTime(item, path, kart, padX, length);
      assert.ok(Object.is(shapedItemContactTime(item, path, kart, padX, length), expected), `shaped sweep ${n}`);
      if (expected !== Infinity) hits++;

      const plain = referenceContactTime(item, path, 2.45, 1.65, 1.5, length);
      assert.ok(Object.is(contactTime(item, path, 2.45, 1.65, 1.5, length), plain), `box sweep ${n}`);
      const hull = kartFootprint(kart).body;
      assert.ok(
        Object.is(contactTime(item, path, 0.7, padX, 1.2, length, hull, path.roadScale, 0.3), referenceContactTime(item, path, 0.7, padX, 1.2, length, hull, path.roadScale, 0.3)),
        `hull sweep ${n}`,
      );
    }
    assert.ok(hits > 500, `only ${hits} sweeps made contact`);
  });
});
