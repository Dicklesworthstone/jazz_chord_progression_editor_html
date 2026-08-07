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
const MODE_COUNT = 7;
const ELEMENT_COUNT = 32;
const NODE_COUNT = ELEMENT_COUNT + 1;
const DOF_COUNT = 2 * NODE_COUNT;
const TAU = 2 * Math.PI;

type ModalAuthority = Readonly<{
  schema: string;
  sources: readonly Readonly<Record<string, unknown>>[];
  material: Readonly<{
    name: string;
    densityKgPerM3: number;
    youngModulusPa: number;
    poissonRatio: number;
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
    }>;
  }>;
  verticalFlexuralTargets: Readonly<{
    ratios: readonly [number, number, number];
    generationToleranceCents: number;
    hierarchy: Readonly<{
      mandatoryTunedModeCount: number;
      admissionOrder: readonly number[];
      law: string;
      untunedStatus: string;
    }>;
    mode4AndHigher: string;
  }>;
  dampingAnchors: readonly Readonly<{
    midi: number;
    t60Seconds: readonly number[];
  }>[];
  noClaim: readonly string[];
}>;

const AUTHORITY_TEXT = await readFile(AUTHORITY_PATH, "utf8");
const AUTHORITY = JSON.parse(AUTHORITY_TEXT) as ModalAuthority;
if (
  AUTHORITY.schema !== "changes.physical-authority.vibraphone-v2-modal-design.v1" ||
  AUTHORITY.verticalFlexuralTargets.ratios.length !== 3 ||
  AUTHORITY.dampingAnchors.length !== 4
) {
  throw new Error("PHS6_GENERATOR_AUTHORITY_SCHEMA");
}
const MATERIAL = AUTHORITY.material;
const AUTHORITIES = AUTHORITY.sources;
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
  tuningMaximumPasses: 28,
  tuningMinimumStep: 2e-4,
  frankensimModalPatternCommit:
    "6f76589023ebd77941db678cc8c86de63b691ae5",
});

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
}>;

