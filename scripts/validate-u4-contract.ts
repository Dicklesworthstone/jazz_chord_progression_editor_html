/**
 * U4 transport-controls contract validator.
 *
 * The validator imports no production module. It re-derives every judgment
 * it checks — the total enablement matrix from the fixture's own law fields,
 * guard-condition coverage, layout-cell completeness, trace/case/authority
 * linkage, and mutation-control integrity — then compares its result with
 * the fixture's declared expectations. Fixture expectations may never be
 * produced by the code they will test; the module↔fixture↔live-tuple
 * bindings are proved separately by tests/static/u4-contract.test.ts.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { stableJson } from "./foundation-io";

type JsonObject = Record<string, unknown>;

export type U4ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type U4ContractValidationReport = Readonly<{
  schema: "changes.validation.u4-contract.v1";
  package: "U4";
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
    enablementCells: number;
    statusCases: number;
    keyboardCases: number;
    layoutCells: number;
    traces: number;
    authorities: number;
    mutationControls: number;
  }>;
  findings: readonly U4ContractFinding[];
}>;

const ROOT = resolve(import.meta.dirname, "..");
const FIXTURE_DIR = resolve(ROOT, "tests/fixtures/transport-controls");
const MANIFEST = "u4-transport-controls-contract.json";
const COMPANIONS = [
  "control-operation-matrix.json",
  "status-projection-cases.json",
  "keyboard-guard-cases.json",
  "layout-cells.json",
  "provenance-ledger.json",
  "trace-ledger.json",
  "mutation-controls.json",
] as const;

const MANIFEST_SCHEMA = "changes.fixtures.u4-transport-controls-contract.v1";
const COMPANION_SCHEMAS: Readonly<Record<string, string>> = {
  "control-operation-matrix.json":
    "changes.fixtures.u4-control-operation-matrix.v1",
  "status-projection-cases.json":
    "changes.fixtures.u4-status-projection-cases.v1",
  "keyboard-guard-cases.json": "changes.fixtures.u4-keyboard-guard-cases.v1",
  "layout-cells.json": "changes.fixtures.u4-layout-cells.v1",
  "provenance-ledger.json": "changes.fixtures.u4-provenance-ledger.v1",
  "trace-ledger.json": "changes.fixtures.u4-trace-ledger.v1",
  "mutation-controls.json": "changes.fixtures.u4-mutation-controls.v1",
};

const A0_STATUSES = [
  "unavailable",
  "ready",
  "starting",
  "playing",
  "paused",
  "stopping",
  "failed",
] as const;
const DISABLED_REASONS = [
  "untrusted-gesture",
  "no-playable-chord",
  "no-bound-plan",
  "audio-unavailable",
  "not-running",
  "no-active-run",
  "seek-out-of-range",
  "status-settling",
] as const;
const GUARD_CONDITIONS = [
  "default-prevented",
  "modifier-held",
  "target-input",
  "target-textarea",
  "target-select",
  "target-content-editable",
  "target-inside-button-or-link",
  "slider-focus",
] as const;
const VIEWPORTS = [
  "320x568",
  "390x844",
  "768x1024",
  "1280x800",
  "1440x900",
] as const;
const POINTER_VARIANTS = ["fine", "coarse"] as const;
const EXPECTED_COMPONENT_COUNT = 22;
const EXPECTED_OPERATION_COUNT = 24;
const GESTURE_GATED_OPERATIONS = [
  "play-run",
  "restart-run",
  "resume-from-interruption",
  "reinitialize-audio",
  "section-play",
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
  findings: U4ContractFinding[],
  code: string,
  path: string,
  message: string,
): void {
  findings.push(Object.freeze({ code, path, message }));
}

async function loadFixture(
  name: string,
  findings: U4ContractFinding[],
): Promise<{ value: JsonObject; text: string } | null> {
  const path = resolve(FIXTURE_DIR, name);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    finding(findings, "U4_FIXTURE_MISSING", name, "Fixture file is missing.");
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    finding(findings, "U4_FIXTURE_JSON", name, "Fixture file is not valid JSON.");
    return null;
  }
  if (!isObject(value)) {
    finding(findings, "U4_FIXTURE_SHAPE", name, "Fixture root must be one object.");
    return null;
  }
  return { value, text };
}

function checkCommonEnvelope(
  name: string,
  value: JsonObject,
  expectedSchema: string,
  findings: U4ContractFinding[],
): void {
  if (value["schema"] !== expectedSchema) {
    finding(
      findings,
      "U4_SCHEMA",
      `${name}.schema`,
      `Expected ${expectedSchema}.`,
    );
  }
  if (value["reviewState"] !== "proposed-independent-spec") {
    finding(
      findings,
      "U4_REVIEW_STATE",
      `${name}.reviewState`,
      "Every U4 fixture must remain a proposed independent specification.",
    );
  }
  if (value["pinState"] !== "pinned") {
    finding(findings, "U4_PIN_STATE", `${name}.pinState`, "Fixtures must be pinned.");
  }
  if (value["expectedValuesGenerated"] !== false) {
    finding(
      findings,
      "U4_GENERATED_EXPECTATIONS",
      `${name}.expectedValuesGenerated`,
      "Expected values must be authored, never generated.",
    );
  }
  if (value["productionOutputUsedAsOracle"] !== false) {
    finding(
      findings,
      "U4_PRODUCTION_ORACLE",
      `${name}.productionOutputUsedAsOracle`,
      "Production output may never be the oracle.",
    );
  }
}

/**
 * Recomputes one enablement cell from the operation's law fields. This is
 * the validator's independent derivation of the matrix law; the fixture's
 * declared cell must equal it.
 */
