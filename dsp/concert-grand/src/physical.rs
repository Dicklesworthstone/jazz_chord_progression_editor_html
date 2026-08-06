//! Shared physical-renderer ABI v2 boundary.
//!
//! This validator is deliberately scalar: it proves every caller-owned byte
//! range before a later instrument renderer constructs a Rust slice. No range
//! is dereferenced here, malformed arithmetic cannot wrap, and two writable or
//! read/write regions may never alias. The numeric outcome is stable across
//! the WASM boundary and is translated to the public typed refusal by the host.

use libm::{cos, exp, sin, sqrt};

const TAU: f64 = 6.283185307179586476925286766559;

const ABI_VERSION: i32 = 2;
const MAX_REQUEST_BYTES: u32 = 65_536;
const MAX_OUTPUT_FRAMES: u32 = 2_880_000;
const MAX_CONTROL_POINTS: u32 = 256;
const MAX_STATE_BYTES: u32 = 262_144;
const DESCRIPTOR_BYTES: u32 = 64;
const CONTROL_POINT_BYTES: u32 = 12;

pub(crate) struct OnePoleLoss {
    alpha: f64,
    state: f64,
}

impl OnePoleLoss {
    pub(crate) fn new(alpha: f64) -> Self {
        Self { alpha, state: 0.0 }
    }

    pub(crate) fn process(&mut self, input: f64) -> f64 {
        self.state += self.alpha * (input - self.state);
        self.state
    }
}

pub(crate) struct DcBlocker {
    pole: f64,
    prior_input: f64,
    prior_output: f64,
}

impl DcBlocker {
    pub(crate) fn new(pole: f64) -> Self {
        Self {
            pole,
            prior_input: 0.0,
            prior_output: 0.0,
        }
    }

    pub(crate) fn process(&mut self, input: f64) -> f64 {
        let output = input - self.prior_input + self.pole * self.prior_output;
        self.prior_input = input;
        self.prior_output = output;
        output
    }
}

pub(crate) struct RadiationFilter {
    loss: OnePoleLoss,
    prior_input: f64,
    differentiation_gain: f64,
}

pub(crate) struct DelayLine<'a> {
    storage: &'a mut [f64],
    length: usize,
    write_index: usize,
}

impl<'a> DelayLine<'a> {
    pub(crate) fn new(storage: &'a mut [f64], length: usize) -> Option<Self> {
        if length == 0 || length > storage.len() {
            return None;
        }
        for sample in storage.iter_mut() {
            *sample = 0.0;
        }
        Some(Self {
            storage,
            length,
            write_index: 0,
        })
    }

    pub(crate) fn output(&self) -> f64 {
        self.storage[self.write_index]
    }

    pub(crate) fn push(&mut self, input: f64) {
        self.storage[self.write_index] = input;
        self.write_index = (self.write_index + 1) % self.length;
    }
}

impl RadiationFilter {
    pub(crate) fn new(alpha: f64, differentiation_gain: f64) -> Self {
        Self {
            loss: OnePoleLoss::new(alpha),
            prior_input: 0.0,
            differentiation_gain,
        }
    }

    pub(crate) fn process(&mut self, input: f64) -> f64 {
        let differentiated = (input - self.prior_input) * self.differentiation_gain;
        self.prior_input = input;
        self.loss.process(differentiated)
    }
}

pub const PHS_ABI_ACCEPTED: i32 = 0;
pub const PHS_ABI_SCHEMA_UNSUPPORTED: i32 = 1;
pub const PHS_ABI_BOUNDS_INVALID: i32 = 2;
pub const PHS_ABI_FRAMES_EXCEEDED: i32 = 3;
pub const PHS_ABI_CONTROL_POINTS_EXCEEDED: i32 = 4;
pub const PHS_ABI_STATE_EXCEEDED: i32 = 5;

#[derive(Clone, Copy)]
struct ByteRange {
    start: u32,
    end: u32,
}

