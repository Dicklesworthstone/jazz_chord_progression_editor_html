/**
 * The band-sketch performance layer contract (bead jcpe-1gao).
 *
 * P0 compiles the chart *literally*: one event per written chord, sustained
 * for its full written duration, every voice at one fixed velocity. That is
 * exactly right for a chart — and it is nothing like a band. A ballad played
 * that way is a sequence of held pads with no bass and no pulse.
 *
 * This package takes a compiled P0 plan and re-derives its `events` array as
 * a *performance* of the same chart: a bass voice in a real bass register, a
 * comping voice placed on syncopated offsets, and a velocity contour. The
 * result is another P0-shaped `PlaybackPlan` — same schema, compiler identity,
 * tempo, meter, totals and source document — so every downstream consumer
 * (X1's structural validation above all) sees an ordinary plan.
 *
 * Why it lives in `src/playback/performance/` rather than beside the P0
 * compiler: P0's production inventory is pinned to exactly three files by its
 * own accepted evidence (`tests/unit/p0-playback-plan-defensive-boundary.ts`
 * and `scripts/verify-p0-evidence.ts`). This layer is a later, separate
 * contract and must not silently enter that inventory. It is published
 * through the same `src/playback` public entry point.
 *
 * Everything here is frozen, versioned data. Musical time is exact rational
 * quarter-note beats converted to ticks by integer arithmetic at PPQ 960;
 * there is no float, no wall time, no randomness, and no ambient input.
 */
import { MIDI_PPQ } from "../../domain";
import type { PlaybackPlan } from "../playback-plan-contract";

export const PERFORMANCE_PLAN_CONTRACT_SCHEMA =
  "changes.playback.performance-plan-contract.v1";
export const PERFORMANCE_PLAN_COMPILER_ID =
  "changes.playback-performance-compiler";
export const PERFORMANCE_PLAN_COMPILER_VERSION = 1;

/** The tick grid every table below is expressed against. */
export const PERFORMANCE_PLAN_MIDI_PPQ = MIDI_PPQ;

/**
 * Emitted-event id suffixes. A performance event is derived from exactly one
 * source event and states its role and slot ordinal, so `event-abc.b0` is the
 * first bass note of `event-abc` and `event-abc.c1` its second comp stab. The
 * suffix alphabet is inside both the stable-id syntax and X1's audio-id
 * charset, so the ids stay legal wherever the plan travels.
 */
export const PERFORMANCE_ROLE_ID_SUFFIXES = Object.freeze({
  bass: "b",
  comp: "c",
} as const);

export const PERFORMANCE_ROLES = Object.freeze(["bass", "comp"] as const);
export type PerformanceRole = (typeof PERFORMANCE_ROLES)[number];

/**
 * Which chord tone a bass slot sounds. The tone is resolved against the
 * *source event's own pitches*, so a bass note is always a pitch class that
 * the written chord actually sounds — never an invented one.
 */
export const PERFORMANCE_BASS_TONES = Object.freeze([
  "root",
  "third",
  "fifth",
] as const);
export type PerformanceBassTone = (typeof PERFORMANCE_BASS_TONES)[number];

/**
 * Which octave of the bass register a bass slot is placed in.
 *
 * `nearest` leads the note from the PREVIOUS bass note: of the placements the
 * register window admits, the one closest to where the line already is. That is
 * ordinary voice leading and it is what every slot did before this field
 * existed.
 *
 * `register-floor` leads the note from the BOTTOM of the register instead, so
 * it takes the LOWEST placement the window admits whatever the previous note
 * was. It is a phrase gesture, not a repair: a bass player starting an open bar
 * drops to the bottom of the instrument and walks back up out of it, and the
 * `nearest` rule alone can never produce that because it is defined to minimize
 * exactly the motion the gesture is made of.
 *
 * BOTH are pure functions of the register window and the plan prefix, and
 * neither can leave `[lowMidi, highMidi]`; `register-floor` is a different
 * TARGET for the same nearest-placement search, not a transposition bolted on
 * after it.
 */
export const PERFORMANCE_BASS_PLACEMENTS = Object.freeze([
  "nearest",
  "register-floor",
] as const);
export type PerformanceBassPlacement =
  (typeof PERFORMANCE_BASS_PLACEMENTS)[number];

/**
 * Which subset of the source voicing a comp slot sounds.
 *
 * `upper-voices` keeps the top `PERFORMANCE_COMP_TARGET_VOICES` voices,
 * dropping from the bottom, because a bass slot is already sounding that pitch
 * class two or three octaves down and doubling it in the comp muddies the
 * middle. `all` states the written voicing entire.
 */
export const PERFORMANCE_COMP_VOICINGS = Object.freeze([
  "upper-voices",
  "all",
  "guide-tones",
  "top-voice",
] as const);
export type PerformanceCompVoicing =
  (typeof PERFORMANCE_COMP_VOICINGS)[number];

/** An exact rational quarter-note beat value. Never a float. */
export type ExactBeats = Readonly<{
  numerator: number;
  denominator: number;
}>;

/**
 * An exact rational fraction of one beat. Never a float.
 *
 * The swing ratio is the position, inside a beat, at which that beat's offbeat
 * eighth is actually played. 1/2 is dead straight; 9/16 is the laid-back lilt
 * a late-seventies jazz-rock ballad has; 2/3 is a full triplet swing. It is a
 * rational rather than a JavaScript number because a float multiplied into a
 * tick offset is exactly the kind of value that stops being reproducible
 * across engines, and musical time in this package is integer arithmetic all
 * the way down.
 */
export type PerformanceSwingRatio = Readonly<{
  numerator: number;
  denominator: number;
}>;

/** 1/2: offbeat eighths sit exactly halfway through their beat. */
export const PERFORMANCE_STRAIGHT_EIGHTHS: PerformanceSwingRatio = Object.freeze(
  { numerator: 1, denominator: 2 },
);

/**
 * The bar-cycle phases a slot sounds in.
 *
 * A style declares a `barCycleLength`; the phase of a bar is its written
 * measure index modulo that length. A slot sounds only in the phases it names,
 * which is how one frozen table can describe a two-bar pattern where the
 * second bar is deliberately emptier than the first. A style with
 * `barCycleLength: 1` has exactly one phase, 0, and every slot names it.
 */
export type PerformanceCyclePhases = readonly number[];

export type PerformanceBassSlot = Readonly<{
  /**
   * Offset from the start of the written bar the event sits in, exact
   * quarter-note beats. The written bar, not the meter's own tick grid: a
   * pickup or incomplete bar is shorter than the meter's capacity and every
   * bar line after it is off that grid.
   *
   * An offset that lands exactly halfway through its beat is an offbeat eighth
   * and is displaced by the style's swing ratio before it is used.
   */
  offsetBeats: ExactBeats;
  /**
   * Nominal sounding length before clipping, exact quarter-note beats. It may
   * exceed the bar: the compiler clips every slot to the next attack of its own
   * role, to its source chord's end and to the plan total, so declaring "ring
   * until something stops you" is the honest way to write a bass note that
   * rings through an empty bar and gets out of the way in a busy one.
   */
  durationBeats: ExactBeats;
  tone: PerformanceBassTone;
  /** Which octave of the register this slot's note is placed in. */
  placement: PerformanceBassPlacement;
  /** MIDI velocity before the bar-cycle accent, 1..127. */
  velocity: number;
  cyclePhases: PerformanceCyclePhases;
}>;

export type PerformanceCompSlot = Readonly<{
  offsetBeats: ExactBeats;
  durationBeats: ExactBeats;
  voicing: PerformanceCompVoicing;
  /** MIDI velocity before the bar-cycle accent, 1..127. */
  velocity: number;
  cyclePhases: PerformanceCyclePhases;
}>;