function deriveCell(
  operation: JsonObject,
  status: string,
  canPlay: boolean,
  failureCode: string | null,
): { enabled: boolean; disabledReason: string | null } {
  const enablement = isObject(operation["enablement"])
    ? operation["enablement"]
    : {};
  const enabledStatuses = arrayOf(enablement["enabledStatuses"]).filter(isString);
  const needsCanPlay = enablement["needsCanPlay"] === true;
  const onlyWhenFailureCode = isString(enablement["onlyWhenFailureCode"])
    ? enablement["onlyWhenFailureCode"]
    : null;
  const reasons = isObject(enablement["disabledReasonByStatus"])
    ? enablement["disabledReasonByStatus"]
    : {};
  const reason = reasons[status];
  let enabled = enabledStatuses.includes(status);
  if (enabled && onlyWhenFailureCode !== null && failureCode !== onlyWhenFailureCode) {
    enabled = false;
  }
  if (enabled && needsCanPlay && !canPlay) {
    return { enabled: false, disabledReason: "no-playable-chord" };
  }
  if (!enabled) {
    return {
      enabled: false,
      disabledReason: isString(reason) ? reason : null,
    };
  }
  return { enabled: true, disabledReason: null };
}

function cellKey(cell: JsonObject): string {
  const failure = isString(cell["failureCode"]) ? cell["failureCode"] : "";
  return `${String(cell["operationId"])}|${String(cell["status"])}|${String(cell["canPlay"])}|${failure}`;
}

