/**
 * jcpe-port-contact-law-518j: independent proof for the foundry contact-law
 * port (Hertz sphere/cylinder/elliptic, Hunt-Crossley, refusing envelope,
 * Hunt-Crossley fit helper). Analytic expectations are recomputed in-test
 * from the textbook formulas, never read back from the module under test.
 */
import { describe, expect, test } from "bun:test";

import {
  type ApplicabilityInput,
  type ApplicabilityLimits,
  type ContactRequest,
  type HuntCrossleySample,
  completeEllipticIntegrals,
  evaluateContact,
  fitHuntCrossley,
} from "../../scripts/physical-foundry-contact";

/** Steel-on-steel textbook case: E = 210 GPa, nu = 0.3, identical bodies. */
const STEEL_E = 210e9;
const STEEL_NU = 0.3;
const REDUCED_MODULUS = STEEL_E / (2 * (1 - STEEL_NU * STEEL_NU));
const RADIUS_M = 0.01;
const INDENT_M = 1e-5;

const OPEN_APPLICABILITY: ApplicabilityInput = Object.freeze({
  halfSpaceDepthM: 1,
  layerThicknessM: 1,
  yieldStrengthPa: 5e9,
  characteristicRateMPerS: 1,
  temperatureK: 293,
  adhesionEnergyJPerM2: 0,
});

const OPEN_LIMITS: ApplicabilityLimits = Object.freeze({
  maxPatchToRadius: 0.3,
  maxStrain: 0.1,
  maxPatchToDepth: 0.1,
  maxPatchToLayer: 0.1,
  maxPressureToYield: 1,
  maxRateRatio: 10,
  minTemperatureK: 200,
  maxTemperatureK: 400,
});

function sphereRequest(overrides: Partial<ContactRequest> = {}): ContactRequest {
  return {
    modelId: "hertz-steel-demo",
    sourceId: "unit-test",
    stateId: "case-1",
    law: {
      kind: "hertz-sphere-plane",
      effectiveRadiusM: RADIUS_M,
      reducedModulusPa: REDUCED_MODULUS,
    },
    geometry: "sphere-plane",
    indentationM: INDENT_M,
    indentationRateMPerS: 0,
    stepS: 1e-4,
    lineLoadNPerM: 0,
    applicability: OPEN_APPLICABILITY,
    limits: OPEN_LIMITS,
    ...overrides,
  };
}

function evidence(caseId: string, payload: unknown): void {
  console.log(JSON.stringify({ kind: "contact-evidence", caseId, payload }));
}

describe("Hertz sphere against textbook values", () => {
  test("force, patch, pressure, tangent, and energy match closed forms", () => {
    const outcome = evaluateContact(sphereRequest());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || outcome.receipt.kind !== "point") throw new Error("expected point");
    const receipt = outcome.receipt;
    const expectedForce = (4 / 3) * REDUCED_MODULUS * Math.sqrt(RADIUS_M) * INDENT_M ** 1.5;
    const expectedPatch = Math.sqrt(RADIUS_M * INDENT_M);
    const expectedPressure = (1.5 * expectedForce) / (Math.PI * expectedPatch * expectedPatch);
    const expectedTangent = 2 * REDUCED_MODULUS * expectedPatch;
    const expectedReversible = 0.4 * expectedForce * INDENT_M;
    expect(Math.abs(receipt.normalForceN / expectedForce - 1)).toBeLessThan(1e-14);
    expect(Math.abs(receipt.patchRadiusM / expectedPatch - 1)).toBeLessThan(1e-14);
    expect(Math.abs(receipt.peakPressurePa / expectedPressure - 1)).toBeLessThan(1e-14);
    expect(Math.abs(receipt.tangentNPerM / expectedTangent - 1)).toBeLessThan(1e-14);
    expect(Math.abs(receipt.reversibleEnergyJ / expectedReversible - 1)).toBeLessThan(1e-14);
    expect(receipt.dissipatedPowerW).toBe(0);
    evidence("hertz-sphere-textbook", {
      forceN: receipt.normalForceN,
      expectedForce,
      patchM: receipt.patchRadiusM,
      peakPressurePa: receipt.peakPressurePa,
    });
  });

  test("deterministic receipts: identical requests hash identically", () => {
    const first = evaluateContact(sphereRequest());
    const second = evaluateContact(sphereRequest());
    if (!first.ok || !second.ok) throw new Error("expected receipts");
    expect(first.receipt.receiptSha256).toBe(second.receipt.receiptSha256);
    const third = evaluateContact(sphereRequest({ indentationM: INDENT_M * 1.0000001 }));
    if (!third.ok) throw new Error("expected receipt");
    expect(third.receipt.receiptSha256).not.toBe(first.receipt.receiptSha256);
  });
});

