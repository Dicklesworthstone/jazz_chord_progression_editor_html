// Direct tests for the PHS4 core and its bounded note-buffer ABI. The module
// is included by path; host integration and recipe reachability stay outside
// this test boundary.
#[path = "../src/plucked_v2.rs"]
mod plucked_v2;

use plucked_v2::{
    archtop_pack, circular_sound_hole_helmholtz_hz, dreadnought_pack, inharmonicity_coefficient,
    marshall_electric_pack, midi_frequency_hz, plk2_note_frames, plk2_render, plk2_render_path,
    plk2_render_slices, plk2_string_fret, ukulele_pack, upright_bass_pack, BodyModeKind,
    PluckGesture, PluckedError, PluckedRenderPath, PluckedStem, PLK2_ARCHTOP_PACK,
    PLK2_DREADNOUGHT_PACK, PLK2_MARSHALL_ELECTRIC_PACK, PLK2_UKULELE_PACK,
};

const SAMPLE_RATE: f64 = 48_000.0;

fn relative_error(actual: f64, expected: f64) -> f64 {
    (actual - expected).abs() / expected.abs().max(1.0e-30)
}

fn body_contains_mode(stem: &PluckedStem, expected_hz: f64) -> bool {
    (0..stem.body_mode_count()).any(|index| {
        stem.body_mode_frequency_hz(index)
            .is_some_and(|actual| relative_error(actual, expected_hz) < 1.0e-12)
    })
}

fn body_mode_frequency(stem: &PluckedStem, expected_kind: BodyModeKind) -> Option<f64> {
    (0..stem.body_mode_count()).find_map(|index| {
        (stem.body_mode_kind(index) == Some(expected_kind))
            .then(|| stem.body_mode_frequency_hz(index))
            .flatten()
    })
}

fn rms(samples: &[f64]) -> f64 {
    (samples.iter().map(|sample| sample * sample).sum::<f64>() / samples.len() as f64).sqrt()
}

fn harmonic_amplitude(samples: &[f64], frequency_hz: f64, harmonic: usize) -> f64 {
    let omega = 2.0 * core::f64::consts::PI * frequency_hz * harmonic as f64 / SAMPLE_RATE;
    let mut real = 0.0;
    let mut imaginary = 0.0;
    for (index, sample) in samples.iter().enumerate() {
        let phase = omega * index as f64;
        real += sample * phase.cos();
        imaginary -= sample * phase.sin();
    }
    2.0 * (real * real + imaginary * imaginary).sqrt() / samples.len() as f64
}

fn windowed_tone_amplitude(samples: &[f32], sample_rate: f64, frequency_hz: f64) -> f64 {
    let mut real = 0.0;
    let mut imaginary = 0.0;
    let denominator = (samples.len() - 1).max(1) as f64;
    let omega = 2.0 * core::f64::consts::PI * frequency_hz / sample_rate;
    let tone_rotation = (omega.cos(), omega.sin());
    let window_omega = 2.0 * core::f64::consts::PI / denominator;
    let window_rotation = (window_omega.cos(), window_omega.sin());
    let mut tone_phase = (1.0f64, 0.0f64);
    let mut window_phase = (1.0f64, 0.0f64);
    let mut window_sum = 0.0;
    for sample in samples {
        let window = 0.5 - 0.5 * window_phase.0;
        real += *sample as f64 * window * tone_phase.0;
        imaginary -= *sample as f64 * window * tone_phase.1;
        window_sum += window;
        tone_phase = (
            tone_phase.0 * tone_rotation.0 - tone_phase.1 * tone_rotation.1,
            tone_phase.1 * tone_rotation.0 + tone_phase.0 * tone_rotation.1,
        );
        window_phase = (
            window_phase.0 * window_rotation.0 - window_phase.1 * window_rotation.1,
            window_phase.1 * window_rotation.0 + window_phase.0 * window_rotation.1,
        );
    }
    2.0 * (real * real + imaginary * imaginary).sqrt() / window_sum.max(1.0e-30)
}

fn estimate_pitch_cents(samples: &[f32], sample_rate: f64, target_hz: f64) -> (f64, f64) {
    let mut best_cents = 0.0;
    let mut best_amplitude = 0.0;
    for quarter_cent in -48..=48 {
        let cents = quarter_cent as f64 * 0.25;
        let frequency = target_hz * 2.0f64.powf(cents / 1_200.0);
        let amplitude = windowed_tone_amplitude(samples, sample_rate, frequency);
        if amplitude > best_amplitude {
            best_amplitude = amplitude;
            best_cents = cents;
        }
    }
    (best_cents, best_amplitude)
}

fn harmonic_profile(samples: &[f32], sample_rate: f64, fundamental_hz: f64) -> [f64; 8] {
    let mut profile = [0.0; 8];
    let mut total = 0.0;
    for (index, amplitude) in profile.iter_mut().enumerate() {
        *amplitude =
            windowed_tone_amplitude(samples, sample_rate, fundamental_hz * (index + 1) as f64);
        total += *amplitude;
    }
    for amplitude in &mut profile {
        *amplitude /= total.max(1.0e-30);
    }
    profile
}

fn profile_distance(left: [f64; 8], right: [f64; 8]) -> f64 {
    left.iter()
        .zip(right)
        .map(|(left, right)| (left - right).abs())
        .sum()
}

#[derive(Clone, Copy, Debug)]
struct RadiatedSpectrum {
    relative_partial_db: [f64; 10],
    upper_partial_energy_db: f64,
    audible_upper_partials: usize,
    early_rms: f64,
    comparison_tail_rms: f64,
    late_rms: f64,
}

fn db_ratio(amplitude: f64, reference: f64) -> f64 {
    20.0 * (amplitude.max(1.0e-30) / reference.max(1.0e-30)).log10()
}

fn windowed_rms(samples: &[f32]) -> f64 {
    (samples
        .iter()
        .map(|sample| (*sample as f64) * (*sample as f64))
        .sum::<f64>()
        / samples.len().max(1) as f64)
        .sqrt()
}

