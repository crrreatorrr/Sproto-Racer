import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import { CIRCUITS } from '../src/circuits.js';
import { createTrack } from '../src/track.js';
import { createGameplay } from '../src/gameplay.js';
import { createItemFx } from '../src/item-fx.js';
import { makeKart, animateKart, disposeKart } from '../src/kart-art.js';
import { updateRivalVisibility } from '../src/kart-visibility.js';
import { warmRaceShaders } from '../src/shader-warmup.js';
import { carById, driverById } from '../src/roster.js';

// happy-dom has no 2D canvas; kart number plates and track signs only need the calls to exist.
const proto = globalThis.HTMLCanvasElement?.prototype;
if (proto && !proto.__racerMocked) {
  const original = proto.getContext;
  const gradient = { addColorStop() {} };
  const ignore = new Proxy({}, {
    get: (target, key) => key in target ? target[key]
      : key === 'measureText' ? (text) => ({ width: String(text).length * 9 })
      : key.startsWith?.('create') ? () => gradient : () => {},
    set: (target, key, value) => { target[key] = value; return true; },
  });
  proto.getContext = function getContext(type, ...args) {
    return type === '2d' ? ignore : original ? original.call(this, type, ...args) : null;
  };
  proto.__racerMocked = true;
}

// Stands in for WebGLRenderer.compileAsync: records which materials each call would compile.
function fakeRenderer() {
  const calls = [];
  return {
    calls,
    compileAsync(root, camera, target = null) {
      const materials = new Set(), names = new Set();
      root.traverse((o) => {
        if (o.material) materials.add(o.material);
        if (o.name) names.add(o.name);
      });
      calls.push({ root, target, materials, names });
      return Promise.resolve(root);
    },
  };
}

function raceScene() {
  const scene = new THREE.Scene();
  const track = createTrack(scene, CIRCUITS[0], { deferVisuals: true });
  const play = createGameplay(scene, track);
  const itemFx = createItemFx(scene, track);
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.15, 2300);
  camera.position.set(0, 2.5, 9);
  camera.lookAt(0, 1.2, 0);
  camera.updateMatrixWorld(true);
  const player = makeKart(0, carById('apex'), driverById('sproto'), false, { flightWings: true });
  const rival = makeKart(1, carById('apex'), driverById('cone'), false, { flightWings: true });
  rival.position.set(0, 0, 4.2);
  scene.add(player, rival);
  return { scene, track, play, itemFx, camera, player, rival };
}

function shown(kart) {
  const materials = [];
  kart.traverse((m) => { if (m.isMesh) materials.push(m.material); });
  return materials;
}

afterEach(() => vi.useRealTimers());

