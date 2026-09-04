/**
 * U5 lifecycle-dialogs contract validator.
 *
 * The validator imports no production module. It re-derives every judgment
 * it checks — the total replacement-confirmation matrix from the stated law,
 * startup-disposition coverage, stack case integrity, trace/case/authority
 * linkage, and mutation-control integrity — then compares its result with
 * the fixture's declared expectations. Fixture expectations may never be
 * produced by the code they will test; the module↔fixture↔live-tuple
 * bindings are proved separately by tests/static/u5-contract.test.ts.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { stableJson } from "./foundation-io";

type JsonObject = Record<string, unknown>;

export type U5ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type U5ContractValidationReport = Readonly<{
  schema: "changes.validation.u5-contract.v1";
  package: "U5";
  outcome: "pass" | "fail";
  reviewState: string;
  productionImplementationClaim: boolean;
  uiCompletionClaim: boolean;
  humanAcceptanceClaim: boolean;
  expertReviewClaim: boolean;
  counts: Readonly<{
    companions: number;
    components: number;
    operations: number;
    confirmationCells: number;
    stackCases: number;
    lifecycleCases: number;
    importExportCases: number;
    focusCases: number;
    traces: number;
    authorities: number;
    mutationControls: number;
  }>;
  findings: readonly U5ContractFinding[];
}>;

const ROOT = resolve(import.meta.dirname, "..");
const FIXTURE_DIR = resolve(ROOT, "tests/fixtures/lifecycle-dialogs");
const MANIFEST = "u5-lifecycle-contract.json";
const COMPANIONS = [
  "dialog-state-matrix.json",
  "lifecycle-cases.json",
  "import-export-cases.json",
  "focus-restoration-cases.json",
  "provenance-ledger.json",
  "trace-ledger.json",
  "mutation-controls.json",
] as const;

const MANIFEST_SCHEMA = "changes.fixtures.u5-lifecycle-contract.v1";
const COMPANION_SCHEMAS: Readonly<Record<string, string>> = {
  "dialog-state-matrix.json": "changes.fixtures.u5-dialog-state-matrix.v1",
  "lifecycle-cases.json": "changes.fixtures.u5-lifecycle-cases.v1",
  "import-export-cases.json": "changes.fixtures.u5-import-export-cases.v1",
  "focus-restoration-cases.json":
    "changes.fixtures.u5-focus-restoration-cases.v1",
  "provenance-ledger.json": "changes.fixtures.u5-provenance-ledger.v1",
  "trace-ledger.json": "changes.fixtures.u5-trace-ledger.v1",
  "mutation-controls.json": "changes.fixtures.u5-mutation-controls.v1",
};

const A0_DIALOG_KINDS = [
  "new-document",
  "lesson-load",
  "import-confirm",
  "discard-changes",
  "history-limit",
  "error-details",
] as const;
const PROPOSED_DIALOG_KINDS = ["import-preview", "lifecycle-export"] as const;
const STARTUP_DISPOSITIONS = [
  "open-current-automatically",
  "offer-keep-discard",
  "offer-previous",
  "report-unrecoverable",
  "none-available",
] as const;
const REPLACEMENT_ORIGINS = [
  "new",
  "lesson",
  "canonical-import",
  "legacy-import",
] as const;
const A0_TRANSPORT_STATUSES = [
  "unavailable",
  "ready",
  "starting",
  "playing",
  "paused",
  "stopping",
  "failed",
] as const;
const RUN_ACTIVE = ["starting", "playing", "paused", "stopping"] as const;
const EXPECTED_COMPONENT_COUNT = 22;
const EXPECTED_OPERATION_COUNT = 24;
const EXPECTED_CONFIRMATION_CELLS = 4 * 2 * 2 * 7;
const AUTHORIZED_INTENTS = [
  "push-dialog",
  "pop-dialog",
  "set-import-draft",
  "dismiss-notice",
] as const;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function arrayOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function finding(
  findings: U5ContractFinding[],
  code: string,
  path: string,
  message: string,
): void {
  findings.push(Object.freeze({ code, path, message }));
}

async function loadFixture(
  name: string,
  findings: U5ContractFinding[],
): Promise<{ value: JsonObject; text: string } | null> {
  const path = resolve(FIXTURE_DIR, name);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    finding(findings, "U5_FIXTURE_MISSING", name, "Fixture file is missing.");
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    finding(findings, "U5_FIXTURE_JSON", name, "Fixture file is not valid JSON.");
    return null;
  }
  if (!isObject(value)) {
    finding(findings, "U5_FIXTURE_SHAPE", name, "Fixture root must be one object.");
    return null;
  }
  return { value, text };
}

function checkCommonEnvelope(
  name: string,
  value: JsonObject,
  expectedSchema: string,
  findings: U5ContractFinding[],
): void {
  if (value["schema"] !== expectedSchema) {
    finding(findings, "U5_SCHEMA", `${name}.schema`, `Expected ${expectedSchema}.`);
  }
  if (value["reviewState"] !== "proposed-independent-spec") {
    finding(
      findings,
      "U5_REVIEW_STATE",
      `${name}.reviewState`,
      "Every U5 fixture must remain a proposed independent specification.",
    );
  }
  if (value["pinState"] !== "pinned") {
    finding(findings, "U5_PIN_STATE", `${name}.pinState`, "Fixtures must be pinned.");
  }
  if (value["expectedValuesGenerated"] !== false) {
    finding(
      findings,
      "U5_GENERATED_EXPECTATIONS",
      `${name}.expectedValuesGenerated`,
      "Expected values must be authored, never generated.",
    );
  }
  if (value["productionOutputUsedAsOracle"] !== false) {
    finding(
      findings,
      "U5_PRODUCTION_ORACLE",
      `${name}.productionOutputUsedAsOracle`,
      "Production output may never be the oracle.",
    );
  }
}

/** The confirmation law, recomputed by the validator from first principles. */
function deriveConfirmation(
  documentNonempty: boolean,
  dirty: boolean,
  transportStatus: string,
): boolean {
  if (!documentNonempty) return false;
  if (dirty) return true;
  return (RUN_ACTIVE as readonly string[]).includes(transportStatus);
}

