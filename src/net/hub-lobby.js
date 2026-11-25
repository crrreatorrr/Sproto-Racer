// Matchmaking, room-code lobby, and online player count client over `@metaverse/hub-sdk/realtime`.
// Mirrors the shared Hub multiplayer flow used across Sproto games without altering current paddock UI.

import {
  buildOpenMatchQuery,
  DEFAULT_MAX_SEATS,
  GAME_ID,
  MAX_SEATS_LIMIT,
  NET_VERSION,
  normalizeRoomCode,
  RACER_SIM_VERSION,
  RPC_IDS,
} from './protocol.js';
import { createHubMatchTransport } from './transport.js';

export function createHubLobby(realtime) {
  if (!realtime) throw new Error('createHubLobby requires a HubRealtime instance');

  let activeTicket = null;
  let activeCancel = null;

  async function ensureConnected() {
    if (realtime.state === 'idle' || realtime.state === 'closed') {
      await realtime.connect();
    }
  }

  async function cancel() {
    const ticket = activeTicket;
    activeTicket = null;
    if (activeCancel) {
      const fn = activeCancel;
      activeCancel = null;
      fn();
    }
    if (ticket) {
      try {
        await realtime.removeMatchmaker(ticket);
      } catch {
        /* Ticket may have already matched or socket closed. */
      }
    }
  }

  /**
   * Finds an open Sproto Racer match by Bleve label query (`+label.kind:sproto_racer +label.open:T`)
   * and falls back to the Nakama matchmaker queue when none is waiting.
   */
  async function quickMatch(opts = {}) {
    await ensureConnected();
    const maxSeats = Math.max(2, Math.min(MAX_SEATS_LIMIT, opts.maxSeats ?? DEFAULT_MAX_SEATS));
    const mode = opts.mode || 'race';
    const courseId = opts.courseId || undefined;

    const query = buildOpenMatchQuery({ courseId, mode, maxSeats });
    const existing = await realtime.joinMatchByQuery({
      query,
      maxSize: maxSeats,
      pick: 'fullest',
    });
    if (existing) {
      return createHubMatchTransport(existing);
    }

    const stringProperties = {
      game: GAME_ID,
      version: NET_VERSION,
      simVersion: RACER_SIM_VERSION,
      mode,
    };
    if (courseId) stringProperties.courseId = courseId;

    const matchQuery = [
      `+properties.game:${GAME_ID}`,
      `+properties.version:${NET_VERSION}`,
      `+properties.simVersion:${RACER_SIM_VERSION}`,
      `+properties.mode:${mode}`,
    ];
    if (courseId) matchQuery.push(`+properties.courseId:${courseId}`);

    return new Promise((resolve, reject) => {
      let settled = false;
      const unsub = realtime.onMatchmakerMatched(async (matched) => {
        if (settled) return;
        if (activeTicket && matched.ticket !== activeTicket) return;
        settled = true;
        activeTicket = null;
        activeCancel = null;
        unsub();
        try {
          const target = matched.matchId
            ? { matchId: matched.matchId }
            : { token: matched.token };
          const handle = await realtime.joinMatch(target, opts.metadata);
          resolve(createHubMatchTransport(handle));
        } catch (err) {
          reject(err);
        }
      });

      activeCancel = () => {
        if (settled) return;
        settled = true;
        unsub();
        reject(Object.assign(new Error('Matchmaking canceled'), { code: 'CANCELED' }));
      };

      realtime
        .addMatchmaker({
          query: matchQuery.join(' '),
          minCount: opts.minCount ?? 2,
          maxCount: maxSeats,
          stringProperties,
        })
        .then(({ ticket }) => {
          if (settled) {
            realtime.removeMatchmaker(ticket).catch(() => {});
            return;
          }
          activeTicket = ticket;
        })
        .catch((err) => {
          if (settled) return;
          settled = true;
          activeCancel = null;
          unsub();
          reject(err);
        });
    });
  }

  /**
   * Creates a private/code room via `racer.room_create` and joins the returned `matchId`.
   */
  async function createRoom(opts = {}) {
    await ensureConnected();
    const maxSeats = Math.max(2, Math.min(MAX_SEATS_LIMIT, opts.maxSeats ?? DEFAULT_MAX_SEATS));
    const res = await realtime.rpc(RPC_IDS.ROOM_CREATE, {
      game: GAME_ID,
      version: NET_VERSION,
      simVersion: RACER_SIM_VERSION,
      courseId: opts.courseId ?? 'track01',
      mode: opts.mode ?? 'race',
      maxSeats,
    });
    if (!res?.matchId) {
      throw Object.assign(new Error('Room creation returned no matchId'), { code: 'ROOM_CREATE_FAILED' });
    }
    const handle = await realtime.joinMatch({ matchId: res.matchId }, opts.metadata);
    return {
      code: res.code ?? null,
      matchId: res.matchId,
      transport: createHubMatchTransport(handle),
    };
  }

  /**
   * Normalizes a 6-char room code, resolves `matchId` via `racer.room_join`, and joins it.
   */
  async function joinRoom(rawCode, metadata = {}) {
    const code = normalizeRoomCode(rawCode);
    if (!code) {
      throw Object.assign(new Error('Invalid 6-character room code'), { code: 'INVALID_ROOM_CODE' });
    }
    await ensureConnected();
    const res = await realtime.rpc(RPC_IDS.ROOM_JOIN, {
      game: GAME_ID,
      code,
      version: NET_VERSION,
      simVersion: RACER_SIM_VERSION,
    });
    if (!res?.matchId) {
      throw Object.assign(new Error('Room not found'), { code: 'ROOM_NOT_FOUND' });
    }
    const handle = await realtime.joinMatch({ matchId: res.matchId }, metadata);
    return {
      code,
      matchId: res.matchId,
      transport: createHubMatchTransport(handle),
    };
  }

  async function onlineCount() {
    await ensureConnected();
    const res = await realtime.rpc(RPC_IDS.ONLINE_COUNT, { game: GAME_ID });
    return typeof res?.count === 'number' ? res.count : 0;
  }

  return {
    quickMatch,
    createRoom,
    joinRoom,
    onlineCount,
    cancel,
    get isSearching() { return activeTicket !== null || activeCancel !== null; },
  };
}
