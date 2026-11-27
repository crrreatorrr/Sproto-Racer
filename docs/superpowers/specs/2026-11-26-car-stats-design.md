# Car stats: Speed, Acceleration, Turning, Boost and Luck

## Why
Choosing a car should feel like picking a character in a kart racer, with real tradeoffs. Every strength
costs something somewhere else, and no car is the best choice on every track.

Today, 45 of the 50 cars drive the same. The other 5 differ only a little: top speed by about 2%, and
acceleration and turning by up to 18%.

## Goals
- **Five stats per car.** Each is shown as 1–10 bars:
  - **Speed:** top speed.
  - **Acceleration:** how fast the car picks up speed.
  - **Turning:** steering and drift angles.
  - **Boost:** wider GOOD and PERFECT drift windows, and more time from every kind of boost.
  - **Luck:** better items from item boxes.
- **Balanced by construction:** every class's bars add up to the same total (26), and AI races check
  that no class wins overall.
- **Differences you can feel:** bar 1 and bar 10 should make a lap play differently.
- **Rivals use the same stats.** The stats work the same in single player and in multiplayer.

## Non-goals and anti-goals
- **No weight or bump-strength stat.** It was not asked for, so collisions stay as they are.
- **No stat upgrades or tuning menus.** A car's stats are fixed.
- **Anti-goal: a strictly best car,** or a class that wins on every circuit.
- **Anti-goal: a Relic-locked car stronger than a free one.** Stats come from the class, and unlocking
  a car never changes its class.
- **Anti-goal: drivers affecting stats.** Drivers stay cosmetic.

## Approaches
- **A. Car classes. Chosen by Ken.**
  - There are six classes, and each car joins the class that fits its look.
  - It is easy to learn, and only six stat lines need balancing.
  - Two cars in the same class differ only in looks.
- **B. A unique stat line for every car. Rejected.**
  - It would give more variety.
  - But 50 lines are hard to keep fair, and many cars would end up one bar apart, which players can't feel.

**How it's built.** There is one sensible way. Each kart already carries a `tuning` object with `speed`,
`accel` and `turn` multipliers, and it already flows into:
- driving (`driving.js`, `steering.js`);
- the multiplayer sim and its snapshots;
- the server's car table (`sim/server-entry.js`).

The work adds `boost` and `luck` to `tuning` and derives the whole object from the car's class, so the
single-player and multiplayer loops cannot drift apart.

## Classes (bars, base car = 5)

| Class | Speed | Accel | Turning | Boost | Luck | Plays like |
|---|---|---|---|---|---|---|
| All-rounder | 5 | 5 | 5 | 5 | 6 | Today's handling, nothing to learn |
| Speedster | 6 | 3 | 5 | 6 | 6 | Wins on straights, punished by hits and tight sectors |
| Sprinter | 5 | 9 | 6 | 3 | 3 | Recovers instantly from hits and slow corners |
| Drifter | 5 | 4 | 9 | 5 | 3 | Tightest lines and longest drift chains |
| Booster | 5 | 5 | 4 | 9 | 3 | Easy PERFECTs, longer boosts everywhere, wide in corners |
| Lucky | 6 | 6 | 5 | 3 | 6 | Better item rolls in any position, slower on its own |

The bar values are a starting point. Balance testing (below) can move a bar, but each class's total
stays at 26.

## What a bar does
Each stat maps to a multiplier. Write `t = (bars − 5) / 5`: bar 1 gives t = −0.8, bar 5 gives 0 (today's
handling) and bar 10 gives +1. These ranges are where tuning starts.

- **Speed:** top speed × `1 + 0.03·t`, from −2.4% to +3%. Balance testing lowered this from 0.04, because a Speed bar was worth far more lap time than any other bar.
  - It also scales Sky Lane flight speed, which already multiplies by `tuning.speed`.
- **Acceleration:** thrust × `1 + 0.30·t`.
- **Turning:** steering rate and lock × `1 + 0.22·t`.
  - Drift slide angles follow, because they use the same `tuning.turn`.
  - The range is capped at whatever passes `qa/steering-edges.mjs` on every chassis. The steering
    geometry has its limits.
- **Boost:**
  - **Drift windows:** today the meter fills in 1 s. The GOOD window opens at 0.70 and the PERFECT
    window at 0.90, and TOO LATE comes at 1.0.
    - The GOOD window opens at `0.70 − 0.08·t`. At bar 10 that is 0.62, giving a 0.38 s window; at bar 1
      it is 0.764, giving 0.236 s.
    - The PERFECT window opens at `0.90 − 0.04·t`. At bar 10 that is 0.86, giving 0.14 s; at bar 1 it is
      0.932, giving 0.068 s.
    - TOO LATE stays at 1.0.
  - **Boost time:** every boost grant × `1 + 0.15·t`. That covers drift GOOD and PERFECT, launch, air,
    tricks, pads, boost items (Soda Turbo, Triple Soda, Comet Candy, Express Lane strips) and Sky Lane
    Boost Cells.
  - **Not scaled:**
    - boost stolen with Soda Siphon, so it isn't inflated twice;
    - the Test Drive entry boost, which is a test setting.
