# Real-time browser racing QA

On November 24, 2026, three agents each drove one three-lap Quick Race with five AI rivals. Each used a separate Chrome session at 720 × 450 on an Apple M5 Pro with Metal-backed WebGL. Telemetry-guided virtual gamepads supplied steering, throttle, drift, and item inputs. The browser's normal animation loop rendered the races from countdown to results. These observations describe visual response and timing. Physical stick resistance, vibration, and human reaction time were outside this test.

| Circuit | Start → finish, Lima time | Wall time | Race clock | Place | Timed drift boosts |
| --- | --- | ---: | ---: | ---: | ---: |
| Test Track 01 | 17:30:31 → 17:37:51 | 7:20.539 | 7:17.233 | 1 / 6 | 312 |
| Crestline Ridge | 17:30:46 → 17:40:24 | 9:38.177 | 9:34.866 | 2 / 6 | 152 |
| Switchyard GP | 17:31:12 → 17:42:09 | 10:57.493 | 10:54.533 | 5 / 6 | 226 |

Wall times include the countdown. The finish-screen clock starts at green. All 36 sectors registered in sequence in each race. The 95th-percentile frame interval was 16.7 ms on all three circuits. Switchyard had one 200 ms interval. The kart remained in frame throughout, although a rival could briefly cover it. [Finish screens](finishes.jpg) · [Wall-clock samples during the runs](clock-samples.csv)

## Driving observations

- **Test Track 01.** The inside, wide, and pad/ramp laps took 2:23.683, 2:36.017, and 2:17.533. On the spiral, the kart visibly slid across its direction of travel while the camera kept the approaching exit in view. Paired exhaust jets and rings marked successful boosts even when the kart was already at turbo speed. The wide line brought the kart into contact with the rail more often. [Spiral capture](spiral.mp4)
- **Crestline Ridge.** The apex, wide, and ramp laps took approximately 3:07.1, 3:16.7, and 3:11.0. At Twin Rollers, a Perfect boost led into a jump of about 5.25 m and a right-hand landing. The horizon remained readable and the Air Boost message appeared as the kart settled. The highest jump over the full race was 9.95 m. [Jump and landing](ridge.mp4)
- **Switchyard GP.** The inside, wide, and alternating-gate laps took approximately 3:33.2, 3:43.6, and 3:37.8. Countersteering opened the current slide. The kart straightened before taking the opposite slide. In one recorded exit a Good boost raised speed from 125 to 140 km/h. The alternating line cleared all 11 dividers on its lap. Small chain indicators were difficult to read at speed. A passing rival briefly blocked the player, and a boost grade masked a simultaneous collision notice. [Packed pass](switchyard.mp4) · [Drift reversal and divider hits](reversal.mp4)

## Changes and focused rechecks

| Finding | Change | Focused check |
| --- | --- | --- |
| The wide line could reach the outer rail as Test Track 01 tightened. | Added advance warning and inward-slanting edge paint where Linked Switchbacks narrows from 31 to 26 m. | Drove the approach in the browser and checked cue placement against the taper. |
| Crestline's narrow lip lines and landing ticks were hard to distinguish over a crest. | Painted the launch line across the raised ramp crown, extended the landing brackets to 50–120 m depending on the jump, and added an upright 40 m reference at stronger jumps. | Drove Twin Rollers and the paired ramps in Jump Calibration at speed. |
| Switchyard's approach bars warned of a divider but didn't indicate the open lane. | Added directional arrows 48 m and 22 m before each divider. Centered dividers show both sides. | Checked offset and centered obstacles from the chase view and checked the paint against the road bounds. |
| A close rival could cover the player during a pass. | A blocking rival briefly fades when its solid geometry lies between the lens and the driver's head or chassis. | A real-time overtake triggered the fade, then restored full opacity as the rival cleared. Also checked rear view, side-by-side karts, jumps, boost materials and ghost rendering. [Same camera position, before and after](rival-visibility.jpg) |
| A timed boost could hide a collision notice, and the chain count was difficult to read at 720 × 450. | Display both events and draw larger, outlined chain indicators with a filled state. | Repeated the same timed boost into a Weave Gates divider. Both “OBSTACLE HIT” and “GOOD BOOST” appeared at 720 × 450 and 320 × 568. Verified the count through three chained boosts. [Collision and boost together](hit-and-boost.jpg) |

