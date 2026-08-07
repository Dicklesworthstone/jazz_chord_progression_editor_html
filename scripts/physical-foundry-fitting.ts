/**
 * PHS1 offline foundry: deterministic parameter-fitting stack.
 *
 * Facilities ported from /dp/frankensim at commit
 * b47259187a31b704f8f0faf6abdf49b32919b96a, retrieved 2026-08-06, each with
 * its own provenance block below. Distributed under this repository's MIT
 * License with the OpenAI/Anthropic Rider, per the owner's recorded license
 * decision (docs/PHS1_FRANKENSIM_EXTRACTION_MAP.md section 5).
 *
 * Foundry laws: offline only (never shipped in the browser artifact); every
 * entry point refuses invalid shapes by returning null/false/finding instead
 * of throwing across the boundary; all randomness flows through the seeded
 * in-module stream (no Math.random); deterministic per seed.
 *
 * CMA-ES is deliberately NOT ported. Trigger for porting it: the first
 * ragged-landscape fit that Nelder-Mead, L-BFGS, and NSGA-II demonstrably
 * cannot handle (record the failing fit as evidence on the port bead).
 */

/* ------------------------------------------------------------------ */
/* Deterministic stream                                                 */
/* ------------------------------------------------------------------ */

/**
 * Local modification shared by the NSGA-II port: frankensim's fs-rand is a
 * Philox counter stream; bit-compatibility with it is not a foundry
 * requirement, so this module uses a splitmix64 stream instead. Determinism
 * per seed within this module is the contract. `nextBelow` uses the
 * floor-multiply reduction (documented bias is negligible at population
 * scale and irrelevant to determinism).
 */
/** Low 64 bits of (aHi:aLo) * (bHi:bLo), via 16-bit limbs; returns [hi, lo]. */
function mul64(
  aHi: number,
  aLo: number,
  bHi: number,
  bLo: number,
): [number, number] {
  const a0 = aLo & 0xffff;
  const a1 = aLo >>> 16;
  const a2 = aHi & 0xffff;
  const a3 = aHi >>> 16;
  const b0 = bLo & 0xffff;
  const b1 = bLo >>> 16;
  const b2 = bHi & 0xffff;
  const b3 = bHi >>> 16;
  // Carries can exceed 2^32, where `>>> 16` would first truncate mod 2^32;
  // Math.floor division keeps them exact (all sums stay far below 2^53).
  let c0 = a0 * b0;
  let c1 = Math.floor(c0 / 65536) + a0 * b1 + a1 * b0;
  c0 &= 0xffff;
  let c2 = Math.floor(c1 / 65536) + a0 * b2 + a1 * b1 + a2 * b0;
  c1 &= 0xffff;
  let c3 = Math.floor(c2 / 65536) + a0 * b3 + a1 * b2 + a2 * b1 + a3 * b0;
  c2 &= 0xffff;
  c3 &= 0xffff;
  return [((c3 << 16) | c2) >>> 0, ((c1 << 16) | c0) >>> 0];
}

export class FoundryStream {
  /**
   * splitmix64 state as two 32-bit words. The BigInt formulation this
   * replaces allocated on every draw and dominated NSGA-II profiles
   * (~16% self + GC); the limb arithmetic below produces bit-identical
   * u64 outputs for every seed (same recurrence, same mixing constants,
   * exact mod-2^64 multiplication via 16-bit limbs). BigInt remains only
   * in the cold constructor to reproduce the original signed-seed law.
   */
  private hi: number;
  private lo: number;

  constructor(seed: number) {
    const state = BigInt.asUintN(64, BigInt(Math.trunc(seed)) ^ 0x9e3779b97f4a7c15n);
    this.hi = Number(state >> 32n) >>> 0;
    this.lo = Number(state & 0xffffffffn) >>> 0;
  }

  /** One splitmix64 output as [hi32, lo32]. */
  private nextPair(): [number, number] {
    // state += 0x9e3779b97f4a7c15
    let lo = (this.lo + 0x7f4a7c15) >>> 0;
    let hi = (this.hi + 0x9e3779b9 + (lo < this.lo ? 1 : 0)) >>> 0;
    this.hi = hi;
    this.lo = lo;
    // z ^= z >> 30; z *= 0xbf58476d1ce4e5b9
    let xLo = (lo ^ ((hi << 2) | (lo >>> 30))) >>> 0;
    let xHi = (hi ^ (hi >>> 30)) >>> 0;
    [hi, lo] = mul64(xHi, xLo, 0xbf58476d, 0x1ce4e5b9);
    // z ^= z >> 27; z *= 0x94d049bb133111eb
    xLo = (lo ^ ((hi << 5) | (lo >>> 27))) >>> 0;
    xHi = (hi ^ (hi >>> 27)) >>> 0;
    [hi, lo] = mul64(xHi, xLo, 0x94d049bb, 0x133111eb);
    // z ^= z >> 31
    xLo = (lo ^ ((hi << 1) | (lo >>> 31))) >>> 0;
    xHi = (hi ^ (hi >>> 31)) >>> 0;
    return [xHi, xLo];
  }

  nextU64(): bigint {
    const [hi, lo] = this.nextPair();
    return (BigInt(hi) << 32n) | BigInt(lo);
  }

  /** Uniform in [0, 1) with 53-bit resolution (top 53 bits, exactly). */
  nextF64(): number {
    const [hi, lo] = this.nextPair();
    // (u64 >> 11) / 2^53 == (hi * 2^21 + (lo >>> 11)) / 2^53, exactly.
    return (hi * 2097152 + (lo >>> 11)) / 9007199254740992;
  }

