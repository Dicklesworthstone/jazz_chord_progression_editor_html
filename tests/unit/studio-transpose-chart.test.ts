/**
 * Whole-chart transposition through the real controller and A0's `transpose`
 * command (jcpe-h1-spelled-transposition-core-uxtu, jcpe-transpose-workflow-nazh).
 *
 * Expectations are hand-derived from letter + semitone arithmetic. The
 * controller path proves one revision-bound Undo step, key movement and exact
 * restoration; the pure path proves Manual notes move exactly (order and
 * duplicates kept) and that unspellable results refuse without changing
 * anything.
 */
import { describe, expect, test } from "bun:test";

import { transposeChart, transposeSpelledPitchExact } from "../../src/application/chart-transposition";
import { compileStudioPlaybackPlan } from "../../src/application/studio-playback";
import { validateDocumentSemantics } from "../../src/application/document-validation";
import { createStudioController } from "../../src/application/runtime";
import type { StudioController } from "../../src/application/runtime";
import { decodeDocumentShape, type SpelledPitch } from "../../src/domain";
import { makeSpelledInterval } from "../../src/theory";
import { musicalDocument } from "../support/studio-voice-leading";

function freshController(): StudioController {
  const creation = createStudioController();
  if (!creation.ok) throw new Error(`controller refused: ${creation.refusal.code}`);
  return creation.controller;
}

function insert(controller: StudioController, text: string, target: Parameters<StudioController["setQuickEntryDraft"]>[1]): void {
  const preview = controller.previewChartText(text);
  if (preview.status !== "ready") throw new Error(`does not parse: ${text}`);
  const drafted = controller.setQuickEntryDraft(text, target, preview.status, preview.issueCodes);
  if (!drafted.ok) throw new Error(`draft refused: ${drafted.refusal.code}`);
  const applied = controller.applyQuickEntryPreview();
  if (!applied.ok) throw new Error(`insert refused: ${applied.refusal.code}`);
}

function seeded(): StudioController {
  const controller = freshController();
  const snapshot = controller.getSnapshot();
  insert(controller, "| Dm7 G7 |", { kind: "measure-start", measureId: snapshot.sections[0]?.measures[0]?.id ?? "" });
  insert(controller, "| C6/9/E | Ab7/C | D♭maj7 |", { kind: "section-end", sectionId: snapshot.sections[0]?.id ?? "" });
  const keyed = controller.setKey({ step: "C", alter: 0, mode: "major" });
  if (!keyed.ok) throw new Error(keyed.refusal.code);
  return controller;
}

function symbols(controller: StudioController): string {
  return controller.getSnapshot().sections
    .flatMap((section) => section.measures.flatMap((measure) => measure.events.map((event) => event.symbolText)))
    .join(" ");
}

describe("Transpose chart through the controller", () => {
  test("up a major 2nd moves every chord and the key as one Undo step", () => {
    const controller = seeded();
    const revision = controller.getSnapshot().revision;
    const preview = controller.previewTransposeChart("M2", "up");
    expect(preview).toEqual({
      ok: true, keyBefore: "C major", keyAfter: "D major", changedChordCount: 5,
      examples: [
        { before: "Dm7", after: "Em7" }, { before: "G7", after: "A7" },
        { before: "C6/9/E", after: "D6/9/F#" }, { before: "Ab7/C", after: "Bb7/D" },
        { before: "D♭maj7", after: "E♭maj7" },
      ],
    });
    /* Preview changes nothing. */
    expect(controller.getSnapshot().revision).toBe(revision);

    const applied = controller.transposeChart("M2", "up");
    expect(applied.ok).toBe(true);
    expect(symbols(controller)).toBe("Em7 A7 D6/9/F# Bb7/D E♭maj7");
    expect(controller.getSnapshot().keyLabel).toContain("D");
    expect(controller.getSnapshot().revision).toBe(revision + 1);
    expect(controller.getSnapshot().history.undoLabel).toBe("Transpose up M2");

    expect(controller.undo().ok).toBe(true);
    expect(symbols(controller)).toBe("Dm7 G7 C6/9/E Ab7/C D♭maj7");
    expect(controller.getSnapshot().keyLabel).toContain("C");
  });

  test("down then up the same interval restores every spelling exactly", () => {
    const controller = seeded();
    const before = symbols(controller);
    expect(controller.transposeChart("P4", "down").ok).toBe(true);
    expect(symbols(controller)).toBe("Am7 D7 G6/9/B Eb7/G A♭maj7");
    expect(controller.transposeChart("P4", "up").ok).toBe(true);
    expect(symbols(controller)).toBe(before);
  });

  test("an interval outside the offered list refuses and changes nothing", () => {
    const controller = seeded();
    const before = controller.getSnapshot();
    const refused = controller.transposeChart("P9" as never, "up");
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.refusal.code).toBe("u1.transpose_interval_unknown");
    expect(controller.getSnapshot().revision).toBe(before.revision);
    expect(symbols(controller)).toBe("Dm7 G7 C6/9/E Ab7/C D♭maj7");
  });
});

