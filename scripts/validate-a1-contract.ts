/**
 * Independent A1 recovery-contract validator.
 *
 * Validates the reviewed fixture authority under `tests/fixtures/recovery/`
 * against an internal restatement of docs/A1_RECOVERY_CONTRACT.md. It
 * imports no production persistence code (none exists) and never imports
 * `src/`; the checksum goldens are recomputed here with an independent
 * canonical-JSON serializer.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type JsonRecord = Record<string, unknown>;

export type A1Finding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type A1ValidationReport = Readonly<{
  schema: "changes.validation.a1-recovery-contract.v1";
  outcome: "pass" | "fail";
  fixtureFiles: number;
  envelopeCases: number;
  schedulerCases: number;
  adapterCases: number;
  startupCases: number;
  exportCases: number;
  traces: number;
  authorities: number;
  mutationControls: number;
  findings: readonly A1Finding[];
}>;

const ROOT = resolve(import.meta.dirname, "..");
const FIXTURE_DIR = resolve(ROOT, "tests/fixtures/recovery");

export const A1_FIXTURE_FILES = Object.freeze([
  "a1-recovery-contract.json",
  "envelope-cases.json",
  "scheduler-cases.json",
  "adapter-cases.json",
  "startup-cases.json",
  "export-marker-cases.json",
  "mutation-controls.json",
  "trace-ledger.json",
  "provenance-ledger.json",
] as const);

const ADAPTER_KINDS = Object.freeze(["indexeddb", "localstorage", "none"]);
const SLOTS = Object.freeze(["current", "previous"]);
const OPERATIONS = Object.freeze([
  "probeRecoveryCapability",
  "readRecoveryCandidates",
  "scheduleRecoveryWrite",
  "flushRecoveryWrites",
  "recordExportBinding",
  "discardRecovery",
  "inspectRecovery",
]);
const REFUSAL_CODES = Object.freeze([
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
]);
const DISPOSITIONS = Object.freeze([
  "open-current-automatically",
  "offer-keep-discard",
  "offer-previous",
  "report-unrecoverable",
  "none-available",
]);
const VOCABULARY = Object.freeze({
  recoveredLocally: "Recovered locally at {time}",
  changesPending: "Changes pending recovery",
  unavailable: "Recovery unavailable — export recommended",
  exportedAtRevision: "Exported at revision {revision}",
  changedSinceExport: "Changed since export",
});
const WORK_COUNTERS = Object.freeze([
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
]);
const LIMITS = Object.freeze({
  idleDelayMs: 400,
  maxDelayMs: 2000,
  envelopeBytesIndexeddb: 8_000_000,
  envelopeBytesLocalstorage: 1_000_000,
  maxKeyLength: 256,
  maxReasonCodeLength: 64,
  maxPendingWrites: 1,
  retainedSlots: 2,
});
const KEY_PREFIX = "changes.recovery.v1:";
const CHECKSUM_ALGORITHM = "sha256-of-sorted-key-json-without-checksum-v1";
const REQUIRED_TRACE_IDS = Object.freeze([
  "TR-A1-ENVELOPE",
  "TR-A1-CHECKSUM",
  "TR-A1-SCHEDULER",
  "TR-A1-REVISION-SAFETY",
  "TR-A1-ADAPTERS",
  "TR-A1-DEGRADED",
  "TR-A1-STARTUP",
  "TR-A1-EXPORT-BINDING",
  "TR-A1-VOCABULARY",
  "TR-A1-BROWSER-RELOAD",
  "TR-LEGACY-DATA-LOSS",
]);
const REQUIRED_AUTHORITY_IDS = Object.freeze([
  "AUTH-PLAN-A1",
  "AUTH-A0-CONTRACT",
  "AUTH-F2-F3-GATES",
  "AUTH-WEB-STORAGE",
  "AUTH-LEGACY-AUDIT",
  "AUTH-A1-DECISIONS",
  "AUTH-CHECKSUM-GOLDENS",
]);
const FINDING_CODES = Object.freeze([
  "A1_SCHEMA",
  "A1_MANIFEST_COMPANION",
  "A1_STATES",
  "A1_VOCABULARY",
  "A1_LIMITS",
  "A1_ENVELOPE_CASES",
  "A1_CHECKSUM_GOLDEN",
  "A1_SCHEDULER_CASES",
  "A1_ADAPTER_CASES",
  "A1_STARTUP_CASES",
  "A1_EXPORT_CASES",
  "A1_TRACE",
  "A1_PROVENANCE",
  "A1_MUTATION_CONTROLS",
]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): readonly JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Independent canonical JSON: sorted keys at every depth, no whitespace. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    const body = keys
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",");
    return `{${body}}`;
  }
  const encoded = JSON.stringify(value) as string | undefined;
  return encoded === undefined ? "null" : encoded;
}

function envelopeChecksum(envelope: JsonRecord): string {
  const clone: JsonRecord = {};
  for (const [key, value] of Object.entries(envelope)) {
    if (key !== "checksum") clone[key] = value;
  }
  return createHash("sha256")
    .update(Buffer.from(canonicalJson(clone), "utf8"))
    .digest("hex");
}

class Findings {
  readonly items: A1Finding[] = [];
  add(code: string, path: string, message: string): void {
    this.items.push(Object.freeze({ code, path, message }));
  }
  equal(actual: unknown, expected: unknown, code: string, path: string): void {
    const same =
      typeof expected === "object"
        ? JSON.stringify(actual) === JSON.stringify(expected)
        : Object.is(actual, expected);
    if (!same) {
      this.add(
        code,
        path,
        `expected ${JSON.stringify(expected)} but found ${JSON.stringify(actual)}`,
      );
    }
  }
}

async function loadFixture(
  name: string,
  overlay: Readonly<Record<string, unknown>> | undefined,
): Promise<{ value: unknown; bytes: Uint8Array }> {
  const raw = await readFile(resolve(FIXTURE_DIR, name));
  const overlayValue = overlay?.[name];
  return {
    value:
      overlayValue === undefined
        ? JSON.parse(raw.toString("utf8"))
        : overlayValue,
    bytes: raw,
  };
}

function resolvePointer(document: unknown, pointer: string): unknown {
  if (pointer === "" || !pointer.startsWith("/")) return undefined;
  let current: unknown = document;
  for (const rawToken of pointer.slice(1).split("/")) {
    const token = rawToken.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
    } else if (isRecord(current)) {
      if (!Object.hasOwn(current, token)) return undefined;
      current = current[token];
    } else {
      return undefined;
    }
  }
  return current;
}

export function applyMutation(
  document: unknown,
  pointer: string,
  value: unknown,
): unknown {
  const clone = structuredClone(document);
  const tokens = pointer
    .slice(1)
    .split("/")
    .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
  let current: unknown = clone;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index] ?? "";
    current = Array.isArray(current)
      ? current[Number(token)]
      : isRecord(current)
        ? current[token]
        : undefined;
  }
  const last = tokens[tokens.length - 1] ?? "";
  if (Array.isArray(current)) {
    current[Number(last)] = value;
  } else if (isRecord(current)) {
    current[last] = value;
  }
  return clone;
}

function requireCase(
  cases: readonly JsonRecord[],
  id: string,
  findings: Findings,
  code: string,
): JsonRecord {
  const found = cases.find((row) => row["caseId"] === id);
  if (found === undefined) {
    findings.add(code, id, `Missing required case ${id}.`);
    return {};
  }
  return found;
}

function expected(row: JsonRecord): JsonRecord {
  return isRecord(row["expected"]) ? row["expected"] : {};
}

export async function validateA1Contract(
  overlay?: Readonly<Record<string, unknown>>,
): Promise<A1ValidationReport> {
  const findings = new Findings();
  const loaded = new Map<string, { value: unknown; bytes: Uint8Array }>();
  for (const name of A1_FIXTURE_FILES) {
    loaded.set(name, await loadFixture(name, overlay));
  }
  const manifest = loaded.get("a1-recovery-contract.json")?.value;
  const envelope = loaded.get("envelope-cases.json")?.value;
  const scheduler = loaded.get("scheduler-cases.json")?.value;
  const adapter = loaded.get("adapter-cases.json")?.value;
  const startup = loaded.get("startup-cases.json")?.value;
  const exportMarker = loaded.get("export-marker-cases.json")?.value;
  const mutations = loaded.get("mutation-controls.json")?.value;
  const trace = loaded.get("trace-ledger.json")?.value;
  const provenance = loaded.get("provenance-ledger.json")?.value;
  if (
    !isRecord(manifest) || !isRecord(envelope) || !isRecord(scheduler) ||
    !isRecord(adapter) || !isRecord(startup) || !isRecord(exportMarker) ||
    !isRecord(mutations) || !isRecord(trace) || !isRecord(provenance)
  ) {
    findings.add("A1_SCHEMA", "/", "One or more fixture documents is not an object.");
    return report(findings, 0, 0, 0, 0, 0, 0, 0, 0);
  }

  validateManifest(manifest, loaded, findings);
  const envelopeCount = validateEnvelope(envelope, findings);
  const schedulerCount = validateScheduler(scheduler, findings);
  const adapterCount = validateAdapter(adapter, findings);
  const startupCount = validateStartup(startup, findings);
  const exportCount = validateExport(exportMarker, findings);
  const universe = new Set<string>();
  const families: readonly [string, number][] = [
    ["A1-ENV", envelopeCount],
    ["A1-SCHED", schedulerCount],
    ["A1-ADAPT", adapterCount],
    ["A1-START", startupCount],
    ["A1-EXPORT", exportCount],
  ];
  for (const [prefix, count] of families) {
    for (let index = 1; index <= count; index += 1) {
      universe.add(`${prefix}-${String(index).padStart(3, "0")}`);
    }
  }
  const mutationCount = validateMutations(mutations, loaded, findings);
  const traceCount = validateTraces(trace, universe, mutationCount, findings);
  const authorityCount = validateProvenance(provenance, findings);

  return report(
    findings,
    envelopeCount,
    schedulerCount,
    adapterCount,
    startupCount,
    exportCount,
    traceCount,
    authorityCount,
    mutationCount,
  );
}

function report(
  findings: Findings,
  envelopeCases: number,
  schedulerCases: number,
  adapterCases: number,
  startupCases: number,
  exportCases: number,
  traces: number,
  authorities: number,
  mutationControls: number,
): A1ValidationReport {
  return Object.freeze({
    schema: "changes.validation.a1-recovery-contract.v1",
    outcome: findings.items.length === 0 ? "pass" : "fail",
    fixtureFiles: A1_FIXTURE_FILES.length,
    envelopeCases,
    schedulerCases,
    adapterCases,
    startupCases,
    exportCases,
    traces,
    authorities,
    mutationControls,
    findings: Object.freeze([...findings.items]),
  });
}

function validateManifest(
  manifest: JsonRecord,
  loaded: ReadonlyMap<string, { value: unknown; bytes: Uint8Array }>,
  findings: Findings,
): void {
  findings.equal(manifest["schema"], "changes.fixtures.a1-recovery-contract.v1", "A1_SCHEMA", "/schema");
  findings.equal(manifest["contractSchema"], "changes.persistence.recovery-contract.v1", "A1_SCHEMA", "/contractSchema");
  findings.equal(manifest["envelopeSchema"], "changes.recovery.v1", "A1_SCHEMA", "/envelopeSchema");
  findings.equal(manifest["exportBindingSchema"], "changes.recovery-export-binding.v1", "A1_SCHEMA", "/exportBindingSchema");
  findings.equal(manifest["recoveryPolicyId"], "changes.recovery-persistence", "A1_SCHEMA", "/recoveryPolicyId");
  findings.equal(manifest["recoveryPolicyVersion"], 1, "A1_SCHEMA", "/recoveryPolicyVersion");
  findings.equal(manifest["checksumAlgorithm"], CHECKSUM_ALGORITHM, "A1_SCHEMA", "/checksumAlgorithm");
  findings.equal(manifest["keyPrefix"], KEY_PREFIX, "A1_LIMITS", "/keyPrefix");
  findings.equal(manifest["adapterKinds"], [...ADAPTER_KINDS], "A1_STATES", "/adapterKinds");
  findings.equal(manifest["slots"], [...SLOTS], "A1_STATES", "/slots");
  findings.equal(manifest["operationNames"], [...OPERATIONS], "A1_STATES", "/operationNames");
  findings.equal(manifest["refusalCodes"], [...REFUSAL_CODES], "A1_STATES", "/refusalCodes");
  findings.equal(manifest["startupDispositions"], [...DISPOSITIONS], "A1_STATES", "/startupDispositions");
  findings.equal(manifest["workCounterNames"], [...WORK_COUNTERS], "A1_STATES", "/workCounterNames");
  findings.equal(manifest["statusVocabulary"], { ...VOCABULARY }, "A1_VOCABULARY", "/statusVocabulary");
  const vocabulary = isRecord(manifest["statusVocabulary"]) ? manifest["statusVocabulary"] : {};
  for (const [key, value] of Object.entries(vocabulary)) {
    if (typeof value === "string" && /save/iu.test(value)) {
      findings.add("A1_VOCABULARY", `/statusVocabulary/${key}`, "Recovery vocabulary may never call recovery a save.");
    }
  }
  const limits = isRecord(manifest["limits"]) ? manifest["limits"] : {};
  for (const [key, value] of Object.entries(LIMITS)) {
    findings.equal(limits[key], value, "A1_LIMITS", `/limits/${key}`);
  }
  const idle = limits["idleDelayMs"];
  const max = limits["maxDelayMs"];
  if (typeof idle === "number" && typeof max === "number" && !(max > idle)) {
    findings.add("A1_LIMITS", "/limits/maxDelayMs", "The maximum delay must exceed the idle delay.");
  }
  const companions = records(manifest["companions"]);
  const expectedCompanions = A1_FIXTURE_FILES.filter(
    (name) => name !== "a1-recovery-contract.json",
  );
  findings.equal(
    companions.map((companion) => companion["path"]),
    [...expectedCompanions],
    "A1_MANIFEST_COMPANION",
    "/companions",
  );
  for (const [index, companion] of companions.entries()) {
    const name = asString(companion["path"]);
    const bytes = loaded.get(name)?.bytes;
    if (bytes === undefined) continue;
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (companion["sha256"] !== digest) {
      findings.add("A1_MANIFEST_COMPANION", `/companions/${String(index)}/sha256`, `Companion digest mismatch for ${name}.`);
    }
    if (companion["bytes"] !== bytes.byteLength) {
      findings.add("A1_MANIFEST_COMPANION", `/companions/${String(index)}/bytes`, `Companion byte count mismatch for ${name}.`);
    }
  }
}

function validateEnvelope(envelope: JsonRecord, findings: Findings): number {
  findings.equal(envelope["schema"], "changes.fixtures.a1-envelope.v1", "A1_SCHEMA", "envelope/schema");
  findings.equal(envelope["checksumAlgorithm"], CHECKSUM_ALGORITHM, "A1_CHECKSUM_GOLDEN", "envelope/checksumAlgorithm");
  const cases = records(envelope["cases"]);
  const code = "A1_ENVELOPE_CASES";
  for (const id of ["A1-ENV-001", "A1-ENV-002"]) {
    const row = requireCase(cases, id, findings, code);
    const payload = isRecord(row["envelope"]) ? row["envelope"] : {};
    const recomputed = envelopeChecksum(payload);
    if (payload["checksum"] !== recomputed) {
      findings.add("A1_CHECKSUM_GOLDEN", `${id}/checksum`, `Golden checksum mismatch: independent recomputation produced ${recomputed}.`);
    }
    findings.equal(expected(row)["outcome"], "valid", code, `${id}/outcome`);
  }
  for (const id of ["A1-ENV-003", "A1-ENV-004"]) {
    const row = requireCase(cases, id, findings, code);
    const payload = isRecord(row["envelope"]) ? row["envelope"] : {};
    const recomputed = envelopeChecksum(payload);
    if (payload["checksum"] === recomputed) {
      findings.add("A1_CHECKSUM_GOLDEN", `${id}/checksum`, "A corruption witness must not carry a matching checksum.");
    }
    findings.equal(expected(row)["reasonCode"], "recovery.checksum_mismatch", code, `${id}/reasonCode`);
  }
  findings.equal(expected(requireCase(cases, "A1-ENV-005", findings, code))["reasonCode"], "recovery.schema_unknown", code, "A1-ENV-005/reasonCode");
  findings.equal(expected(requireCase(cases, "A1-ENV-006", findings, code))["reasonCode"], "recovery.revision_invalid", code, "A1-ENV-006/reasonCode");
  findings.equal(expected(requireCase(cases, "A1-ENV-007", findings, code))["reasonCode"], "recovery.corrupt_envelope", code, "A1-ENV-007/reasonCode");
  findings.equal(expected(requireCase(cases, "A1-ENV-008", findings, code))["reasonCode"], "recovery.corrupt_envelope", code, "A1-ENV-008/reasonCode");
  const bounds = requireCase(cases, "A1-ENV-009", findings, code);
  findings.equal(bounds["adapterBounds"], { indexeddb: LIMITS.envelopeBytesIndexeddb, localstorage: LIMITS.envelopeBytesLocalstorage }, code, "A1-ENV-009/adapterBounds");
  findings.equal(expected(bounds)["reasonCode"], "recovery.envelope_too_large", code, "A1-ENV-009/reasonCode");
  const keys = requireCase(cases, "A1-ENV-010", findings, code);
  const documentId = asString(keys["documentId"]);
  findings.equal(
    keys["expectedKeys"],
    {
      current: `${KEY_PREFIX}${documentId}:current`,
      previous: `${KEY_PREFIX}${documentId}:previous`,
    },
    code,
    "A1-ENV-010/expectedKeys",
  );
  if (cases.length !== 10) {
    findings.add(code, "envelope/cases", `Expected ten envelope cases, found ${String(cases.length)}.`);
  }
  return cases.length;
}

function validateScheduler(scheduler: JsonRecord, findings: Findings): number {
  findings.equal(scheduler["schema"], "changes.fixtures.a1-scheduler.v1", "A1_SCHEMA", "scheduler/schema");
  const code = "A1_SCHEDULER_CASES";
  findings.equal(scheduler["timing"], { idleDelayMs: LIMITS.idleDelayMs, maxDelayMs: LIMITS.maxDelayMs }, code, "scheduler/timing");
  const cases = records(scheduler["cases"]);
  findings.equal(expected(requireCase(cases, "A1-SCHED-001", findings, code))["pendingBeforeAnyTimer"], true, code, "A1-SCHED-001/pendingBeforeAnyTimer");
  const idle = requireCase(cases, "A1-SCHED-002", findings, code);
  findings.equal(expected(idle)["writtenRevision"], 3, code, "A1-SCHED-002/writtenRevision");
  const continuous = requireCase(cases, "A1-SCHED-003", findings, code);
  findings.equal(expected(continuous)["writtenRevision"], 7, code, "A1-SCHED-003/writtenRevision");
  findings.equal(expected(continuous)["maxObservedDelayMs"], LIMITS.maxDelayMs, code, "A1-SCHED-003/maxObservedDelayMs");
  findings.equal(expected(requireCase(cases, "A1-SCHED-004", findings, code))["maxInFlightWrites"], LIMITS.maxPendingWrites, code, "A1-SCHED-004/maxInFlightWrites");
  const stale = expected(requireCase(cases, "A1-SCHED-005", findings, code));
  findings.equal(stale["completionOutcome"], "superseded", code, "A1-SCHED-005/completionOutcome");
  findings.equal(stale["reasonCode"], "recovery.stale_completion", code, "A1-SCHED-005/reasonCode");
  findings.equal(stale["cleanRevisionAfter"], null, code, "A1-SCHED-005/cleanRevisionAfter");
  const visibility = expected(requireCase(cases, "A1-SCHED-006", findings, code));
  findings.equal(visibility["trigger"], "visibility-change", code, "A1-SCHED-006/trigger");
  findings.equal(visibility["unloadGuarantee"], "best-effort-only", code, "A1-SCHED-006/unloadGuarantee");
  const quota = expected(requireCase(cases, "A1-SCHED-007", findings, code));
  findings.equal(quota["reasonCode"], "recovery.quota_exceeded", code, "A1-SCHED-007/reasonCode");
  findings.equal(quota["editingBlocked"], false, code, "A1-SCHED-007/editingBlocked");
  findings.equal(quota["statusVocabulary"], VOCABULARY.unavailable, code, "A1-SCHED-007/statusVocabulary");
  const denied = expected(requireCase(cases, "A1-SCHED-008", findings, code));
  findings.equal(denied["reasonCode"], "recovery.write_denied", code, "A1-SCHED-008/reasonCode");
  findings.equal(denied["slotsChanged"], false, code, "A1-SCHED-008/slotsChanged");
  const rotation = expected(requireCase(cases, "A1-SCHED-009", findings, code));
  findings.equal(rotation["currentRevisionAfter"], 8, code, "A1-SCHED-009/currentRevisionAfter");
  findings.equal(rotation["previousRevisionAfter"], 3, code, "A1-SCHED-009/previousRevisionAfter");
  findings.equal(rotation["rotationAtomic"], true, code, "A1-SCHED-009/rotationAtomic");
  const clean = expected(requireCase(cases, "A1-SCHED-010", findings, code));
  findings.equal(clean["completionOutcome"], "written", code, "A1-SCHED-010/completionOutcome");
  findings.equal(clean["statusVocabulary"], VOCABULARY.recoveredLocally, code, "A1-SCHED-010/statusVocabulary");
  if (cases.length !== 10) {
    findings.add(code, "scheduler/cases", `Expected ten scheduler cases, found ${String(cases.length)}.`);
  }
  return cases.length;
}

function validateAdapter(adapter: JsonRecord, findings: Findings): number {
  findings.equal(adapter["schema"], "changes.fixtures.a1-adapter.v1", "A1_SCHEMA", "adapter/schema");
  const code = "A1_ADAPTER_CASES";
  const cases = records(adapter["cases"]);
  findings.equal(expected(requireCase(cases, "A1-ADAPT-001", findings, code))["selectedAdapter"], "indexeddb", code, "A1-ADAPT-001/selectedAdapter");
  findings.equal(expected(requireCase(cases, "A1-ADAPT-002", findings, code))["selectedAdapter"], "localstorage", code, "A1-ADAPT-002/selectedAdapter");
  const none = expected(requireCase(cases, "A1-ADAPT-003", findings, code));
  findings.equal(none["selectedAdapter"], "none", code, "A1-ADAPT-003/selectedAdapter");
  findings.equal(none["statusVocabulary"], VOCABULARY.unavailable, code, "A1-ADAPT-003/statusVocabulary");
  findings.equal(none["editingBlocked"], false, code, "A1-ADAPT-003/editingBlocked");
  const localBound = requireCase(cases, "A1-ADAPT-004", findings, code);
  findings.equal(localBound["boundBytes"], LIMITS.envelopeBytesLocalstorage, code, "A1-ADAPT-004/boundBytes");
  findings.equal(expected(localBound)["atBound"], "written", code, "A1-ADAPT-004/atBound");
  findings.equal(expected(localBound)["onePastBound"], "recovery.envelope_too_large", code, "A1-ADAPT-004/onePastBound");
  const primaryBound = requireCase(cases, "A1-ADAPT-005", findings, code);
  findings.equal(primaryBound["boundBytes"], LIMITS.envelopeBytesIndexeddb, code, "A1-ADAPT-005/boundBytes");
  findings.equal(expected(primaryBound)["onePastBound"], "recovery.envelope_too_large", code, "A1-ADAPT-005/onePastBound");
  requireCase(cases, "A1-ADAPT-006", findings, code);
  requireCase(cases, "A1-ADAPT-007", findings, code);
  const keyCase = expected(requireCase(cases, "A1-ADAPT-008", findings, code));
  findings.equal(keyCase["maxKeyLength"], LIMITS.maxKeyLength, code, "A1-ADAPT-008/maxKeyLength");
  findings.equal(keyCase["prefix"], KEY_PREFIX, code, "A1-ADAPT-008/prefix");
  if (cases.length !== 8) {
    findings.add(code, "adapter/cases", `Expected eight adapter cases, found ${String(cases.length)}.`);
  }
  return cases.length;
}

/** Independent restatement of the startup decision table. */
function expectedDisposition(row: JsonRecord): string | null {
  if (row["adapter"] === "none") return "none-available";
  const current = asString(row["current"]);
  const previous = asString(row["previous"]);
  const edited = row["sessionEdited"] === true;
  const markerAgrees = row["exportMarkerAgrees"] !== false;
  if (current === "valid-fresh" && !edited && markerAgrees) {
    return "open-current-automatically";
  }
  if (current.startsWith("valid") && (edited || !markerAgrees)) {
    return "offer-keep-discard";
  }
  if (current === "corrupt" && previous === "valid") return "offer-previous";
  if (current === "absent" && previous === "valid") return "offer-previous";
  if (current === "corrupt") return "report-unrecoverable";
  if (current === "absent" && previous !== "valid") {
    return previous === "corrupt" ? "report-unrecoverable" : "none-available";
  }
  return null;
}

