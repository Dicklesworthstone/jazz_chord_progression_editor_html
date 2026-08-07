/**
 * Per-body plate mode-table generator for the PHS1 offline foundry
 * (jcpe-port-plate-solver-3qbe; PHS4 spec input).
 *
 * Provenance: production port of this repository's validated prototype at
 * the 2026-08-06 session scratchpad (plate-modes/plate-modes.ts +
 * RESULTS.md: worst-mode error 0.534% at 48x36 and 0.134% at 96x72 against
 * the analytic continuum, h^2 convergence ratio 3.99, iterative-path
 * agreement 5.31e-8). The eigen-recipe CONCEPT follows
 * docs/PHS1_FRANKENSIM_EXTRACTION_MAP.md sections 3 and 12 (the fs-solid
 * Cholesky-reduction/LOBPCG pattern, concept only) — no FrankenSim code was
 * copied into this file.
 *
 * Physics: Kirchhoff-Love thin plate with simply-supported edges,
 *   D11 w,xxxx + 2(D12 + 2 D66) w,xxyy + D22 w,yyyy = rho h omega^2 w.
 * Material frame convention (extraction map section 12): x is the grain
 * (L, longitudinal) direction aligned with the plate edge of length a;
 * y is the cross-grain (R, radial) direction along edge b.
 *   D11 = E_L h^3 / (12 (1 - nuLR nuRL)),
 *   D22 = E_R h^3 / (12 (1 - nuLR nuRL)),
 *   D12 = nuRL D11 (reciprocity nuRL = nuLR E_R / E_L),
 *   D66 = G_LR h^3 / 12.
 * The isotropic case is evaluated through the SAME general expressions
 * (E_L = E_R = E, G = E / (2 (1 + nu))), so it is bit-consistent with the
 * orthotropic path by construction.
 *
 * Discretization: product-sine modes diagonalize every term under
 * simply-supported boundary conditions, for the continuum AND for the
 * tensor-grid finite-difference operator, so the discrete eigenvalues are
 * closed form:
 *   omega^2 = (D11 lx^2 + 2 (D12 + 2 D66) lx ly + D22 ly^2) / (rho h),
 * with lx, ly the 1D discrete Dirichlet-Laplacian eigenvalues
 *   lx(m) = (4/hx^2) sin^2(m pi hx / (2 a)).
 * In the isotropic case this reduces to D (lx + ly)^2 — the biharmonic =
 * (5-point Laplacian)^2 identity the prototype validated.
 *
 * The iterative path (subspace iteration with deflation on the inverse of
 * the matrix-free FD operator via conjugate gradients, Rayleigh-Ritz
 * projection for clustered pairs, guard vectors for trailing-vector
 * leakage) is retained from the prototype so the recipe generalizes to
 * non-separable boundary conditions, where no closed form exists. Here it
 * must reproduce the closed-form discrete eigenvalues, which certifies the
 * assembly.
 *
 * Determinism: seeded xorshift32 start vectors, fixed sweep counts, no
 * ambient randomness or wall-clock dependence. All refusals are data
 * (FoundryFinding lists), never exceptions across the module boundary.
 */
import {
  type FoundryFinding,
  canonicalJson,
  sha256Hex,
} from "./physical-foundry";

export const PLATE_MODE_LIMITS = Object.freeze({
  minimumPointsPerShortEdge: 24,
  maximumPointsPerEdge: 512,
  maximumModes: 64,
  maximumSubspaceRounds: 64,
  maximumCgIterationsPerSolve: 20_000,
  cgRelativeTolerance: 1e-12,
});

export type PlateGeometry = Readonly<{
  /** Edge along the grain (x, L) direction, metres. */
  aMeters: number;
  /** Edge along the cross-grain (y, R) direction, metres. */
  bMeters: number;
  /** Thickness, metres. */
  hMeters: number;
}>;

export type PlateMaterial = Readonly<{
  /** Young's modulus along the grain (x), Pa. */
  youngLongitudinalPa: number;
  /** Young's modulus across the grain (y), Pa. */
  youngRadialPa: number;
  /** In-plane shear modulus G_LR, Pa. */
  shearPa: number;
  /** Major Poisson ratio nu_LR (strain in R from stress in L). */
  poissonLR: number;
  /** Density, kg/m^3. */
  densityKgM3: number;
}>;

