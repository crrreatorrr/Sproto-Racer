// Transport adapters over `@metaverse/hub-sdk/realtime` (`realtimeFromSdk`, `MatchHandle`)
// plus a deterministic manual-clock LoopbackTransport for latency/jitter/loss tests.

import { realtimeFromSdk } from '@metaverse/hub-sdk/realtime';
import { createRng } from '../sim/rng.js';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Safely creates a `HubRealtime` client from Sproto Racer's `bootHub()` handle.
 * Awaits `hub.ready` and returns `null` when running standalone or before the Hub
 * registers `'sproto-racer'` (`hub.link.api === null`), avoiding `realtimeFromSdk(null)` throws.
 */
export async function realtimeForHub(hub, options = {}) {
  if (!hub) return null;
  if (hub.ready) {
    try {
      await hub.ready;
    } catch {
      return null;
    }
  }
  const sdk = hub.link?.api ?? null;
  if (!sdk || typeof sdk.getSession !== 'function' || !sdk.getSession()) {
    return null;
  }
  return realtimeFromSdk(sdk, options);
}

/**
 * Thin uniform wrapper around `@metaverse/hub-sdk/realtime` `MatchHandle`.
 */
export function createHubMatchTransport(matchHandle) {
  return {
    get matchId() { return matchHandle.matchId; },
    get label() { return matchHandle.label; },
    get self() { return matchHandle.self; },
    get presences() { return matchHandle.presences; },
    send(opCode, data, opts) {
      matchHandle.send(opCode, data, opts);
    },
    onMessage(cb) {
      return matchHandle.onMessage(cb);
    },
    onPresence(cb) {
      return matchHandle.onPresence(cb);
    },
    onRejoin(cb) {
      return matchHandle.onRejoin(cb);
    },
    onClose(cb) {
      return matchHandle.onClose(cb);
    },
    leave() {
      return matchHandle.leave();
    },
  };
}

function toBytes(payload) {
  if (payload instanceof Uint8Array) return payload.slice();
  if (typeof payload === 'string') return textEncoder.encode(payload);
  if (payload === undefined || payload === null) return new Uint8Array(0);
  return textEncoder.encode(JSON.stringify(payload));
}

function makeMatchData(matchId, opCode, bytes, sender, reliable = true) {
  return {
    matchId,
    opCode,
    data: bytes,
    sender,
    reliable,
    text() {
      return textDecoder.decode(bytes);
    },
    json() {
      return JSON.parse(textDecoder.decode(bytes));
    },
  };
}

/**
 * Deterministic manual clock scheduler for simulated network links (zero wall-clock timers).
 */
export function createManualScheduler(startMs = 0) {
  let currentMs = startMs;
  let nextId = 1;
  const queue = [];

  function schedule(delayMs, fn) {
    const due = currentMs + Math.max(0, delayMs);
    const item = { id: nextId++, due, fn, canceled: false };
    queue.push(item);
    queue.sort((a, b) => a.due - b.due || a.id - b.id);
    return () => { item.canceled = true; };
  }

  function advance(deltaMs) {
    const target = currentMs + Math.max(0, deltaMs);
    while (queue.length > 0 && queue[0].due <= target) {
      const next = queue.shift();
      currentMs = next.due;
      if (!next.canceled) next.fn();
    }
    currentMs = target;
  }

  return {
    now: () => currentMs,
    pending: () => queue.filter((q) => !q.canceled).length,
    schedule,
    advance,
  };
}

/**
 * Multi-peer in-memory `MatchHandle`-compatible room with seeded latency, jitter, packet loss,
 * and drop/rejoin simulation for deterministic multiplayer tests.
 */
