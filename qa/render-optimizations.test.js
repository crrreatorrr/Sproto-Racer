import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { CIRCUITS } from '../src/circuits.js';
import { createPaddock } from '../src/paddock.js';
import { createTrack } from '../src/track.js';
import { createGameplay } from '../src/gameplay.js';
import { makeKart, animateKart, disposeKart } from '../src/kart-art.js';
import { updateRivalVisibility } from '../src/kart-visibility.js';
import { createChaseCamera } from '../src/chase-camera.js';
import { createPerfMonitor, isPerfEnabled } from '../src/perf.js';
import { carById, driverById } from '../src/roster.js';
import { createKart } from '../src/driving.js';
import { createBoost } from '../src/boost.js';

function installCanvas2DMock() {
  const proto = globalThis.HTMLCanvasElement?.prototype;
  if (!proto || proto.__racerMocked) return;
  const orig = proto.getContext;
  proto.getContext = function getContextPatched(type, ...args) {
    if (type !== '2d') return orig ? orig.call(this, type, ...args) : null;
    const gradient = { addColorStop() {} };
    return {
      canvas: this,
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      lineJoin: 'round',
      font: '16px sans-serif',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      fillRect() {},
      clearRect() {},
      strokeRect() {},
      beginPath() {},
      closePath() {},
      moveTo() {},
      lineTo() {},
      arc() {},
      rect() {},
      clip() {},
      fill() {},
      stroke() {},
      save() {},
      restore() {},
      scale() {},
      rotate() {},
      translate() {},
      drawImage() {},
      fillText() {},
      measureText: (txt) => ({ width: String(txt).length * 9 }),
      createRadialGradient: () => gradient,
      createLinearGradient: () => gradient,
    };
  };
  proto.__racerMocked = true;
}

installCanvas2DMock();

function countMeshes(root) {
  let meshes = 0;
  root.traverse((obj) => {
    if (obj.isMesh || obj.isPoints) meshes++;
  });
  return meshes;
}

