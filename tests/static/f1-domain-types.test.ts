import { describe, expect, test } from "bun:test";

import {
  ALLOWED_BEAT_DENOMINATORS,
  AUTO_BASS_POLICIES,
  AUTO_VOICE_COUNTS,
  AUTO_VOICING_FAMILIES,
  BEAT_UNITS,
  CHORD_COLOR_POLICIES,
  COUNT_IN_BARS_VALUES,
  DEGREE_NUMBER_ORDER,
  DOMAIN_COPY_ROOT_KINDS,
  DOMAIN_VALIDATION_ISSUE_CODES,
  F1_VALUE_ISSUE_CODES,
  F2_STRUCTURAL_ISSUE_CODES,
  F3_SEMANTIC_ISSUE_CODES,
  INSTRUMENT_IDS,
  KEY_MODES,
  SECTION_VOICE_LEADING_BOUNDARIES,
  SEVENTH_QUALITIES,
  SPELLING_STEP_ORDER,
  STABLE_ID_KINDS,
  STORED_BASS_POLICIES,
  TRIAD_QUALITIES,
  VALIDATION_DIAGNOSTIC_ORDER,
  type AutoVoicing,
  type BeatArithmeticResult,
  type BeatDuration,
  type BeatPosition,
  type BeatValue,
  type ChordEvent,
  type CopyStableIdLocation,
  type CustomChordEvent,
  type DecodeResult,
  type DocumentId,
  type DomainCopyRequest,
  type DomainCopyResult,
  type DomainOperations,
  type ExistingStableIdLocation,
  type F2DecodeIssueCode,
  type FrozenVoicing,
  type IdFactoryResult,
  type IdRemapRefusal,
  type ManualVoicing,
  type Measure,
  type MeasureId,
  type MeasureShape,
  type MidiPitch,
  type OccupiedStableIdLocation,
  type ParsedChordEvent,
  type ProgressionDocumentShapeV2,
  type ProgressionDocumentV2,
  type SectionId,
  type StableIdOccupancy,
  type StableIdLocation,
  type StableIdRemapEntry,
  type TimelineAccumulationResult,
  type ValidatedDocument,
} from "../../src/domain";

type Assert<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;
type IsNever<T> = [T] extends [never] ? true : false;
type IsEqual<Left, Right> = [Left] extends [Right]
  ? [Right] extends [Left]
    ? true
    : false
  : false;
type Not<T extends boolean> = T extends true ? false : true;

type F1TypeProofs = readonly [
  Assert<Not<IsAssignable<DocumentId, SectionId>>>,
  Assert<Not<IsAssignable<SectionId, DocumentId>>>,
  Assert<
    Not<
      IsAssignable<
        Readonly<{ numerator: 1; denominator: 1 }>,
        BeatValue
      >
    >
  >,
  Assert<Not<IsAssignable<number, MidiPitch>>>,
  Assert<Not<IsAssignable<ProgressionDocumentV2, ValidatedDocument>>>,
  Assert<
    IsNever<Extract<CustomChordEvent, Readonly<{ voicing: AutoVoicing }>>>
  >,
  Assert<
    IsNever<
      Extract<
        AutoVoicing,
        Readonly<{ family: "rootless-a"; bassPolicy: "generated" }>
      >
    >
  >,
  Assert<
    IsNever<
      Extract<
        ParsedChordEvent,
        Readonly<{
          chord: Readonly<{ bass: null }>;
          voicing: ManualVoicing & Readonly<{ bassPolicy: "external" }>;
        }>
      >
    >
  >,
  Assert<
    Extract<DecodeResult<unknown>, Readonly<{ ok: false }>>["errors"] extends
      readonly [unknown, ...unknown[]]
      ? true
      : false
  >,
  Assert<
    Not<
      IsAssignable<
        Extract<DomainCopyResult, Readonly<{ ok: false }>>,
        Readonly<{ value: unknown }>
      >
    >
  >,
  Assert<
    IsEqual<
      StableIdLocation["pathRoot"],
      "copy-root" | "occupied-document"
    >
  >,
  Assert<Not<IsAssignable<BeatPosition, BeatDuration>>>,
  Assert<Not<IsAssignable<BeatDuration, BeatPosition>>>,
  Assert<
    IsEqual<Parameters<DomainOperations["makeBeatRange"]>[0], BeatPosition>
  >,
  Assert<
    IsEqual<Parameters<DomainOperations["makeBeatRange"]>[1], BeatPosition>
  >,
  Assert<
    IsEqual<
      Extract<TimelineAccumulationResult, Readonly<{ ok: true }>>["value"],
      BeatPosition
    >
  >,
  Assert<
    IsAssignable<
      Readonly<{
        id: MeasureId;
        events: readonly [ChordEvent];
        completion: Readonly<{ kind: "empty" }>;
      }>,
      MeasureShape
    >
  >,
  Assert<
    Not<
      IsAssignable<
        Readonly<{
          id: MeasureId;
          events: readonly [ChordEvent];
          completion: Readonly<{ kind: "empty" }>;
        }>,
        Measure
      >
    >
  >,
  Assert<Not<IsAssignable<ProgressionDocumentShapeV2, ProgressionDocumentV2>>>,
  Assert<Not<IsAssignable<"chord.source_semantic_mismatch", F2DecodeIssueCode>>>,
  Assert<IsEqual<DomainCopyRequest<"event">["source"], ChordEvent>>,
  Assert<
    IsEqual<
      Extract<DomainCopyResult<"event">, Readonly<{ ok: true }>>["value"],
      ChordEvent
    >
  >,
  Assert<
    IsEqual<
      Extract<StableIdOccupancy, Readonly<{ location: { kind: "document" } }>>["id"],
      DocumentId
    >
  >,
  Assert<IsEqual<CopyStableIdLocation["pathRoot"], "copy-root">>,
  Assert<
    IsEqual<OccupiedStableIdLocation["pathRoot"], "occupied-document">
  >,
  Assert<
    IsEqual<
      ExistingStableIdLocation["pathRoot"],
      "copy-root" | "occupied-document"
    >
  >,
  Assert<
    IsEqual<
      Extract<
        IdRemapRefusal,
        Readonly<{ code: "id.collision_existing" }>
      >["occupied"]["pathRoot"],
      "copy-root" | "occupied-document"
    >
  >,
  Assert<
    IsEqual<
      Extract<IdFactoryResult<"event">, Readonly<{ ok: false }>>["refusal"]["kind"],
      "event"
    >
  >,
  Assert<
    IsAssignable<
      StableIdRemapEntry<"event">,
      Readonly<{ sourcePath: readonly (string | number)[] }>
    >
  >,
  Assert<"compareValidationIssues" extends keyof DomainOperations ? true : false>,
  Assert<
    IsEqual<
      Extract<
        ReturnType<DomainOperations["makeManualVoicing"]>,
        Readonly<{ ok: true }>
      >["value"],
      ManualVoicing
    >
  >,
  Assert<
    IsEqual<
      Extract<
        ReturnType<DomainOperations["makeFrozenVoicing"]>,
        Readonly<{ ok: true }>
      >["value"],
      FrozenVoicing
    >
  >,
  Assert<
    IsEqual<
      Extract<
        ReturnType<DomainOperations["makeAutoVoicing"]>,
        Readonly<{ ok: true }>
      >["value"],
      AutoVoicing
    >
  >,
  Assert<
    Not<
      IsAssignable<
        "custom.auto_voicing_forbidden",
        Extract<
          ReturnType<DomainOperations["makeManualVoicing"]>,
          Readonly<{ ok: false }>
        >["refusal"]["code"]
      >
    >
  >,
  Assert<
    Not<
      IsAssignable<
        "beat.negative_result",
        Extract<
          BeatArithmeticResult,
          Readonly<{ operation: "add"; ok: false }>
        >["refusal"]["code"]
      >
    >
  >,
  Assert<"occupiedIds" extends keyof DomainCopyRequest ? false : true>,
  Assert<"beatValueToMidiTicks" extends keyof DomainOperations ? true : false>,
];

