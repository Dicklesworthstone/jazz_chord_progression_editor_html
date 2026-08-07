//! Independent proof for the dark upright-bass DKT body authority.
//!
//! This integration test imports the un-routed module by path.  It therefore
//! proves the exact new source without widening the production crate graph.

#[path = "../src/upright_bass_body.rs"]
mod upright_bass_body;

use upright_bass_body::{
    derive_reviewed_upright_bass_body, derive_upright_bass_body, dkt_triangle_stiffness,
    reviewed_bending_rigidity, reviewed_upright_bass_body_input, BodyTopologyAuthority,
    CarvedShellAuthority, DampingAuthority, PortModeAuthority, UprightBassBodyAuthority,
    UprightBassBodyError, UprightBassBodyInput, BODY_MODE_COUNT, FREE_DOF_COUNT, GRID_CELLS_X,
    GRID_CELLS_Y, MAX_JACOBI_SWEEPS, NODE_COUNT, TRIANGLE_COUNT,
};

const PI: f64 = core::f64::consts::PI;
const LN_1000: f64 = 6.907_755_278_982_137;

fn quadratic_form(matrix: &[f64; 81], vector: &[f64; 9]) -> f64 {
    let mut result = 0.0;
    for row in 0..9 {
        for column in 0..9 {
            result += vector[row] * matrix[9 * row + column] * vector[column];
        }
    }
    result
}

fn assert_sorted_finite(authority: &UprightBassBodyAuthority) {
    let mut previous = 0.0;
    for mode in authority.modes {
        assert!(mode.frequency_hz.is_finite() && mode.frequency_hz > previous);
        assert!(mode.q.is_finite() && mode.q > 0.0);
        assert!(mode.t60_seconds.is_finite() && mode.t60_seconds > 0.0);
        assert!(mode.bridge_residue_per_sqrt_kg.is_finite());
        assert!(mode.radiation_residue_m2_per_sqrt_kg.is_finite());
        previous = mode.frequency_hz;
    }
}

/// A deliberately independent shape test: it consumes only the published
/// rows.  Equal harmonic spacing is a tuned oscillator template, not a plate
/// spectrum; meaningful soundboard radiation also needs more than one coupled
/// mode and non-identical coherent bridge/radiation products.
fn has_geometry_bound_signature(authority: &UprightBassBodyAuthority) -> bool {
    let mut normalized_gaps = [0.0; BODY_MODE_COUNT - 1];
    for (gap, pair) in normalized_gaps.iter_mut().zip(authority.modes.windows(2)) {
        *gap = (pair[1].frequency_hz - pair[0].frequency_hz) / authority.modes[0].frequency_hz;
    }
    let minimum_gap = normalized_gaps
        .iter()
        .copied()
        .fold(f64::INFINITY, f64::min);
    let maximum_gap = normalized_gaps.iter().copied().fold(0.0_f64, f64::max);
    let radiating_modes = authority
        .modes
        .iter()
        .filter(|mode| mode.radiation_residue_m2_per_sqrt_kg.abs() > 1.0e-8)
        .count();
    let first_product = authority.modes[0].bridge_residue_per_sqrt_kg
        * authority.modes[0].radiation_residue_m2_per_sqrt_kg;
    let distinct_products = authority.modes[1..].iter().any(|mode| {
        let product = mode.bridge_residue_per_sqrt_kg * mode.radiation_residue_m2_per_sqrt_kg;
        (product - first_product).abs() > 1.0e-7
    });
    maximum_gap - minimum_gap > 0.02 && radiating_modes >= 3 && distinct_products
}

