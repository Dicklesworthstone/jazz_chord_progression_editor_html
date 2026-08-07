/**
 * PHS1 offline foundry: analytic Hertz and Hunt-Crossley normal-contact laws
 * with the refusing applicability envelope, for PHS6 mallet and future piano
 * hammer parameter packs.
 *
 * Provenance: ported from
 * /dp/frankensim/crates/fs-contact/src/normal_patch/law.rs at commit
 * b47259187a31b704f8f0faf6abdf49b32919b96a, source SHA-256
 * b2635d505581e178b6f8320c860b9ee492553c21c03a1c0c07a08041b824aee2,
 * retrieved 2026-08-06. Distributed under this repository's MIT License with
 * the OpenAI/Anthropic Rider, per the owner's recorded license decision
 * (docs/PHS1_FRANKENSIM_EXTRACTION_MAP.md section 5).
 *
 * Local modifications, itemized:
 * - Rust Result/enum errors become refusal findings ({ code, ... }) returned
 *   in a discriminated union; nothing throws across the boundary.
 * - fs_blake3 ContentHash receipt/request identities become sha256Hex over
 *   the same canonical field ordering (reusing the foundry's helpers);
 *   fs_tribo InterfaceSystemRef/InputAuthority plumbing is reduced to plain
 *   string identity fields (the foundry has no interface registry).
 * - The physics, constants, refusal ordering, applicability ratio set, AGM
 *   elliptic-integral kernel, 80-step aspect bisection, and 1e-12 minimum
 *   minor-to-major-squared envelope are ported unchanged.
 * - A fitting helper (Hunt-Crossley power-law parameter recovery) is added
 *   on top of the fitting-stack module; it is not part of the Rust source.
 */

import { canonicalJson, sha256Hex } from "./physical-foundry";
import {
  FoundryStream,
  conformalBand,
  lbfgsMinimize,
  nelderMead,
  verifyGradient,
} from "./physical-foundry-fitting";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export const CONTACT_POINT_SI_UNITS = "SI:m,s,N,N/m,Pa,J,W";
export const CONTACT_LINE_SI_UNITS = "SI:m,s,N/m,Pa,J/m,W/m";

export type ContactLaw =
  | Readonly<{ kind: "hertz-sphere-plane"; effectiveRadiusM: number; reducedModulusPa: number }>
  | Readonly<{ kind: "hertz-cylinder-plane"; effectiveRadiusM: number; reducedModulusPa: number }>
  | Readonly<{
      kind: "hunt-crossley-sphere";
      effectiveRadiusM: number;
      reducedModulusPa: number;
      dissipationSPerM: number;
    }>
  | Readonly<{
      kind: "hertz-elliptic-paraboloid";
      maximumPrincipalCurvatureMInverse: number;
      minimumPrincipalCurvatureMInverse: number;
      reducedModulusPa: number;
    }>;

export type ContactGeometry =
  | "sphere-plane"
  | "cylinder-plane"
  | "elliptic-paraboloid"
  | "toroidal-or-highly-elliptical";

/**
 * Inputs governing the validity envelope. All refusal limits are the
 * caller's declared bounds for the small-strain, nonadhesive half-space law;
 * the envelope exists so fitted (k, n, lambda) packs stay honest instead of
 * extrapolating Hertz beyond where it means anything.
 */
export type ApplicabilityInput = Readonly<{
  /** Substrate depth below the contact; patch must stay small against it. */
  halfSpaceDepthM: number;
  /** Any surface layer (felt, lacquer); patch must stay small against it. */
  layerThicknessM: number;
  /** Yield strength; peak pressure beyond it means plasticity, not Hertz. */
  yieldStrengthPa: number;
  /** Characteristic rate; beyond it means dynamics/viscoelasticity. */
  characteristicRateMPerS: number;
  /** Contact temperature; material constants are only valid in a window. */
  temperatureK: number;
  /** Nonzero adhesion is refused outright (JKR/DMT territory). */
  adhesionEnergyJPerM2: number;
}>;

export type ApplicabilityLimits = Readonly<{
  maxPatchToRadius: number;
  maxStrain: number;
  maxPatchToDepth: number;
  maxPatchToLayer: number;
  maxPressureToYield: number;
  maxRateRatio: number;
  minTemperatureK: number;
  maxTemperatureK: number;
}>;

export type ApplicabilityRatios = Readonly<{
  patchToRadius: number;
  strain: number;
  patchToDepth: number;
  patchToLayer: number;
  pressureToYield: number;
  rateRatio: number;
}>;

export type ContactRequest = Readonly<{
  modelId: string;
  sourceId: string;
  stateId: string;
  law: ContactLaw;
  geometry: ContactGeometry;
  indentationM: number;
  indentationRateMPerS: number;
  stepS: number;
  /** Applies only to cylinder contact (per unit axial length). */
  lineLoadNPerM: number;
  applicability: ApplicabilityInput;
  limits: ApplicabilityLimits;
}>;

