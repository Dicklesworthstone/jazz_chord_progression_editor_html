import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";
import { createStudioBootstrap, createStudioCompositionOverState, createStudioDocumentImport,
  createX1SerializedTransportRetirementAdapter } from "../../src/application";
import { seedStarterChart } from "../../src/application/runtime";
import type { StudioImportRetirementAdapter } from "../../src/application/studio-import-replacement";
import { createRecoveryHarness } from "../support/recovery-test-kit";
import { compiledPlan, createTransportHarness, initializePayload } from "../support/transport-test-kit";

const minimal = await readFile(new URL("../fixtures/interchange/goldens/minimal.changes.json", import.meta.url), "utf8");
const nested = await readFile(new URL("../fixtures/interchange/goldens/nested.changes.json", import.meta.url), "utf8");

async function harness(options: { seed?: boolean; estimate?: number; retirement?: StudioImportRetirementAdapter } = {}) {
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
  const real = createX1SerializedTransportRetirementAdapter(transport.service, transport.nextRequestId, {
    beforeSubmit: composition.replacementWorkflow.expectTransportRetirement,
    settled: composition.replacementWorkflow.settleTransportRetirement,
  });
  const service = createStudioDocumentImport({ composition, recovery: recovery.service,
    estimateHistoryRetainedBytes: estimate, exportCurrent: () => { exports++; },
    retirement: { ...(options.retirement ?? real), retireImportReplacement: (request) => { retirements++; return (options.retirement ?? real).retireImportReplacement(request); } },
  });
  return { composition, recovery, transport, service, real, retirements: () => retirements, exports: () => exports };
}

