/**
 * jcpe-fsr-oracle-fixtures-twyn: closed-form oracle for the v2 modal
 * renderer.
 *
 * The production loop in `dsp/concert-grand/src/physical.rs::modal_core`
 * (read, never called, to derive the recurrence) is, per frame,
 *
 *   z[n+1] = g * e^{-i*phi} * z[n],   z = x + i*y,
 *
 * with phi = 2*pi*f/rate, g = exp(-damping/rate), an excitation impulse
 * added to y before the first frame, and out[n] = sqrt(0.5) * x[n+1]. The
 * closed-form solution of that discrete system — the eigenvalue g*e^{-i*phi}
 * of the 2x2 update raised to the n-th power, nothing integrated — is
 *
 *   out[n]  = sqrt(0.5) * g^(n+1) * (x0*cos((n+1)*phi) + y0'*sin((n+1)*phi))
 *   x[N]    = g^N * (x0*cos(N*phi) + y0'*sin(N*phi))
 *   y[N]    = g^N * (y0'*cos(N*phi) - x0*sin(N*phi))
 *   E[N]    = g^(2N) * (x0^2 + y0'^2) / 2        (y0' = y0 + excitation)
 *
 * This file predicts every sample and the final state/energy from
 * (coefficients, n) alone — an independent oracle sharing no code with the
 * renderer — and requires the production output to track it.
 *
 * Tolerance: the published PCM is f32, so per-sample agreement is bounded
 * below by f32 quantization (~1.2e-7 relative); coefficient ULP differences
 * between Rust libm and JS Math plus iterated-rotation drift contribute
 * ~1e-11 over 4096 frames. The authored bound is 1.5e-7 * amplitude scale,
 * f32-quantization-limited, with the f64 state/energy held to 1e-9 relative.
 * The mutation control perturbs one coefficient by 1e-6, which compounds to
 * ~0.4% over 4096 frames and must break the comparison.
 */
import { describe, expect, test } from "bun:test";

import { loadConcertGrandRenderer } from "../../src/audio/dsp-renderer";

const FRAME_COUNT = 4_096;
const SAMPLE_TOLERANCE_SCALE = 1.5e-7;
const STATE_RELATIVE_TOLERANCE = 1e-9;

interface OracleCase {
  readonly sampleRateHz: 44_100 | 48_000 | 96_000;
  readonly frequencyHz: number;
  readonly dampingPerSecond: number;
  readonly excitation: number;
  readonly initialX: number;
  readonly initialY: number;
}

interface OraclePrediction {
  readonly samples: Float64Array;
  readonly finalX: number;
  readonly finalY: number;
  readonly finalEnergy: number;
  readonly excitedEnergy: number;
}

function predict(oracle: OracleCase, lossPerturbation: number): OraclePrediction {
  const phi = (2 * Math.PI * oracle.frequencyHz) / oracle.sampleRateHz;
  const loss =
    Math.exp(-oracle.dampingPerSecond / oracle.sampleRateHz) *
    (1 + lossPerturbation);
  const x0 = oracle.initialX;
  const y0 = oracle.initialY + oracle.excitation;
  const pan = Math.sqrt(0.5);
  const samples = new Float64Array(FRAME_COUNT);
  for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
    const angle = (frame + 1) * phi;
    const amplitude = loss ** (frame + 1);
    samples[frame] =
      pan * amplitude * (x0 * Math.cos(angle) + y0 * Math.sin(angle));
  }
  const finalAngle = FRAME_COUNT * phi;
  const finalAmplitude = loss ** FRAME_COUNT;
  const excitedEnergy = 0.5 * (x0 * x0 + y0 * y0);
  return {
    samples,
    finalX:
      finalAmplitude * (x0 * Math.cos(finalAngle) + y0 * Math.sin(finalAngle)),
    finalY:
      finalAmplitude * (y0 * Math.cos(finalAngle) - x0 * Math.sin(finalAngle)),
    finalEnergy: finalAmplitude * finalAmplitude * excitedEnergy,
    excitedEnergy,
  };
}

function maximumSampleDeviation(
  rendered: Float32Array,
  predicted: Float64Array,
): number {
  let worst = 0;
  for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
    worst = Math.max(
      worst,
      Math.abs((rendered[frame] ?? 0) - (predicted[frame] ?? 0)),
    );
  }
  return worst;
}

