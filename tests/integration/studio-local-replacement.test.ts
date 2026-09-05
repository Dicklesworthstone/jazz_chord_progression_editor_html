import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createStudioBootstrap, createStudioCompositionOverState, createStudioLocalReplacement,
  createStudioDocumentImport, createX1SerializedTransportRetirementAdapter } from "../../src/application";
import { seedStarterChart } from "../../src/application/runtime";
import { selectReplacementConfirmation } from "../../src/application/studio-replacement-confirmation";
import { PROGRESSION_LIBRARY } from "../../src/application/studio-progression-library";
import type { StudioReplacementRetirementAdapter, LocalReplacementRetirementRequest } from "../../src/application/x1-retirement-adapter";
import { createRecoveryHarness } from "../support/recovery-test-kit";
import { compiledPlan, createTransportHarness, initializePayload } from "../support/transport-test-kit";

async function harness(options: { seed?: boolean; estimate?: number;
  retirement?: Pick<StudioReplacementRetirementAdapter, "retireLocalReplacement"> &
    Partial<Pick<StudioReplacementRetirementAdapter, "reconcileLocalReplacement">> } = {}) {
  const boot = createStudioBootstrap(); if (!boot.ok) throw new Error("BOOTSTRAP");
  const transport = createTransportHarness(); await transport.submit(initializePayload(compiledPlan()));
  const estimate = () => options.estimate ?? 4_000;
  const composition = createStudioCompositionOverState({ ...boot.value.state,
    transport: { ...boot.value.state.transport, generation: transport.service.inspectTransport().generation } },
    { ...boot.value.dependencies, estimateHistoryRetainedBytes: estimate }, { nowMs: () => 12_000 });
  if (options.seed !== false && !seedStarterChart(composition.controller).seeded) throw new Error("SEED");
  const recovery = createRecoveryHarness();
  const requests: LocalReplacementRetirementRequest[] = []; let exports = 0;
  const real = createX1SerializedTransportRetirementAdapter(transport.service, transport.nextRequestId, {
    beforeSubmit: composition.replacementWorkflow.expectTransportRetirement,
    settled: composition.replacementWorkflow.settleTransportRetirement,
  });
  const service = createStudioLocalReplacement({ composition, recovery: recovery.service, estimateHistoryRetainedBytes: estimate,
    exportCurrent: () => { exports++; }, retirement: { ...(options.retirement ?? real), retireLocalReplacement: request => {
      requests.push(request); return (options.retirement ?? real).retireLocalReplacement(request);
    } } });
  return { composition, service, transport, recovery, requests, real, exports: () => exports, estimate };
}