  /** Uniform integer in [0, n). */
  nextBelow(n: number): number {
    return Math.min(n - 1, Math.floor(this.nextF64() * n));
  }
}

function allFinite(values: readonly number[]): boolean {
  return values.every((value) => Number.isFinite(value));
}

/* ------------------------------------------------------------------ */
/* 1. Nelder-Mead                                                      */
/* ------------------------------------------------------------------ */

/**
 * Provenance: /dp/frankensim/crates/fs-dfo/src/neldermead.rs
 * source SHA-256 04daa455b79fa9bf6f398fa0539873a0a445d7107bf8685f317346421fb0b19e.
 * Near-verbatim port: standard reflection/expansion/contraction/shrink
 * coefficients (1, 2, 0.5, 0.5), deterministic vertex ordering (total order
 * on values, lowest index on ties), identical termination laws (f_target
 * early stop, max_evals budget). Local modifications: refusal (null) instead
 * of the source's structured panic on empty dimension, and refusal on
 * non-finite inputs.
 */
export type NelderMeadResult = Readonly<{
  x: readonly number[];
  f: number;
  evals: number;
}>;

export function nelderMead(
  f: (x: readonly number[]) => number,
  x0: readonly number[],
  h: number,
  maxEvals: number,
  fTarget: number,
): NelderMeadResult | null {
  const n = x0.length;
  if (n < 1 || !allFinite(x0) || !Number.isFinite(h) || h === 0) return null;
  if (!Number.isSafeInteger(maxEvals) || maxEvals < n + 1) return null;
  if (Number.isNaN(fTarget)) return null;
  const alpha = 1.0;
  const gamma = 2.0;
  const rho = 0.5;
  const sigma = 0.5;
  const xs: number[][] = [[...x0]];
  for (let i = 0; i < n; i += 1) {
    const vertex = [...x0];
    vertex[i] = (vertex[i] ?? 0) + h;
    xs.push(vertex);
  }
  const fs: number[] = xs.map((x) => f(x));
  let evals = n + 1;
  const blend = (a: readonly number[], b: readonly number[], t: number): number[] =>
    a.map((p, i) => p + t * ((b[i] ?? 0) - p));
  // Hoisted per-iteration scratch: the index array is re-sorted in place
  // (identical comparator and tie-break) and the centroid is re-zeroed;
  // pure allocation removal, values and ordering unchanged.
  const idx = Array.from({ length: n + 1 }, (_, k) => k);
  const centroid = new Array<number>(n).fill(0);
  while (evals < maxEvals) {
    for (let k = 0; k <= n; k += 1) idx[k] = k;
    idx.sort((a, b) => {
      const fa = fs[a] ?? Number.POSITIVE_INFINITY;
      const fb = fs[b] ?? Number.POSITIVE_INFINITY;
      if (fa < fb) return -1;
      if (fa > fb) return 1;
      return a - b;
    });
    const best = idx[0] ?? 0;
    const worst = idx[n] ?? 0;
    const secondWorst = idx[n - 1] ?? 0;
    if ((fs[best] ?? Number.POSITIVE_INFINITY) <= fTarget) break;
    centroid.fill(0);
    for (let k = 0; k < n; k += 1) {
      const vertex = xs[idx[k] ?? 0] ?? [];
      for (let i = 0; i < n; i += 1) {
        centroid[i] = (centroid[i] ?? 0) + (vertex[i] ?? 0) / n;
      }
    }
    const worstVertex = xs[worst] ?? [];
    const xr = blend(centroid, worstVertex, -alpha);
    const fr = f(xr);
    evals += 1;
    if (fr < (fs[best] ?? Number.POSITIVE_INFINITY)) {
      const xe = blend(centroid, worstVertex, -gamma);
      const fe = f(xe);
      evals += 1;
      if (fe < fr) {
        xs[worst] = xe;
        fs[worst] = fe;
      } else {
        xs[worst] = xr;
        fs[worst] = fr;
      }
    } else if (fr < (fs[secondWorst] ?? Number.POSITIVE_INFINITY)) {
      xs[worst] = xr;
      fs[worst] = fr;
    } else {
      const inside = fr >= (fs[worst] ?? Number.POSITIVE_INFINITY);
      const xc = blend(centroid, worstVertex, inside ? rho : -rho);
      const fc = f(xc);
      evals += 1;
      if (fc < Math.min(fs[worst] ?? Number.POSITIVE_INFINITY, fr)) {
        xs[worst] = xc;
        fs[worst] = fc;
      } else {
        const xb = [...(xs[best] ?? [])];
        for (let k = 0; k <= n; k += 1) {
          if (k === best) continue;
          xs[k] = blend(xb, xs[k] ?? [], sigma);
          fs[k] = f(xs[k] ?? []);
          evals += 1;
        }
      }
    }
  }
  let bi = 0;
  for (let k = 1; k <= n; k += 1) {
    if ((fs[k] ?? Number.POSITIVE_INFINITY) < (fs[bi] ?? Number.POSITIVE_INFINITY)) bi = k;
  }
  return Object.freeze({
    x: Object.freeze([...(xs[bi] ?? [])]),
    f: fs[bi] ?? Number.POSITIVE_INFINITY,
    evals,
  });
}

/* ------------------------------------------------------------------ */
/* 2. Strong-Wolfe line search + L-BFGS                                */
/* ------------------------------------------------------------------ */

