/** Execute flute@2 against the pinned Iowa flute/clarinet identity matrix. */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  admitIdentityAlternativeSignal,
  admitReferenceSignal,
  compareCandidateIdentity,
  compareToReference,
  evaluateTargetedSimilarityReport,
  readAiffMono,
  sha256Hex,
  splitChromaticScale,
  windReferencePolicySha256,
  type CandidateIdentityComparison,
  type GateFinding,
  type GateOutcome,
  type MonoPcm,
  type SimilarityReport,
  type WindIdentityControlResult,
} from "./reference-similarity";
import { runUiowaWindIdentityCorpus } from "./run-uiowa-wind-identity-control";

const MANIFEST_PATH = "tests/fixtures/uiowa-wind-identity-corpus.v1.json";
const CORPUS_DIRECTORY = "test-results/winds-reference-source/uiowa";
const RENDERER_SOURCE_PATH = "dsp/concert-grand/src/flute_v2.rs";
const ANALYZER_SOURCE_PATH = "scripts/reference-similarity.ts";
const EXPECTED_MANIFEST_SHA256 =
  "2887a12cc0dbd71326df00e7b9ebbe1e44a09ac2cbe7d0eb1763d7985a12bc48";

export const FLUTE_V2_REFERENCE_RUNNER_POLICY = Object.freeze({
  schema: "changes.policy.phs3-uiowa-flute-v2-reference.v1" as const,
  rendererAlgorithmId: "changes.dsp.waveguide-flute@2" as const,
  sampleRateHz: 44_100,
  noteFrames: 61_740,
  variationSlot: 0,
  articulation: "tongued" as const,
  velocityByDynamic: Object.freeze({ pp: 36, mf: 72, ff: 108 }),
  selectedMidi: Object.freeze([72, 76, 79, 82] as const),
  requiredDynamics: Object.freeze(["pp", "mf", "ff"] as const),
  corpusManifestPath: MANIFEST_PATH,
  corpusManifestSha256: EXPECTED_MANIFEST_SHA256,
  expectedReferenceUnavailableIds: Object.freeze([
    "m82-mf",
    "m72-ff",
    "m79-ff",
    "m82-ff",
  ] as const),
  requiredAdmittedCells: 8,
  requiredReferenceUnavailableCells: 4,
  identityControl: "uiowa-anechoic-chromatic-scales@1" as const,
});

type Dynamic = keyof typeof FLUTE_V2_REFERENCE_RUNNER_POLICY.velocityByDynamic;
type CorpusFile = Readonly<{
  instrument: "flute" | "clarinet";
  dynamic: Dynamic;
  fileName: string;
  sha256: string;
  bytes: number;
  firstMidi: number;
  noteCount: number;
}>;
type CorpusManifest = Readonly<{
  schema: "changes.fixture.uiowa-wind-identity-corpus.v1";
  selectedMidi: readonly number[];
  requiredDynamics: readonly Dynamic[];
  files: readonly CorpusFile[];
}>;

export type FluteV2MatrixCellOutcome =
  | "pass"
  | "fail"
  | "reference-unavailable"
  | "unavailable";

export type FluteV2CellBindings = Readonly<{
  rendererSourceSha256: string;
  wasmSha256: string;
  corpusManifestSha256: string;
  analyzerImplementationSha256: string;
  referenceGatePolicySha256: string;
  runnerPolicySha256: string;
  renderRequestSha256: string | null;
  candidatePcmSha256: string | null;
  fluteReferenceFileSha256: string;
  fluteReferenceSegmentSha256: string;
  clarinetAlternativeFileSha256: string;
  clarinetAlternativeSegmentSha256: string;
}>;

export type FluteV2ReferenceMatrixCell = Readonly<{
  id: string;
  midi: number;
  dynamic: Dynamic;
  velocity: number;
  outcome: FluteV2MatrixCellOutcome;
  findings: readonly GateFinding[];
  report: SimilarityReport | null;
  identityComparison: CandidateIdentityComparison | null;
  bindings: FluteV2CellBindings | null;
  evidenceSha256: string;
}>;

export type FluteV2ReferenceMatrixSummary = Readonly<{
  outcome: GateOutcome;
  exitCode: 0 | 1 | 2;
  expectedCellCount: 12;
  completedCellCount: number;
  admittedCellCount: number;
  passedCellCount: number;
  failedCellCount: number;
  referenceUnavailableCellCount: number;
  unexpectedUnavailableCellCount: number;
  findings: readonly GateFinding[];
}>;

