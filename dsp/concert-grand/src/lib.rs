//! Deterministic DSP core for the Changes studio.
//!
//! Six independent capabilities share this module so the standalone artifact
//! embeds exactly one wasm payload:
//!
//! - `cg_*`: the Concert Grand note renderer. Modal/additive synthesis of a
//!   struck piano string set — inharmonic partials, per-register unison
//!   detuning with beating, dual-rate decay, velocity-dependent hammer
//!   spectrum, hammer/action noise, equal-power key panning — rendered as
//!   stereo PCM the audio engine plays through ordinary buffer sources.
//! - `gtr_*`: the physically modeled guitar — an extended Karplus-Strong
//!   waveguide behind two amp profiles. See `guitar.rs`.
//! - `clr_*`: the physically modeled clarinet — a reed-driven closed-open
//!   waveguide. See `clarinet.rs`.
//! - `flt_*`: the physically modeled flute — a jet-drive waveguide. See
//!   `flute.rs`.
//! - `an_*`: the spectrum analyzer. Windowed radix-2 FFT, spectral peaks with
//!   parabolic refinement, harmonic grouping into fundamentals, and a
//!   pitch-class chroma fold. This is the independent empirical check that
//!   what sounded is what the chart says.
//! - `smf_*`: the M0 Standard MIDI File decoder. A total streaming decode of
//!   the frozen SMF subset in which every hostile input maps to a structured
//!   refusal code and detection byte offset rather than a trap. See `smf.rs`.
//!
//! Everything is pure integer/float arithmetic over caller-provided buffers:
//! no clock, no random device, no allocation, no host import of any kind.
//! The same bytes produce the same samples on every platform, which is what
//! lets the test suite pin exact PCM hashes.

#![cfg_attr(all(not(test), target_arch = "wasm32"), no_std)]
#![allow(clippy::excessive_precision)]

#[cfg(all(not(test), target_arch = "wasm32"))]
#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}

mod clarinet;
mod flute;
mod guitar;
mod physical;
mod smf;

use libm::{cos, exp, log2, pow, sin, sqrt};

pub(crate) const TAU: f64 = 6.283185307179586476925286766559;

/// Frequency of a MIDI note in 12-TET at A4 = 440 Hz. The renderer stays on
/// the exact temperament the chart's theory uses so the analyzer's cents
/// readings measure the system, not a stylistic stretch curve.
pub(crate) fn midi_frequency_hz(midi: f64) -> f64 {
    440.0 * pow(2.0, (midi - 69.0) / 12.0)
}

/// Deterministic 32-bit xorshift. Seeded per note so every render of the same
/// (pitch, velocity, sample rate) is bit-identical.
pub(crate) struct XorShift32 {
    pub(crate) state: u32,
}

impl XorShift32 {
    pub(crate) fn new(seed: u32) -> Self {
        Self {
            state: if seed == 0 { 0x9e3779b9 } else { seed },
        }
    }

    pub(crate) fn next(&mut self) -> u32 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.state = x;
        x
    }

    /// Uniform in [-1, 1).
    pub(crate) fn bipolar(&mut self) -> f64 {
        (self.next() >> 8) as f64 / 8_388_608.0 - 1.0
    }
}

// ---------------------------------------------------------------------------
// Concert Grand note renderer
// ---------------------------------------------------------------------------

/*
 * Partial count is a direct multiplier on render cost: every partial is an
 * oscillator advanced per sample, per string. Forty-eight put the slowest
 * browser's main thread over its budget — the scheduler stopped ticking and
 * playback fell silent — while the partials above the twentieth sit at least
 * 40 dB down under this rolloff and are inaudible in a mix. Twenty-four
 * halves the work and keeps every partial the ear can find.
 */
const MAX_PARTIALS: usize = 24;
const MAX_STRINGS: usize = 3;
const MAX_OSCILLATORS: usize = MAX_PARTIALS * MAX_STRINGS;

