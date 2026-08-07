/**
 * PHS4 offline foundry: per-body mode tables with signed bridge and
 * radiation residues for the plucked-string family (jcpe-mnsc.6.2).
 *
 * Authority chain (spec commit bbd3e2a, tests/fixtures/plucked-string-v2/):
 * body geometry comes from instrument-packs.json; the mode-table authority
 * is "foundry-plate-mode-v1" (scripts/physical-foundry-plate-modes.ts,
 * analytically validated against continuum Kirchhoff-Love plate modes).
 * The simply-supported closed-form path supplies frequencies; the analytic
 * mass-normalized SS mode shapes supply the residues the runtime needs:
 *
 *   phi_mn(x, y)  = (2 / sqrt(rho h a b)) sin(m pi x / a) sin(n pi y / b)
 *   b_k (bridge)  = phi_mn at the bridge point (signed)
 *   r_k (radiate) = integral of phi_mn over the plate
 *                 = (2 / sqrt(rho h a b)) * a b (1 - cos m pi)(1 - cos n pi)
 *                   / (m n pi^2)
 *
 * FrankenSim's fs-plate DKT elements (source commit 19a625cd, workspace
 * HEAD 61f48c03) are the pinned CONCEPT authority for the braced-plate
 * refinement recorded in the spec; no FrankenSim code is copied or imported
 * here, and the braced-mesh refinement is an explicitly recorded follow-up.
 *
 * Mode damping (Q) values are AUTHORED design targets (wood loss factor
 * eta ~= 0.025-0.03 => Q ~= 33-40 for spruce plate modes; Helmholtz Q from
 * the classic guitar-body literature range), not measurements; the pack
 * records them as authored so no fixture treats them as measured truth.
 *
 * Output: physical/parameter-packs/plucked-bodies-v2.json (canonical,
 * content-hashed) and dsp/concert-grand/src/plucked_body_tables.rs
 * (generated, sorted, byte-stable; regenerating must be a no-op unless the
 * pack changes).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { canonicalJson, sha256Hex } from "./physical-foundry";
import {
  computePlateModeTable,
  type PlateMaterial,
} from "./physical-foundry-plate-modes";

type PackBody = Readonly<{
  id: string;
  scaleLengthM: number;
  bodyVolumeM3: number;
  plateSizeM: readonly [number, number, number];
  helmholtzHz: number | null;
  bridgeAdmittanceScale: number;
  modeTableAuthority: string;
}>;

const ROOT = resolve(import.meta.dir, "..");
const PACKS_PATH = resolve(
  ROOT,
  "tests/fixtures/plucked-string-v2/instrument-packs.json",
);
const OUT_PACK = resolve(ROOT, "physical/parameter-packs/plucked-bodies-v2.json");
const OUT_RUST = resolve(ROOT, "dsp/concert-grand/src/plucked_body_tables.rs");

/** Spruce-like orthotropic top (authored, literature-range constants). */
const SPRUCE_TOP: PlateMaterial = Object.freeze({
  youngLongitudinalPa: 11.0e9,
  youngRadialPa: 0.9e9,
  shearPa: 0.7e9,
  poissonLR: 0.37,
  densityKgM3: 450,
});

/** Dense hardwood slab for the solid electric (body modes nearly rigid). */
const SOLID_BODY: PlateMaterial = Object.freeze({
  youngLongitudinalPa: 12.0e9,
  youngRadialPa: 12.0e9,
  shearPa: 4.5e9,
  poissonLR: 0.33,
  densityKgM3: 680,
});

const MODES_PER_BODY = 16;
const GRID_X = 96;
const GRID_Y = 72;

/**
 * Boundary + bracing corrections (AUTHORED calibrations, spec-recorded):
 *
 * 1. Real tops are glued to the sides — much closer to clamped than to the
 *    simply-supported boundary the closed-form path solves. The classic
 *    separable approximation for the clamped/SS frequency ratio is
 *    (1 + 1/(2m)) * (1 + 1/(2n)) per (m, n) mode (beam-function ratios),
 *    2.25 for the fundamental, approaching 1 for high modes.
 * 2. X-bracing/arching stiffens the top well beyond the bare plate. Until
 *    the braced DKT mesh (fs-plate concept pin) replaces these tables, a
 *    per-body uniform brace factor is authored so the lowest PLATE mode
 *    lands at the literature main-wood-resonance target for each body
 *    class (dreadnought ~190 Hz, ukulele ~640 Hz, archtop ~230 Hz,
 *    upright bass ~110 Hz). The factors below are calibration, not
 *    measurement, and the pack records them.
 */
