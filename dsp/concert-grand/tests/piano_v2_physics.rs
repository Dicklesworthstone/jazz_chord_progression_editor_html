//! Independent narrow proof for the dark sample-free piano onset core.
//!
//! The production renderer is intentionally not imported: this test loads
//! only the reserved physical source, and every expected relation below is
//! stated independently of its private constants.

#[path = "../src/piano_v2.rs"]
mod piano_v2;

use libm::sqrt;
use piano_v2::piano_v2_scale::{reviewed_string_scale_row, REVIEWED_STRING_SCALE};
use piano_v2::piano_v2_soundboard::PIANO_V2_SOUNDBOARD_MODE_PACK;
use piano_v2::{
    bridge_contact_pair_midpoint_step, component_string_reduction_snapshot,
    duplex_length_m_for_midi, hammer_head_radius_m_for_midi, hammer_mass_kg_for_midi,
    hammer_strike_position_over_length, midi_frequency_hz, render_piano_note,
    separate_unison_bridge_contact_coordinates, soundboard_bridge_mode_residue_for_midi,
    soundboard_bridge_position_for_midi, soundboard_damping_ratio, soundboard_mode_frequency_hz,
    stiff_string_mode_frequency_hz, string_geometry, stulov_felt_force_n,
    stulov_felt_parameters_for_midi, PianoError, PianoParameters, PianoStem, PianoStrike,
    PianoVoice, CONTACT_SOLVE_STEPS, MAXIMUM_BRIDGE_CONTACTS, MAXIMUM_BRIDGE_SOLVE_SCALAR_UPDATES,
    MAXIMUM_STATE_BYTES,
};

#[test]
fn component_string_reduction_has_the_reviewed_mass_law_and_bounded_eigenpairs() {
    const MODES: usize = 24;
    const SPEAKING_MODES: usize = 20;
    let midi = 96;
    let geometry = string_geometry(midi).unwrap();
    let snapshot = component_string_reduction_snapshot(midi, 0).unwrap();
    let mu = geometry.linear_density_kg_m;
    let speaking = geometry.speaking_length_m;
    let duplex = geometry.duplex_length_m;
    let second_moment = core::f64::consts::PI * geometry.equivalent_diameter_m.powi(4) / 64.0;
    let bending_tension_equivalent = core::f64::consts::PI.powi(2) * 2.02e11 * second_moment
        / geometry.speaking_length_m.powi(2);
    let tension = (geometry.tension_n + bending_tension_equivalent)
        * (geometry.unison_frequencies_hz[0] / geometry.fundamental_hz).powi(2)
        - bending_tension_equivalent;

    // Independently integrated Craig--Bampton constraint/sine products.
    // The bridge coordinate is x/L on the speaking segment and 1-x/L on
    // the duplex segment. A global fixed-fixed sine bank does not have this
    // exact coordinate and was the planted treble-detuning near miss.
    assert!((snapshot.mass[0][0] - mu * (speaking + duplex) / 3.0).abs() < 1.0e-15);
    assert!((snapshot.mass[0][1] - mu * speaking / core::f64::consts::PI).abs() < 1.0e-15);
    assert!((snapshot.mass[0][2] + mu * speaking / (2.0 * core::f64::consts::PI)).abs() < 1.0e-15);
    assert!(
        (snapshot.mass[0][1 + SPEAKING_MODES] - mu * duplex / core::f64::consts::PI).abs()
            < 1.0e-15
    );
    assert!(
        (snapshot.stiffness_diagonal[0] - tension * (1.0 / speaking + 1.0 / duplex)).abs() < 1.0e-8
    );

    for row in 0..MODES {
        assert!(snapshot.mass[row][row] > 0.0);
        assert!(snapshot.stiffness_diagonal[row] > 0.0);
        for column in 0..MODES {
            assert_eq!(snapshot.mass[row][column], snapshot.mass[column][row]);
        }
    }
    for pair in snapshot.frequencies_hz.windows(2) {
        assert!(pair[0] > 0.0 && pair[0] < pair[1]);
    }

    // This is a generalized Kq=lambda Mq check over the emitted physical
    // vectors, not a comparison with production's transformed matrix. It
    // catches a wrong Cholesky orientation, eigenvector permutation, or a
    // mass/stiffness edit that leaves plausible-looking frequencies.
    for mode in 0..MODES {
        let vector = snapshot.eigenvectors[mode];
        let lambda = (2.0 * core::f64::consts::PI * snapshot.frequencies_hz[mode]).powi(2);
        let mut residual_squared = 0.0;
        let mut scale_squared = 0.0;
        for row in 0..MODES {
            let mass_product = (0..MODES)
                .map(|column| snapshot.mass[row][column] * vector[column])
                .sum::<f64>();
            let stiffness_product = snapshot.stiffness_diagonal[row] * vector[row];
            let residual = stiffness_product - lambda * mass_product;
            residual_squared += residual * residual;
            scale_squared += stiffness_product * stiffness_product
                + lambda * lambda * mass_product * mass_product;
        }
        assert!(sqrt(residual_squared / scale_squared.max(1.0e-300)) < 2.0e-10);
        for other in 0..MODES {
            let other_vector = snapshot.eigenvectors[other];
            let mut mass_inner_product = 0.0;
            for row in 0..MODES {
                for column in 0..MODES {
                    mass_inner_product +=
                        vector[row] * snapshot.mass[row][column] * other_vector[column];
                }
            }
            let expected = if mode == other { 1.0 } else { 0.0 };
            assert!((mass_inner_product - expected).abs() < 2.0e-10);
        }
    }
}

