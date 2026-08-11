import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const JSON_OUTPUT = resolve(
  ROOT,
  "physical/parameter-packs/vibraphone-v2-eigenpack.json",
);
const RUST_OUTPUT = resolve(
  ROOT,
  "dsp/concert-grand/src/vibes_v2_eigenpack.rs",
);
const AUTHORITY_PATH = resolve(
  ROOT,
  "physical/parameter-packs/vibraphone-v2-modal-authority.json",
);

const MIN_MIDI = 53;
const MAX_MIDI = 89;
const MODE_COUNT = 10;
const ELEMENT_COUNT = 32;
const NODE_COUNT = ELEMENT_COUNT + 1;
const DOF_COUNT = 2 * NODE_COUNT;
const TAU = 2 * Math.PI;

type ModalAuthority = Readonly<{
  schema: string;
  status: string;
  sources: readonly Readonly<Record<string, unknown>>[];
  material: Readonly<{
    name: string;
    densityKgPerM3: number;
    youngModulusPa: number;
    poissonRatio: number;
  }>;
  acoustics: Readonly<{
    referenceTemperatureK: number;
    soundSpeedMPerS: number;
    airDensityKgPerM3: number;
    convention: string;
  }>;
  manufacturing: Readonly<{
    measuredYamahaC4M: Readonly<{
      midi: number;
      length: number;
      width: number;
      outerThickness: number;
      minimumUndercutThickness: number;
    }>;
    corroboratingGrinnell37BarEnvelopeM: Readonly<{
      length: readonly [number, number];
      width: readonly [number, number];
      outerThickness: number;
    }>;
    perKeyDesignLaw: Readonly<{
      outerThicknessM: number;
      widthFromC4FrequencyExponent: number;
      nominalLengthFromC4FrequencyExponent: number;
      measuredC4MonotonicLengthPolicy: Readonly<{
        lowerMidiMinimumLengthM: number;
        higherMidiMaximumLengthM: number;
        law: string;
      }>;
    }>;
  }>;
  verticalFlexuralTargets: Readonly<{
    ratios: readonly [number, number, number];
    generationToleranceCents: number;
    hierarchy: Readonly<{
      mandatoryTunedModeCount: number;
      requiredThreeModeMidi: readonly number[];
      admissionOrder: readonly number[];
      law: string;
      untunedStatus: string;
    }>;
    mode4AndHigher: string;
  }>;
  lossModel: Readonly<{
    schema: string;
    evaluationTemperatureK: number;
    thermoelasticBeam: Readonly<{
      sourceId: string;
      exactLawSourceId: string;
      exactLaw: Readonly<{
        delta: string;
        xi: string;
        eta: string;
        zeta: string;
      }>;
      zenerDiagnostic: Readonly<{
        transferLawSource: string;
        tau: string;
        eta: string;
        status: string;
      }>;
      nist6061T6CurveFits: Readonly<{
        log10Polynomial: Readonly<{
          equation: string;
          thermalConductivityWPerMK: readonly number[];
          specificHeatJPerKgK: readonly number[];
        }>;
        temperaturePolynomial: Readonly<{
          equation: string;
          youngModulusGPa: readonly number[];
          linearExpansionTimes1e5: readonly number[];
        }>;
        linearExpansionDerivativeScale: number;
        validTemperatureRangeK: readonly [number, number];
        reviewedExpectedAtEvaluationTemperature: Readonly<{
          thermalConductivityWPerMK: number;
          specificHeatJPerKgK: number;
          youngModulusGPa: number;
          linearThermalExpansionPerK: number;
        }>;
      }>;
      uniformBeamKnownAnswer: Readonly<{
        thicknessM: number;
        frequencyHz: number;
        expectedExactEta: number;
        expectedExactT60Seconds: number;
        expectedZenerEta: number;
        expectedZenerT60Seconds: number;
        minimumExactOverZenerRatio: number;
      }>;
      steppedBeamComposition: string;
      structuralYoungModulusPolicy: string;
    }>;
    support: Readonly<{
      kind: string;
      normalizedPositions: readonly [number, number];
      dashpotNsPerMPerSupport: number;
      fieldInterpolation: string;
      law: string;
      status: string;
    }>;
    radiation: Readonly<{
      kind: string;
      modeIntegralQuadrature: string;
      angularQuadrature: string;
      dipoleSeparationH: string;
      law: string;
      status: string;
    }>;
    damper: Readonly<{
      kind: string;
      dashpotNsPerM: number;
      excludedFromFreeDecayPack: boolean;
      law: string;
    }>;
    freeDecayComposition: string;
  }>;
  noClaim: readonly string[];
}>;

function authorityFailure(path: string): never {
  throw new Error(`PHS6_GENERATOR_AUTHORITY_SEMANTICS:${path}`);
}

function authorityObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    authorityFailure(path);
  }
  return value as Record<string, unknown>;
}

function authorityExactKeys<
  const Required extends readonly string[],
  const Optional extends readonly string[],
>(
  value: unknown,
  required: Required,
  optional: Optional,
  path: string,
): Record<string, unknown> &
  { [Key in Required[number]]: unknown } &
  { [Key in Optional[number]]?: unknown } {
  const object = authorityObject(value, path);
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !(key in object)) ||
    Object.keys(object).some((key) => !allowed.has(key))
  ) {
    authorityFailure(`${path}.keys`);
  }
  return object as Record<string, unknown> &
    { [Key in Required[number]]: unknown } &
    { [Key in Optional[number]]?: unknown };
}

function authorityNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) authorityFailure(path);
  return value;
}

function authorityString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) authorityFailure(path);
  return value;
}

function authorityNumberArray(
  value: unknown,
  length: number,
  path: string,
): readonly number[] {
  if (!Array.isArray(value) || value.length !== length) authorityFailure(path);
  return value.map((entry, index) =>
    authorityNumber(entry, `${path}[${String(index)}]`),
  );
}

function authorityStringArray(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) authorityFailure(path);
  return value.map((entry, index) =>
    authorityString(entry, `${path}[${String(index)}]`),
  );
}

function evaluateLog10Polynomial(
  coefficients: readonly number[],
  temperatureK: number,
): number {
  const x = Math.log10(temperatureK);
  let polynomial = 0;
  for (let index = coefficients.length - 1; index >= 0; index -= 1) {
    polynomial = polynomial * x + (coefficients[index] ?? 0);
  }
  return 10 ** polynomial;
}

function evaluateTemperaturePolynomial(
  coefficients: readonly number[],
  temperatureK: number,
): number {
  let polynomial = 0;
  for (let index = coefficients.length - 1; index >= 0; index -= 1) {
    polynomial = polynomial * temperatureK + (coefficients[index] ?? 0);
  }
  return polynomial;
}

function evaluateTemperaturePolynomialDerivative(
  coefficients: readonly number[],
  temperatureK: number,
): number {
  let derivative = 0;
  for (let index = coefficients.length - 1; index >= 1; index -= 1) {
    derivative = derivative * temperatureK + index * (coefficients[index] ?? 0);
  }
  return derivative;
}

function requireRelativeMatch(
  actual: number,
  expected: number,
  tolerance: number,
  path: string,
): void {
  if (
    Math.abs(actual - expected) >
    tolerance * Math.max(Number.MIN_VALUE, Math.abs(expected))
  ) {
    authorityFailure(path);
  }
}

function thermoelasticDelta(
  youngModulusPa: number,
  expansionPerK: number,
  temperatureK: number,
  densityKgPerM3: number,
  specificHeatJPerKgK: number,
): number {
  return (
    (youngModulusPa * expansionPerK ** 2 * temperatureK) /
    (densityKgPerM3 * specificHeatJPerKgK)
  );
}

function lifshitzRoukesExactEta(
  delta: number,
  omegaRadPerS: number,
  thicknessM: number,
  densityKgPerM3: number,
  specificHeatJPerKgK: number,
  thermalConductivityWPerMK: number,
): number {
  const xi =
    thicknessM *
    Math.sqrt(
      (omegaRadPerS * densityKgPerM3 * specificHeatJPerKgK) /
        (2 * thermalConductivityWPerMK),
    );
  const expNegativeXi = Math.exp(-xi);
  const expNegativeTwoXi = expNegativeXi * expNegativeXi;
  const stableHyperbolicTrigRatio =
    (1 - expNegativeTwoXi + 2 * expNegativeXi * Math.sin(xi)) /
    (1 + expNegativeTwoXi + 2 * expNegativeXi * Math.cos(xi));
  const exactShape =
    6 / xi ** 2 -
    (6 * stableHyperbolicTrigRatio) / xi ** 3;
  return delta * exactShape;
}

function zenerDiagnosticEta(
  delta: number,
  omegaRadPerS: number,
  thicknessM: number,
  densityKgPerM3: number,
  specificHeatJPerKgK: number,
  thermalConductivityWPerMK: number,
): number {
  const tau =
    (thicknessM ** 2 * densityKgPerM3 * specificHeatJPerKgK) /
    (Math.PI ** 2 * thermalConductivityWPerMK);
  const omegaTau = omegaRadPerS * tau;
  return (delta * omegaTau) / (1 + omegaTau ** 2);
}

function lossFactorToT60Seconds(eta: number, omegaRadPerS: number): number {
  return Math.log(1000) / (0.5 * eta * omegaRadPerS);
}

