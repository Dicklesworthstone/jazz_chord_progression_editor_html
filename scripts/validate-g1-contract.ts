import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  G1_ATLAS_MANIFEST_SCHEMA,
  G1_ATLAS_REJECTIONS_SCHEMA,
  G1_COMPILED_ATLAS_SCHEMA,
  G1_SOURCE_ATLAS_SCHEMA,
  MAX_G1_FINGERPRINT_LAYERS,
  MAX_G1_FIXTURE_ENTRIES,
  MAX_G1_PROGRESSION_LENGTH,
} from "../src/theory";

interface ValidationFinding {
  readonly path: string;
  readonly message: string;
}

const FIXTURE_DIR = resolve(
  import.meta.dir,
  "../tests/fixtures/atlas-compiler",
);

async function loadJson(filename: string): Promise<unknown> {
  const fullPath = resolve(FIXTURE_DIR, filename);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function validateG1Contract(): Promise<{
  readonly schema: string;
  readonly package: string;
  readonly outcome: "pass" | "fail";
  readonly counts: {
    readonly files: number;
    readonly sourceEntries: number;
    readonly goldenEntries: number;
    readonly plantedFailures: number;
    readonly authorities: number;
    readonly traces: number;
  };
  readonly findings: readonly ValidationFinding[];
}> {
  const findings: ValidationFinding[] = [];

  // 1. Contract metadata
  const contractRaw = await loadJson("g1-atlas-contract.json");
  if (!isRecord(contractRaw)) {
    findings.push({ path: "g1-atlas-contract.json", message: "Root must be an object" });
  } else {
    if (contractRaw["package"] !== "G1") {
      findings.push({ path: "g1-atlas-contract.json.package", message: "Package must be 'G1'" });
    }

    const schemas = contractRaw["schemas"];
    if (!isRecord(schemas)) {
      findings.push({ path: "g1-atlas-contract.json.schemas", message: "schemas must be an object" });
    } else {
      if (schemas["sourceAtlas"] !== G1_SOURCE_ATLAS_SCHEMA) {
        findings.push({ path: "schemas.sourceAtlas", message: `Expected ${G1_SOURCE_ATLAS_SCHEMA}` });
      }
      if (schemas["compiledAtlas"] !== G1_COMPILED_ATLAS_SCHEMA) {
        findings.push({ path: "schemas.compiledAtlas", message: `Expected ${G1_COMPILED_ATLAS_SCHEMA}` });
      }
      if (schemas["manifest"] !== G1_ATLAS_MANIFEST_SCHEMA) {
        findings.push({ path: "schemas.manifest", message: `Expected ${G1_ATLAS_MANIFEST_SCHEMA}` });
      }
      if (schemas["rejections"] !== G1_ATLAS_REJECTIONS_SCHEMA) {
        findings.push({ path: "schemas.rejections", message: `Expected ${G1_ATLAS_REJECTIONS_SCHEMA}` });
      }
    }

    const limits = contractRaw["limits"];
    if (!isRecord(limits)) {
      findings.push({ path: "g1-atlas-contract.json.limits", message: "limits must be an object" });
    } else {
      if (limits["maxFixtureEntries"] !== MAX_G1_FIXTURE_ENTRIES) {
        findings.push({ path: "limits.maxFixtureEntries", message: `Expected ${String(MAX_G1_FIXTURE_ENTRIES)}` });
      }
      if (limits["maxProgressionLength"] !== MAX_G1_PROGRESSION_LENGTH) {
        findings.push({ path: "limits.maxProgressionLength", message: `Expected ${String(MAX_G1_PROGRESSION_LENGTH)}` });
      }
      if (limits["maxFingerprintLayers"] !== MAX_G1_FINGERPRINT_LAYERS) {
        findings.push({ path: "limits.maxFingerprintLayers", message: `Expected ${String(MAX_G1_FINGERPRINT_LAYERS)}` });
      }
    }
  }

  // 2. Source corpus entries
  const sourceRaw = await loadJson("source-corpus-fixtures.json");
  let sourceEntriesCount = 0;
  if (!isRecord(sourceRaw) || !Array.isArray(sourceRaw["entries"])) {
    findings.push({ path: "source-corpus-fixtures.json.entries", message: "entries must be an array" });
  } else {
    const entries = sourceRaw["entries"] as readonly unknown[];
    sourceEntriesCount = entries.length;
    for (let i = 0; i < entries.length; i++) {
      const e: unknown = entries[i];
      if (!isRecord(e)) {
        findings.push({ path: `source-corpus-fixtures.entries[${String(i)}]`, message: "entry must be an object" });
        continue;
      }
      if (typeof e["entryId"] !== "string" || !e["entryId"].startsWith("atlas_entry_")) {
        findings.push({ path: `source-corpus-fixtures.entries[${String(i)}].entryId`, message: "Invalid entry ID prefix" });
      }
      if (!Array.isArray(e["chords"]) || e["chords"].length === 0) {
        findings.push({ path: `source-corpus-fixtures.entries[${String(i)}].chords`, message: "chords must be non-empty" });
      }
    }
  }

  // 3. Compiled golden entries
  const goldenRaw = await loadJson("compiled-corpus-golden.json");
  let goldenEntriesCount = 0;
  if (!isRecord(goldenRaw) || !isRecord(goldenRaw["golden"])) {
    findings.push({ path: "compiled-corpus-golden.json.golden", message: "golden must be an object" });
  } else {
    const goldenObj = goldenRaw["golden"];
    if (!Array.isArray(goldenObj["entries"])) {
      findings.push({ path: "compiled-corpus-golden.json.golden.entries", message: "golden entries must be an array" });
    } else {
      const entries = goldenObj["entries"] as readonly unknown[];
      goldenEntriesCount = entries.length;
    }
  }

  // 4. Planted failures
  const failuresRaw = await loadJson("planted-rights-failures.json");
  let plantedFailuresCount = 0;
  if (!isRecord(failuresRaw) || !Array.isArray(failuresRaw["plantedFailures"])) {
    findings.push({ path: "planted-rights-failures.json.plantedFailures", message: "plantedFailures must be an array" });
  } else {
    const failures = failuresRaw["plantedFailures"] as readonly unknown[];
    plantedFailuresCount = failures.length;
    for (let i = 0; i < failures.length; i++) {
      const f: unknown = failures[i];
      if (!isRecord(f) || typeof f["expectedRejection"] !== "string") {
        findings.push({ path: `planted-rights-failures[${String(i)}]`, message: "Invalid planted failure record" });
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
    schema: "changes.validation.g1-contract.v1",
    package: "G1",
    outcome,
    counts: {
      files: 6,
      sourceEntries: sourceEntriesCount,
      goldenEntries: goldenEntriesCount,
      plantedFailures: plantedFailuresCount,
      authorities: authoritiesCount,
      traces: tracesCount,
    },
    findings,
  };
}

if (import.meta.main) {
  validateG1Contract()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (report.outcome !== "pass") {
        process.exit(1);
      }
    })
    .catch((err: unknown) => {
      console.error("G1 Contract Validation failed:", err);
      process.exit(1);
    });
}
