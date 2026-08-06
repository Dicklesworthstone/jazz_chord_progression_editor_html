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

use libm::{atan2, cos, exp, pow, sin, sqrt};

use crate::physical::{DcBlocker, DelayLine, OnePoleLoss, RadiationFilter};
use crate::{midi_frequency_hz, vibrato_variation, XorShift32, TAU};

/// Longest supported half-period bore: MIDI 21 at 192 kHz is ~3 491 samples.
const CLR_MAX_DELAY: usize = 4_096;
const CLR_STATE_MAGIC: u32 = 0x3252_4c43; // "CLR2" in little endian.
const CLR_STATE_VERSION: u32 = 1;
const CLR_STATE_HEADER_BYTES: usize = 32;
const CLR_STATE_SCALAR_COUNT: usize = 24;
const CLR_STATE_FIXED_BYTES: usize = CLR_STATE_HEADER_BYTES + CLR_STATE_SCALAR_COUNT * 8;
const CLR_STATE_MAX_BYTES: usize = CLR_STATE_FIXED_BYTES + CLR_MAX_DELAY * 8;

static mut CLR_BORE: [f64; CLR_MAX_DELAY] = [0.0; CLR_MAX_DELAY];

#[derive(Clone, Copy)]
struct ClarinetPhraseState {
    prior_midi: i32,
    bore_length: usize,
    bore_write_index: usize,
    seed: u32,
    elapsed_frames: u32,
    tuning_x1: f64,
    tuning_y1: f64,
    reflection_loss: f64,
    dc_input: f64,
    dc_output: f64,
    radiation_loss: f64,
    radiation_input: f64,
    hole_radiation: [f64; 6],
    register_radiation: f64,
    reed_x: f64,
    reed_velocity: f64,
    pressure: f64,
    vibrato_sin: f64,
    vibrato_cos: f64,
    noise_lp: f64,
    chiff_low: f64,
    chiff_high: f64,
    chiff_envelope: f64,
    overshoot_envelope: f64,
}

fn read_u32(bytes: &[u8], offset: usize) -> Option<u32> {
    let value = bytes.get(offset..offset + 4)?;
    Some(u32::from_le_bytes([value[0], value[1], value[2], value[3]]))
}

fn read_f64(bytes: &[u8], offset: usize) -> Option<f64> {
    let value = bytes.get(offset..offset + 8)?;
    Some(f64::from_le_bytes([
        value[0], value[1], value[2], value[3], value[4], value[5], value[6], value[7],
    ]))
}

fn write_u32(bytes: &mut [u8], offset: usize, value: u32) -> bool {
    let Some(target) = bytes.get_mut(offset..offset + 4) else {
        return false;
    };
    target.copy_from_slice(&value.to_le_bytes());
    true
}

fn write_f64(bytes: &mut [u8], offset: usize, value: f64) -> bool {
    let Some(target) = bytes.get_mut(offset..offset + 8) else {
        return false;
    };
    target.copy_from_slice(&value.to_le_bytes());
    true
}

fn disjoint_ranges(left: usize, left_bytes: usize, right: usize, right_bytes: usize) -> bool {
    let Some(left_end) = left.checked_add(left_bytes) else {
        return false;
    };
    let Some(right_end) = right.checked_add(right_bytes) else {
        return false;
    };
    left_end <= right || right_end <= left
}