function validateAuthority(value: unknown): ModalAuthority {
  const root = authorityExactKeys(
    value,
    [
      "schema",
      "status",
      "sources",
      "material",
      "acoustics",
      "manufacturing",
      "verticalFlexuralTargets",
      "lossModel",
      "noClaim",
    ],
    [],
    "root",
  );
  if (
    root.schema !== "changes.physical-authority.vibraphone-v2-modal-design.v2" ||
    root.status !== "reviewed-offline-design-authority"
  ) {
    authorityFailure("root.identity");
  }
  if (!Array.isArray(root.sources) || root.sources.length !== 5) {
    authorityFailure("sources");
  }
  const sourceIds = new Set<string>();
  for (const [index, sourceValue] of root.sources.entries()) {
    const source = authorityExactKeys(
      sourceValue,
      ["id", "title", "url", "availability", "role"],
      ["doi", "reviewedDownloadSha256"],
      `sources[${String(index)}]`,
    );
    const id = authorityString(source.id, `sources[${String(index)}].id`);
    authorityString(source.title, `sources[${String(index)}].title`);
    const url = authorityString(source.url, `sources[${String(index)}].url`);
    authorityString(source.availability, `sources[${String(index)}].availability`);
    authorityString(source.role, `sources[${String(index)}].role`);
    if (!url.startsWith("https://") || sourceIds.has(id)) {
      authorityFailure(`sources[${String(index)}].identity`);
    }
    if (
      source.reviewedDownloadSha256 !== undefined &&
      (typeof source.reviewedDownloadSha256 !== "string" ||
        !/^[0-9a-f]{64}$/.test(source.reviewedDownloadSha256))
    ) {
      authorityFailure(`sources[${String(index)}].reviewedDownloadSha256`);
    }
    sourceIds.add(id);
  }
  for (const requiredId of [
    "beaton-scavone-idiophone-bar-tuning",
    "soares-antunes-debut-stepped-undercut",
    "grinnell-vibraphone-manufacturing-envelope",
    "nist-6061-t6-thermophysical-fits",
    "lifshitz-roukes-exact-thermoelastic-beam-loss",
  ]) {
    if (!sourceIds.has(requiredId)) authorityFailure(`sources.missing.${requiredId}`);
  }

  const material = authorityExactKeys(
    root.material,
    ["name", "densityKgPerM3", "youngModulusPa", "poissonRatio"],
    [],
    "material",
  );
  if (
    material.name !== "6061-T6 aluminium" ||
    authorityNumber(material.densityKgPerM3, "material.densityKgPerM3") !== 2700 ||
    authorityNumber(material.youngModulusPa, "material.youngModulusPa") !==
      68_900_000_000 ||
    authorityNumber(material.poissonRatio, "material.poissonRatio") !== 0.33
  ) {
    authorityFailure("material.reviewed-values");
  }
  const acoustics = authorityExactKeys(
    root.acoustics,
    ["referenceTemperatureK", "soundSpeedMPerS", "airDensityKgPerM3", "convention"],
    [],
    "acoustics",
  );
  if (
    authorityNumber(acoustics.referenceTemperatureK, "acoustics.referenceTemperatureK") !==
      293.15 ||
    authorityNumber(acoustics.soundSpeedMPerS, "acoustics.soundSpeedMPerS") !== 343.21 ||
    authorityNumber(acoustics.airDensityKgPerM3, "acoustics.airDensityKgPerM3") !==
      1.2041
  ) {
    authorityFailure("acoustics.reviewed-values");
  }
  authorityString(acoustics.convention, "acoustics.convention");

  const manufacturing = authorityExactKeys(
    root.manufacturing,
    ["measuredYamahaC4M", "corroboratingGrinnell37BarEnvelopeM", "perKeyDesignLaw"],
    [],
    "manufacturing",
  );
  const measured = authorityExactKeys(
    manufacturing.measuredYamahaC4M,
    ["midi", "length", "width", "outerThickness", "minimumUndercutThickness"],
    [],
    "manufacturing.measuredYamahaC4M",
  );
  const measuredValues = [60, 0.333, 0.057, 0.013, 0.005];
  for (const [index, key] of [
    "midi",
    "length",
    "width",
    "outerThickness",
    "minimumUndercutThickness",
  ].entries()) {
    if (authorityNumber(measured[key], `manufacturing.measured.${key}`) !== measuredValues[index]) {
      authorityFailure(`manufacturing.measured.${key}.reviewed-value`);
    }
  }
  const envelope = authorityExactKeys(
    manufacturing.corroboratingGrinnell37BarEnvelopeM,
    ["length", "width", "outerThickness"],
    [],
    "manufacturing.envelope",
  );
  const lengthEnvelope = authorityNumberArray(envelope.length, 2, "manufacturing.envelope.length");
  const widthEnvelope = authorityNumberArray(envelope.width, 2, "manufacturing.envelope.width");
  if (
    lengthEnvelope[0] !== 0.17526 ||
    lengthEnvelope[1] !== 0.381 ||
    widthEnvelope[0] !== 0.0381 ||
    widthEnvelope[1] !== 0.05715 ||
    authorityNumber(envelope.outerThickness, "manufacturing.envelope.outerThickness") !==
      0.013208
  ) {
    authorityFailure("manufacturing.envelope.reviewed-values");
  }
  const designLaw = authorityExactKeys(
    manufacturing.perKeyDesignLaw,
    [
      "claim",
      "outerThicknessM",
      "widthFromC4FrequencyExponent",
      "nominalLengthFromC4FrequencyExponent",
      "measuredC4MonotonicLengthPolicy",
    ],
    [],
    "manufacturing.perKeyDesignLaw",
  );
  authorityString(designLaw.claim, "manufacturing.perKeyDesignLaw.claim");
  for (const key of [
    "outerThicknessM",
    "widthFromC4FrequencyExponent",
    "nominalLengthFromC4FrequencyExponent",
  ]) {
    authorityNumber(designLaw[key], `manufacturing.perKeyDesignLaw.${key}`);
  }
  const monotonicPolicy = authorityExactKeys(
    designLaw.measuredC4MonotonicLengthPolicy,
    ["lowerMidiMinimumLengthM", "higherMidiMaximumLengthM", "law"],
    [],
    "manufacturing.perKeyDesignLaw.measuredC4MonotonicLengthPolicy",
  );
  if (
    authorityNumber(
      monotonicPolicy.lowerMidiMinimumLengthM,
      "manufacturing.monotonic.lowerMidiMinimumLengthM",
    ) !== 0.333 ||
    authorityNumber(
      monotonicPolicy.higherMidiMaximumLengthM,
      "manufacturing.monotonic.higherMidiMaximumLengthM",
    ) !== 0.333
  ) {
    authorityFailure("manufacturing.monotonic.reviewed-values");
  }
  authorityString(monotonicPolicy.law, "manufacturing.monotonic.law");

  const targets = authorityExactKeys(
    root.verticalFlexuralTargets,
    ["ratios", "generationToleranceCents", "hierarchy", "mode4AndHigher"],
    [],
    "verticalFlexuralTargets",
  );
  const ratios = authorityNumberArray(targets.ratios, 3, "verticalFlexuralTargets.ratios");
  if (
    ratios[0] !== 1 ||
    ratios[1] !== 4 ||
    ratios[2] !== 10 ||
    authorityNumber(
      targets.generationToleranceCents,
      "verticalFlexuralTargets.generationToleranceCents",
    ) !== 2
  ) {
    authorityFailure("verticalFlexuralTargets.reviewed-values");
  }
  const hierarchy = authorityExactKeys(
    targets.hierarchy,
    [
      "mandatoryTunedModeCount",
      "requiredThreeModeMidi",
      "admissionOrder",
      "law",
      "untunedStatus",
    ],
    [],
    "verticalFlexuralTargets.hierarchy",
  );
  const admissionOrder = authorityNumberArray(
    hierarchy.admissionOrder,
    2,
    "verticalFlexuralTargets.hierarchy.admissionOrder",
  );
  if (
    authorityNumber(
      hierarchy.mandatoryTunedModeCount,
      "verticalFlexuralTargets.hierarchy.mandatoryTunedModeCount",
    ) !== 2 ||
    authorityNumberArray(
      hierarchy.requiredThreeModeMidi,
      2,
      "verticalFlexuralTargets.hierarchy.requiredThreeModeMidi",
    ).join(",") !== "53,60" ||
    admissionOrder.join(",") !== "3,2" ||
    hierarchy.untunedStatus !== "causal-prediction-not-reviewed-target"
  ) {
    authorityFailure("verticalFlexuralTargets.hierarchy.reviewed-values");
  }
  authorityString(hierarchy.law, "verticalFlexuralTargets.hierarchy.law");
  authorityString(targets.mode4AndHigher, "verticalFlexuralTargets.mode4AndHigher");

  const loss = authorityExactKeys(
    root.lossModel,
    [
      "schema",
      "evaluationTemperatureK",
      "thermoelasticBeam",
      "support",
      "radiation",
      "damper",
      "freeDecayComposition",
    ],
    [],
    "lossModel",
  );
  if (
    loss.schema !== "changes.physical-authority.vibraphone-v2-composite-loss.v2" ||
    authorityNumber(loss.evaluationTemperatureK, "lossModel.evaluationTemperatureK") !== 293
  ) {
    authorityFailure("lossModel.identity");
  }
  const thermo = authorityExactKeys(
    loss.thermoelasticBeam,
    [
      "sourceId",
      "exactLawSourceId",
      "exactLaw",
      "zenerDiagnostic",
      "nist6061T6CurveFits",
      "uniformBeamKnownAnswer",
      "steppedBeamComposition",
      "structuralYoungModulusPolicy",
    ],
    [],
    "lossModel.thermoelasticBeam",
  );
  if (
    thermo.sourceId !== "nist-6061-t6-thermophysical-fits" ||
    thermo.exactLawSourceId !== "lifshitz-roukes-exact-thermoelastic-beam-loss"
  ) {
    authorityFailure("lossModel.thermoelasticBeam.sourceIds");
  }
  authorityString(
    thermo.structuralYoungModulusPolicy,
    "lossModel.thermoelasticBeam.structuralYoungModulusPolicy",
  );
  authorityString(
    thermo.steppedBeamComposition,
    "lossModel.thermoelasticBeam.steppedBeamComposition",
  );
  const law = authorityExactKeys(
    thermo.exactLaw,
    ["delta", "xi", "eta", "zeta"],
    [],
    "lossModel.thermoelasticBeam.exactLaw",
  );
  for (const key of ["delta", "xi", "eta", "zeta"]) {
    authorityString(law[key], `lossModel.thermoelasticBeam.exactLaw.${key}`);
  }
  const zenerDiagnostic = authorityExactKeys(
    thermo.zenerDiagnostic,
    ["transferLawSource", "tau", "eta", "status"],
    [],
    "lossModel.thermoelasticBeam.zenerDiagnostic",
  );
  for (const key of ["transferLawSource", "tau", "eta", "status"]) {
    authorityString(zenerDiagnostic[key], `lossModel.thermoelasticBeam.zenerDiagnostic.${key}`);
  }
  const fits = authorityExactKeys(
    thermo.nist6061T6CurveFits,
    [
      "log10Polynomial",
      "temperaturePolynomial",
      "linearExpansionDerivativeScale",
      "validTemperatureRangeK",
      "reviewedExpectedAtEvaluationTemperature",
    ],
    [],
    "lossModel.thermoelasticBeam.nist6061T6CurveFits",
  );
  const logFit = authorityExactKeys(
    fits.log10Polynomial,
    ["equation", "thermalConductivityWPerMK", "specificHeatJPerKgK"],
    [],
    "lossModel.fits.log10Polynomial",
  );
  authorityString(logFit.equation, "lossModel.fits.log10Polynomial.equation");
  const conductivityCoefficients = authorityNumberArray(
    logFit.thermalConductivityWPerMK,
    9,
    "lossModel.fits.thermalConductivityWPerMK",
  );
  const specificHeatCoefficients = authorityNumberArray(
    logFit.specificHeatJPerKgK,
    9,
    "lossModel.fits.specificHeatJPerKgK",
  );
  const temperatureFit = authorityExactKeys(
    fits.temperaturePolynomial,
    ["equation", "youngModulusGPa", "linearExpansionTimes1e5"],
    [],
    "lossModel.fits.temperaturePolynomial",
  );
  authorityString(temperatureFit.equation, "lossModel.fits.temperaturePolynomial.equation");
  const youngCoefficients = authorityNumberArray(
    temperatureFit.youngModulusGPa,
    5,
    "lossModel.fits.youngModulusGPa",
  );
  const expansionCoefficients = authorityNumberArray(
    temperatureFit.linearExpansionTimes1e5,
    5,
    "lossModel.fits.linearExpansionTimes1e5",
  );
  const derivativeScale = authorityNumber(
    fits.linearExpansionDerivativeScale,
    "lossModel.fits.linearExpansionDerivativeScale",
  );
  const validRange = authorityNumberArray(
    fits.validTemperatureRangeK,
    2,
    "lossModel.fits.validTemperatureRangeK",
  );
  const temperatureK = authorityNumber(loss.evaluationTemperatureK, "lossModel.temperature");
  if (
    derivativeScale !== 1e-5 ||
    validRange[0] !== 4 ||
    validRange[1] !== 295 ||
    temperatureK < validRange[0] ||
    temperatureK > validRange[1]
  ) {
    authorityFailure("lossModel.fits.range-or-scale");
  }
  const reviewed = authorityExactKeys(
    fits.reviewedExpectedAtEvaluationTemperature,
    [
      "thermalConductivityWPerMK",
      "specificHeatJPerKgK",
      "youngModulusGPa",
      "linearThermalExpansionPerK",
    ],
    [],
    "lossModel.fits.reviewedExpected",
  );
  const conductivity = evaluateLog10Polynomial(conductivityCoefficients, temperatureK);
  const specificHeat = evaluateLog10Polynomial(specificHeatCoefficients, temperatureK);
  const youngModulusGPa = evaluateTemperaturePolynomial(youngCoefficients, temperatureK);
  const expansion =
    derivativeScale *
    evaluateTemperaturePolynomialDerivative(expansionCoefficients, temperatureK);
  requireRelativeMatch(
    conductivity,
    authorityNumber(reviewed.thermalConductivityWPerMK, "lossModel.reviewed.k"),
    1e-12,
    "lossModel.fits.thermalConductivity-evaluation",
  );
  requireRelativeMatch(
    specificHeat,
    authorityNumber(reviewed.specificHeatJPerKgK, "lossModel.reviewed.cp"),
    5e-11,
    "lossModel.fits.specificHeat-evaluation",
  );
  requireRelativeMatch(
    youngModulusGPa,
    authorityNumber(reviewed.youngModulusGPa, "lossModel.reviewed.E"),
    1e-12,
    "lossModel.fits.youngModulus-evaluation",
  );
  requireRelativeMatch(
    expansion,
    authorityNumber(reviewed.linearThermalExpansionPerK, "lossModel.reviewed.alpha"),
    1e-12,
    "lossModel.fits.expansion-evaluation",
  );
  const knownAnswer = authorityExactKeys(
    thermo.uniformBeamKnownAnswer,
    [
      "thicknessM",
      "frequencyHz",
      "expectedExactEta",
      "expectedExactT60Seconds",
      "expectedZenerEta",
      "expectedZenerT60Seconds",
      "minimumExactOverZenerRatio",
    ],
    [],
    "lossModel.thermoelasticBeam.uniformBeamKnownAnswer",
  );
  const thicknessM = authorityNumber(knownAnswer.thicknessM, "lossModel.known.thickness");
  const frequencyHz = authorityNumber(knownAnswer.frequencyHz, "lossModel.known.frequency");
  const delta = thermoelasticDelta(
    youngModulusGPa * 1e9,
    expansion,
    temperatureK,
    authorityNumber(material.densityKgPerM3, "material.density"),
    specificHeat,
  );
  const omega = TAU * frequencyHz;
  const exactEta = lifshitzRoukesExactEta(
    delta,
    omega,
    thicknessM,
    authorityNumber(material.densityKgPerM3, "material.density"),
    specificHeat,
    conductivity,
  );
  const zenerEta = zenerDiagnosticEta(
    delta,
    omega,
    thicknessM,
    authorityNumber(material.densityKgPerM3, "material.density"),
    specificHeat,
    conductivity,
  );
  requireRelativeMatch(
    exactEta,
    authorityNumber(knownAnswer.expectedExactEta, "lossModel.known.exactEta"),
    2e-6,
    "lossModel.known.exactEta-evaluation",
  );
  requireRelativeMatch(
    lossFactorToT60Seconds(exactEta, omega),
    authorityNumber(knownAnswer.expectedExactT60Seconds, "lossModel.known.exactT60"),
    2e-5,
    "lossModel.known.exactT60-evaluation",
  );
  requireRelativeMatch(
    zenerEta,
    authorityNumber(knownAnswer.expectedZenerEta, "lossModel.known.zenerEta"),
    2e-6,
    "lossModel.known.zenerEta-evaluation",
  );
  requireRelativeMatch(
    lossFactorToT60Seconds(zenerEta, omega),
    authorityNumber(knownAnswer.expectedZenerT60Seconds, "lossModel.known.zenerT60"),
    2e-5,
    "lossModel.known.zenerT60-evaluation",
  );
  if (
    exactEta / zenerEta <
    authorityNumber(
      knownAnswer.minimumExactOverZenerRatio,
      "lossModel.known.minimumExactOverZenerRatio",
    )
  ) {
    authorityFailure("lossModel.known.zener-near-miss");
  }

  const support = authorityExactKeys(
    loss.support,
    [
      "kind",
      "normalizedPositions",
      "dashpotNsPerMPerSupport",
      "fieldInterpolation",
      "law",
      "status",
    ],
    [],
    "lossModel.support",
  );
  const supportPositions = authorityNumberArray(
    support.normalizedPositions,
    2,
    "lossModel.support.normalizedPositions",
  );
  if (
    support.kind !== "two-point-viscous-support-coupling" ||
    supportPositions[0] !== 0.224 ||
    supportPositions[1] !== 0.776 ||
    authorityNumber(support.dashpotNsPerMPerSupport, "lossModel.support.dashpot") <= 0
  ) {
    authorityFailure("lossModel.support.reviewed-values");
  }
  authorityString(support.law, "lossModel.support.law");
  if (
    support.fieldInterpolation !==
    "cubic-Hermite element field from M-normalized displacement and rotation DOFs"
  ) {
    authorityFailure("lossModel.support.fieldInterpolation");
  }
  authorityString(support.status, "lossModel.support.status");
  const radiation = authorityExactKeys(
    loss.radiation,
    [
      "kind",
      "modeIntegralQuadrature",
      "angularQuadrature",
      "dipoleSeparationH",
      "law",
      "status",
    ],
    [],
    "lossModel.radiation",
  );
  if (radiation.kind !== "far-field-rayleigh-sphere-radiation") {
    authorityFailure("lossModel.radiation.kind");
  }
  if (
    radiation.modeIntegralQuadrature !==
      "four-point Gauss-Legendre per stepped beam element over the cubic-Hermite M-normalized displacement field" ||
    radiation.angularQuadrature !==
      "12-point Gauss-Legendre in normal-direction cosine times 24-point periodic azimuth rule" ||
    radiation.dipoleSeparationH !==
      "elementThicknessM[e] at each stepped-element quadrature point, matching the local top-to-bottom face separation consumed by runtime radiation"
  ) {
    authorityFailure("lossModel.radiation.integration-semantics");
  }
  authorityString(radiation.law, "lossModel.radiation.law");
  authorityString(radiation.status, "lossModel.radiation.status");
  const damper = authorityExactKeys(
    loss.damper,
    ["kind", "dashpotNsPerM", "excludedFromFreeDecayPack", "law"],
    [],
    "lossModel.damper",
  );
  if (
    damper.kind !== "runtime-contact-viscous-coupling" ||
    authorityNumber(damper.dashpotNsPerM, "lossModel.damper.dashpot") <= 0 ||
    damper.excludedFromFreeDecayPack !== true
  ) {
    authorityFailure("lossModel.damper.reviewed-values");
  }
  authorityString(damper.law, "lossModel.damper.law");
  authorityString(loss.freeDecayComposition, "lossModel.freeDecayComposition");
  const noClaim = authorityStringArray(root.noClaim, "noClaim");
  if (noClaim.length < 6) authorityFailure("noClaim.coverage");
  return value as ModalAuthority;
}

