#[path = "../src/trumpet.rs"]
mod trumpet;

use trumpet::{
    adachi_lip_jet_balance, geometry_half_wave_hz, lip_flow_m3_s,
    lip_streamwise_joint_penetration_m, outward_equilibrium_opening_m,
    passive_two_mode_lip_matrices, passive_wall_loss_balance, positive_real_radiation_balance,
    two_dimensional_lip_pressure_port_balance, unilateral_lip_contact_balance,
    valve_added_length_m, OversampledOutput, TrumpetControls, TrumpetError, TrumpetModel,
    TrumpetParameters, BORE_CELLS, OVERSAMPLE_FACTOR,
};

fn silent_controls() -> TrumpetControls {
    TrumpetControls {
        mouth_pressure_pa: 0.0,
        lip_resonance_hz: 440.0,
        lip_damping_ratio: 0.18,
        equilibrium_opening_m: 0.0003,
        tongue_contact: 0.0,
        valves: [0.0; 3],
    }
}

#[test]
fn independent_outward_lip_and_flow_answers_match() {
    let opening = outward_equilibrium_opening_m(0.0003, 0.0001, 2_000.0, 4_000.0, 1.0)
        .expect("outward sign is physical");
    assert!((opening - 0.0005).abs() < 1.0e-9);
    let flow = lip_flow_m3_s(0.012, 0.0005, 4_000.0).expect("fixture flow");
    assert!((flow - 0.000489897949).abs() < 1.0e-9);
}

#[test]
fn negative_damping_inward_sign_and_oversampling_bypass_are_refused() {
    let mut controls = silent_controls();
    controls.lip_damping_ratio = -0.01;
    assert_eq!(
        controls.validate(),
        Err(TrumpetError::NonPositiveLipDamping)
    );
    assert_eq!(
        outward_equilibrium_opening_m(0.0003, 0.0001, 2_000.0, 4_000.0, -1.0),
        Err(TrumpetError::InwardLipForce)
    );
    assert_eq!(
        OversampledOutput::new(48_000.0, 1).err(),
        Some(TrumpetError::OversamplingBypassed)
    );
}

#[test]
fn non_passive_valve_transition_is_a_constructor_failure() {
    let mut parameters = TrumpetParameters::canonical();
    parameters.valve_transition_energy_gain = 1.000_001;
    assert!(matches!(
        TrumpetModel::new(48_000.0, parameters),
        Err(TrumpetError::NonPassiveValveTransition)
    ));
}

#[test]
fn fixed_geometry_and_valves_move_resonance_without_a_midi_input() {
    let open_normal = 2.0 * geometry_half_wave_hz([0.0, 0.0, 0.0]);
    let mut previous_pitch = open_normal;
    for mask in 0..8 {
        let valves = [
            if mask & 1 != 0 { 1.0 } else { 0.0 },
            if mask & 2 != 0 { 1.0 } else { 0.0 },
            if mask & 4 != 0 { 1.0 } else { 0.0 },
        ];
        let semitones = (if mask & 1 != 0 { 2 } else { 0 })
            + (if mask & 2 != 0 { 1 } else { 0 })
            + (if mask & 4 != 0 { 3 } else { 0 });
        let expected_hz = open_normal / 2.0_f64.powf(semitones as f64 / 12.0);
        let actual_hz = 2.0 * geometry_half_wave_hz(valves);
        let cents = 1_200.0 * (actual_hz / expected_hz).log2();
        assert!(cents.abs() < 1.0e-8, "mask={mask} cents={cents}");
        if mask == 2 {
            previous_pitch = actual_hz;
        }
    }
    let all = 2.0 * geometry_half_wave_hz([1.0, 1.0, 1.0]);
    assert!((open_normal - 233.333_333_333_333_34).abs() < 1.0e-12);
    assert!((valve_added_length_m([0.0, 1.0, 0.0]) - 0.087_410_748_708_164_11).abs() < 1.0e-15);
    assert!((valve_added_length_m([1.0, 1.0, 1.0]) - 0.608_893_936_688_449_8).abs() < 1.0e-15);
    assert!(open_normal > previous_pitch && previous_pitch > all);
    assert_eq!(BORE_CELLS, 48);
}

#[test]
fn valve_motion_is_continuous_and_does_not_reset_the_bore() {
    let mut model = TrumpetModel::new(48_000.0, TrumpetParameters::canonical()).unwrap();
    assert_eq!(model.output_sample_rate_hz(), 48_000.0);
    let mut controls = silent_controls();
    model.diagnostic_pressure_pulse(20.0).unwrap();
    let before = model.stored_energy_j(controls);
    controls.valves = [1.0, 0.0, 0.0];
    let first = model.process_sample(controls).unwrap();
    let first_position = model.current_valves()[0];
    assert!(
        first_position > 0.0 && first_position < 0.01,
        "{first_position}"
    );
    assert!(first.is_finite());
    let after = model.stored_energy_j(controls);
    assert!(after.is_finite() && after > 0.0);
    assert!(
        after <= before * 1.01,
        "passive transition {before:e} -> {after:e}"
    );
    assert!(model.effective_length_m() > 1.47);
}

