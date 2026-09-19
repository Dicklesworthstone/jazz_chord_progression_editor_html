/**
 * E0 v2 port-return normalization (accepted amendment
 * docs/E0_V2_INTERCHANGE_CONTRACT.md section 3; production build
 * jcpe-milestone-reliable-studio-l3a.8.2 stage 3).
 *
 * Every fallible owner port returns `unknown`. These normalizers validate
 * the raw value with RECURSIVELY EXACT KEYS against the owner's exact
 * result types — extra keys, missing keys, wrong primitive kinds, and any
 * smuggled `state`-like field are all `invalid-envelope`. A normalizer
 * never throws and never retains the raw value inside its diagnostic.
 * Synchronous throws and promise rejections are caught at the DRIVER call
 * site and mapped to the `threw-or-rejected` reason; discard is the
 * deliberate unwrapped exception and has no normalizer by law.
 */
import { APPLICATION_EFFECT_KINDS, APPLICATION_REPLACEMENT_ORIGINS } from "./application-state-contract";
import {
  IMPORT_REPLACEMENT_PREPARATION_REFUSAL_CODES,
  IMPORT_REPLACEMENT_PUBLICATION_REFUSAL_CODES,
  IMPORT_SOURCE_FORMATS,
  PREPARED_IMPORT_REPLACEMENT_PUBLICATION_SCHEMA,
  type ApplicationDocumentIdentity,
  type PrepareImportReplacementPublicationResult,
  type PublishCanonicalExportRevisionResult,
  type PublishImportReplacementResult,
} from "./application-interchange-owner-contract";
import type {
  E0V2NormalizedPortName,
  E0V2PortProtocolDiagnostic,
} from "./e0-interchange-v2-contract";

export type E0V2Normalized<T> =
  | Readonly<{ outcome: "normalized"; value: T }>
  | Readonly<{ outcome: "protocol-invalid"; diagnostic: E0V2PortProtocolDiagnostic }>;

function invalid<T>(port: E0V2NormalizedPortName): E0V2Normalized<T> {
  return Object.freeze({
    outcome: "protocol-invalid" as const,
    diagnostic: Object.freeze({
      port,
      reason: "invalid-envelope" as const,
      rawResultRetained: false as const,
    }),
  });
}

/** The driver's throw/rejection mapping shares the diagnostic shape. */
export function threwOrRejected(
  port: E0V2NormalizedPortName,
): E0V2PortProtocolDiagnostic {
  return Object.freeze({
    port,
    reason: "threw-or-rejected" as const,
    rawResultRetained: false as const,
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (!Object.isFrozen(value)) return false;
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    return typeof key === "string" && descriptor !== undefined &&
      Object.hasOwn(descriptor, "value") && descriptor.enumerable === true;
  });
}

function hasExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const present = Reflect.ownKeys(record);
  if (present.length !== keys.length) return false;
  return keys.every((key) => Object.hasOwn(record, key));
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
  );
}

function isIdentity(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["requestId", "documentId", "baseRevision"]) &&
    isNonNegativeSafeInteger(value["requestId"]) &&
    typeof value["documentId"] === "string" &&
    isNonNegativeSafeInteger(value["baseRevision"])
  );
}

function isCommittingTransition(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "kind",
      "requestId",
      "origin",
      "baseRevision",
      "candidateDocumentId",
      "undoDisposition",
    ]) &&
    value["kind"] === "committing" &&
    isNonNegativeSafeInteger(value["requestId"]) &&
    APPLICATION_REPLACEMENT_ORIGINS.some(
      (origin) => origin === value["origin"],
    ) &&
    isNonNegativeSafeInteger(value["baseRevision"]) &&
    typeof value["candidateDocumentId"] === "string" &&
    (value["undoDisposition"] === "retained" ||
      value["undoDisposition"] === "explicitly-unavailable")
  );
}

const COUNTER_KEYS = Object.freeze([
  "sectionsVisited",
  "measuresVisited",
  "eventsVisited",
  "stableIdsIndexed",
  "historyEntriesVisited",
  "historyBytesEstimated",
  "bookmarksRepaired",
  "requestsCompared",
  "transportNotificationsCompared",
  "validationCalls",
] as const);

function isWorkCounters(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, COUNTER_KEYS) &&
    COUNTER_KEYS.every((key) => isNonNegativeSafeInteger(value[key]))
  );
}

function isEffect(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["kind", "revision", "requestId", "reasonCode"]) &&
    APPLICATION_EFFECT_KINDS.some((kind) => kind === value["kind"]) &&
    isNonNegativeSafeInteger(value["revision"]) &&
    (value["requestId"] === null ||
      isNonNegativeSafeInteger(value["requestId"])) &&
    typeof value["reasonCode"] === "string"
  );
}

/** Every effect must be an own occurrence; Array.every skips missing entries
 * and also accepts values inherited from a modified array prototype. */
function isEffects(value: unknown): boolean {
  if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype || !Object.isFrozen(value)) return false;
  if (Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !Object.hasOwn(descriptor, "value") ||
      descriptor.enumerable !== true || !isEffect(value[index])) return false;
  }
  return true;
}

