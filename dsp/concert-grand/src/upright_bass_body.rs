//! Dark, deterministic upright-bass body authority.
//!
//! This module is a private physical authority consumed by `plucked_v2`: the
//! plucked-string ABI and embedded WebAssembly can therefore render the dark
//! upright-bass candidate, while the sampled recipe remains the shipping
//! comparator until the replacement gate passes. It turns the reviewed body
//! geometry into a bounded DKT (discrete Kirchhoff triangle) eigenproblem and
//! publishes mass-normalized modes with signed bridge and radiation residues.
//! The implementation is a fixed-allocation, `core` + `libm` port of the DKT
//! concepts independently exercised by FrankenSim's `fs-plate`; no runtime
//! dependency on FrankenSim is introduced.
//!
//! Authority boundary: the repository reviews one 1.08 m x 0.66 m x 6 mm
//! orthotropic plate, homogenized brace rigidities, a 450 L cavity, a 75 Hz
//! measured/reviewed A0 target, and a provisional plate Q.  It does not review
//! an outline, arch rise, separate back geometry, or f-hole area/effective
//! neck.  Consequently the mesh models a simply-supported soundboard and the
//! passive sealed-cavity compliance limit, while the caller may consume the
//! reviewed A0 as a *modal reduction*.  No fake port dimensions are inferred.

use libm::{atan2, cos, sin, sqrt};

const PI: f64 = core::f64::consts::PI;

/// Fixed DKT mesh.  Six by five nodes give 40 triangles and, after the
/// simply-supported transverse boundary is eliminated, 72 generalized DOFs.
/// The twelve interior transverse nodes are the smallest rectangular grid
/// that can support ten plate-dominated modes without selecting boundary-
/// rotation artifacts as body modes.
pub const GRID_CELLS_X: usize = 5;
pub const GRID_CELLS_Y: usize = 4;
pub const NODE_COUNT: usize = (GRID_CELLS_X + 1) * (GRID_CELLS_Y + 1);
pub const TRIANGLE_COUNT: usize = 2 * GRID_CELLS_X * GRID_CELLS_Y;
pub const FULL_DOF_COUNT: usize = 3 * NODE_COUNT;
pub const FREE_DOF_COUNT: usize = 72;
pub const BODY_MODE_COUNT: usize = 10;
pub const OPEN_BODY_MODE_COUNT: usize = BODY_MODE_COUNT + 1;
pub const MAX_JACOBI_SWEEPS: usize = 96;
pub const MAX_OPEN_BODY_JACOBI_SWEEPS: usize = 48;
pub const MAX_A0_INERTANCE_BISECTIONS: usize = 40;

/// Reviewed PHS4 upright-body A0 target.  This is an output modal authority,
/// not a claim that aggregate f-hole area or effective neck were measured.
pub const REVIEWED_UPRIGHT_BASS_A0_HZ: f64 = 75.0;
/// Provisional reviewed pack damping for the A0 modal reduction.
pub const REVIEWED_UPRIGHT_BASS_A0_Q: f64 = 20.0;

const MATRIX_CAPACITY: usize = FREE_DOF_COUNT * FREE_DOF_COUNT;
const ELEMENT_DOF_COUNT: usize = 9;
const ELEMENT_MATRIX_CAPACITY: usize = ELEMENT_DOF_COUNT * ELEMENT_DOF_COUNT;
const AIR_DENSITY_KG_PER_M3: f64 = 1.204;
const SPEED_OF_SOUND_M_PER_S: f64 = 343.0;
const LN_1000: f64 = 6.907_755_278_982_137;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct UprightBassBodyInput {
    pub length_m: f64,
    pub width_m: f64,
    pub thickness_m: f64,
    pub density_kg_per_m3: f64,
    pub young_longitudinal_pa: f64,
    pub young_radial_pa: f64,
    pub shear_lr_pa: f64,
    pub poisson_lr: f64,
    /// Homogenized addition to D11, in N m.
    pub brace_rigidity_x_n_m: f64,
    /// Homogenized addition to D22, in N m.
    pub brace_rigidity_y_n_m: f64,
    pub bridge_x_over_length: f64,
    pub bridge_y_over_width: f64,
    pub cavity_volume_m3: f64,
    /// Reviewed pack literal.  It remains explicitly provisional until the
    /// primary-literature loss-factor authority required by the plan lands.
    pub provisional_plate_q: f64,
}

