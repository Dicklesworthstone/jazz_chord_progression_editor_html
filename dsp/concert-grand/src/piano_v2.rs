//! Dark physical concert-grand onset core.
//!
//! This is the sample-free replacement candidate for the recorded attack
//! layer used by `changes.dsp.concert-grand@1`.  It is deliberately not wired
//! into `lib.rs` or the renderer yet.  The model retains the mechanisms that
//! the old additive attack did not have:
//!
//! - one finite-mass felt hammer shared by the unison string group;
//! - mass-normalized stiff-string modes derived from speaking length,
//!   tension, linear density, bending stiffness, and hammer/bridge position;
//! - an energy-consistent unilateral power-port contact;
//! - eight disjoint lossless bridge ports into an orthotropic soundboard
//!   modal reduction; and
//! - a baffled Rayleigh far-field observer formed from modal velocity.
//!
//! The modal convention and observer realization follow the recent
//! FrankenSim `fs-modal` / `fs-couple::modal_acoustic_time` work, but this
//! no-std WASM core has fixed arrays and imports no FrankenSim crate.  The
//! soundboard remains a bounded rectangular reduction rather than a claim of
//! a scanned concert-grand plate; samples remain reference-only until an
//! independently reviewed geometry/eigenpack and owner listening gate exist.

use libm::{cos, exp, pow, sin, sqrt};

const PI: f64 = core::f64::consts::PI;
const TAU: f64 = 2.0 * PI;
const LN_1000: f64 = 6.907_755_278_982_137;

pub const MIN_MIDI: i32 = 21;
pub const MAX_MIDI: i32 = 108;
pub const MAX_UNISON_STRINGS: usize = 3;
pub const STRING_MODES: usize = 24;
pub const SOUNDBOARD_MODES: usize = 288;
pub const CONTACT_SOLVE_STEPS: usize = 8;
pub const MAXIMUM_STATE_BYTES: usize = 64 * 1024;

const AIR_DENSITY_KG_M3: f64 = 1.2041;
const AIR_SOUND_SPEED_M_PER_S: f64 = 343.21;
const STEEL_DENSITY_KG_M3: f64 = 7_850.0;
const STEEL_YOUNG_MODULUS_PA: f64 = 2.0e11;
const RADIATION_DISTANCE_M: f64 = 1.0;
const DIGITAL_REFERENCE_PRESSURE_PA: f64 = 20.0;

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
    /// Angular rate of the lossless string/body velocity rotation.
    pub bridge_coupling_rate_per_second: f64,
    pub hammer_mass_kg: f64,
    pub maximum_abs_pressure_pa: f64,
    pub maximum_total_energy_j: f64,
}