impl ByteRange {
    fn checked(offset: i32, count: i32, stride: u32, memory_bytes: u32) -> Option<Self> {
        if offset < 0 || count < 0 {
            return None;
        }
        let start = offset as u32;
        let bytes = (count as u32).checked_mul(stride)?;
        let end = start.checked_add(bytes)?;
        if end > memory_bytes || (bytes > 0 && start % 4 != 0) {
            return None;
        }
        Some(Self { start, end })
    }

    fn nonempty(self) -> bool {
        self.start < self.end
    }

    fn overlaps(self, other: Self) -> bool {
        self.nonempty() && other.nonempty() && self.start < other.end && other.start < self.end
    }
}

/// Validate all caller-controlled ranges for one ABI-v2 render request.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn phs_validate_v2(
    abi_version: i32,
    request_byte_length: i32,
    descriptor_offset: i32,
    descriptor_count: i32,
    control_point_offset: i32,
    control_point_count: i32,
    output_left_offset: i32,
    output_right_offset: i32,
    output_capacity_frames: i32,
    state_input_offset: i32,
    state_input_byte_length: i32,
    state_output_offset: i32,
    state_output_capacity_bytes: i32,
    linear_memory_bytes: i32,
) -> i32 {
    if abi_version != ABI_VERSION {
        return PHS_ABI_SCHEMA_UNSUPPORTED;
    }
    if request_byte_length < 0 || request_byte_length as u32 > MAX_REQUEST_BYTES {
        return PHS_ABI_BOUNDS_INVALID;
    }
    if output_capacity_frames < 0 {
        return PHS_ABI_BOUNDS_INVALID;
    }
    if output_capacity_frames as u32 > MAX_OUTPUT_FRAMES {
        return PHS_ABI_FRAMES_EXCEEDED;
    }
    if control_point_count < 0 {
        return PHS_ABI_BOUNDS_INVALID;
    }
    if control_point_count as u32 > MAX_CONTROL_POINTS {
        return PHS_ABI_CONTROL_POINTS_EXCEEDED;
    }
    if state_input_byte_length < 0 || state_output_capacity_bytes < 0 {
        return PHS_ABI_BOUNDS_INVALID;
    }
    if state_input_byte_length as u32 > MAX_STATE_BYTES
        || state_output_capacity_bytes as u32 > MAX_STATE_BYTES
    {
        return PHS_ABI_STATE_EXCEEDED;
    }
    if linear_memory_bytes < 0 {
        return PHS_ABI_BOUNDS_INVALID;
    }
    let memory_bytes = linear_memory_bytes as u32;
    let Some(request) = ByteRange::checked(0, request_byte_length, 1, memory_bytes) else {
        return PHS_ABI_BOUNDS_INVALID;
    };
    let Some(descriptors) = ByteRange::checked(
        descriptor_offset,
        descriptor_count,
        DESCRIPTOR_BYTES,
        memory_bytes,
    ) else {
        return PHS_ABI_BOUNDS_INVALID;
    };
    let Some(controls) = ByteRange::checked(
        control_point_offset,
        control_point_count,
        CONTROL_POINT_BYTES,
        memory_bytes,
    ) else {
        return PHS_ABI_BOUNDS_INVALID;
    };
    let Some(left) =
        ByteRange::checked(output_left_offset, output_capacity_frames, 4, memory_bytes)
    else {
        return PHS_ABI_BOUNDS_INVALID;
    };
    let Some(right) =
        ByteRange::checked(output_right_offset, output_capacity_frames, 4, memory_bytes)
    else {
        return PHS_ABI_BOUNDS_INVALID;
    };
    let Some(state_input) =
        ByteRange::checked(state_input_offset, state_input_byte_length, 1, memory_bytes)
    else {
        return PHS_ABI_BOUNDS_INVALID;
    };
    let Some(state_output) = ByteRange::checked(
        state_output_offset,
        state_output_capacity_bytes,
        1,
        memory_bytes,
    ) else {
        return PHS_ABI_BOUNDS_INVALID;
    };

    let ranges = [
        request,
        descriptors,
        controls,
        left,
        right,
        state_input,
        state_output,
    ];
    for left_index in 0..ranges.len() {
        for right_index in (left_index + 1)..ranges.len() {
            if ranges[left_index].overlaps(ranges[right_index]) {
                return PHS_ABI_BOUNDS_INVALID;
            }
        }
    }
    PHS_ABI_ACCEPTED
}