/**
 * The bass register every bass slot is transposed into.
 *
 * MIDI 28..48 is E1..C3 — MEASURED. The window is the observed pitch range of
 * the electric-bass part in the aggregate structural statistics of a
 * jazz-rock-ballad style reference (see `BALLAD_COMP_V1`); no note sequence
 * from any recording enters this repository, only the range. It sits an octave
 * and more below the 48..84 window the studio's default Auto voicing policy
 * uses, which is what keeps the derived bass line out of the comping hand.
 *
 * Choosing the octave nearest the previous bass note produces a stepwise line
 * instead of a sequence of leaps, which is what delivers the bass-register goal
 * of bead jcpe-26u1 *without touching the pinned A0/U1 voicing policy*: the
 * chart's voicings are untouched and only this layer's derived bass voice is
 * placed here.
 *
 * The window is 21 semitones, so for a few pitch classes TWO octave placements
 * qualify; the nearest-to-previous rule picks between them and ties resolve
 * downward, deterministically.
 *
 * The anchor is where the very first bass note of a plan is placed from, since
 * there is no previous note to move from, and every later note is placed from
 * that one — so it decides where the whole line sits, not just its first note.
 * A2 (45) is HIGH in the window on purpose. Measured: anchoring in the middle
 * of the window collapses the line into a four-semitone band, because the
 * nearest-octave rule then never has a reason to leave it; anchoring at 45
 * gives the line room to descend into the register and reproduces the
 * reference's own interquartile range of 8 semitones and its top of 48
 * exactly. Anything from 43 upward measures identically, so this is a plateau
 * rather than a fitted constant.
 */
export const PERFORMANCE_BASS_REGISTER = Object.freeze({
  lowMidi: 28,
  highMidi: 48,
  anchorMidi: 45,
} as const);

/**
 * The comp register policy (bead jcpe-26u1 follow-up).
 *
 * THE DEFECT IT EXISTS FOR. The document's Auto voicing policy generates
 * candidates anywhere in MIDI 48..84 and the voice-leading optimizer then
 * keeps whichever candidate leads best from the previous chord. Voice leading
 * is a RELATIVE law, so the chosen voicings are locally excellent and their
 * ABSOLUTE register wanders: the seeded chart's bar 1 sat at C5..B5 with a
 * two-octave hole above a C2 bass, while its bars 3 and 5 put the voicing's
 * lowest note in unison with the bass note under it. That reads as thin and
 * incoherent even though every individual voicing is correct.
 *
 * The voicing policy is contract-pinned and must not change, so the fix lives
 * here: the performance layer octave-transposes the WHOLE comp voicing — every
 * voice by the same number of octaves, so intervals and spelling are preserved
 * exactly and no note is ever renamed — until its lowest voice sits where a
 * pianist's comping hand actually sits.
 *
 * THE WINDOW. `[lowMidi, lowMidi + 11]` is the HOME OCTAVE: exactly twelve
 * consecutive semitones, so for any pitch class there is exactly ONE octave
 * placement inside it and the normalization needs no tie-break at all.
 *
 * `highMidi` is `lowMidi + 23`, and it is the whole range the comp's lowest
 * voice is guaranteed to occupy. The upper octave is reachable only by the
 * bass-separation lift below, never by normalization.
 *
 * WHY THE HOME OCTAVE SITS WHERE IT DOES. `lowMidi + 12` must be at least
 * `PERFORMANCE_BASS_REGISTER.highMidi + PERFORMANCE_COMP_BASS_SEPARATION_SEMITONES`.
 * That is the well-formedness law `compRegisterWellFormed` enforces, and it is
 * what makes ONE octave of lift always enough to clear the highest note the
 * bass register can produce. A lower window — the obvious E3..E4 — would need
 * two lifts under a bass near the top of its own register, and the comp's
 * register would then swing a full octave from bar to bar: the very defect
 * this policy exists to remove, reintroduced through the back door.
 *
 * THE ARITHMETIC, RECOMPUTED FOR THE MEASURED BASS WINDOW AND THE RELAXED
 * SEPARATION. The bass ceiling is `PERFORMANCE_BASS_REGISTER.highMidi = 48`
 * (C3) and the separation floor is now a major third, so the requirement is
 * `lowMidi + 12 >= 48 + 4 = 52`, i.e. `lowMidi >= 40`. Both published band
 * sketches clear that with room: ballad-comp@1 at `lowMidi 47` by seven,
 * medium-swing@1 at `lowMidi 60` by twenty. THAT SLACK IS THE POINT of relaxing
 * the separation — while the law demanded a minor ninth the ballad's window sat
 * exactly ON its floor at 49, five semitones above the measured comping
 * register, with no room to be placed by measurement at all.
 *
 * `ceilingMidi` is the hard bound no comp voice may sound above.
 */
export type PerformanceCompRegister = Readonly<{
  /** The lowest MIDI pitch the comp's bottom voice may occupy. */
  lowMidi: number;
  /** `lowMidi + 23`: the highest, after at most one separation lift. */
  highMidi: number;
  /** No comp voice sounds above this. */
  ceilingMidi: number;
}>;

/**
 * The version of the register policy the styles below are authored against.
 * The rules are frozen data: a change to any of the three constants or to the
 * placement law is a new version, not a silent re-tuning of a published style.
 */
export const PERFORMANCE_COMP_REGISTER_POLICY_VERSION = 1;

/**
 * A MAJOR THIRD. Every comp voice sounds at least this far above the bass note
 * sounding under it, so the comp never doubles the bass at the unison and never
 * crowds it at a second or a minor third — the intervals that actually mud a
 * low register — and it never sounds below it.
 *
 * THIS CONSTANT WAS 13, A MINOR NINTH, AND THE MEASUREMENT CONTRADICTED IT.
 * The reasoning behind thirteen was that an octave doubling of the bass in the
 * comp's bottom voice is the thickening the `upper-voices` rule already exists
 * to avoid, so the comp should clear the bass by more than an octave. That is a
 * defensible piano-voicing instinct and it is NOT what the style reference
 * does: its comping instrument's lowest note sits THREE SEMITONES BELOW its
 * bass part's highest (min comp − max bass = −3), and its comping range bottoms
 * out at MIDI 45 against our 50. A minor-ninth floor makes both of those
 * unreachable by construction — it was the binding constraint on the comping
 * register, and it forced `lowMidi` up to 49 where the measured register is
 * lower.
 *
 * So the law is relaxed DELIBERATELY, and to a value the measurement chooses
 * rather than to taste. Sweeping the floor against the whole 68-dimension
 * statistic vector, everything from 2 to 4 semitones scores identically
 * (aggregate 0.0909 at `lowMidi 47`); at 5 the floor starts binding again and
 * the aggregate degrades to 0.0931; at the old 13 it is 0.1001. FOUR is the top
 * of that plateau — the largest floor that is not the thing deciding the
 * register — which is why it is four and not two: the register window should
 * place the comping hand, and the bass floor should only stop a genuine
 * collision.
 *
 * THE MIX CONSEQUENCE WAS MEASURED BEFORE THE VALUE WAS CHOSEN, because the
 * defect this package already fixed once was "a boom that buries the harmony".
 * Rendering the seeded chart through the production audio engine: sub-177 Hz
 * energy share 47.5 % before, 47.9 % after; spectral centroid 285 Hz before,
 * 283 Hz after; bass-stem-minus-comp-stem integrated loudness 1.40 LU before,
 * 1.20 LU after. Dropping `lowMidi` one further semitone to 46 buys 0.0003 of
 * aggregate and costs 2.8 points of sub-177 share (50.3 %) and 11 Hz of
 * centroid, so it was measured and REJECTED. The style dimension is closed
 * without moving the low end.
 */
export const PERFORMANCE_COMP_BASS_SEPARATION_SEMITONES = 4;

/**
 * The widest comp span one hand can state, in semitones. A nineteenth is a
 * twelfth plus a fifth — already a stretch, and past it the "chord" is two
 * disconnected registers rather than one sound.
 */
export const PERFORMANCE_COMP_MAX_SPAN_SEMITONES = 19;

/**
 * The fewest voices the WIDTH rule will reduce a comp to. Three voices still
 * state a seventh chord's colour; two do not.
 *
 * The separation and ceiling rules may go below this — a comp sounding under
 * the bass, or above the instrument's stated ceiling, is a worse defect than a
 * thin one — but they never empty a comp.
 */
export const PERFORMANCE_COMP_MIN_WIDTH_VOICES = 3;

/**
 * How many voices an `upper-voices` comp states — MEASURED, and the same three
 * the width rule refuses to go below.
 *
 * The style statistics this layer is tuned against count the comping
 * instrument's simultaneous-note groups as 3:559, 4:208, 2:27, 5:6 — three
 * notes at better than two to one over four, and three-or-fewer at three to
 * one over everything else. A comping player states the harmony with guide
 * tones and one colour note, not with the whole spelled stack; the fourth
 * voice of a written four-note voicing is its lowest, and a bass slot is
 * already sounding that pitch class two octaves down.
 *
 * So `upper-voices` keeps the TOP THREE voices, dropping from the bottom — the
 * identical mechanism and the identical direction as the width rule, given a
 * target instead of a span. A voicing that already has three or fewer voices
 * is left exactly as it is: this rule only ever removes, and it never removes
 * a guide tone that a thinner voicing needed.
 */
