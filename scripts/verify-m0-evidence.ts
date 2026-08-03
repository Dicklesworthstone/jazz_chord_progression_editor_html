/**
 * M0 MIDI-import evidence gate (bead jcpe-v3c2.3), in the
 * `verify-e1-evidence.ts` / `verify-bridge-evidence.ts` idiom.
 *
 * Independently verifies the SHIPPED M0 import — the Rust `smf_*` decoder in
 * the embedded wasm module, the export-layer pipeline, and the chart
 * derivation — from a drift-checked input closure, and emits a hash-bound
 * ledger under `test-results/m0-evidence/`. The gate:
 *
 *  1. snapshots the complete M0 input closure (contract, production, wasm
 *     payload, Rust source, fixtures, validator, tests, this script and its
 *     own corpus) before and after the run and rejects drift;
 *  2. re-runs the frozen spec validator and the exact M0 test suite as child
 *     processes, requiring zero failures and zero skips;
 *  3. runs INDEPENDENT conformance in-process against the real embedded wasm
 *     decoder: this file's own freshly written SMF reference reader and its
 *     own implementations of the frozen window, grid, measure, and reverse-T1
 *     laws. Neither the production parser nor the spec validator's reference
 *     decoder is used as an oracle;
 *  4. sweeps an independently authored corpus
 *     (`tests/fixtures/m0-verify/authored-corpus.json`) whose files were
 *     produced OUTSIDE this repository's writer — format 0, multi-channel
 *     running status, mid-track tempo and meter changes, velocity-zero
 *     note-offs, alien chunks — plus hostile files reaching every one of the
 *     28 frozen refusal codes at a detection offset known by construction;
 *  5. drives chart -> E1 export -> M0 import round trips through the real
 *     document, playback, writer, and decoder path, and pushes the accepted
 *     E1 byte goldens back through the real import;
 *  6. runs seeded structured fuzz within a recorded budget, asserting that no
 *     panic or throw ever escapes the wasm seam and that the reference reader
 *     and production agree on every classification;
 *  7. recomputes the reverse-resolution alternative sets exhaustively (every
 *     one of the 4,096 pitch-class subsets against every member bass) with the
 *     independent resolver and compares them to the shipped one;
 *  8. runs the real-browser wasm-boundary spec on Chromium, Firefox, and
 *     WebKit, driving the artifact's own file input with real bytes.
 *
 * Wall time and resource numbers are measurements, never semantic inputs.
 *
 * REGISTRATION: deliberately registered NOWHERE. Aggregate-gate registration
 * is the orchestrator's landing decision. The intended slot is
 * `scripts/verify.ts`, immediately after the `m0-midi-import-contract` step
 * and before the aggregate `bun test` step, mirroring how
 * `verify:e1-evidence` follows `validate:e1-contract`.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { cpus, platform, release } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadSmfWasmDecoder } from "../src/audio/smf-wasm";
import {
  STUDIO_INITIAL_PANELS,
  createInitialAppState,
  createStudioApplicationDependencies,
  createStudioController,
  createStudioControllerOverState,
  validateDocumentSemantics,
  type StudioController,
} from "../src/application";
import { compileStudioPlaybackPlan } from "../src/application/studio-playback";
import {
  PROGRESSION_DOCUMENT_SCHEMA,
  decodeDocumentShape,
  makeBeatPosition,
  type ValidatedDocument,
} from "../src/domain";
import { parseChordSymbol } from "../src/theory";
import {
  MIDI_EXPORT_MARKER_SCHEMA,
  MIDI_EXPORT_REQUEST_SCHEMA,
  MIDI_EXPORT_WRITER_ID,
  MIDI_EXPORT_WRITER_VERSION,
  exportMidi,
} from "../src/export";
import {
  createMidiImportOperations,
  groupSonorities,
  resolveSonority,
  type SmfDecodeFrame,
} from "../src/export/midi-import";
import { planMidiImportChart } from "../src/export/midi-import-chart";
import {
  MAX_MIDI_IMPORT_CHORD_ALTERNATIVES,
  MIDI_IMPORT_CANONICAL_SPELLINGS,
  MIDI_IMPORT_DEFAULT_METER_DENOMINATOR_POWER,
  MIDI_IMPORT_DEFAULT_METER_NUMERATOR,
  MIDI_IMPORT_DEFAULT_TEMPO_MICROSECONDS_PER_QUARTER,
  MIDI_IMPORT_GRID_DIVISIONS_PER_BEAT,
  MIDI_IMPORT_MATCH_TEMPLATES,
  MIDI_IMPORT_READER_ID,
  MIDI_IMPORT_READER_VERSION,
  MIDI_IMPORT_REFUSAL_CODES,
  MIDI_IMPORT_REQUEST_SCHEMA,
  MIDI_IMPORT_SIMULTANEITY_WINDOW_MICROSECONDS,
  MAX_MIDI_IMPORT_BYTES,
  MAX_MIDI_IMPORT_EVENTS,
  MAX_MIDI_IMPORT_METER_CHANGES,
  MAX_MIDI_IMPORT_NOTES,
  MAX_MIDI_IMPORT_TEMPO_CHANGES,
  MAX_MIDI_IMPORT_TICK_HORIZON,
  MAX_MIDI_IMPORT_TRACKS,
  MAX_MIDI_IMPORT_VLQ_BYTES,
  type MidiImportIgnoredEventKind,
  type MidiImportRefusalCode,
  type MidiImportRequest,
  type MidiImportResult,
} from "../src/export/midi-import-contract";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER_DIR = resolve(ROOT, "test-results/m0-evidence");
const LEDGER_PATH = resolve(LEDGER_DIR, "m0-evidence-ledger.json");
const BROWSER_RESULT_RELATIVE = "test-results/m0-evidence/playwright-m0-evidence.json";
const BROWSER_RESULT_PATH = resolve(ROOT, BROWSER_RESULT_RELATIVE);
const CORPUS_PATH = "tests/fixtures/m0-verify/authored-corpus.json";
const BROWSER_SPEC = "tests/e2e/m0-midi-import-evidence.spec.ts";

const LEDGER_SCHEMA = "changes.evidence.m0-midi-import.v1";

const INPUT_CLOSURE = Object.freeze([
  "dsp/concert-grand/src/smf.rs",
  "scripts/validate-m0-contract.ts",
  "scripts/verify-m0-evidence.ts",
  "src/application/studio-midi-import.ts",
  "src/audio/smf-wasm.ts",
  "src/audio/wasm/concert-grand-wasm.ts",
  "src/export/index.ts",
  "src/export/midi-import-chart.ts",
  "src/export/midi-import-contract.ts",
  "src/export/midi-import.ts",
  "src/ui/studio/MidiImportPanel.tsx",
  "tests/e2e/m0-midi-import-evidence.spec.ts",
  "tests/e2e/m0-midi-import.spec.ts",
  "tests/fixtures/m0-verify/authored-corpus.json",
  "tests/fixtures/midi-import/golden-cases.json",
  "tests/fixtures/midi-import/m0-midi-import-contract.json",
  "tests/fixtures/midi-import/mutation-controls.json",
  "tests/fixtures/midi-import/provenance-ledger.json",
  "tests/fixtures/midi-import/refusal-cases.json",
  "tests/fixtures/midi-import/resolution-cases.json",
  "tests/fixtures/midi-import/sonority-cases.json",
  "tests/fixtures/midi-import/trace-ledger.json",
  "tests/conformance/m0-verify-oracles.test.ts",
  "tests/integration/midi-roundtrip.test.ts",
  "tests/static/m0-contract.test.ts",
  "tests/support/midi-import-test-kit.ts",
  "tests/unit/midi-import-adapter.test.ts",
  "tests/unit/midi-import-decode.test.ts",
  "tests/unit/midi-import-limits.test.ts",
  "tests/unit/midi-import-pairing.test.ts",
  "tests/unit/midi-import-refusals.test.ts",
  "tests/unit/midi-import-resolution.test.ts",
  "tests/unit/midi-import-sonority.test.ts",
] as const);

const TEST_FILES = INPUT_CLOSURE.filter((path) => path.endsWith(".test.ts"));
const MINIMUM_SUITE_PASSES = 100;

/** Deterministic, recorded fuzz budget. No ambient randomness may enter. */
const FUZZ_SEEDS = Object.freeze([
  0x4d_30_00_01, 0x4d_30_00_02, 0x4d_30_00_03, 0x4d_30_00_04, 0x4d_30_00_05,
  0x4d_30_00_06, 0x4d_30_00_07, 0x4d_30_00_08, 0x4d_30_00_09, 0x4d_30_00_0a,
  0x4d_30_00_0b, 0x4d_30_00_0c,
] as const);
const FUZZ_CASES_PER_SEED = 160;

type Finding = Readonly<{ code: string; path: string; message: string }>;