/// A passive modal resonator used by bars, bodies, bells, and air columns.
///
/// State is the power-normalized displacement/velocity pair `(x, y)`, so
/// stored energy is exactly `(x²+y²)/2`. Each step is an exact rotation at the
/// requested frequency followed by exponential loss; in the absence of an
/// excitation its energy therefore cannot increase through integrator drift.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn phs_modal_render_v2(
    sample_rate: f64,
    frequency_hz: f64,
    damping_per_second: f64,
    excitation: f64,
    initial_x: f64,
    initial_y: f64,
    left: *mut f32,
    right: *mut f32,
    frames: i32,
    state_output: *mut f64,
    energy_output: *mut f64,
) -> i32 {
    if !matches!(sample_rate as i32, 44_100 | 48_000 | 96_000)
        || sample_rate != sample_rate as i32 as f64
        || !frequency_hz.is_finite()
        || frequency_hz <= 0.0
        || frequency_hz >= sample_rate * 0.45
        || !damping_per_second.is_finite()
        || damping_per_second < 0.0
        || damping_per_second > 100.0
        || !excitation.is_finite()
        || excitation.abs() > 4.0
        || !initial_x.is_finite()
        || !initial_y.is_finite()
        || initial_x.abs() > 4.0
        || initial_y.abs() > 4.0
        || frames <= 0
        || frames as u32 > MAX_OUTPUT_FRAMES
        || left.is_null()
        || right.is_null()
        || state_output.is_null()
        || energy_output.is_null()
    {
        return 0;
    }
    let frame_count = frames as usize;
    let out_left = unsafe { core::slice::from_raw_parts_mut(left, frame_count) };
    let out_right = unsafe { core::slice::from_raw_parts_mut(right, frame_count) };
    let state = unsafe { core::slice::from_raw_parts_mut(state_output, 2) };
    let ledger = unsafe { core::slice::from_raw_parts_mut(energy_output, 5) };

    let rate = sample_rate;
    let phase = TAU * frequency_hz / rate;
    let rotation_cos = cos(phase);
    let rotation_sin = sin(phase);
    let loss = exp(-damping_per_second / rate);
    let mut x = initial_x;
    let mut y = initial_y;
    let initial_energy = 0.5 * (x * x + y * y);
    y += excitation;
    let excited_energy = 0.5 * (x * x + y * y);
    let pan = sqrt(0.5);
    let mut peak = 0.0f64;
    for frame in 0..frame_count {
        let rotated_x = x * rotation_cos + y * rotation_sin;
        let rotated_y = y * rotation_cos - x * rotation_sin;
        x = rotated_x * loss;
        y = rotated_y * loss;
        let sample = x * pan;
        peak = peak.max(sample.abs());
        out_left[frame] = sample as f32;
        out_right[frame] = sample as f32;
    }
    let limiter_engagements = if peak > 0.98 {
        let scale = 0.98 / peak;
        for frame in 0..frame_count {
            out_left[frame] = (out_left[frame] as f64 * scale) as f32;
            out_right[frame] = (out_right[frame] as f64 * scale) as f32;
        }
        1.0
    } else {
        0.0
    };
    let final_energy = 0.5 * (x * x + y * y);
    let dissipated = (excited_energy - final_energy).max(0.0);
    state[0] = x;
    state[1] = y;
    ledger[0] = initial_energy;
    ledger[1] = excited_energy - initial_energy;
    ledger[2] = final_energy;
    ledger[3] = excited_energy - final_energy - dissipated;
    ledger[4] = limiter_engagements;
    frame_count as i32
}