const AUTHORITY_TEXT = await readFile(AUTHORITY_PATH, "utf8");
const AUTHORITY = validateAuthority(JSON.parse(AUTHORITY_TEXT) as unknown);
const MATERIAL = AUTHORITY.material;
const AUTHORITIES = AUTHORITY.sources;
const ACOUSTICS = AUTHORITY.acoustics;
const LOSS_MODEL = AUTHORITY.lossModel;
const NIST_FITS = LOSS_MODEL.thermoelasticBeam.nist6061T6CurveFits;
const THERMOPHYSICAL = Object.freeze({
  temperatureK: LOSS_MODEL.evaluationTemperatureK,
  thermalConductivityWPerMK: evaluateLog10Polynomial(
    NIST_FITS.log10Polynomial.thermalConductivityWPerMK,
    LOSS_MODEL.evaluationTemperatureK,
  ),
  specificHeatJPerKgK: evaluateLog10Polynomial(
    NIST_FITS.log10Polynomial.specificHeatJPerKgK,
    LOSS_MODEL.evaluationTemperatureK,
  ),
  youngModulusPa:
    1e9 *
    evaluateTemperaturePolynomial(
      NIST_FITS.temperaturePolynomial.youngModulusGPa,
      LOSS_MODEL.evaluationTemperatureK,
    ),
  linearThermalExpansionPerK:
    NIST_FITS.linearExpansionDerivativeScale *
    evaluateTemperaturePolynomialDerivative(
      NIST_FITS.temperaturePolynomial.linearExpansionTimes1e5,
      LOSS_MODEL.evaluationTemperatureK,
    ),
});
const MANUFACTURING_ENVELOPE =
  AUTHORITY.manufacturing.corroboratingGrinnell37BarEnvelopeM;
const MINIMUM_THICKNESS_FRACTION =
  AUTHORITY.manufacturing.measuredYamahaC4M.minimumUndercutThickness /
  AUTHORITY.manufacturing.perKeyDesignLaw.outerThicknessM;

const SOLVER = Object.freeze({
  id: "changes.foundry.stepped-free-free-euler-bernoulli-beam.v1",
  finiteElement: "two-node-cubic-Hermite-Euler-Bernoulli",
  elements: ELEMENT_COUNT,
  generalizedEigenStrategy:
    "SPD-mass-Cholesky-reduction-cyclic-Jacobi-backtransform-M-normalization",
  maximumJacobiSweeps: 80,
  jacobiRelativeTolerance: 1e-16,
  gaussNewtonMaximumIterations: 24,
  gaussNewtonLineSearchScales: [1, 0.5, 0.25, 0.125, 0.0625],
  evolutionaryPopulation: 36,
  evolutionaryGenerations: 48,
  tuningMaximumPasses: 28,
  tuningMinimumStep: 2e-4,
  maximumBeamSolvesPerKey: 9_000,
  maximumJacobiSweepsAggregatePerKey: 720_000,
  frankensimModalPatternCommit:
    "6f76589023ebd77941db678cc8c86de63b691ae5",
});

type WorkReceipt = Readonly<{
  objectiveEvaluations: number;
  beamSolves: number;
  assembledElements: number;
  choleskyFactorizations: number;
  generalizedEigenSolves: number;
  jacobiSweeps: number;
  jacobiPairVisits: number;
  gaussNewtonIterations: number;
  gaussNewtonFiniteDifferenceEvaluations: number;
  gaussNewtonLineSearchEvaluations: number;
  evolutionaryInitialEvaluations: number;
  evolutionaryTrialEvaluations: number;
  evolutionaryGenerations: number;
  coordinatePasses: number;
  coordinateEvaluations: number;
  hierarchicalAttempts: number;
}>;

type MutableWorkReceipt = { -readonly [Key in keyof WorkReceipt]: number };

const WORK_KEYS = Object.freeze([
  "objectiveEvaluations",
  "beamSolves",
  "assembledElements",
  "choleskyFactorizations",
  "generalizedEigenSolves",
  "jacobiSweeps",
  "jacobiPairVisits",
  "gaussNewtonIterations",
  "gaussNewtonFiniteDifferenceEvaluations",
  "gaussNewtonLineSearchEvaluations",
  "evolutionaryInitialEvaluations",
  "evolutionaryTrialEvaluations",
  "evolutionaryGenerations",
  "coordinatePasses",
  "coordinateEvaluations",
  "hierarchicalAttempts",
] as const satisfies readonly (keyof WorkReceipt)[]);

const WORK: MutableWorkReceipt = Object.fromEntries(
  WORK_KEYS.map((key) => [key, 0]),
) as MutableWorkReceipt;

function snapshotWork(): WorkReceipt {
  return Object.freeze(
    Object.fromEntries(WORK_KEYS.map((key) => [key, WORK[key]])),
  ) as WorkReceipt;
}

function subtractWork(after: WorkReceipt, before: WorkReceipt): WorkReceipt {
  return Object.freeze(
    Object.fromEntries(WORK_KEYS.map((key) => [key, after[key] - before[key]])),
  ) as WorkReceipt;
}

function resetWork(): void {
  for (const key of WORK_KEYS) WORK[key] = 0;
}

type BeamDesign = Readonly<{
  midi: number;
  targetFrequencyHz: number;
  lengthM: number;
  widthM: number;
  outerThicknessM: number;
  elementThicknessM: readonly number[];
}>;

type Mode = Readonly<{
  eigenvalueRad2PerS2: number;
  frequencyHz: number;
  relativeResidual: number;
  shapeMNegHalfKg: readonly number[];
  fullShapeMNegHalfKg: readonly number[];
  elementStrainEnergyFractions: readonly number[];
}>;

type SolvedBeam = Readonly<{
  massKg: number;
  modes: readonly Mode[];
  proof: Readonly<{
    rigidModeCount: number;
    translationStiffnessRelativeResidual: number;
    rotationStiffnessRelativeResidual: number;
    maximumMassOrthogonalityDefect: number;
    jacobiSweepsUsed: number;
  }>;
}>;

type TuningTarget = Readonly<{
  secondModeRatio: number;
  thirdModeRatio: number;
}>;

type UndercutVariables = Readonly<{
  halfProfileFractions: readonly number[];
}>;

type PackRecord = Readonly<{
  midi: number;
  intendedFrequencyHz: number;
  lengthM: number;
  widthM: number;
  outerThicknessM: number;
  elementThicknessM: readonly number[];
  massKg: number;
  undercut: Readonly<{
    halfProfileFractions: readonly number[];
    startElementInclusive: number;
    endElementExclusive: number;
  }>;
  solvedFrequenciesHz: readonly number[];
  solvedRatios: readonly number[];
  eigenRelativeResiduals: readonly number[];
  solverProof: SolvedBeam["proof"];
  massNormalizedDisplacementShapes: readonly (readonly number[])[];
  loss: Readonly<{
    thermoelasticLossFactors: readonly number[];
    supportLossFactors: readonly number[];
    radiationLossFactors: readonly number[];
    totalFreeLossFactors: readonly number[];
    damperExcludedFromFreeDecay: boolean;
  }>;
  t60Seconds: readonly number[];
  resonator: Readonly<{
    effectiveAcousticLengthM: number;
    physicalTubeLengthM: number;
    endCorrectionM: number;
    radiusM: number;
  }>;
  tuning: Readonly<{
    tunedModeCount: number;
    modeStatus: readonly string[];
    targetRatios: readonly number[];
    pitchErrorCents: number;
    ratioErrorCents: readonly number[];
    objectiveCentsRms: number;
  }>;
  work: WorkReceipt;
}>;

function midiFrequencyHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const object = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Utf8(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function outerDimensions(midi: number): Readonly<{
  widthM: number;
  thicknessM: number;
  nominalLengthM: number;
}> {
  const frequencyRatio = midiFrequencyHz(midi) / midiFrequencyHz(60);
  // The primary Yamaha C4 measurement is 333 x 57 x 13 mm.  A bounded
  // geometric power law spans the corroborating 37-key manufacturing
  // envelopes (roughly 175..381 x 38..57 x 10..13 mm) without pretending
  // that every generated key was individually measured.
  const measured = AUTHORITY.manufacturing.measuredYamahaC4M;
  const envelope = AUTHORITY.manufacturing.corroboratingGrinnell37BarEnvelopeM;
  const law = AUTHORITY.manufacturing.perKeyDesignLaw;
  const thicknessM = law.outerThicknessM;
  const widthM = Math.max(
    envelope.width[0],
    Math.min(
      measured.width,
      measured.width * frequencyRatio ** law.widthFromC4FrequencyExponent,
    ),
  );
  const nominalLengthM = Math.max(
    envelope.length[0],
    Math.min(
      envelope.length[1],
      measured.length * frequencyRatio ** law.nominalLengthFromC4FrequencyExponent,
    ),
  );
  return { widthM, thicknessM, nominalLengthM };
}

function targetRatios(): TuningTarget {
  const ratios = AUTHORITY.verticalFlexuralTargets.ratios;
  return {
    secondModeRatio: ratios[1],
    thirdModeRatio: ratios[2],
  };
}

function lengthBoundsForMidi(
  midi: number,
  precedingLowerKeyLengthM?: number,
): readonly [number, number] {
  const measured = AUTHORITY.manufacturing.measuredYamahaC4M;
  const monotonic =
    AUTHORITY.manufacturing.perKeyDesignLaw.measuredC4MonotonicLengthPolicy;
  if (midi === measured.midi) return [measured.length, measured.length];
  let bounds: readonly [number, number];
  if (midi < measured.midi) {
    bounds = [
      Math.max(MANUFACTURING_ENVELOPE.length[0], monotonic.lowerMidiMinimumLengthM),
      MANUFACTURING_ENVELOPE.length[1],
    ];
  } else {
    bounds = [
      MANUFACTURING_ENVELOPE.length[0],
      Math.min(MANUFACTURING_ENVELOPE.length[1], monotonic.higherMidiMaximumLengthM),
    ];
  }
  if (precedingLowerKeyLengthM === undefined) return bounds;
  const upper = Math.min(bounds[1], precedingLowerKeyLengthM);
  if (upper < bounds[0] - 1e-12) {
    throw new Error(
      `PHS6_GENERATOR_MONOTONIC_LENGTH_INFEASIBLE:midi=${String(midi)}`,
    );
  }
  return [bounds[0], Math.max(bounds[0], upper)];
}

function elementThicknesses(
  outerThicknessM: number,
  variables: UndercutVariables,
): readonly number[] {
  const half = [1, 1, ...variables.halfProfileFractions];
  if (half.length !== ELEMENT_COUNT / 2) {
    throw new Error("PHS6_GENERATOR_UNDERCUT_PROFILE");
  }
  const fractions = Array.from(
    { length: ELEMENT_COUNT },
    (_, element) => half[Math.min(element, ELEMENT_COUNT - 1 - element)] ?? 1,
  );
  return fractions.map((fraction) => outerThicknessM * fraction);
}

function addLocal(
  matrix: number[],
  local: readonly number[],
  dofs: readonly number[],
): void {
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const globalRow = dofs[row];
      const globalColumn = dofs[column];
      if (globalRow === undefined || globalColumn === undefined) {
        throw new Error("PHS6_GENERATOR_DOF");
      }
      const targetIndex = globalRow * DOF_COUNT + globalColumn;
      matrix[targetIndex] =
        (matrix[targetIndex] ?? 0) + (local[row * 4 + column] ?? 0);
    }
  }
}