fn decode_phrase_state(bytes: &[u8], sample_rate: f32) -> Option<ClarinetPhraseState> {
    if read_u32(bytes, 0)? != CLR_STATE_MAGIC
        || read_u32(bytes, 4)? != CLR_STATE_VERSION
        || read_u32(bytes, 8)? != sample_rate.to_bits()
    {
        return None;
    }
    let bore_length = read_u32(bytes, 16)? as usize;
    let bore_write_index = read_u32(bytes, 20)? as usize;
    if !(3..=CLR_MAX_DELAY).contains(&bore_length)
        || bore_write_index >= bore_length
        || bytes.len() != CLR_STATE_FIXED_BYTES + bore_length * 8
    {
        return None;
    }
    let mut scalar = [0.0; CLR_STATE_SCALAR_COUNT];
    for (index, value) in scalar.iter_mut().enumerate() {
        *value = read_f64(bytes, CLR_STATE_HEADER_BYTES + index * 8)?;
        if !value.is_finite() {
            return None;
        }
    }
    Some(ClarinetPhraseState {
        prior_midi: read_u32(bytes, 12)? as i32,
        bore_length,
        bore_write_index,
        seed: read_u32(bytes, 24)?,
        elapsed_frames: read_u32(bytes, 28)?,
        tuning_x1: scalar[0],
        tuning_y1: scalar[1],
        reflection_loss: scalar[2],
        dc_input: scalar[3],
        dc_output: scalar[4],
        radiation_loss: scalar[5],
        radiation_input: scalar[6],
        hole_radiation: [
            scalar[7], scalar[8], scalar[9], scalar[10], scalar[11], scalar[12],
        ],
        register_radiation: scalar[13],
        reed_x: scalar[14],
        reed_velocity: scalar[15],
        pressure: scalar[16],
        vibrato_sin: scalar[17],
        vibrato_cos: scalar[18],
        noise_lp: scalar[19],
        chiff_low: scalar[20],
        chiff_high: scalar[21],
        chiff_envelope: scalar[22],
        overshoot_envelope: scalar[23],
    })
}

fn encode_phrase_state(
    bytes: &mut [u8],
    sample_rate: f32,
    state: ClarinetPhraseState,
    bore: &[f64],
) -> Option<usize> {
    let wanted = CLR_STATE_FIXED_BYTES.checked_add(state.bore_length.checked_mul(8)?)?;
    if bytes.len() < wanted || bore.len() < state.bore_length {
        return None;
    }
    write_u32(bytes, 0, CLR_STATE_MAGIC);
    write_u32(bytes, 4, CLR_STATE_VERSION);
    write_u32(bytes, 8, sample_rate.to_bits());
    write_u32(bytes, 12, state.prior_midi as u32);
    write_u32(bytes, 16, state.bore_length as u32);
    write_u32(bytes, 20, state.bore_write_index as u32);
    write_u32(bytes, 24, state.seed);
    write_u32(bytes, 28, state.elapsed_frames);
    let scalar = [
        state.tuning_x1,
        state.tuning_y1,
        state.reflection_loss,
        state.dc_input,
        state.dc_output,
        state.radiation_loss,
        state.radiation_input,
        state.hole_radiation[0],
        state.hole_radiation[1],
        state.hole_radiation[2],
        state.hole_radiation[3],
        state.hole_radiation[4],
        state.hole_radiation[5],
        state.register_radiation,
        state.reed_x,
        state.reed_velocity,
        state.pressure,
        state.vibrato_sin,
        state.vibrato_cos,
        state.noise_lp,
        state.chiff_low,
        state.chiff_high,
        state.chiff_envelope,
        state.overshoot_envelope,
    ];
    for (index, value) in scalar.iter().enumerate() {
        if !value.is_finite() || !write_f64(bytes, CLR_STATE_HEADER_BYTES + index * 8, *value) {
            return None;
        }
    }
    for (index, value) in bore[..state.bore_length].iter().enumerate() {
        if !value.is_finite() || !write_f64(bytes, CLR_STATE_FIXED_BYTES + index * 8, *value) {
            return None;
        }
    }
    Some(wanted)
}

/* Six main-hole open/closed masks for the chromatic Boehm fingering cycle.
 * Bit zero is the lowest hole. This is a reduced radiation lattice, not a
 * geometry-derived BEM table; the latter remains gated on its pilot. */
const CLR_FINGERING_MASKS: [u8; 12] = [
    0b000000, 0b000001, 0b000011, 0b000111, 0b001111, 0b011111, 0b111111, 0b111110, 0b111100,
    0b111000, 0b110000, 0b100000,
];

