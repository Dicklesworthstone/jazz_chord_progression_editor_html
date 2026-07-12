import {
  makeAutoVoiceCount,
  makeAutoVoicing,
  makeChordDegree,
  makeChordEvent,
  makeChordSpec,
  makeCustomChordSpec,
  makeFrozenVoicing,
  makeManualVoicing,
  makeMidiRange,
  transitionFrozenToAuto,
  validateChordDegreeArray,
  validateOmissionArray,
  type AutoVoiceCountResult,
  type AutoVoicing,
  type AutoVoicingInput,
  type AutoVoicingRefusal,
  type ChordDegree,
  type ChordDegreeArrayResult,
  type ChordDegreeInput,
  type ChordDegreeResult,
  type ChordEventInput,
  type ChordEventResult,
  type ChordSpecInput,
  type ChordSpecResult,
  type CustomChordSpecInput,
  type CustomChordSpecResult,
  type DegreeNumber,
  type MidiRangeResult,
  type ManualVoicingInput,
  type OmissionArrayResult,
  type FrozenToAutoRequest,
  type FrozenToAutoResult,
  type FrozenVoicing,
  type FrozenVoicingRefusal,
  type FrozenVoicingInput,
  type ManualVoicing,
  type ManualVoicingRefusal,
  type VoicingResult,
} from "./chord";
import { copyDomain, type DomainCopyOperation } from "./copy";
import {
  accumulateTimeline,
  addBeatValues,
  beatValueToMidiTicks,
  compareBeatValues,
  makeBeatDuration,
  makeBeatPosition,
  makeBeatRange,
  makeMeter,
  makeTempoBpm,
  measureCapacity,
  normalizeBeatValue,
  subtractBeatValues,
  type BeatAdditionResult,
  type BeatComparison,
  type BeatDuration,
  type BeatDurationResult,
  type BeatPosition,
  type BeatPositionResult,
  type BeatRangeResult,
  type BeatSubtractionResult,
  type BeatValue,
  type BeatValueInput,
  type BeatValueResult,
  type Meter,
  type MeterInput,
  type MeterResult,
  type MidiTick,
  type TempoResult,
  type TimelineAccumulationResult,
} from "./duration";
import {
  createProductionStableIdFactory,
  parseStableId,
  type StableIdFactory,
  type StableIdKind,
  type StableIdWireResult,
} from "./ids";
import { makeInstrumentId, type InstrumentIdResult } from "./instrument-id";
import { makeKeyMode, type KeyModeResult } from "./key";
import {
  compareSpelledPitchClasses,
  compareSpelledPitches,
  frequencyForMidi,
  makeMidiPitch,
  makeSpelledPitch,
  makeSpelledPitchClass,
  pitchClassOf,
  projectSpelledPitch,
  type MidiPitch,
  type MidiPitchResult,
  type PitchClass,
  type PitchProjectionResult,
  type SpelledPitch,
  type SpelledPitchClass,
  type SpelledPitchClassInput,
  type SpelledPitchClassResult,
  type SpelledPitchInput,
  type SpelledPitchResult,
} from "./pitch";
import type { Comparison, DomainPath } from "./result";
import {
  makePlaybackSettings,
  type PlaybackSettingsInput,
  type PlaybackSettingsResult,
} from "./document";
import {
  compareDomainPaths,
  compareValidationIssues,
  type ValidationDiagnosticComparator,
} from "./validated-document";

/**
 * Frozen callable surface for F1/build. Refusal paths are relative to the
 * operation input; nested F2/F3 adapters prefix them without changing codes.
 */
export interface DomainOperations {
  readonly parseStableId: <K extends StableIdKind>(
    kind: K,
    wire: string,
  ) => StableIdWireResult<K>;
  readonly createProductionStableIdFactory: () => StableIdFactory;
  readonly copyDomain: DomainCopyOperation;

  readonly makeSpelledPitchClass: (
    input: SpelledPitchClassInput,
  ) => SpelledPitchClassResult;
  readonly makeSpelledPitch: (
    input: SpelledPitchInput,
  ) => SpelledPitchResult;
  readonly makeMidiPitch: (received: number) => MidiPitchResult;
  readonly pitchClassOf: (pitch: SpelledPitchClass) => PitchClass;
  readonly projectSpelledPitch: (
    pitch: SpelledPitch,
  ) => PitchProjectionResult;
  readonly frequencyForMidi: (midi: MidiPitch) => number;
  /** C..B step order, then numeric alteration. */
  readonly compareSpelledPitchClasses: (
    left: SpelledPitchClass,
    right: SpelledPitchClass,
  ) => Comparison;
  /** Numeric octave, then the spelled-pitch-class comparator. */
  readonly compareSpelledPitches: (
    left: SpelledPitch,
    right: SpelledPitch,
  ) => Comparison;

