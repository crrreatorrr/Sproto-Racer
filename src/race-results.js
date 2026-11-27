// The final results of a race, in one shape for offline and online races.
//
//   { tick, hash, standings: [{ place, seat, car, driver, finishUs, human, name }] }
//
// `tick` and `hash` identify the exact final state. `finishUs` is the finish time in
// microseconds, or null for a kart that did not finish. `describeSeat(seat)` supplies
// who was in the seat: { human: boolean, name: string }.
//
// Plain JS on the simulation only, so the match host can use it on the server.

import { stateHash } from './sim/hash.js';

export function buildRaceResults(world, describeSeat) {
  return {
    tick: world.state.tick,
    hash: stateHash(world),
    standings: world.standings().map((row) => {
      const who = describeSeat(row.seat) || {};
      return {
        place: row.place,
        seat: row.seat,
        car: row.car,
        driver: row.driver,
        finishUs: row.finishUs ?? null,
        human: !!who.human,
        name: typeof who.name === 'string' ? who.name : '',
      };
    }),
  };
}
