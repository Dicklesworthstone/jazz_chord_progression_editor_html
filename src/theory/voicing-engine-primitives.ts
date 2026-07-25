import {
  compareSpelledPitches,
  makeSpelledPitch,
  pitchClassOf,
  projectSpelledPitch,
  type ChordDegree,
  type Comparison,
  type DomainResult,
  type MidiPitch,
  type MidiRange,
  type PitchClass,
  type SpelledPitch,
  type SpelledPitchClass,
} from "../domain";
import {
  MAX_THEORY_DEGREES_PER_REALIZATION,
  type ParsedResolvedChord,
  type SemanticRealization,
  type SemanticRealizationId,
} from "./resolution-contract";
import {
  MAX_VOICING_CONSTRAINT_OBSERVATION_VOICES,
  MAX_VOICING_EVIDENCE_ID_CODE_POINTS,
  MAX_VOICING_EVIDENCE_ID_UTF8_BYTES,
  MIN_VOICING_EVIDENCE_ID_CODE_POINTS,
  MAX_VOICING_REFUSAL_CONSTRAINT_OBSERVATIONS,
  VOICING_CONSTRAINT_CODES,
  VOICING_CONSTRAINT_UNSATISFIED_REASONS,
  VOICING_LOCAL_SCORE_AXIS_ORDER,
  VOICING_LOW_REGISTER_SPACING_BANDS,
  VOICING_MEMORY_LIMITS,
  VOICING_WORK_LIMITS,
  type Drop2TransformEvidence,
  type RealizationUnavailableRefusal,
  type UnsatisfiedVoicingConstraint,
  type VoicingCandidate,
  type VoicingCandidateVoice,
  type VoicingConstraintsUnsatisfiedRefusal,
  type VoicingLocalScore,
  type VoicingMemoryCounterName,
  type VoicingTermination,
  type VoicingWorkCounterName,
  type VoicingWorkEvidence,
  type VoicingWorkLimitExceededRefusal,
} from "./voicing-candidates-contract";

const MIN_PROJECTABLE_SPN_OCTAVE = -2;
const MAX_PROJECTABLE_SPN_OCTAVE = 9;
const DROP2_LOWERING_SEMITONES = 12;
const EMPTY_REFUSAL_PATH = Object.freeze([] as const);
const POLICY_REFUSAL_PATH = Object.freeze(["policy"] as const);

const CANONICAL_VOICING_DEGREES = Object.freeze([
  Object.freeze({ number: 1, alter: 0 }),
  Object.freeze({ number: 2, alter: 0 }),
  Object.freeze({ number: 3, alter: -1 }),
  Object.freeze({ number: 3, alter: 0 }),
  Object.freeze({ number: 4, alter: 0 }),
  Object.freeze({ number: 5, alter: -1 }),
  Object.freeze({ number: 5, alter: 0 }),
  Object.freeze({ number: 5, alter: 1 }),
  Object.freeze({ number: 6, alter: 0 }),
  Object.freeze({ number: 7, alter: -2 }),
  Object.freeze({ number: 7, alter: -1 }),
  Object.freeze({ number: 7, alter: 0 }),
  Object.freeze({ number: 9, alter: -1 }),
  Object.freeze({ number: 9, alter: 0 }),
  Object.freeze({ number: 9, alter: 1 }),
  Object.freeze({ number: 11, alter: 0 }),
  Object.freeze({ number: 11, alter: 1 }),
  Object.freeze({ number: 13, alter: -1 }),
  Object.freeze({ number: 13, alter: 0 }),
] satisfies readonly ChordDegree[]);

/**
 * Runtime-deep-freeze a newly allocated plain record/array graph.
 *
 * Callers must not pass an input-owned mutable graph: `Object.freeze` is an
 * observable mutation. V0 uses this only while publishing records it owns.
 */
const DEEPLY_FROZEN = new WeakSet();

