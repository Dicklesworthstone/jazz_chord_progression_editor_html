//! Independent narrow proof for the dark sample-free piano onset core.
//!
//! The production renderer is intentionally not imported: this test loads
//! only the reserved physical source, and every expected relation below is
//! stated independently of its private constants.

#[path = "../src/piano_v2.rs"]
mod piano_v2;

use libm::sqrt;
use piano_v2::{
    bridge_contact_pair_midpoint_step, duplex_length_m_for_midi, hammer_head_radius_m_for_midi,
    hammer_mass_kg_for_midi, hammer_strike_position_over_length, midi_frequency_hz,
    render_piano_note, soundboard_bridge_mode_residue_for_midi,
    soundboard_bridge_position_for_midi, soundboard_damping_ratio, soundboard_mode_frequency_hz,
    stiff_string_mode_frequency_hz, string_geometry, PianoError, PianoParameters, PianoStem,
    PianoStrike, PianoVoice, CONTACT_SOLVE_STEPS, MAXIMUM_BRIDGE_CONTACTS,
    MAXIMUM_BRIDGE_SOLVE_SCALAR_UPDATES, MAXIMUM_STATE_BYTES,
};

#[test]
fn reviewed_hammer_mass_and_strike_position_vary_by_register() {
    let anchors = [
        (21, 0.0130, 0.017, 243.0 / 2_016.0),
        (57, 0.0106, 0.011, 91.0 / 777.0),
        (60, 0.0089, 0.008, 74.4 / 620.0),
        (93, 0.0082, 0.005, 8.1 / 115.0),
    ];
    for (midi, expected_mass, expected_radius, expected_position) in anchors {
        assert!((hammer_mass_kg_for_midi(midi).unwrap() - expected_mass).abs() < 1.0e-15);
        assert!((hammer_head_radius_m_for_midi(midi).unwrap() - expected_radius).abs() < 1.0e-15);
        assert!(
            (hammer_strike_position_over_length(midi).unwrap() - expected_position).abs() < 1.0e-15
        );
    }
    assert!(hammer_mass_kg_for_midi(21).unwrap() > hammer_mass_kg_for_midi(93).unwrap());
    assert!(
        hammer_strike_position_over_length(21).unwrap()
            > hammer_strike_position_over_length(93).unwrap()
    );

    // The superseded implementation used one 52 g hammer for every key.
    // It is outside the measured grand-piano envelope and must fail closed.
    let geometry = string_geometry(60).unwrap();
    let mut planted_constant_mass =
        PianoStrike::from_velocity(80, 60, geometry.equivalent_diameter_m).unwrap();
    planted_constant_mass.hammer_mass_kg = 0.052;
    let mut voice = PianoVoice::new(60, 48_000.0, PianoParameters::canonical()).unwrap();
    assert_eq!(
        voice.begin_strike(planted_constant_mass),
        Err(PianoError::InvalidContact)
    );
}

#[test]
fn bridge_contact_midpoint_matches_an_independent_known_answer() {
    // Independently evaluated two-mode Hamiltonian:
    // H=.5(vs^2+ws^2*qs^2+vb^2+wb^2*qb^2)+.5*k(rs*qs-rb*qb)^2.
    let initial = [1.0e-5, 0.2, -2.0e-5, -0.1];
    let next =
        bridge_contact_pair_midpoint_step(1.0 / 48_000.0, 4.8e6, 220.0, 3.0, 180.0, 0.4, initial)
            .unwrap();
    let expected = [
        1.402_279_163_130_800_5e-5,
        0.186_187_996_605_568_45,
        -2.205_897_621_322_928_7e-5,
        -0.097_661_716_470_011_37,
    ];
    for (actual, expected) in next.into_iter().zip(expected) {
        assert!((actual - expected).abs() < 2.0e-15);
    }

    let energy = |state: [f64; 4]| {
        let dt = 1.0 / 48_000.0;
        let string_omega = 2.0 / dt * libm::tan(core::f64::consts::PI * 220.0 * dt);
        let body_omega = 2.0 / dt * libm::tan(core::f64::consts::PI * 180.0 * dt);
        0.5 * (state[1] * state[1]
            + string_omega * string_omega * state[0] * state[0]
            + state[3] * state[3]
            + body_omega * body_omega * state[2] * state[2])
            + 0.5 * 4.8e6 * (3.0 * state[0] - 0.4 * state[2]).powi(2)
    };
    assert!((energy(next) - energy(initial)).abs() < 1.0e-15);

    // Planted old velocity rotation: with both velocities zero it leaves the
    // state unchanged, so it cannot realize the nonzero contact force stored
    // by a displaced spring.
    let displaced = [1.0e-5, 0.0, -2.0e-5, 0.0];
    let advanced =
        bridge_contact_pair_midpoint_step(1.0 / 48_000.0, 4.8e6, 220.0, 3.0, 180.0, 0.4, displaced)
            .unwrap();
    assert!(advanced[1].abs() > 1.0e-4);
    assert!(advanced[3].abs() > 1.0e-4);
}