#[test]
fn identical_instances_are_sample_exact_and_keep_independent_state() {
    let parameters = TrumpetParameters::canonical();
    let mut left = TrumpetModel::new(48_000.0, parameters).unwrap();
    let mut right = TrumpetModel::new(48_000.0, parameters).unwrap();
    let mut controls = TrumpetControls {
        mouth_pressure_pa: 0.0,
        lip_resonance_hz: 180.0,
        lip_damping_ratio: 1.0 / 3.0,
        equilibrium_opening_m: 0.0,
        tongue_contact: 0.0,
        valves: [0.35, 0.8, 0.0],
    };
    for frame in 0..4_096 {
        controls.mouth_pressure_pa = 4_800.0 * (frame as f64 / 720.0).min(1.0);
        assert_eq!(
            left.process_sample(controls).unwrap().to_bits(),
            right.process_sample(controls).unwrap().to_bits(),
            "determinism diverged at frame {frame}"
        );
    }
    left.diagnostic_pressure_pulse(10.0).unwrap();
    let mut diverged = false;
    for _ in 0..1_024 {
        diverged |= left.process_sample(controls).unwrap().to_bits()
            != right.process_sample(controls).unwrap().to_bits();
    }
    assert!(
        diverged,
        "one instance's state injection affected neither or both voices"
    );
}

#[test]
fn unforced_bore_and_positive_real_bell_do_not_create_energy() {
    let mut model = TrumpetModel::new(48_000.0, TrumpetParameters::canonical()).unwrap();
    let controls = silent_controls();
    // The pedal-basin seed is only a bounded passive-state control. This test
    // deliberately makes no normal-regime or pedal-playability claim.
    model.seed_open_first_regime(50.0).unwrap();
    let initial = model.stored_energy_j(controls);
    let mut maximum = initial;
    for frame in 0..4_800 {
        let output = model.process_sample(controls).unwrap_or_else(|error| {
            panic!(
                "passive pulse failed frame={frame} report={:?}: {error:?}",
                model.last_lip_report()
            )
        });
        assert!(output.is_finite());
        maximum = maximum.max(model.stored_energy_j(controls));
    }
    let final_energy = model.stored_energy_j(controls);
    eprintln!(
        "passive-pulse energy initial={initial:e} maximum={maximum:e} final={final_energy:e}"
    );
    assert!(
        maximum <= initial * 1.025,
        "active growth {initial:e} -> {maximum:e}"
    );
    assert!(
        final_energy < initial,
        "no dissipation {initial:e} -> {final_energy:e}"
    );
}

#[test]
fn positive_real_radiation_obeys_its_instantaneous_power_identity() {
    let balance = positive_real_radiation_balance(2.4e7, 6_000.0, 2.0e-6, 75.0).unwrap();
    assert!(balance.dissipation_w >= 0.0);
    let residual = balance.input_power_w - balance.storage_rate_w - balance.dissipation_w;
    assert!(
        residual.abs() < 1.0e-15,
        "radiation power residual {residual:e}"
    );
}

#[test]
fn viscothermal_wall_memory_is_positive_real_and_frequency_dependent() {
    let balance =
        passive_wall_loss_balance(6.8, 2.0 * core::f64::consts::PI * 150.0, 2.0, 0.4).unwrap();
    assert!(balance.dissipation > 0.0);
    assert!((balance.removed_power - balance.storage_rate - balance.dissipation).abs() < 1.0e-14);
    assert_eq!(
        passive_wall_loss_balance(-6.8, 2.0 * core::f64::consts::PI * 150.0, 2.0, 0.4),
        Err(TrumpetError::NonFiniteState)
    );

    let parameters = TrumpetParameters::canonical();
    let corner = parameters.wall_loss_relaxation_hz;
    let effective_loss = |frequency_hz: f64| {
        parameters.bore_loss_per_second
            + parameters.wall_loss_strength_per_second * frequency_hz * frequency_hz
                / (corner * corner + frequency_hz * frequency_hz)
    };
    assert!(effective_loss(232.0) > effective_loss(87.0));
}

#[test]
fn rotated_two_mode_lip_tissue_is_symmetric_and_passive() {
    let matrices = passive_two_mode_lip_matrices(6.33e-5, 300.0, 1.0 / 3.0).unwrap();
    assert!((matrices.lower_resonance_hz - 221.739_130_434_782_6).abs() < 1.0e-12);
    assert_eq!(matrices.upper_resonance_hz, 300.0);
    assert!(matrices.normal_stiffness_n_m > 0.0);
    assert!(
        matrices.normal_stiffness_n_m * matrices.streamwise_stiffness_n_m
            > matrices.cross_stiffness_n_m * matrices.cross_stiffness_n_m
    );
    assert!(matrices.normal_damping_n_s_m > 0.0);
    assert!(
        matrices.normal_damping_n_s_m * matrices.streamwise_damping_n_s_m
            > matrices.cross_damping_n_s_m * matrices.cross_damping_n_s_m
    );
    for (normal, streamwise) in [(1.0, 0.0), (0.0, 1.0), (1.0, -1.0), (1.0, 1.0)] {
        let potential = 0.5
            * (matrices.normal_stiffness_n_m * normal * normal
                + matrices.streamwise_stiffness_n_m * streamwise * streamwise)
            + matrices.cross_stiffness_n_m * normal * streamwise;
        let dissipation = matrices.normal_damping_n_s_m * normal * normal
            + matrices.streamwise_damping_n_s_m * streamwise * streamwise
            + 2.0 * matrices.cross_damping_n_s_m * normal * streamwise;
        assert!(potential > 0.0);
        assert!(dissipation > 0.0);
    }
    assert_eq!(
        passive_two_mode_lip_matrices(6.33e-5, 300.0, -1.0 / 3.0),
        Err(TrumpetError::NonFiniteState)
    );
}

