import { describe, expect, test } from "bun:test";

import {
  DOMAIN_VALIDATION_ISSUE_CODES,
  INSTRUMENT_IDS,
  KEY_MODES,
  MAX_DOCUMENT_CHORD_EVENTS,
  MAX_DOCUMENT_SECTIONS,
  MAX_JSON_NESTING_DEPTH,
  MAX_LONG_TEXT_CODE_POINTS,
  MAX_SECTION_MEASURES,
  MAX_SHORT_TEXT_CODE_POINTS,
  MAX_UTF8_IMPORT_BYTES,
  SECTION_VOICE_LEADING_BOUNDARIES,
  SPELLING_STEP_ORDER,
  domainOperations,
  type DomainPath,
  type DomainValidationIssueCode,
  type InstrumentId,
  type SpelledPitch,
  type SpelledPitchClass,
  type ValidationIssue,
} from "../../src/domain";

type JsonRecord = Readonly<Record<string, unknown>>;

type FixtureIssue = Readonly<{
  code: string;
  path: DomainPath;
}>;

type IndependentResult = Readonly<{
  input?: number | string;
  inputDescriptor?: JsonRecord;
  inputIndex?: number;
  code: string;
  path?: DomainPath;
}>;

type FixtureExpected = Readonly<{
  ok?: boolean;
  issue?: FixtureIssue;
  issuesInOrder?: readonly FixtureIssue[];
  independentResults?: readonly IndependentResult[];
  allValid?: boolean;
  pitchClass?: number;
  midi?: number;
  frequencyHz?: number;
  projectedMidi?: number;
  spelledValueRetained?: boolean;
  spelledEqual?: boolean;
  midiEqual?: boolean;
  pitchClassEqual?: boolean;
  sourceMidi?: readonly number[];
  transposedMidi?: readonly number[];
  sourceSpelledEqual?: boolean;
  transposedSpelledEqual?: boolean;
  identityPreservedUnderRelation?: boolean;
  transpositionImplementationOwnedBy?: string;
  preservedOrder?: readonly string[];
  inferredOrPersistedModes?: readonly string[];
  value?: number | string;
  valueExactly?: string;
  distinct?: boolean;
  normalizationApplied?: boolean;
  storedExactly?: boolean;
  absentInputStaysAbsent?: boolean;
}>;

type FixtureCase = Readonly<{
  id: string;
  kind: string;
  input?: unknown;
  inputDescriptor?: JsonRecord;
  inputSteps?: readonly string[];
  inputModes?: readonly string[];
  tonic?: unknown;
  expectedNaturalPitchClasses?: readonly number[];
  expectedMidi?: readonly number[];
  expectedPitchClasses?: readonly number[];
  expectedOrder?: readonly string[];
  left?: unknown;
  right?: unknown;
  source?: readonly unknown[];
  transposed?: readonly unknown[];
  spelledInterval?: JsonRecord;
  expected?: FixtureExpected;
}>;

type PitchFixture = Readonly<{
  schema: string;
  frequencyAbsoluteToleranceHz: number;
  cases: readonly FixtureCase[];
}>;

type DocumentFixture = Readonly<{
  schema: string;
  cases: readonly FixtureCase[];
}>;

type FallibleOperationResult =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false;
      refusal: Readonly<{ code: string; path: DomainPath }>;
    }>;

const pitchFixture = Bun.file(
  new URL("../fixtures/domain/pitch-cases.json", import.meta.url),
).json() as Promise<PitchFixture>;

const documentFixture = Bun.file(
  new URL("../fixtures/domain/document-boundary-cases.json", import.meta.url),
).json() as Promise<DocumentFixture>;

function fixtureFailure(label: string): never {
  throw new Error(`F1_PRODUCTION_FIXTURE_SHAPE: ${label}`);
}

function requireExpected(row: FixtureCase): FixtureExpected {
  return row.expected ?? fixtureFailure(`${row.id}.expected`);
}

function requireIssue(row: FixtureCase): FixtureIssue {
  return requireExpected(row).issue ?? fixtureFailure(`${row.id}.expected.issue`);
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fixtureFailure(label);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) return fixtureFailure(label);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") return fixtureFailure(label);
  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number") return fixtureFailure(label);
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") return fixtureFailure(label);
  return value;
}

function requireStringArray(value: unknown, label: string): readonly string[] {
  return requireArray(value, label).map((entry, index) =>
    requireString(entry, `${label}[${String(index)}]`),
  );
}

function requireNumberArray(value: unknown, label: string): readonly number[] {
  return requireArray(value, label).map((entry, index) =>
    requireNumber(entry, `${label}[${String(index)}]`),
  );
}

function pitchInput(value: unknown, label: string): Readonly<{
  step: string;
  alter: number;
  octave: number;
}> {
  const record = requireRecord(value, label);
  return {
    step: requireString(record["step"], `${label}.step`),
    alter: requireNumber(record["alter"], `${label}.alter`),
    octave: requireNumber(record["octave"], `${label}.octave`),
  };
}

function pitchClassInput(value: unknown, label: string): Readonly<{
  step: string;
  alter: number;
}> {
  const record = requireRecord(value, label);
  return {
    step: requireString(record["step"], `${label}.step`),
    alter: requireNumber(record["alter"], `${label}.alter`),
  };
}

function makePitch(input: unknown, label: string): SpelledPitch {
  const result = domainOperations.makeSpelledPitch(pitchInput(input, label));
  if (!result.ok) {
    throw new Error(`${label}: unexpected ${result.refusal.code}`);
  }
  return result.value;
}

