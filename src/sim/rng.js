// Deterministic 32-bit sfc32 PRNG with snapshotable state.
// Integer bitwise operations only; identical across V8, SpiderMonkey, JSC, and Goja.

function splitmix32(seed) {
  let s = seed >>> 0;
  return function nextSeed() {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export function createRng(seed = 1) {
  const init = splitmix32(seed >>> 0);
  let a = init();
  let b = init();
  let c = init();
  let d = init();
  // Warm up 12 rounds so initial state is thoroughly mixed.
  for (let i = 0; i < 12; i++) step();

  function step() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = ((c << 21) | (c >>> 11));
    c = (c + t) | 0;
    return t >>> 0;
  }

  return {
    nextUint32: step,
    nextFloat() {
      return step() / 4294967296;
    },
    nextInt(max) {
      const m = max >>> 0;
      if (m <= 1) return 0;
      return step() % m;
    },
    getState() {
      return [a >>> 0, b >>> 0, c >>> 0, d >>> 0];
    },
    setState(state) {
      if (!Array.isArray(state) || state.length !== 4) return;
      a = state[0] >>> 0;
      b = state[1] >>> 0;
      c = state[2] >>> 0;
      d = state[3] >>> 0;
    },
    clone() {
      const copy = createRng(1);
      copy.setState([a, b, c, d]);
      return copy;
    },
  };
}
