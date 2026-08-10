use fs_material::elastic::OrthotropicElastic;
use fs_modal::{slice_window, ModePair, SliceOptions};
use fs_plate::{assemble, AssemblyOptions, EdgeSupport, PlateMesh, PlateSection, Stiffener};
use fs_sparse::direct::{DirectOrdering, LdltFactor, LdltOptions, SymbolicLdlt};
use fs_sparse::{Coo, Csr};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::env;
use std::f64::consts::PI;
use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const LENGTH_M: f64 = 1.66;
const WIDTH_M: f64 = 1.39;
const THICKNESS_M: f64 = 0.008;
const DENSITY_KG_M3: f64 = 600.0;
const LONGITUDINAL_MODULUS_PA: f64 = 17.1e9;
const RADIAL_MODULUS_PA: f64 = 1.04e9;
const SHEAR_MODULUS_PA: f64 = 1.0e9;
const POISSON_LR: f64 = 0.37;
const RIB_COUNT: usize = 14;
const RIB_WIDTH_M: f64 = 0.020;
const RIB_HEIGHT_M: f64 = 0.025;
const RIB_MODULUS_PA: f64 = 11.0e9;
// Corradi et al. (2017), section 3.3 and table 2: the measured grand-piano
// bridge at G3 is 32 mm wide by 37 mm thick and is modeled as maple with the
// following longitudinal/shear modulus and density.  This reduced DKT pack
// uses that one reviewed section for both physical bridge beams; it does not
// pretend to own the unreported taper of every key position.
const BRIDGE_WIDTH_M: f64 = 0.032;
const BRIDGE_HEIGHT_M: f64 = 0.037;
const BRIDGE_MODULUS_PA: f64 = 12.6e9;
const BRIDGE_SHEAR_MODULUS_PA: f64 = 1.40e9;
const BRIDGE_DENSITY_KG_M3: f64 = 630.0;
const BASS_BRIDGE_MAX_MIDI: i32 = 43;
const TREBLE_BRIDGE_MIN_MIDI: i32 = 44;
// Sixty longitudinal cells put the fourteen equally spaced ribs exactly on
// every fourth internal node column.  The refined 59x23 interior transverse
// grid resolves the board's physical displacement branch through the 12 kHz
// candidate window; the older 30x12/288-lowest reduction ended at 3.88 kHz
// and therefore could not transmit most treble-string partials at all.
const NX: usize = 60;
const NY: usize = 24;
const MINIMUM_MODE_FREQUENCY_HZ: f64 = 1.0;
const MAXIMUM_MODE_FREQUENCY_HZ: f64 = 12_000.125;
const MODE_SLICE_WIDTH_HZ: f64 = 1_000.0;
const MAXIMUM_REFINED_MODES: usize = 16;
const LOW_MODE_REFINEMENT_STEPS: usize = 4;
const REFINEMENT_SHIFT_RELATIVE_OFFSET: f64 = 1.0e-4;
const MAXIMUM_RELATIVE_EIGEN_RESIDUAL: f64 = 1.0e-8;
const MAXIMUM_REFINED_MASS_ORTHOGONALITY_DEFECT: f64 = 1.0e-6;
const AIR_DENSITY_KG_M3: f64 = 1.2041;
const AIR_SOUND_SPEED_M_PER_S: f64 = 343.21;
const RADIATION_DISTANCE_M: f64 = 1.0;
const MIDI_MIN: i32 = 21;
const MIDI_MAX: i32 = 108;
const JSON_OUTPUT: &str = "physical/parameter-packs/piano-v2-soundboard.json";
const RUST_OUTPUT: &str = "dsp/concert-grand/src/piano_v2_soundboard.rs";
const PACK_SCHEMA: &str = "changes.piano-v2-soundboard-pack.v2";
const SOLVER_ID: &str =
    "frankensim-fs-plate-dkt-ribs-two-maple-bridges-conservative-nodal-ports-plus-fs-modal-certified-slices-inverse-refinement-v5";