export function createLoopbackRoom(options = {}) {
  const scheduler = options.scheduler ?? createManualScheduler();
  const rng = createRng(options.seed ?? 0x52414345);
  const matchId = options.matchId ?? 'loopback-match-1';
  let label = options.label ?? null;
  let latencyMs = options.latencyMs ?? 0;
  let jitterMs = options.jitterMs ?? 0;
  let lossRate = options.lossRate ?? 0;

  const peers = new Map();

  function activePresencesExcept(userId) {
    const list = [];
    for (const p of peers.values()) {
      if (p.connected && !p.closed && p.self.userId !== userId) list.push(p.self);
    }
    return list;
  }

  function joinPeer(user) {
    const self = {
      userId: user.userId,
      sessionId: `sess-${user.userId}-1`,
      username: user.username ?? user.userId,
    };
    const msgListeners = new Set();
    const presenceListeners = new Set();
    const rejoinListeners = new Set();
    const closeListeners = new Set();

    const peer = {
      self,
      connected: true,
      closed: false,
      msgListeners,
      presenceListeners,
      rejoinListeners,
      closeListeners,
    };

    // Notify existing connected peers of join.
    for (const other of peers.values()) {
      if (other.connected && !other.closed) {
        for (const cb of other.presenceListeners) cb({ joins: [self], leaves: [] });
      }
    }
    peers.set(self.userId, peer);

    const handle = {
      get matchId() { return matchId; },
      get label() { return label; },
      get self() { return peer.self; },
      get presences() { return activePresencesExcept(peer.self.userId); },
      send(opCode, data, opts = {}) {
        if (!peer.connected || peer.closed) return;
        const reliable = opts.reliable !== false;
        const bytes = toBytes(data);
        const targetIds = opts.to ? new Set(opts.to.map((p) => p.userId)) : null;

        for (const target of peers.values()) {
          if (target === peer || !target.connected || target.closed) continue;
          if (targetIds && !targetIds.has(target.self.userId)) continue;
          if (!reliable && lossRate > 0 && rng.nextFloat() < lossRate) continue;
          const jitter = jitterMs > 0 ? (rng.nextFloat() * 2 - 1) * jitterMs : 0;
          const delay = Math.max(0, latencyMs + jitter);
          const senderSnap = { ...peer.self };
          scheduler.schedule(delay, () => {
            if (!target.connected || target.closed) return;
            const pkt = makeMatchData(matchId, opCode, bytes, senderSnap, reliable);
            for (const cb of target.msgListeners) cb(pkt);
          });
        }
      },
      onMessage(cb) {
        msgListeners.add(cb);
        return () => msgListeners.delete(cb);
      },
      onPresence(cb) {
        presenceListeners.add(cb);
        return () => presenceListeners.delete(cb);
      },
      onRejoin(cb) {
        rejoinListeners.add(cb);
        return () => rejoinListeners.delete(cb);
      },
      onClose(cb) {
        closeListeners.add(cb);
        return () => closeListeners.delete(cb);
      },
      async leave() {
        if (peer.closed) return;
        peer.closed = true;
        peer.connected = false;
        peers.delete(peer.self.userId);
        for (const cb of closeListeners) cb('left');
        for (const other of peers.values()) {
          if (other.connected && !other.closed) {
            for (const cb of other.presenceListeners) cb({ joins: [], leaves: [peer.self] });
          }
        }
      },
      drop() {
        if (!peer.connected || peer.closed) return;
        peer.connected = false;
        for (const other of peers.values()) {
          if (other.connected && !other.closed) {
            for (const cb of other.presenceListeners) cb({ joins: [], leaves: [peer.self] });
          }
        }
      },
      rejoin() {
        if (peer.closed || peer.connected) return;
        peer.self = {
          ...peer.self,
          sessionId: `${peer.self.sessionId}-r`,
        };
        peer.connected = true;
        for (const other of peers.values()) {
          if (other !== peer && other.connected && !other.closed) {
            for (const cb of other.presenceListeners) cb({ joins: [peer.self], leaves: [] });
          }
        }
        for (const cb of rejoinListeners) cb();
      },
    };

    return handle;
  }

  return {
    scheduler,
    setConditions(next = {}) {
      if (next.latencyMs !== undefined) latencyMs = next.latencyMs;
      if (next.jitterMs !== undefined) jitterMs = next.jitterMs;
      if (next.lossRate !== undefined) lossRate = next.lossRate;
    },
    setLabel(nextLabel) {
      label = nextLabel;
    },
    joinPeer,
  };
}
