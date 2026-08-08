//! Round-5 probe harness for the staged external trumpet model.
//!
//! Drives `trumpet_v3_staging.rs` directly (same `#[path]` idiom the live
//! trumpet suite uses) so servo-schedule and steepening-calibration sweeps
//! measure the exact bytes that would ship. Helpers are copied from
//! `trumpet_physics.rs` rather than shared so this file stays deletable
//! without touching the live suite.

#[path = "../src/trumpet_v3_staging.rs"]
mod trumpet;

use trumpet::{TrumpetControls, TrumpetModel, TrumpetParameters};

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

fn render_pressure_continuation(
    pressures_pa: &[f64],
    parameters: TrumpetParameters,
) -> Vec<Vec<f64>> {
    let mut model = TrumpetModel::new(48_000.0, parameters).unwrap();
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
            if cell_index == 0 && frame == 1_440 {
                model.seed_open_normal_regime(100.0).unwrap();
                controls.tongue_contact = 0.0;
            }
            let sample = model.process_sample(controls).unwrap_or_else(|error| {
                panic!(
                    "continuation failed cell={cell_index} frame={frame} pressure={}: {error:?}",
                    controls.mouth_pressure_pa,
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

fn probe_table(label: &str, parameters: TrumpetParameters) -> Vec<(f64, f64, f64, f64)> {
    let pressures_pa = [5_500.0, 7_000.0, 8_500.0, 12_000.0];
    let cells = render_pressure_continuation(&pressures_pa, parameters);
    let mut rows = Vec::new();
    for (pressure_pa, samples) in pressures_pa.into_iter().zip(&cells) {
        let (fundamental_hz, periodicity) = estimate_f0(samples, 48_000.0, 80.0, 800.0);
        let centroid_hz = spectral_centroid_hz(samples);
        eprintln!(
            "[{label}] pressure={pressure_pa} f0={fundamental_hz:.2} periodicity={periodicity:.4} centroid={centroid_hz:.0}"
        );
        rows.push((pressure_pa, fundamental_hz, periodicity, centroid_hz));
    }
    rows
}

/// Round-5 baseline replication: canonical steepening and the x5 lever from
/// the round-4 sweeps. The 8.5/12 kPa escape is the documented wall, so only
/// the mp/mf cells carry a hard phonation assertion; the table is the
/// measurement.
#[test]
fn probe_centroid_vs_pressure() {
    let canonical = TrumpetParameters::canonical();
    let rows = probe_table("canonical", canonical);
    assert!(rows[..2].iter().all(|row| row.2 > 0.99), "mp/mf lost: {rows:?}");
    let mut boosted = TrumpetParameters::canonical();
    boosted.nonlinear_coefficient *= 5.0;
    let rows = probe_table("nonlinear-x5", boosted);
    assert!(rows[..2].iter().all(|row| row.2 > 0.99), "mp/mf lost: {rows:?}");
}

/// Round-5 pressure-compensated embouchure sweep. Success shape: periodicity
/// locked at every cell AND centroid monotone rising with pressure. Each
/// point is unwind-guarded so one diverging cell cannot hide the rest of the
/// map.
#[test]
fn probe_servo_schedule_sweep() {
    for (compensation, closure_exponent) in [
        (0.3, 0.0),
        (0.5, 0.0),
        (0.7, 0.0),
        (0.9, 0.0),
        (0.5, 0.3),
        (0.7, 0.3),
        (0.9, 0.3),
    ] {
        let mut parameters = TrumpetParameters::canonical();
        parameters.nonlinear_coefficient *= 5.0;
        parameters.embouchure_pressure_compensation = compensation;
        parameters.servo_pressure_closure_exponent = closure_exponent;
        let label = format!("sweep comp={compensation} c={closure_exponent}");
        let outcome = std::panic::catch_unwind(|| probe_table(&label, parameters));
        match outcome {
            Ok(rows) => {
                let locked = rows.iter().all(|row| row.2 > 0.99);
                let monotone = rows.windows(2).all(|pair| pair[1].3 > pair[0].3);
                eprintln!("[{label}] locked={locked} centroid_monotone={monotone}");
            }
            Err(_) => eprintln!("[{label}] DIVERGED (solver panic)"),
        }
    }
}

/// Divergence isolation: one compensation point, full panic detail.
#[test]
fn probe_compensation_divergence_detail() {
    let mut parameters = TrumpetParameters::canonical();
    parameters.nonlinear_coefficient *= 5.0;
    parameters.embouchure_pressure_compensation = 0.3;
    let _rows = probe_table("detail comp=0.3", parameters);
}

/// Compensation trend through the solvable range (ff solver robustness is a
/// separate workstream): 3-cell tables across compensation values.
#[test]
fn probe_compensation_trend_to_8k5() {
    for compensation in [0.0, 0.3, 0.5, 0.7, 0.9] {
        let mut parameters = TrumpetParameters::canonical();
        parameters.nonlinear_coefficient *= 5.0;
        parameters.embouchure_pressure_compensation = compensation;
        let label = format!("trend comp={compensation}");
        let pressures = [5_500.0, 7_000.0, 8_500.0];
        let outcome = std::panic::catch_unwind(|| {
            let cells = render_pressure_continuation(&pressures, parameters);
            let mut rows = Vec::new();
            for (pressure, samples) in pressures.into_iter().zip(&cells) {
                let (f0, periodicity) = estimate_f0(samples, 48_000.0, 80.0, 800.0);
                let centroid = spectral_centroid_hz(samples);
                eprintln!(
                    "[{label}] pressure={pressure} f0={f0:.2} periodicity={periodicity:.4} centroid={centroid:.0}"
                );
                rows.push((pressure, f0, periodicity, centroid));
            }
            rows
        });
        match outcome {
            Ok(rows) => {
                let locked = rows.iter().all(|row| row.2 > 0.99);
                let monotone = rows.windows(2).all(|pair| pair[1].3 > pair[0].3);
                eprintln!("[{label}] locked={locked} centroid_monotone={monotone}");
            }
            Err(_) => eprintln!("[{label}] DIVERGED"),
        }
    }
}

/// Flow-modulation diagnostics: per-cell aperture min/max/modulation depth.
/// The centroid falls with pressure even with the regime locked; this
/// measures whether the SOURCE modulation depth is what collapses.
#[test]
fn probe_modulation_depth() {
    for compensation in [0.0, 0.9] {
        let mut parameters = TrumpetParameters::canonical();
        parameters.nonlinear_coefficient *= 5.0;
        parameters.embouchure_pressure_compensation = compensation;
        let mut model = TrumpetModel::new(48_000.0, parameters).unwrap();
        let mut controls = TrumpetControls {
            mouth_pressure_pa: 0.0,
            lip_resonance_hz: 258.0,
            lip_damping_ratio: 1.0 / 3.0,
            equilibrium_opening_m: 0.0,
            tongue_contact: 1.0,
            valves: [0.0; 3],
        };
        let pressures = [5_500.0, 7_000.0, 8_500.0];
        let mut previous = 0.0;
        for (cell, target) in pressures.into_iter().enumerate() {
            let mut min_aperture = f64::INFINITY;
            let mut max_aperture = f64::NEG_INFINITY;
            let mut closed_frames = 0usize;
            let mut counted = 0usize;
            for frame in 0..24_000 {
                let ramp = (frame as f64 / 1_440.0).min(1.0);
                controls.mouth_pressure_pa = previous + ramp * (target - previous);
                if cell == 0 && frame == 1_440 {
                    model.seed_open_normal_regime(100.0).unwrap();
                    controls.tongue_contact = 0.0;
                }
                let outcome = model.process_sample(controls);
                if outcome.is_err() {
                    eprintln!("[mod comp={compensation}] cell={cell} DIVERGED frame={frame}");
                    return;
                }
                if frame > 9_600 {
                    let (displacement, _, _) = model.lip_probe_m();
                    let aperture = (controls.equilibrium_opening_m
                        + 2.0 * displacement)
                        .max(0.0);
                    min_aperture = min_aperture.min(aperture);
                    max_aperture = max_aperture.max(aperture);
                    if aperture <= 1.0e-6 {
                        closed_frames += 1;
                    }
                    counted += 1;
                }
            }
            let modulation =
                (max_aperture - min_aperture) / (max_aperture + min_aperture).max(1.0e-12);
            eprintln!(
                "[mod comp={compensation}] pressure={target} aperture_min={:.3e} max={:.3e} modulation={modulation:.3} closed_fraction={:.3}",
                min_aperture,
                max_aperture,
                closed_frames as f64 / counted.max(1) as f64
            );
            previous = target;
        }
    }
}

/// Super-compensation sweep: drive the rest point into closure at forte.
#[test]
fn probe_super_compensation() {
    for compensation in [1.2, 1.5, 2.0, 2.5] {
        let mut parameters = TrumpetParameters::canonical();
        parameters.nonlinear_coefficient *= 5.0;
        parameters.embouchure_pressure_compensation = compensation;
        let label = format!("super comp={compensation}");
        let pressures = [5_500.0, 7_000.0, 8_500.0];
        let outcome = std::panic::catch_unwind(|| {
            let cells = render_pressure_continuation(&pressures, parameters);
            let mut rows = Vec::new();
            for (pressure, samples) in pressures.into_iter().zip(&cells) {
                let (f0, periodicity) = estimate_f0(samples, 48_000.0, 80.0, 800.0);
                let centroid = spectral_centroid_hz(samples);
                eprintln!(
                    "[{label}] pressure={pressure} f0={f0:.2} periodicity={periodicity:.4} centroid={centroid:.0}"
                );
                rows.push((pressure, f0, periodicity, centroid));
            }
            rows
        });
        match outcome {
            Ok(rows) => {
                let locked = rows.iter().all(|row| row.2 > 0.99);
                let monotone = rows.windows(2).all(|pair| pair[1].3 > pair[0].3);
                eprintln!("[{label}] locked={locked} centroid_monotone={monotone}");
            }
            Err(_) => eprintln!("[{label}] DIVERGED"),
        }
    }
}

/// Level-vs-pressure at the chosen compensation: does the model crescendo?
#[test]
fn probe_level_vs_pressure() {
    let mut parameters = TrumpetParameters::canonical();
    parameters.nonlinear_coefficient *= 5.0;
    parameters.embouchure_pressure_compensation = 2.0;
    let pressures = [5_500.0, 7_000.0, 8_500.0];
    let cells = render_pressure_continuation(&pressures, parameters);
    for (pressure, samples) in pressures.into_iter().zip(&cells) {
        let rms = (samples.iter().map(|s| s * s).sum::<f64>() / samples.len() as f64).sqrt();
        let centroid = spectral_centroid_hz(samples);
        eprintln!("[level comp=2] pressure={pressure} rms={rms:.4e} centroid={centroid:.0}");
    }
}