fn stereo_rms(left: &[f32], right: &[f32]) -> f64 {
    assert_eq!(left.len(), right.len());
    (left
        .iter()
        .zip(right)
        .map(|(left, right)| {
            let left = *left as f64;
            let right = *right as f64;
            left * left + right * right
        })
        .sum::<f64>()
        / left.len().max(1) as f64)
        .sqrt()
}

fn stereo_peak(left: &[f32], right: &[f32]) -> f64 {
    assert_eq!(left.len(), right.len());
    left.iter()
        .zip(right)
        .map(|(left, right)| {
            let left = *left as f64;
            let right = *right as f64;
            (left * left + right * right).sqrt()
        })
        .fold(0.0, f64::max)
}

fn render_spectrum(pack: i32, midi: i32, velocity: i32) -> RadiatedSpectrum {
    let frames = (1.80 * SAMPLE_RATE) as usize;
    let mut left = vec![0.0f32; frames];
    let mut right = vec![0.0f32; frames];
    assert_eq!(
        plk2_render_slices(
            pack,
            midi,
            velocity,
            SAMPLE_RATE as f32,
            &mut left,
            &mut right,
            frames as i32,
        ),
        frames as i32
    );

    let (string_index, fret) = plk2_string_fret(pack, midi).expect("physical course");
    let physical_pack = match pack {
        PLK2_ARCHTOP_PACK => archtop_pack(),
        PLK2_MARSHALL_ELECTRIC_PACK => marshall_electric_pack(),
        PLK2_DREADNOUGHT_PACK => dreadnought_pack(),
        PLK2_UKULELE_PACK => ukulele_pack(),
        _ => panic!("invalid pack"),
    };
    let mut stem = PluckedStem::new(physical_pack, SAMPLE_RATE).expect("analysis stem");
    let mut gesture = PluckGesture::medium_pick(string_index, fret, 1);
    if pack == PLK2_UKULELE_PACK {
        gesture = PluckGesture::soft_finger(string_index, fret, 1);
    }
    stem.begin_pluck(gesture).expect("analysis fret");

    // The window excludes the contact transient but is early enough that real
    // steel/nylon string partials have not fallen below the numerical floor.
    let spectrum = &left[(0.045 * SAMPLE_RATE) as usize..(0.215 * SAMPLE_RATE) as usize];
    let mut partial_amplitude = [0.0f64; 10];
    for (index, amplitude) in partial_amplitude.iter_mut().enumerate() {
        let partial = index + 1;
        let frequency = stem
            .string_mode_frequency_hz(string_index, partial)
            .expect("retained string partial");
        *amplitude = windowed_tone_amplitude(spectrum, SAMPLE_RATE, frequency);
    }
    let fundamental = partial_amplitude[0];
    let mut relative_partial_db = [0.0f64; 10];
    for (index, relative) in relative_partial_db.iter_mut().enumerate() {
        *relative = db_ratio(partial_amplitude[index], fundamental);
    }
    let upper_energy = partial_amplitude[1..]
        .iter()
        .map(|amplitude| amplitude * amplitude)
        .sum::<f64>()
        .sqrt();
    let audible_upper_partials = relative_partial_db[1..]
        .iter()
        .filter(|relative_db| **relative_db >= -50.0)
        .count();
    RadiatedSpectrum {
        relative_partial_db,
        upper_partial_energy_db: db_ratio(upper_energy, fundamental),
        audible_upper_partials,
        early_rms: windowed_rms(
            &left[(0.055 * SAMPLE_RATE) as usize..(0.205 * SAMPLE_RATE) as usize],
        ),
        // Preserve the independent corpus comparison window.  The later
        // window below is the stronger internal decay/stability check.
        comparison_tail_rms: windowed_rms(
            &left[(0.82 * SAMPLE_RATE) as usize..(1.07 * SAMPLE_RATE) as usize],
        ),
        late_rms: windowed_rms(&left[(1.45 * SAMPLE_RATE) as usize..(1.70 * SAMPLE_RATE) as usize]),
    }
}

fn electric_stage_decay(midi: i32, velocity: i32) -> ((f64, f64), (f64, f64)) {
    let full_pack = marshall_electric_pack();
    let (physical_index, fret) =
        plk2_string_fret(PLK2_MARSHALL_ELECTRIC_PACK, midi).expect("electric course");
    let mut pack = full_pack;
    pack.strings[0] = full_pack.strings[physical_index];
    pack.string_count = 1;
    let mut stem = PluckedStem::new(pack, SAMPLE_RATE).expect("electric diagnostic stem");
    let normalized = velocity as f64 / 127.0;
    let mut gesture = PluckGesture::medium_pick(0, fret, 1);
    gesture.position_over_scale = 0.13;
    gesture.width_m = 0.001_2;
    gesture.force_n = 0.30 + 2.55 * normalized.powf(1.35);
    gesture.contact_duration_seconds *= 0.62 - 0.12 * normalized;
    stem.begin_pluck(gesture)
        .expect("electric diagnostic pluck");
    let frames = (1.8 * SAMPLE_RATE) as usize;
    let mut pickup = vec![0.0f32; frames];
    let mut cabinet = vec![0.0f32; frames];
    for (pickup_sample, cabinet_sample) in pickup.iter_mut().zip(&mut cabinet) {
        let taps = stem.step();
        *pickup_sample = taps.electric_pickup_velocity_m_per_s as f32;
        *cabinet_sample = taps.electric_cabinet_pressure_pa_at_1m as f32;
    }
    let early = (0.055 * SAMPLE_RATE) as usize..(0.205 * SAMPLE_RATE) as usize;
    let late = (1.45 * SAMPLE_RATE) as usize..(1.70 * SAMPLE_RATE) as usize;
    (
        (
            windowed_rms(&pickup[early.clone()]),
            windowed_rms(&pickup[late.clone()]),
        ),
        (windowed_rms(&cabinet[early]), windowed_rms(&cabinet[late])),
    )
}

fn spectrum_has_a_plucked_string_comb(spectrum: RadiatedSpectrum) -> bool {
    spectrum.audible_upper_partials >= 5
        && spectrum.upper_partial_energy_db >= -30.0
        && spectrum.upper_partial_energy_db <= 15.0
        && spectrum.relative_partial_db[1] >= -42.0
}