export type EllipticPatchAxes = Readonly<{
  semiMajorAxisM: number;
  semiMinorAxisM: number;
  aspectRatio: number;
}>;

export type PointContactReceipt = Readonly<{
  kind: "point";
  requestSha256: string;
  receiptSha256: string;
  units: typeof CONTACT_POINT_SI_UNITS;
  approachM: number;
  normalForceN: number;
  tangentNPerM: number;
  /**
   * Circular-patch radius. For an elliptic receipt this is only the
   * area-equivalent reporting value sqrt(a*b); physical consumers must use
   * ellipticPatchAxes (ported law, same caveat as source).
   */
  patchRadiusM: number;
  ellipticPatchAxes: EllipticPatchAxes | null;
  peakPressurePa: number;
  secondMomentM2: number;
  reversibleEnergyJ: number;
  irreversibleWorkJ: number;
  dissipatedPowerW: number;
  ratios: ApplicabilityRatios;
}>;

export type LineContactReceipt = Readonly<{
  kind: "line";
  requestSha256: string;
  receiptSha256: string;
  units: typeof CONTACT_LINE_SI_UNITS;
  approachM: number;
  normalLineLoadNPerM: number;
  tangentPa: number;
  patchHalfWidthM: number;
  peakPressurePa: number;
  secondMomentM2: number;
  reversibleEnergyJPerM: number;
  irreversibleWorkJPerM: number;
  dissipatedPowerWPerM: number;
  ratios: ApplicabilityRatios;
}>;

export type ContactReceipt = PointContactReceipt | LineContactReceipt;

export type ContactFinding = Readonly<{
  code:
    | "CONTACT_IDENTITY"
    | "CONTACT_INPUT"
    | "CONTACT_APPLICABILITY"
    | "CONTACT_ADHESION"
    | "CONTACT_GEOMETRY_UNSUPPORTED"
    | "CONTACT_GEOMETRY_MISMATCH"
    | "CONTACT_ELLIPTIC_ASPECT"
    | "CONTACT_ELLIPTIC_SOLVE"
    | "CONTACT_OVERFLOW";
  field: string;
  value?: number;
  limit?: number;
}>;

export type ContactOutcome =
  | Readonly<{ ok: true; receipt: ContactReceipt }>
  | Readonly<{ ok: false; finding: ContactFinding }>;

/* ------------------------------------------------------------------ */
/* Internal helpers                                                    */
/* ------------------------------------------------------------------ */

type Fail = { fail: ContactFinding };

function refuse(
  code: ContactFinding["code"],
  field: string,
  value?: number,
  limit?: number,
): ContactOutcome {
  const finding: ContactFinding = Object.freeze(
    value === undefined
      ? { code, field }
      : limit === undefined
        ? { code, field, value }
        : { code, field, value, limit },
  );
  return Object.freeze({ ok: false, finding });
}

function checked(value: number, field: string): number | Fail {
  if (Number.isFinite(value)) return value;
  return { fail: { code: "CONTACT_OVERFLOW", field } };
}

function isFail(value: number | Fail): value is Fail {
  return typeof value !== "number";
}

/* ------------------------------------------------------------------ */
/* Elliptic-integral kernel (ported AGM, identical constants)          */
/* ------------------------------------------------------------------ */

const MIN_MINOR_TO_MAJOR_SQUARED = 1.0e-12;
const ELLIPTIC_BISECTION_STEPS = 80;

/**
 * Complete elliptic integrals K(m) and E(m) for 0 <= m < 1 via the
 * arithmetic-geometric mean, with the companion AGM series for E — the
 * source's deterministic, cancellation-free kernel, ported unchanged.
 */
export function completeEllipticIntegrals(parameterM: number): readonly [number, number] | null {
  if (!(Number.isFinite(parameterM) && parameterM >= 0 && parameterM < 1)) return null;
  if (parameterM === 0) return [Math.PI / 2, Math.PI / 2];
  let arithmetic = 1.0;
  let geometric = Math.sqrt(1.0 - parameterM);
  let sum = 0.5 * parameterM;
  let weight = 1.0;
  for (let step = 0; step < 32; step += 1) {
    const difference = 0.5 * (arithmetic - geometric);
    const nextArithmetic = 0.5 * (arithmetic + geometric);
    const nextGeometric = Math.sqrt(arithmetic * geometric);
    sum += weight * difference * difference;
    if (!Number.isFinite(sum)) return null;
    arithmetic = nextArithmetic;
    geometric = nextGeometric;
    if (Math.abs(difference) <= 8.0 * Number.EPSILON * arithmetic) {
      const completeK = Math.PI / 2 / arithmetic;
      const completeE = completeK * (1.0 - sum);
      if (!Number.isFinite(completeK) || !Number.isFinite(completeE)) return null;
      return [completeK, completeE];
    }
    weight *= 2.0;
  }
  return null;
}