function isPreparationEnvelope(
  raw: unknown,
): raw is PrepareImportReplacementPublicationResult {
  if (!isRecord(raw)) return false;
  if (raw["ok"] === true) {
    if (!hasExactKeys(raw, ["ok", "value"])) return false;
    const value = raw["value"];
    if (
      !isRecord(value) ||
      !hasExactKeys(value, [
        "schema",
        "identity",
        "sourceFormat",
        "candidateDocumentId",
        "expectedTransportGeneration",
        "committingTransition",
      ]) ||
      value["schema"] !== PREPARED_IMPORT_REPLACEMENT_PUBLICATION_SCHEMA ||
      !isIdentity(value["identity"]) ||
      !IMPORT_SOURCE_FORMATS.some(
        (format) => format === value["sourceFormat"],
      ) ||
      typeof value["candidateDocumentId"] !== "string" ||
      !isNonNegativeSafeInteger(value["expectedTransportGeneration"]) ||
      !isCommittingTransition(value["committingTransition"])
    ) {
      return false;
    }
    return true;
  }
  if (raw["ok"] === false) {
    if (
      !hasExactKeys(raw, ["ok", "code"]) ||
      !IMPORT_REPLACEMENT_PREPARATION_REFUSAL_CODES.some(
        (code) => code === raw["code"],
      )
    ) {
      return false;
    }
    return true;
  }
  return false;
}

function isPublicationEnvelope(
  raw: unknown,
): raw is PublishImportReplacementResult {
  if (!isRecord(raw)) return false;
  if (raw["ok"] === true) {
    if (
      !hasExactKeys(raw, [
        "ok",
        "outcome",
        "identity",
        "documentId",
        "revision",
        "effects",
        "counters",
        "liveForRequest",
      ]) ||
      raw["outcome"] !== "committed" ||
      !isIdentity(raw["identity"]) ||
      typeof raw["documentId"] !== "string" ||
      !isNonNegativeSafeInteger(raw["revision"]) ||
      !isEffects(raw["effects"]) ||
      !isWorkCounters(raw["counters"]) ||
      raw["liveForRequest"] !== 0
    ) {
      return false;
    }
    return true;
  }
  if (raw["ok"] === false) {
    if (
      !hasExactKeys(raw, [
        "ok",
        "outcome",
        "code",
        "identity",
        "observedDocumentId",
        "observedRevision",
        "liveForRequest",
      ]) ||
      raw["outcome"] !== "refused" ||
      !IMPORT_REPLACEMENT_PUBLICATION_REFUSAL_CODES.some(
        (code) => code === raw["code"],
      ) ||
      !isIdentity(raw["identity"]) ||
      typeof raw["observedDocumentId"] !== "string" ||
      !isNonNegativeSafeInteger(raw["observedRevision"]) ||
      raw["liveForRequest"] !== 0
    ) {
      return false;
    }
    return true;
  }
  return false;
}

function isIdentityEnvelope(
  raw: unknown,
): raw is ApplicationDocumentIdentity {
  if (
    !isRecord(raw) ||
    !hasExactKeys(raw, ["documentId", "revision"]) ||
    typeof raw["documentId"] !== "string" ||
    !isNonNegativeSafeInteger(raw["revision"])
  ) {
    return false;
  }
  return true;
}

function isMarkerEnvelope(
  raw: unknown,
): raw is PublishCanonicalExportRevisionResult {
  if (!isRecord(raw)) return false;
  if (raw["ok"] === true) {
    if (
      !hasExactKeys(raw, ["ok", "outcome", "documentId", "revision"]) ||
      raw["outcome"] !== "published" ||
      typeof raw["documentId"] !== "string" ||
      !isNonNegativeSafeInteger(raw["revision"])
    ) {
      return false;
    }
    return true;
  }
  if (raw["ok"] === false) {
    if (
      !hasExactKeys(raw, [
        "ok",
        "outcome",
        "code",
        "observedDocumentId",
        "observedRevision",
      ]) ||
      raw["outcome"] !== "refused" ||
      (raw["code"] !== "export.marker_publication_stale" &&
        raw["code"] !== "export.marker_publication_failed") ||
      typeof raw["observedDocumentId"] !== "string" ||
      !isNonNegativeSafeInteger(raw["observedRevision"])
    ) {
      return false;
    }
    return true;
  }
  return false;
}


/** Port invocation errors are handled by the driver. Hostile return values
 * instead fail normalization, without retaining or exposing their payload. */
function normalizeSafely<T>(
  port: E0V2NormalizedPortName,
  raw: unknown,
  accepts: (value: unknown) => value is T,
): E0V2Normalized<T> {
  try {
    if (!accepts(raw)) return invalid(port);
    return Object.freeze({ outcome: "normalized" as const, value: raw });
  } catch {
    return invalid(port);
  }
}

export function normalizePreparationResult(raw: unknown): E0V2Normalized<PrepareImportReplacementPublicationResult> {
  return normalizeSafely("prepareImportReplacementPublication", raw, isPreparationEnvelope);
}

export function normalizePublicationResult(raw: unknown): E0V2Normalized<PublishImportReplacementResult> {
  return normalizeSafely("publishImportReplacement", raw, isPublicationEnvelope);
}

export function normalizeIdentityResult(raw: unknown): E0V2Normalized<ApplicationDocumentIdentity> {
  return normalizeSafely("readCurrentApplicationDocumentIdentity", raw, isIdentityEnvelope);
}

export function normalizeMarkerResult(raw: unknown): E0V2Normalized<PublishCanonicalExportRevisionResult> {
  return normalizeSafely("publishCanonicalExportRevision", raw, isMarkerEnvelope);
}
