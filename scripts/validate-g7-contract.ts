import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  G7_RHYTHM_TRANSFORM_SCHEMA,
  G7_TENSION_CURVE_SCHEMA,
  MAX_G7_PROGRESSION_EVENTS,
  MAX_G7_TENSION_POINTS,
} from "../src/theory";

interface ValidationFinding {
  readonly path: string;
  readonly message: string;
}

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../tests/fixtures/rhythm-transforms",
);

async function loadJson(filename: string): Promise<unknown> {
  const fullPath = resolve(FIXTURE_DIR, filename);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function validateG7Contract(): Promise<{
  readonly schema: string;
  readonly package: string;
  readonly outcome: "pass" | "fail";
  readonly counts: {
    readonly files: number;
    readonly transformCases: number;
    readonly mutationControls: number;
    readonly authorities: number;
    readonly traces: number;
  };
  readonly findings: readonly ValidationFinding[];
}> {
  const findings: ValidationFinding[] = [];

  // 1. Contract metadata
  const contractRaw = await loadJson("g7-rhythm-transforms-contract.json");
  if (!isRecord(contractRaw)) {
    findings.push({ path: "g7-rhythm-transforms-contract.json", message: "Root must be an object" });
  } else {
    if (contractRaw["package"] !== "G7") {
      findings.push({ path: "g7-rhythm-transforms-contract.json.package", message: "Package must be 'G7'" });
    }

    const schemas = contractRaw["schemas"];
    if (!isRecord(schemas)) {
      findings.push({ path: "g7-rhythm-transforms-contract.json.schemas", message: "schemas must be an object" });
    } else {
      if (schemas["tensionCurve"] !== G7_TENSION_CURVE_SCHEMA) {
        findings.push({ path: "schemas.tensionCurve", message: `Expected ${G7_TENSION_CURVE_SCHEMA}` });
      }
      if (schemas["rhythmTransform"] !== G7_RHYTHM_TRANSFORM_SCHEMA) {
        findings.push({ path: "schemas.rhythmTransform", message: `Expected ${G7_RHYTHM_TRANSFORM_SCHEMA}` });
      }
    }

    const limits = contractRaw["limits"];
    if (!isRecord(limits)) {
      findings.push({ path: "g7-rhythm-transforms-contract.json.limits", message: "limits must be an object" });
    } else {
      if (limits["maxProgressionEvents"] !== MAX_G7_PROGRESSION_EVENTS) {
        findings.push({ path: "limits.maxProgressionEvents", message: `Expected ${String(MAX_G7_PROGRESSION_EVENTS)}` });
      }
      if (limits["maxTensionPoints"] !== MAX_G7_TENSION_POINTS) {
        findings.push({ path: "limits.maxTensionPoints", message: `Expected ${String(MAX_G7_TENSION_POINTS)}` });
      }
    }
  }

  // 2. Transform cases
  const casesRaw = await loadJson("rhythm-transform-cases.json");
  let transformCasesCount = 0;
  if (!isRecord(casesRaw) || !Array.isArray(casesRaw["cases"])) {
    findings.push({ path: "rhythm-transform-cases.json.cases", message: "cases must be an array" });
  } else {
    const cases = casesRaw["cases"] as readonly unknown[];
    transformCasesCount = cases.length;
    for (let i = 0; i < cases.length; i++) {
      const c: unknown = cases[i];
      if (!isRecord(c)) {
        findings.push({ path: `rhythm-transform-cases.cases[${String(i)}]`, message: "case must be an object" });
        continue;
      }
      if (typeof c["id"] !== "string" || (!c["id"].startsWith("CASE_RHYTHM_") && !c["id"].startsWith("CASE_TENSION_"))) {
        findings.push({ path: `rhythm-transform-cases.cases[${String(i)}].id`, message: "Invalid case ID prefix" });
      }
      if (!Array.isArray(c["inputEvents"]) || c["inputEvents"].length === 0) {
        findings.push({ path: `rhythm-transform-cases.cases[${String(i)}].inputEvents`, message: "inputEvents must be non-empty" });
      }
    }
  }

  // 3. Mutation controls
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

  // 4. Provenance ledger
  const provenanceRaw = await loadJson("provenance-ledger.json");
  let authoritiesCount = 0;
  if (!isRecord(provenanceRaw) || !Array.isArray(provenanceRaw["authorities"])) {
    findings.push({ path: "provenance-ledger.json.authorities", message: "authorities must be an array" });
  } else {
    authoritiesCount = provenanceRaw["authorities"].length;
  }

  // 5. Trace ledger
  const traceRaw = await loadJson("trace-ledger.json");
  let tracesCount = 0;
  if (!isRecord(traceRaw) || !Array.isArray(traceRaw["traces"])) {
    findings.push({ path: "trace-ledger.json.traces", message: "traces must be an array" });
  } else {
    tracesCount = traceRaw["traces"].length;
  }

  const outcome = findings.length === 0 ? "pass" : "fail";

  return {
    schema: "changes.validation.g7-contract.v1",
    package: "G7",
    outcome,
    counts: {
      files: 5,
      transformCases: transformCasesCount,
      mutationControls: mutationControlsCount,
      authorities: authoritiesCount,
      traces: tracesCount,
    },
    findings,
  };
}

if (import.meta.main) {
  validateG7Contract()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (report.outcome !== "pass") {
        process.exit(1);
      }
    })
    .catch((err: unknown) => {
      console.error("G7 Contract Validation failed:", err);
      process.exit(1);
    });
}
