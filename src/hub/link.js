import { createHubSdk, HubSdkError, isGameId } from '@metaverse/hub-sdk/core';
import { hubVisitStarting } from '@metaverse/hub-sdk/progress';
import { HUB_GAME_ID } from './config.js';
import { pageServerKey } from './serverKey.js';

/**
 * One hub visit, as in Sproto Open World. The hub's login is the account: a portal visit arrives
 * as `#t=<ticket>`, `init` redeems it for a game session of that account (and strips it from the
 * address), or picks up the session cached for this tab. With neither, the game runs on its own.
 *
 * The username is the Nakama JWT `usn` claim. A blank name is a hub guest. Both are the same
 * account the plaza signed in; a guest is not a separate Racer profile.
 */

const DEAD_SESSION = new Set(['session_closed', 'unauthorized', 'not_game_session', 'session_expired', 'session_superseded']);
const LOOPBACK_HOST = /^(localhost|[\w-]+\.localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1)$/i;
const TOKEN_QUERY = /(?:^|[?&])(?:t|token|ticket|access_token|refresh_token|refresh)=/i;

export function errorCode(err) {
  if (!err) return '';
  const code = err.code;
  if (typeof code === 'string' && code) return code;
  return err instanceof Error ? err.message : String(err);
}

/** Nakama puts the username in the JWT `usn` claim. A blank name is a guest. */
export function usernameFromToken(token) {
  if (typeof token !== 'string') return '';
  const part = token.split('.')[1];
  if (!part) return '';
  try {
    const pad = part.length % 4 === 0 ? '' : '='.repeat(4 - (part.length % 4));
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/') + pad));
    return typeof json.usn === 'string' ? json.usn.trim() : '';
  } catch {
    return '';
  }
}

/**
 * The build-time hub page (VITE_HUB_URL). Relative `/hub/` stays on this origin. An absolute URL
 * must be https, or http on loopback (and in dev). A token in the query is refused.
 */
export function trustedHubUrl(configured, opts = {}) {
  const raw = String(configured ?? '').trim();
  if (!raw) return '/hub/';
  if (TOKEN_QUERY.test(raw)) throw new Error('hub_url_token');
  if (raw.startsWith('/')) {
    if (raw.startsWith('//')) throw new Error('hub_url');
    const path = raw.split('#')[0].split('?')[0];
    if (path.split('/').includes('..')) throw new Error('hub_url');
    return path.endsWith('/') ? path : `${path}/`;
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('hub_url');
  }
  if (url.username || url.password) throw new Error('hub_url');
  if (url.search && TOKEN_QUERY.test(`?${url.search.slice(1)}`)) throw new Error('hub_url_token');
  const loopback = LOOPBACK_HOST.test(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && (loopback || opts.dev))) throw new Error('hub_origin');
  const path = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  return `${url.origin}${path}`;
}

/** The configured hub page, without a hash or a token query. A bad setting falls back to `/hub/`. */
export function hubPageUrl() {
  const env = import.meta.env ?? {};
  try {
    return trustedHubUrl(env.VITE_HUB_URL, { dev: Boolean(env.DEV) });
  } catch (err) {
    console.warn('[hub] VITE_HUB_URL refused, using /hub/', err);
    return '/hub/';
  }
}

/** `<hub>/#from=sproto-racer`. The plaza puts the player back once it knows this game. */
export function hubExitUrl(page = hubPageUrl()) {
  return `${page.replace(/\/$/, '')}/#from=${HUB_GAME_ID}`;
}

/** Nakama's HTTP origin. An empty VITE_NAKAMA_URL uses this page (the Vite `/v2` proxy). */
export function nakamaUrl() {
  const raw = (import.meta.env ?? {}).VITE_NAKAMA_URL;
  if (raw === '') return '';
  return (raw || 'http://127.0.0.1:7350').replace(/\/$/, '');
}