export const PERFORMANCE_COMP_TARGET_VOICES = 3;

/**
 * The tick a clipped release is pulled back by, so a note CLEARS before the
 * next attack of its own role instead of butting against it.
 *
 * 30 ticks is 1/32 of a quarter-note beat at PPQ 960 — exactly integral, and
 * about 18 ms at 105 BPM. It applies where, and only where, the clipping law
 * actually shortens a slot: a slot whose declared length already ends before
 * the next attack keeps that declared length untouched, so the style tables
 * remain the thing that decides note length. Where the window is shorter than
 * the gap itself the note keeps its hard-clipped length rather than vanishing,
 * because a chord that states itself briefly is still a chord that states
 * itself and the arrival law may never be silenced by an articulation rule.
 *
 * This is a floor under the release, not the release itself: the style tables
 * below declare lengths that already leave a fifth of a beat of air between
 * attacks. P0's own articulation formula then takes a further
 * `PLAYBACK_PLAN_RELEASE_GAP_TICKS` off the sounding gate.
 */
export const PERFORMANCE_RELEASE_GAP_TICKS = 30;

export type PerformanceStyleKind = "band-sketch" | "literal";

export type PerformanceStyle = Readonly<{
  id: PerformanceStyleId;
  kind: PerformanceStyleKind;
  /** The meter these bar-relative tables are authored for. */
  meter: Readonly<{ beatsPerBar: number; beatUnit: number }>;
  bassSlots: readonly PerformanceBassSlot[];
  compSlots: readonly PerformanceCompSlot[];
  /**
   * Where this style's comping hand sits, or null for the identity style,
   * which emits nothing of its own and must return the input plan untouched.
   */
  compRegister: PerformanceCompRegister | null;
  /**
   * Optional per-style bass register window. Null means the package-wide
   * PERFORMANCE_BASS_REGISTER. A pop electric bass sits an octave above the
   * jazz register the global window was measured against; a style that
   * models one declares its own window instead of detuning every other
   * style's.
   */
  bassRegister: Readonly<{
    lowMidi: number;
    highMidi: number;
    anchorMidi: number;
  }> | null;
  /**
   * How many written bars the pattern takes to repeat. 1 means every bar is
   * played the same way. 2 means bar A and bar B differ, which is what stops a
   * sketch from sounding like a drum machine.
   */
  barCycleLength: number;
  /**
   * A signed velocity offset per bar-cycle phase, one entry per phase. This is
   * the deterministic stand-in for a player leaning on one bar and easing off
   * the next; it is derived from the written measure index, never from a
   * counter and never from randomness.
   */
  barCycleVelocityOffsets: readonly number[];
  /**
   * Where inside its beat an offbeat eighth is actually played. 1/2 is
   * straight. Only offsets sitting exactly halfway through a beat are moved,
   * so on-beat slots are untouched and a straight style is byte-identical to
   * one that declares no swing at all.
   */
  swingRatio: PerformanceSwingRatio;
  /** One sentence stating what this style is, for review and diagnostics. */
  description: string;
}>;

export const PERFORMANCE_STYLE_IDS = Object.freeze([
  "ballad-comp@1",
  "medium-swing@1",
  "bossa-nova@1",
  "straight-eighths@1",
  "syncopated-sixteenths@1",
  "block-chords@1",
] as const);
export type PerformanceStyleId = (typeof PERFORMANCE_STYLE_IDS)[number];

