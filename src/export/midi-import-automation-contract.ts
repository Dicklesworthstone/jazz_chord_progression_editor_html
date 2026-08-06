import type { GrooveStyleId, PitchClass, SpelledPitchClass } from "../domain";

/**
 * M1 automated MIDI import: stable public identities.
 *
 * This is the frozen jcpe-ionn specification surface layered additively over
 * the M0 contract (midi-import-contract.ts). M0 is not altered: its decoder,
 * salvage vocabulary, refusal codes, template table, and sonority law remain
 * authoritative for what they cover. M1 freezes the laws that make the
 * default import path fully automatic: track roles, harmonic-rhythm
 * segmentation, key inference and contextual re-ranking, settings transfer,
 * groove selection among the six reviewed ids (selection-only per the
 * jcpe-61zo lane-A default), the automation envelope, and the ImportTrace
 * diagnostics schema.
 *
 * No production module consumes this contract yet, and it is deliberately
 * NOT re-exported from src/export/index.ts until the build phase
 * (jcpe-upbz) lands. Tests and validators import it by direct path, exactly
 * as the M0, U1, and A0/U1 packets did before their cutovers.
 *
 * Normative prose: docs/M1_MIDI_IMPORT_AUTOMATION_CONTRACT.md. All law
 * arithmetic is exact — integer tick sums and cross-multiplied rational
 * comparisons; no floating point participates in any decision.
 */
export const M1_AUTOMATION_CONTRACT_SCHEMA =
  "changes.import.midi-automation-contract.v1";
export const M1_AUTOMATION_TRACE_SCHEMA =
  "changes.import.automation-trace.v1";
export const M1_AUTOMATION_PLAN_SCHEMA = "changes.import.automation-plan.v1";

/* ------------------------------------------------------------------ *
 * M1-ROLE: track-role classification                                  *
 * ------------------------------------------------------------------ */

export const M1_TRACK_ROLES = Object.freeze([
  "percussion",
  "bass",
  "harmony",
  "melody",
  "silent",
] as const);
export type M1TrackRole = (typeof M1_TRACK_ROLES)[number];

/** GM channel 10 (zero-based 9): never chord material, even in mixed tracks. */
export const M1_PERCUSSION_CHANNEL = 9;

/**
 * Whole-token name matches (case-insensitive, tokens split on spaces,
 * hyphens, underscores, and digits). Token rules beat statistics; "Bassoon"
 * does NOT match "bass" because matching is whole-token, never substring.
 */
export const M1_PERCUSSION_NAME_TOKENS = Object.freeze([
  "drum",
  "drums",
  "perc",
  "percussion",
  "kit",
] as const);
export const M1_BASS_NAME_TOKENS = Object.freeze([
  "bass",
  "bs",
  "contrabass",
  "upright",
] as const);
export const M1_MELODY_NAME_TOKENS = Object.freeze([
  "melody",
  "lead",
  "vocal",
  "voice",
  "sax",
  "trumpet",
  "flute",
  "horn",
] as const);

/** Statistical bounds, compared with exact integer arithmetic. */
export const M1_BASS_MAX_KEY = 55;
export const M1_MELODY_MIN_MEAN_KEY = 64;
/** Mostly-monophonic law: 4·chordAttacks ≤ attacks. */
export const M1_MONOPHONY_CHORD_ATTACK_DENOMINATOR = 4;

/**
 * Frozen classification precedence (first match assigns the role). Every
 * token rule precedes every statistical rule: a name beats a measurement.
 */
export const M1_ROLE_RULE_ORDER = Object.freeze([
  "silent-when-empty",
  "percussion-by-channel-or-token",
  "bass-by-token",
  "melody-by-token",
  "bass-by-register",
  "melody-by-line",
  "harmony-otherwise",
] as const);

/* ------------------------------------------------------------------ *
 * M1-SEG: harmonic-rhythm segmentation                                *
 * ------------------------------------------------------------------ */

/** Chord-mass weights (integer): bass/harmony 2 per tick, melody 1. */
export const M1_MASS_WEIGHT_BASS = 2;
export const M1_MASS_WEIGHT_HARMONY = 2;
export const M1_MASS_WEIGHT_MELODY = 1;
/** Overlap below ppq/8 ticks contributes nothing unless attacked at span start. */
export const M1_MIN_SOUNDING_PPQ_DIVISOR = 8;
/** Present-class law: 8·mass(pc) ≥ maxMass. */
export const M1_PRESENCE_NUMERATOR = 1;
export const M1_PRESENCE_DENOMINATOR = 8;
/** Split recursion: bar → half → quarter-bar. */
export const M1_MAX_SEGMENT_DEPTH = 2;
/** Split requires |A △ B| ≥ 2 between the halves' present-class sets. */
export const M1_SEGMENT_SPLIT_MIN_DIFFERENCE = 2;
/** Odd-length spans put the extra tick in the left half. */
export const M1_SPLIT_REMAINDER_SIDE = "left";

