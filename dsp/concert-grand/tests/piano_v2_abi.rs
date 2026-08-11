//! Hostile-boundary proof for the dark physical concert-grand attack ABI.

#[path = "../src/piano_v2.rs"]
mod piano_v2;

use piano_v2::{
    pno2_chord_runtime_init, pno2_chord_runtime_max_steps, pno2_chord_runtime_reset,
    pno2_chord_runtime_step, pno2_note_frames, pno2_render, pno2_render_slices, pno2_runtime_init,
    pno2_runtime_max_steps, pno2_runtime_reset, pno2_runtime_step, render_piano_chord,
    split_t60_half_velocity_decay, PianoError, PianoParameters, PianoStem, PianoStrike, PianoVoice,
    PNO2_ATTACK_SECONDS, PNO2_RUNTIME_STEP_COMPLETE, PNO2_RUNTIME_STEP_FRAMES,
    PNO2_RUNTIME_STEP_PROGRESS,
};

#[test]
fn split_modal_loss_reaches_minus_sixty_db_at_the_declared_t60() {
    let sample_rate_hz = 8_000.0;
    let frequency_hz = 100.0;
    // Use an integer 100-cycle interval so this assertion measures the decay
    // envelope rather than a phase offset of the lightly damped oscillator.
    let t60_seconds = 1.0;
    let frames = (sample_rate_hz * t60_seconds) as usize;
    let dt = 1.0 / sample_rate_hz;
    let half_dt = 0.5 * dt;
    let midpoint_omega = 2.0 / dt * libm::tan(core::f64::consts::PI * frequency_hz * dt);
    let run = |half_velocity_decay: f64| {
        let mut position = 1.0_f64;
        let mut velocity = 0.0_f64;
        for _ in 0..frames {
            velocity *= half_velocity_decay;
            let frequency_term = half_dt * midpoint_omega;
            let next_position = ((1.0 - frequency_term * frequency_term) * position
                + 2.0 * half_dt * velocity)
                / (1.0 + frequency_term * frequency_term);
            let next_velocity = (next_position - position) / half_dt - velocity;
            position = next_position;
            velocity = next_velocity * half_velocity_decay;
        }
        20.0 * libm::log10(position.abs())
    };

    let actual_db = run(split_t60_half_velocity_decay(t60_seconds, dt));
    assert!(
        (actual_db + 60.0).abs() < 0.05,
        "declared T60 produced {actual_db} dB"
    );

    // Planted near-miss: halving the viscous exponent merely because the
    // update has two split stages reaches -30 dB, not the declared amplitude
    // T60. The full friction rate belongs in each half-duration stage.
    let old_half = libm::exp(-0.5 * 6.907_755_278_982_137 * dt / t60_seconds);
    let old_db = run(old_half);
    assert!(
        (old_db + 30.0).abs() < 0.05,
        "old split law produced {old_db} dB"
    );
    assert!((old_db - actual_db).abs() > 29.9);
}

fn finite_audible_bounded(left: &[f32], right: &[f32]) {
    assert!(left.iter().chain(right).all(|sample| sample.is_finite()));
    let peak = left
        .iter()
        .chain(right)
        .fold(0.0_f32, |maximum, sample| maximum.max(sample.abs()));
    assert!(peak > 1.0e-8, "physical attack was silent");
    assert!(
        peak < 0.98,
        "physical attack exceeded the fixed bound: {peak}"
    );
}

