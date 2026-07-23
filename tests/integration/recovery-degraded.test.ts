import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  RECOVERY_STATUS_VOCABULARY,
  recoveryStorageKey,
} from "../../src/persistence";
import {
  createRecoveryHarness,
  seededEnvelopeText,
  testDocumentId,
} from "../support/recovery-test-kit";

setDefaultTimeout(120_000);

describe("TR-A1-DEGRADED storage denial keeps editing", () => {
  test("A1-ADAPT-003 both probes failing selects none and points to Export", async () => {
    const harness = createRecoveryHarness([
      { kind: "indexeddb", probeUsable: false },
      { kind: "localstorage", probeUsable: false },
    ]);
    const probe = await harness.service.probeRecoveryCapability();
    expect(probe.adapter).toBe("none");
    expect(probe.usable).toBe(false);
    expect(probe.reasonCode).toBe("recovery.unavailable");
    expect(RECOVERY_STATUS_VOCABULARY.unavailable).toBe(
      "Recovery unavailable — export recommended",
    );

    const documentId = testDocumentId("doc-a1-degraded-none");
    harness.service.noteMutation({
      documentId,
      revision: 2,
      document: { documentVersion: 2 },
    });
    await harness.clock.advance(400);
    const snapshot = harness.service.inspectRecovery();
    expect(snapshot.pendingRevision).toBe(2);
    expect(snapshot.lastRefusal).toBe("recovery.unavailable");
    expect(snapshot.work.writesRefused).toBe(1);
  });

  test("A1-SCHED-007 quota exhaustion refuses with an actionable status and untouched state", async () => {
    const harness = createRecoveryHarness([
      { kind: "indexeddb", writeOutcome: "quota" },
    ]);
    const documentId = testDocumentId("doc-a1-degraded-quota");
    harness.service.noteMutation({
      documentId,
      revision: 3,
      document: { documentVersion: 2 },
    });
    await harness.clock.advance(400);
    const snapshot = harness.service.inspectRecovery();
    expect(snapshot.lastRefusal).toBe("recovery.quota_exceeded");
    expect(snapshot.cleanRevision).toBeNull();
    expect(snapshot.pendingRevision).toBe(3);
    expect(harness.adapters[0]?.store.size).toBe(0);
  });

  test("A1-SCHED-008 a denied write leaves both slots byte-for-byte unchanged", async () => {
    const harness = createRecoveryHarness([
      { kind: "indexeddb", writeOutcome: "denied" },
    ]);
    const documentId = testDocumentId("doc-a1-degraded-denied");
    const currentSeed = await seededEnvelopeText({ revision: 1 });
    const previousSeed = await seededEnvelopeText({ revision: 0 });
    harness.adapters[0]?.store.set(
      recoveryStorageKey(documentId, "current"),
      currentSeed,
    );
    harness.adapters[0]?.store.set(
      recoveryStorageKey(documentId, "previous"),
      previousSeed,
    );
    harness.service.noteMutation({
      documentId,
      revision: 4,
      document: { documentVersion: 2 },
    });
    await harness.clock.advance(400);
    const snapshot = harness.service.inspectRecovery();
    expect(snapshot.lastRefusal).toBe("recovery.write_denied");
    expect(
      harness.adapters[0]?.store.get(
        recoveryStorageKey(documentId, "current"),
      ),
    ).toBe(currentSeed);
    expect(
      harness.adapters[0]?.store.get(
        recoveryStorageKey(documentId, "previous"),
      ),
    ).toBe(previousSeed);
  });

  test("A1-ADAPT-007 the snapshot exposes identity and integrity data, never chart text", async () => {
    const harness = createRecoveryHarness([
      { kind: "indexeddb", writeOutcome: "denied" },
    ]);
    const documentId = testDocumentId("doc-a1-degraded-log");
    harness.service.noteMutation({
      documentId,
      revision: 9,
      document: { documentVersion: 2, title: "Secret Chart Title" },
    });
    await harness.clock.advance(400);
    const snapshot = harness.service.inspectRecovery();
    const serialized = JSON.stringify({
      adapter: snapshot.adapter,
      documentId: snapshot.documentId,
      pendingRevision: snapshot.pendingRevision,
      cleanRevision: snapshot.cleanRevision,
      lastRefusal: snapshot.lastRefusal,
      work: snapshot.work,
    });
    expect(serialized.includes("Secret Chart Title")).toBe(false);
    expect(snapshot.pendingRevision).toBe(9);
  });
});
