/**
 * Hub identity for Sproto Racer. The game id, the play slug and `#from=` are the same string,
 * as in the other Sproto games. This build has no Relic and reports no events: it uses the
 * session, the cloud save and the signed-in name.
 *
 * hub-sdk 0.10.0 does not list `sproto-racer` yet. `src/hub/link.js` still asks for this id, and
 * redeems a portal ticket once a re-vendored SDK includes it.
 */
export const HUB_GAME_ID = 'sproto-racer';

/** Device progress key. An account's copy is `${RECORD_KEY}@<playerId>`. */
export const RECORD_KEY = 'sproto.racer.progress';

/** Browser ghosts written before the hub store. Merged into the device copy only. */
export const LEGACY_GHOST = /^sproto\.([a-z0-9][a-z0-9-]{0,31})\.ghost\.v1$/;