/**
 * Provenance: /dp/frankensim/crates/fs-ascent/src/wolfe.rs
 * source SHA-256 de0c953f0f2d736954436a6563208bfcc97c207b93d1e2dda2ca6d5ddd9c46c9
 * and /dp/frankensim/crates/fs-ascent/src/lbfgs.rs
 * source SHA-256 c8157345c70d78edae1a652221edd4cafcd9dd9737c9d0c8700873c6f0b9ede6.
 * Ported faithfully: bracket + bisection zoom (Nocedal-Wright form) with
 * fixed expansion factor 2, expansion cap 20, zoom cap 40, interval floor
 * 1e-16; the +infinity probe value remains admissible ("step outside the
 * objective's domain, too long") and brackets rather than accepts. Two-loop
 * recursion with gamma = s.y/y.y initial scaling, curvature-pair acceptance
 * s.y > 1e-14*||s||inf*max(||y||inf, 1e-30), steepest-descent fallback on a
 * non-descent memory direction, Wolfe constants c1 = 1e-4, c2 = 0.9. Local
 * modifications: refusal (null) replaces the source's panics on invalid
 * configuration and on NaN / -infinity probes (a poisoned callback fails
 * loudly as a refusal rather than a thrown assertion); the stop-rule algebra
 * is reduced to gradient-norm tolerance plus iteration cap.
 */
export type WolfeOutcome = Readonly<{
  alpha: number;
  fNew: number;
  evals: number;
  success: boolean;
}>;

export function strongWolfe(
  phi: (alpha: number) => readonly [number, number],
  f0: number,
  dphi0: number,
  alphaInit: number,
  c1: number,
  c2: number,
  maxEvals: number,
): WolfeOutcome | null {
  if (!Number.isFinite(dphi0) || dphi0 >= 0) return null;
  if (!Number.isFinite(f0)) return null;
  if (!Number.isFinite(alphaInit) || alphaInit <= 0) return null;
  if (!(Number.isFinite(c1) && Number.isFinite(c2) && 0 < c1 && c1 < c2 && c2 < 1)) return null;
  if (!Number.isSafeInteger(maxEvals) || maxEvals < 0) return null;
  const admissible = (fa: number, da: number): boolean =>
    (Number.isFinite(fa) || fa === Number.POSITIVE_INFINITY) && Number.isFinite(da);
  const failed = (evals: number): WolfeOutcome =>
    Object.freeze({ alpha: 0, fNew: f0, evals, success: false });
  let evals = 0;
  let alphaPrev = 0;
  let fPrev = f0;
  let alpha = alphaInit;

  const zoom = (
    loIn: number,
    fLoIn: number,
    hiIn: number,
  ): WolfeOutcome | null => {
    let lo = loIn;
    let fLo = fLoIn;
    let hi = hiIn;
    for (let round = 0; round < 40; round += 1) {
      if (evals === maxEvals) return failed(evals);
      const mid = (lo + hi) / 2;
      const [fa, da] = phi(mid);
      evals += 1;
      if (!admissible(fa, da)) return null;
      if (fa > f0 + c1 * mid * dphi0 || fa >= fLo) {
        hi = mid;
      } else {
        if (Math.abs(da) <= c2 * Math.abs(dphi0)) {
          return Object.freeze({ alpha: mid, fNew: fa, evals, success: true });
        }
        if (da * (hi - lo) >= 0) hi = lo;
        lo = mid;
        fLo = fa;
      }
      if (Math.abs(hi - lo) < 1e-16) break;
    }
    return failed(evals);
  };

  for (let i = 0; i < 20; i += 1) {
    if (evals === maxEvals) return failed(evals);
    const [fa, da] = phi(alpha);
    evals += 1;
    if (!admissible(fa, da)) return null;
    if (fa > f0 + c1 * alpha * dphi0 || (i > 0 && fa >= fPrev)) {
      return zoom(alphaPrev, fPrev, alpha);
    }
    if (Math.abs(da) <= c2 * Math.abs(dphi0)) {
      return Object.freeze({ alpha, fNew: fa, evals, success: true });
    }
    if (da >= 0) {
      return zoom(alpha, fa, alphaPrev);
    }
    alphaPrev = alpha;
    fPrev = fa;
    alpha *= 2;
    if (!Number.isFinite(alpha)) return failed(evals);
  }
  return failed(evals);
}

export type LbfgsReport = Readonly<{
  x: readonly number[];
  f: number;
  gradNorm: number;
  iters: number;
  evals: number;
  reason: "grad-norm" | "iteration-cap" | "stall" | "refused-callback";
}>;

function infNorm(values: readonly number[]): number {
  let best = 0;
  for (const value of values) best = Math.max(best, Math.abs(value));
  return best;
}

