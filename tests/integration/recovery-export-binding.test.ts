import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  decodeRecoveryEnvelope,
  recoveryStorageKey,
  type RecoveryExportBinding,
} from "../../src/persistence";
import {
  createRecoveryHarness,
  testDocumentId,
} from "../support/recovery-test-kit";

setDefaultTimeout(120_000);

const EXPORT_HASH = "ab".repeat(32);
const ARTIFACT_HASH = "cd".repeat(32);

function binding(
  overrides: Partial<RecoveryExportBinding> = {},
): RecoveryExportBinding {
  return {
    schema: "changes.recovery-export-binding.v1",
    documentId: testDocumentId("doc-a1-export"),
    exportRevision: 9,
    exportedAt: "2026-07-23T11:50:00.000Z",
    semanticDocumentHash: EXPORT_HASH,
    artifactByteLength: 20480,
    artifactSha256: ARTIFACT_HASH,
    ...overrides,
  };
}

async function boundHarness() {
  const harness = createRecoveryHarness();
  const documentId = testDocumentId("doc-a1-export");
  harness.service.noteMutation({
    documentId,
    revision: 9,
    document: { documentVersion: 2 },
  });
  await harness.clock.advance(400);
  return { harness, documentId };
}

describe("TR-A1-EXPORT-BINDING marker durability", () => {
  test("A1-EXPORT-001/A1-EXPORT-002 exact success stores the binding and later envelopes carry only the subset", async () => {
    const { harness, documentId } = await boundHarness();
    const recorded = await harness.service.recordExportBinding(binding(), 9);
    expect(recorded.outcome).toBe("recorded");
    const snapshot = harness.service.inspectRecovery();
    expect(snapshot.exportBinding?.exportRevision).toBe(9);
    expect(snapshot.work.exportBindingsRecorded).toBe(1);

    harness.service.noteMutation({
      documentId,
      revision: 10,
      document: { documentVersion: 2 },
    });
    await harness.clock.advance(400);
    const stored = harness.adapters[0]?.store.get(
      recoveryStorageKey(documentId, "current"),
    );
    const decoded = await decodeRecoveryEnvelope(stored ?? "");
    expect(decoded.envelope?.lastExport).toEqual({
      revision: 9,
      exportedAt: "2026-07-23T11:50:00.000Z",
      semanticDocumentHash: EXPORT_HASH,
    });
  });

  test("A1-EXPORT-004 a stale marker for a superseded revision refuses without touching newer state", async () => {
    const { harness, documentId } = await boundHarness();
    harness.service.noteMutation({
      documentId,
      revision: 14,
      document: { documentVersion: 2 },
    });
    await harness.clock.advance(400);
    const refused = await harness.service.recordExportBinding(binding(), 14);
    expect(refused.outcome).toBe("refused");
    if (refused.outcome === "refused") {
      expect(refused.reasonCode).toBe("recovery.export_marker_stale");
    }
    const snapshot = harness.service.inspectRecovery();
    expect(snapshot.exportBinding).toBeNull();
    expect(snapshot.cleanRevision).toBe(14);
    expect(snapshot.work.exportBindingsRefused).toBe(1);
  });

  test("A1-EXPORT-005 failed binding persistence stays visibly pending without a reload claim", async () => {
    const harness = createRecoveryHarness([
      { kind: "indexeddb", probeUsable: false },
      { kind: "localstorage", probeUsable: false },
    ]);
    const documentId = testDocumentId("doc-a1-export");
    harness.service.noteMutation({
      documentId,
      revision: 9,
      document: { documentVersion: 2 },
    });
    await harness.clock.advance(400);
    const refused = await harness.service.recordExportBinding(binding(), 9);
    expect(refused.outcome).toBe("refused");
    if (refused.outcome === "refused") {
      expect(refused.reasonCode).toBe("recovery.write_denied");
    }
    expect(harness.service.inspectRecovery().exportBinding).toBeNull();
  });

  test("A1-EXPORT-006 malformed bindings refuse with the stable code", async () => {
    const { harness } = await boundHarness();
    const hostileBindings: readonly RecoveryExportBinding[] = [
      { ...binding(), semanticDocumentHash: "not-hex" },
      { ...binding(), exportRevision: -2 },
      { ...binding(), artifactSha256: "not-hex" },
      {
        ...binding(),
        schema: "changes.recovery-export-binding.v2" as never,
      },
    ];
    for (const hostile of hostileBindings) {
      const refused = await harness.service.recordExportBinding(hostile, 9);
      expect(refused.outcome).toBe("refused");
      if (refused.outcome === "refused") {
        expect(refused.reasonCode).toBe("recovery.export_binding_invalid");
      }
    }
    expect(
      harness.service.inspectRecovery().work.exportBindingsRefused,
    ).toBe(4);
  });

  test("A1-EXPORT-007 a binding for a different document refuses", async () => {
    const { harness } = await boundHarness();
    const refused = await harness.service.recordExportBinding(
      binding({ documentId: testDocumentId("doc-a1-other") }),
      9,
    );
    expect(refused.outcome).toBe("refused");
    if (refused.outcome === "refused") {
      expect(refused.reasonCode).toBe("recovery.document_id_mismatch");
    }
    expect(harness.service.inspectRecovery().exportBinding).toBeNull();
  });

  test("A1-EXPORT-003 no binding call means no marker movement", async () => {
    const { harness } = await boundHarness();
    expect(harness.service.inspectRecovery().exportBinding).toBeNull();
    expect(
      harness.service.inspectRecovery().work.exportBindingsRecorded,
    ).toBe(0);
  });
});