/** Returns k_min/k_max from q = (b/a)^2 and complete integrals at m = 1-q. */
function ellipticCurvatureRatio(
  minorToMajorSquared: number,
  completeK: number,
  completeE: number,
): number {
  if (minorToMajorSquared >= 1.0) return 1.0;
  return (completeK - completeE) / (completeE / minorToMajorSquared - completeK);
}

type EllipticShape = Readonly<{ aspectRatio: number; completeK: number; completeE: number }>;

function ellipticHertzShape(
  maximumCurvature: number,
  minimumCurvature: number,
): EllipticShape | ContactFinding {
  if (Object.is(maximumCurvature, minimumCurvature)) {
    return { aspectRatio: 1.0, completeK: Math.PI / 2, completeE: Math.PI / 2 };
  }
  const target = minimumCurvature / maximumCurvature;
  const low = completeEllipticIntegrals(1.0 - MIN_MINOR_TO_MAJOR_SQUARED);
  if (low === null) return { code: "CONTACT_ELLIPTIC_SOLVE", field: "elliptic_kernel" };
  const minimumTarget = ellipticCurvatureRatio(MIN_MINOR_TO_MAJOR_SQUARED, low[0], low[1]);
  if (!Number.isFinite(minimumTarget)) {
    return { code: "CONTACT_ELLIPTIC_SOLVE", field: "elliptic_curvature_ratio" };
  }
  if (target < minimumTarget) {
    return {
      code: "CONTACT_ELLIPTIC_ASPECT",
      field: "curvature_ratio",
      value: maximumCurvature / minimumCurvature,
      limit: 1.0 / minimumTarget,
    };
  }
  let lower = MIN_MINOR_TO_MAJOR_SQUARED;
  let upper = 1.0;
  for (let step = 0; step < ELLIPTIC_BISECTION_STEPS; step += 1) {
    const middle = 0.5 * (lower + upper);
    const integrals = completeEllipticIntegrals(1.0 - middle);
    if (integrals === null) return { code: "CONTACT_ELLIPTIC_SOLVE", field: "elliptic_kernel" };
    const recovered = ellipticCurvatureRatio(middle, integrals[0], integrals[1]);
    if (recovered < target) lower = middle;
    else upper = middle;
  }
  const minorToMajorSquared = 0.5 * (lower + upper);
  const integrals = completeEllipticIntegrals(1.0 - minorToMajorSquared);
  if (integrals === null) return { code: "CONTACT_ELLIPTIC_SOLVE", field: "elliptic_kernel" };
  const recovered = ellipticCurvatureRatio(minorToMajorSquared, integrals[0], integrals[1]);
  if (Math.abs(recovered - target) > 1.0e-12 * Math.max(target, MIN_MINOR_TO_MAJOR_SQUARED)) {
    return { code: "CONTACT_ELLIPTIC_SOLVE", field: "aspect_bisection" };
  }
  return {
    aspectRatio: 1.0 / Math.sqrt(minorToMajorSquared),
    completeK: integrals[0],
    completeE: integrals[1],
  };
}

/* ------------------------------------------------------------------ */
/* Validation (ported ordering)                                        */
/* ------------------------------------------------------------------ */