describe("U5 New and lesson replacement through real A0/X1", () => {
  for (const origin of ["new", "lesson"] as const) {
    test(`${origin} stays inert until confirmation, publishes once, and Undo/Redo preserve exact documents and bookmarks`, async () => {
      const h = await harness(); const before = h.composition.readApplicationState();
      if (origin === "new") await h.service.requestNew(); else await h.service.requestLesson("two-five-one");
      expect(h.service.getSnapshot()).toMatchObject({ open: true, phase: "confirm", origin });
      expect(h.composition.readApplicationState().document).toBe(before.document);
      expect(h.composition.readApplicationState().history).toBe(before.history);
      expect(h.requests).toHaveLength(0);
      const publications: string[] = [];
      h.composition.controller.subscribe(() => { const now = h.composition.readApplicationState();
        if (now.document !== before.document) publications.push(String(now.document.id)); });
      await h.service.confirm(false);
      expect(h.service.getSnapshot().message).not.toContain("unchanged");
      expect(h.service.getSnapshot().open).toBe(false);
      expect(h.requests).toHaveLength(1); expect(h.requests[0]?.origin).toBe(origin);
      expect(h.requests[0]).not.toHaveProperty("sourceFormat");
      const after = h.composition.readApplicationState();
      expect(after.revision).toBe(before.revision + 1);
      expect(after.history.undo.length).toBe(before.history.undo.length + 1);
      expect(after.transport.status).toBe("ready"); expect(after.documentTransition.kind).toBe("idle");
      expect(new Set(publications).size).toBe(1);
      expect(after.exportRevision).toBe(before.exportRevision);
      if (origin === "new") expect(after.document.sections[0]?.measures[0]?.events).toEqual([]);
      else expect(after.document.sections.flatMap(s => s.measures.flatMap(m => m.events.map(e => e.chord.kind === "parsed" ? e.chord.sourceText : "custom"))))
        .toEqual(["Dm7", "G7", "Cmaj7", "Cmaj7"]);
      expect(h.composition.controller.undo().ok).toBe(true);
      expect(h.composition.readApplicationState().document).toEqual(before.document);
      expect(h.composition.readApplicationState().bookmarks).toEqual(before.bookmarks);
      expect(h.composition.controller.redo().ok).toBe(true);
      expect(h.composition.readApplicationState().document).toEqual(after.document);
    });
  }
  test("Cancel and export-first preserve state, and stale confirmation starts no retirement", async () => {
    const h = await harness(); const before = h.composition.readApplicationState();
    await h.service.requestNew(); h.service.cancel(); await h.service.confirm(true);
    expect(h.composition.readApplicationState().document).toBe(before.document); expect(h.requests).toHaveLength(0);
    await h.service.requestLesson("two-five-one"); h.service.exportCurrentFirst(); expect(h.exports()).toBe(1);
    expect(h.composition.readApplicationState().history).toBe(before.history);
    await h.service.requestNew(); expect(h.composition.controller.setTitle("Later edit").ok).toBe(true);
    await h.service.confirm(false); expect(h.service.getSnapshot().message).toContain("command.stale_revision");
    expect(h.composition.readApplicationState().document.title).toBe("Later edit"); expect(h.requests).toHaveLength(0);
  });
  test("an empty chart replaces on the gesture and an oversized boundary requires actual acknowledgement", async () => {
    const h = await harness({ seed: false }); await h.service.requestLesson("two-five-one");
    expect(h.service.getSnapshot().open).toBe(false); expect(h.requests).toHaveLength(1);
    expect(h.composition.readApplicationState().focusRequest?.reason).toBe("replacement");
    const large = await harness({ seed: false, estimate: 50_000_000 }); await large.service.requestNew();
    expect(large.service.getSnapshot()).toMatchObject({ open: true, nonUndoable: true, exportRecommended: true });
    await large.service.confirm(false); expect(large.requests).toHaveLength(0);
    await large.service.confirm(true); expect(large.requests).toHaveLength(1);
    expect(large.service.getSnapshot().open).toBe(false);
    expect(large.composition.readApplicationState().history.undo).toEqual([]);
    expect(large.composition.controller.undo().ok).toBe(false);
  });
  test("no-effect retirement refusal preserves the chart and unlocks a retry", async () => {
    const h = await harness({ retirement: { retireLocalReplacement: () => Promise.resolve({ ok: false,
      code: "transport.replacement_retirement_failed", retirementEffect: "none" }) } });
    const before = h.composition.readApplicationState(); await h.service.requestNew(); await h.service.confirm(false);
    expect(h.service.getSnapshot().phase).toBe("failed");
    expect(h.composition.readApplicationState().document).toBe(before.document);
    expect(h.composition.readApplicationState().history).toBe(before.history);
    expect(h.composition.readApplicationState().documentTransition.kind).toBe("idle");
    h.service.cancel(); await h.service.requestNew(); expect(h.service.getSnapshot().phase).toBe("confirm");
  });
  test("a pending retirement locks history and repeated Confirm cannot publish twice", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const h = await harness({ retirement: { retireLocalReplacement: async request => {
      await gate; return h.real.retireLocalReplacement(request);
    } } });
    await h.service.requestNew(); const pending = h.service.confirm(false);
    await h.service.confirm(false); h.service.cancel();
    expect(h.requests).toHaveLength(1); expect(h.composition.controller.undo().ok).toBe(false);
    expect(h.composition.controller.setTitle("Forbidden").ok).toBe(false);
    release?.(); await pending; expect(h.service.getSnapshot().open).toBe(false);
  });
  test("invalid retirement evidence consumes preparation and keeps a visible reconciliation lock", async () => {
    const h = await harness({ retirement: { retireLocalReplacement: () => Promise.resolve({ ok: true, value: {} }) } });
    const before = h.composition.readApplicationState(); await h.service.requestNew(); await h.service.confirm(false);
    expect(h.service.getSnapshot().reconciliationRequired).toBe(true);
    expect(h.composition.readApplicationState().document).toBe(before.document);
    expect(h.composition.controller.setTitle("Forbidden").ok).toBe(false);
    h.service.cancel(); expect(h.service.getSnapshot().open).toBe(true);
  });
  for (const origin of ["new", "lesson"] as const) for (const rehost of [false, true]) {
    test(`${origin} does not publish into a removed or replaced confirmation host (rehost=${String(rehost)})`, async () => {
      let release: (() => void) | undefined;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const h = await harness({ retirement: { retireLocalReplacement: async request => {
        await gate; return h.real.retireLocalReplacement(request);
      } } });
      const before = h.composition.readApplicationState();
      if (origin === "new") await h.service.requestNew(); else await h.service.requestLesson("two-five-one");
      const pending = h.service.confirm(false);
      const host = h.composition.readApplicationState().dialogs.at(-1);
      if (host === undefined) throw new Error("CONFIRMATION_HOST_MISSING");
      expect(h.composition.replacementWorkflow.applyLifecycleIntent({ kind: "pop-dialog", dialogId: host.id }).ok).toBe(true);
      if (rehost) expect(h.composition.replacementWorkflow.applyLifecycleIntent({ kind: "push-dialog", dialog: { ...host } }).ok).toBe(true);
      release?.(); await pending;
      const after = h.composition.readApplicationState();
      expect(after.document).toBe(before.document);
      expect(after.revision).toBe(before.revision);
      expect(after.history).toBe(before.history);
      expect(after.bookmarks).toEqual(before.bookmarks);
      expect(after.exportRevision).toBe(before.exportRevision);
      expect(after.recovery).toEqual(before.recovery);
      expect(after.documentTransition.kind).toBe("idle");
      expect(after.pendingRequests).toEqual(before.pendingRequests);
      expect(h.transport.service.inspectTransport().state).toBe("ready");
      expect(h.service.getSnapshot().message).toContain("ui.stale_owner");
      h.service.cancel();
      await h.service.requestLesson("two-five-one"); await h.service.confirm(false);
      expect(h.composition.readApplicationState().document.title).toBe("ii–V–I in C");
      expect(h.composition.readApplicationState().revision).toBe(before.revision + 1);
    });
  }
  test("a confirmation host removed before Confirm leaves the next gesture usable", async () => {
    const h = await harness(); const before = h.composition.readApplicationState();
    await h.service.requestNew();
    expect(h.composition.replacementWorkflow.applyLifecycleIntent({ kind: "pop-dialog", dialogId: "studio-local-replacement" }).ok).toBe(true);
    await h.service.confirm(false); expect(h.requests).toHaveLength(0);
    await h.service.requestLesson("two-five-one");
    expect(h.service.getSnapshot()).toMatchObject({ open: true, title: "ii–V–I in C" });
    await h.service.confirm(false);
    expect(h.composition.readApplicationState().revision).toBe(before.revision + 1);
  });
  for (const extra of ["value", "unexpected"] as const) {
    test(`an augmented no-effect refusal cannot unlock the studio (${extra})`, async () => {
      const h = await harness({ retirement: { retireLocalReplacement: () => Promise.resolve({ ok: false,
        code: "transport.replacement_retirement_failed", retirementEffect: "none", [extra]: {} }) } });
      const before = h.composition.readApplicationState();
      await h.service.requestNew(); await h.service.confirm(false);
      expect(h.service.getSnapshot().reconciliationRequired).toBe(true);
      expect(h.composition.readApplicationState().document).toBe(before.document);
      expect(h.composition.readApplicationState().history).toBe(before.history);
      expect(h.composition.controller.setTitle("Forbidden").ok).toBe(false);
    });
  }
  test("a throwing retirement evidence reader fails closed without rejecting the confirmation promise", async () => {
    const h = await harness({ retirement: { retireLocalReplacement: () => Promise.resolve({
      get ok() { throw new Error("EVIDENCE_READER_FAILED"); },
    }) } });
    const before = h.composition.readApplicationState();
    await h.service.requestNew(); await h.service.confirm(false);
    expect(h.service.getSnapshot().reconciliationRequired).toBe(true);
    expect(h.composition.readApplicationState().document).toBe(before.document);
    expect(h.composition.controller.setTitle("Forbidden").ok).toBe(false);
  });
  test("an unavailable UI owner during retirement preserves the chart and permits a fresh replacement", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const h = await harness({ retirement: { retireLocalReplacement: async request => {
      await gate; return h.real.retireLocalReplacement(request);
    } } });
    const before = h.composition.readApplicationState();
    await h.service.requestNew(); const pending = h.service.confirm(false);
    h.service.invalidateHost();
    expect(h.composition.controller.setTitle("Forbidden").ok).toBe(false);
    release?.(); await pending;
    expect(h.composition.readApplicationState().document).toBe(before.document);
    expect(h.composition.readApplicationState().history).toBe(before.history);
    expect(h.service.getSnapshot().message).toContain("ui.stale_owner");
    h.service.cancel(); await h.service.requestLesson("two-five-one"); await h.service.confirm(false);
    expect(h.composition.readApplicationState().document.title).toBe("ii–V–I in C");
  });
  test("uncertain retirement reconciles through real X1 without publishing, then a fresh request succeeds", async () => {
    let corrupt = true; let reconciliations = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let entered: (() => void) | undefined;
    const reconciliationStarted = new Promise<void>(resolve => { entered = resolve; });
    const h = await harness({ retirement: {
      retireLocalReplacement: async request => {
        const result = await h.real.retireLocalReplacement(request);
        return corrupt ? { ok: false, code: "transport.replacement_retirement_failed", retirementEffect: "unknown" } : result;
      },
      reconcileLocalReplacement: async request => { reconciliations++; entered?.(); await gate; return h.real.reconcileLocalReplacement(request); },
    } });
    const before = h.composition.readApplicationState();
    const generation = h.transport.service.inspectTransport().generation;
    await h.service.requestNew(); const pending = h.service.confirm(false);
    await reconciliationStarted;
    expect(reconciliations).toBe(1);
    expect(h.service.getSnapshot()).toMatchObject({ phase: "committing", reconciliationRequired: true });
    expect(h.composition.controller.setTitle("Forbidden").ok).toBe(false);
    h.service.cancel(); await h.service.confirm(false);
    expect(h.requests).toHaveLength(1);
    release?.(); await pending;
    const after = h.composition.readApplicationState();
    expect(after.document).toBe(before.document); expect(after.history).toBe(before.history);
    expect(after.bookmarks).toEqual(before.bookmarks); expect(after.exportRevision).toBe(before.exportRevision);
    expect(after.recovery).toEqual(before.recovery); expect(after.documentTransition.kind).toBe("idle");
    expect(after.pendingRequests).toEqual(before.pendingRequests);
    expect(h.service.getSnapshot()).toMatchObject({ phase: "failed", reconciliationRequired: false });
    expect(h.service.getSnapshot().message).toContain("Playback was safely stopped");
    expect(h.transport.service.inspectTransport().generation).toBe(generation + 2);
    expect(h.transport.timer.activeHandleCount()).toBe(0);
    expect(h.transport.engine.inspectAudioEngine().nonreleasingVoiceCount).toBe(0);
    corrupt = false; h.service.cancel(); await h.service.requestLesson("two-five-one"); await h.service.confirm(false);
    expect(h.composition.readApplicationState().document.title).toBe("ii–V–I in C");
    expect(h.composition.readApplicationState().revision).toBe(before.revision + 1);
    expect(h.transport.service.inspectTransport().generation).toBe(generation + 3);
    expect(reconciliations).toBe(1);
  });
  for (const defect of ["request", "generation", "postcondition", "extra", "throw"] as const) {
    test(`invalid reconciliation evidence retains the original chart and lock (${defect})`, async () => {
      let reconciliations = 0;
      const h = await harness({ retirement: {
        retireLocalReplacement: () => Promise.resolve({ ok: true, value: {} }),
        reconcileLocalReplacement: request => {
          reconciliations++;
          if (defect === "throw") throw new Error("RECONCILIATION_FAILED");
          return Promise.resolve({ ok: true, authority: "x1-serialized-transport",
            request: defect === "request" ? { ...request, origin: "wrong" } : request, commandRequestId: 2,
            observedGeneration: 1, resultingGeneration: defect === "generation" ? 3 : 2,
            state: "ready", noFutureAttack: defect !== "postcondition", ...(defect === "extra" ? { extra: true } : {}) });
        },
      } });
      const before = h.composition.readApplicationState(); await h.service.requestNew(); await h.service.confirm(false);
      expect(h.service.getSnapshot().reconciliationRequired).toBe(true);
      expect(h.composition.readApplicationState().document).toBe(before.document);
      expect(h.composition.readApplicationState().history).toBe(before.history);
      expect(h.composition.controller.setTitle("Forbidden").ok).toBe(false);
      expect(reconciliations).toBe(1);
    });
  }
  for (const throws of [false, true]) {
    test(`the UI owner check refuses stale publication (throws=${String(throws)})`, async () => {
      const h = await harness(); const before = h.composition.readApplicationState();
      await h.service.requestLesson("two-five-one");
      await h.service.confirm(false, () => { if (throws) throw new Error("HOST_READER_FAILED"); return false; });
      expect(h.composition.readApplicationState().document).toBe(before.document);
      expect(h.composition.readApplicationState().history).toBe(before.history);
      expect(h.composition.readApplicationState().documentTransition.kind).toBe("idle");
      expect(h.service.getSnapshot().message).toContain("ui.stale_owner");
      h.service.cancel(); await h.service.requestLesson("two-five-one");
      await h.service.confirm(false, () => true);
      expect(h.composition.readApplicationState().document.title).toBe("ii–V–I in C");
    });
  }
  test("local and import replacements share the proven empty-epoch chain", async () => {
    const h = await harness(); await h.service.requestNew(); await h.service.confirm(false);
    const importer = createStudioDocumentImport({ composition: h.composition, recovery: h.recovery.service,
      retirement: h.real, estimateHistoryRetainedBytes: h.estimate, exportCurrent: () => {} });
    importer.open(); await importer.previewPaste(readFileSync(new URL("../fixtures/interchange/goldens/minimal.changes.json", import.meta.url), "utf8"), "auto");
    await importer.requestCommit(); expect(importer.getSnapshot().open).toBe(false);
    await h.service.requestNew(); await h.service.confirm(false); expect(h.service.getSnapshot().open).toBe(false);
    expect(h.transport.service.inspectTransport().generation).toBe(4);
  });
  test("every reviewed lesson produces a complete valid candidate without editing during selection", async () => {
    const h = await harness(); const before = h.composition.readApplicationState();
    for (const entry of PROGRESSION_LIBRARY) {
      await h.service.requestLesson(entry.id);
      expect(h.service.getSnapshot()).toMatchObject({ open: true, phase: "confirm", title: entry.title });
      expect(h.composition.readApplicationState().document).toBe(before.document); h.service.cancel();
    }
    expect(h.requests).toHaveLength(0);
  });
});

test("the actual confirmation selector matches all112 independently authored U5 cells", async () => {
  const h = await harness(); const blank = await harness({ seed: false });
  const matrix = JSON.parse(readFileSync(new URL("../fixtures/lifecycle-dialogs/dialog-state-matrix.json", import.meta.url), "utf8")) as {
    confirmationCells: { documentNonempty: boolean; dirty: boolean; transportStatus: "unavailable" | "ready" | "starting" | "playing" | "paused" | "stopping" | "failed"; requiresConfirmation: boolean }[];
  };
  expect(matrix.confirmationCells).toHaveLength(112);
  for (const cell of matrix.confirmationCells) {
    const before = (cell.documentNonempty ? h : blank).composition.readApplicationState();
    const state = { ...before, exportRevision: cell.dirty ? null : before.revision, transport: { ...before.transport, status: cell.transportStatus } };
    const recovery = { ...h.recovery.service.inspectRecovery(), documentId: before.document.id, cleanRevision: before.revision };
    expect(selectReplacementConfirmation(state, recovery).confirmationRequired).toBe(cell.requiresConfirmation);
  }
});
