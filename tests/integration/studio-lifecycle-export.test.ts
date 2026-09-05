import { describe, expect, test } from "bun:test";
import { createStudioComposition, createStudioLifecycle, seedStarterChart } from "../../src/application/runtime";
import { createRecoveryService } from "../../src/persistence";
import type { PreparedExportDeliveryRequest } from "../../src/export";
import { createRecoveryHarness } from "../support/recovery-test-kit";

const hashBytes = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

function delivery(request: PreparedExportDeliveryRequest) {
  return { ok: true, outcome: "handed-off", channel: "object-url-download", artifact: request.binding,
    bytesOffered: request.privateBytes.length, cleanup: "complete", objectUrlsCreated: 1,
    objectUrlsRevoked: 1, outstandingOwnedResources: 0 };
}

function harness(start?: (request: PreparedExportDeliveryRequest) => unknown, quota = false) {
  const created = createStudioComposition();
  if (!created.ok) throw new Error("BOOTSTRAP_FAILED");
  const composition = created.composition;
  seedStarterChart(composition.controller);
  const recovery = createRecoveryHarness([{ kind: "indexeddb", writeOutcome: quota ? "quota" : "written" }]);
  const calls: PreparedExportDeliveryRequest[] = [];
  const service = createStudioLifecycle({ composition, recovery: recovery.service, hashBytes,
    nowIso: () => "2026-09-05T01:00:00.000Z",
    startDelivery: (request) => {
      calls.push({ ...request, privateBytes: request.privateBytes.slice() });
      return start?.(request) ?? { completion: Promise.resolve(delivery(request)) };
    } });
  return { composition, recovery, calls, service };
}

