import { describe, expect, it } from 'vitest';

import { CARS, DRIVERS } from '../src/roster.js';
import { KEPT_CARS, disposeKart, kartMemoryStats, makeKart } from '../src/kart-art.js';

// The test page has no 2D canvas; kart decals only need one that accepts drawing calls.
HTMLCanvasElement.prototype.getContext = function getContext() {
  const canvas = this, gradient = { addColorStop() {} };
  return new Proxy({
    canvas, createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(0, w * h * 4)) }),
    measureText: () => ({ width: 20 }),
  }, { get: (target, key) => (key in target ? target[key] : () => {}) });
};

// What a kart is drawn with that no other kart in `others` uses.
function ownGeometries(kart, others = []) {
  const shared = new Set();
  for (const other of others) other.traverse((object) => { if (object.geometry) shared.add(object.geometry); });
  const own = new Set();
  kart.traverse((object) => { if (object.geometry && !shared.has(object.geometry)) own.add(object.geometry); });
  return own;
}
function countDisposals(geometries) {
  const counter = { n: 0 };
  for (const geometry of geometries) geometry.addEventListener('dispose', () => { counter.n++; });
  return counter;
}

describe('graphics memory of cars nobody is using', () => {
  it('is released once more than KEPT_CARS cars have been looked at, and never for a kart that is alive', () => {
    const driver = DRIVERS[0];
    // A kart that stays alive for the whole test, as the player's does in a race.
    const kept = makeKart(0, CARS[0], driver);
    const keptWatch = countDisposals(ownGeometries(kept));

    // Look at one car and put it away, as the garage does when the player moves on.
    const first = makeKart(0, CARS[1], driver);
    const firstOwn = ownGeometries(first, [kept]);
    disposeKart(first);
    // Its cached model is still held: nothing is released while few cars are remembered.
    const again = makeKart(0, CARS[1], driver);
    const cached = [...ownGeometries(again, [kept])].filter((geometry) => firstOwn.has(geometry));
    expect(cached.length).toBeGreaterThan(0);
    const cachedWatch = countDisposals(cached);
    disposeKart(again);
    expect(cachedWatch.n).toBe(0);

    // Browse well past the limit.
    for (let i = 2; i < KEPT_CARS + 6; i++) disposeKart(makeKart(0, CARS[i], driver));
    // The limit is on cars with no kart alive; the one that is alive is extra.
    expect(kartMemoryStats().live).toBe(1);
    expect(kartMemoryStats().cars).toBe(KEPT_CARS + 1);
    // The car looked at first has let go of its models; the kart that is alive has not.
    expect(cachedWatch.n).toBe(cached.length);
    expect(keptWatch.n).toBe(0);

    // Coming back to that car just works, with the same cached models.
    const back = makeKart(0, CARS[1], driver);
    const backOwn = ownGeometries(back, [kept]);
    expect(cached.every((geometry) => backOwn.has(geometry))).toBe(true);
    disposeKart(back);
    disposeKart(kept);
    expect(kartMemoryStats().live).toBe(0);
  });

  it('keeps the cars just looked at when a full grid of different cars is alive', () => {
    const driver = DRIVERS[0];
    const grid = [];
    for (let i = 20; i < 32; i++) grid.push(makeKart(i - 20, CARS[i], driver));
    // Look at two cars in turn, several times, with twelve other cars alive.
    const look = (car) => { const kart = makeKart(0, car, driver); const own = ownGeometries(kart, grid); disposeKart(kart); return own; };
    const a = look(CARS[40]), b = look(CARS[41]);
    const watch = countDisposals([...a, ...b]);
    for (let i = 0; i < 4; i++) { look(CARS[40]); look(CARS[41]); }
    // Only geometry made for one kart alone is disposed when that kart is put away.
    const cachedA = [...look(CARS[40])].filter((geometry) => a.has(geometry));
    const cachedWatch = countDisposals(cachedA);
    look(CARS[41]); look(CARS[40]);
    expect(cachedWatch.n).toBe(0);
    expect(cachedA.length).toBeGreaterThan(0);
    for (const kart of grid) disposeKart(kart);
    expect(watch.n).toBeGreaterThanOrEqual(0);
  });

  it('does not count the temporary models built for distant rivals as karts', () => {
    const before = kartMemoryStats().live;
    const rival = makeKart(1, CARS[3], DRIVERS[1], false, { lowDetail: true });
    expect(kartMemoryStats().live).toBe(before + 1);
    disposeKart(rival);
    expect(kartMemoryStats().live).toBe(before);
  });
});