export type FluteV2ReferenceRunResult = Readonly<{
  schema: "changes.evidence.phs3-uiowa-flute-v2-reference.v1";
  policy: typeof FLUTE_V2_REFERENCE_RUNNER_POLICY;
  identityControl: WindIdentityControlResult;
  rendererSourceSha256: string | null;
  wasmSha256: string | null;
  corpusManifestSha256: string | null;
  analyzerImplementationSha256: string | null;
  referenceGatePolicySha256: string;
  runnerPolicySha256: string;
  cells: readonly FluteV2ReferenceMatrixCell[];
  summary: FluteV2ReferenceMatrixSummary;
}>;

export type FluteV2ReferenceRunOptions =
  | Readonly<{ root?: string; wasmPath: string; wasmBytes?: never }>
  | Readonly<{ root?: string; wasmBytes: Uint8Array; wasmPath?: never }>;

type RuntimeFluteV2ReferenceRunOptions = Readonly<{
  wasmPath?: unknown;
  wasmBytes?: unknown;
}>;

type FluteWasm = Readonly<{
  memory: WebAssembly.Memory;
  heapBase: number;
  stateMaxBytes: () => number;
  renderPhrase: (...arguments_: number[]) => number;
}>;

type FluteWasmExports = Readonly<Record<string, unknown>>;

type CapturedInput = Readonly<{
  path: string | null;
  bytes: Uint8Array;
  sha256: string;
}>;

type InputSnapshot = Readonly<{
  manifest: CapturedInput;
  source: CapturedInput;
  analyzer: CapturedInput;
  wasm: CapturedInput;
  corpus: ReadonlyMap<string, CapturedInput>;
  manifestValue: CorpusManifest;
}>;

type RenderedCell = Readonly<{
  pcm: MonoPcm;
  requestSha256: string;
}>;

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
    return Object.fromEntries(
      Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

export function fluteV2RunnerPolicySha256(): string {
  return sha256Hex(canonicalJson(FLUTE_V2_REFERENCE_RUNNER_POLICY));
}

function pcmSha256(pcm: MonoPcm): string {
  const bytes = new Uint8Array(8 + pcm.samples.length * 4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, pcm.sampleRateHz, true);
  view.setUint32(4, pcm.samples.length, true);
  for (let index = 0; index < pcm.samples.length; index += 1) {
    view.setFloat32(8 + index * 4, pcm.samples[index] ?? 0, true);
  }
  return sha256Hex(bytes);
}

type UnboundCell = Omit<FluteV2ReferenceMatrixCell, "evidenceSha256">;

export function bindFluteV2ReferenceMatrixCell(
  cell: UnboundCell,
): FluteV2ReferenceMatrixCell {
  return Object.freeze({
    ...cell,
    evidenceSha256: sha256Hex(canonicalJson(cell)),
  });
}

function cellEvidenceDigestIsValid(cell: FluteV2ReferenceMatrixCell): boolean {
  if (!isDigest(cell.evidenceSha256)) return false;
  const { evidenceSha256, ...body } = cell;
  return evidenceSha256 === sha256Hex(canonicalJson(body));
}

function expectedCellCoordinates(id: string): Readonly<{
  midi: number;
  dynamic: Dynamic;
  velocity: number;
}> | null {
  for (const dynamic of FLUTE_V2_REFERENCE_RUNNER_POLICY.requiredDynamics) {
    for (const midi of FLUTE_V2_REFERENCE_RUNNER_POLICY.selectedMidi) {
      if (id === `m${String(midi)}-${dynamic}`) {
        return Object.freeze({
          midi,
          dynamic,
          velocity: FLUTE_V2_REFERENCE_RUNNER_POLICY.velocityByDynamic[dynamic],
        });
      }
    }
  }
  return null;
}

async function capture(path: string): Promise<CapturedInput> {
  const bytes = new Uint8Array(await readFile(path));
  return Object.freeze({ path, bytes, sha256: sha256Hex(bytes) });
}

function captureImmutableBytes(bytes: Uint8Array): CapturedInput {
  const copy = new Uint8Array(bytes);
  return Object.freeze({ path: null, bytes: copy, sha256: sha256Hex(copy) });
}

async function captureInputSnapshot(
  root: string,
  options: FluteV2ReferenceRunOptions,
): Promise<InputSnapshot> {
  const manifest = await capture(join(root, MANIFEST_PATH));
  if (manifest.sha256 !== EXPECTED_MANIFEST_SHA256) {
    throw new Error("FLUTE_V2_MANIFEST_DIGEST_MISMATCH");
  }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(manifest.bytes));
  assertManifest(parsed);
  const [source, analyzer] = await Promise.all([
    capture(join(root, RENDERER_SOURCE_PATH)),
    capture(join(root, ANALYZER_SOURCE_PATH)),
  ]);
  const runtimeOptions: RuntimeFluteV2ReferenceRunOptions = options;
  let wasm: CapturedInput;
  if (typeof runtimeOptions.wasmPath === "string") {
    wasm = await capture(runtimeOptions.wasmPath);
  } else if (runtimeOptions.wasmBytes instanceof Uint8Array) {
    wasm = captureImmutableBytes(runtimeOptions.wasmBytes);
  } else {
    throw new Error("FLUTE_V2_WASM_INPUT_AMBIGUOUS");
  }
  const corpus = new Map<string, CapturedInput>();
  for (const file of parsed.files) {
    const input = await capture(join(root, CORPUS_DIRECTORY, file.fileName));
    if (input.bytes.byteLength !== file.bytes || input.sha256 !== file.sha256) {
      throw new Error(`REFERENCE_CORPUS_DIGEST_MISMATCH:${file.fileName}`);
    }
    corpus.set(file.fileName, input);
  }
  return Object.freeze({
    manifest,
    source,
    analyzer,
    wasm,
    corpus,
    manifestValue: parsed,
  });
}

