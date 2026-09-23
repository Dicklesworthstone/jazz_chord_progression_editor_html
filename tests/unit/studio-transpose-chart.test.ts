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

import { auditionExcerpt, intervalBetweenTonics, transposeChart, transposeSpelledPitchExact } from "../../src/application/chart-transposition";
import { createStudioAudio } from "../../src/application/studio-audio";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";
import { compileStudioPlaybackPlan } from "../../src/application/studio-playback";
import { validateDocumentSemantics } from "../../src/application/document-validation";
import { createStudioController } from "../../src/application/runtime";
import type { StudioController } from "../../src/application/runtime";
import { decodeDocumentShape, type SpelledPitch } from "../../src/domain";
import { makeSpelledInterval, transposeSpelledPitchClassExact } from "../../src/theory";
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
      ok: true, scope: "chart", selectedChordCount: 0, keyBefore: "C major", keyAfter: "D major", changedChordCount: 5,
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

describe("Transpose selected chords", () => {
  test("only the selected chords move, the key stays, and one Undo restores them", () => {
    const controller = seeded();
    const ids = controller.getSnapshot().sections.flatMap((section) => section.measures.flatMap((measure) => measure.events.map((event) => event.id)));
    expect(controller.selectEvent(ids[2] ?? "").ok).toBe(true);
    expect(controller.extendSelectionTo(ids[3] ?? "").ok).toBe(true);
    const preview = controller.previewTransposeChart("m3", "up", "selection");
    expect(preview).toMatchObject({ ok: true, scope: "selection", selectedChordCount: 2, changedChordCount: 2,
      examples: [{ before: "C6/9/E", after: "Eb6/9/G" }, { before: "Ab7/C", after: "Cb7/Eb" }] });
    const revision = controller.getSnapshot().revision;
    expect(controller.transposeChart("m3", "up", "selection").ok).toBe(true);
    /* Hand-derived: up a minor 3rd moves the letter two steps (C→E♭, A♭→C♭). */
    expect(symbols(controller)).toBe("Dm7 G7 Eb6/9/G Cb7/Eb D♭maj7");
    expect(controller.getSnapshot().keyLabel).toContain("C");
    expect(controller.getSnapshot().revision).toBe(revision + 1);
    expect(controller.getSnapshot().history.undoLabel).toBe("Transpose selection up m3");
    expect(controller.undo().ok).toBe(true);
    expect(symbols(controller)).toBe("Dm7 G7 C6/9/E Ab7/C D♭maj7");
  });

  test("selection scope with nothing selected refuses and changes nothing", () => {
    const controller = seeded();
    expect(controller.clearSelection().ok).toBe(true);
    const revision = controller.getSnapshot().revision;
    expect(controller.previewTransposeChart("M2", "up", "selection")).toMatchObject({ ok: false, selectedChordCount: 0 });
    const refused = controller.transposeChart("M2", "up", "selection");
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.refusal.code).toBe("u1.selection_empty");
    expect(controller.getSnapshot().revision).toBe(revision);
  });
});

describe("Transpose to a named key", () => {
  test("C major to E♭ moves every chord by a minor 3rd up, or a major 6th down, with the same spellings", () => {
    for (const direction of ["up", "down"] as const) {
      const controller = seeded();
      expect(controller.previewTransposeToKey({ step: "E", alter: -1 }, direction)).toMatchObject({
        ok: true, keyBefore: "C major", keyAfter: "E♭ major",
      });
      expect(controller.transposeChartToKey({ step: "E", alter: -1 }, direction).ok).toBe(true);
      /* Hand-derived: C→E♭ moves every letter up two steps and three semitones. */
      expect(symbols(controller)).toBe("Fm7 Bb7 Eb6/9/G Cb7/Eb F♭maj7");
      expect(controller.getSnapshot().history.undoLabel).toBe("Transpose to E♭");
    }
  });

  test("the current key or a chart without a key refuses and changes nothing", () => {
    const controller = seeded();
    const revision = controller.getSnapshot().revision;
    expect(controller.transposeChartToKey({ step: "C", alter: 0 }, "up").ok).toBe(false);
    expect(controller.getSnapshot().revision).toBe(revision);
    expect(controller.setKey(null).ok).toBe(true);
    const noKey = controller.previewTransposeToKey({ step: "D", alter: 0 }, "up");
    expect(noKey.ok).toBe(false);
    if (!noKey.ok) expect(noKey.message).toContain("Set the chart's key first");
  });
});