class Findings {
  readonly list: Finding[] = [];
  add(code: string, path: string, message: string): void {
    this.list.push({ code, path, message });
  }
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function sha256File(
  path: string,
): Promise<Readonly<{ bytes: number; sha256: string }>> {
  const data = await readFile(resolve(ROOT, path));
  return {
    bytes: data.byteLength,
    sha256: createHash("sha256").update(data).digest("hex"),
  };
}

type ClosureComponent = Readonly<{
  path: string;
  bytes: number;
  sha256: string;
}>;

type ClosureSnapshot = Readonly<{
  algorithm: "sha256-component-manifest-v1";
  digest: string;
  components: readonly ClosureComponent[];
}>;

async function snapshotClosure(): Promise<ClosureSnapshot> {
  const components: ClosureComponent[] = [];
  for (const path of INPUT_CLOSURE) {
    const { bytes, sha256 } = await sha256File(path);
    components.push({ path, bytes, sha256 });
  }
  const digest = sha256Text(
    components
      .map((entry) => `${entry.path}:${String(entry.bytes)}:${entry.sha256}`)
      .join("\n"),
  );
  return { algorithm: "sha256-component-manifest-v1", digest, components };
}

type Execution = Readonly<{
  command: readonly string[];
  exitCode: number;
  elapsedMs: number;
  stdoutSha256: string;
  stderrSha256: string;
  stdoutTail: string;
}>;

async function runChild(
  command: readonly string[],
  extraEnv: Readonly<Record<string, string>> = {},
): Promise<Execution> {
  const startedAt = performance.now();
  const child = Bun.spawn([...command], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...extraEnv },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return {
    command,
    exitCode,
    elapsedMs: performance.now() - startedAt,
    stdoutSha256: sha256Text(stdout),
    stderrSha256: sha256Text(stderr),
    stdoutTail: `${stdout}${stderr}`.split("\n").slice(-14).join("\n"),
  };
}

/** Stable canonical text for structural comparison and digests. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return value === undefined ? "null" : JSON.stringify(value);
}

/* ------------------------------------------------------------------ *
 * The frozen laws, restated independently                             *
 * ------------------------------------------------------------------ */

/**
 * This gate's own copy of the frozen reverse-T1 template table, authored from
 * `src/export/midi-import-contract.ts` rather than imported for use. It is
 * compared against the contract's table as a reciprocity check, so a silent
 * edit to either side is a finding rather than an agreement.
 */
type IndependentTemplate = Readonly<{
  id: string;
  formulaRuleId: string;
  realizationId: string | null;
  extensionNumber: number | null;
  offsets: readonly number[];
  omissibleFifth: boolean;
}>;

const INDEPENDENT_TEMPLATES: readonly IndependentTemplate[] = Object.freeze([
  { id: "M0-TPL-01", formulaRuleId: "base-power", realizationId: null, extensionNumber: null, offsets: [0, 7], omissibleFifth: false },
  { id: "M0-TPL-02", formulaRuleId: "base-major", realizationId: null, extensionNumber: null, offsets: [0, 4, 7], omissibleFifth: false },
  { id: "M0-TPL-03", formulaRuleId: "base-minor", realizationId: null, extensionNumber: null, offsets: [0, 3, 7], omissibleFifth: false },
  { id: "M0-TPL-04", formulaRuleId: "base-diminished", realizationId: null, extensionNumber: null, offsets: [0, 3, 6], omissibleFifth: false },
  { id: "M0-TPL-05", formulaRuleId: "base-augmented", realizationId: null, extensionNumber: null, offsets: [0, 4, 8], omissibleFifth: false },
  { id: "M0-TPL-06", formulaRuleId: "base-sus2", realizationId: null, extensionNumber: null, offsets: [0, 2, 7], omissibleFifth: false },
  { id: "M0-TPL-07", formulaRuleId: "base-sus4", realizationId: null, extensionNumber: null, offsets: [0, 5, 7], omissibleFifth: false },
  { id: "M0-TPL-08", formulaRuleId: "sixth-major", realizationId: null, extensionNumber: null, offsets: [0, 4, 7, 9], omissibleFifth: true },
  { id: "M0-TPL-09", formulaRuleId: "sixth-minor", realizationId: null, extensionNumber: null, offsets: [0, 3, 7, 9], omissibleFifth: true },
  { id: "M0-TPL-10", formulaRuleId: "seventh-major", realizationId: null, extensionNumber: null, offsets: [0, 4, 7, 11], omissibleFifth: true },
  { id: "M0-TPL-11", formulaRuleId: "seventh-dominant", realizationId: null, extensionNumber: null, offsets: [0, 4, 7, 10], omissibleFifth: true },
  { id: "M0-TPL-12", formulaRuleId: "seventh-minor", realizationId: null, extensionNumber: null, offsets: [0, 3, 7, 10], omissibleFifth: true },
  { id: "M0-TPL-13", formulaRuleId: "seventh-minor-major", realizationId: null, extensionNumber: null, offsets: [0, 3, 7, 11], omissibleFifth: true },
  { id: "M0-TPL-14", formulaRuleId: "seventh-half-diminished", realizationId: null, extensionNumber: null, offsets: [0, 3, 6, 10], omissibleFifth: false },
  { id: "M0-TPL-15", formulaRuleId: "seventh-diminished", realizationId: null, extensionNumber: null, offsets: [0, 3, 6, 9], omissibleFifth: false },
  { id: "M0-TPL-16", formulaRuleId: "seventh-augmented-major", realizationId: null, extensionNumber: null, offsets: [0, 4, 8, 11], omissibleFifth: false },
  { id: "M0-TPL-17", formulaRuleId: "extension-suspended-dominant", realizationId: null, extensionNumber: null, offsets: [0, 5, 7, 10], omissibleFifth: true },
  { id: "M0-TPL-18", formulaRuleId: "extension-major", realizationId: null, extensionNumber: 9, offsets: [0, 2, 4, 7, 11], omissibleFifth: true },
  { id: "M0-TPL-19", formulaRuleId: "extension-dominant", realizationId: null, extensionNumber: 9, offsets: [0, 2, 4, 7, 10], omissibleFifth: true },
  { id: "M0-TPL-20", formulaRuleId: "extension-minor", realizationId: null, extensionNumber: 9, offsets: [0, 2, 3, 7, 10], omissibleFifth: true },
  { id: "M0-TPL-21", formulaRuleId: "altered-dominant", realizationId: "alt-b9-b5", extensionNumber: null, offsets: [0, 1, 4, 6, 10], omissibleFifth: false },
  { id: "M0-TPL-22", formulaRuleId: "altered-dominant", realizationId: "alt-b9-sharp5", extensionNumber: null, offsets: [0, 1, 4, 8, 10], omissibleFifth: false },
  { id: "M0-TPL-23", formulaRuleId: "altered-dominant", realizationId: "alt-sharp9-b5", extensionNumber: null, offsets: [0, 3, 4, 6, 10], omissibleFifth: false },
  { id: "M0-TPL-24", formulaRuleId: "altered-dominant", realizationId: "alt-sharp9-sharp5", extensionNumber: null, offsets: [0, 3, 4, 8, 10], omissibleFifth: false },
] as const);

/** This gate's own copy of the frozen flat-preferring import spellings. */
const INDEPENDENT_SPELLINGS: readonly Readonly<{ step: string; alter: number }>[] =
  Object.freeze([
    { step: "C", alter: 0 },
    { step: "D", alter: -1 },
    { step: "D", alter: 0 },
    { step: "E", alter: -1 },
    { step: "E", alter: 0 },
    { step: "F", alter: 0 },
    { step: "G", alter: -1 },
    { step: "G", alter: 0 },
    { step: "A", alter: -1 },
    { step: "A", alter: 0 },
    { step: "B", alter: -1 },
    { step: "B", alter: 0 },
  ] as const);

/** This gate's own copy of the frozen exact-integer bounds. */
const INDEPENDENT_LIMITS = Object.freeze({
  bytes: 4_194_304,
  tracks: 64,
  events: 524_288,
  notes: 131_072,
  tickHorizon: 1_073_741_823,
  tempoChanges: 4_096,
  meterChanges: 1_024,
  vlqBytes: 4,
  windowMicroseconds: 40_000,
  gridDivisionsPerBeat: 4,
  defaultTempo: 500_000,
  defaultMeterNumerator: 4,
  defaultMeterDenominatorPower: 2,
  alternatives: 8,
} as const);

function checkFrozenLawReciprocity(findings: Findings): void {
  if (
    canonical(
      INDEPENDENT_TEMPLATES.map((entry) => ({
        id: entry.id,
        formulaRuleId: entry.formulaRuleId,
        realizationId: entry.realizationId,
        extensionNumber: entry.extensionNumber,
        offsets: [...entry.offsets],
        omissibleFifth: entry.omissibleFifth,
      })),
    ) !==
    canonical(
      MIDI_IMPORT_MATCH_TEMPLATES.map((entry) => ({
        id: entry.id,
        formulaRuleId: entry.formulaRuleId,
        realizationId: entry.realizationId,
        extensionNumber: entry.extensionNumber,
        offsets: [...entry.pitchClassOffsets],
        omissibleFifth: entry.omissibleFifth,
      })),
    )
  ) {
    findings.add(
      "M0E_LAW_TEMPLATES",
      "MIDI_IMPORT_MATCH_TEMPLATES",
      "the contract template table and this gate's independent copy disagree",
    );
  }
  if (
    canonical(INDEPENDENT_SPELLINGS) !==
    canonical(MIDI_IMPORT_CANONICAL_SPELLINGS.map((entry) => ({ ...entry })))
  ) {
    findings.add(
      "M0E_LAW_SPELLINGS",
      "MIDI_IMPORT_CANONICAL_SPELLINGS",
      "the contract spelling table and this gate's independent copy disagree",
    );
  }
  const contractLimits = {
    bytes: MAX_MIDI_IMPORT_BYTES,
    tracks: MAX_MIDI_IMPORT_TRACKS,
    events: MAX_MIDI_IMPORT_EVENTS,
    notes: MAX_MIDI_IMPORT_NOTES,
    tickHorizon: MAX_MIDI_IMPORT_TICK_HORIZON,
    tempoChanges: MAX_MIDI_IMPORT_TEMPO_CHANGES,
    meterChanges: MAX_MIDI_IMPORT_METER_CHANGES,
    vlqBytes: MAX_MIDI_IMPORT_VLQ_BYTES,
    windowMicroseconds: MIDI_IMPORT_SIMULTANEITY_WINDOW_MICROSECONDS,
    gridDivisionsPerBeat: MIDI_IMPORT_GRID_DIVISIONS_PER_BEAT,
    defaultTempo: MIDI_IMPORT_DEFAULT_TEMPO_MICROSECONDS_PER_QUARTER,
    defaultMeterNumerator: MIDI_IMPORT_DEFAULT_METER_NUMERATOR,
    defaultMeterDenominatorPower: MIDI_IMPORT_DEFAULT_METER_DENOMINATOR_POWER,
    alternatives: MAX_MIDI_IMPORT_CHORD_ALTERNATIVES,
  };
  if (canonical(contractLimits) !== canonical(INDEPENDENT_LIMITS)) {
    findings.add(
      "M0E_LAW_LIMITS",
      "midi-import-contract",
      "the contract's exact-integer bounds and this gate's independent copy disagree",
    );
  }
}

/* ------------------------------------------------------------------ *
 * Independent SMF reference reader                                    *
 * ------------------------------------------------------------------ */

/**
 * A freshly written Standard MIDI File reader for this gate, authored from the
 * frozen contract and the SMF 1.0 specification. It shares no code with the
 * production parser, the wasm decoder, or the spec validator's reference
 * decoder, and it produces the same shapes the contract's decode model
 * declares so the two can be compared literally.
 */
type ReferenceNote = Readonly<{
  channel: number;
  key: number;
  onTick: number;
  offTick: number;
  onVelocity: number;
}>;

type ReferenceTrack = {
  index: number;
  name: string | null;
  instrumentName: string | null;
  markers: { tick: number; text: string }[];
  notes: ReferenceNote[];
};

type ReferenceModel = Readonly<{
  header: Readonly<{ format: number; trackCount: number; division: number }>;
  tempoMap: readonly Readonly<{
    tick: number;
    microsecondsPerQuarter: number;
  }>[];
  meterMap: readonly Readonly<{
    tick: number;
    numerator: number;
    denominatorPower: number;
  }>[];
  tracks: readonly Readonly<{
    index: number;
    name: string | null;
    instrumentName: string | null;
    markers: readonly Readonly<{ tick: number; text: string }>[];
    notes: readonly ReferenceNote[];
  }>[];
  ignoredEvents: readonly Readonly<{
    trackIndex: number;
    tick: number;
    kind: MidiImportIgnoredEventKind;
    byteOffset: number;
  }>[];
  alienChunks: readonly Readonly<{
    byteOffset: number;
    tag: string;
    dataLength: number;
  }>[];
  counters: Readonly<{
    bytesRead: number;
    chunksSeen: number;
    eventsDecoded: number;
    eventsIgnored: number;
    notesPaired: number;
    peakOpenNotes: number;
    tempoChanges: number;
    meterChanges: number;
  }>;
}>;

type ReferenceResult =
  | Readonly<{ ok: true; model: ReferenceModel }>
  | Readonly<{
      ok: false;
      code: MidiImportRefusalCode;
      byteOffset: number | null;
      trackIndex: number | null;
    }>;

class ReferenceRefusal extends Error {
  constructor(
    readonly code: MidiImportRefusalCode,
    readonly byteOffset: number,
    public trackIndex: number | null,
  ) {
    super(code);
    this.name = "ReferenceRefusal";
  }
}

const CONSUMED_META = new Set([0x03, 0x04, 0x06, 0x2f, 0x51, 0x58]);

const TOLERATED_META = new Map<number, MidiImportIgnoredEventKind>([
  [0x00, "sequence-number"],
  [0x01, "text"],
  [0x02, "copyright"],
  [0x05, "lyric"],
  [0x07, "cue-point"],
  [0x20, "channel-prefix"],
  [0x21, "midi-port"],
  [0x54, "smpte-offset"],
  [0x59, "key-signature"],
  [0x7f, "sequencer-specific"],
]);

const FIXED_META_LENGTH = new Map<number, number>([
  [0x51, 3],
  [0x58, 4],
  [0x2f, 0],
  [0x20, 1],
  [0x21, 1],
  [0x54, 5],
  [0x59, 2],
]);

const referenceTextDecoder = new TextDecoder("utf-8");

function referenceDecode(bytes: Uint8Array): ReferenceResult {
  try {
    return { ok: true, model: referenceDecodeOrThrow(bytes) };
  } catch (error) {
    if (error instanceof ReferenceRefusal) {
      return {
        ok: false,
        code: error.code,
        byteOffset: error.byteOffset < 0 ? null : error.byteOffset,
        trackIndex: error.trackIndex,
      };
    }
    throw error;
  }
}

function at(bytes: Uint8Array, offset: number): number {
  return bytes[offset] ?? 0;
}

function beU16(bytes: Uint8Array, offset: number): number {
  return (at(bytes, offset) << 8) | at(bytes, offset + 1);
}

function beU32(bytes: Uint8Array, offset: number): number {
  return (
    at(bytes, offset) * 0x100_0000 +
    at(bytes, offset + 1) * 0x1_0000 +
    at(bytes, offset + 2) * 0x100 +
    at(bytes, offset + 3)
  );
}

function readVlq(
  bytes: Uint8Array,
  start: number,
  limit: number,
): Readonly<{ value: number; next: number }> {
  let value = 0;
  let index = start;
  let consumed = 0;
  for (;;) {
    if (index >= limit) {
      throw new ReferenceRefusal("smf.chunk_truncated", limit, null);
    }
    const byte = at(bytes, index);
    value = value * 128 + (byte & 0x7f);
    index += 1;
    consumed += 1;
    if ((byte & 0x80) === 0) return { value, next: index };
    if (consumed >= INDEPENDENT_LIMITS.vlqBytes) {
      throw new ReferenceRefusal("smf.delta_invalid", start, null);
    }
  }
}

function referenceText(
  bytes: Uint8Array,
  offset: number,
  length: number,
): string {
  if (offset < 0 || length <= 0) return "";
  const end = Math.min(bytes.byteLength, offset + length);
  if (offset >= end) return "";
  return referenceTextDecoder.decode(bytes.subarray(offset, end));
}

function referenceDecodeOrThrow(bytes: Uint8Array): ReferenceModel {
  const length = bytes.byteLength;
  if (length < 14) {
    throw new ReferenceRefusal("smf.header_invalid", length, null);
  }
  if (
    at(bytes, 0) !== 0x4d ||
    at(bytes, 1) !== 0x54 ||
    at(bytes, 2) !== 0x68 ||
    at(bytes, 3) !== 0x64
  ) {
    throw new ReferenceRefusal("smf.header_invalid", 0, null);
  }
  if (beU32(bytes, 4) !== 6) {
    throw new ReferenceRefusal("smf.header_invalid", 4, null);
  }
  const format = beU16(bytes, 8);
  if (format > 1) {
    throw new ReferenceRefusal("smf.format_unsupported", 8, null);
  }
  const declaredTracks = beU16(bytes, 10);
  if (declaredTracks === 0 || (format === 0 && declaredTracks !== 1)) {
    throw new ReferenceRefusal("smf.track_count_invalid", 10, null);
  }
  if (declaredTracks > INDEPENDENT_LIMITS.tracks) {
    throw new ReferenceRefusal("limit.midi_import_tracks_exceeded", 10, null);
  }
  const division = beU16(bytes, 12);
  if ((division & 0x8000) !== 0) {
    throw new ReferenceRefusal("smf.division_smpte_unsupported", 12, null);
  }
  if (division === 0) {
    throw new ReferenceRefusal("smf.division_zero", 12, null);
  }

  const state = {
    chunksSeen: 1,
    eventsDecoded: 0,
    eventsIgnored: 0,
    notesOpened: 0,
    notesPaired: 0,
    peakOpenNotes: 0,
    tempoChanges: 0,
    meterChanges: 0,
  };
  const tempoMap: { tick: number; microsecondsPerQuarter: number }[] = [];
  const meterMap: { tick: number; numerator: number; denominatorPower: number }[] =
    [];
  const ignoredEvents: {
    trackIndex: number;
    tick: number;
    kind: MidiImportIgnoredEventKind;
    byteOffset: number;
  }[] = [];
  const alienChunks: { byteOffset: number; tag: string; dataLength: number }[] =
    [];
  const tracks: ReferenceTrack[] = [];

  let position = 14;
  let tracksParsed = 0;
  while (position < length) {
    if (position + 8 > length) {
      throw new ReferenceRefusal("smf.chunk_truncated", length, null);
    }
    for (let index = 0; index < 4; index += 1) {
      const byte = at(bytes, position + index);
      if (byte < 0x20 || byte > 0x7e) {
        throw new ReferenceRefusal("smf.chunk_invalid", position, null);
      }
    }
    const tag = String.fromCharCode(
      at(bytes, position),
      at(bytes, position + 1),
      at(bytes, position + 2),
      at(bytes, position + 3),
    );
    const declared = beU32(bytes, position + 4);
    const dataStart = position + 8;
    const dataEnd = dataStart + declared;
    if (tag === "MThd") {
      throw new ReferenceRefusal("smf.chunk_invalid", position, null);
    }
    if (tag === "MTrk" && tracksParsed >= declaredTracks) {
      throw new ReferenceRefusal("smf.track_count_invalid", position, null);
    }
    if (dataEnd > length) {
      throw new ReferenceRefusal("smf.chunk_truncated", length, null);
    }
    state.chunksSeen += 1;
    if (tag === "MTrk") {
      try {
        tracks.push(
          referenceTrack(
            bytes,
            state,
            tempoMap,
            meterMap,
            ignoredEvents,
            format,
            tracksParsed,
            dataStart,
            dataEnd,
          ),
        );
      } catch (error) {
        if (error instanceof ReferenceRefusal && error.trackIndex === null) {
          error.trackIndex = tracksParsed;
        }
        throw error;
      }
      tracksParsed += 1;
    } else {
      alienChunks.push({ byteOffset: position, tag, dataLength: declared });
    }
    position = dataEnd;
  }
  if (tracksParsed < declaredTracks) {
    throw new ReferenceRefusal("smf.track_count_invalid", length, null);
  }

  return {
    header: { format, trackCount: declaredTracks, division },
    tempoMap,
    meterMap,
    tracks: tracks.map((track) => ({
      index: track.index,
      name: track.name,
      instrumentName: track.instrumentName,
      markers: track.markers,
      notes: [...track.notes].sort(
        (left, right) =>
          left.onTick - right.onTick ||
          left.channel - right.channel ||
          left.key - right.key,
      ),
    })),
    ignoredEvents,
    alienChunks,
    counters: {
      bytesRead: length,
      chunksSeen: state.chunksSeen,
      eventsDecoded: state.eventsDecoded,
      eventsIgnored: state.eventsIgnored,
      notesPaired: state.notesPaired,
      peakOpenNotes: state.peakOpenNotes,
      tempoChanges: state.tempoChanges,
      meterChanges: state.meterChanges,
    },
  };
}

type ReferenceState = {
  chunksSeen: number;
  eventsDecoded: number;
  eventsIgnored: number;
  notesOpened: number;
  notesPaired: number;
  peakOpenNotes: number;
  tempoChanges: number;
  meterChanges: number;
};

function referenceTrack(
  bytes: Uint8Array,
  state: ReferenceState,
  tempoMap: { tick: number; microsecondsPerQuarter: number }[],
  meterMap: { tick: number; numerator: number; denominatorPower: number }[],
  ignoredEvents: {
    trackIndex: number;
    tick: number;
    kind: MidiImportIgnoredEventKind;
    byteOffset: number;
  }[],
  format: number,
  trackIndex: number,
  dataStart: number,
  dataEnd: number,
): ReferenceTrack {
  const track: ReferenceTrack = {
    index: trackIndex,
    name: null,
    instrumentName: null,
    markers: [],
    notes: [],
  };
  const open = new Map<number, Readonly<{ tick: number; velocity: number }>>();
  let position = dataStart;
  let tick = 0;
  let running = -1;
  let nameOffset = -1;
  let instrumentOffset = -1;

  for (;;) {
    if (position >= dataEnd) {
      throw new ReferenceRefusal("smf.end_of_track_invalid", dataEnd, null);
    }
    const eventStart = position;
    if (
      state.eventsDecoded + state.eventsIgnored + 1 >
      INDEPENDENT_LIMITS.events
    ) {
      throw new ReferenceRefusal(
        "limit.midi_import_events_exceeded",
        eventStart,
        null,
      );
    }
    const delta = readVlq(bytes, position, dataEnd);
    tick += delta.value;
    if (tick > INDEPENDENT_LIMITS.tickHorizon) {
      throw new ReferenceRefusal(
        "limit.midi_import_tick_horizon_exceeded",
        eventStart,
        null,
      );
    }
    position = delta.next;
    if (position >= dataEnd) {
      throw new ReferenceRefusal("smf.chunk_truncated", dataEnd, null);
    }
    const lead = at(bytes, position);

    if (lead === 0xff) {
      running = -1;
      const typeOffset = position + 1;
      if (typeOffset >= dataEnd) {
        throw new ReferenceRefusal("smf.chunk_truncated", dataEnd, null);
      }
      const metaType = at(bytes, typeOffset);
      const lengthOffset = typeOffset + 1;
      const payload = readVlq(bytes, lengthOffset, dataEnd);
      const payloadLength = payload.value;
      const payloadStart = payload.next;
      const tolerated = TOLERATED_META.get(metaType);
      if (!CONSUMED_META.has(metaType) && tolerated === undefined) {
        throw new ReferenceRefusal("smf.meta_unknown", typeOffset, null);
      }
      if (metaType === 0x00) {
        if (payloadLength !== 0 && payloadLength !== 2) {
          throw new ReferenceRefusal(
            "smf.meta_length_invalid",
            lengthOffset,
            null,
          );
        }
      } else {
        const fixed = FIXED_META_LENGTH.get(metaType);
        if (fixed !== undefined) {
          if (payloadLength !== fixed) {
            throw new ReferenceRefusal(
              "smf.meta_length_invalid",
              lengthOffset,
              null,
            );
          }
        } else if (payloadLength > 1024) {
          throw new ReferenceRefusal("smf.meta_oversized", lengthOffset, null);
        }
      }
      const payloadEnd = payloadStart + payloadLength;
      if (payloadEnd > dataEnd) {
        throw new ReferenceRefusal("smf.chunk_truncated", dataEnd, null);
      }

      if (metaType === 0x2f) {
        state.eventsDecoded += 1;
        if (open.size > 0) {
          throw new ReferenceRefusal(
            "smf.note_on_unterminated",
            typeOffset,
            null,
          );
        }
        if (payloadEnd < dataEnd) {
          throw new ReferenceRefusal(
            "smf.end_of_track_invalid",
            payloadEnd,
            null,
          );
        }
        return track;
      }
      if (metaType === 0x51) {
        state.tempoChanges += 1;
        if (state.tempoChanges > INDEPENDENT_LIMITS.tempoChanges) {
          throw new ReferenceRefusal(
            "limit.midi_import_tempo_changes_exceeded",
            eventStart,
            null,
          );
        }
        if (format === 1 && trackIndex !== 0) {
          throw new ReferenceRefusal(
            "smf.conductor_meta_misplaced",
            typeOffset,
            null,
          );
        }
        const microseconds =
          (at(bytes, payloadStart) << 16) |
          (at(bytes, payloadStart + 1) << 8) |
          at(bytes, payloadStart + 2);
        if (microseconds === 0) {
          throw new ReferenceRefusal("smf.tempo_zero", payloadStart, null);
        }
        state.eventsDecoded += 1;
        tempoMap.push({ tick, microsecondsPerQuarter: microseconds });
      } else if (metaType === 0x58) {
        state.meterChanges += 1;
        if (state.meterChanges > INDEPENDENT_LIMITS.meterChanges) {
          throw new ReferenceRefusal(
            "limit.midi_import_meter_changes_exceeded",
            eventStart,
            null,
          );
        }
        if (format === 1 && trackIndex !== 0) {
          throw new ReferenceRefusal(
            "smf.conductor_meta_misplaced",
            typeOffset,
            null,
          );
        }
        const numerator = at(bytes, payloadStart);
        if (numerator === 0 || numerator > 32) {
          throw new ReferenceRefusal("smf.meter_invalid", payloadStart, null);
        }
        const denominatorPower = at(bytes, payloadStart + 1);
        if (denominatorPower > 5) {
          throw new ReferenceRefusal(
            "smf.meter_invalid",
            payloadStart + 1,
            null,
          );
        }
        state.eventsDecoded += 1;
        meterMap.push({ tick, numerator, denominatorPower });
      } else if (metaType === 0x03) {
        if (nameOffset < 0) {
          state.eventsDecoded += 1;
          nameOffset = payloadStart;
          track.name = referenceText(bytes, payloadStart, payloadLength);
        } else {
          state.eventsIgnored += 1;
          ignoredEvents.push({
            trackIndex,
            tick,
            kind: "duplicate-track-name",
            byteOffset: position,
          });
        }
      } else if (metaType === 0x04) {
        if (instrumentOffset < 0) {
          state.eventsDecoded += 1;
          instrumentOffset = payloadStart;
          track.instrumentName = referenceText(
            bytes,
            payloadStart,
            payloadLength,
          );
        } else {
          state.eventsIgnored += 1;
          ignoredEvents.push({
            trackIndex,
            tick,
            kind: "duplicate-instrument-name",
            byteOffset: position,
          });
        }
      } else if (metaType === 0x06) {
        state.eventsDecoded += 1;
        track.markers.push({
          tick,
          text: referenceText(bytes, payloadStart, payloadLength),
        });
      } else {
        state.eventsIgnored += 1;
        ignoredEvents.push({
          trackIndex,
          tick,
          kind: tolerated ?? "text",
          byteOffset: position,
        });
      }
      position = payloadEnd;
      continue;
    }

    if (lead === 0xf0 || lead === 0xf7) {
      running = -1;
      const payload = readVlq(bytes, position + 1, dataEnd);
      const payloadEnd = payload.next + payload.value;
      if (payloadEnd > dataEnd) {
        throw new ReferenceRefusal("smf.chunk_truncated", dataEnd, null);
      }
      state.eventsIgnored += 1;
      ignoredEvents.push({
        trackIndex,
        tick,
        kind: lead === 0xf0 ? "sysex" : "escape",
        byteOffset: position,
      });
      position = payloadEnd;
      continue;
    }

    if (lead >= 0xf1 && lead <= 0xfe) {
      throw new ReferenceRefusal("smf.event_invalid", position, null);
    }

    const statusOffset = position;
    let status: number;
    if (lead >= 0x80) {
      status = lead;
      running = status;
      position += 1;
    } else {
      if (running < 0) {
        throw new ReferenceRefusal("smf.event_invalid", position, null);
      }
      status = running;
    }
    const high = status & 0xf0;
    const channel = status & 0x0f;
    const dataCount = high === 0xc0 || high === 0xd0 ? 1 : 2;
    const data: number[] = [];
    for (let index = 0; index < dataCount; index += 1) {
      if (position >= dataEnd) {
        throw new ReferenceRefusal("smf.chunk_truncated", dataEnd, null);
      }
      const byte = at(bytes, position);
      if (byte >= 0x80) {
        throw new ReferenceRefusal("smf.event_invalid", position, null);
      }
      data.push(byte);
      position += 1;
    }
    const firstDataOffset = position - dataCount;

    if (high === 0x80 || high === 0x90) {
      const key = data[0] ?? 0;
      const velocity = data[1] ?? 0;
      const slot = channel * 128 + key;
      if (high === 0x90 && velocity > 0) {
        state.notesOpened += 1;
        if (state.notesOpened > INDEPENDENT_LIMITS.notes) {
          throw new ReferenceRefusal(
            "limit.midi_import_notes_exceeded",
            eventStart,
            null,
          );
        }
        if (open.has(slot)) {
          throw new ReferenceRefusal(
            "smf.note_overlap",
            firstDataOffset,
            null,
          );
        }
        open.set(slot, { tick, velocity });
        if (open.size > state.peakOpenNotes) state.peakOpenNotes = open.size;
      } else {
        const opened = open.get(slot);
        if (opened === undefined) {
          throw new ReferenceRefusal(
            "smf.note_off_unmatched",
            firstDataOffset,
            null,
          );
        }
        track.notes.push({
          channel,
          key,
          onTick: opened.tick,
          offTick: tick,
          onVelocity: opened.velocity,
        });
        open.delete(slot);
        state.notesPaired += 1;
      }
      state.eventsDecoded += 1;
      continue;
    }

    state.eventsIgnored += 1;
    const kind: MidiImportIgnoredEventKind =
      high === 0xa0
        ? "poly-aftertouch"
        : high === 0xb0
          ? "control-change"
          : high === 0xc0
            ? "program-change"
            : high === 0xd0
              ? "channel-aftertouch"
              : "pitch-bend";
    ignoredEvents.push({ trackIndex, tick, kind, byteOffset: statusOffset });
  }
}

/* ------------------------------------------------------------------ *
 * Independent sonority, grid, measure, and resolution derivations     *
 * ------------------------------------------------------------------ */

type ReferenceSegment = Readonly<{
  startTick: number;
  numerator: number;
  beatUnit: number;
  baseMeasureIndex: number;
}>;

function referenceSegments(
  meterMap: readonly Readonly<{
    tick: number;
    numerator: number;
    denominatorPower: number;
  }>[],
  ppq: number,
): readonly ReferenceSegment[] {
  const first = meterMap[0];
  const entries =
    first !== undefined && first.tick === 0
      ? [...meterMap]
      : [
          {
            tick: 0,
            numerator: INDEPENDENT_LIMITS.defaultMeterNumerator,
            denominatorPower: INDEPENDENT_LIMITS.defaultMeterDenominatorPower,
          },
          ...meterMap,
        ];
  const segments: ReferenceSegment[] = [];
  let base = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) continue;
    const beatUnit = 2 ** entry.denominatorPower;
    segments.push({
      startTick: entry.tick,
      numerator: entry.numerator,
      beatUnit,
      baseMeasureIndex: base,
    });
    const next = entries[index + 1];
    if (next === undefined) continue;
    base += Math.ceil(
      ((next.tick - entry.tick) * beatUnit) / (entry.numerator * ppq * 4),
    );
  }
  return segments;
}

