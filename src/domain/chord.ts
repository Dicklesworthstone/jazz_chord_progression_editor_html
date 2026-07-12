import type { BeatDuration } from "./duration";
import type { ChordEventId } from "./ids";
import {
  makeMidiPitch,
  pitchClassOf,
  soundingSemitoneOf,
  type MidiPitch,
  type MidiPitchRefusal,
  type MidiPitchResult,
  type SpelledPitch,
  type SpelledPitchClass,
} from "./pitch";
import type { DomainPath, PathRefusal } from "./result";

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
export const TRIAD_QUALITIES = [
  "major",
  "minor",
  "diminished",
  "augmented",
  "sus2",
  "sus4",
  "power",
] as const;
export const SEVENTH_QUALITIES = ["major", "minor", "diminished"] as const;
export const CHORD_COLOR_POLICIES = ["none", "altered-dominant"] as const;
export const AUTO_VOICE_COUNTS = [3, 4, 5, 6, 7] as const;
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

export type ChordDegreeInput<N extends number = number> = Readonly<{
  number: N;
  alter: number;
}>;

export type ChordDegreeRefusal =
  | PathRefusal<{ code: "chord.degree_number_invalid"; received: number }>
  | PathRefusal<{ code: "chord.degree_alter_out_of_range"; received: number }>;

export type ChordDegreeResult<
  N extends DegreeNumber = DegreeNumber,
> =
  | Readonly<{ ok: true; value: ChordDegree<N> }>
  | Readonly<{ ok: false; refusal: ChordDegreeRefusal }>;

export type TriadQuality = (typeof TRIAD_QUALITIES)[number];

export type SeventhQuality = (typeof SEVENTH_QUALITIES)[number];
export type ChordColorPolicy = (typeof CHORD_COLOR_POLICIES)[number];

/** Each degree array is number-then-alter ordered and internally duplicate-free. */
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
  colorPolicy: ChordColorPolicy;
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
export type AutoVoiceCount = (typeof AUTO_VOICE_COUNTS)[number];

export type MidiRange = Readonly<{
  lowMidi: MidiPitch;
  highMidi: MidiPitch;
}>;

export type MidiRangeInput = Readonly<{
  lowMidi: number;
  highMidi: number;
}>;

export type MidiRangeResult =
  | Readonly<{ ok: true; value: MidiRange }>
  | Readonly<{
      ok: false;
      refusal:
        | PathRefusal<{ code: "voicing.range_reversed"; range: MidiRangeInput }>
        | MidiPitchRefusal;
    }>;

