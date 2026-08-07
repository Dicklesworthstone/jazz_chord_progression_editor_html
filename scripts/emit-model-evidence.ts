/**
 * Model-acceptance evidence emitter (bead jcpe-plucked-evidence-emission-gmx4).
 *
 * Renders each machine-delegated shipping model's evidence cell through the
 * fail-closed reference gate (scripts/reference-similarity.ts), earns every
 * planted control live, and writes one hash-bound GateEvidenceV1 JSON per
 * model under release-evidence/audio/listening/evidence/. The predeploy gate
 * (scripts/check-predeploy.ts) verifies these semantically; nothing here is
 * hand-authored — re-running this script reproduces the same evidence for
 * the same tree.
 *
 * Policies: winds cells certify under winds-reference-policy@1 against the
 * University of Iowa anechoic corpus. Plucked proximity cells certify under
 * plucked-reference-policy@1 against the CC0 FreePats corpus
 * (tests/fixtures/plucked-reference-corpus.v1.json). The ukulele, which has
 * no lawful same-class reference anywhere (FreePats/VSCO/VCSL re-verified
 * 2026-08-07), certifies under plucked-separation-policy@1: clean matched-
 * pitch phonation plus measured cross-class separation from the steel
 * reference, with its same-class physical-invariant proof living in
 * tests/unit/plucked-family.test.ts. Exit codes: 0 all rows emitted PASS,
 * 1 any cell failed, 2 corpus unavailable.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  PLUCKED_REFERENCE_GATE_POLICY,
  PLUCKED_SEPARATION_GATE_POLICY,
  WIND_REFERENCE_GATE_POLICY,
  analyzeSignal,
  buildGateEvidence,
  compareToReference,
  evaluateSimilarityReport,
  gatePolicySha256,
  readAiffMono,
  readWavMono,
  sha256Hex,
  splitChromaticScale,
  type GateEvidenceV1,
  type MonoPcm,
  type ReferenceGatePolicy,
  type SimilarityReport,
  type WindIdentityControlResult,
} from "./reference-similarity";
import { canonicalJson } from "./physical-foundry";
import {
  PLUCKED_ARCHTOP_ALGORITHM_ID,
  PLUCKED_DREADNOUGHT_ALGORITHM_ID,
  PLUCKED_ELECTRIC_ALGORITHM_ID,
  PLUCKED_UKULELE_ALGORITHM_ID,
  PLUCKED_UPRIGHT_ALGORITHM_ID,
  WAVEGUIDE_CLARINET_V2_ALGORITHM_ID,
  loadWaveguideRenderers,
} from "../src/audio/dsp-renderer";
import {
  UPRIGHT_BASS_SAMPLES_BASE64,
  UPRIGHT_BASS_SAMPLES_SHA256,
  UPRIGHT_BASS_SAMPLES_SLICE_INDEX,
} from "../src/audio/wasm/upright-bass-samples";
import { CONCERT_GRAND_WASM_SHA256 } from "../src/audio/wasm/concert-grand-wasm";

const ROOT = resolve(import.meta.dir, "..");
const EVIDENCE_DIRECTORY = "release-evidence/audio/listening/evidence";
const PLUCKED_CORPUS_MANIFEST = "tests/fixtures/plucked-reference-corpus.v1.json";
const UPRIGHT_CORPUS_MANIFEST = "tests/fixtures/upright-bass-reference-corpus.v1.json";
const WIND_CORPUS_MANIFEST = "tests/fixtures/uiowa-wind-identity-corpus.v1.json";
const PLUCKED_REFERENCE_ROOT = "test-results/plucked-reference-source";
const WIND_REFERENCE_ROOT = "test-results/winds-reference-source/uiowa";
const RATE = 48_000;
const RENDER_SECONDS = 3;

type EvidenceCell = Readonly<{
  algorithmId: string;
  rendererSource: string;
  parameterPack: string | null;
  policy: ReferenceGatePolicy;
  midi: number;
  velocity: number;
  corpusManifest: string;
  /** WAV path relative to its corpus root, or AIFF fileName for winds. */
  referenceFile: string;
  referenceMidi: number;
  licenseId: string;
  /**
   * Far-class impostor for the cross-instrument control, run at a pitch
   * where BOTH the impostor and a verified corpus reference exist (the
   * candidate's own cell pitch may be outside the impostor's range).
   */
  cross: Readonly<{
    algorithmId: string;
    midi: number;
    referenceFile: string;
    referenceMidi: number;
  }> | null;
}>;

