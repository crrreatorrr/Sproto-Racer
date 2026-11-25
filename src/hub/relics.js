import { RELIC_NAMES, relicName } from './unlocks.js';

/**
 * Relics the signed-in hub account owns.
 *
 * A live visit (`connected` or `guest`) is the authority: `init` returns
 * `relics` and, for an id this SDK build does not type yet, `otherRelics`.
 * That list replaces the browser cache, including when the account owns none,
 * so a Relic the hub took back locks again. With no visit, the cache from the
 * last visit still applies, the same way Sproto Fighter keeps its copy. With
 * neither, nothing is owned and every car or character that has no row in
 * `unlocks.js` stays playable.
 */

/** Browser copy of the last hub visit. A new visit replaces it. */
export const RELIC_CACHE_KEY = 'sproto-racer-hub-relics';

const RELIC_ID = /^[a-z0-9_]{1,48}$/;

const KNOWN_IDS = Object.keys(RELIC_NAMES);

function browserStore() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Relic ids from an `init` result. Typed ids first, then ids this SDK does not know. Junk is dropped. */
export function relicsFromProfile(profile) {
  const typed = Array.isArray(profile?.relics) ? profile.relics : [];
  const other = Array.isArray(profile?.otherRelics) ? profile.otherRelics : [];
  const out = [];
  for (const id of [...typed, ...other]) {
    if (typeof id !== 'string' || !RELIC_ID.test(id) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

export function readRelicCache(store) {
  try {
    const raw = store?.getItem(RELIC_CACHE_KEY);
    return relicsFromProfile({ relics: raw ? JSON.parse(raw) : [] });
  } catch {
    return [];
  }
}

export function writeRelicCache(store, relics) {
  if (!store) return;
  try {
    store.setItem(RELIC_CACHE_KEY, JSON.stringify(relicsFromProfile({ relics })));
  } catch {
    /* Storage may be blocked. This visit still uses the list in memory. */
  }
}

/**
 * What the paddock shows.
 * `source` is `account` (this visit), `visit` (the cache), or `unknown`.
 * `owned` is true, false, or null when this browser has not seen an account.
 */
export function relicView(owned, source) {
  const have = new Set(owned ?? []);
  const ids = [...KNOWN_IDS];
  for (const id of have) if (!ids.includes(id)) ids.push(id);
  const caption = source === 'account'
    ? (have.size ? 'Relics on this hub account' : 'No Relics on this hub account')
    : source === 'visit'
      ? 'Relics from your last hub visit'
      : 'Sign in through the hub to see which Relics you own';
  return {
    source,
    caption,
    items: ids.map((id) => ({
      id,
      name: relicName(id),
      owned: source === 'unknown' ? null : have.has(id),
    })),
  };
}

/** One line for the garage. The paddock chips are the full list. */
export function relicSummary(view) {
  const names = view.items.filter((item) => item.owned === true).map((item) => item.name);
  if (view.source === 'unknown' || names.length === 0) return view.caption;
  return `${view.caption}: ${names.join(', ')}`;
}

/** Paint the paddock list. Names go in as text, not HTML. */
export function paintRelics(caption, list, view) {
  if (!caption || !list || !view) return;
  if (caption.textContent !== view.caption) caption.textContent = view.caption;
  const signature = `${view.source}|${view.items.map((item) => `${item.id}:${item.owned}`).join('|')}`;
  if (list.dataset.signature === signature) return;
  list.dataset.signature = signature;
  list.replaceChildren(...view.items.map((item) => {
    const li = document.createElement('li');
    li.dataset.relic = item.id;
    li.dataset.owned = item.owned === null ? 'unknown' : item.owned ? 'true' : 'false';
    li.textContent = item.name;
    return li;
  }));
}

function signedIn(link) {
  return link?.relicsFromAccount === true && (link.status === 'connected' || link.status === 'guest');
}

export function createRelicBook(storage) {
  let fromAccount = false;
  let account = [];
  let cache = readRelicCache(storage);
  const listeners = new Set();
  const emit = () => {
    for (const fn of listeners) {
      try { fn(); } catch (err) { console.warn('[hub] relic listener failed', err); }
    }
  };
  return {
    owned: () => (fromAccount ? account : cache),
    source: () => (fromAccount ? 'account' : cache.length ? 'visit' : 'unknown'),
    view() { return relicView(this.owned(), this.source()); },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /**
     * Apply a hub visit. Ignored until the visit has settled, so the moment
     * before `init` returns does not wipe the cache. A settled account replaces
     * the cache, including when that account owns none. A settled miss keeps
     * the cache. With no storage, the list from the visit stays in memory.
     */
    follow(link) {
      if (!link || link.settled === false || link.status === 'connecting') return;
      if (signedIn(link)) {
        fromAccount = true;
        account = relicsFromProfile({ relics: link.relics });
        cache = account;
        writeRelicCache(storage, account);
      } else {
        fromAccount = false;
        if (storage) cache = readRelicCache(storage);
      }
      emit();
    },
  };
}

export const pageRelics = createRelicBook(browserStore());
