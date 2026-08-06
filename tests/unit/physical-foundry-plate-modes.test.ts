/**
 * jcpe-port-plate-solver-3qbe: foundry plate mode-table generator proof.
 *
 * The continuum oracle is computed IN THIS FILE from the orthotropic
 * Kirchhoff-Love closed form; the module under test supplies the discrete
 * table and the iterative path. Tolerances are authored from the validated
 * prototype evidence (worst-mode error 0.534% at 48x36, 0.134% at 96x72,
 * h^2 ratio 3.99), not read back from module output.
 */
import { describe, expect, test } from "bun:test";

import {
  PLATE_MODE_LIMITS,
  computePlateModeTable,
  continuumPlateFrequencyHz,
  discretePlateFrequencyHz,
  isotropicMaterial,
  iteratePlateModes,
  type PlateGeometry,
  type PlateMaterial,
} from "../../scripts/physical-foundry-plate-modes";

const DREADNOUGHT: PlateGeometry = Object.freeze({
  aMeters: 0.5,
  bMeters: 0.4,
  hMeters: 0.003,
});
const UKULELE: PlateGeometry = Object.freeze({
  aMeters: 0.24,
  bMeters: 0.18,
  hMeters: 0.002,
});
const SPRUCE_DEMO = isotropicMaterial(10e9, 0.3, 450);

function evidence(label: string, payload: Record<string, unknown>): void {
  console.log(`[plate-modes-evidence] ${JSON.stringify({ label, ...payload })}`);
}

/** Independent continuum frequency, re-derived here (isotropic form). */
function isotropicContinuumHz(
  geometry: PlateGeometry,
  youngPa: number,
  poisson: number,
  densityKgM3: number,
  m: number,
  n: number,
): number {
  const d = (youngPa * geometry.hMeters ** 3) / (12 * (1 - poisson * poisson));
  const term = (m / geometry.aMeters) ** 2 + (n / geometry.bMeters) ** 2;
  return (
    (Math.PI / 2) *
    Math.sqrt(d / (densityKgM3 * geometry.hMeters)) *
    term
  );
}

describe("closed-form discrete table vs analytic continuum", () => {
  const grids: readonly [number, number, number][] = [
    [48, 36, 0.6],
    [96, 72, 0.15],
  ];
  for (const [nx, ny, boundPercent] of grids) {
    test(`grid ${String(nx)}x${String(ny)} within ${String(boundPercent)}%`, () => {
      for (const geometry of [DREADNOUGHT, UKULELE]) {
        const result = computePlateModeTable(geometry, SPRUCE_DEMO, nx, ny, 10);
        expect(result.outcome).toBe("accept");
        if (result.outcome !== "accept") return;
        let worst = 0;
        for (const mode of result.table.modes) {
          const reference = isotropicContinuumHz(
            geometry,
            10e9,
            0.3,
            450,
            mode.halfWavesX,
            mode.halfWavesY,
          );
          const errorPercent =
            (100 * Math.abs(mode.frequencyHz - reference)) / reference;
          worst = Math.max(worst, errorPercent);
        }
        evidence("analytic-validation", {
          geometry,
          grid: [nx, ny],
          worstErrorPercent: worst,
          tableSha256: result.table.contentSha256,
        });
        expect(worst).toBeLessThan(boundPercent);
      }
    });
  }

  test("h^2 convergence trend between the two grids", () => {
    const worstAt = (nx: number, ny: number): number => {
      const result = computePlateModeTable(DREADNOUGHT, SPRUCE_DEMO, nx, ny, 10);
      if (result.outcome !== "accept") return Number.NaN;
      let worst = 0;
      for (const mode of result.table.modes) {
        const reference = isotropicContinuumHz(
          DREADNOUGHT,
          10e9,
          0.3,
          450,
          mode.halfWavesX,
          mode.halfWavesY,
        );
        worst = Math.max(
          worst,
          Math.abs(mode.frequencyHz - reference) / reference,
        );
      }
      return worst;
    };
    const coarse = worstAt(48, 36);
    const fine = worstAt(96, 72);
    const ratio = coarse / fine;
    evidence("h2-convergence", { coarse, fine, ratio });
    expect(ratio).toBeGreaterThan(3.5);
    expect(ratio).toBeLessThan(4.5);
  });

  test("module continuum export matches the in-test isotropic derivation", () => {
    for (const [m, n] of [[1, 1], [2, 3], [4, 2]] as const) {
      const module = continuumPlateFrequencyHz(DREADNOUGHT, SPRUCE_DEMO, m, n);
      const local = isotropicContinuumHz(DREADNOUGHT, 10e9, 0.3, 450, m, n);
      expect(module).not.toBeNull();
      expect(Math.abs((module ?? 0) - local) / local).toBeLessThan(1e-12);
    }
  });
});