describe("U5 production import workflow", () => {
  test("retained legacy refusals carry their exact codes and source paths into the review", async () => {
    const h = await harness(); const before = h.composition.readApplicationState(); h.service.open();
    await h.service.previewPaste(JSON.stringify({ name: "Partial chart", sections: [{ name: "A", chords: [
      { name: "Cmaj7", notes: ["C3", "E3", "G3", "B3"] }, null,
    ] }, null] }), "legacy-json");
    const view = h.service.getSnapshot();
    expect(view.phase).toBe("preview"); expect(view.omittedItems).toBe(0);
    expect(view.groups.find(group => group.name === "rejected")?.items).toEqual([
      { code: "legacy.rejected.event_not_object", sourcePath: ["sections", 0, "chords", 1], targetPath: null },
      { code: "legacy.rejected.section_not_object", sourcePath: ["sections", 1], targetPath: null },
    ]);
    expect(view.summary).toMatchObject({ chordEvents: 1, migrationRejectedEvents: 1, migrationRejectedSections: 1 });
    expect(h.retirements()).toBe(0); h.service.cancel();
    expect(h.composition.readApplicationState().document).toBe(before.document);
    expect(h.composition.readApplicationState().history).toBe(before.history);
  });
  test("complete legacy rejection totals survive the first-256 report projection", async () => {
    const h = await harness({ seed: false }); h.service.open();
    await h.service.previewPaste(JSON.stringify({ name: "Partial legacy chart", sections: [{ name: "A", chords: [
      ...Array.from({ length: 300 }, () => ({ name: "Cmaj7", notes: ["C3", "E3", "G3", "B3"] })), null,
    ] }, null] }), "auto");
    expect(h.service.getSnapshot()).toMatchObject({ phase: "preview", summary: {
      chordEvents: 300, manualVoicings: 300, migrationRejectedSections: 1, migrationRejectedEvents: 1,
    } });
    expect(h.service.getSnapshot().omittedItems).toBeGreaterThan(0);
    expect(h.service.getSnapshot().groups.find(group => group.name === "rejected")?.items).toEqual([]);
    expect(h.retirements()).toBe(0);
  });
  test("a refused new source clears the previous candidate's displayed summary and report", async () => {
    const h = await harness(); h.service.open();
    await h.service.previewPaste(minimal, "auto");
    expect(h.service.getSnapshot().summary).not.toBeNull();
    const before = h.composition.readApplicationState();
    await h.service.previewPaste("x".repeat(2_097_153), "auto");
    expect(h.service.getSnapshot()).toMatchObject({ phase: "failed", summary: null, title: null,
      sourceFormat: null, groups: [], omittedItems: 0 });
    expect(h.composition.readApplicationState().document).toBe(before.document);
    expect(h.composition.readApplicationState().history).toBe(before.history);
  });
  for (const oversized of [false, true]) {
    test(`the import confirmation and Back keep one correctly typed A0 dialog (oversized=${String(oversized)})`, async () => {
      const h = await harness({ seed: !oversized, estimate: oversized ? 50_000_000 : 4000 });
      const before = h.composition.readApplicationState();
      h.service.open(); await h.service.previewPaste(minimal, "auto");
      expect(h.composition.readApplicationState().dialogs.map(dialog => dialog.kind)).toEqual(["import-preview"]);
      await h.service.requestCommit();
      expect(h.composition.readApplicationState().dialogs.map(dialog => dialog.kind))
        .toEqual([oversized ? "history-limit" : "import-confirm"]);
      h.service.backToPreview();
      expect(h.composition.readApplicationState().dialogs.map(dialog => dialog.kind)).toEqual(["import-preview"]);
      expect(h.composition.readApplicationState().document).toBe(before.document);
      expect(h.composition.readApplicationState().history).toBe(before.history);
      expect(h.retirements()).toBe(0);
      await h.service.requestCommit(); h.service.cancel();
      expect(h.composition.readApplicationState().dialogs).toEqual([]);
      expect(h.composition.readApplicationState().document).toBe(before.document);
    });
  }
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
    expect(h.composition.readApplicationState().transport.status).toBe("ready");
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

  for (const [label, retire] of [
    ["ambiguous effect", () => Promise.resolve({ ok: false, code: "transport.replacement_retirement_failed", retirementEffect: "unknown" })],
    ["throwing evidence reader", () => Promise.resolve(Object.defineProperty({}, "ok", { get() { throw new Error("BAD_READER"); } }))],
    ["rejected retirement", () => Promise.reject(new Error("UNKNOWN_EFFECT"))],
  ] as const) {
    test(`${label} cannot unlock import without a proven safe stop`, async () => {
      const h = await harness({ retirement: { retireImportReplacement: retire } });
      const before = h.composition.readApplicationState();
      h.service.open(); await h.service.previewPaste(minimal, "auto"); await h.service.requestCommit(); await h.service.confirm(false);
      expect(h.composition.readApplicationState().document).toBe(before.document);
      expect(h.composition.readApplicationState().history).toBe(before.history);
      expect(h.composition.readApplicationState().documentTransition.kind).toBe("retiring-transport");
      expect(h.composition.controller.setTitle("Unsafe edit").ok).toBe(false);
      expect(h.service.getSnapshot().message).toContain("Reload");
      h.service.cancel(); expect(h.service.getSnapshot().open).toBe(true);
    });
  }

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

  for (const key of ['"beatsPerBar"', '"\\u0062eatsPerBar"']) {
    test(`nested duplicate ${key} refuses before retirement and a fresh valid preview still works`, async () => {
      const h = await harness(); const before = h.composition.readApplicationState();
      h.service.open();
      const source = minimal.replace('"beatsPerBar": 4', `"beatsPerBar": 4, ${key}: 3`);
      expect(source).not.toBe(minimal);
      await h.service.previewPaste(source, "canonical-json");
      expect(h.service.getSnapshot().issueCodes).toContain("import.json_duplicate_key");
      await h.service.requestCommit();
      const after = h.composition.readApplicationState();
      expect(after.document).toBe(before.document); expect(after.history).toBe(before.history);
      expect(after.exportRevision).toBe(before.exportRevision); expect(h.retirements()).toBe(0);
      expect(after.importDraft).toBeNull(); expect(after.documentTransition.kind).toBe("idle");
      await h.service.previewPaste(minimal, "canonical-json");
      await h.service.requestCommit(); await h.service.confirm(false);
      expect(h.service.getSnapshot().open).toBe(false); expect(h.retirements()).toBe(1);
      const expected: unknown = JSON.parse(minimal);
      const observed: unknown = h.composition.readApplicationState().document;
      expect(observed).toEqual(expected);
    });
  }

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

  test("receipt settlement precedes document publication and repeated replacement retires the actual next epoch", async () => {
    const h = await harness();
    const observations: { title: string; status: string; generation: number }[] = [];
    h.composition.controller.subscribe(() => { const state = h.composition.readApplicationState();
      observations.push({ title: state.document.title, status: state.transport.status, generation: state.transport.generation });
    });
    const generation = h.transport.service.inspectTransport().generation;
    const before = h.composition.readApplicationState().document.title;
    h.service.open(); await h.service.previewPaste(nested, "auto"); await h.service.requestCommit(); await h.service.confirm(false);
    expect(observations.some((entry) => entry.title === before && entry.status === "stopping")).toBe(true);
    expect(observations.some((entry) => entry.title === before && entry.status === "ready")).toBe(true);
    expect(observations.filter((entry) => entry.title === "Nested Canonical Order").every((entry) => entry.status === "ready")).toBe(true);
    // A0's frozen law advances generation only from genuine notifications.
    expect(h.composition.readApplicationState().transport.generation).toBe(generation);
    expect(h.transport.service.inspectTransport().generation).toBe(generation + 1);
    h.service.open(); await h.service.previewPaste(minimal, "auto"); await h.service.requestCommit(); await h.service.confirm(false);
    expect(h.service.getSnapshot().open).toBe(false);
    expect(h.composition.readApplicationState().document.title).toBe("Changes");
    expect(h.transport.service.inspectTransport().generation).toBe(generation + 2);
  });
});

