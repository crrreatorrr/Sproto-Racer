import { BackSide, BufferAttribute, BufferGeometry, Color, DataTexture, DoubleSide, FrontSide, Group, InstancedMesh, Mesh, MeshBasicMaterial, Vector3, WebGLRenderTarget } from 'three';
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

// A rival's pictures (its paint, wings, number plate) are sent to the graphics card the
// first time they are drawn. The draw below covers every picture that has arrived, but one
// that is still downloading cannot be sent yet, and a rival behind the camera or far away
// is not looked at again for a while: its picture was then sent mid-race, the first time
// the kart came into view, and that stopped the game for 50 to 110 ms. Single player rarely
// saw it because the player starts at the back with every rival in view; online the player
// can start anywhere. So the rivals' pictures are checked for a while after the start and
// each is sent when it has arrived, at most one per check.
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

function sendPictures(renderer, pictures, limit) {
  let sent = 0;
  for (const picture of pictures) {
    if (!arrived(picture.image)) continue;
    pictures.delete(picture);
    if (renderer.properties.get(picture).__version === picture.version) continue;
    renderer.initTexture(picture);
    if (++sent >= limit) break;
  }
}

function watchPictures(renderer, karts) {
  if (typeof renderer.initTexture !== 'function' || !renderer.properties) return;
  const token = ++pictureWatch, until = performance.now() + WATCH_MS;
  const pictures = picturesOf(karts);
  const check = (limit) => {
    // A newer race, nothing left to send, time up, or the karts are gone: stop.
    if (token !== pictureWatch || !pictures.size || performance.now() > until || !karts.some((kart) => kart.parent)) return;
    try { sendPictures(renderer, pictures, limit); } catch (error) { console.warn('Kart picture warm-up skipped', error); return; }
    setTimeout(check, WATCH_STEP_MS, 1);
  };
  check(Infinity);
}

let scratchTarget = null;

/**
 * Draws the whole scene once into a tiny off-screen target with nothing hidden and nothing
 * culled, and with the sun's shadow camera widened to take in the whole circuit.
 *
 * `compileAsync` builds the shaders of materials in the scene, but two kinds of first-use work
 * are left for the frame that first needs them: the shadow pass's own depth shaders (one per
 * kind of caster: plain, instanced, double-sided), and sending each model's vertices and
 * textures to the graphics card. With a shadow map and large scenery both cost tens of
 * milliseconds mid-race. This pays for all of it in one frame while the race loads.
 */
/**
 * A row of tiny shadow casters that makes the shadow pass build every depth shader it can need.
 *
 * Three draws all shadows with one shared depth material, onto which it copies each
 * caster's texture. It picks a new shader for that material only when a caster differs from
 * the previous one in kind (instanced or not, instance colours or not), and the shader it
 * picks then also depends on whether that caster happens to be textured, which side it
 * shows and whether its model has surface normals. So which depth shaders exist after a draw depends on the order things were drawn
 * in, and a later frame with a different set of casters in view can need one more, mid-race.
 * These casters put every combination next to a change of kind, in one draw.
 *
 * They sit behind the camera, so the picture's own pass culls them and builds nothing for
 * them; the widened shadow camera still sees them.
 */
function depthShaderProbes(camera) {
  const group = new Group();
  // The shader also depends on whether the model carries surface normals: one shape of each.
  const shapes = [true, false].map((normals) => {
    const shape = new BufferGeometry();
    shape.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0]), 3));
    shape.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2));
    if (normals) shape.setAttribute('normal', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
    return shape;
  });
  let geometry = shapes[0];
  const texel = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  texel.needsUpdate = true;
  const materials = [];
  const add = (instanced, coloured, textured, side) => {
    const material = new MeshBasicMaterial({ map: textured ? texel : null, side });
    materials.push(material);
    const mesh = instanced ? new InstancedMesh(geometry, material, 1) : new Mesh(geometry, material);
    if (instanced && coloured) mesh.setColorAt(0, white);
    mesh.castShadow = true;
    group.add(mesh);
  };
  for (const shape of shapes) for (const side of [FrontSide, BackSide, DoubleSide]) {
    geometry = shape;
    // Every instanced caster follows a plain one and the other way round, so each is a change of kind.
    add(false, false, false, side);
    add(true, false, false, side);
    add(false, false, true, side);
    add(true, false, true, side);
    add(false, false, false, side);
    add(true, true, false, side);
    add(false, false, false, side);
    add(true, true, true, side);
    add(false, false, false, side);
  }
  camera.updateMatrixWorld();
  const behind = new Vector3();
  camera.getWorldDirection(behind);
  group.position.copy(camera.getWorldPosition(new Vector3())).addScaledVector(behind, -400);
  return {
    group,
    dispose() {
      group.removeFromParent();
      for (const child of group.children) child.dispose?.();
      for (const shape of shapes) shape.dispose();
      texel.dispose();
      for (const material of materials) material.dispose();
    },
  };
}

function drawEverythingOnce(renderer, scene, camera) {
  const hidden = [], culled = [];
  let sun = null;
  scene.traverse((object) => {
    if (!object.visible) { hidden.push(object); object.visible = true; }
    if (object.frustumCulled) { culled.push(object); object.frustumCulled = false; }
    if (!sun && object.isDirectionalLight && object.castShadow) sun = object;
  });
  const film = sun?.shadow.camera;
  const bounds = film && [film.left, film.right, film.top, film.bottom, film.near, film.far];
  const previousTarget = renderer.getRenderTarget();
  // Added after the walk above, so these stay culled from the picture's own pass.
  const probes = film ? depthShaderProbes(camera) : null;
  if (probes) scene.add(probes.group);
  try {
    if (film) {
      film.left = film.bottom = -1e4;
      film.right = film.top = 1e4;
      film.near = -1e4;
      film.far = 1e4;
      film.updateProjectionMatrix();
      renderer.shadowMap.needsUpdate = true;
    }
    scratchTarget ??= new WebGLRenderTarget(8, 8);
    renderer.setRenderTarget(scratchTarget);
    renderer.render(scene, camera);
  } finally {
    probes?.dispose();
    renderer.setRenderTarget(previousTarget);
    for (const object of hidden) object.visible = false;
    for (const object of culled) object.frustumCulled = true;
    if (film) {
      [film.left, film.right, film.top, film.bottom, film.near, film.far] = bounds;
      film.updateProjectionMatrix();
      // The next real frame redraws the shadow map around the player.
      renderer.shadowMap.needsUpdate = true;
    }
  }
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
  return Promise.all(pending).then(() => {
    // Once the shaders are built, so this frame does not wait on them one by one.
    try {
      if (karts.every((kart) => kart.parent)) {
        // Item models go back in for this one draw so their vertices are sent too.
        const removeItems = play?.warmVisuals?.();
        try {
          drawEverythingOnce(renderer, scene, camera);
        } finally {
          removeItems?.();
        }
      }
    } catch (error) {
      console.warn('Scene warm-up draw skipped', error);
    }
    watchPictures(renderer, karts);
    return true;
  });
}