export async function validateU5Contract(): Promise<U5ContractValidationReport> {
  const findings: U5ContractFinding[] = [];

  const manifestResult = await loadFixture(MANIFEST, findings);
  const companions = new Map<string, { value: JsonObject; text: string }>();
  for (const name of COMPANIONS) {
    const result = await loadFixture(name, findings);
    if (result !== null) companions.set(name, result);
  }

  const manifest = manifestResult?.value ?? {};

  if (manifestResult !== null) {
    checkCommonEnvelope(MANIFEST, manifest, MANIFEST_SCHEMA, findings);
    for (const flag of [
      "productionImplementationClaim",
      "uiCompletionClaim",
      "humanAcceptanceClaim",
      "expertReviewClaim",
    ] as const) {
      if (manifest[flag] !== false) {
        finding(
          findings,
          "U5_CLAIM_FLAG",
          `${MANIFEST}.${flag}`,
          "The spec packet may not claim implementation, completion, acceptance, or review.",
        );
      }
    }
    if (manifest["implementationStatus"] !== "specified-not-implemented") {
      finding(
        findings,
        "U5_IMPLEMENTATION_STATUS",
        `${MANIFEST}.implementationStatus`,
        "The packet must read specified-not-implemented until the verify leg's recorded acceptance.",
      );
    }
    if (manifest["beadId"] !== "jcpe-milestone-reliable-studio-l3a.13.1") {
      finding(findings, "U5_BEAD", `${MANIFEST}.beadId`, "The manifest must name the U5/spec bead.");
    }
    const companionsDeclared = arrayOf(manifest["companions"]).filter(isString);
    if (JSON.stringify(companionsDeclared) !== JSON.stringify([...COMPANIONS])) {
      finding(
        findings,
        "U5_COMPANION_LIST",
        `${MANIFEST}.companions`,
        "The companions list must equal the frozen companion inventory in order.",
      );
    }
    const hashes = isObject(manifest["companionSha256"])
      ? manifest["companionSha256"]
      : {};
    for (const name of COMPANIONS) {
      const companion = companions.get(name);
      const expected = hashes[name];
      if (companion === undefined) continue;
      if (!isString(expected) || !/^[a-f0-9]{64}$/u.test(expected)) {
        finding(
          findings,
          "U5_COMPANION_HASH_MISSING",
          `${MANIFEST}.companionSha256.${name}`,
          "Every companion must carry a SHA-256 pin in the manifest.",
        );
        continue;
      }
      if (sha256Hex(companion.text) !== expected) {
        finding(
          findings,
          "U5_COMPANION_HASH_DRIFT",
          name,
          "Companion bytes drifted from the manifest pin.",
        );
      }
    }
    const a0Kinds = arrayOf(manifest["a0DialogKinds"]);
    if (JSON.stringify(a0Kinds) !== JSON.stringify([...A0_DIALOG_KINDS])) {
      finding(findings, "U5_DIALOG_BASE", `${MANIFEST}.a0DialogKinds`, "The base dialog kinds must equal the A0 six exactly.");
    }
    const proposed = arrayOf(manifest["proposedDialogKinds"]);
    if (JSON.stringify(proposed) !== JSON.stringify([...PROPOSED_DIALOG_KINDS])) {
      finding(findings, "U5_DIALOG_PROPOSED", `${MANIFEST}.proposedDialogKinds`, "The proposed kinds are exactly import-preview and lifecycle-export.");
    }
    const dispositions = arrayOf(manifest["startupDispositions"]);
    if (JSON.stringify(dispositions) !== JSON.stringify([...STARTUP_DISPOSITIONS])) {
      finding(findings, "U5_DISPOSITIONS", `${MANIFEST}.startupDispositions`, "Startup dispositions must equal the A1 five exactly.");
    }
    const authorized = arrayOf(manifest["authorizedEphemeralIntentKinds"]);
    if (JSON.stringify(authorized) !== JSON.stringify([...AUTHORIZED_INTENTS])) {
      finding(findings, "U5_INTENT_AUTHORIZED", `${MANIFEST}.authorizedEphemeralIntentKinds`, "The authorized ephemeral intents are exactly push-dialog, pop-dialog, set-import-draft, dismiss-notice.");
    }
  }

  for (const [name, companion] of companions) {
    checkCommonEnvelope(name, companion.value, COMPANION_SCHEMAS[name] ?? "", findings);
  }

  /* Component inventory. */
  const components = arrayOf(manifest["components"]).filter(isObject);
  const componentIds = new Set<string>();
  const componentNames = new Set<string>();
  const surfaces = new Set(arrayOf(manifest["surfaces"]).filter(isString));
  for (const component of components) {
    const id = component["id"];
    const name = component["name"];
    const surface = component["surface"];
    if (!isString(id) || !/^U5-CMP-0(0[1-9]|1[0-9]|2[0-2])$/u.test(id)) {
      finding(findings, "U5_COMPONENT_ID", MANIFEST, "Component IDs must be U5-CMP-001…022.");
    } else if (componentIds.has(id)) {
      finding(findings, "U5_COMPONENT_DUPLICATE", id, "Duplicate component ID.");
    }
    if (isString(id)) componentIds.add(id);
    if (!isString(name) || componentNames.has(name)) {
      finding(findings, "U5_COMPONENT_NAME", String(name), "Component names must be unique and nonempty.");
    }
    if (isString(name)) componentNames.add(name);
    if (!isString(surface) || !surfaces.has(surface)) {
      finding(findings, "U5_COMPONENT_SURFACE", String(name), "Component surface must be one of the declared surfaces.");
    }
  }
  if (components.length !== EXPECTED_COMPONENT_COUNT) {
    finding(
      findings,
      "U5_COMPONENT_COUNT",
      MANIFEST,
      `The inventory is closed at ${String(EXPECTED_COMPONENT_COUNT)} components; observed ${String(components.length)}.`,
    );
  }
  /* Operation inventory: channel laws and component references. */
  const operations = arrayOf(manifest["operations"]).filter(isObject);
  const operationIds = new Set<string>();
  for (const operation of operations) {
    const id = operation["id"];
    if (!isString(id) || operationIds.has(id)) {
      finding(findings, "U5_OPERATION_ID", String(id), "Operation IDs must be unique and nonempty.");
    }
    if (isString(id)) operationIds.add(id);
    const component = operation["component"];
    if (!isString(component) || !componentIds.has(component)) {
      finding(findings, "U5_OPERATION_COMPONENT", String(id), "Every operation must reference an inventoried component.");
    }
    const channel = operation["channel"];
    const compositionMethod = operation["compositionMethod"];
    const intentKind = operation["intentKind"];
    if (channel === "composition-method") {
      if (!isString(compositionMethod) || intentKind !== null) {
        finding(findings, "U5_OPERATION_CHANNEL", String(id), "A composition-method row names one method and no intent.");
      }
    } else if (channel === "ephemeral-intent") {
      if (
        compositionMethod !== null ||
        !isString(intentKind) ||
        !(AUTHORIZED_INTENTS as readonly string[]).includes(intentKind)
      ) {
        finding(findings, "U5_OPERATION_CHANNEL", String(id), "An ephemeral-intent row names one authorized intent kind and no method.");
      }
    } else if (channel === "presentation-only") {
      if (compositionMethod !== null || intentKind !== null) {
        finding(findings, "U5_OPERATION_CHANNEL", String(id), "A presentation-only row reaches the application in no way.");
      }
    } else {
      finding(findings, "U5_OPERATION_CHANNEL", String(id), "Unknown operation channel.");
    }
    if (operation["keyboardAccess"] === "none" || operation["pointerAlternative"] === "none") {
      finding(findings, "U5_OPERATION_COVERAGE", String(id), "keyboardAccess and pointerAlternative may not be none.");
    }
  }
  if (operations.length !== EXPECTED_OPERATION_COUNT) {
    finding(
      findings,
      "U5_OPERATION_COUNT",
      `${MANIFEST}.operations`,
      `The operation inventory is closed at ${String(EXPECTED_OPERATION_COUNT)}; observed ${String(operations.length)}.`,
    );
  }


  /* Startup presentation: one row per disposition, designed states. */
  const startupPresentation = arrayOf(manifest["startupPresentation"]).filter(isObject);
  const presentedDispositions = new Set<string>();
  for (const row of startupPresentation) {
    const disposition = row["disposition"];
    if (!isString(disposition) || !(STARTUP_DISPOSITIONS as readonly string[]).includes(disposition)) {
      finding(findings, "U5_STARTUP_ROW", String(disposition), "Startup presentation rows must name an A1 disposition.");
      continue;
    }
    presentedDispositions.add(disposition);
    const offers = arrayOf(row["offers"]);
    if (disposition === "none-available") {
      if (row["surfaceKind"] !== "none" || offers.length !== 0 || row["component"] !== null) {
        finding(findings, "U5_STARTUP_NONE", disposition, "none-available renders no surface and offers nothing.");
      }
    } else {
      if (!isString(row["component"]) || !componentIds.has(row["component"])) {
        finding(findings, "U5_STARTUP_COMPONENT", disposition, "Every visible disposition names an inventoried component.");
      }
      if (offers.length === 0) {
        finding(findings, "U5_STARTUP_OFFERS", disposition, "Every visible disposition offers at least one action.");
      }
    }
  }
  for (const disposition of STARTUP_DISPOSITIONS) {
    if (!presentedDispositions.has(disposition)) {
      finding(findings, "U5_STARTUP_TOTALITY", disposition, "Every A1 disposition must have exactly one presentation row.");
    }
  }

  /* Dialog state matrix: stack cases + the confirmation matrix. */
  const matrix = companions.get("dialog-state-matrix.json")?.value ?? {};
  const stackCases = arrayOf(matrix["stackCases"]).filter(isObject);
  const stackCaseIds = new Set<string>();
  for (const entry of stackCases) {
    const id = entry["id"];
    if (!isString(id) || stackCaseIds.has(id)) {
      finding(findings, "U5_CASE_ID", String(id), "Case IDs must be unique and nonempty.");
    }
    if (isString(id)) stackCaseIds.add(id);
  }
  const confirmationCells = arrayOf(matrix["confirmationCells"]).filter(isObject);
  if (confirmationCells.length !== EXPECTED_CONFIRMATION_CELLS) {
    finding(
      findings,
      "U5_CONFIRM_TOTALITY",
      "dialog-state-matrix.json.confirmationCells",
      `The confirmation matrix must hold exactly ${String(EXPECTED_CONFIRMATION_CELLS)} cells; observed ${String(confirmationCells.length)}.`,
    );
  }
  const seenCells = new Set<string>();
  for (const cell of confirmationCells) {
    const origin = cell["origin"];
    const nonempty = cell["documentNonempty"];
    const dirty = cell["dirty"];
    const status = cell["transportStatus"];
    if (
      !isString(origin) ||
      !(REPLACEMENT_ORIGINS as readonly string[]).includes(origin) ||
      typeof nonempty !== "boolean" ||
      typeof dirty !== "boolean" ||
      !isString(status) ||
      !(A0_TRANSPORT_STATUSES as readonly string[]).includes(status)
    ) {
      finding(findings, "U5_CONFIRM_IDENTITY", stableJson(cell), "Confirmation cells must name a frozen origin, booleans, and an A0 status.");
      continue;
    }
    const key = `${origin}|${String(nonempty)}|${String(dirty)}|${status}`;
    if (seenCells.has(key)) {
      finding(findings, "U5_CONFIRM_DUPLICATE", key, "Duplicate confirmation cell.");
      continue;
    }
    seenCells.add(key);
    const derived = deriveConfirmation(nonempty, dirty, status);
    if (cell["requiresConfirmation"] !== derived) {
      finding(
        findings,
        "U5_CONFIRM_LAW",
        key,
        `Cell disagrees with the recomputed confirmation law (expected ${String(derived)}).`,
      );
    }
    if (!derived && cell["bypassReason"] !== "pristine-idle" && cell["bypassReason"] !== "empty-document") {
      finding(findings, "U5_CONFIRM_BYPASS", key, "A non-required cell must carry its named bypass reason.");
    }
    if (derived && "bypassReason" in cell) {
      finding(findings, "U5_CONFIRM_BYPASS_PRESENT", key, "A required cell carries no bypass reason.");
    }
  }

  /* Case files: identity and cross-reference integrity. */
  const caseFiles = [
    ["lifecycle-cases.json", arrayOf(companions.get("lifecycle-cases.json")?.value["cases"]).filter(isObject)],
    ["import-export-cases.json", arrayOf(companions.get("import-export-cases.json")?.value["cases"]).filter(isObject)],
    ["focus-restoration-cases.json", arrayOf(companions.get("focus-restoration-cases.json")?.value["cases"]).filter(isObject)],
  ] as const;
  const manifestLawIds = new Set(arrayOf(manifest["lawIds"]).filter(isString));
  const provenanceDoc = companions.get("provenance-ledger.json")?.value ?? {};
  const authorityIds = new Set<string>();
  for (const authority of arrayOf(provenanceDoc["authorities"]).filter(isObject)) {
    const id = authority["id"];
    if (isString(id)) authorityIds.add(id);
  }
  const traceDoc = companions.get("trace-ledger.json")?.value ?? {};
  const traces = arrayOf(traceDoc["traces"]).filter(isObject);
  const traceIds = new Set<string>();
  for (const trace of traces) {
    const id = trace["id"];
    if (isString(id)) traceIds.add(id);
  }

  const allCaseIds = new Set<string>(stackCaseIds);
  for (const [docName, cases] of caseFiles) {
    for (const entry of cases) {
      const id = entry["id"];
      if (!isString(id) || allCaseIds.has(id)) {
        finding(findings, "U5_CASE_ID", `${docName}.${String(id)}`, "Case IDs must be unique across the package and nonempty.");
      }
      if (isString(id)) allCaseIds.add(id);
      if (!isString(entry["given"]) || !isString(entry["expected"])) {
        finding(findings, "U5_CASE_FIELDS", `${docName}.${String(id)}`, "Cases must carry given and expected statements.");
      }
      for (const lawId of arrayOf(entry["lawIds"]).filter(isString)) {
        if (!manifestLawIds.has(lawId)) {
          finding(findings, "U5_CASE_LAW", `${docName}.${String(id)}`, "Case lawIds must resolve to the manifest law inventory.");
        }
      }
      for (const traceId of arrayOf(entry["traceIds"]).filter(isString)) {
        if (!traceIds.has(traceId)) {
          finding(findings, "U5_CASE_TRACE", `${docName}.${String(id)}`, "Case traceIds must resolve to the trace ledger.");
        }
      }
      for (const authorityId of arrayOf(entry["authorityIds"]).filter(isString)) {
        if (!authorityIds.has(authorityId)) {
          finding(findings, "U5_CASE_AUTHORITY", `${docName}.${String(id)}`, "Case authorityIds must resolve to the provenance ledger.");
        }
      }
    }
  }
  /* Stack cases also carry cross-references. */
  for (const entry of stackCases) {
    for (const lawId of arrayOf(entry["lawIds"]).filter(isString)) {
      if (!manifestLawIds.has(lawId)) {
        finding(findings, "U5_CASE_LAW", `dialog-state-matrix.json.${String(entry["id"])}`, "Case lawIds must resolve to the manifest law inventory.");
      }
    }
    for (const traceId of arrayOf(entry["traceIds"]).filter(isString)) {
      if (!traceIds.has(traceId)) {
        finding(findings, "U5_CASE_TRACE", `dialog-state-matrix.json.${String(entry["id"])}`, "Case traceIds must resolve to the trace ledger.");
      }
    }
    for (const authorityId of arrayOf(entry["authorityIds"]).filter(isString)) {
      if (!authorityIds.has(authorityId)) {
        finding(findings, "U5_CASE_AUTHORITY", `dialog-state-matrix.json.${String(entry["id"])}`, "Case authorityIds must resolve to the provenance ledger.");
      }
    }
  }

  /* Trace ledger: bidirectional linkage. */
  const tracedCaseIds = new Set<string>();
  for (const trace of traces) {
    const caseIds = arrayOf(trace["caseIds"]).filter(isString);
    const regions = arrayOf(trace["matrixRegions"]).filter(isString);
    if (caseIds.length === 0 && regions.length === 0) {
      finding(findings, "U5_TRACE_COVERAGE", String(trace["id"]), "Every trace must name cases or matrix regions.");
    }
    for (const caseId of caseIds) {
      if (!allCaseIds.has(caseId)) {
        finding(findings, "U5_TRACE_CASE", `${String(trace["id"])}.${caseId}`, "Trace case IDs must exist in a companion fixture.");
      }
      tracedCaseIds.add(caseId);
    }
    for (const region of regions) {
      if (region !== "confirmationCells") {
        finding(findings, "U5_TRACE_REGION", `${String(trace["id"])}.${region}`, "Unknown matrix region.");
      }
    }
  }
  for (const caseId of allCaseIds) {
    if (!tracedCaseIds.has(caseId)) {
      finding(findings, "U5_CASE_ORPHAN", caseId, "Every fixture case must carry at least one trace.");
    }
  }

  /* Mutation controls. */
  const mutationDoc = companions.get("mutation-controls.json")?.value ?? {};
  const controls = arrayOf(mutationDoc["controls"]).filter(isObject);
  const controlIds = new Set<string>();
  for (const control of controls) {
    const id = control["id"];
    if (!isString(id) || controlIds.has(id)) {
      finding(findings, "U5_MUTATION_ID", String(id), "Mutation control IDs must be unique and nonempty.");
    }
    if (isString(id)) controlIds.add(id);
    const lawId = control["lawId"];
    if (!isString(lawId) || !manifestLawIds.has(lawId)) {
      finding(findings, "U5_MUTATION_LAW", String(id), "Every mutation control must name a manifest law.");
    }
    const killedBy = arrayOf(control["killedBy"]).filter(isString);
    for (const caseId of killedBy) {
      if (!allCaseIds.has(caseId)) {
        finding(findings, "U5_MUTATION_CASE", `${String(id)}.${caseId}`, "A killing case must exist in a companion fixture.");
      }
    }
    const witness = control["matrixWitness"];
    if (killedBy.length === 0 && !isString(witness)) {
      finding(findings, "U5_MUTATION_KILL", String(id), "Every mutation control must name a killing case or a matrix witness.");
    }
    if (isString(witness)) {
      const match = /^confirmationCells: ([a-z-]+)\|(nonempty|empty)\|(dirty|clean)\|([a-z]+) => requiresConfirmation$/u.exec(witness);
      if (match === null) {
        finding(findings, "U5_MUTATION_WITNESS", String(id), "A matrix witness must use the confirmationCells reference form.");
      } else {
        const [, origin, nonemptyToken, dirtyToken, status] = match;
        const cell = confirmationCells.find(
          (entry) =>
            entry["origin"] === origin &&
            entry["documentNonempty"] === (nonemptyToken === "nonempty") &&
            entry["dirty"] === (dirtyToken === "dirty") &&
            entry["transportStatus"] === status &&
            entry["requiresConfirmation"] === true,
        );
        if (cell === undefined) {
          finding(findings, "U5_MUTATION_WITNESS", String(id), "A matrix witness must name a real requiresConfirmation cell.");
        }
      }
    }
  }

  findings.sort((left, right) =>
    `${left.code}:${left.path}`.localeCompare(`${right.code}:${right.path}`),
  );

  const [, lifecycleCases] = caseFiles[0];
  const [, importExportCases] = caseFiles[1];
  const [, focusCases] = caseFiles[2];

  return Object.freeze({
    schema: "changes.validation.u5-contract.v1",
    package: "U5",
    outcome: findings.length === 0 ? "pass" : "fail",
    reviewState: isString(manifest["reviewState"]) ? manifest["reviewState"] : "unknown",
    productionImplementationClaim: manifest["productionImplementationClaim"] === true,
    uiCompletionClaim: manifest["uiCompletionClaim"] === true,
    humanAcceptanceClaim: manifest["humanAcceptanceClaim"] === true,
    expertReviewClaim: manifest["expertReviewClaim"] === true,
    counts: Object.freeze({
      companions: companions.size,
      components: components.length,
      operations: operations.length,
      confirmationCells: confirmationCells.length,
      stackCases: stackCases.length,
      lifecycleCases: lifecycleCases.length,
      importExportCases: importExportCases.length,
      focusCases: focusCases.length,
      traces: traces.length,
      authorities: authorityIds.size,
      mutationControls: controls.length,
    }),
    findings: Object.freeze(findings),
  });
}

if (import.meta.main) {
  try {
    const report = await validateU5Contract();
    process.stdout.write(stableJson(report));
    process.exitCode = report.outcome === "pass" ? 0 : 1;
  } catch (error) {
    process.stderr.write(
      stableJson({
        schema: "changes.validation.u5-contract.v1",
        outcome: "tool-failure",
        message:
          error instanceof Error ? error.message : "Unknown U5 validator failure.",
      }),
    );
    process.exitCode = 2;
  }
}
