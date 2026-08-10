//! Dark physical vibraphone core.
//!
//! Each MIDI key selects a distinct reviewed modal record; it never retunes
//! one delay line or one simulated bar state to the requested frequency.  The
//! compact representation is deliberately honest about its boundary: it is a
//! per-key modal reduction, not an online Euler-Bernoulli/Timoshenko solver.
//! It retains the
//! mechanisms that identify a vibraphone rather than a generic sine bell:
//!
//! - a generated aluminium-bar eigenpack whose reviewed partials are tuned
//!   near 1:4:10 and whose remaining geometry-derived modes are retained;
//! - finite compliant mallet contact, with hardness changing contact width and
//!   duration instead of being replaced by an output EQ;
//! - a passive bar-to-quarter-wave resonator port;
//! - a positive damper-felt conductance controlled by the pedal; and
//! - rotating resonator fans that modulate radiated aperture only, never the
//!   mechanical state or pitch.
//!
//! The exported `vbs2_*` ABI renders one stateless note for the reviewed
//! replacement recipe.  The richer [`VibraphoneStem`] retains shared bars,
//! frame, pedal, and fan state, but that stateful surface is not exported by
//! this per-note ABI.

use libm::{cos, exp, pow, sin, sqrt};

const PI: f64 = core::f64::consts::PI;
const TAU: f64 = 2.0 * PI;
const LN_1000: f64 = 6.907_755_278_982_137;

pub const BAR_MODES: usize = 10;
const BAR_SHAPE_NODES: usize = 33;
pub const MIN_MIDI: i32 = 53;
pub const MAX_MIDI: i32 = 89;
pub const MAX_FAN_RATE_HZ: f64 = 12.0;
const CONTACT_SOLVE_STEPS: usize = 8;
const RADIATION_DISTANCE_M: f64 = 1.0;
// One fixed one-metre listener direction, 30 degrees off the bar-normal
// axis. A listener exactly over every bar centre is a geometric singularity:
// it nulls every antisymmetric length mode, including the deliberately tuned
// 4f partial, and makes a real vibraphone bar sound like a sine oscillator.
const BAR_OBSERVER_AXIAL_M: f64 = 0.5;
const BAR_OBSERVER_NORMAL_M: f64 = 0.866_025_403_784_438_6;

const SOUND_SPEED_M_S: f64 = 343.21;
const AIR_DENSITY_KG_M3: f64 = 1.2041;

/// One exact row of the offline stepped free-free Euler--Bernoulli reduction.
/// Frequencies and mass-normalized shapes are solved from the 32-element
/// undercut geometry by the checked-in generator. The runtime never derives
/// them from MIDI or from hand-authored modal ratios.
#[derive(Clone, Copy, Debug)]
struct ModalPackRecord {
    midi: i32,
    intended_frequency_hz: f64,
    length_m: f64,
    width_m: f64,
    outer_thickness_m: f64,
    element_thickness_m: [f64; 32],
    mass_kg: f64,
    tuned_mode_count: usize,
    solved_frequencies_hz: [f64; BAR_MODES],
    eigen_relative_residuals: [f64; BAR_MODES],
    mode_shapes_m_neg_half_kg: [[f32; BAR_SHAPE_NODES]; BAR_MODES],
    t60_seconds: [f64; BAR_MODES],
    resonator_effective_length_m: f64,
    resonator_physical_length_m: f64,
    resonator_radius_m: f64,
}

mod vibes_v2_eigenpack {
    use super::ModalPackRecord;

    include!("vibes_v2_eigenpack.rs");
}
use vibes_v2_eigenpack::VIBES_V2_MODAL_PACK;

pub const VIBES_V2_MODAL_PACK_INPUT_SHA256: &str =
    vibes_v2_eigenpack::VIBES_V2_MODAL_PACK_INPUT_SHA256;
pub const VIBES_V2_MODAL_AUTHORITY_SHA256: &str =
    vibes_v2_eigenpack::VIBES_V2_MODAL_AUTHORITY_SHA256;
pub const VIBES_V2_MODAL_GENERATOR_SHA256: &str =
    vibes_v2_eigenpack::VIBES_V2_MODAL_GENERATOR_SHA256;
