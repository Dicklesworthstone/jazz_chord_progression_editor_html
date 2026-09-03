/**
 * Explicit semantic equality over every persisted v2 document field
 * (E0 contract section 3.3). This is the independently owned oracle the
 * canonical-JSON round-trip gate injects: the encoder cannot certify its
 * own output, so this comparison never consults serialized bytes — it
 * walks the two document VALUES field by field in declared order.
 *
 * Number comparison uses Object.is so persisted negative zero survives
 * the gate exactly as F2 accepts it (the encoder emits the `-0` token for
 * the same reason). No field is skipped, defaulted, or coerced; the one
 * optional persisted field (`playback.grooveStyleId`, jcpe-jnnu) must be
 * present on both sides or absent on both sides.
 */
import type {
  ChordDegree,
  ChordEvent,
  KeyContext,
  Measure,
  MeasureCompletion,
  ProgressionDocumentV2,
  Section,
  SpelledPitch,
  SpelledPitchClass,
  Voicing,
} from "./index";

function numbersEqual(left: number, right: number): boolean {
  return Object.is(left, right);
}

function pitchClassesEqual(
  left: SpelledPitchClass | null,
  right: SpelledPitchClass | null,
): boolean {
  if (left === null || right === null) return left === right;
  return left.step === right.step && numbersEqual(left.alter, right.alter);
}

function pitchesEqual(left: SpelledPitch, right: SpelledPitch): boolean {
  return (
    left.step === right.step &&
    numbersEqual(left.alter, right.alter) &&
    numbersEqual(left.octave, right.octave)
  );
}

function keysEqual(
  left: KeyContext | null,
  right: KeyContext | null,
): boolean {
  if (left === null || right === null) return left === right;
  return pitchClassesEqual(left.tonic, right.tonic) && left.mode === right.mode;
}

function degreesEqual(left: ChordDegree, right: ChordDegree): boolean {
  return (
    numbersEqual(left.number, right.number) &&
    numbersEqual(left.alter, right.alter)
  );
}

function degreeListsEqual(
  left: readonly ChordDegree[],
  right: readonly ChordDegree[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((degree, index) => {
    const other = right[index];
    return other !== undefined && degreesEqual(degree, other);
  });
}

function beatValuesEqual(
  left: Readonly<{ numerator: number; denominator: number }>,
  right: Readonly<{ numerator: number; denominator: number }>,
): boolean {
  return (
    numbersEqual(left.numerator, right.numerator) &&
    numbersEqual(left.denominator, right.denominator)
  );
}

function completionsEqual(
  left: MeasureCompletion,
  right: MeasureCompletion,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "empty" || left.kind === "complete") return true;
  if (right.kind !== "pickup" && right.kind !== "incomplete") return false;
  return (
    beatValuesEqual(left.expectedDuration, right.expectedDuration) &&
    left.reason === right.reason
  );
}

function voicingsEqual(left: Voicing, right: Voicing): boolean {
  if (left.mode !== right.mode) return false;
  if (left.mode === "auto" && right.mode === "auto") {
    return (
      left.family === right.family &&
      numbersEqual(left.voiceCount, right.voiceCount) &&
      numbersEqual(left.range.lowMidi, right.range.lowMidi) &&
      numbersEqual(left.range.highMidi, right.range.highMidi) &&
      left.bassPolicy === right.bassPolicy
    );
  }
  if (left.mode === "auto" || right.mode === "auto") return false;
  if (left.pitches.length !== right.pitches.length) return false;
  const pitchesMatch = left.pitches.every((pitch, index) => {
    const other = right.pitches[index];
    return other !== undefined && pitchesEqual(pitch, other);
  });
  if (!pitchesMatch || left.bassPolicy !== right.bassPolicy) return false;
  if (left.mode === "frozen" && right.mode === "frozen") {
    return (
      left.generatedBy.engineVersion === right.generatedBy.engineVersion &&
      left.generatedBy.family === right.generatedBy.family
    );
  }
  return left.mode === "manual" && right.mode === "manual";
}