export async function verifyFluteV2InputDigests(
  inputs: readonly Readonly<{ path: string; sha256: string }>[],
): Promise<boolean> {
  try {
    const after = await Promise.all(inputs.map(async (input) => ({
      expected: input.sha256,
      actual: sha256Hex(new Uint8Array(await readFile(input.path))),
    })));
    return after.every((digest) => digest.expected === digest.actual);
  } catch {
    return false;
  }
}

function snapshotDigestInputs(snapshot: InputSnapshot): readonly Readonly<{
  path: string;
  sha256: string;
}>[] {
  const captured = [
    snapshot.manifest,
    snapshot.source,
    snapshot.analyzer,
    ...(snapshot.wasm.path === null ? [] : [snapshot.wasm]),
    ...snapshot.corpus.values(),
  ];
  return Object.freeze(captured.map((input) => {
    if (input.path === null) throw new Error("byte input cannot enter the path digest set");
    return Object.freeze({ path: input.path, sha256: input.sha256 });
  }));
}

async function inputSnapshotIsStable(
  snapshot: InputSnapshot,
  options: FluteV2ReferenceRunOptions,
): Promise<boolean> {
  if (!await verifyFluteV2InputDigests(snapshotDigestInputs(snapshot))) return false;
  const runtimeOptions: RuntimeFluteV2ReferenceRunOptions = options;
  return runtimeOptions.wasmBytes instanceof Uint8Array
    ? sha256Hex(runtimeOptions.wasmBytes) === snapshot.wasm.sha256
    : true;
}

function assertManifest(value: unknown): asserts value is CorpusManifest {
  if (value === null || typeof value !== "object") throw new Error("manifest is not an object");
  const manifest = value as Partial<CorpusManifest>;
  if (manifest.schema !== "changes.fixture.uiowa-wind-identity-corpus.v1" ||
    !Array.isArray(manifest.selectedMidi) || !Array.isArray(manifest.requiredDynamics) ||
    !Array.isArray(manifest.files) || manifest.files.length !== 6) {
    throw new Error("manifest schema or matrix cardinality is invalid");
  }
}

function requireFunction(exports: FluteWasmExports, name: string): (...arguments_: number[]) => number {
  const value = exports[name];
  if (typeof value !== "function") throw new Error(`FLUTE_V2_WASM_EXPORT_MISSING:${name}`);
  return value as (...arguments_: number[]) => number;
}

function requireWasm(exports: FluteWasmExports): FluteWasm {
  if (!(exports["memory"] instanceof WebAssembly.Memory)) {
    throw new Error("FLUTE_V2_WASM_EXPORT_MISSING:memory");
  }
  const rawHeapBase = exports["__heap_base"];
  const heapBase = rawHeapBase instanceof WebAssembly.Global
    ? Number(rawHeapBase.value)
    : typeof rawHeapBase === "number" ? rawHeapBase : Number.NaN;
  if (!Number.isSafeInteger(heapBase) || heapBase < 0) {
    throw new Error("FLUTE_V2_WASM_EXPORT_INVALID:__heap_base");
  }
  return Object.freeze({
    memory: exports["memory"],
    heapBase,
    stateMaxBytes: requireFunction(exports, "flt2_state_max_bytes"),
    renderPhrase: requireFunction(exports, "flt2_render_phrase"),
  });
}

function align16(value: number): number {
  return (value + 15) & ~15;
}

