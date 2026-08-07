//! Dark flute-v2 physical renderer.
//!
//! Unlike the live `flute` module, this model never retunes a delay from the
//! requested MIDI frequency.  A fixed concert-flute geometry supplies nine
//! bidirectional bore segments, eight inertive tone-hole shunts, and the foot
//! termination.  MIDI chooses a fingering and an embouchure register gesture;
//! it does not choose an acoustic delay.
//!
//! The exciter follows the reduced Verge jet-drive construction.  Mouth
//! pressure is in pascals, the center-line speed is `sqrt(2 P / rho)`, and the
//! perturbation reaches the labium after `W / (0.4 Uj)`.  The edge switching
//! flow drives the bore while its time derivative is the edge-dipole radiation
//! source.  All bore and hole junctions are passive; fixed-seed, band-limited
//! turbulence is injected into the jet perturbation rather than mixed into the
//! output as broadband hiss.
//!
//! This module is intentionally dark: it is compiled and tested as Rust but is
//! not present in the checked-in WASM payload or any recipe/registry pointer.

use libm::{cos, exp, log2, sin, sqrt, tanh};

use crate::{XorShift32, TAU};

#[cfg(test)]
use crate::midi_frequency_hz;

const AIR_DENSITY_KG_PER_M3: f64 = 1.2041;
const SOUND_SPEED_M_PER_S: f64 = 343.21;
const EMB_CHANNEL_TO_EDGE_M: f64 = 0.010;
const EMB_JET_HALF_WIDTH_M: f64 = 0.0005;
const EMB_HOLE_RADIUS_M: f64 = 0.006;
const EMB_END_CORRECTION_M: f64 = 8.0 * EMB_HOLE_RADIUS_M / (3.0 * core::f64::consts::PI);
const BORE_LENGTH_M: f64 = 0.655;
const SEGMENTS: usize = 9;
const HOLES: usize = 8;
const MAX_WAVE_SAMPLES: usize = 256;
const MAX_JET_HISTORY: usize = 256;
const MAX_SAMPLE_RATE_HZ: f64 = 96_000.0;
const CAP_SECONDS: f64 = 3.0;
const STATE_MAGIC: u32 = 0x3254_4c46; // "FLT2" little endian.
const STATE_VERSION: u32 = 3;
const STATE_HEADER_BYTES: usize = 48;
const STATE_SCALAR_COUNT: usize = 73;
const STATE_SCALAR_BYTES: usize = STATE_SCALAR_COUNT * 8;
const STATE_MAX_BYTES: usize =
    STATE_HEADER_BYTES + STATE_SCALAR_BYTES + 2 * MAX_WAVE_SAMPLES * 8 + MAX_JET_HISTORY * 8;

const SECTION_END_M: [f64; SEGMENTS] = [
    0.075, 0.145, 0.215, 0.285, 0.355, 0.425, 0.495, 0.565, 0.655,
];
const SECTION_RADIUS_M: [f64; SEGMENTS] = [
    0.00940, 0.00945, 0.00950, 0.00950, 0.00955, 0.00955, 0.00960, 0.00965, 0.00970,
];
const HOLE_POSITION_M: [f64; HOLES] = [0.246, 0.278, 0.316, 0.357, 0.397, 0.438, 0.492, 0.548];
const HOLE_RADIUS_M: [f64; HOLES] = [
    0.0042, 0.0045, 0.0048, 0.0049, 0.0050, 0.0051, 0.0052, 0.0053,
];
const HOLE_CHIMNEY_M: [f64; HOLES] = [
    0.0032, 0.0032, 0.0034, 0.0034, 0.0035, 0.0035, 0.0037, 0.0038,
];
// A partially lifted key cup adds a short, fixed geometric path between its
// chimney and the exterior pressure node. The E key's shallow cup contributes
// 0.04 mm at its half-open fingering and vanishes once the key is fully open.
const HOLE_KEY_CUP_PATH_M: [f64; HOLES] = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.00008, 0.0];

// Bore propagation endpoints are the eight tone-hole centers plus the foot.
const PATH_END_M: [f64; SEGMENTS] = [
    HOLE_POSITION_M[0],
    HOLE_POSITION_M[1],
    HOLE_POSITION_M[2],
    HOLE_POSITION_M[3],
    HOLE_POSITION_M[4],
    HOLE_POSITION_M[5],
    HOLE_POSITION_M[6],
    HOLE_POSITION_M[7],
    BORE_LENGTH_M,
];

static mut FLT2_FORWARD: [f64; MAX_WAVE_SAMPLES] = [0.0; MAX_WAVE_SAMPLES];
static mut FLT2_BACKWARD: [f64; MAX_WAVE_SAMPLES] = [0.0; MAX_WAVE_SAMPLES];
static mut FLT2_FORWARD_NEXT: [f64; MAX_WAVE_SAMPLES] = [0.0; MAX_WAVE_SAMPLES];
static mut FLT2_BACKWARD_NEXT: [f64; MAX_WAVE_SAMPLES] = [0.0; MAX_WAVE_SAMPLES];
static mut FLT2_JET: [f64; MAX_JET_HISTORY] = [0.0; MAX_JET_HISTORY];

#[derive(Clone, Copy)]
struct SegmentLayout {
    offsets: [usize; SEGMENTS],
    capacities: [usize; SEGMENTS],
    delays: [f64; SEGMENTS],
    losses: [f64; SEGMENTS],
    admittances: [f64; SEGMENTS],
    total_samples: usize,
}

#[derive(Clone, Copy)]
struct Fingering {
    openness: [f64; HOLES],
    register_harmonic: usize,
    /// Measured per-fingering chimney/undercut calibration (dimensionless
    /// scale on every open hole's effective shunt length). The physical
    /// analogue is a maker undercutting or lengthening a tone hole; the
    /// values were measured 2026-08-07 by the full-window wrong-tone matrix
    /// (render -> autocorrelate -> bisect until the bore lock lands on the
    /// requested pitch), never derived from the model's own expectations.
    chimney_scale: f64,
}

/// Calibration probe: when positive, overrides the fingering table's
/// chimney scale for every render. Only the offline calibration driver
/// (scripts-side bisection) calls the setter; production hosts never do,
/// and the default 0.0 disables it. This keeps calibration one build.
static mut FLT2_CHIMNEY_PROBE: f64 = 0.0;

#[no_mangle]
pub extern "C" fn flt2_set_chimney_probe(scale: f64) {
    unsafe { FLT2_CHIMNEY_PROBE = scale };
}