fn amplifier_capture(amplitude: f64, frequency_hz: f64) -> (Vec<f64>, f64, PluckedStem) {
    let mut stem = PluckedStem::new(marshall_electric_pack(), SAMPLE_RATE).expect("amp pack");
    let warmup_frames = SAMPLE_RATE as usize;
    let capture_frames = SAMPLE_RATE as usize;
    let mut capture = Vec::with_capacity(capture_frames);
    let mut minimum_supply = 1.0f64;
    for frame in 0..warmup_frames + capture_frames {
        let input = amplitude
            * (2.0 * core::f64::consts::PI * frequency_hz * frame as f64 / SAMPLE_RATE).sin();
        let output = stem.process_electric_pickup_sample(input);
        assert!(
            output.is_finite(),
            "amp output became non-finite at frame {frame}"
        );
        minimum_supply = minimum_supply.min(stem.amplifier_supply_fraction().expect("supply"));
        if frame >= warmup_frames {
            capture.push(output);
        }
    }
    (capture, minimum_supply, stem)
}

#[test]
fn stiff_string_dispersion_and_frequency_dependent_loss_are_observable() {
    let stem = PluckedStem::new(dreadnought_pack(), SAMPLE_RATE).expect("valid dreadnought");
    let fundamental = stem.string_mode_frequency_hz(0, 1).expect("fundamental");
    let second = stem.string_mode_frequency_hz(0, 2).expect("second partial");
    let eighth = stem.string_mode_frequency_hz(0, 8).expect("eighth partial");

    assert!(relative_error(fundamental, midi_frequency_hz(40)) < 1.0e-12);
    assert!(
        second > 2.0 * fundamental,
        "stiffness must sharpen upper partials"
    );
    assert!(
        eighth / (8.0 * fundamental) > second / (2.0 * fundamental),
        "dispersion must grow with harmonic number"
    );

    let low_t60 = stem.string_mode_t60_seconds(0, 1).expect("low T60");
    let high_t60 = stem.string_mode_t60_seconds(0, 8).expect("high T60");
    assert!(
        high_t60 < low_t60,
        "high-frequency string loss must be stronger"
    );
    assert!(stem.string_inharmonicity_b(0).expect("inharmonicity") > 0.0);
    let first_string = dreadnought_pack().strings[0];
    let wave_speed = 2.0 * first_string.scale_length_m * midi_frequency_hz(first_string.open_midi);
    let expected_tension = first_string.linear_density_kg_per_m * wave_speed * wave_speed;
    assert!(
        relative_error(
            stem.string_tuned_tension_n(0).expect("tuned tension"),
            expected_tension
        ) < 1.0e-12,
        "tuned tension must obey f=(1/2L)sqrt(T/mu)"
    );

    // Independent closed-form case from the accepted PHS4 fixture.  This
    // calls the production formula with literal physical inputs, not output
    // generated by a pack constructor.
    let known_b = inharmonicity_coefficient(200.0e9, 0.000_46, 73.2, 0.648);
    assert!(relative_error(known_b, 0.000_141_146_422) < 1.0e-6);
}

#[test]
fn finite_contact_respects_position_width_direction_and_release() {
    let mut positive = PluckedStem::new(dreadnought_pack(), SAMPLE_RATE).expect("positive stem");
    let mut negative = PluckedStem::new(dreadnought_pack(), SAMPLE_RATE).expect("negative stem");
    let positive_gesture = PluckGesture::medium_pick(0, 0, 1);
    let negative_gesture = PluckGesture::medium_pick(0, 0, -1);
    positive
        .begin_pluck(positive_gesture)
        .expect("positive pluck");
    negative
        .begin_pluck(negative_gesture)
        .expect("negative pluck");

    let mut nonzero_contact_frames = 0usize;
    let mut max_direct = 0.0f64;
    for _ in 0..1_200 {
        let plus = positive.step();
        let minus = negative.step();
        if plus.contact_force_n != 0.0 {
            nonzero_contact_frames += 1;
        }
        max_direct = max_direct.max(plus.direct_string_velocity_m_per_s.abs());
        let scale = plus
            .direct_string_velocity_m_per_s
            .abs()
            .max(minus.direct_string_velocity_m_per_s.abs())
            .max(1.0e-15);
        assert!(
            (plus.direct_string_velocity_m_per_s + minus.direct_string_velocity_m_per_s).abs()
                <= 2.0e-12 * scale,
            "pluck direction must reverse the physical output"
        );
    }
    assert!(
        nonzero_contact_frames >= 3,
        "contact cannot collapse to an impulse: {nonzero_contact_frames} active-force frames"
    );
    assert!(
        nonzero_contact_frames < 1_200,
        "contact must release in bounded time"
    );
    assert!(!positive.contact_active());
    assert!(
        max_direct > 1.0e-5,
        "finite contact must produce an audible-scale tap"
    );

    // A finite-width pluck at x=L/5 retains the exact fifth-harmonic spatial
    // null while neighbouring modes remain excitable.
    let fifth = positive
        .pluck_modal_residue(0, 5, 0.2, positive_gesture.width_m)
        .expect("fifth residue");
    let fourth = positive
        .pluck_modal_residue(0, 4, 0.2, positive_gesture.width_m)
        .expect("fourth residue");
    assert!(fifth.abs() < fourth.abs() * 1.0e-12);
}

#[test]
fn passive_bridge_transfers_energy_to_body_and_sympathetic_strings() {
    let mut stem = PluckedStem::new(dreadnought_pack(), SAMPLE_RATE).expect("valid stem");
    stem.begin_pluck(PluckGesture::medium_pick(0, 0, 1))
        .expect("finite pluck");
    while stem.contact_active() {
        stem.step();
    }

    let energy_after_contact = stem.total_energy_j();
    assert!(energy_after_contact > 0.0);
    assert!(stem.body_energy_j() > 0.0, "bridge must feed body state");
    assert!(
        stem.string_energy_j(1).expect("sympathetic string") > 0.0,
        "an unplucked string must receive passive bridge energy"
    );

    let mut previous = energy_after_contact;
    let mut final_taps = stem.step();
    for _ in 0..8_000 {
        final_taps = stem.step();
        let current = final_taps.total_mechanical_energy_j;
        assert!(
            current <= previous + 2.0e-12 * energy_after_contact.max(1.0),
            "source-free passive state gained energy: {previous:e} -> {current:e}"
        );
        previous = current;
    }
    let accounted = final_taps.total_mechanical_energy_j
        + final_taps.cumulative_intrinsic_loss_j
        + final_taps.cumulative_bridge_loss_j;
    assert!(
        relative_error(accounted, final_taps.cumulative_source_work_j) < 2.0e-8,
        "energy ledger did not close: work={} accounted={accounted}",
        final_taps.cumulative_source_work_j
    );
}