export type PlateModeRow = Readonly<{
  frequencyHz: number;
  halfWavesX: number;
  halfWavesY: number;
}>;

export type PlateModeTable = Readonly<{
  schema: "changes.foundry.plate-mode-table.v1";
  geometry: PlateGeometry;
  material: PlateMaterial;
  gridPointsX: number;
  gridPointsY: number;
  modes: readonly PlateModeRow[];
  contentSha256: string;
}>;

export type PlateModeResult =
  | Readonly<{ outcome: "accept"; table: PlateModeTable }>
  | Readonly<{ outcome: "refuse"; findings: readonly FoundryFinding[] }>;

type BendingStiffness = Readonly<{
  d11: number;
  d22: number;
  d12: number;
  d66: number;
}>;

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function isotropicMaterial(
  youngPa: number,
  poisson: number,
  densityKgM3: number,
): PlateMaterial {
  return Object.freeze({
    youngLongitudinalPa: youngPa,
    youngRadialPa: youngPa,
    shearPa: youngPa / (2 * (1 + poisson)),
    poissonLR: poisson,
    densityKgM3,
  });
}

function bendingStiffness(
  geometry: PlateGeometry,
  material: PlateMaterial,
): BendingStiffness | null {
  const nuLR = material.poissonLR;
  const nuRL = (nuLR * material.youngRadialPa) / material.youngLongitudinalPa;
  const denominator = 1 - nuLR * nuRL;
  if (!(denominator > 0)) return null;
  const cubed = geometry.hMeters ** 3;
  const d11 = (material.youngLongitudinalPa * cubed) / (12 * denominator);
  const d22 = (material.youngRadialPa * cubed) / (12 * denominator);
  const d12 = nuRL * d11;
  const d66 = (material.shearPa * cubed) / 12;
  if (![d11, d22, d66].every(finitePositive) || !Number.isFinite(d12)) {
    return null;
  }
  return { d11, d22, d12, d66 };
}

/** 1D discrete Dirichlet-Laplacian eigenvalue on grid step h = length/points. */
function laplacian1dEigenvalue(
  lengthMeters: number,
  points: number,
  halfWaves: number,
): number {
  const h = lengthMeters / points;
  const s = Math.sin((halfWaves * Math.PI * h) / (2 * lengthMeters));
  return (4 / (h * h)) * s * s;
}

/** Closed-form DISCRETE plate frequency for mode (m, n) on the FD grid. */
export function discretePlateFrequencyHz(
  geometry: PlateGeometry,
  material: PlateMaterial,
  gridPointsX: number,
  gridPointsY: number,
  halfWavesX: number,
  halfWavesY: number,
): number | null {
  const d = bendingStiffness(geometry, material);
  if (d === null) return null;
  const lx = laplacian1dEigenvalue(geometry.aMeters, gridPointsX, halfWavesX);
  const ly = laplacian1dEigenvalue(geometry.bMeters, gridPointsY, halfWavesY);
  const numerator =
    d.d11 * lx * lx + 2 * (d.d12 + 2 * d.d66) * lx * ly + d.d22 * ly * ly;
  const omegaSquared =
    numerator / (material.densityKgM3 * geometry.hMeters);
  if (!finitePositive(omegaSquared)) return null;
  return Math.sqrt(omegaSquared) / (2 * Math.PI);
}

/** Analytic CONTINUUM plate frequency for mode (m, n) — the external oracle. */
export function continuumPlateFrequencyHz(
  geometry: PlateGeometry,
  material: PlateMaterial,
  halfWavesX: number,
  halfWavesY: number,
): number | null {
  const d = bendingStiffness(geometry, material);
  if (d === null) return null;
  const rx = (halfWavesX * Math.PI) / geometry.aMeters;
  const ry = (halfWavesY * Math.PI) / geometry.bMeters;
  const numerator =
    d.d11 * rx ** 4 + 2 * (d.d12 + 2 * d.d66) * rx * rx * ry * ry +
    d.d22 * ry ** 4;
  const omegaSquared =
    numerator / (material.densityKgM3 * geometry.hMeters);
  if (!finitePositive(omegaSquared)) return null;
  return Math.sqrt(omegaSquared) / (2 * Math.PI);
}