/**
 * ballad-comp@1 — the jazz-rock ballad sketch, fitted to MEASURED style
 * statistics.
 *
 * WHERE THE NUMBERS COME FROM, and what is deliberately absent. Every offset,
 * length, voice count and register below is derived from the AGGREGATE
 * STRUCTURAL STATISTICS of a jazz-rock ballad style reference: a tempo, a
 * meter, per-role onset histograms over the bar, note-length quantiles,
 * inter-onset-interval quantiles, a simultaneous-note-count histogram, sounding
 * and rest fractions, and a pitch range per role. Those summary numbers are the
 * whole of what crossed into this file. No note sequence, no pitch, no
 * interval, no chord and no derivative of any recording's note data is stored
 * here or anywhere in this repository. What follows is a general style rule
 * fitted to a shape, and it is applied to whatever chart the user writes.
 *
 * THE BAR GRID THE ONSET HISTOGRAMS ARE COUNTED AGAINST. Bar lines sit where
 * the reference's own meter map puts them, starting at tick 0, which its later
 * meter changes confirm: each begins exactly where the preceding bar of its own
 * meter ends. An earlier reading of the same measurement used a grid displaced
 * by one beat and concluded the opposite of what is written below — that the
 * downbeat was the emptiest strong position and the weight sat on the and-of-1
 * and beat 2. Those four numbers are this histogram rotated two eighths. The
 * table that followed from them declared no bass slot on beat 1 at all.
 *
 * THE MEASUREMENTS, and the table entry each one produced:
 *
 *  - 105 BPM, 4/4 → the seeded document's tempo (`studio-bootstrap.ts`); this
 *    table's `meter`. (The reference also contains occasional 3/4 and 6/4
 *    bars; the compiler refuses any meter a style is not authored for and the
 *    studio keeps the literal plan, which is the honest answer here.)
 *
 *  - COMP onsets sit on the QUARTER-NOTE grid and are near uniform across it:
 *    629, 650, 630, 618 at eighth positions 0, 2, 4 and 6, and 57 at all four
 *    positions between them combined → `compSlots` at offsets 0, 1, 2 and 3,
 *    all four in BOTH bar phases. A measured comping instrument comps
 *    continuously; it is the RELEASE, not a rest, that makes it breathe.
 *    Emptying one of the four in the open bar was tried and measured worse on
 *    every attack-rate, rest and onset dimension it touched.
 *
 *  - COMP note length is ONE length: 95 % of the comping instrument's notes
 *    last exactly 0.80 beats, and its p10, median and p90 are all 0.80. So
 *    every comp slot declares the same 33/40 of a beat. P0's own articulation
 *    formula then takes `PLAYBACK_PLAN_RELEASE_GAP_TICKS` (24 at PPQ 960) off
 *    the sounding gate, so what actually sounds is 792 - 24 = 768 ticks, i.e.
 *    EXACTLY 0.800 beats, and each comp clears a fifth of a beat before the
 *    next quarter arrives. An earlier four-different-lengths contour measured
 *    worse on the length quantiles it was meant to serve.
 *
 *  - COMP simultaneous-note counts are 3 at 70 %, 4 at 26 %, 2 at 3 % → ALL
 *    FOUR slots declare `all`, and the WIDTH and CEILING rules thin them. That
 *    is the opposite of what this table said first, and the measurement is why.
 *    The earlier table declared `upper-voices` on three of the four slots,
 *    pre-selecting the top `PERFORMANCE_COMP_TARGET_VOICES` = 3 voices; that
 *    produced 8 % four-note comps against the measured 26 % and — worse — it
 *    made the c3 lift the ONE slot with a different bottom voice, so the
 *    comping hand's bottom leapt seven to nine semitones every fourth beat and
 *    back. Stating the written voicing entire, and letting the width rule take
 *    the bottom voice off only where the chord is genuinely two registers wide,
 *    measures 58 % three-note against 42 % four-note (voicing-histogram
 *    divergence 0.157 against 0.184) and cuts the comp's bottom-voice motion
 *    p90 from 4.8 semitones to 3.0. `upper-voices` is not dead: medium-swing@1's
 *    stabs still use it, and it remains the rule for a style whose comping hand
 *    plays a stab rather than a sustained chord.
 *
 *  - COMP pitch range MIDI 45..72, median 60 → `compRegister` at `lowMidi 45`,
 *    `ceilingMidi 73`. This was `lowMidi 49` for as long as the separation law
 *    demanded a minor ninth, which pinned it to the floor
 *    `48 + 13 - 12 = 49` and left the measured register unreachable; with the
 *    separation relaxed to a major third the window is free to be PLACED by the
 *    measurement. It reproduces the reference's comping bottom EXACTLY (45),
 *    its median to within two semitones (62 against 60) and its top to within
 *    one (73 against 72), and it lets the comp cross THREE semitones below the
 *    top of the bass register — min comp − max bass = −3, the reference's own
 *    number — where the minor-ninth law forced +2.
 *
 *    `lowMidi` 44 and 45 against `ceilingMidi` 73, 74 and 75 all measure the
 *    same 0.0745 aggregate, so this is a six-point PLATEAU rather than a fitted
 *    constant. One neighbouring point, `lowMidi 46` with `ceilingMidi 72`,
 *    measures 0.0741 — better — and was REJECTED: its own neighbours measure
 *    0.0753 and 0.0798, so it is a spike fitted to one six-bar chart rather
 *    than a register a style can be published on.
 *
 *  - BASS onsets over the eight eighth-note positions of the bar: 186, 22, 21,
 *    110, 122, 19, 42, 156. Normalized: BEAT 1 .274, and-of-1 .032, beat 2
 *    .031, AND OF 2 .162, BEAT 3 .180, and-of-3 .028, beat 4 .062, AND OF 4
 *    .230. Four positions carry 85 % of the weight — beat 1, the and of 2,
 *    beat 3, the and of 4 — and the DOWNBEAT is the heaviest of them. Those
 *    four are the busy bar's slots; the and-of-1, the smallest of the rest, is
 *    the eighth-pair partner of the downbeat, and it is what carries the
 *    measured length and interval medians (see below).
 *
 *  - BASS note lengths are bimodal, not spread: 50 % last 0.45 beats, 23 %
 *    last 1.35, 8 % last 1.8, 9 % last 3.14, 4 % last 0.9. Median 0.45, mean
 *    1.11, p90 3.14. So the table declares exactly two short lengths and two
 *    long ones: 19/40 of a beat (456 ticks, sounding 432 = 0.45 EXACTLY after
 *    P0's release gap), 3/2 for the half-bar note, and one 7/2 tail in the open
 *    bar for the p90. The half-bar note was 11/8 — 1320 ticks, sounding 1.35
 *    EXACTLY, the measurement's second length mode — and 3/2 measured better:
 *    at 3/2 the clipping law releases it a release gap before the anticipation
 *    instead of a fortieth of a beat before that, which puts the BASS SOUNDING
 *    FRACTION at 0.884 against the reference's 0.893 where 11/8 left it at
 *    0.873. The length mode is a weaker statistic than the sounding fraction —
 *    one is a bucket, the other is every bar — so the sounding fraction wins.
 *
 *  - BASS inter-onset intervals: 49 % are 0.5 beats, 32 % are 1–2 beats, 12 %
 *    are 2–4. Median 0.5, p90 3.5. That is a line that plays eighth pairs and
 *    then leaves a bar-long hole — which is what the two-bar cycle below is
 *    for, and it is why the open bar keeps only its downbeat and its and-of-4.
 *
 *  - BASS attack rate 3.23 per bar against the comp's 3.79, and a per-bar
 *    density coefficient of variation of 0.44 for the bass against 0.24 for
 *    the comp. The bass is the role that breathes; the comp is the role that
 *    keeps time. Hence a bass with two different bars and a comp with one.
 *
 *  - BASS sounding fraction 0.893 of the bar, comp 0.793 → the release lengths
 *    above, which reproduce 0.884 and 0.80.
 *
 *  - BASS pitch range MIDI 28..48, median 35, interquartile range 8, motion
 *    mean 2.92 semitones and motion p90 7 → `PERFORMANCE_BASS_REGISTER`, plus
 *    the `register-floor` PLACEMENT on b1. The window is 21 semitones, so most
 *    pitch classes have two placements and the nearest-to-previous rule chooses
 *    between them; with the anchor low in the window the whole line collapsed
 *    into a four-semitone band, and with it high the line sat in 33..48 — five
 *    semitones ABOVE the measured bottom, because a rule that always minimizes
 *    motion can never make the gesture that reaches the bottom of an
 *    instrument. Declaring b1 `register-floor` — the OPEN BAR'S DOWNBEAT takes
 *    the lowest placement the window admits, and the line walks back up out of
 *    it under the ordinary nearest rule — reproduces the measured bottom (28)
 *    and top (48) EXACTLY and brings the line's motion to 2.73 mean and 6.8 p90
 *    against the measured 2.92 and 7. It costs interquartile range: 4.5 against
 *    the measured 8, because the drop is a gesture rather than a second
 *    register the line lives in. Marking a second slot `register-floor` as
 *    well was measured (0.0747 against 0.0745) and declined: one phrase-start
 *    gesture per open bar is a bass player, five of them a bar is an effect.
 *
 * SWING: NONE, and that is measured too. 671 of the reference bass's 681
 * onsets and 2 572 of its comping instrument's 2 584 fall exactly on the
 * eighth-note grid; nothing is displaced into a swung or triplet position. So
 * `swingRatio` is `PERFORMANCE_STRAIGHT_EIGHTHS` and every offset below is
 * played exactly where it is written. The earlier 9/16 lilt also cost the
 * and-of-2 bass note the ninth of a beat it needs to release before beat 3.
 *
 * THE RELEASE IS THE POINT. The defect this tuning replaces was not a wrong
 * note anywhere: it was that a comp sustained its chord's ENTIRE written length
 * and a bass note rang 1.5 to 4 beats, so every attack smeared into the next
 * and the arrangement was a pad. Both roles now sound for a measured fraction
 * of their window, and `PERFORMANCE_RELEASE_GAP_TICKS` makes the clearance
 * structural wherever the clipping law shortens a slot.
 *
 * THE TWO-BAR CYCLE. `barCycleLength: 2`, so a bar's phase is its written
 * measure index modulo 2. The COMP is identical in both phases because the
 * measurement says it is. The BASS is where the two bars differ: phase 0 is the
 * busy bar and phase 1 is the open one, which is what the measured density
 * variation and the 2–4 beat inter-onset mass are made of.
 * `barCycleVelocityOffsets` eases the whole of phase 1 by 5. The phase is read
 * from the written measure index the compiler already tracks for the bar grid,
 * so it can never drift out of step with the chart the way a running bar
 * counter can. A four-bar cycle was tried TWICE, before and after the
 * register-floor placement existed, and measured worse both times (0.0756
 * against 0.0754).
 *
 * BASS, slot by slot. Offsets are played exactly as written (no swing), and
 * ticks are at PPQ 960.
 *
 * Every slot also declares a PLACEMENT: `nearest` leads the note from the
 * previous bass note, `register-floor` takes the lowest placement the window
 * admits. Exactly one slot declares the second.
 *
 * - b0 — BEAT 1 (offset 0), the ROOT, 19/40 of a beat, `nearest`, PHASE 0,
 *   velocity 92. The heaviest note in the bar and the measured histogram's
 *   tallest position. It is also the slot the ARRIVAL LAW borrows length, tone,
 *   placement and velocity from in a phase-0 bar, because it is the first
 *   phase-0 slot declared — so a chord announces itself with a short, firm root
 *   wherever it begins.
 * - b1 — BEAT 1 (offset 0), the ROOT, 7/2 BEATS, `register-floor`, PHASE 1,
 *   velocity 76. The open bar's whole gesture: the root is struck at the BOTTOM
 *   of the bass register and held to the and of 4, and the line walks back up
 *   out of it. The clipping law cuts it back to the next bass attack, to its
 *   chord's end and to the plan, each less the release gap, so it rings 3.44
 *   beats under a whole-bar chord and stops where a second chord takes the bar.
 *   Its velocity is the one number in this table chosen by RENDERED AUDIO
 *   rather than by the style statistics: at the 90 the other downbeat carries,
 *   this note — the lowest and longest in the arrangement, often below 50 Hz —
 *   put 52.1 % of the mix's energy under 177 Hz and pulled the spectral
 *   centroid to 267 Hz. At 76 the same plan measures 48.3 % and 284 Hz, and the
 *   bass stem sits 0.5 LU over the comp instead of 1.2. The style statistics
 *   are blind to velocity, so this costs the fit nothing and buys back the
 *   whole of the low-end that the phrase gesture spent.
 * - b2 — the AND OF 1 (offset 1/2), the ROOT, 19/40, `nearest`, PHASE 0,
 *   velocity 88. The eighth-pair partner of b0. It is the smallest of the
 *   measured positions and it is here because without it the line's length and
 *   interval medians both sit a full beat above the measurement.
 * - b3 — the AND OF 2 (offset 3/2), the THIRD, 19/40, `nearest`, PHASE 0,
 *   velocity 86. The bar's second-heaviest measured position.
 * - b4 — BEAT 3 (offset 2), the FIFTH, 3/2 BEATS, `nearest`, PHASE 0,
 *   velocity 84. The half-bar, and the long note of the busy bar: it rings to
 *   the anticipation, a release gap short of it.
 * - b5 — the AND OF 4 (offset 7/2), the ROOT, 19/40, `nearest`, BOTH phases,
 *   velocity 80. The anticipation into the next bar, and the only slot the open
 *   bar shares with the busy one.
 *
 * THE TONE CONTOUR — root, root, third, fifth, root — is MEASURED, not chosen.
 * Every assignment of `root`/`third`/`fifth` to b2, b3 and b4 was scored: this
 * one measures 0.0745, all-root measures 0.0992, and the nine others fall
 * between. It is also the plainest thing a bass player does with a bar: state
 * the root, walk up the chord, come back. Every tone is resolved against the
 * SOURCE EVENT'S OWN PITCHES, so no bass note is ever a pitch class the written
 * chord does not sound, and the arrival law overrides the declared tone with
 * the root on the first bass note of every chord.
 *
 * A chord arriving mid-bar always gets a bass note AND its own voicing at its
 * own arrival, and that bass note always sounds the root, so the
 * two-chords-per-bar case announces every change and every change states its
 * harmony; the table never has to describe it.
 *
 * COMP, slot by slot. Every slot is 33/40 of a beat, declares `all`, and sounds
 * in BOTH phases; only the velocity differs. Every comp states the written
 * voicing entire and the WIDTH and CEILING rules thin it where the chord is
 * genuinely two registers wide — see the simultaneous-note measurement above
 * for why that beats pre-selecting three voices.
 *
 * - c0 — BEAT 1 (offset 0), velocity 90. The statement.
 * - c1 — BEAT 2 (offset 1), velocity 78. The softest of the four: the beat the
 *   bass is landing on needs no help.
 * - c2 — BEAT 3 (offset 2), velocity 84. The half-bar, so it is the
 *   second-loudest.
 * - c3 — BEAT 4 (offset 3), velocity 76. The lift into the next bar.
 *
 * VELOCITY is the one thing here that is NOT measured, because it cannot be:
 * the reference sequence is flat — one velocity per instrument for its whole
 * length — so it carries no dynamic information at all. The contour below is
 * therefore kept from the rendered-audio evidence that produced it rather than
 * fitted to anything.
 *
 * WHY THE COMP IS NOT SOFT (measured, 2026-07-29). An earlier contour stated
 * the harmony at 68 against a 92 bass, and rendering the seeded chart to a file
 * proved that unplayable as a balance. The engine normalizes a batch by
 * `outputLevel/sqrt(voiceCount)`, so a ONE-note bass batch already starts 6 dB
 * per voice above a multi-note comp; the 92-against-68 velocity law
 * (`(velocity/127)^1.5`) added 4.4 dB more. Measured on the rendered stems, the
 * single bass note came out 4.3 LU LOUDER than the entire comp, 59 % of the
 * arrangement's energy sat below 177 Hz (11 % for the same chart played
 * literally), and the spectral centroid fell to 282 Hz against the literal
 * chart's 608 Hz: a boom with the harmony buried under it. That finding is
 * preserved here — the comp's statement is still 90, on the bright side of the
 * rendered instrument's own 89-velocity sample-layer boundary, and the three
 * inner comps sit just under it on the softer layer, so the bar's first chord
 * speaks and its continuations answer. The loudest comp (90) still sits under
 * the loudest bass (92).
 *
 * COMP REGISTER. `compRegister` places the comping hand's bottom voice at
 * A2..Ab3 (45..56), with Ab4 (68) the highest that voice may reach after a
 * separation lift and Db5 (73) the hard ceiling for any voice. The ceiling is
 * deliberately tight: 79, 84 and the original 88 were all measured, and each
 * pushed the comp's pitch maximum well above the reference's 72 AND cost
 * voices, because a ceiling that lets a wide voicing stay wide keeps its bottom
 * an octave down — which is where the comping hand's bar-to-bar leaps came
 * from. The chart's own voicings are untouched: the surviving voices are
 * octave-transposed together, so the harmony, the intervals and the spelling
 * that reached this layer are exactly the harmony, intervals and spelling that
 * sound.
 *
 * NO-OVERLAP, per role, at PPQ 960, for a chord that owns a whole phase-0 bar
 * (each interval is [attack, release), and every gap is real):
 *  - bass: b0 [0, 456), b2 [480, 936), b3 [1440, 1896), b4 [1920, 3330),
 *    b5 [3360, 3816).
 *  - comp: c0 [0, 792), c1 [960, 1752), c2 [1920, 2712), c3 [2880, 3672).
 * In a phase-1 bar the bass is b1 [0, 3330) and b5 [3360, 3816).
 * b4 is the one slot the clipping law shortens here: it declares 3/2 beats,
 * which would end exactly on b5's attack, so it is released
 * `PERFORMANCE_RELEASE_GAP_TICKS` early at 3330.
 *
 * A chord arriving mid-bar adds one bass and one comp at its own start, each
 * clipped by whatever attacks next in its own role, so the law holds there too.
 */
