import { Box3, MathUtils, Matrix4, Vector3 } from 'three';

// Analytical compound-AABB occlusion check in body-local space.
// Replaces per-frame triangle-soup Raycaster.intersectObjects across rival meshes
// while respecting custom car widths (Saucer 3.93m), roofs (Ironhide/Skipper 2.80m),
// body scales (Geep), off-center drivers, and 360-degree stun rolls.

const boundsCache = new Map();
const fades = new WeakMap();

const center = new Vector3();
const rivalCenter = new Vector3();
const toPlayer = new Vector3();
const toRival = new Vector3();
const worldTarget = new Vector3();
const worldDir = new Vector3();
const localOrigin = new Vector3();
const localDir = new Vector3();
const invPlayer = new Matrix4();
const invRival = new Matrix4();
const scratchVert = new Vector3();
const meshToBody = new Matrix4();

function expandFromObject(rootBody, obj, lowerBox, upperBox, splitY = null) {
  obj.updateMatrixWorld(true);
  meshToBody.copy(rootBody.matrixWorld).invert().multiply(obj.matrixWorld);
  const pos = obj.geometry?.attributes?.position;
  if (!pos) return;
  for (let i = 0; i < pos.count; i++) {
    scratchVert.fromBufferAttribute(pos, i).applyMatrix4(meshToBody);
    if (splitY !== null && scratchVert.y > splitY) {
      upperBox.expandByPoint(scratchVert);
    } else {
      lowerBox.expandByPoint(scratchVert);
    }
  }
}

function getCompoundBounds(kart) {
  const data = kart.userData;
  const key = (data.car || 'default') + ':' + (data.character || 'default');
  let entry = boundsCache.get(key);
  if (entry) return entry;

  // Snapshot and temporarily zero dynamic animation pose on body/driver/wheels so cached
  // body-local AABBs reflect canonical vehicle geometry independent of current roll/hop.
  const { body, driver, wheels } = data;
  const savedPos = body.position.clone();
  const savedRot = body.rotation.clone();
  const savedDriverPos = driver.position.clone();
  const savedDriverRot = driver.rotation.clone();
  body.position.set(0, 0, 0);
  body.rotation.set(0, 0, 0);
  driver.position.set(driver.position.x, data.driverHeight ?? driver.position.y, driver.position.z);
  driver.rotation.set(0, 0, 0);
  const savedWheelRot = wheels.map((w) => [w.rotation.x, w.rotation.y, w.position.y]);
  for (let i = 0; i < wheels.length; i++) {
    const w = wheels[i];
    w.rotation.x = 0;
    w.rotation.y = 0;
    w.position.y = w.userData.rideHeight ?? w.position.y;
  }
  kart.updateWorldMatrix(true, true);

  const lowerBody = new Box3();
  const upperCab = new Box3();
  const driverBox = new Box3();
  const wheelsBox = new Box3();

  for (let i = 0; i < body.children.length; i++) {
    const child = body.children[i];
    if (child.isMesh) expandFromObject(body, child, lowerBody, upperCab, 1.38);
  }
  driver.traverse((m) => {
    if (m.isMesh) expandFromObject(body, m, driverBox, driverBox, null);
  });
  for (let i = 0; i < wheels.length; i++) {
    const w = wheels[i];
    w.traverse((m) => {
      if (m.isMesh) expandFromObject(body, m, wheelsBox, wheelsBox, null);
    });
    w.userData.fork?.traverse((m) => {
      if (m.isMesh) expandFromObject(body, m, wheelsBox, wheelsBox, null);
    });
  }

  // Restore pose.
  body.position.copy(savedPos);
  body.rotation.copy(savedRot);
  driver.position.copy(savedDriverPos);
  driver.rotation.copy(savedDriverRot);
  for (let i = 0; i < wheels.length; i++) {
    const w = wheels[i];
    w.rotation.x = savedWheelRot[i][0];
    w.rotation.y = savedWheelRot[i][1];
    w.position.y = savedWheelRot[i][2];
  }
  kart.updateWorldMatrix(true, true);

  const boxes = [lowerBody, upperCab, driverBox, wheelsBox].filter((b) => !b.isEmpty());
  const fullBox = new Box3();
  for (let i = 0; i < boxes.length; i++) fullBox.union(boxes[i]);

  // Build 4 target probes anchored to this car's actual driver & chassis silhouette.
  const dMin = driverBox.isEmpty() ? new Vector3(-0.36, 1.2, -0.1) : driverBox.min;
  const dMax = driverBox.isEmpty() ? new Vector3(0.36, 1.9, 0.3) : driverBox.max;
  const dx = (dMin.x + dMax.x) * 0.5;
  const dz = (dMin.z + dMax.z) * 0.5;
  const dyHead = dMin.y + (dMax.y - dMin.y) * 0.84;
  const dyShoulder = dMin.y + (dMax.y - dMin.y) * 0.62;
  const shoulderHalf = Math.max(0.24, (dMax.x - dMin.x) * 0.38);
  const cMidY = lowerBody.isEmpty() ? 0.75 : (lowerBody.min.y + lowerBody.max.y) * 0.55;
  const probes = [
    new Vector3(dx, dyHead, dz),
    new Vector3(dx - shoulderHalf, dyShoulder, dz),
    new Vector3(dx + shoulderHalf, dyShoulder, dz),
    new Vector3(0, cMidY, 0),
  ];

  const spanX = fullBox.max.x - fullBox.min.x;
  const spanY = fullBox.max.y - fullBox.min.y;
  const spanZ = fullBox.max.z - fullBox.min.z;
  const bsRadius = 0.5 * Math.hypot(spanX, spanY, spanZ) * body.scale.x;

  entry = { boxes, probes, bsRadius };
  boundsCache.set(key, entry);
  return entry;
}

