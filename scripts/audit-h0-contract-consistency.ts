import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { H0_ANALYSIS_CLASSIFICATION_ORDER, H0_EVIDENCE_TIERS } from "../src/theory/analysis-contract";

type JsonObject = Record<string, unknown>;
export type H0ConsistencyFinding = { code: string; cases: readonly string[]; detail: string };
const declarationKinds = ["diminished-dominant", "dorian", "locrian-flat-nine", "locrian-natural-nine"];
const contextualFamilies = new Map([
  ["half-whole-diminished", "diminished-dominant"], ["dorian", "dorian"],
  ["locrian", "locrian-flat-nine"], ["locrian-natural-2", "locrian-natural-nine"],
]);
function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function object(value: unknown): JsonObject {
  if (!isObject(value)) throw new Error("Expected a fixture object");
  return value;
}
function objects(value: unknown): JsonObject[] {
  if (!Array.isArray(value)) throw new Error("Expected a fixture array");
  return value.map(object);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObject(value)) return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return value === undefined ? "null" : JSON.stringify(value);
}
async function fixture(root: string, name: string): Promise<JsonObject> {
  return object(JSON.parse(await readFile(resolve(root, name), "utf8")));
}

/** Independent specification grammar; NOT the future production validator. */
export function auditH0DeclaredScaleContext(declaration: unknown, currentRoot: unknown): string | null {
  if (declaration === null) return null;
  if (!isObject(declaration) || canonical(Object.keys(declaration).sort()) !== '["kind","tonic"]') return "shape";
  if (typeof declaration["kind"] !== "string" || !declarationKinds.includes(declaration["kind"])) return "kind-unsupported";
  const tonic = declaration["tonic"];
  if (!isObject(tonic) || canonical(Object.keys(tonic).sort()) !== '["alter","step"]'
    || typeof tonic["step"] !== "string" || !["A", "B", "C", "D", "E", "F", "G"].includes(tonic["step"])
    || typeof tonic["alter"] !== "number" || !Number.isInteger(tonic["alter"]) || Math.abs(tonic["alter"]) > 2) return "tonic-invalid";
  if (canonical(tonic) !== canonical(currentRoot)) return "tonic-mismatch";
  return null;
}

/** Semantic cross-contract witnesses, shared by the existing packet validator.
 * They use reviewed T1 data and explicit predicates, never analyzer output. */
