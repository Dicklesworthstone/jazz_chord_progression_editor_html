/**
 * September idea 13 for one chord: other chords under the same sounding bass
 * and top notes. Expectations are hand-derived: Cmaj7 voiced C3 E4 G4 B4 keeps
 * C3 and B4 exactly (as written, never C-flat), a candidate that sounds the
 * same notes is not a change of harmony, and Use stores exactly the notes
 * shown as one Undo step.
 */
import { describe, expect, test } from "bun:test";

import { bassTopAlternatives, buildBassTopAlternative, type SoundingNote } from "../../src/application/chart-bass-top-alternatives";
import { createStudioAudio } from "../../src/application/studio-audio";
import { validateDocumentSemantics } from "../../src/application/document-validation";
import { createStudioController, type StudioController } from "../../src/application/runtime";
import { decodeDocumentShape, type SpelledPitch } from "../../src/domain";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";
import { musicalDocument } from "../support/studio-voice-leading";

const GESTURE = Object.freeze({ kind: "trusted-pointer", trusted: true, sequence: 1 } as const);
const note = (midi: number, step: "C" | "D" | "E" | "F" | "G" | "A" | "B", alter = 0): SoundingNote =>
  ({ midi, pitch: { step, alter } }) as SoundingNote;
const NATURAL: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midiOf = (pitch: SpelledPitch) => (pitch.octave + 1) * 12 + (NATURAL[pitch.step] ?? 0) + pitch.alter;
const CMAJ7 = [note(48, "C"), note(64, "E"), note(67, "G"), note(71, "B")];

describe("same bass and top alternatives", () => {
  test("every alternative keeps the exact written bass C3 and top B4", () => {
    const found = bassTopAlternatives(CMAJ7, "Cmaj7");
    expect(found.length).toBeGreaterThan(0);
    for (const alternative of found) {
      const low = alternative.pitches[0];
      const high = alternative.pitches[alternative.pitches.length - 1];
      expect({ symbol: alternative.symbol, low, high }).toEqual({
        symbol: alternative.symbol, low: { step: "C", alter: 0, octave: 3 }, high: { step: "B", alter: 0, octave: 4 },
      });
      // Inner notes lie strictly between, ascending.
      const midis = alternative.pitches.map(midiOf);
      expect(midis).toEqual([...midis].sort((a, b) => a - b));
      expect(midis.slice(1, -1).every((midi) => midi > 48 && midi < 71)).toBe(true);
    }
    // Hand-derived: the parallel minor-major keeps C and B with E-flat inside.
    expect(found.find((row) => row.symbol === "Cm(maj7)")?.voicingText).toBe("C3 E♭4 G4 B4");
  });

  test("a colour that finds no inner voice is not offered as new harmony", () => {
    // G7 voiced G2 F3 B3 D4: G13/G9 would sound these same four notes.
    const found = bassTopAlternatives([note(43, "G"), note(53, "F"), note(59, "B"), note(62, "D")], "G7");
    for (const alternative of found) {
      const sounded = new Set(alternative.pitches.map((pitch) => midiOf(pitch) % 12));
      expect([...sounded].sort((a, b) => a - b)).not.toEqual([2, 5, 7, 11]);
    }
    expect(found.map((row) => row.symbol)).not.toContain("G13");
  });

  test("ranking follows the two measured facts only", () => {
    const found = bassTopAlternatives(CMAJ7, "Cmaj7");
    for (let index = 1; index < found.length; index += 1) {
      const previous = found[index - 1];
      const current = found[index];
      if (previous === undefined || current === undefined) continue;
      expect(previous.sharedTones > current.sharedTones ||
        (previous.sharedTones === current.sharedTones && previous.innerMovement <= current.innerMovement)).toBe(true);
    }
  });

  test("each alternative is a valid stored voicing of its chord", () => {
    const document = musicalDocument([["Cmaj7"]]);
    const event = document.sections[0]?.measures[0]?.events[0];
    if (event === undefined) throw new Error("event");
    for (const alternative of bassTopAlternatives(CMAJ7, "Cmaj7")) {
      const shape = decodeDocumentShape(buildBassTopAlternative(document, event.id, alternative));
      if (!shape.ok) throw new Error(`${alternative.symbol} shape`);
      const valid = validateDocumentSemantics(shape.value);
      expect({ symbol: alternative.symbol, ok: valid.ok }).toEqual({ symbol: alternative.symbol, ok: true });
    }
  });
});

describe("through the controller", () => {
  test("Use stores exactly the notes shown as one Undo step; Hear changes nothing", async () => {
    const creation = createStudioController({ audio: createStudioAudio(createFakeAudioPlatform().platform) });
    if (!creation.ok) throw new Error(creation.refusal.code);
    const controller: StudioController = creation.controller;
    const preview = controller.previewChartText("| Dm7 | G7 | Cmaj7 |");
    const target = { kind: "measure-start", measureId: controller.getSnapshot().sections[0]?.measures[0]?.id ?? "" } as const;
    if (!controller.setQuickEntryDraft("| Dm7 |", target, controller.previewChartText("| Dm7 |").status, preview.issueCodes).ok) throw new Error("draft");
    if (!controller.applyQuickEntryPreview().ok) throw new Error("insert");
    const eventId = controller.getSnapshot().sections[0]?.measures[0]?.events[0]?.id ?? "";
    const options = controller.readBassTopAlternatives(eventId);
    const first = options[0];
    if (first === undefined) throw new Error("no alternatives for Dm7");
    const before = controller.getSnapshot();
    const heard = await controller.hearBassTopAlternative(eventId, first.symbol, GESTURE);
    expect(heard.ok ? "ok" : heard.message).toBe("ok");
    expect(controller.getSnapshot().revision).toBe(before.revision);
    const applied = controller.applyBassTopAlternative(eventId, first.symbol);
    expect(applied.ok ? "ok" : applied.refusal.code).toBe("ok");
    const after = controller.getSnapshot();
    expect(after.revision).toBe(before.revision + 1);
    expect(after.sections[0]?.measures[0]?.events[0]?.symbolText).toBe(first.symbol);
    // The stored notes are exactly the ones the option displayed.
    const inspector = controller.readInspector(eventId);
    const voicing = inspector.ok ? inspector.value.event.voicing : null;
    expect(voicing?.mode).toBe("manual");
    expect(voicing !== null && voicing.mode !== "auto" ? voicing.pitches : null).toEqual(first.pitches);
    expect(controller.undo().ok).toBe(true);
    expect(controller.getSnapshot().sections[0]?.measures[0]?.events[0]?.symbolText).toBe("Dm7");
    // An alternative that is not on the list refuses and changes nothing.
    const refused = controller.applyBassTopAlternative(eventId, "Xyz");
    expect(refused.ok).toBe(false);
  }, 60_000);
});
