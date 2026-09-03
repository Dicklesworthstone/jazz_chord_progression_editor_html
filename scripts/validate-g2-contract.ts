import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  G2_CONTINUATION_RESULT_SCHEMA,
  MAX_G2_CANDIDATES_PER_PROVIDER,
  MAX_G2_CONTEXT_EVENTS,
  MAX_G2_DISPLAY_OPTIONS,
} from "../src/theory";

interface ValidationFinding {
  readonly path: string;
  readonly message: string;
}

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../tests/fixtures/continuation",
);

async function loadJson(filename: string): Promise<unknown> {
  const fullPath = resolve(FIXTURE_DIR, filename);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function validateG2Contract(): Promise<{
  readonly schema: string;
  readonly package: string;
  readonly outcome: "pass" | "fail";
  readonly counts: {
    readonly files: number;
    readonly continuationCases: number;
    readonly heldOutCases: number;
    readonly mutationControls: number;
    readonly authorities: number;
    readonly traces: number;
  };
  readonly findings: readonly ValidationFinding[];
}> {
  const findings: ValidationFinding[] = [];

  // 1. Contract metadata
  const contractRaw = await loadJson("g2-continuation-contract.json");
  if (!isRecord(contractRaw)) {
    findings.push({ path: "g2-continuation-contract.json", message: "Root must be an object" });
  } else {
    if (contractRaw["package"] !== "G2") {
      findings.push({ path: "g2-continuation-contract.json.package", message: "Package must be 'G2'" });
    }

    const schemas = contractRaw["schemas"];
    if (!isRecord(schemas)) {
      findings.push({ path: "g2-continuation-contract.json.schemas", message: "schemas must be an object" });
    } else {
      if (schemas["continuationResult"] !== G2_CONTINUATION_RESULT_SCHEMA) {
        findings.push({ path: "schemas.continuationResult", message: `Expected ${G2_CONTINUATION_RESULT_SCHEMA}` });
      }
    }

    const limits = contractRaw["limits"];
    if (!isRecord(limits)) {
      findings.push({ path: "g2-continuation-contract.json.limits", message: "limits must be an object" });
    } else {
      if (limits["maxCandidatesPerProvider"] !== MAX_G2_CANDIDATES_PER_PROVIDER) {
        findings.push({ path: "limits.maxCandidatesPerProvider", message: `Expected ${String(MAX_G2_CANDIDATES_PER_PROVIDER)}` });
      }
      if (limits["maxDisplayOptions"] !== MAX_G2_DISPLAY_OPTIONS) {
        findings.push({ path: "limits.maxDisplayOptions", message: `Expected ${String(MAX_G2_DISPLAY_OPTIONS)}` });
      }
      if (limits["maxContextEvents"] !== MAX_G2_CONTEXT_EVENTS) {
        findings.push({ path: "limits.maxContextEvents", message: `Expected ${String(MAX_G2_CONTEXT_EVENTS)}` });
      }
    }
  }

  // 2. Continuation cases
  const casesRaw = await loadJson("continuation-cases.json");
  let continuationCasesCount = 0;
  if (!isRecord(casesRaw) || !Array.isArray(casesRaw["cases"])) {
    findings.push({ path: "continuation-cases.json.cases", message: "cases must be an array" });
  } else {
    const cases = casesRaw["cases"] as readonly unknown[];
    continuationCasesCount = cases.length;
    for (let i = 0; i < cases.length; i++) {
      const c: unknown = cases[i];
      if (!isRecord(c)) {
        findings.push({ path: `continuation-cases.cases[${String(i)}]`, message: "case must be an object" });
        continue;
      }
      if (typeof c["id"] !== "string" || !c["id"].startsWith("CASE_CONTINUATION_")) {
        findings.push({ path: `continuation-cases.cases[${String(i)}].id`, message: "Invalid continuation case ID prefix" });
      }
      if (!Array.isArray(c["priorChords"]) || c["priorChords"].length === 0) {
        findings.push({ path: `continuation-cases.cases[${String(i)}].priorChords`, message: "priorChords must be non-empty" });
      }
    }
  }

  // 3. Held-out prediction corpus
  const heldOutRaw = await loadJson("prediction-held-out-corpus.json");
  let heldOutCount = 0;
  if (!isRecord(heldOutRaw) || !Array.isArray(heldOutRaw["heldOutPredictions"])) {
    findings.push({ path: "prediction-held-out-corpus.json.heldOutPredictions", message: "heldOutPredictions must be an array" });
  } else {
    const predictions = heldOutRaw["heldOutPredictions"] as readonly unknown[];
    heldOutCount = predictions.length;
    for (let i = 0; i < predictions.length; i++) {
      const p: unknown = predictions[i];
      if (!isRecord(p)) {
        findings.push({ path: `prediction-held-out-corpus[${String(i)}]`, message: "prediction must be an object" });
        continue;
      }
      if (typeof p["groundTruthNextChord"] !== "string") {
        findings.push({ path: `prediction-held-out-corpus[${String(i)}].groundTruthNextChord`, message: "groundTruthNextChord must be string" });
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
    schema: "changes.validation.g2-contract.v1",
    package: "G2",
    outcome,
    counts: {
      files: 6,
      continuationCases: continuationCasesCount,
      heldOutCases: heldOutCount,
      mutationControls: mutationControlsCount,
      authorities: authoritiesCount,
      traces: tracesCount,
    },
    findings,
  };
}

if (import.meta.main) {
  validateG2Contract()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (report.outcome !== "pass") {
        process.exit(1);
      }
    })
    .catch((err: unknown) => {
      console.error("G2 Contract Validation failed:", err);
      process.exit(1);
    });
}