export function auditH0FixtureConsistency(contexts: JsonObject, sources: JsonObject, scales: JsonObject, t1: JsonObject): H0ConsistencyFinding[] {
  const findings: H0ConsistencyFinding[] = [];
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
        .map(reading => [reading["classification"], reading["romanLabel"], reading["strength"]]) });
    };
    if (prior !== undefined && comparison(prior) !== comparison(row)) findings.push({ code: "H0_IDENTICAL_INPUT_CONFLICT", cases: [String(prior["id"]), String(row["id"])], detail: `Same semantic request ${key}; expected results disagree.` });
    seen.set(key, row);
    const rank = (reading: JsonObject): readonly [number, number] => [
      H0_EVIDENCE_TIERS.findIndex(tier => tier === reading["strength"]),
      H0_ANALYSIS_CLASSIFICATION_ORDER.findIndex(classification => classification === reading["classification"]),
    ];
    for (let i = 1; i < readings.length; i += 1) {
      const before = readings[i - 1], after = readings[i];
      if (before === undefined || after === undefined) throw new Error("Invalid reading index");
      const a = rank(before), b = rank(after);
      if (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])) findings.push({ code: "H0_READING_ORDER_CONFLICT", cases: [String(row["id"])], detail: `Reading ${String(i - 1)} ranks ${canonical(a)}, before stronger reading ${String(i)} at ${canonical(b)}.` });
    }
    const bestTier = Math.min(...readings.map(reading => rank(reading)[0]));
    const strongest = readings.filter(reading => rank(reading)[0] === bestTier);
    if (expected["disposition"] === "ambiguous" && strongest.length < 2) findings.push({ code: "H0_AMBIGUITY_TIER_CONFLICT", cases: [String(row["id"])], detail: "Ambiguity requires at least two distinct readings tied at the strongest tier." });
  }
  const formulaRows = objects(t1["rules"]);
  const chords = objects(sources["chords"]);
  for (const source of chords) {
    if (!Array.isArray(source["t1Refs"])) throw new Error("Missing T1 references");
    for (const reference of source["t1Refs"]) {
      const formula = formulaRows.find(row => row["id"] === reference);
      if (formula === undefined || !Array.isArray(formula["degrees"])) continue;
      if (canonical(formula["degrees"]) !== canonical(source["degrees"])) findings.push({ code: "H0_T1_LITERAL_CONFLICT", cases: [String(source["id"]), String(reference)], detail: `H0 ${canonical(source["degrees"])} differs from its cited T1 formula ${canonical(formula["degrees"])}.` });
    }
  }
  for (const row of objects(scales["cases"])) {
    if (Object.hasOwn(row, "contextEvidenceIds")) findings.push({ code: "H0_UNREPRESENTABLE_SCALE_EVIDENCE", cases: [String(row["id"])], detail: "Fixture-only evidence IDs are not a public scale-context declaration." });
    const declaration = row["declaredScaleContext"] ?? null;
    const source = chords.find(chord => chord["id"] === row["sourceId"]);
    const defect = auditH0DeclaredScaleContext(declaration, source?.["rootSpelling"] ?? null);
    if (defect !== null) findings.push({ code: "H0_SCALE_CONTEXT_DECLARATION", cases: [String(row["id"])], detail: `Invalid declaration: ${defect}.` });
    const expected = object(row["expected"]);
    if (!Array.isArray(expected["orderedOptions"])) continue;
    for (const option of objects(expected["orderedOptions"])) {
      const required = contextualFamilies.get(String(option["family"]));
      const spanSupportsFrame = required !== "dorian" || objects(sources["contexts"]).some(context => context["id"] === row["contextId"] && context["basis"] === "declared-modal");
      if (required !== undefined && option["strength"] === "exact" && (!isObject(declaration) || declaration["kind"] !== required || !spanSupportsFrame)) findings.push({ code: "H0_SCALE_CONTEXT_PREMISE", cases: [String(row["id"])], detail: `Exact ${String(option["family"])} requires the explicit ${required} frame and its declared span, not a fixture identifier.` });
      if (Array.isArray(option["containedChordDegrees"]) && canonical(option["containedChordDegrees"]) !== canonical(source?.["degrees"])) findings.push({ code: "H0_SCALE_LITERAL_CONTAINMENT", cases: [String(row["id"])], detail: "Contained source degrees must retain every named T1 degree, including natural11 and separate4/11 roles." });
    }
  }
  if (!Array.isArray(scales["declarationCases"]) || scales["declarationCases"].length !== 15) findings.push({ code: "H0_SCALE_DECLARATION_CASES", cases: [], detail: "The independent fifteen-row declaration/near-miss packet is required." });
  else for (const row of objects(scales["declarationCases"])) {
    const defect = auditH0DeclaredScaleContext(row["declaration"], row["currentRoot"]);
    const retained = defect === null && row["declaration"] !== null ? 2 : 0;
    if (defect !== row["expectedDefect"] || retained !== row["retainedInputRecords"]) findings.push({ code: "H0_SCALE_DECLARATION_CASE", cases: [String(row["id"])], detail: `Independent grammar yields ${String(defect)} and ${String(retained)} admitted input records.` });
  }
  return findings;
}

