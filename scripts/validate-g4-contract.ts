import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  G4_HARMONIZATION_RESULT_SCHEMA,
  MAX_G4_CANDIDATES_PER_SLOT,
  MAX_G4_SEARCH_STATES,
  MAX_G4_SLOTS,
  MAX_G4_SOLUTIONS,
} from "../src/theory";

interface ValidationFinding {
  readonly path: string;
  readonly message: string;
}

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../tests/fixtures/harmonization",
);

async function loadJson(filename: string): Promise<unknown> {
  const fullPath = resolve(FIXTURE_DIR, filename);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function validateG4Contract(): Promise<{
  readonly schema: string;
  readonly package: string;
  readonly outcome: "pass" | "fail";
  readonly counts: {
    readonly files: number;
    readonly harmonizationCases: number;
    readonly mutationControls: number;
    readonly authorities: number;
    readonly traces: number;
  };
  readonly findings: readonly ValidationFinding[];
}> {
  const findings: ValidationFinding[] = [];

  // 1. Contract metadata
  const contractRaw = await loadJson("g4-harmonization-contract.json");
  if (!isRecord(contractRaw)) {
    findings.push({ path: "g4-harmonization-contract.json", message: "Root must be an object" });
  } else {
    if (contractRaw["package"] !== "G4") {
      findings.push({ path: "g4-harmonization-contract.json.package", message: "Package must be 'G4'" });
    }

    const schemas = contractRaw["schemas"];
    if (!isRecord(schemas)) {
      findings.push({ path: "g4-harmonization-contract.json.schemas", message: "schemas must be an object" });
    } else {
      if (schemas["harmonizationResult"] !== G4_HARMONIZATION_RESULT_SCHEMA) {
        findings.push({ path: "schemas.harmonizationResult", message: `Expected ${G4_HARMONIZATION_RESULT_SCHEMA}` });
      }
    }

    const limits = contractRaw["limits"];
    if (!isRecord(limits)) {
      findings.push({ path: "g4-harmonization-contract.json.limits", message: "limits must be an object" });
    } else {
      if (limits["maxSlots"] !== MAX_G4_SLOTS) {
        findings.push({ path: "limits.maxSlots", message: `Expected ${String(MAX_G4_SLOTS)}` });
      }
      if (limits["maxCandidatesPerSlot"] !== MAX_G4_CANDIDATES_PER_SLOT) {
        findings.push({ path: "limits.maxCandidatesPerSlot", message: `Expected ${String(MAX_G4_CANDIDATES_PER_SLOT)}` });
      }
      if (limits["maxSearchStates"] !== MAX_G4_SEARCH_STATES) {
        findings.push({ path: "limits.maxSearchStates", message: `Expected ${String(MAX_G4_SEARCH_STATES)}` });
      }
      if (limits["maxSolutions"] !== MAX_G4_SOLUTIONS) {
        findings.push({ path: "limits.maxSolutions", message: `Expected ${String(MAX_G4_SOLUTIONS)}` });
      }
    }
  }

  // 2. Harmonization cases
  const casesRaw = await loadJson("harmonization-cases.json");
  let harmonizationCasesCount = 0;
  if (!isRecord(casesRaw) || !Array.isArray(casesRaw["cases"])) {
    findings.push({ path: "harmonization-cases.json.cases", message: "cases must be an array" });
  } else {
    const cases = casesRaw["cases"] as readonly unknown[];
    harmonizationCasesCount = cases.length;
    for (let i = 0; i < cases.length; i++) {
      const c: unknown = cases[i];
      if (!isRecord(c)) {
        findings.push({ path: `harmonization-cases.cases[${String(i)}]`, message: "case must be an object" });
        continue;
      }
      if (typeof c["id"] !== "string" || !c["id"].startsWith("CASE_HARMONIZE_")) {
        findings.push({ path: `harmonization-cases.cases[${String(i)}].id`, message: "Invalid harmonization case ID prefix" });
      }
      if (!Array.isArray(c["slots"]) || c["slots"].length === 0) {
        findings.push({ path: `harmonization-cases.cases[${String(i)}].slots`, message: "slots must be non-empty array" });
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
    schema: "changes.validation.g4-contract.v1",
    package: "G4",
    outcome,
    counts: {
      files: 5,
      harmonizationCases: harmonizationCasesCount,
      mutationControls: mutationControlsCount,
      authorities: authoritiesCount,
      traces: tracesCount,
    },
    findings,
  };
}

if (import.meta.main) {
  validateG4Contract()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (report.outcome !== "pass") {
        process.exit(1);
      }
    })
    .catch((err: unknown) => {
      console.error("G4 Contract Validation failed:", err);
      process.exit(1);
    });
}