function validate(request: ContactRequest): ContactFinding | null {
  for (const [text, name] of [
    [request.modelId, "model_id"],
    [request.sourceId, "source_id"],
    [request.stateId, "state_id"],
  ] as const) {
    if (text.trim().length === 0) return { code: "CONTACT_IDENTITY", field: name };
  }
  const applicability = request.applicability;
  for (const [value, name] of [
    [request.indentationM, "indentation_m"],
    [request.stepS, "step_s"],
    [request.lineLoadNPerM, "line_load_n_per_m"],
    [applicability.halfSpaceDepthM, "half_space_depth_m"],
    [applicability.layerThicknessM, "layer_thickness_m"],
    [applicability.yieldStrengthPa, "yield_strength_pa"],
    [applicability.characteristicRateMPerS, "characteristic_rate"],
    [applicability.temperatureK, "temperature_k"],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) return { code: "CONTACT_INPUT", field: name };
  }
  if (
    applicability.halfSpaceDepthM === 0 ||
    applicability.layerThicknessM === 0 ||
    applicability.yieldStrengthPa === 0 ||
    applicability.characteristicRateMPerS === 0
  ) {
    return { code: "CONTACT_INPUT", field: "applicability denominator" };
  }
  if (!Number.isFinite(request.indentationRateMPerS)) {
    return { code: "CONTACT_INPUT", field: "indentation_rate" };
  }
  if (applicability.adhesionEnergyJPerM2 !== 0) {
    return {
      code: "CONTACT_ADHESION",
      field: "adhesion_energy_j_per_m2",
      value: applicability.adhesionEnergyJPerM2,
    };
  }
  const limits = request.limits;
  if (
    applicability.temperatureK < limits.minTemperatureK ||
    applicability.temperatureK > limits.maxTemperatureK
  ) {
    return {
      code: "CONTACT_APPLICABILITY",
      field: "temperature_k",
      value: applicability.temperatureK,
      limit: limits.maxTemperatureK,
    };
  }
  for (const [value, name] of [
    [limits.maxPatchToRadius, "max_patch_to_radius"],
    [limits.maxStrain, "max_strain"],
    [limits.maxPatchToDepth, "max_patch_to_depth"],
    [limits.maxPatchToLayer, "max_patch_to_layer"],
    [limits.maxPressureToYield, "max_pressure_to_yield"],
    [limits.maxRateRatio, "max_rate_ratio"],
    [limits.minTemperatureK, "min_temperature_k"],
    [limits.maxTemperatureK, "max_temperature_k"],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) return { code: "CONTACT_INPUT", field: name };
  }
  if (limits.minTemperatureK > limits.maxTemperatureK) {
    return { code: "CONTACT_INPUT", field: "temperature limits" };
  }
  const law = request.law;
  if (law.kind === "hertz-elliptic-paraboloid") {
    if (
      !(
        Number.isFinite(law.maximumPrincipalCurvatureMInverse) &&
        law.maximumPrincipalCurvatureMInverse > 0 &&
        Number.isFinite(law.minimumPrincipalCurvatureMInverse) &&
        law.minimumPrincipalCurvatureMInverse > 0 &&
        Number.isFinite(law.reducedModulusPa) &&
        law.reducedModulusPa > 0
      )
    ) {
      return { code: "CONTACT_INPUT", field: "principal_curvature_or_modulus" };
    }
    if (law.minimumPrincipalCurvatureMInverse > law.maximumPrincipalCurvatureMInverse) {
      return { code: "CONTACT_INPUT", field: "principal_curvature_order" };
    }
  } else {
    if (
      !(
        Number.isFinite(law.effectiveRadiusM) &&
        law.effectiveRadiusM > 0 &&
        Number.isFinite(law.reducedModulusPa) &&
        law.reducedModulusPa > 0
      )
    ) {
      return { code: "CONTACT_INPUT", field: "curvature_or_modulus" };
    }
  }
  if (law.kind === "hunt-crossley-sphere") {
    if (!Number.isFinite(law.dissipationSPerM) || law.dissipationSPerM < 0) {
      return { code: "CONTACT_INPUT", field: "dissipation" };
    }
  }
  if (request.geometry === "toroidal-or-highly-elliptical") {
    return { code: "CONTACT_GEOMETRY_UNSUPPORTED", field: request.geometry };
  }
  const matched =
    (law.kind === "hertz-cylinder-plane" && request.geometry === "cylinder-plane") ||
    ((law.kind === "hertz-sphere-plane" || law.kind === "hunt-crossley-sphere") &&
      request.geometry === "sphere-plane") ||
    (law.kind === "hertz-elliptic-paraboloid" && request.geometry === "elliptic-paraboloid");
  if (!matched) return { code: "CONTACT_GEOMETRY_MISMATCH", field: request.geometry };
  return null;
}

function ratios(
  request: ContactRequest,
  patch: number,
  radius: number,
  approach: number,
  pressure: number,
): ApplicabilityRatios | ContactFinding {
  const computed: ApplicabilityRatios = {
    patchToRadius: patch / radius,
    strain: approach / radius,
    patchToDepth: patch / request.applicability.halfSpaceDepthM,
    patchToLayer: patch / request.applicability.layerThicknessM,
    pressureToYield: pressure / request.applicability.yieldStrengthPa,
    rateRatio:
      Math.abs(request.indentationRateMPerS) / request.applicability.characteristicRateMPerS,
  };
  for (const [name, value, limit] of [
    ["patch_to_radius", computed.patchToRadius, request.limits.maxPatchToRadius],
    ["strain", computed.strain, request.limits.maxStrain],
    ["patch_to_depth", computed.patchToDepth, request.limits.maxPatchToDepth],
    ["patch_to_layer", computed.patchToLayer, request.limits.maxPatchToLayer],
    ["pressure_to_yield", computed.pressureToYield, request.limits.maxPressureToYield],
    ["rate_ratio", computed.rateRatio, request.limits.maxRateRatio],
  ] as const) {
    if (!Number.isFinite(value)) return { code: "CONTACT_OVERFLOW", field: name };
    if (value > limit) {
      return { code: "CONTACT_APPLICABILITY", field: name, value, limit };
    }
  }
  return computed;
}