/// The exact reviewed literals already present in the plucked-string pack.
#[must_use]
pub const fn reviewed_upright_bass_body_input() -> UprightBassBodyInput {
    UprightBassBodyInput {
        length_m: 1.08,
        width_m: 0.66,
        thickness_m: 0.006,
        density_kg_per_m3: 470.0,
        young_longitudinal_pa: 10.0e9,
        young_radial_pa: 0.75e9,
        shear_lr_pa: 0.65e9,
        poisson_lr: 0.36,
        brace_rigidity_x_n_m: 22.0,
        brace_rigidity_y_n_m: 11.0,
        bridge_x_over_length: 0.58,
        bridge_y_over_width: 0.50,
        cavity_volume_m3: 0.45,
        provisional_plate_q: 42.0,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BodyTopologyAuthority {
    SimplySupportedDktSoundboardWithSealedCavityCompliance,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PortModeAuthority {
    /// Volume alone determines acoustic compliance, not port inertance.
    UnavailableMissingOpeningAreaAndEffectiveNeck,
    /// The checked-in PHS4 pack reviews the coupled instrument's A0 frequency,
    /// but not the f-hole geometry that would independently derive it.  The
    /// runtime may therefore consume the frequency as a bounded passive modal
    /// reduction, but must not synthesize opening area or neck length.
    ReviewedA0ModalReductionWithoutPortGeometry,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CarvedShellAuthority {
    /// A carved top/back needs an outline, arch fields, thickness maps, and a
    /// separate back/side model.  None is silently synthesized here.
    UnavailableMissingOutlineArchAndBackGeometry,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DampingAuthority {
    ReviewedPackConstantPendingPrimaryLiteratureLossFactors,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct UprightBassBodyMode {
    pub frequency_hz: f64,
    pub q: f64,
    pub t60_seconds: f64,
    /// `phi^T f_bridge` for a unit transverse bridge force.  The eigenvector
    /// orientation is deterministic; the sign is retained for coherent ports.
    pub bridge_residue_per_sqrt_kg: f64,
    /// Integral of transverse modal displacement over the soundboard area.
    pub radiation_residue_m2_per_sqrt_kg: f64,
    /// Mass-normalized transverse displacement at every DKT mesh node.
    pub nodal_transverse_shape_m_per_sqrt_kg: [f64; NODE_COUNT],
}

impl UprightBassBodyMode {
    const ZERO: Self = Self {
        frequency_hz: 0.0,
        q: 0.0,
        t60_seconds: 0.0,
        bridge_residue_per_sqrt_kg: 0.0,
        radiation_residue_m2_per_sqrt_kg: 0.0,
        nodal_transverse_shape_m_per_sqrt_kg: [0.0; NODE_COUNT],
    };
}

/// Mass-normalized mode of the reviewed soundboard/cavity/A0 reduction.
/// `air_port_kinetic_fraction` is an independently testable participation
/// measure; it identifies A0 without relabeling an arbitrary frequency bin.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct UprightBassOpenBodyMode {
    pub frequency_hz: f64,
    pub q: f64,
    pub t60_seconds: f64,
    pub bridge_residue_per_sqrt_kg: f64,
    pub radiation_residue_m2_per_sqrt_kg: f64,
    /// Rayleigh-I pressure per generalized modal velocity at a fixed observer
    /// one metre normal to the soundboard centre, under exp(-i omega t).
    pub observer_pressure_per_modal_velocity_re: f64,
    pub observer_pressure_per_modal_velocity_im: f64,
    pub air_port_kinetic_fraction: f64,
}

impl UprightBassOpenBodyMode {
    const ZERO: Self = Self {
        frequency_hz: 0.0,
        q: 0.0,
        t60_seconds: 0.0,
        bridge_residue_per_sqrt_kg: 0.0,
        radiation_residue_m2_per_sqrt_kg: 0.0,
        observer_pressure_per_modal_velocity_re: 0.0,
        observer_pressure_per_modal_velocity_im: 0.0,
        air_port_kinetic_fraction: 0.0,
    };
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ReviewedA0ModalAuthority {
    /// Coupled-system target reviewed by PHS4.
    pub coupled_frequency_hz: f64,
    pub q: f64,
    /// Port inertance inferred from the reviewed coupled modal target and the
    /// independently solved plate/cavity residues.  No fake area/neck pair is
    /// claimed because infinitely many geometries share this inertance.
    pub effective_inertance_kg_per_m4: f64,
    pub uncoupled_port_frequency_hz: f64,
    pub inertance_bisections: usize,
    /// Exact bounded-work receipt for the two bracket probes, every
    /// bisection probe, and the final modal solve.
    pub eigen_solves: usize,
    pub aggregate_jacobi_sweeps: usize,
    pub aggregate_jacobi_pair_visits: usize,
    pub aggregate_jacobi_rotations: usize,
    pub maximum_jacobi_pair_visits: usize,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SealedCavityAuthority {
    pub volume_m3: f64,
    pub bulk_modulus_pa: f64,
    /// Rank-one stiffness scale `K_air / V` multiplying the square of modal
    /// volume displacement.  It is passive by construction.
    pub volume_stiffness_pa_per_m3: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct UprightBassBodyWorkReceipt {
    pub nodes: usize,
    pub triangles: usize,
    pub free_dofs: usize,
    pub element_gauss_evaluations: usize,
    pub assembled_scalar_contributions: usize,
    pub jacobi_sweeps: usize,
    pub jacobi_pair_visits: usize,
    pub jacobi_rotations: usize,
    pub projected_mode_count: usize,
    pub work_units: usize,
    pub work_unit_limit: usize,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct UprightBassBodyAuthority {
    pub input: UprightBassBodyInput,
    pub topology: BodyTopologyAuthority,
    pub port_mode_authority: PortModeAuthority,
    pub carved_shell_authority: CarvedShellAuthority,
    pub damping_authority: DampingAuthority,
    pub cavity: SealedCavityAuthority,
    pub modes: [UprightBassBodyMode; BODY_MODE_COUNT],
    pub reviewed_a0: Option<ReviewedA0ModalAuthority>,
    pub open_body_modes: [UprightBassOpenBodyMode; OPEN_BODY_MODE_COUNT],
    pub open_body_mode_count: usize,
    pub open_body_jacobi_sweeps: usize,
    pub receipt: UprightBassBodyWorkReceipt,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UprightBassBodyError {
    InvalidInput { field: &'static str },
    NotUprightGeometry { field: &'static str },
    DegenerateElement { element: usize },
    BridgeOutsideMesh,
    MatrixNotPositiveDefinite,
    EigenSolveDidNotConverge { sweeps: usize },
    OpenBodyEigenSolveDidNotConverge { sweeps: usize },
    A0TargetDidNotConverge,
    NonPositiveOpenBodyMode,
    RadiationUnderresolved,
    InsufficientPositiveModes,
    NonFiniteMode,
    WorkLimitExceeded,
}

#[derive(Clone, Copy)]
struct Node {
    x: f64,
    y: f64,
}

impl Node {
    const ZERO: Self = Self { x: 0.0, y: 0.0 };
}

#[derive(Clone, Copy)]
struct Triangle([usize; 3]);

impl Triangle {
    const ZERO: Self = Self([0; 3]);
}

#[derive(Clone, Copy)]
struct BendingRigidity {
    values: [f64; 9],
}

#[derive(Clone, Copy)]
struct EdgeCoefficients {
    a: [f64; 3],
    b: [f64; 3],
    c: [f64; 3],
    d: [f64; 3],
    e: [f64; 3],
}

type Assembly = (
    [f64; MATRIX_CAPACITY],
    [f64; FREE_DOF_COUNT],
    [f64; FREE_DOF_COUNT],
    [f64; FREE_DOF_COUNT],
    usize,
);

type EigenDecomposition = (
    [f64; FREE_DOF_COUNT],
    [f64; MATRIX_CAPACITY],
    usize,
    usize,
    usize,
);

fn finite_positive(value: f64) -> bool {
    value.is_finite() && value > 0.0
}

fn validate(
    input: UprightBassBodyInput,
    bounds: PlateIdentityBounds,
) -> Result<(), UprightBassBodyError> {
    for (field, value) in [
        ("length_m", input.length_m),
        ("width_m", input.width_m),
        ("thickness_m", input.thickness_m),
        ("density_kg_per_m3", input.density_kg_per_m3),
        ("young_longitudinal_pa", input.young_longitudinal_pa),
        ("young_radial_pa", input.young_radial_pa),
        ("shear_lr_pa", input.shear_lr_pa),
        ("cavity_volume_m3", input.cavity_volume_m3),
        ("provisional_plate_q", input.provisional_plate_q),
    ] {
        if !finite_positive(value) {
            return Err(UprightBassBodyError::InvalidInput { field });
        }
    }
    if !input.poisson_lr.is_finite() || !(0.0..0.5).contains(&input.poisson_lr) {
        return Err(UprightBassBodyError::InvalidInput {
            field: "poisson_lr",
        });
    }
    if !input.brace_rigidity_x_n_m.is_finite()
        || input.brace_rigidity_x_n_m < 0.0
        || !input.brace_rigidity_y_n_m.is_finite()
        || input.brace_rigidity_y_n_m < 0.0
    {
        return Err(UprightBassBodyError::InvalidInput {
            field: "brace_rigidity",
        });
    }
    if !input.bridge_x_over_length.is_finite()
        || !(0.0..=1.0).contains(&input.bridge_x_over_length)
        || !input.bridge_y_over_width.is_finite()
        || !(0.0..=1.0).contains(&input.bridge_y_over_width)
    {
        return Err(UprightBassBodyError::InvalidInput { field: "bridge" });
    }
    if input.thickness_m * 10.0 >= input.width_m.min(input.length_m) {
        return Err(UprightBassBodyError::InvalidInput {
            field: "thin_plate_ratio",
        });
    }
    let nu_rl = input.poisson_lr * input.young_radial_pa / input.young_longitudinal_pa;
    if 1.0 - input.poisson_lr * nu_rl <= 0.0 {
        return Err(UprightBassBodyError::InvalidInput {
            field: "orthotropic_reciprocity",
        });
    }

    // Instrument identity bounds intentionally reject geometry copied under
    // the wrong instrument label; each consumer supplies its own reviewed
    // envelope (`PlateIdentityBounds`).
    for (field, value, low, high) in [
        (
            "length_m",
            input.length_m,
            bounds.length_m.0,
            bounds.length_m.1,
        ),
        ("width_m", input.width_m, bounds.width_m.0, bounds.width_m.1),
        (
            "thickness_m",
            input.thickness_m,
            bounds.thickness_m.0,
            bounds.thickness_m.1,
        ),
        (
            "cavity_volume_m3",
            input.cavity_volume_m3,
            bounds.cavity_volume_m3.0,
            bounds.cavity_volume_m3.1,
        ),
    ] {
        if !(low..=high).contains(&value) {
            return Err(UprightBassBodyError::NotUprightGeometry { field });
        }
    }
    Ok(())
}

/// Reviewed per-instrument geometry envelope: (low, high) inclusive bounds.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PlateIdentityBounds {
    pub length_m: (f64, f64),
    pub width_m: (f64, f64),
    pub thickness_m: (f64, f64),
    pub cavity_volume_m3: (f64, f64),
}

/// The plan's 1.04--1.06 m string scale and reviewed 1.08 x 0.66 m, 450 L
/// upright-bass body.
pub const UPRIGHT_BASS_IDENTITY: PlateIdentityBounds = PlateIdentityBounds {
    length_m: (1.0, 1.16),
    width_m: (0.58, 0.76),
    thickness_m: (0.004, 0.009),
    cavity_volume_m3: (0.35, 0.56),
};

/// Reviewed steel-dreadnought top envelope around the 0.51 x 0.40 m, 3.2 mm,
/// 105 L pack literals.
pub const DREADNOUGHT_IDENTITY: PlateIdentityBounds = PlateIdentityBounds {
    length_m: (0.46, 0.56),
    width_m: (0.35, 0.45),
    thickness_m: (0.002_4, 0.004_2),
    cavity_volume_m3: (0.080, 0.130),
};

/// Reviewed soprano/concert ukulele top envelope around the 0.28 x 0.20 m,
/// 2.2 mm, 3.2 L pack literals.
pub const UKULELE_IDENTITY: PlateIdentityBounds = PlateIdentityBounds {
    length_m: (0.22, 0.34),
    width_m: (0.15, 0.26),
    thickness_m: (0.001_6, 0.003_0),
    cavity_volume_m3: (0.002, 0.008),
};

fn bending_rigidity(input: UprightBassBodyInput) -> BendingRigidity {
    let nu_rl = input.poisson_lr * input.young_radial_pa / input.young_longitudinal_pa;
    let denominator = 12.0 * (1.0 - input.poisson_lr * nu_rl);
    let h3 = input.thickness_m * input.thickness_m * input.thickness_m;
    let d11 = input.young_longitudinal_pa * h3 / denominator + input.brace_rigidity_x_n_m;
    let d22 = input.young_radial_pa * h3 / denominator + input.brace_rigidity_y_n_m;
    let d12 = input.poisson_lr * input.young_radial_pa * h3 / denominator;
    let d66 = input.shear_lr_pa * h3 / 12.0;
    BendingRigidity {
        values: [d11, d12, 0.0, d12, d22, 0.0, 0.0, 0.0, d66],
    }
}

fn build_mesh(input: UprightBassBodyInput) -> ([Node; NODE_COUNT], [Triangle; TRIANGLE_COUNT]) {
    let mut nodes = [Node::ZERO; NODE_COUNT];
    for j in 0..=GRID_CELLS_Y {
        for i in 0..=GRID_CELLS_X {
            nodes[j * (GRID_CELLS_X + 1) + i] = Node {
                x: input.length_m * i as f64 / GRID_CELLS_X as f64,
                y: input.width_m * j as f64 / GRID_CELLS_Y as f64,
            };
        }
    }
    let mut triangles = [Triangle::ZERO; TRIANGLE_COUNT];
    let mut cursor = 0;
    for j in 0..GRID_CELLS_Y {
        for i in 0..GRID_CELLS_X {
            let n00 = j * (GRID_CELLS_X + 1) + i;
            let n10 = n00 + 1;
            let n01 = n00 + GRID_CELLS_X + 1;
            let n11 = n01 + 1;
            triangles[cursor] = Triangle([n00, n10, n11]);
            triangles[cursor + 1] = Triangle([n00, n11, n01]);
            cursor += 2;
        }
    }
    (nodes, triangles)
}

fn boundary_node(node: usize) -> bool {
    let i = node % (GRID_CELLS_X + 1);
    let j = node / (GRID_CELLS_X + 1);
    i == 0 || i == GRID_CELLS_X || j == 0 || j == GRID_CELLS_Y
}

fn free_dof_map() -> [i16; FULL_DOF_COUNT] {
    let mut map = [-1_i16; FULL_DOF_COUNT];
    let mut cursor = 0_i16;
    for node in 0..NODE_COUNT {
        for component in 0..3 {
            if component == 0 && boundary_node(node) {
                continue;
            }
            map[3 * node + component] = cursor;
            cursor += 1;
        }
    }
    debug_assert_eq!(cursor as usize, FREE_DOF_COUNT);
    map
}

fn edge_coefficients(x: &[f64; 3], y: &[f64; 3]) -> EdgeCoefficients {
    let pairs = [(1_usize, 2_usize), (2, 0), (0, 1)];
    let mut out = EdgeCoefficients {
        a: [0.0; 3],
        b: [0.0; 3],
        c: [0.0; 3],
        d: [0.0; 3],
        e: [0.0; 3],
    };
    for (edge, &(i, j)) in pairs.iter().enumerate() {
        let dx = x[i] - x[j];
        let dy = y[i] - y[j];
        let length_squared = dx * dx + dy * dy;
        out.a[edge] = -dx / length_squared;
        out.b[edge] = 0.75 * dx * dy / length_squared;
        out.c[edge] = (0.25 * dx * dx - 0.5 * dy * dy) / length_squared;
        out.d[edge] = -dy / length_squared;
        out.e[edge] = (0.25 * dy * dy - 0.5 * dx * dx) / length_squared;
    }
    out
}

fn quadratic_shape_derivatives(xi: f64, eta: f64) -> ([f64; 6], [f64; 6]) {
    (
        [
            4.0 * (xi + eta) - 3.0,
            4.0 * xi - 1.0,
            0.0,
            4.0 * eta,
            -4.0 * eta,
            4.0 * (1.0 - 2.0 * xi - eta),
        ],
        [
            4.0 * (xi + eta) - 3.0,
            0.0,
            4.0 * eta - 1.0,
            4.0 * xi,
            4.0 * (1.0 - xi - 2.0 * eta),
            -4.0 * xi,
        ],
    )
}

fn rotation_vectors(coeff: &EdgeCoefficients, derivatives: &[f64; 6]) -> ([f64; 9], [f64; 9]) {
    let mut x_rotation = [0.0; 9];
    let mut y_rotation = [0.0; 9];
    let corner_edges = [(1_usize, 2_usize), (2, 0), (0, 1)];
    for node in 0..3 {
        let (m, k) = corner_edges[node];
        let nm = derivatives[3 + m];
        let nk = derivatives[3 + k];
        let ni = derivatives[node];
        x_rotation[3 * node] = 1.5 * (coeff.a[k] * nk - coeff.a[m] * nm);
        x_rotation[3 * node + 1] = coeff.c[m] * nm + coeff.c[k] * nk - ni;
        x_rotation[3 * node + 2] = coeff.b[m] * nm + coeff.b[k] * nk;
        y_rotation[3 * node] = 1.5 * (coeff.d[k] * nk - coeff.d[m] * nm);
        y_rotation[3 * node + 1] = coeff.b[m] * nm + coeff.b[k] * nk;
        y_rotation[3 * node + 2] = coeff.e[m] * nm + coeff.e[k] * nk - ni;
    }
    (x_rotation, y_rotation)
}

/// One Batoz DKT triangle stiffness matrix.  Public solely so the independent
/// proof can exercise rigid-motion and constant-curvature known answers.
pub fn dkt_triangle_stiffness(
    x: [f64; 3],
    y: [f64; 3],
    d: [f64; 9],
    element: usize,
) -> Result<([f64; ELEMENT_MATRIX_CAPACITY], f64), UprightBassBodyError> {
    let x21 = x[1] - x[0];
    let x31 = x[2] - x[0];
    let y21 = y[1] - y[0];
    let y31 = y[2] - y[0];
    let twice_area = x21 * y31 - x31 * y21;
    let scale = (x21 * x21 + y21 * y21).max(x31 * x31 + y31 * y31);
    if !twice_area.is_finite() || twice_area <= 1.0e-14 * scale {
        return Err(UprightBassBodyError::DegenerateElement { element });
    }
    let coefficients = edge_coefficients(&x, &y);
    let area = 0.5 * twice_area;
    let mut stiffness = [0.0; ELEMENT_MATRIX_CAPACITY];
    for (xi, eta) in [(0.5, 0.0), (0.5, 0.5), (0.0, 0.5)] {
        let (dxi, deta) = quadratic_shape_derivatives(xi, eta);
        let (hx_xi, hy_xi) = rotation_vectors(&coefficients, &dxi);
        let (hx_eta, hy_eta) = rotation_vectors(&coefficients, &deta);
        let mut b = [[0.0; ELEMENT_DOF_COUNT]; 3];
        for column in 0..ELEMENT_DOF_COUNT {
            let bx_x = (y31 * hx_xi[column] - y21 * hx_eta[column]) / twice_area;
            let by_y = (-x31 * hy_xi[column] + x21 * hy_eta[column]) / twice_area;
            let bx_y = (-x31 * hx_xi[column] + x21 * hx_eta[column]) / twice_area;
            let by_x = (y31 * hy_xi[column] - y21 * hy_eta[column]) / twice_area;
            b[0][column] = bx_x;
            b[1][column] = by_y;
            b[2][column] = bx_y + by_x;
        }
        for row in 0..ELEMENT_DOF_COUNT {
            for column in 0..ELEMENT_DOF_COUNT {
                let mut value = 0.0;
                for p in 0..3 {
                    for q in 0..3 {
                        value += b[p][row] * d[3 * p + q] * b[q][column];
                    }
                }
                stiffness[ELEMENT_DOF_COUNT * row + column] += area * value / 3.0;
            }
        }
    }
    Ok((stiffness, area))
}

fn matrix_index(row: usize, column: usize) -> usize {
    row * FREE_DOF_COUNT + column
}

fn add_reduced(
    matrix: &mut [f64; MATRIX_CAPACITY],
    map: &[i16; FULL_DOF_COUNT],
    full_row: usize,
    full_column: usize,
    value: f64,
) {
    let row = map[full_row];
    let column = map[full_column];
    if row >= 0 && column >= 0 {
        matrix[matrix_index(row as usize, column as usize)] += value;
    }
}

fn barycentric_weights(point: Node, nodes: [Node; 3]) -> Option<[f64; 3]> {
    let denominator = (nodes[1].y - nodes[2].y) * (nodes[0].x - nodes[2].x)
        + (nodes[2].x - nodes[1].x) * (nodes[0].y - nodes[2].y);
    if denominator.abs() <= 1.0e-18 {
        return None;
    }
    let first = ((nodes[1].y - nodes[2].y) * (point.x - nodes[2].x)
        + (nodes[2].x - nodes[1].x) * (point.y - nodes[2].y))
        / denominator;
    let second = ((nodes[2].y - nodes[0].y) * (point.x - nodes[2].x)
        + (nodes[0].x - nodes[2].x) * (point.y - nodes[2].y))
        / denominator;
    let third = 1.0 - first - second;
    let tolerance = -1.0e-12;
    (first >= tolerance && second >= tolerance && third >= tolerance)
        .then_some([first, second, third])
}

fn assemble(input: UprightBassBodyInput) -> Result<Assembly, UprightBassBodyError> {
    let (nodes, triangles) = build_mesh(input);
    let map = free_dof_map();
    let rigidity = bending_rigidity(input);
    let mut stiffness = [0.0; MATRIX_CAPACITY];
    let mut mass = [0.0; FREE_DOF_COUNT];
    let mut radiation_load = [0.0; FREE_DOF_COUNT];
    let mut bridge_load = [0.0; FREE_DOF_COUNT];
    let mut bridge_found = false;
    let bridge = Node {
        x: input.bridge_x_over_length * input.length_m,
        y: input.bridge_y_over_width * input.width_m,
    };

    for (element, triangle) in triangles.iter().enumerate() {
        let indices = triangle.0;
        let triangle_nodes = [nodes[indices[0]], nodes[indices[1]], nodes[indices[2]]];
        let x = triangle_nodes.map(|node| node.x);
        let y = triangle_nodes.map(|node| node.y);
        let (element_stiffness, area) = dkt_triangle_stiffness(x, y, rigidity.values, element)?;
        for local_row in 0..ELEMENT_DOF_COUNT {
            for local_column in 0..ELEMENT_DOF_COUNT {
                let full_row = 3 * indices[local_row / 3] + local_row % 3;
                let full_column = 3 * indices[local_column / 3] + local_column % 3;
                add_reduced(
                    &mut stiffness,
                    &map,
                    full_row,
                    full_column,
                    element_stiffness[ELEMENT_DOF_COUNT * local_row + local_column],
                );
            }
        }
        let transverse_mass = input.density_kg_per_m3 * input.thickness_m * area / 3.0;
        let rotary_mass = input.density_kg_per_m3
            * (input.thickness_m * input.thickness_m * input.thickness_m)
            * area
            / 36.0;
        for &node in &indices {
            for (component, contribution) in
                [(0, transverse_mass), (1, rotary_mass), (2, rotary_mass)]
            {
                let reduced = map[3 * node + component];
                if reduced >= 0 {
                    mass[reduced as usize] += contribution;
                }
            }
            let transverse = map[3 * node];
            if transverse >= 0 {
                radiation_load[transverse as usize] += area / 3.0;
            }
        }
        if !bridge_found {
            if let Some(weights) = barycentric_weights(bridge, triangle_nodes) {
                for local_node in 0..3 {
                    let reduced = map[3 * indices[local_node]];
                    if reduced >= 0 {
                        bridge_load[reduced as usize] += weights[local_node];
                    }
                }
                bridge_found = true;
            }
        }
    }
    if !bridge_found {
        return Err(UprightBassBodyError::BridgeOutsideMesh);
    }
    if mass.iter().any(|value| !finite_positive(*value)) {
        return Err(UprightBassBodyError::MatrixNotPositiveDefinite);
    }

    // A uniform sealed-cavity pressure is a passive rank-one stiffness:
    // U_air = 1/2 * (rho*c^2/V) * (integral w dA)^2.
    let bulk_modulus = AIR_DENSITY_KG_PER_M3 * SPEED_OF_SOUND_M_PER_S * SPEED_OF_SOUND_M_PER_S;
    let cavity_scale = bulk_modulus / input.cavity_volume_m3;
    for row in 0..FREE_DOF_COUNT {
        for column in 0..FREE_DOF_COUNT {
            stiffness[matrix_index(row, column)] +=
                cavity_scale * radiation_load[row] * radiation_load[column];
        }
    }
    Ok((
        stiffness,
        mass,
        bridge_load,
        radiation_load,
        TRIANGLE_COUNT * 3 * 9 * 9,
    ))
}

fn generalized_symmetric_matrix(
    stiffness: &[f64; MATRIX_CAPACITY],
    mass: &[f64; FREE_DOF_COUNT],
) -> [f64; MATRIX_CAPACITY] {
    let mut matrix = [0.0; MATRIX_CAPACITY];
    for row in 0..FREE_DOF_COUNT {
        for column in 0..FREE_DOF_COUNT {
            matrix[matrix_index(row, column)] =
                stiffness[matrix_index(row, column)] / sqrt(mass[row] * mass[column]);
        }
    }
    matrix
}

fn jacobi_eigen(
    mut matrix: [f64; MATRIX_CAPACITY],
) -> Result<EigenDecomposition, UprightBassBodyError> {
    let mut vectors = [0.0; MATRIX_CAPACITY];
    for index in 0..FREE_DOF_COUNT {
        vectors[matrix_index(index, index)] = 1.0;
    }
    let mut rotations = 0;
    let mut pair_visits = 0;
    let mut completed_sweeps = 0;
    let mut converged = false;
    for sweep in 0..MAX_JACOBI_SWEEPS {
        let mut maximum_off_diagonal = 0.0_f64;
        let mut maximum_diagonal = 0.0_f64;
        for diagonal in 0..FREE_DOF_COUNT {
            maximum_diagonal = maximum_diagonal.max(matrix[matrix_index(diagonal, diagonal)].abs());
        }
        for p in 0..FREE_DOF_COUNT {
            for q in p + 1..FREE_DOF_COUNT {
                pair_visits += 1;
                let pq = matrix[matrix_index(p, q)];
                maximum_off_diagonal = maximum_off_diagonal.max(pq.abs());
                if pq.abs() <= 1.0e-13 * maximum_diagonal.max(1.0) {
                    continue;
                }
                let pp = matrix[matrix_index(p, p)];
                let qq = matrix[matrix_index(q, q)];
                let angle = 0.5 * atan2(2.0 * pq, qq - pp);
                let cosine = cos(angle);
                let sine = sin(angle);
                for k in 0..FREE_DOF_COUNT {
                    if k == p || k == q {
                        continue;
                    }
                    let kp = matrix[matrix_index(k, p)];
                    let kq = matrix[matrix_index(k, q)];
                    let rotated_p = cosine * kp - sine * kq;
                    let rotated_q = sine * kp + cosine * kq;
                    matrix[matrix_index(k, p)] = rotated_p;
                    matrix[matrix_index(p, k)] = rotated_p;
                    matrix[matrix_index(k, q)] = rotated_q;
                    matrix[matrix_index(q, k)] = rotated_q;
                }
                matrix[matrix_index(p, p)] =
                    cosine * cosine * pp - 2.0 * sine * cosine * pq + sine * sine * qq;
                matrix[matrix_index(q, q)] =
                    sine * sine * pp + 2.0 * sine * cosine * pq + cosine * cosine * qq;
                matrix[matrix_index(p, q)] = 0.0;
                matrix[matrix_index(q, p)] = 0.0;
                for row in 0..FREE_DOF_COUNT {
                    let old_p = vectors[matrix_index(row, p)];
                    let old_q = vectors[matrix_index(row, q)];
                    vectors[matrix_index(row, p)] = cosine * old_p - sine * old_q;
                    vectors[matrix_index(row, q)] = sine * old_p + cosine * old_q;
                }
                rotations += 1;
            }
        }
        completed_sweeps = sweep + 1;
        if maximum_off_diagonal <= 1.0e-11 * maximum_diagonal.max(1.0) {
            converged = true;
            break;
        }
    }
    if !converged {
        return Err(UprightBassBodyError::EigenSolveDidNotConverge {
            sweeps: completed_sweeps,
        });
    }
    let mut eigenvalues = [0.0; FREE_DOF_COUNT];
    for index in 0..FREE_DOF_COUNT {
        eigenvalues[index] = matrix[matrix_index(index, index)];
    }
    for left in 0..FREE_DOF_COUNT {
        let mut least = left;
        for candidate in left + 1..FREE_DOF_COUNT {
            if eigenvalues[candidate]
                .total_cmp(&eigenvalues[least])
                .is_lt()
            {
                least = candidate;
            }
        }
        if least != left {
            eigenvalues.swap(left, least);
            for row in 0..FREE_DOF_COUNT {
                vectors.swap(matrix_index(row, left), matrix_index(row, least));
            }
        }
    }
    Ok((
        eigenvalues,
        vectors,
        completed_sweeps,
        pair_visits,
        rotations,
    ))
}

const OPEN_BODY_MATRIX_CAPACITY: usize = OPEN_BODY_MODE_COUNT * OPEN_BODY_MODE_COUNT;

#[inline(always)]
const fn open_body_matrix_index(row: usize, column: usize) -> usize {
    row * OPEN_BODY_MODE_COUNT + column
}

fn open_body_jacobi_eigen(
    mut matrix: [f64; OPEN_BODY_MATRIX_CAPACITY],
) -> Result<
    (
        [f64; OPEN_BODY_MODE_COUNT],
        [f64; OPEN_BODY_MATRIX_CAPACITY],
        usize,
        usize,
    ),
    UprightBassBodyError,
> {
    let mut vectors = [0.0; OPEN_BODY_MATRIX_CAPACITY];
    for index in 0..OPEN_BODY_MODE_COUNT {
        vectors[open_body_matrix_index(index, index)] = 1.0;
    }
    let mut completed_sweeps = 0;
    let mut rotations = 0usize;
    let mut converged = false;
    for sweep in 0..MAX_OPEN_BODY_JACOBI_SWEEPS {
        let mut maximum_off_diagonal = 0.0_f64;
        let mut maximum_diagonal = 0.0_f64;
        for diagonal in 0..OPEN_BODY_MODE_COUNT {
            maximum_diagonal =
                maximum_diagonal.max(matrix[open_body_matrix_index(diagonal, diagonal)].abs());
        }
        for p in 0..OPEN_BODY_MODE_COUNT {
            for q in p + 1..OPEN_BODY_MODE_COUNT {
                let pq = matrix[open_body_matrix_index(p, q)];
                maximum_off_diagonal = maximum_off_diagonal.max(pq.abs());
                if pq.abs() <= 1.0e-14 * maximum_diagonal.max(1.0) {
                    continue;
                }
                let pp = matrix[open_body_matrix_index(p, p)];
                let qq = matrix[open_body_matrix_index(q, q)];
                let angle = 0.5 * atan2(2.0 * pq, qq - pp);
                let cosine = cos(angle);
                let sine = sin(angle);
                rotations += 1;
                for k in 0..OPEN_BODY_MODE_COUNT {
                    if k == p || k == q {
                        continue;
                    }
                    let kp = matrix[open_body_matrix_index(k, p)];
                    let kq = matrix[open_body_matrix_index(k, q)];
                    let rotated_p = cosine * kp - sine * kq;
                    let rotated_q = sine * kp + cosine * kq;
                    matrix[open_body_matrix_index(k, p)] = rotated_p;
                    matrix[open_body_matrix_index(p, k)] = rotated_p;
                    matrix[open_body_matrix_index(k, q)] = rotated_q;
                    matrix[open_body_matrix_index(q, k)] = rotated_q;
                }
                matrix[open_body_matrix_index(p, p)] =
                    cosine * cosine * pp - 2.0 * sine * cosine * pq + sine * sine * qq;
                matrix[open_body_matrix_index(q, q)] =
                    sine * sine * pp + 2.0 * sine * cosine * pq + cosine * cosine * qq;
                matrix[open_body_matrix_index(p, q)] = 0.0;
                matrix[open_body_matrix_index(q, p)] = 0.0;
                for row in 0..OPEN_BODY_MODE_COUNT {
                    let old_p = vectors[open_body_matrix_index(row, p)];
                    let old_q = vectors[open_body_matrix_index(row, q)];
                    vectors[open_body_matrix_index(row, p)] = cosine * old_p - sine * old_q;
                    vectors[open_body_matrix_index(row, q)] = sine * old_p + cosine * old_q;
                }
            }
        }
        completed_sweeps = sweep + 1;
        if maximum_off_diagonal <= 1.0e-12 * maximum_diagonal.max(1.0) {
            converged = true;
            break;
        }
    }
    if !converged {
        return Err(UprightBassBodyError::OpenBodyEigenSolveDidNotConverge {
            sweeps: completed_sweeps,
        });
    }
    let mut eigenvalues = [0.0; OPEN_BODY_MODE_COUNT];
    for index in 0..OPEN_BODY_MODE_COUNT {
        eigenvalues[index] = matrix[open_body_matrix_index(index, index)];
    }
    for left in 0..OPEN_BODY_MODE_COUNT {
        let mut least = left;
        for candidate in left + 1..OPEN_BODY_MODE_COUNT {
            if eigenvalues[candidate]
                .total_cmp(&eigenvalues[least])
                .is_lt()
            {
                least = candidate;
            }
        }
        if least != left {
            eigenvalues.swap(left, least);
            for row in 0..OPEN_BODY_MODE_COUNT {
                vectors.swap(
                    open_body_matrix_index(row, left),
                    open_body_matrix_index(row, least),
                );
            }
        }
    }
    for column in 0..OPEN_BODY_MODE_COUNT {
        let mut orientation_row = 0usize;
        for row in 1..OPEN_BODY_MODE_COUNT {
            if vectors[open_body_matrix_index(row, column)].abs()
                > vectors[open_body_matrix_index(orientation_row, column)].abs()
            {
                orientation_row = row;
            }
        }
        if vectors[open_body_matrix_index(orientation_row, column)] < 0.0 {
            for row in 0..OPEN_BODY_MODE_COUNT {
                vectors[open_body_matrix_index(row, column)] =
                    -vectors[open_body_matrix_index(row, column)];
            }
        }
    }
    Ok((eigenvalues, vectors, completed_sweeps, rotations))
}

fn open_body_matrix(
    authority: &UprightBassBodyAuthority,
    uncoupled_port_frequency_hz: f64,
) -> ([f64; OPEN_BODY_MATRIX_CAPACITY], f64) {
    let cavity_stiffness = authority.cavity.volume_stiffness_pa_per_m3;
    let port_omega = 2.0 * PI * uncoupled_port_frequency_hz;
    let port_inertance = cavity_stiffness / (port_omega * port_omega);
    let sqrt_port_inertance = sqrt(port_inertance);
    let mut matrix = [0.0; OPEN_BODY_MATRIX_CAPACITY];
    for (index, mode) in authority.modes.iter().enumerate() {
        let omega = 2.0 * PI * mode.frequency_hz;
        matrix[open_body_matrix_index(index, index)] = omega * omega;
        /* The sealed DKT modes already contain C r r^T.  Adding the port
         * coordinate with -C r U completes 0.5*C*(r*q-U)^2 without counting
         * cavity compliance twice. */
        let coupling =
            -cavity_stiffness * mode.radiation_residue_m2_per_sqrt_kg / sqrt_port_inertance;
        matrix[open_body_matrix_index(index, BODY_MODE_COUNT)] = coupling;
        matrix[open_body_matrix_index(BODY_MODE_COUNT, index)] = coupling;
    }
    matrix[open_body_matrix_index(BODY_MODE_COUNT, BODY_MODE_COUNT)] = port_omega * port_omega;
    (matrix, port_inertance)
}

fn port_dominant_frequency_hz(
    authority: &UprightBassBodyAuthority,
    uncoupled_port_frequency_hz: f64,
) -> Result<(f64, usize, usize), UprightBassBodyError> {
    let (matrix, _) = open_body_matrix(authority, uncoupled_port_frequency_hz);
    let (eigenvalues, vectors, sweeps, rotations) = open_body_jacobi_eigen(matrix)?;
    let mut port_mode = 0usize;
    for mode in 1..OPEN_BODY_MODE_COUNT {
        if vectors[open_body_matrix_index(BODY_MODE_COUNT, mode)].abs()
            > vectors[open_body_matrix_index(BODY_MODE_COUNT, port_mode)].abs()
        {
            port_mode = mode;
        }
    }
    let eigenvalue = eigenvalues[port_mode];
    if !(eigenvalue.is_finite() && eigenvalue > 0.0) {
        return Err(UprightBassBodyError::NonPositiveOpenBodyMode);
    }
    Ok((sqrt(eigenvalue) / (2.0 * PI), sweeps, rotations))
}

/// Baffled Rayleigh-I narrow-band transfer at an observer one metre normal to
/// the plate centre. This is the fixed-allocation counterpart of FrankenSim's
/// `baffled_observer_radiation`: each DKT triangle is one signed velocity
/// patch and the result is complex pressure per generalized modal velocity.
pub(crate) fn baffled_plate_observer_transfer(
    input: UprightBassBodyInput,
    nodal_shape: &[f64; NODE_COUNT],
    frequency_hz: f64,
) -> Result<(f64, f64), UprightBassBodyError> {
    let (nodes, triangles) = build_mesh(input);
    let cell_x = input.length_m / GRID_CELLS_X as f64;
    let cell_y = input.width_m / GRID_CELLS_Y as f64;
    let cell_diagonal = sqrt(cell_x * cell_x + cell_y * cell_y);
    if SPEED_OF_SOUND_M_PER_S / frequency_hz / cell_diagonal < 6.0 {
        return Err(UprightBassBodyError::RadiationUnderresolved);
    }
    let wave_number = 2.0 * PI * frequency_hz / SPEED_OF_SOUND_M_PER_S;
    let mut integral_re = 0.0;
    let mut integral_im = 0.0;
    for triangle in triangles {
        let [a_index, b_index, c_index] = triangle.0;
        let a = nodes[a_index];
        let b = nodes[b_index];
        let c = nodes[c_index];
        let twice_area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
        let area_m2 = 0.5 * twice_area.abs();
        let centroid_x = (a.x + b.x + c.x) / 3.0 - 0.5 * input.length_m;
        let centroid_y = (a.y + b.y + c.y) / 3.0 - 0.5 * input.width_m;
        let distance_m = sqrt(1.0 + centroid_x * centroid_x + centroid_y * centroid_y);
        let shape = (nodal_shape[a_index] + nodal_shape[b_index] + nodal_shape[c_index]) / 3.0;
        let weight = area_m2 * shape / distance_m;
        let phase = wave_number * distance_m;
        integral_re += cos(phase) * weight;
        integral_im += sin(phase) * weight;
    }
    // Rayleigh I: p = i*rho*omega/(2*pi) * integral(v exp(i k R)/R)dS.
    let coefficient = AIR_DENSITY_KG_PER_M3 * frequency_hz;
    Ok((-coefficient * integral_im, coefficient * integral_re))
}

fn attach_reviewed_a0(
    authority: &mut UprightBassBodyAuthority,
) -> Result<(), UprightBassBodyError> {
    const EIGEN_SOLVE_COUNT: usize = MAX_A0_INERTANCE_BISECTIONS + 3;
    let mut lower_hz = 30.0;
    let mut upper_hz = REVIEWED_UPRIGHT_BASS_A0_HZ;
    let mut aggregate_sweeps = 0usize;
    let mut aggregate_rotations = 0usize;
    let (lower_output_hz, lower_sweeps, lower_rotations) =
        port_dominant_frequency_hz(authority, lower_hz)?;
    aggregate_sweeps += lower_sweeps;
    aggregate_rotations += lower_rotations;
    let (upper_output_hz, upper_sweeps, upper_rotations) =
        port_dominant_frequency_hz(authority, upper_hz)?;
    aggregate_sweeps += upper_sweeps;
    aggregate_rotations += upper_rotations;
    if !(lower_output_hz < REVIEWED_UPRIGHT_BASS_A0_HZ
        && upper_output_hz > REVIEWED_UPRIGHT_BASS_A0_HZ)
    {
        return Err(UprightBassBodyError::A0TargetDidNotConverge);
    }
    for _ in 0..MAX_A0_INERTANCE_BISECTIONS {
        let middle_hz = 0.5 * (lower_hz + upper_hz);
        let (output_hz, sweeps, rotations) = port_dominant_frequency_hz(authority, middle_hz)?;
        aggregate_sweeps += sweeps;
        aggregate_rotations += rotations;
        if output_hz < REVIEWED_UPRIGHT_BASS_A0_HZ {
            lower_hz = middle_hz;
        } else {
            upper_hz = middle_hz;
        }
    }
    let uncoupled_port_frequency_hz = 0.5 * (lower_hz + upper_hz);
    let (matrix, port_inertance) = open_body_matrix(authority, uncoupled_port_frequency_hz);
    let (eigenvalues, vectors, sweeps, rotations) = open_body_jacobi_eigen(matrix)?;
    aggregate_sweeps += sweeps;
    aggregate_rotations += rotations;
    let pair_visits_per_sweep = OPEN_BODY_MODE_COUNT * (OPEN_BODY_MODE_COUNT - 1) / 2;
    let aggregate_pair_visits = aggregate_sweeps * pair_visits_per_sweep;
    let maximum_pair_visits =
        EIGEN_SOLVE_COUNT * MAX_OPEN_BODY_JACOBI_SWEEPS * pair_visits_per_sweep;
    if aggregate_pair_visits > maximum_pair_visits || aggregate_rotations > aggregate_pair_visits {
        return Err(UprightBassBodyError::WorkLimitExceeded);
    }
    let sqrt_port_inertance = sqrt(port_inertance);
    let mut open_modes = [UprightBassOpenBodyMode::ZERO; OPEN_BODY_MODE_COUNT];
    for mode_index in 0..OPEN_BODY_MODE_COUNT {
        let eigenvalue = eigenvalues[mode_index];
        if !(eigenvalue.is_finite() && eigenvalue > 0.0) {
            return Err(UprightBassBodyError::NonPositiveOpenBodyMode);
        }
        let mut bridge_residue = 0.0;
        let mut radiation_residue =
            vectors[open_body_matrix_index(BODY_MODE_COUNT, mode_index)] / sqrt_port_inertance;
        let frequency_hz = sqrt(eigenvalue) / (2.0 * PI);
        let port_volume_residue = radiation_residue;
        let port_phase = 2.0 * PI * frequency_hz / SPEED_OF_SOUND_M_PER_S;
        let port_pressure_coefficient = AIR_DENSITY_KG_PER_M3 * frequency_hz / 2.0;
        let mut observer_transfer_re =
            -port_pressure_coefficient * sin(port_phase) * port_volume_residue;
        let mut observer_transfer_im =
            port_pressure_coefficient * cos(port_phase) * port_volume_residue;
        let mut inverse_q = vectors[open_body_matrix_index(BODY_MODE_COUNT, mode_index)]
            * vectors[open_body_matrix_index(BODY_MODE_COUNT, mode_index)]
            / REVIEWED_UPRIGHT_BASS_A0_Q;
        for plate_mode in 0..BODY_MODE_COUNT {
            let participation = vectors[open_body_matrix_index(plate_mode, mode_index)];
            let plate_transfer = baffled_plate_observer_transfer(
                authority.input,
                &authority.modes[plate_mode].nodal_transverse_shape_m_per_sqrt_kg,
                frequency_hz,
            )?;
            observer_transfer_re += participation * plate_transfer.0;
            observer_transfer_im += participation * plate_transfer.1;
            bridge_residue +=
                participation * authority.modes[plate_mode].bridge_residue_per_sqrt_kg;
            radiation_residue +=
                participation * authority.modes[plate_mode].radiation_residue_m2_per_sqrt_kg;
            inverse_q += participation * participation / authority.modes[plate_mode].q;
        }
        let q = 1.0 / inverse_q;
        open_modes[mode_index] = UprightBassOpenBodyMode {
            frequency_hz,
            q,
            t60_seconds: LN_1000 * q / (PI * frequency_hz),
            bridge_residue_per_sqrt_kg: bridge_residue,
            radiation_residue_m2_per_sqrt_kg: radiation_residue,
            observer_pressure_per_modal_velocity_re: observer_transfer_re,
            observer_pressure_per_modal_velocity_im: observer_transfer_im,
            air_port_kinetic_fraction: {
                let participation = vectors[open_body_matrix_index(BODY_MODE_COUNT, mode_index)];
                participation * participation
            },
        };
    }
    let mut port_mode = 0usize;
    for mode in 1..OPEN_BODY_MODE_COUNT {
        if open_modes[mode].air_port_kinetic_fraction
            > open_modes[port_mode].air_port_kinetic_fraction
        {
            port_mode = mode;
        }
    }
    if (open_modes[port_mode].frequency_hz - REVIEWED_UPRIGHT_BASS_A0_HZ).abs() > 1.0e-8 {
        return Err(UprightBassBodyError::A0TargetDidNotConverge);
    }
    authority.topology =
        BodyTopologyAuthority::SimplySupportedDktSoundboardWithSealedCavityCompliance;
    authority.port_mode_authority = PortModeAuthority::ReviewedA0ModalReductionWithoutPortGeometry;
    authority.reviewed_a0 = Some(ReviewedA0ModalAuthority {
        coupled_frequency_hz: REVIEWED_UPRIGHT_BASS_A0_HZ,
        q: REVIEWED_UPRIGHT_BASS_A0_Q,
        effective_inertance_kg_per_m4: port_inertance,
        uncoupled_port_frequency_hz,
        inertance_bisections: MAX_A0_INERTANCE_BISECTIONS,
        eigen_solves: EIGEN_SOLVE_COUNT,
        aggregate_jacobi_sweeps: aggregate_sweeps,
        aggregate_jacobi_pair_visits: aggregate_pair_visits,
        aggregate_jacobi_rotations: aggregate_rotations,
        maximum_jacobi_pair_visits: maximum_pair_visits,
    });
    authority.open_body_modes = open_modes;
    authority.open_body_mode_count = OPEN_BODY_MODE_COUNT;
    authority.open_body_jacobi_sweeps = sweeps;
    Ok(())
}

/// Derive the dark upright-bass soundboard/cavity authority.  No rendered
/// waveform is read; the sole modal calibration is the independently reviewed
/// PHS4 A0 target, which determines port inertance by bounded bisection.
pub fn derive_upright_bass_body(
    input: UprightBassBodyInput,
) -> Result<UprightBassBodyAuthority, UprightBassBodyError> {
    let mut authority = derive_soundboard_body(input, UPRIGHT_BASS_IDENTITY)?;
    attach_reviewed_a0(&mut authority)?;
    Ok(authority)
}

/// Derive a simply-supported orthotropic soundboard authority for any
/// reviewed instrument envelope.  Identical numerics to the upright-bass
/// entry; only the identity gate is parameterized.
pub fn derive_soundboard_body(
    input: UprightBassBodyInput,
    bounds: PlateIdentityBounds,
) -> Result<UprightBassBodyAuthority, UprightBassBodyError> {
    validate(input, bounds)?;
    let (stiffness, mass, bridge_load, radiation_load, assembly_work) = assemble(input)?;
    let reduced_dof_map = free_dof_map();
    let matrix = generalized_symmetric_matrix(&stiffness, &mass);
    let (eigenvalues, mut eigenvectors, sweeps, pair_visits, rotations) = jacobi_eigen(matrix)?;
    let mut modes = [UprightBassBodyMode::ZERO; BODY_MODE_COUNT];
    let mut written = 0;
    for eigen_index in 0..FREE_DOF_COUNT {
        let eigenvalue = eigenvalues[eigen_index];
        if !(eigenvalue.is_finite() && eigenvalue > 1.0e-8) {
            continue;
        }
        // Deterministic modal orientation: the largest-magnitude physical
        // component is positive.  Both port residues flip together, preserving
        // their physically meaningful relative phase.
        let mut orientation_index = 0;
        let mut orientation_magnitude = 0.0;
        for row in 0..FREE_DOF_COUNT {
            let physical = eigenvectors[matrix_index(row, eigen_index)] / sqrt(mass[row]);
            if physical.abs() > orientation_magnitude {
                orientation_magnitude = physical.abs();
                orientation_index = row;
            }
        }
        if eigenvectors[matrix_index(orientation_index, eigen_index)] < 0.0 {
            for row in 0..FREE_DOF_COUNT {
                eigenvectors[matrix_index(row, eigen_index)] =
                    -eigenvectors[matrix_index(row, eigen_index)];
            }
        }
        let mut bridge_residue = 0.0;
        let mut radiation_residue = 0.0;
        for row in 0..FREE_DOF_COUNT {
            let physical = eigenvectors[matrix_index(row, eigen_index)] / sqrt(mass[row]);
            bridge_residue += bridge_load[row] * physical;
            radiation_residue += radiation_load[row] * physical;
        }
        let frequency_hz = sqrt(eigenvalue) / (2.0 * PI);
        let mut nodal_transverse_shape = [0.0; NODE_COUNT];
        for (node, value) in nodal_transverse_shape.iter_mut().enumerate() {
            let reduced = reduced_dof_map[3 * node];
            if reduced >= 0 {
                let row = reduced as usize;
                *value = eigenvectors[matrix_index(row, eigen_index)] / sqrt(mass[row]);
            }
        }
        let t60_seconds = LN_1000 * input.provisional_plate_q / (PI * frequency_hz);
        let mode = UprightBassBodyMode {
            frequency_hz,
            q: input.provisional_plate_q,
            t60_seconds,
            bridge_residue_per_sqrt_kg: bridge_residue,
            radiation_residue_m2_per_sqrt_kg: radiation_residue,
            nodal_transverse_shape_m_per_sqrt_kg: nodal_transverse_shape,
        };
        if !mode.frequency_hz.is_finite()
            || !mode.t60_seconds.is_finite()
            || !mode.bridge_residue_per_sqrt_kg.is_finite()
            || !mode.radiation_residue_m2_per_sqrt_kg.is_finite()
            || mode
                .nodal_transverse_shape_m_per_sqrt_kg
                .iter()
                .any(|value| !value.is_finite())
        {
            return Err(UprightBassBodyError::NonFiniteMode);
        }
        modes[written] = mode;
        written += 1;
        if written == BODY_MODE_COUNT {
            break;
        }
    }
    if written != BODY_MODE_COUNT {
        return Err(UprightBassBodyError::InsufficientPositiveModes);
    }
    let projection_work = BODY_MODE_COUNT * FREE_DOF_COUNT * 2;
    let rotation_work = rotations * (6 * FREE_DOF_COUNT + 8);
    let work_units = assembly_work + pair_visits + rotation_work + projection_work;
    let work_unit_limit = TRIANGLE_COUNT * 3 * 9 * 9
        + MAX_JACOBI_SWEEPS * FREE_DOF_COUNT * (FREE_DOF_COUNT - 1) / 2
        + MAX_JACOBI_SWEEPS * FREE_DOF_COUNT * (FREE_DOF_COUNT - 1) / 2 * (6 * FREE_DOF_COUNT + 8)
        + BODY_MODE_COUNT * FREE_DOF_COUNT * 2;
    if work_units > work_unit_limit {
        return Err(UprightBassBodyError::WorkLimitExceeded);
    }
    let bulk_modulus = AIR_DENSITY_KG_PER_M3 * SPEED_OF_SOUND_M_PER_S * SPEED_OF_SOUND_M_PER_S;
    Ok(UprightBassBodyAuthority {
        input,
        topology: BodyTopologyAuthority::SimplySupportedDktSoundboardWithSealedCavityCompliance,
        port_mode_authority: PortModeAuthority::UnavailableMissingOpeningAreaAndEffectiveNeck,
        carved_shell_authority: CarvedShellAuthority::UnavailableMissingOutlineArchAndBackGeometry,
        damping_authority:
            DampingAuthority::ReviewedPackConstantPendingPrimaryLiteratureLossFactors,
        cavity: SealedCavityAuthority {
            volume_m3: input.cavity_volume_m3,
            bulk_modulus_pa: bulk_modulus,
            volume_stiffness_pa_per_m3: bulk_modulus / input.cavity_volume_m3,
        },
        modes,
        reviewed_a0: None,
        open_body_modes: [UprightBassOpenBodyMode::ZERO; OPEN_BODY_MODE_COUNT],
        open_body_mode_count: 0,
        open_body_jacobi_sweeps: 0,
        receipt: UprightBassBodyWorkReceipt {
            nodes: NODE_COUNT,
            triangles: TRIANGLE_COUNT,
            free_dofs: FREE_DOF_COUNT,
            element_gauss_evaluations: TRIANGLE_COUNT * 3,
            assembled_scalar_contributions: assembly_work,
            jacobi_sweeps: sweeps,
            jacobi_pair_visits: pair_visits,
            jacobi_rotations: rotations,
            projected_mode_count: BODY_MODE_COUNT,
            work_units,
            work_unit_limit,
        },
    })
}

/// Convenience entry for the exact reviewed pack.
pub fn derive_reviewed_upright_bass_body() -> Result<UprightBassBodyAuthority, UprightBassBodyError>
{
    derive_upright_bass_body(reviewed_upright_bass_body_input())
}

/// Independent callers can use the exact rigidity matrix in element patch
/// tests without duplicating the pack formulas.
#[must_use]
pub fn reviewed_bending_rigidity() -> [f64; 9] {
    bending_rigidity(reviewed_upright_bass_body_input()).values
}
