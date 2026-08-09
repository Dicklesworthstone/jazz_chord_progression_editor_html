#[path = "../src/vibes_v2.rs"]
mod vibes_v2;

use vibes_v2::{
    geometry_for_midi, midi_frequency_hz, vbs2_render, StrikeGesture, VibesControls, VibesError,
    VibesParameters, VibraphoneStem, VibraphoneVoice, BAR_MODES, MAX_FAN_RATE_HZ, MAX_MIDI,
    MIN_MIDI,
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
fn reviewed_anchor_pack_is_consumed_without_global_template_fakery() {
    let cases = [
        (53, 0.490, 0.057, 0.013, 9.88, 18.1, 7.5),
        (60, 0.407, 0.052, 0.011, 9.91, 18.2, 6.8),
        (72, 0.292, 0.045, 0.009, 9.95, 18.3, 5.4),
        (89, 0.185, 0.036, 0.007, 10.05, 18.6, 3.6),
    ];
    for (midi, length, width, thickness, ratio3, ratio4, t60) in cases {
        let geometry = geometry_for_midi(midi).unwrap();
        assert!((geometry.length_m - length).abs() < 1.0e-12);
        assert!((geometry.width_m - width).abs() < 1.0e-12);
        assert!((geometry.thickness_m - thickness).abs() < 1.0e-12);
        assert!((geometry.mode_ratios[2] - ratio3).abs() < 1.0e-12);
        assert!((geometry.mode_ratios[3] - ratio4).abs() < 1.0e-12);
        assert!((geometry.t60_seconds[0] - t60).abs() < 1.0e-12);
        assert!((geometry.fundamental_hz - midi_frequency_hz(midi)).abs() < 1.0e-12);
    }

    let low = geometry_for_midi(53).unwrap();
    let high = geometry_for_midi(89).unwrap();
    assert!(low.length_m > 2.6 * high.length_m);
    assert!(low.thickness_m > 1.8 * high.thickness_m);
    assert!(high.mode_ratios[2] > low.mode_ratios[2]);
    assert!(low.t60_seconds[0] > 2.0 * high.t60_seconds[0]);
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
fn every_declared_key_constructs_at_every_supported_rate_without_aliasing() {
    for sample_rate in [8_000.0, 44_100.0, 48_000.0, 96_000.0] {
        for midi in MIN_MIDI..=MAX_MIDI {
            let model = VibraphoneVoice::new(midi, sample_rate, VibesParameters::canonical())
                .unwrap_or_else(|error| panic!("midi {midi} rate {sample_rate}: {error:?}"));
            assert!(model.resolved_mode_count() >= 1);
            assert!(model.resolved_mode_count() <= BAR_MODES);
            for index in 0..model.resolved_mode_count() {
                let frequency = model.mode_frequency_hz(index).unwrap();
                assert!(frequency < 0.44 * sample_rate, "midi {midi} mode {index}");
            }
            for index in model.resolved_mode_count()..BAR_MODES {
                assert!(model.mode_frequency_hz(index).is_none());
            }
        }
    }
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
}

#[test]
fn strike_position_and_finite_patch_control_modes_at_the_contact_port() {
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
    assert!(damped.cumulative_loss_j() > free.cumulative_loss_j());

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