#[test]
fn negative_bridge_or_zero_duration_cannot_emit_a_fake_success() {
    let mut active_pack = dreadnought_pack();
    active_pack.bridge_conductance_kg_per_s = -active_pack.bridge_conductance_kg_per_s;
    assert_eq!(
        PluckedStem::new(active_pack, SAMPLE_RATE).unwrap_err(),
        PluckedError::NonPassiveBridge
    );

    let mut stem = PluckedStem::new(dreadnought_pack(), SAMPLE_RATE).expect("valid stem");
    let mut zero_duration = PluckGesture::medium_pick(0, 0, 1);
    zero_duration.contact_duration_seconds = 0.0;
    assert_eq!(
        stem.begin_pluck(zero_duration),
        Err(PluckedError::InvalidContactDuration)
    );
    let output = stem.step();
    assert_eq!(output.total_mechanical_energy_j, 0.0);
    assert_eq!(output.direct_string_velocity_m_per_s, 0.0);
    assert_eq!(output.acoustic_body_volume_velocity_m3_per_s, 0.0);
    assert_eq!(output.electric_cabinet_pressure_pa_at_1m, 0.0);

    let mut invalid_amp_pack = marshall_electric_pack();
    let mut invalid_amp = invalid_amp_pack.amplifier.expect("electric amplifier");
    invalid_amp.sag_depth = 1.01;
    invalid_amp_pack.amplifier = Some(invalid_amp);
    assert_eq!(
        PluckedStem::new(invalid_amp_pack, SAMPLE_RATE).unwrap_err(),
        PluckedError::InvalidAmplifier,
        "a supply model that can invert its rail must fail closed"
    );
}

#[test]
fn geometry_and_material_packs_create_distinct_body_and_string_families() {
    let dread_pack = dreadnought_pack();
    let uke_pack = ukulele_pack();
    assert!(uke_pack.body.length_m < dread_pack.body.length_m);
    assert!(uke_pack.body.body_volume_m3 < dread_pack.body.body_volume_m3);
    assert_eq!(uke_pack.body.body_volume_m3, 0.003_2);
    let expected_uke_air = circular_sound_hole_helmholtz_hz(0.003_2, 0.022, 0.002_2);
    assert!(relative_error(uke_pack.body.helmholtz_hz, expected_uke_air) < 1.0e-12);
    assert!(
        (175.0..=205.0).contains(&uke_pack.body.helmholtz_hz),
        "concert ukulele air mode must follow cavity/sound-hole geometry"
    );
    assert_eq!(uke_pack.strings[0].open_midi, 67); // re-entrant g4
    assert_eq!(uke_pack.strings[1].open_midi, 60); // c4 below the first course

    let dread = PluckedStem::new(dread_pack, SAMPLE_RATE).expect("dreadnought modes");
    let uke = PluckedStem::new(uke_pack, SAMPLE_RATE).expect("ukulele modes");
    assert!(dread.body_mode_count() > 8);
    assert!(uke.body_mode_count() > 8);
    // Air and plate modes carry explicit identities. The braced (1,1) plate
    // target near 216 Hz is not substituted for the lower cavity resonance.
    assert!(body_contains_mode(&dread, 98.0));
    let uke_air = body_mode_frequency(&uke, BodyModeKind::HelmholtzAir).expect("uke air mode");
    let uke_plate = body_mode_frequency(
        &uke,
        BodyModeKind::StructuralPlate {
            longitudinal: 1,
            radial: 1,
        },
    )
    .expect("uke (1,1) plate mode");
    assert!(relative_error(uke_air, expected_uke_air) < 1.0e-12);
    assert!(
        (uke_plate - 216.096).abs() < 0.01,
        "plate mode was {uke_plate}"
    );
    assert!(uke_plate - uke_air > 20.0, "air and plate modes collapsed");
    assert!(!body_contains_mode(&uke, 610.0));
    assert_ne!(
        dread
            .body_mode_frequency_hz(0)
            .expect("dread first")
            .to_bits(),
        uke.body_mode_frequency_hz(0).expect("uke first").to_bits()
    );

    // All requested family constructors must independently admit the shared
    // core. This is constructor/physics coverage, not a sound-quality claim.
    PluckedStem::new(archtop_pack(), SAMPLE_RATE).expect("archtop pack");
    PluckedStem::new(marshall_electric_pack(), SAMPLE_RATE).expect("electric pack");
    PluckedStem::new(upright_bass_pack(), SAMPLE_RATE).expect("upright pack");
}

#[test]
fn marshall_pickup_and_amp_compress_drive_and_recover_supply() {
    let stem = PluckedStem::new(marshall_electric_pack(), SAMPLE_RATE).expect("electric core");
    let tenth = stem
        .pickup_modal_residue(0, 10)
        .expect("tenth pickup residue");
    let eleventh = stem
        .pickup_modal_residue(0, 11)
        .expect("eleventh pickup residue");
    let twelfth = stem
        .pickup_modal_residue(0, 12)
        .expect("twelfth pickup residue");
    assert!(
        eleventh.abs() < 0.16 * tenth.abs().min(twelfth.abs()),
        "pickup position must create its predicted harmonic comb notch"
    );

    // Actual string velocity at a bridge pickup is O(0.01 m/s) for a very
    // light touch and O(1 m/s) under a hard pick; these exercise the authored
    // pickup sensitivity rather than feeding arbitrary near-zero voltages.
    let low_input = 0.01;
    let high_input = 2.0;
    let (low, low_supply, _) = amplifier_capture(low_input, 125.0);
    let (high, high_supply, mut driven) = amplifier_capture(high_input, 125.0);
    let low_rms = rms(&low);
    let high_rms = rms(&high);
    let input_ratio = high_input / low_input;
    let output_ratio = high_rms / low_rms;
    assert!(high_rms > 2.0 * low_rms, "drive ceased responding to level");
    assert!(
        output_ratio < 0.45 * input_ratio,
        "nonlinear power path did not compress: input ratio {input_ratio}, output {output_ratio}"
    );
    assert!(
        high_supply < low_supply - 0.08,
        "high drive did not discharge the supply: low {low_supply}, high {high_supply}"
    );

    let sagged = driven.amplifier_supply_fraction().expect("sagged supply");
    for _ in 0..SAMPLE_RATE as usize {
        let output = driven.process_electric_pickup_sample(0.0);
        assert!(output.is_finite());
    }
    let recovered = driven
        .amplifier_supply_fraction()
        .expect("recovered supply");
    assert!(recovered > sagged + 0.05 && recovered <= 1.0);
}