function chordsEqual(
  left: ChordEvent["chord"],
  right: ChordEvent["chord"],
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "custom" && right.kind === "custom") {
    if (left.pitchNames.length !== right.pitchNames.length) return false;
    return (
      left.sourceText === right.sourceText &&
      left.label === right.label &&
      left.pitchNames.every((pitch, index) => {
        const other = right.pitchNames[index];
        return other !== undefined && pitchClassesEqual(pitch, other);
      }) &&
      pitchClassesEqual(left.bass, right.bass)
    );
  }
  if (left.kind !== "parsed" || right.kind !== "parsed") return false;
  const sixthEqual =
    left.sixth === null || right.sixth === null
      ? left.sixth === right.sixth
      : degreesEqual(left.sixth, right.sixth);
  return (
    left.sourceText === right.sourceText &&
    pitchClassesEqual(left.root, right.root) &&
    left.triad === right.triad &&
    sixthEqual &&
    left.seventh === right.seventh &&
    degreeListsEqual(left.extensions, right.extensions) &&
    degreeListsEqual(left.additions, right.additions) &&
    degreeListsEqual(left.alterations, right.alterations) &&
    left.omissions.length === right.omissions.length &&
    left.omissions.every((number, index) =>
      numbersEqual(number, right.omissions[index] ?? Number.NaN),
    ) &&
    pitchClassesEqual(left.bass, right.bass) &&
    left.colorPolicy === right.colorPolicy
  );
}

function eventsEqual(left: ChordEvent, right: ChordEvent): boolean {
  return (
    left.id === right.id &&
    beatValuesEqual(left.duration, right.duration) &&
    left.annotation === right.annotation &&
    chordsEqual(left.chord, right.chord) &&
    voicingsEqual(left.voicing, right.voicing)
  );
}

function measuresEqual(left: Measure, right: Measure): boolean {
  if (left.id !== right.id) return false;
  if (left.events.length !== right.events.length) return false;
  const eventsMatch = left.events.every((event, index) => {
    const other = right.events[index];
    return other !== undefined && eventsEqual(event, other);
  });
  return eventsMatch && completionsEqual(left.completion, right.completion);
}

function sectionsEqual(left: Section, right: Section): boolean {
  if (left.measures.length !== right.measures.length) return false;
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.annotation === right.annotation &&
    keysEqual(left.keyOverride, right.keyOverride) &&
    left.voiceLeadingBoundary === right.voiceLeadingBoundary &&
    left.measures.every((measure, index) => {
      const other = right.measures[index];
      return other !== undefined && measuresEqual(measure, other);
    })
  );
}

export function documentsSemanticallyEqual(
  left: ProgressionDocumentV2,
  right: ProgressionDocumentV2,
): boolean {
  if (left.sections.length !== right.sections.length) return false;
  const grooveLeft = left.playback.grooveStyleId;
  const grooveRight = right.playback.grooveStyleId;
  return (
    left.schema === right.schema &&
    left.id === right.id &&
    left.title === right.title &&
    left.description === right.description &&
    numbersEqual(left.meter.beatsPerBar, right.meter.beatsPerBar) &&
    numbersEqual(left.meter.beatUnit, right.meter.beatUnit) &&
    numbersEqual(left.tempoBpm, right.tempoBpm) &&
    keysEqual(left.key, right.key) &&
    left.sections.every((section, index) => {
      const other = right.sections[index];
      return other !== undefined && sectionsEqual(section, other);
    }) &&
    left.playback.instrumentId === right.playback.instrumentId &&
    numbersEqual(left.playback.masterVolume, right.playback.masterVolume) &&
    numbersEqual(left.playback.reverbAmount, right.playback.reverbAmount) &&
    numbersEqual(left.playback.countInBars, right.playback.countInBars) &&
    (grooveLeft === undefined
      ? grooveRight === undefined
      : grooveLeft === grooveRight)
  );
}
