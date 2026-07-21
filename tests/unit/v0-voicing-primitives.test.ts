import { describe, expect, test } from "bun:test";

import familyTemplateFixtureValue from "../fixtures/voicing/family-templates.json";
import limitFixtureValue from "../fixtures/voicing/limit-cases.json";

import {
  makeMidiPitch,
  makeMidiRange,
  makeSpelledPitch,
  type Alteration,
  type ChordDegree,
  type DegreeNumber,
  type MidiPitch,
  type MidiRange,
  type SpelledPitch,
  type Step,
} from "../../src/domain";
import { resolveChord } from "../../src/theory/chord-resolution";
import { parseChordSymbol } from "../../src/theory/chord-symbol";
import {
  VOICING_FAMILIES,
  VOICING_LOCAL_SCORE_AXIS_ORDER,
  VOICING_MEMORY_COUNTER_NAMES,
  VOICING_MEMORY_LIMITS,
  VOICING_QUALITY_CLASSES,
  MAX_VOICING_REFUSAL_CONSTRAINT_OBSERVATIONS,
  VOICING_WORK_COUNTER_NAMES,
  VOICING_WORK_LIMITS,
  type UnsatisfiedVoicingConstraint,
  type VoicingCandidate,
  type VoicingCandidateVoice,
  type VoicingFamilyTemplate,
  type VoicingLocalScore,
  type VoicingMemoryCounterName,
  type VoicingWorkCounterName,
  type VoicingWorkLimitExceededRefusal,
} from "../../src/theory/voicing-candidates-contract";
import {
  applyDrop2Transform,
  bindVoicingSourceDegrees,
  candidateIdentityKey,
  compareVoicingCandidates,
  createVoicingConstraintObservationCollector,
  createVoicingWorkLedger,
  enumerateSourceDegreeRegisterPlacements,
  enumerateSpelledRegisterPlacements,
  findVoicingSourceDegree,
  lowRegisterSpacingViolations,
  minimumLowRegisterSpacing,
  sameCandidateIdentity,
  sameCandidateVoiceIdentity,
  validateVoicingEvidenceIdentifier,
  visitSpelledRegisterPlacementValues,
} from "../../src/theory/voicing-engine-primitives";
import {
  VOICING_QUALITY_CLASSIFICATION,
  VOICING_REGISTER_POLICIES,
  VOICING_TEMPLATE_ROWS,
  classifyVoicingQuality,
  findVoicingFamilyTemplate,
  findVoicingRegisterPolicy,
  getVoicingFamilyPlan,
} from "../../src/theory/voicing-family-authority";

type CounterBoundaryCase = Readonly<{
  id: string;
  counterKind: "work" | "memory";
  counter: string;
  boundary: "exact-limit" | "attempted-limit-plus-one";
  maximum: number;
  expected: Readonly<{
    evidenceProjection: Readonly<{
      counter: string;
      acceptedValue: number;
      termination?: "work-limit-exceeded";
    }>;
    refusal?: VoicingWorkLimitExceededRefusal;
    limitRefusal?: null;
    limitDisposition?: string;
    collectorAttemptOk?: false;
    diagnosticCollectionDisposition?: string;
    operationDisposition?: string;
    overallOperationOutcomeFixedByThisCase?: boolean;
  }>;
}>;

type IdentifierBoundaryCase = Readonly<{
  id: string;
  recipe: Readonly<{
    segments: readonly Readonly<{ text: string; repeat: number }>[];
  }>;
  expected: Readonly<{
    valid: boolean;
    measuredCodePoints: number;
    measuredUtf8Bytes: number;
    firstViolation:
      | "minimum-code-points"
      | "maximum-code-points"
      | "maximum-utf8-bytes"
      | null;
  }>;
}>;

const LIMIT_FIXTURE = limitFixtureValue as unknown as Readonly<{
  identifierBoundaryCases: readonly IdentifierBoundaryCase[];
  counterBoundaryCases: readonly CounterBoundaryCase[];
}>;

type RealizationCandidateVoice = Extract<
  VoicingCandidateVoice,
  { provenance: "realization" }
>;
type FixedFamilyTemplate = Extract<
  VoicingFamilyTemplate,
  { selectionMode: "fixed-degree-sequence" }
>;
type AdaptiveFamilyTemplate = Extract<
  VoicingFamilyTemplate,
  { selectionMode: "realization-roles" }
>;
type QuartalFamilyTemplate = Extract<
  VoicingFamilyTemplate,
  { selectionMode: "quartal-context-sequence" }
>;
type UnavailableProjection = Readonly<{
  id: string;
  family: string;
  reason: string;
}>;