/* ------------------------------------------------------------------ *
 * M1-KEY: key inference and contextual re-ranking                     *
 * ------------------------------------------------------------------ */

/**
 * Integer key profiles indexed by (pitchClass − tonic) mod 12. Authored for
 * this contract (jazz-weighted, integer-only); the fixtures, not any outside
 * citation, are their authority. Minor is dorian-tolerant: natural 6 and
 * flat 7 both score.
 */
export const M1_MAJOR_KEY_PROFILE = Object.freeze([
  8, 0, 3, 0, 6, 5, 0, 7, 0, 4, 1, 3,
] as const);
export const M1_MINOR_KEY_PROFILE = Object.freeze([
  8, 0, 3, 6, 0, 5, 0, 7, 2, 3, 5, 1,
] as const);
/** Ties: higher score, then major before minor, then ascending tonic pc. */
export const M1_KEY_TIE_BREAK_ORDER = Object.freeze([
  "higher-score",
  "major-before-minor",
  "ascending-tonic-pitch-class",
] as const);

/**
 * Tonic spellings per mode. Flats preferred except the sharp-side majors
 * (G/D/A/E/B) and minors (E/B/F#/C#/G#) where convention demands sharps.
 */
export const M1_MAJOR_TONIC_SPELLINGS = Object.freeze([
  Object.freeze({ step: "C", alter: 0 }),
  Object.freeze({ step: "D", alter: -1 }),
  Object.freeze({ step: "D", alter: 0 }),
  Object.freeze({ step: "E", alter: -1 }),
  Object.freeze({ step: "E", alter: 0 }),
  Object.freeze({ step: "F", alter: 0 }),
  Object.freeze({ step: "F", alter: 1 }),
  Object.freeze({ step: "G", alter: 0 }),
  Object.freeze({ step: "A", alter: -1 }),
  Object.freeze({ step: "A", alter: 0 }),
  Object.freeze({ step: "B", alter: -1 }),
  Object.freeze({ step: "B", alter: 0 }),
] as const) satisfies readonly SpelledPitchClass[];
export const M1_MINOR_TONIC_SPELLINGS = Object.freeze([
  Object.freeze({ step: "C", alter: 0 }),
  Object.freeze({ step: "C", alter: 1 }),
  Object.freeze({ step: "D", alter: 0 }),
  Object.freeze({ step: "E", alter: -1 }),
  Object.freeze({ step: "E", alter: 0 }),
  Object.freeze({ step: "F", alter: 0 }),
  Object.freeze({ step: "F", alter: 1 }),
  Object.freeze({ step: "G", alter: 0 }),
  Object.freeze({ step: "G", alter: 1 }),
  Object.freeze({ step: "A", alter: 0 }),
  Object.freeze({ step: "B", alter: -1 }),
  Object.freeze({ step: "B", alter: 0 }),
] as const) satisfies readonly SpelledPitchClass[];

/** Diatonic pitch-class offsets used by the re-ranking comparator. */
export const M1_MAJOR_SCALE_OFFSETS = Object.freeze([
  0, 2, 4, 5, 7, 9, 11,
] as const);
/** Dorian-tolerant minor: both 6ths and both 7ths admitted. */
export const M1_MINOR_SCALE_OFFSETS = Object.freeze([
  0, 2, 3, 5, 7, 8, 9, 10, 11,
] as const);

/** Frozen re-ranking comparator, first difference wins; M0 order settles. */
export const M1_RERANK_ORDER = Object.freeze([
  "diatonic-root-first",
  "bass-is-root-first",
  "m0-ranking-order",
] as const);

/* ------------------------------------------------------------------ *
 * M1-GROOVE: feel features and the selection table                    *
 * ------------------------------------------------------------------ */

export const M1_GROOVE_FEATURE_NAMES = Object.freeze([
  "tempoBpm",
  "swungShare",
  "sixteenthShare",
  "attacksPerBar",
  "melodyCoincidence",
  "bassTwoFeel",
] as const);
export type M1GrooveFeatureName = (typeof M1_GROOVE_FEATURE_NAMES)[number];

/** Eighth-feel windows are ppq/12 half-widths around ppq/2 and 2·ppq/3. */
export const M1_EIGHTH_WINDOW_HALF_WIDTH_PPQ_DIVISOR = 12;