function isFinding(value: ApplicabilityRatios | ContactFinding): value is ContactFinding {
  return "code" in value;
}

/* ------------------------------------------------------------------ */
/* Receipts                                                            */
/* ------------------------------------------------------------------ */

function requestSha256(request: ContactRequest): string {
  return sha256Hex(canonicalJson({ schema: "contact-request.v1", request }));
}

function receiptSha256(payload: unknown): string {
  return sha256Hex(canonicalJson({ schema: "contact-receipt.v1", payload }));
}

/* ------------------------------------------------------------------ */
/* Evaluation (ported physics)                                         */
/* ------------------------------------------------------------------ */

/** Evaluates one bounded request without mutating any state. */
export function evaluateContact(request: ContactRequest): ContactOutcome {
  const invalid = validate(request);
  if (invalid !== null) return Object.freeze({ ok: false, finding: Object.freeze(invalid) });
  const requestId = requestSha256(request);
  const law = request.law;
  if (law.kind === "hertz-cylinder-plane") {
    return cylinder(request, requestId, law.effectiveRadiusM, law.reducedModulusPa);
  }
  if (law.kind === "hertz-elliptic-paraboloid") {
    return ellipticParaboloid(
      request,
      requestId,
      law.maximumPrincipalCurvatureMInverse,
      law.minimumPrincipalCurvatureMInverse,
      law.reducedModulusPa,
    );
  }
  const dissipative = law.kind === "hunt-crossley-sphere" ? law.dissipationSPerM : null;
  return sphere(request, requestId, law.effectiveRadiusM, law.reducedModulusPa, dissipative);
}

function sphere(
  request: ContactRequest,
  requestId: string,
  radius: number,
  modulus: number,
  dissipative: number | null,
): ContactOutcome {
  const d = request.indentationM;
  const a = checked(Math.sqrt(radius * d), "sphere_patch");
  if (isFail(a)) return Object.freeze({ ok: false, finding: a.fail });
  const elasticForce = checked((4 / 3) * modulus * Math.sqrt(radius) * d ** 1.5, "sphere_force");
  if (isFail(elasticForce)) return Object.freeze({ ok: false, finding: elasticForce.fail });
  const tangent = d === 0 ? 0 : 2 * modulus * Math.sqrt(radius * d);
  if (!Number.isFinite(tangent)) return refuse("CONTACT_OVERFLOW", "sphere_tangent");
  const factor = dissipative === null ? 1 : 1 + dissipative * request.indentationRateMPerS;
  if (factor < 0) {
    return refuse("CONTACT_APPLICABILITY", "Hunt-Crossley force factor", factor, 0);
  }
  const force = checked(elasticForce * factor, "normal_force");
  if (isFail(force)) return Object.freeze({ ok: false, finding: force.fail });
  const p0 = a === 0 ? 0 : (1.5 * force) / (Math.PI * a * a);
  if (!Number.isFinite(p0)) return refuse("CONTACT_OVERFLOW", "peak_pressure");
  const r = ratios(request, a, radius, d, p0);
  if (isFinding(r)) return Object.freeze({ ok: false, finding: Object.freeze(r) });
  const irreversiblePower =
    dissipative === null ? 0 : elasticForce * dissipative * request.indentationRateMPerS ** 2;
  const irreversibleWork = checked(irreversiblePower * request.stepS, "irreversible_work");
  if (isFail(irreversibleWork)) return Object.freeze({ ok: false, finding: irreversibleWork.fail });
  const reversible = checked(0.4 * elasticForce * d, "reversible_energy");
  if (isFail(reversible)) return Object.freeze({ ok: false, finding: reversible.fail });
  return pointReceipt(requestId, {
    approachM: d,
    normalForceN: force,
    tangentNPerM: tangent,
    patchRadiusM: a,
    ellipticPatchAxes: null,
    peakPressurePa: p0,
    secondMomentM2: 0.4 * a * a,
    reversibleEnergyJ: reversible,
    irreversibleWorkJ: irreversibleWork,
    dissipatedPowerW: irreversiblePower,
    ratios: r,
  });
}

