//! Dark physical vibraphone core.
//!
//! Each MIDI key selects a distinct reviewed modal record; it never retunes
//! one delay line or one simulated bar state to the requested frequency.  The
//! compact representation is deliberately honest about its boundary: it is a
//! per-key modal reduction, not an online Euler-Bernoulli/Timoshenko solver.
//! It retains the
//! mechanisms that identify a vibraphone rather than a generic sine bell:
//!
//! - a reviewed aluminium-bar mode pack whose first three partials are tuned
//!   near 1:4:9.88 and whose remaining dispersive modes are retained;
//! - finite compliant mallet contact, with hardness changing contact width and
//!   duration instead of being replaced by an output EQ;
//! - a passive bar-to-quarter-wave resonator port;
//! - a positive damper-felt conductance controlled by the pedal; and
//! - rotating resonator fans that modulate radiated aperture only, never the
//!   mechanical state or pitch.
//!
//! This module is deliberately dark.  It has no exported WASM entry point and
//! no recipe pointer until independent reference and browser checks exist.

use libm::{cos, exp, pow, sin, sqrt};

const PI: f64 = core::f64::consts::PI;
const TAU: f64 = 2.0 * PI;
const LN_1000: f64 = 6.907_755_278_982_137;

pub const BAR_MODES: usize = 7;
pub const MIN_MIDI: i32 = 53;
pub const MAX_MIDI: i32 = 89;
pub const MAX_FAN_RATE_HZ: f64 = 12.0;
const CONTACT_SOLVE_STEPS: usize = 8;
const RADIATION_DISTANCE_M: f64 = 1.0;

const ALUMINIUM_DENSITY_KG_M3: f64 = 2_700.0;
const SOUND_SPEED_M_S: f64 = 343.21;
const AIR_DENSITY_KG_M3: f64 = 1.2041;

/// Ratios measured for a professionally tuned, double-undercut vibraphone
/// family.  Modes two and three are the deliberate 4f and approximately 10f
/// tuning targets; upper modes remain dispersive rather than harmonic.
pub const MODE_RATIOS: [f64; BAR_MODES] = [1.0, 4.0, 9.88, 18.07, 29.32, 43.34, 59.84];

/// Authored PHS6 design anchors for the reviewed modal reduction.  Production
/// interpolates dimensions, modal ratios, and decay per key.  These are not
/// presented as output from a runtime beam eigensolver or as measured corpus
/// data; sample comparison remains a separate acceptance gate.
#[derive(Clone, Copy)]
struct ReviewedBarAnchor {
    midi: i32,
    length_m: f64,
    width_m: f64,
    thickness_m: f64,
    mode_3_ratio: f64,
    mode_4_ratio: f64,
    t60_seconds: [f64; 4],
}

const REVIEWED_BAR_ANCHORS: [ReviewedBarAnchor; 4] = [
    ReviewedBarAnchor {
        midi: 53,
        length_m: 0.490,
        width_m: 0.057,
        thickness_m: 0.013,
        mode_3_ratio: 9.88,
        mode_4_ratio: 18.1,
        t60_seconds: [7.5, 4.2, 2.3, 1.4],
    },
    ReviewedBarAnchor {
        midi: 60,
        length_m: 0.407,
        width_m: 0.052,
        thickness_m: 0.011,
        mode_3_ratio: 9.91,
        mode_4_ratio: 18.2,
        t60_seconds: [6.8, 3.8, 2.1, 1.2],
    },
    ReviewedBarAnchor {
        midi: 72,
        length_m: 0.292,
        width_m: 0.045,
        thickness_m: 0.009,
        mode_3_ratio: 9.95,
        mode_4_ratio: 18.3,
        t60_seconds: [5.4, 3.0, 1.7, 1.0],
    },
    ReviewedBarAnchor {
        midi: 89,
        length_m: 0.185,
        width_m: 0.036,
        thickness_m: 0.007,
        mode_3_ratio: 10.05,
        mode_4_ratio: 18.6,
        t60_seconds: [3.6, 2.1, 1.2, 0.7],
    },
];

/// A wide felt damper couples most strongly to the low flexural modes.
const DAMPER_SHAPE: [f64; BAR_MODES] = [1.0, 0.88, 0.72, 0.56, 0.43, 0.32, 0.24];