#[test]
fn unilateral_lip_contact_has_reversible_energy_and_nonnegative_dissipation() {
    let stiffness = 4.0e6;
    let damping = 1.2e4;
    let penetration = 8.0e-5;
    let closing = unilateral_lip_contact_balance(stiffness, damping, penetration, 0.12).unwrap();
    let opening = unilateral_lip_contact_balance(stiffness, damping, penetration, -0.12).unwrap();
    assert!(closing.force_n > opening.force_n);
    assert!(closing.dissipation_w > 0.0);
    assert_eq!(opening.dissipation_w, 0.0);
    assert_eq!(closing.potential_energy_j, opening.potential_energy_j);
    let epsilon = 1.0e-9;
    let above =
        unilateral_lip_contact_balance(stiffness, damping, penetration + epsilon, -0.12).unwrap();
    let below =
        unilateral_lip_contact_balance(stiffness, damping, penetration - epsilon, -0.12).unwrap();
    let potential_slope = (above.potential_energy_j - below.potential_energy_j) / (2.0 * epsilon);
    assert!((potential_slope - opening.force_n).abs() < opening.force_n * 1.0e-6);
    assert_eq!(
        unilateral_lip_contact_balance(-stiffness, damping, penetration, 0.12),
        Err(TrumpetError::NonFiniteState)
    );
}

#[test]
fn adachi_jet_step_obeys_equations_seven_and_eight_with_real_inertance() {
    let area_m2 = 4.0e-6;
    let old_flow_m3_s = 1.1e-4;
    let old_acceleration_m3_s2 = 0.03;
    let candidate_flow_m3_s = 1.2e-4;
    let mouth_pressure_pa = 5_500.0;
    let cup_pressure_pa = 1_200.0;
    let dt = 1.0 / 192_000.0;
    let balance = adachi_lip_jet_balance(
        area_m2,
        old_flow_m3_s,
        old_acceleration_m3_s2,
        candidate_flow_m3_s,
        mouth_pressure_pa,
        cup_pressure_pa,
        dt,
    )
    .unwrap();
    let equation_seven_residual = mouth_pressure_pa
        - balance.lip_opening_pressure_pa
        - balance.inertance_pa_s2_m3 * balance.flow_acceleration_m3_s2
        - balance.contraction_pressure_drop_pa;
    let equation_eight_residual =
        balance.lip_opening_pressure_pa - cup_pressure_pa - balance.expansion_pressure_change_pa;
    assert!(equation_seven_residual.abs() < 1.0e-10);
    assert!(equation_eight_residual.abs() < 1.0e-10);
    assert!((balance.reconstructed_cup_pressure_pa - cup_pressure_pa).abs() < 1.0e-10);
    assert!(balance.dissipation_w >= 0.0);
    let expected_flow_residual = candidate_flow_m3_s
        - old_flow_m3_s
        - 0.5 * dt * (old_acceleration_m3_s2 + balance.flow_acceleration_m3_s2);
    assert!((balance.flow_residual_m3_s - expected_flow_residual).abs() < 1.0e-18);
    let inertial_drop_pa = balance.inertance_pa_s2_m3 * balance.flow_acceleration_m3_s2;
    assert!(
        inertial_drop_pa.abs() > 100.0,
        "quasi-steady near-miss would bypass {inertial_drop_pa} Pa of lip-channel inertia"
    );

    let reverse = adachi_lip_jet_balance(
        area_m2,
        -old_flow_m3_s,
        -old_acceleration_m3_s2,
        -candidate_flow_m3_s,
        -mouth_pressure_pa,
        -cup_pressure_pa,
        dt,
    )
    .unwrap();
    assert!(reverse.dissipation_w >= 0.0);
    assert_eq!(
        adachi_lip_jet_balance(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, dt),
        Err(TrumpetError::NonFiniteState)
    );
}

#[test]
fn frozen_adachi_dynamic_jet_and_pressure_power_cells_match() {
    let area_m2 = 3.5e-6;
    let flow_m3_s = 1.0e-4;
    let target_acceleration_m3_s2 = 0.25;
    let inertance = 1.2 * 0.002 / area_m2;
    let inverse_area = 1.0 / area_m2 - 1.0 / 2.3e-4;
    let resistive_drop = 0.5 * 1.2 * flow_m3_s * flow_m3_s * inverse_area * inverse_area;
    let mouth_pressure_pa = resistive_drop + inertance * target_acceleration_m3_s2;
    let jet = adachi_lip_jet_balance(
        area_m2,
        flow_m3_s - target_acceleration_m3_s2 / 192_000.0,
        target_acceleration_m3_s2,
        flow_m3_s,
        mouth_pressure_pa,
        0.0,
        1.0 / 192_000.0,
    )
    .unwrap();
    assert!((jet.inertance_pa_s2_m3 - 685.714_285_714_285_7).abs() < 1.0e-10);
    assert!((jet.contraction_pressure_drop_pa - 489.795_918_367_347).abs() < 1.0e-9);
    assert!(
        (jet.inertance_pa_s2_m3 * target_acceleration_m3_s2 + jet.contraction_pressure_drop_pa
            - 661.224_489_795_918_4)
            .abs()
            < 1.0e-9
    );

    let port = two_dimensional_lip_pressure_port_balance(
        7.0e-6, 0.007, 0.0, 0.00025, 0.0, 0.01, 0.02, 4_000.0, 0.0, 1_000.0,
    )
    .unwrap();
    assert!((port.swept_flow_m3_s - 5.95e-7).abs() < 1.0e-18);
    assert!((port.opening_face_flow_m3_s - 1.4e-7).abs() < 1.0e-18);
    // The frozen force vector is ordered [streamwise x, normal y].
    assert!((port.streamwise_force_n - 0.105).abs() < 1.0e-15);
    assert!((port.normal_force_n - 0.042).abs() < 1.0e-15);
    assert!((port.mechanical_power_w - 0.00252).abs() < 1.0e-15);
    assert!(
        (port.mouth_power_w - port.cup_power_w + port.opening_pressure_power_w
            - port.mechanical_power_w)
            .abs()
            < 1.0e-18
    );
}

