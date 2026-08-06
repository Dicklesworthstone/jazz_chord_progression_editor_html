//! Physically modeled electric guitar: an extended Karplus-Strong digital
//! waveguide rendered through one of two amp profiles.
//!
//! The model is first-principles string physics, not a sample and not an
//! oscillator stack:
//!
//! - **String**: a fractional-length delay-line waveguide per polarization.
//!   The loop carries a two-point damping average whose per-pass gain is set
//!   from a register-dependent T60 target (low wound strings ring seconds,
//!   high plain strings die fast), a first-order dispersion allpass cascade
//!   modeling string stiffness (audibly detunes upper partials sharp, the
//!   piano-adjacent shimmer of a wound string), and a first-order tuning
//!   allpass absorbing the fractional part of the period after every other
//!   loop element's group delay is compensated.
//! - **Dual polarization**: a real string vibrates in two planes with
//!   slightly different terminations. Two coupled waveguides a hair apart in
//!   frequency and decay produce the two-stage decay and slow beating a
//!   single loop cannot.
//! - **Pluck**: the excitation is velocity-shaped noise (pick hardness as a
//!   one-pole corner) with a pick-position comb (delay-and-subtract at the
//!   fractional pluck point) and a short broadband pick click.
//! - **Body**: a bank of two-pole modal resonators fitted to archtop body
//!   modes (air resonance near 105 Hz upward) mixed with the direct string.
//! - **Amp profiles**: profile 0 is a clean jazz archtop chain (barely-driven
//!   soft stage into a dark cab rolloff); profile 1 is a driven blues chain
//!   (pre-emphasis into a hot tanh stage into a cab bandpass with a
//!   presence peak). Same string, audibly different instruments.
//!
//! Everything is deterministic: fixed-seed noise per (pitch, velocity, rate,
//! profile), no allocation, no host imports; the same request renders the
//! same PCM everywhere.

use libm::{cos, exp, pow, sin, tanh};

use crate::{midi_frequency_hz, XorShift32, TAU};

/// Longest supported waveguide: MIDI 21 at 192 kHz is ~6 982 samples.
const GTR_MAX_DELAY: usize = 8_192;

/// Single-threaded scratch (the artifact runs wasm on one thread by
/// contract, exactly like the analyzer's FFT scratch).
static mut GTR_STRING_V: [f64; GTR_MAX_DELAY] = [0.0; GTR_MAX_DELAY];
static mut GTR_STRING_H: [f64; GTR_MAX_DELAY] = [0.0; GTR_MAX_DELAY];
static mut GTR_EXCITE: [f64; GTR_MAX_DELAY] = [0.0; GTR_MAX_DELAY];

/// Natural decay target for the fundamental, seconds.
fn guitar_t60_seconds(midi: f64) -> f64 {
    5.5 * exp(-(midi - 40.0) / 25.0) + 0.6
}

fn render_cap_seconds(midi: i32) -> f64 {
    let t60 = guitar_t60_seconds(midi as f64);
    (t60 * 1.15).clamp(1.2, 6.0)
}

/// The upper bound on frames `gtr_render` may write for this note.
#[no_mangle]
pub extern "C" fn gtr_note_frames(midi: i32, sample_rate: f32) -> i32 {
    if !(21..=108).contains(&midi) || !(8_000.0..=192_000.0).contains(&sample_rate) {
        return 0;
    }
    (render_cap_seconds(midi) * sample_rate as f64) as i32
}

/// First-order allpass state: y[n] = a·x[n] + x[n-1] − a·y[n-1].
#[derive(Clone, Copy)]
struct Allpass {
    a: f64,
    x1: f64,
    y1: f64,
}

impl Allpass {
    fn new(a: f64) -> Self {
        Self { a, x1: 0.0, y1: 0.0 }
    }

    #[inline]
    fn tick(&mut self, x: f64) -> f64 {
        let y = self.a * x + self.x1 - self.a * self.y1;
        self.x1 = x;
        self.y1 = y;
        y
    }

    /// Low-frequency group delay in samples.
    fn delay(&self) -> f64 {
        (1.0 - self.a) / (1.0 + self.a)
    }
}

/// Two-pole modal resonator: y[n] = g·x[n] + 2r·cosθ·y[n-1] − r²·y[n-2].
#[derive(Clone, Copy)]
struct Mode {
    b0: f64,
    a1: f64,
    a2: f64,
    y1: f64,
    y2: f64,
}