describe("U5 canonical export through production encoder, registry, A0 CAS and A1 storage", () => {
  test("exact browser handoff exports the source chart and survives a fresh recovery service", async () => {
    const h = harness();
    const before = h.composition.readApplicationState();
    await h.service.openExport();
    expect(h.service.getSnapshot().phase).toBe("ready");
    expect(h.composition.readApplicationState().dialogs.at(-1)?.kind).toBe("lifecycle-export");
    expect(h.composition.readApplicationState().exportRevision).toBeNull();
    await h.service.deliverCanonicalExport();
    expect(h.service.getSnapshot().phase).toBe("complete");
    expect(h.calls).toHaveLength(1);
    const request = h.calls[0];
    if (request === undefined) throw new Error("NO_DELIVERY");
    if (request.binding.semanticDocumentHash === null) throw new Error("MISSING_CANONICAL_HASH");
    expect(JSON.parse(new TextDecoder().decode(request.privateBytes))).toEqual(before.document);
    expect(h.composition.readApplicationState().exportRevision).toBe(before.revision);
    expect(h.composition.readApplicationState().document).toBe(before.document);
    expect(h.composition.readApplicationState().history).toBe(before.history);
    const cold = createRecoveryService({ adapters: h.recovery.adapters.map((adapter) => adapter.port), clock: h.recovery.clock.port });
    await cold.readRecoveryCandidates({ documentId: before.document.id, sessionEdited: false });
    expect(cold.inspectRecovery().exportBinding).toEqual({ schema: "changes.recovery-export-binding.v1",
      documentId: before.document.id, exportRevision: before.revision, exportedAt: "2026-09-05T01:00:00.000Z",
      semanticDocumentHash: request.binding.semanticDocumentHash,
      artifactByteLength: request.privateBytes.length, artifactSha256: await hashBytes(request.privateBytes) });
    h.service.cancelLifecycleDialog();
    expect(h.composition.readApplicationState().dialogs).toEqual([]);
  });

  test("Cancel abandons the private preparation without downloading or moving a marker", async () => {
    const h = harness();
    const before = h.composition.readApplicationState();
    await h.service.openExport();
    h.service.cancelLifecycleDialog();
    await h.service.deliverCanonicalExport();
    const after = h.composition.readApplicationState();
    expect(h.calls).toHaveLength(0);
    expect(after.exportRevision).toBeNull();
    expect(after.document).toBe(before.document);
    expect(after.history).toBe(before.history);
    expect(after.dialogs).toEqual([]);
  });

  test("a stale prepared revision starts no browser work", async () => {
    const h = harness();
    await h.service.openExport();
    h.composition.controller.setTitle("Changed after preview");
    const before = h.composition.readApplicationState();
    await h.service.deliverCanonicalExport();
    expect(h.calls).toHaveLength(0);
    expect(h.service.getSnapshot().message).toContain("export.prepared_canonical_stale");
    expect(h.composition.readApplicationState().document).toBe(before.document);
    expect(h.composition.readApplicationState().exportRevision).toBeNull();
  });

  test("delivery is single-use and history-blocking; a late completion after host teardown refuses the stale marker", async () => {
    let release: () => void = () => { throw new Error("NO_PENDING_DELIVERY"); };
    const h = harness((request) => ({ completion: new Promise((resolve) => {
      release = () => { resolve(delivery(request)); };
    }) }));
    await h.service.openExport();
    const pending = h.service.deliverCanonicalExport();
    expect(h.calls).toHaveLength(1);
    expect(h.composition.readApplicationState().dialogs.at(-1)?.blocksHistory).toBe(true);
    expect(h.composition.controller.undo().ok).toBe(false);
    h.service.cancelLifecycleDialog();
    await h.service.deliverCanonicalExport();
    expect(h.calls).toHaveLength(1);
    // A0 blocks document edits too while this dialog commits. First prove
    // that law, then exercise a late completion after the host's real LIFO
    // teardown has removed the modal and another command advances the chart.
    expect(h.composition.controller.setTitle("Blocked edit")).toMatchObject({
      ok: false, refusal: { code: "history.locked" },
    });
    expect(h.composition.applyLifecycleIntent({ kind: "pop-dialog", dialogId: "studio-lifecycle-export" }).ok).toBe(true);
    expect(h.composition.controller.setTitle("Changed during browser delivery")).toMatchObject({ ok: true });
    release();
    await pending;
    expect(h.service.getSnapshot().message).toContain("export.marker_publication_stale");
    expect(h.recovery.service.inspectRecovery().work.exportBindingsRecorded).toBe(0);
    expect(h.composition.readApplicationState().exportRevision).toBeNull();
    expect(h.composition.readApplicationState().dialogs).toEqual([]);
  });

  for (const bad of ["wrong-bytes", "wrong-artifact", "cleanup", "malformed"] as const) {
    test(`${bad} delivery cannot publish an export marker`, async () => {
      const h = harness((request) => {
        const result = delivery(request);
        const value = bad === "malformed" ? { ok: true, outcome: "handed-off" }
          : bad === "wrong-bytes" ? { ...result, bytesOffered: request.privateBytes.length - 1 }
          : bad === "wrong-artifact" ? { ...result, artifact: { ...result.artifact, filename: "substituted.json" } }
          : { ...result, objectUrlsRevoked: 0 };
        return { completion: Promise.resolve(value) };
      });
      await h.service.openExport();
      await h.service.deliverCanonicalExport();
      expect(h.service.getSnapshot().message).toContain("export.delivery_result_invalid");
      expect(h.composition.readApplicationState().exportRevision).toBeNull();
      expect(h.recovery.service.inspectRecovery().work.exportBindingsRecorded).toBe(0);
    });
  }

  test("a successful handoff with quota failure keeps an honest in-session marker and names pending durability", async () => {
    const h = harness(undefined, true);
    await h.service.openExport();
    await h.service.deliverCanonicalExport();
    expect(h.service.getSnapshot().phase).toBe("complete");
    expect(h.service.getSnapshot().message).toContain("could not be kept in local recovery");
    const state = h.composition.readApplicationState();
    expect(state.exportRevision).toBe(state.revision);
    expect(h.recovery.service.inspectRecovery().exportBinding).toBeNull();
    expect(h.recovery.service.inspectRecovery().lastRefusal).toBe("recovery.quota_exceeded");
  });
});
