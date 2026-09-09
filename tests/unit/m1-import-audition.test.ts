/**
 * M1 pre-Add audition (jcpe-qyyn slice 2).
 *
 * The audition is a bounded, deterministic series of click-previews: the
 * file's OWN sounding pitches per written span, timed at the file's own
 * tempo, sounded through the existing preview lane. These tests prove the
 * derivation laws over the real service and decoder, and the
 * previewPitches lane over the real controller and fake audio platform.
 * Expectations are computed from the constructed file, never read back
 * from production.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  createStudioController,
  type StudioController,
} from "../../src/application/runtime";
import {
  auditionMidiImportPreview,
  createStudioMidiImport,
  MAX_MIDI_IMPORT_AUDITION_STEPS,
} from "../../src/application/studio-midi-import";
import {
  createStudioAudio,
  type StudioAudioPort,
} from "../../src/application/studio-audio";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";
import { batchChordFile } from "../support/midi-batch-fixtures";
import { realDecodeFrame } from "../support/midi-import-test-kit";

setDefaultTimeout(120_000);

const GESTURE = Object.freeze({
  kind: "trusted-pointer",
  trusted: true,
  sequence: 1,
} as const);

function service() {
  return createStudioMidiImport(realDecodeFrame);
}

/* Independent SMF builder (mirrors the integration suite's). */
function vlq(value: number): number[] {
  const bytes = [value & 0x7f];
  let rest = value >>> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>>= 7;
  }
  return bytes;
}
function u32(value: number): number[] {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}
function smf(events: readonly number[]): Uint8Array {
  return Uint8Array.from([
    0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 0, 0, 1, 0x01, 0xe0,
    0x4d, 0x54, 0x72, 0x6b, ...u32(events.length), ...events,
  ]);
}
const EOT = [...vlq(0), 0xff, 0x2f, 0x00];
const on = (delta: number, key: number) => [...vlq(delta), 0x90, key, 96];
const off = (delta: number, key: number) => [...vlq(delta), 0x80, key, 0];
const tempoMeta = (delta: number, microseconds: number) => [
  ...vlq(delta), 0xff, 0x51, 0x03,
  (microseconds >>> 16) & 0xff,
  (microseconds >>> 8) & 0xff,
  microseconds & 0xff,
];

const CMAJ7 = [48, 60, 64, 67, 71];
const FMIN7 = [41, 53, 56, 60, 63];
const G7 = [43, 55, 59, 62, 65];

/** 120 BPM, three whole-bar chords at 480 ppq (bar = 1920 ticks = 2000 ms). */
function threeBarFile(): Uint8Array {
  const events: number[] = [...tempoMeta(0, 500_000)];
  for (const chord of [CMAJ7, FMIN7, G7]) {
    for (const key of chord) events.push(...on(0, key));
    for (const [index, key] of chord.entries()) {
      events.push(...off(index === 0 ? 1920 : 0, key));
    }
  }
  return smf([...events, ...EOT]);
}

