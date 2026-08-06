import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  FOUNDRY_LIMITS,
  assessMetricExpectation,
  canonicalJson,
  evaluateAnalyticMetricCase,
  generateRustParameterTable,
  parameterPackContentSha256,
  runFoundryCorpus,
  validateParameterPack,
} from "../../scripts/physical-foundry";
import { verletStep } from "../../scripts/physical-foundry-verlet";
import metricFixture from "../fixtures/physical-foundry/metric-cases.json";
import extraction from "../fixtures/physical-foundry/frankensim-extraction.json";
import provenanceLedger from "../fixtures/physical-foundry/provenance-ledger.json";

type MutableRecord = Record<string, unknown>;

function reviewedPack(): MutableRecord {
  const pack: MutableRecord = {
    schema: "changes.physical.parameter-pack.v1",
    packVersion: "clarinet-laboratory-v1",
    family: "clarinet",
    parameters: [
      { id: "reed.stiffness", unit: "N/m", value: 1_700, minimum: 800, maximum: 3_000, sourceAuthorityId: "authority-primary-measurement", method: "static-load-fit", licenseGrant: "CC-BY-4.0", sensitivity: "high" },
      { id: "bore.length", unit: "m", value: 0.66, minimum: 0.64, maximum: 0.68, sourceAuthorityId: "authority-reviewed-literature", method: "dimensional-survey", licenseGrant: "CC-BY-4.0", sensitivity: "medium" },
    ],
    sourceDigests: ["1".repeat(64), "a".repeat(64)],
    solver: {
      name: "bounded-verlet-fit",
      version: 1,
      commit: "foundry-build-v1",
      config: { integrator: "velocity-verlet", stepSeconds: 0.000_125 },
      seed: 193,
      evaluations: 312,
      maximumEvaluations: 4_096,
      gradientChecks: 32,
      scratchBytes: 1_048_576,
    },
    objectives: [{ id: "impedance-peaks", weight: 1 }, { id: "decay-slopes", weight: 0.5 }],
    residuals: { terminal: 0.0008, maximum: 0.001 },
    sensitivity: { perturbations: 64, maximumNormalizedChange: 0.025, reviewedMaximum: 0.03 },
    review: { reviewer: "independent-domain-reviewer", date: "2026-08-06" },
    distributionClass: "distributable",
    modes: [{ estimateHz: 146.83, lowerHz: 146.81, upperHz: 146.85, residual: 0.00002 }],
    applicabilityBounds: { midiMinimum: 50, midiMaximum: 94, velocityMinimum: 1, velocityMaximum: 127 },
  };
  pack["contentSha256"] = parameterPackContentSha256(pack);
  return pack;
}

function rehash(pack: MutableRecord): void {
  pack["contentSha256"] = parameterPackContentSha256(pack);
}

function firstCode(pack: unknown, ledger: unknown = provenanceLedger): string | undefined {
  return validateParameterPack(pack, ledger).findings[0]?.code;
}

