import type { DocumentId } from "../domain";
import {
  MAX_RECOVERY_ENVELOPE_BYTES_INDEXEDDB,
  MAX_RECOVERY_ENVELOPE_BYTES_LOCALSTORAGE,
  RECOVERY_ENVELOPE_SCHEMA,
  RECOVERY_EXPORT_BINDING_SCHEMA,
  RECOVERY_IDLE_DELAY_MS,
  RECOVERY_MAX_DELAY_MS,
  RECOVERY_POLICY_ID,
  RECOVERY_POLICY_VERSION,
  RECOVERY_WORK_COUNTER_NAMES,
  recoveryStorageKey,
  type RecoveryAdapterKind,
  type RecoveryAdapterPort,
  type RecoveryCandidate,
  type RecoveryCapabilityProbe,
  type RecoveryEnvelope,
  type RecoveryExportBinding,
  type RecoveryPlatformPort,
  type RecoveryRefusalCode,
  type RecoverySlot,
  type RecoverySnapshot,
  type RecoveryStartupDisposition,
  type RecoveryStartupReport,
  type RecoveryWorkCounterName,
  type RecoveryWriteReceipt,
} from "./recovery-contract";

/**
 * A1 production recovery service.
 *
 * Browser persistence is Recovery, never Save. The service owns adapter
 * selection, the frozen envelope checksum, idle/max-delay write scheduling
 * with revision-safe completion, current/previous rotation, the startup
 * candidate report, and the separately stored export binding. It imports
 * only `domain` and the A1 contract; envelopes carry the plain decoder
 * candidate, and no `ValidatedDocument` brand is ever persisted or revived
 * here. Recovery never initializes audio.
 */

type MutableCounters = Record<RecoveryWorkCounterName, number>;

function zeroCounters(): MutableCounters {
  const counters: Partial<MutableCounters> = {};
  for (const name of RECOVERY_WORK_COUNTER_NAMES) counters[name] = 0;
  return counters as MutableCounters;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
  );
}

function isPositiveSafeInteger(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value > 0
  );
}

const SHA256_HEX = /^[a-f0-9]{64}$/u;

