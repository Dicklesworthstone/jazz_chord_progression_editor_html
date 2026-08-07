import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type Obj = Record<string, unknown>;
export type Finding = Readonly<{ code: string; path: string; message: string }>;
export type Report = Readonly<{
  schema: "changes.validation.phs3-flute-v2.v1";
  package: "PHS3";
  outcome: "pass" | "fail";
  counts: Readonly<{
    physicsCases: number;
    metricCases: number;
    metricFamilies: number;
    fingerings: number;
    authorities: number;
    traceRequirements: number;
    mutationControls: number;
  }>;
  findings: readonly Finding[];
}>;

const ROOT = new URL("../tests/fixtures/flute-v2", import.meta.url).pathname;
const LIMITS = {
  maximumEvents: 128,
  maximumPointsPerCurve: 64,
  maximumPointsPerGesture: 256,
  maximumBoreSections: 32,
  maximumToneHoles: 20,
  maximumJetDelaySamples: 8192,
  maximumNonlinearIterations: 8,
  maximumFallbackBisections: 16,
  maximumStateBytes: 262144,
  maximumPhraseSeconds: 30,
  maximumSampleRateHz: 96000,
};
const METRICS = [
  "jet-convection-delay", "jet-gain", "embouchure-end-correction", "impedance-peaks",
  "fingering-pitch", "attack-time", "harmonic-to-noise", "spectral-centroid",
  "decay-slopes", "octave-transition", "dynamic-brightness", "transposition-relations",
  "legato-continuity", "energy-residual",
];
function obj(value: unknown): Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Obj : {};
}
function arr(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function canon(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.keys(value as Obj).sort().map((key) => `${JSON.stringify(key)}:${canon((value as Obj)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
async function json(path: string): Promise<Obj> {
  return obj(JSON.parse(await readFile(path, "utf8")) as unknown);
}
function add(findings: Finding[], code: string, path: string, message: string): void {
  findings.push({ code, path, message });
}
function row(rows: unknown[], id: string): Obj {
  return obj(rows.find((value) => obj(value)["id"] === id));
}

export async function validatePhs3Contract(fixtureRoot = ROOT): Promise<Report> {
  const root = resolve(fixtureRoot);
  const [contract, physicsDoc, metricsDoc, provenanceDoc, traceDoc, mutationsDoc, geometry] = await Promise.all([
    json(resolve(root, "contract.json")), json(resolve(root, "physics-cases.json")),
    json(resolve(root, "metric-cases.json")), json(resolve(root, "provenance-ledger.json")),
    json(resolve(root, "trace-ledger.json")), json(resolve(root, "mutation-controls.json")),
    json(resolve(root, "geometry-cases.json")),
  ]);
  const findings: Finding[] = [];
  const physics = arr(physicsDoc["cases"]);
  const metrics = arr(metricsDoc["cases"]);
  const authorities = arr(provenanceDoc["authorities"]);
  const traces = arr(traceDoc["requirements"]);
  const mutations = arr(mutationsDoc["controls"]);
  const boreSections = arr(geometry["boreSections"]), toneHoles = arr(geometry["toneHoles"]), fingerings = arr(geometry["fingerings"]);
  if (contract["schema"] !== "changes.fixtures.phs3-flute-v2.v1" || contract["modelSchema"] !== "changes.dsp.flute-v2.v1") {
    add(findings, "PHS3_SCHEMA", "/schema", "Flute schema changed");
  }
  if (canon(contract["signs"]) !== canon({ pressure: "positive-compression", acousticFlow: "embouchure-to-bore", jetDisplacement: "toward-outside-of-edge", edgeSource: "jet-flow-derivative-dipole" })) {
    add(findings, "PHS3_SIGNS", "/signs", "Pressure, flow, jet, or edge-source sign changed");
  }
  const scope = obj(contract["scope"]);
  if (scope["vocalTractImpedance"] !== "explicitly-deferred" || scope["fullNavierStokes"] !== "offline-reference-only" || scope["runtimeSolver"] !== "reduced-order-passive-waveguide") {
    add(findings, "PHS3_SCOPE", "/scope", "Reduced-order runtime scope changed");
  }
  const controls = obj(contract["controls"]);
  if (canon(controls["mouthPressurePa"]) !== canon([0, 2000]) || canon(controls["jetSpeedMPerS"]) !== canon([0, 60]) || canon(controls["holeOpenness"]) !== canon([0, 1])) {
    add(findings, "PHS3_CONTROLS", "/controls", "Control units or reviewed ranges changed");
  }
  if (contract["fingeringLaw"] !== "geometry-selects-hole-admittances-never-target-frequency-delay" || contract["junctionLaw"] !== "serial-bidirectional-passive-scattering") {
    add(findings, "PHS3_GEOMETRY", "/fingeringLaw", "Geometry-derived fingering or serial scattering changed");
  }
  if (canon(contract["retainedLegatoState"]) !== canon(["bore-waves", "jet-convection-history", "loss-filters", "embouchure-radiation", "tone-hole-radiation", "turbulence-filters"])) {
    add(findings, "PHS3_STATE", "/retainedLegatoState", "Legato state continuity changed");
  }
  if (canon(contract["limits"]) !== canon(LIMITS)) add(findings, "PHS3_LIMITS", "/limits", "Deterministic bounds changed");
  if (canon(contract["requiredMetrics"]) !== canon(METRICS)) add(findings, "PHS3_METRICS", "/requiredMetrics", "Metric obligations changed");
  const independence = obj(contract["independence"]);
  if (independence["productionImportsForbidden"] !== true || independence["productionOutputUsed"] !== false || independence["expectedValuesGenerated"] !== false || independence["frankensimRuntimeImported"] !== false) {
    add(findings, "PHS3_INDEPENDENCE", "/independence", "Independent authority or license boundary changed");
  }
  if (physics.length !== 14 || row(physics, "solver-plus-one")["expected"] === undefined) add(findings, "PHS3_CASES", "/physics-cases", "Physics boundary corpus changed");
  if (geometry["schema"] !== "changes.fixtures.phs3-flute-geometry.v1" || boreSections.length !== 9 || toneHoles.length !== 8 || fingerings.length !== 4 || row(toneHoles, "h6")["positionM"] !== 0.438 || row(fingerings, "concert-flute-g4")["expectedFirstRadiator"] !== "h6") {
    add(findings, "PHS3_GEOMETRY_CASES", "/geometry-cases", "Reviewed bore, tone-hole, or fingering geometry changed");
  }
  if (obj(row(physics, "jet-convection-delay")["expected"])["seconds"] !== 0.00125) add(findings, "PHS3_KNOWN_ANSWER", "/physics-cases/jet-convection-delay", "Jet-delay answer changed");
  if (obj(row(physics, "active-three-port-mutation")["expected"])["outcome"] !== "refuse") add(findings, "PHS3_PASSIVITY", "/physics-cases/active-three-port-mutation", "Active scattering must refuse");
  if (metrics.length !== 12 || row(metrics, "octave-transposition")["expectedRatio"] !== 2) add(findings, "PHS3_KNOWN_ANSWER", "/metric-cases/octave-transposition", "Flute octave relation changed");
  const metricFamilies = new Set(metrics.map((value) => String(obj(value)["metric"])));
  for (const required of ["fingering-pitch", "jet-convection-delay", "harmonic-to-noise", "spectral-centroid", "attack-time", "decay-slopes", "octave-transition", "dynamic-brightness", "transposition-relations"]) {
    if (!metricFamilies.has(required)) add(findings, "PHS3_METRICS", "/metric-cases", `Missing ${required}`);
  }
  if (authorities.length !== 4 || row(authorities, "jet-drive-time-domain")["location"] !== "https://hal.science/hal-01426971" || obj(row(authorities, "frankensim-compact-bem-crosscheck"))["runtimeAuthority"] !== false) {
    add(findings, "PHS3_PROVENANCE", "/provenance-ledger", "Primary authority or Frankensim boundary changed");
  }
  if (traces.length !== 5) add(findings, "PHS3_TRACE", "/trace-ledger", "Requirement trace changed");
  if (mutations.length !== 13) add(findings, "PHS3_MUTATIONS", "/mutation-controls", "Mutation count changed");
  return {
    schema: "changes.validation.phs3-flute-v2.v1", package: "PHS3",
    outcome: findings.length === 0 ? "pass" : "fail",
    counts: { physicsCases: physics.length, metricCases: metrics.length, metricFamilies: metricFamilies.size, fingerings: fingerings.length, authorities: authorities.length, traceRequirements: traces.length, mutationControls: mutations.length },
    findings,
  };
}

if (import.meta.main) {
  const report = await validatePhs3Contract(process.argv[2]);
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome !== "pass") process.exitCode = 1;
}