type ReferenceSonority = Readonly<{
  anchorTick: number;
  memberCount: number;
  bassMidi: number;
  bassPitchClass: number;
  pitchClasses: readonly number[];
  windowTicks: number;
  tempoMicrosecondsAtAnchor: number;
  segmentIndex: number;
  gridIndex: number;
  quantizedTickNumerator: number;
  quantizedTickDenominator: number;
  quantizationErrorNumerator: number;
  quantizationErrorDenominator: number;
  measureIndex: number;
}>;

function referenceSonorities(model: ReferenceModel): readonly ReferenceSonority[] {
  const ppq = model.header.division;
  const merged: Readonly<{
    trackIndex: number;
    channel: number;
    key: number;
    onTick: number;
  }>[] = [];
  for (const track of model.tracks) {
    for (const note of track.notes) {
      merged.push({
        trackIndex: track.index,
        channel: note.channel,
        key: note.key,
        onTick: note.onTick,
      });
    }
  }
  merged.sort(
    (left, right) =>
      left.onTick - right.onTick ||
      left.trackIndex - right.trackIndex ||
      left.channel - right.channel ||
      left.key - right.key,
  );
  const segments = referenceSegments(model.meterMap, ppq);
  const out: ReferenceSonority[] = [];
  let cursor = 0;
  while (cursor < merged.length) {
    const anchor = merged[cursor];
    if (anchor === undefined) break;
    const anchorTick = anchor.onTick;
    let microseconds: number = INDEPENDENT_LIMITS.defaultTempo;
    for (const entry of model.tempoMap) {
      if (entry.tick <= anchorTick) microseconds = entry.microsecondsPerQuarter;
    }
    const windowTicks = Math.floor(
      (INDEPENDENT_LIMITS.windowMicroseconds * ppq) / microseconds,
    );
    let end = cursor;
    while (end < merged.length) {
      const candidate = merged[end];
      if (candidate === undefined) break;
      if (candidate.onTick - anchorTick > windowTicks) break;
      end += 1;
    }
    const members = merged.slice(cursor, end);
    let bassMidi = Number.POSITIVE_INFINITY;
    const present = new Set<number>();
    for (const member of members) {
      if (member.key < bassMidi) bassMidi = member.key;
      present.add(((member.key % 12) + 12) % 12);
    }
    const resolvedBass = Number.isFinite(bassMidi) ? bassMidi : 0;
    let segmentIndex = 0;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      if (segment !== undefined && segment.startTick <= anchorTick) {
        segmentIndex = index;
      }
    }
    const segment = segments[segmentIndex] ?? {
      startTick: 0,
      numerator: INDEPENDENT_LIMITS.defaultMeterNumerator,
      beatUnit: 4,
      baseMeasureIndex: 0,
    };
    const beatUnit = segment.beatUnit;
    const scaled = (anchorTick - segment.startTick) * beatUnit;
    const gridIndex = Math.floor((2 * scaled + ppq) / (2 * ppq));
    const quantized = segment.startTick * beatUnit + gridIndex * ppq;
    const measureNumerator = segment.numerator * ppq * 4;
    out.push({
      anchorTick,
      memberCount: members.length,
      bassMidi: resolvedBass,
      bassPitchClass: ((resolvedBass % 12) + 12) % 12,
      pitchClasses: [...present].sort((left, right) => left - right),
      windowTicks,
      tempoMicrosecondsAtAnchor: microseconds,
      segmentIndex,
      gridIndex,
      quantizedTickNumerator: quantized,
      quantizedTickDenominator: beatUnit,
      quantizationErrorNumerator: Math.abs(anchorTick * beatUnit - quantized),
      quantizationErrorDenominator: beatUnit,
      measureIndex: segment.baseMeasureIndex + Math.floor(scaled / measureNumerator),
    });
    cursor = end;
  }
  return out;
}