const FRANKENSIM_REVIEWED_COMMIT: &str = "1346e1be67951ba0ba81f3e99f5eeca6efc42945";
const FRANKENSIM_CRATE_CLOSURE: [&str; 19] = [
    "crates/fs-ad",
    "crates/fs-alloc",
    "crates/fs-blake3",
    "crates/fs-evidence",
    "crates/fs-exec",
    "crates/fs-la",
    "crates/fs-matdb",
    "crates/fs-material",
    "crates/fs-math",
    "crates/fs-modal",
    "crates/fs-obs",
    "crates/fs-plate",
    "crates/fs-qty",
    "crates/fs-rand",
    "crates/fs-simd",
    "crates/fs-soa",
    "crates/fs-soa-derive",
    "crates/fs-sparse",
    "crates/fs-substrate",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GeometryRecord {
    length_m: f64,
    width_m: f64,
    thickness_m: f64,
    density_kg_m3: f64,
    longitudinal_modulus_pa: f64,
    radial_modulus_pa: f64,
    shear_modulus_pa: f64,
    poisson_lr: f64,
    rib_count: usize,
    rib_width_m: f64,
    rib_height_m: f64,
    rib_modulus_pa: f64,
    bridge_count: usize,
    bridge_width_m: f64,
    bridge_height_m: f64,
    bridge_modulus_pa: f64,
    bridge_shear_modulus_pa: f64,
    bridge_density_kg_m3: f64,
    bass_bridge_max_midi: i32,
    treble_bridge_min_midi: i32,
    mesh_cells_x: usize,
    mesh_cells_y: usize,
    support: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkRecord {
    full_dofs: usize,
    free_dofs: usize,
    triangle_count: usize,
    mode_count: usize,
    maximum_eigen_residual: f64,
    certified_slice_count: usize,
    factorization_count: usize,
    lanczos_iterations: usize,
    deflation_restarts: usize,
    refined_mode_count: usize,
    refinement_factorization_count: usize,
    refinement_solve_count: usize,
    maximum_refined_mass_orthogonality_defect: f64,
    maximum_factor_peak_bytes: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModeRecord {
    index: usize,
    frequency_hz: f64,
    eigen_residual: f64,
    node_w_inverse_sqrt_kg: Vec<f64>,
    bridge_residue_inverse_sqrt_kg: Vec<f64>,
    pressure_per_modal_velocity_pa_s_per_m_sqrt_kg: [f64; 4],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SoundboardPack {
    schema: &'static str,
    solver_id: &'static str,
    generator_sha256: String,
    tool_manifest_sha256: String,
    tool_lock_sha256: String,
    frankensim_commit: String,
    input_sha256: String,
    geometry: GeometryRecord,
    work: WorkRecord,
    bridge_anchor_source: &'static str,
    bridge_structure_source: &'static str,
    radiation_law: &'static str,
    modes: Vec<ModeRecord>,
}

struct SolvedMode {
    frequency_hz: f64,
    residual: f64,
    node_w: Vec<f64>,
    bridge_residue: Vec<f64>,
    observer: [f64; 4],
}

#[derive(Clone, Copy, Debug, Default)]
struct RefinementWork {
    refined_mode_count: usize,
    factorization_count: usize,
    solve_count: usize,
    maximum_mass_orthogonality_defect: f64,
    maximum_factor_peak_bytes: usize,
}

struct ModeRefiner {
    mass_factor: LdltFactor,
    pencil_symbolic: SymbolicLdlt,
    options: LdltOptions,
    work: RefinementWork,
}

fn shifted_pencil(k: &Csr, m: &Csr, sigma: f64) -> Csr {
    let mut entries = Coo::new(k.nrows(), k.ncols());
    for row in 0..k.nrows() {
        let (columns, values) = k.row(row);
        for (&column, &value) in columns.iter().zip(values) {
            entries.push(row, column, value);
        }
        let (columns, values) = m.row(row);
        for (&column, &value) in columns.iter().zip(values) {
            entries.push(row, column, -sigma * value);
        }
    }
    entries.assemble()
}

fn pencil_symbolic_union(k: &Csr, m: &Csr) -> Csr {
    assert_eq!(k.nrows(), m.nrows(), "pencil row dimensions disagree");
    assert_eq!(k.ncols(), m.ncols(), "pencil column dimensions disagree");
    let mut entries = Coo::new(k.nrows(), k.ncols());
    for row in 0..k.nrows() {
        let (stiffness_columns, _) = k.row(row);
        for &column in stiffness_columns {
            entries.push(row, column, 1.0);
        }
        let (mass_columns, _) = m.row(row);
        for &column in mass_columns {
            // A nonzero symbolic sentinel is deliberate. Building this with
            // `shifted_pencil(k, m, 0)` lets an assembler discard every
            // mass-only zero and is not the union pattern it claims to be.
            entries.push(row, column, 1.0);
        }
    }
    entries.assemble()
}

fn refined_mass_orthogonality_defect(
    m: &Csr,
    modes: &[ModePair],
    refined_indices: &[usize],
) -> f64 {
    let mut maximum = 0.0_f64;
    let mut mass_times_refined = vec![0.0_f64; m.nrows()];
    for &refined_index in refined_indices {
        let refined = &modes[refined_index].phi;
        m.spmv(refined, &mut mass_times_refined);
        let diagonal = refined
            .iter()
            .zip(&mass_times_refined)
            .map(|(left, right)| left * right)
            .sum::<f64>();
        maximum = maximum.max((diagonal - 1.0).abs());
        for (other_index, other) in modes.iter().enumerate() {
            if other_index == refined_index {
                continue;
            }
            let cross = other
                .phi
                .iter()
                .zip(&mass_times_refined)
                .map(|(left, right)| left * right)
                .sum::<f64>()
                .abs();
            maximum = maximum.max(cross);
        }
    }
    maximum
}

fn certify_mode(
    k: &Csr,
    m: &Csr,
    mass_factor: &fs_sparse::direct::LdltFactor,
    mode: &mut ModePair,
) {
    let mut mass_times_mode = vec![0.0_f64; mode.phi.len()];
    m.spmv(&mode.phi, &mut mass_times_mode);
    let mass_norm = mode
        .phi
        .iter()
        .zip(&mass_times_mode)
        .map(|(left, right)| left * right)
        .sum::<f64>()
        .sqrt();
    assert!(
        mass_norm.is_finite() && mass_norm > 0.0,
        "refined mode has zero mass norm"
    );
    for value in &mut mode.phi {
        *value /= mass_norm;
    }
    m.spmv(&mode.phi, &mut mass_times_mode);
    let mut stiffness_times_mode = vec![0.0_f64; mode.phi.len()];
    k.spmv(&mode.phi, &mut stiffness_times_mode);
    let rayleigh_numerator = mode
        .phi
        .iter()
        .zip(&stiffness_times_mode)
        .map(|(left, right)| left * right)
        .sum::<f64>();
    let rayleigh_denominator = mode
        .phi
        .iter()
        .zip(&mass_times_mode)
        .map(|(left, right)| left * right)
        .sum::<f64>();
    mode.lambda = rayleigh_numerator / rayleigh_denominator;
    assert!(
        mode.lambda.is_finite() && mode.lambda > 0.0,
        "refined eigenvalue is invalid"
    );
    let residual: Vec<f64> = stiffness_times_mode
        .iter()
        .zip(&mass_times_mode)
        .map(|(stiffness, mass)| mode.lambda.mul_add(-mass, *stiffness))
        .collect();
    let inverse_mass_residual = mass_factor.solve(&residual);
    mode.residual = residual
        .iter()
        .zip(&inverse_mass_residual)
        .map(|(left, right)| left * right)
        .sum::<f64>()
        .max(0.0)
        .sqrt();
    assert!(mode.residual.is_finite(), "refined residual is non-finite");
    mode.interval = (mode.lambda - mode.residual, mode.lambda + mode.residual);
}

impl ModeRefiner {
    fn new(k: &Csr, m: &Csr) -> Self {
        let options = LdltOptions::default();
        let mass_symbolic = SymbolicLdlt::analyze(m, DirectOrdering::Amd)
            .expect("analyze soundboard mass matrix for refinement");
        let mass_factor = mass_symbolic
            .factor(m, &options)
            .expect("factor soundboard mass matrix for refinement");
        let mass_inertia = mass_factor.inertia();
        assert_eq!(
            mass_inertia.negative, 0,
            "soundboard mass matrix must be SPD"
        );
        assert_eq!(
            mass_inertia.positive,
            m.nrows(),
            "soundboard mass matrix must have full positive inertia"
        );
        let union_pattern = pencil_symbolic_union(k, m);
        let pencil_symbolic = SymbolicLdlt::analyze(&union_pattern, DirectOrdering::Amd)
            .expect("analyze soundboard pencil for refinement");
        let work = RefinementWork {
            factorization_count: 1,
            maximum_factor_peak_bytes: mass_factor.stats().peak_front_bytes,
            ..RefinementWork::default()
        };
        Self {
            mass_factor,
            pencil_symbolic,
            options,
            work,
        }
    }

    fn refine(&mut self, k: &Csr, m: &Csr, modes: &mut [ModePair]) {
        let mut refined_indices = Vec::new();
        for (mode_index, mode) in modes.iter_mut().enumerate() {
            let relative_residual = mode.residual / mode.lambda.abs().max(1.0);
            if relative_residual <= MAXIMUM_RELATIVE_EIGEN_RESIDUAL {
                continue;
            }
            assert!(
                self.work.refined_mode_count < MAXIMUM_REFINED_MODES,
                "too many soundboard modes require inverse refinement"
            );
            let original_interval = mode.interval;
            let shift = mode.lambda * (1.0 - REFINEMENT_SHIFT_RELATIVE_OFFSET);
            let shifted = shifted_pencil(k, m, shift);
            let factor = self
                .pencil_symbolic
                .factor(&shifted, &self.options)
                .expect("factor low-mode inverse-refinement shift");
            self.work.refined_mode_count += 1;
            self.work.factorization_count += 1;
            self.work.maximum_factor_peak_bytes = self
                .work
                .maximum_factor_peak_bytes
                .max(factor.stats().peak_front_bytes);
            for _ in 0..LOW_MODE_REFINEMENT_STEPS {
                let mut right_hand_side = vec![0.0_f64; mode.phi.len()];
                m.spmv(&mode.phi, &mut right_hand_side);
                mode.phi = factor.solve(&right_hand_side);
                certify_mode(k, m, &self.mass_factor, mode);
                self.work.solve_count += 2;
            }
            assert!(
                mode.interval.1 >= original_interval.0 && mode.interval.0 <= original_interval.1,
                "inverse refinement changed the certified eigenvalue identity"
            );
            refined_indices.push(mode_index);
        }
        let defect = refined_mass_orthogonality_defect(m, modes, &refined_indices);
        assert!(
            defect <= MAXIMUM_REFINED_MASS_ORTHOGONALITY_DEFECT,
            "inverse refinement collapsed distinct modal vectors: {defect:.17e}"
        );
        self.work.maximum_mass_orthogonality_defect =
            self.work.maximum_mass_orthogonality_defect.max(defect);
    }
}

fn rectangle_torsion_constant(width: f64, height: f64) -> f64 {
    let (long, short) = if width >= height {
        (width, height)
    } else {
        (height, width)
    };
    long * short.powi(3)
        * (1.0 / 3.0 - 0.21 * short / long * (1.0 - short.powi(4) / (12.0 * long.powi(4))))
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

const BASS_BRIDGE_ANCHORS: [(i32, f64, f64); 3] = [
    (21, 0.888_433_676, 0.586_466_691),
    (33, 0.783_324_033, 0.422_623_497),
    // The reviewed 23-note grand-piano bass-bridge split ends at G2.  Its
    // terminal point is the linear continuation of the visible A0-A1 bass
    // bridge segment, rather than an interpolation toward the other bridge.
    (43, 0.695_732_663_833_333, 0.286_087_502),
];

const TREBLE_BRIDGE_ANCHORS: [(i32, f64, f64); 4] = [
    // The first long-bridge key is Ab2.  Its plan point is the linear
    // continuation of the independently labelled D4-D5 long-bridge segment.
    (44, 0.470_072_877, 0.618_400_070),
    (62, 0.268_679_391, 0.468_071_366),
    (74, 0.134_417_067, 0.367_852_230),
    (108, 0.017_733_010, 0.023_078_590),
];

fn interpolate_bridge_position(midi: i32, anchors: &[(i32, f64, f64)]) -> (f64, f64) {
    debug_assert!(!anchors.is_empty());
    for pair in anchors.windows(2) {
        let (lower_midi, lower_x, lower_y) = pair[0];
        let (upper_midi, upper_x, upper_y) = pair[1];
        if midi <= upper_midi {
            let amount = (midi - lower_midi) as f64 / (upper_midi - lower_midi) as f64;
            return (
                lower_x + amount * (upper_x - lower_x),
                lower_y + amount * (upper_y - lower_y),
            );
        }
    }
    let (_, x, y) = anchors[anchors.len() - 1];
    (x, y)
}

fn bridge_position_for_midi(midi: i32) -> (f64, f64) {
    assert!((MIDI_MIN..=MIDI_MAX).contains(&midi));
    if midi <= BASS_BRIDGE_MAX_MIDI {
        interpolate_bridge_position(midi, &BASS_BRIDGE_ANCHORS)
    } else {
        interpolate_bridge_position(midi, &TREBLE_BRIDGE_ANCHORS)
    }
}

fn bridge_node_path(mesh: &PlateMesh, first_midi: i32, last_midi: i32) -> Vec<usize> {
    assert!(first_midi <= last_midi);
    let mut nodes = Vec::new();
    for midi in first_midi..=last_midi {
        let (x, y) = bridge_position_for_midi(midi);
        let column = (x * NX as f64).round() as usize;
        let row = (y * NY as f64).round() as usize;
        assert!(column <= NX && row <= NY);
        let node = row * (NX + 1) + column;
        let expected = (
            column as f64 * LENGTH_M / NX as f64,
            row as f64 * WIDTH_M / NY as f64,
        );
        assert!((mesh.nodes[node].0 - expected.0).abs() < 1.0e-15);
        assert!((mesh.nodes[node].1 - expected.1).abs() < 1.0e-15);
        if nodes.last() != Some(&node) {
            nodes.push(node);
        }
    }
    assert!(nodes.len() >= 2);
    nodes
}

fn reviewed_bridge_stiffeners(mesh: &PlateMesh) -> [Stiffener; 2] {
    let area = BRIDGE_WIDTH_M * BRIDGE_HEIGHT_M;
    let inertia = BRIDGE_WIDTH_M * BRIDGE_HEIGHT_M.powi(3) / 12.0;
    let torsion = rectangle_torsion_constant(BRIDGE_WIDTH_M, BRIDGE_HEIGHT_M);
    let eccentricity = 0.5 * (THICKNESS_M + BRIDGE_HEIGHT_M);
    let make = |nodes| Stiffener {
        nodes,
        e: BRIDGE_MODULUS_PA,
        g: BRIDGE_SHEAR_MODULUS_PA,
        area,
        inertia,
        torsion,
        eccentricity,
        density: BRIDGE_DENSITY_KG_M3,
    };
    [
        make(bridge_node_path(mesh, MIDI_MIN, BASS_BRIDGE_MAX_MIDI)),
        make(bridge_node_path(mesh, TREBLE_BRIDGE_MIN_MIDI, MIDI_MAX)),
    ]
}

fn triangle_twice_area(mesh: &PlateMesh, triangle: [usize; 3]) -> f64 {
    let [(x0, y0), (x1, y1), (x2, y2)] = triangle.map(|node| mesh.nodes[node]);
    (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
}

/// Generalized displacement at a point-load port.
///
/// Classical DKT deliberately defines no interior transverse-displacement
/// polynomial; Batoz, Bathe & Ho (1980), section 3.1.2, instead represents
/// transverse loading through nodal forces.  A point force is therefore
/// distributed conservatively to the containing triangle's three w DOFs by
/// barycentric weights, and the modal residue is `phi^T f / F`.  The removed
/// bilinear rectangular-grid interpolation crossed the actual triangle
/// diagonal and invented an interior field that the DKT element does not own.
fn point_load_modal_residue(
    mesh: &PlateMesh,
    node_w: &[f64],
    x_normalized: f64,
    y_normalized: f64,
) -> f64 {
    assert_eq!(node_w.len(), mesh.node_count());
    assert!((0.0..=1.0).contains(&x_normalized));
    assert!((0.0..=1.0).contains(&y_normalized));
    let x = x_normalized * LENGTH_M;
    let y = y_normalized * WIDTH_M;
    let coordinate_scale = LENGTH_M.max(WIDTH_M).max(1.0);
    let admission_tolerance = 64.0 * f64::EPSILON * coordinate_scale;
    for &triangle in &mesh.tris {
        let [(x0, y0), (x1, y1), (x2, y2)] = triangle.map(|node| mesh.nodes[node]);
        let twice_area = triangle_twice_area(mesh, triangle);
        assert!(twice_area > 0.0 && twice_area.is_finite());
        let first = ((x1 - x) * (y2 - y) - (x2 - x) * (y1 - y)) / twice_area;
        let second = ((x2 - x) * (y0 - y) - (x0 - x) * (y2 - y)) / twice_area;
        let third = 1.0 - first - second;
        if first >= -admission_tolerance
            && second >= -admission_tolerance
            && third >= -admission_tolerance
        {
            return first * node_w[triangle[0]]
                + second * node_w[triangle[1]]
                + third * node_w[triangle[2]];
        }
    }
    panic!("reviewed bridge point is outside the DKT mesh: ({x}, {y})");
}

/// Plane-wave generalized observation using the DKT nodal-load measure.
///
/// Batoz et al. equation 75 assigns a uniform transverse load `q*A/3` to
/// each triangle vertex.  Sampling the far-field plane-wave phase at those
/// same vertices extends that power-conjugate nodal port without pretending
/// that an interior w polynomial exists.  At zero wave number this reduces
/// exactly to the reviewed uniform-load vector and integrates a constant
/// modal shape to the physical plate area.
fn observer_integral(
    mesh: &PlateMesh,
    node_w: &[f64],
    wave_number: f64,
    direction_x: f64,
) -> (f64, f64) {
    assert_eq!(node_w.len(), mesh.node_count());
    let mut real = 0.0;
    let mut imaginary = 0.0;
    for &triangle in &mesh.tris {
        let nodal_area = triangle_twice_area(mesh, triangle) / 6.0;
        assert!(nodal_area > 0.0 && nodal_area.is_finite());
        for node in triangle {
            let (x, y) = mesh.nodes[node];
            let phase =
                -wave_number * (direction_x * (x - 0.5 * LENGTH_M) + 0.12 * (y - 0.5 * WIDTH_M));
            let weighted_shape = node_w[node] * nodal_area;
            real += weighted_shape * phase.cos();
            imaginary += weighted_shape * phase.sin();
        }
    }
    (real, imaginary)
}

fn reviewed_frankensim_source() -> String {
    let frankensim_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../frankensim")
        .canonicalize()
        .expect("resolve the sibling FrankenSim checkout");
    let ancestor = Command::new("git")
        .arg("-C")
        .arg(&frankensim_root)
        .args([
            "merge-base",
            "--is-ancestor",
            FRANKENSIM_REVIEWED_COMMIT,
            "HEAD",
        ])
        .output()
        .expect("check the reviewed FrankenSim ancestor");
    assert!(
        ancestor.status.success(),
        "reviewed FrankenSim commit is not an ancestor of the current checkout"
    );
    let status = Command::new("git")
        .arg("-C")
        .arg(&frankensim_root)
        .args(["status", "--porcelain", "--"])
        .args(FRANKENSIM_CRATE_CLOSURE)
        .output()
        .expect("read the reviewed FrankenSim closure status");
    assert!(
        status.status.success(),
        "cannot inspect the reviewed FrankenSim closure"
    );
    assert!(
        status.stdout.is_empty(),
        "reviewed FrankenSim crate closure is dirty; refusing to stamp committed source"
    );
    let reviewed_range = format!("{FRANKENSIM_REVIEWED_COMMIT}..HEAD");
    let closure_diff = Command::new("git")
        .arg("-C")
        .arg(&frankensim_root)
        .args(["diff", "--quiet", &reviewed_range, "--"])
        .args(FRANKENSIM_CRATE_CLOSURE)
        .status()
        .expect("compare the reviewed FrankenSim closure with HEAD");
    assert!(
        closure_diff.success(),
        "FrankenSim dependency-closure source moved; review it before regenerating the pack"
    );
    FRANKENSIM_REVIEWED_COMMIT.to_owned()
}

fn solve_pack() -> SoundboardPack {
    let frankensim_commit = reviewed_frankensim_source();
    let mesh = PlateMesh::rectangle(LENGTH_M, WIDTH_M, NX, NY);
    let boundary = PlateMesh::rectangle_boundary(NX, NY);
    let material = OrthotropicElastic::new(
        [
            LONGITUDINAL_MODULUS_PA,
            RADIAL_MODULUS_PA,
            RADIAL_MODULUS_PA,
        ],
        [POISSON_LR, 0.02, 0.02],
        [SHEAR_MODULUS_PA, SHEAR_MODULUS_PA, SHEAR_MODULUS_PA],
        0.001,
    )
    .expect("reviewed orthotropic soundboard law");
    let section = PlateSection::orthotropic(&material, THICKNESS_M, DENSITY_KG_M3)
        .expect("reviewed soundboard section");
    let rib_area = RIB_WIDTH_M * RIB_HEIGHT_M;
    let rib_inertia = RIB_WIDTH_M * RIB_HEIGHT_M.powi(3) / 12.0;
    let rib_torsion = rectangle_torsion_constant(RIB_WIDTH_M, RIB_HEIGHT_M);
    let rib_eccentricity = 0.5 * (THICKNESS_M + RIB_HEIGHT_M);
    assert_eq!(
        NX % (RIB_COUNT + 1),
        0,
        "every rib must land on a mesh column"
    );
    let rib_column_stride = NX / (RIB_COUNT + 1);
    let mut stiffeners = Vec::with_capacity(RIB_COUNT + 2);
    for i in 1..=RIB_COUNT {
        let column = i * rib_column_stride;
        let nodes = (0..=NY).map(|j| j * (NX + 1) + column).collect();
        stiffeners.push(Stiffener {
            nodes,
            e: RIB_MODULUS_PA,
            g: RIB_MODULUS_PA / (2.0 * (1.0 + 0.35)),
            area: rib_area,
            inertia: rib_inertia,
            torsion: rib_torsion,
            eccentricity: rib_eccentricity,
            density: DENSITY_KG_M3,
        });
    }
    stiffeners.extend(reviewed_bridge_stiffeners(&mesh));
    let model = assemble(
        &mesh,
        &section,
        &boundary,
        &stiffeners,
        &AssemblyOptions {
            pretension: 0.0,
            support: EdgeSupport::SimplySupported,
        },
    )
    .expect("assemble explicit-rib-and-bridge piano soundboard");

    let mut certified_slice_count = 0usize;
    let mut factorization_count = 0usize;
    let mut lanczos_iterations = 0usize;
    let mut deflation_restarts = 0usize;
    let mut maximum_factor_peak_bytes = 0usize;
    let mut certified_modes = Vec::new();
    let mut refiner = ModeRefiner::new(&model.k, &model.m);
    let mut lower_hz = MINIMUM_MODE_FREQUENCY_HZ;
    while lower_hz < MAXIMUM_MODE_FREQUENCY_HZ {
        let upper_hz = (lower_hz + MODE_SLICE_WIDTH_HZ).min(MAXIMUM_MODE_FREQUENCY_HZ);
        let lower_lambda = (2.0 * PI * lower_hz).powi(2);
        let upper_lambda = (2.0 * PI * upper_hz).powi(2);
        let mut report = slice_window(
            &model.k,
            &model.m,
            (lower_lambda, upper_lambda),
            &SliceOptions {
                // A 1e-12 shift-invert Ritz estimate still admitted one low
                // plate mode whose explicit M^-1 residual exceeded this
                // pack's independent 1e-8 law. Tighten the solve itself; do
                // not relax the release bound.
                ritz_tol: 1.0e-14,
                ..SliceOptions::default()
            },
        )
        .unwrap_or_else(|error| {
            panic!("certified modal slice ({lower_hz}, {upper_hz}] Hz: {error}")
        });
        assert_eq!(report.expected, report.modes.len());
        refiner.refine(&model.k, &model.m, &mut report.modes);
        let (slice_maximum_relative_residual, worst_frequency_hz) = report
            .modes
            .iter()
            .map(|mode| {
                (
                    mode.residual / mode.lambda.abs().max(1.0),
                    mode.lambda.sqrt() / (2.0 * PI),
                )
            })
            .max_by(|left, right| left.0.total_cmp(&right.0))
            .unwrap_or((0.0, 0.0));
        assert!(
            slice_maximum_relative_residual <= MAXIMUM_RELATIVE_EIGEN_RESIDUAL,
            "certified modal slice ({lower_hz}, {upper_hz}] exceeds the relative residual law: {slice_maximum_relative_residual:.17e}"
        );
        eprintln!(
            "certified_slice=({lower_hz:.3},{upper_hz:.3}] modes={} max_relative_residual={slice_maximum_relative_residual:.6e} worst_frequency_hz={worst_frequency_hz:.9} factorizations={} lanczos={} restarts={} factor_peak_bytes={}",
            report.expected,
            report.stats.factorizations,
            report.stats.lanczos_iters,
            report.stats.restarts,
            report.stats.factor_peak_bytes,
        );
        certified_slice_count += 1;
        factorization_count += report.stats.factorizations;
        lanczos_iterations += report.stats.lanczos_iters;
        deflation_restarts += report.stats.restarts;
        maximum_factor_peak_bytes = maximum_factor_peak_bytes.max(report.stats.factor_peak_bytes);
        certified_modes.extend(report.modes);
        lower_hz = upper_hz;
    }
    let refinement_work = refiner.work;
    factorization_count += refinement_work.factorization_count;
    maximum_factor_peak_bytes =
        maximum_factor_peak_bytes.max(refinement_work.maximum_factor_peak_bytes);
    certified_modes.sort_by(|left, right| left.lambda.total_cmp(&right.lambda));
    assert!(
        !certified_modes.is_empty(),
        "certified soundboard window must contain modes"
    );
    let mut maximum_residual = 0.0_f64;
    let mut solved = Vec::with_capacity(certified_modes.len());
    for certified in certified_modes {
        let lambda = certified.lambda;
        let mut vector = certified.phi;
        let mut node_w = vec![0.0_f64; mesh.node_count()];
        for node in 0..mesh.node_count() {
            if let Some(reduced) = model.dof_map[3 * node] {
                node_w[node] = vector[reduced];
            }
        }
        let sign_node = node_w
            .iter()
            .enumerate()
            .max_by(|left, right| left.1.abs().total_cmp(&right.1.abs()))
            .expect("soundboard mesh is not empty")
            .0;
        if node_w[sign_node] < 0.0 {
            for value in &mut vector {
                *value = -*value;
            }
            for value in &mut node_w {
                *value = -*value;
            }
        }
        let residual = certified.residual / lambda.abs().max(1.0);
        maximum_residual = maximum_residual.max(residual);
        let frequency_hz = lambda.sqrt() / (2.0 * PI);
        let bridge_residue = (MIDI_MIN..=MIDI_MAX)
            .map(|midi| {
                let (x, y) = bridge_position_for_midi(midi);
                point_load_modal_residue(&mesh, &node_w, x, y)
            })
            .collect();
        let omega = 2.0 * PI * frequency_hz;
        let wave_number = omega / AIR_SOUND_SPEED_M_PER_S;
        let (left_re, left_im) = observer_integral(&mesh, &node_w, wave_number, -0.35);
        let (right_re, right_im) = observer_integral(&mesh, &node_w, wave_number, 0.35);
        let scale = AIR_DENSITY_KG_M3 * omega / (2.0 * PI * RADIATION_DISTANCE_M);
        solved.push(SolvedMode {
            frequency_hz,
            residual,
            node_w,
            bridge_residue,
            observer: [
                -scale * left_im,
                scale * left_re,
                -scale * right_im,
                scale * right_re,
            ],
        });
    }
    assert!(
        maximum_residual <= MAXIMUM_RELATIVE_EIGEN_RESIDUAL,
        "eigen residual is not release-bounded: {maximum_residual:.17e}"
    );
    let generator_sha256 = sha256_hex(include_bytes!("main.rs"));
    let tool_manifest_sha256 = sha256_hex(include_bytes!("../Cargo.toml"));
    let tool_lock_sha256 = sha256_hex(include_bytes!("../Cargo.lock"));
    let mut input = Vec::new();
    input.extend_from_slice(PACK_SCHEMA.as_bytes());
    input.extend_from_slice(SOLVER_ID.as_bytes());
    input.extend_from_slice(generator_sha256.as_bytes());
    input.extend_from_slice(tool_manifest_sha256.as_bytes());
    input.extend_from_slice(tool_lock_sha256.as_bytes());
    input.extend_from_slice(frankensim_commit.as_bytes());
    let input_sha256 = sha256_hex(&input);
    SoundboardPack {
        schema: PACK_SCHEMA,
        solver_id: SOLVER_ID,
        generator_sha256,
        tool_manifest_sha256,
        tool_lock_sha256,
        frankensim_commit,
        input_sha256,
        geometry: GeometryRecord {
            length_m: LENGTH_M,
            width_m: WIDTH_M,
            thickness_m: THICKNESS_M,
            density_kg_m3: DENSITY_KG_M3,
            longitudinal_modulus_pa: LONGITUDINAL_MODULUS_PA,
            radial_modulus_pa: RADIAL_MODULUS_PA,
            shear_modulus_pa: SHEAR_MODULUS_PA,
            poisson_lr: POISSON_LR,
            rib_count: RIB_COUNT,
            rib_width_m: RIB_WIDTH_M,
            rib_height_m: RIB_HEIGHT_M,
            rib_modulus_pa: RIB_MODULUS_PA,
            bridge_count: 2,
            bridge_width_m: BRIDGE_WIDTH_M,
            bridge_height_m: BRIDGE_HEIGHT_M,
            bridge_modulus_pa: BRIDGE_MODULUS_PA,
            bridge_shear_modulus_pa: BRIDGE_SHEAR_MODULUS_PA,
            bridge_density_kg_m3: BRIDGE_DENSITY_KG_M3,
            bass_bridge_max_midi: BASS_BRIDGE_MAX_MIDI,
            treble_bridge_min_midi: TREBLE_BRIDGE_MIN_MIDI,
            mesh_cells_x: NX,
            mesh_cells_y: NY,
            support: "simply-supported-rim",
        },
        work: WorkRecord {
            full_dofs: 3 * mesh.node_count(),
            free_dofs: model.free,
            triangle_count: mesh.tris.len(),
            mode_count: solved.len(),
            maximum_eigen_residual: maximum_residual,
            certified_slice_count,
            factorization_count,
            lanczos_iterations,
            deflation_restarts,
            refined_mode_count: refinement_work.refined_mode_count,
            refinement_factorization_count: refinement_work.factorization_count,
            refinement_solve_count: refinement_work.solve_count,
            maximum_refined_mass_orthogonality_defect: refinement_work
                .maximum_mass_orthogonality_defect,
            maximum_factor_peak_bytes,
        },
        bridge_anchor_source:
            "Miranda-Valiente-et-al-JASA-2024-Fig-2-two-physical-bridges-A1-D4-D5-visible-ends-plus-Borland-2009-Hardman-grand-23-key-split",
        bridge_structure_source:
            "Corradi-et-al-2017-G3-32x37mm-maple-constant-section-two-beam-reduction",
        radiation_law:
            "Batoz-1980-equation-75-triangle-area-over-3-nodal-load-infinite-baffle-Rayleigh-1m",
        modes: solved
            .into_iter()
            .enumerate()
            .map(|(index, mode)| ModeRecord {
                index,
                frequency_hz: mode.frequency_hz,
                eigen_residual: mode.residual,
                node_w_inverse_sqrt_kg: mode.node_w,
                bridge_residue_inverse_sqrt_kg: mode.bridge_residue,
                pressure_per_modal_velocity_pa_s_per_m_sqrt_kg: mode.observer,
            })
            .collect(),
    }
}

fn render_json(pack: &SoundboardPack) -> String {
    let mut rendered = serde_json::to_string_pretty(pack).expect("serialize soundboard pack");
    rendered.push('\n');
    rendered
}

fn write_f64_array(rendered: &mut String, values: &[f64]) {
    rendered.push('[');
    for (index, value) in values.iter().enumerate() {
        if index != 0 {
            rendered.push_str(", ");
        }
        write!(rendered, "{value:.17e}").expect("write generated float");
    }
    rendered.push(']');
}

fn render_rust(pack: &SoundboardPack) -> String {
    let mut rendered = String::new();
    rendered.push_str("// @generated by tools/piano-v2-soundboard-pack; do not hand-edit.\n");
    writeln!(
        rendered,
        "pub(crate) const PIANO_V2_SOUNDBOARD_PACK_SCHEMA: &str = {:?};",
        pack.schema
    )
    .unwrap();
    writeln!(
        rendered,
        "pub(crate) const PIANO_V2_SOUNDBOARD_PACK_INPUT_SHA256: &str = {:?};",
        pack.input_sha256
    )
    .unwrap();
    writeln!(
        rendered,
        "pub(crate) const PIANO_V2_SOUNDBOARD_PACK_GENERATOR_SHA256: &str = {:?};",
        pack.generator_sha256
    )
    .unwrap();
    writeln!(
        rendered,
        "pub(crate) const PIANO_V2_SOUNDBOARD_PACK_TOOL_MANIFEST_SHA256: &str = {:?};",
        pack.tool_manifest_sha256
    )
    .unwrap();
    writeln!(
        rendered,
        "pub(crate) const PIANO_V2_SOUNDBOARD_PACK_TOOL_LOCK_SHA256: &str = {:?};",
        pack.tool_lock_sha256
    )
    .unwrap();
    writeln!(
        rendered,
        "pub(crate) const PIANO_V2_SOUNDBOARD_PACK_FRANKENSIM_COMMIT: &str = {:?};",
        pack.frankensim_commit
    )
    .unwrap();
    writeln!(
        rendered,
        "pub(crate) const PIANO_V2_SOUNDBOARD_PACK_MAXIMUM_RESIDUAL: f64 = {:.17e};",
        pack.work.maximum_eigen_residual
    )
    .unwrap();
    rendered.push_str("#[derive(Clone, Copy, Debug)]\npub(crate) struct PianoV2SoundboardModePack {\n    pub(crate) frequency_hz: f64,\n    pub(crate) eigen_residual: f64,\n    pub(crate) bridge_residue_inverse_sqrt_kg: [f64; 88],\n    pub(crate) observer_pa_s_per_m_sqrt_kg: [f64; 4],\n}\n");
    writeln!(
        rendered,
        "pub(crate) const PIANO_V2_SOUNDBOARD_MODE_PACK: [PianoV2SoundboardModePack; {}] = [",
        pack.modes.len()
    )
    .unwrap();
    for mode in &pack.modes {
        rendered.push_str("    PianoV2SoundboardModePack { frequency_hz: ");
        write!(rendered, "{:.17e}", mode.frequency_hz).unwrap();
        rendered.push_str(", eigen_residual: ");
        write!(rendered, "{:.17e}", mode.eigen_residual).unwrap();
        rendered.push_str(", bridge_residue_inverse_sqrt_kg: ");
        write_f64_array(&mut rendered, &mode.bridge_residue_inverse_sqrt_kg);
        rendered.push_str(", observer_pa_s_per_m_sqrt_kg: ");
        write_f64_array(
            &mut rendered,
            &mode.pressure_per_modal_velocity_pa_s_per_m_sqrt_kg,
        );
        rendered.push_str(" },\n");
    }
    rendered.push_str("];\n");
    rendered
}

fn check_or_write(path: &str, expected: &str, check: bool) {
    if check {
        let actual = fs::read_to_string(path)
            .unwrap_or_else(|error| panic!("cannot read {path} for --check: {error}"));
        assert_eq!(actual, expected, "generated output drift at {path}");
    } else {
        let parent = Path::new(path)
            .parent()
            .expect("generated output has parent");
        fs::create_dir_all(parent).expect("create generated output directory");
        let file_name = Path::new(path)
            .file_name()
            .and_then(|name| name.to_str())
            .expect("generated output has UTF-8 file name");
        let temporary = parent.join(format!(".{file_name}.{}.tmp", std::process::id()));
        fs::write(&temporary, expected).expect("write complete temporary generated output");
        fs::rename(&temporary, path).unwrap_or_else(|error| {
            let _ = fs::remove_file(&temporary);
            panic!("atomically replace generated output {path}: {error}")
        });
    }
}

fn main() {
    let check = match env::args().nth(1).as_deref() {
        None => false,
        Some("--check") => true,
        Some(argument) => panic!("unknown argument {argument:?}; expected --check"),
    };
    let pack = solve_pack();
    let json = render_json(&pack);
    let rust = render_rust(&pack);
    check_or_write(JSON_OUTPUT, &json, check);
    check_or_write(RUST_OUTPUT, &rust, check);
    println!(
        "schema={} input={} free_dofs={} modes={} f_first={:.9} f_32={:.9} f_96={:.9} f_last={:.9} max_residual={:.3e} slices={} factorizations={} lanczos={} restarts={} refined_modes={} refinement_factorizations={} refinement_solves={} refined_mass_orthogonality={:.3e} factor_peak_bytes={} check={}",
        pack.schema,
        pack.input_sha256,
        pack.work.free_dofs,
        pack.modes.len(),
        pack.modes[0].frequency_hz,
        pack.modes[31].frequency_hz,
        pack.modes[95].frequency_hz,
        pack.modes[pack.modes.len() - 1].frequency_hz,
        pack.work.maximum_eigen_residual,
        pack.work.certified_slice_count,
        pack.work.factorization_count,
        pack.work.lanczos_iterations,
        pack.work.deflation_restarts,
        pack.work.refined_mode_count,
        pack.work.refinement_factorization_count,
        pack.work.refinement_solve_count,
        pack.work.maximum_refined_mass_orthogonality_defect,
        pack.work.maximum_factor_peak_bytes,
        check,
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::{BTreeMap, BTreeSet};

    fn matrix(rows: usize, entries: &[(usize, usize, f64)]) -> Csr {
        let mut coo = Coo::new(rows, rows);
        for &(row, column, value) in entries {
            coo.push(row, column, value);
        }
        coo.assemble()
    }

    #[test]
    fn reviewed_frankensim_closure_matches_the_actual_cargo_graph() {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
        let output = Command::new(env::var_os("CARGO").unwrap_or_else(|| "cargo".into()))
            .args([
                "metadata",
                "--format-version",
                "1",
                "--locked",
                "--manifest-path",
            ])
            .arg(&manifest)
            .output()
            .expect("read the generator dependency graph");
        assert!(output.status.success(), "cargo metadata failed");
        let metadata: serde_json::Value =
            serde_json::from_slice(&output.stdout).expect("parse cargo metadata");
        let root_id = metadata["resolve"]["root"]
            .as_str()
            .expect("metadata root package")
            .to_owned();
        let mut dependencies = BTreeMap::<String, Vec<String>>::new();
        for node in metadata["resolve"]["nodes"]
            .as_array()
            .expect("metadata resolve nodes")
        {
            dependencies.insert(
                node["id"].as_str().expect("node id").to_owned(),
                node["dependencies"]
                    .as_array()
                    .expect("node dependencies")
                    .iter()
                    .map(|id| id.as_str().expect("dependency id").to_owned())
                    .collect(),
            );
        }
        let mut reachable = BTreeSet::new();
        let mut stack = vec![root_id];
        while let Some(id) = stack.pop() {
            if !reachable.insert(id.clone()) {
                continue;
            }
            stack.extend(dependencies.get(&id).into_iter().flatten().cloned());
        }
        let frankensim_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../frankensim")
            .canonicalize()
            .expect("resolve FrankenSim for dependency-closure test");
        let mut actual = BTreeSet::new();
        for package in metadata["packages"].as_array().expect("metadata packages") {
            let id = package["id"].as_str().expect("package id");
            if !reachable.contains(id) {
                continue;
            }
            let manifest_path = PathBuf::from(
                package["manifest_path"]
                    .as_str()
                    .expect("package manifest path"),
            );
            let Some(package_dir) = manifest_path.parent() else {
                continue;
            };
            if let Ok(relative) = package_dir.strip_prefix(&frankensim_root) {
                actual.insert(relative.to_string_lossy().replace('\\', "/"));
            }
        }
        let expected = FRANKENSIM_CRATE_CLOSURE
            .into_iter()
            .map(str::to_owned)
            .collect::<BTreeSet<_>>();
        assert_eq!(actual, expected);
        assert_eq!(reviewed_frankensim_source(), FRANKENSIM_REVIEWED_COMMIT);
    }

    #[test]
    fn symbolic_pencil_union_keeps_mass_only_coordinates() {
        let stiffness = matrix(2, &[(0, 0, 4.0), (1, 1, 9.0)]);
        let mass = matrix(2, &[(0, 0, 1.0), (0, 1, 0.25), (1, 0, 0.25), (1, 1, 1.0)]);
        let union = pencil_symbolic_union(&stiffness, &mass);
        assert_eq!(union.row(0).0, &[0, 1]);
        assert_eq!(union.row(1).0, &[0, 1]);
        assert_ne!(union.row(0).0, stiffness.row(0).0);
        assert_ne!(union.row(1).0, stiffness.row(1).0);
    }

    #[test]
    fn inverse_refinement_reduces_residual_without_collapsing_modes() {
        let stiffness = matrix(2, &[(0, 0, 4.0), (1, 1, 9.0)]);
        let mass = matrix(2, &[(0, 0, 1.0), (1, 1, 1.0)]);
        let mut modes = vec![
            ModePair {
                lambda: 4.05,
                phi: vec![0.995, 0.1],
                residual: 1.0,
                interval: (3.0, 5.0),
            },
            ModePair {
                lambda: 9.0,
                phi: vec![0.0, 1.0],
                residual: 0.0,
                interval: (9.0, 9.0),
            },
        ];
        let mut refiner = ModeRefiner::new(&stiffness, &mass);
        refiner.refine(&stiffness, &mass, &mut modes);
        assert!((modes[0].lambda - 4.0).abs() < 1.0e-12);
        assert!(
            modes[0].residual / modes[0].lambda < MAXIMUM_RELATIVE_EIGEN_RESIDUAL,
            "relative residual was {:.17e}",
            modes[0].residual / modes[0].lambda
        );
        assert!(
            refiner.work.maximum_mass_orthogonality_defect
                < MAXIMUM_REFINED_MASS_ORTHOGONALITY_DEFECT
        );

        let collapsed = vec![
            ModePair {
                lambda: 4.0,
                phi: vec![1.0, 0.0],
                residual: 0.0,
                interval: (4.0, 4.0),
            },
            ModePair {
                lambda: 4.0,
                phi: vec![1.0, 0.0],
                residual: 0.0,
                interval: (4.0, 4.0),
            },
        ];
        assert_eq!(
            refined_mass_orthogonality_defect(&mass, &collapsed, &[0]),
            1.0
        );
    }

    #[test]
    fn dkt_point_load_uses_the_containing_triangle_not_a_bilinear_quad() {
        let mesh = PlateMesh::rectangle(LENGTH_M, WIDTH_M, 1, 1);
        // Only the upper-right w DOF is nonzero. The reviewed mesh splits the
        // cell along the lower-left -> upper-right diagonal, so the lower
        // triangle's barycentric residue at (0.75, 0.25) is exactly 0.25.
        // The removed rectangular bilinear interpolant would return 0.1875.
        let node_w = [0.0, 0.0, 0.0, 1.0];
        let actual = point_load_modal_residue(&mesh, &node_w, 0.75, 0.25);
        assert!((actual - 0.25).abs() < 1.0e-15);
        assert!((actual - 0.1875).abs() > 0.05);

        // A conservative nodal point-load port reproduces every affine field
        // exactly on either triangle and at their shared diagonal.
        let affine = mesh
            .nodes
            .iter()
            .map(|(x, y)| 2.0 + 3.0 * x - 5.0 * y)
            .collect::<Vec<_>>();
        for (x, y) in [(0.2, 0.7), (0.8, 0.1), (0.4, 0.4)] {
            let actual = point_load_modal_residue(&mesh, &affine, x, y);
            let expected = 2.0 + 3.0 * x * LENGTH_M - 5.0 * y * WIDTH_M;
            assert!((actual - expected).abs() < 1.0e-14);
        }
    }

    #[test]
    fn reviewed_bridge_model_keeps_two_paths_and_adds_only_passive_structure() {
        let mesh = PlateMesh::rectangle(LENGTH_M, WIDTH_M, NX, NY);
        let bridges = reviewed_bridge_stiffeners(&mesh);
        assert_eq!(bridges.len(), 2);
        assert!(bridges.iter().all(|bridge| bridge.nodes.len() >= 5));
        assert_ne!(bridges[0].nodes.last(), bridges[1].nodes.first());
        assert!(bridges.iter().all(|bridge| {
            bridge.e == BRIDGE_MODULUS_PA
                && bridge.g == BRIDGE_SHEAR_MODULUS_PA
                && bridge.area == BRIDGE_WIDTH_M * BRIDGE_HEIGHT_M
                && bridge.density == BRIDGE_DENSITY_KG_M3
        }));
        for bridge in &bridges {
            assert!(bridge.nodes.windows(2).all(|pair| pair[0] != pair[1]));
        }

        let material = OrthotropicElastic::new(
            [
                LONGITUDINAL_MODULUS_PA,
                RADIAL_MODULUS_PA,
                RADIAL_MODULUS_PA,
            ],
            [POISSON_LR, 0.02, 0.02],
            [SHEAR_MODULUS_PA, SHEAR_MODULUS_PA, SHEAR_MODULUS_PA],
            0.001,
        )
        .unwrap();
        let section = PlateSection::orthotropic(&material, THICKNESS_M, DENSITY_KG_M3).unwrap();
        let boundary = PlateMesh::rectangle_boundary(NX, NY);
        let options = AssemblyOptions {
            pretension: 0.0,
            support: EdgeSupport::SimplySupported,
        };
        let bare = assemble(&mesh, &section, &boundary, &[], &options).unwrap();
        let bridged = assemble(&mesh, &section, &boundary, &bridges, &options).unwrap();
        assert_eq!(bare.free, bridged.free);

        let trial = (0..bare.free)
            .map(|index| ((index + 1) as f64 * 0.017).sin())
            .collect::<Vec<_>>();
        let quadratic = |matrix: &Csr| {
            let mut product = vec![0.0; trial.len()];
            matrix.spmv(&trial, &mut product);
            trial.iter().zip(product).map(|(x, y)| x * y).sum::<f64>()
        };
        let stiffness_gain = quadratic(&bridged.k) - quadratic(&bare.k);
        let mass_gain = quadratic(&bridged.m) - quadratic(&bare.m);
        assert!(stiffness_gain.is_finite() && stiffness_gain > 0.0);
        assert!(mass_gain.is_finite() && mass_gain > 0.0);
    }

    #[test]
    fn dkt_nodal_radiation_replays_the_equation_75_uniform_load() {
        let mesh = PlateMesh::rectangle(LENGTH_M, WIDTH_M, 3, 2);
        let constant = vec![1.0; mesh.node_count()];
        let (real, imaginary) = observer_integral(&mesh, &constant, 0.0, -0.35);
        assert!((real - LENGTH_M * WIDTH_M).abs() < 1.0e-14);
        assert_eq!(imaginary, 0.0);

        // The triangle A/3 nodal-load rule is exact for an affine w field.
        let linear_x = mesh.nodes.iter().map(|(x, _)| *x).collect::<Vec<_>>();
        let (real, imaginary) = observer_integral(&mesh, &linear_x, 0.0, 0.35);
        assert!((real - 0.5 * LENGTH_M * LENGTH_M * WIDTH_M).abs() < 1.0e-14);
        assert_eq!(imaginary, 0.0);
    }
}