#[test]
fn marshall_drive_enriches_harmonics_and_remains_bounded() {
    let frequency_hz = 125.0;
    let (clean, _, _) = amplifier_capture(0.01, frequency_hz);
    let (driven, _, _) = amplifier_capture(2.5, frequency_hz);
    let clean_fundamental = harmonic_amplitude(&clean, frequency_hz, 1);
    let driven_fundamental = harmonic_amplitude(&driven, frequency_hz, 1);
    let clean_harmonics = (2..=6)
        .map(|harmonic| harmonic_amplitude(&clean, frequency_hz, harmonic).powi(2))
        .sum::<f64>()
        .sqrt();
    let driven_harmonics = (2..=6)
        .map(|harmonic| harmonic_amplitude(&driven, frequency_hz, harmonic).powi(2))
        .sum::<f64>()
        .sqrt();
    let clean_thd = clean_harmonics / clean_fundamental;
    let driven_thd = driven_harmonics / driven_fundamental;
    assert!(driven_fundamental > 0.0 && driven_fundamental.is_finite());
    assert!(
        driven_thd > clean_thd * 2.0 && driven_thd > 0.03,
        "drive did not enrich harmonics: clean THD {clean_thd}, driven {driven_thd}"
    );

    let mut stressed =
        PluckedStem::new(marshall_electric_pack(), SAMPLE_RATE).expect("stability stem");
    let mut peak = 0.0f64;
    for frame in 0..(2 * SAMPLE_RATE as usize) {
        let input = 10.0 * (2.0 * core::f64::consts::PI * 997.0 * frame as f64 / SAMPLE_RATE).sin();
        let output = stressed.process_electric_pickup_sample(input);
        assert!(output.is_finite(), "stress output non-finite at {frame}");
        peak = peak.max(output.abs());
        let supply = stressed.amplifier_supply_fraction().expect("stress supply");
        assert!((0.62..=1.0).contains(&supply));
    }
    assert!(
        peak > 0.0 && peak < 10.0,
        "cabinet output escaped bound: {peak}"
    );
}

#[test]
fn retained_state_is_deterministic_and_exposes_acoustic_and_electric_taps() {
    let mut acoustic = PluckedStem::new(dreadnought_pack(), SAMPLE_RATE).expect("acoustic");
    acoustic
        .begin_pluck(PluckGesture::soft_finger(1, 0, 1))
        .expect("finger pluck");
    let mut max_acoustic = 0.0f64;
    for _ in 0..2_000 {
        let taps = acoustic.step();
        max_acoustic = max_acoustic.max(taps.acoustic_body_volume_velocity_m3_per_s.abs());
        assert_eq!(taps.electric_pickup_velocity_m_per_s, 0.0);
        assert_eq!(taps.electric_cabinet_pressure_pa_at_1m, 0.0);
    }
    assert!(max_acoustic > 0.0);
    let body_before_second_gesture = acoustic.body_energy_j();
    acoustic
        .begin_pluck(PluckGesture::medium_pick(2, 0, -1))
        .expect("second pluck");
    assert_eq!(
        acoustic.body_energy_j().to_bits(),
        body_before_second_gesture.to_bits(),
        "starting a new note must not reset retained body state"
    );

    let mut clone = acoustic.clone();
    for _ in 0..1_024 {
        let left = acoustic.step();
        let right = clone.step();
        assert_eq!(
            left.direct_string_velocity_m_per_s.to_bits(),
            right.direct_string_velocity_m_per_s.to_bits()
        );
        assert_eq!(
            left.bridge_velocity_m_per_s.to_bits(),
            right.bridge_velocity_m_per_s.to_bits()
        );
        assert_eq!(
            left.total_mechanical_energy_j.to_bits(),
            right.total_mechanical_energy_j.to_bits()
        );
    }

    let mut electric =
        PluckedStem::new(marshall_electric_pack(), SAMPLE_RATE).expect("electric source");
    electric
        .begin_pluck(PluckGesture::medium_pick(0, 0, 1))
        .expect("electric pluck");
    let mut max_pickup = 0.0f64;
    let mut max_cabinet = 0.0f64;
    for _ in 0..2_000 {
        let taps = electric.step();
        max_pickup = max_pickup.max(taps.electric_pickup_velocity_m_per_s.abs());
        assert!(taps.electric_cabinet_pressure_pa_at_1m.is_finite());
        max_cabinet = max_cabinet.max(taps.electric_cabinet_pressure_pa_at_1m.abs());
    }
    assert!(
        max_pickup > 1.0e-5,
        "electric source must expose a pickup tap"
    );
    assert!(
        max_cabinet > 0.0,
        "pickup must drive retained amp/cabinet state"
    );
}

