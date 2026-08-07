import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  WIND_IDENTITY_CONTROL_POLICY,
  analyzeSignal,
  estimatePitch,
  readAiffMono,
  runWindIdentityControl,
  sha256Hex,
  splitChromaticScale,
  type GateFinding,
  type MonoPcm,
  type SignalFeatures,
  type WindIdentityControlCell,
  type WindIdentityControlResult,
} from "./reference-similarity";

const MANIFEST_PATH = "tests/fixtures/uiowa-wind-identity-corpus.v1.json";
const CORPUS_DIRECTORY = "test-results/winds-reference-source/uiowa";

type Dynamic = "pp" | "mf" | "ff";
type CorpusFile = Readonly<{
  instrument: "flute" | "clarinet";
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
  selectedMidi: readonly number[];
  requiredDynamics: readonly Dynamic[];
  files: readonly CorpusFile[];
}>;

function unavailable(code: string, message: string): WindIdentityControlResult {
  const item: GateFinding = Object.freeze({ code, message });
  return Object.freeze({ outcome: "unavailable", exitCode: 2,
    findings: Object.freeze([item]), measurements: Object.freeze([]) });
}

function midiHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function assertManifest(value: unknown): asserts value is CorpusManifest {
  if (value === null || typeof value !== "object") throw new Error("manifest is not an object");
  const manifest = value as Partial<CorpusManifest>;
  if (manifest.schema !== "changes.fixture.uiowa-wind-identity-corpus.v1" ||
    !Array.isArray(manifest.selectedMidi) || !Array.isArray(manifest.requiredDynamics) ||
    !Array.isArray(manifest.files) || manifest.files.length !== 6) {
    throw new Error("manifest schema or corpus cardinality is invalid");
  }
}

function windowFeatures(note: MonoPcm, actualPitchHz: number, offsetSeconds: number): SignalFeatures {
  const start = Math.round(offsetSeconds * note.sampleRateHz);
  const end = start + Math.round(1.2 * note.sampleRateHz);
  if (end > note.samples.length) throw new Error("reference note is too short for two sustain windows");
  const analysis = analyzeSignal(Object.freeze({
    samples: note.samples.slice(start, end), sampleRateHz: note.sampleRateHz,
  }), actualPitchHz);
  if (analysis.outcome !== "accept") throw new Error(JSON.stringify(analysis.findings));
  return analysis.features;
}

export async function runUiowaWindIdentityCorpus(root = process.cwd()):
  Promise<WindIdentityControlResult> {
  const manifestFile = join(root, MANIFEST_PATH);
  if (!existsSync(manifestFile)) return unavailable("IDENTITY_MANIFEST_ABSENT", MANIFEST_PATH);
  let manifest: CorpusManifest;
  try {
    const rawManifest = await readFile(manifestFile, "utf8");
    const parsed: unknown = JSON.parse(rawManifest);
    assertManifest(parsed);
    manifest = parsed;
  } catch (error) {
    return unavailable("IDENTITY_MANIFEST_INVALID", String(error));
  }
  const scales = new Map<string, readonly MonoPcm[]>();
  for (const file of manifest.files) {
    const path = join(root, CORPUS_DIRECTORY, file.fileName);
    if (!existsSync(path)) return unavailable("REFERENCE_CORPUS_ABSENT", path);
    const bytes = new Uint8Array(await readFile(path));
    if (bytes.byteLength !== file.bytes || sha256Hex(bytes) !== file.sha256) {
      return unavailable("REFERENCE_CORPUS_DIGEST_MISMATCH", file.fileName);
    }
    let notes: readonly MonoPcm[];
    try {
      notes = splitChromaticScale(readAiffMono(bytes));
    } catch (error) {
      return unavailable("REFERENCE_CORPUS_DECODE_FAILED", `${file.fileName}: ${String(error)}`);
    }
    if (notes.length !== file.noteCount) {
      return unavailable("REFERENCE_CORPUS_SEGMENT_COUNT",
        `${file.fileName}: expected ${String(file.noteCount)}, got ${String(notes.length)}`);
    }
    scales.set(`${file.instrument}:${file.dynamic}`, notes);
  }
  const cells: WindIdentityControlCell[] = [];
  try {
    for (const midi of manifest.selectedMidi) {
      for (const dynamic of manifest.requiredDynamics) {
        const fluteFile = manifest.files.find((file) =>
          file.instrument === "flute" && file.dynamic === dynamic);
        const clarinetFile = manifest.files.find((file) =>
          file.instrument === "clarinet" && file.dynamic === dynamic);
        const fluteNotes = scales.get(`flute:${dynamic}`);
        const clarinetNotes = scales.get(`clarinet:${dynamic}`);
        if (fluteFile === undefined || clarinetFile === undefined ||
          fluteNotes === undefined || clarinetNotes === undefined) {
          return unavailable("IDENTITY_CORPUS_MATRIX_INCOMPLETE", `${String(midi)}:${dynamic}`);
        }
        const flute = fluteNotes[midi - fluteFile.firstMidi];
        const clarinet = clarinetNotes[midi - clarinetFile.firstMidi];
        if (flute === undefined || clarinet === undefined) {
          return unavailable("IDENTITY_CORPUS_NOTE_ABSENT", `${String(midi)}:${dynamic}`);
        }
        const expectedHz = midiHz(midi);
        const flutePitch = estimatePitch(flute, expectedHz);
        const clarinetPitch = estimatePitch(clarinet, expectedHz);
        if (flutePitch === null || clarinetPitch === null ||
          flutePitch.periodicity < 0.45 || clarinetPitch.periodicity < 0.45 ||
          Math.abs(flutePitch.centsFromExpected) >
            WIND_IDENTITY_CONTROL_POLICY.maximumMatchedPitchDeltaCents ||
          Math.abs(clarinetPitch.centsFromExpected) >
            WIND_IDENTITY_CONTROL_POLICY.maximumMatchedPitchDeltaCents) {
          return unavailable("IDENTITY_CORPUS_PITCH_ADMISSION", `${String(midi)}:${dynamic}`);
        }
        cells.push(Object.freeze({
          id: `m${String(midi)}-${dynamic}`,
          midi,
          dynamic,
          flutePitchHz: flutePitch.f0Hz,
          clarinetPitchHz: clarinetPitch.f0Hz,
          fluteEarly: windowFeatures(flute, flutePitch.f0Hz, 0.05),
          fluteLate: windowFeatures(flute, flutePitch.f0Hz, 0.35),
          clarinetEarly: windowFeatures(clarinet, clarinetPitch.f0Hz, 0.05),
          clarinetLate: windowFeatures(clarinet, clarinetPitch.f0Hz, 0.35),
        }));
      }
    }
  } catch (error) {
    return unavailable("IDENTITY_CORPUS_ANALYSIS_FAILED", String(error));
  }
  return runWindIdentityControl(cells);
}

if (import.meta.main) {
  const result = await runUiowaWindIdentityCorpus();
  process.stdout.write(`${JSON.stringify({
    schema: "changes.evidence.uiowa-wind-identity-control.v1",
    policy: WIND_IDENTITY_CONTROL_POLICY,
    manifestPath: MANIFEST_PATH,
    ...result,
  }, null, 2)}\n`);
  process.exitCode = result.exitCode;
}
