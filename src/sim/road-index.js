// Things at fixed places along the road (item pickups, boost pads), sorted by road distance.
//
// A circuit carries a few hundred of them and a kart moves a metre or so per tick, so testing
// every one against every kart every tick is nearly all wasted work. The index answers "which
// items lie in this stretch of road ahead of here?" with a binary search.
//
// It is only ever a first filter. Callers run their original exact test on what comes back, in
// the original array order, so results are identical to a full scan: the stretch is widened by a
// margin far larger than any floating-point rounding in those tests, so nothing they would have
// accepted is ever left out.

import { mod } from './math.js';

export function createRoadIndex(items, length) {
  const list = items || [];
  const order = [];
  for (let i = 0; i < list.length; i++) order.push(i);
  const usable = length > 0 && list.every((item) => item.s === item.s);
  const keys = usable ? list.map((item) => mod(item.s, length)) : [];
  if (usable) order.sort((a, b) => keys[a] - keys[b] || a - b);
  const sortedKeys = order.map((i) => keys[i]);
  return { count: list.length, length, usable, keys: sortedKeys, order, found: [] };
}

function lowerBound(keys, value) {
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (keys[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function take(index, from, to, n) {
  const { keys, order, found } = index;
  for (let i = lowerBound(keys, from); i < keys.length && keys[i] <= to; i++) found[n++] = order[i];
  return n;
}

/**
 * Fills `index.found` with the array positions of every item between `from` and `from + span`
 * metres along the road (wrapping at the finish line), in ascending array order, and returns how
 * many there are. `from` may be negative (the starting grid) or many laps in.
 */
export function itemsAhead(index, from, span) {
  const found = index.found;
  const length = index.length;
  // Rounding in the callers' wrap arithmetic is a few units in the last place of the distances
  // involved. This margin is about a million times that.
  const margin = 1e-9 * Math.max(1, length, Math.abs(from));
  let n = 0;
  if (!index.usable || !(span + 2 * margin < length) || from !== from) {
    for (let i = 0; i < index.count; i++) found[i] = i;
    return index.count;
  }
  const lo = mod(from, length) - margin;
  const hi = lo + span + 2 * margin;
  if (lo < 0) {
    n = take(index, 0, hi, n);
    n = take(index, lo + length, length, n);
  } else if (hi >= length) {
    n = take(index, 0, hi - length, n);
    n = take(index, lo, length, n);
  } else {
    n = take(index, lo, hi, n);
  }
  // Callers depend on array order (the first matching pickup wins). Sorting by road distance
  // usually gives it already; a short insertion sort covers the rows that share a distance.
  for (let i = 1; i < n; i++) {
    const v = found[i];
    let j = i - 1;
    while (j >= 0 && found[j] > v) {
      found[j + 1] = found[j];
      j--;
    }
    found[j + 1] = v;
  }
  return n;
}
