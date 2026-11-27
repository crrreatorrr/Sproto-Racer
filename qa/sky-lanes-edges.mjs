// Run with node --import ./tests/register-sdk-hook.js qa/sky-lanes-edges.mjs.
// Gameplay QA sweep for Sky Lanes: starts in every sector, every item in the air,
// every car through a lane, reversing into a lane, respawns, and race invariants.
import { CIRCUITS } from '../src/sim/track-core.js';
import { createSimWorld } from '../src/sim/world.js';
import { CARS } from '../src/roster.js';
import { ITEMS } from '../src/items.js';
import { CRUISE_SPEED, startFlight } from '../src/driving.js';

const problems = [];
const note = (msg) => problems.push(msg);
const finite = (k) => ['s', 'x', 'y', 'speed', 'yaw', 'travelYaw', 'skyY', 'skyVX', 'skyVY'].every((f) => Number.isFinite(k[f]));
const mainLane = (track) => track.sky.lanes.find((l) => !l.optional);
const local = (track, s) => ((s % track.length) + track.length) % track.length;

// A grounded, non-falling kart inside a main lane is driving on road that is not there.
// The first metre past the deck edge is the lip the kart rolls over before it drops.
function onMissingRoad(track, k) {
  if (k.flying || k.fall || !k.grounded) return false;
  const d = local(track, k.s);
  return track.sky.lanes.some((lane) => !lane.optional && d > lane.start + 25 && d < lane.end - 1);
}

function invariants(world, label) {
  for (const a of world.state.actors) {
    const k = a.kart;
    if (!finite(k)) note(`${label}: non-finite kart state on #${a.id}`);
    if (k.flying) {
      const lane = world.track.sky.lanes[k.skyLane];
      if (!lane) note(`${label}: #${a.id} flying with no lane`);
      else if (Math.abs(k.x) > lane.width / 2 + 0.5) note(`${label}: #${a.id} outside the corridor (x ${k.x.toFixed(1)})`);
      if (k.grounded) note(`${label}: #${a.id} flying and grounded`);
      if (k.speed > 2.2 * CRUISE_SPEED * (k.tuning?.speed ?? 1) + 1e-6) note(`${label}: #${a.id} over the speed ceiling`);
    }
  }
}

// 1. Test Drive from every sector, every lap: does anything start on missing road?
for (const course of CIRCUITS) {
  for (let sector = 0; sector < course.names.length; sector++) {
    for (const lap of [1, 2, 3]) {
      const world = createSimWorld({ course, mode: 'test', settings: { sector, speed: 'cruise', lap, rivals: 'pack' } });
      let bad = 0;
      for (let t = 0; t < 60 * 6; t++) {
        world.step({ 0: { throttle: 1 } });
        if (onMissingRoad(world.track, world.state.player.kart)) bad++;
        invariants(world, `${course.id} test s${sector + 1} L${lap}`);
      }
      if (bad) note(`${course.id} Test Drive sector ${sector + 1} lap ${lap}: player drove ${bad} ticks on road that a Sky Lane removed`);
    }
  }
}

// 2. Every car through the main lane of every circuit.
for (const course of CIRCUITS) {
  for (const car of CARS) {
    const world = createSimWorld({ course, mode: 'test', settings: { sector: 1, speed: 'cruise', lap: 1, rivals: 'solo', car: car.id }, seats: [{ kind: 'ai', car: car.id }] });
    const lane = mainLane(world.track);
    const k = world.state.player.kart;
    Object.assign(k, { s: lane.start - 40, x: 0, speed: 60 });
    let flew = false;
    let landed = false;
    for (let t = 0; t < 60 * 40 && !landed; t++) {
      world.step({});
      invariants(world, `${course.id} ${car.id}`);
      flew ||= k.flying;
      landed = flew && !k.flying && k.grounded;
    }
    if (!flew || !landed) note(`${course.id} ${car.id}: flew ${flew}, landed ${landed}`);
    if (k.rescues) note(`${course.id} ${car.id}: needed ${k.rescues} rescue(s) in its lane run`);
  }
}

