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
  } {
    const audio = createStudioAudio(createFakeAudioPlatform().platform);
    const creation = createStudioController({ audio });
    if (!creation.ok) throw new Error("controller refused");
    return { controller: creation.controller, audio };
  }

  test("refuses without an audio port, on empty sets, and past ten pitches", () => {
    const creation = createStudioController({});
    if (!creation.ok) throw new Error("controller refused");
    expect(creation.controller.previewPitches([60, 64, 67], GESTURE).ok).toBe(
      false,
    );
    const { controller } = audibleStudio();
    expect(controller.previewPitches([], GESTURE).ok).toBe(false);
    expect(
      controller.previewPitches(
        [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50],
        GESTURE,
      ).ok,
    ).toBe(false);
    expect(controller.previewPitches([60, 200], GESTURE).ok).toBe(false);
  });

  test("sounds a voiced set through the preview lane without touching state", async () => {
    const { controller, audio } = audibleStudio();
    const before = controller.getSnapshot();
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
    const after = controller.getSnapshot();
    expect(after.revision).toBe(before.revision);
    expect(after.transport.status).toBe(before.transport.status);
  });
});
