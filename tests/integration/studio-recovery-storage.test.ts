import { describe, expect, test } from "bun:test";
import { createRecoveryService, createStudioRecoveryStorage, recoveryStorageKey } from "../../src/persistence";
import { createFakeRecoveryAdapter, createFakeRecoveryClock, testDocumentId } from "../support/recovery-test-kit";

const LOCATION = "changes.studio-recovery-location.v1:current";
const a = testDocumentId("studio-document-1");
const b = testDocumentId("imported-document");

describe("studio recovery location over the real A1 service", () => {
  test("cold startup finds a changed stable document ID; Discard cannot resurrect the old document", async () => {
    const adapter = createFakeRecoveryAdapter({ kind: "indexeddb" });
    const clock = createFakeRecoveryClock();
    const storage = createStudioRecoveryStorage([adapter.port]);
    const service = createRecoveryService({ adapters: storage.adapters, clock: clock.port });
    for (const id of [a, b]) {
      service.noteMutation({ documentId: id, revision: 1, document: { id, title: String(id) } });
      await clock.advance(400);
    }
    expect(service.inspectRecovery().cleanRevision).toBe(1);
    const coldStorage = createStudioRecoveryStorage([adapter.port]);
    expect(await coldStorage.resolveStartupDocumentId("indexeddb", a)).toBe(b);
    const coldService = createRecoveryService({ adapters: coldStorage.adapters, clock: clock.port });
    const recovered = await coldService.readRecoveryCandidates({ documentId: b, sessionEdited: true });
    expect(recovered.current.envelope?.document).toEqual({ id: b, title: String(b) });
    await coldService.discardRecovery(b);
    expect(adapter.store.has(recoveryStorageKey(b, "current"))).toBe(false);
    expect(adapter.store.has(recoveryStorageKey(b, "previous"))).toBe(false);
    // The location contains no chart payload and remains intentionally. An
    // older document's still-valid copy must not become the next boot offer.
    expect(adapter.store.has(recoveryStorageKey(a, "current"))).toBe(true);
    expect(await coldStorage.resolveStartupDocumentId("indexeddb", a)).toBe(b);
    expect((await coldService.readRecoveryCandidates({ documentId: b, sessionEdited: true })).disposition).toBe("none-available");
  });

  test("location write failure cannot certify a clean recovery; a subsequent write can succeed", async () => {
    const adapter = createFakeRecoveryAdapter({ kind: "indexeddb" }); const clock = createFakeRecoveryClock();
    let fail = true;
    const storage = createStudioRecoveryStorage([{ ...adapter.port, writeCurrentWithRotation: (current, previous, payload) =>
      current === LOCATION && fail ? Promise.resolve("quota") : adapter.port.writeCurrentWithRotation(current, previous, payload),
    }]);
    const service = createRecoveryService({ adapters: storage.adapters, clock: clock.port });
    service.noteMutation({ documentId: b, revision: 2, document: { id: b } }); await clock.advance(400);
    expect(service.inspectRecovery().cleanRevision).toBeNull(); expect(service.inspectRecovery().pendingRevision).toBe(2);
    expect(service.inspectRecovery().lastRefusal).toBe("recovery.quota_exceeded");
    fail = false; service.noteMutation({ documentId: b, revision: 3, document: { id: b } }); await clock.advance(400);
    expect(service.inspectRecovery().cleanRevision).toBe(3); expect(await storage.resolveStartupDocumentId("indexeddb", a)).toBe(b);
  });

  test("missing/malformed/oversized location falls back without evaluating data", async () => {
    const adapter = createFakeRecoveryAdapter({ kind: "indexeddb" }); const storage = createStudioRecoveryStorage([adapter.port]);
    expect(await storage.resolveStartupDocumentId("indexeddb", a)).toBe(a);
    for (const value of ["{", "x".repeat(513), '{"schema":"changes.studio-recovery-location.v1","documentId":"bad/id"}',
      '{"schema":"changes.studio-recovery-location.v1","documentId":"imported-document","extra":1}']) {
      adapter.store.set(LOCATION, value); expect(await storage.resolveStartupDocumentId("indexeddb", a)).toBe(a);
    }
    expect(await storage.resolveStartupDocumentId("none", a)).toBe(a);
  });
});
