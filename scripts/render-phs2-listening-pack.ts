/** Deterministic, level-matched clarinet v1/v2 audition material. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  loadWaveguideRenderers,
  WAVEGUIDE_CLARINET_ALGORITHM_ID,
  WAVEGUIDE_CLARINET_V2_ALGORITHM_ID,
  type RenderedNotePcm,
  type WindAttackArticulation,
} from "../src/audio/dsp-renderer";

const SAMPLE_RATE_HZ = 48_000;
const NOTE_SECONDS = 1.75;
const GAP_SECONDS = 0.35;
const TARGET_RMS = 10 ** (-20 / 20);
const MAX_GAIN = 4;

const CASES = Object.freeze(
  ([50, 62, 74] as const).flatMap((midiPitch, registerIndex) =>
    ([36, 108] as const).flatMap((velocity) =>
      (["tongued", "legato"] as const).map((articulation) => Object.freeze({
        id: `${["low", "middle", "high"][registerIndex]}-${velocity === 36 ? "soft" : "loud"}-${articulation}`,
        midiPitch,
        velocity,
        articulation,
        variationSlot: 0,
      })),
    ),
  ),
);

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function rmsAfterAttack(pcm: RenderedNotePcm): number {
  const start = Math.min(pcm.frameCount, Math.round(0.1 * pcm.sampleRateHz));
  let sum = 0;
  let count = 0;
  for (let frame = start; frame < pcm.frameCount; frame += 1) {
    const left = pcm.left[frame] ?? 0;
    const right = pcm.right[frame] ?? 0;
    sum += left * left + right * right;
    count += 2;
  }
  return count === 0 ? 0 : Math.sqrt(sum / count);
}

function peak(pcm: RenderedNotePcm): number {
  let result = 0;
  for (let frame = 0; frame < pcm.frameCount; frame += 1) {
    result = Math.max(result, Math.abs(pcm.left[frame] ?? 0), Math.abs(pcm.right[frame] ?? 0));
  }
  return result;
}

function levelGain(pcm: RenderedNotePcm): number {
  const measured = rmsAfterAttack(pcm);
  if (!(measured > 0)) return 1;
  const rmsGain = Math.min(MAX_GAIN, TARGET_RMS / measured);
  const measuredPeak = peak(pcm);
  const peakGain = measuredPeak > 0 ? 0.98 / measuredPeak : MAX_GAIN;
  return Math.min(rmsGain, peakGain);
}

function wav(pcm: RenderedNotePcm, gain: number): Uint8Array {
  const bytesPerSample = 2;
  const dataBytes = pcm.frameCount * 2 * bytesPerSample;
  const result = Buffer.alloc(44 + dataBytes);
  result.write("RIFF", 0, "ascii");
  result.writeUInt32LE(36 + dataBytes, 4);
  result.write("WAVEfmt ", 8, "ascii");
  result.writeUInt32LE(16, 16);
  result.writeUInt16LE(1, 20);
  result.writeUInt16LE(2, 22);
  result.writeUInt32LE(pcm.sampleRateHz, 24);
  result.writeUInt32LE(pcm.sampleRateHz * 4, 28);
  result.writeUInt16LE(4, 32);
  result.writeUInt16LE(16, 34);
  result.write("data", 36, "ascii");
  result.writeUInt32LE(dataBytes, 40);
  let offset = 44;
  for (let frame = 0; frame < pcm.frameCount; frame += 1) {
    for (const value of [pcm.left[frame] ?? 0, pcm.right[frame] ?? 0]) {
      const sample = Math.max(-1, Math.min(1, value * gain));
      result.writeInt16LE(Math.round(sample * (sample < 0 ? 32768 : 32767)), offset);
      offset += bytesPerSample;
    }
  }
  return result;
}

function sequence(first: RenderedNotePcm, firstGain: number, second: RenderedNotePcm, secondGain: number): RenderedNotePcm {
  const gapFrames = Math.round(GAP_SECONDS * SAMPLE_RATE_HZ);
  const frameCount = first.frameCount + gapFrames + second.frameCount;
  const left = new Float32Array(frameCount);
  const right = new Float32Array(frameCount);
  for (let frame = 0; frame < first.frameCount; frame += 1) {
    left[frame] = (first.left[frame] ?? 0) * firstGain;
    right[frame] = (first.right[frame] ?? 0) * firstGain;
  }
  const secondStart = first.frameCount + gapFrames;
  for (let frame = 0; frame < second.frameCount; frame += 1) {
    left[secondStart + frame] = (second.left[frame] ?? 0) * secondGain;
    right[secondStart + frame] = (second.right[frame] ?? 0) * secondGain;
  }
  return Object.freeze({ sampleRateHz: SAMPLE_RATE_HZ, frameCount, left, right });
}

export async function renderClarinetListeningPack(
  outputDirectory: string,
  referenceDirectory?: string,
): Promise<Readonly<Record<string, unknown>>> {
  const renderers = await loadWaveguideRenderers();
  const legacy = renderers.get(WAVEGUIDE_CLARINET_ALGORITHM_ID);
  const candidate = renderers.get(WAVEGUIDE_CLARINET_V2_ALGORITHM_ID);
  if (legacy === undefined || candidate === undefined) throw new Error("PHS2_LISTENING_RENDERER_MISSING");
  if (legacy.wasmSha256 !== candidate.wasmSha256) throw new Error("PHS2_LISTENING_WASM_MISMATCH");
  const referenceFiles = referenceDirectory === undefined
    ? []
    : await Promise.all((["D3.wav", "D4.wav", "D5.wav"] as const).map(async (file) => {
        const bytes = await readFile(resolve(referenceDirectory, file));
        return Object.freeze({ file, bytes, sha256: sha256(bytes) });
      }));
  const runId = sha256(Buffer.from(JSON.stringify({
    cases: CASES,
    wasmSha256: legacy.wasmSha256,
    referenceSha256: referenceFiles.map(({ sha256: digest }) => digest),
  }))).slice(0, 16);
  const root = resolve(outputDirectory, runId);
  await mkdir(root, { recursive: true });
  const clips: Record<string, unknown>[] = [];
  for (const testCase of CASES) {
    const args = [testCase.midiPitch, testCase.velocity, SAMPLE_RATE_HZ, NOTE_SECONDS, testCase.variationSlot, testCase.articulation] as const;
    const legacyPcm = legacy.renderNote(...args);
    const candidatePcm = candidate.renderNote(...args);
    if (legacyPcm === null || candidatePcm === null) throw new Error(`PHS2_LISTENING_RENDER_REFUSED:${testCase.id}`);
    const legacyGain = levelGain(legacyPcm);
    const candidateGain = levelGain(candidatePcm);
    const files = [
      [`${testCase.id}-legacy.wav`, wav(legacyPcm, legacyGain)],
      [`${testCase.id}-candidate.wav`, wav(candidatePcm, candidateGain)],
      [`${testCase.id}-ab.wav`, wav(sequence(legacyPcm, legacyGain, candidatePcm, candidateGain), 1)],
      [`${testCase.id}-ba.wav`, wav(sequence(candidatePcm, candidateGain, legacyPcm, legacyGain), 1)],
    ] as const;
    for (const [name, bytes] of files) await writeFile(resolve(root, name), bytes);
    clips.push(Object.freeze({
      ...testCase,
      legacy: { algorithmId: legacy.algorithmId, unscaledRms: rmsAfterAttack(legacyPcm), gain: legacyGain, peak: peak(legacyPcm), file: files[0][0], sha256: sha256(files[0][1]) },
      candidate: { algorithmId: candidate.algorithmId, unscaledRms: rmsAfterAttack(candidatePcm), gain: candidateGain, peak: peak(candidatePcm), file: files[1][0], sha256: sha256(files[1][1]) },
      comparisons: [
        { order: ["legacy", "candidate"], file: files[2][0], sha256: sha256(files[2][1]) },
        { order: ["candidate", "legacy"], file: files[3][0], sha256: sha256(files[3][1]) },
      ],
    }));
  }
  for (const reference of referenceFiles) {
    await writeFile(resolve(root, `reference-${reference.file}`), reference.bytes);
  }
  const legalReferenceRecording = referenceFiles.length === 0
    ? { included: false, reason: "Pass the extracted FreePats sample directory to include the reviewed CC0 acoustic reference." }
    : {
        included: true,
        corpus: "FreePats Clarinet 2019-08-18",
        performers: ["Kaili Dence"],
        recordingEngineer: "Tyler Dence",
        source: "https://freepats.zenvoid.org/Reed/clarinet.html",
        license: "CC0-1.0",
        licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
        files: referenceFiles.map(({ file, sha256: digest }, registerIndex) => ({
          register: ["low", "middle", "high"][registerIndex],
          sourceFile: file,
          copiedFile: `reference-${file}`,
          sha256: digest,
        })),
      };
  const manifest = Object.freeze({
    schema: "changes.evidence.phs2-listening-pack.v1",
    runId,
    rendererWasmSha256: legacy.wasmSha256,
    sampleRateHz: SAMPLE_RATE_HZ,
    noteSeconds: NOTE_SECONDS,
    comparisonGapSeconds: GAP_SECONDS,
    levelMatching: { metric: "stereo-rms-after-first-100ms", targetDbfs: -20, maximumGain: MAX_GAIN, peakCeiling: 0.98 },
    clips,
    manualListening: { performed: false, outcome: "not-assessed", reason: "This command renders evidence; only the owner can record the required listening judgment." },
    legalReferenceRecording,
  });
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(resolve(root, "manifest.json"), manifestBytes);
  await writeFile(resolve(root, "LISTENING.md"), `# Clarinet v2 listening pack\n\nListen at a fixed safe monitor level. For every row, audition both \`-ab.wav\` and \`-ba.wav\` to control order bias. Compare onset, sustained tone, register transition, dynamic response, mechanical artifacts, clicks, and stuck notes. Record observations without changing the generated manifest.\n\nThe \`reference-D3.wav\`, \`reference-D4.wav\`, and \`reference-D5.wav\` clips are unprocessed CC0 acoustic recordings from FreePats; use them as timbral references, not loudness matches. Generation is not a human verdict.\n`);
  await writeFile(resolve(root, "review-template.json"), `${JSON.stringify({ schema: "changes.evidence.phs2-owner-listening-review.v1", packRunId: runId, reviewer: null, listeningChain: null, completedAt: null, verdict: null, observationsByCase: Object.fromEntries(CASES.map(({ id }) => [id, null])), acousticReference: null }, null, 2)}\n`);
  return Object.freeze({ root, manifestSha256: sha256(manifestBytes), manifest });
}

if (import.meta.main) {
  const report = await renderClarinetListeningPack(
    process.argv[2] ?? "test-results/clarinet-v2-listening",
    process.argv[3],
  );
  console.log(JSON.stringify(report, null, 2));
}