/// Natural decay cap per register, seconds. Bass strings ring far longer than
/// the damperless treble, and the cap is also the cache-memory bound.
fn render_cap_seconds(midi: i32) -> f64 {
    if midi <= 43 {
        8.0
    } else if midi <= 59 {
        6.5
    } else if midi <= 76 {
        4.5
    } else {
        2.8
    }
}

/// Unison string count by register: single wound bass strings, doubles
/// through the tenor break, triples above.
fn string_count(midi: i32) -> usize {
    if midi <= 43 {
        1
    } else if midi <= 59 {
        2
    } else {
        3
    }
}

/// Railsback-order inharmonicity coefficient B, fitted to measured pianos:
/// ~1e-4 at the bottom of the keyboard rising to ~2e-2 at the top.
fn inharmonicity_b(midi: f64) -> f64 {
    exp(-9.21 + 0.0631 * (midi - 24.0))
}

/// The upper bound on frames `cg_render` may write for this note. The caller
/// sizes its buffers with this before rendering.
#[no_mangle]
pub extern "C" fn cg_note_frames(midi: i32, sample_rate: f32) -> i32 {
    if !(21..=108).contains(&midi) || !(8_000.0..=192_000.0).contains(&sample_rate) {
        return 0;
    }
    (render_cap_seconds(midi) * sample_rate as f64) as i32
}

struct OscillatorState {
    /// Complex rotation recurrence: (re, im) advanced by (rot_re, rot_im)
    /// each sample. Pure multiply/add in the inner loop, no per-sample
    /// transcendentals, f64 so amplitude drift over ten seconds is below
    /// one part in 1e9.
    re: f64,
    im: f64,
    rot_re: f64,
    rot_im: f64,
    /// Dual-rate amplitude: prompt sound and aftersound.
    env_fast: f64,
    env_slow: f64,
    decay_fast: f64,
    decay_slow: f64,
    gain_left: f64,
    gain_right: f64,
}