/* Compact, distributable reduced-lattice geometry. Bore radius and nominal
 * 10 mm cell spacing follow Silva et al. (arXiv:0901.1640); individual hole
 * radii/chimneys are bounded representative values, not a claimed scan of a
 * particular instrument. End correction uses the analytic uniform-profile
 * circular-aperture value 8/(3*pi), not the license-blocked FrankenSim fit. */
const CLR_BORE_RADIUS_M: f64 = 0.007;
const CLR_APERTURE_END_CORRECTION_RADII: f64 = 0.848_826_363_156_775_2;
const CLR_HOLE_AXIAL_M: [f64; 6] = [0.355, 0.397, 0.438, 0.477, 0.515, 0.551];
const CLR_HOLE_RADIUS_M: [f64; 6] = [0.0030, 0.0032, 0.00345, 0.0037, 0.0040, 0.0043];
const CLR_HOLE_CHIMNEY_M: [f64; 6] = [0.0060, 0.0058, 0.0056, 0.0053, 0.0050, 0.0048];
const CLR_REFERENCE_LENGTH_M: f64 = 0.5839;
const CLR_REGISTER_AXIAL_M: f64 = 0.165;
const CLR_REGISTER_RADIUS_M: f64 = 0.00145;
const CLR_REGISTER_CHIMNEY_M: f64 = 0.0055;

fn fingering_mask(midi: i32) -> u8 {
    CLR_FINGERING_MASKS[midi.rem_euclid(12) as usize]
}

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
    clr_render_inner(
        midi,
        velocity,
        sample_rate,
        left,
        right,
        max_frames,
        None,
        None,
        false,
        None,
        None,
    )
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
        None,
        false,
        None,
        None,
    )
}

/// Gesture-aware attack model. `articulation` is 0 for legato and 1 for a
/// tongued reed attack. Older exports remain byte-stable.
#[no_mangle]
pub extern "C" fn clr_render_expressive(
    midi: i32,
    velocity: i32,
    sample_rate: f32,
    variation_slot: u32,
    articulation: u32,
    left: *mut f32,
    right: *mut f32,
    max_frames: i32,
) -> i32 {
    let Some(variation) = vibrato_variation(variation_slot) else {
        return 0;
    };
    let tongued = match articulation {
        0 => false,
        1 => true,
        _ => return 0,
    };
    clr_render_inner(
        midi,
        velocity,
        sample_rate,
        left,
        right,
        max_frames,
        Some(variation),
        Some(tongued),
        false,
        None,
        None,
    )
}

/// PHS2 audible comparator: the same reviewed bore while the excitation is
/// driven by the stateful SI-unit reed. The legacy exports above remain
/// unchanged until the complete v2 phrase/bore package passes its proof gate.
#[no_mangle]
pub extern "C" fn clr_render_v2(
    midi: i32,
    velocity: i32,
    sample_rate: f32,
    variation_slot: u32,
    articulation: u32,
    left: *mut f32,
    right: *mut f32,
    max_frames: i32,
) -> i32 {
    let Some(variation) = vibrato_variation(variation_slot) else {
        return 0;
    };
    let tongued = match articulation {
        0 => false,
        1 => true,
        _ => return 0,
    };
    clr_render_inner(
        midi,
        velocity,
        sample_rate,
        left,
        right,
        max_frames,
        Some(variation),
        Some(tongued),
        true,
        None,
        None,
    )
}

/// Maximum caller-owned storage needed for a serialized clarinet phrase state.
#[no_mangle]
pub extern "C" fn clr_state_max_bytes_v2() -> i32 {
    CLR_STATE_MAX_BYTES as i32
}

#[no_mangle]
pub extern "C" fn clr_state_fixed_bytes_v2() -> i32 {
    CLR_STATE_FIXED_BYTES as i32
}

