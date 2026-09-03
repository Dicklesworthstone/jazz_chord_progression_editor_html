import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  H1_SPELLED_TRANSPOSITION_SCHEMA,
  H1_TRANSFORM_LAW_SCHEMA,
  H1_TRANSFORM_RESULT_SCHEMA,
  MAX_H1_EDIT_PLAN_OPERATIONS,
  MAX_H1_LAWS_PER_CANDIDATE,
  MAX_H1_TRANSFORM_EVENTS,
} from "../src/theory";

interface ValidationFinding {
  readonly path: string;
  readonly message: string;
}

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../tests/fixtures/transform-laws",
);

async function loadJson(filename: string): Promise<unknown> {
  const fullPath = resolve(FIXTURE_DIR, filename);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function validateH1Contract(): Promise<{
  readonly schema: string;
  readonly package: string;
  readonly outcome: "pass" | "fail";
  readonly counts: {
    readonly files: number;
    readonly transformCases: number;
    readonly transpositionCases: number;
    readonly registeredLaws: number;
    readonly mutationControls: number;
    readonly authorities: number;
    readonly traces: number;
  };
  readonly findings: readonly ValidationFinding[];
}> {
  const findings: ValidationFinding[] = [];

  // 1. Contract metadata
  const contractRaw = await loadJson("h1-transform-contract.json");
  let registeredLawsCount = 0;

  if (!isRecord(contractRaw)) {
    findings.push({ path: "h1-transform-contract.json", message: "Root must be an object" });
  } else {
    if (contractRaw["package"] !== "H1") {
      findings.push({ path: "h1-transform-contract.json.package", message: "Package must be 'H1'" });
    }

    const schemas = contractRaw["schemas"];
    if (!isRecord(schemas)) {
      findings.push({ path: "h1-transform-contract.json.schemas", message: "schemas must be an object" });
    } else {
      if (schemas["transformLaw"] !== H1_TRANSFORM_LAW_SCHEMA) {
        findings.push({ path: "schemas.transformLaw", message: `Expected ${H1_TRANSFORM_LAW_SCHEMA}` });
      }
      if (schemas["transformResult"] !== H1_TRANSFORM_RESULT_SCHEMA) {
        findings.push({ path: "schemas.transformResult", message: `Expected ${H1_TRANSFORM_RESULT_SCHEMA}` });
      }
      if (schemas["spelledTransposition"] !== H1_SPELLED_TRANSPOSITION_SCHEMA) {
        findings.push({ path: "schemas.spelledTransposition", message: `Expected ${H1_SPELLED_TRANSPOSITION_SCHEMA}` });
      }
    }

    const limits = contractRaw["limits"];
    if (!isRecord(limits)) {
      findings.push({ path: "h1-transform-contract.json.limits", message: "limits must be an object" });
    } else {
      if (limits["maxProgressionEvents"] !== MAX_H1_TRANSFORM_EVENTS) {
        findings.push({ path: "limits.maxProgressionEvents", message: `Expected ${String(MAX_H1_TRANSFORM_EVENTS)}` });
      }
      if (limits["maxLawsPerCandidate"] !== MAX_H1_LAWS_PER_CANDIDATE) {
        findings.push({ path: "limits.maxLawsPerCandidate", message: `Expected ${String(MAX_H1_LAWS_PER_CANDIDATE)}` });
      }
      if (limits["maxEditPlanOperations"] !== MAX_H1_EDIT_PLAN_OPERATIONS) {
        findings.push({ path: "limits.maxEditPlanOperations", message: `Expected ${String(MAX_H1_EDIT_PLAN_OPERATIONS)}` });
      }
    }

    const laws = contractRaw["registeredLaws"];
    if (Array.isArray(laws)) {
      registeredLawsCount = laws.length;
    }
  }

  // 2. Transform cases
  const transformCasesRaw = await loadJson("transform-law-cases.json");
  let transformCasesCount = 0;
  if (!isRecord(transformCasesRaw) || !Array.isArray(transformCasesRaw["cases"])) {
    findings.push({ path: "transform-law-cases.json.cases", message: "cases must be an array" });
  } else {
    const cases = transformCasesRaw["cases"] as readonly unknown[];
    transformCasesCount = cases.length;
    for (let i = 0; i < cases.length; i++) {
      const c: unknown = cases[i];
      if (!isRecord(c)) {
        findings.push({ path: `transform-law-cases.cases[${String(i)}]`, message: "case must be an object" });
        continue;
      }
      if (typeof c["id"] !== "string" || !c["id"].startsWith("H1_CASE_")) {
        findings.push({ path: `transform-law-cases.cases[${String(i)}].id`, message: "Invalid case ID prefix" });
      }
      if (!Array.isArray(c["inputProgression"]) || c["inputProgression"].length === 0) {
        findings.push({ path: `transform-law-cases.cases[${String(i)}].inputProgression`, message: "inputProgression must be non-empty" });
      }
    }
  }

  // 3. Spelled transposition cases
  const transpositionCasesRaw = await loadJson("spelled-transposition-cases.json");
  let transpositionCasesCount = 0;
  if (!isRecord(transpositionCasesRaw) || !Array.isArray(transpositionCasesRaw["cases"])) {
    findings.push({ path: "spelled-transposition-cases.json.cases", message: "cases must be an array" });
  } else {
    const cases = transpositionCasesRaw["cases"] as readonly unknown[];
    transpositionCasesCount = cases.length;
    for (let i = 0; i < cases.length; i++) {
      const c: unknown = cases[i];
      if (!isRecord(c)) {
        findings.push({ path: `spelled-transposition-cases.cases[${String(i)}]`, message: "case must be an object" });
        continue;
      }
      if (typeof c["id"] !== "string" || !c["id"].startsWith("TRANSPOSE_")) {
        findings.push({ path: `spelled-transposition-cases.cases[${String(i)}].id`, message: "Invalid transpose case ID" });
      }
      if (!isRecord(c["interval"])) {
        findings.push({ path: `spelled-transposition-cases.cases[${String(i)}].interval`, message: "interval must be an object" });
      }
    }
  }

  // 4. Mutation controls
  const mutationsRaw = await loadJson("mutation-controls.json");
  let mutationControlsCount = 0;
  if (!isRecord(mutationsRaw) || !Array.isArray(mutationsRaw["mutationControls"])) {
    findings.push({ path: "mutation-controls.json.mutationControls", message: "mutationControls must be an array" });
  } else {
    const controls = mutationsRaw["mutationControls"] as readonly unknown[];
    mutationControlsCount = controls.length;
    for (let i = 0; i < controls.length; i++) {
      const mc: unknown = controls[i];
      if (!isRecord(mc) || typeof mc["expectedRefusal"] !== "string") {
        findings.push({ path: `mutation-controls[${String(i)}]`, message: "Invalid mutation control entry" });
      }
    }
  }

  // 5. Provenance ledger
  const provenanceRaw = await loadJson("provenance-ledger.json");
  let authoritiesCount = 0;
  if (!isRecord(provenanceRaw) || !Array.isArray(provenanceRaw["authorities"])) {
    findings.push({ path: "provenance-ledger.json.authorities", message: "authorities must be an array" });
  } else {
    authoritiesCount = provenanceRaw["authorities"].length;
  }

  // 6. Trace ledger
  const traceRaw = await loadJson("trace-ledger.json");
  let tracesCount = 0;
  if (!isRecord(traceRaw) || !Array.isArray(traceRaw["traces"])) {
    findings.push({ path: "trace-ledger.json.traces", message: "traces must be an array" });
  } else {
    tracesCount = traceRaw["traces"].length;
  }

  const outcome = findings.length === 0 ? "pass" : "fail";

  return {
    schema: "changes.validation.h1-contract.v1",
    package: "H1",
    outcome,
    counts: {
      files: 6,
      transformCases: transformCasesCount,
      transpositionCases: transpositionCasesCount,
      registeredLaws: registeredLawsCount,
      mutationControls: mutationControlsCount,
      authorities: authoritiesCount,
      traces: tracesCount,
    },
    findings,
  };
}

if (import.meta.main) {
  validateH1Contract()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (report.outcome !== "pass") {
        process.exit(1);
      }
    })
    .catch((err: unknown) => {
      console.error("H1 Contract Validation failed:", err);
      process.exit(1);
    });
}