/// Render one struck note as stereo PCM into `left`/`right`.
///
/// Returns the frame count actually written (trailing silence trimmed), or 0
/// for an invalid request. Velocity shapes the hammer spectrum and noise, not
/// the output level: the engine's velocity-gain law owns loudness, so renders
/// are loudness-normalized against a fixed early-RMS target.
#[no_mangle]
pub extern "C" fn cg_render(
    midi: i32,
    velocity: i32,
    sample_rate: f32,
    left: *mut f32,
    right: *mut f32,
    max_frames: i32,
) -> i32 {
    let capacity = cg_note_frames(midi, sample_rate);
    if capacity == 0 || max_frames <= 0 || !(1..=127).contains(&velocity) {
        return 0;
    }
    /*
     * The caller may ask for less than the note's natural decay. A performance
     * gates most notes long before they die away, and synthesizing the unheard
     * remainder is the dominant cost: every partial is advanced per sample, per
     * string. Honour a shorter request by rendering only that many frames.
     */
    let capacity = capacity.min(max_frames);
    if left.is_null() || right.is_null() {
        return 0;
    }
    let frames = capacity as usize;
    let out_left = unsafe { core::slice::from_raw_parts_mut(left, frames) };
    let out_right = unsafe { core::slice::from_raw_parts_mut(right, frames) };

    let sr = sample_rate as f64;
    let m = midi as f64;
    let v_norm = velocity as f64 / 127.0;
    let f0 = midi_frequency_hz(m);
    let b = inharmonicity_b(m);
    let strings = string_count(midi);
    let nyquist_guard = 0.47 * sr;

    /*
     * Hammer spectrum. A soft hammer at low velocity keeps energy in the low
     * partials; a hard strike flattens the rolloff and pushes the spectral
     * corner up. The strike point comb (|sin(pi n x)| at x ~ 1/8.7 of the
     * string) is the fixed piano signature that notches the 8th-ish partial.
     */
    /*
     * jcpe-6veb warmth: the original corner (800 + 8000·v^1.6 ≈ 5.9 kHz at
     * velocity 96) let the hammer read as glassy. A concert grand played at
     * mezzo-forte keeps its energy centered low; the corner now rises from
     * 500 Hz to ~3.1 kHz at maximum velocity and the rolloff floor is a
     * touch steeper.
     */
    let rolloff_power = 1.9 + 1.2 * (1.0 - v_norm);
    let corner_hz = 500.0 + 2_600.0 * pow(v_norm, 1.6);
    let strike_point = 0.115;

    /* Fundamental decay: T60 from ~20 s in the bass to ~1 s at the top. */
    let t60_fundamental = 26.0 * exp(-(m - 21.0) / 26.0) + 0.55;

    /* Unison detune width in cents, widening slightly up the keyboard. */
    let detune_cents = 1.0 + 0.012 * (m - 21.0);
    let string_offset_scale: [f64; MAX_STRINGS] = match strings {
        1 => [0.0, 0.0, 0.0],
        2 => [-0.5, 0.5, 0.0],
        _ => [-1.0, 0.12, 1.0],
    };

    /*
     * Equal-power key pan, bass left to treble right — the perspective of
     * sitting at the instrument. Measured 2026-07-29: at the original +/-0.75
     * width the lowest key sat 10.5 dB left, and once the arrangement's bass
     * line moved into 28..48 the whole mix leaned 4.4 dB with the bass stem
     * 8 dB left-heavy. A real recording of a grand is nothing like that wide.
     * Even +/-0.22 left the mix 2.1 dB left with the bass stem 2.7 dB left
     * (measured from the rendered stems), because the arrangement's bass
     * lives at the bottom of the keyboard where the pan is most extreme.
     * +/-0.10 keeps a trace of the spatial cue and holds the whole keyboard
     * inside ~1 dB, so no arrangement can lean the mix by its register.
     */
    let pan = ((m - 21.0) / 87.0) * 0.20 - 0.10;

    let mut seed = XorShift32::new(
        0x434f_4e43 ^ ((midi as u32) << 16) ^ ((velocity as u32) << 8) ^ sample_rate as u32,
    );

    let mut oscillators = 0usize;
    let mut states: [OscillatorState; MAX_OSCILLATORS] = core::array::from_fn(|_| OscillatorState {
        re: 0.0,
        im: 0.0,
        rot_re: 1.0,
        rot_im: 0.0,
        env_fast: 0.0,
        env_slow: 0.0,
        decay_fast: 1.0,
        decay_slow: 1.0,
        gain_left: 0.0,
        gain_right: 0.0,
    });

    for string in 0..strings {
        let offset = string_offset_scale[string] * detune_cents;
        let string_f0 = f0 * pow(2.0, offset / 1_200.0);
        for n in 1..=MAX_PARTIALS {
            let nf = n as f64;
            let frequency = nf * string_f0 * sqrt(1.0 + b * nf * nf);
            if frequency >= nyquist_guard {
                break;
            }
            /* Partial amplitude: rolloff, hammer corner, strike-point comb. */
            let comb = sin(core::f64::consts::PI * nf * strike_point).abs();
            let corner = 1.0 / (1.0 + (frequency / corner_hz) * (frequency / corner_hz));
            let amplitude = comb * corner / pow(nf, rolloff_power);
            if amplitude < 1.0e-5 {
                continue;
            }
            /* Dual-rate decay, faster for higher partials. */
            let partial_scale = 1.0 + 0.02 * nf + 0.012 * nf * nf;
            let tau = t60_fundamental / 6.9078 / partial_scale;
            let tau_fast = tau / 3.5;
            let tau_slow = tau * 1.6;
            /* Deterministic phase jitter keeps bass onsets from buzzing. */
            let phase = seed.bipolar() * 0.15;
            /* Alternate partials lean left/right for width around the pan. */
            let spread = if n % 2 == 0 { 0.10 } else { -0.10 };
            let position = (pan + spread).clamp(-1.0, 1.0);
            let angle = (position + 1.0) * core::f64::consts::PI / 4.0;
            let state = &mut states[oscillators];
            state.re = amplitude * cos(phase);
            state.im = amplitude * sin(phase);
            let step = TAU * frequency / sr;
            state.rot_re = cos(step);
            state.rot_im = sin(step);
            state.env_fast = 0.72;
            state.env_slow = 0.28;
            state.decay_fast = exp(-1.0 / (tau_fast * sr));
            state.decay_slow = exp(-1.0 / (tau_slow * sr));
            state.gain_left = cos(angle);
            state.gain_right = sin(angle);
            oscillators += 1;
            if oscillators == MAX_OSCILLATORS {
                break;
            }
        }
    }
    if oscillators == 0 {
        return 0;
    }

    /*
     * Hammer contact noise and, below the tenor break, a low action thump.
     * Independent per-channel noise decorrelates the transient, which is a
     * large part of why two speakers read the onset as a physical strike.
     */
    let mut noise_left = XorShift32::new(seed.next());
    let mut noise_right = XorShift32::new(seed.next());
    let noise_corner_hz = 1_200.0 + 6_000.0 * v_norm;
    let noise_alpha = 1.0 - exp(-TAU * noise_corner_hz / sr);
    let noise_decay = exp(-1.0 / (0.004 * sr));
    let noise_level = 0.16 * pow(v_norm, 1.5);
    let thump_alpha = 1.0 - exp(-TAU * 150.0 / sr);
    let thump_decay = exp(-1.0 / (0.015 * sr));
    let thump_level = if midi < 60 { 0.05 } else { 0.015 };
    let mut noise_env = 1.0f64;
    let mut thump_env = 1.0f64;
    let mut lp_left = 0.0f64;
    let mut lp_right = 0.0f64;
    let mut thump_state = 0.0f64;

    /* Key-strike attack: sub-millisecond at forte, softer at piano. */
    let attack_seconds = 0.0035 - 0.0025 * v_norm;
    let attack_step = 1.0 - exp(-1.0 / (attack_seconds * sr));
    let mut attack = 0.0f64;

    for frame in 0..frames {
        let mut sum_left = 0.0f64;
        let mut sum_right = 0.0f64;
        for state in states[..oscillators].iter_mut() {
            let sample = state.im * (state.env_fast + state.env_slow);
            sum_left += sample * state.gain_left;
            sum_right += sample * state.gain_right;
            let re = state.re * state.rot_re - state.im * state.rot_im;
            let im = state.re * state.rot_im + state.im * state.rot_re;
            state.re = re;
            state.im = im;
            state.env_fast *= state.decay_fast;
            state.env_slow *= state.decay_slow;
        }
        attack += (1.0 - attack) * attack_step;

        lp_left += noise_alpha * (noise_left.bipolar() - lp_left);
        lp_right += noise_alpha * (noise_right.bipolar() - lp_right);
        thump_state += thump_alpha * (noise_left.bipolar() - thump_state);
        let strike_left = lp_left * noise_env * noise_level;
        let strike_right = lp_right * noise_env * noise_level;
        let thump = thump_state * thump_env * thump_level;
        noise_env *= noise_decay;
        thump_env *= thump_decay;

        out_left[frame] = ((sum_left * attack) + strike_left + thump) as f32;
        out_right[frame] = ((sum_right * attack) + strike_right + thump) as f32;
    }

    /*
     * Loudness normalization: fixed early RMS target so the keyboard is
     * balanced and the engine's velocity/batch gain law stays the only
     * loudness authority. Peak-guarded against the soft-clip stage.
     */
    let early = (0.2 * sr) as usize;
    let mut energy = 0.0f64;
    for frame in 0..early.min(frames) {
        let l = out_left[frame] as f64;
        let r = out_right[frame] as f64;
        energy += l * l + r * r;
    }
    let rms = sqrt(energy / (2.0 * early.min(frames).max(1) as f64));
    if rms <= 0.0 {
        return 0;
    }
    let mut scale = 0.22 / rms;
    let mut peak = 0.0f64;
    for frame in 0..frames {
        let l = (out_left[frame] as f64 * scale).abs();
        let r = (out_right[frame] as f64 * scale).abs();
        if l > peak {
            peak = l;
        }
        if r > peak {
            peak = r;
        }
    }
    if peak > 0.95 {
        scale *= 0.95 / peak;
    }
    for frame in 0..frames {
        out_left[frame] = (out_left[frame] as f64 * scale) as f32;
        out_right[frame] = (out_right[frame] as f64 * scale) as f32;
    }

    /* Trim trailing silence in 256-frame blocks; keep a short fade pad. */
    let threshold = 1.0e-4f32;
    let mut last = frames;
    'trim: while last > 256 {
        let block = &out_left[last - 256..last];
        let block_right = &out_right[last - 256..last];
        for index in 0..256 {
            if block[index].abs() > threshold || block_right[index].abs() > threshold {
                break 'trim;
            }
        }
        last -= 256;
    }
    last.min(frames) as i32
}