export function deepFreezeOwned<Value>(value: Value): Readonly<Value> {
  if (typeof value !== "object" || value === null) {
    return value;
  }
  // Skip only subtrees this function itself already sealed: published
  // results share role contexts, endpoints, and constant records across
  // calls, and re-walking those dominates per-call publication cost. An
  // externally frozen node still gets its children walked, because shallow
  // freezing elsewhere proves nothing about the subtree.
  if (DEEPLY_FROZEN.has(value)) return value;
  for (const child of Object.values(value)) deepFreezeOwned(child);
  DEEPLY_FROZEN.add(value);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

export function sameChordDegree(
  left: ChordDegree,
  right: ChordDegree,
): boolean {
  return left.number === right.number && left.alter === right.alter;
}

/** Exact stable key; enharmonic pitch-class equivalence never enters it. */
export function chordDegreeKey(degree: ChordDegree): string {
  return `${degree.number.toString()}:${degree.alter.toString()}`;
}

/** Domain degree-number order followed by numeric alteration. */
export function compareChordDegrees(
  left: ChordDegree,
  right: ChordDegree,
): Comparison {
  if (left.number < right.number) return -1;
  if (left.number > right.number) return 1;
  if (left.alter < right.alter) return -1;
  if (left.alter > right.alter) return 1;
  return 0;
}

function canonicalVoicingDegreeRank(degree: ChordDegree): number | null {
  const index = CANONICAL_VOICING_DEGREES.findIndex((candidate) =>
    sameChordDegree(candidate, degree),
  );
  return index === -1 ? null : index;
}

/**
 * V0 adaptive-fill order. Printed policy members precede any remaining valid
 * degree, whose fallback is domain number then alteration order.
 */
export function compareChordDegreesByVoicingPriority(
  left: ChordDegree,
  right: ChordDegree,
): Comparison {
  const leftRank = canonicalVoicingDegreeRank(left);
  const rightRank = canonicalVoicingDegreeRank(right);
  if (leftRank !== null && rightRank !== null) {
    return compareNumbers(leftRank, rightRank);
  }
  if (leftRank !== null) return -1;
  if (rightRank !== null) return 1;
  return compareChordDegrees(left, right);
}

export function hasExactChordDegree(
  values: readonly ChordDegree[],
  target: ChordDegree,
): boolean {
  return values.some((value) => sameChordDegree(value, target));
}

export type VoicingEvidenceIdentifierMeasurement = Readonly<{
  codePoints: number;
  utf8Bytes: number;
}>;

export type VoicingEvidenceIdentifierRefusal = Readonly<{
  code: "voicing.evidence_identifier_invalid";
  reason: "code-point-count" | "utf8-byte-count";
  received: number;
  minimum: number;
  maximum: number;
}>;

export type VoicingEvidenceIdentifierResult = DomainResult<
  VoicingEvidenceIdentifierMeasurement,
  VoicingEvidenceIdentifierRefusal
>;

/** Exact code-point-first, UTF-8-byte-second identifier validation. */
export function validateVoicingEvidenceIdentifier(
  value: string,
): VoicingEvidenceIdentifierResult {
  const codePoints = Array.from(value).length;
  if (
    codePoints < MIN_VOICING_EVIDENCE_ID_CODE_POINTS ||
    codePoints > MAX_VOICING_EVIDENCE_ID_CODE_POINTS
  ) {
    return Object.freeze({
      ok: false,
      refusal: Object.freeze({
        code: "voicing.evidence_identifier_invalid",
        reason: "code-point-count",
        received: codePoints,
        minimum: MIN_VOICING_EVIDENCE_ID_CODE_POINTS,
        maximum: MAX_VOICING_EVIDENCE_ID_CODE_POINTS,
      }),
    });
  }

  const utf8Bytes = new TextEncoder().encode(value).byteLength;
  if (utf8Bytes > MAX_VOICING_EVIDENCE_ID_UTF8_BYTES) {
    return Object.freeze({
      ok: false,
      refusal: Object.freeze({
        code: "voicing.evidence_identifier_invalid",
        reason: "utf8-byte-count",
        received: utf8Bytes,
        minimum: 0,
        maximum: MAX_VOICING_EVIDENCE_ID_UTF8_BYTES,
      }),
    });
  }

  return Object.freeze({
    ok: true,
    value: Object.freeze({ codePoints, utf8Bytes }),
  });
}

export type VoicingSourceDegreeFact = Readonly<{
  sourceDegreeIndex: number;
  degree: ChordDegree;
  spelledPitchClass: SpelledPitchClass;
  pitchClass: PitchClass;
  required: boolean;
  optional: boolean;
  guideTone: boolean;
}>;

export type VoicingSourceDegreeFacts = readonly [
  VoicingSourceDegreeFact,
  ...VoicingSourceDegreeFact[],
];

export type BoundVoicingRealization = Readonly<{
  realization: SemanticRealization;
  sourceDegrees: VoicingSourceDegreeFacts;
}>;

function requireAligned<Value>(
  values: readonly Value[],
  index: number,
  field: string,
): Value {
  const value = values[index];
  if (value === undefined) {
    throw new RangeError(
      `T1 realization ${field} lost index ${index.toString()} alignment`,
    );
  }
  return value;
}

function assertRealizationRoleMembership(realization: SemanticRealization): void {
  const roleGroups = Object.freeze([
    realization.requiredDegrees,
    realization.optionalDegrees,
    realization.guideToneDegrees,
  ]);
  for (const group of roleGroups) {
    for (const degree of group) {
      if (!hasExactChordDegree(realization.degrees, degree)) {
        throw new RangeError(
          "T1 realization role degree is absent from its degree tuple",
        );
      }
    }
  }
}

/**
 * Bind exact T1 degree, spelling, projection, role, and source-index facts once.
 * Candidate construction must carry these facts forward rather than respelling.
 */
export function bindVoicingSourceDegrees(
  realization: SemanticRealization,
): VoicingSourceDegreeFacts {
  if (
    realization.degrees.length === 0 ||
    realization.degrees.length > MAX_THEORY_DEGREES_PER_REALIZATION ||
    realization.spelledPitchNames.length !== realization.degrees.length ||
    realization.pitchClasses.length !== realization.degrees.length
  ) {
    throw new RangeError("T1 realization index-aligned tuple contract was violated");
  }
  assertRealizationRoleMembership(realization);

  const sourceDegrees: VoicingSourceDegreeFact[] = [];
  for (let index = 0; index < realization.degrees.length; index += 1) {
    const degree = requireAligned(realization.degrees, index, "degrees");
    const spelledPitchClass = requireAligned(
      realization.spelledPitchNames,
      index,
      "spelledPitchNames",
    );
    const pitchClass = requireAligned(
      realization.pitchClasses,
      index,
      "pitchClasses",
    );
    if (pitchClassOf(spelledPitchClass) !== pitchClass) {
      throw new RangeError("T1 realization spelling and pitch class disagree");
    }
    if (
      sourceDegrees.some((fact) => sameChordDegree(fact.degree, degree))
    ) {
      throw new RangeError("T1 realization contains a duplicate exact degree");
    }
    sourceDegrees.push(
      Object.freeze({
        sourceDegreeIndex: index,
        degree,
        spelledPitchClass,
        pitchClass,
        required: hasExactChordDegree(realization.requiredDegrees, degree),
        optional: hasExactChordDegree(realization.optionalDegrees, degree),
        guideTone: hasExactChordDegree(realization.guideToneDegrees, degree),
      }),
    );
  }

  const [first, ...rest] = sourceDegrees;
  if (first === undefined) {
    throw new RangeError("T1 realization unexpectedly became empty");
  }
  return Object.freeze([first, ...rest]);
}

function availableRealizationIds(
  resolved: ParsedResolvedChord,
): RealizationUnavailableRefusal["available"] {
  const first = resolved.realizations[0];
  if (resolved.realizations.length === 1) {
    return Object.freeze([first.id]);
  }
  const second = resolved.realizations[1];
  const third = resolved.realizations[2];
  const fourth = resolved.realizations[3];
  return Object.freeze([first.id, second.id, third.id, fourth.id]);
}

/** Select exactly one requested T1 realization; never infer or merge one. */
export function bindVoicingRealization(
  resolved: ParsedResolvedChord,
  realizationId: SemanticRealizationId,
): DomainResult<BoundVoicingRealization, RealizationUnavailableRefusal> {
  const realization = resolved.realizations.find(
    (candidate) => candidate.id === realizationId,
  );
  if (realization === undefined) {
    return Object.freeze({
      ok: false,
      refusal: Object.freeze({
        code: "voicing.realization_unavailable",
        path: Object.freeze(["realizationId"] as const),
        received: realizationId,
        available: availableRealizationIds(resolved),
      }),
    });
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      realization,
      sourceDegrees: bindVoicingSourceDegrees(realization),
    }),
  });
}

