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
//! - one outward-striking lip degree of freedom, integrated with average-
//!   acceleration Newmark inside a bounded implicit lip/cup/throat solve;
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

use libm::{cos, exp, fabs, sqrt, tan};

const PI: f64 = core::f64::consts::PI;

/// Frozen PHS5 work bound.  At 1.47 m, 128 cells resolve travelling-wave
/// content through roughly 15 kHz; the former 48-cell grid imposed a spatial
/// Nyquist ceiling near 5.6 kHz and could not represent the specified loud-
/// brass spectral centroid regardless of solver quality.
pub const BORE_CELLS: usize = 128;
/// The nonlinear propagation and lip/bore coupling run at this factor.
pub const OVERSAMPLE_FACTOR: usize = 8;
const ANTI_ALIAS_SECTIONS: usize = 6;
const MAX_LIP_NEWTON_ITERATIONS: usize = 8;
const MAX_LIP_BRACKET_INTERVALS: usize = 128;
const MAX_LIP_BISECTIONS: usize = 16;

const AIR_DENSITY_KG_M3: f64 = 1.2;
const SOUND_SPEED_M_S: f64 = 343.0;
const OPEN_LENGTH_M: f64 = 1.47;
const MOUTHPIECE_BACKBORE_ENTRY_RADIUS_M: f64 = 0.0025;
const LIP_CONTACT_SCALE_M: f64 = 2.5e-4;

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
pub const VALVE_COMPENSATION_M: [f64; 8] = [0.0, 0.0, 0.0, 0.004, 0.006, 0.012, 0.018, 0.027];

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
    /// Finite-rotation scale for pressure-force projected area. As the lip
    /// rotates outward it presents less area to the pressure difference,
    /// bounding ordinary-pressure opening without retuning the mechanical
    /// resonance after the fact.
    pub lip_force_rolloff_displacement_m: f64,
    /// Anatomical upper aperture. Contact with this finite excursion is
    /// dissipative, just like the existing closed-lip contact.
    pub maximum_lip_opening_m: f64,
    pub mouthpiece_compliance_m3_pa: f64,
    pub throat_inertance_pa_s2_m3: f64,
    pub throat_resistance_pa_s_m3: f64,
    pub throat_nonlinear_resistance_pa_s2_m6: f64,
    pub bore_loss_per_second: f64,
    pub nonlinear_coefficient: f64,
    pub valve_transition_energy_gain: f64,
    pub oversample_factor: usize,
}