function makePitchClass(input: unknown, label: string): SpelledPitchClass {
  const result = domainOperations.makeSpelledPitchClass(
    pitchClassInput(input, label),
  );
  if (!result.ok) {
    throw new Error(`${label}: unexpected ${result.refusal.code}`);
  }
  return result.value;
}

function materializeSpecialNumber(descriptor: JsonRecord, label: string): number {
  const name = requireString(descriptor["specialNumber"], label);
  switch (name) {
    case "NaN":
      return Number.NaN;
    case "+Infinity":
      return Number.POSITIVE_INFINITY;
    case "-Infinity":
      return Number.NEGATIVE_INFINITY;
    default:
      return fixtureFailure(`${label}: ${name}`);
  }
}

function materializeRepeatedAscii(descriptor: JsonRecord, label: string): string {
  const repeated = requireString(descriptor["repeatAscii"], `${label}.repeatAscii`);
  const count = requireNumber(descriptor["count"], `${label}.count`);
  return repeated.repeat(count);
}

function exactRefusal(
  result: FallibleOperationResult,
  expected: FixtureIssue,
  prefix: DomainPath = [],
): void {
  if (result.ok) throw new Error(`expected refusal ${expected.code}`);
  expect({
    code: result.refusal.code,
    path: [...prefix, ...result.refusal.path],
  }).toEqual({ code: expected.code, path: [...expected.path] });
}

function expectedIssues(row: FixtureCase): readonly FixtureIssue[] {
  return (
    requireExpected(row).issuesInOrder ??
    fixtureFailure(`${row.id}.expected.issuesInOrder`)
  );
}

function asValidationIssue(issue: FixtureIssue): ValidationIssue {
  const knownCodes: readonly string[] = Object.values(
    DOMAIN_VALIDATION_ISSUE_CODES,
  );
  if (!knownCodes.includes(issue.code)) {
    return fixtureFailure(`unknown validation code ${issue.code}`);
  }
  return {
    code: issue.code as DomainValidationIssueCode,
    path: issue.path,
    message: "independent fixture observation",
  };
}

function projectSuccessfulPitch(
  input: unknown,
  label: string,
): Readonly<{
  written: SpelledPitch;
  pitchClass: number;
  midi: number;
  frequencyHz: number;
}> {
  const written = makePitch(input, label);
  const projected = domainOperations.projectSpelledPitch(written);
  if (!projected.ok) {
    throw new Error(`${label}: unexpected ${projected.refusal.code}`);
  }
  return {
    written,
    pitchClass: projected.value.pitchClass,
    midi: projected.value.midi,
    frequencyHz: projected.value.frequencyHz,
  };
}

function diatonicCoordinate(pitch: SpelledPitch, label: string): number {
  const stepIndex = SPELLING_STEP_ORDER.indexOf(pitch.step);
  if (stepIndex === -1) return fixtureFailure(`${label}.step`);
  return pitch.octave * SPELLING_STEP_ORDER.length + stepIndex;
}