describe("audition derivation", () => {
  test("plays the file's own pitches per bar at the file's tempo, in order", async () => {
    const preview = await service().readFile("three.mid", threeBarFile());
    expect(preview.automation).not.toBeNull();
    const steps = auditionMidiImportPreview(preview);
    expect(steps.length).toBe(3);
    expect(steps.map((step) => step.atMs)).toEqual([0, 2_000, 4_000]);
    expect(steps[0]?.midiPitches).toEqual(CMAJ7);
    expect(steps[1]?.midiPitches).toEqual(FMIN7);
    expect(steps[2]?.midiPitches).toEqual(G7);
  });

  test("track exclusions govern audition across all transpositions and can be undone", async () => {
    for (let transpose = 0; transpose < 12; transpose += 1) {
      const bytes = Uint8Array.from([
        77, 84, 104, 100, 0, 0, 0, 6, 0, 1, 0, 2, 1, 224,
        ...batchChordFile({ transpose }).slice(14),
        ...batchChordFile({ transpose: transpose + 12, channel: 1, omitTempo: true }).slice(14),
      ]);
      const importer = service();
      const original = await importer.readFile("two-octaves.mid", bytes);
      const lower = [60, 64, 67, 71].map((pitch) => pitch + transpose);
      const both = [...lower, ...lower.map((pitch) => pitch + 12)];
      expect(auditionMidiImportPreview(original)[0]?.midiPitches).toEqual(both);
      const replan = (excludedTrackIndices: readonly number[]) =>
        importer.replanWithOverrides(original, {
          excludedTrackIndices, alternativeChoices: [], grooveStyleId: null,
        });
      const excluded = replan([1, 1, -1, 2, 0.5]);
      expect(excluded.automation?.excludedTrackIndices).toEqual([1]);
      expect(Object.isFrozen(excluded.automation?.excludedTrackIndices)).toBe(true);
      expect(excluded.automation?.classifications).toEqual(original.automation?.classifications);
      expect(excluded.decoded).toBe(original.decoded);
      expect(auditionMidiImportPreview(excluded)[0]?.midiPitches).toEqual(lower);
      expect(auditionMidiImportPreview(replan([1]))).toEqual(auditionMidiImportPreview(excluded));
      expect(auditionMidiImportPreview(replan([0]))[0]?.midiPitches).toEqual(lower.map((pitch) => pitch + 12));
      expect(auditionMidiImportPreview(replan([0, 1]))).toEqual([]);
      const restored = importer.replanWithOverrides(excluded, {
        excludedTrackIndices: [], alternativeChoices: [], grooveStyleId: null,
      });
      expect(auditionMidiImportPreview(restored)).toEqual(auditionMidiImportPreview(original));
    }
  });

  test("is deterministic and bounded", async () => {
    const events: number[] = [...tempoMeta(0, 500_000)];
    for (let bar = 0; bar < 20; bar += 1) {
      const chord = [CMAJ7, FMIN7, G7][bar % 3] ?? CMAJ7;
      for (const key of chord) events.push(...on(0, key));
      for (const [index, key] of chord.entries()) {
        events.push(...off(index === 0 ? 1920 : 0, key));
      }
    }
    const bytes = smf([...events, ...EOT]);
    const first = auditionMidiImportPreview(
      await service().readFile("long.mid", bytes),
    );
    const second = auditionMidiImportPreview(
      await service().readFile("long.mid", bytes),
    );
    expect(first.length).toBe(MAX_MIDI_IMPORT_AUDITION_STEPS);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  test("auditions nothing when no automation plan exists", async () => {
    const hostile = Uint8Array.from([0x4d, 0x54, 0x68, 0x63, 0, 0, 0, 6]);
    const preview = await service().readFile("broken.mid", hostile);
    expect(auditionMidiImportPreview(preview)).toEqual([]);
  });
});

describe("previewPitches lane", () => {
  function audibleStudio(): {
    controller: StudioController;
    audio: StudioAudioPort;
    starts: string[];
  } {
    const audio = createStudioAudio(createFakeAudioPlatform().platform);
    const starts: string[] = [];
    const port: StudioAudioPort = Object.freeze({
      ...audio,
      startPreview(...args: Parameters<StudioAudioPort["startPreview"]>) {
        starts.push(args[1]);
        return audio.startPreview(...args);
      },
    });
    const creation = createStudioController({ audio: port });
    if (!creation.ok) throw new Error("controller refused");
    return { controller: creation.controller, audio, starts };
  }

  test("refuses without an audio port, on empty sets, and past sixteen pitches", () => {
    const creation = createStudioController({});
    if (!creation.ok) throw new Error("controller refused");
    expect(creation.controller.previewPitches([60, 64, 67], GESTURE).ok).toBe(
      false,
    );
    const { controller } = audibleStudio();
    expect(controller.previewPitches([], GESTURE).ok).toBe(false);
    expect(
      controller.previewPitches(
        Array.from({ length: 17 }, (_, index) => 40 + index),
        GESTURE,
      ).ok,
    ).toBe(false);
    expect(controller.previewPitches([60, 200], GESTURE).ok).toBe(false);
  });

  test("cancel audition prevents initialization or preparation from sounding later", async () => {
    const { controller, audio, starts } = audibleStudio();
    const before = controller.getSnapshot();
    expect(controller.previewPitches(CMAJ7, GESTURE).ok).toBe(true);
    expect((await controller.releasePreviewPitches()).ok).toBe(true);
    // A newer preview is the success twin: initialization is shared and must
    // still finish, while the cancelled generation can never submit voices.
    expect(controller.previewPitch(72, GESTURE).ok).toBe(true);
    const deadline = Date.now() + 8_000;
    while (audio.inspect().engine.previewNonreleasingVoiceCount === 0 && Date.now() < deadline)
      await new Promise(resolve => setTimeout(resolve, 25));
    expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBe(1);
    expect(starts).toHaveLength(1);
    expect(starts[0]).not.toContain("audition-");
    // A stale audition cancellation cannot retire the newer keyboard preview.
    expect((await controller.releasePreviewPitches()).ok).toBe(true);
    expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBe(1);
    expect(controller.getSnapshot().revision).toBe(before.revision);
    controller.stopProgression();
  });

  test("cancel while exact instrument preparation is pending cannot submit a late preview", async () => {
    const audio = createStudioAudio(createFakeAudioPlatform().platform);
    let unblock: (() => void) | undefined;
    const preparation = { entered: false };
    const starts: string[] = [];
    const waiting = new Promise<void>(resolve => { unblock = resolve; });
    const port: StudioAudioPort = Object.freeze({
      ...audio,
      startPreview(...args: Parameters<StudioAudioPort["startPreview"]>) {
        starts.push(args[1]);
        return audio.startPreview(...args);
      },
      async prepareInstrument(...args: Parameters<StudioAudioPort["prepareInstrument"]>) {
        preparation.entered = true;
        await waiting;
        return audio.prepareInstrument(...args);
      },
    });
    const creation = createStudioController({ audio: port });
    if (!creation.ok) throw new Error("controller refused");
    const controller = creation.controller;
    expect(controller.previewPitches(CMAJ7, GESTURE).ok).toBe(true);
    const deadline = Date.now() + 8_000;
    while (!preparation.entered && Date.now() < deadline)
      await new Promise(resolve => setTimeout(resolve, 25));
    expect(preparation.entered).toBe(true);
    expect((await controller.releasePreviewPitches()).ok).toBe(true);
    unblock?.();
    // Queue a real replacement behind the released preparation. Its receipt
    // proves the cancelled request has drained, rather than relying on sleep.
    expect(controller.previewPitch(72, GESTURE).ok).toBe(true);
    while (audio.inspect().engine.previewNonreleasingVoiceCount === 0 && Date.now() < deadline)
      await new Promise(resolve => setTimeout(resolve, 25));
    expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBe(1);
    expect(starts).toHaveLength(1);
    expect(starts[0]).not.toContain("audition-");
    expect((await controller.releasePreviewPitches()).ok).toBe(true);
    expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBe(1);
    controller.stopProgression();
  });

  test("cancel retires the exact sounding audition and is idempotent", async () => {
    const { controller, audio } = audibleStudio();
    expect(controller.previewPitches(CMAJ7, GESTURE).ok).toBe(true);
    const deadline = Date.now() + 8_000;
    while (audio.inspect().engine.previewNonreleasingVoiceCount === 0 && Date.now() < deadline)
      await new Promise(resolve => setTimeout(resolve, 25));
    expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBe(CMAJ7.length);
    const before = controller.getSnapshot();
    expect((await controller.releasePreviewPitches()).ok).toBe(true);
    expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBe(0);
    expect((await controller.releasePreviewPitches()).ok).toBe(true);
    expect(controller.getSnapshot().revision).toBe(before.revision);
    expect(controller.getSnapshot().transport).toEqual(before.transport);
    controller.stopProgression();
  });

  test("sounds a voiced set through the preview lane without touching state", async () => {
    const { controller, audio } = audibleStudio();
    const cold = controller.getSnapshot();
    const result = controller.previewPitches(CMAJ7, GESTURE);
    expect(result.ok).toBe(true);
    const start = Date.now();
    const untilPreviewVoices = async (): Promise<number> => {
      for (;;) {
        const count = audio.inspect().engine.previewNonreleasingVoiceCount;
        if (count > 0 || Date.now() - start > 8_000) return count;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    };
    expect(await untilPreviewVoices()).toBeGreaterThan(0);
    // X1 §8 permits 1–16 pitches in a ready transport. First use also
    // initializes the graph; that readiness transition is not a progression.
    const before = controller.getSnapshot();
    expect(cold.transport.status).toBe("unavailable");
    expect(before.transport.status).toBe("ready");
    expect(before.revision).toBe(cold.revision);
    expect(controller.previewPitches(Array.from({ length: 16 }, (_, index) => 48 + index), GESTURE).ok).toBe(true);
    const after = controller.getSnapshot();
    expect(after.revision).toBe(before.revision);
    expect(after.transport.status).toBe(before.transport.status);
    expect(after.transport.playheadBeatLabel).toBe(before.transport.playheadBeatLabel);
    controller.stopProgression();
  });
});
