# Benchmarks

The scripts behind the numbers in `docs/performance-audit.md`. Run them before and after a change that could affect speed, and quote both results in the pull request.

None of these run in `npm test`, `npm run test:qa` or CI. They take from a few seconds to a few minutes and their results depend on the machine, so compare runs made on the same machine, close together, with little else running.

| File | Measures | Needs |
| --- | --- | --- |
| `bench-sim.mjs` | Simulation tick cost, memory per tick, snapshot sizes and rollback cost in Node | Node 22 |
| `prof.mjs` | Where the simulation tick spends its time (a CPU profile) | Node 22 |
| `gojabench/` | The same tick inside Goja, the JavaScript engine the Nakama server uses | Go 1.26 or newer |
| `browser-harness.js` | Frame times, draw calls, triangles and shader programs in the real game | The dev server |

## Simulation in Node: `bench-sim.mjs`

```sh
node --expose-gc --max-semi-space-size=256 scripts/bench/bench-sim.mjs
```

About 15 seconds. It races AI karts for up to 150 seconds of game time on each circuit with 6 and 12 karts and prints one row per run:

| Column | Meaning |
| --- | --- |
| `course`, `seats` | Circuit and number of karts |
| `ticks` | Simulation steps timed (60 per second of game time) |
| `tick mean ms`, `p95`, `p99`, `max` | Time for one step: the average, the value 95% and 99% of steps stay under, and the slowest |
| `alloc B/tick (approx)` | Memory allocated per step, from heap growth over the run. Rough: a garbage collection during the run lowers it |
| `wire mean B`, `wire max B` | Size in bytes of the JSON snapshot sent to players (`encodeWireSnapshot`), average and largest |
| `wire deflate mean` | The same snapshot after deflate compression |
| `objs max` | Most item objects (shots, traps) in one snapshot |
| `encode+stringify ms` | Time to build one wire snapshot and turn it into JSON |
| `full snap B` | Size of the full snapshot used for rollback (`captureSnapshot`) |
| `capture ms`, `apply ms`, `hash ms` | Time to take a full snapshot, restore one, and compute the state hash |
| `flying %` | Share of steps with at least one kart in a Sky Lane |

The second table is the cost of a rollback with 12 karts: restore a snapshot, then re-run the given number of steps. The last two lines send one kart through the wire format and print what comes back.

## CPU profile: `prof.mjs`

```sh
node --cpu-prof --cpu-prof-dir=scripts/bench/prof scripts/bench/prof.mjs 12 track02
```

Arguments are the number of karts (default 12) and the circuit (default `track02`). It writes a `.cpuprofile` file into `scripts/bench/prof/` (ignored by git). Open it in Chrome DevTools: Performance panel, then "Load profile". The "Bottom-Up" view lists the functions that use the most time.

## Server engine: `gojabench/`

The server runs `build/racer-sim.js` in Goja, which is far slower than Node. This steps that file in Goja directly.

```sh
cd scripts/bench/gojabench
go run .
```

Needs Go, and the first run downloads Goja. About 3 minutes. Pass another path to test a different build: `go run . /path/to/racer-sim.js`. If you changed `src/sim`, run `npm run build:server-sim` first so the bundle is current.

Each line is one room on Crestline Ridge (`track02`) timed for 60 seconds of game time:

| Field | Meaning |
| --- | --- |
| `humans`, `seats` | Karts driven by player input, and total karts. The rest are AI |
| `tick mean`, `p95`, `p99`, `max` | Time for one step in milliseconds. The budget at 60 steps a second is 16.7 ms |
| `encode+stringify` | Time to build one wire snapshot as JSON |
| `stateHash` | Time to compute the state hash |

## The game in a browser: `browser-harness.js`

See [browser-harness.md](browser-harness.md).
