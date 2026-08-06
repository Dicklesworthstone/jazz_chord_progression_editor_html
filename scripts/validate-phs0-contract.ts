import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type JsonProperty =
  | "abiVersion"
  | "authorities"
  | "cases"
  | "code"
  | "controlRepresentation"
  | "controls"
  | "counts"
  | "expected"
  | "expectedValuesGenerated"
  | "fractionalBits"
  | "gitBlobBytes"
  | "id"
  | "independence"
  | "instrumentFamilies"
  | "legacyEarlyRmsNormalizationPermittedInV2"
  | "limits"
  | "loopRestartsFromCanonicalState"
  | "mode"
  | "nonFiniteOutputPermitted"
  | "numericPolicy"
  | "partitionPolicy"
  | "persistentGraph"
  | "productionImportsForbidden"
  | "productionOutputUsed"
  | "renderedRecipes"
  | "renderModes"
  | "reviewedCompanionSha256"
  | "rendererMayCreatePersistentGraph"
  | "rootArtifact"
  | "safetyLimiterIsMusicalNormalizer"
  | "schema"
  | "schemas"
  | "sharedResonanceMode"
  | "silentCoefficientRepairPermitted"
  | "traces"
  | "wallTimeAffectsMusicalOutput"
  | "wallTimeFallbackPermitted"
  | "windAndBrassLegatoMode"
  | "withinArchitectureFinalTarget";
type JsonObject = Record<string, unknown> &
  Partial<Record<JsonProperty, unknown>>;

export type Phs0ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type Phs0ContractValidationReport = Readonly<{
  schema: "changes.validation.phs0-contract.v1";
  package: "PHS0";
  outcome: "pass" | "fail";
  counts: Readonly<{
    abiCases: number;
    baselineRenderedRecipes: number;
    gestureCases: number;
    mutationControls: number;
    partitionCases: number;
    authorities: number;
    traces: number;
  }>;
  findings: readonly Phs0ContractFinding[];
}>;

const EXPECTED_COUNTS = Object.freeze({
  abiCases: 8,
  baselineRenderedRecipes: 7,
  gestureCases: 12,
  mutationControls: 16,
  partitionCases: 10,
  authorities: 8,
  traces: 18,
});

const EXPECTED_RENDER_MODES = [
  "independent-note",
  "stateful-phrase",
  "coupled-stem",
] as const;
const EXPECTED_FAMILIES = [
  "clarinet",
  "flute",
  "guitar",
  "trumpet",
  "vibraphone",
] as const;
const EXPECTED_COMPANION_SHA256 = Object.freeze({
  "abi-cases.json": "f59b44a2a558e2a3270e7ead98050d8b391be0e290b3959e36dc9a037645235d",
  "baseline.json": "918a80bdb0e0213158b3366933da9f0a7ee5b2339c7ab45addda0834869f0524",
  "gesture-cases.json": "e774ef12f9ed0bbb390b4bc9a84b28f6486ed08d0eb39dbde32f050a38c0630f",
  "mutation-controls.json": "7987c1323bf5f8ed8b19205df64f9a2f20e4472ab1bedd93bb1edae613cb767e",
  "partition-cases.json": "70269b37406f65cc5a27e559f73ca2b056d15df00774439578b3a14444dab00c",
  "provenance-ledger.json": "2067076195644e56735485afbe7296dde2de34a08d51bb6e2383cc9c0bc593f7",
  "trace-ledger.json": "ba9c2062a350f34c088137a01fbff71d11e635224284747982b08f6af8915c4c",
});
const EXPECTED_LIMITS = Object.freeze({
  supportedSampleRatesHz: [44_100, 48_000, 96_000],
  playbackPpq: 960,
  maximumCurvesPerGesture: 12,
  maximumPointsPerCurve: 64,
  maximumPointsPerGesture: 256,
  maximumControlOffsetTicks: 230_400,
  maximumEventsPerPhrase: 128,
  maximumEventsPerStem: 512,
  maximumPhraseSeconds: 30,
  maximumStemSeconds: 30,
  maximumCoupledVoices: 64,
  maximumOutputFrames: 2_880_000,
  maximumOutputBytes: 23_040_000,
  maximumScratchBytes: 67_108_864,
  maximumRequestBytes: 65_536,
  maximumDiagnostics: 64,
  maximumCacheEntries: 256,
  maximumCachePcmBytes: 100_663_296,
  maximumNonlinearIterations: 8,
  maximumFallbackBisections: 16,
  maximumStateHandoffBytes: 262_144,
});

