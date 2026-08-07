import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type Obj = Record<string, unknown>;

export type Finding = Readonly<{ code: string; path: string; message: string }>;
export type Report = Readonly<{
  schema: "changes.validation.phs5-trumpet-v1.v1";
  package: "PHS5";
  outcome: "pass" | "fail";
  counts: Readonly<{
    geometrySections: number;
    valveStates: number;
    physicsCases: number;
    metricCases: number;
    metricFamilies: number;
    authorities: number;
    traceRequirements: number;
    mutationControls: number;
  }>;
  findings: readonly Finding[];
}>;

const ROOT = new URL("../tests/fixtures/trumpet-v1", import.meta.url).pathname;
const LIMITS = {
  maximumEvents: 128,
  maximumPointsPerCurve: 64,
  maximumBoreSections: 48,
  maximumValveJunctions: 3,
  maximumLipIterations: 8,
  maximumLipLineSearchEvaluationsPerIteration: 4,
  maximumLipResidualEvaluations: 65,
  maximumFallbackBisections: 0,
  maximumOversampleFactor: 4,
  maximumStateBytes: 524_288,
  maximumPhraseSeconds: 30,
  maximumSampleRateHz: 96_000,
};
const SIGNS = {
  pressure: "positive-compression",
  flow: "mouth-to-mouthpiece",
  lipOpening: "outward-away-from-closed-channel",
  deltaPressure: "mouth-minus-mouthpiece",
  pressureForce: "increases-swinging-opening",
  localBernoulliForce: "drives-streamwise-retraction",
};
const LIP_MODEL_LAW =
  "adachi-sato-two-dimensional-swinging-and-stretching-lip-with-power-conjugate-pressure-ports-and-dynamic-channel-inertance";
const NORMAL_REGIME_LAW =
  "normal-lowest-open-note-is-the-second-impedance-regime-near-sounding-bb3;the-approximately-116-hz-missing-fundamental-is-pedal-only-and-cannot-certify-normal-register-acceptance";
const ADACHI_PDF_SHA256 = "e2e5b78d68912f2146b9026f1057fe2143f3a9c2830ffa2ee57ce1f475aa7a66";
const CONTROLS = {
  mouthPressurePa: [0, 12_000],
  lipResonanceHz: [80, 1_600],
  lipDampingRatio: [0.05, 1],
  equilibriumApertureM: [0, 0.002],
  tongueContact: [0, 1],
  valve1: [0, 1],
  valve2: [0, 1],
  valve3: [0, 1],
  vibratoRateHz: [0, 8],
  vibratoLipTensionDepth: [0, 0.08],
};
const RETAINED_LEGATO_STATE = [
  "lip-normal-motion",
  "lip-streamwise-motion",
  "lip-channel-flow-and-acceleration",
  "mouthpiece-cup-pressure",
  "bore-waves",
  "loss-memory",
  "valve-junctions",
  "nonlinear-propagation-memory",
  "bell-radiation",
];
const VALVE_COMPENSATION_M = {
  0: 0,
  1: 0.00001921101477833642,
  2: 0.00041074870816411313,
  3: 0.011134459053999901,
  4: 0.00013445905399989133,
  5: 0.0342145856299505,
  6: 0.017083943345463593,
  7: 0.06389393668844978,
};
const ADACHI_EQUATIONS = {
  lipOpeningArea: "S_lip=max(2*b*j_y,0)",
  lipSweptFlow: "U_lip=b*((j_x-j_joint_x)*j_y_dot-(j_y-j_joint_y)*j_x_dot)",
  channelInertance: "M=rho*d/S_lip",
  contractionPressureDrop: "rho*U*abs(U)/(2*S_lip^2)+M*dU_dt",
  expansionPressureChange: "-rho*U*abs(U)*(1/(S_cup*S_lip)-1/(2*S_cup^2))",
  combinedResistiveDrop: "rho*U*abs(U)*(1/S_lip-1/S_cup)^2/2",
};
const REGISTRY_AMENDMENT = {
  instrumentId: "trumpet",
  label: "Trumpet",
  mode: "additive",
  olderDocuments: "decode-unchanged",
  unknownIds: "retain-existing-refusal",
  midiProgram: 56,
};
const SCOPE = {
  vocalTractImpedance: "explicitly-deferred",
  fullCompressibleEuler: "offline-reference-only",
  runtimeApproximation: "reduced-weak-nonlinearity",
  pedalRegime: "diagnostic-no-claim-until-separately-proven",
};

