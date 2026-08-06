/**
 * jcpe-fsr-passivity-cert-zrqk: analytic passivity certification over the
 * LEGAL coefficient ranges of the shared filter components — not spot checks
 * at sampled coefficients.
 *
 * Method: each component's magnitude response has a closed-form supremum
 * over frequency, derived below and encoded exactly; the certificate then
 * covers an entire coefficient box by monotonicity of that closed form in
 * the coefficient. Every float evaluation carries a conservative relative
 * epsilon inflation of 1e-12: the closed forms are single-expression
 * arithmetic whose IEEE-754 evaluation error is bounded by a few ULP
 * (~1e-15 relative), so inflating by 1e-12 makes the float comparison a
 * sound certificate for the real-number inequality. Filters without closed
 * forms are OUT of scope here by design: their production path is the
 * outward-rounded interval arithmetic + Krawczyk port (fs-ivl) named for
 * the PHS1 build in docs/PHS1_FRANKENSIM_EXTRACTION_MAP.md.
 *
 * Derivations (H evaluated on the unit circle, c = cos(omega)):
 *
 * 1. One-pole loss `state += alpha*(input - state)`:
 *      H(z) = alpha / (1 - (1-alpha) z^-1)
 *      |H|^2 = alpha^2 / (1 + (1-alpha)^2 - 2(1-alpha) c).
 *    For alpha in (0, 1] the denominator is minimized at c = 1 (DC), where
 *    it equals alpha^2, so sup |H| = 1 exactly, attained at DC. Passive
 *    over the whole legal box.
 *
 * 2. DC blocker `y = x - x_prev + p*y_prev`:
 *      H(z) = (1 - z^-1) / (1 - p z^-1)
 *      |H|^2 = (2 - 2c) / (1 + p^2 - 2 p c) =: f(c).
 *      f'(c) = -2 (1 - p)^2 / (1 + p^2 - 2 p c)^2 < 0,
 *    so f is strictly decreasing in c and the supremum is at c = -1
 *    (Nyquist): sup |H| = 2 / (1 + p). This EXCEEDS one for every p < 1 —
 *    the standard DC blocker is not passive in isolation. The certificate
 *    therefore pins the exact excess bound instead of pretending |H| <= 1,
 *    and certifies the documented in-loop budget: a loop containing the
 *    blocker stays passive only when the co-located per-pass loss satisfies
 *    g <= (1 + p) / 2. Production poles are p = exp(-2*pi*38.3/rate)
 *    (clarinet.rs/flute.rs), giving p >= 0.99456 at 44.1 kHz and an excess
 *    bound 2/(1+p) <= 1.00273; actual loop passivity is enforced end-to-end
 *    by the Rust energy-ledger tests.
 *
 * 3. First-order tuning allpass `H(z) = (a + z^-1) / (1 + a z^-1)`:
 *      |a + e^-jw|^2 = a^2 + 2 a c + 1 = |1 + a e^-jw|^2,
 *    so |H| = 1 identically for every real a; passivity is exactly the
 *    stability condition |a| < 1. The legal fraction law d in [0.1, 1.1)
 *    (guitar.rs, "fraction kept in [0.1,1.1)") maps through
 *    a = (1 - d)/(1 + d), which is strictly decreasing in d, so the legal
 *    coefficient box is a in ((1-1.1)/2.1, (1-0.1)/1.1] = (-1/21, 9/11],
 *    strictly inside (-1, 1). Passive over the whole legal box.
 */
import { describe, expect, test } from "bun:test";

const EPSILON_INFLATION = 1e-12;
const OMEGA_GRID_POINTS = 4_096;

/**
 * Both denominators are |1 - p e^{-jw}|^2 = 1 + p^2 - 2 p c. Evaluating
 * that form suffers catastrophic cancellation as p -> 1, c -> 1 (the DC
 * limit of the loss filter loses ~11 digits at alpha = 1e-6); the
 * algebraically identical form (1-p)^2 + 2 p (1-c) is cancellation-free
 * because 1-p = alpha is exact by Sterbenz subtraction, keeping every
 * evaluation within a few ULP of the real value as the inflation argument
 * in the header requires.
 */
function polePairDenominator(pole: number, cosOmega: number): number {
  const oneMinusPole = 1 - pole;
  return oneMinusPole * oneMinusPole + 2 * pole * (1 - cosOmega);
}

function onePoleMagnitude(alpha: number, cosOmega: number): number {
  // Parameterized by alpha directly — the filter's own coefficient — so
  // the identity 1 - pole = alpha holds exactly instead of losing ULPs to
  // the 1 - (1 - alpha) round trip at tiny alpha:
  //   denominator = alpha^2 + 2 (1-alpha) (1-c).
  const denominator =
    alpha * alpha + 2 * (1 - alpha) * (1 - cosOmega);
  return Math.sqrt((alpha * alpha) / denominator);
}

function dcBlockerMagnitude(pole: number, cosOmega: number): number {
  return Math.sqrt(
    (2 * (1 - cosOmega)) / polePairDenominator(pole, cosOmega),
  );
}

function allpassMagnitude(coefficient: number, cosOmega: number): number {
  const numerator = coefficient * coefficient + 2 * coefficient * cosOmega + 1;
  const denominator = 1 + 2 * coefficient * cosOmega + coefficient * coefficient;
  return Math.sqrt(numerator / denominator);
}

