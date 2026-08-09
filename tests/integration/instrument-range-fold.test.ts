/**
 * Engine-side proof of the instrument-range octave-fold policy
 * (jcpe-instrument-range-fold-policy-s1uz, RC1+RC3 remediation).
 *
 * The 2026-08-07 live breakage class: the shared instrument-agnostic chart
 * plan hands every instrument pitches outside its playable window. The
 * engine must fold those pitches into the window at voice intake — attack
 * AND prepare through one authority — so no chart pitch can refuse a
 * command, prepare warms exactly what attacks render, and MIDI export
 * never sees the fold.
 *
 * Planted-negative provenance (executed 2026-08-07, recorded in the bead):
 * with the foldAttackRequestVoices call removed from attackAudioVoices,
 * the "every active voice sits inside the window" assertion below fails at
 * flute midiPitch 45 (received 45, expected >= 60); restored, green.
 *
 * No-Claim: this certifies pitch realization plumbing, not the sound
 * quality of folded registers, and stored documents are out of scope by
 * construction (the fold lives at engine intake; the document layer never
 * imports it — asserted below).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  AUDIO_PLAYABLE_MIDI_WINDOWS,
  foldMidiPitchIntoWindow,
} from "../../src/audio/instrument-recipes-contract";
import type { InstrumentId } from "../../src/domain";
import {
  attackRequest,
  midi,
  readyEngine,
  requireSuccess,
  voice,
} from "../support/audio-engine-test-kit";

/* The exact voicing registers that broke production (bead evidence). */
const HOSTILE_PITCHES = [45, 47, 48, 53, 96, 33] as const;

const INSTRUMENTS: readonly (keyof typeof AUDIO_PLAYABLE_MIDI_WINDOWS 
  )[] = [
  "flute",
  "guitar",
  "blues-guitar",
  "dreadnought-guitar",
  "ukulele",
  "clarinet",
  "upright-bass",
  "concert-vibes",
  "concert-grand",
] as const;

const PLUCKED_INSTRUMENTS = new Set<InstrumentId>([
  "guitar",
  "blues-guitar",
  "dreadnought-guitar",
  "ukulele",
  /* The physical upright bass (plucked-upright-bass@1) replaced the sampled
   * contrabass: cache-only attack, so hostile voicings prepare in pairs
   * like the rest of the plucked family. */
  "upright-bass",
]);

function pairs<Value>(values: readonly Value[]): readonly (readonly Value[])[] {
  const result: Value[][] = [];
  for (let index = 0; index < values.length; index += 2) {
    result.push(values.slice(index, index + 2));
  }
  return Object.freeze(result.map((group) => Object.freeze(group)));
}

describe("attack intake folds every chart pitch into the instrument window", () => {
  for (const instrumentId of INSTRUMENTS) {
    test(`${instrumentId}: hostile chart voicing attacks without refusal, in-window`, async () => {
      const { engine, fake } = await readyEngine();
      const window = AUDIO_PLAYABLE_MIDI_WINDOWS[instrumentId];
      const physicalGroups = PLUCKED_INSTRUMENTS.has(instrumentId)
        ? pairs(HOSTILE_PITCHES)
        : [HOSTILE_PITCHES];
      if (PLUCKED_INSTRUMENTS.has(instrumentId)) {
        for (const group of physicalGroups) {
          requireSuccess(await engine.prepareRenderedAudioVoices({
            instrumentId,
            notes: group.map((pitch) => ({
              midiPitch: midi(pitch),
              velocity: 100,
              gateSeconds: 0.55,
            })),
          }));
        }
      }
      const buffersAfterPrepare = fake.events.filter(
        ({ kind }) => kind === "buffer-create",
      ).length;
      const startsAfterPrepare = fake.events.filter(
        ({ kind }) => kind === "source-start",
      ).length;
      let voiceOrdinal = 0;
      for (let groupIndex = 0; groupIndex < physicalGroups.length; groupIndex += 1) {
        const group = physicalGroups[groupIndex];
        if (group === undefined) continue;
        const request = attackRequest(
          group.map((pitch) => {
            const spec = voice(`hostile-${String(voiceOrdinal)}`, pitch, 100);
            voiceOrdinal += 1;
            return spec;
          }),
          {
            eventId: `range-fold-${instrumentId}-${String(groupIndex)}`,
            instrumentId,
            startTimeSeconds: 0.05,
            releaseTimeSeconds: 0.6,
          },
        );
        requireSuccess(engine.attackAudioVoices(request));
      }
      if (PLUCKED_INSTRUMENTS.has(instrumentId)) {
        expect(fake.events.filter(
          ({ kind }) => kind === "buffer-create",
        )).toHaveLength(buffersAfterPrepare);
        expect(
          fake.events.filter(({ kind }) => kind === "source-start").length -
            startsAfterPrepare,
        ).toBe(physicalGroups.length);
      }
      const snapshot = engine.inspectAudioEngine();
      const active = snapshot.activeVoices.filter(
        (voiceSnapshot) => voiceSnapshot.instrumentId === instrumentId,
      );
      expect(active.length).toBe(HOSTILE_PITCHES.length);
      for (const voiceSnapshot of active) {
        expect(voiceSnapshot.midiPitch).toBeGreaterThanOrEqual(window.low);
        expect(voiceSnapshot.midiPitch).toBeLessThanOrEqual(window.high);
      }
      /* Deterministic: the realized pitch is the fold function's output. */
      const realized = [...active]
        .sort((a, b) => a.voiceId.localeCompare(b.voiceId))
        .map((voiceSnapshot) => voiceSnapshot.midiPitch);
      const expected = HOSTILE_PITCHES.map((pitch) =>
        midi(foldMidiPitchIntoWindow(pitch, window)),
      );
      expect(realized).toEqual(expected);
    });
  }
});

describe("prepare warms exactly the pitches attacks render", () => {
  test("flute: prepare(45) then attack(45) is a cache hit at the folded pitch", async () => {
    const { engine, fake } = await readyEngine();
    requireSuccess(
      await engine.prepareRenderedAudioVoices({
        instrumentId: "flute",
        notes: [{ midiPitch: midi(45), velocity: 100, gateSeconds: 0.55 }],
      }),
    );
    const buffersAfterPrepare = fake.events.filter(
      ({ kind }) => kind === "buffer-create",
    ).length;
    requireSuccess(
      engine.attackAudioVoices(
        attackRequest([voice("warmed", 45, 100)], {
          instrumentId: "flute" as InstrumentId,
          startTimeSeconds: 0.05,
          releaseTimeSeconds: 0.6,
        }),
      ),
    );
    const buffersAfterAttack = fake.events.filter(
      ({ kind }) => kind === "buffer-create",
    ).length;
    /*
     * The attack must reuse the prepared buffer: identical fold, identical
     * cache identity. A second render here is the RC1 warmed-wrong-bucket
     * class resurrected.
     */
    expect(buffersAfterAttack).toBe(buffersAfterPrepare);
  });
});

describe("the document and export layers never consume the fold", () => {
  test("no module outside src/audio imports the fold authority", () => {
    const forbiddenImporters = [
      "src/export/midi-export.ts",
      "src/domain/pitch.ts",
      "src/application/document-validation.ts",
    ];
    for (const path of forbiddenImporters) {
      const source = readFileSync(path, "utf8");
      expect(source.includes("foldMidiPitchIntoWindow")).toBe(false);
      expect(source.includes("AUDIO_PLAYABLE_MIDI_WINDOWS")).toBe(false);
    }
  });
});
