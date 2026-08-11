#[path = "../src/vibes_v2.rs"]
mod vibes_v2;

use vibes_v2::{
    canonical_bar_resonator_inertial_coupling, free_bar_radiation_transfer_for_test,
    geometry_for_midi, hertz_collision_duration_seconds_for_test,
    hertz_patch_half_width_over_length_for_test, midi_frequency_hz,
    projected_hertz_patch_moments_for_test, rayleigh_radiation_is_resolved, vbs2_render,
    StrikeGesture, VibesControls, VibesError, VibesParameters, VibraphoneStem, VibraphoneVoice,
    BAR_MODES, MAX_FAN_RATE_HZ, MAX_MIDI, MIN_MIDI, VIBES_V2_MODAL_AUTHORITY_SHA256,
    VIBES_V2_MODAL_GENERATOR_SHA256, VIBES_V2_MODAL_PACK_INPUT_SHA256,
    VIBES_V2_MODAL_PACK_SOLVER_ID,
};

const SAMPLE_RATE: f64 = 48_000.0;

fn voice(midi: i32) -> VibraphoneVoice {
    VibraphoneVoice::new(midi, SAMPLE_RATE, VibesParameters::canonical()).unwrap()
}

fn render_voice(
    midi: i32,
    hardness: f64,
    controls: VibesControls,
    frames: usize,
) -> (VibraphoneVoice, Vec<f64>) {
    let mut model = voice(midi);
    model
        .begin_strike(StrikeGesture::from_velocity(96, hardness).unwrap())
        .unwrap();
    let mut output = Vec::with_capacity(frames);
    for _ in 0..frames {
        output.push(model.step(controls).unwrap().radiated_pressure_pa);
    }
    (model, output)
}

#[test]
fn generated_eigenpack_is_consumed_without_global_template_fakery() {
    let cases = [
        (
            53,
            0.375_908_058_204_514_7,
            0.057,
            0.545_764_623_560_671_5,
            3,
        ),
        (60, 0.333, 0.057, 0.528_334_488_506_218_3, 3),
        (
            72,
            0.235_468_254_768_921_6,
            0.048_264_482_804_664_05,
            0.316_337_032_720_263_1,
            3,
        ),
        (
            89,
            0.175_26,
            0.038_130_935_311_404_19,
            0.214_086_054_972_732_6,
            2,
        ),
    ];
    for (midi, length, width, mass, tuned_mode_count) in cases {
        let geometry = geometry_for_midi(midi).unwrap();
        assert!((geometry.length_m - length).abs() < 1.0e-12);
        assert!((geometry.width_m - width).abs() < 1.0e-12);
        assert!((geometry.thickness_m - 0.013).abs() < 1.0e-12);
        assert!((geometry.mass_kg - mass).abs() < 1.0e-12);
        assert_eq!(geometry.tuned_mode_count, tuned_mode_count);
        let pitch_cents = 1200.0 * (geometry.fundamental_hz / midi_frequency_hz(midi)).log2();
        assert!(pitch_cents.abs() < 2.0, "midi={midi} cents={pitch_cents}");
    }

    let c4 = geometry_for_midi(60).unwrap();
    assert!((c4.mode_frequencies_hz[0] - 261.627_947_060_706_7).abs() < 1.0e-9);
    assert!((c4.mode_frequencies_hz[1] - 1_046.515_467_877_176).abs() < 1.0e-9);
    assert!((c4.mode_frequencies_hz[2] - 2_616.293_249_129_842).abs() < 1.0e-9);
    assert!((c4.mode_shapes_m_neg_half_kg[0][0] as f64 + 2.299_636_97).abs() < 1.0e-6);
    assert!((c4.mode_shapes_m_neg_half_kg[0][16] as f64 - 2.312_151_99).abs() < 1.0e-6);
    assert!((c4.mode_shapes_m_neg_half_kg[1][8] as f64 + 1.444_392_77).abs() < 1.0e-6);
    assert!(c4.mode_shapes_m_neg_half_kg[1][16].abs() < 1.0e-8);
    // The old runtime sine template was -1 at this quarter-span point and
    // therefore cannot certify the generated mass-normalized eigenvector.
    assert!((c4.mode_shapes_m_neg_half_kg[1][8] as f64 + 1.0).abs() > 0.4);

    let low = geometry_for_midi(53).unwrap();
    let high = geometry_for_midi(89).unwrap();
    assert!(low.length_m > 2.1 * high.length_m);
    assert!(low.width_m > high.width_m);
    assert_eq!(low.tuned_mode_count, 3);
    assert_eq!(high.tuned_mode_count, 2);

    assert_eq!(
        VIBES_V2_MODAL_PACK_INPUT_SHA256,
        "475e23aeafeaa60fa6699adcbfb056fe6c1496993648aaec223ee078ced2f710"
    );
    assert_eq!(
        VIBES_V2_MODAL_AUTHORITY_SHA256,
        "722ea241538ace173c269f32a3c25671420ae76ad4c5f82bba430148b655fb1e"
    );
    assert_eq!(
        VIBES_V2_MODAL_GENERATOR_SHA256,
        "71d02485f3cd2d51b37483fd93eef7ee1172ca5c14645bd2416a2afbe177a4a3"
    );
    assert_eq!(
        VIBES_V2_MODAL_PACK_SOLVER_ID,
        "changes.foundry.stepped-free-free-euler-bernoulli-beam.v1"
    );
}