#[test]
fn separate_key_contacts_cannot_cancel_through_one_aggregate_port() {
    let parameters = PianoParameters::canonical();
    assert_eq!(parameters.bridge_contact_stiffness_n_per_m, 4.8e6);
    let mut stem = PianoStem::new(&[60, 64], &[1, 1], 48_000.0, parameters).unwrap();
    stem.set_test_key_bridge_displacement_m(0, 1.0e-5).unwrap();
    stem.set_test_key_bridge_displacement_m(1, -1.0e-5).unwrap();
    assert!((stem.bridge_contact_energy_j() - 4.8e-4).abs() < 2.0e-15);

    // The removed aggregate port sums the two displacements first and would
    // certify this physically strained state as exactly zero bridge energy.
    let old_aggregate_energy = 0.5 * 4.8e6 * (1.0e-5_f64 - 1.0e-5).powi(2);
    assert_eq!(old_aggregate_energy, 0.0);

    let receipt = PianoVoice::new(60, 48_000.0, parameters)
        .unwrap()
        .work_receipt();
    assert_eq!(receipt.maximum_bridge_contacts, 1);
    assert_eq!(MAXIMUM_BRIDGE_CONTACTS, 8);
    assert_eq!(
        receipt.maximum_bridge_solve_scalar_updates,
        MAXIMUM_BRIDGE_SOLVE_SCALAR_UPDATES
    );
}

#[test]
fn cooperative_pressure_steps_preserve_the_full_energy_ledger() {
    let parameters = PianoParameters::canonical();
    let mut audited = PianoStem::new(&[60, 64], &[81, 73], 48_000.0, parameters).unwrap();
    let mut cooperative = audited.clone();

    // The removed bug applied both modal half-losses on this path but did not
    // add their exact kinetic-energy decrease to cumulative_loss_j. PCM and
    // retained modal state therefore stayed bit-identical while the energy
    // audit silently drifted.
    for _ in 0..255 {
        audited.step().unwrap();
        cooperative.step_render_pressure_for_test().unwrap();
    }
    assert_eq!(
        cooperative.represented_energy_j().to_bits(),
        audited.represented_energy_j().to_bits()
    );
    assert_eq!(
        cooperative.cumulative_loss_j_for_test().to_bits(),
        audited.cumulative_loss_j_for_test().to_bits()
    );

    // A full boundary audit after the cooperative slice must remain exactly
    // the same continuation, including the public cumulative-loss report.
    let audited_output = audited.step().unwrap();
    let cooperative_output = cooperative.step().unwrap();
    assert_eq!(
        cooperative_output.left_pressure_pa.to_bits(),
        audited_output.left_pressure_pa.to_bits()
    );
    assert_eq!(
        cooperative_output.right_pressure_pa.to_bits(),
        audited_output.right_pressure_pa.to_bits()
    );
    assert_eq!(
        cooperative_output.cumulative_loss_j.to_bits(),
        audited_output.cumulative_loss_j.to_bits()
    );
}

fn cents(actual: f64, expected: f64) -> f64 {
    1_200.0 * libm::log2(actual / expected)
}

fn rms(samples: &[f32]) -> f64 {
    libm::sqrt(
        samples
            .iter()
            .map(|sample| (*sample as f64) * (*sample as f64))
            .sum::<f64>()
            / samples.len().max(1) as f64,
    )
}

fn normalized_centroid(samples: &[f32], sample_rate_hz: f64) -> f64 {
    let size = 2_048.min(samples.len());
    let mut weighted = 0.0;
    let mut total = 0.0;
    for bin in 1..size / 2 {
        let mut real = 0.0;
        let mut imaginary = 0.0;
        for index in 0..size {
            let window = 0.5
                - 0.5
                    * libm::cos(
                        2.0 * core::f64::consts::PI * index as f64
                            / (size.saturating_sub(1)) as f64,
                    );
            let angle = 2.0 * core::f64::consts::PI * bin as f64 * index as f64 / size as f64;
            let sample = samples[index] as f64 * window;
            real += sample * libm::cos(angle);
            imaginary -= sample * libm::sin(angle);
        }
        let power = real * real + imaginary * imaginary;
        let frequency = bin as f64 * sample_rate_hz / size as f64;
        weighted += frequency * power;
        total += power;
    }
    weighted / total.max(1.0e-30)
}

