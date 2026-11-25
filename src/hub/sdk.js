import { createHubSdk } from '@metaverse/hub-sdk/core';
import { HUB_GAME_ID } from './config.js';
import { createReturn, hubPageUrl, nakamaUrl, pageServerKey } from './portal.js';

let sdk = null;

/**
 * The one hub SDK for this page. Hub login should call `pageHubSdk().init(HUB_GAME_ID)` here,
 * so the portal and the account share the session. Creating it does not redeem a ticket.
 */
export function pageHubSdk() {
  if (!sdk) {
    sdk = createHubSdk({
      serverUrl: nakamaUrl(),
      serverKey: pageServerKey(),
      hubUrl: hubPageUrl(),
    });
  }
  return sdk;
}

function liveApi() {
  const found = [];
  if (typeof window !== 'undefined' && window.hubSdk) found.push(window.hubSdk);
  try {
    found.push(pageHubSdk());
  } catch {
    /* A page with no hub SDK still navigates. */
  }
  for (const api of found) {
    let session = null;
    try {
      session = api.getSession?.() ?? null;
    } catch {
      session = null;
    }
    if (session && session.game === HUB_GAME_ID && session.playerId) return api;
  }
  return null;
}

/** Close this game's hub session, if one is open, and open the plaza at this ring. */
export const returnToHub = createReturn(() => ({
  api: liveApi(),
  navigate: (url) => window.location.assign(url),
  page: hubPageUrl(),
}));