#[test]
fn one_key_stem_is_bit_identical_to_the_existing_physical_voice() {
    let parameters = PianoParameters::canonical();
    let strike = PianoStrike::from_velocity(91, 60).unwrap();
    let mut voice = PianoVoice::new(60, 48_000.0, parameters).unwrap();
    voice.begin_strike(strike).unwrap();
    let mut stem = PianoStem::new(&[60], &[91], 48_000.0, parameters).unwrap();
    assert_eq!(stem.note_count(), 1);
    for frame in 0..4_096 {
        let expected = voice.step().unwrap();
        let actual = stem.step().unwrap();
        assert_eq!(
            actual.left_pressure_pa.to_bits(),
            expected.left_pressure_pa.to_bits(),
            "left pressure diverged at frame {frame}"
        );
        assert_eq!(
            actual.right_pressure_pa.to_bits(),
            expected.right_pressure_pa.to_bits(),
            "right pressure diverged at frame {frame}"
        );
        assert_eq!(
            actual.string_energy_j.to_bits(),
            expected.string_energy_j.to_bits(),
            "string energy diverged at frame {frame}"
        );
        assert_eq!(
            actual.soundboard_energy_j.to_bits(),
            expected.soundboard_energy_j.to_bits(),
            "soundboard energy diverged at frame {frame}"
        );
    }
}

#[test]
fn shared_soundboard_chord_is_canonical_audible_passive_and_not_a_note_mixer() {
    // Constructing the fixed-allocation shared stem in an unoptimised native
    // test temporarily keeps several large return slots alive.  The shipping
    // release ABI retains exactly one session in static WASM memory, so give
    // this native proof an explicit stack instead of aborting the entire test
    // binary on Rust's ordinary 2 MiB test-thread stack.
    std::thread::Builder::new()
        .name("pno2-shared-soundboard-chord".to_owned())
        .stack_size(8 * 1_024 * 1_024)
        .spawn(shared_soundboard_chord_is_canonical_audible_passive_and_not_a_note_mixer_body)
        .unwrap()
        .join()
        .unwrap();
}

fn shared_soundboard_chord_is_canonical_audible_passive_and_not_a_note_mixer_body() {
    #[inline(never)]
    fn render_shared_chord(
        midis: &[i32],
        velocities: &[i32],
        check_passivity: bool,
    ) -> (Vec<f64>, Vec<f64>, f64) {
        let parameters = PianoParameters::canonical();
        let mut stem = PianoStem::new(midis, velocities, 48_000.0, parameters).unwrap();
        let initial_energy = stem.represented_energy_j();
        assert!(initial_energy > 0.0);
        let mut maximum_pressure = 0.0_f64;
        let mut left = Vec::with_capacity(4_096);
        let mut right = Vec::with_capacity(4_096);
        for _ in 0..4_096 {
            let output = stem.step().unwrap();
            if check_passivity {
                assert!(stem.represented_energy_j() <= initial_energy + 1.0e-10);
            }
            maximum_pressure = maximum_pressure
                .max(output.left_pressure_pa.abs())
                .max(output.right_pressure_pa.abs());
            left.push(output.left_pressure_pa);
            right.push(output.right_pressure_pa);
        }
        (left, right, maximum_pressure)
    }

    let parameters = PianoParameters::canonical();
    assert!(
        core::mem::size_of::<PianoStem>() <= 256 * 1_024,
        "the fixed eight-key stem exceeded its reviewed retained-state bound"
    );
    let midis = [48, 55, 60, 64];
    let velocities = [80, 96, 91, 72];
    /*
     * Keep only one retained stem in a native test thread at a time. Two
     * simultaneous 8-key fixed-allocation stems plus constructor return slots
     * exceeded Rust's ordinary 2 MiB test-thread stack in an unoptimised ABI
     * run, aborting the whole binary before the hostile-boundary tests ran.
     * Sequential renders prove the same canonical-order law and match the
     * shipping runtime, which also owns one chord session at a time.
     */
    let (shared_left, shared_right, maximum_pressure) =
        render_shared_chord(&midis, &velocities, true);
    let (permuted_left, permuted_right, _) =
        render_shared_chord(&[64, 48, 60, 55], &[72, 80, 91, 96], false);
    for frame in 0..4_096 {
        assert_eq!(shared_left[frame].to_bits(), permuted_left[frame].to_bits());
        assert_eq!(
            shared_right[frame].to_bits(),
            permuted_right[frame].to_bits()
        );
    }
    assert!(maximum_pressure > 1.0e-7);
    assert!(maximum_pressure < parameters.maximum_abs_pressure_pa * midis.len() as f64);

    let mut independent: Vec<PianoVoice> = midis
        .iter()
        .zip(velocities)
        .map(|(midi, velocity)| {
            let mut voice = PianoVoice::new(*midi, 48_000.0, parameters).unwrap();
            voice
                .begin_strike(PianoStrike::from_velocity(velocity, *midi).unwrap())
                .unwrap();
            voice
        })
        .collect();
    let mut differs_from_note_mixer = false;
    for frame in 0..4_096 {
        let mut mixed_left = 0.0;
        let mut mixed_right = 0.0;
        for voice in &mut independent {
            let output = voice.step().unwrap();
            mixed_left += output.left_pressure_pa;
            mixed_right += output.right_pressure_pa;
        }
        differs_from_note_mixer |= mixed_left.to_bits() != shared_left[frame].to_bits()
            || mixed_right.to_bits() != shared_right[frame].to_bits();
    }
    assert!(
        differs_from_note_mixer,
        "shared body collapsed to independent-note mixing"
    );

    assert!(PianoStem::new(&[], &[], 48_000.0, parameters).is_err());
    assert!(PianoStem::new(&[60, 60], &[80, 90], 48_000.0, parameters).is_err());
    assert!(PianoStem::new(&[60], &[80, 90], 48_000.0, parameters).is_err());
    assert!(PianoStem::new(&[21; 9], &[80; 9], 48_000.0, parameters).is_err());
    assert_eq!(
        PianoStem::new(&[20], &[80], 48_000.0, parameters).unwrap_err(),
        PianoError::InvalidMidi
    );
    assert_eq!(
        PianoStem::new(&[60], &[0], 48_000.0, parameters).unwrap_err(),
        PianoError::InvalidVelocity
    );
    assert_eq!(
        PianoStem::new(&[60], &[80], 7_999.0, parameters).unwrap_err(),
        PianoError::InvalidSampleRate
    );
}

