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
 * Which subset of the source voicing a comp slot sounds.
 *
 * `upper-voices` drops the lowest voice when the voicing has four or more,
 * because a bass slot is already sounding that pitch class two or three
 * octaves down and doubling it in the comp muddies the middle.
 */
export const PERFORMANCE_COMP_VOICINGS = Object.freeze([
  "upper-voices",
  "all",
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
 * MIDI 33..52 is A1..E3 — the working register of an upright bass, and two to
 * three octaves below the 48..84 window the studio's default Auto voicing
 * policy uses. Choosing the octave nearest the previous bass note produces a
 * stepwise line instead of a sequence of leaps, which is what delivers the
 * bass-register goal of bead jcpe-26u1 *without touching the pinned A0/U1
 * voicing policy*: the chart's voicings are untouched and only this layer's
 * derived bass voice is placed here.
 *
 * The anchor is where the very first bass note of a plan is placed from, since
 * there is no previous note to move from. E2 (40) sits in the middle of the
 * register and is a natural resting point for a bass line.
 */
export const PERFORMANCE_BASS_REGISTER = Object.freeze({
  lowMidi: 33,
  highMidi: 52,
  anchorMidi: 40,
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
 * A minor ninth. Every comp voice sounds at least this far above the bass note
 * sounding under it, so the comp is never in unison with the bass, never below
 * it, and never crowding it at the octave. Thirteen rather than twelve because
 * an octave doubling of the bass in the comp's bottom voice is exactly the
 * thickening the `upper-voices` rule already exists to avoid.
 */
export const PERFORMANCE_COMP_BASS_SEPARATION_SEMITONES = 13;

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
  "block-chords@1",
] as const);
export type PerformanceStyleId = (typeof PERFORMANCE_STYLE_IDS)[number];

/**
 * ballad-comp@1 — the reviewed HALF-TIME jazz-rock ballad sketch.
 *
 * The feel this table is written for: 4/4 at roughly 116 BPM, but *heard* at
 * half that, because the weight of the bar is the backbeat on beat 3 rather
 * than an even 1-and-3 pulse. Everything below follows from that one fact. It
 * is a general style rule, not a transcription of any recording.
 *
 * THE TWO-BAR CYCLE. `barCycleLength: 2`, so a bar's phase is its written
 * measure index modulo 2. Phase 0 is the "full" bar; phase 1 is the open one.
 * A band does not play the same bar twice in a row, and a sketch that does is
 * audibly a machine. The phase is read from the written measure index the
 * compiler already tracks for the bar grid, so it can never drift out of step
 * with the chart the way a running bar counter can.
 *
 * BASS.
 *
 * - Slot b0 — beat 1, the root, declared to ring a full 4 beats, in BOTH
 *   phases, velocity 92 (the heaviest event in the bar). The half-time
 *   downbeat: it states the harmony and then holds. The declared length is
 *   deliberately longer than any bar: the compiler's clipping law cuts it to
 *   the next bass attack, so in a phase-0 bar it rings 2.5 beats up to the
 *   and-of-3 answer, and in a phase-1 bar — where nothing answers it — it
 *   rings the whole bar. One declaration, two lengths, no special case.
 * - Slot b1 — the AND of 3 (offset 5/2), the fifth, 3/2 beats, phase 0 only,
 *   velocity 74. This is the half-time push: the second bass note of the bar
 *   arrives a half-beat LATE relative to the backbeat, which is what makes the
 *   bar lean instead of plod. Landing it squarely on beat 3 would restore the
 *   even 1-and-3 pattern this style exists to avoid. It ends at 4 beats and is
 *   clipped at the bar line. Its swung placement (see `swingRatio`) sits it
 *   even further back.
 *
 * A chord arriving mid-bar always gets a bass note AND its own voicing at its
 * own arrival, and that bass note always sounds the root, so the
 * two-chords-per-bar case announces every change and every change states its
 * harmony; the table never has to describe it.
 *
 * COMP. The rule is that a chord is heard as a chord, and then the comp
 * breathes: it never stabs on every beat and every phase contains real rests.
 *
 * - Slot c0 — beat 1 (offset 0), declared to ring a full 4 beats, voicing
 *   `all`, in BOTH phases, velocity 68. The harmony itself, stated with the
 *   downbeat bass and left to ring. Like b0 the declared length is longer than
 *   any bar on purpose: the clipping law cuts it to the next comp attack, to
 *   the chord's own end, and to the plan, so it rings 2.5 beats in a phase-0
 *   bar, the whole bar in a phase-1 one, and exactly the chord's own length
 *   when two chords share a bar. One declaration, three lengths, no special
 *   case.
 * - Slot c1 — the AND of 3 (offset 5/2), 3/2 beats, `upper-voices`, phase 0
 *   only, velocity 58 (the softest thing in the bar). The soft answer: it
 *   arrives with the half-time push in the bass, drops the voice the bass is
 *   already sounding, and holds to the bar line. A phase-1 bar has no answer at
 *   all — that silence is the point.
 *
 * VELOCITY. A player does not hit every chord the same. Beyond the per-slot
 * contour — downbeat bass 92, and-of-3 bass 74, stated harmony 68, and-of-3
 * answer 58 — `barCycleVelocityOffsets` eases the whole of phase 1 by 5. The
 * open bar is also the quieter bar. Every value stays an integer inside 1..127,
 * and every comp sits under the downbeat bass.
 *
 * COMP REGISTER. `compRegister` places the comping hand at Bb3..A4 (58..69)
 * for its bottom voice, with A5+ (81) the highest that voice may reach after a
 * separation lift and C6 (88) the hard ceiling for any voice. Bb3 is a fifth
 * above the top of the bass register, which is what makes one octave of lift
 * always enough (see `PerformanceCompRegister`), and it is where a pianist's
 * comping actually sits under a melody: low enough to have body, high enough
 * to stay out of the bass. The chart's own voicings are untouched — the whole
 * voicing is octave-transposed together, so the harmony, the intervals and the
 * spelling that reached this layer are exactly the harmony, intervals and
 * spelling that sound.
 *
 * SWING. `swingRatio: 9/16` — 0.5625, a laid-back lilt rather than a triplet.
 * At PPQ 960 the offbeat eighth moves from tick 480 to tick 540 of its beat,
 * exactly, with no rounding. Only offsets exactly halfway through a beat move:
 * b1 and c1 (both the and of 3) are displaced; b0 and c0 are on the beat and
 * are untouched.
 *
 * NO-OVERLAP, per role, after swing at PPQ 960, for a chord that owns a whole
 * bar:
 *  - phase 0 bass: b0 [0, 2460) after clipping, b1 [2460, 3840).
 *  - phase 0 comp: c0 [0, 2460) after clipping, c1 [2460, 3840).
 *  - phase 1 bass: b0 [0, bar line).
 *  - phase 1 comp: c0 [0, bar line).
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
      durationBeats: Object.freeze({ numerator: 4, denominator: 1 }),
      tone: "root",
      velocity: 92,
      cyclePhases: Object.freeze([0, 1] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 5, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 3, denominator: 2 }),
      tone: "fifth",
      velocity: 74,
      cyclePhases: Object.freeze([0] as const),
    }),
  ] as const),
  compSlots: Object.freeze([
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 0, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 4, denominator: 1 }),
      voicing: "all",
      velocity: 68,
      cyclePhases: Object.freeze([0, 1] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 5, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 3, denominator: 2 }),
      voicing: "upper-voices",
      velocity: 58,
      cyclePhases: Object.freeze([0] as const),
    }),
  ] as const),
  compRegister: Object.freeze({
    lowMidi: 58,
    highMidi: 81,
    ceilingMidi: 88,
  }),
  barCycleLength: 2,
  barCycleVelocityOffsets: Object.freeze([0, -5] as const),
  swingRatio: Object.freeze({ numerator: 9, denominator: 16 }),
  description:
    "Half-time ballad: every chord states itself — voicing and root together "
    + "at the chord's own arrival, both ringing for its full length — with a "
    + "softer swung and-of-3 answer in alternating bars.",
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
 *   line sits. It is a fourth above the ballad's window because a walking bass
 *   is busy across the whole bass register and a short stab has to stay clear
 *   of all four of its quarters, not just the downbeat.
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
      velocity: 94,
      cyclePhases: Object.freeze([0] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 1, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 9, denominator: 10 }),
      tone: "fifth",
      velocity: 82,
      cyclePhases: Object.freeze([0] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 2, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 9, denominator: 10 }),
      tone: "third",
      velocity: 88,
      cyclePhases: Object.freeze([0] as const),
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 3, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 9, denominator: 10 }),
      tone: "fifth",
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
  barCycleLength: 1,
  barCycleVelocityOffsets: Object.freeze([0] as const),
  swingRatio: PERFORMANCE_STRAIGHT_EIGHTHS,
  description:
    "Medium swing: walking quarter-note bass under Charleston comp stabs on "
    + "the and-of-2 and the and-of-4.",
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
