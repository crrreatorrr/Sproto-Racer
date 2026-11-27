# Sproto Racer: performance, rendering and online audit

Measured on 26 November 2026 against `main` at `a4cd91f`. Nothing in the game was changed to produce this document.

## Summary

1. **Online play does not exist yet.** The game has a tested network toolkit (`src/net/`) and a server copy of the simulation (`build/racer-sim.js`), but `src/main.js` never imports the toolkit, and the hub server registers no racer match. Three pieces of the toolkit do not fit together today (section 4).
2. **The server copy of the simulation is too slow for 12 karts.** In the JavaScript engine Nakama uses (Goja), one 12-kart tick costs 11 to 13 ms on this laptop. The budget at 60 ticks a second is 16.7 ms, and the production server is slower per core. Six karts cost about 2.4 ms, which fits.
3. **The snapshot format is about four times larger than its own comment says.** A 12-kart snapshot is 4.1 KB of JSON, about 5.5 KB on the wire. At 20 snapshots a second that is about 110 KB/s per player.
4. **The game freezes mid-race while the browser compiles shaders.** On a cold start I measured freezes of 616 ms and 330 ms on an M5 Pro. They happen the first time a rival blocks the camera and the first time each item is used.
5. **Steady-state rendering is cheap on a fast machine but heavy in triangles.** A frame draws 330,000 to 360,000 triangles on average and up to 580,000. Single karts are 9,000 to 86,000 triangles. There are no quality settings and no level-of-detail models.
6. **The frame loop and loading are in good shape.** The fixed 60 Hz step with interpolation is correct, a tick costs 0.15 ms in the browser, memory does not leak over a race, and the click-to-race time is about 0.1 s on this machine.

## 1. How this was measured

| What | How |
| --- | --- |
| Machine | Apple M5 Pro (18 cores), Node 22, Chromium with the Metal backend |
| Browser runs | Dev server, 1440×900 window (2304×1440 canvas at the 1.6 pixel-ratio cap), Quick Race with the full 6-kart grid on each circuit |
| Driving | An autopilot fed the player's kart the same AI controls the rivals use, so every run covered ground sections, Sky Lanes and item use |
| Frame data | 18,000 to 22,000 frames per circuit: script time per frame, time inside `renderer.render`, GPU time from WebGL timer queries, and `renderer.info` draw calls, triangles, programs, geometries and textures |
| Sim cost | `createSimWorld` stepped in Node for 150 s per configuration; the generated `build/racer-sim.js` stepped inside Goja (the engine Nakama embeds) for 60 s per configuration |
| Snapshot sizes | `encodeWireSnapshot` and `captureSnapshot` serialised every third tick over a race |

Limits of these measurements:

- The browser pane was running in the background, where the browser delivers one animation frame a second. I drove the game's frame function directly, one 60 Hz step per call. That gives accurate cost per frame, but not a real frames-per-second figure.
- I had no low-end laptop or phone. Costs on those devices are not measured. Where I give an estimate it is marked as one.
- No real network or production server was involved. Bandwidth figures are computed from measured message sizes.
- Single-player item draws use `Math.random`, so two runs of the same race differ. The first run of the session (cold shader cache) is the one quoted for freezes.

## 2. Rendering

### What a frame costs (M5 Pro, 6 karts)

| Circuit | Script per frame (mean / p99) | GPU per frame (mean / p99) | Draw calls (mean / p95 / max) | Triangles (mean / p95 / max) |
| --- | --- | --- | --- | --- |
| Test Track 01 | 0.89 / 1.5 ms | 0.62 / 0.96 ms | 222 / 423 / 517 | 327k / 457k / 537k |
| Crestline Ridge | 0.96 / 1.8 ms | 0.62 / 1.01 ms | 234 / 403 / 555 | 352k / 493k / 579k |
| Switchyard GP | 0.97 / 1.7 ms | 0.67 / 1.31 ms | 207 / 407 / 503 | 360k / 497k / 584k |

