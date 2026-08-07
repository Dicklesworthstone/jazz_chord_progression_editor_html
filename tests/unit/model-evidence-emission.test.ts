/**
 * Verification for the model-acceptance evidence emitter (bead
 * jcpe-plucked-evidence-emission-gmx4).
 *
 * Two duties: (1) every checked-in evidence JSON under
 * release-evidence/audio/listening/evidence/ must verify semantically and
 * hash-exactly, bind the tree's CURRENT analyzer/wasm/pack digests (stale
 * evidence from an older tree must fail here, not at deploy time), and match
 * its ledger row; (2) the plucked policy variants must earn their planted
 * controls live — white noise and wrong pitch refuse, a pure tone cannot
 * pass a proximity cell, a same-class signal cannot pass the separation
 * cell — and one cell's metrics are re-derived end-to-end so the JSONs are
 * provably machine-built, not hand-authored.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  PLUCKED_REFERENCE_GATE_POLICY,
  PLUCKED_SEPARATION_GATE_POLICY,
  WIND_REFERENCE_GATE_POLICY,
  analyzeSignal,
  compareToReference,
  evaluateSimilarityReport,
  gatePolicySha256,
  readWavMono,
  sha256Hex,
  verifyGateEvidence,
  type GateEvidenceV1,
  type MonoPcm,
  type WindIdentityControlResult,
} from "../../scripts/reference-similarity";
import { CONCERT_GRAND_WASM_SHA256 } from "../../src/audio/wasm/concert-grand-wasm";

const ROOT = resolve(import.meta.dir, "../..");
const EVIDENCE_DIRECTORY = join(ROOT, "release-evidence/audio/listening/evidence");
const LEDGER_PATH = join(ROOT, "release-evidence/audio/listening/model-acceptance-ledger.json");
const STEEL_A4 = join(ROOT,
  "test-results/plucked-reference-source/FSS-SteelStringGuitar-small-SFZ-20200521/samples/A4.wav");
const RATE = 48_000;

function midiHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

const PASS_CONTROL: WindIdentityControlResult = Object.freeze({
  outcome: "pass", exitCode: 0,
  findings: Object.freeze([]), measurements: Object.freeze([]),
});

function evidenceFiles(): readonly string[] {
  if (!existsSync(EVIDENCE_DIRECTORY)) return [];
  return readdirSync(EVIDENCE_DIRECTORY).filter((name) => name.endsWith(".json"));
}

describe("checked-in evidence JSONs", () => {
  test("every evidence file verifies and binds the current tree", () => {
    const files = evidenceFiles();
    expect(files.length).toBeGreaterThanOrEqual(5);
    const analyzerSha = sha256Hex(readFileSync(join(ROOT, "scripts/reference-similarity.ts")));
    for (const name of files) {
      const evidence = JSON.parse(
        readFileSync(join(EVIDENCE_DIRECTORY, name), "utf8")) as GateEvidenceV1;
      expect(verifyGateEvidence(evidence)).toBe(true);
      expect(evidence.outcome).toBe("pass");
      expect(evidence.gate.implementationSha256).toBe(analyzerSha);
      expect(evidence.candidate.wasmSha256).toBe(CONCERT_GRAND_WASM_SHA256);
      const packPath = join(ROOT, "physical/parameter-packs");
      const packs = readdirSync(packPath).map((file) =>
        sha256Hex(readFileSync(join(packPath, file))));
      const packBound = packs.includes(evidence.candidate.parameterPackSha256) ||
        evidence.candidate.parameterPackSha256 === sha256Hex("no-parameter-pack");
      expect(packBound).toBe(true);
    }
  });

  test("every machine-delegated ledger row cites a verifying evidence file", () => {
    const ledger = JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as
      Readonly<{ rows: readonly Readonly<{ algorithmId: string; status: string; evidence: string }>[] }>;
    for (const row of ledger.rows) {
      if (row.status !== "machine-delegated") continue;
      const evidence = JSON.parse(
        readFileSync(join(ROOT, row.evidence), "utf8")) as GateEvidenceV1;
      expect(verifyGateEvidence(evidence)).toBe(true);
      expect(evidence.candidate.rendererAlgorithmId).toBe(row.algorithmId);
    }
  });

  test("tampering with a stored report value breaks verification", () => {
    const files = evidenceFiles();
    const first = files[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const evidence = JSON.parse(
      readFileSync(join(EVIDENCE_DIRECTORY, first), "utf8")) as GateEvidenceV1;
    const tampered = structuredClone(evidence) as { report: { envelopeDb: number } | null };
    if (tampered.report !== null) {
      tampered.report.envelopeDb += 0.5;
      expect(verifyGateEvidence(tampered as unknown as GateEvidenceV1)).toBe(false);
    }
  });
});

describe("plucked policy planted controls (live)", () => {
  const steel = (): MonoPcm => readWavMono(new Uint8Array(readFileSync(STEEL_A4)));

  test("white noise refuses admission under both plucked policies", () => {
    const samples = new Float32Array(RATE * 2);
    let state = 0x2545f491 >>> 0;
    for (let index = 0; index < samples.length; index += 1) {
      state ^= state << 13; state >>>= 0;
      state ^= state >> 17;
      state ^= state << 5; state >>>= 0;
      samples[index] = ((state / 0xffffffff) * 2 - 1) * 0.3;
    }
    const pcm: MonoPcm = Object.freeze({ samples, sampleRateHz: RATE });
    for (const policy of [PLUCKED_REFERENCE_GATE_POLICY, PLUCKED_SEPARATION_GATE_POLICY]) {
      expect(analyzeSignal(pcm, midiHz(69), policy).outcome).toBe("unavailable");
    }
  });

  test("a sustained pure tone cannot pass a plucked proximity cell", () => {
    const samples = new Float32Array(RATE * 3);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = 0.4 * Math.sin((2 * Math.PI * midiHz(69) * index) / RATE);
    }
    const comparison = compareToReference(
      Object.freeze({ samples, sampleRateHz: RATE }), steel(), midiHz(69),
      PLUCKED_REFERENCE_GATE_POLICY);
    const rejected = comparison.outcome !== "accept" ||
      evaluateSimilarityReport(comparison.report, PASS_CONTROL,
        PLUCKED_REFERENCE_GATE_POLICY).outcome !== "pass";
    expect(rejected).toBe(true);
  });

  test("a same-class signal fails the separation cell (guitar posing as ukulele)", () => {
    const reference = steel();
    const comparison = compareToReference(reference, reference, midiHz(69),
      PLUCKED_SEPARATION_GATE_POLICY);
    expect(comparison.outcome).toBe("accept");
    if (comparison.outcome !== "accept") return;
    const verdict = evaluateSimilarityReport(comparison.report, PASS_CONTROL,
      PLUCKED_SEPARATION_GATE_POLICY);
    expect(verdict.outcome).toBe("fail");
    expect(verdict.findings.some((item) => item.code === "ENVELOPE_SEPARATION")).toBe(true);
  });

  test("policy digests are pinned and distinct", () => {
    const digests = [
      gatePolicySha256(WIND_REFERENCE_GATE_POLICY),
      gatePolicySha256(PLUCKED_REFERENCE_GATE_POLICY),
      gatePolicySha256(PLUCKED_SEPARATION_GATE_POLICY),
    ];
    expect(new Set(digests).size).toBe(3);
    for (const digest of digests) expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("end-to-end re-derivation (evidence is machine-built)", () => {
  test("the dreadnought evidence report reproduces from a live render", async () => {
    const evidencePath = join(EVIDENCE_DIRECTORY, "changes-dsp-plucked-dreadnought-1.json");
    if (!existsSync(evidencePath)) {
      expect(evidenceFiles().length).toBe(0);
      return;
    }
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as GateEvidenceV1;
    const { loadWaveguideRenderers, PLUCKED_DREADNOUGHT_ALGORITHM_ID } =
      await import("../../src/audio/dsp-renderer");
    const renderers = await loadWaveguideRenderers();
    const rendered = renderers.get(PLUCKED_DREADNOUGHT_ALGORITHM_ID)
      ?.renderNote(evidence.reference.expectedMidi, 100, RATE, 3);
    expect(rendered).not.toBeNull();
    if (rendered == null) return;
    const referenceBytes = new Uint8Array(readFileSync(join(ROOT, evidence.reference.filePath)));
    expect(sha256Hex(referenceBytes)).toBe(evidence.reference.fileSha256);
    const comparison = compareToReference(
      Object.freeze({ samples: rendered.left, sampleRateHz: RATE }),
      readWavMono(referenceBytes), evidence.reference.expectedHz,
      PLUCKED_REFERENCE_GATE_POLICY);
    expect(comparison.outcome).toBe("accept");
    if (comparison.outcome !== "accept" || evidence.report === null) return;
    expect(Math.abs(comparison.report.envelopeDb - evidence.report.envelopeDb)).toBeLessThan(1e-9);
    expect(Math.abs(comparison.report.harmonicDb - evidence.report.harmonicDb)).toBeLessThan(1e-9);
  });
});