function runPitchCase(row: FixtureCase, frequencyTolerance: number): void {
  switch (row.kind) {
    case "project-spelled-pitch": {
      const written = makePitch(row.input, `${row.id}.input`);
      const result = domainOperations.projectSpelledPitch(written);
      const expected = requireExpected(row);
      if (expected.ok === false) {
        exactRefusal(result, requireIssue(row));
        if (result.ok) return;
        expect(result.refusal.projectedMidi).toBe(
          requireNumber(expected.projectedMidi, `${row.id}.projectedMidi`),
        );
        expect(result.refusal.spelled === written).toBe(
          requireBoolean(
            expected.spelledValueRetained,
            `${row.id}.spelledValueRetained`,
          ),
        );
        return;
      }
      if (!result.ok) throw new Error(`${row.id}: ${result.refusal.code}`);
      expect(result.value.spelled).toBe(written);
      const actualPitchClass: number = result.value.pitchClass;
      expect(actualPitchClass).toBe(
        requireNumber(expected.pitchClass, `${row.id}.pitchClass`),
      );
      expect(Number(result.value.midi)).toBe(
        requireNumber(expected.midi, `${row.id}.midi`),
      );
      expect(
        Math.abs(
          result.value.frequencyHz -
            requireNumber(expected.frequencyHz, `${row.id}.frequencyHz`),
        ),
      ).toBeLessThanOrEqual(frequencyTolerance);
      return;
    }
    case "decode-spelled-pitch":
    case "decode-spelled-pitch-alter-fractional": {
      exactRefusal(
        domainOperations.makeSpelledPitch(
          pitchInput(row.input, `${row.id}.input`),
        ),
        requireIssue(row),
      );
      return;
    }
    case "decode-spelled-pitch-alter-nan": {
      const descriptor =
        row.inputDescriptor ?? fixtureFailure(`${row.id}.inputDescriptor`);
      const alterDescriptor = requireRecord(
        descriptor["alter"],
        `${row.id}.inputDescriptor.alter`,
      );
      exactRefusal(
        domainOperations.makeSpelledPitch({
          step: requireString(descriptor["step"], `${row.id}.step`),
          alter: materializeSpecialNumber(alterDescriptor, `${row.id}.alter`),
          octave: requireNumber(descriptor["octave"], `${row.id}.octave`),
        }),
        requireIssue(row),
      );
      return;
    }
    case "midi-to-frequency": {
      const record = requireRecord(row.input, `${row.id}.input`);
      const result = domainOperations.makeMidiPitch(
        requireNumber(record["midi"], `${row.id}.input.midi`),
      );
      exactRefusal(result, requireIssue(row));
      return;
    }
    case "compare-spelled-pitches": {
      const left = projectSuccessfulPitch(row.left, `${row.id}.left`);
      const right = projectSuccessfulPitch(row.right, `${row.id}.right`);
      const expected = requireExpected(row);
      expect(
        domainOperations.compareSpelledPitches(left.written, right.written) ===
          0,
      ).toBe(requireBoolean(expected.spelledEqual, `${row.id}.spelledEqual`));
      expect(left.midi === right.midi).toBe(
        requireBoolean(expected.midiEqual, `${row.id}.midiEqual`),
      );
      expect(left.pitchClass === right.pitchClass).toBe(
        requireBoolean(
          expected.pitchClassEqual,
          `${row.id}.pitchClassEqual`,
        ),
      );
      return;
    }
    case "natural-step-projection-set": {
      const steps =
        row.inputSteps ?? fixtureFailure(`${row.id}.inputSteps`);
      const actual = steps.map((step) => {
        const result = domainOperations.makeSpelledPitchClass({ step, alter: 0 });
        if (!result.ok) throw new Error(`${row.id}: ${result.refusal.code}`);
        return domainOperations.pitchClassOf(result.value);
      });
      expect(actual.map(Number)).toEqual([
        ...(row.expectedNaturalPitchClasses ??
          fixtureFailure(`${row.id}.expectedNaturalPitchClasses`)),
      ]);
      return;
    }
    case "allowed-alter-projection-set": {
      const input = requireRecord(row.input, `${row.id}.input`);
      const step = requireString(input["step"], `${row.id}.input.step`);
      const octave = requireNumber(input["octave"], `${row.id}.input.octave`);
      const alters = requireNumberArray(
        input["alters"],
        `${row.id}.input.alters`,
      );
      const projections = alters.map((alter) =>
        projectSuccessfulPitch(
          { step, alter, octave },
          `${row.id}.input.alters[${String(alter)}]`,
        ),
      );
      expect(projections.map(({ midi }) => midi)).toEqual([
        ...(row.expectedMidi ?? fixtureFailure(`${row.id}.expectedMidi`)),
      ]);
      expect(projections.map(({ pitchClass }) => pitchClass)).toEqual(
        [
          ...(row.expectedPitchClasses ??
            fixtureFailure(`${row.id}.expectedPitchClasses`)),
        ],
      );
      return;
    }
    case "compare-spelling-step-order": {
      const input = requireStringArray(row.input, `${row.id}.input`);
      const values = input.map((step) => {
        const result = domainOperations.makeSpelledPitchClass({ step, alter: 0 });
        if (!result.ok) throw new Error(`${row.id}: ${result.refusal.code}`);
        return result.value;
      });
      const actualOrder: string[] = [...values]
        .sort(domainOperations.compareSpelledPitchClasses)
        .map(({ step }) => step);
      expect(actualOrder).toEqual([
        ...(row.expectedOrder ?? fixtureFailure(`${row.id}.expectedOrder`)),
      ]);
      return;
    }
    case "parallel-transposed-enharmonic-pair": {
      const source = (
        row.source ?? fixtureFailure(`${row.id}.source`)
      ).map((input, index) =>
        projectSuccessfulPitch(input, `${row.id}.source[${String(index)}]`),
      );
      const transposed = (
        row.transposed ?? fixtureFailure(`${row.id}.transposed`)
      ).map((input, index) =>
        projectSuccessfulPitch(
          input,
          `${row.id}.transposed[${String(index)}]`,
        ),
      );
      const expected = requireExpected(row);
      expect(source.map(({ midi }) => midi)).toEqual([
        ...(expected.sourceMidi ?? fixtureFailure(`${row.id}.sourceMidi`)),
      ]);
      expect(transposed.map(({ midi }) => midi)).toEqual(
        [
          ...(expected.transposedMidi ??
            fixtureFailure(`${row.id}.transposedMidi`)),
        ],
      );
      expect(
        domainOperations.compareSpelledPitches(
          source[0]?.written ?? fixtureFailure(`${row.id}.source[0]`),
          source[1]?.written ?? fixtureFailure(`${row.id}.source[1]`),
        ) === 0,
      ).toBe(
        requireBoolean(
          expected.sourceSpelledEqual,
          `${row.id}.sourceSpelledEqual`,
        ),
      );
      expect(
        domainOperations.compareSpelledPitches(
          transposed[0]?.written ?? fixtureFailure(`${row.id}.transposed[0]`),
          transposed[1]?.written ?? fixtureFailure(`${row.id}.transposed[1]`),
        ) === 0,
      ).toBe(
        requireBoolean(
          expected.transposedSpelledEqual,
          `${row.id}.transposedSpelledEqual`,
        ),
      );
      const interval =
        row.spelledInterval ?? fixtureFailure(`${row.id}.spelledInterval`);
      const semitones = requireNumber(
        interval["semitones"],
        `${row.id}.spelledInterval.semitones`,
      );
      const diatonicSteps = requireNumber(
        interval["diatonicSteps"],
        `${row.id}.spelledInterval.diatonicSteps`,
      );
      expect(
        requireString(
          interval["direction"],
          `${row.id}.spelledInterval.direction`,
        ),
      ).toBe("up");
      expect(
        source.every((value, index) => {
          const moved = transposed[index];
          return (
            moved !== undefined &&
            moved.midi - value.midi === semitones &&
            diatonicCoordinate(moved.written, `${row.id}.transposed`) -
              diatonicCoordinate(value.written, `${row.id}.source`) ===
              diatonicSteps
          );
        }),
      ).toBe(
        requireBoolean(
          expected.identityPreservedUnderRelation,
          `${row.id}.identityPreservedUnderRelation`,
        ),
      );
      expect(expected.transpositionImplementationOwnedBy).toBe("H1");
      return;
    }
    default:
      return fixtureFailure(`${row.id}: unsupported pitch kind ${row.kind}`);
  }
}