impl Mode {
    fn new(frequency_hz: f64, q: f64, gain: f64, sr: f64) -> Self {
        let theta = TAU * (frequency_hz / sr).min(0.45);
        let r = exp(-theta / (2.0 * q));
        Self {
            b0: gain * (1.0 - r),
            a1: 2.0 * r * cos(theta),
            a2: -(r * r),
            y1: 0.0,
            y2: 0.0,
        }
    }

    #[inline]
    fn tick(&mut self, x: f64) -> f64 {
        let y = self.b0 * x + self.a1 * self.y1 + self.a2 * self.y2;
        self.y2 = self.y1;
        self.y1 = y;
        y
    }
}

/// One waveguide polarization: integer delay + damping average + dispersion
/// cascade + fractional tuning allpass, with per-pass loss.
struct Polarization {
    length: usize,
    write: usize,
    damp_s: f64,
    damp_prev: f64,
    loss: f64,
    dispersion: [Allpass; 2],
    dispersion_stages: usize,
    tuning: Allpass,
}

impl Polarization {
    /// Solve the loop layout for an exact period of `period` samples.
    fn new(period: f64, damp_s: f64, loss: f64, dispersion_a: f64, stages: usize) -> Self {
        let dispersion = [Allpass::new(dispersion_a), Allpass::new(dispersion_a)];
        let mut consumed = damp_s;
        for stage in dispersion.iter().take(stages) {
            consumed += stage.delay();
        }
        /*
         * Integer part at least 2; the tuning allpass absorbs the rest.
         * The fractional target is kept in [0.1, 1.1) — an allpass asked
         * for a delay near zero has its coefficient near one and rings.
         */
        let remaining = (period - consumed).max(2.5);
        let length = ((remaining - 0.1) as usize).max(2);
        let fraction = remaining - length as f64;
        /* First-order tuning allpass for delay d: a = (1−d)/(1+d). */
        let a = (1.0 - fraction) / (1.0 + fraction);
        Self {
            length,
            write: 0,
            damp_s,
            damp_prev: 0.0,
            loss,
            dispersion,
            dispersion_stages: stages,
            tuning: Allpass::new(a),
        }
    }
}

fn profile_valid(profile: i32) -> bool {
    (0..=1).contains(&profile)
}