#[test]
fn streamwise_contact_uses_the_actual_one_millimetre_joint_boundary() {
    assert_eq!(
        lip_streamwise_joint_penetration_m(7.0e-6, 0.007, -0.0009).unwrap(),
        0.0
    );
    let penetration = lip_streamwise_joint_penetration_m(7.0e-6, 0.007, -0.0011).unwrap();
    assert!((penetration - 0.0001).abs() < 1.0e-15);
    // Planted old near-miss: a generic -2 mm travel barrier would leave this
    // crossed-joint state unopposed and permit a negative projected area.
    let old_barrier_penetration = (-0.002_f64 - -0.0011_f64).max(0.0);
    assert_eq!(old_barrier_penetration, 0.0);
}

#[test]
fn two_dimensional_lip_pressure_force_and_swept_flow_are_power_conjugates() {
    let port = two_dimensional_lip_pressure_port_balance(
        7.0e-6, 0.007, 0.00025, 0.00003, 0.0001, 0.18, -0.04, 5_500.0, 2_400.0, -120.0,
    )
    .unwrap();
    assert!(port.mechanical_power_w > 0.0);
    assert!(
        (port.mouth_power_w - port.cup_power_w + port.opening_pressure_power_w
            - port.mechanical_power_w)
            .abs()
            < 1.0e-18
    );
    let normal_span = 0.0002;
    let streamwise_span = 0.0003;
    let loop_edges = [
        (0.5 * normal_span, 0.0, normal_span, 0.0),
        (normal_span, 0.5 * streamwise_span, 0.0, streamwise_span),
        (0.5 * normal_span, streamwise_span, -normal_span, 0.0),
        (0.0, 0.5 * streamwise_span, 0.0, -streamwise_span),
    ];
    let closed_loop_swept_volume = loop_edges
        .into_iter()
        .map(
            |(normal, streamwise, normal_velocity, streamwise_velocity)| {
                two_dimensional_lip_pressure_port_balance(
                    7.0e-6,
                    0.007,
                    0.00025,
                    normal,
                    streamwise,
                    normal_velocity,
                    streamwise_velocity,
                    5_500.0,
                    2_400.0,
                    -120.0,
                )
                .unwrap()
                .swept_flow_m3_s
            },
        )
        .sum::<f64>();
    let expected_pumped_volume = -2.0 * 0.007 * normal_span * streamwise_span;
    assert!(
        (closed_loop_swept_volume - expected_pumped_volume).abs() < 1.0e-20,
        "Adachi shape pump {closed_loop_swept_volume:e}, expected {expected_pumped_volume:e}"
    );
    // Planted scalar-potential near-miss: constant areas force the loop volume
    // to zero and erase the actual swinging/stretching pump geometry.
    let scalar_potential_loop_volume = loop_edges
        .into_iter()
        .map(
            |(_normal, _streamwise, normal_velocity, streamwise_velocity)| {
                7.0e-6 * normal_velocity + 28.0e-6 * streamwise_velocity
            },
        )
        .sum::<f64>();
    assert!(scalar_potential_loop_volume.abs() < 1.0e-20);
    assert_eq!(
        two_dimensional_lip_pressure_port_balance(
            -7.0e-6, 0.007, 0.00025, 0.00003, 0.0001, 0.18, -0.04, 5_500.0, 2_400.0, -120.0,
        ),
        Err(TrumpetError::NonFiniteState)
    );
}

fn filtered_sine_rms(frequency_hz: f64) -> f64 {
    let output_rate = 48_000.0;
    let internal_rate = output_rate * OVERSAMPLE_FACTOR as f64;
    let mut filter = OversampledOutput::new(output_rate, OVERSAMPLE_FACTOR).unwrap();
    let frames = 48_000;
    let mut sum = 0.0;
    let mut count = 0usize;
    for sample in 0..frames * OVERSAMPLE_FACTOR {
        let input =
            (2.0 * core::f64::consts::PI * frequency_hz * sample as f64 / internal_rate).sin();
        if let Some(output) = filter.push_oversampled(input) {
            if count > 4_800 {
                sum += output * output;
            }
            count += 1;
        }
    }
    (sum / (count - 4_801) as f64).sqrt()
}

fn impedance_peak(model: &TrumpetModel, low_hz: f64, high_hz: f64) -> (f64, f64, f64) {
    let mut best = (low_hz, 0.0_f64, 0.0_f64);
    let steps = ((high_hz - low_hz) * 4.0).round() as usize;
    for index in 0..=steps {
        let frequency_hz = low_hz + index as f64 * 0.25;
        let impedance = model.diagnostic_input_impedance(frequency_hz).unwrap();
        if impedance.normalized_magnitude > best.1 {
            best = (
                frequency_hz,
                impedance.normalized_magnitude,
                impedance.phase_degrees,
            );
        }
    }
    best
}

