# Online netcode: input relay with rollback

How Sproto Racer's online races work, what is built, and what it costs. The numbers were measured on 26 November 2026 with `scripts/bench/netcode-bench.mjs` (Apple M5 Pro, Node 22, simulated network).

## The idea in plain words

Every player's game runs the whole race itself. Players only send each other what they pressed. The server runs the race too, decides which input counted on which tick, and tells everyone. Because the simulation is deterministic, the same inputs give exactly the same race on every machine.

Inputs take time to travel, so each game guesses: it assumes every other player keeps doing what they were last doing. When the server's word arrives and the guess was wrong, the game rewinds to the last moment it was sure about, replays those few ticks with the right inputs, and carries on. That rewind-and-replay is the rollback. It happens inside one frame and costs a fraction of a millisecond.

The server is the referee: its simulation is the result. Twice a second it sends a fingerprint (hash) of its state; a client whose fingerprint differs asks for the full state and is put right.

## What is built

| File | What it is |
| --- | --- |
| `src/net/match-host.js` | The server side. Owns the authoritative `createSimWorld`, seats players, fills empty seats with AI, takes inputs, steps the race, relays the inputs it used. Plain JS, driven by `tick()`. No timers, DOM, `Math.random` or Nakama calls, so it can be bundled for Goja. |
| `src/net/rollback-client.js` | The player side. Predicts, rolls back, checks hashes, recovers from keyframes, sends inputs. |
| `src/net/clock-sync.js` | Works out which tick the server is on and how far ahead to run. |
| `src/net/wire.js` | Opcodes and binary message formats. |
| `src/net/keyframe.js` | Binary encoding of the full race state, and chunking. |
| `src/net/restore.js` | Exact snapshot restore (works around two snapshot-restore defects, see the end). |
| `src/net/sim-net.js` | A simulated network and an in-process match, for tests and for building the UI without a server. |
| `src/race-runner.js`, `src/net/online-runner.js` | One interface for the game loop, with an offline and an online implementation. |
| `src/race-results.js` | The final results in one shape for both. |

Nothing is wired into `src/main.js` or the UI, and there is no Nakama match handler yet.

## Message flow

```
client                               host
  | -- HELLO {version, car, driver} --> |   seat request
  | <-- WELCOME {phase, you, room} ---- |
  | <-- LOBBY {players} --------------- |   whenever the roster changes
  | -- PING / <-- PONG ---------------- |   6 quick ones, then 1 per second, all match long
  | -- READY -------------------------> |
  |          (all ready)                |   builds the race: humans first, AI in the rest
  | <-- START {startTick, seed, seats}  |   startTick is ~2 s ahead, the same for everyone
  |                                     |
  | -- INPUT (my frames) every 2 ticks> |   sent a few ticks before the host needs them
  | <-- INPUTS (what the host used) --- |   every 2 ticks, all human seats, plus the hash
  | <-- SEAT {seat, kind, tick} ------- |   a seat changes driver (leave, rejoin, late join)
  | -- KEYFRAME_REQ ------------------> |   on hash mismatch or when far behind
  | <-- KEYFRAME (chunks) ------------- |   full state; also sent unasked on (re)join
  | <-- RESULT {tick, hash, standings}  |
```

Everything travels on the one reliable, ordered WebSocket. Nothing is lost or reordered, only late, and the design leans on that: the client can treat the relayed inputs as a gap-free stream.

## Tick alignment

The host counts ticks from the moment the match is created (`serverTick`, one per `tick()` call, 60 a second). `START` names the `serverTick` at which race tick 0 runs. From then on race tick = `serverTick - startTick`. The three-second countdown is part of the simulation (ticks 0 to 179).

The client estimates the server's tick from ping/pong round trips, anchored on the fastest recent round trip, and runs ahead of it by the **input lead**: the one-way trip in ticks, plus a jitter allowance, plus two ticks of safety, plus one because inputs go out every second tick. With every relayed batch the host reports how early each seat's inputs actually arrived, and the client raises its lead when that margin goes below one tick and lowers it slowly when it stays above four. A stall (inputs far too late) is ignored for this purpose: no lead can cover it.

