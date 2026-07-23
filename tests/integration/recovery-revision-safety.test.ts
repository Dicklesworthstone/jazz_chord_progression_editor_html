import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { decodeRecoveryEnvelope, recoveryStorageKey } from "../../src/persistence";
import {
  createRecoveryHarness,
  testDocumentId,
} from "../support/recovery-test-kit";

setDefaultTimeout(120_000);

describe("TR-A1-REVISION-SAFETY revision-safe completion and rotation", () => {
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
