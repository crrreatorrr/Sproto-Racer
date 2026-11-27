// Whether the game starts with its sound muted.
// No DOM in here: storage and the page's query string are passed in, so it is unit-testable.

export const MUTE_KEY = 'sproto.mute';

/** ?mute=1 or ?mute=0 in the address; null when it does not say. */
export function muteFromSearch(search = '') {
  let value = null;
  try { value = new URLSearchParams(search).get('mute'); } catch { /* malformed address */ }
  return value === '1' ? true : value === '0' ? false : null;
}

/**
 * The address wins for this visit. Then a test server (`forced`, set by `npm run dev:muted`)
 * starts muted whatever was saved. Otherwise the player's last choice applies.
 */
export function startMuted(storage, search = '', forced = false) {
  const asked = muteFromSearch(search);
  if (asked !== null) return asked;
  if (forced) return true;
  try { return storage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

export function saveMuted(storage, muted) {
  try { storage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* storage may be blocked */ }
}

export const soundLabel = (muted) => (muted ? 'Sound: off' : 'Sound: on');