fn normalized_stereo_centroid(left: &[f32], right: &[f32], sample_rate_hz: f64) -> f64 {
    let size = 2_048.min(left.len()).min(right.len());
    let mut weighted = 0.0;
    let mut total = 0.0;
    for bin in 1..size / 2 {
        let mut left_real = 0.0;
        let mut left_imaginary = 0.0;
        let mut right_real = 0.0;
        let mut right_imaginary = 0.0;
        for index in 0..size {
            let window = 0.5
                - 0.5
                    * libm::cos(
                        2.0 * core::f64::consts::PI * index as f64
                            / (size.saturating_sub(1)) as f64,
                    );
            let angle = 2.0 * core::f64::consts::PI * bin as f64 * index as f64 / size as f64;
            let left_sample = left[index] as f64 * window;
            let right_sample = right[index] as f64 * window;
            left_real += left_sample * libm::cos(angle);
            left_imaginary -= left_sample * libm::sin(angle);
            right_real += right_sample * libm::cos(angle);
            right_imaginary -= right_sample * libm::sin(angle);
        }
        let power = left_real * left_real
            + left_imaginary * left_imaginary
            + right_real * right_real
            + right_imaginary * right_imaginary;
        let frequency = bin as f64 * sample_rate_hz / size as f64;
        weighted += frequency * power;
        total += power;
    }
    weighted / total.max(1.0e-30)
}

fn string_energy_centroid_hz(voice: &PianoVoice) -> f64 {
    let mut weighted = 0.0;
    let mut total = 0.0;
    for string_index in 0..3 {
        for mode_index in 0..24 {
            let Some(energy) = voice.string_mode_energy_j(string_index, mode_index) else {
                continue;
            };
            let frequency = voice
                .string_mode_frequency_hz(string_index, mode_index)
                .expect("active modal energy has an active frequency");
            weighted += energy * frequency;
            total += energy;
        }
    }
    weighted / total.max(1.0e-30)
}

fn soundboard_energy_centroid_hz(voice: &PianoVoice) -> f64 {
    let mut weighted = 0.0;
    let mut total = 0.0;
    for mode_index in 0..piano_v2::SOUNDBOARD_MODES {
        let Some(energy) = voice.soundboard_mode_energy_j(mode_index) else {
            continue;
        };
        let frequency = voice
            .soundboard_mode_frequency_hz(mode_index)
            .expect("active modal energy has an active frequency");
        weighted += energy * frequency;
        total += energy;
    }
    weighted / total.max(1.0e-30)
}

