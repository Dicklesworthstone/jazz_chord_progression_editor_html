/** Fail-closed clarinet@2 comparison against the pinned Iowa anechoic corpus. */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import {
  loadWaveguideRenderers,
  WAVEGUIDE_CLARINET_V2_ALGORITHM_ID,
  type RenderedNotePcm,
} from "../src/audio/dsp-renderer";
import {
  analyzeSignal,
  admitIdentityAlternativeSignal,
  admitReferenceSignal,
  buildGateEvidence,
  compareAdmittedSignals,
  compareCandidateIdentity,
  compareToReference,
  evaluateSimilarityReport,
  evaluateTargetedSimilarityReport,
  readAiffMono,
  sha256Hex,
  splitChromaticScale,
  verifyGateEvidence,
  windReferencePolicySha256,
  type GateEvidenceV1,
  type GateFinding,
  type GateOutcome,
  type MonoPcm,
  type CandidateIdentityComparison,
  type SimilarityReport,
  type WindIdentityControlResult,
} from "./reference-similarity";
import { runUiowaWindIdentityCorpus } from "./run-uiowa-wind-identity-control";

const MANIFEST_PATH = "tests/fixtures/uiowa-wind-identity-corpus.v1.json";
const CORPUS_DIRECTORY = "test-results/winds-reference-source/uiowa";
const ANALYZER_PATH = "scripts/reference-similarity.ts";
const PARAMETER_PACK_PATH = "physical/parameter-packs/clarinet-v2.json";
const EXPECTED_MANIFEST_SHA256 =
  "2887a12cc0dbd71326df00e7b9ebbe1e44a09ac2cbe7d0eb1763d7985a12bc48";
const CORPUS_ID =
  "university-of-iowa-musical-instrument-samples-winds@2026-08-07";
const REFERENCE_LICENSE_ID =
  "University-of-Iowa-MIS-unrestricted-project-use";

export const CLARINET_REFERENCE_RUNNER_POLICY = Object.freeze({
  schema: "changes.policy.phs2-uiowa-clarinet-reference.v1" as const,
  rendererAlgorithmId: WAVEGUIDE_CLARINET_V2_ALGORITHM_ID,
  sampleRateHz: 44_100,
  noteSeconds: 1.4,
  variationSlot: 0,
  articulation: "tongued" as const,
  velocityByDynamic: Object.freeze({ pp: 36, mf: 72, ff: 108 }),
  selectedMidi: Object.freeze([72, 76, 79, 82] as const),
  requiredDynamics: Object.freeze(["pp", "mf", "ff"] as const),
  corpusManifestPath: MANIFEST_PATH,
  corpusManifestSha256: EXPECTED_MANIFEST_SHA256,
  identityControl: "uiowa-anechoic-chromatic-scales@1" as const,
  diagnosticPrecedence: Object.freeze([
    "unavailable-prerequisite-or-input",
    "failed-comparison",
    "passed-comparison",
  ] as const),
});

type Dynamic = keyof typeof CLARINET_REFERENCE_RUNNER_POLICY.velocityByDynamic;
type Instrument = "flute" | "clarinet";
type CorpusFile = Readonly<{
  instrument: Instrument;
  dynamic: Dynamic;
  fileName: string;
  url: string;
  sha256: string;
  bytes: number;
  firstMidi: number;
  noteCount: number;
}>;
type CorpusManifest = Readonly<{
  schema: "changes.fixture.uiowa-wind-identity-corpus.v1";
  corpusId: typeof CORPUS_ID;
  selectedMidi: readonly number[];
  requiredDynamics: readonly Dynamic[];
  files: readonly CorpusFile[];
}>;
type SourceBinding = Readonly<{ path: string; sha256: string }>;

export type ClarinetReferenceMatrixCell = Readonly<{
  id: string;
  midi: number;
  dynamic: Dynamic;
  velocity: number;
  outcome: GateOutcome;
  exitCode: 0 | 1 | 2;
  findings: readonly GateFinding[];
  evidence: GateEvidenceV1 | null;
  reference: Readonly<{
    path: string;
    fileSha256: string;
    segmentSha256: string;
    alternativePath: string;
    alternativeFileSha256: string;
    alternativeSegmentSha256: string;
  }> | null;
}>;

export type ClarinetReferenceMatrixSummary = Readonly<{
  outcome: GateOutcome;
  exitCode: 0 | 1 | 2;
  expectedCellCount: number;
  completedCellCount: number;
  passedCellCount: number;
  failedCellCount: number;
  unavailableCellCount: number;
  findings: readonly GateFinding[];
}>;

