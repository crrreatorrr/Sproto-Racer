// Car classes. Each car joins one class; the class sets all five stats. Bars run 1–10 and every
// class totals the same 26, so a strength always costs something elsewhere. Bar 5 is the stock
// handling every car had before classes. The sim reads the derived multipliers off kart.tuning.

export const STAT_BUDGET = 26;

export const CAR_CLASSES = Object.freeze({
  allrounder: { name: 'All-rounder', bars: { speed: 5, accel: 5, turn: 5, boost: 5, luck: 6 } },
  speedster: { name: 'Speedster', bars: { speed: 6, accel: 3, turn: 5, boost: 6, luck: 6 } },
  sprinter: { name: 'Sprinter', bars: { speed: 5, accel: 9, turn: 6, boost: 3, luck: 3 } },
  drifter: { name: 'Drifter', bars: { speed: 5, accel: 4, turn: 9, boost: 5, luck: 3 } },
  booster: { name: 'Booster', bars: { speed: 5, accel: 5, turn: 4, boost: 9, luck: 3 } },
  lucky: { name: 'Lucky', bars: { speed: 6, accel: 6, turn: 5, boost: 3, luck: 6 } },
});

// What one stat step is worth, per unit of t = (bars - 5) / 5 (bar 10 is t = 1, bar 1 is t = -0.8).
export const STAT_SCALE = Object.freeze({
  speed: 0.03, // top speed, ground and Sky Lane
  accel: 0.30, // thrust
  turn: 0.22, // steering rate, lock and drift angle
  good: 0.08, // the GOOD drift window opens this much earlier
  perfect: 0.04, // the PERFECT drift window opens this much earlier
  gain: 0.15, // every boost grant lasts this much longer
  luckUp: 0.30, // item rolls as if this share of the pack further back
  luckDown: 0.10, // below bar 5, rolls as if slightly further ahead
});

const CLASS_GROUPS = {
  allrounder: ['apex', 'crestline', 'mud-marauder', 'amber-beetle', 'quarry-dumper', 'sky-mixer'],
  speedster: ['needle', 'ironhide', 'manta', 'track-formula', 'track-prototype', 'windskiff', 'rail-ghost', 'market-dragster'],
  sprinter: ['pogo', 'geep', 'shopping-cart', 'ringrunner', 'tarmac-press', 'ramp-tug', 'bumper-bolt', 'vermilion-loader', 'forklift-rat'],
  drifter: ['gecko', 'skipper', 'track-rally', 'track-drift', 'arctic-skip', 'twin-current', 'groove-racer', 'reed-skimmer', 'mint-digger'],
  booster: ['relay', 'barrage', 'track-hot-rod', 'track-electric', 'volt-fork', 'solar-cushion', 'steam-sprint', 'bone-wyrm'],
  lucky: ['hexshift', 'saucer', 'bamboo-trike', 'violet-orbit', 'sunny-sidecar', 'tiki-barrel', 'ice-cream-van', 'bronze-bell', 'violet-marble', 'boom-crane'],
};

/** Car id → class key. */
export const CLASS_OF = Object.freeze(Object.fromEntries(
  Object.entries(CLASS_GROUPS).flatMap(([key, ids]) => ids.map((id) => [id, key])),
));

/** The multipliers a class (or a bar set) gives the kart. */
export function classTuning(cls) {
  const bars = typeof cls === 'string' ? CAR_CLASSES[cls].bars : cls;
  const t = (stat) => (bars[stat] - 5) / 5;
  const luck = t('luck');
  return {
    speed: 1 + STAT_SCALE.speed * t('speed'),
    accel: 1 + STAT_SCALE.accel * t('accel'),
    turn: 1 + STAT_SCALE.turn * t('turn'),
    goodAt: 0.70 - STAT_SCALE.good * t('boost'),
    perfectAt: 0.90 - STAT_SCALE.perfect * t('boost'),
    boostGain: 1 + STAT_SCALE.gain * t('boost'),
    luckShift: luck < 0 ? STAT_SCALE.luckDown * luck : STAT_SCALE.luckUp * luck,
  };
}

/** A roster entry with its class, bars and tuning merged in. */
export function withClass(car) {
  const key = CLASS_OF[car.id] ?? 'allrounder';
  return { ...car, class: key, bars: CAR_CLASSES[key].bars, ...classTuning(key) };
}

export const STAT_TITLES = Object.freeze([
  ['speed', 'Speed'], ['accel', 'Acceleration'], ['turn', 'Turning'], ['boost', 'Boost'], ['luck', 'Luck'],
]);

/** The garage rows for a car: each stat's title and bar count (1–10). */
export function statBars(car) {
  return STAT_TITLES.map(([id, title]) => ({ id, title, bars: car.bars[id] }));
}

export function className(car) {
  return CAR_CLASSES[car.class]?.name ?? '';
}
