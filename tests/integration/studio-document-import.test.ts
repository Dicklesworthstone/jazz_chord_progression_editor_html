import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";
import { createStudioBootstrap, createStudioCompositionOverState, createStudioDocumentImport,
  createX1SerializedTransportRetirementAdapter } from "../../src/application";
import { seedStarterChart } from "../../src/application/runtime";
import type { X1ReplacementRetirementAdapter } from "../../src/application/e0-interchange-contract";
import { createRecoveryHarness } from "../support/recovery-test-kit";
import { compiledPlan, createTransportHarness, initializePayload } from "../support/transport-test-kit";

const minimal = await readFile(new URL("../fixtures/interchange/goldens/minimal.changes.json", import.meta.url), "utf8");
const nested = await readFile(new URL("../fixtures/interchange/goldens/nested.changes.json", import.meta.url), "utf8");

async function harness(options: { seed?: boolean; estimate?: number; retirement?: X1ReplacementRetirementAdapter } = {}) {
  const bootstrap = createStudioBootstrap();
  if (!bootstrap.ok) throw new Error("BOOTSTRAP_REFUSED");
  const transport = createTransportHarness();
  await transport.submit(initializePayload(compiledPlan()));
  const estimate = () => options.estimate ?? 4000;
  const composition = createStudioCompositionOverState({ ...bootstrap.value.state,
    transport: { ...bootstrap.value.state.transport, generation: transport.service.inspectTransport().generation },
  }, { ...bootstrap.value.dependencies, estimateHistoryRetainedBytes: estimate }, { nowMs: () => 12_000 });
  if (options.seed !== false && !seedStarterChart(composition.controller).seeded) throw new Error("SEED_REFUSED");
  const recovery = createRecoveryHarness();
  let retirements = 0;
  let exports = 0;
  const real = options.retirement ?? createX1SerializedTransportRetirementAdapter(transport.service, transport.nextRequestId);
  const service = createStudioDocumentImport({ composition, recovery: recovery.service,
    estimateHistoryRetainedBytes: estimate, exportCurrent: () => { exports++; },
    retirement: { retireImportReplacement: (request) => { retirements++; return real.retireImportReplacement(request); } },
  });
  return { composition, recovery, transport, service, retirements: () => retirements, exports: () => exports };
}