describe('race-start shader warm-up', () => {
  it('compiles every item visual and leaves none of them in the scene', async () => {
    const { scene, track, play, itemFx, camera, player, rival } = raceScene();
    const renderer = fakeRenderer();
    const itemRoot = scene.getObjectByName('item-effects');
    expect(itemRoot.children.length).toBe(0);

    const done = warmRaceShaders(renderer, scene, camera, { built: [track, player, rival], rivals: [rival], play, itemFx });

    const whole = renderer.calls[0];
    expect(whole.root).toBe(scene);
    for (const name of ['ball', 'disc', 'lightbolt', 'bolt', 'cursor', 'lob', 'ring', 'rocket', 'pulse', 'cable', 'beam',
      'shield', 'slip', 'box', 'strip', 'puck', 'broom', 'soda', 'triple', 'speaker', 'spool', 'spring', 'siphon', 'comet']) {
      expect(whole.names.has(name), name).toBe(true);
    }
    // Stowed wings are hidden, and still part of what gets compiled.
    expect([...whole.names].some((name) => name.startsWith('Flight wings'))).toBe(true);
    // Impact pools carry per-instance colours from the start, as they will when first used.
    for (const pool of itemFx.group.children) expect(pool.instanceColor).toBeTruthy();
    // Nothing was left behind, and it all happened before a frame could be drawn.
    expect(itemRoot.children.length).toBe(0);
    expect(await done).toBe(true);
    track.dispose();
  });

  it('compiles the same transparent copies the camera fade later puts on a rival', () => {
    const { scene, track, play, itemFx, camera, player, rival } = raceScene();
    const renderer = fakeRenderer();
    const before = shown(rival);

    warmRaceShaders(renderer, scene, camera, { built: [track, player, rival], rivals: [rival], play, itemFx });

    const fadePass = renderer.calls.find((call) => call.root === rival);
    expect(fadePass.target).toBe(scene);
    expect(fadePass.materials.size).toBeGreaterThan(0);
    for (const material of fadePass.materials) {
      expect(material.transparent).toBe(true);
      expect(material.depthWrite).toBe(false);
    }
    // The rival looks exactly as it did: its own materials are back on every mesh.
    expect(shown(rival)).toEqual(before);

    animateKart(player, { speed: 45, s: 10 }, { tier: 0 }, 1);
    animateKart(rival, { speed: 45, s: 14 }, { tier: 0 }, 1);
    updateRivalVisibility(camera, [player, rival], 0);
    const faded = shown(rival);
    expect(faded.some((material) => material.opacity < 0.2)).toBe(true);
    for (const material of faded) expect(fadePass.materials.has(material)).toBe(true);
    disposeKart(rival);
    track.dispose();
  });

  it('does nothing when the same track and karts start another race', async () => {
    const { scene, track, play, itemFx, camera, player, rival } = raceScene();
    const renderer = fakeRenderer();
    const parts = { built: [track, player, rival], rivals: [rival], play, itemFx };
    await warmRaceShaders(renderer, scene, camera, parts);
    const calls = renderer.calls.length;

    expect(await warmRaceShaders(renderer, scene, camera, parts)).toBe(false);
    expect(renderer.calls.length).toBe(calls);
    track.dispose();
  });

  it('compiles a rival again when its reflection map arrives after the start', () => {
    vi.useFakeTimers();
    const { scene, track, play, itemFx, camera, player, rival } = raceScene();
    const renderer = fakeRenderer();
    // A map that is still loading: no pixels yet, as HDRLoader leaves it until the file is decoded.
    const reflection = new THREE.DataTexture(null, 0, 0);
    let lacquer;
    rival.traverse((m) => { if (m.isMesh && m.material.isMeshStandardMaterial) lacquer ??= m.material; });
    lacquer.envMap = reflection;

    warmRaceShaders(renderer, scene, camera, { built: [track, player, rival], rivals: [rival], play, itemFx });
    const calls = renderer.calls.length;
    vi.advanceTimersByTime(1000);
    expect(renderer.calls.length).toBe(calls);

    reflection.image = { data: new Uint8Array(8 * 4 * 4), width: 8, height: 4 };
    vi.advanceTimersByTime(400);
    const late = renderer.calls.slice(calls);
    // Once as it is drawn, once with the fade's copies.
    expect(late.length).toBe(2);
    expect(late.every((call) => call.root === rival)).toBe(true);
    expect(late[0].materials.has(lacquer)).toBe(true);
    expect([...late[1].materials].every((material) => material.transparent)).toBe(true);

    // A kart disposed after the race is left alone.
    lacquer.envMap = null;
    disposeKart(rival);
    vi.advanceTimersByTime(400);
    expect(renderer.calls.length).toBe(calls + 2);
    track.dispose();
  });
});

describe('race-start picture warm-up', () => {
  it('sends a rival picture that was still loading as soon as it has arrived, once', async () => {
    vi.useFakeTimers();
    const { scene, track, play, itemFx, camera, player, rival } = raceScene();
    // The parts of WebGLRenderer the warm-up uses to send a picture ahead of its first draw.
    const sent = [], uploaded = new Map();
    const renderer = {
      ...fakeRenderer(),
      properties: { get: (texture) => ({ __version: uploaded.get(texture) }) },
      initTexture(texture) { sent.push(texture); uploaded.set(texture, texture.version); },
    };
    // A picture whose file has not arrived: no image yet, as TextureLoader leaves it.
    const livery = new THREE.Texture();
    let paint;
    rival.traverse((m) => { if (m.isMesh && m.material.isMeshStandardMaterial) paint ??= m.material; });
    paint.map = livery;

    await warmRaceShaders(renderer, scene, camera, { built: [track, player, rival], rivals: [rival], play, itemFx });
    const times = () => sent.filter((texture) => texture === livery).length;
    expect(times(), 'nothing to send while the file is still on its way').toBe(0);
    vi.advanceTimersByTime(1000);
    expect(times()).toBe(0);

    livery.image = { complete: true, naturalWidth: 256, width: 256, height: 256 };
    livery.needsUpdate = true;
    vi.advanceTimersByTime(400);
    expect(times()).toBe(1);
    vi.advanceTimersByTime(3000);
    expect(times(), 'sent once').toBe(1);

    paint.map = null;
    disposeKart(player);
    disposeKart(rival);
    track.dispose();
  });
});
