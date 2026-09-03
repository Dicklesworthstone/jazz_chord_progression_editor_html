import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  G5_REHARMONIZATION_TREE_SCHEMA,
  MAX_G5_BRANCH_DEPTH,
  MAX_G5_CHILDREN_PER_NODE,
  MAX_G5_TOTAL_NODES,
} from "../src/theory";

interface ValidationFinding {
  readonly path: string;
  readonly message: string;
}

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../tests/fixtures/reharmonization-tree",
);

async function loadJson(filename: string): Promise<unknown> {
  const fullPath = resolve(FIXTURE_DIR, filename);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function validateG5Contract(): Promise<{
  readonly schema: string;
  readonly package: string;
  readonly outcome: "pass" | "fail";
  readonly counts: {
    readonly files: number;
    readonly reharmCases: number;
    readonly mutationControls: number;
    readonly authorities: number;
    readonly traces: number;
  };
  readonly findings: readonly ValidationFinding[];
}> {
  const findings: ValidationFinding[] = [];

  // 1. Contract metadata
  const contractRaw = await loadJson("g5-reharmonization-contract.json");
  if (!isRecord(contractRaw)) {
    findings.push({ path: "g5-reharmonization-contract.json", message: "Root must be an object" });
  } else {
    if (contractRaw["package"] !== "G5") {
      findings.push({ path: "g5-reharmonization-contract.json.package", message: "Package must be 'G5'" });
    }

    const schemas = contractRaw["schemas"];
    if (!isRecord(schemas)) {
      findings.push({ path: "g5-reharmonization-contract.json.schemas", message: "schemas must be an object" });
    } else {
      if (schemas["reharmonizationTree"] !== G5_REHARMONIZATION_TREE_SCHEMA) {
        findings.push({ path: "schemas.reharmonizationTree", message: `Expected ${G5_REHARMONIZATION_TREE_SCHEMA}` });
      }
    }

    const limits = contractRaw["limits"];
    if (!isRecord(limits)) {
      findings.push({ path: "g5-reharmonization-contract.json.limits", message: "limits must be an object" });
    } else {
      if (limits["maxBranchDepth"] !== MAX_G5_BRANCH_DEPTH) {
        findings.push({ path: "limits.maxBranchDepth", message: `Expected ${String(MAX_G5_BRANCH_DEPTH)}` });
      }
      if (limits["maxChildrenPerNode"] !== MAX_G5_CHILDREN_PER_NODE) {
        findings.push({ path: "limits.maxChildrenPerNode", message: `Expected ${String(MAX_G5_CHILDREN_PER_NODE)}` });
      }
      if (limits["maxTotalNodes"] !== MAX_G5_TOTAL_NODES) {
        findings.push({ path: "limits.maxTotalNodes", message: `Expected ${String(MAX_G5_TOTAL_NODES)}` });
      }
    }
  }

  // 2. Reharm cases
  const casesRaw = await loadJson("reharmonization-tree-cases.json");
  let reharmCasesCount = 0;
  if (!isRecord(casesRaw) || !Array.isArray(casesRaw["cases"])) {
    findings.push({ path: "reharmonization-tree-cases.json.cases", message: "cases must be an array" });
  } else {
    const cases = casesRaw["cases"] as readonly unknown[];
    reharmCasesCount = cases.length;
    for (let i = 0; i < cases.length; i++) {
      const c: unknown = cases[i];
      if (!isRecord(c)) {
        findings.push({ path: `reharmonization-tree-cases.cases[${String(i)}]`, message: "case must be an object" });
        continue;
      }
      if (typeof c["id"] !== "string" || !c["id"].startsWith("CASE_REHARM_")) {
        findings.push({ path: `reharmonization-tree-cases.cases[${String(i)}].id`, message: "Invalid reharm case ID prefix" });
      }
      if (!Array.isArray(c["inputChords"]) || c["inputChords"].length === 0) {
        findings.push({ path: `reharmonization-tree-cases.cases[${String(i)}].inputChords`, message: "inputChords must be non-empty" });
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
    schema: "changes.validation.g5-contract.v1",
    package: "G5",
    outcome,
    counts: {
      files: 5,
      reharmCases: reharmCasesCount,
      mutationControls: mutationControlsCount,
      authorities: authoritiesCount,
      traces: tracesCount,
    },
    findings,
  };
}

if (import.meta.main) {
  validateG5Contract()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (report.outcome !== "pass") {
        process.exit(1);
      }
    })
    .catch((err: unknown) => {
      console.error("G5 Contract Validation failed:", err);
      process.exit(1);
    });
}