export class HubLink {
  status = 'offline';
  /** False only while the ticket is still being redeemed. */
  settled = true;
  /** A live game session of a hub account: cloud times are on. */
  bankable = false;
  playerId = null;
  /** The hub username, or `Guest`. */
  accountLabel = '';
  error = null;
  code = null;
  listeners = new Set();

  constructor(api = null, navigate = (url) => window.location.assign(url)) {
    this.api = api;
    this.navigate = navigate;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) {
      try { fn(); } catch (err) { console.warn('[hub] listener failed', err); }
    }
  }

  markOffline() {
    this.status = 'offline';
    this.bankable = false;
    this.playerId = null;
    this.accountLabel = '';
    this.error = null;
    this.code = null;
    this.emit();
  }

  fail(err) {
    this.status = 'error';
    this.bankable = false;
    this.playerId = null;
    this.accountLabel = '';
    this.code = errorCode(err);
    this.error = err instanceof Error ? err.message : String(err);
    this.emit();
  }

  adopt(session, username) {
    this.playerId = session.playerId;
    this.bankable = true;
    this.error = null;
    this.code = null;
    this.status = username ? 'connected' : 'guest';
    this.accountLabel = username || 'Guest';
    this.emit();
  }

  /** A cloud save failed. True when the session is gone. */
  noteSessionError(err) {
    if (!DEAD_SESSION.has(errorCode(err))) return false;
    this.fail(err instanceof Error ? err : new Error(errorCode(err)));
    return true;
  }

  /**
   * Leave for the plaza. A live session is closed by the SDK, which navigates to
   * `<hub>/#from=sproto-racer`. Standalone play still goes there.
   */
  exitToHub() {
    let delegated = false;
    try {
      if (this.bankable && this.api) {
        this.api.exit('return');
        delegated = true;
      }
    } catch {
      /* still leave */
    }
    this.bankable = false;
    if (!delegated) this.navigate(hubExitUrl());
  }
}

async function settle(link, api, now) {
  try {
    await api.init(HUB_GAME_ID);
    const session = api.getSession?.() ?? null;
    if (!session || !session.playerId || session.game !== HUB_GAME_ID) {
      link.markOffline();
      return;
    }
    if (session.expiresAt && session.expiresAt <= now()) {
      link.fail(new Error('session_expired'));
      return;
    }
    link.adopt(session, usernameFromToken(session.token));
  } catch (err) {
    console.warn('[hub] no hub session', err);
    link.fail(err);
  }
}

export function visitStarting(hash) {
  try {
    return hubVisitStarting(HUB_GAME_ID, hash);
  } catch {
    return false;
  }
}

function browserApi() {
  // The vendored SDK refuses an id it does not list before any request. Standalone play
  // must not surface that as an error; a portal ticket still does, so the paddock says why.
  if (!isGameId(HUB_GAME_ID)) return null;
  return createHubSdk({ serverUrl: nakamaUrl(), serverKey: pageServerKey(), hubUrl: hubPageUrl() });
}

/**
 * Start the hub visit without waiting. `ready` resolves once it is connected, a guest, offline
 * or failed, and never rejects. Pass `api` in tests. Omit it to use the vendored SDK.
 */
export function startHub(opts = {}) {
  let api;
  try {
    api = opts.api === undefined ? browserApi() : opts.api;
  } catch (err) {
    const link = new HubLink(null, opts.navigate);
    link.fail(err);
    return { link, ready: Promise.resolve(link) };
  }
  const link = new HubLink(api, opts.navigate);
  const starting = opts.starting ?? visitStarting();
  if (!api) {
    if (starting) link.fail(new HubSdkError('bad_game', `Unknown game "${HUB_GAME_ID}"`));
    return { link, ready: Promise.resolve(link) };
  }
  if (starting) {
    link.status = 'connecting';
    link.settled = false;
  }
  const ready = settle(link, api, opts.now ?? (() => Date.now())).then(() => {
    link.settled = true;
    link.emit();
    return link;
  });
  return { link, ready };
}