#[test]
fn chord_runtime_is_bit_identical_bounded_hostile_and_recoverable() {
    // The unoptimised native constructor keeps several fixed-allocation
    // `PianoStem` return slots live at once. Rust's default 2 MiB test-thread
    // stack is smaller than that debug-only frame even though the shipping
    // release ABI owns its one retained session in static WASM memory. Keep
    // the ordinary debug suite runnable without changing production state or
    // weakening the exact optimized ABI canary.
    std::thread::Builder::new()
        .name("pno2-chord-runtime-abi".to_owned())
        .stack_size(8 * 1_024 * 1_024)
        .spawn(chord_runtime_is_bit_identical_bounded_hostile_and_recoverable_body)
        .unwrap()
        .join()
        .unwrap();
}

fn chord_runtime_is_bit_identical_bounded_hostile_and_recoverable_body() {
    let midis = [48, 55, 60, 64];
    let velocities = [80, 96, 91, 72];
    let frames = 4_096;
    let mut expected_left = vec![0.0_f32; frames];
    let mut expected_right = vec![0.0_f32; frames];
    assert_eq!(
        render_piano_chord(
            &midis,
            &velocities,
            48_000.0,
            &mut expected_left,
            &mut expected_right,
        )
        .unwrap(),
        frames
    );
    finite_audible_bounded(&expected_left, &expected_right);

    let handle = pno2_chord_runtime_init(
        midis.as_ptr(),
        velocities.as_ptr(),
        midis.len() as i32,
        48_000.0,
        frames as i32,
    );
    assert!(handle > 0);
    let steps = pno2_chord_runtime_max_steps(frames as i32) as usize;
    assert_eq!(steps, frames.div_ceil(PNO2_RUNTIME_STEP_FRAMES));
    assert!(steps <= 128);
    let sentinel = -4.25_f32;
    let mut left = vec![sentinel; frames];
    let mut right = vec![sentinel; frames];
    for step in 0..steps {
        let status =
            pno2_chord_runtime_step(handle, left.as_mut_ptr(), right.as_mut_ptr(), frames as i32);
        let written = ((step + 1) * PNO2_RUNTIME_STEP_FRAMES).min(frames);
        assert_eq!(&left[..written], &expected_left[..written]);
        assert_eq!(&right[..written], &expected_right[..written]);
        assert!(left[written..].iter().all(|sample| *sample == sentinel));
        assert!(right[written..].iter().all(|sample| *sample == sentinel));
        assert_eq!(
            status,
            if step + 1 == steps {
                PNO2_RUNTIME_STEP_COMPLETE
            } else {
                PNO2_RUNTIME_STEP_PROGRESS
            }
        );
    }
    assert_eq!(left, expected_left);
    assert_eq!(right, expected_right);
    assert_eq!(pno2_chord_runtime_reset(handle), 1);
    assert_eq!(pno2_chord_runtime_reset(handle), 0);

    let duplicate = [60, 60];
    let duplicate_velocity = [80, 90];
    let invalid_requests = [
        pno2_chord_runtime_init(
            core::ptr::null(),
            velocities.as_ptr(),
            midis.len() as i32,
            48_000.0,
            frames as i32,
        ),
        pno2_chord_runtime_init(
            midis.as_ptr(),
            core::ptr::null(),
            midis.len() as i32,
            48_000.0,
            frames as i32,
        ),
        pno2_chord_runtime_init(
            midis.as_ptr(),
            midis.as_ptr(),
            midis.len() as i32,
            48_000.0,
            frames as i32,
        ),
        pno2_chord_runtime_init(
            midis.as_ptr(),
            velocities.as_ptr(),
            0,
            48_000.0,
            frames as i32,
        ),
        pno2_chord_runtime_init(
            midis.as_ptr(),
            velocities.as_ptr(),
            9,
            48_000.0,
            frames as i32,
        ),
        pno2_chord_runtime_init(
            duplicate.as_ptr(),
            duplicate_velocity.as_ptr(),
            2,
            48_000.0,
            frames as i32,
        ),
    ];
    assert!(invalid_requests.iter().all(|value| *value == 0));

    let replacement = pno2_chord_runtime_init(
        midis.as_ptr(),
        velocities.as_ptr(),
        midis.len() as i32,
        48_000.0,
        64,
    );
    assert!(replacement > 0);
    let mut output = vec![3.0_f32; 128];
    assert_eq!(
        pno2_chord_runtime_step(
            replacement,
            output.as_mut_ptr(),
            unsafe { output.as_mut_ptr().add(63) },
            64,
        ),
        0
    );
    assert!(output.iter().all(|sample| *sample == 3.0));
    let (left, right) = output.split_at_mut(64);
    assert_eq!(
        pno2_chord_runtime_step(replacement, left.as_mut_ptr(), right.as_mut_ptr(), 64,),
        PNO2_RUNTIME_STEP_COMPLETE
    );
    assert_eq!(pno2_chord_runtime_reset(replacement), 1);
}