/// Rows: register octave 0..=3 (MIDI 60 + 12*octave); columns: pitch class.
/// 1.0 = uncalibrated geometry. See `Fingering::chimney_scale`.
static FINGERING_CHIMNEY_SCALE: [[f64; 12]; 4] = [
    [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
];

#[derive(Clone, Copy)]
struct PhraseState {
    prior_midi: i32,
    seed: u32,
    elapsed_frames: u32,
    jet_write: usize,
    mouth_pressure_pa: f64,
    prior_edge_flow: f64,
    foot_reflection: f64,
    radiation_lowpass: f64,
    radiation_lowpass2: f64,
    radiation_lowpass3: f64,
    noise_lowpass: f64,
    noise_highpass: f64,
    noise_meander_high: f64,
    radiation_tilt_input: f64,
    radiation_tilt_output: f64,
    vibrato_sin: f64,
    vibrato_cos: f64,
    hole_flow: [f64; HOLES],
    hole_radiation: [f64; HOLES],
    embouchure_radiation: f64,
    dc_input: f64,
    dc_output: f64,
    feedback_dc_input: f64,
    feedback_dc_output: f64,
    feedback_dc_input2: f64,
    feedback_dc_output2: f64,
    forward_fractional_input: [f64; SEGMENTS],
    forward_fractional_output: [f64; SEGMENTS],
    backward_fractional_input: [f64; SEGMENTS],
    backward_fractional_output: [f64; SEGMENTS],
}

impl PhraseState {
    fn at_rest(midi: i32, velocity: i32, sample_rate: f32) -> Self {
        Self {
            prior_midi: midi,
            seed: 0x464c_5432
                ^ ((midi as u32) << 16)
                ^ ((velocity as u32) << 8)
                ^ sample_rate as u32,
            elapsed_frames: 0,
            jet_write: 0,
            mouth_pressure_pa: 0.0,
            prior_edge_flow: 0.0,
            foot_reflection: 0.0,
            radiation_lowpass: 0.0,
            radiation_lowpass2: 0.0,
            radiation_lowpass3: 0.0,
            noise_lowpass: 0.0,
            noise_highpass: 0.0,
            noise_meander_high: 0.0,
            radiation_tilt_input: 0.0,
            radiation_tilt_output: 0.0,
            vibrato_sin: 0.0,
            vibrato_cos: 1.0,
            hole_flow: [0.0; HOLES],
            hole_radiation: [0.0; HOLES],
            embouchure_radiation: 0.0,
            dc_input: 0.0,
            dc_output: 0.0,
            feedback_dc_input: 0.0,
            feedback_dc_output: 0.0,
            feedback_dc_input2: 0.0,
            feedback_dc_output2: 0.0,
            forward_fractional_input: [0.0; SEGMENTS],
            forward_fractional_output: [0.0; SEGMENTS],
            backward_fractional_input: [0.0; SEGMENTS],
            backward_fractional_output: [0.0; SEGMENTS],
        }
    }
}

#[derive(Clone, Copy)]
struct RenderLaw {
    jet_delay_scale: f64,
    resonator_enabled: bool,
}

const PHYSICAL_RENDER_LAW: RenderLaw = RenderLaw {
    jet_delay_scale: 1.0,
    resonator_enabled: true,
};

fn bore_radius_at(position_m: f64) -> f64 {
    for index in 0..SEGMENTS {
        if position_m <= SECTION_END_M[index] {
            return SECTION_RADIUS_M[index];
        }
    }
    SECTION_RADIUS_M[SEGMENTS - 1]
}

fn segment_layout(sample_rate: f64) -> Option<SegmentLayout> {
    if !(8_000.0..=MAX_SAMPLE_RATE_HZ).contains(&sample_rate) {
        return None;
    }
    let mut offsets = [0usize; SEGMENTS];
    let mut capacities = [0usize; SEGMENTS];
    let mut delays = [0.0f64; SEGMENTS];
    let mut losses = [0.0f64; SEGMENTS];
    let mut admittances = [0.0f64; SEGMENTS];
    let mut start_m = 0.0;
    let mut total = 0usize;
    for segment in 0..SEGMENTS {
        let distance_m = PATH_END_M[segment] - start_m;
        let delay = distance_m * sample_rate / SOUND_SPEED_M_PER_S;
        if !delay.is_finite() || delay < 1.0 {
            return None;
        }
        let capacity = libm::ceil(delay) as usize + 1;
        let next_total = total.checked_add(capacity)?;
        if next_total > MAX_WAVE_SAMPLES {
            return None;
        }
        offsets[segment] = total;
        capacities[segment] = capacity;
        delays[segment] = delay;
        // Convex fractional-delay interpolation and this positive loss are
        // both contractions.  The coefficient is per physical metre.
        losses[segment] = exp(-0.075 * distance_m);
        let midpoint = 0.5 * (start_m + PATH_END_M[segment]);
        let radius = bore_radius_at(midpoint);
        let area = core::f64::consts::PI * radius * radius;
        admittances[segment] = area / (AIR_DENSITY_KG_PER_M3 * SOUND_SPEED_M_PER_S);
        total = next_total;
        start_m = PATH_END_M[segment];
    }
    Some(SegmentLayout {
        offsets,
        capacities,
        delays,
        losses,
        admittances,
        total_samples: total,
    })
}

fn fingering_for_midi(midi: i32) -> Option<Fingering> {
    if !(60..=96).contains(&midi) {
        return None;
    }
    let octave = ((midi - 60) / 12) as usize;
    let register_harmonic = 1usize.checked_shl(octave as u32)?;
    let pitch_class = (midi - 60).rem_euclid(12);
    // A fixed keywork table.  Partial vents are physical key apertures; they
    // scale shunt inertance and never interpolate a target delay or frequency.
    let openness = match pitch_class {
        0 => [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        1 => [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.38],
        2 => [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.72],
        3 => [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0],
        4 => [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.50, 1.0],
        5 => [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0],
        6 => [0.0, 0.0, 0.0, 0.0, 0.0, 0.52, 1.0, 1.0],
        7 if octave >= 1 => [0.0, 0.0, 0.0, 0.0, 0.10, 1.0, 1.0, 1.0],
        7 => [0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0],
        8 => [0.0, 0.0, 0.0, 0.0, 0.55, 1.0, 1.0, 1.0],
        9 => [0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0],
        10 => [0.0, 0.0, 0.0, 0.78, 1.0, 1.0, 1.0, 1.0],
        11 => [0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0, 1.0],
        _ => return None,
    };
    Some(Fingering {
        openness,
        register_harmonic,
        chimney_scale: {
            let probe = unsafe { FLT2_CHIMNEY_PROBE };
            if probe > 0.0 {
                probe
            } else {
                FINGERING_CHIMNEY_SCALE[octave][pitch_class as usize]
            }
        },
    })
}

fn geometry_fundamental_hz(fingering: Fingering) -> f64 {
    let first_vent = fingering
        .openness
        .iter()
        .position(|openness| *openness > 0.0);
    let effective_length = first_vent.map_or(BORE_LENGTH_M, |index| {
        let position = HOLE_POSITION_M[index];
        let openness = fingering.openness[index];
        if openness >= 0.95 {
            position
        } else {
            let downstream = ((index + 1)..HOLES)
                .find(|next| fingering.openness[*next] >= 0.95)
                .map_or(BORE_LENGTH_M, |next| HOLE_POSITION_M[next]);
            // Compact-limit interpolation of an incompletely vented shunt:
            // closed tends to the next downstream radiator, open tends to
            // this hole. It drives only pressure/register gestures; the bore
            // itself still scatters through the full inertive hole model.
            downstream - openness * (downstream - position)
        }
    });
    SOUND_SPEED_M_PER_S / (2.0 * (effective_length + EMB_END_CORRECTION_M))
}

fn target_mouth_pressure_pa(velocity: i32, fingering: Fingering) -> f64 {
    let velocity_norm = velocity as f64 / 127.0;
    // A half-period hydrodynamic phase is the stable fundamental speaking
    // regime of this edge source.  The required speed is derived from the
    // first open aperture and register gesture, never from requested MIDI.
    let geometry_hz = geometry_fundamental_hz(fingering) * fingering.register_harmonic as f64;
    let has_open_hole = fingering.openness.iter().any(|openness| *openness >= 0.95);
    let convection_phase = if fingering.register_harmonic == 2
        && fingering.openness[4] > 0.0
        && fingering.openness[4] < 0.2
    {
        5.84
    } else if has_open_hole {
        5.9
    } else if fingering.register_harmonic >= 4 {
        4.82
    } else if fingering.register_harmonic == 2 {
        4.96
    } else {
        5.0
    };
    let nominal_speed = convection_phase * EMB_CHANNEL_TO_EDGE_M * geometry_hz;
    // Players compensate steady blowing-pressure changes with the lips. Note
    // velocity therefore changes aperture, transient, radiation corner, and
    // turbulence below, while the settled convective register stays fixed.
    let speed_factor = if fingering.register_harmonic == 1 {
        0.995
    } else {
        let dynamic_lift = ((velocity_norm - 36.0 / 127.0) / (36.0 / 127.0)).clamp(0.0, 1.0);
        0.993 + 0.045 * dynamic_lift
    };
    let expressive_speed = nominal_speed * speed_factor;
    (0.5 * AIR_DENSITY_KG_PER_M3 * expressive_speed * expressive_speed).min(1_950.0)
}

fn jet_speed_m_per_s(pressure_pa: f64) -> f64 {
    if pressure_pa <= 0.0 {
        0.0
    } else {
        sqrt(2.0 * pressure_pa / AIR_DENSITY_KG_PER_M3)
    }
}

fn jet_convection_seconds(jet_speed_m_per_s: f64) -> Option<f64> {
    jet_convection_seconds_for_channel(EMB_CHANNEL_TO_EDGE_M, jet_speed_m_per_s)
}

fn jet_convection_seconds_for_channel(
    channel_to_edge_m: f64,
    jet_speed_m_per_s: f64,
) -> Option<f64> {
    if !jet_speed_m_per_s.is_finite() || jet_speed_m_per_s <= 0.0 {
        None
    } else if !channel_to_edge_m.is_finite() || channel_to_edge_m <= 0.0 {
        None
    } else {
        Some(channel_to_edge_m / (0.4 * jet_speed_m_per_s))
    }
}

fn ring_at_back(storage: &[f64], offset: usize, capacity: usize, write: usize, back: usize) -> f64 {
    let wrapped = (write + capacity - back % capacity) % capacity;
    storage[offset + wrapped]
}

fn delayed_sample(
    storage: &[f64],
    offset: usize,
    capacity: usize,
    write: usize,
    delay: f64,
) -> f64 {
    let lower = libm::floor(delay) as usize;
    let fraction = delay - lower as f64;
    let recent = ring_at_back(storage, offset, capacity, write, lower);
    let older = ring_at_back(storage, offset, capacity, write, lower + 1);
    recent + fraction * (older - recent)
}

fn delayed_bore_sample(
    storage: &[f64],
    offset: usize,
    capacity: usize,
    write: usize,
    delay: f64,
    prior_input: &mut f64,
    prior_output: &mut f64,
) -> f64 {
    let integer_delay = libm::floor(delay) as usize;
    let fraction = delay - integer_delay as f64;
    let input = ring_at_back(storage, offset, capacity, write, integer_delay);
    // First-order Thiran fractional delay: exact unit magnitude, stable for
    // 0 <= fraction < 1, and therefore non-amplifying inside the passive bore.
    let coefficient = (1.0 - fraction) / (1.0 + fraction);
    let output = coefficient * input + *prior_input - coefficient * *prior_output;
    *prior_input = input;
    *prior_output = if output.abs() < 1.0e-30 { 0.0 } else { output };
    *prior_output
}

fn push_segment(
    storage: &mut [f64],
    offset: usize,
    capacity: usize,
    write: &mut usize,
    value: f64,
) {
    storage[offset + *write] = value;
    *write += 1;
    if *write == capacity {
        *write = 0;
    }
}

fn variable_jet_read(history: &[f64], write: usize, delay_samples: f64) -> f64 {
    let delay = delay_samples.clamp(1.0, (MAX_JET_HISTORY - 2) as f64);
    delayed_sample(history, 0, MAX_JET_HISTORY, write, delay)
}

fn passive_junction(
    from_left: f64,
    from_right: f64,
    left_admittance: f64,
    right_admittance: f64,
    shunt_conductance: f64,
    shunt_history_flow: f64,
) -> (f64, f64, f64) {
    let total = left_admittance + right_admittance + shunt_conductance;
    let pressure = (2.0 * left_admittance * from_left + 2.0 * right_admittance * from_right
        - shunt_history_flow)
        / total;
    (pressure - from_right, pressure - from_left, pressure)
}

fn hole_effective_length_m(hole: usize, openness: f64, chimney_scale: f64) -> f64 {
    let radius = HOLE_RADIUS_M[hole];
    let partial_key_path = if openness > 0.0 && openness < 0.95 {
        (1.0 - openness) * HOLE_KEY_CUP_PATH_M[hole]
    } else {
        0.0
    };
    chimney_scale * (HOLE_CHIMNEY_M[hole] + 0.6133 * radius + partial_key_path)
}

fn hole_branch_step(
    hole: usize,
    openness: f64,
    chimney_scale: f64,
    pressure: f64,
    prior_flow: f64,
    sample_rate: f64,
) -> (f64, f64, f64) {
    if openness <= 0.0 {
        return (0.0, prior_flow * 0.5, 0.0);
    }
    let radius = HOLE_RADIUS_M[hole];
    let area = core::f64::consts::PI * radius * radius;
    // Compact-limit, unflanged aperture correction.  FrankenSim's fs-bem
    // closed-body pilot independently recovered the same added-mass regime;
    // it is an offline authority, not a runtime dependency.
    let effective_length = hole_effective_length_m(hole, openness, chimney_scale);
    let aperture = openness * openness;
    let mass = AIR_DENSITY_KG_PER_M3 * effective_length / (area * aperture);
    let resistance = 0.018 * AIR_DENSITY_KG_PER_M3 * SOUND_SPEED_M_PER_S / (area * aperture);
    let mass_rate = mass * sample_rate;
    let denominator = mass_rate + resistance;
    let conductance = 1.0 / denominator;
    let history = mass_rate / denominator * prior_flow;
    let flow = conductance * pressure + history;
    let radiated_power_wave = sqrt(resistance) * flow;
    (conductance, flow, radiated_power_wave)
}

fn read_u32(bytes: &[u8], offset: usize) -> Option<u32> {
    let value = bytes.get(offset..offset + 4)?;
    Some(u32::from_le_bytes([value[0], value[1], value[2], value[3]]))
}

fn read_f64(bytes: &[u8], offset: usize) -> Option<f64> {
    let value = bytes.get(offset..offset + 8)?;
    let result = f64::from_le_bytes([
        value[0], value[1], value[2], value[3], value[4], value[5], value[6], value[7],
    ]);
    result.is_finite().then_some(result)
}

fn write_u32(bytes: &mut [u8], offset: usize, value: u32) -> bool {
    let Some(target) = bytes.get_mut(offset..offset + 4) else {
        return false;
    };
    target.copy_from_slice(&value.to_le_bytes());
    true
}

fn write_f64(bytes: &mut [u8], offset: usize, value: f64) -> bool {
    if !value.is_finite() {
        return false;
    }
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

fn encode_state(
    bytes: &mut [u8],
    sample_rate: f32,
    layout: SegmentLayout,
    state: PhraseState,
    forward: &[f64],
    backward: &[f64],
    writes: &[usize; SEGMENTS],
    jet: &[f64; MAX_JET_HISTORY],
) -> Option<usize> {
    let payload_samples = 2 * layout.total_samples + MAX_JET_HISTORY;
    let total_bytes = STATE_HEADER_BYTES
        .checked_add(STATE_SCALAR_BYTES)?
        .checked_add(payload_samples.checked_mul(8)?)?;
    if bytes.len() < total_bytes || total_bytes > STATE_MAX_BYTES {
        return None;
    }
    bytes[..total_bytes].fill(0);
    for (offset, value) in [
        (0, STATE_MAGIC),
        (4, STATE_VERSION),
        (8, sample_rate.to_bits()),
        (12, layout.total_samples as u32),
        (16, state.seed),
        (20, state.elapsed_frames),
        (24, state.prior_midi as u32),
        (28, state.jet_write as u32),
        (32, STATE_SCALAR_COUNT as u32),
        (36, payload_samples as u32),
        (40, total_bytes as u32),
    ] {
        if !write_u32(bytes, offset, value) {
            return None;
        }
    }
    let mut scalars = [0.0; STATE_SCALAR_COUNT];
    scalars[0] = state.mouth_pressure_pa;
    scalars[1] = state.prior_edge_flow;
    scalars[2] = state.foot_reflection;
    scalars[3] = state.radiation_lowpass;
    scalars[4] = state.noise_lowpass;
    scalars[5] = state.noise_highpass;
    scalars[6] = state.vibrato_sin;
    scalars[7] = state.vibrato_cos;
    scalars[8..16].copy_from_slice(&state.hole_flow);
    scalars[16..24].copy_from_slice(&state.hole_radiation);
    scalars[24] = state.embouchure_radiation;
    scalars[25] = state.dc_input;
    scalars[26] = state.dc_output;
    scalars[27] = EMB_END_CORRECTION_M;
    scalars[28] = state.feedback_dc_input;
    scalars[29] = state.feedback_dc_output;
    scalars[30..39].copy_from_slice(&state.forward_fractional_input);
    scalars[39..48].copy_from_slice(&state.forward_fractional_output);
    scalars[48..57].copy_from_slice(&state.backward_fractional_input);
    scalars[57..66].copy_from_slice(&state.backward_fractional_output);
    scalars[66] = state.radiation_lowpass2;
    scalars[67] = state.radiation_lowpass3;
    scalars[68] = state.noise_meander_high;
    scalars[69] = state.radiation_tilt_input;
    scalars[70] = state.radiation_tilt_output;
    scalars[71] = state.feedback_dc_input2;
    scalars[72] = state.feedback_dc_output2;
    for (index, value) in scalars.iter().enumerate() {
        if !write_f64(bytes, STATE_HEADER_BYTES + index * 8, *value) {
            return None;
        }
    }
    let mut cursor = STATE_HEADER_BYTES + STATE_SCALAR_BYTES;
    for source in [forward, backward] {
        for segment in 0..SEGMENTS {
            let offset = layout.offsets[segment];
            let capacity = layout.capacities[segment];
            for index in 0..capacity {
                let value = source[offset + (writes[segment] + index) % capacity];
                if !write_f64(bytes, cursor, value) {
                    return None;
                }
                cursor += 8;
            }
        }
    }
    for index in 0..MAX_JET_HISTORY {
        if !write_f64(
            bytes,
            cursor,
            jet[(state.jet_write + index) % MAX_JET_HISTORY],
        ) {
            return None;
        }
        cursor += 8;
    }
    Some(total_bytes)
}

fn decode_state(
    bytes: &[u8],
    sample_rate: f32,
    layout: SegmentLayout,
    forward: &mut [f64],
    backward: &mut [f64],
    jet: &mut [f64; MAX_JET_HISTORY],
) -> Option<PhraseState> {
    if read_u32(bytes, 0)? != STATE_MAGIC
        || read_u32(bytes, 4)? != STATE_VERSION
        || read_u32(bytes, 8)? != sample_rate.to_bits()
        || read_u32(bytes, 12)? as usize != layout.total_samples
        || read_u32(bytes, 32)? as usize != STATE_SCALAR_COUNT
    {
        return None;
    }
    let payload_samples = 2 * layout.total_samples + MAX_JET_HISTORY;
    let expected_bytes = STATE_HEADER_BYTES + STATE_SCALAR_BYTES + payload_samples * 8;
    if read_u32(bytes, 36)? as usize != payload_samples
        || read_u32(bytes, 40)? as usize != expected_bytes
        || bytes.len() != expected_bytes
    {
        return None;
    }
    let mut scalars = [0.0; STATE_SCALAR_COUNT];
    for (index, value) in scalars.iter_mut().enumerate() {
        *value = read_f64(bytes, STATE_HEADER_BYTES + index * 8)?;
    }
    if (scalars[27] - EMB_END_CORRECTION_M).abs() > 1.0e-15 {
        return None;
    }
    let mut cursor = STATE_HEADER_BYTES + STATE_SCALAR_BYTES;
    for target in [forward, backward] {
        for value in target[..layout.total_samples].iter_mut() {
            *value = read_f64(bytes, cursor)?;
            cursor += 8;
        }
    }
    for value in jet.iter_mut() {
        *value = read_f64(bytes, cursor)?;
        cursor += 8;
    }
    let mut state = PhraseState {
        prior_midi: read_u32(bytes, 24)? as i32,
        seed: read_u32(bytes, 16)?,
        elapsed_frames: read_u32(bytes, 20)?,
        jet_write: 0,
        mouth_pressure_pa: scalars[0],
        prior_edge_flow: scalars[1],
        foot_reflection: scalars[2],
        radiation_lowpass: scalars[3],
        radiation_lowpass2: scalars[66],
        radiation_lowpass3: scalars[67],
        noise_lowpass: scalars[4],
        noise_highpass: scalars[5],
        noise_meander_high: scalars[68],
        radiation_tilt_input: scalars[69],
        radiation_tilt_output: scalars[70],
        vibrato_sin: scalars[6],
        vibrato_cos: scalars[7],
        hole_flow: [0.0; HOLES],
        hole_radiation: [0.0; HOLES],
        embouchure_radiation: scalars[24],
        dc_input: scalars[25],
        dc_output: scalars[26],
        feedback_dc_input: scalars[28],
        feedback_dc_output: scalars[29],
        feedback_dc_input2: scalars[71],
        feedback_dc_output2: scalars[72],
        forward_fractional_input: [0.0; SEGMENTS],
        forward_fractional_output: [0.0; SEGMENTS],
        backward_fractional_input: [0.0; SEGMENTS],
        backward_fractional_output: [0.0; SEGMENTS],
    };
    state.hole_flow.copy_from_slice(&scalars[8..16]);
    state.hole_radiation.copy_from_slice(&scalars[16..24]);
    state
        .forward_fractional_input
        .copy_from_slice(&scalars[30..39]);
    state
        .forward_fractional_output
        .copy_from_slice(&scalars[39..48]);
    state
        .backward_fractional_input
        .copy_from_slice(&scalars[48..57]);
    state
        .backward_fractional_output
        .copy_from_slice(&scalars[57..66]);
    Some(state)
}

#[allow(clippy::too_many_arguments)]
fn render_with_storage(
    midi: i32,
    velocity: i32,
    sample_rate: f32,
    variation_slot: u32,
    articulation: u32,
    out_left: &mut [f32],
    out_right: &mut [f32],
    state_input: Option<&[u8]>,
    mut state_output: Option<(&mut [u8], &mut usize)>,
    forward: &mut [f64; MAX_WAVE_SAMPLES],
    backward: &mut [f64; MAX_WAVE_SAMPLES],
    forward_next: &mut [f64; MAX_WAVE_SAMPLES],
    backward_next: &mut [f64; MAX_WAVE_SAMPLES],
    jet_history: &mut [f64; MAX_JET_HISTORY],
    law: RenderLaw,
) -> usize {
    if !(1..=127).contains(&velocity)
        || variation_slot >= 8
        || articulation > 1
        || out_left.is_empty()
        || out_left.len() != out_right.len()
        || !law.jet_delay_scale.is_finite()
        || law.jet_delay_scale <= 0.0
    {
        return 0;
    }
    let Some(layout) = segment_layout(sample_rate as f64) else {
        return 0;
    };
    let Some(fingering) = fingering_for_midi(midi) else {
        return 0;
    };
    forward[..layout.total_samples].fill(0.0);
    backward[..layout.total_samples].fill(0.0);
    forward_next[..layout.total_samples].fill(0.0);
    backward_next[..layout.total_samples].fill(0.0);
    jet_history.fill(0.0);
    let mut state = match state_input {
        Some(bytes) => {
            match decode_state(bytes, sample_rate, layout, forward, backward, jet_history) {
                Some(value) => value,
                None => return 0,
            }
        }
        None => PhraseState::at_rest(midi, velocity, sample_rate),
    };
    let mut writes = [0usize; SEGMENTS];
    let mut next_writes = [0usize; SEGMENTS];
    let sr = sample_rate as f64;
    let target_pressure = target_mouth_pressure_pa(velocity, fingering);
    let attack_seconds = if state_input.is_some() {
        0.018
    } else if articulation == 1 {
        0.046
    } else {
        0.085
    };
    let pressure_alpha = 1.0 - exp(-1.0 / (attack_seconds * sr));
    let tongue_hold = if articulation == 1 && state_input.is_none() {
        (0.006 * sr) as usize
    } else {
        0
    };
    let tongue_release = (0.010 * sr) as usize;
    let register = log2(fingering.register_harmonic as f64).max(0.0);
    let embouchure_opening = 0.55 + 0.45 * velocity as f64 / 127.0;
    let has_open_hole = fingering.openness.iter().any(|openness| *openness >= 0.95);
    let has_partial_vent = fingering
        .openness
        .iter()
        .any(|openness| *openness > 0.0 && *openness < 0.95);
    // A flutist offsets the jet farther across the labium against a closed
    // load, and also for a soft partially vented fingering whose returning
    // pressure is weak. This is an embouchure gesture; bore geometry and all
    // propagation delays remain fixed.
    let across_labium = !has_open_hole || (velocity < 50 && has_partial_vent);
    let jet_offset = if across_labium {
        0.90 + 0.06 * register
    } else {
        0.35 + 0.10 * register
    };
    let feedback_gain = (if has_open_hole {
        18.0 + register
    } else {
        5.2 + 2.0 * register
    }) / embouchure_opening;
    let source_gain = (if has_open_hole { 0.85 } else { 0.50 })
        / (embouchure_opening * sqrt(sqrt(fingering.register_harmonic as f64)));
    let vented_area = fingering
        .openness
        .iter()
        .map(|openness| openness * openness)
        .sum::<f64>();
    let dynamic_lift = ((velocity as f64 - 36.0) / 36.0).clamp(0.0, 1.0);
    let nonlinear_drive = if vented_area > 0.0 {
        1.5 + 0.4 * dynamic_lift * (2.0 - vented_area).clamp(0.0, 1.0)
    } else {
        1.7
    };
    let lattice_nonlinear_loss = if vented_area > 2.0 { 0.35 } else { 0.20 };
    let nonlinear_edge_gain = nonlinear_drive
        / (1.0 + lattice_nonlinear_loss * vented_area * vented_area * vented_area * vented_area);
    let growth = exp(80.0 * EMB_CHANNEL_TO_EDGE_M);
    let vibrato_hz = 5.0 * (0.97 + 0.01 * variation_slot as f64);
    let vibrato_depth = 0.012 + 0.002 * variation_slot as f64 / 7.0;
    let vibrato_step = TAU * vibrato_hz / sr;
    let vibrato_step_sin = sin(vibrato_step);
    let vibrato_step_cos = cos(vibrato_step);
    // The turbulent sheet spans the audible breath band, but reaches the
    // listener only through the jet/edge and passive radiators below.
    let noise_low_alpha = 1.0 - exp(-TAU * 120.0 / sr);
    let noise_high_alpha = 1.0 - exp(-TAU * 6_500.0 / sr);
    let noise_meander_alpha = 1.0 - exp(-TAU * 350.0 / sr);
    let base_radiation_corner_hz = 1_400.0 + 2_200.0 * velocity as f64 / 127.0;
    // The long, closed air column radiates at the broad foot opening. Once a
    // tone hole vents the column, its smaller first-open aperture and the
    // downstream lattice limit the coherent jet spectrum most strongly for a
    // soft, narrow embouchure. The factor is bounded and only dissipative.
    let radiator_factor = if has_open_hole {
        let downstream_lattice_loading = 1.0 / (1.0 + 0.45 * (vented_area - 3.2).max(0.0));
        (0.42 + 0.68 * velocity as f64 / 127.0) * downstream_lattice_loading
    } else {
        1.50
    };
    let radiation_corner_hz = base_radiation_corner_hz * radiator_factor;
    let radiation_alpha = 1.0 - exp(-TAU * radiation_corner_hz / sr);
    let embouchure_radiation_gain = if has_open_hole { 0.010 } else { 0.025 };
    let foot_alpha = 1.0 - exp(-TAU * 4_200.0 / sr);
    let dc_pole = exp(-TAU * 24.0 / sr);
    let radiation_tilt_pole = exp(-TAU * 900.0 / sr);
    // The embouchure inertance is the register-selecting high-pass in the
    // return path: a tighter, faster jet rejects the lower bore modes while
    // leaving the selected overblown resonance in the feedback loop. Its
    // corner is derived from the fixed air-column geometry and register
    // gesture, not from the requested MIDI frequency.
    let feedback_highpass_hz = if fingering.register_harmonic == 1 {
        70.0
    } else {
        geometry_fundamental_hz(fingering) * (fingering.register_harmonic as f64 - 0.75)
    };
    let feedback_dc_pole = exp(-TAU * feedback_highpass_hz / sr);
    // Jet spatial-growth selectivity (Rayleigh instability): the jet's
    // convective amplification is band-limited around the operating
    // Strouhal point, falling toward both DC and high frequency. The model
    // previously amplified every frequency equally, so the bore's strongest
    // resonance (always the fundamental) captured the regime and overblown
    // registers locked one or two octaves low regardless of return-path
    // filtering (measured 2026-08-07, calibration passes 1-3). A unity-peak
    // resonant band-pass on the jet perturbation, centred on the fixed
    // geometry/register target (never the requested MIDI), realises the
    // measured selectivity. Register 1 bypasses it bit-identically.
    let (jet_bp_b0, jet_bp_a1, jet_bp_a2) = if fingering.register_harmonic >= 2 {
        let f_target = geometry_fundamental_hz(fingering) * fingering.register_harmonic as f64;
        let omega = (TAU * f_target / sr).min(3.0);
        let quality = 1.3;
        let alpha = sin(omega) / (2.0 * quality);
        let a0 = 1.0 + alpha;
        (alpha / a0, -2.0 * cos(omega) / a0, (1.0 - alpha) / a0)
    } else {
        (0.0, 0.0, 0.0)
    };
    let mut rng = XorShift32::new(state.seed);

    for frame in 0..out_left.len() {
        let tongue_opening = if frame < tongue_hold {
            0.0
        } else if frame < tongue_hold + tongue_release {
            let phase = (frame - tongue_hold) as f64 / tongue_release.max(1) as f64;
            phase * phase * (3.0 - 2.0 * phase)
        } else {
            1.0
        };
        state.mouth_pressure_pa +=
            pressure_alpha * (target_pressure * tongue_opening - state.mouth_pressure_pa);
        let vibrato_onset =
            ((state.elapsed_frames as f64 + frame as f64) / sr - 0.28).clamp(0.0, 0.25) / 0.25;
        let vibrato = 1.0 + vibrato_depth * vibrato_onset * state.vibrato_sin;
        let pressure = (state.mouth_pressure_pa * vibrato).clamp(0.0, 2_000.0);
        let jet_speed = jet_speed_m_per_s(pressure);
        let breath_norm = jet_speed / 60.0;

        let mut forward_out = [0.0; SEGMENTS];
        let mut backward_out = [0.0; SEGMENTS];
        for segment in 0..SEGMENTS {
            let offset = layout.offsets[segment];
            let capacity = layout.capacities[segment];
            forward_out[segment] = layout.losses[segment]
                * delayed_bore_sample(
                    forward,
                    offset,
                    capacity,
                    writes[segment],
                    layout.delays[segment],
                    &mut state.forward_fractional_input[segment],
                    &mut state.forward_fractional_output[segment],
                );
            backward_out[segment] = layout.losses[segment]
                * delayed_bore_sample(
                    backward,
                    offset,
                    capacity,
                    writes[segment],
                    layout.delays[segment],
                    &mut state.backward_fractional_input[segment],
                    &mut state.backward_fractional_output[segment],
                );
        }

        let bore_return = backward_out[0];
        let filtered_return =
            bore_return - state.feedback_dc_input + feedback_dc_pole * state.feedback_dc_output;
        state.feedback_dc_input = bore_return;
        state.feedback_dc_output = filtered_return;
        let acoustic_return = if law.resonator_enabled {
            filtered_return
        } else {
            0.0
        };
        let noise = rng.bipolar();
        state.noise_lowpass += noise_low_alpha * (noise - state.noise_lowpass);
        state.noise_highpass += noise_high_alpha * (noise - state.noise_highpass);
        state.noise_meander_high += noise_meander_alpha * (noise - state.noise_meander_high);
        let band_noise = state.noise_highpass - state.noise_lowpass;
        let jet_meander = state.noise_meander_high - state.noise_lowpass;
        let turbulence = 0.003 * band_noise;
        jet_history[state.jet_write] = feedback_gain * acoustic_return + turbulence;
        let delay_samples =
            jet_convection_seconds(jet_speed.max(1.0)).unwrap_or(0.0) * sr * law.jet_delay_scale;
        let raw_delayed_jet = variable_jet_read(jet_history, state.jet_write, delay_samples);
        let delayed_jet = if fingering.register_harmonic >= 2 {
            // Constant-peak-gain band-pass, transposed direct form II.
            let y = jet_bp_b0 * raw_delayed_jet + state.feedback_dc_input2;
            state.feedback_dc_input2 =
                -jet_bp_a1 * y + state.feedback_dc_output2;
            state.feedback_dc_output2 = -jet_bp_b0 * raw_delayed_jet - jet_bp_a2 * y;
            y
        } else {
            raw_delayed_jet
        };
        state.jet_write += 1;
        if state.jet_write == MAX_JET_HISTORY {
            state.jet_write = 0;
        }
        let displacement_scale_m = EMB_JET_HALF_WIDTH_M * (1.0 + 0.20 * breath_norm);
        let edge_displacement_m = EMB_JET_HALF_WIDTH_M * (jet_offset + growth * delayed_jet);
        let reference_displacement_m = EMB_JET_HALF_WIDTH_M * jet_offset;
        let edge_fraction = tanh(edge_displacement_m / displacement_scale_m);
        let reference_fraction = tanh(reference_displacement_m / displacement_scale_m);
        let edge_flow = embouchure_opening * breath_norm * (edge_fraction - reference_fraction);
        let prior_edge_flow = state.prior_edge_flow;
        let edge_derivative = (edge_flow - prior_edge_flow) * sr;
        let quadratic_edge_derivative =
            (edge_flow * edge_flow - prior_edge_flow * prior_edge_flow) * sr;
        state.prior_edge_flow = edge_flow;
        // The labium pressure drop is Bernoulli-quadratic around the mean
        // outward jet. Keeping the second-order term is what lets an
        // open-open flute excite its even bore modes instead of collapsing
        // toward the odd-harmonic signature of a reed pipe.
        let edge_pressure_drive = edge_flow + nonlinear_edge_gain * edge_flow * edge_flow;
        let jet_source = source_gain * edge_pressure_drive;
        let emb_reflection = -0.74 * bore_return;
        let bore_source = if law.resonator_enabled {
            emb_reflection + jet_source
        } else {
            jet_source
        };
        forward_next[layout.offsets[0] + next_writes[0]] = bore_source;

        for hole in 0..HOLES {
            let left_y = layout.admittances[hole];
            let right_y = layout.admittances[hole + 1];
            let openness = fingering.openness[hole];
            let (probe_g, _, _) = hole_branch_step(hole, openness, fingering.chimney_scale, 0.0, state.hole_flow[hole], sr);
            let aperture = openness * openness;
            let radius = HOLE_RADIUS_M[hole];
            let area = core::f64::consts::PI * radius * radius;
            let effective_length = hole_effective_length_m(hole, openness, fingering.chimney_scale);
            let mass = if aperture > 0.0 {
                AIR_DENSITY_KG_PER_M3 * effective_length / (area * aperture)
            } else {
                1.0
            };
            let resistance = if aperture > 0.0 {
                0.018 * AIR_DENSITY_KG_PER_M3 * SOUND_SPEED_M_PER_S / (area * aperture)
            } else {
                0.0
            };
            let mass_rate = mass * sr;
            let history = if aperture > 0.0 {
                mass_rate / (mass_rate + resistance) * state.hole_flow[hole]
            } else {
                0.0
            };
            let (toward_right, toward_left, pressure_at_hole) = passive_junction(
                forward_out[hole],
                backward_out[hole + 1],
                left_y,
                right_y,
                probe_g,
                history,
            );
            let (_, flow, radiated) =
                hole_branch_step(hole, openness, fingering.chimney_scale, pressure_at_hole, state.hole_flow[hole], sr);
            state.hole_flow[hole] = flow;
            state.hole_radiation[hole] += radiation_alpha * (radiated - state.hole_radiation[hole]);
            forward_next[layout.offsets[hole + 1] + next_writes[hole + 1]] = toward_right;
            backward_next[layout.offsets[hole] + next_writes[hole]] = toward_left;
        }

        let foot_incident = forward_out[SEGMENTS - 1];
        state.foot_reflection += foot_alpha * (-0.94 * foot_incident - state.foot_reflection);
        backward_next[layout.offsets[SEGMENTS - 1] + next_writes[SEGMENTS - 1]] =
            state.foot_reflection;

        for segment in 0..SEGMENTS {
            let offset = layout.offsets[segment];
            let capacity = layout.capacities[segment];
            let forward_value = forward_next[offset + next_writes[segment]];
            let backward_value = backward_next[offset + next_writes[segment]];
            push_segment(
                forward,
                offset,
                capacity,
                &mut writes[segment],
                forward_value,
            );
            let mut backward_write = writes[segment];
            // `writes` was advanced by the forward push.  Move the backward
            // ring at the same old slot so both directions share one phase.
            backward_write = if backward_write == 0 {
                capacity - 1
            } else {
                backward_write - 1
            };
            backward[offset + backward_write] = backward_value;
            next_writes[segment] = writes[segment];
        }

        let mut hole_field = 0.0;
        for hole in 0..HOLES {
            hole_field += state.hole_radiation[hole] * (1.0 - 0.035 * hole as f64);
        }
        let foot_field = foot_incident - state.foot_reflection;
        let edge_dipole = (edge_derivative + 2.0 * quadratic_edge_derivative) * 0.000_002;
        // Large eddies in the mean jet create a bounded labium dipole. It is
        // strongest against the closed long-tube load and reaches the output
        // only through the same passive radiation cascade as the bore field.
        let turbulent_edge_dipole = if has_open_hole {
            0.0
        } else {
            // A slower pp sheet sheds more coherent large eddies in this low
            // band. As speed rises, breakup shifts turbulent energy upward;
            // the absolute meander still grows through breath and aperture.
            breath_norm * (0.000_8 * band_noise + (0.850 - 0.600 * dynamic_lift) * jet_meander)
        };
        let field = 0.46 * foot_field + 58.0 * hole_field + edge_dipole + turbulent_edge_dipole;
        state.radiation_lowpass += radiation_alpha * (field - state.radiation_lowpass);
        state.radiation_lowpass2 +=
            radiation_alpha * (state.radiation_lowpass - state.radiation_lowpass2);
        state.radiation_lowpass3 +=
            radiation_alpha * (state.radiation_lowpass2 - state.radiation_lowpass3);
        state.embouchure_radiation += radiation_alpha * (edge_dipole - state.embouchure_radiation);
        let dc = state.radiation_lowpass3 - state.dc_input + dc_pole * state.dc_output;
        state.dc_input = state.radiation_lowpass3;
        state.dc_output = if dc.abs() < 1.0e-20 { 0.0 } else { dc };
        let radiation_tilt = radiation_tilt_pole
            * (state.radiation_tilt_output + state.dc_output - state.radiation_tilt_input);
        state.radiation_tilt_input = state.dc_output;
        state.radiation_tilt_output = if radiation_tilt.abs() < 1.0e-20 {
            0.0
        } else {
            radiation_tilt
        };
        // The labium dipole becomes a larger fraction of the closed-column
        // field as the jet opens. This convex high-pass/direct-field blend is
        // passive (never above unity magnitude) and leaves pp unchanged.
        let radiation_tilt_mix = if has_open_hole {
            0.0
        } else {
            0.14 * dynamic_lift
        };
        let radiated_pressure = (1.0 - radiation_tilt_mix) * state.dc_output
            + radiation_tilt_mix * state.radiation_tilt_output;
        let aperture_attack_seconds = if has_open_hole && velocity < 50 {
            0.180
        } else {
            0.080
        };
        let aperture_phase = ((state.elapsed_frames as usize + frame) as f64
            / (aperture_attack_seconds * sr))
            .clamp(0.0, 1.0);
        let aperture_attack = aperture_phase * aperture_phase * (3.0 - 2.0 * aperture_phase);
        let sample = (aperture_attack
            * (1.4 * embouchure_opening * embouchure_opening * radiated_pressure
                + embouchure_radiation_gain * state.embouchure_radiation))
            .clamp(-0.92, 0.92);
        let pan = 0.04 * ((midi - 72) as f64 / 24.0).clamp(-1.0, 1.0);
        let angle = (1.0 + pan) * core::f64::consts::PI / 4.0;
        out_left[frame] = (sample * cos(angle)) as f32;
        out_right[frame] = (sample * sin(angle)) as f32;

        let next_sin = state.vibrato_sin * vibrato_step_cos + state.vibrato_cos * vibrato_step_sin;
        state.vibrato_cos =
            state.vibrato_cos * vibrato_step_cos - state.vibrato_sin * vibrato_step_sin;
        state.vibrato_sin = next_sin;
    }
    state.seed = rng.state;
    state.elapsed_frames = state.elapsed_frames.saturating_add(out_left.len() as u32);
    state.prior_midi = midi;
    if let Some((bytes, written)) = state_output.as_mut() {
        let Some(size) = encode_state(
            bytes,
            sample_rate,
            layout,
            state,
            forward,
            backward,
            &writes,
            jet_history,
        ) else {
            return 0;
        };
        **written = size;
    }
    out_left.len()
}

#[no_mangle]
pub extern "C" fn flt2_note_frames(midi: i32, sample_rate: f32) -> i32 {
    if fingering_for_midi(midi).is_none() || segment_layout(sample_rate as f64).is_none() {
        return 0;
    }
    (CAP_SECONDS * sample_rate as f64) as i32
}

#[no_mangle]
pub extern "C" fn flt2_state_max_bytes() -> i32 {
    STATE_MAX_BYTES as i32
}

#[no_mangle]
pub extern "C" fn flt2_render(
    midi: i32,
    velocity: i32,
    sample_rate: f32,
    variation_slot: u32,
    articulation: u32,
    left: *mut f32,
    right: *mut f32,
    max_frames: i32,
) -> i32 {
    let natural = flt2_note_frames(midi, sample_rate);
    if natural == 0 || max_frames <= 0 || left.is_null() || right.is_null() {
        return 0;
    }
    let frames = natural.min(max_frames) as usize;
    let channel_bytes = match frames.checked_mul(core::mem::size_of::<f32>()) {
        Some(value) => value,
        None => return 0,
    };
    if !disjoint_ranges(left as usize, channel_bytes, right as usize, channel_bytes) {
        return 0;
    }
    let out_left = unsafe { core::slice::from_raw_parts_mut(left, frames) };
    let out_right = unsafe { core::slice::from_raw_parts_mut(right, frames) };
    let forward = unsafe { &mut *core::ptr::addr_of_mut!(FLT2_FORWARD) };
    let backward = unsafe { &mut *core::ptr::addr_of_mut!(FLT2_BACKWARD) };
    let forward_next = unsafe { &mut *core::ptr::addr_of_mut!(FLT2_FORWARD_NEXT) };
    let backward_next = unsafe { &mut *core::ptr::addr_of_mut!(FLT2_BACKWARD_NEXT) };
    let jet = unsafe { &mut *core::ptr::addr_of_mut!(FLT2_JET) };
    render_with_storage(
        midi,
        velocity,
        sample_rate,
        variation_slot,
        articulation,
        out_left,
        out_right,
        None,
        None,
        forward,
        backward,
        forward_next,
        backward_next,
        jet,
        PHYSICAL_RENDER_LAW,
    ) as i32
}

#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn flt2_render_phrase(
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
    let natural = flt2_note_frames(midi, sample_rate);
    if natural == 0
        || max_frames <= 0
        || left.is_null()
        || right.is_null()
        || state_input_bytes < 0
        || state_output_capacity < STATE_HEADER_BYTES as i32
        || state_output.is_null()
        || (state_input_bytes > 0 && state_input.is_null())
        || state_input_bytes as usize > STATE_MAX_BYTES
        || state_output_capacity as usize > STATE_MAX_BYTES
    {
        return 0;
    }
    let frames = natural.min(max_frames) as usize;
    let channel_bytes = match frames.checked_mul(core::mem::size_of::<f32>()) {
        Some(value) => value,
        None => return 0,
    };
    let ranges = [
        (left as usize, channel_bytes),
        (right as usize, channel_bytes),
        (state_output as usize, state_output_capacity as usize),
    ];
    for lhs in 0..ranges.len() {
        for rhs in lhs + 1..ranges.len() {
            if !disjoint_ranges(ranges[lhs].0, ranges[lhs].1, ranges[rhs].0, ranges[rhs].1) {
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
    let out_left = unsafe { core::slice::from_raw_parts_mut(left, frames) };
    let out_right = unsafe { core::slice::from_raw_parts_mut(right, frames) };
    let input = if state_input_bytes == 0 {
        None
    } else {
        Some(unsafe { core::slice::from_raw_parts(state_input, state_input_bytes as usize) })
    };
    let output =
        unsafe { core::slice::from_raw_parts_mut(state_output, state_output_capacity as usize) };
    let forward = unsafe { &mut *core::ptr::addr_of_mut!(FLT2_FORWARD) };
    let backward = unsafe { &mut *core::ptr::addr_of_mut!(FLT2_BACKWARD) };
    let forward_next = unsafe { &mut *core::ptr::addr_of_mut!(FLT2_FORWARD_NEXT) };
    let backward_next = unsafe { &mut *core::ptr::addr_of_mut!(FLT2_BACKWARD_NEXT) };
    let jet = unsafe { &mut *core::ptr::addr_of_mut!(FLT2_JET) };
    let mut written = 0usize;
    let rendered = render_with_storage(
        midi,
        velocity,
        sample_rate,
        variation_slot,
        articulation,
        out_left,
        out_right,
        input,
        Some((output, &mut written)),
        forward,
        backward,
        forward_next,
        backward_next,
        jet,
        PHYSICAL_RENDER_LAW,
    );
    if rendered == 0 || written == 0 {
        0
    } else {
        rendered as i32
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn render_test(midi: i32, velocity: i32, frames: usize, law: RenderLaw) -> (Vec<f32>, Vec<u8>) {
        let mut left = vec![0.0f32; frames];
        let mut right = vec![0.0f32; frames];
        let mut state = vec![0u8; STATE_MAX_BYTES];
        let mut state_bytes = 0usize;
        let mut forward = [0.0; MAX_WAVE_SAMPLES];
        let mut backward = [0.0; MAX_WAVE_SAMPLES];
        let mut forward_next = [0.0; MAX_WAVE_SAMPLES];
        let mut backward_next = [0.0; MAX_WAVE_SAMPLES];
        let mut jet = [0.0; MAX_JET_HISTORY];
        let rendered = render_with_storage(
            midi,
            velocity,
            48_000.0,
            0,
            1,
            &mut left,
            &mut right,
            None,
            Some((&mut state, &mut state_bytes)),
            &mut forward,
            &mut backward,
            &mut forward_next,
            &mut backward_next,
            &mut jet,
            law,
        );
        assert_eq!(rendered, frames);
        state.truncate(state_bytes);
        (left, state)
    }

    fn normalized_autocorrelation(signal: &[f32], lag: usize) -> f64 {
        let mut dot = 0.0;
        let mut left = 0.0;
        let mut right = 0.0;
        for index in lag..signal.len() {
            let a = signal[index] as f64;
            let b = signal[index - lag] as f64;
            dot += a * b;
            left += a * a;
            right += b * b;
        }
        dot / sqrt(left * right).max(1.0e-30)
    }

    fn estimate_pitch(signal: &[f32], sample_rate: f64, expected_hz: f64) -> (f64, f64) {
        let center = sample_rate / expected_hz;
        let low = libm::floor(center * 0.92) as usize;
        let high = libm::ceil(center * 1.08) as usize;
        let mut best_lag = low;
        let mut best = -1.0;
        for lag in low..=high {
            let score = normalized_autocorrelation(signal, lag);
            if score > best {
                best = score;
                best_lag = lag;
            }
        }
        let before = normalized_autocorrelation(signal, best_lag.saturating_sub(1).max(low));
        let after = normalized_autocorrelation(signal, (best_lag + 1).min(high));
        let curvature = before - 2.0 * best + after;
        let adjustment = if curvature.abs() > 1.0e-12 {
            (0.5 * (before - after) / curvature).clamp(-0.5, 0.5)
        } else {
            0.0
        };
        (sample_rate / (best_lag as f64 + adjustment), best)
    }

    fn high_band_proxy(signal: &[f32]) -> f64 {
        let mut total = 0.0;
        let mut high = 0.0;
        for index in 1..signal.len() {
            let sample = signal[index] as f64;
            let previous = signal[index - 1] as f64;
            total += sample * sample;
            let difference = 0.5 * (sample - previous);
            high += difference * difference;
        }
        high / total.max(1.0e-30)
    }

    fn rms(signal: &[f32]) -> f64 {
        sqrt(
            signal
                .iter()
                .map(|sample| (*sample as f64).powi(2))
                .sum::<f64>()
                / signal.len().max(1) as f64,
        )
    }

    #[test]
    fn jet_and_aperture_known_answers_use_si_geometry() {
        let speed = jet_speed_m_per_s(240.82);
        assert!((speed - 20.0).abs() < 1.0e-12);
        let delay = jet_convection_seconds(20.0).unwrap();
        assert!((delay - 0.00125).abs() < 1.0e-12);
        assert!((EMB_END_CORRECTION_M - 0.005092958178940651).abs() < 1.0e-15);

        let quarter_pressure_speed = jet_speed_m_per_s(240.82 / 4.0);
        let quarter_pressure_delay = jet_convection_seconds(quarter_pressure_speed).unwrap();
        assert!((quarter_pressure_delay / delay - 2.0).abs() < 1.0e-12);
        let longer_channel_delay =
            jet_convection_seconds_for_channel(EMB_CHANNEL_TO_EDGE_M * 1.0002, 20.0).unwrap();
        assert!((longer_channel_delay / delay - 1.0002).abs() < 1.0e-12);
        let half_open_e_key = hole_effective_length_m(6, 0.50, 1.0);
        let fully_open_e_key = hole_effective_length_m(6, 1.0, 1.0);
        assert!((half_open_e_key - fully_open_e_key - 0.00004).abs() < 1.0e-15);

        // Planted negative: a pressure-linear delay law has the wrong scaling
        // and must not be able to satisfy the physical square-root relation.
        let wrong_delay = delay * 4.0;
        assert!((wrong_delay / delay - 2.0).abs() > 1.0);
    }

    #[test]
    fn junction_is_energy_passive_and_active_sign_mutation_is_caught() {
        let yl = 0.8;
        let yr = 1.1;
        let yh = 0.35;
        let a = 0.7;
        let b = -0.2;
        let (toward_right, toward_left, pressure) = passive_junction(a, b, yl, yr, yh, 0.0);
        let incoming = yl * a * a + yr * b * b;
        let outgoing = yr * toward_right * toward_right
            + yl * toward_left * toward_left
            + yh * pressure * pressure;
        assert!((incoming - outgoing).abs() < 1.0e-12);

        let active_outgoing = yr * toward_right * toward_right + yl * toward_left * toward_left
            - yh * pressure * pressure;
        assert!((incoming - active_outgoing).abs() > 1.0e-3);
    }

    #[test]
    fn geometry_renderer_phonates_multiple_registers_without_hiss_and_serializes_state() {
        let sample_rate = 48_000.0;
        let frames = 48_000;
        let mut soft_rms = [0.0; 4];
        let mut loud_rms = [0.0; 4];
        for (pitch_index, midi) in [72, 76, 79, 82].into_iter().enumerate() {
            for velocity in [36, 72, 108] {
                let (samples, state) = render_test(midi, velocity, frames, PHYSICAL_RENDER_LAW);
                assert!(samples.iter().all(|sample| sample.is_finite()));
                let peak = samples
                    .iter()
                    .fold(0.0f32, |value, sample| value.max(sample.abs()));
                assert!(peak > 0.002 && peak <= 0.93, "midi {midi} peak {peak}");
                let settled = &samples[16_000..];
                let expected = midi_frequency_hz(midi as f64);
                let (pitch, periodicity) = estimate_pitch(settled, sample_rate, expected);
                let cents = 1_200.0 * log2(pitch / expected);
                assert!(
                    cents.abs() < 15.0,
                    "midi {midi} velocity {velocity} pitch {pitch} ({cents} cents)"
                );
                assert!(
                    periodicity > 0.55,
                    "midi {midi} velocity {velocity} periodicity {periodicity}"
                );
                let high_ratio = high_band_proxy(settled);
                assert!(
                    high_ratio < 0.08,
                    "midi {midi} velocity {velocity} high-band proxy {high_ratio}"
                );
                assert!(state.len() >= STATE_HEADER_BYTES + STATE_SCALAR_BYTES);
                assert!(state.len() <= STATE_MAX_BYTES);
                if velocity == 36 {
                    soft_rms[pitch_index] = rms(settled);
                } else if velocity == 108 {
                    loud_rms[pitch_index] = rms(settled);
                }
            }
        }
        for pitch_index in 0..soft_rms.len() {
            assert!(
                loud_rms[pitch_index] > 1.20 * soft_rms[pitch_index],
                "pitch index {pitch_index}: soft rms {}, loud rms {}",
                soft_rms[pitch_index],
                loud_rms[pitch_index]
            );
        }

        // Boundary registers use the same fixed tube rather than MIDI-tuned
        // delays and retain a looser, still-musical pitch bound.
        for (midi, velocity, pitch_tolerance_cents) in [(60, 48, 20.0), (84, 118, 15.0)] {
            let (samples, state) = render_test(midi, velocity, frames, PHYSICAL_RENDER_LAW);
            assert!(samples.iter().all(|sample| sample.is_finite()));
            let peak = samples
                .iter()
                .fold(0.0f32, |value, sample| value.max(sample.abs()));
            assert!(peak > 0.002 && peak <= 0.93, "midi {midi} peak {peak}");
            let settled = &samples[16_000..];
            let expected = midi_frequency_hz(midi as f64);
            let (pitch, periodicity) = estimate_pitch(settled, sample_rate, expected);
            let cents = 1_200.0 * log2(pitch / expected);
            assert!(
                cents.abs() < pitch_tolerance_cents,
                "midi {midi} pitch {pitch} ({cents} cents)"
            );
            assert!(periodicity > 0.55, "midi {midi} periodicity {periodicity}");
            let high_ratio = high_band_proxy(settled);
            assert!(
                high_ratio < 0.08,
                "midi {midi} high-band proxy {high_ratio}"
            );
            assert!(state.len() >= STATE_HEADER_BYTES + STATE_SCALAR_BYTES);
            assert!(state.len() <= STATE_MAX_BYTES);
        }

        let replay_a = render_test(72, 76, 16_000, PHYSICAL_RENDER_LAW);
        let replay_b = render_test(72, 76, 16_000, PHYSICAL_RENDER_LAW);
        assert_eq!(
            replay_a, replay_b,
            "fixed seed and request must replay bit-exactly"
        );

        // Same physical state handed to a second segment must remain audible
        // and must not be byte-equivalent to a canonical at-rest restart.
        let (_, first_state) = render_test(67, 80, 12_000, PHYSICAL_RENDER_LAW);
        let mut continued_left = vec![0.0f32; 12_000];
        let mut continued_right = vec![0.0f32; 12_000];
        let mut continued_state = vec![0u8; STATE_MAX_BYTES];
        let mut continued_state_bytes = 0usize;
        let mut forward = [0.0; MAX_WAVE_SAMPLES];
        let mut backward = [0.0; MAX_WAVE_SAMPLES];
        let mut forward_next = [0.0; MAX_WAVE_SAMPLES];
        let mut backward_next = [0.0; MAX_WAVE_SAMPLES];
        let mut jet = [0.0; MAX_JET_HISTORY];
        assert_eq!(
            render_with_storage(
                72,
                84,
                48_000.0,
                0,
                0,
                &mut continued_left,
                &mut continued_right,
                Some(&first_state),
                Some((&mut continued_state, &mut continued_state_bytes)),
                &mut forward,
                &mut backward,
                &mut forward_next,
                &mut backward_next,
                &mut jet,
                PHYSICAL_RENDER_LAW,
            ),
            12_000,
        );
        let (restart, _) = render_test(72, 84, 12_000, PHYSICAL_RENDER_LAW);
        assert_ne!(&continued_left[..512], &restart[..512]);

        // Planted negative: cutting the returning air-column path leaves only
        // a short broadband edge transient, not a pitch-locked instrument.
        let (disabled, _) = render_test(
            67,
            80,
            frames,
            RenderLaw {
                jet_delay_scale: 1.0,
                resonator_enabled: false,
            },
        );
        let (_, disabled_periodicity) = estimate_pitch(&disabled[16_000..], sample_rate, 391.995);
        assert!(
            disabled_periodicity < 0.35,
            "disabled resonator periodicity {disabled_periodicity}"
        );
    }
}