function cylinder(
  request: ContactRequest,
  requestId: string,
  radius: number,
  modulus: number,
): ContactOutcome {
  const q = request.lineLoadNPerM;
  if (q === 0) {
    const r = ratios(request, 0, radius, 0, 0);
    if (isFinding(r)) return Object.freeze({ ok: false, finding: Object.freeze(r) });
    return lineReceipt(requestId, {
      approachM: 0,
      normalLineLoadNPerM: 0,
      tangentPa: 0,
      patchHalfWidthM: 0,
      peakPressurePa: 0,
      secondMomentM2: 0,
      reversibleEnergyJPerM: 0,
      irreversibleWorkJPerM: 0,
      dissipatedPowerWPerM: 0,
      ratios: r,
    });
  }
  const a = checked(Math.sqrt((4 * q * radius) / (Math.PI * modulus)), "cylinder_patch");
  if (isFail(a)) return Object.freeze({ ok: false, finding: a.fail });
  // 2.2250738585072014e-308 is f64::MIN_POSITIVE (smallest normal), matching
  // the source exactly; JS Number.MIN_VALUE is the smallest SUBNORMAL and
  // would divide differently in the (unreachable) a == 0 guard branch.
  const log = checked(
    Math.log((4 * radius) / Math.max(a, 2.2250738585072014e-308)),
    "cylinder_log",
  );
  if (isFail(log)) return Object.freeze({ ok: false, finding: log.fail });
  if (log <= 0) {
    return refuse("CONTACT_APPLICABILITY", "cylinder logarithmic reach", log, 0);
  }
  const approach = checked((q * (log + 0.5)) / (Math.PI * modulus), "cylinder_approach");
  if (isFail(approach)) return Object.freeze({ ok: false, finding: approach.fail });
  const tangent = checked((Math.PI * modulus) / log, "cylinder_tangent");
  if (isFail(tangent)) return Object.freeze({ ok: false, finding: tangent.fail });
  const p0 = checked((2 * q) / (Math.PI * a), "cylinder_pressure");
  if (isFail(p0)) return Object.freeze({ ok: false, finding: p0.fail });
  const r = ratios(request, a, radius, approach, p0);
  if (isFinding(r)) return Object.freeze({ ok: false, finding: Object.freeze(r) });
  const energy = checked((q * q * (log + 0.75)) / (2 * Math.PI * modulus), "cylinder_energy");
  if (isFail(energy)) return Object.freeze({ ok: false, finding: energy.fail });
  return lineReceipt(requestId, {
    approachM: approach,
    normalLineLoadNPerM: q,
    tangentPa: tangent,
    patchHalfWidthM: a,
    peakPressurePa: p0,
    secondMomentM2: 0.25 * a * a,
    reversibleEnergyJPerM: energy,
    irreversibleWorkJPerM: 0,
    dissipatedPowerWPerM: 0,
    ratios: r,
  });
}

/**
 * Classical nonadhesive small-strain elliptic Hertz solution for a local gap
 * 0.5*(k_max*x^2 + k_min*y^2). With A = k_min/2, B = k_max/2 and semiaxes
 * a >= b: B/A = (a^2 E - b^2 K)/(b^2 (K - E)), m = 1 - (b/a)^2,
 * b^2 = d E/((A+B) K), F = 2 pi E* b^3 (a/b) (A+B) / (3 E). The conservative
 * envelope scales (semi-major axis a against 1/k_max) are ported unchanged.
 */
function ellipticParaboloid(
  request: ContactRequest,
  requestId: string,
  maximumCurvature: number,
  minimumCurvature: number,
  modulus: number,
): ContactOutcome {
  const d = request.indentationM;
  const shape = ellipticHertzShape(maximumCurvature, minimumCurvature);
  if ("code" in shape) return Object.freeze({ ok: false, finding: Object.freeze(shape) });
  const curvatureSum = maximumCurvature + minimumCurvature;
  const bSquared = checked(
    (d * shape.completeE) / (0.5 * curvatureSum * shape.completeK),
    "elliptic_minor_axis_squared",
  );
  if (isFail(bSquared)) return Object.freeze({ ok: false, finding: bSquared.fail });
  const b = Math.sqrt(bSquared);
  const a = b * shape.aspectRatio;
  if (!Number.isFinite(a)) return refuse("CONTACT_OVERFLOW", "elliptic_major_axis");
  const force = checked(
    (Math.PI * modulus * b ** 3 * shape.aspectRatio * curvatureSum) / (3 * shape.completeE),
    "elliptic_force",
  );
  if (isFail(force)) return Object.freeze({ ok: false, finding: force.fail });
  const tangent = d === 0 ? 0 : (1.5 * force) / d;
  if (!Number.isFinite(tangent)) return refuse("CONTACT_OVERFLOW", "elliptic_tangent");
  const patchArea = Math.PI * a * b;
  const p0 = patchArea === 0 ? 0 : (1.5 * force) / patchArea;
  if (!Number.isFinite(p0)) return refuse("CONTACT_OVERFLOW", "elliptic_peak_pressure");
  const minimumRadius = 1 / maximumCurvature;
  const r = ratios(request, a, minimumRadius, d, p0);
  if (isFinding(r)) return Object.freeze({ ok: false, finding: Object.freeze(r) });
  const reportingRadius = Math.sqrt(a * b);
  const reversible = checked(0.4 * force * d, "elliptic_reversible_energy");
  if (isFail(reversible)) return Object.freeze({ ok: false, finding: reversible.fail });
  return pointReceipt(requestId, {
    approachM: d,
    normalForceN: force,
    tangentNPerM: tangent,
    patchRadiusM: reportingRadius,
    ellipticPatchAxes: Object.freeze({
      semiMajorAxisM: a,
      semiMinorAxisM: b,
      aspectRatio: shape.aspectRatio,
    }),
    peakPressurePa: p0,
    secondMomentM2: (a * a + b * b) / 5,
    reversibleEnergyJ: reversible,
    irreversibleWorkJ: 0,
    dissipatedPowerW: 0,
    ratios: r,
  });
}

