import { expect, test } from "bun:test";
import { decodeDocumentShape } from "../../src/domain";
import { validateDocumentSemantics } from "../../src/application/document-validation";
import { createStudioBootstrap } from "../../src/application/studio-bootstrap";
import { createStudioCompositionOverState } from "../../src/application/studio-controller";
import { createStudioAudio } from "../../src/application/runtime";
import { createStudioLocalReplacement } from "../../src/application/studio-local-replacement";
import { createX1SerializedTransportRetirementAdapter } from "../../src/application/x1-retirement-adapter";
import { MAX_HISTORY_RETAINED_BYTES } from "../../src/application/application-state-contract";
import { estimateHistoryRetainedBytes } from "../../src/application/application-history";
import { createFakeAudioPlatform } from "../../src/test-support/fake-audio-platform";
import { createRecoveryHarness } from "../support/recovery-test-kit";
import { historyLimitDocument } from "../fixtures/history-limit";

for (const events of [4096, 6144] as const) {
  test(`the real history boundary preserves ${String(events)} exact sixteen-note events until consent`, async () => {
    const shape = decodeDocumentShape(historyLimitDocument(events));
    if (!shape.ok) throw new Error(JSON.stringify(shape.errors));
    const published = validateDocumentSemantics(shape.value);
    if (!published.ok) throw new Error(JSON.stringify(published.errors));
    const boot = createStudioBootstrap(); if (!boot.ok) throw new Error(boot.refusal.code);
    const audio = createStudioAudio(createFakeAudioPlatform().platform);
    const composition = createStudioCompositionOverState({ ...boot.value.state, document: published.value },
      boot.value.dependencies, { audio });
    const before = composition.readApplicationState();
    const oversized = events === 6144;
    expect(MAX_HISTORY_RETAINED_BYTES).toBe(16_777_216);
    expect(estimateHistoryRetainedBytes(before.document) > MAX_HISTORY_RETAINED_BYTES).toBe(oversized);
    const retirement = createX1SerializedTransportRetirementAdapter(audio.transportService,
      composition.allocateTransportCommandRequestId, { beforeSubmit: composition.replacementWorkflow.expectTransportRetirement,
        settled: composition.replacementWorkflow.settleTransportRetirement });
    const service = createStudioLocalReplacement({ composition, retirement, recovery: createRecoveryHarness().service,
      exportCurrent: () => { throw new Error("Unexpected export"); } });
    await service.requestNew();
    expect(service.getSnapshot()).toMatchObject({ open: true, nonUndoable: oversized });
    expect(composition.readApplicationState().dialogs.map(dialog => dialog.kind))
      .toEqual([oversized ? "history-limit" : "new-document"]);
    service.cancel();
    expect(composition.readApplicationState().document).toBe(before.document);
    expect(composition.readApplicationState().history).toBe(before.history);
    await service.requestNew();
    if (oversized) {
      await service.confirm(false);
      expect(service.getSnapshot().message).toContain("history.nonundoable_confirmation_required");
      expect(composition.readApplicationState().document).toBe(before.document);
      expect(composition.readApplicationState().revision).toBe(before.revision);
    }
    await service.confirm(oversized);
    expect(service.getSnapshot().open).toBe(false);
    expect(composition.readApplicationState().document.title).toBe("Untitled Chart");
    expect(composition.readApplicationState().revision).toBe(before.revision + 1);
    expect(composition.readApplicationState().exportRevision).toBe(before.exportRevision);
    expect(composition.controller.undo().ok).toBe(!oversized);
    if (!oversized) expect(composition.readApplicationState().document).toEqual(before.document);
    else {
      expect(composition.readApplicationState().history.undo).toEqual([]);
      expect(service.getSnapshot().message).toContain("Undo is unavailable at this history boundary");
    }
  });
}
