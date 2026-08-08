//! Physically modeled clarinet: a reed-driven cylindrical waveguide.
//!
//! The clarinet reuses the flute's architecture — a delay-line bore behind a
//! lossy reflection, a nonlinear excitation, breath dynamics — with the two
//! substitutions that make a clarinet a clarinet:
//!
//! - **Closed-open bore**: the reed end is (acoustically) closed, so the
//!   standing wave fits a QUARTER wavelength in the tube. V2 propagates
//!   separate mouth-to-bell and bell-to-mouth waves through serial passive
//!   tone-hole/register junctions and an inverting open-end reflection. That
//!   geometry is why a clarinet sounds an octave below a flute of the same
//!   length, why its spectrum is odd-harmonic-dominant (the hollow sound),
//!   and why it overblows a twelfth instead of an octave.
//! - **Reed valve**: instead of an air jet, a pressure-controlled valve. V2
//!   advances a mass-spring-damper reed with signed Bernoulli flow and passive
//!   lay contact; the retained table is only the explicit v1 comparator.
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
const CLR_MAX_DELAY: usize = 8_192;
const CLR_STATE_MAGIC: u32 = 0x3252_4c43; // "CLR2" in little endian.
const CLR_STATE_VERSION: u32 = 4;
const CLR_STATE_HEADER_BYTES: usize = 32;
const CLR_STATE_SCALAR_COUNT: usize = 24;
const CLR_STATE_FIXED_BYTES: usize = CLR_STATE_HEADER_BYTES + CLR_STATE_SCALAR_COUNT * 8;
const CLR_STATE_MAX_BYTES: usize = CLR_STATE_FIXED_BYTES + CLR_MAX_DELAY * 8;

static mut CLR_BORE: [f64; CLR_MAX_DELAY] = [0.0; CLR_MAX_DELAY];
static mut CLR_SEGMENTED_A: [f64; CLR_MAX_DELAY] = [0.0; CLR_MAX_DELAY];
static mut CLR_SEGMENTED_B: [f64; CLR_MAX_DELAY] = [0.0; CLR_MAX_DELAY];

enum ClarinetBore<'a> {
    Legacy(DelayLine<'a>),
    Segmented {
        current: &'a mut [f64],
        next: &'a mut [f64],
        one_way: usize,
    },
}

fn scatter_shunt(from_mouth: f64, from_bell: f64, admittance: f64) -> (f64, f64, f64) {
    let pressure = 2.0 * (from_mouth + from_bell) / (2.0 + admittance);
    (
        pressure - from_bell,
        pressure - from_mouth,
        sqrt(admittance) * pressure,
    )
}

impl ClarinetBore<'_> {
    fn mouth_return(&self) -> f64 {
        match self {
            Self::Legacy(delay) => delay.output(),
            Self::Segmented { current, one_way, .. } => current[*one_way],
        }
    }

    fn bell_incident(&self) -> f64 {
        match self {
            Self::Legacy(delay) => delay.output(),
            Self::Segmented { current, one_way, .. } => current[*one_way - 1],
        }
    }

    fn legacy_tap(&self, offset: usize) -> f64 {
        match self {
            Self::Legacy(delay) => delay.tap_from_output(offset),
            Self::Segmented { .. } => 0.0,
        }
    }

    fn advance(
        &mut self,
        mouth_input: f64,
        bell_reflection: f64,
        hole_positions: &[usize; 6],
        hole_admittance: &[f64; 6],
        register_position: usize,
        register_admittance: f64,
    ) -> (f64, [f64; 6], f64) {
        match self {
            Self::Legacy(delay) => {
                delay.push(mouth_input);
                (delay.output(), [0.0; 6], 0.0)
            }
            Self::Segmented { current, next, one_way } => {
                let n = *one_way;
                next[0] = mouth_input;
                next[n + n - 1] = bell_reflection;
                for junction in 1..n {
                    next[junction] = current[junction - 1];
                    next[n + junction - 1] = current[n + junction];
                }

                let mut hole_radiated = [0.0; 6];
                for index in 0..hole_positions.len() {
                    let y = hole_admittance[index];
                    if y <= 0.0 {
                        continue;
                    }
                    let junction = hole_positions[index].clamp(1, n - 1);
                    let from_mouth = current[junction - 1];
                    let from_bell = current[n + junction];
                    let (toward_bell, toward_mouth, radiated) =
                        scatter_shunt(from_mouth, from_bell, y);
                    next[junction] = toward_bell;
                    next[n + junction - 1] = toward_mouth;
                    hole_radiated[index] = radiated;
                }
                let mut register_radiated = 0.0;
                if register_admittance > 0.0 {
                    let junction = register_position.clamp(1, n - 1);
                    let from_mouth = current[junction - 1];
                    let from_bell = current[n + junction];
                    let (toward_bell, toward_mouth, radiated) =
                        scatter_shunt(from_mouth, from_bell, register_admittance);
                    next[junction] = toward_bell;
                    next[n + junction - 1] = toward_mouth;
                    register_radiated = radiated;
                }
                core::mem::swap(current, next);
                (bell_reflection, hole_radiated, register_radiated)
            }
        }
    }

    fn state_parts(&self) -> (&[f64], usize) {
        match self {
            Self::Legacy(delay) => (delay.storage(), delay.write_index()),
            Self::Segmented { current, one_way, .. } => (&current[..2 * *one_way], 0),
        }
    }
}

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

fn tongue_contact_at(frame: usize, hold_frames: usize, release_frames: usize) -> f64 {
    if frame < hold_frames {
        return 1.0;
    }
    if release_frames == 0 || frame >= hold_frames.saturating_add(release_frames) {
        return 0.0;
    }
    let phase = (frame - hold_frames) as f64 / release_frames as f64;
    let smooth = phase * phase * (3.0 - 2.0 * phase);
    1.0 - smooth
}