#[test]
fn fixed_bore_reproduces_the_first_two_measured_trumpet_impedance_peaks() {
    let model = TrumpetModel::new(48_000.0, TrumpetParameters::canonical()).unwrap();
    let first = impedance_peak(&model, 60.0, 130.0);
    let second = impedance_peak(&model, 180.0, 280.0);
    eprintln!("Table-II impedance first={first:?} second={second:?}");
    assert!(
        ((first.0 - 87.0) / 87.0).abs() <= 0.04,
        "first peak {first:?}"
    );
    assert!(
        ((second.0 - 232.0) / 232.0).abs() <= 0.04,
        "second peak {second:?}"
    );
    assert!(
        ((first.1 / second.1) - (43.7 / 35.2)).abs() <= 0.25,
        "measured peak ratio missing: {first:?} {second:?}"
    );
    assert!(
        (first.1 - 43.7).abs() <= 10.0 && (second.1 - 35.2).abs() <= 10.0,
        "normalized peak magnitudes differ from Table II: {first:?} {second:?}"
    );
}

fn estimate_f0(
    samples: &[f64],
    sample_rate_hz: f64,
    minimum_hz: f64,
    maximum_hz: f64,
) -> (f64, f64) {
    let mean = samples.iter().sum::<f64>() / samples.len() as f64;
    let lag_min = (sample_rate_hz / maximum_hz) as usize;
    let lag_max = (sample_rate_hz / minimum_hz) as usize;
    let mut scores = Vec::with_capacity(lag_max - lag_min + 1);
    for lag in lag_min..=lag_max {
        let mut cross = 0.0;
        let mut left = 0.0;
        let mut right = 0.0;
        for index in 0..samples.len() - lag {
            let a = samples[index] - mean;
            let b = samples[index + lag] - mean;
            cross += a * b;
            left += a * a;
            right += b * b;
        }
        let score = cross / (left * right).max(1.0e-30).sqrt();
        scores.push(score);
    }
    let global = scores.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    // Autocorrelation peaks repeat at every integer multiple of the true
    // period. A raw global maximum therefore commonly reports a subharmonic
    // because the later overlap is shorter. Select the first credible local
    // maximum, then refine its lag parabolically.
    let relative_threshold = (global * 0.97).max(0.5);
    let peak_index = (1..scores.len() - 1)
        .find(|index| {
            scores[*index] >= relative_threshold
                && scores[*index] > scores[*index - 1]
                && scores[*index] >= scores[*index + 1]
        })
        .unwrap_or_else(|| {
            scores[1..scores.len() - 1]
                .iter()
                .enumerate()
                .max_by(|left, right| left.1.total_cmp(right.1))
                .map(|(index, _)| index + 1)
                .unwrap()
        });
    let left = scores[peak_index - 1];
    let center = scores[peak_index];
    let right = scores[peak_index + 1];
    let curvature = left - 2.0 * center + right;
    let offset = if curvature.abs() > 1.0e-12 {
        0.5 * (left - right) / curvature
    } else {
        0.0
    }
    .clamp(-0.5, 0.5);
    let lag = (lag_min + peak_index) as f64 + offset;
    (sample_rate_hz / lag, center)
}

fn spectral_centroid_hz(samples: &[f64]) -> f64 {
    const SIZE: usize = 4_096;
    let start = samples.len() - SIZE;
    let mut real = vec![0.0; SIZE];
    let mut imaginary = vec![0.0; SIZE];
    for index in 0..SIZE {
        let window =
            0.5 - 0.5 * (2.0 * core::f64::consts::PI * index as f64 / (SIZE - 1) as f64).cos();
        real[index] = samples[start + index] * window;
    }
    let mut mirror = 0usize;
    for index in 1..SIZE {
        let mut bit = SIZE >> 1;
        while mirror & bit != 0 {
            mirror ^= bit;
            bit >>= 1;
        }
        mirror ^= bit;
        if index < mirror {
            real.swap(index, mirror);
            imaginary.swap(index, mirror);
        }
    }
    let mut span = 2;
    while span <= SIZE {
        let angle = -2.0 * core::f64::consts::PI / span as f64;
        let step_real = angle.cos();
        let step_imaginary = angle.sin();
        for base in (0..SIZE).step_by(span) {
            let mut twiddle_real = 1.0;
            let mut twiddle_imaginary = 0.0;
            for offset in 0..span / 2 {
                let low = base + offset;
                let high = low + span / 2;
                let odd_real = real[high] * twiddle_real - imaginary[high] * twiddle_imaginary;
                let odd_imaginary = real[high] * twiddle_imaginary + imaginary[high] * twiddle_real;
                let even_real = real[low];
                let even_imaginary = imaginary[low];
                real[low] = even_real + odd_real;
                imaginary[low] = even_imaginary + odd_imaginary;
                real[high] = even_real - odd_real;
                imaginary[high] = even_imaginary - odd_imaginary;
                let next_real = twiddle_real * step_real - twiddle_imaginary * step_imaginary;
                twiddle_imaginary = twiddle_real * step_imaginary + twiddle_imaginary * step_real;
                twiddle_real = next_real;
            }
        }
        span <<= 1;
    }
    let mut weighted = 0.0;
    let mut total = 0.0;
    for bin in 1..SIZE / 2 {
        let magnitude = (real[bin] * real[bin] + imaginary[bin] * imaginary[bin]).sqrt();
        let frequency_hz = bin as f64 * 48_000.0 / SIZE as f64;
        weighted += frequency_hz * magnitude;
        total += magnitude;
    }
    weighted / total.max(1.0e-30)
}

