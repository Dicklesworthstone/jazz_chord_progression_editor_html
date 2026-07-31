/**
 * E0 v2 amendment packet validator (bead jcpe-milestone-reliable-studio-l3a.8.4).
 *
 * Validates the proposed packet under tests/fixtures/interchange-v2/ against
 * independent literal copies restated here — never against the production or
 * contract modules it will one day judge. Follows the edit-plan validator's
 * pending-freeze idiom: `--allow-pending-freeze` suppresses exactly the
 * per-file byte digests, the packet semantic digest, and the frozen pinState
 * requirement, while every structural, semantic, and reciprocity oracle
 * still runs. The gate is not registered in scripts/verify.ts until the
 * packet freezes.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;

export type E0V2ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type E0V2ContractValidationReport = Readonly<{
  schema: "changes.validation.e0-v2-contract.v1";
  package: "E0-v2";
  pinState: string;
  outcome: "pass" | "fail";
  counts: Readonly<{
    companions: number;
    pendingCompanions: number;
    normalizationCases: number;
    resolutionCases: number;
    traces: number;
    authorities: number;
    pendingResolutionRows: number;
  }>;
  findings: readonly E0V2ContractFinding[];
}>;

export type E0V2ContractValidationOptions = Readonly<{
  /**
   * Explicit authoring-only seam. The future release gate never enables
   * this option; it suppresses only the byte/semantic digests and the
   * frozen pinState requirement.
   */
  allowPendingFreeze?: boolean;
  expectedByteDigests?: Readonly<Record<string, string>>;
}>;

const CONTRACT_FILENAME = "e0-v2-interchange-contract.json";

const EXPECTED_COMPANIONS = Object.freeze([
  "normalization-cases.json",
  "resolution-cases.json",
  "trace-ledger.json",
  "provenance-ledger.json",
] as const);

const EXPECTED_PENDING_COMPANIONS = Object.freeze([
  "projection-cases.json",
  "workflow-cases.json",
  "mutation-controls.json",
] as const);

/**
 * Frozen at packet freeze; while the packet is pending these remain the
 * literal sentinel and the digest gates are skipped.
 */
const E0_V2_SPEC_BYTE_DIGESTS: Readonly<Record<string, string>> =
  Object.freeze({
    [CONTRACT_FILENAME]: "pending-validator-freeze",
    "normalization-cases.json": "pending-validator-freeze",
    "resolution-cases.json": "pending-validator-freeze",
    "trace-ledger.json": "pending-validator-freeze",
    "provenance-ledger.json": "pending-validator-freeze",
  });

const E0_V2_SPEC_SEMANTIC_DIGEST = "pending-validator-freeze";

/** Independent copy of the eleven resolution rows (doc section 2). */
const EXPECTED_RESOLUTION_IDS = Object.freeze([
  "E0V2-RES-01-import-request-current-state",
  "E0V2-RES-02-preview-impact-projection",
  "E0V2-RES-03-preview-to-owner-request-projection",
  "E0V2-RES-04-acknowledgement-provenance",
  "E0V2-RES-05-state-free-commit-success",
  "E0V2-RES-06-state-free-commit-refusals",
  "E0V2-RES-07-state-free-publication-protocol-failure",
  "E0V2-RES-08-state-free-marker-path",
  "E0V2-RES-09-widened-preparation-refusals",
  "E0V2-RES-10-replacement-publication-refusals",
  "E0V2-RES-11-state-free-public-marker-requests",
] as const);

/** Independent copy of the owner's twenty preparation refusal codes. */
const EXPECTED_OWNER_PREPARATION_CODES = Object.freeze([
  "import.replacement_request_invalid",
  "import.replacement_request_stale",
  "import.replacement_wrong_document",
  "import.replacement_transition_mismatch",
  "import.replacement_command_id_invalid",
  "import.replacement_command_label_invalid",
  "import.replacement_logical_time_invalid",
  "application.revision_exhausted",
  "application.sequence_exhausted",
  "import.candidate_structural_invalid",
  "import.candidate_semantic_invalid",
  "import.replacement_history_estimate_failed",
  "import.replacement_impact_unavailable",
  "import.replacement_impact_mismatch",
  "import.confirmation_stale",
  "import.confirmation_wrong_document",
  "import.confirmation_impact_mismatch",
  "import.confirmation_identity_mismatch",
  "history.nonundoable_confirmation_required",
  "import.replacement_preparation_busy",
] as const);

