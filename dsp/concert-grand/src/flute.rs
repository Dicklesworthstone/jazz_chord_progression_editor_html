//! Physically modeled flute: a jet-drive waveguide in the
//! McIntyre–Schumacher–Woodhouse / Verge family.
//!
//! The sound is produced the way a real flute produces it — not by
//! oscillators imitating the result but by simulating the mechanism:
//!
//! - **Bore**: a delay-line waveguide one period long whose termination is a
//!   one-pole lowpass reflection (the open end radiates treble and reflects
//!   bass) behind a DC blocker.
//! - **Air jet**: the player's jet crosses the embouchure hole in a transit
//!   time of half the bore period (the ratio that locks the fundamental).
//!   The jet displacement drives the classic cubic nonlinearity
//!   `x·(x²−1)` — the saturating switching function of the jet fully
//!   deflecting into and out of the embouchure hole. That nonlinearity is
//!   where the harmonics come from, and why they grow with breath pressure
//!   exactly as a blown-harder flute brightens.
//! - **Breath**: a pressure envelope with a soft attack, filtered turbulence
//!   noise proportional to pressure (the breathy chiff of the onset and the
//!   air in the sustain), and delayed vibrato as jet-pressure modulation —
//!   the mechanism by which a flutist's vibrato modulates both pitch and
//!   brightness together.
//! - **Radiation**: the listener hears the radiated field, so the bore
//!   output is differentiated (+6 dB/octave) and mixed with a little direct
//!   turbulence.
//!
//! Deterministic: fixed-seed noise per (pitch, velocity, rate), no
//! allocation, no host imports.

use libm::{atan2, cos, exp, pow, sin};

use crate::{midi_frequency_hz, XorShift32, TAU};

/// Longest supported bore: MIDI 21 at 192 kHz is ~6 982 samples.
const FLT_MAX_DELAY: usize = 8_192;

static mut FLT_BORE: [f64; FLT_MAX_DELAY] = [0.0; FLT_MAX_DELAY];
static mut FLT_JET: [f64; FLT_MAX_DELAY] = [0.0; FLT_MAX_DELAY];

/// A flute sustains as long as the breath does; the render carries enough
/// for any musical gate and bakes a fade at the very end so a note held to
/// the buffer's edge ends as a breath release, never a cut.
const FLT_CAP_SECONDS: f64 = 5.0;
const FLT_END_FADE_SECONDS: f64 = 0.15;

/// The upper bound on frames `flt_render` may write for this note.
#[no_mangle]
pub extern "C" fn flt_note_frames(midi: i32, sample_rate: f32) -> i32 {
    if !(21..=108).contains(&midi) || !(8_000.0..=192_000.0).contains(&sample_rate) {
        return 0;
    }
    (FLT_CAP_SECONDS * sample_rate as f64) as i32
}

