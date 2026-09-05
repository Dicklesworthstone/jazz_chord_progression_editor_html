import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { createRecoveryService, decodeRecoveryEnvelope, recoveryStorageKey } from "../../src/persistence";
import {
  createRecoveryHarness,
  createFakeRecoveryAdapter,
  createFakeRecoveryClock,
  testDocumentId,
} from "../support/recovery-test-kit";

setDefaultTimeout(120_000);

describe("TR-A1-REVISION-SAFETY revision-safe completion and rotation", () => {
  test("Discard waits for the admitted write, then removes both copies without resurrection", async () => {
    const adapter = createFakeRecoveryAdapter({ kind: "indexeddb" });
    const clock = createFakeRecoveryClock();
    let releaseWrite: () => void = () => { throw new Error("write not started"); };
    let observeWrite: () => void = () => { throw new Error("no observer"); };
    const enteredWrite = new Promise<void>((resolve) => { observeWrite = resolve; });
    const writeBarrier = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const service = createRecoveryService({
      clock: clock.port,
      adapters: [{ ...adapter.port, writeCurrentWithRotation: async (...args) => {
        observeWrite();
        await writeBarrier;
        return await adapter.port.writeCurrentWithRotation(...args);
      } }],
    });
    const documentId = testDocumentId("doc-discard-in-flight");
    service.noteMutation({ documentId, revision: 1, document: { title: "Discard this" } });
    const writing = service.flushRecoveryWrites("visibility-change");
    await enteredWrite;
    let discarded = false;
    const discarding = service.discardRecovery(documentId).then(() => { discarded = true; });
    await Promise.resolve();
    expect(discarded).toBe(false);
    releaseWrite();
    expect((await writing)?.outcome).toBe("superseded");
    await discarding;
    await clock.advance(5_000);
    expect(adapter.store.size).toBe(0);
    expect(service.inspectRecovery().cleanRevision).toBeNull();
    // Honest success twin: a later edit still schedules a new recovery copy.
    service.noteMutation({ documentId, revision: 2, document: { title: "Keep this" } });
    await clock.advance(400);
    const stored = await decodeRecoveryEnvelope(adapter.store.get(recoveryStorageKey(documentId, "current")) ?? "");
    expect(stored.envelope?.document).toEqual({ title: "Keep this" });
    expect(service.inspectRecovery().cleanRevision).toBe(2);
  });

  test("equal revision numbers in different documents cannot certify a stale write", async () => {
    const harness = createRecoveryHarness();
    harness.service.noteMutation({ documentId: testDocumentId("doc-before"), revision: 4, document: {} });
    const writing = harness.service.flushRecoveryWrites("visibility-change");
    harness.service.noteMutation({ documentId: testDocumentId("doc-after"), revision: 4, document: {} });
    expect((await writing)?.outcome).toBe("superseded");
    expect(harness.service.inspectRecovery().cleanRevision).toBeNull();
    await harness.clock.advance(400);
    expect(harness.service.inspectRecovery().cleanRevision).toBe(4);
  });

  test("a refused remove remains visible and can be retried", async () => {
    const adapter = createFakeRecoveryAdapter({ kind: "indexeddb" });
    let deny = true;
    const service = createRecoveryService({ clock: createFakeRecoveryClock().port,
      adapters: [{ ...adapter.port, remove: async (key) => {
        if (deny) throw new Error("denied");
        await adapter.port.remove(key);
      } }],
    });
    const documentId = testDocumentId("doc-discard-denied");
    adapter.store.set(recoveryStorageKey(documentId, "current"), "retained");
    const failure = await service.discardRecovery(documentId).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(adapter.store.get(recoveryStorageKey(documentId, "current"))).toBe("retained");
    expect(service.inspectRecovery().lastRefusal).toBe("recovery.write_denied");
    deny = false;
    await service.discardRecovery(documentId);
    expect(adapter.store.size).toBe(0);
  });

  test("A1-SCHED-005 an older completion reports superseded and cannot mark newer state", async () => {
    const harness = createRecoveryHarness();
    const documentId = testDocumentId("doc-a1-rev-005");
    harness.service.noteMutation({
      documentId,
      revision: 4,
      document: { documentVersion: 2 },
    });
    const flush = harness.service.flushRecoveryWrites("visibility-change");
    harness.service.noteMutation({
      documentId,
      revision: 6,
      document: { documentVersion: 2 },
    });
    const receipt = await flush;
    expect(receipt?.outcome).toBe("superseded");
    expect(receipt?.reasonCode).toBe("recovery.stale_completion");
    expect(receipt?.currentRevisionAtCompletion).toBe(6);
    const snapshot = harness.service.inspectRecovery();
    expect(snapshot.cleanRevision).toBeNull();
    expect(snapshot.pendingRevision).toBe(6);
    expect(snapshot.work.writesSuperseded).toBe(1);
  });

  test("A1-SCHED-009 a successful current write atomically demotes the prior current", async () => {
    const harness = createRecoveryHarness();
    const documentId = testDocumentId("doc-a1-rev-009");
    harness.service.noteMutation({
      documentId,
      revision: 3,
      document: { documentVersion: 2, step: "first" },
    });
    await harness.clock.advance(400);
    harness.service.noteMutation({
      documentId,
      revision: 8,
      document: { documentVersion: 2, step: "second" },
    });
    await harness.clock.advance(400);
    const store = harness.adapters[0]?.store;
    const current = await decodeRecoveryEnvelope(
      store?.get(recoveryStorageKey(documentId, "current")) ?? "",
    );
    const previous = await decodeRecoveryEnvelope(
      store?.get(recoveryStorageKey(documentId, "previous")) ?? "",
    );
    expect(current.envelope?.revision).toBe(8);
    expect(previous.envelope?.revision).toBe(3);
    const receiptLog = harness.adapters[0]?.writeLog ?? [];
    expect(receiptLog).toHaveLength(2);
  });

  test("the snapshot for a triggering revision never carries later document state", async () => {
    const harness = createRecoveryHarness();
    const documentId = testDocumentId("doc-a1-rev-bind");
    harness.service.noteMutation({
      documentId,
      revision: 1,
      document: { documentVersion: 2, marker: "revision-one" },
    });
    await harness.clock.advance(400);
    const stored = harness.adapters[0]?.store.get(
      recoveryStorageKey(documentId, "current"),
    );
    const decoded = await decodeRecoveryEnvelope(stored ?? "");
    expect(decoded.envelope?.revision).toBe(1);
    expect(
      (decoded.envelope?.document as { marker?: string }).marker,
    ).toBe("revision-one");
  });
});
