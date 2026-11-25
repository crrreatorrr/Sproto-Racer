import { HUB_GAME_ID } from './config.js';

const LOOPBACK_HOST = /^(localhost|[\w-]+\.localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1)$/i;
const TOKEN_QUERY = /(?:^|[?&])(?:t|token|ticket|access_token|refresh_token|refresh)=/i;

/** Nakama's client server key. It is not a secret. Production without VITE_NAKAMA_SERVER_KEY refuses redeem and plays standalone. */
export const LOCAL_SERVER_KEY = 'defaultkey';

function pageEnv() {
  try {
    return import.meta.env ?? {};
  } catch {
    return {};
  }
}

/**
 * The build-time hub page (VITE_HUB_URL), checked the way Sproto Open World checks it.
 * Relative `/hub/` stays on this origin. An absolute URL must be https, or http on loopback
 * (and in dev). A token in the query is refused.
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
export function hubPageUrl(env = pageEnv()) {
  try {
    return trustedHubUrl(env.VITE_HUB_URL, { dev: env.DEV === true });
  } catch (err) {
    console.warn('[hub] VITE_HUB_URL refused, using /hub/', err);
    return '/hub/';
  }
}

/** The hub page plus `#from=sproto-racer`. The plaza puts the avatar back at this game's ring. */
export function hubExitUrl(page = hubPageUrl(), gameId = HUB_GAME_ID) {
  return `${String(page).replace(/\/$/, '')}/#from=${gameId}`;
}

/** Nakama's HTTP origin (VITE_NAKAMA_URL; the hub's compose default otherwise). */
export function nakamaUrl(env = pageEnv()) {
  return String(env.VITE_NAKAMA_URL || 'http://127.0.0.1:7350').replace(/\/$/, '');
}

export function nakamaServerKey({ envKey, dev, hostname } = {}) {
  if (envKey) return envKey;
  if (dev) return LOCAL_SERVER_KEY;
  return LOOPBACK_HOST.test(hostname ?? '') ? LOCAL_SERVER_KEY : '';
}

/** The key for this page. */
export function pageServerKey(env = pageEnv(), hostname = typeof location !== 'undefined' ? location.hostname : '') {
  return nakamaServerKey({
    envKey: env.VITE_NAKAMA_SERVER_KEY,
    dev: env.DEV === true,
    hostname,
  });
}

/**
 * Leave for the plaza. A live session for this game is closed by the SDK, which then navigates
 * to `<hub>/#from=sproto-racer`. Any other visit, including standalone play, still goes there.
 * `exit` on a different game's session would drop the player at that game's ring, so it is not used.
 */
export function leaveForHub({ api, navigate, page, gameId = HUB_GAME_ID }) {
  const session = api?.getSession?.() ?? null;
  const ours = !!(session && session.game === gameId && session.playerId);
  if (ours) {
    try {
      api.exit('return');
      return { via: 'sdk' };
    } catch {
      /* still leave */
    }
  }
  navigate(hubExitUrl(page, gameId));
  return { via: 'page' };
}

/** One return per page. A second press does not navigate again. `getDeps` is read on the first press. */
export function createReturn(getDeps) {
  let leaving = false;
  return function returnToHub() {
    if (leaving) return { via: 'again' };
    leaving = true;
    try {
      return leaveForHub(getDeps());
    } catch (err) {
      leaving = false;
      throw err;
    }
  };
}

export function hubConfirmCopy() {
  return {
    title: 'Return to hub?',
    body: 'This race ends here.',
    stay: 'KEEP RACING',
    leave: 'RETURN TO HUB',
  };
}

/** Standard mapping: A, B, up, down, left, right, Menu / Options. */
export function padEdges(pad) {
  const axis = (index) => Number(pad.axes?.[index]) || 0;
  const button = (index) => !!pad.buttons?.[index]?.pressed;
  return [
    button(0),
    button(1),
    button(12) || axis(1) < -0.65,
    button(13) || axis(1) > 0.65,
    button(14) || axis(0) < -0.65,
    button(15) || axis(0) > 0.65,
    button(9),
  ];
}

export function controlRole(el) {
  if (!el) return '';
  if (el.dataset?.role) return el.dataset.role;
  if (el.dataset?.track) return 'track';
  if (el.dataset?.mode) return 'mode';
  return '';
}

/**
 * Paddock focus order is tracks, modes, launch, the hub portal, then controller setup.
 * A / Cross activates the focused control. Menu / Options launches, except on the portal
 * and on controller setup, where it activates that control.
 */
export function lobbyPadAction({ edges, index, count, role }) {
  const [confirm, , up, down, left, right, menu] = edges;
  if (up || down || left || right) {
    const direction = left || up ? -1 : 1;
    return { type: 'focus', index: (index + direction + count) % count };
  }
  if (confirm || menu) {
    if (role === 'controls') return { type: 'controller' };
    if (role === 'portal') return { type: 'portal' };
    if (confirm && role === 'track') return { type: 'click' };
    return { type: 'launch' };
  }
  return { type: 'none' };
}

/**
 * Pause, finish, test tools and the mid-race hub confirm. B / Circle and Menu / Options step back.
 * Leaving a race asks first: the confirm panel's back action returns to the pause menu.
 */
export function modalPadAction({ modal, edges, index, count, tagName }) {
  const [confirm, cancel, up, down, left, right, menu] = edges;
  if (cancel || menu) {
    if (modal === 'finish') return { type: 'home' };
    if (modal === 'hub-exit') return { type: 'back-to-pause' };
    return { type: 'close' };
  }
  if (up || down) {
    const direction = up ? -1 : 1;
    return { type: 'focus', index: (index + direction + count) % count };
  }
  if (tagName === 'SELECT' && (left || right)) return { type: 'select', direction: left ? -1 : 1 };
  if (confirm && tagName === 'BUTTON') return { type: 'click' };
  return { type: 'none' };
}

/**
 * Escape leaves a panel the same way B does. Enter on the page background starts the race.
 * Enter on a focused button is left to the button, including Return to hub.
 */
export function menuKeyAction({ modal, code, activeRole }) {
  if (code === 'Escape' && modal) {
    if (modal === 'finish') return { type: 'home' };
    if (modal === 'hub-exit') return { type: 'back-to-pause' };
    return { type: 'close' };
  }
  if (code === 'Enter' && !modal && activeRole === 'body') return { type: 'launch' };
  return { type: 'none' };
}