const RUNTIME_DOCUMENT_CASE_IDS = [
  "F1-DOC-003",
  "F1-DOC-004",
  "F1-DOC-005",
  "F1-DOC-007",
  "F1-DOC-008",
  "F1-DOC-013",
  "F1-DOC-014",
  "F1-DOC-015",
  "F1-DOC-016",
  "F1-DOC-017",
  "F1-DOC-018",
  "F1-DOC-019",
  "F1-DOC-020",
  "F1-DOC-021",
  "F1-DOC-039",
  "F1-DOC-040",
  "F1-DOC-041",
  "F1-DOC-042",
  "F1-DOC-043",
  "F1-DOC-044",
  "F1-DOC-045",
  "F1-DOC-046",
  "F1-DOC-047",
  "F1-DOC-048",
  "F1-DOC-049",
  "F1-DOC-050",
  "F1-DOC-051",
  "F1-DOC-065",
  "F1-DOC-066",
  "F1-DOC-067",
  "F1-DOC-068",
  "F1-DOC-069",
  "F1-DOC-070",
  "F1-DOC-071",
  "F1-DOC-075",
  "F1-DOC-076",
  "F1-DOC-080",
  "F1-DOC-081",
  "F1-DOC-082",
  "F1-DOC-086",
  "F1-DOC-087",
  "F1-DOC-088",
] as const;

const UNAVAILABLE_DOCUMENT_CASES: Readonly<Record<string, string>> = {
  "F1-DOC-001": "F2 total document decoder is intentionally not part of F1",
  "F1-DOC-002": "F2 total document decoder is intentionally not part of F1",
  "F1-DOC-006": "null key shape is declarative; inference behavior belongs downstream",
  "F1-DOC-009": "F2 root-shape decoder is intentionally not part of F1",
  "F1-DOC-010": "F2 root-shape decoder is intentionally not part of F1",
  "F1-DOC-011": "F2 schema decoder is intentionally not part of F1",
  "F1-DOC-012": "F2 schema decoder is intentionally not part of F1",
  "F1-DOC-022": "F2 import byte preflight is intentionally not part of F1",
  "F1-DOC-023": "F2 import byte preflight is intentionally not part of F1",
  "F1-DOC-024": "F2 JSON depth preflight is intentionally not part of F1",
  "F1-DOC-025": "F2 JSON depth preflight is intentionally not part of F1",
  "F1-DOC-026": "F2 section collection decoder is intentionally not part of F1",
  "F1-DOC-027": "F2 section collection decoder is intentionally not part of F1",
  "F1-DOC-028": "F2 measure collection decoder is intentionally not part of F1",
  "F1-DOC-029": "F2 measure collection decoder is intentionally not part of F1",
  "F1-DOC-030": "F2 event collection decoder is intentionally not part of F1",
  "F1-DOC-031": "F2 event collection decoder is intentionally not part of F1",
  "F1-DOC-032": "F2 persisted text decoder is intentionally not part of F1",
  "F1-DOC-033": "F2 persisted text decoder is intentionally not part of F1",
  "F1-DOC-034": "F2 persisted text decoder is intentionally not part of F1",
  "F1-DOC-035": "F2 persisted text decoder is intentionally not part of F1",
  "F1-DOC-036": "F2 Unicode scalar text decoder is intentionally not part of F1",
  "F1-DOC-037": "F2 Unicode scalar text decoder is intentionally not part of F1",
  "F1-DOC-038": "F2 Unicode scalar text decoder is intentionally not part of F1",
  "F1-DOC-052": "F2 DecodeResult runtime producer is intentionally not part of F1",
  "F1-DOC-053": "F2 persisted custom-label decoder is intentionally not part of F1",
  "F1-DOC-054": "F2 persisted custom-label decoder is intentionally not part of F1",
  "F1-DOC-055": "F2 persisted section-name decoder is intentionally not part of F1",
  "F1-DOC-056": "F2 persisted section-name decoder is intentionally not part of F1",
  "F1-DOC-057": "F2 persisted description decoder is intentionally not part of F1",
  "F1-DOC-058": "F2 persisted description decoder is intentionally not part of F1",
  "F1-DOC-059": "F2 persisted reason decoder is intentionally not part of F1",
  "F1-DOC-060": "F2 persisted reason decoder is intentionally not part of F1",
  "F1-DOC-061": "F2 required-text decoder is intentionally not part of F1",
  "F1-DOC-062": "F2 required-text decoder is intentionally not part of F1",
  "F1-DOC-063": "F2 required-text decoder is intentionally not part of F1",
  "F1-DOC-064": "F2 required-text decoder is intentionally not part of F1",
  "F1-DOC-072": "F2 section-boundary decoder is intentionally not part of F1",
  "F1-DOC-073": "F2 strict-field decoder is intentionally not part of F1",
  "F1-DOC-074": "F2 structural type decoder is intentionally not part of F1",
  "F1-DOC-077": "F2 Unicode scalar text decoder is intentionally not part of F1",
  "F1-DOC-078": "F2 required-text decoder is intentionally not part of F1",
  "F1-DOC-079": "F2 persisted text decoder is intentionally not part of F1",
  "F1-DOC-083": "F2 nested strict-field decoder is intentionally not part of F1",
  "F1-DOC-084": "F2 required-text decoder is intentionally not part of F1",
  "F1-DOC-085": "F2 required-text decoder is intentionally not part of F1",
};