pub const VIBES_V2_MODAL_PACK_SOLVER_ID: &str = vibes_v2_eigenpack::VIBES_V2_MODAL_PACK_SOLVER_ID;

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
    pub element_thickness_m: [f64; 32],
    pub mass_kg: f64,
    pub resonator_length_m: f64,
    pub resonator_effective_length_m: f64,
    pub resonator_radius_m: f64,
    pub tuned_mode_count: usize,
    pub mode_frequencies_hz: [f64; BAR_MODES],
    pub mode_ratios: [f64; BAR_MODES],
    pub mode_shapes_m_neg_half_kg: [[f32; BAR_SHAPE_NODES]; BAR_MODES],
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
    /// Gap from the tube mouth to the bar, normalized by tube radius.
    pub bar_resonator_distance_over_radius: f64,
    pub resonator_placement_over_length: f64,
    pub resonator_q: f64,
}

impl VibesParameters {
    pub const fn canonical() -> Self {
        Self {
            damper_conductance_kg_per_s: 22.0,
            bar_resonator_distance_over_radius: 0.4,
            resonator_placement_over_length: 0.5,
            resonator_q: 38.0,
        }
    }

    fn validate(self) -> Result<Self, VibesError> {
        if !self.damper_conductance_kg_per_s.is_finite() || self.damper_conductance_kg_per_s < 0.0 {
            return Err(VibesError::NonPassiveDamper);
        }
        if !self.bar_resonator_distance_over_radius.is_finite()
            || !(0.0..=2.0).contains(&self.bar_resonator_distance_over_radius)
            || !self.resonator_placement_over_length.is_finite()
            || !(0.05..=0.95).contains(&self.resonator_placement_over_length)
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
    damper_residue: f64,
    radiation_residue: f64,
    radiation_transfer_re: f64,
    radiation_transfer_im: f64,
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
        damper_residue: 0.0,
        radiation_residue: 0.0,
        radiation_transfer_re: 0.0,
        radiation_transfer_im: 0.0,
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
    volume_velocity_residue: f64,
}

impl ResonatorMode {
    fn energy_j(self) -> f64 {
        0.5 * (self.velocity * self.velocity
            + self.omega * self.omega * self.position * self.position)
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
    inertial_coupling: f64,
    contact: ContactState,
    motor_phase: f64,
    cumulative_mallet_work_j: f64,
    cumulative_loss_j: f64,
    cumulative_damper_loss_j: f64,
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
        let mut modes = [Mode::ZERO; BAR_MODES];
        let mut resolved_mode_count = 0usize;
        for index in 0..BAR_MODES {
            let frequency_hz = geometry.mode_frequencies_hz[index];
            let element_length_m = geometry.length_m / (BAR_SHAPE_NODES - 1) as f64;
            if frequency_hz >= 0.44 * sample_rate_hz
                || !rayleigh_radiation_is_resolved(element_length_m, frequency_hz)
            {
                break;
            }
            resolved_mode_count += 1;
            let omega = TAU * frequency_hz;
            let t60 = geometry.t60_seconds[index];
            let radiation_transfer =
                packed_free_bar_radiation_transfer(&geometry, index, frequency_hz);
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
                damper_residue: packed_mode_shape(&geometry, index, 0.5),
                radiation_residue: packed_mode_average(&geometry, index),
                radiation_transfer_re: radiation_transfer.0,
                radiation_transfer_im: radiation_transfer.1,
            };
        }
        if resolved_mode_count == 0 {
            return Err(VibesError::InvalidSampleRate);
        }