#[test]
fn every_resonator_is_cut_to_its_key_instead_of_interpolating_length() {
    for midi in MIN_MIDI..=MAX_MIDI {
        let model = voice(midi);
        let cents = 1200.0 * (model.resonator_frequency_hz() / midi_frequency_hz(midi)).log2();
        assert!(cents.abs() < 0.01, "midi={midi} cents={cents}");
    }
}

#[test]
fn bar_tube_coupling_and_free_bar_radiation_exclude_the_old_near_misses() {
    // Independent C4 evaluation of Soares Eq. 22/24/31 at d/a=.4 and
    // xe/L=.5. The former implementation omitted cos(omega*Lphysical/c),
    // yielding -0.031586 instead of the physical -0.002693 coupling. The
    // known answer uses the generated pack's f32-quantized centre mode shape,
    // exactly as the no_std runtime does.
    let coupling = canonical_bar_resonator_inertial_coupling(60).unwrap();
    assert!(
        (coupling - -0.002_692_595_193_558_805).abs() < 1.0e-12,
        "coupling={coupling:.18}"
    );
    assert!((coupling - -0.031_586_114_583_910_99).abs() > 0.02);

    // The reviewed Soares multi-modal mass matrix is not the former 2-DOF
    // fundamental-only shortcut.  At C4 its first three closed-open acoustic
    // modes are exactly the 1:3:5 sequence.  The centre-mounted tube retains
    // a material coupling to symmetric bar mode 3, while the antisymmetric
    // mode's centre node remains a genuine geometric zero.
    let model = voice(60);
    let fundamental = model.resonator_mode_frequency_hz(0).unwrap();
    assert!((model.resonator_mode_frequency_hz(1).unwrap() / fundamental - 3.0).abs() < 1.0e-12);
    assert!((model.resonator_mode_frequency_hz(2).unwrap() / fundamental - 5.0).abs() < 1.0e-12);
    assert!(model.inertial_coupling(2, 1).unwrap().abs() > 0.003);
    assert!(model.inertial_coupling(1, 1).unwrap().abs() < 1.0e-12);

    // The one-metre C4 free-bar transfer is the front-minus-back dipole at a
    // fixed 30-degree listener angle. A one-sided baffled result is orders
    // stronger and would make the attack peak immediately instead of letting
    // the tuned resonator build. A listener placed on the exact bar-centre
    // symmetry axis is the other near miss: it erases the tuned antisymmetric
    // 4f partial, so the mode-1 transfer must remain materially nonzero.
    let (real, imaginary) = free_bar_radiation_transfer_for_test(60, 0).unwrap();
    assert!(
        (real - 0.001_739_035_466_701_192).abs() < 1.0e-12,
        "real={real:.18} imaginary={imaginary:.18}"
    );
    assert!(
        (imaginary - -0.003_100_071_129_020_549).abs() < 1.0e-12,
        "real={real:.18} imaginary={imaginary:.18}"
    );
    // Plant the baffled-piston 2G normalization explicitly. Applying that
    // half-space kernel to an unbaffled two-face bar doubles its direct field.
    assert!((real - 0.003_478_070_933_402_384).abs() > 1.0e-3);
    let magnitude = (real * real + imaginary * imaginary).sqrt();
    assert!(magnitude < 0.01);
    let (fourth_real, fourth_imaginary) = free_bar_radiation_transfer_for_test(60, 1).unwrap();
    assert!((fourth_real - 0.076_595_200_382_064_15).abs() < 1.0e-12);
    assert!((fourth_imaginary - -0.233_007_867_204_461_5).abs() < 1.0e-12);
    assert!(
        (fourth_real * fourth_real + fourth_imaginary * fourth_imaginary).sqrt() > 50.0 * magnitude
    );
}