function validateStartup(startup: JsonRecord, findings: Findings): number {
  findings.equal(startup["schema"], "changes.fixtures.a1-startup.v1", "A1_SCHEMA", "startup/schema");
  const code = "A1_STARTUP_CASES";
  const cases = records(startup["cases"]);
  const laws = isRecord(startup["laws"]) ? startup["laws"] : {};
  for (const law of ["blankFirst", "noAudio", "noSilentOverwrite"]) {
    if (asString(laws[law]).length === 0) {
      findings.add(code, `startup/laws/${law}`, "Missing required startup law.");
    }
  }
  for (const [index, row] of cases.entries()) {
    const id = asString(row["caseId"]);
    const declared = expected(row)["disposition"];
    if (declared === undefined) continue;
    const declaredText = asString(declared);
    if (!DISPOSITIONS.includes(declaredText)) {
      findings.add(code, `startup/cases/${String(index)}/disposition`, `Unknown disposition ${declaredText}.`);
      continue;
    }
    const derived = expectedDisposition(row);
    if (derived !== null && derived !== declaredText) {
      findings.add(code, `${id}/disposition`, `Matrix row derives ${derived} but the case declares ${declaredText}.`);
    }
  }
  const audio = expected(requireCase(cases, "A1-START-012", findings, code));
  findings.equal(audio["audioInitialized"], false, code, "A1-START-012/audioInitialized");
  if (cases.length !== 12) {
    findings.add(code, "startup/cases", `Expected twelve startup cases, found ${String(cases.length)}.`);
  }
  return cases.length;
}