function validate(
  geometry: PlateGeometry,
  material: PlateMaterial,
  gridPointsX: number,
  gridPointsY: number,
  modeCount: number,
): FoundryFinding[] {
  const findings: FoundryFinding[] = [];
  const refuse = (code: string, path: string, message: string): void => {
    findings.push(Object.freeze({ code, path, message }));
  };
  const geometryEntries: readonly [string, number][] = [
    ["aMeters", geometry.aMeters],
    ["bMeters", geometry.bMeters],
    ["hMeters", geometry.hMeters],
  ];
  for (const [key, value] of geometryEntries) {
    if (!finitePositive(value)) {
      refuse("PLATE_GEOMETRY", `/geometry/${key}`, "must be finite and positive");
    }
  }
  if (
    finitePositive(geometry.hMeters) &&
    finitePositive(geometry.aMeters) &&
    finitePositive(geometry.bMeters) &&
    geometry.hMeters * 10 > Math.min(geometry.aMeters, geometry.bMeters)
  ) {
    refuse(
      "PLATE_THIN_LIMIT",
      "/geometry/hMeters",
      "thickness exceeds a tenth of the short edge; Kirchhoff-Love is invalid",
    );
  }
  const materialEntries: readonly [string, number][] = [
    ["youngLongitudinalPa", material.youngLongitudinalPa],
    ["youngRadialPa", material.youngRadialPa],
    ["shearPa", material.shearPa],
    ["densityKgM3", material.densityKgM3],
  ];
  for (const [key, value] of materialEntries) {
    if (!finitePositive(value)) {
      refuse("PLATE_MATERIAL", `/material/${key}`, "must be finite and positive");
    }
  }
  if (!(Number.isFinite(material.poissonLR) && material.poissonLR >= 0 &&
    material.poissonLR < 0.5)) {
    refuse("PLATE_MATERIAL", "/material/poissonLR", "must lie in [0, 0.5)");
  }
  if (findings.length === 0 && bendingStiffness(geometry, material) === null) {
    refuse(
      "PLATE_MATERIAL",
      "/material",
      "Poisson reciprocity leaves no positive bending stiffness",
    );
  }
  const shortEdgePoints = Math.min(gridPointsX, gridPointsY);
  if (
    !Number.isInteger(gridPointsX) || !Number.isInteger(gridPointsY) ||
    shortEdgePoints < PLATE_MODE_LIMITS.minimumPointsPerShortEdge
  ) {
    refuse(
      "PLATE_GRID",
      "/grid",
      `short edge needs at least ${String(PLATE_MODE_LIMITS.minimumPointsPerShortEdge)} points`,
    );
  }
  if (
    Math.max(gridPointsX, gridPointsY) > PLATE_MODE_LIMITS.maximumPointsPerEdge
  ) {
    refuse("PLATE_GRID", "/grid", "grid exceeds the authored edge ceiling");
  }
  if (
    !Number.isInteger(modeCount) || modeCount < 1 ||
    modeCount > PLATE_MODE_LIMITS.maximumModes
  ) {
    refuse(
      "PLATE_MODE_COUNT",
      "/modeCount",
      `must be an integer in [1, ${String(PLATE_MODE_LIMITS.maximumModes)}]`,
    );
  }
  return findings;
}

/**
 * Closed-form mode table: enumerate (m, n) pairs, sort by frequency, keep
 * the lowest `modeCount`. The half-wave search range is derived from the
 * requested count so no requested mode can be missed by enumeration.
 */
