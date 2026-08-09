//! Round-11 operating-table sweep (jcpe-trumpet-lock-completion-el46).
//!
//! For each playable note (MIDI 52..=70, standard Bb-trumpet fingerings on
//! bore regimes 2/3/4) sweep the lip-resonance target ratio and report which
//! (valve mask, lip target) locks the RIGHT regime: f0 within tolerance of
//! 12-TET, periodicity >= 0.99, at 48 kHz and re-verified at 44.1 kHz.
//! Output: one JSON line per (note, ratio) probe plus a SELECT line per note.
//! The winning rows are baked into src/trumpet.rs as TRUMPET_NOTE_TABLE with
//! this sweep as provenance; the render exports then consume the table.
//!
//! Run: cargo test --release --test trumpet_note_sweep -- --ignored --nocapture

#[path = "../src/trumpet.rs"]
mod trumpet;

use trumpet::{TrumpetControls, TrumpetModel, TrumpetParameters};

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

/// Standard Bb-trumpet fingerings (sounding), regimes 2..4.
/// (midi, [v1, v2, v3])
fn fingering(midi: i32) -> Option<[f64; 3]> {
    let (base, offset) = match midi {
        52..=58 => (58, 58 - midi),
        59..=65 => (65, 65 - midi),
        66..=70 => (70, 70 - midi),
        _ => return None,
    };
    let _ = base;
    Some(match offset {
        0 => [0.0, 0.0, 0.0],
        1 => [0.0, 1.0, 0.0],
        2 => [1.0, 0.0, 0.0],
        3 => [1.0, 1.0, 0.0],
        4 => [0.0, 1.0, 1.0],
        5 => [1.0, 0.0, 1.0],
        6 => [1.0, 1.0, 1.0],
        _ => return None,
    })
}

fn render_note(
    midi: i32,
    valves: [f64; 3],
    lip_hz: f64,
    pressure_pa: f64,
    sample_rate_hz: f64,
) -> Result<Vec<f64>, String> {
    let mut model = TrumpetModel::new(sample_rate_hz, TrumpetParameters::canonical())
        .map_err(|error| format!("{error:?}"))?;
    let mut controls = TrumpetControls {
        mouth_pressure_pa: 0.0,
        lip_resonance_hz: lip_hz,
        lip_damping_ratio: 1.0 / 3.0,
        equilibrium_opening_m: 0.0,
        tongue_contact: 1.0,
        valves,
    };
    let ramp_frames = (0.03 * sample_rate_hz) as usize;
    let total = (0.5 * sample_rate_hz) as usize;
    let mut sustain = Vec::new();
    for frame in 0..total {
        let ramp = (frame as f64 / ramp_frames as f64).min(1.0);
        controls.mouth_pressure_pa = pressure_pa * ramp;
        // Round-11 player law scaled to this note's excess band.
        let excess_kpa = ((controls.mouth_pressure_pa - 5_500.0) / 1_000.0).max(0.0);
        controls.lip_damping_ratio = (1.0 / 3.0 + 0.00751 * excess_kpa).clamp(0.05, 0.95);
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
    Ok(sustain)
}

#[test]
#[ignore = "round-11 operating-table sweep; run explicitly"]
fn note_table_sweep() {
    for midi in 52..=70 {
        let valves = fingering(midi).unwrap();
        let target = midi_hz(midi);
        let mut best: Option<(f64, f64, f64)> = None; // (ratio, cents, periodicity)
        for step in 0..10 {
            let ratio = 1.04 + 0.02 * step as f64;
            let lip = target * ratio;
            match render_note(midi, valves, lip, 6_500.0, 48_000.0) {
                Ok(samples) => {
                    let (f0, periodicity) =
                        estimate_f0(&samples, 48_000.0, target * 0.55, target * 1.9);
                    let cents = 1_200.0 * (f0 / target).log2();
                    println!(
                        "{{\"midi\":{midi},\"ratio\":{ratio:.2},\"f0\":{f0:.2},\"cents\":{cents:.1},\"periodicity\":{periodicity:.4}}}"
                    );
                    if periodicity >= 0.99 && cents.abs() < 45.0 {
                        let better = match best {
                            None => true,
                            Some((_, best_cents, _)) => cents.abs() < best_cents.abs(),
                        };
                        if better {
                            best = Some((ratio, cents, periodicity));
                        }
                    }
                }
                Err(error) => {
                    println!(
                        "{{\"midi\":{midi},\"ratio\":{ratio:.2},\"error\":\"{}\"}}",
                        error.replace('"', "'")
                    );
                }
            }
        }
        match best {
            Some((ratio, cents, periodicity)) => {
                // Re-verify the winner at 44.1 kHz.
                let lip = target * ratio;
                let verdict = match render_note(midi, valves, lip, 6_500.0, 44_100.0) {
                    Ok(samples) => {
                        let (f0, p441) =
                            estimate_f0(&samples, 44_100.0, target * 0.55, target * 1.9);
                        let cents441 = 1_200.0 * (f0 / target).log2();
                        format!("\"cents441\":{cents441:.1},\"periodicity441\":{p441:.4}")
                    }
                    Err(error) => format!("\"error441\":\"{}\"", error.replace('"', "'")),
                };
                println!(
                    "SELECT {{\"midi\":{midi},\"valves\":[{},{},{}],\"lip_ratio\":{ratio:.2},\"cents\":{cents:.1},\"periodicity\":{periodicity:.4},{verdict}}}",
                    valves[0], valves[1], valves[2]
                );
            }
            None => println!("SELECT {{\"midi\":{midi},\"unlockable\":true}}"),
        }
    }
}