fn reed_flow(delta_pressure: f64, opening: f64, stiffness: f64) -> f64 {
    if delta_pressure <= 0.0 {
        return 0.0;
    }
    let aperture = (opening - stiffness * delta_pressure).max(0.0);
    aperture * sqrt(delta_pressure)
}

fn reed_residual(
    junction_pressure: f64,
    mouth_pressure: f64,
    bore_pressure: f64,
    opening: f64,
    stiffness: f64,
    bore_impedance: f64,
) -> f64 {
    junction_pressure
        - bore_pressure
        - bore_impedance * reed_flow(mouth_pressure - junction_pressure, opening, stiffness)
}

/// Solve the pressure/flow coupling of a pressure-controlled reed valve.
///
/// The primary phase uses at most eight safeguarded secant iterations. A
/// conservative bracketed bisection uses at most sixteen further steps. The
/// four f64 outputs are junction pressure, volume flow, primary iterations,
/// and fallback bisections. No silent clamp or unbounded convergence loop is
/// possible.
#[no_mangle]
pub extern "C" fn phs_reed_solve_v2(
    mouth_pressure: f64,
    bore_pressure: f64,
    opening: f64,
    stiffness: f64,
    bore_impedance: f64,
    output: *mut f64,
) -> i32 {
    if !mouth_pressure.is_finite()
        || !bore_pressure.is_finite()
        || !opening.is_finite()
        || !stiffness.is_finite()
        || !bore_impedance.is_finite()
        || mouth_pressure <= bore_pressure
        || opening <= 0.0
        || opening > 2.0
        || stiffness < 0.0
        || stiffness > 4.0
        || bore_impedance <= 0.0
        || bore_impedance > 8.0
        || output.is_null()
    {
        return 0;
    }
    let mut low = bore_pressure;
    let mut high = mouth_pressure;
    let mut low_value = reed_residual(
        low,
        mouth_pressure,
        bore_pressure,
        opening,
        stiffness,
        bore_impedance,
    );
    let high_value = reed_residual(
        high,
        mouth_pressure,
        bore_pressure,
        opening,
        stiffness,
        bore_impedance,
    );
    if low_value > 0.0 || high_value < 0.0 {
        return 0;
    }
    let tolerance = 1.0e-10 * (1.0 + mouth_pressure.abs() + bore_pressure.abs());
    let mut primary_iterations = 0u32;
    let mut fallback_bisections = 0u32;
    let mut pressure = 0.5 * (low + high);
    let mut value = reed_residual(
        pressure,
        mouth_pressure,
        bore_pressure,
        opening,
        stiffness,
        bore_impedance,
    );

    while primary_iterations < 8 && value.abs() > tolerance {
        primary_iterations += 1;
        if value < 0.0 {
            low = pressure;
            low_value = value;
        } else {
            high = pressure;
        }
        let high_residual = reed_residual(
            high,
            mouth_pressure,
            bore_pressure,
            opening,
            stiffness,
            bore_impedance,
        );
        let denominator = high_residual - low_value;
        let secant = if denominator.abs() > 1.0e-18 {
            low - low_value * (high - low) / denominator
        } else {
            0.5 * (low + high)
        };
        pressure = if secant > low && secant < high {
            secant
        } else {
            0.5 * (low + high)
        };
        value = reed_residual(
            pressure,
            mouth_pressure,
            bore_pressure,
            opening,
            stiffness,
            bore_impedance,
        );
    }
    while fallback_bisections < 16 && value.abs() > tolerance {
        fallback_bisections += 1;
        if value < 0.0 {
            low = pressure;
        } else {
            high = pressure;
        }
        pressure = 0.5 * (low + high);
        value = reed_residual(
            pressure,
            mouth_pressure,
            bore_pressure,
            opening,
            stiffness,
            bore_impedance,
        );
    }
    if value.abs() > tolerance {
        return 0;
    }
    let result = unsafe { core::slice::from_raw_parts_mut(output, 4) };
    result[0] = pressure;
    result[1] = reed_flow(mouth_pressure - pressure, opening, stiffness);
    result[2] = primary_iterations as f64;
    result[3] = fallback_bisections as f64;
    1
}

