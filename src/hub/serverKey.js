/**
 * Nakama's client server key. Ticket redeem sends it as Basic auth. It is not the runtime HTTP
 * key and not a secret. A production build takes VITE_NAKAMA_SERVER_KEY. `vite dev` and a page
 * opened on loopback fall back to Nakama's stock key, the same rule as the other Sproto games.
 */
export const LOCAL_SERVER_KEY = 'defaultkey';

const LOOPBACK_HOST = /^(localhost|[\w-]+\.localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1)$/i;

export function nakamaServerKey(opts) {
  if (opts.envKey) return opts.envKey;
  if (opts.dev) return LOCAL_SERVER_KEY;
  return LOOPBACK_HOST.test(opts.hostname ?? '') ? LOCAL_SERVER_KEY : '';
}

/** The key for this page. */
export function pageServerKey() {
  const env = import.meta.env ?? {};
  return nakamaServerKey({
    envKey: env.VITE_NAKAMA_SERVER_KEY,
    dev: Boolean(env.DEV),
    hostname: typeof location !== 'undefined' ? location.hostname : '',
  });
}