function validateExport(exportMarker: JsonRecord, findings: Findings): number {
  findings.equal(exportMarker["schema"], "changes.fixtures.a1-export-marker.v1", "A1_SCHEMA", "export/schema");
  const code = "A1_EXPORT_CASES";
  const cases = records(exportMarker["cases"]);
  const recorded = requireCase(cases, "A1-EXPORT-001", findings, code);
  const binding = isRecord(recorded["binding"]) ? recorded["binding"] : {};
  findings.equal(binding["schema"], "changes.recovery-export-binding.v1", code, "A1-EXPORT-001/binding/schema");
  for (const field of ["documentId", "exportRevision", "exportedAt", "semanticDocumentHash", "artifactByteLength", "artifactSha256"]) {
    if (binding[field] === undefined) {
      findings.add(code, `A1-EXPORT-001/binding/${field}`, "The complete binding must carry every field.");
    }
  }
  findings.equal(expected(recorded)["outcome"], "recorded", code, "A1-EXPORT-001/outcome");
  findings.equal(expected(requireCase(cases, "A1-EXPORT-002", findings, code))["subsetFields"], ["revision", "exportedAt", "semanticDocumentHash"], code, "A1-EXPORT-002/subsetFields");
  const cancelled = expected(requireCase(cases, "A1-EXPORT-003", findings, code));
  findings.equal(cancelled["outcome"], "not-recorded", code, "A1-EXPORT-003/outcome");
  findings.equal(cancelled["markerChanged"], false, code, "A1-EXPORT-003/markerChanged");
  const stale = expected(requireCase(cases, "A1-EXPORT-004", findings, code));
  findings.equal(stale["reasonCode"], "recovery.export_marker_stale", code, "A1-EXPORT-004/reasonCode");
  findings.equal(stale["newerStateTouched"], false, code, "A1-EXPORT-004/newerStateTouched");
  const failed = expected(requireCase(cases, "A1-EXPORT-005", findings, code));
  findings.equal(failed["statusVocabulary"], VOCABULARY.changedSinceExport, code, "A1-EXPORT-005/statusVocabulary");
  findings.equal(expected(requireCase(cases, "A1-EXPORT-006", findings, code))["reasonCode"], "recovery.export_binding_invalid", code, "A1-EXPORT-006/reasonCode");
  findings.equal(expected(requireCase(cases, "A1-EXPORT-007", findings, code))["reasonCode"], "recovery.document_id_mismatch", code, "A1-EXPORT-007/reasonCode");
  const vocabulary = expected(requireCase(cases, "A1-EXPORT-008", findings, code));
  findings.equal(vocabulary["exactStatuses"], [VOCABULARY.exportedAtRevision, VOCABULARY.changedSinceExport], code, "A1-EXPORT-008/exactStatuses");
  if (cases.length !== 8) {
    findings.add(code, "export/cases", `Expected eight export cases, found ${String(cases.length)}.`);
  }
  return cases.length;
}

