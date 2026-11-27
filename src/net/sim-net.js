// Deterministic simulated network and an in-process match: a real `createMatchHost` and
// real rollback clients joined by links that behave like the production socket.
//
// The production transport is one WebSocket (TCP): messages are never lost or reordered,
// they are only late, and one late message holds up everything behind it. Each link here
// does the same: a fixed latency, random jitter, and occasional stalls of a few hundred
// milliseconds, with delivery order always preserved.
//
// Used by the tests and the benchmark, and usable in the browser to develop the online
// UI against a local host with no server. Time only moves when `runUntil` is called.

import { createRng } from '../sim/rng.js';
import { createMatchHost } from './match-host.js';
import { createRollbackClient } from './rollback-client.js';
import { socketBytes } from './wire.js';

const TICK_MS = 1000 / 60;

export function createSimNet(options = {}) {
  const rng = createRng(options.seed ?? 0x4e4554);
  let nowMs = options.startMs ?? 0;
  const links = [];
  const timers = [];

  function link(conditions = {}) {
    const queue = [];
    let head = 0;
    let lastDue = -Infinity;
    const self = {
      latencyMs: conditions.latencyMs ?? 0,
      jitterMs: conditions.jitterMs ?? 0,
      // Chance per message of a stall, and its length range.
      stallChance: conditions.stallChance ?? 0,
      stallMinMs: conditions.stallMinMs ?? 200,
      stallMaxMs: conditions.stallMaxMs ?? 600,
      deliver: conditions.deliver ?? null,
      stalls: 0,
      send(message) {
        let delay = self.latencyMs + (self.jitterMs > 0 ? rng.nextFloat() * self.jitterMs : 0);
        if (self.stallChance > 0 && rng.nextFloat() < self.stallChance) {
          delay += self.stallMinMs + rng.nextFloat() * (self.stallMaxMs - self.stallMinMs);
          self.stalls++;
        }
        const due = Math.max(lastDue, nowMs + delay);
        lastDue = due;
        queue.push({ due, message });
      },
      /** One extra stall right now: everything sent in the next `ms` arrives after it. */
      stall(ms) {
        lastDue = Math.max(lastDue, nowMs + self.latencyMs + ms);
        self.stalls++;
      },
      clear() {
        queue.length = 0;
        head = 0;
      },
      get pending() { return queue.length - head; },
      nextDue() {
        return head < queue.length ? queue[head].due : Infinity;
      },
      pump() {
        const item = queue[head++];
        if (head > 256 && head * 2 > queue.length) {
          queue.splice(0, head);
          head = 0;
        }
        if (self.deliver) self.deliver(item.message);
      },
    };
    links.push(self);
    return self;
  }

  /** Calls `fn(nowMs)` every `periodMs`, first at `nowMs + offsetMs`. */
  function every(periodMs, offsetMs, fn) {
    const timer = { period: periodMs, next: nowMs + offsetMs, fn, stopped: false, count: 0, base: nowMs + offsetMs };
    timers.push(timer);
    return {
      stop() { timer.stopped = true; },
      /** Skip firings until `ms` from now (a frozen tab). */
      pause(ms) {
        timer.base += ms;
        timer.next = timer.base + timer.count * timer.period;
      },
    };
  }

  function runUntil(untilMs) {
    for (;;) {
      let timerAt = Infinity;
      let bestTimer = null;
      for (let i = 0; i < timers.length; i++) {
        const t = timers[i];
        if (!t.stopped && t.next < timerAt) {
          timerAt = t.next;
          bestTimer = t;
        }
      }
      let linkAt = Infinity;
      let bestLink = null;
      for (let i = 0; i < links.length; i++) {
        const due = links[i].nextDue();
        if (due < linkAt) {
          linkAt = due;
          bestLink = links[i];
        }
      }
      // A delivery due at the same instant as a timer goes first.
      if (linkAt <= timerAt) bestTimer = null;
      else bestLink = null;
      const best = Math.min(linkAt, timerAt);
      if (best > untilMs) break;
      nowMs = Math.max(nowMs, best);
      if (bestLink) bestLink.pump();
      else if (bestTimer) {
        bestTimer.count++;
        bestTimer.next = bestTimer.base + bestTimer.count * bestTimer.period;
        bestTimer.fn(nowMs);
      }
    }
    nowMs = Math.max(nowMs, untilMs);
  }

  return {
    rng,
    now: () => nowMs,
    link,
    every,
    runUntil,
    runFor: (ms) => runUntil(nowMs + ms),
  };
}

