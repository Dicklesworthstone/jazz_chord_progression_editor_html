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
//! - an energy-consistent unilateral, rate-dependent felt power-port contact;
//! - separate conservative string-to-bridge contact springs feeding one
//!   shared orthotropic soundboard modal reduction; and
//! - a baffled Rayleigh far-field observer formed from modal velocity.
//!
//! The soundboard is an offline FrankenSim `fs-plate` DKT reduction with
//! explicit eccentric ribs. Its mass-normal modes, bridge residues, and
//! baffled observer coefficients are checked into a fixed pack, so the no-std
//! WASM core imports no FrankenSim crate at runtime. The geometry is still a
//! bounded reviewed rectangular approximation, not a claim of a scanned
//! concert-grand plate. This candidate itself reads no samples; the shipping
//! `@1` recipe still retains its recorded attack until an independent
//! reference comparison and owner listening gate approve the physical `@2`.

use core::{
    cell::UnsafeCell,
    mem::MaybeUninit,
    sync::atomic::{AtomicBool, Ordering},
};
use libm::{cos, exp, pow, sin, sqrt, tan};

#[path = "piano_v2_scale.rs"]
pub mod piano_v2_scale;
use piano_v2_scale::reviewed_string_scale_row;
#[rustfmt::skip]
#[path = "piano_v2_soundboard.rs"]
pub(crate) mod piano_v2_soundboard;
use piano_v2_soundboard::PIANO_V2_SOUNDBOARD_MODE_PACK;

const PI: f64 = core::f64::consts::PI;
const TAU: f64 = 2.0 * PI;
const LN_1000: f64 = 6.907_755_278_982_137;

pub const MIN_MIDI: i32 = 21;
pub const MAX_MIDI: i32 = 108;
pub const MAX_UNISON_STRINGS: usize = 3;
pub const MAX_PIANO_CHORD_NOTES: usize = 8;
pub const STRING_MODES: usize = 24;
// Craig--Bampton string reduction: one explicit bridge constraint coordinate,
// twenty fixed-interface speaking modes, and three fixed-interface duplex
// modes.  A global agraffe-to-hitch sine bank needs many ultrasonic modes to
// represent the sharp internal bridge node; after band-limiting, that basis
// detuned the audible C7 comb by more than half a semitone.  The component
// basis represents the bridge displacement exactly before modal truncation.
const STRING_SPEAKING_COMPONENT_MODES: usize = 20;
const STRING_DUPLEX_COMPONENT_MODES: usize = STRING_MODES - 1 - STRING_SPEAKING_COMPONENT_MODES;
const STRING_EIGEN_JACOBI_SWEEPS: usize = 48;
pub const SOUNDBOARD_MODES: usize = 288;
pub const CONTACT_SOLVE_STEPS: usize = 16;
/// Maximum physical string-to-bridge contacts in one rendered chord.  Every
/// unison string owns its own local contact spring; contacts at one key share
/// the same soundboard driving point but must not be collapsed into one summed
/// string displacement.
pub const MAXIMUM_BRIDGE_CONTACTS: usize = MAX_PIANO_CHORD_NOTES * MAX_UNISON_STRINGS;
const MAXIMUM_BRIDGE_SOLVE_DIMENSION: usize = MAX_PIANO_CHORD_NOTES;
/// Conservative bound for the fixed-size bridge-contact Cholesky solve.
/// Exact diagonal elimination reduces the at-most 24 independent string
/// contacts to one aggregate board-force coordinate per key.  The remaining
/// solve therefore never exceeds an 8 by 8 matrix and never falls back to a
/// search.
pub const MAXIMUM_BRIDGE_SOLVE_SCALAR_UPDATES: usize = MAXIMUM_BRIDGE_SOLVE_DIMENSION
    * MAXIMUM_BRIDGE_SOLVE_DIMENSION
    * MAXIMUM_BRIDGE_SOLVE_DIMENSION;
pub const MAXIMUM_STATE_BYTES: usize = 64 * 1024;