#[test]
fn dkt_element_matches_rigid_motion_and_constant_curvature_known_answers() {
    // Irregular geometry prevents symmetry from hiding edge-table mutations.
    let x = [0.1, 1.3, 0.4];
    let y = [-0.2, 0.1, 0.9];
    let d = reviewed_bending_rigidity();
    let h3 = 0.006_f64.powi(3);
    let reciprocal_poisson = 0.36 * 0.75e9 / 10.0e9;
    let denominator = 12.0 * (1.0 - 0.36 * reciprocal_poisson);
    let expected_d = [
        10.0e9 * h3 / denominator + 22.0,
        0.36 * 0.75e9 * h3 / denominator,
        0.0,
        0.36 * 0.75e9 * h3 / denominator,
        0.75e9 * h3 / denominator + 11.0,
        0.0,
        0.0,
        0.0,
        0.65e9 * h3 / 12.0,
    ];
    for (actual, expected) in d.into_iter().zip(expected_d) {
        assert!((actual - expected).abs() <= 2.0e-15 * expected.abs().max(1.0));
    }
    let (stiffness, area) = dkt_triangle_stiffness(x, y, d, 0).expect("valid DKT element");
    for row in 0..9 {
        for column in 0..9 {
            assert!(
                (stiffness[9 * row + column] - stiffness[9 * column + row]).abs()
                    < 1.0e-9 * d[0].max(1.0),
                "DKT matrix lost symmetry at ({row},{column})"
            );
        }
    }
    for rigid_motion in 0..3 {
        let mut displacement = [0.0; 9];
        for node in 0..3 {
            match rigid_motion {
                0 => displacement[3 * node] = 1.0,
                1 => {
                    displacement[3 * node] = x[node];
                    displacement[3 * node + 1] = 1.0;
                }
                _ => {
                    displacement[3 * node] = y[node];
                    displacement[3 * node + 2] = 1.0;
                }
            }
        }
        assert!(
            quadratic_form(&stiffness, &displacement).abs() < 1.0e-8 * d[0],
            "rigid motion {rigid_motion} stored bending energy"
        );
    }

    let (k_xx, k_yy, k_xy) = (0.7, -0.4, 0.3);
    let mut displacement = [0.0; 9];
    for node in 0..3 {
        displacement[3 * node] =
            0.5 * (k_xx * x[node] * x[node] + k_yy * y[node] * y[node]) + k_xy * x[node] * y[node];
        displacement[3 * node + 1] = k_xx * x[node] + k_xy * y[node];
        displacement[3 * node + 2] = k_yy * y[node] + k_xy * x[node];
    }
    let curvature = [k_xx, k_yy, 2.0 * k_xy];
    let mut expected = 0.0;
    for row in 0..3 {
        for column in 0..3 {
            expected += curvature[row] * d[3 * row + column] * curvature[column];
        }
    }
    expected *= area;
    let measured = quadratic_form(&stiffness, &displacement);
    assert!(
        (measured - expected).abs() < 1.0e-9 * expected.abs(),
        "constant-curvature patch mismatch: {measured} vs {expected}"
    );

    assert_eq!(
        dkt_triangle_stiffness([0.0, 1.0, 2.0], [0.0, 0.0, 0.0], d, 7),
        Err(UprightBassBodyError::DegenerateElement { element: 7 })
    );
}