/**
 * A whole match in one process. The host ticks at 60 Hz; each connected client runs its
 * own frame loop (its own rate and phase) and talks to the host over a pair of links.
 */
export function createLoopbackMatch(options = {}) {
  const net = options.net ?? createSimNet({ seed: options.netSeed });
  const endpoints = new Map();

  const host = createMatchHost({
    ...options.host,
    send(playerId, op, data) {
      const ep = endpoints.get(playerId);
      if (!ep || !ep.connected) return;
      const length = data.length;
      ep.traffic.downMessages++;
      ep.traffic.downBytes += length;
      ep.traffic.downSocketBytes += socketBytes(length, 'down', op);
      ep.down.send({ op, data });
    },
  });
  const hostTimer = net.every(TICK_MS, options.hostOffsetMs ?? 0, () => host.tick());

  /**
   * Opens a player's connection and returns a transport shaped like the hub SDK's
   * MatchHandle: send(opCode, data), onMessage(cb), onRejoin(cb). `conditions` shapes
   * both links ({ latencyMs, jitterMs, stallChance, ... } or { up: {...}, down: {...} }).
   */
  function open(playerId, conditions = {}, meta = {}) {
    const upConditions = conditions.up ?? conditions;
    const downConditions = conditions.down ?? conditions;
    const listeners = [];
    const rejoinListeners = [];
    const ep = {
      playerId,
      connected: true,
      traffic: { upMessages: 0, upBytes: 0, upSocketBytes: 0, downMessages: 0, downBytes: 0, downSocketBytes: 0 },
      up: null,
      down: null,
      client: null,
      frame: null,
      transport: null,
    };
    ep.up = net.link({
      ...upConditions,
      deliver: (m) => {
        if (ep.connected) host.receive(playerId, m.op, m.data);
      },
    });
    ep.down = net.link({
      ...downConditions,
      deliver: (m) => {
        if (!ep.connected) return;
        const packet = { opCode: m.op, data: m.data };
        for (let i = 0; i < listeners.length; i++) listeners[i](packet);
      },
    });
    ep.transport = {
      send(op, data) {
        if (!ep.connected) return;
        const length = data.length;
        ep.traffic.upMessages++;
        ep.traffic.upBytes += length;
        ep.traffic.upSocketBytes += socketBytes(length, 'up', op);
        ep.up.send({ op, data });
      },
      onMessage(cb) {
        listeners.push(cb);
        return () => listeners.splice(listeners.indexOf(cb), 1);
      },
      onRejoin(cb) {
        rejoinListeners.push(cb);
        return () => rejoinListeners.splice(rejoinListeners.indexOf(cb), 1);
      },
    };
    /** Socket drops: the host sees the player leave and queued messages are gone. */
    ep.disconnect = () => {
      if (!ep.connected) return;
      ep.connected = false;
      ep.up.clear();
      ep.down.clear();
      host.leave(playerId);
    };
    /** Socket comes back: join again; rejoin listeners say hello and get a keyframe. */
    ep.reconnect = () => {
      if (ep.connected) return;
      ep.connected = true;
      host.join(playerId, meta);
      for (let i = 0; i < rejoinListeners.length; i++) rejoinListeners[i]();
    };
    endpoints.set(playerId, ep);
    host.join(playerId, meta);
    return ep;
  }

  /**
   * Adds a player with a rollback client and its own frame loop.
   * `clientOptions.controls(tick, client)` supplies the player's inputs.
   */
  function connect(playerId, conditions = {}, clientOptions = {}) {
    const ep = open(playerId, conditions, { name: clientOptions.name ?? playerId });
    ep.controls = clientOptions.controls ?? null;
    ep.client = createRollbackClient({
      ...clientOptions,
      now: net.now,
      send: ep.transport.send,
    });
    ep.transport.onMessage((packet) => ep.client.receive(packet.opCode, packet.data));
    ep.transport.onRejoin(() => ep.client.hello(clientOptions.hello));
    const sample = (tick) => (ep.controls ? ep.controls(tick, ep.client) : null);
    ep.frame = net.every(clientOptions.frameMs ?? TICK_MS, clientOptions.frameOffsetMs ?? 3, (now) => {
      ep.client.update(now, sample);
    });
    ep.client.hello(clientOptions.hello);
    return ep;
  }

  return {
    net,
    host,
    endpoints,
    open,
    connect,
    stop() {
      hostTimer.stop();
      for (const ep of endpoints.values()) {
        if (ep.frame) ep.frame.stop();
      }
    },
  };
}
