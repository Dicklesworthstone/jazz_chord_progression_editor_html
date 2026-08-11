/**
 * Chart-audio A/B pack generator (bead jcpe-0xed).
 *
 * The standing law from the 2026-08-09 owner round: the primary quality
 * artifact for every instrument round is a short LISTENABLE chart phrase,
 * not an isolated cell metric. This script renders, per shipping rendered
 * recipe, a deterministic ii-V-I comp-plus-melody phrase (~12 s) through
 * the exact embedded WASM / sampled payloads into
 * `test-results/character-ab/<instrument>.current.wav`.
 *
 * For the winds, where an anechoic reference corpus is checked in, it also
 * renders a scale-walk pair at the EXACT corpus pitches and dynamics:
 * `<instrument>.scalewalk.current.wav` against
 * `<instrument>.scalewalk.reference-uiowa.wav` — a direct ear-level A/B.
 *
 * Every file is peak-normalized to -3 dBFS with the applied gain recorded
 * in the manifest, so a level difference never masquerades as character.
 * No-claim: these packs are FOR THE OWNER'S EARS; nothing here scores or
 * passes anything.
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  AUDIO_INSTRUMENT_RECIPES,
  AUDIO_PLAYABLE_MIDI_WINDOWS,
  pluckedChordAssignmentFeasible,
} from "../src/audio/instrument-recipes-contract";
import {
  loadConcertGrandRenderer,
  loadWaveguideRenderers,
  type RenderedNotePcm,
} from "../src/audio/dsp-renderer";
import { loadSampledInstrumentRenderer } from "../src/audio/sampled-renderer";
import { CONCERT_GRAND_WASM_SHA256 } from "../src/audio/wasm/concert-grand-wasm";
import {
  readAiffMono,
  sha256Hex,
  splitChromaticScale,
  type MonoPcm,
} from "./reference-similarity";

const SAMPLE_RATE_HZ = 44_100;
const OUTPUT_DIRECTORY = "test-results/character-ab";
const TARGET_PEAK = 10 ** (-3 / 20);

/** One scheduled note of a deterministic phrase. */
type PhraseNote = Readonly<{
  midiPitch: number;
  velocity: number;
  startSeconds: number;
  gateSeconds: number;
}>;

/**
 * ii-V-I in F (Gm7, C7, Fmaj7) comped in half notes, then a swung
 * arpeggio line over the same changes. Velocities vary deliberately so a
 * pure-gain velocity response is audible as such.
 */
function assignableChord(
  chord: readonly number[],
  low: number,
  high: number,
  algorithmId: string,
): readonly number[] {
  const fold = (pitch: number): number => {
    let folded = pitch;
    while (folded < low) folded += 12;
    while (folded > high) folded -= 12;
    return folded;
  };
  const folded = chord.map(fold);
  if (pluckedChordAssignmentFeasible(algorithmId, folded)) return folded;
  const options = chord.map((pitch, index) => {
    const candidates: number[] = [];
    for (let transposition = -8; transposition <= 8; transposition += 1) {
      const candidate = pitch + 12 * transposition;
      if (candidate >= low && candidate <= high) candidates.push(candidate);
    }
    const anchor = folded[index] ?? pitch;
    return candidates.sort(
      (left, right) =>
        Math.abs(left - anchor) - Math.abs(right - anchor) || left - right,
    );
  });
  const outcome: { best: number[] | null; bestScore: number } = {
    best: null,
    bestScore: Number.POSITIVE_INFINITY,
  };
  const current = new Array<number>(chord.length);
  const lexicographicallyBefore = (
    candidate: readonly number[],
    incumbent: readonly number[],
  ): boolean => {
    for (let index = 0; index < candidate.length; index += 1) {
      const left = candidate[index];
      const right = incumbent[index];
      if (left === undefined || right === undefined) return false;
      if (left !== right) return left < right;
    }
    return false;
  };
  const visit = (index: number, score: number): void => {
    if (score > outcome.bestScore) return;
    if (index === options.length) {
      if (!pluckedChordAssignmentFeasible(algorithmId, current)) return;
      if (
        score < outcome.bestScore ||
        (score === outcome.bestScore &&
          (outcome.best === null ||
            lexicographicallyBefore(current, outcome.best)))
      ) {
        outcome.best = [...current];
        outcome.bestScore = score;
      }
      return;
    }
    const anchor = folded[index];
    if (anchor === undefined) return;
    for (const candidate of options[index] ?? []) {
      current[index] = candidate;
      const displacement = candidate - anchor;
      visit(index + 1, score + displacement * displacement);
    }
  };
  visit(0, 0);
  if (outcome.best === null) {
    throw new Error(
      `CHARACTER_AB_CHORD_UNASSIGNABLE: ${algorithmId} [${chord.map(String).join(",")}]`,
    );
  }
  return outcome.best;
}