/**
 * The frozen reverse-resolution law, implemented independently: candidate
 * roots are exactly the pitch classes present; a template matches exactly or,
 * where its fifth is omissible, without offset 7; alternatives sort by the
 * frozen five-key total order; zero matches yield the literal Custom outcome.
 */
function referenceResolve(
  pitchClasses: readonly number[],
  bassPitchClass: number,
): unknown {
  const ranked: {
    keys: readonly number[];
    alternative: Record<string, unknown>;
  }[] = [];
  for (const root of pitchClasses) {
    const offsets = pitchClasses
      .map((pitchClass) => (pitchClass - root + 12) % 12)
      .sort((left, right) => left - right);
    const offsetText = offsets.join(",");
    for (let order = 0; order < INDEPENDENT_TEMPLATES.length; order += 1) {
      const template = INDEPENDENT_TEMPLATES[order];
      if (template === undefined) continue;
      let matchKind: "exact" | "omitted-fifth" | null = null;
      if (offsetText === [...template.offsets].sort((a, b) => a - b).join(",")) {
        matchKind = "exact";
      } else if (
        template.omissibleFifth &&
        offsetText ===
          template.offsets
            .filter((offset) => offset !== 7)
            .sort((a, b) => a - b)
            .join(",")
      ) {
        matchKind = "omitted-fifth";
      }
      if (matchKind === null) continue;
      const spelling = INDEPENDENT_SPELLINGS[root] ?? { step: "C", alter: 0 };
      ranked.push({
        keys: [
          matchKind === "exact" ? 0 : 1,
          root === bassPitchClass ? 0 : 1,
          template.offsets.length,
          order,
          root,
        ],
        alternative: {
          templateId: template.id,
          formulaRuleId: template.formulaRuleId,
          realizationId: template.realizationId,
          extensionNumber: template.extensionNumber,
          rootPitchClass: root,
          rootSpelled: { step: spelling.step, alter: spelling.alter },
          bassPitchClass,
          inversion: root === bassPitchClass ? "root" : "slash",
          matchKind,
          missingDegreeNumbers: matchKind === "omitted-fifth" ? [5] : [],
        },
      });
    }
  }
  if (ranked.length === 0) {
    const ascending = [...pitchClasses].sort((left, right) => left - right);
    const bassPosition = ascending.indexOf(bassPitchClass);
    const rotated =
      bassPosition <= 0
        ? ascending
        : [...ascending.slice(bassPosition), ...ascending.slice(0, bassPosition)];
    return {
      kind: "custom",
      bassPitchClass,
      spelledPitchClasses: rotated.map((pitchClass) => {
        const spelling = INDEPENDENT_SPELLINGS[pitchClass] ?? {
          step: "C",
          alter: 0,
        };
        return { step: spelling.step, alter: spelling.alter };
      }),
    };
  }
  ranked.sort((left, right) => {
    for (let index = 0; index < left.keys.length; index += 1) {
      const a = left.keys[index] ?? 0;
      const b = right.keys[index] ?? 0;
      if (a !== b) return a - b;
    }
    return 0;
  });
  return {
    kind: "alternatives",
    totalMatches: ranked.length,
    alternatives: ranked
      .slice(0, INDEPENDENT_LIMITS.alternatives)
      .map((entry) => entry.alternative),
  };
}

/* ------------------------------------------------------------------ *
 * Comparison helpers                                                  *
 * ------------------------------------------------------------------ */

function productionModelShape(result: MidiImportResult): unknown {
  if (!result.ok) return null;
  const model = result.value.model;
  return {
    header: { ...model.header },
    tempoMap: model.tempoMap.map((entry) => ({ ...entry })),
    meterMap: model.meterMap.map((entry) => ({ ...entry })),
    tracks: model.tracks.map((track) => ({
      index: track.index,
      name: track.name,
      instrumentName: track.instrumentName,
      markers: track.markers.map((marker) => ({ ...marker })),
      notes: track.notes.map((note) => ({ ...note })),
    })),
    ignoredEvents: model.ignoredEvents.map((entry) => ({ ...entry })),
    alienChunks: model.alienChunks.map((entry) => ({ ...entry })),
    counters: { ...model.counters },
  };
}

function referenceModelShape(model: ReferenceModel): unknown {
  return {
    header: { ...model.header },
    tempoMap: model.tempoMap.map((entry) => ({ ...entry })),
    meterMap: model.meterMap.map((entry) => ({ ...entry })),
    tracks: model.tracks.map((track) => ({
      index: track.index,
      name: track.name,
      instrumentName: track.instrumentName,
      markers: track.markers.map((marker) => ({ ...marker })),
      notes: track.notes.map((note) => ({ ...note })),
    })),
    ignoredEvents: model.ignoredEvents.map((entry) => ({ ...entry })),
    alienChunks: model.alienChunks.map((entry) => ({ ...entry })),
    counters: { ...model.counters },
  };
}

function importRequest(
  requestId: string,
  bytes: Uint8Array,
): MidiImportRequest {
  return {
    schema: MIDI_IMPORT_REQUEST_SCHEMA,
    requestId,
    readerId: MIDI_IMPORT_READER_ID,
    readerVersion: MIDI_IMPORT_READER_VERSION,
    bytes,
  };
}

/**
 * One comparison of the shipped pipeline against this gate's independent
 * reader and derivations. Returns true when everything agreed.
 */