for (const defect of ["unknown-effect", "throwing-reader"] as const) {
test(`import discards ${defect}, awaits one real reconciliation, and requires a fresh preview`, async () => {
  let corrupt = true; let reconciliations = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let entered: (() => void) | undefined;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const h = await harness({ retirement: {
    retireImportReplacement: async request => {
      const evidence = await h.real.retireImportReplacement(request);
      return !corrupt ? evidence : defect === "unknown-effect" ? { ok: false, retirementEffect: "unknown" }
        : Object.defineProperty({}, "ok", { get() { throw new Error("BAD_READER"); } });
    },
    reconcileImportReplacement: async request => { reconciliations++; entered?.(); await gate; return h.real.reconcileImportReplacement(request); },
  } });
  const before = h.composition.readApplicationState();
  const generation = h.transport.service.inspectTransport().generation;
  h.service.open(); await h.service.previewPaste(nested, "auto"); await h.service.requestCommit();
  const pending = h.service.confirm(false); await started;
  expect(h.composition.controller.setTitle("Forbidden").ok).toBe(false);
  h.service.cancel(); await h.service.confirm(false); expect(h.retirements()).toBe(1);
  release?.(); await pending;
  const after = h.composition.readApplicationState();
  expect(after.document).toBe(before.document); expect(after.history).toBe(before.history);
  expect(after.bookmarks).toEqual(before.bookmarks); expect(after.exportRevision).toBe(before.exportRevision);
  expect(after.recovery).toEqual(before.recovery); expect(after.pendingRequests).toEqual(before.pendingRequests);
  expect(after.documentTransition.kind).toBe("idle");
  expect(h.service.getSnapshot()).toMatchObject({ phase: "failed", reconciliationRequired: false });
  expect(h.service.getSnapshot().message).toContain("Playback was safely stopped");
  expect(h.transport.service.inspectTransport().generation).toBe(generation + 2);
  expect(h.transport.timer.activeHandleCount()).toBe(0);
  expect(h.transport.engine.inspectAudioEngine().nonreleasingVoiceCount).toBe(0);
  await h.service.confirm(true); expect(h.retirements()).toBe(1);
  corrupt = false; await h.service.previewPaste(nested, "auto"); await h.service.requestCommit(); await h.service.confirm(false);
  const expected: unknown = JSON.parse(nested);
  const observed: unknown = h.composition.readApplicationState().document;
  expect(observed).toEqual(expected);
  expect(h.transport.service.inspectTransport().generation).toBe(generation + 3);
  expect(reconciliations).toBe(1);
  expect(h.composition.controller.undo().ok).toBe(true);
  expect(h.composition.readApplicationState().document).toEqual(before.document);
});
}
for (const defect of ["request", "generation", "postcondition", "extra", "throw"] as const) {
  test(`import rejects invalid reconciliation (${defect})`, async () => {
    let calls = 0;
    const h = await harness({ retirement: {
      retireImportReplacement: () => Promise.resolve({ ok: true, value: {} }),
      reconcileImportReplacement: request => {
        calls++;
        if (defect === "throw") throw new Error("UNPROVEN_STOP");
        return Promise.resolve({ ok: true, authority: "x1-serialized-transport",
          request: defect === "request" ? { ...request, candidateDocumentId: "wrong" } : request,
          commandRequestId: 2, observedGeneration: 1, resultingGeneration: defect === "generation" ? 3 : 2,
          state: "ready", noFutureAttack: defect !== "postcondition", ...(defect === "extra" ? { extra: true } : {}) });
      },
    } });
    h.service.open(); await h.service.previewPaste(minimal, "auto"); await h.service.requestCommit(); await h.service.confirm(false);
    expect(h.service.getSnapshot().reconciliationRequired).toBe(true);
    expect(h.composition.controller.setTitle("Forbidden").ok).toBe(false); expect(calls).toBe(1);
    h.service.invalidatePreview(); h.service.exportCurrentFirst(); h.service.cancel();
    expect(h.service.getSnapshot().reconciliationRequired).toBe(true); expect(h.exports()).toBe(0);
  });
}

