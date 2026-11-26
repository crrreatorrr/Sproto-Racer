import { MathUtils } from 'three';
import { createTrackSample } from './sim/track-core.js';

const clamp = MathUtils.clamp;
const radians = MathUtils.degToRad;
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

// A critically damped spring following a linearly moving target. Using the
// previous target keeps the response consistent between physics/render rates.
class Spring {
  reset(value) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }
  follow(target, frequency, dt) {
    if (dt <= 0 || this.value === undefined) {
      this.reset(target);
      return target;
    }
    const rate = (target - this.target) / dt;
    const offset = this.value - this.target + (2 * rate) / frequency;
    const v = this.velocity - rate;
    const c = v + frequency * offset;
    const decay = Math.exp(-frequency * dt);
    this.value = target - (2 * rate) / frequency + (offset + c * dt) * decay;
    this.velocity = rate + (v - frequency * c * dt) * decay;
    this.target = target;
    return this.value;
  }
}

export function createChaseCamera(camera, track) {
  const heading = new Spring();
  const lane = new Spring();
  const elevation = new Spring();
  const incline = new Spring();
  const pace = new Spring();
  const rushPace = new Spring();
  const boom = new Spring();

  const roadS = createTrackSample();
  const nearS = createTrackSample();
  const farS = createTrackSample();
  const anchorS = createTrackSample();
  const rearSmp = createTrackSample();
  const floorS = createTrackSample();

  function sampleTrack(s, x, out) {
    if (track.sampleInto) return track.sampleInto(s, x, out);
    return Object.assign(out, track.sample(s, x));
  }

  return function followKart(k, dt, wide = false, lookBack = false) {
    const road = sampleTrack(k.s, k.x, roadS);
    const speed = pace.follow(clamp(k.speed / 50, 0, 1), 5, dt);
    // Subtle high-speed overdrive above 50 m/s (180 -> 313 km/h) so Turbo & Super Turbo read viscerally.
    const rush = rushPace.follow(clamp((k.speed - 50) / 37, 0, 1), 5.5, dt);
    const arm = boom.follow((wide ? 10.7 : 8.5) + speed + 0.65 * rush, 7, dt);
    const distance = lookBack ? -arm : arm;
    const near = sampleTrack(k.s - 4, k.x, nearS);
    const far = sampleTrack(k.s + 8 + speed * 4, k.x, farS);
    const roadYaw = Math.atan2(far.position.x - near.position.x, near.position.z - far.position.z);
    // Bias toward travel during a slide, while the nose can swing further
    // across the screen. A short preview keeps switchback exits in sight.
    const tangent = Math.atan2(road.forward.x, -road.forward.z);
    const targetYaw =
      tangent +
      k.travelYaw +
      0.25 * wrapAngle(roadYaw - tangent) +
      0.10 * clamp(wrapAngle(k.yaw - k.travelYaw), -0.7, 0.7);
    const unwrapped =
      dt > 0 && heading.target !== undefined
        ? heading.target + wrapAngle(targetYaw - heading.target)
        : targetYaw;
    const yaw = heading.follow(unwrapped, 13, dt);
    const forwardX = Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const smoothLane = lane.follow(k.x, 18, dt);
    const anchor = sampleTrack(k.s, k.x + clamp(smoothLane - k.x, -0.65, 0.65), anchorS);
    camera.position.x = anchor.position.x - forwardX * distance;
    camera.position.z = anchor.position.z - forwardZ * distance;

    // Keep the camera on this deck when the helix crosses itself. Estimate
    // its position across the rear cross-section and stay inside the rails.
    const rearS = k.s - (distance * Math.cos(yaw - tangent)) / clamp(1 - k.x * road.curvature, 0.65, 1.45);
    const rear = sampleTrack(rearS, 0, rearSmp);
    const offset =
      (camera.position.x - rear.position.x) * rear.right.x +
      (camera.position.z - rear.position.z) * rear.right.z;
    const limit = rear.width / 2 - 1.0;
    const rearLane = clamp(offset, -limit, limit);
    camera.position.x += rear.right.x * (rearLane - offset);
    camera.position.z += rear.right.z * (rearLane - offset);
    const floor = sampleTrack(rearS, rearLane, floorS);
    const grade = Math.atan2(
      far.deckY - near.deckY,
      Math.hypot(far.position.x - near.position.x, far.position.z - near.position.z),
    );
    const slope = incline.follow(clamp(grade, -0.30, 0.30), 7.5, dt);
    const worldHeight = road.position.y + k.y;
    const height = elevation.follow(
      worldHeight - 0.12 * Math.max(0, worldHeight - road.deckY) - 0.62 * (k.hopLift || 0),
      16,
      dt,
    );
    camera.position.y = Math.max(
      floor.position.y + 1.25,
      height + 3.75 + (arm - 8.5 - speed - 0.65 * rush) * 0.23 - distance * Math.tan(slope),
    );
    const aimYaw = Math.atan2(anchor.position.x - camera.position.x, camera.position.z - anchor.position.z);
    const pitch = -radians(6.8) + (lookBack ? -1 : 1) * slope * 0.87 - (k.fall ? clamp(-k.y * 0.055, 0, 0.52) : 0);
    camera.rotation.set(pitch, -aimYaw, 0, 'YXZ');
    const fov = 61 + 3.5 * speed + 2.2 * rush;
    if (Math.abs(camera.fov - fov) > 0.001) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  };
}