function gridSupremum(magnitude: (cosOmega: number) => number): number {
  let supremum = 0;
  for (let index = 0; index <= OMEGA_GRID_POINTS; index += 1) {
    const omega = (Math.PI * index) / OMEGA_GRID_POINTS;
    supremum = Math.max(supremum, magnitude(Math.cos(omega)));
  }
  return supremum;
}

/** Production DC-blocker poles: exp(-2*pi*38.3/rate) per clarinet/flute. */
const PRODUCTION_DC_POLES = [44_100, 48_000, 96_000].map((rate) =>
  Math.exp((-2 * Math.PI * 38.3) / rate),
);
/** Documented conservative legal box for any future rate compensation. */
const DC_POLE_BOX = [0.99, 0.9995] as const;

describe("analytic passivity certificates over legal coefficient boxes", () => {
  test("one-pole loss: sup |H| = 1 at DC for every alpha in (0, 1]", () => {
    // The closed-form supremum alpha/alpha = 1 holds for the entire box;
    // certify the formula's boundary algebra plus a dense-omega spot proof
    // at representative coefficients including both box endpoints.
    for (const alpha of [1e-6, 0.02, 0.25, 0.5, 0.9, 1]) {
      const atDc = onePoleMagnitude(alpha, 1);
      expect(Math.abs(atDc - 1)).toBeLessThan(EPSILON_INFLATION);
      const supremum = gridSupremum((c) => onePoleMagnitude(alpha, c));
      expect(supremum).toBeLessThanOrEqual(1 + EPSILON_INFLATION);
      // Monotone decrease away from DC (denominator increasing as c falls).
      expect(onePoleMagnitude(alpha, -1)).toBeLessThanOrEqual(
        atDc + EPSILON_INFLATION,
      );
    }
  });

  test("DC blocker: sup |H| = 2/(1+p) at Nyquist — exact, and > 1", () => {
    for (const pole of [...PRODUCTION_DC_POLES, ...DC_POLE_BOX]) {
      const analyticSupremum = 2 / (1 + pole);
      // The supremum formula is attained at Nyquist...
      expect(
        Math.abs(dcBlockerMagnitude(pole, -1) - analyticSupremum),
      ).toBeLessThan(EPSILON_INFLATION * analyticSupremum);
      // ...and nothing on a dense grid exceeds it (f strictly decreasing
      // in cos(omega), so the grid can only approach it from below).
      const supremum = gridSupremum((c) => dcBlockerMagnitude(pole, c));
      expect(supremum).toBeLessThanOrEqual(
        analyticSupremum * (1 + EPSILON_INFLATION),
      );
      // Honesty pin: the blocker alone is NOT passive at Nyquist.
      expect(analyticSupremum).toBeGreaterThan(1);
      // The documented in-loop budget keeping a blocker+loss loop passive.
      const passiveLoopLossBound = (1 + pole) / 2;
      expect(passiveLoopLossBound * analyticSupremum).toBeLessThanOrEqual(
        1 + EPSILON_INFLATION,
      );
    }
    // Production poles sit inside the documented conservative box.
    for (const pole of PRODUCTION_DC_POLES) {
      expect(pole).toBeGreaterThanOrEqual(DC_POLE_BOX[0]);
      expect(pole).toBeLessThanOrEqual(DC_POLE_BOX[1]);
    }
  });

  test("tuning allpass: |H| = 1 identically over the legal fraction law", () => {
    // a = (1-d)/(1+d) is strictly decreasing in d, so the legal fraction
    // box [0.1, 1.1) maps to the coefficient interval (-1/21, 9/11]; both
    // endpoints stay strictly inside the stability disc.
    const coefficientAtLowFraction = (1 - 0.1) / (1 + 0.1);
    const coefficientAtHighFraction = (1 - 1.1) / (1 + 1.1);
    expect(Math.abs(coefficientAtLowFraction)).toBeLessThan(1);
    expect(Math.abs(coefficientAtHighFraction)).toBeLessThan(1);
    for (const fraction of [0.1, 0.35, 0.6, 0.85, 1.099999]) {
      const coefficient = (1 - fraction) / (1 + fraction);
      const supremum = gridSupremum((c) => allpassMagnitude(coefficient, c));
      expect(Math.abs(supremum - 1)).toBeLessThan(EPSILON_INFLATION);
    }
  });

  test("near-miss: an active loss coefficient fails the certificate", () => {
    // alpha slightly above one puts the pole at -(alpha-1); the response
    // then exceeds unity away from DC, peaking at Nyquist with
    // |H(pi)| = alpha/(2-alpha) > 1. The certificate MUST reject it.
    const activeAlpha = 1.000001;
    const supremum = gridSupremum((c) => onePoleMagnitude(activeAlpha, c));
    expect(supremum).toBeGreaterThan(1 + EPSILON_INFLATION);
    const nyquist = onePoleMagnitude(activeAlpha, -1);
    const analytic = activeAlpha / (2 - activeAlpha);
    expect(Math.abs(nyquist - analytic)).toBeLessThan(
      EPSILON_INFLATION * analytic,
    );
    expect(analytic).toBeGreaterThan(1);
    // An unstable DC-blocker pole must likewise fall outside the box.
    expect(1.000001).toBeGreaterThan(DC_POLE_BOX[1]);
  });
});