/// Render one plucked note as stereo PCM. Profile 0 = clean archtop jazz
/// chain, profile 1 = driven blues chain. Returns frames written or 0 for
/// an invalid request. Velocity shapes pick hardness and drive, not output
/// level: renders are loudness-normalized to a fixed early-RMS target.
#[no_mangle]
pub extern "C" fn gtr_render(
    midi: i32,
    velocity: i32,
    sample_rate: f32,
    profile: i32,
    left: *mut f32,
    right: *mut f32,
    max_frames: i32,
) -> i32 {
    let capacity = gtr_note_frames(midi, sample_rate);
    if capacity == 0
        || max_frames <= 0
        || !(1..=127).contains(&velocity)
        || !profile_valid(profile)
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
    if period >= (GTR_MAX_DELAY - 4) as f64 {
        return 0;
    }

    let mut seed = XorShift32::new(
        0x4754_5221
            ^ ((midi as u32) << 16)
            ^ ((velocity as u32) << 8)
            ^ ((profile as u32) << 24)
            ^ sample_rate as u32,
    );

    /*
     * String setup. Damping average y' = (1−S)x + S·x_prev: S is the HF
     * loss knob (flat-wound jazz strings darker than round-wound blues
     * strings) and contributes S samples of loop delay. Per-pass loss hits
     * −60 dB at the register's T60. Dispersion stages only on wound-string
     * registers; the allpass coefficient is small enough to keep the
     * fundamental within a couple cents, which the tuning allpass absorbs.
     */
    let t60 = guitar_t60_seconds(m);
    let loss = pow(10.0, -3.0 / (t60 * f0));
    let damp_s = if profile == 0 {
        0.58 - 0.10 * ((m - 40.0) / 48.0).clamp(0.0, 1.0)
    } else {
        0.46 - 0.10 * ((m - 40.0) / 48.0).clamp(0.0, 1.0)
    };
    let (dispersion_a, dispersion_stages) = if midi < 50 {
        (-0.14, 2usize)
    } else if midi < 62 {
        (-0.08, 1usize)
    } else {
        (0.0, 0usize)
    };

    /* Vertical polarization on pitch; horizontal a hair sharp, lossier. */
    let mut vertical = Polarization::new(period, damp_s, loss, dispersion_a, dispersion_stages);
    let mut horizontal = Polarization::new(
        period / pow(2.0, 1.7 / 1_200.0),
        damp_s,
        pow(10.0, -3.0 / (t60 * 0.55 * f0)),
        dispersion_a,
        dispersion_stages,
    );

    /*
     * Pluck excitation: one period of pick-hardness lowpassed noise with a
     * pick-position comb. Position ~0.13 of the string near the bridge for
     * the blues profile, ~0.28 (over the end of the fingerboard) for jazz.
     */
    let pick_position = if profile == 0 { 0.28 } else { 0.16 };
    let pick_corner_hz = 900.0 + 5_600.0 * pow(v_norm, 1.4);
    let pick_alpha = 1.0 - exp(-TAU * pick_corner_hz / sr);
    let string_v = unsafe { &mut *core::ptr::addr_of_mut!(GTR_STRING_V) };
    let string_h = unsafe { &mut *core::ptr::addr_of_mut!(GTR_STRING_H) };
    let excite = unsafe { &mut *core::ptr::addr_of_mut!(GTR_EXCITE) };
    for slot in string_v.iter_mut().take(GTR_MAX_DELAY) {
        *slot = 0.0;
    }
    for slot in string_h.iter_mut().take(GTR_MAX_DELAY) {
        *slot = 0.0;
    }
    /* Shaped noise into the scratch, then comb read-only from it so the
     * comb never observes its own output. */
    let longest = vertical.length.max(horizontal.length);
    let mut lp = 0.0f64;
    for slot in excite.iter_mut().take(longest) {
        lp += pick_alpha * (seed.bipolar() - lp);
        *slot = lp;
    }
    let comb_v = ((vertical.length as f64 * pick_position) as usize).max(1);
    for index in 0..vertical.length {
        let delayed = excite[(index + vertical.length - comb_v) % vertical.length];
        string_v[index] = excite[index] - 0.92 * delayed;
    }
    let comb_h = ((horizontal.length as f64 * pick_position) as usize).max(1);
    for index in 0..horizontal.length {
        let delayed = excite[(index + horizontal.length - comb_h) % horizontal.length];
        /* The horizontal plane receives a weaker pluck. */
        string_h[index] = 0.55 * (excite[index] - 0.92 * delayed);
    }

    /* Archtop body modes: air resonance and top-plate modes. */
    let mut body = [
        Mode::new(106.0, 9.0, 1.9, sr),
        Mode::new(188.0, 11.0, 1.4, sr),
        Mode::new(268.0, 13.0, 1.1, sr),
        Mode::new(392.0, 14.0, 0.85, sr),
        Mode::new(548.0, 16.0, 0.66, sr),
        Mode::new(795.0, 18.0, 0.50, sr),
        Mode::new(1_240.0, 20.0, 0.36, sr),
        Mode::new(2_310.0, 22.0, 0.22, sr),
    ];

    /* Pick click: a couple milliseconds of decaying broadband noise. */
    let click_decay = exp(-1.0 / (0.0016 * sr));
    let click_level = 0.055 * pow(v_norm, 1.6);
    let mut click_env = 1.0f64;

    /*
     * Amp profile.
     * Clean archtop: drive barely past linear, two dark one-pole rolloffs.
     * Driven blues: pre-emphasis highpass into a hot stage, cab highpass,
     * presence peak, two cab rolloffs a little over 4 kHz.
     */
    /*
     * Owner rejection of the first chain ("not remotely realistic; the
     * blues guitar should sound clear, like a nicely recorded Chet
     * Atkins record"): the 3.9x tanh stage was a fuzz, not an amp, and
     * both cabs were too dark. The rework models what a clean tube amp
     * actually does to a guitar: a LIGHTLY driven asymmetric stage (the
     * x^2 term is the tube's even-harmonic warmth; the tanh only rounds
     * peaks), supply SAG (an envelope follower dips the gain under load
     * - the compression 'feel' of a recorded amp), a single-pole cab
     * rolloff high enough to keep chime, and a mild presence peak.
     * Profile 0 stays the dark jazz archtop; profile 1 is the bright
     * clear twang chain.
     */
    let (drive, asymmetry, pre_hp_hz, cab_lp_hz, presence, sag_depth) = if profile == 0 {
        (1.25, 0.12, 55.0, 4_200.0, None, 0.22)
    } else {
        (1.55, 0.18, 70.0, 6_500.0, Some(Mode::new(3_200.0, 2.4, 0.5, sr)), 0.3)
    };
    let mut presence_mode = presence;
    let pre_hp_alpha = 1.0 - exp(-TAU * pre_hp_hz / sr);
    let cab_lp_alpha = 1.0 - exp(-TAU * cab_lp_hz / sr);
    let cab_hp_alpha = 1.0 - exp(-TAU * 88.0 / sr);
    let mut pre_hp_state = 0.0f64;
    let mut cab_lp1 = 0.0f64;
    let mut cab_hp_state = 0.0f64;
    let drive_norm = tanh(drive);
    /* Sag follower: fast attack, slow recovery, like a rectifier supply. */
    let sag_attack = 1.0 - exp(-1.0 / (0.006 * sr));
    let sag_release = 1.0 - exp(-1.0 / (0.18 * sr));
    let mut sag_env = 0.0f64;

    /*
     * A guitar amp is one speaker: the render is mono through an
     * equal-power register pan (narrow, piano-consistent); the studio's
     * shared reverb supplies the room.
     */
    let pan = ((m - 40.0) / 48.0).clamp(-1.0, 1.0) * 0.10;
    let angle = (pan + 1.0) * core::f64::consts::PI / 4.0;
    let (pan_left, pan_right) = (cos(angle), sin(angle));

    /*
     * Bridge coupling. Additive injection is unstable wherever the
     * coupling exceeds the loop's per-pass loss headroom (measured: high
     * strings GREW, 0.05 → 0.47 RMS over a second, because 1−loss at the
     * twelfth fret is under a percent). Difference coupling exchanges
     * energy instead of creating it, and the strength is capped by a
     * fraction of the loss headroom so the coupled system's eigenvalues
     * stay inside the unit circle in every register.
     */
    let coupling = (0.25 * (1.0 - loss)).min(0.012);
    let mut click_noise = XorShift32::new(seed.next());

    for frame in 0..frames {
        /* Advance each polarization one sample. */
        let mut outs = [0.0f64; 2];
        for (which, pol) in [&mut vertical, &mut horizontal].into_iter().enumerate() {
            let line: &mut [f64; GTR_MAX_DELAY] =
                if which == 0 { string_v } else { string_h };
            let read = pol.write;
            let raw = line[read];
            /* Damping average with S samples of delay built into layout. */
            let damped = (1.0 - pol.damp_s) * raw + pol.damp_s * pol.damp_prev;
            pol.damp_prev = raw;
            let mut signal = damped * pol.loss;
            for stage in 0..pol.dispersion_stages {
                signal = pol.dispersion[stage].tick(signal);
            }
            signal = pol.tuning.tick(signal);
            outs[which] = signal;
            line[read] = signal;
            pol.write = (pol.write + 1) % pol.length;
        }
        /* Bridge coupling: the planes exchange, never create, energy. */
        {
            let v_slot = (vertical.write + vertical.length - 1) % vertical.length;
            let h_slot = (horizontal.write + horizontal.length - 1) % horizontal.length;
            let exchange = coupling * (outs[1] - outs[0]);
            string_v[v_slot] += exchange;
            string_h[h_slot] -= exchange;
        }
        let string_out = outs[0] + 0.6 * outs[1];

        /* Body: modal bank plus direct string. */
        let mut body_out = 0.0f64;
        for mode in body.iter_mut() {
            body_out += mode.tick(string_out);
        }
        let click = click_noise.bipolar() * click_env * click_level;
        click_env *= click_decay;
        let instrument = string_out * 0.55 + body_out * 0.45 + click;

        /* Amp chain: sag -> asymmetric light drive -> cab voicing. */
        pre_hp_state += pre_hp_alpha * (instrument - pre_hp_state);
        let pre = instrument - pre_hp_state;
        let magnitude = if pre >= 0.0 { pre } else { -pre };
        let sag_step = if magnitude > sag_env { sag_attack } else { sag_release };
        sag_env += sag_step * (magnitude - sag_env);
        let sagged = pre / (1.0 + sag_depth * sag_env);
        let asym = sagged + asymmetry * sagged * sagged;
        let shaped = tanh(asym * drive) / drive_norm;
        cab_hp_state += cab_hp_alpha * (shaped - cab_hp_state);
        let mut post = shaped - cab_hp_state;
        if let Some(mode) = presence_mode.as_mut() {
            post += mode.tick(post);
        }
        cab_lp1 += cab_lp_alpha * (post - cab_lp1);
        let amped = cab_lp1;

        out_left[frame] = (amped * pan_left) as f32;
        out_right[frame] = (amped * pan_right) as f32;
    }

    crate::finalize_stereo(out_left, out_right, sr)
}
