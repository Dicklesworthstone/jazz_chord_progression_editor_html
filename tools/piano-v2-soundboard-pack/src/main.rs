use fs_material::elastic::OrthotropicElastic;
use fs_modal::{SliceOptions, slice_window};
use fs_plate::{AssemblyOptions, EdgeSupport, PlateMesh, PlateSection, Stiffener, assemble};
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
const AIR_DENSITY_KG_M3: f64 = 1.2041;
const AIR_SOUND_SPEED_M_PER_S: f64 = 343.21;
const RADIATION_DISTANCE_M: f64 = 1.0;
const MIDI_MIN: i32 = 21;
const MIDI_MAX: i32 = 108;
const JSON_OUTPUT: &str = "physical/parameter-packs/piano-v2-soundboard.json";
const RUST_OUTPUT: &str = "dsp/concert-grand/src/piano_v2_soundboard.rs";
const PACK_SCHEMA: &str = "changes.piano-v2-soundboard-pack.v1";
const SOLVER_ID: &str = "frankensim-fs-plate-dkt-plus-fs-modal-certified-slices-v2";
const FRANKENSIM_EXPECTED_HEAD: &str = "61824b0210356ddb7aec0e43ceef51ffa62e0775";

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

fn bridge_position_for_midi(midi: i32) -> (f64, f64) {
    const ANCHORS: [(i32, f64, f64); 5] = [
        (21, 0.888_433_676, 0.586_466_691),
        (33, 0.783_324_033, 0.422_623_497),
        (62, 0.268_679_391, 0.468_071_366),
        (74, 0.134_417_067, 0.367_852_230),
        (108, 0.017_733_010, 0.023_078_590),
    ];
    for pair in ANCHORS.windows(2) {
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
    let (_, x, y) = ANCHORS[ANCHORS.len() - 1];
    (x, y)
}

fn bilinear_node_w(node_w: &[f64], x_normalized: f64, y_normalized: f64) -> f64 {
    let x_grid = x_normalized.clamp(0.0, 1.0) * NX as f64;
    let y_grid = y_normalized.clamp(0.0, 1.0) * NY as f64;
    let x0 = (x_grid.floor() as usize).min(NX - 1);
    let y0 = (y_grid.floor() as usize).min(NY - 1);
    let tx = x_grid - x0 as f64;
    let ty = y_grid - y0 as f64;
    let node = |x: usize, y: usize| node_w[y * (NX + 1) + x];
    (1.0 - ty) * ((1.0 - tx) * node(x0, y0) + tx * node(x0 + 1, y0))
        + ty * ((1.0 - tx) * node(x0, y0 + 1) + tx * node(x0 + 1, y0 + 1))
}

fn observer_integral(node_w: &[f64], wave_number: f64, direction_x: f64) -> (f64, f64) {
    let dx = LENGTH_M / NX as f64;
    let dy = WIDTH_M / NY as f64;
    let mut real = 0.0;
    let mut imaginary = 0.0;
    for y_index in 0..=NY {
        let y = y_index as f64 * dy;
        let y_weight = if y_index == 0 || y_index == NY {
            0.5
        } else {
            1.0
        };
        for x_index in 0..=NX {
            let x = x_index as f64 * dx;
            let x_weight = if x_index == 0 || x_index == NX {
                0.5
            } else {
                1.0
            };
            let phase =
                -wave_number * (direction_x * (x - 0.5 * LENGTH_M) + 0.12 * (y - 0.5 * WIDTH_M));
            let weighted_shape =
                node_w[y_index * (NX + 1) + x_index] * dx * dy * x_weight * y_weight;
            real += weighted_shape * phase.cos();
            imaginary += weighted_shape * phase.sin();
        }
    }
    (real, imaginary)
}

fn frankensim_head() -> String {
    let frankensim_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../frankensim")
        .canonicalize()
        .expect("resolve the sibling FrankenSim checkout");
    let output = Command::new("git")
        .arg("-C")
        .arg(&frankensim_root)
        .args(["rev-parse", "HEAD"])
        .output()
        .expect("read FrankenSim HEAD");
    assert!(output.status.success(), "cannot read FrankenSim HEAD");
    let status = Command::new("git")
        .arg("-C")
        .arg(&frankensim_root)
        .args(["status", "--porcelain", "--untracked-files=no"])
        .output()
        .expect("read FrankenSim worktree status");
    assert!(
        status.status.success(),
        "cannot inspect FrankenSim worktree"
    );
    assert!(
        status.stdout.is_empty(),
        "FrankenSim has tracked worktree/index changes; refusing to stamp only its HEAD"
    );
    String::from_utf8(output.stdout)
        .expect("FrankenSim HEAD is UTF-8")
        .trim()
        .to_owned()
}

fn solve_pack() -> SoundboardPack {
    let frankensim_commit = frankensim_head();
    assert_eq!(
        frankensim_commit, FRANKENSIM_EXPECTED_HEAD,
        "FrankenSim source moved; review and update the pinned generator input"
    );
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
    let mut ribs = Vec::with_capacity(RIB_COUNT);
    for i in 1..=RIB_COUNT {
        let column = i * rib_column_stride;
        let nodes = (0..=NY).map(|j| j * (NX + 1) + column).collect();
        ribs.push(Stiffener {
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
    let model = assemble(
        &mesh,
        &section,
        &boundary,
        &ribs,
        &AssemblyOptions {
            pretension: 0.0,
            support: EdgeSupport::SimplySupported,
        },
    )
    .expect("assemble explicit-rib piano soundboard");

    let mut certified_slice_count = 0usize;
    let mut factorization_count = 0usize;
    let mut lanczos_iterations = 0usize;
    let mut deflation_restarts = 0usize;
    let mut maximum_factor_peak_bytes = 0usize;
    let mut certified_modes = Vec::new();
    let mut lower_hz = MINIMUM_MODE_FREQUENCY_HZ;
    while lower_hz < MAXIMUM_MODE_FREQUENCY_HZ {
        let upper_hz = (lower_hz + MODE_SLICE_WIDTH_HZ).min(MAXIMUM_MODE_FREQUENCY_HZ);
        let lower_lambda = (2.0 * PI * lower_hz).powi(2);
        let upper_lambda = (2.0 * PI * upper_hz).powi(2);
        let report = slice_window(
            &model.k,
            &model.m,
            (lower_lambda, upper_lambda),
            &SliceOptions {
                // The default 1e-10 Ritz gate was sufficient for convergence
                // but one returned plate mode exceeded this pack's independent
                // 1e-8 relative eigen-residual law. Tighten the solve itself;
                // do not relax the release bound.
                ritz_tol: 1.0e-12,
                ..SliceOptions::default()
            },
        )
        .unwrap_or_else(|error| {
            panic!("certified modal slice ({lower_hz}, {upper_hz}] Hz: {error}")
        });
        assert_eq!(report.expected, report.modes.len());
        let slice_maximum_relative_residual = report
            .modes
            .iter()
            .map(|mode| mode.residual / mode.lambda.abs().max(1.0))
            .fold(0.0_f64, f64::max);
        eprintln!(
            "certified_slice=({lower_hz:.3},{upper_hz:.3}] modes={} max_relative_residual={slice_maximum_relative_residual:.6e} factorizations={} lanczos={} restarts={} factor_peak_bytes={}",
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
                bilinear_node_w(&node_w, x, y)
            })
            .collect();
        let omega = 2.0 * PI * frequency_hz;
        let wave_number = omega / AIR_SOUND_SPEED_M_PER_S;
        let (left_re, left_im) = observer_integral(&node_w, wave_number, -0.35);
        let (right_re, right_im) = observer_integral(&node_w, wave_number, 0.35);
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
        maximum_residual <= 1.0e-8,
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
            maximum_factor_peak_bytes,
        },
        bridge_anchor_source: "Miranda-Valiente-et-al-JASA-2024-Fig-2-five-plan-view-points",
        radiation_law: "mass-normal-node-shape-trapezoid-quadrature-infinite-baffle-Rayleigh-1m",
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
        "schema={} input={} free_dofs={} modes={} f_first={:.9} f_32={:.9} f_96={:.9} f_last={:.9} max_residual={:.3e} slices={} factorizations={} lanczos={} restarts={} factor_peak_bytes={} check={}",
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
        pack.work.maximum_factor_peak_bytes,
        check,
    );
}
