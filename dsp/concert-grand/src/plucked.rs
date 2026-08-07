//! PHS4 plucked-string family v2 (spec bbd3e2a, pack-driven).
//!
//! Four public targets share one physical architecture and differ ONLY by
//! reviewed packs (spec differentiation law):
//!
//! - 0 `archtop`      — steel archtop, neck pickup, clean compact amp
//! - 1 `electric`     — strat-style solid body, RWRP parallel pickups,
//!                      Marshall-class drive chain (authored design target,
//!                      NOT a measured Marshall fit)
//! - 2 `dreadnought`  — steel flat-top acoustic, radiating body, no amp
//! - 3 `ukulele`      — re-entrant nylon soprano/concert, radiating body
//!
//! Physics per spec:
//! - Two-polarization bidirectional stiff string (extended Karplus-Strong
//!   loop per polarization) with frequency-dependent loss derived from the
//!   pack's T60 pair and dispersion derived from the string's PHYSICAL
//!   inharmonicity B = pi^3 E d^4 / (64 T L^2) — gauge, tension, and scale
//!   from `tests/fixtures/plucked-string-v2/instrument-packs.json`.
//! - Bridge/body: mass-normalized body modes (generated tables in
//!   `plucked_body_tables.rs`, offline foundry authority
//!   `foundry-plate-mode-v1`) with signed bridge residues b_k and radiation
//!   residues r_k. The bridge exchange is difference coupling bounded by a
//!   fraction of the loop's per-pass loss headroom — the in-repo stability
//!   law that replaced the divergent additive injection — so the coupled
//!   system cannot create energy. Acoustic output is the radiation sum
//!   `sum(r_k * mode_velocity)`; body velocity loads the string back.
//! - Pickup (electric targets): finite-aperture string-velocity taps at the
//!   pack position, in-phase parallel sum (RWRP hum cancellation is a
//!   wiring fact recorded in the pack; only string signal is modeled — the
//!   model has no hum source), through the pack's passive RLC loading
//!   resonance.
//! - Amp: pack operating points. The Marshall-class chain is cascaded
//!   asymmetric stages (triode-ish then power) under supply sag, a
//!   three-band tone stack, and a closed-back cab envelope, with the
//!   nonlinear stages oversampled per the pack's rate policy through
//!   half-band filters.
//!
//! Deterministic: fixed-seed noise per (instrument, pitch, velocity, rate);
//! no allocation; same request, same PCM.

use libm::{cos, exp, log, pow, sin, tanh};

use crate::physical::flush_denormal;
use crate::plucked_body_tables::{
    BODY_ARCHTOP, BODY_DREADNOUGHT, BODY_SOLID_ELECTRIC, BODY_UKULELE, BODY_UPRIGHT_BASS,
};
use crate::{midi_frequency_hz, XorShift32, TAU};

const PLK_MAX_DELAY: usize = 8_192;
const PLK_MAX_MODES: usize = 20;

static mut PLK_STRING_V: [f64; PLK_MAX_DELAY] = [0.0; PLK_MAX_DELAY];
static mut PLK_STRING_H: [f64; PLK_MAX_DELAY] = [0.0; PLK_MAX_DELAY];
static mut PLK_EXCITE: [f64; PLK_MAX_DELAY] = [0.0; PLK_MAX_DELAY];

/// [open_midi, diameter_m, tension_N, mass_per_length_kg_m] per string.
type StringRow = [f64; 4];

struct StringSet {
    rows: &'static [StringRow],
    young_pa: f64,
    /// T60 seconds at 100 Hz and 1 kHz (log-frequency interpolated).
    t60_pair: [f64; 2],
    scale_m: f64,
}

const ARCHTOP_STRINGS: [StringRow; 6] = [
    [40.0, 0.00132, 73.2, 0.00643],
    [45.0, 0.00107, 70.1, 0.00432],
    [50.0, 0.00084, 67.5, 0.00261],
    [55.0, 0.00061, 64.8, 0.00143],
    [59.0, 0.00041, 58.2, 0.00071],
    [64.0, 0.0003, 56.4, 0.00048],
];
const DREADNOUGHT_STRINGS: [StringRow; 6] = [
    [40.0, 0.00142, 82.0, 0.0072],
    [45.0, 0.00112, 78.0, 0.0048],
    [50.0, 0.00089, 75.0, 0.0029],
    [55.0, 0.00064, 72.0, 0.00155],
    [59.0, 0.00043, 65.0, 0.00076],
    [64.0, 0.00033, 63.0, 0.00053],
];
const ELECTRIC_STRINGS: [StringRow; 6] = [
    [40.0, 0.00117, 66.0, 0.0057],
    [45.0, 0.00091, 62.0, 0.0036],
    [50.0, 0.00066, 59.0, 0.0019],
    [55.0, 0.00043, 54.0, 0.00086],
    [59.0, 0.00033, 48.0, 0.0005],
    [64.0, 0.00025, 46.0, 0.00035],
];
/// Re-entrant: g4 c4 e4 a4 — the g string is ABOVE the c string.
const UKULELE_STRINGS: [StringRow; 4] = [
    [67.0, 0.00066, 45.0, 0.00044],
    [60.0, 0.00091, 43.0, 0.00078],
    [64.0, 0.00075, 42.0, 0.00057],
    [69.0, 0.00061, 40.0, 0.00039],
];

