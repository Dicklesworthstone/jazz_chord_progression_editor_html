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
//! The steel dreadnought and re-entrant ukulele tops now consume the same
//! 40-triangle DKT authority as the upright bass (`upright_bass_body`):
//! geometry-solved, mass-normalized modes with coherent bridge/radiation
//! residues, one cached eigensolve per pack, plus the pack's reviewed
//! Helmholtz air mode.  Structural damping across the family follows a
//! fractional-Zener tonewood shape anchored at each pack's reviewed plate Q
//! (see `tonewood_zener_q`).  The archtop keeps the bounded analytic
//! orthotropic reduction: its carved arch is no better served by a flat DKT
//! plate, and that missing arch authority stays explicit.  The missing
//! f-hole and primary loss authorities likewise remain explicit.

#[path = "upright_bass_body.rs"]
mod upright_bass_body;

use core::cell::UnsafeCell;
use core::mem::MaybeUninit;
use libm::{cos, exp, floor, pow, round, sin, sqrt};

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
pub const PLK2_UPRIGHT_BASS_PACK: i32 = 4;

/// Explicit retained-stem ABI controls. The segmented renderer is separate
/// from the cache-oriented one-note ABI below: its caller owns the complete
/// multi-string/body/amplifier state and can therefore preserve sympathetic
/// vibration across note events without a hidden global singleton.
pub const PLK2_STEM_EVENT_PLUCK: u32 = 1;
pub const PLK2_STEM_EVENT_RESET: u32 = 2;
const PLK2_STEM_EVENT_MASK: u32 = PLK2_STEM_EVENT_PLUCK | PLK2_STEM_EVENT_RESET;
const PLK2_STEM_STATE_MAGIC: u32 = 0x324b_4c50; // "PLK2" in little endian.
const PLK2_STEM_STATE_VERSION: u32 = 1;
const PLK2_STEM_STATE_MAX_BYTES: usize = 8_192;
const PLK2_STEM_RENDER_MAX_FRAMES: usize = 8_192;
const PLK2_STEM_MAX_ENERGY_J: f64 = 100.0;

// The cooperative chord path keeps the complete physical session in a
// caller-owned, checksummed byte image.  One call advances at most this many
// expensive physical samples or this many cheap reconstruction/copy samples,
// so the browser can yield between calls without changing the sound.
const PLK2_CHORD_STATE_MAGIC: u32 = 0x3243_4c50; // "PLC2" in little endian.
const PLK2_CHORD_STATE_VERSION: u32 = 1;
const PLK2_CHORD_STATE_MAX_BYTES: usize = 12_288;
/* Keep each browser-thread quantum short even at the maximum 12:1 rate
 * divisor. The production opaque runtime retains the decoded physical state
 * between calls, so this responsiveness bound no longer pays a full
 * instrument reconstruction/checksum cost at every yield. */
const PLK2_CHORD_SIMULATION_CHUNK_FRAMES: usize = 256;
const PLK2_CHORD_OUTPUT_CHUNK_FRAMES: usize = 16_384;
const PLK2_CHORD_MAX_OUTPUT_FRAMES: usize = 6 * 96_000;
pub const PLK2_CHORD_STEP_PROGRESS: i32 = 1;
pub const PLK2_CHORD_STEP_COMPLETE: i32 = 2;

const AIR_DENSITY_KG_PER_M3: f64 = 1.204;
const ACOUSTIC_MIC_DISTANCE_M: f64 = 1.0;
// Raw taps remain in pascals at one metre. The note-buffer ABI then crosses
// into a dimensionless ensemble bus, whose absolute scale is conventional:
// this reference maps a 1 Pa peak to -21.9 dBFS before the fixed instrument
// trim below. Keeping these two stages explicit prevents the monitor level
// from being mistaken for extra mechanical energy or acoustic radiation.
const REFERENCE_PCM_PER_PASCAL: f64 = 0.08;

/// Bounded Padé reduction of the static `tanh` transfer used by the three
/// valve stages. Across the entire active grid range its absolute error from
/// the analytic curve is below 1e-4, while avoiding three software transcendental
/// calls per physical sample in the no_std WASM build.
pub fn plk2_triode_tanh(value: f64) -> f64 {
    if value <= -8.0 {
        return -1.0;
    }
    if value >= 8.0 {
        return 1.0;
    }
    let squared = value * value;
    let numerator = value * (135_135.0 + squared * (17_325.0 + squared * (378.0 + squared)));
    let denominator = 135_135.0 + squared * (62_370.0 + squared * (3_150.0 + 28.0 * squared));
    (numerator / denominator).clamp(-1.0, 1.0)
}

fn plk2_cubic_sample(samples: &[f32], center: usize, phase: usize, divisor: usize) -> f32 {
    let x0 = samples[center.saturating_sub(1)] as f64;
    let x1 = samples[center] as f64;
    let x2 = samples[(center + 1).min(samples.len() - 1)] as f64;
    let x3 = samples[(center + 2).min(samples.len() - 1)] as f64;
    let t = phase as f64 / divisor as f64;
    let t_squared = t * t;
    let t_cubed = t_squared * t;
    (0.5 * (2.0 * x1
        + (-x0 + x2) * t
        + (2.0 * x0 - 5.0 * x1 + 4.0 * x2 - x3) * t_squared
        + (-x0 + 3.0 * x1 - 3.0 * x2 + x3) * t_cubed)) as f32
}

/// Reconstruct a low-rate physical render into a separate output buffer.
/// Source and destination separation is an explicit law: in-place expansion
/// overwrites look-ahead samples required by the first fractional phases.
pub fn plk2_cubic_reconstruct(source: &[f32], destination: &mut [f32], divisor: usize) -> bool {
    if divisor < 2 || destination.is_empty() {
        return false;
    }
    let required_source = (destination.len().saturating_sub(1) / divisor).saturating_add(3);
    if source.len() < required_source {
        return false;
    }
    for (frame, sample) in destination.iter_mut().enumerate() {
        *sample = plk2_cubic_sample(source, frame / divisor, frame % divisor, divisor);
    }
    true
}

/// Fixed line/microphone trims for the five complete instruments. These are
/// properties of the output chain, not note measurements: they never inspect
/// pitch, velocity, duration, peak, or RMS, and therefore cannot normalize a
/// render or reshape its attack, spectrum, or decay. The large acoustic trims
/// compensate the deliberately weak far-field modal reduction at the boundary
/// between its physical pressure tap and a practical synthesizer mix; the
/// already amplified electric cabinet needs substantially less trim.
/// Effective radiating area of the near-bridge soundboard patch, in m².
/// The bounded eigensolve keeps only the lowest global modes, whose area
/// integrals under-represent the dense local motion around the bridge — the
/// classic hollow comb of truncated modal radiators.  The bridge-point
/// velocity is already computed for the coupling port in every render path,
/// is spectrally dense, and multiplying it by a fixed patch area adds the
/// missing local radiation through the same volume-flow differentiator.
/// The constant is a property of bridge footprint and listener geometry and
/// never inspects the rendered signal.
fn plk2_bridge_patch_area_m2(pack_index: i32) -> f64 {
    match pack_index {
        PLK2_ARCHTOP_PACK => 1.2e-3,
        PLK2_DREADNOUGHT_PACK => 0.75e-3,
        /* The reviewed ukulele analytic body already carries its compact
         * bridge field; it does not need the guitar DKT patch. */
        PLK2_UKULELE_PACK => 0.0,
        PLK2_UPRIGHT_BASS_PACK => 3.6e-3,
        _ => 0.0,
    }
}

fn plk2_effective_acoustic_flow_m3_per_s(
    pack_index: i32,
    body_flow_m3_per_s: f64,
    bridge_velocity_m_per_s: f64,
) -> f64 {
    body_flow_m3_per_s + plk2_bridge_patch_area_m2(pack_index) * bridge_velocity_m_per_s
}