function buildPhrase(
  low: number,
  high: number,
  algorithmId: string,
): readonly PhraseNote[] {
  const fold = (pitch: number): number => {
    let folded = pitch;
    while (folded < low) folded += 12;
    while (folded > high) folded -= 12;
    return folded;
  };
  const chords: ReadonlyArray<readonly number[]> = [
    [55, 58, 62, 65] /* Gm7 */,
    [55, 58, 60, 64] /* C7 (3-7-9 over G bass region) */,
    [53, 57, 60, 64] /* Fmaj7 */,
  ];
  const notes: PhraseNote[] = [];
  for (const [barIndex, chord] of chords.entries()) {
    const realized = assignableChord(chord, low, high, algorithmId);
    for (const [voiceIndex, pitch] of realized.entries()) {
      notes.push({
        midiPitch: pitch,
        velocity: 78 + voiceIndex * 4,
        startSeconds: barIndex * 2,
        gateSeconds: 1.85,
      });
    }
  }
  const line = [65, 62, 58, 55, 60, 64, 67, 64, 65, 69, 72, 69];
  const lineVelocities = [64, 72, 84, 96, 108, 96, 84, 76, 90, 100, 110, 70];
  for (const [index, pitch] of line.entries()) {
    notes.push({
      midiPitch: fold(pitch),
      velocity: lineVelocities[index] ?? 84,
      startSeconds: 6 + index * 0.5,
      gateSeconds: 0.45,
    });
  }
  return notes;
}

function mixInto(
  buffer: Float64Array,
  channelOffset: number,
  samples: Float32Array,
  startFrame: number,
  gain: number,
): void {
  for (let index = 0; index < samples.length; index += 1) {
    const frame = startFrame + index;
    const slot = frame * 2 + channelOffset;
    if (slot >= buffer.length) break;
    buffer[slot] = (buffer[slot] ?? 0) + (samples[index] ?? 0) * gain;
  }
}

function encodeWav(interleaved: Float64Array): Uint8Array {
  let peak = 0;
  for (const value of interleaved) {
    const magnitude = Math.abs(value);
    if (magnitude > peak) peak = magnitude;
  }
  const gain = peak > 0 ? TARGET_PEAK / peak : 1;
  const dataBytes = interleaved.length * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const writeAscii = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      bytes[offset + index] = text.charCodeAt(index);
    }
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, SAMPLE_RATE_HZ, true);
  view.setUint32(28, SAMPLE_RATE_HZ * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let index = 0; index < interleaved.length; index += 1) {
    const scaled = Math.max(
      -1,
      Math.min(1, (interleaved[index] ?? 0) * gain),
    );
    view.setInt16(44 + index * 2, Math.round(scaled * 32_767), true);
  }
  return bytes;
}

type NoteRenderFunction = (
  midiPitch: number,
  velocity: number,
  gateSeconds: number,
) => RenderedNotePcm | null;

type ChordRenderFunction = (
  midiPitches: readonly number[],
  velocities: readonly number[],
  gateSeconds: number,
) => Promise<RenderedNotePcm | null>;