const BALLAD_COMP_V1: PerformanceStyle = Object.freeze({
  id: "ballad-comp@1",
  kind: "band-sketch",
  meter: Object.freeze({ beatsPerBar: 4, beatUnit: 4 }),
  bassSlots: Object.freeze([
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 0, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 19, denominator: 40 }),
      tone: "root",
      placement: "nearest",
      velocity: 92,
      cyclePhases: Object.freeze([0] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 0, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 7, denominator: 2 }),
      tone: "root",
      placement: "register-floor",
      velocity: 76,
      cyclePhases: Object.freeze([1] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 1, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 19, denominator: 40 }),
      tone: "root",
      placement: "nearest",
      velocity: 88,
      cyclePhases: Object.freeze([0] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 3, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 19, denominator: 40 }),
      tone: "third",
      placement: "nearest",
      velocity: 86,
      cyclePhases: Object.freeze([0] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 2, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 3, denominator: 2 }),
      tone: "fifth",
      placement: "nearest",
      velocity: 84,
      cyclePhases: Object.freeze([0] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 7, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 19, denominator: 40 }),
      tone: "root",
      placement: "nearest",
      velocity: 80,
      cyclePhases: Object.freeze([0, 1] as const),
    }),
  ] as const),
  compSlots: Object.freeze([
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 0, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 33, denominator: 40 }),
      voicing: "all",
      velocity: 90,
      cyclePhases: Object.freeze([0, 1] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 1, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 33, denominator: 40 }),
      voicing: "all",
      velocity: 78,
      cyclePhases: Object.freeze([0, 1] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 2, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 33, denominator: 40 }),
      voicing: "all",
      velocity: 84,
      cyclePhases: Object.freeze([0, 1] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 3, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 33, denominator: 40 }),
      voicing: "all",
      velocity: 76,
      cyclePhases: Object.freeze([0, 1] as const),
    }),
  ] as const),
  compRegister: Object.freeze({
    lowMidi: 45,
    highMidi: 68,
    ceilingMidi: 73,
  }),
  bassRegister: null,
  barCycleLength: 2,
  barCycleVelocityOffsets: Object.freeze([0, -5] as const),
  swingRatio: Object.freeze({ numerator: 1, denominator: 2 }),
  description:
    "Jazz-rock ballad: short comping on every quarter, straight, over a bass "
    + "that plays eighth pairs on the downbeat and the and-of-2 in the busy "
    + "bar and holds the root through the open one — every note releasing "
    + "before the next attack.",
});