export type AutoVoiceCountResult =
  | Readonly<{ ok: true; value: AutoVoiceCount }>
  | Readonly<{
      ok: false;
      refusal: PathRefusal<{
        code: "voicing.voice_count_invalid";
        received: number;
      }>;
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

export type AutoVoicingInput = Readonly<{
  mode: "auto";
  family: AutoVoicingFamily;
  voiceCount: number;
  range: MidiRangeInput;
  bassPolicy: AutoBassPolicy;
}>;

export type ManualVoicingInput = Readonly<{
  mode: "manual";
  pitches: readonly SpelledPitch[];
  bassPolicy: StoredBassPolicy;
}>;

export type FrozenVoicingInput = Readonly<{
  mode: "frozen";
  pitches: readonly SpelledPitch[];
  bassPolicy: StoredBassPolicy;
  generatedBy: Readonly<{
    engineVersion: string;
    family: AutoVoicingFamily;
  }>;
}>;

export type VoicingInput =
  | AutoVoicingInput
  | ManualVoicingInput
  | FrozenVoicingInput;

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

export type ChordSpecInput = Omit<ChordSpec, "extensions" | "additions" | "alterations" | "omissions"> &
  Readonly<{
    extensions: readonly ChordDegree[];
    additions: readonly ChordDegree[];
    alterations: readonly ChordDegree[];
    omissions: readonly DegreeNumber[];
  }>;

export type CustomChordSpecInput = Omit<CustomChordSpec, "pitchNames"> &
  Readonly<{ pitchNames: readonly SpelledPitchClass[] }>;

export type ChordEventInput = Readonly<{
  id: ChordEventId;
  duration: BeatDuration;
  annotation: string;
  chord: ChordSpecInput | CustomChordSpecInput;
  voicing: VoicingInput;
}>;

export type FrozenToAutoRequest = Readonly<{
  current: FrozenVoicing;
  requestedAuto: AutoVoicingInput | null;
  chordBass: SpelledPitchClass | null;
}>;

export type ChordInvariantRefusal =
  | ChordDegreeRefusal
  | PathRefusal<{ code: "chord.degree_order"; field: DegreeArrayField }>
  | PathRefusal<{
      code: "chord.degree_duplicate";
      field: DegreeArrayField;
      index: number;
    }>
  | PathRefusal<{ code: "custom.pitch_names_empty" }>
  | PathRefusal<{ code: "custom.auto_voicing_forbidden" }>
  | PathRefusal<{ code: "voicing.pitches_empty"; mode: "manual" | "frozen" }>
  | PathRefusal<{
      code: "limit.voicing_notes_exceeded";
      count: number;
      maximum: typeof MAX_VOICING_PITCHES;
    }>
  | PathRefusal<{ code: "voicing.range_reversed"; range: MidiRange }>
  | PathRefusal<{ code: "voicing.voice_count_invalid"; received: number }>
  | PathRefusal<{ code: "voicing.rootless_requires_external" }>
  | PathRefusal<{ code: "voicing.slash_bass_policy_none" }>
  | PathRefusal<{ code: "voicing.external_without_slash_bass" }>
  | PathRefusal<{ code: "voicing.included_bass_not_lowest" }>
  | PathRefusal<{ code: "voicing.included_bass_spelling_mismatch" }>
  | PathRefusal<{ code: "voicing.external_bass_included" }>
  | PathRefusal<{ code: "voicing.engine_version_invalid" }>
  | PathRefusal<{ code: "voicing.auto_settings_required" }>;

export type ChordConstructionRefusal =
  | ChordInvariantRefusal
  | MidiPitchRefusal;

export type ChordSpecRefusal = Extract<
  ChordInvariantRefusal,
  { code: "chord.degree_order" | "chord.degree_duplicate" }
>;
export type CustomChordSpecRefusal = Extract<
  ChordInvariantRefusal,
  { code: "custom.pitch_names_empty" | "limit.voicing_notes_exceeded" }
>;
export type AutoVoicingRefusal =
  | MidiPitchRefusal
  | Extract<
      ChordInvariantRefusal,
      {
        code:
          | "voicing.range_reversed"
          | "voicing.voice_count_invalid"
          | "voicing.rootless_requires_external"
          | "voicing.slash_bass_policy_none";
      }
    >;
export type ManualVoicingRefusal = Extract<
  ChordInvariantRefusal,
  {
    code:
      | "voicing.pitches_empty"
      | "limit.voicing_notes_exceeded"
      | "voicing.external_without_slash_bass"
      | "voicing.included_bass_not_lowest"
      | "voicing.included_bass_spelling_mismatch"
      | "voicing.external_bass_included";
  }
>;
export type FrozenVoicingRefusal =
  | ManualVoicingRefusal
  | Extract<ChordInvariantRefusal, { code: "voicing.engine_version_invalid" }>;
export type ChordEventRefusal =
  | ChordSpecRefusal
  | CustomChordSpecRefusal
  | AutoVoicingRefusal
  | ManualVoicingRefusal
  | FrozenVoicingRefusal
  | Extract<
      ChordInvariantRefusal,
      { code: "custom.auto_voicing_forbidden" }
    >;
export type FrozenToAutoRefusal =
  | AutoVoicingRefusal
  | Extract<ChordInvariantRefusal, { code: "voicing.auto_settings_required" }>;

export type ChordDegreeArrayResult =
  | Readonly<{ ok: true; value: readonly ChordDegree[] }>
  | Readonly<{
      ok: false;
      refusal: Extract<
        ChordInvariantRefusal,
        { code: "chord.degree_order" | "chord.degree_duplicate" }
      >;
    }>;

export type OmissionArrayResult =
  | Readonly<{ ok: true; value: readonly DegreeNumber[] }>
  | Readonly<{
      ok: false;
      refusal: Extract<
        ChordInvariantRefusal,
        { code: "chord.degree_order" | "chord.degree_duplicate" }
      >;
    }>;

export type VoicingResult<
  T extends Voicing = Voicing,
  R extends ChordConstructionRefusal = ChordConstructionRefusal,
> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; refusal: R }>;

