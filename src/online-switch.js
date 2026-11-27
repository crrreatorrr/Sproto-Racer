// The development switch for the online test race.
//
//   ?online=loopback            an online race against a server and players that run in this page
//   &latency=120                one-way delay of every connection, in milliseconds (default 60)
//   &jitter=30                  extra random delay per message (default a quarter of the latency)
//   &stall=0.002                chance per message of a 200-600 ms hold-up (default 0)
//   &seats=12                   karts on the grid, 2 to 12 (default 6)
//   &humans=6                   seats driven by players, this one included (default 3); the rest are AI
//   &laps=3
//   &reuse=0                    measurement only: drop and rebuild item meshes on every
//                               correction, as the game did before meshes were kept
//
// There is no real server yet, so this only exists in the development server: `dev` is
// Vite's `import.meta.env.DEV`, and a production build never turns the switch on.

const number = (params, key, fallback, low, high) => {
  const raw = params.get(key);
  const value = raw == null || raw === '' ? NaN : Number(raw);
  return Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback;
};

export function onlineSwitch(search, dev) {
  if (!dev) return null;
  const params = new URLSearchParams(search);
  if (params.get('online') !== 'loopback') return null;
  const latencyMs = number(params, 'latency', 60, 0, 1000);
  const seats = Math.round(number(params, 'seats', 6, 2, 12));
  return {
    kind: 'loopback',
    latencyMs,
    jitterMs: number(params, 'jitter', latencyMs / 4, 0, 1000),
    stallChance: number(params, 'stall', 0, 0, 0.05),
    seats,
    humans: Math.round(number(params, 'humans', Math.min(3, seats), 1, seats)),
    laps: Math.round(number(params, 'laps', 3, 1, 9)),
    reuseItemMeshes: params.get('reuse') !== '0',
  };
}