/**
 * medium-swing@1 — a walking-quarter bass under Charleston comping.
 *
 * - Bass on every beat, 9/10 of a beat each, so each note releases just before
 *   the next attacks and the line reads as walking rather than as a drone.
 *   Root, fifth, third, fifth is the plainest honest walk that never needs a
 *   chord tone the written chord does not contain.
 * - Comps on the "and of 2" and the "and of 4" (offsets 3/2 and 7/2), 9/20 of
 *   a beat each: the Charleston figure. The second stab releases at 3.95
 *   beats, inside the bar.
 * - Velocities keep the bar's weight on beat 1 and put both comps under every
 *   bass note.
 * - `compRegister` puts the stabs' bottom voice at C4..B4 — a right hand
 *   directly above middle C, which is where a Charleston figure over a walking
 *   line sits. It is a whole tone above the ballad's window because a walking
 *   bass is busy across the whole bass register and a short stab has to stay
 *   clear of all four of its quarters, not just the downbeat.
 * - Its `upper-voices` stabs are three voices, like every other comp in this
 *   package: `PERFORMANCE_COMP_TARGET_VOICES` is a package-wide rule, not a
 *   ballad one. For the four-note voicings the studio's Auto policy generates
 *   this is exactly the behaviour this style already had.
 * - One bar, one pattern (`barCycleLength: 1`), and straight eighths. A walk
 *   is meant to be relentless, and the published identity of this style is
 *   what it already sounds like: adding a two-bar cycle or a swing ratio here
 *   would silently redefine a style id other evidence is pinned to. A swung
 *   variant belongs to a new version of the id, not to this one.
 */
const MEDIUM_SWING_V1: PerformanceStyle = Object.freeze({
  id: "medium-swing@1",
  kind: "band-sketch",
  meter: Object.freeze({ beatsPerBar: 4, beatUnit: 4 }),
  bassSlots: Object.freeze([
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 0, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 9, denominator: 10 }),
      tone: "root",
      placement: "nearest",
      velocity: 94,
      cyclePhases: Object.freeze([0] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 1, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 9, denominator: 10 }),
      tone: "fifth",
      placement: "nearest",
      velocity: 82,
      cyclePhases: Object.freeze([0] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 2, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 9, denominator: 10 }),
      tone: "third",
      placement: "nearest",
      velocity: 88,
      cyclePhases: Object.freeze([0] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 3, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 9, denominator: 10 }),
      tone: "fifth",
      placement: "nearest",
      velocity: 82,
      cyclePhases: Object.freeze([0] as const),
    }),
  ] as const),
  compSlots: Object.freeze([
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 3, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 9, denominator: 20 }),
      voicing: "upper-voices",
      velocity: 74,
      cyclePhases: Object.freeze([0] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 7, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 9, denominator: 20 }),
      voicing: "upper-voices",
      velocity: 80,
      cyclePhases: Object.freeze([0] as const),
    }),
  ] as const),
  compRegister: Object.freeze({
    lowMidi: 60,
    highMidi: 83,
    ceilingMidi: 88,
  }),
  bassRegister: null,
  barCycleLength: 1,
  barCycleVelocityOffsets: Object.freeze([0] as const),
  swingRatio: PERFORMANCE_STRAIGHT_EIGHTHS,
  description:
    "Medium swing: walking quarter-note bass under Charleston comp stabs on "
    + "the and-of-2 and the and-of-4.",
});

/**
 * bossa-nova@1 — the bossa sketch: an unvarying two-beat bass ostinato under
 * a two-bar syncopated comp figure.
 *
 * What makes a bossa a bossa in this vocabulary is the division of labour:
 * the BASS is a constant — the same root-and-fifth ostinato in every bar,
 * modelled on the surdo's two strokes per half-bar — while the COMP carries
 * the two-bar syncopation, the partido-alto shape of chord hits displaced
 * onto offbeats and answered across the barline. That is the inverse of the
 * ballad, where the bass breathes and the comp keeps time, and it is why
 * both tables below look the way they do.
 *
 * - BASS, both phases identically (an ostinato does not know what bar it is
 *   in): root on beat 1 held to the and-of-2 (3/2), fifth on the and-of-2
 *   (1/2), root on beat 3 held to the and-of-4 (3/2), fifth on the and-of-4
 *   (19/40, releasing at 3.975 inside the bar). Adjacent notes are declared
 *   contiguous and the clipping law's release gap supplies the articulation,
 *   exactly as the ballad's b4/b5 pair already proves out.
 * - COMP, phase 0: the statement bar — beat 1 (3/4), the and-of-2 (1/2), the
 *   and-of-3 (1/2). Phase 1: the answer bar — the and-of-1 (1/2), beat 3
 *   (3/4), the and-of-4 (19/40, the anticipation into the next phase-0 bar).
 *   Six hits across two bars with real rests between them; `upper-voices`
 *   throughout, because a bossa guitar states a clipped top of the chord,
 *   not a sustained pad.
 * - `compRegister` sits five semitones above the ballad's window (50..73,
 *   ceiling 78): the comp shares no beat with the bass's strong strokes and
 *   a bossa's chord hand sits higher than a ballad's sustaining one.
 * - Straight eighths (`PERFORMANCE_STRAIGHT_EIGHTHS`): bossa is played
 *   straight; the lilt is written into WHERE the hits fall, never into a
 *   swung displacement.
 * - `barCycleVelocityOffsets` eases the answer bar by 3, the small
 *   phase-to-phase lean the two-bar figure implies.
 */
const BOSSA_NOVA_V1: PerformanceStyle = Object.freeze({
  id: "bossa-nova@1",
  kind: "band-sketch",
  meter: Object.freeze({ beatsPerBar: 4, beatUnit: 4 }),
  bassSlots: Object.freeze([
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 0, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 3, denominator: 2 }),
      tone: "root",
      placement: "nearest",
      velocity: 90,
      cyclePhases: Object.freeze([0, 1] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 3, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 1, denominator: 2 }),
      tone: "fifth",
      placement: "nearest",
      velocity: 76,
      cyclePhases: Object.freeze([0, 1] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 2, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 3, denominator: 2 }),
      tone: "root",
      placement: "nearest",
      velocity: 84,
      cyclePhases: Object.freeze([0, 1] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 7, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 19, denominator: 40 }),
      tone: "fifth",
      placement: "nearest",
      velocity: 78,
      cyclePhases: Object.freeze([0, 1] as const),
    }),
  ] as const),
  compSlots: Object.freeze([
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 0, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 3, denominator: 4 }),
      voicing: "upper-voices",
      velocity: 80,
      cyclePhases: Object.freeze([0] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 3, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 1, denominator: 2 }),
      voicing: "upper-voices",
      velocity: 72,
      cyclePhases: Object.freeze([0] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 5, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 1, denominator: 2 }),
      voicing: "upper-voices",
      velocity: 76,
      cyclePhases: Object.freeze([0] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 1, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 1, denominator: 2 }),
      voicing: "upper-voices",
      velocity: 74,
      cyclePhases: Object.freeze([1] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 2, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 3, denominator: 4 }),
      voicing: "upper-voices",
      velocity: 78,
      cyclePhases: Object.freeze([1] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 7, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 19, denominator: 40 }),
      voicing: "upper-voices",
      velocity: 72,
      cyclePhases: Object.freeze([1] as const),
    }),
  ] as const),
  compRegister: Object.freeze({
    lowMidi: 50,
    highMidi: 73,
    ceilingMidi: 78,
  }),
  bassRegister: null,
  barCycleLength: 2,
  barCycleVelocityOffsets: Object.freeze([0, -3] as const),
  swingRatio: PERFORMANCE_STRAIGHT_EIGHTHS,
  description:
    "Bossa nova: a constant root-and-fifth ostinato bass under a two-bar "
    + "syncopated comp figure with the anticipation on the answer bar's "
    + "and-of-4.",
});

/**
 * straight-eighths@1 — the pop/rock sketch: even keyboard comping with
 * space, over roots anchored on beats 1 and 3.
 *
 * The identity of a straight-eighths pop groove is REGULARITY with an accent
 * contour, not syncopation: the comp states the chord on the strong beats
 * and answers on chosen offbeats, every hit exactly where it is written, and
 * the accent shape — statement loudest, answers under it — is what keeps a
 * grid from sounding like a metronome.
 *
 * - BASS: the pop anchor — the root on beat 1 (9/10, the walking length that
 *   releases before the next quarter) and again on beat 3, both phases; and
 *   in the SECOND bar of the cycle only, a fifth pickup on the and-of-4
 *   (19/40) leading back to the downbeat. One gesture per two bars, so the
 *   pickup reads as a fill rather than a habit.
 * - COMP: four hits a bar, both phases — beat 1 (3/4), the and-of-2 (1/2),
 *   beat 3 (3/4), beat 4 (1/2) — with `all` voicing throughout: a pop
 *   keyboard states whole chords, and the package's width and ceiling rules
 *   thin only what is genuinely two registers wide. The and-of-2 is the one
 *   offbeat in the figure; beats 2 and the and-of-1/-3/-4 are real rests.
 * - Accent contour 86 / 74 / 80 / 72: the statement, the offbeat under it,
 *   the half-bar restatement, the lift into the next bar.
 * - `compRegister` 48..71 (ceiling 76): a keyboard part centred a fourth
 *   below the swing stabs and a third above the ballad's sustaining hand.
 * - Two-bar cycle only because the bass pickup needs a phase to live in;
 *   `barCycleVelocityOffsets` eases bar two by 4.
 */
