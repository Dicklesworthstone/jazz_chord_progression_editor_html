//! Physically modeled clarinet: a reed-driven cylindrical waveguide.
//!
//! The clarinet reuses the flute's architecture — a delay-line bore behind a
//! lossy reflection, a nonlinear excitation, breath dynamics — with the two
//! substitutions that make a clarinet a clarinet:
//!
//! - **Closed-open bore**: the reed end is (acoustically) closed, so the
//!   standing wave fits a QUARTER wavelength in the tube and the delay line
//!   is half a period long with an inverting open-end reflection. That
//!   geometry is why a clarinet sounds an octave below a flute of the same
//!   length, why its spectrum is odd-harmonic-dominant (the hollow sound),
//!   and why it overblows a twelfth instead of an octave.
//! - **Reed valve**: instead of an air jet, a pressure-controlled valve. The
//!   reed table maps the pressure difference across the reed to a
//!   reflection coefficient — mouth pressure bends the reed toward the lay,
//!   closing the aperture — and its saturation is the harmonic source,
//!   growing exactly as a harder-blown clarinet brightens.
//!
//! An oboe was considered and deferred: its bore is conical, and a conical
//! waveguide is not honestly approximated by this cylindrical machinery
//! (it needs spatially varying impedance or a scattering-junction chain).
//!
//! Deterministic: fixed-seed noise per (pitch, velocity, rate), no
//! allocation, no host imports.

use libm::{atan2, cos, exp, pow, sin};

use crate::physical::{DcBlocker, DelayLine, OnePoleLoss, RadiationFilter};
use crate::{midi_frequency_hz, vibrato_variation, XorShift32, TAU};

/// Longest supported half-period bore: MIDI 21 at 192 kHz is ~3 491 samples.
const CLR_MAX_DELAY: usize = 4_096;

static mut CLR_BORE: [f64; CLR_MAX_DELAY] = [0.0; CLR_MAX_DELAY];

/// Sustained like the flute: enough for any musical gate, with a baked
/// release fade at the buffer's very end.
const CLR_CAP_SECONDS: f64 = 5.0;
const CLR_END_FADE_SECONDS: f64 = 0.15;

/// The upper bound on frames `clr_render` may write for this note.
#[no_mangle]
pub extern "C" fn clr_note_frames(midi: i32, sample_rate: f32) -> i32 {
    if !(21..=108).contains(&midi) || !(8_000.0..=192_000.0).contains(&sample_rate) {
        return 0;
    }
    (CLR_CAP_SECONDS * sample_rate as f64) as i32
}

/// Render one blown note as stereo PCM. Returns frames written or 0 for an
/// invalid request. Velocity is breath pressure: brightness through the
/// reed's saturation, not output loudness, which is normalized to the
/// shared early-RMS target.
#[no_mangle]
pub extern "C" fn clr_render(
    midi: i32,
    velocity: i32,
    sample_rate: f32,
    left: *mut f32,
    right: *mut f32,
    max_frames: i32,
) -> i32 {
    clr_render_inner(midi, velocity, sample_rate, left, right, max_frames, None)
}

#[no_mangle]
pub extern "C" fn clr_render_seeded(
    midi: i32,
    velocity: i32,
    sample_rate: f32,
    variation_slot: u32,
    left: *mut f32,
    right: *mut f32,
    max_frames: i32,
) -> i32 {
    let Some(variation) = vibrato_variation(variation_slot) else {
        return 0;
    };
    clr_render_inner(
        midi,
        velocity,
        sample_rate,
        left,
        right,
        max_frames,
        Some(variation),
    )
}