async function renderPhrase(
  phrase: readonly PhraseNote[],
  renderNote: NoteRenderFunction,
  renderChord?: ChordRenderFunction,
): Promise<Readonly<{ interleaved: Float64Array; refusals: number }>> {
  const endSeconds =
    Math.max(
      ...phrase.map((note) => note.startSeconds + note.gateSeconds),
    ) + 2;
  const frameCount = Math.ceil(endSeconds * SAMPLE_RATE_HZ);
  const interleaved = new Float64Array(frameCount * 2);
  let refusals = 0;
  const groups = new Map<string, PhraseNote[]>();
  for (const note of phrase) {
    const key = `${note.startSeconds.toString()}:${note.gateSeconds.toString()}`;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [note]);
    else group.push(note);
  }
  for (const group of groups.values()) {
    if (group.length > 1 && renderChord !== undefined) {
      const pcm = await renderChord(
        group.map((note) => note.midiPitch),
        group.map((note) => note.velocity),
        group[0]?.gateSeconds ?? 0,
      );
      if (pcm === null) {
        refusals += group.length;
        continue;
      }
      const startFrame = Math.round((group[0]?.startSeconds ?? 0) * SAMPLE_RATE_HZ);
      mixInto(interleaved, 0, pcm.left, startFrame, 1);
      mixInto(interleaved, 1, pcm.right, startFrame, 1);
      continue;
    }
    for (const note of group) {
      const pcm = renderNote(note.midiPitch, note.velocity, note.gateSeconds);
      if (pcm === null) {
        refusals += 1;
        continue;
      }
      const startFrame = Math.round(note.startSeconds * SAMPLE_RATE_HZ);
      mixInto(interleaved, 0, pcm.left, startFrame, 1);
      mixInto(interleaved, 1, pcm.right, startFrame, 1);
    }
  }
  return { interleaved, refusals };
}

/** UIowa mf scale files per wind, with the exact chromatic midi runs. */
const UIOWA_SCALEWALKS = [
  {
    instrumentId: "clarinet",
    files: [
      { path: "test-results/winds-reference-source/uiowa/BbClar.mf.D3B3.aiff", lowMidi: 50 },
      { path: "test-results/winds-reference-source/uiowa/BbClar.mf.C5B5.aiff", lowMidi: 72 },
    ],
    walkMidis: [50, 52, 54, 55, 57, 59, 72, 74, 76, 77, 79, 81],
  },
  {
    instrumentId: "flute",
    files: [
      { path: "test-results/winds-reference-source/uiowa/Flute.nonvib.mf.C5B5.aiff", lowMidi: 72 },
    ],
    walkMidis: [72, 74, 76, 77, 79, 81, 83],
  },
] as const;

function buildScalewalkPhrase(walkMidis: readonly number[]): readonly PhraseNote[] {
  return walkMidis.map((midiPitch, index) => ({
    midiPitch,
    velocity: 72,
    startSeconds: index * 0.75,
    gateSeconds: 0.65,
  }));
}

