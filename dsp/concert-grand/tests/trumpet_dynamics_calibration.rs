//! Round-11 dynamics calibration (jcpe-trumpet-lock-completion-el46).
//!
//! The operating table (trumpet_note_sweep.rs) fixes each note's lip target at
//! the 6.5 kPa sweep point. The render export sweeps mouth pressure with
//! velocity, and the sounding pitch drifts with pressure at a rate that varies
//! by bore regime, so a single wall-law slope cannot hold every note flat.
//! This test measures, per table note:
//!   1. the pitch drift in cents per kPa of excess pressure at a fixed lip
//!      target (finite difference between excess 1 and 5), and
//!   2. the pitch sensitivity in cents per 1% of relative lip-target shift,
//! then reports k = drift / sensitivity — the relative lip compensation per
//! kPa that cancels the drift — and verifies the residual with k applied.
//! The winning k column is baked into TPT_NOTE_TABLE with this test as
//! provenance.
//!
//! Run: cargo test --release --test trumpet_dynamics_calibration -- --ignored --nocapture

#[path = "../src/trumpet.rs"]
mod trumpet;

use trumpet::{TrumpetControls, TrumpetModel, TrumpetParameters, TPT_DAMPING_SLOPE_PER_KPA, TRUMPET_NOTE_TABLE};

fn estimate_f0(samples: &[f64], sample_rate_hz: f64, minimum_hz: f64, maximum_hz: f64) -> (f64, f64) {
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
        scores.push(cross / (left * right).max(1.0e-30).sqrt());
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
    let offset = if curvature.abs() > 1.0e-12 { 0.5 * (left - right) / curvature } else { 0.0 }
        .clamp(-0.5, 0.5);
    ((sample_rate_hz) / ((lag_min + peak_index) as f64 + offset), center)
}

fn midi_hz(midi: i32) -> f64 {
    440.0 * 2.0_f64.powf((midi as f64 - 69.0) / 12.0)
}

/// Mirror of the tpt_render sustain loop at a given excess pressure and
/// relative lip compensation slope k (linear, normalized at excess 1.0).
fn render_cents(
    midi: i32,
    valves: [f64; 3],
    lip_ratio: f64,
    excess_kpa: f64,
    lip_multiplier: f64,
) -> Result<(f64, f64), String> {
    let rate = 48_000.0;
    let pressure_pa = 5_500.0 + excess_kpa * 1_000.0;
    let target = midi_hz(midi);
    let lip_base = target * lip_ratio;
    let mut model = TrumpetModel::new(rate, TrumpetParameters::canonical())
        .map_err(|error| format!("{error:?}"))?;
    let mut controls = TrumpetControls {
        mouth_pressure_pa: 0.0,
        lip_resonance_hz: lip_base,
        lip_damping_ratio: 1.0 / 3.0,
        equilibrium_opening_m: 0.0,
        tongue_contact: 1.0,
        valves,
    };
    let ramp_frames = (0.03 * rate) as usize;
    let total = (0.6 * rate) as usize;
    let mut sustain = Vec::new();
    for frame in 0..total {
        let ramp = (frame as f64 / ramp_frames as f64).min(1.0);
        controls.mouth_pressure_pa = pressure_pa * ramp;
        let e = ((controls.mouth_pressure_pa - 5_500.0) / 1_000.0).clamp(0.0, 5.0);
        let _ = e;
        controls.lip_resonance_hz = lip_base * lip_multiplier;
        controls.lip_damping_ratio =
            (1.0 / 3.0 + TPT_DAMPING_SLOPE_PER_KPA * e).clamp(0.05, 0.95);
        if frame == ramp_frames {
            model
                .seed_open_normal_regime(100.0)
                .map_err(|error| format!("{error:?}"))?;
            controls.tongue_contact = 0.0;
        }
        let sample = model
            .process_sample(controls)
            .map_err(|error| format!("frame={frame} {error:?}"))?;
        if frame > total * 2 / 5 {
            sustain.push(sample);
        }
    }
    let (f0, periodicity) = estimate_f0(&sustain, rate, target * 0.55, target * 1.9);
    Ok((1_200.0 * (f0 / target).log2(), periodicity))
}

