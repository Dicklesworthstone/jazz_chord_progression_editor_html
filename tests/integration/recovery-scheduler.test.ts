import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { decodeRecoveryEnvelope, recoveryStorageKey } from "../../src/persistence";
import {
  createRecoveryHarness,
  testDocumentId,
} from "../support/recovery-test-kit";

setDefaultTimeout(120_000);

describe("TR-A1-SCHEDULER / TR-LEGACY-DATA-LOSS write scheduling", () => {
  test("A1-SCHED-001 a mutation marks recovery pending immediately", () => {
    const harness = createRecoveryHarness();
    const documentId = testDocumentId("doc-a1-sched-001");
    harness.service.noteMutation({
      documentId,
      revision: 3,
      document: { documentVersion: 2 },
    });
    const snapshot = harness.service.inspectRecovery();
    expect(snapshot.pendingRevision).toBe(3);
    expect(snapshot.cleanRevision).toBeNull();
    expect(snapshot.work.writesScheduled).toBe(1);
  });

  test("A1-SCHED-002 one idle window produces exactly one write of the triggering revision", async () => {
    const harness = createRecoveryHarness();
    const documentId = testDocumentId("doc-a1-sched-002");
    harness.service.noteMutation({
      documentId,
      revision: 3,
      document: { documentVersion: 2 },
    });
    await harness.clock.advance(399);
    expect(harness.service.inspectRecovery().work.writesCompleted).toBe(0);
    await harness.clock.advance(1);
    const snapshot = harness.service.inspectRecovery();
    expect(snapshot.work.writesCompleted).toBe(1);
    expect(snapshot.cleanRevision).toBe(3);
    expect(snapshot.pendingRevision).toBeNull();
    const stored = harness.adapters[0]?.store.get(
      recoveryStorageKey(documentId, "current"),
    );
    expect(stored).toBeDefined();
    const decoded = await decodeRecoveryEnvelope(stored ?? "");
    expect(decoded.envelope?.revision).toBe(3);
  });

  test("A1-SCHED-003 continuous editing flushes the newest revision by the two-second maximum", async () => {
    const harness = createRecoveryHarness();
    const documentId = testDocumentId("doc-a1-sched-003");
    for (let step = 0; step < 7; step += 1) {
      harness.service.noteMutation({
        documentId,
        revision: step + 1,
        document: { documentVersion: 2, step },
      });
      if (step < 6) await harness.clock.advance(300);
    }
    expect(harness.service.inspectRecovery().work.writesCompleted).toBe(0);
    await harness.clock.advance(200);
    const snapshot = harness.service.inspectRecovery();
    expect(snapshot.work.writesCompleted).toBe(1);
    expect(snapshot.cleanRevision).toBe(7);
    expect(harness.clock.now()).toBe(2000);
  });

  test("A1-SCHED-004 a newer trigger replaces the queued snapshot; one write in flight", async () => {
    const harness = createRecoveryHarness();
    const documentId = testDocumentId("doc-a1-sched-004");
    harness.service.noteMutation({
      documentId,
      revision: 1,
      document: { documentVersion: 2 },
    });
    await harness.clock.advance(200);
    harness.service.noteMutation({
      documentId,
      revision: 2,
      document: { documentVersion: 2 },
    });
    await harness.clock.advance(400);
    const snapshot = harness.service.inspectRecovery();
    expect(snapshot.work.writesCompleted).toBe(1);
    expect(snapshot.cleanRevision).toBe(2);
    expect(harness.adapters[0]?.writeLog).toHaveLength(1);
  });

  test("A1-SCHED-006 a visibility change flushes one best-effort write", async () => {
    const harness = createRecoveryHarness();
    const documentId = testDocumentId("doc-a1-sched-006");
    harness.service.noteMutation({
      documentId,
      revision: 5,
      document: { documentVersion: 2 },
    });
    const receipt = await harness.service.flushRecoveryWrites(
      "visibility-change",
    );
    expect(receipt?.outcome).toBe("written");
    expect(receipt?.revision).toBe(5);
    expect(harness.service.inspectRecovery().cleanRevision).toBe(5);
  });

  test("A1-SCHED-010 a clean completion records the written revision exactly once", async () => {
    const harness = createRecoveryHarness();
    const documentId = testDocumentId("doc-a1-sched-010");
    harness.service.noteMutation({
      documentId,
      revision: 4,
      document: { documentVersion: 2 },
    });
    await harness.clock.advance(400);
    await harness.clock.advance(5000);
    const snapshot = harness.service.inspectRecovery();
    expect(snapshot.work.writesCompleted).toBe(1);
    expect(snapshot.cleanRevision).toBe(4);
    expect(snapshot.lastRefusal).toBeNull();
    expect(harness.adapters[0]?.writeLog).toHaveLength(1);
  });
});