export function lbfgsMinimize(
  fg: (x: readonly number[]) => readonly [number, readonly number[]],
  x0: readonly number[],
  options: Readonly<{ memory: number; maxIters: number; gradTol: number }>,
): LbfgsReport | null {
  const n = x0.length;
  if (n < 1 || !allFinite(x0)) return null;
  if (!Number.isSafeInteger(options.memory) || options.memory < 1) return null;
  if (!Number.isSafeInteger(options.maxIters) || options.maxIters < 0) return null;
  if (!Number.isFinite(options.gradTol) || options.gradTol < 0) return null;
  let x = [...x0];
  const [f0Value, g0] = fg(x);
  let f = f0Value;
  let g = [...g0];
  if (!Number.isFinite(f) || !allFinite(g) || g.length !== n) return null;
  const pairs: { s: number[]; y: number[]; rho: number }[] = [];
  let iters = 0;
  let evals = 1;
  let reason: LbfgsReport["reason"] = "iteration-cap";
  // Hoisted per-iteration scratch (q, alphas): identical copy/compute order
  // each iteration, pure allocation removal (GC was ~11% of scenario self).
  const q = new Array<number>(n).fill(0);
  const d = new Array<number>(n).fill(0);
  const alphas: number[] = [];
  for (let iter = 0; iter < options.maxIters; iter += 1) {
    if (infNorm(g) <= options.gradTol) {
      reason = "grad-norm";
      break;
    }
    // Two-loop recursion.
    for (let i = 0; i < n; i += 1) q[i] = g[i] ?? 0;
    alphas.length = 0;
    for (let k = pairs.length - 1; k >= 0; k -= 1) {
      const pair = pairs[k];
      if (pair === undefined) continue;
      let dot = 0;
      for (let i = 0; i < n; i += 1) dot += (pair.s[i] ?? 0) * (q[i] ?? 0);
      const a = pair.rho * dot;
      for (let i = 0; i < n; i += 1) q[i] = (q[i] ?? 0) - a * (pair.y[i] ?? 0);
      alphas.push(a);
    }
    const last = pairs[pairs.length - 1];
    if (last !== undefined) {
      let sy = 0;
      let yy = 0;
      for (let i = 0; i < n; i += 1) {
        sy += (last.s[i] ?? 0) * (last.y[i] ?? 0);
        yy += (last.y[i] ?? 0) * (last.y[i] ?? 0);
      }
      const gammaScale = sy / yy;
      for (let i = 0; i < n; i += 1) q[i] = (q[i] ?? 0) * gammaScale;
    }
    for (let k = 0; k < pairs.length; k += 1) {
      const pair = pairs[k];
      if (pair === undefined) continue;
      let dot = 0;
      for (let i = 0; i < n; i += 1) dot += (pair.y[i] ?? 0) * (q[i] ?? 0);
      const b = pair.rho * dot;
      const a = alphas[pairs.length - 1 - k] ?? 0;
      for (let i = 0; i < n; i += 1) q[i] = (q[i] ?? 0) + (a - b) * (pair.s[i] ?? 0);
    }
    for (let i = 0; i < n; i += 1) d[i] = -(q[i] ?? 0);
    let dphi0 = 0;
    for (let i = 0; i < n; i += 1) dphi0 += (d[i] ?? 0) * (g[i] ?? 0);
    if (dphi0 >= 0) {
      for (let i = 0; i < n; i += 1) d[i] = -(g[i] ?? 0);
      dphi0 = 0;
      for (const value of g) dphi0 -= value * value;
    }
    if (dphi0 >= 0 || Number.isNaN(dphi0)) {
      reason = dphi0 === 0 ? "grad-norm" : "stall";
      break;
    }
    const xBase = [...x];
    const fBase = f;
    // Probe state lives in an object so control-flow analysis correctly
    // widens it across the strongWolfe call that drives the closure.
    const probeBox: { last: { f: number; g: number[]; x: number[] } | null; poisoned: boolean } = {
      last: null,
      poisoned: false,
    };
    const phi = (alpha: number): readonly [number, number] => {
      const xt = xBase.map((xi, i) => xi + alpha * (d[i] ?? 0));
      const [ft, gt] = fg(xt);
      evals += 1;
      if (gt.length !== n || !allFinite(gt) || Number.isNaN(ft)) {
        probeBox.poisoned = true;
        return [Number.NaN, Number.NaN];
      }
      let dphi = 0;
      for (let i = 0; i < n; i += 1) dphi += (gt[i] ?? 0) * (d[i] ?? 0);
      probeBox.last = { f: ft, g: [...gt], x: xt };
      return [ft, dphi];
    };
    const outcome = strongWolfe(phi, fBase, dphi0, 1.0, 1e-4, 0.9, Number.MAX_SAFE_INTEGER);
    if (probeBox.poisoned || outcome === null) {
      reason = "refused-callback";
      break;
    }
    if (!outcome.success) {
      reason = "stall";
      break;
    }
    const accepted = probeBox.last;
    if (accepted === null) {
      reason = "stall";
      break;
    }
    const s = accepted.x.map((value, i) => value - (xBase[i] ?? 0));
    const y = accepted.g.map((value, i) => value - (g[i] ?? 0));
    let sy = 0;
    for (let i = 0; i < n; i += 1) sy += (s[i] ?? 0) * (y[i] ?? 0);
    if (sy > 1e-14 * infNorm(s) * Math.max(infNorm(y), 1e-30)) {
      if (pairs.length === options.memory) pairs.shift();
      pairs.push({ s, y, rho: 1 / sy });
    }
    x = accepted.x;
    f = accepted.f;
    g = accepted.g;
    iters += 1;
  }
  if (reason === "iteration-cap" && infNorm(g) <= options.gradTol) reason = "grad-norm";
  return Object.freeze({
    x: Object.freeze([...x]),
    f,
    gradNorm: infNorm(g),
    iters,
    evals,
    reason,
  });
}

/* ------------------------------------------------------------------ */
/* 3. Gradient verification gate                                       */
/* ------------------------------------------------------------------ */

