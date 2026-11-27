// Sounds and effects follow the seat the player drives, and an online race can take one back.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createCuePlayer, cueEvent } from '../src/race-cues.js';
import { onlineSwitch } from '../src/online-switch.js';

function setup(localSeat) {
  const tones = [];
  const stopped = [];
  const shown = [];
  const removed = [];
  const track = { pickups: [{ s: 40, x: -2 }, { s: 90, x: 3 }] };
  const cues = createCuePlayer({
    fx: { tone: (name) => { tones.push(name); return () => stopped.push(name); } },
    cue: (visual) => { shown.push(visual); return shown.length; },
    cancelCue: (token) => removed.push(token),
    localSeat: () => localSeat,
    track: () => track,
  });
  return { cues, tones, stopped, shown, removed };
}

describe('race cues', () => {
  it('plays bump and boost sounds for the seat the player drives, whichever it is', () => {
    for (const seat of [0, 3]) {
      const { cues, tones } = setup(seat);
      for (let other = 0; other < 6; other++) {
        cues.play({ type: 'bump', seat: other, tick: 10 });
        cues.play({ type: 'boost', seat: other, tick: 10 });
      }
      assert.deepEqual(tones, ['bump', 'boost'], `seat ${seat} heard someone else's kart, or not its own`);
    }
  });

  it('plays the countdown for everyone', () => {
    const { cues, tones } = setup(4);
    cues.playAll([{ type: 'tone', name: 'count', tick: 0 }, { type: 'tone', name: 'go', tick: 179 }]);
    assert.deepEqual(tones, ['count', 'go']);
  });

  it('shows every pickup where it sits on the road and marks only the player\'s own', () => {
    const { cues, shown } = setup(2);
    cues.play({ type: 'pickup', seat: 0, pickupIndex: 0, tick: 300 });
    cues.play({ type: 'pickup', seat: 2, pickupIndex: 1, tick: 301 });
    cues.play({ type: 'pickup', seat: 2, pickupIndex: 9, tick: 302 });
    assert.equal(shown.length, 2, 'a pickup that is not on this circuit was shown');
    assert.deepEqual([shown[0].s, shown[0].x, shown[0].isPlayer], [40, -2, false]);
    assert.deepEqual([shown[1].s, shown[1].x, shown[1].isPlayer], [90, 3, true]);
  });

  it('marks an item effect as the player\'s by seat, not by the simulation\'s seat-0 flag', () => {
    const { cues, shown } = setup(5);
    // The simulation calls seat 0 "the player". Online that is somebody else.
    cues.play(cueEvent({ phase: 'hit', type: 'rocket', seat: 0, isPlayer: true, s: 1, x: 0 }));
    cues.play(cueEvent({ phase: 'hit', type: 'rocket', seat: 5, isPlayer: false, s: 2, x: 0 }));
    assert.deepEqual(shown.map((c) => c.isPlayer), [false, true]);
  });

  it('stops a sound and removes an effect when the race takes the event back', () => {
    const { cues, tones, stopped, shown, removed } = setup(1);
    const bump = { type: 'bump', seat: 1, tick: 500 };
    const hit = cueEvent({ phase: 'hit', type: 'ball', seat: 1, s: 10, x: 0 });
    const kept = { type: 'boost', seat: 1, tick: 501 };
    cues.playAll([bump, hit, kept]);
    assert.deepEqual(tones, ['bump', 'boost']);
    assert.equal(shown.length, 1);

    cues.play({ type: 'cancel', tick: 500, event: bump });
    cues.play({ type: 'cancel', tick: 500, event: hit });
    assert.deepEqual(stopped, ['bump']);
    assert.deepEqual(removed, [1]);

    // Cancelling twice, or cancelling something that made no sound, does nothing more.
    cues.play({ type: 'cancel', tick: 500, event: bump });
    cues.play({ type: 'cancel', tick: 400, event: { type: 'bump', seat: 3, tick: 400 } });
    assert.deepEqual(stopped, ['bump']);
    assert.deepEqual(removed, [1]);
  });

  it('gives item effects of one seat and tick distinct names, so a replay can tell them apart', () => {
    const use = cueEvent({ phase: 'use', type: 'ball', seat: 2 });
    const hit = cueEvent({ phase: 'hit', type: 'ball', seat: 2 });
    assert.equal(use.type, 'cue');
    assert.equal(use.seat, 2);
    assert.notEqual(use.name, hit.name);
  });
});

describe('the online development switch', () => {
  it('is off in a production build whatever the address says', () => {
    assert.equal(onlineSwitch('?online=loopback&latency=120', false), null);
  });

  it('is off unless asked for', () => {
    assert.equal(onlineSwitch('', true), null);
    assert.equal(onlineSwitch('?online=hub', true), null);
  });

  it('reads latency, grid size and player count from the address and keeps them in range', () => {
    assert.deepEqual(onlineSwitch('?online=loopback', true), {
      kind: 'loopback', latencyMs: 60, jitterMs: 15, stallChance: 0, seats: 6, humans: 3, laps: 3, reuseItemMeshes: true,
    });
    const big = onlineSwitch('?online=loopback&latency=250&jitter=40&seats=12&humans=6&laps=1&reuse=0', true);
    assert.deepEqual([big.latencyMs, big.jitterMs, big.seats, big.humans, big.laps, big.reuseItemMeshes], [250, 40, 12, 6, 1, false]);
    const wild = onlineSwitch('?online=loopback&latency=-5&seats=99&humans=99&laps=abc', true);
    assert.deepEqual([wild.latencyMs, wild.seats, wild.humans, wild.laps], [0, 12, 12, 3]);
  });
});
