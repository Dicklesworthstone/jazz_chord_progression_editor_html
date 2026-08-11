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
        "changes.piano-v2-soundboard-pack.v4"
    );
    assert_eq!(
        PIANO_V2_SOUNDBOARD_PACK_FRANKENSIM_COMMIT,
        "416cb468d095bdac4453f0cbccbcc8c9cbfb2a3b"
    );
    assert_eq!(
        PIANO_V2_SOUNDBOARD_PACK_GENERATOR_SHA256,
        "7fb93188d16d82661e5346ab4e7e8d41bb73b2fec62a3582a3f8c8482ff2b4af"
    );
    assert_eq!(
        PIANO_V2_SOUNDBOARD_PACK_INPUT_SHA256,
        "8c0f500ad852930ccfc0ba40c33425a595151f56486c18e094f766b180bfc791"
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
    assert_eq!(JSON_PACK.matches("\"frequencyHz\"").count(), 1_195);
    assert_eq!(JSON_PACK.matches("\"nodeWInverseSqrtKg\"").count(), 1_195);
    assert!(JSON_PACK.contains("\"certifiedSliceCount\": 12"));
    assert!(JSON_PACK.contains("\"refinedModeCount\": 1"));
    assert!(JSON_PACK.contains("\"bridgeCount\": 2"));
    assert!(JSON_PACK.contains("\"support\": \"clamped-rim\""));
    assert!(JSON_PACK.contains(
        "Miranda-Valiente-et-al-JASA-2024-Table-I-1.66x1.39m-7-to-9mm-midpoint-reduction-and-section-II-clamped-rim"
    ));
    assert!(JSON_PACK.contains("\"bridgeWidthM\": 0.032"));
    assert!(JSON_PACK.contains("\"bridgeHeightM\": 0.037"));
    assert!(JSON_PACK.contains("\"bassBridgeMaxMidi\": 43"));
    assert!(JSON_PACK.contains("\"trebleBridgeMinMidi\": 44"));
    assert!(JSON_PACK
        .contains("Corradi-et-al-2017-G3-32x37mm-maple-constant-section-two-beam-reduction"));
    assert!(JSON_PACK.contains("\"maximumRefinedMassOrthogonalityDefect\""));
    assert!(JSON_PACK.contains("\"radiationQuadratureOrder\": 8"));
    assert!(JSON_PACK.contains("\"radiationQuadraturePointsPerTriangle\": 64"));
    assert!(JSON_PACK.contains("\"radiationQuadratureEvaluationCount\": 440524800"));
    assert!(JSON_PACK.contains("\"maximumUniformPistonQuadratureErrorM2\""));
    assert!(JSON_PACK.contains(
        "signed-P1-surface-Duffy-Gauss8-infinite-rigid-baffle-Rayleigh-I-one-metre-far-field"
    ));
}

#[test]
fn dkt_modes_match_independently_frozen_known_answers_and_residual_bounds() {
    assert_eq!(PIANO_V2_SOUNDBOARD_MODE_PACK.len(), 1_195);
    let known = [
        (0, 82.691_609_770_810_81),
        (31, 751.833_401_743_560_9),
        (95, 1_901.831_811_871_261_6),
        (191, 2_579.247_418_254_941),
        (287, 2_902.706_210_469_061),
        (511, 5_984.658_288_284_779),
        (767, 7_750.717_353_557_707),
        (1_023, 10_986.859_664_917_847),
        (1_194, 11_980.013_937_027_55),
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
    for mode_index in 0..PIANO_V2_SOUNDBOARD_MODE_PACK.len() {
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
    assert_eq!(
        voice.soundboard_mode_frequency_hz(PIANO_V2_SOUNDBOARD_MODE_PACK.len()),
        None
    );

    let treble = PianoVoice::new(108, 96_000.0, canonical).unwrap();
    let treble_pack_indices = (0..PIANO_V2_SOUNDBOARD_MODE_PACK.len())
        .map(|mode_index| treble.soundboard_mode_pack_index(mode_index).unwrap())
        .collect::<Vec<_>>();
    assert_eq!(
        treble_pack_indices,
        (0..PIANO_V2_SOUNDBOARD_MODE_PACK.len()).collect::<Vec<_>>(),
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
fn conservative_triangle_ports_match_frozen_release_answers() {
    let known = [
        (
            0,
            [
                (0, 0.080_269_500_573_073_96),
                (39, 0.453_398_273_007_509_46),
                (87, -0.000_072_322_830_218_833_86),
            ],
            [
                0.966_543_672_910_164_4,
                35.686_494_426_531_105,
                -0.975_702_311_302_986_2,
                35.680_637_762_873_644,
            ],
        ),
        (
            31,
            [
                (0, 0.229_898_309_394_310_55),
                (39, -0.076_242_366_784_265_02),
                (87, 0.005_660_000_862_159_144_5),
            ],
            [
                85.703_660_362_790_13,
                7.487_696_221_849_167,
                70.992_928_538_474_5,
                6.436_868_681_212_744,
            ],
        ),
        (
            95,
            [
                (0, 0.171_015_614_793_772_75),
                (39, -0.146_727_650_324_827_76),
                (87, -0.008_398_408_980_810_667),
            ],
            [
                86.891_004_625_950_22,
                22.522_167_431_670_844,
                -80.596_398_631_523_75,
                21.466_805_675_641_663,
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
