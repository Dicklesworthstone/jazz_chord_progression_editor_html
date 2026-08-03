/**
 * M0-TRACE-ROUND-TRIP evidence, plus the one-undoable-edit law.
 *
 * Two separate claims live here, both proved through real production paths:
 *
 * 1. `import(export(plan))` preserves what the E1 writer encoded. The M0
 *    golden `M0-GLD-001` is pinned byte-for-byte against the accepted E1
 *    writer golden `E1-GLD-001` — the fixture files are compared to each other
 *    here, not to production output — and those exact bytes decode back to the
 *    chord the writer's marker names.
 *
 * 2. One import is ONE ordinary undoable edit. The gesture runs through the
 *    real studio controller and the real atomic edit-plan runner: the history
 *    grows by exactly one entry, and one Undo returns the document that was
 *    there before.
 */
import { describe, expect, test } from "bun:test";

import { createStudioMidiImport } from "../../src/application/runtime";
import { createStudioController } from "../../src/application";
import e1Golden from "../fixtures/midi-export/golden-cases.json";
import {
  decodeGolden,
  hexToBytes,
  realDecodeFrame,
  requireDecoded,
  requireGoldenCase,
} from "../support/midi-import-test-kit";

type E1Case = Readonly<{ id: string; bytesHex: string }>;
const E1_CASES = e1Golden.cases as unknown as readonly E1Case[];

describe("M0 round trip with the E1 writer", () => {
  test("M0-GLD-001 restates the accepted E1 writer golden byte for byte", () => {
    const importCase = requireGoldenCase("M0-GLD-001");
    const exportCase = E1_CASES.find((entry) => entry.id === "E1-GLD-001");
    expect(exportCase).toBeDefined();
    expect(importCase.bytesHex.toUpperCase()).toBe(
      (exportCase?.bytesHex ?? "").toUpperCase(),
    );
  });

  test("the writer's own bytes decode back to the chord its marker names", async () => {
    const decoded = requireDecoded(await decodeGolden("M0-GLD-001"));
    /* The conductor track's marker is the chord the writer encoded. */
    const marker = decoded.model.tracks[0]?.markers[0];
    expect(marker?.text).toBe("Cmaj");
    const outcome = decoded.resolutions[0];
    expect(outcome?.kind).toBe("alternatives");
    if (outcome === undefined || outcome.kind !== "alternatives") return;
    expect(outcome.alternatives[0]?.formulaRuleId).toBe("base-major");
    expect(outcome.alternatives[0]?.rootSpelled).toEqual({
      step: "C",
      alter: 0,
    });
  });
});

describe("one import is one undoable edit", () => {
  test("the gesture appends exactly one history entry and Undo restores the chart", async () => {
    const creation = createStudioController({});
    expect(creation.ok).toBe(true);
    if (!creation.ok) return;
    const controller = creation.controller;

    const decodeFrame = await realDecodeFrame();
    const service = createStudioMidiImport(() => Promise.resolve(decodeFrame));
    const preview = await service.readFile(
      "two-chords.mid",
      hexToBytes(requireGoldenCase("M0-GLD-002").bytesHex),
    );
    expect(preview.refusal).toBeNull();
    expect(preview.blockedReason).toBeNull();
    expect(preview.plan).not.toBeNull();

    const before = controller.getSnapshot();
    const beforeChords = before.chordCount;
    /* A freshly constructed controller has nothing to undo. */
    expect(before.history.canUndo).toBe(false);

    const result = service.commit(controller, preview);
    expect(result.committed).toBe(true);
    expect(result.reason).toBe("committed");

    const after = controller.getSnapshot();
    expect(after.chordCount).toBe(beforeChords + 2);
    expect(after.history.canUndo).toBe(true);

    /*
     * ONE press restores the pristine chart AND exhausts history. Two
     * commands would leave `canUndo` true here, which is exactly the
     * fill-then-append cost the document-end placement avoids.
     */
    const undone = controller.undo();
    expect(undone.ok).toBe(true);
    const restored = controller.getSnapshot();
    expect(restored.chordCount).toBe(beforeChords);
    expect(restored.history.canUndo).toBe(false);
  });

  test("a refused file never reaches the document", async () => {
    const creation = createStudioController({});
    expect(creation.ok).toBe(true);
    if (!creation.ok) return;
    const controller = creation.controller;

    const decodeFrame = await realDecodeFrame();
    const service = createStudioMidiImport(() => Promise.resolve(decodeFrame));
    /* Format 2 is outside the accepted envelope. */
    const preview = await service.readFile(
      "format-two.mid",
      hexToBytes("4D546864000000060002000100604D54726B0000000400FF2F00"),
    );
    expect(preview.refusal?.code).toBe("smf.format_unsupported");
    expect(preview.refusal?.byteOffset).toBe(8);
    expect(preview.plan).toBeNull();

    const before = controller.getSnapshot();
    const result = service.commit(controller, preview);
    expect(result.committed).toBe(false);
    expect(result.reason).toBe("nothing-to-commit");
    const after = controller.getSnapshot();
    expect(after.chordCount).toBe(before.chordCount);
    expect(after.history.canUndo).toBe(false);
  });
});