#[test]
fn every_declared_key_constructs_at_every_supported_rate_without_aliasing() {
    for sample_rate in [8_000.0, 44_100.0, 48_000.0, 96_000.0] {
        for midi in MIN_MIDI..=MAX_MIDI {
            let model = VibraphoneVoice::new(midi, sample_rate, VibesParameters::canonical())
                .unwrap_or_else(|error| panic!("midi {midi} rate {sample_rate}: {error:?}"));
            assert!(model.resolved_mode_count() >= 1);
            assert!(model.resolved_mode_count() <= BAR_MODES);
            let resonator_fundamental = model.resonator_frequency_hz();
            let expected_resonator_modes = [1.0, 3.0, 5.0]
                .into_iter()
                .filter(|harmonic| harmonic * resonator_fundamental < 0.44 * sample_rate)
                .count();
            assert_eq!(
                model.resolved_resonator_mode_count(),
                expected_resonator_modes,
                "midi={midi} rate={sample_rate}"
            );
            let geometry = model.geometry();
            let element_length_m = geometry.length_m / 32.0;
            for index in 0..model.resolved_mode_count() {
                let frequency = model.mode_frequency_hz(index).unwrap();
                assert!(frequency < 0.44 * sample_rate, "midi {midi} mode {index}");
                assert!(
                    rayleigh_radiation_is_resolved(element_length_m, frequency),
                    "midi={midi} rate={sample_rate} mode={index} frequency={frequency}"
                );
            }
            for index in model.resolved_mode_count()..BAR_MODES {
                assert!(model.mode_frequency_hz(index).is_none());
            }
        }
    }
}

#[test]
fn rayleigh_radiation_culls_an_underresolved_mode_instead_of_muting_it() {
    // A 10 mm source cell has five cells per wavelength at 6864.2 Hz and
    // seven at 4903 Hz under the fixed 343.21 m/s air law.
    assert!(!rayleigh_radiation_is_resolved(0.010, 6_864.2));
    assert!(rayleigh_radiation_is_resolved(0.010, 4_903.0));
    assert!(!rayleigh_radiation_is_resolved(f64::NAN, 4_903.0));
    assert!(!rayleigh_radiation_is_resolved(0.010, f64::INFINITY));
}

#[test]
fn finite_mass_contact_closes_an_independent_energy_budget() {
    let gesture = StrikeGesture::from_velocity(104, 0.55).unwrap();
    let initial = gesture.impact_energy_j;
    let mut model = voice(65);
    model.begin_strike(gesture).unwrap();
    let mut maximum_budget = 0.0_f64;
    for _ in 0..2_000 {
        model.step(VibesControls::PEDAL_DOWN_MOTOR_OFF).unwrap();
        let budget = model.total_energy_j()
            + model.retained_mallet_energy_j()
            + model.contact_dissipated_energy_j()
            + model.cumulative_loss_j();
        maximum_budget = maximum_budget.max(budget);
        assert!(
            budget <= initial * 1.015 + 1.0e-10,
            "budget={budget} initial={initial}"
        );
    }
    assert!(!model.contact_active());
    assert!(model.total_energy_j() > 1.0e-6);
    assert!(maximum_budget > 0.8 * initial);
}

#[test]
fn contact_budget_is_passive_for_every_key_and_supported_rate() {
    for sample_rate in [8_000.0, 44_100.0, 48_000.0, 96_000.0] {
        for midi in MIN_MIDI..=MAX_MIDI {
            let gesture = StrikeGesture::from_velocity(104, 0.55).unwrap();
            let initial = gesture.impact_energy_j;
            let mut model =
                VibraphoneVoice::new(midi, sample_rate, VibesParameters::canonical()).unwrap();
            model.begin_strike(gesture).unwrap();
            let frames = (0.025 * sample_rate).ceil() as usize;
            for frame in 0..frames {
                model.step(VibesControls::PEDAL_DOWN_MOTOR_OFF).unwrap();
                let budget = model.total_energy_j()
                    + model.retained_mallet_energy_j()
                    + model.contact_dissipated_energy_j()
                    + model.cumulative_loss_j();
                assert!(
                    budget <= initial * 1.015 + 1.0e-10,
                    "midi={midi} rate={sample_rate} frame={frame} budget={budget} initial={initial} bar={} mallet={} contact_loss={} system_loss={}",
                    model.total_energy_j(),
                    model.retained_mallet_energy_j(),
                    model.contact_dissipated_energy_j(),
                    model.cumulative_loss_j(),
                );
            }
        }
    }
}

