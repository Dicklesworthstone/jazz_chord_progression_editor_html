import { createHash } from "node:crypto";

import { describe, expect, test } from "bun:test";

import {
  createStudioMidiExport,
  type StudioMidiExportPreparationId,
} from "../../src/application/studio-midi-export";
import type { DocumentId, ValidatedDocument } from "../../src/domain";
import { u7DocumentForCase, u7PreviewCases } from "../support/u7-midi-export-fixture";

/**
 * Production proof for the U7 workflow state machine: every transition row of
 * the packet's state-cases fixture driven through the real service with
 * scripted binding/hash/delivery ports.
 */

function readyDocument(): ValidatedDocument {
  const entry = u7PreviewCases().find(
    (candidate) => candidate.id === "U7-PRE-001",
  );
  if (entry === undefined) throw new Error("U7-PRE-001 fixture missing");
  return u7DocumentForCase(entry);
}

function blockedDocument(): ValidatedDocument {
  const entry = u7PreviewCases().find(
    (candidate) => candidate.id === "U7-PRE-010",
  );
  if (entry === undefined) throw new Error("U7-PRE-010 fixture missing");
  return u7DocumentForCase(entry);
}

type ScriptedPorts = {
  ports: Parameters<typeof createStudioMidiExport>[0];
  setBinding: (binding: Readonly<{ documentId: DocumentId; revision: number }> | null) => void;
  delivered: Readonly<{ binding: unknown; privateBytes: Uint8Array }>[];
  deliveryMode: { mode: "ok" | "throw" | "bad-cleanup" };
};

function makePorts(document: ValidatedDocument | null): ScriptedPorts {
  let binding =
    document === null
      ? null
      : Object.freeze({ documentId: document.id, revision: 7 });
  const delivered: { binding: unknown; privateBytes: Uint8Array }[] = [];
  const deliveryMode: ScriptedPorts["deliveryMode"] = { mode: "ok" };
  return {
    delivered,
    deliveryMode,
    setBinding(next) {
      binding = next;
    },
    ports: {
      readDocument: () => document,
      readBinding: () => binding,
      hashBytes: (bytes) =>
        Promise.resolve(createHash("sha256").update(bytes).digest("hex")),
      startDelivery: (request) => {
        if (deliveryMode.mode === "throw") {
          throw new Error("anchor exploded");
        }
        delivered.push(request);
        return Object.freeze({
          completion:
            deliveryMode.mode === "bad-cleanup"
              ? Promise.resolve(
                  Object.freeze({
                    objectUrlsCreated: 1,
                    objectUrlsRevoked: 0,
                    outstandingOwnedResources: 1,
                  }),
                )
              : Promise.resolve(
                  Object.freeze({
                    objectUrlsCreated: 1,
                    objectUrlsRevoked: 1,
                    outstandingOwnedResources: 0,
                  }),
                ),
        });
      },
    },
  };
}

