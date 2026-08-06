import { createHash } from "node:crypto";

export const FOUNDRY_LIMITS = Object.freeze({
  maximumParameters: 64,
  maximumSourceObservations: 512,
  maximumModes: 256,
  maximumObjectives: 16,
  maximumRegimes: 32,
  maximumOptimizerEvaluations: 4_096,
  maximumGradientChecks: 64,
  maximumSensitivityPerturbations: 256,
  maximumScratchBytes: 2_147_483_648,
});

const UNITS = new Set([
  "1", "Hz", "kg", "kg/m3", "m", "m2", "m3/s", "m/s", "N/m", "N*s/m",
  "Pa", "s",
]);
const DISTRIBUTIONS = new Set([
  "distributable",
  "local-evidence-only",
  "forbidden-runtime",
]);
const SENSITIVITIES = new Set(["low", "medium", "high"]);
const SHA256 = /^[0-9a-f]{64}$/;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type RecordValue = Record<string, unknown>;

export type FoundryFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type PackValidation = Readonly<{
  outcome: "accept" | "refuse";
  findings: readonly FoundryFinding[];
}>;

function record(value: unknown): RecordValue | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function canonicalValue(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("FOUNDRY_NON_FINITE_NUMBER");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  const object = record(value);
  if (object === null) throw new Error("FOUNDRY_NON_JSON_VALUE");
  return `{${Object.keys(object).sort().map((key) => {
    const child = object[key];
    if (child === undefined) throw new Error("FOUNDRY_NON_JSON_VALUE");
    return `${JSON.stringify(key)}:${canonicalValue(child)}`;
  }).join(",")}}`;
}

export function canonicalJson(value: unknown): string {
  return `${canonicalValue(value)}\n`;
}

