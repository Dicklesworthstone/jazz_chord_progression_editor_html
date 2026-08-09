//! Round-11 co-design SEARCH ORACLE (jcpe-trumpet-lock-completion-el46).
//!
//! Parameterized replica of the wall test's pressure-continuation ramp and
//! metric battery (`pressure_increase_brightens_a_fixed_regime_without_
//! retuning_it` in trumpet_physics.rs), used ONLY as the NSGA-II campaign
//! objective. The ramp, cell pressures, seeding, warmup discard, and all
//! metric estimators are copied verbatim from the wall test; the ONLY
//! deltas are (a) the player schedule constants and `nonlinear_coefficient`
//! arrive via environment variables, and (b) results print as one JSON line
//! instead of asserting. Acceptance NEVER comes from this file: the winning
//! candidate is landed as committed constants and verified by the unmodified
//! wall test (the campaign's canonical-re-execution law).
//!
//! Dimensions (env vars, all required):
//!   CODESIGN_A1  lip linear slope      [Hz/kPa]   (wall test: 6.0)
//!   CODESIGN_A2  lip quadratic slope   [Hz/kPa^2] (wall test: 0.0)
//!   CODESIGN_B1  valve linear trim     [/kPa]     (wall test: 0.020)
//!   CODESIGN_B2  valve quadratic trim  [/kPa^2]   (wall test: 0.0)
//!   CODESIGN_C1  lip damping slope     [zeta/kPa] (wall test: 0.0; a real
//!                player firms the embouchure with dynamics — the one player
//!                dimension rounds 9-10 never swept)
//!   CODESIGN_NL  nonlinear_coefficient            (canonical: 2.3)
//!
//! Run: cargo test --release --test trumpet_codesign_eval -- --ignored
//!      (or invoke the built test binary directly for campaign speed).

#[path = "../src/trumpet.rs"]
mod trumpet;

use trumpet::{TrumpetControls, TrumpetModel, TrumpetParameters};

fn env_f64(name: &str) -> f64 {
    std::env::var(name)
        .unwrap_or_else(|_| panic!("missing env {name}"))
        .parse::<f64>()
        .unwrap_or_else(|error| panic!("bad env {name}: {error}"))
}

// ---- metric estimators: verbatim copies from tests/trumpet_physics.rs ----

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

// ---- parameterized wall-test ramp (structure identical; schedule dims via env) ----

#[allow(clippy::too_many_arguments)]
fn render_pressure_continuation_parameterized(
    pressures_pa: &[f64],
    a1: f64,
    a2: f64,
    b1: f64,
    b2: f64,
    c1: f64,
    nonlinear_coefficient: f64,
) -> Result<Vec<Vec<f64>>, String> {
    let mut parameters = TrumpetParameters::canonical();
    parameters.nonlinear_coefficient = nonlinear_coefficient;
    let mut model =
        TrumpetModel::new(48_000.0, parameters).map_err(|error| format!("{error:?}"))?;
    let mut controls = TrumpetControls {
        mouth_pressure_pa: 0.0,
        lip_resonance_hz: 258.0,
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
            let excess_kpa = ((controls.mouth_pressure_pa - 5_500.0) / 1_000.0).max(0.0);
            controls.lip_resonance_hz = 258.0 - a1 * excess_kpa - a2 * excess_kpa * excess_kpa;
            controls.valves = [
                (b1 * excess_kpa + b2 * excess_kpa * excess_kpa).clamp(0.0, 0.25),
                0.0,
                0.0,
            ];
            controls.lip_damping_ratio = (1.0 / 3.0 + c1 * excess_kpa).clamp(0.05, 0.95);
            if cell_index == 0 && frame == 1_440 {
                model
                    .seed_open_normal_regime(100.0)
                    .map_err(|error| format!("{error:?}"))?;
                controls.tongue_contact = 0.0;
            }
            let sample = model.process_sample(controls).map_err(|error| {
                format!(
                    "cell={cell_index} frame={frame} pressure={} error={error:?}",
                    controls.mouth_pressure_pa
                )
            })?;
            if frame > 9_600 {
                sustain.push(sample);
            }
        }
        cells.push(sustain);
        previous_pressure_pa = target_pressure_pa;
    }
    Ok(cells)
}

#[test]
#[ignore = "round-11 co-design search oracle; run explicitly with env dims"]
fn codesign_eval() {
    let a1 = env_f64("CODESIGN_A1");
    let a2 = env_f64("CODESIGN_A2");
    let b1 = env_f64("CODESIGN_B1");
    let b2 = env_f64("CODESIGN_B2");
    let c1 = env_f64("CODESIGN_C1");
    let nl = env_f64("CODESIGN_NL");
    let pressures_pa = [5_500.0, 7_000.0, 8_500.0, 12_000.0];
    let rendered = match render_pressure_continuation_parameterized(
        &pressures_pa,
        a1,
        a2,
        b1,
        b2,
        c1,
        nl,
    ) {
        Ok(cells) => cells,
        Err(message) => {
            println!("{{\"ok\":false,\"error\":\"{}\"}}", message.replace('"', "'"));
            return;
        }
    };
    let mut pitches = Vec::new();
    let mut periodicities = Vec::new();
    let mut centroids = Vec::new();
    let mut levels = Vec::new();
    let mut peaks = Vec::new();
    for samples in &rendered {
        let (f0, periodicity) = estimate_f0(samples, 48_000.0, 80.0, 800.0);
        pitches.push(f0);
        periodicities.push(periodicity);
        centroids.push(spectral_centroid_hz(samples));
        levels.push(
            (samples.iter().map(|sample| sample * sample).sum::<f64>() / samples.len() as f64)
                .sqrt(),
        );
        peaks.push(
            samples
                .iter()
                .fold(0.0_f64, |current, sample| current.max(sample.abs())),
        );
    }
    let dip_hz = pitches
        .windows(2)
        .map(|pair| (pair[0] - pair[1]).max(0.0))
        .fold(0.0_f64, f64::max);
    let drift_cents = 1_200.0 * (pitches[3] / pitches[0]).log2();
    let centroid_dip_hz = centroids
        .windows(2)
        .map(|pair| (pair[0] - pair[1]).max(0.0))
        .fold(0.0_f64, f64::max);
    let rms_dip = levels
        .windows(2)
        .map(|pair| ((pair[0] - pair[1]) / pair[0].max(1.0e-30)).max(0.0))
        .fold(0.0_f64, f64::max);
    println!(
        "{{\"ok\":true,\"pitches\":{pitches:?},\"periodicities\":{periodicities:?},\"centroids\":{centroids:?},\"levels\":{levels:?},\"peaks\":{peaks:?},\"dip_hz\":{dip_hz},\"drift_cents\":{drift_cents},\"centroid_dip_hz\":{centroid_dip_hz},\"rms_dip_fraction\":{rms_dip}}}"
    );
}