fn render_sustain(
    valves: [f64; 3],
    mouth_pressure_pa: f64,
    lip_resonance_hz: f64,
    parameters: TrumpetParameters,
) -> Vec<f64> {
    let mut model = TrumpetModel::new(48_000.0, parameters).unwrap();
    let mut controls = TrumpetControls {
        mouth_pressure_pa: 0.0,
        lip_resonance_hz,
        lip_damping_ratio: 1.0 / 3.0,
        equilibrium_opening_m: 0.0,
        tongue_contact: 1.0,
        valves,
    };
    let mut sustain = Vec::new();
    for frame in 0..24_000 {
        controls.mouth_pressure_pa = mouth_pressure_pa * (frame as f64 / 1_440.0).min(1.0);
        if frame == 1_440 {
            model.seed_open_normal_regime(100.0).unwrap();
            controls.tongue_contact = 0.0;
        }
        let sample = model.process_sample(controls).unwrap_or_else(|error| {
            panic!(
                "render failed at frame {frame}, pressure {}: {error:?}",
                controls.mouth_pressure_pa
            )
        });
        if frame > 9_600 {
            sustain.push(sample);
        }
    }
    sustain
}

fn render_regime(valves: [f64; 3]) -> (f64, f64) {
    let sustain = render_sustain(valves, 5_500.0, 250.0, TrumpetParameters::canonical());
    estimate_f0(&sustain, 48_000.0, 180.0, 280.0)
}

fn render_pressure_continuation(pressures_pa: &[f64]) -> Vec<Vec<f64>> {
    let mut model = TrumpetModel::new(48_000.0, TrumpetParameters::canonical()).unwrap();
    let mut controls = TrumpetControls {
        mouth_pressure_pa: 0.0,
        // The reviewed upper lip resonance remains fixed at 250 Hz while the
        // measured 136/184 split places the lower outward mode below the
        // 232 Hz bore regime.
        lip_resonance_hz: 250.0,
        // Newton et al.'s human Q range is 1.2..1.8. Q=1.5 is the
        // independently reviewed midpoint, hence zeta=1/(2Q)=1/3.
        lip_damping_ratio: 1.0 / 3.0,
        equilibrium_opening_m: 0.0,
        tongue_contact: 1.0,
        valves: [0.0; 3],
    };
    let mut previous_pressure_pa = 0.0;
    let mut cells = Vec::with_capacity(pressures_pa.len());
    for (cell_index, target_pressure_pa) in pressures_pa.iter().copied().enumerate() {
        let mut sustain = Vec::new();
        for frame in 0..24_000 {
            let ramp = (frame as f64 / 1_440.0).min(1.0);
            controls.mouth_pressure_pa =
                previous_pressure_pa + ramp * (target_pressure_pa - previous_pressure_pa);
            if cell_index == 0 && frame == 1_440 {
                model.seed_open_normal_regime(100.0).unwrap();
                controls.tongue_contact = 0.0;
            }
            let sample = model.process_sample(controls).unwrap_or_else(|error| {
                panic!(
                    "continuation failed cell={cell_index} frame={frame} pressure={} report={:?}: {error:?}",
                    controls.mouth_pressure_pa,
                    model.last_lip_report()
                )
            });
            if frame > 9_600 {
                sustain.push(sample);
            }
        }
        cells.push(sustain);
        previous_pressure_pa = target_pressure_pa;
    }
    cells
}

#[test]
fn real_antialias_filter_preserves_band_and_rejects_first_image() {
    let pass = filtered_sine_rms(8_000.0);
    let image = filtered_sine_rms(24_000.0);
    let attenuation_db = 20.0 * (image / pass).log10();
    assert!(pass > 0.65, "pass-band rms {pass}");
    assert!(
        attenuation_db < -50.0,
        "image attenuation {attenuation_db:.1} dB"
    );
}

#[test]
fn driven_core_is_finite_non_silent_and_bounded() {
    let mut model = TrumpetModel::new(48_000.0, TrumpetParameters::canonical()).unwrap();
    let mut controls = TrumpetControls {
        mouth_pressure_pa: 0.0,
        lip_resonance_hz: 250.0,
        lip_damping_ratio: 1.0 / 3.0,
        equilibrium_opening_m: 0.0,
        tongue_contact: 1.0,
        valves: [0.0; 3],
    };
    let mut sum = 0.0;
    let mut peak = 0.0f64;
    let mut sustain = Vec::new();
    let mut maximum_newton_iterations = 0;
    let mut maximum_residual_evaluations = 0;
    let mut maximum_line_search_evaluations = 0;
    for frame in 0..24_000 {
        controls.mouth_pressure_pa = 5_500.0 * (frame as f64 / 1_440.0).min(1.0);
        if frame == 1_440 {
            model.seed_open_normal_regime(100.0).unwrap();
            controls.tongue_contact = 0.0;
        }
        let sample = model.process_sample(controls).unwrap_or_else(|error| {
            panic!(
                "driven core failed at frame {frame}, pressure {} report={:?}: {error:?}",
                controls.mouth_pressure_pa,
                model.last_lip_report()
            )
        });
        assert!(sample.is_finite());
        if frame > 4_800 {
            sum += sample * sample;
            peak = peak.max(sample.abs());
            sustain.push(sample);
        }
        let report = model.last_lip_report();
        maximum_newton_iterations = maximum_newton_iterations.max(report.newton_iterations);
        maximum_residual_evaluations =
            maximum_residual_evaluations.max(report.residual_evaluations);
        maximum_line_search_evaluations =
            maximum_line_search_evaluations.max(report.line_search_evaluations);
        assert!(report.newton_iterations <= 8);
        assert!(report.residual_evaluations <= 65);
        assert!(report.line_search_evaluations <= 32);
        assert_eq!(report.bracket_evaluations, 0);
        assert_eq!(report.fallback_bisections, 0);
    }
    let rms = (sum / (24_000 - 4_801) as f64).sqrt();
    let (f0, periodicity) = estimate_f0(&sustain, 48_000.0, 180.0, 280.0);
    eprintln!(
        "driven trumpet diagnostic rms={rms:e} peak={peak:e} f0={f0} score={periodicity} max_newton={maximum_newton_iterations} max_residual={maximum_residual_evaluations} max_line_search={maximum_line_search_evaluations}",
    );
    assert!(rms > 2.0e-5, "silent physical output {rms:e}");
    assert!(peak < 1.0, "unbounded physical output {peak}");
    assert!(periodicity > 0.9, "unlocked regime score {periodicity}");
    assert!(
        (220.0..=240.0).contains(&f0),
        "normal Bb3-series regime {f0}"
    );
}

