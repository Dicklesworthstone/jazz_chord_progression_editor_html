//! Physically modeled conical-bore reed instruments: oboe and alto
//! saxophone.
//!
//! A cone with the reed at its (truncated) apex resonates at the FULL
//! harmonic series — unlike the clarinet's cylinder, whose closed-open
//! geometry keeps only the odd modes. In one-dimensional scattering terms
//! the spherical spreading inside the cone flips the apex reflection's
//! effective sign, so the round trip is non-inverting: this model carries a
//! full-period loop whose reed-end injection is negated (the apex phase
//! flip), which the render harness verifies by measuring a full series
//! locked on f0.
//!
//! The two instruments share the core and differ where the physics
//! differs:
//!
//! - **Reed**: the oboe's double reed is a stiff, tight valve (a hard
//!   slope, saturating early — the pinched, reedy attack); the saxophone's
//!   single reed on its mouthpiece lay is softer and stays open further
//!   into the pressure range.
//! - **Bell/body voicing**: the oboe radiates through narrow tone holes
//!   with its famous reedy formant band; the alto sax's wide conical body
//!   and large bell sit darker with a warm low-mid body resonance.
//! - **Breath**: the sax carries more air noise and a wider vibrato, per
//!   its jazz idiom; the oboe is steadier.
//!
//! Tuning follows the same measured discipline as the flute and clarinet:
//! analytic reflection phase compensation, a rate-compensated DC blocker,
//! a fractional tuning allpass, and a measured loop-participation
//! calibration fitted over the register sweep.
//!
//! Deterministic: fixed-seed noise per (pitch, velocity, rate, model), no
//! allocation, no host imports.

use libm::{atan2, cos, exp, pow, sin};

use crate::{midi_frequency_hz, XorShift32, TAU};

/// Longest supported full-period loop: MIDI 21 at 192 kHz is ~6 982.
const WND_MAX_DELAY: usize = 8_192;

static mut WND_BORE: [f64; WND_MAX_DELAY] = [0.0; WND_MAX_DELAY];

const WND_CAP_SECONDS: f64 = 5.0;
const WND_END_FADE_SECONDS: f64 = 0.15;

fn model_valid(model: i32) -> bool {
    (0..=1).contains(&model)
}

/// The upper bound on frames `wnd_render` may write for this note.
#[no_mangle]
pub extern "C" fn wnd_note_frames(midi: i32, sample_rate: f32) -> i32 {
    if !(21..=108).contains(&midi) || !(8_000.0..=192_000.0).contains(&sample_rate) {
        return 0;
    }
    (WND_CAP_SECONDS * sample_rate as f64) as i32
}

/// Two-pole formant resonator (same recurrence as the guitar's body modes).
#[derive(Clone, Copy)]
struct Formant {
    b0: f64,
    a1: f64,
    a2: f64,
    y1: f64,
    y2: f64,
}