#[test]
fn reviewed_hammer_mass_and_strike_position_vary_by_register() {
    let reviewed = [
        (21, 0.011_000_1, 0.017, 243.0 / 2_016.0),
        (57, 0.008_472_9, 0.011, 91.0 / 777.0),
        (60, 0.008_274, 0.008, 74.4 / 620.0),
        (93, 0.006_204_9, 0.005, 8.1 / 115.0),
    ];
    for (midi, expected_mass, expected_radius, expected_position) in reviewed {
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
fn stulov_all_key_felt_law_has_rate_hysteresis_and_refuses_elastic_near_miss() {
    // Stulov 2008 Eqs. (9)-(11), key n=49 (MIDI 69). These literals are
    // independently evaluated from the published polynomial/exponential fits.
    let parameters = stulov_felt_parameters_for_midi(69).unwrap();
    assert!((parameters[0] - 1_659.856_036_917_723_3).abs() < 2.0e-12);
    assert!((parameters[1] - 4.435).abs() < 2.0e-15);
    assert!((parameters[2] - 310.048_217_72e-6).abs() < 2.0e-16);
    assert!((hammer_mass_kg_for_midi(69).unwrap() - 0.007_688_1).abs() < 2.0e-15);

    let dt = 1.0 / 48_000.0;
    let loading = stulov_felt_force_n(
        parameters[0],
        parameters[1],
        parameters[2],
        0.000_2,
        0.000_25,
        dt,
    );
    let unloading = stulov_felt_force_n(
        parameters[0],
        parameters[1],
        parameters[2],
        0.000_25,
        0.000_2,
        dt,
    );
    let planted_elastic =
        stulov_felt_force_n(parameters[0], parameters[1], 0.0, 0.000_2, 0.000_25, dt);
    assert!((loading - 35.464_649_100_189_3).abs() < 2.0e-12);
    assert_eq!(unloading, 0.0, "unilateral felt pulled on the string");
    assert!((planted_elastic - 2.293_151_808_350_375).abs() < 2.0e-13);
    assert!(loading > 15.0 * planted_elastic);
    let hysteresis_work_j = loading * 0.000_05 + unloading * -0.000_05;
    assert!(hysteresis_work_j > 0.0);
    assert_eq!(
        planted_elastic * 0.000_05 + planted_elastic * -0.000_05,
        0.0,
        "the elastic near-miss unexpectedly produced a hysteresis loop"
    );
}

#[test]
fn mezzo_forte_contact_duration_matches_measured_c2_c4_c7_registers() {
    // Chaigne and Askenfelt (JASA 1994), part II, Fig. 2 / section I.A:
    // at a 2.5 m/s initial hammer speed the measured contact durations are
    // 3.1 ms (C2), 2.0 ms (C4), and 0.6 ms (C7); their simulation was within
    // six percent.  Keep a wider cross-instrument envelope here because the
    // live all-key Stulov fit comes from an independently measured Abel set,
    // but refuse a register-invariant or impulse-like contact.
    for (midi, measured_seconds, lower_seconds, upper_seconds) in [
        (36, 3.1e-3, 2.5e-3, 3.8e-3),
        (60, 2.0e-3, 1.5e-3, 2.6e-3),
        (96, 0.6e-3, 0.4e-3, 0.9e-3),
    ] {
        let geometry = string_geometry(midi).unwrap();
        let mut strike =
            PianoStrike::from_velocity(64, midi, geometry.equivalent_diameter_m).unwrap();
        strike.hammer_velocity_m_per_s = 2.5;
        strike.impact_energy_j =
            0.5 * strike.hammer_mass_kg * strike.hammer_velocity_m_per_s.powi(2);
        let sample_rate = 96_000.0;
        let mut voice = PianoVoice::new(midi, sample_rate, PianoParameters::canonical()).unwrap();
        voice.begin_strike(strike).unwrap();
        let mut frames = 0usize;
        while voice.contact_active() && frames < (0.020 * sample_rate) as usize {
            voice.step().unwrap();
            frames += 1;
        }
        let actual_seconds = frames as f64 / sample_rate;
        assert!(
            (lower_seconds..=upper_seconds).contains(&actual_seconds),
            "m{midi} contact={actual_seconds:.9}s, measured={measured_seconds:.9}s"
        );
    }
}

#[test]
fn fixed_soundboard_reduction_does_not_change_with_note_set_or_output_rate() {
    // The 1,226-mode offline board pack tops out below 12 kHz, so every source
    // mode is representable at both rates. The retained 288-mode board is one
    // instrument property: adding a second key must not silently turn the
    // first key into a different board, and caller rate must not do so either.
    assert!(
        PIANO_V2_SOUNDBOARD_MODE_PACK
            .windows(2)
            .all(|pair| pair[0].frequency_hz < pair[1].frequency_hz),
        "the runtime's cutoff and contiguous strata require a sorted unique pack"
    );
    for midi in [36, 60, 96] {
        let low = PianoVoice::new(midi, 44_100.0, PianoParameters::canonical()).unwrap();
        let high = PianoVoice::new(midi, 96_000.0, PianoParameters::canonical()).unwrap();
        let chord = PianoStem::new(
            &[midi, if midi == 60 { 67 } else { 60 }],
            &[64, 64],
            44_100.0,
            PianoParameters::canonical(),
        )
        .unwrap();
        let low_indices: Vec<_> = (0..288)
            .map(|index| low.soundboard_mode_pack_index(index).unwrap())
            .collect();
        let high_indices: Vec<_> = (0..288)
            .map(|index| high.soundboard_mode_pack_index(index).unwrap())
            .collect();
        let chord_indices: Vec<_> = (0..288)
            .map(|index| chord.soundboard_mode_pack_index_for_test(index).unwrap())
            .collect();
        assert_eq!(low_indices, high_indices, "m{midi} changed physical board");
        assert_eq!(low_indices, chord_indices, "m{midi} changed inside a chord");
    }
}

#[test]
fn fixed_string_reduction_does_not_change_across_release_output_rates() {
    for midi in [36, 60, 84, 96, 108] {
        let baseline = PianoVoice::new(midi, 44_100.0, PianoParameters::canonical()).unwrap();
        let expected: Vec<_> = (0..24)
            .filter_map(|index| baseline.string_mode_frequency_hz(0, index))
            .collect();
        for sample_rate in [48_000.0, 96_000.0] {
            let candidate =
                PianoVoice::new(midi, sample_rate, PianoParameters::canonical()).unwrap();
            let actual: Vec<_> = (0..24)
                .filter_map(|index| candidate.string_mode_frequency_hz(0, index))
                .collect();
            assert_eq!(
                actual, expected,
                "m{midi} changed string reduction at {sample_rate}"
            );
        }
    }
}

#[test]
fn fixed_string_reduction_preserves_contact_time_across_release_output_rates() {
    // A fixed continuous instrument can quantize separation by at most one
    // frame on either side of the comparison.  This test is deliberately in
    // seconds rather than samples: retaining the same modal frequency list is
    // not sufficient if the time-step/contact path still changes the hammer.
    fn contact_duration_seconds(midi: i32, sample_rate_hz: f64) -> f64 {
        let geometry = string_geometry(midi).unwrap();
        let mut strike =
            PianoStrike::from_velocity(64, midi, geometry.equivalent_diameter_m).unwrap();
        strike.hammer_velocity_m_per_s = 2.5;
        strike.impact_energy_j =
            0.5 * strike.hammer_mass_kg * strike.hammer_velocity_m_per_s.powi(2);
        let mut voice =
            PianoVoice::new(midi, sample_rate_hz, PianoParameters::canonical()).unwrap();
        voice.begin_strike(strike).unwrap();
        let mut frames = 0usize;
        while voice.contact_active() && frames < (0.020 * sample_rate_hz) as usize {
            voice.step().unwrap();
            frames += 1;
        }
        assert!(!voice.contact_active(), "m{midi} contact did not separate");
        frames as f64 / sample_rate_hz
    }

    for midi in [36, 60, 96] {
        let baseline = contact_duration_seconds(midi, 44_100.0);
        for sample_rate_hz in [48_000.0, 96_000.0] {
            let candidate = contact_duration_seconds(midi, sample_rate_hz);
            let quantization_bound = 1.0 / 44_100.0 + 1.0 / sample_rate_hz;
            assert!(
                (candidate - baseline).abs() <= quantization_bound + 1.0e-12,
                "m{midi} contact changed from {baseline:.9}s at 44100 Hz to \
                 {candidate:.9}s at {sample_rate_hz} Hz"
            );
        }
    }
}

#[test]
fn coupled_string_hammer_port_keeps_the_notated_pitch() {
    fn goertzel_power(samples: &[f64], sample_rate_hz: f64, frequency_hz: f64) -> f64 {
        let coefficient =
            2.0 * libm::cos(2.0 * core::f64::consts::PI * frequency_hz / sample_rate_hz);
        let mut previous = 0.0;
        let mut before_previous = 0.0;
        for (index, sample) in samples.iter().copied().enumerate() {
            let taper = if samples.len() > 1 {
                0.5 - 0.5
                    * libm::cos(
                        2.0 * core::f64::consts::PI * index as f64 / (samples.len() - 1) as f64,
                    )
            } else {
                1.0
            };
            let current = sample * taper + coefficient * previous - before_previous;
            before_previous = previous;
            previous = current;
        }
        (previous * previous + before_previous * before_previous
            - coefficient * previous * before_previous)
            .max(1.0e-30)
    }

    fn measured_cents(midi: i32, retain_culled_mode_flexibility: bool) -> i32 {
        let sample_rate_hz = 44_100.0;
        let geometry = string_geometry(midi).unwrap();
        let strike = PianoStrike::from_velocity(72, midi, geometry.equivalent_diameter_m).unwrap();
        let mut voice =
            PianoVoice::new(midi, sample_rate_hz, PianoParameters::canonical()).unwrap();
        if !retain_culled_mode_flexibility {
            voice.clear_string_bridge_residual_flexibility_for_test();
        }
        voice.begin_strike(strike).unwrap();
        for _ in 0..(0.025 * sample_rate_hz) as usize {
            voice.step().unwrap();
        }
        let mut samples = vec![0.0_f64; (0.15 * sample_rate_hz) as usize];
        for sample in &mut samples {
            voice.step().unwrap();
            *sample = voice.string_hammer_port_velocity_for_test();
        }
        let mut best_cents: i32 = 0;
        let mut best_score = f64::NEG_INFINITY;
        for cents_offset in (-100..=100).step_by(2) {
            let shifted_fundamental =
                geometry.fundamental_hz * libm::pow(2.0, cents_offset as f64 / 1_200.0);
            let mut score = 0.0;
            let mut weight = 0.0;
            for partial in 1..=8 {
                let frequency_hz = stiff_string_mode_frequency_hz(
                    shifted_fundamental,
                    geometry.inharmonicity_coefficient,
                    partial,
                );
                if frequency_hz >= 0.44 * sample_rate_hz {
                    break;
                }
                let harmonic_weight = 1.0 / partial as f64;
                score += harmonic_weight
                    * libm::log(goertzel_power(&samples, sample_rate_hz, frequency_hz));
                weight += harmonic_weight;
            }
            score /= weight;
            if score > best_score {
                best_score = score;
                best_cents = cents_offset;
            }
        }
        best_cents
    }

    for midi in [36, 48, 60, 72, 84, 96] {
        let best_cents = measured_cents(midi, true);
        assert!(
            best_cents.abs() <= 25,
            "m{midi} coupled string hammer port shifted by {best_cents} cents"
        );
    }

    let retained_c7_cents = measured_cents(96, true);
    let omitted_c7_cents = measured_cents(96, false);
    assert!(omitted_c7_cents >= 35);
    assert!(omitted_c7_cents - retained_c7_cents >= 20);
}

#[test]
fn culled_string_modes_retain_their_static_bridge_flexibility() {
    let snapshot = component_string_reduction_snapshot(96, 0).unwrap();
    let cutoff_hz = 0.44 * 44_100.0;
    let independently_reconstructed_m_per_n: f64 = snapshot
        .frequencies_hz
        .iter()
        .copied()
        .zip(snapshot.eigenvectors.iter())
        .filter(|(frequency_hz, _)| *frequency_hz >= cutoff_hz)
        .map(|(frequency_hz, vector)| {
            vector[0].powi(2) / (2.0 * core::f64::consts::PI * frequency_hz).powi(2)
        })
        .sum();
    let voice = PianoVoice::new(96, 44_100.0, PianoParameters::canonical()).unwrap();
    let retained_m_per_n = voice
        .string_bridge_residual_flexibility_for_test(0)
        .unwrap();
    assert!(
        (retained_m_per_n - independently_reconstructed_m_per_n).abs() < 1.0e-18,
        "runtime residual flexibility diverged from the culled physical modes"
    );
    assert!((1.0e-6..2.0e-6).contains(&retained_m_per_n));

    let reviewed_contact_stiffness = 4.8e6;
    let condensed_stiffness =
        reviewed_contact_stiffness / (1.0 + reviewed_contact_stiffness * retained_m_per_n);
    assert!((5.0e5..8.0e5).contains(&condensed_stiffness));
    // The zero-residual near miss leaves the nominal contact more than six
    // times too stiff. The coupled pitch test above measures that mutation
    // directly rather than accepting this stiffness ratio as a proxy.
    assert!(reviewed_contact_stiffness / condensed_stiffness > 6.0);

    let mut passivity_probe = voice;
    passivity_probe
        .set_test_unison_bridge_displacement_m(0, 1.0e-5)
        .unwrap();
    let initial_energy_j = passivity_probe.represented_energy_j();
    let mut maximum_energy_j = initial_energy_j;
    for _ in 0..512 {
        passivity_probe.step().unwrap();
        maximum_energy_j = maximum_energy_j.max(passivity_probe.represented_energy_j());
    }
    assert!(maximum_energy_j <= initial_energy_j + 1.0e-12);
}

#[test]
fn bounded_stulov_contact_solve_transfers_the_top_key_at_every_rate() {
    assert_eq!(CONTACT_SOLVE_STEPS, 16);
    for sample_rate in [44_100.0, 48_000.0, 96_000.0] {
        let geometry = string_geometry(108).unwrap();
        let strike = PianoStrike::from_velocity(100, 108, geometry.equivalent_diameter_m).unwrap();
        let mut voice = PianoVoice::new(108, sample_rate, PianoParameters::canonical()).unwrap();
        voice.begin_strike(strike).unwrap();
        let mut maximum_string_energy_j = 0.0_f64;
        for frame in 0..12 {
            let output = voice.step().unwrap();
            maximum_string_energy_j = maximum_string_energy_j.max(output.string_energy_j);
            assert!(
                voice.accounted_energy_j() <= strike.impact_energy_j + 2.0e-9,
                "contact created energy at {sample_rate} Hz frame {frame}"
            );
        }
        assert!(
            maximum_string_energy_j > 1.0e-6 * strike.impact_energy_j,
            "contact refused the top key at {sample_rate} Hz"
        );
        assert!(
            voice.work_receipt().total_contact_iterations > 0
                && voice.work_receipt().total_contact_iterations <= 12 * CONTACT_SOLVE_STEPS as u64
        );
    }
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
    assert_eq!(receipt.maximum_bridge_contacts, 3);
    assert_eq!(MAXIMUM_BRIDGE_CONTACTS, 24);
    assert_eq!(
        receipt.maximum_bridge_solve_scalar_updates,
        MAXIMUM_BRIDGE_SOLVE_SCALAR_UPDATES
    );
}

#[test]
fn separate_unison_contacts_preserve_internal_bridge_strain() {
    let parameters = PianoParameters::canonical();
    let mut voice = PianoVoice::new(60, 48_000.0, parameters).unwrap();
    voice
        .set_test_unison_bridge_displacement_m(0, 1.0e-5)
        .unwrap();
    voice
        .set_test_unison_bridge_displacement_m(1, -1.0e-5)
        .unwrap();
    assert!((voice.bridge_contact_energy_j() - 4.8e-4).abs() < 2.0e-15);

    // The removed one-spring reduction summed all unison endpoints before
    // applying one contact spring, erasing the equal-and-opposite strain.
    let planted_aggregate_energy = 0.5 * 4.8e6 * (1.0e-5_f64 - 1.0e-5).powi(2);
    assert_eq!(planted_aggregate_energy, 0.0);

    let mut in_phase = PianoVoice::new(60, 48_000.0, parameters).unwrap();
    for string_index in 0..3 {
        in_phase
            .set_test_unison_bridge_displacement_m(string_index, 1.0e-5)
            .unwrap();
    }
    let three_independent_springs = 3.0 * 0.5 * 4.8e6 * 1.0e-10;
    assert!((in_phase.bridge_contact_energy_j() - three_independent_springs).abs() < 2.0e-15);
    let planted_summed_displacement = 0.5 * 4.8e6 * (3.0e-5_f64).powi(2);
    assert!((planted_summed_displacement / three_independent_springs - 3.0).abs() < 1.0e-15);
}

#[test]
fn reduced_unison_bridge_solve_matches_the_full_three_contact_system() {
    // Independently solved full system:
    // M_ij = delta_ij * (1 + a*S_i) + a*B,
    // M*c = string_rhs - body_rhs.
    // These literals come from direct Gaussian elimination of the displayed
    // 3x3 matrix, not from the production diagonal reduction.
    let (coordinates, aggregate) = separate_unison_bridge_contact_coordinates(
        [0.7, 1.1, 0.3],
        [0.4, -0.2, 0.6],
        0.05,
        0.8,
        0.02,
    )
    .unwrap();
    let expected = [
        0.335_415_973_381_178_3,
        -0.254_293_740_696_169_56,
        0.536_890_454_282_817_8,
    ];
    for (actual, expected) in coordinates.into_iter().zip(expected) {
        assert!((actual - expected).abs() < 2.0e-15);
    }
    assert!((aggregate - 0.618_012_686_967_826_5).abs() < 2.0e-15);

    // Old aggregate-string reduction: diagonal string compliances disappear
    // into one sum, so it cannot reproduce the three distinct contact forces.
    let planted_aggregate = (0.4 - 0.2 + 0.6 - 0.05) / (1.0 + 0.02 * (2.1 + 0.8));
    assert!((planted_aggregate - aggregate).abs() > 1.0e-2);
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
    // INRIA RT-0425 appendix A is independently literal here. It provides a
    // complete C1..B7 wrapped Steinway-D scale rather than four interpolation
    // anchors from a second instrument.
    assert_eq!(REVIEWED_STRING_SCALE.len(), 84);
    // Independently derived from every Appendix-A L/d/rho/T0 cell, in printed
    // note order.  The selected literal rows below make failures readable;
    // this compact full-table pin catches a bad digit in any of the other 76
    // rows without copying production's table back into the test.
    let mut reviewed_scale_digest = 0xcbf2_9ce4_8422_2325_u64;
    let mut digest_bytes = |bytes: &[u8]| {
        for byte in bytes {
            reviewed_scale_digest ^= u64::from(*byte);
            reviewed_scale_digest = reviewed_scale_digest.wrapping_mul(0x0000_0100_0000_01b3);
        }
    };
    for (index, row) in REVIEWED_STRING_SCALE.iter().enumerate() {
        assert_eq!(row.midi, 24 + index as i32);
        digest_bytes(&row.midi.to_le_bytes());
        digest_bytes(&row.speaking_length_m.to_bits().to_le_bytes());
        digest_bytes(&row.diameter_m.to_bits().to_le_bytes());
        digest_bytes(&row.density_kg_m3.to_bits().to_le_bytes());
        digest_bytes(&row.reported_tension_n.to_bits().to_le_bytes());
    }
    assert_eq!(reviewed_scale_digest, 0xc7b0_a7ca_9b85_fdf7);
    for (midi, length_m, diameter_m, density_kg_m3, reported_tension_n) in [
        (24, 2.007, 0.001_480, 57_787.0, 1_722.0),
        (36, 1.602, 0.001_051, 23_919.0, 915.0),
        (48, 1.259, 0.001_063, 7_850.0, 759.0),
        (60, 0.657, 0.001_006, 7_850.0, 741.0),
        (72, 0.344, 0.000_932, 7_850.0, 696.0),
        (84, 0.180, 0.000_891, 7_850.0, 697.0),
        (96, 0.095, 0.000_831, 7_850.0, 670.0),
        (107, 0.052, 0.000_743, 7_850.0, 588.0),
    ] {
        let row = reviewed_string_scale_row(midi).unwrap();
        assert_eq!(row.speaking_length_m, length_m);
        assert_eq!(row.diameter_m, diameter_m);
        assert_eq!(row.density_kg_m3, density_kg_m3);
        assert_eq!(row.reported_tension_n, reported_tension_n);
        let geometry = string_geometry(midi).unwrap();
        let expected_linear_density =
            density_kg_m3 * core::f64::consts::PI * diameter_m * diameter_m / 4.0;
        let flexible_string_tension = expected_linear_density
            * (2.0 * length_m * midi_frequency_hz(midi))
            * (2.0 * length_m * midi_frequency_hz(midi));
        let second_moment = core::f64::consts::PI * diameter_m.powi(4) / 64.0;
        let bending_rigidity = 2.02e11 * second_moment;
        let expected_tension = flexible_string_tension
            - core::f64::consts::PI.powi(2) * bending_rigidity / length_m.powi(2);
        assert_eq!(geometry.speaking_length_m, length_m);
        assert_eq!(geometry.equivalent_diameter_m, diameter_m);
        assert!((geometry.linear_density_kg_m - expected_linear_density).abs() < 1.0e-15);
        assert!((geometry.tension_n - expected_tension).abs() < 1.0e-10);
        // The report's integer-rounded A4=441 tension remains an independent
        // check on L/d/rho before the analytically required bending correction.
        // Comparing it to the corrected tension would falsely interpret EI as
        // a change to the reviewed scale rather than part of the eigenvalue.
        assert!(
            ((flexible_string_tension / reported_tension_n) - 1.0).abs() < 0.025,
            "reviewed geometry left the rounded row: midi={midi}, flexible={flexible_string_tension}, reported={reported_tension_n}"
        );
        assert!(expected_tension < flexible_string_tension);
        let expected_b = core::f64::consts::PI.powi(2) * bending_rigidity
            / (expected_tension * length_m * length_m);
        assert!((geometry.inharmonicity_coefficient - expected_b).abs() < 1.0e-15);
    }

    // The C2 wound row uses its equivalent density, not ordinary steel.
    assert!(reviewed_string_scale_row(36).unwrap().density_kg_m3 > 3.0 * 7_850.0);
    // The four report-boundary keys remain positive bounded extrapolations of
    // adjacent rows rather than falling back to the superseded sparse scale.
    for midi in [21, 22, 23, 108] {
        let row = reviewed_string_scale_row(midi).unwrap();
        assert!(row.speaking_length_m > 0.0);
        assert!(row.diameter_m > 0.0);
        assert!(row.density_kg_m3 > 0.0);
        assert!(row.reported_tension_n > 0.0);
    }

    for midi in 21..=108 {
        let geometry = string_geometry(midi).unwrap();
        let second_moment = core::f64::consts::PI * geometry.equivalent_diameter_m.powi(4) / 64.0;
        let bending_rigidity = 2.02e11 * second_moment;
        let geometry_pitch_hz = sqrt(
            (geometry.tension_n
                + core::f64::consts::PI.powi(2) * bending_rigidity
                    / geometry.speaking_length_m.powi(2))
                / geometry.linear_density_kg_m,
        ) / (2.0 * geometry.speaking_length_m);
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
fn soundboard_active_modes_are_sorted_and_bandlimited_at_the_minimum_rate() {
    let voice = PianoVoice::new(60, 8_000.0, PianoParameters::canonical()).unwrap();
    let mut previous_frequency_hz = 0.0;
    for index in 0..piano_v2::SOUNDBOARD_MODES {
        let frequency_hz = voice.soundboard_mode_frequency_hz(index).unwrap();
        assert!(frequency_hz > previous_frequency_hz);
        assert!(frequency_hz < 0.44 * 8_000.0);
        previous_frequency_hz = frequency_hz;
    }
    assert_eq!(
        voice.soundboard_mode_frequency_hz(piano_v2::SOUNDBOARD_MODES),
        None
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

    // Independent orthotropic Navier known answer for mode (2,3).  The major
    // Poisson ratio must be reciprocated before forming 1-nu_LR*nu_RL, and
    // D66=G*h^3/12 enters the mixed term as 2*(D12+2*D66).
    let h3 = base.soundboard_thickness_m.powi(3);
    let nu_rl = base.soundboard_poisson_ratio * base.soundboard_radial_modulus_pa
        / base.soundboard_longitudinal_modulus_pa;
    let denominator = 12.0 * (1.0 - base.soundboard_poisson_ratio * nu_rl);
    let d11 = base.soundboard_longitudinal_modulus_pa * h3 / denominator;
    let bare_d22 = base.soundboard_radial_modulus_pa * h3 / denominator;
    let d12 = base.soundboard_poisson_ratio * base.soundboard_radial_modulus_pa * h3 / denominator;
    let d66 = base.soundboard_shear_modulus_pa * h3 / 12.0;
    let rib_spacing = base.soundboard_length_m / (base.soundboard_rib_count + 1) as f64;
    let rib_second_moment =
        base.soundboard_rib_width_m * base.soundboard_rib_height_m.powi(3) / 12.0;
    let d22 = bare_d22 + base.soundboard_rib_modulus_pa * rib_second_moment / rib_spacing;
    let areal_density = base.soundboard_density_kg_m3
        * (base.soundboard_thickness_m
            + base.soundboard_rib_width_m * base.soundboard_rib_height_m / rib_spacing);
    let kx = 2.0 / base.soundboard_length_m;
    let ky = 3.0 / base.soundboard_width_m;
    let expected_23 = (core::f64::consts::PI.powi(4)
        * (d11 * kx.powi(4) + 2.0 * (d12 + 2.0 * d66) * kx * kx * ky * ky + d22 * ky.powi(4))
        / areal_density)
        .sqrt()
        / (2.0 * core::f64::consts::PI);
    let actual_23 = soundboard_mode_frequency_hz(base, 2, 3).unwrap();
    assert!((actual_23 - expected_23).abs() < 1.0e-12);
    assert!((actual_23 - 140.470_476_118_061_4).abs() < 1.0e-12);

    // Planted superseded law: isotropic 1-nu^2 plus G*h^3 in the cross term
    // over-stiffens this mixed mode by more than five percent.
    let old_denominator = 12.0 * (1.0 - base.soundboard_poisson_ratio.powi(2));
    let old_d11 = base.soundboard_longitudinal_modulus_pa * h3 / old_denominator;
    let old_bare_d22 = base.soundboard_radial_modulus_pa * h3 / old_denominator;
    let old_cross = base.soundboard_shear_modulus_pa * h3
        + base.soundboard_poisson_ratio * (old_d11 * old_bare_d22).sqrt();
    let old_d22 = old_bare_d22 + base.soundboard_rib_modulus_pa * rib_second_moment / rib_spacing;
    let old_23 = (core::f64::consts::PI.powi(4)
        * (old_d11 * kx.powi(4) + 2.0 * old_cross * kx * kx * ky * ky + old_d22 * ky.powi(4))
        / areal_density)
        .sqrt()
        / (2.0 * core::f64::consts::PI);
    assert!(old_23 / actual_23 > 1.05);

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
        (43, (0.695_732_663_833_333, 0.286_087_502)),
        (44, (0.470_072_877, 0.618_400_070)),
        (62, (0.268_679_391, 0.468_071_366)),
        (74, (0.134_417_067, 0.367_852_230)),
    ];
    for (midi, expected) in anchors {
        let actual = soundboard_bridge_position_for_midi(midi).unwrap();
        assert!((actual.0 - expected.0).abs() < 1.0e-12);
        assert!((actual.1 - expected.1).abs() < 1.0e-12);
    }
    let parameters = PianoParameters::canonical();
    let bass_terminal = soundboard_bridge_position_for_midi(43).unwrap();
    let treble_start = soundboard_bridge_position_for_midi(44).unwrap();
    assert!(
        (bass_terminal.0 - treble_start.0).hypot(bass_terminal.1 - treble_start.1) > 0.35,
        "the two physical bridges collapsed back into one interpolated curve"
    );
    // The removed single-curve implementation put MIDI 44 between A1 and D4
    // at this bare-board point. It must remain far from the reviewed long
    // bridge's first key.
    let old_amount = (44 - 33) as f64 / (62 - 33) as f64;
    let old_bare_board_point = (
        0.783_324_033 + old_amount * (0.268_679_391 - 0.783_324_033),
        0.422_623_497 + old_amount * (0.468_071_366 - 0.422_623_497),
    );
    assert!(
        (treble_start.0 - old_bare_board_point.0).hypot(treble_start.1 - old_bare_board_point.1)
            > 0.20
    );

    let residues = anchors
        .map(|(midi, _)| soundboard_bridge_mode_residue_for_midi(parameters, midi, 2, 3).unwrap());
    for pair in residues.windows(2) {
        assert!((pair[0] - pair[1]).abs() > 0.01);
    }
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

    // Independent phasor known answer. For q(t)=Q cos(omega t), qdot is
    // -omega Q sin(omega t), so H=(2+3i), qdot=5, omega*q=7 gives
    // Re(H*qdot_phasor) = 2*5 - 3*7 = -11. The superseded plus sign would
    // produce +31 and conjugate every observer phase.
    let pressure = piano_v2::modal_observer_pressure_pa(2.0, 3.0, 5.0, 7.0);
    assert_eq!(pressure, -11.0);
    assert_ne!(pressure, 2.0 * 5.0 + 3.0 * 7.0);

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

    let mut memoryless_felt = PianoStrike::from_velocity(80, 60, diameter).unwrap();
    memoryless_felt.felt_rate_time_seconds = 0.0;
    assert_eq!(
        voice.begin_strike(memoryless_felt),
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
            let rendered_rms = rms(&left);
            assert!(
                peak > 1.0e-7,
                "silent m{midi} @{sample_rate}: peak={peak}, rms={rendered_rms}"
            );
            assert!(peak < 0.98, "unbounded m{midi} @{sample_rate}: {peak}");
            assert!(rendered_rms > 1.0e-8);
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