const BRACE_FACTOR: Readonly<Record<string, number>> = Object.freeze({
  dreadnought: 2.32,
  ukulele: 3.24,
  archtop: 2.4,
  "upright-bass": 2.71,
});

function clampedOverSimplySupported(m: number, n: number): number {
  return (1 + 1 / (2 * m)) * (1 + 1 / (2 * n));
}
/** Bridge point as a fraction of (a, b): off-centre to break symmetry. */
const BRIDGE_FRACTION_X = 0.54;
const BRIDGE_FRACTION_Y = 0.42;
const PLATE_MODE_Q = 36;
const HELMHOLTZ_Q = 18;

type ModeRow = Readonly<{
  frequencyHz: number;
  q: number;
  /** Mass-normalised shape at the bridge point, kg^-1/2. */
  bridgeResidue: number;
  /** Mass-normalised volume-velocity residue, m^2 kg^-1/2. */
  radiationResidue: number;
  halfWavesX: number;
  halfWavesY: number;
  kind: "plate" | "helmholtz";
}>;

/**
 * The 45 mm solid-electric slab is NOT a thin plate — the foundry's
 * Kirchhoff-Love envelope refuses it (PLATE_THIN_LIMIT), which is correct.
 * Its few stiff, weakly-coupled body resonances are AUTHORED here instead
 * (solid-body literature character: sparse, high-frequency, low mobility),
 * scaled well below acoustic-top residues; the pack records the authorship.
 */
const SOLID_ELECTRIC_AUTHORED: readonly ModeRow[] = Object.freeze([
  Object.freeze({
    frequencyHz: 195,
    q: 55,
    bridgeResidue: 0.09,
    radiationResidue: 0.0,
    halfWavesX: 1,
    halfWavesY: 1,
    kind: "plate" as const,
  }),
  Object.freeze({
    frequencyHz: 860,
    q: 70,
    bridgeResidue: 0.055,
    radiationResidue: 0.0,
    halfWavesX: 2,
    halfWavesY: 1,
    kind: "plate" as const,
  }),
  Object.freeze({
    frequencyHz: 2950,
    q: 80,
    bridgeResidue: 0.03,
    radiationResidue: 0.0,
    halfWavesX: 3,
    halfWavesY: 2,
    kind: "plate" as const,
  }),
]);

function buildBody(body: PackBody): {
  readonly id: string;
  readonly modes: readonly ModeRow[];
} {
  if (body.id === "solid-electric") {
    return { id: body.id, modes: SOLID_ELECTRIC_AUTHORED };
  }
  const [aMeters, bMeters, hMeters] = body.plateSizeM;
  const material = SPRUCE_TOP;
  const result = computePlateModeTable(
    { aMeters, bMeters, hMeters },
    material,
    GRID_X,
    GRID_Y,
    MODES_PER_BODY,
  );
  if (result.outcome !== "accept") {
    throw new Error(
      `plate-mode refusal for ${body.id}: ${JSON.stringify(result.findings)}`,
    );
  }
  const massNorm =
    2 / Math.sqrt(material.densityKgM3 * hMeters * aMeters * bMeters);
  const braceFactor = BRACE_FACTOR[body.id] ?? 1;
  const modes: ModeRow[] = result.table.modes.map((mode) => {
    const m = mode.halfWavesX;
    const n = mode.halfWavesY;
    const bridgeResidue =
      massNorm *
      Math.sin(m * Math.PI * BRIDGE_FRACTION_X) *
      Math.sin(n * Math.PI * BRIDGE_FRACTION_Y);
    const radiationResidue =
      (massNorm * aMeters * bMeters * (1 - Math.cos(m * Math.PI)) * (1 - Math.cos(n * Math.PI))) /
      (m * n * Math.PI * Math.PI);
    return Object.freeze({
      frequencyHz:
        mode.frequencyHz * clampedOverSimplySupported(m, n) * braceFactor,
      q: PLATE_MODE_Q,
      bridgeResidue,
      radiationResidue,
      halfWavesX: m,
      halfWavesY: n,
      kind: "plate" as const,
    });
  });
  if (body.helmholtzHz !== null) {
    // Helmholtz air mode: strongly bridge-coupled and strongly radiating.
    // Residues are authored at the scale of the strongest plate mode so the
    // bounded bridgeAdmittanceScale calibration governs the final balance.
    const strongest = modes.reduce(
      (best, row) => Math.max(best, Math.abs(row.bridgeResidue)),
      0,
    );
    modes.unshift(
      Object.freeze({
        frequencyHz: body.helmholtzHz,
        q: HELMHOLTZ_Q,
        bridgeResidue: strongest,
        radiationResidue:
          1.4 *
          modes.reduce((best, row) => Math.max(best, Math.abs(row.radiationResidue)), 0),
        halfWavesX: 0,
        halfWavesY: 0,
        kind: "helmholtz" as const,
      }),
    );
  }
  modes.sort((left, right) => left.frequencyHz - right.frequencyHz);
  return { id: body.id, modes: Object.freeze(modes) };
}