function assemble(design: BeamDesign): Readonly<{
  stiffness: readonly number[];
  mass: readonly number[];
  massKg: number;
}> {
  if (design.elementThicknessM.length !== ELEMENT_COUNT) {
    throw new Error("PHS6_GENERATOR_ELEMENT_COUNT");
  }
  const stiffness = Array<number>(DOF_COUNT * DOF_COUNT).fill(0);
  const mass = Array<number>(DOF_COUNT * DOF_COUNT).fill(0);
  const elementLength = design.lengthM / ELEMENT_COUNT;
  let massKg = 0;

  for (let element = 0; element < ELEMENT_COUNT; element += 1) {
    const thicknessM = design.elementThicknessM[element];
    if (thicknessM === undefined || thicknessM <= 0) {
      throw new Error("PHS6_GENERATOR_THICKNESS");
    }
    const areaM2 = design.widthM * thicknessM;
    const secondMomentM4 = (design.widthM * thicknessM ** 3) / 12;
    const bendingScale =
      (MATERIAL.youngModulusPa * secondMomentM4) / elementLength ** 3;
    const length = elementLength;
    const localStiffness = [
      12,
      6 * length,
      -12,
      6 * length,
      6 * length,
      4 * length ** 2,
      -6 * length,
      2 * length ** 2,
      -12,
      -6 * length,
      12,
      -6 * length,
      6 * length,
      2 * length ** 2,
      -6 * length,
      4 * length ** 2,
    ].map((entry) => entry * bendingScale);

    const translationalScale =
      (MATERIAL.densityKgPerM3 * areaM2 * elementLength) / 420;
    const localMass = [
      156,
      22 * length,
      54,
      -13 * length,
      22 * length,
      4 * length ** 2,
      13 * length,
      -3 * length ** 2,
      54,
      13 * length,
      156,
      -22 * length,
      -13 * length,
      -3 * length ** 2,
      -22 * length,
      4 * length ** 2,
    ].map((entry) => entry * translationalScale);

    const node = element;
    const dofs = [2 * node, 2 * node + 1, 2 * node + 2, 2 * node + 3];
    addLocal(stiffness, localStiffness, dofs);
    addLocal(mass, localMass, dofs);
    massKg += MATERIAL.densityKgPerM3 * areaM2 * elementLength;
  }
  return { stiffness, mass, massKg };
}

function cholesky(matrix: readonly number[], n: number): number[] {
  const lower = Array<number>(n * n).fill(0);
  for (let row = 0; row < n; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      let value = matrix[row * n + column] ?? 0;
      for (let k = 0; k < column; k += 1) {
        value -= (lower[row * n + k] ?? 0) * (lower[column * n + k] ?? 0);
      }
      if (row === column) {
        if (!(value > 0) || !Number.isFinite(value)) {
          throw new Error(
            `PHS6_GENERATOR_MASS_NOT_SPD:${String(row)}:${String(value)}`,
          );
        }
        lower[row * n + column] = Math.sqrt(value);
      } else {
        lower[row * n + column] = value / (lower[column * n + column] ?? 1);
      }
    }
  }
  return lower;
}

function solveLowerInPlace(lower: readonly number[], vector: number[], n: number): void {
  for (let row = 0; row < n; row += 1) {
    let value = vector[row] ?? 0;
    for (let column = 0; column < row; column += 1) {
      value -= (lower[row * n + column] ?? 0) * (vector[column] ?? 0);
    }
    vector[row] = value / (lower[row * n + row] ?? 1);
  }
}

function solveLowerTransposeInPlace(
  lower: readonly number[],
  vector: number[],
  n: number,
): void {
  for (let row = n - 1; row >= 0; row -= 1) {
    let value = vector[row] ?? 0;
    for (let column = row + 1; column < n; column += 1) {
      value -= (lower[column * n + row] ?? 0) * (vector[column] ?? 0);
    }
    vector[row] = value / (lower[row * n + row] ?? 1);
  }
}

function jacobiEigen(
  input: readonly number[],
  n: number,
): Readonly<{
  values: readonly number[];
  vectors: readonly number[];
  sweepsUsed: number;
}> {
  const matrix = [...input];
  const vectors = Array<number>(n * n).fill(0);
  for (let index = 0; index < n; index += 1) {
    vectors[index * n + index] = 1;
  }
  let sweepsUsed = 0;
  for (let sweep = 0; sweep < SOLVER.maximumJacobiSweeps; sweep += 1) {
    sweepsUsed = sweep + 1;
    let maximumOffDiagonal = 0;
    let rotated = false;
    for (let p = 0; p < n - 1; p += 1) {
      for (let q = p + 1; q < n; q += 1) {
        const apq = matrix[p * n + q] ?? 0;
        maximumOffDiagonal = Math.max(maximumOffDiagonal, Math.abs(apq));
        const app = matrix[p * n + p] ?? 0;
        const aqq = matrix[q * n + q] ?? 0;
        const pairScale = Math.max(Number.MIN_VALUE, Math.abs(app) + Math.abs(aqq));
        if (Math.abs(apq) <= SOLVER.jacobiRelativeTolerance * pairScale) continue;
        rotated = true;
        const tau = (aqq - app) / (2 * apq);
        const tangent =
          Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
        const cosine = 1 / Math.sqrt(1 + tangent * tangent);
        const sine = tangent * cosine;
        for (let k = 0; k < n; k += 1) {
          if (k === p || k === q) continue;
          const mkp = matrix[k * n + p] ?? 0;
          const mkq = matrix[k * n + q] ?? 0;
          const nextP = cosine * mkp - sine * mkq;
          const nextQ = sine * mkp + cosine * mkq;
          matrix[k * n + p] = nextP;
          matrix[p * n + k] = nextP;
          matrix[k * n + q] = nextQ;
          matrix[q * n + k] = nextQ;
        }
        matrix[p * n + p] =
          cosine * cosine * app - 2 * sine * cosine * apq + sine * sine * aqq;
        matrix[q * n + q] =
          sine * sine * app + 2 * sine * cosine * apq + cosine * cosine * aqq;
        matrix[p * n + q] = 0;
        matrix[q * n + p] = 0;
        for (let row = 0; row < n; row += 1) {
          const vrp = vectors[row * n + p] ?? 0;
          const vrq = vectors[row * n + q] ?? 0;
          vectors[row * n + p] = cosine * vrp - sine * vrq;
          vectors[row * n + q] = sine * vrp + cosine * vrq;
        }
      }
    }
    if (!rotated) break;
    if (sweep === SOLVER.maximumJacobiSweeps - 1) {
      throw new Error(
        `PHS6_GENERATOR_JACOBI_UNRESOLVED:${String(maximumOffDiagonal)}`,
      );
    }
  }
  const order = Array.from({ length: n }, (_, index) => index).sort(
    (left, right) =>
      (matrix[left * n + left] ?? 0) - (matrix[right * n + right] ?? 0) || left - right,
  );
  return {
    values: order.map((index) => matrix[index * n + index] ?? 0),
    vectors: order.flatMap((column) =>
      Array.from({ length: n }, (_, row) => vectors[row * n + column] ?? 0),
    ),
    sweepsUsed,
  };
}

function multiply(matrix: readonly number[], vector: readonly number[], n: number): number[] {
  return Array.from({ length: n }, (_, row) => {
    let value = 0;
    for (let column = 0; column < n; column += 1) {
      value += (matrix[row * n + column] ?? 0) * (vector[column] ?? 0);
    }
    return value;
  });
}

function dot(left: readonly number[], right: readonly number[]): number {
  let value = 0;
  for (let index = 0; index < left.length; index += 1) {
    value += (left[index] ?? 0) * (right[index] ?? 0);
  }
  return value;
}

function elementStrainEnergyFractions(
  design: BeamDesign,
  mode: readonly number[],
): readonly number[] {
  const elementLength = design.lengthM / ELEMENT_COUNT;
  const energies = Array<number>(ELEMENT_COUNT).fill(0);
  for (let element = 0; element < ELEMENT_COUNT; element += 1) {
    const thicknessM = design.elementThicknessM[element] ?? 0;
    const secondMomentM4 = (design.widthM * thicknessM ** 3) / 12;
    const bendingScale =
      (MATERIAL.youngModulusPa * secondMomentM4) / elementLength ** 3;
    const length = elementLength;
    const localStiffness = [
      12,
      6 * length,
      -12,
      6 * length,
      6 * length,
      4 * length ** 2,
      -6 * length,
      2 * length ** 2,
      -12,
      -6 * length,
      12,
      -6 * length,
      6 * length,
      2 * length ** 2,
      -6 * length,
      4 * length ** 2,
    ].map((entry) => entry * bendingScale);
    const dofs = [2 * element, 2 * element + 1, 2 * element + 2, 2 * element + 3];
    let energy = 0;
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        energy +=
          0.5 *
          (mode[dofs[row] ?? 0] ?? 0) *
          (localStiffness[row * 4 + column] ?? 0) *
          (mode[dofs[column] ?? 0] ?? 0);
      }
    }
    energies[element] = Math.max(0, energy);
  }
  const total = energies.reduce((sum, energy) => sum + energy, 0);
  if (!(total > 0) || !Number.isFinite(total)) {
    throw new Error("PHS6_GENERATOR_MODE_STRAIN_ENERGY");
  }
  return energies.map((energy) => energy / total);
}

