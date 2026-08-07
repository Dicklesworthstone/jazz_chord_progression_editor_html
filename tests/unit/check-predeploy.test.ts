/**
 * Predeploy model-acceptance gate coverage (bead jcpe-deploy-listening-gate-rw2n).
 *
 * The gate exists because waveguide-clarinet@2 shipped to production through
 * an engine gesture-routing override while the recipe registry still pointed
 * at @1. These tests pin both halves: the reachability scan must catch
 * engine-routed ids the registry does not name, and the ledger evaluation
 * must fail closed for every non-accepting state.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  LEDGER_PATH,
  collectEngineRoutedAlgorithmIds,
  collectRecipeAlgorithmIds,
  evaluateGate,
  parseLedger,
  type LedgerRow,
} from "../../scripts/check-predeploy";
import {
  buildGateEvidence,
  sha256Hex,
  windReferencePolicySha256,
  type GateEvidenceV1,
  type SignalFeatures,
} from "../../scripts/reference-similarity";
import { runPluckedV2ReleaseGate } from "../../scripts/run-plucked-v2-release-gate";

const root = resolve(import.meta.dir, "../..");

function approvedRow(algorithmId: string): LedgerRow {
  return {
    algorithmId,
    status: "approved",
    evidence: "owner-approved artifact 67b9ae08",
    decidedBy: "owner",
    date: "2026-08-06",
  };
}

const passingFeatures: SignalFeatures = {
  pitch: { f0Hz: 440, centsFromExpected: 0, periodicity: 0.9 },
  integratedBandDb: [-12, -18],
  harmonicProfileDb: [0, -6, -12],
  hnrDb: 24,
  highBandShareDb: -36,
  onsetSeconds: 0.02,
  attackTo90SustainSeconds: 0.08,
};

function passingEvidence(rendererAlgorithmId: string): GateEvidenceV1 {
  const digest = (label: string): string => sha256Hex(label);
  return buildGateEvidence({
    outcome: "pass",
    rendererAlgorithmId,
    corpusId: "independent-winds@1",
    referencePath: "clarinet/a4.wav",
    alternativeReferencePath: "flute/a4.wav",
    referenceLicenseId: "CC0-1.0",
    expectedMidi: 69,
    expectedHz: 440,
    digests: {
      analyzerImplementationSha256: digest("analyzer"),
      policySha256: windReferencePolicySha256(),
      rendererSourceSha256: digest("renderer"),
      wasmSha256: digest("wasm"),
      parameterPackSha256: digest("pack"),
      renderRequestSha256: digest("request"),
      pcmSha256: digest("pcm"),
      corpusManifestSha256: digest("corpus"),
      referenceFileSha256: digest("reference"),
      alternativeReferenceFileSha256: digest("alternative-reference"),
    },
    controls: {
      self: true,
      whiteNoiseRejected: true,
      overlyPureRejected: true,
      wrongPitchRejected: true,
      crossInstrumentRejected: true,
    },
    report: {
      candidate: passingFeatures,
      reference: passingFeatures,
      pitchDeltaCents: 0,
      envelopeDb: 0,
      harmonicDb: 0,
      attackLog2: 0,
      hnrAbsoluteDeltaDb: 0,
      highBandAbsoluteDeltaDb: 0,
    },
    identityComparison: {
      targetTimbreDistanceDb: 0,
      alternativeTimbreDistanceDb: 10,
      targetAdvantageDb: 10,
    },
    findings: [],
  });
}

describe("shipping-id collection", () => {
  test("recipe registry ids include every rendered recipe and the impulse", () => {
    const ids = collectRecipeAlgorithmIds();
    expect(ids).toContain("changes.dsp.concert-grand@1");
    expect(ids).toContain("changes.dsp.waveguide-clarinet@1");
    expect(ids).toContain("changes.audio.impulse.hall-quartic-q15.v2");
  });

  test("the engine-routing scan catches the clarinet@2 override the registry does not name", () => {
    const dspRendererSource = readFileSync(
      resolve(root, "src/audio/dsp-renderer.ts"),
      "utf8",
    );
    const audioEngineSource = readFileSync(
      resolve(root, "src/audio/audio-engine.ts"),
      "utf8",
    );
    const routed = collectEngineRoutedAlgorithmIds(dspRendererSource, audioEngineSource);
    expect(routed).toContain("changes.dsp.waveguide-clarinet@2");
    expect(collectRecipeAlgorithmIds()).not.toContain("changes.dsp.waveguide-clarinet@2");
  });

  test("a synthetic engine constant reference is detected; an unreferenced one is not", () => {
    const dsp = [
      'export const A_ID =\n  "changes.dsp.model-a@1";',
      'export const B_ID =\n  "changes.dsp.model-b@1";',
    ].join("\n");
    const engine = "import { A_ID } from './dsp-renderer'; use(A_ID);";
    const routed = collectEngineRoutedAlgorithmIds(dsp, engine);
    expect(routed).toContain("changes.dsp.model-a@1");
    expect(routed).not.toContain("changes.dsp.model-b@1");
  });
});

describe("ledger evaluation fails closed", () => {
  const ship = ["changes.dsp.model-a@1"];

  test("green ledger passes", () => {
    expect(evaluateGate(ship, [approvedRow("changes.dsp.model-a@1")], () => undefined)).toEqual([]);
  });

  test("open row on a shipping id fails with a named finding", () => {
    const rows: LedgerRow[] = [{ ...approvedRow("changes.dsp.model-a@1"), status: "open" }];
    const findings = evaluateGate(ship, rows, () => undefined);
    expect(findings.map((finding) => finding.code)).toEqual(["MODEL_OPEN"]);
  });

  test("red row fails with a named finding", () => {
    const rows: LedgerRow[] = [{ ...approvedRow("changes.dsp.model-a@1"), status: "red" }];
    expect(evaluateGate(ship, rows, () => undefined).map((finding) => finding.code)).toEqual([
      "MODEL_RED",
    ]);
  });

  test("a shipping id missing from the ledger fails closed", () => {
    expect(evaluateGate(ship, [], () => undefined).map((finding) => finding.code)).toEqual([
      "MODEL_UNLISTED",
    ]);
  });

  test("machine delegation requires one checked-in semantic PASS bound to the exact model", () => {
    const rows: LedgerRow[] = [
      {
        ...approvedRow("changes.dsp.model-a@1"),
        status: "machine-delegated",
        evidence: "release-evidence/audio/listening/model-a.json",
      },
    ];
    expect(evaluateGate(ship, rows, () => undefined).map((finding) => finding.code)).toEqual([
      "MODEL_DELEGATED_NO_EVIDENCE",
    ]);
    expect(evaluateGate(ship, rows, () => ({ nope: true })).map((finding) => finding.code)).toEqual([
      "MODEL_DELEGATED_INVALID_EVIDENCE",
    ]);
    expect(evaluateGate(ship, rows, () => passingEvidence("changes.dsp.model-b@1"))
      .map((finding) => finding.code)).toEqual(["MODEL_DELEGATED_ALGORITHM_MISMATCH"]);
    expect(evaluateGate(ship, rows, () => passingEvidence("changes.dsp.model-a@1"))).toEqual([]);
    const current = passingEvidence("changes.dsp.model-a@1");
    expect(evaluateGate(ship, rows, () => current, sha256Hex("different-wasm"))
      .map((finding) => finding.code)).toEqual(["MODEL_DELEGATED_WASM_MISMATCH"]);
    expect(evaluateGate(ship, rows, () => current, current.candidate.wasmSha256)).toEqual([]);
  });

  test("prose, directories, untracked result paths, and tampered controls cannot delegate", () => {
    const base: LedgerRow = {
      ...approvedRow("changes.dsp.model-a@1"),
      status: "machine-delegated",
      evidence: "release-evidence/audio/listening/model-a.json",
    };
    for (const evidence of [
      "test-results/report.json",
      "release-evidence/audio/listening/",
      "release-evidence/audio/listening/report.json passed",
      "release-evidence/audio/listening/../report.json",
    ]) {
      expect(evaluateGate(ship, [{ ...base, evidence }], () => undefined)
        .map((finding) => finding.code)).toEqual(["MODEL_DELEGATED_EVIDENCE_PATH"]);
    }
    const valid = passingEvidence("changes.dsp.model-a@1");
    const tampered = {
      ...valid,
      controls: { ...valid.controls, whiteNoiseRejected: false },
    };
    expect(evaluateGate(ship, [base], () => tampered).map((finding) => finding.code)).toEqual([
      "MODEL_DELEGATED_INVALID_EVIDENCE",
    ]);
  });

  test("a non-shipping experimental id does not block", () => {
    const rows: LedgerRow[] = [
      approvedRow("changes.dsp.model-a@1"),
      { ...approvedRow("changes.dsp.experimental@9"), status: "red" },
    ];
    expect(evaluateGate(ship, rows, () => undefined)).toEqual([]);
  });

  test("one exact plucked-family report can prove each of its four named algorithms", async () => {
    const evidence = await runPluckedV2ReleaseGate();
    expect(evidence.summary.outcome).toBe("pass");
    for (const algorithmId of evidence.algorithmIds) {
      const row: LedgerRow = {
        ...approvedRow(algorithmId),
        status: "machine-delegated",
        evidence: "release-evidence/audio/listening/plucked-v2.json",
      };
      expect(evaluateGate(
        [algorithmId],
        [row],
        () => evidence,
        evidence.wasmSha256,
      )).toEqual([]);
    }
  });
});

describe("ledger parsing", () => {
  test("the checked-in ledger parses and covers every current shipping id", () => {
    const value: unknown = JSON.parse(readFileSync(resolve(root, LEDGER_PATH), "utf8"));
    const rows = parseLedger(value);
    expect(Array.isArray(rows)).toBe(true);
    const ids = new Set((rows as readonly LedgerRow[]).map((row) => row.algorithmId));
    for (const id of collectRecipeAlgorithmIds()) expect(ids.has(id)).toBe(true);
  });

  test("unknown fields, bad status, duplicates, and empty fields refuse", () => {
    const base = {
      schemaVersion: 1,
      rows: [
        {
          algorithmId: "changes.dsp.model-a@1",
          status: "approved",
          evidence: "e",
          decidedBy: "owner",
          date: "2026-08-07",
        },
      ],
    };
    const mutate = (
      edit: (row: Record<string, unknown>) => void,
    ): Record<string, unknown> => {
      const clone = structuredClone(base) as {
        schemaVersion: number;
        rows: Record<string, unknown>[];
      };
      const first = clone.rows[0];
      if (first === undefined) throw new Error("fixture row missing");
      edit(first);
      return clone;
    };
    expect(parseLedger(mutate((row) => { row["extra"] = 1; }))).toHaveProperty(
      "code",
      "LEDGER_UNKNOWN_FIELD",
    );
    expect(parseLedger(mutate((row) => { row["status"] = "maybe"; }))).toHaveProperty(
      "code",
      "LEDGER_STATUS",
    );
    const withDuplicate = structuredClone(base) as {
      schemaVersion: number;
      rows: Record<string, unknown>[];
    };
    withDuplicate.rows.push(structuredClone(withDuplicate.rows[0]) as Record<string, unknown>);
    expect(parseLedger(withDuplicate)).toHaveProperty("code", "LEDGER_DUPLICATE");
    expect(parseLedger(mutate((row) => { row["evidence"] = ""; }))).toHaveProperty(
      "code",
      "LEDGER_FIELD",
    );

    expect(parseLedger({ schemaVersion: 2, rows: base.rows })).toHaveProperty(
      "code",
      "LEDGER_SCHEMA_VERSION",
    );
    expect(parseLedger([])).toHaveProperty("code", "LEDGER_SHAPE");
  });
});