fn plk2_listener_trim(pack_index: i32) -> f64 {
    let trim_db = match pack_index {
        PLK2_ARCHTOP_PACK => 80.0,
        PLK2_MARSHALL_ELECTRIC_PACK => 40.0,
        PLK2_DREADNOUGHT_PACK => 73.0,
        PLK2_UKULELE_PACK => 81.6,
        PLK2_UPRIGHT_BASS_PACK => 82.0,
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

#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct ChordRadiationTaps {
    acoustic_body_volume_velocity_m3_per_s: f64,
    bridge_velocity_m_per_s: f64,
    electric_cabinet_pressure_pa_at_1m: f64,
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
    GeometrySolvedDkt { ordinal: u8 },
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
    first_quiescent: f64,
    second_quiescent: f64,
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
            first_quiescent: plk2_triode_tanh(spec.preamp_bias),
            second_quiescent: plk2_triode_tanh(-0.55 * spec.preamp_bias),
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
        let first = plk2_triode_tanh(self.spec.preamp_gain * grid_voltage + first_bias)
            - self.first_quiescent;
        let interstage_dc = one_pole_lowpass(&mut self.interstage_dc_lowpass, first, 9.0, dt);
        let coupled = first - interstage_dc;
        let second_bias = -0.55 * self.spec.preamp_bias;
        let second = plk2_triode_tanh(0.58 * self.spec.preamp_gain * coupled + second_bias)
            - self.second_quiescent;

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
        let power_voltage = self.supply_fraction * plk2_triode_tanh(power_grid);
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

#[derive(Clone, Debug)]
struct PluckedStemSession {
    pack_index: i32,
    previous_body_flow_m3_per_s: f64,
    stem: PluckedStem,
}

impl PluckedStemSession {
    fn new(pack_index: i32, sample_rate_hz: f64) -> Option<Self> {
        let pack = plk2_pack(pack_index)?;
        let stem = PluckedStem::new(pack, sample_rate_hz).ok()?;
        Some(Self {
            pack_index,
            previous_body_flow_m3_per_s: 0.0,
            stem,
        })
    }
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
        let (body_modes, body_mode_count) = derive_body_modes(pack, sample_rate_hz)?;
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
        self.contact = self.prepare_pluck_contact(gesture, true)?;
        Ok(())
    }

    /// Prepare one independently retained contact for a simultaneous chord.
    ///
    /// The ordinary stateful stem owns one serialized contact because its
    /// event ABI accepts one gesture at a time.  A chord attack, however, is
    /// one player gesture on several strings and must not be synthesized as
    /// several complete guitars (or several independent amplifier chains).
    /// The bounded chord renderer keeps these short-lived contact states on
    /// its own stack while every string shares this stem's body and amp.
    fn prepare_pluck_contact(
        &mut self,
        gesture: PluckGesture,
        track_energy_ledger: bool,
    ) -> Result<ContactState, PluckedError> {
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
        let before = track_energy_ledger.then(|| self.strings[gesture.string_index].energy_j());
        self.strings[gesture.string_index].apply_static_point_force(
            gesture.position_over_scale,
            gesture.width_m,
            gesture.direction as f64 * gesture.force_n,
        );
        let support_displacement_m = self.strings[gesture.string_index]
            .displacement_at(gesture.position_over_scale, gesture.width_m);
        if let Some(before) = before {
            let after = self.strings[gesture.string_index].energy_j();
            self.cumulative_source_work_j += after - before;
        }
        Ok(ContactState {
            active: true,
            gesture,
            elapsed_frames: 0,
            total_frames: frames,
            peak_indentation_m,
            support_displacement_m,
        })
    }

    pub fn step(&mut self) -> OutputTaps {
        let mut contact_force = 0.0;
        if self.contact.active {
            let mut contact = self.contact;
            contact_force = self.apply_contact_state(&mut contact, true);
            self.contact = contact;
        }

        self.step_after_contact(contact_force, true)
    }

    /// Advance one sample with several physically simultaneous contacts.
    /// Contacts are caller-owned because the one-shot chord ABI never exposes
    /// or serializes them; all resonant and nonlinear instrument state stays
    /// in this shared stem.
    fn step_with_contacts(&mut self, contacts: &mut [ContactState]) -> ChordRadiationTaps {
        for contact in contacts {
            if contact.active {
                let _ = self.apply_contact_state(contact, false);
            }
        }

        self.advance_after_contact(false);

        /* A shared chord consumes exactly one of these two radiation ports.
         * Do not evaluate the public diagnostic string and bridge taps here:
         * `StringState::velocity_at` performs a modal aperture integration,
         * and doing that for every acoustic string on every sample was pure
         * main-thread work with no effect on the rendered PCM. */
        let (acoustic_body_volume_velocity_m3_per_s, bridge_velocity_m_per_s) =
            if self.pack.amplifier.is_none() {
                (
                    self.acoustic_body_volume_velocity_m3_per_s(),
                    self.body_bridge_velocity(),
                )
            } else {
                (0.0, 0.0)
            };
        let electric_cabinet_pressure_pa_at_1m = match self.pack.pickup {
            Some(spec) => {
                let mut pickup_velocity_m_per_s = 0.0;
                for string in self.strings.iter().take(self.pack.string_count) {
                    pickup_velocity_m_per_s +=
                        string.velocity_at(spec.position_over_scale, spec.aperture_m);
                }
                self.process_electric_pickup_sample(pickup_velocity_m_per_s)
            }
            None => 0.0,
        };
        ChordRadiationTaps {
            acoustic_body_volume_velocity_m3_per_s,
            bridge_velocity_m_per_s,
            electric_cabinet_pressure_pa_at_1m,
        }
    }

    #[cfg(test)]
    fn step_with_contacts_full_tap_reference(
        &mut self,
        contacts: &mut [ContactState],
    ) -> ChordRadiationTaps {
        let mut contact_force = 0.0;
        for contact in contacts {
            if contact.active {
                contact_force += self.apply_contact_state(contact, false);
            }
        }
        let taps = self.step_after_contact(contact_force, false);
        ChordRadiationTaps {
            acoustic_body_volume_velocity_m3_per_s: taps.acoustic_body_volume_velocity_m3_per_s,
            bridge_velocity_m_per_s: taps.bridge_velocity_m_per_s,
            electric_cabinet_pressure_pa_at_1m: taps.electric_cabinet_pressure_pa_at_1m,
        }
    }

    fn step_after_contact(&mut self, contact_force: f64, track_energy_ledger: bool) -> OutputTaps {
        self.advance_after_contact(track_energy_ledger);

        let mut direct = 0.0;
        for string in self.strings.iter().take(self.pack.string_count) {
            direct += string.velocity_at(0.36, 0.002);
        }
        let bridge_velocity = self.body_bridge_velocity();
        let acoustic = self.acoustic_body_volume_velocity_m3_per_s();
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
            total_mechanical_energy_j: if track_energy_ledger {
                self.total_energy_j()
            } else {
                0.0
            },
            cumulative_source_work_j: self.cumulative_source_work_j,
            cumulative_intrinsic_loss_j: self.cumulative_intrinsic_loss_j,
            cumulative_bridge_loss_j: self.cumulative_bridge_loss_j,
        }
    }

    fn advance_after_contact(&mut self, track_energy_ledger: bool) {
        self.apply_intrinsic_half_loss(track_energy_ledger);
        self.apply_bridge_coupling(0.5 * self.dt, track_energy_ledger);
        self.rotate_all_modes();
        self.apply_bridge_coupling(0.5 * self.dt, track_energy_ledger);
        self.apply_intrinsic_half_loss(track_energy_ledger);
    }

    fn acoustic_body_volume_velocity_m3_per_s(&self) -> f64 {
        let mut acoustic = 0.0;
        for mode in self.body_modes.iter().take(self.body_mode_count) {
            acoustic += mode.radiation_residue_m2_per_sqrt_kg * mode.velocity;
        }
        acoustic
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

    fn apply_contact_state(
        &mut self,
        contact: &mut ContactState,
        track_energy_ledger: bool,
    ) -> f64 {
        let snapshot = *contact;
        let gesture = snapshot.gesture;
        let direction = gesture.direction as f64;
        let fraction = (snapshot.elapsed_frames as f64 + 0.5) / snapshot.total_frames as f64;
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
            snapshot.support_displacement_m + direction * snapshot.peak_indentation_m;
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

        let before = track_energy_ledger.then(|| self.strings[gesture.string_index].energy_j());
        self.strings[gesture.string_index].apply_point_impulse(
            gesture.position_over_scale,
            gesture.width_m,
            force * self.dt,
        );
        if let Some(before) = before {
            let after = self.strings[gesture.string_index].energy_j();
            self.cumulative_source_work_j += after - before;
        }

        contact.elapsed_frames += 1;
        if contact.elapsed_frames >= contact.total_frames {
            contact.active = false;
        }
        force
    }

    fn apply_intrinsic_half_loss(&mut self, track_energy_ledger: bool) {
        let before = track_energy_ledger.then(|| self.total_energy_j());
        for string in self.strings.iter_mut().take(self.pack.string_count) {
            for mode in string.modes.iter_mut().take(string.mode_count) {
                mode.velocity *= mode.half_velocity_decay;
            }
        }
        for mode in self.body_modes.iter_mut().take(self.body_mode_count) {
            mode.velocity *= mode.half_velocity_decay;
        }
        if let Some(before) = before {
            let after = self.total_energy_j();
            self.cumulative_intrinsic_loss_j += (before - after).max(0.0);
        }
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
    fn apply_bridge_coupling(&mut self, duration_seconds: f64, track_energy_ledger: bool) {
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
            let before = track_energy_ledger.then(|| self.total_energy_j());
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
            if let Some(before) = before {
                let after = self.total_energy_j();
                self.cumulative_bridge_loss_j += (before - after).max(0.0);
            }
        }
    }
}

struct StemStateWriter<'a> {
    bytes: &'a mut [u8],
    offset: usize,
}

impl<'a> StemStateWriter<'a> {
    fn new(bytes: &'a mut [u8]) -> Self {
        Self { bytes, offset: 0 }
    }

    fn write_bytes(&mut self, value: &[u8]) -> Option<()> {
        let end = self.offset.checked_add(value.len())?;
        self.bytes.get_mut(self.offset..end)?.copy_from_slice(value);
        self.offset = end;
        Some(())
    }

    fn write_u8(&mut self, value: u8) -> Option<()> {
        self.write_bytes(&[value])
    }

    fn write_u32(&mut self, value: u32) -> Option<()> {
        self.write_bytes(&value.to_le_bytes())
    }

    fn write_u64(&mut self, value: u64) -> Option<()> {
        self.write_bytes(&value.to_le_bytes())
    }

    fn write_i32(&mut self, value: i32) -> Option<()> {
        self.write_bytes(&value.to_le_bytes())
    }

    fn write_f64(&mut self, value: f64) -> Option<()> {
        self.write_bytes(&value.to_bits().to_le_bytes())
    }
}

struct StemStateReader<'a> {
    bytes: &'a [u8],
    offset: usize,
}

impl<'a> StemStateReader<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, offset: 0 }
    }

    fn read_bytes<const N: usize>(&mut self) -> Option<[u8; N]> {
        let end = self.offset.checked_add(N)?;
        let mut value = [0u8; N];
        value.copy_from_slice(self.bytes.get(self.offset..end)?);
        self.offset = end;
        Some(value)
    }

    fn read_u8(&mut self) -> Option<u8> {
        Some(self.read_bytes::<1>()?[0])
    }

    fn read_u32(&mut self) -> Option<u32> {
        Some(u32::from_le_bytes(self.read_bytes()?))
    }

    fn read_i32(&mut self) -> Option<i32> {
        Some(i32::from_le_bytes(self.read_bytes()?))
    }

    fn read_f64(&mut self) -> Option<f64> {
        Some(f64::from_bits(u64::from_le_bytes(self.read_bytes()?)))
    }
}

fn stem_state_scalar_is_bounded(value: f64) -> bool {
    value.is_finite() && value.abs() <= 1.0e9
}

