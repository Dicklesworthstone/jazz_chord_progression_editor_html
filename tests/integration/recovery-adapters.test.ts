import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { recoveryStorageKey } from "../../src/persistence";
import {
  createRecoveryHarness,
  testDocumentId,
} from "../support/recovery-test-kit";

setDefaultTimeout(120_000);

describe("TR-A1-ADAPTERS adapter selection and bounds", () => {
  test("A1-ADAPT-001 a usable IndexedDB probe selects the primary adapter", async () => {
    const harness = createRecoveryHarness([
      { kind: "indexeddb" },
      { kind: "localstorage" },
    ]);
    const probe = await harness.service.probeRecoveryCapability();
    expect(probe.adapter).toBe("indexeddb");
    expect(probe.usable).toBe(true);
    expect(harness.service.inspectRecovery().adapter).toBe("indexeddb");
  });

  test("A1-ADAPT-002 a failed IndexedDB probe falls back to bounded localStorage", async () => {
    const harness = createRecoveryHarness([
      { kind: "indexeddb", probeUsable: false },
      { kind: "localstorage" },
    ]);
    const probe = await harness.service.probeRecoveryCapability();
    expect(probe.adapter).toBe("localstorage");
    expect(probe.usable).toBe(true);
    const documentId = testDocumentId("doc-a1-adapt-002");
    harness.service.noteMutation({
      documentId,
      revision: 1,
      document: { documentVersion: 2 },
    });
    await harness.clock.advance(400);
    expect(
      harness.adapters[1]?.store.has(
        recoveryStorageKey(documentId, "current"),
      ),
    ).toBe(true);
    expect(harness.adapters[0]?.store.size).toBe(0);
  });

  test("a throwing probe counts as failed, never as usable", async () => {
    const harness = createRecoveryHarness([
      { kind: "indexeddb", throwOnProbe: true },
      { kind: "localstorage" },
    ]);
    const probe = await harness.service.probeRecoveryCapability();
    expect(probe.adapter).toBe("localstorage");
    expect(probe.usable).toBe(true);
  });

  test("A1-ADAPT-008 every written key is schema-prefixed and bounded", async () => {
    const harness = createRecoveryHarness();
    const documentId = testDocumentId("doc-a1-adapt-008");
    harness.service.noteMutation({
      documentId,
      revision: 1,
      document: { documentVersion: 2 },
    });
    await harness.clock.advance(400);
    harness.service.noteMutation({
      documentId,
      revision: 2,
      document: { documentVersion: 2 },
    });
    await harness.clock.advance(400);
    const keys = [...(harness.adapters[0]?.store.keys() ?? [])];
    expect(keys.length).toBe(2);
    for (const key of keys) {
      expect(key.startsWith("changes.recovery.v1:")).toBe(true);
      expect(key.length).toBeLessThanOrEqual(256);
    }
  });

  test("discardRecovery removes both slots", async () => {
    const harness = createRecoveryHarness();
    const documentId = testDocumentId("doc-a1-adapt-discard");
    harness.service.noteMutation({
      documentId,
      revision: 1,
      document: { documentVersion: 2 },
    });
    await harness.clock.advance(400);
    harness.service.noteMutation({
      documentId,
      revision: 2,
      document: { documentVersion: 2 },
    });
    await harness.clock.advance(400);
    expect(harness.adapters[0]?.store.size).toBe(2);
    await harness.service.discardRecovery(documentId);
    expect(harness.adapters[0]?.store.size).toBe(0);
  });
});