export function findVoicingSourceDegree(
  sourceDegrees: readonly VoicingSourceDegreeFact[],
  degree: ChordDegree,
): VoicingSourceDegreeFact | null {
  return (
    sourceDegrees.find((candidate) => sameChordDegree(candidate.degree, degree)) ??
    null
  );
}

export type SpelledRegisterPlacement = Readonly<{
  pitch: SpelledPitch;
  midi: MidiPitch;
}>;

export type SourceDegreeRegisterPlacement = SpelledRegisterPlacement &
  Readonly<{
    sourceDegree: VoicingSourceDegreeFact;
  }>;

export type SpelledRegisterPlacementValueVisitor<Stop> = (
  pitch: SpelledPitch,
  midi: MidiPitch,
) => Stop | null;

/**
 * Visit each exact in-range spelling projection without first materializing a
 * placement array. The visitor therefore owns the cap-before-allocation point
 * for any retained placement record.
 */
export function visitSpelledRegisterPlacementValues<Stop>(
  spelledPitchClass: SpelledPitchClass,
  range: MidiRange,
  visitor: SpelledRegisterPlacementValueVisitor<Stop>,
): Stop | null {
  for (
    let octave = MIN_PROJECTABLE_SPN_OCTAVE;
    octave <= MAX_PROJECTABLE_SPN_OCTAVE;
    octave += 1
  ) {
    const pitch = makeSpelledPitch({
      step: spelledPitchClass.step,
      alter: spelledPitchClass.alter,
      octave,
    });
    if (!pitch.ok) {
      throw new RangeError("V0 produced an invalid integer register octave");
    }
    const projected = projectSpelledPitch(pitch.value);
    if (!projected.ok) continue;
    if (projected.value.midi < range.lowMidi) continue;
    if (projected.value.midi > range.highMidi) continue;
    const stopped = visitor(pitch.value, projected.value.midi);
    if (stopped !== null) return stopped;
  }
  return null;
}

/**
 * Enumerate exact written-octave placements in ascending MIDI order. Calling
 * the public domain projector is essential for B#/Cb-style octave crossings.
 */
export function enumerateSpelledRegisterPlacements(
  spelledPitchClass: SpelledPitchClass,
  range: MidiRange,
): readonly SpelledRegisterPlacement[] {
  const placements: SpelledRegisterPlacement[] = [];
  visitSpelledRegisterPlacementValues<never>(
    spelledPitchClass,
    range,
    (pitch, midi) => {
      placements.push(
        Object.freeze({
          pitch,
          midi,
        }),
      );
      return null;
    },
  );
  return Object.freeze(placements);
}

export function enumerateSourceDegreeRegisterPlacements(
  sourceDegree: VoicingSourceDegreeFact,
  range: MidiRange,
): readonly SourceDegreeRegisterPlacement[] {
  const placements: SourceDegreeRegisterPlacement[] = [];
  visitSpelledRegisterPlacementValues<never>(
    sourceDegree.spelledPitchClass,
    range,
    (pitch, midi) => {
      placements.push(
        Object.freeze({
          pitch,
          midi,
          sourceDegree,
        }),
      );
      return null;
    },
  );
  return Object.freeze(placements);
}

export type LowRegisterSpacingViolation = Readonly<{
  lowerOrdinal: number;
  upperOrdinal: number;
  lowerMidi: MidiPitch;
  upperMidi: MidiPitch;
  actualSemitones: number;
  minimumSemitones: number;
}>;