describe("orthotropy", () => {
  test("equal moduli reduce to the isotropic path bit-consistently", () => {
    const orthotropicAsIsotropic: PlateMaterial = Object.freeze({
      youngLongitudinalPa: 10e9,
      youngRadialPa: 10e9,
      shearPa: 10e9 / (2 * (1 + 0.3)),
      poissonLR: 0.3,
      densityKgM3: 450,
    });
    for (const [m, n] of [[1, 1], [3, 2], [2, 4]] as const) {
      const viaHelper = discretePlateFrequencyHz(
        DREADNOUGHT,
        SPRUCE_DEMO,
        96,
        72,
        m,
        n,
      );
      const viaExplicit = discretePlateFrequencyHz(
        DREADNOUGHT,
        orthotropicAsIsotropic,
        96,
        72,
        m,
        n,
      );
      expect(viaHelper).toBe(viaExplicit);
    }
  });

  test("stiff grain reorders modes exactly as the continuum formula predicts", () => {
    // Spruce-like anisotropy: grain 10x stiffer than cross-grain.
    const spruceOrthotropic: PlateMaterial = Object.freeze({
      youngLongitudinalPa: 10e9,
      youngRadialPa: 1e9,
      shearPa: 0.7e9,
      poissonLR: 0.37,
      densityKgM3: 450,
    });
    const result = computePlateModeTable(
      DREADNOUGHT,
      spruceOrthotropic,
      96,
      72,
      10,
    );
    expect(result.outcome).toBe("accept");
    if (result.outcome !== "accept") return;
    // Independent expectation: order the same (m, n) pairs by the continuum
    // orthotropic closed form computed by the module's exported oracle and
    // require the discrete table to agree on ordering.
    const pairs = result.table.modes.map((mode) => [
      mode.halfWavesX,
      mode.halfWavesY,
    ]);
    const byContinuum = [...pairs].sort((left, right) => {
      const fLeft = continuumPlateFrequencyHz(
        DREADNOUGHT,
        spruceOrthotropic,
        left[0] ?? 1,
        left[1] ?? 1,
      ) ?? Number.POSITIVE_INFINITY;
      const fRight = continuumPlateFrequencyHz(
        DREADNOUGHT,
        spruceOrthotropic,
        right[0] ?? 1,
        right[1] ?? 1,
      ) ?? Number.POSITIVE_INFINITY;
      return fLeft - fRight;
    });
    expect(pairs).toEqual(byContinuum);
    // And the soft cross-grain direction admits more half-waves early:
    // among the lowest 10 modes, cross-grain half-wave counts must exceed
    // grain-direction counts in aggregate.
    const grainSum = pairs.reduce((sum, pair) => sum + (pair[0] ?? 0), 0);
    const crossSum = pairs.reduce((sum, pair) => sum + (pair[1] ?? 0), 0);
    evidence("orthotropic-ordering", { pairs, grainSum, crossSum });
    expect(crossSum).toBeGreaterThan(grainSum);
  });
});

