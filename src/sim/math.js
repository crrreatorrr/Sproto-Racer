// Deterministic IEEE-754 floating-point math for simulation and server replay.
// Uses ONLY basic IEEE-754 operations (+, -, *, /, Math.sqrt, Math.floor, Math.abs,
// Math.min, Math.max), which round identically across V8, SpiderMonkey, JSC, and Nakama Goja.

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;
const INV_PIO2 = 0.6366197723675814; // 2 / pi
// Cody-Waite 2-part split of pi/2 (53-bit split: PIO2_HI has 30 trailing zero mantissa bits)
const PIO2_HI = 1.5707963267341256;
const PIO2_LO = 6.077100506506192e-11;

const S1 = -0.16666666666666666;      // -1/3!
const S2 = 0.008333333333333333;      //  1/5!
const S3 = -0.0001984126984126984;    // -1/7!
const S4 = 2.7557319223985893e-6;     //  1/9!
const S5 = -2.505210838544172e-8;     // -1/11!
const S6 = 1.6059043836821613e-10;    //  1/13!
const S7 = -7.647163731819816e-13;    // -1/15!

const C1 = -0.5;                      // -1/2!
const C2 = 0.041666666666666664;      //  1/4!
const C3 = -0.001388888888888889;     // -1/6!
const C4 = 0.0000248015873015873;     //  1/8!
const C5 = -2.7557319223985893e-7;    // -1/10!
const C6 = 2.08767569878681e-9;       //  1/12!
const C7 = -1.1470745597729725e-11;   // -1/14!
const C8 = 4.779477332387385e-14;     //  1/16!

function sinReduced(r) {
  const r2 = r * r;
  return r + r * r2 * (S1 + r2 * (S2 + r2 * (S3 + r2 * (S4 + r2 * (S5 + r2 * (S6 + r2 * S7))))));
}

function cosReduced(r) {
  const r2 = r * r;
  return 1 + r2 * (C1 + r2 * (C2 + r2 * (C3 + r2 * (C4 + r2 * (C5 + r2 * (C6 + r2 * (C7 + r2 * C8)))))));
}

export function sin(x) {
  if (x === 0 || x !== x) return x;
  const k = Math.floor(x * INV_PIO2 + 0.5);
  const r = (x - k * PIO2_HI) - k * PIO2_LO;
  const q = ((k % 4) + 4) % 4;
  if (q === 0) return sinReduced(r);
  if (q === 1) return cosReduced(r);
  if (q === 2) return -sinReduced(r);
  return -cosReduced(r);
}

export function cos(x) {
  if (x !== x) return x;
  if (x === 0) return 1;
  const k = Math.floor(x * INV_PIO2 + 0.5);
  const r = (x - k * PIO2_HI) - k * PIO2_LO;
  const q = ((k % 4) + 4) % 4;
  if (q === 0) return cosReduced(r);
  if (q === 1) return -sinReduced(r);
  if (q === 2) return -cosReduced(r);
  return sinReduced(r);
}

export function tan(x) {
  return sin(x) / cos(x);
}

// 2 - sqrt(3) = tan(pi / 12)
const TAN_PIO12 = 0.2679491924311227;
const SQRT3 = 1.7320508075688772;
const PIO6_HI = 0.5235987755982988;
const PIO6_LO = 3.061616997868383e-17;

export function atan(x) {
  if (x === 0 || x !== x) return x;
  const sign = x < 0 ? -1 : 1;
  let u = Math.abs(x);
  let complement = false;
  if (u > 1) {
    u = 1 / u;
    complement = true;
  }
  let reduced = false;
  if (u > TAN_PIO12) {
    u = (u * SQRT3 - 1) / (SQRT3 + u);
    reduced = true;
  }
  const u2 = u * u;
  // Alternating odd-reciprocal Horner polynomial on |u| <= 0.26795 (error < 2e-16)
  let poly = u * (1 + u2 * (
    -1 / 3 + u2 * (
      1 / 5 + u2 * (
        -1 / 7 + u2 * (
          1 / 9 + u2 * (
            -1 / 11 + u2 * (
              1 / 13 + u2 * (
                -1 / 15 + u2 * (
                  1 / 17 + u2 * (
                    -1 / 19 + u2 * (
                      1 / 21 + u2 * (-1 / 23 + u2 * (1 / 25))
                    )
                  )
                )
              )
            )
          )
        )
      )
    )
  ));
  if (reduced) poly = (poly + PIO6_LO) + PIO6_HI;
  if (complement) poly = HALF_PI - poly;
  return sign * poly;
}

export function atan2(y, x) {
  if (y !== y || x !== x) return NaN;
  if (x > 0) return atan(y / x);
  if (x < 0) {
    const base = atan(y / x);
    return y >= 0 ? base + PI : base - PI;
  }
  if (y > 0) return HALF_PI;
  if (y < 0) return -HALF_PI;
  return 0;
}

const LOG2E = 1.4426950408889634;
const LN2_HI = 0.6931471803691238;
const LN2_LO = 1.9082149292705877e-10;

function pow2Int(k) {
  let out = 1;
  let step = k >= 0 ? 2 : 0.5;
  let n = k >= 0 ? k : -k;
  while (n > 0) {
    if (n & 1) out *= step;
    n >>= 1;
    if (n > 0) step *= step;
  }
  return out;
}

export function exp(x) {
  if (x !== x) return NaN;
  if (x === 0) return 1;
  if (x <= -709) return 0;
  if (x >= 709) return Infinity;
  const k = Math.floor(x * LOG2E + 0.5);
  const r = (x - k * LN2_HI) - k * LN2_LO;
  // Horner evaluation of sum_{n=0}^{13} r^n / n! on |r| <= 0.3466
  const er = 1 + r * (1 + r * (
    0.5 + r * (
      1 / 6 + r * (
        1 / 24 + r * (
          1 / 120 + r * (
            1 / 720 + r * (
              1 / 5040 + r * (
                1 / 40320 + r * (
                  1 / 362880 + r * (
                    1 / 3628800 + r * (
                      1 / 39916800 + r * (1 / 479001600 + r * (1 / 6227020800))
                    )
                  )
                )
              )
            )
          )
        )
      )
    )
  ));
  return er * pow2Int(k);
}

export function hypot(x, y) {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const hi = ax > ay ? ax : ay;
  if (hi === 0) return 0;
  const lo = (ax > ay ? ay : ax) / hi;
  return hi * Math.sqrt(1 + lo * lo);
}

export function hypot3(x, y, z) {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  const hi = Math.max(ax, ay, az);
  if (hi === 0) return 0;
  const rx = ax / hi;
  const ry = ay / hi;
  const rz = az / hi;
  return hi * Math.sqrt(rx * rx + ry * ry + rz * rz);
}

export function sq(x) {
  return x * x;
}

export function pow4(x) {
  const x2 = x * x;
  return x2 * x2;
}

export function wrapAngle(angle) {
  let a = angle % TAU;
  if (a > PI) a -= TAU;
  else if (a <= -PI) a += TAU;
  return a;
}

export function lerpAngle(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const mod = (n, m) => ((n % m) + m) % m;
export const mix = (a, b, t) => a + (b - a) * t;
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
export function damp(x, y, lambda, dt) {
  return mix(x, y, 1 - exp(-lambda * dt));
}
