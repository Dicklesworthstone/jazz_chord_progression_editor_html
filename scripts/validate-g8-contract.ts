import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  G8_HARMONIC_SEQUENCE_SCHEMA,
  G8_NONFUNCTIONAL_TRANSFORM_SCHEMA,
  MAX_G8_NONFUNCTIONAL_VARIANTS,
  MAX_G8_SEQUENCE_LENGTH,
} from "../src/theory";

interface ValidationFinding {
  readonly path: string;
  readonly message: string;
}

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../tests/fixtures/nonfunctional-atlas",
);

async function loadJson(filename: string): Promise<unknown> {
  const fullPath = resolve(FIXTURE_DIR, filename);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function validateG8Contract(): Promise<{
  readonly schema: string;
  readonly package: string;
  readonly outcome: "pass" | "fail";
  readonly counts: {
    readonly files: number;
    readonly truthTables: number;
    readonly sequenceCases: number;
    readonly mutationControls: number;
    readonly authorities: number;
    readonly traces: number;
  };
  readonly findings: readonly ValidationFinding[];
}> {
  const findings: ValidationFinding[] = [];

  // 1. Contract metadata
  const contractRaw = await loadJson("g8-nonfunctional-contract.json");
  if (!isRecord(contractRaw)) {
    findings.push({ path: "g8-nonfunctional-contract.json", message: "Root must be an object" });
  } else {
    if (contractRaw["package"] !== "G8") {
      findings.push({ path: "g8-nonfunctional-contract.json.package", message: "Package must be 'G8'" });
    }

    const schemas = contractRaw["schemas"];
    if (!isRecord(schemas)) {
      findings.push({ path: "g8-nonfunctional-contract.json.schemas", message: "schemas must be an object" });
    } else {
      if (schemas["nonfunctionalTransform"] !== G8_NONFUNCTIONAL_TRANSFORM_SCHEMA) {
        findings.push({ path: "schemas.nonfunctionalTransform", message: `Expected ${G8_NONFUNCTIONAL_TRANSFORM_SCHEMA}` });
      }
      if (schemas["harmonicSequence"] !== G8_HARMONIC_SEQUENCE_SCHEMA) {
        findings.push({ path: "schemas.harmonicSequence", message: `Expected ${G8_HARMONIC_SEQUENCE_SCHEMA}` });
      }
    }

    const limits = contractRaw["limits"];
    if (!isRecord(limits)) {
      findings.push({ path: "g8-nonfunctional-contract.json.limits", message: "limits must be an object" });
    } else {
      if (limits["maxSequenceLength"] !== MAX_G8_SEQUENCE_LENGTH) {
        findings.push({ path: "limits.maxSequenceLength", message: `Expected ${String(MAX_G8_SEQUENCE_LENGTH)}` });
      }
      if (limits["maxNonfunctionalVariants"] !== MAX_G8_NONFUNCTIONAL_VARIANTS) {
        findings.push({ path: "limits.maxNonfunctionalVariants", message: `Expected ${String(MAX_G8_NONFUNCTIONAL_VARIANTS)}` });
      }
    }
  }

  // 2. Truth tables
  const tablesRaw = await loadJson("neo-riemannian-truth-tables.json");
  let truthTablesCount = 0;
  if (!isRecord(tablesRaw) || !Array.isArray(tablesRaw["truthTables"])) {
    findings.push({ path: "neo-riemannian-truth-tables.json.truthTables", message: "truthTables must be an array" });
  } else {
    truthTablesCount = tablesRaw["truthTables"].length;
  }

  // 3. Sequence cases
  const sequencesRaw = await loadJson("harmonic-sequence-cases.json");
  let sequenceCasesCount = 0;
  if (!isRecord(sequencesRaw) || !Array.isArray(sequencesRaw["sequences"])) {
    findings.push({ path: "harmonic-sequence-cases.json.sequences", message: "sequences must be an array" });
  } else {
    sequenceCasesCount = sequencesRaw["sequences"].length;
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
    schema: "changes.validation.g8-contract.v1",
    package: "G8",
    outcome,
    counts: {
      files: 6,
      truthTables: truthTablesCount,
      sequenceCases: sequenceCasesCount,
      mutationControls: mutationControlsCount,
      authorities: authoritiesCount,
      traces: tracesCount,
    },
    findings,
  };
}

if (import.meta.main) {
  validateG8Contract()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (report.outcome !== "pass") {
        process.exit(1);
      }
    })
    .catch((err: unknown) => {
      console.error("G8 Contract Validation failed:", err);
      process.exit(1);
    });
}