type SolvedBeam = Readonly<{
  massKg: number;
  modes: readonly Mode[];
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
  massNormalizedDisplacementShapes: readonly (readonly number[])[];
  t60Seconds: readonly number[];
  resonator: Readonly<{ physicalLengthM: number; radiusM: number }>;
  tuning: Readonly<{
    tunedModeCount: number;
    modeStatus: readonly string[];
    targetRatios: readonly number[];
    pitchErrorCents: number;
    ratioErrorCents: readonly number[];
    objectiveCentsRms: number;
  }>;
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

function targetRatios(_midi: number): TuningTarget {
  const ratios = AUTHORITY.verticalFlexuralTargets.ratios;
  return {
    secondModeRatio: ratios[1],
    thirdModeRatio: ratios[2],
  };
}

function lengthBoundsForMidi(midi: number): readonly [number, number] {
  const measured = AUTHORITY.manufacturing.measuredYamahaC4M;
  return midi === measured.midi
    ? [measured.length, measured.length]
    : MANUFACTURING_ENVELOPE.length;
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
      matrix[globalRow * DOF_COUNT + globalColumn] += local[row * 4 + column] ?? 0;
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
          throw new Error(`PHS6_GENERATOR_MASS_NOT_SPD:${row}:${value}`);
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
): Readonly<{ values: readonly number[]; vectors: readonly number[] }> {
  const matrix = [...input];
  const vectors = Array<number>(n * n).fill(0);
  for (let index = 0; index < n; index += 1) {
    vectors[index * n + index] = 1;
  }
  for (let sweep = 0; sweep < SOLVER.maximumJacobiSweeps; sweep += 1) {
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
      throw new Error(`PHS6_GENERATOR_JACOBI_UNRESOLVED:${maximumOffDiagonal}`);
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

function solveBeam(design: BeamDesign): SolvedBeam {
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
  const modes: Mode[] = [];
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
    }
    modes.push({
      eigenvalueRad2PerS2: eigenvalue,
      frequencyHz: Math.sqrt(eigenvalue) / TAU,
      relativeResidual,
      shapeMNegHalfKg: displacement,
    });
  }
  if (modes.length !== MODE_COUNT) {
    throw new Error(`PHS6_GENERATOR_MODE_COUNT:${modes.length}`);
  }
  return { massKg: assembled.massKg, modes };
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
): Readonly<{
  error: number;
  residualCents: readonly number[];
  solved: SolvedBeam;
  variables: UndercutVariables;
}> {
  const variables = variablesFromCoordinates(coordinates);
  const nominalLength = outerDimensions(midi).nominalLengthM;
  const solved = solveBeam(designWith(midi, nominalLength, variables));
  const base = solved.modes[0]?.frequencyHz ?? 1;
  const ratios = solved.modes.map((mode) => mode.frequencyHz / base);
  const target = targetRatios(midi);
  const requiredLengthM =
    nominalLength * Math.sqrt(base / midiFrequencyHz(midi));
  const lengthBounds = lengthBoundsForMidi(midi);
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
): Readonly<{ coordinates: readonly number[]; objective: ReturnType<typeof ratioObjective> }> {
  let coordinates = [...initial];
  let best = ratioObjective(midi, coordinates, tunedModeCount);
  let damping = 1e-2;
  for (let iteration = 0; iteration < 24; iteration += 1) {
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
      const perturbed = ratioObjective(midi, candidate, tunedModeCount);
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
          normal[row * parameterCount + column] +=
            (jacobian[residual * parameterCount + row] ?? 0) *
            (jacobian[residual * parameterCount + column] ?? 0);
        }
      }
      normal[row * parameterCount + row] += damping;
      for (let residual = 0; residual < residualCount; residual += 1) {
        right[row] -=
          (jacobian[residual * parameterCount + row] ?? 0) *
          (best.residualCents[residual] ?? 0);
      }
    }
    const step = solveDenseSystem(normal, right);
    let accepted = false;
    for (const scale of [1, 0.5, 0.25, 0.125, 0.0625]) {
      const candidate = coordinates.map((value, index) =>
        clampDesignCoordinate(value + scale * (step[index] ?? 0)),
      );
      const objective = ratioObjective(midi, candidate, tunedModeCount);
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
): Readonly<{ coordinates: readonly number[]; objective: ReturnType<typeof ratioObjective> }> {
  const parameterCount = ELEMENT_COUNT / 2 - 2;
  const populationSize = 36;
  const generations = 48;
  const random = deterministicUnit(0x51f15e ^ midi);
  const minimum = MINIMUM_THICKNESS_FRACTION;
  const population = Array.from({ length: populationSize }, (_, member) =>
    Array.from({ length: parameterCount }, (_, parameter) => {
      if (member === 0) return 1 - ((1 - minimum) * parameter) / parameterCount;
      return minimum + (1 - minimum) * random();
    }),
  );
  const objectives = population.map((coordinates) =>
    ratioObjective(midi, coordinates, tunedModeCount),
  );
  for (let generation = 0; generation < generations; generation += 1) {
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
      const trialObjective = ratioObjective(midi, trial, tunedModeCount);
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
  );
}