export function minimumLowRegisterSpacing(lowerMidi: MidiPitch): number {
  for (const band of VOICING_LOW_REGISTER_SPACING_BANDS) {
    if (lowerMidi <= band.maximumLowerMidi) return band.minimumSemitones;
  }
  return VOICING_LOW_REGISTER_SPACING_BANDS[3].minimumSemitones;
}

/** Report every adjacent low-register violation in input voice order. */
export function lowRegisterSpacingViolations(
  voices: readonly Readonly<{ midi: MidiPitch }>[],
): readonly LowRegisterSpacingViolation[] {
  const violations: LowRegisterSpacingViolation[] = [];
  for (let index = 1; index < voices.length; index += 1) {
    const lower = requireAligned(voices, index - 1, "lower voice");
    const upper = requireAligned(voices, index, "upper voice");
    const actualSemitones = upper.midi - lower.midi;
    const minimumSemitones = minimumLowRegisterSpacing(lower.midi);
    if (actualSemitones < minimumSemitones) {
      violations.push(
        Object.freeze({
          lowerOrdinal: index - 1,
          upperOrdinal: index,
          lowerMidi: lower.midi,
          upperMidi: upper.midi,
          actualSemitones,
          minimumSemitones,
        }),
      );
    }
  }
  return Object.freeze(violations);
}

export const DROP2_PRIMITIVE_REFUSAL_REASONS = Object.freeze([
  "voice-count",
  "closed-source-order",
  "closed-source-span",
  "lowered-pitch-out-of-range",
  "lowered-pitch-projection-mismatch",
  "transformed-duplicate-midi",
] as const);

export type Drop2PrimitiveRefusalReason =
  (typeof DROP2_PRIMITIVE_REFUSAL_REASONS)[number];

export type Drop2PrimitiveRefusal = Readonly<{
  code: "voicing.drop2_transform_invalid";
  reason: Drop2PrimitiveRefusalReason;
}>;

export type Drop2PrimitiveValue = Readonly<{
  voices: readonly VoicingCandidateVoice[];
  evidence: Drop2TransformEvidence;
}>;

export type Drop2PrimitiveResult = DomainResult<
  Drop2PrimitiveValue,
  Drop2PrimitiveRefusal
>;

function drop2Failure(reason: Drop2PrimitiveRefusalReason): Drop2PrimitiveResult {
  return Object.freeze({
    ok: false,
    refusal: Object.freeze({
      code: "voicing.drop2_transform_invalid",
      reason,
    }),
  });
}

function requiredMidi(values: readonly MidiPitch[], index: number): MidiPitch {
  return requireAligned(values, index, "Drop-2 MIDI evidence");
}

function makeDrop2Evidence(
  closedSourceMidi: readonly MidiPitch[],
  secondFromTopSourceOrdinal: number,
  transformedMidi: readonly MidiPitch[],
): Drop2TransformEvidence {
  switch (closedSourceMidi.length) {
    case 4:
      return Object.freeze({
        closedSourceMidi: Object.freeze([
          requiredMidi(closedSourceMidi, 0),
          requiredMidi(closedSourceMidi, 1),
          requiredMidi(closedSourceMidi, 2),
          requiredMidi(closedSourceMidi, 3),
        ] as const),
        secondFromTopSourceOrdinal,
        loweredBySemitones: DROP2_LOWERING_SEMITONES,
        transformedMidi: Object.freeze([
          requiredMidi(transformedMidi, 0),
          requiredMidi(transformedMidi, 1),
          requiredMidi(transformedMidi, 2),
          requiredMidi(transformedMidi, 3),
        ] as const),
      });
    case 5:
      return Object.freeze({
        closedSourceMidi: Object.freeze([
          requiredMidi(closedSourceMidi, 0),
          requiredMidi(closedSourceMidi, 1),
          requiredMidi(closedSourceMidi, 2),
          requiredMidi(closedSourceMidi, 3),
          requiredMidi(closedSourceMidi, 4),
        ] as const),
        secondFromTopSourceOrdinal,
        loweredBySemitones: DROP2_LOWERING_SEMITONES,
        transformedMidi: Object.freeze([
          requiredMidi(transformedMidi, 0),
          requiredMidi(transformedMidi, 1),
          requiredMidi(transformedMidi, 2),
          requiredMidi(transformedMidi, 3),
          requiredMidi(transformedMidi, 4),
        ] as const),
      });
    case 6:
      return Object.freeze({
        closedSourceMidi: Object.freeze([
          requiredMidi(closedSourceMidi, 0),
          requiredMidi(closedSourceMidi, 1),
          requiredMidi(closedSourceMidi, 2),
          requiredMidi(closedSourceMidi, 3),
          requiredMidi(closedSourceMidi, 4),
          requiredMidi(closedSourceMidi, 5),
        ] as const),
        secondFromTopSourceOrdinal,
        loweredBySemitones: DROP2_LOWERING_SEMITONES,
        transformedMidi: Object.freeze([
          requiredMidi(transformedMidi, 0),
          requiredMidi(transformedMidi, 1),
          requiredMidi(transformedMidi, 2),
          requiredMidi(transformedMidi, 3),
          requiredMidi(transformedMidi, 4),
          requiredMidi(transformedMidi, 5),
        ] as const),
      });
    case 7:
      return Object.freeze({
        closedSourceMidi: Object.freeze([
          requiredMidi(closedSourceMidi, 0),
          requiredMidi(closedSourceMidi, 1),
          requiredMidi(closedSourceMidi, 2),
          requiredMidi(closedSourceMidi, 3),
          requiredMidi(closedSourceMidi, 4),
          requiredMidi(closedSourceMidi, 5),
          requiredMidi(closedSourceMidi, 6),
        ] as const),
        secondFromTopSourceOrdinal,
        loweredBySemitones: DROP2_LOWERING_SEMITONES,
        transformedMidi: Object.freeze([
          requiredMidi(transformedMidi, 0),
          requiredMidi(transformedMidi, 1),
          requiredMidi(transformedMidi, 2),
          requiredMidi(transformedMidi, 3),
          requiredMidi(transformedMidi, 4),
          requiredMidi(transformedMidi, 5),
          requiredMidi(transformedMidi, 6),
        ] as const),
      });
    default:
      throw new RangeError("Drop-2 evidence requires four through seven voices");
  }
}