describe("U7 MIDI export workflow state machine (production)", () => {
  test("STA-001/002: open previews ready and blocked charts with the right registry state", async () => {
    const ready = makePorts(readyDocument());
    const service = createStudioMidiExport(ready.ports);
    const preview = await service.openPreview();
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.preview.readiness).toBe("ready");
    expect(preview.preparationId).not.toBeNull();
    expect(service.inspectRegistry().state).toBe("ready");

    const blocked = makePorts(blockedDocument());
    const blockedService = createStudioMidiExport(blocked.ports);
    const blockedPreview = await blockedService.openPreview();
    expect(blockedPreview.ok).toBe(true);
    if (!blockedPreview.ok) return;
    expect(blockedPreview.preview.readiness).toBe("blocked");
    expect(blockedPreview.preparationId).toBeNull();
    expect(blockedService.inspectRegistry().state).toBe("empty");
  });

  test("STA-003/004/005: document-unavailable, preparation conflict, and hash failure refusals", async () => {
    const missing = makePorts(null);
    const missingService = createStudioMidiExport(missing.ports);
    const unavailable = await missingService.openPreview();
    expect(unavailable.ok).toBe(false);
    if (unavailable.ok) return;
    expect(unavailable.refusal.code).toBe("u7.document_unavailable");

    const held = makePorts(readyDocument());
    const heldService = createStudioMidiExport(held.ports);
    const first = await heldService.openPreview();
    expect(first.ok).toBe(true);
    const conflict = await heldService.openPreview();
    expect(conflict.ok).toBe(false);
    if (conflict.ok) return;
    expect(conflict.refusal.code).toBe("u7.preparation_conflict");

    const failing = makePorts(readyDocument());
    const failingService = createStudioMidiExport({
      ...failing.ports,
      hashBytes: () => Promise.reject(new Error("unavailable")),
    });
    const hashRefusal = await failingService.openPreview();
    expect(hashRefusal.ok).toBe(false);
    if (hashRefusal.ok) return;
    expect(hashRefusal.refusal.code).toBe("u7.hash_unavailable");
    expect(failingService.inspectRegistry().state).toBe("empty");
  });

  test("STA-006/007/008: generate adopts fresh, reports stale, refuses missing", async () => {
    const scripted = makePorts(readyDocument());
    const service = createStudioMidiExport(scripted.ports);
    const preview = await service.openPreview();
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const preparationId = preview.preparationId as StudioMidiExportPreparationId;

    const generated = service.generate(preparationId);
    expect(generated.outcome).toBe("generated");
    expect(service.inspectRegistry().state).toBe("ready");

    const missing = service.generate(999_999 as StudioMidiExportPreparationId);
    expect(missing.outcome).toBe("refused");
    if (missing.outcome !== "refused") return;
    expect(missing.refusal.code).toBe("u7.preparation_missing");

    scripted.setBinding(
      Object.freeze({ documentId: readyDocument().id, revision: 8 }),
    );
    const stale = service.generate(preparationId);
    expect(stale.outcome).toBe("stale");
    expect(service.inspectRegistry().state).toBe("empty");
  });

  test("STA-009/010/011: download hands off exactly once, stale at take abandons, second take refuses", async () => {
    const scripted = makePorts(readyDocument());
    const service = createStudioMidiExport(scripted.ports);
    const preview = await service.openPreview();
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const preparationId = preview.preparationId as StudioMidiExportPreparationId;

    const delivered = await service.download(preparationId);
    expect(delivered.outcome).toBe("handed-off");
    if (delivered.outcome !== "handed-off") return;
    expect(delivered.cleanup).toEqual({
      cleanup: "complete",
      objectUrlsCreated: 1,
      objectUrlsRevoked: 1,
      outstandingOwnedResources: 0,
    });
    expect(scripted.delivered).toHaveLength(1);
    expect(service.inspectRegistry().state).toBe("empty");

    const secondTake = await service.download(preparationId);
    expect(secondTake.outcome).toBe("refused");
    if (secondTake.outcome !== "refused") return;
    expect(secondTake.refusal.code).toBe("u7.preparation_missing");

    const staleScript = makePorts(readyDocument());
    const staleService = createStudioMidiExport(staleScript.ports);
    const stalePreview = await staleService.openPreview();
    expect(stalePreview.ok).toBe(true);
    if (!stalePreview.ok) return;
    const staleId = stalePreview.preparationId as StudioMidiExportPreparationId;
    staleScript.setBinding(
      Object.freeze({ documentId: readyDocument().id, revision: 99 }),
    );
    const staleTake = await staleService.download(staleId);
    expect(staleTake.outcome).toBe("stale");
    expect(staleService.inspectRegistry().state).toBe("empty");
    expect(staleScript.delivered).toHaveLength(0);
  });

  test("STA-012 through STA-016: cancel and close abandon the preparation exactly once", async () => {
    const scripted = makePorts(readyDocument());
    const service = createStudioMidiExport(scripted.ports);
    const preview = await service.openPreview();
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const preparationId = preview.preparationId as StudioMidiExportPreparationId;

    const ignored = service.abandon(null);
    expect(ignored.outcome).toBe("ignored-stale");
    expect(service.inspectRegistry().state).toBe("ready");

    const abandoned = service.abandon(preparationId);
    expect(abandoned.outcome).toBe("abandoned");
    expect(service.inspectRegistry().state).toBe("empty");

    const twice = service.abandon(preparationId);
    expect(twice.outcome).toBe("ignored-stale");
    expect(scripted.delivered).toHaveLength(0);
  });

  test("STA-017/018: re-preview after stale and after delivery reopens against the current revision", async () => {
    const scripted = makePorts(readyDocument());
    const service = createStudioMidiExport(scripted.ports);
    const first = await service.openPreview();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    scripted.setBinding(
      Object.freeze({ documentId: readyDocument().id, revision: 8 }),
    );
    const stale = service.generate(
      first.preparationId as StudioMidiExportPreparationId,
    );
    expect(stale.outcome).toBe("stale");
    expect(service.inspectRegistry().state).toBe("empty");

    const refreshed = await service.openPreview();
    expect(refreshed.ok).toBe(true);
    if (!refreshed.ok) return;
    expect(refreshed.preview.binding.revision).toBe(8);
    expect(service.inspectRegistry().state).toBe("ready");
  });

  test("STA-021/022: delivery failure keeps the preparation; bad cleanup is the single ok:false", async () => {
    const scripted = makePorts(readyDocument());
    scripted.deliveryMode.mode = "throw";
    const service = createStudioMidiExport(scripted.ports);
    const preview = await service.openPreview();
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const preparationId = preview.preparationId as StudioMidiExportPreparationId;

    const failed = await service.download(preparationId);
    expect(failed.outcome).toBe("failed");
    expect(service.inspectRegistry().state).toBe("ready");

    scripted.deliveryMode.mode = "bad-cleanup";
    const cleanupRefusal = await service.download(preparationId);
    expect(cleanupRefusal.outcome).toBe("refused");
    if (cleanupRefusal.outcome !== "refused") return;
    expect(cleanupRefusal.refusal.code).toBe("u7.delivery_cleanup_failed");
    expect(service.inspectRegistry().state).toBe("empty");
  });
});