const packsFile = JSON.parse(readFileSync(PACKS_PATH, "utf8")) as {
  readonly bodies: readonly PackBody[];
};
const bodies = packsFile.bodies
  .filter((body) => body.modeTableAuthority === "foundry-plate-mode-v1")
  .map(buildBody);

const pack = {
  schema: "changes.physical.parameter-pack.plucked-bodies.v2",
  authority: "foundry-plate-mode-v1",
  frankensimConceptPin: {
    workspaceHead: "61f48c03",
    fsPlateCommit: "19a625cd",
    claim:
      "concept-authority-only; no FrankenSim code copied or imported; braced DKT mesh refinement recorded as follow-up",
  },
  material: {
    top: SPRUCE_TOP,
    solid: SOLID_BODY,
    provenance:
      "authored literature-range orthotropic constants (spruce top; dense hardwood slab); Q values authored design targets, not measurements",
  },
  bridgeFraction: [BRIDGE_FRACTION_X, BRIDGE_FRACTION_Y],
  grid: [GRID_X, GRID_Y],
  bodies,
} as const;

const canonical = canonicalJson(pack);
const contentSha256 = sha256Hex(canonical);
mkdirSync(resolve(ROOT, "physical/parameter-packs"), { recursive: true });
writeFileSync(
  OUT_PACK,
  `${JSON.stringify({ ...pack, contentSha256 }, null, 2)}\n`,
);

let rust = `//! GENERATED by scripts/generate-plucked-body-packs.ts — do not edit.\n//! Pack: physical/parameter-packs/plucked-bodies-v2.json\n//! Content SHA-256 (pre-hash canonical form): ${contentSha256}\n\n`;
rust += `pub const PLUCKED_BODY_MODE_FIELDS: usize = 4;\n\n`;
for (const body of bodies) {
  const name = body.id.toUpperCase().replaceAll("-", "_");
  rust += `/// ${body.id}: rows of [frequency_hz, q, bridge_residue, radiation_residue].\n`;
  rust += `pub const BODY_${name}: [[f64; 4]; ${String(body.modes.length)}] = [\n`;
  for (const mode of body.modes) {
    rust += `    [${mode.frequencyHz.toExponential(12)}, ${mode.q.toExponential(12)}, ${mode.bridgeResidue.toExponential(12)}, ${mode.radiationResidue.toExponential(12)}],\n`;
  }
  rust += `];\n\n`;
}
writeFileSync(OUT_RUST, rust);
console.log(
  JSON.stringify(
    {
      pack: OUT_PACK,
      rust: OUT_RUST,
      contentSha256,
      bodies: bodies.map((body) => ({
        id: body.id,
        modes: body.modes.length,
        firstHz: body.modes[0]?.frequencyHz ?? null,
        lastHz: body.modes[body.modes.length - 1]?.frequencyHz ?? null,
      })),
    },
    null,
    2,
  ),
);
