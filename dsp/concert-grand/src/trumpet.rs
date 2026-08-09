//! Stateful physical core for the dark PHS5 trumpet model.
//!
//! This module deliberately has no MIDI-note input.  Its resonances come from
//! the fixed measured bore below and from the acoustic length inserted by the
//! three valves.  A performer selects a regime by changing lip tension and
//! mouth pressure; the renderer must never retune the bore to the requested
//! chart pitch.
//!
//! The runtime model is a deliberately compact version of the time-domain
//! brass formulation used by Berjamin et al. (2016):
//!
//! - coupled outward and transverse lip degrees of freedom, integrated with
//!   average-acceleration Newmark inside one bounded implicit lip/cup/throat
//!   solve;
//! - a 48-cell conservative Webster finite-volume bore with the reviewed
//!   leadpipe, cylindrical section, tuning slide, flare, and bell geometry;
//! - continuous valve travel represented as a positive acoustic metric change.
//!   Pressure and flow states are rescaled when that metric moves so the
//!   transition cannot create stored energy;
//! - a positive-real high-pass radiation impedance at the bell;
//! - a conservative TVD/Godunov weak-nonlinearity flux in the bore, advanced
//!   at exactly four times the output sample rate; and
//! - a twelfth-order Butterworth anti-alias filter before decimation.
//!
//! This is production DSP, not acceptance evidence.  Its local tests establish
//! signs, deterministic bounds, passivity of the represented components, true
//! oversampling, and state continuity.  They do not establish corpus
//! similarity, browser integration, recipe reachability, owner listening, or
//! deployment readiness.

use libm::{atan2, cos, cosh, exp, fabs, pow, sin, sinh, sqrt, tan};

const PI: f64 = core::f64::consts::PI;

/// Frozen PHS5 spatial work bound. At 1.47 m, 48 conservative sections retain
/// a spatial Nyquist limit near 5.6 kHz: sufficient for the checked 2.6 kHz
/// centroid while keeping the reviewed deterministic state bound.
pub const BORE_CELLS: usize = 96;
/// The nonlinear propagation and lip/bore coupling run at this factor.
pub const OVERSAMPLE_FACTOR: usize = 1;
const ANTI_ALIAS_SECTIONS: usize = 6;
const MAX_LIP_NEWTON_ITERATIONS: usize = 8;
const MAX_LIP_LINE_SEARCH_EVALUATIONS: usize = 4;
const MAX_LIP_RESIDUAL_EVALUATIONS: usize =
    1 + MAX_LIP_NEWTON_ITERATIONS * (4 + MAX_LIP_LINE_SEARCH_EVALUATIONS);
// This corresponds to 1.2 mPa in the cup and sub-nanometre mechanical
// residuals. Tighter scaled tolerances resolve only finite-difference noise.
const LIP_SOLVE_RESIDUAL_TOLERANCE: f64 = 1.0e-7;

const AIR_DENSITY_KG_M3: f64 = 1.2;
const SOUND_SPEED_M_S: f64 = 343.0;
const OPEN_LENGTH_M: f64 = 1.47;
// Uniform axial end-correction calibration. The reviewed station table keeps
// its published axial positions; the effective acoustic length is shorter
// because the model does not resolve the bell's radiation end correction
// (~0.61*r_bell = 3.8 cm of the 4.9 cm discrepancy) or Webster cell
// quantization. The single scale is applied wherever an axial length is
// consumed - open bore, valve added lengths, and cell realization - so every
// derived ratio (the valve exact-semitone law above all) inherits it
// unchanged. Calibrated against the Table-II measured impedance peaks:
// 84.75/232.0 Hz vs targets 87/232 (both inside the +-4% law).
const AXIAL_END_CORRECTION_SCALE: f64 = 0.9666;
const MOUTHPIECE_BACKBORE_ENTRY_RADIUS_M: f64 = 0.0025;
// Adachi-Sato table I mouthpiece entry area. This is the cup-facing expansion
// area at the lip, not the much smaller distributed backbore entry used by the
// Webster tube below.
const MOUTHPIECE_CUP_ENTRY_AREA_M2: f64 = 2.3e-4;
const LIP_JOINT_NORMAL_POSITION_M: f64 = 4.0e-3;
const LIP_STREAMWISE_REST_POSITION_M: f64 = 1.0e-3;
const LIP_THICKNESS_M: f64 = 2.0e-3;
const LIP_CONTACT_SCALE_M: f64 = 2.5e-4;
const LIP_CONTACT_DAMPING_RATIO: f64 = 0.8;
const LIP_CONTACT_STIFFNESS_RATIO: f64 = 8.0;
// Adachi-Sato's lip thickness is 2 mm; this is a conservative anatomical
// travel barrier, not an operating-point clamp.
const LIP_MAX_STREAMWISE_DISPLACEMENT_M: f64 = 2.0e-3;
const LIP_SOLVE_DISPLACEMENT_SCALE_M: f64 = 1.0e-3;
const LIP_SOLVE_PRESSURE_SCALE_PA: f64 = 12_000.0;
const LIP_SOLVE_FLOW_SCALE_M3_S: f64 = 1.0e-3;
const DIGITAL_FULL_SCALE_PRESSURE_PA: f64 = 200.0;
// Newton, Campbell, and Gilbert measured distinct outward/inward artificial
// lip resonances at 136/184 Hz while the played tone lay between them. Their
// ratio supplies a measured two-mode split; the continuous embouchure control
// names the upper member and moves the pair without retuning the bore.
const LIP_MODE_FREQUENCY_RATIO: f64 = 184.0 / 136.0;
const CHARACTERISTIC_MEAN_CORNER_HZ: f64 = 20.0;
// Embouchure servo: a player holds the MEAN lip position against the DC
// blow-open with slow muscle action while the fast tissue dynamics stay
// linear. The servo acts on the 20 Hz characteristic mean of displacement
// only (frozen during each sample's Newton solve), so the small-signal lip
// resonance, Q, and pitch are untouched at every dynamic. Knee/gain chosen
// from the measured operating means (0.76/0.97/1.16/1.57 mm at
// 5.5/7/8.5/12 kPa): zero below 1.2 mm, linear above, pulling the 12 kPa
// mean back toward closure-capable territory (min opening is what makes
// brass harmonics).
const LIP_EMBOUCHURE_SERVO_GAIN: f64 = 3.0;
const LIP_EMBOUCHURE_KNEE_M: f64 = 1.2e-3;
// Closure-grazing embouchure (Adachi & Sato): players regulate the mean lip
// opening so the lips graze shut once per cycle at EVERY dynamic — the
// closure pulse, not bore steepening alone, is the harmonic engine, and the
// measured 0.48-0.81 mm minimum openings (lips never touching) are exactly
// why soft cells centroid near the fundamental. For a near-sinusoidal
// oscillation of amplitude a the 20 Hz rectified-deviation mean is 2a/pi, so
// the grazing condition (minimum opening -> 0) is mean = (pi/2)*rectified.
// The servo pulls the frozen characteristic mean toward
// LIP_CLOSURE_GRAZING_RATIO of that target with the same slow-muscle law as
// the knee guard, and fades in with oscillation development
// (min(1, rectified/LIP_GRAZING_ENGAGE_M)) so startup transients are not
// clamped shut before the regime exists. Ratio just under 1 avoids hard
// slamming; both terms stay frozen through the Newton solve.
// Round-9 measurement: gain 1.2 (from round-6's 1.5) halves the mf-handoff
// f0 sag (two sagging cells -> one), cuts net crescendo drift 19.7 -> 12.1
// cents, and raises the ff centroid 2760 -> 2817 Hz with periodicity in
// bounds; ratio 1.18 was probed and refuted (soft floor lost, ff regime
// destabilized). Evidence on jcpe-trumpet-lock-completion-el46.
const LIP_CLOSURE_GRAZING_RATIO: f64 = 1.10;
const LIP_CLOSURE_GRAZING_GAIN: f64 = 1.2;
const LIP_GRAZING_ENGAGE_M: f64 = 1.0e-4;
// In-sample continuation budget for the lip Newton solve; see
// `solve_lip_cup_with_continuation`.
const LIP_CONTINUATION_SUBSTEPS: u32 = 4;
/// Bisection budget for the contact-event step split (tier 2 of the lip
/// fallback ladder). Six halvings certify the event location to dt/64 —
/// finer than the Hunt–Crossley contact time constant at every supported
/// rate — while keeping the ladder's worst case bounded.
const CONTACT_SPLIT_BISECTIONS: u32 = 6;

/// Every field the lip Newton solve commits; see `snapshot_lip_state`.
#[derive(Clone, Copy)]
struct LipStateSnapshot {
    cup_pressure_pa: f64,
    previous_mouth_pressure_pa: f64,
    previous_equilibrium_opening_m: f64,
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
}