export async function validateU4Contract(): Promise<U4ContractValidationReport> {
  const findings: U4ContractFinding[] = [];

  const manifestResult = await loadFixture(MANIFEST, findings);
  const companions = new Map<string, { value: JsonObject; text: string }>();
  for (const name of COMPANIONS) {
    const result = await loadFixture(name, findings);
    if (result !== null) companions.set(name, result);
  }

  const manifest = manifestResult?.value ?? {};

  /* Manifest envelope and claims. */
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
          "U4_CLAIM_FLAG",
          `${MANIFEST}.${flag}`,
          "The spec packet may not claim implementation, completion, acceptance, or review.",
        );
      }
    }
    if (manifest["implementationStatus"] !== "specified-not-implemented") {
      finding(
        findings,
        "U4_IMPLEMENTATION_STATUS",
        `${MANIFEST}.implementationStatus`,
        "The packet must read specified-not-implemented until the verify leg's recorded acceptance.",
      );
    }
    if (manifest["beadId"] !== "jcpe-milestone-reliable-studio-l3a.12.1") {
      finding(
        findings,
        "U4_BEAD",
        `${MANIFEST}.beadId`,
        "The manifest must name the U4/spec bead.",
      );
    }
    const companionsDeclared = arrayOf(manifest["companions"]).filter(isString);
    if (JSON.stringify(companionsDeclared) !== JSON.stringify([...COMPANIONS])) {
      finding(
        findings,
        "U4_COMPANION_LIST",
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
          "U4_COMPANION_HASH_MISSING",
          `${MANIFEST}.companionSha256.${name}`,
          "Every companion must carry a SHA-256 pin in the manifest.",
        );
        continue;
      }
      if (sha256Hex(companion.text) !== expected) {
        finding(
          findings,
          "U4_COMPANION_HASH_DRIFT",
          name,
          "Companion bytes drifted from the manifest pin.",
        );
      }
    }
  }

  for (const [name, companion] of companions) {
    checkCommonEnvelope(name, companion.value, COMPANION_SCHEMAS[name] ?? "", findings);
  }

  /* Component inventory. */
  const components = arrayOf(manifest["components"]).filter(isObject);
  const componentIds = new Set<string>();
  const componentNames = new Set<string>();
  const surfaces = new Set(
    arrayOf(manifest["surfaces"]).filter(isString),
  );
  for (const component of components) {
    const id = component["id"];
    const name = component["name"];
    const surface = component["surface"];
    if (!isString(id) || !/^U4-CMP-0(0[1-9]|1[0-9]|2[0-2])$/u.test(id)) {
      finding(findings, "U4_COMPONENT_ID", MANIFEST, "Component IDs must be U4-CMP-001…022.");
    } else if (componentIds.has(id)) {
      finding(findings, "U4_COMPONENT_DUPLICATE", id, "Duplicate component ID.");
    }
    if (isString(id)) componentIds.add(id);
    if (!isString(name) || componentNames.has(name)) {
      finding(findings, "U4_COMPONENT_NAME", String(name), "Component names must be unique and nonempty.");
    }
    if (isString(name)) componentNames.add(name);
    if (!isString(surface) || !surfaces.has(surface)) {
      finding(findings, "U4_COMPONENT_SURFACE", String(name), "Component surface must be one of the declared surfaces.");
    }
  }
  if (components.length !== EXPECTED_COMPONENT_COUNT) {
    finding(
      findings,
      "U4_COMPONENT_COUNT",
      MANIFEST,
      `The inventory is closed at ${String(EXPECTED_COMPONENT_COUNT)} components; observed ${String(components.length)}.`,
    );
  }

  /* Operation matrix: rows and the total recomputed enablement matrix. */
  const matrix = companions.get("control-operation-matrix.json")?.value ?? {};
  const operations = arrayOf(matrix["operations"]).filter(isObject);
  const cells = arrayOf(matrix["cells"]).filter(isObject);
  const operationIds = new Set<string>();
  for (const operation of operations) {
    const id = operation["id"];
    if (!isString(id) || operationIds.has(id)) {
      finding(findings, "U4_OPERATION_ID", String(id), "Operation IDs must be unique and nonempty.");
    }
    if (isString(id)) operationIds.add(id);
    const component = operation["component"];
    if (!isString(component) || !componentIds.has(component)) {
      finding(findings, "U4_OPERATION_COMPONENT", String(id), "Every operation must reference an inventoried component.");
    }
    const channel = operation["channel"];
    const controllerIntent = operation["controllerIntent"];
    if (channel === "controller-intent") {
      if (!isString(controllerIntent)) {
        finding(findings, "U4_OPERATION_CHANNEL", String(id), "A controller-intent row must name exactly one controller method.");
      }
    } else if (channel === "presentation-only") {
      if (controllerIntent !== null) {
        finding(findings, "U4_OPERATION_CHANNEL", String(id), "A presentation-only row carries no controller intent.");
      }
    } else {
      finding(findings, "U4_OPERATION_CHANNEL", String(id), "Unknown operation channel.");
    }
    if (operation["keyboardAccess"] === "none" || operation["pointerAlternative"] === "none") {
      finding(findings, "U4_OPERATION_COVERAGE", String(id), "keyboardAccess and pointerAlternative may not be none.");
    }
    const gestureGated = GESTURE_GATED_OPERATIONS.includes(
      id as (typeof GESTURE_GATED_OPERATIONS)[number],
    );
    if (operation["requiresTrustedGesture"] !== gestureGated) {
      finding(
        findings,
        "U4_OPERATION_GESTURE",
        String(id),
        "The trusted-gesture set is exactly play, restart, resume-from-interruption, reinitialize-audio, and section-play.",
      );
    }
    const consumed = new Set(
      arrayOf(manifest["x1CommandKindsConsumed"]).filter(isString),
    );
    for (const kind of arrayOf(operation["x1CommandKinds"]).filter(isString)) {
      if (!consumed.has(kind)) {
        finding(findings, "U4_OPERATION_X1_KIND", `${String(id)}.${kind}`, "Operation X1 kinds must stay inside the consumed subset.");
      }
    }
  }
  if (operations.length !== EXPECTED_OPERATION_COUNT) {
    finding(
      findings,
      "U4_OPERATION_COUNT",
      "control-operation-matrix.json",
      `The operation inventory is closed at ${String(EXPECTED_OPERATION_COUNT)}; observed ${String(operations.length)}.`,
    );
  }

  const expectedCellCount =
    (operations.length - 1) * A0_STATUSES.length * 2 +
    A0_STATUSES.length * 2 * 2;
  if (cells.length !== expectedCellCount) {
    finding(
      findings,
      "U4_MATRIX_TOTALITY",
      "control-operation-matrix.json.cells",
      `The enablement matrix must hold exactly ${String(expectedCellCount)} cells; observed ${String(cells.length)}.`,
    );
  }
  const seenCells = new Set<string>();
  for (const cell of cells) {
    const operationId = cell["operationId"];
    const status = cell["status"];
    const canPlay = cell["canPlay"];
    const failureCode = isString(cell["failureCode"]) ? cell["failureCode"] : null;
    if (
      !isString(operationId) ||
      !operationIds.has(operationId) ||
      !isString(status) ||
      !(A0_STATUSES as readonly string[]).includes(status) ||
      typeof canPlay !== "boolean"
    ) {
      finding(findings, "U4_CELL_IDENTITY", cellKey(cell), "Cell identity must reference a known operation, status, and boolean canPlay.");
      continue;
    }
    const key = cellKey(cell);
    if (seenCells.has(key)) {
      finding(findings, "U4_CELL_DUPLICATE", key, "Duplicate enablement cell.");
      continue;
    }
    seenCells.add(key);
    const operation = operations.find((entry) => entry["id"] === operationId);
    if (operation === undefined) continue;
    const derived = deriveCell(operation, status, canPlay, failureCode);
    if (cell["enabled"] !== derived.enabled) {
      finding(
        findings,
        "U4_CELL_ENABLEMENT",
        key,
        `Cell enablement disagrees with the recomputed law (expected ${String(derived.enabled)}).`,
      );
    }
    if (!derived.enabled) {
      const declaredReason = cell["disabledReason"];
      if (declaredReason !== derived.disabledReason) {
        finding(
          findings,
          "U4_CELL_REASON",
          key,
          "A disabled cell must carry the law's named reason.",
        );
      }
      if (
        !isString(declaredReason) ||
        !(DISABLED_REASONS as readonly string[]).includes(declaredReason)
      ) {
        finding(findings, "U4_CELL_REASON_VOCAB", key, "Disabled reasons must use the frozen vocabulary.");
      }
    } else if ("disabledReason" in cell) {
      finding(findings, "U4_CELL_REASON_PRESENT", key, "An enabled cell carries no disabled reason.");
    }
    if (operationId === "resume-from-interruption" && !isString(cell["failureCode"]) && cell["failureCode"] !== null) {
      finding(findings, "U4_CELL_FAILURE_DIMENSION", key, "The interruption-conditional row must split cells by failureCode.");
    }
  }

  /* Status projection cases. */
  const statusDoc = companions.get("status-projection-cases.json")?.value ?? {};
  const statusCases = arrayOf(statusDoc["cases"]).filter(isObject);
  const statusCaseIds = new Set<string>();
  for (const entry of statusCases) {
    const id = entry["id"];
    if (!isString(id) || statusCaseIds.has(id)) {
      finding(findings, "U4_CASE_ID", String(id), "Case IDs must be unique and nonempty.");
    }
    if (isString(id)) statusCaseIds.add(id);
    if (!isString(entry["given"]) || !isString(entry["expected"])) {
      finding(findings, "U4_CASE_FIELDS", String(id), "Cases must carry given and expected statements.");
    }
  }

  /* Keyboard guard cases. */
  const keyboardDoc = companions.get("keyboard-guard-cases.json")?.value ?? {};
  const keyboardCases = arrayOf(keyboardDoc["cases"]).filter(isObject);
  const keyboardCaseIds = new Set<string>();
  for (const entry of keyboardCases) {
    const id = entry["id"];
    if (!isString(id) || keyboardCaseIds.has(id)) {
      finding(findings, "U4_CASE_ID", String(id), "Case IDs must be unique and nonempty.");
    }
    if (isString(id)) keyboardCaseIds.add(id);
  }
  const declaredConditions = arrayOf(keyboardDoc["guardConditions"]).filter(isString);
  if (JSON.stringify(declaredConditions) !== JSON.stringify([...GUARD_CONDITIONS])) {
    finding(
      findings,
      "U4_GUARD_VOCABULARY",
      "keyboard-guard-cases.json.guardConditions",
      "The guard-condition vocabulary must equal the frozen contract list.",
    );
  }
  const coveredConditions = new Set<string>();
  for (const entry of keyboardCases) {
    for (const condition of arrayOf(entry["coversConditions"]).filter(isString)) {
      coveredConditions.add(condition);
    }
  }
  for (const condition of GUARD_CONDITIONS) {
    if (!coveredConditions.has(condition)) {
      finding(
        findings,
        "U4_GUARD_COVERAGE",
        condition,
        "Every guard condition must be covered by at least one case.",
      );
    }
  }

  /* Layout cells: the complete viewport × pointer product. */
  const layoutDoc = companions.get("layout-cells.json")?.value ?? {};
  const layoutCases = arrayOf(layoutDoc["cells"]).filter(isObject);
  const layoutKeys = new Set<string>();
  const layoutCaseIds = new Set<string>();
  for (const cell of layoutCases) {
    const id = cell["id"];
    if (isString(id)) layoutCaseIds.add(id);
    const viewport = cell["viewport"];
    const pointer = cell["pointer"];
    if (!isString(viewport) || !isString(pointer)) {
      finding(findings, "U4_LAYOUT_IDENTITY", String(id), "Layout cells must name viewport and pointer.");
      continue;
    }
    const key = `${viewport}|${pointer}`;
    if (layoutKeys.has(key)) {
      finding(findings, "U4_LAYOUT_DUPLICATE", key, "Duplicate layout cell.");
    }
    layoutKeys.add(key);
    const expected = cell["expected"];
    if (!isObject(expected) || expected["transportBarVisible"] !== true) {
      finding(findings, "U4_LAYOUT_EXPECTATION", key, "Every cell must assert the bar remains visible.");
    }
  }
  for (const viewport of VIEWPORTS) {
    for (const pointer of POINTER_VARIANTS) {
      if (!layoutKeys.has(`${viewport}|${pointer}`)) {
        finding(
          findings,
          "U4_LAYOUT_TOTALITY",
          `${viewport}|${pointer}`,
          "The layout matrix must cover every viewport × pointer cell.",
        );
      }
    }
  }

  /* Provenance ledger. */
  const provenanceDoc = companions.get("provenance-ledger.json")?.value ?? {};
  const authorities = arrayOf(provenanceDoc["authorities"]).filter(isObject);
  const authorityIds = new Set<string>();
  for (const authority of authorities) {
    const id = authority["id"];
    if (!isString(id) || authorityIds.has(id)) {
      finding(findings, "U4_AUTHORITY_ID", String(id), "Authority IDs must be unique and nonempty.");
    }
    if (isString(id)) authorityIds.add(id);
    if (!isString(authority["reference"])) {
      finding(findings, "U4_AUTHORITY_REFERENCE", String(id), "Every authority must name its reviewed reference.");
    }
  }
  for (const family of arrayOf(provenanceDoc["expectationFamilies"]).filter(isObject)) {
    for (const authorityId of arrayOf(family["authorityIds"]).filter(isString)) {
      if (!authorityIds.has(authorityId)) {
        finding(findings, "U4_FAMILY_AUTHORITY", String(family["family"]), "Expectation families must reference declared authorities.");
      }
    }
  }

  /* Trace ledger: bidirectional case linkage. */
  const traceDoc = companions.get("trace-ledger.json")?.value ?? {};
  const traces = arrayOf(traceDoc["traces"]).filter(isObject);
  const traceIds = new Set<string>();
  const allCaseIds = new Set<string>([
    ...statusCaseIds,
    ...keyboardCaseIds,
    ...layoutCaseIds,
  ]);
  const tracedCaseIds = new Set<string>();
  for (const trace of traces) {
    const id = trace["id"];
    if (!isString(id) || traceIds.has(id)) {
      finding(findings, "U4_TRACE_ID", String(id), "Trace IDs must be unique and nonempty.");
    }
    if (isString(id)) traceIds.add(id);
    const caseIds = arrayOf(trace["caseIds"]).filter(isString);
    if (caseIds.length === 0 && !Array.isArray(trace["matrixOperationIds"])) {
      finding(findings, "U4_TRACE_COVERAGE", String(id), "Every trace must name cases or matrix operations.");
    }
    for (const caseId of caseIds) {
      if (!allCaseIds.has(caseId)) {
        finding(findings, "U4_TRACE_CASE", `${String(id)}.${caseId}`, "Trace case IDs must exist in a companion fixture.");
      }
      tracedCaseIds.add(caseId);
    }
    for (const operationId of arrayOf(trace["matrixOperationIds"]).filter(isString)) {
      if (!operationIds.has(operationId)) {
        finding(findings, "U4_TRACE_OPERATION", `${String(id)}.${operationId}`, "Trace matrix operation IDs must exist in the operation inventory.");
      }
    }
  }
  for (const caseId of allCaseIds) {
    if (!tracedCaseIds.has(caseId)) {
      finding(findings, "U4_CASE_ORPHAN", caseId, "Every fixture case must carry at least one trace.");
    }
  }

  /* Case cross-references: lawIds, traceIds, authorityIds. */
  const manifestLawIds = new Set(arrayOf(manifest["lawIds"]).filter(isString));
  for (const [docName, cases] of [
    ["status-projection-cases.json", statusCases],
    ["keyboard-guard-cases.json", keyboardCases],
  ] as const) {
    for (const entry of cases) {
      for (const lawId of arrayOf(entry["lawIds"]).filter(isString)) {
        if (!manifestLawIds.has(lawId)) {
          finding(findings, "U4_CASE_LAW", `${docName}.${String(entry["id"])}`, "Case lawIds must resolve to the manifest law inventory.");
        }
      }
      for (const traceId of arrayOf(entry["traceIds"]).filter(isString)) {
        if (!traceIds.has(traceId)) {
          finding(findings, "U4_CASE_TRACE", `${docName}.${String(entry["id"])}`, "Case traceIds must resolve to the trace ledger.");
        }
      }
      for (const authorityId of arrayOf(entry["authorityIds"]).filter(isString)) {
        if (!authorityIds.has(authorityId)) {
          finding(findings, "U4_CASE_AUTHORITY", `${docName}.${String(entry["id"])}`, "Case authorityIds must resolve to the provenance ledger.");
        }
      }
    }
  }

  /* Mutation controls. */
  const mutationDoc = companions.get("mutation-controls.json")?.value ?? {};
  const controls = arrayOf(mutationDoc["controls"]).filter(isObject);
  const controlIds = new Set<string>();
  for (const control of controls) {
    const id = control["id"];
    if (!isString(id) || controlIds.has(id)) {
      finding(findings, "U4_MUTATION_ID", String(id), "Mutation control IDs must be unique and nonempty.");
    }
    if (isString(id)) controlIds.add(id);
    const lawId = control["lawId"];
    if (!isString(lawId) || !manifestLawIds.has(lawId)) {
      finding(findings, "U4_MUTATION_LAW", String(id), "Every mutation control must name a manifest law.");
    }
    const killedBy = arrayOf(control["killedBy"]).filter(isString);
    if (killedBy.length === 0) {
      finding(findings, "U4_MUTATION_KILL", String(id), "Every mutation control must name at least one killing case.");
    }
    for (const caseId of killedBy) {
      if (!allCaseIds.has(caseId)) {
        finding(findings, "U4_MUTATION_CASE", `${String(id)}.${caseId}`, "A killing case must exist in a companion fixture.");
      }
    }
    const witness = control["matrixWitness"];
    if (isString(witness)) {
      const match = /^([a-z-]+) x ([a-z]+) = enabled$/u.exec(witness);
      const witnessOperation = match?.[1];
      const witnessStatus = match?.[2];
      const witnessCell = cells.find(
        (cell) =>
          cell["operationId"] === witnessOperation &&
          cell["status"] === witnessStatus &&
          cell["enabled"] === true,
      );
      if (witnessCell === undefined) {
        finding(findings, "U4_MUTATION_WITNESS", String(id), "A matrix witness must name an enabled cell that exists.");
      }
    }
  }

  findings.sort((left, right) =>
    `${left.code}:${left.path}`.localeCompare(`${right.code}:${right.path}`),
  );

  return Object.freeze({
    schema: "changes.validation.u4-contract.v1",
    package: "U4",
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
      enablementCells: cells.length,
      statusCases: statusCases.length,
      keyboardCases: keyboardCases.length,
      layoutCells: layoutCases.length,
      traces: traces.length,
      authorities: authorities.length,
      mutationControls: controls.length,
    }),
    findings: Object.freeze(findings),
  });
}

if (import.meta.main) {
  try {
    const report = await validateU4Contract();
    process.stdout.write(stableJson(report));
    process.exitCode = report.outcome === "pass" ? 0 : 1;
  } catch (error) {
    process.stderr.write(
      stableJson({
        schema: "changes.validation.u4-contract.v1",
        outcome: "tool-failure",
        message:
          error instanceof Error ? error.message : "Unknown U4 validator failure.",
      }),
    );
    process.exitCode = 2;
  }
}
