//! Stateful physical core for the dark PHS5 trumpet model.
//!
//! This module deliberately has no MIDI-note input.  Its resonances come from
//! the fixed measured bore below and from the acoustic length inserted by the
//! three valves.  A performer selects a regime by changing lip tension and
//! mouth pressure; the renderer must never retune the bore to the requested
//! chart pitch.
//!
//! The runtime model combines a compact time-domain brass formulation with
//! numerically conservative boundary treatment:
//!
//! - coupled outward and transverse lip degrees of freedom, integrated with
//!   average-acceleration Newmark inside one bounded implicit lip/cup/throat
//!   solve whose Jacobian is evaluated by exact forward-mode differentiation;
//! - a 96-cell finite-volume Webster bore using exact conical cell volumes,
//!   dual-cell inertances, measured face areas, and radius-scaled passive
//!   thermoviscous memory over three logarithmically spaced relaxation bands;
//! - critically damped valve mechanics, energy-consistent geometry changes,
//!   and passive transient port losses while a valve is between flow paths;
//! - a trapezoidally coupled positive-real radiation impedance at the bell;
//! - a conservative MC-limited Godunov weak-nonlinearity flux at exactly four
//!   times the output sample rate; and
//! - a twelfth-order Butterworth anti-alias filter before decimation.
//!
//! This is production DSP, not acceptance evidence.  Its invariants and
//! diagnostic helpers expose deterministic bounds, represented storage, true
//! oversampling, and state continuity.  They do not establish corpus
//! similarity, browser integration, recipe reachability, owner listening, or
//! deployment readiness.

use core::ops::{Add, Div, Mul, Neg, Sub};

use libm::{atan2, cos, cosh, exp, fabs, floor, log, pow, sin, sinh, sqrt, tan};

const PI: f64 = core::f64::consts::PI;

/// Spatial resolution of the measured bore. Ninety-six conservative cells
/// resolve the useful trumpet band to roughly 11 kHz while retaining a linear
/// CFL below 0.73 at the minimum supported 8 kHz output rate.
pub const BORE_CELLS: usize = 96;
/// The nonlinear propagation and lip/bore coupling run at this factor.
pub const OVERSAMPLE_FACTOR: usize = 4;
const WALL_LOSS_POLES: usize = 3;
const ANTI_ALIAS_SECTIONS: usize = 6;
const MAX_LIP_NEWTON_ITERATIONS: usize = 10;
const MAX_LIP_LINE_SEARCH_EVALUATIONS: usize = 7;
const MAX_LIP_RESIDUAL_EVALUATIONS: usize =
    1 + MAX_LIP_NEWTON_ITERATIONS * (1 + MAX_LIP_LINE_SEARCH_EVALUATIONS);
const LIP_SOLVE_RESIDUAL_TOLERANCE: f64 = 2.0e-8;
const LIP_SOLVE_STEP_TOLERANCE: f64 = 2.0e-9;

const AIR_DENSITY_KG_M3: f64 = 1.204_1;
const SOUND_SPEED_M_S: f64 = 343.21;
const AIR_DYNAMIC_VISCOSITY_PA_S: f64 = 1.825e-5;
const OPEN_LENGTH_M: f64 = 1.47;
/// Calibrated against the Table-II measured input-impedance peaks (87/232 Hz)
/// for the 96-cell finite-volume bore with the lumped cup/throat attached:
/// measured sweep 2026-08-08 put the uncalibrated peaks at 83.25/229.25 Hz
/// (cup compliance nearly inert: halving it moves f1 only +0.5 Hz), so the
/// axial scale splits the residual uniformly, landing 85.50/235.50 Hz
/// (-1.7%/+1.5%, both inside the contract +-4%). The remaining peak-RATIO
/// mismatch (model 2.754 vs measured 2.667) is leadpipe-taper shape work,
/// not length calibration; tracked on the trumpet bead.
const AXIAL_END_CORRECTION_SCALE: f64 = 0.9401;
const MOUTHPIECE_BACKBORE_ENTRY_RADIUS_M: f64 = 0.0025;
const MOUTHPIECE_CUP_ENTRY_AREA_M2: f64 = 2.3e-4;
const LIP_JOINT_NORMAL_POSITION_M: f64 = 4.0e-3;
const LIP_STREAMWISE_REST_POSITION_M: f64 = 1.0e-3;
const LIP_THICKNESS_M: f64 = 2.0e-3;
const LIP_VISCOUS_EFFECTIVE_LENGTH_M: f64 = 2.5e-4;
const LIP_MINIMUM_HYDRAULIC_GAP_M: f64 = 35.0e-6;
const LIP_DISCHARGE_BASE: f64 = 0.62;
const LIP_DISCHARGE_AREA_GAIN: f64 = 0.18;
const LIP_CONTACT_SCALE_M: f64 = 2.5e-4;
const LIP_CONTACT_DAMPING_RATIO: f64 = 0.8;
const LIP_CONTACT_STIFFNESS_RATIO: f64 = 8.0;
const LIP_HYPERELASTIC_SCALE_M: f64 = 1.0e-3;
const LIP_HYPERELASTIC_STIFFNESS_RATIO: f64 = 1.75;
const LIP_MAX_STREAMWISE_DISPLACEMENT_M: f64 = 2.0e-3;
const MAX_EQUILIBRIUM_OPENING_M: f64 = 2.0e-3;
const LIP_SOLVE_DISPLACEMENT_SCALE_M: f64 = 1.0e-3;
const LIP_SOLVE_PRESSURE_SCALE_PA: f64 = 12_000.0;
const LIP_SOLVE_FLOW_SCALE_M3_S: f64 = 1.0e-3;
const LIP_MAX_ABS_CUP_PRESSURE_PA: f64 = 36_000.0;
const LIP_MAX_ABS_JET_FLOW_M3_S: f64 = 5.0e-3;
const DIGITAL_FULL_SCALE_PRESSURE_PA: f64 = 200.0;
const LIP_MODE_FREQUENCY_RATIO: f64 = 184.0 / 136.0;
const CHARACTERISTIC_MEAN_CORNER_HZ: f64 = 20.0;
const LIP_EMBOUCHURE_SERVO_GAIN: f64 = 3.0;
const LIP_EMBOUCHURE_KNEE_M: f64 = 1.2e-3;
/// Round-6 servo anchor: the measured healthy mp operating mean displacement
/// (aperture 5.585e-6 m2 at 5.5 kPa / lip width 7e-3 m / aperture factor 2).
const LIP_ROUND6_MEAN_TARGET_M: f64 = 4.0e-4;
const LIP_CLOSURE_GRAZING_RATIO: f64 = 0.985;
const LIP_CLOSURE_GRAZING_GAIN: f64 = 1.7;
const LIP_GRAZING_ENGAGE_M: f64 = 1.0e-4;
/// The mp mouth-pressure reference for the round-5 embouchure schedule; the
/// schedule is inert at or below this pressure.
const LIP_SERVO_PRESSURE_REF_PA: f64 = 5_500.0;
const LIP_CONTINUATION_SUBSTEPS: usize = 4;
const LIP_TIME_SUBDIVISION_TIERS: [usize; 3] = [2, 4, 8];

const WALL_LOSS_REFERENCE_RADIUS_M: f64 = 6.0e-3;
const WALL_LOSS_FREQUENCY_RATIOS: [f64; WALL_LOSS_POLES] = [0.06, 1.0, 16.0];
// Band weights calibrated 2026-08-08 against the Table-II measured peak
// magnitudes (43.7/35.2 normalized, ratio 1.24): the a-priori circular-tube
// sqrt(f) fit ([0.272, 0.849, 3.161]) produced peak-magnitude ratio 1.60 —
// the real horn carries more low-frequency loss than a straight tube (bends,
// valve ports, mouthpiece seat). With the canonical strength (34/s at 1 kHz,
// 6 mm radius) this lands 42.7/32.4, ratio 1.32, all inside the contract
// bounds. The sweep evidence is on the trumpet integration bead.
const WALL_LOSS_NORMALIZED_STRENGTHS: [f64; WALL_LOSS_POLES] =
    [0.55, 0.62, 3.16];

const MOUTH_PRESSURE_SMOOTHING_SECONDS: f64 = 7.5e-4;
const LIP_RESONANCE_SMOOTHING_SECONDS: f64 = 2.0e-3;
const LIP_DAMPING_SMOOTHING_SECONDS: f64 = 2.5e-3;
const LIP_OPENING_SMOOTHING_SECONDS: f64 = 1.5e-3;
const TONGUE_CLOSE_SMOOTHING_SECONDS: f64 = 3.5e-4;
const TONGUE_RELEASE_SMOOTHING_SECONDS: f64 = 7.5e-4;
const VALVE_ACTUATOR_OMEGA_RAD_S: f64 = 175.0;
const VALVE_TRANSITION_LOSS_COEFFICIENT: f64 = 8.0;
const VALVE_SEATED_LOSS_COEFFICIENT: f64 = 0.12;

const JET_NOISE_HIGH_PASS_HZ: f64 = 350.0;
const JET_NOISE_LOW_PASS_HZ: f64 = 8_500.0;
const JET_NOISE_PRESSURE_FRACTION: f64 = 1.2e-3;
const JET_NOISE_REYNOLDS_BEGIN: f64 = 650.0;
const JET_NOISE_REYNOLDS_FULL: f64 = 2_800.0;
const DIRECTIVITY_LOW_PASS_GAIN: f64 = 0.5;
const DENORMAL_CUTOFF: f64 = 1.0e-28;

/// The eight reviewed trumpet-bore station endpoints: axial position (m) and
/// radius (m), at 20 C.
pub const BORE_STATIONS_M: [[f64; 2]; 8] = [
    [0.08, 0.0055],
    [0.19, 0.0060],
    [0.56, 0.00585],
    [0.88, 0.0065],
    [1.08, 0.0080],
    [1.25, 0.0140],
    [1.38, 0.0320],
    [1.47, 0.0620],
];

/// Added acoustic lengths for first, second, and third valves.
pub const VALVE_LENGTHS_M: [f64; 3] = [0.180, 0.087, 0.278];

/// Combination compensation indexed by valve bit mask.  The index is not a
/// semitone count: bit 0 is valve one, bit 1 valve two, and bit 2 valve three.
pub const VALVE_COMPENSATION_M: [f64; 8] = [
    0.0,
    0.000_019_211_014_778_336_42,
    0.000_410_748_708_164_113_13,
    0.011_134_459_053_999_901,
    0.000_134_459_053_999_891_33,
    0.034_214_585_629_950_5,
    0.017_083_943_345_463_593,
    0.063_893_936_688_449_78,
];

/// A stable, directly actionable refusal from the physical core.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrumpetError {
    InvalidSampleRate,
    InvalidMouthPressure,
    InvalidLipResonance,
    NonPositiveLipDamping,
    InwardLipForce,
    InvalidLipOpening,
    InvalidTongueContact,
    InvalidValvePosition,
    NonPassiveValveTransition,
    OversamplingBypassed,
    LipSolveDidNotConverge,
    NonFiniteState,
}

/// Sample-rate controls supplied by expressive realization.  These are
/// continuous physical controls, not note identities.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TrumpetControls {
    pub mouth_pressure_pa: f64,
    pub lip_resonance_hz: f64,
    pub lip_damping_ratio: f64,
    pub equilibrium_opening_m: f64,
    pub tongue_contact: f64,
    pub valves: [f64; 3],
}

impl TrumpetControls {
    pub fn validate(self) -> Result<Self, TrumpetError> {
        if !self.mouth_pressure_pa.is_finite()
            || !(0.0..=12_000.0).contains(&self.mouth_pressure_pa)
        {
            return Err(TrumpetError::InvalidMouthPressure);
        }
        if !self.lip_resonance_hz.is_finite() || !(80.0..=1_600.0).contains(&self.lip_resonance_hz)
        {
            return Err(TrumpetError::InvalidLipResonance);
        }
        if !self.lip_damping_ratio.is_finite() || self.lip_damping_ratio <= 0.0 {
            return Err(TrumpetError::NonPositiveLipDamping);
        }
        if self.lip_damping_ratio > 1.0 {
            return Err(TrumpetError::NonPositiveLipDamping);
        }
        if !self.equilibrium_opening_m.is_finite()
            || !(0.0..=MAX_EQUILIBRIUM_OPENING_M).contains(&self.equilibrium_opening_m)
        {
            return Err(TrumpetError::InvalidLipOpening);
        }
        if !self.tongue_contact.is_finite() || !(0.0..=1.0).contains(&self.tongue_contact) {
            return Err(TrumpetError::InvalidTongueContact);
        }
        if self
            .valves
            .iter()
            .any(|position| !position.is_finite() || !(0.0..=1.0).contains(position))
        {
            return Err(TrumpetError::InvalidValvePosition);
        }
        Ok(self)
    }
}

/// Fixed physical constants.  `valve_transition_energy_gain` exists as an
/// explicit passivity boundary: the canonical value is exactly one, and a
/// non-passive mutation is refused at construction rather than hidden by an
/// output limiter.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TrumpetParameters {
    pub lip_mass_kg: f64,
    pub lip_effective_area_m2: f64,
    pub lip_width_m: f64,
    /// Anatomical upper aperture. Contact with this finite excursion is
    /// dissipative, just like the existing closed-lip contact.
    pub maximum_lip_opening_m: f64,
    pub mouthpiece_compliance_m3_pa: f64,
    pub throat_inertance_pa_s2_m3: f64,
    pub throat_resistance_pa_s_m3: f64,
    pub throat_nonlinear_resistance_pa_s2_m6: f64,
    /// Frequency-independent distributed attenuation retained after the
    /// viscothermal boundary layer is separated into its passive memory.
    pub bore_loss_per_second: f64,
    /// Reference strength of the passive multi-pole diffusive approximation
    /// to the viscothermal square-root boundary-layer loss.
    pub wall_loss_strength_per_second: f64,
    pub wall_loss_relaxation_hz: f64,
    pub nonlinear_coefficient: f64,
    pub valve_transition_energy_gain: f64,
    /// Round-5 pressure-compensated embouchure: fraction [0,3] of the
    /// EXCESS static blow-open force (area x (p - p_ref)+) canceled by a
    /// constant closing bias, modeling the player firming the embouchure as
    /// dynamics rise. Fractions above one deliberately overshoot: the rest
    /// point is driven INTO closure as pressure rises, so the oscillation
    /// clips against lip contact and the source becomes the bright pulse
    /// train a real ff embouchure produces (measured: with fraction <= 1 the
    /// lips never close at any dynamic and modulation depth collapses). Acts at the force-balance root so the mean opening —
    /// and with it the flow-modulation depth — no longer collapses toward a
    /// sinusoidal source at forte. 0 = legacy pressure-blind embouchure.
    /// (The measured knee-exponent schedule was inert at every swept value
    /// and was replaced by this form; sweep evidence on the bead.)
    pub embouchure_pressure_compensation: f64,
    /// Round-5 pressure schedule for the closure-grazing ride point: the
    /// grazing target scales by (p/p_ref)^-exponent so the closure fraction
    /// RISES with dynamics instead of being clamped flat. 0 = legacy.
    pub servo_pressure_closure_exponent: f64,
    /// Round-6: exponent scaling the embouchure knee-servo gain with
    /// (p/p_ref); models lip tension rising with dynamics. 0 = legacy.
    pub servo_pressure_gain_exponent: f64,
    pub oversample_factor: usize,
}

impl TrumpetParameters {
    #[must_use]
    pub const fn canonical() -> Self {
        Self {
            // Effective half-mass at the 300 Hz reference. Adachi-Sato use
            // m=1.5/((2*pi)^2*f_lip) and their tip equation carries m/2.
            lip_mass_kg: 6.33e-5,
            // Adachi-Sato's 7 mm lip width and 1 mm streamwise rest position
            // give this aperture-normal projected area.
            lip_effective_area_m2: 7.0e-6,
            lip_width_m: 0.007,
            // Adachi-Sato do not impose a sub-millimetre upper collision.
            // The geometric upper boundary is reached only when the two-lip
            // aperture spans twice the 4 mm normal joint offset.
            maximum_lip_opening_m: 2.0 * LIP_JOINT_NORMAL_POSITION_M,
            // A roughly 1.4 cm3 cup: C=V/(rho*c^2).
            mouthpiece_compliance_m3_pa: 1.0e-11,
            // A 6 mm cylindrical throat at the standard 3.6 mm diameter:
            // L=rho*length/area. The following 80 mm backbore is already
            // distributed in bore_radius_m and must not be counted twice.
            throat_inertance_pa_s2_m3: 707.0,
            throat_resistance_pa_s_m3: 3.0e5,
            // Effective quadratic loss after pressure recovery through the
            // distributed backbore; it remains strictly dissipative.
            throat_nonlinear_resistance_pa_s2_m6: 8.0e8,
            // Residual bulk loss after the radius-dependent three-pole
            // Kirchhoff boundary-layer approximation below.
            bore_loss_per_second: 0.75,
            // Attenuation rate near 1 kHz for a 6 mm-radius tube. Runtime
            // strengths scale with inverse local radius.
            wall_loss_strength_per_second: 34.0,
            // Centre relaxation frequency; the other poles are 0.06x and 16x.
            wall_loss_relaxation_hz: 500.0,
            // beta=(gamma+1)/2 for air with gamma=1.403.
            nonlinear_coefficient: 1.2015,
            valve_transition_energy_gain: 1.0,
            // Neutral until the round-5 sweep freezes measured values.
            embouchure_pressure_compensation: 0.0,
            servo_pressure_closure_exponent: 0.0,
            servo_pressure_gain_exponent: 0.0,
            oversample_factor: OVERSAMPLE_FACTOR,
        }
    }

    fn validate(self) -> Result<Self, TrumpetError> {
        if self.oversample_factor != OVERSAMPLE_FACTOR {
            return Err(TrumpetError::OversamplingBypassed);
        }
        if !self.valve_transition_energy_gain.is_finite()
            || self.valve_transition_energy_gain <= 0.0
            || self.valve_transition_energy_gain > 1.0
        {
            return Err(TrumpetError::NonPassiveValveTransition);
        }
        let positive = [
            self.lip_mass_kg,
            self.lip_effective_area_m2,
            self.lip_width_m,
            self.maximum_lip_opening_m,
            self.mouthpiece_compliance_m3_pa,
            self.throat_inertance_pa_s2_m3,
            self.throat_resistance_pa_s_m3,
            self.throat_nonlinear_resistance_pa_s2_m6,
        ];
        if positive
            .iter()
            .any(|value| !value.is_finite() || *value <= 0.0)
            || self.maximum_lip_opening_m < MAX_EQUILIBRIUM_OPENING_M
            || self.lip_width_m * self.maximum_lip_opening_m
                >= MOUTHPIECE_CUP_ENTRY_AREA_M2
            || !self.bore_loss_per_second.is_finite()
            || self.bore_loss_per_second < 0.0
            || !self.wall_loss_strength_per_second.is_finite()
            || self.wall_loss_strength_per_second < 0.0
            || !self.wall_loss_relaxation_hz.is_finite()
            || self.wall_loss_relaxation_hz <= 0.0
            || !self.nonlinear_coefficient.is_finite()
            || self.nonlinear_coefficient < 0.0
            || !self.embouchure_pressure_compensation.is_finite()
            || self.embouchure_pressure_compensation < 0.0
            || self.embouchure_pressure_compensation > 3.0
            || !self.servo_pressure_closure_exponent.is_finite()
            || self.servo_pressure_closure_exponent < 0.0
            || self.servo_pressure_closure_exponent > 2.0
            || !self.servo_pressure_gain_exponent.is_finite()
            || self.servo_pressure_gain_exponent < 0.0
            || self.servo_pressure_gain_exponent > 4.0
        {
            return Err(TrumpetError::NonFiniteState);
        }
        Ok(self)
    }
}

/// Direct outward-striking equilibrium law from the independent PHS5 fixture.
pub fn outward_equilibrium_opening_m(
    equilibrium_opening_m: f64,
    effective_area_m2: f64,
    stiffness_n_m: f64,
    delta_pressure_pa: f64,
    pressure_force_sign: f64,
) -> Result<f64, TrumpetError> {
    if !pressure_force_sign.is_finite() {
        return Err(TrumpetError::NonFiniteState);
    }
    if pressure_force_sign <= 0.0 {
        return Err(TrumpetError::InwardLipForce);
    }
    if !equilibrium_opening_m.is_finite()
        || !effective_area_m2.is_finite()
        || !stiffness_n_m.is_finite()
        || !delta_pressure_pa.is_finite()
        || equilibrium_opening_m < 0.0
        || effective_area_m2 <= 0.0
        || stiffness_n_m <= 0.0
    {
        return Err(TrumpetError::NonFiniteState);
    }
    Ok((equilibrium_opening_m + effective_area_m2 * delta_pressure_pa / stiffness_n_m).max(0.0))
}