/**
 * Provenance: /dp/frankensim/crates/fs-adjoint/src/verify.rs
 * source SHA-256 ab9d4d548125446c5e2c785abd108693baf2436931602e89f39631c1148a228e.
 * Ported faithfully, including the fail-closed +infinity sentinel, the
 * 1e-12*||d||inf relative-error floor, the bit-insensitive step refusal
 * (a perturbed coordinate that rounds back to the base point refuses), and
 * the informative-directions law: a probe whose analytic and finite
 * difference derivatives both sit at the floor is no evidence, and a
 * verification with zero informative directions fails closed ("a gate that
 * cannot fail is not a gate"). Local modification: shape mismatches refuse
 * (fail closed) instead of panicking.
 */
export type GradientVerdict = Readonly<{
  maxRelErr: number;
  pairs: ReadonlyArray<readonly [number, number]>;
  informativeDirections: number;
  pass: boolean;
}>;

export function verifyGradient(
  j: (p: readonly number[]) => number,
  p: readonly number[],
  gradient: readonly number[],
  directions: ReadonlyArray<readonly number[]>,
  eps: number,
  tol: number,
): GradientVerdict {
  const failClosed = (pairs: ReadonlyArray<readonly [number, number]>): GradientVerdict =>
    Object.freeze({
      maxRelErr: Number.POSITIVE_INFINITY,
      pairs: Object.freeze([...pairs]),
      informativeDirections: 0,
      pass: false,
    });
  if (
    p.length !== gradient.length ||
    directions.some((d) => d.length !== p.length) ||
    !Number.isFinite(eps) ||
    eps <= 0 ||
    !Number.isFinite(tol) ||
    tol <= 0 ||
    !allFinite(p) ||
    !allFinite(gradient) ||
    directions.length === 0
  ) {
    return failClosed([]);
  }
  const pairs: (readonly [number, number])[] = [];
  let worst = 0;
  let informativeDirections = 0;
  for (const d of directions) {
    if (!allFinite(d) || d.every((value) => value === 0)) return failClosed(pairs);
    const directionMagnitude = infNorm(d);
    if (!Number.isFinite(directionMagnitude) || directionMagnitude === 0) {
      return failClosed(pairs);
    }
    let analytic = 0;
    for (let i = 0; i < p.length; i += 1) {
      const term = (gradient[i] ?? 0) * (d[i] ?? 0);
      if (!Number.isFinite(term)) return failClosed(pairs);
      analytic += term;
      if (!Number.isFinite(analytic)) return failClosed(pairs);
    }
    const plus = [...p];
    const minus = [...p];
    for (let i = 0; i < p.length; i += 1) {
      const step = eps * (d[i] ?? 0);
      if (!Number.isFinite(step)) return failClosed(pairs);
      const base = p[i] ?? 0;
      const plusValue = base + step;
      const minusValue = base - step;
      if (!Number.isFinite(plusValue) || !Number.isFinite(minusValue)) {
        return failClosed(pairs);
      }
      if ((d[i] ?? 0) !== 0 && (plusValue === base || minusValue === base)) {
        return failClosed(pairs);
      }
      plus[i] = plusValue;
      minus[i] = minusValue;
    }
    const jPlus = j(plus);
    const jMinus = j(minus);
    if (!Number.isFinite(jPlus) || !Number.isFinite(jMinus)) return failClosed(pairs);
    const fd = (jPlus - jMinus) / (2 * eps);
    if (!Number.isFinite(fd)) return failClosed(pairs);
    const scaleFloor = 1e-12 * directionMagnitude;
    const signal = Math.max(Math.abs(analytic), Math.abs(fd));
    if (signal > scaleFloor) informativeDirections += 1;
    const scale = Math.max(signal, scaleFloor);
    const relativeError = Math.abs(analytic - fd) / scale;
    if (!Number.isFinite(relativeError)) return failClosed(pairs);
    worst = Math.max(worst, relativeError);
    pairs.push(Object.freeze([analytic, fd] as const));
  }
  if (informativeDirections === 0) return failClosed(pairs);
  const pass =
    pairs.length === directions.length && informativeDirections > 0 && worst < tol;
  return Object.freeze({
    maxRelErr: worst,
    pairs: Object.freeze([...pairs]),
    informativeDirections,
    pass,
  });
}

/* ------------------------------------------------------------------ */
/* 4. Conformal band + certify-or-escalate                             */
/* ------------------------------------------------------------------ */

/**
 * Provenance: /dp/frankensim/crates/fs-surrogate/src/lib.rs
 * source SHA-256 4cc484ce193d3ee14417e7f03b06865fb7932f7bea973c08ac91340063c78934
 * (ConformalBand, conformal_band, empirical_coverage, certify_or_escalate;
 * the POD machinery in the same file was not ported). Faithful, including
 * the small-sample honesty law: when alpha < 1/(n+1) the (1-alpha) order
 * statistic does not exist and the only honest band is unbounded
 * (half-width +infinity), which forces escalation — never a silently
 * under-covering max-residual band. The certify-or-escalate policy
 * revalidates every numeric input at the decision boundary in the source's
 * exact order. Local modification: refusal (null) replaces panics on empty
 * residuals or alpha outside (0, 1).
 */
export type ConformalBand = Readonly<{ halfWidth: number; alpha: number }>;

export function conformalBand(
  residuals: readonly number[],
  alpha: number,
): ConformalBand | null {
  if (residuals.length === 0) return null;
  if (!(alpha > 0 && alpha < 1)) return null;
  if (!allFinite(residuals)) return null;
  const sorted = residuals.map((value) => Math.abs(value)).sort((a, b) => a - b);
  const n = sorted.length;
  const rank = Math.ceil((1 - alpha) * (n + 1));
  const halfWidth = rank > n ? Number.POSITIVE_INFINITY : sorted[rank - 1] ?? 0;
  return Object.freeze({ halfWidth, alpha });
}

