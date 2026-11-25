# Sproto Racing

A browser kart racer built with Three.js, a custom fixed-step driving simulation, and Vite. Test Track 01 is a 6.62 km geometric test circuit with 12 sectors, including a clockwise, 1½-turn uphill drift spiral.

## Run locally

Use Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

Open the local address printed by Vite in a WebGL 2 browser. To build and run the static version, use `npm run build` followed by `npm run preview`. The production files are in `dist/`.

## Hub account

The paddock uses the same login as the [metaverse hub](https://github.com/crrreatorrr/metaverse-hub). A visit from the plaza arrives with `#t=<ticket>`. The game redeems it for that hub account and shows the username (a hub guest shows as Guest). Time-trial records for that account sync through the hub cloud save. Play opened on its own keeps this browser's records and does not copy them into an account.

`npm test` covers the visit, the name, and the records. The vendored SDK is `@metaverse/hub-sdk` 0.10.0 in `vendor/hub-sdk`. It does not list the game id `sproto-racer` yet, so a ticket cannot be redeemed until the hub adds that id and this tree is re-vendored. Until then the paddock says `Hub: bad_game` when a ticket is present, and stays "Not signed in" otherwise.

For a local hub, run the plaza and Nakama from metaverse-hub, then in this repo:

```sh
# dev server key is Nakama's stock defaultkey; set this for any other host
# VITE_NAKAMA_SERVER_KEY=...
# VITE_NAKAMA_URL=http://127.0.0.1:7350
# VITE_HUB_URL=http://127.0.0.1:5173/hub/
npm run dev
```

Open the game from the plaza once the hub lists it (the address has `#t=`). The paddock then shows the hub username and "times in the cloud". A new time-trial record on one signed-in browser shows as the personal best on another browser signed in to the same account. Signing out, or opening the game with no ticket, shows this browser's own times again.

## Relics

A signed-in visit reads that account's Relics from `init` (`relics`, plus `otherRelics` when the hub sends an id this SDK build does not type). The paddock lists each Relic as owned or not. The garage locks a car or character only when [`src/hub/unlocks.js`](src/hub/unlocks.js) names the Relic that unlocks it. That file is the only reward table. Its rows are empty placeholders until Ken fills one. A car or character with no filled row stays selectable, including when nobody is signed in, so a race can still start.

The last confirmed list is kept in this browser. A later launch with no ticket still shows that visit. A new sign-in replaces the list, including when the account owns none. With no visit and no saved list, the paddock says to sign in and the free cars and characters still race.

This game does not grant a Relic. `npm test` covers the table, the account read, the saved list, and the locked garage buttons.

## Circuits

Select a circuit in the paddock before choosing a mode, driver, and car. Each map shows the driving route and lap length. Each circuit has 12 sectors, a separate Time Trial record, and sector starts in Test Drive.

| Circuit | Length | What to test |
| --- | --- | --- |
| Test Track 01 | 6.62 km | Link the deeper switchbacks, hold a long slide up the larger spiral, then change drift direction through the downhill slalom and switch bridge. |
| Crestline Ridge | 7.93 km | Climb the Staircase switchbacks and carry speed through the sweeping descent. The paired ramps have different jump impulses. Landing lanes have brackets every 10 m for 50–120 m, and stronger ramps have a trackside 40 m board. |
| Switchyard GP | 9.17 km | Brake into the enlarged freight and return hairpins, then switch lines through the container esses. The 75, 50, and 25 m boards mark braking distances. White arrows point past the dividers. |

Item boxes start about 42 m from the line on every circuit. Each row has two or three boxes across five possible positions. The open lanes change with each row. Test Track 01 has 73 rows per lap, Crestline Ridge has 89, and Switchyard GP has 99. In Quick Race, crossing a box with an empty slot starts the item roulette. In Test Drive, you can practice taking the same pickup lines while keeping your selected unlimited item.

## Modes

- **Quick Race** runs three laps against five AI karts with item pickups.
- **Time Trial** records the fastest completed three-lap run. On this browser the ghost is saved with it. Signed in to the hub, the time follows that account to other devices; the ghost stays on the browser that set it. A subsequent run shows the saved ghost when this browser still has it.
- **Test Drive** offers all twenty items with unlimited supply. Select a section, entry speed, rivals, and lap state before driving. Test tools can reload those conditions during play. Choose a full pack to try area attacks or one rival ahead to practice aimed shots.

## Garage

Choose a circuit and mode, pick Sproto, Pip, Miso, or Rook, then select a car. The preview shows the exact driver and chassis used in the race. Use **Rear view** to inspect the chase-side silhouette. Your browser remembers the last confirmed pairing. A locked car or character stays on screen and cannot be confirmed. The line above the choices names the Relics this account owns.

| Car | Driving style |
| --- | --- |
| Apex | Baseline speed, acceleration, and turn rate |
| Needle | Highest top speed, slowest acceleration |
| Pogo | Quickest acceleration, slightly lower speed and turn rate |
| Gecko | Tightest turn radius, lower straight-line speed |
| Relay | Extra speed and acceleration, widest turns |
| Ironhide | Hardtop off-road truck with a full-width windshield, open cargo bed and black all-terrain tires |
| Crestline Eight | Black touring saloon with whitewall wire wheels and a three-window passenger cabin |
| Skipper | Single-bow boat racer with exposed steering wheels, a raised pilothouse and a stern outboard |
| Geep | Two-seat camo rally buggy with baseline handling |
| Barrage | Open-cockpit armored supercar with baseline handling and twin pulse blasters |
| Manta Speedster | Single-seat pearl speedster with recessed cyan headlights and baseline handling |
| Hexshift | Plum-and-ivory lunar roadster with baseline handling |
| Shopping Cart | Chrome wire basket with a red folding seat, four casters, and Apex handling |

The garage displays each chassis’s changes relative to Apex. All four drivers can race any chassis. Character choice is cosmetic. The D-pad moves focus, A / Cross selects, Menu / Options advances, and B / Circle goes back.

## Controls

| Action | Keyboard | CTR Classic (Xbox / PlayStation) | Trigger Drive |
| --- | --- | --- | --- |
| Accelerate / brake | W / S or Up / Down | A / Cross to accelerate, X / Square to brake | RT / LT |
| Steer | A / D or Left / Right | Left stick or D-pad | Left stick |
| Hop / drift | Q | RB / R1 | LB / L1 |
| Activate drift boost | E | Left stick click / L3 | RB / R1 |
| Reverse at low speed | Hold S / Down | Pull the left stick back | Pull the left stick back |
| Use item | Space | B / Circle | A / Cross |
| Fire Barrage blasters (hold, Quick Race or Test Drive) | F | D-pad up | D-pad up |
| Previous / next test item | Z / X (or I for next) | LB / View (L1 / Share) | D-pad left / right |
| Select test item directly | 1–0 for slots 1–10, Shift + 1–0 for slots 11–20 | — | — |
| Change camera distance / hold rear view | C / V | LT / RT (L2 / R2) | Left / right stick click |
| Pause | Esc or P | Menu / Options | Menu / Options |
| Send feedback | N twice | — | — |
| Toggle minimap | M | Y / Triangle | — |
| Restart section or race | R | Pause menu | Y / Triangle |

Press N twice within a moment to send feedback. One N does nothing. N is ignored while you are typing in a text field or while Controller setup is waiting for a button, and the race does not treat N as a driving key. The window pauses the race, including gamepad steering, until it closes. Sending needs a signed-in visit from the hub. Opened on its own, the game shows a one-line message instead. The pad does not open the window: every gamepad button is already a driving or menu control.

On the grid, press the accelerator late enough to reach the launch window as the light turns green. In a corner, steer and hold the drift button through the hop. The steering direction sets the slide. Countersteer to open the arc. Keep holding drift and tap the boost control when the meter reaches the marked zone. The **Drift Boost** button under the meter also accepts a click or tap. A charge of 70% earns Good, and 90% earns Perfect. Press again in each new window to chain up to three boosts in one slide. You can also release drift in the window and quickly hold it again to continue the chain.

Hold the accelerator down the straight to build extra speed. Small steering corrections keep it building. Turning hard, lifting, or braking lets the extra speed taper off. On level pavement the Apex can reach about 232 km/h on throttle alone.

Brake before a tight corner, then ease off the brake as you steer toward the apex. Heavy braking and loose shoulders both reduce cornering grip. The kart turns tightly at low speed and runs a wider arc under boost. A short steering tap adjusts your line, while holding the input builds toward full lock. Countersteer to open a drift exit, especially before reversing direction in a chicane.

With the wheel centered in normal driving, your kart keeps its heading. Steer into bends or you will run wide into the outside rail. Six exposed edges have yellow-and-black curb stripes and a **DROP** sign on approach. Test Track 01 has openings on the Uphill Drift Spiral and Banked Dish, Crestline Ridge on Summit Approach and Gravity Chute, and Switchyard GP on Freight Hairpin and Transfer Siding. If you go over, you lose your boost and return to the center of the road just before the opening. The race clock keeps running.

Karts can bump each other in Quick Race and Test Drive. A rear-end hit transfers speed to the kart ahead. Side contact pushes the karts apart along their racing lines, including during a drift. A high jump can clear another kart, and strong contact gives a short thump and suspension kick.

Steer into the slide to tighten it and countersteer to push the exit wider. The kart carries some of its slide angle as the rear wheels regain grip. Every Good adds 0.8 seconds of boost and every Perfect adds 1.2 seconds, in any position in the combo. Any mix of grades counts. A mistimed press breaks the combo. The timer counts down as you drive, and boost items add their full duration to the remaining time. For a tight airborne turn, lift the accelerator and brake while steering. Pulling back on the stick tightens the rotation. Kart bumps preserve boost reserve and streaks for both racers. A rail impact or obstacle strike empties the reserve and ends the boost chain. A hard rail hit also ends the slide.

A rival's damaging hit makes your kart lose speed and roll. Steering, throttle, and item use return after 0.9 seconds. A hit breaks your drift chain and clears boost. Hop twice to shake off an attached Pop-Up Box before it pops. Bubble Wrap absorbs one hit and disappears immediately, preserving your speed and drift. An unused shield lasts six seconds.

In Test Drive all twenty unlimited items are available simultaneously. Cycle through them while driving, use a keyboard shortcut, or click a numbered HUD slot. Fire with the separate item button. Switching preserves kart motion, drift progress, deployed effects, and remaining Triple Soda charges.

**Controller setup** offers CTR Classic, Trigger Drive, individual button/axis remapping, steering inversion, and deadzone adjustment. Existing saved layouts keep their trigger and item bindings. Settings and the best ghost live in the current browser.

## Items

Quick Race uses the same pickup odds for drivers and AI. Leaders get more traps and defensive items. Each position farther back improves the odds of pursuit items and stronger boosts, with some extra help across a large gap. The HUD cycles through item icons for 1.5 seconds of race time, then reveals the item. Press Use after the reveal to fire it. Triple Soda takes three presses to empty.

Firing a targeting item spends it even if there is no eligible rival. Homing Cursor and Relay Rocket fire unguided without a lock. Tow Cable and Soda Siphon miss and give no boost. Test Drive keeps its unlimited supply.

| Slot | Item | Use | Slot | Item | Use |
| --- | --- | --- | --- | --- | --- |
| 1 | Soda Turbo | Gain a short boost. | 11 | Ricochet Disc | Skim forward or backward and bounce off up to three rails. |
| 2 | Bumper Ball | Roll a ball forward or backward. It can intercept traps and incoming homing shots. | 12 | Confetti Fan | Fire three bolts in a spread. Each rival can take one hit per volley. |
| 3 | Bubble Wrap | Block one hit within six seconds. | 13 | Jelly Lob | Throw an arcing pod that bursts on impact or landing, hitting rivals within seven metres. |
| 4 | Sticky Blob | Drop a slippery patch for the next rival. | 14 | Return Ring | Tag rivals on the outward and return legs, once per rival. |
| 5 | Pop-Up Box | Leave a box that attaches to a rival and pops unless shaken off. | 15 | Static Puck | Drop a proximity trap. It arms after 0.45 seconds and zaps nearby rivals. |
| 6 | Homing Cursor | Chase the nearest rival ahead within 125 metres. | 16 | Broom Bot | Sweep nearby hostile projectiles and traps for 2.8 seconds. |
| 7 | Bass Speaker | Emit a pulse that hits nearby rivals. | 17 | Spring Shoes | Jump from the road to clear low attacks. |
| 8 | Tow Cable | Hook a reachable rival ahead and gain speed while in range. | 18 | Soda Siphon | Steal up to 1.5 seconds of boost reserve from a charged rival ahead. |
| 9 | Triple Soda | Take three separately timed turbo bursts. | 19 | Relay Rocket | Pursue the frontmost rival within 240 metres ahead. The target receives a warning. |
| 10 | Express Lane | Lay four temporary boost strips usable by everyone. | 20 | Comet Candy | Gain 2.6 seconds of super turbo and a three-second, one-hit shield. |

Hold brake while firing the Bumper Ball, Ricochet Disc, or Confetti Fan to aim behind you. Both the ball and disc can clear hostile traps and intercept homing shots. Run the focused item checks with `node qa/projectiles.mjs`.
