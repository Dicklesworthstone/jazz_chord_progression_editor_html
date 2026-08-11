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
        "1346e1be67951ba0ba81f3e99f5eeca6efc42945"
    );
    assert_eq!(
        PIANO_V2_SOUNDBOARD_PACK_GENERATOR_SHA256,
        "26804e425fc4e35e883565113a8c5401df580a838769e205d6f1e19a59fa0d34"
    );
    assert_eq!(
        PIANO_V2_SOUNDBOARD_PACK_INPUT_SHA256,
        "a887a40163ba4f2abed905405bcc3db6cd617737068b13404a37cc514fd35b71"
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
    assert_eq!(JSON_PACK.matches("\"frequencyHz\"").count(), 1_226);
    assert_eq!(JSON_PACK.matches("\"nodeWInverseSqrtKg\"").count(), 1_226);
    assert!(JSON_PACK.contains("\"certifiedSliceCount\": 12"));
    assert!(JSON_PACK.contains("\"refinedModeCount\": 8"));
    assert!(JSON_PACK.contains("\"bridgeCount\": 2"));
    assert!(JSON_PACK.contains("\"bridgeWidthM\": 0.032"));
    assert!(JSON_PACK.contains("\"bridgeHeightM\": 0.037"));
    assert!(JSON_PACK.contains("\"bassBridgeMaxMidi\": 43"));
    assert!(JSON_PACK.contains("\"trebleBridgeMinMidi\": 44"));
    assert!(JSON_PACK
        .contains("Corradi-et-al-2017-G3-32x37mm-maple-constant-section-two-beam-reduction"));
    assert!(JSON_PACK.contains("\"maximumRefinedMassOrthogonalityDefect\""));
    assert!(JSON_PACK.contains(
        "Batoz-1980-equation-75-triangle-area-over-3-nodal-load-infinite-baffle-Rayleigh-1m"
    ));
}

#[test]
fn dkt_modes_match_independently_frozen_known_answers_and_residual_bounds() {
    assert_eq!(PIANO_V2_SOUNDBOARD_MODE_PACK.len(), 1_226);
    let known = [
        (0, 37.687_342_860_361_39),
        (31, 613.205_051_375_822_3),
        (95, 1_718.797_532_503_682_3),
        (191, 2_357.543_939_814_805),
        (287, 2_788.551_394_237_302_7),
        (511, 5_618.088_070_559_347),
        (767, 7_528.163_908_438_721),
        (1_023, 10_803.904_937_370_06),
        (1_225, 11_988.714_908_832_939),
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
            pack_index, mode_index,
            "the fixed low-pass reduction skipped pack mode {mode_index}"
        );
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
    assert_eq!(
        treble_pack_indices,
        (0..288).collect::<Vec<_>>(),
        "requested pitch changed the fixed physical soundboard reduction"
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

#[test]
fn conservative_triangle_ports_match_independently_frozen_known_answers() {
    let known = [
        (
            0,
            [
                (0, 0.158_550_430_192_815_8),
                (39, 0.353_238_477_102_758_1),
                (87, 0.001_898_359_457_519_804_4),
            ],
            [
                0.006_701_382_640_627_383,
                19.233_673_466_139_04,
                -0.006_791_787_749_627_787,
                19.233_254_621_263_185,
            ],
        ),
        (
            31,
            [
                (0, 0.115_097_041_446_248_3),
                (39, -0.134_750_749_521_709_4),
                (87, 0.024_939_757_142_157_86),
            ],
            [
                -5.191_236_750_395_668,
                12.232_067_114_470_46,
                -4.922_413_490_210_015,
                -0.003_894_016_428_490_115,
            ],
        ),
        (
            95,
            [
                (0, -0.115_927_099_481_699_91),
                (39, 0.074_847_600_214_152_5),
                (87, 0.079_739_956_372_360_63),
            ],
            [
                54.561_210_121_663_81,
                -21.942_359_939_941_163,
                -25.001_856_012_038_893,
                -12.596_407_179_593_164,
            ],
        ),
    ];
    for (mode_index, bridge, observer) in known {
        let mode = &PIANO_V2_SOUNDBOARD_MODE_PACK[mode_index];
        for (key_index, expected) in bridge {
            assert!(
                (mode.bridge_residue_inverse_sqrt_kg[key_index] - expected).abs() < 1.0e-12,
                "mode {mode_index} bridge key {key_index}"
            );
        }
        for (channel, expected) in observer.into_iter().enumerate() {
            assert!(
                (mode.observer_pa_s_per_m_sqrt_kg[channel] - expected).abs() < 1.0e-10,
                "mode {mode_index} observer channel {channel}"
            );
        }
    }
}