impl PianoParameters {
    pub const fn canonical() -> Self {
        Self {
            soundboard_length_m: 1.90,
            soundboard_width_m: 1.38,
            soundboard_thickness_m: 0.0090,
            soundboard_density_kg_m3: 430.0,
            soundboard_longitudinal_modulus_pa: 11.0e9,
            soundboard_radial_modulus_pa: 0.72e9,
            soundboard_shear_modulus_pa: 0.62e9,
            soundboard_poisson_ratio: 0.30,
            soundboard_rib_count: 14,
            soundboard_rib_width_m: 0.020,
            soundboard_rib_height_m: 0.025,
            soundboard_rib_modulus_pa: 11.0e9,
            bridge_x_over_length: 0.73,
            bridge_y_over_width: 0.37,
            bridge_coupling_rate_per_second: 1_350.0,
            hammer_mass_kg: 0.052,
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
            self.bridge_coupling_rate_per_second,
            self.hammer_mass_kg,
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
            || !(5.0e9..=20.0e9).contains(&self.soundboard_longitudinal_modulus_pa)
            || !(0.2e9..=3.0e9).contains(&self.soundboard_radial_modulus_pa)
            || !(0.2e9..=3.0e9).contains(&self.soundboard_shear_modulus_pa)
            || !(6..=24).contains(&self.soundboard_rib_count)
            || !(0.008..=0.040).contains(&self.soundboard_rib_width_m)
            || !(0.010..=0.050).contains(&self.soundboard_rib_height_m)
            || !(5.0e9..=20.0e9).contains(&self.soundboard_rib_modulus_pa)
            || !(50.0..=5_000.0).contains(&self.bridge_coupling_rate_per_second)
            || !(0.020..=0.090).contains(&self.hammer_mass_kg)
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
    /// Stulov hereditary time constant [s].
    pub felt_relaxation_seconds: f64,
    pub maximum_force_n: f64,
    pub maximum_contact_seconds: f64,
}

impl PianoStrike {
    pub fn from_velocity(velocity: i32, hammer_mass_kg: f64) -> Result<Self, PianoError> {
        if !(1..=127).contains(&velocity)
            || !hammer_mass_kg.is_finite()
            || !(0.020..=0.090).contains(&hammer_mass_kg)
        {
            return Err(PianoError::InvalidVelocity);
        }
        let amount = velocity as f64 / 127.0;
        let hardness = 0.12 + 0.78 * pow(amount, 0.72);
        let hammer_velocity_m_per_s = 0.28 + 4.15 * pow(amount, 0.82);
        let impact_energy_j =
            0.5 * hammer_mass_kg * hammer_velocity_m_per_s * hammer_velocity_m_per_s;
        // Stulov's independently measured three-parameter medium-hammer law:
        // Q0=70.4 N/mm^p, p=3.95, alpha=0.25 ms.  Converting Q0 to SI keeps
        // hardness in the contact dynamics rather than scheduling an output
        // brightness coefficient from MIDI velocity.
        // DOI: 10.1121/1.411912; reduced law reported in ISNA 2004 Eq. (7).
        let felt_exponent = 3.95;
        let felt_stiffness = 70.4 * pow(1_000.0, felt_exponent);
        let felt_relaxation_seconds = 0.000_25;
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
            felt_relaxation_seconds,
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
    pub state_bytes: usize,
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
        rotation_cos: 1.0,
        rotation_sin: 0.0,
        half_velocity_decay: 1.0,
        contact_residue_m_neg_half_kg: 0.0,
        bridge_residue_m_neg_half_kg: 0.0,
    };

    fn apply_half_loss(&mut self) {
        if self.active {
            self.velocity *= self.half_velocity_decay;
        }
    }

    fn rotate(&mut self) {
        if !self.active {
            return;
        }
        let position = self.position;
        let velocity = self.velocity;
        self.position = self.rotation_cos * position + self.rotation_sin * velocity / self.omega;
        self.velocity = -self.omega * self.rotation_sin * position + self.rotation_cos * velocity;
    }

    fn energy_j(self) -> f64 {
        if !self.active {
            return 0.0;
        }
        0.5 * (self.velocity * self.velocity
            + self.omega * self.omega * self.position * self.position)
    }
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
    hammer_position_m: f64,
    hammer_velocity_m_per_s: f64,
    compression_m: f64,
    elapsed_frames: u32,
    maximum_frames: u32,
    dissipated_energy_j: f64,
}

impl ContactState {
    const INACTIVE: Self = Self {
        active: false,
        strike: PianoStrike {
            velocity: 1,
            hardness: 0.0,
            hammer_mass_kg: 0.052,
            hammer_velocity_m_per_s: 0.0,
            impact_energy_j: 0.0,
            felt_stiffness_n_per_m_pow_exponent: 1.0,
            felt_exponent: 2.5,
            felt_relaxation_seconds: 0.000_25,
            maximum_force_n: 0.0,
            maximum_contact_seconds: 0.001,
        },
        hammer_position_m: 0.0,
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
        let geometry = string_geometry(midi)?;
        let dt = 1.0 / sample_rate_hz;
        let mut strings = [StringBank::ZERO; MAX_UNISON_STRINGS];
        let mut active_string_modes = 0usize;
        for string_index in 0..geometry.string_count {
            strings[string_index].active = true;
            let string_fundamental = geometry.unison_frequencies_hz[string_index];
            let modal_mass = 0.5 * geometry.linear_density_kg_m * geometry.speaking_length_m;
            let modal_norm = 1.0 / sqrt(modal_mass);
            for mode_index in 0..STRING_MODES {
                let order = (mode_index + 1) as f64;
                let frequency_hz = stiff_string_mode_frequency_hz(
                    string_fundamental,
                    geometry.inharmonicity_coefficient,
                    mode_index + 1,
                );
                if frequency_hz >= 0.44 * sample_rate_hz {
                    continue;
                }
                active_string_modes += 1;
                let omega = TAU * frequency_hz;
                let hammer_shape = sin(PI * order * 0.118);
                let bridge_shape = sin(PI * order * 0.018);
                let fundamental_t60 = 14.0 * exp(-0.020 * (midi - MIN_MIDI) as f64) + 1.4;
                let t60 = fundamental_t60 / (1.0 + 0.020 * order * order);
                strings[string_index].modes[mode_index] = Mode {
                    active: true,
                    position: 0.0,
                    velocity: 0.0,
                    frequency_hz,
                    omega,
                    rotation_cos: cos(omega * dt),
                    rotation_sin: sin(omega * dt),
                    half_velocity_decay: exp(-LN_1000 * dt / t60),
                    contact_residue_m_neg_half_kg: hammer_shape * modal_norm
                        / geometry.string_count as f64,
                    bridge_residue_m_neg_half_kg: bridge_shape * modal_norm,
                };
            }
        }
        if active_string_modes == 0 {
            return Err(PianoError::InvalidSampleRate);
        }
        let soundboard = build_soundboard_modes(parameters, sample_rate_hz)?;
        let voice = Self {
            sample_rate_hz,
            dt,
            parameters,
            geometry,
            strings,
            soundboard,
            contact: ContactState::INACTIVE,
            active_string_modes,
            cumulative_loss_j: 0.0,
            escaped_hammer_energy_j: 0.0,
            total_contact_iterations: 0,
            last_contact_iterations: 0,
        };
        if core::mem::size_of::<Self>() > MAXIMUM_STATE_BYTES {
            return Err(PianoError::BudgetExceeded);
        }
        Ok(voice)
    }

    pub fn begin_strike(&mut self, strike: PianoStrike) -> Result<(), PianoError> {
        if self.contact.active
            || !(1..=127).contains(&strike.velocity)
            || !strike.hardness.is_finite()
            || !(0.0..=1.0).contains(&strike.hardness)
            || !strike.hammer_mass_kg.is_finite()
            || !(0.020..=0.090).contains(&strike.hammer_mass_kg)
            || !strike.hammer_velocity_m_per_s.is_finite()
            || !(0.0..=8.0).contains(&strike.hammer_velocity_m_per_s)
            || !strike.impact_energy_j.is_finite()
            || !(0.0..=1.0).contains(&strike.impact_energy_j)
            || !strike.felt_stiffness_n_per_m_pow_exponent.is_finite()
            || !(1.0e12..=1.0e16).contains(&strike.felt_stiffness_n_per_m_pow_exponent)
            || !strike.felt_exponent.is_finite()
            || !(1.5..=4.0).contains(&strike.felt_exponent)
            || !strike.felt_relaxation_seconds.is_finite()
            || !(1.0e-6..=0.005).contains(&strike.felt_relaxation_seconds)
            || !strike.maximum_force_n.is_finite()
            || !(0.0..=20_000.0).contains(&strike.maximum_force_n)
            || !strike.maximum_contact_seconds.is_finite()
            || !(self.dt..=0.020).contains(&strike.maximum_contact_seconds)
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
        let maximum_frames =
            libm::ceil(strike.maximum_contact_seconds * self.sample_rate_hz) as u32;
        self.cumulative_loss_j += self.contact.dissipated_energy_j;
        self.contact = ContactState {
            active: true,
            strike,
            hammer_position_m: self.hammer_port_displacement(),
            hammer_velocity_m_per_s: strike.hammer_velocity_m_per_s,
            compression_m: 0.0,
            elapsed_frames: 0,
            maximum_frames: maximum_frames.max(1),
            dissipated_energy_j: 0.0,
        };
        Ok(())
    }

    pub fn step(&mut self) -> Result<PianoOutput, PianoError> {
        self.last_contact_iterations = 0;
        if self.contact.active {
            self.apply_hammer_contact();
        }

        let before_loss = self.modal_energy_j();
        self.for_each_mode_mut(|mode| mode.apply_half_loss());
        self.for_each_mode_mut(|mode| mode.rotate());
        self.apply_lossless_bridge_coupling();
        self.for_each_mode_mut(|mode| mode.apply_half_loss());
        let after_loss = self.modal_energy_j();
        self.cumulative_loss_j += (before_loss - after_loss).max(0.0);

        let (left_pressure_pa, right_pressure_pa) = self.observe_pressure_pa();
        let energy = self.represented_energy_j();
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
            string_energy_j: self.string_energy_j(),
            soundboard_energy_j: self.soundboard_energy_j(),
            hammer_contact_energy_j: self.hammer_contact_energy_j(),
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
        self.modal_energy_j() + self.hammer_contact_energy_j()
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

    fn hammer_port_displacement(&self) -> f64 {
        self.strings
            .iter()
            .flat_map(|bank| bank.modes.iter())
            .map(|mode| mode.contact_residue_m_neg_half_kg * mode.position)
            .sum()
    }

    fn hammer_port_velocity(&self) -> f64 {
        self.strings
            .iter()
            .flat_map(|bank| bank.modes.iter())
            .map(|mode| mode.contact_residue_m_neg_half_kg * mode.velocity)
            .sum()
    }

    fn apply_hammer_contact(&mut self) {
        let strike = self.contact.strike;
        let compression = self.contact.compression_m.max(0.0);
        let string_displacement = self.hammer_port_displacement();
        let relative_velocity = self.contact.hammer_velocity_m_per_s - self.hammer_port_velocity();
        let mut inverse_effective_mass = 1.0 / strike.hammer_mass_kg;
        for bank in &self.strings {
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
        let maximum_impulse = strike.maximum_force_n * self.dt;
        let mut lower = 0.0;
        let mut upper = maximum_impulse;
        let upper_compression = (compression
            + self.dt * (relative_velocity - 0.5 * upper * inverse_effective_mass))
            .max(0.0);
        let upper_force = felt_hysteretic_force_n(
            strike.felt_stiffness_n_per_m_pow_exponent,
            strike.felt_exponent,
            strike.felt_relaxation_seconds,
            compression,
            upper_compression,
            self.dt,
        );
        if upper < self.dt * upper_force {
            self.escaped_hammer_energy_j += 0.5
                * strike.hammer_mass_kg
                * self.contact.hammer_velocity_m_per_s
                * self.contact.hammer_velocity_m_per_s;
            self.contact.dissipated_energy_j += potential_before;
            self.contact.compression_m = 0.0;
            self.contact.hammer_position_m = string_displacement;
            self.contact.active = false;
            return;
        }
        for _ in 0..CONTACT_SOLVE_STEPS {
            let impulse = 0.5 * (lower + upper);
            let after = (compression
                + self.dt * (relative_velocity - 0.5 * impulse * inverse_effective_mass))
                .max(0.0);
            let force = felt_hysteretic_force_n(
                strike.felt_stiffness_n_per_m_pow_exponent,
                strike.felt_exponent,
                strike.felt_relaxation_seconds,
                compression,
                after,
                self.dt,
            );
            if impulse >= self.dt * force {
                upper = impulse;
            } else {
                lower = impulse;
            }
        }
        self.last_contact_iterations = CONTACT_SOLVE_STEPS;
        self.total_contact_iterations += CONTACT_SOLVE_STEPS as u64;
        let impulse = upper;
        let system_before = self.modal_energy_j()
            + 0.5
                * strike.hammer_mass_kg
                * self.contact.hammer_velocity_m_per_s
                * self.contact.hammer_velocity_m_per_s
            + potential_before;
        for bank in &mut self.strings {
            for mode in &mut bank.modes {
                mode.velocity += mode.contact_residue_m_neg_half_kg * impulse;
            }
        }
        self.contact.hammer_velocity_m_per_s -= impulse / strike.hammer_mass_kg;
        let compression_after = (compression
            + self.dt * (relative_velocity - 0.5 * impulse * inverse_effective_mass))
            .max(0.0);
        self.contact.compression_m = compression_after;
        self.contact.hammer_position_m = string_displacement + compression_after;
        let system_after = self.modal_energy_j()
            + 0.5
                * strike.hammer_mass_kg
                * self.contact.hammer_velocity_m_per_s
                * self.contact.hammer_velocity_m_per_s
            + felt_potential_j(
                strike.felt_stiffness_n_per_m_pow_exponent,
                strike.felt_exponent,
                compression_after,
            );
        let tolerance = 512.0 * f64::EPSILON * system_before.max(1.0);
        if system_after > system_before + tolerance {
            for bank in &mut self.strings {
                for mode in &mut bank.modes {
                    mode.velocity -= mode.contact_residue_m_neg_half_kg * impulse;
                }
            }
            self.contact.hammer_velocity_m_per_s += impulse / strike.hammer_mass_kg;
            self.escaped_hammer_energy_j += 0.5
                * strike.hammer_mass_kg
                * self.contact.hammer_velocity_m_per_s
                * self.contact.hammer_velocity_m_per_s;
            self.contact.dissipated_energy_j += potential_before;
            self.contact.compression_m = 0.0;
            self.contact.hammer_position_m = string_displacement;
            self.contact.active = false;
            return;
        }
        self.contact.dissipated_energy_j += (system_before - system_after).max(0.0);
        self.contact.elapsed_frames += 1;
        let relative_after = relative_velocity - impulse * inverse_effective_mass;
        let separated = compression_after <= 1.0e-12 && relative_after <= 0.0;
        if separated || self.contact.elapsed_frames >= self.contact.maximum_frames {
            self.escaped_hammer_energy_j += 0.5
                * strike.hammer_mass_kg
                * self.contact.hammer_velocity_m_per_s
                * self.contact.hammer_velocity_m_per_s;
            self.contact.dissipated_energy_j += felt_potential_j(
                strike.felt_stiffness_n_per_m_pow_exponent,
                strike.felt_exponent,
                self.contact.compression_m,
            );
            self.contact.compression_m = 0.0;
            self.contact.active = false;
        }
    }

    fn apply_lossless_bridge_coupling(&mut self) {
        let angle = (self.parameters.bridge_coupling_rate_per_second * self.dt).min(0.20);
        let cosine = cos(angle);
        let sine = sin(angle);

        // The bridge mobility is frequency dependent.  A single normalized
        // rank-one port makes every string harmonic drive one fixed board
        // mixture, erasing the hammer-hardness spectrum.  Eight disjoint modal
        // ports preserve that dependence without creating energy: each band
        // is an orthogonal two-coordinate velocity rotation and every mode is
        // owned by exactly one band.
        for band in 0..8 {
            let mut string_norm_squared = 0.0;
            let mut string_port_velocity = 0.0;
            for bank in &self.strings {
                for mode in &bank.modes {
                    if bridge_band(mode.frequency_hz) != band {
                        continue;
                    }
                    string_norm_squared +=
                        mode.bridge_residue_m_neg_half_kg * mode.bridge_residue_m_neg_half_kg;
                    string_port_velocity += mode.bridge_residue_m_neg_half_kg * mode.velocity;
                }
            }
            let mut body_norm_squared = 0.0;
            let mut body_port_velocity = 0.0;
            for body in &self.soundboard {
                if bridge_band(body.mode.frequency_hz) != band {
                    continue;
                }
                body_norm_squared +=
                    body.mode.bridge_residue_m_neg_half_kg * body.mode.bridge_residue_m_neg_half_kg;
                body_port_velocity += body.mode.bridge_residue_m_neg_half_kg * body.mode.velocity;
            }
            if string_norm_squared <= 1.0e-30 || body_norm_squared <= 1.0e-30 {
                continue;
            }
            let string_norm = sqrt(string_norm_squared);
            let body_norm = sqrt(body_norm_squared);
            let string_coordinate = string_port_velocity / string_norm;
            let body_coordinate = body_port_velocity / body_norm;
            let next_string = cosine * string_coordinate - sine * body_coordinate;
            let next_body = sine * string_coordinate + cosine * body_coordinate;
            let string_delta = next_string - string_coordinate;
            let body_delta = next_body - body_coordinate;
            for bank in &mut self.strings {
                for mode in &mut bank.modes {
                    if bridge_band(mode.frequency_hz) == band {
                        mode.velocity +=
                            mode.bridge_residue_m_neg_half_kg / string_norm * string_delta;
                    }
                }
            }
            for body in &mut self.soundboard {
                if bridge_band(body.mode.frequency_hz) == band {
                    body.mode.velocity +=
                        body.mode.bridge_residue_m_neg_half_kg / body_norm * body_delta;
                }
            }
        }
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
        let scale = AIR_DENSITY_KG_M3 / (4.0 * PI * RADIATION_DISTANCE_M);
        (
            left_pressure_pa + scale * left_string_volume_acceleration,
            right_pressure_pa + scale * right_string_volume_acceleration,
        )
    }
}

pub fn midi_frequency_hz(midi: i32) -> f64 {
    440.0 * pow(2.0, (midi as f64 - 69.0) / 12.0)
}

pub fn string_geometry(midi: i32) -> Result<StringGeometry, PianoError> {
    if !(MIN_MIDI..=MAX_MIDI).contains(&midi) {
        return Err(PianoError::InvalidMidi);
    }
    let register = (midi - MIN_MIDI) as f64 / (MAX_MIDI - MIN_MIDI) as f64;
    let shaped_register = pow(register, 1.35);
    let speaking_length_m = 1.95 * pow(0.060 / 1.95, shaped_register);
    let fundamental_hz = midi_frequency_hz(midi);
    let tension_n = 690.0 + 190.0 * register;
    let linear_density_kg_m = tension_n
        / (2.0 * speaking_length_m * fundamental_hz)
        / (2.0 * speaking_length_m * fundamental_hz);
    let equivalent_diameter_m = 2.0 * sqrt(linear_density_kg_m / (PI * STEEL_DENSITY_KG_M3));
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
        parameters.hammer_mass_kg,
    )?)?;
    for frame in 0..frames {
        let output = voice.step()?;
        left[frame] = (output.left_pressure_pa / DIGITAL_REFERENCE_PRESSURE_PA) as f32;
        right[frame] = (output.right_pressure_pa / DIGITAL_REFERENCE_PRESSURE_PA) as f32;
    }
    Ok(frames)
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
                let bridge_shape = sin(PI * order_x as f64 * parameters.bridge_x_over_length)
                    * sin(PI * order_y as f64 * parameters.bridge_y_over_width);
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
                let t60 = 1.65 / (1.0 + 0.0009 * frequency_hz) + 0.28;
                modes[index] = SoundboardMode {
                    mode: Mode {
                        active: true,
                        position: 0.0,
                        velocity: 0.0,
                        frequency_hz,
                        omega,
                        rotation_cos: cos(omega / sample_rate_hz),
                        rotation_sin: sin(omega / sample_rate_hz),
                        half_velocity_decay: exp(-LN_1000 / (sample_rate_hz * t60)),
                        contact_residue_m_neg_half_kg: 0.0,
                        bridge_residue_m_neg_half_kg: bridge_shape * modal_norm,
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
        while cursor > 0 && modes[cursor].mode.frequency_hz < modes[cursor - 1].mode.frequency_hz {
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

fn felt_hysteretic_force_n(
    stiffness: f64,
    exponent: f64,
    relaxation_seconds: f64,
    before_m: f64,
    after_m: f64,
    dt: f64,
) -> f64 {
    let before = before_m.max(0.0);
    let after = after_m.max(0.0);
    let elastic = felt_potential_gradient(stiffness, exponent, before, after);
    // Q=Q0[u^p + alpha*d(u^p)/dt].  The exact discrete power-law
    // difference makes the hereditary term dissipative for loading and
    // unloading alike.  Zero-clamping refuses the unphysical tensile branch
    // once the felt has unloaded.
    let power_rate = (pow(after, exponent) - pow(before, exponent)) / dt;
    (elastic + stiffness * relaxation_seconds * power_rate).max(0.0)
}

fn smooth_step(value: f64) -> f64 {
    let x = value.clamp(0.0, 1.0);
    x * x * (3.0 - 2.0 * x)
}

fn bridge_band(frequency_hz: f64) -> usize {
    if frequency_hz < 220.0 {
        0
    } else if frequency_hz < 440.0 {
        1
    } else if frequency_hz < 880.0 {
        2
    } else if frequency_hz < 1_320.0 {
        3
    } else if frequency_hz < 1_760.0 {
        4
    } else if frequency_hz < 2_200.0 {
        5
    } else if frequency_hz < 3_000.0 {
        6
    } else {
        7
    }
}
