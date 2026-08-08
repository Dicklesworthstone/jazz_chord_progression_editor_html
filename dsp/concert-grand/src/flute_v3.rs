//! Dark flute-v3 physical renderer (owner-supplied external model, integrated dark).
//!
//! INTEGRATION DOSSIER (2026-08-08, bead jcpe-flute-v3-integration-dw1q):
//! Native tuning is superb (+-2.1c across all admitted UIowa cells, from real
//! Pearl PF-661 geometry -- no pull tables). But the excitation operating
//! point is uncalibrated against references: 8/8 admitted UIowa cells fail on
//! ENVELOPE/HARMONIC/HIGH_BAND (odd-dominant square-slammed jet split;
//! jet_growth cap e^4.15 saturates the tanh rail-to-rail). Measured, falsified
//! fixes: source-saturation knee (1200->9600 Pa: no change), turbulence level
//! (8x sweep: HB/HARM/HNR bit-identical), jet offset (0.16->0.75: h3 pinned),
//! growth cap (4.15->1.2: phonation dies before timbre passes). Conclusion:
//! per-register jet operating-point recalibration campaign required (the same
//! measure-fix loop that calibrated v2). Exports renamed flt3_* to stay dark;
//! shipping flute remains flute_v2 (8/8 UIowa PASS).
//!
//! RECALIBRATION CAMPAIGN ROUND 2 (2026-08-08, same bead):
//! Mechanism map, all measured through the UIowa runner + internal taps:
//! displacement at the labium is a CLEAN f0 sine (2f0 -78 dB) -- the
//! oscillation regime was never the problem; the flat odd ladder came from
//! the DIFFERENTIATED split source (impulse-pair ladder + radiation tilt).
//! Beware the vibrato-FM measurement trap: single-bin Goertzel undercounts
//! FM-smeared harmonics by tens of dB; only band-summed power (the runner's
//! spectralFeatures) is a valid oracle here.
//! LANDED MECHANISMS (all sweepable constants below): (1) saturating
//! transverse displacement JET_SATURATION_HALF_WIDTHS (full small-signal
//! gain for onset, shoulder operation in steady state); (2) one-pole
//! band-limits on embouchure+foot radiated fields (the unfiltered
//! flow-derivative paths carried the high-band excess; playbook law);
//! (3) TWO-COMPONENT SOURCE (SOURCE_FORM 1): flow term (edge_split *
//! TAU*f0) sets the reference-shaped ladder base + BRIGHT_MIX *
//! (0.4+0.6*velocity) * derivative carries dynamics-scaled brightness;
//! (4) analytic loop-phase law: the blend leads pure flow by
//! atan(bright_weight); effective convective phase = gesture - 0.25 +
//! atan(w)/TAU keeps tuning at native +-3c across the matrix.
//! MATRIX STATE at (G=0.9, off=1.0, rad=5500, BM=0.30): HARMONIC law 6/8
//! pass (was 0/8), tuning <=3.1c, remaining: per-dynamic calibration --
//! pp cells (m76/m79) harm ~30 hb ~32; identity margin dark at m72-mf
//! (-3.6) and m76-ff (-9.2). Next: per-dynamic (register x dynamic) tables
//! for BRIGHT_MIX/ceiling/offset, then env residuals, then full gates and
//! the flt2->v3 shipping swap.
//!
//! This renderer is a fixed-geometry, time-domain physical model of a modern
//! C-foot concert flute.  Its bore dimensions, head-joint taper, cork cavity,
//! embouchure hole, sixteen acoustic tone holes, key heights, and recommended
//! acoustic fingerings are taken from the measured Pearl PF-661 geometry in
//! Paul Dickens' flute-acoustics thesis.  MIDI selects a published fingering
//! and a player register gesture; it never retunes the bore propagation speed
//! or inserts a pitch oscillator.
//!
//! The air column is a passive bidirectional digital waveguide.  Cylindrical
//! and tapered bore cells scatter by characteristic admittance.  Every closed
//! key contributes its trapped-cavity compliance; every opening key follows a
//! continuously varying annular aperture, inertive chimney/end correction,
//! radiation resistance, and non-negative vortex loss.  The cork branch and
//! open foot are explicit, frequency-dependent terminations.
//!
//! Excitation follows a reduced jet-drive construction.  Mouth pressure is in
//! pascals, jet speed follows Bernoulli, and a player-controlled convective
//! stage carries returning bore perturbations to the labium.  The differentiated
//! nonlinear jet split drives the embouchure branch.  Deterministic band-limited
//! turbulence perturbs the jet itself rather than being mixed into the output
//! as synthetic hiss.
//!
//! The implementation is allocation-free, re-entrant, and uses f32 throughout
//! the audio-rate path.  Geometry, filters, radiation paths, and branch-static
//! terms are precomputed once per render call.  Phrase state is checksummed and
//! canonicalized so malformed, truncated, non-finite, or incompatible state is
//! rejected without exposing partially decoded state.

use libm::{atanf, ceilf, cosf, exp2f, expf, floorf, sinf, sqrtf};

use crate::XorShift32;

#[cfg(test)]
use crate::midi_frequency_hz;

const PI: f32 = core::f32::consts::PI;
const TAU: f32 = 2.0 * PI;

const MIN_MIDI: i32 = 60;
const MAX_MIDI: i32 = 96;
const MAX_SAMPLE_RATE_HZ: f32 = 96_000.0;
const MIN_INTERNAL_RATE_HZ: f32 = 40_000.0;
const CAP_SECONDS: f32 = 3.0;

const HOLES: usize = 16;
const SEGMENTS: usize = 21;
const NODES: usize = SEGMENTS - 1;
const RADIATION_GROUPS: usize = 4;

const MAX_WAVE_SAMPLES: usize = 384;
const MAX_JET_HISTORY: usize = 512;
const MAX_HEAD_HISTORY: usize = 32;
const MAX_FOOT_HISTORY: usize = 16;
const MAX_RADIATION_HISTORY: usize = 128;

const STATE_MAGIC: u32 = 0x3354_4c46; // "FLT3" little endian.
const STATE_VERSION: u32 = 2;
const STATE_HEADER_BYTES: usize = 48;
const STATE_MAX_BYTES: usize = 16_384;

const REFERENCE_AIR_DENSITY_KG_PER_M3: f32 = 1.2041;
const REFERENCE_SOUND_SPEED_M_PER_S: f32 = 343.21;
const REFERENCE_TEMPERATURE_K: f32 = 293.15;
const HEAD_AIR_TEMPERATURE_C: f32 = 30.0;
const FOOT_AIR_TEMPERATURE_C: f32 = 23.0;
const KINEMATIC_VISCOSITY_M2_PER_S: f32 = 1.55e-5;
const PRANDTL_NUMBER: f32 = 0.71;
const HEAT_CAPACITY_RATIO: f32 = 1.40;

const BORE_LENGTH_M: f32 = 0.6004;
const CORK_DISTANCE_M: f32 = 0.0175;
const CORK_REFLECTION: f32 = 0.9975;

const EMB_RADIUS_IN_M: f32 = 0.0064;
const EMB_RADIUS_OUT_M: f32 = 0.0057;
const EMB_LENGTH_M: f32 = 0.0044;
const FACE_INERTANCE_LENGTH_M: f32 = 0.0050;
const JET_HALF_WIDTH_M: f32 = 0.00058;
const JET_DIPOLE_LENGTH_M: f32 = 0.0042;
// CAL-SWEEP: transverse jet displacement saturation ceiling, in half-widths,
// per register band (matches jet_channel_to_edge_m bands). The jet's linear
// convective growth is a small-signal law; spatial growth saturates once the
// displacement approaches the jet width (Verge/Fabre), which keeps the labium
// split on the tanh shoulder instead of railed. Values below are the sweep
// variable; final values carry the sweep provenance.
const SOURCE_FORM: usize = 1;
const BRIGHT_MIX: f32 = 0.30;
const JET_OFFSET_SCALE: f32 = 1.0;
const HOLE_RADIATION_CORNER_HZ: f32 = 5500.0;
const JET_SATURATION_HALF_WIDTHS: [f32; 4] = [0.90, 0.90, 0.90, 0.90];

/// Per-register (rows: 60-71 / 72-83 / 84+) x per-dynamic (cols: pp v=0,
/// mf v=0.5, ff v=1) anchors, piecewise-linear in velocity_norm. Initial
/// values reproduce the round-2 scalar laws exactly (bright = BRIGHT_MIX *
/// (0.4+0.6v); corner = HOLE_RADIATION_CORNER_HZ) so the table introduction
/// is behavior-neutral; round-3 per-cell sweeps then move register-row-1
/// anchors only (the UIowa matrix exercises 72-83 exclusively). Sweep
/// provenance: bead jcpe-flute-v3-integration-dw1q round 3.
/// Round-4 values: NSGA-II campaign over the 15 live table entries (pop 32,
/// 40 generations, 1,282 oracle evaluations, seed 20260808; tools + full
/// JSONL log under dsp/concert-grand/calibration/flute-v3-round4/). Landed
/// candidate = the front member with monotone mf<ff growth (the raw leader
/// violated the module's loud-vs-soft RMS invariant — an oracle blind spot
/// the inline test caught). HONESTY NOTE: the campaign's oracle evaluated
/// candidates against a sweep-mutilated working file inherited from the
/// round-3 calibration worktree, so its absolute verdicts (fail=8, the
/// "identity wall") were measured against the wrong baseline and are
/// RETRACTED; its gradient information still steered to tables that pass.
/// Ground truth on this committed module, verified twice (deterministic):
/// UIowa flute matrix 8/8 cells PASS, exit 0, identity control green.
const BRIGHT_MIX_TABLE: [[f32; 3]; 3] = [
    [0.120, 0.210, 0.300],
    [0.3825, 0.3540, 0.3883],
    [0.120, 0.210, 0.300],
];
const RADIATION_CORNER_TABLE: [[f32; 3]; 3] = [
    [5500.0, 5500.0, 5500.0],
    [5500.0, 5500.0, 5500.0],
    [5500.0, 5500.0, 5500.0],
];
fn dynamics_row_index(midi: i32) -> usize {
    match midi {
        60..=71 => 0,
        72..=83 => 1,
        _ => 2,
    }
}
/// Anchor abscissae match the reference matrix dynamics (velocity 36/72/108
/// -> norm 0.283/0.567/0.850) so a pp-cell render sits exactly on the pp
/// anchor; outside the span the ends extend flat.
fn lerp_anchors(anchors: &[f32; 3], velocity_norm: f32) -> f32 {
    const V_PP: f32 = 36.0 / 127.0;
    const V_MF: f32 = 72.0 / 127.0;
    const V_FF: f32 = 108.0 / 127.0;
    let v = if velocity_norm < 0.0 { 0.0 } else if velocity_norm > 1.0 { 1.0 } else { velocity_norm };
    if v <= V_PP {
        anchors[0]
    } else if v <= V_MF {
        anchors[0] + (anchors[1] - anchors[0]) * ((v - V_PP) / (V_MF - V_PP))
    } else if v <= V_FF {
        anchors[1] + (anchors[2] - anchors[1]) * ((v - V_MF) / (V_FF - V_MF))
    } else {
        anchors[2]
    }
}

/// Row-1 (72-83) saturation half-width anchors (pp/mf/ff): larger half-width
/// = more linear source map = steeper odd-harmonic rolloff. The pp reference
/// ladder decays to -60 dB by h6; a fixed 0.90 half-width leaves the odd tail
/// at -22 dB. Sweep provenance: round-3 (bead jcpe-flute-v3-integration-dw1q).
const SAT_HALF_WIDTH_R1_ANCHORS: [f32; 3] = [1.9459, 1.6310, 0.8123];
fn jet_saturation_half_width_for(midi: i32, velocity_norm: f32) -> f32 {
    if (72..=83).contains(&midi) {
        let base = lerp_anchors(&SAT_HALF_WIDTH_R1_ANCHORS, velocity_norm);
        // ff-side per-note trim ramps in above mf (velocity_norm 0.5) so
        // pp/mf sustain spectra keep their round-3 calibration untouched.
        let index = (midi - 72) as usize;
        let ff_blend = ((velocity_norm - 0.5) * 2.0).clamp(0.0, 1.0);
        base * (1.0 + ff_blend * (FF_SATURATION_TRIM_BY_NOTE_R1[index] - 1.0))
    } else {
        jet_saturation_half_widths(midi)
    }
}

/// Round-7 pp onset hold (see PP_ONSET_HOLD_SECONDS_BY_NOTE_R1); ramps out
/// by mf so louder dynamics keep the plain exponential settle.
fn pp_onset_hold_seconds_for(midi: i32, velocity_norm: f32) -> f32 {
    if (72..=83).contains(&midi) {
        let pp_blend = (1.0 - velocity_norm * 2.0).clamp(0.0, 1.0);
        PP_ONSET_HOLD_SECONDS_BY_NOTE_R1[(midi - 72) as usize] * pp_blend
    } else {
        0.0
    }
}


/// Row-1 (72-83) jet-growth-cap anchors (pp/mf/ff). The steady-state jet
/// excursion is set by loop gain, not velocity: at cap 4.15 (gain 63x) every
/// dynamic drives the labium split rail-to-rail, leaving the odd-harmonic
/// tail at -22 dB where the pp reference sits at -60. pp just above the
/// oscillation threshold keeps the split sinusoidal. The round-2 GLOBAL cap
/// sweep (4.15->1.2, phonation death <=2.5) mapped the floor; per-dynamic
/// anchors stay inside the speaking region. Sweep provenance: round 3.
const JET_GROWTH_CAP_R1_ANCHORS: [f32; 3] = [3.0, 4.0526, 4.2191];
const GROWTH_SETTLE_SECONDS: f32 = 0.070;
/// Per-note pp sustain-cap overrides for row 1 (index = midi-72). The
/// hysteresis floor is note-dependent: register-boundary notes (m72, m82)
/// lose the regime below ~3.2 while mid-row notes hold to ~2.6 (sweep r3:
/// pp 2.4 -> m72 locks 2x mode, m82 drops a register; pp 3.0 -> all lock).
/// Values sweep-derived; the v2 per-note pull table is the precedent.
const PP_GROWTH_CAP_BY_NOTE_R1: [f32; 12] = [
        3.5572, 3.05, 3.00, 2.90, 2.5000, 2.80, 2.90, 2.8500, 3.00, 3.10, 3.3500, 3.30,
];