#[test]
fn intrinsic_mode_t60_reaches_minus_sixty_db_amplitude() {
    for midi in [53, 60, 72, 89] {
        let model = voice(midi);
        let t60 = model.geometry().t60_seconds[0];
        let energy_ratio = model.intrinsic_mode_energy_ratio_for_test(0, t60).unwrap();
        let energy_db = 10.0 * energy_ratio.log10();
        assert!(
            (-61.0..=-59.0).contains(&energy_db),
            "midi={midi} energy_db={energy_db} ratio={energy_ratio}"
        );
    }
}

#[test]
fn adversarial_contact_parameters_refuse_instead_of_injecting_energy() {
    let mut gesture = StrikeGesture::from_velocity(96, 0.5).unwrap();
    gesture.contact_damping_seconds_per_m = 1.0e6;
    assert_eq!(
        voice(65).begin_strike(gesture),
        Err(VibesError::InvalidContact)
    );

    let mut inconsistent = StrikeGesture::from_velocity(96, 0.5).unwrap();
    inconsistent.impact_energy_j *= 0.1;
    assert_eq!(
        voice(65).begin_strike(inconsistent),
        Err(VibesError::InvalidContact)
    );

    let mut inconsistent_duration = StrikeGesture::from_velocity(96, 0.5).unwrap();
    inconsistent_duration.contact_duration_seconds *= 2.0;
    assert_eq!(
        voice(65).begin_strike(inconsistent_duration),
        Err(VibesError::InvalidContact)
    );

    let mut inconsistent_force = StrikeGesture::from_velocity(96, 0.5).unwrap();
    inconsistent_force.peak_force_n *= 0.5;
    assert_eq!(
        voice(65).begin_strike(inconsistent_force),
        Err(VibesError::InvalidContact)
    );

    // A zero-speed gesture has zero kinetic energy and makes the duration
    // expression 0/0. Derived NaNs must not make the cross-field comparisons
    // fail open.
    let mut stationary = StrikeGesture::from_velocity(1, 0.5).unwrap();
    stationary.strike_velocity_m_per_s = 0.0;
    stationary.impact_energy_j = 0.0;
    stationary.peak_force_n = 0.0;
    assert_eq!(
        voice(65).begin_strike(stationary),
        Err(VibesError::InvalidContact)
    );
}

