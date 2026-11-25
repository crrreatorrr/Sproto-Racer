# Sproto Racing circuit QA

One-time QA pass on November 24, 2026. Three parallel agents each drove one circuit through three full Quick Races using the game's 60 Hz race session, steering and other driving inputs, and five AI rivals. Each race started on the grid and finished after three laps. Times are simulated race times and exclude the countdown.

| Circuit | Inside or apex line | Wide line | Third line | Third-line time |
| --- | ---: | ---: | --- | ---: |
| Test Track 01 | 7:59.266 | 8:26.074 | Aim for pads and ramps | 7:54.234 |
| Crestline Ridge | 9:17.317 | 9:52.653 | Aim for ramp lanes | 9:38.218 |
| Switchyard GP | 10:14.271 | 10:56.128 | Alternate lanes through dividers | 10:32.224 |

All nine races completed all 12 sectors in order on each lap, for 324 sector visits. Simulated kart positions stayed finite and inside the road limits. The player remained in the chase-camera frame on all three routes per circuit.

- On Test Track 01 the two cornering lines averaged 5.18 m toward the apex and 6.80 m away from it. The pad-and-ramp line recorded 32 landings after more than 0.43 s of airtime.
- On Crestline Ridge the inside and wide lines averaged 10.25 m apart at matched distances. The ramp line launched 33 times.
- On Switchyard GP the inside and wide lines had a root-mean-square separation of 10.27 m. The alternating line cleared all 33 divider encounters. A separate deliberate rail-contact race hit the rail on each lap and recovered to finish.

## Issues fixed and rechecked

| Reproduction | Correction and recheck |
| --- | --- |
| Quick Race started cars ahead of the painted grid. | Paint and spawn positions now use the same six slots. The player starts sixth, and crossing the start stripe preserves lap one. |
| A kart approaching a ramp diagonally could take off about 0.2 m before reaching the lip. | Takeoff uses the distance actually traveled during a physics substep and the lateral position at the crossing. Rechecked diagonal approaches and takeoff and landing on all three tracks, including the raised switch bridge. |
| Side contact at a guardrail could push a kart 0.285 m past the legal lateral limit. The outside line on Test Track 01 also exposed a 0.048 m overshoot where the road narrows. | Contact gives the kart on the open side room to move. The wall check uses the width at the kart's new position. Rechecked both rails, the narrowing sector, and the three racing lines. |
| Holding A / Cross to accelerate while opening Pause could immediately activate Resume. | Opening a panel records the current controller state so a held button requires a fresh press. Rechecked pause and resume while accelerating. |
| The sector label, inventory, minimap, or drift meter could overlap on narrow or short screens. | The HUD groups related controls in rows and columns. Checked the affected layouts in Chrome, Edge, and Firefox, down to 320 × 568 portrait and 667 × 375 landscape. |

## Other coverage

- Completed three-lap Quick Races with each of the five cars on each circuit. Completed Time Trials, reloaded the saved ghosts, and checked that each circuit keeps its own record.
- Exercised all 36 Test Drive sector starts at four entry speeds and five rival settings. Checked all ten items on each circuit, including hits, shield blocks, target selection, charge retention, and lane boosts. Checked pickup respawns, boost pads, launch timing grades, and the lap-three loading door.
- Replayed camera trajectories at 30, 60, and 144 Hz. Checked drift chaining and boost animation, keyboard item switching in the air, controller presets and remapping, pause, restart, rematch, and audio settings.
- Checked all 20 driver/car combinations for seat contact, hands on the wheel, and clearance through drift and boost poses.
- Ran the production game with WebGL in Chrome, Edge, and Firefox. The browser checks used keyboard input and an emulated gamepad. Physical controllers, Safari, and on-device mobile performance remain unverified.

The follow-up pass ran one complete race on each circuit in real-time Chrome sessions. It includes wall-clock measurements, video clips, and fixes to the track markings, rival visibility, and HUD. [Real-time results and fixes](realtime/README.md)