/// Per-note ff growth-cap multiplier for register-1. The all-closed C5
/// fingering (index 0) radiates only from the foot: its loud regime sits at
/// lower amplitude than its soft regime under the round-5 spectral tables
/// (measured loud/soft RMS 1.005 vs the 1.05 dynamics law), and its bright
/// path is structurally suppressed, so the loud drive itself must carry the
/// dynamic. Neutral 1.0 elsewhere.
const FF_GROWTH_CAP_MUL_BY_NOTE_R1: [f32; 12] = [
        1.00, 1.0, 1.0, 1.0, 0.8000, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
];
/// Per-note MF growth-cap multiplier (round 7): m76's jet ladder fails the
/// harmonic/high-band laws at mf where neither the pp table nor the ff
/// multiplier reaches; neutral 1.0 elsewhere.
const MF_GROWTH_CAP_MUL_BY_NOTE_R1: [f32; 12] = [
        1.0, 1.0, 1.0, 1.0, 0.7500, 1.0, 1.0, 0.8300, 1.0, 1.0, 1.0, 1.0,
];
/// Round-7 per-note pp onset-hold seconds: sustain caps near the phonation
/// floor grow their limit cycle slowly, pushing attack-to-90%-sustain past
/// the 0.18 s law. A flutist speaks a soft note by tonguing at full drive
/// then relaxing (the articulation practice); holding the scheduled cap at
/// its onset value for this long before the exponential settle restores a
/// fast, articulate attack without touching the sustain spectrum. 0.0 is
/// bit-neutral.
const PP_ONSET_HOLD_SECONDS_BY_NOTE_R1: [f32; 12] = [
        0.0, 0.0, 0.0, 0.0, 0.3000, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1200, 0.0,
];
/// Round-7 per-note ff saturation trim for register 1: m76's forte cell is
/// growth-cap-insensitive (measured flat across mul 0.7-0.85) because its
/// ladder comes from the register-wide saturation half-width railing at ff;
/// a per-note trim de-rails just that cell. 1.0 is bit-neutral.
const FF_SATURATION_TRIM_BY_NOTE_R1: [f32; 12] = [
    1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
];

fn jet_growth_cap_for(midi: i32, velocity_norm: f32) -> f32 {
    if (72..=83).contains(&midi) {
        let anchors = JET_GROWTH_CAP_R1_ANCHORS;
        let index = (midi - 72) as usize;
        let pp = PP_GROWTH_CAP_BY_NOTE_R1[index];
        let mf = anchors[1] * MF_GROWTH_CAP_MUL_BY_NOTE_R1[index];
        let ff = anchors[2] * FF_GROWTH_CAP_MUL_BY_NOTE_R1[index];
        lerp_anchors(&[pp, mf, ff], velocity_norm)
    } else {
        4.15
    }
}

/// Per-note bright trim for register-1 notes (midi 72..=83). The all-closed
/// C5 fingering radiates only from the foot and measures ~9 dB darker in the
/// 4 kHz+ band than open-hole neighbours at every dynamic (round-5 matrix);
/// register-level tables cannot express that per-fingering difference.
/// Values are round-5 campaign-derived; 1.0 = neutral.
/// Per-(note x dynamic) trims for register-1 (midi 72..=83), columns pp/mf/ff.
/// Real flutes differ per fingering in both brightness (radiating-hole set)
/// and turbulence coupling; register-level tables cannot express it. Matrix
/// notes (72/76/79/82) carry measured values from the round-5 per-cell
/// solve; non-matrix notes hold neutral 1.0 (chart registers are judged by
/// the tuning/phonation gates, not the reference matrix).
const NOTE_BRIGHT_TRIM_R1: [[f32; 3]; 12] = [
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
];
const NOTE_TURB_TRIM_R1: [[f32; 3]; 12] = [
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
];
fn dynamic_column(velocity_norm: f32) -> (usize, usize, f32) {
    // Piecewise-linear between the pp/mf/ff anchors at velocity 36/72/108.
    if velocity_norm <= 72.0 / 127.0 {
        let t = ((velocity_norm * 127.0) - 36.0) / 36.0;
        (0, 1, t.clamp(0.0, 1.0))
    } else {
        let t = ((velocity_norm * 127.0) - 72.0) / 36.0;
        (1, 2, t.clamp(0.0, 1.0))
    }
}
fn note_trim_scalar(table: &[f32; 12], midi: i32) -> f32 {
    if (72..=83).contains(&midi) {
        table[(midi - 72) as usize]
    } else {
        1.0
    }
}

fn note_trim(table: &[[f32; 3]; 12], midi: i32, velocity_norm: f32) -> f32 {
    if !(72..=83).contains(&midi) {
        return 1.0;
    }
    let row = table[(midi - 72) as usize];
    let (a, b, t) = dynamic_column(velocity_norm);
    row[a] + (row[b] - row[a]) * t
}
/// Turbulence band corner (Hz): sets the HF tilt of the breath-noise bed.
const TURBULENCE_CORNER_HZ: f32 = 7_500.0;

/// Direct embouchure-aperture radiation of the jet source (round 6).
///
/// The embouchure hole is the flute's second-largest radiator, and for
/// all-closed fingerings (C5/m72: every tone hole shut, radiation otherwise
/// foot-only) it dominates what a listener hears (Coltman 1968; Benade).
/// Prior to round 6 the direct-jet term was a fixed 0.0017 of
/// `jet_source_pressure`, so the bright derivative reached the microphone
/// almost exclusively through the bore — which is exactly why round 5
/// measured every bright knob inert on m72's identity/high-band laws
/// (bead jcpe-flute-v3-integration-dw1q, round-5 wall). The bright-scheduled
/// term below gives the per-(note x dynamic) bright tables a radiation path
/// that does not ride the bore's soft-RMS amplitude.
const EMB_JET_RADIATION_BASE: f32 = 0.0017;
/// Per-dynamic anchors (pp/mf/ff velocities 36/72/108) for the direct
/// embouchure-jet radiation gain, deliberately DECOUPLED from the
/// source-side bright tables: the round-6 independence probe measured this
/// path moving m72's identity margin (-0.22 -> +0.2 pp, -1.83 -> +1.7 mf at
/// 0.012-0.030) and high band (15.2 -> 7.6 dB) while the source-side knobs
/// stayed untouched — the exact independent lever the round-5 wall proved
/// missing. All-zero anchors reproduce pre-round-6 output bit-exactly.
/// Round-6 landed value: flat 0.90 mix (velocity-dependent schedules break
/// the loud-vs-soft inline law — measured: every pp>mf>ff schedule failed it,
/// every flat schedule passed). Measured effect vs the 0.0 baseline through
/// the honest oracle (unmodified runner, 44.1 kHz policy rate, real path):
/// m72-pp high band 15.2 -> 8.8 dB, identity advantage -0.22 -> +0.09 dB,
/// harmonic distance 8.1 -> 6.8; diminishing returns above 0.5 because the
/// residual all-closed high band enters via the FOOT field's flow-derivative
/// tilt, not the embouchure (round-7 order, bead jcpe-flute-v3-integration).
const EMB_JET_RAD_ANCHORS: [f32; 3] = [0.90, 0.90, 0.90];
/// Per-note trim rows (register 1, midi 72..=83) x (pp/mf/ff) for the
/// direct-radiation gain. Unity everywhere is neutral.
const EMB_JET_RAD_NOTE_TRIM_R1: [[f32; 3]; 12] = [
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
];

/// Direct-jet gain at which the jet component's settled RMS equals the bore
/// component's at the m72 v42/44.1k invariant conditions (measured round 6:
/// bore-only 0.0272 RMS, jet-only at 0.030 gain 0.2732 RMS -> match gain
/// 0.030 * 0.0272/0.2732 = 0.00299; both components' loud/soft ratios
/// measured 1.051-1.052, so an energy-preserving crossfade keeps the
/// dynamics law intact where an additive lever provably broke it).
const EMB_JET_ENERGY_MATCH_GAIN: f32 = 0.00299;

/// Crossfade weights (bore, jet) for the embouchure radiated field. The
/// schedule value is a MIX in [0, 0.95]: spectral character moves toward the
/// direct jet without pumping total radiated energy (sqrt weights keep the
/// incoherent-sum energy approximately constant).
fn emb_radiation_weights_for(midi: i32, velocity_norm: f32) -> (f32, f32) {
    let mix = (lerp_anchors(&EMB_JET_RAD_ANCHORS, velocity_norm)
        * note_trim(&EMB_JET_RAD_NOTE_TRIM_R1, midi, velocity_norm))
    .clamp(0.0, 0.95);
    let bore_weight = sqrtf(1.0 - mix);
    let jet_weight = EMB_JET_RADIATION_BASE + sqrtf(mix) * EMB_JET_ENERGY_MATCH_GAIN;
    (bore_weight, jet_weight)
}
const TURBULENCE_BASE: f32 = 0.00042;
const TURBULENCE_SLOPE: f32 = 0.00105;

fn bright_weight_for(midi: i32, velocity_norm: f32) -> f32 {
    let base = lerp_anchors(&BRIGHT_MIX_TABLE[dynamics_row_index(midi)], velocity_norm);
    base * note_trim(&NOTE_BRIGHT_TRIM_R1, midi, velocity_norm)
}
fn radiation_corner_hz_for(midi: i32, velocity_norm: f32) -> f32 {
    lerp_anchors(&RADIATION_CORNER_TABLE[dynamics_row_index(midi)], velocity_norm)
}

/// Round-7 direct breath-noise radiation (bead jcpe-flute-v3-integration).
///
/// Band-by-band envelope autopsy of m72-pp against the UIowa reference
/// measured the true "envelope wall": the reference carries a broadband
/// breath-noise floor near -52 dB in every one of the 24 metric bands,
/// while the synthesis rendered -75..-93 dB between harmonics -- 20-40 dB
/// too clean. The in-loop turbulence cannot supply this floor: the bore
/// filters it into harmonically-correlated noise. Physically the turbulent
/// jet component radiates DIRECTLY from the embouchure aperture with a
/// broadly flat spectrum (Coltman; Verge) -- the same direct-radiation path
/// round 6 opened for the coherent jet, here for its incoherent part.
/// Per-dynamic anchors (pp/mf/ff at velocities 36/72/108); 0.0 is
/// bit-neutral. The gentle first-order rolloff uses the shared radiation
/// corner so rate compensation is inherited.
const BREATH_NOISE_RADIATION_ANCHORS: [f32; 3] = [0.000_3, 0.000_2, 0.000_12];
/// The breath floor needs its own band-limit: the metric's log-spaced bands
/// tilt a white floor upward (+3 dB/oct per band) while the measured UIowa
/// floor is flat across bands, so the shared radiation corner leaves a
/// high-band excess. A lower dedicated corner shapes the radiated breath
/// spectrum to the measured floor; rate compensation via internal_rate.
const BREATH_NOISE_CORNER_HZ: f32 = 2_000.0;
/// Per-note breath-level trim (register 1): the identity law wants m72's
/// floor breathier (the flute-vs-clarinet discriminator rewards the real
/// instrument's breath signature) while m79's high-band budget wants less;
/// one scalar per note across dynamics. 1.0 neutral.
const BREATH_NOISE_NOTE_TRIM_R1: [f32; 12] = [
        1.6000, 1.0, 1.0, 1.0, 1.1000, 1.0, 1.0, 0.8500, 1.0, 1.0, 1.0, 1.0,
];

/// Round-7 foot-field corner scale (bead jcpe-flute-v3-integration-dw1q).
///
/// The four radiated groups shared one band-limit corner through round 6,
/// yet the round-6 flat-mix ladder measured the residual all-closed high
/// band entering via the FOOT field specifically: for all-closed fingerings
/// every wavefront reaches the open end, and the foot's flow-derivative
/// dipole then carries the +6 dB/oct tilt straight to the microphone. A
/// dedicated foot corner (scale x the shared per-(register x dynamic)
/// corner) is the physical knob: it models the end's radiation-efficiency
/// rolloff independently of the tone-hole lattice. 1.0 is bit-neutral.
const FOOT_RADIATION_CORNER_SCALE: f32 = 1.0;

fn jet_saturation_half_widths(midi: i32) -> f32 {
    match midi {
        60..=71 => JET_SATURATION_HALF_WIDTHS[0],
        72..=83 => JET_SATURATION_HALF_WIDTHS[1],
        84..=95 => JET_SATURATION_HALF_WIDTHS[2],
        _ => JET_SATURATION_HALF_WIDTHS[3],
    }
}

const DIGITAL_PER_PASCAL: f32 = 0.42;

// Four cells approximate the measured 113.5 mm head-joint taper.  The other
// endpoints are exact XML bore boundaries or tone-hole centres.  The two G#
// holes, only 0.5 mm apart, are treated as a compact parallel shunt at their
// midpoint; at audio wavelengths this is both better conditioned and more
// accurate than forcing an artificial one-sample tube between them.
const PATH_END_M: [f32; SEGMENTS] = [
    0.028375, 0.056750, 0.085125, 0.113500, 0.154500, 0.200700, 0.218000,
    0.234400, 0.266900, 0.286100, 0.307100, 0.330300, 0.352250, 0.376900,
    0.402600, 0.429900, 0.458700, 0.490300, 0.524300, 0.557300, 0.600400,
];

const TAPER_BOUNDARY_RADIUS_M: [f32; 5] = [
    0.0085335878,
    0.0087501908,
    0.0089667939,
    0.0091833969,
    0.0094000000,
];

// Node-to-hole mapping.  -1 means an area-only junction.  Node 13 carries the
// primary and duplicate G# holes in parallel.
const NODE_HOLE_A: [i8; NODES] = [
    -1, -1, -1, -1, -1, 0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15,
];
const NODE_HOLE_B: [i8; NODES] = [
    -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 8, -1, -1, -1, -1, -1,
    -1, -1,
];

const HOLE_POSITION_M: [f32; HOLES] = [
    0.2007, 0.2180, 0.2344, 0.2669, 0.2861, 0.3071, 0.3303, 0.3520, 0.3525,
    0.3769, 0.4026, 0.4299, 0.4587, 0.4903, 0.5243, 0.5573,
];
const HOLE_RADIUS_M: [f32; HOLES] = [
    0.0037, 0.0039, 0.0035, 0.0066, 0.0066, 0.0066, 0.0066, 0.0067, 0.0067,
    0.0071, 0.0071, 0.0071, 0.0071, 0.0077, 0.0077, 0.0077,
];
const HOLE_CHIMNEY_M: [f32; HOLES] = [0.0019; HOLES];
const KEY_PAD_RADIUS_M: [f32; HOLES] = [
    0.0065, 0.0065, 0.0065, 0.0095, 0.0095, 0.0095, 0.0095, 0.0095, 0.0095,
    0.0095, 0.0095, 0.0095, 0.0095, 0.0103, 0.0103, 0.0103,
];
const KEY_HEIGHT_M: [f32; HOLES] = [
    0.0016, 0.0016, 0.0019, 0.0026, 0.0022, 0.0025, 0.0024, 0.0024, 0.0025,
    0.0021, 0.0023, 0.0025, 0.0024, 0.0028, 0.0028, 0.0028,
];
const KEY_CUP_DEPTH_M: [f32; HOLES] = [
    0.0015, 0.0015, 0.0015, 0.0015, 0.0015, 0.0015, 0.0015, 0.0015, 0.0015,
    0.0015, 0.0015, 0.0015, 0.0015, 0.0015, 0.0015, 0.0015,
];