- **Luck:** item rolls are already weighted by `trailing`, which runs from 0 for the leader to 1 for
  last place.
  - Luck shifts it: `trailing + (t < 0 ? 0.10·t : 0.30·t)`, clamped to 0–1.
  - At bar 10 a car rolls as if it were about 30% of the pack further back. At bar 1 it rolls slightly
    as if it were further ahead.
  - The roll stays deterministic and uses the world RNG as it does today.

## Rivals
- Rivals already drive the 14 original cars, and those cover all six classes, so a race gets a mixed
  pack.
- AI drift release currently uses fixed meter targets: `0.77 + (id % 3) · 0.066`. They will be placed
  relative to the car's own GOOD and PERFECT windows, so a rival's Boost stat matters too.

## Garage
The garage swaps the "Relative to Apex" percentages for a class name and five bar rows:

```
SPEEDSTER
Speed         ■■■■■■■■■□
Acceleration  ■■■□□□□□□□
Turning       ■■■■□□□□□□
Boost         ■■■■■■□□□□
Luck          ■■■■□□□□□□
```

The car list can show the class under each car's name, replacing today's "role" line or alongside it.

## Records
Stats change lap pace, so `TRIAL_LAYOUT` goes to 3 and Time Trial records reset once more (Ken has said
records don't matter).

## Balance testing
A new `qa/car-classes.mjs` runs AI-only races in the deterministic sim on all three circuits, with
several seeds. Every rival drives the same class, and there are also mixed packs. For each class it
reports:
- the mean finish time;
- the win share in mixed packs;
- the GOOD and PERFECT rate;
- the item quality it rolled.

**Targets:**
- Every class's mean finish time is within about 1.5% of the others.
- In mixed packs, no class wins more than about 30% of races.
- No class is the fastest on every circuit.

Bars are adjusted, keeping each total at 26, until the targets hold.

## Tests
- Each class's bars total 26.
- Every car in the roster has a class.
- The tuning that comes out matches the bar formulas.
- The drift windows widen with Boost, and a release at the edge of a window grades correctly.
- Boost time scales on drift, pads, items and Cells, but not on Siphon.
- Luck shifts the item weights in the right direction, and the roll stays deterministic.
- Multiplayer: the state hash and snapshot round-trip include the new tuning fields, and
  `npm run build:server-sim` is regenerated.
- The existing determinism, steering QA and Sky Lane tests stay green.

## Left to the builder
- Where the class table lives. The proposal is a new `src/car-classes.js`, keyed by car id. That keeps
  the generated `concept-roster.js` untouched.
- The exact coefficients within the ranges above, as balance testing settles them.
- How the boost multiplier reaches `grantBoost`. The proposal is a `gain` field on the boost state, set
  from the car when the actor is created.
- The styling of the bars in the garage.

## Car assignments (50 cars)
- **All-rounder:** Apex, Crestline Eight, Mud Marauder, Amber Beetle, Quarry Dumper, Sky Mixer.
- **Speedster:** Needle, Ironhide, Manta Speedster, Pepper Seed, Glass Dart, Windskiff, Rail Ghost,
  Market Dragster.
- **Sprinter:** Pogo, Geep, Shopping Cart, Ringrunner, Tarmac Press, Ramp Tug, Bumper Bolt, Vermilion
  Loader, Forklift Rat.
- **Drifter:** Gecko, Skipper, Golden Switchback, Violet Drift, Arctic Skip, Twin Current, Groove Racer,
  Reed Skimmer, Mint Digger.
- **Booster:** Relay, Barrage, Whitewall Wasp, Twin-Plug, Volt Fork, Solar Cushion, Steam Sprint, Bone
  Wyrm.
- **Lucky:** Hexshift, Silver Saucer, Bamboo Trike, Violet Orbit, Sunny Sidecar, Tiki Barrel, Ice-Cream
  Van, Bronze Bell, Violet Marble, Boom Crane.

The 14 rival cars are Apex, Needle, Pogo, Gecko, Relay, Geep, Hexshift, Barrage, Ironhide, Crestline
Eight, Manta Speedster, Silver Saucer, Shopping Cart and Skipper. Between them they cover all six
classes.