#[test]
fn string_pack_is_geometry_derived_and_keeps_the_measured_fundamental() {
    let low = string_geometry(21).unwrap();
    let middle = string_geometry(60).unwrap();
    let high = string_geometry(108).unwrap();

    assert_eq!(low.string_count, 1);
    assert_eq!(string_geometry(32).unwrap().string_count, 2);
    assert_eq!(string_geometry(49).unwrap().string_count, 3);
    assert!(low.speaking_length_m > middle.speaking_length_m);
    assert!(middle.speaking_length_m > high.speaking_length_m);
    assert!((duplex_length_m_for_midi(33).unwrap() - 0.11).abs() < 1.0e-15);
    assert!((duplex_length_m_for_midi(62).unwrap() - 0.15).abs() < 1.0e-15);
    assert!((duplex_length_m_for_midi(74).unwrap() - 0.05).abs() < 1.0e-15);
    for midi in [21, 33, 60, 62, 74, 96, 108] {
        let geometry = string_geometry(midi).unwrap();
        assert_eq!(
            geometry.duplex_length_m,
            duplex_length_m_for_midi(midi).unwrap()
        );
        assert!(
            (geometry.total_length_m - geometry.speaking_length_m - geometry.duplex_length_m).abs()
                < 1.0e-15
        );
        let reviewed_bridge_coordinate = geometry.speaking_length_m / geometry.total_length_m;
        assert!((0.5..1.0).contains(&reviewed_bridge_coordinate));
        // The removed fixed 1.8%-from-end port does not reproduce the
        // reviewed duplex afterlength at any of the three measured anchors.
        assert!((reviewed_bridge_coordinate - 0.982).abs() > 0.02);
    }
    assert!(low.linear_density_kg_m > middle.linear_density_kg_m);
    assert!(middle.linear_density_kg_m > high.linear_density_kg_m);
    assert!(low.equivalent_diameter_m > high.equivalent_diameter_m);
    // Stulov table 1 is independently literal here. The reported values are
    // rounded, so production consumes T/mu/diameter exactly and derives the
    // causally tuned length, which must remain within 0.7% of the table row.
    for (midi, reported_length_m, tension_n, density_kg_m, diameter_m) in [
        (21, 2.016, 1_629.0, 0.1307, 0.0049),
        (57, 0.777, 834.0, 0.0071, 0.001_075),
        (60, 0.620, 670.0, 0.0063, 0.001_025),
        (93, 0.115, 774.0, 0.0047, 0.000_875),
    ] {
        let geometry = string_geometry(midi).unwrap();
        assert!((geometry.tension_n - tension_n).abs() < 1.0e-12);
        assert!((geometry.linear_density_kg_m - density_kg_m).abs() < 1.0e-15);
        assert!((geometry.equivalent_diameter_m - diameter_m).abs() < 1.0e-15);
        assert!(
            ((geometry.speaking_length_m / reported_length_m) - 1.0).abs() < 0.007,
            "derived length no longer agrees with rounded Table-I row: midi={midi}, derived={}, reported={reported_length_m}",
            geometry.speaking_length_m,
        );
        let table_pitch_hz = sqrt(tension_n / density_kg_m) / (2.0 * reported_length_m);
        assert!(
            cents(table_pitch_hz, midi_frequency_hz(midi)).abs() < 15.0,
            "rounded table row no longer describes the named key: midi={midi}, table={table_pitch_hz}"
        );
    }

    for midi in 21..=108 {
        let geometry = string_geometry(midi).unwrap();
        let geometry_pitch_hz = sqrt(geometry.tension_n / geometry.linear_density_kg_m)
            / (2.0 * geometry.speaking_length_m);
        assert!(
            cents(geometry_pitch_hz, geometry.fundamental_hz).abs() < 1.0e-9,
            "string geometry silently retunes a non-causal length: midi={midi}, physical={geometry_pitch_hz}, target={}",
            geometry.fundamental_hz,
        );
        let fundamental = stiff_string_mode_frequency_hz(
            geometry.unison_frequencies_hz[0],
            geometry.inharmonicity_coefficient,
            1,
        );
        assert!(cents(fundamental, geometry.unison_frequencies_hz[0]).abs() < 1.0e-9);
        let fourth = stiff_string_mode_frequency_hz(
            geometry.unison_frequencies_hz[0],
            geometry.inharmonicity_coefficient,
            4,
        );
        let planted_harmonic_sine_bank = 4.0 * geometry.unison_frequencies_hz[0];
        assert!(fourth > planted_harmonic_sine_bank);
        assert!(cents(fourth, planted_harmonic_sine_bank) > 0.0);
        // Any fixed linear post-EQ can change a sine bank's amplitudes but
        // cannot move its spectral lines.  Its fourth remains exactly 4*f1,
        // so the same planted near-miss also rejects a post-EQ harmonic bank.
        let planted_post_eq_fourth = planted_harmonic_sine_bank;
        assert!(fourth > planted_post_eq_fourth);
        assert!(geometry.inharmonicity_coefficient > 0.0);
        assert!((geometry.fundamental_hz - midi_frequency_hz(midi)).abs() < 1.0e-12);
    }

    let treble = string_geometry(84).unwrap();
    assert!(treble.unison_frequencies_hz[0] < treble.unison_frequencies_hz[1]);
    assert!(treble.unison_frequencies_hz[1] < treble.unison_frequencies_hz[2]);
}

#[test]
fn soundboard_active_modes_are_sorted_before_bandlimited_empty_slots() {
    let voice = PianoVoice::new(60, 8_000.0, PianoParameters::canonical()).unwrap();
    let mut saw_empty = false;
    for index in 0..piano_v2::SOUNDBOARD_MODES {
        match voice.soundboard_mode_frequency_hz(index) {
            Some(frequency_hz) => {
                assert!(
                    !saw_empty,
                    "an active soundboard mode followed an inactive slot"
                );
                assert!(frequency_hz < 0.44 * 8_000.0);
            }
            None => saw_empty = true,
        }
    }
    assert!(
        saw_empty,
        "8 kHz fixture did not exercise band-edge mode culling"
    );
}