function compareAgainstReference(
  findings: Findings,
  label: string,
  decodeSmf: (request: MidiImportRequest) => MidiImportResult,
  bytes: Uint8Array,
  requestId: string,
): Readonly<{ agreed: boolean; accepted: boolean; code: string | null }> {
  let production: MidiImportResult;
  try {
    production = decodeSmf(importRequest(requestId, bytes));
  } catch (error) {
    findings.add(
      "M0E_SEAM_THROW",
      label,
      `the import seam threw instead of refusing: ${String(error)}`,
    );
    return { agreed: false, accepted: false, code: null };
  }
  const reference = referenceDecode(bytes);

  if (production.ok !== reference.ok) {
    findings.add(
      "M0E_CLASSIFICATION",
      label,
      production.ok
        ? `production accepted a file the reference reader refuses with ${
            reference.ok ? "?" : reference.code
          }`
        : `production refused with ${production.refusal.code} a file the reference reader accepts`,
    );
    return {
      agreed: false,
      accepted: production.ok,
      code: production.ok ? null : production.refusal.code,
    };
  }

  if (!production.ok || !reference.ok) {
    if (production.ok || reference.ok) return { agreed: false, accepted: false, code: null };
    const refusal = production.refusal;
    if (
      refusal.code !== reference.code ||
      refusal.byteOffset !== reference.byteOffset ||
      refusal.trackIndex !== reference.trackIndex
    ) {
      findings.add(
        "M0E_REFUSAL_DISAGREE",
        label,
        `production ${refusal.code}@${String(refusal.byteOffset)}/t${String(
          refusal.trackIndex,
        )} vs reference ${reference.code}@${String(
          reference.byteOffset,
        )}/t${String(reference.trackIndex)}`,
      );
      return { agreed: false, accepted: false, code: refusal.code };
    }
    if (!MIDI_IMPORT_REFUSAL_CODES.includes(refusal.code)) {
      findings.add(
        "M0E_REFUSAL_VOCABULARY",
        label,
        `refusal code outside the frozen vocabulary: ${refusal.code}`,
      );
      return { agreed: false, accepted: false, code: refusal.code };
    }
    /* Widened on purpose: the declared type is the literal false, so only a
     * runtime read can prove the shipped refusal really carries no result. */
    const widened: Readonly<{ partialResult: boolean }> = refusal;
    if (widened.partialResult) {
      findings.add(
        "M0E_PARTIAL",
        label,
        "a refusal carried a partial result",
      );
      return { agreed: false, accepted: false, code: refusal.code };
    }
    return { agreed: true, accepted: false, code: refusal.code };
  }

  let agreed = true;
  if (
    canonical(productionModelShape(production)) !==
    canonical(referenceModelShape(reference.model))
  ) {
    findings.add(
      "M0E_MODEL_DISAGREE",
      label,
      "the decode model differs from the independent reference reader",
    );
    agreed = false;
  }
  const expectedSonorities = referenceSonorities(reference.model);
  if (
    canonical(production.value.sonorities.map((entry) => ({ ...entry, pitchClasses: [...entry.pitchClasses] }))) !==
    canonical(expectedSonorities.map((entry) => ({ ...entry, pitchClasses: [...entry.pitchClasses] })))
  ) {
    findings.add(
      "M0E_SONORITY_DISAGREE",
      label,
      "the sonority derivation differs from the independent law implementation",
    );
    agreed = false;
  }
  const expectedResolutions = expectedSonorities.map((entry) =>
    referenceResolve(entry.pitchClasses, entry.bassPitchClass),
  );
  if (
    canonical(production.value.resolutions) !== canonical(expectedResolutions)
  ) {
    findings.add(
      "M0E_RESOLUTION_DISAGREE",
      label,
      "the reverse-T1 outcome differs from the independent resolver",
    );
    agreed = false;
  }
  /* Replay: the same bytes must decode to the same value, byte for byte. */
  const replay = decodeSmf(importRequest(`${requestId}-replay`, bytes));
  if (!replay.ok || canonical(productionModelShape(replay)) !== canonical(productionModelShape(production))) {
    findings.add("M0E_REPLAY", label, "a replayed decode differed");
    agreed = false;
  }
  return { agreed, accepted: true, code: null };
}

/* ------------------------------------------------------------------ *
 * The independently authored corpus                                   *
 * ------------------------------------------------------------------ */

type CorpusSegment = Readonly<{
  hex?: string;
  repeatHex?: string;
  count?: number;
}>;

type CorpusHostile = Readonly<{
  id: string;
  title: string;
  bytesHex?: string;
  byteSpec?: Readonly<{ segments: readonly CorpusSegment[] }>;
  expected: Readonly<{
    code: MidiImportRefusalCode;
    byteOffset: number | null;
    trackIndex: number | null;
  }>;
}>;

type CorpusAccepted = Readonly<{
  id: string;
  title: string;
  traits: readonly string[];
  bytesHex: string;
  expectedModel: unknown;
  expectedSonorities: unknown;
  expectedResolutions: unknown;
}>;

type Corpus = Readonly<{
  schema: string;
  corpusVersion: number;
  provenance: string;
  acceptedFiles: readonly CorpusAccepted[];
  hostileFiles: readonly CorpusHostile[];
}>;

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function corpusBytes(entry: CorpusHostile): Uint8Array {
  if (entry.bytesHex !== undefined) return hexToBytes(entry.bytesHex);
  const spec = entry.byteSpec;
  if (spec === undefined) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (const segment of spec.segments) {
    if (segment.hex !== undefined) {
      const bytes = hexToBytes(segment.hex);
      chunks.push(bytes);
      total += bytes.byteLength;
      continue;
    }
    if (segment.repeatHex === undefined || segment.count === undefined) continue;
    const unit = hexToBytes(segment.repeatHex);
    const repeated = new Uint8Array(unit.byteLength * segment.count);
    for (let index = 0; index < segment.count; index += 1) {
      repeated.set(unit, index * unit.byteLength);
    }
    chunks.push(repeated);
    total += repeated.byteLength;
  }
  const assembled = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    assembled.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return assembled;
}

/* ------------------------------------------------------------------ *
 * Seeded structured fuzz                                              *
 * ------------------------------------------------------------------ */

/** Deterministic 32-bit LCG; no ambient randomness may enter evidence. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function fuzzCase(random: () => number, seedBytes: Uint8Array): Uint8Array {
  const shape = random();
  if (shape < 0.35) {
    /* Structured: a plausible envelope wrapped around random track bytes. */
    const bodyLength = 1 + Math.floor(random() * 48);
    const body = new Uint8Array(bodyLength);
    for (let index = 0; index < bodyLength; index += 1) {
      body[index] = Math.floor(random() * 256);
    }
    const declared =
      random() < 0.8 ? bodyLength : Math.floor(random() * (bodyLength + 8));
    const division = random() < 0.9 ? 1 + Math.floor(random() * 960) : 0;
    const header = new Uint8Array(14);
    header.set([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6], 0);
    header[8] = 0;
    header[9] = random() < 0.85 ? (random() < 0.5 ? 0 : 1) : 2;
    header[10] = 0;
    header[11] = header[9] === 0 ? 1 : 1 + Math.floor(random() * 3);
    header[12] = (division >> 8) & 0xff;
    header[13] = division & 0xff;
    const chunk = new Uint8Array(8 + bodyLength);
    chunk.set([0x4d, 0x54, 0x72, 0x6b], 0);
    chunk[4] = (declared >>> 24) & 0xff;
    chunk[5] = (declared >>> 16) & 0xff;
    chunk[6] = (declared >>> 8) & 0xff;
    chunk[7] = declared & 0xff;
    chunk.set(body, 8);
    const out = new Uint8Array(header.byteLength + chunk.byteLength);
    out.set(header, 0);
    out.set(chunk, header.byteLength);
    return out;
  }
  if (shape < 0.8) {
    /* Mutation: an accepted file with a few bytes rewritten or truncated. */
    const mutated = Uint8Array.from(seedBytes);
    const edits = 1 + Math.floor(random() * 4);
    for (let index = 0; index < edits; index += 1) {
      const at = Math.floor(random() * mutated.byteLength);
      mutated[at] = Math.floor(random() * 256);
    }
    if (random() < 0.3) {
      return mutated.subarray(
        0,
        Math.max(0, Math.floor(random() * mutated.byteLength)),
      );
    }
    return mutated;
  }
  /* Unstructured: raw noise of a random length. */
  const length = Math.floor(random() * 64);
  const noise = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    noise[index] = Math.floor(random() * 256);
  }
  return noise;
}

/* ------------------------------------------------------------------ *
 * Chart -> E1 export -> M0 import round trip                          *
 * ------------------------------------------------------------------ */

type RoundTripChart = Readonly<{
  id: string;
  meter: Readonly<{ beatsPerBar: number; beatUnit: number }>;
  tempoBpm: number;
  /** One entry per bar; each holds symbol text with exact quarter-note beats. */
  bars: readonly (readonly Readonly<{
    symbol: string;
    beats: Readonly<{ numerator: number; denominator: number }>;
  }>[])[];
}>;

const ROUND_TRIP_CHARTS: readonly RoundTripChart[] = Object.freeze([
  {
    id: "M0-VER-RT-001",
    meter: { beatsPerBar: 4, beatUnit: 4 },
    tempoBpm: 120,
    bars: [
      [
        { symbol: "Cmaj7", beats: { numerator: 2, denominator: 1 } },
        { symbol: "Am7", beats: { numerator: 2, denominator: 1 } },
      ],
      [
        { symbol: "Dm7", beats: { numerator: 2, denominator: 1 } },
        { symbol: "G7", beats: { numerator: 2, denominator: 1 } },
      ],
      [{ symbol: "Cmaj7", beats: { numerator: 4, denominator: 1 } }],
    ],
  },
  {
    id: "M0-VER-RT-002",
    meter: { beatsPerBar: 3, beatUnit: 4 },
    tempoBpm: 84,
    bars: [
      [{ symbol: "Fmaj7", beats: { numerator: 3, denominator: 1 } }],
      [
        { symbol: "Bb7", beats: { numerator: 1, denominator: 1 } },
        { symbol: "Ebmaj7", beats: { numerator: 2, denominator: 1 } },
      ],
    ],
  },
  {
    id: "M0-VER-RT-003",
    meter: { beatsPerBar: 6, beatUnit: 8 },
    tempoBpm: 200,
    bars: [
      [
        { symbol: "Em7", beats: { numerator: 3, denominator: 2 } },
        { symbol: "A7", beats: { numerator: 3, denominator: 2 } },
      ],
      [{ symbol: "Dmaj7", beats: { numerator: 3, denominator: 1 } }],
    ],
  },
] as const);

const AUTO_VOICING = Object.freeze({
  mode: "auto",
  family: "balanced",
  voiceCount: 4,
  range: Object.freeze({ lowMidi: 48, highMidi: 84 }),
  bassPolicy: "generated",
});

function roundTripCandidate(chart: RoundTripChart): unknown {
  let ordinal = 0;
  const measures: unknown[] = [];
  for (let barIndex = 0; barIndex < chart.bars.length; barIndex += 1) {
    const bar = chart.bars[barIndex] ?? [];
    const events: unknown[] = [];
    for (const entry of bar) {
      /* The real T0 parser owns the symbol; this gate never hand-builds one. */
      const parsed = parseChordSymbol(entry.symbol, "ascii");
      if (!parsed.ok) return null;
      ordinal += 1;
      events.push({
        id: `event-${String(ordinal).padStart(4, "0")}`,
        duration: { ...entry.beats },
        annotation: "",
        chord: parsed.chord,
        voicing: AUTO_VOICING,
      });
    }
    measures.push({
      id: `measure-${String(barIndex + 1).padStart(4, "0")}`,
      events,
      completion: { kind: "complete" },
    });
  }
  return {
    schema: PROGRESSION_DOCUMENT_SCHEMA,
    id: `doc-${chart.id.toLowerCase()}`,
    title: chart.id,
    description: "",
    meter: { ...chart.meter },
    tempoBpm: chart.tempoBpm,
    key: null,
    sections: [
      {
        id: "section-0001",
        name: "A",
        annotation: "",
        keyOverride: null,
        voiceLeadingBoundary: "reset",
        measures,
      },
    ],
    playback: {
      instrumentId: "mellow-keys",
      masterVolume: 0.8,
      reverbAmount: 0.25,
      countInBars: 0,
    },
  };
}

/**
 * Publishes an authored chart through the REAL F2 structural decoder and the
 * REAL F3 semantic gate. A candidate either becomes a validated document the
 * way a reopened file does, or it is refused — nothing here casts the brand.
 */
function publishRoundTripDocument(
  chart: RoundTripChart,
): ValidatedDocument | null {
  const candidate = roundTripCandidate(chart);
  if (candidate === null) return null;
  const decoded = decodeDocumentShape(candidate);
  if (!decoded.ok) return null;
  const published = validateDocumentSemantics(decoded.value);
  if (!published.ok) return null;
  return published.value;
}

type RoundTripObservation = Readonly<{
  chartId: string;
  meter: string;
  tempoBpm: number;
  chordCount: number;
  sonorityCount: number;
  exactQuantization: boolean;
  measureIndicesMatch: boolean;
  pitchClassSetsMatch: boolean;
  meterRecovered: boolean;
  tempoRecovered: boolean;
  topSymbolRecovery: number;
  importedChartText: string | null;
  usesExplicitDurations: boolean;
  /** Preview against a destination chart in the imported file's own meter. */
  sameMeterPreviewStatus: string | null;
  /**
   * Preview against a 4/4 destination. Null when the derived chart needed no
   * explicit durations; otherwise the documented honest refusal, because a bar
   * measured in the imported file's meter is never silently rebalanced.
   */
  crossMeterPreviewStatus: string | null;
  crossMeterIssueCodes: readonly string[];
  bytesSha256: string;
}>;

/** Hosts the real studio controller over an already-published document. */
function controllerOver(document: ValidatedDocument): StudioController | null {
  const zeroBeat = makeBeatPosition({ numerator: 0, denominator: 1 });
  if (!zeroBeat.ok) return null;
  const initialized = createInitialAppState({
    document,
    zeroBeat: zeroBeat.value,
    initialPanels: STUDIO_INITIAL_PANELS,
  });
  if (!initialized.ok) return null;
  let ticks = 0;
  return createStudioControllerOverState(
    initialized.state,
    createStudioApplicationDependencies(),
    {
      nowMs: () => {
        ticks += 2_000;
        return ticks;
      },
    },
  );
}

/* ------------------------------------------------------------------ *
 * Applicability table                                                 *
 * ------------------------------------------------------------------ */

