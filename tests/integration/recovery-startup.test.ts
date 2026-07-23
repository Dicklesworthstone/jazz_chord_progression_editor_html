import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { recoveryStorageKey } from "../../src/persistence";
import {
  createRecoveryHarness,
  seededEnvelopeText,
  testDocumentId,
  type RecoveryHarness,
} from "../support/recovery-test-kit";

setDefaultTimeout(120_000);

const root = resolve(import.meta.dirname, "../..");
const EXPORT_HASH = "ab".repeat(32);
const ARTIFACT_HASH = "cd".repeat(32);

type StartupCase = Readonly<{
  caseId: string;
  current?: string;
  previous?: string;
  sessionEdited?: boolean;
  exportMarkerAgrees?: boolean;
  adapter?: string;
  expected: Readonly<{ disposition?: string; audioInitialized?: boolean }>;
}>;

async function loadCases(): Promise<readonly StartupCase[]> {
  const raw = await readFile(
    resolve(root, "tests/fixtures/recovery/startup-cases.json"),
    "utf8",
  );
  return (JSON.parse(raw) as { cases: readonly StartupCase[] }).cases;
}

async function seedSlot(
  harness: RecoveryHarness,
  documentId: ReturnType<typeof testDocumentId>,
  slot: "current" | "previous",
  state: string,
  markerAgrees: boolean,
): Promise<void> {
  const store = harness.adapters[0]?.store;
  if (store === undefined) throw new Error("missing adapter store");
  const key = recoveryStorageKey(documentId, slot);
  if (state === "absent") return;
  if (state === "corrupt") {
    store.set(key, '{"schema":"changes.recovery.v1","truncated":');
    return;
  }
  const lastExport =
    state === "valid-stale-vs-marker" || !markerAgrees
      ? undefined
      : {
          revision: 9,
          exportedAt: "2026-07-23T09:00:00.000Z",
          semanticDocumentHash: EXPORT_HASH,
        };
  store.set(
    key,
    await seededEnvelopeText({
      revision: slot === "current" ? 12 : 5,
      lastExport,
    }),
  );
}

async function installMarker(harness: RecoveryHarness): Promise<void> {
  const documentId = testDocumentId("doc-a1-startup");
  harness.service.noteMutation({
    documentId,
    revision: 9,
    document: { documentVersion: 2 },
  });
  await harness.clock.advance(400);
  const recorded = await harness.service.recordExportBinding(
    {
      schema: "changes.recovery-export-binding.v1",
      documentId,
      exportRevision: 9,
      exportedAt: "2026-07-23T09:00:00.000Z",
      semanticDocumentHash: EXPORT_HASH,
      artifactByteLength: 2048,
      artifactSha256: ARTIFACT_HASH,
    },
    9,
  );
  expect(recorded.outcome).toBe("recorded");
}

describe("TR-A1-STARTUP the reviewed startup matrix", () => {
  test("every matrix row produces its reviewed disposition from a cold service", async () => {
    const cases = await loadCases();
    const mismatches: string[] = [];
    for (const row of cases) {
      if (row.current === undefined && row.adapter === undefined) continue;
      const adapterUnusable = row.adapter === "none";
      const harness = createRecoveryHarness([
        { kind: "indexeddb", probeUsable: !adapterUnusable },
      ]);
      const documentId = testDocumentId("doc-a1-startup");
      const markerAgrees = row.exportMarkerAgrees !== false;
      if (!adapterUnusable) {
        await installMarker(harness);
        harness.adapters[0]?.store.clear();
        await seedSlot(
          harness,
          documentId,
          "current",
          row.current ?? "absent",
          markerAgrees,
        );
        await seedSlot(
          harness,
          documentId,
          "previous",
          row.previous ?? "absent",
          true,
        );
      }
      const report = await harness.service.readRecoveryCandidates({
        documentId,
        sessionEdited: row.sessionEdited === true,
      });
      if (report.disposition !== row.expected.disposition) {
        mismatches.push(
          `${row.caseId}: ${report.disposition} != ${String(row.expected.disposition)}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  test("A1-START-005 a corrupt current with a valid previous surfaces both candidates honestly", async () => {
    const harness = createRecoveryHarness();
    const documentId = testDocumentId("doc-a1-startup");
    await seedSlot(harness, documentId, "current", "corrupt", true);
    await seedSlot(harness, documentId, "previous", "valid", true);
    const report = await harness.service.readRecoveryCandidates({
      documentId,
      sessionEdited: false,
    });
    expect(report.disposition).toBe("offer-previous");
    expect(report.current.outcome).toBe("corrupt");
    expect(report.current.reasonCode).toBe("recovery.corrupt_envelope");
    expect(report.previous.outcome).toBe("valid");
    expect(report.previous.envelope?.revision).toBe(5);
  });

  test("A1-START-012 no recovery path initializes audio or mutates the workspace", async () => {
    const harness = createRecoveryHarness();
    const documentId = testDocumentId("doc-a1-startup");
    await seedSlot(harness, documentId, "current", "valid-fresh", true);
    const report = await harness.service.readRecoveryCandidates({
      documentId,
      sessionEdited: false,
    });
    expect(report.disposition).toBe("open-current-automatically");
    const snapshot = harness.service.inspectRecovery();
    expect(snapshot.work.startupReportsProduced).toBe(1);
    // The service API has no audio, document-mutation, or UI surface at
    // all; the report is data the application must explicitly act on.
    expect(Object.keys(harness.service).sort()).toEqual([
      "discardRecovery",
      "flushRecoveryWrites",
      "inspectRecovery",
      "noteMutation",
      "probeRecoveryCapability",
      "readRecoveryCandidates",
      "recordExportBinding",
    ]);
  });
});