fn stem_state_checksum(bytes: &[u8]) -> u64 {
    // FNV-1a is not a security boundary; it is a small no_std corruption and
    // stale-handoff detector. The host never accepts caller-authored physical
    // state, and release evidence separately binds the complete WASM bytes.
    let mut hash = 0xcbf2_9ce4_8422_2325u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

fn encode_stem_session(session: &PluckedStemSession, bytes: &mut [u8]) -> Option<usize> {
    let mut writer = StemStateWriter::new(bytes);
    writer.write_u32(PLK2_STEM_STATE_MAGIC)?;
    writer.write_u32(PLK2_STEM_STATE_VERSION)?;
    writer.write_i32(session.pack_index)?;
    writer.write_f64(session.stem.sample_rate_hz)?;
    writer.write_f64(session.previous_body_flow_m3_per_s)?;
    writer.write_f64(session.stem.cumulative_source_work_j)?;
    writer.write_f64(session.stem.cumulative_intrinsic_loss_j)?;
    writer.write_f64(session.stem.cumulative_bridge_loss_j)?;

    for string in &session.stem.strings {
        writer.write_u8(string.fret)?;
        writer.write_u32(u32::try_from(string.mode_count).ok()?)?;
        for mode in &string.modes {
            writer.write_f64(mode.position)?;
            writer.write_f64(mode.velocity)?;
        }
    }

    writer.write_u32(u32::try_from(session.stem.body_mode_count).ok()?)?;
    for mode in &session.stem.body_modes {
        writer.write_f64(mode.position)?;
        writer.write_f64(mode.velocity)?;
    }

    let contact = session.stem.contact;
    writer.write_u8(u8::from(contact.active))?;
    writer.write_u32(u32::try_from(contact.gesture.string_index).ok()?)?;
    writer.write_u8(contact.gesture.fret)?;
    writer.write_f64(contact.gesture.position_over_scale)?;
    writer.write_f64(contact.gesture.width_m)?;
    writer.write_f64(contact.gesture.force_n)?;
    writer.write_i32(contact.gesture.direction as i32)?;
    writer.write_f64(contact.gesture.contact_duration_seconds)?;
    writer.write_f64(contact.gesture.contact_stiffness_n_per_m_pow_3_over_2)?;
    writer.write_f64(contact.gesture.contact_damping_seconds_per_m)?;
    writer.write_u32(contact.elapsed_frames)?;
    writer.write_u32(contact.total_frames)?;
    writer.write_f64(contact.peak_indentation_m)?;
    writer.write_f64(contact.support_displacement_m)?;

    match session.stem.amplifier {
        None => writer.write_u8(0)?,
        Some(amplifier) => {
            writer.write_u8(1)?;
            writer.write_f64(amplifier.input_dc_lowpass)?;
            writer.write_f64(amplifier.interstage_dc_lowpass)?;
            writer.write_f64(amplifier.bass_lowpass)?;
            writer.write_f64(amplifier.below_treble_lowpass)?;
            writer.write_f64(amplifier.supply_fraction)?;
            for mode in amplifier.cabinet_modes {
                writer.write_f64(mode.position)?;
                writer.write_f64(mode.velocity)?;
            }
        }
    }
    let payload_bytes = writer.offset;
    let checksum = stem_state_checksum(&writer.bytes[..payload_bytes]);
    writer.write_u64(checksum)?;
    Some(writer.offset)
}

fn decode_stem_session(bytes: &[u8]) -> Option<PluckedStemSession> {
    decode_stem_session_with_base(bytes, None)
}

fn decode_stem_session_with_base(
    bytes: &[u8],
    base: Option<PluckedStemSession>,
) -> Option<PluckedStemSession> {
    let payload_bytes = bytes.len().checked_sub(core::mem::size_of::<u64>())?;
    let encoded_checksum = u64::from_le_bytes(bytes.get(payload_bytes..)?.try_into().ok()?);
    let payload = bytes.get(..payload_bytes)?;
    if stem_state_checksum(payload) != encoded_checksum {
        return None;
    }
    let mut reader = StemStateReader::new(payload);
    if reader.read_u32()? != PLK2_STEM_STATE_MAGIC || reader.read_u32()? != PLK2_STEM_STATE_VERSION
    {
        return None;
    }
    let pack_index = reader.read_i32()?;
    let sample_rate_hz = reader.read_f64()?;
    let mut session = match base {
        Some(session)
            if session.pack_index == pack_index
                && session.stem.sample_rate_hz.to_bits() == sample_rate_hz.to_bits() =>
        {
            session
        }
        Some(_) => return None,
        None => PluckedStemSession::new(pack_index, sample_rate_hz)?,
    };
    session.previous_body_flow_m3_per_s = reader.read_f64()?;
    session.stem.cumulative_source_work_j = reader.read_f64()?;
    session.stem.cumulative_intrinsic_loss_j = reader.read_f64()?;
    session.stem.cumulative_bridge_loss_j = reader.read_f64()?;
    if !stem_state_scalar_is_bounded(session.previous_body_flow_m3_per_s)
        || !stem_state_scalar_is_bounded(session.stem.cumulative_source_work_j)
        || !stem_state_scalar_is_bounded(session.stem.cumulative_intrinsic_loss_j)
        || !stem_state_scalar_is_bounded(session.stem.cumulative_bridge_loss_j)
        || session.stem.cumulative_intrinsic_loss_j < 0.0
        || session.stem.cumulative_bridge_loss_j < 0.0
    {
        return None;
    }

    for string_index in 0..MAX_STRINGS {
        let fret = reader.read_u8()?;
        let encoded_mode_count = usize::try_from(reader.read_u32()?).ok()?;
        let active = string_index < session.stem.pack.string_count;
        if active {
            if fret > 36 {
                return None;
            }
            session.stem.strings[string_index].rebuild_modes(fret, sample_rate_hz, 0.985, false);
        } else if fret != 0 {
            return None;
        }
        let expected_mode_count = if active {
            session.stem.strings[string_index].mode_count
        } else {
            0
        };
        if encoded_mode_count != expected_mode_count || encoded_mode_count > MAX_STRING_MODES {
            return None;
        }
        for mode_index in 0..MAX_STRING_MODES {
            let position = reader.read_f64()?;
            let velocity = reader.read_f64()?;
            if !stem_state_scalar_is_bounded(position) || !stem_state_scalar_is_bounded(velocity) {
                return None;
            }
            if mode_index < expected_mode_count {
                session.stem.strings[string_index].modes[mode_index].position = position;
                session.stem.strings[string_index].modes[mode_index].velocity = velocity;
            } else if position != 0.0 || velocity != 0.0 {
                return None;
            }
        }
    }

    let encoded_body_mode_count = usize::try_from(reader.read_u32()?).ok()?;
    if encoded_body_mode_count != session.stem.body_mode_count
        || encoded_body_mode_count > MAX_BODY_MODES
    {
        return None;
    }
    for mode_index in 0..MAX_BODY_MODES {
        let position = reader.read_f64()?;
        let velocity = reader.read_f64()?;
        if !stem_state_scalar_is_bounded(position) || !stem_state_scalar_is_bounded(velocity) {
            return None;
        }
        if mode_index < session.stem.body_mode_count {
            session.stem.body_modes[mode_index].position = position;
            session.stem.body_modes[mode_index].velocity = velocity;
        } else if position != 0.0 || velocity != 0.0 {
            return None;
        }
    }

    let active = match reader.read_u8()? {
        0 => false,
        1 => true,
        _ => return None,
    };
    let string_index = usize::try_from(reader.read_u32()?).ok()?;
    let fret = reader.read_u8()?;
    let position_over_scale = reader.read_f64()?;
    let width_m = reader.read_f64()?;
    let force_n = reader.read_f64()?;
    let direction = i8::try_from(reader.read_i32()?).ok()?;
    let contact_duration_seconds = reader.read_f64()?;
    let contact_stiffness_n_per_m_pow_3_over_2 = reader.read_f64()?;
    let contact_damping_seconds_per_m = reader.read_f64()?;
    let elapsed_frames = reader.read_u32()?;
    let total_frames = reader.read_u32()?;
    let peak_indentation_m = reader.read_f64()?;
    let support_displacement_m = reader.read_f64()?;
    let gesture = PluckGesture {
        string_index,
        fret,
        position_over_scale,
        width_m,
        force_n,
        direction,
        contact_duration_seconds,
        contact_stiffness_n_per_m_pow_3_over_2,
        contact_damping_seconds_per_m,
    };
    if session.stem.validate_gesture(gesture).is_err()
        || (active && (total_frames == 0 || elapsed_frames >= total_frames))
        || !stem_state_scalar_is_bounded(peak_indentation_m)
        || !stem_state_scalar_is_bounded(support_displacement_m)
    {
        return None;
    }
    session.stem.contact = ContactState {
        active,
        gesture,
        elapsed_frames,
        total_frames,
        peak_indentation_m,
        support_displacement_m,
    };

    let amplifier_present = reader.read_u8()?;
    match (&mut session.stem.amplifier, amplifier_present) {
        (None, 0) => {}
        (Some(amplifier), 1) => {
            amplifier.input_dc_lowpass = reader.read_f64()?;
            amplifier.interstage_dc_lowpass = reader.read_f64()?;
            amplifier.bass_lowpass = reader.read_f64()?;
            amplifier.below_treble_lowpass = reader.read_f64()?;
            amplifier.supply_fraction = reader.read_f64()?;
            if !stem_state_scalar_is_bounded(amplifier.input_dc_lowpass)
                || !stem_state_scalar_is_bounded(amplifier.interstage_dc_lowpass)
                || !stem_state_scalar_is_bounded(amplifier.bass_lowpass)
                || !stem_state_scalar_is_bounded(amplifier.below_treble_lowpass)
                || !amplifier.supply_fraction.is_finite()
                || amplifier.supply_fraction < 1.0 - amplifier.spec.sag_depth
                || amplifier.supply_fraction > 1.0
            {
                return None;
            }
            for mode in &mut amplifier.cabinet_modes {
                mode.position = reader.read_f64()?;
                mode.velocity = reader.read_f64()?;
                if !stem_state_scalar_is_bounded(mode.position)
                    || !stem_state_scalar_is_bounded(mode.velocity)
                {
                    return None;
                }
            }
        }
        _ => return None,
    }

    if reader.offset != payload.len() {
        return None;
    }
    let energy = session.stem.total_energy_j();
    if !energy.is_finite() || !(0.0..=PLK2_STEM_MAX_ENERGY_J).contains(&energy) {
        return None;
    }
    Some(session)
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
        let tuned_wave_speed = 2.0 * string.scale_length_m * midi_frequency_hz(string.open_midi);
        let tuned_tension = string.linear_density_kg_per_m * tuned_wave_speed * tuned_wave_speed;
        if ((string.reference_tension_n - tuned_tension) / tuned_tension).abs() > 1.0e-9 {
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

/// Frequency-dependent tonewood quality factor with a fractional-Zener
/// shape, anchored at the pack's reviewed reference Q.
///
/// Wood loss is not flat: measured spruce/maple loss factors sit near their
/// low-frequency plateau below ~1 kHz and rise (Q falls) toward the
/// kilohertz range (Haines 1979; Brémaud 2012 tonewood surveys). A
/// fractional Zener captures that decades-wide, nearly-constant-slope
/// behavior with one relaxation ratio and one fractional exponent — the same
/// tier the FrankenSim viscoelastic module (fs-material, commit c966d101)
/// implements offline. The pack's reviewed `plate_q` remains the authority
/// at the 250 Hz anchor; only the shape around it is added here, and the
/// floor keeps every mode passively damped rather than inventing gain.
/// One cached DKT solve per acoustic guitar pack. The eigenproblem depends
/// only on geometry/material (never the sample rate), the shipping WASM is
/// single-threaded without shared memory, and the host serializes exported
/// calls, so the slot cannot be accessed concurrently or re-entered — the
/// same exclusivity argument as the PLK2 chord-runtime slots below.
struct DktBodySlot(UnsafeCell<Option<upright_bass_body::UprightBassBodyAuthority>>);
unsafe impl Sync for DktBodySlot {}
static DKT_DREADNOUGHT_BODY: DktBodySlot = DktBodySlot(UnsafeCell::new(None));
static DKT_UKULELE_BODY: DktBodySlot = DktBodySlot(UnsafeCell::new(None));

fn derive_dkt_guitar_body(
    pack: InstrumentPack,
    sample_rate_hz: f64,
) -> Result<([BodyMode; MAX_BODY_MODES], usize), PluckedError> {
    let geometry = pack.body;
    let slot = match pack.id {
        "steel-dreadnought" => &DKT_DREADNOUGHT_BODY,
        "reentrant-ukulele" => &DKT_UKULELE_BODY,
        _ => return Err(PluckedError::InvalidBody),
    };
    /* SAFETY: single-threaded WASM with host-serialized exports; see
     * DktBodySlot. The write happens at most once per pack per instance. */
    let cached = unsafe { &mut *slot.0.get() };
    let authority = match cached {
        Some(authority) => *authority,
        None => {
            let input = upright_bass_body::UprightBassBodyInput {
                length_m: geometry.length_m,
                width_m: geometry.width_m,
                thickness_m: geometry.thickness_m,
                density_kg_per_m3: geometry.density_kg_per_m3,
                young_longitudinal_pa: geometry.young_longitudinal_pa,
                young_radial_pa: geometry.young_radial_pa,
                shear_lr_pa: geometry.shear_lr_pa,
                poisson_lr: geometry.poisson_lr,
                brace_rigidity_x_n_m: geometry.brace_rigidity_x_n_m,
                brace_rigidity_y_n_m: geometry.brace_rigidity_y_n_m,
                bridge_x_over_length: geometry.bridge_x_over_length,
                bridge_y_over_width: geometry.bridge_y_over_width,
                cavity_volume_m3: geometry.body_volume_m3,
                provisional_plate_q: geometry.plate_q,
            };
            let identity = match pack.id {
                "steel-dreadnought" => upright_bass_body::DREADNOUGHT_IDENTITY,
                _ => upright_bass_body::UKULELE_IDENTITY,
            };
            let derived = upright_bass_body::derive_soundboard_body(input, identity)
                .map_err(|_| PluckedError::InvalidBody)?;
            *cached = Some(derived);
            derived
        }
    };
    let mut modes = [BodyMode::ZERO; MAX_BODY_MODES];
    let mut count = 0usize;
    /* The reviewed guitar packs carry a measured air-resonance frequency, so
     * the Helmholtz mode keeps its analytic form; only the structural plate
     * family moves from the closed-form simply-supported reduction to the
     * geometry-solved DKT authority. */
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
    for (ordinal, body_mode) in authority.modes.into_iter().enumerate() {
        if body_mode.frequency_hz >= 0.42 * sample_rate_hz {
            continue;
        }
        insert_body_mode(
            &mut modes,
            &mut count,
            make_body_mode(
                BodyModeKind::GeometrySolvedDkt {
                    ordinal: ordinal as u8,
                },
                body_mode.frequency_hz,
                tonewood_zener_q(geometry.plate_q, body_mode.frequency_hz),
                geometry.admittance_scale * body_mode.bridge_residue_per_sqrt_kg,
                body_mode.radiation_residue_m2_per_sqrt_kg,
                sample_rate_hz,
            ),
        );
    }
    if count == 0 {
        return Err(PluckedError::InvalidBody);
    }
    Ok((modes, count))
}

fn tonewood_zener_q(reference_q: f64, frequency_hz: f64) -> f64 {
    const ANCHOR_HZ: f64 = 250.0;
    const FRACTIONAL_EXPONENT: f64 = 0.55;
    const RELAXATION_RATIO_AT_ANCHOR: f64 = 0.35;
    let ratio = RELAXATION_RATIO_AT_ANCHOR
        * pow((frequency_hz / ANCHOR_HZ).max(1.0e-3), FRACTIONAL_EXPONENT);
    let anchor_loss = 1.0 + RELAXATION_RATIO_AT_ANCHOR;
    let q = reference_q * anchor_loss / (1.0 + ratio);
    q.max(8.0)
}

fn derive_body_modes(
    pack: InstrumentPack,
    sample_rate_hz: f64,
) -> Result<([BodyMode; MAX_BODY_MODES], usize), PluckedError> {
    let geometry = pack.body;
    let mut modes = [BodyMode::ZERO; MAX_BODY_MODES];
    let mut count = 0usize;
    if pack.id == "steel-dreadnought" {
        return derive_dkt_guitar_body(pack, sample_rate_hz);
    }
    if pack.id == "pizzicato-upright-bass" {
        let authority = upright_bass_body::derive_reviewed_upright_bass_body()
            .map_err(|_| PluckedError::InvalidBody)?;
        let reviewed = authority.input;
        if geometry.length_m != reviewed.length_m
            || geometry.width_m != reviewed.width_m
            || geometry.thickness_m != reviewed.thickness_m
            || geometry.density_kg_per_m3 != reviewed.density_kg_per_m3
            || geometry.young_longitudinal_pa != reviewed.young_longitudinal_pa
            || geometry.young_radial_pa != reviewed.young_radial_pa
            || geometry.shear_lr_pa != reviewed.shear_lr_pa
            || geometry.poisson_lr != reviewed.poisson_lr
            || geometry.brace_rigidity_x_n_m != reviewed.brace_rigidity_x_n_m
            || geometry.brace_rigidity_y_n_m != reviewed.brace_rigidity_y_n_m
            || geometry.bridge_x_over_length != reviewed.bridge_x_over_length
            || geometry.bridge_y_over_width != reviewed.bridge_y_over_width
            || geometry.body_volume_m3 != reviewed.cavity_volume_m3
            || geometry.plate_q != reviewed.provisional_plate_q
            || geometry.helmholtz_hz != 0.0
        {
            return Err(PluckedError::InvalidBody);
        }
        for (ordinal, body_mode) in authority.modes.into_iter().enumerate() {
            if body_mode.frequency_hz >= 0.42 * sample_rate_hz {
                continue;
            }
            insert_body_mode(
                &mut modes,
                &mut count,
                make_body_mode(
                    BodyModeKind::GeometrySolvedDkt {
                        ordinal: ordinal as u8,
                    },
                    body_mode.frequency_hz,
                    body_mode.q,
                    body_mode.bridge_residue_per_sqrt_kg,
                    body_mode.radiation_residue_m2_per_sqrt_kg,
                    sample_rate_hz,
                ),
            );
        }
        return (count == upright_bass_body::BODY_MODE_COUNT)
            .then_some((modes, count))
            .ok_or(PluckedError::InvalidBody);
    }
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
                    tonewood_zener_q(geometry.plate_q, frequency_hz),
                    bridge_residue,
                    radiation_residue,
                    sample_rate_hz,
                ),
            );
        }
    }
    Ok((modes, count))
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
    linear_density_kg_per_m: f64,
    young_modulus_pa: f64,
    t60: [f64; 2],
) -> StringSpec {
    let wave_speed_m_per_s = 2.0 * scale_length_m * midi_frequency_hz(open_midi);
    let reference_tension_n = linear_density_kg_per_m * wave_speed_m_per_s * wave_speed_m_per_s;
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
    strings[0] = string(40, scale, 0.001_42, 0.000_48, 0.007_2, young, [6.4, 2.2]);
    strings[1] = string(45, scale, 0.001_12, 0.000_46, 0.004_8, young, [6.4, 2.2]);
    strings[2] = string(50, scale, 0.000_89, 0.000_43, 0.002_9, young, [6.4, 2.2]);
    strings[3] = string(55, scale, 0.000_64, 0.000_39, 0.001_55, young, [6.4, 2.2]);
    strings[4] = string(59, scale, 0.000_43, 0.000_43, 0.000_76, young, [6.4, 2.2]);
    strings[5] = string(64, scale, 0.000_33, 0.000_33, 0.000_53, young, [6.4, 2.2]);
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
    strings[0] = string(67, scale, 0.000_66, 0.000_66, 0.000_44, young, [2.6, 0.9]);
    strings[1] = string(60, scale, 0.000_91, 0.000_91, 0.000_78, young, [2.6, 0.9]);
    strings[2] = string(64, scale, 0.000_75, 0.000_75, 0.000_57, young, [2.6, 0.9]);
    strings[3] = string(69, scale, 0.000_61, 0.000_61, 0.000_39, young, [2.6, 0.9]);
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
    let scale = 0.648;
    let young = 200.0e9;
    pack.id = "clean-archtop";
    pack.strings[0] = string(40, scale, 0.001_32, 0.000_46, 0.006_43, young, [5.2, 1.8]);
    pack.strings[1] = string(45, scale, 0.001_07, 0.000_44, 0.004_32, young, [5.2, 1.8]);
    pack.strings[2] = string(50, scale, 0.000_84, 0.000_41, 0.002_61, young, [5.2, 1.8]);
    pack.strings[3] = string(55, scale, 0.000_61, 0.000_36, 0.001_43, young, [5.2, 1.8]);
    pack.strings[4] = string(59, scale, 0.000_41, 0.000_41, 0.000_71, young, [5.2, 1.8]);
    pack.strings[5] = string(64, scale, 0.000_30, 0.000_30, 0.000_48, young, [5.2, 1.8]);
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
    strings[0] = string(40, scale, 0.001_17, 0.000_43, 0.005_7, young, [7.5, 2.7]);
    strings[1] = string(45, scale, 0.000_91, 0.000_41, 0.003_6, young, [7.5, 2.7]);
    strings[2] = string(50, scale, 0.000_66, 0.000_38, 0.001_9, young, [7.5, 2.7]);
    strings[3] = string(55, scale, 0.000_43, 0.000_43, 0.000_86, young, [7.5, 2.7]);
    strings[4] = string(59, scale, 0.000_33, 0.000_33, 0.000_50, young, [7.5, 2.7]);
    strings[5] = string(64, scale, 0.000_25, 0.000_25, 0.000_35, young, [7.5, 2.7]);
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
    strings[0] = string(28, scale, 0.002_75, 0.000_80, 0.027_8, young, [9.5, 3.2]);
    strings[1] = string(33, scale, 0.002_25, 0.000_75, 0.018_9, young, [9.5, 3.2]);
    strings[2] = string(38, scale, 0.001_80, 0.000_70, 0.012_4, young, [9.5, 3.2]);
    strings[3] = string(43, scale, 0.001_45, 0.000_65, 0.008_1, young, [9.5, 3.2]);
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
            // The repository has no reviewed aggregate f-hole area or
            // effective neck length.  A fabricated 75 Hz Helmholtz oscillator
            // would contradict the DKT body's explicit sealed-cavity boundary.
            helmholtz_hz: 0.0,
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
        PLK2_UPRIGHT_BASS_PACK => Some(upright_bass_pack()),
        _ => None,
    }
}