export type M1Rational = Readonly<{ numerator: number; denominator: number }>;

export type M1GrooveRule = Readonly<{
  row: number;
  grooveStyleId: GrooveStyleId;
  conditions: readonly Readonly<{
    feature: M1GrooveFeatureName;
    comparator: "gte" | "lte" | "lt" | "between";
    value: M1Rational;
    upper: M1Rational | null;
  }>[];
  evidenceTemplate: string;
}>;

const rational = (numerator: number, denominator: number): M1Rational =>
  Object.freeze({ numerator, denominator });
const condition = (
  feature: M1GrooveFeatureName,
  comparator: "gte" | "lte" | "lt" | "between",
  value: M1Rational,
  upper: M1Rational | null = null,
) => Object.freeze({ feature, comparator, value, upper });

/**
 * The frozen decision table: the first row whose conditions all hold wins;
 * row 9 is the total default. Every comparison is rational and exact.
 */
export const M1_GROOVE_DECISION_TABLE = Object.freeze([
  Object.freeze({
    row: 1,
    grooveStyleId: "ballad-comp@1",
    conditions: Object.freeze([
      condition("swungShare", "gte", rational(1, 2)),
      condition("tempoBpm", "lt", rational(96, 1)),
    ]),
    evidenceTemplate:
      "Ballad feel: swung eighths in {swungShare} of beats at a gentle {tempoBpm} BPM.",
  }),
  Object.freeze({
    row: 2,
    grooveStyleId: "medium-swing@1",
    conditions: Object.freeze([
      condition("swungShare", "gte", rational(1, 2)),
    ]),
    evidenceTemplate:
      "Medium swing: swung eighths in {swungShare} of beats at {tempoBpm} BPM.",
  }),
  Object.freeze({
    row: 3,
    grooveStyleId: "syncopated-sixteenths@1",
    conditions: Object.freeze([
      condition("sixteenthShare", "gte", rational(1, 4)),
    ]),
    evidenceTemplate:
      "Sixteenth-note groove: {sixteenthShare} of attacks land on sixteenth offbeats.",
  }),
  Object.freeze({
    row: 4,
    grooveStyleId: "bossa-nova@1",
    conditions: Object.freeze([
      condition("bassTwoFeel", "gte", rational(1, 2)),
      condition("tempoBpm", "between", rational(88, 1), rational(132, 1)),
    ]),
    evidenceTemplate:
      "Bossa feel: two-feel bass in {bassTwoFeel} of bars at {tempoBpm} BPM.",
  }),
  Object.freeze({
    row: 5,
    grooveStyleId: "block-chords@1",
    conditions: Object.freeze([
      condition("melodyCoincidence", "gte", rational(3, 4)),
      condition("attacksPerBar", "gte", rational(2, 1)),
    ]),
    evidenceTemplate:
      "Block chords: the melody moves with the chords in {melodyCoincidence} of attacks.",
  }),
  Object.freeze({
    row: 6,
    grooveStyleId: "ballad-comp@1",
    conditions: Object.freeze([
      condition("attacksPerBar", "lte", rational(3, 2)),
      condition("tempoBpm", "lte", rational(92, 1)),
    ]),
    evidenceTemplate:
      "Ballad feel: long chords ({attacksPerBar} attacks per bar) at {tempoBpm} BPM.",
  }),
  /*
   * Row 7 (amendment #1, jcpe-gdyt, 2026-08-05): a dense unswung band
   * arrangement at pop tempo is the measured signature of the
   * sixteenth-feel idiom written large — including the double-time
   * notation that writes its sixteenths as straight eighths, which row 3's
   * sixteenthShare can never see. Both owner-graded reference recordings
   * carry this signature (attacksPerBar 5.4 and 7.8, swungShare 0.06 and
   * 0.002 at 105/120 BPM), and both render measurably closer to their
   * source under syncopated-sixteenths than under the pop sketch the old
   * table sent them to (0.046 vs 0.474 and 0.087 vs 0.515 on the rhythm
   * profile in test-results/m1-local/). The 9/2 bound separates a full
   * band arrangement from the moderately active charts row 8 serves.
   */
  Object.freeze({
    row: 7,
    grooveStyleId: "syncopated-sixteenths@1",
    conditions: Object.freeze([
      condition("swungShare", "lt", rational(1, 8)),
      condition("attacksPerBar", "gte", rational(9, 2)),
      condition("tempoBpm", "gte", rational(96, 1)),
    ]),
    evidenceTemplate:
      "Busy straight-feel band: {attacksPerBar} chord attacks per bar with almost no swing — the syncopated-sixteenth groove states that density.",
  }),
  Object.freeze({
    row: 8,
    grooveStyleId: "straight-eighths@1",
    conditions: Object.freeze([
      condition("attacksPerBar", "gte", rational(3, 1)),
    ]),
    evidenceTemplate:
      "Straight eighths: an active straight feel with {attacksPerBar} attacks per bar.",
  }),
  Object.freeze({
    row: 9,
    grooveStyleId: "medium-swing@1",
    conditions: Object.freeze([]),
    evidenceTemplate:
      "Medium swing chosen as the default jazz feel for this file.",
  }),
] as const) satisfies readonly M1GrooveRule[];