function validateMutations(
  mutations: JsonRecord,
  loaded: ReadonlyMap<string, { value: unknown; bytes: Uint8Array }>,
  findings: Findings,
): number {
  findings.equal(mutations["schema"], "changes.fixtures.a1-mutation-controls.v1", "A1_SCHEMA", "mutations/schema");
  findings.equal(mutations["productionImportsForbidden"], true, "A1_MUTATION_CONTROLS", "mutations/productionImportsForbidden");
  const controls = records(mutations["controls"]);
  const code = "A1_MUTATION_CONTROLS";
  if (controls.length !== 21) {
    findings.add(code, "mutations/controls", `Expected twenty-one controls, found ${String(controls.length)}.`);
  }
  const codes = new Set<string>(FINDING_CODES);
  const files = new Set<string>(A1_FIXTURE_FILES);
  const ids = new Set<string>();
  for (const [index, control] of controls.entries()) {
    const path = `mutations/controls/${String(index)}`;
    const id = asString(control["id"]);
    if (!/^A1-MUT-\d{3}$/u.test(id) || ids.has(id)) {
      findings.add(code, path, `Invalid or duplicate control ID ${id}.`);
    }
    ids.add(id);
    const file = asString(control["file"]);
    if (!files.has(file)) {
      findings.add(code, `${path}/file`, `Unknown target file ${file}.`);
      continue;
    }
    if (!codes.has(asString(control["expectedFindingCode"]))) {
      findings.add(code, `${path}/expectedFindingCode`, "Unknown expected finding code.");
    }
    findings.equal(control["operation"], "replace", code, `${path}/operation`);
    const target = loaded.get(file)?.value;
    const pointer = asString(control["pointer"]);
    const current = resolvePointer(target, pointer);
    if (current === undefined) {
      findings.add(code, `${path}/pointer`, `Pointer ${pointer} does not resolve in ${file}.`);
    } else if (JSON.stringify(current) === JSON.stringify(control["value"])) {
      findings.add(code, `${path}/value`, "The mutation value equals the current value and cannot change behavior.");
    }
  }
  return controls.length;
}