function replaceVoicePitch(
  voice: VoicingCandidateVoice,
  pitch: SpelledPitch,
  midi: MidiPitch,
): VoicingCandidateVoice {
  switch (voice.provenance) {
    case "realization":
      return Object.freeze({ ...voice, pitch, midi });
    case "doubling":
      return Object.freeze({ ...voice, pitch, midi });
    case "slash-bass":
      return Object.freeze({ ...voice, pitch, midi });
  }
}

/** Apply the literal closed-source Drop-2 transform without mutating voices. */
export function applyDrop2Transform(
  closedSource: readonly VoicingCandidateVoice[],
): Drop2PrimitiveResult {
  if (closedSource.length < 4 || closedSource.length > 7) {
    return drop2Failure("voice-count");
  }
  for (let index = 1; index < closedSource.length; index += 1) {
    const lower = requireAligned(closedSource, index - 1, "Drop-2 lower voice");
    const upper = requireAligned(closedSource, index, "Drop-2 upper voice");
    if (lower.midi >= upper.midi) return drop2Failure("closed-source-order");
  }
  const lowest = requireAligned(closedSource, 0, "Drop-2 lowest voice");
  const highest = requireAligned(
    closedSource,
    closedSource.length - 1,
    "Drop-2 highest voice",
  );
  if (highest.midi - lowest.midi > 11) {
    return drop2Failure("closed-source-span");
  }

  const secondFromTopSourceOrdinal = closedSource.length - 2;
  const sourceVoice = requireAligned(
    closedSource,
    secondFromTopSourceOrdinal,
    "Drop-2 second-from-top voice",
  );
  const loweredPitch = makeSpelledPitch({
    step: sourceVoice.pitch.step,
    alter: sourceVoice.pitch.alter,
    octave: sourceVoice.pitch.octave - 1,
  });
  if (!loweredPitch.ok) {
    return drop2Failure("lowered-pitch-out-of-range");
  }
  const loweredProjection = projectSpelledPitch(loweredPitch.value);
  if (!loweredProjection.ok) {
    return drop2Failure("lowered-pitch-out-of-range");
  }
  if (
    loweredProjection.value.midi !==
    sourceVoice.midi - DROP2_LOWERING_SEMITONES
  ) {
    return drop2Failure("lowered-pitch-projection-mismatch");
  }

  const transformed = [...closedSource];
  transformed[secondFromTopSourceOrdinal] = replaceVoicePitch(
    sourceVoice,
    loweredPitch.value,
    loweredProjection.value.midi,
  );
  transformed.sort((left, right) => left.midi - right.midi);
  for (let index = 1; index < transformed.length; index += 1) {
    const lower = requireAligned(transformed, index - 1, "transformed lower voice");
    const upper = requireAligned(transformed, index, "transformed upper voice");
    if (lower.midi === upper.midi) {
      return drop2Failure("transformed-duplicate-midi");
    }
  }

  const closedSourceMidi = Object.freeze(closedSource.map((voice) => voice.midi));
  const transformedMidi = Object.freeze(transformed.map((voice) => voice.midi));
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      voices: Object.freeze(transformed),
      evidence: makeDrop2Evidence(
        closedSourceMidi,
        secondFromTopSourceOrdinal,
        transformedMidi,
      ),
    }),
  });
}

function sameNullableDegree(
  left: ChordDegree | null,
  right: ChordDegree | null,
): boolean {
  if (left === null || right === null) return left === right;
  return sameChordDegree(left, right);
}

export function sameCandidateVoiceIdentity(
  left: VoicingCandidateVoice,
  right: VoicingCandidateVoice,
): boolean {
  return (
    left.midi === right.midi &&
    left.pitch.octave === right.pitch.octave &&
    left.pitch.step === right.pitch.step &&
    left.pitch.alter === right.pitch.alter &&
    sameNullableDegree(left.degree, right.degree) &&
    left.provenance === right.provenance &&
    left.sourceDegreeIndex === right.sourceDegreeIndex
  );
}

