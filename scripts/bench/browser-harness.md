# Browser measurement harness

`browser-harness.js` drives the real game from the page console and records what each frame cost. It needs no change to the game: it is loaded from the dev server and hooks the running page.

## Why it exists

A browser tab that is not in front gets about one animation frame a second, so the game's own frame loop cannot be timed there. (Claude's browser pane is always in that state.) The harness replaces `requestAnimationFrame` with a queue and calls the queued frame itself, advancing a synthetic clock by 1/60 s per call. That gives the true cost of each frame, but not a frames-per-second figure, because frames run back to back instead of waiting for the screen.

It also drives the player's kart with the same AI the rivals use, so a full race covers ground sections, Sky Lanes and item use without anyone at the keyboard.

## Running it

1. Start the dev server (`npm run dev`) and open `http://127.0.0.1:5173/?perf=1`. Stay in the lobby.
2. In the page console:

```js
const A = (await import('/scripts/bench/browser-harness.js')).default;
await A.start('track01');   // track01, track02 or track03: a Quick Race with the default car
await A.runRace();          // repeat until it reports finished: true
A.summary();
```

The game's tab has to be the selected tab in its window. A tab behind another one gets no animation frames at all, and the harness needs one to take over the loop; if `A.start()` returns and nothing moves, that is why.

`runRace()` stops after 24 seconds of real time so that a console call cannot hang; call it again to continue the same race. Reload the page before each new race. Shader compilation is only "cold" on the first run after the browser starts, because the browser keeps compiled shaders on disk.

## An online test race

The development server can run an online race against a match that lives inside the page (see `docs/online-netcode.md`, "In the game"). Open `http://127.0.0.1:5173/?perf=1&online=loopback&latency=60` (add `&seats=12&humans=6` for a full grid), stay in the lobby, then:

```js
const A = (await import('/scripts/bench/browser-harness.js')).default;
await A.startOnline('track01');   // picks the circuit, goes through the garage, presses READY
await A.runRace();                // repeat until it reports finished: true (the server's result is in)
A.brief();
```

The player's kart is driven by the same autopilot. `A.summary().online` (and the shorter `A.brief()`) adds what the online side cost and whether it stayed in step with the host:

| Field | Meaning |
| --- | --- |
| `clientMs` | Milliseconds per frame this player's online work took: correcting, re-running and stepping the race, tidying item meshes, playing cues. Mean, 99th percentile and worst |
| `clientMsWithItems` | The same over the frames that had item objects alive |
| `loopbackMs` | The in-page server and the other players. A real client does not pay this; subtract it from `scriptMs` |
| `replayedTicksPerFrame` | Ticks re-run by corrections per frame |
| `hashChecks`, `hashDifferences` | How often the client compared its state with the host's, and how often they differed. Must be 0 |
| `keyframeRequests`, `stalledFrames` | Full-state resyncs asked for, and frames spent waiting at the edge of the prediction window |
| `events` | Events announced, first seen after a correction (`late`), and taken back (`cancelled`) |
| `itemMeshes`, `trailFill` | Item meshes built, started from scratch and handed back after a correction; how complete shot trails were when drawn |

## What `A.summary()` reports

| Field | Meaning |
| --- | --- |
| `frames`, `finished` | Frames recorded, and whether the player crossed the line |
| `goFrame` | The frame the countdown ended. Later figures count from here |
| `beginMs` | Time taken by the click that starts the race: building the circuit and karts, and the shader warm-up |
| `countdownFramesMs` | Script time of each frame before GO in which the renderer compiled new shaders |
| `programs` | Shader programs compiled so far, at the first race frame, at GO and at the end. After GO this should not grow |
| `scriptMs` | Script time per frame after GO: mean, 99th percentile and worst |
| `gpuMs` | GPU time per frame from WebGL timer queries, when the browser provides them |
| `framesOver50msAfterGo` | Every frame after GO that took more than 50 ms: a visible freeze |
| `programsAddedAfterGo` | Each time a new shader was compiled after GO: the frame, how long that frame took, and the scene objects that use it |

`A.frames` holds one row per frame: time, script ms, render-call ms, GPU ms (-1 when no result landed that frame), draw calls, triangles, geometries, textures, programs, the player's distance `s`, flying flag, JS heap, finished flag, rescues. `A.programLog` holds every shader compile, including those during the countdown.

## What it hooks

All of this happens in the page only.

- `THREE.Scene.prototype.onBeforeRender`, to find the renderer, the race scene (the one with fog) and its camera.
- `Array.prototype.map`, once per race, to find the list of karts (`state.actors`).
- `Object.assign`, to overwrite the player's controls with the AI's decision whenever the copied object is the result of polling input. Set `A.auto = false` to drive by hand.
- `window.__sprotoRace`, which the game sets with `?perf=1`, to find the kart the player drives (online it is not seat 0). On a build without it the player is taken to be seat 0.
- `renderer.render`, to time the call and wrap it in a GPU timer query.
- `window.requestAnimationFrame`, as described above.

## Other measurements

- Draw calls and triangles by part of the scene: hide each `A.s.children[i]` in turn, call `A.r.render(A.s, A.c)` and compare `A.r.info.render` with the full frame.
- A quick check of race start only: `await A.start('track01'); await A.pump(240); A.summary()`.