describe("Pure chart transposition", () => {
  const pitch = (step: string, alter: number, octave: number) => ({ step, alter, octave }) as SpelledPitch;

  test("registered pitches move exactly, carrying the octave by letter", () => {
    const m2 = makeSpelledInterval(2, "minor", "up");
    expect(transposeSpelledPitchExact(pitch("B", 1, 3), m2)).toEqual(pitch("C", 1, 4));
    expect(transposeSpelledPitchExact(pitch("E", 0, 4), m2)).toEqual(pitch("F", 0, 4));
    expect(transposeSpelledPitchExact(pitch("C", -1, 4), makeSpelledInterval(2, "major", "down"))).toEqual(pitch("B", -2, 3));
    /* G9 (MIDI 127) up a semitone leaves MIDI: refuse, never wrap. */
    expect(transposeSpelledPitchExact(pitch("G", 0, 9), m2)).toBeNull();
  });

  test("Manual notes keep their order and duplicate unisons, and the result still plays", () => {
    const manual = {
      mode: "manual",
      pitches: [pitch("D", 0, 3), pitch("A", 0, 3), pitch("C", 0, 4), pitch("F", 0, 4), pitch("F", 0, 4)],
      bassPolicy: "included",
    };
    const document = musicalDocument([["Cmaj7"], ["Dm7"]], manual);
    const result = transposeChart(document, makeSpelledInterval(3, "minor", "up"));
    if (!result.ok) throw new Error(JSON.stringify(result.refusals));
    const moved = result.candidate.sections[0]?.measures[1]?.events[0];
    expect(moved?.chord.sourceText).toBe("Fm7");
    expect(moved?.voicing.mode === "manual" ? moved.voicing.pitches : null).toEqual([
      pitch("F", 0, 3), pitch("C", 0, 4), pitch("E", -1, 4), pitch("A", -1, 4), pitch("A", -1, 4),
    ]);
    /* The candidate passes the real validator and compiles to sound. */
    const shape = decodeDocumentShape(result.candidate);
    if (!shape.ok) throw new Error(JSON.stringify(shape.errors));
    const validated = validateDocumentSemantics(shape.value);
    if (!validated.ok) throw new Error(JSON.stringify(validated.errors));
    const compiled = compileStudioPlaybackPlan(validated.value);
    expect(compiled.ok).toBe(true);
  });

  test("an unspellable chord refuses the whole chart and names it", () => {
    /* F𝄫 down an augmented 4th: the letter moves F→C and the sounding pitch
     * is A, which as a C needs a triple flat. */
    const document = musicalDocument([["Dm7"], ["Fbbmaj7"]]);
    const result = transposeChart(document, makeSpelledInterval(4, "augmented", "down"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusals).toEqual([
        { eventId: result.refusals[0]?.eventId ?? null, sourceText: "Fbbmaj7", reason: "spelling-overflow" },
      ]);
    }
  });
});