export function bandCovers(band: ConformalBand, prediction: number, truth: number): boolean {
  return Math.abs(prediction - truth) <= band.halfWidth;
}

export function empiricalCoverage(
  band: ConformalBand,
  pairs: ReadonlyArray<readonly [number, number]>,
): number {
  if (pairs.length === 0) return 1;
  const hit = pairs.filter(([prediction, truth]) => bandCovers(band, prediction, truth)).length;
  return hit / pairs.length;
}

export type SurrogateDecision =
  | Readonly<{ kind: "use-surrogate"; bandHalfWidth: number }>
  | Readonly<{ kind: "escalate"; reason: string }>;

export function certifyOrEscalate(
  band: ConformalBand,
  inValidityDomain: boolean,
  decisionTolerance: number,
): SurrogateDecision {
  if (band.halfWidth === Number.POSITIVE_INFINITY) {
    return Object.freeze({ kind: "escalate", reason: "conformal band is unbounded" } as const);
  }
  if (!Number.isFinite(band.halfWidth) || band.halfWidth < 0) {
    return Object.freeze({
      kind: "escalate",
      reason: "conformal band half-width must be finite and non-negative",
    } as const);
  }
  if (!(Number.isFinite(band.alpha) && band.alpha > 0 && band.alpha < 1)) {
    return Object.freeze({
      kind: "escalate",
      reason: "conformal band alpha must be finite and in (0, 1)",
    } as const);
  }
  if (!Number.isFinite(decisionTolerance) || decisionTolerance < 0) {
    return Object.freeze({
      kind: "escalate",
      reason: "decision tolerance must be finite and non-negative",
    } as const);
  }
  if (!inValidityDomain) {
    return Object.freeze({
      kind: "escalate",
      reason: "query outside the surrogate's validity domain",
    } as const);
  }
  if (band.halfWidth <= decisionTolerance) {
    return Object.freeze({ kind: "use-surrogate", bandHalfWidth: band.halfWidth } as const);
  }
  return Object.freeze({
    kind: "escalate",
    reason: `band half-width ${band.halfWidth.toExponential(3)} exceeds decision tolerance ${decisionTolerance.toExponential(3)}`,
  } as const);
}

/* ------------------------------------------------------------------ */
/* 5. NSGA-II                                                          */
/* ------------------------------------------------------------------ */

/**
 * Provenance: /dp/frankensim/crates/fs-dfo/src/moo.rs
 * source SHA-256 19284851d60ce88041cadda5ff881c2bf701a4c3f0375a79ee2a32f040ef2b7c
 * (dominates, non_dominated_sort, crowding_distance, crowding_for_population,
 * sbx, mutate, nsga2, and the 2D branch of hypervolume; NSGA-III, MOEA/D,
 * knee_point, MC hypervolume, and the archive machinery were not ported).
 * Faithful: dominance with strict-improvement flag; fast non-dominated sort
 * with deterministic index-ordered scans; crowding distance with infinite
 * boundaries and span floor 1e-30; per-variable SBX at crossover probability
 * 0.9 with the u <= 0.5 beta branch and midpoint blend; polynomial mutation
 * with the u < 0.5 delta branch; binary tournament with the exact
 * (front, crowding, bit-equal-crowding -> lower index) tie-break; and
 * environmental selection that sorts by (front, crowding desc, index),
 * truncates, then restores original index order. Local modifications:
 * splitmix64 stream instead of fs-rand Philox (determinism per seed is the
 * contract, not cross-language bit parity); refusal (null) replaces panics
 * on invalid populations/bounds/indices; objective vectors are validated
 * finite at intake; hypervolume2d REFUSES (null) when any front point fails
 * to strictly dominate the reference, where the source's hypervolume()
 * silently FILTERS such points — fail-closed is the foundry law.
 */
export type Individual = Readonly<{ x: readonly number[]; f: readonly number[] }>;

export function dominates(a: readonly number[], b: readonly number[]): boolean | null {
  if (a.length !== b.length || a.length === 0) return null;
  let strictly = false;
  for (let i = 0; i < a.length; i += 1) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (ai > bi) return false;
    if (ai < bi) strictly = true;
  }
  return strictly;
}