export function sha256Hex(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function parameterPackContentSha256(pack: RecordValue): string {
  return sha256Hex(canonicalJson(Object.fromEntries(
    Object.entries(pack).filter(([key]) => key !== "contentSha256"),
  )));
}

function finding(code: string, path: string, message: string): FoundryFinding {
  return Object.freeze({ code, path, message });
}

function refusal(code: string, path: string, message: string): PackValidation {
  return Object.freeze({ outcome: "refuse", findings: [finding(code, path, message)] });
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function boundedInteger(value: unknown, maximum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum;
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function authorityMap(ledgerValue: unknown): Map<string, RecordValue> | null {
  const ledger = record(ledgerValue);
  if (ledger?.["schema"] !== "changes.fixtures.phs1-provenance-ledger.v1" || !Array.isArray(ledger["authorities"])) return null;
  const result = new Map<string, RecordValue>();
  for (const item of ledger["authorities"]) {
    const authority = record(item);
    if (authority === null || !nonempty(authority["id"]) || result.has(authority["id"])) return null;
    result.set(authority["id"], authority);
  }
  return result;
}

export function validateParameterPack(value: unknown, ledgerValue: unknown): PackValidation {
  const pack = record(value);
  if (pack === null || pack["schema"] !== "changes.physical.parameter-pack.v1") {
    return refusal("PHS1_SCHEMA", "/schema", "Unexpected pack schema.");
  }
  const required = [
    "packVersion", "family", "contentSha256", "parameters", "sourceDigests",
    "solver", "objectives", "residuals", "sensitivity", "review",
    "distributionClass", "modes", "applicabilityBounds",
  ];
  for (const key of required) {
    if (!(key in pack)) return refusal("PHS1_SCHEMA", `/${key}`, "Required field is absent.");
  }
  if (!nonempty(pack["packVersion"]) || !nonempty(pack["family"])) {
    return refusal("PHS1_SCHEMA", "/packVersion", "Pack identity is incomplete.");
  }
  const authorities = authorityMap(ledgerValue);
  if (authorities === null) return refusal("PHS1_PROVENANCE", "/authorities", "Authority ledger is absent or malformed.");
  const distribution = pack["distributionClass"];
  if (!DISTRIBUTIONS.has(String(distribution))) {
    return refusal("PHS1_DISTRIBUTION", "/distributionClass", "Unknown distribution class.");
  }
  if (distribution !== "distributable") {
    return refusal("PHS1_DISTRIBUTION", "/distributionClass", "Only distributable packs may generate runtime data.");
  }
  let digest: string;
  try {
    digest = parameterPackContentSha256(pack);
  } catch {
    return refusal("PHS1_FINITE_NUMBER", "/", "Pack is not finite canonical JSON.");
  }
  if (!SHA256.test(String(pack["contentSha256"])) || pack["contentSha256"] !== digest) {
    return refusal("PHS1_CONTENT_DIGEST", "/contentSha256", "Canonical content digest disagrees.");
  }
  const sourceDigests = Array.isArray(pack["sourceDigests"]) ? pack["sourceDigests"] : [];
  if (sourceDigests.length === 0 || sourceDigests.length > FOUNDRY_LIMITS.maximumSourceObservations || sourceDigests.some((sourceDigest) => !SHA256.test(String(sourceDigest)))) {
    return refusal("PHS1_SOURCE_DIGEST", "/sourceDigests", "Source digests must be bounded lowercase SHA-256 values.");
  }
  const parameters = Array.isArray(pack["parameters"]) ? pack["parameters"] : [];
  if (parameters.length === 0 || parameters.length > FOUNDRY_LIMITS.maximumParameters) {
    return refusal("PHS1_WORK_BOUND", "/parameters", "Parameter count is outside its inclusive bound.");
  }
  const parameterIds = new Set<string>();
  for (let index = 0; index < parameters.length; index += 1) {
    const parameter = record(parameters[index]);
    const path = `/parameters/${String(index)}`;
    if (parameter === null || !nonempty(parameter["id"]) || parameterIds.has(parameter["id"])) {
      return refusal("PHS1_PARAMETER_ID", `${path}/id`, "Parameter ID must be non-empty and unique.");
    }
    parameterIds.add(parameter["id"]);
    if (!UNITS.has(String(parameter["unit"]))) {
      return refusal("PHS1_PARAMETER_UNIT", `${path}/unit`, "Unit is not in the closed SI vocabulary.");
    }
    for (const key of ["value", "minimum", "maximum"] as const) {
      if (!finite(parameter[key])) return refusal("PHS1_FINITE_NUMBER", `${path}/${key}`, "Parameter scalar must be finite.");
    }
    if ((parameter["minimum"] as number) > (parameter["maximum"] as number) || (parameter["value"] as number) < (parameter["minimum"] as number) || (parameter["value"] as number) > (parameter["maximum"] as number)) {
      return refusal("PHS1_PARAMETER_RANGE", `${path}/value`, "Parameter lies outside the inclusive reviewed range.");
    }
    if (!nonempty(parameter["sourceAuthorityId"]) || !nonempty(parameter["method"]) || !nonempty(parameter["licenseGrant"]) || !SENSITIVITIES.has(String(parameter["sensitivity"]))) {
      return refusal("PHS1_PROVENANCE", path, "Parameter provenance is incomplete.");
    }
    const authority = authorities.get(parameter["sourceAuthorityId"]);
    if (authority === undefined || authority["distributionClass"] !== "distributable" || authority["runtimeGenerationPermitted"] === false) {
      return refusal("PHS1_PROVENANCE", `${path}/sourceAuthorityId`, "Authority does not permit distributable runtime generation.");
    }
  }
  const solver = record(pack["solver"]);
  if (solver === null || !nonempty(solver["name"]) || !nonempty(solver["commit"]) || !finite(solver["version"]) || !boundedInteger(solver["seed"], Number.MAX_SAFE_INTEGER) || record(solver["config"]) === null) {
    return refusal("PHS1_SOLVER_PROVENANCE", "/solver", "Solver identity, revision, seed, or configuration is incomplete.");
  }
  if (!boundedInteger(solver["evaluations"], FOUNDRY_LIMITS.maximumOptimizerEvaluations) || !boundedInteger(solver["maximumEvaluations"], FOUNDRY_LIMITS.maximumOptimizerEvaluations) || Number(solver["evaluations"]) > Number(solver["maximumEvaluations"])) {
    return refusal("PHS1_WORK_BOUND", "/solver/evaluations", "Solver evaluation bound was exceeded.");
  }
  if (!boundedInteger(solver["gradientChecks"], FOUNDRY_LIMITS.maximumGradientChecks) || !boundedInteger(solver["scratchBytes"], FOUNDRY_LIMITS.maximumScratchBytes)) {
    return refusal("PHS1_WORK_BOUND", "/solver/gradientChecks", "Solver gradient or memory bound was exceeded.");
  }
  const objectives = Array.isArray(pack["objectives"]) ? pack["objectives"] : [];
  const objectiveIds = new Set<string>();
  if (objectives.length === 0 || objectives.length > FOUNDRY_LIMITS.maximumObjectives || objectives.some((item) => {
    const objective = record(item);
    if (objective === null || !nonempty(objective["id"]) || objectiveIds.has(objective["id"]) || !finite(objective["weight"]) || Number(objective["weight"]) <= 0) return true;
    objectiveIds.add(objective["id"]);
    return false;
  })) return refusal("PHS1_OBJECTIVES", "/objectives", "Objectives must be bounded, named, and positively weighted.");
  const residuals = record(pack["residuals"]);
  if (residuals === null || !finite(residuals["terminal"]) || !finite(residuals["maximum"]) || Number(residuals["terminal"]) < 0 || Number(residuals["terminal"]) > Number(residuals["maximum"])) {
    return refusal("PHS1_RESIDUAL", "/residuals", "Terminal residual exceeds the reviewed nonnegative maximum.");
  }
  const sensitivity = record(pack["sensitivity"]);
  if (sensitivity === null || !boundedInteger(sensitivity["perturbations"], FOUNDRY_LIMITS.maximumSensitivityPerturbations) || !finite(sensitivity["maximumNormalizedChange"]) || !finite(sensitivity["reviewedMaximum"]) || Number(sensitivity["maximumNormalizedChange"]) < 0 || Number(sensitivity["reviewedMaximum"]) < 0 || Number(sensitivity["maximumNormalizedChange"]) > Number(sensitivity["reviewedMaximum"])) {
    return refusal("PHS1_SENSITIVITY", "/sensitivity", "Sensitivity evidence is absent, excessive, or outside its reviewed envelope.");
  }
  const regimes = pack["regimes"] === undefined ? [] : Array.isArray(pack["regimes"]) ? pack["regimes"] : null;
  if (regimes === null || regimes.length > FOUNDRY_LIMITS.maximumRegimes) {
    return refusal("PHS1_WORK_BOUND", "/regimes", "Regime count exceeds its inclusive bound.");
  }
  const review = record(pack["review"]);
  if (review === null || !nonempty(review["reviewer"]) || !/^\d{4}-\d{2}-\d{2}$/.test(String(review["date"]))) {
    return refusal("PHS1_REVIEW", "/review", "Independent reviewer identity or ISO date is absent.");
  }
  const applicability = record(pack["applicabilityBounds"]);
  if (applicability === null || Object.keys(applicability).length === 0) {
    return refusal("PHS1_APPLICABILITY", "/applicabilityBounds", "Reviewed applicability bounds are absent.");
  }
  const modes = Array.isArray(pack["modes"]) ? pack["modes"] : [];
  if (modes.length > FOUNDRY_LIMITS.maximumModes) return refusal("PHS1_WORK_BOUND", "/modes", "Mode count exceeds its bound.");
  for (let index = 0; index < modes.length; index += 1) {
    const mode = record(modes[index]);
    if (mode === null || !finite(mode["estimateHz"]) || !finite(mode["lowerHz"]) || !finite(mode["upperHz"]) || !finite(mode["residual"]) || Number(mode["residual"]) < 0 || Number(mode["lowerHz"]) > Number(mode["estimateHz"]) || Number(mode["estimateHz"]) > Number(mode["upperHz"])) {
      return refusal("PHS1_MODE_CERTIFICATE", `/modes/${String(index)}`, "Mode estimate is not enclosed by a finite residual certificate.");
    }
  }
  return Object.freeze({ outcome: "accept", findings: Object.freeze([]) });
}

function rustString(value: unknown): string {
  let encoded = "\"";
  for (const character of String(value)) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (character === "\"") encoded += "\\\"";
    else if (character === "\\") encoded += "\\\\";
    else if (character === "\n") encoded += "\\n";
    else if (character === "\r") encoded += "\\r";
    else if (character === "\t") encoded += "\\t";
    else if (codePoint < 0x20 || codePoint === 0x7f) encoded += `\\u{${codePoint.toString(16)}}`;
    else encoded += character;
  }
  return `${encoded}\"`;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function generateRustParameterTable(packValue: unknown, ledgerValue: unknown): string | null {
  if (validateParameterPack(packValue, ledgerValue).outcome !== "accept") return null;
  const pack = packValue as RecordValue;
  const parameters = (pack["parameters"] as unknown[]).map((item) => record(item) ?? {}).sort((left, right) => compareCodeUnits(String(left["id"]), String(right["id"])));
  const modes = (pack["modes"] as unknown[]).map((item) => record(item) ?? {}).sort((left, right) => Number(left["estimateHz"]) - Number(right["estimateHz"]));
  const rows = parameters.map((parameter) => `    (${rustString(parameter["id"])}, ${rustString(parameter["unit"])}, ${String(parameter["value"])}f64, ${String(parameter["minimum"])}f64, ${String(parameter["maximum"])}f64),`).join("\n");
  const modeRows = modes.map((mode) => `    (${String(mode["estimateHz"])}f64, ${String(mode["lowerHz"])}f64, ${String(mode["upperHz"])}f64, ${String(mode["residual"])}f64),`).join("\n");
  return `// @generated by scripts/physical-foundry.ts; do not edit.\n` +
    `pub const PARAMETER_TABLE_SCHEMA: &str = "changes.physical.parameter-table.v1";\n` +
    `pub const PARAMETER_PACK_VERSION: &str = ${rustString(pack["packVersion"])};\n` +
    `pub const PARAMETER_PACK_SHA256: &str = ${rustString(pack["contentSha256"])};\n` +
    `pub const PARAMETER_FAMILY: &str = ${rustString(pack["family"])};\n` +
    `pub const PARAMETERS: &[(&str, &str, f64, f64, f64)] = &[\n${rows}\n];\n` +
    `pub const CERTIFIED_MODES: &[(f64, f64, f64, f64)] = &[\n${modeRows}\n];\n` +
    `pub const APPLICABILITY_BOUNDS_JSON: &str = ${rustString(canonicalJson(pack["applicabilityBounds"]).trimEnd())};\n`;
}

export function evaluateAnalyticMetricCase(caseValue: unknown): Readonly<RecordValue> {
  const row = record(caseValue);
  const signal = record(row?.["signal"]);
  if (row === null || signal === null) return Object.freeze({ outcome: "refuse", code: "PHS1_METRIC_CASE" });
  const family = String(row["family"]);
  let result: RecordValue;
  try {
    switch (family) {
      case "fundamental-pitch": result = { frequencyHz: finite(signal["frequencyHz"]) ? signal["frequencyHz"] : Number.NaN }; break;
      case "partials": {
        const fundamental = Number(signal["fundamentalHz"]);
        const amplitudes = [...(signal["amplitudes"] as number[])];
        result = { frequenciesHz: amplitudes.map((_, index) => fundamental * (index + 1)), amplitudes };
        break;
      }
      case "impedance-peaks": result = { peakHz: signal["centerHz"], q: signal["q"] }; break;
      case "attack-release": result = { attackSeconds: signal["attackSeconds"], releaseSeconds: signal["releaseSeconds"] }; break;
      case "spectral-centroid": {
        const frequencies = signal["frequenciesHz"] as number[];
        const magnitudes = signal["magnitudes"] as number[];
        const total = magnitudes.reduce((sum, item) => sum + item, 0);
        result = { centroidHz: frequencies.reduce((sum, item, index) => sum + item * (magnitudes[index] ?? 0), 0) / total };
        break;
      }
      case "harmonic-to-noise": result = { hnrDb: 10 * Math.log10(Number(signal["harmonicEnergy"]) / Number(signal["noiseEnergy"])) }; break;
      case "odd-even-balance": result = { oddEvenDb: 10 * Math.log10(Number(signal["oddEnergy"]) / Number(signal["evenEnergy"])) }; break;
      case "partial-trajectories": result = { slopeHzPerSecond: (Number(signal["endHz"]) - Number(signal["startHz"])) / Number(signal["seconds"]) }; break;
      case "decay-slopes": result = { slopeDbPerSecond: 20 * Math.log10(Number(signal["end"]) / Number(signal["start"])) / Number(signal["seconds"]) }; break;
      case "regime-classification": result = { regime: Number(signal["attackSeconds"]) <= 0.01 && Number(signal["oddEvenDb"]) >= 6 ? "hard-attack-odd-dominant" : "other" }; break;
      case "modulation-sidebands": result = { frequenciesHz: [Number(signal["carrierHz"]) - Number(signal["modulationHz"]), Number(signal["carrierHz"]), Number(signal["carrierHz"]) + Number(signal["modulationHz"])] }; break;
      case "alias-energy": result = { aliasDb: 10 * Math.log10(Number(signal["aliasBandEnergy"]) / Number(signal["totalEnergy"])) }; break;
      case "boundary-continuity": result = { valueJump: Math.abs(Number(signal["rightValue"]) - Number(signal["leftValue"])), slopeJump: Math.abs(Number(signal["rightSlope"]) - Number(signal["leftSlope"])) }; break;
      case "energy-residual": result = { normalizedResidual: Math.abs(Number(signal["final"]) - (Number(signal["initial"]) + Number(signal["injected"]) - Number(signal["dissipated"]))) / Number(signal["initial"]) }; break;
      case "limiter-activation": result = { activationCount: (signal["peaks"] as number[]).filter((peak) => peak > Number(signal["threshold"])).length }; break;
      default: return Object.freeze({ outcome: "refuse", code: "PHS1_METRIC_FAMILY" });
    }
  } catch {
    return Object.freeze({ outcome: "refuse", code: "PHS1_METRIC_INPUT" });
  }
  try {
    canonicalJson(result);
  } catch {
    return Object.freeze({ outcome: "refuse", code: "PHS1_METRIC_INPUT" });
  }
  return Object.freeze({ outcome: "accept", ...result });
}

export function assessMetricExpectation(caseValue: unknown, metricValue: unknown): "accept" | "refuse" {
  const row = record(caseValue);
  const expected = record(row?.["expected"]);
  const metric = record(metricValue);
  if (row === null || expected === null || metric?.["outcome"] !== "accept") return "refuse";
  const family = String(row["family"]);
  const within = (actual: unknown, target: unknown, tolerance: unknown): boolean =>
    finite(actual) && finite(target) && finite(tolerance) && Math.abs(actual - target) <= tolerance;
  const arraysWithin = (actual: unknown, target: unknown, tolerance: unknown): boolean =>
    Array.isArray(actual) && Array.isArray(target) && actual.length === target.length && actual.every((item, index) => within(item, target[index], tolerance));
  if (family === "fundamental-pitch") {
    const cents = 1_200 * Math.log2(Number(metric["frequencyHz"]) / Number(expected["frequencyHz"]));
    return Math.abs(cents) <= Number(expected["toleranceCents"]) ? "accept" : "refuse";
  }
  if (family === "partials") {
    const tolerance = Number(expected["relativeTolerance"]);
    const frequencies = metric["frequenciesHz"] as unknown[];
    const expectedFrequencies = expected["frequenciesHz"] as unknown[];
    const amplitudes = metric["amplitudes"] as unknown[];
    const expectedAmplitudes = expected["amplitudes"] as unknown[];
    const relative = (actual: unknown, target: unknown): boolean => Array.isArray(actual) && Array.isArray(target) && actual.length === target.length && actual.every((item, index) => Math.abs(Number(item) - Number(target[index])) <= Math.abs(Number(target[index])) * tolerance);
    return relative(frequencies, expectedFrequencies) && relative(amplitudes, expectedAmplitudes) ? "accept" : "refuse";
  }
  if (family === "impedance-peaks") {
    const relative = Number(expected["relativeTolerance"]);
    return Math.abs(Number(metric["peakHz"]) - Number(expected["peakHz"])) <= Number(expected["peakHz"]) * relative && Math.abs(Number(metric["q"]) - Number(expected["q"])) <= Number(expected["q"]) * relative ? "accept" : "refuse";
  }
  if (family === "attack-release") return within(metric["attackSeconds"], expected["attackSeconds"], expected["toleranceSeconds"]) && within(metric["releaseSeconds"], expected["releaseSeconds"], expected["toleranceSeconds"]) ? "accept" : "refuse";
  if (family === "spectral-centroid") return within(metric["centroidHz"], expected["centroidHz"], expected["toleranceHz"]) ? "accept" : "refuse";
  if (family === "harmonic-to-noise") return within(metric["hnrDb"], expected["hnrDb"], expected["toleranceDb"]) ? "accept" : "refuse";
  if (family === "odd-even-balance") return within(metric["oddEvenDb"], expected["oddEvenDb"], expected["toleranceDb"]) ? "accept" : "refuse";
  if (family === "partial-trajectories") return within(metric["slopeHzPerSecond"], expected["slopeHzPerSecond"], expected["toleranceHzPerSecond"]) ? "accept" : "refuse";
  if (family === "decay-slopes") return within(metric["slopeDbPerSecond"], expected["slopeDbPerSecond"], expected["toleranceDbPerSecond"]) ? "accept" : "refuse";
  if (family === "regime-classification") return metric["regime"] === expected["regime"] ? "accept" : "refuse";
  if (family === "modulation-sidebands") return arraysWithin(metric["frequenciesHz"], expected["frequenciesHz"], expected["toleranceHz"]) ? "accept" : "refuse";
  if (family === "alias-energy" && finite(expected["maximumDb"])) return Number(metric["aliasDb"]) <= expected["maximumDb"] ? "accept" : "refuse";
  if (family === "boundary-continuity") return Number(metric["valueJump"]) <= Number(expected["maximumValueJump"]) && Number(metric["slopeJump"]) <= Number(expected["maximumSlopeJump"]) ? "accept" : "refuse";
  if (family === "energy-residual") return Number(metric["normalizedResidual"]) <= Number(expected["maximum"]) ? "accept" : "refuse";
  if (family === "limiter-activation") return Number(metric["activationCount"]) <= Number(expected["maximumPermitted"]) ? "accept" : "refuse";
  return "accept";
}

export function runFoundryCorpus(cases: readonly unknown[]): Readonly<RecordValue> {
  if (cases.length > FOUNDRY_LIMITS.maximumSourceObservations) {
    return Object.freeze({ schema: "changes.physical.foundry-receipt.v1", outcome: "refuse", firstDiagnostic: "PHS1_WORK_BOUND", casesVisited: 0 });
  }
  const results: Readonly<RecordValue>[] = cases.map((item) => {
    const metric = evaluateAnalyticMetricCase(item);
    const expected = record(record(item)?.["expected"]);
    const expectedAcceptance = expected?.["outcome"] === "refuse" ? "refuse" : "accept";
    const observedAcceptance = assessMetricExpectation(item, metric);
    return Object.freeze<RecordValue>({
      ...metric,
      expectedAcceptance,
      observedAcceptance,
      conforms: metric["outcome"] === "accept" && observedAcceptance === expectedAcceptance,
    });
  });
  const firstRefusal = results.findIndex((result) => result["conforms"] !== true);
  return Object.freeze({
    schema: "changes.physical.foundry-receipt.v1",
    outcome: firstRefusal === -1 ? "accept" : "refuse",
    firstDiagnostic: firstRefusal === -1 ? null : "PHS1_METRIC_THRESHOLD",
    inputSha256: sha256Hex(canonicalJson(cases)),
    toolRevision: "changes.physical-foundry.v1",
    solverRevisions: Object.freeze([]),
    numericProfile: "ECMAScript-f64",
    seed: 0,
    casesVisited: results.length,
    maximumCases: FOUNDRY_LIMITS.maximumSourceObservations,
    workCounters: Object.freeze({ casesVisited: results.length }),
    residualIntervals: Object.freeze([]),
    mutations: Object.freeze(cases.flatMap((item) => {
      const row = record(item);
      return record(row?.["expected"])?.["outcome"] === "refuse" ? [String(row?.["id"])] : [];
    })),
    distributionDecision: "not-applicable-synthetic-metrics",
    resultSha256: sha256Hex(canonicalJson(results)),
    wallTimeAffectsOutput: false,
    results: Object.freeze(results),
  });
}
