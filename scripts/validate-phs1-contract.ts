import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type Obj = Record<string, unknown>;
export type Phs1Finding = Readonly<{ code: string; path: string; message: string }>;
export type Phs1Report = Readonly<{
  schema: "changes.validation.phs1-foundry-contract.v1";
  package: "PHS1";
  outcome: "pass" | "fail";
  counts: Readonly<{ packCases: number; metricCases: number; metricFamilies: number; authorities: number; traces: number; mutationControls: number }>;
  findings: readonly Phs1Finding[];
}>;

const ROOT = new URL("../tests/fixtures/physical-foundry", import.meta.url).pathname;
const PIN = "b47259187a31b704f8f0faf6abdf49b32919b96a";
const FILE_HASHES = Object.freeze({
  "parameter-pack-cases.json": "6083923481780a8f83f90b4dc07ab5e7826efc5d5b75ee655731ed7c41eb1d5b",
  "metric-cases.json": "ab9be669668fa95451547ee27d2609d7b08c2a19f3aa14a1f5d119d8a31f5f16",
  "provenance-ledger.json": "f0c7a90d13be1451a0784239a115d93a10536f34b865140bd43e427d3019a443",
  "trace-ledger.json": "c723cf692b567f8e71cfc40f15395f9d7381fc187b696004cd430603b47b9880",
  "mutation-controls.json": "cf666268315f2680ede2981779a63ca44da9ddbd42cdecc55b066c76a8823ae2",
});
const METRICS = Object.freeze([
  "fundamental-pitch", "partials", "impedance-peaks", "attack-release",
  "spectral-centroid", "harmonic-to-noise", "odd-even-balance",
  "partial-trajectories", "decay-slopes", "regime-classification",
  "modulation-sidebands", "alias-energy", "boundary-continuity",
  "energy-residual", "limiter-activation",
]);
const LIMITS = Object.freeze({
  maximumParameters: 64, maximumSourceObservations: 512, maximumModes: 256,
  maximumObjectives: 16, maximumRegimes: 32, maximumOptimizerEvaluations: 4096,
  maximumGradientChecks: 64, maximumSensitivityPerturbations: 256,
  maximumScratchBytes: 2147483648,
});