The local tick clock never jumps for small errors. It runs up to 4% fast or slow until it lines up. Only a gap of more than ten ticks is closed directly, by simulating up to twelve ticks per frame.

Measured leads: 5 ticks at 20 ms one-way latency, 8 at 60 ms, 13 at 120 ms, 23 at 250 ms. The lead is not input delay: the player's own kart responds on the next tick. It is how far ahead of the server the client simulates, so a longer lead means a deeper prediction of everyone else.

## What the host sends, and when

Each `tick()` the host, for every human seat, takes the input for that tick from that seat's queue:

- If the input for this tick is there, it is used as sent.
- If not, the last input is repeated without its button presses, for up to 30 ticks (0.5 s), then the seat coasts.
- A frame that arrives after its tick is too late to steer with, but its button presses are kept and delivered on the next ticks, at most one press per button per tick. A press is never dropped and never applied twice. Frames more than two seconds late are discarded.

Then it steps the world and adds what it used to a batch. **Every 2 ticks** the batch is broadcast. Two was chosen by measurement (table below): it halves the message count, and the fixed per-message envelope is most of the bytes, at the price of at most one tick (16.7 ms) of extra delay on half the remote inputs. Relaying every tick costs 13.6 KB/s instead of 8.8 for 12 players; every third tick would cost 7.1 but makes each correction up to 33 ms staler.

In a batch each seat's input is written in full (8 bytes) only when it differs from that seat's previous tick; otherwise it costs one bit. Each seat also carries one byte: how early its inputs arrived.

Every 30 ticks the batch carries the host's state hash for the tick it has just reached (4 + 8 bytes riding in a message that was going out anyway).

## The rollback loop