for (const rehost of [false, true]) {
  test(`pending import cannot publish into a removed or replaced A0 host (rehost=${String(rehost)})`, async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const h = await harness({ retirement: { retireImportReplacement: async request => {
      await gate; return h.real.retireImportReplacement(request);
    } } });
    const before = h.composition.readApplicationState();
    h.service.open(); await h.service.previewPaste(nested, "auto"); await h.service.requestCommit();
    const pending = h.service.confirm(false);
    const host = h.composition.readApplicationState().dialogs.at(-1);
    if (host === undefined) throw new Error("HOST_MISSING");
    expect(h.composition.replacementWorkflow.applyLifecycleIntent({ kind: "pop-dialog", dialogId: host.id }).ok).toBe(true);
    if (rehost) expect(h.composition.replacementWorkflow.applyLifecycleIntent({ kind: "push-dialog", dialog: { ...host } }).ok).toBe(true);
    const replacementHost = h.composition.readApplicationState().dialogs.at(-1);
    h.service.open(); expect(h.composition.readApplicationState().dialogs.at(-1)).toBe(replacementHost);
    release?.(); await pending;
    const after = h.composition.readApplicationState();
    expect(after.document).toBe(before.document); expect(after.revision).toBe(before.revision);
    expect(after.history).toBe(before.history); expect(after.bookmarks).toEqual(before.bookmarks);
    expect(after.exportRevision).toBe(before.exportRevision); expect(after.recovery).toEqual(before.recovery);
    expect(after.documentTransition.kind).toBe("idle"); expect(after.pendingRequests).toEqual(before.pendingRequests);
    expect(h.service.getSnapshot().message).toContain("ui.stale_owner");
    expect(h.service.getSnapshot().open).toBe(false);
    if (rehost) {
      h.service.cancel();
      expect(h.composition.readApplicationState().dialogs.at(-1)).toBe(replacementHost);
      expect(h.composition.replacementWorkflow.applyLifecycleIntent({ kind: "pop-dialog", dialogId: host.id }).ok).toBe(true);
    }
    h.service.open(); await h.service.previewPaste(nested, "auto"); await h.service.requestCommit(); await h.service.confirm(false);
    const observed: unknown = h.composition.readApplicationState().document;
    const expected: unknown = JSON.parse(nested); expect(observed).toEqual(expected);
    expect(h.composition.controller.undo().ok).toBe(true); expect(h.composition.readApplicationState().document).toEqual(before.document);
  });
}
for (const defect of ["false", "non-boolean", "throw"] as const) {
  test(`import rejects lost UI consent at publication (${defect})`, async () => {
    const h = await harness(); const before = h.composition.readApplicationState();
    h.service.open(); await h.service.previewPaste(nested, "auto"); await h.service.requestCommit();
    let calls = 0;
    await h.service.confirm(false, () => { calls++; if (defect === "throw") throw new Error("OWNER_GONE"); return defect === "false" ? false : "yes"; });
    expect(h.composition.readApplicationState().document).toBe(before.document);
    expect(h.composition.readApplicationState().history).toBe(before.history);
    expect(h.service.getSnapshot()).toMatchObject({ open: false, phase: "failed" });
    expect(h.service.getSnapshot().message).toContain("ui.stale_owner"); expect(calls).toBe(1);
    h.service.open(); await h.service.previewPaste(nested, "auto"); await h.service.requestCommit();
    await h.service.confirm(false, () => true);
    expect(h.composition.readApplicationState().document.title).toBe("Nested Canonical Order");
  });
}