function tuneProfile(
  midi: number,
  initial: readonly number[],
  tunedModeCount: number,
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
  );
  for (const start of starts.slice(1)) {
    const candidate = refineProfileGaussNewton(midi, start, tunedModeCount);
    if (candidate.objective.error < refined.objective.error) refined = candidate;
  }
  let coordinates = [...refined.coordinates];
  let best = refined.objective;
  let step = 0.12;
  for (let pass = 0; pass < SOLVER.tuningMaximumPasses; pass += 1) {
    let improved = false;
    for (let axis = 0; axis < coordinates.length; axis += 1) {
      for (const direction of [-1, 1]) {
        const candidate = [...coordinates];
        candidate[axis] = clampDesignCoordinate(
          (candidate[axis] ?? 0) + direction * step,
        );
        const result = ratioObjective(midi, candidate, tunedModeCount);
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
): Readonly<{
  coordinates: readonly number[];
  variables: UndercutVariables;
  tunedModeCount: number;
}> {
  const tolerance = AUTHORITY.verticalFlexuralTargets.generationToleranceCents;
  for (const tunedModeCount of AUTHORITY.verticalFlexuralTargets.hierarchy.admissionOrder) {
    if (tunedModeCount === 1) {
      const coordinates = Array<number>(ELEMENT_COUNT / 2 - 2).fill(1);
      const objective = ratioObjective(midi, coordinates, tunedModeCount);
      if (Math.max(...objective.residualCents.map(Math.abs)) <= tolerance) {
        return {
          coordinates,
          variables: objective.variables,
          tunedModeCount,
        };
      }
      continue;
    }
    let tuned = tuneProfile(midi, initial, tunedModeCount);
    if (Math.max(...tuned.objective.residualCents.map(Math.abs)) > tolerance) {
      const evolutionary = tuneProfileEvolutionary(midi, tunedModeCount);
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
  throw new Error(`PHS6_GENERATOR_FUNDAMENTAL_INFEASIBLE:midi=${midi}`);
}

const T60_ANCHORS = Object.freeze(
  AUTHORITY.dampingAnchors.map((anchor) =>
    Object.freeze({ midi: anchor.midi, values: anchor.t60Seconds }),
  ),
);

function monotoneCubicInterpolate(
  x: number,
  xs: readonly number[],
  ys: readonly number[],
): number {
  const slopes = Array<number>(xs.length - 1).fill(0);
  for (let index = 0; index < slopes.length; index += 1) {
    slopes[index] =
      ((ys[index + 1] ?? 0) - (ys[index] ?? 0)) /
      ((xs[index + 1] ?? 1) - (xs[index] ?? 0));
  }
  const tangents = Array<number>(xs.length).fill(0);
  tangents[0] = slopes[0] ?? 0;
  tangents[tangents.length - 1] = slopes[slopes.length - 1] ?? 0;
  for (let index = 1; index < tangents.length - 1; index += 1) {
    const left = slopes[index - 1] ?? 0;
    const right = slopes[index] ?? 0;
    tangents[index] = left * right <= 0 ? 0 : (2 * left * right) / (left + right);
  }
  let interval = 0;
  while (interval + 1 < xs.length - 1 && x > (xs[interval + 1] ?? x)) interval += 1;
  const x0 = xs[interval] ?? x;
  const x1 = xs[interval + 1] ?? x;
  const h = x1 - x0;
  const t = Math.max(0, Math.min(1, (x - x0) / h));
  const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
  const h10 = t ** 3 - 2 * t ** 2 + t;
  const h01 = -2 * t ** 3 + 3 * t ** 2;
  const h11 = t ** 3 - t ** 2;
  return (
    h00 * (ys[interval] ?? 0) +
    h10 * h * (tangents[interval] ?? 0) +
    h01 * (ys[interval + 1] ?? 0) +
    h11 * h * (tangents[interval + 1] ?? 0)
  );
}

function t60ForMidi(midi: number): readonly number[] {
  const xs = T60_ANCHORS.map((anchor) => Math.log(midiFrequencyHz(anchor.midi)));
  const x = Math.log(midiFrequencyHz(midi));
  const firstFour = Array.from({ length: 4 }, (_, mode) =>
    monotoneCubicInterpolate(
      x,
      xs,
      T60_ANCHORS.map((anchor) => anchor.values[mode] ?? 0),
    ),
  );
  const fourth = firstFour[3] ?? 1;
  return [
    ...firstFour,
    Math.max(0.45, 0.75 * fourth),
    Math.max(0.4, 0.58 * fourth),
    Math.max(0.35, 0.45 * fourth),
  ];
}

function round(value: number): number {
  if (!Number.isFinite(value)) throw new Error("PHS6_GENERATOR_NONFINITE");
  return Number(value.toPrecision(16));
}

function buildRecord(
  midi: number,
  initialCoordinates: readonly number[],
): Readonly<{ record: PackRecord; nextCoordinates: readonly number[] }> {
  const tuning = tuneHierarchicalProfile(midi, initialCoordinates);
  const dimensions = outerDimensions(midi);
  const nominalDesign = designWith(
    midi,
    dimensions.nominalLengthM,
    tuning.variables,
  );
  const nominalSolved = solveBeam(nominalDesign);
  const nominalBase = nominalSolved.modes[0]?.frequencyHz ?? 1;
  const lengthBounds = lengthBoundsForMidi(midi);
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
  const target = targetRatios(midi);
  const allCandidateTargets = [1, target.secondModeRatio, target.thirdModeRatio];
  const targetVector = allCandidateTargets.slice(0, tuning.tunedModeCount);
  const pitchErrorCents = 1200 * Math.log2(base / midiFrequencyHz(midi));
  const ratioErrorCents = Array.from(
    { length: Math.max(0, tuning.tunedModeCount - 1) },
    (_, offset) => offset + 1,
  ).map(
    (index) => 1200 * Math.log2((ratios[index] ?? 1) / (targetVector[index] ?? 1)),
  );
  const radiusM = 0.031 - (0.01 * (midi - MIN_MIDI)) / (MAX_MIDI - MIN_MIDI);
  const resonatorLengthM = 343 / (4 * midiFrequencyHz(midi));
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
    massNormalizedDisplacementShapes: solved.modes.map((mode) =>
      mode.shapeMNegHalfKg.map(round),
    ),
    t60Seconds: t60ForMidi(midi).map(round),
    resonator: {
      physicalLengthM: round(resonatorLengthM),
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
        midi: ${record.midi},
        intended_frequency_hz: ${rustFloat(record.intendedFrequencyHz)},
        length_m: ${rustFloat(record.lengthM)},
        width_m: ${rustFloat(record.widthM)},
        outer_thickness_m: ${rustFloat(record.outerThicknessM)},
        element_thickness_m: ${rustArray(record.elementThicknessM)},
        mass_kg: ${rustFloat(record.massKg)},
        tuned_mode_count: ${record.tuning.tunedModeCount},
        solved_frequencies_hz: ${rustArray(record.solvedFrequenciesHz)},
        eigen_relative_residuals: ${rustArray(record.eigenRelativeResiduals)},
        mode_shapes_m_neg_half_kg: [
${record.massNormalizedDisplacementShapes
  .map((shape) => `            ${rustArray32(shape)},`)
  .join("\n")}
        ],
        t60_seconds: ${rustArray(record.t60Seconds)},
        resonator_length_m: ${rustFloat(record.resonator.physicalLengthM)},
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
pub(super) const VIBES_V2_MODAL_PACK: [ModalPackRecord; ${records.length}] = [
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
    const tuned = tuneProfileEvolutionary(midi, tunedModeCount);
    const nominalLengthM = outerDimensions(midi).nominalLengthM;
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
      const ratios = targetRatios(midi);
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
    dampingAnchors: T60_ANCHORS,
  };
  const inputSha256 = sha256Utf8(canonical(inputs));
  const records: PackRecord[] = [];
  let coordinates: readonly number[] = initialProfileCoordinates();
  for (let midi = MIN_MIDI; midi <= MAX_MIDI; midi += 1) {
    const built = buildRecord(midi, coordinates);
    records.push(built.record);
    coordinates = built.nextCoordinates;
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
  if (minimumRoundedElementThicknessM < 0.005) {
    throw new Error(
      `PHS6_EIGENPACK_MINIMUM_PHYSICAL_THICKNESS:${minimumRoundedElementThicknessM}`,
    );
  }
  if (maximumPitchErrorCents > 2) {
    const worst = records.reduce((left, right) =>
      Math.abs(left.tuning.pitchErrorCents) >= Math.abs(right.tuning.pitchErrorCents)
        ? left
        : right,
    );
    throw new Error(
      `PHS6_EIGENPACK_PITCH:${maximumPitchErrorCents}:midi=${worst.midi}:length=${worst.lengthM}:ratios=${worst.solvedRatios.slice(0, 4).join(",")}:profile=${worst.undercut.halfProfileFractions.join(",")}`,
    );
  }
  if (maximumRatioErrorCents > 2) {
    throw new Error(`PHS6_EIGENPACK_TUNED_RATIOS:${maximumRatioErrorCents}`);
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
      `PHS6_EIGENPACK_RESIDUAL:${maximumEigenRelativeResidual}:midi=${worstRecord.midi}:mode=${worstMode + 1}`,
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
    },
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
      jsonSha256: sha256Utf8(jsonText),
      rustSha256: sha256Utf8(rustText),
    })}\n`,
  );
}

await main();