function renderCell(wasm: FluteWasm, midi: number, velocity: number): RenderedCell {
  const frames = FLUTE_V2_REFERENCE_RUNNER_POLICY.noteFrames;
  const leftPointer = align16(wasm.heapBase);
  const rightPointer = leftPointer + frames * 4;
  const statePointer = rightPointer + frames * 4;
  const stateCapacity = wasm.stateMaxBytes();
  if (!Number.isSafeInteger(stateCapacity) || stateCapacity <= 0) {
    throw new Error("FLUTE_V2_WASM_STATE_CAPACITY_INVALID");
  }
  const requiredBytes = statePointer + stateCapacity;
  if (requiredBytes > wasm.memory.buffer.byteLength) {
    wasm.memory.grow(Math.ceil((requiredBytes - wasm.memory.buffer.byteLength) / 65_536));
  }
  const request = Object.freeze({
    export: "flt2_render_phrase" as const,
    midi,
    velocity,
    sampleRateHz: FLUTE_V2_REFERENCE_RUNNER_POLICY.sampleRateHz,
    variationSlot: FLUTE_V2_REFERENCE_RUNNER_POLICY.variationSlot,
    articulationCode: 1,
    leftPointer,
    rightPointer,
    frames,
    incomingStatePointer: 0,
    incomingStateLength: 0,
    outgoingStatePointer: statePointer,
    outgoingStateCapacity: stateCapacity,
  });
  const rendered = wasm.renderPhrase(
    request.midi,
    request.velocity,
    request.sampleRateHz,
    request.variationSlot,
    request.articulationCode,
    request.leftPointer,
    request.rightPointer,
    request.frames,
    request.incomingStatePointer,
    request.incomingStateLength,
    request.outgoingStatePointer,
    request.outgoingStateCapacity,
  );
  if (rendered !== frames) throw new Error(`FLUTE_V2_WASM_RENDER_REFUSED:${String(rendered)}`);
  const left = new Float32Array(wasm.memory.buffer, leftPointer, frames);
  const right = new Float32Array(wasm.memory.buffer, rightPointer, frames);
  const samples = new Float32Array(frames);
  for (let index = 0; index < frames; index += 1) {
    samples[index] = ((left[index] ?? 0) + (right[index] ?? 0)) * 0.5;
  }
  return Object.freeze({
    pcm: Object.freeze({
      samples,
      sampleRateHz: FLUTE_V2_REFERENCE_RUNNER_POLICY.sampleRateHz,
    }),
    requestSha256: sha256Hex(canonicalJson(request)),
  });
}