        let area = PI * geometry.resonator_radius_m * geometry.resonator_radius_m;
        let effective_resonator_length_m = geometry.resonator_effective_length_m;
        // Eq. (16), Soares et al.: modal mass of the first closed-open mode.
        let air_mass = 0.5 * AIR_DENSITY_KG_M3 * area * effective_resonator_length_m;
        let resonator_norm = 1.0 / sqrt(air_mass.max(1.0e-9));
        let resonator_frequency_hz = SOUND_SPEED_M_S / (4.0 * effective_resonator_length_m);
        let omega = TAU * resonator_frequency_hz;
        let resonator = ResonatorMode {
            position: 0.0,
            velocity: 0.0,
            omega,
            volume_velocity_residue: area * resonator_norm,
        };
        let inertial_coupling = bar_resonator_inertial_coupling(
            &geometry,
            parameters,
            resonator_frequency_hz,
            air_mass,
        );
        if !inertial_coupling.is_finite() || inertial_coupling.abs() >= 0.25 {
            return Err(VibesError::NonPassiveResonator);
        }
        Ok(Self {
            sample_rate_hz,
            dt,
            geometry,
            parameters,
            modes,
            resonator,
            inertial_coupling,
            contact: ContactState::INACTIVE,
            motor_phase: 0.0,
            cumulative_mallet_work_j: 0.0,
            cumulative_loss_j: 0.0,
            cumulative_damper_loss_j: 0.0,
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
        self.apply_damper(controls.pedal_position, 0.5 * self.dt);
        for mode in self.modes.iter_mut().skip(1) {
            mode.rotate();
        }
        self.advance_bar_resonator_coupled();
        self.apply_damper(controls.pedal_position, 0.5 * self.dt);
        self.apply_intrinsic_half_loss();

        let bar_radiation = self
            .modes
            .iter()
            .map(|mode| mode.radiation_residue * mode.velocity)
            .sum::<f64>();
        let bar_pressure_pa = self
            .modes
            .iter()
            .map(|mode| {
                mode.radiation_transfer_re * mode.velocity
                    + mode.radiation_transfer_im * mode.omega * mode.position
            })
            .sum::<f64>();
        let tube_volume_velocity = self.resonator.volume_velocity_residue * self.resonator.velocity;
        let fan_aperture = 1.0 - 0.48 * controls.fan_depth
            + 0.48 * controls.fan_depth * (0.5 + 0.5 * sin(self.motor_phase));
        self.motor_phase += TAU * controls.motor_hz * self.dt;
        if self.motor_phase >= TAU {
            self.motor_phase -= TAU;
        }
        let radiated_tube_volume_velocity = fan_aperture * tube_volume_velocity;
        let tube_volume_acceleration = (radiated_tube_volume_velocity
            - self.previous_radiated_volume_velocity_m3_per_s)
            / self.dt;
        self.previous_radiated_volume_velocity_m3_per_s = radiated_tube_volume_velocity;
        let tube_pressure_pa =
            AIR_DENSITY_KG_M3 * tube_volume_acceleration / (4.0 * PI * RADIATION_DISTANCE_M);
        let radiated_pressure_pa = bar_pressure_pa + tube_pressure_pa;
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
        self.modes.iter().map(|mode| mode.energy_j()).sum::<f64>()
            + self.resonator.energy_j()
            + self.inertial_coupling * self.modes[0].velocity * self.resonator.velocity
    }

    pub fn cumulative_mallet_work_j(&self) -> f64 {
        self.cumulative_mallet_work_j
    }

    pub fn cumulative_loss_j(&self) -> f64 {
        self.cumulative_loss_j
    }

    pub fn cumulative_damper_loss_j(&self) -> f64 {
        self.cumulative_damper_loss_j
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
            weighted += WEIGHTS[sample] * packed_mode_shape(&self.geometry, index, x);
        }
        weighted / 12.0
    }

    fn bar_inverse_mass(&self, index: usize) -> f64 {
        if index == 0 {
            1.0 / (1.0 - self.inertial_coupling * self.inertial_coupling)
        } else {
            1.0
        }
    }

    fn apply_bar_impulse(&mut self, index: usize, impulse: f64) {
        if index == 0 {
            let inverse = self.bar_inverse_mass(0);
            self.modes[0].velocity += inverse * impulse;
            self.resonator.velocity -= self.inertial_coupling * inverse * impulse;
        } else {
            self.modes[index].velocity += impulse;
        }
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
            inverse_effective_mass += *residue * *residue * self.bar_inverse_mass(index);
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
            self.apply_bar_impulse(index, residues[index] * total_impulse);
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
                self.apply_bar_impulse(index, -residues[index] * total_impulse);
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
        // The coupled fundamental and tube damping are integrated in the same
        // passive midpoint step as their off-diagonal modal mass.
        for mode in self.modes.iter_mut().skip(1) {
            mode.velocity *= mode.half_velocity_decay;
        }
        let after = self.total_energy_j();
        self.cumulative_loss_j += (before - after).max(0.0);
    }