function validateTraces(
  trace: JsonRecord,
  universe: ReadonlySet<string>,
  mutationCount: number,
  findings: Findings,
): number {
  findings.equal(trace["schema"], "changes.fixtures.a1-trace-ledger.v1", "A1_SCHEMA", "trace/schema");
  const traces = records(trace["traces"]);
  const code = "A1_TRACE";
  const ids = new Set<string>();
  const coveredCases = new Set<string>();
  const coveredControls = new Set<string>();
  const controlIds = new Set<string>(
    Array.from({ length: mutationCount }, (_, index) => `A1-MUT-${String(index + 1).padStart(3, "0")}`),
  );
  for (const [index, entry] of traces.entries()) {
    const path = `trace/traces/${String(index)}`;
    const id = asString(entry["id"]);
    if (id.length === 0 || ids.has(id)) {
      findings.add(code, path, `Invalid or duplicate trace ID ${id}.`);
    }
    ids.add(id);
    const caseIds = Array.isArray(entry["caseIds"]) ? entry["caseIds"] : [];
    if (caseIds.length === 0) {
      findings.add(code, `${path}/caseIds`, "Every trace must name at least one case.");
    }
    for (const caseId of caseIds) {
      if (typeof caseId !== "string" || !universe.has(caseId)) {
        findings.add(code, `${path}/caseIds`, `Unknown case ${String(caseId)}.`);
      } else {
        coveredCases.add(caseId);
      }
    }
    for (const controlId of Array.isArray(entry["controlIds"]) ? entry["controlIds"] : []) {
      if (typeof controlId !== "string" || !controlIds.has(controlId)) {
        findings.add(code, `${path}/controlIds`, `Unknown control ${String(controlId)}.`);
      } else {
        coveredControls.add(controlId);
      }
    }
    if (asString(entry["evidenceOwner"]).length === 0) {
      findings.add(code, `${path}/evidenceOwner`, "Every trace needs an evidence owner.");
    }
    if (asString(entry["requirement"]).length === 0 || asString(entry["parentSource"]).length === 0) {
      findings.add(code, path, "Every trace needs a requirement and parent source.");
    }
    if (id === "TR-A1-BROWSER-RELOAD" && entry["evidenceOwner"] !== "tests/e2e/recovery-reload.spec.ts") {
      findings.add(code, `${path}/evidenceOwner`, "The browser reload trace is owned by the E2E spec.");
    }
  }
  for (const required of REQUIRED_TRACE_IDS) {
    if (!ids.has(required)) {
      findings.add(code, "trace/traces", `Missing required trace ${required}.`);
    }
  }
  for (const caseId of universe) {
    if (!coveredCases.has(caseId)) {
      findings.add(code, "trace/traces", `Case ${caseId} belongs to no trace.`);
    }
  }
  for (const controlId of controlIds) {
    if (!coveredControls.has(controlId)) {
      findings.add(code, "trace/traces", `Control ${controlId} belongs to no trace.`);
    }
  }
  return traces.length;
}