#[test]
fn rendered_regime_moves_down_when_second_valve_length_is_inserted() {
    let (open_hz, open_periodicity) = render_regime([0.0, 0.0, 0.0]);
    let (valve_hz, valve_periodicity) = render_regime([0.0, 1.0, 0.0]);
    eprintln!("open={open_hz} ({open_periodicity}) valve2={valve_hz} ({valve_periodicity})");
    assert!(open_periodicity > 0.9 && valve_periodicity > 0.9);
    assert!(
        valve_hz < open_hz,
        "valve path did not lower pitch: {open_hz} -> {valve_hz}"
    );
}

#[test]
fn nonlinear_bore_path_materially_changes_the_bounded_output() {
    let mut linear_parameters = TrumpetParameters::canonical();
    linear_parameters.nonlinear_coefficient = 0.0;
    let linear = render_sustain([0.0; 3], 3_000.0, 80.0, linear_parameters);
    let nonlinear = render_sustain([0.0; 3], 3_000.0, 80.0, TrumpetParameters::canonical());
    assert_eq!(linear.len(), nonlinear.len());
    assert!(linear
        .iter()
        .chain(&nonlinear)
        .all(|sample| sample.is_finite()));
    let difference_rms = linear
        .iter()
        .zip(&nonlinear)
        .map(|(left, right)| (left - right).powi(2))
        .sum::<f64>()
        / linear.len() as f64;
    let difference_rms = difference_rms.sqrt();
    assert!(
        difference_rms > 1.0e-5,
        "nonlinear propagation was bypassed: difference rms {difference_rms:e}"
    );
}

#[test]
fn pressure_increase_brightens_a_fixed_regime_without_retuning_it() {
    let pressures_pa = [5_500.0, 7_000.0, 8_500.0, 12_000.0];
    let mut pitches_hz = Vec::new();
    let mut periodicities = Vec::new();
    let mut centroids_hz = Vec::new();
    let mut levels_rms = Vec::new();
    let mut peaks = Vec::new();
    let rendered_cells = render_pressure_continuation(&pressures_pa);
    for (pressure_pa, samples) in pressures_pa.into_iter().zip(&rendered_cells) {
        // Lip resonance, damping, rest opening, bore geometry, and valves are
        // identical in every cell. Mouth pressure is the only changed input.
        let (fundamental_hz, periodicity) = estimate_f0(&samples, 48_000.0, 80.0, 800.0);
        let centroid_hz = spectral_centroid_hz(&samples);
        let level_rms = (samples.iter().map(|sample| sample * sample).sum::<f64>()
            / samples.len() as f64)
            .sqrt();
        let peak = samples
            .iter()
            .fold(0.0_f64, |current, sample| current.max(sample.abs()));
        eprintln!(
            "pressure={pressure_pa} f0={fundamental_hz} periodicity={periodicity} spectral_centroid={centroid_hz} rms={level_rms:e} peak={peak:e}"
        );
        pitches_hz.push(fundamental_hz);
        periodicities.push(periodicity);
        centroids_hz.push(centroid_hz);
        levels_rms.push(level_rms);
        peaks.push(peak);
    }
    assert!(
        periodicities.iter().all(|periodicity| *periodicity > 0.995),
        "unlocked pressure cells: {periodicities:?}"
    );
    assert!(
        pitches_hz.windows(2).all(|pair| pair[1] >= pair[0]),
        "unexpected pitch reversal: {pitches_hz:?}"
    );
    let loud_index = pressures_pa.len() - 1;
    let pitch_drift_cents = 1_200.0 * (pitches_hz[loud_index] / pitches_hz[0]).log2();
    assert!(
        pitch_drift_cents < 20.0,
        "pressure retuned the fixed geometry by {pitch_drift_cents} cents"
    );
    assert!(
        centroids_hz.windows(2).all(|pair| pair[1] > pair[0]),
        "brightness did not rise monotonically: {centroids_hz:?}"
    );
    assert!(
        centroids_hz[0] >= 1_400.0,
        "soft spectral centroid below 1400 Hz: {centroids_hz:?}"
    );
    assert!(
        centroids_hz[loud_index] >= 2_600.0,
        "loud spectral centroid below 2600 Hz: {centroids_hz:?}"
    );
    assert!(
        levels_rms.windows(2).all(|pair| pair[1] > pair[0]),
        "mouth pressure did not increase radiated level: {levels_rms:?}"
    );
    assert!(
        levels_rms.iter().all(|level| *level > 2.0e-5),
        "inaudible normal-regime pressure cells: {levels_rms:?}"
    );
    assert!(
        peaks.iter().all(|peak| *peak < 0.98),
        "unbounded normalized pressure cells: {peaks:?}"
    );
    let brightness_increase_hz = centroids_hz[loud_index] - centroids_hz[0];
    assert!(
        brightness_increase_hz >= 800.0,
        "pressure-driven brightness increase below 800 Hz: {centroids_hz:?}"
    );
    let brightness_increase_percent = 100.0 * brightness_increase_hz / centroids_hz[0];
    let level_increase_db = 20.0 * (levels_rms[loud_index] / levels_rms[0]).log10();
    eprintln!(
        "pressure-law pitch_drift={pitch_drift_cents}c brightness_increase={brightness_increase_hz}Hz ({brightness_increase_percent}%) level_increase={level_increase_db}dB"
    );

    let mut linear_parameters = TrumpetParameters::canonical();
    linear_parameters.nonlinear_coefficient = 0.0;
    let linear_soft = render_sustain([0.0; 3], pressures_pa[0], 250.0, linear_parameters);
    let linear_loud = render_sustain([0.0; 3], pressures_pa[loud_index], 250.0, linear_parameters);
    let linear_soft_centroid = spectral_centroid_hz(&linear_soft);
    let linear_loud_centroid = spectral_centroid_hz(&linear_loud);
    let linear_brightness_change_hz = linear_loud_centroid - linear_soft_centroid;
    eprintln!(
        "linear-control soft_centroid={linear_soft_centroid} loud_centroid={linear_loud_centroid} change={linear_brightness_change_hz}Hz"
    );
    assert!(
        linear_brightness_change_hz < 0.0,
        "zero-beta control unexpectedly manufactured brassiness: {linear_brightness_change_hz}Hz"
    );
    assert!(
        brightness_increase_hz - linear_brightness_change_hz > 100.0,
        "Menguy-Gilbert propagation had immaterial brightness effect: nonlinear {brightness_increase_hz}Hz, linear {linear_brightness_change_hz}Hz"
    );
}