#[test]
fn orthotropic_soundboard_obeys_independent_scaling_laws() {
    let base = PianoParameters::canonical();
    assert_eq!(base.soundboard_length_m, 1.66);
    assert_eq!(base.soundboard_width_m, 1.39);
    assert_eq!(base.soundboard_thickness_m, 0.008);
    assert_eq!(base.soundboard_density_kg_m3, 600.0);
    assert_eq!(base.soundboard_longitudinal_modulus_pa, 17.1e9);
    assert_eq!(base.soundboard_radial_modulus_pa, 1.04e9);
    assert_eq!(base.soundboard_shear_modulus_pa, 1.0e9);
    assert_eq!(base.soundboard_poisson_ratio, 0.37);
    assert_eq!(
        piano_v2::DIRECT_STRING_RADIATION_SCALE,
        0.0,
        "the audible tap must not bypass the bridge/soundboard mobility"
    );
    for (frequency, expected) in [
        (75.0, 0.040),
        (118.8, 0.034),
        (145.3, 0.019),
        (182.8, 0.024),
        (242.2, 0.025),
        (260.9, 0.018),
    ] {
        assert!((soundboard_damping_ratio(frequency).unwrap() - expected).abs() < 1.0e-15);
    }
    assert_eq!(
        soundboard_damping_ratio(0.0),
        Err(PianoError::InvalidParameters)
    );
    let base_frequency = soundboard_mode_frequency_hz(base, 1, 1).unwrap();
    assert!(base_frequency > 10.0 && base_frequency < 500.0);

    let mut thicker = base;
    thicker.soundboard_thickness_m *= 1.10;
    thicker.soundboard_rib_height_m *= 1.10;
    let thick_frequency = soundboard_mode_frequency_hz(thicker, 1, 1).unwrap();
    assert!((thick_frequency / base_frequency - 1.10).abs() < 1.0e-12);

    let mut denser = base;
    denser.soundboard_density_kg_m3 *= 1.10;
    let dense_frequency = soundboard_mode_frequency_hz(denser, 1, 1).unwrap();
    assert!((dense_frequency / base_frequency - 1.0 / libm::sqrt(1.10)).abs() < 1.0e-12);

    let mut longer = base;
    longer.soundboard_length_m *= 1.10;
    assert!(soundboard_mode_frequency_hz(longer, 1, 1).unwrap() < base_frequency);

    let mut stiffer = base;
    stiffer.soundboard_longitudinal_modulus_pa *= 1.25;
    assert!(
        soundboard_mode_frequency_hz(stiffer, 2, 1).unwrap()
            > soundboard_mode_frequency_hz(base, 2, 1).unwrap()
    );

    let mut taller_ribs = base;
    taller_ribs.soundboard_rib_height_m *= 1.10;
    assert!(soundboard_mode_frequency_hz(taller_ribs, 1, 1).unwrap() > base_frequency);
}

#[test]
fn reviewed_bridge_points_drive_distinct_modal_ports() {
    let anchors = [
        (33, (0.783_324_033, 0.422_623_497)),
        (62, (0.268_679_391, 0.468_071_366)),
        (74, (0.134_417_067, 0.367_852_230)),
    ];
    for (midi, expected) in anchors {
        let actual = soundboard_bridge_position_for_midi(midi).unwrap();
        assert!((actual.0 - expected.0).abs() < 1.0e-12);
        assert!((actual.1 - expected.1).abs() < 1.0e-12);
    }
    let parameters = PianoParameters::canonical();
    let residues = anchors
        .map(|(midi, _)| soundboard_bridge_mode_residue_for_midi(parameters, midi, 2, 3).unwrap());
    assert!((residues[0] - residues[1]).abs() > 0.01);
    assert!((residues[1] - residues[2]).abs() > 0.01);
    assert_eq!(
        soundboard_bridge_position_for_midi(20),
        Err(PianoError::InvalidMidi)
    );
}