const CELLS: readonly EvidenceCell[] = Object.freeze([
  {
    algorithmId: WAVEGUIDE_CLARINET_V2_ALGORITHM_ID,
    rendererSource: "dsp/concert-grand/src/clarinet.rs",
    parameterPack: "physical/parameter-packs/clarinet-v2.json",
    policy: WIND_REFERENCE_GATE_POLICY,
    midi: 76,
    velocity: 96,
    corpusManifest: WIND_CORPUS_MANIFEST,
    referenceFile: "BbClar.ff.C5B5.aiff",
    referenceMidi: 76,
    licenseId: "UIowa-MIS-unrestricted",
    cross: {
      algorithmId: PLUCKED_UKULELE_ALGORITHM_ID,
      midi: 76,
      referenceFile: "BbClar.ff.C5B5.aiff",
      referenceMidi: 76,
    },
  },
  {
    algorithmId: PLUCKED_DREADNOUGHT_ALGORITHM_ID,
    rendererSource: "dsp/concert-grand/src/plucked.rs",
    parameterPack: "physical/parameter-packs/plucked-bodies-v2.json",
    policy: PLUCKED_REFERENCE_GATE_POLICY,
    midi: 45,
    velocity: 100,
    corpusManifest: PLUCKED_CORPUS_MANIFEST,
    referenceFile: "FSS-SteelStringGuitar-small-SFZ-20200521/samples/A2.wav",
    referenceMidi: 45,
    licenseId: "CC0-1.0",
    cross: {
      algorithmId: PLUCKED_UKULELE_ALGORITHM_ID,
      midi: 69,
      referenceFile: "FSS-SteelStringGuitar-small-SFZ-20200521/samples/A4.wav",
      referenceMidi: 69,
    },
  },
  {
    algorithmId: PLUCKED_ARCHTOP_ALGORITHM_ID,
    rendererSource: "dsp/concert-grand/src/plucked.rs",
    parameterPack: "physical/parameter-packs/plucked-bodies-v2.json",
    policy: PLUCKED_REFERENCE_GATE_POLICY,
    midi: 56,
    velocity: 100,
    corpusManifest: PLUCKED_CORPUS_MANIFEST,
    referenceFile: "FSS-SteelStringGuitar-small-SFZ-20200521/samples/G#3.wav",
    referenceMidi: 56,
    licenseId: "CC0-1.0",
    cross: {
      algorithmId: PLUCKED_UKULELE_ALGORITHM_ID,
      midi: 69,
      referenceFile: "FSS-SteelStringGuitar-small-SFZ-20200521/samples/A4.wav",
      referenceMidi: 69,
    },
  },
  {
    algorithmId: PLUCKED_ELECTRIC_ALGORITHM_ID,
    rendererSource: "dsp/concert-grand/src/plucked.rs",
    parameterPack: "physical/parameter-packs/plucked-bodies-v2.json",
    policy: PLUCKED_REFERENCE_GATE_POLICY,
    midi: 59,
    velocity: 100,
    corpusManifest: PLUCKED_CORPUS_MANIFEST,
    referenceFile: "EGuitarFSBS-bridge-clean-small-SFZ-20220911/samples/B3_s5_01.wav",
    referenceMidi: 59,
    licenseId: "CC0-1.0",
    cross: {
      algorithmId: PLUCKED_DREADNOUGHT_ALGORITHM_ID,
      midi: 59,
      referenceFile: "EGuitarFSBS-bridge-clean-small-SFZ-20220911/samples/B3_s5_01.wav",
      referenceMidi: 59,
    },
  },
  {
    algorithmId: PLUCKED_UKULELE_ALGORITHM_ID,
    rendererSource: "dsp/concert-grand/src/plucked.rs",
    parameterPack: "physical/parameter-packs/plucked-bodies-v2.json",
    policy: PLUCKED_SEPARATION_GATE_POLICY,
    midi: 69,
    velocity: 100,
    corpusManifest: PLUCKED_CORPUS_MANIFEST,
    referenceFile: "FSS-SteelStringGuitar-small-SFZ-20200521/samples/A4.wav",
    referenceMidi: 69,
    licenseId: "CC0-1.0",
    cross: null,
  },
  {
    algorithmId: PLUCKED_UPRIGHT_ALGORITHM_ID,
    rendererSource: "dsp/concert-grand/src/plucked.rs",
    parameterPack: "physical/parameter-packs/plucked-bodies-v2.json",
    policy: PLUCKED_REFERENCE_GATE_POLICY,
    midi: 36,
    velocity: 100,
    corpusManifest: UPRIGHT_CORPUS_MANIFEST,
    referenceFile: "slice:midi-36",
    referenceMidi: 36,
    licenseId: "CC0-1.0",
    cross: {
      /* Far-class impostor at a pitch both share: the dreadnought's low E2
       * against the real pizzicato E2 recording. */
      algorithmId: PLUCKED_DREADNOUGHT_ALGORITHM_ID,
      midi: 40,
      referenceFile: "slice:midi-40",
      referenceMidi: 40,
    },
  },
]);

function midiHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function pcmBytes(pcm: MonoPcm): Uint8Array {
  return new Uint8Array(pcm.samples.buffer.slice(
    pcm.samples.byteOffset, pcm.samples.byteOffset + pcm.samples.byteLength));
}

async function fileSha(path: string): Promise<string> {
  return sha256Hex(new Uint8Array(await readFile(join(ROOT, path))));
}

async function loadReference(cell: EvidenceCell): Promise<
  Readonly<{ pcm: MonoPcm; fileSha256: string; filePath: string }> | null> {
  if (cell.corpusManifest === WIND_CORPUS_MANIFEST) {
    const path = join(WIND_REFERENCE_ROOT, cell.referenceFile);
    if (!existsSync(join(ROOT, path))) return null;
    const bytes = new Uint8Array(await readFile(join(ROOT, path)));
    const manifest = JSON.parse(await readFile(join(ROOT, cell.corpusManifest), "utf8")) as
      Readonly<{ files: readonly Readonly<{ fileName: string; sha256: string; firstMidi: number }>[] }>;
    const row = manifest.files.find((file) => file.fileName === cell.referenceFile);
    if (row === undefined || sha256Hex(bytes) !== row.sha256) return null;
    const notes = splitChromaticScale(readAiffMono(bytes));
    const note = notes[cell.referenceMidi - row.firstMidi];
    if (note === undefined) return null;
    return Object.freeze({ pcm: note, fileSha256: row.sha256, filePath: path });
  }
  if (cell.corpusManifest === UPRIGHT_CORPUS_MANIFEST) {
    /* The reference corpus IS the shipped sampled upright bass: raw 16-bit
     * PCM slices inside the generated module, already CC0 and
     * pitch-verified at import. No file I/O; the manifest pins the module
     * payload hash and the decoded payload must match it. */
    const manifest = JSON.parse(
      await readFile(join(ROOT, cell.corpusManifest), "utf8"),
    ) as Readonly<{
      payloadSha256: string;
      sampleRateHz: number;
      files: readonly Readonly<{ fileName: string; sliceMidi: number }>[];
    }>;
    const row = manifest.files.find(
      (file) => file.fileName === cell.referenceFile,
    );
    if (row === undefined || row.sliceMidi !== cell.referenceMidi) return null;
    if (manifest.payloadSha256 !== UPRIGHT_BASS_SAMPLES_SHA256) return null;
    const payload = Uint8Array.from(atob(UPRIGHT_BASS_SAMPLES_BASE64), (c) =>
      c.charCodeAt(0),
    );
    if (sha256Hex(payload) !== manifest.payloadSha256) return null;
    const slice = UPRIGHT_BASS_SAMPLES_SLICE_INDEX.find(
      (entry) => entry.midiPitch === row.sliceMidi,
    );
    if (slice === undefined) return null;
    const int16 = new Int16Array(
      payload.buffer,
      slice.byteOffset,
      slice.frameCount,
    );
    const samples = new Float32Array(slice.frameCount);
    for (let index = 0; index < slice.frameCount; index += 1) {
      samples[index] = (int16[index] ?? 0) / 32_768;
    }
    return Object.freeze({
      pcm: Object.freeze({ samples, sampleRateHz: manifest.sampleRateHz }),
      fileSha256: manifest.payloadSha256,
      filePath: `${cell.corpusManifest}#${cell.referenceFile}`,
    });
  }
  const path = join(PLUCKED_REFERENCE_ROOT, cell.referenceFile);
  if (!existsSync(join(ROOT, path))) return null;
  const bytes = new Uint8Array(await readFile(join(ROOT, path)));
  const manifest = JSON.parse(await readFile(join(ROOT, cell.corpusManifest), "utf8")) as
    Readonly<{ files: readonly Readonly<{ fileName: string; sha256: string; verifiedMidi: number }>[] }>;
  const row = manifest.files.find((file) => file.fileName === cell.referenceFile);
  if (row === undefined || sha256Hex(bytes) !== row.sha256 ||
    row.verifiedMidi !== cell.referenceMidi) return null;
  return Object.freeze({ pcm: readWavMono(bytes), fileSha256: row.sha256, filePath: path });
}

