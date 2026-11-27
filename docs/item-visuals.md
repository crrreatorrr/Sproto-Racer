# Item, projectile, and hit art

The visual pass covers all 20 inventory items, the world mystery crates, and both extra projectile models (the confetti bolt and Barrage pulse bolt). It does not change physics, item weights, steering, hit volumes, timing, shield rules or boost power.

- HUD tiles use a 5×4 960×768 WebP (lossy colour at quality 75, alpha within 2/255; about 96 KB), in the canonical order in `src/items.js`. Full tile padding protects against atlas bleed at small HUD sizes.
- Reusable model, flight, trap and tether art distinguishes homing shots, rolling balls, ricochets, candy, jelly, and high-speed turbo. Item crate motion varies with availability, cooldown and reappear; it remains one instanced draw and only updates pickup data when availability is dirty.
- Optional presentation cues mark confirmed use, miss, hit, shield block, blast, rail bounce, clearing, collision and pickup. The client maps these to separate palettes and particle shapes; a local hit/block also gets a small status badge. Instanced bursts are capped and reset on track/restart. Reduced motion removes flashes and flying impact particles but retains status and rings.
- The visual cue observer does not enter serialized simulation state. Because the shared source changed, the byte-version of the server bundle was regenerated. The old/new content manifest and checked state hashes match.
- QA: `qa/item-cues.test.js` verifies all 20 uses against the unobserved simulation, normal and guarded impacts for all projectile/trap families, failed locks, ricochet position, bounded FX, and reduced-motion/reset behavior. Legacy projectile and controller inputs remain available in Test Drive.

Regenerate the item icons without changing the order (Blender 4.x and Python/Pillow):

```sh
blender -b -t 4 -P scripts/art/render-item-atlas.py -- /tmp/sproto-item-renders
python3 scripts/art/pack-item-atlas.py /tmp/sproto-item-renders src/items.js src/assets/item-icons.webp
```
