import { CARS, DRIVERS } from '../roster.js';

/**
 * Which hub Relic unlocks which car or character.
 *
 * This is the only reward table. Ken fills the rows. A row with an empty
 * `relic` or an empty `id` is a placeholder and unlocks nothing. A car or
 * character with no filled row is free: it stays selectable with no hub
 * sign-in, and a race can start in it.
 *
 * `kind` is `car` (an id from `CARS` in `src/roster.js`) or `character`
 * (an id from `DRIVERS`; the garage calls these drivers). `relic` is a hub
 * Relic id, including one this SDK build only receives as `otherRelics`.
 * Several filled rows for one id unlock it when the account owns any one of
 * those Relics.
 *
 * This game reads Relics from the signed-in hub account. It does not report
 * an event and does not grant a Relic. Do not fill a row until Ken names the
 * Relic and the car or character.
 *
 * @type {readonly { relic: string, kind: 'car' | 'character', id: string }[]}
 */
export const RELIC_UNLOCKS = [
  { relic: '', kind: 'car', id: '' },
  { relic: '', kind: 'character', id: '' },
];

/**
 * Display names for Relics the hub already ships. This is not a reward list.
 * An id the hub adds later is shown as the id until this table is updated.
 */
export const RELIC_NAMES = {
  hpos10i_core: 'HPOS10I Core',
  genesis_shard: 'Genesis Block Shard',
  cones_tip: "Cone's Tip",
  tinubu_crown: "Tinubu's Crown",
  tidebreaker_belt: 'Tidebreaker Belt',
  breakwater_coin: 'Breakwater Coin',
  marina_anchor: 'Marina Anchor',
  dragon_scale: 'Dragon Scale',
};

/** Same shape the hub SDK keeps for a Relic id it does not know yet. */
const RELIC_ID = /^[a-z0-9_]{1,48}$/;

export function relicName(id) {
  return RELIC_NAMES[id] ?? id;
}

function roster(kind) {
  if (kind === 'car') return CARS;
  if (kind === 'character') return DRIVERS;
  return [];
}

function knownId(kind, id) {
  return roster(kind).some((item) => item.id === id);
}

/** Filled rows that name a real car or character. Placeholders and typos drop out. */
export function activeUnlocks(table = RELIC_UNLOCKS) {
  if (!Array.isArray(table)) return [];
  return table.filter((row) => row
    && (row.kind === 'car' || row.kind === 'character')
    && typeof row.relic === 'string'
    && RELIC_ID.test(row.relic)
    && typeof row.id === 'string'
    && knownId(row.kind, row.id));
}

function needs(kind, id, table) {
  return activeUnlocks(table).filter((row) => row.kind === kind && row.id === id);
}

/** Free when no filled row names it. Otherwise any one of those Relics unlocks it. */
export function isUnlocked(kind, id, owned, table = RELIC_UNLOCKS) {
  const rows = needs(kind, id, table);
  if (!rows.length) return true;
  const have = new Set(owned ?? []);
  return rows.some((row) => have.has(row.relic));
}

/** Player-facing reason, or null when this car or character is free or already unlocked. */
export function lockReason(kind, id, table = RELIC_UNLOCKS) {
  const rows = needs(kind, id, table);
  if (!rows.length) return null;
  const names = [];
  for (const row of rows) {
    const name = relicName(row.relic);
    if (!names.includes(name)) names.push(name);
  }
  return `Needs ${names.join(' or ')}`;
}

/**
 * An unlocked id to race with. Prefers `preferred` when it is free or owned.
 * Otherwise the first free roster entry. Null only when every entry of that
 * kind has a filled row and none of those Relics are owned.
 */
export function playableId(kind, preferred, owned, table = RELIC_UNLOCKS) {
  const list = roster(kind);
  if (!list.length) return null;
  if (preferred && isUnlocked(kind, preferred, owned, table)) return preferred;
  const free = list.find((item) => isUnlocked(kind, item.id, owned, table));
  return free ? free.id : null;
}
