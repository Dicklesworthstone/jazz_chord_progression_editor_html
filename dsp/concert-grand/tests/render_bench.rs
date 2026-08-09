// Native render-cost attribution bench (jcpe-render-speed-campaign-etnw).
// Run: cargo test --release --test render_bench -- --ignored --nocapture
#[path = "../src/trumpet.rs"]
mod trumpet;

use trumpet::{tpt_note_frames, tpt_render};

#[test]
#[ignore]
fn bench_trumpet_two_seconds() {
    let rate = 48_000.0f32;
    let frames = tpt_note_frames(58, rate).min((2.0 * rate as f64) as i32);
    assert!(frames > 0);
    let mut left = vec![0.0f32; frames as usize];
    let mut right = vec![0.0f32; frames as usize];
    // warm
    let w = tpt_render(58, 96, rate, left.as_mut_ptr(), right.as_mut_ptr(), frames);
    assert!(w > 0);
    let start = std::time::Instant::now();
    let w = tpt_render(58, 96, rate, left.as_mut_ptr(), right.as_mut_ptr(), frames);
    let dt = start.elapsed().as_secs_f64();
    assert!(w > 0);
    println!("frames={w} wall={dt:.3}s native-ratio={:.3}x", dt / (w as f64 / rate as f64));
}
