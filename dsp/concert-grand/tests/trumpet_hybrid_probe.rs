//! Hybrid steepening-calibration probe (round 8). Run explicitly:
//! `cargo test --test trumpet_hybrid_probe -- --ignored --nocapture`
#![allow(dead_code)]
#[path = "../src/trumpet.rs"]
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

fn render_pressure_continuation_with(pressures_pa: &[f64], parameters: TrumpetParameters) -> Vec<Vec<f64>> {
    let mut model = TrumpetModel::new(48_000.0, parameters).unwrap();
    let mut controls = TrumpetControls {
        mouth_pressure_pa: 0.0,
        // The reviewed upper lip resonance remains fixed at 250 Hz while the
        // measured 136/184 split places the lower outward mode below the
        // 232 Hz bore regime.
        lip_resonance_hz: 258.0,
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
#[ignore]
fn probe_nonlinear_coefficient_sweep() {
    let pressures_pa = [5_500.0, 7_000.0, 8_500.0, 12_000.0];
    for nl in [2.4, 3.0] {
        let mut parameters = TrumpetParameters::canonical();
        parameters.nonlinear_coefficient = nl;
        let cells = render_pressure_continuation_with(&pressures_pa, parameters);
        let mut row = String::new();
        for (pressure, samples) in pressures_pa.iter().zip(&cells) {
            let (f0, periodicity) = estimate_f0(samples, 48_000.0, 80.0, 800.0);
            let centroid = spectral_centroid_hz(samples);
            let rms = (samples.iter().map(|s| s * s).sum::<f64>() / samples.len() as f64).sqrt();
            row.push_str(&format!(
                " | p={pressure} f0={f0:.2} per={periodicity:.4} cen={centroid:.0} rms={rms:.3e}"
            ));
        }
        println!("NL={nl}{row}");
    }
}

#[test]
#[ignore]
fn probe_regime_following_lip_schedule() {
    // Players tune to the horn: the lip target follows the slot as pressure
    // rises so f0 stays on the impedance peak. Per-cell lip targets chosen to
    // cancel the measured fixed-control drift at NL=2.4 / 96 cells.
    let cells: [(f64, f64, f64); 4] =
        [(5_500.0, 259.0, 0.0), (7_000.0, 256.0, 0.02), (8_500.0, 253.0, 0.05), (12_000.0, 233.0, 0.16)];
    let mut parameters = TrumpetParameters::canonical();
    parameters.nonlinear_coefficient = 2.4;
    let mut model = TrumpetModel::new(48_000.0, parameters).unwrap();
    let mut controls = TrumpetControls {
        mouth_pressure_pa: 0.0,
        lip_resonance_hz: 258.0,
        lip_damping_ratio: 1.0 / 3.0,
        equilibrium_opening_m: 0.0,
        tongue_contact: 1.0,
        valves: [0.0; 3],
    };
    let mut previous_pressure = 0.0;
    let mut previous_lip = 258.0;
    for (cell_index, (target_pressure, target_lip, valve_trim)) in cells.into_iter().enumerate() {
        controls.valves = [valve_trim, 0.0, 0.0];
        let mut sustain = Vec::new();
        for frame in 0..24_000 {
            let ramp = (frame as f64 / 1_440.0).min(1.0);
            controls.mouth_pressure_pa =
                previous_pressure + ramp * (target_pressure - previous_pressure);
            controls.lip_resonance_hz = previous_lip + ramp * (target_lip - previous_lip);
            if cell_index == 0 && frame == 1_440 {
                model.seed_open_normal_regime(100.0).unwrap();
                controls.tongue_contact = 0.0;
            }
            let sample = model.process_sample(controls).unwrap();
            if frame >= 9_600 {
                sustain.push(sample);
            }
        }
        previous_pressure = target_pressure;
        previous_lip = target_lip;
        let (f0, periodicity) = estimate_f0(&sustain, 48_000.0, 80.0, 800.0);
        let centroid = spectral_centroid_hz(&sustain);
        let rms =
            (sustain.iter().map(|s| s * s).sum::<f64>() / sustain.len() as f64).sqrt();
        println!(
            "p={target_pressure} lip={target_lip} f0={f0:.2} per={periodicity:.4} cen={centroid:.0} rms={rms:.3e}"
        );
    }
}