export type ClarinetReferenceRunResult = Readonly<{
  schema: "changes.evidence.phs2-uiowa-clarinet-reference.v1";
  policy: typeof CLARINET_REFERENCE_RUNNER_POLICY;
  identityControl: WindIdentityControlResult;
  candidateSourceBindings: readonly SourceBinding[];
  candidateSourceClosureSha256: string | null;
  wasmSha256: string | null;
  parameterPackSha256: string | null;
  corpusManifestSha256: string | null;
  cells: readonly ClarinetReferenceMatrixCell[];
  summary: ClarinetReferenceMatrixSummary;
}>;

/**
 * Verify a checked-in matrix as release evidence without re-running audio.
 * Every cell's self-hashed evidence remains authoritative, while this layer
 * proves exact matrix cardinality and binds all cells to one source closure,
 * WASM payload, parameter pack, and corpus manifest.
 */
export function verifyClarinetReferenceRunEvidence(
  value: unknown,
): value is ClarinetReferenceRunResult {
  if (!isRecord(value) ||
    value["schema"] !== "changes.evidence.phs2-uiowa-clarinet-reference.v1" ||
    !isRecord(value["policy"]) ||
    canonicalJson(value["policy"]) !== canonicalJson(CLARINET_REFERENCE_RUNNER_POLICY) ||
    !isRecord(value["identityControl"]) ||
    value["identityControl"]["outcome"] !== "pass" ||
    value["identityControl"]["exitCode"] !== 0 ||
    !Array.isArray(value["candidateSourceBindings"]) ||
    value["candidateSourceBindings"].length === 0 ||
    typeof value["candidateSourceClosureSha256"] !== "string" ||
    typeof value["wasmSha256"] !== "string" ||
    typeof value["parameterPackSha256"] !== "string" ||
    typeof value["corpusManifestSha256"] !== "string" ||
    !Array.isArray(value["cells"]) ||
    !isRecord(value["summary"])) return false;

  const sourceBindings = value["candidateSourceBindings"];
  if (!sourceBindings.every((binding) => isRecord(binding) &&
    typeof binding["path"] === "string" && binding["path"] !== "" &&
    typeof binding["sha256"] === "string" && isSha256(binding["sha256"]))) return false;
  const sourceClosure = value["candidateSourceClosureSha256"];
  const wasmSha256 = value["wasmSha256"];
  const parameterPackSha256 = value["parameterPackSha256"];
  const corpusManifestSha256 = value["corpusManifestSha256"];
  if (!isSha256(sourceClosure) || !isSha256(wasmSha256) ||
    !isSha256(parameterPackSha256) || !isSha256(corpusManifestSha256) ||
    sha256Hex(canonicalJson(sourceBindings)) !== sourceClosure) return false;

  const cells = value["cells"] as unknown as readonly ClarinetReferenceMatrixCell[];
  const summary = summarizeClarinetReferenceCells(cells);
  if (canonicalJson(summary) !== canonicalJson(value["summary"]) ||
    summary.outcome !== "pass" || summary.exitCode !== 0 ||
    summary.completedCellCount !== 12 || summary.passedCellCount !== 12 ||
    summary.failedCellCount !== 0 || summary.unavailableCellCount !== 0) return false;
  for (const cell of cells) {
    const evidence = cell.evidence;
    if (cell.outcome !== "pass" || cell.exitCode !== 0 || evidence === null ||
      !verifyGateEvidence(evidence) || evidence.outcome !== "pass" ||
      evidence.candidate.rendererAlgorithmId !== WAVEGUIDE_CLARINET_V2_ALGORITHM_ID ||
      evidence.candidate.rendererSourceSha256 !== sourceClosure ||
      evidence.candidate.wasmSha256 !== wasmSha256 ||
      evidence.candidate.parameterPackSha256 !== parameterPackSha256 ||
      evidence.reference.corpusManifestSha256 !== corpusManifestSha256) return false;
  }
  return true;
}

const MATRIX = Object.freeze(
  CLARINET_REFERENCE_RUNNER_POLICY.selectedMidi.flatMap((midi) =>
    CLARINET_REFERENCE_RUNNER_POLICY.requiredDynamics.map((dynamic) => Object.freeze({
      id: `m${String(midi)}-${dynamic}`,
      midi,
      dynamic,
      velocity: CLARINET_REFERENCE_RUNNER_POLICY.velocityByDynamic[dynamic],
    })),
  ),
);

