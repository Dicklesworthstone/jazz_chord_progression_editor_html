/**
 * G6 Guide-Tone Designer and Contextual Color Laboratory Contract Validator.
 *
 * Independent validator that verifies the integrity, schema compliance,
 * case coverage, provenance, trace links, and mutation resistance of the G6 fixtures
 * under tests/fixtures/guide-tones/ without importing production source.
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type G6ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type G6ContractValidationReport = Readonly<{
  schema: "changes.validation.g6-contract.v1";
  package: "G6";
  outcome: "pass" | "fail";
  counts: Readonly<{
    files: number;
    guideToneCases: number;
    colorLabCases: number;
    upperStructureCatalog: number;
    mutationControls: number;
    authorities: number;
    traces: number;
  }>;
  findings: readonly G6ContractFinding[];
}>;

type JsonObject = Record<string, unknown>;

function isObject(val: unknown): val is JsonObject {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function getString(obj: JsonObject, key: string): string {
  const val = obj[key];
  return typeof val === "string" ? val : "";
}

function getNumber(obj: JsonObject, key: string): number {
  const val = obj[key];
  return typeof val === "number" ? val : 0;
}

function getArray(obj: JsonObject, key: string): readonly unknown[] {
  const val = obj[key];
  return Array.isArray(val) ? val : [];
}

function getObject(obj: JsonObject, key: string): JsonObject {
  const val = obj[key];
  return isObject(val) ? val : {};
}

const DEFAULT_FIXTURE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../tests/fixtures/guide-tones",
);

export async function validateG6Contract(
  fixtureRoot: string = DEFAULT_FIXTURE_ROOT,
): Promise<G6ContractValidationReport> {
  const findings: G6ContractFinding[] = [];

  async function loadJson(filename: string): Promise<JsonObject | null> {
    try {
      const content = await readFile(resolve(fixtureRoot, filename), "utf8");
      const parsed: unknown = JSON.parse(content);
      if (isObject(parsed)) {
        return parsed;
      }
      findings.push({
        code: "G6_FILE_NOT_OBJECT",
        path: filename,
        message: "Expected JSON root to be an object",
      });
      return null;
    } catch (error) {
      findings.push({
        code: "G6_FILE_READ_ERROR",
        path: filename,
        message: `Failed to read or parse fixture file: ${String(error)}`,
      });
      return null;
    }
  }

  const contract = await loadJson("g6-guide-tones-contract.json");
  const guideToneCases = await loadJson("guide-tone-cases.json");
  const colorLabCases = await loadJson("color-lab-cases.json");
  const mutationControls = await loadJson("mutation-controls.json");
  const provenanceLedger = await loadJson("provenance-ledger.json");
  const traceLedger = await loadJson("trace-ledger.json");

  if (
    !contract ||
    !guideToneCases ||
    !colorLabCases ||
    !mutationControls ||
    !provenanceLedger ||
    !traceLedger
  ) {
    return {
      schema: "changes.validation.g6-contract.v1",
      package: "G6",
      outcome: "fail",
      counts: {
        files: 0,
        guideToneCases: 0,
        colorLabCases: 0,
        upperStructureCatalog: 0,
        mutationControls: 0,
        authorities: 0,
        traces: 0,
      },
      findings,
    };
  }

  // 1. Validate contract constants
  const contractId = getString(contract, "contractId");
  if (contractId !== "changes.theory.g6-contract.v1") {
    findings.push({
      code: "G6_CONTRACT_ID_MISMATCH",
      path: "g6-guide-tones-contract.json:contractId",
      message: `Expected changes.theory.g6-contract.v1, got ${contractId}`,
    });
  }
  const version = getNumber(contract, "version");
  if (version !== 1) {
    findings.push({
      code: "G6_CONTRACT_VERSION_MISMATCH",
      path: "g6-guide-tones-contract.json:version",
      message: `Expected version 1, got ${String(version)}`,
    });
  }

  const roles = getArray(contract, "roles").filter(
    (r): r is string => typeof r === "string",
  );
  const requiredRoles = ["third", "seventh", "suspension", "essential-color"];
  if (
    !requiredRoles.every((r) => roles.includes(r)) ||
    roles.length !== requiredRoles.length
  ) {
    findings.push({
      code: "G6_ROLE_SET_CORRUPTED",
      path: "g6-guide-tones-contract.json:roles",
      message: "Role set does not match required vocabulary",
    });
  }

  const motionKinds = getArray(contract, "motionKinds").filter(
    (m): m is string => typeof m === "string",
  );
  const requiredMotionKinds = [
    "contrary",
    "oblique",
    "similar",
    "parallel",
    "common-tone",
    "step-resolution",
    "leap",
    "entering",
    "leaving",
  ];
  if (
    !requiredMotionKinds.every((m) => motionKinds.includes(m)) ||
    motionKinds.length !== requiredMotionKinds.length
  ) {
    findings.push({
      code: "G6_MOTION_KINDS_CORRUPTED",
      path: "g6-guide-tones-contract.json:motionKinds",
      message: "Motion kinds do not match required vocabulary",
    });
  }

  const tensions = getArray(contract, "tensionDegrees").filter(
    (t): t is string => typeof t === "string",
  );
  const requiredTensions = ["9", "b9", "#9", "11", "#11", "13", "b13"];
  if (
    !requiredTensions.every((t) => tensions.includes(t)) ||
    tensions.length !== requiredTensions.length
  ) {
    findings.push({
      code: "G6_TENSION_DEGREES_CORRUPTED",
      path: "g6-guide-tones-contract.json:tensionDegrees",
      message: "Tension degrees do not match required vocabulary",
    });
  }

  const limits = getObject(contract, "limits");
  if (
    getNumber(limits, "maxProgressionEvents") !== 64 ||
    getNumber(limits, "maxTotalWorkSteps") !== 8192
  ) {
    findings.push({
      code: "G6_LIMIT_DRIFT",
      path: "g6-guide-tones-contract.json:limits",
      message: "Limits do not match specification",
    });
  }

  // 2. Validate Upper Structure Catalog
  const ustCatalog = getArray(contract, "upperStructureCatalog").filter(
    isObject,
  );
  if (ustCatalog.length < 5) {
    findings.push({
      code: "G6_UST_CATALOG_CORRUPTED",
      path: "g6-guide-tones-contract.json:upperStructureCatalog",
      message: "UST catalog incomplete",
    });
  } else {
    for (const ust of ustCatalog) {
      const ustId = getString(ust, "id");
      const numeral = getString(ust, "numeral");
      const quality = getString(ust, "quality");
      const ustTensions = getArray(ust, "tensions");
      if (!ustId || !numeral || !quality || ustTensions.length === 0) {
        findings.push({
          code: "G6_UST_CATALOG_CORRUPTED",
          path: `g6-guide-tones-contract.json:upperStructureCatalog:${ustId}`,
          message: "Malformed UST catalog entry",
        });
      }
    }
  }

  // 3. Validate Cases
  const guideCaseIds = new Set<string>();
  const guideCasesArray = getArray(guideToneCases, "cases").filter(isObject);
  for (const c of guideCasesArray) {
    const caseId = getString(c, "id");
    guideCaseIds.add(caseId);
    const chords = getArray(c, "chords");
    const extractions = getArray(c, "expectedExtractions");
    if (!caseId || chords.length === 0 || extractions.length === 0) {
      findings.push({
        code: "G6_CASE_MALFORMED",
        path: `guide-tone-cases.json:${caseId}`,
        message: "Malformed guide tone case",
      });
    }
  }

  const colorCaseIds = new Set<string>();
  const colorCasesArray = getArray(colorLabCases, "cases").filter(isObject);
  for (const c of colorCasesArray) {
    const caseId = getString(c, "id");
    colorCaseIds.add(caseId);
    const chord = getString(c, "chord");
    const colorOptions = getArray(c, "expectedColorOptions");
    if (!caseId || !chord || colorOptions.length === 0) {
      findings.push({
        code: "G6_COLOR_CASE_MALFORMED",
        path: `color-lab-cases.json:${caseId}`,
        message: "Malformed color lab case",
      });
    }
  }

  // 4. Validate Authorities & Traces
  const authorityIds = new Set<string>();
  const authoritiesArray = getArray(provenanceLedger, "authorities").filter(
    isObject,
  );
  for (const a of authoritiesArray) {
    const authId = getString(a, "id");
    authorityIds.add(authId);
    const citation = getString(a, "citation");
    const domains = getArray(a, "domains");
    if (!authId || !citation || domains.length === 0) {
      findings.push({
        code: "G6_PROVENANCE_MALFORMED",
        path: `provenance-ledger.json:${authId}`,
        message: "Malformed authority record",
      });
    }
  }

  const tracesArray = getArray(traceLedger, "traces").filter(isObject);
  for (const t of tracesArray) {
    const reqId = getString(t, "requirementId");
    const fixtureCases = getArray(t, "fixtureCases").filter(
      (f): f is string => typeof f === "string",
    );
    const authorities = getArray(t, "authorities").filter(
      (a): a is string => typeof a === "string",
    );
    if (!reqId || fixtureCases.length === 0 || authorities.length === 0) {
      findings.push({
        code: "G6_TRACE_MALFORMED",
        path: `trace-ledger.json:${reqId}`,
        message: "Malformed trace record",
      });
      continue;
    }
    for (const auth of authorities) {
      if (!authorityIds.has(auth)) {
        findings.push({
          code: "G6_TRACE_UNKNOWN_AUTHORITY",
          path: `trace-ledger.json:${reqId}`,
          message: `Trace references unknown authority: ${auth}`,
        });
      }
    }
    for (const fc of fixtureCases) {
      if (!guideCaseIds.has(fc) && !colorCaseIds.has(fc)) {
        findings.push({
          code: "G6_TRACE_UNKNOWN_CASE",
          path: `trace-ledger.json:${reqId}`,
          message: `Trace references unknown fixture case: ${fc}`,
        });
      }
    }
  }

  // 5. Verify Mutation Controls
  const controlsArray = getArray(mutationControls, "controls").filter(isObject);
  for (const ctrl of controlsArray) {
    const ctrlId = getString(ctrl, "id");
    const targetFile = getString(ctrl, "targetFile");
    const mutationPath = getString(ctrl, "mutationPath");
    const expectedFinding = getString(ctrl, "expectedFinding");
    if (!ctrlId || !targetFile || !mutationPath || !expectedFinding) {
      findings.push({
        code: "G6_MUTATION_CONTROL_MALFORMED",
        path: `mutation-controls.json:${ctrlId}`,
        message: "Malformed mutation control record",
      });
    }
  }

  const outcome = findings.length === 0 ? "pass" : "fail";
  return {
    schema: "changes.validation.g6-contract.v1",
    package: "G6",
    outcome,
    counts: {
      files: getArray(contract, "declaredFiles").length,
      guideToneCases: guideCasesArray.length,
      colorLabCases: colorCasesArray.length,
      upperStructureCatalog: ustCatalog.length,
      mutationControls: controlsArray.length,
      authorities: authoritiesArray.length,
      traces: tracesArray.length,
    },
    findings,
  };
}

if (import.meta.main) {
  const report = await validateG6Contract();
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome !== "pass") {
    process.exit(1);
  }
}
