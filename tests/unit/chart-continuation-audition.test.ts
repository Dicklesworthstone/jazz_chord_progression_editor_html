/**
 * "Hear this next chord": the audition is the chord before the anchor, the
 * anchor, then the suggestion, one bar each. Expectations are hand-derived
 * pitch-class sets of the named chords; the anchor's stored notes must sound
 * exactly, and hearing never changes the chart.
 */
import { describe, expect, test } from "bun:test";

import { continuationAudition } from "../../src/application/chart-continuation-audition";
import { createStudioAudio } from "../../src/application/studio-audio";
import { compileStudioPlaybackPlan } from "../../src/application/studio-playback";
import { validateDocumentSemantics } from "../../src/application/document-validation";
import { createStudioController, type StudioController } from "../../src/application/runtime";
import { decodeDocumentShape, parseStableId, type MeasureId, type SpelledPitch } from "../../src/domain";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";
import { musicalDocument } from "../support/studio-voice-leading";

const GESTURE = Object.freeze({ kind: "trusted-pointer", trusted: true, sequence: 1 } as const);
const id = <K extends "measure" | "event">(kind: K, wire: string) => {
  const parsed = parseStableId(kind, wire);
  if (!parsed.ok) throw new Error(wire);
  return parsed.value;
};
const ids = {
  measureIds: [id("measure", "aud-m1"), id("measure", "aud-m2"), id("measure", "aud-m3")] as MeasureId[],
  eventId: id("event", "aud-e1"),
};

function sounded(document: unknown): number[][] {
  const shape = decodeDocumentShape(document);
  if (!shape.ok) throw new Error(JSON.stringify(shape.errors));
  const valid = validateDocumentSemantics(shape.value);
  if (!valid.ok) throw new Error(JSON.stringify(valid.errors));
  const compiled = compileStudioPlaybackPlan(valid.value);
  if (!compiled.ok) throw new Error(compiled.refusal.code);
  return compiled.plan.events.map((event) => [...new Set(event.midiPitches.map((midi) => midi % 12))].sort((a, b) => a - b));
}

describe("continuation audition", () => {
  test("previous, anchor, then the suggestion, each sounding its own chord", () => {
    const document = musicalDocument([["Dm7"], ["G7"]]);
    const built = continuationAudition(document, null, "Cmaj7", ids);
    if (!built.ok) throw new Error(built.reason);
    // Dm7 = D F A C, G7 = G B D F, Cmaj7 = C E G B.
    expect(sounded(built.document)).toEqual([[0, 2, 5, 9], [2, 5, 7, 11], [0, 4, 7, 11]]);
  });

  test("an explicit anchor is heard with its own predecessor, not the chart's end", () => {
    const document = musicalDocument([["Cmaj7"], ["Am7"], ["Dm7"], ["G7"]]);
    const am7 = document.sections[0]?.measures[1]?.events[0];
    if (am7 === undefined) throw new Error("event");
    const built = continuationAudition(document, am7.id, "D7", ids);
    if (!built.ok) throw new Error(built.reason);
    // Cmaj7, Am7 (A C E G), D7 (D F# A C).
    expect(sounded(built.document)).toEqual([[0, 4, 7, 11], [0, 4, 7, 9], [0, 2, 6, 9]]);
  });

  test("an anchor's stored notes sound exactly; the suggestion gets the new-chord default", () => {
    const pitch = (step: string, alter: number, octave: number) => ({ step, alter, octave }) as SpelledPitch;
    const manual = { mode: "manual", pitches: [pitch("G", 0, 2), pitch("F", 0, 3), pitch("B", 0, 3), pitch("D", 0, 4)], bassPolicy: "included" };
    // The helper stores the voicing on the second event (G7 here).
    const document = musicalDocument([["Dm7"], ["G7"]], manual);
    const built = continuationAudition(document, null, "C6", ids);
    if (!built.ok) throw new Error(built.reason);
    const shape = decodeDocumentShape(built.document);
    if (!shape.ok) throw new Error("shape");
    const valid = validateDocumentSemantics(shape.value);
    if (!valid.ok) throw new Error("valid");
    const compiled = compileStudioPlaybackPlan(valid.value);
    if (!compiled.ok) throw new Error("compile");
    // G2 F3 B3 D4 = MIDI 43 53 59 62, in order.
    expect(compiled.plan.events[1]?.midiPitches).toEqual([43, 53, 59, 62]);
    expect([...new Set(compiled.plan.events[2]?.midiPitches.map((midi) => midi % 12))].sort((a, b) => a - b)).toEqual([0, 4, 7, 9]);
  });

  test("no chord or an unreadable symbol refuses", () => {
    const document = musicalDocument([["Dm7"]]);
    expect(continuationAudition(document, "missing", "G7", ids)).toEqual({ ok: false, reason: "no-anchor" });
    expect(continuationAudition(document, null, "H13", ids)).toEqual({ ok: false, reason: "symbol-invalid" });
  });
});

describe("hearContinuation through the controller", () => {
  test("plays through the real preview lane and never touches the chart", async () => {
    const creation = createStudioController({ audio: createStudioAudio(createFakeAudioPlatform().platform) });
    if (!creation.ok) throw new Error(creation.refusal.code);
    const controller: StudioController = creation.controller;
    // An empty chart has nothing to precede the suggestion.
    const empty = await controller.hearContinuation("G7", null, GESTURE);
    expect(empty.ok).toBe(false);
    const preview = controller.previewChartText("| Dm7 G7 |");
    const target = { kind: "measure-start", measureId: controller.getSnapshot().sections[0]?.measures[0]?.id ?? "" } as const;
    if (!controller.setQuickEntryDraft("| Dm7 G7 |", target, preview.status, preview.issueCodes).ok) throw new Error("draft");
    if (!controller.applyQuickEntryPreview().ok) throw new Error("insert");
    const before = controller.getSnapshot();
    const heard = await controller.hearContinuation("Cmaj7", null, GESTURE);
    expect(heard.ok ? "ok" : heard.message).toBe("ok");
    expect(controller.getSnapshot().revision).toBe(before.revision);
    expect(controller.getSnapshot().history).toEqual(before.history);
    const bad = await controller.hearContinuation("H13", null, GESTURE);
    expect(bad.ok).toBe(false);
  }, 60_000);
});