const M0_APPLICABILITY = Object.freeze([
  {
    id: "browser-wasm-boundary",
    applicability: "covered:three-engine-file-input-run",
    owner: "M0",
    proof:
      "tests/e2e/m0-midi-import-evidence.spec.ts drives the real artifact's file input with real bytes on Chromium, Firefox, and WebKit; preview, commit-as-one-undo, and refusal display are asserted with zero console or page errors.",
  },
  {
    id: "wasm-decoder-identity",
    applicability: "covered:real-embedded-module-only",
    owner: "M0",
    proof:
      "Every in-process decode here goes through loadSmfWasmDecoder(), which instantiates the base64 payload src/audio/wasm/concert-grand-wasm.ts carries into the release artifact. No mock decoder exists in this gate.",
  },
  {
    id: "audio-graph",
    applicability: "not-applicable:import-never-touches-the-audio-graph",
    owner: "X0/X1",
    proof:
      "src/audio/smf-wasm.ts hosts a second wasm instance for bytes only and constructs no Web Audio node; the export-layer pipeline receives the decoder by injection and never imports audio.",
  },
  {
    id: "network",
    applicability: "forbidden:offline-contract",
    owner: "F0",
    proof:
      "The import surface reads a local File only. The standalone offline gates (F0-NETWORK-01/02) already deny every nonlocal request in three engines; this gate adds no network capability to assert.",
  },
  {
    id: "custom-chord-syntax",
    applicability: "blocked:owner-arbitration-jcpe-1zfb",
    owner: "owner",
    proof:
      "The T0 chart grammar has no custom-chord syntax, so an unnameable sonority is stated literally and writes no chord. This gate proves the SHIPPED behaviour; the mandate question is jcpe-1zfb and is not resolved here.",
  },
  {
    id: "wall-time-cutoff",
    applicability: "forbidden:tick-derived-window-only",
    owner: "M0",
    proof:
      "The simultaneity window is floor(40000 * ppq / microsecondsPerQuarter) — an exact tick bound from the file's own tempo. The independent derivation recomputes it for every sonority in this gate and would disagree if a clock ever entered.",
  },
  {
    id: "mutation-controls",
    applicability: "covered:single-byte-and-truncation-sweeps",
    owner: "M0",
    proof:
      "Every single-byte replacement of every accepted corpus file, every truncated prefix, and the seeded fuzz budget all pass through the real wasm seam; each must refuse with a frozen code and agree with the reference reader.",
  },
] as const);