/// Bar radiation grows with mode frequency but rolls off once the wavelength
/// approaches the finite bar width.
const BAR_RADIATION_SHAPE: [f64; BAR_MODES] = [0.10, -0.18, 0.23, -0.24, 0.22, -0.18, 0.14];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VibesError {
    InvalidMidi,
    InvalidSampleRate,
    InvalidVelocity,
    InvalidHardness,
    InvalidContact,
    InvalidPedal,
    InvalidMotor,
    NonPassiveDamper,
    NonPassiveResonator,
    NonFiniteState,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BarGeometry {
    pub midi: i32,
    pub fundamental_hz: f64,
    pub length_m: f64,
    pub width_m: f64,
    pub thickness_m: f64,
    pub mass_kg: f64,
    pub resonator_length_m: f64,
    pub resonator_radius_m: f64,
    pub mode_ratios: [f64; BAR_MODES],
    pub t60_seconds: [f64; BAR_MODES],
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct StrikeGesture {
    pub velocity: i32,
    /// 0 is a very soft yarn mallet; 1 is a hard cord mallet.
    pub hardness: f64,
    pub contact_duration_seconds: f64,
    /// Kinetic energy available from the mallet head immediately before
    /// contact.  The Hertz indentation is derived from this energy and the
    /// contact stiffness, so a harder mallet redistributes a comparable
    /// strike energy instead of becoming artificially quieter.
    pub impact_energy_j: f64,
    pub mallet_mass_kg: f64,
    pub strike_velocity_m_per_s: f64,
    pub strike_position_over_length: f64,
    pub head_radius_m: f64,
    pub peak_force_n: f64,
    pub contact_stiffness_n_per_m_pow_3_over_2: f64,
    pub contact_damping_seconds_per_m: f64,
}

impl StrikeGesture {
    pub fn from_velocity(velocity: i32, hardness: f64) -> Result<Self, VibesError> {
        if !(1..=127).contains(&velocity) {
            return Err(VibesError::InvalidVelocity);
        }
        if !hardness.is_finite() || !(0.0..=1.0).contains(&hardness) {
            return Err(VibesError::InvalidHardness);
        }
        let v = velocity as f64 / 127.0;
        // Harder mallets compress for less time and have higher Hertzian
        // stiffness.  Velocity changes force, not the bar's damping law.
        let contact_duration_seconds = 0.0065 - 0.0038 * hardness;
        let stiffness = 2.2e6 * (1.0 + 5.0 * hardness);
        let mallet_speed_m_s = 0.45 + 3.0 * v;
        let mallet_mass_kg = 0.028;
        let impact_energy_j = 0.5 * mallet_mass_kg * mallet_speed_m_s * mallet_speed_m_s;
        let indentation_m = pow(2.5 * impact_energy_j / stiffness, 0.4);
        let peak_force_n = stiffness * pow(indentation_m, 1.5);
        Ok(Self {
            velocity,
            hardness,
            contact_duration_seconds,
            impact_energy_j,
            mallet_mass_kg,
            strike_velocity_m_per_s: mallet_speed_m_s,
            strike_position_over_length: 0.5,
            head_radius_m: 0.018 - 0.010 * hardness,
            peak_force_n,
            contact_stiffness_n_per_m_pow_3_over_2: stiffness,
            contact_damping_seconds_per_m: 8.0 + 12.0 * (1.0 - hardness),
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct VibesControls {
    /// 0: pedal up, felt touching the bars.  1: pedal down, bars free.
    pub pedal_position: f64,
    /// Mechanical fan rotation rate.  Zero stops in the current position.
    pub motor_hz: f64,
    /// Fractional radiating-aperture modulation, 0..1.
    pub fan_depth: f64,
}

impl VibesControls {
    pub const PEDAL_DOWN_MOTOR_OFF: Self = Self {
        pedal_position: 1.0,
        motor_hz: 0.0,
        fan_depth: 0.0,
    };

    fn validate(self) -> Result<Self, VibesError> {
        if !self.pedal_position.is_finite() || !(0.0..=1.0).contains(&self.pedal_position) {
            return Err(VibesError::InvalidPedal);
        }
        if !self.motor_hz.is_finite()
            || !(0.0..=MAX_FAN_RATE_HZ).contains(&self.motor_hz)
            || !self.fan_depth.is_finite()
            || !(0.0..=1.0).contains(&self.fan_depth)
        {
            return Err(VibesError::InvalidMotor);
        }
        Ok(self)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct VibesParameters {
    pub damper_conductance_kg_per_s: f64,
    pub resonator_conductance_kg_per_s: f64,
    pub resonator_q: f64,
}

impl VibesParameters {
    pub const fn canonical() -> Self {
        Self {
            damper_conductance_kg_per_s: 22.0,
            resonator_conductance_kg_per_s: 1.7,
            resonator_q: 38.0,
        }
    }

    fn validate(self) -> Result<Self, VibesError> {
        if !self.damper_conductance_kg_per_s.is_finite() || self.damper_conductance_kg_per_s < 0.0 {
            return Err(VibesError::NonPassiveDamper);
        }
        if !self.resonator_conductance_kg_per_s.is_finite()
            || self.resonator_conductance_kg_per_s <= 0.0
            || !self.resonator_q.is_finite()
            || self.resonator_q <= 0.0
        {
            return Err(VibesError::NonPassiveResonator);
        }
        Ok(self)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct VibesOutput {
    pub bar_radiation_velocity_m_per_s: f64,
    pub resonator_volume_velocity_m3_per_s: f64,
    pub mixed_radiation: f64,
    pub radiated_pressure_pa: f64,
    pub fan_aperture: f64,
    pub contact_force_n: f64,
    pub mechanical_energy_j: f64,
}

#[derive(Clone, Copy, Debug)]
struct Mode {
    active: bool,
    position: f64,
    velocity: f64,
    frequency_hz: f64,
    omega: f64,
    rotation_cos: f64,
    rotation_sin: f64,
    half_velocity_decay: f64,
    strike_residue: f64,
    damper_residue: f64,
    radiation_residue: f64,
}

impl Mode {
    const ZERO: Self = Self {
        active: false,
        position: 0.0,
        velocity: 0.0,
        frequency_hz: 0.0,
        omega: 1.0,
        rotation_cos: 1.0,
        rotation_sin: 0.0,
        half_velocity_decay: 1.0,
        strike_residue: 0.0,
        damper_residue: 0.0,
        radiation_residue: 0.0,
    };

    fn energy_j(self) -> f64 {
        0.5 * (self.velocity * self.velocity
            + self.omega * self.omega * self.position * self.position)
    }

    fn rotate(&mut self) {
        let x = self.position;
        let v = self.velocity;
        self.position = self.rotation_cos * x + self.rotation_sin * v / self.omega;
        self.velocity = -self.omega * self.rotation_sin * x + self.rotation_cos * v;
    }
}

#[derive(Clone, Copy, Debug)]
struct ResonatorMode {
    position: f64,
    velocity: f64,
    omega: f64,
    rotation_cos: f64,
    rotation_sin: f64,
    half_velocity_decay: f64,
    port_residue: f64,
    volume_velocity_residue: f64,
}

impl ResonatorMode {
    fn energy_j(self) -> f64 {
        0.5 * (self.velocity * self.velocity
            + self.omega * self.omega * self.position * self.position)
    }

    fn rotate(&mut self) {
        let x = self.position;
        let v = self.velocity;
        self.position = self.rotation_cos * x + self.rotation_sin * v / self.omega;
        self.velocity = -self.omega * self.rotation_sin * x + self.rotation_cos * v;
    }
}

#[derive(Clone, Copy, Debug)]
struct ContactState {
    active: bool,
    gesture: StrikeGesture,
    elapsed_frames: u32,
    maximum_frames: u32,
    mallet_position_m: f64,
    mallet_velocity_m_per_s: f64,
    compression_m: f64,
    dissipated_energy_j: f64,
}

impl ContactState {
    const INACTIVE: Self = Self {
        active: false,
        gesture: StrikeGesture {
            velocity: 1,
            hardness: 0.0,
            contact_duration_seconds: 0.004,
            impact_energy_j: 0.0,
            mallet_mass_kg: 0.028,
            strike_velocity_m_per_s: 0.0,
            strike_position_over_length: 0.5,
            head_radius_m: 0.012,
            peak_force_n: 0.0,
            contact_stiffness_n_per_m_pow_3_over_2: 1.0,
            contact_damping_seconds_per_m: 0.0,
        },
        elapsed_frames: 0,
        maximum_frames: 0,
        mallet_position_m: 0.0,
        mallet_velocity_m_per_s: 0.0,
        compression_m: 0.0,
        dissipated_energy_j: 0.0,
    };
}

#[derive(Clone, Debug)]
pub struct VibraphoneVoice {
    sample_rate_hz: f64,
    dt: f64,
    geometry: BarGeometry,
    parameters: VibesParameters,
    modes: [Mode; BAR_MODES],
    resonator: ResonatorMode,
    contact: ContactState,
    motor_phase: f64,
    cumulative_mallet_work_j: f64,
    cumulative_loss_j: f64,
    previous_radiated_volume_velocity_m3_per_s: f64,
    resolved_mode_count: usize,
}

impl VibraphoneVoice {
    pub fn new(
        midi: i32,
        sample_rate_hz: f64,
        parameters: VibesParameters,
    ) -> Result<Self, VibesError> {
        if !sample_rate_hz.is_finite() || !(8_000.0..=96_000.0).contains(&sample_rate_hz) {
            return Err(VibesError::InvalidSampleRate);
        }
        parameters.validate()?;
        let geometry = geometry_for_midi(midi)?;
        let dt = 1.0 / sample_rate_hz;
        let modal_mass = 0.5 * geometry.mass_kg;
        let modal_norm = 1.0 / sqrt(modal_mass);
        let mut modes = [Mode::ZERO; BAR_MODES];
        let mut resolved_mode_count = 0usize;
        for index in 0..BAR_MODES {
            let frequency_hz = geometry.fundamental_hz * geometry.mode_ratios[index];
            if frequency_hz >= 0.44 * sample_rate_hz {
                continue;
            }
            resolved_mode_count += 1;
            let omega = TAU * frequency_hz;
            let t60 = geometry.t60_seconds[index];
            modes[index] = Mode {
                active: true,
                position: 0.0,
                velocity: 0.0,
                frequency_hz,
                omega,
                rotation_cos: cos(omega * dt),
                rotation_sin: sin(omega * dt),
                // This factor is applied twice per sample around the exact
                // lossless rotation.  Each half step therefore carries half
                // of the requested -60 dB amplitude decay over T60.
                half_velocity_decay: exp(-LN_1000 * dt / t60),
                strike_residue: modal_norm,
                damper_residue: modal_norm * DAMPER_SHAPE[index],
                radiation_residue: modal_norm * BAR_RADIATION_SHAPE[index],
            };
        }
        if resolved_mode_count == 0 {
            return Err(VibesError::InvalidSampleRate);
        }

        let area = PI * geometry.resonator_radius_m * geometry.resonator_radius_m;
        let effective_resonator_length_m =
            geometry.resonator_length_m + 0.6133 * geometry.resonator_radius_m;
        let air_mass = AIR_DENSITY_KG_M3 * area * effective_resonator_length_m;
        let resonator_norm = 1.0 / sqrt(air_mass.max(1.0e-9));
        let resonator_frequency_hz = SOUND_SPEED_M_S / (4.0 * effective_resonator_length_m);
        let omega = TAU * resonator_frequency_hz;
        let resonator = ResonatorMode {
            position: 0.0,
            velocity: 0.0,
            omega,
            rotation_cos: cos(omega * dt),
            rotation_sin: sin(omega * dt),
            // Applied twice per sample; together the two factors realize the
            // canonical amplitude decay exp(-omega*dt/(2Q)).
            half_velocity_decay: exp(-omega * dt / (2.0 * parameters.resonator_q)),
            port_residue: resonator_norm,
            volume_velocity_residue: area * resonator_norm,
        };
        Ok(Self {
            sample_rate_hz,
            dt,
            geometry,
            parameters,
            modes,
            resonator,
            contact: ContactState::INACTIVE,
            motor_phase: 0.0,
            cumulative_mallet_work_j: 0.0,
            cumulative_loss_j: 0.0,
            previous_radiated_volume_velocity_m3_per_s: 0.0,
            resolved_mode_count,
        })
    }

    pub fn begin_strike(&mut self, gesture: StrikeGesture) -> Result<(), VibesError> {
        if !(1..=127).contains(&gesture.velocity) {
            return Err(VibesError::InvalidVelocity);
        }
        if !gesture.hardness.is_finite() || !(0.0..=1.0).contains(&gesture.hardness) {
            return Err(VibesError::InvalidHardness);
        }
        if !gesture.contact_duration_seconds.is_finite()
            || gesture.contact_duration_seconds < self.dt
            || gesture.contact_duration_seconds > 0.02
            || !gesture.impact_energy_j.is_finite()
            || !(0.0..=0.5).contains(&gesture.impact_energy_j)
            || !gesture.mallet_mass_kg.is_finite()
            || !(0.005..=0.08).contains(&gesture.mallet_mass_kg)
            || !gesture.strike_velocity_m_per_s.is_finite()
            || !(0.0..=8.0).contains(&gesture.strike_velocity_m_per_s)
            || !gesture.strike_position_over_length.is_finite()
            || !(0.05..=0.95).contains(&gesture.strike_position_over_length)
            || !gesture.head_radius_m.is_finite()
            || !(0.003..=0.03).contains(&gesture.head_radius_m)
            || !gesture.peak_force_n.is_finite()
            || !(0.0..=500.0).contains(&gesture.peak_force_n)
            || !gesture.contact_stiffness_n_per_m_pow_3_over_2.is_finite()
            || gesture.contact_stiffness_n_per_m_pow_3_over_2 <= 0.0
            || !gesture.contact_damping_seconds_per_m.is_finite()
            || !(0.0..=200.0).contains(&gesture.contact_damping_seconds_per_m)
        {
            return Err(VibesError::InvalidContact);
        }
        let stated_energy = 0.5
            * gesture.mallet_mass_kg
            * (gesture.strike_velocity_m_per_s * gesture.strike_velocity_m_per_s);
        let energy_tolerance = (1.0e-9_f64).max(0.01 * stated_energy);
        if (gesture.impact_energy_j - stated_energy).abs() > energy_tolerance {
            return Err(VibesError::InvalidContact);
        }
        let maximum_frames =
            libm::ceil(2.0 * gesture.contact_duration_seconds * self.sample_rate_hz) as u32;
        self.contact = ContactState {
            active: true,
            gesture,
            elapsed_frames: 0,
            maximum_frames: maximum_frames.max(1),
            mallet_position_m: self.strike_displacement(),
            mallet_velocity_m_per_s: gesture.strike_velocity_m_per_s,
            compression_m: 0.0,
            dissipated_energy_j: 0.0,
        };
        Ok(())
    }

    pub fn step(&mut self, controls: VibesControls) -> Result<VibesOutput, VibesError> {
        let controls = controls.validate()?;
        let contact_force = if self.contact.active {
            self.apply_contact()
        } else {
            0.0
        };

        self.apply_intrinsic_half_loss();
        self.apply_resonator_coupling(0.5 * self.dt);
        self.apply_damper(controls.pedal_position, 0.5 * self.dt);
        for mode in &mut self.modes {
            mode.rotate();
        }
        self.resonator.rotate();
        self.apply_damper(controls.pedal_position, 0.5 * self.dt);
        self.apply_resonator_coupling(0.5 * self.dt);
        self.apply_intrinsic_half_loss();

        let bar_radiation = self
            .modes
            .iter()
            .map(|mode| mode.radiation_residue * mode.velocity)
            .sum::<f64>();
        let tube_volume_velocity = self.resonator.volume_velocity_residue * self.resonator.velocity;
        let fan_aperture = 1.0 - 0.48 * controls.fan_depth
            + 0.48 * controls.fan_depth * (0.5 + 0.5 * sin(self.motor_phase));
        self.motor_phase += TAU * controls.motor_hz * self.dt;
        if self.motor_phase >= TAU {
            self.motor_phase -= TAU;
        }
        let bar_radiating_area_m2 = 0.18 * self.geometry.length_m * self.geometry.width_m;
        let bar_volume_velocity = bar_radiating_area_m2 * bar_radiation;
        let radiated_volume_velocity = bar_volume_velocity + fan_aperture * tube_volume_velocity;
        let volume_acceleration =
            (radiated_volume_velocity - self.previous_radiated_volume_velocity_m3_per_s) / self.dt;
        self.previous_radiated_volume_velocity_m3_per_s = radiated_volume_velocity;
        let radiated_pressure_pa =
            AIR_DENSITY_KG_M3 * volume_acceleration / (4.0 * PI * RADIATION_DISTANCE_M);
        if !radiated_pressure_pa.is_finite() || !self.total_energy_j().is_finite() {
            return Err(VibesError::NonFiniteState);
        }
        Ok(VibesOutput {
            bar_radiation_velocity_m_per_s: bar_radiation,
            resonator_volume_velocity_m3_per_s: tube_volume_velocity,
            mixed_radiation: radiated_pressure_pa,
            radiated_pressure_pa,
            fan_aperture,
            contact_force_n: contact_force,
            mechanical_energy_j: self.total_energy_j(),
        })
    }

    pub fn geometry(&self) -> BarGeometry {
        self.geometry
    }

    pub fn mode_frequency_hz(&self, index: usize) -> Option<f64> {
        self.modes
            .get(index)
            .and_then(|mode| mode.active.then_some(mode.frequency_hz))
    }

    pub fn mode_energy_j(&self, index: usize) -> Option<f64> {
        self.modes
            .get(index)
            .and_then(|mode| mode.active.then_some(mode.energy_j()))
    }

    pub fn resonator_frequency_hz(&self) -> f64 {
        self.resonator.omega / TAU
    }

    pub fn total_energy_j(&self) -> f64 {
        self.modes.iter().map(|mode| mode.energy_j()).sum::<f64>() + self.resonator.energy_j()
    }

    pub fn cumulative_mallet_work_j(&self) -> f64 {
        self.cumulative_mallet_work_j
    }

    pub fn cumulative_loss_j(&self) -> f64 {
        self.cumulative_loss_j
    }

    pub fn contact_active(&self) -> bool {
        self.contact.active
    }

    pub fn resolved_mode_count(&self) -> usize {
        self.resolved_mode_count
    }

    pub fn contact_energy_j(&self) -> f64 {
        let k = self.contact.gesture.contact_stiffness_n_per_m_pow_3_over_2;
        0.4 * k * pow(self.contact.compression_m.max(0.0), 2.5)
    }

    pub fn retained_mallet_energy_j(&self) -> f64 {
        0.5 * self.contact.gesture.mallet_mass_kg
            * self.contact.mallet_velocity_m_per_s
            * self.contact.mallet_velocity_m_per_s
            + self.contact_energy_j()
    }

    pub fn contact_dissipated_energy_j(&self) -> f64 {
        self.contact.dissipated_energy_j
    }

    #[cfg(test)]
    pub fn intrinsic_mode_energy_ratio_for_test(
        &self,
        index: usize,
        duration_seconds: f64,
    ) -> Option<f64> {
        let mut probe = self.clone();
        if index >= probe.modes.len() || !probe.modes[index].active {
            return None;
        }
        for mode in &mut probe.modes {
            mode.position = 0.0;
            mode.velocity = 0.0;
        }
        probe.resonator.position = 0.0;
        probe.resonator.velocity = 0.0;
        probe.modes[index].velocity = 1.0;
        let initial = probe.modes[index].energy_j();
        let frames = (duration_seconds * probe.sample_rate_hz).round() as usize;
        for _ in 0..frames {
            probe.modes[index].velocity *= probe.modes[index].half_velocity_decay;
            probe.modes[index].rotate();
            probe.modes[index].velocity *= probe.modes[index].half_velocity_decay;
        }
        Some(probe.modes[index].energy_j() / initial)
    }

    fn contact_residue(&self, index: usize) -> f64 {
        if !self.modes[index].active {
            return 0.0;
        }
        let centre = self.contact.gesture.strike_position_over_length;
        let half_patch = (self.contact.gesture.head_radius_m / self.geometry.length_m).min(0.12);
        /* Integrate the evaluated mode shape over the finite circular mallet
         * patch.  A soft, wide head therefore rejects short-wavelength modes
         * through contact geometry rather than an output-side brightness EQ. */
        const OFFSETS: [f64; 5] = [-1.0, -0.5, 0.0, 0.5, 1.0];
        const WEIGHTS: [f64; 5] = [1.0, 4.0, 2.0, 4.0, 1.0];
        let mut weighted = 0.0;
        for sample in 0..5 {
            let x = (centre + OFFSETS[sample] * half_patch).clamp(0.0, 1.0);
            weighted += WEIGHTS[sample] * bar_mode_shape(index, x);
        }
        self.modes[index].strike_residue * weighted / 12.0
    }

    fn strike_displacement(&self) -> f64 {
        self.modes
            .iter()
            .enumerate()
            .map(|(index, mode)| self.contact_residue(index) * mode.position)
            .sum()
    }

    fn strike_velocity(&self) -> f64 {
        self.modes
            .iter()
            .enumerate()
            .map(|(index, mode)| self.contact_residue(index) * mode.velocity)
            .sum()
    }

    fn apply_contact(&mut self) -> f64 {
        let gesture = self.contact.gesture;
        let bar_displacement = self.strike_displacement();
        let bar_velocity = self.strike_velocity();
        /* Compression is the retained contact coordinate advanced by the
         * same midpoint rule as the equal/opposite impulse.  Reconstructing
         * it from the bar's post-rotation displacement would teleport stored
         * Hertz energy between samples. */
        let compression = self.contact.compression_m.max(0.0);
        let relative_velocity = self.contact.mallet_velocity_m_per_s - bar_velocity;
        let mut residues = [0.0; BAR_MODES];
        let mut inverse_effective_mass = 1.0 / gesture.mallet_mass_kg;
        for (index, residue) in residues.iter_mut().enumerate() {
            *residue = self.contact_residue(index);
            inverse_effective_mass += *residue * *residue;
        }
        let effective_mass = 1.0 / inverse_effective_mass.max(1.0e-30);
        let stiffness = gesture.contact_stiffness_n_per_m_pow_3_over_2;
        let potential_before = contact_potential_j(stiffness, compression);

        /* Energy-consistent discrete-gradient contact.  The scalar impulse is
         * the only unknown because the mallet and every bar mode receive the
         * same equal-and-opposite power-port impulse.  Eight fixed bisections
         * are deterministic and honor the PHS6 solver budget. */
        let maximum_impulse = gesture.peak_force_n * self.dt;
        let mut lower = 0.0;
        let mut upper = maximum_impulse;
        let compression_at_upper = (compression
            + self.dt * (relative_velocity - 0.5 * upper * inverse_effective_mass))
            .max(0.0);
        let gradient_at_upper =
            contact_potential_gradient(stiffness, compression, compression_at_upper);
        if upper < self.dt * gradient_at_upper {
            /* The declared force cap cannot bracket the passive discrete-
             * gradient root.  Applying a capped midpoint here would create
             * mechanical energy.  Release the unilateral contact instead,
             * retaining the mallet kinetic energy and accounting for any
             * stored compression as felt loss. */
            self.contact.dissipated_energy_j += potential_before;
            self.contact.compression_m = 0.0;
            self.contact.mallet_position_m = bar_displacement;
            self.contact.active = false;
            return 0.0;
        }
        for _ in 0..CONTACT_SOLVE_STEPS {
            let impulse = 0.5 * (lower + upper);
            let compression_after = (compression
                + self.dt * (relative_velocity - 0.5 * impulse * inverse_effective_mass))
                .max(0.0);
            let gradient = contact_potential_gradient(stiffness, compression, compression_after);
            if impulse >= self.dt * gradient {
                upper = impulse;
            } else {
                lower = impulse;
            }
        }
        // `upper` is always the passive side of the bracket.  The midpoint
        // can remain slightly active after the fixed iteration budget.
        let conservative_impulse = upper;
        let compression_after_conservative = (compression
            + self.dt * (relative_velocity - 0.5 * conservative_impulse * inverse_effective_mass))
            .max(0.0);
        let relative_after_conservative =
            relative_velocity - conservative_impulse * inverse_effective_mass;
        let midpoint_compression = 0.5 * (compression + compression_after_conservative);
        let contact_force = stiffness * pow(midpoint_compression.max(0.0), 1.5);
        let damping_impulse = (gesture.contact_damping_seconds_per_m
            * contact_force
            * relative_after_conservative.max(0.0)
            * self.dt)
            .min(effective_mass * relative_after_conservative.max(0.0));
        let total_impulse = (conservative_impulse + damping_impulse).min(maximum_impulse);
        let compression_after = (compression
            + self.dt * (relative_velocity - 0.5 * total_impulse * inverse_effective_mass))
            .max(0.0);

        let bar_energy_before = self.total_energy_j();
        let contact_system_energy_before = bar_energy_before
            + 0.5
                * gesture.mallet_mass_kg
                * self.contact.mallet_velocity_m_per_s
                * self.contact.mallet_velocity_m_per_s
            + potential_before;
        for index in 0..BAR_MODES {
            self.modes[index].velocity += residues[index] * total_impulse;
        }
        self.contact.mallet_velocity_m_per_s -= total_impulse / gesture.mallet_mass_kg;
        self.contact.compression_m = compression_after;
        self.contact.mallet_position_m = bar_displacement + compression_after;
        let relative_after = relative_velocity - total_impulse * inverse_effective_mass;
        let bar_energy_after = self.total_energy_j();
        let contact_system_energy_after = bar_energy_after
            + 0.5
                * gesture.mallet_mass_kg
                * self.contact.mallet_velocity_m_per_s
                * self.contact.mallet_velocity_m_per_s
            + contact_potential_j(stiffness, compression_after);
        let energy_tolerance = 1.0e-12 * contact_system_energy_before.max(1.0);
        if contact_system_energy_after > contact_system_energy_before + energy_tolerance {
            /* A coarse sample interval can make the unilateral constraint
             * change branch inside one step.  If the bounded solve then
             * proposes an active update, undo the equal/opposite impulse and
             * release into felt loss.  This is a dissipative projection, not
             * an energy correction hidden in the output. */
            for index in 0..BAR_MODES {
                self.modes[index].velocity -= residues[index] * total_impulse;
            }
            self.contact.mallet_velocity_m_per_s += total_impulse / gesture.mallet_mass_kg;
            self.contact.dissipated_energy_j += potential_before;
            self.contact.compression_m = 0.0;
            self.contact.mallet_position_m = bar_displacement;
            self.contact.active = false;
            return 0.0;
        }
        self.contact.dissipated_energy_j +=
            (contact_system_energy_before - contact_system_energy_after).max(0.0);
        self.cumulative_mallet_work_j += (bar_energy_after - bar_energy_before).max(0.0);

        self.contact.elapsed_frames += 1;
        let separated = compression_after <= 1.0e-12 && relative_after <= 0.0;
        if separated || self.contact.elapsed_frames >= self.contact.maximum_frames {
            /* Any residual stored contact energy at the hard duration bound is
             * discarded as felt loss; it is never injected into the bar. */
            self.contact.dissipated_energy_j +=
                contact_potential_j(stiffness, self.contact.compression_m);
            self.contact.compression_m = 0.0;
            self.contact.active = false;
        }
        if potential_before == 0.0 && relative_velocity <= 0.0 {
            0.0
        } else {
            total_impulse / self.dt
        }
    }

    fn apply_intrinsic_half_loss(&mut self) {
        let before = self.total_energy_j();
        for mode in &mut self.modes {
            mode.velocity *= mode.half_velocity_decay;
        }
        self.resonator.velocity *= self.resonator.half_velocity_decay;
        let after = self.total_energy_j();
        self.cumulative_loss_j += (before - after).max(0.0);
    }

    fn apply_damper(&mut self, pedal_position: f64, duration_seconds: f64) {
        let conductance = self.parameters.damper_conductance_kg_per_s
            * (1.0 - pedal_position)
            * (1.0 - pedal_position);
        if conductance == 0.0 {
            return;
        }
        let norm_squared = self
            .modes
            .iter()
            .map(|mode| mode.damper_residue * mode.damper_residue)
            .sum::<f64>();
        let port_velocity = self
            .modes
            .iter()
            .map(|mode| mode.damper_residue * mode.velocity)
            .sum::<f64>();
        let decay = exp(-conductance * norm_squared * duration_seconds);
        let impulse = port_velocity * (1.0 - decay) / norm_squared.max(1.0e-30);
        let before = self.total_energy_j();
        for mode in &mut self.modes {
            mode.velocity -= mode.damper_residue * impulse;
        }
        let after = self.total_energy_j();
        self.cumulative_loss_j += (before - after).max(0.0);
    }

    fn apply_resonator_coupling(&mut self, duration_seconds: f64) {
        let bar_residue = self.modes[0].radiation_residue;
        let tube_residue = self.resonator.port_residue;
        let norm_squared = bar_residue * bar_residue + tube_residue * tube_residue;
        let delta = bar_residue * self.modes[0].velocity - tube_residue * self.resonator.velocity;
        let decay =
            exp(-self.parameters.resonator_conductance_kg_per_s * norm_squared * duration_seconds);
        let impulse = delta * (1.0 - decay) / norm_squared.max(1.0e-30);
        let before = self.total_energy_j();
        self.modes[0].velocity -= bar_residue * impulse;
        self.resonator.velocity += tube_residue * impulse;
        let after = self.total_energy_j();
        self.cumulative_loss_j += (before - after).max(0.0);
    }
}

pub const MAX_ACTIVE_BARS: usize = 48;
const FRAME_MODES: usize = 4;

#[derive(Clone, Copy, Debug)]
struct FrameMode {
    position: f64,
    velocity: f64,
    omega: f64,
    rotation_cos: f64,
    rotation_sin: f64,
    half_velocity_decay: f64,
}

impl FrameMode {
    fn new(frequency_hz: f64, sample_rate_hz: f64) -> Self {
        let dt = 1.0 / sample_rate_hz;
        let omega = TAU * frequency_hz;
        Self {
            position: 0.0,
            velocity: 0.0,
            omega,
            rotation_cos: cos(omega * dt),
            rotation_sin: sin(omega * dt),
            half_velocity_decay: exp(-LN_1000 * dt / 2.8),
        }
    }

    fn rotate(&mut self) {
        self.velocity *= self.half_velocity_decay;
        let x = self.position;
        let v = self.velocity;
        self.position = self.rotation_cos * x + self.rotation_sin * v / self.omega;
        self.velocity = -self.omega * self.rotation_sin * x + self.rotation_cos * v;
        self.velocity *= self.half_velocity_decay;
    }

    fn energy_j(self) -> f64 {
        0.5 * (self.velocity * self.velocity
            + self.omega * self.omega * self.position * self.position)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct VibraphoneStemOutput {
    pub radiated_pressure_pa: f64,
    pub active_bars: usize,
    pub total_mechanical_energy_j: f64,
    pub pedal_position: f64,
    pub fan_phase_radians: f64,
}

/// Stateful multi-bar instrument.  Bars, resonator tubes, shared frame modes,
/// pedal contact, and fan phase survive note boundaries.  The fixed-size
/// array is the no-allocation WASM state bound; all 37 playable MIDI bars fit
/// without eviction.
#[derive(Clone, Debug)]
pub struct VibraphoneStem {
    sample_rate_hz: f64,
    dt: f64,
    parameters: VibesParameters,
    voices: [Option<VibraphoneVoice>; MAX_ACTIVE_BARS],
    frame_modes: [FrameMode; FRAME_MODES],
    pedal_position: f64,
    fan_phase: f64,
    previous_frame_volume_velocity_m3_per_s: f64,
}

impl VibraphoneStem {
    pub fn new(sample_rate_hz: f64, parameters: VibesParameters) -> Result<Self, VibesError> {
        if !sample_rate_hz.is_finite() || !(8_000.0..=96_000.0).contains(&sample_rate_hz) {
            return Err(VibesError::InvalidSampleRate);
        }
        parameters.validate()?;
        Ok(Self {
            sample_rate_hz,
            dt: 1.0 / sample_rate_hz,
            parameters,
            voices: core::array::from_fn(|_| None),
            frame_modes: [
                FrameMode::new(82.0, sample_rate_hz),
                FrameMode::new(137.0, sample_rate_hz),
                FrameMode::new(223.0, sample_rate_hz),
                FrameMode::new(356.0, sample_rate_hz),
            ],
            pedal_position: 0.0,
            fan_phase: 0.0,
            previous_frame_volume_velocity_m3_per_s: 0.0,
        })
    }

    pub fn strike(&mut self, midi: i32, gesture: StrikeGesture) -> Result<(), VibesError> {
        let index = self.ensure_bar(midi)?;
        self.voices[index]
            .as_mut()
            .ok_or(VibesError::NonFiniteState)?
            .begin_strike(gesture)
    }

    pub fn retain_bar(&mut self, midi: i32) -> Result<(), VibesError> {
        self.ensure_bar(midi).map(|_| ())
    }

    fn ensure_bar(&mut self, midi: i32) -> Result<usize, VibesError> {
        let existing = self.voices.iter().position(|slot| {
            slot.as_ref()
                .is_some_and(|voice| voice.geometry().midi == midi)
        });
        let index = existing
            .or_else(|| self.voices.iter().position(Option::is_none))
            .ok_or(VibesError::NonFiniteState)?;
        if self.voices[index].is_none() {
            self.voices[index] = Some(VibraphoneVoice::new(
                midi,
                self.sample_rate_hz,
                self.parameters,
            )?);
        }
        Ok(index)
    }

    pub fn step(&mut self, controls: VibesControls) -> Result<VibraphoneStemOutput, VibesError> {
        let controls = controls.validate()?;
        let pedal_slew = 1.0 - exp(-self.dt / 0.020);
        self.pedal_position += pedal_slew * (controls.pedal_position - self.pedal_position);

        let mut pressure = 0.0;
        let mut active_bars = 0usize;
        for voice in self.voices.iter_mut().flatten() {
            active_bars += 1;
            voice.motor_phase = self.fan_phase;
            let output = voice.step(VibesControls {
                pedal_position: self.pedal_position,
                motor_hz: 0.0,
                fan_depth: controls.fan_depth,
            })?;
            pressure += output.radiated_pressure_pa;
        }

        /* Lossless orthogonal velocity rotations couple every retained bar to
         * the same frame modes.  Energy can move into an unstruck bar on a
         * later note, but this power port cannot create it. */
        for voice in self.voices.iter_mut().flatten() {
            for (frame_index, frame) in self.frame_modes.iter_mut().enumerate() {
                let angle = self.dt * (7.5 + 1.8 * frame_index as f64);
                let c = cos(angle);
                let s = sin(angle);
                let bar_velocity = voice.modes[0].velocity;
                let frame_velocity = frame.velocity;
                voice.modes[0].velocity = c * bar_velocity - s * frame_velocity;
                frame.velocity = s * bar_velocity + c * frame_velocity;
            }
        }
        for frame in &mut self.frame_modes {
            frame.rotate();
        }

        let frame_velocity = self
            .frame_modes
            .iter()
            .enumerate()
            .map(|(index, frame)| frame.velocity * (0.7 / (index as f64 + 1.0)))
            .sum::<f64>();
        let frame_volume_velocity = 0.006 * frame_velocity;
        let frame_volume_acceleration =
            (frame_volume_velocity - self.previous_frame_volume_velocity_m3_per_s) / self.dt;
        self.previous_frame_volume_velocity_m3_per_s = frame_volume_velocity;
        pressure +=
            AIR_DENSITY_KG_M3 * frame_volume_acceleration / (4.0 * PI * RADIATION_DISTANCE_M);

        self.fan_phase += TAU * controls.motor_hz * self.dt;
        if self.fan_phase >= TAU {
            self.fan_phase -= TAU;
        }
        let total_mechanical_energy_j = self.total_mechanical_energy_j();
        if !pressure.is_finite() || !total_mechanical_energy_j.is_finite() {
            return Err(VibesError::NonFiniteState);
        }
        Ok(VibraphoneStemOutput {
            radiated_pressure_pa: pressure,
            active_bars,
            total_mechanical_energy_j,
            pedal_position: self.pedal_position,
            fan_phase_radians: self.fan_phase,
        })
    }

    pub fn total_mechanical_energy_j(&self) -> f64 {
        self.voices
            .iter()
            .flatten()
            .map(VibraphoneVoice::total_energy_j)
            .sum::<f64>()
            + self
                .frame_modes
                .iter()
                .map(|mode| mode.energy_j())
                .sum::<f64>()
    }

    pub fn bar_energy_j(&self, midi: i32) -> Option<f64> {
        self.voices
            .iter()
            .flatten()
            .find_map(|voice| (voice.geometry().midi == midi).then(|| voice.total_energy_j()))
    }

    pub fn fan_phase_radians(&self) -> f64 {
        self.fan_phase
    }
}

pub fn midi_frequency_hz(midi: i32) -> f64 {
    440.0 * pow(2.0, (midi as f64 - 69.0) / 12.0)
}

pub fn geometry_for_midi(midi: i32) -> Result<BarGeometry, VibesError> {
    if !(MIN_MIDI..=MAX_MIDI).contains(&midi) {
        return Err(VibesError::InvalidMidi);
    }
    let fundamental_hz = midi_frequency_hz(midi);
    let (lower, upper, blend) = reviewed_anchor_span(midi);
    let length_m = lerp(lower.length_m, upper.length_m, blend);
    let width_m = lerp(lower.width_m, upper.width_m, blend);
    let thickness_m = lerp(lower.thickness_m, upper.thickness_m, blend);
    let mass_kg = ALUMINIUM_DENSITY_KG_M3 * width_m * thickness_m * length_m * 0.78;
    let mut mode_ratios = MODE_RATIOS;
    mode_ratios[2] = lerp(lower.mode_3_ratio, upper.mode_3_ratio, blend);
    mode_ratios[3] = lerp(lower.mode_4_ratio, upper.mode_4_ratio, blend);
    let upper_scale = mode_ratios[3] / 18.07;
    mode_ratios[4] *= upper_scale;
    mode_ratios[5] *= upper_scale;
    mode_ratios[6] *= upper_scale;
    let mut t60_seconds = [0.0; BAR_MODES];
    for (index, value) in t60_seconds.iter_mut().enumerate().take(4) {
        *value = lerp(lower.t60_seconds[index], upper.t60_seconds[index], blend);
    }
    t60_seconds[4] = (0.75 * t60_seconds[3]).max(0.45);
    t60_seconds[5] = (0.58 * t60_seconds[3]).max(0.40);
    t60_seconds[6] = (0.45 * t60_seconds[3]).max(0.35);
    // Every tube is cut from its own target frequency.  Interpolating tube
    // length linearly between sparse anchors detunes intermediate keys by as
    // much as a whole tone because quarter-wave frequency is reciprocal in
    // effective length.
    let effective_resonator_length_m = SOUND_SPEED_M_S / (4.0 * fundamental_hz);
    let range = (midi - MIN_MIDI) as f64 / (MAX_MIDI - MIN_MIDI) as f64;
    let resonator_radius_m = 0.031 - 0.010 * range;
    let end_correction_m = 0.6133 * resonator_radius_m;
    let resonator_length_m = (effective_resonator_length_m - end_correction_m).max(0.02);
    Ok(BarGeometry {
        midi,
        fundamental_hz,
        length_m,
        width_m,
        thickness_m,
        mass_kg,
        resonator_length_m,
        resonator_radius_m,
        mode_ratios,
        t60_seconds,
    })
}

fn reviewed_anchor_span(midi: i32) -> (ReviewedBarAnchor, ReviewedBarAnchor, f64) {
    for pair in REVIEWED_BAR_ANCHORS.windows(2) {
        let lower = pair[0];
        let upper = pair[1];
        if midi <= upper.midi {
            let blend = (midi - lower.midi) as f64 / (upper.midi - lower.midi) as f64;
            return (lower, upper, blend.clamp(0.0, 1.0));
        }
    }
    let last = REVIEWED_BAR_ANCHORS[REVIEWED_BAR_ANCHORS.len() - 1];
    (last, last, 0.0)
}

fn lerp(left: f64, right: f64, amount: f64) -> f64 {
    left + amount * (right - left)
}

fn bar_mode_shape(index: usize, position_over_length: f64) -> f64 {
    let centered = position_over_length - 0.5;
    if index % 2 == 0 {
        let order = (index / 2 + 1) as f64;
        cos(TAU * order * centered)
    } else {
        let order = (index / 2 + 1) as f64;
        sin(TAU * order * centered)
    }
}

fn contact_potential_j(stiffness: f64, compression_m: f64) -> f64 {
    0.4 * stiffness * pow(compression_m.max(0.0), 2.5)
}

fn contact_potential_gradient(stiffness: f64, before_m: f64, after_m: f64) -> f64 {
    let delta = after_m - before_m;
    if delta.abs() <= 1.0e-14 {
        stiffness * pow(0.5 * (before_m + after_m).max(0.0), 1.5)
    } else {
        (contact_potential_j(stiffness, after_m) - contact_potential_j(stiffness, before_m)) / delta
    }
}

/* ------------------------------------------------------------------------- */
/* Shipping ABI (jcpe-sample-elimination-physical-qzgo): per-note render     */
/* that replaces the CC0 sampled-vibraphone recipe with this physical model. */
/* ------------------------------------------------------------------------- */

/// Natural per-note span for the shipping render: the sampled recipe capped
/// buffers at 4 s and the bar+resonator T60 law keeps audible energy inside
/// that span at every playable pitch.
const VBS2_CAP_SECONDS: f64 = 4.0;
/// Per-register mallet calibration for the shipping render, measured
/// against the recorded CC0 corpus through the sample-replacement gate
/// (2026-08-09 2D campaign, position x hardness per register; every row's
/// number comes from a full canonical gate run on the rebuilt embed —
/// no screening shim, per the oracle-fidelity law).
///
/// Physics recorded by the earlier single-point sweeps and preserved here:
/// the strike POSITION owns the mode balance (a centre strike sits on the
/// tuned 4x partial's node and over-drives mode 3), while HARDNESS owns
/// the contact bandwidth (soft contact cannot reach the 4x partial at all
/// in the top octave). Real players do exactly this: softer mallets and a
/// nearer-centre strike on the low bars, harder mallets toward the bar
/// edge as the bars shorten. Velocity moves impact energy, never the
/// damping law. Rows: (inclusive upper MIDI bound, x/L position, hardness).
///
/// 2026-08-09 20-point canonical grid (position 0.32-0.50 x hardness
/// 0.12-0.42, every point a full gate run; /tmp/vibes-sweep-results.tsv
/// archived in the bead dossier): m60 group peaks at centre+soft
/// (margin +3.50 dB), the m67 group at centre+HARD (+3.23 — the earlier
/// "structurally short" verdict was a hardness ceiling: soft contact
/// cannot reach that bar group's 4x-partial bandwidth), the m74 group
/// off-centre+medium (+2.80). End registers keep the round-1 point
/// (m53 +9.30, m84 +5.98).
const VBS2_REGISTER_TABLE: [(i32, f64, f64); 5] = [
    (56, 0.41, 0.20),
    (63, 0.50, 0.12),
    (70, 0.50, 0.42),
    (78, 0.32, 0.30),
    (89, 0.41, 0.20),
];

fn vbs2_register_calibration(midi: i32) -> (f64, f64) {
    for (bound, position, hardness) in VBS2_REGISTER_TABLE {
        if midi <= bound {
            return (position, hardness);
        }
    }
    let last = VBS2_REGISTER_TABLE[VBS2_REGISTER_TABLE.len() - 1];
    (last.1, last.2)
}
/// Pressure-to-float scale, measured against the model (2026-08-09): the
/// radiated pressure of a velocity-100 F4 strike peaks at 0.177 Pa at the
/// 1 m radiation distance, so 1.58 lands the float peak at 0.28 — the same
/// headroom band as the other physical renders. The recipe outputLevel owns
/// mixing; this constant only sets the ABI's numeric range.
const VBS2_PRESSURE_SCALE: f64 = 1.58;

fn vbs2_disjoint(a: usize, a_len: usize, b: usize, b_len: usize) -> bool {
    a.checked_add(a_len)
        .is_some_and(|a_end| a_end <= b || b.checked_add(b_len).is_some_and(|b_end| b_end <= a))
}

/// Maximum frame count written by [`vbs2_render`]. Zero refuses an invalid
/// pitch or sample rate, mirroring the plk2/flt2 refusal law.
#[no_mangle]
pub extern "C" fn vbs2_note_frames(midi: i32, sample_rate: f32) -> i32 {
    let rate = sample_rate as f64;
    if !(MIN_MIDI..=MAX_MIDI).contains(&midi) || !(8_000.0..=96_000.0).contains(&rate) {
        return 0;
    }
    (VBS2_CAP_SECONDS * rate) as i32
}

/// Per-note vibraphone render: one bar with its resonator tube, pedal down
/// (bars free, the sampled recipe's ringing sustain), motor off. Velocity
/// maps through the Hertzian strike-energy law; level and spectrum follow
/// the physics with no per-note normalization (the recipe outputLevel owns
/// mixing). A 100 ms linear fade closes the buffer only when the natural
/// decay is truncated by the cap.
#[no_mangle]
pub extern "C" fn vbs2_render(
    midi: i32,
    velocity: i32,
    sample_rate: f32,
    left: *mut f32,
    right: *mut f32,
    max_frames: i32,
) -> i32 {
    let natural = vbs2_note_frames(midi, sample_rate);
    if natural == 0 || max_frames <= 0 || left.is_null() || right.is_null() {
        return 0;
    }
    if !(1..=127).contains(&velocity) {
        return 0;
    }
    let frames = (natural.min(max_frames)) as usize;
    let channel_bytes = match frames.checked_mul(core::mem::size_of::<f32>()) {
        Some(value) => value,
        None => return 0,
    };
    if !vbs2_disjoint(left as usize, channel_bytes, right as usize, channel_bytes) {
        return 0;
    }
    let out_left = unsafe { core::slice::from_raw_parts_mut(left, frames) };
    let out_right = unsafe { core::slice::from_raw_parts_mut(right, frames) };
    let rate = sample_rate as f64;
    let mut voice = match VibraphoneVoice::new(midi, rate, VibesParameters::canonical()) {
        Ok(voice) => voice,
        Err(_) => return 0,
    };
    let (strike_position, hardness) = vbs2_register_calibration(midi);
    let mut gesture = match StrikeGesture::from_velocity(velocity, hardness) {
        Ok(gesture) => gesture,
        Err(_) => return 0,
    };
    /*
     * Players strike just off the bar centre. `from_velocity` defaults the
     * gesture to dead centre, where the tuned 4x partial (an odd mode with
     * a centre node) receives ~zero contact coupling through the model's
     * patch-integrated mode shapes — the replacement gate measured it 54 dB
     * under the fundamental at D5 while the recorded corpus holds it at
     * -15 dB (2026-08-09). The per-register table above carries the
     * measured position and hardness for each bar group.
     */
    gesture.strike_position_over_length = strike_position;
    if voice.begin_strike(gesture).is_err() {
        return 0;
    }
    let controls = VibesControls {
        pedal_position: 1.0,
        motor_hz: 0.0,
        fan_depth: 0.0,
    };
    let fade_frames = ((0.1 * rate) as usize).min(frames / 8).max(1);
    let fade_start = frames - fade_frames;
    for frame in 0..frames {
        let output = match voice.step(controls) {
            Ok(output) => output,
            Err(_) => return 0,
        };
        let mut sample = output.radiated_pressure_pa * VBS2_PRESSURE_SCALE;
        if frame >= fade_start {
            sample *= (frames - frame) as f64 / fade_frames as f64;
        }
        let value = sample as f32;
        out_left[frame] = value;
        out_right[frame] = value;
    }
    frames as i32
}
