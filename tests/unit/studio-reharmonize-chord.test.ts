/**
 * "Reharmonize this chord": the H1 transform laws applied to a real chart
 * through the controller and A0's `apply-reharmonization` command.
 *
 * Expectations are hand-derived from the laws' musical statements: a
 * dominant's tritone substitute lies six semitones away, its related ii a
 * fifth above its root, a minor chord becomes the dominant of a chord a
 * fourth above it, and a major chord borrows the minor chord on its root.
 */
import { describe, expect, test } from "bun:test";

import { buildChartReharmonization, listChartReharmonizations } from "../../src/application/chart-reharmonization";
import { createStudioAudio } from "../../src/application/studio-audio";
import { validateDocumentSemantics } from "../../src/application/document-validation";
import { compileStudioPlaybackPlan } from "../../src/application/studio-playback";
import { createStudioController, type StudioController } from "../../src/application/runtime";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";
import { decodeDocumentShape, parseStableId, type SpelledPitch } from "../../src/domain";
import { musicalDocument } from "../support/studio-voice-leading";

const GESTURE = Object.freeze({ kind: "trusted-pointer", trusted: true, sequence: 1 } as const);

function controllerWith(text: string, audio = false): StudioController {
  const creation = createStudioController(audio ? { audio: createStudioAudio(createFakeAudioPlatform().platform) } : undefined);
  if (!creation.ok) throw new Error(`controller refused: ${creation.refusal.code}`);
  const controller = creation.controller;
  const snapshot = controller.getSnapshot();
  // The pristine chart has one empty bar: fill it, then append the rest.
  const [first, ...rest] = text.split("|").map((bar) => bar.trim()).filter((bar) => bar.length > 0);
  const insert = (bars: string, target: Parameters<StudioController["setQuickEntryDraft"]>[1]) => {
    const preview = controller.previewChartText(bars);
    if (preview.status !== "ready") throw new Error(`does not parse: ${bars}`);
    const drafted = controller.setQuickEntryDraft(bars, target, preview.status, preview.issueCodes);
    if (!drafted.ok) throw new Error(drafted.refusal.code);
    const applied = controller.applyQuickEntryPreview();
    if (!applied.ok) throw new Error(applied.refusal.code);
  };
  insert(`| ${first ?? ""} |`, { kind: "measure-start", measureId: snapshot.sections[0]?.measures[0]?.id ?? "" });
  if (rest.length > 0) insert(`| ${rest.join(" | ")} |`, { kind: "section-end", sectionId: snapshot.sections[0]?.id ?? "" });
  return controller;
}

function events(controller: StudioController) {
  return controller.getSnapshot().sections.flatMap((section) =>
    section.measures.flatMap((measure) => measure.events));
}

function eventIdOf(controller: StudioController, symbol: string): string {
  const found = events(controller).find((event) => event.symbolText === symbol);
  if (found === undefined) throw new Error(`no ${symbol}`);
  return found.id;
}

const symbols = (controller: StudioController) => events(controller).map((event) => event.symbolText).join(" ");
const afterOf = (controller: StudioController, symbol: string) => {
  const view = controller.readReharmonizations(eventIdOf(controller, symbol));
  return view.ok ? view.options.map((option) => option.after.join(" ")) : view.message;
};

describe("Reharmonization options for one chord", () => {
  test("each chord offers only what its law and neighbours support", () => {
    const controller = controllerWith("| Dm7 G7 | Cmaj7 | A7 |");
    // Dm7 before G7 (a fourth up) may become D7; G7 already has its ii, so only the sub.
    expect(afterOf(controller, "Dm7")).toEqual(["D7"]);
    expect(afterOf(controller, "G7")).toEqual(["Db7"]);
    expect(afterOf(controller, "Cmaj7")).toEqual(["Cm7"]);
    // A7 after Cmaj7 has no ii yet: the sub, or Em7 then A7 in the same bar.
    expect(afterOf(controller, "A7")).toEqual(["Eb7", "Em7 A7"]);
  });

  test("a ♭-spelled chart gets ♭-spelled options", () => {
    const controller = controllerWith("| D♭7 |");
    expect(afterOf(controller, "D♭7")).toEqual(["G7", "A♭m7 D♭7"]);
  });

  test("reading options changes nothing", () => {
    const controller = controllerWith("| Dm7 G7 | Cmaj7 |");
    const before = controller.getSnapshot();
    controller.readReharmonizations(eventIdOf(controller, "G7"));
    expect(controller.getSnapshot().revision).toBe(before.revision);
    expect(controller.getSnapshot().history).toEqual(before.history);
  });
});