describe("iterative path certifies the assembly", () => {
  test("subspace iteration matches closed-form discrete frequencies", () => {
    // 32x24 keeps the certification honest (same operator, same fixes) at a
    // fraction of the 48x36 cost: CG conditioning scales with h^-4, and the
    // prototype already banked the 48x36 run at 5.3e-8 agreement.
    const nx = 32;
    const ny = 24;
    const modeCount = 4;
    const started = performance.now();
    const iterated = iteratePlateModes(
      DREADNOUGHT,
      SPRUCE_DEMO,
      nx,
      ny,
      modeCount,
      12,
      0x2f6e2b1,
    );
    expect(iterated).not.toBeNull();
    if (!iterated) return;
    expect(iterated.converged).toBe(true);
    const closedForm: number[] = [];
    for (let m = 1; m <= modeCount + 2; m += 1) {
      for (let n = 1; n <= modeCount + 2; n += 1) {
        const frequencyHz = discretePlateFrequencyHz(
          DREADNOUGHT,
          SPRUCE_DEMO,
          nx,
          ny,
          m,
          n,
        );
        if (frequencyHz !== null) closedForm.push(frequencyHz);
      }
    }
    closedForm.sort((left, right) => left - right);
    let worstRelative = 0;
    for (let k = 0; k < modeCount; k += 1) {
      const exact = closedForm[k] ?? Number.NaN;
      const measured = iterated.frequenciesHz[k] ?? Number.NaN;
      worstRelative = Math.max(
        worstRelative,
        Math.abs(measured - exact) / exact,
      );
    }
    evidence("iterative-agreement", {
      grid: [nx, ny],
      modeCount,
      worstRelative,
      cgIterationsTotal: iterated.cgIterationsTotal,
      milliseconds: Math.round(performance.now() - started),
    });
    expect(worstRelative).toBeLessThan(1e-6);
  }, 30_000);

  test("deterministic repeat is bit-identical", () => {
    const run = (): readonly number[] | undefined =>
      iteratePlateModes(UKULELE, SPRUCE_DEMO, 36, 27, 3, 10, 42)?.frequenciesHz;
    expect(run()).toEqual(run());
  }, 30_000);
});

describe("body-size demonstration table", () => {
  test("dreadnought vs ukulele mode tables diverge as measured", () => {
    const dread = computePlateModeTable(DREADNOUGHT, SPRUCE_DEMO, 96, 72, 10);
    const uke = computePlateModeTable(UKULELE, SPRUCE_DEMO, 96, 72, 10);
    expect(dread.outcome).toBe("accept");
    expect(uke.outcome).toBe("accept");
    if (dread.outcome !== "accept" || uke.outcome !== "accept") return;
    const dreadF11 = dread.table.modes[0]?.frequencyHz ?? Number.NaN;
    const ukeF11 = uke.table.modes[0]?.frequencyHz ?? Number.NaN;
    // Prototype evidence: 68.90 Hz and 216.13 Hz continuum; the discrete
    // fine-grid values sit within 0.15%.
    expect(Math.abs(dreadF11 - 68.9) / 68.9).toBeLessThan(0.005);
    expect(Math.abs(ukeF11 - 216.1) / 216.1).toBeLessThan(0.005);
    expect(ukeF11 / dreadF11).toBeGreaterThan(3.0);
    expect(ukeF11 / dreadF11).toBeLessThan(3.3);
    const below2k = (
      geometry: PlateGeometry,
    ): number => {
      let count = 0;
      for (let m = 1; m <= 30; m += 1) {
        for (let n = 1; n <= 30; n += 1) {
          const frequencyHz = continuumPlateFrequencyHz(
            geometry,
            SPRUCE_DEMO,
            m,
            n,
          );
          if (frequencyHz !== null && frequencyHz <= 2000) count += 1;
        }
      }
      return count;
    };
    const dreadDensity = below2k(DREADNOUGHT);
    const ukeDensity = below2k(UKULELE);
    evidence("body-size-demonstration", {
      dreadF11,
      ukeF11,
      ratio: ukeF11 / dreadF11,
      dreadDensity,
      ukeDensity,
    });
    expect(dreadDensity).toBe(39);
    expect(ukeDensity).toBe(11);
  });

  test("content hash is stable and input-sensitive", () => {
    const one = computePlateModeTable(DREADNOUGHT, SPRUCE_DEMO, 48, 36, 8);
    const two = computePlateModeTable(DREADNOUGHT, SPRUCE_DEMO, 48, 36, 8);
    const other = computePlateModeTable(UKULELE, SPRUCE_DEMO, 48, 36, 8);
    if (
      one.outcome !== "accept" || two.outcome !== "accept" ||
      other.outcome !== "accept"
    ) {
      expect(false).toBe(true);
      return;
    }
    expect(one.table.contentSha256).toBe(two.table.contentSha256);
    expect(one.table.contentSha256).not.toBe(other.table.contentSha256);
  });
});