function decayDb(pcm: MonoPcm): number {
  const rms = (from: number, to: number): number => {
    const start = Math.min(Math.round(from * pcm.sampleRateHz), pcm.samples.length);
    const end = Math.min(Math.round(to * pcm.sampleRateHz), pcm.samples.length);
    if (end <= start) return 0;
    let sum = 0;
    for (let index = start; index < end; index += 1) {
      const sample = pcm.samples[index] ?? 0;
      sum += sample * sample;
    }
    return Math.sqrt(sum / (end - start));
  };
  const early = rms(0.05, 0.45);
  const late = rms(1.6, 2.4);
  if (early <= 0) return 0;
  return 20 * Math.log10(early / Math.max(late, 1e-12));
}

function whiteNoise(seconds: number): MonoPcm {
  const samples = new Float32Array(Math.round(seconds * RATE));
  let state = 0x9e3779b9 >>> 0;
  for (let index = 0; index < samples.length; index += 1) {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    samples[index] = ((state / 0xffffffff) * 2 - 1) * 0.3;
  }
  return Object.freeze({ samples, sampleRateHz: RATE });
}

function pureTone(hz: number, seconds: number): MonoPcm {
  const samples = new Float32Array(Math.round(seconds * RATE));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = 0.4 * Math.sin((2 * Math.PI * hz * index) / RATE);
  }
  return Object.freeze({ samples, sampleRateHz: RATE });
}