#[test]
fn baffled_modal_observer_matches_independent_plane_integrals() {
    let length = 1.90;
    let width = 1.38;
    let (uniform_re, uniform_im) =
        piano_v2::modal_plane_integral_m2(1, 1, length, width, 0.0, 0.0, 0.0).unwrap();
    let exact_uniform = 4.0 * length * width / (core::f64::consts::PI.powi(2));
    assert!((uniform_re - exact_uniform).abs() < 1.0e-14);
    assert!(uniform_im.abs() < 1.0e-14);

    let (even_re, even_im) =
        piano_v2::modal_plane_integral_m2(2, 1, length, width, 0.0, 0.0, 0.0).unwrap();
    assert!(even_re.abs() < 1.0e-14);
    assert!(even_im.abs() < 1.0e-14);

    let wave_number = 13.7;
    let direction_x = 0.31;
    let direction_y = -0.17;
    let (analytic_re, analytic_im) = piano_v2::modal_plane_integral_m2(
        2,
        3,
        length,
        width,
        wave_number,
        direction_x,
        direction_y,
    )
    .unwrap();
    let cells_x = 480usize;
    let cells_y = 360usize;
    let dx = length / cells_x as f64;
    let dy = width / cells_y as f64;
    let mut numeric_re = 0.0;
    let mut numeric_im = 0.0;
    for cell_y in 0..cells_y {
        let y = (cell_y as f64 + 0.5) * dy;
        let centered_y = y - 0.5 * width;
        let shape_y = libm::sin(3.0 * core::f64::consts::PI * y / width);
        for cell_x in 0..cells_x {
            let x = (cell_x as f64 + 0.5) * dx;
            let centered_x = x - 0.5 * length;
            let shape = shape_y * libm::sin(2.0 * core::f64::consts::PI * x / length);
            let phase = -wave_number * (direction_x * centered_x + direction_y * centered_y);
            numeric_re += shape * libm::cos(phase) * dx * dy;
            numeric_im += shape * libm::sin(phase) * dx * dy;
        }
    }
    assert!((analytic_re - numeric_re).abs() < 2.0e-5);
    assert!((analytic_im - numeric_im).abs() < 2.0e-5);

    assert_eq!(
        piano_v2::modal_plane_integral_m2(1, 1, length, width, 1.0, 1.0, 1.0),
        Err(PianoError::InvalidParameters)
    );
}

#[test]
fn finite_hammer_contact_and_bridge_never_create_represented_energy() {
    let parameters = PianoParameters::canonical();
    let diameter = string_geometry(60).unwrap().equivalent_diameter_m;
    let strike = PianoStrike::from_velocity(108, 60, diameter).unwrap();
    let mut voice = PianoVoice::new(60, 48_000.0, parameters).unwrap();
    voice.begin_strike(strike).unwrap();
    let initial = voice.represented_energy_j();
    assert!((initial - strike.impact_energy_j).abs() < 1.0e-12);

    let mut maximum = initial;
    let mut maximum_body = 0.0_f64;
    let mut maximum_string = 0.0_f64;
    let mut energized_modes = 0usize;
    for frame in 0..4_800 {
        let output = voice.step().unwrap();
        maximum = maximum.max(voice.represented_energy_j());
        assert!(voice.accounted_energy_j() <= initial + 2.0e-9);
        maximum_body = maximum_body.max(output.soundboard_energy_j);
        maximum_string = maximum_string.max(output.string_energy_j);
        if frame == 1_000 {
            energized_modes = (0..24)
                .filter(|mode| voice.string_mode_energy_j(0, *mode).unwrap_or(0.0) > 1.0e-10)
                .count();
        }
        let receipt = voice.work_receipt();
        assert!(receipt.last_contact_iterations <= CONTACT_SOLVE_STEPS);
        assert!(
            receipt.total_contact_iterations <= (frame as u64 + 1) * CONTACT_SOLVE_STEPS as u64
        );
    }
    assert!(
        maximum <= initial + 2.0e-10,
        "created energy: {maximum} > {initial}"
    );
    assert!(maximum_string > 1.0e-4 * initial);
    assert!(maximum_body > 1.0e-8 * initial);
    assert!(
        energized_modes >= 4,
        "collapsed to {energized_modes} string modes"
    );
    assert!(voice.work_receipt().state_bytes <= MAXIMUM_STATE_BYTES);
}