function obj(value: unknown): Obj { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Obj : {}; }
function rows(value: unknown): Obj[] { return Array.isArray(value) ? value.map(obj) : []; }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) return `{${Object.keys(value as Obj).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Obj)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
async function readJson(path: string): Promise<Obj> { return obj(JSON.parse(await readFile(path, "utf8")) as unknown); }
function add(findings: Phs1Finding[], code: string, path: string, message: string): void { findings.push(Object.freeze({ code, path, message })); }
function unique(findings: Phs1Finding[], values: Obj[], path: string): void {
  const seen = new Set<string>();
  values.forEach((row, index) => {
    if (typeof row.id !== "string" || row.id.length === 0 || seen.has(row.id)) add(findings, "PHS1_IDS", `${path}/${index}/id`, "IDs must be non-empty and unique");
    else seen.add(row.id);
  });
}

export async function validatePhs1Contract(fixtureRoot = ROOT): Promise<Phs1Report> {
  const root = resolve(fixtureRoot);
  const [contract, packsDoc, metricsDoc, provenanceDoc, tracesDoc, mutationsDoc] = await Promise.all([
    readJson(resolve(root, "phs1-contract.json")), readJson(resolve(root, "parameter-pack-cases.json")),
    readJson(resolve(root, "metric-cases.json")), readJson(resolve(root, "provenance-ledger.json")),
    readJson(resolve(root, "trace-ledger.json")), readJson(resolve(root, "mutation-controls.json")),
  ]);
  const findings: Phs1Finding[] = [];
  const packs = rows(packsDoc.cases); const metrics = rows(metricsDoc.cases);
  const authorities = rows(provenanceDoc.authorities); const traces = rows(tracesDoc.traces);
  const controls = rows(mutationsDoc.controls);
  unique(findings, packs, "/parameter-pack-cases/cases"); unique(findings, metrics, "/metric-cases/cases");
  unique(findings, authorities, "/provenance/authorities"); unique(findings, traces, "/traces"); unique(findings, controls, "/mutations");

  if (contract.schema !== "changes.fixtures.phs1-foundry-contract.v1") add(findings, "PHS1_SCHEMA", "/schema", "Unexpected packet schema");
  if (contract.packSchema !== "changes.physical.parameter-pack.v1" || contract.runtimeTableSchema !== "changes.physical.parameter-table.v1") add(findings, "PHS1_SCHEMA", "/packSchema", "Pack or table schema changed");
  if (contract.frankensimSurveyCommit !== PIN) add(findings, "PHS1_FRANKENSIM_PIN", "/frankensimSurveyCommit", "FrankenSim input must be a reviewed commit pin");
  const boundary = obj(contract.foundryRuntimeBoundary);
  if (boundary.runtimeNetworkPermitted !== false || boundary.runtimeOptimizerPermitted !== false || boundary.runtimeSourceParserPermitted !== false || boundary.generatedTableIsDataOnly !== true) add(findings, "PHS1_RUNTIME_BOUNDARY", "/foundryRuntimeBoundary", "Foundry capability leaked into runtime");
  if (boundary.placeholderDigestMayClaimContentAddressing !== false) add(findings, "PHS1_PLACEHOLDER_DIGEST", "/foundryRuntimeBoundary/placeholderDigestMayClaimContentAddressing", "Name hashes are not content hashes");
  if (canonical(contract.distributionClasses) !== canonical(["distributable", "local-evidence-only", "forbidden-runtime"])) add(findings, "PHS1_DISTRIBUTION", "/distributionClasses", "Distribution classes changed");
  if (canonical(contract.requiredMetricFamilies) !== canonical(METRICS)) add(findings, "PHS1_METRIC_FAMILIES", "/requiredMetricFamilies", "Required metrics changed");
  if (canonical(contract.limits) !== canonical(LIMITS)) add(findings, "PHS1_LIMITS", "/limits", "Deterministic work bounds changed");
  const independence = obj(contract.independence);
  if (independence.productionImportsForbidden !== true || independence.productionOutputUsed !== false || independence.expectedValuesGenerated !== false) add(findings, "PHS1_INDEPENDENCE", "/independence", "Independent fixture authority changed");

  const declaredHashes = obj(contract.reviewedCompanionSha256);
  if (canonical(declaredHashes) !== canonical(FILE_HASHES)) add(findings, "PHS1_COMPANION_DIGESTS", "/reviewedCompanionSha256", "Reviewed digest table changed");
  for (const [name, expected] of Object.entries(FILE_HASHES)) {
    const actual = createHash("sha256").update(await readFile(resolve(root, name))).digest("hex");
    if (actual !== expected) add(findings, "PHS1_COMPANION_DIGEST", `/${name}`, "Companion bytes differ from reviewed bytes");
  }

  const packIds = new Set(packs.map((row) => row.id));
  if (packs.length !== 8 || packs.find((row) => row.id === "pack-plus-one-evaluations")?.expected !== "refuse" || !packIds.has("pack-invariance-octave-frequency-ratio")) add(findings, "PHS1_PACK_CASES", "/parameter-pack-cases/cases", "Positive, near-miss, invariant, boundary, and plus-one cases are required");
  const metricFamilies = new Set(metrics.map((row) => row.family));
  if (metrics.length !== 16 || METRICS.some((family) => !metricFamilies.has(family))) add(findings, "PHS1_METRIC_FAMILIES", "/metric-cases/cases", "Every metric family requires an analytic case");
  if (obj(metrics.find((row) => row.id === "metric-centroid")?.expected).centroidHz !== 250) add(findings, "PHS1_METRIC_KNOWN_ANSWER", "/metric-cases/cases/metric-centroid", "Two-bin centroid known answer changed");
  if (obj(metrics.find((row) => row.id === "metric-energy")?.expected).normalizedResidual !== 0.00005) add(findings, "PHS1_METRIC_KNOWN_ANSWER", "/metric-cases/cases/metric-energy", "Energy-ledger known answer changed");
  const frankensim = authorities.find((row) => row.id === "authority-frankensim-pin");
  if (frankensim?.commit !== PIN || frankensim?.distributionClass !== "forbidden-runtime" || frankensim?.runtimeGenerationPermitted !== false) add(findings, "PHS1_PROVENANCE", "/provenance/authorities/authority-frankensim-pin", "Unresolved license must refuse runtime generation");
  const local = authorities.find((row) => row.id === "authority-local-corpus");
  if (local?.rawBytesMayEnterRepository !== false || local?.runtimeGenerationPermitted !== false) add(findings, "PHS1_PROVENANCE", "/provenance/authorities/authority-local-corpus", "Local-only data boundary changed");
  const metricTrace = traces.find((row) => row.id === "trace-metrics");
  if (!Array.isArray(metricTrace?.fixtures) || metricTrace.fixtures.length !== 16) add(findings, "PHS1_TRACE_COVERAGE", "/trace-ledger/traces/trace-metrics", "Metric trace must cover all authored cases");
  if (controls.length !== 11) add(findings, "PHS1_MUTATIONS", "/mutation-controls/controls", "Reviewed mutation count changed");

  return Object.freeze({ schema: "changes.validation.phs1-foundry-contract.v1", package: "PHS1", outcome: findings.length === 0 ? "pass" : "fail", counts: Object.freeze({ packCases: packs.length, metricCases: metrics.length, metricFamilies: metricFamilies.size, authorities: authorities.length, traces: traces.length, mutationControls: controls.length }), findings: Object.freeze(findings) });
}

if (import.meta.main) {
  const report = await validatePhs1Contract(process.argv[2]);
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome !== "pass") process.exitCode = 1;
}