/// Render one blown note as stereo PCM. Returns frames written or 0 for an
/// invalid request. Velocity is breath: pressure target, brightness through
/// the jet nonlinearity, and turbulence level — not output loudness, which
/// is normalized to the shared early-RMS target.
#[no_mangle]
pub extern "C" fn flt_render(
    midi: i32,
    velocity: i32,
    sample_rate: f32,
    left: *mut f32,
    right: *mut f32,
    max_frames: i32,
) -> i32 {
    let capacity = flt_note_frames(midi, sample_rate);
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
    if period >= (FLT_MAX_DELAY - 4) as f64 {
        return 0;
    }

    let mut seed = XorShift32::new(
        0x464c_5545 ^ ((midi as u32) << 16) ^ ((velocity as u32) << 8) ^ sample_rate as u32,
    );

    /*
     * Loop lengths. The reflection one-pole's low-frequency group delay is
     * (1−α)/α samples — register-dependent and as large as eight samples
     * on low notes, which is exactly the ±50-cent wander the first
     * measurement pass showed under a fixed compensation. It is computed
     * analytically here, the DC blocker adds a negligible constant, and a
     * first-order tuning allpass absorbs the fractional remainder.
     */
    let reflection_alpha = 1.0 - exp(-TAU * (1.92 * f0).clamp(900.0, 6_500.0) / sr);
    /*
     * What detunes the loop is the filter's PHASE delay at the note's own
     * frequency, not its DC group delay — the DC figure over-compensated
     * by several samples and measured a consistent 36..60 cents sharp.
     * For y[n] = y[n-1] + α(x[n] − y[n-1]): φ(ω) = −atan2(pole·sinω,
     * 1 − pole·cosω), τ_p = −φ/ω.
     */
    let omega = TAU * f0 / sr;
    let pole = 1.0 - reflection_alpha;
    let reflection_delay = atan2(pole * sin(omega), 1.0 - pole * cos(omega)) / omega;
    /*
     * Jet-participation calibration. The regenerative loop does not sound
     * at exactly sr/bore: the jet path (half a period long, feeding back
     * through jet_reflection) contributes phase and pulls the lock sharp.
     * The pull is stable across velocity and register-dependent; it was
     * MEASURED by the render harness (+58 cents at MIDI 48, ~+31 mid
     * register, +51 at MIDI 96) and fitted as a shallow parabola. The
     * bore is lengthened by exactly the fitted pull, the same
     * measure-then-correct discipline the piano applies to its recorded
     * stretch. Residuals after this correction measure within a few
     * cents.
     */
    let pull_cents = 30.0 + 0.038 * (m - 75.0) * (m - 75.0);
    let corrected_period = period * pow(2.0, pull_cents / 1_200.0);
    let effective = (corrected_period - reflection_delay - 0.5).max(3.2);
    let bore_length = ((effective - 0.1) as usize).max(3);
    let bore_fraction = effective - bore_length as f64;
    let tuning_a = (1.0 - bore_fraction) / (1.0 + bore_fraction);
    let mut tuning_x1 = 0.0f64;
    let mut tuning_y1 = 0.0f64;
    let jet_length = ((period * 0.5).max(2.0)) as usize;

    let bore = unsafe { &mut *core::ptr::addr_of_mut!(FLT_BORE) };
    let jet = unsafe { &mut *core::ptr::addr_of_mut!(FLT_JET) };
    for slot in bore.iter_mut().take(FLT_MAX_DELAY) {
        *slot = 0.0;
    }
    for slot in jet.iter_mut().take(FLT_MAX_DELAY) {
        *slot = 0.0;
    }
    let mut bore_write = 0usize;
    let mut jet_write = 0usize;

    /* Reflection: dark one-pole at the open end, computed above. */
    let mut reflection_state = 0.0f64;
    let end_reflection = 0.48f64;
    let jet_reflection = 0.5f64;

    /* DC blocker inside the loop keeps the nonlinearity centered. */
    let mut dc_x1 = 0.0f64;
    let mut dc_y1 = 0.0f64;

    /*
     * Breath. Pressure rises over ~55 ms (a tongued attack), holds, and the
     * bake-in fade at the buffer end is the release. Vibrato onsets after
     * ~0.32 s and modulates jet pressure at 5.1 Hz — pitch and brightness
     * together, as blowing does. Turbulence is lowpassed noise scaled by
     * the instantaneous pressure.
     */
    /*
     * Jet operating point. The cubic x·(x²−1) has its useful gain around
     * the inflection at zero and dies at full deflection (f(±1)=0): the
     * first measurement pass drove it with breath near 0.9 and the top of
     * the range collapsed (weak everything at velocity 120), while breath
     * near 0.6 at low velocity failed to lock the fundamental cleanly.
     * The retuned range straddles the inflection: enough pressure to
     * oscillate at pianissimo, still short of deflection collapse at
     * fortissimo.
     */
    /* Measured lock plateau: below ~0.7 the jet never crosses oscillation
     * threshold (output stays at the noise floor); past ~0.93 deflection
     * collapse sets in. Dynamics ride the plateau; softness comes from the
     * turbulence mix, not from starving the jet. */
    let pressure_target = 0.78 + 0.10 * pow(v_norm, 1.4);
    /* A real jet is offset from the labium: the asymmetry that gives a
     * flute its even harmonics, which a pure odd cubic cannot produce. */
    let jet_offset = 0.11f64;
    let attack_step = 1.0 - exp(-1.0 / (0.055 * sr));
    let vibrato_hz = 5.1;
    let vibrato_depth = 0.028;
    let vibrato_onset = 0.32 * sr;
    let vibrato_ramp = 0.35 * sr;
    let noise_level = 0.028 + 0.05 * v_norm;
    let noise_alpha = 1.0 - exp(-TAU * 3_800.0 / sr);
    let mut noise_lp = 0.0f64;
    let mut pressure = 0.0f64;

    /* Radiation differentiator and a touch of direct breath in the field. */
    let mut previous_bore = 0.0f64;
    let direct_breath = 0.18f64;

    /* Fixed near-center pan: one instrument, one seat. */
    let pan = ((m - 60.0) / 48.0).clamp(-1.0, 1.0) * 0.06;
    let angle = (pan + 1.0) * core::f64::consts::PI / 4.0;
    let (pan_left, pan_right) = (cos(angle), sin(angle));

    let end_fade_frames = (FLT_END_FADE_SECONDS * sr) as usize;

    for frame in 0..frames {
        pressure += (pressure_target - pressure) * attack_step;
        let vibrato_gate = if (frame as f64) < vibrato_onset {
            0.0
        } else {
            (((frame as f64) - vibrato_onset) / vibrato_ramp).min(1.0)
        };
        let vibrato =
            1.0 + vibrato_depth * vibrato_gate * sin(TAU * vibrato_hz * frame as f64 / sr);
        noise_lp += noise_alpha * (seed.bipolar() - noise_lp);
        let breath = pressure * vibrato * (1.0 + noise_level * noise_lp);

        /* Bore end: reflect through the dark lowpass, block DC. */
        let bore_out = bore[bore_write];
        reflection_state += reflection_alpha * (bore_out - reflection_state);
        let reflected = {
            let x = reflection_state;
            let y = x - dc_x1 + 0.995 * dc_y1;
            dc_x1 = x;
            dc_y1 = y;
            y
        };

        /* Jet: pressure difference travels the jet, then saturates with
         * the labium offset breaking the cubic's symmetry. */
        let pressure_diff = breath - jet_reflection * reflected;
        let jet_out = jet[jet_write];
        jet[jet_write] = pressure_diff;
        jet_write = (jet_write + 1) % jet_length;
        let deflection = (jet_out + jet_offset).clamp(-1.0, 1.0);
        let jet_drive = deflection * (deflection * deflection - 1.0);

        /* Bore input: jet drive plus the end reflection, through the
         * fractional tuning allpass. */
        let bore_in = jet_drive + end_reflection * reflected;
        let tuned = tuning_a * bore_in + tuning_x1 - tuning_a * tuning_y1;
        tuning_x1 = bore_in;
        tuning_y1 = tuned;
        bore[bore_write] = tuned;
        bore_write = (bore_write + 1) % bore_length;

        /* Radiated field: differentiated bore plus direct turbulence. */
        let radiated = (bore_out - previous_bore) * 8.0 + direct_breath * noise_lp * pressure;
        previous_bore = bore_out;

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