#[test]
fn malformed_or_active_parameters_refuse_and_force_cap_releases_dissipatively() {
    let mut active_bridge = PianoParameters::canonical();
    active_bridge.bridge_contact_stiffness_n_per_m = -1.0;
    assert_eq!(
        PianoVoice::new(60, 48_000.0, active_bridge).unwrap_err(),
        PianoError::InvalidParameters
    );

    let mut impossible_board = PianoParameters::canonical();
    impossible_board.soundboard_density_kg_m3 = 0.0;
    assert_eq!(
        PianoVoice::new(60, 48_000.0, impossible_board).unwrap_err(),
        PianoError::InvalidParameters
    );

    let mut missing_ribs = PianoParameters::canonical();
    missing_ribs.soundboard_rib_count = 0;
    assert_eq!(
        PianoVoice::new(60, 48_000.0, missing_ribs).unwrap_err(),
        PianoError::InvalidParameters
    );

    let parameters = PianoParameters::canonical();
    let diameter = string_geometry(60).unwrap().equivalent_diameter_m;
    let mut inconsistent = PianoStrike::from_velocity(80, 60, diameter).unwrap();
    inconsistent.impact_energy_j *= 0.5;
    let mut voice = PianoVoice::new(60, 48_000.0, parameters).unwrap();
    let valid = PianoStrike::from_velocity(80, 60, diameter).unwrap();
    voice.begin_strike(valid).unwrap();
    for _ in 0..4 {
        voice.step().unwrap();
    }
    let accounted_before_refused_retrigger = voice.accounted_energy_j();
    assert_eq!(voice.begin_strike(valid), Err(PianoError::InvalidContact));
    assert_eq!(
        voice.accounted_energy_j(),
        accounted_before_refused_retrigger,
        "a refused retrigger duplicated the retained contact-loss ledger"
    );
    while voice.contact_active() {
        voice.step().unwrap();
    }
    assert_eq!(
        voice.begin_strike(inconsistent),
        Err(PianoError::InvalidContact)
    );

    let mut capped = PianoStrike::from_velocity(80, 60, diameter).unwrap();
    capped.maximum_force_n = 1.0e-9;
    voice.begin_strike(capped).unwrap();
    let before = voice.represented_energy_j();
    voice.step().unwrap();
    assert!(!voice.contact_active());
    assert!(voice.represented_energy_j() <= before + 1.0e-12);
    assert!(voice.accounted_energy_j() >= before - 1.0e-9);

    let mut linear_felt = PianoStrike::from_velocity(80, 60, diameter).unwrap();
    linear_felt.felt_exponent = 1.0;
    assert_eq!(
        voice.begin_strike(linear_felt),
        Err(PianoError::InvalidContact)
    );
}

#[test]
fn state_continuation_is_bit_deterministic() {
    let parameters = PianoParameters::canonical();
    let mut voice = PianoVoice::new(64, 48_000.0, parameters).unwrap();
    voice
        .begin_strike(
            PianoStrike::from_velocity(91, 64, string_geometry(64).unwrap().equivalent_diameter_m)
                .unwrap(),
        )
        .unwrap();
    for _ in 0..777 {
        voice.step().unwrap();
    }
    let mut clone = voice.clone();
    for _ in 0..2_048 {
        assert_eq!(voice.step().unwrap(), clone.step().unwrap());
    }
    assert_eq!(voice.work_receipt(), clone.work_receipt());
}