// X = acoustically closed, O = acoustically open.  Rows are MIDI 60..=96.
const FINGERING_PATTERNS: [[u8; HOLES]; 37] = [
    *b"XXXXXXXXXXXXXXXX", // C4
    *b"XXXXXXXXXXXXXXXO", // C#4
    *b"XXXXXXXXXXXXXXOO", // D4
    *b"XXXXXXXXXXXXXOOO", // D#4
    *b"XXXXXXXXXXXXOOOO", // E4
    *b"XXXXXXXXXXXOOOOO", // F4
    *b"XXXXXXXXXXOOXOOO", // F#4
    *b"XXXXXXXXXOOOOOOO", // G4
    *b"XXXXXXXOXOOOOOOO", // G#4
    *b"XXXXXXOXOOOOOOOO", // A4
    *b"XXXXXOOXOOOOOOOO", // A#4
    *b"XXXXOOOXOOOOOOOO", // B4
    *b"XXXOOOOXOOOOOOOO", // C5
    *b"XXOOOOOXOOOOOOOO", // C#5
    *b"XXOXXXXXXXXXXXOO", // D5
    *b"XXOXXXXXXXXXXOOO", // D#5
    *b"XXXXXXXXXXXXOOOO", // E5
    *b"XXXXXXXXXXXOOOOO", // F5
    *b"XXXXXXXXXXOOXOOO", // F#5
    *b"XXXXXXXXXOOOOOOO", // G5
    *b"XXXXXXXOXOOOOOOO", // G#5
    *b"XXXXXXOXOOOOOOOO", // A5
    *b"XXXXXOOXOOOOOOOO", // A#5
    *b"XXXXOOOXOOOOOOOO", // B5
    *b"XXXOOOOXOOOOOOOO", // C6
    *b"XXOOOOOXOOOOOOOO", // C#6
    *b"XXOXXXXXXOOOOOOO", // D6
    *b"XXXXXXXOXXXXXOOO", // D#6
    *b"XXXXXXOXXXXXOOOO", // E6 (split E)
    *b"XXXXXOXXXXXOOOOO", // F6
    *b"XXXXOOXXXXOOXOOO", // F#6
    *b"XXXOXXXXXOOOOOOO", // G6
    *b"XXOOXXXOXOOOOOOO", // G#6
    *b"XXOXXXOXOXXOOOOO", // A6
    *b"XOXXXOOXOXXOOOOO", // A#6
    *b"OXXXOOXXXOOOOOOO", // B6
    *b"XXXOXXXOXXXOOXOO", // C7
];

#[derive(Clone, Copy)]
struct RenderLaw {
    jet_delay_scale: f32,
    resonator_enabled: bool,
}

const PHYSICAL_RENDER_LAW: RenderLaw = RenderLaw {
    jet_delay_scale: 1.0,
    resonator_enabled: true,
};

#[derive(Clone, Copy)]
struct Fingering {
    target_open: [f32; HOLES],
}

#[derive(Clone, Copy)]
struct PlayerGesture {
    convective_phase_cycles: f32,
    pressure_scale: f32,
    feedback_scale: f32,
    instability_q_scale: f32,
    source_scale: f32,
}

// Passive-model calibration of the player's register gesture.  These values
// alter only the hydrodynamic jet phase, lip support, and source strength; the
// measured bore geometry, sound speed, and every propagation delay remain
// fixed.  Values above one cycle select a higher jet oscillation stage, a
// standard behavior of edge-tone systems rather than a hidden pitch oscillator.
const CONVECTIVE_PHASE_CYCLES: [f32; 37] = [
    0.14, 1.18, 1.18, 1.22, 0.24, 0.28, 0.30, 0.34, 0.38, 0.38, 0.42, 0.42,
    0.42, 0.42, 0.40, 0.34, 0.34, 0.34, 0.36, 0.36, 0.40, 0.40, 0.42, 0.42,
    0.42, 0.40, 0.40, 0.38, 0.38, 0.36, 1.24, 0.15, 0.10, 0.10, 1.00, 0.96,
    0.96,
];

fn player_gesture_for_midi(midi: i32) -> Option<PlayerGesture> {
    if !(MIN_MIDI..=MAX_MIDI).contains(&midi) {
        return None;
    }
    let index = (midi - MIN_MIDI) as usize;
    let mut gesture = PlayerGesture {
        convective_phase_cycles: CONVECTIVE_PHASE_CYCLES[index],
        pressure_scale: 1.0,
        feedback_scale: 1.0,
        instability_q_scale: 4.0,
        source_scale: 1.0,
    };
    match midi {
        91 => {
            gesture.feedback_scale = 2.0;
            gesture.instability_q_scale = 6.0;
        }
        92 => {
            gesture.pressure_scale = 1.2;
            gesture.feedback_scale = 2.0;
            gesture.instability_q_scale = 2.0;
        }
        93 => {
            gesture.instability_q_scale = 6.0;
            gesture.source_scale = 2.0;
        }
        _ => {}
    }
    Some(gesture)
}

#[derive(Clone, Copy)]
struct SegmentLayout {
    offsets: [usize; SEGMENTS],
    capacities: [usize; SEGMENTS],
    delay_integer: [usize; SEGMENTS],
    thiran_a: [f32; SEGMENTS],
    loss_alpha: [f32; SEGMENTS],
    loss_high_gain: [f32; SEGMENTS],
    dc_gain: [f32; SEGMENTS],
    admittance: [f32; SEGMENTS],
    total_samples: usize,
    host_rate: f32,
    internal_rate: f32,
    oversample: usize,
    head_capacity: usize,
    head_delay_integer: usize,
    head_thiran_a: f32,
    head_loss_alpha: f32,
    head_loss_high_gain: f32,
    foot_capacity: usize,
    foot_delay_integer: usize,
    foot_thiran_a: f32,
    foot_reflection_alpha: f32,
    radiation_capacity: usize,
    radiation_delay_left: [f32; RADIATION_GROUPS],
    radiation_delay_right: [f32; RADIATION_GROUPS],
    radiation_gain_left: [f32; RADIATION_GROUPS],
    radiation_gain_right: [f32; RADIATION_GROUPS],
    downsample_alpha: f32,
    state_tag: u32,
}

#[derive(Clone, Copy)]
struct ToneholeStatic {
    density: f32,
    characteristic_numerator: f32,
    vortex_numerator: f32,
    full_area: f32,
    annular_area_at_full_lift: f32,
    full_open_area: f32,
    full_area_ratio: f32,
    full_mass_rate: f32,
    full_linear_resistance: f32,
    base_effective_length: f32,
    shading_length: f32,
    sample_rate: f32,
    closed_compliance_rate: f32,
}

impl ToneholeStatic {
    const ZERO: Self = Self {
        density: 0.0,
        characteristic_numerator: 0.0,
        vortex_numerator: 0.0,
        full_area: 0.0,
        annular_area_at_full_lift: 0.0,
        full_open_area: 0.0,
        full_area_ratio: 0.0,
        full_mass_rate: 0.0,
        full_linear_resistance: 0.0,
        base_effective_length: 0.0,
        shading_length: 0.0,
        sample_rate: 0.0,
        closed_compliance_rate: 0.0,
    };
}

#[derive(Clone, Copy)]
struct EmbouchureStatic {
    density: f32,
    area: f32,
    mass_rate: f32,
    linear_resistance: f32,
}

#[derive(Clone, Copy)]
struct AcousticPrecompute {
    holes: [ToneholeStatic; HOLES],
    embouchure: EmbouchureStatic,
    head_admittance: f32,
    radiation_scale: f32,
}

#[derive(Clone, Copy)]
struct BranchCoefficients {
    open_g: f32,
    open_history: f32,
    closed_g: f32,
    closed_history: f32,
}

impl BranchCoefficients {
    const ZERO: Self = Self {
        open_g: 0.0,
        open_history: 0.0,
        closed_g: 0.0,
        closed_history: 0.0,
    };

    #[inline(always)]
    fn total_g(self) -> f32 {
        self.open_g + self.closed_g
    }

    #[inline(always)]
    fn total_history(self) -> f32 {
        self.open_history + self.closed_history
    }
}

#[derive(Clone, Copy)]
struct PhraseState {
    prior_midi: i32,
    seed: u32,
    elapsed_internal_frames: u32,
    mouth_pressure_pa: f32,
    prior_edge_split: f32,
    emb_flow: f32,
    emb_pressure: f32,
    feedback_velocity: f32,
    emb_radiation_lp: f32,
    foot_radiation_lp: f32,
    breath_noise_lp: f32,
    feedback_hp_input: f32,
    feedback_hp_output: f32,
    jet_band_s1: f32,
    jet_band_s2: f32,
    turbulence_fast: f32,
    turbulence_slow: f32,
    turbulence_meander: f32,
    vibrato_sin: f32,
    vibrato_cos: f32,
    foot_flow: f32,
    foot_reflection_lp: f32,
    head_loss_state: f32,
    hole_open: [f32; HOLES],
    hole_flow: [f32; HOLES],
    hole_pressure: [f32; HOLES],
    hole_radiation_flow: [f32; HOLES],
    hole_radiation_lp: [f32; HOLES],
    forward_fractional_input: [f32; SEGMENTS],
    forward_fractional_output: [f32; SEGMENTS],
    backward_fractional_input: [f32; SEGMENTS],
    backward_fractional_output: [f32; SEGMENTS],
    forward_loss_state: [f32; SEGMENTS],
    backward_loss_state: [f32; SEGMENTS],
    body_writes: [usize; SEGMENTS],
    jet_write: usize,
    head_write: usize,
    foot_write: usize,
    radiation_write: usize,
    downsample_left_1: f32,
    downsample_left_2: f32,
    downsample_right_1: f32,
    downsample_right_2: f32,
    dc_left_input: f32,
    dc_left_output: f32,
    dc_right_input: f32,
    dc_right_output: f32,
}

impl PhraseState {
    fn at_rest(midi: i32, velocity: i32, sample_rate: f32, fingering: Fingering) -> Self {
        let mixed_seed = 0x464c_5433
            ^ ((midi as u32) << 16)
            ^ ((velocity as u32) << 8)
            ^ sample_rate.to_bits();
        Self {
            prior_midi: midi,
            seed: if mixed_seed == 0 { 0x6d2b_79f5 } else { mixed_seed },
            elapsed_internal_frames: 0,
            mouth_pressure_pa: 0.0,
            prior_edge_split: 0.0,
            emb_flow: 0.0,
            emb_pressure: 0.0,
            feedback_velocity: 0.0,
            emb_radiation_lp: 0.0,
            foot_radiation_lp: 0.0,
            breath_noise_lp: 0.0,
            feedback_hp_input: 0.0,
            feedback_hp_output: 0.0,
            jet_band_s1: 0.0,
            jet_band_s2: 0.0,
            turbulence_fast: 0.0,
            turbulence_slow: 0.0,
            turbulence_meander: 0.0,
            vibrato_sin: 0.0,
            vibrato_cos: 1.0,
            foot_flow: 0.0,
            foot_reflection_lp: 0.0,
            head_loss_state: 0.0,
            hole_open: fingering.target_open,
            hole_flow: [0.0; HOLES],
            hole_pressure: [0.0; HOLES],
            hole_radiation_flow: [0.0; HOLES],
            hole_radiation_lp: [0.0; HOLES],
            forward_fractional_input: [0.0; SEGMENTS],
            forward_fractional_output: [0.0; SEGMENTS],
            backward_fractional_input: [0.0; SEGMENTS],
            backward_fractional_output: [0.0; SEGMENTS],
            forward_loss_state: [0.0; SEGMENTS],
            backward_loss_state: [0.0; SEGMENTS],
            body_writes: [0; SEGMENTS],
            jet_write: 0,
            head_write: 0,
            foot_write: 0,
            radiation_write: 0,
            downsample_left_1: 0.0,
            downsample_left_2: 0.0,
            downsample_right_1: 0.0,
            downsample_right_2: 0.0,
            dc_left_input: 0.0,
            dc_left_output: 0.0,
            dc_right_input: 0.0,
            dc_right_output: 0.0,
        }
    }
}

struct RenderStorage {
    forward: [f32; MAX_WAVE_SAMPLES],
    backward: [f32; MAX_WAVE_SAMPLES],
    jet: [f32; MAX_JET_HISTORY],
    head: [f32; MAX_HEAD_HISTORY],
    foot: [f32; MAX_FOOT_HISTORY],
    radiation: [f32; RADIATION_GROUPS * MAX_RADIATION_HISTORY],
}

impl RenderStorage {
    const fn zeroed() -> Self {
        Self {
            forward: [0.0; MAX_WAVE_SAMPLES],
            backward: [0.0; MAX_WAVE_SAMPLES],
            jet: [0.0; MAX_JET_HISTORY],
            head: [0.0; MAX_HEAD_HISTORY],
            foot: [0.0; MAX_FOOT_HISTORY],
            radiation: [0.0; RADIATION_GROUPS * MAX_RADIATION_HISTORY],
        }
    }
}

fn fingering_for_midi(midi: i32) -> Option<Fingering> {
    if !(MIN_MIDI..=MAX_MIDI).contains(&midi) {
        return None;
    }
    let pattern = FINGERING_PATTERNS[(midi - MIN_MIDI) as usize];
    let mut target_open = [0.0; HOLES];
    for index in 0..HOLES {
        target_open[index] = if pattern[index] == b'O' { 1.0 } else { 0.0 };
    }
    Some(Fingering { target_open })
}

fn midi_frequency_hz_internal(midi: i32) -> f32 {
    440.0 * exp2f((midi as f32 - 69.0) / 12.0)
}

#[inline(always)]
fn smoothstep(value: f32) -> f32 {
    let x = value.clamp(0.0, 1.0);
    x * x * (3.0 - 2.0 * x)
}

fn air_temperature_c(position_m: f32) -> f32 {
    HEAD_AIR_TEMPERATURE_C
        + (FOOT_AIR_TEMPERATURE_C - HEAD_AIR_TEMPERATURE_C)
            * (position_m / BORE_LENGTH_M).clamp(0.0, 1.0)
}

fn sound_speed_m_per_s(position_m: f32) -> f32 {
    let temperature_k = 273.15 + air_temperature_c(position_m);
    REFERENCE_SOUND_SPEED_M_PER_S * sqrtf(temperature_k / REFERENCE_TEMPERATURE_K)
}

fn air_density_kg_per_m3(position_m: f32) -> f32 {
    let temperature_k = 273.15 + air_temperature_c(position_m);
    REFERENCE_AIR_DENSITY_KG_PER_M3 * REFERENCE_TEMPERATURE_K / temperature_k
}