#[test]
fn capacity_and_raw_output_cover_the_reviewed_keyboard_and_rates() {
    for (sample_rate, register) in [
        (8_000.0_f32, [21, 60, 104]),
        (44_100.0, [21, 60, 108]),
        (48_000.0, [21, 60, 108]),
        (96_000.0, [21, 60, 108]),
    ] {
        for midi in register {
            assert_eq!(
                pno2_note_frames(midi, sample_rate),
                (PNO2_ATTACK_SECONDS * sample_rate as f64) as i32
            );
            let frames = 768;
            let mut left = vec![0.0_f32; frames];
            let mut right = vec![0.0_f32; frames];
            assert_eq!(
                pno2_render(
                    midi,
                    96,
                    sample_rate,
                    left.as_mut_ptr(),
                    right.as_mut_ptr(),
                    frames as i32,
                ),
                frames as i32
            );
            finite_audible_bounded(&left, &right);
        }
    }

    for midi in [i32::MIN, 20, 109, i32::MAX] {
        assert_eq!(pno2_note_frames(midi, 48_000.0), 0);
    }
    assert_eq!(pno2_note_frames(108, 8_000.0), 0);
    assert_eq!(
        PianoStem::new(&[21, 108], &[80, 80], 8_000.0, PianoParameters::canonical()).unwrap_err(),
        PianoError::InvalidSampleRate,
    );
    let mixed_rate_midis = [21_i32, 108_i32];
    let mixed_rate_velocities = [80_i32, 80_i32];
    assert_eq!(
        pno2_chord_runtime_init(
            mixed_rate_midis.as_ptr(),
            mixed_rate_velocities.as_ptr(),
            2,
            8_000.0,
            64,
        ),
        0,
        "a low first note bypassed the per-key chord anti-alias admission",
    );
    for sample_rate in [
        f32::NAN,
        f32::NEG_INFINITY,
        7_999.0,
        96_001.0,
        f32::INFINITY,
    ] {
        assert_eq!(pno2_note_frames(60, sample_rate), 0);
    }
}