/* ------------------------------------------------------------------ *
 * Entry                                                               *
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const findings = new Findings();
  const before = await snapshotClosure();
  const skipBrowser = process.env["M0_EVIDENCE_SKIP_BROWSER"] === "1";

  checkFrozenLawReciprocity(findings);

  /* ---- child gates ---- */
  const validator = await runChild([
    process.execPath,
    "scripts/validate-m0-contract.ts",
  ]);
  if (validator.exitCode !== 0) {
    findings.add(
      "M0E_VALIDATOR",
      "validate-m0-contract",
      `the frozen spec validator failed with exit ${String(validator.exitCode)}`,
    );
  }

  const suite = await runChild([process.execPath, "test", ...TEST_FILES]);
  const summary = suite.stdoutTail;
  const passMatch = /(\d+) pass/u.exec(summary);
  const failMatch = /(\d+) fail/u.exec(summary);
  const skipMatch = /(\d+) skip/u.exec(summary);
  const passes = passMatch === null ? 0 : Number(passMatch[1]);
  const failures = failMatch === null ? -1 : Number(failMatch[1]);
  const skips = skipMatch === null ? 0 : Number(skipMatch[1]);
  if (
    suite.exitCode !== 0 ||
    failures !== 0 ||
    skips !== 0 ||
    passes < MINIMUM_SUITE_PASSES
  ) {
    findings.add(
      "M0E_SUITE",
      "bun test",
      `M0 suite not clean: exit ${String(suite.exitCode)}, pass ${String(
        passes,
      )}, fail ${String(failures)}, skip ${String(skips)}`,
    );
  }

  /* ---- the real embedded wasm decoder ---- */
  let decodeFrame: SmfDecodeFrame;
  try {
    decodeFrame = await loadSmfWasmDecoder();
  } catch (error) {
    findings.add(
      "M0E_WASM",
      "loadSmfWasmDecoder",
      `the embedded decoder failed to instantiate: ${String(error)}`,
    );
    throw error;
  }
  const operations = createMidiImportOperations(decodeFrame);
  const decodeSmf = operations.decodeSmf;

  /* ---- the independently authored corpus ---- */
  const corpusRaw = await readFile(resolve(ROOT, CORPUS_PATH), "utf8");
  /* One documented cast at the load boundary; the JSON is the authority. */
  const corpus = JSON.parse(corpusRaw) as Corpus;

  const acceptedResults: {
    id: string;
    traits: readonly string[];
    byteLength: number;
    agreedWithReference: boolean;
    matchedAuthoredExpectation: boolean;
    sonorityCount: number;
  }[] = [];

  for (const entry of corpus.acceptedFiles) {
    const bytes = hexToBytes(entry.bytesHex);
    const comparison = compareAgainstReference(
      findings,
      `authored:${entry.id}`,
      decodeSmf,
      bytes,
      entry.id,
    );
    const result = decodeSmf(importRequest(entry.id, bytes));
    let matchedAuthored = false;
    if (!result.ok) {
      findings.add(
        "M0E_AUTHORED_REFUSED",
        `authored:${entry.id}`,
        `an accepted corpus file refused with ${result.refusal.code}`,
      );
    } else {
      const modelMatches =
        canonical(productionModelShape(result)) ===
        canonical(entry.expectedModel);
      const sonorityMatches =
        canonical(
          result.value.sonorities.map((row) => ({
            ...row,
            pitchClasses: [...row.pitchClasses],
          })),
        ) === canonical(entry.expectedSonorities);
      const resolutionMatches =
        canonical(result.value.resolutions) ===
        canonical(entry.expectedResolutions);
      matchedAuthored = modelMatches && sonorityMatches && resolutionMatches;
      if (!modelMatches) {
        findings.add(
          "M0E_AUTHORED_MODEL",
          `authored:${entry.id}`,
          "the decode model differs from the independently authored expectation",
        );
      }
      if (!sonorityMatches) {
        findings.add(
          "M0E_AUTHORED_SONORITIES",
          `authored:${entry.id}`,
          "the sonorities differ from the independently authored expectation",
        );
      }
      if (!resolutionMatches) {
        findings.add(
          "M0E_AUTHORED_RESOLUTIONS",
          `authored:${entry.id}`,
          "the resolutions differ from the independently authored expectation",
        );
      }
    }
    acceptedResults.push({
      id: entry.id,
      traits: entry.traits,
      byteLength: bytes.byteLength,
      agreedWithReference: comparison.agreed,
      matchedAuthoredExpectation: matchedAuthored,
      sonorityCount: result.ok ? result.value.sonorities.length : 0,
    });
  }

  /* ---- hostile total-refusal sweep ---- */
  const hostileResults: {
    id: string;
    code: string;
    byteOffset: number | null;
    trackIndex: number | null;
    byteLength: number;
    matchedAuthoredExpectation: boolean;
    agreedWithReference: boolean;
  }[] = [];
  const codesSeen = new Set<string>();

  for (const entry of corpus.hostileFiles) {
    const bytes = corpusBytes(entry);
    let request = importRequest(entry.id, bytes);
    if (entry.expected.code === "import.schema_invalid") {
      request = {
        ...request,
        schema: "changes.import.midi-import-request.v2",
      } as unknown as MidiImportRequest;
    }
    if (entry.expected.code === "import.request_id_invalid") {
      request = { ...request, requestId: "not a valid id!" };
    }
    let result: MidiImportResult;
    try {
      result = decodeSmf(request);
    } catch (error) {
      findings.add(
        "M0E_SEAM_THROW",
        `authored:${entry.id}`,
        `a hostile file threw instead of refusing: ${String(error)}`,
      );
      continue;
    }
    if (result.ok) {
      findings.add(
        "M0E_HOSTILE_ACCEPTED",
        `authored:${entry.id}`,
        `expected ${entry.expected.code} but the file decoded`,
      );
      continue;
    }
    const refusal = result.refusal;
    const matched =
      refusal.code === entry.expected.code &&
      refusal.byteOffset === entry.expected.byteOffset &&
      refusal.trackIndex === entry.expected.trackIndex;
    if (!matched) {
      findings.add(
        "M0E_HOSTILE_MISMATCH",
        `authored:${entry.id}`,
        `expected ${entry.expected.code}@${String(
          entry.expected.byteOffset,
        )}/t${String(entry.expected.trackIndex)}, observed ${
          refusal.code
        }@${String(refusal.byteOffset)}/t${String(refusal.trackIndex)}`,
      );
    }
    const widenedRefusal: Readonly<{ partialResult: boolean }> = refusal;
    if (widenedRefusal.partialResult) {
      findings.add(
        "M0E_PARTIAL",
        `authored:${entry.id}`,
        "a refusal carried a partial result",
      );
    }
    codesSeen.add(refusal.code);
    /* The byte-phase files are also compared with the reference reader. */
    let agreed = true;
    if (
      entry.expected.code !== "import.schema_invalid" &&
      entry.expected.code !== "import.request_id_invalid" &&
      entry.expected.code !== "limit.midi_import_bytes_exceeded"
    ) {
      const reference = referenceDecode(bytes);
      agreed =
        !reference.ok &&
        reference.code === refusal.code &&
        reference.byteOffset === refusal.byteOffset &&
        reference.trackIndex === refusal.trackIndex;
      if (!agreed) {
        findings.add(
          "M0E_REFUSAL_DISAGREE",
          `authored:${entry.id}`,
          `the reference reader disagreed: ${
            reference.ok
              ? "it accepted the file"
              : `${reference.code}@${String(reference.byteOffset)}/t${String(
                  reference.trackIndex,
                )}`
          }`,
        );
      }
    }
    hostileResults.push({
      id: entry.id,
      code: refusal.code,
      byteOffset: refusal.byteOffset,
      trackIndex: refusal.trackIndex,
      byteLength: bytes.byteLength,
      matchedAuthoredExpectation: matched,
      agreedWithReference: agreed,
    });
  }

  const missingCodes = MIDI_IMPORT_REFUSAL_CODES.filter(
    (code) => !codesSeen.has(code),
  );
  if (missingCodes.length > 0) {
    findings.add(
      "M0E_REFUSAL_COVERAGE",
      "authored-corpus",
      `refusal codes never observed through the real decoder: ${missingCodes.join(", ")}`,
    );
  }

  /* ---- the spec packet's own corpora, through the reference reader ---- */
  const specGoldenRaw = await readFile(
    resolve(ROOT, "tests/fixtures/midi-import/golden-cases.json"),
    "utf8",
  );
  const specGolden = JSON.parse(specGoldenRaw) as Readonly<{
    cases: readonly Readonly<{ id: string; bytesHex: string }>[];
  }>;
  let specGoldenAgreements = 0;
  for (const entry of specGolden.cases) {
    const comparison = compareAgainstReference(
      findings,
      `spec-golden:${entry.id}`,
      decodeSmf,
      hexToBytes(entry.bytesHex),
      entry.id.toLowerCase(),
    );
    if (comparison.agreed) specGoldenAgreements += 1;
  }

  const e1GoldenRaw = await readFile(
    resolve(ROOT, "tests/fixtures/midi-export/golden-cases.json"),
    "utf8",
  );
  const e1Golden = JSON.parse(e1GoldenRaw) as Readonly<{
    cases: readonly Readonly<{ id: string; bytesHex: string }>[];
  }>;
  const e1Results: {
    id: string;
    byteLength: number;
    accepted: boolean;
    agreedWithReference: boolean;
    sonorityCount: number;
    markerTexts: readonly string[];
  }[] = [];
  for (const entry of e1Golden.cases) {
    const bytes = hexToBytes(entry.bytesHex);
    const comparison = compareAgainstReference(
      findings,
      `e1-golden:${entry.id}`,
      decodeSmf,
      bytes,
      entry.id.toLowerCase(),
    );
    const result = decodeSmf(importRequest(`${entry.id.toLowerCase()}-read`, bytes));
    if (!result.ok) {
      findings.add(
        "M0E_E1_GOLDEN",
        `e1-golden:${entry.id}`,
        `an accepted E1 byte golden refused on import with ${result.refusal.code}`,
      );
    }
    e1Results.push({
      id: entry.id,
      byteLength: bytes.byteLength,
      accepted: result.ok,
      agreedWithReference: comparison.agreed,
      sonorityCount: result.ok ? result.value.sonorities.length : 0,
      markerTexts: result.ok
        ? result.value.model.tracks.flatMap((track) =>
            track.markers.map((marker) => marker.text),
          )
        : [],
    });
  }

  /* ---- mutation and truncation sweeps over the authored corpus ---- */
  let mutationDecodes = 0;
  let truncationDecodes = 0;
  for (const entry of corpus.acceptedFiles) {
    const bytes = hexToBytes(entry.bytesHex);
    for (let index = 0; index < bytes.byteLength; index += 1) {
      for (const replacement of [0x00, 0x7f, 0x80, 0xff]) {
        const mutated = Uint8Array.from(bytes);
        mutated[index] = replacement;
        mutationDecodes += 1;
        compareAgainstReference(
          findings,
          `mutation:${entry.id}:${String(index)}:${String(replacement)}`,
          decodeSmf,
          mutated,
          "m0-mutation",
        );
      }
    }
    for (let length = 0; length <= bytes.byteLength; length += 1) {
      truncationDecodes += 1;
      compareAgainstReference(
        findings,
        `truncation:${entry.id}:${String(length)}`,
        decodeSmf,
        bytes.subarray(0, length),
        "m0-truncation",
      );
    }
  }

  /* ---- seeded structured fuzz ---- */
  const seedFile = corpus.acceptedFiles[0];
  const seedBytes = hexToBytes(seedFile?.bytesHex ?? "");
  const fuzzResults: {
    seed: number;
    cases: number;
    accepted: number;
    refused: number;
    disagreements: number;
    throws: number;
  }[] = [];
  for (const seed of FUZZ_SEEDS) {
    const random = makeRandom(seed);
    let accepted = 0;
    let refused = 0;
    let disagreements = 0;
    let throws = 0;
    const seedFindingsBefore = findings.list.length;
    for (let index = 0; index < FUZZ_CASES_PER_SEED; index += 1) {
      const bytes = fuzzCase(random, seedBytes);
      const comparison = compareAgainstReference(
        findings,
        `fuzz:${String(seed >>> 0)}:${String(index)}`,
        decodeSmf,
        bytes,
        "m0-fuzz",
      );
      if (comparison.accepted) accepted += 1;
      else refused += 1;
      if (!comparison.agreed) disagreements += 1;
    }
    for (
      let index = seedFindingsBefore;
      index < findings.list.length;
      index += 1
    ) {
      if (findings.list[index]?.code === "M0E_SEAM_THROW") throws += 1;
    }
    fuzzResults.push({
      seed: seed >>> 0,
      cases: FUZZ_CASES_PER_SEED,
      accepted,
      refused,
      disagreements,
      throws,
    });
  }

  /* ---- exhaustive reverse-resolution oracle ---- */
  let resolutionComparisons = 0;
  let resolutionDisagreements = 0;
  for (let mask = 1; mask < 4096; mask += 1) {
    const pitchClasses: number[] = [];
    for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
      if ((mask & (1 << pitchClass)) !== 0) pitchClasses.push(pitchClass);
    }
    for (const bass of pitchClasses) {
      resolutionComparisons += 1;
      /* The contract narrows pitch classes to a literal union; the sweep
       * enumerates that exact union, so the cast states a proved fact. */
      const observed = resolveSonority(
        pitchClasses as unknown as Parameters<typeof resolveSonority>[0],
        bass as unknown as Parameters<typeof resolveSonority>[1],
      );
      if (canonical(observed) !== canonical(referenceResolve(pitchClasses, bass))) {
        resolutionDisagreements += 1;
        if (resolutionDisagreements <= 8) {
          findings.add(
            "M0E_RESOLUTION_ORACLE",
            `pcs:${pitchClasses.join("-")}/bass:${String(bass)}`,
            "the shipped resolver and the independent oracle disagree",
          );
        }
      }
    }
  }

  /* ---- spec sonority corpus through the independent derivation ---- */
  const sonorityRaw = await readFile(
    resolve(ROOT, "tests/fixtures/midi-import/sonority-cases.json"),
    "utf8",
  );
  const sonorityFixture = JSON.parse(sonorityRaw) as Readonly<{
    cases: readonly Readonly<{
      id: string;
      input: Readonly<{
        ppq: number;
        tempoMap: readonly Readonly<{
          tick: number;
          microsecondsPerQuarter: number;
        }>[];
        meterMap: readonly Readonly<{
          tick: number;
          numerator: number;
          denominatorPower: number;
        }>[];
        notes: readonly Readonly<{
          trackIndex: number;
          channel: number;
          key: number;
          onTick: number;
          offTick: number;
        }>[];
      }>;
    }>[];
  }>;
  let sonorityCaseAgreements = 0;
  for (const entry of sonorityFixture.cases) {
    const byTrack = new Map<number, ReferenceNote[]>();
    for (const note of entry.input.notes) {
      const list = byTrack.get(note.trackIndex) ?? [];
      list.push({
        channel: note.channel,
        key: note.key,
        onTick: note.onTick,
        offTick: note.offTick,
        onVelocity: 64,
      });
      byTrack.set(note.trackIndex, list);
    }
    const tracks = [...byTrack.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([index, notes]) => ({
        index,
        name: null,
        instrumentName: null,
        markers: [],
        notes: [...notes].sort(
          (left, right) =>
            left.onTick - right.onTick ||
            left.channel - right.channel ||
            left.key - right.key,
        ),
      }));
    const model: ReferenceModel = {
      header: { format: 1, trackCount: tracks.length, division: entry.input.ppq },
      tempoMap: entry.input.tempoMap,
      meterMap: entry.input.meterMap,
      tracks,
      ignoredEvents: [],
      alienChunks: [],
      counters: {
        bytesRead: 0,
        chunksSeen: 0,
        eventsDecoded: 0,
        eventsIgnored: 0,
        notesPaired: entry.input.notes.length,
        peakOpenNotes: 0,
        tempoChanges: entry.input.tempoMap.length,
        meterChanges: entry.input.meterMap.length,
      },
    };
    /* The production law runs over the identical materialized model. */
    const production = groupSonorities(
      model as unknown as Parameters<typeof groupSonorities>[0],
    );
    const expected = referenceSonorities(model);
    if (
      canonical(
        production.map((row) => ({ ...row, pitchClasses: [...row.pitchClasses] })),
      ) ===
      canonical(expected.map((row) => ({ ...row, pitchClasses: [...row.pitchClasses] })))
    ) {
      sonorityCaseAgreements += 1;
    } else {
      findings.add(
        "M0E_SONORITY_ORACLE",
        `sonority-case:${entry.id}`,
        "the shipped sonority law and the independent derivation disagree",
      );
    }
  }

  /* ---- chart -> E1 export -> M0 import round trips ---- */
  const roundTripObservations: RoundTripObservation[] = [];
  for (const chart of ROUND_TRIP_CHARTS) {
    const observation = runRoundTrip(findings, decodeSmf, chart);
    if (observation !== null) roundTripObservations.push(observation);
  }

  /* ---- real-browser wasm boundary ---- */
  let browser: Readonly<{
    status: string;
    exitCode: number | null;
    elapsedMs: number;
    projects: readonly Readonly<{
      project: string;
      expected: number;
      unexpected: number;
      skipped: number;
      flaky: number;
    }>[];
    resultPath: string;
  }>;
  if (skipBrowser) {
    findings.add(
      "M0E_BROWSER_SKIPPED",
      BROWSER_SPEC,
      "M0_EVIDENCE_SKIP_BROWSER=1 suppressed the named three-engine gate; the evidence is incomplete",
    );
    browser = {
      status: "skipped",
      exitCode: null,
      elapsedMs: 0,
      projects: [],
      resultPath: BROWSER_RESULT_RELATIVE,
    };
  } else {
    await mkdir(LEDGER_DIR, { recursive: true });
    /*
     * `--reporter=json` replaces the repository config's reporter list, so the
     * shared `test-results/playwright-results.json` a full-matrix run owns is
     * never clobbered by this scoped run; the env var then names this gate's
     * own report file.
     */
    const run = await runChild(
      [
        process.execPath,
        "scripts/run-playwright.ts",
        "test",
        BROWSER_SPEC,
        "--reporter=json",
      ],
      { PLAYWRIGHT_JSON_OUTPUT_NAME: BROWSER_RESULT_PATH },
    );
    const projects = await readBrowserProjects(findings, run.exitCode);
    browser = {
      status: run.exitCode === 0 ? "pass" : "fail",
      exitCode: run.exitCode,
      elapsedMs: Math.round(run.elapsedMs),
      projects,
      resultPath: BROWSER_RESULT_RELATIVE,
    };
    if (run.exitCode !== 0) {
      findings.add(
        "M0E_BROWSER",
        BROWSER_SPEC,
        `the three-engine boundary run failed: ${run.stdoutTail}`,
      );
    }
  }

  /* ---- drift ---- */
  const after = await snapshotClosure();
  if (after.digest !== before.digest) {
    const changed = after.components.filter(
      (component, index) => before.components[index]?.sha256 !== component.sha256,
    );
    findings.add(
      "M0E_INPUT_DRIFT",
      "input-closure",
      `inputs changed during the run: ${changed.map((entry) => entry.path).join(", ")}`,
    );
  }

  const outcome = findings.list.length === 0 ? "pass" : "fail";
  const ledger = {
    schema: LEDGER_SCHEMA,
    package: "M0",
    bead: "jcpe-v3c2.3",
    outcome,
    generatedAt: new Date().toISOString(),
    registration: {
      registered: false,
      intendedSlot:
        "scripts/verify.ts, immediately after the m0-midi-import-contract step and before the aggregate bun test step",
      decisionOwner: "orchestrator",
    },
    environment: {
      bunVersion: Bun.version,
      platform: platform(),
      osRelease: release(),
      cpuCount: cpus().length,
    },
    independence: {
      referenceReader:
        "written fresh in scripts/verify-m0-evidence.ts from src/export/midi-import-contract.ts and SMF 1.0; shares no code with src/export/midi-import.ts, dsp/concert-grand/src/smf.rs, or scripts/validate-m0-contract.ts",
      lawOracles:
        "the window, grid, measure-map, and reverse-T1 ranking laws are implemented a second time in this file; the template table, spelling table, and exact-integer bounds are restated here and compared with the contract",
      corpus: corpus.provenance,
      decoderUnderTest:
        "the real embedded wasm module through loadSmfWasmDecoder(); no mock decoder exists in this gate",
    },
    inputClosure: before,
    inputClosureAfter: { digest: after.digest },
    gates: {
      specValidator: {
        exitCode: validator.exitCode,
        elapsedMs: Math.round(validator.elapsedMs),
        stdoutSha256: validator.stdoutSha256,
      },
      testSuite: {
        exitCode: suite.exitCode,
        elapsedMs: Math.round(suite.elapsedMs),
        files: TEST_FILES.length,
        passes,
        failures,
        skips,
        stdoutSha256: suite.stdoutSha256,
        stderrSha256: suite.stderrSha256,
      },
      browserMatrix: browser,
    },
    authoredCorpus: {
      path: CORPUS_PATH,
      corpusVersion: corpus.corpusVersion,
      acceptedFiles: acceptedResults,
      hostileFiles: hostileResults,
      refusalCodesObserved: [...codesSeen].sort(),
      refusalCodesMissing: missingCodes,
      refusalCodeCount: codesSeen.size,
    },
    conformance: {
      relations: [
        "reference-model-equality",
        "reference-sonority-equality",
        "reference-resolution-equality",
        "byte-identical-replay",
        "authored-expectation-equality",
        "refusal-code-offset-track-equality",
        "total-decode-no-throw",
      ],
      specGoldenCases: specGolden.cases.length,
      specGoldenAgreements,
      specSonorityCases: sonorityFixture.cases.length,
      specSonorityAgreements: sonorityCaseAgreements,
      e1ByteGoldens: e1Results,
    },
    mutationControls: {
      singleByteReplacementCases: mutationDecodes,
      truncatedPrefixCases: truncationDecodes,
      productionDecodesPerCase: 2,
      law: "every mutation and every prefix must refuse with a frozen code or decode, must agree with the independent reference reader on code, offset, and track, and must replay byte for byte; a throw is a finding",
    },
    fuzz: {
      generator: "lcg-1664525-1013904223-v1",
      seeds: FUZZ_SEEDS.map((seed) => seed >>> 0),
      casesPerSeed: FUZZ_CASES_PER_SEED,
      totalCases: FUZZ_SEEDS.length * FUZZ_CASES_PER_SEED,
      results: fuzzResults,
    },
    resolutionOracle: {
      subsets: 4095,
      comparisons: resolutionComparisons,
      disagreements: resolutionDisagreements,
      law: "every non-empty pitch-class subset against every member bass",
    },
    roundTrip: {
      law: "chart -> real P0 compile -> real E1 writer -> real wasm M0 decode; onsets land on the quarter-beat grid with zero quantization error, the meter and tempo return, and each chord's pitch-class set returns intact",
      charts: roundTripObservations,
    },
    applicability: M0_APPLICABILITY,
    findings: findings.list,
  };

  await mkdir(LEDGER_DIR, { recursive: true });
  const body = `${JSON.stringify(ledger, null, 2)}\n`;
  const temporary = `${LEDGER_PATH}.tmp-${String(process.pid)}`;
  await writeFile(temporary, body, "utf8");
  await rename(temporary, LEDGER_PATH);
  process.stdout.write(
    `${JSON.stringify(
      {
        schema: LEDGER_SCHEMA,
        outcome,
        suite: { passes, failures, skips },
        refusalCodes: codesSeen.size,
        mutationCases: mutationDecodes,
        truncationCases: truncationDecodes,
        fuzzCases: FUZZ_SEEDS.length * FUZZ_CASES_PER_SEED,
        resolutionComparisons,
        roundTripCharts: roundTripObservations.length,
        browser: browser.status,
        ledgerPath: "test-results/m0-evidence/m0-evidence-ledger.json",
        ledgerSha256: sha256Text(body),
        findings: findings.list,
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = outcome === "pass" ? 0 : 1;
}

async function readBrowserProjects(
  findings: Findings,
  exitCode: number,
): Promise<
  readonly Readonly<{
    project: string;
    expected: number;
    unexpected: number;
    skipped: number;
    flaky: number;
  }>[]
> {
  let raw: string;
  try {
    raw = await readFile(BROWSER_RESULT_PATH, "utf8");
  } catch {
    findings.add(
      "M0E_BROWSER_REPORT",
      BROWSER_RESULT_RELATIVE,
      `the Playwright JSON report is missing after an exit ${String(exitCode)} run`,
    );
    return [];
  }
  const report = JSON.parse(raw) as Readonly<{
    suites?: readonly unknown[];
    stats?: Readonly<{ expected?: number; unexpected?: number }>;
  }>;
  const perProject = new Map<
    string,
    { expected: number; unexpected: number; skipped: number; flaky: number }
  >();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (typeof node !== "object" || node === null) return;
    const record = node as Record<string, unknown>;
    const specs = record["specs"];
    if (Array.isArray(specs)) {
      for (const spec of specs) {
        if (typeof spec !== "object" || spec === null) continue;
        const tests = (spec as Record<string, unknown>)["tests"];
        if (!Array.isArray(tests)) continue;
        for (const test of tests) {
          if (typeof test !== "object" || test === null) continue;
          const entry = test as Record<string, unknown>;
          const project =
            typeof entry["projectName"] === "string"
              ? entry["projectName"]
              : "unknown";
          const status =
            typeof entry["status"] === "string" ? entry["status"] : "unknown";
          const counts = perProject.get(project) ?? {
            expected: 0,
            unexpected: 0,
            skipped: 0,
            flaky: 0,
          };
          if (status === "expected") counts.expected += 1;
          else if (status === "skipped") counts.skipped += 1;
          else if (status === "flaky") counts.flaky += 1;
          else counts.unexpected += 1;
          perProject.set(project, counts);
        }
      }
    }
    for (const value of Object.values(record)) walk(value);
  };
  walk(report["suites"] ?? []);

  const projects = [...perProject.entries()]
    .map(([project, counts]) => ({ project, ...counts }))
    .sort((left, right) => (left.project < right.project ? -1 : 1));
  for (const engine of ["chromium", "firefox", "webkit"]) {
    const row = projects.find((entry) => entry.project === engine);
    if (row === undefined || row.expected === 0) {
      findings.add(
        "M0E_BROWSER_ENGINE",
        engine,
        "the named engine reported no passing boundary test",
      );
      continue;
    }
    if (row.unexpected !== 0 || row.skipped !== 0 || row.flaky !== 0) {
      findings.add(
        "M0E_BROWSER_ENGINE",
        engine,
        `unexpected ${String(row.unexpected)}, skipped ${String(
          row.skipped,
        )}, flaky ${String(row.flaky)}`,
      );
    }
  }
  return projects;
}

function runRoundTrip(
  findings: Findings,
  decodeSmf: (request: MidiImportRequest) => MidiImportResult,
  chart: RoundTripChart,
): RoundTripObservation | null {
  const label = `round-trip:${chart.id}`;
  const documentResult = publishRoundTripDocument(chart);
  if (documentResult === null) {
    findings.add(
      "M0E_ROUND_TRIP",
      label,
      "the authored chart was refused by the real document boundary",
    );
    return null;
  }
  /* The destination chart carries the imported file's own meter. */
  const controller = controllerOver(documentResult);
  if (controller === null) {
    findings.add("M0E_ROUND_TRIP", label, "the studio controller refused to start");
    return null;
  }
  const compiled = compileStudioPlaybackPlan(documentResult);
  if (!compiled.ok) {
    findings.add(
      "M0E_ROUND_TRIP",
      label,
      `the real playback compile refused: ${compiled.refusal.code}`,
    );
    return null;
  }
  const plan = compiled.plan;
  const exported = exportMidi({
    schema: MIDI_EXPORT_REQUEST_SCHEMA,
    requestId: `m0-evidence-${chart.id.toLowerCase()}`,
    writerId: MIDI_EXPORT_WRITER_ID,
    writerVersion: MIDI_EXPORT_WRITER_VERSION,
    documentId: plan.sourceDocumentId,
    sourceRevision: 1,
    title: chart.id,
    voicingTrackName: "Voicings",
    instrumentName: "Piano",
    markers: plan.events.map((event, index) => ({
      schema: MIDI_EXPORT_MARKER_SCHEMA,
      kind: "chord" as const,
      eventId: event.eventId,
      text: `E${String(index)}`,
    })),
    plan,
  });
  if (!exported.ok) {
    findings.add(
      "M0E_ROUND_TRIP",
      label,
      `the real E1 writer refused: ${exported.refusal.code}`,
    );
    return null;
  }

  const bytes = Uint8Array.from(exported.value.bytes);
  const comparison = compareAgainstReference(
    findings,
    label,
    decodeSmf,
    bytes,
    `rt-${chart.id.toLowerCase()}`,
  );
  const imported = decodeSmf(importRequest(`rt-${chart.id.toLowerCase()}-read`, bytes));
  if (!imported.ok) {
    findings.add(
      "M0E_ROUND_TRIP",
      label,
      `the exported bytes refused on import with ${imported.refusal.code}`,
    );
    return null;
  }
  if (!comparison.agreed) return null;

  const value = imported.value;
  const sonorities = value.sonorities;
  const events = plan.events;
  if (sonorities.length !== events.length) {
    findings.add(
      "M0E_ROUND_TRIP",
      label,
      `sonority count ${String(sonorities.length)} differs from the plan's ${String(
        events.length,
      )} chord events`,
    );
  }

  let exactQuantization = true;
  let measureIndicesMatch = true;
  let pitchClassSetsMatch = true;
  let topSymbolRecovery = 0;
  let barIndex = 0;
  let inBar = 0;
  const barSizes = chart.bars.map((bar) => bar.length);
  for (let index = 0; index < sonorities.length; index += 1) {
    const sonority = sonorities[index];
    const event = events[index];
    if (sonority === undefined || event === undefined) continue;
    if (sonority.quantizationErrorNumerator !== 0) exactQuantization = false;
    if (sonority.anchorTick !== Number(event.startTick)) {
      findings.add(
        "M0E_ROUND_TRIP",
        label,
        `sonority ${String(index)} anchored at ${String(
          sonority.anchorTick,
        )} but the plan event starts at ${String(event.startTick)}`,
      );
    }
    const expectedClasses = [
      ...new Set(event.midiPitches.map((pitch) => ((Number(pitch) % 12) + 12) % 12)),
    ].sort((left, right) => left - right);
    if (canonical([...sonority.pitchClasses]) !== canonical(expectedClasses)) {
      pitchClassSetsMatch = false;
    }
    while (barIndex < barSizes.length && inBar >= (barSizes[barIndex] ?? 0)) {
      barIndex += 1;
      inBar = 0;
    }
    if (sonority.measureIndex !== barIndex) measureIndicesMatch = false;
    inBar += 1;
    const outcome = value.resolutions[index];
    const source = chart.bars[barIndex]?.[inBar - 1];
    if (
      outcome !== undefined &&
      outcome.kind === "alternatives" &&
      source !== undefined
    ) {
      const top = outcome.alternatives[0];
      if (
        top !== undefined &&
        !sonority.pitchClasses.includes(top.rootPitchClass)
      ) {
        findings.add(
          "M0E_ROUND_TRIP",
          label,
          "a reported root is not a pitch class the sonority contains",
        );
      }
      if (
        top !== undefined &&
        outcome.alternatives.some(
          (alternative) =>
            alternative.rootPitchClass === expectedRootPitchClass(source.symbol),
        )
      ) {
        topSymbolRecovery += 1;
      }
    }
  }
  if (!exactQuantization) {
    findings.add(
      "M0E_ROUND_TRIP",
      label,
      "an exported onset did not land exactly on the quarter-beat import grid",
    );
  }
  if (!measureIndicesMatch) {
    findings.add(
      "M0E_ROUND_TRIP",
      label,
      "an imported measure index differs from the source bar",
    );
  }
  if (!pitchClassSetsMatch) {
    findings.add(
      "M0E_ROUND_TRIP",
      label,
      "an imported pitch-class set differs from the exported chord",
    );
  }

  const meterEntry = value.model.meterMap[0];
  const meterRecovered =
    meterEntry !== undefined &&
    meterEntry.numerator === chart.meter.beatsPerBar &&
    2 ** meterEntry.denominatorPower === chart.meter.beatUnit;
  if (!meterRecovered) {
    findings.add("M0E_ROUND_TRIP", label, "the meter did not return intact");
  }
  const tempoEntry = value.model.tempoMap[0];
  const expectedMicroseconds = Math.round(60_000_000 / chart.tempoBpm);
  const tempoRecovered =
    tempoEntry !== undefined &&
    tempoEntry.microsecondsPerQuarter === expectedMicroseconds;
  if (!tempoRecovered) {
    findings.add("M0E_ROUND_TRIP", label, "the tempo did not return intact");
  }

  const importedPlan = planMidiImportChart(value, chart.id);
  let sameMeterPreviewStatus: string | null = null;
  let crossMeterPreviewStatus: string | null = null;
  let crossMeterIssueCodes: readonly string[] = [];
  if (importedPlan === null) {
    findings.add(
      "M0E_ROUND_TRIP",
      label,
      "the imported file yielded no chart the grammar can name",
    );
  } else {
    if (importedPlan.measureCount !== chart.bars.length) {
      findings.add(
        "M0E_ROUND_TRIP",
        label,
        `the imported chart holds ${String(
          importedPlan.measureCount,
        )} bars, the source held ${String(chart.bars.length)}`,
      );
    }
    const preview = controller.previewChartText(importedPlan.chartText);
    sameMeterPreviewStatus = preview.status;
    if (preview.status !== "ready") {
      findings.add(
        "M0E_ROUND_TRIP",
        label,
        `the imported chart text does not parse as ready against its own meter: ${preview.status} ${preview.issueCodes.join(",")}`,
      );
    }
    /*
     * The documented durationLaw consequence, proved rather than assumed: a bar
     * that needed the imported file's own beat units carries exact rational
     * durations, so a destination in a different meter must refuse honestly.
     * A "ready" here would mean the import had been silently rebalanced.
     */
    if (
      importedPlan.usesExplicitDurations &&
      !(chart.meter.beatsPerBar === 4 && chart.meter.beatUnit === 4)
    ) {
      const creation = createStudioController({});
      if (creation.ok) {
        const cross = creation.controller.previewChartText(
          importedPlan.chartText,
        );
        crossMeterPreviewStatus = cross.status;
        crossMeterIssueCodes = cross.issueCodes;
        if (cross.status === "ready") {
          findings.add(
            "M0E_DURATION_LAW",
            label,
            "a bar measured in the imported file's meter was accepted by a 4/4 destination; the law says it must refuse rather than be rebalanced",
          );
        }
      }
    }
  }

  return {
    chartId: chart.id,
    meter: `${String(chart.meter.beatsPerBar)}/${String(chart.meter.beatUnit)}`,
    tempoBpm: chart.tempoBpm,
    chordCount: events.length,
    sonorityCount: sonorities.length,
    exactQuantization,
    measureIndicesMatch,
    pitchClassSetsMatch,
    meterRecovered,
    tempoRecovered,
    topSymbolRecovery,
    importedChartText: importedPlan?.chartText ?? null,
    usesExplicitDurations: importedPlan?.usesExplicitDurations ?? false,
    sameMeterPreviewStatus,
    crossMeterPreviewStatus,
    crossMeterIssueCodes,
    bytesSha256: sha256Text(canonical([...bytes])),
  };
}

const ROOT_PITCH_CLASSES = new Map<string, number>([
  ["C", 0],
  ["D", 2],
  ["E", 4],
  ["F", 5],
  ["G", 7],
  ["A", 9],
  ["B", 11],
]);

/** The root pitch class a chart symbol names, read independently of T0. */
function expectedRootPitchClass(symbol: string): number {
  const letter = symbol.slice(0, 1).toUpperCase();
  let value = ROOT_PITCH_CLASSES.get(letter) ?? 0;
  for (const character of symbol.slice(1)) {
    if (character === "b") value -= 1;
    else if (character === "#") value += 1;
    else break;
  }
  return ((value % 12) + 12) % 12;
}

if (import.meta.main) {
  await main();
}