/// Shared post-processing for the waveguide renderers (`gtr_*`, `flt_*`):
/// the same loudness law the Concert Grand applies inline. Early-RMS
/// normalization to 0.22 keeps the engine's velocity/batch gain the only
/// loudness authority, the 0.95 peak guard protects the soft-clip stage,
/// and trailing silence is trimmed in 256-frame blocks.
pub(crate) fn finalize_stereo(out_left: &mut [f32], out_right: &mut [f32], sr: f64) -> i32 {
    let frames = out_left.len().min(out_right.len());
    if frames == 0 {
        return 0;
    }
    let early = ((0.2 * sr) as usize).min(frames).max(1);
    let mut energy = 0.0f64;
    for frame in 0..early {
        let l = out_left[frame] as f64;
        let r = out_right[frame] as f64;
        energy += l * l + r * r;
    }
    let rms = sqrt(energy / (2.0 * early as f64));
    if rms <= 0.0 {
        return 0;
    }
    let mut scale = 0.22 / rms;
    let mut peak = 0.0f64;
    for frame in 0..frames {
        let l = (out_left[frame] as f64 * scale).abs();
        let r = (out_right[frame] as f64 * scale).abs();
        if l > peak {
            peak = l;
        }
        if r > peak {
            peak = r;
        }
    }
    if peak > 0.95 {
        scale *= 0.95 / peak;
    }
    for frame in 0..frames {
        out_left[frame] = (out_left[frame] as f64 * scale) as f32;
        out_right[frame] = (out_right[frame] as f64 * scale) as f32;
    }
    let threshold = 1.0e-4f32;
    let mut last = frames;
    'trim: while last > 256 {
        let block = &out_left[last - 256..last];
        let block_right = &out_right[last - 256..last];
        for index in 0..256 {
            if block[index].abs() > threshold || block_right[index].abs() > threshold {
                break 'trim;
            }
        }
        last -= 256;
    }
    last.min(frames) as i32
}

