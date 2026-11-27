// A long AI race for a CPU profile of the simulation tick.
//   node --cpu-prof --cpu-prof-dir=scripts/bench/prof scripts/bench/prof.mjs [seats=12] [course=track02]
// Open the .cpuprofile it writes in Chrome DevTools (Performance, Load profile).
import { createSimWorld } from '../../src/sim/world.js';

const seats = +process.argv[2] || 12;
const courseId = process.argv[3] || 'track02';
const world = createSimWorld({ courseId, seed: 77, seats: Array.from({ length: seats }, () => ({ kind: 'ai' })), finishRule: 'all_racers', finishGraceSeconds: 600 });
for (let i = 0; i < 60 * 400; i++) world.step({});
console.log(`${seats} seats on ${courseId}: ${world.state.tick ?? 60 * 400} ticks stepped`);
