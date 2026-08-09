//! Independent narrow proof for the dark sample-free piano onset core.
//!
//! The production renderer is intentionally not imported: this test loads
//! only the reserved physical source, and every expected relation below is
//! stated independently of its private constants.

#[path = "../src/piano_v2.rs"]
mod piano_v2;

use piano_v2::{
    midi_frequency_hz, render_piano_note, soundboard_mode_frequency_hz,
    stiff_string_mode_frequency_hz, string_geometry, PianoError, PianoParameters, PianoStrike,
    PianoVoice, CONTACT_SOLVE_STEPS, MAXIMUM_STATE_BYTES,
};

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
    assert!(low.linear_density_kg_m > middle.linear_density_kg_m);
    assert!(middle.linear_density_kg_m > high.linear_density_kg_m);
    assert!(low.equivalent_diameter_m > high.equivalent_diameter_m);
    assert!((690.0..=880.0).contains(&low.tension_n));
    assert!((690.0..=880.0).contains(&high.tension_n));

    for midi in [21, 40, 60, 69, 84, 108] {
        let geometry = string_geometry(midi).unwrap();
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
        assert!(fourth > 4.0 * geometry.unison_frequencies_hz[0]);
        assert!(geometry.inharmonicity_coefficient > 0.0);
        assert!((geometry.fundamental_hz - midi_frequency_hz(midi)).abs() < 1.0e-12);
    }

    let treble = string_geometry(84).unwrap();
    assert!(treble.unison_frequencies_hz[0] < treble.unison_frequencies_hz[1]);
    assert!(treble.unison_frequencies_hz[1] < treble.unison_frequencies_hz[2]);
}

#[test]
fn orthotropic_soundboard_obeys_independent_scaling_laws() {
    let base = PianoParameters::canonical();
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
    let strike = PianoStrike::from_velocity(108, parameters.hammer_mass_kg).unwrap();
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
    active_bridge.bridge_coupling_rate_per_second = -1.0;
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
    let mut inconsistent = PianoStrike::from_velocity(80, parameters.hammer_mass_kg).unwrap();
    inconsistent.impact_energy_j *= 0.5;
    let mut voice = PianoVoice::new(60, 48_000.0, parameters).unwrap();
    let valid = PianoStrike::from_velocity(80, parameters.hammer_mass_kg).unwrap();
    voice.begin_strike(valid).unwrap();
    assert_eq!(voice.begin_strike(valid), Err(PianoError::InvalidContact));
    while voice.contact_active() {
        voice.step().unwrap();
    }
    assert_eq!(
        voice.begin_strike(inconsistent),
        Err(PianoError::InvalidContact)
    );

    let mut capped = PianoStrike::from_velocity(80, parameters.hammer_mass_kg).unwrap();
    capped.maximum_force_n = 1.0e-9;
    voice.begin_strike(capped).unwrap();
    let before = voice.represented_energy_j();
    voice.step().unwrap();
    assert!(!voice.contact_active());
    assert!(voice.represented_energy_j() <= before + 1.0e-12);
    assert!(voice.accounted_energy_j() >= before - 1.0e-9);

    let mut memoryless = PianoStrike::from_velocity(80, parameters.hammer_mass_kg).unwrap();
    memoryless.felt_relaxation_seconds = 0.0;
    assert_eq!(
        voice.begin_strike(memoryless),
        Err(PianoError::InvalidContact)
    );
}

#[test]
fn state_continuation_is_bit_deterministic() {
    let parameters = PianoParameters::canonical();
    let mut voice = PianoVoice::new(64, 48_000.0, parameters).unwrap();
    voice
        .begin_strike(PianoStrike::from_velocity(91, parameters.hammer_mass_kg).unwrap())
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
    let mut soft_voice = PianoVoice::new(60, 48_000.0, parameters).unwrap();
    soft_voice
        .begin_strike(PianoStrike::from_velocity(24, parameters.hammer_mass_kg).unwrap())
        .unwrap();
    let mut hard_voice = PianoVoice::new(60, 48_000.0, parameters).unwrap();
    hard_voice
        .begin_strike(PianoStrike::from_velocity(120, parameters.hammer_mass_kg).unwrap())
        .unwrap();
    let mut soft_contact_frames = 0usize;
    let mut hard_contact_frames = 0usize;
    for frame in 0..1_024 {
        soft_voice.step().unwrap();
        hard_voice.step().unwrap();
        if soft_voice.contact_active() {
            soft_contact_frames = frame + 1;
        }
        if hard_voice.contact_active() {
            hard_contact_frames = frame + 1;
        }
    }
    let soft_string_centroid = string_energy_centroid_hz(&soft_voice);
    let hard_string_centroid = string_energy_centroid_hz(&hard_voice);
    let soft_board_centroid = soundboard_energy_centroid_hz(&soft_voice);
    let hard_board_centroid = soundboard_energy_centroid_hz(&hard_voice);
    assert!(
        hard_string_centroid > 1.04 * soft_string_centroid,
        "felt contact itself did not brighten: soft={soft_string_centroid}, hard={hard_string_centroid}, contact_frames={soft_contact_frames}/{hard_contact_frames}"
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
    assert!(
        hard_stereo_centroid > 1.04 * soft_stereo_centroid,
        "felt contact did not brighten: left={soft_centroid}/{hard_centroid}, right={soft_right_centroid}/{hard_right_centroid}, stereo={soft_stereo_centroid}/{hard_stereo_centroid}, attack={soft_attack_centroid}/{hard_attack_centroid}, string={soft_string_centroid}/{hard_string_centroid}, board={soft_board_centroid}/{hard_board_centroid}, contact_frames={soft_contact_frames}/{hard_contact_frames}"
    );
    assert!(rms(&hard_left) > rms(&soft_left));
}
