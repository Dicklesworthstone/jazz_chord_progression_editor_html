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

export type PerformanceBassSlot = Readonly<{
  /**
   * Offset from the start of the written bar the event sits in, exact
   * quarter-note beats. The written bar, not the meter's own tick grid: a
   * pickup or incomplete bar is shorter than the meter's capacity and every
   * bar line after it is off that grid.
   */
  offsetBeats: ExactBeats;
  /** Nominal sounding length before clipping, exact quarter-note beats. */
  durationBeats: ExactBeats;
  tone: PerformanceBassTone;
  /** MIDI velocity, 1..127. */
  velocity: number;
}>;

export type PerformanceCompSlot = Readonly<{
  offsetBeats: ExactBeats;
  durationBeats: ExactBeats;
  voicing: PerformanceCompVoicing;
  velocity: number;
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

export type PerformanceStyleKind = "band-sketch" | "literal";

export type PerformanceStyle = Readonly<{
  id: PerformanceStyleId;
  kind: PerformanceStyleKind;
  /** The meter these bar-relative tables are authored for. */
  meter: Readonly<{ beatsPerBar: number; beatUnit: number }>;
  bassSlots: readonly PerformanceBassSlot[];
  compSlots: readonly PerformanceCompSlot[];
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
 * ballad-comp@1 — the reviewed slow-ballad sketch (the Deacon Blues style).
 *
 * Reasoning behind each number, so a reviewer can argue with the music rather
 * than reverse-engineer the code:
 *
 * - Bass on beat 1, the root, 3/2 beats. A ballad bass states the harmony on
 *   the downbeat and lets it ring most of the way to beat 3; a short downbeat
 *   note would sound like a march. 3/2 leaves an audible half-beat of air
 *   before the beat-3 note instead of a slur.
 * - Bass on beat 3, the fifth, 6/5 beats. The half-bar answer is the classic
 *   root-fifth ballad motion. It is deliberately shorter than the downbeat
 *   note (6/5 against 3/2) so the bar keeps its weight on beat 1, and it ends
 *   at 3.2 beats, clear of the bar line.
 * - Comp on the "and of 2" (offset 3/2), 7/10 beats. This is the syncopation
 *   that makes the difference between a pad and a band: the chord answers the
 *   bass off the beat and gets out of the way. 7/10 is a stab, not a pad.
 * - Comp on beat 4 (offset 3), 3/4 beats. It leans toward the next bar and
 *   releases at 3.75 beats, so the bar line itself is silent and the next
 *   downbeat lands into space.
 * - Velocities 96 / 84 / 76 / 82, all inside the 72..96 window the bead asked
 *   for. The downbeat bass is the loudest event in the bar; the beat-3 bass
 *   sits clearly under it; both comps sit under both bass notes, with the
 *   beat-4 stab a touch stronger than the "and of 2" because it is the one
 *   pushing into the next bar.
 *
 * No two slots of the same role overlap: bass [0, 3/2) and [2, 16/5); comp
 * [3/2, 11/5) and [3, 15/4).
 */
const BALLAD_COMP_V1: PerformanceStyle = Object.freeze({
  id: "ballad-comp@1",
  kind: "band-sketch",
  meter: Object.freeze({ beatsPerBar: 4, beatUnit: 4 }),
  bassSlots: Object.freeze([
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 0, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 3, denominator: 2 }),
      tone: "root",
      velocity: 96,
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 2, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 6, denominator: 5 }),
      tone: "fifth",
      velocity: 84,
    }),
  ] as const),
  compSlots: Object.freeze([
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 3, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 7, denominator: 10 }),
      voicing: "upper-voices",
      velocity: 76,
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 3, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 3, denominator: 4 }),
      voicing: "upper-voices",
      velocity: 82,
    }),
  ] as const),
  description:
    "Slow ballad: root on 1 and fifth on 3 in the bass, chord stabs on the "
    + "and-of-2 and beat 4.",
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
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 1, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 9, denominator: 10 }),
      tone: "fifth",
      velocity: 82,
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 2, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 9, denominator: 10 }),
      tone: "third",
      velocity: 88,
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 3, denominator: 1 }),
      durationBeats: Object.freeze({ numerator: 9, denominator: 10 }),
      tone: "fifth",
      velocity: 82,
    }),
  ] as const),
  compSlots: Object.freeze([
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 3, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 9, denominator: 20 }),
      voicing: "upper-voices",
      velocity: 74,
    }),
    Object.freeze({
      offsetBeats: Object.freeze({ numerator: 7, denominator: 2 }),
      durationBeats: Object.freeze({ numerator: 9, denominator: 20 }),
      voicing: "upper-voices",
      velocity: 80,
    }),
  ] as const),
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
 */
const BLOCK_CHORDS_V1: PerformanceStyle = Object.freeze({
  id: "block-chords@1",
  kind: "literal",
  meter: Object.freeze({ beatsPerBar: 4, beatUnit: 4 }),
  bassSlots: Object.freeze([] as const),
  compSlots: Object.freeze([] as const),
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