/// Render a v2 phrase segment with explicit physical state handoff. An empty
/// input starts from the canonical zero/at-rest state. Returns the serialized
/// rendered frame count, or 0 when any request or state field is invalid.
/// The exact state byte count is self-describing as `176 + bore_length * 8`,
/// with `bore_length` stored at byte offset 16.
#[no_mangle]
pub extern "C" fn clr_render_phrase_v2(
    midi: i32,
    velocity: i32,
    sample_rate: f32,
    variation_slot: u32,
    articulation: u32,
    left: *mut f32,
    right: *mut f32,
    max_frames: i32,
    state_input: *const u8,
    state_input_bytes: i32,
    state_output: *mut u8,
    state_output_capacity: i32,
) -> i32 {
    let Some(variation) = vibrato_variation(variation_slot) else {
        return 0;
    };
    let tongued = match articulation {
        0 => false,
        1 => true,
        _ => return 0,
    };
    if state_input_bytes < 0
        || state_output_capacity < CLR_STATE_FIXED_BYTES as i32
        || state_output.is_null()
        || (state_input_bytes > 0 && state_input.is_null())
        || state_input_bytes as usize > CLR_STATE_MAX_BYTES
        || state_output_capacity as usize > CLR_STATE_MAX_BYTES
    {
        return 0;
    }
    let natural = clr_note_frames(midi, sample_rate);
    if natural == 0 || max_frames <= 0 {
        return 0;
    }
    let frames = natural.min(max_frames) as usize;
    let Some(channel_bytes) = frames.checked_mul(core::mem::size_of::<f32>()) else {
        return 0;
    };
    let ranges = [
        (left as usize, channel_bytes),
        (right as usize, channel_bytes),
        (state_output as usize, state_output_capacity as usize),
    ];
    for left_index in 0..ranges.len() {
        for right_index in left_index + 1..ranges.len() {
            if !disjoint_ranges(
                ranges[left_index].0,
                ranges[left_index].1,
                ranges[right_index].0,
                ranges[right_index].1,
            ) {
                return 0;
            }
        }
    }
    if state_input_bytes > 0 {
        for (offset, bytes) in ranges {
            if !disjoint_ranges(
                state_input as usize,
                state_input_bytes as usize,
                offset,
                bytes,
            ) {
                return 0;
            }
        }
    }
    let input = if state_input_bytes == 0 {
        None
    } else {
        Some(unsafe { core::slice::from_raw_parts(state_input, state_input_bytes as usize) })
    };
    let output =
        unsafe { core::slice::from_raw_parts_mut(state_output, state_output_capacity as usize) };
    let mut written_state = 0usize;
    let rendered = clr_render_inner(
        midi,
        velocity,
        sample_rate,
        left,
        right,
        max_frames,
        Some(variation),
        Some(tongued),
        true,
        input,
        Some((output, &mut written_state)),
    );
    if rendered == 0 || written_state == 0 {
        0
    } else {
        rendered
    }
}