export function computePlateModeTable(
  geometry: PlateGeometry,
  material: PlateMaterial,
  gridPointsX: number,
  gridPointsY: number,
  modeCount: number,
): PlateModeResult {
  const findings = validate(
    geometry,
    material,
    gridPointsX,
    gridPointsY,
    modeCount,
  );
  if (findings.length > 0) {
    return Object.freeze({ outcome: "refuse", findings: Object.freeze(findings) });
  }
  const range = modeCount + 2;
  const rows: { frequencyHz: number; m: number; n: number }[] = [];
  for (let m = 1; m <= range; m += 1) {
    for (let n = 1; n <= range; n += 1) {
      const frequencyHz = discretePlateFrequencyHz(
        geometry,
        material,
        gridPointsX,
        gridPointsY,
        m,
        n,
      );
      if (frequencyHz === null) {
        return Object.freeze({
          outcome: "refuse",
          findings: Object.freeze([
            Object.freeze({
              code: "PLATE_NON_FINITE",
              path: `/modes/${String(m)}-${String(n)}`,
              message: "non-finite frequency from validated inputs",
            }),
          ]),
        });
      }
      rows.push({ frequencyHz, m, n });
    }
  }
  rows.sort((left, right) =>
    left.frequencyHz === right.frequencyHz
      ? left.m - right.m || left.n - right.n
      : left.frequencyHz - right.frequencyHz,
  );
  const modes = Object.freeze(
    rows.slice(0, modeCount).map((row) =>
      Object.freeze({
        frequencyHz: row.frequencyHz,
        halfWavesX: row.m,
        halfWavesY: row.n,
      }),
    ),
  );
  const body = {
    schema: "changes.foundry.plate-mode-table.v1" as const,
    geometry,
    material,
    gridPointsX,
    gridPointsY,
    modes,
  };
  const table: PlateModeTable = Object.freeze({
    ...body,
    contentSha256: sha256Hex(canonicalJson(body)),
  });
  return Object.freeze({ outcome: "accept", table });
}

/* ------------------------- iterative path ------------------------------ */

type Apply = (out: Float64Array, v: Float64Array) => void;

/**
 * Matrix-free orthotropic FD plate operator on the interior tensor grid:
 *   B = D11 Ax Ax + 2 (D12 + 2 D66) Ax Ay + D22 Ay Ay,
 * with Ax, Ay the (SPD) 1D 5-point Dirichlet Laplacians along each axis.
 * Ax and Ay commute on the tensor grid, so B is symmetric positive
 * definite and CG applies.
 */
function makeApplyPlate(
  geometry: PlateGeometry,
  material: PlateMaterial,
  gridPointsX: number,
  gridPointsY: number,
): Apply | null {
  const d = bendingStiffness(geometry, material);
  if (d === null) return null;
  const interiorX = gridPointsX - 1;
  const interiorY = gridPointsY - 1;
  const hx = geometry.aMeters / gridPointsX;
  const hy = geometry.bMeters / gridPointsY;
  const cx = 1 / (hx * hx);
  const cy = 1 / (hy * hy);
  const size = interiorX * interiorY;
  const ax = new Float64Array(size);
  const ay = new Float64Array(size);
  const axx = new Float64Array(size);
  const axy = new Float64Array(size);
  const ayy = new Float64Array(size);
  const applyAx = (out: Float64Array, v: Float64Array): void => {
    for (let j = 0; j < interiorY; j += 1) {
      for (let i = 0; i < interiorX; i += 1) {
        const k = j * interiorX + i;
        let value = 2 * cx * (v[k] ?? 0);
        if (i > 0) value -= cx * (v[k - 1] ?? 0);
        if (i < interiorX - 1) value -= cx * (v[k + 1] ?? 0);
        out[k] = value;
      }
    }
  };
  const applyAy = (out: Float64Array, v: Float64Array): void => {
    for (let j = 0; j < interiorY; j += 1) {
      for (let i = 0; i < interiorX; i += 1) {
        const k = j * interiorX + i;
        let value = 2 * cy * (v[k] ?? 0);
        if (j > 0) value -= cy * (v[k - interiorX] ?? 0);
        if (j < interiorY - 1) value -= cy * (v[k + interiorX] ?? 0);
        out[k] = value;
      }
    }
  };
  const mixed = 2 * (d.d12 + 2 * d.d66);
  const scale = 1 / (material.densityKgM3 * geometry.hMeters);
  return (out: Float64Array, v: Float64Array): void => {
    applyAx(ax, v);
    applyAy(ay, v);
    applyAx(axx, ax);
    applyAy(axy, ax);
    applyAy(ayy, ay);
    for (let k = 0; k < size; k += 1) {
      out[k] =
        scale *
        (d.d11 * (axx[k] ?? 0) + mixed * (axy[k] ?? 0) + d.d22 * (ayy[k] ?? 0));
    }
  };
}