function validateProvenance(provenance: JsonRecord, findings: Findings): number {
  findings.equal(provenance["schema"], "changes.fixtures.a1-provenance-ledger.v1", "A1_SCHEMA", "provenance/schema");
  const code = "A1_PROVENANCE";
  findings.equal(provenance["reviewState"], "reviewed-for-a1-spec", code, "provenance/reviewState");
  findings.equal(provenance["expectedValuesGenerated"], false, code, "provenance/expectedValuesGenerated");
  findings.equal(provenance["productionOutputUsed"], false, code, "provenance/productionOutputUsed");
  const policy = isRecord(provenance["classificationPolicy"]) ? provenance["classificationPolicy"] : {};
  const classes = new Set(Object.keys(policy));
  const authorities = records(provenance["authorities"]);
  const ids = new Set<string>();
  for (const [index, authority] of authorities.entries()) {
    const path = `provenance/authorities/${String(index)}`;
    const id = asString(authority["id"]);
    if (id.length === 0 || ids.has(id)) {
      findings.add(code, path, `Invalid or duplicate authority ID ${id}.`);
    }
    ids.add(id);
    if (!classes.has(asString(authority["class"]))) {
      findings.add(code, `${path}/class`, "Authority class must come from the classification policy.");
    }
    if (asString(authority["source"]).length === 0) {
      findings.add(code, `${path}/source`, "Every authority needs a source.");
    }
    const supports = Array.isArray(authority["supports"]) ? authority["supports"] : [];
    if (supports.length === 0) {
      findings.add(code, `${path}/supports`, "Every authority must support at least one expectation.");
    }
  }
  for (const required of REQUIRED_AUTHORITY_IDS) {
    if (!ids.has(required)) {
      findings.add(code, "provenance/authorities", `Missing required authority ${required}.`);
    }
  }
  return authorities.length;
}

async function main(): Promise<void> {
  const result = await validateA1Contract();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.outcome === "pass" ? 0 : 1;
}

if (import.meta.main) {
  await main();
}