#[test]
fn plk2_abi_maps_every_supported_pitch_to_a_physical_course_and_fret() {
    for pack in [
        PLK2_ARCHTOP_PACK,
        PLK2_MARSHALL_ELECTRIC_PACK,
        PLK2_DREADNOUGHT_PACK,
    ] {
        for midi in 40..=88 {
            let (string, fret) = plk2_string_fret(pack, midi).expect("guitar mapping");
            assert!(string < 6 && fret <= 24, "pack {pack}, MIDI {midi}");
        }
        assert_eq!(plk2_string_fret(pack, 40), Some((0, 0)));
        assert_eq!(plk2_string_fret(pack, 45), Some((1, 0)));
        assert_eq!(plk2_string_fret(pack, 64), Some((5, 0)));
        assert_eq!(plk2_string_fret(pack, 88), Some((5, 24)));
    }
    for midi in 60..=93 {
        let (string, fret) = plk2_string_fret(PLK2_UKULELE_PACK, midi).expect("ukulele mapping");
        assert!(string < 4 && fret <= 24, "uke MIDI {midi}");
    }
    assert_eq!(plk2_string_fret(PLK2_UKULELE_PACK, 60), Some((1, 0)));
    assert_eq!(plk2_string_fret(PLK2_UKULELE_PACK, 64), Some((2, 0)));
    assert_eq!(plk2_string_fret(PLK2_UKULELE_PACK, 67), Some((0, 0)));
    assert_eq!(plk2_string_fret(PLK2_UKULELE_PACK, 69), Some((3, 0)));
    assert_eq!(plk2_string_fret(PLK2_UKULELE_PACK, 93), Some((3, 24)));

    assert_eq!(plk2_string_fret(PLK2_DREADNOUGHT_PACK, 39), None);
    assert_eq!(plk2_string_fret(PLK2_UKULELE_PACK, 59), None);
    assert_eq!(plk2_string_fret(99, 64), None);
    assert_eq!(plk2_note_frames(PLK2_ARCHTOP_PACK, 40, 48_000.0), 192_000);
    assert_eq!(
        plk2_note_frames(PLK2_MARSHALL_ELECTRIC_PACK, 40, 48_000.0),
        168_000
    );
    assert_eq!(
        plk2_note_frames(PLK2_DREADNOUGHT_PACK, 40, 48_000.0),
        240_000
    );
    assert_eq!(plk2_note_frames(PLK2_UKULELE_PACK, 60, 48_000.0), 144_000);
    assert_eq!(
        plk2_render_path(PLK2_MARSHALL_ELECTRIC_PACK),
        Some(PluckedRenderPath::ElectricCabinetRadiation)
    );
    for pack in [PLK2_ARCHTOP_PACK, PLK2_DREADNOUGHT_PACK, PLK2_UKULELE_PACK] {
        assert_eq!(
            plk2_render_path(pack),
            Some(PluckedRenderPath::AcousticBodyRadiation)
        );
    }
}

#[test]
fn plk2_abi_refuses_invalid_or_overlapping_host_buffers() {
    assert_eq!(plk2_note_frames(-1, 64, 48_000.0), 0);
    assert_eq!(plk2_note_frames(PLK2_DREADNOUGHT_PACK, 39, 48_000.0), 0);
    assert_eq!(plk2_note_frames(PLK2_UKULELE_PACK, 94, 48_000.0), 0);
    assert_eq!(plk2_note_frames(PLK2_DREADNOUGHT_PACK, 64, 7_999.0), 0);
    assert_eq!(plk2_note_frames(PLK2_DREADNOUGHT_PACK, 64, f32::NAN), 0);

    let mut short_left = [0.0f32; 31];
    let mut short_right = [0.0f32; 31];
    assert_eq!(
        plk2_render_slices(
            PLK2_DREADNOUGHT_PACK,
            64,
            96,
            48_000.0,
            &mut short_left,
            &mut short_right,
            32,
        ),
        0
    );
    let mut overlap = [0.0f32; 256];
    assert_eq!(
        plk2_render(
            PLK2_DREADNOUGHT_PACK,
            64,
            96,
            48_000.0,
            overlap.as_mut_ptr(),
            overlap.as_mut_ptr(),
            overlap.len() as i32,
        ),
        0
    );
    assert_eq!(
        plk2_render(
            PLK2_DREADNOUGHT_PACK,
            64,
            96,
            48_000.0,
            core::ptr::null_mut(),
            overlap.as_mut_ptr(),
            overlap.len() as i32,
        ),
        0
    );
}

#[test]
fn plk2_raw_abi_matches_the_safe_caller_scratch_path_bit_for_bit() {
    assert!(
        core::mem::size_of::<PluckedStem>() <= 64 * 1_024,
        "renderer state exceeded the bounded WASM stack budget"
    );
    let frames = 2_048usize;
    let mut safe_left = vec![0.0f32; frames];
    let mut safe_right = vec![0.0f32; frames];
    let mut raw_left = vec![0.0f32; frames];
    let mut raw_right = vec![0.0f32; frames];
    assert_eq!(
        plk2_render_slices(
            PLK2_DREADNOUGHT_PACK,
            52,
            91,
            48_000.0,
            &mut safe_left,
            &mut safe_right,
            frames as i32,
        ),
        frames as i32
    );
    assert_eq!(
        plk2_render(
            PLK2_DREADNOUGHT_PACK,
            52,
            91,
            48_000.0,
            raw_left.as_mut_ptr(),
            raw_right.as_mut_ptr(),
            frames as i32,
        ),
        frames as i32
    );
    assert_eq!(safe_left, raw_left);
    assert_eq!(safe_right, raw_right);
}

#[test]
fn plk2_all_four_packs_render_finite_nonzero_stereo_at_all_supported_rates() {
    let cases = [
        (PLK2_ARCHTOP_PACK, 52),
        (PLK2_MARSHALL_ELECTRIC_PACK, 52),
        (PLK2_DREADNOUGHT_PACK, 52),
        (PLK2_UKULELE_PACK, 67),
    ];
    for sample_rate in [44_100.0f32, 48_000.0, 96_000.0] {
        for (pack, midi) in cases {
            let frames = 4_096usize;
            assert!(plk2_note_frames(pack, midi, sample_rate) > frames as i32);
            let mut left = vec![0.0f32; frames];
            let mut right = vec![0.0f32; frames];
            assert_eq!(
                plk2_render_slices(
                    pack,
                    midi,
                    104,
                    sample_rate,
                    &mut left,
                    &mut right,
                    frames as i32,
                ),
                frames as i32,
                "pack {pack} at {sample_rate} Hz"
            );
            assert!(left.iter().chain(&right).all(|sample| sample.is_finite()));
            let peak = left
                .iter()
                .chain(&right)
                .map(|sample| sample.abs())
                .fold(0.0f32, f32::max);
            assert!(peak > 1.0e-9, "silent pack {pack} at {sample_rate} Hz");
            assert!(peak < 0.999, "pack {pack} clipped at {sample_rate} Hz");
            assert_ne!(left, right, "course panning collapsed to dual mono");
        }
    }
}

