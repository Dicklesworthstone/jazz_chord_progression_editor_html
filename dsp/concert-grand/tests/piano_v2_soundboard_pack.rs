#[path = "../src/piano_v2.rs"]
mod piano_v2;

use piano_v2::piano_v2_soundboard::{
    PIANO_V2_SOUNDBOARD_MODE_PACK, PIANO_V2_SOUNDBOARD_PACK_FRANKENSIM_COMMIT,
    PIANO_V2_SOUNDBOARD_PACK_GENERATOR_SHA256, PIANO_V2_SOUNDBOARD_PACK_INPUT_SHA256,
    PIANO_V2_SOUNDBOARD_PACK_MAXIMUM_RESIDUAL, PIANO_V2_SOUNDBOARD_PACK_SCHEMA,
    PIANO_V2_SOUNDBOARD_PACK_TOOL_LOCK_SHA256, PIANO_V2_SOUNDBOARD_PACK_TOOL_MANIFEST_SHA256,
};
use piano_v2::{soundboard_mode_frequency_hz, PianoError, PianoParameters, PianoVoice};

const JSON_PACK: &str = include_str!("../../../physical/parameter-packs/piano-v2-soundboard.json");
const RUST_PACK: &str = include_str!("../src/piano_v2_soundboard.rs");

#[test]
fn generated_pack_is_bound_to_the_reviewed_frankensim_input() {
    assert_eq!(
        PIANO_V2_SOUNDBOARD_PACK_SCHEMA,
        "changes.piano-v2-soundboard-pack.v1"
    );
    assert_eq!(
        PIANO_V2_SOUNDBOARD_PACK_FRANKENSIM_COMMIT,
        "61824b0210356ddb7aec0e43ceef51ffa62e0775"
    );
    assert_eq!(
        PIANO_V2_SOUNDBOARD_PACK_GENERATOR_SHA256,
        "e73d1ea5c668d3aa89da2615f94e2755ffb8a5eec242c6a88fcecafae021cb1f"
    );
    assert_eq!(
        PIANO_V2_SOUNDBOARD_PACK_INPUT_SHA256,
        "e395695c4cd60fa193bc1098448be060a0a52973e87250c1d9be0882b07634ef"
    );
    assert_eq!(
        PIANO_V2_SOUNDBOARD_PACK_TOOL_MANIFEST_SHA256,
        "c212184ec61525a06d458b1e5b33b35ef3784b964d052483776f91bc7253fb72"
    );
    assert_eq!(
        PIANO_V2_SOUNDBOARD_PACK_TOOL_LOCK_SHA256,
        "402853e38d48b3563abf7fb0af179ff908d5c9a0782246a2497ab8182ee674ca"
    );
    assert!(JSON_PACK.contains(PIANO_V2_SOUNDBOARD_PACK_INPUT_SHA256));
    assert!(JSON_PACK.contains(PIANO_V2_SOUNDBOARD_PACK_GENERATOR_SHA256));
    assert!(JSON_PACK.contains(PIANO_V2_SOUNDBOARD_PACK_TOOL_MANIFEST_SHA256));
    assert!(JSON_PACK.contains(PIANO_V2_SOUNDBOARD_PACK_TOOL_LOCK_SHA256));
    assert!(JSON_PACK.contains(PIANO_V2_SOUNDBOARD_PACK_FRANKENSIM_COMMIT));
    assert!(RUST_PACK.contains(PIANO_V2_SOUNDBOARD_PACK_INPUT_SHA256));
    assert_eq!(JSON_PACK.matches("\"frequencyHz\"").count(), 288);
    assert_eq!(JSON_PACK.matches("\"nodeWInverseSqrtKg\"").count(), 288);
}

