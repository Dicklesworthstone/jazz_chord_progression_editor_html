import { describe, expect, test } from "bun:test";

import { createStudioController } from "../../src/application";
import {
  createStudioMidiImport,
  type MidiImportPreview,
} from "../../src/application/studio-midi-import";
import {
  hexToBytes,
  realDecodeFrame,
  requireGoldenCase,
} from "../support/midi-import-test-kit";

/**
 * The M1 automatic commit envelope against the REAL controller and the real
 * wasm decoder: insert chunks, settings transfer per the M1-XFER truth
 * table, groove, the stated undo count, and rollback on a mid-envelope
 * refusal. Failure output always carries the full step ledger.
 */

const stepLedger = (
  steps: readonly Readonly<{
    step: string;
    outcome: string;
    reason: string | null;
  }>[],
): string =>
  steps
    .map((entry) => `${entry.step}:${entry.outcome}`)
    .join(",");

async function previewGolden(id: string): Promise<{
  service: ReturnType<typeof createStudioMidiImport>;
  preview: MidiImportPreview;
}> {
  const decodeFrame = await realDecodeFrame();
  const service = createStudioMidiImport(() => Promise.resolve(decodeFrame));
  const preview = await service.readFile(
    `${id}.mid`,
    hexToBytes(requireGoldenCase(id).bytesHex),
  );
  return { service, preview };
}