fn clr_render_inner(
    midi: i32,
    velocity: i32,
    sample_rate: f32,
    left: *mut f32,
    right: *mut f32,
    max_frames: i32,
    variation: Option<crate::VibratoVariation>,
) -> i32 {
    let capacity = clr_note_frames(midi, sample_rate);
    if capacity == 0
        || max_frames <= 0
        || !(1..=127).contains(&velocity)
        || left.is_null()
        || right.is_null()
    {
        return 0;
    }
    let frames = capacity.min(max_frames) as usize;
    let out_left = unsafe { core::slice::from_raw_parts_mut(left, frames) };
    let out_right = unsafe { core::slice::from_raw_parts_mut(right, frames) };

    let sr = sample_rate as f64;
    let m = midi as f64;
    let v_norm = velocity as f64 / 127.0;
    let f0 = midi_frequency_hz(m);
    let period = sr / f0;
    /* Half-period bore: the closed-open round trip is one full period. */
    let half_period = period * 0.5;
    if half_period >= (CLR_MAX_DELAY - 4) as f64 {
        return 0;
    }

    let mut seed = XorShift32::new(
        0x434c_5254 ^ ((midi as u32) << 16) ^ ((velocity as u32) << 8) ^ sample_rate as u32,
    );

    /*
     * Open-end reflection: dark, inverting, slightly lossy one-pole. Its
     * phase delay at f0 is compensated analytically (the flute's measured
     * lesson), and a first-order tuning allpass absorbs the fraction.
     * The residual loop-participation pull was MEASURED by the render
     * harness across the register and fitted; the same
     * measure-then-correct discipline as the flute's jet calibration.
     */
    let reflection_alpha = 1.0 - exp(-TAU * (2.4 * f0).clamp(1_100.0, 7_000.0) / sr);
    let omega = TAU * f0 / sr;
    let pole = 1.0 - reflection_alpha;
    let reflection_delay = atan2(pole * sin(omega), 1.0 - pole * cos(omega)) / omega;
    /*
     * MEASURED loop-participation pull, velocity-independent, fitted as a
     * cubic over the render harness's register sweep (residuals within a
     * cent at 48 kHz): 165 cents sharp at MIDI 45 falling to ~56 around
     * MIDI 79 with a slight rise above.
     */
    /* Fit provenance: 48 kHz render-harness register sweep (2026-08-06
     * campaign, model-measure comb scan), sweep domain MIDI 50..89,
     * post-fit residuals within a cent at 48 kHz. The clamp domain 49..92
     * deliberately extends one-to-three semitones past the sweep and holds
     * the ENDPOINT value there instead of extrapolating the cubic
     * (extrapolating below drove a below-range A2 across a mode boundary);
     * notes outside 49..92 therefore carry the boundary correction, not a
     * measured one. */
    let mc = m.clamp(49.0, 92.0);
    /* Low-chalumeau correction (2026-08-06 independent autocorrelation
     * fixture): below MIDI 62 the cubic under-pulls by a smooth slope
     * reaching +8 cents sharp at MIDI 50, consistent at 44.1/48/96 kHz;
     * post-correction residuals measure within about two cents. */
    let pull_fit = ((-0.000927 * mc + 0.292118) * mc - 28.445028) * mc + 937.770853
        + 0.58 * (62.0 - mc).max(0.0);
    /* Small measured rate term: at 96 kHz the fitted pull over-corrects
     * linearly above MIDI 60 (−9 at 72 to −27 at 89); at 44.1 kHz the
     * same term is negligible. */
    let rate_term = -0.85 * (mc - 60.0).max(0.0) * (sr / 48_000.0 - 1.0);
    let pull_cents = pull_fit + rate_term;
    let corrected_half = half_period * pow(2.0, pull_cents / 1_200.0);
    let effective = (corrected_half - reflection_delay - 0.5).max(3.2);
    let bore_length = ((effective - 0.1) as usize).max(3);
    let bore_fraction = effective - bore_length as f64;
    let tuning_a = (1.0 - bore_fraction) / (1.0 + bore_fraction);
    let mut tuning_x1 = 0.0f64;
    let mut tuning_y1 = 0.0f64;

    let bore = unsafe { &mut *core::ptr::addr_of_mut!(CLR_BORE) };
    let Some(mut bore_delay) = DelayLine::new(bore, bore_length) else {
        return 0;
    };

    let mut reflection_loss = OnePoleLoss::new(reflection_alpha);

    /* Rate-compensated DC blocker (the flute's 96 kHz lesson). */
    let dc_pole = exp(-TAU * 38.3 / sr);
    let mut dc_blocker = DcBlocker::new(dc_pole);

    /*
     * Reed table: reflection coefficient of the mouthpiece as a function
     * of the pressure difference across the reed, r = offset + slope·Δp,
     * clamped to [-1, 1]. At small Δp the reed is open and springy; rising
     * mouth pressure bends it toward the lay until it slams shut
     * (r saturates at 1), which is where the odd-harmonic bite comes
     * from. Offset/slope follow the classic STK reed, and breath rides a
     * plateau measured the same way the flute's was: high enough to
     * speak at pianissimo, short of a closed-reed squeeze at fortissimo.
     */
    let reed_offset = 0.7f64;
    let reed_slope = -0.3f64;
    let pressure_target = 0.68 + 0.20 * pow(v_norm, 1.3);
    let attack_step = 1.0 - exp(-1.0 / (0.03 * sr));
    let vibrato_hz = 4.8 * variation.map_or(1.0, |value| value.rate_multiplier);
    let vibrato_depth = 0.012 * variation.map_or(1.0, |value| value.depth_multiplier);
    let vibrato_onset = 0.35 * sr * variation.map_or(1.0, |value| value.onset_multiplier);
    let vibrato_ramp = 0.4 * sr;
    let vibrato_step = TAU * vibrato_hz / sr;
    let (vibrato_step_sin, vibrato_step_cos) = (sin(vibrato_step), cos(vibrato_step));
    let mut vibrato_sin = variation.map_or(0.0, |value| sin(value.phase_radians));
    let mut vibrato_cos = variation.map_or(1.0, |value| cos(value.phase_radians));
    /* A clarinet is far less breathy than a flute. */
    let noise_level = 0.005 + 0.009 * v_norm;
    let noise_alpha = 1.0 - exp(-TAU * 3_200.0 / sr);
    let mut noise_lp = 0.0f64;
    let mut pressure = 0.0f64;

    /* Band-limit the differentiated radiation (the flute's hiss lesson). */
    let radiation_alpha = 1.0 - exp(-TAU * 5_500.0 / sr);
    let mut radiation = RadiationFilter::new(radiation_alpha, 6.0);
    let pan = ((m - 60.0) / 48.0).clamp(-1.0, 1.0) * 0.06;
    let angle = (pan + 1.0) * core::f64::consts::PI / 4.0;
    let (pan_left, pan_right) = (cos(angle), sin(angle));

    let end_fade_frames = (CLR_END_FADE_SECONDS * sr) as usize;

    for frame in 0..frames {
        pressure += (pressure_target - pressure) * attack_step;
        let vibrato_gate = if (frame as f64) < vibrato_onset {
            0.0
        } else {
            (((frame as f64) - vibrato_onset) / vibrato_ramp).min(1.0)
        };
        let lfo = if variation.is_some() {
            vibrato_sin
        } else {
            sin(TAU * vibrato_hz * frame as f64 / sr)
        };
        let vibrato = 1.0 + vibrato_depth * vibrato_gate * lfo;
        if variation.is_some() {
            let next_sin = vibrato_sin * vibrato_step_cos + vibrato_cos * vibrato_step_sin;
            vibrato_cos = vibrato_cos * vibrato_step_cos - vibrato_sin * vibrato_step_sin;
            vibrato_sin = next_sin;
        }
        noise_lp += noise_alpha * (seed.bipolar() - noise_lp);
        let breath = pressure * vibrato * (1.0 + noise_level * noise_lp);

        /* Open end: dark inverting reflection behind the DC blocker. */
        let bore_out = bore_delay.output();
        let reflected = dc_blocker.process(-0.95 * reflection_loss.process(bore_out));

        /* Reed junction: pressure difference sets the reed's reflection. */
        let pressure_diff = reflected - breath;
        let reed = (reed_offset + reed_slope * pressure_diff).clamp(-1.0, 1.0);
        let bore_in = breath + pressure_diff * reed;

        let tuned = tuning_a * bore_in + tuning_x1 - tuning_a * tuning_y1;
        tuning_x1 = bore_in;
        tuning_y1 = tuned;
        bore_delay.push(tuned);

        /* Radiated field: gentle differentiation, band-limited, near-dry
         * breath. */
        let radiated = radiation.process(bore_out) + 0.012 * noise_lp * pressure;

        let mut sample = radiated;
        if frames - frame <= end_fade_frames {
            let position = (frames - frame) as f64 / end_fade_frames as f64;
            sample *= position;
        }
        out_left[frame] = (sample * pan_left) as f32;
        out_right[frame] = (sample * pan_right) as f32;
    }

    crate::finalize_stereo(out_left, out_right, sr)
}