function finding(code: string, message: string): GateFinding {
  return Object.freeze({ code, message });
}

function midiHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]));
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function floatPcmSha256(pcm: MonoPcm): string {
  const bytes = new Uint8Array(pcm.samples.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < pcm.samples.length; index += 1) {
    view.setFloat32(index * 4, pcm.samples[index] ?? 0, true);
  }
  return sha256Hex(bytes);
}

function monoFromRendered(pcm: RenderedNotePcm): MonoPcm {
  const samples = new Float32Array(pcm.frameCount);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = ((pcm.left[index] ?? 0) + (pcm.right[index] ?? 0)) * 0.5;
  }
  return Object.freeze({ samples, sampleRateHz: pcm.sampleRateHz });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameArray(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function decodeManifest(value: unknown): CorpusManifest {
  if (!isRecord(value) || value["schema"] !== "changes.fixture.uiowa-wind-identity-corpus.v1" ||
    value["corpusId"] !== CORPUS_ID || !Array.isArray(value["selectedMidi"]) ||
    !sameArray(value["selectedMidi"], CLARINET_REFERENCE_RUNNER_POLICY.selectedMidi) ||
    !Array.isArray(value["requiredDynamics"]) ||
    !sameArray(value["requiredDynamics"], CLARINET_REFERENCE_RUNNER_POLICY.requiredDynamics) ||
    !Array.isArray(value["files"]) || value["files"].length !== 6) {
    throw new Error("manifest schema, corpus identity, or fixed matrix is invalid");
  }
  const files = value["files"].map((item: unknown): CorpusFile => {
    if (!isRecord(item) || !["flute", "clarinet"].includes(String(item["instrument"])) ||
      !["pp", "mf", "ff"].includes(String(item["dynamic"])) ||
      typeof item["fileName"] !== "string" || typeof item["url"] !== "string" ||
      typeof item["sha256"] !== "string" || !/^[0-9a-f]{64}$/.test(item["sha256"]) ||
      !Number.isInteger(item["bytes"]) || !Number.isInteger(item["firstMidi"]) ||
      !Number.isInteger(item["noteCount"])) {
      throw new Error("manifest contains an invalid corpus file row");
    }
    return Object.freeze({
      instrument: item["instrument"] as Instrument,
      dynamic: item["dynamic"] as Dynamic,
      fileName: item["fileName"],
      url: item["url"],
      sha256: item["sha256"],
      bytes: item["bytes"] as number,
      firstMidi: item["firstMidi"] as number,
      noteCount: item["noteCount"] as number,
    });
  });
  for (const instrument of ["flute", "clarinet"] as const) {
    for (const dynamic of CLARINET_REFERENCE_RUNNER_POLICY.requiredDynamics) {
      if (files.filter((file) => file.instrument === instrument && file.dynamic === dynamic).length !== 1) {
        throw new Error(`manifest does not contain exactly one ${instrument}:${dynamic} file`);
      }
    }
  }
  return Object.freeze({
    schema: "changes.fixture.uiowa-wind-identity-corpus.v1",
    corpusId: CORPUS_ID,
    selectedMidi: CLARINET_REFERENCE_RUNNER_POLICY.selectedMidi,
    requiredDynamics: CLARINET_REFERENCE_RUNNER_POLICY.requiredDynamics,
    files: Object.freeze(files),
  });
}

function unavailableIdentity(item: GateFinding): WindIdentityControlResult {
  return Object.freeze({
    outcome: "unavailable",
    exitCode: 2,
    findings: Object.freeze([item]),
    measurements: Object.freeze([]),
  });
}

function unavailableCells(item: GateFinding): readonly ClarinetReferenceMatrixCell[] {
  return Object.freeze(MATRIX.map((cell) => Object.freeze({
    ...cell,
    outcome: "unavailable" as const,
    exitCode: 2 as const,
    findings: Object.freeze([item]),
    evidence: null,
    reference: null,
  })));
}

function expectedIds(): ReadonlySet<string> {
  return new Set(MATRIX.map((cell) => cell.id));
}

function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

/**
 * Aggregate with unavailable-over-fail precedence. A green summary requires
 * the exact 12-cell matrix and valid semantic evidence for every cell.
 */
export function summarizeClarinetReferenceCells(
  cells: readonly ClarinetReferenceMatrixCell[],
): ClarinetReferenceMatrixSummary {
  const findings: GateFinding[] = [];
  const expected = expectedIds();
  const expectedById = new Map<string, (typeof MATRIX)[number]>(
    MATRIX.map((cell) => [cell.id, cell]),
  );
  const seen = new Set<string>();
  for (const cell of cells) {
    if (seen.has(cell.id)) findings.push(finding("MATRIX_CELL_DUPLICATE", cell.id));
    seen.add(cell.id);
    if (!expected.has(cell.id)) findings.push(finding("MATRIX_CELL_UNEXPECTED", cell.id));
    const expectedCell = expectedById.get(cell.id);
    if (expectedCell !== undefined && (cell.midi !== expectedCell.midi ||
      cell.dynamic !== expectedCell.dynamic || cell.velocity !== expectedCell.velocity)) {
      findings.push(finding("MATRIX_CELL_COORDINATE_MISMATCH", cell.id));
    }
    const expectedExitCode = cell.outcome === "pass" ? 0 : cell.outcome === "fail" ? 1 : 2;
    if (cell.exitCode !== expectedExitCode) {
      findings.push(finding("MATRIX_CELL_EXIT_CODE_MISMATCH", cell.id));
    }
    if (cell.evidence !== null) {
      if (!verifyGateEvidence(cell.evidence)) {
        findings.push(finding("MATRIX_CELL_EVIDENCE_INVALID", cell.id));
      } else if (cell.evidence.outcome !== cell.outcome ||
        cell.evidence.reference.expectedMidi !== cell.midi ||
        cell.evidence.candidate.rendererAlgorithmId !== WAVEGUIDE_CLARINET_V2_ALGORITHM_ID) {
        findings.push(finding("MATRIX_CELL_EVIDENCE_MISMATCH", cell.id));
      }
      if (cell.reference === null || cell.reference.path !== cell.evidence.reference.filePath ||
        cell.reference.fileSha256 !== cell.evidence.reference.fileSha256 ||
        !isSha256(cell.reference.segmentSha256) ||
        cell.reference.alternativePath !== cell.evidence.reference.alternativeFilePath ||
        cell.reference.alternativeFileSha256 !==
          cell.evidence.reference.alternativeFileSha256 ||
        !isSha256(cell.reference.alternativeSegmentSha256)) {
        findings.push(finding("MATRIX_CELL_REFERENCE_BINDING_MISMATCH", cell.id));
      }
    } else if (cell.outcome === "pass" || cell.outcome === "fail") {
      findings.push(finding("MATRIX_CELL_EVIDENCE_ABSENT", cell.id));
    }
    if (cell.outcome === "fail") {
      findings.push(finding("MATRIX_CELL_FAILED",
        `${cell.id}: ${cell.findings.map((item) => item.code).join(",")}`));
    } else if (cell.outcome === "unavailable") {
      findings.push(finding("MATRIX_CELL_UNAVAILABLE",
        `${cell.id}: ${cell.findings.map((item) => item.code).join(",")}`));
    }
  }
  for (const id of expected) {
    if (!seen.has(id)) findings.push(finding("MATRIX_CELL_MISSING", id));
  }
  if (cells.length !== MATRIX.length) {
    findings.push(finding("MATRIX_CARDINALITY",
      `expected ${String(MATRIX.length)} cells, received ${String(cells.length)}`));
  }
  const passedCellCount = cells.filter((cell) => cell.outcome === "pass").length;
  const failedCellCount = cells.filter((cell) => cell.outcome === "fail").length;
  const unavailableCellCount = cells.filter((cell) => cell.outcome === "unavailable").length;
  const structurallyUnavailable = unavailableCellCount > 0 || findings.some((item) =>
    item.code !== "MATRIX_CELL_FAILED" && item.code !== "MATRIX_CELL_UNAVAILABLE");
  const outcome: GateOutcome = structurallyUnavailable ? "unavailable"
    : failedCellCount > 0 ? "fail" : "pass";
  return Object.freeze({
    outcome,
    exitCode: outcome === "pass" ? 0 : outcome === "fail" ? 1 : 2,
    expectedCellCount: MATRIX.length,
    completedCellCount: cells.length,
    passedCellCount,
    failedCellCount,
    unavailableCellCount,
    findings: Object.freeze(findings),
  });
}

function resultFromUnavailable(identityControl: WindIdentityControlResult,
  item: GateFinding, manifestSha256: string | null): ClarinetReferenceRunResult {
  const cells = unavailableCells(item);
  return Object.freeze({
    schema: "changes.evidence.phs2-uiowa-clarinet-reference.v1",
    policy: CLARINET_REFERENCE_RUNNER_POLICY,
    identityControl,
    candidateSourceBindings: Object.freeze([]),
    candidateSourceClosureSha256: null,
    wasmSha256: null,
    parameterPackSha256: null,
    corpusManifestSha256: manifestSha256,
    cells,
    summary: summarizeClarinetReferenceCells(cells),
  });
}

async function readManifest(root: string): Promise<Readonly<{
  manifest: CorpusManifest;
  sha256: string;
}>> {
  const bytes = new Uint8Array(await readFile(join(root, MANIFEST_PATH)));
  const digest = sha256Hex(bytes);
  if (digest !== EXPECTED_MANIFEST_SHA256) {
    throw new Error(`expected ${EXPECTED_MANIFEST_SHA256}, got ${digest}`);
  }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  return Object.freeze({ manifest: decodeManifest(parsed), sha256: digest });
}

async function readCorpusScales(root: string, manifest: CorpusManifest): Promise<
  ReadonlyMap<string, Readonly<{ file: CorpusFile; notes: readonly MonoPcm[] }>>
> {
  const scales = new Map<string, Readonly<{ file: CorpusFile; notes: readonly MonoPcm[] }>>();
  for (const file of manifest.files) {
    const bytes = new Uint8Array(await readFile(join(root, CORPUS_DIRECTORY, file.fileName)));
    if (bytes.byteLength !== file.bytes || sha256Hex(bytes) !== file.sha256) {
      throw new Error(`REFERENCE_CORPUS_DIGEST_MISMATCH:${file.fileName}`);
    }
    const notes = splitChromaticScale(readAiffMono(bytes));
    if (notes.length !== file.noteCount) {
      throw new Error(`REFERENCE_CORPUS_SEGMENT_COUNT:${file.fileName}:${String(notes.length)}`);
    }
    scales.set(`${file.instrument}:${file.dynamic}`, Object.freeze({ file, notes }));
  }
  return scales;
}

async function sourceBindings(root: string): Promise<readonly SourceBinding[]> {
  const sourceDirectory = join(root, "dsp/concert-grand/src");
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  const rustSources = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".rs"))
    .map((entry) => join(sourceDirectory, entry.name));
  const fixed = [
    join(root, "dsp/concert-grand/Cargo.toml"),
    join(root, "dsp/concert-grand/Cargo.lock"),
    join(root, "scripts/build-dsp.ts"),
    join(root, "src/audio/dsp-renderer.ts"),
  ];
  const bindings = await Promise.all([...rustSources, ...fixed].sort().map(async (path) =>
    Object.freeze({
      path: relative(root, path),
      sha256: sha256Hex(new Uint8Array(await readFile(path))),
    })));
  return Object.freeze(bindings);
}