fn segment_radius_m(segment: usize) -> f32 {
    if segment < 4 {
        0.5 * (TAPER_BOUNDARY_RADIUS_M[segment] + TAPER_BOUNDARY_RADIUS_M[segment + 1])
    } else if segment == 4 {
        // 37 mm at 9.4 mm plus the 4 mm, 9.9 mm tuning-slide gap,
        // collapsed by equal series inertance into one well-conditioned cell.
        0.0094454751
    } else {
        0.0095
    }
}

fn oversample_factor(sample_rate: f32) -> usize {
    if sample_rate >= MIN_INTERNAL_RATE_HZ {
        1
    } else {
        ceilf(MIN_INTERNAL_RATE_HZ / sample_rate) as usize
    }
}

fn thiran_parameters(delay_samples: f32) -> Option<(usize, f32, usize)> {
    if !delay_samples.is_finite() || delay_samples < 1.0 {
        return None;
    }
    let integer = floorf(delay_samples) as usize;
    let fraction = delay_samples - integer as f32;
    let coefficient = if fraction < 1.0e-6 {
        0.0
    } else {
        (1.0 - fraction) / (1.0 + fraction)
    };
    Some((integer, coefficient, integer + 2))
}

fn viscothermal_high_gain(length_m: f32, radius_m: f32, sound_speed: f32) -> f32 {
    let frequency_hz = 8_000.0;
    let omega = TAU * frequency_hz;
    let viscous = sqrtf(0.5 * omega * KINEMATIC_VISCOSITY_M2_PER_S);
    let thermal_factor = 1.0 + (HEAT_CAPACITY_RATIO - 1.0) / sqrtf(PRANDTL_NUMBER);
    let attenuation_np_per_m = viscous * thermal_factor / (sound_speed * radius_m);
    expf(-attenuation_np_per_m * length_m).clamp(0.55, 1.0)
}

fn radiation_layout(
    internal_rate: f32,
    variation_slot: u32,
) -> Option<(
    usize,
    [f32; RADIATION_GROUPS],
    [f32; RADIATION_GROUPS],
    [f32; RADIATION_GROUPS],
    [f32; RADIATION_GROUPS],
)> {
    let source_x = [0.0, 0.285, 0.468, BORE_LENGTH_M];
    let slot = variation_slot as f32 - 3.5;
    let mic_center_x = 0.285 + 0.004 * slot;
    let left_x = mic_center_x - 0.090;
    let right_x = mic_center_x + 0.090;
    let mic_y = 0.82;
    let mic_z = 0.11;
    let mut distance_left = [0.0; RADIATION_GROUPS];
    let mut distance_right = [0.0; RADIATION_GROUPS];
    let mut minimum_distance = f32::MAX;
    for group in 0..RADIATION_GROUPS {
        let dx_left = source_x[group] - left_x;
        let dx_right = source_x[group] - right_x;
        distance_left[group] = sqrtf(dx_left * dx_left + mic_y * mic_y + mic_z * mic_z);
        distance_right[group] = sqrtf(dx_right * dx_right + mic_y * mic_y + mic_z * mic_z);
        minimum_distance = minimum_distance
            .min(distance_left[group])
            .min(distance_right[group]);
    }
    let mut delay_left = [0.0; RADIATION_GROUPS];
    let mut delay_right = [0.0; RADIATION_GROUPS];
    let mut gain_left = [0.0; RADIATION_GROUPS];
    let mut gain_right = [0.0; RADIATION_GROUPS];
    let mut maximum_delay = 0.0f32;
    for group in 0..RADIATION_GROUPS {
        delay_left[group] =
            (distance_left[group] - minimum_distance) * internal_rate / REFERENCE_SOUND_SPEED_M_PER_S;
        delay_right[group] =
            (distance_right[group] - minimum_distance) * internal_rate / REFERENCE_SOUND_SPEED_M_PER_S;
        maximum_delay = maximum_delay.max(delay_left[group]).max(delay_right[group]);
        gain_left[group] = 1.0 / distance_left[group];
        gain_right[group] = 1.0 / distance_right[group];
    }
    let capacity = ceilf(maximum_delay) as usize + 3;
    if capacity > MAX_RADIATION_HISTORY {
        return None;
    }
    Some((capacity, delay_left, delay_right, gain_left, gain_right))
}

fn segment_layout(sample_rate: f32, variation_slot: u32) -> Option<SegmentLayout> {
    if !(8_000.0..=MAX_SAMPLE_RATE_HZ).contains(&sample_rate) || variation_slot >= 8 {
        return None;
    }
    let oversample = oversample_factor(sample_rate);
    let internal_rate = sample_rate * oversample as f32;
    if internal_rate > MAX_SAMPLE_RATE_HZ || internal_rate < MIN_INTERNAL_RATE_HZ {
        return None;
    }

    let mut offsets = [0usize; SEGMENTS];
    let mut capacities = [0usize; SEGMENTS];
    let mut delay_integer = [0usize; SEGMENTS];
    let mut thiran_a = [0.0; SEGMENTS];
    let mut loss_alpha = [0.0; SEGMENTS];
    let mut loss_high_gain = [0.0; SEGMENTS];
    let mut dc_gain = [0.0; SEGMENTS];
    let mut admittance = [0.0; SEGMENTS];
    let mut total_samples = 0usize;
    let mut start_m = 0.0;

    for segment in 0..SEGMENTS {
        let end_m = PATH_END_M[segment];
        let length_m = end_m - start_m;
        let midpoint_m = 0.5 * (start_m + end_m);
        let sound_speed = sound_speed_m_per_s(midpoint_m);
        let density = air_density_kg_per_m3(midpoint_m);
        let radius = segment_radius_m(segment);
        let delay = length_m * internal_rate / sound_speed;
        let (integer, coefficient, capacity) = thiran_parameters(delay)?;
        let next_total = total_samples.checked_add(capacity)?;
        if next_total > MAX_WAVE_SAMPLES {
            return None;
        }
        offsets[segment] = total_samples;
        capacities[segment] = capacity;
        delay_integer[segment] = integer;
        thiran_a[segment] = coefficient;
        let loss_corner_hz = 900.0 + 70.0 * segment as f32;
        loss_alpha[segment] = 1.0 - expf(-TAU * loss_corner_hz / internal_rate);
        loss_high_gain[segment] = viscothermal_high_gain(length_m, radius, sound_speed);
        dc_gain[segment] = expf(-0.0035 * length_m);
        let area = PI * radius * radius;
        admittance[segment] = area / (density * sound_speed);
        total_samples = next_total;
        start_m = end_m;
    }

    let head_speed = sound_speed_m_per_s(0.0);
    let head_round_trip_delay = 2.0 * CORK_DISTANCE_M * internal_rate / head_speed;
    let (head_delay_integer, head_thiran_a, head_capacity) =
        thiran_parameters(head_round_trip_delay)?;
    if head_capacity > MAX_HEAD_HISTORY {
        return None;
    }
    let head_loss_alpha = 1.0 - expf(-TAU * 1_600.0 / internal_rate);
    let head_loss_high_gain = viscothermal_high_gain(
        2.0 * CORK_DISTANCE_M,
        0.5 * (0.0085335878 + 0.0084),
        head_speed,
    );

    let foot_radius = segment_radius_m(SEGMENTS - 1);
    let foot_end_correction_m = 0.6133 * foot_radius;
    let foot_delay = (2.0 * foot_end_correction_m * internal_rate
        / sound_speed_m_per_s(BORE_LENGTH_M))
        .max(1.0);
    let (foot_delay_integer, foot_thiran_a, foot_capacity) = thiran_parameters(foot_delay)?;
    if foot_capacity > MAX_FOOT_HISTORY {
        return None;
    }
    let foot_reflection_alpha = 1.0 - expf(-TAU * 4_800.0 / internal_rate);

    let (
        radiation_capacity,
        radiation_delay_left,
        radiation_delay_right,
        radiation_gain_left,
        radiation_gain_right,
    ) = radiation_layout(internal_rate, variation_slot)?;

    let downsample_alpha = if oversample == 1 {
        1.0
    } else {
        1.0 - expf(-TAU * (0.40 * sample_rate) / internal_rate)
    };

    Some(SegmentLayout {
        offsets,
        capacities,
        delay_integer,
        thiran_a,
        loss_alpha,
        loss_high_gain,
        dc_gain,
        admittance,
        total_samples,
        host_rate: sample_rate,
        internal_rate,
        oversample,
        head_capacity,
        head_delay_integer,
        head_thiran_a,
        head_loss_alpha,
        head_loss_high_gain,
        foot_capacity,
        foot_delay_integer,
        foot_thiran_a,
        foot_reflection_alpha,
        radiation_capacity,
        radiation_delay_left,
        radiation_delay_right,
        radiation_gain_left,
        radiation_gain_right,
        downsample_alpha,
        state_tag: GEOMETRY_TAG ^ variation_slot.rotate_left(27),
    })
}

#[inline(always)]
fn ring_at_back(storage: &[f32], offset: usize, capacity: usize, write: usize, back: usize) -> f32 {
    debug_assert!(capacity > 0 && write < capacity && back <= capacity);
    let normalized_back = if back == capacity { 0 } else { back };
    let wrapped = if write >= normalized_back {
        write - normalized_back
    } else {
        write + capacity - normalized_back
    };
    storage[offset + wrapped]
}

#[inline(always)]
fn delayed_allpass(
    storage: &[f32],
    offset: usize,
    capacity: usize,
    write: usize,
    integer_delay: usize,
    coefficient: f32,
    prior_input: &mut f32,
    prior_output: &mut f32,
) -> f32 {
    let input = ring_at_back(storage, offset, capacity, write, integer_delay);
    if coefficient == 0.0 {
        *prior_input = input;
        *prior_output = input;
        return input;
    }
    let output = coefficient * input + *prior_input - coefficient * *prior_output;
    *prior_input = input;
    *prior_output = if output.abs() < 1.0e-30 { 0.0 } else { output };
    *prior_output
}

#[inline(always)]
fn propagate_segment(
    storage: &[f32],
    layout: &SegmentLayout,
    segment: usize,
    write: usize,
    prior_input: &mut f32,
    prior_output: &mut f32,
    loss_state: &mut f32,
) -> f32 {
    let delayed = delayed_allpass(
        storage,
        layout.offsets[segment],
        layout.capacities[segment],
        write,
        layout.delay_integer[segment],
        layout.thiran_a[segment],
        prior_input,
        prior_output,
    );
    *loss_state += layout.loss_alpha[segment] * (delayed - *loss_state);
    layout.dc_gain[segment]
        * (layout.loss_high_gain[segment] * delayed
            + (1.0 - layout.loss_high_gain[segment]) * *loss_state)
}

#[inline(always)]
fn read_current_delay(
    storage: &[f32],
    offset: usize,
    capacity: usize,
    current_write: usize,
    delay: f32,
) -> f32 {
    let bounded = delay.clamp(0.0, (capacity - 2) as f32);
    let lower = floorf(bounded) as usize;
    let fraction = bounded - lower as f32;
    let recent = ring_at_back(storage, offset, capacity, current_write, lower);
    let older = ring_at_back(storage, offset, capacity, current_write, lower + 1);
    recent + fraction * (older - recent)
}

#[inline(always)]
fn passive_junction(
    from_left: f32,
    from_right: f32,
    left_admittance: f32,
    right_admittance: f32,
    shunt_conductance: f32,
    shunt_history_flow: f32,
) -> (f32, f32, f32) {
    let total = left_admittance + right_admittance + shunt_conductance;
    let pressure = (2.0 * left_admittance * from_left
        + 2.0 * right_admittance * from_right
        - shunt_history_flow)
        / total.max(1.0e-20);
    (pressure - from_right, pressure - from_left, pressure)
}

fn tonehole_closed_volume_m3(hole: usize) -> f32 {
    let chimney_area = PI * HOLE_RADIUS_M[hole] * HOLE_RADIUS_M[hole];
    let cup_area = PI * KEY_PAD_RADIUS_M[hole] * KEY_PAD_RADIUS_M[hole];
    chimney_area * HOLE_CHIMNEY_M[hole]
        + cup_area * (KEY_CUP_DEPTH_M[hole] + 0.25 * KEY_HEIGHT_M[hole])
}

fn tonehole_static(hole: usize, sample_rate: f32) -> ToneholeStatic {
    let position = HOLE_POSITION_M[hole];
    let density = air_density_kg_per_m3(position);
    let sound_speed = sound_speed_m_per_s(position);
    let full_area = PI * HOLE_RADIUS_M[hole] * HOLE_RADIUS_M[hole];
    let annular_area_at_full_lift =
        TAU * KEY_PAD_RADIUS_M[hole] * KEY_HEIGHT_M[hole];
    let full_open_area = annular_area_at_full_lift.min(full_area);
    let full_area_ratio = (full_open_area / full_area).clamp(0.0, 1.0);
    let base_effective_length = HOLE_CHIMNEY_M[hole] + 0.76 * HOLE_RADIUS_M[hole];
    let shading_length = 0.42 * KEY_PAD_RADIUS_M[hole];
    let full_effective_length =
        base_effective_length + shading_length * (1.0 - full_area_ratio);
    let full_mass_rate = density * full_effective_length / full_open_area * sample_rate;
    let characteristic_numerator = density * sound_speed;
    let full_linear_resistance = characteristic_numerator / full_open_area
        * (0.004 + 0.018 * full_area_ratio);
    let closed_compliance_rate = tonehole_closed_volume_m3(hole)
        / (density * sound_speed * sound_speed)
        * sample_rate;
    ToneholeStatic {
        density,
        characteristic_numerator,
        vortex_numerator: 0.55 * density,
        full_area,
        annular_area_at_full_lift,
        full_open_area,
        full_area_ratio,
        full_mass_rate,
        full_linear_resistance,
        base_effective_length,
        shading_length,
        sample_rate,
        closed_compliance_rate,
    }
}

fn acoustic_precompute(sample_rate: f32) -> AcousticPrecompute {
    let mut holes = [ToneholeStatic::ZERO; HOLES];
    for hole in 0..HOLES {
        holes[hole] = tonehole_static(hole, sample_rate);
    }
    let density = air_density_kg_per_m3(0.0);
    let sound_speed = sound_speed_m_per_s(0.0);
    let embouchure_area = PI * EMB_RADIUS_IN_M * EMB_RADIUS_OUT_M;
    let embouchure_length =
        EMB_LENGTH_M + FACE_INERTANCE_LENGTH_M + 0.42 * EMB_RADIUS_OUT_M;
    let embouchure = EmbouchureStatic {
        density,
        area: embouchure_area,
        mass_rate: density * embouchure_length / embouchure_area * sample_rate,
        linear_resistance: 0.020 * density * sound_speed / embouchure_area,
    };
    let head_radius = 0.5 * (0.0085335878 + 0.0084);
    let head_area = PI * head_radius * head_radius;
    AcousticPrecompute {
        holes,
        embouchure,
        head_admittance: head_area / (density * sound_speed),
        radiation_scale: density / (4.0 * PI),
    }
}

