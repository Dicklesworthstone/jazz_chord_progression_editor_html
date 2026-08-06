/**
 * jcpe-fsr-oracle-fixtures-twyn: independent root verification for the v2
 * reed solver.
 *
 * The residual is re-implemented here from the physics (read from
 * `dsp/concert-grand/src/physical.rs`, never called):
 *
 *   flow(dp)    = max(0, opening - stiffness*dp) * sqrt(dp)   for dp > 0
 *   residual(p) = p - pb - Z * flow(pm - p)
 *
 * The solver's acceptance certificate is dual (PHS0 section 7): either the
 * fast-path residual bound 1e-10*(1+|pm|+|pb|), or a certified enclosure of
 * width W0/2^16 (W0 = pm - pb) that always fits the frozen 8+16 budget.
 * This fixture verifies the certificate with the INDEPENDENT residual: for
 * every returned root p*, either |r(p*)| is within the fast-path bound, or
 * the true root provably lies within twice the certified width of p* — shown
 * by a sign change of the independent residual across [p*-W, p*+W]. That is
 * a direct enclosure check, immune to the residual-slope singularity at the
 * aperture-closure kink where no residual bound is certifiable.
 */
import { describe, expect, test } from "bun:test";

import { loadConcertGrandRenderer } from "../../src/audio/dsp-renderer";

function reedFlow(deltaPressure: number, opening: number, stiffness: number): number {
  if (deltaPressure <= 0) return 0;
  const aperture = Math.max(0, opening - stiffness * deltaPressure);
  return aperture * Math.sqrt(deltaPressure);
}

function reedResidual(
  junctionPressure: number,
  mouthPressure: number,
  borePressure: number,
  opening: number,
  stiffness: number,
  boreImpedance: number,
): number {
  return (
    junctionPressure -
    borePressure -
    boreImpedance * reedFlow(mouthPressure - junctionPressure, opening, stiffness)
  );
}

const MOUTH_PRESSURES = [0.4, 0.7, 1.0, 1.4];
const BORE_PRESSURES = [-0.3, 0, 0.3];
const OPENINGS = [0.3, 0.7, 1.2];
const STIFFNESSES = [0, 0.7, 2.0];
const IMPEDANCES = [0.5, 2, 6];

describe("independent reed-root verification", () => {
  test("every returned root satisfies the independent residual certificate", async () => {
    const renderer = await loadConcertGrandRenderer();
    let verified = 0;
    for (const mouthPressure of MOUTH_PRESSURES) {
      for (const borePressure of BORE_PRESSURES) {
        if (mouthPressure <= borePressure) continue;
        for (const opening of OPENINGS) {
          for (const stiffness of STIFFNESSES) {
            for (const boreImpedance of IMPEDANCES) {
              const solved = renderer.solvePhysicalReedV2({
                mouthPressure,
                borePressure,
                opening,
                stiffness,
                boreImpedance,
              });
              expect(solved).not.toBeNull();
              if (solved === null) continue;
              const pressure = solved.junctionPressure;
              const residual = reedResidual(
                pressure,
                mouthPressure,
                borePressure,
                opening,
                stiffness,
                boreImpedance,
              );
              const fastBound =
                1e-10 *
                (1 + Math.abs(mouthPressure) + Math.abs(borePressure)) *
                (1 + 1e-6);
              const width =
                ((mouthPressure - borePressure) / 65_536) * 1.000_001 * 2;
              const lowResidual = reedResidual(
                pressure - width,
                mouthPressure,
                borePressure,
                opening,
                stiffness,
                boreImpedance,
              );
              const highResidual = reedResidual(
                pressure + width,
                mouthPressure,
                borePressure,
                opening,
                stiffness,
                boreImpedance,
              );
              const enclosed = lowResidual <= 0 && highResidual >= 0;
              expect(Math.abs(residual) <= fastBound || enclosed).toBe(true);
              // The returned flow must be the flow at the returned root.
              const expectedFlow = reedFlow(
                mouthPressure - pressure,
                opening,
                stiffness,
              );
              expect(Math.abs(solved.volumeFlow - expectedFlow)).toBeLessThan(
                1e-12 * (1 + Math.abs(expectedFlow)),
              );
              // The root must lie inside the physical bracket.
              expect(pressure).toBeGreaterThanOrEqual(borePressure);
              expect(pressure).toBeLessThanOrEqual(mouthPressure);
              // The frozen budget is law.
              expect(solved.nonlinearIterations).toBeLessThanOrEqual(8);
              expect(solved.fallbackBisections).toBeLessThanOrEqual(16);
              verified += 1;
            }
          }
        }
      }
    }
    // Every (pm > pb) grid point must have produced a verified root.
    expect(verified).toBe(4 * 3 * 3 * 3 * 3);
  });

  test("near-miss: invalid and bracketless inputs still refuse", async () => {
    const renderer = await loadConcertGrandRenderer();
    const valid = {
      mouthPressure: 0.9,
      borePressure: -0.1,
      opening: 0.7,
      stiffness: 0.3,
      boreImpedance: 0.8,
    };
    expect(renderer.solvePhysicalReedV2(valid)).not.toBeNull();
    // Mouth pressure at or below bore pressure: no bracket exists.
    expect(
      renderer.solvePhysicalReedV2({ ...valid, mouthPressure: -0.1 }),
    ).toBeNull();
    expect(
      renderer.solvePhysicalReedV2({ ...valid, mouthPressure: -0.2 }),
    ).toBeNull();
    // Out-of-contract physical parameters.
    expect(renderer.solvePhysicalReedV2({ ...valid, opening: 0 })).toBeNull();
    expect(renderer.solvePhysicalReedV2({ ...valid, opening: 2.5 })).toBeNull();
    expect(
      renderer.solvePhysicalReedV2({ ...valid, boreImpedance: 9 }),
    ).toBeNull();
    expect(
      renderer.solvePhysicalReedV2({ ...valid, stiffness: -0.5 }),
    ).toBeNull();
    expect(
      renderer.solvePhysicalReedV2({ ...valid, mouthPressure: Number.NaN }),
    ).toBeNull();
  });
});