async function inputClosureIsStable(root: string, manifest: CorpusManifest,
  expected: Readonly<{
    manifestSha256: string;
    sourceClosureSha256: string;
    analyzerImplementationSha256: string;
    parameterPackSha256: string;
  }>): Promise<boolean> {
  try {
    const [currentManifest, currentBindings, analyzerBytes, packBytes] = await Promise.all([
      readManifest(root),
      sourceBindings(root),
      readFile(join(root, ANALYZER_PATH)),
      readFile(join(root, PARAMETER_PACK_PATH)),
    ]);
    if (currentManifest.sha256 !== expected.manifestSha256 ||
      sha256Hex(canonicalJson(currentBindings)) !== expected.sourceClosureSha256 ||
      sha256Hex(new Uint8Array(analyzerBytes)) !== expected.analyzerImplementationSha256 ||
      sha256Hex(new Uint8Array(packBytes)) !== expected.parameterPackSha256) return false;
    const corpusChecks = await Promise.all(manifest.files.map(async (file) => {
      const bytes = new Uint8Array(await readFile(join(root, CORPUS_DIRECTORY, file.fileName)));
      return bytes.byteLength === file.bytes && sha256Hex(bytes) === file.sha256;
    }));
    return corpusChecks.every(Boolean);
  } catch {
    return false;
  }
}

