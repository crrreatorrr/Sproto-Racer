/**
 * Hub identity for Sproto Racer. The game id, the play slug and `#from=` are the same string,
 * as in the other Sproto games. A signed-in visit reads that account's Relics from `init`
 * (`relics`, and `otherRelics` for an id this SDK does not type yet). Which Relic unlocks
 * which car or character is `src/hub/unlocks.js`. This build does not report an event and
 * does not grant a Relic.
 *
 * hub-sdk 0.10.0 does not list `sproto-racer` yet. `src/hub/link.js` still asks for this id, and
 * redeems a portal ticket once a re-vendored SDK includes it. Until then a visit cannot load Relics.
 */
export const HUB_GAME_ID = 'sproto-racer';

/** Device progress key. An account's copy is `${RECORD_KEY}@<playerId>`. */
export const RECORD_KEY = 'sproto.racer.progress';

/** Browser ghosts written before the hub store. Merged into the device copy only. */
export const LEGACY_GHOST = /^sproto\.([a-z0-9][a-z0-9-]{0,31})\.ghost\.v1$/;
