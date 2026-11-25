import { pageRecords } from './records.js';
import { startHub, visitStarting } from './link.js';

/**
 * Hub account for Sproto Racer. One module the rest of the game boots, and that feedback or a
 * return-to-hub control can call. The SDK itself is the vendored package `@metaverse/hub-sdk`
 * (`vendor/hub-sdk`); import that for a new hub feature instead of copying it.
 *
 * `bootHub()` redeems the plaza login (`#t=` or the cached `hub:sproto-racer:session`), keeps
 * the signed-in name on `link`, and points time-trial records at that account. `leaveForHub()`
 * flushes the cloud save and goes back to the plaza. This module does not draw a return control
 * and does not open the feedback window.
 */

let page = null;
let leaving = false;

export function bootHub(opts = {}) {
  if (page && !opts.force) return page;
  if (opts.force) leaving = false;
  const records = opts.records ?? pageRecords;
  const starting = opts.starting ?? visitStarting();
  if (starting) records.hold();
  const visit = startHub({ ...opts, starting });
  const ready = visit.ready.then(async (link) => {
    await records.follow(link);
    return link;
  });
  const handle = {
    link: visit.link,
    records,
    ready,
    saveBeforeLeaving() {
      if (leaving) return false;
      leaving = true;
      return records.flushKeepalive();
    },
    leaveForHub() {
      handle.saveBeforeLeaving();
      visit.link.exitToHub();
    },
  };
  if (typeof window !== 'undefined' && opts.bindPage !== false) {
    window.addEventListener('pagehide', () => handle.saveBeforeLeaving());
    window.addEventListener('pageshow', () => {
      leaving = false;
      records.refresh();
    });
    window.addEventListener('storage', (event) => {
      if (records.watches(event.key)) records.refresh();
    });
  }
  page = handle;
  return handle;
}