const PARTIALLY_DRIVEN_CASES = {
  "F1-PITCH-026":
    "F1 projects and compares both reviewed pairs; the transpose operation is H1-owned",
  "F1-DOC-051":
    "F1 proves exact issue ordering; F2 will produce the issues transactionally",
  "F1-DOC-075":
    "F1 proves numeric path ordering; F2 will produce the issues",
  "F1-DOC-076":
    "F1 proves identical-path code ordering; F2 will produce the issues",
} as const;

function instrumentId(): InstrumentId {
  const result = domainOperations.makeInstrumentId("mellow-keys");
  if (!result.ok) throw new Error(result.refusal.code);
  return result.value;
}

function materializeIdInput(row: FixtureCase): string {
  if (row.inputDescriptor !== undefined) {
    return materializeRepeatedAscii(row.inputDescriptor, row.id);
  }
  return requireString(row.input, `${row.id}.input`);
}

function runIdCase(row: FixtureCase): void {
  const wire = materializeIdInput(row);
  const result = domainOperations.parseStableId("document", wire);
  const expected = requireExpected(row);
  if (expected.ok === false) {
    exactRefusal(result, requireIssue(row));
    return;
  }
  if (!result.ok) throw new Error(`${row.id}: ${result.refusal.code}`);
  expect(String(result.value)).toBe(wire);
  if (expected.valueExactly !== undefined) {
    expect(String(result.value)).toBe(expected.valueExactly);
  }
  if (typeof expected.value === "string") {
    expect(String(result.value)).toBe(expected.value);
  }
}

function runTempoCase(row: FixtureCase): void {
  const received =
    row.inputDescriptor === undefined
      ? requireNumber(row.input, `${row.id}.input`)
      : materializeSpecialNumber(row.inputDescriptor, `${row.id}.inputDescriptor`);
  const result = domainOperations.makeTempoBpm(received);
  const expected = requireExpected(row);
  if (expected.ok === false) {
    exactRefusal(result, requireIssue(row), ["tempoBpm"]);
    return;
  }
  if (!result.ok) throw new Error(`${row.id}: ${result.refusal.code}`);
  expect(result.value).toBe(
    requireNumber(expected.value, `${row.id}.expected.value`),
  );
}

function numberOrDescriptor(value: unknown, label: string): number {
  if (typeof value === "number") return value;
  return materializeSpecialNumber(requireRecord(value, label), label);
}

function runMeterCase(row: FixtureCase): void {
  const values = requireArray(row.input, `${row.id}.input`);
  const expected = requireExpected(row);
  if (row.kind === "beats-per-bar-boundaries") {
    for (const [index, value] of values.entries()) {
      const received = requireNumber(value, `${row.id}.input[${String(index)}]`);
      const result = domainOperations.makeMeter({
        beatsPerBar: received,
        beatUnit: 4,
      });
      if (!result.ok) throw new Error(`${row.id}: ${result.refusal.code}`);
      const actualBeatsPerBar: number = result.value.beatsPerBar;
      const actualBeatUnit: number = result.value.beatUnit;
      expect(actualBeatsPerBar).toBe(received);
      expect(actualBeatUnit).toBe(4);
    }
    expect(requireBoolean(expected.allValid, `${row.id}.allValid`)).toBe(true);
    return;
  }
  if (row.kind === "beat-unit-set") {
    for (const [index, value] of values.entries()) {
      const received = requireNumber(value, `${row.id}.input[${String(index)}]`);
      const result = domainOperations.makeMeter({
        beatsPerBar: 4,
        beatUnit: received,
      });
      if (!result.ok) throw new Error(`${row.id}: ${result.refusal.code}`);
      const actualBeatsPerBar: number = result.value.beatsPerBar;
      const actualBeatUnit: number = result.value.beatUnit;
      expect(actualBeatsPerBar).toBe(4);
      expect(actualBeatUnit).toBe(received);
    }
    expect(requireBoolean(expected.allValid, `${row.id}.allValid`)).toBe(true);
    return;
  }

  const observations =
    expected.independentResults ??
    fixtureFailure(`${row.id}.expected.independentResults`);
  expect(observations).toHaveLength(values.length);
  for (const [index, value] of values.entries()) {
    const received = numberOrDescriptor(value, `${row.id}.input[${String(index)}]`);
    const observation =
      observations[index] ?? fixtureFailure(`${row.id}.independentResults[${String(index)}]`);
    const result =
      row.kind === "beats-per-bar-out-of-range"
        ? domainOperations.makeMeter({ beatsPerBar: received, beatUnit: 4 })
        : domainOperations.makeMeter({ beatsPerBar: 4, beatUnit: received });
    if (result.ok) throw new Error(`${row.id}: expected ${observation.code}`);
    const actualCode: string = result.refusal.code;
    expect(actualCode).toBe(observation.code);
    expect([...result.refusal.path]).toEqual(
      row.kind === "beats-per-bar-out-of-range"
        ? ["beatsPerBar"]
        : ["beatUnit"],
    );
  }
}

