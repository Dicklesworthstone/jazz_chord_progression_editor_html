import type { DocumentId } from "../domain";

/**
 * A1 recovery persistence and document lifecycle contract.
 *
 * Browser persistence is Recovery, never Save: canonical JSON export is the
 * explicit portable save action, and every user-facing word here keeps that
 * distinction. The persistence layer imports only `domain`; envelopes carry
 * the plain document candidate shape and are re-decoded through the F2/F3
 * gates at startup, so no ValidatedDocument brand is ever persisted or
 * manufactured here.
 */

export const RECOVERY_CONTRACT_SCHEMA =
  "changes.persistence.recovery-contract.v1";
export const RECOVERY_ENVELOPE_SCHEMA = "changes.recovery.v1";
export const RECOVERY_EXPORT_BINDING_SCHEMA =
  "changes.recovery-export-binding.v1";
export const RECOVERY_POLICY_ID = "changes.recovery-persistence";
export const RECOVERY_POLICY_VERSION = 1;
export const RECOVERY_CHECKSUM_ALGORITHM =
  "sha256-of-sorted-key-json-without-checksum-v1";

export const RECOVERY_OPERATION_NAMES = Object.freeze([
  "probeRecoveryCapability",
  "readRecoveryCandidates",
  "scheduleRecoveryWrite",
  "flushRecoveryWrites",
  "recordExportBinding",
  "discardRecovery",
  "inspectRecovery",
] as const);

export type RecoveryOperationName =
  (typeof RECOVERY_OPERATION_NAMES)[number];

/**
 * Adapter selection. IndexedDB is primary; the bounded localStorage
 * fallback engages only after a failed capability probe. When neither is
 * usable, editing continues and the status vocabulary points to Export.
 */
export const RECOVERY_ADAPTER_KINDS = Object.freeze([
  "indexeddb",
  "localstorage",
  "none",
] as const);

export type RecoveryAdapterKind = (typeof RECOVERY_ADAPTER_KINDS)[number];

export const RECOVERY_SLOTS = Object.freeze(["current", "previous"] as const);

export type RecoverySlot = (typeof RECOVERY_SLOTS)[number];

/**
 * Timing policy (REBUILD_PLAN 15.2). A mutation marks recovery pending
 * immediately; a write is queued after 400 ms of inactivity with a
 * two-second maximum delay during continuous editing; visibility change
 * requests one final best-effort write. Correctness never depends on
 * asynchronous work completing during unload.
 */
export const RECOVERY_IDLE_DELAY_MS = 400;
export const RECOVERY_MAX_DELAY_MS = 2000;

/** Envelope byte ceilings per adapter; exceeding one refuses, never truncates. */
export const MAX_RECOVERY_ENVELOPE_BYTES_INDEXEDDB = 8_000_000;
export const MAX_RECOVERY_ENVELOPE_BYTES_LOCALSTORAGE = 1_000_000;
export const MAX_RECOVERY_KEY_LENGTH = 256;
export const MAX_RECOVERY_REASON_CODE_LENGTH = 64;
export const MAX_RECOVERY_PENDING_WRITES = 1;

/**
 * Storage keys embed the envelope schema and exact document ID; user text
 * is never a key component.
 */
export const RECOVERY_KEY_PREFIX = "changes.recovery.v1:";

export function recoveryStorageKey(
  documentId: DocumentId,
  slot: RecoverySlot,
): string {
  return `${RECOVERY_KEY_PREFIX}${documentId}:${slot}`;
}

export const RECOVERY_REFUSAL_CODES = Object.freeze([
  "recovery.unavailable",
  "recovery.probe_failed",
  "recovery.quota_exceeded",
  "recovery.write_denied",
  "recovery.envelope_too_large",
  "recovery.corrupt_envelope",
  "recovery.checksum_mismatch",
  "recovery.schema_unknown",
  "recovery.revision_invalid",
  "recovery.stale_completion",
  "recovery.export_marker_stale",
  "recovery.export_binding_invalid",
  "recovery.document_id_mismatch",
  "recovery.disposed",
] as const);

export type RecoveryRefusalCode = (typeof RECOVERY_REFUSAL_CODES)[number];

/**
 * Startup dispositions (REBUILD_PLAN 15.3). Startup renders the blank
 * workspace immediately, probes recovery, then follows exactly one row of
 * the reviewed startup matrix. Recovery never initializes audio and never
 * silently overwrites an already edited in-memory document.
 */
export const RECOVERY_STARTUP_DISPOSITIONS = Object.freeze([
  "open-current-automatically",
  "offer-keep-discard",
  "offer-previous",
  "report-unrecoverable",
  "none-available",
] as const);

export type RecoveryStartupDisposition =
  (typeof RECOVERY_STARTUP_DISPOSITIONS)[number];

/**
 * Exact user-facing status vocabulary (REBUILD_PLAN 15.1). `{time}` is a
 * locale-rendered wall-clock time and `{revision}` a decimal revision;
 * no other substitutions exist. Browser recovery is never called Save.
 */
export const RECOVERY_STATUS_VOCABULARY = Object.freeze({
  recoveredLocally: "Recovered locally at {time}",
  changesPending: "Changes pending recovery",
  unavailable: "Recovery unavailable — export recommended",
  exportedAtRevision: "Exported at revision {revision}",
  changedSinceExport: "Changed since export",
} as const);

