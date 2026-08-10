use concert_grand::{
    cg_note_frames, cg_render, cg_runtime_init, cg_runtime_max_steps, cg_runtime_reset,
    cg_runtime_step, cg_runtime_written_frames, CG_RUNTIME_STEP_COMPLETE, CG_RUNTIME_STEP_FRAMES,
    CG_RUNTIME_STEP_PROGRESS,
};

const SENTINEL: f32 = -7_654.25;

fn synchronous(midi: i32, velocity: i32, sample_rate: f32) -> (Vec<f32>, Vec<f32>, usize) {
    let frames = cg_note_frames(midi, sample_rate) as usize;
    assert!(frames > 0);
    let mut left = vec![SENTINEL; frames];
    let mut right = vec![SENTINEL; frames];
    let written = cg_render(
        midi,
        velocity,
        sample_rate,
        left.as_mut_ptr(),
        right.as_mut_ptr(),
        frames as i32,
    );
    assert!(written > 0);
    (left, right, written as usize)
}

#[test]
fn cooperative_sustain_is_bounded_and_bit_identical_to_shipping_sync() {
    for (midi, velocity, sample_rate) in [
        (21, 36, 44_100.0),
        (60, 91, 48_000.0),
        (84, 127, 96_000.0),
        // Exact maximum-capacity contract edge: 8 seconds at 192 kHz.
        (21, 127, 192_000.0),
    ] {
        let (expected_left, expected_right, expected_written) =
            synchronous(midi, velocity, sample_rate);
        let frames = expected_left.len();
        let maximum_steps = cg_runtime_max_steps(frames as i32);
        assert_eq!(
            maximum_steps as usize,
            frames.div_ceil(CG_RUNTIME_STEP_FRAMES)
        );
        let handle = cg_runtime_init(midi, velocity, sample_rate, frames as i32);
        assert!(handle > 0);
        assert_eq!(cg_runtime_written_frames(handle), 0);
        let mut left = vec![SENTINEL; frames];
        let mut right = vec![SENTINEL; frames];

        let first = cg_runtime_step(handle, left.as_mut_ptr(), right.as_mut_ptr(), frames as i32);
        assert_eq!(first, CG_RUNTIME_STEP_PROGRESS);
        assert!(left[..CG_RUNTIME_STEP_FRAMES]
            .iter()
            .any(|sample| *sample != SENTINEL));
        assert!(left[CG_RUNTIME_STEP_FRAMES..]
            .iter()
            .all(|sample| *sample == SENTINEL));

        let mut calls = 1usize;
        let terminal = loop {
            let status =
                cg_runtime_step(handle, left.as_mut_ptr(), right.as_mut_ptr(), frames as i32);
            calls += 1;
            if status != CG_RUNTIME_STEP_PROGRESS {
                break status;
            }
            assert!(calls < maximum_steps as usize);
        };
        assert_eq!(terminal, CG_RUNTIME_STEP_COMPLETE);
        assert_eq!(calls, maximum_steps as usize);
        assert_eq!(cg_runtime_written_frames(handle), expected_written as i32);
        assert_eq!(left, expected_left);
        assert_eq!(right, expected_right);
        /* jcpe-4qxd R4: over-stepping a COMPLETED session reports
         * completion, not the refusal code — "done" and "your buffer is
         * wrong" were indistinguishable before. GATE-DIFF NOTE: this pin
         * changed deliberately with the contract fix. */
        assert_eq!(
            cg_runtime_step(handle, left.as_mut_ptr(), right.as_mut_ptr(), frames as i32),
            CG_RUNTIME_STEP_COMPLETE
        );
        assert_eq!(cg_runtime_reset(handle), 1);
        assert_eq!(cg_runtime_reset(handle), 0);
    }
}