function expectEquivalent(actual: unknown, expected: unknown): void {
  expect(actual).toEqual(expected);
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function degree(number: DegreeNumber, alter: Alteration = 0): ChordDegree {
  return Object.freeze({ number, alter });
}

function degreeToken(value: ChordDegree): string {
  const accidental =
    value.alter === -2
      ? "bb"
      : value.alter === -1
        ? "b"
        : value.alter === 1
          ? "#"
          : value.alter === 2
            ? "##"
            : "";
  return `${accidental}${value.number.toString()}`;
}

function midi(value: number): MidiPitch {
  const result = makeMidiPitch(value);
  if (!result.ok) {
    throw new Error(`test MIDI value refused: ${value.toString()}`);
  }
  return result.value;
}

function range(lowMidi: number, highMidi: number): MidiRange {
  const result = makeMidiRange(lowMidi, highMidi);
  if (!result.ok) {
    throw new Error(
      `test MIDI range refused: ${lowMidi.toString()}..${highMidi.toString()}`,
    );
  }
  return result.value;
}

function spelled(
  step: Step,
  alter: Alteration,
  octave: number,
): SpelledPitch {
  const result = makeSpelledPitch({ step, alter, octave });
  if (!result.ok) {
    throw new Error(`test pitch refused: ${step}${octave.toString()}`);
  }
  return result.value;
}

function diagnosticObservation(
  midiValue: number,
  overrides: Readonly<{
    reason?: UnsatisfiedVoicingConstraint["reason"];
    voiceOrdinals?: readonly number[];
    degrees?: readonly ChordDegree[];
  }> = {},
): UnsatisfiedVoicingConstraint {
  return Object.freeze({
    code: "voicing.constraint.family_structure",
    satisfied: false,
    reason: overrides.reason ?? "family-transform-invalid",
    voiceOrdinals: Object.freeze([...(overrides.voiceOrdinals ?? [0])]),
    degrees: Object.freeze(
      (overrides.degrees ?? []).map((value) =>
        Object.freeze({ number: value.number, alter: value.alter }),
      ),
    ),
    midiValues: Object.freeze([midi(midiValue)]),
  }) as unknown as UnsatisfiedVoicingConstraint;
}

function realizationVoice(
  midiValue: number,
  pitch: SpelledPitch,
  chordDegree: ChordDegree,
  sourceDegreeIndex: number,
  ordinal: number,
): RealizationCandidateVoice {
  return Object.freeze({
    ordinal,
    pitch,
    midi: midi(midiValue),
    provenance: "realization",
    degree: chordDegree,
    sourceDegreeIndex,
  });
}

function literalRealization(sourceText: string) {
  const parsed = parseChordSymbol(sourceText, "ascii");
  if (!parsed.ok) throw new Error(`test symbol did not parse: ${sourceText}`);
  const resolved = resolveChord(parsed.chord);
  if (!resolved.ok) {
    throw new Error(`test chord did not resolve: ${sourceText}`);
  }
  return resolved.value.realizations[0];
}

function fixedProductionProjection() {
  return VOICING_TEMPLATE_ROWS.filter(
    (row): row is FixedFamilyTemplate =>
      row.availability !== "unavailable" &&
      row.selectionMode === "fixed-degree-sequence",
  )
    .map((row) => ({
      id: row.id,
      family: row.family,
      realizationClasses: [row.qualityClass],
      selectionMode: row.selectionMode,
      availability: row.availability,
      quartalContextPolicyId: row.quartalContextPolicyId,
      quartalContextPolicyVersion: row.quartalContextPolicyVersion,
      degreeTokens: row.degreeSequence.map(({ degree: slotDegree }) =>
        degreeToken(slotDegree),
      ),
      degreeSequence: row.degreeSequence,
      minimumVoiceCount: row.minimumVoiceCount,
      permittedVoiceCounts: row.permittedVoiceCounts,
      permittedBassPolicies: row.permittedBassPolicies,
      omitsRoot: row.family === "rootless-a" || row.family === "rootless-b",
      registerPolicyId: row.registerPolicyId,
      registerPolicyVersion: row.registerPolicyVersion,
      targetSpanSemitones: row.targetSpanSemitones,
    }))
    .sort((left, right) => compareStrings(left.id, right.id));
}

function fixedFixtureProjection() {
  return familyTemplateFixtureValue.fixedTemplates
    .map((row) => ({
      id: row.id,
      family: row.family,
      realizationClasses: row.realizationClasses,
      selectionMode: row.selectionMode,
      availability: row.availability,
      quartalContextPolicyId: row.quartalContextPolicyId,
      quartalContextPolicyVersion: row.quartalContextPolicyVersion,
      degreeTokens: row.degreeTokens,
      degreeSequence: row.degreeSequence,
      minimumVoiceCount: row.minimumVoiceCount,
      permittedVoiceCounts: row.permittedVoiceCounts,
      permittedBassPolicies: row.permittedBassPolicies,
      omitsRoot: row.omitsRoot,
      registerPolicyId: row.registerPolicyId,
      registerPolicyVersion: row.registerPolicyVersion,
      targetSpanSemitones: row.targetSpanSemitones,
    }))
    .sort((left, right) => compareStrings(left.id, right.id));
}

function baseScore(
  overrides: Partial<VoicingLocalScore> = {},
): VoicingLocalScore {
  return {
    optionalDegreesOmitted: 0,
    nonPreferredDoublings: 0,
    guideToneDoublings: 0,
    templateOrderDisplacement: 0,
    targetSpanDistance: 0,
    rangeCenterDistanceTwice: 0,
    ...overrides,
  };
}

const BASE_COMPARATOR_VOICES = Object.freeze([
  realizationVoice(60, spelled("C", 0, 4), degree(1), 0, 0),
  realizationVoice(64, spelled("E", 0, 4), degree(3), 1, 1),
  realizationVoice(67, spelled("G", 0, 4), degree(5), 2, 2),
] as const);

function comparatorCandidate(
  options: Readonly<{
    score?: Partial<VoicingLocalScore>;
    voices?: readonly VoicingCandidateVoice[];
    templateId?: string;
    rawGenerationOrdinal?: number;
  }> = {},
): VoicingCandidate {
  const voices = options.voices ?? BASE_COMPARATOR_VOICES;
  return {
    localScore: baseScore(options.score),
    voices,
    pitches: voices.map(({ pitch }) => pitch),
    explanation: { templateId: options.templateId ?? "template-a" },
    rawGenerationOrdinal: options.rawGenerationOrdinal ?? 0,
  } as unknown as VoicingCandidate;
}

describe("V0 source-owned voicing family authority", () => {
  test("matches independent quality classifications and register policies", () => {
    expectEquivalent(
      VOICING_QUALITY_CLASSIFICATION.map(
        ({ qualityClass, formulaRuleIds }) => ({
          id: qualityClass,
          formulaRuleIds,
        }),
      ),
      familyTemplateFixtureValue.realizationClasses,
    );

    for (const classification of VOICING_QUALITY_CLASSIFICATION) {
      for (const formulaRuleId of classification.formulaRuleIds) {
        expect(classifyVoicingQuality(formulaRuleId)).toBe(
          classification.qualityClass,
        );
      }
    }

    expectEquivalent(
      VOICING_REGISTER_POLICIES,
      familyTemplateFixtureValue.registerPolicies,
    );
    for (const policy of VOICING_REGISTER_POLICIES) {
      expect(findVoicingRegisterPolicy(policy.id)).toBe(policy);
    }
  });

  test("matches every independently authored fixed degree row", () => {
    expectEquivalent(fixedProductionProjection(), fixedFixtureProjection());
  });

  test("materializes a total class-major, family-major authority", () => {
    expect(VOICING_TEMPLATE_ROWS).toHaveLength(
      VOICING_QUALITY_CLASSES.length * VOICING_FAMILIES.length,
    );

    let rowIndex = 0;
    for (const qualityClass of VOICING_QUALITY_CLASSES) {
      for (const family of VOICING_FAMILIES) {
        const row = VOICING_TEMPLATE_ROWS[rowIndex];
        if (row === undefined) throw new Error("missing voicing authority row");
        expect([row.qualityClass, row.family]).toEqual([qualityClass, family]);
        expect(findVoicingFamilyTemplate(qualityClass, family)).toBe(row);

        const plan = getVoicingFamilyPlan(qualityClass, family);
        expect(plan.template).toBe(row);
        if (row.availability === "unavailable") {
          expect(plan.registerPolicy).toBeNull();
        } else {
          expect(plan.registerPolicy).toBe(
            findVoicingRegisterPolicy(row.registerPolicyId),
          );
        }
        rowIndex += 1;
      }
    }
  });

  test("matches adaptive and context-gated fixture projections", () => {
    const adaptiveProduction = (["balanced", "open", "drop2"] as const).map(
      (family) => {
        const rows = VOICING_TEMPLATE_ROWS.filter(
          (row): row is AdaptiveFamilyTemplate =>
            row.family === family,
        );
        const first = rows[0];
        if (first === undefined) throw new Error(`missing ${family} authority`);
        return {
          id: first.id,
          family: first.family,
          selectionMode: first.selectionMode,
          availability: first.availability,
          quartalContextPolicyId: first.quartalContextPolicyId,
          quartalContextPolicyVersion: first.quartalContextPolicyVersion,
          requiredDegreeSource: first.requiredDegreeSource,
          optionalDegreeSource: first.optionalDegreeSource,
          guideToneSource: first.guideToneSource,
          selectionPolicyId: first.selectionPolicyId,
          selectionPolicyVersion: first.selectionPolicyVersion,
          maximumSelectedDegreeSlots: first.maximumSelectedDegreeSlots,
          realizationClasses: rows.map(({ qualityClass }) => qualityClass),
          minimumVoiceCount: first.minimumVoiceCount,
          permittedVoiceCounts: first.permittedVoiceCounts,
          permittedBassPolicies: first.permittedBassPolicies,
          registerPolicyId: first.registerPolicyId,
          registerPolicyVersion: first.registerPolicyVersion,
          targetSpanSemitones: first.targetSpanSemitones,
        };
      },
    );
    const adaptiveFixture = familyTemplateFixtureValue.adaptiveFamilies.map(
      (row) => ({
        id: row.id,
        family: row.family,
        selectionMode: row.selectionMode,
        availability: row.availability,
        quartalContextPolicyId: row.quartalContextPolicyId,
        quartalContextPolicyVersion: row.quartalContextPolicyVersion,
        requiredDegreeSource: row.requiredDegreeSource,
        optionalDegreeSource: row.optionalDegreeSource,
        guideToneSource: row.guideToneSource,
        selectionPolicyId: row.selectionPolicyId,
        selectionPolicyVersion: row.selectionPolicyVersion,
        maximumSelectedDegreeSlots: row.maximumSelectedDegreeSlots,
        realizationClasses: row.realizationClasses,
        minimumVoiceCount: row.minimumVoiceCount,
        permittedVoiceCounts: row.permittedVoiceCounts,
        permittedBassPolicies: row.permittedBassPolicies,
        registerPolicyId: row.registerPolicyId,
        registerPolicyVersion: row.registerPolicyVersion,
        targetSpanSemitones: row.targetSpanSemitones,
      }),
    );
    expectEquivalent(adaptiveProduction, adaptiveFixture);

    const quartalProduction = VOICING_TEMPLATE_ROWS.filter(
      (row): row is QuartalFamilyTemplate =>
        row.availability !== "unavailable" &&
        row.selectionMode === "quartal-context-sequence",
    )
      .map((row) => ({
        id: row.id,
        family: row.family,
        selectionMode: row.selectionMode,
        degreeSequenceSource: row.degreeSequenceSource,
        minimumSelectedDegreeSlots: row.minimumSelectedDegreeSlots,
        maximumSelectedDegreeSlots: row.maximumSelectedDegreeSlots,
        availability: row.availability,
        quartalContextPolicyId: row.quartalContextPolicyId,
        quartalContextPolicyVersion: row.quartalContextPolicyVersion,
        realizationClasses: [row.qualityClass],
        minimumVoiceCount: row.minimumVoiceCount,
        permittedVoiceCounts: row.permittedVoiceCounts,
        permittedBassPolicies: row.permittedBassPolicies,
        registerPolicyId: row.registerPolicyId,
        registerPolicyVersion: row.registerPolicyVersion,
        targetSpanSemitones: row.targetSpanSemitones,
      }))
      .sort((left, right) => compareStrings(left.id, right.id));
    const quartalFixture = familyTemplateFixtureValue.quartalTemplates
      .map((row) => ({
        id: row.id,
        family: row.family,
        selectionMode: row.selectionMode,
        degreeSequenceSource: row.degreeSequenceSource,
        minimumSelectedDegreeSlots: row.minimumSelectedDegreeSlots,
        maximumSelectedDegreeSlots: row.maximumSelectedDegreeSlots,
        availability: row.availability,
        quartalContextPolicyId: row.quartalContextPolicyId,
        quartalContextPolicyVersion: row.quartalContextPolicyVersion,
        realizationClasses: row.realizationClasses,
        minimumVoiceCount: row.minimumVoiceCount,
        permittedVoiceCounts: row.permittedVoiceCounts,
        permittedBassPolicies: row.permittedBassPolicies,
        registerPolicyId: row.registerPolicyId,
        registerPolicyVersion: row.registerPolicyVersion,
        targetSpanSemitones: row.targetSpanSemitones,
      }))
      .sort((left, right) => compareStrings(left.id, right.id));
    expectEquivalent(quartalProduction, quartalFixture);
  });

  test("uses only the three independently declared unavailable policies", () => {
    const normalized = new Map<string, UnavailableProjection>();
    for (const row of VOICING_TEMPLATE_ROWS) {
      if (row.availability !== "unavailable") continue;
      const family =
        row.family === "rootless-a" || row.family === "rootless-b"
          ? "rootless-a-or-b"
          : row.family;
      const value = Object.freeze({ id: row.id, family, reason: row.reason });
      normalized.set(`${row.id}/${family}/${row.reason}`, value);
    }
    expectEquivalent(
      [...normalized.values()].sort((left, right) =>
        compareStrings(left.id, right.id),
      ),
      [...familyTemplateFixtureValue.unavailablePolicies].sort((left, right) =>
        compareStrings(left.id, right.id),
      ),
    );
  });
});

describe("V0 primitive identifier and register boundaries", () => {
  for (const boundaryCase of LIMIT_FIXTURE.identifierBoundaryCases) {
    test(boundaryCase.id, () => {
      const value = boundaryCase.recipe.segments
        .map(({ text, repeat }) => text.repeat(repeat))
        .join("");
      const result = validateVoicingEvidenceIdentifier(value);
      expect(result.ok).toBe(boundaryCase.expected.valid);

      if (result.ok) {
        expect(result.value).toEqual({
          codePoints: boundaryCase.expected.measuredCodePoints,
          utf8Bytes: boundaryCase.expected.measuredUtf8Bytes,
        });
        expect(boundaryCase.expected.firstViolation).toBeNull();
        return;
      }

      expect(result.refusal.received).toBe(
        boundaryCase.expected.firstViolation === "maximum-utf8-bytes"
          ? boundaryCase.expected.measuredUtf8Bytes
          : boundaryCase.expected.measuredCodePoints,
      );
      expect(result.refusal.reason).toBe(
        boundaryCase.expected.firstViolation === "maximum-utf8-bytes"
          ? "utf8-byte-count"
          : "code-point-count",
      );
      expect(result.refusal).toMatchObject({
        code: "voicing.evidence_identifier_invalid",
        minimum:
          boundaryCase.expected.firstViolation === "maximum-utf8-bytes" ? 0 : 1,
        maximum:
          boundaryCase.expected.firstViolation === "maximum-utf8-bytes"
            ? 512
            : 256,
      });
    });
  }

  test("selects each low-spacing band at both inclusive edges", () => {
    for (const band of familyTemplateFixtureValue.lowRegisterSpacing.bands) {
      expect(minimumLowRegisterSpacing(midi(band.minimumLowerMidi))).toBe(
        band.minimumAdjacentSemitones,
      );
      expect(minimumLowRegisterSpacing(midi(band.maximumLowerMidi))).toBe(
        band.minimumAdjacentSemitones,
      );

      const lower = midi(band.minimumLowerMidi);
      const exactUpper = midi(
        band.minimumLowerMidi + band.minimumAdjacentSemitones,
      );
      const belowUpper = midi(
        band.minimumLowerMidi + band.minimumAdjacentSemitones - 1,
      );
      expect(lowRegisterSpacingViolations([{ midi: lower }, { midi: exactUpper }])).toEqual(
        [],
      );
      expect(lowRegisterSpacingViolations([{ midi: lower }, { midi: belowUpper }])).toEqual([
        {
          lowerOrdinal: 0,
          upperOrdinal: 1,
          lowerMidi: lower,
          upperMidi: belowUpper,
          actualSemitones: band.minimumAdjacentSemitones - 1,
          minimumSemitones: band.minimumAdjacentSemitones,
        },
      ]);
    }
  });

  test("enumerates B-sharp and C-flat by written octave, not pitch-class octave", () => {
    expectEquivalent(
      enumerateSpelledRegisterPlacements(
        { step: "B", alter: 1 },
        range(60, 60),
      ).map(({ pitch, midi: midiValue }) => ({
        pitch,
        midi: Number(midiValue),
      })),
      [{ pitch: { step: "B", alter: 1, octave: 3 }, midi: 60 }],
    );
    expectEquivalent(
      enumerateSpelledRegisterPlacements(
        { step: "C", alter: -1 },
        range(59, 59),
      ).map(({ pitch, midi: midiValue }) => ({
        pitch,
        midi: Number(midiValue),
      })),
      [{ pitch: { step: "C", alter: -1, octave: 4 }, midi: 59 }],
    );
  });

  test("streams register projections and stops before later placements materialize", () => {
    const visited: number[] = [];
    const stopped = visitSpelledRegisterPlacementValues(
      { step: "C", alter: 0 },
      range(48, 84),
      (_pitch, midiValue) => {
        visited.push(Number(midiValue));
        return midiValue === 60 ? "stop-at-cap" : null;
      },
    );
    expect(stopped).toBe("stop-at-cap");
    expect(visited).toEqual([48, 60]);
  });

  test("carries exact T1 source indexes, spellings, projections, and roles", () => {
    const facts = bindVoicingSourceDegrees(literalRealization("Cdim7"));
    expect(
      facts.map((fact) => ({
        sourceDegreeIndex: fact.sourceDegreeIndex,
        degree: degreeToken(fact.degree),
        spelling: fact.spelledPitchClass,
        pitchClass: fact.pitchClass,
        required: fact.required,
        optional: fact.optional,
        guideTone: fact.guideTone,
      })),
    ).toEqual([
      { sourceDegreeIndex: 0, degree: "1", spelling: { step: "C", alter: 0 }, pitchClass: 0, required: true, optional: false, guideTone: false },
      { sourceDegreeIndex: 1, degree: "b3", spelling: { step: "E", alter: -1 }, pitchClass: 3, required: true, optional: false, guideTone: true },
      { sourceDegreeIndex: 2, degree: "b5", spelling: { step: "G", alter: -1 }, pitchClass: 6, required: true, optional: false, guideTone: false },
      { sourceDegreeIndex: 3, degree: "bb7", spelling: { step: "B", alter: -2 }, pitchClass: 9, required: true, optional: false, guideTone: true },
    ]);

    const diminishedSeventh = findVoicingSourceDegree(facts, degree(7, -2));
    const expectedDiminishedSeventh = facts[3];
    if (expectedDiminishedSeventh === undefined) {
      throw new Error("diminished seventh fixture source fact was not found");
    }
    expect(diminishedSeventh).toBe(expectedDiminishedSeventh);
    if (diminishedSeventh === null) {
      throw new Error("diminished seventh source fact was not found");
    }
    const placements = enumerateSourceDegreeRegisterPlacements(
      diminishedSeventh,
      range(57, 81),
    );
    expectEquivalent(
      placements.map(({ pitch, midi: midiValue }) => ({
        pitch,
        midi: Number(midiValue),
      })),
      [
        { pitch: { step: "B", alter: -2, octave: 3 }, midi: 57 },
        { pitch: { step: "B", alter: -2, octave: 4 }, midi: 69 },
        { pitch: { step: "B", alter: -2, octave: 5 }, midi: 81 },
      ],
    );
    expect(placements.every(({ sourceDegree }) => sourceDegree === diminishedSeventh)).toBe(true);
  });
});

describe("V0 literal Drop-2 primitive", () => {
  const closed = Object.freeze([
    realizationVoice(55, spelled("G", 0, 3), degree(5), 2, 0),
    realizationVoice(59, spelled("B", 0, 3), degree(7), 3, 1),
    realizationVoice(60, spelled("C", 0, 4), degree(1), 0, 2),
    realizationVoice(64, spelled("E", 0, 4), degree(3), 1, 3),
  ] as const);

  test("lowers the second voice from the top by one literal octave", () => {
    const before = JSON.stringify(closed);
    const result = applyDrop2Transform(closed);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.refusal.reason);
    expect(
      result.value.voices.map(({ midi: midiValue }) => Number(midiValue)),
    ).toEqual([48, 55, 59, 64]);
    expect(result.value.voices[0]?.pitch).toEqual({
      step: "C",
      alter: 0,
      octave: 3,
    });
    expectEquivalent(
      {
        ...result.value.evidence,
        closedSourceMidi: result.value.evidence.closedSourceMidi.map(Number),
        transformedMidi: result.value.evidence.transformedMidi.map(Number),
      },
      {
        closedSourceMidi: [55, 59, 60, 64],
        secondFromTopSourceOrdinal: 2,
        loweredBySemitones: 12,
        transformedMidi: [48, 55, 59, 64],
      },
    );
    expect(JSON.stringify(closed)).toBe(before);
  });

  test("refuses voice-count, source-order, and closed-span near misses", () => {
    expect(applyDrop2Transform(closed.slice(0, 3))).toEqual({
      ok: false,
      refusal: {
        code: "voicing.drop2_transform_invalid",
        reason: "voice-count",
      },
    });
    expect(
      applyDrop2Transform([closed[0], closed[2], closed[1], closed[3]]),
    ).toEqual({
      ok: false,
      refusal: {
        code: "voicing.drop2_transform_invalid",
        reason: "closed-source-order",
      },
    });
    expect(
      applyDrop2Transform([
        realizationVoice(48, spelled("C", 0, 3), degree(1), 0, 0),
        realizationVoice(55, spelled("G", 0, 3), degree(5), 2, 1),
        realizationVoice(59, spelled("B", 0, 3), degree(7), 3, 2),
        realizationVoice(60, spelled("C", 0, 4), degree(1), 0, 3),
      ]),
    ).toEqual({
      ok: false,
      refusal: {
        code: "voicing.drop2_transform_invalid",
        reason: "closed-source-span",
      },
    });
  });

  test("refuses an unprojectable lowered octave and pitch/MIDI disagreement", () => {
    expect(
      applyDrop2Transform([
        realizationVoice(0, spelled("C", 0, -1), degree(1), 0, 0),
        realizationVoice(2, spelled("D", 0, -1), degree(2), 1, 1),
        realizationVoice(6, spelled("F", 1, -1), degree(5, -1), 2, 2),
        realizationVoice(7, spelled("G", 0, -1), degree(5), 3, 3),
      ]),
    ).toEqual({
      ok: false,
      refusal: {
        code: "voicing.drop2_transform_invalid",
        reason: "lowered-pitch-out-of-range",
      },
    });

    expect(
      applyDrop2Transform([
        realizationVoice(60, spelled("C", 0, 4), degree(1), 0, 0),
        realizationVoice(64, spelled("E", 0, 4), degree(3), 1, 1),
        realizationVoice(68, spelled("G", 0, 4), degree(5), 2, 2),
        realizationVoice(71, spelled("B", 0, 4), degree(7), 3, 3),
      ]),
    ).toEqual({
      ok: false,
      refusal: {
        code: "voicing.drop2_transform_invalid",
        reason: "lowered-pitch-projection-mismatch",
      },
    });
  });
});