// ---------------------------------------------------------------------------
// Spectrum analyzer
// ---------------------------------------------------------------------------

const MAX_FFT: usize = 8_192;

static mut FFT_RE: [f64; MAX_FFT] = [0.0; MAX_FFT];
static mut FFT_IM: [f64; MAX_FFT] = [0.0; MAX_FFT];

/// Windowed (Hann) radix-2 magnitude spectrum. `frames` must be a power of
/// two no larger than 8192; returns the bin count written (`frames / 2`) or 0.
///
/// Safety note on the static scratch: the artifact runs this on one thread —
/// wasm in this page has no workers by contract — so the scratch cannot be
/// aliased concurrently.
#[no_mangle]
pub extern "C" fn an_spectrum(input: *const f32, frames: i32, magnitudes: *mut f32) -> i32 {
    let n = frames as usize;
    if !(64..=MAX_FFT).contains(&n) || !n.is_power_of_two() || input.is_null() || magnitudes.is_null()
    {
        return 0;
    }
    let samples = unsafe { core::slice::from_raw_parts(input, n) };
    let output = unsafe { core::slice::from_raw_parts_mut(magnitudes, n / 2) };
    let re = unsafe { &mut *core::ptr::addr_of_mut!(FFT_RE) };
    let im = unsafe { &mut *core::ptr::addr_of_mut!(FFT_IM) };

    /* Hann window into bit-reversed positions. */
    let bits = n.trailing_zeros();
    for (index, sample) in samples.iter().enumerate() {
        let window =
            0.5 - 0.5 * cos(TAU * index as f64 / (n - 1) as f64);
        let target = (index.reverse_bits() >> (usize::BITS - bits)) & (n - 1);
        re[target] = *sample as f64 * window;
        im[target] = 0.0;
    }

    let mut length = 2usize;
    while length <= n {
        let step = TAU / length as f64;
        let w_re = cos(step);
        let w_im = -sin(step);
        let mut start = 0usize;
        while start < n {
            let mut cur_re = 1.0f64;
            let mut cur_im = 0.0f64;
            for offset in 0..length / 2 {
                let even = start + offset;
                let odd = even + length / 2;
                let t_re = re[odd] * cur_re - im[odd] * cur_im;
                let t_im = re[odd] * cur_im + im[odd] * cur_re;
                re[odd] = re[even] - t_re;
                im[odd] = im[even] - t_im;
                re[even] += t_re;
                im[even] += t_im;
                let next_re = cur_re * w_re - cur_im * w_im;
                cur_im = cur_re * w_im + cur_im * w_re;
                cur_re = next_re;
            }
            start += length;
        }
        length <<= 1;
    }

    let normalize = 2.0 / n as f64;
    for bin in 0..n / 2 {
        output[bin] = (sqrt(re[bin] * re[bin] + im[bin] * im[bin]) * normalize) as f32;
    }
    (n / 2) as i32
}