fn clr_render_inner(
    midi: i32,
    velocity: i32,
    sample_rate: f32,
    left: *mut f32,
    right: *mut f32,
    max_frames: i32,
    variation: Option<crate::VibratoVariation>,
    attack_articulation: Option<bool>,
    dynamic_reed: bool,
    state_input: Option<&[u8]>,
    state_output: Option<(&mut [u8], &mut usize)>,
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
    let pull_fit = ((-0.000927 * mc + 0.292118) * mc - 28.445028) * mc
        + 937.770853
        + 0.58 * (62.0 - mc).max(0.0);
    /* Small measured rate term: at 96 kHz the fitted pull over-corrects
     * linearly above MIDI 60 (−9 at 72 to −27 at 89); at 44.1 kHz the
     * same term is negligible. */
    let rate_term = -0.85 * (mc - 60.0).max(0.0) * (sr / 48_000.0 - 1.0);
    let dynamic_reed_pull = if dynamic_reed {
        -40.0 * ((m - 52.0) / 12.0).clamp(0.0, 1.0) + 27.0 * ((m - 76.0) / 8.0).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let pull_cents = pull_fit + rate_term + dynamic_reed_pull;
    let corrected_half = half_period * pow(2.0, pull_cents / 1_200.0);
    let effective = (corrected_half - reflection_delay - 0.5).max(3.2);
    let bore_length = ((effective - 0.1) as usize).max(3);
    let bore_fraction = effective - bore_length as f64;
    let tuning_a = (1.0 - bore_fraction) / (1.0 + bore_fraction);
    let prior_state = match state_input {
        Some(bytes) => match decode_phrase_state(bytes, sample_rate) {
            Some(state) => Some(state),
            None => return 0,
        },
        None => None,
    };
    let mut tuning_x1 = 0.0f64;
    let mut tuning_y1 = 0.0f64;

    let bore = unsafe { &mut *core::ptr::addr_of_mut!(CLR_BORE) };
    let mut bore_delay = if let (Some(prior), Some(bytes)) = (prior_state, state_input) {
        /* The serialized ring is interpreted in chronological order from its
         * old write head. Linear resampling retains the travelling pressure
         * wave when a new fingering changes the bore delay. */
        for index in 0..bore_length {
            let source = index as f64 * prior.bore_length as f64 / bore_length as f64;
            let lower = source as usize;
            let upper = (lower + 1).min(prior.bore_length - 1);
            let fraction = source - lower as f64;
            let lower_ring = (prior.bore_write_index + lower) % prior.bore_length;
            let upper_ring = (prior.bore_write_index + upper) % prior.bore_length;
            let Some(lower_value) = read_f64(bytes, CLR_STATE_FIXED_BYTES + lower_ring * 8) else {
                return 0;
            };
            let Some(upper_value) = read_f64(bytes, CLR_STATE_FIXED_BYTES + upper_ring * 8) else {
                return 0;
            };
            if !lower_value.is_finite() || !upper_value.is_finite() {
                return 0;
            }
            bore[index] = lower_value + fraction * (upper_value - lower_value);
        }
        let Some(delay) = DelayLine::new_preserving(bore, bore_length, 0) else {
            return 0;
        };
        delay
    } else {
        let Some(delay) = DelayLine::new(bore, bore_length) else {
            return 0;
        };
        delay
    };

    let mut seed = XorShift32::new(
        0x434c_5254 ^ ((midi as u32) << 16) ^ ((velocity as u32) << 8) ^ sample_rate as u32,
    );

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
    /* Darker 0.65--2.0 kHz tongue turbulence than the flute jet chiff. */
    let chiff_low_alpha = 1.0 - exp(-TAU * 650.0 / sr);
    let chiff_high_alpha = 1.0 - exp(-TAU * 2_000.0 / sr);
    let mut chiff_low = 0.0f64;
    let mut chiff_high = 0.0f64;
    let chiff_seconds = 0.026 - 0.012 * v_norm;
    let chiff_decay = exp(-1.0 / (chiff_seconds * sr));
    let chiff_level = if attack_articulation == Some(true) {
        0.000_6 + 0.007_4 * v_norm * v_norm
    } else if attack_articulation == Some(false) {
        0.000_1
    } else {
        0.0
    };
    let pressure_overshoot = if attack_articulation == Some(true) {
        (pressure_target * (0.05 + 0.025 * v_norm)).min(0.915 - pressure_target)
    } else {
        0.0
    };
    let overshoot_decay = exp(-1.0 / ((0.014 + 0.008 * (1.0 - v_norm)) * sr));
    let tongue_hold_frames = if attack_articulation == Some(true) {
        ((0.006 - 0.002 * v_norm) * sr) as usize
    } else {
        0
    };
    let mut chiff_envelope = 1.0f64;
    let mut overshoot_envelope = 1.0f64;
    let mut pressure = 0.0f64;
    let reed_h0 = 0.0004;
    let mut reed_x = reed_h0;
    let mut reed_velocity = 0.0;
    let mut elapsed_frames = 0u32;

    /* Band-limit the differentiated radiation (the flute's hiss lesson). */
    let radiation_alpha = 1.0 - exp(-TAU * 5_500.0 / sr);
    let mut radiation = RadiationFilter::new(radiation_alpha, 6.0);
    let mut hole_radiation: [OnePoleLoss; 6] = core::array::from_fn(|index| {
        let effective_chimney = CLR_HOLE_CHIMNEY_M[index]
            + 2.0 * CLR_APERTURE_END_CORRECTION_RADII * CLR_HOLE_RADIUS_M[index];
        let corner_hz = (343.0 / (4.0 * effective_chimney)).clamp(2_000.0, 7_000.0);
        OnePoleLoss::new(1.0 - exp(-TAU * corner_hz / sr))
    });
    let register_effective_chimney =
        CLR_REGISTER_CHIMNEY_M + 2.0 * CLR_APERTURE_END_CORRECTION_RADII * CLR_REGISTER_RADIUS_M;
    let register_corner_hz = (343.0 / (4.0 * register_effective_chimney)).clamp(2_000.0, 7_000.0);
    let mut register_radiation = OnePoleLoss::new(1.0 - exp(-TAU * register_corner_hz / sr));
    let mask = fingering_mask(midi);
    let register_vent_open = dynamic_reed && midi >= 70;
    let hole_gain: [f64; 6] = core::array::from_fn(|index| {
        if !dynamic_reed || mask & (1 << index) == 0 {
            return 0.0;
        }
        let radius = CLR_HOLE_RADIUS_M[index];
        let area_ratio_sqrt = radius / CLR_BORE_RADIUS_M;
        let inertance_fraction =
            radius / (CLR_HOLE_CHIMNEY_M[index] + 2.0 * CLR_APERTURE_END_CORRECTION_RADII * radius);
        0.12 * area_ratio_sqrt * inertance_fraction
    });
    let register_gain = if register_vent_open {
        0.12 * (CLR_REGISTER_RADIUS_M / CLR_BORE_RADIUS_M)
            * (CLR_REGISTER_RADIUS_M / register_effective_chimney)
    } else {
        0.0
    };
    let shunt_power =
        hole_gain.iter().map(|gain| gain * gain).sum::<f64>() + register_gain * register_gain;
    let reflected_gain = sqrt((1.0 - shunt_power).max(0.0));
    let pan = ((m - 60.0) / 48.0).clamp(-1.0, 1.0) * 0.06;
    let angle = (pan + 1.0) * core::f64::consts::PI / 4.0;
    let (pan_left, pan_right) = (cos(angle), sin(angle));

    if let Some(prior) = prior_state {
        tuning_x1 = prior.tuning_x1;
        tuning_y1 = prior.tuning_y1;
        if !reflection_loss.restore(prior.reflection_loss)
            || !dc_blocker.restore(prior.dc_input, prior.dc_output)
            || !radiation.restore(prior.radiation_loss, prior.radiation_input)
            || !register_radiation.restore(prior.register_radiation)
        {
            return 0;
        }
        for (filter, state) in hole_radiation.iter_mut().zip(prior.hole_radiation) {
            if !filter.restore(state) {
                return 0;
            }
        }
        seed.state = if prior.seed == 0 {
            0x9e37_79b9
        } else {
            prior.seed
        };
        elapsed_frames = prior.elapsed_frames;
        reed_x = prior.reed_x;
        reed_velocity = prior.reed_velocity;
        pressure = prior.pressure;
        vibrato_sin = prior.vibrato_sin;
        vibrato_cos = prior.vibrato_cos;
        noise_lp = prior.noise_lp;
        chiff_low = prior.chiff_low;
        chiff_high = prior.chiff_high;
        chiff_envelope = prior.chiff_envelope;
        overshoot_envelope = prior.overshoot_envelope;
    }

    let end_fade_frames = (CLR_END_FADE_SECONDS * sr) as usize;

    for frame in 0..frames {
        let instantaneous_target = if frame < tongue_hold_frames {
            0.0
        } else {
            pressure_target + pressure_overshoot * overshoot_envelope
        };
        pressure += (instantaneous_target - pressure) * attack_step;
        let phrase_frame = elapsed_frames as f64 + frame as f64;
        let vibrato_gate = if phrase_frame < vibrato_onset {
            0.0
        } else {
            ((phrase_frame - vibrato_onset) / vibrato_ramp).min(1.0)
        };
        let lfo = if variation.is_some() {
            vibrato_sin
        } else {
            sin(TAU * vibrato_hz * phrase_frame / sr)
        };
        let vibrato = 1.0 + vibrato_depth * vibrato_gate * lfo;
        if variation.is_some() {
            let next_sin = vibrato_sin * vibrato_step_cos + vibrato_cos * vibrato_step_sin;
            vibrato_cos = vibrato_cos * vibrato_step_cos - vibrato_sin * vibrato_step_sin;
            vibrato_sin = next_sin;
        }
        let turbulence = seed.bipolar();
        noise_lp += noise_alpha * (turbulence - noise_lp);
        chiff_low += chiff_low_alpha * (turbulence - chiff_low);
        chiff_high += chiff_high_alpha * (turbulence - chiff_high);
        let chiff = (chiff_high - chiff_low) * chiff_envelope * chiff_level;
        chiff_envelope *= chiff_decay;
        if frame >= tongue_hold_frames {
            overshoot_envelope *= overshoot_decay;
        }
        let breath = pressure * vibrato * (1.0 + noise_level * noise_lp);

        /* Open end: dark inverting reflection behind the DC blocker. */
        let bore_out = bore_delay.output();
        let reflected =
            reflected_gain * dc_blocker.process(-0.95 * reflection_loss.process(bore_out));
        let mut hole_field = 0.0;
        for index in 0..hole_radiation.len() {
            let distance_from_bell = CLR_REFERENCE_LENGTH_M - CLR_HOLE_AXIAL_M[index];
            let tap =
                (distance_from_bell / CLR_REFERENCE_LENGTH_M * (bore_length - 1) as f64) as usize;
            hole_field +=
                hole_radiation[index].process(bore_delay.tap_from_output(tap)) * hole_gain[index];
        }
        let register_tap = ((CLR_REFERENCE_LENGTH_M - CLR_REGISTER_AXIAL_M)
            / CLR_REFERENCE_LENGTH_M
            * (bore_length - 1) as f64) as usize;
        hole_field +=
            register_radiation.process(bore_delay.tap_from_output(register_tap)) * register_gain;

        /* Reed junction. V2 advances the mass-spring reed itself and mixes
         * its signed Bernoulli flow into the established passive bore. */
        let pressure_diff = reflected - breath;
        let reed = (reed_offset + reed_slope * pressure_diff).clamp(-1.0, 1.0);
        let legacy_bore_in = breath + pressure_diff * reed;
        let bore_in = if dynamic_reed {
            let tongue_contact = if frame < tongue_hold_frames { 1.0 } else { 0.0 };
            let mut step = [0.0; 8];
            if crate::physical::phs_clarinet_reed_step_v2(
                1.0 / sr,
                reed_x,
                reed_velocity,
                breath * 7_000.0,
                reflected * 2_500.0,
                0.000_03,
                0.02,
                1_500.0,
                reed_h0,
                0.0001,
                0.012,
                1.2,
                tongue_contact,
                step.as_mut_ptr(),
            ) != 1
            {
                return 0;
            }
            reed_x = step[0];
            reed_velocity = step[1];
            let flow_drive = (step[2] / 0.00025).clamp(-1.5, 1.5);
            let flow_mix = 0.2 - 0.17 * ((m - 76.0) / 8.0).clamp(0.0, 1.0);
            (1.0 - flow_mix) * legacy_bore_in + flow_mix * flow_drive
        } else {
            legacy_bore_in
        };

        let tuned = tuning_a * bore_in + tuning_x1 - tuning_a * tuning_y1;
        tuning_x1 = bore_in;
        tuning_y1 = tuned;
        bore_delay.push(tuned);

        /* Radiated field: gentle differentiation, band-limited, near-dry
         * breath. */
        let radiated =
            radiation.process(bore_out) + hole_field + 0.012 * noise_lp * pressure + chiff;

        let mut sample = radiated;
        if state_output.is_none() && frames - frame <= end_fade_frames {
            let position = (frames - frame) as f64 / end_fade_frames as f64;
            sample *= position;
        }
        out_left[frame] = (sample * pan_left) as f32;
        out_right[frame] = (sample * pan_right) as f32;
    }

    if let Some((bytes, written)) = state_output {
        let (dc_input, dc_output) = dc_blocker.state();
        let (radiation_loss, radiation_input) = radiation.state();
        let state = ClarinetPhraseState {
            prior_midi: midi,
            bore_length,
            bore_write_index: bore_delay.write_index(),
            seed: seed.state,
            elapsed_frames: elapsed_frames.saturating_add(frames as u32),
            tuning_x1,
            tuning_y1,
            reflection_loss: reflection_loss.state(),
            dc_input,
            dc_output,
            radiation_loss,
            radiation_input,
            hole_radiation: core::array::from_fn(|index| hole_radiation[index].state()),
            register_radiation: register_radiation.state(),
            reed_x,
            reed_velocity,
            pressure,
            vibrato_sin,
            vibrato_cos,
            noise_lp,
            chiff_low,
            chiff_high,
            chiff_envelope,
            overshoot_envelope,
        };
        let Some(size) = encode_phrase_state(bytes, sample_rate, state, bore_delay.storage())
        else {
            return 0;
        };
        *written = size;
    }
    crate::finalize_stereo(out_left, out_right, sr)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phrase_state_encoding_is_exact_bounded_and_rate_strict() {
        let bore = [0.25, -0.5, 0.75];
        let state = ClarinetPhraseState {
            prior_midi: 64,
            bore_length: bore.len(),
            bore_write_index: 1,
            seed: 42,
            elapsed_frames: 2_400,
            tuning_x1: 0.1,
            tuning_y1: 0.2,
            reflection_loss: 0.3,
            dc_input: 0.4,
            dc_output: 0.5,
            radiation_loss: 0.6,
            radiation_input: 0.7,
            hole_radiation: [0.8, 0.7, 0.6, 0.5, 0.4, 0.3],
            register_radiation: 0.2,
            reed_x: 0.0003,
            reed_velocity: -0.01,
            pressure: 0.9,
            vibrato_sin: 0.25,
            vibrato_cos: 0.75,
            noise_lp: -0.2,
            chiff_low: 0.11,
            chiff_high: 0.22,
            chiff_envelope: 0.33,
            overshoot_envelope: 0.44,
        };
        let mut bytes = vec![0; CLR_STATE_MAX_BYTES];
        let written = encode_phrase_state(&mut bytes, 48_000.0, state, &bore).unwrap();
        assert_eq!(written, CLR_STATE_FIXED_BYTES + bore.len() * 8);
        bytes.truncate(written);
        let decoded = decode_phrase_state(&bytes, 48_000.0).unwrap();
        assert_eq!(decoded.prior_midi, 64);
        assert_eq!(decoded.bore_length, 3);
        assert_eq!(decoded.bore_write_index, 1);
        assert_eq!(decoded.reed_x, state.reed_x);
        assert!(decode_phrase_state(&bytes, 44_100.0).is_none());
        bytes[0] ^= 0xff;
        assert!(decode_phrase_state(&bytes, 48_000.0).is_none());

        let mut left = [0.0f32; 8];
        let mut right = [0.0f32; 8];
        assert_eq!(
            clr_render_phrase_v2(
                64,
                92,
                48_000.0,
                0,
                1,
                left.as_mut_ptr(),
                right.as_mut_ptr(),
                8,
                core::ptr::null(),
                0,
                left.as_mut_ptr().cast::<u8>(),
                CLR_STATE_MAX_BYTES as i32,
            ),
            0,
            "state output overlapping PCM must refuse before rendering",
        );
        assert_eq!(
            clr_render_phrase_v2(
                64,
                92,
                48_000.0,
                0,
                1,
                left.as_mut_ptr(),
                right.as_mut_ptr(),
                8,
                core::ptr::null(),
                0,
                bytes.as_mut_ptr(),
                (CLR_STATE_FIXED_BYTES - 1) as i32,
            ),
            0,
            "one byte below the fixed state header must refuse",
        );
    }
}
