import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { H0_ANALYSIS_CLASSIFICATION_ORDER, H0_EVIDENCE_TIERS } from "../src/theory/analysis-contract";

type JsonObject = Record<string, unknown>;
type Finding = { code: string; cases: readonly string[]; detail: string };

function object(value: unknown): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a fixture object");
  return value as JsonObject;
}

function objects(value: unknown): JsonObject[] {
  if (!Array.isArray(value)) throw new Error("Expected a fixture array");
  return value.map(object);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  }
  return value === undefined ? "null" : JSON.stringify(value);
}

async function fixture(root: string, name: string): Promise<JsonObject> {
  return object(JSON.parse(await readFile(resolve(root, name), "utf8")));
}

/** Cross-contract witnesses use reviewed data and public types, never analyzer output. */
export async function auditH0ContractConsistency(repositoryRoot: string) {
  const fixtureRoot = resolve(repositoryRoot, "tests/fixtures/harmony-analysis");
  const [contexts, sources, scales, t1] = await Promise.all([
    fixture(fixtureRoot, "context-reading-cases.json"), fixture(fixtureRoot, "source-catalog.json"),
    fixture(fixtureRoot, "chord-scale-cases.json"), fixture(resolve(repositoryRoot, "tests/fixtures/resolution"), "formula-rules.json"),
  ]);
  const findings: Finding[] = [];
  const seen = new Map<string, JsonObject>();
  for (const row of objects(contexts["cases"])) {
    const expected = object(row["expected"]);
    if (!Array.isArray(expected["orderedReadings"])) continue;
    const readings = objects(expected["orderedReadings"]);
    const key = canonical({ context: row["contextId"], events: row["events"] });
    const prior = seen.get(key);
    const comparison = (entry: JsonObject) => {
      const result = object(entry["expected"]);
      return canonical({ disposition: result["disposition"], readings: objects(result["orderedReadings"])
        .map((reading) => [reading["classification"], reading["romanLabel"], reading["strength"]]) });
    };
    if (prior !== undefined && comparison(prior) !== comparison(row)) {
      findings.push({ code: "H0_IDENTICAL_INPUT_CONFLICT", cases: [String(prior["id"]), String(row["id"])],
        detail: `Same semantic request ${key}; expected results disagree.` });
    }
    seen.set(key, row);
    const rank = (reading: JsonObject): readonly [number, number] => [
      H0_EVIDENCE_TIERS.findIndex((tier) => tier === reading["strength"]),
      H0_ANALYSIS_CLASSIFICATION_ORDER.findIndex((classification) => classification === reading["classification"]),
    ];
    for (let i = 1; i < readings.length; i++) {
      const before = readings[i - 1]; const after = readings[i];
      if (before === undefined || after === undefined) throw new Error("Invalid reading index");
      const a = rank(before); const b = rank(after);
      if (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])) {
        findings.push({ code: "H0_READING_ORDER_CONFLICT", cases: [String(row["id"])],
          detail: `Reading ${String(i - 1)} ranks ${canonical(a)}, before stronger reading ${String(i)} at ${canonical(b)}.` });
      }
    }
  }
  const formulaRows = objects(t1["rules"]);
  for (const source of objects(sources["chords"])) {
    if (!Array.isArray(source["t1Refs"])) throw new Error("Missing T1 references");
    for (const reference of source["t1Refs"]) {
      const formula = formulaRows.find((row) => row["id"] === reference);
      if (formula === undefined || !Array.isArray(formula["degrees"])) continue;
      if (canonical(formula["degrees"]) !== canonical(source["degrees"])) {
        findings.push({ code: "H0_T1_LITERAL_CONFLICT", cases: [String(source["id"]), String(reference)],
          detail: `H0 ${canonical(source["degrees"])} differs from its cited T1 formula ${canonical(formula["degrees"])}.` });
      }
    }
  }
  const contractPath = resolve(repositoryRoot, "src/theory/chord-scales-contract.ts");
  const program = ts.createProgram([contractPath], { noEmit: true, strict: true });
  const checker = program.getTypeChecker();
  const contract = program.getSourceFile(contractPath);
  if (contract === undefined) throw new Error("Missing public scale contract");
  const declaration = contract.statements.find((statement): statement is ts.TypeAliasDeclaration =>
    ts.isTypeAliasDeclaration(statement) && statement.name.text === "H0ChordScaleRequest");
  if (declaration === undefined) throw new Error("Missing public scale request");
  const fields = checker.getPropertiesOfType(checker.getTypeAtLocation(declaration)).map((field) => field.name);
  if (!fields.includes("contextEvidenceIds")) {
    const cases = objects(scales["cases"]).filter((row) => Array.isArray(row["contextEvidenceIds"]) && row["contextEvidenceIds"].length > 0);
    if (cases.length > 0) findings.push({ code: "H0_UNREPRESENTABLE_SCALE_EVIDENCE", cases: cases.map((row) => String(row["id"])),
      detail: `Fixtures require contextEvidenceIds, absent from actual public request fields ${canonical(fields)}. H0-SCALE-HW-001 and H0-SCALE-HW-NEAR-001 consequently have indistinguishable requests but contradictory exact-tier expectations.` });
  }
  return { schema: "changes.audit.h0-contract-consistency.v1", outcome: findings.length === 0 ? "pass" : "fail", findings };
}

if (import.meta.main) {
  const report = await auditH0ContractConsistency(fileURLToPath(new URL("..", import.meta.url)));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.outcome === "pass" ? 0 : 1;
}