/// One detected fundamental: MIDI note, cents deviation, and summed strength.
/// Written as (midi, cents, strength) f32 triples.
#[no_mangle]
pub extern "C" fn an_notes(
    magnitudes: *const f32,
    bins: i32,
    sample_rate: f32,
    fft_size: i32,
    out: *mut f32,
    max_notes: i32,
) -> i32 {
    let bin_count = bins as usize;
    let capacity = max_notes as usize;
    if bin_count < 8 || capacity == 0 || magnitudes.is_null() || out.is_null() || fft_size <= 0 {
        return 0;
    }
    let mags = unsafe { core::slice::from_raw_parts(magnitudes, bin_count) };
    let triples = unsafe { core::slice::from_raw_parts_mut(out, capacity * 3) };
    let bin_hz = sample_rate as f64 / fft_size as f64;

    /* Global floor: peaks must clear both an absolute and a relative gate. */
    let mut ceiling = 0.0f32;
    for magnitude in mags.iter() {
        if *magnitude > ceiling {
            ceiling = *magnitude;
        }
    }
    if ceiling <= 1.0e-6 {
        return 0;
    }
    let gate = (ceiling * 0.02).max(1.0e-5);

    const MAX_PEAKS: usize = 64;
    let mut peak_hz = [0.0f64; MAX_PEAKS];
    let mut peak_mag = [0.0f64; MAX_PEAKS];
    let mut peaks = 0usize;
    let low_bin = ((27.0 / bin_hz) as usize).max(2);
    let high_bin = ((5_200.0 / bin_hz) as usize).min(bin_count - 2);
    for bin in low_bin..high_bin {
        let here = mags[bin];
        if here < gate || here < mags[bin - 1] || here <= mags[bin + 1] {
            continue;
        }
        /* Parabolic vertex over log magnitudes for sub-bin frequency. */
        let a = libm::log(mags[bin - 1].max(1.0e-9) as f64);
        let b = libm::log(here.max(1.0e-9) as f64);
        let c = libm::log(mags[bin + 1].max(1.0e-9) as f64);
        let denom = a - 2.0 * b + c;
        let shift = if denom.abs() < 1.0e-12 {
            0.0
        } else {
            (0.5 * (a - c) / denom).clamp(-0.5, 0.5)
        };
        peak_hz[peaks] = (bin as f64 + shift) * bin_hz;
        peak_mag[peaks] = here as f64;
        peaks += 1;
        if peaks == MAX_PEAKS {
            break;
        }
    }

    /*
     * Harmonic grouping, ascending: a peak within tolerance of an integer
     * multiple of an already-accepted fundamental strengthens that
     * fundamental; otherwise it opens a new one. Piano partials are
     * inharmonic, so the tolerance widens with the harmonic index.
     *
     * Octave rule: a peak on harmonic 2 or 4 of an accepted fundamental
     * whose magnitude rivals that fundamental's own peak is not a partial —
     * piano rolloff would leave a genuine harmonic several times weaker —
     * it is a doubled note (C3+C4 in one chord), so it opens its own
     * fundamental as well.
     */
    let mut note_hz = [0.0f64; MAX_PEAKS];
    let mut note_strength = [0.0f64; MAX_PEAKS];
    let mut note_peak_mag = [0.0f64; MAX_PEAKS];
    let mut notes = 0usize;
    for peak in 0..peaks {
        let hz = peak_hz[peak];
        let magnitude = peak_mag[peak];
        let mut attributed = false;
        let mut octave_double = false;
        for note in 0..notes {
            let ratio = hz / note_hz[note];
            let harmonic = libm::round(ratio);
            if !(1.0..=10.0).contains(&harmonic) {
                continue;
            }
            let inharmonic_slack = 1.0 + 0.004 * harmonic * harmonic;
            let cents = 1_200.0 * log2(ratio / (harmonic * inharmonic_slack));
            let tolerance = 40.0 + 6.0 * harmonic;
            if cents.abs() <= tolerance {
                if (harmonic == 2.0 || harmonic == 4.0)
                    && magnitude > 0.55 * note_peak_mag[note]
                {
                    octave_double = true;
                } else {
                    note_strength[note] += magnitude / harmonic;
                    attributed = true;
                }
                break;
            }
        }
        if (!attributed || octave_double) && notes < MAX_PEAKS {
            note_hz[notes] = hz;
            note_strength[notes] = magnitude;
            note_peak_mag[notes] = magnitude;
            notes += 1;
        }
    }

    /* Strongest first. */
    let mut order = [0usize; MAX_PEAKS];
    for (index, slot) in order.iter_mut().enumerate().take(notes) {
        *slot = index;
    }
    for a in 0..notes {
        for b in a + 1..notes {
            if note_strength[order[b]] > note_strength[order[a]] {
                order.swap(a, b);
            }
        }
    }

    let strongest = if notes == 0 {
        0.0
    } else {
        note_strength[order[0]]
    };
    let mut written = 0usize;
    for index in 0..notes {
        if written == capacity {
            break;
        }
        let note = order[index];
        if note_strength[note] < strongest * 0.07 {
            break;
        }
        let exact_midi = 69.0 + 12.0 * log2(note_hz[note] / 440.0);
        let nearest = libm::round(exact_midi);
        if !(21.0..=108.0).contains(&nearest) {
            continue;
        }
        triples[written * 3] = nearest as f32;
        triples[written * 3 + 1] = ((exact_midi - nearest) * 100.0) as f32;
        triples[written * 3 + 2] = note_strength[note] as f32;
        written += 1;
    }
    written as i32
}