#[test]
fn reviewed_authority_is_deterministic_bounded_and_candid_about_missing_geometry() {
    let first = derive_reviewed_upright_bass_body().expect("reviewed body");
    let second = derive_reviewed_upright_bass_body().expect("deterministic repeat");
    assert_eq!(first, second);
    assert_sorted_finite(&first);
    assert!(has_geometry_bound_signature(&first));
    assert_eq!(
        first.input,
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
    );
    assert_eq!(
        first.topology,
        BodyTopologyAuthority::SimplySupportedDktSoundboardWithSealedCavityCompliance
    );
    assert_eq!(
        first.port_mode_authority,
        PortModeAuthority::UnavailableMissingOpeningAreaAndEffectiveNeck
    );
    assert_eq!(
        first.carved_shell_authority,
        CarvedShellAuthority::UnavailableMissingOutlineArchAndBackGeometry
    );
    assert_eq!(
        first.damping_authority,
        DampingAuthority::ReviewedPackConstantPendingPrimaryLiteratureLossFactors
    );
    assert_eq!(first.cavity.volume_m3, 0.45);
    assert_eq!(first.cavity.bulk_modulus_pa, 1.204 * 343.0 * 343.0);
    assert_eq!(
        first.cavity.volume_stiffness_pa_per_m3,
        first.cavity.bulk_modulus_pa / first.cavity.volume_m3
    );

    let receipt = first.receipt;
    assert_eq!(receipt.nodes, NODE_COUNT);
    assert_eq!(receipt.triangles, TRIANGLE_COUNT);
    assert_eq!(receipt.free_dofs, FREE_DOF_COUNT);
    assert_eq!(
        (receipt.nodes, receipt.triangles, receipt.free_dofs),
        (30, 40, 72)
    );
    assert_eq!(receipt.element_gauss_evaluations, TRIANGLE_COUNT * 3);
    assert_eq!(
        receipt.assembled_scalar_contributions,
        TRIANGLE_COUNT * 3 * 9 * 9
    );
    assert!(receipt.jacobi_sweeps > 0 && receipt.jacobi_sweeps <= MAX_JACOBI_SWEEPS);
    assert_eq!(
        receipt.jacobi_pair_visits,
        receipt.jacobi_sweeps * FREE_DOF_COUNT * (FREE_DOF_COUNT - 1) / 2
    );
    assert!(receipt.jacobi_rotations <= receipt.jacobi_pair_visits);
    assert_eq!(receipt.projected_mode_count, BODY_MODE_COUNT);
    assert_eq!(
        receipt.work_units,
        receipt.assembled_scalar_contributions
            + receipt.jacobi_pair_visits
            + receipt.jacobi_rotations * (6 * 72 + 8)
            + 10 * 72 * 2
    );
    assert_eq!(
        receipt.work_unit_limit,
        40 * 3 * 9 * 9 + 96 * 72 * 71 / 2 + 96 * 72 * 71 / 2 * (6 * 72 + 8) + 10 * 72 * 2
    );
    assert!(receipt.work_units <= receipt.work_unit_limit);
    assert_eq!(GRID_CELLS_X, 5);
    assert_eq!(GRID_CELLS_Y, 4);

    for mode in first.modes {
        let independently_derived_t60 = LN_1000 * mode.q / (PI * mode.frequency_hz);
        assert!(
            (mode.t60_seconds - independently_derived_t60).abs()
                < 1.0e-12 * independently_derived_t60
        );
    }
    assert!(first
        .modes
        .iter()
        .any(|mode| mode.bridge_residue_per_sqrt_kg > 1.0e-6));
    assert!(first
        .modes
        .iter()
        .any(|mode| mode.bridge_residue_per_sqrt_kg < -1.0e-6));
    assert!(first
        .modes
        .iter()
        .any(|mode| mode.radiation_residue_m2_per_sqrt_kg > 1.0e-6));
    assert!(first
        .modes
        .iter()
        .any(|mode| mode.radiation_residue_m2_per_sqrt_kg < -1.0e-6));
    eprintln!(
        "UPRIGHT_BODY_AUTHORITY frequencies_hz={:?} bridge={:?} radiation={:?} work={:?}",
        first.modes.map(|mode| mode.frequency_hz),
        first.modes.map(|mode| mode.bridge_residue_per_sqrt_kg),
        first
            .modes
            .map(|mode| mode.radiation_residue_m2_per_sqrt_kg),
        first.receipt,
    );
}