function dot(x: Float64Array, y: Float64Array): number {
  let sum = 0;
  for (let k = 0; k < x.length; k += 1) sum += (x[k] ?? 0) * (y[k] ?? 0);
  return sum;
}

function cgSolve(
  apply: Apply,
  rhs: Float64Array,
  x: Float64Array,
): number {
  const n = rhs.length;
  const r = new Float64Array(n);
  const p = new Float64Array(n);
  const bp = new Float64Array(n);
  x.fill(0);
  r.set(rhs);
  p.set(rhs);
  let rr = dot(r, r);
  const target =
    PLATE_MODE_LIMITS.cgRelativeTolerance *
    PLATE_MODE_LIMITS.cgRelativeTolerance * rr;
  let iterations = 0;
  while (
    iterations < PLATE_MODE_LIMITS.maximumCgIterationsPerSolve && rr > target
  ) {
    apply(bp, p);
    const alpha = rr / dot(p, bp);
    for (let k = 0; k < n; k += 1) {
      x[k] = (x[k] ?? 0) + alpha * (p[k] ?? 0);
      r[k] = (r[k] ?? 0) - alpha * (bp[k] ?? 0);
    }
    const rrNext = dot(r, r);
    const beta = rrNext / rr;
    for (let k = 0; k < n; k += 1) p[k] = (r[k] ?? 0) + beta * (p[k] ?? 0);
    rr = rrNext;
    iterations += 1;
  }
  return iterations;
}

export type IterativePlateModes = Readonly<{
  /** omega^2-scaled operator eigenvalues, ascending, guards excluded. */
  omegaSquared: readonly number[];
  frequenciesHz: readonly number[];
  cgIterationsTotal: number;
  converged: boolean;
}>;

/**
 * Subspace iteration with deflation on the inverse operator; Rayleigh-Ritz
 * projection (Jacobi) resolves the plate's near-degenerate pairs; guard
 * vectors absorb trailing-vector leakage (both fixes carried over from the
 * validated prototype). Deterministic: xorshift32(seed) start vectors.
 */
