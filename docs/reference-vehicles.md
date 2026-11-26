# Reference vehicle production roster

The original 14 car IDs are unchanged. The garage appends 36 concepts in the same order as the approved six boards. These are game meshes, not painted billboards. The reference driver established the shape of the cabin; the actual four Racer drivers remain selectable. All new vehicles roll or hover. Cranes, buckets, van awnings and mixer drums are rigid in their shown racing pose.

| Board | Reading order (top left to bottom right) |
|---|---|
| 01 · Track and Tarmac | Pepper Seed, Golden Switchback, Glass Dart, Whitewall Wasp, Violet Drift, Twin-Plug |
| 02 · All Terrain | Ringrunner, Windskiff, Arctic Skip, Bamboo Trike, Mud Marauder, Tarmac Press |
| 03 · Hover and Future Tech | Violet Orbit, Volt Fork, Twin Current, Rail Ghost, Solar Cushion, Sunny Sidecar |
| 04 · Paddock Oddballs | Market Dragster, Ramp Tug, Tiki Barrel, Ice-Cream Van, Groove Racer, Bumper Bolt |
| 05 · Heavy Hybrid and Fantasy | Bronze Bell, Reed Skimmer, Steam Sprint, Amber Beetle, Violet Marble, Bone Wyrm |
| 06 · Construction Crew | Quarry Dumper, Vermilion Loader, Sky Mixer, Boom Crane, Mint Digger, Forklift Rat |

## Implementation

- Each model declares one driver anchor and scale, rigid shape instructions, independent wheel axles (or an empty array for hover), and measured visual bounds. The body and wheels are baked per model and shared between garage, race and ghost instances.
- The visuals stay out of the deterministic server runtime. Run `node scripts/build-concept-roster.mjs` after editing the geometry specifications or vehicle metadata, then `npm run build:server-sim` if the pure roster or physics changed. The normal test command checks both generated outputs.
- The additions use base speed, acceleration and turn values. Differences in width, axle positions and body footprint are modeled, but the polygon is an approximation, not per-triangle physics. Legacy CPU selection order remains unchanged.
- In the garage, choose each vehicle's front and rear views, and check tall and wide helmets, glass cabins, and offset seats. In a race, check steering, drift and ground clearance. Especially check the Ringrunner's ring wheel, the hover clearance, the sidecar's asymmetric wheels, the forklift mast, and the longer/heavier silhouettes. Optional equipment isn't animated independently.
- `qa/concept-vehicles.test.js` verifies 144 actual vehicle/driver builds, transforms, visual envelopes and geometry budgets. `tests/concept-drive.test.js` exercises all 36 cars through the race simulator on all three courses and checks save/restore parity. A playable standalone browser test is separate from any Hub or real-controller acceptance.