// 3. Every item used by a flying player at flying rivals, and at a flying player.
for (const course of CIRCUITS) {
  for (let item = 0; item < ITEMS.length; item++) {
    for (const rivals of ['ahead', 'behind', 'alongside', 'pack']) {
      const world = createSimWorld({ course, mode: 'test', settings: { sector: 1, speed: 'cruise', lap: 1, rivals, item } });
      const lane = mainLane(world.track);
      const index = world.track.sky.lanes.indexOf(lane);
      const road = { sky: world.track.sky, length: world.track.length, heightAt: world.track.heightAt };
      world.state.actors.forEach((a, i) => {
        const offset = { ahead: [0, 14], behind: [0, -14], alongside: [0, 0], pack: [0, 8, 8, 14, 14, 20] }[rivals][i] ?? 0;
        const k = a.kart;
        Object.assign(k, { s: lane.start + 60 + offset, x: i === 0 ? 0 : (i % 2 ? 3 : -3), speed: 1.6 * CRUISE_SPEED });
        startFlight(k, road, index);
        k.skyY = 12;
        k.skyLaunch = 0;
      });
      let error = null;
      try {
        for (let t = 0; t < 60 * 5; t++) {
          world.step({ 0: { throttle: 1, itemPressed: t % 40 === 0, itemBackward: t % 80 === 40 } });
          invariants(world, `${course.id} item ${ITEMS[item].name} vs ${rivals}`);
        }
      } catch (e) {
        error = e;
      }
      if (error) note(`${course.id} ${ITEMS[item].name} vs ${rivals}: threw ${error.message}`);
      const p = world.state.player.kart;
      if (p.flying && p.speed < 20) note(`${course.id} ${ITEMS[item].name} vs ${rivals}: player stalled at ${p.speed.toFixed(1)} m/s in the air`);
      if (p.stunRemaining > 0 && p.flying) note(`${course.id} ${ITEMS[item].name}: a ground stun applied in flight`);
    }
  }
}

// 4. Reversing off the landing deck back into a lane.
for (const course of CIRCUITS) {
  const world = createSimWorld({ course, mode: 'test', settings: { sector: 1, speed: 'standstill', lap: 1, rivals: 'solo' } });
  const lane = mainLane(world.track);
  const k = world.state.player.kart;
  Object.assign(k, { s: lane.end + 6, x: 0, speed: 0, grounded: true });
  let bad = 0;
  let fell = false;
  for (let t = 0; t < 60 * 6; t++) {
    world.step({ 0: { reverse: k.fall ? 0 : 1 } });
    if (onMissingRoad(world.track, k)) bad++;
    fell ||= !!k.fall;
  }
  if (bad) note(`${course.id}: reversing off the deck drove ${bad} ticks on road that a Sky Lane removed`);
  if (!fell || k.rescues !== 1 || local(world.track, k.s) < lane.end) note(`${course.id}: reversing off the deck was not rescued onto the deck`);
}

// 5. A tumble at the corridor floor drops out and the respawn relaunches.
for (const course of CIRCUITS) {
  const world = createSimWorld({ course, mode: 'test', settings: { sector: 1, speed: 'cruise', lap: 1, rivals: 'solo' }, seats: [{ kind: 'ai' }] });
  const lane = mainLane(world.track);
  const index = world.track.sky.lanes.indexOf(lane);
  const k = world.state.player.kart;
  Object.assign(k, { s: lane.start + 200, x: 0, speed: 90 });
  startFlight(k, { sky: world.track.sky, length: world.track.length, heightAt: world.track.heightAt }, index);
  k.skyY = lane.floor;
  k.skyLaunch = 0;
  k.tumble = 0.8;
  k.tumbleFall = true;
  let fell = false;
  let relaunched = false;
  for (let t = 0; t < 60 * 10 && !relaunched; t++) {
    world.step({});
    fell ||= !!k.fall;
    relaunched = fell && k.flying;
  }
  if (!fell || !relaunched) note(`${course.id}: floor tumble fell ${fell}, relaunched ${relaunched}`);
}

// 6. Full rival races: never on missing road, never outside a corridor.
for (const course of CIRCUITS) {
  const seats = Array.from({ length: 6 }, (_, i) => ({ kind: 'ai', gridIndex: i }));
  const world = createSimWorld({ course, seed: 3, finishRule: 'all_racers', seats });
  let bad = 0;
  for (let t = 0; t < 60 * 600 && !world.state.done; t++) {
    world.step({});
    invariants(world, `${course.id} race`);
    for (const a of world.state.actors) if (onMissingRoad(world.track, a.kart)) bad++;
  }
  if (!world.state.done) note(`${course.id}: rival race did not finish in 600 s`);
  if (bad) note(`${course.id} race: ${bad} kart-ticks on road that a Sky Lane removed`);
}

const unique = [...new Set(problems)];
console.log(unique.length ? unique.slice(0, 80).join('\n') : 'No Sky Lane edge problems found');
console.log(`${unique.length} distinct problem(s)`);
process.exitCode = unique.length ? 1 : 0;