  readonly normalizeBeatValue: (input: BeatValueInput) => BeatValueResult;
  readonly makeBeatPosition: (input: BeatValueInput) => BeatPositionResult;
  readonly makeBeatDuration: (input: BeatValueInput) => BeatDurationResult;
  readonly addBeatValues: (
    left: BeatValue,
    right: BeatValue,
  ) => BeatAdditionResult;
  readonly subtractBeatValues: (
    left: BeatValue,
    right: BeatValue,
  ) => BeatSubtractionResult;
  readonly compareBeatValues: (
    left: BeatValue,
    right: BeatValue,
  ) => BeatComparison;
  /** Exact `numerator * 960 / denominator`; the branded input guarantees an integer. */
  readonly beatValueToMidiTicks: (value: BeatValue) => MidiTick;
  readonly makeBeatRange: (
    start: BeatPosition,
    end: BeatPosition,
  ) => BeatRangeResult;
  readonly accumulateTimeline: (
    durations: readonly BeatDuration[],
  ) => TimelineAccumulationResult;
  readonly makeMeter: (input: MeterInput) => MeterResult;
  readonly makeTempoBpm: (received: number) => TempoResult;
  readonly measureCapacity: (meter: Meter) => BeatDuration;

  readonly makeKeyMode: (received: string) => KeyModeResult;
  readonly makeInstrumentId: (received: string) => InstrumentIdResult;
  readonly makeChordDegree: {
    <N extends DegreeNumber>(
      input: ChordDegreeInput<N>,
    ): ChordDegreeResult<N>;
    (input: ChordDegreeInput): ChordDegreeResult;
  };
  readonly validateChordDegreeArray: (
    field: "extensions" | "additions" | "alterations",
    values: readonly ChordDegree[],
  ) => ChordDegreeArrayResult;
  readonly validateOmissionArray: (
    values: readonly DegreeNumber[],
  ) => OmissionArrayResult;
  readonly makeMidiRange: (
    lowMidi: number,
    highMidi: number,
  ) => MidiRangeResult;
  readonly makeAutoVoiceCount: (received: number) => AutoVoiceCountResult;
  readonly makeChordSpec: (input: ChordSpecInput) => ChordSpecResult;
  readonly makeCustomChordSpec: (
    input: CustomChordSpecInput,
  ) => CustomChordSpecResult;
  readonly makeAutoVoicing: (
    input: AutoVoicingInput,
    chordBass: SpelledPitchClass | null,
  ) => VoicingResult<AutoVoicing, AutoVoicingRefusal>;
  readonly makeManualVoicing: (
    input: ManualVoicingInput,
    chordBass: SpelledPitchClass | null,
  ) => VoicingResult<ManualVoicing, ManualVoicingRefusal>;
  readonly makeFrozenVoicing: (
    input: FrozenVoicingInput,
    chordBass: SpelledPitchClass | null,
  ) => VoicingResult<FrozenVoicing, FrozenVoicingRefusal>;
  readonly makeChordEvent: (input: ChordEventInput) => ChordEventResult;
  readonly transitionFrozenToAuto: (
    request: FrozenToAutoRequest,
  ) => FrozenToAutoResult;
  readonly makePlaybackSettings: (
    input: PlaybackSettingsInput,
  ) => PlaybackSettingsResult;

  readonly compareDomainPaths: (
    left: DomainPath,
    right: DomainPath,
  ) => Comparison;
  readonly compareValidationIssues: ValidationDiagnosticComparator;
}

/** Immutable production implementation of the reviewed F1 callable surface. */
export const domainOperations: DomainOperations = Object.freeze({
  parseStableId,
  createProductionStableIdFactory,
  copyDomain,
  makeSpelledPitchClass,
  makeSpelledPitch,
  makeMidiPitch,
  pitchClassOf,
  projectSpelledPitch,
  frequencyForMidi,
  compareSpelledPitchClasses,
  compareSpelledPitches,
  normalizeBeatValue,
  makeBeatPosition,
  makeBeatDuration,
  addBeatValues,
  subtractBeatValues,
  compareBeatValues,
  beatValueToMidiTicks,
  makeBeatRange,
  accumulateTimeline,
  makeMeter,
  makeTempoBpm,
  measureCapacity,
  makeKeyMode,
  makeInstrumentId,
  makeChordDegree,
  validateChordDegreeArray,
  validateOmissionArray,
  makeMidiRange,
  makeAutoVoiceCount,
  makeChordSpec,
  makeCustomChordSpec,
  makeAutoVoicing,
  makeManualVoicing,
  makeFrozenVoicing,
  makeChordEvent,
  transitionFrozenToAuto,
  makePlaybackSettings,
  compareDomainPaths,
  compareValidationIssues,
});