describe('fast rendering & cold-boot optimizations', () => {
  it('batches all ~215 static paddock blocks, mountains, and trees into 1 merged mesh', () => {
    const paddock = createPaddock();
    const backdrop = paddock.scene.getObjectByName('paddockBackdrop');
    expect(backdrop).toBeTruthy();
    expect(backdrop.isMesh).toBe(true);
    expect(backdrop.geometry.getAttribute('color')).toBeTruthy();
    const directEnvironmentMeshes = paddock.scene.children.filter((c) => c.isMesh);
    expect(directEnvironmentMeshes.length).toBe(1);
    expect(countMeshes(paddock.scene)).toBeLessThan(25);
  });

  it('supports deferVisuals/mountVisuals, packs circuit signs into 1 atlas mesh, and uploads pickup matrices only when dirty', () => {
    for (const course of CIRCUITS) {
      const scene = new THREE.Scene();
      const track = createTrack(scene, course, { deferVisuals: true });

      // Math & track metadata work immediately before visuals mount!
      expect(track.visualsMounted).toBe(false);
      expect(track.trackGroup.children.length).toBe(0);
      expect(track.length).toBeGreaterThan(3000);
      const s0 = track.sample(100, 0);
      expect(Number.isFinite(s0.position.x)).toBe(true);

      // Mount visuals on demand and verify idempotence.
      track.mountVisuals();
      const childCountAfterMount = track.trackGroup.children.length;
      track.mountVisuals();
      expect(track.visualsMounted).toBe(true);
      expect(track.trackGroup.children.length).toBe(childCountAfterMount);

      // All signs on the circuit are merged into 1 `trackSigns` mesh (instead of 27-42 separate meshes).
      const signMeshes = [];
      track.trackGroup.traverse((o) => {
        if (o.isMesh && o.name === 'trackSigns') signMeshes.push(o);
      });
      expect(signMeshes.length).toBe(1);

      // Pickup InstancedMesh uses GPU shader (`uTime`) and zero steady-state matrix uploads!
      const pickupMesh = track.trackGroup.getObjectByName('pickupCrates');
      expect(pickupMesh).toBeTruthy();
      expect(pickupMesh.material.customProgramCacheKey()).toBe('treasure-chest-road-v1');

      const initialVersion = pickupMesh.instanceMatrix.version;
      track.update(1.5, 1 / 60, 120, 1);
      track.update(3.0, 1 / 60, 240, 1);
      expect(pickupMesh.instanceMatrix.version).toBe(initialVersion);

      // Hiding or respawning a pickup triggers exactly one dirty matrix upload.
      track.pickups[0].hidden = true;
      track.update(3.1, 1 / 60, 245, 1);
      const hiddenVersion = pickupMesh.instanceMatrix.version;
      expect(hiddenVersion).toBe(initialVersion + 1);

      track.update(3.2, 1 / 60, 250, 1);
      expect(pickupMesh.instanceMatrix.version).toBe(hiddenVersion);

      track.dispose();
    }
  },15000);

  it.each(CIRCUITS)('draws instanced Sky Lane boxes and Boost Cells for $id and hides collected cells', (course) => {
    const scene = new THREE.Scene();
    const track = createTrack(scene, course);
    const sky = track.trackGroup.getObjectByName('sky-lanes');
    expect(sky, course.id + ' has no Sky Lane scenery').toBeTruthy();

    let cells = 0;
    track.sky.lanes.forEach((lane, laneIndex) => {
      const laneGroup = sky.children[laneIndex];
      const lapGroups = laneGroup.children.filter((child) => child.isGroup);
      expect(lapGroups.length).toBe(lane.layouts.length);
      lane.layouts.forEach((layout, lap) => {
        const group = lapGroups[lap];
        let sprites = 0, glows = 0, gems = 0, rings = 0, loose = 0;
        group.traverse((object) => {
          if (object.isSprite) sprites++;
          if (!object.isMesh) return;
          if (object.name === 'Sky Lane boost cell glows') glows += object.count;
          else if (object.name === 'Sky Lane boost cells') gems += object.count;
          else if (object.name === 'Sky Lane boost cell rings') rings += object.count;
          else if (!object.isInstancedMesh) loose++;
        });
        // One instance of each part per cell, and no cell is a scene object of its own.
        expect(sprites).toBe(0);
        expect(gems).toBe(layout.cells.length);
        expect(rings).toBe(layout.cells.length);
        expect(glows).toBe(layout.cells.length);
        // Only parts that move (and crossing models) are still meshes of their own.
        const moving = layout.obstacles.flatMap((ob) => ob.parts).filter((part) => part.motion || part.shape === 'door' || part.shape === 'blade' || part.crossing).length;
        expect(loose, `${course.id} lane ${laneIndex} lap ${lap + 1}`).toBeLessThanOrEqual(moving * 40);
        cells += layout.cells.length;
      });
    });
    expect(cells).toBeGreaterThan(20);

    // Collecting a cell shrinks its three instances to nothing; the others keep their size.
    const lane = track.sky.lanes[0];
    const first = lane.layouts[0].cells[0];
    const lapGroup = sky.children[0].children.filter((child) => child.isGroup)[0];
    const gemsMesh = lapGroup.children.find((child) => child.name === 'Sky Lane boost cells' && child.count > 1) ?? lapGroup.children.find((child) => child.name === 'Sky Lane boost cells');
    const scales = () => {
      const out = [], m = new THREE.Matrix4(), v = new THREE.Vector3();
      for (let i = 0; i < gemsMesh.count; i++) { gemsMesh.getMatrixAt(i, m); out.push(v.setFromMatrixScale(m).x); }
      return out;
    };
    track.update(1, 1 / 60, lane.start + 5, 1);
    expect(scales().every((x) => x > 1)).toBe(true);
    const kindOfFirst = lane.layouts[0].cells.filter((cell) => !!cell.mega === !!first.mega);
    track.setSkyCollected(lane.index, 1 << first.index);
    track.update(1.1, 1 / 60, lane.start + 5, 1);
    if (kindOfFirst.length === gemsMesh.count) expect(scales().filter((x) => x === 0).length).toBe(1);
    track.setSkyCollected(lane.index, 0);
    track.update(1.2, 1 / 60, lane.start + 5, 1);
    expect(scales().every((x) => x > 1)).toBe(true);
    track.dispose();
  },15000);

  it('repositions moving scenery once per drawn frame when the game loop asks for that', () => {
    const scene = new THREE.Scene();
    const track = createTrack(scene, CIRCUITS[0]);
    const sky = track.trackGroup.getObjectByName('sky-lanes');
    const gems = [];
    sky.traverse((object) => { if (object.name === 'Sky Lane boost cells') gems.push(object); });
    const stamp = () => gems.map((mesh) => mesh.instanceMatrix.version).join(',');

    // Default: every simulation step also updates what is drawn (tools and tests rely on it).
    let before = stamp();
    track.update(1, 1 / 60, 0, 1);
    expect(stamp()).not.toBe(before);

    // Per-frame mode: steps only mark the visuals stale; drawVisuals brings them up to date once.
    track.setVisualsPerFrame(true);
    before = stamp();
    for (let i = 0; i < 6; i++) track.update(1 + i / 60, 1 / 60, 0, 1);
    expect(stamp()).toBe(before);
    track.drawVisuals();
    const afterDraw = stamp();
    expect(afterDraw).not.toBe(before);
    track.drawVisuals();
    expect(stamp()).toBe(afterDraw);

    // The viewer's lap takes effect at the next draw.
    const lapGroups = sky.children[0].children.filter((child) => child.isGroup);
    track.setViewLap(2);
    track.drawVisuals();
    expect(lapGroups.map((group) => group.visible)).toEqual([false, true, false]);
    track.dispose();
  });

  it('reuses pooled item/projectile meshes without leaving inactive objects attached to the scene graph', () => {
    const scene = new THREE.Scene();
    const track = createTrack(scene, CIRCUITS[0], { deferVisuals: true });
    const gameScene = new THREE.Scene();
    const game = createGameplay(gameScene, track);
    const root = gameScene.children[0];

    const actors = [0, 1].map((id) => ({
      id,
      car: 'barrage',
      driver: 'sproto',
      isPlayer: id === 0,
      finish: null,
      kart: { ...createKart(carById('barrage')), s: 100 + id * 30, x: 0 },
      boost: createBoost(),
      held: 1,
      charges: 1,
    }));

    expect(game.use(actors[0], 1, actors, false)).toBe(true);
    const firstBall = root.children.find((m) => m.name === 'ball');
    expect(firstBall).toBeTruthy();

    // Advance until ball expires (3.5s = 215 ticks).
    for (let i = 0; i < 225; i++) game.update(1 / 60, actors);
    expect(root.children.filter((m) => m.name === 'ball').length).toBe(0);

    // Firing again reuses the exact pooled Mesh instance!
    actors[0].held = 1;
    actors[0].charges = 1;
    expect(game.use(actors[0], 1, actors, false)).toBe(true);
    const secondBall = root.children.find((m) => m.name === 'ball');
    expect(secondBall).toBe(firstBall);
    track.dispose();
  });

  it('fades rivals blocking camera line-of-sight analytically across wide, tall, scaled, and rolling cars', () => {
    const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.15, 2300);
    camera.position.set(0, 2.5, 9.0);
    camera.lookAt(0, 1.2, 0);
    camera.updateMatrixWorld(true);

    for (const carId of ['apex', 'saucer', 'ironhide', 'skipper', 'geep']) {
      const player = makeKart(0, carById(carId), driverById('sproto'));
      const rivalBlocking = makeKart(1, carById(carId), driverById('cone'));
      const rivalBeside = makeKart(2, carById(carId), driverById('milady'));

      player.position.set(0, 0, 0);
      // Directly between camera (z = 9) and player (z = 0):
      rivalBlocking.position.set(0, 0, 4.2);
      // Beside player in an adjacent lane (x = 5.5):
      rivalBeside.position.set(5.5, 0, 2.0);

      animateKart(player, { speed: 45, s: 10 }, { tier: 0 }, 1.0);
      animateKart(rivalBlocking, { speed: 45, s: 14, stunRemaining: 0.4, hitRollSide: 1 }, { tier: 0 }, 1.0);
      animateKart(rivalBeside, { speed: 45, s: 12 }, { tier: 0 }, 1.0);

      updateRivalVisibility(camera, [player, rivalBlocking, rivalBeside], 0);

      let blockingTransparent = false;
      rivalBlocking.traverse((m) => {
        if (m.isMesh && m.material.transparent && m.material.opacity < 0.2) blockingTransparent = true;
      });
      expect(blockingTransparent).toBe(true);

      let besideFaded = false;
      rivalBeside.traverse((m) => {
        if (m.isMesh && m.material.opacity < 0.2) besideFaded = true;
      });
      expect(besideFaded).toBe(false);

      disposeKart(player);
      disposeKart(rivalBlocking);
      disposeKart(rivalBeside);
    }
  });

  it('widens chase camera FOV smoothly above 50 m/s (180 -> 313 km/h overdrive) without altering sub-50 m/s framing', () => {
    const scene = new THREE.Scene();
    const track = createTrack(scene, CIRCUITS[0], { deferVisuals: true });
    const camCruise = new THREE.PerspectiveCamera(62, 16 / 9, 0.15, 2300);
    const camSuper = new THREE.PerspectiveCamera(62, 16 / 9, 0.15, 2300);
    const followCruise = createChaseCamera(camCruise, track);
    const followSuper = createChaseCamera(camSuper, track);

    followCruise({ s: 200, x: 0, y: 0, speed: 50, yaw: 0, travelYaw: 0 }, 0);
    followSuper({ s: 200, x: 0, y: 0, speed: 85, yaw: 0, travelYaw: 0 }, 0);

    expect(camCruise.fov).toBeCloseTo(64.5, 3);
    expect(camSuper.fov).toBeGreaterThan(66.4);
    expect(camSuper.position.distanceTo(new THREE.Vector3(
      track.sample(200, 0).position.x,
      camSuper.position.y,
      track.sample(200, 0).position.z,
    ))).toBeGreaterThan(
      camCruise.position.distanceTo(new THREE.Vector3(
        track.sample(200, 0).position.x,
        camCruise.position.y,
        track.sample(200, 0).position.z,
      )),
    );
    track.dispose();
  });

  it('keeps perf telemetry disabled unless ?perf=1 is present', () => {
    expect(isPerfEnabled('')).toBe(false);
    expect(isPerfEnabled('?perf=0')).toBe(false);
    expect(isPerfEnabled('?perf=1')).toBe(true);

    const off = createPerfMonitor({ enabled: false });
    expect(off.enabled).toBe(false);
    expect(document.getElementById('perf-hud')).toBeNull();

    const on = createPerfMonitor({ enabled: true });
    expect(on.enabled).toBe(true);
    on.beginSim();
    on.endSim();
    on.recordFrame(16.6, { info: { render: { calls: 24, triangles: 48200 } } }, 1000);
    const hud = document.getElementById('perf-hud');
    expect(hud?.textContent).toContain('DRAW 24');
    on.dispose();
    expect(document.getElementById('perf-hud')).toBeNull();
  });

  it('shows the graphics tier, pixel ratio and canvas size in the perf HUD', () => {
    const off = createPerfMonitor({ enabled: false });
    expect(() => off.noteQuality('auto', 1.6, 1)).not.toThrow();

    const on = createPerfMonitor({ enabled: true });
    const renderer = { info: { render: { calls: 1, triangles: 3 } }, domElement: { width: 1958, height: 1224 } };
    on.recordFrame(16.6, renderer, 1000);
    expect(document.getElementById('perf-hud').textContent).not.toContain('GFX');
    on.noteQuality('auto', 1.36, 0.85);
    on.recordFrame(16.6, renderer, 2000);
    expect(document.getElementById('perf-hud').textContent).toContain('GFX auto  PR 1.36 (x0.85)  1958x1224');
    on.dispose();
  });
});