const compileTimeProofs: F1TypeProofs = [
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
];

describe("F1 public domain type contract", () => {
  test("keeps nominal and conditional invariants in the public entry point", () => {
    expect([...compileTimeProofs]).toEqual(
      Array.from({ length: compileTimeProofs.length }, () => true),
    );
  });

  test("exports every ordered vocabulary in its frozen order", () => {
    expect(STABLE_ID_KINDS).toEqual(["document", "section", "measure", "event"]);
    expect(SPELLING_STEP_ORDER).toEqual(["C", "D", "E", "F", "G", "A", "B"]);
    expect(KEY_MODES).toEqual([
      "major",
      "natural-minor",
      "harmonic-minor",
      "melodic-minor",
    ]);
    expect(INSTRUMENT_IDS).toEqual([
      "mellow-keys",
      "fm-electric-piano",
      "vibraphone",
      "warm-pad",
      "analog-poly",
      "concert-grand",
      "flute",
      "organ",
      "guitar",
      "upright-bass",
      "concert-vibes",
      "blues-guitar",
      "clarinet",
    ]);
    expect(BEAT_UNITS).toEqual([2, 4, 8]);
    expect(DEGREE_NUMBER_ORDER).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 11, 13]);
    expect(AUTO_VOICING_FAMILIES).toEqual([
      "balanced",
      "shell",
      "rootless-a",
      "rootless-b",
      "open",
      "drop2",
      "quartal",
    ]);
    expect(AUTO_BASS_POLICIES).toEqual(["generated", "external", "none"]);
    expect(STORED_BASS_POLICIES).toEqual(["included", "external"]);
    expect(TRIAD_QUALITIES).toEqual([
      "major",
      "minor",
      "diminished",
      "augmented",
      "sus2",
      "sus4",
      "power",
    ]);
    expect(SEVENTH_QUALITIES).toEqual(["major", "minor", "diminished"]);
    expect(CHORD_COLOR_POLICIES).toEqual(["none", "altered-dominant"]);
    expect(AUTO_VOICE_COUNTS).toEqual([3, 4, 5, 6, 7]);
    expect(COUNT_IN_BARS_VALUES).toEqual([0, 1, 2]);
    expect(SECTION_VOICE_LEADING_BOUNDARIES).toEqual(["continue", "reset"]);
    expect(DOMAIN_COPY_ROOT_KINDS).toEqual([
      "document",
      "section",
      "measure",
      "event",
    ]);
    expect(ALLOWED_BEAT_DENOMINATORS).toHaveLength(28);
    expect(VALIDATION_DIAGNOSTIC_ORDER).toEqual(["path", "code"]);
  });

  test("keeps stable issue-code values unique", () => {
    const codes = Object.values(DOMAIN_VALIDATION_ISSUE_CODES);
    expect(codes.length).toBeGreaterThan(0);
    expect(new Set(codes).size).toBe(codes.length);

    const stageLists = [
      F1_VALUE_ISSUE_CODES,
      F2_STRUCTURAL_ISSUE_CODES,
      F3_SEMANTIC_ISSUE_CODES,
    ];
    const staged = stageLists.flat();
    expect(new Set(staged).size).toBe(staged.length);
    expect([...staged].sort()).toEqual([...codes].sort());
  });
});