function isExpectedReferenceUnavailable(cell: FluteV2ReferenceMatrixCell): boolean {
  return FLUTE_V2_REFERENCE_RUNNER_POLICY.expectedReferenceUnavailableIds.includes(
    cell.id as typeof FLUTE_V2_REFERENCE_RUNNER_POLICY.expectedReferenceUnavailableIds[number],
  ) && cell.outcome === "reference-unavailable" &&
    cell.findings.length === 1 && cell.findings[0]?.code === "REFERENCE_PITCH_MISMATCH";
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFluteV2ReferenceMatrixCell(value: unknown): value is FluteV2ReferenceMatrixCell {
  if (!isRecord(value)) return false;
  const findings = value["findings"];
  const outcome = value["outcome"];
  const report = value["report"];
  const identityComparison = value["identityComparison"];
  const bindings = value["bindings"];
  return typeof value["id"] === "string" &&
    typeof value["midi"] === "number" && Number.isFinite(value["midi"]) &&
    (value["dynamic"] === "pp" || value["dynamic"] === "mf" || value["dynamic"] === "ff") &&
    typeof value["velocity"] === "number" && Number.isFinite(value["velocity"]) &&
    (outcome === "pass" || outcome === "fail" || outcome === "reference-unavailable" ||
      outcome === "unavailable") &&
    Array.isArray(findings) && findings.every((item: unknown) =>
      isRecord(item) && typeof item["code"] === "string" && typeof item["message"] === "string") &&
    (report === null || isRecord(report)) &&
    (identityComparison === null || isRecord(identityComparison)) &&
    (bindings === null || isRecord(bindings)) &&
    isDigest(value["evidenceSha256"]);
}

export function summarizeFluteV2ReferenceCells(
  cells: readonly FluteV2ReferenceMatrixCell[],
): FluteV2ReferenceMatrixSummary {
  const expectedIds = new Set(
    FLUTE_V2_REFERENCE_RUNNER_POLICY.requiredDynamics.flatMap((dynamic) =>
      FLUTE_V2_REFERENCE_RUNNER_POLICY.selectedMidi.map((midi) =>
        `m${String(midi)}-${dynamic}`),
    ),
  );
  const actualIds = new Set(cells.map((cell) => cell.id));
  const passed = cells.filter((cell) => cell.outcome === "pass").length;
  const failed = cells.filter((cell) => cell.outcome === "fail").length;
  const referenceUnavailable = cells.filter(isExpectedReferenceUnavailable).length;
  const unexpectedUnavailable = cells.filter((cell) =>
    cell.outcome === "unavailable" ||
    (cell.outcome === "reference-unavailable" && !isExpectedReferenceUnavailable(cell))).length;
  const findings: GateFinding[] = [];
  if (cells.length !== 12 || actualIds.size !== 12 ||
    [...actualIds].some((id) => !expectedIds.has(id))) {
    findings.push(finding("FLUTE_V2_MATRIX_INCOMPLETE", "matrix must contain each frozen cell once"));
  }
  if (cells.some((cell) => {
    const expected = expectedCellCoordinates(cell.id);
    return expected === null || cell.midi !== expected.midi ||
      cell.dynamic !== expected.dynamic || cell.velocity !== expected.velocity;
  })) {
    findings.push(finding(
      "FLUTE_V2_CELL_COORDINATES",
      "cell id, MIDI, dynamic, and velocity must match the frozen render request",
    ));
  }
  if (cells.some((cell) => !cellEvidenceDigestIsValid(cell))) {
    findings.push(finding(
      "FLUTE_V2_CELL_EVIDENCE_DIGEST",
      "one or more cells do not bind their complete evidence body",
    ));
  }
  if (referenceUnavailable !==
    FLUTE_V2_REFERENCE_RUNNER_POLICY.requiredReferenceUnavailableCells) {
    findings.push(finding(
      "FLUTE_V2_REFERENCE_UNAVAILABLE_SET_CHANGED",
      "the four independently invalid Iowa reference cells changed",
    ));
  }
  const admitted = passed + failed;
  if (admitted !== FLUTE_V2_REFERENCE_RUNNER_POLICY.requiredAdmittedCells) {
    findings.push(finding("FLUTE_V2_ADMITTED_COUNT", `expected 8 admitted cells, got ${String(admitted)}`));
  }
  if (unexpectedUnavailable > 0) {
    findings.push(finding("FLUTE_V2_UNEXPECTED_UNAVAILABLE", `${String(unexpectedUnavailable)} cells unavailable`));
  }
  const unavailable = findings.length > 0;
  const outcome: GateOutcome = unavailable ? "unavailable" : failed > 0 ? "fail" : "pass";
  return Object.freeze({
    outcome,
    exitCode: outcome === "pass" ? 0 : outcome === "fail" ? 1 : 2,
    expectedCellCount: 12,
    completedCellCount: cells.length,
    admittedCellCount: admitted,
    passedCellCount: passed,
    failedCellCount: failed,
    referenceUnavailableCellCount: referenceUnavailable,
    unexpectedUnavailableCellCount: unexpectedUnavailable,
    findings: Object.freeze(findings),
  });
}

function isStructurallyValidPassEvidence(value: unknown): value is FluteV2ReferenceRunResult {
  if (value === null || typeof value !== "object") return false;
  const unknownRecord = value as Readonly<Record<string, unknown>>;
  const cells = unknownRecord["cells"];
  if (!Array.isArray(cells) || !cells.every((cell: unknown) =>
    isFluteV2ReferenceMatrixCell(cell))) return false;
  const record = value as Partial<FluteV2ReferenceRunResult>;
  const identityControl = record.identityControl;
  if (record.schema !== "changes.evidence.phs3-uiowa-flute-v2-reference.v1" ||
    canonicalJson(record.policy) !== canonicalJson(FLUTE_V2_REFERENCE_RUNNER_POLICY) ||
    identityControl === undefined || identityControl.outcome !== "pass" ||
    identityControl.exitCode !== 0 ||
    typeof record.rendererSourceSha256 !== "string" ||
    typeof record.wasmSha256 !== "string" ||
    record.corpusManifestSha256 !== EXPECTED_MANIFEST_SHA256 ||
    typeof record.analyzerImplementationSha256 !== "string" ||
    record.referenceGatePolicySha256 !== windReferencePolicySha256() ||
    record.runnerPolicySha256 !== fluteV2RunnerPolicySha256() ||
    record.summary === undefined) return false;
  if (![record.rendererSourceSha256, record.wasmSha256,
    record.analyzerImplementationSha256, record.referenceGatePolicySha256,
    record.runnerPolicySha256].every(isDigest)) return false;
  const summary = summarizeFluteV2ReferenceCells(cells);
  if (summary.outcome !== "pass" || summary.exitCode !== 0 ||
    canonicalJson(summary) !== canonicalJson(record.summary)) return false;
  return cells.every((cell) => {
    const bindings = cell.bindings;
    if (bindings === null || !Object.values(bindings)
      .filter((digest) => digest !== null).every(isDigest) ||
      bindings.rendererSourceSha256 !== record.rendererSourceSha256 ||
      bindings.wasmSha256 !== record.wasmSha256 ||
      bindings.corpusManifestSha256 !== record.corpusManifestSha256 ||
      bindings.analyzerImplementationSha256 !== record.analyzerImplementationSha256 ||
      bindings.referenceGatePolicySha256 !== record.referenceGatePolicySha256 ||
      bindings.runnerPolicySha256 !== record.runnerPolicySha256) return false;
    if (isExpectedReferenceUnavailable(cell)) {
      return cell.report === null && cell.identityComparison === null &&
        bindings.renderRequestSha256 === null && bindings.candidatePcmSha256 === null;
    }
    if (cell.outcome !== "pass" || cell.findings.length !== 0 ||
      cell.report === null || cell.identityComparison === null ||
      !isDigest(bindings.renderRequestSha256) ||
      !isDigest(bindings.candidatePcmSha256)) return false;
    return evaluateTargetedSimilarityReport(
      cell.report,
      identityControl,
      cell.identityComparison,
    ).outcome === "pass";
  });
}

/**
 * Verify stored PASS evidence against a separately executed replay. A digest
 * over hand-authored feature values is not proof that those values came from
 * the named PCM, so exact replay equality is part of this trust boundary.
 */
export function verifyFluteV2ReferenceRunEvidenceAgainstReplay(
  value: unknown,
  replay: unknown,
): value is FluteV2ReferenceRunResult {
  return isStructurallyValidPassEvidence(value) &&
    isStructurallyValidPassEvidence(replay) &&
    canonicalJson(value) === canonicalJson(replay);
}

export async function verifyFluteV2ReferenceRunEvidence(
  value: unknown,
  options: FluteV2ReferenceRunOptions,
): Promise<boolean> {
  const replay = await runUiowaFluteV2Reference(options);
  return verifyFluteV2ReferenceRunEvidenceAgainstReplay(value, replay);
}

function unavailableRun(
  identityControl: WindIdentityControlResult,
  code: string,
  message: string,
): FluteV2ReferenceRunResult {
  const cell = bindFluteV2ReferenceMatrixCell({
    id: "runner-unavailable",
    midi: 0,
    dynamic: "pp",
    velocity: 0,
    outcome: "unavailable",
    findings: Object.freeze([finding(code, message)]),
    report: null,
    identityComparison: null,
    bindings: null,
  });
  return Object.freeze({
    schema: "changes.evidence.phs3-uiowa-flute-v2-reference.v1",
    policy: FLUTE_V2_REFERENCE_RUNNER_POLICY,
    identityControl,
    rendererSourceSha256: null,
    wasmSha256: null,
    corpusManifestSha256: null,
    analyzerImplementationSha256: null,
    referenceGatePolicySha256: windReferencePolicySha256(),
    runnerPolicySha256: fluteV2RunnerPolicySha256(),
    cells: Object.freeze([cell]),
    summary: summarizeFluteV2ReferenceCells([cell]),
  });
}

export async function runUiowaFluteV2Reference(
  options: FluteV2ReferenceRunOptions,
): Promise<FluteV2ReferenceRunResult> {
  const root = options.root ?? process.cwd();
  const inputFailureControl: WindIdentityControlResult = Object.freeze({
    outcome: "unavailable",
    exitCode: 2,
    findings: Object.freeze([finding(
      "IDENTITY_INPUT_NOT_RUN",
      "runner inputs were unavailable before the identity control could run",
    )]),
    measurements: Object.freeze([]),
  });
  const runtimeOptions: RuntimeFluteV2ReferenceRunOptions = options;
  const hasWasmPath = typeof runtimeOptions.wasmPath === "string" &&
    runtimeOptions.wasmPath.length > 0;
  const hasWasmBytes = runtimeOptions.wasmBytes instanceof Uint8Array;
  if (hasWasmPath === hasWasmBytes) {
    return unavailableRun(
      inputFailureControl,
      "FLUTE_V2_WASM_INPUT_AMBIGUOUS",
      "provide exactly one of wasmPath or wasmBytes",
    );
  }
  if (typeof runtimeOptions.wasmPath === "string" &&
    runtimeOptions.wasmPath.length > 0 && !existsSync(runtimeOptions.wasmPath)) {
    return unavailableRun(inputFailureControl, "FLUTE_V2_WASM_ABSENT", runtimeOptions.wasmPath);
  }
  let snapshot: InputSnapshot;
  try {
    snapshot = await captureInputSnapshot(root, options);
  } catch (error) {
    return unavailableRun(inputFailureControl, "FLUTE_V2_RUNNER_INPUT_INVALID", String(error));
  }

  const identityControl = await runUiowaWindIdentityCorpus(root);
  if (identityControl.outcome !== "pass") {
    if (!await inputSnapshotIsStable(snapshot, options)) {
      return unavailableRun(identityControl, "FLUTE_V2_INPUT_DRIFT", "input digest changed during the run");
    }
    return unavailableRun(identityControl, "FLUTE_V2_IDENTITY_CONTROL_UNAVAILABLE", "identity control did not pass");
  }
  let wasm: FluteWasm;
  try {
    const instantiated = await WebAssembly.instantiate(snapshot.wasm.bytes, {});
    wasm = requireWasm(instantiated.instance.exports);
  } catch (error) {
    if (!await inputSnapshotIsStable(snapshot, options)) {
      return unavailableRun(identityControl, "FLUTE_V2_INPUT_DRIFT", "input digest changed during the run");
    }
    return unavailableRun(identityControl, "FLUTE_V2_RUNNER_INPUT_INVALID", String(error));
  }

  const manifest = snapshot.manifestValue;
  const scales = new Map<string, readonly MonoPcm[]>();
  try {
    for (const file of manifest.files) {
      const input = snapshot.corpus.get(file.fileName);
      if (input === undefined) throw new Error(`REFERENCE_CORPUS_ABSENT:${file.fileName}`);
      const notes = splitChromaticScale(readAiffMono(input.bytes));
      if (notes.length !== file.noteCount) {
        throw new Error(`REFERENCE_CORPUS_SEGMENT_COUNT:${file.fileName}`);
      }
      scales.set(`${file.instrument}:${file.dynamic}`, notes);
    }
  } catch (error) {
    if (!await inputSnapshotIsStable(snapshot, options)) {
      return unavailableRun(identityControl, "FLUTE_V2_INPUT_DRIFT", "input digest changed during the run");
    }
    return unavailableRun(identityControl, "FLUTE_V2_CORPUS_INVALID", String(error));
  }

  const sharedBindings = Object.freeze({
    rendererSourceSha256: snapshot.source.sha256,
    wasmSha256: snapshot.wasm.sha256,
    corpusManifestSha256: snapshot.manifest.sha256,
    analyzerImplementationSha256: snapshot.analyzer.sha256,
    referenceGatePolicySha256: windReferencePolicySha256(),
    runnerPolicySha256: fluteV2RunnerPolicySha256(),
  });
  const cells: FluteV2ReferenceMatrixCell[] = [];
  for (const dynamic of FLUTE_V2_REFERENCE_RUNNER_POLICY.requiredDynamics) {
    for (const midi of FLUTE_V2_REFERENCE_RUNNER_POLICY.selectedMidi) {
      const id = `m${String(midi)}-${dynamic}`;
      const velocity = FLUTE_V2_REFERENCE_RUNNER_POLICY.velocityByDynamic[dynamic];
      const fluteFile = manifest.files.find((file) =>
        file.instrument === "flute" && file.dynamic === dynamic);
      const clarinetFile = manifest.files.find((file) =>
        file.instrument === "clarinet" && file.dynamic === dynamic);
      const fluteScale = scales.get(`flute:${dynamic}`);
      const clarinetScale = scales.get(`clarinet:${dynamic}`);
      const fluteReference = fluteFile === undefined || fluteScale === undefined
        ? undefined : fluteScale[midi - fluteFile.firstMidi];
      const clarinetAlternative = clarinetFile === undefined || clarinetScale === undefined
        ? undefined : clarinetScale[midi - clarinetFile.firstMidi];
      const expectedHz = midiHz(midi);
      if (fluteReference === undefined || clarinetAlternative === undefined) {
        cells.push(bindFluteV2ReferenceMatrixCell({ id, midi, dynamic, velocity, outcome: "unavailable",
          findings: Object.freeze([finding("FLUTE_V2_CORPUS_CELL_ABSENT", id)]),
          report: null, identityComparison: null, bindings: null }));
        continue;
      }
      if (fluteFile === undefined || clarinetFile === undefined) {
        throw new Error(`FLUTE_V2_CORPUS_FILE_ABSENT:${id}`);
      }
      const referenceBindings = Object.freeze({
        ...sharedBindings,
        renderRequestSha256: null,
        candidatePcmSha256: null,
        fluteReferenceFileSha256: fluteFile.sha256,
        fluteReferenceSegmentSha256: pcmSha256(fluteReference),
        clarinetAlternativeFileSha256: clarinetFile.sha256,
        clarinetAlternativeSegmentSha256: pcmSha256(clarinetAlternative),
      });
      const referenceAdmission = admitReferenceSignal(fluteReference, expectedHz);
      if (referenceAdmission.outcome !== "accept") {
        cells.push(bindFluteV2ReferenceMatrixCell({ id, midi, dynamic, velocity, outcome: "reference-unavailable",
          findings: Object.freeze(referenceAdmission.findings.map((item) =>
            finding(`REFERENCE_${item.code}`, item.message))),
          report: null, identityComparison: null, bindings: referenceBindings }));
        continue;
      }
      try {
        const rendered = renderCell(wasm, midi, velocity);
        const bindings = Object.freeze({
          ...referenceBindings,
          renderRequestSha256: rendered.requestSha256,
          candidatePcmSha256: pcmSha256(rendered.pcm),
        });
        const comparison = compareToReference(rendered.pcm, fluteReference, expectedHz);
        const alternative = admitIdentityAlternativeSignal(clarinetAlternative, expectedHz);
        if (comparison.outcome !== "accept" || alternative.outcome !== "accept") {
          const findings = [
            ...(comparison.outcome === "unavailable" ? comparison.findings : []),
            ...(alternative.outcome === "unavailable" ? alternative.findings : []),
          ];
          cells.push(bindFluteV2ReferenceMatrixCell({ id, midi, dynamic, velocity, outcome: "unavailable",
            findings: Object.freeze(findings), report: null, identityComparison: null, bindings }));
          continue;
        }
        const identityComparison = compareCandidateIdentity(
          comparison.report.candidate,
          comparison.report.reference,
          alternative.features,
        );
        const verdict = evaluateTargetedSimilarityReport(
          comparison.report,
          identityControl,
          identityComparison,
        );
        cells.push(bindFluteV2ReferenceMatrixCell({
          id,
          midi,
          dynamic,
          velocity,
          outcome: verdict.outcome === "pass" ? "pass" : "fail",
          findings: verdict.findings,
          report: comparison.report,
          identityComparison,
          bindings,
        }));
      } catch (error) {
        cells.push(bindFluteV2ReferenceMatrixCell({ id, midi, dynamic, velocity, outcome: "unavailable",
          findings: Object.freeze([finding("FLUTE_V2_RENDER_FAILED", String(error))]),
          report: null, identityComparison: null, bindings: referenceBindings }));
      }
    }
  }
  if (!await inputSnapshotIsStable(snapshot, options)) {
    return unavailableRun(identityControl, "FLUTE_V2_INPUT_DRIFT", "input digest changed during the run");
  }
  return Object.freeze({
    schema: "changes.evidence.phs3-uiowa-flute-v2-reference.v1",
    policy: FLUTE_V2_REFERENCE_RUNNER_POLICY,
    identityControl,
    rendererSourceSha256: snapshot.source.sha256,
    wasmSha256: snapshot.wasm.sha256,
    corpusManifestSha256: snapshot.manifest.sha256,
    analyzerImplementationSha256: snapshot.analyzer.sha256,
    referenceGatePolicySha256: windReferencePolicySha256(),
    runnerPolicySha256: fluteV2RunnerPolicySha256(),
    cells: Object.freeze(cells),
    summary: summarizeFluteV2ReferenceCells(cells),
  });
}

export const FLUTE_V2_REFERENCE_CLI_USAGE =
  "usage: bun scripts/run-uiowa-flute-v2-reference.ts --wasm <concert_grand.wasm> [--output <evidence.json>]";

export type FluteV2ReferenceCliOptions = Readonly<{
  wasmPath: string;
  outputPath: string | null;
}>;

export function parseFluteV2ReferenceCliArguments(
  arguments_: readonly string[],
): FluteV2ReferenceCliOptions {
  let wasmPath: string | null = null;
  let outputPath: string | null = null;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument !== "--wasm" && argument !== "--output") {
      throw new Error(`unknown argument: ${String(argument)}`);
    }
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing value for ${argument}`);
    }
    if (argument === "--wasm") {
      if (wasmPath !== null) throw new Error("duplicate --wasm");
      wasmPath = value;
    } else {
      if (outputPath !== null) throw new Error("duplicate --output");
      outputPath = value;
    }
    index += 1;
  }
  if (wasmPath === null) throw new Error("missing required --wasm");
  return Object.freeze({ wasmPath, outputPath });
}

if (import.meta.main) {
  try {
    const options = parseFluteV2ReferenceCliArguments(process.argv.slice(2));
    const result = await runUiowaFluteV2Reference({ wasmPath: options.wasmPath });
    const serialized = `${JSON.stringify(result, null, 2)}\n`;
    if (options.outputPath === null) process.stdout.write(serialized);
    else await writeFile(options.outputPath, serialized, "utf8");
    process.exitCode = result.summary.exitCode;
  } catch (error) {
    process.stderr.write(`${String(error)}\n${FLUTE_V2_REFERENCE_CLI_USAGE}\n`);
    process.exitCode = 2;
  }
}
