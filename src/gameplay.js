import * as THREE from 'three';
import { ITEMS } from './items.js';
import { itemModel, projectileModel } from './item-art.js';
import { createGameplayCore, FLYING_TYPES } from './sim/gameplay-core.js';
import { createTrackSample } from './sim/track-core.js';

export { ITEMS } from './items.js';

const UP = new THREE.Vector3(0, 1, 0);

function poolKey(o) {
  if (o.type === 'pulse') return 'pulse:' + (o.color ?? 0);
  if (o.type === 'cable' || o.type === 'beam') return 'tether:' + (o.color ?? 0);
  if (o.type === 'shield') return 'item:bubble';
  if (o.type === 'flair' || o.type === 'attached') return 'item:' + o.itemType;
  if (FLYING_TYPES.has(o.type)) return 'proj:' + o.type + ':' + (o.tint ?? '');
  return 'item:' + o.type;
}

export function createGameplay(scene, track) {
  const root = new THREE.Group();
  scene.add(root);

  const geometries = {
    pulse: new THREE.TorusGeometry(1, 0.035, 5, 40),
    tether: new THREE.CylinderGeometry(0.05, 0.05, 1, 4),
  };
  const materials = Object.create(null);
  const freePool = new Map();
  const activeMeshes = new Map();
  const sampleScratch = createTrackSample();
  const vecA = new THREE.Vector3();
  const vecB = new THREE.Vector3();
  const vecDiff = new THREE.Vector3();

  function basicMesh(shape, color) {
    const key = shape + ':' + color;
    if (!materials[key]) {
      materials[key] = new THREE.MeshBasicMaterial({ color });
    }
    const m = new THREE.Mesh(geometries[shape], materials[key]);
    m.name = shape;
    return m;
  }

  function buildMesh(o) {
    if (o.type === 'pulse') return basicMesh('pulse', o.color ?? 0xffffff);
    if (o.type === 'cable' || o.type === 'beam') return basicMesh('tether', o.color ?? 0xffffff);
    if (o.type === 'shield') return itemModel('bubble');
    if (o.type === 'flair' || o.type === 'attached') return itemModel(o.itemType);
    if (FLYING_TYPES.has(o.type)) return projectileModel(o.type, o.tint);
    return itemModel(o.type);
  }

  function samplePos(s, x, yOffset, outVec) {
    if (track.sampleInto) {
      track.sampleInto(s, x, sampleScratch);
      outVec.set(sampleScratch.position.x, sampleScratch.position.y + yOffset, sampleScratch.position.z);
    } else {
      const p = track.sample(s, x).position;
      outVec.set(p.x, p.y + yOffset, p.z);
    }
    return outVec;
  }

  function syncObjectMesh(o, model) {
    model.visible = o.visible !== false;
    if (!model.visible) return;
    if (o.type === 'cable' || o.type === 'beam') {
      const k = o.owner.kart;
      const t = o.target.kart;
      samplePos(k.s, k.x, k.y + 0.86, vecA);
      samplePos(t.s, t.x, t.y + 0.86, vecB);
      vecDiff.subVectors(vecB, vecA);
      model.position.copy(vecA).lerp(vecB, 0.5);
      const len = vecDiff.length();
      model.scale.set(1, len, 1);
      if (len > 1e-6) {
        model.quaternion.setFromUnitVectors(UP, vecDiff.multiplyScalar(1 / len));
      }
      return;
    }
    if (track.sampleInto) {
      track.sampleInto(o.s, o.x, sampleScratch);
      model.position.set(sampleScratch.position.x, o.y, sampleScratch.position.z);
    } else {
      const p = track.sample(o.s, o.x).position;
      model.position.set(p.x, o.y, p.z);
    }
    const order = o.rotOrder || 'XYZ';
    if (model.rotation.order !== order) model.rotation.order = order;
    model.rotation.set(o.rotX || 0, o.rotY || 0, o.rotZ || 0);
    model.scale.set(o.scaleX ?? 1, o.scaleY ?? 1, o.scaleZ ?? 1);
    if (model.userData.trail) {
      model.userData.trail.scale.set(0.44, 0.44, o.trailScaleZ ?? 2);
    }
  }

  function acquireMesh(o) {
    const key = poolKey(o);
    let bucket = freePool.get(key);
    const model = bucket && bucket.length > 0 ? bucket.pop() : buildMesh(o);
    activeMeshes.set(o.id, { model, key });
    root.add(model);
    syncObjectMesh(o, model);
  }

  function releaseMesh(o) {
    const entry = activeMeshes.get(o.id);
    if (!entry) return;
    activeMeshes.delete(o.id);
    root.remove(entry.model);
    let bucket = freePool.get(entry.key);
    if (!bucket) {
      bucket = [];
      freePool.set(entry.key, bucket);
    }
    bucket.push(entry.model);
  }

  function hideMesh(o) {
    const entry = activeMeshes.get(o.id);
    if (entry) entry.model.visible = false;
  }

  function syncAll(objects) {
    for (let i = 0; i < objects.length; i++) {
      const o = objects[i];
      const entry = activeMeshes.get(o.id);
      if (entry) syncObjectMesh(o, entry.model);
    }
  }

  const core = createGameplayCore(track, {
    onSpawn: acquireMesh,
    onRemove: releaseMesh,
    onHide: hideMesh,
    onSync: syncAll,
  });

  function setTrack(next) {
    track = next;
    core.setTrack(next);
  }

  function syncFromCore() {
    syncAll(core.objects);
  }

  return {
    core,
    setTrack,
    reset: core.reset,
    withdraw: core.withdraw,
    use: core.use,
    fireBlasters: core.fireBlasters,
    update: core.update,
    decide: core.decide,
    hitHazard: core.hitHazard,
    syncFromCore,
  };
}