const STRAIGHT_EIGHTHS_V1: PerformanceStyle = Object.freeze({
  id: "straight-eighths@1",
  kind: "band-sketch",
  meter: Object.freeze({ beatsPerBar: 4, beatUnit: 4 }),
  bassSlots: Object.freeze([
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 0, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 9, denominator: 10 }),
      tone: "root",
      placement: "nearest",
      velocity: 92,
      cyclePhases: Object.freeze([0, 1] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 2, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 9, denominator: 10 }),
      tone: "root",
      placement: "nearest",
      velocity: 86,
      cyclePhases: Object.freeze([0, 1] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 7, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 19, denominator: 40 }),
      tone: "fifth",
      placement: "nearest",
      velocity: 78,
      cyclePhases: Object.freeze([1] as const),
    }),
  ] as const),
  compSlots: Object.freeze([
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 0, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 3, denominator: 4 }),
      voicing: "all",
      velocity: 86,
      cyclePhases: Object.freeze([0, 1] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 3, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 1, denominator: 2 }),
      voicing: "all",
      velocity: 74,
      cyclePhases: Object.freeze([0, 1] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 2, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 3, denominator: 4 }),
      voicing: "all",
      velocity: 80,
      cyclePhases: Object.freeze([0, 1] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 3, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 1, denominator: 2 }),
      voicing: "all",
      velocity: 72,
      cyclePhases: Object.freeze([0, 1] as const),
    }),
  ] as const),
  compRegister: Object.freeze({
    lowMidi: 48,
    highMidi: 71,
    ceilingMidi: 76,
  }),
  bassRegister: null,
  barCycleLength: 2,
  barCycleVelocityOffsets: Object.freeze([0, -4] as const),
  swingRatio: PERFORMANCE_STRAIGHT_EIGHTHS,
  description:
    "Straight-eighths pop: even keyboard comping with an accent contour and "
    + "real rests, over roots on beats 1 and 3 with a fifth pickup every "
    + "second bar.",
});

/**
 * syncopated-sixteenths@1 — the measured late-seventies pop-funk groove.
 *
 * WHY THIS STYLE EXISTS. The owner-directed "What a Fool Believes" library
 * entry (studio-progression-library.ts, 2026-07-31) is a mid-tempo pop-funk
 * tune (120 BPM), and none of the other styles can state it. The style is
 * named for the idiom, never for any song.
 *
 * WHERE THESE NUMBERS COME FROM — a measured campaign, not an authored
 * guess. The first version of this table was written to the documented
 * character of the idiom (dotted-eighth statements pushed by sub-eighth
 * sixteenth attacks) and the owner rejected it by ear. The table below is
 * the result of the render-and-compare discipline the Deacon Blues work
 * established: a 68-dimension aggregate-statistics comparison (onset
 * histograms, IOI and duration quantiles, polyphony, voicing sizes,
 * registers, motion, rest structure, per-bar density) between this engine's
 * emitted performance plan for the entry's chart and an owner-supplied
 * reference sequence of the flagship recording, iterated through six
 * designed rounds and roughly 250 scored evaluations until the aggregate
 * divergence fell from 0.327 to 0.101 — and then the owner rejected THAT
 * too, and directed the final authority: the reference's own dominant bar
 * patterns, transcribed. The table below IS those patterns: the verse
 * riff (beat 1, and-of-1, beat 2, and-of-2, then the lone and-of-3) in
 * third-beat stabs with the measured accent contour, the two-note
 * resting bass vamp with its octave drop, and one active walk bar in
 * four. The aggregate (0.165 — the whole-song average disagrees with the
 * verse figure, and the ear outranks the average) is a sanity floor, not
 * the target. Only aggregate
 * statistics were ever read from the reference; no note sequence, interval
 * series, or any derivative of its note data is stored here or anywhere in
 * this repository, and the reference file itself is gitignored.
 *
 * WHAT THE MEASUREMENT OVERTURNED. The authored table's whole identity —
 * attacks a sixteenth off the eighth grid — is NOT how the reference
 * plays: its attack mass sits entirely ON the eighth grid, and the
 * syncopation lives in WHICH eighths sound, the accent contour, and the
 * rests. The original unit suite froze the sub-eighth claim as law;
 * measurement contradicted it, so the law changed and the suite records
 * the contradiction (the Deacon Blues rule: when a self-authored law
 * contradicts measurement, change the law).
 *
 * THE SHAPE, in reference statistics:
 *  - FOUR-BAR CYCLE (`barCycleLength` 4), because the reference's per-bar
 *    density varies (CV 0.39 bass); two of the phases are dense, one bar
 *    is a near-solo bass whole note, and phase 3's comp is a single held
 *    pedal chord — the one bar where nothing truncates it.
 *  - BASS: ~3.7 attacks per bar with real rests (sounding ratio ~0.47),
 *    duration median ~0.44 beats, IOI median 0.5 with gaps up to 3.5,
 *    register 43..61 (a pop electric bass, an octave above the package's
 *    jazz register — hence the per-style `bassRegister`), and octave-scale
 *    motion from `register-floor` drops on three phases.
 *  - COMP: ~5 attacks per bar on the eighth grid, duration median ~0.37,
 *    a voicing-size mix (all/upper-voices/guide-tones/top-voice) matching
 *    the reference's 1..4-note right-hand distribution, register 60..83
 *    (ceiling 94), and a moving top line from the thinner voicings.
 *
 * KNOWN STRUCTURAL DIVERGENCES, accepted deliberately: the reference's
 * ~19-beat pedal (slots are bar-scoped; ours holds 4), its occasional
 * right-hand dips below the bass ceiling (this package's separation law
 * forbids comp under the bass on purpose), and its right-hand peak at
 * MIDI 94 (the document's pinned Auto voicing range tops at 84).
 *
 * The velocity contour keeps the loudest comp under the loudest bass, and
 * `barCycleVelocityOffsets` leans phase 0 and eases the others.
 */