#[test]
fn strike_position_and_finite_patch_control_modes_at_the_contact_port() {
    let (zeroth, first, second) = projected_hertz_patch_moments_for_test();
    assert!((zeroth - 1.0).abs() < 1.0e-15);
    assert!(first.abs() < 1.0e-15);
    assert!((second - 0.2).abs() < 1.0e-15);
    // A uniform line patch has normalized second moment 1/3. It is not the
    // projected circular Hertz pressure law used by the contact port.
    assert!((second - 1.0 / 3.0).abs() > 0.1);
    let patch_half_width = hertz_patch_half_width_over_length_for_test(0.018, 0.001, 0.30);
    let expected_half_width = (0.018_f64 * 0.001).sqrt() / 0.30;
    assert!((patch_half_width - expected_half_width).abs() < 1.0e-15);
    // The mallet head radius is curvature geometry, not the pressure-patch
    // half-width. Treating all 18 mm as loaded was the former near miss.
    assert!((patch_half_width - 0.018 / 0.30).abs() > 0.04);

    let mut center = StrikeGesture::from_velocity(96, 0.8).unwrap();
    center.strike_position_over_length = 0.5;
    let mut quarter = center;
    quarter.strike_position_over_length = 0.25;
    let mut center_voice = voice(60);
    let mut quarter_voice = voice(60);
    center_voice.begin_strike(center).unwrap();
    quarter_voice.begin_strike(quarter).unwrap();
    for _ in 0..600 {
        center_voice
            .step(VibesControls::PEDAL_DOWN_MOTOR_OFF)
            .unwrap();
        quarter_voice
            .step(VibesControls::PEDAL_DOWN_MOTOR_OFF)
            .unwrap();
    }
    let center_antisymmetric = center_voice.mode_energy_j(1).unwrap();
    let quarter_antisymmetric = quarter_voice.mode_energy_j(1).unwrap();
    assert!(
        quarter_antisymmetric > 100.0 * center_antisymmetric.max(1.0e-20),
        "center={center_antisymmetric:e} quarter={quarter_antisymmetric:e}"
    );

    let (soft, _) = render_voice(60, 0.0, VibesControls::PEDAL_DOWN_MOTOR_OFF, 900);
    let (hard, _) = render_voice(60, 1.0, VibesControls::PEDAL_DOWN_MOTOR_OFF, 900);
    let soft_brightness =
        soft.mode_energy_j(2).unwrap() / soft.mode_energy_j(0).unwrap().max(1.0e-30);
    let hard_brightness =
        hard.mode_energy_j(2).unwrap() / hard.mode_energy_j(0).unwrap().max(1.0e-30);
    assert!(hard_brightness > soft_brightness);

    // A new strike on a ringing bar must initialize the retained mallet at
    // the NEW gesture's power port. The old implementation evaluated
    // `strike_displacement()` before replacing ContactState, so it silently
    // reused the previous quarter-position gesture here.
    let mut new_center = StrikeGesture::from_velocity(72, 0.4).unwrap();
    new_center.strike_position_over_length = 0.5;
    let expected_position = quarter_voice.strike_displacement_for_test(new_center, 0.0);
    let planted_stale_position = quarter_voice.strike_displacement_for_test(quarter, 0.0);
    assert!(
        (expected_position - planted_stale_position).abs() > 1.0e-12,
        "ringing state did not distinguish new={expected_position} stale={planted_stale_position}"
    );
    quarter_voice.begin_strike(new_center).unwrap();
    assert!(
        (quarter_voice.retained_mallet_position_m_for_test() - expected_position).abs() < 1.0e-15
    );
}

#[test]
fn default_contact_duration_is_the_hertz_collision_known_answer() {
    for velocity in [1, 64, 110, 127] {
        for hardness in [0.0, 0.2, 0.5, 1.0] {
            let gesture = StrikeGesture::from_velocity(velocity, hardness).unwrap();
            let derived = hertz_collision_duration_seconds_for_test(
                gesture.mallet_mass_kg,
                gesture.strike_velocity_m_per_s,
                gesture.contact_stiffness_n_per_m_pow_3_over_2,
            );
            assert!(
                (gesture.contact_duration_seconds - derived).abs() < 1.0e-15,
                "velocity={velocity} hardness={hardness} stated={} derived={derived}",
                gesture.contact_duration_seconds,
            );
            let planted_unrelated_duration = 0.0065 - 0.0038 * hardness;
            assert!(
                (gesture.contact_duration_seconds - planted_unrelated_duration).abs() > 1.0e-4,
                "velocity={velocity} hardness={hardness} derived={} planted={planted_unrelated_duration}",
                gesture.contact_duration_seconds,
            );

            let mut struck = voice(65);
            struck.begin_strike(gesture).unwrap();
            let expected_frames = (gesture.contact_duration_seconds * 48_000.0).ceil() as u32;
            assert_eq!(struck.contact_maximum_frames_for_test(), expected_frames);
            let planted_doubled_bound =
                (2.0 * gesture.contact_duration_seconds * 48_000.0).ceil() as u32;
            assert_ne!(expected_frames, planted_doubled_bound);
        }
    }
}