export type ChordSpecResult =
  | Readonly<{ ok: true; value: ChordSpec }>
  | Readonly<{ ok: false; refusal: ChordSpecRefusal }>;

export type CustomChordSpecResult =
  | Readonly<{ ok: true; value: CustomChordSpec }>
  | Readonly<{ ok: false; refusal: CustomChordSpecRefusal }>;

export type ChordEventResult =
  | Readonly<{ ok: true; value: ChordEvent }>
  | Readonly<{ ok: false; refusal: ChordEventRefusal }>;

export type FrozenToAutoResult =
  | Readonly<{ ok: true; value: AutoVoicing }>
  | Readonly<{ ok: false; refusal: FrozenToAutoRefusal }>;

type DegreeArrayInputField = Exclude<DegreeArrayField, "omissions">;

type StoredPitchValidationResult =
  | Readonly<{ ok: true; value: NonEmptySpelledPitches }>
  | Readonly<{ ok: false; refusal: ManualVoicingRefusal }>;

function success<T>(value: T): Readonly<{ ok: true; value: T }> {
  return Object.freeze({ ok: true, value });
}

function failure<R>(refusal: R): Readonly<{ ok: false; refusal: R }> {
  return Object.freeze({ ok: false, refusal });
}

function domainPath(...segments: readonly (string | number)[]): DomainPath {
  return Object.freeze([...segments]);
}

function rebaseRefusal<R extends Readonly<{ path: DomainPath }>>(
  refusal: R,
  path: DomainPath,
): R & Readonly<{ path: DomainPath }> {
  return Object.freeze({ ...refusal, path });
}

function prependRefusalPath<R extends Readonly<{ path: DomainPath }>>(
  segment: string | number,
  refusal: R,
): R & Readonly<{ path: DomainPath }> {
  return rebaseRefusal(
    refusal,
    domainPath(segment, ...refusal.path),
  );
}

function isDegreeNumber(received: number): received is DegreeNumber {
  switch (received) {
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
    case 9:
    case 11:
    case 13:
      return true;
    default:
      return false;
  }
}

function isDegreeAlter(
  received: number,
): received is ChordDegree["alter"] {
  switch (received) {
    case -2:
    case -1:
    case 0:
    case 1:
    case 2:
      return true;
    default:
      return false;
  }
}

function compareDegrees(left: ChordDegree, right: ChordDegree): -1 | 0 | 1 {
  if (left.number < right.number) return -1;
  if (left.number > right.number) return 1;
  if (left.alter < right.alter) return -1;
  if (left.alter > right.alter) return 1;
  return 0;
}

function hasAtLeastOne<T>(values: readonly T[]): values is readonly [T, ...T[]] {
  return values.length > 0;
}

function isRootlessFamily(
  family: AutoVoicingFamily,
): family is RootlessAutoVoicingFamily {
  return family === "rootless-a" || family === "rootless-b";
}

function isIncludedStoredVoicing(
  voicing: ManualVoicing | FrozenVoicing,
): voicing is IncludedStoredVoicing {
  return voicing.bassPolicy === "included";
}

function isSlashAutoVoicing(voicing: AutoVoicing): voicing is SlashAutoVoicing {
  return voicing.bassPolicy !== "none";
}

function sameSpelling(
  left: SpelledPitchClass,
  right: SpelledPitchClass,
): boolean {
  return left.step === right.step && left.alter === right.alter;
}

function immutablePitchClass(pitch: SpelledPitchClass): SpelledPitchClass {
  return Object.freeze({ step: pitch.step, alter: pitch.alter });
}