function playbackInput(
  field: string,
  value: number,
): Readonly<{
  instrumentId: InstrumentId;
  masterVolume: number;
  reverbAmount: number;
  countInBars: number;
}> {
  const base = {
    instrumentId: instrumentId(),
    masterVolume: 0.8,
    reverbAmount: 0.2,
    countInBars: 1,
  };
  switch (field) {
    case "masterVolume":
      return { ...base, masterVolume: value };
    case "reverbAmount":
      return { ...base, reverbAmount: value };
    case "countInBars":
      return { ...base, countInBars: value };
    default:
      return fixtureFailure(`playback field ${field}`);
  }
}

function runPlaybackCase(row: FixtureCase): void {
  const expected = requireExpected(row);
  if (row.kind === "playback-level-boundaries") {
    for (const [index, value] of requireArray(row.input, `${row.id}.input`).entries()) {
      const record = requireRecord(value, `${row.id}.input[${String(index)}]`);
      const field = requireString(record["field"], `${row.id}.field`);
      const received = requireNumber(record["value"], `${row.id}.value`);
      const result = domainOperations.makePlaybackSettings(
        playbackInput(field, received),
      );
      if (!result.ok) throw new Error(`${row.id}: ${result.refusal.code}`);
      expect(result.value[field as "masterVolume" | "reverbAmount"]).toBe(
        received,
      );
    }
    expect(requireBoolean(expected.allValid, `${row.id}.allValid`)).toBe(true);
    return;
  }
  if (row.kind === "count-in-bars-set") {
    for (const value of requireNumberArray(row.input, `${row.id}.input`)) {
      const result = domainOperations.makePlaybackSettings(
        playbackInput("countInBars", value),
      );
      if (!result.ok) throw new Error(`${row.id}: ${result.refusal.code}`);
      const actualCountInBars: number = result.value.countInBars;
      expect(actualCountInBars).toBe(value);
    }
    expect(requireBoolean(expected.allValid, `${row.id}.allValid`)).toBe(true);
    return;
  }
  if (row.kind === "count-in-bars-invalid") {
    const values = requireNumberArray(row.input, `${row.id}.input`);
    const observations =
      expected.independentResults ?? fixtureFailure(`${row.id}.independentResults`);
    expect(observations).toHaveLength(values.length);
    for (const [index, value] of values.entries()) {
      const observation =
        observations[index] ?? fixtureFailure(`${row.id}.observation[${String(index)}]`);
      const result = domainOperations.makePlaybackSettings(
        playbackInput("countInBars", value),
      );
      if (result.ok) throw new Error(`${row.id}: expected ${observation.code}`);
      const actualCode: string = result.refusal.code;
      expect(actualCode).toBe(observation.code);
      expect(["playback", ...result.refusal.path]).toEqual([
        "playback",
        "countInBars",
      ]);
    }
    return;
  }

  const record = row.inputDescriptor ?? requireRecord(row.input, `${row.id}.input`);
  const field = requireString(record["field"], `${row.id}.field`);
  const received =
    row.inputDescriptor === undefined
      ? requireNumber(record["value"], `${row.id}.value`)
      : materializeSpecialNumber(record, `${row.id}.inputDescriptor`);
  exactRefusal(
    domainOperations.makePlaybackSettings(playbackInput(field, received)),
    requireIssue(row),
    ["playback"],
  );
}

function groovePlaybackInput(value?: string): Readonly<{
  instrumentId: InstrumentId;
  masterVolume: number;
  reverbAmount: number;
  countInBars: number;
  grooveStyleId?: string;
}> {
  const base = {
    instrumentId: instrumentId(),
    masterVolume: 0.8,
    reverbAmount: 0.2,
    countInBars: 1,
  };
  return value === undefined ? base : { ...base, grooveStyleId: value };
}

function runGrooveStyleCase(row: FixtureCase): void {
  const expected = requireExpected(row);
  if (row.kind === "groove-style-storable-set") {
    for (const value of requireStringArray(row.input, `${row.id}.input`)) {
      const result = domainOperations.makePlaybackSettings(
        groovePlaybackInput(value),
      );
      if (!result.ok) throw new Error(`${row.id}: ${result.refusal.code}`);
      const storedGroove: string | undefined = result.value.grooveStyleId;
      expect(storedGroove).toBe(value);
    }
    // The load-bearing absence law: an omitted groove stays omitted, so the
    // default is never materialized into stored data.
    const absent = domainOperations.makePlaybackSettings(groovePlaybackInput());
    if (!absent.ok) throw new Error(`${row.id}: ${absent.refusal.code}`);
    expect("grooveStyleId" in absent.value).toBe(false);
    expect(requireBoolean(expected.allValid, `${row.id}.allValid`)).toBe(true);
    expect(
      requireBoolean(expected.storedExactly, `${row.id}.storedExactly`),
    ).toBe(true);
    expect(
      requireBoolean(
        expected.absentInputStaysAbsent,
        `${row.id}.absentInputStaysAbsent`,
      ),
    ).toBe(true);
    return;
  }
  if (row.kind === "groove-style-unknown") {
    const values = requireStringArray(row.input, `${row.id}.input`);
    const observations =
      expected.independentResults ??
      fixtureFailure(`${row.id}.independentResults`);
    expect(observations).toHaveLength(values.length);
    for (const [index, value] of values.entries()) {
      const observation =
        observations[index] ??
        fixtureFailure(`${row.id}.observation[${String(index)}]`);
      const result = domainOperations.makePlaybackSettings(
        groovePlaybackInput(value),
      );
      if (result.ok) throw new Error(`${row.id}: expected ${observation.code}`);
      const actualCode: string = result.refusal.code;
      expect(actualCode).toBe(observation.code);
      expect(["playback", ...result.refusal.path]).toEqual([
        "playback",
        "grooveStyleId",
      ]);
    }
    return;
  }
  const record = requireRecord(row.input, `${row.id}.input`);
  const value = requireString(record["value"], `${row.id}.value`);
  exactRefusal(
    domainOperations.makePlaybackSettings(groovePlaybackInput(value)),
    requireIssue(row),
    ["playback"],
  );
}