Of the script time, about 0.65 ms is `renderer.render` and about 0.15 ms is the simulation tick. Sky Lane sections cost about the same script time as ground sections, but the densest view I sampled was a Crestline Ridge Sky Lane: 416 draw calls and 526,000 triangles in one frame.

Where the triangles and draw calls go, from single-frame samples:

| Part of the scene | Draw calls | Triangles |
| --- | --- | --- |
| Circuit scenery (ground view, by circuit) | 25 to 259 | 100k to 205k |
| Circuit scenery (Sky Lane view) | 115 to 251 | 143k to 266k |
| Player kart (Manta) | 30 to 33 | 83k to 85k |
| Each rival kart in view | 3 to 35 | 3k to 64k |
| Items and effects | 2 to 24 | 0.1k to 7k |

Kart models as built in the scene:

| Car | Meshes | Triangles | Materials |
| --- | --- | --- | --- |
| Manta | 37 | 86,156 | 20 |
| Skipper | 32 | 64,920 | 19 |
| Saucer | 18 | 51,564 | 16 |
| Shopping cart | 39 | 34,486 | 18 |
| Apex | 23 | 8,934 | 14 |
| Needle | 23 | 9,470 | 14 |

The lobby and garage scene is light by comparison: 34 draw calls and 85,000 triangles, read from the `?perf=1` overlay.

Other facts: the race scene holds 918 drawable objects, 123 materials, 85 instanced meshes and 157 sprites. 58 materials are transparent. There are no shadows and no post-processing. Antialiasing is on (4 samples) and the pixel ratio is fixed at the lower of the device's and 1.6. JS heap moved between 105 and 183 MB during a race and returned to its starting level, so nothing leaks per race.

### Findings, ranked

**R1. Shader compilation freezes the game mid-race.** The scene starts a race with about 53 compiled shader programs and ends with 137 to 167. Each new program is compiled the first time its material is drawn, and the game stops while that happens. Cold-cache freezes on the M5 Pro: 616 ms at 240 s, 330 ms at 286 s, 68 ms at 40 s. With a warm cache the same events cost 30 to 170 ms. I traced the new programs to:

- the rival fade in `src/kart-visibility.js:243`, which clones every material of a rival as a transparent copy the first time that rival blocks the camera (5 to 7 programs at once, and the source of both large freezes);
- item models and effects on first use (`src/gameplay.js`, `src/item-art.js`, `src/item-fx.js`);
- flight wings on first deployment.

Fix: compile everything before the countdown. Build one of each item model, effect and faded kart material into the scene, call `renderer.compileAsync(scene, camera)` during race load, then hide them. Effort: small. Risk: low; it adds a short load step. Gain: removes the largest frame-time spikes in the game. This matters more online, where a frozen client keeps receiving state it must catch up on.

> **Note, 26 November 2026 (Batch 1 PR).** Re-measured with `scripts/bench/browser-harness.js`, one full 3-lap race per circuit, each from a fresh page load:
>
> | Circuit | Programs at GO → finish, before | Worst frame after GO, before | Programs at GO → finish, after | Worst frame after GO, after |
> | --- | --- | --- | --- | --- |
> | Test Track 01 | 54 → 83 | 359 ms | 88 → 88 | 6.2 ms |
> | Crestline Ridge | 56 → 88 | 588 ms | 88 → 88 | 5.6 ms |
> | Switchyard GP | 53 → 84 (stopped at 15,083 of about 27,000 frames) | 107 ms | 88 → 88 | 7.1 ms |
>
> The end count of 137 to 167 above was not reproduced: from a fresh load a race ended at 82 to 88. I did not find the reason for the difference; shader programs from earlier circuits staying alive across several races in one page session would explain it, but I did not test that. The freezes themselves were reproduced (107 to 588 ms). In one earlier "after" run on Test Track 01 a single 51 ms frame appeared at GO with no shader compiled in it; three later runs did not show it, and other work was running on the machine at the time.
>
> Two sources were found in addition to the three listed: cars that fetch a reflection image when first built (Hexshift, Manta) switch shaders when it arrives, including on their faded copies; and the impact and dust particle pools switch shader the first time a per-particle colour is set. Both are covered by the warm-up in `src/shader-warmup.js`. Race start takes roughly 50 ms longer on this machine (click to third frame: 340 to 410 ms before, 410 to 450 ms after, with a warm shader cache and other work running on the machine).

