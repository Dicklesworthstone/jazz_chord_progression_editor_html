//! Dark PHS4 shared plucked-string core.
//!
//! This module owns a bounded note-buffer ABI in addition to the retained
//! physical state machine.  Host integration, recipe reachability, and release
//! remain controlled outside this module after independent verification and
//! listening:
//!
//! - mass-normalized stiff-string modes with geometry-derived dispersion and
//!   frequency-dependent T60 loss;
//! - finite-duration compliant pick/finger contact with position, width, force,
//!   direction, and a Hunt-Crossley-style velocity term;
//! - a power-conjugate shared bridge/body port.  Its velocity update is the
//!   exact solution of a positive mechanical conductance, so the coupling can
//!   transfer or dissipate energy but cannot create it;
//! - retained body and unplayed-string state for sympathetic continuation;
//! - geometry/material-derived orthotropic plate modes plus a Helmholtz mode;
//! - separate body-radiation, direct-string, bridge, and finite-aperture pickup
//!   taps, plus a retained pickup/preamp/power-supply/tone-stack/speaker path
//!   for the solid-electric Marshall-class pack.
//!
//! The body reduction is a simply-supported orthotropic plate approximation,
//! not the complete accepted DKT foundry path.  It uses the same rigidity and
//! mass-normalization laws as the `fs-plate` implementation surveyed in
//! `/dp/frankensim`, but makes no measured-body, perceptual-similarity, browser,
//! recipe-reachability, acceptance-ledger, or deployment claim.

use libm::{cos, exp, pow, round, sin, sqrt, tanh};

const PI: f64 = core::f64::consts::PI;
const TAU: f64 = 2.0 * PI;
const LN_1000: f64 = 6.907_755_278_982_137;

pub const MAX_STRINGS: usize = 12;
pub const MAX_STRING_MODES: usize = 32;
pub const MAX_BODY_MODES: usize = 64;

pub const PLK2_ARCHTOP_PACK: i32 = 0;
pub const PLK2_MARSHALL_ELECTRIC_PACK: i32 = 1;
pub const PLK2_DREADNOUGHT_PACK: i32 = 2;
pub const PLK2_UKULELE_PACK: i32 = 3;

const AIR_DENSITY_KG_PER_M3: f64 = 1.204;
const ACOUSTIC_MIC_DISTANCE_M: f64 = 1.0;
// Raw taps remain in pascals at one metre. The note-buffer ABI then crosses
// into a dimensionless ensemble bus, whose absolute scale is conventional:
// this reference maps a 1 Pa peak to -21.9 dBFS before the fixed instrument
// trim below. Keeping these two stages explicit prevents the monitor level
// from being mistaken for extra mechanical energy or acoustic radiation.
const REFERENCE_PCM_PER_PASCAL: f64 = 0.08;