#[test]
fn raw_entry_is_bit_identical_to_the_safe_entry_and_recovers_after_refusal() {
    let frames = 4_096;
    let mut safe_left = vec![0.0_f32; frames];
    let mut safe_right = vec![0.0_f32; frames];
    assert_eq!(
        pno2_render_slices(
            60,
            91,
            48_000.0,
            &mut safe_left,
            &mut safe_right,
            frames as i32,
        ),
        frames as i32
    );
    let mut raw_left = vec![0.0_f32; frames];
    let mut raw_right = vec![0.0_f32; frames];
    assert_eq!(
        pno2_render(
            60,
            91,
            48_000.0,
            raw_left.as_mut_ptr(),
            raw_right.as_mut_ptr(),
            frames as i32,
        ),
        frames as i32
    );
    assert_eq!(raw_left, safe_left);
    assert_eq!(raw_right, safe_right);

    let mut short = vec![7.0_f32; frames - 1];
    assert_eq!(
        pno2_render_slices(60, 91, 48_000.0, &mut short, &mut raw_right, frames as i32,),
        0
    );
    assert!(short.iter().all(|sample| *sample == 7.0));

    // A refusal cannot poison later construction or retained global state.
    let mut recovery_left = vec![0.0_f32; frames];
    let mut recovery_right = vec![0.0_f32; frames];
    assert_eq!(
        pno2_render(
            60,
            91,
            48_000.0,
            recovery_left.as_mut_ptr(),
            recovery_right.as_mut_ptr(),
            frames as i32,
        ),
        frames as i32
    );
    assert_eq!(recovery_left, safe_left);
    assert_eq!(recovery_right, safe_right);
}

#[test]
fn full_attack_window_is_exact_finite_audible_and_bounded() {
    let frames = pno2_note_frames(60, 48_000.0) as usize;
    assert_eq!(frames, 15_360);
    let mut left = vec![0.0_f32; frames];
    let mut right = vec![0.0_f32; frames];
    assert_eq!(
        pno2_render(
            60,
            100,
            48_000.0,
            left.as_mut_ptr(),
            right.as_mut_ptr(),
            frames as i32,
        ),
        frames as i32
    );
    finite_audible_bounded(&left, &right);
}