#[test]
fn render_is_finite_audible_bounded_and_hard_strikes_are_brighter() {
    for sample_rate in [44_100.0, 48_000.0, 96_000.0] {
        for midi in [21, 60, 84, 108] {
            let frames = (0.20 * sample_rate) as usize;
            let mut left = vec![0.0_f32; frames];
            let mut right = vec![0.0_f32; frames];
            assert_eq!(
                render_piano_note(midi, 100, sample_rate, &mut left, &mut right).unwrap(),
                frames
            );
            assert!(left.iter().chain(&right).all(|sample| sample.is_finite()));
            let peak = left
                .iter()
                .chain(&right)
                .fold(0.0_f32, |maximum, sample| maximum.max(sample.abs()));
            assert!(peak > 1.0e-7, "silent m{midi} @{sample_rate}");
            assert!(peak < 0.98, "unbounded m{midi} @{sample_rate}: {peak}");
            assert!(rms(&left) > 1.0e-8);
            assert_ne!(left, right, "soundboard observers collapsed to mono");
        }
    }

    let frames = 4_096;
    let parameters = PianoParameters::canonical();
    let diameter = string_geometry(60).unwrap().equivalent_diameter_m;
    let mut soft_voice = PianoVoice::new(60, 48_000.0, parameters).unwrap();
    soft_voice
        .begin_strike(PianoStrike::from_velocity(24, 60, diameter).unwrap())
        .unwrap();
    let mut hard_voice = PianoVoice::new(60, 48_000.0, parameters).unwrap();
    hard_voice
        .begin_strike(PianoStrike::from_velocity(120, 60, diameter).unwrap())
        .unwrap();
    let mut soft_contact_frames = 0usize;
    let mut hard_contact_frames = 0usize;
    let mut soft_separation_centroid = None;
    let mut hard_separation_centroid = None;
    for frame in 0..1_024 {
        let soft_was_active = soft_voice.contact_active();
        let hard_was_active = hard_voice.contact_active();
        soft_voice.step().unwrap();
        hard_voice.step().unwrap();
        if soft_voice.contact_active() {
            soft_contact_frames = frame + 1;
        }
        if hard_voice.contact_active() {
            hard_contact_frames = frame + 1;
        }
        if soft_was_active && !soft_voice.contact_active() {
            soft_separation_centroid = Some(string_energy_centroid_hz(&soft_voice));
        }
        if hard_was_active && !hard_voice.contact_active() {
            hard_separation_centroid = Some(string_energy_centroid_hz(&hard_voice));
        }
    }
    let soft_contact_centroid = soft_separation_centroid.expect("soft hammer never separated");
    let hard_contact_centroid = hard_separation_centroid.expect("hard hammer never separated");
    let soft_string_centroid = string_energy_centroid_hz(&soft_voice);
    let hard_string_centroid = string_energy_centroid_hz(&hard_voice);
    let soft_board_centroid = soundboard_energy_centroid_hz(&soft_voice);
    let hard_board_centroid = soundboard_energy_centroid_hz(&hard_voice);
    assert!(
        hard_contact_centroid > 1.04 * soft_contact_centroid,
        "felt contact itself did not brighten at separation: soft={soft_contact_centroid}, hard={hard_contact_centroid}, late={soft_string_centroid}/{hard_string_centroid}, contact_frames={soft_contact_frames}/{hard_contact_frames}"
    );
    assert!(
        hard_board_centroid > 1.03 * soft_board_centroid,
        "bridge erased felt brightness: board={soft_board_centroid}/{hard_board_centroid}, string={soft_string_centroid}/{hard_string_centroid}"
    );

    let mut soft_left = vec![0.0_f32; frames];
    let mut soft_right = vec![0.0_f32; frames];
    let mut hard_left = vec![0.0_f32; frames];
    let mut hard_right = vec![0.0_f32; frames];
    render_piano_note(60, 24, 48_000.0, &mut soft_left, &mut soft_right).unwrap();
    render_piano_note(60, 120, 48_000.0, &mut hard_left, &mut hard_right).unwrap();
    let soft_centroid = normalized_centroid(&soft_left, 48_000.0);
    let hard_centroid = normalized_centroid(&hard_left, 48_000.0);
    let soft_right_centroid = normalized_centroid(&soft_right, 48_000.0);
    let hard_right_centroid = normalized_centroid(&hard_right, 48_000.0);
    let soft_stereo_centroid = normalized_stereo_centroid(&soft_left, &soft_right, 48_000.0);
    let hard_stereo_centroid = normalized_stereo_centroid(&hard_left, &hard_right, 48_000.0);
    let soft_attack_centroid = normalized_centroid(&soft_left[..512], 48_000.0);
    let hard_attack_centroid = normalized_centroid(&hard_left[..512], 48_000.0);
    let level_ratio = rms(&hard_left) / rms(&soft_left);
    let planted_level_only_hard: Vec<f32> = soft_left
        .iter()
        .map(|sample| (*sample as f64 * level_ratio) as f32)
        .collect();
    let planted_level_only_centroid = normalized_centroid(&planted_level_only_hard, 48_000.0);
    assert!(
        (planted_level_only_centroid - soft_centroid).abs() < 1.0e-3,
        "level-only/post-gain near-miss changed normalized spectrum"
    );
    assert!(
        hard_stereo_centroid > 1.04 * soft_stereo_centroid,
        "felt contact did not brighten: left={soft_centroid}/{hard_centroid}, right={soft_right_centroid}/{hard_right_centroid}, stereo={soft_stereo_centroid}/{hard_stereo_centroid}, attack={soft_attack_centroid}/{hard_attack_centroid}, planted_level_only={planted_level_only_centroid}, string={soft_string_centroid}/{hard_string_centroid}, board={soft_board_centroid}/{hard_board_centroid}, contact_frames={soft_contact_frames}/{hard_contact_frames}"
    );
    assert!(rms(&hard_left) > rms(&soft_left));
}