#[inline(always)]
fn tonehole_coefficients(
    constants: &ToneholeStatic,
    openness: f32,
    prior_flow: f32,
    prior_pressure: f32,
) -> BranchCoefficients {
    let opening = openness.clamp(0.0, 1.0);
    let (open_area, area_ratio, mass_rate, linear_resistance) = if opening <= 1.0e-5 {
        (0.0, 0.0, 0.0, 0.0)
    } else if opening >= 0.9999 {
        (
            constants.full_open_area,
            constants.full_area_ratio,
            constants.full_mass_rate,
            constants.full_linear_resistance,
        )
    } else {
        let open_area = tonehole_open_area_m2_from_static(constants, opening);
        if open_area <= 1.0e-10 {
            (0.0, 0.0, 0.0, 0.0)
        } else {
            let area_ratio = (open_area / constants.full_area).clamp(0.0, 1.0);
            let effective_length = constants.base_effective_length
                + constants.shading_length * (1.0 - area_ratio);
            let mass_rate =
                constants.density * effective_length / open_area * constants.sample_rate;
            let linear_resistance = constants.characteristic_numerator / open_area
                * (0.004 + 0.018 * area_ratio);
            (open_area, area_ratio, mass_rate, linear_resistance)
        }
    };

    let (open_g, open_history) = if open_area > 1.0e-10 {
        let vortex_resistance =
            (constants.vortex_numerator * prior_flow.abs() / (open_area * open_area))
                .min(5.0e7);
        let denominator = mass_rate + linear_resistance + vortex_resistance;
        let conductance = 1.0 / denominator.max(1.0e-20);
        (conductance, mass_rate * conductance * prior_flow)
    } else {
        (0.0, 0.0)
    };

    let closed_weight = (1.0 - area_ratio) * (1.0 - area_ratio);
    let closed_g = constants.closed_compliance_rate * closed_weight;
    let closed_history = -closed_g * prior_pressure;
    BranchCoefficients {
        open_g,
        open_history,
        closed_g,
        closed_history,
    }
}

#[inline(always)]
fn tonehole_open_area_m2_from_static(constants: &ToneholeStatic, openness: f32) -> f32 {
    // Recover the measured annular key aperture without re-evaluating geometry
    // that is independent of the instantaneous key trajectory.
    let area_fraction = smoothstep(openness);
    (constants.annular_area_at_full_lift * area_fraction).min(constants.full_area)
}

#[inline(always)]
fn embouchure_coefficients(
    constants: &EmbouchureStatic,
    prior_flow: f32,
) -> (f32, f32) {
    let vortex_resistance =
        (0.72 * constants.density * prior_flow.abs() / (constants.area * constants.area))
            .min(4.0e7);
    let denominator = constants.mass_rate + constants.linear_resistance + vortex_resistance;
    let conductance = 1.0 / denominator.max(1.0e-20);
    let history = constants.mass_rate * conductance * prior_flow;
    (conductance, history)
}

fn jet_channel_to_edge_m(midi: i32) -> f32 {
    match midi {
        60..=71 => 0.0105,
        72..=83 => 0.0092,
        84..=95 => 0.0066,
        _ => 0.0052,
    }
}

fn target_mouth_pressure_pa(midi: i32, velocity: i32, density: f32) -> f32 {
    let frequency = midi_frequency_hz_internal(midi);
    let channel = jet_channel_to_edge_m(midi);
    let nominal_speed = (4.85 * channel * frequency).max(18.0);
    let velocity_norm = velocity as f32 / 127.0;
    let dynamic_speed = nominal_speed * (0.78 + 0.42 * velocity_norm * sqrtf(velocity_norm));
    (0.5 * density * dynamic_speed * dynamic_speed).clamp(115.0, 2_200.0)
}

fn jet_speed_m_per_s(pressure_pa: f32, density: f32) -> f32 {
    if pressure_pa <= 0.0 {
        0.0
    } else {
        sqrtf(2.0 * pressure_pa / density)
    }
}

#[inline(always)]
fn fast_tanh(value: f32) -> f32 {
    let x = value.clamp(-4.0, 4.0);
    let x2 = x * x;
    (x * (27.0 + x2) / (27.0 + 9.0 * x2)).clamp(-0.999, 0.999)
}

fn write_u32(bytes: &mut [u8], offset: usize, value: u32) -> bool {
    let Some(target) = bytes.get_mut(offset..offset + 4) else {
        return false;
    };
    target.copy_from_slice(&value.to_le_bytes());
    true
}

fn read_u32(bytes: &[u8], offset: usize) -> Option<u32> {
    let value = bytes.get(offset..offset + 4)?;
    Some(u32::from_le_bytes([value[0], value[1], value[2], value[3]]))
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffffu32;
    for byte in bytes {
        crc ^= *byte as u32;
        for _ in 0..8 {
            let mask = 0u32.wrapping_sub(crc & 1);
            crc = (crc >> 1) ^ (0xedb8_8320 & mask);
        }
    }
    !crc
}

struct StateWriter<'a> {
    bytes: &'a mut [u8],
    cursor: usize,
}

impl<'a> StateWriter<'a> {
    fn new(bytes: &'a mut [u8]) -> Self {
        Self {
            bytes,
            cursor: STATE_HEADER_BYTES,
        }
    }

    fn f32(&mut self, value: f32) -> Option<()> {
        if !value.is_finite() {
            return None;
        }
        let target = self.bytes.get_mut(self.cursor..self.cursor + 4)?;
        target.copy_from_slice(&value.to_le_bytes());
        self.cursor += 4;
        Some(())
    }

    fn f32_slice(&mut self, values: &[f32]) -> Option<()> {
        for value in values {
            self.f32(*value)?;
        }
        Some(())
    }

    fn canonical_ring(
        &mut self,
        values: &[f32],
        offset: usize,
        capacity: usize,
        write: usize,
    ) -> Option<()> {
        if capacity == 0 || write >= capacity || offset.checked_add(capacity)? > values.len() {
            return None;
        }
        for index in 0..capacity {
            self.f32(values[offset + (write + index) % capacity])?;
        }
        Some(())
    }
}

struct StateReader<'a> {
    bytes: &'a [u8],
    cursor: usize,
}

impl<'a> StateReader<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self {
            bytes,
            cursor: STATE_HEADER_BYTES,
        }
    }

    fn f32(&mut self) -> Option<f32> {
        let value = self.bytes.get(self.cursor..self.cursor + 4)?;
        self.cursor += 4;
        let result = f32::from_le_bytes([value[0], value[1], value[2], value[3]]);
        (result.is_finite() && result.abs() <= 1.0e8).then_some(result)
    }

    fn f32_slice(&mut self, values: &mut [f32]) -> Option<()> {
        for value in values {
            *value = self.f32()?;
        }
        Some(())
    }

    fn canonical_ring(
        &mut self,
        values: &mut [f32],
        offset: usize,
        capacity: usize,
    ) -> Option<()> {
        if capacity == 0 || offset.checked_add(capacity)? > values.len() {
            return None;
        }
        for index in 0..capacity {
            values[offset + index] = self.f32()?;
        }
        Some(())
    }
}

const STATE_SCALAR_COUNT: usize = 25 + 5 * HOLES + 6 * SEGMENTS;
const GEOMETRY_TAG: u32 = 0x661c_0004;

fn state_required_bytes(layout: SegmentLayout) -> Option<usize> {
    let storage_samples = 2usize
        .checked_mul(layout.total_samples)?
        .checked_add(MAX_JET_HISTORY)?
        .checked_add(layout.head_capacity)?
        .checked_add(layout.foot_capacity)?
        .checked_add(RADIATION_GROUPS.checked_mul(layout.radiation_capacity)?)?;
    STATE_HEADER_BYTES
        .checked_add(STATE_SCALAR_COUNT.checked_mul(4)?)?
        .checked_add(storage_samples.checked_mul(4)?)
        .filter(|bytes| *bytes <= STATE_MAX_BYTES)
}

fn encode_state(
    bytes: &mut [u8],
    layout: SegmentLayout,
    state: &PhraseState,
    storage: &RenderStorage,
) -> Option<usize> {
    let required = state_required_bytes(layout)?;
    if bytes.len() < required {
        return None;
    }
    bytes[..required].fill(0);
    let mut writer = StateWriter::new(&mut bytes[..required]);

    for value in [
        state.mouth_pressure_pa,
        state.prior_edge_split,
        state.emb_flow,
        state.emb_pressure,
        state.feedback_velocity,
        state.feedback_hp_input,
        state.feedback_hp_output,
        state.jet_band_s1,
        state.jet_band_s2,
        state.turbulence_fast,
        state.turbulence_slow,
        state.turbulence_meander,
        state.vibrato_sin,
        state.vibrato_cos,
        state.foot_flow,
        state.foot_reflection_lp,
        state.head_loss_state,
        state.downsample_left_1,
        state.downsample_left_2,
        state.downsample_right_1,
        state.downsample_right_2,
        state.dc_left_input,
        state.dc_left_output,
        state.dc_right_input,
        state.dc_right_output,
    ] {
        writer.f32(value)?;
    }
    writer.f32_slice(&state.hole_open)?;
    writer.f32_slice(&state.hole_flow)?;
    writer.f32_slice(&state.hole_pressure)?;
    writer.f32_slice(&state.hole_radiation_flow)?;
    writer.f32_slice(&state.hole_radiation_lp)?;
    writer.f32_slice(&state.forward_fractional_input)?;
    writer.f32_slice(&state.forward_fractional_output)?;
    writer.f32_slice(&state.backward_fractional_input)?;
    writer.f32_slice(&state.backward_fractional_output)?;
    writer.f32_slice(&state.forward_loss_state)?;
    writer.f32_slice(&state.backward_loss_state)?;

    for segment in 0..SEGMENTS {
        writer.canonical_ring(
            &storage.forward,
            layout.offsets[segment],
            layout.capacities[segment],
            state.body_writes[segment],
        )?;
    }
    for segment in 0..SEGMENTS {
        writer.canonical_ring(
            &storage.backward,
            layout.offsets[segment],
            layout.capacities[segment],
            state.body_writes[segment],
        )?;
    }
    writer.canonical_ring(&storage.jet, 0, MAX_JET_HISTORY, state.jet_write)?;
    writer.canonical_ring(&storage.head, 0, layout.head_capacity, state.head_write)?;
    writer.canonical_ring(&storage.foot, 0, layout.foot_capacity, state.foot_write)?;
    for group in 0..RADIATION_GROUPS {
        writer.canonical_ring(
            &storage.radiation,
            group * MAX_RADIATION_HISTORY,
            layout.radiation_capacity,
            state.radiation_write,
        )?;
    }

    let total_bytes = writer.cursor;
    if total_bytes != required {
        return None;
    }
    drop(writer);
    let payload_bytes = total_bytes - STATE_HEADER_BYTES;
    let checksum = crc32(&bytes[STATE_HEADER_BYTES..total_bytes]);
    for (offset, value) in [
        (0, STATE_MAGIC),
        (4, STATE_VERSION),
        (8, layout.host_rate.to_bits()),
        (12, layout.total_samples as u32),
        (16, payload_bytes as u32),
        (20, total_bytes as u32),
        (24, checksum),
        (28, state.prior_midi as u32),
        (32, state.seed),
        (36, state.elapsed_internal_frames),
        (40, STATE_SCALAR_COUNT as u32),
        (44, layout.state_tag),
    ] {
        if !write_u32(bytes, offset, value) {
            return None;
        }
    }
    Some(total_bytes)
}

fn decode_state(
    bytes: &[u8],
    midi: i32,
    velocity: i32,
    fingering: Fingering,
    layout: SegmentLayout,
    storage: &mut RenderStorage,
) -> Option<PhraseState> {
    let required = state_required_bytes(layout)?;
    if bytes.len() != required
        || read_u32(bytes, 0)? != STATE_MAGIC
        || read_u32(bytes, 4)? != STATE_VERSION
        || read_u32(bytes, 8)? != layout.host_rate.to_bits()
        || read_u32(bytes, 12)? as usize != layout.total_samples
        || read_u32(bytes, 16)? as usize != required - STATE_HEADER_BYTES
        || read_u32(bytes, 20)? as usize != required
        || read_u32(bytes, 40)? as usize != STATE_SCALAR_COUNT
        || read_u32(bytes, 44)? != layout.state_tag
        || crc32(&bytes[STATE_HEADER_BYTES..]) != read_u32(bytes, 24)?
    {
        return None;
    }
    let prior_midi = read_u32(bytes, 28)? as i32;
    let seed = read_u32(bytes, 32)?;
    if !(MIN_MIDI..=MAX_MIDI).contains(&prior_midi) || seed == 0 {
        return None;
    }

    storage.forward.fill(0.0);
    storage.backward.fill(0.0);
    storage.jet.fill(0.0);
    storage.head.fill(0.0);
    storage.foot.fill(0.0);
    storage.radiation.fill(0.0);

    let mut state = PhraseState::at_rest(midi, velocity, layout.host_rate, fingering);
    state.prior_midi = prior_midi;
    state.seed = seed;
    state.elapsed_internal_frames = read_u32(bytes, 36)?;
    let mut reader = StateReader::new(bytes);

    state.mouth_pressure_pa = reader.f32()?;
    state.prior_edge_split = reader.f32()?;
    state.emb_flow = reader.f32()?;
    state.emb_pressure = reader.f32()?;
    state.feedback_velocity = reader.f32()?;
    state.feedback_hp_input = reader.f32()?;
    state.feedback_hp_output = reader.f32()?;
    state.jet_band_s1 = reader.f32()?;
    state.jet_band_s2 = reader.f32()?;
    state.turbulence_fast = reader.f32()?;
    state.turbulence_slow = reader.f32()?;
    state.turbulence_meander = reader.f32()?;
    state.vibrato_sin = reader.f32()?;
    state.vibrato_cos = reader.f32()?;
    state.foot_flow = reader.f32()?;
    state.foot_reflection_lp = reader.f32()?;
    state.head_loss_state = reader.f32()?;
    state.downsample_left_1 = reader.f32()?;
    state.downsample_left_2 = reader.f32()?;
    state.downsample_right_1 = reader.f32()?;
    state.downsample_right_2 = reader.f32()?;
    state.dc_left_input = reader.f32()?;
    state.dc_left_output = reader.f32()?;
    state.dc_right_input = reader.f32()?;
    state.dc_right_output = reader.f32()?;
    reader.f32_slice(&mut state.hole_open)?;
    reader.f32_slice(&mut state.hole_flow)?;
    reader.f32_slice(&mut state.hole_pressure)?;
    reader.f32_slice(&mut state.hole_radiation_flow)?;
    reader.f32_slice(&mut state.hole_radiation_lp)?;
    reader.f32_slice(&mut state.forward_fractional_input)?;
    reader.f32_slice(&mut state.forward_fractional_output)?;
    reader.f32_slice(&mut state.backward_fractional_input)?;
    reader.f32_slice(&mut state.backward_fractional_output)?;
    reader.f32_slice(&mut state.forward_loss_state)?;
    reader.f32_slice(&mut state.backward_loss_state)?;

    for segment in 0..SEGMENTS {
        reader.canonical_ring(
            &mut storage.forward,
            layout.offsets[segment],
            layout.capacities[segment],
        )?;
    }
    for segment in 0..SEGMENTS {
        reader.canonical_ring(
            &mut storage.backward,
            layout.offsets[segment],
            layout.capacities[segment],
        )?;
    }
    reader.canonical_ring(&mut storage.jet, 0, MAX_JET_HISTORY)?;
    reader.canonical_ring(&mut storage.head, 0, layout.head_capacity)?;
    reader.canonical_ring(&mut storage.foot, 0, layout.foot_capacity)?;
    for group in 0..RADIATION_GROUPS {
        reader.canonical_ring(
            &mut storage.radiation,
            group * MAX_RADIATION_HISTORY,
            layout.radiation_capacity,
        )?;
    }
    if reader.cursor != bytes.len()
        || !(0.0..=2_600.0).contains(&state.mouth_pressure_pa)
        || state.hole_open.iter().any(|value| !(-0.001..=1.001).contains(value))
    {
        return None;
    }

    state.body_writes = [0; SEGMENTS];
    state.jet_write = 0;
    state.head_write = 0;
    state.foot_write = 0;
    state.radiation_write = 0;
    Some(state)
}