#[test]
#[ignore = "round-11 dynamics calibration; run explicitly"]
fn per_note_compensation_points() {
    // For each table note, secant-tune the relative lip multiplier at each
    // excess point 2..5 kPa until the sounding pitch is within 2.5 cents of
    // 12-TET (point 1 kPa is the operating-table sweep point, multiplier 1).
    for &(midi, valves, ratio) in TRUMPET_NOTE_TABLE.iter() {
        if let Ok(only) = std::env::var("CAL_MIDI") {
            if only.parse::<i32>().ok() != Some(midi) {
                continue;
            }
        }
        let run = || -> Result<(), String> {
            // Sensitivity: cents gained per +1% relative lip at the sweep point.
            let (c1, q1) = render_cents(midi, valves, ratio, 1.0, 1.0)?;
            let (cs, _) = render_cents(midi, valves, ratio, 1.0, 0.99)?;
            let sens = ((c1 - cs).abs()).max(0.5); // cents per 1%
            let mut points = [1.0_f64; 9];
            let mut cents_out = [0.0_f64; 9];
            cents_out[0] = c1;
            let mut qmin = q1;
            for slot in 1..9usize {
                let e = 1.0 + 0.5 * slot as f64;
                // Warm-start from the previous point's multiplier.
                let mut m = points[slot - 1];
                let mut best = (f64::INFINITY, m, 0.0);
                let mut step_scale = 1.0;
                for _ in 0..8 {
                    match render_cents(midi, valves, ratio, e, m) {
                        Ok((c, q)) => {
                            if c.abs() < best.0.abs() || best.0.is_infinite() {
                                best = (c, m, q);
                            }
                            if c.abs() < 2.5 {
                                break;
                            }
                            m -= (c / sens) * 0.01 * step_scale;
                        }
                        Err(_) => {
                            // Solver left its basin: back off toward the last
                            // good multiplier with a smaller step.
                            step_scale *= 0.5;
                            m = (m + best.1) / 2.0;
                        }
                    }
                }
                points[slot] = best.1;
                cents_out[slot] = best.0;
                qmin = qmin.min(best.2);
            }
            let points_json = points
                .iter()
                .map(|value| format!("{value:.5}"))
                .collect::<Vec<_>>()
                .join(",");
            let cents_json = cents_out
                .iter()
                .map(|value| format!("{value:.1}"))
                .collect::<Vec<_>>()
                .join(",");
            println!(
                "CAL {{\"midi\":{midi},\"points\":[{points_json}],\"cents\":[{cents_json}],\"qmin\":{qmin:.4}}}"
            );
            Ok(())
        };
        if let Err(error) = run() {
            println!("CAL {{\"midi\":{midi},\"error\":\"{}\"}}", error.replace('"', "'"));
        }
    }
}

#[test]
#[ignore = "round-11 phonation-threshold sweep; run explicitly"]
fn per_note_pressure_floors() {
    // For each table note, bisect the lowest constant mouth pressure whose
    // seeded oscillation SUSTAINS (late-window RMS >= 1e-3 at 0.8-1.0 s)
    // rather than decaying back to silence. The velocity->pressure map's
    // per-note floor is this threshold plus margin, so no chart velocity
    // can ask the lip pair for a note below its phonation threshold.
    for &(midi, valves, ratio) in TRUMPET_NOTE_TABLE.iter() {
        let sustains = |pressure_pa: f64| -> Result<f64, String> {
            let rate = 48_000.0;
            let target = midi_hz(midi);
            let lip_base = target * ratio;
            let mut model = TrumpetModel::new(rate, TrumpetParameters::canonical())
                .map_err(|error| format!("{error:?}"))?;
            let mut controls = TrumpetControls {
                mouth_pressure_pa: 0.0,
                lip_resonance_hz: lip_base,
                lip_damping_ratio: 1.0 / 3.0,
                equilibrium_opening_m: 0.0,
                tongue_contact: 1.0,
                valves,
            };
            let ramp_frames = (0.03 * rate) as usize;
            let total = (1.0 * rate) as usize;
            let mut late = Vec::new();
            for frame in 0..total {
                let ramp = (frame as f64 / ramp_frames as f64).min(1.0);
                controls.mouth_pressure_pa = pressure_pa * ramp;
                let e = ((controls.mouth_pressure_pa - 5_500.0) / 1_000.0).clamp(0.0, 5.0);
                controls.lip_resonance_hz =
                    lip_base * trumpet::tpt_lip_comp_multiplier_for_tests(midi, e);
                controls.lip_damping_ratio =
                    (1.0 / 3.0 + TPT_DAMPING_SLOPE_PER_KPA * e).clamp(0.05, 0.95);
                if frame == ramp_frames {
                    model
                        .seed_open_normal_regime(100.0)
                        .map_err(|error| format!("{error:?}"))?;
                    controls.tongue_contact = 0.0;
                }
                let sample = model
                    .process_sample(controls)
                    .map_err(|error| format!("frame={frame} {error:?}"))?;
                if frame >= (0.8 * rate) as usize {
                    late.push(sample);
                }
            }
            let rms = (late.iter().map(|value| value * value).sum::<f64>()
                / late.len() as f64)
                .sqrt();
            Ok(rms)
        };
        let run = || -> Result<(), String> {
            let mut low = 3_200.0;
            let mut high = 10_500.0;
            if sustains(low)? >= 1.0e-3 {
                println!("FLOOR {{\"midi\":{midi},\"floor_pa\":3200.0,\"note\":\"sustains at map minimum\"}}");
                return Ok(());
            }
            if sustains(high)? < 1.0e-3 {
                println!("FLOOR {{\"midi\":{midi},\"error\":\"never sustains\"}}");
                return Ok(());
            }
            for _ in 0..9 {
                let middle = (low + high) / 2.0;
                if sustains(middle)? >= 1.0e-3 {
                    high = middle;
                } else {
                    low = middle;
                }
            }
            println!("FLOOR {{\"midi\":{midi},\"threshold_pa\":{high:.0}}}");
            Ok(())
        };
        if let Err(error) = run() {
            println!("FLOOR {{\"midi\":{midi},\"error\":\"{}\"}}", error.replace('"', "'"));
        }
    }
}