describe("Applying a reharmonization", () => {
  test("a tritone substitute replaces the chord in place as one Undo step", () => {
    const controller = controllerWith("| Dm7 G7 | Cmaj7 |");
    const gId = eventIdOf(controller, "G7");
    const revision = controller.getSnapshot().revision;
    const view = controller.readReharmonizations(gId);
    if (!view.ok) throw new Error(view.message);
    const sub = view.options.find((option) => option.after[0] === "Db7");
    if (sub === undefined) throw new Error("no sub");
    const applied = controller.applyReharmonization(gId, sub.id);
    expect(applied.ok ? "ok" : applied.refusal.code).toBe("ok");
    expect(symbols(controller)).toBe("Dm7 Db7 Cmaj7");
    // Same identity and the same two beats.
    const replaced = events(controller).find((event) => event.id === gId);
    expect(replaced?.symbolText).toBe("Db7");
    expect(replaced?.durationBeatLabel).toBe("2/1");
    expect(controller.getSnapshot().revision).toBe(revision + 1);
    expect(controller.getSnapshot().history.undoLabel).toBe("Reharmonize: Db7 for G7");
    expect(controller.undo().ok).toBe(true);
    expect(symbols(controller)).toBe("Dm7 G7 Cmaj7");
    expect(eventIdOf(controller, "G7")).toBe(gId);
  });

  test("a ii insertion splits the chord into exact halves and keeps the original's identity", () => {
    const controller = controllerWith("| Cmaj7 | A7 | Dm7 |");
    const aId = eventIdOf(controller, "A7");
    const view = controller.readReharmonizations(aId);
    if (!view.ok) throw new Error(view.message);
    const ii = view.options.find((option) => option.kind === "split-insert");
    if (ii === undefined) throw new Error("no ii insertion");
    const applied = controller.applyReharmonization(aId, ii.id);
    expect(applied.ok ? "ok" : applied.refusal.code).toBe("ok");
    expect(symbols(controller)).toBe("Cmaj7 Em7 A7 Dm7");
    const bar2 = controller.getSnapshot().sections[0]?.measures[1]?.events ?? [];
    expect(bar2.map((event) => [event.symbolText, event.durationBeatLabel])).toEqual([["Em7", "2/1"], ["A7", "2/1"]]);
    expect(bar2[1]?.id).toBe(aId);
    expect(bar2[0]?.id).not.toBe(aId);
    // The request slot closed with the commit: a second reharmonization applies.
    const cmaj = eventIdOf(controller, "Cmaj7");
    const next = controller.readReharmonizations(cmaj);
    if (!next.ok) throw new Error(next.message);
    expect(controller.applyReharmonization(cmaj, next.options[0]?.id ?? "").ok).toBe(true);
    expect(symbols(controller)).toBe("Cm7 Em7 A7 Dm7");
    expect(controller.undo().ok).toBe(true);
    expect(controller.undo().ok).toBe(true);
    expect(symbols(controller)).toBe("Cmaj7 A7 Dm7");
    expect(eventIdOf(controller, "A7")).toBe(aId);
  });

  test("a split before another chord in the same bar declares the shifted chord too", () => {
    const controller = controllerWith("| Cmaj7 | A7 D7 |");
    const aId = eventIdOf(controller, "A7");
    const view = controller.readReharmonizations(aId);
    const ii = view.ok ? view.options.find((option) => option.kind === "split-insert") : undefined;
    if (ii === undefined) throw new Error("no ii insertion");
    const applied = controller.applyReharmonization(aId, ii.id);
    expect(applied.ok ? "ok" : applied.refusal.code).toBe("ok");
    const bar2 = controller.getSnapshot().sections[0]?.measures[1]?.events ?? [];
    // Two beats of A7 become one of Em7 and one of A7; D7 keeps its two.
    expect(bar2.map((event) => [event.symbolText, event.durationBeatLabel])).toEqual([["Em7", "1/1"], ["A7", "1/1"], ["D7", "2/1"]]);
  });

  test("an unknown option or a missing chord refuses and changes nothing", () => {
    const controller = controllerWith("| Dm7 G7 | Cmaj7 |");
    const before = controller.getSnapshot();
    const unknown = controller.applyReharmonization(eventIdOf(controller, "G7"), "cand_not_listed");
    expect(unknown.ok ? "ok" : unknown.refusal.code).toBe("u1.reharmonize_unavailable");
    const missing = controller.applyReharmonization("e-gone", "cand_tritone_sub_1");
    expect(missing.ok).toBe(false);
    expect(controller.getSnapshot().revision).toBe(before.revision);
    expect(symbols(controller)).toBe("Dm7 G7 Cmaj7");
  });
});

