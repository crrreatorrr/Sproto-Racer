// Online RaceRunner: the rollback client behind the same interface as the offline
// runner in ../race-runner.js, so a game loop drives both the same way.

import { copyKartPoses, createSeatView } from '../race-runner.js';
import { createRollbackClient } from './rollback-client.js';

/**
 * `transport` is anything shaped like the hub SDK's MatchHandle (or
 * `createHubMatchTransport`): send(opCode, data), onMessage(cb), and optionally
 * onRejoin(cb). `now()` returns milliseconds from a steady clock (performance.now in
 * the browser). `hello` is { car, driver, name }.
 *
 * To draw with the game's own track and gameplay wrappers, pass
 * `createWorld: (config) => createSimWorld({ ...config, track, play })`.
 */
export function createOnlineRaceRunner(options = {}) {
  const transport = options.transport;
  if (!transport || typeof transport.send !== 'function') throw new Error('createOnlineRaceRunner requires a transport');
  const now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const view = createSeatView();
  const previous = [];
  let viewWorld = null;

  const client = createRollbackClient({
    ...options.client,
    hello: options.hello,
    createWorld: options.createWorld,
    now,
    send: (op, data) => transport.send(op, data),
    onBeforeTick: (world) => copyKartPoses(world, previous),
  });

  const unsubscribe = [];
  if (transport.onMessage) unsubscribe.push(transport.onMessage((packet) => client.receive(packet.opCode, packet.data)));
  // After a dropped socket comes back the server needs a fresh hello and answers with a keyframe.
  if (transport.onRejoin) unsubscribe.push(transport.onRejoin(() => client.hello()));
  if (options.autoHello !== false) client.hello();

  function world() {
    const w = client.world;
    if (w !== viewWorld) {
      viewWorld = w;
      view.reset();
      previous.length = 0;
      if (w) copyKartPoses(w, previous);
    }
    return w;
  }

  return {
    kind: 'online',
    client,
    get world() { return world(); },
    get localSeat() { return client.localSeat; },
    get localActor() {
      const w = world();
      return w && client.localSeat >= 0 ? w.state.actors[client.localSeat] ?? null : null;
    },
    get phase() {
      const w = world();
      if (!w || !client.synced) return client.phase === 'finished' ? 'finished' : 'waiting';
      if (client.phase === 'finished') return 'finished';
      return w.state.countdown > 0 ? 'countdown' : 'racing';
    },
    get alpha() { return client.alpha; },
    get resimulating() { return client.resimulating; },
    get net() {
      return {
        rttMs: client.clock.rttMs,
        leadTicks: client.leadTicks,
        predictedTicks: client.predictedTicks,
        stalled: client.stalled,
        synced: client.synced,
      };
    },
    setReady: (ready) => client.setReady(ready),
    get lobby() { return client.lobby; },
    get error() { return client.error; },
    advance(dtSeconds, sampleControls) {
      world();
      return client.update(now(), sampleControls);
    },
    tick(controls) {
      world();
      return client.update(now(), () => controls);
    },
    previousKart: (seat) => previous[seat] ?? null,
    correction: (seat) => client.correction(seat),
    hud() {
      const w = world();
      return w ? view.read(w, Math.max(0, client.localSeat)) : null;
    },
    drainEvents: () => client.drainEvents(),
    noteEvent: (ev) => client.noteEvent(ev),
    // The host's result message, in the same shape as the local runner's (race-results.js).
    results: () => (client.phase === 'finished' ? client.results : null),
    dispose() {
      for (const off of unsubscribe) {
        if (typeof off === 'function') off();
      }
    },
  };
}