export function iteratePlateModes(
  geometry: PlateGeometry,
  material: PlateMaterial,
  gridPointsX: number,
  gridPointsY: number,
  modeCount: number,
  rounds: number,
  seed: number,
  guardVectors = 2,
): IterativePlateModes | null {
  const findings = validate(
    geometry,
    material,
    gridPointsX,
    gridPointsY,
    modeCount,
  );
  if (
    findings.length > 0 ||
    !Number.isInteger(rounds) || rounds < 1 ||
    rounds > PLATE_MODE_LIMITS.maximumSubspaceRounds ||
    !Number.isInteger(guardVectors) || guardVectors < 0 ||
    !Number.isInteger(seed)
  ) {
    return null;
  }
  const apply = makeApplyPlate(geometry, material, gridPointsX, gridPointsY);
  if (apply === null) return null;
  const interiorX = gridPointsX - 1;
  const interiorY = gridPointsY - 1;
  const size = interiorX * interiorY;
  const count = modeCount + guardVectors;
  let state = (seed >>> 0) || 0x2f6e2b1;
  const random = (): number => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff - 0.5;
  };
  const basis: Float64Array[] = [];
  for (let v = 0; v < count; v += 1) {
    const vec = new Float64Array(size);
    for (let k = 0; k < size; k += 1) vec[k] = random();
    basis.push(vec);
  }
  const solved = new Float64Array(size);
  let cgIterationsTotal = 0;
  let converged = true;
  for (let round = 0; round < rounds; round += 1) {
    for (let v = 0; v < count; v += 1) {
      const vec = basis[v];
      if (!vec) continue;
      const iterations = cgSolve(apply, vec, solved);
      cgIterationsTotal += iterations;
      if (iterations >= PLATE_MODE_LIMITS.maximumCgIterationsPerSolve) {
        converged = false;
      }
      vec.set(solved);
      for (let u = 0; u < v; u += 1) {
        const previous = basis[u];
        if (!previous) continue;
        const projection = dot(vec, previous);
        for (let k = 0; k < size; k += 1) {
          vec[k] = (vec[k] ?? 0) - projection * (previous[k] ?? 0);
        }
      }
      const norm = Math.sqrt(dot(vec, vec));
      if (!(norm > 0)) return null;
      for (let k = 0; k < size; k += 1) vec[k] = (vec[k] ?? 0) / norm;
    }
  }
  // Rayleigh-Ritz projection of the operator onto the converged subspace;
  // per-vector Rayleigh quotients cannot separate clustered eigenvalues.
  const scratch = new Float64Array(size);
  const operatorBasis = basis.map((vec) => {
    apply(scratch, vec);
    return Float64Array.from(scratch);
  });
  const projected: number[][] = [];
  for (let row = 0; row < count; row += 1) {
    const values: number[] = [];
    for (let col = 0; col < count; col += 1) {
      const left = basis[row];
      const right = operatorBasis[col];
      values.push(left && right ? dot(left, right) : 0);
    }
    projected.push(values);
  }
  for (let row = 0; row < count; row += 1) {
    for (let col = row + 1; col < count; col += 1) {
      const mean =
        (((projected[row] ?? [])[col] ?? 0) +
          ((projected[col] ?? [])[row] ?? 0)) / 2;
      (projected[row] ?? [])[col] = mean;
      (projected[col] ?? [])[row] = mean;
    }
  }
  for (let sweep = 0; sweep < 60; sweep += 1) {
    let offDiagonal = 0;
    for (let p = 0; p < count; p += 1) {
      for (let q = p + 1; q < count; q += 1) {
        offDiagonal += Math.abs((projected[p] ?? [])[q] ?? 0);
      }
    }
    if (offDiagonal < 1e-13) break;
    for (let p = 0; p < count; p += 1) {
      for (let q = p + 1; q < count; q += 1) {
        const apq = (projected[p] ?? [])[q] ?? 0;
        if (Math.abs(apq) < 1e-300) continue;
        const app = (projected[p] ?? [])[p] ?? 0;
        const aqq = (projected[q] ?? [])[q] ?? 0;
        const theta = 0.5 * Math.atan2(2 * apq, aqq - app);
        const c = Math.cos(theta);
        const s = Math.sin(theta);
        for (let k = 0; k < count; k += 1) {
          const akp = (projected[k] ?? [])[p] ?? 0;
          const akq = (projected[k] ?? [])[q] ?? 0;
          (projected[k] ?? [])[p] = c * akp - s * akq;
          (projected[k] ?? [])[q] = s * akp + c * akq;
        }
        for (let k = 0; k < count; k += 1) {
          const apk = (projected[p] ?? [])[k] ?? 0;
          const aqk = (projected[q] ?? [])[k] ?? 0;
          (projected[p] ?? [])[k] = c * apk - s * aqk;
          (projected[q] ?? [])[k] = s * apk + c * aqk;
        }
      }
    }
  }
  const eigenvalues: number[] = [];
  for (let k = 0; k < count; k += 1) {
    eigenvalues.push((projected[k] ?? [])[k] ?? Number.NaN);
  }
  eigenvalues.sort((left, right) => left - right);
  const kept = eigenvalues.slice(0, modeCount);
  if (!kept.every((value) => finitePositive(value))) return null;
  return Object.freeze({
    omegaSquared: Object.freeze(kept),
    frequenciesHz: Object.freeze(
      kept.map((value) => Math.sqrt(value) / (2 * Math.PI)),
    ),
    cgIterationsTotal,
    converged,
  });
}