fn plk2_midi_in_range(pack_index: i32, midi: i32) -> bool {
    match pack_index {
        PLK2_ARCHTOP_PACK | PLK2_MARSHALL_ELECTRIC_PACK | PLK2_DREADNOUGHT_PACK => {
            (40..=88).contains(&midi)
        }
        PLK2_UKULELE_PACK => (60..=93).contains(&midi),
        PLK2_UPRIGHT_BASS_PACK => (28..=67).contains(&midi),
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

fn assignment_is_lexicographically_before(
    candidate: &[usize; MAX_STRINGS],
    incumbent: &[usize; MAX_STRINGS],
    note_count: usize,
) -> bool {
    for index in 0..note_count {
        if candidate[index] != incumbent[index] {
            return candidate[index] < incumbent[index];
        }
    }
    false
}

#[allow(clippy::too_many_arguments)]
fn assign_chord_courses_recursive(
    pack: InstrumentPack,
    midis: &[i32],
    note_index: usize,
    used_courses: u8,
    score: u64,
    current: &mut [usize; MAX_STRINGS],
    best_score: &mut u64,
    best: &mut [usize; MAX_STRINGS],
) {
    if note_index == midis.len() {
        if score < *best_score
            || (score == *best_score
                && assignment_is_lexicographically_before(current, best, midis.len()))
        {
            *best_score = score;
            *best = *current;
        }
        return;
    }
    let midi = midis[note_index];
    for course in 0..pack.string_count {
        let course_bit = 1_u8 << course;
        if used_courses & course_bit != 0 {
            continue;
        }
        let fret = midi - pack.strings[course].open_midi;
        if !(0..=24).contains(&fret) {
            continue;
        }
        // Lower positions dominate the choice.  The small course term makes
        // equal-fret assignments deterministic without encoding a guitar-
        // specific pitch-order rule (the ukulele pack is re-entrant).
        let fret_score = fret as u64 * fret as u64 * 100 + course as u64;
        let next_score = score.saturating_add(fret_score);
        if next_score > *best_score {
            continue;
        }
        current[note_index] = course;
        assign_chord_courses_recursive(
            pack,
            midis,
            note_index + 1,
            used_courses | course_bit,
            next_score,
            current,
            best_score,
            best,
        );
    }
}

/// Assign a simultaneous chord to distinct physical courses.  A chord which
/// cannot exist on one bounded instrument refuses instead of rendering
/// several independent copies of the guitar and pretending they are strings.
pub fn plk2_chord_string_frets(
    pack_index: i32,
    midis: &[i32],
) -> Option<[(usize, u8); MAX_STRINGS]> {
    let pack = plk2_pack(pack_index)?;
    if midis.is_empty() || midis.len() > pack.string_count || midis.len() > MAX_STRINGS {
        return None;
    }
    for midi in midis {
        if !plk2_midi_in_range(pack_index, *midi) {
            return None;
        }
    }
    let mut current = [0_usize; MAX_STRINGS];
    let mut best = [usize::MAX; MAX_STRINGS];
    let mut best_score = u64::MAX;
    assign_chord_courses_recursive(
        pack,
        midis,
        0,
        0,
        0,
        &mut current,
        &mut best_score,
        &mut best,
    );
    if best_score == u64::MAX {
        return None;
    }
    let mut result = [(0_usize, 0_u8); MAX_STRINGS];
    for index in 0..midis.len() {
        let course = best[index];
        result[index] = (
            course,
            (midis[index] - pack.strings[course].open_midi) as u8,
        );
    }
    Some(result)
}

fn plk2_decay_seconds(pack_index: i32) -> Option<f64> {
    match pack_index {
        PLK2_ARCHTOP_PACK => Some(4.0),
        PLK2_MARSHALL_ELECTRIC_PACK => Some(3.5),
        PLK2_DREADNOUGHT_PACK => Some(5.0),
        PLK2_UKULELE_PACK => Some(3.0),
        PLK2_UPRIGHT_BASS_PACK => Some(6.0),
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
    let mut gesture = if matches!(pack_index, PLK2_UKULELE_PACK | PLK2_UPRIGHT_BASS_PACK) {
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
        PLK2_UPRIGHT_BASS_PACK => {
            // A jazz pizzicato fingertip prepares a far more massive string
            // than the guitar/uke contacts.  The broad patch and millisecond
            // rolloff suppress only the spatially unresolved high modes; the
            // retained stiff-string dispersion, long scale and 450 L body
            // produce the audible growl and bloom without a bass EQ surrogate.
            gesture.position_over_scale = 0.20;
            gesture.width_m = 0.015;
            gesture.force_n = 0.75 + 4.50 * velocity_curve;
            gesture.contact_duration_seconds *= 1.22 - 0.20 * normalized;
            gesture.contact_stiffness_n_per_m_pow_3_over_2 = 1.2e6;
            gesture.contact_damping_seconds_per_m = 0.32;
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
                let flow = plk2_effective_acoustic_flow_m3_per_s(
                    pack_index,
                    taps.acoustic_body_volume_velocity_m3_per_s,
                    taps.bridge_velocity_m_per_s,
                );
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PluckedChordAdvance {
    Progress,
    Complete,
    Invalid,
}

#[derive(Clone, Debug)]
struct PluckedChordSession {
    pack_index: i32,
    output_sample_rate_hz: f64,
    frames: usize,
    rate_divisor: usize,
    simulation_frames: usize,
    simulated_frames: usize,
    reconstructed_frames: usize,
    copied_frames: usize,
    filter_alpha: f64,
    filter_one: f64,
    filter_two: f64,
    note_count: usize,
    canonical_midis: [i32; MAX_STRINGS],
    canonical_velocities: [i32; MAX_STRINGS],
    contacts: [ContactState; MAX_STRINGS],
    stem_session: PluckedStemSession,
}

struct PluckedChordRuntimeControl {
    next_handle: u32,
    active_handle: u32,
}

struct PluckedChordRuntimeControlSlot(UnsafeCell<PluckedChordRuntimeControl>);
struct PluckedChordRuntimeSessionSlot(UnsafeCell<MaybeUninit<PluckedChordSession>>);

/* The shipping WASM is built without atomics or shared memory, and exported
 * calls are synchronous. The TypeScript host additionally serializes every
 * cooperative PLK2 render, so this slot can never be accessed concurrently or
 * re-entered. Keeping that exclusivity in the ABI avoids decoding and
 * reconstructing the complete instrument on every 256-sample browser yield. */
unsafe impl Sync for PluckedChordRuntimeControlSlot {}
unsafe impl Sync for PluckedChordRuntimeSessionSlot {}

/* Keep the two nonzero control words separate from the large uninitialized
 * session slot. The latter then lives in zero-cost WASM BSS instead of
 * inflating the offline single-file artifact with tens of kilobytes of zeros. */
static PLK2_CHORD_RUNTIME_CONTROL: PluckedChordRuntimeControlSlot =
    PluckedChordRuntimeControlSlot(UnsafeCell::new(PluckedChordRuntimeControl {
        next_handle: 1,
        active_handle: 0,
    }));
static PLK2_CHORD_RUNTIME_SESSION: PluckedChordRuntimeSessionSlot =
    PluckedChordRuntimeSessionSlot(UnsafeCell::new(MaybeUninit::uninit()));

fn with_plk2_chord_runtime<T>(
    operation: impl FnOnce(&mut PluckedChordRuntimeControl, &mut MaybeUninit<PluckedChordSession>) -> T,
) -> T {
    // SAFETY: see the slot's single-threaded, non-reentrant WASM invariant.
    unsafe {
        operation(
            &mut *PLK2_CHORD_RUNTIME_CONTROL.0.get(),
            &mut *PLK2_CHORD_RUNTIME_SESSION.0.get(),
        )
    }
}

impl PluckedChordSession {
    fn new(
        pack_index: i32,
        midis: &[i32],
        velocities: &[i32],
        sample_rate: f32,
        max_frames: i32,
        forced_rate_divisor: Option<usize>,
    ) -> Option<Self> {
        if midis.len() != velocities.len()
            || midis.is_empty()
            || midis.len() > MAX_STRINGS
            || velocities
                .iter()
                .any(|velocity| !(1..=127).contains(velocity))
            || !sample_rate.is_finite()
            || !(8_000.0..=96_000.0).contains(&sample_rate)
            || max_frames <= 0
        {
            return None;
        }

        let note_count = midis.len();
        let mut canonical_midis = [0_i32; MAX_STRINGS];
        let mut canonical_velocities = [0_i32; MAX_STRINGS];
        canonical_midis[..note_count].copy_from_slice(midis);
        canonical_velocities[..note_count].copy_from_slice(velocities);
        for index in 1..note_count {
            let mut cursor = index;
            while cursor > 0
                && (canonical_midis[cursor], canonical_velocities[cursor])
                    < (
                        canonical_midis[cursor - 1],
                        canonical_velocities[cursor - 1],
                    )
            {
                canonical_midis.swap(cursor, cursor - 1);
                canonical_velocities.swap(cursor, cursor - 1);
                cursor -= 1;
            }
        }
        let midis = &canonical_midis[..note_count];
        let velocities = &canonical_velocities[..note_count];
        let assignments = plk2_chord_string_frets(pack_index, midis)?;
        let capacity = plk2_note_frames(pack_index, midis[0], sample_rate);
        if capacity <= 0 {
            return None;
        }
        let frames = capacity.min(max_frames) as usize;
        let full_pack = plk2_pack(pack_index)?;
        let mut pack = full_pack;
        for note_index in 0..note_count {
            pack.strings[note_index] = full_pack.strings[assignments[note_index].0];
        }
        for string in pack.strings.iter_mut().skip(note_count) {
            *string = StringSpec::EMPTY;
        }
        pack.string_count = note_count;

        /* The retained string/body/amp system is admitted down to 8 kHz.
         * Advance it at the highest integer-divided rate that preserves that
         * bound, then reconstruct through the existing two-pole anti-image
         * filter.  Running the chord core at 22--24 kHz made Firefox/Safari
         * preparation slower than the 105 BPM event stream even though the
         * discarded band lay above the model's resolved physical output. */
        let selected_rate_divisor = if frames < 3 {
            1_usize
        } else {
            (floor(sample_rate as f64 / 8_000.0) as usize).max(1)
        };
        let mut rate_divisor = forced_rate_divisor.unwrap_or(selected_rate_divisor);
        if rate_divisor > 1 && (frames.saturating_sub(1) / rate_divisor).saturating_add(3) > frames
        {
            rate_divisor = 1;
        }
        if rate_divisor == 0 || sample_rate as f64 / (rate_divisor as f64) < 8_000.0 {
            return None;
        }
        let simulation_rate = sample_rate as f64 / rate_divisor as f64;
        let stem = PluckedStem::new(pack, simulation_rate).ok()?;
        let mut stem_session = PluckedStemSession {
            pack_index,
            previous_body_flow_m3_per_s: 0.0,
            stem,
        };
        let mut contacts = [ContactState::INACTIVE; MAX_STRINGS];
        for note_index in 0..note_count {
            let fret = assignments[note_index].1;
            let gesture = plk2_gesture(pack_index, note_index, fret, velocities[note_index]);
            contacts[note_index] = stem_session
                .stem
                .prepare_pluck_contact(gesture, false)
                .ok()?;
        }
        let simulation_frames = if rate_divisor == 1 {
            frames
        } else {
            (frames.saturating_sub(1) / rate_divisor + 3).min(frames)
        };
        let cutoff_hz = 0.42 * simulation_rate;
        let filter_alpha = 1.0 - exp(-TAU * cutoff_hz / sample_rate as f64);
        Some(Self {
            pack_index,
            output_sample_rate_hz: sample_rate as f64,
            frames,
            rate_divisor,
            simulation_frames,
            simulated_frames: 0,
            reconstructed_frames: 0,
            copied_frames: 0,
            filter_alpha,
            filter_one: 0.0,
            filter_two: 0.0,
            note_count,
            canonical_midis,
            canonical_velocities,
            contacts,
            stem_session,
        })
    }

    fn advance(&mut self, left: &mut [f32], right: &mut [f32]) -> PluckedChordAdvance {
        if left.len() < self.frames || right.len() < self.frames {
            return PluckedChordAdvance::Invalid;
        }
        if self.simulated_frames < self.simulation_frames {
            let stop = (self.simulated_frames + PLK2_CHORD_SIMULATION_CHUNK_FRAMES)
                .min(self.simulation_frames);
            let path = match plk2_render_path(self.pack_index) {
                Some(path) => path,
                None => return PluckedChordAdvance::Invalid,
            };
            let body_pressure_scale = AIR_DENSITY_KG_PER_M3 * self.stem_session.stem.sample_rate_hz
                / (4.0 * PI * ACOUSTIC_MIC_DISTANCE_M);
            let stereo_gain = core::f64::consts::FRAC_1_SQRT_2;
            while self.simulated_frames < stop {
                let frame = self.simulated_frames;
                let taps = self
                    .stem_session
                    .stem
                    .step_with_contacts(&mut self.contacts[..self.note_count]);
                let pressure_pa = match path {
                    PluckedRenderPath::AcousticBodyRadiation => {
                        let flow = plk2_effective_acoustic_flow_m3_per_s(
                            self.pack_index,
                            taps.acoustic_body_volume_velocity_m3_per_s,
                            taps.bridge_velocity_m_per_s,
                        );
                        let pressure = body_pressure_scale
                            * (flow - self.stem_session.previous_body_flow_m3_per_s);
                        self.stem_session.previous_body_flow_m3_per_s = flow;
                        pressure
                    }
                    PluckedRenderPath::ElectricCabinetRadiation => {
                        taps.electric_cabinet_pressure_pa_at_1m
                    }
                };
                let pcm =
                    pressure_pa * REFERENCE_PCM_PER_PASCAL * plk2_listener_trim(self.pack_index);
                if !pcm.is_finite() || pcm.abs() > f32::MAX as f64 {
                    left[..self.frames].fill(0.0);
                    right[..self.frames].fill(0.0);
                    return PluckedChordAdvance::Invalid;
                }
                let sample = (pcm.clamp(-1.0, 1.0) * stereo_gain) as f32;
                right[frame] = sample;
                if self.rate_divisor == 1 {
                    left[frame] = sample;
                }
                self.simulated_frames += 1;
            }
            if self.simulated_frames < self.simulation_frames {
                return PluckedChordAdvance::Progress;
            }
            if self.rate_divisor == 1 {
                self.reconstructed_frames = self.frames;
                self.copied_frames = self.frames;
                return PluckedChordAdvance::Complete;
            }
            return PluckedChordAdvance::Progress;
        }

        if self.reconstructed_frames < self.frames {
            let stop =
                (self.reconstructed_frames + PLK2_CHORD_OUTPUT_CHUNK_FRAMES).min(self.frames);
            while self.reconstructed_frames < stop {
                let frame = self.reconstructed_frames;
                let sample = plk2_cubic_sample(
                    &right[..self.simulation_frames],
                    frame / self.rate_divisor,
                    frame % self.rate_divisor,
                    self.rate_divisor,
                ) as f64;
                self.filter_one += self.filter_alpha * (sample - self.filter_one);
                self.filter_two += self.filter_alpha * (self.filter_one - self.filter_two);
                left[frame] = self.filter_two as f32;
                self.reconstructed_frames += 1;
            }
            return PluckedChordAdvance::Progress;
        }

        if self.copied_frames < self.frames {
            let stop = (self.copied_frames + PLK2_CHORD_OUTPUT_CHUNK_FRAMES).min(self.frames);
            right[self.copied_frames..stop].copy_from_slice(&left[self.copied_frames..stop]);
            self.copied_frames = stop;
        }
        if self.copied_frames == self.frames {
            PluckedChordAdvance::Complete
        } else {
            PluckedChordAdvance::Progress
        }
    }
}

fn encode_chord_session(session: &PluckedChordSession, bytes: &mut [u8]) -> Option<usize> {
    let mut nested = [0_u8; PLK2_STEM_STATE_MAX_BYTES];
    let nested_bytes = encode_stem_session(&session.stem_session, &mut nested)?;
    let mut writer = StemStateWriter::new(bytes);
    writer.write_u32(PLK2_CHORD_STATE_MAGIC)?;
    writer.write_u32(PLK2_CHORD_STATE_VERSION)?;
    writer.write_i32(session.pack_index)?;
    writer.write_f64(session.output_sample_rate_hz)?;
    writer.write_u32(u32::try_from(session.frames).ok()?)?;
    writer.write_u32(u32::try_from(session.rate_divisor).ok()?)?;
    writer.write_u32(u32::try_from(session.simulation_frames).ok()?)?;
    writer.write_u32(u32::try_from(session.simulated_frames).ok()?)?;
    writer.write_u32(u32::try_from(session.reconstructed_frames).ok()?)?;
    writer.write_u32(u32::try_from(session.copied_frames).ok()?)?;
    writer.write_f64(session.filter_one)?;
    writer.write_f64(session.filter_two)?;
    writer.write_u32(u32::try_from(session.note_count).ok()?)?;
    for index in 0..MAX_STRINGS {
        writer.write_i32(session.canonical_midis[index])?;
        writer.write_i32(session.canonical_velocities[index])?;
        writer.write_u8(u8::from(session.contacts[index].active))?;
        writer.write_u32(session.contacts[index].elapsed_frames)?;
    }
    writer.write_u32(u32::try_from(nested_bytes).ok()?)?;
    writer.write_bytes(&nested[..nested_bytes])?;
    let payload_bytes = writer.offset;
    let checksum = stem_state_checksum(&writer.bytes[..payload_bytes]);
    writer.write_u64(checksum)?;
    Some(writer.offset)
}

fn decode_chord_session(bytes: &[u8]) -> Option<PluckedChordSession> {
    let payload_bytes = bytes.len().checked_sub(core::mem::size_of::<u64>())?;
    let encoded_checksum = u64::from_le_bytes(bytes.get(payload_bytes..)?.try_into().ok()?);
    let payload = bytes.get(..payload_bytes)?;
    if stem_state_checksum(payload) != encoded_checksum {
        return None;
    }
    let mut reader = StemStateReader::new(payload);
    if reader.read_u32()? != PLK2_CHORD_STATE_MAGIC
        || reader.read_u32()? != PLK2_CHORD_STATE_VERSION
    {
        return None;
    }
    let pack_index = reader.read_i32()?;
    let output_sample_rate_hz = reader.read_f64()?;
    if !output_sample_rate_hz.is_finite() || !(8_000.0..=96_000.0).contains(&output_sample_rate_hz)
    {
        return None;
    }
    let frames = usize::try_from(reader.read_u32()?).ok()?;
    let rate_divisor = usize::try_from(reader.read_u32()?).ok()?;
    let simulation_frames = usize::try_from(reader.read_u32()?).ok()?;
    let simulated_frames = usize::try_from(reader.read_u32()?).ok()?;
    let reconstructed_frames = usize::try_from(reader.read_u32()?).ok()?;
    let copied_frames = usize::try_from(reader.read_u32()?).ok()?;
    let filter_one = reader.read_f64()?;
    let filter_two = reader.read_f64()?;
    let note_count = usize::try_from(reader.read_u32()?).ok()?;
    if note_count == 0
        || note_count > MAX_STRINGS
        || frames == 0
        || simulated_frames > simulation_frames
        || reconstructed_frames > frames
        || copied_frames > frames
        || (reconstructed_frames > 0 && simulated_frames != simulation_frames)
        || (copied_frames > 0 && reconstructed_frames != frames)
        || !stem_state_scalar_is_bounded(filter_one)
        || !stem_state_scalar_is_bounded(filter_two)
    {
        return None;
    }
    let mut canonical_midis = [0_i32; MAX_STRINGS];
    let mut canonical_velocities = [0_i32; MAX_STRINGS];
    let mut encoded_contact_active = [false; MAX_STRINGS];
    let mut encoded_contact_elapsed = [0_u32; MAX_STRINGS];
    for index in 0..MAX_STRINGS {
        canonical_midis[index] = reader.read_i32()?;
        canonical_velocities[index] = reader.read_i32()?;
        encoded_contact_active[index] = match reader.read_u8()? {
            0 => false,
            1 => true,
            _ => return None,
        };
        encoded_contact_elapsed[index] = reader.read_u32()?;
        if index >= note_count
            && (canonical_midis[index] != 0
                || canonical_velocities[index] != 0
                || encoded_contact_active[index]
                || encoded_contact_elapsed[index] != 0)
        {
            return None;
        }
    }
    let nested_bytes = usize::try_from(reader.read_u32()?).ok()?;
    let nested_end = reader.offset.checked_add(nested_bytes)?;
    let nested = reader.bytes.get(reader.offset..nested_end)?;
    reader.offset = nested_end;
    if reader.offset != payload.len() {
        return None;
    }

    let mut session = PluckedChordSession::new(
        pack_index,
        &canonical_midis[..note_count],
        &canonical_velocities[..note_count],
        output_sample_rate_hz as f32,
        i32::try_from(frames).ok()?,
        None,
    )?;
    if session.output_sample_rate_hz.to_bits() != output_sample_rate_hz.to_bits()
        || session.frames != frames
        || session.rate_divisor != rate_divisor
        || session.simulation_frames != simulation_frames
        || session.canonical_midis != canonical_midis
        || session.canonical_velocities != canonical_velocities
    {
        return None;
    }
    session.stem_session = decode_stem_session_with_base(nested, Some(session.stem_session))?;
    for index in 0..note_count {
        let elapsed = encoded_contact_elapsed[index];
        let total = session.contacts[index].total_frames;
        if elapsed > total || (encoded_contact_active[index] && elapsed >= total) {
            return None;
        }
        session.contacts[index].active = encoded_contact_active[index];
        session.contacts[index].elapsed_frames = elapsed;
    }
    session.simulated_frames = simulated_frames;
    session.reconstructed_frames = reconstructed_frames;
    session.copied_frames = copied_frames;
    session.filter_one = filter_one;
    session.filter_two = filter_two;
    Some(session)
}

pub fn plk2_chord_session_init_slices(
    pack_index: i32,
    midis: &[i32],
    velocities: &[i32],
    sample_rate: f32,
    max_frames: i32,
    state: &mut [u8],
) -> i32 {
    if state.len() < PLK2_CHORD_STATE_MAX_BYTES {
        return 0;
    }
    let Some(session) =
        PluckedChordSession::new(pack_index, midis, velocities, sample_rate, max_frames, None)
    else {
        return 0;
    };
    let mut encoded = [0_u8; PLK2_CHORD_STATE_MAX_BYTES];
    let Some(encoded_bytes) = encode_chord_session(&session, &mut encoded) else {
        return 0;
    };
    state[..PLK2_CHORD_STATE_MAX_BYTES].fill(0);
    state[..encoded_bytes].copy_from_slice(&encoded[..encoded_bytes]);
    i32::try_from(encoded_bytes).unwrap_or(0)
}

pub fn plk2_chord_session_step_slices(
    state: &mut [u8],
    left: &mut [f32],
    right: &mut [f32],
    output_capacity: i32,
) -> i32 {
    if output_capacity <= 0 {
        return 0;
    }
    let Some(mut session) = decode_chord_session(state) else {
        return 0;
    };
    if output_capacity as usize != session.frames
        || left.len() < session.frames
        || right.len() < session.frames
    {
        return 0;
    }
    let status = session.advance(left, right);
    if status == PluckedChordAdvance::Invalid {
        return 0;
    }
    let mut encoded = [0_u8; PLK2_CHORD_STATE_MAX_BYTES];
    let Some(encoded_bytes) = encode_chord_session(&session, &mut encoded) else {
        left[..session.frames].fill(0.0);
        right[..session.frames].fill(0.0);
        return 0;
    };
    if encoded_bytes != state.len() {
        left[..session.frames].fill(0.0);
        right[..session.frames].fill(0.0);
        return 0;
    }
    state.copy_from_slice(&encoded[..encoded_bytes]);
    match status {
        PluckedChordAdvance::Progress => PLK2_CHORD_STEP_PROGRESS,
        PluckedChordAdvance::Complete => PLK2_CHORD_STEP_COMPLETE,
        PluckedChordAdvance::Invalid => 0,
    }
}

pub fn plk2_chord_runtime_init_slices(
    pack_index: i32,
    midis: &[i32],
    velocities: &[i32],
    sample_rate: f32,
    max_frames: i32,
) -> i32 {
    let Some(session) =
        PluckedChordSession::new(pack_index, midis, velocities, sample_rate, max_frames, None)
    else {
        return 0;
    };
    with_plk2_chord_runtime(|runtime, session_slot| {
        let handle = runtime.next_handle.max(1).min(i32::MAX as u32);
        runtime.next_handle = if handle == i32::MAX as u32 {
            1
        } else {
            handle + 1
        };
        if runtime.active_handle != 0 {
            // SAFETY: a nonzero handle is the slot's initialization bit.
            unsafe { session_slot.assume_init_drop() };
        }
        session_slot.write(session);
        runtime.active_handle = handle;
        handle as i32
    })
}

pub fn plk2_chord_runtime_step_slices(
    handle: i32,
    left: &mut [f32],
    right: &mut [f32],
    output_capacity: i32,
) -> i32 {
    if handle <= 0 || output_capacity <= 0 {
        return 0;
    }
    with_plk2_chord_runtime(|runtime, session_slot| {
        if runtime.active_handle != handle as u32 {
            return 0;
        }
        // SAFETY: the exact active handle proves init wrote the session.
        let session = unsafe { session_slot.assume_init_mut() };
        if output_capacity as usize != session.frames
            || left.len() < session.frames
            || right.len() < session.frames
        {
            return 0;
        }
        match session.advance(left, right) {
            PluckedChordAdvance::Progress => PLK2_CHORD_STEP_PROGRESS,
            PluckedChordAdvance::Complete => {
                // SAFETY: the exact active handle still owns this session.
                unsafe { session_slot.assume_init_drop() };
                runtime.active_handle = 0;
                PLK2_CHORD_STEP_COMPLETE
            }
            PluckedChordAdvance::Invalid => {
                // SAFETY: the exact active handle still owns this session.
                unsafe { session_slot.assume_init_drop() };
                runtime.active_handle = 0;
                0
            }
        }
    })
}

pub fn plk2_chord_runtime_reset_handle(handle: i32) -> i32 {
    if handle <= 0 {
        return 0;
    }
    with_plk2_chord_runtime(|runtime, session_slot| {
        if runtime.active_handle != handle as u32 {
            return 0;
        }
        // SAFETY: the exact active handle proves init wrote the session.
        unsafe { session_slot.assume_init_drop() };
        runtime.active_handle = 0;
        1
    })
}

/// Render one simultaneous plucked chord through one shared body and, for the
/// electric pack, one shared nonlinear pickup/amp/cabinet chain.  This is the
/// physical object the player actually strikes; summing independently rendered
/// guitars gives every note its own soundboard and amplifier and is both slow
/// and audibly wrong.
pub fn plk2_render_chord_slices(
    pack_index: i32,
    midis: &[i32],
    velocities: &[i32],
    sample_rate: f32,
    left: &mut [f32],
    right: &mut [f32],
    max_frames: i32,
) -> i32 {
    plk2_render_chord_slices_inner(
        pack_index,
        midis,
        velocities,
        sample_rate,
        left,
        right,
        max_frames,
        None,
    )
}

#[allow(clippy::too_many_arguments)]
fn plk2_render_chord_slices_inner(
    pack_index: i32,
    midis: &[i32],
    velocities: &[i32],
    sample_rate: f32,
    left: &mut [f32],
    right: &mut [f32],
    max_frames: i32,
    forced_rate_divisor: Option<usize>,
) -> i32 {
    let Some(mut session) = PluckedChordSession::new(
        pack_index,
        midis,
        velocities,
        sample_rate,
        max_frames,
        forced_rate_divisor,
    ) else {
        return 0;
    };
    if left.len() < session.frames || right.len() < session.frames {
        return 0;
    }
    loop {
        match session.advance(left, right) {
            PluckedChordAdvance::Progress => {}
            PluckedChordAdvance::Complete => return session.frames as i32,
            PluckedChordAdvance::Invalid => return 0,
        }
    }
}

/// Independent-test seam for comparing the bounded production-rate render to
/// the same shared instrument evolved at the caller's full output rate.
#[cfg(test)]
pub fn plk2_render_chord_slices_full_rate_reference(
    pack_index: i32,
    midis: &[i32],
    velocities: &[i32],
    sample_rate: f32,
    left: &mut [f32],
    right: &mut [f32],
    max_frames: i32,
) -> i32 {
    plk2_render_chord_slices_inner(
        pack_index,
        midis,
        velocities,
        sample_rate,
        left,
        right,
        max_frames,
        Some(1),
    )
}

/// Test-only proof that omitting unused public diagnostic taps does not alter
/// either radiation port or any retained physical state used by a later
/// sample. The full-tap stem is the pre-optimization execution path.
#[cfg(test)]
pub fn plk2_chord_radiation_taps_match_full_reference(
    pack_index: i32,
    midis: &[i32],
    velocities: &[i32],
    frames: usize,
) -> Result<(), &'static str> {
    let Some(session) = PluckedChordSession::new(
        pack_index,
        midis,
        velocities,
        8_000.0,
        i32::try_from(frames).unwrap_or(0),
        Some(1),
    ) else {
        return Err("session-refused");
    };
    if frames == 0 || session.frames != frames {
        return Err("frame-count");
    }
    let mut optimized = session.clone();
    let mut full_reference = session;
    let Some(render_path) = plk2_render_path(pack_index) else {
        return Err("render-path");
    };
    for _ in 0..frames {
        let optimized_taps = optimized
            .stem_session
            .stem
            .step_with_contacts(&mut optimized.contacts[..optimized.note_count]);
        let reference_taps = full_reference
            .stem_session
            .stem
            .step_with_contacts_full_tap_reference(
                &mut full_reference.contacts[..full_reference.note_count],
            );
        if render_path == PluckedRenderPath::AcousticBodyRadiation
            && optimized_taps
                .acoustic_body_volume_velocity_m3_per_s
                .to_bits()
                != reference_taps
                    .acoustic_body_volume_velocity_m3_per_s
                    .to_bits()
        {
            return Err("acoustic-radiation");
        }
        if render_path == PluckedRenderPath::AcousticBodyRadiation
            && optimized_taps.bridge_velocity_m_per_s.to_bits()
                != reference_taps.bridge_velocity_m_per_s.to_bits()
        {
            return Err("bridge-radiation");
        }
        if render_path == PluckedRenderPath::ElectricCabinetRadiation
            && optimized_taps.electric_cabinet_pressure_pa_at_1m.to_bits()
                != reference_taps.electric_cabinet_pressure_pa_at_1m.to_bits()
        {
            return Err("electric-radiation");
        }
    }

    let mut optimized_bytes = [0_u8; PLK2_CHORD_STATE_MAX_BYTES];
    let mut reference_bytes = [0_u8; PLK2_CHORD_STATE_MAX_BYTES];
    let Some(optimized_len) = encode_chord_session(&optimized, &mut optimized_bytes) else {
        return Err("optimized-encode");
    };
    let Some(reference_len) = encode_chord_session(&full_reference, &mut reference_bytes) else {
        return Err("reference-encode");
    };
    if optimized_len != reference_len {
        return Err("encoded-length");
    }
    if optimized_bytes[..optimized_len] != reference_bytes[..reference_len] {
        return Err("retained-state");
    }
    Ok(())
}

/// Fixed upper bound for the explicit retained-stem state buffer. The encoded
/// byte count returned by [`plk2_stem_init`] is smaller and must be passed back
/// exactly; the upper bound lets a no-allocation host reserve caller-owned
/// scratch before it knows which instrument pack is selected.
#[no_mangle]
pub extern "C" fn plk2_stem_state_max_bytes() -> i32 {
    PLK2_STEM_STATE_MAX_BYTES as i32
}

/// Fixed work bound for one segmented retained-stem call.
#[no_mangle]
pub extern "C" fn plk2_stem_render_max_frames() -> i32 {
    PLK2_STEM_RENDER_MAX_FRAMES as i32
}

/// Safe initialization seam used by the raw WASM ABI and exact-source tests.
/// The returned prefix is a canonical little-endian state image; unused tail
/// capacity is zeroed so previous instruments cannot leak into a new stem.
pub fn plk2_stem_init_slice(pack_index: i32, sample_rate: f32, state: &mut [u8]) -> i32 {
    if state.len() < PLK2_STEM_STATE_MAX_BYTES || !sample_rate.is_finite() {
        return 0;
    }
    let Some(session) = PluckedStemSession::new(pack_index, sample_rate as f64) else {
        return 0;
    };
    state[..PLK2_STEM_STATE_MAX_BYTES].fill(0);
    encode_stem_session(&session, &mut state[..PLK2_STEM_STATE_MAX_BYTES])
        .and_then(|bytes| i32::try_from(bytes).ok())
        .unwrap_or(0)
}

/// Initialize a caller-owned retained physical stem. The pointer may be byte
/// aligned and must be writable for at least `plk2_stem_state_max_bytes()`.
#[no_mangle]
pub extern "C" fn plk2_stem_init(
    pack_index: i32,
    sample_rate: f32,
    state: *mut u8,
    state_capacity: i32,
) -> i32 {
    if state.is_null() || state_capacity < PLK2_STEM_STATE_MAX_BYTES as i32 {
        return 0;
    }
    let state = unsafe { core::slice::from_raw_parts_mut(state, PLK2_STEM_STATE_MAX_BYTES) };
    plk2_stem_init_slice(pack_index, sample_rate, state)
}

/// Read-only diagnostic for independent phrase tests. It decodes the same
/// canonical bytes consumed by the WASM call rather than reaching around the
/// ABI into a separately constructed production stem.
pub fn plk2_stem_state_string_energy_j(state: &[u8], string_index: usize) -> Option<f64> {
    decode_stem_session(state)?
        .stem
        .string_energy_j(string_index)
}

/// Render one bounded segment while retaining all strings, body modes,
/// contact, amplifier, and radiation-history state in the caller-owned byte
/// image. `PLUCK` begins one physical gesture; `RESET` first clears the stem
/// and may be combined with `PLUCK`. Calls without `PLUCK` must pass midi=-1
/// and velocity=0, preventing stale host arguments from becoming hidden events.
pub fn plk2_stem_render_slices(
    state: &mut [u8],
    midi: i32,
    velocity: i32,
    event_flags: u32,
    left: &mut [f32],
    right: &mut [f32],
    max_frames: i32,
) -> i32 {
    if event_flags & !PLK2_STEM_EVENT_MASK != 0
        || max_frames <= 0
        || max_frames as usize > PLK2_STEM_RENDER_MAX_FRAMES
    {
        return 0;
    }
    let frames = max_frames as usize;
    if left.len() < frames || right.len() < frames {
        return 0;
    }
    let Some(mut session) = decode_stem_session(state) else {
        return 0;
    };
    if event_flags & PLK2_STEM_EVENT_RESET != 0 {
        let Some(reset) = PluckedStemSession::new(session.pack_index, session.stem.sample_rate_hz)
        else {
            return 0;
        };
        session = reset;
    }
    if event_flags & PLK2_STEM_EVENT_PLUCK != 0 {
        if !(1..=127).contains(&velocity) {
            return 0;
        }
        let Some((string_index, fret)) = plk2_string_fret(session.pack_index, midi) else {
            return 0;
        };
        if session
            .stem
            .begin_pluck(plk2_gesture(
                session.pack_index,
                string_index,
                fret,
                velocity,
            ))
            .is_err()
        {
            return 0;
        }
    } else if midi != -1 || velocity != 0 {
        return 0;
    }

    let Some(path) = plk2_render_path(session.pack_index) else {
        return 0;
    };
    let body_pressure_scale =
        AIR_DENSITY_KG_PER_M3 * session.stem.sample_rate_hz / (4.0 * PI * ACOUSTIC_MIC_DISTANCE_M);
    let stereo_gain = sqrt(0.5);
    for frame in 0..frames {
        let taps = session.stem.step();
        let pressure_pa = match path {
            PluckedRenderPath::AcousticBodyRadiation => {
                let flow = plk2_effective_acoustic_flow_m3_per_s(
                    session.pack_index,
                    taps.acoustic_body_volume_velocity_m3_per_s,
                    taps.bridge_velocity_m_per_s,
                );
                let pressure = body_pressure_scale * (flow - session.previous_body_flow_m3_per_s);
                session.previous_body_flow_m3_per_s = flow;
                pressure
            }
            PluckedRenderPath::ElectricCabinetRadiation => taps.electric_cabinet_pressure_pa_at_1m,
        };
        let pcm = pressure_pa * REFERENCE_PCM_PER_PASCAL * plk2_listener_trim(session.pack_index);
        if !pcm.is_finite() || pcm.abs() > f32::MAX as f64 {
            left[..frames].fill(0.0);
            right[..frames].fill(0.0);
            return 0;
        }
        let sample = pcm.clamp(-1.0, 1.0) * stereo_gain;
        left[frame] = sample as f32;
        right[frame] = sample as f32;
    }
    let Some(encoded_bytes) = encode_stem_session(&session, state) else {
        left[..frames].fill(0.0);
        right[..frames].fill(0.0);
        return 0;
    };
    if encoded_bytes != state.len() {
        left[..frames].fill(0.0);
        right[..frames].fill(0.0);
        return 0;
    }
    max_frames
}

fn plk2_byte_ranges_are_disjoint(
    first_start: usize,
    first_bytes: usize,
    second_start: usize,
    second_bytes: usize,
) -> bool {
    let Some(first_end) = first_start.checked_add(first_bytes) else {
        return false;
    };
    let Some(second_end) = second_start.checked_add(second_bytes) else {
        return false;
    };
    first_end <= second_start || second_end <= first_start
}

/// Raw retained-stem WASM call. State and stereo buffers must be mutually
/// disjoint; a refused call leaves the canonical state bytes unchanged.
#[no_mangle]
pub extern "C" fn plk2_stem_render(
    state: *mut u8,
    state_bytes: i32,
    midi: i32,
    velocity: i32,
    event_flags: i32,
    left: *mut f32,
    right: *mut f32,
    max_frames: i32,
) -> i32 {
    if state.is_null()
        || state_bytes <= 0
        || state_bytes as usize > PLK2_STEM_STATE_MAX_BYTES
        || event_flags < 0
        || max_frames <= 0
        || max_frames as usize > PLK2_STEM_RENDER_MAX_FRAMES
        || left.is_null()
        || right.is_null()
        || !(left as usize).is_multiple_of(core::mem::align_of::<f32>())
        || !(right as usize).is_multiple_of(core::mem::align_of::<f32>())
    {
        return 0;
    }
    let frames = max_frames as usize;
    let Some(pcm_bytes) = frames.checked_mul(core::mem::size_of::<f32>()) else {
        return 0;
    };
    let state_start = state as usize;
    let state_len = state_bytes as usize;
    let left_start = left as usize;
    let right_start = right as usize;
    if !plk2_byte_ranges_are_disjoint(state_start, state_len, left_start, pcm_bytes)
        || !plk2_byte_ranges_are_disjoint(state_start, state_len, right_start, pcm_bytes)
        || !plk2_byte_ranges_are_disjoint(left_start, pcm_bytes, right_start, pcm_bytes)
    {
        return 0;
    }
    let state = unsafe { core::slice::from_raw_parts_mut(state, state_len) };
    let left = unsafe { core::slice::from_raw_parts_mut(left, frames) };
    let right = unsafe { core::slice::from_raw_parts_mut(right, frames) };
    plk2_stem_render_slices(
        state,
        midi,
        velocity,
        event_flags as u32,
        left,
        right,
        max_frames,
    )
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
        || !(left as usize).is_multiple_of(core::mem::align_of::<f32>())
        || !(right as usize).is_multiple_of(core::mem::align_of::<f32>())
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

/// Fixed caller-owned byte capacity for one cooperative chord session.
pub extern "C" fn plk2_chord_session_state_max_bytes() -> i32 {
    PLK2_CHORD_STATE_MAX_BYTES as i32
}

/// Host-side termination bound for a session of `output_capacity` frames.
/// The physical phase can never exceed one simulation frame per output frame;
/// reconstruction and stereo copy each cover the complete output once.
pub extern "C" fn plk2_chord_session_max_steps(output_capacity: i32) -> i32 {
    if output_capacity <= 0 || output_capacity as usize > PLK2_CHORD_MAX_OUTPUT_FRAMES {
        return 0;
    }
    let frames = output_capacity as usize;
    let simulation_steps = frames.div_ceil(PLK2_CHORD_SIMULATION_CHUNK_FRAMES);
    let output_steps = frames.div_ceil(PLK2_CHORD_OUTPUT_CHUNK_FRAMES);
    i32::try_from(simulation_steps + 2 * output_steps + 1).unwrap_or(0)
}

/// Shipping opaque-runtime termination bound. The caller-owned serialized ABI
/// above remains available to native continuity/hostility tests but is not
/// retained as a second browser implementation surface.
#[no_mangle]
pub extern "C" fn plk2_chord_runtime_max_steps(output_capacity: i32) -> i32 {
    plk2_chord_session_max_steps(output_capacity)
}

/// Initialize a cooperative simultaneous chord without touching either output
/// buffer. The returned prefix length must be passed back exactly to every
/// step; the remaining caller capacity is cleared but is not session state.
pub extern "C" fn plk2_chord_session_init(
    pack_index: i32,
    midis: *const i32,
    velocities: *const i32,
    note_count: i32,
    sample_rate: f32,
    max_frames: i32,
    state: *mut u8,
    state_capacity: i32,
) -> i32 {
    if !(1..=MAX_STRINGS as i32).contains(&note_count)
        || midis.is_null()
        || velocities.is_null()
        || state.is_null()
        || state_capacity < PLK2_CHORD_STATE_MAX_BYTES as i32
        || !(midis as usize).is_multiple_of(core::mem::align_of::<i32>())
        || !(velocities as usize).is_multiple_of(core::mem::align_of::<i32>())
    {
        return 0;
    }
    let note_count = note_count as usize;
    let input_bytes = note_count * core::mem::size_of::<i32>();
    let midi_start = midis as usize;
    let velocity_start = velocities as usize;
    let state_start = state as usize;
    if !plk2_byte_ranges_are_disjoint(midi_start, input_bytes, velocity_start, input_bytes)
        || !plk2_byte_ranges_are_disjoint(
            midi_start,
            input_bytes,
            state_start,
            PLK2_CHORD_STATE_MAX_BYTES,
        )
        || !plk2_byte_ranges_are_disjoint(
            velocity_start,
            input_bytes,
            state_start,
            PLK2_CHORD_STATE_MAX_BYTES,
        )
    {
        return 0;
    }
    let midi_values = unsafe { core::slice::from_raw_parts(midis, note_count) };
    let velocity_values = unsafe { core::slice::from_raw_parts(velocities, note_count) };
    let state = unsafe { core::slice::from_raw_parts_mut(state, PLK2_CHORD_STATE_MAX_BYTES) };
    plk2_chord_session_init_slices(
        pack_index,
        midi_values,
        velocity_values,
        sample_rate,
        max_frames,
        state,
    )
}

/// Advance one fixed cooperative work quantum. Status 1 means the caller must
/// yield and call again; status 2 means the complete stereo buffers are ready.
/// Every pointer/capacity refusal occurs before state or output mutation.
pub extern "C" fn plk2_chord_session_step(
    state: *mut u8,
    state_bytes: i32,
    left: *mut f32,
    right: *mut f32,
    output_capacity: i32,
) -> i32 {
    if state.is_null()
        || state_bytes <= 0
        || state_bytes as usize > PLK2_CHORD_STATE_MAX_BYTES
        || left.is_null()
        || right.is_null()
        || output_capacity <= 0
        || output_capacity as usize > PLK2_CHORD_MAX_OUTPUT_FRAMES
        || !(left as usize).is_multiple_of(core::mem::align_of::<f32>())
        || !(right as usize).is_multiple_of(core::mem::align_of::<f32>())
    {
        return 0;
    }
    let state_start = state as usize;
    let state_len = state_bytes as usize;
    let frames = output_capacity as usize;
    let Some(pcm_bytes) = frames.checked_mul(core::mem::size_of::<f32>()) else {
        return 0;
    };
    let left_start = left as usize;
    let right_start = right as usize;
    if !plk2_byte_ranges_are_disjoint(state_start, state_len, left_start, pcm_bytes)
        || !plk2_byte_ranges_are_disjoint(state_start, state_len, right_start, pcm_bytes)
        || !plk2_byte_ranges_are_disjoint(left_start, pcm_bytes, right_start, pcm_bytes)
    {
        return 0;
    }
    let state = unsafe { core::slice::from_raw_parts_mut(state, state_len) };
    let left = unsafe { core::slice::from_raw_parts_mut(left, frames) };
    let right = unsafe { core::slice::from_raw_parts_mut(right, frames) };
    plk2_chord_session_step_slices(state, left, right, output_capacity)
}

/// Start one opaque cooperative runtime session. A subsequent successful init
/// supersedes an abandoned handle; the shipping host serializes sessions and
/// calls reset on exceptional exits. Invalid arguments leave the active
/// session untouched and return zero.
#[no_mangle]
pub extern "C" fn plk2_chord_runtime_init(
    pack_index: i32,
    midis: *const i32,
    velocities: *const i32,
    note_count: i32,
    sample_rate: f32,
    max_frames: i32,
) -> i32 {
    if !(1..=MAX_STRINGS as i32).contains(&note_count)
        || midis.is_null()
        || velocities.is_null()
        || !(midis as usize).is_multiple_of(core::mem::align_of::<i32>())
        || !(velocities as usize).is_multiple_of(core::mem::align_of::<i32>())
    {
        return 0;
    }
    let note_count = note_count as usize;
    let input_bytes = note_count * core::mem::size_of::<i32>();
    if !plk2_byte_ranges_are_disjoint(
        midis as usize,
        input_bytes,
        velocities as usize,
        input_bytes,
    ) {
        return 0;
    }
    let midi_values = unsafe { core::slice::from_raw_parts(midis, note_count) };
    let velocity_values = unsafe { core::slice::from_raw_parts(velocities, note_count) };
    plk2_chord_runtime_init_slices(
        pack_index,
        midi_values,
        velocity_values,
        sample_rate,
        max_frames,
    )
}

/// Advance the active opaque session by one bounded work quantum. Only the
/// exact positive handle returned by init is accepted; stale handles cannot
/// mutate a newer session or either output buffer.
#[no_mangle]
pub extern "C" fn plk2_chord_runtime_step(
    handle: i32,
    left: *mut f32,
    right: *mut f32,
    output_capacity: i32,
) -> i32 {
    if handle <= 0
        || left.is_null()
        || right.is_null()
        || output_capacity <= 0
        || output_capacity as usize > PLK2_CHORD_MAX_OUTPUT_FRAMES
        || !(left as usize).is_multiple_of(core::mem::align_of::<f32>())
        || !(right as usize).is_multiple_of(core::mem::align_of::<f32>())
        || !plk2_buffers_are_disjoint(left, right, output_capacity as usize)
    {
        return 0;
    }
    let left = unsafe { core::slice::from_raw_parts_mut(left, output_capacity as usize) };
    let right = unsafe { core::slice::from_raw_parts_mut(right, output_capacity as usize) };
    plk2_chord_runtime_step_slices(handle, left, right, output_capacity)
}

/// Abandon the exact active opaque session. This is idempotent only for the
/// owning handle: zero and stale handles refuse without disturbing new work.
#[no_mangle]
pub extern "C" fn plk2_chord_runtime_reset(handle: i32) -> i32 {
    plk2_chord_runtime_reset_handle(handle)
}

/// Render a bounded simultaneous chord through one physical instrument.
/// Input and output arrays must be mutually disjoint and naturally aligned;
/// every refusal occurs before constructing or mutating the local stem.
#[no_mangle]
pub extern "C" fn plk2_render_chord(
    pack_index: i32,
    midis: *const i32,
    velocities: *const i32,
    note_count: i32,
    sample_rate: f32,
    left: *mut f32,
    right: *mut f32,
    max_frames: i32,
) -> i32 {
    if !(1..=MAX_STRINGS as i32).contains(&note_count)
        || midis.is_null()
        || velocities.is_null()
        || left.is_null()
        || right.is_null()
        || !(midis as usize).is_multiple_of(core::mem::align_of::<i32>())
        || !(velocities as usize).is_multiple_of(core::mem::align_of::<i32>())
        || !(left as usize).is_multiple_of(core::mem::align_of::<f32>())
        || !(right as usize).is_multiple_of(core::mem::align_of::<f32>())
    {
        return 0;
    }
    let note_count = note_count as usize;
    let input_bytes = note_count * core::mem::size_of::<i32>();
    let midi_start = midis as usize;
    let velocity_start = velocities as usize;
    if !plk2_byte_ranges_are_disjoint(midi_start, input_bytes, velocity_start, input_bytes) {
        return 0;
    }
    let midi_values = unsafe { core::slice::from_raw_parts(midis, note_count) };
    let velocity_values = unsafe { core::slice::from_raw_parts(velocities, note_count) };
    let capacity = plk2_note_frames(pack_index, midi_values[0], sample_rate);
    if capacity <= 0 || max_frames <= 0 {
        return 0;
    }
    let frames = capacity.min(max_frames) as usize;
    let Some(pcm_bytes) = frames.checked_mul(core::mem::size_of::<f32>()) else {
        return 0;
    };
    let left_start = left as usize;
    let right_start = right as usize;
    if !plk2_buffers_are_disjoint(left, right, frames)
        || !plk2_byte_ranges_are_disjoint(midi_start, input_bytes, left_start, pcm_bytes)
        || !plk2_byte_ranges_are_disjoint(midi_start, input_bytes, right_start, pcm_bytes)
        || !plk2_byte_ranges_are_disjoint(velocity_start, input_bytes, left_start, pcm_bytes)
        || !plk2_byte_ranges_are_disjoint(velocity_start, input_bytes, right_start, pcm_bytes)
    {
        return 0;
    }
    let out_left = unsafe { core::slice::from_raw_parts_mut(left, frames) };
    let out_right = unsafe { core::slice::from_raw_parts_mut(right, frames) };
    plk2_render_chord_slices(
        pack_index,
        midi_values,
        velocity_values,
        sample_rate,
        out_left,
        out_right,
        frames as i32,
    )
}