#[test]
fn high_dynamic_state_releases_without_active_energy_growth() {
    let mut model = TrumpetModel::new(48_000.0, TrumpetParameters::canonical()).unwrap();
    let mut controls = TrumpetControls {
        mouth_pressure_pa: 0.0,
        lip_resonance_hz: 80.0,
        lip_damping_ratio: 0.28,
        equilibrium_opening_m: 0.00025,
        tongue_contact: 0.0,
        valves: [0.0; 3],
    };
    for frame in 0..24_000 {
        controls.mouth_pressure_pa = 8_500.0 * (frame as f64 / 1_440.0).min(1.0);
        model.process_sample(controls).unwrap_or_else(|error| {
            panic!(
                "high dynamic drive failed frame={frame} report={:?}: {error:?}",
                model.last_lip_report()
            )
        });
    }
    for release_frame in 0..1_440 {
        controls.mouth_pressure_pa = 8_500.0 * (1.0 - release_frame as f64 / 1_440.0);
        model.process_sample(controls).unwrap_or_else(|error| {
            panic!(
                "high dynamic release failed frame={release_frame} report={:?}: {error:?}",
                model.last_lip_report()
            )
        });
    }
    controls.mouth_pressure_pa = 0.0;
    let initial = model.stored_energy_j(controls);
    let mut maximum = initial;
    for _ in 0..9_600 {
        assert!(model.process_sample(controls).unwrap().is_finite());
        maximum = maximum.max(model.stored_energy_j(controls));
    }
    let final_energy = model.stored_energy_j(controls);
    eprintln!(
        "high-dynamic release energy initial={initial:e} maximum={maximum:e} final={final_energy:e}"
    );
    assert!(
        maximum <= initial * 1.05,
        "released nonlinear state created energy: {initial:e} -> {maximum:e}"
    );
    assert!(
        final_energy < initial * 0.25,
        "released nonlinear state failed to dissipate: {initial:e} -> {final_energy:e}"
    );
}

#[test]
fn valid_low_lip_cell_converges_for_a_full_sustain() {
    let samples = render_sustain([0.0; 3], 5_500.0, 100.0, TrumpetParameters::canonical());
    assert!(!samples.is_empty());
    assert!(samples.iter().all(|sample| sample.is_finite()));
}

#[test]
fn seeded_and_cold_start_paths_are_bounded() {
    for seeded in [false, true] {
        let mut model = TrumpetModel::new(48_000.0, TrumpetParameters::canonical()).unwrap();
        let mut controls = TrumpetControls {
            mouth_pressure_pa: 0.0,
            lip_resonance_hz: 250.0,
            lip_damping_ratio: 1.0 / 3.0,
            equilibrium_opening_m: 0.0,
            tongue_contact: 1.0,
            valves: [0.0; 3],
        };
        let mut peak = 0.0_f64;
        for frame in 0..24_000 {
            controls.mouth_pressure_pa = 8_500.0 * (frame as f64 / 1_440.0).min(1.0);
            if frame == 1_440 {
                if seeded {
                    model.seed_open_normal_regime(100.0).unwrap();
                }
                controls.tongue_contact = 0.0;
            }
            let sample = model.process_sample(controls).unwrap_or_else(|error| {
                panic!(
                    "start failed seeded={seeded} frame={frame} pressure={} report={:?}: {error:?}",
                    controls.mouth_pressure_pa,
                    model.last_lip_report()
                )
            });
            if frame > 9_600 {
                peak = peak.max(sample.abs());
            }
        }
        eprintln!("start seeded={seeded} peak={peak}");
        assert!(peak > 1.0e-5, "silent start path");
        assert!(peak < 0.98, "unbounded normalized start path: {peak}");
    }
}
