import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CAR_CLASSES, CLASS_OF, className, classTuning, statBars } from '../src/car-classes.js';
import { CARS, carById } from '../src/roster.js';
import { createBoost, driftGrade, grantBoost, interruptBoost, stepBoost } from '../src/boost.js';
import { createKart } from '../src/driving.js';
import { CIRCUITS } from '../src/sim/track-core.js';
import { createSimWorld } from '../src/sim/world.js';
import { captureSnapshot, applySnapshot } from '../src/sim/snapshot.js';
import { ITEMS, pickupWeights } from '../src/items.js';
import { stateHash } from '../src/sim/hash.js';

const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} ≈ ${expected}`);
const RIVAL_IDS = ['apex', 'needle', 'pogo', 'gecko', 'relay', 'geep', 'hexshift', 'barrage', 'ironhide', 'crestline', 'manta', 'saucer', 'shopping-cart', 'skipper'];

describe('car classes', () => {
  it('every class totals 26 bars', () => {
    for (const [key, cls] of Object.entries(CAR_CLASSES)) {
      const bars = Object.values(cls.bars);
      assert.equal(bars.length, 5, key);
      for (const b of bars) assert.ok(Number.isInteger(b) && b >= 1 && b <= 10, `${key} bar ${b}`);
      assert.equal(bars.reduce((a, b) => a + b, 0), 26, key);
    }
  });

  it('every car has a class', () => {
    for (const car of CARS) assert.ok(CAR_CLASSES[car.class], `${car.id} has a class`);
    assert.equal(Object.keys(CLASS_OF).length, CARS.length);
  });

  it('tuning follows the bar formulas', () => {
    near(classTuning('speedster').speed, 1.032, 'speedster speed');
    near(classTuning('sprinter').accel, 1.24, 'sprinter accel');
    near(classTuning('booster').goodAt, 0.636, 'booster goodAt');
    near(classTuning('booster').perfectAt, 0.868, 'booster perfectAt');
    near(classTuning('lucky').luckShift, 0.18, 'lucky luckShift');
    const base = classTuning({ speed: 5, accel: 5, turn: 5, boost: 5, luck: 5 });
    for (const [field, value] of Object.entries({ speed: 1, accel: 1, turn: 1, goodAt: 0.70, perfectAt: 0.90, boostGain: 1, luckShift: 0 })) {
      near(base[field], value, `base ${field}`);
    }
  });

  it('cars carry their class tuning', () => {
    const manta = carById('manta');
    assert.equal(manta.class, 'speedster');
    near(manta.speed, classTuning('speedster').speed, 'manta speed');
    near(manta.boostGain, classTuning('speedster').boostGain, 'manta boost gain');
  });

  it('rival cars cover all six classes', () => {
    assert.equal(new Set(RIVAL_IDS.map((id) => carById(id).class)).size, 6);
    assert.equal(Object.keys(CAR_CLASSES).length, 6);
  });
});

describe('Boost stat', () => {
  const slidingKart = (carId) => {
    const kart = createKart(carById(carId));
    Object.assign(kart, { sliding: true, slideId: 1, grounded: true });
    return kart;
  };
  const release = (carId, meter, gain = carById(carId).boostGain) => {
    const kart = slidingKart(carId);
    const boost = createBoost(gain);
    Object.assign(boost, { activeSlide: 1, meter });
    stepBoost(boost, kart, { driftHeld: true, driftBoostPressed: true }, 0);
    return boost;
  };

  it("a Booster's GOOD window opens earlier", () => {
    assert.equal(carById('relay').class, 'booster');
    const early = release('apex', 0.65);
    assert.equal(early.reserve, 0);
    assert.equal(early.feedback, 'TOO EARLY');
    const booster = release('relay', 0.65);
    near(booster.reserve, 0.8 * carById('relay').boostGain, 'booster GOOD reserve');
    assert.match(booster.feedback, /^GOOD/);
  });

  it('PERFECT follows the car', () => {
    const base = release('apex', 0.88);
    assert.match(base.feedback, /^GOOD/);
    near(base.reserve, 0.8 * carById('apex').boostGain, 'base GOOD reserve');
    const booster = release('relay', 0.88);
    assert.match(booster.feedback, /^PERFECT/);
    near(booster.reserve, 1.2 * carById('relay').boostGain, 'booster PERFECT reserve');
  });

  it('boost gain scales grants but not Siphon', () => {
    const b = createBoost(1.12);
    grantBoost(b, 1);
    near(b.reserve, 1.12, 'scaled grant');
    grantBoost(b, 1, 1, false);
    near(b.reserve, 2.12, 'unscaled grant');
  });

  it('resets and restores keep the gain', () => {
    const b = createBoost(1.12);
    interruptBoost(b, createKart(carById('relay')), 'RAIL HIT');
    near(b.gain, 1.12, 'gain after interrupt');

    const seats = [{ kind: 'ai', gridIndex: 0, car: 'relay' }, { kind: 'ai', gridIndex: 1, car: 'needle' }];
    const a = createSimWorld({ course: CIRCUITS[0], seed: 5, seats });
    near(a.state.actors[0].boost.gain, carById('relay').boostGain, 'booster seat gain');
    near(a.state.actors[1].boost.gain, carById('needle').boostGain, 'speedster seat gain');
    for (let i = 0; i < 300; i++) a.step({});
    const snap = captureSnapshot(a);
    for (const actor of snap.actors) delete actor.boost.gain;
    const b2 = createSimWorld({ course: CIRCUITS[0], seed: 1, seats: [{ kind: 'ai', gridIndex: 0, car: 'apex' }, { kind: 'ai', gridIndex: 1, car: 'apex' }] });
    assert.equal(applySnapshot(b2, snap), true);
    near(b2.state.actors[0].boost.gain, carById('relay').boostGain, 'restored gain');
  });
});

describe('Luck stat', () => {
  const comet = ITEMS.findIndex((it) => it.name === 'Comet Candy');
  const soda = ITEMS.findIndex((it) => it.name === 'Soda Turbo');
  // Six karts in a line; `place` 0 leads. luckShift is set straight on the tuning.
  const pack = (place, luckShift) => {
    const karts = Array.from({ length: 6 }, (_, i) => ({ kart: { s: 600 - i * 20, tuning: { luckShift: 0 } } }));
    karts[place].kart.tuning = { luckShift };
    return { actor: karts[place], karts };
  };

  it('luck shifts the leader toward better items', () => {
    const base = pack(0, 0), lucky = pack(0, 0.3);
    const w0 = pickupWeights(base.actor, base.karts), w1 = pickupWeights(lucky.actor, lucky.karts);
    assert.equal(w0[comet], 0);
    assert.ok(w1[comet] > 0, 'a lucky leader can roll Comet Candy');
    assert.ok(w1[soda] < w0[soda], 'fewer Soda Turbos for a lucky leader');
  });

  it('luck stays within the table', () => {
    const last = pack(5, 0.3);
    assert.deepEqual(pickupWeights(last.actor, last.karts), ITEMS.map((it) => it.weights[1]));
    const first = pack(0, -0.08);
    assert.deepEqual(pickupWeights(first.actor, first.karts), ITEMS.map((it) => it.weights[0]));
    for (const w of pickupWeights(last.actor, last.karts)) assert.ok(w >= 0);
  });

  it('a lucky roll is still deterministic', () => {
    const seats = ['hexshift', 'saucer', 'apex', 'needle'].map((car, i) => ({ kind: 'ai', gridIndex: i, car }));
    const a = createSimWorld({ course: CIRCUITS[0], seed: 21, seats });
    const b = createSimWorld({ course: CIRCUITS[0], seed: 21, seats });
    for (let i = 0; i < 3000; i++) { a.step({}); b.step({}); }
    assert.equal(stateHash(a), stateHash(b));
  });
});

describe('Showing the stats', () => {
  it('garage rows show five stats', () => {
    assert.deepEqual(statBars(carById('manta')), [
      { id: 'speed', title: 'Speed', bars: 9 },
      { id: 'accel', title: 'Acceleration', bars: 3 },
      { id: 'turn', title: 'Turning', bars: 4 },
      { id: 'boost', title: 'Boost', bars: 6 },
      { id: 'luck', title: 'Luck', bars: 4 },
    ]);
    assert.equal(className(carById('manta')), 'Speedster');
  });

  it('HUD grade follows the car', () => {
    const at = (carId, meter) => driftGrade(Object.assign(createBoost(), { meter }), createKart(carById(carId)));
    assert.equal(at('relay', 0.64), 'GOOD');
    assert.equal(at('apex', 0.64), null);
    assert.equal(at('relay', 0.87), 'PERFECT');
    assert.equal(at('apex', 0.87), 'GOOD');
  });
});