/// Bernoulli volume flow through the lip channel, positive from mouth to cup.
pub fn lip_flow_m3_s(
    width_m: f64,
    opening_m: f64,
    delta_pressure_pa: f64,
) -> Result<f64, TrumpetError> {
    if !width_m.is_finite()
        || !opening_m.is_finite()
        || !delta_pressure_pa.is_finite()
        || width_m <= 0.0
        || opening_m < 0.0
    {
        return Err(TrumpetError::NonFiniteState);
    }
    let geometric_area_m2 = width_m * opening_m;
    let discharge = lip_discharge_coefficient(geometric_area_m2);
    let flow = discharge
        * geometric_area_m2
        * sqrt(2.0 * fabs(delta_pressure_pa) / AIR_DENSITY_KG_M3);
    Ok(if delta_pressure_pa >= 0.0 { flow } else { -flow })
}

/// Trilinear continuation of the eight reviewed discrete valve states.
#[must_use]
pub fn valve_added_length_m(valves: [f64; 3]) -> f64 {
    let base = valves[0] * VALVE_LENGTHS_M[0]
        + valves[1] * VALVE_LENGTHS_M[1]
        + valves[2] * VALVE_LENGTHS_M[2];
    let mut compensation = 0.0;
    for (mask, compensation_length_m) in VALVE_COMPENSATION_M.iter().enumerate() {
        let mut weight = 1.0;
        for (valve, position) in valves.iter().enumerate() {
            weight *= if mask & (1 << valve) == 0 {
                1.0 - *position
            } else {
                *position
            };
        }
        compensation += weight * compensation_length_m;
    }
    (base + compensation) * AXIAL_END_CORRECTION_SCALE
}

/// Half-wave estimate used only as a geometry diagnostic.  The live model
/// advances the full variable-area bore; it does not replace it with this
/// formula or alter it to match a MIDI pitch.
#[must_use]
pub fn geometry_half_wave_hz(valves: [f64; 3]) -> f64 {
    SOUND_SPEED_M_S
        / (2.0 * (OPEN_LENGTH_M * AXIAL_END_CORRECTION_SCALE + valve_added_length_m(valves)))
}

/// Instantaneous power balance for the live bell termination
/// `Z(s) = R*s/(s+omega)`. The represented storage is
/// `R*q_memory^2/(2*omega)`, so a passive load must satisfy
/// `p*u = dE/dt + p^2/R` with non-negative dissipation.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RadiationBalance {
    pub input_flow_m3_s: f64,
    pub dissipative_flow_m3_s: f64,
    pub memory_flow_rate_m3_s2: f64,
    pub input_power_w: f64,
    pub storage_rate_w: f64,
    pub dissipation_w: f64,
}

pub fn positive_real_radiation_balance(
    resistance_pa_s_m3: f64,
    corner_rad_s: f64,
    memory_flow_m3_s: f64,
    pressure_pa: f64,
) -> Result<RadiationBalance, TrumpetError> {
    if !resistance_pa_s_m3.is_finite()
        || resistance_pa_s_m3 <= 0.0
        || !corner_rad_s.is_finite()
        || corner_rad_s <= 0.0
        || !memory_flow_m3_s.is_finite()
        || !pressure_pa.is_finite()
    {
        return Err(TrumpetError::NonFiniteState);
    }
    let dissipative_flow_m3_s = pressure_pa / resistance_pa_s_m3;
    let input_flow_m3_s = memory_flow_m3_s + dissipative_flow_m3_s;
    let memory_flow_rate_m3_s2 = corner_rad_s * dissipative_flow_m3_s;
    let input_power_w = pressure_pa * input_flow_m3_s;
    let storage_rate_w =
        resistance_pa_s_m3 / corner_rad_s * memory_flow_m3_s * memory_flow_rate_m3_s2;
    let dissipation_w = pressure_pa * dissipative_flow_m3_s;
    Ok(RadiationBalance {
        input_flow_m3_s,
        dissipative_flow_m3_s,
        memory_flow_rate_m3_s2,
        input_power_w,
        storage_rate_w,
        dissipation_w,
    })
}

/// Instantaneous normalized energy balance for one passive diffusive wall
/// loss coordinate. With acoustic coordinate `x` and memory `z`, the live
/// bore uses `x_dot=-g(x-z)` and `z_dot=omega*(x-z)`. Multiplying these
/// normalized powers by the cell compliance or face inertance gives the
/// physical pressure- or flow-coordinate power identity.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WallLossBalance {
    pub coordinate_rate_per_second: f64,
    pub memory_rate_per_second: f64,
    pub removed_power: f64,
    pub storage_rate: f64,
    pub dissipation: f64,
}

/// Symmetric passive tissue matrices for the two geometric lip coordinates.
/// The measured lower/upper modes are rotated into Adachi's streamwise/normal
/// coordinates by the 1 mm tip / 4 mm joint geometry, so neither coordinate
/// is a fake independent oscillator.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TwoModeLipMatrices {
    pub mass_kg: f64,
    pub normal_stiffness_n_m: f64,
    pub streamwise_stiffness_n_m: f64,
    pub cross_stiffness_n_m: f64,
    pub normal_damping_n_s_m: f64,
    pub streamwise_damping_n_s_m: f64,
    pub cross_damping_n_s_m: f64,
    pub lower_resonance_hz: f64,
    pub upper_resonance_hz: f64,
}

pub fn passive_two_mode_lip_matrices(
    reference_mass_kg: f64,
    upper_resonance_hz: f64,
    damping_ratio: f64,
) -> Result<TwoModeLipMatrices, TrumpetError> {
    passive_two_mode_lip_matrices_with_geometry(
        reference_mass_kg,
        upper_resonance_hz,
        damping_ratio,
        LIP_STREAMWISE_REST_POSITION_M,
        LIP_JOINT_NORMAL_POSITION_M,
    )
}

fn passive_two_mode_lip_matrices_with_geometry(
    reference_mass_kg: f64,
    upper_resonance_hz: f64,
    damping_ratio: f64,
    streamwise_rest_position_m: f64,
    joint_normal_position_m: f64,
) -> Result<TwoModeLipMatrices, TrumpetError> {
    if !reference_mass_kg.is_finite()
        || reference_mass_kg <= 0.0
        || !upper_resonance_hz.is_finite()
        || upper_resonance_hz <= 0.0
        || !damping_ratio.is_finite()
        || damping_ratio <= 0.0
        || !streamwise_rest_position_m.is_finite()
        || streamwise_rest_position_m < 0.0
        || !joint_normal_position_m.is_finite()
        || joint_normal_position_m <= 0.0
    {
        return Err(TrumpetError::NonFiniteState);
    }
    Ok(two_mode_lip_matrices_unchecked(
        reference_mass_kg,
        upper_resonance_hz,
        damping_ratio,
        streamwise_rest_position_m,
        joint_normal_position_m,
    ))
}

fn two_mode_lip_matrices_unchecked(
    reference_mass_kg: f64,
    upper_resonance_hz: f64,
    damping_ratio: f64,
    streamwise_rest_position_m: f64,
    joint_normal_position_m: f64,
) -> TwoModeLipMatrices {
    let lower_resonance_hz = upper_resonance_hz / LIP_MODE_FREQUENCY_RATIO;
    let mass_kg = reference_mass_kg * 300.0 / upper_resonance_hz;
    let lower_omega = 2.0 * PI * lower_resonance_hz;
    let upper_omega = 2.0 * PI * upper_resonance_hz;
    let lower_stiffness = mass_kg * lower_omega * lower_omega;
    let upper_stiffness = mass_kg * upper_omega * upper_omega;
    let lower_damping = 2.0 * damping_ratio * mass_kg * lower_omega;
    let upper_damping = 2.0 * damping_ratio * mass_kg * upper_omega;
    let tangent = streamwise_rest_position_m / joint_normal_position_m;
    let normal_participation = 1.0 / sqrt(1.0 + tangent * tangent);
    let streamwise_participation = tangent * normal_participation;
    let normal_weight = normal_participation * normal_participation;
    let streamwise_weight = streamwise_participation * streamwise_participation;
    let cross_weight = normal_participation * streamwise_participation;
    TwoModeLipMatrices {
        mass_kg,
        normal_stiffness_n_m: lower_stiffness * normal_weight + upper_stiffness * streamwise_weight,
        streamwise_stiffness_n_m: lower_stiffness * streamwise_weight
            + upper_stiffness * normal_weight,
        cross_stiffness_n_m: (lower_stiffness - upper_stiffness) * cross_weight,
        normal_damping_n_s_m: lower_damping * normal_weight + upper_damping * streamwise_weight,
        streamwise_damping_n_s_m: lower_damping * streamwise_weight + upper_damping * normal_weight,
        cross_damping_n_s_m: (lower_damping - upper_damping) * cross_weight,
        lower_resonance_hz,
        upper_resonance_hz,
    }
}

pub fn passive_wall_loss_balance(
    strength_per_second: f64,
    relaxation_rad_s: f64,
    coordinate: f64,
    memory: f64,
) -> Result<WallLossBalance, TrumpetError> {
    if !strength_per_second.is_finite()
        || strength_per_second < 0.0
        || !relaxation_rad_s.is_finite()
        || relaxation_rad_s <= 0.0
        || !coordinate.is_finite()
        || !memory.is_finite()
    {
        return Err(TrumpetError::NonFiniteState);
    }
    let difference = coordinate - memory;
    let coordinate_rate_per_second = -strength_per_second * difference;
    let memory_rate_per_second = relaxation_rad_s * difference;
    let removed_power = strength_per_second * coordinate * difference;
    let storage_rate = strength_per_second / relaxation_rad_s * memory * memory_rate_per_second;
    let dissipation = strength_per_second * difference * difference;
    Ok(WallLossBalance {
        coordinate_rate_per_second,
        memory_rate_per_second,
        removed_power,
        storage_rate,
        dissipation,
    })
}

/// Passive unilateral Hertz/Hunt-Crossley contact evaluated from penetration
/// and penetration rate. The elastic term is the derivative of the reported
/// potential; the rate term acts only while contact is closing, so its
/// dissipation is non-negative and it cannot pull the lips together.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LipContactBalance {
    pub force_n: f64,
    pub potential_energy_j: f64,
    pub dissipation_w: f64,
}

pub fn unilateral_lip_contact_balance(
    hertz_stiffness_n_m32: f64,
    hunt_crossley_damping_n_s_m32: f64,
    penetration_m: f64,
    penetration_velocity_m_s: f64,
) -> Result<LipContactBalance, TrumpetError> {
    if !hertz_stiffness_n_m32.is_finite()
        || hertz_stiffness_n_m32 <= 0.0
        || !hunt_crossley_damping_n_s_m32.is_finite()
        || hunt_crossley_damping_n_s_m32 < 0.0
        || !penetration_m.is_finite()
        || penetration_m < 0.0
        || !penetration_velocity_m_s.is_finite()
    {
        return Err(TrumpetError::NonFiniteState);
    }
    Ok(unilateral_lip_contact_unchecked(
        hertz_stiffness_n_m32,
        hunt_crossley_damping_n_s_m32,
        penetration_m,
        penetration_velocity_m_s,
    ))
}

fn unilateral_lip_contact_unchecked(
    hertz_stiffness_n_m32: f64,
    hunt_crossley_damping_n_s_m32: f64,
    penetration_m: f64,
    penetration_velocity_m_s: f64,
) -> LipContactBalance {
    let closing_velocity_m_s = penetration_velocity_m_s.max(0.0);
    let root_penetration_m = sqrt(penetration_m);
    let elastic_force_n = hertz_stiffness_n_m32 * penetration_m * root_penetration_m;
    let damping_force_n = hunt_crossley_damping_n_s_m32 * root_penetration_m * closing_velocity_m_s;
    LipContactBalance {
        force_n: elastic_force_n + damping_force_n,
        potential_energy_j: 0.4 * hertz_stiffness_n_m32 * pow(penetration_m, 2.5),
        dissipation_w: damping_force_n * closing_velocity_m_s,
    }
}

/// One visible trapezoidal step of Adachi-Sato's lip-channel equations
/// (7)-(8). The candidate acceleration is the exact endpoint constitutive
/// value; the returned flow residual is the sole jet-state equation consumed
/// by the bounded four-variable Newton solve.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AdachiJetBalance {
    pub flow_acceleration_m3_s2: f64,
    pub flow_residual_m3_s: f64,
    pub inertance_pa_s2_m3: f64,
    pub contraction_pressure_drop_pa: f64,
    pub expansion_pressure_change_pa: f64,
    pub resistive_pressure_drop_pa: f64,
    pub lip_opening_pressure_pa: f64,
    pub reconstructed_cup_pressure_pa: f64,
    pub dissipation_w: f64,
}

pub fn adachi_lip_jet_balance(
    lip_opening_area_m2: f64,
    old_flow_m3_s: f64,
    old_flow_acceleration_m3_s2: f64,
    candidate_flow_m3_s: f64,
    mouth_pressure_pa: f64,
    cup_pressure_pa: f64,
    step_seconds: f64,
) -> Result<AdachiJetBalance, TrumpetError> {
    let values = [
        lip_opening_area_m2,
        old_flow_m3_s,
        old_flow_acceleration_m3_s2,
        candidate_flow_m3_s,
        mouth_pressure_pa,
        cup_pressure_pa,
        step_seconds,
    ];
    if values.iter().any(|value| !value.is_finite())
        || lip_opening_area_m2 <= 0.0
        || lip_opening_area_m2 >= MOUTHPIECE_CUP_ENTRY_AREA_M2
        || step_seconds <= 0.0
    {
        return Err(TrumpetError::NonFiniteState);
    }
    let discharge = lip_discharge_coefficient(lip_opening_area_m2);
    let effective_area_m2 = discharge * lip_opening_area_m2;
    let signed_flow_squared = candidate_flow_m3_s * fabs(candidate_flow_m3_s);
    let inertance_pa_s2_m3 = AIR_DENSITY_KG_M3 * LIP_THICKNESS_M / effective_area_m2;
    let contraction_pressure_drop_pa =
        0.5 * AIR_DENSITY_KG_M3 * signed_flow_squared / (effective_area_m2 * effective_area_m2);
    let inverse_effective_area =
        1.0 / effective_area_m2 - 1.0 / MOUTHPIECE_CUP_ENTRY_AREA_M2;
    let quadratic_pressure_drop_pa = 0.5
        * AIR_DENSITY_KG_M3
        * signed_flow_squared
        * inverse_effective_area
        * inverse_effective_area;
    let canonical_width_m = TrumpetParameters::canonical().lip_width_m;
    let hydraulic_gap_m = lip_opening_area_m2 / canonical_width_m;
    let regularized_gap_m = sqrt(
        hydraulic_gap_m * hydraulic_gap_m
            + LIP_MINIMUM_HYDRAULIC_GAP_M * LIP_MINIMUM_HYDRAULIC_GAP_M,
    );
    let viscous_resistance_pa_s_m3 = 12.0
        * AIR_DYNAMIC_VISCOSITY_PA_S
        * LIP_VISCOUS_EFFECTIVE_LENGTH_M
        / (canonical_width_m * regularized_gap_m * regularized_gap_m * regularized_gap_m);
    let viscous_pressure_drop_pa = viscous_resistance_pa_s_m3 * candidate_flow_m3_s;
    let resistive_pressure_drop_pa = quadratic_pressure_drop_pa + viscous_pressure_drop_pa;
    let flow_acceleration_m3_s2 =
        (mouth_pressure_pa - cup_pressure_pa - resistive_pressure_drop_pa)
            / inertance_pa_s2_m3;
    let flow_residual_m3_s = candidate_flow_m3_s
        - old_flow_m3_s
        - 0.5 * step_seconds * (old_flow_acceleration_m3_s2 + flow_acceleration_m3_s2);
    let lip_opening_pressure_pa = mouth_pressure_pa
        - inertance_pa_s2_m3 * flow_acceleration_m3_s2
        - contraction_pressure_drop_pa
        - 0.5 * viscous_pressure_drop_pa;
    let reconstructed_cup_pressure_pa =
        mouth_pressure_pa - inertance_pa_s2_m3 * flow_acceleration_m3_s2
            - resistive_pressure_drop_pa;
    let expansion_pressure_change_pa =
        reconstructed_cup_pressure_pa - lip_opening_pressure_pa;
    Ok(AdachiJetBalance {
        flow_acceleration_m3_s2,
        flow_residual_m3_s,
        inertance_pa_s2_m3,
        contraction_pressure_drop_pa,
        expansion_pressure_change_pa,
        resistive_pressure_drop_pa,
        lip_opening_pressure_pa,
        reconstructed_cup_pressure_pa,
        dissipation_w: (resistive_pressure_drop_pa * candidate_flow_m3_s).max(0.0),
    })
}

/// Penetration of the streamwise lip tip through its fixed joint plane. The
/// same geometric boundary drives passive contact and clamps projected area,
/// so a Newton trial can enter contact without reversing the pressure port.
pub fn lip_streamwise_joint_penetration_m(
    normal_equilibrium_area_m2: f64,
    lip_width_m: f64,
    streamwise_displacement_m: f64,
) -> Result<f64, TrumpetError> {
    if !normal_equilibrium_area_m2.is_finite()
        || normal_equilibrium_area_m2 <= 0.0
        || !lip_width_m.is_finite()
        || lip_width_m <= 0.0
        || !streamwise_displacement_m.is_finite()
    {
        return Err(TrumpetError::NonFiniteState);
    }
    let streamwise_rest_position_m = normal_equilibrium_area_m2 / lip_width_m;
    Ok((-streamwise_rest_position_m - streamwise_displacement_m).max(0.0))
}

/// Work-conjugate Adachi-Sato pressure ports for the two-dimensional lip.
/// The mouth/cup pressure difference acts normal to the moving lip side while
/// the local Bernoulli pressure acts on its tip face. The side's swept-flow
/// one-form is geometric but not an exact scalar differential: a closed
/// swinging/stretching cycle can pump net volume between the reservoirs.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LipPressurePortBalance {
    pub normal_force_n: f64,
    pub streamwise_force_n: f64,
    pub swept_flow_m3_s: f64,
    pub opening_face_flow_m3_s: f64,
    pub mouth_power_w: f64,
    pub cup_power_w: f64,
    pub opening_pressure_power_w: f64,
    pub mechanical_power_w: f64,
}