/* ------------------------------------------------------------------ *
 * M1-XFER: settings transfer                                          *
 * ------------------------------------------------------------------ */

export const M1_TRANSFER_SETTINGS = Object.freeze([
  "tempo",
  "meter",
  "key",
  "title",
  "groove",
] as const);
export type M1TransferSetting = (typeof M1_TRANSFER_SETTINGS)[number];

/**
 * The frozen 2×5 truth table. "stated" means the result card must say the
 * setting was withheld and why; groove on an occupied destination applies
 * only when the stored groove is the canonical-absent default.
 */
export const M1_TRANSFER_TRUTH_TABLE = Object.freeze({
  starter: Object.freeze({
    tempo: "applied",
    meter: "applied",
    key: "applied",
    title: "applied",
    groove: "applied",
  }),
  occupied: Object.freeze({
    tempo: "withheld-stated",
    meter: "withheld-stated-with-refusal-prediction",
    key: "withheld-stated",
    title: "withheld",
    groove: "applied-only-when-document-groove-is-default",
  }),
} as const);

/* ------------------------------------------------------------------ *
 * M1-ENV: automation envelope                                         *
 * ------------------------------------------------------------------ */

export const M1_IMPORT_COMMAND_ORDER = Object.freeze([
  "insert",
  "settings",
  "groove",
] as const);
export const M1_MAX_IMPORT_CHUNKS = 16;
export const M1_CHUNK_CODE_POINT_LIMIT = 4_096;
export const M1_ENVELOPE_REFUSAL_CODES = Object.freeze([
  "import.automation_chart_too_large",
  "import.automation_envelope_rolled_back",
] as const);
export type M1EnvelopeRefusalCode =
  (typeof M1_ENVELOPE_REFUSAL_CODES)[number];

/* ------------------------------------------------------------------ *
 * M1-TRACE: diagnostics schema                                        *
 * ------------------------------------------------------------------ */

export const M1_TRACE_STAGES = Object.freeze([
  "decode",
  "salvage",
  "classify",
  "segment",
  "infer-key",
  "resolve",
  "groove",
  "plan",
  "envelope",
] as const);
export type M1TraceStage = (typeof M1_TRACE_STAGES)[number];

export type M1TraceDecision = Readonly<{
  subject: string;
  outcome: string;
  reason: string;
}>;

export type M1TraceRecord = Readonly<{
  stage: M1TraceStage;
  /** FNV-1a 64 hex digest of the stage's canonical JSON input. */
  inputDigest: string;
  workCounters: Readonly<Record<string, number>>;
  decisions: readonly M1TraceDecision[];
  refusalCode: string | null;
}>;

export type M1ImportTrace = Readonly<{
  schema: typeof M1_AUTOMATION_TRACE_SCHEMA;
  records: readonly M1TraceRecord[];
}>;

/* ------------------------------------------------------------------ *
 * Role/segment/key result shapes (frozen public types)                *
 * ------------------------------------------------------------------ */

export type M1TrackClassification = Readonly<{
  trackIndex: number;
  role: M1TrackRole;
  ruleFired: (typeof M1_ROLE_RULE_ORDER)[number];
  attacks: number;
  chordAttacks: number;
  sumKeys: number;
  maxKey: number;
}>;

export type M1Span = Readonly<{
  measureIndex: number;
  depth: number;
  startTick: number;
  endTick: number;
  presentPitchClasses: readonly PitchClass[];
  bassPitchClass: PitchClass | null;
  silent: boolean;
}>;

export type M1KeyInference = Readonly<{
  tonicPitchClass: PitchClass;
  mode: "major" | "minor";
  score: number;
  runnerUpScore: number;
}> | null;

export type M1GrooveChoice = Readonly<{
  grooveStyleId: string;
  row: number;
  features: Readonly<Record<M1GrooveFeatureName, M1Rational>>;
  evidence: string;
}>;