#[test]
fn plk2_fixed_listener_calibration_is_usable_and_velocity_monotonic() {
    let cases = [
        (PLK2_ARCHTOP_PACK, 60, "archtop-C4"),
        (PLK2_MARSHALL_ELECTRIC_PACK, 60, "electric-C4"),
        (PLK2_UKULELE_PACK, 67, "ukulele-G4"),
        (PLK2_DREADNOUGHT_PACK, 60, "dreadnought-C4"),
    ];
    for (pack, midi, label) in cases {
        let frames = plk2_note_frames(pack, midi, SAMPLE_RATE as f32) as usize;
        let mut left = vec![0.0f32; frames];
        let mut right = vec![0.0f32; frames];
        assert_eq!(
            plk2_render_slices(
                pack,
                midi,
                100,
                SAMPLE_RATE as f32,
                &mut left,
                &mut right,
                frames as i32,
            ),
            frames as i32
        );
        let rms = stereo_rms(&left, &right);
        let peak = stereo_peak(&left, &right);
        eprintln!(
            "PLK2_LISTENER_LEVEL {label}: rms={rms:.6}, rms_dbfs={:.2}, peak={peak:.6}, peak_dbfs={:.2}",
            db_ratio(rms, 1.0),
            db_ratio(peak, 1.0),
        );
        // A complete note buffer includes 3--5 seconds of deterministic tail,
        // so its whole-buffer RMS is lower than the sounding part. Keep a
        // family-specific floor here, then require the common active-note mix
        // window below without changing the render duration to game the RMS.
        let full_buffer_rms_floor = match pack {
            PLK2_DREADNOUGHT_PACK => 0.018,
            PLK2_UKULELE_PACK => 0.040,
            _ => 0.045,
        };
        assert!(
            (full_buffer_rms_floor..=0.32).contains(&rms),
            "{label} velocity-100 whole-buffer RMS escaped its usable ensemble window: {rms}"
        );
        assert!(
            (0.12..0.98).contains(&peak),
            "{label} velocity-100 peak escaped the usable unclipped window: {peak}"
        );

        let analysis_frames = (0.75 * SAMPLE_RATE) as usize;
        let mut previous_rms = 0.0;
        for velocity in [24, 48, 72, 100, 127] {
            let mut left = vec![0.0f32; analysis_frames];
            let mut right = vec![0.0f32; analysis_frames];
            assert_eq!(
                plk2_render_slices(
                    pack,
                    midi,
                    velocity,
                    SAMPLE_RATE as f32,
                    &mut left,
                    &mut right,
                    analysis_frames as i32,
                ),
                analysis_frames as i32
            );
            let current_rms = stereo_rms(&left, &right);
            eprintln!("PLK2_VELOCITY_LEVEL {label} velocity={velocity}: rms={current_rms:.6}");
            assert!(
                current_rms > previous_rms,
                "{label} loudness was not strictly monotonic at velocity {velocity}: {previous_rms} -> {current_rms}"
            );
            previous_rms = current_rms;
            if velocity == 100 {
                assert!(
                    (0.045..=0.32).contains(&current_rms),
                    "{label} active velocity-100 RMS escaped -26.9..-9.9 dBFS: {current_rms}"
                );
            }
        }
    }
}

#[test]
fn plk2_fixed_listener_calibration_does_not_clip_across_registers_or_rates() {
    let guitar_midis = [40, 52, 64, 76, 88];
    let ukulele_midis = [60, 67, 79, 93];
    for sample_rate in [44_100.0f32, 48_000.0, 96_000.0] {
        for pack in [
            PLK2_ARCHTOP_PACK,
            PLK2_MARSHALL_ELECTRIC_PACK,
            PLK2_UKULELE_PACK,
            PLK2_DREADNOUGHT_PACK,
        ] {
            let midis: &[i32] = if pack == PLK2_UKULELE_PACK {
                &ukulele_midis
            } else {
                &guitar_midis
            };
            for &midi in midis {
                // Include body/cabinet build-up after the initial contact;
                // onset-only peak checks can miss a later resonant maximum.
                let frames = (1.50 * sample_rate) as usize;
                let mut left = vec![0.0f32; frames];
                let mut right = vec![0.0f32; frames];
                assert_eq!(
                    plk2_render_slices(
                        pack,
                        midi,
                        127,
                        sample_rate,
                        &mut left,
                        &mut right,
                        frames as i32,
                    ),
                    frames as i32
                );
                assert!(left.iter().chain(&right).all(|sample| sample.is_finite()));
                let peak = stereo_peak(&left, &right);
                eprintln!(
                    "PLK2_REGISTER_PEAK pack={pack} midi={midi} rate={sample_rate}: {peak:.6}"
                );
                assert!(
                    peak < 0.98,
                    "fixed listener trim clipped pack {pack}, MIDI {midi} at {sample_rate} Hz: {peak}"
                );
            }
        }
    }
}

#[test]
fn plk2_radiated_pitch_meets_the_independent_fixture_tolerances() {
    // Targets/tolerances are literal values from the independent PHS4 metric
    // and fret fixtures; no production pitch helper supplies the answer.
    let cases = [
        (PLK2_ARCHTOP_PACK, 40, 82.406_889, 4.0),
        (PLK2_MARSHALL_ELECTRIC_PACK, 52, 164.813_778, 4.0),
        (PLK2_DREADNOUGHT_PACK, 76, 659.255_114, 4.0),
        (PLK2_UKULELE_PACK, 67, 391.995_436, 5.0),
    ];
    for sample_rate in [44_100.0f32, 48_000.0, 96_000.0] {
        let frames = (0.80 * sample_rate) as usize;
        let analysis_start = (0.10 * sample_rate) as usize;
        let analysis_end = (0.75 * sample_rate) as usize;
        for (pack, midi, target_hz, tolerance_cents) in cases {
            let mut left = vec![0.0f32; frames];
            let mut right = vec![0.0f32; frames];
            assert_eq!(
                plk2_render_slices(
                    pack,
                    midi,
                    100,
                    sample_rate,
                    &mut left,
                    &mut right,
                    frames as i32,
                ),
                frames as i32
            );
            let analysis = &left[analysis_start..analysis_end];
            let (cents, amplitude) = estimate_pitch_cents(analysis, sample_rate as f64, target_hz);
            let peak = analysis
                .iter()
                .map(|sample| sample.abs() as f64)
                .fold(0.0, f64::max);
            assert!(
                amplitude > peak * 1.0e-4,
                "pack {pack} at {sample_rate} Hz had no measurable target-pitch component"
            );
            assert!(
                cents.abs() <= tolerance_cents,
                "pack {pack} at {sample_rate} Hz offset {cents} cents exceeds {tolerance_cents}"
            );
        }
    }
}

