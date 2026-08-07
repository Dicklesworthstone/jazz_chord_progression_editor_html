#[path = "../src/trumpet.rs"]
mod trumpet;

use trumpet::{
    geometry_half_wave_hz, lip_flow_m3_s, outward_equilibrium_opening_m,
    positive_real_radiation_balance, valve_added_length_m, OversampledOutput, TrumpetControls,
    TrumpetError, TrumpetModel, TrumpetParameters, BORE_CELLS, OVERSAMPLE_FACTOR,
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
    let open = geometry_half_wave_hz([0.0, 0.0, 0.0]);
    let second = geometry_half_wave_hz([0.0, 1.0, 0.0]);
    let all = geometry_half_wave_hz([1.0, 1.0, 1.0]);
    assert!((open - 116.666_666_7).abs() < 1.0e-5);
    assert!((valve_added_length_m([0.0, 1.0, 0.0]) - 0.087).abs() < 1.0e-12);
    assert!((valve_added_length_m([1.0, 1.0, 1.0]) - 0.572).abs() < 1.0e-12);
    assert!(open > second && second > all, "{open} {second} {all}");
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
        lip_damping_ratio: 0.16,
        equilibrium_opening_m: 0.00025,
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
    model.diagnostic_pressure_pulse(50.0).unwrap();
    let initial = model.stored_energy_j(controls);
    let mut maximum = initial;
    for _ in 0..4_800 {
        let output = model.process_sample(controls).unwrap();
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

fn harmonic_centroid_hz(samples: &[f64], fundamental_hz: f64) -> f64 {
    let sample_rate_hz = 48_000.0;
    let mut weighted_magnitude = 0.0;
    let mut total_magnitude = 0.0;
    let harmonic_count = (8_000.0 / fundamental_hz).floor() as usize;
    for harmonic in 1..=harmonic_count {
        let frequency_hz = harmonic as f64 * fundamental_hz;
        let coefficient = 2.0 * (2.0 * core::f64::consts::PI * frequency_hz / sample_rate_hz).cos();
        let mut previous = 0.0;
        let mut before_previous = 0.0;
        for (index, sample) in samples.iter().enumerate() {
            let window = 0.5
                - 0.5
                    * (2.0 * core::f64::consts::PI * index as f64 / (samples.len() - 1) as f64)
                        .cos();
            let state = window * *sample + coefficient * previous - before_previous;
            before_previous = previous;
            previous = state;
        }
        let magnitude = (previous * previous + before_previous * before_previous
            - coefficient * previous * before_previous)
            .max(0.0)
            .sqrt();
        weighted_magnitude += frequency_hz * magnitude;
        total_magnitude += magnitude;
    }
    weighted_magnitude / total_magnitude.max(1.0e-30)
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

fn render_controlled_sustain(
    mouth_pressure_pa: f64,
    lip_resonance_hz: f64,
    lip_damping_ratio: f64,
    equilibrium_opening_m: f64,
    parameters: TrumpetParameters,
) -> Vec<f64> {
    let mut model = TrumpetModel::new(48_000.0, parameters).unwrap();
    let mut controls = TrumpetControls {
        mouth_pressure_pa: 0.0,
        lip_resonance_hz,
        lip_damping_ratio,
        equilibrium_opening_m,
        tongue_contact: 0.0,
        valves: [0.0; 3],
    };
    let mut sustain = Vec::new();
    for frame in 0..24_000 {
        controls.mouth_pressure_pa = mouth_pressure_pa * (frame as f64 / 1_440.0).min(1.0);
        let sample = model
            .process_sample(controls)
            .unwrap_or_else(|error| panic!("controlled render failed at frame {frame}: {error:?}"));
        if frame > 9_600 {
            sustain.push(sample);
        }
    }
    sustain
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
        lip_damping_ratio: 0.16,
        equilibrium_opening_m: 0.00025,
        tongue_contact: 0.0,
        valves,
    };
    let mut sustain = Vec::new();
    for frame in 0..24_000 {
        controls.mouth_pressure_pa = mouth_pressure_pa * (frame as f64 / 1_440.0).min(1.0);
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
    let sustain = render_sustain(valves, 5_500.0, 300.0, TrumpetParameters::canonical());
    estimate_f0(&sustain, 48_000.0, 80.0, 300.0)
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
        mouth_pressure_pa: 3_000.0,
        lip_resonance_hz: 300.0,
        lip_damping_ratio: 0.16,
        equilibrium_opening_m: 0.00025,
        tongue_contact: 0.0,
        valves: [0.0; 3],
    };
    let mut sum = 0.0;
    let mut peak = 0.0f64;
    let mut sustain = Vec::new();
    for frame in 0..24_000 {
        if frame < 1_440 {
            controls.mouth_pressure_pa = 3_000.0 * frame as f64 / 1_440.0;
        }
        let sample = model.process_sample(controls).unwrap_or_else(|error| {
            panic!(
                "driven core failed at frame {frame}, pressure {}: {error:?}",
                controls.mouth_pressure_pa
            )
        });
        assert!(sample.is_finite());
        if frame > 4_800 {
            sum += sample * sample;
            peak = peak.max(sample.abs());
            sustain.push(sample);
        }
        let report = model.last_lip_report();
        assert!(report.newton_iterations <= 8);
        assert!(report.bracket_evaluations <= 33);
        assert!(report.fallback_bisections <= 16);
    }
    let rms = (sum / (24_000 - 4_801) as f64).sqrt();
    let (f0, periodicity) = estimate_f0(&sustain, 48_000.0, 100.0, 800.0);
    eprintln!("driven trumpet diagnostic rms={rms:e} peak={peak:e} f0={f0} score={periodicity}",);
    assert!(rms > 2.0e-5, "silent physical output {rms:e}");
    assert!(peak < 1.0, "unbounded physical output {peak}");
    assert!(periodicity > 0.9, "unlocked regime score {periodicity}");
    assert!(
        (300.0..=300.0 * 3.0_f64.sqrt()).contains(&f0),
        "outward regime {f0}"
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
    let linear = render_sustain([0.0; 3], 3_000.0, 260.0, linear_parameters);
    let nonlinear = render_sustain([0.0; 3], 3_000.0, 260.0, TrumpetParameters::canonical());
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
    let pressures_pa = [5_500.0, 7_000.0, 8_500.0];
    let mut pitches_hz = Vec::new();
    let mut centroids_hz = Vec::new();
    let mut levels_rms = Vec::new();
    for pressure_pa in pressures_pa {
        // Lip resonance, damping, rest opening, bore geometry, and valves are
        // identical in every cell. Mouth pressure is the only changed input.
        let samples = render_sustain([0.0; 3], pressure_pa, 300.0, TrumpetParameters::canonical());
        let (fundamental_hz, periodicity) = estimate_f0(&samples, 48_000.0, 80.0, 800.0);
        let centroid_hz = harmonic_centroid_hz(&samples, fundamental_hz);
        let level_rms = (samples.iter().map(|sample| sample * sample).sum::<f64>()
            / samples.len() as f64)
            .sqrt();
        eprintln!(
            "pressure={pressure_pa} f0={fundamental_hz} periodicity={periodicity} harmonic_centroid={centroid_hz} rms={level_rms:e}"
        );
        assert!(periodicity > 0.995, "unlocked pressure cell {pressure_pa}");
        pitches_hz.push(fundamental_hz);
        centroids_hz.push(centroid_hz);
        levels_rms.push(level_rms);
    }
    assert!(
        pitches_hz.windows(2).all(|pair| pair[1] >= pair[0]),
        "unexpected pitch reversal: {pitches_hz:?}"
    );
    let pitch_drift_cents = 1_200.0 * (pitches_hz[2] / pitches_hz[0]).log2();
    assert!(
        pitch_drift_cents < 20.0,
        "pressure retuned the fixed geometry by {pitch_drift_cents} cents"
    );
    assert!(
        centroids_hz.windows(2).all(|pair| pair[1] > pair[0]),
        "brightness did not rise monotonically: {centroids_hz:?}"
    );
    assert!(
        centroids_hz[2] > centroids_hz[0] * 1.08,
        "brassiness increase was immaterial: {centroids_hz:?}"
    );
    assert!(
        levels_rms.windows(2).all(|pair| pair[1] > pair[0]),
        "mouth pressure did not increase radiated level: {levels_rms:?}"
    );
    let brightness_increase_hz = centroids_hz[2] - centroids_hz[0];
    let brightness_increase_percent = 100.0 * brightness_increase_hz / centroids_hz[0];
    let level_increase_db = 20.0 * (levels_rms[2] / levels_rms[0]).log10();
    eprintln!(
        "pressure-law pitch_drift={pitch_drift_cents}c brightness_increase={brightness_increase_hz}Hz ({brightness_increase_percent}%) level_increase={level_increase_db}dB"
    );

    let mut linear_parameters = TrumpetParameters::canonical();
    linear_parameters.nonlinear_coefficient = 0.0;
    let linear_soft = render_sustain([0.0; 3], pressures_pa[0], 300.0, linear_parameters);
    let linear_loud = render_sustain([0.0; 3], pressures_pa[2], 300.0, linear_parameters);
    let linear_soft_f0 = estimate_f0(&linear_soft, 48_000.0, 80.0, 800.0).0;
    let linear_loud_f0 = estimate_f0(&linear_loud, 48_000.0, 80.0, 800.0).0;
    let linear_soft_centroid = harmonic_centroid_hz(&linear_soft, linear_soft_f0);
    let linear_loud_centroid = harmonic_centroid_hz(&linear_loud, linear_loud_f0);
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
        lip_resonance_hz: 300.0,
        lip_damping_ratio: 0.16,
        equilibrium_opening_m: 0.00025,
        tongue_contact: 0.0,
        valves: [0.0; 3],
    };
    for frame in 0..24_000 {
        controls.mouth_pressure_pa = 8_500.0 * (frame as f64 / 1_440.0).min(1.0);
        model.process_sample(controls).unwrap();
    }
    for release_frame in 0..1_440 {
        controls.mouth_pressure_pa = 8_500.0 * (1.0 - release_frame as f64 / 1_440.0);
        model.process_sample(controls).unwrap();
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
fn diagnostic_valid_low_lip_cell() {
    let _ = render_sustain([0.0; 3], 5_500.0, 100.0, TrumpetParameters::canonical());
}

#[test]
fn diagnostic_hardened_regime_map() {
    for lip_hz in [80.0, 100.0, 120.0, 150.0, 180.0] {
        for pressure_pa in [3_000.0, 5_500.0, 8_500.0] {
            let samples = render_sustain(
                [0.0; 3],
                pressure_pa,
                lip_hz,
                TrumpetParameters::canonical(),
            );
            let (f0, score) = estimate_f0(&samples, 48_000.0, 70.0, 800.0);
            let rms = (samples.iter().map(|sample| sample * sample).sum::<f64>()
                / samples.len() as f64)
                .sqrt();
            let centroid = harmonic_centroid_hz(&samples, f0);
            eprintln!("map lip={lip_hz} pressure={pressure_pa} f0={f0} score={score} rms={rms:e} hc={centroid}");
        }
    }
}

fn goertzel_magnitude(samples: &[f64], frequency_hz: f64) -> f64 {
    let coefficient = 2.0 * (2.0 * core::f64::consts::PI * frequency_hz / 48_000.0).cos();
    let mut previous = 0.0;
    let mut before_previous = 0.0;
    for (index, sample) in samples.iter().enumerate() {
        let window = 0.5
            - 0.5 * (2.0 * core::f64::consts::PI * index as f64 / (samples.len() - 1) as f64).cos();
        let state = window * sample + coefficient * previous - before_previous;
        before_previous = previous;
        previous = state;
    }
    (previous * previous + before_previous * before_previous
        - coefficient * previous * before_previous)
        .max(0.0)
        .sqrt()
}

#[test]
fn diagnostic_open_spectrum_peaks() {
    for pressure_pa in [3_000.0, 5_500.0, 8_500.0] {
        let samples = render_sustain([0.0; 3], pressure_pa, 120.0, TrumpetParameters::canonical());
        let mut peaks: Vec<(f64, f64)> = (70..=300)
            .map(|frequency| {
                (
                    goertzel_magnitude(&samples, frequency as f64),
                    frequency as f64,
                )
            })
            .collect();
        peaks.sort_by(|left, right| right.0.total_cmp(&left.0));
        eprintln!("spectrum pressure={pressure_pa} peaks={:?}", &peaks[..12]);
    }
}

#[test]
fn diagnostic_mouthpiece_parameter_map() {
    for compliance in [1.0e-11] {
        for inertance in [4_000.0, 4_200.0, 4_400.0, 4_600.0, 4_800.0] {
            let mut parameters = TrumpetParameters::canonical();
            parameters.mouthpiece_compliance_m3_pa = compliance;
            parameters.throat_inertance_pa_s2_m3 = inertance;
            parameters.lip_force_rolloff_displacement_m = 5.0e-4;
            let mut model = TrumpetModel::new(48_000.0, parameters).unwrap();
            let mut controls = TrumpetControls {
                mouth_pressure_pa: 0.0,
                lip_resonance_hz: 80.0,
                lip_damping_ratio: 0.16,
                equilibrium_opening_m: 0.00025,
                tongue_contact: 0.0,
                valves: [0.0; 3],
            };
            let mut samples = Vec::new();
            for frame in 0..24_000 {
                controls.mouth_pressure_pa = 5_500.0 * (frame as f64 / 1_440.0).min(1.0);
                let sample = model.process_sample(controls).unwrap();
                if frame > 9_600 {
                    samples.push(sample);
                }
            }
            let (f0, score) = estimate_f0(&samples, 48_000.0, 70.0, 300.0);
            let rms = (samples.iter().map(|sample| sample * sample).sum::<f64>()
                / samples.len() as f64)
                .sqrt();
            eprintln!(
                "mouthpiece C={compliance:e} L={inertance} f0={f0} score={score} rms={rms:e}"
            );
        }
    }
}

#[test]
fn diagnostic_hardening_scale_map() {
    for hardening_m in [1.0e5, 3.0e5, 1.0e6, 3.0e6, 1.0e7, 3.0e7] {
        for pressure_pa in [3_000.0, 5_500.0, 8_500.0] {
            let mut parameters = TrumpetParameters::canonical();
            parameters.lip_force_rolloff_displacement_m = 2.75e-3;
            parameters.throat_nonlinear_resistance_pa_s2_m6 = hardening_m;
            let mut model = TrumpetModel::new(48_000.0, parameters).unwrap();
            let mut controls = TrumpetControls {
                mouth_pressure_pa: 0.0,
                lip_resonance_hz: 80.0,
                lip_damping_ratio: 0.16,
                equilibrium_opening_m: 0.00025,
                tongue_contact: 0.0,
                valves: [0.0; 3],
            };
            let mut sustain = Vec::new();
            let mut failure = None;
            for frame in 0..24_000 {
                controls.mouth_pressure_pa = pressure_pa * (frame as f64 / 1_440.0).min(1.0);
                match model.process_sample(controls) {
                    Ok(sample) if frame > 9_600 => sustain.push(sample),
                    Ok(_) => {}
                    Err(error) => {
                        failure = Some((frame, error));
                        break;
                    }
                }
            }
            if let Some(failure) = failure {
                eprintln!("hardening={hardening_m:e} pressure={pressure_pa} failure={failure:?}");
            } else {
                let (f0, score) = estimate_f0(&sustain, 48_000.0, 70.0, 300.0);
                let rms = (sustain.iter().map(|sample| sample * sample).sum::<f64>()
                    / sustain.len() as f64)
                    .sqrt();
                let centroid = spectral_centroid_hz(&sustain);
                eprintln!("hardening={hardening_m:e} pressure={pressure_pa} f0={f0} score={score} centroid={centroid} rms={rms:e}");
            }
        }
    }
}

#[test]
fn diagnostic_first_regime_control_map() {
    for lip_hz in [140.0] {
        for damping in [0.02, 0.05] {
            for opening in [0.00005, 0.00015, 0.0003] {
                for pressure_pa in [5_500.0, 12_000.0] {
                    let mut model =
                        TrumpetModel::new(48_000.0, TrumpetParameters::canonical()).unwrap();
                    let mut controls = TrumpetControls {
                        mouth_pressure_pa: 0.0,
                        lip_resonance_hz: lip_hz,
                        lip_damping_ratio: damping,
                        equilibrium_opening_m: opening,
                        tongue_contact: 0.0,
                        valves: [0.0; 3],
                    };
                    let mut samples = Vec::new();
                    let mut failed = false;
                    for frame in 0..12_000 {
                        controls.mouth_pressure_pa =
                            pressure_pa * (frame as f64 / 1_440.0).min(1.0);
                        match model.process_sample(controls) {
                            Ok(sample) if frame > 6_000 => samples.push(sample),
                            Ok(_) => {}
                            Err(_) => {
                                failed = true;
                                break;
                            }
                        }
                    }
                    if failed {
                        eprintln!("first lip={lip_hz} pressure={pressure_pa} damp={damping} opening={opening:e} FAILED");
                    } else {
                        let (f0, score) = estimate_f0(&samples, 48_000.0, 80.0, 300.0);
                        let centroid = spectral_centroid_hz(&samples);
                        let rms = (samples.iter().map(|sample| sample * sample).sum::<f64>()
                            / samples.len() as f64)
                            .sqrt();
                        eprintln!("first lip={lip_hz} pressure={pressure_pa} damp={damping} opening={opening:e} f0={f0} score={score} centroid={centroid} rms={rms:e}");
                    }
                }
            }
        }
    }
}

#[test]
fn diagnostic_candidate_pressure_map() {
    for pressure_pa in [3_000.0, 4_000.0, 5_500.0, 7_000.0, 8_500.0] {
        let mut model = TrumpetModel::new(48_000.0, TrumpetParameters::canonical()).unwrap();
        let mut controls = TrumpetControls {
            mouth_pressure_pa: 0.0,
            lip_resonance_hz: 360.0,
            lip_damping_ratio: 0.08,
            equilibrium_opening_m: 0.0005,
            tongue_contact: 0.0,
            valves: [0.0; 3],
        };
        let mut samples = Vec::new();
        for frame in 0..24_000 {
            controls.mouth_pressure_pa = pressure_pa * (frame as f64 / 1_440.0).min(1.0);
            let sample = model.process_sample(controls).unwrap();
            if frame > 9_600 {
                samples.push(sample);
            }
        }
        let (f0, score) = estimate_f0(&samples, 48_000.0, 80.0, 300.0);
        let rms = (samples.iter().map(|sample| sample * sample).sum::<f64>()
            / samples.len() as f64)
            .sqrt();
        eprintln!("candidate pressure={pressure_pa} f0={f0} score={score} rms={rms:e}");
    }
}

#[test]
fn diagnostic_damped_fundamental_map() {
    for damping in [0.08] {
        for opening in [0.0, 0.000025, 0.00005, 0.000075, 0.0001] {
            for pressure_pa in [5_500.0] {
                let mut model =
                    TrumpetModel::new(48_000.0, TrumpetParameters::canonical()).unwrap();
                let mut controls = TrumpetControls {
                    mouth_pressure_pa: 0.0,
                    lip_resonance_hz: 80.0,
                    lip_damping_ratio: damping,
                    equilibrium_opening_m: opening,
                    tongue_contact: 0.0,
                    valves: [0.0; 3],
                };
                let mut samples = Vec::new();
                for frame in 0..12_000 {
                    controls.mouth_pressure_pa = pressure_pa * (frame as f64 / 1_440.0).min(1.0);
                    let sample = model.process_sample(controls).unwrap();
                    if frame > 6_000 {
                        samples.push(sample);
                    }
                }
                let (f0, score) = estimate_f0(&samples, 48_000.0, 70.0, 300.0);
                let rms = (samples.iter().map(|sample| sample * sample).sum::<f64>()
                    / samples.len() as f64)
                    .sqrt();
                eprintln!("damped damp={damping} opening={opening:e} pressure={pressure_pa} f0={f0} score={score} rms={rms:e}");
            }
        }
    }
}

#[test]
fn diagnostic_stable_regime_search() {
    for lip_hz in [100.0, 110.0, 120.0, 130.0, 140.0, 150.0] {
        for damping in [0.25, 0.3, 0.35] {
            let mut results = Vec::new();
            for pressure_pa in [5_500.0, 8_500.0] {
                let mut model =
                    TrumpetModel::new(48_000.0, TrumpetParameters::canonical()).unwrap();
                let mut controls = TrumpetControls {
                    mouth_pressure_pa: 0.0,
                    lip_resonance_hz: lip_hz,
                    lip_damping_ratio: damping,
                    equilibrium_opening_m: 0.0005,
                    tongue_contact: 0.0,
                    valves: [0.0; 3],
                };
                let mut samples = Vec::new();
                for frame in 0..16_000 {
                    controls.mouth_pressure_pa = pressure_pa * (frame as f64 / 1_440.0).min(1.0);
                    let sample = model.process_sample(controls).unwrap();
                    if frame > 8_000 {
                        samples.push(sample);
                    }
                }
                let (f0, score) = estimate_f0(&samples, 48_000.0, 90.0, 150.0);
                let rms = (samples.iter().map(|sample| sample * sample).sum::<f64>()
                    / samples.len() as f64)
                    .sqrt();
                results.push((pressure_pa, f0, score, rms));
            }
            eprintln!("stable lip={lip_hz} damp={damping} results={results:?}");
        }
    }
}

#[test]
fn diagnostic_loss_regime_map() {
    for loss_per_second in [5.0, 10.0, 20.0, 40.0, 60.0] {
        for pressure_pa in [3_000.0, 5_500.0, 8_500.0] {
            let mut parameters = TrumpetParameters::canonical();
            parameters.lip_force_rolloff_displacement_m = 2.65e-3;
            parameters.bore_loss_per_second = loss_per_second;
            let samples = render_sustain([0.0; 3], pressure_pa, 80.0, parameters);
            let (f0, score) = estimate_f0(&samples, 48_000.0, 80.0, 300.0);
            let rms = (samples.iter().map(|sample| sample * sample).sum::<f64>()
                / samples.len() as f64)
                .sqrt();
            let peak = samples
                .iter()
                .fold(0.0_f64, |peak, sample| peak.max(sample.abs()));
            eprintln!("loss={loss_per_second} pressure={pressure_pa} f0={f0} score={score} rms={rms:e} peak={peak:e}");
        }
    }
}

#[test]
fn diagnostic_loud_lip_map() {
    for lip_hz in [90.0, 95.0, 100.0, 105.0, 110.0, 120.0, 130.0] {
        let mut model = TrumpetModel::new(48_000.0, TrumpetParameters::canonical()).unwrap();
        let mut controls = TrumpetControls {
            mouth_pressure_pa: 0.0,
            lip_resonance_hz: lip_hz,
            lip_damping_ratio: 0.08,
            equilibrium_opening_m: 0.00005,
            tongue_contact: 0.0,
            valves: [0.0; 3],
        };
        let mut samples = Vec::new();
        let mut failure = None;
        for frame in 0..24_000 {
            controls.mouth_pressure_pa = 12_000.0 * (frame as f64 / 1_440.0).min(1.0);
            match model.process_sample(controls) {
                Ok(sample) if frame > 9_600 => samples.push(sample),
                Ok(_) => {}
                Err(error) => {
                    failure = Some((frame, error));
                    break;
                }
            }
        }
        if let Some(failure) = failure {
            eprintln!("loud lip={lip_hz} failure={failure:?}");
        } else {
            let (f0, score) = estimate_f0(&samples, 48_000.0, 80.0, 300.0);
            let rms = (samples.iter().map(|sample| sample * sample).sum::<f64>()
                / samples.len() as f64)
                .sqrt();
            eprintln!("loud lip={lip_hz} f0={f0} score={score} rms={rms:e}");
        }
    }
}

#[test]
fn diagnostic_fixture_brightness_trajectory() {
    let cells = [
        (3_000.0, 80.0, 0.08, 0.00005),
        (5_500.0, 80.0, 0.08, 0.00005),
        (8_500.0, 80.0, 0.08, 0.00005),
        (12_000.0, 80.0, 0.08, 0.00005),
    ];
    for (pressure, lip_hz, damping, opening) in cells {
        let samples = render_controlled_sustain(
            pressure,
            lip_hz,
            damping,
            opening,
            TrumpetParameters::canonical(),
        );
        let (f0, periodicity) = estimate_f0(&samples, 48_000.0, 80.0, 300.0);
        let centroid = spectral_centroid_hz(&samples);
        let harmonic_centroid = harmonic_centroid_hz(&samples, f0);
        let rms = (samples.iter().map(|sample| sample * sample).sum::<f64>()
            / samples.len() as f64)
            .sqrt();
        let peak = samples
            .iter()
            .fold(0.0_f64, |peak, sample| peak.max(sample.abs()));
        eprintln!("fixture pressure={pressure} lip={lip_hz} f0={f0} score={periodicity} centroid={centroid} harmonic_centroid={harmonic_centroid} rms={rms:e} peak={peak:e}");
    }
}

#[test]
fn diagnostic_loud_timbre_control_map() {
    for damping in [0.05, 0.08, 0.12, 0.16] {
        for opening in [0.0, 0.00005] {
            let mut model = TrumpetModel::new(48_000.0, TrumpetParameters::canonical()).unwrap();
            let mut controls = TrumpetControls {
                mouth_pressure_pa: 0.0,
                lip_resonance_hz: 100.0,
                lip_damping_ratio: damping,
                equilibrium_opening_m: opening,
                tongue_contact: 0.0,
                valves: [0.0; 3],
            };
            let mut samples = Vec::new();
            let mut failure = None;
            for frame in 0..24_000 {
                controls.mouth_pressure_pa = 12_000.0 * (frame as f64 / 1_440.0).min(1.0);
                match model.process_sample(controls) {
                    Ok(sample) if frame > 9_600 => samples.push(sample),
                    Ok(_) => {}
                    Err(error) => {
                        failure = Some((frame, error));
                        break;
                    }
                }
            }
            if let Some(failure) = failure {
                eprintln!("timbre damp={damping} opening={opening:e} failure={failure:?}");
            } else {
                let (f0, score) = estimate_f0(&samples, 48_000.0, 80.0, 300.0);
                let centroid = spectral_centroid_hz(&samples);
                let rms = (samples.iter().map(|sample| sample * sample).sum::<f64>()
                    / samples.len() as f64)
                    .sqrt();
                eprintln!("timbre damp={damping} opening={opening:e} f0={f0} score={score} centroid={centroid} rms={rms:e}");
            }
        }
    }
}

#[test]
fn diagnostic_published_high_regime_brightness() {
    for damping in [0.05, 0.08, 0.1, 0.125] {
        for pressure in [5_500.0, 12_000.0] {
            let samples = render_controlled_sustain(
                pressure,
                300.0,
                damping,
                0.0005,
                TrumpetParameters::canonical(),
            );
            let (f0, score) = estimate_f0(&samples, 48_000.0, 250.0, 700.0);
            let centroid = spectral_centroid_hz(&samples);
            let rms = (samples.iter().map(|sample| sample * sample).sum::<f64>()
                / samples.len() as f64)
                .sqrt();
            eprintln!("published damping={damping} pressure={pressure} f0={f0} score={score} centroid={centroid} rms={rms:e}");
        }
    }
}