describe("Hear a transposition before applying it", () => {
  const GESTURE = Object.freeze({ kind: "trusted-pointer", trusted: true, sequence: 1 } as const);

  test("the transposed excerpt sounds every original pitch moved by exactly the interval", () => {
    const document = musicalDocument([["Dm7"], ["G7"], ["Cmaj7"], ["A7b9"], ["Dm7"], ["G7alt"]]);
    const original = auditionExcerpt(document, null);
    const moved = transposeChart(document, makeSpelledInterval(3, "minor", "up"));
    if (original === null || !moved.ok) throw new Error("excerpt");
    const transposed = auditionExcerpt(moved.candidate, null);
    if (transposed === null) throw new Error("excerpt");
    /* The first four bars only, so the preview lane's 64-beat bound holds. */
    expect(transposed.sections.flatMap((section) => section.measures)).toHaveLength(4);
    const plan = (candidate: typeof original) => {
      const shape = decodeDocumentShape(candidate);
      if (!shape.ok) throw new Error(JSON.stringify(shape.errors));
      const valid = validateDocumentSemantics(shape.value);
      if (!valid.ok) throw new Error(JSON.stringify(valid.errors));
      const compiled = compileStudioPlaybackPlan(valid.value);
      if (!compiled.ok) throw new Error(compiled.refusal.code);
      return compiled.plan.events.map((event) => [...event.midiPitches].map((midi) => midi % 12).sort((a, b) => a - b));
    };
    const before = plan(original), after = plan(transposed);
    expect(after).toHaveLength(before.length);
    /* Hand law: a minor 3rd adds three semitones to every pitch class. */
    before.forEach((pcs, index) => {
      expect(after[index]).toEqual(pcs.map((pc) => (pc + 3) % 12).sort((a, b) => a - b));
    });
  });

  test("the selection excerpt starts at the selected bars", () => {
    const document = musicalDocument([["Dm7"], ["G7"], ["Cmaj7"], ["A7"], ["Dm7"], ["G7"], ["Cmaj7"]]);
    const focus = new Set([document.sections[0]?.measures[5]?.events[0]?.id].filter((id) => id !== undefined));
    const excerpt = auditionExcerpt(document, focus);
    expect(excerpt?.sections.flatMap((section) => section.measures.flatMap((measure) => measure.events.map((event) => event.chord.sourceText))))
      .toEqual(["G7", "Cmaj7"]);
  });

  test("auditions reach the real preview lane and never touch the document or history", async () => {
    const creation = createStudioController({ audio: createStudioAudio(createFakeAudioPlatform().platform) });
    if (!creation.ok) throw new Error(creation.refusal.code);
    const controller = creation.controller;
    const snapshot = controller.getSnapshot();
    insert(controller, "| Dm7 G7 |", { kind: "measure-start", measureId: snapshot.sections[0]?.measures[0]?.id ?? "" });
    insert(controller, "| Cmaj7 |", { kind: "section-end", sectionId: snapshot.sections[0]?.id ?? "" });
    const before = controller.getSnapshot();
    for (const which of ["original", "transposed"] as const) {
      const heard = await controller.hearTransposition({ kind: "interval", id: "M2" }, "up", "chart", which, GESTURE);
      expect(heard.ok ? "ok" : heard.message).toBe("ok");
    }
    expect(controller.getSnapshot().revision).toBe(before.revision);
    expect(controller.getSnapshot().history).toEqual(before.history);
    expect(symbols(controller)).toBe("Dm7 G7 Cmaj7");
    const refused = await controller.hearTransposition({ kind: "interval", id: "M2" }, "up", "selection", "transposed", GESTURE);
    expect(refused.ok).toBe(false);
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

  test("every spellable pair of the fifteen key tonics lands exactly; only doubly altered pairs refuse", () => {
    const tonics = [["C", 0], ["C", 1], ["D", -1], ["D", 0], ["E", -1], ["E", 0], ["F", 0], ["F", 1],
      ["G", -1], ["G", 0], ["A", -1], ["A", 0], ["B", -1], ["B", 0], ["C", -1]] as const;
    const pc = (step: string, alter: number) => (({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as Record<string, number>)[step] ?? 0) + alter;
    for (const [fs, fa] of tonics) for (const [ts, ta] of tonics) for (const direction of ["up", "down"] as const) {
      const from = { step: fs, alter: fa } as never, to = { step: ts, alter: ta } as never;
      const interval = intervalBetweenTonics(from, to, direction);
      if (fs === ts && fa === ta) { expect(interval).toBeNull(); continue; }
      /* Independent law: the letter distance fixes the interval number; the
       * pair is spellable only if the semitone excess over the major/perfect
       * size is a single alteration (C♯ → G♭ up needs a doubly diminished 5th). */
      const letters = "CDEFGAB", [lo, hi] = direction === "up" ? [[fs, fa], [ts, ta]] as const : [[ts, ta], [fs, fa]] as const;
      const steps = (letters.indexOf(hi[0]) - letters.indexOf(lo[0]) + 7) % 7;
      const semis = ((pc(hi[0], hi[1]) - pc(lo[0], lo[1])) % 12 + 12) % 12;
      const numbers = steps === 0 ? [1, 8] : [steps + 1];
      const base = [0, 0, 2, 4, 5, 7, 9, 11, 12];
      const spellable = numbers.some((n) => {
        const excess = semis - (base[n] ?? 0), perfect = n === 1 || n === 4 || n === 5 || n === 8;
        return perfect ? Math.abs(excess) <= 1 : excess >= -2 && excess <= 1;
      });
      expect(`${fs}${String(fa)}->${ts}${String(ta)} ${direction}: ${String(interval !== null)}`)
        .toBe(`${fs}${String(fa)}->${ts}${String(ta)} ${direction}: ${String(spellable)}`);
      if (interval === null) continue;
      expect(transposeSpelledPitchClassExact(from, interval)).toEqual({ step: ts, alter: ta });
      /* Sounding distance agrees with the direction, within one octave. */
      const up = ((pc(ts, ta) - pc(fs, fa)) % 12 + 12) % 12;
      expect(((interval.semitones % 12) + 12) % 12).toBe(up);
      expect(direction === "up" ? interval.semitones >= 0 : interval.semitones <= 0).toBe(true);
    }
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