#[test]
fn plk2_pack_spectra_are_distinct_and_electric_uses_the_cabinet_path() {
    let frames = 8_192usize;
    let midi = 67;
    let target_hz = 391.995_436;
    let mut profiles = [[0.0; 8]; 4];
    for pack in 0..=3 {
        let mut left = vec![0.0f32; frames];
        let mut right = vec![0.0f32; frames];
        assert_eq!(
            plk2_render_slices(
                pack,
                midi,
                112,
                48_000.0,
                &mut left,
                &mut right,
                frames as i32,
            ),
            frames as i32
        );
        // The independent family signature includes the finite contact and
        // early body/amp response, where pluck width and position are audible;
        // a late tail naturally converges toward the shared string fundamental.
        profiles[pack as usize] = harmonic_profile(&left[256..8_192], 48_000.0, target_hz);
    }
    for left in 0..profiles.len() {
        for right in left + 1..profiles.len() {
            let distance = profile_distance(profiles[left], profiles[right]);
            assert!(
                distance > 0.015,
                "pack spectra {left} and {right} collapsed: {distance}"
            );
        }
    }
    assert_eq!(
        plk2_render_path(PLK2_MARSHALL_ELECTRIC_PACK),
        Some(PluckedRenderPath::ElectricCabinetRadiation)
    );
    assert!(
        profiles[PLK2_MARSHALL_ELECTRIC_PACK as usize][1..]
            .iter()
            .sum::<f64>()
            > 0.05,
        "nonlinear amp/cabinet path lost its harmonic output"
    );
}

#[test]
fn plk2_radiation_retains_audible_string_partials_and_a_decaying_tail() {
    let electric_decay = electric_stage_decay(59, 72);
    eprintln!("PLK2_ELECTRIC_STAGE_DECAY {electric_decay:?}");
    assert!(
        electric_decay.0 .1 < 0.5 * electric_decay.0 .0,
        "the pickup-side string did not physically decay: {electric_decay:?}"
    );
    assert!(
        electric_decay.1 .1 < 1.42 * electric_decay.1 .0,
        "the compressed cabinet envelope grew by more than 3 dB: {electric_decay:?}"
    );
    let cases = [
        (PLK2_ARCHTOP_PACK, 60, 108, "archtop-C4"),
        (PLK2_MARSHALL_ELECTRIC_PACK, 59, 72, "electric-B3-medium"),
        (PLK2_DREADNOUGHT_PACK, 60, 108, "dreadnought-C4"),
        (PLK2_UKULELE_PACK, 67, 108, "ukulele-G4"),
        (PLK2_MARSHALL_ELECTRIC_PACK, 76, 108, "electric-E5-loud"),
    ];
    let mut failures = Vec::new();
    for (pack, midi, velocity, label) in cases {
        let spectrum = render_spectrum(pack, midi, velocity);
        eprintln!(
            "PLK2_SPECTRUM {label}: partial_db={:?}, upper_energy_db={:.2}, count={}, early_rms={:.6e}, comparison_tail_rms={:.6e}, comparison_tail_db={:.2}, late_rms={:.6e}, late_db={:.2}",
            spectrum.relative_partial_db,
            spectrum.upper_partial_energy_db,
            spectrum.audible_upper_partials,
            spectrum.early_rms,
            spectrum.comparison_tail_rms,
            db_ratio(spectrum.comparison_tail_rms, spectrum.early_rms),
            spectrum.late_rms,
            db_ratio(spectrum.late_rms, spectrum.early_rms),
        );
        let tail_is_bounded = if pack == PLK2_MARSHALL_ELECTRIC_PACK {
            // A driven reference can hold nearly constant while the pickup
            // decays because the power stage releases compression.  The
            // stage-specific assertion above proves that a decaying physical
            // source, rather than a hidden oscillator, feeds this bounded
            // cabinet envelope.
            spectrum.late_rms < 1.42 * spectrum.early_rms
        } else {
            spectrum.late_rms < spectrum.early_rms
        };
        if !spectrum_has_a_plucked_string_comb(spectrum)
            || spectrum.early_rms <= 1.0e-9
            || spectrum.late_rms <= spectrum.early_rms * 1.0e-3
            || !tail_is_bounded
        {
            failures.push((label, spectrum));
        }
    }

    // Planted negative: a clean one-mode oscillator has perfect pitch and a
    // nonzero tail, but must not pass a string-richness gate merely because
    // those easier observables are green.
    let fundamental_only = RadiatedSpectrum {
        relative_partial_db: [
            0.0, -120.0, -120.0, -120.0, -120.0, -120.0, -120.0, -120.0, -120.0, -120.0,
        ],
        upper_partial_energy_db: -120.0,
        audible_upper_partials: 0,
        early_rms: 0.1,
        comparison_tail_rms: 0.075,
        late_rms: 0.05,
    };
    assert!(!spectrum_has_a_plucked_string_comb(fundamental_only));
    let harmonic_explosion = RadiatedSpectrum {
        relative_partial_db: [20.0; 10],
        upper_partial_energy_db: 29.5,
        audible_upper_partials: 9,
        early_rms: 0.1,
        comparison_tail_rms: 0.075,
        late_rms: 0.05,
    };
    assert!(!spectrum_has_a_plucked_string_comb(harmonic_explosion));
    assert!(failures.is_empty(), "radiation failures: {failures:?}");
}