/// Fixed line/microphone trims for the four complete instruments. These are
/// properties of the output chain, not note measurements: they never inspect
/// pitch, velocity, duration, peak, or RMS, and therefore cannot normalize a
/// render or reshape its attack, spectrum, or decay. The large acoustic trims
/// compensate the deliberately weak far-field modal reduction at the boundary
/// between its physical pressure tap and a practical synthesizer mix; the
/// already amplified electric cabinet needs substantially less trim.
fn plk2_listener_trim(pack_index: i32) -> f64 {
    let trim_db = match pack_index {
        PLK2_ARCHTOP_PACK => 80.0,
        PLK2_MARSHALL_ELECTRIC_PACK => 40.0,
        PLK2_DREADNOUGHT_PACK => 73.0,
        PLK2_UKULELE_PACK => 80.5,
        _ => 0.0,
    };
    pow(10.0, trim_db / 20.0)
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct StringSpec {
    pub open_midi: i32,
    pub scale_length_m: f64,
    pub outer_diameter_m: f64,
    pub core_diameter_m: f64,
    pub reference_tension_n: f64,
    pub linear_density_kg_per_m: f64,
    pub young_modulus_pa: f64,
    pub t60_seconds_at_100_hz: f64,
    pub t60_seconds_at_1000_hz: f64,
}

impl StringSpec {
    const EMPTY: Self = Self {
        open_midi: 0,
        scale_length_m: 0.0,
        outer_diameter_m: 0.0,
        core_diameter_m: 0.0,
        reference_tension_n: 0.0,
        linear_density_kg_per_m: 0.0,
        young_modulus_pa: 0.0,
        t60_seconds_at_100_hz: 0.0,
        t60_seconds_at_1000_hz: 0.0,
    };
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BodyGeometry {
    pub length_m: f64,
    pub width_m: f64,
    pub thickness_m: f64,
    pub density_kg_per_m3: f64,
    pub young_longitudinal_pa: f64,
    pub young_radial_pa: f64,
    pub shear_lr_pa: f64,
    pub poisson_lr: f64,
    /// Homogenized offset-brace addition to D11, including `E(I + A e^2)`.
    pub brace_rigidity_x_n_m: f64,
    /// Homogenized offset-brace addition to D22, including `E(I + A e^2)`.
    pub brace_rigidity_y_n_m: f64,
    pub bridge_x_over_length: f64,
    pub bridge_y_over_width: f64,
    pub body_volume_m3: f64,
    pub helmholtz_hz: f64,
    pub plate_q: f64,
    pub helmholtz_q: f64,
    pub admittance_scale: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PickupSpec {
    pub position_over_scale: f64,
    pub aperture_m: f64,
}

/// Deterministic circuit-and-loudspeaker reduction for the solid-electric
/// source.  The RC corner frequencies are the reduced poles of a passive
/// three-path tone stack; cabinet modes are driven mechanical speaker/box
/// modes, not a post-render convolution or sample.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ElectricAmpSpec {
    pub pickup_sensitivity_v_per_m_per_s: f64,
    pub input_highpass_hz: f64,
    pub preamp_gain: f64,
    pub preamp_bias: f64,
    pub power_stage_gain: f64,
    pub sag_depth: f64,
    pub sag_attack_seconds: f64,
    pub sag_recovery_seconds: f64,
    pub bass_corner_hz: f64,
    pub treble_corner_hz: f64,
    pub bass_mix: f64,
    pub mid_mix: f64,
    pub treble_mix: f64,
    pub cabinet_frequency_hz: [f64; 4],
    pub cabinet_q: [f64; 4],
    pub cabinet_drive_residue: [f64; 4],
    pub cabinet_radiation_pa_per_velocity: [f64; 4],
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct InstrumentPack {
    pub id: &'static str,
    pub strings: [StringSpec; MAX_STRINGS],
    pub string_count: usize,
    pub body: BodyGeometry,
    /// Positive mechanical conductance at the bridge, in kg/s.
    pub bridge_conductance_kg_per_s: f64,
    pub pickup: Option<PickupSpec>,
    pub amplifier: Option<ElectricAmpSpec>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PluckGesture {
    pub string_index: usize,
    pub fret: u8,
    pub position_over_scale: f64,
    pub width_m: f64,
    pub force_n: f64,
    pub direction: i8,
    pub contact_duration_seconds: f64,
    pub contact_stiffness_n_per_m_pow_3_over_2: f64,
    /// Hunt-Crossley velocity coefficient in s/m.
    pub contact_damping_seconds_per_m: f64,
}

impl PluckGesture {
    pub fn medium_pick(string_index: usize, fret: u8, direction: i8) -> Self {
        Self {
            string_index,
            fret,
            position_over_scale: 0.18,
            width_m: 0.001_5,
            force_n: 1.4,
            direction,
            // Preparation of the string is quasi-static; this duration is the
            // much shorter slip across the pick edge.  Treating the whole
            // preparation as a millisecond force pulse integrates away the
            // very upper modes that a real abrupt release preserves.
            contact_duration_seconds: 0.000_35,
            contact_stiffness_n_per_m_pow_3_over_2: 3.0e6,
            contact_damping_seconds_per_m: 0.08,
        }
    }

    pub fn soft_finger(string_index: usize, fret: u8, direction: i8) -> Self {
        Self {
            string_index,
            fret,
            position_over_scale: 0.24,
            width_m: 0.012,
            force_n: 0.75,
            direction,
            // A fingertip rolls off more slowly than a pick and its wider
            // patch suppresses high modes spatially, not through a long
            // output-side low-pass surrogate.
            contact_duration_seconds: 0.001_0,
            contact_stiffness_n_per_m_pow_3_over_2: 8.0e5,
            contact_damping_seconds_per_m: 0.28,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum PluckedError {
    InvalidSampleRate,
    EmptyStringSet,
    InvalidString { index: usize },
    InvalidBody,
    NonPassiveBridge,
    InvalidPickup,
    InvalidAmplifier,
    InvalidStringIndex,
    InvalidFret,
    InvalidPluckPosition,
    InvalidPluckWidth,
    InvalidPluckForce,
    InvalidPluckDirection,
    InvalidContactDuration,
    InvalidContactLaw,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PluckedRenderPath {
    AcousticBodyRadiation,
    ElectricCabinetRadiation,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct OutputTaps {
    pub direct_string_velocity_m_per_s: f64,
    pub bridge_velocity_m_per_s: f64,
    pub acoustic_body_volume_velocity_m3_per_s: f64,
    pub electric_pickup_velocity_m_per_s: f64,
    pub electric_cabinet_pressure_pa_at_1m: f64,
    pub contact_force_n: f64,
    pub total_mechanical_energy_j: f64,
    pub cumulative_source_work_j: f64,
    pub cumulative_intrinsic_loss_j: f64,
    pub cumulative_bridge_loss_j: f64,
}

#[derive(Clone, Copy, Debug)]
struct StringMode {
    position: f64,
    velocity: f64,
    omega: f64,
    rotation_cos: f64,
    rotation_sin: f64,
    half_velocity_decay: f64,
    bridge_residue: f64,
}

impl StringMode {
    const ZERO: Self = Self {
        position: 0.0,
        velocity: 0.0,
        omega: 1.0,
        rotation_cos: 1.0,
        rotation_sin: 0.0,
        half_velocity_decay: 1.0,
        bridge_residue: 0.0,
    };

    fn energy_j(self) -> f64 {
        0.5 * (self.velocity * self.velocity
            + self.omega * self.omega * self.position * self.position)
    }

    fn rotate_conservative(&mut self) {
        let old_position = self.position;
        let old_velocity = self.velocity;
        self.position =
            self.rotation_cos * old_position + self.rotation_sin * old_velocity / self.omega;
        self.velocity =
            -self.omega * self.rotation_sin * old_position + self.rotation_cos * old_velocity;
    }
}

#[derive(Clone, Copy, Debug)]
struct StringState {
    spec: StringSpec,
    fret: u8,
    vibrating_length_m: f64,
    tuned_tension_n: f64,
    inharmonicity_b: f64,
    mode_count: usize,
    modes: [StringMode; MAX_STRING_MODES],
}

impl StringState {
    const EMPTY: Self = Self {
        spec: StringSpec::EMPTY,
        fret: 0,
        vibrating_length_m: 0.0,
        tuned_tension_n: 0.0,
        inharmonicity_b: 0.0,
        mode_count: 0,
        modes: [StringMode::ZERO; MAX_STRING_MODES],
    };

    fn new(spec: StringSpec, sample_rate_hz: f64, bridge_x: f64) -> Self {
        let mut state = Self {
            spec,
            ..Self::EMPTY
        };
        state.rebuild_modes(0, sample_rate_hz, bridge_x, false);
        state
    }

    fn rebuild_modes(
        &mut self,
        fret: u8,
        sample_rate_hz: f64,
        bridge_x: f64,
        preserve_energy: bool,
    ) {
        let old = self.modes;
        let old_count = self.mode_count;
        let length = self.spec.scale_length_m / pow(2.0, fret as f64 / 12.0);
        let fundamental_hz = midi_frequency_hz(self.spec.open_midi + fret as i32);
        // The named tuning is the boundary condition.  Tension is therefore
        // derived from pitch, scale, and measured linear density rather than
        // trusting mutually inconsistent nominal pack values silently.
        let tension = self.spec.linear_density_kg_per_m
            * (2.0 * length * fundamental_hz)
            * (2.0 * length * fundamental_hz);
        let b = inharmonicity_coefficient(
            self.spec.young_modulus_pa,
            self.spec.core_diameter_m,
            tension,
            length,
        );
        let norm = sqrt(2.0 / (self.spec.linear_density_kg_per_m * length));
        let dt = 1.0 / sample_rate_hz;
        let mut modes = [StringMode::ZERO; MAX_STRING_MODES];
        let mut count = 0usize;
        for harmonic in 1..=MAX_STRING_MODES {
            let n = harmonic as f64;
            // Divide by sqrt(1+B) so the played first partial remains exactly
            // at the named fret pitch while higher partials carry stiffness.
            let frequency_hz = n * fundamental_hz * sqrt((1.0 + b * n * n) / (1.0 + b));
            if frequency_hz >= 0.42 * sample_rate_hz {
                break;
            }
            let omega = TAU * frequency_hz;
            let t60 = interpolated_t60(self.spec, frequency_hz);
            let half_velocity_decay = exp(-LN_1000 * 0.5 * dt / t60);
            let bridge_residue = norm * sin(n * PI * bridge_x);
            let mut mode = StringMode {
                position: 0.0,
                velocity: 0.0,
                omega,
                rotation_cos: cos(omega * dt),
                rotation_sin: sin(omega * dt),
                half_velocity_decay,
                bridge_residue,
            };
            if preserve_energy && harmonic <= old_count {
                let prior = old[harmonic - 1];
                mode.velocity = prior.velocity;
                // Preserve each mode's potential energy under a fret change.
                mode.position = prior.position * prior.omega / omega;
            }
            modes[count] = mode;
            count += 1;
        }
        self.fret = fret;
        self.vibrating_length_m = length;
        self.tuned_tension_n = tension;
        self.inharmonicity_b = b;
        self.mode_count = count;
        self.modes = modes;
    }

    fn energy_j(&self) -> f64 {
        let mut total = 0.0;
        for mode in self.modes.iter().take(self.mode_count) {
            total += mode.energy_j();
        }
        total
    }

    fn port_velocity(&self) -> f64 {
        let mut velocity = 0.0;
        for mode in self.modes.iter().take(self.mode_count) {
            velocity += mode.bridge_residue * mode.velocity;
        }
        velocity
    }

    fn port_residue_norm_squared(&self) -> f64 {
        let mut norm = 0.0;
        for mode in self.modes.iter().take(self.mode_count) {
            norm += mode.bridge_residue * mode.bridge_residue;
        }
        norm
    }

    fn velocity_at(&self, position_over_scale: f64, aperture_m: f64) -> f64 {
        let mut velocity = 0.0;
        let norm = sqrt(2.0 / (self.spec.linear_density_kg_per_m * self.vibrating_length_m));
        for (index, mode) in self.modes.iter().take(self.mode_count).enumerate() {
            let harmonic = index as f64 + 1.0;
            let residue = norm
                * sin(harmonic * PI * position_over_scale)
                * sinc(harmonic * PI * aperture_m / self.vibrating_length_m);
            velocity += residue * mode.velocity;
        }
        velocity
    }

    fn displacement_at(&self, position_over_scale: f64, aperture_m: f64) -> f64 {
        let mut displacement = 0.0;
        let norm = sqrt(2.0 / (self.spec.linear_density_kg_per_m * self.vibrating_length_m));
        for (index, mode) in self.modes.iter().take(self.mode_count).enumerate() {
            let harmonic = index as f64 + 1.0;
            let residue = norm
                * sin(harmonic * PI * position_over_scale)
                * sinc(harmonic * PI * aperture_m / self.vibrating_length_m);
            displacement += residue * mode.position;
        }
        displacement
    }

    fn apply_point_impulse(&mut self, position_over_scale: f64, aperture_m: f64, impulse_n_s: f64) {
        let norm = sqrt(2.0 / (self.spec.linear_density_kg_per_m * self.vibrating_length_m));
        for (index, mode) in self.modes.iter_mut().take(self.mode_count).enumerate() {
            let harmonic = index as f64 + 1.0;
            let residue = norm
                * sin(harmonic * PI * position_over_scale)
                * sinc(harmonic * PI * aperture_m / self.vibrating_length_m);
            mode.velocity += residue * impulse_n_s;
        }
    }

    /// Add the exact retained-modal static deflection produced by a transverse
    /// point force.  For mass-normalized mode `q_n`, static equilibrium is
    /// `omega_n^2 q_n = residue_n F`.  This is the musician's pre-release work,
    /// not an audio-rate force pulse or an output spectral shaper.
    fn apply_static_point_force(
        &mut self,
        position_over_scale: f64,
        aperture_m: f64,
        force_n: f64,
    ) {
        let norm = sqrt(2.0 / (self.spec.linear_density_kg_per_m * self.vibrating_length_m));
        for (index, mode) in self.modes.iter_mut().take(self.mode_count).enumerate() {
            let harmonic = index as f64 + 1.0;
            let residue = norm
                * sin(harmonic * PI * position_over_scale)
                * sinc(harmonic * PI * aperture_m / self.vibrating_length_m);
            mode.position += residue * force_n / (mode.omega * mode.omega);
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BodyModeKind {
    HelmholtzAir,
    StructuralPlate { longitudinal: u8, radial: u8 },
}

#[derive(Clone, Copy, Debug)]
struct BodyMode {
    kind: BodyModeKind,
    position: f64,
    velocity: f64,
    frequency_hz: f64,
    omega: f64,
    rotation_cos: f64,
    rotation_sin: f64,
    half_velocity_decay: f64,
    bridge_residue: f64,
    radiation_residue_m2_per_sqrt_kg: f64,
}

impl BodyMode {
    const ZERO: Self = Self {
        kind: BodyModeKind::StructuralPlate {
            longitudinal: 0,
            radial: 0,
        },
        position: 0.0,
        velocity: 0.0,
        frequency_hz: 0.0,
        omega: 1.0,
        rotation_cos: 1.0,
        rotation_sin: 0.0,
        half_velocity_decay: 1.0,
        bridge_residue: 0.0,
        radiation_residue_m2_per_sqrt_kg: 0.0,
    };

    fn energy_j(self) -> f64 {
        0.5 * (self.velocity * self.velocity
            + self.omega * self.omega * self.position * self.position)
    }

    fn rotate_conservative(&mut self) {
        let old_position = self.position;
        let old_velocity = self.velocity;
        self.position =
            self.rotation_cos * old_position + self.rotation_sin * old_velocity / self.omega;
        self.velocity =
            -self.omega * self.rotation_sin * old_position + self.rotation_cos * old_velocity;
    }
}

#[derive(Clone, Copy, Debug)]
struct ContactState {
    active: bool,
    gesture: PluckGesture,
    elapsed_frames: u32,
    total_frames: u32,
    peak_indentation_m: f64,
    support_displacement_m: f64,
}

impl ContactState {
    const INACTIVE: Self = Self {
        active: false,
        gesture: PluckGesture {
            string_index: 0,
            fret: 0,
            position_over_scale: 0.2,
            width_m: 0.001,
            force_n: 0.0,
            direction: 1,
            contact_duration_seconds: 0.01,
            contact_stiffness_n_per_m_pow_3_over_2: 1.0,
            contact_damping_seconds_per_m: 0.0,
        },
        elapsed_frames: 0,
        total_frames: 0,
        peak_indentation_m: 0.0,
        support_displacement_m: 0.0,
    };
}

#[derive(Clone, Copy, Debug)]
struct CabinetMode {
    position: f64,
    velocity: f64,
    omega: f64,
    rotation_cos: f64,
    rotation_sin: f64,
    half_velocity_decay: f64,
    drive_residue: f64,
    radiation_pa_per_velocity: f64,
}

impl CabinetMode {
    const ZERO: Self = Self {
        position: 0.0,
        velocity: 0.0,
        omega: 1.0,
        rotation_cos: 1.0,
        rotation_sin: 0.0,
        half_velocity_decay: 1.0,
        drive_residue: 0.0,
        radiation_pa_per_velocity: 0.0,
    };

    fn new(
        frequency_hz: f64,
        q: f64,
        drive_residue: f64,
        radiation_pa_per_velocity: f64,
        sample_rate_hz: f64,
    ) -> Self {
        let omega = TAU * frequency_hz;
        let dt = 1.0 / sample_rate_hz;
        Self {
            omega,
            rotation_cos: cos(omega * dt),
            rotation_sin: sin(omega * dt),
            half_velocity_decay: exp(-omega * dt / (4.0 * q)),
            drive_residue,
            radiation_pa_per_velocity,
            ..Self::ZERO
        }
    }

    fn step(&mut self, drive_voltage: f64, dt: f64) {
        // Trapezoidal force impulses around an exact conservative rotation,
        // with symmetric passive damping. Bounded drive therefore cannot
        // destabilize the retained speaker/cabinet state.
        self.velocity += 0.5 * self.drive_residue * drive_voltage * dt;
        self.velocity *= self.half_velocity_decay;
        let old_position = self.position;
        let old_velocity = self.velocity;
        self.position =
            self.rotation_cos * old_position + self.rotation_sin * old_velocity / self.omega;
        self.velocity =
            -self.omega * self.rotation_sin * old_position + self.rotation_cos * old_velocity;
        self.velocity *= self.half_velocity_decay;
        self.velocity += 0.5 * self.drive_residue * drive_voltage * dt;
    }
}

#[derive(Clone, Copy, Debug)]
struct AmplifierState {
    spec: ElectricAmpSpec,
    input_dc_lowpass: f64,
    interstage_dc_lowpass: f64,
    bass_lowpass: f64,
    below_treble_lowpass: f64,
    supply_fraction: f64,
    cabinet_modes: [CabinetMode; 4],
}

impl AmplifierState {
    fn new(spec: ElectricAmpSpec, sample_rate_hz: f64) -> Self {
        let mut cabinet_modes = [CabinetMode::ZERO; 4];
        for (index, mode) in cabinet_modes.iter_mut().enumerate() {
            *mode = CabinetMode::new(
                spec.cabinet_frequency_hz[index],
                spec.cabinet_q[index],
                spec.cabinet_drive_residue[index],
                spec.cabinet_radiation_pa_per_velocity[index],
                sample_rate_hz,
            );
        }
        Self {
            spec,
            input_dc_lowpass: 0.0,
            interstage_dc_lowpass: 0.0,
            bass_lowpass: 0.0,
            below_treble_lowpass: 0.0,
            supply_fraction: 1.0,
            cabinet_modes,
        }
    }

    fn process(&mut self, pickup_velocity_m_per_s: f64, dt: f64) -> f64 {
        let pickup_voltage = pickup_velocity_m_per_s * self.spec.pickup_sensitivity_v_per_m_per_s;
        let input_dc = one_pole_lowpass(
            &mut self.input_dc_lowpass,
            pickup_voltage,
            self.spec.input_highpass_hz,
            dt,
        );
        let grid_voltage = pickup_voltage - input_dc;

        // Two oppositely biased triode reductions. Subtracting the quiescent
        // operating point makes silence exact while retaining the asymmetric
        // transfer curvature that produces even and odd harmonics under drive.
        let first_bias = self.spec.preamp_bias;
        let first = tanh(self.spec.preamp_gain * grid_voltage + first_bias) - tanh(first_bias);
        let interstage_dc = one_pole_lowpass(&mut self.interstage_dc_lowpass, first, 9.0, dt);
        let coupled = first - interstage_dc;
        let second_bias = -0.55 * self.spec.preamp_bias;
        let second = tanh(0.58 * self.spec.preamp_gain * coupled + second_bias) - tanh(second_bias);

        // Passive three-path RC tone stack. The paths are complementary: low,
        // mid = low-passed-minus-bass, and high = input-minus-low-passed.
        let bass = one_pole_lowpass(&mut self.bass_lowpass, second, self.spec.bass_corner_hz, dt);
        let below_treble = one_pole_lowpass(
            &mut self.below_treble_lowpass,
            second,
            self.spec.treble_corner_hz,
            dt,
        );
        let mid = below_treble - bass;
        let treble = second - below_treble;
        let tone_voltage =
            self.spec.bass_mix * bass + self.spec.mid_mix * mid + self.spec.treble_mix * treble;

        // A rectified load current discharges the virtual supply quickly and
        // recovers slowly. Sag both lowers headroom and compresses sustained
        // high drive; the state remains inside [1-depth, 1].
        let load = second.abs().min(1.0);
        let supply_target = 1.0 - self.spec.sag_depth * load;
        let time_constant = if supply_target < self.supply_fraction {
            self.spec.sag_attack_seconds
        } else {
            self.spec.sag_recovery_seconds
        };
        let sag_alpha = 1.0 - exp(-dt / time_constant);
        self.supply_fraction += sag_alpha * (supply_target - self.supply_fraction);
        self.supply_fraction = self.supply_fraction.clamp(1.0 - self.spec.sag_depth, 1.0);

        let power_grid = self.spec.power_stage_gain * tone_voltage / self.supply_fraction;
        let power_voltage = self.supply_fraction * tanh(power_grid);
        let mut pressure_pa = 0.0;
        for mode in &mut self.cabinet_modes {
            mode.step(power_voltage, dt);
            pressure_pa += mode.radiation_pa_per_velocity * mode.velocity;
        }
        pressure_pa
    }
}

#[derive(Clone, Debug)]
pub struct PluckedStem {
    sample_rate_hz: f64,
    dt: f64,
    pack: InstrumentPack,
    strings: [StringState; MAX_STRINGS],
    body_modes: [BodyMode; MAX_BODY_MODES],
    body_mode_count: usize,
    contact: ContactState,
    amplifier: Option<AmplifierState>,
    cumulative_source_work_j: f64,
    cumulative_intrinsic_loss_j: f64,
    cumulative_bridge_loss_j: f64,
}

impl PluckedStem {
    pub fn new(pack: InstrumentPack, sample_rate_hz: f64) -> Result<Self, PluckedError> {
        validate_pack(pack, sample_rate_hz)?;
        let mut strings = [StringState::EMPTY; MAX_STRINGS];
        // Sample the compliant termination just inside the nominal bridge.
        // This is a Galerkin port coordinate, not a post-output coloration.
        let bridge_x = 0.985;
        for (index, slot) in strings.iter_mut().take(pack.string_count).enumerate() {
            *slot = StringState::new(pack.strings[index], sample_rate_hz, bridge_x);
        }
        let (body_modes, body_mode_count) = derive_body_modes(pack.body, sample_rate_hz);
        let amplifier = pack
            .amplifier
            .map(|spec| AmplifierState::new(spec, sample_rate_hz));
        Ok(Self {
            sample_rate_hz,
            dt: 1.0 / sample_rate_hz,
            pack,
            strings,
            body_modes,
            body_mode_count,
            contact: ContactState::INACTIVE,
            amplifier,
            cumulative_source_work_j: 0.0,
            cumulative_intrinsic_loss_j: 0.0,
            cumulative_bridge_loss_j: 0.0,
        })
    }

    pub fn begin_pluck(&mut self, gesture: PluckGesture) -> Result<(), PluckedError> {
        self.validate_gesture(gesture)?;
        let string = &mut self.strings[gesture.string_index];
        if string.fret != gesture.fret {
            string.rebuild_modes(gesture.fret, self.sample_rate_hz, 0.985, true);
        }
        let frames = round(gesture.contact_duration_seconds * self.sample_rate_hz) as u32;
        if frames == 0 {
            return Err(PluckedError::InvalidContactDuration);
        }
        let peak_indentation_m = if gesture.force_n == 0.0 {
            0.0
        } else {
            pow(
                gesture.force_n / gesture.contact_stiffness_n_per_m_pow_3_over_2,
                2.0 / 3.0,
            )
        };
        // The inaudible preparation phase leaves the taut string in its
        // force-balanced deflected shape.  Starting there is essential: a
        // half-sine force from an undeformed string is a low-pass excitation,
        // whereas release of a triangular string shape has the observed
        // 1/n^2 displacement spectrum before pickup/body radiation.
        let before = self.strings[gesture.string_index].energy_j();
        self.strings[gesture.string_index].apply_static_point_force(
            gesture.position_over_scale,
            gesture.width_m,
            gesture.direction as f64 * gesture.force_n,
        );
        let support_displacement_m = self.strings[gesture.string_index]
            .displacement_at(gesture.position_over_scale, gesture.width_m);
        let after = self.strings[gesture.string_index].energy_j();
        self.cumulative_source_work_j += after - before;
        self.contact = ContactState {
            active: true,
            gesture,
            elapsed_frames: 0,
            total_frames: frames,
            peak_indentation_m,
            support_displacement_m,
        };
        Ok(())
    }

    pub fn step(&mut self) -> OutputTaps {
        let mut contact_force = 0.0;
        if self.contact.active {
            contact_force = self.apply_contact();
        }

        self.apply_intrinsic_half_loss();
        self.apply_bridge_coupling(0.5 * self.dt);
        self.rotate_all_modes();
        self.apply_bridge_coupling(0.5 * self.dt);
        self.apply_intrinsic_half_loss();

        let mut direct = 0.0;
        for string in self.strings.iter().take(self.pack.string_count) {
            direct += string.velocity_at(0.36, 0.002);
        }
        let bridge_velocity = self.body_bridge_velocity();
        let mut acoustic = 0.0;
        for mode in self.body_modes.iter().take(self.body_mode_count) {
            acoustic += mode.radiation_residue_m2_per_sqrt_kg * mode.velocity;
        }
        let pickup = match self.pack.pickup {
            Some(spec) => {
                let mut total = 0.0;
                for string in self.strings.iter().take(self.pack.string_count) {
                    total += string.velocity_at(spec.position_over_scale, spec.aperture_m);
                }
                total
            }
            None => 0.0,
        };
        let cabinet_pressure = self.process_electric_pickup_sample(pickup);
        OutputTaps {
            direct_string_velocity_m_per_s: direct,
            bridge_velocity_m_per_s: bridge_velocity,
            acoustic_body_volume_velocity_m3_per_s: acoustic,
            electric_pickup_velocity_m_per_s: pickup,
            electric_cabinet_pressure_pa_at_1m: cabinet_pressure,
            contact_force_n: contact_force,
            total_mechanical_energy_j: self.total_energy_j(),
            cumulative_source_work_j: self.cumulative_source_work_j,
            cumulative_intrinsic_loss_j: self.cumulative_intrinsic_loss_j,
            cumulative_bridge_loss_j: self.cumulative_bridge_loss_j,
        }
    }

    pub fn total_energy_j(&self) -> f64 {
        let mut total = self.body_energy_j();
        for string in self.strings.iter().take(self.pack.string_count) {
            total += string.energy_j();
        }
        total
    }

    pub fn body_energy_j(&self) -> f64 {
        let mut total = 0.0;
        for mode in self.body_modes.iter().take(self.body_mode_count) {
            total += mode.energy_j();
        }
        total
    }

    pub fn string_energy_j(&self, index: usize) -> Option<f64> {
        (index < self.pack.string_count).then(|| self.strings[index].energy_j())
    }

    pub fn contact_active(&self) -> bool {
        self.contact.active
    }

    pub fn string_mode_frequency_hz(&self, string_index: usize, harmonic: usize) -> Option<f64> {
        if string_index >= self.pack.string_count
            || harmonic == 0
            || harmonic > self.strings[string_index].mode_count
        {
            return None;
        }
        Some(self.strings[string_index].modes[harmonic - 1].omega / TAU)
    }

    pub fn string_mode_t60_seconds(&self, string_index: usize, harmonic: usize) -> Option<f64> {
        if string_index >= self.pack.string_count
            || harmonic == 0
            || harmonic > self.strings[string_index].mode_count
        {
            return None;
        }
        let frequency = self.string_mode_frequency_hz(string_index, harmonic)?;
        Some(interpolated_t60(self.strings[string_index].spec, frequency))
    }

    pub fn string_inharmonicity_b(&self, string_index: usize) -> Option<f64> {
        (string_index < self.pack.string_count).then(|| self.strings[string_index].inharmonicity_b)
    }

    pub fn string_tuned_tension_n(&self, string_index: usize) -> Option<f64> {
        (string_index < self.pack.string_count).then(|| self.strings[string_index].tuned_tension_n)
    }

    pub fn body_mode_frequency_hz(&self, mode_index: usize) -> Option<f64> {
        (mode_index < self.body_mode_count).then(|| self.body_modes[mode_index].frequency_hz)
    }

    pub fn body_mode_kind(&self, mode_index: usize) -> Option<BodyModeKind> {
        (mode_index < self.body_mode_count).then(|| self.body_modes[mode_index].kind)
    }

    pub fn body_mode_count(&self) -> usize {
        self.body_mode_count
    }

    /// Feed the physical pickup tap through the retained amplifier circuit and
    /// speaker/cabinet state. Acoustic packs return exact silence.
    pub fn process_electric_pickup_sample(&mut self, pickup_velocity_m_per_s: f64) -> f64 {
        match &mut self.amplifier {
            Some(amplifier) => amplifier.process(pickup_velocity_m_per_s, self.dt),
            None => 0.0,
        }
    }

    pub fn amplifier_supply_fraction(&self) -> Option<f64> {
        self.amplifier
            .as_ref()
            .map(|amplifier| amplifier.supply_fraction)
    }

    pub fn pluck_modal_residue(
        &self,
        string_index: usize,
        harmonic: usize,
        position_over_scale: f64,
        width_m: f64,
    ) -> Option<f64> {
        if string_index >= self.pack.string_count
            || harmonic == 0
            || harmonic > self.strings[string_index].mode_count
        {
            return None;
        }
        let string = &self.strings[string_index];
        let n = harmonic as f64;
        let norm = sqrt(2.0 / (string.spec.linear_density_kg_per_m * string.vibrating_length_m));
        Some(
            norm * sin(n * PI * position_over_scale)
                * sinc(n * PI * width_m / string.vibrating_length_m),
        )
    }

    pub fn pickup_modal_residue(&self, string_index: usize, harmonic: usize) -> Option<f64> {
        let pickup = self.pack.pickup?;
        self.pluck_modal_residue(
            string_index,
            harmonic,
            pickup.position_over_scale,
            pickup.aperture_m,
        )
    }

    fn validate_gesture(&self, gesture: PluckGesture) -> Result<(), PluckedError> {
        if gesture.string_index >= self.pack.string_count {
            return Err(PluckedError::InvalidStringIndex);
        }
        if gesture.fret > 36 {
            return Err(PluckedError::InvalidFret);
        }
        if !gesture.position_over_scale.is_finite()
            || !(0.02..=0.9).contains(&gesture.position_over_scale)
        {
            return Err(PluckedError::InvalidPluckPosition);
        }
        if !gesture.width_m.is_finite() || !(0.001..=0.03).contains(&gesture.width_m) {
            return Err(PluckedError::InvalidPluckWidth);
        }
        if !gesture.force_n.is_finite() || !(0.0..=12.0).contains(&gesture.force_n) {
            return Err(PluckedError::InvalidPluckForce);
        }
        if gesture.direction != -1 && gesture.direction != 1 {
            return Err(PluckedError::InvalidPluckDirection);
        }
        if !gesture.contact_duration_seconds.is_finite()
            || gesture.contact_duration_seconds < self.dt
            || gesture.contact_duration_seconds > 0.1
        {
            return Err(PluckedError::InvalidContactDuration);
        }
        if !gesture.contact_stiffness_n_per_m_pow_3_over_2.is_finite()
            || gesture.contact_stiffness_n_per_m_pow_3_over_2 <= 0.0
            || !gesture.contact_damping_seconds_per_m.is_finite()
            || gesture.contact_damping_seconds_per_m < 0.0
        {
            return Err(PluckedError::InvalidContactLaw);
        }
        Ok(())
    }

    fn apply_contact(&mut self) -> f64 {
        let contact = self.contact;
        let gesture = contact.gesture;
        let direction = gesture.direction as f64;
        let fraction = (contact.elapsed_frames as f64 + 0.5) / contact.total_frames as f64;
        // A raised-cosine retreat begins at the preloaded displacement plus
        // the local Hertz indentation and reaches separation with zero edge
        // velocity.  The one-sided law below naturally releases as soon as
        // the string outruns the retreating pick/fingertip.
        // The initial stick interval retains the force-balanced contact while
        // the pick edge/finger pad rolls to its slip point.  It is followed by
        // a smooth, fast retreat; neither phase is a zero-duration impulse.
        const STICK_FRACTION: f64 = 0.32;
        let (release, release_velocity) = if fraction < STICK_FRACTION {
            (1.0, 0.0)
        } else {
            let slip_fraction = (fraction - STICK_FRACTION) / (1.0 - STICK_FRACTION);
            let slip_phase = PI * slip_fraction;
            (
                0.5 * (1.0 + cos(slip_phase)),
                -0.5 * PI * sin(slip_phase)
                    / ((1.0 - STICK_FRACTION) * gesture.contact_duration_seconds),
            )
        };
        let initial_target =
            contact.support_displacement_m + direction * contact.peak_indentation_m;
        let target = initial_target * release;
        let target_velocity = initial_target * release_velocity;
        let string = &self.strings[gesture.string_index];
        let displacement = string.displacement_at(gesture.position_over_scale, gesture.width_m);
        let velocity = string.velocity_at(gesture.position_over_scale, gesture.width_m);
        let compression = (direction * (target - displacement)).max(0.0);
        let closing_velocity = direction * (target_velocity - velocity);
        let hunt_crossley =
            (1.0 + gesture.contact_damping_seconds_per_m * closing_velocity).max(0.0);
        let magnitude = (gesture.contact_stiffness_n_per_m_pow_3_over_2
            * pow(compression, 1.5)
            * hunt_crossley)
            .min(gesture.force_n);
        let force = direction * magnitude;

        let before = self.strings[gesture.string_index].energy_j();
        self.strings[gesture.string_index].apply_point_impulse(
            gesture.position_over_scale,
            gesture.width_m,
            force * self.dt,
        );
        let after = self.strings[gesture.string_index].energy_j();
        self.cumulative_source_work_j += after - before;

        self.contact.elapsed_frames += 1;
        if self.contact.elapsed_frames >= self.contact.total_frames {
            self.contact.active = false;
        }
        force
    }

    fn apply_intrinsic_half_loss(&mut self) {
        let before = self.total_energy_j();
        for string in self.strings.iter_mut().take(self.pack.string_count) {
            for mode in string.modes.iter_mut().take(string.mode_count) {
                mode.velocity *= mode.half_velocity_decay;
            }
        }
        for mode in self.body_modes.iter_mut().take(self.body_mode_count) {
            mode.velocity *= mode.half_velocity_decay;
        }
        let after = self.total_energy_j();
        self.cumulative_intrinsic_loss_j += (before - after).max(0.0);
    }

    fn rotate_all_modes(&mut self) {
        for string in self.strings.iter_mut().take(self.pack.string_count) {
            for mode in string.modes.iter_mut().take(string.mode_count) {
                mode.rotate_conservative();
            }
        }
        for mode in self.body_modes.iter_mut().take(self.body_mode_count) {
            mode.rotate_conservative();
        }
    }

    fn body_bridge_velocity(&self) -> f64 {
        let mut velocity = 0.0;
        for mode in self.body_modes.iter().take(self.body_mode_count) {
            velocity += mode.bridge_residue * mode.velocity;
        }
        velocity
    }

    fn body_bridge_residue_norm_squared(&self) -> f64 {
        let mut norm = 0.0;
        for mode in self.body_modes.iter().take(self.body_mode_count) {
            norm += mode.bridge_residue * mode.bridge_residue;
        }
        norm
    }

    /// Exact velocity update for a positive conductance interconnecting two
    /// mass-normalized modal ports.  For `delta = a^T v_s - b^T v_b`,
    /// `delta(t) = delta(0) exp(-g (||a||^2+||b||^2)t)`.  Applying its exact
    /// impulse makes the kinetic-energy change non-positive by construction.
    fn apply_bridge_coupling(&mut self, duration_seconds: f64) {
        let body_norm_squared = self.body_bridge_residue_norm_squared();
        if body_norm_squared == 0.0 {
            return;
        }
        for string_index in 0..self.pack.string_count {
            let string_norm_squared = self.strings[string_index].port_residue_norm_squared();
            let string_mode_count = self.strings[string_index].mode_count;
            let norm_squared = string_norm_squared + body_norm_squared;
            if norm_squared == 0.0 {
                continue;
            }
            let delta = self.strings[string_index].port_velocity() - self.body_bridge_velocity();
            let decay =
                exp(-self.pack.bridge_conductance_kg_per_s * norm_squared * duration_seconds);
            let impulse = delta * (1.0 - decay) / norm_squared;
            let before = self.total_energy_j();
            for mode in self.strings[string_index]
                .modes
                .iter_mut()
                .take(string_mode_count)
            {
                mode.velocity -= mode.bridge_residue * impulse;
            }
            for mode in self.body_modes.iter_mut().take(self.body_mode_count) {
                mode.velocity += mode.bridge_residue * impulse;
            }
            let after = self.total_energy_j();
            self.cumulative_bridge_loss_j += (before - after).max(0.0);
        }
    }
}

pub fn inharmonicity_coefficient(
    young_modulus_pa: f64,
    core_diameter_m: f64,
    tension_n: f64,
    length_m: f64,
) -> f64 {
    let diameter_squared = core_diameter_m * core_diameter_m;
    PI * PI * PI * young_modulus_pa * diameter_squared * diameter_squared
        / (64.0 * tension_n * length_m * length_m)
}

pub fn midi_frequency_hz(midi: i32) -> f64 {
    440.0 * pow(2.0, (midi as f64 - 69.0) / 12.0)
}

fn interpolated_t60(spec: StringSpec, frequency_hz: f64) -> f64 {
    let octave_decades = (libm::log(frequency_hz / 100.0) / libm::log(10.0)).clamp(0.0, 1.0);
    spec.t60_seconds_at_100_hz
        + (spec.t60_seconds_at_1000_hz - spec.t60_seconds_at_100_hz) * octave_decades
}

fn sinc(value: f64) -> f64 {
    if value.abs() < 1.0e-9 {
        1.0
    } else {
        sin(value) / value
    }
}

fn one_pole_lowpass(state: &mut f64, input: f64, cutoff_hz: f64, dt: f64) -> f64 {
    let alpha = 1.0 - exp(-TAU * cutoff_hz * dt);
    *state += alpha * (input - *state);
    *state
}

/// Lumped cavity resonance for one circular, unflanged sound hole. The
/// end-correction `1.7 r` accounts for radiation on both faces of a thin top.
pub fn circular_sound_hole_helmholtz_hz(
    body_volume_m3: f64,
    sound_hole_radius_m: f64,
    top_thickness_m: f64,
) -> f64 {
    let speed_of_sound_m_per_s = 343.0;
    let area_m2 = PI * sound_hole_radius_m * sound_hole_radius_m;
    let effective_length_m = top_thickness_m + 1.7 * sound_hole_radius_m;
    speed_of_sound_m_per_s / TAU * sqrt(area_m2 / (body_volume_m3 * effective_length_m))
}

fn validate_pack(pack: InstrumentPack, sample_rate_hz: f64) -> Result<(), PluckedError> {
    if !sample_rate_hz.is_finite() || !(8_000.0..=96_000.0).contains(&sample_rate_hz) {
        return Err(PluckedError::InvalidSampleRate);
    }
    if pack.string_count == 0 || pack.string_count > MAX_STRINGS {
        return Err(PluckedError::EmptyStringSet);
    }
    for (index, string) in pack.strings.iter().take(pack.string_count).enumerate() {
        let valid = (0..=127).contains(&string.open_midi)
            && string.scale_length_m.is_finite()
            && string.scale_length_m > 0.0
            && string.outer_diameter_m.is_finite()
            && string.outer_diameter_m > 0.0
            && string.core_diameter_m.is_finite()
            && string.core_diameter_m > 0.0
            && string.core_diameter_m <= string.outer_diameter_m
            && string.reference_tension_n.is_finite()
            && string.reference_tension_n > 0.0
            && string.linear_density_kg_per_m.is_finite()
            && string.linear_density_kg_per_m > 0.0
            && string.young_modulus_pa.is_finite()
            && string.young_modulus_pa > 0.0
            && string.t60_seconds_at_100_hz.is_finite()
            && string.t60_seconds_at_100_hz > 0.0
            && string.t60_seconds_at_1000_hz.is_finite()
            && string.t60_seconds_at_1000_hz > 0.0;
        if !valid {
            return Err(PluckedError::InvalidString { index });
        }
    }
    let body = pack.body;
    let body_values = [
        body.length_m,
        body.width_m,
        body.thickness_m,
        body.density_kg_per_m3,
        body.young_longitudinal_pa,
        body.young_radial_pa,
        body.shear_lr_pa,
        body.plate_q,
        body.admittance_scale,
    ];
    if body_values
        .iter()
        .any(|value| !value.is_finite() || *value <= 0.0)
        || !body.poisson_lr.is_finite()
        || !(0.0..0.5).contains(&body.poisson_lr)
        || !body.bridge_x_over_length.is_finite()
        || !(0.0..=1.0).contains(&body.bridge_x_over_length)
        || !body.bridge_y_over_width.is_finite()
        || !(0.0..=1.0).contains(&body.bridge_y_over_width)
        || !body.helmholtz_hz.is_finite()
        || body.helmholtz_hz < 0.0
        || !body.body_volume_m3.is_finite()
        || body.body_volume_m3 < 0.0
        || (body.helmholtz_hz > 0.0 && body.body_volume_m3 == 0.0)
        || !body.helmholtz_q.is_finite()
        || body.helmholtz_q <= 0.0
        || !body.brace_rigidity_x_n_m.is_finite()
        || body.brace_rigidity_x_n_m < 0.0
        || !body.brace_rigidity_y_n_m.is_finite()
        || body.brace_rigidity_y_n_m < 0.0
    {
        return Err(PluckedError::InvalidBody);
    }
    if !pack.bridge_conductance_kg_per_s.is_finite() || pack.bridge_conductance_kg_per_s <= 0.0 {
        return Err(PluckedError::NonPassiveBridge);
    }
    if let Some(pickup) = pack.pickup {
        if !pickup.position_over_scale.is_finite()
            || !(0.02..=0.9).contains(&pickup.position_over_scale)
            || !pickup.aperture_m.is_finite()
            || !(0.001..=0.03).contains(&pickup.aperture_m)
        {
            return Err(PluckedError::InvalidPickup);
        }
    }
    if let Some(amplifier) = pack.amplifier {
        let scalar_positive = [
            amplifier.pickup_sensitivity_v_per_m_per_s,
            amplifier.input_highpass_hz,
            amplifier.preamp_gain,
            amplifier.power_stage_gain,
            amplifier.sag_attack_seconds,
            amplifier.sag_recovery_seconds,
            amplifier.bass_corner_hz,
            amplifier.treble_corner_hz,
        ];
        let invalid_modes = (0..4).any(|index| {
            !amplifier.cabinet_frequency_hz[index].is_finite()
                || amplifier.cabinet_frequency_hz[index] <= 0.0
                || amplifier.cabinet_frequency_hz[index] >= 0.42 * sample_rate_hz
                || !amplifier.cabinet_q[index].is_finite()
                || amplifier.cabinet_q[index] <= 0.5
                || !amplifier.cabinet_drive_residue[index].is_finite()
                || amplifier.cabinet_drive_residue[index] <= 0.0
                || !amplifier.cabinet_radiation_pa_per_velocity[index].is_finite()
                || amplifier.cabinet_radiation_pa_per_velocity[index] <= 0.0
        });
        if pack.pickup.is_none()
            || scalar_positive
                .iter()
                .any(|value| !value.is_finite() || *value <= 0.0)
            || !amplifier.preamp_bias.is_finite()
            || amplifier.preamp_bias.abs() > 1.0
            || !amplifier.sag_depth.is_finite()
            || !(0.0..=0.8).contains(&amplifier.sag_depth)
            || !amplifier.bass_mix.is_finite()
            || !(0.0..=1.0).contains(&amplifier.bass_mix)
            || !amplifier.mid_mix.is_finite()
            || !(0.0..=1.0).contains(&amplifier.mid_mix)
            || !amplifier.treble_mix.is_finite()
            || !(0.0..=1.0).contains(&amplifier.treble_mix)
            || amplifier.bass_corner_hz >= amplifier.treble_corner_hz
            || invalid_modes
        {
            return Err(PluckedError::InvalidAmplifier);
        }
    }
    Ok(())
}

fn derive_body_modes(
    geometry: BodyGeometry,
    sample_rate_hz: f64,
) -> ([BodyMode; MAX_BODY_MODES], usize) {
    let mut modes = [BodyMode::ZERO; MAX_BODY_MODES];
    let mut count = 0usize;
    if geometry.helmholtz_hz > 0.0 && geometry.helmholtz_hz < 0.42 * sample_rate_hz {
        let effective_air_mass_kg = 8.0 * 1.204 * geometry.body_volume_m3;
        let norm = geometry.admittance_scale / sqrt(effective_air_mass_kg);
        insert_body_mode(
            &mut modes,
            &mut count,
            make_body_mode(
                BodyModeKind::HelmholtzAir,
                geometry.helmholtz_hz,
                geometry.helmholtz_q,
                0.16 * norm,
                geometry.body_volume_m3 * norm,
                sample_rate_hz,
            ),
        );
    }

    let h3 = geometry.thickness_m * geometry.thickness_m * geometry.thickness_m;
    let nu_rl = geometry.poisson_lr * geometry.young_radial_pa / geometry.young_longitudinal_pa;
    let denom = 12.0 * (1.0 - geometry.poisson_lr * nu_rl);
    let d11 = geometry.young_longitudinal_pa * h3 / denom + geometry.brace_rigidity_x_n_m;
    let d22 = geometry.young_radial_pa * h3 / denom + geometry.brace_rigidity_y_n_m;
    let d12 = geometry.poisson_lr * geometry.young_radial_pa * h3 / denom;
    let d66 = geometry.shear_lr_pa * h3 / 12.0;
    let areal_mass = geometry.density_kg_per_m3 * geometry.thickness_m;
    let modal_norm = 2.0 / sqrt(areal_mass * geometry.length_m * geometry.width_m);

    for m_index in 1..=8 {
        for n_index in 1..=8 {
            let m = m_index as f64;
            let n = n_index as f64;
            let kx = m * PI / geometry.length_m;
            let ky = n * PI / geometry.width_m;
            let kx_squared = kx * kx;
            let ky_squared = ky * ky;
            let omega_squared = (d11 * kx_squared * kx_squared
                + 2.0 * (d12 + 2.0 * d66) * kx_squared * ky_squared
                + d22 * ky_squared * ky_squared)
                / areal_mass;
            let frequency_hz = sqrt(omega_squared) / TAU;
            if frequency_hz >= 0.42 * sample_rate_hz {
                continue;
            }
            let bridge_shape = sin(m * PI * geometry.bridge_x_over_length)
                * sin(n * PI * geometry.bridge_y_over_width);
            let bridge_residue = geometry.admittance_scale * modal_norm * bridge_shape;
            let radiation_average = if m_index % 2 == 1 && n_index % 2 == 1 {
                4.0 / (m * n * PI * PI)
            } else {
                0.0
            };
            let radiation_residue =
                modal_norm * radiation_average * geometry.length_m * geometry.width_m;
            insert_body_mode(
                &mut modes,
                &mut count,
                make_body_mode(
                    BodyModeKind::StructuralPlate {
                        longitudinal: m_index as u8,
                        radial: n_index as u8,
                    },
                    frequency_hz,
                    geometry.plate_q,
                    bridge_residue,
                    radiation_residue,
                    sample_rate_hz,
                ),
            );
        }
    }
    (modes, count)
}

fn make_body_mode(
    kind: BodyModeKind,
    frequency_hz: f64,
    q: f64,
    bridge_residue: f64,
    radiation_residue: f64,
    sample_rate_hz: f64,
) -> BodyMode {
    let omega = TAU * frequency_hz;
    let dt = 1.0 / sample_rate_hz;
    BodyMode {
        kind,
        position: 0.0,
        velocity: 0.0,
        frequency_hz,
        omega,
        rotation_cos: cos(omega * dt),
        rotation_sin: sin(omega * dt),
        half_velocity_decay: exp(-omega * dt / (4.0 * q)),
        bridge_residue,
        radiation_residue_m2_per_sqrt_kg: radiation_residue,
    }
}

fn insert_body_mode(modes: &mut [BodyMode; MAX_BODY_MODES], count: &mut usize, mode: BodyMode) {
    let mut insert_at = *count;
    while insert_at > 0 && modes[insert_at - 1].frequency_hz > mode.frequency_hz {
        insert_at -= 1;
    }
    if *count < MAX_BODY_MODES {
        for index in (insert_at..*count).rev() {
            modes[index + 1] = modes[index];
        }
        modes[insert_at] = mode;
        *count += 1;
    } else if insert_at < MAX_BODY_MODES {
        for index in (insert_at..MAX_BODY_MODES - 1).rev() {
            modes[index + 1] = modes[index];
        }
        modes[insert_at] = mode;
    }
}

fn string(
    open_midi: i32,
    scale_length_m: f64,
    outer_diameter_m: f64,
    core_diameter_m: f64,
    reference_tension_n: f64,
    linear_density_kg_per_m: f64,
    young_modulus_pa: f64,
    t60: [f64; 2],
) -> StringSpec {
    StringSpec {
        open_midi,
        scale_length_m,
        outer_diameter_m,
        core_diameter_m,
        reference_tension_n,
        linear_density_kg_per_m,
        young_modulus_pa,
        t60_seconds_at_100_hz: t60[0],
        t60_seconds_at_1000_hz: t60[1],
    }
}

pub fn dreadnought_pack() -> InstrumentPack {
    let scale = 0.645;
    let young = 200.0e9;
    let mut strings = [StringSpec::EMPTY; MAX_STRINGS];
    strings[0] = string(
        40,
        scale,
        0.001_42,
        0.000_48,
        82.0,
        0.007_2,
        young,
        [6.4, 2.2],
    );
    strings[1] = string(
        45,
        scale,
        0.001_12,
        0.000_46,
        78.0,
        0.004_8,
        young,
        [6.4, 2.2],
    );
    strings[2] = string(
        50,
        scale,
        0.000_89,
        0.000_43,
        75.0,
        0.002_9,
        young,
        [6.4, 2.2],
    );
    strings[3] = string(
        55,
        scale,
        0.000_64,
        0.000_39,
        72.0,
        0.001_55,
        young,
        [6.4, 2.2],
    );
    strings[4] = string(
        59,
        scale,
        0.000_43,
        0.000_43,
        65.0,
        0.000_76,
        young,
        [6.4, 2.2],
    );
    strings[5] = string(
        64,
        scale,
        0.000_33,
        0.000_33,
        63.0,
        0.000_53,
        young,
        [6.4, 2.2],
    );
    InstrumentPack {
        id: "steel-dreadnought",
        strings,
        string_count: 6,
        body: BodyGeometry {
            length_m: 0.51,
            width_m: 0.40,
            thickness_m: 0.003_2,
            density_kg_per_m3: 430.0,
            young_longitudinal_pa: 11.0e9,
            young_radial_pa: 0.72e9,
            shear_lr_pa: 0.68e9,
            poisson_lr: 0.37,
            brace_rigidity_x_n_m: 11.0,
            brace_rigidity_y_n_m: 5.5,
            bridge_x_over_length: 0.57,
            bridge_y_over_width: 0.50,
            body_volume_m3: 0.105,
            helmholtz_hz: 98.0,
            plate_q: 36.0,
            helmholtz_q: 18.0,
            admittance_scale: 1.0,
        },
        bridge_conductance_kg_per_s: 0.008,
        pickup: None,
        amplifier: None,
    }
}

pub fn ukulele_pack() -> InstrumentPack {
    let scale = 0.38;
    let young = 2.5e9;
    // A concert-size outline encloses roughly 3.2 L after the waist, blocks,
    // and neck joint are removed. A 44 mm sound hole through a 2.2 mm top
    // places the lumped air resonance near 189 Hz. The separately derived
    // braced-plate (1,1) mode sits near 216 Hz; neither is mislabeled as the
    // other or forced to the old, implausible 610 Hz value.
    let body_volume_m3 = 0.003_2;
    let top_thickness_m = 0.002_2;
    let sound_hole_radius_m = 0.022;
    let mut strings = [StringSpec::EMPTY; MAX_STRINGS];
    // Re-entrant g4-c4-e4-a4: array order is physical course order, not pitch order.
    strings[0] = string(
        67,
        scale,
        0.000_66,
        0.000_66,
        45.0,
        0.000_44,
        young,
        [2.6, 0.9],
    );
    strings[1] = string(
        60,
        scale,
        0.000_91,
        0.000_91,
        43.0,
        0.000_78,
        young,
        [2.6, 0.9],
    );
    strings[2] = string(
        64,
        scale,
        0.000_75,
        0.000_75,
        42.0,
        0.000_57,
        young,
        [2.6, 0.9],
    );
    strings[3] = string(
        69,
        scale,
        0.000_61,
        0.000_61,
        40.0,
        0.000_39,
        young,
        [2.6, 0.9],
    );
    InstrumentPack {
        id: "reentrant-ukulele",
        strings,
        string_count: 4,
        body: BodyGeometry {
            length_m: 0.28,
            width_m: 0.20,
            thickness_m: top_thickness_m,
            density_kg_per_m3: 420.0,
            young_longitudinal_pa: 10.5e9,
            young_radial_pa: 0.70e9,
            shear_lr_pa: 0.62e9,
            poisson_lr: 0.36,
            brace_rigidity_x_n_m: 32.4,
            brace_rigidity_y_n_m: 15.12,
            bridge_x_over_length: 0.58,
            bridge_y_over_width: 0.50,
            body_volume_m3,
            helmholtz_hz: circular_sound_hole_helmholtz_hz(
                body_volume_m3,
                sound_hole_radius_m,
                top_thickness_m,
            ),
            plate_q: 25.0,
            helmholtz_q: 14.0,
            admittance_scale: 0.54,
        },
        bridge_conductance_kg_per_s: 0.003_2,
        pickup: None,
        amplifier: None,
    }
}

pub fn archtop_pack() -> InstrumentPack {
    let mut pack = dreadnought_pack();
    pack.id = "clean-archtop";
    pack.body.length_m = 0.49;
    pack.body.width_m = 0.38;
    pack.body.thickness_m = 0.004;
    pack.body.density_kg_per_m3 = 560.0;
    pack.body.young_longitudinal_pa = 12.5e9;
    pack.body.young_radial_pa = 1.05e9;
    pack.body.shear_lr_pa = 0.80e9;
    pack.body.body_volume_m3 = 0.073;
    pack.body.helmholtz_hz = 112.0;
    pack.body.admittance_scale = 0.72;
    pack.body.brace_rigidity_x_n_m = 18.0;
    pack.body.brace_rigidity_y_n_m = 8.0;
    pack.bridge_conductance_kg_per_s = 0.005;
    pack.pickup = Some(PickupSpec {
        position_over_scale: 0.24,
        aperture_m: 0.018,
    });
    pack
}

pub fn marshall_electric_pack() -> InstrumentPack {
    let scale = 0.648;
    let young = 200.0e9;
    let mut strings = [StringSpec::EMPTY; MAX_STRINGS];
    strings[0] = string(
        40,
        scale,
        0.001_17,
        0.000_43,
        66.0,
        0.005_7,
        young,
        [7.5, 2.7],
    );
    strings[1] = string(
        45,
        scale,
        0.000_91,
        0.000_41,
        62.0,
        0.003_6,
        young,
        [7.5, 2.7],
    );
    strings[2] = string(
        50,
        scale,
        0.000_66,
        0.000_38,
        59.0,
        0.001_9,
        young,
        [7.5, 2.7],
    );
    strings[3] = string(
        55,
        scale,
        0.000_43,
        0.000_43,
        54.0,
        0.000_86,
        young,
        [7.5, 2.7],
    );
    strings[4] = string(
        59,
        scale,
        0.000_33,
        0.000_33,
        48.0,
        0.000_50,
        young,
        [7.5, 2.7],
    );
    strings[5] = string(
        64,
        scale,
        0.000_25,
        0.000_25,
        46.0,
        0.000_35,
        young,
        [7.5, 2.7],
    );
    InstrumentPack {
        id: "marshall-class-electric-source",
        strings,
        string_count: 6,
        body: BodyGeometry {
            length_m: 0.47,
            width_m: 0.33,
            thickness_m: 0.045,
            density_kg_per_m3: 690.0,
            young_longitudinal_pa: 10.5e9,
            young_radial_pa: 7.5e9,
            shear_lr_pa: 1.1e9,
            poisson_lr: 0.32,
            brace_rigidity_x_n_m: 0.0,
            brace_rigidity_y_n_m: 0.0,
            bridge_x_over_length: 0.78,
            bridge_y_over_width: 0.50,
            body_volume_m3: 0.0,
            // A solid electric body has no enclosed air cavity.  Its body tap
            // is structural only; downstream pickup/amp processing consumes
            // the separate magnetic-pickup tap.
            helmholtz_hz: 0.0,
            plate_q: 70.0,
            helmholtz_q: 55.0,
            admittance_scale: 0.12,
        },
        bridge_conductance_kg_per_s: 0.000_20,
        pickup: Some(PickupSpec {
            position_over_scale: 0.09,
            aperture_m: 0.012,
        }),
        amplifier: Some(ElectricAmpSpec {
            // About 9 mV for a 2.25 m/s bridge-pickup string velocity. Higher
            // sensitivity drove the second triode reduction to its rail even
            // at a soft touch, erasing MIDI-velocity dynamics and letting sag
            // recovery dominate the note envelope.
            pickup_sensitivity_v_per_m_per_s: 0.004,
            input_highpass_hz: 38.0,
            preamp_gain: 18.0,
            preamp_bias: 0.18,
            power_stage_gain: 5.5,
            sag_depth: 0.24,
            sag_attack_seconds: 0.030,
            sag_recovery_seconds: 0.080,
            bass_corner_hz: 180.0,
            treble_corner_hz: 2_200.0,
            bass_mix: 0.56,
            mid_mix: 0.72,
            treble_mix: 0.38,
            cabinet_frequency_hz: [86.0, 420.0, 1_150.0, 2_850.0],
            cabinet_q: [2.2, 1.1, 0.85, 1.2],
            cabinet_drive_residue: [180.0, 120.0, 90.0, 45.0],
            cabinet_radiation_pa_per_velocity: [0.18, 0.12, 0.08, 0.04],
        }),
    }
}

pub fn upright_bass_pack() -> InstrumentPack {
    let scale = 1.05;
    let young = 95.0e9;
    let mut strings = [StringSpec::EMPTY; MAX_STRINGS];
    strings[0] = string(
        28,
        scale,
        0.002_75,
        0.000_80,
        250.0,
        0.027_8,
        young,
        [9.5, 3.2],
    );
    strings[1] = string(
        33,
        scale,
        0.002_25,
        0.000_75,
        235.0,
        0.018_9,
        young,
        [9.5, 3.2],
    );
    strings[2] = string(
        38,
        scale,
        0.001_80,
        0.000_70,
        220.0,
        0.012_4,
        young,
        [9.5, 3.2],
    );
    strings[3] = string(
        43,
        scale,
        0.001_45,
        0.000_65,
        205.0,
        0.008_1,
        young,
        [9.5, 3.2],
    );
    InstrumentPack {
        id: "pizzicato-upright-bass",
        strings,
        string_count: 4,
        body: BodyGeometry {
            length_m: 1.08,
            width_m: 0.66,
            thickness_m: 0.006,
            density_kg_per_m3: 470.0,
            young_longitudinal_pa: 10.0e9,
            young_radial_pa: 0.75e9,
            shear_lr_pa: 0.65e9,
            poisson_lr: 0.36,
            brace_rigidity_x_n_m: 22.0,
            brace_rigidity_y_n_m: 11.0,
            bridge_x_over_length: 0.58,
            bridge_y_over_width: 0.50,
            body_volume_m3: 0.45,
            helmholtz_hz: 75.0,
            plate_q: 42.0,
            helmholtz_q: 20.0,
            admittance_scale: 1.35,
        },
        bridge_conductance_kg_per_s: 0.012,
        pickup: None,
        amplifier: None,
    }
}

fn plk2_pack(pack_index: i32) -> Option<InstrumentPack> {
    match pack_index {
        PLK2_ARCHTOP_PACK => Some(archtop_pack()),
        PLK2_MARSHALL_ELECTRIC_PACK => Some(marshall_electric_pack()),
        PLK2_DREADNOUGHT_PACK => Some(dreadnought_pack()),
        PLK2_UKULELE_PACK => Some(ukulele_pack()),
        _ => None,
    }
}

fn plk2_midi_in_range(pack_index: i32, midi: i32) -> bool {
    match pack_index {
        PLK2_ARCHTOP_PACK | PLK2_MARSHALL_ELECTRIC_PACK | PLK2_DREADNOUGHT_PACK => {
            (40..=88).contains(&midi)
        }
        PLK2_UKULELE_PACK => (60..=93).contains(&midi),
        _ => false,
    }
}

pub fn plk2_render_path(pack_index: i32) -> Option<PluckedRenderPath> {
    let pack = plk2_pack(pack_index)?;
    Some(if pack.amplifier.is_some() {
        PluckedRenderPath::ElectricCabinetRadiation
    } else {
        PluckedRenderPath::AcousticBodyRadiation
    })
}

/// Choose the highest-pitched open course that reaches the requested note
/// without exceeding the physical 24-fret boundary.  Re-entrant ukulele
/// course order is retained in the returned index.
pub fn plk2_string_fret(pack_index: i32, midi: i32) -> Option<(usize, u8)> {
    if !plk2_midi_in_range(pack_index, midi) {
        return None;
    }
    let pack = plk2_pack(pack_index)?;
    let mut selected = None;
    for (index, string) in pack.strings.iter().take(pack.string_count).enumerate() {
        let fret = midi - string.open_midi;
        if (0..=24).contains(&fret)
            && selected.is_none_or(|(_, _, selected_open)| string.open_midi > selected_open)
        {
            selected = Some((index, fret as u8, string.open_midi));
        }
    }
    selected.map(|(index, fret, _)| (index, fret))
}

fn plk2_decay_seconds(pack_index: i32) -> Option<f64> {
    match pack_index {
        PLK2_ARCHTOP_PACK => Some(4.0),
        PLK2_MARSHALL_ELECTRIC_PACK => Some(3.5),
        PLK2_DREADNOUGHT_PACK => Some(5.0),
        PLK2_UKULELE_PACK => Some(3.0),
        _ => None,
    }
}

/// Maximum frame count written by [`plk2_render`]. Zero refuses an invalid
/// pack, pitch, or sample rate. The returned capacity is deterministic and
/// contains no hidden tail allocation.
#[no_mangle]
pub extern "C" fn plk2_note_frames(pack_index: i32, midi: i32, sample_rate: f32) -> i32 {
    if !plk2_midi_in_range(pack_index, midi)
        || !sample_rate.is_finite()
        || !(8_000.0..=96_000.0).contains(&sample_rate)
        || plk2_string_fret(pack_index, midi).is_none()
    {
        return 0;
    }
    (plk2_decay_seconds(pack_index).unwrap_or(0.0) * sample_rate as f64) as i32
}

fn plk2_gesture(pack_index: i32, string_index: usize, fret: u8, velocity: i32) -> PluckGesture {
    let normalized = velocity as f64 / 127.0;
    let mut gesture = if pack_index == PLK2_UKULELE_PACK {
        PluckGesture::soft_finger(string_index, fret, 1)
    } else {
        PluckGesture::medium_pick(string_index, fret, 1)
    };
    let velocity_curve = pow(normalized, 1.35);
    match pack_index {
        PLK2_ARCHTOP_PACK => {
            // A broad, neck-side jazz pick suppresses brittle upper modes at
            // the contact port rather than through an output EQ.
            gesture.position_over_scale = 0.24;
            gesture.width_m = 0.003_2;
            gesture.force_n = 0.24 + 1.95 * velocity_curve;
            gesture.contact_duration_seconds *= 1.18 - 0.16 * normalized;
        }
        PLK2_MARSHALL_ELECTRIC_PACK => {
            gesture.position_over_scale = 0.13;
            gesture.width_m = 0.001_2;
            gesture.force_n = 0.30 + 2.55 * velocity_curve;
            gesture.contact_duration_seconds *= 0.62 - 0.12 * normalized;
        }
        PLK2_DREADNOUGHT_PACK => {
            gesture.position_over_scale = 0.18;
            gesture.width_m = 0.001_8;
            gesture.force_n = 0.28 + 2.35 * velocity_curve;
            gesture.contact_duration_seconds *= 0.86 - 0.14 * normalized;
        }
        PLK2_UKULELE_PACK => {
            gesture.position_over_scale = 0.26;
            gesture.width_m = 0.007;
            gesture.force_n = 0.18 + 1.25 * velocity_curve;
            gesture.contact_duration_seconds *= 1.05 - 0.18 * normalized;
        }
        _ => {}
    }
    gesture
}

/// Safe slice entry used by the raw WASM ABI and exact-source tests. Rendering
/// owns only stack state and writes directly into caller storage.
pub fn plk2_render_slices(
    pack_index: i32,
    midi: i32,
    velocity: i32,
    sample_rate: f32,
    left: &mut [f32],
    right: &mut [f32],
    max_frames: i32,
) -> i32 {
    let capacity = plk2_note_frames(pack_index, midi, sample_rate);
    if capacity == 0 || !(1..=127).contains(&velocity) || max_frames <= 0 {
        return 0;
    }
    let frames = capacity.min(max_frames) as usize;
    if left.len() < frames || right.len() < frames {
        return 0;
    }
    let Some((string_index, fret)) = plk2_string_fret(pack_index, midi) else {
        return 0;
    };
    let Some(full_pack) = plk2_pack(pack_index) else {
        return 0;
    };
    let path = if full_pack.amplifier.is_some() {
        PluckedRenderPath::ElectricCabinetRadiation
    } else {
        PluckedRenderPath::AcousticBodyRadiation
    };
    /* The note-buffer ABI constructs a fresh stem per note, so unplayed
     * courses cannot carry sympathy into another buffer: rotating their zero
     * states on every sample is pure latency. Preserve the selected physical
     * course and the complete shared body/pickup/amp pack, but collapse this
     * ephemeral render stem to that one course. The public PluckedStem remains
     * fully multi-string for phrase/stateful consumers and its sympathy tests. */
    let physical_course_index = string_index;
    let physical_course_count = full_pack.string_count;
    let mut pack = full_pack;
    pack.strings[0] = full_pack.strings[string_index];
    pack.string_count = 1;
    let Ok(mut stem) = PluckedStem::new(pack, sample_rate as f64) else {
        return 0;
    };
    if stem
        .begin_pluck(plk2_gesture(pack_index, 0, fret, velocity))
        .is_err()
    {
        return 0;
    }

    let course = if physical_course_count > 1 {
        physical_course_index as f64 / (physical_course_count - 1) as f64
    } else {
        0.5
    };
    let pan_angle = PI * 0.25 + (course - 0.5) * 0.30;
    let gain_left = cos(pan_angle);
    let gain_right = sin(pan_angle);
    let mut previous_body_flow = 0.0;
    let body_pressure_scale =
        AIR_DENSITY_KG_PER_M3 * sample_rate as f64 / (4.0 * PI * ACOUSTIC_MIC_DISTANCE_M);

    for frame in 0..frames {
        let taps = stem.step();
        let pressure_pa = match path {
            PluckedRenderPath::AcousticBodyRadiation => {
                let flow = taps.acoustic_body_volume_velocity_m3_per_s;
                let pressure = body_pressure_scale * (flow - previous_body_flow);
                previous_body_flow = flow;
                pressure
            }
            PluckedRenderPath::ElectricCabinetRadiation => taps.electric_cabinet_pressure_pa_at_1m,
        };
        let pcm = pressure_pa * REFERENCE_PCM_PER_PASCAL * plk2_listener_trim(pack_index);
        if !pcm.is_finite() || pcm.abs() > f32::MAX as f64 {
            left[..frames].fill(0.0);
            right[..frames].fill(0.0);
            return 0;
        }
        let pcm = pcm.clamp(-1.0, 1.0) as f32;
        left[frame] = (pcm as f64 * gain_left) as f32;
        right[frame] = (pcm as f64 * gain_right) as f32;
    }
    frames as i32
}

fn plk2_buffers_are_disjoint(left: *mut f32, right: *mut f32, frames: usize) -> bool {
    let Some(bytes) = frames.checked_mul(core::mem::size_of::<f32>()) else {
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

/// Render one physical plucked note into disjoint caller-owned stereo scratch
/// buffers. The caller guarantees that each non-null pointer is aligned and
/// writable for at least `min(plk2_note_frames(...), max_frames)` f32 values.
/// Zero reports invalid arguments without constructing a voice.
#[no_mangle]
pub extern "C" fn plk2_render(
    pack_index: i32,
    midi: i32,
    velocity: i32,
    sample_rate: f32,
    left: *mut f32,
    right: *mut f32,
    max_frames: i32,
) -> i32 {
    let capacity = plk2_note_frames(pack_index, midi, sample_rate);
    if capacity == 0 || !(1..=127).contains(&velocity) || max_frames <= 0 {
        return 0;
    }
    let frames = capacity.min(max_frames) as usize;
    if left.is_null()
        || right.is_null()
        || (left as usize) % core::mem::align_of::<f32>() != 0
        || (right as usize) % core::mem::align_of::<f32>() != 0
        || !plk2_buffers_are_disjoint(left, right, frames)
    {
        return 0;
    }
    let out_left = unsafe { core::slice::from_raw_parts_mut(left, frames) };
    let out_right = unsafe { core::slice::from_raw_parts_mut(right, frames) };
    plk2_render_slices(
        pack_index,
        midi,
        velocity,
        sample_rate,
        out_left,
        out_right,
        frames as i32,
    )
}