function solveBeam(design: BeamDesign): SolvedBeam {
  WORK.beamSolves += 1;
  WORK.assembledElements += ELEMENT_COUNT;
  WORK.choleskyFactorizations += 1;
  WORK.generalizedEigenSolves += 1;
  const assembled = assemble(design);
  const lower = cholesky(assembled.mass, DOF_COUNT);
  // C = L^-1 K L^-T, following the deterministic fs-modal dense strategy.
  const leftReduced = Array<number>(DOF_COUNT * DOF_COUNT).fill(0);
  for (let column = 0; column < DOF_COUNT; column += 1) {
    const vector = Array.from(
      { length: DOF_COUNT },
      (_, row) => assembled.stiffness[row * DOF_COUNT + column] ?? 0,
    );
    solveLowerInPlace(lower, vector, DOF_COUNT);
    for (let row = 0; row < DOF_COUNT; row += 1) {
      leftReduced[row * DOF_COUNT + column] = vector[row] ?? 0;
    }
  }
  const reduced = Array<number>(DOF_COUNT * DOF_COUNT).fill(0);
  for (let column = 0; column < DOF_COUNT; column += 1) {
    const vector = Array.from(
      { length: DOF_COUNT },
      (_, row) => leftReduced[column * DOF_COUNT + row] ?? 0,
    );
    solveLowerInPlace(lower, vector, DOF_COUNT);
    for (let row = 0; row < DOF_COUNT; row += 1) {
      reduced[row * DOF_COUNT + column] = vector[row] ?? 0;
    }
  }
  for (let row = 0; row < DOF_COUNT; row += 1) {
    for (let column = 0; column < row; column += 1) {
      const average =
        0.5 *
        ((reduced[row * DOF_COUNT + column] ?? 0) +
          (reduced[column * DOF_COUNT + row] ?? 0));
      reduced[row * DOF_COUNT + column] = average;
      reduced[column * DOF_COUNT + row] = average;
    }
  }

  const eigensystem = jacobiEigen(reduced, DOF_COUNT);
  WORK.jacobiSweeps += eigensystem.sweepsUsed;
  WORK.jacobiPairVisits +=
    eigensystem.sweepsUsed * ((DOF_COUNT * (DOF_COUNT - 1)) / 2);
  const rigidModeCount = eigensystem.values.filter(
    (eigenvalue) => Math.abs(eigenvalue) <= 1,
  ).length;
  if (rigidModeCount !== 2) {
    throw new Error(`PHS6_GENERATOR_RIGID_MODE_COUNT:${String(rigidModeCount)}`);
  }
  const stiffnessScale = Math.max(1, ...assembled.stiffness.map(Math.abs));
  const elementLength = design.lengthM / ELEMENT_COUNT;
  const translation = Array.from(
    { length: DOF_COUNT },
    (_, dof) => (dof % 2 === 0 ? 1 : 0),
  );
  const rotation = Array.from({ length: DOF_COUNT }, (_, dof) =>
    dof % 2 === 0 ? Math.floor(dof / 2) * elementLength : 1,
  );
  const stiffnessNullResidual = (vector: readonly number[]): number =>
    Math.sqrt(dot(multiply(assembled.stiffness, vector, DOF_COUNT), multiply(assembled.stiffness, vector, DOF_COUNT))) /
    (stiffnessScale * Math.max(1, Math.sqrt(dot(vector, vector))));
  const translationStiffnessRelativeResidual = stiffnessNullResidual(translation);
  const rotationStiffnessRelativeResidual = stiffnessNullResidual(rotation);
  if (
    translationStiffnessRelativeResidual > 1e-12 ||
    rotationStiffnessRelativeResidual > 1e-12
  ) {
    throw new Error(
      `PHS6_GENERATOR_RIGID_NULLSPACE:${String(translationStiffnessRelativeResidual)}:${String(rotationStiffnessRelativeResidual)}`,
    );
  }
  const modes: Mode[] = [];
  const fullModeVectors: number[][] = [];
  // A free-free beam has two rigid-body modes.  Select the first positive
  // flexural modes rather than assuming small roundoff preserves indices.
  for (let eigenIndex = 0; eigenIndex < DOF_COUNT && modes.length < MODE_COUNT; eigenIndex += 1) {
    const rawEigenvalue = eigensystem.values[eigenIndex] ?? 0;
    if (!(rawEigenvalue > 1)) continue;
    const offset = eigenIndex * DOF_COUNT;
    const phi = Array.from(
      { length: DOF_COUNT },
      (_, row) => eigensystem.vectors[offset + row] ?? 0,
    );
    solveLowerTransposeInPlace(lower, phi, DOF_COUNT);
    const massPhi = multiply(assembled.mass, phi, DOF_COUNT);
    const massNorm = Math.sqrt(Math.max(0, dot(phi, massPhi)));
    for (let index = 0; index < phi.length; index += 1) {
      phi[index] = (phi[index] ?? 0) / massNorm;
    }
    const stiffnessPhi = multiply(assembled.stiffness, phi, DOF_COUNT);
    const normalizedMassPhi = multiply(assembled.mass, phi, DOF_COUNT);
    const eigenvalue =
      dot(phi, stiffnessPhi) / Math.max(Number.MIN_VALUE, dot(phi, normalizedMassPhi));
    const residual = stiffnessPhi.map(
      (value, index) => value - eigenvalue * (normalizedMassPhi[index] ?? 0),
    );
    const relativeResidual =
      Math.sqrt(dot(residual, residual)) /
      Math.max(
        1,
        Math.sqrt(dot(stiffnessPhi, stiffnessPhi)),
        Math.abs(eigenvalue) * Math.sqrt(dot(normalizedMassPhi, normalizedMassPhi)),
      );
    const displacement = Array.from(
      { length: NODE_COUNT },
      (_, node) => phi[2 * node] ?? 0,
    );
    let maximumIndex = 0;
    for (let node = 1; node < displacement.length; node += 1) {
      if (Math.abs(displacement[node] ?? 0) > Math.abs(displacement[maximumIndex] ?? 0)) {
        maximumIndex = node;
      }
    }
    if ((displacement[maximumIndex] ?? 0) < 0) {
      for (let node = 0; node < displacement.length; node += 1) {
        displacement[node] = -(displacement[node] ?? 0);
      }
      for (let dof = 0; dof < phi.length; dof += 1) {
        phi[dof] = -(phi[dof] ?? 0);
      }
    }
    modes.push({
      eigenvalueRad2PerS2: eigenvalue,
      frequencyHz: Math.sqrt(eigenvalue) / TAU,
      relativeResidual,
      shapeMNegHalfKg: displacement,
      fullShapeMNegHalfKg: phi,
      elementStrainEnergyFractions: elementStrainEnergyFractions(design, phi),
    });
    fullModeVectors.push(phi);
  }
  if (modes.length !== MODE_COUNT) {
    throw new Error(`PHS6_GENERATOR_MODE_COUNT:${String(modes.length)}`);
  }
  let maximumMassOrthogonalityDefect = 0;
  for (let left = 0; left < fullModeVectors.length; left += 1) {
    for (let right = 0; right < fullModeVectors.length; right += 1) {
      const massRight = multiply(
        assembled.mass,
        fullModeVectors[right] ?? [],
        DOF_COUNT,
      );
      const product = dot(fullModeVectors[left] ?? [], massRight);
      maximumMassOrthogonalityDefect = Math.max(
        maximumMassOrthogonalityDefect,
        Math.abs(product - (left === right ? 1 : 0)),
      );
    }
  }
  if (maximumMassOrthogonalityDefect > 1e-8) {
    throw new Error(
      `PHS6_GENERATOR_MASS_ORTHOGONALITY:${String(maximumMassOrthogonalityDefect)}`,
    );
  }
  return {
    massKg: assembled.massKg,
    modes,
    proof: {
      rigidModeCount,
      translationStiffnessRelativeResidual,
      rotationStiffnessRelativeResidual,
      maximumMassOrthogonalityDefect,
      jacobiSweepsUsed: eigensystem.sweepsUsed,
    },
  };
}

function variablesFromCoordinates(coordinates: readonly number[]): UndercutVariables {
  if (coordinates.length !== ELEMENT_COUNT / 2 - 2) {
    throw new Error("PHS6_GENERATOR_UNDERCUT_COORDINATES");
  }
  return {
    halfProfileFractions: coordinates.map((value) =>
      Math.max(MINIMUM_THICKNESS_FRACTION, Math.min(1, value)),
    ),
  };
}

function clampDesignCoordinate(value: number): number {
  return Math.max(MINIMUM_THICKNESS_FRACTION, Math.min(1, value));
}

function initialProfileCoordinates(): readonly number[] {
  const count = ELEMENT_COUNT / 2 - 2;
  return Array.from({ length: count }, (_, index) => {
    const position = (index + 1) / count;
    return clampDesignCoordinate(1 - 0.62 * position ** 1.7);
  });
}

function designWith(
  midi: number,
  lengthM: number,
  variables: UndercutVariables,
): BeamDesign {
  const dimensions = outerDimensions(midi);
  return {
    midi,
    targetFrequencyHz: midiFrequencyHz(midi),
    lengthM,
    widthM: dimensions.widthM,
    outerThicknessM: dimensions.thicknessM,
    elementThicknessM: elementThicknesses(dimensions.thicknessM, variables),
  };
}

function ratioObjective(
  midi: number,
  coordinates: readonly number[],
  tunedModeCount = 3,
  precedingLowerKeyLengthM?: number,
): Readonly<{
  error: number;
  residualCents: readonly number[];
  solved: SolvedBeam;
  variables: UndercutVariables;
}> {
  WORK.objectiveEvaluations += 1;
  const variables = variablesFromCoordinates(coordinates);
  const nominalLength = outerDimensions(midi).nominalLengthM;
  const solved = solveBeam(designWith(midi, nominalLength, variables));
  const base = solved.modes[0]?.frequencyHz ?? 1;
  const ratios = solved.modes.map((mode) => mode.frequencyHz / base);
  const target = targetRatios();
  const requiredLengthM =
    nominalLength * Math.sqrt(base / midiFrequencyHz(midi));
  const lengthBounds = lengthBoundsForMidi(midi, precedingLowerKeyLengthM);
  const pitchEnvelopeErrorCents =
    requiredLengthM < lengthBounds[0]
      ? 1200 * Math.log2(
          (base * (nominalLength / lengthBounds[0]) ** 2) /
            midiFrequencyHz(midi),
        )
      : requiredLengthM > lengthBounds[1]
        ? 1200 * Math.log2(
            (base * (nominalLength / lengthBounds[1]) ** 2) /
              midiFrequencyHz(midi),
          )
        : 0;
  const errors = [
    pitchEnvelopeErrorCents,
    ...(tunedModeCount >= 2
      ? [1200 * Math.log2((ratios[1] ?? 1) / target.secondModeRatio)]
      : []),
    ...(tunedModeCount >= 3
      ? [1200 * Math.log2((ratios[2] ?? 1) / target.thirdModeRatio)]
      : []),
  ];
  const profile = [1, ...variables.halfProfileFractions];
  let smoothnessPenalty = 0;
  for (let index = 1; index < profile.length; index += 1) {
    smoothnessPenalty += 0.35 * ((profile[index] ?? 0) - (profile[index - 1] ?? 0)) ** 2;
  }
  return {
    error: errors.reduce((sum, value) => sum + value * value, 0) + smoothnessPenalty,
    residualCents: errors,
    solved,
    variables,
  };
}

function solveDenseSystem(matrix: readonly number[], right: readonly number[]): number[] {
  const size = right.length;
  const augmented = Array.from({ length: size }, (_, row) => [
    ...Array.from({ length: size }, (_, column) => matrix[row * size + column] ?? 0),
    right[row] ?? 0,
  ]);
  for (let pivot = 0; pivot < size; pivot += 1) {
    let bestRow = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (
        Math.abs(augmented[row]?.[pivot] ?? 0) >
        Math.abs(augmented[bestRow]?.[pivot] ?? 0)
      ) {
        bestRow = row;
      }
    }
    [augmented[pivot], augmented[bestRow]] = [augmented[bestRow] ?? [], augmented[pivot] ?? []];
    const diagonal = augmented[pivot]?.[pivot] ?? 0;
    if (Math.abs(diagonal) < 1e-14) return Array<number>(size).fill(0);
    for (let column = pivot; column <= size; column += 1) {
      const row = augmented[pivot];
      if (row !== undefined) row[column] = (row[column] ?? 0) / diagonal;
    }
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const factor = augmented[row]?.[pivot] ?? 0;
      for (let column = pivot; column <= size; column += 1) {
        const target = augmented[row];
        if (target !== undefined) {
          target[column] =
            (target[column] ?? 0) - factor * (augmented[pivot]?.[column] ?? 0);
        }
      }
    }
  }
  return augmented.map((row) => row[size] ?? 0);
}

function refineProfileGaussNewton(
  midi: number,
  initial: readonly number[],
  tunedModeCount = 3,
  precedingLowerKeyLengthM?: number,
): Readonly<{ coordinates: readonly number[]; objective: ReturnType<typeof ratioObjective> }> {
  let coordinates = [...initial];
  let best = ratioObjective(
    midi,
    coordinates,
    tunedModeCount,
    precedingLowerKeyLengthM,
  );
  let damping = 1e-2;
  for (
    let iteration = 0;
    iteration < SOLVER.gaussNewtonMaximumIterations;
    iteration += 1
  ) {
    WORK.gaussNewtonIterations += 1;
    const parameterCount = coordinates.length;
    const residualCount = best.residualCents.length;
    const jacobian = Array<number>(residualCount * parameterCount).fill(0);
    for (let parameter = 0; parameter < parameterCount; parameter += 1) {
      const delta = 0.0015;
      const candidate = [...coordinates];
      candidate[parameter] = clampDesignCoordinate((candidate[parameter] ?? 0) + delta);
      let actualDelta = (candidate[parameter] ?? 0) - (coordinates[parameter] ?? 0);
      if (Math.abs(actualDelta) < 1e-12) {
        candidate[parameter] = clampDesignCoordinate(
          (coordinates[parameter] ?? 0) - delta,
        );
        actualDelta = (candidate[parameter] ?? 0) - (coordinates[parameter] ?? 0);
      }
      if (Math.abs(actualDelta) < 1e-12) continue;
      WORK.gaussNewtonFiniteDifferenceEvaluations += 1;
      const perturbed = ratioObjective(
        midi,
        candidate,
        tunedModeCount,
        precedingLowerKeyLengthM,
      );
      for (let residual = 0; residual < residualCount; residual += 1) {
        jacobian[residual * parameterCount + parameter] =
          ((perturbed.residualCents[residual] ?? 0) -
            (best.residualCents[residual] ?? 0)) /
          actualDelta;
      }
    }
    const normal = Array<number>(parameterCount * parameterCount).fill(0);
    const right = Array<number>(parameterCount).fill(0);
    for (let row = 0; row < parameterCount; row += 1) {
      for (let column = 0; column < parameterCount; column += 1) {
        for (let residual = 0; residual < residualCount; residual += 1) {
          const normalIndex = row * parameterCount + column;
          normal[normalIndex] =
            (normal[normalIndex] ?? 0) +
            (jacobian[residual * parameterCount + row] ?? 0) *
            (jacobian[residual * parameterCount + column] ?? 0);
        }
      }
      const diagonalIndex = row * parameterCount + row;
      normal[diagonalIndex] = (normal[diagonalIndex] ?? 0) + damping;
      for (let residual = 0; residual < residualCount; residual += 1) {
        right[row] =
          (right[row] ?? 0) -
          (jacobian[residual * parameterCount + row] ?? 0) *
          (best.residualCents[residual] ?? 0);
      }
    }
    const step = solveDenseSystem(normal, right);
    let accepted = false;
    for (const scale of SOLVER.gaussNewtonLineSearchScales) {
      const candidate = coordinates.map((value, index) =>
        clampDesignCoordinate(value + scale * (step[index] ?? 0)),
      );
      WORK.gaussNewtonLineSearchEvaluations += 1;
      const objective = ratioObjective(
        midi,
        candidate,
        tunedModeCount,
        precedingLowerKeyLengthM,
      );
      if (objective.error < best.error) {
        coordinates = candidate;
        best = objective;
        damping = Math.max(1e-7, damping * 0.3);
        accepted = true;
        break;
      }
    }
    if (!accepted) damping = Math.min(1e8, damping * 10);
    if (Math.max(...best.residualCents.map(Math.abs)) < 0.05) break;
  }
  return { coordinates, objective: best };
}