function immutablePitch(pitch: SpelledPitch): SpelledPitch {
  return Object.freeze({
    step: pitch.step,
    alter: pitch.alter,
    octave: pitch.octave,
  });
}

function immutableDegree<N extends DegreeNumber>(
  value: ChordDegree<N>,
): ChordDegree<N> {
  return Object.freeze({ number: value.number, alter: value.alter });
}

function makeMidiPitchAtPath(
  received: number,
  path: DomainPath,
): MidiPitchResult {
  const result = makeMidiPitch(received);
  if (result.ok) return result;
  return failure(rebaseRefusal(result.refusal, path));
}

function validateStoredPitches(
  mode: "manual" | "frozen",
  pitches: readonly SpelledPitch[],
  bassPolicy: StoredBassPolicy,
  chordBass: SpelledPitchClass | null,
): StoredPitchValidationResult {
  if (!hasAtLeastOne(pitches)) {
    return failure({
      code: "voicing.pitches_empty",
      mode,
      path: domainPath("pitches"),
    });
  }

  if (pitches.length > MAX_VOICING_PITCHES) {
    return failure({
      code: "limit.voicing_notes_exceeded",
      count: pitches.length,
      maximum: MAX_VOICING_PITCHES,
      path: domainPath("pitches"),
    });
  }

  if (bassPolicy === "external") {
    if (chordBass === null) {
      return failure({
        code: "voicing.external_without_slash_bass",
        path: domainPath("bassPolicy"),
      });
    }

    const delegatedPitchClass = pitchClassOf(chordBass);
    const includedIndex = pitches.findIndex(
      (pitch) => pitchClassOf(pitch) === delegatedPitchClass,
    );
    if (includedIndex !== -1) {
      return failure({
        code: "voicing.external_bass_included",
        path: domainPath("pitches", includedIndex),
      });
    }
  } else if (chordBass !== null) {
    let minimum = soundingSemitoneOf(pitches[0]);
    let firstMinimumIndex = 0;
    for (let index = 1; index < pitches.length; index += 1) {
      const pitch = pitches[index];
      if (pitch === undefined) continue;
      const soundingSemitone = soundingSemitoneOf(pitch);
      if (soundingSemitone < minimum) {
        minimum = soundingSemitone;
        firstMinimumIndex = index;
      }
    }

    const hasExactMinimum = pitches.some(
      (pitch) =>
        soundingSemitoneOf(pitch) === minimum && sameSpelling(pitch, chordBass),
    );
    if (!hasExactMinimum) {
      const hasExactAtAnotherRegister = pitches.some((pitch) =>
        sameSpelling(pitch, chordBass),
      );
      if (hasExactAtAnotherRegister) {
        return failure({
          code: "voicing.included_bass_not_lowest",
          path: domainPath("pitches", firstMinimumIndex),
        });
      }
      return failure({
        code: "voicing.included_bass_spelling_mismatch",
        path: domainPath("pitches", firstMinimumIndex),
      });
    }
  }

  const exactPitches: NonEmptySpelledPitches = Object.freeze([
    immutablePitch(pitches[0]),
    ...pitches.slice(1).map(immutablePitch),
  ]);
  return success(exactPitches);
}

export function makeChordDegree<N extends DegreeNumber>(
  input: ChordDegreeInput<N>,
): ChordDegreeResult<N>;
export function makeChordDegree(
  input: ChordDegreeInput,
): ChordDegreeResult;
export function makeChordDegree(input: ChordDegreeInput): ChordDegreeResult {
  if (!isDegreeNumber(input.number)) {
    return failure({
      code: "chord.degree_number_invalid",
      received: input.number,
      path: domainPath("number"),
    });
  }
  if (!isDegreeAlter(input.alter)) {
    return failure({
      code: "chord.degree_alter_out_of_range",
      received: input.alter,
      path: domainPath("alter"),
    });
  }
  return success(Object.freeze({ number: input.number, alter: input.alter }));
}