#[test]
fn cooperative_runtime_is_bounded_bit_identical_hostile_and_recoverable() {
    // Cross-layer browser bound: the admitted 96 kHz attack must fit inside
    // the host's fixed 128-turn refusal ceiling.
    assert_eq!(pno2_runtime_max_steps(30_720), 120);
    assert!(pno2_runtime_max_steps(30_720) <= 128);
    for (midi, sample_rate) in [(36, 44_100.0_f32), (60, 48_000.0), (96, 96_000.0)] {
        let frames = pno2_note_frames(midi, sample_rate) as usize;
        let mut expected_left = vec![0.0_f32; frames];
        let mut expected_right = vec![0.0_f32; frames];
        assert_eq!(
            pno2_render_slices(
                midi,
                100,
                sample_rate,
                &mut expected_left,
                &mut expected_right,
                frames as i32,
            ),
            frames as i32
        );

        let handle = pno2_runtime_init(midi, 100, sample_rate, frames as i32);
        assert!(handle > 0);
        let maximum_steps = pno2_runtime_max_steps(frames as i32) as usize;
        assert_eq!(maximum_steps, frames.div_ceil(PNO2_RUNTIME_STEP_FRAMES));
        let sentinel = -7.25_f32;
        let mut left = vec![sentinel; frames];
        let mut right = vec![sentinel; frames];

        // Stale handles and mismatched capacities refuse without corrupting
        // either the active session or caller-owned output.
        assert_eq!(
            pno2_runtime_step(
                handle.saturating_add(1),
                left.as_mut_ptr(),
                right.as_mut_ptr(),
                frames as i32,
            ),
            0
        );
        assert_eq!(
            pno2_runtime_step(
                handle,
                left.as_mut_ptr(),
                right.as_mut_ptr(),
                frames as i32 - 1,
            ),
            0
        );
        assert!(left.iter().chain(&right).all(|sample| *sample == sentinel));

        for step in 0..maximum_steps {
            let status =
                pno2_runtime_step(handle, left.as_mut_ptr(), right.as_mut_ptr(), frames as i32);
            let written = ((step + 1) * PNO2_RUNTIME_STEP_FRAMES).min(frames);
            assert_eq!(&left[..written], &expected_left[..written]);
            assert_eq!(&right[..written], &expected_right[..written]);
            assert!(left[written..].iter().all(|sample| *sample == sentinel));
            assert!(right[written..].iter().all(|sample| *sample == sentinel));
            if step + 1 == maximum_steps {
                assert_eq!(status, PNO2_RUNTIME_STEP_COMPLETE);
            } else {
                assert_eq!(status, PNO2_RUNTIME_STEP_PROGRESS);
            }
        }
        assert_eq!(left, expected_left);
        assert_eq!(right, expected_right);
        assert_eq!(
            pno2_runtime_step(handle, left.as_mut_ptr(), right.as_mut_ptr(), frames as i32,),
            0
        );
        assert_eq!(pno2_runtime_reset(handle), 1);
        assert_eq!(pno2_runtime_reset(handle), 0);
    }

    assert_eq!(pno2_runtime_max_steps(0), 0);
    assert_eq!(pno2_runtime_max_steps(-1), 0);
    assert_eq!(pno2_runtime_max_steps(30_721), 0);
    assert_eq!(pno2_runtime_init(20, 100, 48_000.0, 64), 0);
    assert_eq!(pno2_runtime_init(60, 0, 48_000.0, 64), 0);
    assert_eq!(pno2_runtime_init(60, 100, f32::NAN, 64), 0);

    // A newer init atomically replaces the prior session; the old task cannot
    // reset or advance its replacement.
    let stale = pno2_runtime_init(48, 72, 48_000.0, 64);
    let active = pno2_runtime_init(60, 91, 48_000.0, 64);
    assert!(stale > 0 && active > 0 && stale != active);
    assert_eq!(pno2_runtime_reset(stale), 0);
    let sentinel = 3.5_f32;
    let mut left = vec![sentinel; 128];
    let mut right = vec![sentinel; 64];
    for status in [
        pno2_runtime_step(active, core::ptr::null_mut(), right.as_mut_ptr(), 64),
        pno2_runtime_step(active, left.as_mut_ptr(), core::ptr::null_mut(), 64),
        pno2_runtime_step(active, left.as_mut_ptr(), left.as_mut_ptr(), 64),
        pno2_runtime_step(
            active,
            left.as_mut_ptr(),
            unsafe { left.as_mut_ptr().add(63) },
            64,
        ),
        pno2_runtime_step(active, (usize::MAX - 3) as *mut f32, right.as_mut_ptr(), 64),
    ] {
        assert_eq!(status, 0);
    }
    let alignment = core::mem::align_of::<f32>();
    let mut misaligned = vec![0_u8; 64 * core::mem::size_of::<f32>() + alignment];
    let base = misaligned.as_mut_ptr() as usize;
    let offset = (0..alignment)
        .find(|offset| (base + offset) % alignment != 0)
        .expect("f32 alignment has at least one misaligned byte offset");
    assert_eq!(
        pno2_runtime_step(
            active,
            unsafe { misaligned.as_mut_ptr().add(offset) }.cast::<f32>(),
            right.as_mut_ptr(),
            64,
        ),
        0
    );
    assert!(left.iter().chain(&right).all(|sample| *sample == sentinel));
    assert_eq!(
        pno2_runtime_step(active, left.as_mut_ptr(), right.as_mut_ptr(), 64,),
        PNO2_RUNTIME_STEP_COMPLETE
    );
    assert!(left[..64].iter().any(|sample| *sample != sentinel));
    assert!(left[64..].iter().all(|sample| *sample == sentinel));
    assert_eq!(pno2_runtime_reset(active), 1);
}