type PointFields = Omit<PointContactReceipt, "kind" | "requestSha256" | "receiptSha256" | "units">;
type LineFields = Omit<LineContactReceipt, "kind" | "requestSha256" | "receiptSha256" | "units">;

function responseInvalid(values: readonly (readonly [number, string])[]): ContactFinding | null {
  for (const [value, field] of values) {
    if (!Number.isFinite(value) || value < 0) return { code: "CONTACT_OVERFLOW", field };
  }
  return null;
}

function pointReceipt(requestId: string, fields: PointFields): ContactOutcome {
  const invalid = responseInvalid([
    [fields.approachM, "approach"],
    [fields.normalForceN, "force"],
    [fields.tangentNPerM, "tangent"],
    [fields.patchRadiusM, "patch"],
    [fields.peakPressurePa, "pressure"],
    [fields.reversibleEnergyJ, "energy"],
    [fields.irreversibleWorkJ, "work"],
    [fields.dissipatedPowerW, "power"],
  ]);
  if (invalid !== null) return Object.freeze({ ok: false, finding: Object.freeze(invalid) });
  const receipt: PointContactReceipt = Object.freeze({
    kind: "point",
    requestSha256: requestId,
    receiptSha256: receiptSha256({ kind: "point", requestId, fields }),
    units: CONTACT_POINT_SI_UNITS,
    ...fields,
  });
  return Object.freeze({ ok: true, receipt });
}

function lineReceipt(requestId: string, fields: LineFields): ContactOutcome {
  const invalid = responseInvalid([
    [fields.approachM, "approach"],
    [fields.normalLineLoadNPerM, "force"],
    [fields.tangentPa, "tangent"],
    [fields.patchHalfWidthM, "patch"],
    [fields.peakPressurePa, "pressure"],
    [fields.reversibleEnergyJPerM, "energy"],
    [fields.irreversibleWorkJPerM, "work"],
    [fields.dissipatedPowerWPerM, "power"],
  ]);
  if (invalid !== null) return Object.freeze({ ok: false, finding: Object.freeze(invalid) });
  const receipt: LineContactReceipt = Object.freeze({
    kind: "line",
    requestSha256: requestId,
    receiptSha256: receiptSha256({ kind: "line", requestId, fields }),
    units: CONTACT_LINE_SI_UNITS,
    ...fields,
  });
  return Object.freeze({ ok: true, receipt });
}

/* ------------------------------------------------------------------ */
/* Hunt-Crossley power-law fitting helper (foundry addition)           */
/* ------------------------------------------------------------------ */

export type HuntCrossleySample = Readonly<{
  indentationM: number;
  indentationRateMPerS: number;
  forceN: number;
}>;

export type HuntCrossleyFit = Readonly<{
  stiffnessK: number;
  exponentN: number;
  dissipationLambda: number;
  rootMeanSquareResidualN: number;
  gradientGatePassed: boolean;
  evals: number;
  /** Split-conformal residual half-width at the requested alpha, if computed. */
  conformalHalfWidthN: number | null;
  escalate: boolean;
}>;

/**
 * Recovers (k, n, lambda) for F = k * d^n * (1 + lambda * dRate) from
 * force-compression loop samples. Parameters are fit in log space for k and
 * direct space for n and lambda (n in (0.5, 3), lambda >= 0 enforced by
 * softplus-free clamping refusals rather than transforms). Nelder-Mead
 * performs the fit; an analytic gradient of the least-squares loss is
 * certified with verifyGradient and, when the gate passes, L-BFGS polishes
 * the optimum. A split-conformal residual band (alpha) is computed when the
 * sample count allows; escalate=true signals the band is too wide relative
 * to the observed force scale (or could not be certified).
 */