function obj(value: unknown): Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Obj) : {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function canon(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.keys(value as Obj)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canon((value as Obj)[key])}`)
      .join(",")}}`;
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

function uniqueIds(rows: unknown[]): boolean {
  const ids = rows.map((value) => obj(value)["id"]);
  return ids.every((id) => typeof id === "string" && id.length > 0) && new Set(ids).size === ids.length;
}

export async function validatePhs5Contract(fixtureRoot = ROOT): Promise<Report> {
  const root = resolve(fixtureRoot);
  const [contract, geometry, physicsRoot, metricsRoot, provenance, tracesRoot, mutationsRoot, adachi] = await Promise.all([
    json(resolve(root, "contract.json")),
    json(resolve(root, "geometry-cases.json")),
    json(resolve(root, "physics-cases.json")),
    json(resolve(root, "metric-cases.json")),
    json(resolve(root, "provenance-ledger.json")),
    json(resolve(root, "trace-ledger.json")),
    json(resolve(root, "mutation-controls.json")),
    json(resolve(root, "adachi-reference.json")),
  ]);
  const findings: Finding[] = [];
  const sections = arr(geometry["sections"]);
  const states = arr(geometry["states"]);
  const physics = arr(physicsRoot["cases"]);
  const metrics = arr(metricsRoot["cases"]);
  const authorities = arr(provenance["authorities"]);
  const traces = arr(tracesRoot["requirements"]);
  const mutations = arr(mutationsRoot["controls"]);

  if (
    contract["schema"] !== "changes.fixtures.phs5-trumpet-v1.v1" ||
    contract["modelSchema"] !== "changes.dsp.trumpet-v1.v1"
  ) {
    add(findings, "PHS5_SCHEMA", "/schema", "Trumpet schema changed");
  }
  if (canon(contract["registryAmendment"]) !== canon(REGISTRY_AMENDMENT)) {
    add(findings, "PHS5_REGISTRY", "/registryAmendment", "Additive registry law changed");
  }
  if (canon(contract["signs"]) !== canon(SIGNS)) {
    add(findings, "PHS5_SIGNS", "/signs", "Two-dimensional lip pressure signs changed");
  }
  if (contract["lipModelLaw"] !== LIP_MODEL_LAW) {
    add(findings, "PHS5_LIP_MODEL", "/lipModelLaw", "Adachi-Sato lip topology changed");
  }
  if (contract["normalRegimeLaw"] !== NORMAL_REGIME_LAW) {
    add(findings, "PHS5_NORMAL_REGIME", "/normalRegimeLaw", "Normal Bb3 versus pedal admission law changed");
  }
  if (
    contract["stateMode"] !== "stateful-phrase" ||
    contract["resonatorLaw"] !==
      "bidirectional-variable-area-leadpipe-cylindrical-conical-bell-waveguide-with-viscothermal-loss" ||
    contract["valveLaw"] !==
      "three-continuous-passive-length-insertion-junctions-with-reviewed-combination-compensation" ||
    canon(contract["scope"]) !== canon(SCOPE)
  ) {
    add(findings, "PHS5_TOPOLOGY", "/topology", "Stateful resonator, valve, or declared scope changed");
  }
  if (canon(contract["controls"]) !== canon(CONTROLS)) {
    add(findings, "PHS5_CONTROLS", "/controls", "Control bounds changed");
  }
  if (
    contract["propagationLaw"] !==
    "bounded-weakly-nonlinear-wave-steepening-at-high-dynamic-with-4x-oversampling-and-antialias-filter"
  ) {
    add(findings, "PHS5_PROPAGATION", "/propagationLaw", "Nonlinear propagation law changed");
  }
  if (canon(contract["retainedLegatoState"]) !== canon(RETAINED_LEGATO_STATE)) {
    add(findings, "PHS5_STATE", "/retainedLegatoState", "State continuity changed");
  }
  if (canon(contract["limits"]) !== canon(LIMITS)) {
    add(findings, "PHS5_LIMITS", "/limits", "Bounded solver limits changed");
  }
  const independence = obj(contract["independence"]);
  if (
    independence["productionImportsForbidden"] !== true ||
    independence["productionOutputUsed"] !== false ||
    independence["expectedValuesGenerated"] !== false ||
    independence["clarinetExciterReused"] !== false
  ) {
    add(findings, "PHS5_INDEPENDENCE", "/independence", "Exciter independence changed");
  }

  const compensation = obj(geometry["combinationCompensationM"]);
  const normalPlayingRegime = obj(geometry["normalPlayingRegime"]);
  const halfWaveDiagnostics = obj(geometry["halfWaveGeometryDiagnostics"]);
  if (
    geometry["schema"] !== "changes.fixtures.phs5-trumpet-geometry.v1" ||
    geometry["soundSpeedMPerS"] !== 343 ||
    sections.length !== 8 ||
    states.length !== 8 ||
    row(arr(geometry["valves"]), "v2")["addedLengthM"] !== 0.087 ||
    canon(compensation) !== canon(VALVE_COMPENSATION_M) ||
    normalPlayingRegime["boreResonanceIndex"] !== 2 ||
    normalPlayingRegime["pedalMayCertifyNormalRegister"] !== false ||
    halfWaveDiagnostics["openHz"] !== 233.33333333333334
  ) {
    add(findings, "PHS5_GEOMETRY", "/geometry-cases", "Bore, valve, or normal-register geometry changed");
  }
  if (
    physicsRoot["schema"] !== "changes.fixtures.phs5-trumpet-physics.v1" ||
    metricsRoot["schema"] !== "changes.fixtures.phs5-trumpet-metrics.v1" ||
    physics.length !== 19 ||
    metrics.length !== 12 ||
    !uniqueIds(physics) ||
    !uniqueIds(metrics)
  ) {
    add(findings, "PHS5_CASES", "/cases", "Case corpus changed");
  }
  const jetExpected = obj(row(physics, "adachi-steady-jet")["expected"]);
  const jetInput = obj(row(physics, "adachi-steady-jet")["input"]);
  const dynamicJetExpected = obj(row(physics, "adachi-dynamic-jet")["expected"]);
  const pressurePowerExpected = obj(row(physics, "adachi-instantaneous-pressure-power")["expected"]);
  const lipBoundaryInput = obj(row(physics, "lip-boundary-eight")["input"]);
  const lipBoundaryExpected = obj(row(physics, "lip-boundary-eight")["expected"]);
  const lipPlusOneInput = obj(row(physics, "lip-plus-one")["input"]);
  const lipPlusOneExpected = obj(row(physics, "lip-plus-one")["expected"]);
  if (
    obj(row(physics, "outward-static-open")["expected"])["openingM"] !== 0.0005 ||
    jetInput["lipOpeningAreaM2"] !== 0.0000035 ||
    jetInput["mouthpieceEntryAreaM2"] !== 0.00023 ||
    jetExpected["inertancePaS2PerM3"] !== 685.7142857142857 ||
    jetExpected["contractionPressureDropPa"] !== 489.79591836734704 ||
    jetExpected["expansionPressureChangePa"] !== -14.793410748042128 ||
    jetExpected["combinedResistivePressureDropPa"] !== 475.0025076193049 ||
    jetExpected["dissipationW"] !== 0.04750025076193049 ||
    dynamicJetExpected["inertialPressurePa"] !== 171.42857142857142 ||
    dynamicJetExpected["contractionPressureDropIncludingInertancePa"] !== 661.2244897959184 ||
    pressurePowerExpected["lipSweptFlowM3PerS"] !== 0.000000595 ||
    canon(pressurePowerExpected["pressureForceN"]) !== canon([0.105, 0.042]) ||
    pressurePowerExpected["acousticPowerW"] !== 0.00252 ||
    pressurePowerExpected["mechanicalPowerW"] !== 0.00252 ||
    pressurePowerExpected["powerResidualW"] !== 0 ||
    row(metrics, "open-bb3")["targetHz"] !== 233.081880759 ||
    row(metrics, "octave")["expectedRatio"] !== 2
  ) {
    add(findings, "PHS5_KNOWN_ANSWER", "/known-answers", "Known answer changed");
  }
  if (obj(row(physics, "inward-sign-near-miss")["expected"])["outcome"] !== "refuse") {
    add(findings, "PHS5_OUTWARD", "/physics-cases/inward-sign-near-miss", "Inward sign must refuse");
  }
  if (obj(row(physics, "active-bell-mutation")["expected"])["outcome"] !== "refuse") {
    add(findings, "PHS5_PASSIVITY", "/physics-cases/active-bell-mutation", "Active bell must refuse");
  }
  const passiveBellInput = obj(row(physics, "passive-bell")["input"]);
  const passiveBellExpected = obj(row(physics, "passive-bell")["expected"]);
  const bell = obj(geometry["bell"]);
  if (
    passiveBellInput["incomingEnergyJ"] !== 0.01 ||
    Math.abs(
      Number(passiveBellInput["reflectedEnergyJ"]) +
        Number(passiveBellInput["radiatedEnergyJ"]) +
        Number(passiveBellInput["lostEnergyJ"]) -
        0.01,
    ) > 1e-15 ||
    passiveBellExpected["residualJ"] !== 0 ||
    bell["radiation"] !== "frequency-dependent-passive" ||
    bell["maximumReflectionMagnitude"] !== 0.995
  ) {
    add(findings, "PHS5_PASSIVITY", "/bell-passivity", "Bell energy or reflection passivity changed");
  }
  if (
    canon(lipBoundaryInput) !==
      canon({ newtonIterations: 8, lineSearchEvaluationsPerIteration: 4, residualEvaluations: 65, fallbackBisections: 0 }) ||
    lipBoundaryExpected["outcome"] !== "accept" ||
    canon(lipPlusOneInput) !==
      canon({ newtonIterations: 9, lineSearchEvaluationsPerIteration: 4, residualEvaluations: 66, fallbackBisections: 0 }) ||
    lipPlusOneExpected["outcome"] !== "refuse"
  ) {
    add(findings, "PHS5_LIMITS", "/physics-cases/solver-budget", "Solver boundary or plus-one refusal changed");
  }
  const families = new Set(metrics.map((value) => String(obj(value)["metric"])));
  for (const required of [
    "pitch",
    "impedance-peaks",
    "lip-regime",
    "dynamic-brightness",
    "attack-time",
    "valve-state",
    "nonlinear-alias",
    "transposition-relations",
    "articulation-distinction",
  ]) {
    if (!families.has(required)) add(findings, "PHS5_METRICS", "/metric-cases", `Missing ${required}`);
  }
  const pedalPhysicsExpected = obj(row(physics, "pedal-cannot-certify-normal")["expected"]);
  const regimeMetric = row(metrics, "regime-selection");
  if (
    pedalPhysicsExpected["outcome"] !== "refuse" ||
    pedalPhysicsExpected["finding"] !== "PHS5_PEDAL_AS_NORMAL" ||
    regimeMetric["lipResonanceHz"] !== 250 ||
    regimeMetric["impedancePeakHz"] !== 232 ||
    regimeMetric["referenceSoundingHz"] !== 236 ||
    regimeMetric["pedalMayPass"] !== false
  ) {
    add(findings, "PHS5_NORMAL_REGIME", "/normal-regime", "Normal second-regime or pedal refusal changed");
  }

  const adachiAuthority = obj(adachi["authority"]);
  const adachiTableI = obj(adachi["tableI"]);
  const adachiTableII = obj(adachi["tableII"]);
  const adachiPeaks = arr(adachiTableII["peaks"]);
  const normalTableIII = obj(obj(adachi["tableIII"])["normalSecondRegime"]);
  const adachiAdmission = obj(adachi["admission"]);
  const expectedPeaks = [
    ["I", 87, 43.7],
    ["II", 232, 35.2],
    ["III", 341, 46.4],
    ["IV", 457, 55.7],
    ["V", 572, 48.1],
    ["VI", 686, 51.6],
    ["VII", 800, 44.5],
    ["VIII", 913, 28.5],
  ];
  const peaksMatch = expectedPeaks.every((expected, index) => {
    const peak = obj(adachiPeaks[index]);
    return (
      peak["mode"] === expected[0] &&
      peak["frequencyHz"] === expected[1] &&
      peak["normalizedImpedanceMagnitude"] === expected[2]
    );
  });
  if (
    adachi["schema"] !== "changes.fixtures.phs5-adachi-sato-reference.v1" ||
    adachiAuthority["doi"] !== "10.1121/1.414677" ||
    adachiAuthority["reviewedPdfSha256"] !== ADACHI_PDF_SHA256 ||
    adachiTableI["mouthpieceEntryAreaM2"] !== 0.00023 ||
    adachiPeaks.length !== 8 ||
    !peaksMatch ||
    normalTableIII["lipEigenfrequencyHz"] !== 250 ||
    normalTableIII["soundingFrequencyHz"] !== 236 ||
    normalTableIII["pressureMinusFlowPhaseDegrees"] !== -25.6 ||
    normalTableIII["openingAreaMinusPressurePhaseDegrees"] !== 18.1 ||
    canon(adachi["equations"]) !== canon(ADACHI_EQUATIONS) ||
    adachiAdmission["pedalMayCertifyNormalRegister"] !== false
  ) {
    add(findings, "PHS5_ADACHI_REFERENCE", "/adachi-reference", "Reviewed Adachi-Sato authority changed");
  }

  if (
    provenance["schema"] !== "changes.fixtures.phs5-trumpet-provenance.v1" ||
    authorities.length !== 4 ||
    !uniqueIds(authorities) ||
    row(authorities, "adachi-sato-two-dimensional-lip")["location"] !== "https://doi.org/10.1121/1.414677" ||
    row(authorities, "outward-lip-threshold")["location"] !== "https://arxiv.org/abs/0705.4242"
  ) {
    add(findings, "PHS5_PROVENANCE", "/provenance-ledger", "Primary authority changed");
  }
  const traceIds = traces.map((value) => obj(value)["id"]);
  if (
    tracesRoot["schema"] !== "changes.fixtures.phs5-trumpet-trace.v1" ||
    traces.length !== 6 ||
    !uniqueIds(traces) ||
    canon(traceIds) !==
      canon(["PHS5-REQ-REGISTRY", "PHS5-REQ-LIPS", "PHS5-REQ-BORE", "PHS5-REQ-VALVES", "PHS5-REQ-NONLINEAR", "PHS5-REQ-STATE"])
  ) {
    add(findings, "PHS5_TRACE", "/trace-ledger", "Trace inventory changed");
  }
  if (
    mutationsRoot["schema"] !== "changes.fixtures.phs5-trumpet-mutations.v1" ||
    mutations.length !== 32 ||
    !uniqueIds(mutations)
  ) {
    add(findings, "PHS5_MUTATIONS", "/mutation-controls", "Mutation inventory changed");
  }

  return {
    schema: "changes.validation.phs5-trumpet-v1.v1",
    package: "PHS5",
    outcome: findings.length === 0 ? "pass" : "fail",
    counts: {
      geometrySections: sections.length,
      valveStates: states.length,
      physicsCases: physics.length,
      metricCases: metrics.length,
      metricFamilies: families.size,
      authorities: authorities.length,
      traceRequirements: traces.length,
      mutationControls: mutations.length,
    },
    findings,
  };
}

if (import.meta.main) {
  const report = await validatePhs5Contract(process.argv[2]);
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome !== "pass") process.exitCode = 1;
}