const CASES: readonly OracleCase[] = [
  ...([44_100, 48_000, 96_000] as const).flatMap((sampleRateHz) =>
    [110, 440, 1_760, 5_000].flatMap((frequencyHz) =>
      [0.5, 3, 12].map((dampingPerSecond) => ({
        sampleRateHz,
        frequencyHz,
        dampingPerSecond,
        excitation: 0.5,
        initialX: 0,
        initialY: 0,
      })),
    ),
  ),
  // One case with a nonzero carried-in state, the phrase-handoff shape.
  {
    sampleRateHz: 48_000,
    frequencyHz: 932.327523,
    dampingPerSecond: 4,
    excitation: 0.1,
    initialX: 0.3,
    initialY: -0.2,
  },
];

describe("closed-form modal oracle", () => {
  test("production samples, state, and energy track the closed form", async () => {
    const renderer = await loadConcertGrandRenderer();
    for (const oracle of CASES) {
      const rendered = renderer.renderPhysicalModalV2({
        sampleRateHz: oracle.sampleRateHz,
        frequencyHz: oracle.frequencyHz,
        dampingPerSecond: oracle.dampingPerSecond,
        excitation: oracle.excitation,
        initialState: { x: oracle.initialX, y: oracle.initialY },
        frameCount: FRAME_COUNT,
      });
      expect(rendered).not.toBeNull();
      if (rendered === null) continue;
      const predicted = predict(oracle, 0);
      const amplitudeScale = Math.max(
        1,
        Math.hypot(oracle.initialX, oracle.initialY + oracle.excitation),
      );
      const sampleTolerance = SAMPLE_TOLERANCE_SCALE * amplitudeScale;
      expect(
        maximumSampleDeviation(rendered.left, predicted.samples),
      ).toBeLessThan(sampleTolerance);
      expect(
        maximumSampleDeviation(rendered.right, predicted.samples),
      ).toBeLessThan(sampleTolerance);

      const stateTolerance = STATE_RELATIVE_TOLERANCE * amplitudeScale;
      expect(Math.abs(rendered.state.x - predicted.finalX)).toBeLessThan(
        stateTolerance,
      );
      expect(Math.abs(rendered.state.y - predicted.finalY)).toBeLessThan(
        stateTolerance,
      );
      // Ledger slots against the closed form: stored (final) energy, and the
      // excitation work implied by the pre/post-impulse energies.
      expect(
        Math.abs(rendered.energy.finalEnergy - predicted.finalEnergy),
      ).toBeLessThan(
        STATE_RELATIVE_TOLERANCE * Math.max(1, predicted.excitedEnergy),
      );
      const predictedWork =
        predicted.excitedEnergy -
        0.5 * (oracle.initialX ** 2 + oracle.initialY ** 2);
      expect(
        Math.abs(rendered.energy.excitationWork - predictedWork),
      ).toBeLessThan(STATE_RELATIVE_TOLERANCE * Math.max(1, predicted.excitedEnergy));
    }
  });

  test("mutation control: a 1e-6 coefficient perturbation breaks the oracle", async () => {
    const renderer = await loadConcertGrandRenderer();
    const oracle: OracleCase = {
      sampleRateHz: 48_000,
      frequencyHz: 440,
      dampingPerSecond: 0.5,
      excitation: 0.5,
      initialX: 0,
      initialY: 0,
    };
    const rendered = renderer.renderPhysicalModalV2({
      sampleRateHz: oracle.sampleRateHz,
      frequencyHz: oracle.frequencyHz,
      dampingPerSecond: oracle.dampingPerSecond,
      excitation: oracle.excitation,
      initialState: { x: oracle.initialX, y: oracle.initialY },
      frameCount: FRAME_COUNT,
    });
    expect(rendered).not.toBeNull();
    if (rendered === null) return;
    const mutated = predict(oracle, 1e-6);
    // (1 + 1e-6)^4096 ~ 1.0041: far outside the authored tolerance, so a
    // wrong loss coefficient cannot hide inside the oracle comparison.
    expect(maximumSampleDeviation(rendered.left, mutated.samples)).toBeGreaterThan(
      SAMPLE_TOLERANCE_SCALE,
    );
  });
});
