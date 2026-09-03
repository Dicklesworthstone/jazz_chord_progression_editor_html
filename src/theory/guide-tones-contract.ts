import type {
  ChordDegree,
  ChordEventId,
  PitchClass,
  SpelledPitchClass,
} from "../domain";

/**
 * G6 Guide-Tone Contract.
 *
 * Provides deterministic, pure definitions for extracting guide tones (3rds,
 * 7ths, 4ths in suspensions, and essential alteration tones), tracking their
 * pairwise motion, and optimizing smooth, noncrossing guide-tone voice paths
 * across multi-chord progressions.
 */
export const G6_GUIDE_TONES_CONTRACT_SCHEMA =
  "changes.theory.guide-tones-contract.v1" as const;
export const G6_GUIDE_TONE_EXTRACTION_SCHEMA =
  "changes.theory.guide-tone-extraction.v1" as const;
export const G6_GUIDE_TONE_PATHS_RESULT_SCHEMA =
  "changes.theory.guide-tone-paths-result.v1" as const;

export const G6_GUIDE_TONE_RULE_TABLE_ID = "changes.guide-tone-rules" as const;
export const G6_GUIDE_TONE_RULE_TABLE_VERSION = 1;
export const G6_GUIDE_TONE_MOTION_POLICY_ID =
  "changes.guide-tone-motion-policy" as const;
export const G6_GUIDE_TONE_MOTION_POLICY_VERSION = 1;
export const G6_GUIDE_TONE_OPTIMIZER_POLICY_ID =
  "changes.guide-tone-path-optimizer" as const;
export const G6_GUIDE_TONE_OPTIMIZER_POLICY_VERSION = 1;

/** Max limits for bounded execution. */
export const MAX_G6_PROGRESSION_EVENTS = 64;
export const MAX_G6_GUIDE_TONES_PER_EVENT = 4;
export const MAX_G6_OPTIMIZED_PATHS = 8;
export const MAX_G6_VOICE_LINES_PER_PATH = 4;
export const MAX_G6_TOTAL_WORK_STEPS = 8192;
export const MAX_G6_MAX_MOTION_SEMITONES = 12;

/**
 * Guide tone functional roles.
 * - 'third': Defines major vs minor quality (3, b3).
 * - 'seventh': Defines dominant, major 7th, or diminished quality (7, b7, bb7).
 * - 'suspension': Replaces third with tension/resolution pull (4 / sus4).
 * - 'essential-color': Key defining altered tone (e.g. b5, #5 in augmented/altered).
 */
export const GUIDE_TONE_ROLES = Object.freeze([
  "third",
  "seventh",
  "suspension",
  "essential-color",
] as const);
export type GuideToneRole = (typeof GUIDE_TONE_ROLES)[number];

/**
 * Direction and classification of voice-leading motion between guide tones.
 */
export const GUIDE_TONE_MOTION_KINDS = Object.freeze([
  "contrary",
  "oblique",
  "similar",
  "parallel",
  "common-tone",
  "step-resolution",
  "leap",
  "entering",
  "leaving",
] as const);
export type GuideToneMotionKind = (typeof GUIDE_TONE_MOTION_KINDS)[number];

/**
 * Single extracted guide tone fact for a chord event.
 */
export type ExtractedGuideTone = Readonly<{
  spelledPitchClass: SpelledPitchClass;
  pitchClass: PitchClass;
  degree: ChordDegree;
  role: GuideToneRole;
  midiPitch?: number;
  isTendencyTone: boolean;
  isLeadingTone: boolean;
}>;

/**
 * Complete guide tone extraction summary for one chord event.
 */
export type EventGuideTones = Readonly<{
  schema: typeof G6_GUIDE_TONE_EXTRACTION_SCHEMA;
  eventId: ChordEventId;
  guideTones: readonly ExtractedGuideTone[];
  hasThirdOrSuspension: boolean;
  hasSeventh: boolean;
  isCompleteGuidePair: boolean;
}>;

/**
 * Pairwise voice-leading arc connecting a guide tone in event A to event B.
 */
export type GuideToneVoiceArc = Readonly<{
  fromEventId: ChordEventId;
  toEventId: ChordEventId;
  fromPitch: SpelledPitchClass;
  toPitch: SpelledPitchClass;
  fromDegree: ChordDegree;
  toDegree: ChordDegree;
  fromRole: GuideToneRole;
  toRole: GuideToneRole;
  semitones: number;
  motion: GuideToneMotionKind;
  isTendencyResolution: boolean;
  isLeadingToneResolution: boolean;
}>;

/**
 * Continuous line for one voice index across a progression of chords.
 */
export type GuideToneVoiceLine = Readonly<{
  lineIndex: number;
  primaryRole: GuideToneRole;
  pitches: readonly (SpelledPitchClass | null)[];
  degrees: readonly (ChordDegree | null)[];
  arcs: readonly GuideToneVoiceArc[];
  totalSemitoneMotion: number;
  stepCount: number;
  leapCount: number;
  commonToneCount: number;
}>;

/**
 * Complete multi-voice guide tone path through an entire chord progression.
 */
export type GuideTonePath = Readonly<{
  pathId: string;
  rank: number;
  lines: readonly GuideToneVoiceLine[];
  totalMotionCost: number;
  smoothnessScore: number;
  stepResolutionPercentage: number;
  contraryMotionCount: number;
  parallelMotionCount: number;
  obliqueMotionCount: number;
  hasCrossings: boolean;
  explanation: string;
}>;

/**
 * Refusal codes for guide-tone extraction and path optimization.
 */
export const G6_GUIDE_TONE_REFUSALS = Object.freeze([
  "g6.empty_progression",
  "g6.events_exceeded",
  "g6.invalid_event",
  "g6.no_guide_tones_found",
  "g6.motion_limit_exceeded",
  "g6.work_limit_exceeded",
] as const);
export type G6GuideToneRefusalCode = (typeof G6_GUIDE_TONE_REFUSALS)[number];

export type G6GuideToneRefusal = Readonly<{
  code: G6GuideToneRefusalCode;
  message: string;
  eventId?: ChordEventId;
}>;

export type G6GuideTonePathsResult =
  | Readonly<{
      ok: true;
      schema: typeof G6_GUIDE_TONE_PATHS_RESULT_SCHEMA;
      paths: readonly GuideTonePath[];
      workSteps: number;
    }>
  | Readonly<{
      ok: false;
      refusal: G6GuideToneRefusal;
    }>;