export function validateChordDegreeArray(
  field: DegreeArrayInputField,
  values: readonly ChordDegree[],
): ChordDegreeArrayResult {
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    if (previous === undefined || current === undefined) continue;
    const comparison = compareDegrees(previous, current);
    if (comparison === 0) {
      return failure({
        code: "chord.degree_duplicate",
        field,
        index,
        path: domainPath(field, index),
      });
    }
    if (comparison > 0) {
      return failure({
        code: "chord.degree_order",
        field,
        path: domainPath(field),
      });
    }
  }
  return success(Object.freeze(values.map(immutableDegree)));
}

export function validateOmissionArray(
  values: readonly DegreeNumber[],
): OmissionArrayResult {
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    if (previous === undefined || current === undefined) continue;
    if (previous === current) {
      return failure({
        code: "chord.degree_duplicate",
        field: "omissions",
        index,
        path: domainPath("omissions", index),
      });
    }
    if (previous > current) {
      return failure({
        code: "chord.degree_order",
        field: "omissions",
        path: domainPath("omissions"),
      });
    }
  }
  return success(Object.freeze([...values]));
}

export function makeMidiRange(
  lowMidi: number,
  highMidi: number,
): MidiRangeResult {
  const lowResult = makeMidiPitchAtPath(lowMidi, domainPath("lowMidi"));
  if (!lowResult.ok) return lowResult;
  const highResult = makeMidiPitchAtPath(highMidi, domainPath("highMidi"));
  if (!highResult.ok) return highResult;
  if (lowResult.value > highResult.value) {
    return failure({
      code: "voicing.range_reversed",
      range: Object.freeze({ lowMidi, highMidi }),
      path: domainPath("highMidi"),
    });
  }
  return success(
    Object.freeze({ lowMidi: lowResult.value, highMidi: highResult.value }),
  );
}

export function makeAutoVoiceCount(
  received: number,
): AutoVoiceCountResult {
  switch (received) {
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
      return success(received);
    default:
      return failure({
        code: "voicing.voice_count_invalid",
        received,
        path: domainPath("voiceCount"),
      });
  }
}

export function makeChordSpec(input: ChordSpecInput): ChordSpecResult {
  const extensions = validateChordDegreeArray("extensions", input.extensions);
  if (!extensions.ok) return extensions;
  const additions = validateChordDegreeArray("additions", input.additions);
  if (!additions.ok) return additions;
  const alterations = validateChordDegreeArray("alterations", input.alterations);
  if (!alterations.ok) return alterations;
  const omissions = validateOmissionArray(input.omissions);
  if (!omissions.ok) return omissions;

  return success(
    Object.freeze({
      ...input,
      root: immutablePitchClass(input.root),
      sixth: input.sixth === null ? null : immutableDegree(input.sixth),
      extensions: extensions.value,
      additions: additions.value,
      alterations: alterations.value,
      omissions: omissions.value,
      bass: input.bass === null ? null : immutablePitchClass(input.bass),
    }),
  );
}

export function makeCustomChordSpec(
  input: CustomChordSpecInput,
): CustomChordSpecResult {
  if (!hasAtLeastOne(input.pitchNames)) {
    return failure({
      code: "custom.pitch_names_empty",
      path: domainPath("pitchNames"),
    });
  }
  if (input.pitchNames.length > MAX_VOICING_PITCHES) {
    return failure({
      code: "limit.voicing_notes_exceeded",
      count: input.pitchNames.length,
      maximum: MAX_VOICING_PITCHES,
      path: domainPath("pitchNames"),
    });
  }

  const pitchNames: readonly [SpelledPitchClass, ...SpelledPitchClass[]] =
    Object.freeze([
      immutablePitchClass(input.pitchNames[0]),
      ...input.pitchNames.slice(1).map(immutablePitchClass),
    ]);
  return success(
    Object.freeze({
      ...input,
      pitchNames,
      bass: input.bass === null ? null : immutablePitchClass(input.bass),
    }),
  );
}