/// Pack `upright-pizz-hybrid`: E1 A1 D2 G2, wound hybrid-core orchestral
/// gauges (rows [open_midi, diameter_m, tension_N, mass_per_length_kg_m]).
const UPRIGHT_STRINGS: [StringRow; 4] = [
    [28.0, 0.00275, 250.0, 0.0278],
    [33.0, 0.00225, 235.0, 0.0189],
    [38.0, 0.0018, 220.0, 0.0124],
    [43.0, 0.00145, 205.0, 0.0081],
];

fn string_set(instrument: i32) -> StringSet {
    match instrument {
        0 => StringSet {
            rows: &ARCHTOP_STRINGS,
            young_pa: 200.0e9,
            t60_pair: [5.2, 1.8],
            scale_m: 0.648,
        },
        1 => StringSet {
            rows: &ELECTRIC_STRINGS,
            young_pa: 200.0e9,
            t60_pair: [7.5, 2.7],
            scale_m: 0.648,
        },
        2 => StringSet {
            rows: &DREADNOUGHT_STRINGS,
            young_pa: 200.0e9,
            t60_pair: [6.4, 2.2],
            scale_m: 0.645,
        },
        3 => StringSet {
            rows: &UKULELE_STRINGS,
            young_pa: 2.5e9,
            t60_pair: [2.6, 0.9],
            scale_m: 0.38,
        },
        /* Pack upright-pizz-hybrid: rope-core wound strings read a lower
         * effective Young's modulus than solid steel; T60 pair from the
         * pack (9.5 s at 100 Hz, 3.2 s at 1 kHz). */
        _ => StringSet {
            rows: &UPRIGHT_STRINGS,
            young_pa: 95.0e9,
            t60_pair: [9.5, 3.2],
            scale_m: 1.05,
        },
    }
}

fn body_table(instrument: i32) -> &'static [[f64; 4]] {
    match instrument {
        0 => &BODY_ARCHTOP,
        1 => &BODY_SOLID_ELECTRIC,
        2 => &BODY_DREADNOUGHT,
        3 => &BODY_UKULELE,
        _ => &BODY_UPRIGHT_BASS,
    }
}

/// Bounded calibration multiplier from the pack (never a residue substitute).
fn bridge_admittance_scale(instrument: i32) -> f64 {
    match instrument {
        0 => 0.72,
        1 => 0.12,
        2 => 1.0,
        3 => 0.54,
        _ => 1.35,
    }
}

fn instrument_valid(instrument: i32) -> bool {
    (0..=4).contains(&instrument)
}

fn midi_range(instrument: i32) -> (i32, i32) {
    match instrument {
        3 => (60, 93),
        4 => (28, 62),
        _ => (40, 88),
    }
}

/// Choose the string whose open pitch is closest below (or at) the note
/// with a playable fret; re-entrant sets search ALL strings (the uke g4
/// string is above c4). Returns (row, fret).
fn choose_string(set: &StringSet, midi: f64) -> ([f64; 4], f64) {
    let mut best: Option<([f64; 4], f64)> = None;
    for row in set.rows {
        let fret = midi - row[0];
        if !(0.0..=22.0).contains(&fret) {
            continue;
        }
        let better = match best {
            None => true,
            Some((_, best_fret)) => fret < best_fret,
        };
        if better {
            best = Some((*row, fret));
        }
    }
    best.unwrap_or((set.rows[set.rows.len() - 1], midi - set.rows[set.rows.len() - 1][0]))
}

fn plucked_t60_seconds(set: &StringSet, f0: f64) -> f64 {
    /* Log-frequency interpolation of the pack's [100 Hz, 1 kHz] pair,
     * clamped to the pair's span so no register extrapolates. */
    let t = ((log(f0 / 100.0) / log(10.0)).clamp(0.0, 1.0)).clamp(0.0, 1.0);
    set.t60_pair[0] + (set.t60_pair[1] - set.t60_pair[0]) * t
}

fn render_cap_seconds(set: &StringSet, f0: f64) -> f64 {
    (plucked_t60_seconds(set, f0) * 1.15).clamp(1.2, 6.5)
}

/// The upper bound on frames `plk_render` may write for this note.
#[no_mangle]
pub extern "C" fn plk_note_frames(instrument: i32, midi: i32, sample_rate: f32) -> i32 {
    if !instrument_valid(instrument) || !(8_000.0..=192_000.0).contains(&sample_rate) {
        return 0;
    }
    let (low, high) = midi_range(instrument);
    if !(low..=high).contains(&midi) {
        return 0;
    }
    let set = string_set(instrument);
    let f0 = midi_frequency_hz(midi as f64);
    (render_cap_seconds(&set, f0) * sample_rate as f64) as i32
}

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
        let y = flush_denormal(self.a * x + self.x1 - self.a * self.y1);
        self.x1 = x;
        self.y1 = y;
        y
    }

    fn delay(&self) -> f64 {
        (1.0 - self.a) / (1.0 + self.a)
    }
}

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
        let y = flush_denormal(self.b0 * x + self.a1 * self.y1 + self.a2 * self.y2);
        self.y2 = self.y1;
        self.y1 = y;
        y
    }
}