#[test]
fn null_misaligned_overlapping_overflowing_and_invalid_requests_refuse_without_writes() {
    let frames = 64usize;
    let mut left = vec![0.25_f32; frames * 2];
    let mut right = vec![-0.25_f32; frames];
    let left_before = left.clone();
    let right_before = right.clone();

    let requests = [
        pno2_render(
            60,
            91,
            48_000.0,
            core::ptr::null_mut(),
            right.as_mut_ptr(),
            frames as i32,
        ),
        pno2_render(
            60,
            91,
            48_000.0,
            left.as_mut_ptr(),
            core::ptr::null_mut(),
            frames as i32,
        ),
        pno2_render(
            60,
            0,
            48_000.0,
            left.as_mut_ptr(),
            right.as_mut_ptr(),
            frames as i32,
        ),
        pno2_render(
            60,
            128,
            48_000.0,
            left.as_mut_ptr(),
            right.as_mut_ptr(),
            frames as i32,
        ),
        pno2_render(
            60,
            91,
            48_000.0,
            left.as_mut_ptr(),
            left.as_mut_ptr(),
            frames as i32,
        ),
        pno2_render(
            60,
            91,
            48_000.0,
            left.as_mut_ptr(),
            unsafe { left.as_mut_ptr().add(frames - 1) },
            frames as i32,
        ),
        pno2_render(
            60,
            91,
            48_000.0,
            (usize::MAX - 3) as *mut f32,
            right.as_mut_ptr(),
            frames as i32,
        ),
        pno2_render(60, 91, 48_000.0, left.as_mut_ptr(), right.as_mut_ptr(), 0),
    ];
    assert!(requests.iter().all(|written| *written == 0));

    let alignment = core::mem::align_of::<f32>();
    let mut misaligned = vec![0_u8; frames * core::mem::size_of::<f32>() + alignment];
    let base = misaligned.as_mut_ptr() as usize;
    let offset = (0..alignment)
        .find(|offset| (base + offset) % alignment != 0)
        .expect("f32 alignment has at least one misaligned byte offset");
    assert_eq!(
        pno2_render(
            60,
            91,
            48_000.0,
            unsafe { misaligned.as_mut_ptr().add(offset) }.cast::<f32>(),
            right.as_mut_ptr(),
            frames as i32,
        ),
        0
    );
    assert_eq!(left, left_before);
    assert_eq!(right, right_before);
}