impl Formant {
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

/// Render one blown note as stereo PCM. Model 0 = oboe, 1 = alto sax.
/// Velocity is breath pressure (brightness through the reed's saturation),
/// never output loudness.
#[no_mangle]
pub extern "C" fn wnd_render(
    midi: i32,
    velocity: i32,
    sample_rate: f32,
    model: i32,
    left: *mut f32,
    right: *mut f32,
    max_frames: i32,
) -> i32 {
    let capacity = wnd_note_frames(midi, sample_rate);
    if capacity == 0
        || max_frames <= 0
        || !(1..=127).contains(&velocity)
        || !model_valid(model)
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
    if period >= (WND_MAX_DELAY - 4) as f64 {
        return 0;
    }

    let mut seed = XorShift32::new(
        0x574e_4453
            ^ ((midi as u32) << 16)
            ^ ((velocity as u32) << 8)
            ^ ((model as u32) << 24)
            ^ sample_rate as u32,
    );

    let oboe = model == 0;

    /*
     * Bell/tone-hole reflection: dark one-pole. The oboe's lattice keeps a
     * brighter reflection (more energy returns above the break); the sax
     * bell is larger and darker.
     */
    let reflection_corner = if oboe {
        (2.6 * f0).clamp(1_400.0, 8_000.0)
    } else {
        (2.0 * f0).clamp(900.0, 5_500.0)
    };
    let reflection_alpha = 1.0 - exp(-TAU * reflection_corner / sr);
    let omega = TAU * f0 / sr;
    let pole = 1.0 - reflection_alpha;
    let reflection_delay = atan2(pole * sin(omega), 1.0 - pole * cos(omega)) / omega;

    /*
     * MEASURED loop-participation pull (render harness sweep at 48 kHz,
     * refit whenever the loop changes), fitted per model; the fit domain
     * clamps to each instrument's real register.
     */
    let (pull_cents, low_clamp, high_clamp) = if oboe {
        (WND_OBOE_PULL, 58.0, 92.0)
    } else {
        (WND_SAX_PULL, 49.0, 81.0)
    };
    let mc = m.clamp(low_clamp, high_clamp);
    let pull = ((pull_cents[0] * mc + pull_cents[1]) * mc + pull_cents[2]) * mc + pull_cents[3];
    let corrected_period = period * pow(2.0, pull / 1_200.0);
    let effective = (corrected_period - reflection_delay - 0.5).max(3.2);
    let bore_length = ((effective - 0.1) as usize).max(3);
    let bore_fraction = effective - bore_length as f64;
    let tuning_a = (1.0 - bore_fraction) / (1.0 + bore_fraction);
    let mut tuning_x1 = 0.0f64;
    let mut tuning_y1 = 0.0f64;

    let bore = unsafe { &mut *core::ptr::addr_of_mut!(WND_BORE) };
    for slot in bore.iter_mut().take(WND_MAX_DELAY) {
        *slot = 0.0;
    }
    let mut bore_write = 0usize;
    let mut reflection_state = 0.0f64;

    let dc_pole = exp(-TAU * 38.3 / sr);
    let mut dc_x1 = 0.0f64;
    let mut dc_y1 = 0.0f64;

    /*
     * Reed tables. Δp bends the reed toward the lay; the double reed is
     * stiffer (hard slope, saturates early), the single reed softer.
     */
    let (reed_offset, reed_slope) = if oboe { (0.62, -0.44) } else { (0.72, -0.26) };
    let pressure_target = if oboe {
        0.64 + 0.22 * pow(v_norm, 1.3)
    } else {
        0.6 + 0.24 * pow(v_norm, 1.3)
    };
    let attack_seconds = if oboe { 0.035 } else { 0.05 };
    let attack_step = 1.0 - exp(-1.0 / (attack_seconds * sr));
    let (vibrato_hz, vibrato_depth, vibrato_onset_s) = if oboe {
        (5.4, 0.010, 0.4)
    } else {
        (5.2, 0.022, 0.3)
    };
    let vibrato_onset = vibrato_onset_s * sr;
    let vibrato_ramp = 0.4 * sr;
    let noise_level = if oboe { 0.012 + 0.018 * v_norm } else { 0.02 + 0.04 * v_norm };
    let noise_alpha = 1.0 - exp(-TAU * 3_400.0 / sr);
    let mut noise_lp = 0.0f64;
    let mut pressure = 0.0f64;

    /*
     * Radiation voicing. The oboe's reedy formants sit near 1.1 and 3 kHz;
     * the alto sax carries a warm body resonance near 650 Hz and a softer
     * presence near 1.8 kHz.
     */
    let mut formants = if oboe {
        [
            Formant::new(1_150.0, 4.5, 1.5, sr),
            Formant::new(3_000.0, 5.0, 0.8, sr),
        ]
    } else {
        [
            Formant::new(650.0, 3.2, 1.3, sr),
            Formant::new(1_800.0, 3.6, 0.6, sr),
        ]
    };
    let direct_mix = if oboe { 0.5 } else { 0.6 };
    let radiation_gain = 6.0;

    let mut previous_bore = 0.0f64;
    let pan = ((m - 64.0) / 48.0).clamp(-1.0, 1.0) * 0.06;
    let angle = (pan + 1.0) * core::f64::consts::PI / 4.0;
    let (pan_left, pan_right) = (cos(angle), sin(angle));

    let end_fade_frames = (WND_END_FADE_SECONDS * sr) as usize;

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

        /* Open end: dark lossy reflection behind the DC blocker. */
        let bore_out = bore[bore_write];
        reflection_state += reflection_alpha * (bore_out - reflection_state);
        let reflected = {
            let x = -0.95 * reflection_state;
            let y = x - dc_x1 + dc_pole * dc_y1;
            dc_x1 = x;
            dc_y1 = y;
            y
        };

        /* Reed junction with the conical apex phase flip: the injection is
         * negated, making the full round trip non-inverting so the cone's
         * complete harmonic series stands on f0. */
        let pressure_diff = reflected - breath;
        let reed = (reed_offset + reed_slope * pressure_diff).clamp(-1.0, 1.0);
        let bore_in = -(breath + pressure_diff * reed);

        let tuned = tuning_a * bore_in + tuning_x1 - tuning_a * tuning_y1;
        tuning_x1 = bore_in;
        tuning_y1 = tuned;
        bore[bore_write] = tuned;
        bore_write = (bore_write + 1) % bore_length;

        /* Radiated field: differentiated bore through the formant voicing. */
        let radiated = (bore_out - previous_bore) * radiation_gain;
        previous_bore = bore_out;
        let mut voiced = radiated * direct_mix;
        for formant in formants.iter_mut() {
            voiced += formant.tick(radiated);
        }
        voiced += 0.05 * noise_lp * pressure;

        let mut sample = voiced;
        if frames - frame <= end_fade_frames {
            let position = (frames - frame) as f64 / end_fade_frames as f64;
            sample *= position;
        }
        out_left[frame] = (sample * pan_left) as f32;
        out_right[frame] = (sample * pan_right) as f32;
    }

    crate::finalize_stereo(out_left, out_right, sr)
}

/// Cubic pull coefficients (a·m³ + b·m² + c·m + d), fitted by the harness.
/// Zero until the first calibration sweep runs.
const WND_OBOE_PULL: [f64; 4] = [0.0, 0.0, 0.0, 0.0];
const WND_SAX_PULL: [f64; 4] = [0.0, 0.0, 0.0, 0.0];
