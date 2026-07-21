import { describe, expect, test } from "bun:test";

import {
  redoDocumentCommand,
  runDocumentCommand,
  undoDocumentCommand,
  type ApplicationTransitionResult,
  type DocumentCommand,
} from "../../src/application";
import { makeChordEvent, type ManualVoicing } from "../../src/domain";
import {
  a0Dependencies,
  a0Envelope,
  a0InitialState,
  a0TemplateDocument,
} from "../support/a0-application-fixture";

function success(
  result: ApplicationTransitionResult,
  label: string,
): Extract<ApplicationTransitionResult, { ok: true }> {
  expect(result.ok, label).toBe(true);
  if (!result.ok) throw new Error(`${label}:${result.refusal.code}`);
  return result;
}

describe("A0 chord and exact stored-voicing commands", () => {
  test("refuses stale pitch relabeling and publishes only an explicit compatible chord/voicing pair", () => {
    const dependencies = a0Dependencies();
    const initial = a0InitialState(
      a0TemplateDocument("representativeCustomManual"),
    );
    const alternateDocument = a0TemplateDocument(
      "representativeDbSlashManual",
    );
    const originalEvent = initial.document.sections[0]?.measures[0]?.events[0];
    const alternateEvent =
      alternateDocument.sections[0]?.measures[0]?.events[0];
    if (
      originalEvent === undefined ||
      alternateEvent === undefined ||
      originalEvent.voicing.mode !== "manual" ||
      alternateEvent.chord.kind !== "parsed" ||
      alternateEvent.voicing.mode !== "manual"
    ) {
      throw new Error("A0_TEST_CHORD_FIXTURE");
    }

    const [firstPitch, secondPitch, thirdPitch] = originalEvent.voicing.pitches;
    if (secondPitch === undefined || thirdPitch === undefined) {
      throw new Error("A0_TEST_MANUAL_PITCHES");
    }
    const reorderedPitches = [
      thirdPitch,
      firstPitch,
      secondPitch,
    ] as const;
    const reorderedVoicing: ManualVoicing = Object.freeze({
      ...originalEvent.voicing,
      pitches: Object.freeze(reorderedPitches),
    });
    const reordered = success(
      runDocumentCommand({
        state: initial,
        command: {
          ...a0Envelope(initial, "manual-order", 0),
          kind: "set-voicing",
          eventId: originalEvent.id,
          voicing: reorderedVoicing,
        },
        dependencies,
      }),
      "manual order",
    );
    const exactPitches =
      reordered.state.document.sections[0]?.measures[0]?.events[0]?.voicing;
    expect(exactPitches?.mode).toBe("manual");
    if (exactPitches?.mode !== "manual") {
      throw new Error("A0_TEST_MANUAL_PUBLICATION");
    }
    expect(exactPitches.pitches).toEqual(reorderedVoicing.pitches);

    const currentEvent =
      reordered.state.document.sections[0]?.measures[0]?.events[0];
    if (currentEvent === undefined) throw new Error("A0_TEST_CURRENT_EVENT");
    const parsedChord = alternateEvent.chord;
    const alternateChord = Object.freeze({
      ...parsedChord,
      sourceText: "Db7",
      bass: null,
    });
    const incompatibleResult = makeChordEvent({
      id: currentEvent.id,
      duration: currentEvent.duration,
      annotation: currentEvent.annotation,
      chord: alternateChord,
      voicing: currentEvent.voicing,
    });
    if (!incompatibleResult.ok) {
      throw new Error(`A0_TEST_INCOMPATIBLE_EVENT:${incompatibleResult.refusal.code}`);
    }
    const incompatibleReplacement = incompatibleResult.value;
    const incompatibleCommand: DocumentCommand = {
      ...a0Envelope(reordered.state, "incompatible-root", 1),
      kind: "set-chord",
      eventId: currentEvent.id,
      replacement: incompatibleReplacement,
    };
    const refused = runDocumentCommand({
      state: reordered.state,
      command: incompatibleCommand,
      dependencies,
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("A0_TEST_EXPECTED_CHORD_REFUSAL");
    expect(refused.refusal.code).toBe("command.semantic_validation_failed");
    expect(refused.refusal.semanticIssues?.map((issue) => issue.code)).toContain(
      "chord.source_semantic_mismatch",
    );
    expect(refused.state.document).toBe(reordered.state.document);
    expect(refused.state.revision).toBe(reordered.state.revision);
    expect(refused.state.history).toBe(reordered.state.history);

    const compatibleResult = makeChordEvent({
      id: currentEvent.id,
      duration: currentEvent.duration,
      annotation: currentEvent.annotation,
      chord: alternateChord,
      voicing: alternateEvent.voicing,
    });
    if (!compatibleResult.ok) {
      throw new Error(`A0_TEST_COMPATIBLE_EVENT:${compatibleResult.refusal.code}`);
    }
    const compatibleReplacement = compatibleResult.value;
    const compatible = success(
      runDocumentCommand({
        state: reordered.state,
        command: {
          ...a0Envelope(reordered.state, "compatible-root", 1),
          kind: "set-chord",
          eventId: currentEvent.id,
          replacement: compatibleReplacement,
        },
        dependencies,
      }),
      "compatible root",
    );
    const published =
      compatible.state.document.sections[0]?.measures[0]?.events[0];
    expect(published?.id).toBe(currentEvent.id);
    expect(published?.duration).toEqual(currentEvent.duration);
    expect(published?.annotation).toBe(currentEvent.annotation);
    expect(published?.chord).toEqual(alternateChord);
    expect(published?.voicing).toEqual(alternateEvent.voicing);
    expect(compatible.state.history.undo).toHaveLength(2);

    const undone = success(
      undoDocumentCommand({ state: compatible.state }),
      "undo chord",
    );
    expect(undone.state.document).toBe(reordered.state.document);
    const redone = success(
      redoDocumentCommand({ state: undone.state }),
      "redo chord",
    );
    expect(redone.state.document).toBe(compatible.state.document);
  });

  test("rejects a replacement that changes identity, duration, or annotation", () => {
    const state = a0InitialState();
    const event = state.document.sections[0]?.measures[0]?.events[0];
    if (event === undefined) throw new Error("A0_TEST_EVENT");
    const replacementResult = makeChordEvent({
      id: event.id,
      duration: event.duration,
      annotation: "silently changed",
      chord: event.chord,
      voicing: event.voicing,
    });
    if (!replacementResult.ok) {
      throw new Error(`A0_TEST_REPLACEMENT_EVENT:${replacementResult.refusal.code}`);
    }
    const replacement = replacementResult.value;
    const result = runDocumentCommand({
      state,
      command: {
        ...a0Envelope(state, "identity-guard", 0),
        kind: "set-chord",
        eventId: event.id,
        replacement,
      },
      dependencies: a0Dependencies(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("A0_TEST_EXPECTED_IDENTITY_REFUSAL");
    expect(result.refusal.code).toBe("command.payload_invalid");
    expect(result.counters.validationCalls).toBe(0);
    expect(result.state.document).toBe(state.document);
  });
});
