import { parseStableId, type DocumentId } from "../domain";
import {
  computeEnvelopeChecksum,
  createIndexedDbRecoveryAdapter,
  createLocalStorageRecoveryAdapter,
  createRecoveryService,
  RECOVERY_ENVELOPE_SCHEMA,
  recoveryStorageKey,
  type RecoveryService,
  type RecoveryStartupReport,
  type RecoveryWriteReceipt,
} from "../persistence";

/**
 * A1 real-browser recovery evidence harness.
 *
 * Bundled into one self-contained script and driven by the Playwright
 * reload spec. It composes the production recovery service over the real
 * IndexedDB and localStorage adapters with real browser clocks, so a
 * reload in the same browser context proves genuine cross-load recovery.
 * Logs and returned records carry revisions, hashes, reason codes, and
 * adapter kinds — never chart text.
 */

export type A1BrowserWriteResult = Readonly<{
  adapter: string;
  receipt: RecoveryWriteReceipt | null;
  pendingRevision: number | null;
  cleanRevision: number | null;
}>;

export type A1BrowserReadResult = Readonly<{
  adapter: string;
  disposition: RecoveryStartupReport["disposition"];
  currentOutcome: string;
  currentReasonCode: string | null;
  currentRevision: number | null;
  previousOutcome: string;
  previousRevision: number | null;
}>;

export type A1RecoveryBrowserHarness = Readonly<{
  writePhase: (
    documentIdWire: string,
    revision: number,
    useLocalStorageOnly: boolean,
  ) => Promise<A1BrowserWriteResult>;
  visibilityFlushPhase: (
    documentIdWire: string,
    revision: number,
  ) => Promise<A1BrowserWriteResult>;
  corruptCurrentPhase: (documentIdWire: string) => Promise<boolean>;
  readPhase: (
    documentIdWire: string,
    sessionEdited: boolean,
    useLocalStorageOnly: boolean,
  ) => Promise<A1BrowserReadResult>;
}>;

function requireDocumentId(wire: string): DocumentId {
  const parsed = parseStableId("document", wire);
  if (!parsed.ok) throw new Error(`A1_BROWSER_DOCUMENT_ID:${wire}`);
  return parsed.value;
}

function buildService(useLocalStorageOnly: boolean): RecoveryService {
  const adapters = useLocalStorageOnly
    ? [createLocalStorageRecoveryAdapter()]
    : [
        createIndexedDbRecoveryAdapter(),
        createLocalStorageRecoveryAdapter(),
      ];
  return createRecoveryService({
    adapters,
    clock: Object.freeze({
      nowMs: () => performance.now(),
      nowIso: () => new Date().toISOString(),
      setTimeout: (callback: () => void, delayMs: number) =>
        window.setTimeout(callback, delayMs),
      clearTimeout: (handle: number) => {
        window.clearTimeout(handle);
      },
    }),
  });
}

async function writeWith(
  service: RecoveryService,
  documentIdWire: string,
  revision: number,
  viaVisibility: boolean,
): Promise<A1BrowserWriteResult> {
  const documentId = requireDocumentId(documentIdWire);
  service.noteMutation({
    documentId,
    revision,
    document: {
      documentVersion: 2,
      title: `browser-evidence-revision-${String(revision)}`,
    },
  });
  let receipt: RecoveryWriteReceipt | null;
  if (viaVisibility) {
    const flushed = new Promise<RecoveryWriteReceipt | null>(
      (resolveFlush) => {
        document.addEventListener(
          "visibilitychange",
          () => {
            void service
              .flushRecoveryWrites("visibility-change")
              .then(resolveFlush);
          },
          { once: true },
        );
      },
    );
    document.dispatchEvent(new Event("visibilitychange"));
    receipt = await flushed;
  } else {
    receipt = await service.flushRecoveryWrites("visibility-change");
  }
  const snapshot = service.inspectRecovery();
  return Object.freeze({
    adapter: snapshot.adapter,
    receipt,
    pendingRevision: snapshot.pendingRevision,
    cleanRevision: snapshot.cleanRevision,
  });
}

const harness: A1RecoveryBrowserHarness = Object.freeze({
  async writePhase(documentIdWire, revision, useLocalStorageOnly) {
    const service = buildService(useLocalStorageOnly);
    return await writeWith(service, documentIdWire, revision, false);
  },
  async visibilityFlushPhase(documentIdWire, revision) {
    const service = buildService(false);
    return await writeWith(service, documentIdWire, revision, true);
  },
  async corruptCurrentPhase(documentIdWire) {
    const documentId = requireDocumentId(documentIdWire);
    const adapter = createIndexedDbRecoveryAdapter();
    const key = recoveryStorageKey(documentId, "current");
    const corrupt: Record<string, unknown> = {
      schema: RECOVERY_ENVELOPE_SCHEMA,
      savedAt: new Date().toISOString(),
      revision: 999,
      document: { documentVersion: 2 },
    };
    const checksum = await computeEnvelopeChecksum(corrupt);
    // Flip the final hex digit so the stored checksum can never equal the
    // genuine one; appending a fixed "0" was a no-op 1 time in 16.
    const lastDigit = Number.parseInt(checksum.slice(63), 16);
    const flipped = ((lastDigit + 1) % 16).toString(16);
    corrupt["checksum"] = `${checksum.slice(0, 63)}${flipped}`;
    const outcome = await adapter.writeCurrentWithRotation(
      key,
      recoveryStorageKey(documentId, "previous"),
      JSON.stringify(corrupt),
    );
    return outcome === "written";
  },
  async readPhase(documentIdWire, sessionEdited, useLocalStorageOnly) {
    const service = buildService(useLocalStorageOnly);
    const report = await service.readRecoveryCandidates({
      documentId: requireDocumentId(documentIdWire),
      sessionEdited,
    });
    return Object.freeze({
      adapter: report.adapter,
      disposition: report.disposition,
      currentOutcome: report.current.outcome,
      currentReasonCode: report.current.reasonCode,
      currentRevision: report.current.envelope?.revision ?? null,
      previousOutcome: report.previous.outcome,
      previousRevision: report.previous.envelope?.revision ?? null,
    });
  },
});

declare global {
  var __JCPE_A1_RECOVERY_EVIDENCE__: A1RecoveryBrowserHarness | undefined;
}

globalThis.__JCPE_A1_RECOVERY_EVIDENCE__ = harness;