/** Independent copy of accepted v1's six preparation codes. */
const EXPECTED_V1_PREPARATION_CODES = Object.freeze([
  "import.confirmation_stale",
  "import.confirmation_wrong_document",
  "import.replacement_impact_unavailable",
  "import.confirmation_impact_mismatch",
  "import.confirmation_identity_mismatch",
  "history.nonundoable_confirmation_required",
] as const);

/** Independent copies for the normalization oracle. */
const EXPECTED_NORMALIZED_PORTS = Object.freeze([
  "prepareImportReplacementPublication",
  "publishImportReplacement",
  "readCurrentApplicationDocumentIdentity",
  "publishCanonicalExportRevision",
] as const);

const EXPECTED_BREACH_STATE_EFFECTS: Readonly<Record<string, string>> =
  Object.freeze({
    prepareImportReplacementPublication: "NONE",
    publishImportReplacement: "APPLICATION_TRANSPORT_RECONCILIATION_REQUIRED",
    readCurrentApplicationDocumentIdentity: "NONE",
    publishCanonicalExportRevision: "APPLICATION_RECONCILIATION_REQUIRED",
  });

const FORBIDDEN_STATE_KEYS = Object.freeze([
  "state",
  "currentState",
  "lastKnownState",
  "observedBefore",
] as const);

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as JsonObject;
  return `{${Object.keys(object)
    .sort(codeUnitCompare)
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function finding(
  findings: E0V2ContractFinding[],
  code: string,
  path: string,
  message: string,
): void {
  findings.push(Object.freeze({ code, path, message }));
}

function stringsAt(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * Deep scan for forbidden state KEYS inside a subtree. Key names only:
 * registry-lifecycle strings and stateEffect VALUES are data, never tripped.
 */
function forbiddenStateKeyPaths(value: unknown, path: string): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      forbiddenStateKeyPaths(item, `${path}[${String(index)}]`),
    );
  }
  if (!isObject(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = `${path}.${key}`;
    const own = (FORBIDDEN_STATE_KEYS as readonly string[]).includes(key)
      ? [childPath]
      : [];
    return [...own, ...forbiddenStateKeyPaths(child, childPath)];
  });
}

function validateNormalizationCases(
  root: JsonObject,
  findings: E0V2ContractFinding[],
): number {
  const cases = Array.isArray(root["cases"]) ? root["cases"] : [];
  const ids = new Set<string>();
  const seenVariantsByPort = new Map<string, Set<string>>();
  for (const [index, raw] of cases.entries()) {
    const path = `normalization-cases.json:$.cases[${String(index)}]`;
    if (!isObject(raw) || typeof raw["id"] !== "string") {
      finding(findings, "E0V2_NORM_CASE_SHAPE", path, "Case requires an id.");
      continue;
    }
    const id = raw["id"];
    if (ids.has(id)) {
      finding(findings, "E0V2_NORM_CASE_DUPLICATE", path, `Duplicate ${id}.`);
    }
    ids.add(id);
    const port = typeof raw["port"] === "string" ? raw["port"] : "";
    const variant = typeof raw["variant"] === "string" ? raw["variant"] : "";
    const expected = isObject(raw["expected"]) ? raw["expected"] : {};
    const isDiscard = port === "discardImportReplacementPublication";
    if (
      !isDiscard &&
      !(EXPECTED_NORMALIZED_PORTS as readonly string[]).includes(port)
    ) {
      finding(findings, "E0V2_NORM_PORT_UNKNOWN", path, `Port ${port}.`);
      continue;
    }
    if (!seenVariantsByPort.has(port)) seenVariantsByPort.set(port, new Set());
    seenVariantsByPort.get(port)?.add(variant);
    const outcome = expected["outcome"];
    const diagnostic = expected["diagnostic"];
    if (isDiscard) {
      if (outcome !== "exact-unwrapped" || diagnostic !== null) {
        finding(
          findings,
          "E0V2_NORM_DISCARD_EXCEPTION",
          path,
          "The discard port is exact and unwrapped; it never normalizes.",
        );
      }
      continue;
    }
    const breachExpected =
      variant !== "exact-success-envelope" &&
      variant !== "exact-refusal-envelope";
    if (breachExpected) {
      const reason =
        variant === "thrown" ? "threw-or-rejected" : "invalid-envelope";
      const expectedDiagnostic = {
        port,
        reason,
        rawResultRetained: false,
      };
      if (
        outcome !== "protocol-invalid" ||
        !jsonEqual(diagnostic, expectedDiagnostic) ||
        expected["stateEffect"] !== EXPECTED_BREACH_STATE_EFFECTS[port]
      ) {
        finding(
          findings,
          "E0V2_NORM_ORACLE",
          path,
          "Breach case must carry the independently recomputed diagnostic and the boundary's reconciliation stateEffect.",
        );
      }
    } else if (outcome !== "normalized" || diagnostic !== null) {
      finding(
        findings,
        "E0V2_NORM_ORACLE",
        path,
        "Exact-envelope case must normalize with a null diagnostic.",
      );
    }
    const statePaths = forbiddenStateKeyPaths(expected, `${path}.expected`);
    if (statePaths.length > 0) {
      finding(
        findings,
        "E0V2_STATE_KEY_FORBIDDEN",
        statePaths[0] ?? path,
        "A v2 expected result may not carry a forbidden state key.",
      );
    }
  }
  for (const port of EXPECTED_NORMALIZED_PORTS) {
    const variants = seenVariantsByPort.get(port) ?? new Set<string>();
    for (const required of ["exact-success-envelope", "thrown"]) {
      if (!variants.has(required)) {
        finding(
          findings,
          "E0V2_NORM_COVERAGE",
          `normalization-cases.json:$.cases`,
          `Port ${port} is missing the ${required} variant.`,
        );
      }
    }
    const hasEnvelopeBreach =
      variants.has("extra-key") ||
      variants.has("missing-key") ||
      variants.has("wrong-kind");
    if (!hasEnvelopeBreach) {
      finding(
        findings,
        "E0V2_NORM_COVERAGE",
        `normalization-cases.json:$.cases`,
        `Port ${port} needs at least one invalid-envelope variant.`,
      );
    }
  }
  return ids.size;
}

const RESOLUTION_CASE_ROWS_EXPECTED = Object.freeze([
  "E0V2-RES-01-import-request-current-state",
  "E0V2-RES-02-preview-impact-projection",
  "E0V2-RES-05-state-free-commit-success",
  "E0V2-RES-06-state-free-commit-refusals",
  "E0V2-RES-07-state-free-publication-protocol-failure",
  "E0V2-RES-09-widened-preparation-refusals",
  "E0V2-RES-10-replacement-publication-refusals",
  "E0V2-RES-11-state-free-public-marker-requests",
] as const);

const OWNER_PUBLICATION_CODES = Object.freeze([
  "import.replacement_preparation_missing",
  "import.replacement_preparation_stale",
  "import.replacement_retirement_mismatch",
] as const);

function validateResolutionCases(
  root: JsonObject,
  findings: E0V2ContractFinding[],
): number {
  const cases = Array.isArray(root["cases"]) ? root["cases"] : [];
  const catalog = isObject(root["literalCatalog"])
    ? root["literalCatalog"]
    : {};
  const ids = new Set<string>();
  const coveredRows = new Set<string>();
  for (const [index, raw] of cases.entries()) {
    const path = `resolution-cases.json:$.cases[${String(index)}]`;
    if (!isObject(raw) || typeof raw["id"] !== "string") {
      finding(findings, "E0V2_RESCASE_SHAPE", path, "Case requires an id.");
      continue;
    }
    if (ids.has(raw["id"])) {
      finding(findings, "E0V2_RESCASE_DUPLICATE", path, raw["id"]);
    }
    ids.add(raw["id"]);
    const resolutionId =
      typeof raw["resolutionId"] === "string" ? raw["resolutionId"] : "";
    coveredRows.add(resolutionId);
    if (!(RESOLUTION_CASE_ROWS_EXPECTED as readonly string[]).includes(resolutionId)) {
      finding(findings, "E0V2_RESCASE_ROW_UNKNOWN", path, resolutionId);
    }
    // The dual smuggle law: a deliberate STATE-smuggle case must actually
    // contain a forbidden state key (it proves the law by construction);
    // every other case must be completely free of them. A documented
    // negative of a DIFFERENT kind (e.g. the unknown-code case) is neither.
    const documentedFailure =
      typeof raw["expectedFixtureFailure"] === "string"
        ? raw["expectedFixtureFailure"]
        : null;
    const deliberate =
      documentedFailure === "E0V2_STATE_KEY_FORBIDDEN" ||
      (documentedFailure === null &&
        (raw["variant"] === "malformed" || isObject(raw["oneFieldNearMiss"])));
    const statePaths = forbiddenStateKeyPaths(raw, path);
    if (deliberate && statePaths.length === 0) {
      finding(
        findings,
        "E0V2_RESCASE_SMUGGLE_MISSING",
        path,
        "A deliberate-smuggle case must materialize the forbidden key it refuses.",
      );
    }
    if (!deliberate && statePaths.length > 0) {
      finding(
        findings,
        "E0V2_STATE_KEY_FORBIDDEN",
        statePaths[0] ?? path,
        "A clean v2 case may not carry a forbidden state key.",
      );
    }
    // Refusal codes surface verbatim from the independent tuples; a code
    // outside them is legal only when the case documents that negative.
    const expectedResult = isObject(raw["expectedResult"])
      ? raw["expectedResult"]
      : null;
    if (expectedResult && typeof expectedResult["code"] === "string") {
      const code = expectedResult["code"];
      const known =
        (EXPECTED_OWNER_PREPARATION_CODES as readonly string[]).includes(code) ||
        (OWNER_PUBLICATION_CODES as readonly string[]).includes(code) ||
        code === "transport.replacement_retirement_refused";
      if (!known && raw["expectedFixtureFailure"] !== "E0V2_RESCASE_CODE_UNKNOWN") {
        finding(findings, "E0V2_RESCASE_CODE_UNKNOWN", path, code);
      }
      if (known && raw["expectedFixtureFailure"] === "E0V2_RESCASE_CODE_UNKNOWN") {
        finding(
          findings,
          "E0V2_RESCASE_CODE_NEGATIVE_INVALID",
          path,
          "The documented-unknown-code case must use a code outside the tuples.",
        );
      }
    }
    if (raw["codeIsMemberOfV1Six"] !== undefined && expectedResult) {
      const code = String(expectedResult["code"]);
      const inSix = (EXPECTED_V1_PREPARATION_CODES as readonly string[]).includes(code);
      if (raw["codeIsMemberOfV1Six"] !== inSix) {
        finding(findings, "E0V2_RESCASE_SUBSET_FLAG", path, code);
      }
    }
  }
  // The groove witness: the catalog's inline candidate must store a
  // non-default groove, independently recomputed against the domain law.
  const witness = isObject(catalog["candidate-groove-witness"])
    ? catalog["candidate-groove-witness"]
    : null;
  const witnessDocument =
    witness && isObject(witness["value"]) ? witness["value"] : null;
  const witnessPlayback =
    witnessDocument && isObject(witnessDocument["playback"])
      ? witnessDocument["playback"]
      : null;
  const storableGrooves = [
    "medium-swing@1",
    "bossa-nova@1",
    "straight-eighths@1",
    "block-chords@1",
  ];
  if (
    witnessPlayback === null ||
    typeof witnessPlayback["grooveStyleId"] !== "string" ||
    !storableGrooves.includes(witnessPlayback["grooveStyleId"]) ||
    witnessPlayback["grooveStyleId"] === "ballad-comp@1"
  ) {
    finding(
      findings,
      "E0V2_GROOVE_WITNESS",
      "resolution-cases.json:$.literalCatalog.candidate-groove-witness",
      "The groove witness must store one of the four non-default groove ids.",
    );
  }
  for (const row of RESOLUTION_CASE_ROWS_EXPECTED) {
    if (!coveredRows.has(row)) {
      finding(
        findings,
        "E0V2_RESCASE_ROW_UNCOVERED",
        "resolution-cases.json:$.cases",
        row,
      );
    }
  }
  return ids.size;
}

export async function validateE0V2Contract(
  fixtureRoot = fileURLToPath(
    new URL("../tests/fixtures/interchange-v2", import.meta.url),
  ),
  options: E0V2ContractValidationOptions = {},
): Promise<E0V2ContractValidationReport> {
  const allowPendingFreeze = options.allowPendingFreeze === true;
  const expectedByteDigests =
    options.expectedByteDigests ?? E0_V2_SPEC_BYTE_DIGESTS;
  const root = resolve(fixtureRoot);
  const findings: E0V2ContractFinding[] = [];

  let filenames: readonly string[] = [];
  try {
    filenames = (await readdir(root))
      .filter((name) => name.endsWith(".json"))
      .sort(codeUnitCompare);
  } catch {
    finding(findings, "E0V2_FIXTURE_ROOT", basename(root), "Unreadable root.");
  }
  const expectedFilenames = [CONTRACT_FILENAME, ...EXPECTED_COMPANIONS].sort(
    codeUnitCompare,
  );
  if (!jsonEqual(filenames, expectedFilenames)) {
    finding(
      findings,
      "E0V2_FILE_INVENTORY",
      basename(root),
      "Packet JSON inventory drifted from the declared companion set.",
    );
  }

  const loaded = new Map<string, JsonObject>();
  for (const filename of expectedFilenames) {
    try {
      const bytes = await readFile(resolve(root, filename));
      if (
        !allowPendingFreeze &&
        sha256(new Uint8Array(bytes)) !== expectedByteDigests[filename]
      ) {
        finding(
          findings,
          "E0V2_BYTE_DIGEST",
          filename,
          "Fixture bytes differ from the frozen pin.",
        );
      }
      const parsed: unknown = JSON.parse(bytes.toString("utf8"));
      if (isObject(parsed)) loaded.set(filename, parsed);
      else finding(findings, "E0V2_ROOT_SHAPE", filename, "Root not object.");
    } catch {
      finding(findings, "E0V2_FILE_UNREADABLE", filename, "Unreadable JSON.");
    }
  }

  const contract = loaded.get(CONTRACT_FILENAME) ?? {};
  const pinState =
    typeof contract["pinState"] === "string"
      ? contract["pinState"]
      : "missing";
  if (
    pinState !== "reviewed-byte-and-semantic-pinned" &&
    !(allowPendingFreeze && pinState === "pending-validator-freeze")
  ) {
    finding(
      findings,
      "E0V2_PIN_STATE",
      `${CONTRACT_FILENAME}.pinState`,
      allowPendingFreeze
        ? "pinState must be reviewed-byte-and-semantic-pinned or pending-validator-freeze."
        : "The frozen gate requires reviewed-byte-and-semantic-pinned.",
    );
  }
  for (const [flag, expected] of [
    ["expectedValuesGenerated", false],
    ["productionOutputUsedAsOracle", false],
    ["semanticBindingRequiresExplicitProjectOwnerAcceptance", true],
  ] as const) {
    if (contract[flag] !== expected) {
      finding(
        findings,
        "E0V2_INDEPENDENCE",
        `${CONTRACT_FILENAME}.${flag}`,
        `Expected ${String(expected)}.`,
      );
    }
  }
  if (contract["implementationStatus"] !== "specified-unimplemented") {
    finding(
      findings,
      "E0V2_IMPLEMENTATION_CLAIM",
      `${CONTRACT_FILENAME}.implementationStatus`,
      "The packet may not claim implementation.",
    );
  }
  if (
    !jsonEqual(contract["conflictResolutionIds"], [...EXPECTED_RESOLUTION_IDS])
  ) {
    finding(
      findings,
      "E0V2_RESOLUTION_INVENTORY",
      `${CONTRACT_FILENAME}.conflictResolutionIds`,
      "The eleven resolution rows drifted.",
    );
  }
  const refusalAdoption = isObject(contract["refusalAdoption"])
    ? contract["refusalAdoption"]
    : {};
  const v1Codes = stringsAt(refusalAdoption["v1PreparationCodesProvenMembers"]);
  if (
    refusalAdoption["preparationCodesAdoptedFromOwner"] !==
      EXPECTED_OWNER_PREPARATION_CODES.length ||
    refusalAdoption["publicationCodesAdoptedFromOwner"] !== 3 ||
    !jsonEqual(v1Codes, [...EXPECTED_V1_PREPARATION_CODES]) ||
    !v1Codes.every((code) =>
      (EXPECTED_OWNER_PREPARATION_CODES as readonly string[]).includes(code),
    )
  ) {
    finding(
      findings,
      "E0V2_REFUSAL_ADOPTION",
      `${CONTRACT_FILENAME}.refusalAdoption`,
      "Owner 20/3 adoption or the six-in-twenty subset relation drifted.",
    );
  }
  const declaredPending = stringsAt(contract["pendingCompanions"]);
  if (!jsonEqual(declaredPending, [...EXPECTED_PENDING_COMPANIONS])) {
    finding(
      findings,
      "E0V2_PENDING_INVENTORY",
      `${CONTRACT_FILENAME}.pendingCompanions`,
      "Pending-companion declaration drifted.",
    );
  }
  const pendingResolutions = stringsAt(contract["pendingResolutionCoverage"]);
  if (
    !allowPendingFreeze &&
    (pendingResolutions.length > 0 || declaredPending.length > 0)
  ) {
    finding(
      findings,
      "E0V2_FROZEN_PENDING",
      CONTRACT_FILENAME,
      "A frozen packet may declare nothing pending.",
    );
  }
  for (const id of pendingResolutions) {
    if (!(EXPECTED_RESOLUTION_IDS as readonly string[]).includes(id)) {
      finding(
        findings,
        "E0V2_PENDING_UNKNOWN",
        `${CONTRACT_FILENAME}.pendingResolutionCoverage`,
        `Unknown resolution ${id}.`,
      );
    }
  }

  const normalizationRoot = loaded.get("normalization-cases.json") ?? {};
  const normalizationCases = validateNormalizationCases(
    normalizationRoot,
    findings,
  );
  const resolutionRoot = loaded.get("resolution-cases.json") ?? {};
  const resolutionCases = validateResolutionCases(resolutionRoot, findings);

  const traceRoot = loaded.get("trace-ledger.json") ?? {};
  const traces = Array.isArray(traceRoot["traces"]) ? traceRoot["traces"] : [];
  const provenanceRoot = loaded.get("provenance-ledger.json") ?? {};
  const authorities = Array.isArray(provenanceRoot["authorities"])
    ? provenanceRoot["authorities"]
    : [];
  const authorityIds = new Set(
    authorities
      .filter(isObject)
      .map((row) => row["id"])
      .filter((id): id is string => typeof id === "string"),
  );
  const caseIds = new Set(
    [
      ...(Array.isArray(normalizationRoot["cases"])
        ? normalizationRoot["cases"]
        : []),
      ...(Array.isArray(resolutionRoot["cases"])
        ? resolutionRoot["cases"]
        : []),
    ]
      .filter(isObject)
      .map((row) => row["id"])
      .filter((id): id is string => typeof id === "string"),
  );
  const coveredResolutions = new Set<string>();
  const referencedCaseIds = new Set<string>();
  for (const [index, raw] of traces.entries()) {
    const path = `trace-ledger.json:$.traces[${String(index)}]`;
    if (!isObject(raw) || typeof raw["id"] !== "string") {
      finding(findings, "E0V2_TRACE_SHAPE", path, "Trace requires an id.");
      continue;
    }
    for (const resolution of stringsAt(raw["resolutionIds"])) {
      coveredResolutions.add(resolution);
      if (!(EXPECTED_RESOLUTION_IDS as readonly string[]).includes(resolution)) {
        finding(findings, "E0V2_TRACE_RESOLUTION", path, resolution);
      }
    }
    const linkedCases = stringsAt(raw["caseIds"]);
    const pendingFamilies = stringsAt(raw["pendingCaseFamilies"]);
    if (linkedCases.length === 0 && pendingFamilies.length === 0) {
      finding(
        findings,
        "E0V2_TRACE_EVIDENCE",
        path,
        "A trace needs literal cases or a declared-pending family.",
      );
    }
    if (!allowPendingFreeze && pendingFamilies.length > 0) {
      finding(
        findings,
        "E0V2_FROZEN_PENDING",
        path,
        "A frozen packet may not carry pending trace families.",
      );
    }
    for (const family of pendingFamilies) {
      if (!(EXPECTED_PENDING_COMPANIONS as readonly string[]).includes(family)) {
        finding(findings, "E0V2_TRACE_PENDING_FAMILY", path, family);
      }
    }
    for (const linked of linkedCases) {
      referencedCaseIds.add(linked);
      if (!caseIds.has(linked)) {
        finding(findings, "E0V2_TRACE_CASE_MISSING", path, linked);
      }
    }
    for (const authority of stringsAt(raw["authorityIds"])) {
      if (!authorityIds.has(authority)) {
        finding(findings, "E0V2_TRACE_AUTHORITY_MISSING", path, authority);
      }
    }
  }
  for (const id of caseIds) {
    if (!referencedCaseIds.has(id)) {
      finding(
        findings,
        "E0V2_CASE_UNTRACED",
        `normalization-cases.json#${id}`,
        "Every case must be reachable from a trace.",
      );
    }
  }
  for (const resolution of EXPECTED_RESOLUTION_IDS) {
    if (
      !coveredResolutions.has(resolution) &&
      !pendingResolutions.includes(resolution)
    ) {
      finding(
        findings,
        "E0V2_RESOLUTION_UNCOVERED",
        "trace-ledger.json",
        `${resolution} has neither trace coverage nor a pending declaration.`,
      );
    }
  }

  const counts = {
    companions: EXPECTED_COMPANIONS.length,
    pendingCompanions: declaredPending.length,
    normalizationCases,
    resolutionCases,
    traces: traces.length,
    authorities: authorities.length,
    pendingResolutionRows: pendingResolutions.length,
  };
  const declaredCounts = isObject(contract["counts"]) ? contract["counts"] : {};
  if (
    declaredCounts["normalizationCases"] !== counts.normalizationCases ||
    declaredCounts["resolutionCases"] !== counts.resolutionCases ||
    declaredCounts["traces"] !== counts.traces ||
    declaredCounts["authorities"] !== counts.authorities
  ) {
    finding(
      findings,
      "E0V2_COUNTS",
      `${CONTRACT_FILENAME}.counts`,
      "Declared counts must match the independently indexed inventory even during pending freeze.",
    );
  }

  if (!allowPendingFreeze) {
    const semanticPacket = Object.fromEntries(
      expectedFilenames.map((filename) => [
        filename,
        loaded.get(filename) ?? null,
      ]),
    );
    if (
      sha256(new TextEncoder().encode(stableJson(semanticPacket))) !==
      E0_V2_SPEC_SEMANTIC_DIGEST
    ) {
      finding(
        findings,
        "E0V2_SEMANTIC_DIGEST",
        basename(root),
        "Parsed packet differs from the frozen semantic pin.",
      );
    }
  }

  const sorted = [...findings].sort(
    (left, right) =>
      codeUnitCompare(left.path, right.path) ||
      codeUnitCompare(left.code, right.code),
  );
  return Object.freeze({
    schema: "changes.validation.e0-v2-contract.v1",
    package: "E0-v2",
    pinState,
    outcome: sorted.length === 0 ? "pass" : "fail",
    counts: Object.freeze(counts),
    findings: Object.freeze(sorted),
  });
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const allowPendingFreeze = args.includes("--allow-pending-freeze");
  const fixtureRoot = args.find((arg) => !arg.startsWith("--"));
  const report = await validateE0V2Contract(fixtureRoot, {
    allowPendingFreeze,
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome !== "pass") process.exitCode = 1;
}