/// Mass-normalized body mode integrated by symplectic Euler so the bridge
/// VELOCITY is an explicit state (the spec's b_k/r_k residues act on force
/// in and velocity out).
#[derive(Clone, Copy)]
struct BodyMode {
    omega: f64,
    damping: f64,
    bridge_residue: f64,
    radiation_residue: f64,
    position: f64,
    velocity: f64,
}

impl BodyMode {
    fn new(row: &[f64; 4], sr: f64) -> Self {
        /* Radians per sample, capped below Nyquist for symplectic-Euler
         * stability (omega_per_sample < 2). */
        let omega_per_sample = TAU * (row[0] / sr).min(0.45);
        Self {
            omega: omega_per_sample,
            damping: omega_per_sample / row[1],
            bridge_residue: row[2],
            radiation_residue: row[3],
            position: 0.0,
            velocity: 0.0,
        }
    }

    #[inline]
    fn tick(&mut self, force: f64) -> f64 {
        self.velocity = flush_denormal(
            self.velocity
                + self.bridge_residue * force
                - self.omega * self.omega * self.position
                - self.damping * self.velocity,
        );
        self.position = flush_denormal(self.position + self.velocity);
        self.velocity
    }
}

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

/// Exact phase delay of the two-point damping average at radian frequency
/// omega (samples): the filter is (1-s) + s·z^-1.
fn damping_phase_delay(s: f64, omega: f64) -> f64 {
    let real = (1.0 - s) + s * cos(omega);
    let imag = s * sin(omega);
    libm::atan2(imag, real) / omega
}

/// Exact phase delay of a first-order allpass with coefficient a at omega.
fn allpass_phase_delay(a: f64, omega: f64) -> f64 {
    /*
     * H(e^jw) = (a + e^-jw)/(1 + a·e^-jw);
     * arg H = -atan2(sin w, a + cos w) + atan2(a sin w, 1 + a cos w);
     * phase delay = -arg H / w. Small-w limit: (1-a)/(1+a), the DC formula.
     */
    let num = libm::atan2(sin(omega), a + cos(omega));
    let den = libm::atan2(a * sin(omega), 1.0 + a * cos(omega));
    (num - den) / omega
}

