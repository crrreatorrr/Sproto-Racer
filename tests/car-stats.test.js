import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CAR_CLASSES, CLASS_OF, classTuning } from '../src/car-classes.js';
import { CARS, carById } from '../src/roster.js';

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