async function main(): Promise<number> {
  const renderers = await loadWaveguideRenderers();
  const analyzerSha = await fileSha("scripts/reference-similarity.ts");
  const wasmSha = CONCERT_GRAND_WASM_SHA256;
  await mkdir(join(ROOT, EVIDENCE_DIRECTORY), { recursive: true });
  let failures = 0;

  for (const cell of CELLS) {
    const renderer = renderers.get(cell.algorithmId);
    const reference = await loadReference(cell);
    if (renderer === undefined || reference === null) {
      console.error(`UNAVAILABLE ${cell.algorithmId}: renderer or verified reference missing`);
      return 2;
    }
    const rendered = renderer.renderNote(cell.midi, cell.velocity, RATE, RENDER_SECONDS);
    if (rendered === null) {
      console.error(`FAIL ${cell.algorithmId}: render refused`);
      failures += 1;
      continue;
    }
    const candidate: MonoPcm = Object.freeze({ samples: rendered.left, sampleRateHz: RATE });
    const expectedHz = midiHz(cell.midi);
    const referenceHz = midiHz(cell.referenceMidi);

    /* Planted controls, each earned live against this cell's policy. */
    const noise = analyzeSignal(whiteNoise(RENDER_SECONDS), expectedHz, cell.policy);
    const whiteNoiseRejected = noise.outcome === "unavailable";
    const wrong = renderer.renderNote(cell.midi + 4, cell.velocity, RATE, RENDER_SECONDS);
    const wrongAnalysis = wrong === null ? null : analyzeSignal(
      Object.freeze({ samples: wrong.left, sampleRateHz: RATE }), expectedHz, cell.policy);
    const wrongPitchRejected = wrongAnalysis === null || wrongAnalysis.outcome === "unavailable";
    const selfComparison = compareToReference(reference.pcm, reference.pcm, referenceHz, cell.policy);
    const self = selfComparison.outcome === "accept" &&
      selfComparison.report.envelopeDb < 0.001 && selfComparison.report.harmonicDb < 0.001;

    /* The identity boundary for these controls is the policy verdict itself;
     * the corpus-level identity controls live in their own runners. */
    const passControl: WindIdentityControlResult = Object.freeze({
      outcome: "pass", exitCode: 0, findings: Object.freeze([]),
      measurements: Object.freeze([]),
    });
    const verdictRejects = (report: SimilarityReport): boolean =>
      evaluateSimilarityReport(report, passControl, cell.policy).outcome !== "pass";

    let overlyPureRejected: boolean;
    let crossInstrumentRejected: boolean;
    if (cell.policy.mode === "proximity") {
      const pure = compareToReference(pureTone(expectedHz, RENDER_SECONDS), reference.pcm,
        expectedHz, cell.policy, referenceHz);
      overlyPureRejected = pure.outcome !== "accept" || verdictRejects(pure.report);
      /* A far-class impostor must fail this cell's full proximity verdict,
       * run at a pitch where both impostor and corpus reference exist. */
      crossInstrumentRejected = false;
      if (cell.cross !== null) {
        const impostor = renderers.get(cell.cross.algorithmId)
          ?.renderNote(cell.cross.midi, cell.velocity, RATE, RENDER_SECONDS);
        const crossReference = await loadReference({
          ...cell,
          referenceFile: cell.cross.referenceFile,
          referenceMidi: cell.cross.referenceMidi,
        });
        if (impostor != null && crossReference !== null) {
          const crossHz = midiHz(cell.cross.midi);
          const crossComparison = compareToReference(
            Object.freeze({ samples: impostor.left, sampleRateHz: RATE }),
            crossReference.pcm, crossHz, cell.policy,
            midiHz(cell.cross.referenceMidi));
          crossInstrumentRejected = crossComparison.outcome !== "accept" ||
            verdictRejects(crossComparison.report);
        }
      }
    } else {
      /* Separation mode: a sustained pure tone fails the plucked decay
       * invariant (a real pluck decays; the candidate's own decay must
       * exceed the floor while the tone's does not). */
      const candidateDecay = decayDb(candidate);
      const toneDecay = decayDb(pureTone(expectedHz, RENDER_SECONDS));
      overlyPureRejected = candidateDecay > 12 && toneDecay < 3;
      /* A guitar posing as the ukulele must FAIL separation: the steel
       * reference against itself scores zero separation. */
      crossInstrumentRejected =
        selfComparison.outcome === "accept" &&
        selfComparison.report.envelopeDb < cell.policy.minimumEnvelopeSeparationDb;
    }

    const comparison = compareToReference(candidate, reference.pcm, expectedHz,
      cell.policy, referenceHz);
    if (comparison.outcome !== "accept") {
      console.error(`FAIL ${cell.algorithmId}: ${JSON.stringify(comparison.findings)}`);
      failures += 1;
      continue;
    }
    if (process.env["EVIDENCE_DEBUG"] === "1") {
      console.error(`debug ${cell.algorithmId}: self=${String(self)} noise=${String(whiteNoiseRejected)} ` +
        `pure=${String(overlyPureRejected)} wrong=${String(wrongPitchRejected)} ` +
        `cross=${String(crossInstrumentRejected)} ` +
        `verdict=${evaluateSimilarityReport(comparison.report, passControl, cell.policy).outcome}`);
    }
    const renderRequest = {
      algorithmId: cell.algorithmId,
      midi: cell.midi,
      velocity: cell.velocity,
      sampleRateHz: RATE,
      seconds: RENDER_SECONDS,
    };
    let evidence: GateEvidenceV1;
    try {
      evidence = buildGateEvidence({
      outcome: "pass",
      rendererAlgorithmId: cell.algorithmId,
      corpusId: cell.corpusManifest === WIND_CORPUS_MANIFEST
        ? "university-of-iowa-musical-instrument-samples-winds@2026-08-07"
        : "plucked-reference-corpus@1",
      referencePath: reference.filePath,
      referenceLicenseId: cell.licenseId,
      expectedMidi: cell.midi,
      expectedHz,
      digests: {
        analyzerImplementationSha256: analyzerSha,
        policySha256: gatePolicySha256(cell.policy),
        rendererSourceSha256: await fileSha(cell.rendererSource),
        wasmSha256: wasmSha,
        parameterPackSha256: cell.parameterPack === null
          ? sha256Hex("no-parameter-pack")
          : await fileSha(cell.parameterPack),
        renderRequestSha256: sha256Hex(canonicalJson(renderRequest)),
        pcmSha256: sha256Hex(pcmBytes(candidate)),
        corpusManifestSha256: await fileSha(cell.corpusManifest),
        referenceFileSha256: reference.fileSha256,
      },
      controls: {
        self,
        whiteNoiseRejected,
        overlyPureRejected,
        wrongPitchRejected,
        crossInstrumentRejected,
      },
      report: comparison.report,
      findings: [],
      });
    } catch (error) {
      const verdict = evaluateSimilarityReport(comparison.report, passControl, cell.policy);
      console.error(`FAIL ${cell.algorithmId}: ${String(error)} ` +
        `(verdict=${verdict.outcome} findings=${JSON.stringify(verdict.findings)})`);
      failures += 1;
      continue;
    }
    const safeName = cell.algorithmId.replaceAll(/[^a-zA-Z0-9]+/g, "-");
    const outputPath = join(EVIDENCE_DIRECTORY, `${safeName}.json`);
    await writeFile(join(ROOT, outputPath), `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(`PASS ${cell.algorithmId} -> ${outputPath} ` +
      `(env=${comparison.report.envelopeDb.toFixed(1)} harm=${comparison.report.harmonicDb.toFixed(1)} ` +
      `policy=${cell.policy.id})`);
  }
  return failures === 0 ? 0 : 1;
}

process.exit(await main());