#[test]
fn cooperative_sustain_refuses_hostile_boundaries_and_stale_handles() {
    assert_eq!(cg_runtime_max_steps(0), 0);
    assert_eq!(cg_runtime_max_steps(-1), 0);
    assert_eq!(cg_runtime_max_steps(1_536_001), 0);
    assert_eq!(cg_runtime_init(20, 91, 48_000.0, 1), 0);
    assert_eq!(cg_runtime_init(60, 0, 48_000.0, 1), 0);
    assert_eq!(cg_runtime_init(60, 91, f32::NAN, 1), 0);

    let frames = cg_note_frames(60, 48_000.0) as usize;
    let stale = cg_runtime_init(60, 91, 48_000.0, frames as i32);
    let active = cg_runtime_init(64, 72, 48_000.0, frames as i32);
    assert!(stale > 0 && active > 0 && stale != active);
    let mut left = vec![SENTINEL; frames];
    let mut right = vec![SENTINEL; frames];
    assert_eq!(
        cg_runtime_step(stale, left.as_mut_ptr(), right.as_mut_ptr(), frames as i32),
        0
    );
    assert!(left.iter().all(|sample| *sample == SENTINEL));
    assert_eq!(cg_runtime_reset(stale), 0);

    assert_eq!(
        cg_runtime_step(
            active,
            core::ptr::null_mut(),
            right.as_mut_ptr(),
            frames as i32
        ),
        0
    );
    assert_eq!(
        cg_runtime_step(active, left.as_mut_ptr(), left.as_mut_ptr(), frames as i32),
        0
    );
    let misaligned = unsafe { (left.as_mut_ptr() as *mut u8).add(1) as *mut f32 };
    assert_eq!(
        cg_runtime_step(active, misaligned, right.as_mut_ptr(), frames as i32),
        0
    );
    assert!(left.iter().all(|sample| *sample == SENTINEL));
    assert_eq!(
        cg_runtime_step(
            active,
            left.as_mut_ptr(),
            right.as_mut_ptr(),
            frames as i32 - 1
        ),
        0
    );
    assert_eq!(cg_runtime_reset(active), 1);

    let recovery = cg_runtime_init(60, 91, 48_000.0, frames as i32);
    assert!(recovery > 0);
    assert_eq!(cg_runtime_reset(recovery), 1);
}

/// jcpe-4qxd R5: advance() writes only the unrendered span and finalize
/// normalizes the whole buffer, so the session pins its buffer identity at
/// the first step. A host that rotates scratch buffers mid-note must be
/// refused — the alternative is a note silently normalized against another
/// buffer's zeros.
#[test]
fn cooperative_step_refuses_a_rotated_buffer_mid_note() {
    let frames = 2_048usize;
    let mut left_a = vec![0.0f32; frames];
    let mut right_a = vec![0.0f32; frames];
    let mut left_b = vec![0.0f32; frames];
    let mut right_b = vec![0.0f32; frames];
    let handle = concert_grand::cg_runtime_init(60, 96, 48_000.0, frames as i32);
    assert!(handle > 0);
    assert_eq!(
        concert_grand::cg_runtime_step(
            handle,
            left_a.as_mut_ptr(),
            right_a.as_mut_ptr(),
            frames as i32
        ),
        concert_grand::CG_RUNTIME_STEP_PROGRESS
    );
    /* Same-frame-count DIFFERENT buffers: must refuse, not normalize. */
    assert_eq!(
        concert_grand::cg_runtime_step(
            handle,
            left_b.as_mut_ptr(),
            right_b.as_mut_ptr(),
            frames as i32
        ),
        0
    );
    /* The pinned pair keeps working after the refused impostor. */
    assert_eq!(
        concert_grand::cg_runtime_step(
            handle,
            left_a.as_mut_ptr(),
            right_a.as_mut_ptr(),
            frames as i32
        ),
        concert_grand::CG_RUNTIME_STEP_PROGRESS
    );
    assert_eq!(concert_grand::cg_runtime_reset(handle), 1);
}
