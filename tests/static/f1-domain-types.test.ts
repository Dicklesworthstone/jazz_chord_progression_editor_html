import { describe, expect, test } from "bun:test";

import {
  ALLOWED_BEAT_DENOMINATORS,
  AUTO_BASS_POLICIES,
  AUTO_VOICING_FAMILIES,
  BEAT_UNITS,
  DEGREE_NUMBER_ORDER,
  DOMAIN_VALIDATION_ISSUE_CODES,
  INSTRUMENT_IDS,
  KEY_MODES,
  SPELLING_STEP_ORDER,
  STABLE_ID_KINDS,
  STORED_BASS_POLICIES,
  VALIDATION_DIAGNOSTIC_ORDER,
  type AutoVoicing,
  type BeatValue,
  type CustomChordEvent,
  type DecodeResult,
  type DocumentId,
  type ManualVoicing,
  type MidiPitch,
  type ParsedChordEvent,
  type ProgressionDocumentV2,
  type SectionId,
  type ValidatedDocument,
} from "../../src/domain";

type Assert<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;
type IsNever<T> = [T] extends [never] ? true : false;
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
];

describe("F1 public domain type contract", () => {
  test("keeps nominal and conditional invariants in the public entry point", () => {
    expect(compileTimeProofs).toEqual(Array.from({ length: 9 }, () => true));
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
    expect(ALLOWED_BEAT_DENOMINATORS).toHaveLength(28);
    expect(VALIDATION_DIAGNOSTIC_ORDER).toEqual(["path", "code"]);
  });

  test("keeps stable issue-code values unique", () => {
    const codes = Object.values(DOMAIN_VALIDATION_ISSUE_CODES);
    expect(codes.length).toBeGreaterThan(0);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