export async function auditH0ContractConsistency(repositoryRoot: string, options: Readonly<{ fixtureRoot?: string; chordScaleSourceOverride?: string }> = {}) {
  const fixtureRoot = options.fixtureRoot ?? resolve(repositoryRoot, "tests/fixtures/harmony-analysis");
  const [contexts, sources, scales, t1] = await Promise.all([
    fixture(fixtureRoot, "context-reading-cases.json"), fixture(fixtureRoot, "source-catalog.json"),
    fixture(fixtureRoot, "chord-scale-cases.json"), fixture(resolve(repositoryRoot, "tests/fixtures/resolution"), "formula-rules.json"),
  ]);
  const findings = auditH0FixtureConsistency(contexts, sources, scales, t1);
  const contractPath = resolve(repositoryRoot, "src/theory/chord-scales-contract.ts");
  const compilerOptions = { noEmit: true, strict: true };
  const host = ts.createCompilerHost(compilerOptions);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (file, languageVersion, onError, shouldCreateNewSourceFile) => file === contractPath && options.chordScaleSourceOverride !== undefined
    ? ts.createSourceFile(file, options.chordScaleSourceOverride, languageVersion, true)
    : originalGetSourceFile(file, languageVersion, onError, shouldCreateNewSourceFile);
  const program = ts.createProgram([contractPath], compilerOptions, host);
  const checker = program.getTypeChecker();
  const contract = program.getSourceFile(contractPath);
  if (contract === undefined) throw new Error("Missing public scale contract");
  const declaration = contract.statements.find((statement): statement is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(statement) && statement.name.text === "H0ChordScaleRequest");
  if (declaration === undefined) throw new Error("Missing public scale request");
  const requestType = checker.getTypeAtLocation(declaration);
  const field = checker.getPropertyOfType(requestType, "declaredScaleContext");
  const literalValues = (type: ts.Type): readonly (string | number | null)[] =>
    (type.isUnion() ? type.types : [type]).map(member =>
      member.isStringLiteral() || member.isNumberLiteral() ? member.value : null);
  const exactSpelling = (type: ts.Type): boolean => {
    const step = checker.getPropertyOfType(type, "step"), alter = checker.getPropertyOfType(type, "alter");
    return step !== undefined && alter !== undefined
      && canonical(checker.getPropertiesOfType(type).map(property => property.name).sort()) === '["alter","step"]'
      && checker.getIndexInfosOfType(type).length === 0
      && canonical([...literalValues(checker.getTypeOfSymbolAtLocation(step, declaration))].sort()) === '["A","B","C","D","E","F","G"]'
      && canonical([...literalValues(checker.getTypeOfSymbolAtLocation(alter, declaration))].sort()) === '[-1,-2,0,1,2]';
  };
  let representable = false;
  if (field !== undefined) {
    const contextType = checker.getTypeOfSymbolAtLocation(field, declaration);
    const variants = contextType.isUnion() ? contextType.types : [contextType];
    const hasNull = variants.some(type => (type.flags & ts.TypeFlags.Null) !== 0);
    const record = variants.find(type => (type.flags & ts.TypeFlags.Object) !== 0);
    if (record !== undefined) {
      const kind = checker.getPropertyOfType(record, "kind"), tonic = checker.getPropertyOfType(record, "tonic");
      if (kind !== undefined && tonic !== undefined) {
        const kindType = checker.getTypeOfSymbolAtLocation(kind, declaration);
        const kinds = literalValues(kindType);
        const tonicType = checker.getTypeOfSymbolAtLocation(tonic, declaration);
        representable = hasNull && variants.length === 2 && canonical(checker.getPropertiesOfType(record).map(property => property.name).sort()) === '["kind","tonic"]'
          && checker.getIndexInfosOfType(record).length === 0
          && canonical([...kinds].sort()) === canonical([...declarationKinds].sort())
          && exactSpelling(tonicType);
      }
    }
  }
  if (!representable) findings.push({ code: "H0_UNREPRESENTABLE_SCALE_EVIDENCE", cases: ["H0-SCALE-HW-001", "H0-SCALE-HW-NEAR-001"], detail: "Actual public request must carry one nullable closed musical declaration and spelled tonic. A fixture-ID field, unknown or any is not a representable premise." });
  return { schema: "changes.audit.h0-contract-consistency.v1", outcome: findings.length === 0 ? "pass" : "fail", findings };
}

if (import.meta.main) {
  const report = await auditH0ContractConsistency(fileURLToPath(new URL("..", import.meta.url)));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.outcome === "pass" ? 0 : 1;
}
