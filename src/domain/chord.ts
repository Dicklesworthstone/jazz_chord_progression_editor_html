import type { BeatDuration } from "./duration";
import type { ChordEventId } from "./ids";
import type { MidiPitch, SpelledPitch, SpelledPitchClass } from "./pitch";

export const DEGREE_NUMBER_ORDER = [1, 2, 3, 4, 5, 6, 7, 9, 11, 13] as const;
export const AUTO_VOICING_FAMILIES = [
  "balanced",
  "shell",
  "rootless-a",
  "rootless-b",
  "open",
  "drop2",
  "quartal",
] as const;
export const AUTO_BASS_POLICIES = ["generated", "external", "none"] as const;
export const STORED_BASS_POLICIES = ["included", "external"] as const;
export const MAX_VOICING_PITCHES = 16;
export const MAX_ENGINE_VERSION_CODE_POINTS = 64;

export type DegreeNumber = (typeof DEGREE_NUMBER_ORDER)[number];
export type DegreeArrayField =
  | "extensions"
  | "additions"
  | "alterations"
  | "omissions";

export type ChordDegree<N extends DegreeNumber = DegreeNumber> = Readonly<{
  number: N;
  alter: -2 | -1 | 0 | 1 | 2;
}>;

export type ChordDegreeInput = Readonly<{
  number: number;
  alter: number;
}>;

export type ChordDegreeRefusal =
  | Readonly<{ code: "chord.degree_number_invalid"; received: number }>
  | Readonly<{ code: "chord.degree_alter_out_of_range"; received: number }>;

export type ChordDegreeResult =
  | Readonly<{ ok: true; value: ChordDegree }>
  | Readonly<{ ok: false; refusal: ChordDegreeRefusal }>;

export type TriadQuality =
  | "major"
  | "minor"
  | "diminished"
  | "augmented"
  | "sus2"
  | "sus4"
  | "power";

export type SeventhQuality = "major" | "minor" | "diminished";

/** Degree arrays are stored in number-then-alter order; exact duplicates are invalid. */
export type ChordSpec = Readonly<{
  kind: "parsed";
  sourceText: string;
  root: SpelledPitchClass;
  triad: TriadQuality;
  sixth: ChordDegree<6> | null;
  seventh: SeventhQuality | null;
  extensions: readonly ChordDegree[];
  additions: readonly ChordDegree[];
  alterations: readonly ChordDegree[];
  omissions: readonly DegreeNumber[];
  bass: SpelledPitchClass | null;
  colorPolicy: "none" | "altered-dominant";
}>;

export type CustomChordSpec = Readonly<{
  kind: "custom";
  sourceText: string;
  label: string;
  pitchNames: readonly [SpelledPitchClass, ...SpelledPitchClass[]];
  bass: SpelledPitchClass | null;
}>;

export type AutoVoicingFamily = (typeof AUTO_VOICING_FAMILIES)[number];
export type AutoBassPolicy = (typeof AUTO_BASS_POLICIES)[number];

export type RootlessAutoVoicingFamily = "rootless-a" | "rootless-b";
export type NonRootlessAutoVoicingFamily = Exclude<
  AutoVoicingFamily,
  RootlessAutoVoicingFamily
>;
export type AutoVoiceCount = 3 | 4 | 5 | 6 | 7;

export type MidiRange = Readonly<{
  lowMidi: MidiPitch;
  highMidi: MidiPitch;
}>;

export type RootlessAutoVoicing = Readonly<{
  mode: "auto";
  family: RootlessAutoVoicingFamily;
  voiceCount: AutoVoiceCount;
  range: MidiRange;
  bassPolicy: "external";
}>;

export type NonRootlessAutoVoicing = Readonly<{
  mode: "auto";
  family: NonRootlessAutoVoicingFamily;
  voiceCount: AutoVoiceCount;
  range: MidiRange;
  bassPolicy: "generated" | "external" | "none";
}>;