    fn advance_bar_resonator_coupled(&mut self) {
        let before = self.total_energy_j();
        let h = self.dt;
        let coupling = self.inertial_coupling;
        let bar_omega = self.modes[0].omega;
        let resonator_omega = self.resonator.omega;
        let bar_stiffness = bar_omega * bar_omega;
        let resonator_stiffness = resonator_omega * resonator_omega;
        let bar_damping = 2.0 * LN_1000 / self.geometry.t60_seconds[0];
        let resonator_damping = resonator_omega / self.parameters.resonator_q;
        let bar_diagonal = 1.0 + 0.5 * h * bar_damping + 0.25 * h * h * bar_stiffness;
        let resonator_diagonal =
            1.0 + 0.5 * h * resonator_damping + 0.25 * h * h * resonator_stiffness;
        let bar_rhs = (1.0 - 0.5 * h * bar_damping - 0.25 * h * h * bar_stiffness)
            * self.modes[0].velocity
            + coupling * self.resonator.velocity
            - h * bar_stiffness * self.modes[0].position;
        let resonator_rhs = coupling * self.modes[0].velocity
            + (1.0 - 0.5 * h * resonator_damping - 0.25 * h * h * resonator_stiffness)
                * self.resonator.velocity
            - h * resonator_stiffness * self.resonator.position;
        let determinant = bar_diagonal * resonator_diagonal - coupling * coupling;
        let bar_velocity = (resonator_diagonal * bar_rhs - coupling * resonator_rhs) / determinant;
        let resonator_velocity = (bar_diagonal * resonator_rhs - coupling * bar_rhs) / determinant;
        self.modes[0].position += 0.5 * h * (self.modes[0].velocity + bar_velocity);
        self.resonator.position += 0.5 * h * (self.resonator.velocity + resonator_velocity);
        self.modes[0].velocity = bar_velocity;
        self.resonator.velocity = resonator_velocity;
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
            .enumerate()
            .map(|(index, mode)| {
                mode.damper_residue * mode.damper_residue * self.bar_inverse_mass(index)
            })
            .sum::<f64>();
        let port_velocity = self
            .modes
            .iter()
            .map(|mode| mode.damper_residue * mode.velocity)
            .sum::<f64>();
        let decay = exp(-conductance * norm_squared * duration_seconds);
        let impulse = port_velocity * (1.0 - decay) / norm_squared.max(1.0e-30);
        let before = self.total_energy_j();
        for index in 0..BAR_MODES {
            let port_impulse = -self.modes[index].damper_residue * impulse;
            self.apply_bar_impulse(index, port_impulse);
        }
        let after = self.total_energy_j();
        let loss_j = (before - after).max(0.0);
        self.cumulative_loss_j += loss_j;
        self.cumulative_damper_loss_j += loss_j;
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
        if !(MIN_MIDI..=MAX_MIDI).contains(&midi) {
            return Err(VibesError::InvalidMidi);
        }
        // A key owns one stable slot. First-free insertion made floating-point
        // summation and the old sequential frame rotations depend on the order
        // in which otherwise identical bars were retained.
        let index = (midi - MIN_MIDI) as usize;
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

        /* Each frame mode couples to the normalized aggregate of all retained
         * bar fundamentals. Rotating that one collective coordinate with the
         * frame coordinate is lossless, permutation-invariant, and leaves all
         * bar-velocity components orthogonal to the aggregate unchanged. */
        let retained_count = self.voices.iter().flatten().count();
        let aggregate_weight = 1.0 / sqrt(retained_count.max(1) as f64);
        for (frame_index, frame) in self.frame_modes.iter_mut().enumerate() {
            let aggregate_before = self
                .voices
                .iter()
                .flatten()
                .map(|voice| {
                    aggregate_weight * voice.modes[0].velocity / sqrt(voice.bar_inverse_mass(0))
                })
                .sum::<f64>();
            let angle = self.dt * (7.5 + 1.8 * frame_index as f64);
            let c = cos(angle);
            let s = sin(angle);
            let aggregate_after = c * aggregate_before - s * frame.velocity;
            frame.velocity = s * aggregate_before + c * frame.velocity;
            let normalized_delta = aggregate_weight * (aggregate_after - aggregate_before);
            for voice in self.voices.iter_mut().flatten() {
                let impulse = normalized_delta / sqrt(voice.bar_inverse_mass(0));
                voice.apply_bar_impulse(0, impulse);
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
    let row = VIBES_V2_MODAL_PACK[(midi - MIN_MIDI) as usize];
    let expected_hz = midi_frequency_hz(midi);
    let intended_cents = 1200.0 * libm::log2(row.intended_frequency_hz / expected_hz);
    let resonator_closure = row.resonator_physical_length_m + 0.6133 * row.resonator_radius_m;
    let scalar_fields_are_valid = row.midi == midi
        && row.intended_frequency_hz.is_finite()
        && intended_cents.abs() <= 2.0
        && row.length_m.is_finite()
        && row.length_m > 0.0
        && row.width_m.is_finite()
        && row.width_m > 0.0
        && row.outer_thickness_m.is_finite()
        && row.outer_thickness_m > 0.0
        && row.mass_kg.is_finite()
        && row.mass_kg > 0.0
        && (2..=3).contains(&row.tuned_mode_count)
        && row.resonator_effective_length_m.is_finite()
        && row.resonator_effective_length_m > 0.0
        && row.resonator_physical_length_m.is_finite()
        && row.resonator_physical_length_m > 0.0
        && row.resonator_radius_m.is_finite()
        && row.resonator_radius_m > 0.0
        && (resonator_closure - row.resonator_effective_length_m).abs() <= 1.0e-12;
    let thicknesses_are_valid = row.element_thickness_m.iter().all(|thickness| {
        thickness.is_finite() && *thickness >= 0.005 && *thickness <= row.outer_thickness_m
    });
    let modes_are_valid = (0..BAR_MODES).all(|index| {
        let frequency = row.solved_frequencies_hz[index];
        let ordered = index == 0 || frequency > row.solved_frequencies_hz[index - 1];
        frequency.is_finite()
            && frequency > 0.0
            && ordered
            && row.eigen_relative_residuals[index].is_finite()
            && row.eigen_relative_residuals[index] <= 1.0e-6
            && row.t60_seconds[index].is_finite()
            && row.t60_seconds[index] > 0.0
            && row.mode_shapes_m_neg_half_kg[index]
                .iter()
                .all(|value| value.is_finite())
    });
    if !(scalar_fields_are_valid && thicknesses_are_valid && modes_are_valid) {
        return Err(VibesError::NonFiniteState);
    }

    let fundamental_hz = row.solved_frequencies_hz[0];
    let mut mode_ratios = [0.0; BAR_MODES];
    for (index, ratio) in mode_ratios.iter_mut().enumerate() {
        *ratio = row.solved_frequencies_hz[index] / fundamental_hz;
    }
    Ok(BarGeometry {
        midi,
        fundamental_hz,
        length_m: row.length_m,
        width_m: row.width_m,
        thickness_m: row.outer_thickness_m,
        element_thickness_m: row.element_thickness_m,
        mass_kg: row.mass_kg,
        resonator_length_m: row.resonator_physical_length_m,
        resonator_effective_length_m: row.resonator_effective_length_m,
        resonator_radius_m: row.resonator_radius_m,
        tuned_mode_count: row.tuned_mode_count,
        mode_frequencies_hz: row.solved_frequencies_hz,
        mode_ratios,
        mode_shapes_m_neg_half_kg: row.mode_shapes_m_neg_half_kg,
        t60_seconds: row.t60_seconds,
    })
}

fn packed_mode_shape(geometry: &BarGeometry, index: usize, position_over_length: f64) -> f64 {
    let scaled = position_over_length.clamp(0.0, 1.0) * (BAR_SHAPE_NODES - 1) as f64;
    let left = scaled as usize;
    if left >= BAR_SHAPE_NODES - 1 {
        return geometry.mode_shapes_m_neg_half_kg[index][BAR_SHAPE_NODES - 1] as f64;
    }
    let blend = scaled - left as f64;
    let left_value = geometry.mode_shapes_m_neg_half_kg[index][left] as f64;
    let right_value = geometry.mode_shapes_m_neg_half_kg[index][left + 1] as f64;
    left_value + blend * (right_value - left_value)
}

fn packed_mode_average(geometry: &BarGeometry, index: usize) -> f64 {
    let shape = &geometry.mode_shapes_m_neg_half_kg[index];
    let mut sum = 0.5 * (shape[0] as f64 + shape[BAR_SHAPE_NODES - 1] as f64);
    for value in &shape[1..BAR_SHAPE_NODES - 1] {
        sum += *value as f64;
    }
    sum / (BAR_SHAPE_NODES - 1) as f64
}

fn bar_resonator_separation_transfer(distance_over_radius: f64) -> f64 {
    // Eq. (22), fifth-order finite-element fit from Soares et al.
    const DELTA: [f64; 5] = [2.78, -1.03, 3.34, -1.15, 0.13];
    let mut power = distance_over_radius;
    let mut denominator = 1.0;
    for coefficient in DELTA {
        denominator += coefficient * power;
        power *= distance_over_radius;
    }
    1.0 / denominator
}

fn bar_resonator_inertial_coupling(
    geometry: &BarGeometry,
    parameters: VibesParameters,
    resonator_frequency_hz: f64,
    resonator_modal_mass_kg: f64,
) -> f64 {
    let area = PI * geometry.resonator_radius_m * geometry.resonator_radius_m;
    let omega = TAU * resonator_frequency_hz;
    let separation =
        bar_resonator_separation_transfer(parameters.bar_resonator_distance_over_radius);
    let bar_shape = packed_mode_shape(geometry, 0, parameters.resonator_placement_over_length);
    // Soares Eq. (24) and (31): the pressure-mode integral is evaluated at
    // the PHYSICAL tube mouth. Omitting this cosine/end-correction factor
    // overcouples the oscillators by roughly an order of magnitude.
    let pressure_mode_at_mouth =
        -(SOUND_SPEED_M_S / omega) * cos(omega * geometry.resonator_length_m / SOUND_SPEED_M_S);
    AIR_DENSITY_KG_M3 * area * separation * pressure_mode_at_mouth * bar_shape
        / sqrt(resonator_modal_mass_kg)
}

/// Exact canonical coupling receipt used by the independent physics harness.
pub fn canonical_bar_resonator_inertial_coupling(midi: i32) -> Result<f64, VibesError> {
    let geometry = geometry_for_midi(midi)?;
    let area = PI * geometry.resonator_radius_m * geometry.resonator_radius_m;
    let modal_mass = 0.5 * AIR_DENSITY_KG_M3 * area * geometry.resonator_effective_length_m;
    let frequency_hz = SOUND_SPEED_M_S / (4.0 * geometry.resonator_effective_length_m);
    Ok(bar_resonator_inertial_coupling(
        &geometry,
        VibesParameters::canonical(),
        frequency_hz,
        modal_mass,
    ))
}

/// Narrow-band Rayleigh-I transfer from one mass-normalized FREE bar mode to a
/// fixed observer one metre away and 30 degrees off the bar-normal axis.
/// Unlike a rigidly baffled
/// plate, the bar exposes front and back faces with opposite normal velocity.
/// Their exact path-length difference is retained element by element, so the
/// low-ka field has the required dipole cancellation rather than a fabricated
/// one-sided monopole. This is the no-allocation strip analogue of FrankenSim's
/// surface-source rule:
/// `p = Re(H) qdot + Im(H) omega q` under `exp(-i omega t)`.
fn packed_free_bar_radiation_transfer(
    geometry: &BarGeometry,
    index: usize,
    frequency_hz: f64,
) -> (f64, f64) {
    let element_length_m = geometry.length_m / (BAR_SHAPE_NODES - 1) as f64;
    // Construction culls modes that this 32-cell quadrature cannot resolve;
    // never turn an active mechanical mode into a plausible-looking silent
    // radiation mode.
    debug_assert!(rayleigh_radiation_is_resolved(
        element_length_m,
        frequency_hz
    ));
    let element_area_m2 = geometry.width_m * element_length_m;
    let wave_number = TAU * frequency_hz / SOUND_SPEED_M_S;
    let shape = &geometry.mode_shapes_m_neg_half_kg[index];
    let mut integral_re = 0.0;
    let mut integral_im = 0.0;
    for element in 0..BAR_SHAPE_NODES - 1 {
        let normalized_x = (element as f64 + 0.5) / (BAR_SHAPE_NODES - 1) as f64;
        let source_x_m = (normalized_x - 0.5) * geometry.length_m;
        let half_thickness_m = 0.5 * geometry.element_thickness_m[element];
        let axial_distance_m = BAR_OBSERVER_AXIAL_M - source_x_m;
        let top_normal_distance_m = BAR_OBSERVER_NORMAL_M - half_thickness_m;
        let bottom_normal_distance_m = BAR_OBSERVER_NORMAL_M + half_thickness_m;
        let top_distance_m = sqrt(
            top_normal_distance_m * top_normal_distance_m + axial_distance_m * axial_distance_m,
        );
        let bottom_distance_m = sqrt(
            bottom_normal_distance_m * bottom_normal_distance_m
                + axial_distance_m * axial_distance_m,
        );
        let midpoint_shape = 0.5 * (shape[element] as f64 + shape[element + 1] as f64);
        let weight = 0.5 * element_area_m2 * midpoint_shape;
        let top_phase = wave_number * top_distance_m;
        let bottom_phase = wave_number * bottom_distance_m;
        integral_re +=
            weight * (cos(top_phase) / top_distance_m - cos(bottom_phase) / bottom_distance_m);
        integral_im +=
            weight * (sin(top_phase) / top_distance_m - sin(bottom_phase) / bottom_distance_m);
    }
    let coefficient = AIR_DENSITY_KG_M3 * TAU * frequency_hz / (2.0 * PI);
    (-coefficient * integral_im, coefficient * integral_re)
}

#[cfg(test)]
pub fn free_bar_radiation_transfer_for_test(
    midi: i32,
    index: usize,
) -> Result<(f64, f64), VibesError> {
    let geometry = geometry_for_midi(midi)?;
    let frequency_hz = *geometry
        .mode_frequencies_hz
        .get(index)
        .ok_or(VibesError::NonFiniteState)?;
    Ok(packed_free_bar_radiation_transfer(
        &geometry,
        index,
        frequency_hz,
    ))
}

/// FrankenSim's Rayleigh-I surface rule requires at least six source cells per
/// acoustic wavelength. Keep this predicate explicit so an unresolved mode is
/// refused rather than converted into a plausible-looking silent mode.
pub fn rayleigh_radiation_is_resolved(element_length_m: f64, frequency_hz: f64) -> bool {
    element_length_m.is_finite()
        && element_length_m > 0.0
        && frequency_hz.is_finite()
        && frequency_hz > 0.0
        && SOUND_SPEED_M_S / frequency_hz / element_length_m >= 6.0
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
/// Default gesture for the note-buffer compatibility ABI. It is one fixed
/// medium-soft mallet struck just off centre across the whole keyboard; it is
/// deliberately not a per-register table fitted to the sampled comparator.
/// The stateful physical-instrument ABI will carry these as explicit controls.
const VBS2_DEFAULT_STRIKE_POSITION_OVER_LENGTH: f64 = 0.50;
const VBS2_DEFAULT_MALLET_HARDNESS: f64 = 0.20;

/// Digital headroom convention: +/-1 corresponds to +/-4 Pa at the declared
/// one-metre observer (106 dB SPL re 20 uPa). This converts physical pressure
/// to a unitless sample; it is not an output fit to a recording or a note.
const VBS2_FULL_SCALE_PRESSURE_PA: f64 = 4.0;

fn vbs2_disjoint(a: usize, a_len: usize, b: usize, b_len: usize) -> bool {
    let Some(a_end) = a.checked_add(a_len) else {
        return false;
    };
    let Some(b_end) = b.checked_add(b_len) else {
        return false;
    };
    a_end <= b || b_end <= a
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
/// mixing). A 100 ms linear fade closes the buffer unconditionally on
/// every render (every current render IS cap-truncated; the fade code
/// does not test for truncation — jcpe-4qxd R7 corrected this comment,
/// which previously claimed it was conditional).
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
    let alignment = core::mem::align_of::<f32>();
    if (left as usize) % alignment != 0 || (right as usize) % alignment != 0 {
        return 0;
    }
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
    let mut gesture = match StrikeGesture::from_velocity(velocity, VBS2_DEFAULT_MALLET_HARDNESS) {
        Ok(gesture) => gesture,
        Err(_) => return 0,
    };
    /* Normal vibraphone tone is struck at the bar centre. The generated free-
     * free modes retain the resulting parity selection directly: symmetric
     * modes are driven while antisymmetric centre-node modes are not smuggled
     * back through an output-side spectral control. */
    gesture.strike_position_over_length = VBS2_DEFAULT_STRIKE_POSITION_OVER_LENGTH;
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
        let mut sample = output.radiated_pressure_pa / VBS2_FULL_SCALE_PRESSURE_PA;
        if frame >= fade_start {
            sample *= (frames - frame) as f64 / fade_frames as f64;
        }
        let value = sample as f32;
        out_left[frame] = value;
        out_right[frame] = value;
    }
    frames as i32
}