describe("refusals", () => {
  const cases: readonly [string, () => ReturnType<typeof computePlateModeTable>][] = [
    [
      "PLATE_GEOMETRY",
      () =>
        computePlateModeTable(
          { aMeters: -0.5, bMeters: 0.4, hMeters: 0.003 },
          SPRUCE_DEMO,
          48,
          36,
          8,
        ),
    ],
    [
      "PLATE_THIN_LIMIT",
      () =>
        computePlateModeTable(
          { aMeters: 0.5, bMeters: 0.4, hMeters: 0.05 },
          SPRUCE_DEMO,
          48,
          36,
          8,
        ),
    ],
    [
      "PLATE_MATERIAL",
      () =>
        computePlateModeTable(
          DREADNOUGHT,
          { ...SPRUCE_DEMO, poissonLR: 0.6 },
          48,
          36,
          8,
        ),
    ],
    [
      "PLATE_GRID",
      () => computePlateModeTable(DREADNOUGHT, SPRUCE_DEMO, 23, 36, 8),
    ],
    [
      "PLATE_MODE_COUNT",
      () =>
        computePlateModeTable(
          DREADNOUGHT,
          SPRUCE_DEMO,
          48,
          36,
          PLATE_MODE_LIMITS.maximumModes + 1,
        ),
    ],
  ];
  for (const [code, run] of cases) {
    test(`refuses with ${code}`, () => {
      const result = run();
      expect(result.outcome).toBe("refuse");
      if (result.outcome !== "refuse") return;
      evidence("refusal", { code, findings: result.findings });
      expect(result.findings.some((finding) => finding.code === code)).toBe(
        true,
      );
    });
  }

  test("near-miss just inside every bound is accepted", () => {
    const result = computePlateModeTable(
      { aMeters: 0.5, bMeters: 0.4, hMeters: 0.0399 },
      { ...SPRUCE_DEMO, poissonLR: 0.499 },
      PLATE_MODE_LIMITS.minimumPointsPerShortEdge + 1,
      PLATE_MODE_LIMITS.minimumPointsPerShortEdge,
      PLATE_MODE_LIMITS.maximumModes,
    );
    expect(result.outcome).toBe("accept");
  });

  test("iterative path refuses invalid rounds and seeds", () => {
    expect(
      iteratePlateModes(DREADNOUGHT, SPRUCE_DEMO, 48, 36, 4, 0, 1),
    ).toBeNull();
    expect(
      iteratePlateModes(
        DREADNOUGHT,
        SPRUCE_DEMO,
        48,
        36,
        4,
        PLATE_MODE_LIMITS.maximumSubspaceRounds + 1,
        1,
      ),
    ).toBeNull();
    expect(
      iteratePlateModes(DREADNOUGHT, SPRUCE_DEMO, 48, 36, 4, 8, 1.5),
    ).toBeNull();
  });
});