export function makeAutoVoicing(
  input: AutoVoicingInput,
  chordBass: SpelledPitchClass | null,
): VoicingResult<AutoVoicing, AutoVoicingRefusal> {
  const voiceCount = makeAutoVoiceCount(input.voiceCount);
  if (!voiceCount.ok) return voiceCount;

  const lowResult = makeMidiPitchAtPath(
    input.range.lowMidi,
    domainPath("range", "lowMidi"),
  );
  if (!lowResult.ok) return lowResult;
  const highResult = makeMidiPitchAtPath(
    input.range.highMidi,
    domainPath("range", "highMidi"),
  );
  if (!highResult.ok) return highResult;

  const range: MidiRange = Object.freeze({
    lowMidi: lowResult.value,
    highMidi: highResult.value,
  });
  if (range.lowMidi > range.highMidi) {
    return failure({
      code: "voicing.range_reversed",
      range,
      path: domainPath("range", "highMidi"),
    });
  }

  if (isRootlessFamily(input.family)) {
    if (input.bassPolicy !== "external") {
      return failure({
        code: "voicing.rootless_requires_external",
        path: domainPath("bassPolicy"),
      });
    }
    return success(
      Object.freeze({
        mode: "auto",
        family: input.family,
        voiceCount: voiceCount.value,
        range,
        bassPolicy: "external",
      }),
    );
  }

  if (chordBass !== null && input.bassPolicy === "none") {
    return failure({
      code: "voicing.slash_bass_policy_none",
      path: domainPath("bassPolicy"),
    });
  }

  return success(
    Object.freeze({
      mode: "auto",
      family: input.family,
      voiceCount: voiceCount.value,
      range,
      bassPolicy: input.bassPolicy,
    }),
  );
}

export function makeManualVoicing(
  input: ManualVoicingInput,
  chordBass: SpelledPitchClass | null,
): VoicingResult<ManualVoicing, ManualVoicingRefusal> {
  const pitches = validateStoredPitches(
    "manual",
    input.pitches,
    input.bassPolicy,
    chordBass,
  );
  if (!pitches.ok) return pitches;
  return success(
    Object.freeze({
      mode: "manual",
      pitches: pitches.value,
      bassPolicy: input.bassPolicy,
    }),
  );
}

export function makeFrozenVoicing(
  input: FrozenVoicingInput,
  chordBass: SpelledPitchClass | null,
): VoicingResult<FrozenVoicing, FrozenVoicingRefusal> {
  const pitches = validateStoredPitches(
    "frozen",
    input.pitches,
    input.bassPolicy,
    chordBass,
  );
  if (!pitches.ok) return pitches;

  if (input.generatedBy.engineVersion.trim().length === 0) {
    return failure({
      code: "voicing.engine_version_invalid",
      path: domainPath("generatedBy", "engineVersion"),
    });
  }

  return success(
    Object.freeze({
      mode: "frozen",
      pitches: pitches.value,
      bassPolicy: input.bassPolicy,
      generatedBy: Object.freeze({ ...input.generatedBy }),
    }),
  );
}

function eventWithParsedChord(
  input: ChordEventInput,
  chord: ChordSpec,
  voicing: Voicing,
): ChordEventResult {
  if (chord.bass === null) {
    const basslessChord: ChordSpec & Readonly<{ bass: null }> = Object.freeze({
      ...chord,
      bass: null,
    });
    if (voicing.mode === "auto") {
      const event: ParsedChordEvent = Object.freeze({
        id: input.id,
        duration: input.duration,
        annotation: input.annotation,
        chord: basslessChord,
        voicing,
      });
      return success(event);
    }
    if (!isIncludedStoredVoicing(voicing)) {
      return failure({
        code: "voicing.external_without_slash_bass",
        path: domainPath("voicing", "bassPolicy"),
      });
    }
    const event: ParsedChordEvent = Object.freeze({
      id: input.id,
      duration: input.duration,
      annotation: input.annotation,
      chord: basslessChord,
      voicing,
    });
    return success(event);
  }

  const slashChord: ChordSpec & Readonly<{ bass: SpelledPitchClass }> =
    Object.freeze({ ...chord, bass: chord.bass });
  if (voicing.mode === "auto") {
    if (!isSlashAutoVoicing(voicing)) {
      return failure({
        code: "voicing.slash_bass_policy_none",
        path: domainPath("voicing", "bassPolicy"),
      });
    }
    const event: ParsedChordEvent = Object.freeze({
      id: input.id,
      duration: input.duration,
      annotation: input.annotation,
      chord: slashChord,
      voicing,
    });
    return success(event);
  }
  const event: ParsedChordEvent = Object.freeze({
    id: input.id,
    duration: input.duration,
    annotation: input.annotation,
    chord: slashChord,
    voicing,
  });
  return success(event);
}