export function nonDominatedSort(pop: readonly Individual[]): number[] | null {
  const n = pop.length;
  if (n === 0) return [];
  const m = pop[0]?.f.length ?? 0;
  if (m === 0) return null;
  for (const individual of pop) {
    if (individual.f.length !== m || !allFinite(individual.f)) return null;
  }
  // Hot path: the frozen readonly objective arrays are copied once into a
  // flat Float64Array and the dominance comparison is inlined. Pure
  // comparisons over identical values — verdicts, order, and tie-breaks are
  // exactly those of `dominates` (JSC runs frozen-array element reads and
  // the 2 n^2 indirect calls far slower; measured on the ZDT1 scenario).
  const flat = new Float64Array(n * m);
  for (let i = 0; i < n; i += 1) {
    const f = pop[i]?.f ?? [];
    for (let obj = 0; obj < m; obj += 1) flat[i * m + obj] = f[obj] ?? 0;
  }
  const dominatesList: number[][] = Array.from({ length: n }, () => []);
  const dominatedBy = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    const base = i * m;
    const row = dominatesList[i];
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      const other = j * m;
      let strictly = false;
      let dominated = true;
      for (let obj = 0; obj < m; obj += 1) {
        const ai = flat[base + obj] as number;
        const bi = flat[other + obj] as number;
        if (ai > bi) {
          dominated = false;
          break;
        }
        if (ai < bi) strictly = true;
      }
      if (dominated && strictly) {
        row?.push(j);
        dominatedBy[j] = (dominatedBy[j] ?? 0) + 1;
      }
    }
  }
  const front = new Array<number>(n).fill(Number.MAX_SAFE_INTEGER);
  let current: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if ((dominatedBy[i] ?? 0) === 0) current.push(i);
  }
  let level = 0;
  while (current.length > 0) {
    const next: number[] = [];
    for (const i of current) front[i] = level;
    for (const i of current) {
      for (const j of dominatesList[i] ?? []) {
        dominatedBy[j] = (dominatedBy[j] ?? 0) - 1;
        if ((dominatedBy[j] ?? 0) === 0) next.push(j);
      }
    }
    next.sort((a, b) => a - b);
    current = [...new Set(next)];
    level += 1;
  }
  return front;
}

export function crowdingDistance(front: readonly Individual[]): number[] {
  const n = front.length;
  if (n === 0) return [];
  const m = front[0]?.f.length ?? 0;
  const dist = new Array<number>(n).fill(0);
  // Objective column copied out of the frozen readonly arrays once per
  // objective; the sort comparator and neighbor reads then hit a plain
  // Float64Array. Identical values, identical comparator semantics and
  // index tie-break — results are bit-for-bit those of the direct reads.
  const column = new Float64Array(n);
  for (let obj = 0; obj < m; obj += 1) {
    for (let k = 0; k < n; k += 1) column[k] = front[k]?.f[obj] ?? 0;
    const order = Array.from({ length: n }, (_, k) => k).sort((a, b) => {
      const fa = column[a] as number;
      const fb = column[b] as number;
      if (fa < fb) return -1;
      if (fa > fb) return 1;
      return a - b;
    });
    const first = order[0] ?? 0;
    const lastIdx = order[n - 1] ?? 0;
    const lo = column[first] as number;
    const hi = column[lastIdx] as number;
    const span = Math.max(hi - lo, 1e-30);
    dist[first] = Number.POSITIVE_INFINITY;
    dist[lastIdx] = Number.POSITIVE_INFINITY;
    for (let w = 1; w < n - 1; w += 1) {
      const here = order[w] ?? 0;
      const above = column[order[w + 1] ?? 0] as number;
      const below = column[order[w - 1] ?? 0] as number;
      dist[here] = (dist[here] ?? 0) + (above - below) / span;
    }
  }
  return dist;
}

function crowdingForPopulation(pop: readonly Individual[], fronts: readonly number[]): number[] {
  const crowd = new Array<number>(pop.length).fill(0);
  let maxFront = 0;
  for (const level of fronts) maxFront = Math.max(maxFront, level);
  for (let level = 0; level <= maxFront; level += 1) {
    const idx: number[] = [];
    for (let i = 0; i < pop.length; i += 1) {
      if ((fronts[i] ?? -1) === level) idx.push(i);
    }
    if (idx.length === 0) continue;
    if (idx.length <= 2) {
      for (const i of idx) crowd[i] = Number.POSITIVE_INFINITY;
      continue;
    }
    const members = idx.map((i) => pop[i]).filter((v): v is Individual => v !== undefined);
    const d = crowdingDistance(members);
    idx.forEach((i, k) => {
      crowd[i] = d[k] ?? 0;
    });
  }
  return crowd;
}

function sbx(
  p1: readonly number[],
  p2: readonly number[],
  eta: number,
  lo: number,
  hi: number,
  stream: FoundryStream,
): [number[], number[]] {
  const c1 = [...p1];
  const c2 = [...p2];
  for (let i = 0; i < p1.length; i += 1) {
    if (stream.nextF64() < 0.9) {
      const u = stream.nextF64();
      const beta =
        u <= 0.5
          ? Math.pow(2 * u, 1 / (eta + 1))
          : Math.pow(1 / (2 * (1 - u)), 1 / (eta + 1));
      const a = ((1 + beta) * (p1[i] ?? 0) + (1 - beta) * (p2[i] ?? 0)) / 2;
      const b = ((1 - beta) * (p1[i] ?? 0) + (1 + beta) * (p2[i] ?? 0)) / 2;
      c1[i] = Math.min(hi, Math.max(lo, a));
      c2[i] = Math.min(hi, Math.max(lo, b));
    }
  }
  return [c1, c2];
}

function polynomialMutate(
  x: number[],
  eta: number,
  pMut: number,
  lo: number,
  hi: number,
  stream: FoundryStream,
): void {
  for (let i = 0; i < x.length; i += 1) {
    if (stream.nextF64() < pMut) {
      const u = stream.nextF64();
      const delta =
        u < 0.5
          ? Math.pow(2 * u, 1 / (eta + 1)) - 1
          : 1 - Math.pow(2 * (1 - u), 1 / (eta + 1));
      x[i] = Math.min(hi, Math.max(lo, delta * (hi - lo) + (x[i] ?? 0)));
    }
  }
}

export type NsgaParams = Readonly<{
  pop: number;
  generations: number;
  etaC: number;
  etaM: number;
  pMut: number;
  seed: number;
}>;