/// Fold the magnitude spectrum into 12 pitch classes (C first), normalized to
/// a unit maximum. Returns 12, or 0 on an invalid request.
#[no_mangle]
pub extern "C" fn an_chroma(
    magnitudes: *const f32,
    bins: i32,
    sample_rate: f32,
    fft_size: i32,
    out: *mut f32,
) -> i32 {
    let bin_count = bins as usize;
    if bin_count < 8 || magnitudes.is_null() || out.is_null() || fft_size <= 0 {
        return 0;
    }
    let mags = unsafe { core::slice::from_raw_parts(magnitudes, bin_count) };
    let chroma = unsafe { core::slice::from_raw_parts_mut(out, 12) };
    let bin_hz = sample_rate as f64 / fft_size as f64;
    for slot in chroma.iter_mut() {
        *slot = 0.0;
    }
    let low_bin = ((55.0 / bin_hz) as usize).max(1);
    let high_bin = ((5_200.0 / bin_hz) as usize).min(bin_count - 1);
    for bin in low_bin..high_bin {
        let hz = bin as f64 * bin_hz;
        let exact_midi = 69.0 + 12.0 * log2(hz / 440.0);
        let pitch_class = ((libm::round(exact_midi) as i64 % 12) + 12) % 12;
        chroma[pitch_class as usize] += mags[bin] * mags[bin];
    }
    let mut ceiling = 0.0f32;
    for slot in chroma.iter() {
        if *slot > ceiling {
            ceiling = *slot;
        }
    }
    if ceiling > 0.0 {
        for slot in chroma.iter_mut() {
            *slot = sqrt((*slot / ceiling) as f64) as f32;
        }
    }
    12
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_a4_with_partials_at_the_expected_places() {
        let sample_rate = 48_000.0f32;
        let frames = cg_note_frames(69, sample_rate) as usize;
        assert!(frames > 0);
        let mut left = vec![0.0f32; frames];
        let mut right = vec![0.0f32; frames];
        let written = cg_render(
            69,
            96,
            sample_rate,
            left.as_mut_ptr(),
            right.as_mut_ptr(),
            frames as i32,
        );
        assert!(written > 48_000, "A4 should ring for over a second");
        /* Deterministic: a second render is bit-identical. */
        let mut left2 = vec![0.0f32; frames];
        let mut right2 = vec![0.0f32; frames];
        let written2 = cg_render(
            69,
            96,
            sample_rate,
            left2.as_mut_ptr(),
            right2.as_mut_ptr(),
            frames as i32,
        );
        assert_eq!(written, written2);
        assert_eq!(left[..written as usize], left2[..written as usize]);

        /* Spectrum of the body of the note: fundamental at A4. */
        let fft = 8_192usize;
        let start = 4_800;
        let mut mags = vec![0.0f32; fft / 2];
        let bins = an_spectrum(left[start..].as_ptr(), fft as i32, mags.as_mut_ptr());
        assert_eq!(bins as usize, fft / 2);
        let mut notes = vec![0.0f32; 3 * 8];
        let found = an_notes(
            mags.as_ptr(),
            bins,
            sample_rate,
            fft as i32,
            notes.as_mut_ptr(),
            8,
        );
        assert!(found >= 1);
        assert_eq!(notes[0] as i32, 69, "strongest fundamental is A4");
        assert!(notes[1].abs() < 12.0, "within 12 cents of A440");
    }

    #[test]
    fn chroma_of_a_c_major_chord_peaks_on_c_e_g() {
        let sample_rate = 48_000.0f32;
        let chord = [60, 64, 67];
        let fft = 8_192usize;
        let mut mix = vec![0.0f32; 48_000];
        for midi in chord {
            let frames = cg_note_frames(midi, sample_rate) as usize;
            let mut left = vec![0.0f32; frames];
            let mut right = vec![0.0f32; frames];
            let written = cg_render(
                midi,
                96,
                sample_rate,
                left.as_mut_ptr(),
                right.as_mut_ptr(),
                frames as i32,
            ) as usize;
            for frame in 0..written.min(mix.len()) {
                mix[frame] += left[frame] + right[frame];
            }
        }
        let mut mags = vec![0.0f32; fft / 2];
        let bins = an_spectrum(mix[2_400..].as_ptr(), fft as i32, mags.as_mut_ptr());
        let mut chroma = [0.0f32; 12];
        assert_eq!(
            an_chroma(mags.as_ptr(), bins, sample_rate, fft as i32, chroma.as_mut_ptr()),
            12
        );
        /* C, E, G above every non-chord class. */
        let chord_classes = [0usize, 4, 7];
        let mut weakest_chord_tone = f32::MAX;
        for class in chord_classes {
            if chroma[class] < weakest_chord_tone {
                weakest_chord_tone = chroma[class];
            }
        }
        for class in 0..12 {
            if chord_classes.contains(&class) {
                continue;
            }
            assert!(
                chroma[class] < weakest_chord_tone,
                "class {class} ({}) should sit below the chord tones ({chroma:?})",
                chroma[class],
            );
        }
    }
}
