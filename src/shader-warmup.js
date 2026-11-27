import { Box3, Color, OrthographicCamera, Vector3, Vector4 } from 'three';
import { withKartFadeMaterials } from './kart-visibility.js';
import { setKartDetail } from './kart-art.js';

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

// A kart's shapes and pictures are sent to the graphics card the first time it is drawn,
// and a heavy car can stop the game for 50 to 80 ms when that happens. In single player
// the player starts at the back of the grid, so every rival is drawn during the countdown.
// Online the player can start anywhere, with rivals behind the camera and, on a 12-kart
// grid, rivals far enough away to be showing their cheaper distant build. Each of those
// used to be drawn in full for the first time when it caught up, mid-race.
//
// This draws every new kart once at race load, in both of its builds, from straight above
// and into a single pixel of the canvas, so nothing shows and nothing is left for later.
//
// A picture that is still downloading at that moment cannot be sent yet, so the karts'
// pictures are checked for a while afterwards and each is sent when it has arrived.
const drawn = new WeakSet();
const above = new OrthographicCamera(-1, 1, 1, -1, 1, 1000);
const grid = new Box3(), middle = new Vector3(), keptScissor = new Vector4();
let pictureWatch = 0;

function picturesOf(karts) {
  const found = new Set();
  for (const kart of karts) {
    kart.traverse((mesh) => {
      const material = mesh.material;
      if (!material || Array.isArray(material)) return;
      for (const key in material) {
        // Reflection maps are prepared by the renderer itself.
        if (key === 'envMap') continue;
        const value = material[key];
        if (value && value.isTexture) found.add(value);
      }
    });
  }
  return found;
}

const arrived = (image) => !!image && (image.complete === undefined || (image.complete && image.naturalWidth > 0));

// Sends the pictures that have arrived and are not on the graphics card yet: all of them
// at race load, then at most one per check so a late one costs a single short pause.
function sendPictures(renderer, pictures, limit) {
  let sent = 0;
  for (const picture of pictures) {
    if (!arrived(picture.image)) continue;
    pictures.delete(picture);
    if (renderer.properties?.get(picture).__version === picture.version) continue;
    renderer.initTexture(picture);
    if (++sent >= limit) break;
  }
}

function watchPictures(renderer, karts, pictures) {
  const token = ++pictureWatch, until = performance.now() + WATCH_MS;
  const check = () => {
    if (token !== pictureWatch || !pictures.size || performance.now() > until) return;
    // The race these karts were built for is over: leave their pictures alone.
    if (!karts.some((kart) => kart.parent)) return;
    try { sendPictures(renderer, pictures, 1); } catch (error) { console.warn('Kart picture warm-up skipped', error); return; }
    setTimeout(check, WATCH_STEP_MS);
  };
  setTimeout(check, WATCH_STEP_MS);
}

/**
 * @param {import('three').WebGLRenderer} renderer
 * @param {import('three').Scene} scene the race scene, with the karts placed on the grid
 * @param {import('three').Object3D[]} karts every kart in the race
 * @returns {boolean} false when every kart had been through here before
 */
export function drawKartsOnce(renderer, scene, karts) {
  const fresh = karts.filter((kart) => kart && kart.parent && !drawn.has(kart));
  if (!fresh.length) return false;
  grid.makeEmpty();
  for (const kart of fresh) {
    drawn.add(kart);
    grid.expandByPoint(kart.position);
  }
  grid.getCenter(middle);
  const reach = grid.min.distanceTo(grid.max) / 2 + 30;
  above.left = above.bottom = -reach;
  above.right = above.top = reach;
  above.far = reach * 2 + 200;
  above.position.set(middle.x, middle.y + reach + 100, middle.z);
  above.up.set(0, 0, -1);
  above.lookAt(middle);
  above.updateProjectionMatrix();
  const builds = fresh.map((kart) => kart.userData.low?.active);
  const test = renderer.getScissorTest();
  renderer.getScissor(keptScissor);
  try {
    renderer.setScissor(0, 0, 1, 1);
    renderer.setScissorTest(true);
    for (const distant of [false, true]) {
      for (const kart of fresh) setKartDetail(kart, distant);
      renderer.render(scene, above);
    }
    // Parts hidden in both builds (stowed wings, boost flames) were not drawn: send their pictures too.
    const pictures = picturesOf(fresh);
    sendPictures(renderer, pictures, Infinity);
    if (pictures.size) watchPictures(renderer, fresh, pictures);
  } catch (error) {
    // A failed draw only means the karts are sent on first sight, as they were before.
    console.warn('Kart warm-up draw skipped', error);
  } finally {
    fresh.forEach((kart, i) => setKartDetail(kart, !!builds[i]));
    renderer.setScissor(keptScissor);
    renderer.setScissorTest(test);
  }
  return true;
}