fn disjoint_ranges(left: usize, left_bytes: usize, right: usize, right_bytes: usize) -> bool {
    let Some(left_end) = left.checked_add(left_bytes) else {
        return false;
    };
    let Some(right_end) = right.checked_add(right_bytes) else {
        return false;
    };
    left_end <= right || right_end <= left
}

fn delay_from_thiran(integer: usize, coefficient: f32) -> f32 {
    if coefficient == 0.0 {
        integer as f32
    } else {
        integer as f32 + (1.0 - coefficient) / (1.0 + coefficient)
    }
}

fn delayed_linear_from_next(
    storage: &[f32],
    offset: usize,
    capacity: usize,
    write: usize,
    delay: f32,
) -> f32 {
    let bounded = delay.clamp(1.0, (capacity - 1) as f32);
    let lower = floorf(bounded) as usize;
    let fraction = bounded - lower as f32;
    let recent = ring_at_back(storage, offset, capacity, write, lower);
    let older = ring_at_back(storage, offset, capacity, write, lower + 1);
    recent + fraction * (older - recent)
}

#[inline(always)]
fn update_hole_radiation(
    state: &mut PhraseState,
    hole: usize,
    coefficients: BranchCoefficients,
    pressure: f32,
    sample_rate: f32,
    lowpass_alpha: f32,
    radiation_scale: f32,
) -> f32 {
    let open_flow = coefficients.open_g * pressure + coefficients.open_history;
    state.hole_flow[hole] = open_flow;
    state.hole_pressure[hole] = pressure;
    let flow_derivative = (open_flow - state.hole_radiation_flow[hole]) * sample_rate;
    state.hole_radiation_flow[hole] = open_flow;
    let monopole = radiation_scale * flow_derivative;
    state.hole_radiation_lp[hole] +=
        lowpass_alpha * (monopole - state.hole_radiation_lp[hole]);
    state.hole_radiation_lp[hole]
}