impl TrumpetParameters {
    #[must_use]
    pub const fn canonical() -> Self {
        Self {
            // Effective one-mass lip plate from the validated time-domain
            // brass configuration (Berjamin et al., table 2).
            lip_mass_kg: 1.78e-4,
            lip_effective_area_m2: 1.0e-4,
            lip_width_m: 0.012,
            // A 2.75 mm roll radius is on the scale of the engaged lip tissue
            // depth; quadratic throat loss and finite contact bound the jet.
            lip_force_rolloff_displacement_m: 2.75e-3,
            // A two-millimetre effective upper aperture keeps the vibrating
            // lip pair inside the engaged embouchure; larger control openings
            // remain valid but begin against this dissipative contact.
            maximum_lip_opening_m: 2.0e-3,
            // A roughly 1.4 cm3 cup: C=V/(rho*c^2).
            mouthpiece_compliance_m3_pa: 1.0e-11,
            // A 36 mm effective throat at the standard 3.6 mm diameter:
            // L=rho*length/area. The following 80 mm backbore is distributed
            // in bore_radius_m rather than hidden in this lump.
            throat_inertance_pa_s2_m3: 4_200.0,
            throat_resistance_pa_s_m3: 3.0e5,
            // Effective quadratic loss after pressure recovery through the
            // distributed backbore; it remains strictly dissipative.
            throat_nonlinear_resistance_pa_s2_m6: 5.0e8,
            bore_loss_per_second: 2.4,
            // beta=(gamma+1)/2 for air with gamma=1.403.
            nonlinear_coefficient: 1.2015,
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
            self.lip_force_rolloff_displacement_m,
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
    base + compensation
}

/// Half-wave estimate used only as a geometry diagnostic.  The live model
/// advances the full variable-area bore; it does not replace it with this
/// formula or alter it to match a MIDI pitch.
#[must_use]
pub fn geometry_half_wave_hz(valves: [f64; 3]) -> f64 {
    SOUND_SPEED_M_S / (2.0 * (OPEN_LENGTH_M + valve_added_length_m(valves)))
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

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LipSolveReport {
    pub newton_iterations: usize,
    pub bracket_evaluations: usize,
    pub fallback_bisections: usize,
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
    volume_flow_m3_s: [f64; BORE_CELLS + 1],
    base_cell_length_m: [f64; BORE_CELLS],
    cell_length_m: [f64; BORE_CELLS],
    cell_area_m2: [f64; BORE_CELLS],
    face_area_m2: [f64; BORE_CELLS + 1],
    valve_weights: [f64; BORE_CELLS],
    valve_position: [f64; 3],
    cup_pressure_pa: f64,
    lip_displacement_m: f64,
    lip_velocity_m_s: f64,
    lip_acceleration_m_s2: f64,
    throat_flow_m3_s: f64,
    bell_memory_flow_m3_s: f64,
    previous_bell_flow_m3_s: f64,
    bell_resistance_pa_s_m3: f64,
    bell_corner_rad_s: f64,
    decimator: OversampledOutput,
    last_lip_report: LipSolveReport,
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
        let mut base_cell_length_m = [OPEN_LENGTH_M / BORE_CELLS as f64; BORE_CELLS];
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
        // A trumpet bell is a flanged opening; 0.82*r is the low-frequency
        // flanged-pipe radiation end correction (the unflanged 0.61*r value
        // is too short for this termination).
        let bell_corner_rad_s = SOUND_SPEED_M_S / (0.82 * bell_radius);
        let internal_sample_rate_hz = output_sample_rate_hz * OVERSAMPLE_FACTOR as f64;
        let decimator =
            OversampledOutput::new(output_sample_rate_hz, parameters.oversample_factor)?;
        // Keep the binding explicit even if later geometry becomes nonuniform.
        base_cell_length_m[BORE_CELLS - 1] =
            OPEN_LENGTH_M - base_cell_length_m[..BORE_CELLS - 1].iter().sum::<f64>();
        let cell_length_m = base_cell_length_m;
        Ok(Self {
            output_sample_rate_hz,
            internal_sample_rate_hz,
            parameters,
            pressure_pa: [0.0; BORE_CELLS],
            volume_flow_m3_s: [0.0; BORE_CELLS + 1],
            base_cell_length_m,
            cell_length_m,
            cell_area_m2,
            face_area_m2,
            valve_weights,
            valve_position: [0.0; 3],
            cup_pressure_pa: 0.0,
            lip_displacement_m: 0.0,
            lip_velocity_m_s: 0.0,
            lip_acceleration_m_s2: 0.0,
            throat_flow_m3_s: 0.0,
            bell_memory_flow_m3_s: 0.0,
            previous_bell_flow_m3_s: 0.0,
            bell_resistance_pa_s_m3,
            bell_corner_rad_s,
            decimator,
            last_lip_report: LipSolveReport {
                newton_iterations: 0,
                bracket_evaluations: 0,
                fallback_bisections: 0,
            },
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
    pub fn last_lip_report(&self) -> LipSolveReport {
        self.last_lip_report
    }

    /// Total represented storage.  Radiation and viscothermal terms dissipate
    /// energy and therefore are intentionally absent from this storage sum.
    #[must_use]
    pub fn stored_energy_j(&self, controls: TrumpetControls) -> f64 {
        let omega = 2.0 * PI * controls.lip_resonance_hz;
        let lip_stiffness = self.parameters.lip_mass_kg * omega * omega;
        let upper_penetration_m = (controls.equilibrium_opening_m + self.lip_displacement_m
            - self.parameters.maximum_lip_opening_m)
            .max(0.0);
        let lip_contact_stiffness = lip_stiffness / (LIP_CONTACT_SCALE_M * LIP_CONTACT_SCALE_M);
        let mut energy =
            0.5 * self.parameters.lip_mass_kg * self.lip_velocity_m_s * self.lip_velocity_m_s
                + 0.5 * lip_stiffness * self.lip_displacement_m * self.lip_displacement_m
                + 0.25 * lip_contact_stiffness * upper_penetration_m.powi(4)
                + 0.5
                    * self.parameters.mouthpiece_compliance_m3_pa
                    * self.cup_pressure_pa
                    * self.cup_pressure_pa
                + 0.5
                    * self.parameters.throat_inertance_pa_s2_m3
                    * self.throat_flow_m3_s
                    * self.throat_flow_m3_s;
        for cell in 0..BORE_CELLS {
            let volume = self.cell_area_m2[cell] * self.cell_length_m[cell];
            energy += volume * self.pressure_pa[cell] * self.pressure_pa[cell]
                / (2.0 * AIR_DENSITY_KG_M3 * SOUND_SPEED_M_S * SOUND_SPEED_M_S);
        }
        for face in 1..BORE_CELLS {
            let dx = 0.5 * (self.cell_length_m[face - 1] + self.cell_length_m[face]);
            energy += AIR_DENSITY_KG_M3 * dx * self.volume_flow_m3_s[face].powi(2)
                / (2.0 * self.face_area_m2[face]);
        }
        // Storage for Z(s)=R*s/(s+w): E=R*q^2/(2w).
        energy += self.bell_resistance_pa_s_m3 * self.bell_memory_flow_m3_s.powi(2)
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
        output.ok_or(TrumpetError::OversamplingBypassed)
    }

    fn process_substep(&mut self, controls: TrumpetControls) -> Result<f64, TrumpetError> {
        let dt = 1.0 / self.internal_sample_rate_hz;
        self.advance_valves(controls.valves, dt);
        self.solve_lip_cup(controls, dt)?;

        let damping = exp(-self.parameters.bore_loss_per_second * dt);
        for face in 1..BORE_CELLS {
            let dx = 0.5 * (self.cell_length_m[face - 1] + self.cell_length_m[face]);
            let pressure_gradient = self.pressure_pa[face] - self.pressure_pa[face - 1];
            let acceleration =
                -self.face_area_m2[face] * pressure_gradient / (AIR_DENSITY_KG_M3 * dx);
            self.volume_flow_m3_s[face] =
                damping * (self.volume_flow_m3_s[face] + dt * acceleration);
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
            let compliance_inverse = AIR_DENSITY_KG_M3 * SOUND_SPEED_M_S * SOUND_SPEED_M_S
                / (self.cell_area_m2[cell] * self.cell_length_m[cell]);
            *next = damping * self.pressure_pa[cell] - dt * compliance_inverse * divergence;
        }
        self.apply_tvd_nonlinearity(&mut next_pressure, dt);
        self.pressure_pa = next_pressure;

        if !self.state_is_finite() {
            return Err(TrumpetError::NonFiniteState);
        }
        // On-axis far field of the bell aperture at one metre. The monopole
        // relation p=rho/(2*pi*r) dU/dt is coupled to the positive-real load
        // above, so it includes the real trumpet bell's frequency-dependent
        // radiation/directivity instead of assuming frequency-independent
        // hemispherical spreading. The derivative is inside the mandatory
        // four-times-rate antialias boundary.
        let far_field_pressure_pa = AIR_DENSITY_KG_M3 * bell_flow_derivative_m3_s2 / (2.0 * PI);
        Ok(far_field_pressure_pa / 20.0)
    }

    fn advance_valves(&mut self, target: [f64; 3], dt: f64) {
        let max_travel_per_substep = dt / 0.018;
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
        }
        for face in 1..BORE_CELLS {
            let old_dx = 0.5 * (previous_lengths[face - 1] + previous_lengths[face]);
            let new_dx = 0.5 * (self.cell_length_m[face - 1] + self.cell_length_m[face]);
            self.volume_flow_m3_s[face] *=
                sqrt(old_dx / new_dx * self.parameters.valve_transition_energy_gain);
        }
    }

    fn solve_lip_cup(&mut self, controls: TrumpetControls, dt: f64) -> Result<(), TrumpetError> {
        let old_pressure = self.cup_pressure_pa;
        let old_lip_flow =
            self.lip_flow_for_state(controls, old_pressure, self.lip_displacement_m)?;
        let residual = |candidate_pressure: f64| -> Result<(f64, LipCandidate), TrumpetError> {
            let candidate = self.lip_candidate(controls, candidate_pressure, dt)?;
            let lip_flow =
                self.lip_flow_for_state(controls, candidate_pressure, candidate.displacement_m)?;
            let r = self.parameters.throat_resistance_pa_s_m3;
            let r2 = self.parameters.throat_nonlinear_resistance_pa_s2_m6;
            let l = self.parameters.throat_inertance_pa_s2_m3;
            let throat_linear = 1.0 + 0.5 * dt * r / l;
            let throat_quadratic = 0.5 * dt * r2 / l;
            let throat_right_hand_side = (1.0 - 0.5 * dt * r / l) * self.throat_flow_m3_s
                - throat_quadratic * fabs(self.throat_flow_m3_s) * self.throat_flow_m3_s
                + dt / l * (0.5 * (old_pressure + candidate_pressure) - self.pressure_pa[0]);
            let throat_flow = if throat_quadratic > 0.0 {
                let magnitude = (sqrt(
                    throat_linear * throat_linear
                        + 4.0 * throat_quadratic * fabs(throat_right_hand_side),
                ) - throat_linear)
                    / (2.0 * throat_quadratic);
                throat_right_hand_side.signum() * magnitude
            } else {
                throat_right_hand_side / throat_linear
            };
            let cup_residual = candidate_pressure
                - old_pressure
                - 0.5 * dt / self.parameters.mouthpiece_compliance_m3_pa
                    * ((old_lip_flow - self.throat_flow_m3_s) + (lip_flow - throat_flow));
            Ok((
                cup_residual,
                LipCandidate {
                    throat_flow_m3_s: throat_flow,
                    ..candidate
                },
            ))
        };

        let mut pressure = old_pressure;
        let mut accepted = None;
        let mut newton_iterations = 0;
        for iteration in 0..MAX_LIP_NEWTON_ITERATIONS {
            newton_iterations = iteration + 1;
            let (value, candidate) = residual(pressure)?;
            let tolerance = 1.0e-8 * (1.0 + fabs(pressure));
            if fabs(value) <= tolerance {
                accepted = Some(candidate);
                break;
            }
            let epsilon = 1.0e-4 * (1.0 + fabs(pressure));
            let derivative = (residual(pressure + epsilon)?.0 - value) / epsilon;
            if !derivative.is_finite() || fabs(derivative) < 1.0e-10 {
                break;
            }
            let next = pressure - value / derivative;
            if !next.is_finite() || next < old_pressure - 48_000.0 || next > old_pressure + 48_000.0
            {
                break;
            }
            pressure = next;
        }

        let mut fallback_bisections = 0;
        let mut bracket_evaluations = 0;
        if accepted.is_none() {
            // Strong resonances can drive the cup pressure beyond the mouth
            // pressure for a fraction of a cycle.  The trapezoidal update's
            // physically continuous root remains near the preceding cup
            // state, so bracket that state rather than an absolute pressure
            // interval.  This avoids rejecting a valid loud-cell root while
            // retaining a frozen, deterministic amount of work.
            let search_low = old_pressure - 48_000.0;
            let search_high = old_pressure + 48_000.0;
            let search_step = (search_high - search_low) / MAX_LIP_BRACKET_INTERVALS as f64;
            let mut previous_pressure = search_low;
            let mut previous_value = residual(previous_pressure)?.0;
            bracket_evaluations = 1;
            let mut bracket = None;
            let mut bracket_distance = f64::INFINITY;
            for interval in 1..=MAX_LIP_BRACKET_INTERVALS {
                let candidate_pressure = search_low + interval as f64 * search_step;
                let candidate_value = residual(candidate_pressure)?.0;
                bracket_evaluations += 1;
                if previous_value.signum() != candidate_value.signum()
                    || previous_value == 0.0
                    || candidate_value == 0.0
                {
                    let distance =
                        fabs(0.5 * (previous_pressure + candidate_pressure) - old_pressure);
                    if distance < bracket_distance {
                        bracket = Some((previous_pressure, candidate_pressure, previous_value));
                        bracket_distance = distance;
                    }
                }
                previous_pressure = candidate_pressure;
                previous_value = candidate_value;
            }
            let (mut low, mut high, mut low_value) =
                bracket.ok_or(TrumpetError::LipSolveDidNotConverge)?;
            let mut candidate = None;
            for iteration in 0..MAX_LIP_BISECTIONS {
                fallback_bisections = iteration + 1;
                let mid = 0.5 * (low + high);
                let (value, state) = residual(mid)?;
                candidate = Some(state);
                if value.signum() == low_value.signum() {
                    low = mid;
                    low_value = value;
                } else {
                    high = mid;
                }
            }
            accepted = candidate;
        }

        let candidate = accepted.ok_or(TrumpetError::LipSolveDidNotConverge)?;
        self.cup_pressure_pa = candidate.cup_pressure_pa;
        self.lip_displacement_m = candidate.displacement_m;
        self.lip_velocity_m_s = candidate.velocity_m_s;
        self.lip_acceleration_m_s2 = candidate.acceleration_m_s2;
        self.throat_flow_m3_s = candidate.throat_flow_m3_s;
        self.last_lip_report = LipSolveReport {
            newton_iterations,
            bracket_evaluations,
            fallback_bisections,
        };
        Ok(())
    }

    fn lip_candidate(
        &self,
        controls: TrumpetControls,
        cup_pressure_pa: f64,
        dt: f64,
    ) -> Result<LipCandidate, TrumpetError> {
        let beta = 0.25;
        let gamma = 0.5;
        let omega = 2.0 * PI * controls.lip_resonance_hz;
        let mass = self.parameters.lip_mass_kg;
        let stiffness = mass * omega * omega;
        let damping = 2.0 * controls.lip_damping_ratio * mass * omega;
        if damping <= 0.0 {
            return Err(TrumpetError::NonPositiveLipDamping);
        }
        let displacement_predictor = self.lip_displacement_m
            + dt * self.lip_velocity_m_s
            + dt * dt * (0.5 - beta) * self.lip_acceleration_m_s2;
        let velocity_predictor =
            self.lip_velocity_m_s + dt * (1.0 - gamma) * self.lip_acceleration_m_s2;
        // Outward sign: positive mouth-minus-cup pressure opens the channel.
        // Finite rotation and upper-aperture contact are displacement-
        // dependent restoring forces, so they belong inside (not one step
        // behind) the average-acceleration Newmark solve.  Their combined
        // residual is monotone for positive blowing pressure: projected area
        // falls with opening while the cubic tissue contact rises.  A bounded
        // Newton solve therefore resolves hard lip collisions without the
        // explicit-contact energy burst that previously destroyed loud cells.
        let pressure_difference_pa = controls.mouth_pressure_pa - cup_pressure_pa;
        let denominator = mass + gamma * dt * damping + beta * dt * dt * stiffness;
        let newmark_compliance = beta * dt * dt / denominator;
        let constant_force = -damping * velocity_predictor - stiffness * displacement_predictor;
        let contact_stiffness = stiffness / (LIP_CONTACT_SCALE_M * LIP_CONTACT_SCALE_M);
        let mut displacement = self.lip_displacement_m;
        for _ in 0..8 {
            let positive_displacement_m = displacement.max(0.0);
            let rotation =
                positive_displacement_m / self.parameters.lip_force_rolloff_displacement_m;
            let rotation_denominator = 1.0 + rotation * rotation;
            let projected_area_m2 = self.parameters.lip_effective_area_m2 / rotation_denominator;
            let projected_area_slope_m = if displacement > 0.0 {
                -2.0 * self.parameters.lip_effective_area_m2 * displacement
                    / (self.parameters.lip_force_rolloff_displacement_m
                        * self.parameters.lip_force_rolloff_displacement_m
                        * rotation_denominator
                        * rotation_denominator)
            } else {
                0.0
            };
            let upper_penetration_m = (controls.equilibrium_opening_m + displacement
                - self.parameters.maximum_lip_opening_m)
                .max(0.0);
            let contact_force = contact_stiffness * upper_penetration_m.powi(3);
            let contact_slope_n_m = 3.0 * contact_stiffness * upper_penetration_m.powi(2);
            let force = projected_area_m2 * pressure_difference_pa - contact_force;
            let force_slope_n_m =
                projected_area_slope_m * pressure_difference_pa - contact_slope_n_m;
            let residual = displacement
                - displacement_predictor
                - newmark_compliance * (force + constant_force);
            let residual_slope = 1.0 - newmark_compliance * force_slope_n_m;
            let correction = residual / residual_slope;
            displacement -= correction;
            if fabs(correction) <= 1.0e-12 {
                break;
            }
        }
        let mut final_acceleration = (displacement - displacement_predictor) / (beta * dt * dt);
        let mut velocity = velocity_predictor + gamma * dt * final_acceleration;
        if displacement < -controls.equilibrium_opening_m {
            displacement = -controls.equilibrium_opening_m;
            velocity = 0.0;
            final_acceleration = 0.0;
        }
        Ok(LipCandidate {
            cup_pressure_pa,
            displacement_m: displacement,
            velocity_m_s: velocity,
            acceleration_m_s2: final_acceleration,
            throat_flow_m3_s: self.throat_flow_m3_s,
        })
    }

    fn lip_flow_for_state(
        &self,
        controls: TrumpetControls,
        cup_pressure_pa: f64,
        displacement_m: f64,
    ) -> Result<f64, TrumpetError> {
        let opening = (controls.equilibrium_opening_m + displacement_m).max(0.0);
        let tongue_open_fraction = (1.0 - controls.tongue_contact).powi(2);
        Ok(tongue_open_fraction
            * lip_flow_m3_s(
                self.parameters.lip_width_m,
                opening,
                controls.mouth_pressure_pa - cup_pressure_pa,
            )?)
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
        for cell in 0..BORE_CELLS {
            let left_velocity = self.volume_flow_m3_s[cell] / self.face_area_m2[cell];
            let right_velocity = self.volume_flow_m3_s[cell + 1] / self.face_area_m2[cell + 1];
            let particle_velocity = 0.5 * (left_velocity + right_velocity);
            previous_particle_velocity[cell] = particle_velocity;
            let impedance_velocity = AIR_DENSITY_KG_M3 * SOUND_SPEED_M_S * particle_velocity;
            outgoing_pressure[cell] = 0.5 * (pressure[cell] + impedance_velocity);
            incoming_pressure[cell] = 0.5 * (pressure[cell] - impedance_velocity);
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
            pressure[cell] = outgoing_pressure[cell] + incoming_pressure[cell];
            let particle_velocity = (outgoing_pressure[cell] - incoming_pressure[cell])
                / (AIR_DENSITY_KG_M3 * SOUND_SPEED_M_S);
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
            && self.volume_flow_m3_s.iter().all(|value| value.is_finite())
            && self.cup_pressure_pa.is_finite()
            && self.lip_displacement_m.is_finite()
            && self.lip_velocity_m_s.is_finite()
            && self.lip_acceleration_m_s2.is_finite()
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
}

#[derive(Clone, Copy)]
struct LipCandidate {
    cup_pressure_pa: f64,
    displacement_m: f64,
    velocity_m_s: f64,
    acceleration_m_s2: f64,
    throat_flow_m3_s: f64,
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
        slopes[cell] = minmod(state[cell] - state[cell - 1], state[cell + 1] - state[cell]);
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
        advanced[cell] = state[cell] - dt / cell_length_m[cell] * (flux[cell + 1] - flux[cell]);
    }
    advanced
}