describe("elliptic paraboloid", () => {
  test("equal curvatures reduce exactly to the sphere solution", () => {
    const curvature = 1 / RADIUS_M;
    const elliptic = evaluateContact(
      sphereRequest({
        law: {
          kind: "hertz-elliptic-paraboloid",
          maximumPrincipalCurvatureMInverse: curvature,
          minimumPrincipalCurvatureMInverse: curvature,
          reducedModulusPa: REDUCED_MODULUS,
        },
        geometry: "elliptic-paraboloid",
      }),
    );
    const sphere = evaluateContact(sphereRequest());
    if (!elliptic.ok || !sphere.ok) throw new Error("expected receipts");
    if (elliptic.receipt.kind !== "point" || sphere.receipt.kind !== "point") {
      throw new Error("expected point receipts");
    }
    expect(
      Math.abs(elliptic.receipt.normalForceN / sphere.receipt.normalForceN - 1),
    ).toBeLessThan(1e-14);
    expect(
      Math.abs(elliptic.receipt.patchRadiusM / sphere.receipt.patchRadiusM - 1),
    ).toBeLessThan(1e-14);
    expect(elliptic.receipt.ellipticPatchAxes?.aspectRatio).toBe(1);
  });

  test("near-equal curvatures stay within a small perturbation of the sphere", () => {
    const curvature = 1 / RADIUS_M;
    const outcome = evaluateContact(
      sphereRequest({
        law: {
          kind: "hertz-elliptic-paraboloid",
          maximumPrincipalCurvatureMInverse: curvature,
          minimumPrincipalCurvatureMInverse: 0.999 * curvature,
          reducedModulusPa: REDUCED_MODULUS,
        },
        geometry: "elliptic-paraboloid",
      }),
    );
    const sphere = evaluateContact(sphereRequest());
    if (!outcome.ok || !sphere.ok) throw new Error("expected receipts");
    if (outcome.receipt.kind !== "point" || sphere.receipt.kind !== "point") {
      throw new Error("expected point receipts");
    }
    expect(Math.abs(outcome.receipt.normalForceN / sphere.receipt.normalForceN - 1)).toBeLessThan(
      1e-3,
    );
    const axes = outcome.receipt.ellipticPatchAxes;
    expect(axes).not.toBeNull();
    expect((axes?.aspectRatio ?? 0) > 1).toBe(true);
  });

  test("AGM kernel matches the source's reference values at m = 0.5", () => {
    const integrals = completeEllipticIntegrals(0.5);
    expect(integrals).not.toBeNull();
    if (integrals === null) throw new Error("unreachable");
    expect(Math.abs(integrals[0] - 1.8540746773013719)).toBeLessThan(2e-15);
    expect(Math.abs(integrals[1] - 1.3506438810476755)).toBeLessThan(2e-15);
  });

  test("shape solve inverts the curvature ratio (100:25 case)", () => {
    const outcome = evaluateContact(
      sphereRequest({
        law: {
          kind: "hertz-elliptic-paraboloid",
          maximumPrincipalCurvatureMInverse: 100,
          minimumPrincipalCurvatureMInverse: 25,
          reducedModulusPa: REDUCED_MODULUS,
        },
        geometry: "elliptic-paraboloid",
        indentationM: 1e-6,
      }),
    );
    if (!outcome.ok || outcome.receipt.kind !== "point") throw new Error("expected point");
    const aspect = outcome.receipt.ellipticPatchAxes?.aspectRatio ?? 0;
    const q = 1 / (aspect * aspect);
    const integrals = completeEllipticIntegrals(1 - q);
    if (integrals === null) throw new Error("unreachable");
    const recovered = (integrals[0] - integrals[1]) / (integrals[1] / q - integrals[0]);
    expect(Math.abs(recovered - 0.25)).toBeLessThan(3e-13);
    evidence("elliptic-100-25", { aspect, recovered });
  });

  test("extreme aspect ratios refuse with the named finding", () => {
    const outcome = evaluateContact(
      sphereRequest({
        law: {
          kind: "hertz-elliptic-paraboloid",
          maximumPrincipalCurvatureMInverse: 1e14,
          minimumPrincipalCurvatureMInverse: 1e-2,
          reducedModulusPa: REDUCED_MODULUS,
        },
        geometry: "elliptic-paraboloid",
        indentationM: 1e-9,
      }),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    expect(outcome.finding.code).toBe("CONTACT_ELLIPTIC_ASPECT");
  });
});

describe("Hunt-Crossley", () => {
  const LAMBDA = 0.4;

  function huntCrossley(rate: number): ContactRequest {
    return sphereRequest({
      law: {
        kind: "hunt-crossley-sphere",
        effectiveRadiusM: RADIUS_M,
        reducedModulusPa: REDUCED_MODULUS,
        dissipationSPerM: LAMBDA,
      },
      indentationRateMPerS: rate,
    });
  }

  test("lambda = 0 equals the pure Hertz force bitwise", () => {
    const zeroLambda = evaluateContact(
      sphereRequest({
        law: {
          kind: "hunt-crossley-sphere",
          effectiveRadiusM: RADIUS_M,
          reducedModulusPa: REDUCED_MODULUS,
          dissipationSPerM: 0,
        },
        indentationRateMPerS: 0.02,
      }),
    );
    const hertz = evaluateContact(sphereRequest());
    if (!zeroLambda.ok || !hertz.ok) throw new Error("expected receipts");
    if (zeroLambda.receipt.kind !== "point" || hertz.receipt.kind !== "point") {
      throw new Error("expected point receipts");
    }
    expect(zeroLambda.receipt.normalForceN).toBe(hertz.receipt.normalForceN);
    expect(zeroLambda.receipt.dissipatedPowerW).toBe(0);
  });

  test("dissipation is positive for both loading and unloading", () => {
    let totalWork = 0;
    for (const rate of [0.05, 0.02, -0.02, -0.05]) {
      const outcome = evaluateContact(huntCrossley(rate));
      if (!outcome.ok || outcome.receipt.kind !== "point") throw new Error("expected point");
      expect(outcome.receipt.dissipatedPowerW).toBeGreaterThan(0);
      totalWork += outcome.receipt.irreversibleWorkJ;
      const elastic = (4 / 3) * REDUCED_MODULUS * Math.sqrt(RADIUS_M) * INDENT_M ** 1.5;
      const expectedPower = elastic * LAMBDA * rate * rate;
      expect(Math.abs(outcome.receipt.dissipatedPowerW / expectedPower - 1)).toBeLessThan(1e-13);
    }
    expect(totalWork).toBeGreaterThan(0);
    evidence("hunt-crossley-cycle", { totalWorkJ: totalWork });
  });

  test("a negative force factor refuses instead of predicting adhesion", () => {
    const outcome = evaluateContact(huntCrossley(-5));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    expect(outcome.finding.code).toBe("CONTACT_APPLICABILITY");
    expect(outcome.finding.field).toBe("Hunt-Crossley force factor");
  });
});

describe("Hertz cylinder (per unit length)", () => {
  function cylinderRequest(lineLoad: number): ContactRequest {
    return sphereRequest({
      law: {
        kind: "hertz-cylinder-plane",
        effectiveRadiusM: RADIUS_M,
        reducedModulusPa: REDUCED_MODULUS,
      },
      geometry: "cylinder-plane",
      indentationM: 0,
      lineLoadNPerM: lineLoad,
    });
  }

  test("zero line load returns the zero receipt", () => {
    const outcome = evaluateContact(cylinderRequest(0));
    if (!outcome.ok || outcome.receipt.kind !== "line") throw new Error("expected line");
    expect(outcome.receipt.normalLineLoadNPerM).toBe(0);
    expect(outcome.receipt.patchHalfWidthM).toBe(0);
    expect(outcome.receipt.peakPressurePa).toBe(0);
  });

  test("positive line load matches the closed forms", () => {
    const q = 1000;
    const outcome = evaluateContact(cylinderRequest(q));
    if (!outcome.ok || outcome.receipt.kind !== "line") throw new Error("expected line");
    const a = Math.sqrt((4 * q * RADIUS_M) / (Math.PI * REDUCED_MODULUS));
    const log = Math.log((4 * RADIUS_M) / a);
    const approach = (q * (log + 0.5)) / (Math.PI * REDUCED_MODULUS);
    const p0 = (2 * q) / (Math.PI * a);
    const energy = (q * q * (log + 0.75)) / (2 * Math.PI * REDUCED_MODULUS);
    expect(Math.abs(outcome.receipt.patchHalfWidthM / a - 1)).toBeLessThan(1e-14);
    expect(Math.abs(outcome.receipt.approachM / approach - 1)).toBeLessThan(1e-14);
    expect(Math.abs(outcome.receipt.peakPressurePa / p0 - 1)).toBeLessThan(1e-14);
    expect(Math.abs(outcome.receipt.reversibleEnergyJPerM / energy - 1)).toBeLessThan(1e-14);
    evidence("hertz-cylinder", { a, approach, p0 });
  });
});

describe("refusing applicability envelope", () => {
  test.each([
    ["patch_to_radius", { maxPatchToRadius: 0.01 }],
    ["strain", { maxStrain: 1e-4 }],
    ["patch_to_depth", { maxPatchToDepth: 1e-5 }],
    ["patch_to_layer", { maxPatchToLayer: 1e-5 }],
    ["pressure_to_yield", { maxPressureToYield: 0.1 }],
  ] as const)("%s violation refuses with the named ratio", (field, tightened) => {
    const outcome = evaluateContact(
      sphereRequest({ limits: { ...OPEN_LIMITS, ...tightened } }),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    expect(outcome.finding.code).toBe("CONTACT_APPLICABILITY");
    expect(outcome.finding.field).toBe(field);
    expect(outcome.finding.value).toBeGreaterThan(outcome.finding.limit ?? Number.NaN);
  });

  test("rate_ratio violation refuses", () => {
    const outcome = evaluateContact(
      sphereRequest({
        indentationRateMPerS: 100,
        limits: { ...OPEN_LIMITS, maxRateRatio: 1 },
      }),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    expect(outcome.finding.field).toBe("rate_ratio");
  });

  test("temperature outside its window refuses", () => {
    const outcome = evaluateContact(
      sphereRequest({ applicability: { ...OPEN_APPLICABILITY, temperatureK: 500 } }),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    expect(outcome.finding.field).toBe("temperature_k");
  });

  test("nonzero adhesion refuses (JKR/DMT territory)", () => {
    const outcome = evaluateContact(
      sphereRequest({ applicability: { ...OPEN_APPLICABILITY, adhesionEnergyJPerM2: 0.05 } }),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    expect(outcome.finding.code).toBe("CONTACT_ADHESION");
  });

  test("geometry/law mismatch and unsupported geometry refuse", () => {
    const mismatch = evaluateContact(sphereRequest({ geometry: "cylinder-plane" }));
    expect(mismatch.ok).toBe(false);
    if (mismatch.ok) throw new Error("unreachable");
    expect(mismatch.finding.code).toBe("CONTACT_GEOMETRY_MISMATCH");
    const unsupported = evaluateContact(
      sphereRequest({ geometry: "toroidal-or-highly-elliptical" }),
    );
    expect(unsupported.ok).toBe(false);
    if (unsupported.ok) throw new Error("unreachable");
    expect(unsupported.finding.code).toBe("CONTACT_GEOMETRY_UNSUPPORTED");
  });

  test("blank identity refuses", () => {
    const outcome = evaluateContact(sphereRequest({ stateId: "  " }));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    expect(outcome.finding.code).toBe("CONTACT_IDENTITY");
  });

  test("just-inside every measured ratio passes (near-miss control)", () => {
    const probe = evaluateContact(sphereRequest());
    if (!probe.ok || probe.receipt.kind !== "point") throw new Error("expected point");
    const r = probe.receipt.ratios;
    const snug: ApplicabilityLimits = {
      maxPatchToRadius: r.patchToRadius * 1.001,
      maxStrain: r.strain * 1.001,
      maxPatchToDepth: r.patchToDepth * 1.001,
      maxPatchToLayer: r.patchToLayer * 1.001,
      maxPressureToYield: r.pressureToYield * 1.001,
      maxRateRatio: Math.max(r.rateRatio * 1.001, 1e-12),
      minTemperatureK: 292,
      maxTemperatureK: 294,
    };
    const outcome = evaluateContact(sphereRequest({ limits: snug }));
    expect(outcome.ok).toBe(true);
    evidence("envelope-near-miss", { ratios: r });
  });
});

describe("Hunt-Crossley fit helper", () => {
  const TRUE_K = 2.3e6;
  const TRUE_N = 1.28;
  const TRUE_LAMBDA = 0.35;

  function loopSamples(noiseAmplitude: number, seedOffset: number): HuntCrossleySample[] {
    // Deterministic pseudo-noise independent of the module's stream.
    let state = 0x9e3779b9 ^ seedOffset;
    const noise = (): number => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return (state / 4294967296 - 0.5) * 2;
    };
    const samples: HuntCrossleySample[] = [];
    for (let index = 0; index < 40; index += 1) {
      const phase = (index / 40) * Math.PI;
      const indentation = 1e-4 * Math.sin(phase) + 1e-6;
      const rate = 0.3 * Math.cos(phase);
      const force = TRUE_K * indentation ** TRUE_N * (1 + TRUE_LAMBDA * rate);
      samples.push({
        indentationM: indentation,
        indentationRateMPerS: rate,
        forceN: force * (1 + noiseAmplitude * noise()),
      });
    }
    return samples;
  }

  test("noiseless samples recover (k, n, lambda) to 1e-6 relative", () => {
    const fit = fitHuntCrossley(loopSamples(0, 1), {
      seed: 7,
      alpha: 0.2,
      escalateHalfWidthFraction: 0.02,
    });
    expect(fit).not.toBeNull();
    if (fit === null) throw new Error("unreachable");
    expect(fit.gradientGatePassed).toBe(true);
    expect(Math.abs(fit.stiffnessK / TRUE_K - 1)).toBeLessThan(1e-6);
    expect(Math.abs(fit.exponentN / TRUE_N - 1)).toBeLessThan(1e-6);
    expect(Math.abs(fit.dissipationLambda / TRUE_LAMBDA - 1)).toBeLessThan(1e-6);
    expect(fit.escalate).toBe(false);
    evidence("fit-noiseless", fit);
  });

  test("noisy samples recover within tolerance and report an honest band", () => {
    const fit = fitHuntCrossley(loopSamples(0.005, 2), {
      seed: 11,
      alpha: 0.2,
      escalateHalfWidthFraction: 0.05,
    });
    expect(fit).not.toBeNull();
    if (fit === null) throw new Error("unreachable");
    expect(Math.abs(fit.stiffnessK / TRUE_K - 1)).toBeLessThan(0.05);
    expect(Math.abs(fit.exponentN / TRUE_N - 1)).toBeLessThan(0.05);
    expect(Math.abs(fit.dissipationLambda / TRUE_LAMBDA - 1)).toBeLessThan(0.1);
    expect(fit.conformalHalfWidthN).not.toBeNull();
    evidence("fit-noisy", fit);
  });

  test("a too-tight escalation threshold forces escalate on noisy data", () => {
    const fit = fitHuntCrossley(loopSamples(0.02, 3), {
      seed: 13,
      alpha: 0.2,
      escalateHalfWidthFraction: 1e-6,
    });
    expect(fit).not.toBeNull();
    if (fit === null) throw new Error("unreachable");
    expect(fit.escalate).toBe(true);
  });

  test("fits are deterministic per seed", () => {
    const first = fitHuntCrossley(loopSamples(0.005, 2), {
      seed: 11,
      alpha: 0.2,
      escalateHalfWidthFraction: 0.05,
    });
    const second = fitHuntCrossley(loopSamples(0.005, 2), {
      seed: 11,
      alpha: 0.2,
      escalateHalfWidthFraction: 0.05,
    });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  test("degenerate inputs refuse", () => {
    expect(fitHuntCrossley([], { seed: 1, alpha: 0.2, escalateHalfWidthFraction: 0.05 })).toBeNull();
    const bad = loopSamples(0, 1);
    bad[0] = { indentationM: -1, indentationRateMPerS: 0, forceN: 1 };
    expect(fitHuntCrossley(bad, { seed: 1, alpha: 0.2, escalateHalfWidthFraction: 0.05 })).toBeNull();
  });
});