impl Polarization {
    /// Solve the loop layout so the TOTAL phase delay AT f0 equals the
    /// period (the playbook tuning law: DC group-delay compensation reads
    /// tens of cents sharp on short loops — measured +19.4 cents at MIDI
    /// 88 before this exact-at-f0 solve).
    fn new(period: f64, damp_s: f64, loss: f64, dispersion_a: f64, stages: usize) -> Self {
        let omega = TAU / period;
        let dispersion = [Allpass::new(dispersion_a), Allpass::new(dispersion_a)];
        let mut consumed = damping_phase_delay(damp_s, omega);
        for _ in 0..stages {
            consumed += allpass_phase_delay(dispersion_a, omega);
        }
        let remaining = (period - consumed).max(2.5);
        let length = ((remaining - 0.1) as usize).max(2);
        let fraction_target = remaining - length as f64;
        /*
         * Bisect the tuning-allpass coefficient so its phase delay AT f0
         * (not its DC value) equals the fractional target. The DC formula
         * a = (1-d)/(1+d) seeds the bracket.
         */
        let mut low = -0.995f64;
        let mut high = 0.995f64;
        for _ in 0..48 {
            let mid = 0.5 * (low + high);
            if allpass_phase_delay(mid, omega) > fraction_target {
                low = mid;
            } else {
                high = mid;
            }
        }
        let a = 0.5 * (low + high);
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

/// Linear-phase half-band lowpass (7-tap) for the oversampled amp stages.
#[derive(Clone, Copy)]
struct HalfBand {
    z: [f64; 7],
}

impl HalfBand {
    const TAPS: [f64; 7] = [-0.03125, 0.0, 0.28125, 0.5, 0.28125, 0.0, -0.03125];

    fn new() -> Self {
        Self { z: [0.0; 7] }
    }

    #[inline]
    fn tick(&mut self, x: f64) -> f64 {
        self.z.copy_within(0..6, 1);
        self.z[0] = x;
        let mut acc = 0.0;
        for (tap, sample) in Self::TAPS.iter().zip(self.z.iter()) {
            acc += tap * sample;
        }
        flush_denormal(acc)
    }
}

/// Pack RLC loading (series L-R into C parallel R_load): a second-order
/// LOWPASS with a resonant corner at f_r = 1/(2 pi sqrt(L C_total)) — the
/// classic pickup loading transfer. (First implementation used a bandpass
/// resonator plus bleed, which measurably thinned both electric paths: the
/// archtop scored 62 dB from the clean-DI reference where the legacy model
/// scored 19; a pickup passes the BODY of the tone and resonates at the
/// corner, it does not band-select.)
struct PickupLoad {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
    x1: f64,
    x2: f64,
    y1: f64,
    y2: f64,
}

impl PickupLoad {
    fn new(inductance_h: f64, _series_ohm: f64, c_total_f: f64, load_ohm: f64, sr: f64) -> Self {
        let f_r = (1.0 / (TAU * pow(inductance_h * c_total_f, 0.5))).min(sr * 0.42);
        let q = (load_ohm * pow(c_total_f / inductance_h, 0.5)).clamp(0.7, 3.0);
        /* RBJ lowpass biquad. */
        let omega = TAU * f_r / sr;
        let alpha = sin(omega) / (2.0 * q);
        let cos_w = cos(omega);
        let a0 = 1.0 + alpha;
        Self {
            b0: ((1.0 - cos_w) / 2.0) / a0,
            b1: (1.0 - cos_w) / a0,
            b2: ((1.0 - cos_w) / 2.0) / a0,
            a1: (-2.0 * cos_w) / a0,
            a2: (1.0 - alpha) / a0,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }

    #[inline]
    fn tick(&mut self, x: f64) -> f64 {
        let y = flush_denormal(
            self.b0 * x + self.b1 * self.x1 + self.b2 * self.x2
                - self.a1 * self.y1
                - self.a2 * self.y2,
        );
        self.x2 = self.x1;
        self.x1 = x;
        self.y2 = self.y1;
        self.y1 = y;
        y
    }
}

struct AmpChain {
    oversample: usize,
    drive: f64,
    drive_norm: f64,
    asymmetry: f64,
    power_asymmetry: f64,
    sag_depth: f64,
    sag_attack: f64,
    sag_release: f64,
    sag_env: f64,
    pre_hp_alpha: f64,
    pre_hp_state: f64,
    up: [HalfBand; 2],
    down: [HalfBand; 2],
    tone: [Mode; 3],
    tone_gain: [f64; 3],
    cab_resonances: [Mode; 3],
    cab_res_active: bool,
    cab_lp_alpha: f64,
    cab_lp_state: f64,
    cab_hp_alpha: f64,
    cab_hp_state: f64,
}

impl AmpChain {
    fn clean_compact(sr: f64) -> Self {
        /* Dark jazz cab: measured vs the clean-DI reference, 6.2 kHz left
         * harmonics 5-10 hot by +26..+35 dB; flat-wound strings and a
         * 3.4 kHz rolloff are the archtop identity. */
        Self::build(sr, 2, 1.18, 0.12, 0.0, 0.22, 3_400.0, [0.0, 0.0, 0.0], [0.0; 3])
    }

    /// Authored bounded design target — NOT a measured Marshall fit (pack
    /// referenceStatus law). Crunch operating point.
    fn marshall_class(sr: f64) -> Self {
        Self::build(
            sr,
            if sr >= 88_200.0 { 1 } else { 4 },
            2.2,
            0.28,
            0.08,
            0.34,
            5_200.0,
            [1.5, 4.0, 2.0],
            [105.0, 165.0, 2_400.0],
        )
    }

    #[allow(clippy::too_many_arguments)]
    fn build(
        sr: f64,
        oversample: usize,
        drive: f64,
        asymmetry: f64,
        power_asymmetry: f64,
        sag_depth: f64,
        cab_lp_hz: f64,
        tone_db: [f64; 3],
        cab_res_hz: [f64; 3],
    ) -> Self {
        let tone_hz = [120.0, 720.0, 3_200.0];
        let mut tone_gain = [0.0f64; 3];
        for (index, db) in tone_db.iter().enumerate() {
            tone_gain[index] = if *db == 0.0 { 0.0 } else { pow(10.0, db / 20.0) - 1.0 };
        }
        Self {
            oversample,
            drive,
            drive_norm: tanh(drive),
            asymmetry,
            power_asymmetry,
            sag_depth,
            sag_attack: 1.0 - exp(-1.0 / (0.006 * sr)),
            sag_release: 1.0 - exp(-1.0 / (0.18 * sr)),
            sag_env: 0.0,
            pre_hp_alpha: 1.0 - exp(-TAU * 70.0 / sr),
            pre_hp_state: 0.0,
            up: [HalfBand::new(), HalfBand::new()],
            down: [HalfBand::new(), HalfBand::new()],
            tone: [
                Mode::new(tone_hz[0], 1.1, 1.0, sr),
                Mode::new(tone_hz[1], 0.9, 1.0, sr),
                Mode::new(tone_hz[2], 1.4, 1.0, sr),
            ],
            tone_gain,
            cab_resonances: [
                Mode::new(if cab_res_hz[0] > 0.0 { cab_res_hz[0] } else { 100.0 }, 5.0, 1.0, sr),
                Mode::new(if cab_res_hz[1] > 0.0 { cab_res_hz[1] } else { 160.0 }, 6.0, 1.0, sr),
                Mode::new(if cab_res_hz[2] > 0.0 { cab_res_hz[2] } else { 2_400.0 }, 2.2, 1.0, sr),
            ],
            cab_res_active: cab_res_hz[0] > 0.0,
            cab_lp_alpha: 1.0 - exp(-TAU * cab_lp_hz / sr),
            cab_lp_state: 0.0,
            cab_hp_alpha: 1.0 - exp(-TAU * 82.0 / sr),
            cab_hp_state: 0.0,
        }
    }

    #[inline]
    fn stage(&self, x: f64) -> f64 {
        /* Triode-ish asymmetric stage then power stage: cascaded SOFT
         * stages, not one hard clip (the owner-rejected fuzz history). */
        let first = x + self.asymmetry * x * x;
        let first = tanh(first * self.drive) / self.drive_norm;
        let second = first + self.power_asymmetry * first * first;
        /*
         * Power-stage saturation 1.9: measured against the CC0 driven
         * reference, 1.15 was too polite — the harmonic density fell
         * short of a real driven chain while staying inside the bounded
         * cascaded-soft-stage law (still no hard clip).
         */
        tanh(second * 1.9) / tanh(1.9)
    }

    #[inline]
    fn tick(&mut self, x: f64) -> f64 {
        self.pre_hp_state =
            flush_denormal(self.pre_hp_state + self.pre_hp_alpha * (x - self.pre_hp_state));
        let pre = x - self.pre_hp_state;
        let magnitude = if pre >= 0.0 { pre } else { -pre };
        let step = if magnitude > self.sag_env { self.sag_attack } else { self.sag_release };
        self.sag_env = flush_denormal(self.sag_env + step * (magnitude - self.sag_env));
        let sagged = pre / (1.0 + self.sag_depth * self.sag_env);

        let mut shaped = 0.0f64;
        if self.oversample <= 1 {
            shaped = self.stage(sagged);
        } else {
            /* Zero-stuff -> half-band chain -> nonlinearity -> half-band
             * chain -> take the base-rate sample. Gain of the zero-stuff is
             * restored by the oversample factor. */
            for phase in 0..self.oversample {
                let stuffed = if phase == 0 { sagged * self.oversample as f64 } else { 0.0 };
                let mut upsampled = stuffed;
                for filter in self.up.iter_mut() {
                    upsampled = filter.tick(upsampled);
                }
                let driven = self.stage(upsampled);
                let mut downsampled = driven;
                for filter in self.down.iter_mut() {
                    downsampled = filter.tick(downsampled);
                }
                if phase == 0 {
                    shaped = downsampled;
                }
            }
        }

        let mut voiced = shaped;
        for (index, mode) in self.tone.iter_mut().enumerate() {
            if self.tone_gain[index] != 0.0 {
                voiced += self.tone_gain[index] * mode.tick(shaped);
            }
        }
        if self.cab_res_active {
            let mut resonant = 0.0;
            for mode in self.cab_resonances.iter_mut() {
                resonant += mode.tick(voiced);
            }
            voiced += 0.18 * resonant;
        }
        self.cab_hp_state =
            flush_denormal(self.cab_hp_state + self.cab_hp_alpha * (voiced - self.cab_hp_state));
        let highpassed = voiced - self.cab_hp_state;
        self.cab_lp_state =
            flush_denormal(self.cab_lp_state + self.cab_lp_alpha * (highpassed - self.cab_lp_state));
        self.cab_lp_state
    }
}

/// Render one plucked-family note as stereo PCM. Returns frames written or
/// 0 for an invalid request. Velocity shapes pick hardness and drive;
/// renders are loudness-normalized by the shared finalize path.
#[no_mangle]
pub extern "C" fn plk_render(
    instrument: i32,
    midi: i32,
    velocity: i32,
    sample_rate: f32,
    left: *mut f32,
    right: *mut f32,
    max_frames: i32,
) -> i32 {
    let capacity = plk_note_frames(instrument, midi, sample_rate);
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
    if period >= (PLK_MAX_DELAY - 4) as f64 {
        return 0;
    }

    let set = string_set(instrument);
    let (string_row, fret) = choose_string(&set, m);
    let sounding_length = set.scale_m * pow(2.0, -fret / 12.0);

    /*
     * Physical inharmonicity: B = pi^3 E d^4 / (64 T L^2). Nylon B is tiny
     * (no audible dispersion); wound steel low strings are the audible
     * case. The allpass mapping is the same empirical bridge the v1 model
     * used, now driven by the pack physics instead of authored registers.
     */
    let diameter = string_row[1];
    let tension = string_row[2];
    let b_inharmonic = (core::f64::consts::PI * core::f64::consts::PI * core::f64::consts::PI
        * set.young_pa
        * diameter
        * diameter
        * diameter
        * diameter)
        / (64.0 * tension * sounding_length * sounding_length);
    let (dispersion_a, dispersion_stages) = if b_inharmonic > 1.2e-4 {
        (-0.14, 2usize)
    } else if b_inharmonic > 2.5e-5 {
        (-0.08, 1usize)
    } else {
        (0.0, 0usize)
    };

    let t60 = plucked_t60_seconds(&set, f0);
    let loss = pow(10.0, -3.0 / (t60 * f0));
    /*
     * HF damping knob: measured against the CC0 steel reference, the
     * first coefficients left the acoustic tops 17-26 dB dark above
     * 1.5 kHz (bands 10-17 of the similarity envelope). Bronze strings on
     * a spruce top are BRIGHT; the flat-wound-dark setting is only right
     * for the archtop.
     */
    let damp_s = match instrument {
        0 => 0.66 - 0.10 * ((m - 40.0) / 48.0).clamp(0.0, 1.0),
        1 => 0.42 - 0.10 * ((m - 40.0) / 48.0).clamp(0.0, 1.0),
        2 => 0.32 - 0.08 * ((m - 40.0) / 48.0).clamp(0.0, 1.0),
        3 => 0.34 - 0.08 * ((m - 60.0) / 33.0).clamp(0.0, 1.0),
        /* Pizzicato upright: measured against the shipped VSCO pizz
         * recordings the first (0.72) loop damping buried the mid
         * harmonics 22 dB and the high band 31 dB below the real
         * instrument — real pizz keeps finger-attack brightness and
         * string buzz. */
        _ => 0.48 - 0.10 * ((m - 28.0) / 34.0).clamp(0.0, 1.0),
    };

    let mut seed = XorShift32::new(
        0x504C_4B32
            ^ ((instrument as u32) << 26)
            ^ ((midi as u32) << 16)
            ^ ((velocity as u32) << 8)
            ^ sample_rate as u32,
    );

    let mut vertical = Polarization::new(period, damp_s, loss, dispersion_a, dispersion_stages);
    let mut horizontal = Polarization::new(
        period / pow(2.0, 1.6 / 1_200.0),
        damp_s,
        pow(10.0, -3.0 / (t60 * 0.55 * f0)),
        dispersion_a,
        dispersion_stages,
    );

    /*
     * Finite-width compliant pluck: hardness-lowpassed noise (pick or
     * fingertip) with a raised-cosine width window and a pick-position
     * comb. Nylon fingers (uke) are softer and wider than picks.
     */
    let (pick_position, width_m, base_corner_hz) = match instrument {
        0 => (0.26, 0.006, 850.0),
        1 => (0.14, 0.004, 1_050.0),
        2 => (0.22, 0.007, 900.0),
        3 => (0.30, 0.012, 520.0),
        /* Jazz pizzicato: flesh of one-or-two fingers near the end of the
         * fingerboard (~1/7 of the speaking length), wide soft contact.
         * Corner measured against the shipped VSCO pizz: 340 Hz starved
         * harmonics 6-12 (22 dB harmonic distance); the real attack is
         * broad before the string filters it. */
        _ => (0.14, 0.024, 260.0),
    };
    let width_fraction = (width_m / sounding_length).clamp(0.002, 0.12);
    let width_corner_hz = (f0 / width_fraction / 8.0).clamp(400.0, 9_000.0);
    let pick_corner_hz =
        (base_corner_hz + 5_200.0 * pow(v_norm, 1.4)).min(width_corner_hz);
    let pick_alpha = 1.0 - exp(-TAU * pick_corner_hz / sr);
    let string_v = unsafe { &mut *core::ptr::addr_of_mut!(PLK_STRING_V) };
    let string_h = unsafe { &mut *core::ptr::addr_of_mut!(PLK_STRING_H) };
    let excite = unsafe { &mut *core::ptr::addr_of_mut!(PLK_EXCITE) };
    for slot in string_v.iter_mut().take(PLK_MAX_DELAY) {
        *slot = 0.0;
    }
    for slot in string_h.iter_mut().take(PLK_MAX_DELAY) {
        *slot = 0.0;
    }
    let longest = vertical.length.max(horizontal.length);
    let mut lowpass = 0.0f64;
    for slot in excite.iter_mut().take(longest) {
        lowpass += pick_alpha * (seed.bipolar() - lowpass);
        *slot = lowpass;
    }
    /*
     * Pluck-position comb depth: an ideal point pluck (depth 0.92) notches
     * harmonics at k*position ~ integer to -22 dB; measured against the
     * steel reference that buried h4/h5 by 24-26 dB. A real pick/finger
     * contact is DISTRIBUTED, so the notch is shallow: depth 0.68 floors
     * the notch near -10 dB, matching the reference's harmonic profile.
     */
    let comb_depth = 0.68;
    let comb_v = ((vertical.length as f64 * pick_position) as usize).max(1);
    for index in 0..vertical.length {
        let delayed = excite[(index + vertical.length - comb_v) % vertical.length];
        string_v[index] = excite[index] - comb_depth * delayed;
    }
    let comb_h = ((horizontal.length as f64 * pick_position) as usize).max(1);
    for index in 0..horizontal.length {
        let delayed = excite[(index + horizontal.length - comb_h) % horizontal.length];
        string_h[index] = 0.55 * (excite[index] - comb_depth * delayed);
    }

    /* Body modes from the generated pack tables. */
    let table = body_table(instrument);
    let admittance = bridge_admittance_scale(instrument);
    let mut body: [BodyMode; PLK_MAX_MODES] =
        [BodyMode::new(&[100.0, 10.0, 0.0, 0.0], sr); PLK_MAX_MODES];
    let mode_count = table.len().min(PLK_MAX_MODES);
    let mut body_tilt_hz = [0.0f64; PLK_MAX_MODES];
    for (index, (slot, row)) in body.iter_mut().zip(table.iter()).enumerate() {
        *slot = BodyMode::new(row, sr);
        body_tilt_hz[index] = row[0];
    }

    /* Pick/finger click. */
    let click_decay = exp(-1.0 / (0.0016 * sr));
    let click_level = match instrument {
        3 => 0.035 * pow(v_norm, 1.6),
        /* Upright pizz "thump": fingerboard slap energy, stronger and
         * darker than a pick click (shaped below by the finger corner). */
        4 => 0.085 * pow(v_norm, 1.5),
        _ => 0.055 * pow(v_norm, 1.6),
    };
    let mut click_env = 1.0f64;
    let mut click_noise = XorShift32::new(seed.next());
    /* Upright buzz: decays with the note (roughly T60/2.2), band 2.5k+. */
    let buzz_level = 0.045 * pow(v_norm, 1.2);
    let buzz_decay = exp(-2.2 / (t60 * sr));
    let buzz_alpha = 1.0 - exp(-TAU * 2_500.0 / sr);
    let mut buzz_lp = 0.0f64;
    let mut buzz_env = 1.0f64;

    /* Electric path: finite-aperture velocity taps + RLC loading. */
    let is_electric = instrument == 1 || instrument == 0;
    let has_amp = instrument == 1 || instrument == 0;
    let mut pickup_load = match instrument {
        /* neck pickup pack loading: L 4.2 H, C 590 pF total, 500k load. */
        0 => PickupLoad::new(4.2, 7_600.0, 5.9e-10, 500_000.0, sr),
        /* bridge+middle parallel: L 1.15 H, C 680 pF, 250k load. */
        _ => PickupLoad::new(1.15, 3_024.0, 6.8e-10, 250_000.0, sr),
    };
    let pickup_fraction = match instrument {
        0 => 0.24,
        _ => 0.125, /* midpoint of bridge 0.09 and middle 0.16 taps. */
    };
    let mut amp = match instrument {
        0 => AmpChain::clean_compact(sr),
        _ => AmpChain::marshall_class(sr),
    };

    let bridge_coupling = (0.25 * (1.0 - loss)).min(0.012);
    let body_feedback = (0.20 * (1.0 - loss)).min(0.010) * admittance;

    /*
     * High-mode CONTINUUM radiator for acoustic bodies: the tabulated
     * modes stop near 1.8 kHz (uke: 5.6 kHz), but a real top's modal
     * density is effectively continuous above the discrete table and
     * radiates string harmonics to 5+ kHz. A first-order highpass on the
     * direct string above the table ceiling is the honest compact
     * stand-in for that unmodeled continuum (measured: without it the
     * dreadnought sat 17-26 dB below the CC0 steel reference in every
     * band above 1.5 kHz and mis-classified as closer to a driven
     * electric than to a steel acoustic).
     */
    let continuum_corner_hz = match instrument {
        2 => 1_500.0,
        3 => 2_400.0,
        /* Upright table ends near 1 kHz; pizz radiation above it carries
         * the real instrument's finger-noise and string-buzz band. */
        4 => 750.0,
        _ => 1_800.0,
    };
    let continuum_alpha = 1.0 - exp(-TAU * continuum_corner_hz / sr);
    let mut continuum_lp = 0.0f64;
    let continuum_gain = 0.62;

    let pan = ((m - 40.0) / 48.0).clamp(-1.0, 1.0) * 0.10;
    let angle = (pan + 1.0) * core::f64::consts::PI / 4.0;
    let (pan_left, pan_right) = (cos(angle), sin(angle));

    for frame in 0..frames {
        let mut outs = [0.0f64; 2];
        for (which, pol) in [&mut vertical, &mut horizontal].into_iter().enumerate() {
            let line: &mut [f64; PLK_MAX_DELAY] = if which == 0 { string_v } else { string_h };
            let read = pol.write;
            let raw = line[read];
            let damped = (1.0 - pol.damp_s) * raw + pol.damp_s * pol.damp_prev;
            pol.damp_prev = raw;
            let mut signal = flush_denormal(damped * pol.loss);
            for stage in 0..pol.dispersion_stages {
                signal = pol.dispersion[stage].tick(signal);
            }
            signal = pol.tuning.tick(signal);
            outs[which] = signal;
            line[read] = signal;
            pol.write += 1;
            if pol.write == pol.length {
                pol.write = 0;
            }
        }
        /* Polarization exchange (energy-conserving difference coupling). */
        {
            let v_slot = if vertical.write == 0 { vertical.length - 1 } else { vertical.write - 1 };
            let h_slot =
                if horizontal.write == 0 { horizontal.length - 1 } else { horizontal.write - 1 };
            let exchange = bridge_coupling * (outs[1] - outs[0]);
            string_v[v_slot] += exchange;
            string_h[h_slot] -= exchange;
        }
        let string_out = outs[0] + 0.6 * outs[1];

        /*
         * Bridge -> body: the string wave drives every mode through its
         * signed bridge residue, and the bridge presents a RESISTIVE load
         * to the string (a bounded per-pass energy withdrawal at the wave
         * slot — passive by construction). Radiated output is the r_k
         * velocity sum.
         *
         * Measured deviation record (spec bridgeLaw): the naive bounded
         * velocity-return junction is NON-passive here — the resonant
         * modal velocity gain (~ Q·b_k/omega, up to ~3.6e3 at the low body
         * modes) overwhelms any loss-headroom-bounded return scale, and
         * the archtop note measurably GREW (decay ratio 1.64 over 1 s)
         * while the ukulele pulled −7.8 cents. The reactive return path
         * needs the full junction-impedance formulation and is deferred
         * with that evidence; the resistive load keeps the audible
         * body-loss physics (frequency-dependent decay through the body)
         * without energy creation.
         */
        let mut radiated = 0.0f64;
        for (mode_index, mode) in body.iter_mut().take(mode_count).enumerate() {
            let velocity_k = mode.tick(string_out * admittance);
            /* Upright radiation tilt: the reference pizz recordings are
             * fundamental-dominant (h2 -34 dB, h3 -53 dB) — the big body
             * radiates the lowest modes efficiently while upper partials
             * beam away from the close mic. Measured, not assumed. */
            let tilt = if instrument == 4 {
                /* Second-order tilt, corner 60 Hz: calibrated against the
                 * reference's measured h1/h2/h3 ladder (0 / -34 / -53 dB);
                 * a 220 Hz first-order corner measured only ~1 dB of
                 * h1-vs-h2 separation. */
                let f_mode = body_tilt_hz[mode_index];
                let x = 1.0 + (f_mode / 60.0) * (f_mode / 60.0);
                1.0 / (x * x)
            } else {
                1.0
            };
            radiated += mode.radiation_residue * velocity_k * tilt;
        }
        {
            let v_slot = if vertical.write == 0 { vertical.length - 1 } else { vertical.write - 1 };
            string_v[v_slot] -= body_feedback * string_out;
        }

        let click = click_noise.bipolar() * click_env * click_level;
        click_env = flush_denormal(click_env * click_decay);
        /*
         * Upright pizz string buzz: the reference recordings keep a
         * 5.5-10 kHz band ~30 dB under the low band through the sustain
         * (finger noise and string-on-fingerboard buzz); without it the
         * model measured 34 dB darker than the real instrument up there.
         * Seeded noise, highpassed, riding the note's own decay.
         */
        let buzz = if instrument == 4 {
            let raw = click_noise.bipolar();
            buzz_lp += buzz_alpha * (raw - buzz_lp);
            buzz_lp = flush_denormal(buzz_lp);
            (raw - buzz_lp) * buzz_env * buzz_level
        } else {
            0.0
        };
        buzz_env = flush_denormal(buzz_env * buzz_decay);

        let voiced = if is_electric {
            /*
             * Finite-aperture velocity tap: difference of two loop reads
             * around the pickup point approximates string velocity through
             * the aperture window; the comb the position tap creates is
             * the physical pickup-position comb.
             */
            let tap = ((vertical.length as f64 * pickup_fraction) as usize)
                .clamp(1, vertical.length - 1);
            let here = string_v[(vertical.write + vertical.length - tap) % vertical.length];
            let there = string_v[(vertical.write + vertical.length - tap - 1) % vertical.length];
            /*
             * Displacement-dominant tap with a gentle velocity tilt. The
             * first implementation scaled the one-sample difference by
             * sr/f0*0.06 — a differentiator with ~26x gain at A2 that
             * measurably inverted the spectrum (bands 150-500 Hz at
             * -29..-44 dB vs the DI reference, harmonics 5-8 at +34..+40
             * dB). The pickup's aperture and loading already shape the
             * top; the tap itself must not be a high-boost.
             */
            let aperture_velocity = here * 0.9 + (here - there) * 2.0;
            let picked = pickup_load.tick(aperture_velocity + click);
            if has_amp {
                amp.tick(picked)
            } else {
                picked
            }
        } else {
            /* Acoustic radiators: modal body radiation plus the
             * high-mode continuum path plus a small direct term and the
             * finger/pick transient. */
            continuum_lp = flush_denormal(
                continuum_lp + continuum_alpha * (string_out - continuum_lp),
            );
            let continuum = (string_out - continuum_lp) * continuum_gain;
            if instrument == 4 {
                /* Upright: the direct-string and continuum bypasses skip
                 * the body's radiation tilt, so they stay small; buzz
                 * carries the measured 5.5-10 kHz sustain band. */
                radiated * 2.4 + continuum * 0.25 + string_out * 0.018 + click + buzz
            } else {
                radiated * 0.85 + continuum + string_out * 0.16 + click
            }
        };

        out_left[frame] = (voiced * pan_left) as f32;
        out_right[frame] = (voiced * pan_right) as f32;
    }

    crate::finalize_stereo(out_left, out_right, sr)
}

#[cfg(test)]
mod upright_tests {
    use super::*;

    #[test]
    fn upright_renders_native() {
        let cap = plk_note_frames(4, 40, 48_000.0);
        assert!(cap > 0, "note_frames {cap}");
        let mut left = vec![0.0f32; cap as usize];
        let mut right = vec![0.0f32; cap as usize];
        let written = plk_render(
            4,
            40,
            100,
            48_000.0,
            left.as_mut_ptr(),
            right.as_mut_ptr(),
            cap,
        );
        assert!(written > 0, "render returned {written}");
    }
}