function raySlabEntry(origin, dir, box, maxT) {
  let tmin = 0;
  let tmax = maxT;

  const ox = origin.x;
  const dx = dir.x;
  if (Math.abs(dx) < 1e-8) {
    if (ox < box.min.x || ox > box.max.x) return Infinity;
  } else {
    const inv = 1 / dx;
    let t1 = (box.min.x - ox) * inv;
    let t2 = (box.max.x - ox) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }

  const oy = origin.y;
  const dy = dir.y;
  if (Math.abs(dy) < 1e-8) {
    if (oy < box.min.y || oy > box.max.y) return Infinity;
  } else {
    const inv = 1 / dy;
    let t1 = (box.min.y - oy) * inv;
    let t2 = (box.max.y - oy) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }

  const oz = origin.z;
  const dz = dir.z;
  if (Math.abs(dz) < 1e-8) {
    if (oz < box.min.z || oz > box.max.z) return Infinity;
  } else {
    const inv = 1 / dz;
    let t1 = (box.min.z - oz) * inv;
    let t2 = (box.max.z - oz) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }

  return tmax >= 0 ? tmin : Infinity;
}

function firstBoxHit(worldOrigin, unitWorldDir, invBodyMatrix, boxes, maxWorldDist) {
  localOrigin.copy(worldOrigin).applyMatrix4(invBodyMatrix);
  // Transform direction without translation; note non-unit length if body has uniform scale (e.g. Geep),
  // which automatically scales parametric `t` so `t` remains exact world-space distance!
  localDir.copy(unitWorldDir).transformDirection(invBodyMatrix);
  // Wait: transformDirection normalizes! Use manual 3x3 multiply so world-distance t is preserved under scale!
  const e = invBodyMatrix.elements;
  const wx = unitWorldDir.x;
  const wy = unitWorldDir.y;
  const wz = unitWorldDir.z;
  localDir.set(
    e[0] * wx + e[4] * wy + e[8] * wz,
    e[1] * wx + e[5] * wy + e[9] * wz,
    e[2] * wx + e[6] * wy + e[10] * wz,
  );

  let best = Infinity;
  for (let i = 0; i < boxes.length; i++) {
    const t = raySlabEntry(localOrigin, localDir, boxes[i], maxWorldDist);
    if (t < best) best = t;
  }
  return best;
}