function eventWithCustomChord(
  input: ChordEventInput,
  chord: CustomChordSpec,
  voicing: ManualVoicing | FrozenVoicing,
): ChordEventResult {
  if (chord.bass === null) {
    if (!isIncludedStoredVoicing(voicing)) {
      return failure({
        code: "voicing.external_without_slash_bass",
        path: domainPath("voicing", "bassPolicy"),
      });
    }
    const basslessChord: CustomChordSpec & Readonly<{ bass: null }> =
      Object.freeze({ ...chord, bass: null });
    const event: CustomChordEvent = Object.freeze({
      id: input.id,
      duration: input.duration,
      annotation: input.annotation,
      chord: basslessChord,
      voicing,
    });
    return success(event);
  }

  const slashChord: CustomChordSpec & Readonly<{ bass: SpelledPitchClass }> =
    Object.freeze({ ...chord, bass: chord.bass });
  const event: CustomChordEvent = Object.freeze({
    id: input.id,
    duration: input.duration,
    annotation: input.annotation,
    chord: slashChord,
    voicing,
  });
  return success(event);
}

export function makeChordEvent(input: ChordEventInput): ChordEventResult {
  if (input.chord.kind === "custom") {
    const chord = makeCustomChordSpec(input.chord);
    if (!chord.ok) {
      return failure(prependRefusalPath("chord", chord.refusal));
    }
    if (input.voicing.mode === "auto") {
      return failure({
        code: "custom.auto_voicing_forbidden",
        path: domainPath("voicing", "mode"),
      });
    }
    if (input.voicing.mode === "manual") {
      const voicing = makeManualVoicing(input.voicing, chord.value.bass);
      if (!voicing.ok) {
        return failure(prependRefusalPath("voicing", voicing.refusal));
      }
      return eventWithCustomChord(input, chord.value, voicing.value);
    }
    const voicing = makeFrozenVoicing(input.voicing, chord.value.bass);
    if (!voicing.ok) {
      return failure(prependRefusalPath("voicing", voicing.refusal));
    }
    return eventWithCustomChord(input, chord.value, voicing.value);
  }

  const chord = makeChordSpec(input.chord);
  if (!chord.ok) {
    return failure(prependRefusalPath("chord", chord.refusal));
  }
  if (input.voicing.mode === "auto") {
    const voicing = makeAutoVoicing(input.voicing, chord.value.bass);
    if (!voicing.ok) {
      return failure(prependRefusalPath("voicing", voicing.refusal));
    }
    return eventWithParsedChord(input, chord.value, voicing.value);
  }
  if (input.voicing.mode === "manual") {
    const voicing = makeManualVoicing(input.voicing, chord.value.bass);
    if (!voicing.ok) {
      return failure(prependRefusalPath("voicing", voicing.refusal));
    }
    return eventWithParsedChord(input, chord.value, voicing.value);
  }
  const voicing = makeFrozenVoicing(input.voicing, chord.value.bass);
  if (!voicing.ok) {
    return failure(prependRefusalPath("voicing", voicing.refusal));
  }
  return eventWithParsedChord(input, chord.value, voicing.value);
}

export function transitionFrozenToAuto(
  request: FrozenToAutoRequest,
): FrozenToAutoResult {
  if (request.requestedAuto === null) {
    return failure({
      code: "voicing.auto_settings_required",
      path: domainPath("requestedAuto"),
    });
  }
  const auto = makeAutoVoicing(request.requestedAuto, request.chordBass);
  if (!auto.ok) {
    return failure(prependRefusalPath("requestedAuto", auto.refusal));
  }
  return auto;
}