function deterministicNoise(sampleRateHz: number): MonoPcm {
  const samples = new Float32Array(Math.round(sampleRateHz * 1.4));
  let state = 0x6d2b79f5;
  for (let index = 0; index < samples.length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    samples[index] = 0.2 * (((state >>> 0) / 0xffff_ffff) * 2 - 1);
  }
  return Object.freeze({ samples, sampleRateHz });
}

function pureTone(frequencyHz: number, sampleRateHz: number): MonoPcm {
  return controlTone(frequencyHz, sampleRateHz, [1], 0);
}

function controlTone(frequencyHz: number, sampleRateHz: number,
  harmonics: readonly number[], noiseAmplitude: number): MonoPcm {
  const samples = new Float32Array(Math.round(sampleRateHz * 1.4));
  let state = 0x9e3779b1;
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRateHz;
    const envelope = Math.min(1, time / 0.06);
    let value = 0;
    for (let harmonic = 0; harmonic < harmonics.length; harmonic += 1) {
      value += (harmonics[harmonic] ?? 0) *
        Math.sin(2 * Math.PI * frequencyHz * (harmonic + 1) * time);
    }
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const noise = ((state >>> 0) / 0xffff_ffff) * 2 - 1;
    samples[index] = 0.3 * envelope * (value + noiseAmplitude * noise);
  }
  return Object.freeze({ samples, sampleRateHz });
}