#[test]
fn pedal_up_is_dissipative_and_motor_is_radiation_only() {
    let mut invalid = VibesParameters::canonical();
    invalid.damper_conductance_kg_per_s = -0.01;
    assert_eq!(
        VibraphoneVoice::new(60, SAMPLE_RATE, invalid).unwrap_err(),
        VibesError::NonPassiveDamper
    );

    let (free, off_pcm) = render_voice(60, 0.45, VibesControls::PEDAL_DOWN_MOTOR_OFF, 48_000);
    let (damped, _) = render_voice(
        60,
        0.45,
        VibesControls {
            pedal_position: 0.0,
            ..VibesControls::PEDAL_DOWN_MOTOR_OFF
        },
        48_000,
    );
    assert!(damped.total_energy_j() < free.total_energy_j() * 0.25);
    assert_eq!(free.cumulative_damper_loss_j().to_bits(), 0.0_f64.to_bits());
    assert!(damped.cumulative_damper_loss_j() > 0.0);

    let controls_on = VibesControls {
        pedal_position: 1.0,
        motor_hz: 6.0,
        fan_depth: 0.85,
    };
    let (motor, on_pcm) = render_voice(60, 0.45, controls_on, 48_000);
    assert_eq!(
        free.total_energy_j().to_bits(),
        motor.total_energy_j().to_bits()
    );
    assert_ne!(off_pcm, on_pcm);
    assert_eq!(
        VibesControls {
            motor_hz: MAX_FAN_RATE_HZ + 0.01,
            ..controls_on
        }
        .motor_hz,
        12.01
    );
    let mut probe = voice(60);
    assert_eq!(
        probe.step(VibesControls {
            motor_hz: MAX_FAN_RATE_HZ + 0.01,
            ..controls_on
        }),
        Err(VibesError::InvalidMotor)
    );
}

#[test]
fn shared_stem_retains_pedal_fan_frame_and_cross_bar_sympathy() {
    let mut stem = VibraphoneStem::new(SAMPLE_RATE, VibesParameters::canonical()).unwrap();
    stem.retain_bar(60).unwrap();
    stem.retain_bar(67).unwrap();
    assert_eq!(stem.bar_energy_j(67).unwrap().to_bits(), 0.0_f64.to_bits());
    stem.strike(60, StrikeGesture::from_velocity(100, 0.5).unwrap())
        .unwrap();
    let controls = VibesControls {
        pedal_position: 1.0,
        motor_hz: 5.5,
        fan_depth: 0.7,
    };
    let mut last = None;
    for _ in 0..24_000 {
        last = Some(stem.step(controls).unwrap());
    }
    let output = last.unwrap();
    assert_eq!(output.active_bars, 2);
    assert!(output.radiated_pressure_pa.is_finite());
    assert!(stem.bar_energy_j(67).unwrap() > 1.0e-12);
    let phase = stem.fan_phase_radians();
    assert!(phase > 0.0 && phase < core::f64::consts::TAU);
    let continued = stem.step(controls).unwrap();
    assert!(continued.fan_phase_radians > phase || phase > 6.0);
    assert!(continued.pedal_position > 0.99);
}

#[test]
fn shared_frame_is_invariant_to_bar_insertion_order() {
    let mut ascending = VibraphoneStem::new(SAMPLE_RATE, VibesParameters::canonical()).unwrap();
    ascending.retain_bar(60).unwrap();
    ascending.retain_bar(67).unwrap();
    let mut descending = VibraphoneStem::new(SAMPLE_RATE, VibesParameters::canonical()).unwrap();
    descending.retain_bar(67).unwrap();
    descending.retain_bar(60).unwrap();
    let gesture = StrikeGesture::from_velocity(100, 0.5).unwrap();
    ascending.strike(60, gesture).unwrap();
    descending.strike(60, gesture).unwrap();
    let controls = VibesControls {
        pedal_position: 1.0,
        motor_hz: 5.5,
        fan_depth: 0.7,
    };
    for frame in 0..4_096 {
        let left = ascending.step(controls).unwrap();
        let right = descending.step(controls).unwrap();
        assert_eq!(
            left.radiated_pressure_pa.to_bits(),
            right.radiated_pressure_pa.to_bits(),
            "frame={frame}"
        );
        assert_eq!(
            left.total_mechanical_energy_j.to_bits(),
            right.total_mechanical_energy_j.to_bits(),
            "frame={frame}"
        );
    }
    for midi in [60, 67] {
        assert_eq!(
            ascending.bar_energy_j(midi).unwrap().to_bits(),
            descending.bar_energy_j(midi).unwrap().to_bits(),
            "midi={midi}"
        );
    }
}

#[test]
fn pressure_output_is_finite_distinct_and_deterministic() {
    let (_, left) = render_voice(53, 0.6, VibesControls::PEDAL_DOWN_MOTOR_OFF, 18_000);
    let (_, right) = render_voice(53, 0.6, VibesControls::PEDAL_DOWN_MOTOR_OFF, 18_000);
    let (_, high) = render_voice(89, 0.6, VibesControls::PEDAL_DOWN_MOTOR_OFF, 18_000);
    assert_eq!(left, right);
    assert_ne!(left, high);
    assert!(left.iter().all(|sample| sample.is_finite()));
    assert!(left.iter().any(|sample| sample.abs() > 1.0e-8));
}

