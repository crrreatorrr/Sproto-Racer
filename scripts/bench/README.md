# Benchmarks

The scripts behind the numbers in `docs/performance-audit.md`. Run them before and after a change that could affect speed, and quote both results in the pull request.

None of these run in `npm test`, `npm run test:qa` or CI. They take from a few seconds to a few minutes and their results depend on the machine, so compare runs made on the same machine, close together, with little else running.

| File | Measures | Needs |
| --- | --- | --- |
| `bench-sim.mjs` | Simulation tick cost, memory per tick, snapshot sizes and rollback cost in Node | Node 22 |
| `prof.mjs` | Where the simulation tick spends its time (a CPU profile) | Node 22 |
| `gojabench/` | The same tick inside Goja, the JavaScript engine the Nakama server uses | Go 1.26 or newer |
| `sim-hashes.mjs` | Whether two checkouts simulate identical races (state hashes) | Node 22 |
| `host-transcript.mjs`, `host-replay.js` | Whether the online match host behaves the same in Goja as in Node, and its cost there | Node 22, Go |
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
go run . ../../../build/racer-sim.js
```

Needs Go, and the first run downloads Goja. A few minutes for the default set. The path to the bundle is required; pass another one to test a different build. If you changed `src/sim`, run `npm run build:server-sim` first so the bundle is current.

Flags (before the path): `-courses track02` picks circuits, `-configs 12:0,12:12` picks rooms as `seats:humans`, `-ticks` and `-warmup` set how long to time and how long to run first, `-profile cpu.pprof` writes a Goja CPU profile (read it with `go tool pprof -top cpu.pprof`), and `-dump ticks.txt` writes every tick's cost for the last room.

It prints one table row per room:

| Column | Meaning |
| --- | --- |
| `Circuit`, `Seats`, `Humans` | The circuit, total karts, and how many are driven by player input. The rest are AI |
| `Mean ms`, `p95`, `p99`, `Max` | Time for one step in milliseconds. The budget at 60 steps a second is 16.7 ms |
| `Wire encode ms` | Time to build one wire snapshot as JSON |
| `stateHash ms` | Time to compute the state hash |
| `Hash at end` | The state hash after the run. Two builds that print the same hash simulated the same race |

`sim-hashes.mjs` in this folder compares state hashes of many races between two checkouts; run it after any change that is meant to leave results untouched (its header gives the command).

## The online match host in Goja: `host-transcript.mjs` and `gojabench -host`

The server side of an online race (`src/net/match-host.js`) is part of `build/racer-sim.js`. These two check that it behaves the same in the server's engine as in Node, and time it there.

```sh
node --import ./tests/register-sdk-hook.js scripts/bench/host-transcript.mjs
cd scripts/bench/gojabench
go run . -host ../prof/host-transcript.json ../../../build/racer-sim.js
```

The first command plays a simulated online race in Node (6 karts, 3 players on connections of different quality, one of whom drops for three seconds and rejoins) and records every call a server would make into the host: joins, leaves, messages and ticks. It writes them to `scripts/bench/prof/host-transcript.json` (ignored by git, about 4 MB), replays them against the bundle and prints a `summary` line. Optional arguments: output path, karts, players, circuit. A 12-kart recording takes a few minutes.

The second command replays the same file inside Goja and prints the time per host tick and its own `summary` line. **The two summary lines must be identical**: they hold the final results, the host's counters, and a count and checksum of every byte the host sent. `host-replay.js` is the small driver both sides run.

## The game in a browser: `browser-harness.js`

See [browser-harness.md](browser-harness.md).