export function fitHuntCrossley(
  samples: readonly HuntCrossleySample[],
  options: Readonly<{ seed: number; alpha: number; escalateHalfWidthFraction: number }>,
): HuntCrossleyFit | null {
  if (samples.length < 8) return null;
  if (
    samples.some(
      (sample) =>
        !Number.isFinite(sample.indentationM) ||
        sample.indentationM <= 0 ||
        !Number.isFinite(sample.indentationRateMPerS) ||
        !Number.isFinite(sample.forceN),
    )
  ) {
    return null;
  }
  if (!Number.isFinite(options.alpha) || options.alpha <= 0 || options.alpha >= 1) return null;
  if (
    !Number.isFinite(options.escalateHalfWidthFraction) ||
    options.escalateHalfWidthFraction <= 0
  ) {
    return null;
  }

  const residualForce = (p: readonly number[], sample: HuntCrossleySample): number => {
    const k = Math.exp(p[0] ?? 0);
    const n = p[1] ?? 1.5;
    const lambda = p[2] ?? 0;
    return (
      k * sample.indentationM ** n * (1 + lambda * sample.indentationRateMPerS) - sample.forceN
    );
  };
  const loss = (p: readonly number[]): number => {
    const n = p[1] ?? 1.5;
    const lambda = p[2] ?? 0;
    if (n <= 0.5 || n >= 3 || lambda < 0) return Number.POSITIVE_INFINITY;
    let sum = 0;
    for (const sample of samples) sum += residualForce(p, sample) ** 2;
    return sum / samples.length;
  };
  const lossGradient = (p: readonly number[]): readonly [number, readonly number[]] => {
    const k = Math.exp(p[0] ?? 0);
    const n = p[1] ?? 1.5;
    const lambda = p[2] ?? 0;
    let sum = 0;
    let gLogK = 0;
    let gN = 0;
    let gLambda = 0;
    for (const sample of samples) {
      const powered = sample.indentationM ** n;
      const rateFactor = 1 + lambda * sample.indentationRateMPerS;
      const model = k * powered * rateFactor;
      const residual = model - sample.forceN;
      sum += residual * residual;
      gLogK += 2 * residual * model;
      gN += 2 * residual * model * Math.log(sample.indentationM);
      gLambda += 2 * residual * k * powered * sample.indentationRateMPerS;
    }
    const m = samples.length;
    return [sum / m, [gLogK / m, gN / m, gLambda / m]];
  };

  // Data-driven start: median force / median d^1.5 for k, n = 1.5, lambda 0.
  const sorted = [...samples].sort((left, right) => left.indentationM - right.indentationM);
  const median = sorted[Math.floor(sorted.length / 2)] ?? sorted[0];
  if (median === undefined) return null;
  const kGuess = Math.max(
    Number.MIN_VALUE,
    Math.abs(median.forceN) / median.indentationM ** 1.5 || 1,
  );
  const start = [Math.log(kGuess), 1.5, 0.1];
  const coarse = nelderMead(loss, start, 0.25, 4000, 0);
  if (coarse === null) return null;

  // Certify the analytic gradient at an informative probe point, never at the
  // optimum itself: at a (near-)minimum the true gradient vanishes and the
  // finite-difference relative error is dominated by cancellation noise, so a
  // gate evaluated there fails precisely when the fit succeeded.
  const probe = coarse.x.map((value, index) => value + (index === 0 ? 0.2 : 0.1));
  const verdict = verifyGradient(
    loss,
    probe,
    lossGradient(probe)[1],
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0.5, -0.5, 0.25],
    ],
    1e-6,
    5e-3,
  );
  let solution = coarse.x;
  let evals = coarse.evals;
  if (verdict.pass) {
    const polished = lbfgsMinimize(lossGradient, coarse.x, {
      memory: 6,
      maxIters: 200,
      gradTol: 1e-14,
    });
    if (polished !== null && polished.f <= coarse.f) {
      solution = polished.x;
      evals += polished.evals;
    }
  }

  const residuals = samples.map((sample) => Math.abs(residualForce(solution, sample)));
  const meanSquare = residuals.reduce((sum, r) => sum + r * r, 0) / residuals.length;
  const forceScale = Math.max(...samples.map((sample) => Math.abs(sample.forceN)), 1e-30);

  // Split-conformal band over a seeded half/half split of residuals.
  const stream = new FoundryStream(options.seed);
  const shuffled = [...residuals];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = stream.nextBelow(index + 1);
    const held = shuffled[index] ?? 0;
    shuffled[index] = shuffled[swap] ?? 0;
    shuffled[swap] = held;
  }
  const calibration = shuffled.slice(0, Math.floor(shuffled.length / 2));
  const band = conformalBand(calibration, options.alpha);
  const halfWidth = band === null || !Number.isFinite(band.halfWidth) ? null : band.halfWidth;
  const escalate =
    halfWidth === null || halfWidth > options.escalateHalfWidthFraction * forceScale;

  return Object.freeze({
    stiffnessK: Math.exp(solution[0] ?? 0),
    exponentN: solution[1] ?? 1.5,
    dissipationLambda: solution[2] ?? 0,
    rootMeanSquareResidualN: Math.sqrt(meanSquare),
    gradientGatePassed: verdict.pass,
    evals,
    conformalHalfWidthN: halfWidth,
    escalate,
  });
}