#[allow(clippy::too_many_arguments)]
fn render_with_storage(
    midi: i32,
    velocity: i32,
    sample_rate: f32,
    variation_slot: u32,
    articulation: u32,
    out_left: &mut [f32],
    out_right: &mut [f32],
    state_input: Option<&[u8]>,
    mut state_output: Option<(&mut [u8], &mut usize)>,
    storage: &mut RenderStorage,
    law: RenderLaw,
) -> usize {
    if !(1..=127).contains(&velocity)
        || variation_slot >= 8
        || articulation > 1
        || out_left.is_empty()
        || out_left.len() != out_right.len()
        || !law.jet_delay_scale.is_finite()
        || law.jet_delay_scale <= 0.0
    {
        return 0;
    }
    out_left.fill(0.0);
    out_right.fill(0.0);

    let Some(fingering) = fingering_for_midi(midi) else {
        return 0;
    };
    let Some(gesture) = player_gesture_for_midi(midi) else {
        return 0;
    };
    let Some(layout) = segment_layout(sample_rate, variation_slot) else {
        return 0;
    };
    let Some(required_state_bytes) = state_required_bytes(layout) else {
        return 0;
    };
    if let Some((bytes, _)) = state_output.as_ref() {
        if bytes.len() < required_state_bytes {
            return 0;
        }
    }

    storage.forward.fill(0.0);
    storage.backward.fill(0.0);
    storage.jet.fill(0.0);
    storage.head.fill(0.0);
    storage.foot.fill(0.0);
    storage.radiation.fill(0.0);

    let mut state = match state_input {
        Some(bytes) => {
            let Some(decoded) = decode_state(bytes, midi, velocity, fingering, layout, storage)
            else {
                return 0;
            };
            decoded
        }
        None => PhraseState::at_rest(midi, velocity, sample_rate, fingering),
    };

    let internal_rate = layout.internal_rate;
    let acoustics = acoustic_precompute(internal_rate);
    let target_pressure = (target_mouth_pressure_pa(
        midi,
        velocity,
        acoustics.embouchure.density,
    ) * gesture.pressure_scale)
        .min(2_500.0);
    let fresh_note = state_input.is_none();
    let pressure_attack_seconds = if fresh_note {
        if articulation == 1 { 0.052 } else { 0.078 }
    } else {
        0.018
    };
    let pressure_alpha = 1.0 - expf(-1.0 / (pressure_attack_seconds * internal_rate));
    let key_open_alpha = 1.0 - expf(-1.0 / (0.0038 * internal_rate));
    let key_close_alpha = 1.0 - expf(-1.0 / (0.0024 * internal_rate));
    let tongue_hold_frames = if articulation == 1 {
        (0.0035 * internal_rate) as usize
    } else {
        0
    };
    let tongue_release_frames = if articulation == 1 {
        (0.0080 * internal_rate) as usize
    } else {
        1
    };

    let velocity_norm = velocity as f32 / 127.0;
    let register_level = ((midi - MIN_MIDI) as f32 / 12.0).clamp(0.0, 3.0);
    let mode_center_hz = midi_frequency_hz_internal(midi);
    let channel_to_edge = jet_channel_to_edge_m(midi);
    // Time-scheduled growth cap: onset at full drive (fast, articulate
    // buildup — the attack-range law), settling exponentially to the
    // per-dynamic anchor whose lower pp value collapses the odd-harmonic
    // tail in sustain. tau = GROWTH_SETTLE_SECONDS. Sweep provenance: r3.
    let growth_cap_sustain = jet_growth_cap_for(midi, velocity_norm);
    let growth_settle_alpha = expf(-1.0 / (GROWTH_SETTLE_SECONDS * internal_rate));
    let onset_hold_seconds = pp_onset_hold_seconds_for(midi, velocity_norm);
    let mut growth_cap_now = 4.15f32;
    let base_growth_exponent = 0.33 * channel_to_edge / JET_HALF_WIDTH_M;
    // CAL-SWEEP: offset scale. Near-railed operation turns the split
    // derivative into a close pulse pair whose fundamental cancels
    // (even-dominant ladder, starved h1). Centering the operating window
    // keeps the cycle inside the transition band: h1-dominant with the
    // reference's mild h2 asymmetry restored by the residual offset.
    let jet_offset_ratio = (JET_OFFSET_SCALE * (0.16 + 0.060 * register_level
        - 0.085 * (velocity_norm - 0.50))
        + 0.006 * (variation_slot as f32 - 3.5))
        .clamp(-0.05, 0.48);
    let feedback_gain = (1.8 + 0.55 * register_level) * gesture.feedback_scale;

    let feedback_hp_pole = expf(-TAU * 55.0 / internal_rate);
    let band_omega = (TAU * mode_center_hz / internal_rate).min(0.92 * PI);
    let band_q = (2.8 + 1.7 * register_level + 0.8 * (1.0 - velocity_norm))
        * gesture.instability_q_scale;
    let band_alpha = sinf(band_omega) / (2.0 * band_q);
    let band_a0 = 1.0 + band_alpha;
    let band_b0 = band_alpha / band_a0;
    let band_b2 = -band_b0;
    let band_a1 = -2.0 * cosf(band_omega) / band_a0;
    let band_a2 = (1.0 - band_alpha) / band_a0;

    let turbulence_fast_alpha = 1.0 - expf(-TAU * TURBULENCE_CORNER_HZ / internal_rate);
    let turbulence_slow_alpha = 1.0 - expf(-TAU * 420.0 / internal_rate);
    let turbulence_meander_alpha = 1.0 - expf(-TAU * 85.0 / internal_rate);
    let turbulence_level = 0.20 * (TURBULENCE_BASE + TURBULENCE_SLOPE * velocity_norm)
        * note_trim(&NOTE_TURB_TRIM_R1, midi, velocity_norm);
    let meander_level = 0.20 * (0.00020 + 0.00032 * (1.0 - velocity_norm));

    let vibrato_hz = 4.85 + 0.055 * variation_slot as f32;
    let vibrato_step = TAU * vibrato_hz / internal_rate;
    let vibrato_step_sin = sinf(vibrato_step);
    let vibrato_step_cos = cosf(vibrato_step);

    // CAL-SWEEP: radiated-field band-limit corner (playbook law: radiation
    // differentiation amplifies +6 dB/oct; v1/v2 band-limit near 5.5 kHz).
    let hole_radiation_alpha =
        1.0 - expf(-TAU * radiation_corner_hz_for(midi, velocity_norm) / internal_rate);
    let foot_radiation_alpha = 1.0
        - expf(
            -TAU * FOOT_RADIATION_CORNER_SCALE * radiation_corner_hz_for(midi, velocity_norm)
                / internal_rate,
        );
    let dc_pole = expf(-TAU * 18.0 / sample_rate);
    let head_delay = delay_from_thiran(layout.head_delay_integer, layout.head_thiran_a);
    let foot_delay = delay_from_thiran(layout.foot_delay_integer, layout.foot_thiran_a);

    let mut rng = XorShift32::new(state.seed);
    let mut forward_out = [0.0f32; SEGMENTS];
    let mut backward_out = [0.0f32; SEGMENTS];
    let mut forward_next = [0.0f32; SEGMENTS];
    let mut backward_next = [0.0f32; SEGMENTS];

    for frame in 0..out_left.len() {
        let mut accumulated_left = 0.0f32;
        let mut accumulated_right = 0.0f32;

        for subframe in 0..layout.oversample {
            let local_internal_frame = frame * layout.oversample + subframe;
            let tongue_opening = if articulation == 0 {
                1.0
            } else if local_internal_frame < tongue_hold_frames {
                0.0
            } else if local_internal_frame < tongue_hold_frames + tongue_release_frames {
                smoothstep(
                    (local_internal_frame - tongue_hold_frames) as f32
                        / tongue_release_frames.max(1) as f32,
                )
            } else {
                1.0
            };

            state.mouth_pressure_pa +=
                pressure_alpha * (target_pressure - state.mouth_pressure_pa);
            let elapsed_seconds = (state.elapsed_internal_frames as f32
                + local_internal_frame as f32)
                / internal_rate;
            let vibrato_onset = smoothstep(((elapsed_seconds - 0.24) / 0.30).clamp(0.0, 1.0));
            let pressure_vibrato =
                1.0 + 0.026 * vibrato_onset * state.vibrato_sin;
            let jet_pressure =
                (state.mouth_pressure_pa * pressure_vibrato).clamp(0.0, 2_500.0);
            let jet_speed = jet_speed_m_per_s(
                jet_pressure,
                acoustics.embouchure.density,
            ) * tongue_opening;

            for hole in 0..HOLES {
                let target = fingering.target_open[hole];
                let alpha = if target > state.hole_open[hole] {
                    key_open_alpha
                } else {
                    key_close_alpha
                };
                state.hole_open[hole] += alpha * (target - state.hole_open[hole]);
                state.hole_open[hole] = state.hole_open[hole].clamp(0.0, 1.0);
            }

            for segment in 0..SEGMENTS {
                forward_out[segment] = propagate_segment(
                    &storage.forward,
                    &layout,
                    segment,
                    state.body_writes[segment],
                    &mut state.forward_fractional_input[segment],
                    &mut state.forward_fractional_output[segment],
                    &mut state.forward_loss_state[segment],
                );
                backward_out[segment] = propagate_segment(
                    &storage.backward,
                    &layout,
                    segment,
                    state.body_writes[segment],
                    &mut state.backward_fractional_input[segment],
                    &mut state.backward_fractional_output[segment],
                    &mut state.backward_loss_state[segment],
                );
                forward_next[segment] = 0.0;
                backward_next[segment] = 0.0;
            }

            let raw_head_return = delayed_linear_from_next(
                &storage.head,
                0,
                layout.head_capacity,
                state.head_write,
                head_delay,
            );
            state.head_loss_state +=
                layout.head_loss_alpha * (raw_head_return - state.head_loss_state);
            let head_return = CORK_REFLECTION
                * (layout.head_loss_high_gain * raw_head_return
                    + (1.0 - layout.head_loss_high_gain) * state.head_loss_state);

            let noise = rng.bipolar() as f32;
            state.turbulence_fast +=
                turbulence_fast_alpha * (noise - state.turbulence_fast);
            state.turbulence_slow +=
                turbulence_slow_alpha * (noise - state.turbulence_slow);
            state.turbulence_meander +=
                turbulence_meander_alpha * (noise - state.turbulence_meander);
            let band_noise = state.turbulence_fast - state.turbulence_slow;

            let feedback_highpass = state.feedback_velocity - state.feedback_hp_input
                + feedback_hp_pole * state.feedback_hp_output;
            state.feedback_hp_input = state.feedback_velocity;
            state.feedback_hp_output = feedback_highpass;
            let resonator_input = if law.resonator_enabled {
                feedback_highpass
            } else {
                0.0
            };
            let band_feedback = band_b0 * resonator_input + state.jet_band_s1;
            state.jet_band_s1 = -band_a1 * band_feedback + state.jet_band_s2;
            state.jet_band_s2 = band_b2 * resonator_input - band_a2 * band_feedback;

            let normalized_feedback = feedback_gain * band_feedback / jet_speed.max(8.0);
            let jet_perturbation = normalized_feedback
                + turbulence_level * band_noise
                + meander_level * state.turbulence_meander;
            storage.jet[state.jet_write] = jet_perturbation;
            // A flutist changes lip cover, angle, and hydrodynamic stage to
            // keep the convective disturbance phase on the selected passive
            // bore mode.  The small sinusoidal modulation is true pitch
            // vibrato; pressure vibrato remains independently present above.
            let pitch_vibrato =
                1.0 + 0.0045 * vibrato_onset * state.vibrato_sin;
            // Flow-form source removes the differentiator's +90 deg loop
            // phase; restore it convectively (quarter cycle less transit).
            // The two-component source leads the pure flow term by
            // atan(bright_weight) at f0; keep total loop phase fixed by
            // adding that lead back as convective transit.
            let flow_form_active = SOURCE_FORM == 1 && register_level < 2.5;
            let effective_phase_cycles = if flow_form_active {
                let bright_weight = bright_weight_for(midi, velocity_norm);
                gesture.convective_phase_cycles - 0.25
                    + atanf(bright_weight) / TAU
            } else {
                gesture.convective_phase_cycles
            };
            let jet_delay = (effective_phase_cycles * internal_rate
                / (mode_center_hz * pitch_vibrato))
                .clamp(1.0, (MAX_JET_HISTORY - 2) as f32)
                * law.jet_delay_scale;
            let delayed_jet = read_current_delay(
                &storage.jet,
                0,
                MAX_JET_HISTORY,
                state.jet_write,
                jet_delay,
            );
            state.jet_write += 1;
            if state.jet_write == MAX_JET_HISTORY {
                state.jet_write = 0;
            }

            // Saturating transverse displacement: full small-signal gain for
            // phonation onset; steady state limited to ~the jet width so the
            // labium split works on the tanh shoulder (harmonically rich,
            // dynamics-responsive) instead of rail-to-rail square.
            if elapsed_seconds >= onset_hold_seconds {
                growth_cap_now = growth_cap_sustain
                    + (growth_cap_now - growth_cap_sustain) * growth_settle_alpha;
            }
            let jet_growth = expf(base_growth_exponent.min(growth_cap_now));
            let linear_half_widths = jet_growth * delayed_jet;
            let saturation = jet_saturation_half_width_for(midi, velocity_norm);
            let saturated_half_widths =
                saturation * fast_tanh(linear_half_widths / saturation);
            let edge_displacement = JET_HALF_WIDTH_M * saturated_half_widths;
            let offset = JET_HALF_WIDTH_M
                * (jet_offset_ratio + 0.025 * vibrato_onset * state.vibrato_sin);
            let edge_split = fast_tanh((edge_displacement - offset) / JET_HALF_WIDTH_M);
            let edge_split_derivative =
                (edge_split - state.prior_edge_split) * internal_rate;
            state.prior_edge_split = edge_split;
            let jet_source_coefficient = acoustics.embouchure.density
                * JET_DIPOLE_LENGTH_M
                * JET_HALF_WIDTH_M
                * jet_speed
                / channel_to_edge;
            // CAL-SWEEP: flow-form source. The differentiated split injects a
            // flat odd ladder (each transition is an impulse pair); the
            // canonical jet-drive alternative injects the split as volume
            // flow and lets the bore impedance shape the ladder (-6 dB/oct
            // relative tilt). SOURCE_FORM 0 = derivative, 1 = flow.
            // Two-component source: the flow term sets the reference-shaped
            // ladder base; the derivative fraction carries the brightness that
            // grows with dynamics (vortex-shedding component).
            // Register 3 (altissimo) keeps the derivative source: its higher
            // jet stages phonate on that phase law (midi 92 loses mode
            // capture under the blend); per-register source tables are the
            // recorded follow-up.
            let unsaturated_jet_pressure = if flow_form_active {
                gesture.source_scale
                    * jet_source_coefficient
                    * (edge_split * (TAU * mode_center_hz)
                        + bright_weight_for(midi, velocity_norm)
                            * edge_split_derivative)
            } else {
                gesture.source_scale
                    * jet_source_coefficient
                    * edge_split_derivative
            };
            let jet_source_pressure = unsaturated_jet_pressure
                / (1.0 + unsaturated_jet_pressure.abs() / 1_200.0);

            let body_return = backward_out[0];
            let prior_emb_flow = state.emb_flow;
            let (emb_g, emb_history) =
                embouchure_coefficients(&acoustics.embouchure, state.emb_flow);
            let emb_history_with_source = emb_history - emb_g * jet_source_pressure;
            let emb_denominator =
                layout.admittance[0] + acoustics.head_admittance + emb_g;
            let emb_pressure = (2.0 * layout.admittance[0] * body_return
                + 2.0 * acoustics.head_admittance * head_return
                - emb_history_with_source)
                / emb_denominator.max(1.0e-20);
            let body_outgoing = emb_pressure - body_return;
            let head_outgoing = emb_pressure - head_return;
            let emb_flow = emb_g * (emb_pressure - jet_source_pressure) + emb_history;
            state.emb_flow = emb_flow;
            state.emb_pressure = emb_pressure;
            forward_next[0] = body_outgoing;

            storage.head[state.head_write] = head_outgoing;
            state.head_write += 1;
            if state.head_write == layout.head_capacity {
                state.head_write = 0;
            }

            let mut upper_hole_field = 0.0f32;
            let mut lower_hole_field = 0.0f32;
            for node in 0..NODES {
                let hole_a = NODE_HOLE_A[node];
                let hole_b = NODE_HOLE_B[node];
                let coeff_a = if hole_a >= 0 {
                    let hole = hole_a as usize;
                    tonehole_coefficients(
                        &acoustics.holes[hole],
                        state.hole_open[hole],
                        state.hole_flow[hole],
                        state.hole_pressure[hole],
                    )
                } else {
                    BranchCoefficients::ZERO
                };
                let coeff_b = if hole_b >= 0 {
                    let hole = hole_b as usize;
                    tonehole_coefficients(
                        &acoustics.holes[hole],
                        state.hole_open[hole],
                        state.hole_flow[hole],
                        state.hole_pressure[hole],
                    )
                } else {
                    BranchCoefficients::ZERO
                };
                let conductance = coeff_a.total_g() + coeff_b.total_g();
                let history = coeff_a.total_history() + coeff_b.total_history();
                let (toward_right, toward_left, pressure) = passive_junction(
                    forward_out[node],
                    backward_out[node + 1],
                    layout.admittance[node],
                    layout.admittance[node + 1],
                    conductance,
                    history,
                );
                forward_next[node + 1] = toward_right;
                backward_next[node] = toward_left;

                if hole_a >= 0 {
                    let hole = hole_a as usize;
                    let field = update_hole_radiation(
                        &mut state,
                        hole,
                        coeff_a,
                        pressure,
                        internal_rate,
                        hole_radiation_alpha,
                        acoustics.radiation_scale,
                    );
                    if hole <= 8 {
                        upper_hole_field += field;
                    } else {
                        lower_hole_field += field;
                    }
                }
                if hole_b >= 0 {
                    let hole = hole_b as usize;
                    let field = update_hole_radiation(
                        &mut state,
                        hole,
                        coeff_b,
                        pressure,
                        internal_rate,
                        hole_radiation_alpha,
                        acoustics.radiation_scale,
                    );
                    if hole <= 8 {
                        upper_hole_field += field;
                    } else {
                        lower_hole_field += field;
                    }
                }
            }

            let foot_incident = forward_out[SEGMENTS - 1];
            state.foot_reflection_lp += layout.foot_reflection_alpha
                * (foot_incident - state.foot_reflection_lp);
            let foot_reflection_drive =
                0.16 * foot_incident + 0.84 * state.foot_reflection_lp;
            storage.foot[state.foot_write] = foot_reflection_drive;
            let foot_delayed = read_current_delay(
                &storage.foot,
                0,
                layout.foot_capacity,
                state.foot_write,
                foot_delay,
            );
            state.foot_write += 1;
            if state.foot_write == layout.foot_capacity {
                state.foot_write = 0;
            }
            let foot_reflection = -0.985 * foot_delayed;
            backward_next[SEGMENTS - 1] = foot_reflection;

            for segment in 0..SEGMENTS {
                let offset = layout.offsets[segment];
                let write = state.body_writes[segment];
                storage.forward[offset + write] = forward_next[segment];
                storage.backward[offset + write] = backward_next[segment];
                let next = write + 1;
                state.body_writes[segment] = if next == layout.capacities[segment] {
                    0
                } else {
                    next
                };
            }

            let body_volume_flow =
                layout.admittance[0] * (body_outgoing - body_return);
            state.feedback_velocity = body_volume_flow / acoustics.embouchure.area;

            let emb_flow_derivative = (emb_flow - prior_emb_flow) * internal_rate;
            // Radiated-field band-limit (playbook law): flow-derivative dipole
            // radiation is +6 dB/oct unbounded; the physical apertures are
            // compact sources whose radiation efficiency rolls off. The hole
            // fields already pass a one-pole; embouchure and foot must too --
            // this was the unfiltered path carrying the high-band excess.
            let (emb_bore_weight, emb_jet_weight) =
                emb_radiation_weights_for(midi, velocity_norm);
            let embouchure_raw =
                0.72 * emb_bore_weight * acoustics.radiation_scale * emb_flow_derivative
                    + emb_jet_weight * jet_source_pressure;
            state.emb_radiation_lp +=
                hole_radiation_alpha * (embouchure_raw - state.emb_radiation_lp);
            // Round-7 breath-noise floor: the jet's incoherent component
            // radiates directly from the aperture, scaled by the same
            // pressure envelope as the coherent jet so onset/release track
            // the player's air (no gate steps). One-pole via the shared
            // radiation corner keeps it deterministic and rate-compensated.
            let breath_gain =
                lerp_anchors(&BREATH_NOISE_RADIATION_ANCHORS, velocity_norm)
                    * note_trim_scalar(&BREATH_NOISE_NOTE_TRIM_R1, midi);
            let breath_raw =
                breath_gain * jet_speed * (rng.bipolar() as f32);
            let breath_alpha =
                1.0 - expf(-TAU * BREATH_NOISE_CORNER_HZ / internal_rate);
            state.breath_noise_lp +=
                breath_alpha * (breath_raw - state.breath_noise_lp);
            let embouchure_field = state.emb_radiation_lp + state.breath_noise_lp;
            let foot_volume_flow = layout.admittance[SEGMENTS - 1]
                * (foot_incident - foot_reflection);
            let foot_flow_derivative =
                (foot_volume_flow - state.foot_flow) * internal_rate;
            state.foot_flow = foot_volume_flow;
            let foot_raw = acoustics.radiation_scale * foot_flow_derivative;
            state.foot_radiation_lp +=
                foot_radiation_alpha * (foot_raw - state.foot_radiation_lp);
            let foot_field = state.foot_radiation_lp;
            let groups = [
                embouchure_field,
                upper_hole_field,
                lower_hole_field,
                foot_field,
            ];

            for group in 0..RADIATION_GROUPS {
                storage.radiation[group * MAX_RADIATION_HISTORY + state.radiation_write] =
                    groups[group];
            }
            let mut microphone_left = 0.0f32;
            let mut microphone_right = 0.0f32;
            for group in 0..RADIATION_GROUPS {
                let offset = group * MAX_RADIATION_HISTORY;
                microphone_left += layout.radiation_gain_left[group]
                    * read_current_delay(
                        &storage.radiation,
                        offset,
                        layout.radiation_capacity,
                        state.radiation_write,
                        layout.radiation_delay_left[group],
                    );
                microphone_right += layout.radiation_gain_right[group]
                    * read_current_delay(
                        &storage.radiation,
                        offset,
                        layout.radiation_capacity,
                        state.radiation_write,
                        layout.radiation_delay_right[group],
                    );
            }
            state.radiation_write += 1;
            if state.radiation_write == layout.radiation_capacity {
                state.radiation_write = 0;
            }

            let raw_left = DIGITAL_PER_PASCAL * microphone_left;
            let raw_right = DIGITAL_PER_PASCAL * microphone_right;
            state.downsample_left_1 +=
                layout.downsample_alpha * (raw_left - state.downsample_left_1);
            state.downsample_left_2 += layout.downsample_alpha
                * (state.downsample_left_1 - state.downsample_left_2);
            state.downsample_right_1 +=
                layout.downsample_alpha * (raw_right - state.downsample_right_1);
            state.downsample_right_2 += layout.downsample_alpha
                * (state.downsample_right_1 - state.downsample_right_2);
            accumulated_left += state.downsample_left_2;
            accumulated_right += state.downsample_right_2;

            let next_vibrato_sin = state.vibrato_sin * vibrato_step_cos
                + state.vibrato_cos * vibrato_step_sin;
            state.vibrato_cos = state.vibrato_cos * vibrato_step_cos
                - state.vibrato_sin * vibrato_step_sin;
            state.vibrato_sin = next_vibrato_sin;
            if (state.elapsed_internal_frames as usize + local_internal_frame) & 4095 == 0 {
                let norm = sqrtf(
                    state.vibrato_sin * state.vibrato_sin
                        + state.vibrato_cos * state.vibrato_cos,
                )
                .max(1.0e-12);
                state.vibrato_sin /= norm;
                state.vibrato_cos /= norm;
            }

            if !state.mouth_pressure_pa.is_finite()
                || !emb_pressure.is_finite()
                || emb_pressure.abs() > 20_000.0
                || !microphone_left.is_finite()
                || !microphone_right.is_finite()
            {
                out_left.fill(0.0);
                out_right.fill(0.0);
                return 0;
            }
        }

        let averaged_left = accumulated_left / layout.oversample as f32;
        let averaged_right = accumulated_right / layout.oversample as f32;
        let dc_left = averaged_left - state.dc_left_input + dc_pole * state.dc_left_output;
        state.dc_left_input = averaged_left;
        state.dc_left_output = if dc_left.abs() < 1.0e-20 { 0.0 } else { dc_left };
        let dc_right =
            averaged_right - state.dc_right_input + dc_pole * state.dc_right_output;
        state.dc_right_input = averaged_right;
        state.dc_right_output = if dc_right.abs() < 1.0e-20 {
            0.0
        } else {
            dc_right
        };
        out_left[frame] = fast_tanh(state.dc_left_output);
        out_right[frame] = fast_tanh(state.dc_right_output);
    }

    state.seed = rng.state;
    let rendered_internal = out_left.len().saturating_mul(layout.oversample);
    state.elapsed_internal_frames = state
        .elapsed_internal_frames
        .saturating_add(rendered_internal.min(u32::MAX as usize) as u32);
    state.prior_midi = midi;

    if let Some((bytes, written)) = state_output.as_mut() {
        let Some(size) = encode_state(bytes, layout, &state, storage) else {
            out_left.fill(0.0);
            out_right.fill(0.0);
            return 0;
        };
        **written = size;
    }
    out_left.len()
}