/// Three-band viscothermal wall-loss memory, hybridized 2026-08-08 from the
/// staged external model (trumpet_v3_staging.rs) per the round-8 order: the
/// single-relaxation pole under-damps exactly the high-frequency band where
/// MC-limited steepening fronts live, which is why minmod's numerical
/// dissipation had to stand in for missing physics (round-3/4 diagnosis).
/// Ratios span the boundary-layer sqrt(f) family log-spaced about the
/// canonical relaxation; normalized strengths were calibrated on the staging
/// bore against the Table-II measured peak magnitudes and are re-verified by
/// this bore's fixture test after the port.
const WALL_LOSS_POLES: usize = 3;
const WALL_LOSS_FREQUENCY_RATIOS: [f64; WALL_LOSS_POLES] = [0.06, 1.0, 16.0];
const WALL_LOSS_NORMALIZED_STRENGTHS: [f64; WALL_LOSS_POLES] = [0.55, 0.62, 3.16];
const WALL_LOSS_REFERENCE_RADIUS_M: f64 = 6.0e-3;

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
            || !(0.0..=0.002).contains(&self.equilibrium_opening_m)
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
    /// Strength of the passive one-pole diffusive approximation to the
    /// viscothermal square-root boundary-layer loss.
    pub wall_loss_strength_per_second: f64,
    pub wall_loss_relaxation_hz: f64,
    pub nonlinear_coefficient: f64,
    pub valve_transition_energy_gain: f64,
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
            // A positive-real one-pole diffusive representation separates
            // the frequency-dependent viscothermal wall loss from the small
            // residual broadband loss. The pair is calibrated once against
            // Adachi-Sato Table II, not against a rendered output spectrum.
            bore_loss_per_second: 14.3,
            wall_loss_strength_per_second: 34.0,
            wall_loss_relaxation_hz: 500.0,
            // The physical steepening coefficient beta=(gamma+1)/2 = 1.2015
            // for air (gamma=1.403) describes free-space plane waves. In the
            // reduced 96-cell bore the MC-limited flux and the discrete
            // update dissipate part of every forming shock front, so the
            // effective coefficient must be calibrated, not assumed. The
            // round-9 grid (36 + 12 cells, tests/tmp evidence on
            // jcpe-trumpet-lock-completion-el46) measured 2.3 as the minimal
            // strength whose radiated spectrum satisfies the contract's
            // measured brightness floors (1,400 Hz soft / 2,600 Hz loud —
            // the Table-II-cited enrichment data) while keeping every
            // pressure cell regime-locked above 0.995 periodicity. Higher
            // values (2.6+) brighten further but destabilize the deep-closure
            // forte cells.
            nonlinear_coefficient: 2.3,
            valve_transition_energy_gain: 1.0,
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
            || !self.bore_loss_per_second.is_finite()
            || self.bore_loss_per_second < 0.0
            || !self.wall_loss_strength_per_second.is_finite()
            || self.wall_loss_strength_per_second < 0.0
            || !self.wall_loss_relaxation_hz.is_finite()
            || self.wall_loss_relaxation_hz <= 0.0
            || !self.nonlinear_coefficient.is_finite()
            || self.nonlinear_coefficient < 0.0
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
    let flow = width_m * opening_m * sqrt(2.0 * fabs(delta_pressure_pa) / AIR_DENSITY_KG_M3);
    Ok(if delta_pressure_pa >= 0.0 {
        flow
    } else {
        -flow
    })
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
    if !reference_mass_kg.is_finite()
        || reference_mass_kg <= 0.0
        || !upper_resonance_hz.is_finite()
        || upper_resonance_hz <= 0.0
        || !damping_ratio.is_finite()
        || damping_ratio <= 0.0
    {
        return Err(TrumpetError::NonFiniteState);
    }
    let lower_resonance_hz = upper_resonance_hz / LIP_MODE_FREQUENCY_RATIO;
    let mass_kg = reference_mass_kg * 300.0 / upper_resonance_hz;
    let lower_omega = 2.0 * PI * lower_resonance_hz;
    let upper_omega = 2.0 * PI * upper_resonance_hz;
    let lower_stiffness = mass_kg * lower_omega * lower_omega;
    let upper_stiffness = mass_kg * upper_omega * upper_omega;
    let lower_damping = 2.0 * damping_ratio * mass_kg * lower_omega;
    let upper_damping = 2.0 * damping_ratio * mass_kg * upper_omega;
    let tangent = LIP_STREAMWISE_REST_POSITION_M / LIP_JOINT_NORMAL_POSITION_M;
    let normal_participation = 1.0 / sqrt(1.0 + tangent * tangent);
    let streamwise_participation = tangent * normal_participation;
    let normal_weight = normal_participation * normal_participation;
    let streamwise_weight = streamwise_participation * streamwise_participation;
    let cross_weight = normal_participation * streamwise_participation;
    Ok(TwoModeLipMatrices {
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
    })
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
    let closing_velocity_m_s = penetration_velocity_m_s.max(0.0);
    let root_penetration_m = sqrt(penetration_m);
    let elastic_force_n = hertz_stiffness_n_m32 * penetration_m * root_penetration_m;
    let damping_force_n = hunt_crossley_damping_n_s_m32 * root_penetration_m * closing_velocity_m_s;
    Ok(LipContactBalance {
        force_n: elastic_force_n + damping_force_n,
        potential_energy_j: 0.4 * hertz_stiffness_n_m32 * pow(penetration_m, 2.5),
        dissipation_w: damping_force_n * closing_velocity_m_s,
    })
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
    let signed_flow_squared = candidate_flow_m3_s * fabs(candidate_flow_m3_s);
    let inertance_pa_s2_m3 = AIR_DENSITY_KG_M3 * LIP_THICKNESS_M / lip_opening_area_m2;
    let contraction_pressure_drop_pa =
        0.5 * AIR_DENSITY_KG_M3 * signed_flow_squared / (lip_opening_area_m2 * lip_opening_area_m2);
    let expansion_pressure_change_pa = -AIR_DENSITY_KG_M3
        * signed_flow_squared
        * (1.0 / (MOUTHPIECE_CUP_ENTRY_AREA_M2 * lip_opening_area_m2)
            - 0.5 / (MOUTHPIECE_CUP_ENTRY_AREA_M2 * MOUTHPIECE_CUP_ENTRY_AREA_M2));
    let inverse_effective_area = 1.0 / lip_opening_area_m2 - 1.0 / MOUTHPIECE_CUP_ENTRY_AREA_M2;
    let resistive_pressure_drop_pa = 0.5
        * AIR_DENSITY_KG_M3
        * signed_flow_squared
        * inverse_effective_area
        * inverse_effective_area;
    let flow_acceleration_m3_s2 =
        (mouth_pressure_pa - cup_pressure_pa - resistive_pressure_drop_pa) / inertance_pa_s2_m3;
    let flow_residual_m3_s = candidate_flow_m3_s
        - old_flow_m3_s
        - 0.5 * step_seconds * (old_flow_acceleration_m3_s2 + flow_acceleration_m3_s2);
    let lip_opening_pressure_pa = mouth_pressure_pa
        - inertance_pa_s2_m3 * flow_acceleration_m3_s2
        - contraction_pressure_drop_pa;
    let reconstructed_cup_pressure_pa = lip_opening_pressure_pa - expansion_pressure_change_pa;
    Ok(AdachiJetBalance {
        flow_acceleration_m3_s2,
        flow_residual_m3_s,
        inertance_pa_s2_m3,
        contraction_pressure_drop_pa,
        expansion_pressure_change_pa,
        resistive_pressure_drop_pa,
        lip_opening_pressure_pa,
        reconstructed_cup_pressure_pa,
        dissipation_w: resistive_pressure_drop_pa * candidate_flow_m3_s,
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
    let streamwise_area_m2 = lip_width_m * (LIP_JOINT_NORMAL_POSITION_M - normal_tip_position_m);
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
        // A 12th-order Butterworth at 0.28*Fs_out is below -50 dB by the
        // first image at Fs_out/2 while retaining the musical band below
        // roughly 0.20*Fs_out.
        let cutoff = 0.28 * output_sample_rate_hz;
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

/// Stateful dark trumpet core.  Every field is instance-owned; multiple voices
/// neither share nor reset one another's bore/lip histories.
pub struct TrumpetModel {
    output_sample_rate_hz: f64,
    internal_sample_rate_hz: f64,
    parameters: TrumpetParameters,
    pressure_pa: [f64; BORE_CELLS],
    pressure_wall_memory_pa: [[f64; WALL_LOSS_POLES]; BORE_CELLS],
    outgoing_characteristic_mean_pa: [f64; BORE_CELLS],
    incoming_characteristic_mean_pa: [f64; BORE_CELLS],
    volume_flow_m3_s: [f64; BORE_CELLS + 1],
    flow_wall_memory_m3_s: [[f64; WALL_LOSS_POLES]; BORE_CELLS + 1],
    cell_wall_strength_per_second: [[f64; WALL_LOSS_POLES]; BORE_CELLS],
    face_wall_strength_per_second: [[f64; WALL_LOSS_POLES]; BORE_CELLS + 1],
    cell_wall_coordinate_decay: [f64; BORE_CELLS],
    cell_wall_memory_drive: [[f64; WALL_LOSS_POLES]; BORE_CELLS],
    face_wall_coordinate_decay: [f64; BORE_CELLS + 1],
    face_wall_memory_drive: [[f64; WALL_LOSS_POLES]; BORE_CELLS + 1],
    wall_pole_omega_rad_s: [f64; WALL_LOSS_POLES],
    wall_pole_state_multiplier: [f64; WALL_LOSS_POLES],
    wall_pole_coordinate_multiplier: [f64; WALL_LOSS_POLES],
    base_cell_length_m: [f64; BORE_CELLS],
    cell_length_m: [f64; BORE_CELLS],
    /// Render-speed campaign R3 (jcpe-render-speed-campaign-etnw):
    /// geometry-derived per-cell coefficients, refreshed only when valve
    /// motion changes cell lengths. Each cache stores the bit-identical
    /// result of the exact subexpression the hot loops previously
    /// recomputed every substep (dt/L, rho*c*c/(A*L), rho*dx), so cached
    /// and uncached renders are byte-identical.
    dt_over_cell_length: [f64; BORE_CELLS],
    cell_compliance_inverse: [f64; BORE_CELLS],
    face_rho_dx: [f64; BORE_CELLS + 1],
    cell_area_m2: [f64; BORE_CELLS],
    face_area_m2: [f64; BORE_CELLS + 1],
    valve_weights: [f64; BORE_CELLS],
    valve_position: [f64; 3],
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
    throat_flow_m3_s: f64,
    bell_memory_flow_m3_s: f64,
    previous_bell_flow_m3_s: f64,
    bell_resistance_pa_s_m3: f64,
    bell_corner_rad_s: f64,
    decimator: OversampledOutput,
    last_lip_report: LipSolveReport,
}

impl TrumpetModel {
    /// Recompute geometry-derived hot-loop coefficients (render-speed R3).
    /// Each entry stores the bit-identical value of the exact subexpression
    /// the substep loops previously evaluated inline (dt/L, rho*c*c/(A*L),
    /// rho*dx), so refresh-on-valve-motion preserves byte-identical renders.
    fn refresh_geometry_coefficients(&mut self) {
        let dt = 1.0 / self.internal_sample_rate_hz;
        for cell in 0..BORE_CELLS {
            self.dt_over_cell_length[cell] = dt / self.cell_length_m[cell];
            self.cell_compliance_inverse[cell] =
                AIR_DENSITY_KG_M3 * SOUND_SPEED_M_S * SOUND_SPEED_M_S
                    / (self.cell_area_m2[cell] * self.cell_length_m[cell]);
        }
        for face in 1..BORE_CELLS {
            let dx = 0.5 * (self.cell_length_m[face - 1] + self.cell_length_m[face]);
            self.face_rho_dx[face] = AIR_DENSITY_KG_M3 * dx;
        }
    }

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
        // Cell lengths carry the end-correction scale; the radius/valve-window
        // sampling below stays in the reviewed station coordinates so the
        // taper shape and the physical valve span are untouched.
        let mut base_cell_length_m =
            [OPEN_LENGTH_M * AXIAL_END_CORRECTION_SCALE / BORE_CELLS as f64; BORE_CELLS];
        let mut cell_area_m2 = [0.0; BORE_CELLS];
        let mut valve_weights = [0.0; BORE_CELLS];
        let valve_begin = 0.19;
        let valve_end = 0.56;
        let mut valve_weight_sum = 0.0;
        for cell in 0..BORE_CELLS {
            let x = OPEN_LENGTH_M * (cell as f64 + 0.5) / BORE_CELLS as f64;
            let radius = bore_radius_m(x);
            cell_area_m2[cell] = PI * radius * radius;
            if (valve_begin..=valve_end).contains(&x) {
                valve_weights[cell] = 1.0;
                valve_weight_sum += 1.0;
            }
        }
        for weight in &mut valve_weights {
            *weight /= valve_weight_sum;
        }
        let mut face_area_m2 = [0.0; BORE_CELLS + 1];
        face_area_m2[0] = cell_area_m2[0];
        face_area_m2[BORE_CELLS] = cell_area_m2[BORE_CELLS - 1];
        for face in 1..BORE_CELLS {
            face_area_m2[face] = harmonic_mean(cell_area_m2[face - 1], cell_area_m2[face]);
        }
        let bell_area = face_area_m2[BORE_CELLS];
        let bell_resistance_pa_s_m3 = AIR_DENSITY_KG_M3 * SOUND_SPEED_M_S / bell_area;
        let bell_radius = sqrt(bell_area / PI);
        // A flaring trumpet bell is not a baffled flange. The unflanged
        // low-frequency 0.61*r end correction is the passive one-pole anchor;
        // the fixed flare upstream supplies the horn's remaining radiation
        // transformation.
        let bell_corner_rad_s = SOUND_SPEED_M_S / (0.61 * bell_radius);
        let internal_sample_rate_hz = output_sample_rate_hz * OVERSAMPLE_FACTOR as f64;
        let decimator =
            OversampledOutput::new(output_sample_rate_hz, parameters.oversample_factor)?;
        // Keep the binding explicit even if later geometry becomes nonuniform.
        base_cell_length_m[BORE_CELLS - 1] = OPEN_LENGTH_M * AXIAL_END_CORRECTION_SCALE
            - base_cell_length_m[..BORE_CELLS - 1].iter().sum::<f64>();
        let cell_length_m = base_cell_length_m;
        // Three-band wall-loss precomputation (fixed internal dt): per-pole
        // trapezoidal integrator coefficients plus boundary-layer radius
        // scaling (loss ~ 1/r) referenced to the 6 mm canonical radius.
        let internal_step_seconds = 1.0 / internal_sample_rate_hz;
        let mut wall_pole_omega_rad_s = [0.0; WALL_LOSS_POLES];
        let mut wall_pole_denominator_inverse = [0.0; WALL_LOSS_POLES];
        let mut wall_pole_state_multiplier = [0.0; WALL_LOSS_POLES];
        let mut wall_pole_coordinate_multiplier = [0.0; WALL_LOSS_POLES];
        for pole in 0..WALL_LOSS_POLES {
            let omega =
                2.0 * PI * parameters.wall_loss_relaxation_hz * WALL_LOSS_FREQUENCY_RATIOS[pole];
            let half_step_omega = 0.5 * internal_step_seconds * omega;
            wall_pole_omega_rad_s[pole] = omega;
            wall_pole_denominator_inverse[pole] = 1.0 / (1.0 + half_step_omega);
            wall_pole_state_multiplier[pole] =
                (1.0 - half_step_omega) * wall_pole_denominator_inverse[pole];
            wall_pole_coordinate_multiplier[pole] =
                half_step_omega * wall_pole_denominator_inverse[pole];
        }
        let mut cell_wall_strength_per_second = [[0.0; WALL_LOSS_POLES]; BORE_CELLS];
        let mut cell_wall_coordinate_decay = [1.0; BORE_CELLS];
        let mut cell_wall_memory_drive = [[0.0; WALL_LOSS_POLES]; BORE_CELLS];
        for cell in 0..BORE_CELLS {
            let radius_m = sqrt(cell_area_m2[cell] / PI);
            let scale = WALL_LOSS_REFERENCE_RADIUS_M / radius_m;
            for pole in 0..WALL_LOSS_POLES {
                cell_wall_strength_per_second[cell][pole] = parameters
                    .wall_loss_strength_per_second
                    * WALL_LOSS_NORMALIZED_STRENGTHS[pole]
                    * scale;
            }
            let (decay, drive) = discrete_wall_loss_coefficients(
                cell_wall_strength_per_second[cell],
                wall_pole_denominator_inverse,
                internal_step_seconds,
            );
            cell_wall_coordinate_decay[cell] = decay;
            cell_wall_memory_drive[cell] = drive;
        }
        let mut face_wall_strength_per_second = [[0.0; WALL_LOSS_POLES]; BORE_CELLS + 1];
        let mut face_wall_coordinate_decay = [1.0; BORE_CELLS + 1];
        let mut face_wall_memory_drive = [[0.0; WALL_LOSS_POLES]; BORE_CELLS + 1];
        for face in 1..BORE_CELLS {
            let radius_m = sqrt(face_area_m2[face] / PI);
            let scale = WALL_LOSS_REFERENCE_RADIUS_M / radius_m;
            for pole in 0..WALL_LOSS_POLES {
                face_wall_strength_per_second[face][pole] = parameters
                    .wall_loss_strength_per_second
                    * WALL_LOSS_NORMALIZED_STRENGTHS[pole]
                    * scale;
            }
            let (decay, drive) = discrete_wall_loss_coefficients(
                face_wall_strength_per_second[face],
                wall_pole_denominator_inverse,
                internal_step_seconds,
            );
            face_wall_coordinate_decay[face] = decay;
            face_wall_memory_drive[face] = drive;
        }
        let mut model = Self {
            output_sample_rate_hz,
            internal_sample_rate_hz,
            dt_over_cell_length: [0.0; BORE_CELLS],
            cell_compliance_inverse: [0.0; BORE_CELLS],
            face_rho_dx: [0.0; BORE_CELLS + 1],
            parameters,
            pressure_pa: [0.0; BORE_CELLS],
            pressure_wall_memory_pa: [[0.0; WALL_LOSS_POLES]; BORE_CELLS],
            outgoing_characteristic_mean_pa: [0.0; BORE_CELLS],
            incoming_characteristic_mean_pa: [0.0; BORE_CELLS],
            volume_flow_m3_s: [0.0; BORE_CELLS + 1],
            flow_wall_memory_m3_s: [[0.0; WALL_LOSS_POLES]; BORE_CELLS + 1],
            cell_wall_strength_per_second,
            face_wall_strength_per_second,
            cell_wall_coordinate_decay,
            cell_wall_memory_drive,
            face_wall_coordinate_decay,
            face_wall_memory_drive,
            wall_pole_omega_rad_s,
            wall_pole_state_multiplier,
            wall_pole_coordinate_multiplier,
            base_cell_length_m,
            cell_length_m,
            cell_area_m2,
            face_area_m2,
            valve_weights,
            valve_position: [0.0; 3],
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
            throat_flow_m3_s: 0.0,
            bell_memory_flow_m3_s: 0.0,
            previous_bell_flow_m3_s: 0.0,
            bell_resistance_pa_s_m3,
            bell_corner_rad_s,
            decimator,
            last_lip_report: LipSolveReport {
                newton_iterations: 0,
                residual_evaluations: 0,
                line_search_evaluations: 0,
                bracket_evaluations: 0,
                fallback_bisections: 0,
            },
        };
        model.refresh_geometry_coefficients();
        Ok(model)
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
    pub fn last_lip_report(&self) -> LipSolveReport {
        self.last_lip_report
    }

    /// Diagnostic snapshot of the embouchure-servo state: the frozen
    /// characteristic displacement mean, the rectified oscillation mean, and
    /// the grazing-term engagement fraction. Measurement-only; the renderer
    /// never reads this.
    pub fn diagnostic_servo_state(&self) -> (f64, f64, f64) {
        let engagement = (self.lip_oscillation_mean_m / LIP_GRAZING_ENGAGE_M).min(1.0);
        (
            self.lip_displacement_mean_m,
            self.lip_oscillation_mean_m,
            engagement,
        )
    }

    /// Linear small-signal input impedance of the exact fixed cup, throat,
    /// 48-section bore, and positive-real bell used by this instance. This is
    /// a diagnostic of geometry and passive loads only; the live time-domain
    /// renderer never substitutes this frequency-domain result.
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
        let wall_relaxation_rad_s = 2.0 * PI * self.parameters.wall_loss_relaxation_hz;
        let wall_denominator = wall_relaxation_rad_s * wall_relaxation_rad_s + omega * omega;
        let wall_attenuation_per_second = self.parameters.bore_loss_per_second
            + self.parameters.wall_loss_strength_per_second * omega * omega / wall_denominator;
        let wall_phase_rad_s = omega
            + self.parameters.wall_loss_strength_per_second * omega * wall_relaxation_rad_s
                / wall_denominator;
        for cell in (0..BORE_CELLS).rev() {
            let attenuation =
                wall_attenuation_per_second * self.cell_length_m[cell] / SOUND_SPEED_M_S;
            let phase = wall_phase_rad_s * self.cell_length_m[cell] / SOUND_SPEED_M_S;
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

    /// Total represented storage.  Radiation and viscothermal terms dissipate
    /// energy and therefore are intentionally absent from this storage sum.
    #[must_use]
    /// TEMPORARY probe accessor (removed before landing).
    pub fn diagnostic_lip_displacement_m(&self) -> f64 {
        self.lip_displacement_m
    }

    pub fn stored_energy_j(&self, controls: TrumpetControls) -> f64 {
        let mechanics = self.lip_mechanics(controls);
        let contact = self.lip_contact(
            controls,
            mechanics,
            self.lip_displacement_m,
            self.lip_streamwise_displacement_m,
            self.lip_velocity_m_s,
            self.lip_streamwise_velocity_m_s,
        );
        let mut energy =
            0.5 * mechanics.normal_mass_kg * self.lip_velocity_m_s * self.lip_velocity_m_s
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
        let jet_area_m2 = self.parameters.lip_width_m * opening_m * {
            let open = 1.0 - controls.tongue_contact;
            open * open
        };
        if jet_area_m2 > 0.0 {
            let jet_inertance_pa_s2_m3 = AIR_DENSITY_KG_M3 * LIP_THICKNESS_M / jet_area_m2;
            energy +=
                0.5 * jet_inertance_pa_s2_m3 * self.lip_jet_flow_m3_s * self.lip_jet_flow_m3_s;
        }
        for cell in 0..BORE_CELLS {
            let volume = self.cell_area_m2[cell] * self.cell_length_m[cell];
            let compliance = volume / (AIR_DENSITY_KG_M3 * SOUND_SPEED_M_S * SOUND_SPEED_M_S);
            energy += 0.5 * compliance * self.pressure_pa[cell] * self.pressure_pa[cell];
            for pole in 0..WALL_LOSS_POLES {
                energy += 0.5 * compliance * self.cell_wall_strength_per_second[cell][pole]
                    / self.wall_pole_omega_rad_s[pole]
                    * self.pressure_wall_memory_pa[cell][pole]
                    * self.pressure_wall_memory_pa[cell][pole];
            }
        }
        for face in 1..BORE_CELLS {
            let dx = 0.5 * (self.cell_length_m[face - 1] + self.cell_length_m[face]);
            let inertance = AIR_DENSITY_KG_M3 * dx / self.face_area_m2[face];
            energy += 0.5 * inertance * self.volume_flow_m3_s[face] * self.volume_flow_m3_s[face];
            for pole in 0..WALL_LOSS_POLES {
                energy += 0.5 * inertance * self.face_wall_strength_per_second[face][pole]
                    / self.wall_pole_omega_rad_s[pole]
                    * self.flow_wall_memory_m3_s[face][pole]
                    * self.flow_wall_memory_m3_s[face][pole];
            }
        }
        // Storage for Z(s)=R*s/(s+w): E=R*q^2/(2w).
        energy +=
            self.bell_resistance_pa_s_m3 * self.bell_memory_flow_m3_s * self.bell_memory_flow_m3_s
                / (2.0 * self.bell_corner_rad_s);
        energy
    }

    /// One output-rate sample.  Four physical substeps and four anti-alias
    /// inputs are mandatory; no fast/bypass branch exists.
    pub fn process_sample(&mut self, controls: TrumpetControls) -> Result<f64, TrumpetError> {
        let controls = controls.validate()?;
        let mut output = None;
        for _ in 0..OVERSAMPLE_FACTOR {
            let radiated = self.process_substep(controls)?;
            output = self.decimator.push_oversampled(radiated);
        }
        // Render-speed campaign R2 (jcpe-render-speed-campaign-etnw): the
        // whole-state finiteness sweep (~570 f64 checks) runs once per output
        // sample instead of once per substep. A non-finite value born in any
        // substep persists in the state (nothing overwrites with fresh finite
        // data derived from constants), so it is still detected before this
        // sample's output is accepted; rendered PCM for accepted inputs is
        // byte-identical (golden-hash proven), and refusing inputs still
        // refuse on the same output sample with no PCM published.
        if !self.state_is_finite() {
            return Err(TrumpetError::NonFiniteState);
        }
        output.ok_or(TrumpetError::OversamplingBypassed)
    }

    fn process_substep(&mut self, controls: TrumpetControls) -> Result<f64, TrumpetError> {
        let dt = 1.0 / self.internal_sample_rate_hz;
        self.advance_valves(controls.valves, dt);
        self.solve_lip_cup_with_continuation(controls, dt)?;

        let damping = exp(-self.parameters.bore_loss_per_second * dt);
        for face in 1..BORE_CELLS {
            let pressure_gradient = self.pressure_pa[face] - self.pressure_pa[face - 1];
            // R3 cache: face_rho_dx == AIR_DENSITY_KG_M3 * dx bit-for-bit.
            let acceleration =
                -self.face_area_m2[face] * pressure_gradient / self.face_rho_dx[face];
            self.volume_flow_m3_s[face] =
                damping * (self.volume_flow_m3_s[face] + dt * acceleration);
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

        // Positive-real bell load Z(s)=R*s/(s+w).  q is the passive memory
        // flow and u=q+p/R.  Its exact storage identity is tested directly.
        let last_pressure = self.pressure_pa[BORE_CELLS - 1];
        let radiation = positive_real_radiation_balance(
            self.bell_resistance_pa_s_m3,
            self.bell_corner_rad_s,
            self.bell_memory_flow_m3_s,
            last_pressure,
        )?;
        self.volume_flow_m3_s[BORE_CELLS] = radiation.input_flow_m3_s;
        self.bell_memory_flow_m3_s += dt * radiation.memory_flow_rate_m3_s2;
        let bell_flow_derivative_m3_s2 =
            (radiation.input_flow_m3_s - self.previous_bell_flow_m3_s) / dt;
        self.previous_bell_flow_m3_s = radiation.input_flow_m3_s;

        let mut next_pressure = self.pressure_pa;
        for (cell, next) in next_pressure.iter_mut().enumerate() {
            let divergence = self.volume_flow_m3_s[cell + 1] - self.volume_flow_m3_s[cell];
            // R3 cache: identical value the inline expression produced.
            *next = damping * self.pressure_pa[cell]
                - dt * self.cell_compliance_inverse[cell] * divergence;
        }
        self.apply_tvd_nonlinearity(&mut next_pressure, dt);
        for (cell, (pressure, memory)) in next_pressure
            .iter_mut()
            .zip(self.pressure_wall_memory_pa.iter_mut())
            .enumerate()
        {
            apply_coupled_wall_loss_step(
                pressure,
                memory,
                self.cell_wall_coordinate_decay[cell],
                self.cell_wall_memory_drive[cell],
                self.wall_pole_state_multiplier,
                self.wall_pole_coordinate_multiplier,
            );
        }
        self.pressure_pa = next_pressure;

        // On-axis far field of the bell aperture at one metre. The monopole
        // relation p=rho/(2*pi*r) dU/dt is coupled to the positive-real load
        // above, so it includes the real trumpet bell's frequency-dependent
        // radiation/directivity instead of assuming frequency-independent
        // hemispherical spreading. The derivative is inside the mandatory
        // four-times-rate antialias boundary.
        let far_field_pressure_pa = AIR_DENSITY_KG_M3 * bell_flow_derivative_m3_s2 / (2.0 * PI);
        Ok(far_field_pressure_pa / DIGITAL_FULL_SCALE_PRESSURE_PA)
    }

    fn advance_valves(&mut self, target: [f64; 3], dt: f64) {
        let max_travel_per_substep = dt / 0.018;
        // Fast path (render-speed campaign R1, jcpe-render-speed-campaign-etnw):
        // when every valve already sits at its target, positions, added length
        // and therefore every cell length are unchanged, so each rescale
        // factor below is exactly sqrt(1.0 * valve_transition_energy_gain)
        // with the shipped gain of 1.0 — a whole-bore multiply by 1.0. The
        // parameter validator pins the gain finite and positive; the guard
        // additionally requires exactly 1.0 so any future non-unity gain
        // keeps the slow path bit-for-bit. Static-valve substeps (the common
        // case in chart playback) skip ~200 sqrt calls and three O(cells)
        // rescale loops with byte-identical state.
        if self.parameters.valve_transition_energy_gain == 1.0
            && self
                .valve_position
                .iter()
                .zip(target)
                .all(|(position, wanted)| *position == wanted)
        {
            return;
        }
        let previous_lengths = self.cell_length_m;
        for (position, wanted) in self.valve_position.iter_mut().zip(target) {
            let delta = (wanted - *position).clamp(-max_travel_per_substep, max_travel_per_substep);
            *position += delta;
        }
        let added_length = valve_added_length_m(self.valve_position);
        for (cell, previous_length) in previous_lengths.iter().copied().enumerate() {
            self.cell_length_m[cell] =
                self.base_cell_length_m[cell] + added_length * self.valve_weights[cell];
            // Metric changes preserve, rather than create, pressure storage.
            let scale = sqrt(
                previous_length / self.cell_length_m[cell]
                    * self.parameters.valve_transition_energy_gain,
            );
            self.pressure_pa[cell] *= scale;
            for pole in 0..WALL_LOSS_POLES {
                self.pressure_wall_memory_pa[cell][pole] *= scale;
            }
            self.outgoing_characteristic_mean_pa[cell] *= scale;
            self.incoming_characteristic_mean_pa[cell] *= scale;
        }
        for face in 1..BORE_CELLS {
            let old_dx = 0.5 * (previous_lengths[face - 1] + previous_lengths[face]);
            let new_dx = 0.5 * (self.cell_length_m[face - 1] + self.cell_length_m[face]);
            let scale = sqrt(old_dx / new_dx * self.parameters.valve_transition_energy_gain);
            self.volume_flow_m3_s[face] *= scale;
            for pole in 0..WALL_LOSS_POLES {
                self.flow_wall_memory_m3_s[face][pole] *= scale;
            }
        }
        self.refresh_geometry_coefficients();
    }

    /// Snapshot of every field the lip Newton solve commits, so fallback
    /// tiers can retry from the true pre-step state instead of whatever a
    /// partially-failed tier left behind.
    fn snapshot_lip_state(&self) -> LipStateSnapshot {
        LipStateSnapshot {
            cup_pressure_pa: self.cup_pressure_pa,
            previous_mouth_pressure_pa: self.previous_mouth_pressure_pa,
            previous_equilibrium_opening_m: self.previous_equilibrium_opening_m,
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
        }
    }

    fn restore_lip_state(&mut self, snapshot: &LipStateSnapshot) {
        self.cup_pressure_pa = snapshot.cup_pressure_pa;
        self.previous_mouth_pressure_pa = snapshot.previous_mouth_pressure_pa;
        self.previous_equilibrium_opening_m = snapshot.previous_equilibrium_opening_m;
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
    }

    /// Bounded in-sample fallback ladder around the lip Newton solve.
    ///
    /// Tier 1 (controls moved): re-approach the final controls through
    /// `LIP_CONTINUATION_SUBSTEPS` interpolated sub-steps, warm-starting each.
    /// Tier 2 (contact-event step split, the reed solver's kink-first pattern
    /// generalized): when a deep-closure sample fails, the convergence-basin
    /// edge coincides with the contact event — the Hunt-Crossley C¹ form
    /// (round 7) makes the dynamics smooth on EACH side of the manifold, so
    /// the largest converging prefix step lands the state at the boundary.
    /// Find it by bounded bisection on the step fraction (convergence is the
    /// event oracle; every trial restarts from the pre-step snapshot), commit
    /// the prefix, then integrate the in-contact remainder in dt/2 then dt/4
    /// pieces. Tier 3: plain time subdivision from the pre-step state.
    ///
    /// Every tier restarts from the snapshot (a partially-failed tier can no
    /// longer leak half-advanced state into the next), every solve is counted
    /// in `fallback_bisections`, and the whole ladder is bounded at
    /// `1 + LIP_CONTINUATION_SUBSTEPS + (CONTACT_SPLIT_BISECTIONS + 1 + 6) + 6`
    /// solves per sample. A ladder failure is a real failure.
    fn solve_lip_cup_with_continuation(
        &mut self,
        controls: TrumpetControls,
        dt: f64,
    ) -> Result<(), TrumpetError> {
        let full = self.solve_lip_cup(controls, dt);
        match full {
            Err(TrumpetError::LipSolveDidNotConverge) => {}
            other => return other,
        }
        let snapshot = self.snapshot_lip_state();
        let start_pressure_pa = snapshot.previous_mouth_pressure_pa;
        let start_equilibrium_m = snapshot.previous_equilibrium_opening_m;
        let mut substeps_used = 0_usize;
        let pressure_delta_pa = fabs(controls.mouth_pressure_pa - start_pressure_pa);
        let equilibrium_delta_m = fabs(controls.equilibrium_opening_m - start_equilibrium_m);
        let controls_moved = pressure_delta_pa > 1.0e-9 || equilibrium_delta_m > 1.0e-12;
        if controls_moved {
            let mut control_path_failed = false;
            for substep in 1..=LIP_CONTINUATION_SUBSTEPS {
                let fraction = substep as f64 / LIP_CONTINUATION_SUBSTEPS as f64;
                let staged = TrumpetControls {
                    mouth_pressure_pa: start_pressure_pa
                        + fraction * (controls.mouth_pressure_pa - start_pressure_pa),
                    equilibrium_opening_m: start_equilibrium_m
                        + fraction * (controls.equilibrium_opening_m - start_equilibrium_m),
                    ..controls
                };
                substeps_used += 1;
                match self.solve_lip_cup(staged, dt) {
                    Ok(()) => {}
                    Err(TrumpetError::LipSolveDidNotConverge) => {
                        control_path_failed = true;
                        break;
                    }
                    Err(other) => return Err(other),
                }
            }
            if !control_path_failed {
                self.last_lip_report.fallback_bisections = substeps_used;
                return Ok(());
            }
            self.restore_lip_state(&snapshot);
        }
        // Tier 2: contact-event step split. Bisect for the largest prefix
        // fraction that converges from the pre-step state; the prefix ends at
        // the contact manifold because that is where the basin edge sits.
        let mut best_fraction = 0.0_f64;
        let mut fraction_low = 0.0_f64;
        let mut fraction_high = 1.0_f64;
        for _ in 0..CONTACT_SPLIT_BISECTIONS {
            let trial_fraction = 0.5 * (fraction_low + fraction_high);
            self.restore_lip_state(&snapshot);
            let staged = TrumpetControls {
                mouth_pressure_pa: start_pressure_pa
                    + trial_fraction * (controls.mouth_pressure_pa - start_pressure_pa),
                equilibrium_opening_m: start_equilibrium_m
                    + trial_fraction * (controls.equilibrium_opening_m - start_equilibrium_m),
                ..controls
            };
            substeps_used += 1;
            match self.solve_lip_cup(staged, trial_fraction * dt) {
                Ok(()) => {
                    best_fraction = trial_fraction;
                    fraction_low = trial_fraction;
                }
                Err(TrumpetError::LipSolveDidNotConverge) => {
                    fraction_high = trial_fraction;
                }
                Err(other) => return Err(other),
            }
        }
        if best_fraction > 0.0 {
            // Re-solve and commit the certified prefix deterministically, then
            // integrate the in-contact remainder in halves then quarters.
            self.restore_lip_state(&snapshot);
            let prefix = TrumpetControls {
                mouth_pressure_pa: start_pressure_pa
                    + best_fraction * (controls.mouth_pressure_pa - start_pressure_pa),
                equilibrium_opening_m: start_equilibrium_m
                    + best_fraction * (controls.equilibrium_opening_m - start_equilibrium_m),
                ..controls
            };
            substeps_used += 1;
            match self.solve_lip_cup(prefix, best_fraction * dt) {
                Ok(()) => {
                    let remainder_dt = (1.0 - best_fraction) * dt;
                    if remainder_dt <= 0.0 {
                        self.last_lip_report.fallback_bisections = substeps_used;
                        return Ok(());
                    }
                    for divisions in [2_usize, 4] {
                        let sub_dt = remainder_dt / divisions as f64;
                        let mut tier_ok = true;
                        for _ in 0..divisions {
                            substeps_used += 1;
                            match self.solve_lip_cup(controls, sub_dt) {
                                Ok(()) => {}
                                Err(TrumpetError::LipSolveDidNotConverge) => {
                                    tier_ok = false;
                                    break;
                                }
                                Err(other) => return Err(other),
                            }
                        }
                        if tier_ok {
                            self.last_lip_report.fallback_bisections = substeps_used;
                            return Ok(());
                        }
                        // The remainder pieces mutated state; the next tier
                        // must restart from the committed prefix, which means
                        // replaying prefix from the snapshot.
                        self.restore_lip_state(&snapshot);
                        substeps_used += 1;
                        match self.solve_lip_cup(prefix, best_fraction * dt) {
                            Ok(()) => {}
                            Err(TrumpetError::LipSolveDidNotConverge) => break,
                            Err(other) => return Err(other),
                        }
                    }
                }
                Err(TrumpetError::LipSolveDidNotConverge) => {}
                Err(other) => return Err(other),
            }
        }
        // Tier 3: plain time subdivision from the pre-step state.
        self.restore_lip_state(&snapshot);
        for divisions in [2_usize, 4] {
            let sub_dt = dt / divisions as f64;
            let mut tier_ok = true;
            for _ in 0..divisions {
                substeps_used += 1;
                match self.solve_lip_cup(controls, sub_dt) {
                    Ok(()) => {}
                    Err(TrumpetError::LipSolveDidNotConverge) => {
                        tier_ok = false;
                        break;
                    }
                    Err(other) => return Err(other),
                }
            }
            if tier_ok {
                self.last_lip_report.fallback_bisections = substeps_used;
                return Ok(());
            }
            self.restore_lip_state(&snapshot);
        }
        Err(TrumpetError::LipSolveDidNotConverge)
    }

    fn solve_lip_cup(&mut self, controls: TrumpetControls, dt: f64) -> Result<(), TrumpetError> {
        // This report belongs to this substep even when a residual evaluation
        // or Newton update fails. Never expose a previous sample's work as the
        // diagnostics for a failed solve.
        self.last_lip_report = LipSolveReport {
            newton_iterations: 0,
            residual_evaluations: 0,
            line_search_evaluations: 0,
            bracket_evaluations: 0,
            fallback_bisections: 0,
        };
        let beta = 0.25;
        let gamma = 0.5;
        let mechanics = self.lip_mechanics(controls);
        let old_pressure = self.cup_pressure_pa;
        let pressure_predictor =
            old_pressure + controls.mouth_pressure_pa - self.previous_mouth_pressure_pa;
        let embouchure_servo_force_n = {
            let excess_m = (self.lip_displacement_mean_m - LIP_EMBOUCHURE_KNEE_M).max(0.0);
            // Uses the previous sample's characteristic mean, so the value is
            // constant through this sample's Newton solve.
            let knee_force_n =
                mechanics.normal_stiffness_n_m * LIP_EMBOUCHURE_SERVO_GAIN * excess_m;
            // Closure-grazing term: pull the mean toward the grazing target
            // derived from the developed oscillation amplitude (2a/pi
            // rectified mean), fading in with oscillation so startup is
            // never clamped. Frozen per-sample like the knee term.
            let grazing_target_m =
                LIP_CLOSURE_GRAZING_RATIO * (PI / 2.0) * self.lip_oscillation_mean_m;
            let engagement = (self.lip_oscillation_mean_m / LIP_GRAZING_ENGAGE_M).min(1.0);
            let grazing_excess_m = (self.lip_displacement_mean_m - grazing_target_m).max(0.0);
            let grazing_force_n = mechanics.normal_stiffness_n_m
                * LIP_CLOSURE_GRAZING_GAIN
                * engagement
                * grazing_excess_m;
            knee_force_n + grazing_force_n
        };
        let normal_displacement_predictor = self.lip_displacement_m
            + dt * self.lip_velocity_m_s
            + dt * dt * (0.5 - beta) * self.lip_acceleration_m_s2;
        let normal_velocity_predictor =
            self.lip_velocity_m_s + dt * (1.0 - gamma) * self.lip_acceleration_m_s2;
        let streamwise_displacement_predictor = self.lip_streamwise_displacement_m
            + dt * self.lip_streamwise_velocity_m_s
            + dt * dt * (0.5 - beta) * self.lip_streamwise_acceleration_m_s2;
        let streamwise_velocity_predictor = self.lip_streamwise_velocity_m_s
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
            old_pressure,
            self.lip_opening_pressure_pa,
        )?;
        let old_lip_flow = self.lip_jet_flow_m3_s + old_pressure_port.swept_flow_m3_s;
        let evaluate = |scaled_state: [f64; 4]| -> Result<([f64; 4], LipCandidate), TrumpetError> {
            let candidate_pressure = scaled_state[0] * LIP_SOLVE_PRESSURE_SCALE_PA;
            let normal_displacement_m = scaled_state[1] * LIP_SOLVE_DISPLACEMENT_SCALE_M;
            let streamwise_displacement_m = scaled_state[2] * LIP_SOLVE_DISPLACEMENT_SCALE_M;
            let jet_flow_m3_s = scaled_state[3] * LIP_SOLVE_FLOW_SCALE_M3_S;
            let normal_acceleration_m_s2 =
                (normal_displacement_m - normal_displacement_predictor) / (beta * dt * dt);
            let normal_velocity_m_s =
                normal_velocity_predictor + gamma * dt * normal_acceleration_m_s2;
            let streamwise_acceleration_m_s2 =
                (streamwise_displacement_m - streamwise_displacement_predictor) / (beta * dt * dt);
            let streamwise_velocity_m_s =
                streamwise_velocity_predictor + gamma * dt * streamwise_acceleration_m_s2;
            let contact = self.lip_contact(
                controls,
                mechanics,
                normal_displacement_m,
                streamwise_displacement_m,
                normal_velocity_m_s,
                streamwise_velocity_m_s,
            );
            let opening_m = self
                .lip_aperture_m(controls, normal_displacement_m, streamwise_displacement_m)
                .max(0.0);
            let tongue_open_fraction = {
                let open = 1.0 - controls.tongue_contact;
                open * open
            };
            let jet_area_m2 = self.parameters.lip_width_m * opening_m * tongue_open_fraction;
            let (jet_flow_residual_m3_s, lip_opening_pressure_pa, jet_acceleration_m3_s2) =
                if jet_area_m2 > 0.0 {
                    let jet = adachi_lip_jet_balance(
                        jet_area_m2,
                        self.lip_jet_flow_m3_s,
                        self.lip_jet_acceleration_m3_s2,
                        jet_flow_m3_s,
                        controls.mouth_pressure_pa,
                        candidate_pressure,
                        dt,
                    )?;
                    (
                        jet.flow_residual_m3_s,
                        jet.lip_opening_pressure_pa,
                        jet.flow_acceleration_m3_s2,
                    )
                } else {
                    (jet_flow_m3_s, candidate_pressure, 0.0)
                };
            let pressure_port = two_dimensional_lip_pressure_port_balance(
                self.parameters.lip_effective_area_m2,
                self.parameters.lip_width_m,
                controls.equilibrium_opening_m,
                normal_displacement_m,
                streamwise_displacement_m,
                normal_velocity_m_s,
                streamwise_velocity_m_s,
                controls.mouth_pressure_pa,
                candidate_pressure,
                lip_opening_pressure_pa,
            )?;
            /*
             * Soft-tissue opening-side stiffening: lip tissue is hyperelastic
             * and stiffens as the aperture is blown open, which is what keeps
             * a fixed embouchure modulating at fortissimo instead of sagging
             * into a blown-open static state. One-sided (opening direction
             * only), conservative, and zero-slope at rest so the small-signal
             * lip resonance and every low-pressure regime are untouched.
             */
            let opening_stiffening_n = embouchure_servo_force_n;
            let normal_force_residual_n = mechanics.normal_mass_kg * normal_acceleration_m_s2
                + mechanics.normal_damping_n_s_m * normal_velocity_m_s
                + mechanics.cross_damping_n_s_m * streamwise_velocity_m_s
                + mechanics.normal_stiffness_n_m * normal_displacement_m
                + opening_stiffening_n
                + mechanics.cross_stiffness_n_m * streamwise_displacement_m
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
            let lip_flow = jet_flow_m3_s + pressure_port.swept_flow_m3_s;
            let r = self.parameters.throat_resistance_pa_s_m3;
            let r2 = self.parameters.throat_nonlinear_resistance_pa_s2_m6;
            let l = self.parameters.throat_inertance_pa_s2_m3;
            let throat_linear = 1.0 + 0.5 * dt * r / l;
            let throat_quadratic = 0.5 * dt * r2 / l;
            let throat_right_hand_side = (1.0 - 0.5 * dt * r / l) * self.throat_flow_m3_s
                - throat_quadratic * fabs(self.throat_flow_m3_s) * self.throat_flow_m3_s
                + dt / l * (0.5 * (old_pressure + candidate_pressure) - self.pressure_pa[0]);
            let throat_flow_m3_s = if throat_quadratic > 0.0 {
                let magnitude = (sqrt(
                    throat_linear * throat_linear
                        + 4.0 * throat_quadratic * fabs(throat_right_hand_side),
                ) - throat_linear)
                    / (2.0 * throat_quadratic);
                throat_right_hand_side.signum() * magnitude
            } else {
                throat_right_hand_side / throat_linear
            };
            let cup_residual_pa = candidate_pressure
                - old_pressure
                - 0.5 * dt / self.parameters.mouthpiece_compliance_m3_pa
                    * ((old_lip_flow - self.throat_flow_m3_s) + (lip_flow - throat_flow_m3_s));
            let scaled_residual = [
                cup_residual_pa / LIP_SOLVE_PRESSURE_SCALE_PA,
                normal_force_residual_n
                    / (mechanics.normal_stiffness_n_m * LIP_SOLVE_DISPLACEMENT_SCALE_M),
                streamwise_force_residual_n
                    / (mechanics.streamwise_stiffness_n_m * LIP_SOLVE_DISPLACEMENT_SCALE_M),
                jet_flow_residual_m3_s / LIP_SOLVE_FLOW_SCALE_M3_S,
            ];
            if scaled_residual.iter().any(|value| !value.is_finite()) {
                return Err(TrumpetError::NonFiniteState);
            }
            Ok((
                scaled_residual,
                LipCandidate {
                    cup_pressure_pa: candidate_pressure,
                    displacement_m: normal_displacement_m,
                    velocity_m_s: normal_velocity_m_s,
                    acceleration_m_s2: normal_acceleration_m_s2,
                    streamwise_displacement_m,
                    streamwise_velocity_m_s,
                    streamwise_acceleration_m_s2,
                    lip_opening_pressure_pa,
                    jet_flow_m3_s,
                    jet_acceleration_m3_s2,
                    throat_flow_m3_s,
                },
            ))
        };

        let mut scaled_state = [
            pressure_predictor / LIP_SOLVE_PRESSURE_SCALE_PA,
            self.lip_displacement_m / LIP_SOLVE_DISPLACEMENT_SCALE_M,
            self.lip_streamwise_displacement_m / LIP_SOLVE_DISPLACEMENT_SCALE_M,
            self.lip_jet_flow_m3_s / LIP_SOLVE_FLOW_SCALE_M3_S,
        ];
        let mut residual_evaluations = 1;
        let mut line_search_evaluations = 0;
        let mut newton_iterations = 0;
        let (mut residual, mut candidate) = match evaluate(scaled_state) {
            Ok(result) => result,
            Err(error) => {
                self.last_lip_report.residual_evaluations = residual_evaluations;
                return Err(error);
            }
        };
        let mut converged = max_abs_four(residual) <= LIP_SOLVE_RESIDUAL_TOLERANCE;
        for iteration in 0..MAX_LIP_NEWTON_ITERATIONS {
            if converged {
                break;
            }
            newton_iterations = iteration + 1;
            let mut jacobian = [[0.0; 4]; 4];
            for column in 0..4 {
                let epsilon = 1.0e-6 * (1.0 + fabs(scaled_state[column]));
                let mut perturbed = scaled_state;
                perturbed[column] += epsilon;
                residual_evaluations += 1;
                let perturbed_residual = match evaluate(perturbed) {
                    Ok(result) => result.0,
                    Err(error) => {
                        self.last_lip_report = LipSolveReport {
                            newton_iterations,
                            residual_evaluations,
                            line_search_evaluations,
                            bracket_evaluations: 0,
                            fallback_bisections: 0,
                        };
                        return Err(error);
                    }
                };
                for row in 0..4 {
                    jacobian[row][column] = (perturbed_residual[row] - residual[row]) / epsilon;
                }
            }
            let Some(mut correction) = solve_four_by_four(
                jacobian,
                [-residual[0], -residual[1], -residual[2], -residual[3]],
            ) else {
                self.last_lip_report = LipSolveReport {
                    newton_iterations,
                    residual_evaluations,
                    line_search_evaluations,
                    bracket_evaluations: 0,
                    fallback_bisections: 0,
                };
                return Err(TrumpetError::LipSolveDidNotConverge);
            };
            correction[0] = correction[0].clamp(-4.0, 4.0);
            correction[1] = correction[1].clamp(-0.5, 0.5);
            correction[2] = correction[2].clamp(-0.5, 0.5);
            correction[3] = correction[3].clamp(-0.5, 0.5);
            let current_norm = max_abs_four(residual);
            let mut step = 1.0;
            let mut accepted = None;
            for _ in 0..MAX_LIP_LINE_SEARCH_EVALUATIONS {
                let trial_state = [
                    scaled_state[0] + step * correction[0],
                    scaled_state[1] + step * correction[1],
                    scaled_state[2] + step * correction[2],
                    scaled_state[3] + step * correction[3],
                ];
                residual_evaluations += 1;
                line_search_evaluations += 1;
                let trial = match evaluate(trial_state) {
                    Ok(result) => result,
                    Err(error) => {
                        self.last_lip_report = LipSolveReport {
                            newton_iterations,
                            residual_evaluations,
                            line_search_evaluations,
                            bracket_evaluations: 0,
                            fallback_bisections: 0,
                        };
                        return Err(error);
                    }
                };
                if max_abs_four(trial.0) < current_norm {
                    accepted = Some((trial_state, trial.0, trial.1));
                    break;
                }
                step *= 0.5;
            }
            let Some((next_state, next_residual, next_candidate)) = accepted else {
                break;
            };
            scaled_state = next_state;
            residual = next_residual;
            candidate = next_candidate;
            converged = max_abs_four(residual) <= LIP_SOLVE_RESIDUAL_TOLERANCE;
        }
        if !converged || residual_evaluations > MAX_LIP_RESIDUAL_EVALUATIONS {
            self.last_lip_report = LipSolveReport {
                newton_iterations,
                residual_evaluations,
                line_search_evaluations,
                bracket_evaluations: 0,
                fallback_bisections: 0,
            };
            return Err(TrumpetError::LipSolveDidNotConverge);
        }
        self.cup_pressure_pa = candidate.cup_pressure_pa;
        self.previous_mouth_pressure_pa = controls.mouth_pressure_pa;
        self.previous_equilibrium_opening_m = controls.equilibrium_opening_m;
        self.lip_displacement_m = candidate.displacement_m;
        {
            let dt = 1.0 / self.internal_sample_rate_hz;
            let memory = exp(-2.0 * PI * CHARACTERISTIC_MEAN_CORNER_HZ * dt);
            self.lip_displacement_mean_m =
                memory * self.lip_displacement_mean_m + (1.0 - memory) * self.lip_displacement_m;
            let deviation_m = (self.lip_displacement_m - self.lip_displacement_mean_m).abs();
            self.lip_oscillation_mean_m =
                memory * self.lip_oscillation_mean_m + (1.0 - memory) * deviation_m;
        }
        self.lip_velocity_m_s = candidate.velocity_m_s;
        self.lip_acceleration_m_s2 = candidate.acceleration_m_s2;
        self.lip_streamwise_displacement_m = candidate.streamwise_displacement_m;
        self.lip_streamwise_velocity_m_s = candidate.streamwise_velocity_m_s;
        self.lip_streamwise_acceleration_m_s2 = candidate.streamwise_acceleration_m_s2;
        self.lip_opening_pressure_pa = candidate.lip_opening_pressure_pa;
        self.lip_jet_flow_m3_s = candidate.jet_flow_m3_s;
        self.lip_jet_acceleration_m3_s2 = candidate.jet_acceleration_m3_s2;
        self.throat_flow_m3_s = candidate.throat_flow_m3_s;
        self.last_lip_report = LipSolveReport {
            newton_iterations,
            residual_evaluations,
            line_search_evaluations,
            bracket_evaluations: 0,
            fallback_bisections: 0,
        };
        Ok(())
    }

    fn lip_mechanics(&self, controls: TrumpetControls) -> LipMechanics {
        let matrices = passive_two_mode_lip_matrices(
            self.parameters.lip_mass_kg,
            controls.lip_resonance_hz,
            controls.lip_damping_ratio,
        )
        .expect("validated lip controls and canonical mass");
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
        let hertz_stiffness_n_m32 = LIP_CONTACT_STIFFNESS_RATIO * mechanics.normal_stiffness_n_m
            / sqrt(LIP_CONTACT_SCALE_M);
        let hunt_crossley_damping_n_s_m32 = 2.0
            * LIP_CONTACT_DAMPING_RATIO
            * sqrt(effective_mass_kg * mechanics.normal_stiffness_n_m)
            / sqrt(LIP_CONTACT_SCALE_M);
        let lower = unilateral_lip_contact_balance(
            hertz_stiffness_n_m32,
            hunt_crossley_damping_n_s_m32,
            (-aperture_m).max(0.0),
            -aperture_velocity_m_s,
        )
        .expect("canonical lower contact parameters");
        let upper = unilateral_lip_contact_balance(
            hertz_stiffness_n_m32,
            hunt_crossley_damping_n_s_m32,
            (aperture_m - self.parameters.maximum_lip_opening_m).max(0.0),
            aperture_velocity_m_s,
        )
        .expect("canonical upper contact parameters");
        let streamwise_hertz_stiffness_n_m32 = LIP_CONTACT_STIFFNESS_RATIO
            * mechanics.streamwise_stiffness_n_m
            / sqrt(LIP_CONTACT_SCALE_M);
        let streamwise_hunt_crossley_damping_n_s_m32 = 2.0
            * LIP_CONTACT_DAMPING_RATIO
            * sqrt(mechanics.streamwise_mass_kg * mechanics.streamwise_stiffness_n_m)
            / sqrt(LIP_CONTACT_SCALE_M);
        let streamwise_lower_penetration_m = lip_streamwise_joint_penetration_m(
            self.parameters.lip_effective_area_m2,
            self.parameters.lip_width_m,
            streamwise_displacement_m,
        )
        .expect("canonical streamwise joint geometry");
        let streamwise_lower = unilateral_lip_contact_balance(
            streamwise_hertz_stiffness_n_m32,
            streamwise_hunt_crossley_damping_n_s_m32,
            streamwise_lower_penetration_m,
            -streamwise_velocity_m_s,
        )
        .expect("canonical streamwise lower contact parameters");
        let streamwise_upper = unilateral_lip_contact_balance(
            streamwise_hertz_stiffness_n_m32,
            streamwise_hunt_crossley_damping_n_s_m32,
            (streamwise_displacement_m - LIP_MAX_STREAMWISE_DISPLACEMENT_M).max(0.0),
            streamwise_velocity_m_s,
        )
        .expect("canonical streamwise upper contact parameters");
        let aperture_force_n = 2.0 * (lower.force_n - upper.force_n);
        LipContact {
            normal_force_n: aperture_force_n,
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
        // Menguy-Gilbert weakly nonlinear propagation acts independently on
        // outgoing and incoming simple waves.  With
        // p+ = (p + rho*c*u)/2 and p- = (p - rho*c*u)/2, their residual
        // nonlinear fluxes are respectively +beta*p+^2/(2*rho*c) and
        // -beta*p-^2/(2*rho*c).  Splitting the waves prevents a standing-wave
        // pressure sign from erasing the physical direction of steepening.
        let mut outgoing_pressure = [0.0; BORE_CELLS];
        let mut incoming_pressure = [0.0; BORE_CELLS];
        let mut previous_particle_velocity = [0.0; BORE_CELLS];
        let mean_memory = exp(-2.0 * PI * CHARACTERISTIC_MEAN_CORNER_HZ * dt);
        for cell in 0..BORE_CELLS {
            let left_velocity = self.volume_flow_m3_s[cell] / self.face_area_m2[cell];
            let right_velocity = self.volume_flow_m3_s[cell + 1] / self.face_area_m2[cell + 1];
            let particle_velocity = 0.5 * (left_velocity + right_velocity);
            previous_particle_velocity[cell] = particle_velocity;
            let impedance_velocity = AIR_DENSITY_KG_M3 * SOUND_SPEED_M_S * particle_velocity;
            let outgoing = 0.5 * (pressure[cell] + impedance_velocity);
            let incoming = 0.5 * (pressure[cell] - impedance_velocity);
            self.outgoing_characteristic_mean_pa[cell] = mean_memory
                * self.outgoing_characteristic_mean_pa[cell]
                + (1.0 - mean_memory) * outgoing;
            self.incoming_characteristic_mean_pa[cell] = mean_memory
                * self.incoming_characteristic_mean_pa[cell]
                + (1.0 - mean_memory) * incoming;
            // Menguy-Gilbert propagation is written in retarded acoustic
            // time. Removing the quasistatic characteristic pressure keeps
            // its zero-period-mean component from becoming an artificial
            // amplitude-dependent bore delay; only waveform steepening and
            // harmonic generation remain in this residual flux.
            outgoing_pressure[cell] = outgoing - self.outgoing_characteristic_mean_pa[cell];
            incoming_pressure[cell] = incoming - self.incoming_characteristic_mean_pa[cell];
        }
        advance_nonlinear_characteristic(
            &mut outgoing_pressure,
            &self.dt_over_cell_length,
            self.parameters.nonlinear_coefficient,
            1.0,
        );
        advance_nonlinear_characteristic(
            &mut incoming_pressure,
            &self.dt_over_cell_length,
            self.parameters.nonlinear_coefficient,
            -1.0,
        );
        let mut particle_velocity_delta = [0.0; BORE_CELLS];
        for cell in 0..BORE_CELLS {
            let outgoing = outgoing_pressure[cell] + self.outgoing_characteristic_mean_pa[cell];
            let incoming = incoming_pressure[cell] + self.incoming_characteristic_mean_pa[cell];
            pressure[cell] = outgoing + incoming;
            let particle_velocity = (outgoing - incoming) / (AIR_DENSITY_KG_M3 * SOUND_SPEED_M_S);
            particle_velocity_delta[cell] = particle_velocity - previous_particle_velocity[cell];
        }
        // Apply the same characteristic correction to the staggered flow
        // state.  Boundary flows remain governed by the live lip and
        // positive-real radiation relations rather than being overwritten.
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
                .all(|poles| poles.iter().all(|value| value.is_finite()))
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
                .all(|poles| poles.iter().all(|value| value.is_finite()))
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
            && self.throat_flow_m3_s.is_finite()
            && self.bell_memory_flow_m3_s.is_finite()
            && self.previous_bell_flow_m3_s.is_finite()
    }

    /// Direct state injection is deliberately limited to a bounded diagnostic
    /// pulse.  It supports passivity/impedance tests and cannot retune geometry.
    pub fn diagnostic_pressure_pulse(&mut self, pressure_pa: f64) -> Result<(), TrumpetError> {
        if !pressure_pa.is_finite() || fabs(pressure_pa) > 100.0 {
            return Err(TrumpetError::NonFiniteState);
        }
        self.pressure_pa[0] += pressure_pa;
        Ok(())
    }

    /// Seed the open bore's geometry-derived first half-wave without changing
    /// its length, lip controls, or any requested pitch. This is the pedal
    /// basin, not the normal Bb3 playing regime; it remains explicit for future
    /// nonlinear/subharmonic work and must not certify normal playability.
    pub fn seed_open_first_regime(&mut self, peak_pressure_pa: f64) -> Result<(), TrumpetError> {
        self.seed_open_mode(1, peak_pressure_pa)
    }

    /// Seed the second open-bore standing wave selected by a preparatory tongue
    /// release. This is the normal Bb3-series regime supported by the first
    /// strong playable impedance peak; the geometry, valves, and lip controls
    /// remain unchanged.
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
    throat_flow_m3_s: f64,
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
struct ComplexValue {
    real: f64,
    imaginary: f64,
}

/// Trapezoidal (Tustin) discretization of the coupled three-band relaxation.
/// Each pole individually satisfies the passive single-relaxation law proven
/// by `passive_wall_loss_balance`; the aggregate coordinate decay couples the
/// bands so the implicit step stays unconditionally stable at any strength.
/// Ported from the staged external model (round-8 hybridization).
fn discrete_wall_loss_coefficients(
    strengths_per_second: [f64; WALL_LOSS_POLES],
    pole_denominator_inverse: [f64; WALL_LOSS_POLES],
    step_seconds: f64,
) -> (f64, [f64; WALL_LOSS_POLES]) {
    let mut effective_strength = [0.0; WALL_LOSS_POLES];
    let mut aggregate_strength = 0.0;
    for pole in 0..WALL_LOSS_POLES {
        effective_strength[pole] = strengths_per_second[pole] * pole_denominator_inverse[pole];
        aggregate_strength += effective_strength[pole];
    }
    let denominator_inverse = 1.0 / (1.0 + 0.5 * step_seconds * aggregate_strength);
    let coordinate_decay = (1.0 - 0.5 * step_seconds * aggregate_strength) * denominator_inverse;
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

fn solve_four_by_four(matrix: [[f64; 4]; 4], right_hand_side: [f64; 4]) -> Option<[f64; 4]> {
    let mut augmented = [[0.0; 5]; 4];
    for row in 0..4 {
        for column in 0..4 {
            augmented[row][column] = matrix[row][column];
        }
        augmented[row][4] = right_hand_side[row];
    }
    for pivot_column in 0..4 {
        let mut pivot_row = pivot_column;
        for row in pivot_column + 1..4 {
            if fabs(augmented[row][pivot_column]) > fabs(augmented[pivot_row][pivot_column]) {
                pivot_row = row;
            }
        }
        if !augmented[pivot_row][pivot_column].is_finite()
            || fabs(augmented[pivot_row][pivot_column]) < 1.0e-12
        {
            return None;
        }
        augmented.swap(pivot_column, pivot_row);
        let pivot = augmented[pivot_column][pivot_column];
        for column in pivot_column..5 {
            augmented[pivot_column][column] /= pivot;
        }
        for row in 0..4 {
            if row == pivot_column {
                continue;
            }
            let factor = augmented[row][pivot_column];
            for column in pivot_column..5 {
                augmented[row][column] -= factor * augmented[pivot_column][column];
            }
        }
    }
    let solution = [
        augmented[0][4],
        augmented[1][4],
        augmented[2][4],
        augmented[3][4],
    ];
    solution
        .iter()
        .all(|value| value.is_finite())
        .then_some(solution)
}

fn bore_radius_m(position_m: f64) -> f64 {
    let mut previous_position = 0.0;
    // The first reviewed station is the 5.5 mm radius at the end of the
    // mouthpiece shank, not the radius at the cup throat. Resolving this taper
    // is essential: shank geometry governs both input impedance alignment and
    // nonlinear brassiness in the cited measurements.
    let mut previous_radius = MOUTHPIECE_BACKBORE_ENTRY_RADIUS_M;
    for station in BORE_STATIONS_M {
        if position_m <= station[0] {
            let span = (station[0] - previous_position).max(1.0e-12);
            let fraction = (position_m - previous_position) / span;
            return previous_radius + fraction * (station[1] - previous_radius);
        }
        previous_position = station[0];
        previous_radius = station[1];
    }
    BORE_STATIONS_M[BORE_STATIONS_M.len() - 1][1]
}

fn harmonic_mean(left: f64, right: f64) -> f64 {
    2.0 * left * right / (left + right)
}

fn minmod(left: f64, right: f64) -> f64 {
    if left * right <= 0.0 {
        0.0
    } else if fabs(left) < fabs(right) {
        left
    } else {
        right
    }
}

/// Monotonized-central (MC) slope limiter. Still TVD, but far less
/// dissipative than minmod: on the 48-cell bore minmod smears exactly the
/// high harmonics the cumulative steepening generates (measured 2x centroid
/// deficit vs the contract's cited enrichment curves), while MC preserves
/// them without introducing new extrema.
fn monotonized_central(left: f64, right: f64) -> f64 {
    if left * right <= 0.0 {
        return 0.0;
    }
    let central = 0.5 * (left + right);
    let bound = 2.0
        * if fabs(left) < fabs(right) {
            left
        } else {
            right
        };
    if fabs(central) < fabs(bound) {
        central
    } else {
        bound
    }
}

fn advance_nonlinear_characteristic(
    state: &mut [f64; BORE_CELLS],
    dt_over_length: &[f64; BORE_CELLS],
    beta: f64,
    direction: f64,
) {
    let before = *state;
    let first = nonlinear_characteristic_euler(&before, dt_over_length, beta, direction);
    let second = nonlinear_characteristic_euler(&first, dt_over_length, beta, direction);
    for cell in 0..BORE_CELLS {
        state[cell] = 0.5 * (before[cell] + second[cell]);
    }
}

fn nonlinear_characteristic_euler(
    state: &[f64; BORE_CELLS],
    dt_over_length: &[f64; BORE_CELLS],
    beta: f64,
    direction: f64,
) -> [f64; BORE_CELLS] {
    let positive_coefficient = beta / (2.0 * AIR_DENSITY_KG_M3 * SOUND_SPEED_M_S);
    let mut slopes = [0.0; BORE_CELLS];
    for cell in 1..BORE_CELLS - 1 {
        // minmod for now: monotonized_central (above) measurably recovers the
        // steepened harmonics this grid dissipates, but the sharper fronts it
        // admits exceed the lip Newton basin at ff until the wall-loss model
        // gains the high-frequency viscothermal rounding that physically
        // limits shock sharpness (round-4 work, see bead trail). Swapping the
        // limiter without that loss physics trades a centroid gain for a
        // solver wall at 12 kPa (measured: LipSolveDidNotConverge frame 14915
        // even with time-subdivided continuation).
        slopes[cell] =
            monotonized_central(state[cell] - state[cell - 1], state[cell + 1] - state[cell]);
    }
    let positive_flux = |value: f64| positive_coefficient * value * value;
    let godunov_flux = |left: f64, right: f64| {
        // Orient both characteristic families into the same convex Burgers
        // problem. The exact entropy flux avoids the excess broadband
        // damping of local Lax-Friedrichs/Rusanov while retaining shocks.
        let left = direction * left;
        let right = direction * right;
        let flux = if left <= right {
            if left >= 0.0 {
                positive_flux(left)
            } else if right <= 0.0 {
                positive_flux(right)
            } else {
                0.0
            }
        } else if left + right >= 0.0 {
            positive_flux(left)
        } else {
            positive_flux(right)
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
        // R3 cache: dt_over_length == dt / cell_length_m bit-for-bit.
        advanced[cell] = state[cell] - dt_over_length[cell] * (flux[cell + 1] - flux[cell]);
    }
    advanced
}

// ---------------------------------------------------------------------------
// Round-11 note table and per-note render exports
// (jcpe-trumpet-lock-completion-el46). Provenance: the operating-table sweep
// tests/trumpet_note_sweep.rs — standard Bb-trumpet fingerings on bore
// regimes 2/3/4, lip target = ratio x 12-TET, every row measured locking the
// RIGHT regime within +-5.4 cents at periodicity >= 0.996 at both 48 kHz and
// 44.1 kHz. The player dynamics law (damping firming +0.00751 zeta/kPa over
// the 5.5 kPa excess) is the round-11 co-design knee, the same constants the
// wall test pins.

/// (midi, [valve1, valve2, valve3], lip target ratio vs 12-TET).
pub const TRUMPET_NOTE_TABLE: [(i32, [f64; 3], f64); 19] = [
    (52, [1.0, 1.0, 1.0], 1.16),
    (53, [1.0, 0.0, 1.0], 1.16),
    (54, [0.0, 1.0, 1.0], 1.16),
    (55, [1.0, 1.0, 0.0], 1.16),
    (56, [1.0, 0.0, 0.0], 1.16),
    (57, [0.0, 1.0, 0.0], 1.16),
    (58, [0.0, 0.0, 0.0], 1.18),
    (59, [1.0, 1.0, 1.0], 1.16),
    (60, [1.0, 0.0, 1.0], 1.16),
    (61, [0.0, 1.0, 1.0], 1.16),
    (62, [1.0, 1.0, 0.0], 1.14),
    (63, [1.0, 0.0, 0.0], 1.14),
    (64, [0.0, 1.0, 0.0], 1.12),
    (65, [0.0, 0.0, 0.0], 1.12),
    (66, [0.0, 1.0, 1.0], 1.10),
    (67, [1.0, 1.0, 0.0], 1.12),
    (68, [1.0, 0.0, 0.0], 1.14),
    (69, [0.0, 1.0, 0.0], 1.16),
    (70, [0.0, 0.0, 0.0], 1.20),
];

const TPT_CAP_SECONDS: f64 = 3.0;

/// Round-11 dynamics compensation (tests/trumpet_dynamics_calibration.rs):
/// per-note relative lip-target multipliers measured at excess pressures
/// 1.0..=5.0 kPa in 0.5 kPa steps (the operating-table sweep point is
/// 6.5 kPa mouth pressure = 1 kPa excess, multiplier 1.0 by construction;
/// the half-kPa grid resolves the low-register regime cliff). Piecewise-linear
/// interpolation between the points holds every table note within
/// +-2.5 cents of 12-TET across the full velocity->pressure band at
/// periodicity >= 0.99; parametric (linear/quadratic-in-excess) laws were
/// measured and left +-33-cent mid-band residuals on the lowest notes.
pub const TPT_LIP_COMP: [(i32, [f64; 9]); 19] = [
    (
        52,
        [
            1.00000, 0.96514, 0.82374, 0.81049, 0.80152, 0.79459, 0.78917, 0.78917, 0.78610,
        ],
    ),
    (
        53,
        [
            1.00000, 0.98113, 0.95693, 0.93933, 0.84056, 0.83254, 0.82687, 0.82687, 0.82196,
        ],
    ),
    (
        54,
        [
            1.00000, 0.98329, 0.97361, 0.95064, 0.93650, 0.90179, 0.89378, 0.88644, 0.88002,
        ],
    ),
    (
        55,
        [
            1.00000, 0.98594, 0.97568, 0.96672, 0.95191, 0.93898, 0.92703, 0.91659, 0.90698,
        ],
    ),
    (
        56,
        [
            1.00000, 0.98928, 0.97823, 0.96897, 0.96088, 0.94920, 0.93817, 0.92790, 0.91835,
        ],
    ),
    (
        57,
        [
            1.00000, 0.99246, 0.98054, 0.97095, 0.96248, 0.95508, 0.94627, 0.93694, 0.92764,
        ],
    ),
    (
        58,
        [
            1.00000, 0.97679, 0.96542, 0.95546, 0.94682, 0.93923, 0.93254, 0.92092, 0.91332,
        ],
    ),
    (
        59,
        [
            1.00000, 0.97966, 0.96680, 0.95599, 0.94676, 0.93881, 0.93192, 0.93192, 0.91885,
        ],
    ),
    (
        60,
        [
            1.00000, 0.98278, 0.96856, 0.95686, 0.94691, 0.93837, 0.93096, 0.93096, 0.91731,
        ],
    ),
    (
        61,
        [
            1.00000, 0.99038, 0.97686, 0.96368, 0.95210, 0.94215, 0.93358, 0.92617, 0.91973,
        ],
    ),
    (
        62,
        [
            1.00000, 1.00621, 0.99754, 0.98479, 0.97233, 0.96130, 0.95176, 0.94352, 0.93638,
        ],
    ),
    (
        63,
        [
            1.00000, 1.00000, 1.00000, 0.99013, 0.97777, 0.96596, 0.95557, 0.94657, 0.93877,
        ],
    ),
    (
        64,
        [
            1.00000, 1.00769, 1.00769, 1.00769, 1.00124, 0.98945, 0.97812, 0.96816, 0.95952,
        ],
    ),
    (
        65,
        [
            1.00000, 1.00000, 1.00000, 1.00000, 1.00000, 1.00000, 0.98770, 0.97711, 0.96757,
        ],
    ),
    (
        66,
        [
            1.00000, 1.00000, 1.00000, 1.00000, 1.00000, 1.00000, 1.00000, 1.00197, 1.00197,
        ],
    ),
    (
        67,
        [
            1.00000, 0.98898, 0.98898, 0.98898, 0.98898, 0.98898, 0.98898, 0.98898, 0.98898,
        ],
    ),
    (
        68,
        [
            1.00000, 0.98830, 0.98345, 0.98345, 0.98345, 0.98345, 0.98345, 0.98345, 0.98345,
        ],
    ),
    (
        69,
        [
            1.00000, 1.00000, 0.98556, 0.98556, 0.98556, 0.97967, 0.97967, 0.97967, 0.97967,
        ],
    ),
    (
        70,
        [
            1.00000, 0.99061, 0.98317, 0.96757, 0.96757, 0.96757, 0.96757, 0.95900, 0.95900,
        ],
    ),
];

/// Test-visible alias for the compensation interpolator.
pub fn tpt_lip_comp_multiplier_for_tests(midi: i32, excess_kpa: f64) -> f64 {
    tpt_lip_comp_multiplier(midi, excess_kpa)
}

fn tpt_lip_comp_multiplier(midi: i32, excess_kpa: f64) -> f64 {
    let row = TPT_LIP_COMP
        .iter()
        .find(|entry| entry.0 == midi)
        .map(|entry| entry.1)
        .unwrap_or([1.0; 9]);
    if excess_kpa <= 1.0 {
        return row[0];
    }
    let clamped = excess_kpa.min(5.0);
    let position = (clamped - 1.0) * 2.0;
    let lower = (position as usize).min(7);
    let fraction = position - lower as f64;
    row[lower] + (row[lower + 1] - row[lower]) * fraction
}

/// Round-11 phonation floors (tests/trumpet_dynamics_calibration.rs,
/// per_note_pressure_floors): the measured minimum mouth pressure at which
/// each note's seeded oscillation sustains, plus 10% margin (3.2 kPa map
/// minimum where the note sustains everywhere). The velocity map is
/// anchored at this floor so no chart velocity can ask the lip pair for a
/// note below its phonation threshold — the top of the table needs
/// ~7.7 kPa where the bottom speaks at the map minimum, exactly the real
/// instrument's compressed piano range upstairs.
pub const TPT_PRESSURE_FLOOR: [(i32, f64); 19] = [
    (52, 3200.0),
    (53, 3200.0),
    (54, 3200.0),
    (55, 3200.0),
    (56, 3200.0),
    (57, 3200.0),
    (58, 3200.0),
    (59, 4132.0),
    (60, 4304.0),
    (61, 4508.0),
    (62, 4775.0),
    (63, 5041.0),
    (64, 5449.0),
    (65, 5778.0),
    (66, 7332.0),
    (67, 7550.0),
    (68, 7801.0),
    (69, 8099.0),
    (70, 8523.0),
];

pub const TPT_DAMPING_SLOPE_PER_KPA: f64 = 0.007_51;

fn tpt_note_row(midi: i32) -> Option<&'static (i32, [f64; 3], f64)> {
    TRUMPET_NOTE_TABLE.iter().find(|row| row.0 == midi)
}

fn tpt_disjoint(left: usize, left_bytes: usize, right: usize, right_bytes: usize) -> bool {
    let left_end = match left.checked_add(left_bytes) {
        Some(value) => value,
        None => return false,
    };
    let right_end = match right.checked_add(right_bytes) {
        Some(value) => value,
        None => return false,
    };
    left_end <= right || right_end <= left
}

#[no_mangle]
pub extern "C" fn tpt_note_frames(midi: i32, sample_rate: f32) -> i32 {
    let rate = sample_rate as f64;
    if tpt_note_row(midi).is_none() || !(8_000.0..=192_000.0).contains(&rate) {
        return 0;
    }
    (TPT_CAP_SECONDS * rate) as i32
}

/// Per-note trumpet render. Velocity maps to blowing pressure (3.2..12 kPa);
/// the note speaks via the seeded normal regime, sustains under the round-11
/// embouchure-firming law, and releases with a pressure taper over the final
/// 120 ms of the requested span. No per-note loudness normalization: level
/// and spectrum follow the physics (the wall-test law), and the recipe's
/// output level owns mixing.
#[no_mangle]
pub extern "C" fn tpt_render(
    midi: i32,
    velocity: i32,
    sample_rate: f32,
    left: *mut f32,
    right: *mut f32,
    max_frames: i32,
) -> i32 {
    let natural = tpt_note_frames(midi, sample_rate);
    if natural == 0
        || !(1..=127).contains(&velocity)
        || max_frames <= 0
        || left.is_null()
        || right.is_null()
        || (left as usize) % core::mem::align_of::<f32>() != 0
        || (right as usize) % core::mem::align_of::<f32>() != 0
    {
        return 0;
    }
    let row = match tpt_note_row(midi) {
        Some(row) => row,
        None => return 0,
    };
    let frames = natural.min(max_frames) as usize;
    let channel_bytes = match frames.checked_mul(core::mem::size_of::<f32>()) {
        Some(value) => value,
        None => return 0,
    };
    if !tpt_disjoint(left as usize, channel_bytes, right as usize, channel_bytes) {
        return 0;
    }
    let out_left = unsafe { core::slice::from_raw_parts_mut(left, frames) };
    let out_right = unsafe { core::slice::from_raw_parts_mut(right, frames) };
    let rate = sample_rate as f64;
    let velocity = velocity as f64;
    /*
     * Velocity map anchored at the note's phonation floor and capped at the
     * calibrated 10.5 kPa (excess 5) band edge of TPT_LIP_COMP.
     */
    let pressure_floor_pa = TPT_PRESSURE_FLOOR
        .iter()
        .find(|entry| entry.0 == midi)
        .map(|entry| entry.1)
        .unwrap_or(3_200.0);
    let pressure_pa = pressure_floor_pa + (10_500.0 - pressure_floor_pa) * (velocity / 127.0);
    let target_hz = 440.0 * libm::pow(2.0, (midi as f64 - 69.0) / 12.0);
    /*
     * Round-11 embouchure dynamics: the sounding pitch of a fixed lip
     * target drifts with mouth pressure at a regime-dependent rate, so the
     * lip target follows the measured per-note compensation table
     * (TPT_LIP_COMP) as pressure sweeps with velocity.
     */
    let lip_base_hz = target_hz * row.2;
    let mut model = match TrumpetModel::new(rate, TrumpetParameters::canonical()) {
        Ok(model) => model,
        Err(_) => return 0,
    };
    let mut controls = TrumpetControls {
        mouth_pressure_pa: 0.0,
        lip_resonance_hz: lip_base_hz,
        lip_damping_ratio: 1.0 / 3.0,
        equilibrium_opening_m: 0.0,
        tongue_contact: 1.0,
        valves: row.1,
    };
    let attack_frames = ((0.03 * rate) as usize).max(1);
    let release_frames = ((0.12 * rate) as usize).min(frames / 4).max(1);
    let release_start = frames.saturating_sub(release_frames);
    for frame in 0..frames {
        let attack = (frame as f64 / attack_frames as f64).min(1.0);
        let release = if frame >= release_start {
            1.0 - (frame - release_start) as f64 / release_frames as f64
        } else {
            1.0
        };
        controls.mouth_pressure_pa = pressure_pa * attack * release;
        let excess_kpa = ((controls.mouth_pressure_pa - 5_500.0) / 1_000.0).clamp(0.0, 5.0);
        controls.lip_resonance_hz = lip_base_hz * tpt_lip_comp_multiplier(midi, excess_kpa);
        controls.lip_damping_ratio =
            (1.0 / 3.0 + TPT_DAMPING_SLOPE_PER_KPA * excess_kpa).clamp(0.05, 0.95);
        if frame == attack_frames {
            if model.seed_open_normal_regime(100.0).is_err() {
                return 0;
            }
            controls.tongue_contact = 0.0;
        }
        let sample = match model.process_sample(controls) {
            Ok(sample) => sample,
            // A positive return is a complete playable render.  Do not make a
            // solver failure look like a valid, merely shorter note: callers
            // cache any positive frame count as audio.
            Err(_) => return 0,
        };
        let value = sample as f32;
        if !value.is_finite() {
            return 0;
        }
        out_left[frame] = value;
        out_right[frame] = value;
    }
    frames as i32
}
