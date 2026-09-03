import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  G0_PHRASE_ANALYSIS_SCHEMA,
  G0_TONAL_JOURNEY_RESULT_SCHEMA,
  MAX_G0_K_BEST_PATHS,
  MAX_G0_KEY_AREAS_PER_PATH,
  MAX_G0_PROGRESSION_EVENTS,
} from "../src/theory";

interface ValidationFinding {
  readonly path: string;
  readonly message: string;
}

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../tests/fixtures/tonal-journey",
);

async function loadJson(filename: string): Promise<unknown> {
  const fullPath = resolve(FIXTURE_DIR, filename);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function validateG0Contract(): Promise<{
  readonly schema: string;
  readonly package: string;
  readonly outcome: "pass" | "fail";
  readonly counts: {
    readonly files: number;
    readonly journeyCases: number;
    readonly cadenceCases: number;
    readonly mutationControls: number;
    readonly authorities: number;
    readonly traces: number;
  };
  readonly findings: readonly ValidationFinding[];
}> {
  const findings: ValidationFinding[] = [];

  // 1. Contract metadata
  const contractRaw = await loadJson("g0-tonal-journey-contract.json");
  if (!isRecord(contractRaw)) {
    findings.push({ path: "g0-tonal-journey-contract.json", message: "Root must be an object" });
  } else {
    if (contractRaw["package"] !== "G0") {
      findings.push({ path: "g0-tonal-journey-contract.json.package", message: "Package must be 'G0'" });
    }

    const schemas = contractRaw["schemas"];
    if (!isRecord(schemas)) {
      findings.push({ path: "g0-tonal-journey-contract.json.schemas", message: "schemas must be an object" });
    } else {
      if (schemas["tonalJourneyResult"] !== G0_TONAL_JOURNEY_RESULT_SCHEMA) {
        findings.push({ path: "schemas.tonalJourneyResult", message: `Expected ${G0_TONAL_JOURNEY_RESULT_SCHEMA}` });
      }
      if (schemas["phraseAnalysis"] !== G0_PHRASE_ANALYSIS_SCHEMA) {
        findings.push({ path: "schemas.phraseAnalysis", message: `Expected ${G0_PHRASE_ANALYSIS_SCHEMA}` });
      }
    }

    const limits = contractRaw["limits"];
    if (!isRecord(limits)) {
      findings.push({ path: "g0-tonal-journey-contract.json.limits", message: "limits must be an object" });
    } else {
      if (limits["maxProgressionEvents"] !== MAX_G0_PROGRESSION_EVENTS) {
        findings.push({ path: "limits.maxProgressionEvents", message: `Expected ${String(MAX_G0_PROGRESSION_EVENTS)}` });
      }
      if (limits["maxKBestPaths"] !== MAX_G0_K_BEST_PATHS) {
        findings.push({ path: "limits.maxKBestPaths", message: `Expected ${String(MAX_G0_K_BEST_PATHS)}` });
      }
      if (limits["maxKeyAreasPerPath"] !== MAX_G0_KEY_AREAS_PER_PATH) {
        findings.push({ path: "limits.maxKeyAreasPerPath", message: `Expected ${String(MAX_G0_KEY_AREAS_PER_PATH)}` });
      }
    }
  }

  // 2. Journey cases
  const journeyCasesRaw = await loadJson("tonal-journey-cases.json");
  let journeyCasesCount = 0;
  if (!isRecord(journeyCasesRaw) || !Array.isArray(journeyCasesRaw["cases"])) {
    findings.push({ path: "tonal-journey-cases.json.cases", message: "cases must be an array" });
  } else {
    const cases = journeyCasesRaw["cases"] as readonly unknown[];
    journeyCasesCount = cases.length;
    for (let i = 0; i < cases.length; i++) {
      const c: unknown = cases[i];
      if (!isRecord(c)) {
        findings.push({ path: `tonal-journey-cases.cases[${String(i)}]`, message: "case must be an object" });
        continue;
      }
      if (typeof c["id"] !== "string" || !c["id"].startsWith("JOURNEY_CASE_")) {
        findings.push({ path: `tonal-journey-cases.cases[${String(i)}].id`, message: "Invalid journey case ID prefix" });
      }
      if (!Array.isArray(c["chords"]) || c["chords"].length === 0) {
        findings.push({ path: `tonal-journey-cases.cases[${String(i)}].chords`, message: "chords must be non-empty" });
      }
    }
  }

  // 3. Cadence cases
  const cadenceCasesRaw = await loadJson("phrase-cadence-cases.json");
  let cadenceCasesCount = 0;
  if (!isRecord(cadenceCasesRaw) || !Array.isArray(cadenceCasesRaw["cases"])) {
    findings.push({ path: "phrase-cadence-cases.json.cases", message: "cases must be an array" });
  } else {
    const cases = cadenceCasesRaw["cases"] as readonly unknown[];
    cadenceCasesCount = cases.length;
    for (let i = 0; i < cases.length; i++) {
      const c: unknown = cases[i];
      if (!isRecord(c)) {
        findings.push({ path: `phrase-cadence-cases.cases[${String(i)}]`, message: "case must be an object" });
        continue;
      }
      if (typeof c["id"] !== "string") {
        findings.push({ path: `phrase-cadence-cases.cases[${String(i)}].id`, message: "Invalid cadence case ID" });
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
    schema: "changes.validation.g0-contract.v1",
    package: "G0",
    outcome,
    counts: {
      files: 6,
      journeyCases: journeyCasesCount,
      cadenceCases: cadenceCasesCount,
      mutationControls: mutationControlsCount,
      authorities: authoritiesCount,
      traces: tracesCount,
    },
    findings,
  };
}

if (import.meta.main) {
  validateG0Contract()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (report.outcome !== "pass") {
        process.exit(1);
      }
    })
    .catch((err: unknown) => {
      console.error("G0 Contract Validation failed:", err);
      process.exit(1);
    });
}