export function sameCandidateIdentity(
  left: readonly VoicingCandidateVoice[],
  right: readonly VoicingCandidateVoice[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((voice, index) => {
    const other = right[index];
    return other !== undefined && sameCandidateVoiceIdentity(voice, other);
  });
}

/** Stable debug/map key over exactly the normative candidate identity fields. */
export function candidateIdentityKey(
  voices: readonly VoicingCandidateVoice[],
): string {
  return voices
    .map((voice) => {
      const degree =
        voice.degree === null ? "null" : chordDegreeKey(voice.degree);
      const sourceIndex =
        voice.sourceDegreeIndex === null
          ? "null"
          : voice.sourceDegreeIndex.toString();
      return [
        voice.midi.toString(),
        voice.pitch.octave.toString(),
        voice.pitch.step,
        voice.pitch.alter.toString(),
        degree,
        voice.provenance,
        sourceIndex,
      ].join("/");
    })
    .join("|");
}

function compareNumbers(left: number, right: number): Comparison {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareUtf16(left: string, right: string): Comparison {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareNullableDegrees(
  left: ChordDegree | null,
  right: ChordDegree | null,
): Comparison {
  if (left === null && right === null) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return compareChordDegrees(left, right);
}

function compareLexicographically<Value>(
  left: readonly Value[],
  right: readonly Value[],
  compare: (leftValue: Value, rightValue: Value) => Comparison,
): Comparison {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftValue = requireAligned(left, index, "left comparison value");
    const rightValue = requireAligned(right, index, "right comparison value");
    const comparison = compare(leftValue, rightValue);
    if (comparison !== 0) return comparison;
  }
  return compareNumbers(left.length, right.length);
}

export function compareVoicingLocalScores(
  left: VoicingLocalScore,
  right: VoicingLocalScore,
): Comparison {
  for (const axis of VOICING_LOCAL_SCORE_AXIS_ORDER) {
    const comparison = compareNumbers(left[axis], right[axis]);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function compareNumberArrays(
  left: readonly number[],
  right: readonly number[],
): Comparison {
  return compareLexicographically(left, right, compareNumbers);
}

function constraintCodeRank(
  constraint: UnsatisfiedVoicingConstraint,
): number {
  return VOICING_CONSTRAINT_CODES.indexOf(constraint.code);
}

function constraintReasonRank(
  constraint: UnsatisfiedVoicingConstraint,
): number {
  return VOICING_CONSTRAINT_UNSATISFIED_REASONS.indexOf(constraint.reason);
}

function constraintVoiceOrdinalsAreBounded(
  values: readonly number[],
): values is UnsatisfiedVoicingConstraint["voiceOrdinals"] {
  return values.length <= MAX_VOICING_CONSTRAINT_OBSERVATION_VOICES;
}

function constraintDegreesAreBounded(
  values: readonly ChordDegree[],
): values is UnsatisfiedVoicingConstraint["degrees"] {
  return values.length <= MAX_VOICING_CONSTRAINT_OBSERVATION_VOICES;
}

function constraintMidiValuesAreBounded(
  values: readonly MidiPitch[],
): values is UnsatisfiedVoicingConstraint["midiValues"] {
  return values.length <= MAX_VOICING_CONSTRAINT_OBSERVATION_VOICES;
}

function constraintReportIsBoundedAndNonEmpty(
  values: readonly UnsatisfiedVoicingConstraint[],
): values is VoicingConstraintsUnsatisfiedRefusal["constraints"] {
  return (
    values.length > 0 &&
    values.length <= MAX_VOICING_REFUSAL_CONSTRAINT_OBSERVATIONS
  );
}

/**
 * Publish one owned constraint observation only after proving each tuple bound.
 * The proof is structural, so callers never escape through `unknown` merely to
 * satisfy the public bounded-tuple contract.
 */
export function makeUnsatisfiedVoicingConstraint(
  code: UnsatisfiedVoicingConstraint["code"],
  reason: UnsatisfiedVoicingConstraint["reason"],
  voiceOrdinals: readonly number[] = [],
  degrees: readonly ChordDegree[] = [],
  midiValues: readonly MidiPitch[] = [],
): UnsatisfiedVoicingConstraint {
  const ownedVoiceOrdinals = Object.freeze([...voiceOrdinals]);
  const ownedDegrees = Object.freeze(
    degrees.map((degree) => Object.freeze({ ...degree })),
  );
  const ownedMidiValues = Object.freeze([...midiValues]);
  if (
    !constraintVoiceOrdinalsAreBounded(ownedVoiceOrdinals) ||
    !constraintDegreesAreBounded(ownedDegrees) ||
    !constraintMidiValuesAreBounded(ownedMidiValues)
  ) {
    throw new RangeError("V0 constraint observation exceeded its payload cap");
  }
  return deepFreezeOwned({
    code,
    satisfied: false,
    reason,
    voiceOrdinals: ownedVoiceOrdinals,
    degrees: ownedDegrees,
    midiValues: ownedMidiValues,
  } satisfies UnsatisfiedVoicingConstraint);
}

/**
 * Stable constraint-report order: public code precedence, then the three
 * independently inspectable observation projections, then the stable reason
 * rank needed to totalize otherwise-identical projections.
 */
export function compareUnsatisfiedVoicingConstraints(
  left: UnsatisfiedVoicingConstraint,
  right: UnsatisfiedVoicingConstraint,
): Comparison {
  const codeComparison = compareNumbers(
    constraintCodeRank(left),
    constraintCodeRank(right),
  );
  if (codeComparison !== 0) return codeComparison;
  const ordinalComparison = compareNumberArrays(
    left.voiceOrdinals,
    right.voiceOrdinals,
  );
  if (ordinalComparison !== 0) return ordinalComparison;
  const degreeComparison = compareLexicographically(
    left.degrees,
    right.degrees,
    compareChordDegrees,
  );
  if (degreeComparison !== 0) return degreeComparison;
  const midiComparison = compareNumberArrays(left.midiValues, right.midiValues);
  if (midiComparison !== 0) return midiComparison;
  return compareNumbers(
    constraintReasonRank(left),
    constraintReasonRank(right),
  );
}

function cloneUnsatisfiedConstraint(
  constraint: UnsatisfiedVoicingConstraint,
): UnsatisfiedVoicingConstraint {
  return makeUnsatisfiedVoicingConstraint(
    constraint.code,
    constraint.reason,
    constraint.voiceOrdinals,
    constraint.degrees,
    constraint.midiValues,
  );
}

export function orderUnsatisfiedVoicingConstraints(
  constraints: readonly UnsatisfiedVoicingConstraint[],
): readonly UnsatisfiedVoicingConstraint[] {
  if (constraints.length === 0) {
    throw new RangeError("V0 constraints refusal requires a nonempty report");
  }
  const ordered: UnsatisfiedVoicingConstraint[] = [];
  for (const source of constraints) {
    const constraint = cloneUnsatisfiedConstraint(source);
    let insertionIndex = ordered.length;
    let duplicate = false;
    for (let index = 0; index < ordered.length; index += 1) {
      const current = ordered[index];
      if (current === undefined) continue;
      const comparison = compareUnsatisfiedVoicingConstraints(
        constraint,
        current,
      );
      if (comparison === 0) {
        duplicate = true;
        break;
      }
      if (comparison < 0) {
        insertionIndex = index;
        break;
      }
    }
    if (duplicate) continue;
    if (ordered.length >= MAX_VOICING_REFUSAL_CONSTRAINT_OBSERVATIONS) {
      throw new RangeError("V0 constraints refusal exceeded its payload cap");
    }
    ordered.splice(insertionIndex, 0, constraint);
  }
  return Object.freeze(ordered);
}

/** Assemble a bounded, ordered, immutable public constraints refusal. */
export function makeVoicingConstraintsUnsatisfiedRefusal(
  constraints: readonly UnsatisfiedVoicingConstraint[],
): VoicingConstraintsUnsatisfiedRefusal {
  const ordered = orderUnsatisfiedVoicingConstraints(constraints);
  if (!constraintReportIsBoundedAndNonEmpty(ordered)) {
    throw new RangeError("V0 constraints refusal exceeded its payload cap");
  }
  return deepFreezeOwned({
    code: "voicing.constraints_unsatisfied",
    path: POLICY_REFUSAL_PATH,
    constraints: ordered,
  } satisfies VoicingConstraintsUnsatisfiedRefusal);
}

/** Exact V0 ascending comparator after candidate identity normalization. */
export function compareVoicingCandidates(
  left: VoicingCandidate,
  right: VoicingCandidate,
): Comparison {
  const scoreComparison = compareVoicingLocalScores(
    left.localScore,
    right.localScore,
  );
  if (scoreComparison !== 0) return scoreComparison;

  const midiComparison = compareLexicographically(
    left.voices,
    right.voices,
    (leftVoice, rightVoice) => compareNumbers(leftVoice.midi, rightVoice.midi),
  );
  if (midiComparison !== 0) return midiComparison;

  const degreeComparison = compareLexicographically(
    left.voices,
    right.voices,
    (leftVoice, rightVoice) =>
      compareNullableDegrees(leftVoice.degree, rightVoice.degree),
  );
  if (degreeComparison !== 0) return degreeComparison;

  const spellingComparison = compareLexicographically(
    left.pitches,
    right.pitches,
    compareSpelledPitches,
  );
  if (spellingComparison !== 0) return spellingComparison;

  const templateComparison = compareUtf16(
    left.explanation.templateId,
    right.explanation.templateId,
  );
  if (templateComparison !== 0) return templateComparison;
  return compareNumbers(left.rawGenerationOrdinal, right.rawGenerationOrdinal);
}

export type VoicingCounterAttemptResult = DomainResult<
  number,
  VoicingWorkLimitExceededRefusal
>;

export interface VoicingWorkLedger {
  /** Attempt exactly one cumulative unit; an over-limit unit is not accepted. */
  readonly attemptWork: (
    counter: VoicingWorkCounterName,
  ) => VoicingCounterAttemptResult;
  /** Sample a prospective/current population after each allocation. */
  readonly observeMemory: (
    counter: VoicingMemoryCounterName,
    received: number,
  ) => VoicingCounterAttemptResult;
  readonly read: (
    counter: VoicingWorkCounterName | VoicingMemoryCounterName,
  ) => number;
  readonly snapshot: <Termination extends VoicingTermination>(
    termination: Termination,
  ) => VoicingWorkEvidence & Readonly<{ termination: Termination }>;
}

export type VoicingConstraintObservationRecordResult = DomainResult<
  "accepted" | "duplicate",
  VoicingWorkLimitExceededRefusal
>;

/**
 * One operation-local ordered diagnostic population. It owns no parallel key
 * map: the metered total comparator supplies both exact semantic deduplication
 * and final report order.
 */
export interface VoicingConstraintObservationCollector {
  /**
   * Transfer one already-owned immutable observation into the sole collector
   * population. The caller must not retain it in another diagnostic array.
   */
  readonly record: (
    constraint: UnsatisfiedVoicingConstraint,
  ) => VoicingConstraintObservationRecordResult;
  readonly size: () => number;
  /** Transfer the sole owned observation population into its public refusal. */
  readonly takeRefusal: () => VoicingConstraintsUnsatisfiedRefusal;
  readonly clear: () => void;
}

export function createVoicingConstraintObservationCollector(
  ledger: VoicingWorkLedger,
): VoicingConstraintObservationCollector {
  let records: UnsatisfiedVoicingConstraint[] = [];

  return Object.freeze({
    record(
      source: UnsatisfiedVoicingConstraint,
    ): VoicingConstraintObservationRecordResult {
      let insertionIndex = records.length;
      for (let index = 0; index < records.length; index += 1) {
        const comparisonAttempt = ledger.attemptWork(
          "constraintObservationComparisons",
        );
        if (!comparisonAttempt.ok) return comparisonAttempt;
        const current = records[index];
        if (current === undefined) continue;
        const comparison = compareUnsatisfiedVoicingConstraints(source, current);
        if (comparison === 0) {
          return Object.freeze({ ok: true, value: "duplicate" });
        }
        if (comparison < 0) {
          insertionIndex = index;
          break;
        }
      }

      const producedAttempt = ledger.attemptWork(
        "constraintObservationsProduced",
      );
      if (!producedAttempt.ok) return producedAttempt;
      records.splice(insertionIndex, 0, source);
      const memory = ledger.observeMemory(
        "peakConstraintObservationRecords",
        records.length,
      );
      if (!memory.ok) return memory;
      return Object.freeze({ ok: true, value: "accepted" });
    },

    size(): number {
      return records.length;
    },

    takeRefusal(): VoicingConstraintsUnsatisfiedRefusal {
      if (records.length === 0) {
        throw new RangeError("V0 constraints refusal requires a nonempty report");
      }
      const ownedRecords = records;
      records = [];
      if (!constraintReportIsBoundedAndNonEmpty(ownedRecords)) {
        throw new RangeError("V0 constraints refusal exceeded its payload cap");
      }
      return deepFreezeOwned({
        code: "voicing.constraints_unsatisfied",
        path: POLICY_REFUSAL_PATH,
        constraints: ownedRecords,
      } satisfies VoicingConstraintsUnsatisfiedRefusal);
    },

    clear(): void {
      records.length = 0;
    },
  });
}

function zeroWorkCounters(): Record<VoicingWorkCounterName, number> {
  return {
    realizationDegreeRecordsVisited: 0,
    templateRowsVisited: 0,
    templateDegreeSlotsVisited: 0,
    registerPlacementsVisited: 0,
    searchStatesExpanded: 0,
    structuralTransformsAttempted: 0,
    hardConstraintChecks: 0,
    rawCandidatesProduced: 0,
    candidateCanonicalizations: 0,
    duplicateCandidateComparisons: 0,
    localScoresComputed: 0,
    orderingComparisons: 0,
    retainedCandidatesProduced: 0,
    outputVoicesProduced: 0,
    constraintObservationComparisons: 0,
    constraintObservationsProduced: 0,
  };
}

function zeroMemoryCounters(): Record<VoicingMemoryCounterName, number> {
  return {
    peakRegisterPlacementRecords: 0,
    peakSearchStateRecords: 0,
    peakRawCandidateRecords: 0,
    peakRawVoiceRecords: 0,
    peakRetainedCandidateRecords: 0,
    peakOutputVoiceRecords: 0,
    peakTrackedRecords: 0,
    peakConstraintObservationRecords: 0,
  };
}

function counterLimitFailure(
  counter: VoicingWorkCounterName | VoicingMemoryCounterName,
  received: number,
  maximum: number,
): VoicingCounterAttemptResult {
  return Object.freeze({
    ok: false,
    refusal: Object.freeze({
      code: "limit.voicing_work_exceeded",
      path: EMPTY_REFUSAL_PATH,
      counter,
      received,
      maximum,
      partialResult: false,
    }),
  });
}

function counterSuccess(value: number): VoicingCounterAttemptResult {
  return Object.freeze({ ok: true, value });
}

function assertMemoryObservation(received: number): void {
  if (!Number.isSafeInteger(received) || received < 0) {
    throw new RangeError(
      "V0 memory observation must be a nonnegative safe integer",
    );
  }
}

function isWorkCounterName(
  counter: VoicingWorkCounterName | VoicingMemoryCounterName,
): counter is VoicingWorkCounterName {
  return Object.hasOwn(VOICING_WORK_LIMITS, counter);
}

/**
 * Create one operation-local mutable ledger. Its snapshots and limit signals
 * are immutable; no state escapes except through the declared methods.
 */
export function createVoicingWorkLedger(): VoicingWorkLedger {
  const work = zeroWorkCounters();
  const memory = zeroMemoryCounters();

  return Object.freeze({
    attemptWork(counter: VoicingWorkCounterName): VoicingCounterAttemptResult {
      const received = work[counter] + 1;
      const maximum = VOICING_WORK_LIMITS[counter];
      if (received > maximum) {
        return counterLimitFailure(counter, received, maximum);
      }
      work[counter] = received;
      return counterSuccess(received);
    },

    observeMemory(
      counter: VoicingMemoryCounterName,
      received: number,
    ): VoicingCounterAttemptResult {
      assertMemoryObservation(received);
      const maximum = VOICING_MEMORY_LIMITS[counter];
      if (received > maximum) {
        return counterLimitFailure(counter, received, maximum);
      }
      if (received > memory[counter]) memory[counter] = received;
      return counterSuccess(memory[counter]);
    },

    read(
      counter: VoicingWorkCounterName | VoicingMemoryCounterName,
    ): number {
      return isWorkCounterName(counter) ? work[counter] : memory[counter];
    },

    snapshot<Termination extends VoicingTermination>(
      termination: Termination,
    ): VoicingWorkEvidence & Readonly<{ termination: Termination }> {
      return Object.freeze({
        ...work,
        ...memory,
        termination,
      });
    },
  });
}