function runOrderingCase(row: FixtureCase): void {
  const expected = expectedIssues(row);
  const actual: Array<{
    code: string;
    path: Array<string | number>;
  }> = [...expected]
    .reverse()
    .map(asValidationIssue)
    .sort(domainOperations.compareValidationIssues)
    .map(
      ({ code, path }): { code: string; path: Array<string | number> } => ({
        code,
        path: [...path],
      }),
    );
  expect(actual).toEqual(
    expected.map(({ code, path }) => ({ code, path: [...path] })),
  );
}

function runDocumentRuntimeCase(row: FixtureCase): void {
  switch (row.kind) {
    case "instrument-id-set": {
      const inputs = requireStringArray(row.input, `${row.id}.input`);
      const declaredInstrumentIds: readonly string[] = INSTRUMENT_IDS;
      expect([...declaredInstrumentIds]).toEqual([...inputs]);
      for (const input of inputs) {
        const result = domainOperations.makeInstrumentId(input);
        if (!result.ok) throw new Error(`${row.id}: ${result.refusal.code}`);
        const actualInstrumentId: string = result.value;
        expect(actualInstrumentId).toBe(input);
      }
      expect([
        ...(requireExpected(row).preservedOrder ??
          fixtureFailure(`${row.id}.preservedOrder`)),
      ]).toEqual([...inputs]);
      return;
    }
    case "instrument-id-unsupported":
      exactRefusal(
        domainOperations.makeInstrumentId(
          requireString(row.input, `${row.id}.input`),
        ),
        requireIssue(row),
        ["playback"],
      );
      return;
    case "key-mode-set": {
      const tonic = makePitchClass(row.tonic, `${row.id}.tonic`);
      expect(tonic).toEqual({ step: "C", alter: 0 });
      const modes =
        row.inputModes ?? fixtureFailure(`${row.id}.inputModes`);
      const declaredKeyModes: readonly string[] = KEY_MODES;
      expect([...declaredKeyModes]).toEqual([...modes]);
      for (const mode of modes) {
        const result = domainOperations.makeKeyMode(mode);
        if (!result.ok) throw new Error(`${row.id}: ${result.refusal.code}`);
        const actualMode: string = result.value;
        expect(actualMode).toBe(mode);
      }
      expect(requireExpected(row).allValid).toBe(true);
      expect(requireExpected(row).inferredOrPersistedModes).toEqual([]);
      return;
    }
    case "invalid-key-mode": {
      const input = requireRecord(row.input, `${row.id}.input`);
      exactRefusal(
        domainOperations.makeKeyMode(
          requireString(input["mode"], `${row.id}.input.mode`),
        ),
        requireIssue(row),
      );
      return;
    }
    case "invalid-key-tonic": {
      const tonic = requireRecord(
        requireRecord(row.input, `${row.id}.input`)["tonic"],
        `${row.id}.input.tonic`,
      );
      exactRefusal(
        domainOperations.makeSpelledPitchClass({
          step: requireString(tonic["step"], `${row.id}.tonic.step`),
          alter: requireNumber(tonic["alter"], `${row.id}.tonic.alter`),
        }),
        requireIssue(row),
        ["tonic"],
      );
      return;
    }
    case "id-valid-syntax":
    case "id-length-exact":
    case "id-length-plus-one":
    case "id-empty":
    case "id-leading-punctuation":
    case "id-space":
    case "id-other-printable-punctuation":
    case "id-control":
    case "id-non-ascii":
    case "id-one-character-digit-leading-valid":
      runIdCase(row);
      return;
    case "tempo-minimum":
    case "tempo-maximum":
    case "tempo-below-minimum":
    case "tempo-above-maximum":
    case "tempo-noninteger":
    case "tempo-nan":
    case "tempo-positive-infinity":
    case "tempo-negative-infinity":
      runTempoCase(row);
      return;
    case "beats-per-bar-boundaries":
    case "beats-per-bar-out-of-range":
    case "beat-unit-set":
    case "beat-unit-invalid":
      runMeterCase(row);
      return;
    case "multi-error-deterministic-order":
    case "multi-error-numeric-path-order":
    case "multi-error-identical-path-code-order":
      runOrderingCase(row);
      return;
    case "playback-level-boundaries":
    case "playback-level-below-minimum":
    case "playback-level-above-maximum":
    case "playback-level-nan":
    case "playback-level-infinity":
    case "count-in-bars-set":
    case "count-in-bars-invalid":
      runPlaybackCase(row);
      return;
    case "groove-style-storable-set":
    case "groove-style-unknown":
    case "groove-style-explicit-default-noncanonical":
      runGrooveStyleCase(row);
      return;
    case "id-case-sensitive-distinct": {
      const inputs = requireStringArray(row.input, `${row.id}.input`);
      const values = inputs.map((wire) => {
        const result = domainOperations.parseStableId("document", wire);
        if (!result.ok) throw new Error(`${row.id}: ${result.refusal.code}`);
        return result.value;
      });
      expect(new Set(values).size === values.length).toBe(
        requireBoolean(requireExpected(row).distinct, `${row.id}.distinct`),
      );
      expect(requireExpected(row).normalizationApplied).toBe(false);
      return;
    }
    case "id-leading-trailing-whitespace-not-trimmed": {
      const inputs = requireStringArray(row.input, `${row.id}.input`);
      const observations =
        requireExpected(row).independentResults ??
        fixtureFailure(`${row.id}.independentResults`);
      for (const [index, wire] of inputs.entries()) {
        const observation =
          observations[index] ?? fixtureFailure(`${row.id}.observation[${String(index)}]`);
        const expectedIssue = {
          code: observation.code,
          path: observation.path ?? fixtureFailure(`${row.id}.path[${String(index)}]`),
        };
        exactRefusal(
          domainOperations.parseStableId("document", wire),
          expectedIssue,
        );
      }
      return;
    }
    default:
      return fixtureFailure(`${row.id}: unsupported document kind ${row.kind}`);
  }
}

