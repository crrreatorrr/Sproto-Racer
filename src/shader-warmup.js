import { Color } from 'three';
import { withKartFadeMaterials } from './kart-visibility.js';

// The browser compiles a shader the first time a material is drawn, and the game
// stops while it does. A race draws many materials for the first time long after
// the start: an item when it is first used, a rival's see-through copy when it
// first blocks the camera, flight wings when they first open. This asks the
// renderer to build all of them at race start instead, where a short wait is
// invisible. Nothing here is left in the scene, so no frame looks different.

const white = new Color(0xffffff);
const compiled = new WeakSet();
// Some cars fetch their reflection image when they are first built. It changes
// their shaders when it arrives, so rivals are watched for this long after the start.
const WATCH_MS = 15000, WATCH_STEP_MS = 200;
let watch = 0;

function anyNew(objects) {
  let found = false;
  for (const object of objects) {
    if (!object || compiled.has(object)) continue;
    compiled.add(object);
    found = true;
  }
  return found;
}

function hasLight(root) {
  let found = false;
  root.traverse((object) => { if (object.isLight) found = true; });
  return found;
}

// A number that changes when a kart's materials would pick different shaders:
// a material was given another reflection map, or its map finished loading.
function shaderLook(karts) {
  let look = 0;
  for (const kart of karts) {
    kart.traverse((mesh) => {
      const material = mesh.material;
      if (!material || Array.isArray(material)) return;
      const env = material.envMap;
      if (env) look = (look * 31 + env.id * 2 + (env.image?.height > 0 ? 1 : 0)) % 2147483647;
    });
  }
  return look;
}

function compileRivals(renderer, scene, camera, rivals, asDrawn, pending = []) {
  for (const kart of rivals) {
    if (!kart.parent) continue; // disposed since the race began
    // Compiling a part of the scene counts any light inside that part twice, so use the whole scene then.
    const compile = hasLight(kart)
      ? () => pending.push(renderer.compileAsync(scene, camera))
      : () => pending.push(renderer.compileAsync(kart, camera, scene));
    if (asDrawn) compile();
    // The fade's transparent copies, built by the fade itself and compiled on the real meshes.
    withKartFadeMaterials(kart, compile);
  }
  return pending;
}

function watchRivals(renderer, scene, camera, rivals) {
  const token = ++watch, until = performance.now() + WATCH_MS;
  let look = shaderLook(rivals);
  const check = () => {
    if (token !== watch || performance.now() > until) return;
    const now = shaderLook(rivals);
    if (now !== look) {
      look = now;
      try { compileRivals(renderer, scene, camera, rivals, true); } catch (error) { console.warn('Shader warm-up skipped', error); }
    }
    setTimeout(check, WATCH_STEP_MS);
  };
  setTimeout(check, WATCH_STEP_MS);
}

/**
 * @param {import('three').WebGLRenderer} renderer
 * @param {import('three').Scene} scene the race scene, lit as it will be drawn
 * @param {import('three').Camera} camera
 * @param {object} parts
 * @param {object[]} parts.built everything rebuilt between races (the track and each kart model);
 *   when all of it has been through here before, the call does nothing
 * @param {import('three').Object3D[]} parts.rivals karts that can fade when they block the camera
 * @param {{warmVisuals?: () => () => void}} parts.play the item layer from createGameplay
 * @param {{group: import('three').Object3D}} parts.itemFx the impact effects from createItemFx
 * @returns {Promise<boolean>} resolves once the shaders are ready; false when there was nothing to do
 */
export function warmRaceShaders(renderer, scene, camera, { built = [], rivals = [], play, itemFx } = {}) {
  if (!anyNew(built)) return Promise.resolve(false);
  const karts = rivals.filter(Boolean);
  const pending = [];
  try {
    // Impact pools get their per-instance colours on first use, which selects a different shader.
    for (const pool of itemFx?.group.children ?? []) {
      if (pool.isInstancedMesh && !pool.instanceColor) pool.setColorAt(0, white);
    }
    // One of every item model, trail and marker. Hidden parts of the scene (stowed wings,
    // boost flames, later laps of a Sky Lane) are compiled by the same call.
    const removeItems = play?.warmVisuals?.();
    try {
      pending.push(renderer.compileAsync(scene, camera));
    } finally {
      removeItems?.();
    }
    compileRivals(renderer, scene, camera, karts, false, pending);
    watchRivals(renderer, scene, camera, karts);
  } catch (error) {
    // A failed warm-up only means shaders compile on first use, as they did before.
    console.warn('Shader warm-up skipped', error);
  }
  return Promise.all(pending).then(() => true);
}