fn finalize_v2_output(out_left: &[f32], out_right: &[f32]) -> i32 {
    let frames = out_left.len().min(out_right.len());
    /* The v2 bore produces its radiated-pressure wave directly in the
     * engine's PCM convention. Its level must not depend on the caller's
     * segment boundary:
     * phrase chunks can be shorter than the 0.4 s settling interval, and a
     * block-relative RMS normalizer made those chunks use one arbitrary end
     * sample as their gain authority, driving up to half the block into an
     * output limiter. The physical reed/bore dynamics own level and timbre;
     * returning its complete output unchanged preserves both. */
    frames as i32
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
const CLR_AIR_DENSITY_KG_PER_M3: f64 = crate::clarinet_v2_parameters::PARAMETERS[0].2;
const CLR_SOUND_SPEED_M_PER_S: f64 = crate::clarinet_v2_parameters::PARAMETERS[1].2;

/// Measured residual intonation pull (2026-08-08, bead
/// jcpe-winds-quality-triangulation-drga): cents sharp(+)/flat(-) rendered
/// by the v2 model per note at mf, measured end-to-end against 12TET with
/// the triangulation harness (fit domain exactly MIDI 50..=89, clamped
/// outside). Applied as a scale on the note's target f0 - the single seam
/// every v2 delay and corner derives from.
const CLR_RESIDUAL_PULL_CENTS: [f64; 40] = [
        -0.1, // m50
        -0.7, // m51
        -7.9, // m52
        -0.9, // m53
        -0.3, // m54
        -0.2, // m55
        -6.5, // m56
        0.1, // m57
        0.4, // m58
        0.7, // m59
        0.9, // m60
        1.4, // m61
        1.7, // m62
        1.5, // m63
        -4.0, // m64
        -2.2, // m65
        2.8, // m66
        3.5, // m67
        -8.9, // m68
        -0.4, // m69
        -0.1, // m70
        -1.1, // m71
        -0.7, // m72
        0.1, // m73
        0.5, // m74
        0.5, // m75
        1.7, // m76
        -1.9, // m77
        2.2, // m78
        -5.6, // m79
        1.3, // m80
        -3.7, // m81
        -1.7, // m82
        0.8, // m83
        3.0, // m84
        0.3, // m85
        -1.9, // m86
        -2.1, // m87
        -0.1, // m88
        -1.4, // m89
];

/// Per-note rate slope of the residual (cents per log2 of rate/48k),
/// fitted from tri-rate measurement alongside the 48 kHz table.
const CLR_RESIDUAL_RATE_SLOPE_CENTS: [f64; 40] = [
        2.1, // m50
        2.3, // m51
        2.6, // m52
        2.6, // m53
        2.8, // m54
        3.0, // m55
        3.4, // m56
        3.4, // m57
        3.6, // m58
        3.8, // m59
        4.1, // m60
        3.6, // m61
        3.1, // m62
        2.7, // m63
        2.6, // m64
        1.9, // m65
        -4.2, // m66
        -4.9, // m67
        1.1, // m68
        0.1, // m69
        -0.2, // m70
        -0.5, // m71
        -0.8, // m72
        -1.0, // m73
        -1.3, // m74
        -1.6, // m75
        -0.6, // m76
        -1.9, // m77
        -1.6, // m78
        -1.4, // m79
        -0.4, // m80
        -0.6, // m81
        0.6, // m82
        2.2, // m83
        3.5, // m84
        2.9, // m85
        2.3, // m86
        3.2, // m87
        4.1, // m88
        5.1, // m89
];

fn clr_residual_pull_scale(midi: i32, sample_rate: f32) -> f64 {
    let index = (midi - 50).clamp(0, 39) as usize;
    let rate_octaves = libm::log2(sample_rate as f64 / 48_000.0);
    let cents = CLR_RESIDUAL_PULL_CENTS[index]
        + CLR_RESIDUAL_RATE_SLOPE_CENTS[index] * rate_octaves;
    libm::exp2(-cents / 1_200.0)
}
const CLR_BORE_RADIUS_M: f64 = crate::clarinet_v2_parameters::PARAMETERS[2].2;
const CLR_REFERENCE_LENGTH_M: f64 = crate::clarinet_v2_parameters::PARAMETERS[3].2;
const CLR_HOLE_AXIAL_M: [f64; 6] = [
    crate::clarinet_v2_parameters::PARAMETERS[4].2,
    crate::clarinet_v2_parameters::PARAMETERS[7].2,
    crate::clarinet_v2_parameters::PARAMETERS[10].2,
    crate::clarinet_v2_parameters::PARAMETERS[13].2,
    crate::clarinet_v2_parameters::PARAMETERS[16].2,
    crate::clarinet_v2_parameters::PARAMETERS[19].2,
];
const CLR_HOLE_CHIMNEY_M: [f64; 6] = [
    crate::clarinet_v2_parameters::PARAMETERS[5].2,
    crate::clarinet_v2_parameters::PARAMETERS[8].2,
    crate::clarinet_v2_parameters::PARAMETERS[11].2,
    crate::clarinet_v2_parameters::PARAMETERS[14].2,
    crate::clarinet_v2_parameters::PARAMETERS[17].2,
    crate::clarinet_v2_parameters::PARAMETERS[20].2,
];
const CLR_HOLE_RADIUS_M: [f64; 6] = [
    crate::clarinet_v2_parameters::PARAMETERS[6].2,
    crate::clarinet_v2_parameters::PARAMETERS[9].2,
    crate::clarinet_v2_parameters::PARAMETERS[12].2,
    crate::clarinet_v2_parameters::PARAMETERS[15].2,
    crate::clarinet_v2_parameters::PARAMETERS[18].2,
    crate::clarinet_v2_parameters::PARAMETERS[21].2,
];
const CLR_APERTURE_END_CORRECTION_RADII: f64 = crate::clarinet_v2_parameters::PARAMETERS[22].2;
const CLR_REED_CHANNEL_WIDTH_M: f64 = crate::clarinet_v2_parameters::PARAMETERS[23].2;
const CLR_REED_DAMPING_NS_PER_M: f64 = crate::clarinet_v2_parameters::PARAMETERS[24].2;
const CLR_REED_EFFECTIVE_AREA_M2: f64 = crate::clarinet_v2_parameters::PARAMETERS[25].2;
const CLR_REED_EQUILIBRIUM_OPENING_M: f64 = crate::clarinet_v2_parameters::PARAMETERS[26].2;
const CLR_REED_MASS_KG: f64 = crate::clarinet_v2_parameters::PARAMETERS[27].2;
const CLR_REED_STIFFNESS_N_PER_M: f64 = crate::clarinet_v2_parameters::PARAMETERS[28].2;
const CLR_REGISTER_AXIAL_M: f64 = crate::clarinet_v2_parameters::PARAMETERS[29].2;
const CLR_REGISTER_CHIMNEY_M: f64 = crate::clarinet_v2_parameters::PARAMETERS[30].2;
const CLR_REGISTER_RADIUS_M: f64 = crate::clarinet_v2_parameters::PARAMETERS[31].2;
const CLR_REGISTER_ADMITTANCE_CAP: f64 = crate::clarinet_v2_parameters::PARAMETERS[32].2;
const CLR_TONE_HOLE_ADMITTANCE_CAP: f64 = crate::clarinet_v2_parameters::PARAMETERS[33].2;

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
/// The exact state byte count is self-describing as `224 + bore_length * 8`,
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
    let output_frames = capacity.min(max_frames) as usize;
    let out_left = unsafe { core::slice::from_raw_parts_mut(left, output_frames) };
    let out_right = unsafe { core::slice::from_raw_parts_mut(right, output_frames) };

    /* The high-register low-rate v2 feedback loop runs at 2x and is
     * box-decimated at the output. Independent alias evidence selects this
     * bounded regime (MIDI >=84 at 44.1/48 kHz); lower notes and 96 kHz stay
     * at one-times because their comparative/absolute cells already pass. */
    /* The fork-fingering pocket (66..67) joins the oversampled regime:
     * its shunt-lattice drive at full band pressure folds measurably at
     * 44.1 kHz (alias fixture, 2026-08-07) just like the top register. */
    let simulation_oversample = if dynamic_reed
        && (midi >= 84 || (66..=67).contains(&midi))
        && sample_rate <= 48_000.0
    {
        2usize
    } else {
        1usize
    };
    let Some(frames) = output_frames.checked_mul(simulation_oversample) else {
        return 0;
    };
    let sr = sample_rate as f64 * simulation_oversample as f64;
    let m = midi as f64;
    let v_norm = velocity as f64 / 127.0;
    let open_hole_count = fingering_mask(midi).count_ones() as f64;
    let f0 = if dynamic_reed {
        midi_frequency_hz(m) * clr_residual_pull_scale(midi, sample_rate)
    } else {
        midi_frequency_hz(m)
    };
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
    let rate_term = if dynamic_reed {
        let rate_slope = 0.78 - 0.26 * ((m - 80.0) / 3.0).clamp(0.0, 1.0);
        /* Post speaking-band recalibration (2026-08-06 residual sweep at
         * vel 100): the new operating pressures leave MIDI 83-86 running
         * +7..+9 cents sharp at 96 kHz only (48/44.1 kHz stay inside the
         * gate), so the clarion-top slope regains part of what the base
         * shape removes there. Measured, not derived. */
        let clarion_top_96k = 0.16
            * ((m - 79.0) / 4.0).clamp(0.0, 1.0)
            * ((89.0 - m) / 3.0).clamp(0.0, 1.0);
        (rate_slope + clarion_top_96k)
            * (mc - 60.0).max(0.0)
            * (sample_rate as f64 / 48_000.0 - 1.0)
    } else {
        -0.85 * (mc - 60.0).max(0.0) * (sample_rate as f64 / 48_000.0 - 1.0)
    };
    /* Measured serial-grid correction at 48 kHz. The integer two-way grid
     * changes in two-sample steps, so the fractional allpass is calibrated
     * at the four PHS2 register anchors rather than borrowing the legacy
     * monolithic-loop correction. Residuals at MIDI 52/64/76/84 are inside
     * the independent +/-20-cent gate at the supported build rate. */
    let dynamic_reed_pull = if dynamic_reed {
        let middle_register = 17.0
            * ((m - 52.0) / 13.0).clamp(0.0, 1.0)
            * ((76.0 - m) / 11.0).clamp(0.0, 1.0);
        let clarion_shoulder = 11.0
            * ((m - 64.0) / 4.0).clamp(0.0, 1.0)
            * ((76.0 - m) / 5.0).clamp(0.0, 1.0);
        let upper_fraction = ((m - 76.0) / 7.0).clamp(0.0, 1.0);
        let oversampled_upper = if simulation_oversample == 2 {
            20.0 * upper_fraction * upper_fraction
        } else {
            0.0
        };
        let upper_register = -10.0 * ((m - 76.0) / 8.0).clamp(0.0, 1.0);
        /* Post speaking-band recalibration (2026-08-06 residual sweep at
         * vel 100, all three rates): the higher operating pressures leave
         * a rate-independent flat pocket across MIDI 68-77 (-5.5..-8.4
         * cents) and a flat altissimo top at 89 (44.1/48 kHz). Both are
         * corrected here where the other register terms live; the shapes
         * plateau over the measured pocket and vanish outside it. */
        let band_pocket = -6.0
            * ((m - 66.0) / 3.0).clamp(0.0, 1.0)
            * ((79.0 - m) / 3.0).clamp(0.0, 1.0);
        let altissimo_top = -5.0 * ((m - 86.0) / 3.0).clamp(0.0, 1.0);
        -7.0 - 32.0 * ((m - 52.0) / 12.0).clamp(0.0, 1.0)
            - 15.0 * ((m - 64.0) / 12.0).clamp(0.0, 1.0)
            - 30.0 * ((m - 76.0) / 8.0).clamp(0.0, 1.0)
            + middle_register
            + clarion_shoulder
            + oversampled_upper
            + upper_register
            + band_pocket
            + altissimo_top
    } else {
        0.0
    };
    /* Blowing-pressure pitch pull is strongest in the four-open-hole
     * impedance pocket. Keep it in the fractional delay, where a player-like
     * pressure-dependent bore-length correction belongs, rather than moving
     * the oscillator after rendering. */
    let four_hole_pitch_gate =
        (1.0 - (open_hole_count - 4.0).abs()).clamp(0.0, 1.0);
    let mezzo_pitch_gate = (1.0 - (v_norm - 0.56).abs() / 0.20).clamp(0.0, 1.0);
    let pressure_pitch_pull = if dynamic_reed {
        10.0 * four_hole_pitch_gate * mezzo_pitch_gate
    } else {
        0.0
    };
    let pull_cents = pull_fit + rate_term + dynamic_reed_pull + pressure_pitch_pull;
    let corrected_half = half_period * pow(2.0, pull_cents / 1_200.0);
    let effective = (corrected_half - reflection_delay - 0.5).max(3.2);
    let legacy_bore_length = ((effective - 0.1) as usize).max(3);
    /* The v2 bore stores two one-way travelling-wave fields. A sample
     * injected at the mouth returns after `2*n - 1` propagation steps; the
     * allpass carries the remaining sub-grid delay without moving junctions. */
    let segmented_one_way = (((effective + 1.0) * 0.5) as usize).max(2);
    let bore_length = if dynamic_reed {
        2 * segmented_one_way
    } else {
        legacy_bore_length
    };
    let bore_fraction = if dynamic_reed {
        effective - (2 * segmented_one_way - 1) as f64
    } else {
        effective - legacy_bore_length as f64
    };
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

    let mut bore = if dynamic_reed {
        let current = unsafe { &mut *core::ptr::addr_of_mut!(CLR_SEGMENTED_A) };
        let next = unsafe { &mut *core::ptr::addr_of_mut!(CLR_SEGMENTED_B) };
        for value in current[..bore_length].iter_mut() {
            *value = 0.0;
        }
        for value in next[..bore_length].iter_mut() {
            *value = 0.0;
        }
        if let (Some(prior), Some(bytes)) = (prior_state, state_input) {
            if prior.bore_length % 2 != 0 {
                return 0;
            }
            let prior_one_way = prior.bore_length / 2;
            for direction in 0..2 {
                for index in 0..segmented_one_way {
                    let source = index as f64 * prior_one_way as f64 / segmented_one_way as f64;
                    let lower = (source as usize).min(prior_one_way - 1);
                    let upper = (lower + 1).min(prior_one_way - 1);
                    let fraction = source - lower as f64;
                    let base = CLR_STATE_FIXED_BYTES + direction * prior_one_way * 8;
                    let Some(lower_value) = read_f64(bytes, base + lower * 8) else {
                        return 0;
                    };
                    let Some(upper_value) = read_f64(bytes, base + upper * 8) else {
                        return 0;
                    };
                    if !lower_value.is_finite() || !upper_value.is_finite() {
                        return 0;
                    }
                    current[direction * segmented_one_way + index] =
                        lower_value + fraction * (upper_value - lower_value);
                }
            }
        }
        ClarinetBore::Segmented {
            current,
            next,
            one_way: segmented_one_way,
        }
    } else {
        let storage = unsafe { &mut *core::ptr::addr_of_mut!(CLR_BORE) };
        let delay = if let (Some(prior), Some(bytes)) = (prior_state, state_input) {
            for index in 0..bore_length {
                let source = index as f64 * prior.bore_length as f64 / bore_length as f64;
                let lower = source as usize;
                let upper = (lower + 1).min(prior.bore_length - 1);
                let fraction = source - lower as f64;
                let lower_ring = (prior.bore_write_index + lower) % prior.bore_length;
                let upper_ring = (prior.bore_write_index + upper) % prior.bore_length;
                let Some(lower_value) = read_f64(bytes, CLR_STATE_FIXED_BYTES + lower_ring * 8)
                else {
                    return 0;
                };
                let Some(upper_value) = read_f64(bytes, CLR_STATE_FIXED_BYTES + upper_ring * 8)
                else {
                    return 0;
                };
                storage[index] = lower_value + fraction * (upper_value - lower_value);
            }
            DelayLine::new_preserving(storage, bore_length, 0)
        } else {
            DelayLine::new(storage, bore_length)
        };
        let Some(delay) = delay else {
            return 0;
        };
        ClarinetBore::Legacy(delay)
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
    /*
     * V2 breath rides the MEASURED speaking band of the segmented lattice,
     * not the legacy plateau. The tone-hole/vent shunts radiate energy on
     * every pass, so the v2 oscillation threshold sits well above the
     * legacy 0.68 floor and varies with fingering; blowing past the upper
     * edge closes the reed (phonation is an interval, not a half-line).
     * Owner listening 2026-08-06 caught the failure (soft cells rendered
     * as pure noise); the band below was measured by an independent
     * autocorrelation pitch-lock scan over velocity 1..127 at each anchor
     * (legato, slot 0, 48 kHz, post noise-law calibration), with margins
     * of +0.012 above the measured lower edge and -0.008 under the upper.
     * Dynamics map INTO the band: soft = just above threshold, loud =
     * short of the squeeze, timbre and level carry the rest. Anchors are
     * (midi, band_lo, band_hi); linear interpolation between, endpoints
     * held outside 50..89 (same clamp discipline as the tuning pull).
     */
    /* MIDI 66-67 carry a locally harder threshold pocket (fork-fingering
     * shunt losses peak there): the finer 2026-08-06 verification sweep
     * caught wrong-mode locks and near-threshold flatness that linear
     * interpolation across 62..68 missed, and the local re-scan measured
     * contiguous phonation only from the pressures anchored below. The
     * dynamic range at those two fingerings is deliberately narrow. */
    const CLR_V2_SPEAKING_BAND_ANCHORS: [(f64, f64, f64); 10] = [
        (50.0, 0.780, 0.854),
        (56.0, 0.760, 0.870),
        (62.0, 0.760, 0.854),
        (66.0, 0.828, 0.852),
        (67.0, 0.836, 0.850),
        (68.0, 0.794, 0.848),
        (74.0, 0.790, 0.848),
        (80.0, 0.712, 0.872),
        (84.0, 0.692, 0.872),
        (89.0, 0.856, 0.874),
    ];
    let (pressure_band_lo, pressure_band_hi) = if dynamic_reed {
        let mb = m.clamp(
            CLR_V2_SPEAKING_BAND_ANCHORS[0].0,
            CLR_V2_SPEAKING_BAND_ANCHORS[CLR_V2_SPEAKING_BAND_ANCHORS.len() - 1].0,
        );
        let mut band_lo = CLR_V2_SPEAKING_BAND_ANCHORS[0].1;
        let mut band_hi = CLR_V2_SPEAKING_BAND_ANCHORS[0].2;
        for window in CLR_V2_SPEAKING_BAND_ANCHORS.windows(2) {
            let (m0, lo0, hi0) = window[0];
            let (m1, lo1, hi1) = window[1];
            if mb >= m0 && mb <= m1 {
                let t = if m1 > m0 { (mb - m0) / (m1 - m0) } else { 0.0 };
                band_lo = lo0 + t * (lo1 - lo0);
                band_hi = hi0 + t * (hi1 - hi0);
                break;
            }
        }
        (band_lo, band_hi)
    } else {
        (0.0, 1.0)
    };
    let pressure_target = if dynamic_reed {
        /* Pianissimo sits a quarter of the band above the measured lower
         * edge: the anchors are linear interpolations of a threshold that
         * bulges between fingerings, and the verification sweep showed the
         * raw edge leaves vel-1 cells flat or unlocked between anchors.
         * The remaining three quarters of the band carry the dynamics. */
        let band_floor = pressure_band_lo + 0.25 * (pressure_band_hi - pressure_band_lo);
        band_floor + (pressure_band_hi - band_floor) * pow(v_norm, 1.3)
    } else {
        0.68 + 0.20 * pow(v_norm, 1.3)
    };
    /* A player establishes mouth pressure behind the tongue before release.
     * Starting pressure at zero made v2 spend 0.11--0.16 s below the measured
     * Hopf threshold, after which its tiny supercritical margin needed several
     * more tenths of a second to grow. Launch from a bounded point inside the
     * measured speaking interval, then settle toward the dynamic target. */
    let soft_loss_gate = ((0.70 - v_norm) / 0.42).clamp(0.0, 1.0);
    let launch_fraction = 0.35 - 0.15 * ((m - 80.0) / 9.0).clamp(0.0, 1.0);
    let pressure_launch =
        pressure_band_lo + launch_fraction * (pressure_band_hi - pressure_band_lo);
    let legacy_attack_step = 1.0 - exp(-1.0 / (0.03 * sr));
    let cold_launch_step = 1.0 - exp(-1.0 / (0.006 * sr));
    let pressure_settle_seconds = 0.025
        + if (82.0..=86.0).contains(&m) {
            0.050 * pow(v_norm, 4.0)
        } else {
            0.0
        };
    let pressure_settle_step = 1.0 - exp(-1.0 / (pressure_settle_seconds * sr));
    let vibrato_hz = 4.8 * variation.map_or(1.0, |value| value.rate_multiplier);
    let vibrato_depth = 0.012 * variation.map_or(1.0, |value| value.depth_multiplier);
    let vibrato_onset = 0.35 * sr * variation.map_or(1.0, |value| value.onset_multiplier);
    let vibrato_ramp = 0.4 * sr;
    let vibrato_step = TAU * vibrato_hz / sr;
    let (vibrato_step_sin, vibrato_step_cos) = (sin(vibrato_step), cos(vibrato_step));
    let mut vibrato_sin = variation.map_or(0.0, |value| sin(value.phase_radians));
    let mut vibrato_cos = variation.map_or(1.0, |value| cos(value.phase_radians));
    /* A clarinet is far less breathy than a flute. The v2 lattice also
     * radiates loop turbulence through the tone-hole/vent paths that the
     * monolithic v1 loop never exposed, so v2 takes the lower half of the
     * measured in-loop turbulence band (0.004..0.009); owner listening
     * 2026-08-06 flagged "background noise hiss" on the loud v2 cells,
     * measured as ~2 dB HNR deficit against v1 per cell. */
    let noise_level = if dynamic_reed {
        /* Open shunts inject locally generated shear-layer turbulence. The
         * four-hole impedance maximum is strongest near the pp threshold;
         * the loop filter and radiation boundary below keep that energy in
         * the measured clarinet band instead of turning it into hiss. */
        let four_hole_gate = (1.0 - (open_hole_count - 4.0).abs()).clamp(0.0, 1.0);
        0.002_5 + 0.003 * v_norm + 0.055 * four_hole_gate * soft_loss_gate
    } else {
        0.005 + 0.009 * v_norm
    };
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
    let pressure_overshoot = if !dynamic_reed && attack_articulation == Some(true) {
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
    let tongue_release_frames = if dynamic_reed && attack_articulation == Some(true) {
        let base_release_seconds = if (82.0..=86.0).contains(&m) {
            0.007
        } else {
            0.002
        };
        let loud_release_extension = if (60.0..=64.0).contains(&m)
            || (82.0..=86.0).contains(&m)
        {
            0.005 * pow(v_norm, 4.0)
        } else {
            0.0
        };
        let release_seconds = base_release_seconds + loud_release_extension;
        ((release_seconds * sr + 0.5) as usize).max(1)
    } else {
        0
    };
    let cold_launch_frames = if dynamic_reed && attack_articulation == Some(false) {
        ((0.030 * sr + 0.5) as usize).max(1)
    } else {
        0
    };
    let mut chiff_envelope = 1.0f64;
    let mut overshoot_envelope = 1.0f64;
    let mut pressure = 0.0f64;
    let reed_h0 = CLR_REED_EQUILIBRIUM_OPENING_M;
    let mut reed_x = reed_h0;
    let mut reed_velocity = 0.0;
    let mut elapsed_frames = 0u32;

    /* Band-limit the differentiated radiation (the flute's hiss lesson).
     * The v2 hole/vent radiation corners obey the same 5.5 kHz radiated-
     * field ceiling as the bell: their chimney-derived corners otherwise
     * reach 7 kHz and pass loop turbulence as audible hiss (owner
     * listening 2026-08-06). Legacy keeps 7 kHz for byte stability. */
    let radiated_corner_cap_hz = if dynamic_reed { 5_500.0 } else { 7_000.0 };
    let two_hole_gate = (1.0 - (open_hole_count - 2.0).abs()).clamp(0.0, 1.0);
    let four_hole_radiation_gate =
        (1.0 - (open_hole_count - 4.0).abs()).clamp(0.0, 1.0);
    let five_hole_gate = (1.0 - (open_hole_count - 5.0).abs()).clamp(0.0, 1.0);
    let mezzo_radiation_gate = (1.0 - (v_norm - 0.56).abs() / 0.20).clamp(0.0, 1.0);
    let bell_corner_hz = if dynamic_reed {
        let lattice_loss = (0.82 * (two_hole_gate + five_hole_gate) * soft_loss_gate
            + 0.40 * four_hole_radiation_gate * mezzo_radiation_gate)
            .min(0.85);
        5_500.0 * (1.0 - lattice_loss)
    } else {
        5_500.0
    };
    let radiation_alpha = 1.0 - exp(-TAU * bell_corner_hz / sr);
    let mut radiation = RadiationFilter::new(radiation_alpha, 6.0);
    let mut hole_radiation: [OnePoleLoss; 6] = core::array::from_fn(|index| {
        let effective_chimney = CLR_HOLE_CHIMNEY_M[index]
            + 2.0 * CLR_APERTURE_END_CORRECTION_RADII * CLR_HOLE_RADIUS_M[index];
        let corner_hz = (CLR_SOUND_SPEED_M_PER_S / (4.0 * effective_chimney))
            .clamp(2_000.0, radiated_corner_cap_hz);
        OnePoleLoss::new(1.0 - exp(-TAU * corner_hz / sr))
    });
    let register_effective_chimney =
        CLR_REGISTER_CHIMNEY_M + 2.0 * CLR_APERTURE_END_CORRECTION_RADII * CLR_REGISTER_RADIUS_M;
    let register_corner_hz = (CLR_SOUND_SPEED_M_PER_S / (4.0 * register_effective_chimney))
        .clamp(2_000.0, radiated_corner_cap_hz);
    let mut register_radiation = OnePoleLoss::new(1.0 - exp(-TAU * register_corner_hz / sr));
    let mask = fingering_mask(midi);
    let register_vent_open = dynamic_reed && midi >= 70;
    let hole_positions: [usize; 6] = core::array::from_fn(|index| {
        ((CLR_HOLE_AXIAL_M[index] / CLR_REFERENCE_LENGTH_M)
            * (segmented_one_way - 1) as f64) as usize
    });
    let register_position = ((CLR_REGISTER_AXIAL_M / CLR_REFERENCE_LENGTH_M)
        * (segmented_one_way - 1) as f64) as usize;
    /* Resistive low-order shunt used by the travelling-wave junction. The
     * uncapped inertive estimate grows outside the pack's ka/frequency
     * applicability, so this realtime reduction is explicitly bounded. */
    let hole_admittance: [f64; 6] = core::array::from_fn(|index| {
        if !dynamic_reed || mask & (1 << index) == 0 {
            return 0.0;
        }
        let radius = CLR_HOLE_RADIUS_M[index];
        let effective_chimney = CLR_HOLE_CHIMNEY_M[index]
            + 2.0 * CLR_APERTURE_END_CORRECTION_RADII * radius;
        let area_ratio = (radius / CLR_BORE_RADIUS_M) * (radius / CLR_BORE_RADIUS_M);
        (area_ratio * CLR_SOUND_SPEED_M_PER_S / (TAU * f0 * effective_chimney))
            .min(CLR_TONE_HOLE_ADMITTANCE_CAP)
    });
    let register_admittance = if register_vent_open {
        let area_ratio = (CLR_REGISTER_RADIUS_M / CLR_BORE_RADIUS_M)
            * (CLR_REGISTER_RADIUS_M / CLR_BORE_RADIUS_M);
        (area_ratio * CLR_SOUND_SPEED_M_PER_S / (TAU * f0 * register_effective_chimney))
            .min(CLR_REGISTER_ADMITTANCE_CAP)
    } else {
        0.0
    };
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
    let reflected_gain = if dynamic_reed {
        1.0
    } else {
        sqrt((1.0 - shunt_power).max(0.0))
    };
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
    } else if dynamic_reed && attack_articulation == Some(true) {
        /* Breath is already charged behind the closed reed on a tongued
         * attack. The tongue contact below, rather than zero mouth pressure,
         * keeps the instrument silent until release. */
        pressure = pressure_launch;
    }

    let end_fade_frames = (CLR_END_FADE_SECONDS * sr) as usize;
    let mut output_accumulator = 0.0f64;

    for frame in 0..frames {
        /* Every attack/control clock is phrase-relative. A serialized state
         * means this block continues the same physical trajectory; restarting
         * tongue, pressure launch, or articulation from local frame zero
         * would inject energy at an arbitrary scheduler boundary. */
        let phrase_frame = (elapsed_frames as usize).saturating_add(frame);
        let (instantaneous_target, pressure_step) = if dynamic_reed {
            let launch_phase = if attack_articulation == Some(true) {
                phrase_frame < tongue_hold_frames.saturating_add(tongue_release_frames)
            } else {
                phrase_frame < cold_launch_frames
            };
            if launch_phase {
                (pressure_launch, cold_launch_step)
            } else {
                (pressure_target, pressure_settle_step)
            }
        } else if phrase_frame < tongue_hold_frames {
            (0.0, legacy_attack_step)
        } else {
            (
                pressure_target + pressure_overshoot * overshoot_envelope,
                legacy_attack_step,
            )
        };
        pressure += (instantaneous_target - pressure) * pressure_step;
        let tongue_contact = if dynamic_reed {
            tongue_contact_at(phrase_frame, tongue_hold_frames, tongue_release_frames)
        } else {
            0.0
        };
        /* Tongue release changes the reed aperture through `tongue_contact`.
         * Do not inject a second, unphysical pressure impulse into the bore. */
        let phrase_frame_f64 = phrase_frame as f64;
        let vibrato_gate = if phrase_frame_f64 < vibrato_onset {
            0.0
        } else {
            ((phrase_frame_f64 - vibrato_onset) / vibrato_ramp).min(1.0)
        };
        let lfo = if variation.is_some() {
            vibrato_sin
        } else {
            sin(TAU * vibrato_hz * phrase_frame_f64 / sr)
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
        if phrase_frame >= tongue_hold_frames {
            overshoot_envelope *= overshoot_decay;
        }
        let breath = pressure * vibrato * (1.0 + noise_level * noise_lp);

        /* In v2 the bell and reed ends are spatially separate travelling-wave
         * ports. Legacy retains its one-loop reflection for byte stability. */
        let bell_incident = bore.bell_incident();
        let bell_reflection =
            dc_blocker.process(-0.95 * reflection_loss.process(bell_incident));
        let reflected = if dynamic_reed {
            bore.mouth_return()
        } else {
            reflected_gain * bell_reflection
        };
        let mut hole_field = 0.0;
        if !dynamic_reed {
            for index in 0..hole_radiation.len() {
                let distance_from_bell = CLR_REFERENCE_LENGTH_M - CLR_HOLE_AXIAL_M[index];
                let tap = (distance_from_bell / CLR_REFERENCE_LENGTH_M
                    * (bore_length - 1) as f64) as usize;
                hole_field += hole_radiation[index].process(bore.legacy_tap(tap))
                    * hole_gain[index];
            }
            let register_tap = ((CLR_REFERENCE_LENGTH_M - CLR_REGISTER_AXIAL_M)
                / CLR_REFERENCE_LENGTH_M
                * (bore_length - 1) as f64) as usize;
            hole_field += register_radiation.process(bore.legacy_tap(register_tap))
                * register_gain;
        }

        /* Reed junction. V2 advances the mass-spring reed itself and mixes
         * its signed Bernoulli flow into the established passive bore. */
        let pressure_diff = reflected - breath;
        let reed = (reed_offset + reed_slope * pressure_diff).clamp(-1.0, 1.0);
        let legacy_bore_in = breath + pressure_diff * reed;
        let bore_in = if dynamic_reed {
            let mut step = [0.0; 8];
            if crate::physical::phs_clarinet_reed_step_v2(
                1.0 / sr,
                reed_x,
                reed_velocity,
                breath * 7_000.0,
                reflected * 2_500.0,
                CLR_REED_MASS_KG,
                CLR_REED_DAMPING_NS_PER_M,
                CLR_REED_STIFFNESS_N_PER_M,
                reed_h0,
                CLR_REED_EFFECTIVE_AREA_M2,
                CLR_REED_CHANNEL_WIDTH_M,
                CLR_AIR_DENSITY_KG_PER_M3,
                tongue_contact,
                step.as_mut_ptr(),
            ) != 1
            {
                return 0;
            }
            reed_x = step[0];
            reed_velocity = step[1];
            let flow_drive = (step[2] / 0.00025).clamp(-1.5, 1.5);
            /* Retain a bounded fraction of the established mouthpiece
             * reflection while the SI flow owns the evolving reed state.
             * This calibrated blend preserves the closed-open odd-partial
             * regime across the v2 register anchors. */
            /* Stronger blowing closes the reed further and makes the signed
             * Bernoulli flow, rather than the linear comparator path, own
             * more of the junction. This is the physical source of the much
             * richer upper-partial structure in anechoic ff recordings. */
            let base_flow_mix = 0.1 - 0.07 * ((m - 76.0) / 8.0).clamp(0.0, 1.0);
            let soft_gate = ((0.45 - v_norm) / 0.20).clamp(0.0, 1.0);
            let mezzo_gate = (1.0 - (v_norm - 0.56).abs() / 0.20).clamp(0.0, 1.0);
            let closed_bore_gate = (1.0 - open_hole_count).clamp(0.0, 1.0);
            let four_hole_gate = (1.0 - (open_hole_count - 4.0).abs()).clamp(0.0, 1.0);
            let flow_mix = (base_flow_mix
                + 0.10 * closed_bore_gate * soft_gate * if register_vent_open { 1.0 } else { 0.0 }
                + 0.06 * four_hole_gate * soft_gate
                - 0.10 * four_hole_gate * mezzo_gate)
                .clamp(0.0, 0.25);
            let gated_legacy_bore_in = legacy_bore_in * (1.0 - tongue_contact);
            let articulation_depth = if m <= 56.0 {
                0.30
            } else if m <= 68.0 {
                0.30 - 0.26 * ((m - 56.0) / 12.0)
            } else if m <= 80.0 {
                0.14 - 0.04 * ((m - 68.0) / 12.0)
            } else if m <= 86.0 {
                0.015 * (1.0 - 0.50 * v_norm)
            } else {
                0.05 - 0.02 * v_norm
            };
            let articulation_gain = if attack_articulation == Some(true)
                && phrase_frame >= tongue_hold_frames
            {
                1.0
                    + articulation_depth
                        * exp(
                            -((phrase_frame - tongue_hold_frames) as f64) / (0.030 * sr),
                        )
            } else {
                1.0
            };
            articulation_gain
                * ((1.0 - flow_mix) * gated_legacy_bore_in + flow_mix * flow_drive)
        } else {
            legacy_bore_in
        };

        let tuned = tuning_a * bore_in + tuning_x1 - tuning_a * tuning_y1;
        tuning_x1 = bore_in;
        tuning_y1 = tuned;
        let (_, hole_waves, register_wave) = bore.advance(
            tuned,
            bell_reflection,
            &hole_positions,
            &hole_admittance,
            register_position,
            register_admittance,
        );
        if dynamic_reed {
            for index in 0..hole_radiation.len() {
                hole_field += hole_radiation[index].process(hole_waves[index]);
            }
            hole_field += register_radiation.process(register_wave);
        }

        /* Radiated field: gentle differentiation, band-limited, near-dry
         * breath. */
        /* Direct breath bleed obeys the <=0.01 direct-injection law in v2
         * (0.012 * pressure ~ 0.0102 sat marginally over it); legacy keeps
         * its shipped constant for byte stability. */
        /* The anechoic FreePats references put 5.5--10 kHz energy 10--21 dB
         * below the earlier v2 output. Most of that excess was the microphone
         * path below, not reed/bore turbulence: a clarinet's reed is inside
         * the mouth and the bell/tone-hole field dominates its radiation.
         * Keep a small direct turbulent component without bypassing the
         * physical bore radiation. */
        let breath_bleed = if dynamic_reed { 0.000_2 } else { 0.012 };
        let direct_turbulence = noise_lp;
        let radiated = radiation.process(bell_incident)
            + hole_field
            + breath_bleed * direct_turbulence * pressure
            + chiff;

        let mut sample = radiated;
        if state_output.is_none() && frames - frame <= end_fade_frames {
            let position = (frames - frame) as f64 / end_fade_frames as f64;
            sample *= position;
        }
        output_accumulator += sample;
        if frame % simulation_oversample == simulation_oversample - 1 {
            let output_index = frame / simulation_oversample;
            let decimated = output_accumulator / simulation_oversample as f64;
            out_left[output_index] = (decimated * pan_left) as f32;
            out_right[output_index] = (decimated * pan_right) as f32;
            output_accumulator = 0.0;
        }
    }

    if let Some((bytes, written)) = state_output {
        let (dc_input, dc_output) = dc_blocker.state();
        let (radiation_loss, radiation_input) = radiation.state();
        let (bore_storage, bore_write_index) = bore.state_parts();
        let state = ClarinetPhraseState {
            prior_midi: midi,
            bore_length,
            bore_write_index,
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
        let Some(size) = encode_phrase_state(bytes, sample_rate, state, bore_storage) else {
            return 0;
        };
        *written = size;
    }
    if dynamic_reed {
        finalize_v2_output(out_left, out_right)
    } else {
        crate::finalize_stereo(out_left, out_right, sample_rate as f64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn render_phrase_for_test(
        midi: i32,
        velocity: i32,
        sample_rate: f32,
        frames: usize,
    ) -> (Vec<f32>, Vec<f32>) {
        let mut left = vec![0.0f32; frames];
        let mut right = vec![0.0f32; frames];
        let mut state = vec![0u8; CLR_STATE_MAX_BYTES];
        let written = clr_render_phrase_v2(
            midi,
            velocity,
            sample_rate,
            0,
            1,
            left.as_mut_ptr(),
            right.as_mut_ptr(),
            frames as i32,
            core::ptr::null(),
            0,
            state.as_mut_ptr(),
            state.len() as i32,
        );
        assert_eq!(written, frames as i32);
        (left, right)
    }

    #[test]
    fn phrase_output_is_partition_invariant_audible_and_bounded() {
        let sample_rate = 48_000.0f32;
        let short_frames = (0.25 * sample_rate) as usize;
        let long_frames = (0.50 * sample_rate) as usize;
        for midi in [50, 62, 74, 82] {
            for velocity in [36, 72, 108] {
                let (short_left, short_right) =
                    render_phrase_for_test(midi, velocity, sample_rate, short_frames);
                let (long_left, long_right) =
                    render_phrase_for_test(midi, velocity, sample_rate, long_frames);

                /* A caller's chunk boundary is not an acoustic input. This
                 * exact prefix law directly kills the former block-relative
                 * RMS normalization and its output soft limiter. */
                assert_eq!(short_left, long_left[..short_frames]);
                assert_eq!(short_right, long_right[..short_frames]);

                let mut energy = 0.0f64;
                let mut peak = 0.0f64;
                for (&left, &right) in short_left.iter().zip(&short_right) {
                    energy += left as f64 * left as f64 + right as f64 * right as f64;
                    peak = peak.max((left as f64).abs()).max((right as f64).abs());
                }
                let rms = sqrt(energy / (2.0 * short_frames as f64));
                /* Frozen X0 browser-audio acceptance laws, not measurements
                 * selected from this candidate. */
                assert!(
                    rms >= 0.000_05,
                    "midi {midi} velocity {velocity}: inaudible RMS {rms}"
                );
                assert!(
                    rms < 0.5,
                    "midi {midi} velocity {velocity}: excessive RMS {rms}"
                );
                assert!(
                    peak >= 0.000_5 && peak < 0.99,
                    "midi {midi} velocity {velocity}: unbounded peak {peak}"
                );
            }
        }
    }

    #[test]
    fn tongue_release_is_bounded_smooth_and_monotone() {
        let hold = 240;
        let release = 96;
        assert_eq!(tongue_contact_at(0, hold, release), 1.0);
        assert_eq!(tongue_contact_at(hold - 1, hold, release), 1.0);
        assert_eq!(tongue_contact_at(hold + release, hold, release), 0.0);
        let mut previous = 1.0;
        for frame in hold..hold + release {
            let contact = tongue_contact_at(frame, hold, release);
            assert!((0.0..=1.0).contains(&contact));
            assert!(contact <= previous);
            previous = contact;
        }
        assert!(previous > 0.0);
        assert_eq!(tongue_contact_at(hold + release, hold, release), 0.0);
    }

    #[test]
    fn serial_tone_hole_scattering_is_passive_and_not_an_output_only_tap() {
        let from_mouth = 0.7;
        let from_bell = -0.2;
        let incoming_energy = from_mouth * from_mouth + from_bell * from_bell;
        let (transmitted, reflected, radiated) =
            scatter_shunt(from_mouth, from_bell, 0.35);
        let outgoing_energy =
            transmitted * transmitted + reflected * reflected + radiated * radiated;
        assert!((outgoing_energy - incoming_energy).abs() < 1.0e-12);
        assert_ne!(transmitted, from_mouth);
        assert_ne!(reflected, from_bell);

        let (open_transmitted, open_reflected, _) =
            scatter_shunt(from_mouth, from_bell, 0.005);
        let (mutated_transmitted, mutated_reflected, _) =
            scatter_shunt(from_mouth, from_bell, 0.005_001);
        assert_ne!(open_transmitted, mutated_transmitted);
        assert_ne!(open_reflected, mutated_reflected);
    }

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