/**
 * The persisted envelope (REBUILD_PLAN 15.2). `document` is the plain
 * document candidate (the F2 decoder input shape), never a branded
 * validated document. The checksum is SHA-256 hex over the canonical
 * sorted-key JSON of the envelope without its `checksum` field; it detects
 * truncation and accidental corruption and is not a security signature.
 */
export type RecoveryEnvelope = Readonly<{
  schema: typeof RECOVERY_ENVELOPE_SCHEMA;
  savedAt: string;
  revision: number;
  lastExport?: Readonly<{
    revision: number;
    exportedAt: string;
    semanticDocumentHash: string;
  }>;
  document: unknown;
  checksum: string;
}>;

/**
 * The complete export binding A1 stores separately on exact export
 * success (REBUILD_PLAN 15.2). `RecoveryEnvelope.lastExport` is only this
 * record's derived display subset. Only exact A1 success establishes
 * cross-reload marker durability; cancellation or failure never advances
 * the marker.
 */
export type RecoveryExportBinding = Readonly<{
  schema: typeof RECOVERY_EXPORT_BINDING_SCHEMA;
  documentId: DocumentId;
  exportRevision: number;
  exportedAt: string;
  semanticDocumentHash: string;
  artifactByteLength: number;
  artifactSha256: string;
}>;

export type RecoveryCapabilityProbe = Readonly<{
  adapter: RecoveryAdapterKind;
  usable: boolean;
  reasonCode: RecoveryRefusalCode | null;
}>;

export type RecoveryCandidate = Readonly<{
  slot: RecoverySlot;
  outcome: "valid" | "corrupt" | "absent";
  reasonCode: RecoveryRefusalCode | null;
  envelope: RecoveryEnvelope | null;
}>;

export type RecoveryStartupReport = Readonly<{
  adapter: RecoveryAdapterKind;
  disposition: RecoveryStartupDisposition;
  current: RecoveryCandidate;
  previous: RecoveryCandidate;
  conflictsWithExportMarker: boolean;
}>;

/**
 * Write lifecycle. A scheduled write serializes a snapshot bound to its
 * triggering revision at queue time. A completion may mark recovery clean
 * only while its revision is still current; an older completion can never
 * mark or overwrite newer state. Denied storage, quota, or corruption
 * leaves editing untouched with an actionable status.
 */
export type RecoveryWriteRequest = Readonly<{
  documentId: DocumentId;
  revision: number;
  trigger: "mutation-idle" | "mutation-max-delay" | "visibility-change";
  envelope: RecoveryEnvelope;
}>;

export type RecoveryWriteReceipt = Readonly<{
  outcome: "written" | "superseded" | "refused";
  adapter: RecoveryAdapterKind;
  revision: number;
  currentRevisionAtCompletion: number;
  reasonCode: RecoveryRefusalCode | null;
  rotatedPreviousRevision: number | null;
}>;

export type RecoverySnapshot = Readonly<{
  schema: "changes.persistence.recovery-snapshot.v1";
  policyId: typeof RECOVERY_POLICY_ID;
  policyVersion: typeof RECOVERY_POLICY_VERSION;
  adapter: RecoveryAdapterKind;
  documentId: DocumentId | null;
  pendingRevision: number | null;
  cleanRevision: number | null;
  lastRefusal: RecoveryRefusalCode | null;
  exportBinding: RecoveryExportBinding | null;
  work: RecoveryWorkCounters;
}>;

export const RECOVERY_WORK_COUNTER_NAMES = Object.freeze([
  "probesRun",
  "writesScheduled",
  "writesCompleted",
  "writesSuperseded",
  "writesRefused",
  "envelopesDecoded",
  "envelopesRejected",
  "exportBindingsRecorded",
  "exportBindingsRefused",
  "startupReportsProduced",
] as const);

export type RecoveryWorkCounterName =
  (typeof RECOVERY_WORK_COUNTER_NAMES)[number];

export type RecoveryWorkCounters = Readonly<
  Record<RecoveryWorkCounterName, number>
>;

/**
 * Injected adapter port. Adapters are dumb bounded byte stores: writing
 * `current` atomically demotes the prior current envelope to `previous`
 * within the same adapter; a failed write must leave both slots unchanged.
 * The service owns scheduling, checksums, rotation policy, and status —
 * an adapter never decides recovery semantics.
 */
export type RecoveryAdapterPort = Readonly<{
  kind: Exclude<RecoveryAdapterKind, "none">;
  probe: () => Promise<RecoveryCapabilityProbe>;
  read: (key: string) => Promise<string | null>;
  writeCurrentWithRotation: (
    currentKey: string,
    previousKey: string,
    payload: string,
  ) => Promise<"written" | "quota" | "denied">;
  remove: (key: string) => Promise<void>;
}>;

export type RecoveryClockPort = Readonly<{
  /** Monotonic milliseconds for idle/max-delay scheduling. */
  nowMs: () => number;
  /** Wall-clock ISO timestamp recorded in envelopes. */
  nowIso: () => string;
  setTimeout: (callback: () => void, delayMs: number) => number;
  clearTimeout: (handle: number) => void;
}>;

export type RecoveryPlatformPort = Readonly<{
  adapters: readonly RecoveryAdapterPort[];
  clock: RecoveryClockPort;
}>;