function plantedControlVerdicts(identityControl: WindIdentityControlResult,
  crossInstrumentRejected: boolean):
GateEvidenceV1["controls"] {
  const expectedHz = 440;
  const sampleRateHz = CLARINET_REFERENCE_RUNNER_POLICY.sampleRateHz;
  const ordinary = controlTone(expectedHz, sampleRateHz, [1, 0.31, 0.14, 0.07], 0.15);
  const self = compareToReference(ordinary, ordinary, expectedHz);
  const pure = compareToReference(pureTone(expectedHz, sampleRateHz), ordinary, expectedHz);
  return Object.freeze({
    self: self.outcome === "accept" &&
      evaluateSimilarityReport(self.report, identityControl).outcome === "pass",
    whiteNoiseRejected: analyzeSignal(deterministicNoise(sampleRateHz), expectedHz).outcome === "unavailable",
    overlyPureRejected: pure.outcome === "accept" &&
      evaluateSimilarityReport(pure.report, identityControl).outcome === "fail",
    wrongPitchRejected: analyzeSignal(
      pureTone(expectedHz * 2, sampleRateHz), expectedHz,
    ).outcome === "unavailable",
    crossInstrumentRejected,
  });
}

function controlsPass(controls: GateEvidenceV1["controls"]): boolean {
  return Object.values(controls).every((value) => value);
}

function referenceAdmissionFindings(items: readonly GateFinding[],
  role: "reference" | "alternative" = "reference"): readonly GateFinding[] {
  const grouped = new Map<string, string[]>();
  for (const item of items) {
    const messages = grouped.get(item.code) ?? [];
    messages.push(item.message);
    grouped.set(item.code, messages);
  }
  return Object.freeze([...grouped.entries()].map(([code, messages]) => finding(
    `${role === "reference" ? "REFERENCE" : "ALTERNATIVE"}_POLICY_${code}`,
    `${role} self-admission failed: ${messages.join("; ")}`,
  )));
}

function corpusNote(scales: ReadonlyMap<string, Readonly<{
  file: CorpusFile;
  notes: readonly MonoPcm[];
}>>, instrument: Instrument, dynamic: Dynamic, midi: number): Readonly<{
  file: CorpusFile;
  note: MonoPcm;
}> {
  const scale = scales.get(`${instrument}:${dynamic}`);
  if (scale === undefined) throw new Error(`REFERENCE_SCALE_ABSENT:${instrument}:${dynamic}`);
  const note = scale.notes[midi - scale.file.firstMidi];
  if (note === undefined) throw new Error(`REFERENCE_NOTE_ABSENT:${instrument}:${dynamic}:${String(midi)}`);
  return Object.freeze({ file: scale.file, note });
}