describe("V0 candidate identity and ordering primitives", () => {
  test("identity includes every normative voice field except ordinal", () => {
    const original = BASE_COMPARATOR_VOICES[0];
    const ordinalOnly = Object.freeze({ ...original, ordinal: 99 });
    expect(sameCandidateVoiceIdentity(original, ordinalOnly)).toBe(true);
    expect(candidateIdentityKey([original])).toBe(
      "60/4/C/0/1:0/realization/0",
    );
    expect(candidateIdentityKey([ordinalOnly])).toBe(
      candidateIdentityKey([original]),
    );

    const changes: readonly VoicingCandidateVoice[] = [
      Object.freeze({ ...original, midi: midi(61) }),
      Object.freeze({ ...original, pitch: spelled("C", 1, 4) }),
      Object.freeze({ ...original, degree: degree(1, 1) }),
      Object.freeze({ ...original, provenance: "doubling" as const }),
      Object.freeze({ ...original, sourceDegreeIndex: 1 }),
    ];
    for (const changed of changes) {
      expect(sameCandidateVoiceIdentity(original, changed)).toBe(false);
      expect(candidateIdentityKey([changed])).not.toBe(
        candidateIdentityKey([original]),
      );
    }
    expect(sameCandidateIdentity(BASE_COMPARATOR_VOICES, BASE_COMPARATOR_VOICES)).toBe(
      true,
    );
    expect(
      sameCandidateIdentity(
        BASE_COMPARATOR_VOICES,
        [...BASE_COMPARATOR_VOICES].reverse(),
      ),
    ).toBe(false);
  });

  test("orders every local-score axis before structural tie breakers", () => {
    const preferred = comparatorCandidate();
    for (const axis of VOICING_LOCAL_SCORE_AXIS_ORDER) {
      const lessPreferred = comparatorCandidate({ score: { [axis]: 1 } });
      expect(compareVoicingCandidates(preferred, lessPreferred)).toBe(-1);
      expect(compareVoicingCandidates(lessPreferred, preferred)).toBe(1);
    }
  });

  test("orders MIDI, degree, spelling, template ID, then raw ordinal", () => {
    const baseline = comparatorCandidate();
    const laterMidi = comparatorCandidate({
      voices: Object.freeze([
        realizationVoice(61, spelled("C", 0, 4), degree(1), 0, 0),
        ...BASE_COMPARATOR_VOICES.slice(1),
      ]),
    });
    expect(compareVoicingCandidates(baseline, laterMidi)).toBe(-1);

    const flatDegree = comparatorCandidate({
      voices: Object.freeze([
        realizationVoice(60, spelled("C", 0, 4), degree(1, -1), 0, 0),
        ...BASE_COMPARATOR_VOICES.slice(1),
      ]),
    });
    expect(compareVoicingCandidates(flatDegree, baseline)).toBe(-1);

    const laterSpelling = comparatorCandidate({
      voices: Object.freeze([
        realizationVoice(60, spelled("D", 0, 4), degree(1), 0, 0),
        ...BASE_COMPARATOR_VOICES.slice(1),
      ]),
    });
    expect(compareVoicingCandidates(baseline, laterSpelling)).toBe(-1);

    expect(
      compareVoicingCandidates(
        comparatorCandidate({ templateId: "template-a" }),
        comparatorCandidate({ templateId: "template-b" }),
      ),
    ).toBe(-1);
    expect(
      compareVoicingCandidates(
        comparatorCandidate({ templateId: "Z-template" }),
        comparatorCandidate({ templateId: "a-template" }),
      ),
    ).toBe(-1);
    expect(
      compareVoicingCandidates(
        comparatorCandidate({ rawGenerationOrdinal: 0 }),
        comparatorCandidate({ rawGenerationOrdinal: 1 }),
      ),
    ).toBe(-1);
    expect(compareVoicingCandidates(baseline, comparatorCandidate())).toBe(0);
  });
});

