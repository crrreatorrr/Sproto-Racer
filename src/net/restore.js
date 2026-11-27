// Exact snapshot restore for rollback.
//
// `applySnapshot` copies a snapshot's fields onto the live karts, but it never removes a
// field the snapshot does not have. The driving code adds a few fields to a kart the
// first time it leaves the ground (`airFloorY`, `takeoffPitch`, `takeoffRoll`), so after
// rolling back to a moment before that first jump the kart still carried the values from
// the abandoned timeline and the re-simulation drifted from the server.
//
// `restoreSnapshot` applies the snapshot and then blanks every kart and boost field the
// snapshot lacks. The fields are set to undefined rather than deleted: the simulation
// reads them with `??` and arithmetic, where the two are the same, and deleting keys
// would push these hot objects into V8's slow dictionary mode.
//
// A second hidden difference: the gameplay core keeps a private list of karts in play.
// In a world that has never been restored it is empty until the first racing tick, but
// `applyState` fills it. The AI reads that list when choosing a lane, so a rollback
// during the countdown changed the AI's first move. Before the first racing tick the
// gameplay state is pristine, so resetting it puts the list back the way a fresh world
// has it.

import { applySnapshot } from '../sim/snapshot.js';

function blankMissing(live, raw, keep) {
  for (const key in live) {
    if (key !== keep && live[key] !== undefined && !(key in raw)) live[key] = undefined;
  }
}

export function restoreSnapshot(world, snap) {
  if (!applySnapshot(world, snap)) return false;
  if (snap.gameplay && snap.gameplay.elapsed === 0 && world.play.reset) world.play.reset();
  const actors = world.state.actors;
  for (let i = 0; i < actors.length; i++) {
    const raw = snap.actors[i];
    if (!raw) continue;
    blankMissing(actors[i].kart, raw.kart, 'tuning');
    blankMissing(actors[i].boost, raw.boost, 'gain');
  }
  return true;
}