describe("PHS1 production parameter packs", () => {
  test("canonical JSON is key-order independent, finite, LF-terminated, and excludes the digest field", () => {
    expect(canonicalJson({ z: [3, 2, 1], a: { y: true, x: 0.125 } })).toBe(
      "{\"a\":{\"x\":0.125,\"y\":true},\"z\":[3,2,1]}\n",
    );
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
    const pack = reviewedPack();
    const digest = pack["contentSha256"];
    pack["contentSha256"] = "f".repeat(64);
    expect(parameterPackContentSha256(pack)).toBe(digest);
    expect(() => canonicalJson({ value: Number.NaN })).toThrow("FOUNDRY_NON_FINITE_NUMBER");
    expect(() => canonicalJson({ value: undefined })).toThrow("FOUNDRY_NON_JSON_VALUE");
  });

  test("accepts a reviewed distributable pack and generates byte-identical sorted data-only Rust", () => {
    const pack = reviewedPack();
    expect(validateParameterPack(pack, provenanceLedger)).toEqual({ outcome: "accept", findings: [] });
    const generated = generateRustParameterTable(pack, provenanceLedger);
    expect(generated).toBe(generateRustParameterTable(structuredClone(pack), structuredClone(provenanceLedger)));
    expect(generated).toContain(`PARAMETER_PACK_SHA256: &str = "${String(pack["contentSha256"])}"`);
    expect(generated).toContain("CERTIFIED_MODES");
    expect(generated).toContain("APPLICABILITY_BOUNDS_JSON");
    expect(generated?.indexOf("bore.length")).toBeLessThan(generated?.indexOf("reed.stiffness") ?? 0);
    expect(generated).not.toMatch(/optimizer|filesystem|fetch\(|sourceDigests/i);
  });

  test("Rust generation escapes hostile reviewed strings without emitting JSON-only escapes", () => {
    const pack = reviewedPack();
    pack["family"] = "clarinet \"A\" \\ bore\nα";
    (pack["applicabilityBounds"] as MutableRecord)["note\u0001"] = "line\nquoted \"value\"";
    rehash(pack);
    const generated = generateRustParameterTable(pack, provenanceLedger);
    expect(generated).toContain("clarinet \\\"A\\\" \\\\ bore\\nα");
    expect(generated).toContain("\\\\u0001");
    expect(generated).not.toContain("\u0001");
  });

  const mutations: readonly [string, (pack: MutableRecord) => void, string][] = [
    ["digest disagreement", (pack) => { pack["contentSha256"] = "0".repeat(64); }, "PHS1_CONTENT_DIGEST"],
    ["unknown unit", (pack) => { ((pack["parameters"] as MutableRecord[])[0] as MutableRecord)["unit"] = "reed-units"; rehash(pack); }, "PHS1_PARAMETER_UNIT"],
    ["out-of-range scalar", (pack) => { ((pack["parameters"] as MutableRecord[])[0] as MutableRecord)["value"] = 3_000.0001; rehash(pack); }, "PHS1_PARAMETER_RANGE"],
    ["unlicensed authority", (pack) => { ((pack["parameters"] as MutableRecord[])[0] as MutableRecord)["sourceAuthorityId"] = "authority-local-corpus"; rehash(pack); }, "PHS1_PROVENANCE"],
    ["evaluation plus one", (pack) => { (pack["solver"] as MutableRecord)["evaluations"] = 4_097; rehash(pack); }, "PHS1_WORK_BOUND"],
    ["residual near miss", (pack) => { (pack["residuals"] as MutableRecord)["terminal"] = 0.001_000_1; rehash(pack); }, "PHS1_RESIDUAL"],
    ["sensitivity near miss", (pack) => { (pack["sensitivity"] as MutableRecord)["maximumNormalizedChange"] = 0.030_001; rehash(pack); }, "PHS1_SENSITIVITY"],
    ["regime plus one", (pack) => { pack["regimes"] = Array.from({ length: 33 }, (_, index) => ({ id: `regime-${String(index)}` })); rehash(pack); }, "PHS1_WORK_BOUND"],
    ["duplicate objective", (pack) => { pack["objectives"] = [{ id: "same", weight: 1 }, { id: "same", weight: 0.5 }]; rehash(pack); }, "PHS1_OBJECTIVES"],
    ["uncertified mode", (pack) => { ((pack["modes"] as MutableRecord[])[0] as MutableRecord)["estimateHz"] = 146.86; rehash(pack); }, "PHS1_MODE_CERTIFICATE"],
  ];

  for (const [name, mutate, code] of mutations) {
    test(`refuses ${name} with the ordered diagnostic`, () => {
      const pack = reviewedPack();
      mutate(pack);
      expect(firstCode(pack)).toBe(code);
      expect(generateRustParameterTable(pack, provenanceLedger)).toBeNull();
    });
  }

  test("refuses a malformed authority ledger before generation", () => {
    expect(firstCode(reviewedPack(), { schema: "wrong", authorities: [] })).toBe("PHS1_PROVENANCE");
  });
});

describe("PHS1 independent analytic metrics and bounded receipts", () => {
  for (const fixtureCase of metricFixture.cases) {
    test(`${fixtureCase.id} reproduces its independent known answer`, () => {
      const metric = evaluateAnalyticMetricCase(fixtureCase);
      expect(metric.outcome).toBe("accept");
      const expectedOutcome = "outcome" in fixtureCase.expected ? fixtureCase.expected.outcome : "accept";
      expect(assessMetricExpectation(fixtureCase, metric)).toBe(expectedOutcome);
    });
  }

  test("a single-variable oracle mutation cannot certify the same centroid", () => {
    const fixtureCase = structuredClone(metricFixture.cases[4]);
    fixtureCase.expected.centroidHz = 200;
    const metric = evaluateAnalyticMetricCase(fixtureCase);
    expect(metric.centroidHz).toBe(250);
    expect(assessMetricExpectation(fixtureCase, metric)).toBe("refuse");
  });

  test("octave transposition preserves the analytic frequency ratio", () => {
    const lower = evaluateAnalyticMetricCase({ family: "fundamental-pitch", signal: { frequencyHz: 220 } });
    const upper = evaluateAnalyticMetricCase({ family: "fundamental-pitch", signal: { frequencyHz: 440 } });
    expect(Number(upper.frequencyHz) / Number(lower.frequencyHz)).toBe(2);
  });

  test("receipt replay is deterministic and the plus-one corpus refuses before work", () => {
    const receipt = runFoundryCorpus(metricFixture.cases);
    expect(receipt.outcome).toBe("accept");
    expect(receipt.firstDiagnostic).toBeNull();
    expect(receipt.casesVisited).toBe(16);
    expect(receipt.wallTimeAffectsOutput).toBe(false);
    expect(receipt).toMatchObject({
      solverRevisions: [],
      workCounters: { casesVisited: 16 },
      residualIntervals: [],
      mutations: ["metric-near-miss-alias"],
      distributionDecision: "not-applicable-synthetic-metrics",
    });
    expect(runFoundryCorpus(structuredClone(metricFixture.cases))).toEqual(receipt);
    const boundary = Array.from({ length: FOUNDRY_LIMITS.maximumSourceObservations }, () => metricFixture.cases[0]);
    expect(runFoundryCorpus(boundary).casesVisited).toBe(FOUNDRY_LIMITS.maximumSourceObservations);
    expect(runFoundryCorpus([...boundary, metricFixture.cases[0]])).toEqual({
      schema: "changes.physical.foundry-receipt.v1",
      outcome: "refuse",
      firstDiagnostic: "PHS1_WORK_BOUND",
      casesVisited: 0,
    });
  });
});

describe("reviewed FrankenSim Verlet concept", () => {
  test("carries the owner-approved file-level provenance pin", () => {
    const source = readFileSync(new URL("../../scripts/physical-foundry-verlet.ts", import.meta.url), "utf8");
    expect(extraction).toMatchObject({
      schema: "changes.physical.frankensim-extraction.v1",
      sourceCommit: "b47259187a31b704f8f0faf6abdf49b32919b96a",
      sourceSha256: "bdf6f36d4679c9f5be1789952a3b738a070debbaf4eb8a8770fe7fba94102277",
      extractedSymbol: "verlet_step",
    });
    expect(source).toContain(extraction.sourcePath);
    expect(source).toContain(extraction.sourceCommit);
    expect(source).toContain(extraction.retrievedDate);
    expect(source.replace(/\s+/g, " ")).toContain("MIT License with the OpenAI/Anthropic Rider");
  });

  test("is deterministic, bounded-energy for a harmonic oscillator, and fail-closed on shape", () => {
    const integrate = (): [number, number] => {
      const position = [1];
      const momentum = [0];
      const scratch = [0];
      for (let step = 0; step < 10_000; step += 1) {
        if (!verletStep(position, momentum, 0.001, (q, output) => { output[0] = -(q[0] ?? 0); }, scratch)) throw new Error("VERLET_REFUSED_VALID_STATE");
      }
      return [position[0] ?? 0, momentum[0] ?? 0];
    };
    const first = integrate();
    expect(integrate()).toEqual(first);
    expect(Math.abs(0.5 * (first[0] ** 2 + first[1] ** 2) - 0.5)).toBeLessThan(0.000_001);
    expect(verletStep([1], [], 0.001, () => {}, [0])).toBe(false);
    expect(verletStep([1], [0], 0, () => {}, [0])).toBe(false);
  });
});