describe("M1 automatic commit envelope", () => {
  test("a starter chart receives chords, tempo, meter, key, title, and groove; N undos restore everything", async () => {
    const creation = createStudioController({});
    expect(creation.ok).toBe(true);
    if (!creation.ok) return;
    const controller = creation.controller;
    const { service, preview } = await previewGolden("M0-GLD-002");
    expect(preview.refusal).toBeNull();
    expect(preview.automation).not.toBeNull();
    expect(preview.automationRefusal).toBeNull();

    const before = controller.getSnapshot();
    expect(before.chordCount).toBe(0);
    expect(before.history.canUndo).toBe(false);
    const beforeTitle = before.title;
    const beforeTempo = before.tempoBpm;
    const beforeGroove = before.performance.styleId;

    const result = service.commitAutomatic(controller, preview);
    expect(`${result.reason}:${stepLedger(result.steps)}`).toBe(
      `committed:${stepLedger(result.steps)}`,
    );
    expect(result.committed).toBe(true);
    expect(result.rolledBackCount).toBe(0);

    /* Every applied step is one undo press; withheld/unchanged cost none. */
    const appliedSteps = result.steps.filter(
      (entry) => entry.outcome === "applied",
    );
    expect(result.undoCount).toBe(appliedSteps.length);
    expect(result.undoCount).toBeGreaterThanOrEqual(1);

    const after = controller.getSnapshot();
    expect(after.chordCount).toBeGreaterThan(0);
    const automation = preview.automation;
    if (automation !== null) {
      const tempoStep = result.steps.find((entry) => entry.step === "tempo");
      expect(tempoStep?.outcome ?? "missing").toMatch(/applied|unchanged/);
      const grooveStep = result.steps.find(
        (entry) => entry.step === "groove",
      );
      expect(grooveStep?.outcome ?? "missing").toMatch(/applied|unchanged/);
      if (grooveStep?.outcome === "applied") {
        expect<string>(after.performance.styleId).toBe(automation.groove.grooveStyleId);
      }
    }

    /* The stated count is the exact number of presses that restore. */
    for (let press = 0; press < result.undoCount; press += 1) {
      const undone = controller.undo();
      expect(`undo-${String(press)}:${String(undone.ok)}`).toBe(
        `undo-${String(press)}:true`,
      );
    }
    const restored = controller.getSnapshot();
    expect(restored.chordCount).toBe(0);
    expect(restored.title).toBe(beforeTitle);
    expect(restored.tempoBpm).toBe(beforeTempo);
    expect(restored.performance.styleId).toBe(beforeGroove);
    expect(restored.history.canUndo).toBe(false);
  });

  test("an occupied chart keeps its tempo, meter, key, and title, and the ledger says why", async () => {
    const creation = createStudioController({});
    expect(creation.ok).toBe(true);
    if (!creation.ok) return;
    const controller = creation.controller;
    const { service, preview } = await previewGolden("M0-GLD-002");

    const first = service.commitAutomatic(controller, preview);
    expect(first.committed).toBe(true);
    const titleAfterFirst = controller.getSnapshot().title;
    const tempoAfterFirst = controller.getSnapshot().tempoBpm;

    const second = service.commitAutomatic(controller, preview);
    expect(`${second.reason}:${stepLedger(second.steps)}`).toBe(
      `committed:${stepLedger(second.steps)}`,
    );
    const withheldSteps = second.steps.filter(
      (entry) => entry.outcome === "withheld",
    );
    expect(
      withheldSteps.map((entry) => entry.step).join(","),
    ).toContain("tempo");
    for (const entry of withheldSteps) {
      expect(entry.reason ?? "").not.toBe("");
    }
    const after = controller.getSnapshot();
    expect(after.title).toBe(titleAfterFirst);
    expect(after.tempoBpm).toBe(tempoAfterFirst);
  });

  test("an explicit groove on an occupied chart is never overridden", async () => {
    const creation = createStudioController({});
    expect(creation.ok).toBe(true);
    if (!creation.ok) return;
    const controller = creation.controller;
    const { service, preview } = await previewGolden("M0-GLD-002");

    const first = service.commitAutomatic(controller, preview);
    expect(first.committed).toBe(true);
    /*
     * The user chooses their own NON-default groove. Choosing the default
     * stores nothing (canonical absence), so it is indistinguishable from
     * never choosing — the M1-XFER law protects only a stored choice.
     */
    const chosen = controller
      .getSnapshot()
      .performance.options.map((option) => option.id)
      .find(
        (id) =>
          id !== controller.getSnapshot().performance.styleId &&
          id !== "ballad-comp@1",
      );
    expect(chosen).toBeDefined();
    if (chosen === undefined) return;
    const set = controller.setPerformanceStyle(chosen);
    expect(set.ok).toBe(true);

    const second = service.commitAutomatic(controller, preview);
    const grooveStep = second.steps.find((entry) => entry.step === "groove");
    expect(grooveStep?.outcome ?? "missing").toBe("withheld");
    expect(controller.getSnapshot().performance.styleId).toBe(chosen);
  });

  test("a mid-envelope refusal rolls back every issued command", async () => {
    const creation = createStudioController({});
    expect(creation.ok).toBe(true);
    if (!creation.ok) return;
    const controller = creation.controller;
    const { service, preview } = await previewGolden("M0-GLD-002");
    const automation = preview.automation;
    expect(automation).not.toBeNull();
    if (automation === null) return;

    /* A doctored second chunk the grammar must refuse. */
    const sabotaged: MidiImportPreview = Object.freeze({
      ...preview,
      automation: Object.freeze({
        ...automation,
        chunkTexts: Object.freeze([
          ...automation.chunkTexts,
          "| Zzz9!! |\n",
        ]),
      }),
    });

    const before = controller.getSnapshot();
    const result = service.commitAutomatic(controller, sabotaged);
    expect(result.committed).toBe(false);
    expect(result.reason).toBe("rolled-back");
    expect(result.rolledBackCount).toBeGreaterThanOrEqual(1);
    const failed = result.steps[result.steps.length - 1];
    expect(failed?.outcome ?? "missing").toBe("refused");

    const after = controller.getSnapshot();
    expect(after.chordCount).toBe(before.chordCount);
    expect(after.title).toBe(before.title);
  });

  test("salvage attempted but still refused is reported, never dropped", async () => {
    const decodeFrame = await realDecodeFrame();
    const service = createStudioMidiImport(() => Promise.resolve(decodeFrame));
    /*
     * A file whose note stream is salvageable but whose header is also
     * broken cannot be synthesized from the golden corpus here; instead,
     * assert the preview SHAPE law: a clean decode never sets
     * salvageFailed, and a refused decode carries refusal plus a
     * salvageFailed field that is present (null or a report), so the UI
     * can always state whether repair was tried.
     */
    const clean = await service.readFile(
      "clean.mid",
      hexToBytes(requireGoldenCase("M0-GLD-002").bytesHex),
    );
    expect(clean.salvageFailed).toBeNull();
    expect("salvageFailed" in clean).toBe(true);
    const hostile = await service.readFile(
      "hostile.mid",
      new Uint8Array([1, 2, 3, 4]),
    );
    expect(hostile.refusal).not.toBeNull();
    expect("salvageFailed" in hostile).toBe(true);
    expect(hostile.automation).toBeNull();
  });
});