/** Run the fixed 12-cell evidence matrix without writing or approving evidence. */
export async function runUiowaClarinetReference(root = process.cwd()):
Promise<ClarinetReferenceRunResult> {
  let decoded: Awaited<ReturnType<typeof readManifest>>;
  try {
    decoded = await readManifest(root);
  } catch (error) {
    const item = finding("REFERENCE_MANIFEST_UNAVAILABLE", String(error));
    return resultFromUnavailable(unavailableIdentity(item), item, null);
  }

  const identityControl = await runUiowaWindIdentityCorpus(root);
  if (identityControl.outcome !== "pass") {
    const item = finding("IDENTITY_CONTROL_PREREQUISITE",
      `identity control outcome is ${identityControl.outcome}`);
    return resultFromUnavailable(identityControl, item, decoded.sha256);
  }

  let scales: Awaited<ReturnType<typeof readCorpusScales>>;
  let bindings: readonly SourceBinding[];
  let analyzerImplementationSha256: string;
  let parameterPackSha256: string;
  try {
    [scales, bindings, analyzerImplementationSha256, parameterPackSha256] = await Promise.all([
      readCorpusScales(root, decoded.manifest),
      sourceBindings(root),
      readFile(join(root, ANALYZER_PATH)).then((bytes) => sha256Hex(new Uint8Array(bytes))),
      readFile(join(root, PARAMETER_PACK_PATH)).then((bytes) => sha256Hex(new Uint8Array(bytes))),
    ]);
  } catch (error) {
    const item = finding("REFERENCE_INPUT_UNAVAILABLE", String(error));
    return resultFromUnavailable(identityControl, item, decoded.sha256);
  }

  const sourceClosureSha256 = sha256Hex(canonicalJson(bindings));
  let renderer: Awaited<ReturnType<typeof loadWaveguideRenderers>> extends ReadonlyMap<string, infer R>
    ? R : never;
  try {
    const renderers = await loadWaveguideRenderers();
    const selected = renderers.get(WAVEGUIDE_CLARINET_V2_ALGORITHM_ID);
    if (selected === undefined) throw new Error("PHS2_REFERENCE_RENDERER_MISSING");
    renderer = selected;
  } catch (error) {
    const item = finding("CANDIDATE_RENDERER_UNAVAILABLE", String(error));
    return Object.freeze({
      ...resultFromUnavailable(identityControl, item, decoded.sha256),
      candidateSourceBindings: bindings,
      candidateSourceClosureSha256: sourceClosureSha256,
      parameterPackSha256,
    });
  }

  const cells: ClarinetReferenceMatrixCell[] = [];
  for (const matrixCell of MATRIX) {
    try {
      const expectedHz = midiHz(matrixCell.midi);
      const clarinet = corpusNote(scales, "clarinet", matrixCell.dynamic, matrixCell.midi);
      const flute = corpusNote(scales, "flute", matrixCell.dynamic, matrixCell.midi);
      const request = Object.freeze({
        midiPitch: matrixCell.midi,
        velocity: matrixCell.velocity,
        sampleRateHz: CLARINET_REFERENCE_RUNNER_POLICY.sampleRateHz,
        maxSeconds: CLARINET_REFERENCE_RUNNER_POLICY.noteSeconds,
        variationSlot: CLARINET_REFERENCE_RUNNER_POLICY.variationSlot,
        articulation: CLARINET_REFERENCE_RUNNER_POLICY.articulation,
      });
      const rendered = renderer.renderNote(
        request.midiPitch,
        request.velocity,
        request.sampleRateHz,
        request.maxSeconds,
        request.variationSlot,
        request.articulation,
      );
      if (rendered === null) throw new Error("CANDIDATE_RENDER_REFUSED");
      const candidate = monoFromRendered(rendered);
      const comparison = compareToReference(candidate, clarinet.note, expectedHz);
      const referenceAdmission = admitReferenceSignal(clarinet.note, expectedHz);
      const alternativeAdmission = admitIdentityAlternativeSignal(flute.note, expectedHz);
      let crossInstrumentRejected = false;
      if (referenceAdmission.outcome === "accept" && alternativeAdmission.outcome === "accept") {
        const plantedCrossReport = compareAdmittedSignals(
          alternativeAdmission.features,
          referenceAdmission.features,
        );
        const plantedCrossIdentity = compareCandidateIdentity(
          alternativeAdmission.features,
          referenceAdmission.features,
          alternativeAdmission.features,
        );
        const plantedCrossVerdict = evaluateTargetedSimilarityReport(
          plantedCrossReport,
          identityControl,
          plantedCrossIdentity,
        );
        crossInstrumentRejected = plantedCrossVerdict.outcome === "fail" &&
          plantedCrossVerdict.findings.some((item) =>
            item.code === "CANDIDATE_TARGET_IDENTITY_MARGIN");
      }
      const controls = plantedControlVerdicts(identityControl, crossInstrumentRejected);
      let outcome: GateOutcome;
      let exitCode: 0 | 1 | 2;
      let report: SimilarityReport | null = null;
      let identityComparison: CandidateIdentityComparison | null = null;
      let findings: readonly GateFinding[];
      if (referenceAdmission.outcome === "unavailable" ||
        alternativeAdmission.outcome === "unavailable") {
        outcome = "unavailable";
        exitCode = 2;
        findings = Object.freeze([
          ...(referenceAdmission.outcome === "unavailable"
            ? referenceAdmissionFindings(referenceAdmission.findings) : []),
          ...(alternativeAdmission.outcome === "unavailable"
            ? referenceAdmissionFindings(alternativeAdmission.findings, "alternative") : []),
        ]);
        if (comparison.outcome === "accept") report = comparison.report;
      } else if (!controlsPass(controls)) {
        outcome = "unavailable";
        exitCode = 2;
        findings = Object.freeze([finding("PLANTED_CONTROL_NOT_REJECTED",
          canonicalJson(controls))]);
        if (comparison.outcome === "accept") report = comparison.report;
      } else if (comparison.outcome === "unavailable") {
        outcome = "unavailable";
        exitCode = 2;
        findings = comparison.findings;
      } else {
        report = comparison.report;
        identityComparison = compareCandidateIdentity(
          report.candidate,
          report.reference,
          alternativeAdmission.features,
        );
        const verdict = evaluateTargetedSimilarityReport(
          report,
          identityControl,
          identityComparison,
        );
        outcome = verdict.outcome;
        exitCode = verdict.exitCode;
        findings = verdict.findings;
      }
      const candidateSha256 = floatPcmSha256(candidate);
      const evidence = buildGateEvidence({
        outcome,
        rendererAlgorithmId: WAVEGUIDE_CLARINET_V2_ALGORITHM_ID,
        corpusId: CORPUS_ID,
        referencePath: `${CORPUS_DIRECTORY}/${clarinet.file.fileName}#midi-${String(matrixCell.midi)}`,
        alternativeReferencePath: `${CORPUS_DIRECTORY}/${flute.file.fileName}#midi-${String(matrixCell.midi)}`,
        referenceLicenseId: REFERENCE_LICENSE_ID,
        expectedMidi: matrixCell.midi,
        expectedHz,
        digests: {
          analyzerImplementationSha256,
          policySha256: windReferencePolicySha256(),
          rendererSourceSha256: sourceClosureSha256,
          wasmSha256: renderer.wasmSha256,
          parameterPackSha256,
          renderRequestSha256: sha256Hex(canonicalJson(request)),
          pcmSha256: candidateSha256,
          corpusManifestSha256: decoded.sha256,
          referenceFileSha256: clarinet.file.sha256,
          alternativeReferenceFileSha256: flute.file.sha256,
        },
        controls,
        report,
        identityComparison,
        findings,
      });
      cells.push(Object.freeze({
        ...matrixCell,
        outcome,
        exitCode,
        findings,
        evidence,
        reference: Object.freeze({
          path: evidence.reference.filePath,
          fileSha256: clarinet.file.sha256,
          segmentSha256: floatPcmSha256(clarinet.note),
          alternativePath: evidence.reference.alternativeFilePath,
          alternativeFileSha256: flute.file.sha256,
          alternativeSegmentSha256: floatPcmSha256(flute.note),
        }),
      }));
    } catch (error) {
      const item = finding("MATRIX_CELL_UNAVAILABLE", String(error));
      cells.push(Object.freeze({
        ...matrixCell,
        outcome: "unavailable",
        exitCode: 2,
        findings: Object.freeze([item]),
        evidence: null,
        reference: null,
      }));
    }
  }
  const stable = await inputClosureIsStable(root, decoded.manifest, {
    manifestSha256: decoded.sha256,
    sourceClosureSha256,
    analyzerImplementationSha256,
    parameterPackSha256,
  });
  const frozenCells = stable ? Object.freeze(cells) : unavailableCells(finding(
    "INPUT_CLOSURE_DRIFT",
    "a source, analyzer, parameter-pack, manifest, or reference file changed during the run",
  ));
  return Object.freeze({
    schema: "changes.evidence.phs2-uiowa-clarinet-reference.v1",
    policy: CLARINET_REFERENCE_RUNNER_POLICY,
    identityControl,
    candidateSourceBindings: bindings,
    candidateSourceClosureSha256: sourceClosureSha256,
    wasmSha256: renderer.wasmSha256,
    parameterPackSha256,
    corpusManifestSha256: decoded.sha256,
    cells: frozenCells,
    summary: summarizeClarinetReferenceCells(frozenCells),
  });
}

if (import.meta.main) {
  const result = await runUiowaClarinetReference();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.summary.exitCode;
}