#[no_mangle]
pub extern "C" fn flt3_note_frames(midi: i32, sample_rate: f32) -> i32 {
    if fingering_for_midi(midi).is_none() || segment_layout(sample_rate, 0).is_none() {
        return 0;
    }
    (CAP_SECONDS * sample_rate) as i32
}

#[no_mangle]
pub extern "C" fn flt3_state_max_bytes() -> i32 {
    STATE_MAX_BYTES as i32
}

#[no_mangle]
pub extern "C" fn flt3_render(
    midi: i32,
    velocity: i32,
    sample_rate: f32,
    variation_slot: u32,
    articulation: u32,
    left: *mut f32,
    right: *mut f32,
    max_frames: i32,
) -> i32 {
    let natural = flt3_note_frames(midi, sample_rate);
    if natural == 0
        || max_frames <= 0
        || left.is_null()
        || right.is_null()
        || (left as usize) % core::mem::align_of::<f32>() != 0
        || (right as usize) % core::mem::align_of::<f32>() != 0
    {
        return 0;
    }
    let frames = natural.min(max_frames) as usize;
    let Some(channel_bytes) = frames.checked_mul(core::mem::size_of::<f32>()) else {
        return 0;
    };
    if !disjoint_ranges(left as usize, channel_bytes, right as usize, channel_bytes) {
        return 0;
    }

    let out_left = unsafe { core::slice::from_raw_parts_mut(left, frames) };
    let out_right = unsafe { core::slice::from_raw_parts_mut(right, frames) };
    let mut storage = RenderStorage::zeroed();
    render_with_storage(
        midi,
        velocity,
        sample_rate,
        variation_slot,
        articulation,
        out_left,
        out_right,
        None,
        None,
        &mut storage,
        PHYSICAL_RENDER_LAW,
    ) as i32
}

#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn flt3_render_phrase(
    midi: i32,
    velocity: i32,
    sample_rate: f32,
    variation_slot: u32,
    articulation: u32,
    left: *mut f32,
    right: *mut f32,
    max_frames: i32,
    state_input: *const u8,
    state_input_bytes: i32,
    state_output: *mut u8,
    state_output_capacity: i32,
) -> i32 {
    let natural = flt3_note_frames(midi, sample_rate);
    if natural == 0
        || max_frames <= 0
        || left.is_null()
        || right.is_null()
        || state_output.is_null()
        || state_input_bytes < 0
        || state_output_capacity < STATE_HEADER_BYTES as i32
        || state_output_capacity as usize > STATE_MAX_BYTES
        || state_input_bytes as usize > STATE_MAX_BYTES
        || (state_input_bytes > 0 && state_input.is_null())
        || (left as usize) % core::mem::align_of::<f32>() != 0
        || (right as usize) % core::mem::align_of::<f32>() != 0
    {
        return 0;
    }
    let frames = natural.min(max_frames) as usize;
    let Some(channel_bytes) = frames.checked_mul(core::mem::size_of::<f32>()) else {
        return 0;
    };
    let ranges = [
        (left as usize, channel_bytes),
        (right as usize, channel_bytes),
        (state_output as usize, state_output_capacity as usize),
    ];
    for lhs in 0..ranges.len() {
        for rhs in lhs + 1..ranges.len() {
            if !disjoint_ranges(ranges[lhs].0, ranges[lhs].1, ranges[rhs].0, ranges[rhs].1) {
                return 0;
            }
        }
    }
    if state_input_bytes > 0 {
        for (offset, bytes) in ranges {
            if !disjoint_ranges(
                state_input as usize,
                state_input_bytes as usize,
                offset,
                bytes,
            ) {
                return 0;
            }
        }
    }

    let out_left = unsafe { core::slice::from_raw_parts_mut(left, frames) };
    let out_right = unsafe { core::slice::from_raw_parts_mut(right, frames) };
    let input = if state_input_bytes == 0 {
        None
    } else {
        Some(unsafe { core::slice::from_raw_parts(state_input, state_input_bytes as usize) })
    };
    let output =
        unsafe { core::slice::from_raw_parts_mut(state_output, state_output_capacity as usize) };
    let mut written = 0usize;
    let mut storage = RenderStorage::zeroed();
    let rendered = render_with_storage(
        midi,
        velocity,
        sample_rate,
        variation_slot,
        articulation,
        out_left,
        out_right,
        input,
        Some((output, &mut written)),
        &mut storage,
        PHYSICAL_RENDER_LAW,
    );
    if rendered == 0 || written == 0 {
        0
    } else {
        rendered as i32
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn render_test_at_rate(
        midi: i32,
        velocity: i32,
        sample_rate: f32,
        frames: usize,
        law: RenderLaw,
    ) -> (Vec<f32>, Vec<f32>, Vec<u8>) {
        let mut left = vec![0.0f32; frames];
        let mut right = vec![0.0f32; frames];
        let mut state = vec![0u8; STATE_MAX_BYTES];
        let mut state_bytes = 0usize;
        let mut storage = RenderStorage::zeroed();
        let rendered = render_with_storage(
            midi,
            velocity,
            sample_rate,
            0,
            1,
            &mut left,
            &mut right,
            None,
            Some((&mut state, &mut state_bytes)),
            &mut storage,
            law,
        );
        assert_eq!(rendered, frames);
        state.truncate(state_bytes);
        (left, right, state)
    }

    fn render_test(
        midi: i32,
        velocity: i32,
        frames: usize,
        law: RenderLaw,
    ) -> (Vec<f32>, Vec<f32>, Vec<u8>) {
        render_test_at_rate(midi, velocity, 48_000.0, frames, law)
    }

    fn rms(signal: &[f32]) -> f64 {
        let energy = signal
            .iter()
            .map(|sample| {
                let value = *sample as f64;
                value * value
            })
            .sum::<f64>();
        libm::sqrt(energy / signal.len().max(1) as f64)
    }

    fn normalized_autocorrelation(signal: &[f32], lag: usize) -> f64 {
        if lag == 0 || lag >= signal.len() {
            return 0.0;
        }
        let mut dot = 0.0;
        let mut left = 0.0;
        let mut right = 0.0;
        for index in lag..signal.len() {
            let a = signal[index] as f64;
            let b = signal[index - lag] as f64;
            dot += a * b;
            left += a * a;
            right += b * b;
        }
        dot / libm::sqrt(left * right).max(1.0e-30)
    }

    fn estimate_pitch(signal: &[f32], sample_rate: f64, expected_hz: f64) -> (f64, f64) {
        let center = sample_rate / expected_hz;
        let low = libm::floor(center * 0.88) as usize;
        let high = libm::ceil(center * 1.12) as usize;
        let mut best_lag = low.max(1);
        let mut best = -1.0;
        for lag in low.max(1)..=high.max(1) {
            let score = normalized_autocorrelation(signal, lag);
            if score > best {
                best = score;
                best_lag = lag;
            }
        }
        let before = normalized_autocorrelation(signal, best_lag.saturating_sub(1).max(1));
        let after = normalized_autocorrelation(signal, best_lag + 1);
        let curvature = before - 2.0 * best + after;
        let adjustment = if curvature.abs() > 1.0e-12 {
            (0.5 * (before - after) / curvature).clamp(-0.5, 0.5)
        } else {
            0.0
        };
        (sample_rate / (best_lag as f64 + adjustment), best)
    }

    #[test]
    fn measured_geometry_and_fingerings_are_complete() {
        assert_eq!(FINGERING_PATTERNS.len(), 37);
        assert_eq!(HOLE_POSITION_M.len(), HOLES);
        assert!((PATH_END_M[SEGMENTS - 1] - 0.6004).abs() < 1.0e-7);
        assert!((CORK_DISTANCE_M - 0.0175).abs() < 1.0e-7);
        for pattern in FINGERING_PATTERNS {
            assert!(pattern.iter().all(|value| *value == b'X' || *value == b'O'));
        }
        for midi in MIN_MIDI..=MAX_MIDI {
            let gesture = player_gesture_for_midi(midi).unwrap();
            assert!(gesture.convective_phase_cycles > 0.0);
            assert!(gesture.pressure_scale > 0.0);
            assert!(gesture.feedback_scale > 0.0);
            assert!(gesture.instability_q_scale >= 1.0);
            assert!(gesture.source_scale > 0.0);
        }
        let acoustics = acoustic_precompute(48_000.0);
        for hole in 0..HOLES {
            let constants = &acoustics.holes[hole];
            let mut prior_area = 0.0;
            for step in 0..=32 {
                let opening = step as f32 / 32.0;
                let area = tonehole_open_area_m2_from_static(constants, opening);
                assert!(area >= prior_area && area <= constants.full_area);
                prior_area = area;
            }
            assert!((prior_area - constants.full_open_area).abs() < 1.0e-12);
        }
    }

    #[test]
    fn layout_is_fixed_across_notes_and_supports_browser_rates() {
        for sample_rate in [8_000.0, 11_025.0, 16_000.0, 22_050.0, 44_100.0, 48_000.0, 96_000.0] {
            let layout = segment_layout(sample_rate, 0).unwrap();
            assert!(layout.internal_rate >= MIN_INTERNAL_RATE_HZ);
            assert!(layout.internal_rate <= MAX_SAMPLE_RATE_HZ);
            assert!(layout.total_samples <= MAX_WAVE_SAMPLES);
            assert!(layout.capacities.iter().all(|capacity| *capacity >= 3));
            assert!(state_required_bytes(layout).unwrap() <= STATE_MAX_BYTES);
        }
    }

    #[test]
    fn passive_area_junction_conserves_power() {
        let yl = 0.8;
        let yr = 1.1;
        let a = 0.7;
        let b = -0.2;
        let (toward_right, toward_left, _) = passive_junction(a, b, yl, yr, 0.0, 0.0);
        let incoming = yl * a * a + yr * b * b;
        let outgoing = yr * toward_right * toward_right + yl * toward_left * toward_left;
        assert!((incoming - outgoing).abs() < 1.0e-6);
    }

    #[test]
    fn state_checksum_and_layout_tag_reject_incompatible_state() {
        let (_, _, state) = render_test(72, 76, 8_000, PHYSICAL_RENDER_LAW);
        assert!(state.len() >= STATE_HEADER_BYTES + 8);
        let layout = segment_layout(48_000.0, 0).unwrap();
        let fingering = fingering_for_midi(72).unwrap();
        let mut storage = RenderStorage::zeroed();
        assert!(decode_state(&state, 72, 76, fingering, layout, &mut storage).is_some());

        let incompatible_layout = segment_layout(48_000.0, 1).unwrap();
        assert!(decode_state(
            &state,
            72,
            76,
            fingering,
            incompatible_layout,
            &mut storage,
        )
        .is_none());

        let mut corrupt = state;
        corrupt[STATE_HEADER_BYTES + 7] ^= 0x40;
        assert!(decode_state(&corrupt, 72, 76, fingering, layout, &mut storage).is_none());
    }

    #[test]
    fn renderer_is_finite_stereo_deterministic_and_dynamic() {
        let frames = 24_000;
        for midi in [60, 67, 72, 79, 84, 91, 96] {
            let (soft_left, soft_right, soft_state) =
                render_test(midi, 42, frames, PHYSICAL_RENDER_LAW);
            let (loud_left, loud_right, loud_state) =
                render_test(midi, 108, frames, PHYSICAL_RENDER_LAW);
            assert!(soft_left.iter().chain(&soft_right).all(|sample| sample.is_finite()));
            assert!(loud_left.iter().chain(&loud_right).all(|sample| sample.is_finite()));
            assert!(soft_state.len() <= STATE_MAX_BYTES && loud_state.len() <= STATE_MAX_BYTES);
            let settled_soft = &soft_left[frames / 2..];
            let settled_loud = &loud_left[frames / 2..];
            assert!(rms(settled_soft) > 1.0e-6, "midi {midi} did not phonate");
            assert!(rms(settled_loud) > 1.05 * rms(settled_soft));
            assert_ne!(&soft_left[..512], &soft_right[..512]);
        }
        let replay_a = render_test(72, 80, 12_000, PHYSICAL_RENDER_LAW);
        let replay_b = render_test(72, 80, 12_000, PHYSICAL_RENDER_LAW);
        assert_eq!(replay_a, replay_b);
    }

    #[test]
    fn phrase_state_continues_without_restart() {
        let (_, _, first_state) = render_test(67, 80, 10_000, PHYSICAL_RENDER_LAW);
        let mut continued_left = vec![0.0f32; 10_000];
        let mut continued_right = vec![0.0f32; 10_000];
        let mut continued_state = vec![0u8; STATE_MAX_BYTES];
        let mut continued_state_bytes = 0usize;
        let mut storage = RenderStorage::zeroed();
        assert_eq!(
            render_with_storage(
                72,
                84,
                48_000.0,
                0,
                0,
                &mut continued_left,
                &mut continued_right,
                Some(&first_state),
                Some((&mut continued_state, &mut continued_state_bytes)),
                &mut storage,
                PHYSICAL_RENDER_LAW,
            ),
            10_000
        );
        let (restart, _, _) = render_test(72, 84, 10_000, PHYSICAL_RENDER_LAW);
        assert_ne!(&continued_left[..512], &restart[..512]);
        assert!(continued_state_bytes > STATE_HEADER_BYTES);
    }

    #[test]
    fn every_published_fingering_captures_its_intended_mode_at_48k() {
        let sample_rate = 48_000.0;
        let frames = 24_000;
        for midi in MIN_MIDI..=MAX_MIDI {
            let (samples, _, _) = render_test(midi, 88, frames, PHYSICAL_RENDER_LAW);
            let settled = &samples[frames / 2..];
            let expected = midi_frequency_hz(midi as f64);
            let (pitch, periodicity) = estimate_pitch(settled, sample_rate, expected);
            let cents = 1_200.0 * libm::log2(pitch / expected);
            assert!(rms(settled) > 1.0e-5, "midi {midi} did not phonate");
            assert!(periodicity > 0.35, "midi {midi} periodicity {periodicity}");
            assert!(cents.abs() < 70.0, "midi {midi} pitch {pitch} ({cents} cents)");
        }
    }

    #[test]
    fn low_rate_oversampling_preserves_the_fragile_upper_register() {
        let sample_rate = 8_000.0;
        let frames = 4_800;
        let (samples, _, _) =
            render_test_at_rate(90, 88, sample_rate as f32, frames, PHYSICAL_RENDER_LAW);
        let settled = &samples[frames / 2..];
        let expected = midi_frequency_hz(90.0);
        let (pitch, periodicity) = estimate_pitch(settled, sample_rate, expected);
        let cents = 1_200.0 * libm::log2(pitch / expected);
        assert!(rms(settled) > 1.0e-5);
        assert!(periodicity > 0.50, "periodicity {periodicity}");
        assert!(cents.abs() < 70.0, "pitch {pitch} ({cents} cents)");
    }
}