describe("Hearing a reharmonization", () => {
  test("original and option both reach the real preview lane without touching the chart", async () => {
    const controller = controllerWith("| Cmaj7 | A7 | Dm7 |", true);
    const aId = eventIdOf(controller, "A7");
    const before = controller.getSnapshot();
    const view = controller.readReharmonizations(aId);
    if (!view.ok) throw new Error(view.message);
    for (const optionId of [null, ...view.options.map((option) => option.id)]) {
      const heard = await controller.hearReharmonization(aId, optionId, GESTURE);
      expect(heard.ok ? "ok" : heard.message).toBe("ok");
    }
    expect(controller.getSnapshot().revision).toBe(before.revision);
    expect(controller.getSnapshot().history).toEqual(before.history);
    expect(symbols(controller)).toBe("Cmaj7 A7 Dm7");
  }, 60_000);
});

describe("Pure reharmonization candidates", () => {
  const pitch = (step: string, alter: number, octave: number) => ({ step, alter, octave }) as SpelledPitch;
  const newId = (() => {
    const parsed = parseStableId("event", "reharm-new-1");
    if (!parsed.ok) throw new Error("id");
    return parsed.value;
  })();

  test("chords with exact stored notes offer nothing; they are never re-voiced", () => {
    const manual = { mode: "manual", pitches: [pitch("G", 0, 3), pitch("B", 0, 3), pitch("F", 0, 4)], bassPolicy: "included" };
    // The helper stores the voicing on the second event.
    const document = musicalDocument([["Cmaj7"], ["G7"]], manual);
    const g = document.sections[0]?.measures[1]?.events[0];
    if (g === undefined) throw new Error("event");
    expect(listChartReharmonizations(document, g.id)).toEqual({ ok: false, reason: "stored-voicing" });
    expect(buildChartReharmonization(document, g.id, "cand_tritone_sub_0", null).ok).toBe(false);
  });

  test("every listed option builds a document the real validator accepts and that plays", () => {
    const document = musicalDocument([["Dm7"], ["G7"], ["Cmaj7"], ["A7"], ["F"]]);
    let built = 0;
    for (const measure of document.sections[0]?.measures ?? []) {
      for (const event of measure.events) {
        const listed = listChartReharmonizations(document, event.id);
        if (!listed.ok) throw new Error(listed.reason);
        for (const option of listed.options) {
          const result = buildChartReharmonization(document, event.id, option.id, newId);
          if (!result.ok) throw new Error(`${option.id}: ${result.reason}`);
          const shape = decodeDocumentShape(result.candidate);
          if (!shape.ok) throw new Error(JSON.stringify(shape.errors));
          const validated = validateDocumentSemantics(shape.value);
          if (!validated.ok) throw new Error(`${option.id}: ${JSON.stringify(validated.errors)}`);
          expect(compileStudioPlaybackPlan(validated.value).ok).toBe(true);
          built += 1;
        }
      }
    }
    // Dm7: D7; G7: Db7; Cmaj7: Cm7; A7: Eb7 and Em7-A7; F: Fm.
    expect(built).toBe(6);
  }, 60_000);

  test("an inserted ID that already exists refuses rather than colliding", () => {
    const document = musicalDocument([["Cmaj7"], ["A7"]]);
    const a = document.sections[0]?.measures[1]?.events[0];
    const c = document.sections[0]?.measures[0]?.events[0];
    if (a === undefined || c === undefined) throw new Error("event");
    const listed = listChartReharmonizations(document, a.id);
    const split = listed.ok ? listed.options.find((option) => option.kind === "split-insert") : undefined;
    if (split === undefined) throw new Error("split");
    expect(buildChartReharmonization(document, a.id, split.id, c.id)).toEqual({ ok: false, reason: "unbuildable" });
  });
});