async function main(): Promise<void> {
  const waveguides = await loadWaveguideRenderers();
  const concertGrand = await loadConcertGrandRenderer();
  await mkdir(resolve(OUTPUT_DIRECTORY), { recursive: true });
  const manifestFiles: Array<
    Readonly<{ file: string; sha256: string; refusals: number; kind: string }>
  > = [];

  const writePack = async (
    fileName: string,
    kind: string,
    interleaved: Float64Array,
    refusals: number,
  ): Promise<void> => {
    const wav = encodeWav(interleaved);
    const outputPath = resolve(OUTPUT_DIRECTORY, fileName);
    await writeFile(outputPath, wav);
    manifestFiles.push({
      file: fileName,
      sha256: sha256Hex(wav),
      refusals,
      kind,
    });
    process.stdout.write(
      `${fileName} (${(wav.length / 1_048_576).toFixed(1)} MB, ${String(refusals)} refusal(s))\n`,
    );
  };

  for (const recipe of AUDIO_INSTRUMENT_RECIPES) {
    if (recipe.synthesis !== "rendered") continue;
    const algorithmId = recipe.renderer.algorithmId;
    const waveguide = waveguides.get(algorithmId);
    /* Constructed once per instrument: building a sampled renderer decodes
     * its full PCM payload, which must never happen per note. */
    const sampled = algorithmId.startsWith("changes.dsp.sampled-")
      ? loadSampledInstrumentRenderer(algorithmId)
      : null;
    const renderNote: NoteRenderFunction = (midiPitch, velocity, gateSeconds) => {
      const maxSeconds = Math.min(
        recipe.renderer.maximumRenderSeconds,
        gateSeconds + 2,
      );
      if (algorithmId === "changes.dsp.concert-grand@1") {
        return concertGrand.renderNote(midiPitch, velocity, SAMPLE_RATE_HZ, maxSeconds);
      }
      if (sampled !== null) {
        return sampled.renderNote(midiPitch, velocity, SAMPLE_RATE_HZ, maxSeconds);
      }
      return waveguide?.renderNote(midiPitch, velocity, SAMPLE_RATE_HZ, maxSeconds) ?? null;
    };
    const renderChord: ChordRenderFunction | undefined = algorithmId.startsWith(
      "changes.dsp.plucked-",
    )
      ? async (midiPitches, velocities, gateSeconds) => {
          if (waveguide?.renderChordCooperatively === undefined) return null;
          return waveguide.renderChordCooperatively(
            midiPitches,
            velocities,
            SAMPLE_RATE_HZ,
            Math.min(recipe.renderer.maximumRenderSeconds, gateSeconds + 2),
          );
        }
      : undefined;

    const window =
      AUDIO_PLAYABLE_MIDI_WINDOWS[
        recipe.id as keyof typeof AUDIO_PLAYABLE_MIDI_WINDOWS
      ];
    const phrase = buildPhrase(window.low, window.high, algorithmId);
    const { interleaved, refusals } = await renderPhrase(
      phrase,
      renderNote,
      renderChord,
    );
    await writePack(`${recipe.id}.current.wav`, "phrase-current", interleaved, refusals);

    const scalewalk = UIOWA_SCALEWALKS.find(
      (entry) => entry.instrumentId === recipe.id,
    );
    if (scalewalk !== undefined) {
      const walkPhrase = buildScalewalkPhrase(scalewalk.walkMidis);
      const currentWalk = await renderPhrase(walkPhrase, renderNote);
      await writePack(
        `${recipe.id}.scalewalk.current.wav`,
        "scalewalk-current",
        currentWalk.interleaved,
        currentWalk.refusals,
      );

      /* Reference leg: exact corpus notes placed on the same schedule. */
      const segmentsByMidi = new Map<number, MonoPcm>();
      for (const file of scalewalk.files) {
        const pcm = readAiffMono(new Uint8Array(await readFile(resolve(file.path))));
        for (const [index, segment] of splitChromaticScale(pcm).entries()) {
          segmentsByMidi.set(file.lowMidi + index, segment);
        }
      }
      const referenceRender: NoteRenderFunction = (midiPitch, _velocity, gateSeconds) => {
        const segment = segmentsByMidi.get(midiPitch);
        if (segment === undefined) return null;
        const frameCount = Math.min(
          segment.samples.length,
          Math.ceil((gateSeconds + 0.4) * segment.sampleRateHz),
        );
        /* The corpus is 44.1 kHz mono; reuse it on both channels. */
        const samples = new Float32Array(segment.samples.subarray(0, frameCount));
        return {
          sampleRateHz: segment.sampleRateHz,
          frameCount,
          left: samples,
          right: samples,
        };
      };
      const referenceWalk = await renderPhrase(walkPhrase, referenceRender);
      await writePack(
        `${recipe.id}.scalewalk.reference-uiowa.wav`,
        "scalewalk-reference",
        referenceWalk.interleaved,
        referenceWalk.refusals,
      );
    }
  }

  const totalRefusals = manifestFiles.reduce(
    (sum, entry) => sum + entry.refusals,
    0,
  );
  const manifest = {
    schema: "changes.evidence.character-ab.v2",
    generatedBy: "scripts/render-character-ab.ts",
    wasmSha256: CONCERT_GRAND_WASM_SHA256,
    sampleRateHz: SAMPLE_RATE_HZ,
    peakNormalizedTo: "-3 dBFS per file (level differences are not character evidence)",
    files: manifestFiles,
    totalRefusals,
    noClaim:
      "Listening packs for the owner's ears. Nothing here is scored, gated, or claims quality.",
  };
  await writeFile(
    resolve(OUTPUT_DIRECTORY, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
  process.stdout.write(
    `character-ab pack: ${String(manifestFiles.length)} files under ${OUTPUT_DIRECTORY}/\n`,
  );
  if (totalRefusals > 0) {
    throw new Error(
      `CHARACTER_AB_RENDER_REFUSED: ${String(totalRefusals)} scheduled voice(s) were absent`,
    );
  }
}

await main();