test("pristine import and invalidation during retirement share the same publication guard", async () => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const h = await harness({ seed: false, retirement: { retireImportReplacement: async request => {
    await gate; return h.real.retireImportReplacement(request);
  } } });
  const before = h.composition.readApplicationState();
  h.service.open(); await h.service.previewPaste(nested, "auto");
  const pending = h.service.requestCommit(() => true);
  expect(h.service.getSnapshot().phase).toBe("committing");
  h.service.invalidateHost();
  release?.(); await pending;
  expect(h.composition.readApplicationState().document).toBe(before.document);
  expect(h.service.getSnapshot()).toMatchObject({ open: false, phase: "failed" });
  h.service.open(); await h.service.previewPaste(nested, "auto"); await h.service.requestCommit(() => true);
  expect(h.composition.readApplicationState().document.title).toBe("Nested Canonical Order");
});
for (const uncertain of [false, true]) {
  test(`retirement failure cannot alter a replacement host (uncertain=${String(uncertain)})`, async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const h = await harness({ retirement: { retireImportReplacement: async () => {
      await gate; return { ok: false, code: "transport.replacement_retirement_failed", retirementEffect: uncertain ? "unknown" : "none" };
    } } });
    h.service.open(); await h.service.previewPaste(nested, "auto"); await h.service.requestCommit();
    const pending = h.service.confirm(false);
    const host = h.composition.readApplicationState().dialogs.at(-1);
    if (host === undefined) throw new Error("HOST_MISSING");
    h.composition.replacementWorkflow.applyLifecycleIntent({ kind: "pop-dialog", dialogId: host.id });
    h.composition.replacementWorkflow.applyLifecycleIntent({ kind: "push-dialog", dialog: { ...host } });
    const replacement = h.composition.readApplicationState().dialogs.at(-1);
    release?.(); await pending; h.service.cancel(); h.service.open();
    expect(h.composition.readApplicationState().dialogs.at(-1)).toBe(replacement);
    expect(h.service.getSnapshot().open).toBe(false);
    expect(h.service.getSnapshot().reconciliationRequired).toBe(uncertain);
    expect(h.composition.readApplicationState().documentTransition.kind).toBe(uncertain ? "retiring-transport" : "idle");
  });
}