function deterministicUnit(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function tuneProfileEvolutionary(
  midi: number,
  tunedModeCount = 3,
  precedingLowerKeyLengthM?: number,
): Readonly<{ coordinates: readonly number[]; objective: ReturnType<typeof ratioObjective> }> {
  const parameterCount = ELEMENT_COUNT / 2 - 2;
  const populationSize = SOLVER.evolutionaryPopulation;
  const generations = SOLVER.evolutionaryGenerations;
  const random = deterministicUnit(0x51f15e ^ midi);
  const minimum = MINIMUM_THICKNESS_FRACTION;
  const population = Array.from({ length: populationSize }, (_, member) =>
    Array.from({ length: parameterCount }, (_, parameter) => {
      if (member === 0) return 1 - ((1 - minimum) * parameter) / parameterCount;
      return minimum + (1 - minimum) * random();
    }),
  );
  const objectives = population.map((coordinates) =>
    (WORK.evolutionaryInitialEvaluations += 1,
    ratioObjective(midi, coordinates, tunedModeCount, precedingLowerKeyLengthM)),
  );
  for (let generation = 0; generation < generations; generation += 1) {
    WORK.evolutionaryGenerations += 1;
    for (let member = 0; member < populationSize; member += 1) {
      const distinct: number[] = [];
      while (distinct.length < 3) {
        const candidate = Math.floor(random() * populationSize);
        if (candidate !== member && !distinct.includes(candidate)) distinct.push(candidate);
      }
      const [aIndex = 0, bIndex = 1, cIndex = 2] = distinct;
      const a = population[aIndex] ?? [];
      const b = population[bIndex] ?? [];
      const c = population[cIndex] ?? [];
      const forced = Math.floor(random() * parameterCount);
      const trial = Array.from({ length: parameterCount }, (_, parameter) =>
        parameter === forced || random() < 0.88
          ? clampDesignCoordinate(
              (a[parameter] ?? 0) + 0.72 * ((b[parameter] ?? 0) - (c[parameter] ?? 0)),
            )
          : (population[member]?.[parameter] ?? minimum),
      );
      WORK.evolutionaryTrialEvaluations += 1;
      const trialObjective = ratioObjective(
        midi,
        trial,
        tunedModeCount,
        precedingLowerKeyLengthM,
      );
      if (trialObjective.error < (objectives[member]?.error ?? Number.POSITIVE_INFINITY)) {
        population[member] = trial;
        objectives[member] = trialObjective;
      }
    }
  }
  let bestIndex = 0;
  for (let member = 1; member < populationSize; member += 1) {
    if ((objectives[member]?.error ?? Infinity) < (objectives[bestIndex]?.error ?? Infinity)) {
      bestIndex = member;
    }
  }
  return refineProfileGaussNewton(
    midi,
    population[bestIndex] ?? [],
    tunedModeCount,
    precedingLowerKeyLengthM,
  );
}

function tuneProfile(
  midi: number,
  initial: readonly number[],
  tunedModeCount: number,
  precedingLowerKeyLengthM?: number,
): Readonly<{
  coordinates: readonly number[];
  variables: UndercutVariables;
  objective: ReturnType<typeof ratioObjective>;
}> {
  const starts = [
    initial,
    initial.map((value, index) =>
      index < initial.length / 2 ? Math.min(1, value + 0.12) : value,
    ),
    initial.map((value, index) =>
      index % 3 === 1 ? Math.min(1, value + 0.18) : value,
    ),
  ];
  let refined = refineProfileGaussNewton(
    midi,
    starts[0] ?? initial,
    tunedModeCount,
    precedingLowerKeyLengthM,
  );
  for (const start of starts.slice(1)) {
    const candidate = refineProfileGaussNewton(
      midi,
      start,
      tunedModeCount,
      precedingLowerKeyLengthM,
    );
    if (candidate.objective.error < refined.objective.error) refined = candidate;
  }
  let coordinates = [...refined.coordinates];
  let best = refined.objective;
  let step = 0.12;
  for (let pass = 0; pass < SOLVER.tuningMaximumPasses; pass += 1) {
    WORK.coordinatePasses += 1;
    let improved = false;
    for (let axis = 0; axis < coordinates.length; axis += 1) {
      for (const direction of [-1, 1]) {
        const candidate = [...coordinates];
        candidate[axis] = clampDesignCoordinate(
          (candidate[axis] ?? 0) + direction * step,
        );
        WORK.coordinateEvaluations += 1;
        const result = ratioObjective(
          midi,
          candidate,
          tunedModeCount,
          precedingLowerKeyLengthM,
        );
        if (result.error < best.error) {
          coordinates = candidate;
          best = result;
          improved = true;
        }
      }
    }
    if (!improved) step *= 0.5;
    if (step < SOLVER.tuningMinimumStep) break;
  }
  return {
    coordinates,
    variables: best.variables,
    objective: best,
  };
}

function tuneHierarchicalProfile(
  midi: number,
  initial: readonly number[],
  precedingLowerKeyLengthM?: number,
): Readonly<{
  coordinates: readonly number[];
  variables: UndercutVariables;
  tunedModeCount: number;
}> {
  const tolerance = AUTHORITY.verticalFlexuralTargets.generationToleranceCents;
  for (const tunedModeCount of AUTHORITY.verticalFlexuralTargets.hierarchy.admissionOrder) {
    WORK.hierarchicalAttempts += 1;
    if (tunedModeCount === 1) {
      const coordinates = Array<number>(ELEMENT_COUNT / 2 - 2).fill(1);
      const objective = ratioObjective(
        midi,
        coordinates,
        tunedModeCount,
        precedingLowerKeyLengthM,
      );
      if (Math.max(...objective.residualCents.map(Math.abs)) <= tolerance) {
        return {
          coordinates,
          variables: objective.variables,
          tunedModeCount,
        };
      }
      continue;
    }
    let tuned = tuneProfile(
      midi,
      initial,
      tunedModeCount,
      precedingLowerKeyLengthM,
    );
    if (Math.max(...tuned.objective.residualCents.map(Math.abs)) > tolerance) {
      const evolutionary = tuneProfileEvolutionary(
        midi,
        tunedModeCount,
        precedingLowerKeyLengthM,
      );
      if (evolutionary.objective.error < tuned.objective.error) {
        tuned = {
          coordinates: evolutionary.coordinates,
          variables: evolutionary.objective.variables,
          objective: evolutionary.objective,
        };
      }
    }
    if (Math.max(...tuned.objective.residualCents.map(Math.abs)) <= tolerance) {
      return {
        coordinates: tuned.coordinates,
        variables: tuned.variables,
        tunedModeCount,
      };
    }
  }
  throw new Error(
    `PHS6_GENERATOR_REQUIRED_TUNED_MODES_INFEASIBLE:midi=${String(midi)}`,
  );
}

type ModalLoss = Readonly<{
  thermoelasticLossFactor: number;
  supportLossFactor: number;
  radiationLossFactor: number;
  totalFreeLossFactor: number;
  t60Seconds: number;
}>;

function evaluateHermiteModeShape(
  mode: Mode,
  design: BeamDesign,
  normalizedPosition: number,
): number {
  const coordinate = Math.max(0, Math.min(1, normalizedPosition)) * ELEMENT_COUNT;
  const element = Math.min(ELEMENT_COUNT - 1, Math.floor(coordinate));
  const s = coordinate - element;
  const elementLengthM = design.lengthM / ELEMENT_COUNT;
  const n1 = 1 - 3 * s ** 2 + 2 * s ** 3;
  const n2 = elementLengthM * (s - 2 * s ** 2 + s ** 3);
  const n3 = 3 * s ** 2 - 2 * s ** 3;
  const n4 = elementLengthM * (-(s ** 2) + s ** 3);
  const dof = 2 * element;
  return (
    n1 * (mode.fullShapeMNegHalfKg[dof] ?? 0) +
    n2 * (mode.fullShapeMNegHalfKg[dof + 1] ?? 0) +
    n3 * (mode.fullShapeMNegHalfKg[dof + 2] ?? 0) +
    n4 * (mode.fullShapeMNegHalfKg[dof + 3] ?? 0)
  );
}

const RADIATION_DIRECTION_COSINES = [
  -0.9815606342467191,
  -0.9041172563704749,
  -0.7699026741943047,
  -0.5873179542866175,
  -0.3678314989981802,
  -0.1252334085114689,
  0.1252334085114689,
  0.3678314989981802,
  0.5873179542866175,
  0.7699026741943047,
  0.9041172563704749,
  0.9815606342467191,
] as const;

const RADIATION_DIRECTION_WEIGHTS = [
  0.04717533638651183,
  0.1069393259953184,
  0.1600783285433462,
  0.2031674267230659,
  0.2334925365383548,
  0.2491470458134029,
  0.2491470458134029,
  0.2334925365383548,
  0.2031674267230659,
  0.1600783285433462,
  0.1069393259953184,
  0.04717533638651183,
] as const;

const RADIATION_AZIMUTH_COUNT = 24;
const RADIATION_ELEMENT_GAUSS_POSITIONS = [
  -0.8611363115940526,
  -0.3399810435848563,
  0.3399810435848563,
  0.8611363115940526,
] as const;
const RADIATION_ELEMENT_GAUSS_WEIGHTS = [
  0.3478548451374538,
  0.6521451548625461,
  0.6521451548625461,
  0.3478548451374538,
] as const;

/**
 * Rayleigh-I far-field power integrated over the complete sphere for one
 * mass-normalized free-bar mode.  The former compact whole-bar integral made
 * every antisymmetric mode exactly lossless even though the runtime's
 * finite-angle observer hears its nonzero longitudinal multipole.  This uses
 * the same top-minus-bottom face convention and retains the phase of every
 * stepped-beam element before squaring and integrating acoustic power.
 */
function farFieldRadiationModalDampingPerSecond(
  design: BeamDesign,
  mode: Mode,
): number {
  const omega = TAU * mode.frequencyHz;
  const waveNumberPerM = omega / ACOUSTICS.soundSpeedMPerS;
  const elementLengthM = design.lengthM / ELEMENT_COUNT;
  const azimuthStep = TAU / RADIATION_AZIMUTH_COUNT;
  let sphereIntegralM4PerKg = 0;

  for (let normalIndex = 0; normalIndex < RADIATION_DIRECTION_COSINES.length; normalIndex += 1) {
    const directionNormal = RADIATION_DIRECTION_COSINES[normalIndex] ?? 0;
    const normalWeight = RADIATION_DIRECTION_WEIGHTS[normalIndex] ?? 0;
    const transverseMagnitude = Math.sqrt(Math.max(0, 1 - directionNormal ** 2));
    for (let azimuthIndex = 0; azimuthIndex < RADIATION_AZIMUTH_COUNT; azimuthIndex += 1) {
      const azimuth = (azimuthIndex + 0.5) * azimuthStep;
      const directionAlongBar = transverseMagnitude * Math.cos(azimuth);
      let faceIntegralRealM2KgNegHalf = 0;
      let faceIntegralImaginaryM2KgNegHalf = 0;
      for (let element = 0; element < ELEMENT_COUNT; element += 1) {
        const localThicknessM = design.elementThicknessM[element];
        if (localThicknessM === undefined) throw new Error("PHS6_GENERATOR_THICKNESS");
        const halfFacePhase = 0.5 * waveNumberPerM * directionNormal * localThicknessM;
        const faceDifferenceScale = 2 * Math.sin(halfFacePhase);
        for (let point = 0; point < RADIATION_ELEMENT_GAUSS_POSITIONS.length; point += 1) {
          const localPosition =
            0.5 * (1 + (RADIATION_ELEMENT_GAUSS_POSITIONS[point] ?? 0));
          const normalizedPosition = (element + localPosition) / ELEMENT_COUNT;
          const centeredPositionM = (normalizedPosition - 0.5) * design.lengthM;
          const spatialWeightM2 =
            design.widthM *
            0.5 *
            elementLengthM *
            (RADIATION_ELEMENT_GAUSS_WEIGHTS[point] ?? 0);
          const weightedShape =
            spatialWeightM2 * evaluateHermiteModeShape(mode, design, normalizedPosition);
          const phase = waveNumberPerM * directionAlongBar * centeredPositionM;
          faceIntegralRealM2KgNegHalf +=
            faceDifferenceScale * weightedShape * Math.cos(phase);
          faceIntegralImaginaryM2KgNegHalf -=
            faceDifferenceScale * weightedShape * Math.sin(phase);
        }
      }
      const faceMagnitudeSquared =
        faceIntegralRealM2KgNegHalf ** 2 + faceIntegralImaginaryM2KgNegHalf ** 2;
      sphereIntegralM4PerKg +=
        normalWeight *
        azimuthStep *
        faceMagnitudeSquared;
    }
  }

  return (
    (ACOUSTICS.airDensityKgPerM3 * omega ** 2) /
    (16 * Math.PI ** 2 * ACOUSTICS.soundSpeedMPerS) *
    sphereIntegralM4PerKg
  );
}

function modalLoss(design: BeamDesign, mode: Mode): ModalLoss {
  const omega = TAU * mode.frequencyHz;
  const delta = thermoelasticDelta(
    THERMOPHYSICAL.youngModulusPa,
    THERMOPHYSICAL.linearThermalExpansionPerK,
    THERMOPHYSICAL.temperatureK,
    MATERIAL.densityKgPerM3,
    THERMOPHYSICAL.specificHeatJPerKgK,
  );
  const thermoelasticLossFactor = mode.elementStrainEnergyFractions.reduce(
    (sum, fraction, element) =>
      sum +
      fraction *
        lifshitzRoukesExactEta(
          delta,
          omega,
          design.elementThicknessM[element] ?? design.outerThicknessM,
          MATERIAL.densityKgPerM3,
          THERMOPHYSICAL.specificHeatJPerKgK,
          THERMOPHYSICAL.thermalConductivityWPerMK,
        ),
    0,
  );
  const supportModalDampingPerSecond =
    LOSS_MODEL.support.dashpotNsPerMPerSupport *
    LOSS_MODEL.support.normalizedPositions.reduce((sum, position) => {
      const shape = evaluateHermiteModeShape(mode, design, position);
      return sum + shape * shape;
    }, 0);
  const supportLossFactor = supportModalDampingPerSecond / omega;
  const radiationModalDampingPerSecond = farFieldRadiationModalDampingPerSecond(design, mode);
  const radiationLossFactor = radiationModalDampingPerSecond / omega;
  const totalFreeLossFactor =
    thermoelasticLossFactor + supportLossFactor + radiationLossFactor;
  if (
    !Number.isFinite(totalFreeLossFactor) ||
    !(totalFreeLossFactor > 0) ||
    thermoelasticLossFactor < 0 ||
    supportLossFactor < 0 ||
    radiationLossFactor < 0
  ) {
    throw new Error(
      `PHS6_GENERATOR_MODAL_LOSS:frequency=${String(mode.frequencyHz)}`,
    );
  }
  return {
    thermoelasticLossFactor,
    supportLossFactor,
    radiationLossFactor,
    totalFreeLossFactor,
    t60Seconds: lossFactorToT60Seconds(totalFreeLossFactor, omega),
  };
}

function round(value: number): number {
  if (!Number.isFinite(value)) throw new Error("PHS6_GENERATOR_NONFINITE");
  return Number(value.toPrecision(16));
}

function sumWorkReceipts(receipts: readonly WorkReceipt[]): WorkReceipt {
  return Object.freeze(
    Object.fromEntries(
      WORK_KEYS.map((key) => [
        key,
        receipts.reduce((sum, receipt) => sum + receipt[key], 0),
      ]),
    ),
  ) as WorkReceipt;
}

function workReceiptsEqual(left: WorkReceipt, right: WorkReceipt): boolean {
  return WORK_KEYS.every((key) => left[key] === right[key]);
}

function buildRecord(
  midi: number,
  initialCoordinates: readonly number[],
  precedingLowerKeyLengthM?: number,
): Readonly<{ record: PackRecord; nextCoordinates: readonly number[] }> {
  const workBefore = snapshotWork();
  const tuning = tuneHierarchicalProfile(
    midi,
    initialCoordinates,
    precedingLowerKeyLengthM,
  );
  const dimensions = outerDimensions(midi);
  const nominalDesign = designWith(
    midi,
    dimensions.nominalLengthM,
    tuning.variables,
  );
  const nominalSolved = solveBeam(nominalDesign);
  const nominalBase = nominalSolved.modes[0]?.frequencyHz ?? 1;
  const lengthBounds = lengthBoundsForMidi(midi, precedingLowerKeyLengthM);
  const pitchScaledLengthM = Math.max(
    lengthBounds[0],
    Math.min(
      lengthBounds[1],
      dimensions.nominalLengthM *
        Math.sqrt(nominalBase / midiFrequencyHz(midi)),
    ),
  );
  const firstScaled = solveBeam(
    designWith(midi, pitchScaledLengthM, tuning.variables),
  );
  const firstScaledBase = firstScaled.modes[0]?.frequencyHz ?? 1;
  const finalLengthM = Math.max(
    lengthBounds[0],
    Math.min(
      lengthBounds[1],
      pitchScaledLengthM * Math.sqrt(firstScaledBase / midiFrequencyHz(midi)),
    ),
  );
  const design = designWith(midi, finalLengthM, tuning.variables);
  const solved = solveBeam(design);
  const frequencies = solved.modes.map((mode) => mode.frequencyHz);
  const base = frequencies[0] ?? 1;
  const ratios = frequencies.map((frequency) => frequency / base);
  const target = targetRatios();
  const allCandidateTargets = [1, target.secondModeRatio, target.thirdModeRatio];
  const targetVector = allCandidateTargets.slice(0, tuning.tunedModeCount);
  const pitchErrorCents = 1200 * Math.log2(base / midiFrequencyHz(midi));
  const ratioErrorCents = Array.from(
    { length: Math.max(0, tuning.tunedModeCount - 1) },
    (_, offset) => offset + 1,
  ).map(
    (index) => 1200 * Math.log2((ratios[index] ?? 1) / (targetVector[index] ?? 1)),
  );
  const losses = solved.modes.map((mode) => modalLoss(design, mode));
  const radiusM = 0.031 - (0.01 * (midi - MIN_MIDI)) / (MAX_MIDI - MIN_MIDI);
  const effectiveAcousticLengthM =
    ACOUSTICS.soundSpeedMPerS / (4 * midiFrequencyHz(midi));
  const endCorrectionM = 0.6133 * radiusM;
  const physicalTubeLengthM = effectiveAcousticLengthM - endCorrectionM;
  if (!(physicalTubeLengthM > 0)) {
    throw new Error(`PHS6_GENERATOR_RESONATOR_LENGTH:midi=${String(midi)}`);
  }
  const work = subtractWork(snapshotWork(), workBefore);
  if (
    work.beamSolves > SOLVER.maximumBeamSolvesPerKey ||
    work.jacobiSweeps > SOLVER.maximumJacobiSweepsAggregatePerKey ||
    work.assembledElements !== work.beamSolves * ELEMENT_COUNT ||
    work.choleskyFactorizations !== work.beamSolves ||
    work.generalizedEigenSolves !== work.beamSolves ||
    work.jacobiPairVisits !==
      work.jacobiSweeps * ((DOF_COUNT * (DOF_COUNT - 1)) / 2)
  ) {
    throw new Error(`PHS6_GENERATOR_WORK_RECEIPT:midi=${String(midi)}`);
  }
  const record: PackRecord = {
    midi,
    intendedFrequencyHz: round(midiFrequencyHz(midi)),
    lengthM: round(design.lengthM),
    widthM: round(design.widthM),
    outerThicknessM: round(design.outerThicknessM),
    elementThicknessM: design.elementThicknessM.map(round),
    massKg: round(solved.massKg),
    undercut: {
      halfProfileFractions: tuning.variables.halfProfileFractions.map(round),
      startElementInclusive: 2,
      endElementExclusive: ELEMENT_COUNT - 2,
    },
    solvedFrequenciesHz: frequencies.map(round),
    solvedRatios: ratios.map(round),
    eigenRelativeResiduals: solved.modes.map((mode) => round(mode.relativeResidual)),
    solverProof: {
      rigidModeCount: solved.proof.rigidModeCount,
      translationStiffnessRelativeResidual: round(
        solved.proof.translationStiffnessRelativeResidual,
      ),
      rotationStiffnessRelativeResidual: round(
        solved.proof.rotationStiffnessRelativeResidual,
      ),
      maximumMassOrthogonalityDefect: round(
        solved.proof.maximumMassOrthogonalityDefect,
      ),
      jacobiSweepsUsed: solved.proof.jacobiSweepsUsed,
    },
    massNormalizedDisplacementShapes: solved.modes.map((mode) =>
      mode.shapeMNegHalfKg.map(round),
    ),
    loss: {
      thermoelasticLossFactors: losses.map((loss) =>
        round(loss.thermoelasticLossFactor),
      ),
      supportLossFactors: losses.map((loss) => round(loss.supportLossFactor)),
      radiationLossFactors: losses.map((loss) => round(loss.radiationLossFactor)),
      totalFreeLossFactors: losses.map((loss) => round(loss.totalFreeLossFactor)),
      damperExcludedFromFreeDecay: LOSS_MODEL.damper.excludedFromFreeDecayPack,
    },
    t60Seconds: losses.map((loss) => round(loss.t60Seconds)),
    resonator: {
      effectiveAcousticLengthM: round(effectiveAcousticLengthM),
      physicalTubeLengthM: round(physicalTubeLengthM),
      endCorrectionM: round(endCorrectionM),
      radiusM: round(radiusM),
    },
    tuning: {
      tunedModeCount: tuning.tunedModeCount,
      modeStatus: Array.from({ length: MODE_COUNT }, (_, index) =>
        index < tuning.tunedModeCount
          ? "reviewed-target"
          : "causal-prediction-not-reviewed-target",
      ),
      targetRatios: targetVector.map(round),
      pitchErrorCents: round(pitchErrorCents),
      ratioErrorCents: ratioErrorCents.map(round),
      objectiveCentsRms: round(
        Math.sqrt(
          ratioErrorCents.length === 0
            ? pitchErrorCents * pitchErrorCents
            : ratioErrorCents.reduce((sum, value) => sum + value * value, 0) /
                ratioErrorCents.length,
        ),
      ),
    },
    work,
  };
  return { record, nextCoordinates: tuning.coordinates };
}

function rustFloat(value: number): string {
  const text = value.toPrecision(17);
  return `${text.includes("e") ? text : `${text}e0`}_f64`;
}

function rustFloat32(value: number): string {
  const rounded = Math.fround(value);
  const text = rounded.toPrecision(9);
  return `${text.includes("e") ? text : `${text}e0`}_f32`;
}

function rustArray(values: readonly number[]): string {
  return `[${values.map(rustFloat).join(", ")}]`;
}


function rustArray32(values: readonly number[]): string {
  return `[${values.map(rustFloat32).join(", ")}]`;
}

function renderRust(
  records: readonly PackRecord[],
  inputSha256: string,
  authorityFileSha256: string,
  generatorSourceSha256: string,
): string {
  const rows = records
    .map(
      (record) => `    ModalPackRecord {
        midi: ${String(record.midi)},
        intended_frequency_hz: ${rustFloat(record.intendedFrequencyHz)},
        length_m: ${rustFloat(record.lengthM)},
        width_m: ${rustFloat(record.widthM)},
        outer_thickness_m: ${rustFloat(record.outerThicknessM)},
        element_thickness_m: ${rustArray(record.elementThicknessM)},
        mass_kg: ${rustFloat(record.massKg)},
        tuned_mode_count: ${String(record.tuning.tunedModeCount)},
        solved_frequencies_hz: ${rustArray(record.solvedFrequenciesHz)},
        eigen_relative_residuals: ${rustArray(record.eigenRelativeResiduals)},
        mode_shapes_m_neg_half_kg: [
${record.massNormalizedDisplacementShapes
  .map((shape) => `            ${rustArray32(shape)},`)
  .join("\n")}
        ],
        t60_seconds: ${rustArray(record.t60Seconds)},
        resonator_effective_length_m: ${rustFloat(record.resonator.effectiveAcousticLengthM)},
        resonator_physical_length_m: ${rustFloat(record.resonator.physicalTubeLengthM)},
        resonator_radius_m: ${rustFloat(record.resonator.radiusM)},
    },`,
    )
    .join("\n");
  return `// @generated by scripts/generate-vibraphone-v2-eigenpack.ts; do not hand-edit.
// Offline only: the WASM runtime consumes these compact reviewed constants and
// does not import FrankenSim or run an eigensolver.

pub(super) const VIBES_V2_MODAL_PACK_INPUT_SHA256: &str = "${inputSha256}";
pub(super) const VIBES_V2_MODAL_AUTHORITY_SHA256: &str = "${authorityFileSha256}";
pub(super) const VIBES_V2_MODAL_GENERATOR_SHA256: &str = "${generatorSourceSha256}";
pub(super) const VIBES_V2_MODAL_PACK_SOLVER_ID: &str = "${SOLVER.id}";
pub(super) const VIBES_V2_MODAL_PACK: [ModalPackRecord; ${String(records.length)}] = [
${rows}
];
`;
}

async function main(): Promise<void> {
  const probeArgument = process.argv.find((argument) =>
    argument.startsWith("--global-probe-midi="),
  );
  if (probeArgument !== undefined) {
    const midi = Number(probeArgument.split("=")[1]);
    if (!Number.isInteger(midi) || midi < MIN_MIDI || midi > MAX_MIDI) {
      throw new Error("PHS6_GENERATOR_PROBE_MIDI");
    }
    const tunedModeCountArgument = process.argv.find((argument) =>
      argument.startsWith("--probe-tuned-mode-count="),
    );
    const tunedModeCount = Number(tunedModeCountArgument?.split("=")[1] ?? 3);
    if (!Number.isInteger(tunedModeCount) || tunedModeCount < 1 || tunedModeCount > 3) {
      throw new Error("PHS6_GENERATOR_PROBE_TUNED_MODE_COUNT");
    }
    resetWork();
    const tuned = tuneProfileEvolutionary(midi, tunedModeCount);
    const nominalLengthM = outerDimensions(midi).nominalLengthM;
    const nominalDesign = designWith(midi, nominalLengthM, tuned.objective.variables);
    const modalLosses = tuned.objective.solved.modes.map((mode) =>
      modalLoss(nominalDesign, mode),
    );
    const baseAtNominalHz = tuned.objective.solved.modes[0]?.frequencyHz ?? 0;
    const requiredLengthM =
      nominalLengthM * Math.sqrt(baseAtNominalHz / midiFrequencyHz(midi));
    process.stdout.write(
      `${JSON.stringify({
        midi,
        tunedModeCount,
        coordinates: tuned.coordinates,
        residualCents: tuned.objective.residualCents,
        ratios: tuned.objective.solved.modes
          .slice(0, 4)
          .map((mode) =>
            mode.frequencyHz / (tuned.objective.solved.modes[0]?.frequencyHz ?? 1),
          ),
        eigenRelativeResiduals: tuned.objective.solved.modes.map(
          (mode) => mode.relativeResidual,
        ),
        nominalLengthM,
        requiredLengthM,
        manufacturingLengthBoundsM: lengthBoundsForMidi(midi),
        baseAtNominalHz,
        pitchAtRequiredLengthCents:
          1200 *
          Math.log2(
            (baseAtNominalHz * (nominalLengthM / requiredLengthM) ** 2) /
              midiFrequencyHz(midi),
          ),
        objective: tuned.objective.error,
        loss: {
          thermoelasticLossFactors: modalLosses.map(
            (loss) => loss.thermoelasticLossFactor,
          ),
          supportLossFactors: modalLosses.map((loss) => loss.supportLossFactor),
          radiationLossFactors: modalLosses.map((loss) => loss.radiationLossFactor),
          totalFreeLossFactors: modalLosses.map((loss) => loss.totalFreeLossFactor),
          t60Seconds: modalLosses.map((loss) => loss.t60Seconds),
        },
        work: snapshotWork(),
      })}\n`,
    );
    return;
  }
  const generatorSourceSha256 = sha256Utf8(
    await readFile(resolve(import.meta.dir, "generate-vibraphone-v2-eigenpack.ts"), "utf8"),
  );
  const authorityFileSha256 = sha256Utf8(AUTHORITY_TEXT);
  const perKeyDesignTargets = Array.from(
    { length: MAX_MIDI - MIN_MIDI + 1 },
    (_, offset) => {
      const midi = MIN_MIDI + offset;
      const ratios = targetRatios();
      return {
        midi,
        ...outerDimensions(midi),
        targetRatios: [
          1,
          ratios.secondModeRatio,
          ratios.thirdModeRatio,
        ],
      };
    },
  );
  const inputs = {
    schema: "changes.foundry.vibraphone-v2-eigenpack-input.v1",
    midiRange: [MIN_MIDI, MAX_MIDI],
    modeCount: MODE_COUNT,
    material: MATERIAL,
    acoustics: ACOUSTICS,
    thermophysicalAtEvaluationTemperature: THERMOPHYSICAL,
    lossModel: LOSS_MODEL,
    solver: SOLVER,
    generatorSourceSha256,
    authorityFileSha256,
    authority: AUTHORITY,
    geometryScaling:
      "measured-Yamaha-C4-plus-bounded-37-key-manufacturing-envelope-power-law-v1",
    undercutTopology:
      "32-stepped-elements; two-solid-end-elements; fourteen symmetric undercut height variables",
    targetRatioLaw:
      "reviewed-first-three-vertical-flexural-targets-1f-4f-10f; mode4-plus-predicted-v1",
    perKeyDesignTargets,
    tuning: {
      minimumElementThicknessFraction: MINIMUM_THICKNESS_FRACTION,
      initialFractions: initialProfileCoordinates(),
      initialCoordinateStep: 0.12,
      objectives: [
        "absolute-f1-cents",
        "f2-over-f1-cents",
        "f3-over-f1-cents",
      ],
      smoothnessPenaltyWeight: 0.35,
    },
  };
  const inputSha256 = sha256Utf8(canonical(inputs));
  resetWork();
  const records: PackRecord[] = [];
  let coordinates: readonly number[] = initialProfileCoordinates();
  for (let midi = MIN_MIDI; midi <= MAX_MIDI; midi += 1) {
    const built = buildRecord(midi, coordinates, records.at(-1)?.lengthM);
    records.push(built.record);
    coordinates = built.nextCoordinates;
  }
  const aggregateWork = sumWorkReceipts(records.map((record) => record.work));
  const observedWork = snapshotWork();
  if (!workReceiptsEqual(aggregateWork, observedWork)) {
    throw new Error("PHS6_EIGENPACK_AGGREGATE_WORK_RECEIPT");
  }
  const maximumPitchErrorCents = Math.max(
    ...records.map((record) => Math.abs(record.tuning.pitchErrorCents)),
  );
  const maximumRatioErrorCents = Math.max(
    ...records.flatMap((record) => record.tuning.ratioErrorCents.map(Math.abs)),
  );
  const maximumEigenRelativeResidual = Math.max(
    ...records.flatMap((record) => record.eigenRelativeResiduals),
  );
  const minimumRoundedElementThicknessM = Math.min(
    ...records.flatMap((record) => record.elementThicknessM),
  );
  const minimumPhysicalThicknessM =
    AUTHORITY.manufacturing.measuredYamahaC4M.minimumUndercutThickness;
  if (minimumRoundedElementThicknessM < minimumPhysicalThicknessM) {
    throw new Error(
      `PHS6_EIGENPACK_MINIMUM_PHYSICAL_THICKNESS:${String(minimumRoundedElementThicknessM)}`,
    );
  }
  const measuredC4 = AUTHORITY.manufacturing.measuredYamahaC4M;
  const c4Record = records.find((record) => record.midi === measuredC4.midi);
  if (
    c4Record === undefined ||
    Math.abs(c4Record.lengthM - measuredC4.length) > 1e-12 ||
    Math.abs(c4Record.widthM - measuredC4.width) > 1e-12 ||
    Math.abs(c4Record.outerThicknessM - measuredC4.outerThickness) > 1e-12
  ) {
    throw new Error("PHS6_EIGENPACK_MEASURED_C4_GEOMETRY");
  }
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record === undefined) throw new Error("PHS6_EIGENPACK_RECORD");
    if (
      record.lengthM < MANUFACTURING_ENVELOPE.length[0] - 1e-12 ||
      record.lengthM > MANUFACTURING_ENVELOPE.length[1] + 1e-12 ||
      record.widthM < MANUFACTURING_ENVELOPE.width[0] - 1e-12 ||
      record.widthM > MANUFACTURING_ENVELOPE.width[1] + 1e-12 ||
      Math.abs(
        record.outerThicknessM -
          AUTHORITY.manufacturing.perKeyDesignLaw.outerThicknessM,
      ) > 1e-12
    ) {
      throw new Error(
        `PHS6_EIGENPACK_MANUFACTURING_ENVELOPE:midi=${String(record.midi)}`,
      );
    }
    const expectedTargetCount = record.tuning.tunedModeCount;
    const requiredThreeModeMidi =
      AUTHORITY.verticalFlexuralTargets.hierarchy.requiredThreeModeMidi;
    if (
      expectedTargetCount <
        AUTHORITY.verticalFlexuralTargets.hierarchy.mandatoryTunedModeCount ||
      (requiredThreeModeMidi.includes(record.midi) && expectedTargetCount !== 3) ||
      record.tuning.targetRatios.length !== expectedTargetCount ||
      record.tuning.modeStatus.some(
        (status, mode) =>
          status !==
          (mode < expectedTargetCount
            ? "reviewed-target"
            : "causal-prediction-not-reviewed-target"),
      )
    ) {
      throw new Error(`PHS6_EIGENPACK_MODE_STATUS:midi=${String(record.midi)}`);
    }
    const recombinedEffectiveLengthM =
      record.resonator.physicalTubeLengthM + record.resonator.endCorrectionM;
    const resonatorCents =
      1200 *
      Math.log2(
        (ACOUSTICS.soundSpeedMPerS / (4 * recombinedEffectiveLengthM)) /
          record.intendedFrequencyHz,
      );
    if (
      Math.abs(
        recombinedEffectiveLengthM - record.resonator.effectiveAcousticLengthM,
      ) > 1e-12 ||
      Math.abs(resonatorCents) > 1e-6
    ) {
      throw new Error(
        `PHS6_EIGENPACK_RESONATOR_TUNING:midi=${String(record.midi)}:cents=${String(resonatorCents)}`,
      );
    }
    const previous = records[index - 1];
    if (
      previous !== undefined &&
      (record.lengthM > previous.lengthM + 1e-6 ||
        record.widthM > previous.widthM + 1e-12)
    ) {
      throw new Error(
        `PHS6_EIGENPACK_GEOMETRY_MONOTONIC:midi=${String(record.midi)}`,
      );
    }
  }
  const generationToleranceCents =
    AUTHORITY.verticalFlexuralTargets.generationToleranceCents;
  if (maximumPitchErrorCents > generationToleranceCents) {
    const worst = records.reduce((left, right) =>
      Math.abs(left.tuning.pitchErrorCents) >= Math.abs(right.tuning.pitchErrorCents)
        ? left
        : right,
    );
    throw new Error(
      `PHS6_EIGENPACK_PITCH:${String(maximumPitchErrorCents)}:midi=${String(worst.midi)}:length=${String(worst.lengthM)}:ratios=${worst.solvedRatios.slice(0, 4).join(",")}:profile=${worst.undercut.halfProfileFractions.join(",")}`,
    );
  }
  if (maximumRatioErrorCents > generationToleranceCents) {
    throw new Error(`PHS6_EIGENPACK_TUNED_RATIOS:${String(maximumRatioErrorCents)}`);
  }
  if (maximumEigenRelativeResidual > 1e-6) {
    const worstRecord = records.reduce((left, right) =>
      Math.max(...left.eigenRelativeResiduals) >=
      Math.max(...right.eigenRelativeResiduals)
        ? left
        : right,
    );
    const worstMode = worstRecord.eigenRelativeResiduals.indexOf(
      Math.max(...worstRecord.eigenRelativeResiduals),
    );
    throw new Error(
      `PHS6_EIGENPACK_RESIDUAL:${String(maximumEigenRelativeResidual)}:midi=${String(worstRecord.midi)}:mode=${String(worstMode + 1)}:pitchMax=${String(maximumPitchErrorCents)}:ratioMax=${String(maximumRatioErrorCents)}:counts=${[1, 2, 3].map((count) => records.filter((record) => record.tuning.tunedModeCount === count).length).join(",")}`,
    );
  }
  const pack = {
    schema: "changes.physical-parameter-pack.vibraphone-v2-eigenpack.v1",
    modelSchema: "changes.dsp.vibraphone-v2.v1",
    inputSha256,
    authorityFileSha256,
    generatorSourceSha256,
    generatedBy: SOLVER.id,
    solver: SOLVER,
    material: MATERIAL,
    acoustics: ACOUSTICS,
    thermophysicalAtEvaluationTemperature: THERMOPHYSICAL,
    lossModel: LOSS_MODEL,
    authorities: AUTHORITIES,
    units: {
      length: "m",
      mass: "kg",
      frequency: "Hz",
      eigenvalue: "rad2/s2",
      displacementModeShape: "kg^-0.5",
      t60: "s",
    },
    noClaim: AUTHORITY.noClaim,
    bounds: {
      keys: records.length,
      modesPerKey: MODE_COUNT,
      elementsPerKey: ELEMENT_COUNT,
      nodesPerModeShape: NODE_COUNT,
      maximumJacobiSweeps: SOLVER.maximumJacobiSweeps,
      maximumTuningPasses: SOLVER.tuningMaximumPasses,
      maximumBeamSolvesPerKey: SOLVER.maximumBeamSolvesPerKey,
      maximumJacobiSweepsAggregatePerKey:
        SOLVER.maximumJacobiSweepsAggregatePerKey,
    },
    aggregateWork,
    summary: {
      tunedModeCounts: Object.fromEntries(
        [1, 2, 3].map((count) => [
          String(count),
          records.filter((record) => record.tuning.tunedModeCount === count).length,
        ]),
      ),
      maximumPitchErrorCents: round(maximumPitchErrorCents),
      maximumTargetRatioErrorCents: round(maximumRatioErrorCents),
      maximumEigenRelativeResidual: round(maximumEigenRelativeResidual),
      freeDecayT60SecondsRange: [
        round(Math.min(...records.flatMap((record) => record.t60Seconds))),
        round(Math.max(...records.flatMap((record) => record.t60Seconds))),
      ],
    },
    records,
  };
  const jsonText = `${JSON.stringify(pack, null, 2)}\n`;
  const rustText = renderRust(
    records,
    inputSha256,
    authorityFileSha256,
    generatorSourceSha256,
  );
  const check = process.argv.includes("--check");
  if (check) {
    const [existingJson, existingRust] = await Promise.all([
      readFile(JSON_OUTPUT, "utf8"),
      readFile(RUST_OUTPUT, "utf8"),
    ]);
    if (existingJson !== jsonText || existingRust !== rustText) {
      throw new Error("PHS6_EIGENPACK_DRIFT");
    }
  } else {
    await Promise.all([
      writeFile(JSON_OUTPUT, jsonText),
      writeFile(RUST_OUTPUT, rustText),
    ]);
  }
  process.stdout.write(
    `${JSON.stringify({
      schema: "changes.foundry.vibraphone-v2-eigenpack-run.v1",
      outcome: "pass",
      check,
      inputSha256,
      records: records.length,
      tunedModeCounts: Object.fromEntries(
        [1, 2, 3].map((count) => [
          String(count),
          records.filter((record) => record.tuning.tunedModeCount === count).length,
        ]),
      ),
      maximumPitchErrorCents: round(maximumPitchErrorCents),
      maximumTargetRatioErrorCents: round(maximumRatioErrorCents),
      maximumEigenRelativeResidual: round(maximumEigenRelativeResidual),
      aggregateWork,
      jsonSha256: sha256Utf8(jsonText),
      rustSha256: sha256Utf8(rustText),
    })}\n`,
  );
}

await main();
