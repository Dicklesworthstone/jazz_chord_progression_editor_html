import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  G3_ROUTE_PLANNER_RESULT_SCHEMA,
  MAX_G3_OUTGOING_PER_STATE,
  MAX_G3_RETURNED_ROUTES,
  MAX_G3_ROUTE_STEPS,
  MAX_G3_SEARCH_STATES,
} from "../src/theory";

interface ValidationFinding {
  readonly path: string;
  readonly message: string;
}

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../tests/fixtures/route-planner",
);

async function loadJson(filename: string): Promise<unknown> {
  const fullPath = resolve(FIXTURE_DIR, filename);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function validateG3Contract(): Promise<{
  readonly schema: string;
  readonly package: string;
  readonly outcome: "pass" | "fail";
  readonly counts: {
    readonly files: number;
    readonly routeCases: number;
    readonly mutationControls: number;
    readonly authorities: number;
    readonly traces: number;
  };
  readonly findings: readonly ValidationFinding[];
}> {
  const findings: ValidationFinding[] = [];

  // 1. Contract metadata
  const contractRaw = await loadJson("g3-route-planner-contract.json");
  if (!isRecord(contractRaw)) {
    findings.push({ path: "g3-route-planner-contract.json", message: "Root must be an object" });
  } else {
    if (contractRaw["package"] !== "G3") {
      findings.push({ path: "g3-route-planner-contract.json.package", message: "Package must be 'G3'" });
    }

    const schemas = contractRaw["schemas"];
    if (!isRecord(schemas)) {
      findings.push({ path: "g3-route-planner-contract.json.schemas", message: "schemas must be an object" });
    } else {
      if (schemas["routePlannerResult"] !== G3_ROUTE_PLANNER_RESULT_SCHEMA) {
        findings.push({ path: "schemas.routePlannerResult", message: `Expected ${G3_ROUTE_PLANNER_RESULT_SCHEMA}` });
      }
    }

    const limits = contractRaw["limits"];
    if (!isRecord(limits)) {
      findings.push({ path: "g3-route-planner-contract.json.limits", message: "limits must be an object" });
    } else {
      if (limits["maxRouteSteps"] !== MAX_G3_ROUTE_STEPS) {
        findings.push({ path: "limits.maxRouteSteps", message: `Expected ${String(MAX_G3_ROUTE_STEPS)}` });
      }
      if (limits["maxOutgoingPerState"] !== MAX_G3_OUTGOING_PER_STATE) {
        findings.push({ path: "limits.maxOutgoingPerState", message: `Expected ${String(MAX_G3_OUTGOING_PER_STATE)}` });
      }
      if (limits["maxSearchStates"] !== MAX_G3_SEARCH_STATES) {
        findings.push({ path: "limits.maxSearchStates", message: `Expected ${String(MAX_G3_SEARCH_STATES)}` });
      }
      if (limits["maxReturnedRoutes"] !== MAX_G3_RETURNED_ROUTES) {
        findings.push({ path: "limits.maxReturnedRoutes", message: `Expected ${String(MAX_G3_RETURNED_ROUTES)}` });
      }
    }
  }

  // 2. Route cases
  const casesRaw = await loadJson("route-planner-cases.json");
  let routeCasesCount = 0;
  if (!isRecord(casesRaw) || !Array.isArray(casesRaw["cases"])) {
    findings.push({ path: "route-planner-cases.json.cases", message: "cases must be an array" });
  } else {
    const cases = casesRaw["cases"] as readonly unknown[];
    routeCasesCount = cases.length;
    for (let i = 0; i < cases.length; i++) {
      const c: unknown = cases[i];
      if (!isRecord(c)) {
        findings.push({ path: `route-planner-cases.cases[${String(i)}]`, message: "case must be an object" });
        continue;
      }
      if (typeof c["id"] !== "string" || !c["id"].startsWith("CASE_ROUTE_")) {
        findings.push({ path: `route-planner-cases.cases[${String(i)}].id`, message: "Invalid route case ID prefix" });
      }
      if (typeof c["startChord"] !== "string" || typeof c["endChord"] !== "string") {
        findings.push({ path: `route-planner-cases.cases[${String(i)}]`, message: "startChord and endChord must be strings" });
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
    schema: "changes.validation.g3-contract.v1",
    package: "G3",
    outcome,
    counts: {
      files: 5,
      routeCases: routeCasesCount,
      mutationControls: mutationControlsCount,
      authorities: authoritiesCount,
      traces: tracesCount,
    },
    findings,
  };
}

if (import.meta.main) {
  validateG3Contract()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (report.outcome !== "pass") {
        process.exit(1);
      }
    })
    .catch((err: unknown) => {
      console.error("G3 Contract Validation failed:", err);
      process.exit(1);
    });
}