export function nsga2(
  objectives: (x: readonly number[]) => readonly number[],
  dim: number,
  bounds: readonly [number, number],
  params: NsgaParams,
): Individual[] | null {
  const [lo, hi] = bounds;
  if (!Number.isSafeInteger(params.pop) || params.pop < 1) return null;
  if (!Number.isSafeInteger(params.generations) || params.generations < 0) return null;
  if (!Number.isSafeInteger(dim) || dim < 1) return null;
  if (!(Number.isFinite(lo) && Number.isFinite(hi) && lo <= hi)) return null;
  if (!(Number.isFinite(params.etaC) && params.etaC >= 0)) return null;
  if (!(Number.isFinite(params.etaM) && params.etaM >= 0)) return null;
  if (!(Number.isFinite(params.pMut) && params.pMut >= 0 && params.pMut <= 1)) return null;
  if (!Number.isFinite(params.seed)) return null;
  const stream = new FoundryStream(params.seed);
  const evaluate = (x: readonly number[]): readonly number[] | null => {
    const f = objectives(x);
    if (f.length === 0 || !allFinite(f)) return null;
    return f;
  };
  let pop: Individual[] = [];
  for (let k = 0; k < params.pop; k += 1) {
    const x = Array.from({ length: dim }, () => lo + (hi - lo) * stream.nextF64());
    const f = evaluate(x);
    if (f === null) return null;
    pop.push(Object.freeze({ x: Object.freeze(x), f: Object.freeze([...f]) }));
  }
  // Environmental-selection index buffer, re-filled and re-sorted in place
  // each generation (identical comparator and tie-breaks; allocation removal
  // only).
  const order = new Array<number>(2 * params.pop).fill(0);
  for (let generation = 0; generation < params.generations; generation += 1) {
    const fronts = nonDominatedSort(pop);
    if (fronts === null) return null;
    const crowd = crowdingForPopulation(pop, fronts);
    const pick = (): number => {
      const a = stream.nextBelow(pop.length);
      const b = stream.nextBelow(pop.length);
      const frontA = fronts[a] ?? 0;
      const frontB = fronts[b] ?? 0;
      const crowdA = crowd[a] ?? 0;
      const crowdB = crowd[b] ?? 0;
      if (
        frontA < frontB ||
        (frontA === frontB && crowdA > crowdB) ||
        (frontA === frontB && Object.is(crowdA, crowdB) && a <= b)
      ) {
        return a;
      }
      return b;
    };
    const offspring: Individual[] = [];
    while (offspring.length < params.pop) {
      const p1 = pick();
      const p2 = pick();
      const [c1, c2] = sbx(pop[p1]?.x ?? [], pop[p2]?.x ?? [], params.etaC, lo, hi, stream);
      polynomialMutate(c1, params.etaM, params.pMut, lo, hi, stream);
      polynomialMutate(c2, params.etaM, params.pMut, lo, hi, stream);
      const f1 = evaluate(c1);
      if (f1 === null) return null;
      offspring.push(Object.freeze({ x: Object.freeze(c1), f: Object.freeze([...f1]) }));
      if (offspring.length < params.pop) {
        const f2 = evaluate(c2);
        if (f2 === null) return null;
        offspring.push(Object.freeze({ x: Object.freeze(c2), f: Object.freeze([...f2]) }));
      }
    }
    const merged = [...pop, ...offspring];
    const mergedFronts = nonDominatedSort(merged);
    if (mergedFronts === null) return null;
    const mergedCrowd = crowdingForPopulation(merged, mergedFronts);
    order.length = merged.length;
    for (let k = 0; k < merged.length; k += 1) order[k] = k;
    order.sort((a, b) => {
      const frontDelta = (mergedFronts[a] ?? 0) - (mergedFronts[b] ?? 0);
      if (frontDelta !== 0) return frontDelta;
      const crowdA = mergedCrowd[a] ?? 0;
      const crowdB = mergedCrowd[b] ?? 0;
      if (crowdA > crowdB) return -1;
      if (crowdA < crowdB) return 1;
      return a - b;
    });
    const kept = order.slice(0, params.pop).sort((a, b) => a - b);
    pop = kept.map((i) => merged[i]).filter((v): v is Individual => v !== undefined);
  }
  const finalFronts = nonDominatedSort(pop);
  if (finalFronts === null) return null;
  return pop.filter((_, i) => (finalFronts[i] ?? 1) === 0);
}

/**
 * Exact 2D hypervolume of a minimization front against a reference point
 * (dominated-strip sweep, as the source's 2D branch). Points that do not
 * strictly dominate the reference are refused. Objective dimensions other
 * than 2 refuse: the source's recursive exclusive-contribution branch for
 * m in [3, 4] was deliberately not ported (no foundry consumer yet).
 */
export function hypervolume2d(
  front: ReadonlyArray<readonly number[]>,
  reference: readonly [number, number],
): number | null {
  const [rx, ry] = reference;
  if (!Number.isFinite(rx) || !Number.isFinite(ry) || front.length === 0) return null;
  const points: [number, number][] = [];
  for (const point of front) {
    const px = point[0];
    const py = point[1];
    if (point.length !== 2 || px === undefined || py === undefined) return null;
    if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
    if (px >= rx || py >= ry) return null;
    points.push([px, py]);
  }
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let area = 0;
  let yFloor = ry;
  for (const [px, py] of points) {
    if (py < yFloor) {
      area += (rx - px) * (yFloor - py);
      yFloor = py;
    }
  }
  return area;
}
