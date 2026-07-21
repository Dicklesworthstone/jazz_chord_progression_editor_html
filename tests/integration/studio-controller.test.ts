import { describe, expect, test } from "bun:test";

import {
  STUDIO_BLANK_DOCUMENT_IDS,
  createStudioBootstrap,
  createStudioController,
  type StudioController,
} from "../../src/application";

function controller(): StudioController {
  const created = createStudioController();
  expect(created.ok).toBe(true);
  if (!created.ok) {
    throw new Error(`STUDIO_TEST_BOOTSTRAP:${created.refusal.code}`);
  }
  return created.controller;
}

describe("studio application checkpoint", () => {
  test("publishes one explicit empty 4/4 measure through the real application bootstrap", () => {
    const created = createStudioBootstrap();
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error(`STUDIO_TEST_BOOTSTRAP:${created.refusal.code}`);
    }

    const { state } = created.value;
    const section = state.document.sections[0];
    const measure = section?.measures[0];
    expect(state.document).toMatchObject({
      schema: "changes.progression.v2",
      id: STUDIO_BLANK_DOCUMENT_IDS.document,
      title: "Untitled Changes",
      description: "",
      meter: { beatsPerBar: 4, beatUnit: 4 },
      tempoBpm: 120,
      key: null,
      playback: {
        instrumentId: "mellow-keys",
        masterVolume: 0.8,
        reverbAmount: 0.2,
        countInBars: 0,
      },
    });
    expect(state.document.sections).toHaveLength(1);
    expect(section).toMatchObject({
      id: STUDIO_BLANK_DOCUMENT_IDS.section,
      name: "A",
      annotation: "",
      keyOverride: null,
      voiceLeadingBoundary: "reset",
    });
    expect(section?.measures).toHaveLength(1);
    expect(String(measure?.id)).toBe(STUDIO_BLANK_DOCUMENT_IDS.measure);
    expect(measure?.events).toEqual([]);
    expect(measure?.completion).toEqual({ kind: "empty" });
    expect(state.transport.status).toBe("unavailable");
    expect(state.transport.startBeat).toMatchObject({
      numerator: 0,
      denominator: 1,
    });
  });

  test("derives an immutable exact-time studio view model", () => {
    const studio = controller();
    const view = studio.getSnapshot();

    expect(view).toMatchObject({
      title: "Untitled Changes",
      revision: 0,
      meterLabel: "4/4",
      tempoBpm: 120,
      keyLabel: "No key",
      instrumentLabel: "Mellow Keys",
      masterVolume: 0.8,
      reverbAmount: 0.2,
      countInBars: 0,
      measureCount: 1,
      transport: {
        status: "unavailable",
        statusLabel: "Audio unavailable",
        isAvailable: false,
        playheadBeatLabel: "0/1",
        startBeatLabel: "0/1",
      },
    });
    expect(view.sections[0]?.measures[0]).toEqual({
      id: STUDIO_BLANK_DOCUMENT_IDS.measure,
      ordinal: 1,
      eventCount: 0,
      completion: "empty",
      completionLabel: "Empty measure",
      startBeatLabel: "0/1",
      durationBeatLabel: "0/1",
      endBeatLabel: "0/1",
      capacityBeatLabel: "4/1",
    });
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.sections)).toBe(true);
    expect(Object.isFrozen(view.sections[0]?.measures)).toBe(true);
  });

  test("commits a title through A0 and keeps a refused title edit atomic", () => {
    const studio = controller();
    let notifications = 0;
    const unsubscribe = studio.subscribe(() => {
      notifications += 1;
    });

    const committed = studio.setTitle("Blue in Green");
    expect(committed).toMatchObject({
      ok: true,
      outcome: "committed",
      snapshot: {
        title: "Blue in Green",
        revision: 1,
        history: { canUndo: true, canRedo: false },
      },
    });
    expect(notifications).toBe(1);

    const beforeRefusal = studio.getSnapshot();
    const refused = studio.setTitle("x".repeat(257));
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("STUDIO_TEST_EXPECTED_REFUSAL");
    expect(refused.refusal).toMatchObject({
      action: "set-title",
      code: "command.structural_validation_failed",
      path: ["candidate"],
      recoveryAction:
        "Enter a nonblank title of at most 256 Unicode code points.",
    });
    expect(refused.refusal.issueCodes).toContain(
      "limit.title_code_points_exceeded",
    );
    expect(refused.snapshot.title).toBe(beforeRefusal.title);
    expect(refused.snapshot.revision).toBe(beforeRefusal.revision);
    expect(refused.snapshot.history).toEqual(beforeRefusal.history);
    expect(refused.snapshot.noticeCount).toBe(beforeRefusal.noticeCount + 1);
    expect(notifications).toBe(2);

    unsubscribe();
    studio.toggleRail("left");
    expect(notifications).toBe(2);
  });

  test("restores exact title snapshots through real undo and redo", () => {
    const studio = controller();
    const committed = studio.setTitle("Nardis");
    expect(committed.ok).toBe(true);

    const undone = studio.undo();
    expect(undone).toMatchObject({
      ok: true,
      outcome: "undone",
      snapshot: {
        title: "Untitled Changes",
        revision: 2,
        history: { canUndo: false, canRedo: true },
      },
    });

    const redone = studio.redo();
    expect(redone).toMatchObject({
      ok: true,
      outcome: "redone",
      snapshot: {
        title: "Nardis",
        revision: 3,
        history: { canUndo: true, canRedo: false },
      },
    });
  });

  test("updates both rail states through A0 ephemeral panel intents only", () => {
    const studio = controller();
    const initial = studio.getSnapshot();
    expect(initial.panels).toMatchObject({
      leftRailCollapsed: false,
      rightRailCollapsed: false,
      active: "chart",
    });

    const left = studio.setRailCollapsed("left", true);
    expect(left).toMatchObject({
      ok: true,
      outcome: "ephemeral-updated",
      snapshot: {
        revision: 0,
        panels: {
          leftRailCollapsed: true,
          rightRailCollapsed: false,
        },
      },
    });
    expect(left.snapshot.history).toEqual(initial.history);
    expect(left.snapshot.panels.open).toEqual(initial.panels.open);

    const right = studio.toggleRail("right");
    expect(right).toMatchObject({
      ok: true,
      outcome: "ephemeral-updated",
      snapshot: {
        revision: 0,
        panels: {
          leftRailCollapsed: true,
          rightRailCollapsed: true,
        },
      },
    });
  });

  test("returns an actionable refusal instead of throwing when history is empty", () => {
    const studio = controller();
    const result = studio.undo();
    expect(result).toMatchObject({
      ok: false,
      refusal: {
        action: "undo",
        code: "history.undo_empty",
        message: "There is nothing to undo.",
        recoveryAction: "Make a document edit before using Undo.",
      },
      snapshot: {
        title: "Untitled Changes",
        revision: 0,
        noticeCount: 1,
      },
    });
  });
});