#[cfg(test)]
mod tests {
    use super::*;

    fn positive() -> i32 {
        phs_validate_v2(
            2, 256, 256, 2, 512, 4, 4096, 8192, 512, 0, 0, 12288, 256, 1_048_576,
        )
    }

    #[test]
    fn accepts_reviewed_disjoint_layout() {
        assert_eq!(positive(), PHS_ABI_ACCEPTED);
    }

    #[test]
    fn rejects_overflow_overlap_and_exact_limit_plus_one() {
        assert_eq!(
            phs_validate_v2(
                2,
                256,
                256,
                2,
                512,
                4,
                i32::MAX - 3,
                8192,
                2,
                0,
                0,
                12288,
                256,
                i32::MAX
            ),
            PHS_ABI_BOUNDS_INVALID,
        );
        assert_eq!(
            phs_validate_v2(2, 256, 256, 2, 512, 4, 4096, 4096, 512, 0, 0, 12288, 256, 1_048_576),
            PHS_ABI_BOUNDS_INVALID,
        );
        assert_eq!(
            phs_validate_v2(2, 256, 256, 2, 512, 257, 4096, 8192, 512, 0, 0, 12288, 256, 1_048_576),
            PHS_ABI_CONTROL_POINTS_EXCEEDED,
        );
        assert_eq!(
            phs_validate_v2(
                2, 256, 256, 2, 512, 4, 4096, 8192, 2_880_001, 0, 0, 12288, 256, 20_000_000
            ),
            PHS_ABI_FRAMES_EXCEEDED,
        );
    }

    #[test]
    fn modal_state_handoff_is_deterministic_and_passive() {
        let mut left = [0.0f32; 256];
        let mut right = [0.0f32; 256];
        let mut state = [0.0f64; 2];
        let mut ledger = [0.0f64; 5];
        assert_eq!(
            phs_modal_render_v2(
                48_000.0,
                440.0,
                2.0,
                0.5,
                0.0,
                0.0,
                left.as_mut_ptr(),
                right.as_mut_ptr(),
                256,
                state.as_mut_ptr(),
                ledger.as_mut_ptr(),
            ),
            256,
        );
        assert!(ledger[2] < ledger[1]);
        assert!(ledger[3].abs() < 1.0e-12);
        let first_state = state;
        let first_left = left;
        let mut second_state = [0.0f64; 2];
        let mut second_ledger = [0.0f64; 5];
        assert_eq!(
            phs_modal_render_v2(
                48_000.0,
                440.0,
                2.0,
                0.0,
                first_state[0],
                first_state[1],
                left.as_mut_ptr(),
                right.as_mut_ptr(),
                256,
                second_state.as_mut_ptr(),
                second_ledger.as_mut_ptr(),
            ),
            256,
        );
        assert_ne!(first_left, left);
        assert!(second_ledger[2] < second_ledger[0]);
        assert!(second_ledger[3].abs() < 1.0e-12);
    }

    #[test]
    fn reed_solve_is_bounded_and_satisfies_the_coupling_equation() {
        let mut output = [0.0f64; 4];
        assert_eq!(
            phs_reed_solve_v2(0.9, -0.1, 0.7, 0.3, 0.8, output.as_mut_ptr()),
            1
        );
        assert!(output[2] <= 8.0);
        assert!(output[3] <= 16.0);
        assert!(reed_residual(output[0], 0.9, -0.1, 0.7, 0.3, 0.8).abs() < 1.0e-9);
    }
}
