//! Dark physical concert-grand onset core.
//!
//! This is the sample-free replacement candidate for the recorded attack
//! layer used by `changes.dsp.concert-grand@1`.  It is compiled into explicit
//! `dark-models` / test builds and exposed by a cooperative host seam, but is
//! not wired into a shipping recipe.  The model retains the mechanisms that
//! the old additive attack did not have:
//!
//! - one finite-mass felt hammer shared by the unison string group;
//! - mass-normalized stiff-string modes derived from speaking length,
//!   tension, linear density, bending stiffness, and hammer/bridge position;
//! - an energy-consistent unilateral power-port contact;
//! - separate conservative string-to-bridge contact springs feeding one
//!   shared orthotropic soundboard modal reduction; and
//! - a baffled Rayleigh far-field observer formed from modal velocity.
//!
//! The modal convention and observer realization follow the recent
//! FrankenSim `fs-modal` / `fs-couple::modal_acoustic_time` work, but this
//! no-std WASM core has fixed arrays and imports no FrankenSim crate.  The
//! soundboard remains a bounded rectangular reduction rather than a claim of
//! a scanned concert-grand plate. This candidate itself reads no samples; the
//! shipping `@1` recipe still retains its recorded attack until an independent
//! reference comparison and owner listening gate approve the physical `@2`.

use core::{
    cell::UnsafeCell,
    mem::MaybeUninit,
    sync::atomic::{AtomicBool, Ordering},
};
use libm::{cos, exp, pow, sin, sqrt, tan};

const PI: f64 = core::f64::consts::PI;
const TAU: f64 = 2.0 * PI;
const LN_1000: f64 = 6.907_755_278_982_137;

pub const MIN_MIDI: i32 = 21;
pub const MAX_MIDI: i32 = 108;
pub const MAX_UNISON_STRINGS: usize = 3;
pub const MAX_PIANO_CHORD_NOTES: usize = 8;
pub const STRING_MODES: usize = 24;
pub const SOUNDBOARD_MODES: usize = 288;
pub const CONTACT_SOLVE_STEPS: usize = 8;
pub const MAXIMUM_BRIDGE_CONTACTS: usize = MAX_PIANO_CHORD_NOTES;
/// Conservative bound for the fixed-size bridge-contact Cholesky solve.
/// The implementation performs fewer operations, but never iterates beyond
/// an 8 by 8 matrix and never falls back to a search.
pub const MAXIMUM_BRIDGE_SOLVE_SCALAR_UPDATES: usize =
    MAXIMUM_BRIDGE_CONTACTS * MAXIMUM_BRIDGE_CONTACTS * MAXIMUM_BRIDGE_CONTACTS;
pub const MAXIMUM_STATE_BYTES: usize = 64 * 1024;

const AIR_DENSITY_KG_M3: f64 = 1.2041;
const AIR_SOUND_SPEED_M_PER_S: f64 = 343.21;
const STEEL_YOUNG_MODULUS_PA: f64 = 2.0e11;
const RADIATION_DISTANCE_M: f64 = 1.0;
// A bare piano string is an extremely poor acoustic radiator because its
// transverse dimension is tiny compared with the wavelength and its acoustic
// impedance is badly mismatched to air.  The audible instrument is the
// string-to-bridge-to-soundboard path modeled below.  Keep the diagnostic
// direct-string dipole out of the production pressure tap: adding it in
// parallel bypasses the bridge mobility and creates a synthetic harmonic comb,
// especially in the treble.
pub(crate) const DIRECT_STRING_RADIATION_SCALE: f64 = 0.0;
// 25 Pa at the declared one-metre reference maps to digital full scale
// (~122 dB SPL).  This is a fixed observer calibration, not a dynamics- or
// note-dependent limiter.
const DIGITAL_REFERENCE_PRESSURE_PA: f64 = 25.0;
/// The current hybrid hands the recorded attack to the synthesized sustain at
/// 320 ms.  This dark ABI renders only that replacement window: exposing the
/// physical core as an unbounded multi-second note would multiply browser
/// preparation cost without removing another sample-backed mechanism.
pub const PNO2_ATTACK_SECONDS: f64 = 0.320;
/// Maximum synthesis work performed by one cooperative browser turn. A full
/// 96 kHz attack therefore has an exact bound of 120 calls; browser timing is a
/// separately measured performance property, never a musical cutoff.
// Keep one cooperative browser slice comfortably below a 60 Hz frame even
// for the 96 kHz upper admission rate. The full 320 ms attack still stays
// within the host's fixed 128-step bound (30_720 / 256 = 120).
pub const PNO2_RUNTIME_STEP_FRAMES: usize = 256;
pub const PNO2_RUNTIME_STEP_PROGRESS: i32 = 1;
pub const PNO2_RUNTIME_STEP_COMPLETE: i32 = 2;
const PNO2_MAX_ATTACK_FRAMES: usize = 30_720;

