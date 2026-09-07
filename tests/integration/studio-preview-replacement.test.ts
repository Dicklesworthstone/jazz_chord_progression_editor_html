import { expect, test } from "bun:test";
import { createStudioAudio, createStudioComposition, seedStarterChart } from "../../src/application/runtime";
import { createStudioLocalReplacement } from "../../src/application/studio-local-replacement";
import { createStudioDocumentImport } from "../../src/application/studio-document-import";
import { createX1SerializedTransportRetirementAdapter } from "../../src/application/x1-retirement-adapter";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";
import { createRecoveryHarness } from "../support/recovery-test-kit";
import fixture from "../fixtures/exact-share/document.changes.json";

test("replacement cannot publish while a real cold initialization is still queued", async () => {
  const platform = createFakeAudioPlatform({ initialState: "suspended", resumeBehavior: "deferred" }), audio = createStudioAudio(platform.platform);
  const created = createStudioComposition({ audio }); if (!created.ok) throw new Error(created.refusal.code);
  const composition = created.composition, controller = composition.controller;
  expect(seedStarterChart(controller).seeded).toBe(true);
  expect(controller.setInstrument("mellow-keys").ok).toBe(true);
  const event = composition.readApplicationState().document.sections[0]?.measures[0]?.events[0];
  if (event === undefined) throw new Error("Missing starter event");
  expect(controller.selectEvent(event.id).ok).toBe(true);
  const inspector = controller.readInspector(event.id); if (!inspector.ok) throw new Error(inspector.code);
  const preview = controller.previewInspector(inspector.value.source, { kind: "current", hold: true },
    { kind: "trusted-pointer", trusted: true, sequence: 1 });
  await new Promise<void>(resolve => { setTimeout(resolve, 0); });
  expect(platform.events.some(event => event.kind === "context-resume")).toBe(true);
  expect(audio.inspect().transport.queuedCommandCount).toBeGreaterThan(0);
  const before = composition.readApplicationState();
  const retirement = createX1SerializedTransportRetirementAdapter(audio.transportService,
    composition.allocateTransportCommandRequestId, { beforeSubmit: composition.replacementWorkflow.expectTransportRetirement,
      settled: composition.replacementWorkflow.settleTransportRetirement });
  const local = createStudioLocalReplacement({ composition, retirement, recovery: createRecoveryHarness().service, exportCurrent: () => {} });
  await local.requestNew();
  const confirmation = local.confirm(false);
  await new Promise<void>(resolve => { setTimeout(resolve, 0); });
  const preserved = composition.readApplicationState().document === before.document;
  // Always release the real initialization, even in the regression control.
  platform.contexts[0]?.resolveDeferredResume();
  await confirmation;
  expect(preserved).toBe(true);
  // Await the actual preparation/submission, including asynchronous WASM load;
  // an arbitrary microtask drain cannot certify that the preview has started.
  expect(await preview).toMatchObject({ ok: true });
  expect(local.getSnapshot()).toMatchObject({ open: true, phase: "failed" });
  expect(composition.readApplicationState().document).toBe(before.document);
  expect(composition.readApplicationState().history).toBe(before.history);
  expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBeGreaterThan(0);
  local.cancel(); await local.requestNew(); await local.confirm(false);
  expect(local.getSnapshot().open).toBe(false);
  expect(composition.readApplicationState().document.title).toBe("Untitled Chart");
  expect(controller.getSnapshot().previewStoppable).toBe(false);
  expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBe(0);
  expect(controller.undo().ok).toBe(true);
  expect(composition.readApplicationState().document).toEqual(before.document);
});

