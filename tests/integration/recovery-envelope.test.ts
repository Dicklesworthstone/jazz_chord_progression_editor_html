import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  decodeRecoveryEnvelope,
  MAX_RECOVERY_ENVELOPE_BYTES_INDEXEDDB,
  MAX_RECOVERY_ENVELOPE_BYTES_LOCALSTORAGE,
  recoveryStorageKey,
} from "../../src/persistence";
import {
  createRecoveryHarness,
  seededEnvelopeText,
  testDocumentId,
} from "../support/recovery-test-kit";

setDefaultTimeout(120_000);

const root = resolve(import.meta.dirname, "../..");

type EnvelopeCase = Readonly<{
  caseId: string;
  envelope?: Readonly<Record<string, unknown>>;
  storedText?: string;
  invalidRevisions?: readonly number[];
  expected: Readonly<{ outcome?: string; reasonCode?: string }>;
}>;

async function loadCases(): Promise<readonly EnvelopeCase[]> {
  const raw = await readFile(
    resolve(root, "tests/fixtures/recovery/envelope-cases.json"),
    "utf8",
  );
  return (JSON.parse(raw) as { cases: readonly EnvelopeCase[] }).cases;
}

function requireCase(
  cases: readonly EnvelopeCase[],
  id: string,
): EnvelopeCase {
  const found = cases.find((candidate) => candidate.caseId === id);
  if (found === undefined) throw new Error(`missing case ${id}`);
  return found;
}

describe("TR-A1-ENVELOPE envelope validation", () => {
  test("A1-ENV-005 an unknown schema refuses with the stable code", async () => {
    const row = requireCase(await loadCases(), "A1-ENV-005");
    const decoded = await decodeRecoveryEnvelope(JSON.stringify(row.envelope));
    expect(decoded.outcome).toBe("corrupt");
    expect(decoded.reasonCode).toBe(row.expected.reasonCode);
  });

  test("A1-ENV-006 hostile revisions refuse as revision_invalid", async () => {
    const row = requireCase(await loadCases(), "A1-ENV-006");
    for (const revision of row.invalidRevisions ?? []) {
      const decoded = await decodeRecoveryEnvelope(
        JSON.stringify({
          schema: "changes.recovery.v1",
          savedAt: "2026-07-23T12:00:00.000Z",
          revision,
          document: {},
          checksum: "0".repeat(64),
        }),
      );
      expect(decoded.outcome).toBe("corrupt");
      expect(decoded.reasonCode).toBe(row.expected.reasonCode);
    }
  });

  test("A1-ENV-007 a lastExport subset missing its hash is corrupt", async () => {
    const row = requireCase(await loadCases(), "A1-ENV-007");
    const decoded = await decodeRecoveryEnvelope(JSON.stringify(row.envelope));
    expect(decoded.outcome).toBe("corrupt");
    expect(decoded.reasonCode).toBe(row.expected.reasonCode);
  });

  test("A1-ENV-008 unparseable stored text is corrupt with a stable code", async () => {
    const row = requireCase(await loadCases(), "A1-ENV-008");
    const decoded = await decodeRecoveryEnvelope(row.storedText ?? "");
    expect(decoded.outcome).toBe("corrupt");
    expect(decoded.reasonCode).toBe(row.expected.reasonCode);
  });

  test("A1-ENV-009 an envelope one byte over the adapter bound refuses without touching slots", async () => {
    const harness = createRecoveryHarness([{ kind: "localstorage" }]);
    const documentId = testDocumentId("doc-a1-bound");
    const seeded = await seededEnvelopeText({ revision: 1 });
    harness.adapters[0]?.store.set(
      recoveryStorageKey(documentId, "current"),
      seeded,
    );
    const oversized = "x".repeat(MAX_RECOVERY_ENVELOPE_BYTES_LOCALSTORAGE);
    harness.service.noteMutation({
      documentId,
      revision: 2,
      document: { documentVersion: 2, title: oversized },
    });
    await harness.clock.advance(400);
    const snapshot = harness.service.inspectRecovery();
    expect(snapshot.lastRefusal).toBe("recovery.envelope_too_large");
    expect(snapshot.work.writesRefused).toBe(1);
    expect(
      harness.adapters[0]?.store.get(
        recoveryStorageKey(documentId, "current"),
      ),
    ).toBe(seeded);
    expect(MAX_RECOVERY_ENVELOPE_BYTES_INDEXEDDB).toBeGreaterThan(
      MAX_RECOVERY_ENVELOPE_BYTES_LOCALSTORAGE,
    );
  });

  test("A1-ENV-010 storage keys embed schema and document ID and never user text", async () => {
    const cases = await loadCases();
    const row = requireCase(cases, "A1-ENV-010");
    const documentId = testDocumentId("doc-a1-key");
    const expectedKeys = row as unknown as {
      expectedKeys: { current: string; previous: string };
    };
    expect(recoveryStorageKey(documentId, "current")).toBe(
      expectedKeys.expectedKeys.current,
    );
    expect(recoveryStorageKey(documentId, "previous")).toBe(
      expectedKeys.expectedKeys.previous,
    );

    const harness = createRecoveryHarness();
    harness.service.noteMutation({
      documentId,
      revision: 1,
      document: { documentVersion: 2, title: "User Title Not A Key" },
    });
    await harness.clock.advance(400);
    const keys = [...(harness.adapters[0]?.store.keys() ?? [])];
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key.startsWith("changes.recovery.v1:")).toBe(true);
      expect(key.includes("User Title")).toBe(false);
    }
  });
});