/** Canonical JSON: sorted keys at every depth, no insignificant whitespace. */
export function canonicalRecoveryJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalRecoveryJson(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    const body = keys
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalRecoveryJson(value[key])}`,
      )
      .join(",");
    return `{${body}}`;
  }
  const encoded = JSON.stringify(value) as string | undefined;
  return encoded === undefined ? "null" : encoded;
}

async function sha256HexOf(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** The frozen checksum: sha256 over canonical JSON without `checksum`. */
export async function computeEnvelopeChecksum(
  envelope: Readonly<Record<string, unknown>>,
): Promise<string> {
  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(envelope)) {
    if (key !== "checksum") clone[key] = value;
  }
  return await sha256HexOf(canonicalRecoveryJson(clone));
}

export type DecodedEnvelope = Readonly<{
  outcome: "valid" | "corrupt";
  reasonCode: RecoveryRefusalCode | null;
  envelope: RecoveryEnvelope | null;
}>;

/** Decode and checksum-check one stored payload without repairing it. */
export async function decodeRecoveryEnvelope(
  storedText: string,
): Promise<DecodedEnvelope> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(storedText);
  } catch {
    return Object.freeze({
      outcome: "corrupt",
      reasonCode: "recovery.corrupt_envelope",
      envelope: null,
    });
  }
  if (!isRecord(parsed)) {
    return Object.freeze({
      outcome: "corrupt",
      reasonCode: "recovery.corrupt_envelope",
      envelope: null,
    });
  }
  if (parsed["schema"] !== RECOVERY_ENVELOPE_SCHEMA) {
    return Object.freeze({
      outcome: "corrupt",
      reasonCode: "recovery.schema_unknown",
      envelope: null,
    });
  }
  if (!isNonnegativeSafeInteger(parsed["revision"])) {
    return Object.freeze({
      outcome: "corrupt",
      reasonCode: "recovery.revision_invalid",
      envelope: null,
    });
  }
  const savedAt = parsed["savedAt"];
  const checksum = parsed["checksum"];
  const revision = parsed["revision"];
  if (
    typeof savedAt !== "string" ||
    savedAt.length === 0 ||
    typeof checksum !== "string" ||
    !isNonnegativeSafeInteger(revision) ||
    !("document" in parsed)
  ) {
    return Object.freeze({
      outcome: "corrupt",
      reasonCode: "recovery.corrupt_envelope",
      envelope: null,
    });
  }
  const rawLastExport = parsed["lastExport"];
  let lastExport:
    | Readonly<{
        revision: number;
        exportedAt: string;
        semanticDocumentHash: string;
      }>
    | undefined;
  if (rawLastExport !== undefined) {
    if (
      !isRecord(rawLastExport) ||
      !isNonnegativeSafeInteger(rawLastExport["revision"]) ||
      typeof rawLastExport["exportedAt"] !== "string" ||
      typeof rawLastExport["semanticDocumentHash"] !== "string" ||
      !SHA256_HEX.test(rawLastExport["semanticDocumentHash"])
    ) {
      return Object.freeze({
        outcome: "corrupt",
        reasonCode: "recovery.corrupt_envelope",
        envelope: null,
      });
    }
    lastExport = Object.freeze({
      revision: rawLastExport["revision"],
      exportedAt: rawLastExport["exportedAt"],
      semanticDocumentHash: rawLastExport["semanticDocumentHash"],
    });
  }
  const recomputed = await computeEnvelopeChecksum(parsed);
  if (checksum !== recomputed) {
    return Object.freeze({
      outcome: "corrupt",
      reasonCode: "recovery.checksum_mismatch",
      envelope: null,
    });
  }
  const envelope: RecoveryEnvelope = Object.freeze(
    lastExport === undefined
      ? {
          schema: RECOVERY_ENVELOPE_SCHEMA,
          savedAt,
          revision,
          document: parsed["document"],
          checksum,
        }
      : {
          schema: RECOVERY_ENVELOPE_SCHEMA,
          savedAt,
          revision,
          lastExport,
          document: parsed["document"],
          checksum,
        },
  );
  return Object.freeze({
    outcome: "valid",
    reasonCode: null,
    envelope,
  });
}

function envelopeBound(kind: RecoveryAdapterKind): number {
  return kind === "localstorage"
    ? MAX_RECOVERY_ENVELOPE_BYTES_LOCALSTORAGE
    : MAX_RECOVERY_ENVELOPE_BYTES_INDEXEDDB;
}

export type RecoveryMutationInput = Readonly<{
  documentId: DocumentId;
  revision: number;
  document: unknown;
}>;

export type RecoveryStartupInput = Readonly<{
  documentId: DocumentId;
  sessionEdited: boolean;
}>;

export type RecoveryService = Readonly<{
  probeRecoveryCapability: () => Promise<RecoveryCapabilityProbe>;
  readRecoveryCandidates: (
    input: RecoveryStartupInput,
  ) => Promise<RecoveryStartupReport>;
  noteMutation: (input: RecoveryMutationInput) => void;
  flushRecoveryWrites: (
    trigger: "visibility-change",
  ) => Promise<RecoveryWriteReceipt | null>;
  recordExportBinding: (
    binding: RecoveryExportBinding,
    currentRevision: number,
  ) => Promise<
    | Readonly<{ outcome: "recorded" }>
    | Readonly<{ outcome: "refused"; reasonCode: RecoveryRefusalCode }>
  >;
  discardRecovery: (documentId: DocumentId) => Promise<void>;
  inspectRecovery: () => RecoverySnapshot;
}>;

export function createRecoveryService(
  platform: RecoveryPlatformPort,
): RecoveryService {
  const work = zeroCounters();
  let selected: RecoveryAdapterPort | null = null;
  let selectedKind: RecoveryAdapterKind = "none";
  let probed = false;
  let boundDocumentId: DocumentId | null = null;
  let pendingRevision: number | null = null;
  let cleanRevision: number | null = null;
  let currentRevision = 0;
  let lastRefusal: RecoveryRefusalCode | null = null;
  let exportBinding: RecoveryExportBinding | null = null;
  const queue: { input: RecoveryMutationInput | null } = {
    input: null,
  };
  let idleHandle: number | null = null;
  let maxDelayHandle: number | null = null;
  let writeInFlight = false;

  function clearTimers(): void {
    if (idleHandle !== null) {
      platform.clock.clearTimeout(idleHandle);
      idleHandle = null;
    }
    if (maxDelayHandle !== null) {
      platform.clock.clearTimeout(maxDelayHandle);
      maxDelayHandle = null;
    }
  }

  async function probe(): Promise<RecoveryCapabilityProbe> {
    work.probesRun += 1;
    for (const adapter of platform.adapters) {
      let result: RecoveryCapabilityProbe;
      try {
        result = await adapter.probe();
      } catch {
        result = Object.freeze({
          adapter: adapter.kind,
          usable: false,
          reasonCode: "recovery.probe_failed",
        });
      }
      if (result.usable) {
        selected = adapter;
        selectedKind = adapter.kind;
        probed = true;
        return Object.freeze({
          adapter: adapter.kind,
          usable: true,
          reasonCode: null,
        });
      }
    }
    selected = null;
    selectedKind = "none";
    probed = true;
    lastRefusal = "recovery.unavailable";
    return Object.freeze({
      adapter: "none",
      usable: false,
      reasonCode: "recovery.unavailable",
    });
  }

  async function ensureProbed(): Promise<void> {
    if (!probed) await probe();
  }

  async function readCandidate(
    documentId: DocumentId,
    slot: RecoverySlot,
  ): Promise<RecoveryCandidate> {
    if (selected === null) {
      return Object.freeze({
        slot,
        outcome: "absent",
        reasonCode: null,
        envelope: null,
      });
    }
    let stored: string | null;
    try {
      stored = await selected.read(recoveryStorageKey(documentId, slot));
    } catch {
      return Object.freeze({
        slot,
        outcome: "corrupt",
        reasonCode: "recovery.corrupt_envelope",
        envelope: null,
      });
    }
    if (stored === null) {
      return Object.freeze({
        slot,
        outcome: "absent",
        reasonCode: null,
        envelope: null,
      });
    }
    work.envelopesDecoded += 1;
    const decoded = await decodeRecoveryEnvelope(stored);
    if (decoded.outcome === "corrupt") {
      work.envelopesRejected += 1;
      return Object.freeze({
        slot,
        outcome: "corrupt",
        reasonCode: decoded.reasonCode,
        envelope: null,
      });
    }
    const envelope = decoded.envelope;
    if (
      envelope !== null &&
      exportBinding !== null &&
      envelope.lastExport !== undefined &&
      envelope.lastExport.semanticDocumentHash !==
        exportBinding.semanticDocumentHash
    ) {
      // Disagreement is reported through the startup matrix, not repaired.
    }
    return Object.freeze({
      slot,
      outcome: "valid",
      reasonCode: null,
      envelope,
    });
  }

  function decideDisposition(
    current: RecoveryCandidate,
    previous: RecoveryCandidate,
    sessionEdited: boolean,
    conflictsWithExportMarker: boolean,
  ): RecoveryStartupDisposition {
    if (selectedKind === "none") return "none-available";
    if (current.outcome === "valid") {
      if (sessionEdited || conflictsWithExportMarker) {
        return "offer-keep-discard";
      }
      return "open-current-automatically";
    }
    if (previous.outcome === "valid") return "offer-previous";
    if (current.outcome === "corrupt" || previous.outcome === "corrupt") {
      return "report-unrecoverable";
    }
    return "none-available";
  }

  async function readRecoveryCandidates(
    input: RecoveryStartupInput,
  ): Promise<RecoveryStartupReport> {
    await ensureProbed();
    boundDocumentId = input.documentId;
    const current = await readCandidate(input.documentId, "current");
    const previous = await readCandidate(input.documentId, "previous");
    const conflictsWithExportMarker =
      current.outcome === "valid" &&
      current.envelope !== null &&
      exportBinding !== null &&
      (current.envelope.lastExport === undefined ||
        current.envelope.lastExport.revision !== exportBinding.exportRevision ||
        current.envelope.lastExport.semanticDocumentHash !==
          exportBinding.semanticDocumentHash);
    const disposition = decideDisposition(
      current,
      previous,
      input.sessionEdited,
      conflictsWithExportMarker,
    );
    work.startupReportsProduced += 1;
    return Object.freeze({
      adapter: selectedKind,
      disposition,
      current,
      previous,
      conflictsWithExportMarker,
    });
  }

  async function buildEnvelope(
    input: RecoveryMutationInput,
  ): Promise<RecoveryEnvelope> {
    const body: Record<string, unknown> = {
      schema: RECOVERY_ENVELOPE_SCHEMA,
      savedAt: platform.clock.nowIso(),
      revision: input.revision,
      document: input.document,
    };
    if (
      exportBinding !== null &&
      boundDocumentId !== null &&
      exportBinding.documentId === boundDocumentId
    ) {
      body["lastExport"] = {
        revision: exportBinding.exportRevision,
        exportedAt: exportBinding.exportedAt,
        semanticDocumentHash: exportBinding.semanticDocumentHash,
      };
    }
    const checksum = await computeEnvelopeChecksum(body);
    return Object.freeze({
      ...body,
      checksum,
    }) as RecoveryEnvelope;
  }

  async function performWrite(
    input: RecoveryMutationInput,
  ): Promise<RecoveryWriteReceipt> {
    const envelope = await buildEnvelope(input);
    const payload = JSON.stringify(envelope);
    const payloadBytes = new TextEncoder().encode(payload).byteLength;
    if (selected === null) {
      work.writesRefused += 1;
      lastRefusal = "recovery.unavailable";
      return Object.freeze({
        outcome: "refused",
        adapter: selectedKind,
        revision: input.revision,
        currentRevisionAtCompletion: currentRevision,
        reasonCode: "recovery.unavailable",
        rotatedPreviousRevision: null,
      });
    }
    if (payloadBytes > envelopeBound(selected.kind)) {
      work.writesRefused += 1;
      lastRefusal = "recovery.envelope_too_large";
      return Object.freeze({
        outcome: "refused",
        adapter: selectedKind,
        revision: input.revision,
        currentRevisionAtCompletion: currentRevision,
        reasonCode: "recovery.envelope_too_large",
        rotatedPreviousRevision: null,
      });
    }
    const currentKey = recoveryStorageKey(input.documentId, "current");
    const previousKey = recoveryStorageKey(input.documentId, "previous");
    let priorRevision: number | null = null;
    const priorText = await selected.read(currentKey).catch(() => null);
    if (priorText !== null) {
      const prior = await decodeRecoveryEnvelope(priorText);
      priorRevision = prior.envelope?.revision ?? null;
    }
    let outcome: "written" | "quota" | "denied";
    try {
      outcome = await selected.writeCurrentWithRotation(
        currentKey,
        previousKey,
        payload,
      );
    } catch {
      outcome = "denied";
    }
    if (outcome !== "written") {
      work.writesRefused += 1;
      const reasonCode: RecoveryRefusalCode =
        outcome === "quota"
          ? "recovery.quota_exceeded"
          : "recovery.write_denied";
      lastRefusal = reasonCode;
      return Object.freeze({
        outcome: "refused",
        adapter: selectedKind,
        revision: input.revision,
        currentRevisionAtCompletion: currentRevision,
        reasonCode,
        rotatedPreviousRevision: null,
      });
    }
    if (input.revision === currentRevision) {
      cleanRevision = input.revision;
      if (pendingRevision === input.revision) pendingRevision = null;
      work.writesCompleted += 1;
      lastRefusal = null;
      return Object.freeze({
        outcome: "written",
        adapter: selectedKind,
        revision: input.revision,
        currentRevisionAtCompletion: currentRevision,
        reasonCode: null,
        rotatedPreviousRevision: priorRevision,
      });
    }
    work.writesSuperseded += 1;
    return Object.freeze({
      outcome: "superseded",
      adapter: selectedKind,
      revision: input.revision,
      currentRevisionAtCompletion: currentRevision,
      reasonCode: "recovery.stale_completion",
      rotatedPreviousRevision: priorRevision,
    });
  }

  function queuedNow(): RecoveryMutationInput | null {
    return queue.input;
  }

  async function runQueuedWrite(): Promise<RecoveryWriteReceipt | null> {
    if (writeInFlight) return null;
    const input = queuedNow();
    if (input === null) return null;
    queue.input = null;
    clearTimers();
    writeInFlight = true;
    try {
      await ensureProbed();
      return await performWrite(input);
    } finally {
      writeInFlight = false;
      if (queuedNow() !== null) scheduleTimers();
    }
  }

  function scheduleTimers(): void {
    if (idleHandle !== null) platform.clock.clearTimeout(idleHandle);
    idleHandle = platform.clock.setTimeout(() => {
      idleHandle = null;
      void runQueuedWrite();
    }, RECOVERY_IDLE_DELAY_MS);
    if (maxDelayHandle === null) {
      maxDelayHandle = platform.clock.setTimeout(() => {
        maxDelayHandle = null;
        void runQueuedWrite();
      }, RECOVERY_MAX_DELAY_MS);
    }
  }

  function noteMutation(input: RecoveryMutationInput): void {
    boundDocumentId = input.documentId;
    currentRevision = input.revision;
    pendingRevision = input.revision;
    if (queue.input === null) work.writesScheduled += 1;
    queue.input = input;
    if (!writeInFlight) scheduleTimers();
  }

  async function flushRecoveryWrites(
    trigger: "visibility-change",
  ): Promise<RecoveryWriteReceipt | null> {
    void trigger;
    return await runQueuedWrite();
  }

  function exportBindingValid(binding: RecoveryExportBinding): boolean {
    const raw: Readonly<Record<string, unknown>> = { ...binding };
    const documentId = raw["documentId"];
    const exportedAt = raw["exportedAt"];
    const semanticHash = raw["semanticDocumentHash"];
    const artifactSha = raw["artifactSha256"];
    return (
      raw["schema"] === RECOVERY_EXPORT_BINDING_SCHEMA &&
      typeof documentId === "string" &&
      documentId.length > 0 &&
      isNonnegativeSafeInteger(raw["exportRevision"]) &&
      typeof exportedAt === "string" &&
      exportedAt.length > 0 &&
      typeof semanticHash === "string" &&
      SHA256_HEX.test(semanticHash) &&
      isPositiveSafeInteger(raw["artifactByteLength"]) &&
      typeof artifactSha === "string" &&
      SHA256_HEX.test(artifactSha)
    );
  }

  async function recordExportBinding(
    binding: RecoveryExportBinding,
    revisionAtRecord: number,
  ): Promise<
    | Readonly<{ outcome: "recorded" }>
    | Readonly<{ outcome: "refused"; reasonCode: RecoveryRefusalCode }>
  > {
    await ensureProbed();
    if (!exportBindingValid(binding)) {
      work.exportBindingsRefused += 1;
      return Object.freeze({
        outcome: "refused",
        reasonCode: "recovery.export_binding_invalid",
      });
    }
    if (boundDocumentId !== null && binding.documentId !== boundDocumentId) {
      work.exportBindingsRefused += 1;
      return Object.freeze({
        outcome: "refused",
        reasonCode: "recovery.document_id_mismatch",
      });
    }
    if (binding.exportRevision !== revisionAtRecord) {
      work.exportBindingsRefused += 1;
      return Object.freeze({
        outcome: "refused",
        reasonCode: "recovery.export_marker_stale",
      });
    }
    if (selected === null) {
      work.exportBindingsRefused += 1;
      return Object.freeze({
        outcome: "refused",
        reasonCode: "recovery.write_denied",
      });
    }
    exportBinding = binding;
    work.exportBindingsRecorded += 1;
    return Object.freeze({ outcome: "recorded" });
  }

  async function discardRecovery(documentId: DocumentId): Promise<void> {
    await ensureProbed();
    /* A discard supersedes any write scheduled before it: without this, a
     * snapshot queued moments earlier fires after the user chose Discard
     * and resurrects the envelope on the next load (caught 2026-09-03 by
     * the A1 keep/discard browser matrix on Firefox and WebKit, where the
     * boot write was still pending when Discard ran). Future mutations
     * reschedule normally. */
    if (queue.input !== null && queue.input.documentId === documentId) {
      queue.input = null;
      clearTimers();
      pendingRevision = null;
    }
    if (selected === null) return;
    await selected.remove(recoveryStorageKey(documentId, "current"));
    await selected.remove(recoveryStorageKey(documentId, "previous"));
  }

  function inspectRecovery(): RecoverySnapshot {
    return Object.freeze({
      schema: "changes.persistence.recovery-snapshot.v1",
      policyId: RECOVERY_POLICY_ID,
      policyVersion: RECOVERY_POLICY_VERSION,
      adapter: selectedKind,
      documentId: boundDocumentId,
      pendingRevision,
      cleanRevision,
      lastRefusal,
      exportBinding,
      work: Object.freeze({ ...work }),
    });
  }

  return Object.freeze({
    probeRecoveryCapability: probe,
    readRecoveryCandidates,
    noteMutation,
    flushRecoveryWrites,
    recordExportBinding,
    discardRecovery,
    inspectRecovery,
  });
}