**R2. Kart models are too detailed to multiply.** A 12-kart online grid of the detailed cars would put 0.5 to 1 million kart triangles in view, on top of the circuit. Rivals use the same model as the player at any distance. Fix: a low-detail version of each kart for rivals beyond about 25 m (the cars are built from code, so segment counts can be parameters), and merging each kart's static parts so a kart is about 5 draw calls instead of 30. Effort: medium to large, mostly per-car work. Risk: visual; needs a side-by-side check per car. Gain: roughly halves triangles in pack racing; a prerequisite for 12 karts on modest hardware.

> **Note, 26 November 2026 (PR #19).** Done. A rival more than 26 m from the camera is drawn with a second, cheaper build of the same car (7,423 triangles and 6 draw calls on average, against 26,668 and 18.3). The player, the ghost and the garage keep the full model.

**R3. Sky Lane scenery and circuit props are drawn one object at a time.** `src/sky-visuals.js:160` creates one mesh per box and three objects per boost cell, and each floating item box is a 3,052-triangle crate. Circuit scenery accounts for 140 to 260 draw calls. Fix: instance the cells, boxes and glows, and cull by distance. Effort: medium. Risk: low. Gain: about 100 to 200 fewer draw calls in Sky Lane views. PR #14 rewrites `src/track.js` and `src/sky-visuals.js`, so this should wait for it or be built on top of it.

> **Note, 27 November 2026 (built on PR #14).** Done for the Sky Lanes. In a Sky Lane view on Test Track 01 the lane scenery was 116 of 259 draw calls for 11% of the triangles, mostly Boost Cells drawn as a crystal, a ring and a glow sprite each. Boxes that never move are now collected per material and 160 m stretch of lane and drawn as instanced meshes, and a lap's cells are three instanced meshes per kind (the glow is a camera-facing quad placed by the vertex shader; over a frame with 42 glows, 97% of the glow's pixels are within 2/255 of the sprites it replaces). The same view is 26 draw calls for the lanes. Over a full race, draw calls per frame went from a mean of 153 to 181 and a maximum of 412 to 481 (three circuits) to a mean of 128 to 137 and a maximum of 311 to 332. Circuit props outside the lanes were already instanced by PR #14.

**R4. There are no quality settings and no automatic scaling.** Every device gets 4-sample antialiasing, a 1.6 pixel ratio, 8× anisotropic filtering and full-detail models. Fix: three quality tiers plus automatic resolution scaling driven by the frame times `src/perf.js` already records (drop the pixel ratio in steps when frames run long, raise it when they recover). Effort: small to medium. Risk: low. Gain: not measurable on this machine, where GPU time did not change between pixel ratios 1.0 and 2.0. On integrated graphics and phones, resolution is normally the dominant cost, so this is the main protection for low-end devices. It needs one real low-end device to tune.

> **Note, 27 November 2026 (PRs #17 and #14).** Done: Auto, High, Medium and Low, with automatic resolution scaling on all but High. Auto and High render up to 2.5 device pixels per CSS pixel within a 6-megapixel frame; Low turns off antialiasing and the sunlight shadow map. The scaler's rules were tuned in simulation (dropped frames that resolution does not cause, 48 and 50 Hz screens, 30 fps caps, devices limited by the graphics card or by the processor), not on a real low-end device.

**R5. Choosing the Manta adds two spotlights to the whole scene.** `src/manta.js:305` adds two `SpotLight`s when the Manta is the player's car. Every lit material on screen then computes four lights instead of two. Fix: replace them with an unlit glow mesh. Effort: small. Risk: the Manta's headlight pools on the road disappear unless faked with a decal.

> **Note, 26 November 2026 (PR #19).** Done. The spotlights are replaced by a painted pool of light under the car, which no longer lights rivals or walls.

**R6. Visual updates run once per simulation tick, not once per frame.** `track.update` in `src/session.js:267` repositions every Sky Lane part and every boost cell on every tick, at any distance. When a frame runs long the loop runs up to six ticks, so this work multiplies exactly when the game is already behind. Fix: keep the tick for simulation state and move the visual repositioning into the per-frame path. Effort: small to medium. Risk: low.

> **Note, 27 November 2026 (built on PR #14).** Done. `track.update` still brings the scenery up to date by default, which tools and tests rely on; the game loop calls `track.setVisualsPerFrame(true)` and `track.drawVisuals()` before each render, so moving parts, cells and item boxes are repositioned once per drawn frame however many simulation steps ran.

> **Note, 27 November 2026, on R1 with PR #14's shadow map.** The shadow pass uses its own depth shaders, which `compileAsync` does not build, so three or four of them were compiling after GO (worst frame 43 ms), and two circuits each had one frame of 76 to 93 ms with no shader in it. `src/shader-warmup.js` now draws the whole scene once into a tiny off-screen target while the race loads, with nothing hidden or culled and the sun's shadow camera widened to the whole circuit. That builds the shadow shaders and sends every model to the graphics card in one frame of about 75 ms during the countdown. After it, three full races had no frame over 8 ms after GO; one shadow shader still compiled late on one circuit, in a 2.7 ms frame.

> **Note, 27 November 2026, the late shadow shader.** Found and fixed. Three draws every shadow with one shared depth material, onto which it copies each caster's texture. It chooses a new shader for that material only when a caster differs from the one drawn before it in kind (instanced or not, instance colours or not), and the shader it then chooses also depends on whether that caster is textured, which side it shows and whether its model has surface normals. So the set of depth shaders that exists after the warm-up draw depended on the order the scene happened to be drawn in, and a later frame with a different mix of casters in view could need one more: here, the instanced, textured Sky Lane boxes. The warm-up draw now includes a row of 54 tiny casters behind the camera that puts every combination next to a change of kind. Crown & Cloister compiled two shaders after GO before the change and none after it; Selene Station and Neon Grid also none. The warm-up frame during the countdown is about 80 to 115 ms.
>
> The three circuits added in PR #27, one full race each with 6 karts on an M5 Pro: Crown & Cloister 131 draw calls per frame on average (300 at most) and 311k triangles (646k at most); Selene Station 130 (253) and 304k (538k); Neon Grid 182 (408) and 294k (603k). No frame after GO took longer than 18 ms on any of them.

**R7. Small per-frame waste in the HUD.** `src/main.js:519` writes two bar widths every frame whether or not they changed; the full-screen speed-lines layer keeps animating at zero opacity (`src/style.css:145`); `noteCrumbs()` builds a 25-field object every frame (`src/main.js:695`). Total script time is under 1 ms on this machine, so the gain here is small; on a phone five to six times slower it is still only a few milliseconds. Effort: small. Risk: none.

> **Note, 26 November 2026 (Batch 1 PR).** Done. `noteCrumbs()` was not throttled: it now compares the four values a breadcrumb can come from every frame and builds the snapshot only when one changes, which costs less than a throttle and cannot miss an event. Over a 3,782-frame run the two drift bars went from 3,782 style writes each to 1,482 and 1,675.

**R8. Textures are uncompressed in GPU memory.** The textures in one race scene took about 36 MB; the four 2048×2048 car liveries are about 22 MB each when loaded. Fix: cap texture size at 1024 on the low quality tier, or convert to GPU-compressed KTX2. Effort: small for the cap, medium for KTX2. Gain: memory on phones, not frame rate.

> **Note, 27 November 2026.** The cap is done: on the Low tier `src/texture-budget.js` draws any car texture larger than 1024 pixels a side down to that size before it is first sent to the graphics card. The four 2048 x 2048 textures (Barrage, Crestline, two on the Ironhide) go from about 22.4 MB to 5.6 MB each. The other tiers are unchanged, and KTX2 compression is not done.

**R9. Model caches never shrink.** Browsing cars in the garage keeps every car's geometry and materials for the session (`src/concept-art.js:12`, `src/kart-wings.js:181`, `src/item-art.js:19`). Low priority; it matters only on memory-constrained phones.

> **Note, 27 November 2026.** Measured: looking at all 50 cars in the garage left 669 models (about 107 MB of vertex data) and 27 textures on the graphics card for the rest of the session. `src/kart-art.js` now remembers what each car's karts were drawn with, and once more than eight cars with no kart alive are remembered, the ones used longest ago release their graphics memory; a car that comes back is sent to the card again when it is next drawn. After the same walk through the garage: 183 models and 8 textures. The JavaScript copies of the models are still kept, so the page's own memory use is unchanged.

## 3. Frame loop and simulation

The loop in `src/main.js:639` is sound: a fixed 1/60 s step, an accumulator capped at 0.1 s, button presses carried between frames so high-refresh screens do not drop them, and interpolation between the last two ticks for drawing.

| Simulation cost per tick, browser engine (V8) | 6 karts | 12 karts |
| --- | --- | --- |
| Test Track 01 | 0.041 ms | 0.113 ms |
| Crestline Ridge | 0.028 ms | 0.129 ms |
| Switchyard GP | 0.034 ms | 0.129 ms |

That is under 1% of a frame. Rolling back and re-simulating the whole 12-kart world costs 0.7 ms for 6 ticks and 1.5 ms for 12 ticks, so client-side rollback is affordable.

The cost matters on the server (section 4), and a profile of a 12-kart run shows where it goes: about 30% in `src/kart-footprint.js` (`orient` at line 94 rebuilds each kart's collision outline with new arrays whenever its heading changes, which is every tick), 11.5% in `mod` (among its callers, `features` at `src/sim/world.js:318` runs it for every pickup and pad for every kart every tick), and 9.6% in garbage collection. The tick allocates 1 to 13 KB.

**F1. There are two race loops and only one is used.** `src/session.js` runs every race today. `src/sim/world.js` is the multiplayer loop and is exercised only by tests. They repeat the same logic nearly line for line (`features`, `drive`/`driveActor`, `tick`/`step`). The single-player loop also draws items with `Math.random` where the multiplayer loop uses the seeded generator. Fix: run single player on `createSimWorld` with one local seat and delete the duplicate. Effort: medium. Risk: medium; Time Trial ghosts and Test Drive options need re-checking. Gain: an online race and an offline race become the same code path, which is the only way to keep them from drifting.

*Done, 2026-11-26:* `src/session.js` now runs every single-player mode on `createSimWorld` through `createLocalRaceRunner` (`src/race-runner.js`). `tests/session-engine.test.js` checks that a Quick Race and a plain engine run with the same seed and inputs stay hash-identical. Two behaviours follow the engine's rules from now on: item draws are seeded (a new seed per start), and the track's moving parts follow the race leader's lap rather than the player's.

**F2. Pausing when the tab is hidden cannot work online.** `src/main.js:421` pauses the race on `visibilitychange`. An online client needs a catch-up path instead. This is a design note for the online work, not a defect today.

> **Note, 27 November 2026.** Still open; it belongs with connecting the netcode to the game loop.

## 4. Netcode and online architecture

### What exists

- `src/sim/`: the deterministic simulation, also built into `build/racer-sim.js` for the server.
- `src/net/`: room codes and match labels, a binary input packet, a server-side input buffer, a snapshot interpolation buffer, and a client predictor that restores a snapshot and re-simulates.
- Hub side (`metaverse-hub` `main`, `server/modules/src/games/sproto_racer.ts`): registers the game for login, saves and feedback. Its header says it "registers no RPC or match of its own".
- Hosting: one Hetzner VPS running Nakama and Postgres in Docker, Caddy in front, Cloudflare proxying. All realtime traffic is JSON text over one WebSocket; binary payloads are base64-encoded inside it (`vendor/hub-sdk/dist/realtime/client.js:499`). Incoming messages are capped at 8,192 bytes.

### Measured

| Server tick cost in Goja (M5 Pro) | Mean | p95 | p99 | Max |
| --- | --- | --- | --- | --- |
| 6 karts | 2.3 to 2.8 ms | 3.0 to 3.7 ms | 4.2 to 4.9 ms | 7.3 ms |
| 8 karts | 3.8 ms | 5.4 ms | 6.3 ms | 7.7 ms |
| 12 karts | 11.1 to 13.1 ms | 15.9 to 17.1 ms | 19.6 to 40.7 ms | 57.6 ms |

The same tick is about 90 times faster in V8 (0.13 ms). Replacing AI seats with human inputs does not help: 12 human seats cost 12.4 ms. The cost grows faster than the kart count because kart-to-kart checks grow with the number of pairs.

| Snapshot size (JSON bytes) | 6 karts | 12 karts |
| --- | --- | --- |
| Wire snapshot, mean | 2,030 to 2,260 | 3,920 to 4,060 |
| Wire snapshot, largest | 3,510 | 5,360 |
| Full snapshot (`captureSnapshot`), mean | about 20,500 | about 39,600 |

`src/sim/snapshot.js:169` says the wire snapshot is "~400-900 B for 6 karts". After base64 and the message envelope, a 12-kart wire snapshot is about 5.5 KB, and the largest I saw would be about 7.2 KB.

| Download per player (computed) | 6 karts | 12 karts |
| --- | --- | --- |
| Wire snapshots at 20 per second | about 60 KB/s | about 110 KB/s |
| Wire snapshots at 60 per second | about 180 KB/s | about 330 KB/s |

A 12-player race at 20 snapshots a second would send about 1.3 MB/s from the server, and each player would download about 33 MB in a five-minute race.

### Findings, ranked

**N1. No online mode is wired up.** No client code opens a match, no server match handler exists, and no opcode definitions exist for joining, readying or starting. This is the bulk of the remaining work and it depends on the decisions in N2 to N4.

> **Note, 27 November 2026.** Partly done. The netcode (N2, N4), the simulation speed-up (N3), the defects (N5) and most of N6 (leave and rejoin, AI takeover, late join, live desync detection, rate limits) are on `main`, and the server side runs inside `build/racer-sim.js` and behaves identically in Goja (`docs/online-netcode.md`). Not done: the Nakama match handler in `metaverse-hub`, and the game's own loop and menus using any of it.

**N2. The parts of the netcode do not connect.** Confirmed in the code and by calling it:

- The predictor cannot use the wire snapshot. `predictor.reconcile(encodeWireSnapshot(world))` returns `false` (`src/net/predictor.js:158` needs fields only the full snapshot has). Prediction therefore needs the 20 to 40 KB full snapshot, which is not sendable 20 times a second.
- The wire snapshot leaves out the random-number state, item roulette state and AI state, so a client could not continue the simulation from it even with a decoder.
- Nothing relays other players' inputs. The predictor re-simulates every kart, but guesses remote humans from their last known input or a neutral one.
- There is no clock or tick synchronisation and no input lead. With equal tick numbers, every input reaches the server after its tick has run.

**N3. The server cannot run 12 karts at 60 Hz in Goja.** See the table above. The production server will be slower per core than this laptop; I did not measure it, and assume 1.5 to 2 times. Six karts fit with room to spare, at roughly a quarter to a third of a core per race.

**N4. Snapshots are full JSON objects every time.** No binary encoding and no delta against the previous snapshot.

**N5. Three defects in the existing code.**

- `src/sim/snapshot.js:202` and `:222` both write the key `rv`. The second (reserve item) overwrites the first (reverse speed). Sending reverse speed 4.2 with reserve item 7 decodes as reverse speed 0.007.
- `src/net/input-buffer.js:83` drops button presses from an input that arrives after its tick was consumed. A late "use item" press is lost; the comment above the line says the opposite.
- A shield's `life` is `Infinity`, which JSON turns into `null` (`src/sim/gameplay-core.js:268`, `src/sim/snapshot.js:247`). I did not run a case with an active shield, so the effect is inferred.

**N6. Missing for production**, as shown by the code: leave and rejoin handling, AI takeover of an abandoned seat, late join, live desync detection (`stateHash` is used only for replays and tests), input rate limiting, and any check of message size against the 8,192-byte cap.

### The decision this needs: which netcode model

The simulation is deterministic and cheap to re-run in the browser. That makes two models possible.

**Model A: relay inputs, simulate everywhere, roll back on late input (recommended).** The server runs the authoritative simulation and broadcasts every seat's inputs each tick, plus a full state keyframe about once a second and on join. Each client runs the whole simulation, predicts remote karts from their last input, and when a real input arrives for a past tick it rolls back and re-simulates (1.5 ms for 12 ticks, measured). 

- Download per player: an estimate of 10 to 15 KB/s for 12 players, from the 12-byte input frame size. Not measured.
- Uses what is already built: the deterministic sim, the binary input frame, the predictor (which already re-simulates the whole world) and the state hash for desync checks.
- Tolerates the single WebSocket: a delayed packet delays inputs, and rollback absorbs it.
- Cost: remote karts visibly correct when a rival changes input, and an item hit can be revised a few frames later. A binary keyframe format has to be written. The single-player loop must move onto `createSimWorld` first (F1).

**Model B: snapshot interpolation with local-only prediction.** The server sends compact binary delta snapshots 20 to 30 times a second. The client predicts only its own kart and draws the others about 70 to 100 ms in the past.

- Download per player: an estimate of 10 to 20 KB/s with a binary delta format.
- Cost: a kart-only prediction path does not exist (the predictor re-simulates everything), kart-to-kart contact feels soft because rivals are drawn in the past, and the delta format and a partial "apply" both have to be written. Less of the existing work carries over.

### Server hosting options

- **Stay in Nakama (Goja), cap rooms at 6 to 8 karts, and optimise the hot paths.** Removing the allocations in `kart-footprint.js` and the per-pickup `mod` calls should cut the Goja tick substantially; I expect two to three times, to be confirmed by re-running the Goja benchmark. No new infrastructure.
- **Run the simulation in a V8 side service** (a small Node process beside Nakama, which keeps login, rooms and matchmaking). The tick is 90 times cheaper there, so 12 karts and many concurrent races fit on one core. It is a new service to deploy, secure and monitor, and it departs from how the other Sproto games are hosted.

Recommendation: start with Goja at 6 karts, optimise, and measure on the real server. Move to a side service only if 12-kart rooms become a requirement.

## 5. Loading and bundle

| Production build | Size | Gzip |
| --- | --- | --- |
| `three-core` | 743 KB | 188 KB |
| `index` (game code, all car specs, item art) | 438 KB | 174 KB |
| `car-art` | 94 KB | 40 KB |
| `hub-sdk` | 96 KB | 31 KB |
| CSS | 29 KB | 8 KB |
| Total script, all loaded before the lobby appears | 1,381 KB | 437 KB |

Images are fetched only when a car that uses them appears, which is good. From clicking the last garage button to the first race frame took 72 to 122 ms on this machine, including building the circuit.

**L1. The build ignores the base path the hub sets.** The hub builds this repo with `VITE_BASE=/play/sproto-racer/` (`metaverse-hub` `scripts/fetch-game-web.mjs`), but `vite.config.js` sets no `base`, and `src/fonts.css` uses absolute `/fonts/...` URLs. The built `index.html` points at `/assets/...`. I have not seen a production deploy, so treat this as likely rather than confirmed: served from a sub-path, the game's scripts and fonts would not load. Fix: `base: process.env.VITE_BASE ?? '/'` and relative font URLs. Effort: small.

> **Note, 26 November 2026 (Batch 1 PR).** Done with `base` alone. Once `base` is set, Vite prefixes the public font URLs in `fonts.css` and the favicon itself, so the font URLs did not need to become relative. A build with `VITE_BASE=/play/sproto-racer/` contains no asset URL outside that path, and the game loads from `vite preview` at both `/` and `/play/sproto-racer/`.

**L2. The item icon sheet is 505 KB for a 960×768 image.** It loads when the race HUD first appears. Re-encoding it as lossy WebP should bring it under 100 KB. `public/item-icons.png` (82 KB) may be an unused duplicate. Effort: small.

> **Note, 26 November 2026 (Batch 1 PR).** The sheet is now 97,922 bytes (lossy WebP, quality 75, alpha within 1/255). `public/item-icons.png` was confirmed unused in this repo, in PR #14 and in `metaverse-hub`, and removed.

**L3. Fonts ship in two formats.** `public/fonts` is 838 KB because each font has a `.ttf` fallback beside its `.woff2`. Every browser that can run WebGL 2 supports WOFF2. Effort: small.

> **Note, 26 November 2026 (Batch 1 PR).** The `.ttf` files are removed; `public/fonts` is now 236 KB (seven `.woff2` files and two licence files).

**L4. Everything is one eager download.** Race code, all car definitions and the hub SDK load before the lobby paints. Splitting the race and the hub realtime code behind `import()` would cut the first download; the gain is modest (a few hundred milliseconds on a slow connection) and it is not urgent.

> **Note, 27 November 2026.** Not done. It means turning static imports in `src/main.js` into `import()`, and that file is being reworked to connect the netcode; splitting should follow that.

## 6. Recommended order

**Batch 1: small, safe, no change to lap pace.** One PR.

1. Compile all shaders before the countdown (R1).
2. Fix the duplicate `rv` key in the wire snapshot (N5). This edits `src/sim`, so it regenerates the server bundle; it does not change driving.
3. Honour `VITE_BASE` and make font URLs relative (L1).
4. Replace the Manta's spotlights with an unlit glow (R5).
5. HUD clean-up: write bar widths only on change, stop the hidden speed-lines animation, throttle `noteCrumbs` (R7).
6. Re-encode the item icon sheet and drop the `.ttf` fonts (L2, L3).
7. Add the benchmark scripts used here to the repo (`scripts/bench/`), so every later change is measured the same way.
8. Correct the two stale comments (snapshot size, 11-byte input frame).

> **Status, 26 November 2026.** Items 1, 3, 5, 6 and 7 are in the Batch 1 pull request that added this document. Items 2 and 8 (which edit `src/sim` and `src/net`) and item 4 (the Manta) are being built as separate pull requests.

**Batch 2: medium, rendering.** After PR #14 merges.

9. Quality tiers and automatic resolution scaling (R4).
10. Low-detail rival karts and merged kart parts (R2).
11. Instanced Sky Lane scenery and per-frame visual updates (R3, R6).

**Batch 3: architecture, needs a decision first.**

12. Move single player onto `createSimWorld` (F1).
13. Remove allocations from the sim hot paths and re-measure in Goja (N3). This may change floating-point results; if lap pace moves, `TRIAL_LAYOUT` needs a bump.
14. Build the chosen netcode model (N2, N4), then the server match handler and the online UI (N1), then the production gaps (N6).

## 7. Reproducing the numbers

The scripts are in `scripts/bench/`, with a README that gives the command for each and explains every column:

- `scripts/bench/bench-sim.mjs`: sim tick cost, allocation per tick, snapshot sizes and rollback cost in Node.
- `scripts/bench/prof.mjs`: a long AI race to run under `node --cpu-prof` for the profile in section 3.
- `scripts/bench/gojabench/`: the same world stepped inside Goja. Needs Go; not part of `npm test`.
- `scripts/bench/browser-harness.js`, described in `scripts/bench/browser-harness.md`: the in-page harness that drives the frame loop and records `renderer.info`, shader program counts and GPU timer queries.

None of them run in CI. Compare runs made on the same machine, close together.
