// A steering change in the middle of a powerslide bends the line gradually for a human driver.
// Rivals steer by exact numbers and keep the direct response they have always had.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createKart, stepKart } from '../src/driving.js';
import { createBoost } from '../src/boost.js';

const dt = 1 / 60;

/** Settle into a right-hand slide holding `from`, then switch to `to` and record what the kart does. */
function steerChange(from, to, { exactSteer = false, speed = 55 } = {}) {
  const kart = createKart();
  const road = { width: 100000 };
  const boost = createBoost();
  const step = (steer, driftHeld, driftPressed) => {
    kart.speed = speed;
    stepKart(kart, { steer, throttle: 1, driftHeld, driftPressed, exactSteer }, road, boost, dt);
  };
  for (let i = 0; i < 20; i++) step(1, false, false);
  step(1, true, true);
  for (let i = 0; i < 40; i++) step(1, true, false);
  assert.ok(kart.sliding, 'the kart is sliding');
  for (let i = 0; i < 150; i++) step(from, true, false);

  let nose = kart.yaw;
  let line = kart.travelYaw;
  step(from, true, false);
  const startRate = (kart.travelYaw - line) / dt;
  let noseRate = (kart.yaw - nose) / dt;
  let lineRate = startRate;
  nose = kart.yaw;
  line = kart.travelYaw;
  let noseSnap = 0;
  let lineSnap = 0;
  const lineRates = [];
  for (let i = 0; i < 180; i++) {
    step(to, true, false);
    const nextNose = (kart.yaw - nose) / dt;
    const nextLine = (kart.travelYaw - line) / dt;
    noseSnap = Math.max(noseSnap, Math.abs(nextNose - noseRate) / dt);
    lineSnap = Math.max(lineSnap, Math.abs(nextLine - lineRate) / dt);
    lineRates.push(nextLine);
    noseRate = nextNose;
    lineRate = nextLine;
    nose = kart.yaw;
    line = kart.travelYaw;
  }
  const endRate = lineRates.at(-1);
  const settled = lineRates.findIndex((rate) => Math.abs(rate - startRate) >= 0.9 * Math.abs(endRate - startRate));
  return { startRate, endRate, noseSnap, lineSnap, settleSeconds: (settled + 1) * dt };
}

const CHANGES = [[1, -1], [1, 0], [0, 1], [0, -1], [-1, 1], [-1, 0]];

describe('steering changes during a powerslide', () => {
  it('swing a human driver\'s kart more gently than a rival\'s direct steering, and the hardest swing less than half as hard', () => {
    for (const speed of [30, 55, 77]) {
      const worst = { humanNose: 0, rivalNose: 0, humanLine: 0, rivalLine: 0 };
      for (const [from, to] of CHANGES) {
        const human = steerChange(from, to, { speed });
        const rival = steerChange(from, to, { speed, exactSteer: true });
        const label = `${from} to ${to} at ${speed} m/s`;
        assert.ok(human.noseSnap < rival.noseSnap, `${label}: nose ${human.noseSnap} vs ${rival.noseSnap}`);
        assert.ok(human.lineSnap < rival.lineSnap, `${label}: line ${human.lineSnap} vs ${rival.lineSnap}`);
        worst.humanNose = Math.max(worst.humanNose, human.noseSnap);
        worst.rivalNose = Math.max(worst.rivalNose, rival.noseSnap);
        worst.humanLine = Math.max(worst.humanLine, human.lineSnap);
        worst.rivalLine = Math.max(worst.rivalLine, rival.lineSnap);
      }
      assert.ok(worst.humanNose < 0.5 * worst.rivalNose, `${speed} m/s nose: ${worst.humanNose} vs ${worst.rivalNose}`);
      assert.ok(worst.humanLine < 0.5 * worst.rivalLine, `${speed} m/s line: ${worst.humanLine} vs ${worst.rivalLine}`);
    }
  });

  it('still reach exactly the same turn, and within a second', () => {
    for (const speed of [30, 55, 77]) {
      for (const [from, to] of CHANGES) {
        const human = steerChange(from, to, { speed });
        const rival = steerChange(from, to, { speed, exactSteer: true });
        const label = `${from} to ${to} at ${speed} m/s`;
        assert.ok(Math.abs(human.endRate - rival.endRate) < 1e-3, `${label}: same final turn`);
        assert.ok(Math.abs(human.startRate - rival.startRate) < 1e-3, `${label}: same starting turn`);
        assert.ok(human.settleSeconds <= 1, `${label}: settles in ${human.settleSeconds}s`);
      }
    }
  });

  it('let a small correction land sooner than a full reversal', () => {
    const small = steerChange(1, 0);
    const full = steerChange(1, -1);
    assert.ok(small.settleSeconds < 0.55, `releasing the stick settles in ${small.settleSeconds}s`);
    assert.ok(full.settleSeconds > small.settleSeconds);
  });
});