function boundaryDescriptor(row: FixtureCase, key: string): number {
  const descriptor =
    row.inputDescriptor ?? fixtureFailure(`${row.id}.inputDescriptor`);
  return requireNumber(descriptor[key], `${row.id}.inputDescriptor.${key}`);
}

describe("F1 production conformance to independent reviewed value fixtures", () => {
  test("drives every pitch fixture row through the public production surface", async () => {
    const fixture = await pitchFixture;
    expect(fixture.schema).toBe("changes.fixtures.f1-pitch.v1");
    expect(fixture.cases).toHaveLength(28);
    for (const row of fixture.cases) {
      runPitchCase(row, fixture.frequencyAbsoluteToleranceHz);
    }
  });

  test("drives every F1-owned document-boundary row through public operations", async () => {
    const fixture = await documentFixture;
    const runtimeIds: readonly string[] = RUNTIME_DOCUMENT_CASE_IDS;
    const rows = fixture.cases.filter(({ id }) => runtimeIds.includes(id));
    expect(rows.map(({ id }) => id)).toEqual([...runtimeIds]);
    for (const row of rows) runDocumentRuntimeCase(row);
  });

  test("locks decoder-owned boundary rows to the same public F1 limits", async () => {
    const fixture = await documentFixture;
    const byId = new Map(fixture.cases.map((row) => [row.id, row]));
    const exactAndPlusOne = [
      ["F1-DOC-022", "F1-DOC-023", "utf8Bytes", MAX_UTF8_IMPORT_BYTES],
      ["F1-DOC-024", "F1-DOC-025", "jsonNestingDepth", MAX_JSON_NESTING_DEPTH],
      ["F1-DOC-026", "F1-DOC-027", "count", MAX_DOCUMENT_SECTIONS],
      ["F1-DOC-028", "F1-DOC-029", "count", MAX_SECTION_MEASURES],
      ["F1-DOC-030", "F1-DOC-031", "count", MAX_DOCUMENT_CHORD_EVENTS],
      ["F1-DOC-032", "F1-DOC-033", "count", MAX_SHORT_TEXT_CODE_POINTS],
      ["F1-DOC-034", "F1-DOC-035", "count", MAX_LONG_TEXT_CODE_POINTS],
      ["F1-DOC-036", "F1-DOC-037", "count", MAX_SHORT_TEXT_CODE_POINTS],
      ["F1-DOC-053", "F1-DOC-054", "count", MAX_SHORT_TEXT_CODE_POINTS],
      ["F1-DOC-055", "F1-DOC-056", "count", MAX_SHORT_TEXT_CODE_POINTS],
      ["F1-DOC-057", "F1-DOC-058", "count", MAX_LONG_TEXT_CODE_POINTS],
      ["F1-DOC-059", "F1-DOC-060", "count", MAX_LONG_TEXT_CODE_POINTS],
    ] as const;
    for (const [exactId, plusOneId, descriptorKey, maximum] of exactAndPlusOne) {
      const exact = byId.get(exactId) ?? fixtureFailure(exactId);
      const plusOne = byId.get(plusOneId) ?? fixtureFailure(plusOneId);
      expect(boundaryDescriptor(exact, descriptorKey)).toBe(maximum);
      expect(boundaryDescriptor(plusOne, descriptorKey)).toBe(maximum + 1);
    }
    const sectionBoundary =
      byId.get("F1-DOC-072") ?? fixtureFailure("F1-DOC-072");
    const invalidBoundary = requireString(
      sectionBoundary.input,
      "F1-DOC-072.input",
    );
    expect(
      SECTION_VOICE_LEADING_BOUNDARIES.some(
        (boundary) => boundary === invalidBoundary,
      ),
    ).toBe(false);
  });

  test("accounts explicitly for every document fixture row outside F1 runtime", async () => {
    const fixture = await documentFixture;
    expect(fixture.schema).toBe("changes.fixtures.f1-document-boundary.v1");
    expect(fixture.cases).toHaveLength(88);
    const runtimeIds: readonly string[] = RUNTIME_DOCUMENT_CASE_IDS;
    const classified = [
      ...runtimeIds,
      ...Object.keys(UNAVAILABLE_DOCUMENT_CASES),
    ].sort();
    expect(new Set(classified).size).toBe(classified.length);
    expect(classified).toEqual(fixture.cases.map(({ id }) => id).sort());
    expect(Object.values(UNAVAILABLE_DOCUMENT_CASES).every(Boolean)).toBe(true);
    expect(Object.keys(PARTIALLY_DRIVEN_CASES).sort()).toEqual([
      "F1-DOC-051",
      "F1-DOC-075",
      "F1-DOC-076",
      "F1-PITCH-026",
    ]);
  });
});
