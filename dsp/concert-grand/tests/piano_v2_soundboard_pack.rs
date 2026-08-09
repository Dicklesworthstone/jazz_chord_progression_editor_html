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
        "changes.piano-v2-soundboard-pack.v2"
    );
    assert_eq!(
        PIANO_V2_SOUNDBOARD_PACK_FRANKENSIM_COMMIT,
        "f630aaf8968f9c3ef52cee23ef4badfccfa54252"
    );
    assert_eq!(
        PIANO_V2_SOUNDBOARD_PACK_GENERATOR_SHA256,
        "ca21179a541c28c2c052ae20109609b8752a81e7bc268c606dc51e09edef7273"
    );
    assert_eq!(
        PIANO_V2_SOUNDBOARD_PACK_INPUT_SHA256,
        "560f3ef1de0f73e1b71a1ab2ae73c381cca267c9ff01463550f9c46fef2a7a6c"
    );
    assert_eq!(
        PIANO_V2_SOUNDBOARD_PACK_TOOL_MANIFEST_SHA256,
        "a6754dadc38e48809cdf123133144c4af9e874f1621c98a7b38d38a1cfef7774"
    );
    assert_eq!(
        PIANO_V2_SOUNDBOARD_PACK_TOOL_LOCK_SHA256,
        "c195adfbc3ab5169aca15d530b6e008b57aec145570459ca7958f063f8409df4"
    );
    assert!(JSON_PACK.contains(PIANO_V2_SOUNDBOARD_PACK_INPUT_SHA256));
    assert!(JSON_PACK.contains(PIANO_V2_SOUNDBOARD_PACK_GENERATOR_SHA256));
    assert!(JSON_PACK.contains(PIANO_V2_SOUNDBOARD_PACK_TOOL_MANIFEST_SHA256));
    assert!(JSON_PACK.contains(PIANO_V2_SOUNDBOARD_PACK_TOOL_LOCK_SHA256));
    assert!(JSON_PACK.contains(PIANO_V2_SOUNDBOARD_PACK_FRANKENSIM_COMMIT));
    assert!(RUST_PACK.contains(PIANO_V2_SOUNDBOARD_PACK_INPUT_SHA256));
    assert_eq!(JSON_PACK.matches("\"frequencyHz\"").count(), 1_239);
    assert_eq!(JSON_PACK.matches("\"nodeWInverseSqrtKg\"").count(), 1_239);
    assert!(JSON_PACK.contains("\"certifiedSliceCount\": 12"));
    assert!(JSON_PACK.contains("\"refinedModeCount\": 2"));
    assert!(JSON_PACK.contains("\"maximumRefinedMassOrthogonalityDefect\""));
}

#[test]
fn dkt_modes_match_independently_frozen_known_answers_and_residual_bounds() {
    assert_eq!(PIANO_V2_SOUNDBOARD_MODE_PACK.len(), 1_239);
    let known = [
        (0, 39.083_986_320_762_27),
        (31, 608.554_756_151_908_5),
        (95, 1_723.708_851_954_870_9),
        (191, 2_350.886_327_995_278_4),
        (287, 2_764.070_934_430_351_4),
        (511, 5_662.704_089_523_185),
        (767, 7_379.552_660_048_264),
        (1_023, 10_796.703_034_698_176),
        (1_238, 11_999.415_786_947_086),
    ];
    for (index, expected_hz) in known {
        let actual = PIANO_V2_SOUNDBOARD_MODE_PACK[index].frequency_hz;
        assert!((actual - expected_hz).abs() < 1.0e-9, "mode {index}");
    }
    assert!(PIANO_V2_SOUNDBOARD_PACK_MAXIMUM_RESIDUAL <= 1.0e-8);
    let mut previous = 0.0;
    for (index, mode) in PIANO_V2_SOUNDBOARD_MODE_PACK.iter().enumerate() {
        assert!(mode.frequency_hz.is_finite() && mode.frequency_hz > previous);
        assert!(mode.eigen_residual.is_finite() && mode.eigen_residual <= 1.0e-8);
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
    let mut previous_pack_index = None;
    for mode_index in 0..288 {
        let pack_index = voice.soundboard_mode_pack_index(mode_index).unwrap();
        assert_eq!(
            voice.soundboard_mode_frequency_hz(mode_index),
            Some(PIANO_V2_SOUNDBOARD_MODE_PACK[pack_index].frequency_hz)
        );
        assert!(previous_pack_index.is_none_or(|previous| pack_index > previous));
        previous_pack_index = Some(pack_index);
    }
    assert_eq!(voice.soundboard_mode_frequency_hz(288), None);

    let treble = PianoVoice::new(108, 96_000.0, canonical).unwrap();
    let treble_pack_indices = (0..288)
        .map(|mode_index| treble.soundboard_mode_pack_index(mode_index).unwrap())
        .collect::<Vec<_>>();
    assert!(
        treble_pack_indices.iter().any(|index| *index > 287),
        "the note-aware reduction collapsed back to the old first-288 truncation"
    );
    assert!(
        treble_pack_indices
            .iter()
            .any(|index| PIANO_V2_SOUNDBOARD_MODE_PACK[*index].frequency_hz > 8_000.0),
        "the treble note lost the certified high-frequency board response"
    );

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