The client tracks two numbers: `present` (ticks it has simulated; what is on screen) and `frontier` (the host's inputs are known for every tick below it). Each frame:

1. **Take in the stream.** Each relayed input is compared with what the client used for that seat on that tick. The earliest tick that differs is the rollback point.
2. **Roll back if needed.** Restore the newest saved state at or before the rollback point and re-simulate to `present`: confirmed inputs below the frontier, then the player's own recorded inputs and each other human's last known input, held, above it. If every prediction was right, nothing is re-simulated.
3. **Check hashes** for ticks that are now final.
4. **Step forward** as many new ticks as the clock asks for (normally one), sampling the local controls once per tick.
5. **Send** the new input frames, with the two previous ones repeated.

Saved states are `captureSnapshot` checkpoints, taken every 4 new ticks and at the frontier during a replay. The newest one at or below the frontier is the confirmed state.

**Bounds.** The present may run at most 120 ticks (2 s) past the frontier. If the server goes quiet for longer, the client holds there (`stalled`) rather than predict further, and resumes when the stream does: late is not lost, so no resync is needed. In the other direction, a client that stopped simulating (a hidden tab) fast-forwards through the inputs it missed at up to 12 ticks per frame; if it is more than 600 ticks (10 s) behind, or out of input history, it asks for a keyframe instead. This replaces "pause when the tab is hidden", which cannot work online.

**Events.** A tick can be simulated several times, so events are filtered:

- An event is announced the first time it is predicted. When its tick is replayed, the same event (same kind, same seat, same detail) is recognised and not announced again, even if it moved by a tick.
- An event that only appears after a rollback is announced then, marked `late`.
- An event that was announced and then did not happen is followed by a `cancel`.
- `finish` is only announced when its tick is final.

**Smoothing.** After a rollback each kart's old and new positions are compared and the difference becomes a decaying offset (`correction(seat)`, from the existing `createPredictionSmoother`), so a corrected kart glides to its place over about a tenth of a second instead of snapping. Large corrections and rescues snap.

## Seats changing hands

- **Leave.** `host.leave(player)` hands the seat to the AI from the tick the host runs next and broadcasts `SEAT {seat, AI, tick}`. Every client applies the change at that same tick (rolling back if it had predicted past it). The seat stays reserved for the player.
- **Rejoin.** The player says `HELLO` again and gets `WELCOME` plus a keyframe. The AI keeps driving until the player's first input arrives; on that tick the host announces `SEAT {seat, human, tick}`.
- **Late join.** The same, taking a free AI seat (switchable with `allowLateJoin`). The car stays the one the seat started with.

## Keyframes

A keyframe is the complete `captureSnapshot` state in a compact binary form: strings and object layouts are written once and referenced, integers are variable-length, floats are stored exactly (32-bit when that loses nothing, 64-bit otherwise). It restores bit-identically, including `Infinity`, which JSON turns into `null`. The codec walks whatever the snapshot contains, so new simulation fields need no change here.

Keyframes are split into chunks of at most 4,096 bytes so every message stays under Nakama's 8,192-byte limit after base64 and the envelope (5.6 KB per chunk on the socket). Sizes are in the tables below. A keyframe carries the host's hash for that tick; the client verifies it after applying, and if it does not match it puts back the state it had and asks again.

Nothing the client waits for can be lost for good. While it is waiting for a keyframe it asks again every 1.5 s, and a hello that gets no answer is sent again on the same timer. On the host a keyframe request that comes too soon after the last one is not dropped: it is answered as soon as the limit allows.

## Input validation on the host

- The sender must own the seat named in the packet.
- The packet must be exactly `2 + 12 × count` bytes with 1 to 4 frames.
- Each frame's tick must be no more than 60 ticks ahead and no more than 120 behind the tick the host is about to run.
- Rate limit per player: 72 input messages a second with a burst of 240 (a stalled connection delivers everything it held at once, so the burst covers four seconds of honest input), and 5 control messages a second with a burst of 10.
- At most one keyframe a second per player and per seat, however it is asked for (a request, a repeated `HELLO`, or leaving and rejoining). One that has to wait is sent when the second is up.
- `host.receive()` cannot throw. Every field of every client message is type-checked before use, anything malformed is dropped and counted in `host.stats`, and a catch-all guards the rest, because an uncaught error in the server's match loop would end the match for everyone. A fuzz test feeds it thousands of hostile messages.
- `HELLO` must carry the current network and simulation versions and a valid car and driver (`validateRacerChoice`; the caller can supply the player's Relics through `validateHello`).

## Protocol

Opcodes 1 to 13 are unchanged from `src/net/protocol.js`. JSON for rare messages, binary for frequent ones.

| Op | Name | Direction | Payload |
| --- | --- | --- | --- |
| 1 | HELLO | client to host | JSON `{v, sim, car, driver, name}` |
| 2 | WELCOME | host to client | JSON `{v, sim, phase, serverTick, you, room, race, players}` |
| 3 | READY | client to host | JSON `{ready}` |
| 4 | START | host to client | JSON `{serverTick, you, race: {courseId, laps, seed, startTick, seats, ...}}` |
| 5 | INPUT | client to host | `[u8 seat][u8 count][count × 12-byte intent frame]`, newest first (the existing frame from `src/sim/intent.js`) |
| 7 | RESULT | host to clients | JSON `{tick, hash, standings: [{place, seat, car, driver, finishUs, human, name}]}` |
| 9 | LOBBY | host to clients | JSON `{phase, players}` |
| 10 | PING | client to host | `[u32 token]` |
| 11 | PONG | host to client | `[u32 token][u32 serverTick]` |
| 14 | INPUTS | host to clients | `[u8 flags][u32 startTick][u8 tickCount][u16 seatMask]`, then per seat `[i8 margin][change bits][8 bytes per changed tick]`, then if `flags & 1` `[u32 hashTick][8-byte hash]` |
| 15 | HASH | host to clients | `[u32 tick][8-byte hash]` (standalone form; the host normally uses the INPUTS trailer) |
| 16 | KEYFRAME_REQ | client to host | `[u8 reason][u32 tick]` |
| 17 | KEYFRAME | host to client | chunk `[u16 id][u8 index][u8 count][bytes]`; whole payload `[u8 reason][u32 tick][8-byte hash][u16 seatMask][8 bytes per seat][snapshot]` |
| 18 | SEAT | host to clients | `[u8 seat][u8 kind][u32 tick]` |
| 19 | ERROR | host to client | JSON `{error}` |

## One interface for both modes

`src/race-runner.js` documents the `RaceRunner` interface and provides `createLocalRaceRunner` (one human seat, AI rivals, no network: a thin shell over `createSimWorld`). `src/net/online-runner.js` provides `createOnlineRaceRunner` (the rollback client behind the same interface). A game loop calls `runner.advance(dt, sampleControls)`, draws `runner.world`, and reads `runner.hud()` and `runner.drainEvents()`.

A test confirms the claim "one engine": an online race with one human and the same race run offline with the same seats and inputs end in the same state hash. `results()` has the same shape in both (`src/race-results.js`), and that is tested too.

Checked against what `src/main.js` reads from `session.state` today. The interface does not provide, and the single-player move will have to add or keep:

- Time Trial ghosts: recording, the stored best lap, `session.ghost()` and `ghostSetup`.
- Records: `session.best`, `reloadBest`, saving a record at the finish.
- Test Drive tools: `session.select(item)`, the hazards switch, restarting from a chosen sector at speed.
- Formatted split text (`hud().split` gives the numbers).
- Pausing.

Two things the UI wiring must know:

- Use `runner.localActor`. `world.state.player` is always seat 0, which online is somebody else for most players.
- The gameplay hooks the renderer listens to (`onSpawn`, `onRemove`, `onVisualCue`, and the Sky Lane ones) fire again when ticks are replayed. Ignore them while `runner.resimulating` is true and take cues from `runner.drainEvents()`.

## Measurements

Simulated matches, 45 s of racing each, every seat human unless stated (the worst case for bandwidth and rollback). Half the scripted drivers steer like a keyboard, half like an analog stick. Latency is one way; jitter is a quarter of it. "KB/s" counts what is on the socket: the binary payload, base64, Nakama's JSON envelope and the WebSocket frame header. Milliseconds are V8 on an Apple M5 Pro; the audit's working assumption is that a phone is five to six times slower. Reproduce with `node --import ./tests/register-sdk-hook.js scripts/bench/netcode-bench.mjs`.

### Per player, every seat human, 45 s of racing, relay batch 2 ticks, inputs sent every 2 ticks

| Seats | One-way latency | Down KB/s (payload only) | Up KB/s (payload only) | Msgs/s down / up | Input lead (ticks) | Re-simulated ticks per frame: mean / worst | Cost per frame: mean / worst (ms) | Hash mismatches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 6 | 20 ms | 6.42 (2.01) | 5.99 (1.50) | 31.0 / 31.0 | 5.0 | 4.2 / 11 | 0.18 / 2.55 | 0 |
| 6 | 60 ms | 6.36 (1.97) | 5.98 (1.50) | 31.0 / 31.0 | 8.2 | 6.9 / 17 | 0.18 / 2.40 | 0 |
| 6 | 120 ms | 6.39 (1.99) | 5.98 (1.50) | 31.0 / 31.0 | 13.0 | 10.9 / 27 | 0.23 / 1.49 | 0 |
| 6 | 250 ms | 6.45 (2.04) | 5.97 (1.50) | 31.0 / 30.9 | 23.3 | 16.9 / 47 | 0.35 / 3.63 | 0 |
| 12 | 20 ms | 8.75 (3.76) | 5.99 (1.50) | 31.0 / 31.0 | 5.0 | 4.2 / 11 | 0.25 / 2.70 | 0 |
| 12 | 60 ms | 8.76 (3.77) | 5.98 (1.50) | 31.0 / 31.0 | 8.2 | 7.1 / 17 | 0.50 / 6.66 | 0 |
| 12 | 120 ms | 8.70 (3.72) | 5.98 (1.50) | 31.0 / 31.0 | 13.3 | 11.3 / 27 | 0.59 / 6.83 | 0 |
| 12 | 250 ms | 8.75 (3.76) | 5.97 (1.50) | 31.0 / 30.9 | 22.7 | 17.0 / 47 | 0.88 / 9.53 | 0 |

### Events revised by rollback (share of all events delivered)

| Seats | Latency | All karts: first seen after a rollback | All karts: predicted, then undone | Own kart: first seen after a rollback | Own kart: predicted, then undone |
| --- | --- | --- | --- | --- | --- |
| 6 | 20 ms | 34.6% | 3.4% | 5.6% | 1.7% |
| 6 | 60 ms | 41.3% | 3.3% | 1.6% | 0.8% |
| 6 | 120 ms | 34.7% | 21.3% | 8.7% | 13.8% |
| 6 | 250 ms | 32.2% | 33.6% | 10.7% | 27.9% |
| 12 | 20 ms | 36.7% | 3.4% | 2.7% | 1.7% |
| 12 | 60 ms | 31.5% | 16.0% | 7.3% | 12.8% |
| 12 | 120 ms | 33.5% | 20.5% | 12.3% | 20.2% |
| 12 | 250 ms | 34.5% | 39.7% | 35.4% | 52.0% |

### Keyframe size (binary, before base64)

| Seats | Smallest | Mean | Largest | Messages at 4,096 B per chunk | Largest on the socket |
| --- | --- | --- | --- | --- | --- |
| 6 | 4329 B | 5290 B | 6933 B | 2 | 9.58 KB |
| 12 | 6906 B | 8307 B | 10650 B | 3 | 14.73 KB |

### Relay batch size and input send rate (12 seats, 60 ms)

| Relay batch | Client sends every | Down KB/s | Up KB/s | Msgs/s down / up | Re-simulated ticks per frame (mean) |
| --- | --- | --- | --- | --- | --- |
| 1 tick | 1 tick | 13.63 | 10.86 | 61.0 / 60.9 | 10.3 |
| 2 ticks | 1 tick | 8.75 | 10.86 | 31.0 / 60.9 | 6.5 |
| 2 ticks | 2 ticks | 8.76 | 5.98 | 31.0 / 31.0 | 7.1 |
| 3 ticks | 2 ticks | 7.07 | 5.98 | 21.0 / 31.0 | 5.1 |
| 3 ticks | 3 ticks | 7.06 | 4.04 | 21.0 / 21.0 | 5.4 |

### Typical room: 6 seats, 3 humans and 3 AI

| Latency | Down KB/s | Up KB/s | Re-simulated ticks per frame: mean / worst | Cost per frame: mean / worst (ms) |
| --- | --- | --- | --- | --- |
| 20 ms | 5.39 | 5.99 | 3.6 / 11 | 0.13 / 1.30 |
| 60 ms | 5.49 | 5.98 | 6.3 / 17 | 0.21 / 1.35 |
| 120 ms | 5.55 | 5.98 | 10.0 / 27 | 0.37 / 1.96 |
| 250 ms | 5.49 | 5.97 | 14.8 / 48 | 0.47 / 4.37 |

What the numbers say:

- **Download is 8.8 KB/s per player with 12 humans and 6.4 KB/s with 6**, about 31 messages a second. The audit estimated 10 to 15 KB/s for 12. Latency does not change it.
- **The envelope dominates, not the data.** Of the 8.8 KB/s, 3.8 KB/s is payload; the rest is base64 (a third more) and about 115 bytes of JSON envelope on each of 31 messages (3.6 KB/s). With 6 humans the payload is under a third of the total. Inside the payload, analog steering dominates: a stick changes value nearly every tick, so that seat costs 8 bytes a tick, while a keyboard seat mostly costs one bit.
- **Upload is 6.0 KB/s** at 31 messages a second, the same in every room: two new input frames plus two repeated ones (50 bytes) per message, of which three quarters is envelope and base64.
- **Rollback cost grows with latency, not with player count per se**: about 4 re-simulated ticks per frame at 20 ms, 7 at 60 ms, 11 at 120 ms, 17 at 250 ms. In milliseconds per frame that is 0.2 to 0.9 on this machine for 12 karts, with single worst frames of 2.7 to 9.5 ms. On a device five times slower, 12 karts at 250 ms would average about 4 ms a frame and occasionally miss a frame; 6 karts at 120 ms would average about 1 ms.
- A stall is paid back in one frame: after the stream stops for S ms the next rollback replays about S/16.7 extra ticks, capped at 120 (about 20 ms for 12 karts here).
- **Zero hash mismatches** in every run.

Events and rollback: most revised events are `bump` (it fires on every tick of a contact, and whether two karts touch is exactly what a wrong guess about a rival changes). In a 12-human pack at 60 ms, 0 of 144 of a player's own `boost` events and 0 of 34 `pickup` events arrived late, and 2 boosts were cancelled; at 250 ms, 3 of 40 pickups arrived late and 8 were cancelled. Other karts' boosts always arrive late, because a rival's button press cannot be predicted. The UI should rate-limit bump cues and treat a `cancel` as "stop that cue".

Batch size: relaying every tick costs 13.6 KB/s down and the most rollback work, because a rollback then runs on every frame. Every 2 ticks is the default. Every 3 ticks saves another 1.7 KB/s and some CPU, but each correction is up to 33 ms staler, so remote karts jump further when corrected; it stays available through `inputBatchTicks`.

## What the hub server needs

The match host is part of `build/racer-sim.js`, so the server side of an online race is this repo's code end to end. What is left for `metaverse-hub` is a Nakama match handler that passes calls through. It has not been written or run against a real Nakama; the outline below is what the host's interface requires.

**In the bundle** (all on the `RacerSim` global, created lazily so nothing is frozen at start-up):

- `RacerSim.createMatchHost(options)`: one per match. `options.send(playerId, opCode, data)` is required; `data` is a `Uint8Array` for the frequent binary messages and a string for the rare JSON ones. Other options: `courseId`, `seed`, `laps`, `seatCount` (6 today, up to 12), and the limits in `HOST_DEFAULTS` (`src/net/match-host.js`).
- `RacerSim.netInfo()`: `{ netVersion, simVersion, tickRate: 60, op }`, the versions a client must match and the op codes.

**The handler, call for call:**

| Nakama hook | What it does |
| --- | --- |
| `matchInit` | Pick the circuit and a seed (from the match parameters; the seed can be any 32-bit number, e.g. from `nk.uuidv4()`), create the host with a `send` that calls `dispatcher.broadcastMessage(opCode, payload, [presence], null, true)`, where `payload` is the string as given or, for a `Uint8Array`, its bytes as an `ArrayBuffer` (`data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)`), and return `tickRate: 60` with a label such as `{ kind: 'sproto_racer', open: true, simVersion, netVersion }` (the client's `src/net/hub-lobby.js` searches for `+label.kind:sproto_racer +label.open:T`). |
| `matchJoinAttempt` | Accept while the room has a free human seat or the user already owns a seat (a rejoin). |
| `matchJoin` | `host.join(userId, { name })` for each presence. Keep a map from user id to presence for `send`. |
| `matchLeave` | `host.leave(userId)`. The seat goes to the AI and comes back if the player rejoins. |
| `matchLoop` | For each message: `host.receive(message.sender.userId, message.opCode, new Uint8Array(message.data))`. The host decodes JSON messages from bytes itself. Then `host.tick()` exactly once. When `host.phase` is `'finished'`, write results from `host.results` and end the match after a short grace period. Update the label to `open: false` when `host.phase` leaves `'lobby'` unless late joins are wanted. |
| `matchTerminate` | Nothing to save; the host holds no resources. |

Things the handler must respect:

- **One `host.tick()` per loop, no catch-up.** The clients pace themselves from the tick numbers the host sends. If the server falls behind, the race slows for everyone rather than skipping.
- **`host.receive` never throws**, and drops and counts malformed input (`host.stats`). The handler does not need to validate payloads, only pass them on.
- **Message size.** The largest message is a keyframe chunk: 4,096 bytes, 5.6 KB on the socket after base64 and the envelope, under the 8,192-byte limit. Nothing needs raising.
- **Car and driver ownership.** By default the host accepts any car and driver in the roster. To enforce unlocks, pass `validateHello(playerId, { car, driver })` returning `{ ok: true, value: { car, driver } }` or `{ ok: false, error }`.
- **Versions.** A client whose `simVersion` differs from the bundle's is refused at hello with `sim_version_mismatch`. The game client and the server bundle therefore have to be deployed together; the bundle's version changes whenever anything under `src/sim` or the match host changes.

**Measured in Goja** (the engine Nakama runs match handlers in), on an Apple M5 Pro, by replaying a recorded match: `scripts/bench/host-transcript.mjs` records every join, leave, message and tick of a simulated race (three connection qualities, one player dropping for three seconds and rejoining), and `gojabench -host` feeds the same calls to the bundled host.

| Room | Ticks | Host tick in Goja: mean / p95 / p99 / max | All message handling |
| --- | --- | --- | --- |
| 6 karts, 3 humans, Crestline Ridge | 24,031 | 1.36 / 1.80 / 2.39 / 6.1 ms | 1.3 s in total over the match |
HOST12ROW

The budget is 16.7 ms a tick. In both engines the replay ends in the same race, with the same count and checksum of every byte sent (36,609 messages, 1.67 MB for the 6-kart match), so a browser client and the Goja server agree. `tests/server-bundle-host.test.js` repeats the Node half of this in `npm test`.

## Not covered yet

- No Nakama match handler, no UI, nothing in `src/main.js`. The match host is in `build/racer-sim.js` and runs in Goja (next section); the handler that calls it lives in the `metaverse-hub` repo and is not written.
- Not measured on a real network or a real server. Bandwidth figures count the JSON envelope, base64 and the WebSocket frame header; they do not count TCP/IP headers or TLS framing.
- Rendering during rollback: `applySnapshot` removes and re-creates every projectile through the gameplay hooks, so a rollback would rebuild projectile meshes each time. The UI wiring needs a cheaper path (reuse meshes by object id).
- Remote karts are predicted by holding their last input. With an analog stick that is wrong on most ticks (hence a rollback on nearly every frame); it is cheap and correct, but smarter prediction would cut visible corrections at high latency.
- A player whose connection stays up but who stops sending input is not replaced by the AI; their kart coasts. Only a leave hands the seat over.
- A late joiner drives the car the AI seat already had.
- The host does not verify inputs for plausibility beyond range and rate, and does not write a replay log (`createLogRecorder` could be fed from the host's `onTick`).
- Reconnection is only as good as the transport's `onRejoin`; nothing here retries a dead socket.

## Defects found in existing code

Worked around in new files; nothing under `src/sim` was edited. Both were later fixed in the simulation itself (`createKart` lists the take-off fields; `applyState` leaves the kart list empty before the first racing tick), so `restoreSnapshot` is now a second line of defence.

1. **`applySnapshot` leaves stale kart fields.** The driving code adds `airFloorY`, `takeoffPitch` and `takeoffRoll` to a kart the first time it leaves the ground. Restoring a snapshot from before that leaves the old values in place, so a rolled-back world drifted from the host within seconds of the start. `restoreSnapshot` blanks any kart or boost field the snapshot lacks.
2. **The gameplay core's private list of karts in play** is empty in a fresh world until the first racing tick, but `applyState` fills it. The AI reads it when picking a lane, so a rollback during the countdown changed the AI's first move. `restoreSnapshot` resets the gameplay core when the snapshot is from before the first racing tick.

Of the three defects the audit listed, none is on this code's path: the wire snapshot (`rv` key) and JSON state (`Infinity`) are not used, and the host has its own input queue rather than `input-buffer.js`.