/// Per-half-step velocity multiplier for an amplitude T60. The modal update
/// applies this multiplier on both sides of its lossless rotation/coupling
/// step, so each factor carries exactly half of the full-sample attenuation.
pub(crate) fn split_t60_half_velocity_decay(t60_seconds: f64, dt_seconds: f64) -> f64 {
    exp(-0.5 * LN_1000 * dt_seconds / t60_seconds)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PianoError {
    InvalidMidi,
    InvalidSampleRate,
    InvalidVelocity,
    InvalidParameters,
    InvalidContact,
    NonFiniteState,
    BudgetExceeded,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PianoParameters {
    pub soundboard_length_m: f64,
    pub soundboard_width_m: f64,
    pub soundboard_thickness_m: f64,
    pub soundboard_density_kg_m3: f64,
    pub soundboard_longitudinal_modulus_pa: f64,
    pub soundboard_radial_modulus_pa: f64,
    pub soundboard_shear_modulus_pa: f64,
    pub soundboard_poisson_ratio: f64,
    /// Number of transverse ribs represented by the smeared-rigidity model.
    pub soundboard_rib_count: usize,
    pub soundboard_rib_width_m: f64,
    pub soundboard_rib_height_m: f64,
    pub soundboard_rib_modulus_pa: f64,
    pub bridge_x_over_length: f64,
    pub bridge_y_over_width: f64,
    /// Local string-to-bridge contact stiffness [N/m].
    ///
    /// Miranda Valiente, Squicciarini, and Thompson (JASA 2024), Eq. 4,
    /// represent the truncated local bridge deformation by
    /// `F_b = k_c (y_string - y_board)` and estimate `k_c = 4.8 MN/m` for a
    /// 10 mm contact.  The live update integrates this spring together with
    /// the string and soundboard modes; it is not a gain or spectral shaper.
    pub bridge_contact_stiffness_n_per_m: f64,
    pub maximum_abs_pressure_pa: f64,
    pub maximum_total_energy_j: f64,
}

impl PianoParameters {
    pub const fn canonical() -> Self {
        Self {
            // Miranda Valiente et al. (JASA 2024), table I. Their FE board
            // uses a 7--9 mm thickness field; this bounded rectangular
            // reduction uses its 8 mm midpoint rather than inventing a scan.
            soundboard_length_m: 1.66,
            soundboard_width_m: 1.39,
            soundboard_thickness_m: 0.0080,
            soundboard_density_kg_m3: 600.0,
            soundboard_longitudinal_modulus_pa: 17.1e9,
            soundboard_radial_modulus_pa: 1.04e9,
            soundboard_shear_modulus_pa: 1.0e9,
            soundboard_poisson_ratio: 0.37,
            soundboard_rib_count: 14,
            soundboard_rib_width_m: 0.020,
            soundboard_rib_height_m: 0.025,
            soundboard_rib_modulus_pa: 11.0e9,
            bridge_x_over_length: 0.73,
            bridge_y_over_width: 0.37,
            bridge_contact_stiffness_n_per_m: 4.8e6,
            maximum_abs_pressure_pa: 200.0,
            maximum_total_energy_j: 2.0,
        }
    }

    pub fn validate(self) -> Result<Self, PianoError> {
        let finite_positive = [
            self.soundboard_length_m,
            self.soundboard_width_m,
            self.soundboard_thickness_m,
            self.soundboard_density_kg_m3,
            self.soundboard_longitudinal_modulus_pa,
            self.soundboard_radial_modulus_pa,
            self.soundboard_shear_modulus_pa,
            self.soundboard_rib_width_m,
            self.soundboard_rib_height_m,
            self.soundboard_rib_modulus_pa,
            self.bridge_contact_stiffness_n_per_m,
            self.maximum_abs_pressure_pa,
            self.maximum_total_energy_j,
        ];
        if finite_positive
            .iter()
            .any(|value| !value.is_finite() || *value <= 0.0)
            || !self.soundboard_poisson_ratio.is_finite()
            || !(0.0..0.5).contains(&self.soundboard_poisson_ratio)
            || !self.bridge_x_over_length.is_finite()
            || !(0.05..=0.95).contains(&self.bridge_x_over_length)
            || !self.bridge_y_over_width.is_finite()
            || !(0.05..=0.95).contains(&self.bridge_y_over_width)
            || !(0.5..=3.0).contains(&self.soundboard_length_m)
            || !(0.5..=2.0).contains(&self.soundboard_width_m)
            || !(0.004..=0.020).contains(&self.soundboard_thickness_m)
            || !(250.0..=900.0).contains(&self.soundboard_density_kg_m3)
            || !(5.0e9..=30.0e9).contains(&self.soundboard_longitudinal_modulus_pa)
            || !(0.2e9..=3.0e9).contains(&self.soundboard_radial_modulus_pa)
            || !(0.2e9..=3.0e9).contains(&self.soundboard_shear_modulus_pa)
            || !(6..=24).contains(&self.soundboard_rib_count)
            || !(0.008..=0.040).contains(&self.soundboard_rib_width_m)
            || !(0.010..=0.050).contains(&self.soundboard_rib_height_m)
            || !(5.0e9..=20.0e9).contains(&self.soundboard_rib_modulus_pa)
            || !(1.0e5..=1.0e8).contains(&self.bridge_contact_stiffness_n_per_m)
            || !(1.0..=1_000.0).contains(&self.maximum_abs_pressure_pa)
            || !(0.01..=5.0).contains(&self.maximum_total_energy_j)
        {
            return Err(PianoError::InvalidParameters);
        }
        Ok(self)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct StringGeometry {
    pub midi: i32,
    pub fundamental_hz: f64,
    pub speaking_length_m: f64,
    /// Vibrating string beyond the bridge, ending at the hitch pin [m].
    pub duplex_length_m: f64,
    /// Agraffe-to-hitch vibrating length used by the uncoupled string modes.
    pub total_length_m: f64,
    pub tension_n: f64,
    pub linear_density_kg_m: f64,
    pub equivalent_diameter_m: f64,
    pub inharmonicity_coefficient: f64,
    pub string_count: usize,
    pub unison_frequencies_hz: [f64; MAX_UNISON_STRINGS],
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PianoStrike {
    pub velocity: i32,
    pub hardness: f64,
    pub hammer_mass_kg: f64,
    pub hammer_velocity_m_per_s: f64,
    pub impact_energy_j: f64,
    pub felt_stiffness_n_per_m_pow_exponent: f64,
    pub felt_exponent: f64,
    pub maximum_force_n: f64,
    pub maximum_contact_seconds: f64,
}

impl PianoStrike {
    pub fn from_velocity(
        velocity: i32,
        midi: i32,
        string_diameter_m: f64,
    ) -> Result<Self, PianoError> {
        if !(1..=127).contains(&velocity) {
            return Err(PianoError::InvalidVelocity);
        }
        if !string_diameter_m.is_finite() || !(0.000_5..=0.006).contains(&string_diameter_m) {
            return Err(PianoError::InvalidContact);
        }
        let hammer_mass_kg = hammer_mass_kg_for_midi(midi)?;
        let hammer_radius_m = hammer_head_radius_m_for_midi(midi)?;
        let amount = velocity as f64 / 127.0;
        let hardness = 0.12 + 0.78 * pow(amount, 0.72);
        let hammer_velocity_m_per_s = 0.28 + 4.15 * pow(amount, 0.82);
        let impact_energy_j =
            0.5 * hammer_mass_kg * hammer_velocity_m_per_s * hammer_velocity_m_per_s;
        // Stulov 1995, Eqs. (22)-(23), approximates the all-key felt law as
        // F=F0*7.5*(u/d)^2.3, where F0 is derived from string diameter d,
        // hammer-head radius R, and one felt Young's modulus. Table 2 gives
        // 160 MPa for every measured medium hammer. Expanding normalized
        // compression into SI produces F=K*u^2.3 below.
        let felt_exponent = 2.3;
        let felt_modulus_pa = 160.0e6;
        let geometry_factor = 1.0 / sqrt(1.0 + string_diameter_m / (2.0 * hammer_radius_m));
        let felt_stiffness = 7.5 * felt_modulus_pa * pow(string_diameter_m, 3.0 - felt_exponent)
            / hammer_radius_m
            * geometry_factor;
        let peak_indent = pow(
            (felt_exponent + 1.0) * impact_energy_j / felt_stiffness,
            1.0 / (felt_exponent + 1.0),
        );
        let maximum_force_n = 2.5 * felt_stiffness * pow(peak_indent, felt_exponent);
        Ok(Self {
            velocity,
            hardness,
            hammer_mass_kg,
            hammer_velocity_m_per_s,
            impact_energy_j,
            felt_stiffness_n_per_m_pow_exponent: felt_stiffness,
            felt_exponent,
            maximum_force_n,
            maximum_contact_seconds: 0.012 - 0.0075 * hardness,
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PianoOutput {
    pub left_pressure_pa: f64,
    pub right_pressure_pa: f64,
    pub string_energy_j: f64,
    pub soundboard_energy_j: f64,
    pub bridge_contact_energy_j: f64,
    pub hammer_contact_energy_j: f64,
    pub escaped_hammer_energy_j: f64,
    pub cumulative_loss_j: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PianoWorkReceipt {
    pub active_string_modes: usize,
    pub active_soundboard_modes: usize,
    pub maximum_contact_iterations: usize,
    pub last_contact_iterations: usize,
    pub total_contact_iterations: u64,
    pub maximum_bridge_contacts: usize,
    pub maximum_bridge_solve_scalar_updates: usize,
    pub state_bytes: usize,
}

#[derive(Clone, Copy, Debug)]
struct Mode {
    active: bool,
    position: f64,
    velocity: f64,
    frequency_hz: f64,
    omega: f64,
    /// Bilinear-prewarped frequency used by the coupled midpoint solve.  Its
    /// Cayley phase is exactly `omega * dt`, so the passive contact update does
    /// not detune high string modes merely because it is unconditionally
    /// bounded.
    midpoint_omega: f64,
    half_velocity_decay: f64,
    contact_residue_m_neg_half_kg: f64,
    bridge_residue_m_neg_half_kg: f64,
}

impl Mode {
    const ZERO: Self = Self {
        active: false,
        position: 0.0,
        velocity: 0.0,
        frequency_hz: 0.0,
        omega: 0.0,
        midpoint_omega: 0.0,
        half_velocity_decay: 1.0,
        contact_residue_m_neg_half_kg: 0.0,
        bridge_residue_m_neg_half_kg: 0.0,
    };

    fn apply_half_loss(&mut self) -> f64 {
        if !self.active {
            return 0.0;
        }
        let velocity_before = self.velocity;
        self.velocity *= self.half_velocity_decay;
        0.5 * (velocity_before * velocity_before - self.velocity * self.velocity).max(0.0)
    }

    fn energy_j(self) -> f64 {
        if !self.active {
            return 0.0;
        }
        0.5 * (self.velocity * self.velocity
            + self.midpoint_omega * self.midpoint_omega * self.position * self.position)
    }
}

fn midpoint_free_position(mode: Mode, half_dt: f64) -> f64 {
    let frequency_term = half_dt * mode.midpoint_omega;
    ((1.0 - frequency_term * frequency_term) * mode.position + 2.0 * half_dt * mode.velocity)
        / (1.0 + frequency_term * frequency_term)
}

fn midpoint_inverse_diagonal(mode: Mode, half_dt: f64) -> f64 {
    1.0 / (1.0 + half_dt * half_dt * mode.midpoint_omega * mode.midpoint_omega)
}

fn prewarped_midpoint_omega(frequency_hz: f64, dt_seconds: f64) -> f64 {
    2.0 / dt_seconds * tan(PI * frequency_hz * dt_seconds)
}

fn accumulate_midpoint_contact_terms(
    mode: Mode,
    residue_m_neg_half_kg: f64,
    half_dt: f64,
) -> (f64, f64) {
    if !mode.active || residue_m_neg_half_kg == 0.0 {
        return (0.0, 0.0);
    }
    let inverse_diagonal = midpoint_inverse_diagonal(mode, half_dt);
    let free_position = midpoint_free_position(mode, half_dt);
    (
        residue_m_neg_half_kg * residue_m_neg_half_kg * inverse_diagonal,
        residue_m_neg_half_kg * (mode.position + free_position),
    )
}

fn finish_midpoint_contact_mode(
    mode: &mut Mode,
    signed_residue_m_neg_half_kg: f64,
    contact_coordinate_sum_m_sqrt_kg: f64,
    half_dt: f64,
    contact_stiffness_n_per_m: f64,
) {
    if !mode.active {
        return;
    }
    let old_position = mode.position;
    let old_velocity = mode.velocity;
    let free_position = midpoint_free_position(*mode, half_dt);
    let correction = half_dt
        * half_dt
        * contact_stiffness_n_per_m
        * signed_residue_m_neg_half_kg
        * contact_coordinate_sum_m_sqrt_kg
        * midpoint_inverse_diagonal(*mode, half_dt);
    let next_position = free_position - correction;
    // This is the exact companion velocity relation of implicit midpoint:
    // q1 - q0 = dt/2 * (v0 + v1).
    let next_velocity = (next_position - old_position) / half_dt - old_velocity;
    mode.position = next_position;
    mode.velocity = next_velocity;
}

fn solve_bridge_contact_coordinates(
    matrix: [[f64; MAXIMUM_BRIDGE_CONTACTS]; MAXIMUM_BRIDGE_CONTACTS],
    right_hand_side: [f64; MAXIMUM_BRIDGE_CONTACTS],
    contact_count: usize,
) -> Result<[f64; MAXIMUM_BRIDGE_CONTACTS], PianoError> {
    if contact_count == 0 || contact_count > MAXIMUM_BRIDGE_CONTACTS {
        return Err(PianoError::InvalidParameters);
    }
    let mut lower = [[0.0_f64; MAXIMUM_BRIDGE_CONTACTS]; MAXIMUM_BRIDGE_CONTACTS];
    for row in 0..contact_count {
        for column in 0..=row {
            let mut value = matrix[row][column];
            for inner in 0..column {
                value -= lower[row][inner] * lower[column][inner];
            }
            if row == column {
                if !value.is_finite() || value <= 0.0 {
                    return Err(PianoError::NonFiniteState);
                }
                lower[row][column] = sqrt(value);
            } else {
                lower[row][column] = value / lower[column][column];
            }
        }
    }
    let mut intermediate = [0.0_f64; MAXIMUM_BRIDGE_CONTACTS];
    for row in 0..contact_count {
        let mut value = right_hand_side[row];
        for column in 0..row {
            value -= lower[row][column] * intermediate[column];
        }
        intermediate[row] = value / lower[row][row];
    }
    let mut solution = [0.0_f64; MAXIMUM_BRIDGE_CONTACTS];
    for row in (0..contact_count).rev() {
        let mut value = intermediate[row];
        for column in row + 1..contact_count {
            value -= lower[column][row] * solution[column];
        }
        solution[row] = value / lower[row][row];
        if !solution[row].is_finite() {
            return Err(PianoError::NonFiniteState);
        }
    }
    Ok(solution)
}

/// Narrow exact-source seam used by the independent bridge known-answer test.
/// The production piano uses these same accumulation, Cholesky, and midpoint
/// update functions over many modes; this wrapper merely supplies one mode on
/// each side of one physical contact.
#[cfg(test)]
pub fn bridge_contact_pair_midpoint_step(
    dt_seconds: f64,
    contact_stiffness_n_per_m: f64,
    string_frequency_hz: f64,
    string_residue_m_neg_half_kg: f64,
    body_frequency_hz: f64,
    body_residue_m_neg_half_kg: f64,
    initial_state: [f64; 4],
) -> Result<[f64; 4], PianoError> {
    if !dt_seconds.is_finite()
        || dt_seconds <= 0.0
        || !contact_stiffness_n_per_m.is_finite()
        || contact_stiffness_n_per_m <= 0.0
    {
        return Err(PianoError::InvalidParameters);
    }
    let mut string_mode = Mode {
        active: true,
        position: initial_state[0],
        velocity: initial_state[1],
        frequency_hz: string_frequency_hz,
        omega: TAU * string_frequency_hz,
        midpoint_omega: prewarped_midpoint_omega(string_frequency_hz, dt_seconds),
        half_velocity_decay: 1.0,
        contact_residue_m_neg_half_kg: 0.0,
        bridge_residue_m_neg_half_kg: string_residue_m_neg_half_kg,
    };
    let mut body_mode = Mode {
        active: true,
        position: initial_state[2],
        velocity: initial_state[3],
        frequency_hz: body_frequency_hz,
        omega: TAU * body_frequency_hz,
        midpoint_omega: prewarped_midpoint_omega(body_frequency_hz, dt_seconds),
        half_velocity_decay: 1.0,
        contact_residue_m_neg_half_kg: 0.0,
        bridge_residue_m_neg_half_kg: body_residue_m_neg_half_kg,
    };
    let half_dt = 0.5 * dt_seconds;
    let (string_compliance, string_right_hand_side) =
        accumulate_midpoint_contact_terms(string_mode, string_residue_m_neg_half_kg, half_dt);
    let (body_compliance, body_right_hand_side) =
        accumulate_midpoint_contact_terms(body_mode, body_residue_m_neg_half_kg, half_dt);
    let mut matrix = [[0.0_f64; MAXIMUM_BRIDGE_CONTACTS]; MAXIMUM_BRIDGE_CONTACTS];
    matrix[0][0] =
        1.0 + half_dt * half_dt * contact_stiffness_n_per_m * (string_compliance + body_compliance);
    let mut right_hand_side = [0.0_f64; MAXIMUM_BRIDGE_CONTACTS];
    right_hand_side[0] = string_right_hand_side - body_right_hand_side;
    let coordinate = solve_bridge_contact_coordinates(matrix, right_hand_side, 1)?[0];
    finish_midpoint_contact_mode(
        &mut string_mode,
        string_residue_m_neg_half_kg,
        coordinate,
        half_dt,
        contact_stiffness_n_per_m,
    );
    finish_midpoint_contact_mode(
        &mut body_mode,
        -body_residue_m_neg_half_kg,
        coordinate,
        half_dt,
        contact_stiffness_n_per_m,
    );
    Ok([
        string_mode.position,
        string_mode.velocity,
        body_mode.position,
        body_mode.velocity,
    ])
}

#[derive(Clone, Copy, Debug)]
struct StringBank {
    active: bool,
    modes: [Mode; STRING_MODES],
}

impl StringBank {
    const ZERO: Self = Self {
        active: false,
        modes: [Mode::ZERO; STRING_MODES],
    };
}

#[derive(Clone, Copy, Debug)]
struct SoundboardMode {
    mode: Mode,
    order_x: u8,
    order_y: u8,
    left_pressure_per_velocity_re: f64,
    left_pressure_per_velocity_im: f64,
    right_pressure_per_velocity_re: f64,
    right_pressure_per_velocity_im: f64,
}

impl SoundboardMode {
    const ZERO: Self = Self {
        mode: Mode::ZERO,
        order_x: 0,
        order_y: 0,
        left_pressure_per_velocity_re: 0.0,
        left_pressure_per_velocity_im: 0.0,
        right_pressure_per_velocity_re: 0.0,
        right_pressure_per_velocity_im: 0.0,
    };
}

#[derive(Clone, Copy, Debug)]
struct ContactState {
    active: bool,
    strike: PianoStrike,
    hammer_velocity_m_per_s: f64,
    compression_m: f64,
    elapsed_frames: u32,
    maximum_frames: u32,
    dissipated_energy_j: f64,
}

#[derive(Clone, Debug)]
struct PianoKeyState {
    geometry: StringGeometry,
    strings: [StringBank; MAX_UNISON_STRINGS],
    contact: ContactState,
    active_string_modes: usize,
    escaped_hammer_energy_j: f64,
    total_contact_iterations: u64,
    last_contact_iterations: usize,
}

impl PianoKeyState {
    fn new(midi: i32, sample_rate_hz: f64) -> Result<Self, PianoError> {
        let geometry = string_geometry(midi)?;
        let dt = 1.0 / sample_rate_hz;
        let mut strings = [StringBank::ZERO; MAX_UNISON_STRINGS];
        let mut active_string_modes = 0usize;
        for string_index in 0..geometry.string_count {
            strings[string_index].active = true;
            // Miranda Valiente et al. (JASA 2024), Sec. II, model the string
            // from agraffe to hitch pin and couple the soundboard at the
            // internal speaking-length location.  The previous reduction used
            // speaking-length modes and then placed the bridge at a fixed
            // 1.8% residue, which is neither that coupled model nor a rigid
            // speaking-string boundary and badly mis-weights treble partials.
            let length_ratio = geometry.speaking_length_m / geometry.total_length_m;
            let string_fundamental = geometry.unison_frequencies_hz[string_index] * length_ratio;
            let full_string_inharmonicity =
                geometry.inharmonicity_coefficient * length_ratio * length_ratio;
            let modal_mass = 0.5 * geometry.linear_density_kg_m * geometry.total_length_m;
            let modal_norm = 1.0 / sqrt(modal_mass);
            for mode_index in 0..STRING_MODES {
                let order = (mode_index + 1) as f64;
                let frequency_hz = stiff_string_mode_frequency_hz(
                    string_fundamental,
                    full_string_inharmonicity,
                    mode_index + 1,
                );
                if frequency_hz >= 0.44 * sample_rate_hz {
                    continue;
                }
                active_string_modes += 1;
                let omega = TAU * frequency_hz;
                let hammer_shape =
                    sin(PI * order * hammer_strike_position_over_length(midi)? * length_ratio);
                let bridge_shape = sin(PI * order * length_ratio);
                let fundamental_t60 = 14.0 * exp(-0.020 * (midi - MIN_MIDI) as f64) + 1.4;
                let t60 = fundamental_t60 / (1.0 + 0.020 * order * order);
                strings[string_index].modes[mode_index] = Mode {
                    active: true,
                    position: 0.0,
                    velocity: 0.0,
                    frequency_hz,
                    omega,
                    midpoint_omega: prewarped_midpoint_omega(frequency_hz, dt),
                    half_velocity_decay: split_t60_half_velocity_decay(t60, dt),
                    contact_residue_m_neg_half_kg: hammer_shape * modal_norm
                        / geometry.string_count as f64,
                    bridge_residue_m_neg_half_kg: bridge_shape * modal_norm,
                };
            }
        }
        if active_string_modes == 0 {
            return Err(PianoError::InvalidSampleRate);
        }
        Ok(Self {
            geometry,
            strings,
            contact: ContactState::INACTIVE,
            active_string_modes,
            escaped_hammer_energy_j: 0.0,
            total_contact_iterations: 0,
            last_contact_iterations: 0,
        })
    }

    fn string_energy_j(&self) -> f64 {
        self.strings
            .iter()
            .flat_map(|bank| bank.modes.iter())
            .map(|mode| mode.energy_j())
            .sum()
    }

    fn hammer_energy_j(&self) -> f64 {
        if !self.contact.active {
            return 0.0;
        }
        0.5 * self.contact.strike.hammer_mass_kg
            * self.contact.hammer_velocity_m_per_s
            * self.contact.hammer_velocity_m_per_s
            + felt_potential_j(
                self.contact.strike.felt_stiffness_n_per_m_pow_exponent,
                self.contact.strike.felt_exponent,
                self.contact.compression_m,
            )
    }
}

fn strings_energy_j(strings: &[StringBank; MAX_UNISON_STRINGS]) -> f64 {
    strings
        .iter()
        .flat_map(|bank| bank.modes.iter())
        .map(|mode| mode.energy_j())
        .sum()
}

fn hammer_port_velocity(strings: &[StringBank; MAX_UNISON_STRINGS]) -> f64 {
    strings
        .iter()
        .flat_map(|bank| bank.modes.iter())
        .map(|mode| mode.contact_residue_m_neg_half_kg * mode.velocity)
        .sum()
}

fn begin_key_strike(
    contact: &mut ContactState,
    strike: PianoStrike,
    sample_rate_hz: f64,
    dt: f64,
) -> Result<(), PianoError> {
    if contact.active
        || !(1..=127).contains(&strike.velocity)
        || !strike.hardness.is_finite()
        || !(0.0..=1.0).contains(&strike.hardness)
        || !strike.hammer_mass_kg.is_finite()
        || !(0.005..=0.020).contains(&strike.hammer_mass_kg)
        || !strike.hammer_velocity_m_per_s.is_finite()
        || !(0.0..=8.0).contains(&strike.hammer_velocity_m_per_s)
        || !strike.impact_energy_j.is_finite()
        || !(0.0..=1.0).contains(&strike.impact_energy_j)
        || !strike.felt_stiffness_n_per_m_pow_exponent.is_finite()
        || !(1.0e8..=1.0e11).contains(&strike.felt_stiffness_n_per_m_pow_exponent)
        || !strike.felt_exponent.is_finite()
        || !(1.5..=4.0).contains(&strike.felt_exponent)
        || !strike.maximum_force_n.is_finite()
        || !(0.0..=20_000.0).contains(&strike.maximum_force_n)
        || !strike.maximum_contact_seconds.is_finite()
        || !(dt..=0.020).contains(&strike.maximum_contact_seconds)
    {
        return Err(PianoError::InvalidContact);
    }
    let stated_energy = 0.5
        * strike.hammer_mass_kg
        * strike.hammer_velocity_m_per_s
        * strike.hammer_velocity_m_per_s;
    let tolerance = (1.0e-10_f64).max(0.005 * stated_energy);
    if (strike.impact_energy_j - stated_energy).abs() > tolerance {
        return Err(PianoError::InvalidContact);
    }
    let maximum_frames = libm::ceil(strike.maximum_contact_seconds * sample_rate_hz) as u32;
    *contact = ContactState {
        active: true,
        strike,
        hammer_velocity_m_per_s: strike.hammer_velocity_m_per_s,
        compression_m: 0.0,
        elapsed_frames: 0,
        maximum_frames: maximum_frames.max(1),
        dissipated_energy_j: 0.0,
    };
    Ok(())
}

fn apply_hammer_contact_state(
    strings: &mut [StringBank; MAX_UNISON_STRINGS],
    contact: &mut ContactState,
    escaped_hammer_energy_j: &mut f64,
    last_contact_iterations: &mut usize,
    total_contact_iterations: &mut u64,
    dt: f64,
) {
    let strike = contact.strike;
    let compression = contact.compression_m.max(0.0);
    let relative_velocity = contact.hammer_velocity_m_per_s - hammer_port_velocity(strings);
    let mut inverse_effective_mass = 1.0 / strike.hammer_mass_kg;
    for bank in strings.iter() {
        for mode in &bank.modes {
            inverse_effective_mass +=
                mode.contact_residue_m_neg_half_kg * mode.contact_residue_m_neg_half_kg;
        }
    }
    let potential_before = felt_potential_j(
        strike.felt_stiffness_n_per_m_pow_exponent,
        strike.felt_exponent,
        compression,
    );
    let maximum_impulse = strike.maximum_force_n * dt;
    let mut lower = 0.0;
    let mut upper = maximum_impulse;
    let upper_compression =
        (compression + dt * (relative_velocity - 0.5 * upper * inverse_effective_mass)).max(0.0);
    let upper_force = felt_force_n(
        strike.felt_stiffness_n_per_m_pow_exponent,
        strike.felt_exponent,
        compression,
        upper_compression,
    );
    if upper < dt * upper_force {
        *escaped_hammer_energy_j += 0.5
            * strike.hammer_mass_kg
            * contact.hammer_velocity_m_per_s
            * contact.hammer_velocity_m_per_s;
        contact.dissipated_energy_j += potential_before;
        contact.compression_m = 0.0;
        contact.active = false;
        return;
    }
    for _ in 0..CONTACT_SOLVE_STEPS {
        let impulse = 0.5 * (lower + upper);
        let after = (compression
            + dt * (relative_velocity - 0.5 * impulse * inverse_effective_mass))
            .max(0.0);
        let force = felt_force_n(
            strike.felt_stiffness_n_per_m_pow_exponent,
            strike.felt_exponent,
            compression,
            after,
        );
        if impulse >= dt * force {
            upper = impulse;
        } else {
            lower = impulse;
        }
    }
    *last_contact_iterations = CONTACT_SOLVE_STEPS;
    *total_contact_iterations += CONTACT_SOLVE_STEPS as u64;
    let impulse = upper;
    let system_before = strings_energy_j(strings)
        + 0.5
            * strike.hammer_mass_kg
            * contact.hammer_velocity_m_per_s
            * contact.hammer_velocity_m_per_s
        + potential_before;
    for bank in strings.iter_mut() {
        for mode in &mut bank.modes {
            mode.velocity += mode.contact_residue_m_neg_half_kg * impulse;
        }
    }
    contact.hammer_velocity_m_per_s -= impulse / strike.hammer_mass_kg;
    let compression_after =
        (compression + dt * (relative_velocity - 0.5 * impulse * inverse_effective_mass)).max(0.0);
    contact.compression_m = compression_after;
    let system_after = strings_energy_j(strings)
        + 0.5
            * strike.hammer_mass_kg
            * contact.hammer_velocity_m_per_s
            * contact.hammer_velocity_m_per_s
        + felt_potential_j(
            strike.felt_stiffness_n_per_m_pow_exponent,
            strike.felt_exponent,
            compression_after,
        );
    let tolerance = 512.0 * f64::EPSILON * system_before.max(1.0);
    if system_after > system_before + tolerance {
        for bank in strings.iter_mut() {
            for mode in &mut bank.modes {
                mode.velocity -= mode.contact_residue_m_neg_half_kg * impulse;
            }
        }
        contact.hammer_velocity_m_per_s += impulse / strike.hammer_mass_kg;
        *escaped_hammer_energy_j += 0.5
            * strike.hammer_mass_kg
            * contact.hammer_velocity_m_per_s
            * contact.hammer_velocity_m_per_s;
        contact.dissipated_energy_j += potential_before;
        contact.compression_m = 0.0;
        contact.active = false;
        return;
    }
    contact.dissipated_energy_j += (system_before - system_after).max(0.0);
    contact.elapsed_frames += 1;
    let relative_after = relative_velocity - impulse * inverse_effective_mass;
    let separated = compression_after <= 1.0e-12 && relative_after <= 0.0;
    if separated || contact.elapsed_frames >= contact.maximum_frames {
        *escaped_hammer_energy_j += 0.5
            * strike.hammer_mass_kg
            * contact.hammer_velocity_m_per_s
            * contact.hammer_velocity_m_per_s;
        contact.dissipated_energy_j += felt_potential_j(
            strike.felt_stiffness_n_per_m_pow_exponent,
            strike.felt_exponent,
            contact.compression_m,
        );
        contact.compression_m = 0.0;
        contact.active = false;
    }
}

impl ContactState {
    const INACTIVE: Self = Self {
        active: false,
        strike: PianoStrike {
            velocity: 1,
            hardness: 0.0,
            hammer_mass_kg: 0.0089,
            hammer_velocity_m_per_s: 0.0,
            impact_energy_j: 0.0,
            felt_stiffness_n_per_m_pow_exponent: 1.0,
            felt_exponent: 2.5,
            maximum_force_n: 0.0,
            maximum_contact_seconds: 0.001,
        },
        hammer_velocity_m_per_s: 0.0,
        compression_m: 0.0,
        elapsed_frames: 0,
        maximum_frames: 0,
        dissipated_energy_j: 0.0,
    };
}

#[derive(Clone, Debug)]
pub struct PianoVoice {
    sample_rate_hz: f64,
    dt: f64,
    parameters: PianoParameters,
    geometry: StringGeometry,
    strings: [StringBank; MAX_UNISON_STRINGS],
    soundboard: [SoundboardMode; SOUNDBOARD_MODES],
    contact: ContactState,
    active_string_modes: usize,
    cumulative_loss_j: f64,
    escaped_hammer_energy_j: f64,
    total_contact_iterations: u64,
    last_contact_iterations: usize,
}

impl PianoVoice {
    pub fn new(
        midi: i32,
        sample_rate_hz: f64,
        parameters: PianoParameters,
    ) -> Result<Self, PianoError> {
        if !(MIN_MIDI..=MAX_MIDI).contains(&midi) {
            return Err(PianoError::InvalidMidi);
        }
        if !sample_rate_hz.is_finite() || !(8_000.0..=96_000.0).contains(&sample_rate_hz) {
            return Err(PianoError::InvalidSampleRate);
        }
        let parameters = parameters.validate()?;
        let dt = 1.0 / sample_rate_hz;
        let key = PianoKeyState::new(midi, sample_rate_hz)?;
        let soundboard = build_soundboard_modes(parameters, sample_rate_hz)?;
        let voice = Self {
            sample_rate_hz,
            dt,
            parameters,
            geometry: key.geometry,
            strings: key.strings,
            soundboard,
            contact: key.contact,
            active_string_modes: key.active_string_modes,
            cumulative_loss_j: 0.0,
            escaped_hammer_energy_j: key.escaped_hammer_energy_j,
            total_contact_iterations: key.total_contact_iterations,
            last_contact_iterations: key.last_contact_iterations,
        };
        if core::mem::size_of::<Self>() > MAXIMUM_STATE_BYTES {
            return Err(PianoError::BudgetExceeded);
        }
        Ok(voice)
    }

    pub fn begin_strike(&mut self, strike: PianoStrike) -> Result<(), PianoError> {
        // `begin_key_strike` refuses while the current contact is active and
        // validates the replacement before overwriting it.  Transfer the old
        // contact ledger only after that operation succeeds; otherwise a
        // rejected retrigger would count the same dissipated energy again on
        // every retry.
        let completed_contact_loss_j = self.contact.dissipated_energy_j;
        begin_key_strike(&mut self.contact, strike, self.sample_rate_hz, self.dt)?;
        self.cumulative_loss_j += completed_contact_loss_j;
        Ok(())
    }

    pub fn step(&mut self) -> Result<PianoOutput, PianoError> {
        self.last_contact_iterations = 0;
        if self.contact.active {
            self.apply_hammer_contact();
        }

        let mut damping_loss_j = 0.0;
        self.for_each_mode_mut(|mode| damping_loss_j += mode.apply_half_loss());
        self.advance_bridge_contact_midpoint()?;
        self.for_each_mode_mut(|mode| damping_loss_j += mode.apply_half_loss());
        self.cumulative_loss_j += damping_loss_j;
        let string_energy_j = self.string_energy_j();
        let soundboard_energy_j = self.soundboard_energy_j();
        let bridge_contact_energy_j = self.bridge_contact_energy_j();

        let (left_pressure_pa, right_pressure_pa) = self.observe_pressure_pa();
        let hammer_contact_energy_j = self.hammer_contact_energy_j();
        let energy = string_energy_j
            + soundboard_energy_j
            + bridge_contact_energy_j
            + hammer_contact_energy_j;
        if !left_pressure_pa.is_finite() || !right_pressure_pa.is_finite() || !energy.is_finite() {
            return Err(PianoError::NonFiniteState);
        }
        if left_pressure_pa.abs() > self.parameters.maximum_abs_pressure_pa
            || right_pressure_pa.abs() > self.parameters.maximum_abs_pressure_pa
            || energy > self.parameters.maximum_total_energy_j
        {
            return Err(PianoError::BudgetExceeded);
        }
        Ok(PianoOutput {
            left_pressure_pa,
            right_pressure_pa,
            string_energy_j,
            soundboard_energy_j,
            bridge_contact_energy_j,
            hammer_contact_energy_j,
            escaped_hammer_energy_j: self.escaped_hammer_energy_j,
            cumulative_loss_j: self.cumulative_loss_j + self.contact.dissipated_energy_j,
        })
    }

    pub fn geometry(&self) -> StringGeometry {
        self.geometry
    }

    pub fn string_mode_frequency_hz(&self, string_index: usize, mode_index: usize) -> Option<f64> {
        self.strings
            .get(string_index)
            .and_then(|bank| bank.modes.get(mode_index))
            .and_then(|mode| mode.active.then_some(mode.frequency_hz))
    }

    pub fn string_mode_energy_j(&self, string_index: usize, mode_index: usize) -> Option<f64> {
        self.strings
            .get(string_index)
            .and_then(|bank| bank.modes.get(mode_index))
            .and_then(|mode| mode.active.then_some(mode.energy_j()))
    }

    pub fn soundboard_mode_frequency_hz(&self, mode_index: usize) -> Option<f64> {
        self.soundboard
            .get(mode_index)
            .and_then(|mode| mode.mode.active.then_some(mode.mode.frequency_hz))
    }

    pub fn soundboard_mode_energy_j(&self, mode_index: usize) -> Option<f64> {
        self.soundboard
            .get(mode_index)
            .and_then(|mode| mode.mode.active.then_some(mode.mode.energy_j()))
    }

    pub fn soundboard_mode_orders(&self, mode_index: usize) -> Option<(u8, u8)> {
        self.soundboard
            .get(mode_index)
            .and_then(|mode| mode.mode.active.then_some((mode.order_x, mode.order_y)))
    }

    pub fn contact_active(&self) -> bool {
        self.contact.active
    }

    pub fn represented_energy_j(&self) -> f64 {
        self.modal_energy_j() + self.bridge_contact_energy_j() + self.hammer_contact_energy_j()
    }

    /// Energy still represented plus every explicitly exited or dissipated
    /// joule since construction.  This is the conservation ledger; hammer
    /// kinetic energy after separation is an outgoing port, not fake loss.
    pub fn accounted_energy_j(&self) -> f64 {
        self.represented_energy_j()
            + self.escaped_hammer_energy_j
            + self.cumulative_loss_j
            + self.contact.dissipated_energy_j
    }

    pub fn string_energy_j(&self) -> f64 {
        self.strings
            .iter()
            .flat_map(|bank| bank.modes.iter())
            .map(|mode| mode.energy_j())
            .sum()
    }

    pub fn soundboard_energy_j(&self) -> f64 {
        self.soundboard
            .iter()
            .map(|mode| mode.mode.energy_j())
            .sum()
    }

    pub fn hammer_contact_energy_j(&self) -> f64 {
        if !self.contact.active {
            return 0.0;
        }
        0.5 * self.contact.strike.hammer_mass_kg
            * self.contact.hammer_velocity_m_per_s
            * self.contact.hammer_velocity_m_per_s
            + felt_potential_j(
                self.contact.strike.felt_stiffness_n_per_m_pow_exponent,
                self.contact.strike.felt_exponent,
                self.contact.compression_m,
            )
    }

    pub fn bridge_contact_energy_j(&self) -> f64 {
        let relative_displacement_m = self.bridge_relative_displacement_m();
        0.5 * self.parameters.bridge_contact_stiffness_n_per_m
            * relative_displacement_m
            * relative_displacement_m
    }

    pub fn work_receipt(&self) -> PianoWorkReceipt {
        PianoWorkReceipt {
            active_string_modes: self.active_string_modes,
            active_soundboard_modes: self
                .soundboard
                .iter()
                .filter(|mode| mode.mode.active)
                .count(),
            maximum_contact_iterations: CONTACT_SOLVE_STEPS,
            last_contact_iterations: self.last_contact_iterations,
            total_contact_iterations: self.total_contact_iterations,
            maximum_bridge_contacts: 1,
            maximum_bridge_solve_scalar_updates: MAXIMUM_BRIDGE_SOLVE_SCALAR_UPDATES,
            state_bytes: core::mem::size_of::<Self>(),
        }
    }

    fn for_each_mode_mut(&mut self, mut action: impl FnMut(&mut Mode)) {
        for bank in &mut self.strings {
            for mode in &mut bank.modes {
                action(mode);
            }
        }
        for body in &mut self.soundboard {
            action(&mut body.mode);
        }
    }

    fn modal_energy_j(&self) -> f64 {
        self.string_energy_j() + self.soundboard_energy_j()
    }

    fn apply_hammer_contact(&mut self) {
        apply_hammer_contact_state(
            &mut self.strings,
            &mut self.contact,
            &mut self.escaped_hammer_energy_j,
            &mut self.last_contact_iterations,
            &mut self.total_contact_iterations,
            self.dt,
        );
    }

    fn bridge_relative_displacement_m(&self) -> f64 {
        let string_displacement_m: f64 = self
            .strings
            .iter()
            .flat_map(|bank| bank.modes.iter())
            .map(|mode| mode.bridge_residue_m_neg_half_kg * mode.position)
            .sum();
        let body_displacement_m: f64 = self
            .soundboard
            .iter()
            .map(|body| body.mode.bridge_residue_m_neg_half_kg * body.mode.position)
            .sum();
        string_displacement_m - body_displacement_m
    }

    fn advance_bridge_contact_midpoint(&mut self) -> Result<(), PianoError> {
        let half_dt = 0.5 * self.dt;
        let half_dt_squared_stiffness =
            half_dt * half_dt * self.parameters.bridge_contact_stiffness_n_per_m;
        let mut string_compliance = 0.0;
        let mut string_right_hand_side = 0.0;
        for bank in &self.strings {
            for mode in &bank.modes {
                let (compliance, right_hand_side) = accumulate_midpoint_contact_terms(
                    *mode,
                    mode.bridge_residue_m_neg_half_kg,
                    half_dt,
                );
                string_compliance += compliance;
                string_right_hand_side += right_hand_side;
            }
        }
        let mut body_right_hand_side = 0.0;
        let mut body_compliance = 0.0;
        for body in &self.soundboard {
            let (compliance, right_hand_side) = accumulate_midpoint_contact_terms(
                body.mode,
                body.mode.bridge_residue_m_neg_half_kg,
                half_dt,
            );
            body_compliance += compliance;
            body_right_hand_side += right_hand_side;
        }
        let mut matrix = [[0.0_f64; MAXIMUM_BRIDGE_CONTACTS]; MAXIMUM_BRIDGE_CONTACTS];
        matrix[0][0] = 1.0 + half_dt_squared_stiffness * (string_compliance + body_compliance);
        let mut right_hand_side = [0.0_f64; MAXIMUM_BRIDGE_CONTACTS];
        right_hand_side[0] = string_right_hand_side - body_right_hand_side;
        let coordinates = solve_bridge_contact_coordinates(matrix, right_hand_side, 1)?;
        for bank in &mut self.strings {
            for mode in &mut bank.modes {
                finish_midpoint_contact_mode(
                    mode,
                    mode.bridge_residue_m_neg_half_kg,
                    coordinates[0],
                    half_dt,
                    self.parameters.bridge_contact_stiffness_n_per_m,
                );
            }
        }
        for body in &mut self.soundboard {
            let residue = body.mode.bridge_residue_m_neg_half_kg;
            finish_midpoint_contact_mode(
                &mut body.mode,
                -residue,
                coordinates[0],
                half_dt,
                self.parameters.bridge_contact_stiffness_n_per_m,
            );
        }
        Ok(())
    }

    fn observe_pressure_pa(&self) -> (f64, f64) {
        let mut left_pressure_pa = 0.0;
        let mut right_pressure_pa = 0.0;
        for body in &self.soundboard {
            left_pressure_pa += body.left_pressure_per_velocity_re * body.mode.velocity
                + body.left_pressure_per_velocity_im * body.mode.omega * body.mode.position;
            right_pressure_pa += body.right_pressure_per_velocity_re * body.mode.velocity
                + body.right_pressure_per_velocity_im * body.mode.omega * body.mode.position;
        }
        let mut left_string_volume_acceleration = 0.0;
        let mut right_string_volume_acceleration = 0.0;
        let string_modal_mass =
            0.5 * self.geometry.linear_density_kg_m * self.geometry.speaking_length_m;
        let string_modal_norm = 1.0 / sqrt(string_modal_mass);
        for (string_index, bank) in self.strings.iter().enumerate() {
            if !bank.active {
                continue;
            }
            for (mode_index, mode) in bank.modes.iter().enumerate() {
                if !mode.active || mode_index % 2 == 1 {
                    continue;
                }
                let order = (mode_index + 1) as f64;
                let integrated_mode_length_m = 2.0 * self.geometry.speaking_length_m / (PI * order);
                let dipole_efficiency = (mode.omega * self.geometry.equivalent_diameter_m
                    / AIR_SOUND_SPEED_M_PER_S)
                    .min(0.25);
                let volume_residue_m2_per_sqrt_kg = self.geometry.equivalent_diameter_m
                    * integrated_mode_length_m
                    * string_modal_norm
                    * dipole_efficiency;
                let modal_acceleration = -mode.omega * mode.omega * mode.position;
                let string_pan = if self.geometry.string_count <= 1 {
                    0.0
                } else {
                    string_index as f64 / (self.geometry.string_count - 1) as f64 - 0.5
                };
                left_string_volume_acceleration +=
                    (1.0 - 0.18 * string_pan) * volume_residue_m2_per_sqrt_kg * modal_acceleration;
                right_string_volume_acceleration +=
                    (1.0 + 0.18 * string_pan) * volume_residue_m2_per_sqrt_kg * modal_acceleration;
            }
        }
        let scale =
            DIRECT_STRING_RADIATION_SCALE * AIR_DENSITY_KG_M3 / (4.0 * PI * RADIATION_DISTANCE_M);
        (
            left_pressure_pa + scale * left_string_volume_acceleration,
            right_pressure_pa + scale * right_string_volume_acceleration,
        )
    }
}

/// One physical piano with several simultaneously struck keys and one shared
/// soundboard.  This is deliberately not a mixer of independently rendered
/// notes: every string bank exchanges energy through the same bridge driving
/// point before the soundboard is advanced and observed once.
#[derive(Clone, Debug)]
pub struct PianoStem {
    dt: f64,
    parameters: PianoParameters,
    note_count: usize,
    keys: [Option<PianoKeyState>; MAX_PIANO_CHORD_NOTES],
    soundboard: [SoundboardMode; SOUNDBOARD_MODES],
    cumulative_loss_j: f64,
}

impl PianoStem {
    pub fn new(
        midis: &[i32],
        velocities: &[i32],
        sample_rate_hz: f64,
        parameters: PianoParameters,
    ) -> Result<Self, PianoError> {
        if midis.is_empty()
            || midis.len() > MAX_PIANO_CHORD_NOTES
            || midis.len() != velocities.len()
        {
            return Err(PianoError::InvalidParameters);
        }
        if !sample_rate_hz.is_finite() || !(8_000.0..=96_000.0).contains(&sample_rate_hz) {
            return Err(PianoError::InvalidSampleRate);
        }
        let parameters = parameters.validate()?;
        let mut sorted_midis = [0_i32; MAX_PIANO_CHORD_NOTES];
        let mut sorted_velocities = [0_i32; MAX_PIANO_CHORD_NOTES];
        for index in 0..midis.len() {
            if !(MIN_MIDI..=MAX_MIDI).contains(&midis[index]) {
                return Err(PianoError::InvalidMidi);
            }
            if midi_frequency_hz(midis[index]) >= 0.44 * sample_rate_hz {
                // Chords obey the same per-key anti-alias admission as the
                // single-note ABI. Checking only the first MIDI allowed a low
                // first note to smuggle an otherwise refused treble key into
                // an 8 kHz chord session.
                return Err(PianoError::InvalidSampleRate);
            }
            if !(1..=127).contains(&velocities[index]) {
                return Err(PianoError::InvalidVelocity);
            }
            sorted_midis[index] = midis[index];
            sorted_velocities[index] = velocities[index];
        }
        // Canonical key order makes the shared floating-point reduction and
        // therefore the rendered PCM independent of caller event ordering.
        for index in 1..midis.len() {
            let mut cursor = index;
            while cursor > 0 && sorted_midis[cursor] < sorted_midis[cursor - 1] {
                sorted_midis.swap(cursor, cursor - 1);
                sorted_velocities.swap(cursor, cursor - 1);
                cursor -= 1;
            }
        }
        for index in 1..midis.len() {
            if sorted_midis[index] == sorted_midis[index - 1] {
                // A piano has one hammer/key at a given MIDI pitch. Treat a
                // duplicate event as invalid input instead of injecting the
                // same physical hammer twice into one string bank.
                return Err(PianoError::InvalidParameters);
            }
        }

        let dt = 1.0 / sample_rate_hz;
        let mut keys: [Option<PianoKeyState>; MAX_PIANO_CHORD_NOTES] =
            core::array::from_fn(|_| None);
        for index in 0..midis.len() {
            let mut key = PianoKeyState::new(sorted_midis[index], sample_rate_hz)?;
            let strike = PianoStrike::from_velocity(
                sorted_velocities[index],
                sorted_midis[index],
                key.geometry.equivalent_diameter_m,
            )?;
            begin_key_strike(&mut key.contact, strike, sample_rate_hz, dt)?;
            keys[index] = Some(key);
        }
        let soundboard = build_soundboard_modes(parameters, sample_rate_hz)?;
        Ok(Self {
            dt,
            parameters,
            note_count: midis.len(),
            keys,
            soundboard,
            cumulative_loss_j: 0.0,
        })
    }

    pub fn note_count(&self) -> usize {
        self.note_count
    }

    pub fn represented_energy_j(&self) -> f64 {
        self.keys
            .iter()
            .flatten()
            .map(|key| key.string_energy_j() + key.hammer_energy_j())
            .sum::<f64>()
            + self.soundboard_energy_j()
            + self.bridge_contact_energy_j()
    }

    pub fn step(&mut self) -> Result<PianoOutput, PianoError> {
        for key in self.keys.iter_mut().flatten() {
            key.last_contact_iterations = 0;
            if key.contact.active {
                apply_hammer_contact_state(
                    &mut key.strings,
                    &mut key.contact,
                    &mut key.escaped_hammer_energy_j,
                    &mut key.last_contact_iterations,
                    &mut key.total_contact_iterations,
                    self.dt,
                );
            }
        }

        let mut damping_loss_j = 0.0;
        self.for_each_mode_mut(|mode| damping_loss_j += mode.apply_half_loss());
        self.advance_bridge_contacts_midpoint()?;
        self.for_each_mode_mut(|mode| damping_loss_j += mode.apply_half_loss());
        self.cumulative_loss_j += damping_loss_j;
        let string_energy_j = self.string_energy_j();
        let soundboard_energy_j = self.soundboard_energy_j();
        let bridge_contact_energy_j = self.bridge_contact_energy_j();

        let (left_pressure_pa, right_pressure_pa) = self.observe_pressure_pa();
        let hammer_contact_energy_j: f64 = self
            .keys
            .iter()
            .flatten()
            .map(PianoKeyState::hammer_energy_j)
            .sum();
        let escaped_hammer_energy_j: f64 = self
            .keys
            .iter()
            .flatten()
            .map(|key| key.escaped_hammer_energy_j)
            .sum();
        let contact_loss_j: f64 = self
            .keys
            .iter()
            .flatten()
            .map(|key| key.contact.dissipated_energy_j)
            .sum();
        let energy = string_energy_j
            + soundboard_energy_j
            + bridge_contact_energy_j
            + hammer_contact_energy_j;
        if !left_pressure_pa.is_finite() || !right_pressure_pa.is_finite() || !energy.is_finite() {
            return Err(PianoError::NonFiniteState);
        }
        if left_pressure_pa.abs() > self.parameters.maximum_abs_pressure_pa * self.note_count as f64
            || right_pressure_pa.abs()
                > self.parameters.maximum_abs_pressure_pa * self.note_count as f64
            || energy > self.parameters.maximum_total_energy_j * self.note_count as f64
        {
            return Err(PianoError::BudgetExceeded);
        }
        Ok(PianoOutput {
            left_pressure_pa,
            right_pressure_pa,
            string_energy_j,
            soundboard_energy_j,
            bridge_contact_energy_j,
            hammer_contact_energy_j,
            escaped_hammer_energy_j,
            cumulative_loss_j: self.cumulative_loss_j + contact_loss_j,
        })
    }

    /// Advance the exact physical state while returning only the pressure tap.
    /// Cooperative rendering uses this between chunk boundaries so it does
    /// not rescan every retained mode three additional times for diagnostic
    /// energy fields that the render ABI never exposes. The full [`Self::step`]
    /// audit still runs at every bounded 256-frame boundary and at completion;
    /// pressure finiteness and the absolute pressure budget remain per-sample.
    fn step_render_pressure(&mut self) -> Result<(f64, f64), PianoError> {
        for key in self.keys.iter_mut().flatten() {
            key.last_contact_iterations = 0;
            if key.contact.active {
                apply_hammer_contact_state(
                    &mut key.strings,
                    &mut key.contact,
                    &mut key.escaped_hammer_energy_j,
                    &mut key.last_contact_iterations,
                    &mut key.total_contact_iterations,
                    self.dt,
                );
            }
        }

        let mut damping_loss_j = 0.0;
        self.for_each_mode_mut(|mode| damping_loss_j += mode.apply_half_loss());
        self.advance_bridge_contacts_midpoint()?;
        self.for_each_mode_mut(|mode| damping_loss_j += mode.apply_half_loss());
        self.cumulative_loss_j += damping_loss_j;
        let (left_pressure_pa, right_pressure_pa) = self.observe_pressure_pa();
        if !left_pressure_pa.is_finite() || !right_pressure_pa.is_finite() {
            return Err(PianoError::NonFiniteState);
        }
        if left_pressure_pa.abs() > self.parameters.maximum_abs_pressure_pa * self.note_count as f64
            || right_pressure_pa.abs()
                > self.parameters.maximum_abs_pressure_pa * self.note_count as f64
        {
            return Err(PianoError::BudgetExceeded);
        }
        Ok((left_pressure_pa, right_pressure_pa))
    }

    /// Exact-source regression seam for the cooperative renderer's energy
    /// ledger. The shipping ABI calls the private pressure-only step; tests
    /// need to compare it with [`Self::step`] without exposing a second
    /// production rendering API.
    #[cfg(test)]
    pub fn step_render_pressure_for_test(&mut self) -> Result<(f64, f64), PianoError> {
        self.step_render_pressure()
    }

    #[cfg(test)]
    pub fn cumulative_loss_j_for_test(&self) -> f64 {
        self.cumulative_loss_j
            + self
                .keys
                .iter()
                .flatten()
                .map(|key| key.contact.dissipated_energy_j)
                .sum::<f64>()
    }

    fn for_each_mode_mut(&mut self, mut action: impl FnMut(&mut Mode)) {
        for key in self.keys.iter_mut().flatten() {
            for bank in &mut key.strings {
                for mode in &mut bank.modes {
                    action(mode);
                }
            }
        }
        for body in &mut self.soundboard {
            action(&mut body.mode);
        }
    }

    fn string_energy_j(&self) -> f64 {
        self.keys
            .iter()
            .flatten()
            .map(PianoKeyState::string_energy_j)
            .sum()
    }

    fn soundboard_energy_j(&self) -> f64 {
        self.soundboard
            .iter()
            .map(|mode| mode.mode.energy_j())
            .sum()
    }

    pub fn bridge_contact_energy_j(&self) -> f64 {
        let mut relative_squared_sum = 0.0;
        for key in self.keys.iter().flatten() {
            let string_displacement_m: f64 = key
                .strings
                .iter()
                .flat_map(|bank| bank.modes.iter())
                .map(|mode| mode.bridge_residue_m_neg_half_kg * mode.position)
                .sum();
            let body_displacement_m: f64 = self
                .soundboard
                .iter()
                .map(|body| body.mode.bridge_residue_m_neg_half_kg * body.mode.position)
                .sum();
            let relative = string_displacement_m - body_displacement_m;
            relative_squared_sum += relative * relative;
        }
        0.5 * self.parameters.bridge_contact_stiffness_n_per_m * relative_squared_sum
    }

    #[cfg(test)]
    pub fn set_test_key_bridge_displacement_m(
        &mut self,
        key_index: usize,
        displacement_m: f64,
    ) -> Result<(), PianoError> {
        if key_index >= self.note_count || !displacement_m.is_finite() {
            return Err(PianoError::InvalidParameters);
        }
        let key = self.keys[key_index]
            .as_mut()
            .ok_or(PianoError::InvalidParameters)?;
        let mode = key
            .strings
            .iter_mut()
            .flat_map(|bank| bank.modes.iter_mut())
            .find(|mode| mode.active && mode.bridge_residue_m_neg_half_kg.abs() > 1.0e-12)
            .ok_or(PianoError::InvalidParameters)?;
        mode.position = displacement_m / mode.bridge_residue_m_neg_half_kg;
        mode.velocity = 0.0;
        Ok(())
    }

    fn advance_bridge_contacts_midpoint(&mut self) -> Result<(), PianoError> {
        let half_dt = 0.5 * self.dt;
        let half_dt_squared_stiffness =
            half_dt * half_dt * self.parameters.bridge_contact_stiffness_n_per_m;
        let mut body_compliance = 0.0;
        let mut body_right_hand_side = 0.0;
        for body in &self.soundboard {
            let (compliance, right_hand_side) = accumulate_midpoint_contact_terms(
                body.mode,
                body.mode.bridge_residue_m_neg_half_kg,
                half_dt,
            );
            body_compliance += compliance;
            body_right_hand_side += right_hand_side;
        }

        let mut string_compliance = [0.0_f64; MAXIMUM_BRIDGE_CONTACTS];
        let mut right_hand_side = [0.0_f64; MAXIMUM_BRIDGE_CONTACTS];
        for key_index in 0..self.note_count {
            let key = self.keys[key_index]
                .as_ref()
                .ok_or(PianoError::NonFiniteState)?;
            let mut string_right_hand_side = 0.0;
            for bank in &key.strings {
                for mode in &bank.modes {
                    let (compliance, modal_right_hand_side) = accumulate_midpoint_contact_terms(
                        *mode,
                        mode.bridge_residue_m_neg_half_kg,
                        half_dt,
                    );
                    string_compliance[key_index] += compliance;
                    string_right_hand_side += modal_right_hand_side;
                }
            }
            right_hand_side[key_index] = string_right_hand_side - body_right_hand_side;
        }

        let mut matrix = [[0.0_f64; MAXIMUM_BRIDGE_CONTACTS]; MAXIMUM_BRIDGE_CONTACTS];
        for row in 0..self.note_count {
            for column in 0..self.note_count {
                if row != column {
                    matrix[row][column] = half_dt_squared_stiffness * body_compliance;
                }
            }
            matrix[row][row] =
                1.0 + half_dt_squared_stiffness * (string_compliance[row] + body_compliance);
        }
        let coordinates =
            solve_bridge_contact_coordinates(matrix, right_hand_side, self.note_count)?;

        for key_index in 0..self.note_count {
            let key = self.keys[key_index]
                .as_mut()
                .ok_or(PianoError::NonFiniteState)?;
            for bank in &mut key.strings {
                for mode in &mut bank.modes {
                    let residue = mode.bridge_residue_m_neg_half_kg;
                    finish_midpoint_contact_mode(
                        mode,
                        residue,
                        coordinates[key_index],
                        half_dt,
                        self.parameters.bridge_contact_stiffness_n_per_m,
                    );
                }
            }
        }
        for body in &mut self.soundboard {
            let mut coordinate_sum = 0.0;
            for key_index in 0..self.note_count {
                coordinate_sum += coordinates[key_index];
            }
            let residue = body.mode.bridge_residue_m_neg_half_kg;
            finish_midpoint_contact_mode(
                &mut body.mode,
                -residue,
                coordinate_sum,
                half_dt,
                self.parameters.bridge_contact_stiffness_n_per_m,
            );
        }
        Ok(())
    }

    fn observe_pressure_pa(&self) -> (f64, f64) {
        let mut left_pressure_pa = 0.0;
        let mut right_pressure_pa = 0.0;
        for body in &self.soundboard {
            left_pressure_pa += body.left_pressure_per_velocity_re * body.mode.velocity
                + body.left_pressure_per_velocity_im * body.mode.omega * body.mode.position;
            right_pressure_pa += body.right_pressure_per_velocity_re * body.mode.velocity
                + body.right_pressure_per_velocity_im * body.mode.omega * body.mode.position;
        }
        let mut left_string_volume_acceleration = 0.0;
        let mut right_string_volume_acceleration = 0.0;
        for key in self.keys.iter().flatten() {
            let string_modal_mass =
                0.5 * key.geometry.linear_density_kg_m * key.geometry.speaking_length_m;
            let string_modal_norm = 1.0 / sqrt(string_modal_mass);
            for (string_index, bank) in key.strings.iter().enumerate() {
                if !bank.active {
                    continue;
                }
                for (mode_index, mode) in bank.modes.iter().enumerate() {
                    if !mode.active || mode_index % 2 == 1 {
                        continue;
                    }
                    let order = (mode_index + 1) as f64;
                    let integrated_mode_length_m =
                        2.0 * key.geometry.speaking_length_m / (PI * order);
                    let dipole_efficiency = (mode.omega * key.geometry.equivalent_diameter_m
                        / AIR_SOUND_SPEED_M_PER_S)
                        .min(0.25);
                    let volume_residue_m2_per_sqrt_kg = key.geometry.equivalent_diameter_m
                        * integrated_mode_length_m
                        * string_modal_norm
                        * dipole_efficiency;
                    let modal_acceleration = -mode.omega * mode.omega * mode.position;
                    let string_pan = if key.geometry.string_count <= 1 {
                        0.0
                    } else {
                        string_index as f64 / (key.geometry.string_count - 1) as f64 - 0.5
                    };
                    left_string_volume_acceleration += (1.0 - 0.18 * string_pan)
                        * volume_residue_m2_per_sqrt_kg
                        * modal_acceleration;
                    right_string_volume_acceleration += (1.0 + 0.18 * string_pan)
                        * volume_residue_m2_per_sqrt_kg
                        * modal_acceleration;
                }
            }
        }
        let scale =
            DIRECT_STRING_RADIATION_SCALE * AIR_DENSITY_KG_M3 / (4.0 * PI * RADIATION_DISTANCE_M);
        (
            left_pressure_pa + scale * left_string_volume_acceleration,
            right_pressure_pa + scale * right_string_volume_acceleration,
        )
    }
}

pub fn midi_frequency_hz(midi: i32) -> f64 {
    440.0 * pow(2.0, (midi as f64 - 69.0) / 12.0)
}

/// Measured grand-piano hammer mass by key [kg].
///
/// Stulov, *A Simple Grand Piano Hammer Felt Model* (1995), table 1,
/// reports A0/A3/C4/A6 masses 13.0/10.6/8.9/8.2 g. Piecewise-linear
/// interpolation is the least-assumptive deterministic completion between
/// those reviewed keys; the unmeasured end tails hold their nearest anchor.
pub fn hammer_mass_kg_for_midi(midi: i32) -> Result<f64, PianoError> {
    interpolate_keyboard_anchor(
        midi,
        &[(21, 0.0130), (57, 0.0106), (60, 0.0089), (93, 0.0082)],
    )
}

/// Measured hammer-head curvature radius [m] from the same table 1 anchors.
pub fn hammer_head_radius_m_for_midi(midi: i32) -> Result<f64, PianoError> {
    interpolate_keyboard_anchor(midi, &[(21, 0.017), (57, 0.011), (60, 0.008), (93, 0.005)])
}

/// Measured hammer strike distance from the nearest string end divided by
/// speaking length. The same table gives 243/2016 at A0, 91/777 at A3,
/// 74.4/620 at C4, and 8.1/115 at A6. This residue belongs in the string
/// contact port; one fixed 11.8% position suppresses the wrong treble modes.
pub fn hammer_strike_position_over_length(midi: i32) -> Result<f64, PianoError> {
    interpolate_keyboard_anchor(
        midi,
        &[
            (21, 243.0 / 2_016.0),
            (57, 91.0 / 777.0),
            (60, 74.4 / 620.0),
            (93, 8.1 / 115.0),
        ],
    )
}

/// Measured duplex-scaling length [m] from Miranda Valiente et al. (JASA
/// 2024), table III: A1=0.11 m, D4=0.15 m, D5=0.05 m. Piecewise-linear
/// interpolation is the bounded completion between those reviewed keys. The
/// upper unmeasured tail preserves the D5 afterlength frequency ratio (length
/// halves per octave); holding 50 mm through C8 made the afterlength longer
/// than the speaking string. The low tail keeps the nearest measured length.
pub fn duplex_length_m_for_midi(midi: i32) -> Result<f64, PianoError> {
    if !(MIN_MIDI..=MAX_MIDI).contains(&midi) {
        return Err(PianoError::InvalidMidi);
    }
    const ANCHORS: [(i32, f64); 3] = [(33, 0.11), (62, 0.15), (74, 0.05)];
    if midi <= ANCHORS[0].0 {
        return Ok(ANCHORS[0].1);
    }
    for pair in ANCHORS.windows(2) {
        let (lower_midi, lower_value) = pair[0];
        let (upper_midi, upper_value) = pair[1];
        if midi <= upper_midi {
            let amount = (midi - lower_midi) as f64 / (upper_midi - lower_midi) as f64;
            return Ok(lower_value + amount * (upper_value - lower_value));
        }
    }
    let (upper_midi, upper_length_m) = ANCHORS[ANCHORS.len() - 1];
    Ok(upper_length_m * pow(2.0, -(midi - upper_midi) as f64 / 12.0))
}

fn interpolate_keyboard_anchor(midi: i32, anchors: &[(i32, f64); 4]) -> Result<f64, PianoError> {
    if !(MIN_MIDI..=MAX_MIDI).contains(&midi) {
        return Err(PianoError::InvalidMidi);
    }
    if midi <= anchors[0].0 {
        return Ok(anchors[0].1);
    }
    for pair in anchors.windows(2) {
        let (lower_midi, lower_value) = pair[0];
        let (upper_midi, upper_value) = pair[1];
        if midi <= upper_midi {
            let amount = (midi - lower_midi) as f64 / (upper_midi - lower_midi) as f64;
            return Ok(lower_value + amount * (upper_value - lower_value));
        }
    }
    Ok(anchors[anchors.len() - 1].1)
}

pub fn string_geometry(midi: i32) -> Result<StringGeometry, PianoError> {
    if !(MIN_MIDI..=MAX_MIDI).contains(&midi) {
        return Err(PianoError::InvalidMidi);
    }
    let register = (midi - MIN_MIDI) as f64 / (MAX_MIDI - MIN_MIDI) as f64;
    let fundamental_hz = midi_frequency_hz(midi);
    // Stulov 1995, table 1, gives the string rows paired with the hammer rows
    // already consumed above: A0/A3/C4/A6 speaking length, tension, linear
    // density, and outside diameter. The published values are rounded (their
    // L/T/mu triples miss the named pitch by up to 12 cents), and four sparse
    // lengths cannot be interpolated linearly across a logarithmic keyboard:
    // doing that made the old MIDI-48 geometry naturally tune near 76 Hz while
    // the modal bank silently forced 131 Hz. Interpolate the independently
    // physical T/mu rows, then derive L=sqrt(T/mu)/(2*f) from the named key.
    // This stays within 0.7% of every reported anchor and remains causal for
    // every intervening and upper-tail key instead of retuning a wrong length.
    let tension_n = interpolate_keyboard_anchor(
        midi,
        &[(21, 1_629.0), (57, 834.0), (60, 670.0), (93, 774.0)],
    )?;
    let linear_density_kg_m = interpolate_keyboard_anchor(
        midi,
        &[(21, 0.1307), (57, 0.0071), (60, 0.0063), (93, 0.0047)],
    )?;
    let equivalent_diameter_m = interpolate_keyboard_anchor(
        midi,
        &[
            (21, 0.0049),
            (57, 0.001_075),
            (60, 0.001_025),
            (93, 0.000_875),
        ],
    )?;
    let speaking_length_m = sqrt(tension_n / linear_density_kg_m) / (2.0 * fundamental_hz);
    let duplex_length_m = duplex_length_m_for_midi(midi)?;
    let total_length_m = speaking_length_m + duplex_length_m;
    let wound_core_fraction = 0.45 + 0.55 * smooth_step((midi as f64 - 40.0) / 18.0);
    let bending_radius_m = 0.5 * equivalent_diameter_m * wound_core_fraction;
    let second_moment_m4 = PI * pow(bending_radius_m, 4.0) / 4.0;
    let inharmonicity_coefficient = PI * PI * STEEL_YOUNG_MODULUS_PA * second_moment_m4
        / (tension_n * speaking_length_m * speaking_length_m);
    let string_count = if midi < 32 {
        1
    } else if midi < 49 {
        2
    } else {
        3
    };
    let detune_cents = 0.55 + 1.10 * register;
    let offsets = match string_count {
        1 => [0.0, 0.0, 0.0],
        2 => [-0.5, 0.5, 0.0],
        _ => [-1.0, 0.08, 1.0],
    };
    let mut unison_frequencies_hz = [0.0; MAX_UNISON_STRINGS];
    for index in 0..string_count {
        unison_frequencies_hz[index] =
            fundamental_hz * pow(2.0, offsets[index] * detune_cents / 1_200.0);
    }
    Ok(StringGeometry {
        midi,
        fundamental_hz,
        speaking_length_m,
        duplex_length_m,
        total_length_m,
        tension_n,
        linear_density_kg_m,
        equivalent_diameter_m,
        inharmonicity_coefficient,
        string_count,
        unison_frequencies_hz,
    })
}

pub fn stiff_string_mode_frequency_hz(
    measured_fundamental_hz: f64,
    inharmonicity_coefficient: f64,
    order: usize,
) -> f64 {
    let n = order as f64;
    n * measured_fundamental_hz
        * sqrt((1.0 + inharmonicity_coefficient * n * n) / (1.0 + inharmonicity_coefficient))
}

pub fn soundboard_mode_frequency_hz(
    parameters: PianoParameters,
    order_x: usize,
    order_y: usize,
) -> Result<f64, PianoError> {
    let parameters = parameters.validate()?;
    if order_x == 0 || order_y == 0 {
        return Err(PianoError::InvalidParameters);
    }
    let nu = parameters.soundboard_poisson_ratio;
    let thickness_cubed = parameters.soundboard_thickness_m
        * parameters.soundboard_thickness_m
        * parameters.soundboard_thickness_m;
    let denominator = 12.0 * (1.0 - nu * nu);
    let d_long = parameters.soundboard_longitudinal_modulus_pa * thickness_cubed / denominator;
    let bare_d_radial = parameters.soundboard_radial_modulus_pa * thickness_cubed / denominator;
    let d_cross = parameters.soundboard_shear_modulus_pa * thickness_cubed
        + nu * sqrt(d_long * bare_d_radial);
    // Smear the equally spaced transverse ribs into the bending direction
    // they reinforce.  EI/spacing has the plate-rigidity unit N m; the same
    // geometry contributes rho*A/spacing to areal mass.  This is the bounded
    // no-std analogue of the explicit fs-plate stiffener assembly.
    let rib_spacing_m =
        parameters.soundboard_length_m / (parameters.soundboard_rib_count + 1) as f64;
    let rib_second_moment_m4 = parameters.soundboard_rib_width_m
        * parameters.soundboard_rib_height_m
        * parameters.soundboard_rib_height_m
        * parameters.soundboard_rib_height_m
        / 12.0;
    let d_ribs = parameters.soundboard_rib_modulus_pa * rib_second_moment_m4 / rib_spacing_m;
    let d_radial = bare_d_radial + d_ribs;
    let areal_density_kg_m2 = parameters.soundboard_density_kg_m3
        * (parameters.soundboard_thickness_m
            + parameters.soundboard_rib_width_m * parameters.soundboard_rib_height_m
                / rib_spacing_m);
    let kx = order_x as f64 / parameters.soundboard_length_m;
    let ky = order_y as f64 / parameters.soundboard_width_m;
    let omega_squared = pow(PI, 4.0)
        * (d_long * pow(kx, 4.0) + 2.0 * d_cross * kx * kx * ky * ky + d_radial * pow(ky, 4.0))
        / areal_density_kg_m2;
    Ok(sqrt(omega_squared) / TAU)
}

/// Measured finished-soundboard modal damping from Miranda Valiente et al.
/// (JASA 2024), table II. Piecewise-linear interpolation is applied only
/// between the six measured modes; the unmeasured tails hold the nearest
/// measured damping instead of using a hand-shaped note-brightness curve.
pub fn soundboard_damping_ratio(frequency_hz: f64) -> Result<f64, PianoError> {
    const ANCHORS: [(f64, f64); 6] = [
        (75.0, 0.040),
        (118.8, 0.034),
        (145.3, 0.019),
        (182.8, 0.024),
        (242.2, 0.025),
        (260.9, 0.018),
    ];
    if !frequency_hz.is_finite() || frequency_hz <= 0.0 {
        return Err(PianoError::InvalidParameters);
    }
    if frequency_hz <= ANCHORS[0].0 {
        return Ok(ANCHORS[0].1);
    }
    for pair in ANCHORS.windows(2) {
        let (lower_frequency, lower_damping) = pair[0];
        let (upper_frequency, upper_damping) = pair[1];
        if frequency_hz <= upper_frequency {
            let amount = (frequency_hz - lower_frequency) / (upper_frequency - lower_frequency);
            return Ok(lower_damping + amount * (upper_damping - lower_damping));
        }
    }
    Ok(ANCHORS[ANCHORS.len() - 1].1)
}

pub fn render_piano_note(
    midi: i32,
    velocity: i32,
    sample_rate_hz: f64,
    left: &mut [f32],
    right: &mut [f32],
) -> Result<usize, PianoError> {
    let frames = left.len().min(right.len());
    if frames == 0 {
        return Err(PianoError::BudgetExceeded);
    }
    let parameters = PianoParameters::canonical();
    let mut voice = PianoVoice::new(midi, sample_rate_hz, parameters)?;
    voice.begin_strike(PianoStrike::from_velocity(
        velocity,
        midi,
        voice.geometry.equivalent_diameter_m,
    )?)?;
    for frame in 0..frames {
        let output = voice.step()?;
        left[frame] = (output.left_pressure_pa / DIGITAL_REFERENCE_PRESSURE_PA) as f32;
        right[frame] = (output.right_pressure_pa / DIGITAL_REFERENCE_PRESSURE_PA) as f32;
    }
    Ok(frames)
}

pub fn render_piano_chord(
    midis: &[i32],
    velocities: &[i32],
    sample_rate_hz: f64,
    left: &mut [f32],
    right: &mut [f32],
) -> Result<usize, PianoError> {
    let frames = left.len().min(right.len());
    if frames == 0 || frames > PNO2_MAX_ATTACK_FRAMES {
        return Err(PianoError::BudgetExceeded);
    }
    let mut stem = PianoStem::new(
        midis,
        velocities,
        sample_rate_hz,
        PianoParameters::canonical(),
    )?;
    let composite_gain = 1.0 / sqrt(stem.note_count() as f64);
    for frame in 0..frames {
        let output = stem.step()?;
        left[frame] =
            (composite_gain * output.left_pressure_pa / DIGITAL_REFERENCE_PRESSURE_PA) as f32;
        right[frame] =
            (composite_gain * output.right_pressure_pa / DIGITAL_REFERENCE_PRESSURE_PA) as f32;
    }
    Ok(frames)
}

/// Exact bounded frame capacity for the dark sample-free attack ABI.
///
/// Zero refuses any pitch or sample rate the physical core cannot construct.
#[no_mangle]
pub extern "C" fn pno2_note_frames(midi: i32, sample_rate: f32) -> i32 {
    if !(MIN_MIDI..=MAX_MIDI).contains(&midi)
        || !sample_rate.is_finite()
        || !(8_000.0..=96_000.0).contains(&sample_rate)
        || midi_frequency_hz(midi) >= 0.44 * sample_rate as f64
    {
        return 0;
    }
    (PNO2_ATTACK_SECONDS * sample_rate as f64) as i32
}

fn pno2_buffers_are_disjoint(left: *mut f32, right: *mut f32, frames: usize) -> bool {
    let Some(channel_bytes) = frames.checked_mul(core::mem::size_of::<f32>()) else {
        return false;
    };
    let left_start = left as usize;
    let right_start = right as usize;
    let Some(left_end) = left_start.checked_add(channel_bytes) else {
        return false;
    };
    let Some(right_end) = right_start.checked_add(channel_bytes) else {
        return false;
    };
    left_end <= right_start || right_end <= left_start
}

/// Safe slice entry used by the raw ABI and its independent bit-identity test.
/// `max_frames` may request a bounded prefix of the 320 ms attack; success
/// always fills that entire requested prefix. Refusal never silently truncates
/// to a shorter caller buffer.
pub fn pno2_render_slices(
    midi: i32,
    velocity: i32,
    sample_rate: f32,
    left: &mut [f32],
    right: &mut [f32],
    max_frames: i32,
) -> i32 {
    let natural = pno2_note_frames(midi, sample_rate);
    if natural == 0 || !(1..=127).contains(&velocity) || max_frames <= 0 {
        return 0;
    }
    let frames = natural.min(max_frames) as usize;
    if left.len() < frames || right.len() < frames {
        return 0;
    }
    match render_piano_note(
        midi,
        velocity,
        sample_rate as f64,
        &mut left[..frames],
        &mut right[..frames],
    ) {
        Ok(written) if written == frames => written as i32,
        _ => 0,
    }
}

/// Render one physical concert-grand attack (or the caller-requested bounded
/// prefix) into disjoint caller-owned stereo scratch. All pointer arithmetic
/// and alignment is proved before forming a Rust slice; zero is a deterministic
/// refusal and a positive result always equals `min(note_frames, max_frames)`.
#[no_mangle]
pub extern "C" fn pno2_render(
    midi: i32,
    velocity: i32,
    sample_rate: f32,
    left: *mut f32,
    right: *mut f32,
    max_frames: i32,
) -> i32 {
    let natural = pno2_note_frames(midi, sample_rate);
    if natural == 0
        || !(1..=127).contains(&velocity)
        || max_frames <= 0
        || left.is_null()
        || right.is_null()
        || !(left as usize).is_multiple_of(core::mem::align_of::<f32>())
        || !(right as usize).is_multiple_of(core::mem::align_of::<f32>())
    {
        return 0;
    }
    let frames = natural.min(max_frames) as usize;
    if !pno2_buffers_are_disjoint(left, right, frames) {
        return 0;
    }
    let out_left = unsafe { core::slice::from_raw_parts_mut(left, frames) };
    let out_right = unsafe { core::slice::from_raw_parts_mut(right, frames) };
    pno2_render_slices(
        midi,
        velocity,
        sample_rate,
        out_left,
        out_right,
        frames as i32,
    )
}

#[derive(Clone, Debug)]
struct PianoAttackSession {
    voice: PianoVoice,
    frames: usize,
    rendered_frames: usize,
}

impl PianoAttackSession {
    fn new(midi: i32, velocity: i32, sample_rate: f32, max_frames: i32) -> Option<Self> {
        let natural = pno2_note_frames(midi, sample_rate);
        if natural == 0 || !(1..=127).contains(&velocity) || max_frames <= 0 {
            return None;
        }
        let frames = natural.min(max_frames) as usize;
        if frames == 0 || frames > PNO2_MAX_ATTACK_FRAMES {
            return None;
        }
        let parameters = PianoParameters::canonical();
        let mut voice = PianoVoice::new(midi, sample_rate as f64, parameters).ok()?;
        voice
            .begin_strike(
                PianoStrike::from_velocity(velocity, midi, voice.geometry.equivalent_diameter_m)
                    .ok()?,
            )
            .ok()?;
        Some(Self {
            voice,
            frames,
            rendered_frames: 0,
        })
    }

    fn advance(&mut self, left: &mut [f32], right: &mut [f32]) -> Result<i32, PianoError> {
        if left.len() < self.frames
            || right.len() < self.frames
            || self.rendered_frames >= self.frames
        {
            return Ok(0);
        }
        let end = self
            .rendered_frames
            .saturating_add(PNO2_RUNTIME_STEP_FRAMES)
            .min(self.frames);
        for frame in self.rendered_frames..end {
            let output = match self.voice.step() {
                Ok(output) => output,
                Err(error) => {
                    left[..self.frames].fill(0.0);
                    right[..self.frames].fill(0.0);
                    return Err(error);
                }
            };
            left[frame] = (output.left_pressure_pa / DIGITAL_REFERENCE_PRESSURE_PA) as f32;
            right[frame] = (output.right_pressure_pa / DIGITAL_REFERENCE_PRESSURE_PA) as f32;
        }
        self.rendered_frames = end;
        if end == self.frames {
            Ok(PNO2_RUNTIME_STEP_COMPLETE)
        } else {
            Ok(PNO2_RUNTIME_STEP_PROGRESS)
        }
    }
}

#[derive(Clone, Debug)]
struct PianoChordAttackSession {
    stem: PianoStem,
    frames: usize,
    rendered_frames: usize,
    composite_gain: f64,
}

impl PianoChordAttackSession {
    fn new(midis: &[i32], velocities: &[i32], sample_rate: f32, max_frames: i32) -> Option<Self> {
        if max_frames <= 0 {
            return None;
        }
        let natural = pno2_note_frames(*midis.first()?, sample_rate);
        if natural == 0 {
            return None;
        }
        let frames = natural.min(max_frames) as usize;
        if frames == 0 || frames > PNO2_MAX_ATTACK_FRAMES {
            return None;
        }
        let stem = PianoStem::new(
            midis,
            velocities,
            sample_rate as f64,
            PianoParameters::canonical(),
        )
        .ok()?;
        let composite_gain = 1.0 / sqrt(stem.note_count() as f64);
        Some(Self {
            stem,
            frames,
            rendered_frames: 0,
            composite_gain,
        })
    }

    fn advance(&mut self, left: &mut [f32], right: &mut [f32]) -> Result<i32, PianoError> {
        if left.len() < self.frames
            || right.len() < self.frames
            || self.rendered_frames >= self.frames
        {
            return Ok(0);
        }
        let end = self
            .rendered_frames
            .saturating_add(PNO2_RUNTIME_STEP_FRAMES)
            .min(self.frames);
        for frame in self.rendered_frames..end {
            let pressure = match if frame + 1 == end {
                self.stem
                    .step()
                    .map(|output| (output.left_pressure_pa, output.right_pressure_pa))
            } else {
                self.stem.step_render_pressure()
            } {
                Ok(pressure) => pressure,
                Err(error) => {
                    left[..self.frames].fill(0.0);
                    right[..self.frames].fill(0.0);
                    return Err(error);
                }
            };
            left[frame] = (self.composite_gain * pressure.0 / DIGITAL_REFERENCE_PRESSURE_PA) as f32;
            right[frame] =
                (self.composite_gain * pressure.1 / DIGITAL_REFERENCE_PRESSURE_PA) as f32;
        }
        self.rendered_frames = end;
        if end == self.frames {
            Ok(PNO2_RUNTIME_STEP_COMPLETE)
        } else {
            Ok(PNO2_RUNTIME_STEP_PROGRESS)
        }
    }
}

#[derive(Clone, Copy)]
struct PianoRuntimeControl {
    active_handle: u32,
    next_handle: u32,
}

struct PianoRuntimeCell<T>(UnsafeCell<T>);

// SAFETY: every access to these cells is guarded by PNO2_RUNTIME_BUSY. The
// shipping WASM is single-threaded; the atomic additionally fails closed on
// accidental re-entry from host callbacks or native hostile-boundary tests.
unsafe impl<T> Sync for PianoRuntimeCell<T> {}

static PNO2_RUNTIME_BUSY: AtomicBool = AtomicBool::new(false);
static PNO2_RUNTIME_CONTROL: PianoRuntimeCell<PianoRuntimeControl> =
    PianoRuntimeCell(UnsafeCell::new(PianoRuntimeControl {
        active_handle: 0,
        next_handle: 1,
    }));
static PNO2_RUNTIME_SESSION: PianoRuntimeCell<MaybeUninit<PianoAttackSession>> =
    PianoRuntimeCell(UnsafeCell::new(MaybeUninit::uninit()));

fn with_pno2_runtime<ResultValue>(
    operation: impl FnOnce(
        &mut PianoRuntimeControl,
        &mut MaybeUninit<PianoAttackSession>,
    ) -> ResultValue,
) -> Option<ResultValue> {
    if PNO2_RUNTIME_BUSY
        .compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed)
        .is_err()
    {
        return None;
    }
    struct Release;
    impl Drop for Release {
        fn drop(&mut self) {
            PNO2_RUNTIME_BUSY.store(false, Ordering::Release);
        }
    }
    let _release = Release;
    // SAFETY: the atomic flag above excludes concurrent and re-entrant access.
    Some(unsafe {
        operation(
            &mut *PNO2_RUNTIME_CONTROL.0.get(),
            &mut *PNO2_RUNTIME_SESSION.0.get(),
        )
    })
}

/// Exact maximum number of cooperative calls for a caller-requested prefix.
/// Zero refuses a nonsensical or over-contract capacity.
#[no_mangle]
pub extern "C" fn pno2_runtime_max_steps(output_capacity: i32) -> i32 {
    let Ok(frames) = usize::try_from(output_capacity) else {
        return 0;
    };
    if frames == 0 || frames > PNO2_MAX_ATTACK_FRAMES {
        return 0;
    }
    i32::try_from(frames.div_ceil(PNO2_RUNTIME_STEP_FRAMES)).unwrap_or(0)
}

/// Construct one retained physical attack and return its opaque nonzero
/// handle. A later init replaces and drops any prior session atomically.
#[no_mangle]
pub extern "C" fn pno2_runtime_init(
    midi: i32,
    velocity: i32,
    sample_rate: f32,
    max_frames: i32,
) -> i32 {
    let Some(session) = PianoAttackSession::new(midi, velocity, sample_rate, max_frames) else {
        return 0;
    };
    with_pno2_runtime(|runtime, session_slot| {
        let handle = runtime.next_handle;
        if handle == 0 || handle > i32::MAX as u32 {
            return 0;
        }
        runtime.next_handle = if handle == i32::MAX as u32 {
            // Never recycle an opaque handle: a host may retain a stale value.
            // Exhaustion after more than two billion initializations therefore
            // fails closed instead of letting that stale value address a new
            // session.
            0
        } else {
            handle + 1
        };
        if runtime.active_handle != 0 {
            // SAFETY: a nonzero handle is the initialization bit for the slot.
            unsafe { session_slot.assume_init_drop() };
        }
        session_slot.write(session);
        runtime.active_handle = handle;
        handle as i32
    })
    .unwrap_or(0)
}

/// Advance at most [`PNO2_RUNTIME_STEP_FRAMES`] into the full caller-owned
/// output. Returns 1 for progress, 2 for completion, and zero for refusal.
#[no_mangle]
pub extern "C" fn pno2_runtime_step(
    handle: i32,
    left: *mut f32,
    right: *mut f32,
    output_capacity: i32,
) -> i32 {
    if handle <= 0
        || pno2_runtime_max_steps(output_capacity) == 0
        || left.is_null()
        || right.is_null()
        || !(left as usize).is_multiple_of(core::mem::align_of::<f32>())
        || !(right as usize).is_multiple_of(core::mem::align_of::<f32>())
    {
        return 0;
    }
    let frames = output_capacity as usize;
    if !pno2_buffers_are_disjoint(left, right, frames) {
        return 0;
    }
    with_pno2_runtime(|runtime, session_slot| {
        if runtime.active_handle != handle as u32 {
            return 0;
        }
        // SAFETY: the matching nonzero handle proves the slot is initialized.
        let session = unsafe { session_slot.assume_init_mut() };
        if session.frames != frames {
            return 0;
        }
        // SAFETY: null, alignment, checked range arithmetic, disjointness, and
        // exact session capacity were all established before forming slices.
        let out_left = unsafe { core::slice::from_raw_parts_mut(left, frames) };
        let out_right = unsafe { core::slice::from_raw_parts_mut(right, frames) };
        match session.advance(out_left, out_right) {
            Ok(status) => status,
            Err(_) => {
                // A synthesis error may leave the voice partway through a
                // failed physical update. Make that failure terminal so later
                // host turns cannot keep advancing a damaged state under the
                // same handle.
                unsafe { session_slot.assume_init_drop() };
                runtime.active_handle = 0;
                0
            }
        }
    })
    .unwrap_or(0)
}

/// Drop the matching retained session. Stale/foreign handles refuse without
/// disturbing the active one, so a superseded host task cannot cancel its
/// replacement.
#[no_mangle]
pub extern "C" fn pno2_runtime_reset(handle: i32) -> i32 {
    if handle <= 0 {
        return 0;
    }
    with_pno2_runtime(|runtime, session_slot| {
        if runtime.active_handle != handle as u32 {
            return 0;
        }
        // SAFETY: the matching nonzero handle proves the slot is initialized.
        unsafe { session_slot.assume_init_drop() };
        runtime.active_handle = 0;
        1
    })
    .unwrap_or(0)
}

static PNO2_CHORD_RUNTIME_BUSY: AtomicBool = AtomicBool::new(false);
static PNO2_CHORD_RUNTIME_CONTROL: PianoRuntimeCell<PianoRuntimeControl> =
    PianoRuntimeCell(UnsafeCell::new(PianoRuntimeControl {
        active_handle: 0,
        next_handle: 1,
    }));
static PNO2_CHORD_RUNTIME_SESSION: PianoRuntimeCell<MaybeUninit<PianoChordAttackSession>> =
    PianoRuntimeCell(UnsafeCell::new(MaybeUninit::uninit()));

fn with_pno2_chord_runtime<ResultValue>(
    operation: impl FnOnce(
        &mut PianoRuntimeControl,
        &mut MaybeUninit<PianoChordAttackSession>,
    ) -> ResultValue,
) -> Option<ResultValue> {
    if PNO2_CHORD_RUNTIME_BUSY
        .compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed)
        .is_err()
    {
        return None;
    }
    struct Release;
    impl Drop for Release {
        fn drop(&mut self) {
            PNO2_CHORD_RUNTIME_BUSY.store(false, Ordering::Release);
        }
    }
    let _release = Release;
    // SAFETY: the atomic flag excludes concurrent and callback-reentrant use.
    Some(unsafe {
        operation(
            &mut *PNO2_CHORD_RUNTIME_CONTROL.0.get(),
            &mut *PNO2_CHORD_RUNTIME_SESSION.0.get(),
        )
    })
}

fn pno2_i32_buffers_are_disjoint(left: *const i32, right: *const i32, values: usize) -> bool {
    let Some(bytes) = values.checked_mul(core::mem::size_of::<i32>()) else {
        return false;
    };
    let left_start = left as usize;
    let right_start = right as usize;
    let Some(left_end) = left_start.checked_add(bytes) else {
        return false;
    };
    let Some(right_end) = right_start.checked_add(bytes) else {
        return false;
    };
    left_end <= right_start || right_end <= left_start
}

#[no_mangle]
pub extern "C" fn pno2_chord_runtime_max_steps(output_capacity: i32) -> i32 {
    pno2_runtime_max_steps(output_capacity)
}

/// Construct one simultaneous multi-key physical attack sharing a single
/// soundboard. MIDI and velocity arrays must be disjoint, aligned, and contain
/// exactly `note_count` values; a later init atomically supersedes the prior
/// chord session.
#[no_mangle]
pub extern "C" fn pno2_chord_runtime_init(
    midis: *const i32,
    velocities: *const i32,
    note_count: i32,
    sample_rate: f32,
    max_frames: i32,
) -> i32 {
    let Ok(notes) = usize::try_from(note_count) else {
        return 0;
    };
    if !(1..=MAX_PIANO_CHORD_NOTES).contains(&notes)
        || midis.is_null()
        || velocities.is_null()
        || !(midis as usize).is_multiple_of(core::mem::align_of::<i32>())
        || !(velocities as usize).is_multiple_of(core::mem::align_of::<i32>())
        || !pno2_i32_buffers_are_disjoint(midis, velocities, notes)
    {
        return 0;
    }
    // SAFETY: pointers are present/aligned, their tiny fixed spans cannot
    // overflow, and disjointness was established above.
    let midi_slice = unsafe { core::slice::from_raw_parts(midis, notes) };
    let velocity_slice = unsafe { core::slice::from_raw_parts(velocities, notes) };
    let Some(session) =
        PianoChordAttackSession::new(midi_slice, velocity_slice, sample_rate, max_frames)
    else {
        return 0;
    };
    with_pno2_chord_runtime(|runtime, session_slot| {
        let handle = runtime.next_handle;
        if handle == 0 || handle > i32::MAX as u32 {
            return 0;
        }
        runtime.next_handle = if handle == i32::MAX as u32 {
            0
        } else {
            handle + 1
        };
        if runtime.active_handle != 0 {
            // SAFETY: the active handle is the initialization bit.
            unsafe { session_slot.assume_init_drop() };
        }
        session_slot.write(session);
        runtime.active_handle = handle;
        handle as i32
    })
    .unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn pno2_chord_runtime_step(
    handle: i32,
    left: *mut f32,
    right: *mut f32,
    output_capacity: i32,
) -> i32 {
    if handle <= 0
        || pno2_chord_runtime_max_steps(output_capacity) == 0
        || left.is_null()
        || right.is_null()
        || !(left as usize).is_multiple_of(core::mem::align_of::<f32>())
        || !(right as usize).is_multiple_of(core::mem::align_of::<f32>())
    {
        return 0;
    }
    let frames = output_capacity as usize;
    if !pno2_buffers_are_disjoint(left, right, frames) {
        return 0;
    }
    with_pno2_chord_runtime(|runtime, session_slot| {
        if runtime.active_handle != handle as u32 {
            return 0;
        }
        // SAFETY: the matching nonzero handle proves initialization.
        let session = unsafe { session_slot.assume_init_mut() };
        if session.frames != frames {
            return 0;
        }
        // SAFETY: pointer presence, alignment, checked spans, disjointness,
        // and exact retained capacity were proved above.
        let out_left = unsafe { core::slice::from_raw_parts_mut(left, frames) };
        let out_right = unsafe { core::slice::from_raw_parts_mut(right, frames) };
        match session.advance(out_left, out_right) {
            Ok(status) => status,
            Err(_) => {
                unsafe { session_slot.assume_init_drop() };
                runtime.active_handle = 0;
                0
            }
        }
    })
    .unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn pno2_chord_runtime_reset(handle: i32) -> i32 {
    if handle <= 0 {
        return 0;
    }
    with_pno2_chord_runtime(|runtime, session_slot| {
        if runtime.active_handle != handle as u32 {
            return 0;
        }
        // SAFETY: the matching nonzero handle proves initialization.
        unsafe { session_slot.assume_init_drop() };
        runtime.active_handle = 0;
        1
    })
    .unwrap_or(0)
}

fn build_soundboard_modes(
    parameters: PianoParameters,
    sample_rate_hz: f64,
) -> Result<[SoundboardMode; SOUNDBOARD_MODES], PianoError> {
    let rib_spacing_m =
        parameters.soundboard_length_m / (parameters.soundboard_rib_count + 1) as f64;
    let areal_density_kg_m2 = parameters.soundboard_density_kg_m3
        * (parameters.soundboard_thickness_m
            + parameters.soundboard_rib_width_m * parameters.soundboard_rib_height_m
                / rib_spacing_m);
    let modal_mass =
        0.25 * areal_density_kg_m2 * parameters.soundboard_length_m * parameters.soundboard_width_m;
    let modal_norm = 1.0 / sqrt(modal_mass);
    let mut modes = [SoundboardMode::ZERO; SOUNDBOARD_MODES];
    let mut index = 0usize;
    for order_y in 1_u8..=12 {
        for order_x in 1_u8..=24 {
            let frequency_hz =
                soundboard_mode_frequency_hz(parameters, order_x as usize, order_y as usize)?;
            if frequency_hz < 0.44 * sample_rate_hz {
                let omega = TAU * frequency_hz;
                // Far-field Rayleigh observer at this mode's natural
                // frequency. `modal_plane_integral_m2` exactly integrates the
                // sine mode against directional phase, retaining finite
                // spatial cancellation while admitting real high-mode
                // multipoles. The stored real/imaginary transfer follows the
                // fs-couple narrow-band pressure-per-modal-velocity law.
                let wave_number_per_m = omega / AIR_SOUND_SPEED_M_PER_S;
                let (left_integral_re, left_integral_im) = modal_plane_integral_m2(
                    order_x,
                    order_y,
                    parameters.soundboard_length_m,
                    parameters.soundboard_width_m,
                    wave_number_per_m,
                    -0.35,
                    0.12,
                )?;
                let (right_integral_re, right_integral_im) = modal_plane_integral_m2(
                    order_x,
                    order_y,
                    parameters.soundboard_length_m,
                    parameters.soundboard_width_m,
                    wave_number_per_m,
                    0.35,
                    0.12,
                )?;
                // Infinite-baffle Rayleigh radiation has `2*pi*r` in the
                // denominator.  The earlier free-space `4*pi*r` factor was
                // inconsistent with a piano soundboard mounted in its rim
                // and with FrankenSim's baffled-plate observer contract.
                let observer_scale =
                    AIR_DENSITY_KG_M3 * omega * modal_norm / (2.0 * PI * RADIATION_DISTANCE_M);
                let damping_ratio = soundboard_damping_ratio(frequency_hz)?;
                let t60 = LN_1000 / (TAU * frequency_hz * damping_ratio);
                modes[index] = SoundboardMode {
                    mode: Mode {
                        active: true,
                        position: 0.0,
                        velocity: 0.0,
                        frequency_hz,
                        omega,
                        midpoint_omega: prewarped_midpoint_omega(
                            frequency_hz,
                            1.0 / sample_rate_hz,
                        ),
                        half_velocity_decay: split_t60_half_velocity_decay(
                            t60,
                            1.0 / sample_rate_hz,
                        ),
                        contact_residue_m_neg_half_kg: 0.0,
                        bridge_residue_m_neg_half_kg: sin(PI
                            * order_x as f64
                            * parameters.bridge_x_over_length)
                            * sin(PI * order_y as f64 * parameters.bridge_y_over_width)
                            * modal_norm,
                    },
                    order_x,
                    order_y,
                    left_pressure_per_velocity_re: -observer_scale * left_integral_im,
                    left_pressure_per_velocity_im: observer_scale * left_integral_re,
                    right_pressure_per_velocity_re: -observer_scale * right_integral_im,
                    right_pressure_per_velocity_im: observer_scale * right_integral_re,
                };
            }
            index += 1;
        }
    }
    for index in 1..SOUNDBOARD_MODES {
        let mut cursor = index;
        while cursor > 0
            && ((modes[cursor].mode.active && !modes[cursor - 1].mode.active)
                || (modes[cursor].mode.active == modes[cursor - 1].mode.active
                    && modes[cursor].mode.frequency_hz < modes[cursor - 1].mode.frequency_hz))
        {
            modes.swap(cursor, cursor - 1);
            cursor -= 1;
        }
    }
    Ok(modes)
}

/// Exact integral of a simply-supported rectangular sine mode against a
/// centered far-field plane-wave phase. The result is complex square metres
/// as `(real, imaginary)`.
pub fn modal_plane_integral_m2(
    order_x: u8,
    order_y: u8,
    length_m: f64,
    width_m: f64,
    wave_number_per_m: f64,
    direction_x: f64,
    direction_y: f64,
) -> Result<(f64, f64), PianoError> {
    if order_x == 0
        || order_y == 0
        || !length_m.is_finite()
        || length_m <= 0.0
        || !width_m.is_finite()
        || width_m <= 0.0
        || !wave_number_per_m.is_finite()
        || wave_number_per_m < 0.0
        || !direction_x.is_finite()
        || !direction_y.is_finite()
        || direction_x * direction_x + direction_y * direction_y > 1.0 + 1.0e-12
    {
        return Err(PianoError::InvalidParameters);
    }
    let (x_re, x_im) =
        modal_axis_plane_integral_m(order_x, length_m, wave_number_per_m * direction_x);
    let (y_re, y_im) =
        modal_axis_plane_integral_m(order_y, width_m, wave_number_per_m * direction_y);
    Ok((x_re * y_re - x_im * y_im, x_re * y_im + x_im * y_re))
}

fn modal_axis_plane_integral_m(order: u8, length_m: f64, phase_gradient_per_m: f64) -> (f64, f64) {
    let order_pi = order as f64 * PI;
    let phase_across_axis = phase_gradient_per_m * length_m;
    let minus = cardinal_sine(0.5 * (order_pi - phase_across_axis));
    let plus = cardinal_sine(0.5 * (order_pi + phase_across_axis));
    let theta = 0.5 * order_pi;
    (
        0.5 * length_m * sin(theta) * (minus + plus),
        -0.5 * length_m * cos(theta) * (minus - plus),
    )
}

fn cardinal_sine(value: f64) -> f64 {
    if value.abs() <= 1.0e-8 {
        let squared = value * value;
        1.0 - squared / 6.0 + squared * squared / 120.0
    } else {
        sin(value) / value
    }
}

fn felt_potential_j(stiffness: f64, exponent: f64, compression_m: f64) -> f64 {
    stiffness * pow(compression_m.max(0.0), exponent + 1.0) / (exponent + 1.0)
}

fn felt_potential_gradient(stiffness: f64, exponent: f64, before_m: f64, after_m: f64) -> f64 {
    let delta = after_m - before_m;
    if delta.abs() <= 1.0e-15 {
        stiffness * pow(0.5 * (before_m + after_m).max(0.0), exponent)
    } else {
        (felt_potential_j(stiffness, exponent, after_m)
            - felt_potential_j(stiffness, exponent, before_m))
            / delta
    }
}

fn felt_force_n(stiffness: f64, exponent: f64, before_m: f64, after_m: f64) -> f64 {
    let before = before_m.max(0.0);
    let after = after_m.max(0.0);
    // The reviewed all-key Stulov approximation is elastic. The discrete
    // gradient makes contact exactly energy consistent while zero clamping
    // refuses tensile felt. Do not splice in a relaxation constant measured
    // from a different hammer: that hybrid reverses hard/soft ordering.
    felt_potential_gradient(stiffness, exponent, before, after).max(0.0)
}

fn smooth_step(value: f64) -> f64 {
    let x = value.clamp(0.0, 1.0);
    x * x * (3.0 - 2.0 * x)
}