// INRIA RT-0425, section 3.2. The full wrapped-string parameter pack uses
// this modulus together with its reported diameter and equivalent density.
const STEEL_YOUNG_MODULUS_PA: f64 = 2.02e11;
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
    /// Number of explicit transverse ribs represented by the offline DKT pack.
    pub soundboard_rib_count: usize,
    pub soundboard_rib_width_m: f64,
    pub soundboard_rib_height_m: f64,
    pub soundboard_rib_modulus_pa: f64,
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
    /// Stulov's measured `Q0` coefficient [N/mm^p].
    pub felt_static_stiffness_n_per_mm_pow_exponent: f64,
    pub felt_exponent: f64,
    /// Stulov's rate coefficient `a` [s].
    pub felt_rate_time_seconds: f64,
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
        let [felt_static_stiffness, felt_exponent, felt_rate_time_seconds] =
            stulov_felt_parameters_for_midi(midi)?;
        let amount = velocity as f64 / 127.0;
        let hardness = 0.12 + 0.78 * pow(amount, 0.72);
        let hammer_velocity_m_per_s = 0.28 + 4.15 * pow(amount, 0.82);
        let impact_energy_j =
            0.5 * hammer_mass_kg * hammer_velocity_m_per_s * hammer_velocity_m_per_s;
        // Stulov 2008, Eqs. (9)-(11), fits the same measured hammer set with
        // F=Q0[u_mm^p + a*d(u_mm^p)/dt].  The rate term is the mechanism that
        // produces the measured felt hysteresis; substituting one elastic
        // modulus made medium attacks sub-millisecond impulses and materially
        // over-energized upper string modes.
        let peak_indent_mm = pow(
            (felt_exponent + 1.0) * 1_000.0 * impact_energy_j / felt_static_stiffness,
            1.0 / (felt_exponent + 1.0),
        );
        let elastic_peak_force_n = felt_static_stiffness * pow(peak_indent_mm, felt_exponent);
        let rate_peak_force_n = felt_static_stiffness
            * felt_rate_time_seconds
            * felt_exponent
            * pow(peak_indent_mm, felt_exponent - 1.0)
            * 1_000.0
            * hammer_velocity_m_per_s;
        let maximum_force_n = (2.5 * (elastic_peak_force_n + rate_peak_force_n)).min(20_000.0);
        Ok(Self {
            velocity,
            hardness,
            hammer_mass_kg,
            hammer_velocity_m_per_s,
            impact_energy_j,
            felt_static_stiffness_n_per_mm_pow_exponent: felt_static_stiffness,
            felt_exponent,
            felt_rate_time_seconds,
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

fn finish_midpoint_generalized_contact_mode(
    mode: &mut Mode,
    signed_generalized_contact_coordinate_m_sqrt_kg: f64,
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
        * signed_generalized_contact_coordinate_m_sqrt_kg
        * midpoint_inverse_diagonal(*mode, half_dt);
    let next_position = free_position - correction;
    // This is the exact companion velocity relation of implicit midpoint:
    // q1 - q0 = dt/2 * (v0 + v1).
    let next_velocity = (next_position - old_position) / half_dt - old_velocity;
    mode.position = next_position;
    mode.velocity = next_velocity;
}

fn finish_midpoint_contact_mode(
    mode: &mut Mode,
    signed_residue_m_neg_half_kg: f64,
    contact_coordinate_sum_m_sqrt_kg: f64,
    half_dt: f64,
    contact_stiffness_n_per_m: f64,
) {
    finish_midpoint_generalized_contact_mode(
        mode,
        signed_residue_m_neg_half_kg * contact_coordinate_sum_m_sqrt_kg,
        half_dt,
        contact_stiffness_n_per_m,
    );
}

fn solve_bridge_contact_coordinates(
    matrix: [[f64; MAXIMUM_BRIDGE_SOLVE_DIMENSION]; MAXIMUM_BRIDGE_SOLVE_DIMENSION],
    right_hand_side: [f64; MAXIMUM_BRIDGE_SOLVE_DIMENSION],
    contact_count: usize,
) -> Result<[f64; MAXIMUM_BRIDGE_SOLVE_DIMENSION], PianoError> {
    if contact_count == 0 || contact_count > MAXIMUM_BRIDGE_SOLVE_DIMENSION {
        return Err(PianoError::InvalidParameters);
    }
    let mut lower = [[0.0_f64; MAXIMUM_BRIDGE_SOLVE_DIMENSION]; MAXIMUM_BRIDGE_SOLVE_DIMENSION];
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
    let mut intermediate = [0.0_f64; MAXIMUM_BRIDGE_SOLVE_DIMENSION];
    for row in 0..contact_count {
        let mut value = right_hand_side[row];
        for column in 0..row {
            value -= lower[row][column] * intermediate[column];
        }
        intermediate[row] = value / lower[row][row];
    }
    let mut solution = [0.0_f64; MAXIMUM_BRIDGE_SOLVE_DIMENSION];
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

/// Solve independent per-string contact springs while retaining an 8 by 8
/// key-level system.  For contact `s` at key `k`, diagonal elimination gives
///
/// `D_ks c_ks + a sum_l B_kl C_l = r_ks`, `C_k = sum_s c_ks`.
///
/// Scaling `C_k = sqrt(A_k) y_k`, where `A_k = sum_s 1/D_ks`, produces the
/// symmetric positive-definite reduced matrix
/// `I + a sqrt(A) B sqrt(A)`.  This is algebraically identical to solving all
/// physical string contacts, but avoids a 24 by 24 factorization per sample.
fn solve_separate_string_bridge_contacts(
    string_compliance: [[f64; MAX_UNISON_STRINGS]; MAX_PIANO_CHORD_NOTES],
    string_right_hand_side: [[f64; MAX_UNISON_STRINGS]; MAX_PIANO_CHORD_NOTES],
    string_counts: [usize; MAX_PIANO_CHORD_NOTES],
    body_right_hand_side: [f64; MAX_PIANO_CHORD_NOTES],
    body_compliance: [[f64; MAX_PIANO_CHORD_NOTES]; MAX_PIANO_CHORD_NOTES],
    note_count: usize,
    half_dt_squared_stiffness: f64,
) -> Result<
    (
        [[f64; MAX_UNISON_STRINGS]; MAX_PIANO_CHORD_NOTES],
        [f64; MAX_PIANO_CHORD_NOTES],
    ),
    PianoError,
> {
    if note_count == 0
        || note_count > MAX_PIANO_CHORD_NOTES
        || !half_dt_squared_stiffness.is_finite()
        || half_dt_squared_stiffness <= 0.0
    {
        return Err(PianoError::InvalidParameters);
    }
    let mut inverse_diagonal = [[0.0_f64; MAX_UNISON_STRINGS]; MAX_PIANO_CHORD_NOTES];
    let mut aggregate_inverse_diagonal = [0.0_f64; MAX_PIANO_CHORD_NOTES];
    let mut aggregate_right_hand_side = [0.0_f64; MAX_PIANO_CHORD_NOTES];
    for key_index in 0..note_count {
        let string_count = string_counts[key_index];
        if string_count == 0 || string_count > MAX_UNISON_STRINGS {
            return Err(PianoError::InvalidParameters);
        }
        for string_index in 0..string_count {
            let diagonal =
                1.0 + half_dt_squared_stiffness * string_compliance[key_index][string_index];
            if !diagonal.is_finite() || diagonal <= 0.0 {
                return Err(PianoError::NonFiniteState);
            }
            let inverse = 1.0 / diagonal;
            let relative_right_hand_side =
                string_right_hand_side[key_index][string_index] - body_right_hand_side[key_index];
            inverse_diagonal[key_index][string_index] = inverse;
            aggregate_inverse_diagonal[key_index] += inverse;
            aggregate_right_hand_side[key_index] += inverse * relative_right_hand_side;
        }
    }

    let mut reduced_matrix =
        [[0.0_f64; MAXIMUM_BRIDGE_SOLVE_DIMENSION]; MAXIMUM_BRIDGE_SOLVE_DIMENSION];
    let mut reduced_right_hand_side = [0.0_f64; MAXIMUM_BRIDGE_SOLVE_DIMENSION];
    let mut square_root_inverse_sum = [0.0_f64; MAX_PIANO_CHORD_NOTES];
    for key_index in 0..note_count {
        square_root_inverse_sum[key_index] = sqrt(aggregate_inverse_diagonal[key_index]);
        reduced_right_hand_side[key_index] =
            aggregate_right_hand_side[key_index] / square_root_inverse_sum[key_index];
        for other_key_index in 0..note_count {
            reduced_matrix[key_index][other_key_index] = half_dt_squared_stiffness
                * square_root_inverse_sum[key_index]
                * body_compliance[key_index][other_key_index]
                * square_root_inverse_sum[other_key_index];
        }
        reduced_matrix[key_index][key_index] += 1.0;
    }
    let reduced_coordinates =
        solve_bridge_contact_coordinates(reduced_matrix, reduced_right_hand_side, note_count)?;
    let mut aggregate_coordinates = [0.0_f64; MAX_PIANO_CHORD_NOTES];
    for key_index in 0..note_count {
        aggregate_coordinates[key_index] =
            square_root_inverse_sum[key_index] * reduced_coordinates[key_index];
    }

    let mut physical_coordinates = [[0.0_f64; MAX_UNISON_STRINGS]; MAX_PIANO_CHORD_NOTES];
    for key_index in 0..note_count {
        let mut body_correction = 0.0;
        for other_key_index in 0..note_count {
            body_correction += body_compliance[key_index][other_key_index]
                * aggregate_coordinates[other_key_index];
        }
        for string_index in 0..string_counts[key_index] {
            let relative_right_hand_side =
                string_right_hand_side[key_index][string_index] - body_right_hand_side[key_index];
            physical_coordinates[key_index][string_index] = inverse_diagonal[key_index]
                [string_index]
                * (relative_right_hand_side - half_dt_squared_stiffness * body_correction);
            if !physical_coordinates[key_index][string_index].is_finite() {
                return Err(PianoError::NonFiniteState);
            }
        }
        // Use the actual sum of the recovered physical contacts for the board
        // force.  This keeps the string and board generalized work conjugate
        // down to floating-point roundoff.
        aggregate_coordinates[key_index] = physical_coordinates[key_index]
            [..string_counts[key_index]]
            .iter()
            .sum();
    }
    Ok((physical_coordinates, aggregate_coordinates))
}

/// Exact production-solver seam for an independently calculated three-string
/// known answer.  The test supplies already accumulated midpoint compliances
/// and right-hand sides, so it does not reuse the modal reduction under test.
#[cfg(test)]
pub fn separate_unison_bridge_contact_coordinates(
    string_compliance: [f64; MAX_UNISON_STRINGS],
    string_right_hand_side: [f64; MAX_UNISON_STRINGS],
    body_right_hand_side: f64,
    body_compliance: f64,
    half_dt_squared_stiffness: f64,
) -> Result<([f64; MAX_UNISON_STRINGS], f64), PianoError> {
    let mut all_string_compliance = [[0.0_f64; MAX_UNISON_STRINGS]; MAX_PIANO_CHORD_NOTES];
    all_string_compliance[0] = string_compliance;
    let mut all_string_right_hand_side = [[0.0_f64; MAX_UNISON_STRINGS]; MAX_PIANO_CHORD_NOTES];
    all_string_right_hand_side[0] = string_right_hand_side;
    let mut string_counts = [0usize; MAX_PIANO_CHORD_NOTES];
    string_counts[0] = MAX_UNISON_STRINGS;
    let mut all_body_right_hand_side = [0.0_f64; MAX_PIANO_CHORD_NOTES];
    all_body_right_hand_side[0] = body_right_hand_side;
    let mut all_body_compliance = [[0.0_f64; MAX_PIANO_CHORD_NOTES]; MAX_PIANO_CHORD_NOTES];
    all_body_compliance[0][0] = body_compliance;
    let (physical, aggregate) = solve_separate_string_bridge_contacts(
        all_string_compliance,
        all_string_right_hand_side,
        string_counts,
        all_body_right_hand_side,
        all_body_compliance,
        1,
        half_dt_squared_stiffness,
    )?;
    Ok((physical[0], aggregate[0]))
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
    let mut matrix = [[0.0_f64; MAXIMUM_BRIDGE_SOLVE_DIMENSION]; MAXIMUM_BRIDGE_SOLVE_DIMENSION];
    matrix[0][0] =
        1.0 + half_dt * half_dt * contact_stiffness_n_per_m * (string_compliance + body_compliance);
    let mut right_hand_side = [0.0_f64; MAXIMUM_BRIDGE_SOLVE_DIMENSION];
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

fn string_bank_bridge_displacement_m(bank: &StringBank) -> f64 {
    bank.modes
        .iter()
        .map(|mode| mode.bridge_residue_m_neg_half_kg * mode.position)
        .sum()
}

#[derive(Clone, Copy, Debug)]
struct SoundboardMode {
    mode: Mode,
    pack_index: u16,
    left_pressure_per_velocity_re: f64,
    left_pressure_per_velocity_im: f64,
    right_pressure_per_velocity_re: f64,
    right_pressure_per_velocity_im: f64,
}

const MAXIMUM_SOUNDBOARD_SELECTION_TARGETS: usize =
    MAX_PIANO_CHORD_NOTES * MAX_UNISON_STRINGS * STRING_MODES;

#[derive(Clone, Copy, Debug)]
struct SoundboardSelectionTarget {
    midi_index: usize,
    frequency_hz: f64,
    drive_weight_squared: f64,
    required: bool,
}

impl SoundboardSelectionTarget {
    const ZERO: Self = Self {
        midi_index: 0,
        frequency_hz: 0.0,
        drive_weight_squared: 0.0,
        required: false,
    };
}

impl SoundboardMode {
    const ZERO: Self = Self {
        mode: Mode::ZERO,
        pack_index: 0,
        left_pressure_per_velocity_re: 0.0,
        left_pressure_per_velocity_im: 0.0,
        right_pressure_per_velocity_re: 0.0,
        right_pressure_per_velocity_im: 0.0,
    };
}

/// Reconstruct a real pressure sample from a complex modal-velocity transfer.
///
/// With the generator convention `q(t) = Re(Q exp(i omega t))`, modal
/// velocity has phasor `i omega Q`. Therefore
/// `Re((H_re + i H_im) i omega Q exp(i omega t))` is
/// `H_re * q_dot - H_im * omega * q`. The minus sign is essential: using a
/// plus sign conjugates the observer phase and corrupts interference between
/// soundboard modes without changing their mechanical energy.
pub fn modal_observer_pressure_pa(
    transfer_re: f64,
    transfer_im: f64,
    modal_velocity: f64,
    omega_times_position: f64,
) -> f64 {
    transfer_re * modal_velocity - transfer_im * omega_times_position
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

type StringReductionMatrix = [[f64; STRING_MODES]; STRING_MODES];

#[derive(Clone, Copy, Debug)]
struct StringReduction {
    mass: StringReductionMatrix,
    stiffness_diagonal: [f64; STRING_MODES],
}

fn component_string_reduction(
    geometry: StringGeometry,
    string_index: usize,
) -> Result<StringReduction, PianoError> {
    if string_index >= geometry.string_count
        || geometry.speaking_length_m <= 0.0
        || geometry.duplex_length_m <= 0.0
        || geometry.linear_density_kg_m <= 0.0
    {
        return Err(PianoError::InvalidParameters);
    }
    let speaking_length = geometry.speaking_length_m;
    let duplex_length = geometry.duplex_length_m;
    let linear_density = geometry.linear_density_kg_m;
    let frequency_ratio = geometry.unison_frequencies_hz[string_index] / geometry.fundamental_hz;
    let second_moment = PI * pow(geometry.equivalent_diameter_m, 4.0) / 64.0;
    let bending_rigidity = STEEL_YOUNG_MODULUS_PA * second_moment;
    let bending_tension_equivalent =
        PI * PI * bending_rigidity / (speaking_length * speaking_length);
    // Only the flexible-string part scales with f^2. Scaling the already
    // bending-corrected tension would also scale EI and detune each unison by
    // a small, register-dependent amount.
    let tension =
        (geometry.tension_n + bending_tension_equivalent) * frequency_ratio * frequency_ratio
            - bending_tension_equivalent;
    if !tension.is_finite() || tension <= 0.0 || !bending_rigidity.is_finite() {
        return Err(PianoError::InvalidParameters);
    }

    // Craig--Bampton component coordinates. Coordinate zero is the bridge
    // displacement. The remaining coordinates are fixed-interface sine modes
    // on the speaking and duplex segments. Their only inertial coupling is to
    // the bridge constraint mode; the elastic matrix is diagonal.
    let mut mass = [[0.0_f64; STRING_MODES]; STRING_MODES];
    let mut stiffness_diagonal = [0.0_f64; STRING_MODES];
    mass[0][0] = linear_density * (speaking_length + duplex_length) / 3.0;
    stiffness_diagonal[0] = tension * (1.0 / speaking_length + 1.0 / duplex_length);
    for component_index in 0..STRING_SPEAKING_COMPONENT_MODES {
        let coordinate = 1 + component_index;
        let order = (component_index + 1) as f64;
        let wave_number = order * PI / speaking_length;
        let sign = if component_index % 2 == 0 { 1.0 } else { -1.0 };
        let coupling = linear_density * speaking_length * sign / (order * PI);
        mass[0][coordinate] = coupling;
        mass[coordinate][0] = coupling;
        mass[coordinate][coordinate] = 0.5 * linear_density * speaking_length;
        stiffness_diagonal[coordinate] = 0.5
            * speaking_length
            * (tension * wave_number * wave_number
                + bending_rigidity * wave_number * wave_number * wave_number * wave_number);
    }
    for component_index in 0..STRING_DUPLEX_COMPONENT_MODES {
        let coordinate = 1 + STRING_SPEAKING_COMPONENT_MODES + component_index;
        let order = (component_index + 1) as f64;
        let wave_number = order * PI / duplex_length;
        let coupling = linear_density * duplex_length / (order * PI);
        mass[0][coordinate] = coupling;
        mass[coordinate][0] = coupling;
        mass[coordinate][coordinate] = 0.5 * linear_density * duplex_length;
        stiffness_diagonal[coordinate] = 0.5
            * duplex_length
            * (tension * wave_number * wave_number
                + bending_rigidity * wave_number * wave_number * wave_number * wave_number);
    }
    if mass
        .iter()
        .flatten()
        .chain(stiffness_diagonal.iter())
        .any(|value| !value.is_finite())
    {
        return Err(PianoError::NonFiniteState);
    }
    Ok(StringReduction {
        mass,
        stiffness_diagonal,
    })
}

fn cholesky_lower(matrix: StringReductionMatrix) -> Result<StringReductionMatrix, PianoError> {
    let mut lower = [[0.0_f64; STRING_MODES]; STRING_MODES];
    for row in 0..STRING_MODES {
        for column in 0..=row {
            let mut value = matrix[row][column];
            for inner in 0..column {
                value -= lower[row][inner] * lower[column][inner];
            }
            if row == column {
                if !value.is_finite() || value <= 0.0 {
                    return Err(PianoError::InvalidParameters);
                }
                lower[row][column] = sqrt(value);
            } else {
                lower[row][column] = value / lower[column][column];
            }
        }
    }
    Ok(lower)
}

fn inverse_lower(lower: StringReductionMatrix) -> Result<StringReductionMatrix, PianoError> {
    let mut inverse = [[0.0_f64; STRING_MODES]; STRING_MODES];
    for column in 0..STRING_MODES {
        for row in 0..STRING_MODES {
            let mut value = if row == column { 1.0 } else { 0.0 };
            for inner in 0..row {
                value -= lower[row][inner] * inverse[inner][column];
            }
            inverse[row][column] = value / lower[row][row];
            if !inverse[row][column].is_finite() {
                return Err(PianoError::NonFiniteState);
            }
        }
    }
    Ok(inverse)
}

fn symmetric_jacobi_eigenvectors(
    mut matrix: StringReductionMatrix,
) -> Result<([f64; STRING_MODES], StringReductionMatrix), PianoError> {
    let mut eigenvectors = [[0.0_f64; STRING_MODES]; STRING_MODES];
    for index in 0..STRING_MODES {
        eigenvectors[index][index] = 1.0;
    }
    for _ in 0..STRING_EIGEN_JACOBI_SWEEPS {
        let mut rotations = 0usize;
        for first in 0..STRING_MODES - 1 {
            for second in first + 1..STRING_MODES {
                let off_diagonal = matrix[first][second];
                let local_scale = matrix[first][first].abs() + matrix[second][second].abs();
                if off_diagonal.abs() <= 1.0e-14 * local_scale.max(1.0) {
                    continue;
                }
                rotations += 1;
                let tau = (matrix[second][second] - matrix[first][first]) / (2.0 * off_diagonal);
                let tangent = if tau >= 0.0 {
                    1.0 / (tau + sqrt(1.0 + tau * tau))
                } else {
                    -1.0 / (-tau + sqrt(1.0 + tau * tau))
                };
                let cosine = 1.0 / sqrt(1.0 + tangent * tangent);
                let sine = tangent * cosine;
                let first_diagonal = matrix[first][first];
                let second_diagonal = matrix[second][second];
                matrix[first][first] = cosine * cosine * first_diagonal
                    - 2.0 * sine * cosine * off_diagonal
                    + sine * sine * second_diagonal;
                matrix[second][second] = sine * sine * first_diagonal
                    + 2.0 * sine * cosine * off_diagonal
                    + cosine * cosine * second_diagonal;
                matrix[first][second] = 0.0;
                matrix[second][first] = 0.0;
                for index in 0..STRING_MODES {
                    if index != first && index != second {
                        let first_value = matrix[index][first];
                        let second_value = matrix[index][second];
                        matrix[index][first] = cosine * first_value - sine * second_value;
                        matrix[first][index] = matrix[index][first];
                        matrix[index][second] = sine * first_value + cosine * second_value;
                        matrix[second][index] = matrix[index][second];
                    }
                    let first_vector = eigenvectors[index][first];
                    let second_vector = eigenvectors[index][second];
                    eigenvectors[index][first] = cosine * first_vector - sine * second_vector;
                    eigenvectors[index][second] = sine * first_vector + cosine * second_vector;
                }
            }
        }
        if rotations == 0 {
            break;
        }
    }
    let mut eigenvalues = [0.0_f64; STRING_MODES];
    for index in 0..STRING_MODES {
        eigenvalues[index] = matrix[index][index];
        if !eigenvalues[index].is_finite() || eigenvalues[index] <= 0.0 {
            return Err(PianoError::InvalidParameters);
        }
    }
    Ok((eigenvalues, eigenvectors))
}

fn component_string_eigensystem(
    geometry: StringGeometry,
    string_index: usize,
) -> Result<([f64; STRING_MODES], StringReductionMatrix), PianoError> {
    let reduction = component_string_reduction(geometry, string_index)?;
    let inverse_lower = inverse_lower(cholesky_lower(reduction.mass)?)?;
    let mut standard = [[0.0_f64; STRING_MODES]; STRING_MODES];
    for row in 0..STRING_MODES {
        for column in 0..STRING_MODES {
            let mut value = 0.0;
            for inner in 0..STRING_MODES {
                value += inverse_lower[row][inner]
                    * reduction.stiffness_diagonal[inner]
                    * inverse_lower[column][inner];
            }
            standard[row][column] = value;
        }
    }
    let (unsorted_values, standard_vectors) = symmetric_jacobi_eigenvectors(standard)?;
    let mut frequencies = [0.0_f64; STRING_MODES];
    let mut physical_vectors = [[0.0_f64; STRING_MODES]; STRING_MODES];
    let mut consumed = [false; STRING_MODES];
    for output_mode in 0..STRING_MODES {
        let mut selected = None;
        for candidate in 0..STRING_MODES {
            if !consumed[candidate]
                && selected
                    .is_none_or(|current| unsorted_values[candidate] < unsorted_values[current])
            {
                selected = Some(candidate);
            }
        }
        let selected = selected.ok_or(PianoError::InvalidParameters)?;
        consumed[selected] = true;
        frequencies[output_mode] = sqrt(unsorted_values[selected]) / TAU;
        for coordinate in 0..STRING_MODES {
            let mut value = 0.0;
            for transformed_coordinate in 0..STRING_MODES {
                value += inverse_lower[transformed_coordinate][coordinate]
                    * standard_vectors[transformed_coordinate][selected];
            }
            physical_vectors[output_mode][coordinate] = value;
        }
        if !frequencies[output_mode].is_finite()
            || physical_vectors[output_mode]
                .iter()
                .any(|value| !value.is_finite())
        {
            return Err(PianoError::NonFiniteState);
        }
    }
    Ok((frequencies, physical_vectors))
}

fn build_component_string_modes(
    geometry: StringGeometry,
    string_index: usize,
    midi: i32,
    sample_rate_hz: f64,
    dt_seconds: f64,
) -> Result<([Mode; STRING_MODES], usize), PianoError> {
    let (frequencies, eigenvectors) = component_string_eigensystem(geometry, string_index)?;
    let strike_ratio = hammer_strike_position_over_length(midi)?;
    let mut modes = [Mode::ZERO; STRING_MODES];
    let mut active_count = 0usize;
    for mode_index in 0..STRING_MODES {
        let frequency_hz = frequencies[mode_index];
        if frequency_hz >= 0.44 * sample_rate_hz {
            continue;
        }
        let vector = eigenvectors[mode_index];
        let mut hammer_residue = strike_ratio * vector[0];
        for component_index in 0..STRING_SPEAKING_COMPONENT_MODES {
            let order = (component_index + 1) as f64;
            hammer_residue += vector[1 + component_index] * sin(PI * order * strike_ratio);
        }
        let effective_order =
            (frequency_hz / geometry.unison_frequencies_hz[string_index]).max(1.0);
        let fundamental_t60 = 14.0 * exp(-0.020 * (midi - MIN_MIDI) as f64) + 1.4;
        let t60 = fundamental_t60 / (1.0 + 0.020 * effective_order * effective_order);
        modes[mode_index] = Mode {
            active: true,
            position: 0.0,
            velocity: 0.0,
            frequency_hz,
            omega: TAU * frequency_hz,
            midpoint_omega: prewarped_midpoint_omega(frequency_hz, dt_seconds),
            half_velocity_decay: split_t60_half_velocity_decay(t60, dt_seconds),
            contact_residue_m_neg_half_kg: hammer_residue / geometry.string_count as f64,
            bridge_residue_m_neg_half_kg: vector[0],
        };
        active_count += 1;
    }
    Ok((modes, active_count))
}

#[cfg(test)]
#[derive(Clone, Copy, Debug)]
pub struct ComponentStringReductionSnapshot {
    pub mass: StringReductionMatrix,
    pub stiffness_diagonal: [f64; STRING_MODES],
    pub frequencies_hz: [f64; STRING_MODES],
    pub eigenvectors: StringReductionMatrix,
}

#[cfg(test)]
pub fn component_string_reduction_snapshot(
    midi: i32,
    string_index: usize,
) -> Result<ComponentStringReductionSnapshot, PianoError> {
    let geometry = string_geometry(midi)?;
    let reduction = component_string_reduction(geometry, string_index)?;
    let (frequencies_hz, eigenvectors) = component_string_eigensystem(geometry, string_index)?;
    Ok(ComponentStringReductionSnapshot {
        mass: reduction.mass,
        stiffness_diagonal: reduction.stiffness_diagonal,
        frequencies_hz,
        eigenvectors,
    })
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
            let (modes, count) =
                build_component_string_modes(geometry, string_index, midi, sample_rate_hz, dt)?;
            strings[string_index].modes = modes;
            active_string_modes += count;
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
                self.contact
                    .strike
                    .felt_static_stiffness_n_per_mm_pow_exponent,
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
        || !strike
            .felt_static_stiffness_n_per_mm_pow_exponent
            .is_finite()
        || !(100.0..=12_000.0).contains(&strike.felt_static_stiffness_n_per_mm_pow_exponent)
        || !strike.felt_exponent.is_finite()
        || !(3.0..=5.5).contains(&strike.felt_exponent)
        || !strike.felt_rate_time_seconds.is_finite()
        || !(200.0e-6..=650.0e-6).contains(&strike.felt_rate_time_seconds)
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
        strike.felt_static_stiffness_n_per_mm_pow_exponent,
        strike.felt_exponent,
        compression,
    );
    let maximum_impulse = strike.maximum_force_n * dt;
    let mut lower = 0.0;
    let mut upper = maximum_impulse;
    let upper_compression =
        (compression + dt * (relative_velocity - 0.5 * upper * inverse_effective_mass)).max(0.0);
    let upper_force = felt_force_n(
        strike.felt_static_stiffness_n_per_mm_pow_exponent,
        strike.felt_exponent,
        strike.felt_rate_time_seconds,
        compression,
        upper_compression,
        dt,
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
            strike.felt_static_stiffness_n_per_mm_pow_exponent,
            strike.felt_exponent,
            strike.felt_rate_time_seconds,
            compression,
            after,
            dt,
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
            strike.felt_static_stiffness_n_per_mm_pow_exponent,
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
            strike.felt_static_stiffness_n_per_mm_pow_exponent,
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
            felt_static_stiffness_n_per_mm_pow_exponent: 100.0,
            felt_exponent: 3.7,
            felt_rate_time_seconds: 250.0e-6,
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
        let soundboard =
            build_soundboard_modes(parameters, sample_rate_hz, core::iter::once(&key))?;
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

    #[cfg(test)]
    pub fn soundboard_mode_pack_index(&self, mode_index: usize) -> Option<usize> {
        self.soundboard
            .get(mode_index)
            .and_then(|mode| mode.mode.active.then_some(mode.pack_index as usize))
    }

    pub fn soundboard_mode_energy_j(&self, mode_index: usize) -> Option<f64> {
        self.soundboard
            .get(mode_index)
            .and_then(|mode| mode.mode.active.then_some(mode.mode.energy_j()))
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
                self.contact
                    .strike
                    .felt_static_stiffness_n_per_mm_pow_exponent,
                self.contact.strike.felt_exponent,
                self.contact.compression_m,
            )
    }

    pub fn bridge_contact_energy_j(&self) -> f64 {
        let body_displacement_m = self.soundboard_bridge_displacement_m();
        let relative_squared_sum: f64 = self
            .strings
            .iter()
            .filter(|bank| bank.active)
            .map(|bank| {
                let relative = string_bank_bridge_displacement_m(bank) - body_displacement_m;
                relative * relative
            })
            .sum();
        0.5 * self.parameters.bridge_contact_stiffness_n_per_m * relative_squared_sum
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
            maximum_bridge_contacts: self.geometry.string_count,
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

    fn soundboard_bridge_displacement_m(&self) -> f64 {
        self.soundboard
            .iter()
            .map(|body| soundboard_bridge_residue_at(body, self.geometry.midi) * body.mode.position)
            .sum()
    }

    fn advance_bridge_contact_midpoint(&mut self) -> Result<(), PianoError> {
        let half_dt = 0.5 * self.dt;
        let half_dt_squared_stiffness =
            half_dt * half_dt * self.parameters.bridge_contact_stiffness_n_per_m;
        let mut string_compliance = [[0.0_f64; MAX_UNISON_STRINGS]; MAX_PIANO_CHORD_NOTES];
        let mut string_right_hand_side = [[0.0_f64; MAX_UNISON_STRINGS]; MAX_PIANO_CHORD_NOTES];
        for (string_index, bank) in self.strings.iter().enumerate() {
            if !bank.active {
                continue;
            }
            for mode in &bank.modes {
                let (compliance, right_hand_side) = accumulate_midpoint_contact_terms(
                    *mode,
                    mode.bridge_residue_m_neg_half_kg,
                    half_dt,
                );
                string_compliance[0][string_index] += compliance;
                string_right_hand_side[0][string_index] += right_hand_side;
            }
        }
        let mut body_right_hand_side = [0.0_f64; MAX_PIANO_CHORD_NOTES];
        let mut body_compliance = [[0.0_f64; MAX_PIANO_CHORD_NOTES]; MAX_PIANO_CHORD_NOTES];
        for body in &self.soundboard {
            let residue = soundboard_bridge_residue_at(body, self.geometry.midi);
            let (compliance, right_hand_side) =
                accumulate_midpoint_contact_terms(body.mode, residue, half_dt);
            body_compliance[0][0] += compliance;
            body_right_hand_side[0] += right_hand_side;
        }
        let mut string_counts = [0usize; MAX_PIANO_CHORD_NOTES];
        string_counts[0] = self.geometry.string_count;
        let (physical_coordinates, aggregate_coordinates) = solve_separate_string_bridge_contacts(
            string_compliance,
            string_right_hand_side,
            string_counts,
            body_right_hand_side,
            body_compliance,
            1,
            half_dt_squared_stiffness,
        )?;
        for (string_index, bank) in self.strings.iter_mut().enumerate() {
            if !bank.active {
                continue;
            }
            for mode in &mut bank.modes {
                finish_midpoint_contact_mode(
                    mode,
                    mode.bridge_residue_m_neg_half_kg,
                    physical_coordinates[0][string_index],
                    half_dt,
                    self.parameters.bridge_contact_stiffness_n_per_m,
                );
            }
        }
        for body in &mut self.soundboard {
            let residue = soundboard_bridge_residue_at(body, self.geometry.midi);
            finish_midpoint_contact_mode(
                &mut body.mode,
                -residue,
                aggregate_coordinates[0],
                half_dt,
                self.parameters.bridge_contact_stiffness_n_per_m,
            );
        }
        Ok(())
    }

    #[cfg(test)]
    pub fn set_test_unison_bridge_displacement_m(
        &mut self,
        string_index: usize,
        displacement_m: f64,
    ) -> Result<(), PianoError> {
        if string_index >= self.geometry.string_count || !displacement_m.is_finite() {
            return Err(PianoError::InvalidParameters);
        }
        let bank = &mut self.strings[string_index];
        let mode = bank
            .modes
            .iter_mut()
            .find(|mode| mode.active && mode.bridge_residue_m_neg_half_kg.abs() > 1.0e-12)
            .ok_or(PianoError::InvalidParameters)?;
        mode.position = displacement_m / mode.bridge_residue_m_neg_half_kg;
        mode.velocity = 0.0;
        Ok(())
    }

    fn observe_pressure_pa(&self) -> (f64, f64) {
        let mut left_pressure_pa = 0.0;
        let mut right_pressure_pa = 0.0;
        for body in &self.soundboard {
            let omega_times_position = body.mode.omega * body.mode.position;
            left_pressure_pa += modal_observer_pressure_pa(
                body.left_pressure_per_velocity_re,
                body.left_pressure_per_velocity_im,
                body.mode.velocity,
                omega_times_position,
            );
            right_pressure_pa += modal_observer_pressure_pa(
                body.right_pressure_per_velocity_re,
                body.right_pressure_per_velocity_im,
                body.mode.velocity,
                omega_times_position,
            );
        }
        // Direct string radiation is deliberately excluded: the audible path
        // is string -> bridge -> soundboard. Do not traverse every retained
        // string mode to compute a diagnostic term and then multiply it by
        // the reviewed zero scale on every audio frame.
        (left_pressure_pa, right_pressure_pa)
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
    soundboard_bridge_residues: [[f64; SOUNDBOARD_MODES]; MAX_PIANO_CHORD_NOTES],
    soundboard_compliance: [[f64; MAX_PIANO_CHORD_NOTES]; MAX_PIANO_CHORD_NOTES],
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
        let soundboard = build_soundboard_modes(
            parameters,
            sample_rate_hz,
            keys[..midis.len()].iter().filter_map(Option::as_ref),
        )?;
        let mut soundboard_bridge_residues = [[0.0_f64; SOUNDBOARD_MODES]; MAX_PIANO_CHORD_NOTES];
        for key_index in 0..midis.len() {
            let key = keys[key_index].as_ref().ok_or(PianoError::NonFiniteState)?;
            for (mode_index, body) in soundboard.iter().enumerate() {
                soundboard_bridge_residues[key_index][mode_index] =
                    soundboard_bridge_residue_at(body, key.geometry.midi);
            }
        }
        let half_dt = 0.5 * dt;
        let mut soundboard_compliance = [[0.0_f64; MAX_PIANO_CHORD_NOTES]; MAX_PIANO_CHORD_NOTES];
        for row in 0..midis.len() {
            for column in 0..midis.len() {
                let mut compliance = 0.0;
                for (mode_index, body) in soundboard.iter().enumerate() {
                    compliance += soundboard_bridge_residues[row][mode_index]
                        * soundboard_bridge_residues[column][mode_index]
                        * midpoint_inverse_diagonal(body.mode, half_dt);
                }
                soundboard_compliance[row][column] = compliance;
            }
        }
        Ok(Self {
            dt,
            parameters,
            note_count: midis.len(),
            keys,
            soundboard,
            soundboard_bridge_residues,
            soundboard_compliance,
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
        for (key_index, key) in self.keys.iter().flatten().enumerate() {
            let body_displacement_m: f64 = self
                .soundboard
                .iter()
                .enumerate()
                .map(|(mode_index, body)| {
                    self.soundboard_bridge_residues[key_index][mode_index] * body.mode.position
                })
                .sum();
            for bank in key.strings.iter().filter(|bank| bank.active) {
                let relative = string_bank_bridge_displacement_m(bank) - body_displacement_m;
                relative_squared_sum += relative * relative;
            }
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
        let mut body_right_hand_side = [0.0_f64; MAX_PIANO_CHORD_NOTES];
        for (mode_index, body) in self.soundboard.iter().enumerate() {
            if !body.mode.active {
                continue;
            }
            let free_position = midpoint_free_position(body.mode, half_dt);
            let position_sum = body.mode.position + free_position;
            for key_index in 0..self.note_count {
                body_right_hand_side[key_index] +=
                    self.soundboard_bridge_residues[key_index][mode_index] * position_sum;
            }
        }

        let mut string_compliance = [[0.0_f64; MAX_UNISON_STRINGS]; MAX_PIANO_CHORD_NOTES];
        let mut string_right_hand_side = [[0.0_f64; MAX_UNISON_STRINGS]; MAX_PIANO_CHORD_NOTES];
        let mut string_counts = [0usize; MAX_PIANO_CHORD_NOTES];
        for key_index in 0..self.note_count {
            let key = self.keys[key_index]
                .as_ref()
                .ok_or(PianoError::NonFiniteState)?;
            string_counts[key_index] = key.geometry.string_count;
            for (string_index, bank) in key.strings.iter().enumerate() {
                if !bank.active {
                    continue;
                }
                for mode in &bank.modes {
                    let (compliance, modal_right_hand_side) = accumulate_midpoint_contact_terms(
                        *mode,
                        mode.bridge_residue_m_neg_half_kg,
                        half_dt,
                    );
                    string_compliance[key_index][string_index] += compliance;
                    string_right_hand_side[key_index][string_index] += modal_right_hand_side;
                }
            }
        }
        let (physical_coordinates, aggregate_coordinates) = solve_separate_string_bridge_contacts(
            string_compliance,
            string_right_hand_side,
            string_counts,
            body_right_hand_side,
            self.soundboard_compliance,
            self.note_count,
            half_dt_squared_stiffness,
        )?;

        for key_index in 0..self.note_count {
            let key = self.keys[key_index]
                .as_mut()
                .ok_or(PianoError::NonFiniteState)?;
            for (string_index, bank) in key.strings.iter_mut().enumerate() {
                if !bank.active {
                    continue;
                }
                for mode in &mut bank.modes {
                    let residue = mode.bridge_residue_m_neg_half_kg;
                    finish_midpoint_contact_mode(
                        mode,
                        residue,
                        physical_coordinates[key_index][string_index],
                        half_dt,
                        self.parameters.bridge_contact_stiffness_n_per_m,
                    );
                }
            }
        }
        for (mode_index, body) in self.soundboard.iter_mut().enumerate() {
            let mut coordinate_sum = 0.0;
            for key_index in 0..self.note_count {
                coordinate_sum += self.soundboard_bridge_residues[key_index][mode_index]
                    * aggregate_coordinates[key_index];
            }
            // A positive bridge contact coordinate pulls the string modes toward
            // the board and the board mode in the opposite generalized-force
            // direction. Pass that generalized coordinate explicitly instead of
            // disguising the sign as a dimensionally false modal residue.
            finish_midpoint_generalized_contact_mode(
                &mut body.mode,
                -coordinate_sum,
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
            let omega_times_position = body.mode.omega * body.mode.position;
            left_pressure_pa += modal_observer_pressure_pa(
                body.left_pressure_per_velocity_re,
                body.left_pressure_per_velocity_im,
                body.mode.velocity,
                omega_times_position,
            );
            right_pressure_pa += modal_observer_pressure_pa(
                body.right_pressure_per_velocity_re,
                body.right_pressure_per_velocity_im,
                body.mode.velocity,
                omega_times_position,
            );
        }
        (left_pressure_pa, right_pressure_pa)
    }
}

pub fn midi_frequency_hz(midi: i32) -> f64 {
    440.0 * pow(2.0, (midi as f64 - 69.0) / 12.0)
}

/// Measured grand-piano hammer mass by key [kg].
///
/// Stulov 2008, Eq. (11), fits all 88 Abel grand-piano hammers as
/// `m_g = 11.074 - .074*n + 1e-4*n^2`, where key number `n=1` is A0.
pub fn hammer_mass_kg_for_midi(midi: i32) -> Result<f64, PianoError> {
    if !(MIN_MIDI..=MAX_MIDI).contains(&midi) {
        return Err(PianoError::InvalidMidi);
    }
    let key_number = (midi - MIN_MIDI + 1) as f64;
    Ok((11.074 - 0.074 * key_number + 1.0e-4 * key_number * key_number) * 1.0e-3)
}

/// Stulov 2008, Eq. (10), all-key parameters for the practical
/// three-parameter hereditary felt model Eq. (9).
///
/// The returned values are `[Q0_N_per_mm_pow_p, p, a_seconds]`. Keeping the
/// paper's millimetre convention explicit avoids hiding a key-dependent
/// `1000^p` conversion inside an enormous SI stiffness.
pub fn stulov_felt_parameters_for_midi(midi: i32) -> Result<[f64; 3], PianoError> {
    if !(MIN_MIDI..=MAX_MIDI).contains(&midi) {
        return Err(PianoError::InvalidMidi);
    }
    let key_number = (midi - MIN_MIDI + 1) as f64;
    let static_stiffness = 183.0 * exp(0.045 * key_number);
    let exponent = 3.7 + 0.015 * key_number;
    let key_squared = key_number * key_number;
    let key_cubed = key_squared * key_number;
    let key_fourth = key_squared * key_squared;
    let rate_time_seconds = (259.5 - 0.58 * key_number + 0.066 * key_squared - 0.00125 * key_cubed
        + 0.000_011_72 * key_fourth)
        * 1.0e-6;
    Ok([static_stiffness, exponent, rate_time_seconds])
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

/// Bridge contact position for one key, normalized by the board length and
/// width. Miranda Valiente et al. (JASA 2024), Fig. 2, independently labels
/// A1, D4, and D5 on the two physical bridges; the keyboard endpoints are the
/// visible bass- and treble-bridge ends in the same plan view. The values are
/// the inverse-projective coordinates of those five pixels, not fitted audio
/// gains. Piecewise interpolation follows the bridge between reviewed keys.
pub fn soundboard_bridge_position_for_midi(midi: i32) -> Result<(f64, f64), PianoError> {
    if !(MIN_MIDI..=MAX_MIDI).contains(&midi) {
        return Err(PianoError::InvalidMidi);
    }
    // (MIDI, x / board length, y / board width).
    const ANCHORS: [(i32, f64, f64); 5] = [
        (21, 0.888_433_676, 0.586_466_691),
        (33, 0.783_324_033, 0.422_623_497),
        (62, 0.268_679_391, 0.468_071_366),
        (74, 0.134_417_067, 0.367_852_230),
        (108, 0.017_733_010, 0.023_078_590),
    ];
    for pair in ANCHORS.windows(2) {
        let (lower_midi, lower_x, lower_y) = pair[0];
        let (upper_midi, upper_x, upper_y) = pair[1];
        if midi <= upper_midi {
            let amount = (midi - lower_midi) as f64 / (upper_midi - lower_midi) as f64;
            return Ok((
                lower_x + amount * (upper_x - lower_x),
                lower_y + amount * (upper_y - lower_y),
            ));
        }
    }
    let (_, x, y) = ANCHORS[ANCHORS.len() - 1];
    Ok((x, y))
}

pub fn string_geometry(midi: i32) -> Result<StringGeometry, PianoError> {
    if !(MIN_MIDI..=MAX_MIDI).contains(&midi) {
        return Err(PianoError::InvalidMidi);
    }
    let register = (midi - MIN_MIDI) as f64 / (MAX_MIDI - MIN_MIDI) as f64;
    let fundamental_hz = midi_frequency_hz(midi);
    // RT-0425 appendix A publishes the wrapped Steinway-D scale for every
    // C1..B7 key. Its bass rows deliberately use a high equivalent density
    // to represent winding mass, while section 3.2 defines A=pi*d^2/4 and
    // I=pi*d^4/64 for the homogenized string. The four boundary keys omitted
    // by the report use only the adjacent measured slope (see the pack), not
    // a second instrument's sparse four-row interpolation.
    let reviewed = reviewed_string_scale_row(midi).ok_or(PianoError::InvalidMidi)?;
    let speaking_length_m = reviewed.speaking_length_m;
    let equivalent_diameter_m = reviewed.diameter_m;
    let cross_section_area_m2 = PI * equivalent_diameter_m * equivalent_diameter_m / 4.0;
    let linear_density_kg_m = reviewed.density_kg_m3 * cross_section_area_m2;
    let second_moment_m4 = PI * pow(equivalent_diameter_m, 4.0) / 64.0;
    let bending_rigidity_n_m2 = STEEL_YOUNG_MODULUS_PA * second_moment_m4;
    // Appendix tensions are integer-rounded and use A4=441 Hz. Retain the
    // measured length/diameter/density and derive the exact concert-pitch
    // tension. The transverse eigenfrequency contains both T*k^2 and EI*k^4:
    // adding EI after using the flexible-string tension double-counts the
    // treble stiffness and makes every partial sharp.
    let flexible_string_tension_n = linear_density_kg_m
        * (2.0 * speaking_length_m * fundamental_hz)
        * (2.0 * speaking_length_m * fundamental_hz);
    let tension_n = flexible_string_tension_n
        - PI * PI * bending_rigidity_n_m2 / (speaking_length_m * speaking_length_m);
    if !tension_n.is_finite() || tension_n <= 0.0 {
        return Err(PianoError::InvalidParameters);
    }
    let duplex_length_m = duplex_length_m_for_midi(midi)?;
    let total_length_m = speaking_length_m + duplex_length_m;
    let inharmonicity_coefficient =
        PI * PI * bending_rigidity_n_m2 / (tension_n * speaking_length_m * speaking_length_m);
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
    let nu_lr = parameters.soundboard_poisson_ratio;
    let nu_rl = nu_lr * parameters.soundboard_radial_modulus_pa
        / parameters.soundboard_longitudinal_modulus_pa;
    let thickness_cubed = parameters.soundboard_thickness_m
        * parameters.soundboard_thickness_m
        * parameters.soundboard_thickness_m;
    // Orthotropic Kirchhoff--Love rigidity.  Reciprocity requires
    // nu_RL/E_R = nu_LR/E_L; using the isotropic 1-nu^2 denominator and a
    // geometric-mean D12 materially over-stiffens a spruce board.  These are
    // the same D11/D22/D12/D66 definitions used by FrankenSim fs-plate.
    let denominator = 12.0 * (1.0 - nu_lr * nu_rl);
    let d_long = parameters.soundboard_longitudinal_modulus_pa * thickness_cubed / denominator;
    let bare_d_radial = parameters.soundboard_radial_modulus_pa * thickness_cubed / denominator;
    let d_poisson = nu_lr * parameters.soundboard_radial_modulus_pa * thickness_cubed / denominator;
    let d_shear = parameters.soundboard_shear_modulus_pa * thickness_cubed / 12.0;
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
        * (d_long * pow(kx, 4.0)
            + 2.0 * (d_poisson + 2.0 * d_shear) * kx * kx * ky * ky
            + d_radial * pow(ky, 4.0))
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

fn soundboard_modal_norm(parameters: PianoParameters) -> f64 {
    let rib_spacing_m =
        parameters.soundboard_length_m / (parameters.soundboard_rib_count + 1) as f64;
    let areal_density_kg_m2 = parameters.soundboard_density_kg_m3
        * (parameters.soundboard_thickness_m
            + parameters.soundboard_rib_width_m * parameters.soundboard_rib_height_m
                / rib_spacing_m);
    let modal_mass =
        0.25 * areal_density_kg_m2 * parameters.soundboard_length_m * parameters.soundboard_width_m;
    1.0 / sqrt(modal_mass)
}

pub fn soundboard_bridge_mode_residue_for_midi(
    parameters: PianoParameters,
    midi: i32,
    order_x: usize,
    order_y: usize,
) -> Result<f64, PianoError> {
    let parameters = parameters.validate()?;
    if order_x == 0 || order_y == 0 {
        return Err(PianoError::InvalidParameters);
    }
    let bridge_position = soundboard_bridge_position_for_midi(midi)?;
    Ok(sin(PI * order_x as f64 * bridge_position.0)
        * sin(PI * order_y as f64 * bridge_position.1)
        * soundboard_modal_norm(parameters))
}

fn soundboard_bridge_residue_at(body: &SoundboardMode, midi: i32) -> f64 {
    if !body.mode.active {
        return 0.0;
    }
    let midi_index = (midi - MIN_MIDI) as usize;
    PIANO_V2_SOUNDBOARD_MODE_PACK[body.pack_index as usize].bridge_residue_inverse_sqrt_kg
        [midi_index]
}

fn append_soundboard_selection_targets(
    key: &PianoKeyState,
    targets: &mut [SoundboardSelectionTarget; MAXIMUM_SOUNDBOARD_SELECTION_TARGETS],
    target_count: &mut usize,
) -> Result<(), PianoError> {
    let midi_index = (key.geometry.midi - MIN_MIDI) as usize;
    for (string_index, bank) in key.strings.iter().enumerate() {
        if !bank.active {
            continue;
        }
        for mode in &bank.modes {
            if !mode.active {
                continue;
            }
            if *target_count >= targets.len() {
                return Err(PianoError::BudgetExceeded);
            }
            let drive_weight =
                mode.contact_residue_m_neg_half_kg * mode.bridge_residue_m_neg_half_kg;
            targets[*target_count] = SoundboardSelectionTarget {
                midi_index,
                frequency_hz: mode.frequency_hz,
                drive_weight_squared: drive_weight * drive_weight,
                // One target per retained string mode and key is enough to
                // guarantee spectral coverage. The detuned unisons still
                // contribute to the aggregate score below, but cannot consume
                // the entire 288-mode budget with near-duplicate requirements.
                required: string_index == 0 && drive_weight * drive_weight > 1.0e-24,
            };
            *target_count += 1;
        }
    }
    Ok(())
}

fn soundboard_candidate_target_score(
    candidate_index: usize,
    target: SoundboardSelectionTarget,
) -> Result<f64, PianoError> {
    let candidate = &PIANO_V2_SOUNDBOARD_MODE_PACK[candidate_index];
    let body_frequency_hz = candidate.frequency_hz;
    let string_frequency_hz = target.frequency_hz;
    let damping_ratio = soundboard_damping_ratio(body_frequency_hz)?;
    let resonance_denominator = 2.0 * damping_ratio * body_frequency_hz * string_frequency_hz;
    if !resonance_denominator.is_finite() || resonance_denominator <= 0.0 {
        return Err(PianoError::NonFiniteState);
    }
    // This is the normalized magnitude-squared response of a damped board
    // oscillator driven at the retained string-mode frequency.  The physical
    // score uses both sides of the power path: hammer/string-to-bridge drive,
    // signed bridge controllability at this key, and far-field stereo
    // observability.  It is a deterministic model reduction, not a reference-
    // audio fit or an EQ curve.
    let normalized_detuning = (body_frequency_hz * body_frequency_hz
        - string_frequency_hz * string_frequency_hz)
        / resonance_denominator;
    let bridge_residue = candidate.bridge_residue_inverse_sqrt_kg[target.midi_index];
    let observer_squared: f64 = candidate
        .observer_pa_s_per_m_sqrt_kg
        .iter()
        .map(|value| value * value)
        .sum();
    let score = observer_squared * bridge_residue * bridge_residue * target.drive_weight_squared
        / (1.0 + normalized_detuning * normalized_detuning);
    if !score.is_finite() || score < 0.0 {
        return Err(PianoError::NonFiniteState);
    }
    Ok(score)
}

fn build_soundboard_modes<'a>(
    parameters: PianoParameters,
    sample_rate_hz: f64,
    keys: impl Iterator<Item = &'a PianoKeyState>,
) -> Result<[SoundboardMode; SOUNDBOARD_MODES], PianoError> {
    let canonical = PianoParameters::canonical();
    if parameters.soundboard_length_m != canonical.soundboard_length_m
        || parameters.soundboard_width_m != canonical.soundboard_width_m
        || parameters.soundboard_thickness_m != canonical.soundboard_thickness_m
        || parameters.soundboard_density_kg_m3 != canonical.soundboard_density_kg_m3
        || parameters.soundboard_longitudinal_modulus_pa
            != canonical.soundboard_longitudinal_modulus_pa
        || parameters.soundboard_radial_modulus_pa != canonical.soundboard_radial_modulus_pa
        || parameters.soundboard_shear_modulus_pa != canonical.soundboard_shear_modulus_pa
        || parameters.soundboard_poisson_ratio != canonical.soundboard_poisson_ratio
        || parameters.soundboard_rib_count != canonical.soundboard_rib_count
        || parameters.soundboard_rib_width_m != canonical.soundboard_rib_width_m
        || parameters.soundboard_rib_height_m != canonical.soundboard_rib_height_m
        || parameters.soundboard_rib_modulus_pa != canonical.soundboard_rib_modulus_pa
    {
        // The runtime consumes a fixed offline DKT pack. Accepting arbitrary
        // geometry here would silently relabel the same modes as another
        // instrument; changed geometry must first regenerate and review the
        // pack.
        return Err(PianoError::InvalidParameters);
    }
    if PIANO_V2_SOUNDBOARD_MODE_PACK.len() > u16::MAX as usize {
        return Err(PianoError::BudgetExceeded);
    }
    let mut targets = [SoundboardSelectionTarget::ZERO; MAXIMUM_SOUNDBOARD_SELECTION_TARGETS];
    let mut target_count = 0usize;
    for key in keys {
        append_soundboard_selection_targets(key, &mut targets, &mut target_count)?;
    }
    if target_count == 0 {
        return Err(PianoError::InvalidSampleRate);
    }

    let cutoff_hz = 0.44 * sample_rate_hz;
    let mut selected = [false; PIANO_V2_SOUNDBOARD_MODE_PACK.len()];
    let mut aggregate_scores = [0.0_f64; PIANO_V2_SOUNDBOARD_MODE_PACK.len()];
    let eligible_count = PIANO_V2_SOUNDBOARD_MODE_PACK
        .iter()
        .take_while(|candidate| candidate.frequency_hz < cutoff_hz)
        .count();
    if eligible_count == 0 {
        return Err(PianoError::InvalidSampleRate);
    }

    for candidate_index in 0..eligible_count {
        let mut aggregate_score = 0.0;
        for target in &targets[..target_count] {
            aggregate_score += soundboard_candidate_target_score(candidate_index, *target)?;
        }
        if !aggregate_score.is_finite() {
            return Err(PianoError::NonFiniteState);
        }
        aggregate_scores[candidate_index] = aggregate_score;
    }

    let selection_limit = eligible_count.min(SOUNDBOARD_MODES);
    let mut selected_count = 0usize;
    for target in targets[..target_count]
        .iter()
        .copied()
        .filter(|target| target.required)
    {
        let mut best_index = 0usize;
        let mut best_score = -1.0_f64;
        for candidate_index in 0..eligible_count {
            let score = soundboard_candidate_target_score(candidate_index, target)?;
            if score > best_score {
                best_score = score;
                best_index = candidate_index;
            }
        }
        if best_score <= 0.0 {
            return Err(PianoError::InvalidParameters);
        }
        if !selected[best_index] {
            if selected_count >= selection_limit {
                break;
            }
            selected[best_index] = true;
            selected_count += 1;
        }
    }

    while selected_count < selection_limit {
        let mut best_index = None;
        let mut best_score = -1.0_f64;
        for candidate_index in 0..eligible_count {
            if selected[candidate_index] {
                continue;
            }
            let score = aggregate_scores[candidate_index];
            if score > best_score {
                best_score = score;
                best_index = Some(candidate_index);
            }
        }
        let best_index = best_index.ok_or(PianoError::NonFiniteState)?;
        if best_score <= 0.0 {
            return Err(PianoError::InvalidParameters);
        }
        selected[best_index] = true;
        selected_count += 1;
    }

    let mut modes = [SoundboardMode::ZERO; SOUNDBOARD_MODES];
    let mut output_index = 0usize;
    for (pack_index, packed) in PIANO_V2_SOUNDBOARD_MODE_PACK.iter().enumerate() {
        if !selected[pack_index] {
            continue;
        }
        let frequency_hz = packed.frequency_hz;
        let omega = TAU * frequency_hz;
        let damping_ratio = soundboard_damping_ratio(frequency_hz)?;
        let t60 = LN_1000 / (omega * damping_ratio);
        modes[output_index] = SoundboardMode {
            mode: Mode {
                active: true,
                position: 0.0,
                velocity: 0.0,
                frequency_hz,
                omega,
                midpoint_omega: prewarped_midpoint_omega(frequency_hz, 1.0 / sample_rate_hz),
                half_velocity_decay: split_t60_half_velocity_decay(t60, 1.0 / sample_rate_hz),
                contact_residue_m_neg_half_kg: 0.0,
                bridge_residue_m_neg_half_kg: 0.0,
            },
            pack_index: pack_index as u16,
            left_pressure_per_velocity_re: packed.observer_pa_s_per_m_sqrt_kg[0],
            left_pressure_per_velocity_im: packed.observer_pa_s_per_m_sqrt_kg[1],
            right_pressure_per_velocity_re: packed.observer_pa_s_per_m_sqrt_kg[2],
            right_pressure_per_velocity_im: packed.observer_pa_s_per_m_sqrt_kg[3],
        };
        output_index += 1;
    }
    if output_index != selection_limit {
        return Err(PianoError::NonFiniteState);
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

fn felt_potential_j(
    static_stiffness_n_per_mm_pow_exponent: f64,
    exponent: f64,
    compression_m: f64,
) -> f64 {
    let compression_mm = 1_000.0 * compression_m.max(0.0);
    1.0e-3 * static_stiffness_n_per_mm_pow_exponent * pow(compression_mm, exponent + 1.0)
        / (exponent + 1.0)
}

fn felt_potential_gradient(
    static_stiffness_n_per_mm_pow_exponent: f64,
    exponent: f64,
    before_m: f64,
    after_m: f64,
) -> f64 {
    let delta = after_m - before_m;
    if delta.abs() <= 1.0e-15 {
        static_stiffness_n_per_mm_pow_exponent
            * pow(500.0 * (before_m + after_m).max(0.0), exponent)
    } else {
        (felt_potential_j(static_stiffness_n_per_mm_pow_exponent, exponent, after_m)
            - felt_potential_j(static_stiffness_n_per_mm_pow_exponent, exponent, before_m))
            / delta
    }
}

/// Discrete Stulov Eq. (9) force used by the live contact solve.
///
/// The elastic discrete gradient preserves the stored felt potential exactly.
/// The rate term has the sign of `after-before`; its work is therefore always
/// dissipative. Unilateral clamping releases the hammer instead of allowing
/// the unloading branch to pull on the string.
pub fn stulov_felt_force_n(
    static_stiffness_n_per_mm_pow_exponent: f64,
    exponent: f64,
    rate_time_seconds: f64,
    before_m: f64,
    after_m: f64,
    dt_seconds: f64,
) -> f64 {
    let before = before_m.max(0.0);
    let after = after_m.max(0.0);
    if !static_stiffness_n_per_mm_pow_exponent.is_finite()
        || static_stiffness_n_per_mm_pow_exponent <= 0.0
        || !exponent.is_finite()
        || exponent <= 1.0
        || !rate_time_seconds.is_finite()
        || rate_time_seconds < 0.0
        || !dt_seconds.is_finite()
        || dt_seconds <= 0.0
    {
        return 0.0;
    }
    let elastic = felt_potential_gradient(
        static_stiffness_n_per_mm_pow_exponent,
        exponent,
        before,
        after,
    );
    let rate = static_stiffness_n_per_mm_pow_exponent
        * rate_time_seconds
        * (pow(1_000.0 * after, exponent) - pow(1_000.0 * before, exponent))
        / dt_seconds;
    (elastic + rate).max(0.0)
}

fn felt_force_n(
    static_stiffness_n_per_mm_pow_exponent: f64,
    exponent: f64,
    rate_time_seconds: f64,
    before_m: f64,
    after_m: f64,
    dt_seconds: f64,
) -> f64 {
    stulov_felt_force_n(
        static_stiffness_n_per_mm_pow_exponent,
        exponent,
        rate_time_seconds,
        before_m,
        after_m,
        dt_seconds,
    )
}