const DEFAULT_ROOT = new URL(
  "../tests/fixtures/physical-renderer",
  import.meta.url,
).pathname;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function object(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function readJson(path: string): Promise<JsonObject> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isObject(parsed)) throw new Error(`PHS0_JSON_OBJECT: ${path}`);
  return parsed;
}

function finding(
  findings: Phs0ContractFinding[],
  code: string,
  path: string,
  message: string,
): void {
  findings.push(Object.freeze({ code, path, message }));
}

function requireUniqueIds(
  findings: Phs0ContractFinding[],
  rows: unknown[],
  path: string,
): void {
  const seen = new Set<string>();
  for (const [index, raw] of rows.entries()) {
    const id = object(raw).id;
    if (typeof id !== "string" || id.length === 0 || seen.has(id)) {
      finding(
        findings,
        "PHS0_IDS",
        `${path}/${String(index)}/id`,
        "ID must be non-empty and unique",
      );
    } else {
      seen.add(id);
    }
  }
}

function caseById(rows: unknown[], id: string): JsonObject {
  return object(rows.find((row) => object(row).id === id));
}

export async function validatePhs0Contract(
  fixtureRoot = DEFAULT_ROOT,
): Promise<Phs0ContractValidationReport> {
  const root = resolve(fixtureRoot);
  const [contract, abi, baseline, gestures, mutations, partitions, provenance, traces] =
    await Promise.all([
      readJson(resolve(root, "phs0-contract.json")),
      readJson(resolve(root, "abi-cases.json")),
      readJson(resolve(root, "baseline.json")),
      readJson(resolve(root, "gesture-cases.json")),
      readJson(resolve(root, "mutation-controls.json")),
      readJson(resolve(root, "partition-cases.json")),
      readJson(resolve(root, "provenance-ledger.json")),
      readJson(resolve(root, "trace-ledger.json")),
    ]);
  const findings: Phs0ContractFinding[] = [];

  if (contract.schema !== "changes.fixtures.phs0-contract.v1") {
    finding(findings, "PHS0_SCHEMA", "/schema", "Unexpected contract schema");
  }
  const schemas = object(contract.schemas);
  if (schemas.abiVersion !== 2) {
    finding(findings, "PHS0_ABI_VERSION", "/schemas/abiVersion", "ABI version must be 2");
  }
  const independence = object(contract.independence);
  if (
    independence.expectedValuesGenerated !== false ||
    independence.productionImportsForbidden !== true ||
    independence.productionOutputUsed !== false
  ) {
    finding(findings, "PHS0_INDEPENDENCE", "/independence", "Fixture independence law changed");
  }
  if (canonical(contract.renderModes) !== canonical(EXPECTED_RENDER_MODES)) {
    finding(findings, "PHS0_RENDER_MODES", "/renderModes", "Render modes or ordering changed");
  }
  if (canonical(contract.instrumentFamilies) !== canonical(EXPECTED_FAMILIES)) {
    finding(findings, "PHS0_INSTRUMENT_FAMILIES", "/instrumentFamilies", "Instrument families or ordering changed");
  }
  if (canonical(contract.reviewedCompanionSha256) !== canonical(EXPECTED_COMPANION_SHA256)) {
    finding(findings, "PHS0_COMPANION_DIGESTS", "/reviewedCompanionSha256", "Reviewed companion digest table changed");
  }
  for (const [filename, expectedSha256] of Object.entries(EXPECTED_COMPANION_SHA256)) {
    const bytes = await readFile(resolve(root, filename));
    const actualSha256 = createHash("sha256").update(bytes).digest("hex");
    if (actualSha256 !== expectedSha256) {
      finding(findings, "PHS0_COMPANION_DIGEST", `/${filename}`, "Companion bytes differ from the reviewed digest");
    }
  }
  if (canonical(contract.limits) !== canonical(EXPECTED_LIMITS)) {
    finding(findings, "PHS0_LIMITS", "/limits", "Exact physical limits changed");
  }
  const numeric = object(contract.numericPolicy);
  if (
    numeric.controlRepresentation !== "signed-q16.16" ||
    numeric.fractionalBits !== 16 ||
    numeric.wallTimeAffectsMusicalOutput !== false ||
    numeric.nonFiniteOutputPermitted !== false ||
    numeric.silentCoefficientRepairPermitted !== false ||
    numeric.legacyEarlyRmsNormalizationPermittedInV2 !== false ||
    numeric.safetyLimiterIsMusicalNormalizer !== false
  ) {
    finding(findings, "PHS0_NUMERIC_POLICY", "/numericPolicy", "Numeric safety or normalization law changed");
  }
  const partitionPolicy = object(contract.partitionPolicy);
  if (
    partitionPolicy.windAndBrassLegatoMode !== "stateful-phrase" ||
    partitionPolicy.sharedResonanceMode !== "coupled-stem" ||
    partitionPolicy.loopRestartsFromCanonicalState !== true ||
    partitionPolicy.wallTimeFallbackPermitted !== false
  ) {
    finding(findings, "PHS0_PARTITION_POLICY", "/partitionPolicy", "State continuity or deterministic fallback law changed");
  }

  const abiCases = array(abi.cases);
  const renderedRecipes = array(baseline.renderedRecipes);
  const gestureCases = array(gestures.cases);
  const mutationControls = array(mutations.controls);
  const partitionCases = array(partitions.cases);
  const authorities = array(provenance.authorities);
  const traceRows = array(traces.traces);
  const counts = Object.freeze({
    abiCases: abiCases.length,
    baselineRenderedRecipes: renderedRecipes.length,
    gestureCases: gestureCases.length,
    mutationControls: mutationControls.length,
    partitionCases: partitionCases.length,
    authorities: authorities.length,
    traces: traceRows.length,
  });
  if (canonical(counts) !== canonical(EXPECTED_COUNTS) || canonical(contract.counts) !== canonical(EXPECTED_COUNTS)) {
    finding(findings, "PHS0_COUNTS", "/counts", "Reviewed packet counts changed");
  }
  requireUniqueIds(findings, abiCases, "/abi-cases/cases");
  requireUniqueIds(findings, renderedRecipes, "/baseline/renderedRecipes");
  requireUniqueIds(findings, gestureCases, "/gesture-cases/cases");
  requireUniqueIds(findings, mutationControls, "/mutation-controls/controls");
  requireUniqueIds(findings, partitionCases, "/partition-cases/cases");
  requireUniqueIds(findings, authorities, "/provenance-ledger/authorities");

  if (object(caseById(gestureCases, "PHS0-GEST-007").expected).code !== "physical.control_points_unsorted") {
    finding(findings, "PHS0_GESTURE_EXPECTATION", "/gesture-cases/PHS0-GEST-007", "Unsorted-point witness changed");
  }
  if (object(caseById(partitionCases, "PHS0-PART-001").expected).mode !== "stateful-phrase") {
    finding(findings, "PHS0_PARTITION_EXPECTATION", "/partition-cases/PHS0-PART-001", "Clarinet legato must remain stateful");
  }
  if (object(caseById(abiCases, "PHS0-ABI-002").expected).code !== "physical.schema_unsupported") {
    finding(findings, "PHS0_ABI_EXPECTATION", "/abi-cases/PHS0-ABI-002", "Unsupported ABI witness changed");
  }
  const rootArtifact = object(baseline.rootArtifact);
  if (rootArtifact.withinArchitectureFinalTarget !== false || rootArtifact.gitBlobBytes !== 7_652_006) {
    finding(findings, "PHS0_BASELINE_SIZE", "/baseline/rootArtifact", "Committed over-budget baseline must remain honestly recorded");
  }
  if (object(baseline.persistentGraph).rendererMayCreatePersistentGraph !== false) {
    finding(findings, "PHS0_BASELINE_GRAPH", "/baseline/persistentGraph", "Physical renderer may not own a second persistent graph");
  }
  if (baseline.schema !== "changes.fixtures.phs0-baseline.v1") {
    finding(findings, "PHS0_COMPANION_SCHEMA", "/baseline/schema", "Baseline schema changed");
  }
  if (abi.schema !== "changes.fixtures.phs0-abi-cases.v1" || gestures.schema !== "changes.fixtures.phs0-gesture-cases.v1" || partitions.schema !== "changes.fixtures.phs0-partition-cases.v1") {
    finding(findings, "PHS0_COMPANION_SCHEMA", "/companions", "Case companion schema changed");
  }

  return Object.freeze({
    schema: "changes.validation.phs0-contract.v1",
    package: "PHS0",
    outcome: findings.length === 0 ? "pass" : "fail",
    counts,
    findings: Object.freeze(findings),
  });
}

if (import.meta.main) {
  const fixtureArg = process.argv.find((value) => value.startsWith("--fixture-root="));
  const report = await validatePhs0Contract(fixtureArg?.slice("--fixture-root=".length));
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.outcome === "pass" ? 0 : 1;
}