describe("V0 constraint-observation collection", () => {
  test("transfers an accepted immutable observation into the sole owned population", () => {
    const ledger = createVoicingWorkLedger();
    const collector = createVoicingConstraintObservationCollector(ledger);
    const observation = diagnosticObservation(41);

    expect(collector.record(observation)).toEqual({
      ok: true,
      value: "accepted",
    });
    const refusal = collector.takeRefusal();

    expect(refusal.constraints).toHaveLength(1);
    expect(refusal.constraints[0]).toBe(observation);
    expect(collector.size()).toBe(0);
  });

  test("deduplicates the full semantic payload while retaining distinct observations with the same code", () => {
    const ledger = createVoicingWorkLedger();
    const collector = createVoicingConstraintObservationCollector(ledger);

    expect(collector.record(diagnosticObservation(41))).toEqual({
      ok: true,
      value: "accepted",
    });
    expect(collector.record(diagnosticObservation(41))).toEqual({
      ok: true,
      value: "duplicate",
    });
    expect(collector.record(diagnosticObservation(36))).toEqual({
      ok: true,
      value: "accepted",
    });
    expect(
      collector.record(
        diagnosticObservation(41, {
          reason: "no-legal-register-placement",
        }),
      ),
    ).toEqual({ ok: true, value: "accepted" });
    expect(
      collector.record(
        diagnosticObservation(41, { voiceOrdinals: [1] }),
      ),
    ).toEqual({ ok: true, value: "accepted" });
    expect(
      collector.record(diagnosticObservation(41, { degrees: [degree(1)] })),
    ).toEqual({ ok: true, value: "accepted" });

    expect(ledger.read("constraintObservationComparisons")).toBe(11);
    expect(ledger.read("constraintObservationsProduced")).toBe(5);
    expect(ledger.read("peakConstraintObservationRecords")).toBe(5);
    const refusal = collector.takeRefusal();
    expect(
      refusal.constraints.map(
        ({ code, reason, voiceOrdinals, degrees, midiValues }) => ({
          code,
          reason,
          voiceOrdinals,
          degrees,
          midiValues: Array.from(midiValues, Number),
        }),
      ),
    ).toEqual([
      {
        code: "voicing.constraint.family_structure",
        reason: "family-transform-invalid",
        voiceOrdinals: [0],
        degrees: [],
        midiValues: [36],
      },
      {
        code: "voicing.constraint.family_structure",
        reason: "family-transform-invalid",
        voiceOrdinals: [0],
        degrees: [],
        midiValues: [41],
      },
      {
        code: "voicing.constraint.family_structure",
        reason: "no-legal-register-placement",
        voiceOrdinals: [0],
        degrees: [],
        midiValues: [41],
      },
      {
        code: "voicing.constraint.family_structure",
        reason: "family-transform-invalid",
        voiceOrdinals: [0],
        degrees: [{ number: 1, alter: 0 }],
        midiValues: [41],
      },
      {
        code: "voicing.constraint.family_structure",
        reason: "family-transform-invalid",
        voiceOrdinals: [1],
        degrees: [],
        midiValues: [41],
      },
    ]);
    expect(collector.size()).toBe(0);
    expect(Object.isFrozen(refusal)).toBe(true);
    expect(Object.isFrozen(refusal.constraints)).toBe(true);
    expect(refusal.constraints.every((constraint) => Object.isFrozen(constraint))).toBe(
      true,
    );
  });

  test("accepts exactly 16 distinct observations, permits a duplicate at capacity, and returns a typed distinct-17 overflow", () => {
    const ledger = createVoicingWorkLedger();
    const collector = createVoicingConstraintObservationCollector(ledger);

    for (
      let index = 0;
      index < MAX_VOICING_REFUSAL_CONSTRAINT_OBSERVATIONS;
      index += 1
    ) {
      expect(collector.record(diagnosticObservation(36 + index))).toEqual({
        ok: true,
        value: "accepted",
      });
    }
    expect(collector.size()).toBe(
      MAX_VOICING_REFUSAL_CONSTRAINT_OBSERVATIONS,
    );
    expect(collector.record(diagnosticObservation(44))).toEqual({
      ok: true,
      value: "duplicate",
    });
    expect(collector.size()).toBe(
      MAX_VOICING_REFUSAL_CONSTRAINT_OBSERVATIONS,
    );
    expect(ledger.read("constraintObservationsProduced")).toBe(
      MAX_VOICING_REFUSAL_CONSTRAINT_OBSERVATIONS,
    );

    const overflow = collector.record(diagnosticObservation(52));
    expect(overflow).toEqual({
      ok: false,
      refusal: {
        code: "limit.voicing_work_exceeded",
        path: [],
        counter: "constraintObservationsProduced",
        received: 17,
        maximum: 16,
        partialResult: false,
      },
    });
    expect(collector.size()).toBe(16);
    expect(ledger.read("constraintObservationsProduced")).toBe(16);

    const refusal = collector.takeRefusal();
    expect(refusal.constraints).toHaveLength(16);
    expect(Array.from(refusal.constraints[0].midiValues, Number)).toEqual([36]);
    expect(
      refusal.constraints[15] === undefined
        ? undefined
        : Array.from(refusal.constraints[15].midiValues, Number),
    ).toEqual([51]);
    expect(collector.size()).toBe(0);
    expect(() => collector.takeRefusal()).toThrow(RangeError);
  });
});

