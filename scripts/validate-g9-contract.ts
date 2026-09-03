import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  G9_PRACTICE_RUBRIC_SCHEMA,
  G9_PRACTICE_SESSION_SCHEMA,
  MAX_G9_OPTIONS_PER_PROMPT,
  MAX_G9_PROMPTS_PER_SESSION,
} from "../src/theory";

interface ValidationFinding {
  readonly path: string;
  readonly message: string;
}

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../tests/fixtures/practice-laboratory",
);

async function loadJson(filename: string): Promise<unknown> {
  const fullPath = resolve(FIXTURE_DIR, filename);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function validateG9Contract(): Promise<{
  readonly schema: string;
  readonly package: string;
  readonly outcome: "pass" | "fail";
  readonly counts: {
    readonly files: number;
    readonly sessionCases: number;
    readonly mutationControls: number;
    readonly authorities: number;
    readonly traces: number;
  };
  readonly findings: readonly ValidationFinding[];
}> {
  const findings: ValidationFinding[] = [];

  // 1. Contract metadata
  const contractRaw = await loadJson("g9-practice-laboratory-contract.json");
  if (!isRecord(contractRaw)) {
    findings.push({ path: "g9-practice-laboratory-contract.json", message: "Root must be an object" });
  } else {
    if (contractRaw["package"] !== "G9") {
      findings.push({ path: "g9-practice-laboratory-contract.json.package", message: "Package must be 'G9'" });
    }

    const schemas = contractRaw["schemas"];
    if (!isRecord(schemas)) {
      findings.push({ path: "g9-practice-laboratory-contract.json.schemas", message: "schemas must be an object" });
    } else {
      if (schemas["practiceSession"] !== G9_PRACTICE_SESSION_SCHEMA) {
        findings.push({ path: "schemas.practiceSession", message: `Expected ${G9_PRACTICE_SESSION_SCHEMA}` });
      }
      if (schemas["practiceRubric"] !== G9_PRACTICE_RUBRIC_SCHEMA) {
        findings.push({ path: "schemas.practiceRubric", message: `Expected ${G9_PRACTICE_RUBRIC_SCHEMA}` });
      }
    }

    const limits = contractRaw["limits"];
    if (!isRecord(limits)) {
      findings.push({ path: "g9-practice-laboratory-contract.json.limits", message: "limits must be an object" });
    } else {
      if (limits["maxPromptsPerSession"] !== MAX_G9_PROMPTS_PER_SESSION) {
        findings.push({ path: "limits.maxPromptsPerSession", message: `Expected ${String(MAX_G9_PROMPTS_PER_SESSION)}` });
      }
      if (limits["maxOptionsPerPrompt"] !== MAX_G9_OPTIONS_PER_PROMPT) {
        findings.push({ path: "limits.maxOptionsPerPrompt", message: `Expected ${String(MAX_G9_OPTIONS_PER_PROMPT)}` });
      }
    }
  }

  // 2. Session cases
  const casesRaw = await loadJson("practice-session-cases.json");
  let sessionCasesCount = 0;
  if (!isRecord(casesRaw) || !Array.isArray(casesRaw["cases"])) {
    findings.push({ path: "practice-session-cases.json.cases", message: "cases must be an array" });
  } else {
    const cases = casesRaw["cases"] as readonly unknown[];
    sessionCasesCount = cases.length;
    for (let i = 0; i < cases.length; i++) {
      const c: unknown = cases[i];
      if (!isRecord(c)) {
        findings.push({ path: `practice-session-cases.cases[${String(i)}]`, message: "case must be an object" });
        continue;
      }
      if (typeof c["id"] !== "string" || !c["id"].startsWith("CASE_PRACTICE_")) {
        findings.push({ path: `practice-session-cases.cases[${String(i)}].id`, message: "Invalid session case ID prefix" });
      }
      if (!Array.isArray(c["inputChords"]) || c["inputChords"].length === 0) {
        findings.push({ path: `practice-session-cases.cases[${String(i)}].inputChords`, message: "inputChords must be non-empty" });
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
    schema: "changes.validation.g9-contract.v1",
    package: "G9",
    outcome,
    counts: {
      files: 5,
      sessionCases: sessionCasesCount,
      mutationControls: mutationControlsCount,
      authorities: authoritiesCount,
      traces: tracesCount,
    },
    findings,
  };
}

if (import.meta.main) {
  validateG9Contract()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (report.outcome !== "pass") {
        process.exit(1);
      }
    })
    .catch((err: unknown) => {
      console.error("G9 Contract Validation failed:", err);
      process.exit(1);
    });
}