pub fn two_dimensional_lip_pressure_port_balance(
    normal_equilibrium_area_m2: f64,
    lip_width_m: f64,
    equilibrium_opening_m: f64,
    normal_displacement_m: f64,
    streamwise_displacement_m: f64,
    normal_velocity_m_s: f64,
    streamwise_velocity_m_s: f64,
    mouth_pressure_pa: f64,
    cup_pressure_pa: f64,
    lip_opening_pressure_pa: f64,
) -> Result<LipPressurePortBalance, TrumpetError> {
    let values = [
        normal_equilibrium_area_m2,
        lip_width_m,
        equilibrium_opening_m,
        normal_displacement_m,
        streamwise_displacement_m,
        normal_velocity_m_s,
        streamwise_velocity_m_s,
        mouth_pressure_pa,
        cup_pressure_pa,
        lip_opening_pressure_pa,
    ];
    if values.iter().any(|value| !value.is_finite())
        || normal_equilibrium_area_m2 <= 0.0
        || lip_width_m <= 0.0
        || equilibrium_opening_m < 0.0
    {
        return Err(TrumpetError::NonFiniteState);
    }
    let streamwise_rest_position_m = normal_equilibrium_area_m2 / lip_width_m;
    let streamwise_tip_position_m =
        (streamwise_rest_position_m + streamwise_displacement_m).max(0.0);
    let normal_tip_position_m = 0.5 * equilibrium_opening_m + normal_displacement_m;
    let normal_area_m2 = lip_width_m * streamwise_tip_position_m;
    let streamwise_area_m2 =
        lip_width_m * (LIP_JOINT_NORMAL_POSITION_M - normal_tip_position_m).max(0.0);
    let pressure_difference_pa = mouth_pressure_pa - cup_pressure_pa;
    let bernoulli_normal_force_n = lip_width_m * LIP_THICKNESS_M * lip_opening_pressure_pa;
    let normal_force_n = normal_area_m2 * pressure_difference_pa + bernoulli_normal_force_n;
    let streamwise_force_n = streamwise_area_m2 * pressure_difference_pa;
    let swept_flow_m3_s =
        normal_area_m2 * normal_velocity_m_s + streamwise_area_m2 * streamwise_velocity_m_s;
    let opening_face_flow_m3_s = lip_width_m * LIP_THICKNESS_M * normal_velocity_m_s;
    Ok(LipPressurePortBalance {
        normal_force_n,
        streamwise_force_n,
        swept_flow_m3_s,
        opening_face_flow_m3_s,
        mouth_power_w: mouth_pressure_pa * swept_flow_m3_s,
        cup_power_w: cup_pressure_pa * swept_flow_m3_s,
        opening_pressure_power_w: lip_opening_pressure_pa * opening_face_flow_m3_s,
        mechanical_power_w: normal_force_n * normal_velocity_m_s
            + streamwise_force_n * streamwise_velocity_m_s,
    })
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LipSolveReport {
    pub newton_iterations: usize,
    pub residual_evaluations: usize,
    pub line_search_evaluations: usize,
    pub bracket_evaluations: usize,
    pub fallback_bisections: usize,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct InputImpedanceDiagnostic {
    pub magnitude_pa_s_m3: f64,
    pub normalized_magnitude: f64,
    pub phase_degrees: f64,
}

#[derive(Clone, Copy)]
struct Biquad {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
    z1: f64,
    z2: f64,
}

impl Biquad {
    const ZERO: Self = Self {
        b0: 0.0,
        b1: 0.0,
        b2: 0.0,
        a1: 0.0,
        a2: 0.0,
        z1: 0.0,
        z2: 0.0,
    };

    fn lowpass(sample_rate_hz: f64, cutoff_hz: f64, q: f64) -> Self {
        let k = tan(PI * cutoff_hz / sample_rate_hz);
        let norm = 1.0 / (1.0 + k / q + k * k);
        let b0 = k * k * norm;
        Self {
            b0,
            b1: 2.0 * b0,
            b2: b0,
            a1: 2.0 * (k * k - 1.0) * norm,
            a2: (1.0 - k / q + k * k) * norm,
            z1: 0.0,
            z2: 0.0,
        }
    }

    fn process(&mut self, input: f64) -> f64 {
        let output = self.b0 * input + self.z1;
        self.z1 = self.b1 * input - self.a1 * output + self.z2;
        self.z2 = self.b2 * input - self.a2 * output;
        output
    }
}

/// The actual anti-alias boundary used by the physical core.  It accepts one
/// sample at the four-times rate and emits exactly one filtered output for
/// every four inputs.  Construction with a bypass factor fails.
#[derive(Clone)]
pub struct OversampledOutput {
    sections: [Biquad; ANTI_ALIAS_SECTIONS],
    phase: usize,
}

impl OversampledOutput {
    pub fn new(output_sample_rate_hz: f64, oversample_factor: usize) -> Result<Self, TrumpetError> {
        if oversample_factor != OVERSAMPLE_FACTOR {
            return Err(TrumpetError::OversamplingBypassed);
        }
        if !output_sample_rate_hz.is_finite()
            || !(8_000.0..=96_000.0).contains(&output_sample_rate_hz)
        {
            return Err(TrumpetError::InvalidSampleRate);
        }
        let internal_rate = output_sample_rate_hz * OVERSAMPLE_FACTOR as f64;
        // A 12th-order Butterworth at 0.245*Fs_out strongly suppresses the
        // first image at Fs_out/2 while retaining the musical band below
        // roughly 0.20*Fs_out.
        let cutoff = 0.245 * output_sample_rate_hz;
        let mut sections = [Biquad::ZERO; ANTI_ALIAS_SECTIONS];
        for (index, section) in sections.iter_mut().enumerate() {
            let q = 1.0 / (2.0 * cos((2 * index + 1) as f64 * PI / 24.0));
            *section = Biquad::lowpass(internal_rate, cutoff, q);
        }
        Ok(Self { sections, phase: 0 })
    }

    pub fn push_oversampled(&mut self, input: f64) -> Option<f64> {
        let mut filtered = input;
        for section in &mut self.sections {
            filtered = section.process(filtered);
        }
        self.phase += 1;
        if self.phase == OVERSAMPLE_FACTOR {
            self.phase = 0;
            Some(filtered)
        } else {
            None
        }
    }
}

/// Stateful dark trumpet core. Every field is instance-owned; multiple voices
/// neither share nor reset one another's bore, lip, valve, loss, or noise state.
#[derive(Clone)]
pub struct TrumpetModel {
    output_sample_rate_hz: f64,
    internal_step_seconds: f64,
    parameters: TrumpetParameters,
    pressure_pa: [f64; BORE_CELLS],
    pressure_wall_memory_pa: [[f64; WALL_LOSS_POLES]; BORE_CELLS],
    outgoing_characteristic_mean_pa: [f64; BORE_CELLS],
    incoming_characteristic_mean_pa: [f64; BORE_CELLS],
    volume_flow_m3_s: [f64; BORE_CELLS + 1],
    flow_wall_memory_m3_s: [[f64; WALL_LOSS_POLES]; BORE_CELLS + 1],
    base_cell_length_m: [f64; BORE_CELLS],
    cell_length_m: [f64; BORE_CELLS],
    cell_area_m2: [f64; BORE_CELLS],
    face_area_m2: [f64; BORE_CELLS + 1],
    base_cell_volume_m3: [f64; BORE_CELLS],
    base_left_inverse_area_integral_m_inv: [f64; BORE_CELLS],
    base_right_inverse_area_integral_m_inv: [f64; BORE_CELLS],
    cell_compliance_m3_pa: [f64; BORE_CELLS],
    cell_compliance_inverse_pa_m3: [f64; BORE_CELLS],
    face_inertance_pa_s2_m3: [f64; BORE_CELLS + 1],
    face_inertance_inverse_m3_pa_s2: [f64; BORE_CELLS + 1],
    cell_wall_strength_per_second: [[f64; WALL_LOSS_POLES]; BORE_CELLS],
    face_wall_strength_per_second: [[f64; WALL_LOSS_POLES]; BORE_CELLS + 1],
    cell_wall_coordinate_decay: [f64; BORE_CELLS],
    cell_wall_memory_drive: [[f64; WALL_LOSS_POLES]; BORE_CELLS],
    face_wall_coordinate_decay: [f64; BORE_CELLS + 1],
    face_wall_memory_drive: [[f64; WALL_LOSS_POLES]; BORE_CELLS + 1],
    wall_pole_omega_rad_s: [f64; WALL_LOSS_POLES],
    wall_pole_denominator_inverse: [f64; WALL_LOSS_POLES],
    wall_pole_state_multiplier: [f64; WALL_LOSS_POLES],
    wall_pole_coordinate_multiplier: [f64; WALL_LOSS_POLES],
    valve_weights: [f64; BORE_CELLS],
    valve_face_indices: [usize; 3],
    valve_quadratic_resistance_pa_s2_m6: [f64; BORE_CELLS + 1],
    valve_position: [f64; 3],
    valve_velocity_per_second: [f64; 3],
    active_controls: TrumpetControls,
    controls_initialized: bool,
    mouth_pressure_memory: f64,
    lip_resonance_memory: f64,
    lip_damping_memory: f64,
    lip_opening_memory: f64,
    tongue_close_memory: f64,
    tongue_release_memory: f64,
    valve_actuator_decay: f64,
    characteristic_mean_memory: f64,
    jet_noise_high_pass_alpha: f64,
    jet_noise_low_pass_alpha: f64,
    previous_lip_controls: TrumpetControls,
    previous_mouth_pressure_pa: f64,
    previous_equilibrium_opening_m: f64,
    cup_pressure_pa: f64,
    lip_displacement_m: f64,
    lip_displacement_mean_m: f64,
    lip_oscillation_mean_m: f64,
    lip_velocity_m_s: f64,
    lip_acceleration_m_s2: f64,
    lip_streamwise_displacement_m: f64,
    lip_streamwise_velocity_m_s: f64,
    lip_streamwise_acceleration_m_s2: f64,
    lip_opening_pressure_pa: f64,
    lip_jet_flow_m3_s: f64,
    lip_jet_acceleration_m3_s2: f64,
    lip_jet_area_m2: f64,
    lip_jet_dissipation_w: f64,
    throat_flow_m3_s: f64,
    jet_noise_state: JetNoiseState,
    jet_noise_pressure_pa: f64,
    bell_memory_flow_m3_s: f64,
    previous_bell_flow_m3_s: f64,
    bell_resistance_pa_s_m3: f64,
    bell_corner_rad_s: f64,
    directivity_lowpass_flow_acceleration_m3_s2: f64,
    directivity_alpha: f64,
    bore_broadband_damping: f64,
    decimator: OversampledOutput,
    last_lip_report: LipSolveReport,
    substep_counter: u64,
}

impl TrumpetModel {
    pub fn new(
        output_sample_rate_hz: f64,
        parameters: TrumpetParameters,
    ) -> Result<Self, TrumpetError> {
        let parameters = parameters.validate()?;
        if !output_sample_rate_hz.is_finite()
            || !(8_000.0..=96_000.0).contains(&output_sample_rate_hz)
        {
            return Err(TrumpetError::InvalidSampleRate);
        }
        let internal_sample_rate_hz = output_sample_rate_hz * OVERSAMPLE_FACTOR as f64;
        let internal_step_seconds = 1.0 / internal_sample_rate_hz;
        let nominal_cell_length_m =
            OPEN_LENGTH_M * AXIAL_END_CORRECTION_SCALE / BORE_CELLS as f64;
        if SOUND_SPEED_M_S * internal_step_seconds / nominal_cell_length_m > 0.92 {
            return Err(TrumpetError::InvalidSampleRate);
        }

        let mut base_cell_length_m = [0.0; BORE_CELLS];
        let mut cell_area_m2 = [0.0; BORE_CELLS];
        let mut face_area_m2 = [0.0; BORE_CELLS + 1];
        let mut base_cell_volume_m3 = [0.0; BORE_CELLS];
        let mut base_left_inverse_area_integral_m_inv = [0.0; BORE_CELLS];
        let mut base_right_inverse_area_integral_m_inv = [0.0; BORE_CELLS];
        let mut cell_compliance_m3_pa = [0.0; BORE_CELLS];
        let mut cell_compliance_inverse_pa_m3 = [0.0; BORE_CELLS];
        let mut face_inertance_pa_s2_m3 = [0.0; BORE_CELLS + 1];
        let mut face_inertance_inverse_m3_pa_s2 = [0.0; BORE_CELLS + 1];
        let mut valve_weights = [0.0; BORE_CELLS];
        let mut cell_loss_scale = [0.0; BORE_CELLS];
        let valve_begin_m = 0.19;
        let valve_end_m = 0.56;
        let mut valve_weight_sum = 0.0;

        for face in 0..=BORE_CELLS {
            let physical_position_m = OPEN_LENGTH_M * face as f64 / BORE_CELLS as f64;
            let radius_m = bore_radius_m(physical_position_m);
            face_area_m2[face] = PI * radius_m * radius_m;
        }

        for cell in 0..BORE_CELLS {
            let physical_left_m = OPEN_LENGTH_M * cell as f64 / BORE_CELLS as f64;
            let physical_right_m = OPEN_LENGTH_M * (cell + 1) as f64 / BORE_CELLS as f64;
            let physical_mid_m = 0.5 * (physical_left_m + physical_right_m);
            let integrals = bore_cell_integrals(physical_left_m, physical_mid_m, physical_right_m);
            let physical_length_m = physical_right_m - physical_left_m;
            base_cell_length_m[cell] = physical_length_m * AXIAL_END_CORRECTION_SCALE;
            cell_area_m2[cell] = integrals.area_integral_m3 / physical_length_m;
            base_cell_volume_m3[cell] = integrals.area_integral_m3 * AXIAL_END_CORRECTION_SCALE;
            base_left_inverse_area_integral_m_inv[cell] =
                integrals.left_inverse_area_integral_m_inv * AXIAL_END_CORRECTION_SCALE;
            base_right_inverse_area_integral_m_inv[cell] =
                integrals.right_inverse_area_integral_m_inv * AXIAL_END_CORRECTION_SCALE;
            cell_compliance_m3_pa[cell] = base_cell_volume_m3[cell]
                / (AIR_DENSITY_KG_M3 * SOUND_SPEED_M_S * SOUND_SPEED_M_S);
            cell_compliance_inverse_pa_m3[cell] = 1.0 / cell_compliance_m3_pa[cell];
            let effective_radius_m = physical_length_m / integrals.inverse_radius_integral;
            cell_loss_scale[cell] = WALL_LOSS_REFERENCE_RADIUS_M / effective_radius_m;
            let overlap_m = (physical_right_m.min(valve_end_m)
                - physical_left_m.max(valve_begin_m))
            .max(0.0);
            if overlap_m > 0.0 {
                valve_weights[cell] = overlap_m / physical_length_m;
                valve_weight_sum += valve_weights[cell];
            }
        }
        if valve_weight_sum <= 0.0 {
            return Err(TrumpetError::NonFiniteState);
        }
        for weight in &mut valve_weights {
            *weight /= valve_weight_sum;
        }
        base_cell_length_m[BORE_CELLS - 1] = OPEN_LENGTH_M * AXIAL_END_CORRECTION_SCALE
            - base_cell_length_m[..BORE_CELLS - 1].iter().sum::<f64>();

        for face in 1..BORE_CELLS {
            face_inertance_pa_s2_m3[face] = AIR_DENSITY_KG_M3
                * (base_right_inverse_area_integral_m_inv[face - 1]
                    + base_left_inverse_area_integral_m_inv[face]);
            face_inertance_inverse_m3_pa_s2[face] = 1.0 / face_inertance_pa_s2_m3[face];
        }

        let mut wall_pole_omega_rad_s = [0.0; WALL_LOSS_POLES];
        let mut wall_pole_denominator_inverse = [0.0; WALL_LOSS_POLES];
        let mut wall_pole_state_multiplier = [0.0; WALL_LOSS_POLES];
        let mut wall_pole_coordinate_multiplier = [0.0; WALL_LOSS_POLES];
        for pole in 0..WALL_LOSS_POLES {
            let omega = 2.0
                * PI
                * parameters.wall_loss_relaxation_hz
                * WALL_LOSS_FREQUENCY_RATIOS[pole];
            let half_step_omega = 0.5 * internal_step_seconds * omega;
            wall_pole_omega_rad_s[pole] = omega;
            wall_pole_denominator_inverse[pole] = 1.0 / (1.0 + half_step_omega);
            wall_pole_state_multiplier[pole] =
                (1.0 - half_step_omega) * wall_pole_denominator_inverse[pole];
            wall_pole_coordinate_multiplier[pole] =
                half_step_omega * wall_pole_denominator_inverse[pole];
        }

        let mut cell_wall_strength_per_second = [[0.0; WALL_LOSS_POLES]; BORE_CELLS];
        for cell in 0..BORE_CELLS {
            for pole in 0..WALL_LOSS_POLES {
                cell_wall_strength_per_second[cell][pole] = parameters
                    .wall_loss_strength_per_second
                    * WALL_LOSS_NORMALIZED_STRENGTHS[pole]
                    * cell_loss_scale[cell];
            }
        }
        let mut face_wall_strength_per_second =
            [[0.0; WALL_LOSS_POLES]; BORE_CELLS + 1];
        for face in 1..BORE_CELLS {
            let scale = harmonic_mean(cell_loss_scale[face - 1], cell_loss_scale[face]);
            for pole in 0..WALL_LOSS_POLES {
                face_wall_strength_per_second[face][pole] = parameters
                    .wall_loss_strength_per_second
                    * WALL_LOSS_NORMALIZED_STRENGTHS[pole]
                    * scale;
            }
        }
        let mut cell_wall_coordinate_decay = [1.0; BORE_CELLS];
        let mut cell_wall_memory_drive = [[0.0; WALL_LOSS_POLES]; BORE_CELLS];
        for cell in 0..BORE_CELLS {
            let (decay, drive) = discrete_wall_loss_coefficients(
                cell_wall_strength_per_second[cell],
                wall_pole_denominator_inverse,
                internal_step_seconds,
            );
            cell_wall_coordinate_decay[cell] = decay;
            cell_wall_memory_drive[cell] = drive;
        }
        let mut face_wall_coordinate_decay = [1.0; BORE_CELLS + 1];
        let mut face_wall_memory_drive = [[0.0; WALL_LOSS_POLES]; BORE_CELLS + 1];
        for face in 1..BORE_CELLS {
            let (decay, drive) = discrete_wall_loss_coefficients(
                face_wall_strength_per_second[face],
                wall_pole_denominator_inverse,
                internal_step_seconds,
            );
            face_wall_coordinate_decay[face] = decay;
            face_wall_memory_drive[face] = drive;
        }

        let valve_face_indices = [
            nearest_face_index(0.285),
            nearest_face_index(0.375),
            nearest_face_index(0.465),
        ];
        let bell_area_m2 = face_area_m2[BORE_CELLS];
        let bell_radius_m = sqrt(bell_area_m2 / PI);
        let bell_resistance_pa_s_m3 = AIR_DENSITY_KG_M3 * SOUND_SPEED_M_S / bell_area_m2;
        let bell_corner_rad_s = SOUND_SPEED_M_S / (0.61 * bell_radius_m);
        let directivity_corner_hz = SOUND_SPEED_M_S / (2.0 * PI * bell_radius_m);
        let directivity_alpha = 1.0 - exp(-2.0 * PI * directivity_corner_hz * internal_step_seconds);
        let mouth_pressure_memory =
            exp(-internal_step_seconds / MOUTH_PRESSURE_SMOOTHING_SECONDS);
        let lip_resonance_memory =
            exp(-internal_step_seconds / LIP_RESONANCE_SMOOTHING_SECONDS);
        let lip_damping_memory =
            exp(-internal_step_seconds / LIP_DAMPING_SMOOTHING_SECONDS);
        let lip_opening_memory =
            exp(-internal_step_seconds / LIP_OPENING_SMOOTHING_SECONDS);
        let tongue_close_memory =
            exp(-internal_step_seconds / TONGUE_CLOSE_SMOOTHING_SECONDS);
        let tongue_release_memory =
            exp(-internal_step_seconds / TONGUE_RELEASE_SMOOTHING_SECONDS);
        let valve_actuator_decay = exp(-VALVE_ACTUATOR_OMEGA_RAD_S * internal_step_seconds);
        let characteristic_mean_memory =
            exp(-2.0 * PI * CHARACTERISTIC_MEAN_CORNER_HZ * internal_step_seconds);
        let jet_noise_high_pass_alpha =
            1.0 - exp(-2.0 * PI * JET_NOISE_HIGH_PASS_HZ * internal_step_seconds);
        let jet_noise_low_pass_alpha =
            1.0 - exp(-2.0 * PI * JET_NOISE_LOW_PASS_HZ * internal_step_seconds);
        let bore_broadband_damping =
            exp(-parameters.bore_loss_per_second * internal_step_seconds);
        let unit_interval_coefficients = [
            mouth_pressure_memory,
            lip_resonance_memory,
            lip_damping_memory,
            lip_opening_memory,
            tongue_close_memory,
            tongue_release_memory,
            valve_actuator_decay,
            characteristic_mean_memory,
            jet_noise_high_pass_alpha,
            jet_noise_low_pass_alpha,
            directivity_alpha,
            bore_broadband_damping,
        ];
        let geometry_is_valid = base_cell_length_m
            .iter()
            .chain(cell_area_m2.iter())
            .chain(face_area_m2.iter())
            .chain(base_cell_volume_m3.iter())
            .chain(base_left_inverse_area_integral_m_inv.iter())
            .chain(base_right_inverse_area_integral_m_inv.iter())
            .chain(cell_compliance_m3_pa.iter())
            .chain(cell_compliance_inverse_pa_m3.iter())
            .all(|value| value.is_finite() && *value > 0.0)
            && face_inertance_pa_s2_m3[1..BORE_CELLS]
                .iter()
                .chain(face_inertance_inverse_m3_pa_s2[1..BORE_CELLS].iter())
                .all(|value| value.is_finite() && *value > 0.0);
        let wall_model_is_valid = wall_pole_omega_rad_s
            .iter()
            .all(|value| value.is_finite() && *value > 0.0)
            && wall_pole_denominator_inverse
                .iter()
                .all(|value| value.is_finite() && *value > 0.0)
            && wall_pole_state_multiplier
                .iter()
                .chain(wall_pole_coordinate_multiplier.iter())
                .all(|value| value.is_finite())
            && cell_wall_strength_per_second
                .iter()
                .flatten()
                .chain(face_wall_strength_per_second.iter().flatten())
                .all(|value| value.is_finite() && *value >= 0.0)
            && cell_wall_coordinate_decay
                .iter()
                .chain(face_wall_coordinate_decay.iter())
                .all(|value| value.is_finite() && fabs(*value) <= 1.0)
            && cell_wall_memory_drive
                .iter()
                .flatten()
                .chain(face_wall_memory_drive.iter().flatten())
                .all(|value| value.is_finite() && *value >= 0.0);
        if !geometry_is_valid
            || !wall_model_is_valid
            || !bell_resistance_pa_s_m3.is_finite()
            || bell_resistance_pa_s_m3 <= 0.0
            || !bell_corner_rad_s.is_finite()
            || bell_corner_rad_s <= 0.0
            || unit_interval_coefficients
                .iter()
                .any(|value| !value.is_finite() || !(0.0..=1.0).contains(value))
        {
            return Err(TrumpetError::NonFiniteState);
        }
        let decimator =
            OversampledOutput::new(output_sample_rate_hz, parameters.oversample_factor)?;
        let resting_controls = resting_trumpet_controls();

        Ok(Self {
            output_sample_rate_hz,
            internal_step_seconds,
            parameters,
            pressure_pa: [0.0; BORE_CELLS],
            pressure_wall_memory_pa: [[0.0; WALL_LOSS_POLES]; BORE_CELLS],
            outgoing_characteristic_mean_pa: [0.0; BORE_CELLS],
            incoming_characteristic_mean_pa: [0.0; BORE_CELLS],
            volume_flow_m3_s: [0.0; BORE_CELLS + 1],
            flow_wall_memory_m3_s: [[0.0; WALL_LOSS_POLES]; BORE_CELLS + 1],
            base_cell_length_m,
            cell_length_m: base_cell_length_m,
            cell_area_m2,
            face_area_m2,
            base_cell_volume_m3,
            base_left_inverse_area_integral_m_inv,
            base_right_inverse_area_integral_m_inv,
            cell_compliance_m3_pa,
            cell_compliance_inverse_pa_m3,
            face_inertance_pa_s2_m3,
            face_inertance_inverse_m3_pa_s2,
            cell_wall_strength_per_second,
            face_wall_strength_per_second,
            cell_wall_coordinate_decay,
            cell_wall_memory_drive,
            face_wall_coordinate_decay,
            face_wall_memory_drive,
            wall_pole_omega_rad_s,
            wall_pole_denominator_inverse,
            wall_pole_state_multiplier,
            wall_pole_coordinate_multiplier,
            valve_weights,
            valve_face_indices,
            valve_quadratic_resistance_pa_s2_m6: [0.0; BORE_CELLS + 1],
            valve_position: [0.0; 3],
            valve_velocity_per_second: [0.0; 3],
            active_controls: resting_controls,
            controls_initialized: false,
            mouth_pressure_memory,
            lip_resonance_memory,
            lip_damping_memory,
            lip_opening_memory,
            tongue_close_memory,
            tongue_release_memory,
            valve_actuator_decay,
            characteristic_mean_memory,
            jet_noise_high_pass_alpha,
            jet_noise_low_pass_alpha,
            previous_lip_controls: resting_controls,
            previous_mouth_pressure_pa: 0.0,
            previous_equilibrium_opening_m: 0.0,
            cup_pressure_pa: 0.0,
            lip_displacement_m: 0.0,
            lip_displacement_mean_m: 0.0,
            lip_oscillation_mean_m: 0.0,
            lip_velocity_m_s: 0.0,
            lip_acceleration_m_s2: 0.0,
            lip_streamwise_displacement_m: 0.0,
            lip_streamwise_velocity_m_s: 0.0,
            lip_streamwise_acceleration_m_s2: 0.0,
            lip_opening_pressure_pa: 0.0,
            lip_jet_flow_m3_s: 0.0,
            lip_jet_acceleration_m3_s2: 0.0,
            lip_jet_area_m2: 0.0,
            lip_jet_dissipation_w: 0.0,
            throat_flow_m3_s: 0.0,
            jet_noise_state: JetNoiseState::new(),
            jet_noise_pressure_pa: 0.0,
            bell_memory_flow_m3_s: 0.0,
            previous_bell_flow_m3_s: 0.0,
            bell_resistance_pa_s_m3,
            bell_corner_rad_s,
            directivity_lowpass_flow_acceleration_m3_s2: 0.0,
            directivity_alpha,
            bore_broadband_damping,
            decimator,
            last_lip_report: LipSolveReport::ZERO,
            substep_counter: 0,
        })
    }

    #[must_use]
    pub fn output_sample_rate_hz(&self) -> f64 {
        self.output_sample_rate_hz
    }

    #[must_use]
    pub fn current_valves(&self) -> [f64; 3] {
        self.valve_position
    }

    #[must_use]
    pub fn effective_length_m(&self) -> f64 {
        self.cell_length_m.iter().sum()
    }

    #[must_use]
    /// Round-5 measurement probe: (normal displacement, tracked displacement
    /// mean, tracked oscillation mean). Diagnostic-only; the aperture is
    /// `controls.equilibrium_opening_m + 2 * normal displacement`.
    #[must_use]
    pub fn lip_probe_m(&self) -> (f64, f64, f64) {
        (
            self.lip_displacement_m,
            self.lip_displacement_mean_m,
            self.lip_oscillation_mean_m,
        )
    }

    pub fn last_lip_report(&self) -> LipSolveReport {
        self.last_lip_report
    }

    /// Round-6 anti-crescendo probe: the flow/pressure path state a test needs
    /// to attribute where blowing-pressure growth is eaten. Probe-only; never
    /// consumed by rendering.
    pub fn flow_probe(&self) -> (f64, f64, f64, f64) {
        (
            self.lip_jet_flow_m3_s,
            self.cup_pressure_pa,
            self.throat_flow_m3_s,
            self.lip_jet_area_m2,
        )
    }

    /// Linear small-signal input impedance of the exact cup, throat, stepped
    /// finite-volume bore, radius-dependent wall memory, and passive bell load.
    pub fn diagnostic_input_impedance(
        &self,
        frequency_hz: f64,
    ) -> Result<InputImpedanceDiagnostic, TrumpetError> {
        if !frequency_hz.is_finite() || frequency_hz <= 0.0 {
            return Err(TrumpetError::NonFiniteState);
        }
        let omega = 2.0 * PI * frequency_hz;
        let radiation_denominator = self.bell_corner_rad_s * self.bell_corner_rad_s + omega * omega;
        let mut impedance = ComplexValue {
            real: self.bell_resistance_pa_s_m3 * omega * omega / radiation_denominator,
            imaginary: self.bell_resistance_pa_s_m3 * omega * self.bell_corner_rad_s
                / radiation_denominator,
        };
        for cell in (0..BORE_CELLS).rev() {
            let mut attenuation_per_second = self.parameters.bore_loss_per_second;
            let mut phase_rate_rad_s = omega;
            for pole in 0..WALL_LOSS_POLES {
                let relaxation = self.wall_pole_omega_rad_s[pole];
                let denominator = relaxation * relaxation + omega * omega;
                let strength = self.cell_wall_strength_per_second[cell][pole];
                attenuation_per_second += strength * omega * omega / denominator;
                phase_rate_rad_s += strength * omega * relaxation / denominator;
            }
            let attenuation =
                attenuation_per_second * self.cell_length_m[cell] / SOUND_SPEED_M_S;
            let phase = phase_rate_rad_s * self.cell_length_m[cell] / SOUND_SPEED_M_S;
            let propagation_cosine = ComplexValue {
                real: cosh(attenuation) * cos(phase),
                imaginary: sinh(attenuation) * sin(phase),
            };
            let propagation_sine = ComplexValue {
                real: sinh(attenuation) * cos(phase),
                imaginary: cosh(attenuation) * sin(phase),
            };
            let characteristic_impedance =
                AIR_DENSITY_KG_M3 * SOUND_SPEED_M_S / self.cell_area_m2[cell];
            let numerator = propagation_cosine
                .multiply(impedance)
                .add(propagation_sine.scale(characteristic_impedance));
            let denominator = propagation_sine
                .scale(1.0 / characteristic_impedance)
                .multiply(impedance)
                .add(propagation_cosine);
            impedance = numerator.divide(denominator)?;
        }
        impedance.real += self.parameters.throat_resistance_pa_s_m3;
        impedance.imaginary += omega * self.parameters.throat_inertance_pa_s2_m3;
        let bore_admittance = impedance.reciprocal()?;
        let cup_admittance = ComplexValue {
            real: bore_admittance.real,
            imaginary: bore_admittance.imaginary
                + omega * self.parameters.mouthpiece_compliance_m3_pa,
        };
        let input_impedance = cup_admittance.reciprocal()?;
        let magnitude = input_impedance.magnitude();
        let normalization = AIR_DENSITY_KG_M3 * SOUND_SPEED_M_S / MOUTHPIECE_CUP_ENTRY_AREA_M2;
        Ok(InputImpedanceDiagnostic {
            magnitude_pa_s_m3: magnitude,
            normalized_magnitude: magnitude / normalization,
            phase_degrees: atan2(input_impedance.imaginary, input_impedance.real) * 180.0 / PI,
        })
    }

    #[must_use]
    pub fn diagnostic_lip_displacement_m(&self) -> f64 {
        self.lip_displacement_m
    }

    #[must_use]
    pub fn stored_energy_j(&self, controls: TrumpetControls) -> f64 {
        let controls = controls.validate().unwrap_or(self.active_controls);
        let mechanics = self.lip_mechanics(controls);
        let contact = self.lip_contact(
            controls,
            mechanics,
            self.lip_displacement_m,
            self.lip_streamwise_displacement_m,
            self.lip_velocity_m_s,
            self.lip_streamwise_velocity_m_s,
        );
        let opening_displacement_m = self.lip_displacement_m.max(0.0);
        let hyperelastic_stiffness_n_m3 = LIP_HYPERELASTIC_STIFFNESS_RATIO
            * mechanics.normal_stiffness_n_m
            / (LIP_HYPERELASTIC_SCALE_M * LIP_HYPERELASTIC_SCALE_M);
        let mut energy = 0.5
            * mechanics.normal_mass_kg
            * self.lip_velocity_m_s
            * self.lip_velocity_m_s
            + 0.5
                * mechanics.streamwise_mass_kg
                * self.lip_streamwise_velocity_m_s
                * self.lip_streamwise_velocity_m_s
            + 0.5
                * mechanics.normal_stiffness_n_m
                * self.lip_displacement_m
                * self.lip_displacement_m
            + 0.5
                * mechanics.streamwise_stiffness_n_m
                * self.lip_streamwise_displacement_m
                * self.lip_streamwise_displacement_m
            + mechanics.cross_stiffness_n_m
                * self.lip_displacement_m
                * self.lip_streamwise_displacement_m
            + 0.25 * hyperelastic_stiffness_n_m3 * opening_displacement_m.powi(4)
            + contact.potential_energy_j
            + 0.5
                * self.parameters.mouthpiece_compliance_m3_pa
                * self.cup_pressure_pa
                * self.cup_pressure_pa
            + 0.5
                * self.parameters.throat_inertance_pa_s2_m3
                * self.throat_flow_m3_s
                * self.throat_flow_m3_s;
        let opening_m = self
            .lip_aperture_m(
                controls,
                self.lip_displacement_m,
                self.lip_streamwise_displacement_m,
            )
            .max(0.0);
        let geometric_area_m2 = self.parameters.lip_width_m
            * opening_m
            * (1.0 - controls.tongue_contact).powi(2);
        if geometric_area_m2 > 0.0 {
            let discharge = lip_discharge_coefficient(geometric_area_m2);
            let effective_area_m2 = geometric_area_m2 * discharge;
            let channel_length_m = (LIP_THICKNESS_M + self.lip_streamwise_displacement_m)
                .clamp(0.25 * LIP_THICKNESS_M, 2.0 * LIP_THICKNESS_M);
            let jet_inertance_pa_s2_m3 =
                AIR_DENSITY_KG_M3 * channel_length_m / effective_area_m2;
            energy +=
                0.5 * jet_inertance_pa_s2_m3 * self.lip_jet_flow_m3_s * self.lip_jet_flow_m3_s;
        }
        for cell in 0..BORE_CELLS {
            let compliance = self.cell_compliance_m3_pa[cell];
            energy += 0.5 * compliance * self.pressure_pa[cell] * self.pressure_pa[cell];
            for pole in 0..WALL_LOSS_POLES {
                energy += 0.5
                    * compliance
                    * self.cell_wall_strength_per_second[cell][pole]
                    / self.wall_pole_omega_rad_s[pole]
                    * self.pressure_wall_memory_pa[cell][pole]
                    * self.pressure_wall_memory_pa[cell][pole];
            }
        }
        for face in 1..BORE_CELLS {
            let inertance = self.face_inertance_pa_s2_m3[face];
            energy += 0.5 * inertance * self.volume_flow_m3_s[face].powi(2);
            for pole in 0..WALL_LOSS_POLES {
                energy += 0.5
                    * inertance
                    * self.face_wall_strength_per_second[face][pole]
                    / self.wall_pole_omega_rad_s[pole]
                    * self.flow_wall_memory_m3_s[face][pole]
                    * self.flow_wall_memory_m3_s[face][pole];
            }
        }
        energy += self.bell_resistance_pa_s_m3 * self.bell_memory_flow_m3_s.powi(2)
            / (2.0 * self.bell_corner_rad_s);
        energy
    }

    /// One output-rate sample. Four physical substeps and four anti-alias
    /// inputs are mandatory; no fast or bypass branch exists.
    pub fn process_sample(&mut self, controls: TrumpetControls) -> Result<f64, TrumpetError> {
        let target = controls.validate()?;
        let mut output = None;
        for _ in 0..OVERSAMPLE_FACTOR {
            let radiated = self.process_substep(target)?;
            output = self.decimator.push_oversampled(radiated);
        }
        output.ok_or(TrumpetError::OversamplingBypassed)
    }

    fn process_substep(&mut self, target: TrumpetControls) -> Result<f64, TrumpetError> {
        let dt = self.internal_step_seconds;
        let effective_controls = self.proposed_controls(target, dt);
        let (next_noise_state, jet_noise_pressure_pa) =
            self.proposed_jet_noise(effective_controls, dt);
        self.solve_lip_cup_with_continuation(
            effective_controls,
            dt,
            jet_noise_pressure_pa,
        )?;
        self.active_controls = effective_controls;
        self.controls_initialized = true;
        self.jet_noise_state = next_noise_state;
        self.jet_noise_pressure_pa = jet_noise_pressure_pa;

        let (next_valve_position, next_valve_velocity) = self.proposed_valve_state(target.valves, dt);
        self.apply_valve_geometry(next_valve_position, next_valve_velocity);
        self.active_controls.valves = self.valve_position;

        for face in 1..BORE_CELLS {
            let inertance_inverse = self.face_inertance_inverse_m3_pa_s2[face];
            let pressure_difference_pa = self.pressure_pa[face] - self.pressure_pa[face - 1];
            let provisional_flow_m3_s = self.volume_flow_m3_s[face]
                - dt * pressure_difference_pa * inertance_inverse;
            let quadratic_resistance = self.valve_quadratic_resistance_pa_s2_m6[face];
            self.volume_flow_m3_s[face] = solve_backward_quadratic_drag(
                provisional_flow_m3_s,
                dt * quadratic_resistance * inertance_inverse,
            ) * self.bore_broadband_damping;
            apply_coupled_wall_loss_step(
                &mut self.volume_flow_m3_s[face],
                &mut self.flow_wall_memory_m3_s[face],
                self.face_wall_coordinate_decay[face],
                self.face_wall_memory_drive[face],
                self.wall_pole_state_multiplier,
                self.wall_pole_coordinate_multiplier,
            );
        }
        self.volume_flow_m3_s[0] = self.throat_flow_m3_s;

        let old_bell_pressure_pa = self.pressure_pa[BORE_CELLS - 1];
        let old_bell_memory_flow_m3_s = self.bell_memory_flow_m3_s;
        let old_bell_flow_m3_s =
            old_bell_memory_flow_m3_s + old_bell_pressure_pa / self.bell_resistance_pa_s_m3;
        let last_compliance_inverse = self.cell_compliance_inverse_pa_m3[BORE_CELLS - 1];
        let left_flow_m3_s = self.volume_flow_m3_s[BORE_CELLS - 1];
        let memory_coupling =
            dt * self.bell_corner_rad_s / (2.0 * self.bell_resistance_pa_s_m3);
        let boundary_coefficient = 0.5
            * dt
            * last_compliance_inverse
            * (memory_coupling + 1.0 / self.bell_resistance_pa_s_m3);
        let new_bell_pressure_pa = ((1.0 - boundary_coefficient) * old_bell_pressure_pa
            + dt
                * last_compliance_inverse
                * (left_flow_m3_s - old_bell_memory_flow_m3_s))
            / (1.0 + boundary_coefficient);
        let provisional_bell_memory_flow_m3_s = old_bell_memory_flow_m3_s
            + memory_coupling * (old_bell_pressure_pa + new_bell_pressure_pa);
        let provisional_bell_flow_m3_s = provisional_bell_memory_flow_m3_s
            + new_bell_pressure_pa / self.bell_resistance_pa_s_m3;
        self.volume_flow_m3_s[BORE_CELLS] = provisional_bell_flow_m3_s;

        let mut next_pressure_pa = self.pressure_pa;
        for cell in 0..BORE_CELLS - 1 {
            let divergence_m3_s = self.volume_flow_m3_s[cell + 1] - self.volume_flow_m3_s[cell];
            next_pressure_pa[cell] = self.pressure_pa[cell]
                - dt * divergence_m3_s * self.cell_compliance_inverse_pa_m3[cell];
        }
        next_pressure_pa[BORE_CELLS - 1] = new_bell_pressure_pa;
        self.apply_tvd_nonlinearity(&mut next_pressure_pa, dt);
        for cell in 0..BORE_CELLS {
            next_pressure_pa[cell] *= self.bore_broadband_damping;
            apply_coupled_wall_loss_step(
                &mut next_pressure_pa[cell],
                &mut self.pressure_wall_memory_pa[cell],
                self.cell_wall_coordinate_decay[cell],
                self.cell_wall_memory_drive[cell],
                self.wall_pole_state_multiplier,
                self.wall_pole_coordinate_multiplier,
            );
        }
        let final_bell_pressure_pa = next_pressure_pa[BORE_CELLS - 1];
        let final_bell_memory_flow_m3_s = old_bell_memory_flow_m3_s
            + memory_coupling * (old_bell_pressure_pa + final_bell_pressure_pa);
        let final_bell_flow_m3_s = final_bell_memory_flow_m3_s
            + final_bell_pressure_pa / self.bell_resistance_pa_s_m3;
        self.bell_memory_flow_m3_s = final_bell_memory_flow_m3_s;
        self.previous_bell_flow_m3_s = final_bell_flow_m3_s;
        self.volume_flow_m3_s[BORE_CELLS] = final_bell_flow_m3_s;
        self.pressure_pa = next_pressure_pa;

        if !self.state_is_finite() {
            return Err(TrumpetError::NonFiniteState);
        }
        let bell_flow_acceleration_m3_s2 =
            (final_bell_flow_m3_s - old_bell_flow_m3_s) / dt;
        self.directivity_lowpass_flow_acceleration_m3_s2 += self.directivity_alpha
            * (bell_flow_acceleration_m3_s2
                - self.directivity_lowpass_flow_acceleration_m3_s2);
        let directed_flow_acceleration_m3_s2 = bell_flow_acceleration_m3_s2
            - DIRECTIVITY_LOW_PASS_GAIN * self.directivity_lowpass_flow_acceleration_m3_s2;
        self.substep_counter = self.substep_counter.wrapping_add(1);
        if self.substep_counter & 255 == 0 {
            self.flush_denormals();
        }
        let far_field_pressure_pa =
            AIR_DENSITY_KG_M3 * directed_flow_acceleration_m3_s2 / (2.0 * PI);
        Ok(far_field_pressure_pa / DIGITAL_FULL_SCALE_PRESSURE_PA)
    }

    fn proposed_controls(&self, target: TrumpetControls, dt: f64) -> TrumpetControls {
        let mut current = self.active_controls;
        if !self.controls_initialized {
            current.lip_resonance_hz = target.lip_resonance_hz;
            current.lip_damping_ratio = target.lip_damping_ratio;
            current.tongue_contact = target.tongue_contact;
        }
        debug_assert!(fabs(dt - self.internal_step_seconds) <= f64::EPSILON);
        let tongue_memory = if target.tongue_contact > current.tongue_contact {
            self.tongue_close_memory
        } else {
            self.tongue_release_memory
        };
        TrumpetControls {
            mouth_pressure_pa: smooth_toward_with_memory(
                current.mouth_pressure_pa,
                target.mouth_pressure_pa,
                self.mouth_pressure_memory,
            ),
            lip_resonance_hz: smooth_toward_with_memory(
                current.lip_resonance_hz,
                target.lip_resonance_hz,
                self.lip_resonance_memory,
            ),
            lip_damping_ratio: smooth_toward_with_memory(
                current.lip_damping_ratio,
                target.lip_damping_ratio,
                self.lip_damping_memory,
            ),
            equilibrium_opening_m: smooth_toward_with_memory(
                current.equilibrium_opening_m,
                target.equilibrium_opening_m,
                self.lip_opening_memory,
            ),
            tongue_contact: smooth_toward_with_memory(
                current.tongue_contact,
                target.tongue_contact,
                tongue_memory,
            ),
            valves: target.valves,
        }
    }

    fn proposed_jet_noise(
        &self,
        controls: TrumpetControls,
        dt: f64,
    ) -> (JetNoiseState, f64) {
        let opening_m = self
            .lip_aperture_m(
                controls,
                self.lip_displacement_m,
                self.lip_streamwise_displacement_m,
            )
            .max(0.0);
        let area_m2 = self.parameters.lip_width_m
            * opening_m
            * (1.0 - controls.tongue_contact).powi(2);
        let velocity_m_s = fabs(self.lip_jet_flow_m3_s) / area_m2.max(1.0e-10);
        let hydraulic_diameter_m = 2.0 * opening_m.max(LIP_MINIMUM_HYDRAULIC_GAP_M);
        let reynolds = AIR_DENSITY_KG_M3 * velocity_m_s * hydraulic_diameter_m
            / AIR_DYNAMIC_VISCOSITY_PA_S;
        let turbulence = smoothstep(
            (reynolds - JET_NOISE_REYNOLDS_BEGIN)
                / (JET_NOISE_REYNOLDS_FULL - JET_NOISE_REYNOLDS_BEGIN),
        );
        let pressure_drop_pa = fabs(controls.mouth_pressure_pa - self.cup_pressure_pa);
        let amplitude_pa = JET_NOISE_PRESSURE_FRACTION * pressure_drop_pa * turbulence;
        let mut next_state = self.jet_noise_state;
        debug_assert!(fabs(dt - self.internal_step_seconds) <= f64::EPSILON);
        let normalized = next_state.advance(
            self.jet_noise_high_pass_alpha,
            self.jet_noise_low_pass_alpha,
        );
        (next_state, amplitude_pa * normalized)
    }

    fn proposed_valve_state(&self, target: [f64; 3], dt: f64) -> ([f64; 3], [f64; 3]) {
        let mut position = self.valve_position;
        let mut velocity = self.valve_velocity_per_second;
        debug_assert!(fabs(dt - self.internal_step_seconds) <= f64::EPSILON);
        let decay = self.valve_actuator_decay;
        for valve in 0..3 {
            let error = position[valve] - target[valve];
            let coupled = velocity[valve] + VALVE_ACTUATOR_OMEGA_RAD_S * error;
            let new_error = (error + coupled * dt) * decay;
            let new_velocity =
                (velocity[valve] - VALVE_ACTUATOR_OMEGA_RAD_S * coupled * dt) * decay;
            position[valve] = (target[valve] + new_error).clamp(0.0, 1.0);
            velocity[valve] = new_velocity;
            if (position[valve] == 0.0 && velocity[valve] < 0.0)
                || (position[valve] == 1.0 && velocity[valve] > 0.0)
            {
                velocity[valve] = 0.0;
            }
        }
        (position, velocity)
    }

    fn apply_valve_geometry(&mut self, position: [f64; 3], velocity: [f64; 3]) {
        let movement = fabs(position[0] - self.valve_position[0])
            + fabs(position[1] - self.valve_position[1])
            + fabs(position[2] - self.valve_position[2]);
        self.valve_velocity_per_second = velocity;
        if movement <= 1.0e-14 {
            self.valve_position = position;
            return;
        }
        let old_compliance = self.cell_compliance_m3_pa;
        let old_inertance = self.face_inertance_pa_s2_m3;
        let added_length_m = valve_added_length_m(position);
        let transition_gain = pow(self.parameters.valve_transition_energy_gain, movement);
        for cell in 0..BORE_CELLS {
            let added_cell_length_m = added_length_m * self.valve_weights[cell];
            self.cell_length_m[cell] = self.base_cell_length_m[cell] + added_cell_length_m;
            let volume_m3 = self.base_cell_volume_m3[cell]
                + self.cell_area_m2[cell] * added_cell_length_m;
            self.cell_compliance_m3_pa[cell] =
                volume_m3 / (AIR_DENSITY_KG_M3 * SOUND_SPEED_M_S * SOUND_SPEED_M_S);
            self.cell_compliance_inverse_pa_m3[cell] =
                1.0 / self.cell_compliance_m3_pa[cell];
        }
        for face in 1..BORE_CELLS {
            let left_added_m = added_length_m * self.valve_weights[face - 1];
            let right_added_m = added_length_m * self.valve_weights[face];
            self.face_inertance_pa_s2_m3[face] = AIR_DENSITY_KG_M3
                * (self.base_right_inverse_area_integral_m_inv[face - 1]
                    + 0.5 * left_added_m / self.cell_area_m2[face - 1]
                    + self.base_left_inverse_area_integral_m_inv[face]
                    + 0.5 * right_added_m / self.cell_area_m2[face]);
            self.face_inertance_inverse_m3_pa_s2[face] =
                1.0 / self.face_inertance_pa_s2_m3[face];
        }
        let gain_scale = sqrt(transition_gain);
        for cell in 0..BORE_CELLS {
            let scale = sqrt(old_compliance[cell] / self.cell_compliance_m3_pa[cell]) * gain_scale;
            self.pressure_pa[cell] *= scale;
            self.outgoing_characteristic_mean_pa[cell] *= scale;
            self.incoming_characteristic_mean_pa[cell] *= scale;
            for pole in 0..WALL_LOSS_POLES {
                self.pressure_wall_memory_pa[cell][pole] *= scale;
            }
        }
        for face in 1..BORE_CELLS {
            let scale = sqrt(old_inertance[face] / self.face_inertance_pa_s2_m3[face]) * gain_scale;
            self.volume_flow_m3_s[face] *= scale;
            for pole in 0..WALL_LOSS_POLES {
                self.flow_wall_memory_m3_s[face][pole] *= scale;
            }
        }
        self.valve_position = position;
        self.update_valve_resistance_cache();
    }

    fn update_valve_resistance_cache(&mut self) {
        let face_indices = self.valve_face_indices;
        for face in face_indices {
            self.valve_quadratic_resistance_pa_s2_m6[face] = 0.0;
        }
        for valve in 0..3 {
            let face = face_indices[valve];
            let position = self.valve_position[valve];
            let transition = 4.0 * position * (1.0 - position);
            let coefficient = VALVE_SEATED_LOSS_COEFFICIENT * position
                + VALVE_TRANSITION_LOSS_COEFFICIENT * transition * transition;
            self.valve_quadratic_resistance_pa_s2_m6[face] += 0.5
                * AIR_DENSITY_KG_M3
                * coefficient
                / (self.face_area_m2[face] * self.face_area_m2[face]);
        }
    }

    fn solve_lip_cup_with_continuation(
        &mut self,
        controls: TrumpetControls,
        dt: f64,
        jet_noise_pressure_pa: f64,
    ) -> Result<(), TrumpetError> {
        let original = self.lip_state_snapshot();
        match self.solve_lip_cup(controls, dt, jet_noise_pressure_pa) {
            Ok(()) => return Ok(()),
            Err(TrumpetError::LipSolveDidNotConverge) => {}
            Err(other) => {
                self.restore_lip_state(original);
                return Err(other);
            }
        }
        let mut work_report = self.last_lip_report;
        let mut fallback_solves = 0_usize;
        self.restore_lip_state(original);

        let path_beginning = original.previous_lip_controls;
        let controls_moved = fabs(controls.mouth_pressure_pa - path_beginning.mouth_pressure_pa)
            > 1.0e-9
            || fabs(controls.lip_resonance_hz - path_beginning.lip_resonance_hz) > 1.0e-9
            || fabs(controls.lip_damping_ratio - path_beginning.lip_damping_ratio) > 1.0e-12
            || fabs(controls.equilibrium_opening_m - path_beginning.equilibrium_opening_m)
                > 1.0e-12
            || fabs(controls.tongue_contact - path_beginning.tongue_contact) > 1.0e-12;
        if controls_moved {
            let mut path_ok = true;
            for substep in 1..=LIP_CONTINUATION_SUBSTEPS {
                let fraction = substep as f64 / LIP_CONTINUATION_SUBSTEPS as f64;
                let staged = interpolate_controls(path_beginning, controls, fraction);
                fallback_solves = fallback_solves.saturating_add(1);
                let result = self.solve_lip_cup(
                    staged,
                    dt / LIP_CONTINUATION_SUBSTEPS as f64,
                    jet_noise_pressure_pa,
                );
                work_report.accumulate(self.last_lip_report);
                match result {
                    Ok(()) => {}
                    Err(TrumpetError::LipSolveDidNotConverge) => {
                        path_ok = false;
                        break;
                    }
                    Err(other) => {
                        self.restore_lip_state(original);
                        work_report.fallback_bisections = fallback_solves;
                        self.last_lip_report = work_report;
                        return Err(other);
                    }
                }
            }
            if path_ok {
                work_report.fallback_bisections = fallback_solves;
                self.last_lip_report = work_report;
                return Ok(());
            }
            self.restore_lip_state(original);
        }

        for divisions in LIP_TIME_SUBDIVISION_TIERS {
            let mut tier_ok = true;
            for _ in 0..divisions {
                fallback_solves = fallback_solves.saturating_add(1);
                let result =
                    self.solve_lip_cup(controls, dt / divisions as f64, jet_noise_pressure_pa);
                work_report.accumulate(self.last_lip_report);
                match result {
                    Ok(()) => {}
                    Err(TrumpetError::LipSolveDidNotConverge) => {
                        tier_ok = false;
                        break;
                    }
                    Err(other) => {
                        self.restore_lip_state(original);
                        work_report.fallback_bisections = fallback_solves;
                        self.last_lip_report = work_report;
                        return Err(other);
                    }
                }
            }
            if tier_ok {
                work_report.fallback_bisections = fallback_solves;
                self.last_lip_report = work_report;
                return Ok(());
            }
            self.restore_lip_state(original);
        }
        work_report.fallback_bisections = fallback_solves;
        self.last_lip_report = work_report;
        Err(TrumpetError::LipSolveDidNotConverge)
    }

    fn solve_lip_cup(
        &mut self,
        controls: TrumpetControls,
        dt: f64,
        jet_noise_pressure_pa: f64,
    ) -> Result<(), TrumpetError> {
        self.last_lip_report = LipSolveReport::ZERO;
        let beta = 0.25;
        let gamma = 0.5;
        let mechanics = self.lip_mechanics(controls);
        let old_pressure_pa = self.cup_pressure_pa;
        let pressure_predictor_pa = old_pressure_pa
            + 0.8 * (controls.mouth_pressure_pa - self.previous_mouth_pressure_pa);
        /*
         * Round-5 pressure schedule (bead jcpe-trumpet-lock-completion-el46):
         * the legacy pressure-blind knee/ride clamp made spectral centroid
         * FALL with pressure (measured 2186->1328->577 Hz at nonlinear x5)
         * because the servo removed source harmonics faster than cumulative
         * steepening added them. Real embouchure closure DEEPENS with
         * dynamics, so both the knee and the grazing ride point shrink as
         * (p/p_ref)^-exponent. Exponents live in TrumpetParameters and are
         * frozen from the measured sweep; the factor is clamped at unity
         * below the mp reference so soft playing keeps the proven round-2/3
         * behavior bit-exactly when the exponents are zero.
         */
        let pressure_factor =
            (controls.mouth_pressure_pa / LIP_SERVO_PRESSURE_REF_PA).max(1.0);
        /*
         * Round-6 (bead jcpe-trumpet-lock-completion-el46): the measured
         * anti-crescendo eater is mean-aperture drift — rising blowing
         * pressure out-muscles the fixed-gain knee servo, the DC leak grows,
         * and the oscillatory flow (the sound source) starves (probe matrix:
         * acQ 1.675e-4 -> 2.2e-6 at comp=0 while dcQ doubles; cup coupling
         * and throat resistance both refuted, <=428 Pa of 8.5 kPa). A real
         * embouchure firms with dynamics, so BOTH the knee (operating mean,
         * deepens toward closure) and the servo gain (lip tension) are
         * pressure-scheduled. At the mp reference (pressure_factor == 1)
         * behavior is bit-exact legacy for zero exponents.
         */
        /*
         * Anchor correction (round-6 probe): the legacy 1.2e-3 m knee sits
         * ~3x ABOVE this model's actual operating displacement (measured mp
         * mean 4.0e-4 m via aperture 5.585e-6 m2 / width 7e-3 / 2), so the
         * knee servo never engaged and its gain was provably inert. With a
         * nonzero gain exponent the servo re-anchors at the measured healthy
         * mp operating mean and stays always-on above it; at gain exponent
         * zero the legacy knee is preserved bit-exactly for the frozen pins.
         */
        let round6_active = self.parameters.servo_pressure_gain_exponent > 0.0;
        let knee_anchor_m = if round6_active {
            LIP_ROUND6_MEAN_TARGET_M
        } else {
            LIP_EMBOUCHURE_KNEE_M
        };
        let knee_m = knee_anchor_m
            * pow(pressure_factor, -self.parameters.servo_pressure_closure_exponent);
        let servo_gain = LIP_EMBOUCHURE_SERVO_GAIN
            * pow(pressure_factor, self.parameters.servo_pressure_gain_exponent);
        let excess_m = (self.lip_displacement_mean_m - knee_m).max(0.0);
        let knee_force_n = mechanics.normal_stiffness_n_m * servo_gain * excess_m;
        /*
         * Pressure-compensated embouchure: cancel a frozen fraction of the
         * EXCESS static blow-open force with a constant closing bias. This
         * is the player's firming embouchure — it holds the mean opening
         * (and therefore the flow-modulation depth) as dynamics rise,
         * instead of letting the source collapse toward a sinusoid. It is
         * control-constant within the sample so the Newton solve sees a
         * fixed offset, not a new state coupling.
         */
        let embouchure_compensation_force_n = self.parameters.lip_effective_area_m2
            * (controls.mouth_pressure_pa - LIP_SERVO_PRESSURE_REF_PA).max(0.0)
            * self.parameters.embouchure_pressure_compensation;
        let grazing_target_m = LIP_CLOSURE_GRAZING_RATIO
            * pow(pressure_factor, -self.parameters.servo_pressure_closure_exponent)
            * ((PI / 2.0) * self.lip_oscillation_mean_m
                - 0.5 * controls.equilibrium_opening_m);
        let engagement = (self.lip_oscillation_mean_m / LIP_GRAZING_ENGAGE_M).min(1.0);
        let grazing_excess_m = (self.lip_displacement_mean_m - grazing_target_m).max(0.0);
        let grazing_force_n = mechanics.normal_stiffness_n_m
            * LIP_CLOSURE_GRAZING_GAIN
            * engagement
            * grazing_excess_m;
        let embouchure_servo_force_n =
            knee_force_n + grazing_force_n + embouchure_compensation_force_n;
        let normal_displacement_predictor_m = self.lip_displacement_m
            + dt * self.lip_velocity_m_s
            + dt * dt * (0.5 - beta) * self.lip_acceleration_m_s2;
        let normal_velocity_predictor_m_s =
            self.lip_velocity_m_s + dt * (1.0 - gamma) * self.lip_acceleration_m_s2;
        let streamwise_displacement_predictor_m = self.lip_streamwise_displacement_m
            + dt * self.lip_streamwise_velocity_m_s
            + dt * dt * (0.5 - beta) * self.lip_streamwise_acceleration_m_s2;
        let streamwise_velocity_predictor_m_s = self.lip_streamwise_velocity_m_s
            + dt * (1.0 - gamma) * self.lip_streamwise_acceleration_m_s2;
        let old_pressure_port = two_dimensional_lip_pressure_port_balance(
            self.parameters.lip_effective_area_m2,
            self.parameters.lip_width_m,
            self.previous_equilibrium_opening_m,
            self.lip_displacement_m,
            self.lip_streamwise_displacement_m,
            self.lip_velocity_m_s,
            self.lip_streamwise_velocity_m_s,
            self.previous_mouth_pressure_pa,
            old_pressure_pa,
            self.lip_opening_pressure_pa,
        )?;
        let old_lip_flow_m3_s = self.lip_jet_flow_m3_s + old_pressure_port.swept_flow_m3_s;
        let hyperelastic_stiffness_n_m3 = LIP_HYPERELASTIC_STIFFNESS_RATIO
            * mechanics.normal_stiffness_n_m
            / (LIP_HYPERELASTIC_SCALE_M * LIP_HYPERELASTIC_SCALE_M);

        let evaluate = |scaled_state: [f64; 4]| -> Result<LipEvaluation, TrumpetError> {
            let scaled = [
                Dual4::variable(scaled_state[0], 0),
                Dual4::variable(scaled_state[1], 1),
                Dual4::variable(scaled_state[2], 2),
                Dual4::variable(scaled_state[3], 3),
            ];
            let candidate_pressure_pa = scaled[0] * LIP_SOLVE_PRESSURE_SCALE_PA;
            let normal_displacement_m = scaled[1] * LIP_SOLVE_DISPLACEMENT_SCALE_M;
            let streamwise_displacement_m = scaled[2] * LIP_SOLVE_DISPLACEMENT_SCALE_M;
            let jet_flow_m3_s = scaled[3] * LIP_SOLVE_FLOW_SCALE_M3_S;
            let normal_acceleration_m_s2 = (normal_displacement_m
                - normal_displacement_predictor_m)
                / (beta * dt * dt);
            let normal_velocity_m_s =
                normal_velocity_predictor_m_s + gamma * dt * normal_acceleration_m_s2;
            let streamwise_acceleration_m_s2 = (streamwise_displacement_m
                - streamwise_displacement_predictor_m)
                / (beta * dt * dt);
            let streamwise_velocity_m_s = streamwise_velocity_predictor_m_s
                + gamma * dt * streamwise_acceleration_m_s2;
            let contact = dual_lip_contact(
                controls,
                self.parameters,
                mechanics,
                normal_displacement_m,
                streamwise_displacement_m,
                normal_velocity_m_s,
                streamwise_velocity_m_s,
            );
            let aperture_m =
                (controls.equilibrium_opening_m + 2.0 * normal_displacement_m).positive();
            let tongue_open_fraction = (1.0 - controls.tongue_contact).powi(2);
            let geometric_jet_area_m2 =
                self.parameters.lip_width_m * aperture_m * tongue_open_fraction;
            let channel_length_m = (LIP_THICKNESS_M + streamwise_displacement_m)
                .clamp(0.25 * LIP_THICKNESS_M, 2.0 * LIP_THICKNESS_M);
            let jet = dual_adachi_lip_jet_balance(
                geometric_jet_area_m2,
                channel_length_m,
                self.parameters.lip_width_m,
                self.lip_jet_flow_m3_s,
                self.lip_jet_acceleration_m3_s2,
                jet_flow_m3_s,
                controls.mouth_pressure_pa + jet_noise_pressure_pa,
                candidate_pressure_pa,
                dt,
            );
            let pressure_port = dual_lip_pressure_port(
                self.parameters.lip_effective_area_m2,
                self.parameters.lip_width_m,
                controls.equilibrium_opening_m,
                normal_displacement_m,
                streamwise_displacement_m,
                normal_velocity_m_s,
                streamwise_velocity_m_s,
                controls.mouth_pressure_pa,
                candidate_pressure_pa,
                jet.lip_opening_pressure_pa,
            );
            let opening_stiffening_force_n =
                hyperelastic_stiffness_n_m3 * normal_displacement_m.positive().cube();
            let normal_force_residual_n = mechanics.normal_mass_kg * normal_acceleration_m_s2
                + mechanics.normal_damping_n_s_m * normal_velocity_m_s
                + mechanics.cross_damping_n_s_m * streamwise_velocity_m_s
                + mechanics.normal_stiffness_n_m * normal_displacement_m
                + mechanics.cross_stiffness_n_m * streamwise_displacement_m
                + embouchure_servo_force_n
                + opening_stiffening_force_n
                - pressure_port.normal_force_n
                - contact.normal_force_n;
            let streamwise_force_residual_n = mechanics.streamwise_mass_kg
                * streamwise_acceleration_m_s2
                + mechanics.streamwise_damping_n_s_m * streamwise_velocity_m_s
                + mechanics.cross_damping_n_s_m * normal_velocity_m_s
                + mechanics.streamwise_stiffness_n_m * streamwise_displacement_m
                + mechanics.cross_stiffness_n_m * normal_displacement_m
                - pressure_port.streamwise_force_n
                - contact.streamwise_force_n;
            let lip_flow_m3_s = jet_flow_m3_s + pressure_port.swept_flow_m3_s;
            let r = self.parameters.throat_resistance_pa_s_m3;
            let r2 = self.parameters.throat_nonlinear_resistance_pa_s2_m6;
            let l = self.parameters.throat_inertance_pa_s2_m3;
            let throat_linear = 1.0 + 0.5 * dt * r / l;
            let throat_quadratic = 0.5 * dt * r2 / l;
            let throat_right_hand_side = (1.0 - 0.5 * dt * r / l) * self.throat_flow_m3_s
                - throat_quadratic * fabs(self.throat_flow_m3_s) * self.throat_flow_m3_s
                + dt / l
                    * (0.5 * (old_pressure_pa + candidate_pressure_pa) - self.pressure_pa[0]);
            let throat_flow_m3_s = solve_dual_quadratic_drag(
                throat_right_hand_side,
                throat_linear,
                throat_quadratic,
            );
            let cup_residual_pa = candidate_pressure_pa
                - old_pressure_pa
                - 0.5 * dt / self.parameters.mouthpiece_compliance_m3_pa
                    * ((old_lip_flow_m3_s - self.throat_flow_m3_s)
                        + (lip_flow_m3_s - throat_flow_m3_s));
            let scaled_residual = [
                cup_residual_pa / LIP_SOLVE_PRESSURE_SCALE_PA,
                normal_force_residual_n
                    / (mechanics.normal_stiffness_n_m * LIP_SOLVE_DISPLACEMENT_SCALE_M),
                streamwise_force_residual_n
                    / (mechanics.streamwise_stiffness_n_m * LIP_SOLVE_DISPLACEMENT_SCALE_M),
                jet.flow_residual_m3_s / LIP_SOLVE_FLOW_SCALE_M3_S,
            ];
            if scaled_residual.iter().any(|value| !value.is_finite()) {
                return Err(TrumpetError::NonFiniteState);
            }
            let mut residual = [0.0; 4];
            let mut jacobian = [[0.0; 4]; 4];
            for row in 0..4 {
                residual[row] = scaled_residual[row].value;
                jacobian[row] = scaled_residual[row].gradient;
            }
            Ok(LipEvaluation {
                residual,
                jacobian,
                candidate: LipCandidate {
                    cup_pressure_pa: candidate_pressure_pa.value,
                    displacement_m: normal_displacement_m.value,
                    velocity_m_s: normal_velocity_m_s.value,
                    acceleration_m_s2: normal_acceleration_m_s2.value,
                    streamwise_displacement_m: streamwise_displacement_m.value,
                    streamwise_velocity_m_s: streamwise_velocity_m_s.value,
                    streamwise_acceleration_m_s2: streamwise_acceleration_m_s2.value,
                    lip_opening_pressure_pa: jet.lip_opening_pressure_pa.value,
                    jet_flow_m3_s: jet_flow_m3_s.value,
                    jet_acceleration_m3_s2: jet.flow_acceleration_m3_s2.value,
                    jet_area_m2: geometric_jet_area_m2.value,
                    jet_dissipation_w: jet.dissipation_w.value.max(0.0),
                    throat_flow_m3_s: throat_flow_m3_s.value,
                },
            })
        };

        let mut scaled_state = project_lip_state(
            [
                pressure_predictor_pa / LIP_SOLVE_PRESSURE_SCALE_PA,
                self.lip_displacement_m / LIP_SOLVE_DISPLACEMENT_SCALE_M,
                self.lip_streamwise_displacement_m / LIP_SOLVE_DISPLACEMENT_SCALE_M,
                self.lip_jet_flow_m3_s / LIP_SOLVE_FLOW_SCALE_M3_S,
            ],
            controls,
            self.parameters.maximum_lip_opening_m,
            self.parameters.lip_effective_area_m2 / self.parameters.lip_width_m,
        );
        let mut residual_evaluations = 1;
        let mut line_search_evaluations = 0;
        let mut regularization_evaluations = 0;
        let mut newton_iterations = 0;
        let mut evaluation = match evaluate(scaled_state) {
            Ok(evaluation) => evaluation,
            Err(error) => {
                self.last_lip_report = LipSolveReport {
                    newton_iterations,
                    residual_evaluations,
                    line_search_evaluations,
                    bracket_evaluations: regularization_evaluations,
                    fallback_bisections: 0,
                };
                return Err(error);
            }
        };
        let mut converged = max_abs_four(evaluation.residual) <= LIP_SOLVE_RESIDUAL_TOLERANCE;

        for iteration in 0..MAX_LIP_NEWTON_ITERATIONS {
            if converged {
                break;
            }
            newton_iterations = iteration + 1;
            let Some((mut correction, regularizations)) = regularized_newton_direction(
                evaluation.jacobian,
                evaluation.residual,
            ) else {
                self.last_lip_report = LipSolveReport {
                    newton_iterations,
                    residual_evaluations,
                    line_search_evaluations,
                    bracket_evaluations: regularization_evaluations,
                    fallback_bisections: 0,
                };
                return Err(TrumpetError::LipSolveDidNotConverge);
            };
            regularization_evaluations += regularizations;
            correction[0] = correction[0].clamp(-2.0, 2.0);
            correction[1] = correction[1].clamp(-0.45, 0.45);
            correction[2] = correction[2].clamp(-0.45, 0.45);
            correction[3] = correction[3].clamp(-0.5, 0.5);
            let current_merit = residual_merit(evaluation.residual);
            let mut step = 1.0;
            let mut accepted = None;
            for _ in 0..MAX_LIP_LINE_SEARCH_EVALUATIONS {
                let trial_state = project_lip_state(
                    [
                        scaled_state[0] + step * correction[0],
                        scaled_state[1] + step * correction[1],
                        scaled_state[2] + step * correction[2],
                        scaled_state[3] + step * correction[3],
                    ],
                    controls,
                    self.parameters.maximum_lip_opening_m,
                    self.parameters.lip_effective_area_m2 / self.parameters.lip_width_m,
                );
                residual_evaluations += 1;
                line_search_evaluations += 1;
                if let Ok(trial) = evaluate(trial_state) {
                    let trial_merit = residual_merit(trial.residual);
                    if trial_merit <= current_merit * (1.0 - 1.0e-4 * step)
                        || trial_merit < current_merit
                    {
                        accepted = Some((trial_state, trial));
                        break;
                    }
                }
                step *= 0.5;
            }
            let Some((next_state, next_evaluation)) = accepted else {
                break;
            };
            let last_step_norm = max_abs_four([
                next_state[0] - scaled_state[0],
                next_state[1] - scaled_state[1],
                next_state[2] - scaled_state[2],
                next_state[3] - scaled_state[3],
            ]);
            scaled_state = next_state;
            evaluation = next_evaluation;
            converged = max_abs_four(evaluation.residual) <= LIP_SOLVE_RESIDUAL_TOLERANCE
                || (last_step_norm <= LIP_SOLVE_STEP_TOLERANCE
                    && max_abs_four(evaluation.residual)
                        <= 10.0 * LIP_SOLVE_RESIDUAL_TOLERANCE);
        }
        if !converged || residual_evaluations > MAX_LIP_RESIDUAL_EVALUATIONS {
            self.last_lip_report = LipSolveReport {
                newton_iterations,
                residual_evaluations,
                line_search_evaluations,
                bracket_evaluations: regularization_evaluations,
                fallback_bisections: 0,
            };
            return Err(TrumpetError::LipSolveDidNotConverge);
        }

        let candidate = evaluation.candidate;
        self.cup_pressure_pa = candidate.cup_pressure_pa;
        self.previous_mouth_pressure_pa = controls.mouth_pressure_pa;
        self.previous_equilibrium_opening_m = controls.equilibrium_opening_m;
        self.previous_lip_controls = controls;
        self.lip_displacement_m = candidate.displacement_m;
        let memory = if fabs(dt - self.internal_step_seconds) <= f64::EPSILON {
            self.characteristic_mean_memory
        } else {
            exp(-2.0 * PI * CHARACTERISTIC_MEAN_CORNER_HZ * dt)
        };
        self.lip_displacement_mean_m = memory * self.lip_displacement_mean_m
            + (1.0 - memory) * self.lip_displacement_m;
        let deviation_m = fabs(self.lip_displacement_m - self.lip_displacement_mean_m);
        self.lip_oscillation_mean_m =
            memory * self.lip_oscillation_mean_m + (1.0 - memory) * deviation_m;
        self.lip_velocity_m_s = candidate.velocity_m_s;
        self.lip_acceleration_m_s2 = candidate.acceleration_m_s2;
        self.lip_streamwise_displacement_m = candidate.streamwise_displacement_m;
        self.lip_streamwise_velocity_m_s = candidate.streamwise_velocity_m_s;
        self.lip_streamwise_acceleration_m_s2 = candidate.streamwise_acceleration_m_s2;
        self.lip_opening_pressure_pa = candidate.lip_opening_pressure_pa;
        self.lip_jet_flow_m3_s = candidate.jet_flow_m3_s;
        self.lip_jet_acceleration_m3_s2 = candidate.jet_acceleration_m3_s2;
        self.lip_jet_area_m2 = candidate.jet_area_m2;
        self.lip_jet_dissipation_w = candidate.jet_dissipation_w;
        self.throat_flow_m3_s = candidate.throat_flow_m3_s;
        self.last_lip_report = LipSolveReport {
            newton_iterations,
            residual_evaluations,
            line_search_evaluations,
            bracket_evaluations: regularization_evaluations,
            fallback_bisections: 0,
        };
        Ok(())
    }

    fn lip_state_snapshot(&self) -> LipStateSnapshot {
        LipStateSnapshot {
            previous_lip_controls: self.previous_lip_controls,
            previous_mouth_pressure_pa: self.previous_mouth_pressure_pa,
            previous_equilibrium_opening_m: self.previous_equilibrium_opening_m,
            cup_pressure_pa: self.cup_pressure_pa,
            lip_displacement_m: self.lip_displacement_m,
            lip_displacement_mean_m: self.lip_displacement_mean_m,
            lip_oscillation_mean_m: self.lip_oscillation_mean_m,
            lip_velocity_m_s: self.lip_velocity_m_s,
            lip_acceleration_m_s2: self.lip_acceleration_m_s2,
            lip_streamwise_displacement_m: self.lip_streamwise_displacement_m,
            lip_streamwise_velocity_m_s: self.lip_streamwise_velocity_m_s,
            lip_streamwise_acceleration_m_s2: self.lip_streamwise_acceleration_m_s2,
            lip_opening_pressure_pa: self.lip_opening_pressure_pa,
            lip_jet_flow_m3_s: self.lip_jet_flow_m3_s,
            lip_jet_acceleration_m3_s2: self.lip_jet_acceleration_m3_s2,
            lip_jet_area_m2: self.lip_jet_area_m2,
            lip_jet_dissipation_w: self.lip_jet_dissipation_w,
            throat_flow_m3_s: self.throat_flow_m3_s,
        }
    }

    fn restore_lip_state(&mut self, snapshot: LipStateSnapshot) {
        self.previous_lip_controls = snapshot.previous_lip_controls;
        self.previous_mouth_pressure_pa = snapshot.previous_mouth_pressure_pa;
        self.previous_equilibrium_opening_m = snapshot.previous_equilibrium_opening_m;
        self.cup_pressure_pa = snapshot.cup_pressure_pa;
        self.lip_displacement_m = snapshot.lip_displacement_m;
        self.lip_displacement_mean_m = snapshot.lip_displacement_mean_m;
        self.lip_oscillation_mean_m = snapshot.lip_oscillation_mean_m;
        self.lip_velocity_m_s = snapshot.lip_velocity_m_s;
        self.lip_acceleration_m_s2 = snapshot.lip_acceleration_m_s2;
        self.lip_streamwise_displacement_m = snapshot.lip_streamwise_displacement_m;
        self.lip_streamwise_velocity_m_s = snapshot.lip_streamwise_velocity_m_s;
        self.lip_streamwise_acceleration_m_s2 = snapshot.lip_streamwise_acceleration_m_s2;
        self.lip_opening_pressure_pa = snapshot.lip_opening_pressure_pa;
        self.lip_jet_flow_m3_s = snapshot.lip_jet_flow_m3_s;
        self.lip_jet_acceleration_m3_s2 = snapshot.lip_jet_acceleration_m3_s2;
        self.lip_jet_area_m2 = snapshot.lip_jet_area_m2;
        self.lip_jet_dissipation_w = snapshot.lip_jet_dissipation_w;
        self.throat_flow_m3_s = snapshot.throat_flow_m3_s;
    }

    fn lip_mechanics(&self, controls: TrumpetControls) -> LipMechanics {
        let matrices = two_mode_lip_matrices_unchecked(
            self.parameters.lip_mass_kg,
            controls.lip_resonance_hz,
            controls.lip_damping_ratio,
            self.parameters.lip_effective_area_m2 / self.parameters.lip_width_m,
            LIP_JOINT_NORMAL_POSITION_M,
        );
        LipMechanics {
            normal_mass_kg: matrices.mass_kg,
            streamwise_mass_kg: matrices.mass_kg,
            normal_stiffness_n_m: matrices.normal_stiffness_n_m,
            streamwise_stiffness_n_m: matrices.streamwise_stiffness_n_m,
            cross_stiffness_n_m: matrices.cross_stiffness_n_m,
            normal_damping_n_s_m: matrices.normal_damping_n_s_m,
            streamwise_damping_n_s_m: matrices.streamwise_damping_n_s_m,
            cross_damping_n_s_m: matrices.cross_damping_n_s_m,
        }
    }

    fn lip_aperture_m(
        &self,
        controls: TrumpetControls,
        normal_displacement_m: f64,
        _streamwise_displacement_m: f64,
    ) -> f64 {
        controls.equilibrium_opening_m + 2.0 * normal_displacement_m
    }

    fn lip_contact(
        &self,
        controls: TrumpetControls,
        mechanics: LipMechanics,
        normal_displacement_m: f64,
        streamwise_displacement_m: f64,
        normal_velocity_m_s: f64,
        streamwise_velocity_m_s: f64,
    ) -> LipContact {
        let aperture_m =
            self.lip_aperture_m(controls, normal_displacement_m, streamwise_displacement_m);
        let aperture_velocity_m_s = 2.0 * normal_velocity_m_s;
        let effective_mass_kg = mechanics.normal_mass_kg / 4.0;
        let hertz_stiffness_n_m32 = LIP_CONTACT_STIFFNESS_RATIO
            * mechanics.normal_stiffness_n_m
            / sqrt(LIP_CONTACT_SCALE_M);
        let hunt_crossley_damping_n_s_m32 = 2.0
            * LIP_CONTACT_DAMPING_RATIO
            * sqrt(effective_mass_kg * mechanics.normal_stiffness_n_m)
            / sqrt(LIP_CONTACT_SCALE_M);
        let lower = unilateral_lip_contact_unchecked(
            hertz_stiffness_n_m32,
            hunt_crossley_damping_n_s_m32,
            (-aperture_m).max(0.0),
            -aperture_velocity_m_s,
        );
        let upper = unilateral_lip_contact_unchecked(
            hertz_stiffness_n_m32,
            hunt_crossley_damping_n_s_m32,
            (aperture_m - self.parameters.maximum_lip_opening_m).max(0.0),
            aperture_velocity_m_s,
        );
        let streamwise_hertz_stiffness_n_m32 = LIP_CONTACT_STIFFNESS_RATIO
            * mechanics.streamwise_stiffness_n_m
            / sqrt(LIP_CONTACT_SCALE_M);
        let streamwise_hunt_crossley_damping_n_s_m32 = 2.0
            * LIP_CONTACT_DAMPING_RATIO
            * sqrt(mechanics.streamwise_mass_kg * mechanics.streamwise_stiffness_n_m)
            / sqrt(LIP_CONTACT_SCALE_M);
        let streamwise_rest_position_m =
            self.parameters.lip_effective_area_m2 / self.parameters.lip_width_m;
        let streamwise_lower_penetration_m =
            (-streamwise_rest_position_m - streamwise_displacement_m).max(0.0);
        let streamwise_lower = unilateral_lip_contact_unchecked(
            streamwise_hertz_stiffness_n_m32,
            streamwise_hunt_crossley_damping_n_s_m32,
            streamwise_lower_penetration_m,
            -streamwise_velocity_m_s,
        );
        let streamwise_upper = unilateral_lip_contact_unchecked(
            streamwise_hertz_stiffness_n_m32,
            streamwise_hunt_crossley_damping_n_s_m32,
            (streamwise_displacement_m - LIP_MAX_STREAMWISE_DISPLACEMENT_M).max(0.0),
            streamwise_velocity_m_s,
        );
        LipContact {
            normal_force_n: 2.0 * (lower.force_n - upper.force_n),
            streamwise_force_n: streamwise_lower.force_n - streamwise_upper.force_n,
            potential_energy_j: lower.potential_energy_j
                + upper.potential_energy_j
                + streamwise_lower.potential_energy_j
                + streamwise_upper.potential_energy_j,
        }
    }

    fn apply_tvd_nonlinearity(&mut self, pressure: &mut [f64; BORE_CELLS], dt: f64) {
        if self.parameters.nonlinear_coefficient == 0.0 {
            return;
        }
        let mut outgoing_pressure = [0.0; BORE_CELLS];
        let mut incoming_pressure = [0.0; BORE_CELLS];
        let mut previous_particle_velocity = [0.0; BORE_CELLS];
        debug_assert!(fabs(dt - self.internal_step_seconds) <= f64::EPSILON);
        let mean_memory = self.characteristic_mean_memory;
        for cell in 0..BORE_CELLS {
            let left_velocity_m_s = self.volume_flow_m3_s[cell] / self.face_area_m2[cell];
            let right_velocity_m_s =
                self.volume_flow_m3_s[cell + 1] / self.face_area_m2[cell + 1];
            let particle_velocity_m_s = 0.5 * (left_velocity_m_s + right_velocity_m_s);
            previous_particle_velocity[cell] = particle_velocity_m_s;
            let impedance_velocity_pa = AIR_DENSITY_KG_M3 * SOUND_SPEED_M_S * particle_velocity_m_s;
            let outgoing_pa = 0.5 * (pressure[cell] + impedance_velocity_pa);
            let incoming_pa = 0.5 * (pressure[cell] - impedance_velocity_pa);
            self.outgoing_characteristic_mean_pa[cell] = mean_memory
                * self.outgoing_characteristic_mean_pa[cell]
                + (1.0 - mean_memory) * outgoing_pa;
            self.incoming_characteristic_mean_pa[cell] = mean_memory
                * self.incoming_characteristic_mean_pa[cell]
                + (1.0 - mean_memory) * incoming_pa;
            outgoing_pressure[cell] = outgoing_pa - self.outgoing_characteristic_mean_pa[cell];
            incoming_pressure[cell] = incoming_pa - self.incoming_characteristic_mean_pa[cell];
        }
        advance_nonlinear_characteristic(
            &mut outgoing_pressure,
            &self.cell_length_m,
            dt,
            self.parameters.nonlinear_coefficient,
            1.0,
        );
        advance_nonlinear_characteristic(
            &mut incoming_pressure,
            &self.cell_length_m,
            dt,
            self.parameters.nonlinear_coefficient,
            -1.0,
        );
        let mut particle_velocity_delta = [0.0; BORE_CELLS];
        for cell in 0..BORE_CELLS {
            let outgoing_pa = outgoing_pressure[cell] + self.outgoing_characteristic_mean_pa[cell];
            let incoming_pa = incoming_pressure[cell] + self.incoming_characteristic_mean_pa[cell];
            pressure[cell] = outgoing_pa + incoming_pa;
            let particle_velocity_m_s =
                (outgoing_pa - incoming_pa) / (AIR_DENSITY_KG_M3 * SOUND_SPEED_M_S);
            particle_velocity_delta[cell] =
                particle_velocity_m_s - previous_particle_velocity[cell];
        }
        for face in 1..BORE_CELLS {
            self.volume_flow_m3_s[face] += self.face_area_m2[face]
                * 0.5
                * (particle_velocity_delta[face - 1] + particle_velocity_delta[face]);
        }
    }

    fn state_is_finite(&self) -> bool {
        self.pressure_pa.iter().all(|value| value.is_finite())
            && self
                .pressure_wall_memory_pa
                .iter()
                .flatten()
                .all(|value| value.is_finite())
            && self
                .outgoing_characteristic_mean_pa
                .iter()
                .all(|value| value.is_finite())
            && self
                .incoming_characteristic_mean_pa
                .iter()
                .all(|value| value.is_finite())
            && self.volume_flow_m3_s.iter().all(|value| value.is_finite())
            && self
                .flow_wall_memory_m3_s
                .iter()
                .flatten()
                .all(|value| value.is_finite())
            && self.valve_position.iter().all(|value| value.is_finite())
            && self
                .valve_velocity_per_second
                .iter()
                .all(|value| value.is_finite())
            && self.cup_pressure_pa.is_finite()
            && self.previous_mouth_pressure_pa.is_finite()
            && self.previous_equilibrium_opening_m.is_finite()
            && self.lip_displacement_m.is_finite()
            && self.lip_displacement_mean_m.is_finite()
            && self.lip_oscillation_mean_m.is_finite()
            && self.lip_velocity_m_s.is_finite()
            && self.lip_acceleration_m_s2.is_finite()
            && self.lip_streamwise_displacement_m.is_finite()
            && self.lip_streamwise_velocity_m_s.is_finite()
            && self.lip_streamwise_acceleration_m_s2.is_finite()
            && self.lip_opening_pressure_pa.is_finite()
            && self.lip_jet_flow_m3_s.is_finite()
            && self.lip_jet_acceleration_m3_s2.is_finite()
            && self.lip_jet_area_m2.is_finite()
            && self.lip_jet_dissipation_w.is_finite()
            && self.throat_flow_m3_s.is_finite()
            && self.jet_noise_pressure_pa.is_finite()
            && self.jet_noise_state.is_finite()
            && self.bell_memory_flow_m3_s.is_finite()
            && self.previous_bell_flow_m3_s.is_finite()
            && self
                .directivity_lowpass_flow_acceleration_m3_s2
                .is_finite()
    }

    fn flush_denormals(&mut self) {
        for value in &mut self.pressure_pa {
            flush_denormal(value);
        }
        for memories in &mut self.pressure_wall_memory_pa {
            for value in memories {
                flush_denormal(value);
            }
        }
        for value in &mut self.outgoing_characteristic_mean_pa {
            flush_denormal(value);
        }
        for value in &mut self.incoming_characteristic_mean_pa {
            flush_denormal(value);
        }
        for value in &mut self.volume_flow_m3_s {
            flush_denormal(value);
        }
        for memories in &mut self.flow_wall_memory_m3_s {
            for value in memories {
                flush_denormal(value);
            }
        }
        let scalar_values = [
            &mut self.cup_pressure_pa,
            &mut self.lip_displacement_m,
            &mut self.lip_displacement_mean_m,
            &mut self.lip_oscillation_mean_m,
            &mut self.lip_velocity_m_s,
            &mut self.lip_acceleration_m_s2,
            &mut self.lip_streamwise_displacement_m,
            &mut self.lip_streamwise_velocity_m_s,
            &mut self.lip_streamwise_acceleration_m_s2,
            &mut self.lip_opening_pressure_pa,
            &mut self.lip_jet_flow_m3_s,
            &mut self.lip_jet_acceleration_m3_s2,
            &mut self.throat_flow_m3_s,
            &mut self.bell_memory_flow_m3_s,
            &mut self.previous_bell_flow_m3_s,
            &mut self.directivity_lowpass_flow_acceleration_m3_s2,
        ];
        for value in scalar_values {
            flush_denormal(value);
        }
    }

    /// Direct state injection is deliberately limited to a bounded diagnostic
    /// pulse. It supports passivity and impedance tests and cannot retune geometry.
    pub fn diagnostic_pressure_pulse(&mut self, pressure_pa: f64) -> Result<(), TrumpetError> {
        if !pressure_pa.is_finite() || fabs(pressure_pa) > 100.0 {
            return Err(TrumpetError::NonFiniteState);
        }
        self.pressure_pa[0] += pressure_pa;
        Ok(())
    }

    pub fn seed_open_first_regime(&mut self, peak_pressure_pa: f64) -> Result<(), TrumpetError> {
        self.seed_open_mode(1, peak_pressure_pa)
    }

    pub fn seed_open_normal_regime(&mut self, peak_pressure_pa: f64) -> Result<(), TrumpetError> {
        self.seed_open_mode(2, peak_pressure_pa)
    }

    fn seed_open_mode(
        &mut self,
        half_waves: usize,
        peak_pressure_pa: f64,
    ) -> Result<(), TrumpetError> {
        if !peak_pressure_pa.is_finite() || !(0.0..=100.0).contains(&peak_pressure_pa) {
            return Err(TrumpetError::NonFiniteState);
        }
        let total_length_m = self.effective_length_m();
        let mut position_m = 0.0;
        for cell in 0..BORE_CELLS {
            position_m += 0.5 * self.cell_length_m[cell];
            self.pressure_pa[cell] +=
                peak_pressure_pa * sin(half_waves as f64 * PI * position_m / total_length_m);
            position_m += 0.5 * self.cell_length_m[cell];
        }
        Ok(())
    }
}


#[derive(Clone, Copy)]
struct LipCandidate {
    cup_pressure_pa: f64,
    displacement_m: f64,
    velocity_m_s: f64,
    acceleration_m_s2: f64,
    streamwise_displacement_m: f64,
    streamwise_velocity_m_s: f64,
    streamwise_acceleration_m_s2: f64,
    lip_opening_pressure_pa: f64,
    jet_flow_m3_s: f64,
    jet_acceleration_m3_s2: f64,
    jet_area_m2: f64,
    jet_dissipation_w: f64,
    throat_flow_m3_s: f64,
}

#[derive(Clone, Copy)]
struct LipEvaluation {
    residual: [f64; 4],
    jacobian: [[f64; 4]; 4],
    candidate: LipCandidate,
}

#[derive(Clone, Copy)]
struct LipMechanics {
    normal_mass_kg: f64,
    streamwise_mass_kg: f64,
    normal_stiffness_n_m: f64,
    streamwise_stiffness_n_m: f64,
    cross_stiffness_n_m: f64,
    normal_damping_n_s_m: f64,
    streamwise_damping_n_s_m: f64,
    cross_damping_n_s_m: f64,
}

#[derive(Clone, Copy)]
struct LipContact {
    normal_force_n: f64,
    streamwise_force_n: f64,
    potential_energy_j: f64,
}

#[derive(Clone, Copy)]
struct LipStateSnapshot {
    previous_lip_controls: TrumpetControls,
    previous_mouth_pressure_pa: f64,
    previous_equilibrium_opening_m: f64,
    cup_pressure_pa: f64,
    lip_displacement_m: f64,
    lip_displacement_mean_m: f64,
    lip_oscillation_mean_m: f64,
    lip_velocity_m_s: f64,
    lip_acceleration_m_s2: f64,
    lip_streamwise_displacement_m: f64,
    lip_streamwise_velocity_m_s: f64,
    lip_streamwise_acceleration_m_s2: f64,
    lip_opening_pressure_pa: f64,
    lip_jet_flow_m3_s: f64,
    lip_jet_acceleration_m3_s2: f64,
    lip_jet_area_m2: f64,
    lip_jet_dissipation_w: f64,
    throat_flow_m3_s: f64,
}

#[derive(Clone, Copy)]
struct JetNoiseState {
    random_state: u64,
    low_frequency_memory: f64,
    band_limited_state: f64,
}

impl JetNoiseState {
    const fn new() -> Self {
        Self {
            random_state: 0x9e37_79b9_7f4a_7c15,
            low_frequency_memory: 0.0,
            band_limited_state: 0.0,
        }
    }

    fn advance(&mut self, high_pass_alpha: f64, low_pass_alpha: f64) -> f64 {
        let mut state = self.random_state;
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        self.random_state = state;
        let uniform = ((state >> 11) as f64) * (1.0 / 9_007_199_254_740_992.0);
        let white = 2.0 * uniform - 1.0;
        self.low_frequency_memory +=
            high_pass_alpha * (white - self.low_frequency_memory);
        let high_passed = white - self.low_frequency_memory;
        self.band_limited_state +=
            low_pass_alpha * (high_passed - self.band_limited_state);
        self.band_limited_state
    }

    fn is_finite(self) -> bool {
        self.low_frequency_memory.is_finite() && self.band_limited_state.is_finite()
    }
}

#[derive(Clone, Copy)]
struct BoreCellIntegrals {
    area_integral_m3: f64,
    left_inverse_area_integral_m_inv: f64,
    right_inverse_area_integral_m_inv: f64,
    inverse_radius_integral: f64,
}

#[derive(Clone, Copy)]
struct IntervalIntegrals {
    area_integral_m3: f64,
    inverse_area_integral_m_inv: f64,
    inverse_radius_integral: f64,
}

#[derive(Clone, Copy, Debug)]
struct Dual4 {
    value: f64,
    gradient: [f64; 4],
}

impl Dual4 {
    const fn constant(value: f64) -> Self {
        Self {
            value,
            gradient: [0.0; 4],
        }
    }

    fn variable(value: f64, index: usize) -> Self {
        let mut gradient = [0.0; 4];
        gradient[index] = 1.0;
        Self { value, gradient }
    }

    fn is_finite(self) -> bool {
        self.value.is_finite() && self.gradient.iter().all(|value| value.is_finite())
    }

    fn positive(self) -> Self {
        if self.value > 0.0 {
            self
        } else {
            Self::constant(0.0)
        }
    }

    fn abs(self) -> Self {
        if self.value > 0.0 {
            self
        } else if self.value < 0.0 {
            -self
        } else {
            Self::constant(0.0)
        }
    }

    fn sqrt(self) -> Self {
        if self.value <= 0.0 {
            return Self::constant(0.0);
        }
        let root = sqrt(self.value);
        let multiplier = 0.5 / root;
        let mut gradient = [0.0; 4];
        for index in 0..4 {
            gradient[index] = multiplier * self.gradient[index];
        }
        Self {
            value: root,
            gradient,
        }
    }

    fn square(self) -> Self {
        self * self
    }

    fn cube(self) -> Self {
        self * self * self
    }

    fn clamp(self, minimum: f64, maximum: f64) -> Self {
        if self.value <= minimum {
            Self::constant(minimum)
        } else if self.value >= maximum {
            Self::constant(maximum)
        } else {
            self
        }
    }
}

impl Add for Dual4 {
    type Output = Self;

    fn add(self, other: Self) -> Self {
        let mut gradient = [0.0; 4];
        for index in 0..4 {
            gradient[index] = self.gradient[index] + other.gradient[index];
        }
        Self {
            value: self.value + other.value,
            gradient,
        }
    }
}

impl Add<f64> for Dual4 {
    type Output = Self;

    fn add(self, other: f64) -> Self {
        Self {
            value: self.value + other,
            gradient: self.gradient,
        }
    }
}

impl Add<Dual4> for f64 {
    type Output = Dual4;

    fn add(self, other: Dual4) -> Dual4 {
        other + self
    }
}

impl Sub for Dual4 {
    type Output = Self;

    fn sub(self, other: Self) -> Self {
        let mut gradient = [0.0; 4];
        for index in 0..4 {
            gradient[index] = self.gradient[index] - other.gradient[index];
        }
        Self {
            value: self.value - other.value,
            gradient,
        }
    }
}

impl Sub<f64> for Dual4 {
    type Output = Self;

    fn sub(self, other: f64) -> Self {
        Self {
            value: self.value - other,
            gradient: self.gradient,
        }
    }
}

impl Sub<Dual4> for f64 {
    type Output = Dual4;

    fn sub(self, other: Dual4) -> Dual4 {
        Dual4::constant(self) - other
    }
}

impl Mul for Dual4 {
    type Output = Self;

    fn mul(self, other: Self) -> Self {
        let mut gradient = [0.0; 4];
        for index in 0..4 {
            gradient[index] =
                self.gradient[index] * other.value + self.value * other.gradient[index];
        }
        Self {
            value: self.value * other.value,
            gradient,
        }
    }
}

impl Mul<f64> for Dual4 {
    type Output = Self;

    fn mul(self, other: f64) -> Self {
        let mut gradient = self.gradient;
        for value in &mut gradient {
            *value *= other;
        }
        Self {
            value: self.value * other,
            gradient,
        }
    }
}

impl Mul<Dual4> for f64 {
    type Output = Dual4;

    fn mul(self, other: Dual4) -> Dual4 {
        other * self
    }
}

impl Div for Dual4 {
    type Output = Self;

    fn div(self, other: Self) -> Self {
        let inverse = 1.0 / other.value;
        let inverse_squared = inverse * inverse;
        let mut gradient = [0.0; 4];
        for index in 0..4 {
            gradient[index] = (self.gradient[index] * other.value
                - self.value * other.gradient[index])
                * inverse_squared;
        }
        Self {
            value: self.value * inverse,
            gradient,
        }
    }
}

impl Div<f64> for Dual4 {
    type Output = Self;

    fn div(self, other: f64) -> Self {
        self * (1.0 / other)
    }
}

impl Div<Dual4> for f64 {
    type Output = Dual4;

    fn div(self, other: Dual4) -> Dual4 {
        Dual4::constant(self) / other
    }
}

impl Neg for Dual4 {
    type Output = Self;

    fn neg(self) -> Self {
        let mut gradient = self.gradient;
        for value in &mut gradient {
            *value = -*value;
        }
        Self {
            value: -self.value,
            gradient,
        }
    }
}

#[derive(Clone, Copy)]
struct DualLipContact {
    normal_force_n: Dual4,
    streamwise_force_n: Dual4,
}

#[derive(Clone, Copy)]
struct DualLipPressurePort {
    normal_force_n: Dual4,
    streamwise_force_n: Dual4,
    swept_flow_m3_s: Dual4,
}

#[derive(Clone, Copy)]
struct DualJetBalance {
    flow_acceleration_m3_s2: Dual4,
    flow_residual_m3_s: Dual4,
    lip_opening_pressure_pa: Dual4,
    dissipation_w: Dual4,
}

#[derive(Clone, Copy)]
struct ComplexValue {
    real: f64,
    imaginary: f64,
}

impl LipSolveReport {
    const ZERO: Self = Self {
        newton_iterations: 0,
        residual_evaluations: 0,
        line_search_evaluations: 0,
        bracket_evaluations: 0,
        fallback_bisections: 0,
    };

    fn accumulate(&mut self, other: Self) {
        self.newton_iterations = self
            .newton_iterations
            .saturating_add(other.newton_iterations);
        self.residual_evaluations = self
            .residual_evaluations
            .saturating_add(other.residual_evaluations);
        self.line_search_evaluations = self
            .line_search_evaluations
            .saturating_add(other.line_search_evaluations);
        self.bracket_evaluations = self
            .bracket_evaluations
            .saturating_add(other.bracket_evaluations);
    }
}

fn resting_trumpet_controls() -> TrumpetControls {
    TrumpetControls {
        mouth_pressure_pa: 0.0,
        lip_resonance_hz: 300.0,
        lip_damping_ratio: 0.08,
        equilibrium_opening_m: 0.0,
        tongue_contact: 0.0,
        valves: [0.0; 3],
    }
}

fn lip_discharge_coefficient(geometric_area_m2: f64) -> f64 {
    let ratio = (geometric_area_m2 / MOUTHPIECE_CUP_ENTRY_AREA_M2).max(0.0);
    (LIP_DISCHARGE_BASE + LIP_DISCHARGE_AREA_GAIN * sqrt(ratio)).clamp(0.55, 0.86)
}

fn smooth_toward_with_memory(current: f64, target: f64, memory: f64) -> f64 {
    memory * current + (1.0 - memory) * target
}

fn smoothstep(value: f64) -> f64 {
    let x = value.clamp(0.0, 1.0);
    x * x * (3.0 - 2.0 * x)
}

fn interpolate_controls(
    beginning: TrumpetControls,
    ending: TrumpetControls,
    fraction: f64,
) -> TrumpetControls {
    let t = fraction.clamp(0.0, 1.0);
    let interpolate = |left: f64, right: f64| left + t * (right - left);
    TrumpetControls {
        mouth_pressure_pa: interpolate(beginning.mouth_pressure_pa, ending.mouth_pressure_pa),
        lip_resonance_hz: interpolate(beginning.lip_resonance_hz, ending.lip_resonance_hz),
        lip_damping_ratio: interpolate(beginning.lip_damping_ratio, ending.lip_damping_ratio),
        equilibrium_opening_m: interpolate(
            beginning.equilibrium_opening_m,
            ending.equilibrium_opening_m,
        ),
        tongue_contact: interpolate(beginning.tongue_contact, ending.tongue_contact),
        valves: ending.valves,
    }
}

fn nearest_face_index(position_m: f64) -> usize {
    let scaled = position_m / OPEN_LENGTH_M * BORE_CELLS as f64;
    floor(scaled + 0.5).clamp(1.0, (BORE_CELLS - 1) as f64) as usize
}

fn bore_cell_integrals(left_m: f64, middle_m: f64, right_m: f64) -> BoreCellIntegrals {
    let left = bore_interval_integrals(left_m, middle_m);
    let right = bore_interval_integrals(middle_m, right_m);
    BoreCellIntegrals {
        area_integral_m3: left.area_integral_m3 + right.area_integral_m3,
        left_inverse_area_integral_m_inv: left.inverse_area_integral_m_inv,
        right_inverse_area_integral_m_inv: right.inverse_area_integral_m_inv,
        inverse_radius_integral: left.inverse_radius_integral + right.inverse_radius_integral,
    }
}

fn bore_interval_integrals(begin_m: f64, end_m: f64) -> IntervalIntegrals {
    let mut result = IntervalIntegrals {
        area_integral_m3: 0.0,
        inverse_area_integral_m_inv: 0.0,
        inverse_radius_integral: 0.0,
    };
    let mut segment_begin_m = 0.0;
    let mut segment_begin_radius_m = MOUTHPIECE_BACKBORE_ENTRY_RADIUS_M;
    for station in BORE_STATIONS_M {
        let segment_end_m = station[0];
        let segment_end_radius_m = station[1];
        let overlap_begin_m = begin_m.max(segment_begin_m);
        let overlap_end_m = end_m.min(segment_end_m);
        if overlap_end_m > overlap_begin_m {
            let segment_length_m = segment_end_m - segment_begin_m;
            let begin_fraction = (overlap_begin_m - segment_begin_m) / segment_length_m;
            let end_fraction = (overlap_end_m - segment_begin_m) / segment_length_m;
            let radius_begin_m = segment_begin_radius_m
                + begin_fraction * (segment_end_radius_m - segment_begin_radius_m);
            let radius_end_m = segment_begin_radius_m
                + end_fraction * (segment_end_radius_m - segment_begin_radius_m);
            let length_m = overlap_end_m - overlap_begin_m;
            result.area_integral_m3 += PI
                * length_m
                * (radius_begin_m * radius_begin_m
                    + radius_begin_m * radius_end_m
                    + radius_end_m * radius_end_m)
                / 3.0;
            result.inverse_area_integral_m_inv +=
                length_m / (PI * radius_begin_m * radius_end_m);
            if fabs(radius_end_m - radius_begin_m) <= 1.0e-14 {
                result.inverse_radius_integral += length_m / radius_begin_m;
            } else {
                result.inverse_radius_integral += length_m
                    * log(radius_end_m / radius_begin_m)
                    / (radius_end_m - radius_begin_m);
            }
        }
        if segment_end_m >= end_m {
            break;
        }
        segment_begin_m = segment_end_m;
        segment_begin_radius_m = segment_end_radius_m;
    }
    result
}

fn dual_contact_force(
    stiffness_n_m32: f64,
    damping_n_s_m32: f64,
    penetration_m: Dual4,
    penetration_velocity_m_s: Dual4,
) -> Dual4 {
    let penetration = penetration_m.positive();
    let closing_velocity = penetration_velocity_m_s.positive();
    let root_penetration = penetration.sqrt();
    stiffness_n_m32 * penetration * root_penetration
        + damping_n_s_m32 * root_penetration * closing_velocity
}

fn dual_lip_contact(
    controls: TrumpetControls,
    parameters: TrumpetParameters,
    mechanics: LipMechanics,
    normal_displacement_m: Dual4,
    streamwise_displacement_m: Dual4,
    normal_velocity_m_s: Dual4,
    streamwise_velocity_m_s: Dual4,
) -> DualLipContact {
    let aperture_m = controls.equilibrium_opening_m + 2.0 * normal_displacement_m;
    let aperture_velocity_m_s = 2.0 * normal_velocity_m_s;
    let effective_mass_kg = mechanics.normal_mass_kg / 4.0;
    let normal_stiffness_n_m32 = LIP_CONTACT_STIFFNESS_RATIO
        * mechanics.normal_stiffness_n_m
        / sqrt(LIP_CONTACT_SCALE_M);
    let normal_damping_n_s_m32 = 2.0
        * LIP_CONTACT_DAMPING_RATIO
        * sqrt(effective_mass_kg * mechanics.normal_stiffness_n_m)
        / sqrt(LIP_CONTACT_SCALE_M);
    let lower_force_n = dual_contact_force(
        normal_stiffness_n_m32,
        normal_damping_n_s_m32,
        -aperture_m,
        -aperture_velocity_m_s,
    );
    let upper_force_n = dual_contact_force(
        normal_stiffness_n_m32,
        normal_damping_n_s_m32,
        aperture_m - parameters.maximum_lip_opening_m,
        aperture_velocity_m_s,
    );
    let streamwise_stiffness_n_m32 = LIP_CONTACT_STIFFNESS_RATIO
        * mechanics.streamwise_stiffness_n_m
        / sqrt(LIP_CONTACT_SCALE_M);
    let streamwise_damping_n_s_m32 = 2.0
        * LIP_CONTACT_DAMPING_RATIO
        * sqrt(mechanics.streamwise_mass_kg * mechanics.streamwise_stiffness_n_m)
        / sqrt(LIP_CONTACT_SCALE_M);
    let streamwise_rest_position_m = parameters.lip_effective_area_m2 / parameters.lip_width_m;
    let streamwise_lower_force_n = dual_contact_force(
        streamwise_stiffness_n_m32,
        streamwise_damping_n_s_m32,
        -streamwise_rest_position_m - streamwise_displacement_m,
        -streamwise_velocity_m_s,
    );
    let streamwise_upper_force_n = dual_contact_force(
        streamwise_stiffness_n_m32,
        streamwise_damping_n_s_m32,
        streamwise_displacement_m - LIP_MAX_STREAMWISE_DISPLACEMENT_M,
        streamwise_velocity_m_s,
    );
    DualLipContact {
        normal_force_n: 2.0 * (lower_force_n - upper_force_n),
        streamwise_force_n: streamwise_lower_force_n - streamwise_upper_force_n,
    }
}

fn dual_lip_pressure_port(
    normal_equilibrium_area_m2: f64,
    lip_width_m: f64,
    equilibrium_opening_m: f64,
    normal_displacement_m: Dual4,
    streamwise_displacement_m: Dual4,
    normal_velocity_m_s: Dual4,
    streamwise_velocity_m_s: Dual4,
    mouth_pressure_pa: f64,
    cup_pressure_pa: Dual4,
    lip_opening_pressure_pa: Dual4,
) -> DualLipPressurePort {
    let streamwise_rest_position_m = normal_equilibrium_area_m2 / lip_width_m;
    let streamwise_tip_position_m =
        (streamwise_rest_position_m + streamwise_displacement_m).positive();
    let normal_tip_position_m = 0.5 * equilibrium_opening_m + normal_displacement_m;
    let normal_area_m2 = lip_width_m * streamwise_tip_position_m;
    let streamwise_area_m2 =
        lip_width_m * (LIP_JOINT_NORMAL_POSITION_M - normal_tip_position_m).positive();
    let pressure_difference_pa = mouth_pressure_pa - cup_pressure_pa;
    let bernoulli_normal_force_n = lip_width_m * LIP_THICKNESS_M * lip_opening_pressure_pa;
    DualLipPressurePort {
        normal_force_n: normal_area_m2 * pressure_difference_pa + bernoulli_normal_force_n,
        streamwise_force_n: streamwise_area_m2 * pressure_difference_pa,
        swept_flow_m3_s: normal_area_m2 * normal_velocity_m_s
            + streamwise_area_m2 * streamwise_velocity_m_s,
    }
}

fn dual_adachi_lip_jet_balance(
    geometric_area_m2: Dual4,
    channel_length_m: Dual4,
    lip_width_m: f64,
    old_flow_m3_s: f64,
    old_flow_acceleration_m3_s2: f64,
    candidate_flow_m3_s: Dual4,
    mouth_pressure_pa: f64,
    cup_pressure_pa: Dual4,
    step_seconds: f64,
) -> DualJetBalance {
    if geometric_area_m2.value <= 1.0e-12 {
        return DualJetBalance {
            flow_acceleration_m3_s2: Dual4::constant(0.0),
            flow_residual_m3_s: candidate_flow_m3_s,
            lip_opening_pressure_pa: cup_pressure_pa,
            dissipation_w: Dual4::constant(0.0),
        };
    }
    let area_ratio = geometric_area_m2 / MOUTHPIECE_CUP_ENTRY_AREA_M2;
    let discharge = (LIP_DISCHARGE_BASE + LIP_DISCHARGE_AREA_GAIN * area_ratio.sqrt())
        .clamp(0.55, 0.86);
    let effective_area_m2 = geometric_area_m2 * discharge;
    let inertance_pa_s2_m3 = AIR_DENSITY_KG_M3 * channel_length_m / effective_area_m2;
    let signed_flow_squared = candidate_flow_m3_s * candidate_flow_m3_s.abs();
    let contraction_pressure_drop_pa = 0.5
        * AIR_DENSITY_KG_M3
        * signed_flow_squared
        / effective_area_m2.square();
    let inverse_effective_area =
        1.0 / effective_area_m2 - 1.0 / MOUTHPIECE_CUP_ENTRY_AREA_M2;
    let quadratic_pressure_drop_pa = 0.5
        * AIR_DENSITY_KG_M3
        * signed_flow_squared
        * inverse_effective_area.square();
    let effective_gap_m = geometric_area_m2 / lip_width_m;
    let regularized_gap_m =
        (effective_gap_m.square() + LIP_MINIMUM_HYDRAULIC_GAP_M.powi(2)).sqrt();
    let viscous_resistance_pa_s_m3 = 12.0
        * AIR_DYNAMIC_VISCOSITY_PA_S
        * LIP_VISCOUS_EFFECTIVE_LENGTH_M
        / (lip_width_m * regularized_gap_m.cube());
    let viscous_pressure_drop_pa = viscous_resistance_pa_s_m3 * candidate_flow_m3_s;
    let total_resistive_pressure_drop_pa =
        quadratic_pressure_drop_pa + viscous_pressure_drop_pa;
    let flow_acceleration_m3_s2 =
        (mouth_pressure_pa - cup_pressure_pa - total_resistive_pressure_drop_pa)
            / inertance_pa_s2_m3;
    let flow_residual_m3_s = candidate_flow_m3_s
        - old_flow_m3_s
        - 0.5 * step_seconds * (old_flow_acceleration_m3_s2 + flow_acceleration_m3_s2);
    let lip_opening_pressure_pa = mouth_pressure_pa
        - inertance_pa_s2_m3 * flow_acceleration_m3_s2
        - contraction_pressure_drop_pa
        - 0.5 * viscous_pressure_drop_pa;
    DualJetBalance {
        flow_acceleration_m3_s2,
        flow_residual_m3_s,
        lip_opening_pressure_pa,
        dissipation_w: total_resistive_pressure_drop_pa * candidate_flow_m3_s,
    }
}

fn solve_dual_quadratic_drag(
    right_hand_side: Dual4,
    linear_coefficient: f64,
    quadratic_coefficient: f64,
) -> Dual4 {
    if quadratic_coefficient <= 0.0 {
        return right_hand_side / linear_coefficient;
    }
    let root = (linear_coefficient * linear_coefficient
        + 4.0 * quadratic_coefficient * right_hand_side.abs())
    .sqrt();
    2.0 * right_hand_side / (linear_coefficient + root)
}

fn project_lip_state(
    mut state: [f64; 4],
    controls: TrumpetControls,
    maximum_opening_m: f64,
    streamwise_rest_m: f64,
) -> [f64; 4] {
    state[0] = state[0].clamp(
        -LIP_MAX_ABS_CUP_PRESSURE_PA / LIP_SOLVE_PRESSURE_SCALE_PA,
        LIP_MAX_ABS_CUP_PRESSURE_PA / LIP_SOLVE_PRESSURE_SCALE_PA,
    );
    let lower_normal_m = -0.5 * controls.equilibrium_opening_m - 0.5 * LIP_CONTACT_SCALE_M;
    let upper_normal_m =
        0.5 * (maximum_opening_m - controls.equilibrium_opening_m) + 0.5 * LIP_CONTACT_SCALE_M;
    state[1] = state[1].clamp(
        lower_normal_m / LIP_SOLVE_DISPLACEMENT_SCALE_M,
        upper_normal_m / LIP_SOLVE_DISPLACEMENT_SCALE_M,
    );
    state[2] = state[2].clamp(
        (-streamwise_rest_m - 0.5 * LIP_CONTACT_SCALE_M) / LIP_SOLVE_DISPLACEMENT_SCALE_M,
        (LIP_MAX_STREAMWISE_DISPLACEMENT_M + 0.5 * LIP_CONTACT_SCALE_M)
            / LIP_SOLVE_DISPLACEMENT_SCALE_M,
    );
    state[3] = state[3].clamp(
        -LIP_MAX_ABS_JET_FLOW_M3_S / LIP_SOLVE_FLOW_SCALE_M3_S,
        LIP_MAX_ABS_JET_FLOW_M3_S / LIP_SOLVE_FLOW_SCALE_M3_S,
    );
    state
}

fn residual_merit(residual: [f64; 4]) -> f64 {
    0.5 * residual.into_iter().map(|value| value * value).sum::<f64>()
}

fn regularized_newton_direction(
    jacobian: [[f64; 4]; 4],
    residual: [f64; 4],
) -> Option<([f64; 4], usize)> {
    let right_hand_side = [-residual[0], -residual[1], -residual[2], -residual[3]];
    if let Some(solution) = solve_four_by_four(jacobian, right_hand_side) {
        return Some((solution, 0));
    }
    let mut normal_matrix = [[0.0; 4]; 4];
    let mut normal_rhs = [0.0; 4];
    for row in 0..4 {
        for column in 0..4 {
            normal_rhs[column] -= jacobian[row][column] * residual[row];
            for other in 0..4 {
                normal_matrix[column][other] += jacobian[row][column] * jacobian[row][other];
            }
        }
    }
    let regularizations = [1.0e-10, 1.0e-8, 1.0e-6, 1.0e-4, 1.0e-2];
    for (index, lambda) in regularizations.into_iter().enumerate() {
        let mut regularized = normal_matrix;
        for diagonal in 0..4 {
            regularized[diagonal][diagonal] +=
                lambda * (1.0 + normal_matrix[diagonal][diagonal]);
        }
        if let Some(solution) = solve_four_by_four(regularized, normal_rhs) {
            return Some((solution, index + 1));
        }
    }
    None
}

fn solve_four_by_four(mut matrix: [[f64; 4]; 4], mut rhs: [f64; 4]) -> Option<[f64; 4]> {
    let mut row_scale = [0.0; 4];
    for row in 0..4 {
        row_scale[row] = matrix[row]
            .iter()
            .copied()
            .map(fabs)
            .fold(0.0, f64::max);
        if !row_scale[row].is_finite() || row_scale[row] <= 0.0 || !rhs[row].is_finite() {
            return None;
        }
    }
    for column in 0..4 {
        let mut pivot_row = column;
        let mut pivot_ratio = fabs(matrix[column][column]) / row_scale[column];
        for row in column + 1..4 {
            let ratio = fabs(matrix[row][column]) / row_scale[row];
            if ratio > pivot_ratio {
                pivot_ratio = ratio;
                pivot_row = row;
            }
        }
        if !pivot_ratio.is_finite() || pivot_ratio <= 1.0e-13 {
            return None;
        }
        matrix.swap(column, pivot_row);
        rhs.swap(column, pivot_row);
        row_scale.swap(column, pivot_row);
        let pivot = matrix[column][column];
        for row in column + 1..4 {
            let factor = matrix[row][column] / pivot;
            matrix[row][column] = 0.0;
            for entry in column + 1..4 {
                matrix[row][entry] -= factor * matrix[column][entry];
            }
            rhs[row] -= factor * rhs[column];
        }
    }
    let mut solution = [0.0; 4];
    for row in (0..4).rev() {
        let mut value = rhs[row];
        for column in row + 1..4 {
            value -= matrix[row][column] * solution[column];
        }
        solution[row] = value / matrix[row][row];
    }
    solution
        .iter()
        .all(|value| value.is_finite())
        .then_some(solution)
}

fn solve_backward_quadratic_drag(right_hand_side: f64, coefficient: f64) -> f64 {
    if coefficient <= 0.0 {
        return right_hand_side;
    }
    2.0 * right_hand_side / (1.0 + sqrt(1.0 + 4.0 * coefficient * fabs(right_hand_side)))
}

fn discrete_wall_loss_coefficients(
    strengths_per_second: [f64; WALL_LOSS_POLES],
    pole_denominator_inverse: [f64; WALL_LOSS_POLES],
    step_seconds: f64,
) -> (f64, [f64; WALL_LOSS_POLES]) {
    let mut effective_strength = [0.0; WALL_LOSS_POLES];
    let mut aggregate_strength = 0.0;
    for pole in 0..WALL_LOSS_POLES {
        effective_strength[pole] =
            strengths_per_second[pole] * pole_denominator_inverse[pole];
        aggregate_strength += effective_strength[pole];
    }
    let denominator_inverse = 1.0 / (1.0 + 0.5 * step_seconds * aggregate_strength);
    let coordinate_decay =
        (1.0 - 0.5 * step_seconds * aggregate_strength) * denominator_inverse;
    let mut memory_drive = [0.0; WALL_LOSS_POLES];
    for pole in 0..WALL_LOSS_POLES {
        memory_drive[pole] = step_seconds * effective_strength[pole] * denominator_inverse;
    }
    (coordinate_decay, memory_drive)
}

fn apply_coupled_wall_loss_step(
    coordinate: &mut f64,
    memory: &mut [f64; WALL_LOSS_POLES],
    coordinate_decay: f64,
    memory_drive: [f64; WALL_LOSS_POLES],
    pole_state_multiplier: [f64; WALL_LOSS_POLES],
    pole_coordinate_multiplier: [f64; WALL_LOSS_POLES],
) {
    let old_coordinate = *coordinate;
    let mut new_coordinate = coordinate_decay * old_coordinate;
    for pole in 0..WALL_LOSS_POLES {
        new_coordinate += memory_drive[pole] * memory[pole];
    }
    let coordinate_sum = old_coordinate + new_coordinate;
    for pole in 0..WALL_LOSS_POLES {
        memory[pole] = pole_state_multiplier[pole] * memory[pole]
            + pole_coordinate_multiplier[pole] * coordinate_sum;
    }
    *coordinate = new_coordinate;
}

impl ComplexValue {
    fn add(self, other: Self) -> Self {
        Self {
            real: self.real + other.real,
            imaginary: self.imaginary + other.imaginary,
        }
    }

    fn scale(self, factor: f64) -> Self {
        Self {
            real: factor * self.real,
            imaginary: factor * self.imaginary,
        }
    }

    fn multiply(self, other: Self) -> Self {
        Self {
            real: self.real * other.real - self.imaginary * other.imaginary,
            imaginary: self.real * other.imaginary + self.imaginary * other.real,
        }
    }

    fn magnitude(self) -> f64 {
        sqrt(self.real * self.real + self.imaginary * self.imaginary)
    }

    fn reciprocal(self) -> Result<Self, TrumpetError> {
        let denominator = self.real * self.real + self.imaginary * self.imaginary;
        if !denominator.is_finite() || denominator <= 0.0 {
            return Err(TrumpetError::NonFiniteState);
        }
        Ok(Self {
            real: self.real / denominator,
            imaginary: -self.imaginary / denominator,
        })
    }

    fn divide(self, denominator: Self) -> Result<Self, TrumpetError> {
        let norm =
            denominator.real * denominator.real + denominator.imaginary * denominator.imaginary;
        if !norm.is_finite() || norm <= 0.0 {
            return Err(TrumpetError::NonFiniteState);
        }
        Ok(Self {
            real: (self.real * denominator.real + self.imaginary * denominator.imaginary) / norm,
            imaginary: (self.imaginary * denominator.real - self.real * denominator.imaginary)
                / norm,
        })
    }
}

fn max_abs_four(values: [f64; 4]) -> f64 {
    values.into_iter().map(fabs).fold(0.0, f64::max)
}

fn bore_radius_m(position_m: f64) -> f64 {
    let mut previous_position_m = 0.0;
    let mut previous_radius_m = MOUTHPIECE_BACKBORE_ENTRY_RADIUS_M;
    for station in BORE_STATIONS_M {
        if position_m <= station[0] {
            let span_m = (station[0] - previous_position_m).max(1.0e-12);
            let fraction = (position_m - previous_position_m) / span_m;
            return previous_radius_m + fraction * (station[1] - previous_radius_m);
        }
        previous_position_m = station[0];
        previous_radius_m = station[1];
    }
    BORE_STATIONS_M[BORE_STATIONS_M.len() - 1][1]
}

fn harmonic_mean(left: f64, right: f64) -> f64 {
    2.0 * left * right / (left + right)
}

fn monotonized_central(left: f64, right: f64) -> f64 {
    if left * right <= 0.0 {
        return 0.0;
    }
    let central = 0.5 * (left + right);
    let same_sign_bound = 2.0 * if fabs(left) < fabs(right) { left } else { right };
    if fabs(central) < fabs(same_sign_bound) {
        central
    } else {
        same_sign_bound
    }
}

fn advance_nonlinear_characteristic(
    state: &mut [f64; BORE_CELLS],
    cell_length_m: &[f64; BORE_CELLS],
    dt: f64,
    beta: f64,
    direction: f64,
) {
    let before = *state;
    let first = nonlinear_characteristic_euler(&before, cell_length_m, dt, beta, direction);
    let second = nonlinear_characteristic_euler(&first, cell_length_m, dt, beta, direction);
    for cell in 0..BORE_CELLS {
        state[cell] = 0.5 * (before[cell] + second[cell]);
    }
}

fn nonlinear_characteristic_euler(
    state: &[f64; BORE_CELLS],
    cell_length_m: &[f64; BORE_CELLS],
    dt: f64,
    beta: f64,
    direction: f64,
) -> [f64; BORE_CELLS] {
    let positive_coefficient = beta / (2.0 * AIR_DENSITY_KG_M3 * SOUND_SPEED_M_S);
    let mut slopes = [0.0; BORE_CELLS];
    for cell in 1..BORE_CELLS - 1 {
        slopes[cell] = monotonized_central(
            state[cell] - state[cell - 1],
            state[cell + 1] - state[cell],
        );
    }
    let positive_flux = |value: f64| positive_coefficient * value * value;
    let godunov_flux = |left: f64, right: f64| {
        let oriented_left = direction * left;
        let oriented_right = direction * right;
        let flux = if oriented_left <= oriented_right {
            if oriented_left >= 0.0 {
                positive_flux(oriented_left)
            } else if oriented_right <= 0.0 {
                positive_flux(oriented_right)
            } else {
                0.0
            }
        } else if oriented_left + oriented_right >= 0.0 {
            positive_flux(oriented_left)
        } else {
            positive_flux(oriented_right)
        };
        direction * flux
    };
    let mut flux = [0.0; BORE_CELLS + 1];
    flux[0] = direction * positive_flux(direction * state[0]);
    flux[BORE_CELLS] = direction * positive_flux(direction * state[BORE_CELLS - 1]);
    for face in 1..BORE_CELLS {
        let left = state[face - 1] + 0.5 * slopes[face - 1];
        let right = state[face] - 0.5 * slopes[face];
        flux[face] = godunov_flux(left, right);
    }
    let mut advanced = *state;
    for cell in 0..BORE_CELLS {
        advanced[cell] =
            state[cell] - dt / cell_length_m[cell] * (flux[cell + 1] - flux[cell]);
    }
    advanced
}

fn flush_denormal(value: &mut f64) {
    if fabs(*value) < DENORMAL_CUTOFF {
        *value = 0.0;
    }
}