describe("V0 primitive work and memory ledger limits", () => {
  expect(LIMIT_FIXTURE.counterBoundaryCases).toHaveLength(
    (VOICING_WORK_COUNTER_NAMES.length + VOICING_MEMORY_COUNTER_NAMES.length) *
      2,
  );

  for (const boundaryCase of LIMIT_FIXTURE.counterBoundaryCases) {
    // The comparison boundary deliberately executes 2,228,225 immutable
    // ledger attempts. Wall time is non-normative V0 evidence, so give this
    // exhaustive arithmetic proof a load-tolerant harness budget instead of
    // letting Bun's generic timeout become an accidental musical cutoff.
    const timeoutMilliseconds =
      boundaryCase.counter === "constraintObservationComparisons"
        ? 15_000
        : 5_000;
    test(boundaryCase.id, () => {
      const ledger = createVoicingWorkLedger();
      if (boundaryCase.counterKind === "work") {
        const counter = boundaryCase.counter as VoicingWorkCounterName;
        expect(VOICING_WORK_COUNTER_NAMES).toContain(counter);
        expect(VOICING_WORK_LIMITS[counter]).toBe(boundaryCase.maximum);

        let accepted = 0;
        for (let value = 1; value <= boundaryCase.maximum; value += 1) {
          const result = ledger.attemptWork(counter);
          if (!result.ok) {
            throw new Error(`${boundaryCase.id} refused ${value.toString()}`);
          }
          accepted = result.value;
        }
        expect(accepted).toBe(boundaryCase.maximum);
        expect(ledger.read(counter)).toBe(
          boundaryCase.expected.evidenceProjection.acceptedValue,
        );

        if (boundaryCase.boundary === "exact-limit") {
          expect(boundaryCase.expected.limitRefusal).toBeNull();
          return;
        }
        const expectedRefusal = boundaryCase.expected.refusal;
        if (expectedRefusal === undefined) {
          throw new Error(`${boundaryCase.id} is missing its refusal fixture`);
        }
        const refused = ledger.attemptWork(counter);
        expect(refused).toEqual({
          ok: false,
          refusal: expectedRefusal,
        });
        expect(ledger.read(counter)).toBe(boundaryCase.maximum);
        if (counter === "constraintObservationsProduced") {
          expect(boundaryCase.expected).toMatchObject({
            limitDisposition:
              "save-provisional-refusal-before-accepting-attempted-unit",
            collectorAttemptOk: false,
            diagnosticCollectionDisposition:
              "stop-at-prospective-distinct-observation",
            operationDisposition: "continue-musical-search",
            overallOperationOutcomeFixedByThisCase: false,
          });
          expect(
            boundaryCase.expected.evidenceProjection.termination,
          ).toBeUndefined();
          return;
        }
        expect(ledger.snapshot("work-limit-exceeded")).toMatchObject({
          [counter]: boundaryCase.maximum,
          termination: "work-limit-exceeded",
        });
        return;
      }

      const counter = boundaryCase.counter as VoicingMemoryCounterName;
      expect(VOICING_MEMORY_COUNTER_NAMES).toContain(counter);
      expect(VOICING_MEMORY_LIMITS[counter]).toBe(boundaryCase.maximum);
      const accepted = ledger.observeMemory(counter, boundaryCase.maximum);
      expect(accepted).toEqual({ ok: true, value: boundaryCase.maximum });
      expect(ledger.read(counter)).toBe(
        boundaryCase.expected.evidenceProjection.acceptedValue,
      );

      if (boundaryCase.boundary === "exact-limit") {
        expect(boundaryCase.expected.limitRefusal).toBeNull();
        return;
      }
      const expectedRefusal = boundaryCase.expected.refusal;
      if (expectedRefusal === undefined) {
        throw new Error(`${boundaryCase.id} is missing its refusal fixture`);
      }
      const refused = ledger.observeMemory(counter, boundaryCase.maximum + 1);
      expect(refused).toEqual({
        ok: false,
        refusal: expectedRefusal,
      });
      expect(ledger.read(counter)).toBe(boundaryCase.maximum);
      expect(ledger.snapshot("work-limit-exceeded")).toMatchObject({
        [counter]: boundaryCase.maximum,
        termination: "work-limit-exceeded",
      });
    }, timeoutMilliseconds);
  }

  test("memory samples retain their peak and reject invalid observations", () => {
    const ledger = createVoicingWorkLedger();
    expect(ledger.observeMemory("peakRawCandidateRecords", 4)).toEqual({
      ok: true,
      value: 4,
    });
    expect(ledger.observeMemory("peakRawCandidateRecords", 2)).toEqual({
      ok: true,
      value: 4,
    });
    expect(() =>
      ledger.observeMemory("peakRawCandidateRecords", -1),
    ).toThrow(RangeError);
    expect(() =>
      ledger.observeMemory("peakRawCandidateRecords", Number.MAX_SAFE_INTEGER + 1),
    ).toThrow(RangeError);
  });
});