#[test]
fn dkt_modes_match_independently_frozen_known_answers_and_residual_bounds() {
    assert_eq!(PIANO_V2_SOUNDBOARD_MODE_PACK.len(), 288);
    let known = [
        (0, 39.061_918_469_525_08),
        (31, 605.334_072_356_179_1),
        (95, 1_523.587_725_435_037),
        (191, 2_115.408_317_392_734),
        (255, 2_900.229_724_552_747),
        (287, 3_876.760_575_988_39),
    ];
    for (index, expected_hz) in known {
        let actual = PIANO_V2_SOUNDBOARD_MODE_PACK[index].frequency_hz;
        assert!((actual - expected_hz).abs() < 1.0e-9, "mode {index}");
    }
    assert!(PIANO_V2_SOUNDBOARD_PACK_MAXIMUM_RESIDUAL < 3.0e-9);
    let mut previous = 0.0;
    for (index, mode) in PIANO_V2_SOUNDBOARD_MODE_PACK.iter().enumerate() {
        assert!(mode.frequency_hz.is_finite() && mode.frequency_hz > previous);
        assert!(mode.eigen_residual.is_finite() && mode.eigen_residual <= 3.0e-9);
        assert!(mode
            .bridge_residue_inverse_sqrt_kg
            .iter()
            .all(|value| value.is_finite()));
        assert!(mode
            .observer_pa_s_per_m_sqrt_kg
            .iter()
            .all(|value| value.is_finite()));
        assert!(
            mode.bridge_residue_inverse_sqrt_kg
                .iter()
                .any(|value| value.abs() > 1.0e-8),
            "mode {index} lost every reviewed bridge port"
        );
        previous = mode.frequency_hz;
    }
}

#[test]
fn production_uses_the_dkt_pack_and_refuses_to_relabel_it_as_new_geometry() {
    let canonical = PianoParameters::canonical();
    let voice = PianoVoice::new(60, 96_000.0, canonical).unwrap();
    for index in [0, 31, 95, 191, 255, 287] {
        assert_eq!(
            voice.soundboard_mode_frequency_hz(index),
            Some(PIANO_V2_SOUNDBOARD_MODE_PACK[index].frequency_hz)
        );
    }

    // The old smeared simply-supported sine-grid answer is deliberately not
    // the live plate fundamental. This planted near-miss catches a production
    // path that silently switches back to the analytic template.
    let old_template_hz = soundboard_mode_frequency_hz(canonical, 1, 1).unwrap();
    assert!((old_template_hz - PIANO_V2_SOUNDBOARD_MODE_PACK[0].frequency_hz).abs() > 5.0);

    // The checked-in pack represents one exact geometry. A valid-looking
    // parameter mutation must refuse until the offline DKT pack is regenerated
    // instead of reusing the old modes under a false label.
    let mut thicker = canonical;
    thicker.soundboard_thickness_m *= 1.01;
    assert_eq!(
        PianoVoice::new(60, 48_000.0, thicker).unwrap_err(),
        PianoError::InvalidParameters
    );
}

#[test]
fn bridge_and_observer_ports_do_not_collapse_to_one_unsigned_template() {
    let mut signed_bridge_modes = 0usize;
    let mut stereo_modes = 0usize;
    for mode in &PIANO_V2_SOUNDBOARD_MODE_PACK {
        let has_positive = mode
            .bridge_residue_inverse_sqrt_kg
            .iter()
            .any(|value| *value > 1.0e-6);
        let has_negative = mode
            .bridge_residue_inverse_sqrt_kg
            .iter()
            .any(|value| *value < -1.0e-6);
        signed_bridge_modes += usize::from(has_positive && has_negative);
        let left = mode.observer_pa_s_per_m_sqrt_kg[0].hypot(mode.observer_pa_s_per_m_sqrt_kg[1]);
        let right = mode.observer_pa_s_per_m_sqrt_kg[2].hypot(mode.observer_pa_s_per_m_sqrt_kg[3]);
        stereo_modes += usize::from((left - right).abs() > 1.0e-5);
    }
    assert!(
        signed_bridge_modes > 200,
        "only {signed_bridge_modes} signed modes"
    );
    assert!(stereo_modes > 200, "only {stereo_modes} directional modes");
}
