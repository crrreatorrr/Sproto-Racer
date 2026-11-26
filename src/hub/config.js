/**
 * Hub identity for Sproto Racer. The game id, the play slug and `#from=` are the same string,
 * as in the other Sproto games. A signed-in visit reads that account's Relics from `init`
 * (`relics`, and `otherRelics` for an id this SDK does not type yet). Which Relic unlocks
 * which car or character is `src/hub/unlocks.js`. This build does not report an event and
 * does not grant a Relic.
 *
 * hub-sdk 0.11.0 lists `sproto-racer`. `src/hub/link.js` redeems a portal ticket for this id.
 */
export const HUB_GAME_ID = 'sproto-racer';

/** Device progress key. An account's copy is `${RECORD_KEY}@<playerId>`. */
export const RECORD_KEY = 'sproto.racer.progress';

/**
 * Circuit layout generation for Time Trial records. Bump it when a circuit's racing line changes
 * (layout 2: Sky Lanes). A record or ghost from another layout is dropped everywhere it is read:
 * this browser, an account's copy and the cloud save.
 */
export const TRIAL_LAYOUT = 2;

/** Browser ghosts written before the hub store. Merged into the device copy only. */
export const LEGACY_GHOST = /^sproto\.([a-z0-9][a-z0-9-]{0,31})\.ghost\.v1$/;
