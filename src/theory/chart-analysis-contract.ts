import type {
  ChordSpec,
  CustomChordSpec,
  KeyContext,
  PitchClass,
  SpelledPitchClass,
} from "../domain";

/**
 * Chart annotation for the v2 studio surface: roman numerals under the bars,
 * pencilled phrase brackets, and the chord-detail panel's teaching data.
 *
 * This is deliberately NOT the H0 context-harmony package. The H0 contract
 * (`analysis-contract.ts`) remains specification-only: its evidence tiers,
 * exact-match arithmetic, plural readings, and rule tables are a milestone
 * this module does not claim, and none of its schemas or policy ids are
 * echoed here. What this module offers is the pragmatic subset the engraved
 * chart displays — one deterministic reading per event, phrase spans from
 * literal root motion, and plural next options — with the same laws the
 * session continuation engine obeys: typed explanations, total ordering,
 * explicit bounds, honest refusal to claim what the data cannot support
 * (no key, custom chords, refused resolutions), and nothing ever labeled
 * correct or best.
 */

export const CHART_ANALYSIS_ENGINE_VERSION = "chart-annotation@1" as const;

/** Functional families a keyed reading may claim; nothing else is invented. */
export const CHART_HARMONIC_KINDS = Object.freeze([
  "tonic",
  "dominant",
  "predominant",
  "colour",
] as const);
export type ChartHarmonicKind = (typeof CHART_HARMONIC_KINDS)[number];

/**
 * How an event left the analyzer. Only `analyzed` carries a functional
 * claim; the other outcomes state exactly why no claim is made.
 */
export const CHART_ANALYSIS_OUTCOMES = Object.freeze([
  "analyzed",
  "unkeyed",
  "custom-chord",
  "resolution-refused",
] as const);
export type ChartAnalysisOutcome = (typeof CHART_ANALYSIS_OUTCOMES)[number];

/**
 * Phrase detectors in exactly this precedence order; the greedy left-to-right
 * scan tries each in turn at every position, and the order is part of the
 * contract (a turnaround wins over the ii–V–I inside it).
 */
export const CHART_PHRASE_KINDS = Object.freeze([
  "turnaround",
  "two-five-one",
  "two-five",
  "tritone-substitution",
  "five-one",
  "dominant-chain",
] as const);
export type ChartPhraseKind = (typeof CHART_PHRASE_KINDS)[number];

export const GUIDE_TONE_MOTIONS = Object.freeze([
  "held",
  "step",
  "leap",
] as const);
export type GuideToneMotion = (typeof GUIDE_TONE_MOTIONS)[number];

export const MAX_CHART_PHRASES_PER_SECTION = 32;
export const MAX_CHART_PHRASE_EVENTS = 512;
export const MAX_CHART_DETAIL_TONES = 16;
export const MAX_CHART_GUIDE_TONE_MOVES = 4;
export const MAX_CHART_NEXT_OPTIONS = 3;

export type ChartEventAnalysis = Readonly<{
  engineVersion: typeof CHART_ANALYSIS_ENGINE_VERSION;
  outcome: ChartAnalysisOutcome;
  /** Functional family; null unless `outcome` is `analyzed`. */
  kind: ChartHarmonicKind | null;
  /**
   * Display roman numeral ("♭VII7", "iiø7"); Unicode accidentals, derived
   * from the SPELLED letters of key tonic and chord root, never from bare
   * pitch classes. Null unless `outcome` is `analyzed`.
   */
  roman: string | null;
  /** One plain sentence; on a non-analyzed outcome it states the reason. */
  functionSentence: string;
  /**
   * A scale that fits the chord ("G Mixolydian"). Quality-only scales are
   * still offered when no key is set (they need none); null when even the
   * quality is unknown (custom chords, refused resolutions).
   */
  scaleSentence: string | null;
}>;

export type AnalyzeChartEventRequest = Readonly<{
  current: ChordSpec | CustomChordSpec;
  key: KeyContext | null;
}>;

export type ChartPhrase = Readonly<{
  kind: ChartPhraseKind;
  /** Inclusive event ordinals inside the request's event list. */
  fromIndex: number;
  toIndex: number;
  /** Pencilled label ("ii–V–I in B♭", "tritone sub into C minor"). */
  label: string;
}>;

export type DetectChartPhrasesRequest = Readonly<{
  /** One section's events in chart order; custom chords simply never match. */
  events: readonly (ChordSpec | CustomChordSpec)[];
  key: KeyContext | null;
}>;

export type ChartPhrasesWorkEvidence = Readonly<{
  eventsExamined: number;
  detectorAttempts: number;
  phrasesEmitted: number;
  termination: "complete";
}>;

export type ChartPhrasesResult = Readonly<{
  engineVersion: typeof CHART_ANALYSIS_ENGINE_VERSION;
  phrases: readonly ChartPhrase[];
  evidence: ChartPhrasesWorkEvidence;
}>;

export type ChartToneView = Readonly<{
  /** Display name with Unicode accidentals ("B♭"). */
  name: string;
  spelled: SpelledPitchClass;
  pitchClass: PitchClass;
  /** Interval role ("root", "♭3", "♯11"); null for custom pitches. */
  role: string | null;
  guide: boolean;
}>;

export type ChartGuideToneMove = Readonly<{
  fromName: string;
  toName: string;
  fromPitchClass: PitchClass;
  toPitchClass: PitchClass;
  /** Shortest directed pitch-class distance, 0..6. */
  distance: number;
  motion: GuideToneMotion;
}>;

export type ChartGuideToneResolution = Readonly<{
  /** The stored symbol of the chord being moved into. */
  targetSymbol: string;
  moves: readonly ChartGuideToneMove[];
  /** The teaching sentence ("1 held, 1 by step"). */
  note: string;
}>;

export type ChartNextOption = Readonly<{
  /** Stable and deterministic: `${kind}:${symbolText}`. */
  id: string;
  /** ASCII the T0 grammar parses; inserting it must reach sound. */
  symbolText: string;
  /** Pitch-class roman reading of the option in the key; null when unkeyed. */
  roman: string | null;
  /** One concrete sentence saying why this option follows. */
  why: string;
}>;

export type ChartChordDetail = Readonly<{
  engineVersion: typeof CHART_ANALYSIS_ENGINE_VERSION;
  outcome: ChartAnalysisOutcome;
  analysis: ChartEventAnalysis;
  tones: readonly ChartToneView[];
  /** Display names of the guide tones ("F  and  B"), already joined. */
  guideToneNames: readonly string[];
  resolution: ChartGuideToneResolution | null;
  next: readonly ChartNextOption[];
}>;

export type DeriveChordDetailRequest = Readonly<{
  current: ChordSpec | CustomChordSpec;
  /** The chord that follows in chart order, if any. */
  next: Readonly<{ spec: ChordSpec | CustomChordSpec; symbolText: string }> | null;
  key: KeyContext | null;
}>;