for (const origin of ["new", "lesson", "canonical", "legacy"] as const) {
  test(`cold preview registers its real transport epoch before ${origin} replacement`, async () => {
    const platform = createFakeAudioPlatform(), audio = createStudioAudio(platform.platform);
    const created = createStudioComposition({ audio }); if (!created.ok) throw new Error(created.refusal.code);
    const composition = created.composition, controller = composition.controller;
    expect(seedStarterChart(controller).seeded).toBe(true);
    expect(controller.setInstrument("mellow-keys").ok).toBe(true);
    const event = composition.readApplicationState().document.sections[0]?.measures[0]?.events[0];
    if (event === undefined) throw new Error("Missing starter event");
    expect(controller.selectEvent(event.id).ok).toBe(true);
    const inspector = controller.readInspector(event.id); if (!inspector.ok) throw new Error(inspector.code);
    const before = composition.readApplicationState();
    expect(await controller.previewInspector(inspector.value.source, { kind: "current", hold: true },
      { kind: "trusted-pointer", trusted: true, sequence: 1 })).toMatchObject({ ok: true });
    expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBeGreaterThan(0);
    const preview = composition.readApplicationState();
    expect(preview.transport.generation).toBe(audio.inspect().transport.generation);
    expect(preview.transport.status).toBe("ready");
    expect(preview.document).toBe(before.document); expect(preview.history).toBe(before.history);
    expect(preview.bookmarks).toBe(before.bookmarks);
    const recovery = createRecoveryHarness();
    const retirement = createX1SerializedTransportRetirementAdapter(audio.transportService,
      composition.allocateTransportCommandRequestId, { beforeSubmit: composition.replacementWorkflow.expectTransportRetirement,
        settled: composition.replacementWorkflow.settleTransportRetirement });
    const local = createStudioLocalReplacement({ composition, recovery: recovery.service, retirement, exportCurrent: () => {} });
    const importing = createStudioDocumentImport({ composition, recovery: recovery.service, retirement, exportCurrent: () => {} });
    if (origin === "new" || origin === "lesson") {
      if (origin === "new") await local.requestNew(); else await local.requestLesson("two-five-one");
      // Choosing and cancelling a replacement never retires a preview.
      local.cancel(); expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBeGreaterThan(0);
      expect(composition.readApplicationState().document).toBe(before.document);
      if (origin === "new") await local.requestNew(); else await local.requestLesson("two-five-one");
      await local.confirm(false); expect(local.getSnapshot().open).toBe(false);
    } else {
      importing.open();
      await importing.previewPaste(origin === "canonical" ? JSON.stringify(fixture) : JSON.stringify({ name: "Legacy preview",
        sections: [{ name: "A", chords: [{ name: "Cmaj7", notes: ["C3", "E3", "G3", "B3"] }] }] }), "auto");
      await importing.requestCommit(); expect(importing.getSnapshot().phase).toBe("confirm");
      expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBeGreaterThan(0);
      await importing.confirm(false); expect(importing.getSnapshot().open).toBe(false);
    }
    expect(audio.inspect().engine.previewNonreleasingVoiceCount).toBe(0);
    expect(controller.getSnapshot().previewStoppable).toBe(false);
    expect(composition.readApplicationState().revision).toBe(before.revision + 1);
    expect(composition.readApplicationState().documentTransition.kind).toBe("idle");
    expect(controller.undo().ok).toBe(true);
    expect(composition.readApplicationState().document).toEqual(before.document);
    expect(composition.readApplicationState().bookmarks).toEqual(before.bookmarks);
    expect(platform.contextCreationCount()).toBe(1);
  });
}

test("replacement cancels a card preview still preparing and no late attack reaches the new chart", async () => {
  const platform = createFakeAudioPlatform(), real = createStudioAudio(platform.platform);
  let entered: () => void = () => { throw new Error("Preparation signal missing"); };
  let release: () => void = () => { throw new Error("Preparation gate missing"); };
  const preparing = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  let starts = 0;
  const created = createStudioComposition({ audio: { ...real,
    prepareInstrument: async (...args) => { entered(); await gate; return real.prepareInstrument(...args); },
    startPreview: (...args) => { starts++; return real.startPreview(...args); },
  } });
  if (!created.ok) throw new Error(created.refusal.code);
  const composition = created.composition, controller = composition.controller;
  expect(seedStarterChart(controller).seeded).toBe(true);
  expect(controller.setInstrument("mellow-keys").ok).toBe(true);
  const event = composition.readApplicationState().document.sections[0]?.measures[0]?.events[0];
  if (event === undefined) throw new Error("Missing starter event");
  expect(controller.previewChord(event.id, { kind: "trusted-pointer", trusted: true, sequence: 1 }).ok).toBe(true);
  await preparing;
  expect(controller.getSnapshot().previewStoppable).toBe(true);
  const retirement = createX1SerializedTransportRetirementAdapter(real.transportService,
    composition.allocateTransportCommandRequestId, { beforeSubmit: composition.replacementWorkflow.expectTransportRetirement,
      settled: composition.replacementWorkflow.settleTransportRetirement });
  const local = createStudioLocalReplacement({ composition, recovery: createRecoveryHarness().service, retirement, exportCurrent: () => {} });
  await local.requestNew(); await local.confirm(false);
  expect(local.getSnapshot().open).toBe(false);
  const replaced = composition.readApplicationState();
  expect(replaced.document.title).toBe("Untitled Chart");
  expect(controller.getSnapshot().previewStoppable).toBe(false);
  release();
  // Drain the resolved preparation's microtasks before checking its real X1
  // submission port. No fake musical clock or altered note duration is used.
  await new Promise<void>(resolve => { setTimeout(resolve, 0); });
  expect(starts).toBe(0);
  expect(real.inspect().engine.previewNonreleasingVoiceCount).toBe(0);
  expect(composition.readApplicationState().document).toBe(replaced.document);
  expect(composition.readApplicationState().history).toBe(replaced.history);
});