describe("U5 production import workflow", () => {
  test("legacy JSON preserves exact manual notes and exposes the reviewed report groups", async () => {
    const h = await harness({ seed: false }); h.service.open();
    const source = JSON.stringify({ name: "Legacy manual chart", description: "Portable manual voicing",
      sections: [{ name: "A", chords: [{ name: "Cmaj7", root: "C", type: "maj7", notes: ["C3", "E3", "G3", "B3"], annotation: "Keep me" }] }] });
    await h.service.previewPaste(source, "legacy-json");
    expect(h.service.getSnapshot()).toMatchObject({ phase: "preview", title: "Legacy manual chart", summary: { manualVoicings: 1, chordEvents: 1 } });
    expect(h.service.getSnapshot().groups.map((group) => group.name)).toEqual(["preserved", "canonicalized", "custom", "ignored", "rejected"]);
    expect(h.service.getSnapshot().groups[0]?.items.some((item) => item.code === "legacy.preserved.manual_notes")).toBe(true);
    await h.service.requestCommit();
    expect(h.service.getSnapshot().open).toBe(false);
    const event = h.composition.readApplicationState().document.sections[0]?.measures[0]?.events[0];
    expect(event?.annotation).toBe("Keep me"); expect(event?.voicing.mode).toBe("manual");
  });
  test("independent nested JSON stays a preview until confirmation, then replaces exactly and undoes", async () => {
    const h = await harness();
    const before = h.composition.readApplicationState();
    h.service.open();
    await h.service.previewPaste(nested, "canonical-json");
    expect(h.service.getSnapshot().phase).toBe("preview");
    expect(h.composition.readApplicationState().document).toBe(before.document);
    expect(h.composition.readApplicationState().history).toBe(before.history);
    expect(h.composition.readApplicationState().documentTransition.kind).toBe("idle");
    expect(h.composition.readApplicationState().pendingRequests).toEqual(before.pendingRequests);
    expect(h.retirements()).toBe(0);
    await h.service.requestCommit();
    expect(h.service.getSnapshot().phase).toBe("confirm");
    expect(h.retirements()).toBe(0);
    await h.service.confirm(false);
    expect(h.service.getSnapshot().open).toBe(false);
    expect(h.retirements()).toBe(1);
    const expected: unknown = JSON.parse(nested);
    const observed: unknown = h.composition.readApplicationState().document;
    expect(observed).toEqual(expected);
    expect(h.composition.readApplicationState().exportRevision).toBeNull();
    expect(h.composition.readApplicationState().dialogs).toEqual([]);
    expect(h.composition.readApplicationState().importDraft).toBeNull();
    expect(h.composition.controller.undo().ok).toBe(true);
    expect(h.composition.readApplicationState().document).toEqual(before.document);
  });

  test("Cancel releases draft and candidate with no replacement or marker effects", async () => {
    const h = await harness(); const before = h.composition.readApplicationState();
    h.service.open(); await h.service.previewPaste(minimal, "auto");
    await h.service.requestCommit(); h.service.cancel();
    const after = h.composition.readApplicationState();
    expect(after.document).toBe(before.document); expect(after.history).toBe(before.history);
    expect(after.exportRevision).toBe(before.exportRevision); expect(after.documentTransition.kind).toBe("idle");
    expect(after.importDraft).toBeNull(); expect(after.dialogs).toEqual([]); expect(h.retirements()).toBe(0);
    await h.service.confirm(true); expect(h.retirements()).toBe(0);
  });

  test("a stale preview cannot overwrite edits or start retirement", async () => {
    const h = await harness(); h.service.open(); await h.service.previewPaste(minimal, "auto");
    expect(h.composition.controller.setTitle("Edited after preview").ok).toBe(true);
    const before = h.composition.readApplicationState();
    await h.service.requestCommit();
    expect(h.service.getSnapshot().message).toContain("command.stale_revision");
    expect(h.composition.readApplicationState().document).toBe(before.document); expect(h.retirements()).toBe(0);
  });

  test("a cancelled slow file read cannot publish over a later preview", async () => {
    const h = await harness(); h.service.open();
    let complete: (value: unknown) => void = () => { throw new Error("READ_NOT_STARTED"); };
    const slow = h.service.previewSource({ channel: "file", displayName: "slow.json", mediaType: "application/json", declaredByteLength: null,
      readAtMost: () => new Promise((resolve) => { complete = resolve; }),
    }, "auto");
    h.service.cancel(); h.service.open(); await h.service.previewPaste(minimal, "auto");
    const bytes = new TextEncoder().encode(nested); complete({ ok: true, bytes, observedByteLength: bytes.length }); await slow;
    expect(h.service.getSnapshot().title).toBe("Changes"); expect(h.retirements()).toBe(0);
  });

  test("oversized replacement needs the exact displayed explicit acknowledgement", async () => {
    const h = await harness({ seed: false, estimate: 50_000_000 });
    h.service.open(); await h.service.previewPaste(minimal, "auto");
    expect(h.service.getSnapshot().nonUndoable).toBe(true);
    await h.service.requestCommit(); expect(h.service.getSnapshot().phase).toBe("confirm");
    await h.service.confirm(false); expect(h.retirements()).toBe(0);
    expect(h.service.getSnapshot().message).toContain("history.nonundoable_confirmation_required");
    await h.service.confirm(true); expect(h.retirements()).toBe(1);
    expect(h.service.getSnapshot().open).toBe(false);
    expect(h.composition.readApplicationState().history.undo).toEqual([]);
    expect(h.composition.controller.undo().ok).toBe(false);
  });

  test("retirement failure preserves document/history and returns transition to idle", async () => {
    const h = await harness({ retirement: { retireImportReplacement: () => Promise.resolve({
      ok: false, code: "transport.replacement_retirement_failed", retirementEffect: "none",
    }) } });
    const before = h.composition.readApplicationState();
    h.service.open(); await h.service.previewPaste(minimal, "auto"); await h.service.requestCommit(); await h.service.confirm(false);
    expect(h.service.getSnapshot().phase).toBe("failed");
    expect(h.composition.readApplicationState().document).toBe(before.document);
    expect(h.composition.readApplicationState().history).toBe(before.history);
    expect(h.composition.readApplicationState().documentTransition.kind).toBe("idle");
  });

  test("JSON validation refuses future/duplicate/oversized inputs and a later valid input succeeds", async () => {
    const h = await harness({ seed: false }); h.service.open();
    const before = h.composition.readApplicationState().document;
    for (const [input, code] of [[minimal.replace('"changes.progression.v2"', '"changes.progression.v3"'), "import.future_schema_unsupported"],
      ['{"schema":"changes.progression.v2","schema":"changes.progression.v2"}', "import.json_duplicate_key"],
      ["x".repeat(2_097_153), "limit.import_bytes_exceeded"]]) {
      if (input === undefined || code === undefined) throw new Error("MISSING_CASE");
      await h.service.previewPaste(input, "auto"); expect(h.service.getSnapshot().message).toContain(code);
      expect(h.composition.readApplicationState().document).toBe(before);
    }
    await h.service.previewPaste(minimal, "auto"); await h.service.requestCommit();
    expect(h.service.getSnapshot().open).toBe(false); expect(h.retirements()).toBe(1);
  });

  test("chart text routes into the real quick-entry draft without replacing the chart", async () => {
    const h = await harness(); const before = h.composition.readApplicationState().document;
    h.service.open(); await h.service.previewPaste("| Dm7 G7 | Cmaj7 |", "chart-text");
    expect(h.service.getSnapshot()).toMatchObject({ phase: "chart-text" }); await h.service.requestCommit(); expect(h.retirements()).toBe(0);
    h.service.stageChartText(); expect(h.composition.readApplicationState().document).toBe(before);
    expect(h.composition.readApplicationState().quickEntry.text).toBe("| Dm7 G7 | Cmaj7 |");
    expect(h.service.getSnapshot().open).toBe(false);
  });

  test("changing the source invalidates the old candidate; export-first cancels inertly", async () => {
    const h = await harness(); const before = h.composition.readApplicationState().document;
    h.service.open(); await h.service.previewPaste(minimal, "auto"); h.service.invalidatePreview();
    await h.service.requestCommit(); expect(h.retirements()).toBe(0); expect(h.service.getSnapshot().summary).toBeNull();
    await h.service.previewPaste(minimal, "auto"); await h.service.requestCommit(); h.service.exportCurrentFirst();
    expect(h.exports()).toBe(1); expect(h.service.getSnapshot().open).toBe(false);
    expect(h.composition.readApplicationState().document).toBe(before); expect(h.retirements()).toBe(0);
  });

  test("section-headed text uses the insertion grammar and JSON arrays remain refused", async () => {
    const h = await harness(); h.service.open();
    await h.service.previewPaste("[Bridge]\n| Dm7 G7 | Cmaj7 |", "auto");
    expect(h.service.getSnapshot()).toMatchObject({ phase: "chart-text", issueCodes: [] });
    h.service.stageChartText();
    expect(h.composition.readApplicationState().quickEntry.text).toBe("[Bridge]\n| Dm7 G7 | Cmaj7 |");
    h.service.open(); await h.service.previewPaste('[{"name":"Cmaj7"}]', "auto");
    expect(h.service.getSnapshot().phase).toBe("failed"); expect(h.retirements()).toBe(0);
  });

  test("an oversized paste retires a pending read and cannot reuse its candidate", async () => {
    const h = await harness(); h.service.open();
    let finish: (value: unknown) => void = () => { throw new Error("READ_NOT_STARTED"); };
    const pending = h.service.previewSource({ channel: "file", displayName: "pending.json", mediaType: "application/json", declaredByteLength: null,
      readAtMost: () => new Promise((resolve) => { finish = resolve; }),
    }, "auto");
    await h.service.previewPaste("x".repeat(2_097_153), "auto");
    const bytes = new TextEncoder().encode(minimal); finish({ ok: true, bytes, observedByteLength: bytes.length }); await pending;
    expect(h.service.getSnapshot().phase).toBe("failed");
    expect(h.composition.readApplicationState().importDraft).toBeNull();
    await h.service.requestCommit(); expect(h.retirements()).toBe(0);
  });

  test("host removal invalidates commit authority even without a Cancel callback", async () => {
    const h = await harness(); h.service.open(); await h.service.previewPaste(minimal, "auto");
    expect(h.composition.replacementWorkflow.applyLifecycleIntent({ kind: "pop-dialog", dialogId: "studio-document-import" }).ok).toBe(true);
    expect(h.service.getSnapshot().open).toBe(false);
    await h.service.requestCommit(); expect(h.retirements()).toBe(0);
    h.service.open(); expect(h.service.getSnapshot().phase).toBe("input");
    await h.service.requestCommit(); expect(h.retirements()).toBe(0);
  });
});