#[test]
fn geometry_material_mass_and_cavity_mutations_move_the_eigenproblem() {
    let reviewed = reviewed_upright_bass_body_input();
    let base = derive_upright_bass_body(reviewed).expect("base");

    let stiffer = derive_upright_bass_body(UprightBassBodyInput {
        young_longitudinal_pa: reviewed.young_longitudinal_pa * 1.20,
        young_radial_pa: reviewed.young_radial_pa * 1.20,
        shear_lr_pa: reviewed.shear_lr_pa * 1.20,
        ..reviewed
    })
    .expect("stiffer wood");
    let heavier = derive_upright_bass_body(UprightBassBodyInput {
        density_kg_per_m3: reviewed.density_kg_per_m3 * 1.20,
        ..reviewed
    })
    .expect("heavier plate");
    let scale = 1.03;
    let larger = derive_upright_bass_body(UprightBassBodyInput {
        length_m: reviewed.length_m * scale,
        width_m: reviewed.width_m * scale,
        thickness_m: reviewed.thickness_m * scale,
        cavity_volume_m3: reviewed.cavity_volume_m3 * scale * scale * scale,
        ..reviewed
    })
    .expect("geometrically similar larger body");
    for index in 0..BODY_MODE_COUNT {
        assert!(
            stiffer.modes[index].frequency_hz > base.modes[index].frequency_hz,
            "material stiffness did not raise ordered mode {index}"
        );
        assert!(
            heavier.modes[index].frequency_hz < base.modes[index].frequency_hz,
            "mass did not lower ordered mode {index}"
        );
        assert!(
            larger.modes[index].frequency_hz < base.modes[index].frequency_hz,
            "similar-body scaling did not lower ordered mode {index}"
        );
    }

    let small_cavity = derive_upright_bass_body(UprightBassBodyInput {
        cavity_volume_m3: 0.35,
        ..reviewed
    })
    .expect("small cavity");
    let large_cavity = derive_upright_bass_body(UprightBassBodyInput {
        cavity_volume_m3: 0.55,
        ..reviewed
    })
    .expect("large cavity");
    let mut shifted = 0;
    for index in 0..BODY_MODE_COUNT {
        // Lowering a positive-semidefinite rank-one stiffness cannot raise an
        // ordered generalized eigenvalue (Courant-Fischer monotonicity).
        assert!(
            small_cavity.modes[index].frequency_hz + 1.0e-9
                >= large_cavity.modes[index].frequency_hz,
            "passive cavity monotonicity failed at ordered mode {index}"
        );
        if small_cavity.modes[index].frequency_hz > 1.001 * large_cavity.modes[index].frequency_hz {
            shifted += 1;
        }
    }
    assert!(
        shifted >= 1,
        "450 L air compliance had no observable modal effect"
    );

    let moved_bridge = derive_upright_bass_body(UprightBassBodyInput {
        bridge_x_over_length: 0.63,
        bridge_y_over_width: 0.46,
        ..reviewed
    })
    .expect("moved bridge");
    assert_eq!(
        moved_bridge.modes.map(|mode| mode.frequency_hz),
        base.modes.map(|mode| mode.frequency_hz),
        "a force observation point must not alter the eigenproblem"
    );
    assert!(moved_bridge
        .modes
        .iter()
        .zip(base.modes)
        .any(|(moved, original)| {
            (moved.bridge_residue_per_sqrt_kg - original.bridge_residue_per_sqrt_kg).abs() > 1.0e-5
        }));
}

#[test]
fn copied_guitar_geometry_and_tuned_template_are_planted_negatives() {
    let reviewed = reviewed_upright_bass_body_input();
    let copied_dreadnought = UprightBassBodyInput {
        length_m: 0.51,
        width_m: 0.40,
        thickness_m: 0.0032,
        cavity_volume_m3: 0.105,
        ..reviewed
    };
    assert_eq!(
        derive_upright_bass_body(copied_dreadnought),
        Err(UprightBassBodyError::NotUprightGeometry { field: "length_m" })
    );

    let physical = derive_reviewed_upright_bass_body().expect("physical table");
    assert!(has_geometry_bound_signature(&physical));
    let mut tuned_template = physical;
    let fundamental = physical.modes[0].frequency_hz;
    for (index, mode) in tuned_template.modes.iter_mut().enumerate() {
        mode.frequency_hz = fundamental * (index + 1) as f64;
    }
    assert!(
        !has_geometry_bound_signature(&tuned_template),
        "a harmonic frequency template passed as geometry-derived"
    );

    let mut uniform_residues = physical;
    for mode in &mut uniform_residues.modes {
        mode.bridge_residue_per_sqrt_kg = physical.modes[0].bridge_residue_per_sqrt_kg;
        mode.radiation_residue_m2_per_sqrt_kg = physical.modes[0].radiation_residue_m2_per_sqrt_kg;
    }
    assert!(
        !has_geometry_bound_signature(&uniform_residues),
        "uniform modal residues passed as geometry-derived"
    );
}

#[test]
fn malformed_authority_inputs_refuse_before_modal_work() {
    let reviewed = reviewed_upright_bass_body_input();
    for (input, expected) in [
        (
            UprightBassBodyInput {
                thickness_m: 0.0,
                ..reviewed
            },
            UprightBassBodyError::InvalidInput {
                field: "thickness_m",
            },
        ),
        (
            UprightBassBodyInput {
                poisson_lr: 0.5,
                ..reviewed
            },
            UprightBassBodyError::InvalidInput {
                field: "poisson_lr",
            },
        ),
        (
            UprightBassBodyInput {
                bridge_x_over_length: 1.1,
                ..reviewed
            },
            UprightBassBodyError::InvalidInput { field: "bridge" },
        ),
        (
            UprightBassBodyInput {
                cavity_volume_m3: 0.10,
                ..reviewed
            },
            UprightBassBodyError::NotUprightGeometry {
                field: "cavity_volume_m3",
            },
        ),
    ] {
        assert_eq!(derive_upright_bass_body(input), Err(expected));
    }
}
