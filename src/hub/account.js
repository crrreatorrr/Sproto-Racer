/**
 * The paddock and race read this. The words match Sproto Open World's title chip:
 * who is signed in, and whether the time-trial records are this browser's or the account's.
 */

const SYNC_TEXT = {
  local: '',
  syncing: 'syncing your times…',
  synced: 'times in the cloud',
  offline: 'cloud save will retry',
  error: 'cloud save failed (kept on this browser)',
};

/** @param {{ status: string, label: string, error: string, owner: string, sync: string }} hub */
export function hubChipText(hub) {
  if (hub.status === 'connecting' || (hub.owner === 'pending' && hub.status !== 'error')) return 'Signing in to the hub…';
  const account = hub.status === 'error'
    ? `Hub: ${hub.error || 'error'}`
    : hub.status === 'offline'
      ? 'Not signed in'
      : (hub.label || 'Guest');
  const where = hub.owner === 'account' ? SYNC_TEXT[hub.sync] ?? '' : 'saves on this browser';
  return where ? `${account} · ${where}` : account;
}

/** Paint one chip. Race chips (`data-hub-race`) stay hidden until a hub account is signed in. */
export function paintAccount(el, hub) {
  const text = hubChipText(hub);
  if (el.textContent !== text) el.textContent = text;
  el.dataset.hub = hub.status;
  el.dataset.save = hub.owner;
  if (el.hasAttribute?.('data-hub-race')) el.hidden = hub.status !== 'connected' && hub.status !== 'guest';
}

/** The chip for the current visit and record book. */
export function chipFrom(link, records) {
  return {
    status: link.status,
    label: link.accountLabel,
    error: link.code || '',
    owner: records.owner(),
    sync: records.sync(),
  };
}