const SYNCOPATED_SIXTEENTHS_V1: PerformanceStyle = Object.freeze({
  id: "syncopated-sixteenths@1",
  kind: "band-sketch",
  meter: Object.freeze({ beatsPerBar: 4, beatUnit: 4 }),
  bassSlots: Object.freeze([
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 0, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 7, denominator: 16 }),
      tone: "root",
      placement: "nearest",
      velocity: 88,
      cyclePhases: Object.freeze([0] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 1, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 3, denominator: 8 }),
      tone: "root",
      placement: "register-floor",
      velocity: 92,
      cyclePhases: Object.freeze([0] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 0, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 7, denominator: 16 }),
      tone: "root",
      placement: "nearest",
      velocity: 88,
      cyclePhases: Object.freeze([1] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 1, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 3, denominator: 8 }),
      tone: "root",
      placement: "nearest",
      velocity: 92,
      cyclePhases: Object.freeze([1] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 0, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 7, denominator: 16 }),
      tone: "root",
      placement: "nearest",
      velocity: 88,
      cyclePhases: Object.freeze([2] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 1, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 3, denominator: 8 }),
      tone: "root",
      placement: "register-floor",
      velocity: 92,
      cyclePhases: Object.freeze([2] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 0, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 7, denominator: 16 }),
      tone: "root",
      placement: "nearest",
      velocity: 92,
      cyclePhases: Object.freeze([3] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 1, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 1, denominator: 2 }),
      tone: "root",
      placement: "register-floor",
      velocity: 84,
      cyclePhases: Object.freeze([3] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 3, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 1, denominator: 2 }),
      tone: "root",
      placement: "nearest",
      velocity: 84,
      cyclePhases: Object.freeze([3] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 5, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 3, denominator: 8 }),
      tone: "third",
      placement: "nearest",
      velocity: 78,
      cyclePhases: Object.freeze([3] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 7, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 3, denominator: 8 }),
      tone: "root",
      placement: "nearest",
      velocity: 66,
      cyclePhases: Object.freeze([3] as const),
    }),
  ] as const),
  compSlots: Object.freeze([
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 0, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 1, denominator: 3 }),
      voicing: "all",
      velocity: 89,
      cyclePhases: Object.freeze([0] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 1, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 1, denominator: 3 }),
      voicing: "guide-tones",
      velocity: 63,
      cyclePhases: Object.freeze([0] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 1, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 1, denominator: 3 }),
      voicing: "upper-voices",
      velocity: 80,
      cyclePhases: Object.freeze([0] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 3, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 1, denominator: 3 }),
      voicing: "upper-voices",
      velocity: 87,
      cyclePhases: Object.freeze([0] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 5, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 1, denominator: 3 }),
      voicing: "upper-voices",
      velocity: 90,
      cyclePhases: Object.freeze([0] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 0, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 3, denominator: 8 }),
      voicing: "upper-voices",
      velocity: 85,
      cyclePhases: Object.freeze([1] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 1, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 1, denominator: 3 }),
      voicing: "guide-tones",
      velocity: 72,
      cyclePhases: Object.freeze([1] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 1, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 3, denominator: 8 }),
      voicing: "upper-voices",
      velocity: 87,
      cyclePhases: Object.freeze([1] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 2, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 3, denominator: 8 }),
      voicing: "upper-voices",
      velocity: 89,
      cyclePhases: Object.freeze([1] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 3, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 3, denominator: 8 }),
      voicing: "upper-voices",
      velocity: 90,
      cyclePhases: Object.freeze([1] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 0, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 1, denominator: 3 }),
      voicing: "all",
      velocity: 89,
      cyclePhases: Object.freeze([2] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 1, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 1, denominator: 3 }),
      voicing: "guide-tones",
      velocity: 63,
      cyclePhases: Object.freeze([2] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 1, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 1, denominator: 3 }),
      voicing: "upper-voices",
      velocity: 80,
      cyclePhases: Object.freeze([2] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 3, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 1, denominator: 3 }),
      voicing: "upper-voices",
      velocity: 87,
      cyclePhases: Object.freeze([2] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 5, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 1, denominator: 3 }),
      voicing: "upper-voices",
      velocity: 90,
      cyclePhases: Object.freeze([2] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 0, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 1, denominator: 3 }),
      voicing: "all",
      velocity: 86,
      cyclePhases: Object.freeze([3] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 1, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 1, denominator: 3 }),
      voicing: "guide-tones",
      velocity: 60,
      cyclePhases: Object.freeze([3] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 1, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 1, denominator: 3 }),
      voicing: "upper-voices",
      velocity: 77,
      cyclePhases: Object.freeze([3] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 3, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 1, denominator: 3 }),
      voicing: "upper-voices",
      velocity: 84,
      cyclePhases: Object.freeze([3] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 5, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 1, denominator: 3 }),
      voicing: "upper-voices",
      velocity: 87,
      cyclePhases: Object.freeze([3] as const),
    }),
  ] as const),
  compRegister: Object.freeze({
    lowMidi: 65,
    highMidi: 88,
    ceilingMidi: 94,
  }),
  bassRegister: Object.freeze({ lowMidi: 41, highMidi: 61, anchorMidi: 54 }),
  barCycleLength: 4,
  barCycleVelocityOffsets: Object.freeze([0, -2, -1, -3] as const),
  swingRatio: PERFORMANCE_STRAIGHT_EIGHTHS,
  description:
    "Measured pop-funk: eighth-grid comping with a moving top line and a "
    + "pedal bar, over a resting, octave-leaping electric bass in its own "
    + "register — fitted to reference statistics, not authored.",
});

/**
 * block-chords@1 — the identity style.
 *
 * It declares no slots and the compiler returns the input plan itself, so the
 * literal renderer P0 already produces stays reachable, selectable and
 * testable rather than becoming dead code behind a flag.
 *
 * `compRegister: null`. The identity style emits nothing of its own, so it has
 * no comping hand to place; the written chart's registers are the chart's own
 * and this style must return them byte-identical.
 */
const BLOCK_CHORDS_V1: PerformanceStyle = Object.freeze({
  id: "block-chords@1",
  kind: "literal",
  meter: Object.freeze({ beatsPerBar: 4, beatUnit: 4 }),
  bassSlots: Object.freeze([] as const),
  compSlots: Object.freeze([] as const),
  compRegister: null,
  bassRegister: null,
  barCycleLength: 1,
  barCycleVelocityOffsets: Object.freeze([0] as const),
  swingRatio: PERFORMANCE_STRAIGHT_EIGHTHS,
  description:
    "Literal passthrough: the written chart exactly as P0 compiled it.",
});

export const PERFORMANCE_STYLES: Readonly<
  Record<PerformanceStyleId, PerformanceStyle>
> = Object.freeze({
  "ballad-comp@1": BALLAD_COMP_V1,
  "medium-swing@1": MEDIUM_SWING_V1,
  "bossa-nova@1": BOSSA_NOVA_V1,
  "straight-eighths@1": STRAIGHT_EIGHTHS_V1,
  "syncopated-sixteenths@1": SYNCOPATED_SIXTEENTHS_V1,
  "block-chords@1": BLOCK_CHORDS_V1,
});

export const PERFORMANCE_PLAN_REFUSAL_CODES = Object.freeze([
  "performance.style_unknown",
  "performance.style_table_invalid",
  "performance.meter_unsupported",
  "performance.loop_unsupported",
  "performance.source_event_invalid",
  "performance.event_id_invalid",
  "performance.emitted_event_invalid",
  "performance.no_events_emitted",
  "limit.performance_plan_work_exceeded",
] as const);
export type PerformancePlanRefusalCode =
  (typeof PERFORMANCE_PLAN_REFUSAL_CODES)[number];

export const PERFORMANCE_PLAN_TERMINATIONS = Object.freeze([
  "complete",
  "identity",
  "style-invalid",
  "plan-unsupported",
  "source-invalid",
  "emission-invalid",
  "work-limit-exceeded",
] as const);
export type PerformancePlanTermination =
  (typeof PERFORMANCE_PLAN_TERMINATIONS)[number];

/**
 * Deterministic ceilings. A chart at P0's own maximum can produce at most one
 * emitted event per slot per bar it touches, so these bound the layer without
 * ever consulting a clock.
 */
export const MAX_PERFORMANCE_PLAN_SOURCE_EVENTS = 8_192;
export const MAX_PERFORMANCE_PLAN_BARS_VISITED = 65_536;
export const MAX_PERFORMANCE_PLAN_SLOTS_CONSIDERED = 262_144;
export const MAX_PERFORMANCE_PLAN_EVENTS = 65_536;

export const PERFORMANCE_PLAN_WORK_LIMITS = Object.freeze({
  sourceEventsVisited: MAX_PERFORMANCE_PLAN_SOURCE_EVENTS,
  barsVisited: MAX_PERFORMANCE_PLAN_BARS_VISITED,
  slotsConsidered: MAX_PERFORMANCE_PLAN_SLOTS_CONSIDERED,
  eventsProduced: MAX_PERFORMANCE_PLAN_EVENTS,
} as const);

export type PerformancePlanWorkCounterName =
  keyof typeof PERFORMANCE_PLAN_WORK_LIMITS;

export type PerformancePlanWorkEvidence = Readonly<{
  sourceEventsVisited: number;
  barsVisited: number;
  slotsConsidered: number;
  eventsProduced: number;
  termination: PerformancePlanTermination;
}>;

export type PerformancePlanRefusal = Readonly<{
  code: PerformancePlanRefusalCode;
  styleId: PerformanceStyleId;
  /** The source event the refusal is about, or null for a plan-level fact. */
  eventId: string | null;
  /** One machine-readable detail; never a sentence the UI would render. */
  detail: string;
}>;

export type CompilePerformancePlanRequest = Readonly<{
  /** A compiled, structurally valid P0 plan. */
  plan: PlaybackPlan;
  styleId: PerformanceStyleId;
}>;

export type CompilePerformancePlanSuccess = Readonly<{
  ok: true;
  plan: PlaybackPlan;
  evidence: PerformancePlanWorkEvidence;
}>;

export type CompilePerformancePlanFailure = Readonly<{
  ok: false;
  refusal: PerformancePlanRefusal;
  evidence: PerformancePlanWorkEvidence;
}>;

export type CompilePerformancePlanResult =
  | CompilePerformancePlanSuccess
  | CompilePerformancePlanFailure;

export type CompilePerformancePlan = (
  request: CompilePerformancePlanRequest,
) => CompilePerformancePlanResult;