function coversPlayer(rival, player, playerBounds, camera, playerDistance) {
  const data = rival.userData;
  data.body.updateWorldMatrix(true, false);
  const rivalBounds = getCompoundBounds(rival);

  rivalCenter.set(0, 1.1, 0).applyMatrix4(data.body.matrixWorld);
  toRival.subVectors(rivalCenter, camera.position);
  const depth = toRival.dot(toPlayer);
  const lateralLimitSq = (rivalBounds.bsRadius + 0.95) * (rivalBounds.bsRadius + 0.95);
  if (depth < -2 || depth > playerDistance - 0.35 || toRival.lengthSq() - depth * depth > lateralLimitSq) {
    return false;
  }

  invRival.copy(data.body.matrixWorld).invert();
  const probes = playerBounds.probes;
  const playerBodyMatrix = player.userData.body.matrixWorld;

  for (let i = 0; i < probes.length; i++) {
    worldTarget.copy(probes[i]).applyMatrix4(playerBodyMatrix).sub(camera.position);
    const probeDist = worldTarget.length();
    if (probeDist < 0.05) continue;
    worldDir.copy(worldTarget).multiplyScalar(1 / probeDist);

    const playerHit = firstBoxHit(camera.position, worldDir, invPlayer, playerBounds.boxes, probeDist + 0.1);
    const stopDist = (Number.isFinite(playerHit) ? playerHit : probeDist) - 0.04;
    if (stopDist <= 0.05) continue;

    const rivalHit = firstBoxHit(camera.position, worldDir, invRival, rivalBounds.boxes, stopDist);
    if (rivalHit <= stopDist) return true;
  }
  return false;
}

function createFade(kart) {
  const materials = new Map();
  const parts = [];
  kart.traverse((mesh) => {
    if (!mesh.isMesh && !mesh.isPoints) return;
    // A rival's distant build is never shown while it fades (see kartIsFaded).
    if (mesh.userData.lowDetail) return;
    const source = mesh.material;
    if (!materials.has(source)) {
      const faded = source.clone();
      faded.transparent = true;
      faded.depthWrite = false;
      materials.set(source, faded);
    }
    parts.push({ mesh, source, faded: materials.get(source) });
  });
  const state = { materials, parts, opacity: 1 };
  fades.set(kart, state);
  return state;
}

function restore(state) {
  for (const { mesh, source } of state.parts) mesh.material = source;
  state.opacity = 1;
}

/** True while a rival is partly faded, so its distant build must stay hidden. */
export function kartIsFaded(kart) {
  const state = fades.get(kart);
  return !!state && state.opacity < 1;
}

/**
 * Race-load shader warm-up. Puts the fade's own transparent copies on the kart
 * while `whileFaded` runs, then puts back whatever was showing. The copies stay
 * cached, so the first real fade draws materials that are already compiled.
 * Copies are taken afresh unless a fade is on screen, so they match the kart's
 * materials as they are now (a reflection map can arrive after the kart is built).
 */
export function withKartFadeMaterials(kart, whileFaded) {
  const current = fades.get(kart);
  const outdated = current?.opacity === 1 ? current : null;
  const state = current && !outdated ? current : createFade(kart);
  const showing = state.parts.map(({ mesh }) => mesh.material);
  for (const { mesh, faded } of state.parts) mesh.material = faded;
  try {
    whileFaded();
  } finally {
    for (let i = 0; i < state.parts.length; i++) state.parts[i].mesh.material = showing[i];
    // Release the old copies last: shared shader programs then stay alive.
    if (outdated) for (const faded of outdated.materials.values()) faded.dispose();
  }
}

export function releaseKartFade(kart) {
  const state = fades.get(kart);
  if (!state) return;
  restore(state);
  for (const faded of state.materials.values()) faded.dispose();
  fades.delete(kart);
}

export function updateRivalVisibility(camera, models, dt) {
  if (models.length < 2) return;
  const player = models[0];
  if (!player?.userData?.body) return;
  player.userData.body.updateWorldMatrix(true, false);
  const playerBounds = getCompoundBounds(player);
  invPlayer.copy(player.userData.body.matrixWorld).invert();

  center.set(0, 1.1, 0).applyMatrix4(player.userData.body.matrixWorld);
  toPlayer.subVectors(center, camera.position);
  const distance = toPlayer.length();
  if (distance < 1e-4) return;
  toPlayer.multiplyScalar(1 / distance);

  for (let i = 1; i < models.length; i++) {
    const rival = models[i];
    if (!rival?.visible || !rival.userData?.body) continue;
    const covered = coversPlayer(rival, player, playerBounds, camera, distance);
    let state = fades.get(rival);
    if (!covered && (!state || state.opacity === 1)) continue;
    if (!state) state = createFade(rival);
    const goal = covered ? 0.075 : 1;
    const opacity = dt > 0 ? MathUtils.damp(state.opacity, goal, covered ? 35 : 19, dt) : goal;
    if (opacity > 0.995 && !covered) {
      restore(state);
      continue;
    }
    for (const { mesh, faded } of state.parts) mesh.material = faded;
    for (const [source, faded] of state.materials) {
      faded.color.copy(source.color);
      faded.opacity = source.opacity * opacity;
    }
    state.opacity = opacity;
  }
}