#[test]
fn radiated_pressure_is_the_exact_sum_of_free_bar_and_tube_components() {
    for midi in [53, 60, 67, 74, 84] {
        for velocity in [64, 110] {
            let mut model = voice(midi);
            model
                .begin_strike(StrikeGesture::from_velocity(velocity, 0.2).unwrap())
                .unwrap();
            let mut heard_bar = false;
            let mut heard_tube = false;
            for frame in 0..4_096 {
                let output = model.step(VibesControls::PEDAL_DOWN_MOTOR_OFF).unwrap();
                assert_eq!(
                    output.radiated_pressure_pa.to_bits(),
                    (output.bar_pressure_pa + output.tube_pressure_pa).to_bits(),
                    "midi={midi} velocity={velocity} frame={frame}"
                );
                heard_bar |= output.bar_pressure_pa.abs() > 1.0e-12;
                heard_tube |= output.tube_pressure_pa.abs() > 1.0e-12;
            }
            assert!(heard_bar, "midi={midi} velocity={velocity}: silent bar tap");
            assert!(
                heard_tube,
                "midi={midi} velocity={velocity}: silent tube tap"
            );
        }
    }
}

#[test]
fn shipping_abi_refuses_misaligned_and_wrapping_output_ranges_before_slice_construction() {
    const FRAMES: usize = 32;
    let mut raw_left = vec![0_u8; FRAMES * core::mem::size_of::<f32>() + 4];
    let base = raw_left.as_mut_ptr() as usize;
    let misaligned_offset = (0..core::mem::align_of::<f32>())
        .find(|offset| (base + offset) % core::mem::align_of::<f32>() != 0)
        .unwrap();
    let misaligned_left = unsafe { raw_left.as_mut_ptr().add(misaligned_offset) }.cast::<f32>();
    let mut right = [f32::from_bits(0x7f7f_ffff); FRAMES];
    assert_eq!(
        vbs2_render(
            60,
            96,
            SAMPLE_RATE as f32,
            misaligned_left,
            right.as_mut_ptr(),
            FRAMES as i32,
        ),
        0
    );
    assert!(right.iter().all(|sample| sample.to_bits() == 0x7f7f_ffff));

    let dangling_left = core::ptr::NonNull::<f32>::dangling().as_ptr();
    let wrapping_right_address = usize::MAX & !(core::mem::align_of::<f32>() - 1);
    let wrapping_right = wrapping_right_address as *mut f32;
    assert_eq!(
        vbs2_render(
            60,
            96,
            SAMPLE_RATE as f32,
            dangling_left,
            wrapping_right,
            FRAMES as i32,
        ),
        0
    );
}

#[test]
fn shipping_abi_is_audible_bounded_and_dynamic_without_note_fitted_gain() {
    for sample_rate in [44_100.0_f64, 48_000.0, 96_000.0] {
        for midi in [53, 60, 67, 74, 84] {
            let frames = (0.5 * sample_rate) as usize;
            let mut rms = [0.0_f64; 2];
            for (dynamic, velocity) in [64, 110].into_iter().enumerate() {
                let mut left = vec![0.0_f32; frames];
                let mut right = vec![0.0_f32; frames];
                assert_eq!(
                    vbs2_render(
                        midi,
                        velocity,
                        sample_rate as f32,
                        left.as_mut_ptr(),
                        right.as_mut_ptr(),
                        frames as i32,
                    ),
                    frames as i32,
                    "midi={midi} rate={sample_rate} velocity={velocity}"
                );
                let mut squares = 0.0_f64;
                let mut peak = 0.0_f64;
                for (left_sample, right_sample) in left.iter().zip(&right) {
                    assert_eq!(left_sample.to_bits(), right_sample.to_bits());
                    assert!(left_sample.is_finite());
                    let sample = *left_sample as f64;
                    squares += sample * sample;
                    peak = peak.max(sample.abs());
                }
                rms[dynamic] = (squares / frames as f64).sqrt();
                assert!(rms[dynamic] > 1.0e-4, "midi={midi} rate={sample_rate}");
                assert!(
                    peak < 0.98,
                    "midi={midi} rate={sample_rate} velocity={velocity} peak={peak}"
                );
            }
            assert!(
                rms[1] > 1.1 * rms[0],
                "midi={midi} rate={sample_rate} soft={} loud={}",
                rms[0],
                rms[1]
            );
        }
    }
}