export type AutoVoicing = RootlessAutoVoicing | NonRootlessAutoVoicing;
export type StoredBassPolicy = (typeof STORED_BASS_POLICIES)[number];
export type NonEmptySpelledPitches = readonly [SpelledPitch, ...SpelledPitch[]];

/** Order, spelling, octave, and duplicate pitches round-trip exactly. */
export type ManualVoicing = Readonly<{
  mode: "manual";
  pitches: NonEmptySpelledPitches;
  bassPolicy: StoredBassPolicy;
}>;

export type FrozenVoicing = Readonly<{
  mode: "frozen";
  pitches: NonEmptySpelledPitches;
  bassPolicy: StoredBassPolicy;
  generatedBy: Readonly<{
    engineVersion: string;
    family: AutoVoicingFamily;
  }>;
}>;

export type Voicing = AutoVoicing | ManualVoicing | FrozenVoicing;

type IncludedStoredVoicing =
  | (ManualVoicing & Readonly<{ bassPolicy: "included" }>)
  | (FrozenVoicing & Readonly<{ bassPolicy: "included" }>);
type SlashStoredVoicing = ManualVoicing | FrozenVoicing;
type SlashAutoVoicing =
  | RootlessAutoVoicing
  | (NonRootlessAutoVoicing &
      Readonly<{ bassPolicy: "generated" | "external" }>);

type ChordEventFields = Readonly<{
  id: ChordEventId;
  duration: BeatDuration;
  annotation: string;
}>;

export type ParsedChordEvent = ChordEventFields &
  (
    | Readonly<{
        chord: ChordSpec & Readonly<{ bass: null }>;
        voicing: AutoVoicing | IncludedStoredVoicing;
      }>
    | Readonly<{
        chord: ChordSpec & Readonly<{ bass: SpelledPitchClass }>;
        voicing: SlashAutoVoicing | SlashStoredVoicing;
      }>
  );

/** Custom chords are structurally nonempty and can never select Auto voicing. */
export type CustomChordEvent = ChordEventFields &
  (
    | Readonly<{
        chord: CustomChordSpec & Readonly<{ bass: null }>;
        voicing: IncludedStoredVoicing;
      }>
    | Readonly<{
        chord: CustomChordSpec & Readonly<{ bass: SpelledPitchClass }>;
        voicing: SlashStoredVoicing;
      }>
  );

export type ChordEvent = ParsedChordEvent | CustomChordEvent;

export type ChordInvariantRefusal =
  | ChordDegreeRefusal
  | Readonly<{ code: "chord.degree_order"; field: DegreeArrayField }>
  | Readonly<{
      code: "chord.degree_duplicate";
      field: DegreeArrayField;
      index: number;
    }>
  | Readonly<{ code: "custom.pitch_names_empty" }>
  | Readonly<{ code: "custom.pitch_voicing_mismatch" }>
  | Readonly<{ code: "custom.auto_voicing_forbidden" }>
  | Readonly<{ code: "voicing.pitches_empty"; mode: "manual" | "frozen" }>
  | Readonly<{
      code: "limit.voicing_notes_exceeded";
      count: number;
      maximum: typeof MAX_VOICING_PITCHES;
    }>
  | Readonly<{ code: "voicing.range_reversed"; range: MidiRange }>
  | Readonly<{ code: "voicing.voice_count_invalid"; received: number }>
  | Readonly<{ code: "voicing.rootless_requires_external" }>
  | Readonly<{ code: "voicing.slash_bass_policy_none" }>
  | Readonly<{ code: "voicing.external_without_slash_bass" }>
  | Readonly<{ code: "voicing.included_bass_not_lowest" }>
  | Readonly<{ code: "voicing.included_bass_spelling_mismatch" }>
  | Readonly<{ code: "voicing.external_bass_included" }>
  | Readonly<{ code: "voicing.engine_version_invalid" }>
  | Readonly<{ code: "voicing.auto_settings_required" }>;