The boosted Twin Rollers check exposed touchdowns beyond the initial 50 m ruler. With the extended markings, the farthest touchdown in that sector was 70.7 m on a lane marked to 100 m. In Jump Calibration the 6 m/s and 11 m/s ramps landed at 31.4 m and 56.0 m, inside 50 m and 80 m of markings respectively. [Updated chase views on all three circuits](circuit-cues.jpg)

## Driving and item rechecks

A hard rail impact previously emptied the boost reserve and left the kart locked in its drift. In a real-time Test Drive, the corrected kart ended its right slide on contact, moved 0.83 m back toward the racing line under countersteer, and started a fresh left slide on the next press. Light contact preserved the slide and reserve in the fixed-step check. Releasing Q while holding the controller drift button now preserves the hold. Keyboard taps, quick regrips, and a three-boost controller chain also passed.

On two real-time approaches to the same 4 m wide Switchyard divider, a line 2.68 m from its center clipped it and a line 3.59 m from center passed cleanly. Physics checks also covered clearing its 1.7 m top, reversing into it, and blocking a hit with Bubble Wrap. A kart 3 m above the deck hit the closed Test Track 01 loading door, and a parked kart registered one hit as the rolling drum moved into it. The open door allowed ground traffic on lap three.

### Test Track 01 item lap

The agent drove one Test Drive lap before the fixes and one after them, each with five AI rivals in Chrome. Both runs used keyboard shortcuts, a virtual standard gamepad, and the normal animation loop. The agent switched and used all ten items while racing. Separate browser checks placed karts at specific distances and heights to verify contacts and misses that depend on positioning.

| Build | Start → finish, UTC | Wall time | Game clock | Sections | Item activations / attempts |
| --- | --- | ---: | ---: | ---: | ---: |
| Before fixes | 22:54:37.703 → 22:57:09.282 | 2:31.579 | 2:31.633 | 12 / 12 | 163 / 167 |
| After fixes | 22:58:21.879 → 23:00:52.025 | 2:30.146 | 2:30.200 | 12 / 12 | 162 / 166 |

On the corrected lap, two Homing Cursor attempts and two Tow Cable attempts had no eligible rival. All ten items activated 15–18 times apiece. The lap recorded six Bumper Ball hits, fifteen Homing Cursor hits, fifteen successful cable pulls and six box attachments. Five boxes were shaken off and one popped. All 26 focused item checks passed. In a separate real-time gamepad pass, cycling through all ten slots during one drift preserved the chain through three timed boosts. [Per-item counts and check results](item-laps.json) · [On-track screenshot](item-lap.jpg)

| Item | Behavior checked in the browser |
| --- | --- |
| Soda Turbo | Added boost reserve and accelerated the kart. |
| Bumper Ball | Hit rivals ahead and behind, bounced off a rail, and cleared a blob, box, or incoming cursor. A ball fired from a jump passed over a ground target, descended, and rolled along the road. |
| Bubble Wrap | Absorbed one shot without losing speed. A subsequent shot hit after protection wore off. An unused shield expired at six seconds. |
| Sticky Blob | A following rival entered the patch and slipped. |
| Pop-Up Box | A box attached on contact. Two hops disarmed it, and leaving it attached until timeout caused a pop. |
| Homing Cursor | Warned and tracked a rival, hit it, and refused a shot without a target. An airborne shot started at the firing kart and descended toward its target. |
| Bass Speaker | Pushed a nearby rival, spared a distant one, and emitted its ring at kart height when used in the air. |
| Tow Cable | Pulled toward a reachable rival, rejected an 18 m lateral gap, and picked a farther eligible rival when a closer one was out of reach. Quick Race kept the cable after a rejected shot and consumed it after a valid pull. |
| Triple Soda | Preserved remaining charges across slot switches and refilled the unlimited test stack after the third use. |
| Express Lane | Deployed four strips. Both the player and a rival gained boost by crossing them. |
