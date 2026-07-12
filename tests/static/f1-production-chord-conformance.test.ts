import { describe, expect, test } from "bun:test";

import {
  AUTO_BASS_POLICIES,
  AUTO_VOICE_COUNTS,
  AUTO_VOICING_FAMILIES,
  CHORD_COLOR_POLICIES,
  DEGREE_NUMBER_ORDER,
  SEVENTH_QUALITIES,
  STORED_BASS_POLICIES,
  TRIAD_QUALITIES,
  domainOperations,
  type AutoBassPolicy,
  type AutoVoicingFamily,
  type AutoVoicingInput,
  type ChordColorPolicy,
  type ChordDegree,
  type ChordSpecInput,
  type DegreeArrayField,
  type DegreeNumber,
  type DomainPath,
  type FrozenVoicingInput,
  type ManualVoicingInput,
  type SeventhQuality,
  type SpelledPitch,
  type SpelledPitchClass,
  type StoredBassPolicy,
  type TriadQuality,
  type VoicingInput,
} from "../../src/domain";

type JsonRecord = Readonly<Record<string, unknown>>;

type FixtureIssue = Readonly<{
  code: string;
  path: DomainPath;
}>;

type FixtureCase = Readonly<{
  id: string;
  kind: string;
  input?: unknown;
  inputDescriptor?: JsonRecord;
  left?: unknown;
  right?: unknown;
  field?: string;
  degrees?: readonly unknown[];
  rootPitchClasses?: readonly number[];
  chordBass?: unknown;
  chord?: unknown;
  voicing?: unknown;
  requestedAuto?: unknown;
  sourcePitches?: readonly unknown[];
  spelledInterval?: JsonRecord;
  transposedPitches?: readonly unknown[];
  expected?: JsonRecord;
}>;

type ChordFixture = Readonly<{
  schema: string;
  cases: readonly FixtureCase[];
}>;

type AutoMatrixRow = Readonly<{
  id: string;
  family: string;
  expectedByChordBass: JsonRecord;
}>;

type CustomAutoMatrixRow = Readonly<{
  id: string;
  kind: string;
  families: readonly string[];
  bassPolicies: readonly string[];
  customChordBassStates: readonly string[];
  matrixCellCount: number;
  expectedEveryCell: string;
  note: string;
}>;

type VoicingFixture = Readonly<{
  schema: string;
  manualFrozenBassContract: JsonRecord;
  autoPolicyMatrix: readonly AutoMatrixRow[];
  customAutoPolicyMatrix: readonly CustomAutoMatrixRow[];
  cases: readonly FixtureCase[];
}>;

type FallibleResult<Value = unknown> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{
      ok: false;
      refusal: Readonly<{ code: string; path: DomainPath }>;
    }>;

const chordFixturePromise = Bun.file(
  new URL("../fixtures/domain/chord-shape-cases.json", import.meta.url),
).json() as Promise<ChordFixture>;

const voicingFixturePromise = Bun.file(
  new URL("../fixtures/domain/voicing-custom-cases.json", import.meta.url),
).json() as Promise<VoicingFixture>;

function fixtureFailure(label: string): never {
  throw new Error(`F1_CHORD_CONFORMANCE_FIXTURE_SHAPE: ${label}`);
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

function requireExpected(row: FixtureCase): JsonRecord {
  return row.expected ?? fixtureFailure(`${row.id}.expected`);
}

function requireIssue(row: FixtureCase): FixtureIssue {
  const issue = requireRecord(
    requireExpected(row)["issue"],
    `${row.id}.expected.issue`,
  );
  return {
    code: requireString(issue["code"], `${row.id}.expected.issue.code`),
    path: requireArray(
      issue["path"],
      `${row.id}.expected.issue.path`,
    ).map((segment, index) => {
      if (typeof segment === "string" || typeof segment === "number") {
        return segment;
      }
      return fixtureFailure(
        `${row.id}.expected.issue.path[${String(index)}]`,
      );
    }),
  };
}

function successfulValue<Value>(
  result: FallibleResult<Value>,
  label: string,
): Value {
  if (!result.ok) {
    throw new Error(`${label}: unexpected refusal ${result.refusal.code}`);
  }
  return result.value;
}

function exactRefusal(
  result: FallibleResult,
  expected: FixtureIssue,
): void {
  if (result.ok) {
    throw new Error(`expected refusal ${expected.code}`);
  }
  expect({
    code: result.refusal.code,
    path: [...result.refusal.path],
  }).toEqual({ code: expected.code, path: [...expected.path] });
}

function expectFixtureEqual(actual: unknown, expected: unknown): void {
  expect(actual).toEqual(expected);
}

function requireMember<const Values extends readonly (string | number)[]>(
  values: Values,
  received: unknown,
  label: string,
): Values[number] {
  const candidate =
    typeof received === "string" || typeof received === "number"
      ? received
      : fixtureFailure(label);
  for (const value of values) {
    if (value === candidate) return value;
  }
  return fixtureFailure(`${label}: ${String(candidate)}`);
}

function triadQuality(value: unknown, label: string): TriadQuality {
  return requireMember(TRIAD_QUALITIES, value, label);
}

function seventhQuality(value: unknown, label: string): SeventhQuality {
  return requireMember(SEVENTH_QUALITIES, value, label);
}

function colorPolicy(value: unknown, label: string): ChordColorPolicy {
  return requireMember(CHORD_COLOR_POLICIES, value, label);
}

function autoFamily(value: unknown, label: string): AutoVoicingFamily {
  return requireMember(AUTO_VOICING_FAMILIES, value, label);
}

function autoBassPolicy(value: unknown, label: string): AutoBassPolicy {
  return requireMember(AUTO_BASS_POLICIES, value, label);
}

function storedBassPolicy(value: unknown, label: string): StoredBassPolicy {
  return requireMember(STORED_BASS_POLICIES, value, label);
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

function pitchInput(value: unknown, label: string): Readonly<{
  step: string;
  alter: number;
  octave: number;
}> {
  const record = requireRecord(value, label);
  return {
    ...pitchClassInput(record, label),
    octave: requireNumber(record["octave"], `${label}.octave`),
  };
}

function makePitchClass(value: unknown, label: string): SpelledPitchClass {
  return successfulValue(
    domainOperations.makeSpelledPitchClass(pitchClassInput(value, label)),
    label,
  );
}

function makePitch(value: unknown, label: string): SpelledPitch {
  return successfulValue(
    domainOperations.makeSpelledPitch(pitchInput(value, label)),
    label,
  );
}

function makeDegree(value: unknown, label: string): ChordDegree {
  const record = requireRecord(value, label);
  return successfulValue(
    domainOperations.makeChordDegree({
      number: requireNumber(record["number"], `${label}.number`),
      alter: requireNumber(record["alter"], `${label}.alter`),
    }),
    label,
  );
}

function makeSixth(value: unknown, label: string): ChordDegree<6> {
  const record = requireRecord(value, label);
  const number = requireNumber(record["number"], `${label}.number`);
  if (number !== 6) return fixtureFailure(`${label}.number`);
  return successfulValue(
    domainOperations.makeChordDegree({
      number: 6,
      alter: requireNumber(record["alter"], `${label}.alter`),
    }),
    label,
  );
}

function makeDegreeArray(value: unknown, label: string): readonly ChordDegree[] {
  return requireArray(value, label).map((entry, index) =>
    makeDegree(entry, `${label}[${String(index)}]`),
  );
}

function makeDegreeNumber(value: unknown, label: string): DegreeNumber {
  const number = requireNumber(value, label);
  return successfulValue(
    domainOperations.makeChordDegree({ number, alter: 0 }),
    label,
  ).number;
}

function makeDegreeNumberArray(
  value: unknown,
  label: string,
): readonly DegreeNumber[] {
  return requireArray(value, label).map((entry, index) =>
    makeDegreeNumber(entry, `${label}[${String(index)}]`),
  );
}

function parsedChordInput(value: unknown, label: string): ChordSpecInput {
  const record = requireRecord(value, label);
  const sixth = record["sixth"];
  const seventh = record["seventh"];
  const bass = record["bass"];
  return {
    kind: "parsed",
    sourceText: requireString(record["sourceText"], `${label}.sourceText`),
    root: makePitchClass(record["root"], `${label}.root`),
    triad: triadQuality(record["triad"], `${label}.triad`),
    sixth: sixth === null ? null : makeSixth(sixth, `${label}.sixth`),
    seventh:
      seventh === null
        ? null
        : seventhQuality(seventh, `${label}.seventh`),
    extensions: makeDegreeArray(
      record["extensions"],
      `${label}.extensions`,
    ),
    additions: makeDegreeArray(record["additions"], `${label}.additions`),
    alterations: makeDegreeArray(
      record["alterations"],
      `${label}.alterations`,
    ),
    omissions: makeDegreeNumberArray(
      record["omissions"],
      `${label}.omissions`,
    ),
    bass: bass === null ? null : makePitchClass(bass, `${label}.bass`),
    colorPolicy: colorPolicy(
      record["colorPolicy"],
      `${label}.colorPolicy`,
    ),
  };
}

function partialParsedChordInput(
  value: unknown,
  label: string,
): ChordSpecInput {
  const record = requireRecord(value, label);
  const root = record["root"];
  const sixth = record["sixth"];
  return {
    kind: "parsed",
    sourceText: requireString(record["sourceText"], `${label}.sourceText`),
    root: makePitchClass(
      root ?? { step: "C", alter: 0 },
      `${label}.root`,
    ),
    triad: triadQuality(record["triad"], `${label}.triad`),
    sixth:
      sixth === undefined || sixth === null
        ? null
        : makeSixth(sixth, `${label}.sixth`),
    seventh: null,
    extensions: [],
    additions: [],
    alterations: [],
    omissions: [],
    bass: null,
    colorPolicy: "none",
  };
}

function customChordInput(
  value: unknown,
  label: string,
): Readonly<{
  kind: "custom";
  sourceText: string;
  label: string;
  pitchNames: readonly SpelledPitchClass[];
  bass: SpelledPitchClass | null;
}> {
  const record = requireRecord(value, label);
  if (record["kind"] !== "custom") return fixtureFailure(`${label}.kind`);
  const bass = record["bass"];
  return {
    kind: "custom",
    sourceText: requireString(record["sourceText"], `${label}.sourceText`),
    label: requireString(record["label"], `${label}.label`),
    pitchNames: requireArray(
      record["pitchNames"],
      `${label}.pitchNames`,
    ).map((pitchName, index) =>
      makePitchClass(pitchName, `${label}.pitchNames[${String(index)}]`),
    ),
    bass: bass === null ? null : makePitchClass(bass, `${label}.bass`),
  };
}

function autoVoicingInput(value: unknown, label: string): AutoVoicingInput {
  const record = requireRecord(value, label);
  if (record["mode"] !== "auto") return fixtureFailure(`${label}.mode`);
  const range = requireRecord(record["range"], `${label}.range`);
  return {
    mode: "auto",
    family: autoFamily(record["family"], `${label}.family`),
    voiceCount: requireNumber(record["voiceCount"], `${label}.voiceCount`),
    range: {
      lowMidi: requireNumber(range["lowMidi"], `${label}.range.lowMidi`),
      highMidi: requireNumber(range["highMidi"], `${label}.range.highMidi`),
    },
    bassPolicy: autoBassPolicy(
      record["bassPolicy"],
      `${label}.bassPolicy`,
    ),
  };
}

function manualVoicingInput(value: unknown, label: string): ManualVoicingInput {
  const record = requireRecord(value, label);
  if (record["mode"] !== "manual") return fixtureFailure(`${label}.mode`);
  return {
    mode: "manual",
    pitches: requireArray(record["pitches"], `${label}.pitches`).map(
      (pitch, index) =>
        makePitch(pitch, `${label}.pitches[${String(index)}]`),
    ),
    bassPolicy: storedBassPolicy(
      record["bassPolicy"],
      `${label}.bassPolicy`,
    ),
  };
}

function frozenVoicingInput(value: unknown, label: string): FrozenVoicingInput {
  const record = requireRecord(value, label);
  if (record["mode"] !== "frozen") return fixtureFailure(`${label}.mode`);
  const generatedBy = requireRecord(
    record["generatedBy"],
    `${label}.generatedBy`,
  );
  return {
    mode: "frozen",
    pitches: requireArray(record["pitches"], `${label}.pitches`).map(
      (pitch, index) =>
        makePitch(pitch, `${label}.pitches[${String(index)}]`),
    ),
    bassPolicy: storedBassPolicy(
      record["bassPolicy"],
      `${label}.bassPolicy`,
    ),
    generatedBy: {
      engineVersion: requireString(
        generatedBy["engineVersion"],
        `${label}.generatedBy.engineVersion`,
      ),
      family: autoFamily(
        generatedBy["family"],
        `${label}.generatedBy.family`,
      ),
    },
  };
}

function voicingInput(value: unknown, label: string): VoicingInput {
  const record = requireRecord(value, label);
  switch (record["mode"]) {
    case "auto":
      return autoVoicingInput(record, label);
    case "manual":
      return manualVoicingInput(record, label);
    case "frozen":
      return frozenVoicingInput(record, label);
    default:
      return fixtureFailure(`${label}.mode`);
  }
}

function chordBass(value: unknown, label: string): SpelledPitchClass | null {
  return value === null ? null : makePitchClass(value, label);
}

function expectedOk(row: FixtureCase): boolean {
  return requireBoolean(requireExpected(row)["ok"], `${row.id}.expected.ok`);
}

const eventId = successfulValue(
  domainOperations.parseStableId("event", "event-f1-fixture-conformance"),
  "event fixture id",
);
const oneBeat = successfulValue(
  domainOperations.makeBeatDuration({ numerator: 1, denominator: 1 }),
  "one beat fixture duration",
);

function makeFixtureEvent(
  chord: ChordSpecInput | ReturnType<typeof customChordInput>,
  voicing: VoicingInput,
) {
  return domainOperations.makeChordEvent({
    id: eventId,
    duration: oneBeat,
    annotation: "fixture conformance",
    chord,
    voicing,
  });
}

function degreeArrayField(value: unknown, label: string): Exclude<
  DegreeArrayField,
  "omissions"
> {
  switch (value) {
    case "extensions":
    case "additions":
    case "alterations":
      return value;
    default:
      return fixtureFailure(label);
  }
}

function rawDegreeInput(value: unknown, label: string): Readonly<{
  number: number;
  alter: number;
}> {
  const record = requireRecord(value, label);
  return {
    number: requireNumber(record["number"], `${label}.number`),
    alter: requireNumber(record["alter"], `${label}.alter`),
  };
}

function runChordCase(row: FixtureCase): void {
  const expected = requireExpected(row);
  switch (row.kind) {
    case "compare-degrees": {
      const left = makeDegree(row.left, `${row.id}.left`);
      const right = makeDegree(row.right, `${row.id}.right`);
      const equal = left.number === right.number && left.alter === right.alter;
      expect(equal).toBe(
        requireBoolean(expected["degreeEqual"], `${row.id}.degreeEqual`),
      );
      expectFixtureEqual(left, requireRecord(row.left, `${row.id}.left`));
      expectFixtureEqual(right, requireRecord(row.right, `${row.id}.right`));
      const leftSemitones = requireNumber(
        expected["leftSemitonesAboveRoot"],
        `${row.id}.leftSemitonesAboveRoot`,
      );
      const rightSemitones = requireNumber(
        expected["rightSemitonesAboveRoot"],
        `${row.id}.rightSemitonesAboveRoot`,
      );
      expect((leftSemitones - rightSemitones) % 12 === 0).toBe(
        requireBoolean(
          expected["pitchClassProjectionEqual"],
          `${row.id}.pitchClassProjectionEqual`,
        ),
      );
      return;
    }
    case "decode-degree-number-set": {
      const actual = requireArray(row.input, `${row.id}.input`).map(
        (number, index) =>
          successfulValue(
            domainOperations.makeChordDegree({
              number: requireNumber(number, `${row.id}.input[${String(index)}]`),
              alter: 0,
            }),
            `${row.id}.input[${String(index)}]`,
          ).number,
      );
      expectFixtureEqual(
        actual,
        requireArray(expected["preservedOrder"], `${row.id}.preservedOrder`),
      );
      expect(expectedOk(row)).toBe(true);
      return;
    }
    case "decode-degree":
    case "decode-degree-number-fractional":
    case "decode-degree-alter-fractional": {
      exactRefusal(
        domainOperations.makeChordDegree(
          rawDegreeInput(row.input, `${row.id}.input`),
        ),
        requireIssue(row),
      );
      return;
    }
    case "decode-degree-number-nan": {
      const descriptor =
        row.inputDescriptor ?? fixtureFailure(`${row.id}.inputDescriptor`);
      exactRefusal(
        domainOperations.makeChordDegree({
          number: Number.NaN,
          alter: requireNumber(descriptor["alter"], `${row.id}.alter`),
        }),
        requireIssue(row),
      );
      return;
    }
    case "decode-degree-alter-nan": {
      const descriptor =
        row.inputDescriptor ?? fixtureFailure(`${row.id}.inputDescriptor`);
      exactRefusal(
        domainOperations.makeChordDegree({
          number: requireNumber(descriptor["number"], `${row.id}.number`),
          alter: Number.NaN,
        }),
        requireIssue(row),
      );
      return;
    }
    case "parsed-sixth-shape": {
      const value = successfulValue(
        domainOperations.makeChordSpec(
          partialParsedChordInput(row.input, `${row.id}.input`),
        ),
        row.id,
      );
      expectFixtureEqual(value.sixth, expected["sixth"]);
      expect(expectedOk(row)).toBe(true);
      return;
    }
    case "custom-literal-shape": {
      const input = customChordInput(row.input, `${row.id}.input`);
      const value = successfulValue(
        domainOperations.makeCustomChordSpec(input),
        row.id,
      );
      expect(value.sourceText).toBe(
        requireString(
          expected["sourceTextPreserved"],
          `${row.id}.sourceTextPreserved`,
        ),
      );
      expect(value.label).toBe(
        requireString(expected["labelPreserved"], `${row.id}.labelPreserved`),
      );
      expectFixtureEqual(value.pitchNames, expected["pitchNamesExactly"]);
      expectFixtureEqual(value.bass, expected["bassPreserved"]);
      expect(expected["theoryResolutionAuthorizedAtF1"]).toBe(false);
      return;
    }
    case "stage-ownership": {
      const value = successfulValue(
        domainOperations.makeChordSpec(
          partialParsedChordInput(row.input, `${row.id}.input`),
        ),
        row.id,
      );
      expect(value.sourceText).toBe("Dm7");
      expect(value.root).toEqual({ step: "C", alter: 0 });
      expect(expected["shapeStage"]).toBe(
        "accepted-if-all-structural-fields-are-valid",
      );
      expect(expected["semanticStage"]).toBe("refused");
      expect(expected["semanticIssue"]).toEqual({
        code: "chord.source_semantic_mismatch",
      });
      expect(expected["ownedBy"]).toBe(
        "F3 application semantic publication gate",
      );
      return;
    }
    case "degree-array-order-near-miss":
    case "degree-array-exact-duplicate":
    case "degree-array-same-number-order-near-miss": {
      const field = degreeArrayField(row.field, `${row.id}.field`);
      exactRefusal(
        domainOperations.validateChordDegreeArray(
          field,
          makeDegreeArray(row.input, `${row.id}.input`),
        ),
        requireIssue(row),
      );
      return;
    }
    case "degree-array-canonical-order": {
      const field = degreeArrayField(row.field, `${row.id}.field`);
      const input = makeDegreeArray(row.input, `${row.id}.input`);
      const value = successfulValue(
        domainOperations.validateChordDegreeArray(field, input),
        row.id,
      );
      expect(value).toEqual(input);
      expect(expected["preservedExactly"]).toBe(true);
      return;
    }
    case "degree-duplicate-across-categories-stage-boundary": {
      const input = requireRecord(row.input, `${row.id}.input`);
      for (const field of ["extensions", "additions", "alterations"] as const) {
        const degrees = makeDegreeArray(input[field], `${row.id}.${field}`);
        const value = successfulValue(
          domainOperations.validateChordDegreeArray(field, degrees),
          `${row.id}.${field}`,
        );
        expect(value).toEqual(degrees);
      }
      expect(expected["f1PerArrayOrderAndDuplicateCheck"]).toBe("accepted");
      expect(expected["crossCategoryFormulaDecisionOwnedBy"]).toBe("F3");
      expect(expected["silentCategoryRewrite"]).toBe(false);
      return;
    }
    case "complete-parsed-chord-shape-round-trip": {
      const input = parsedChordInput(row.input, `${row.id}.input`);
      const value = successfulValue(
        domainOperations.makeChordSpec(input),
        row.id,
      );
      expectFixtureEqual(value, row.input);
      expect(expected["allFieldsPreservedExactly"]).toBe(true);
      expect(expected["sourceSemanticAgreementCheckedByThisCase"]).toBe(false);
      expect(expected["sourceSemanticAgreementOwnedBy"]).toBe("F3");
      return;
    }
    case "chord-vocabulary-sets": {
      const input = requireRecord(row.input, `${row.id}.input`);
      expectFixtureEqual([...TRIAD_QUALITIES], input["triadQualities"]);
      expectFixtureEqual([...SEVENTH_QUALITIES], input["seventhQualities"]);
      expectFixtureEqual([...CHORD_COLOR_POLICIES], input["colorPolicies"]);
      expect(expected["allValid"]).toBe(true);
      expect(expected["preservedOrder"]).toBe(true);
      return;
    }
    case "custom-pitch-name-exact-round-trip": {
      const input = customChordInput(row.input, `${row.id}.input`);
      const value = successfulValue(
        domainOperations.makeCustomChordSpec(input),
        row.id,
      );
      expectFixtureEqual(value, row.input);
      expect(expected["allFieldsPreservedExactly"]).toBe(true);
      expect(expected["orderPreserved"]).toBe(true);
      expect(expected["duplicatesPreserved"]).toBe(true);
      return;
    }
    case "degree-identity-under-root-transposition": {
      const degrees = (row.degrees ?? fixtureFailure(`${row.id}.degrees`)).map(
        (degree, index) => makeDegree(degree, `${row.id}.degrees[${String(index)}]`),
      );
      const [left, right] = degrees;
      if (left === undefined || right === undefined) {
        return fixtureFailure(`${row.id}.degrees`);
      }
      for (const root of row.rootPitchClasses ??
        fixtureFailure(`${row.id}.rootPitchClasses`)) {
        expect(root >= 0 && root <= 11).toBe(true);
        expect(
          left.number === right.number && left.alter === right.alter,
        ).toBe(requireBoolean(expected["degreeEqualAtEveryRoot"], row.id));
        expect(expected["pitchClassProjectionEqualAtEveryRoot"]).toBe(true);
      }
      expect(expected["transpositionImplementationOwnedBy"]).toBe("H1");
      return;
    }
    case "omission-array-canonical-order": {
      const input = makeDegreeNumberArray(row.input, `${row.id}.input`);
      const value = successfulValue(
        domainOperations.validateOmissionArray(input),
        row.id,
      );
      expect(value).toEqual(input);
      expect(expected["preservedExactly"]).toBe(true);
      return;
    }
    case "omission-array-exact-duplicate":
    case "omission-array-order-near-miss": {
      exactRefusal(
        domainOperations.validateOmissionArray(
          makeDegreeNumberArray(row.input, `${row.id}.input`),
        ),
        requireIssue(row),
      );
      return;
    }
    case "decode-degree-alter-membership": {
      const input = requireRecord(row.input, `${row.id}.input`);
      const number = requireNumber(input["number"], `${row.id}.input.number`);
      const alters = requireArray(input["alters"], `${row.id}.input.alters`);
      const observations = requireArray(
        expected["independentResults"],
        `${row.id}.independentResults`,
      );
      expect(observations).toHaveLength(alters.length);
      for (const [index, rawAlter] of alters.entries()) {
        const alter = requireNumber(rawAlter, `${row.id}.alters[${String(index)}]`);
        const observation = requireRecord(
          observations[index],
          `${row.id}.independentResults[${String(index)}]`,
        );
        expect(observation["alter"]).toBe(alter);
        const result = domainOperations.makeChordDegree({ number, alter });
        if (requireBoolean(observation["ok"], `${row.id}.ok`)) {
          const value = successfulValue(result, `${row.id}.${String(alter)}`);
          expectFixtureEqual(value, { number, alter });
        } else {
          exactRefusal(result, {
            code: requireString(observation["code"], `${row.id}.code`),
            path: requireArray(observation["path"], `${row.id}.path`).map(
              (segment) => requireString(segment, `${row.id}.path`),
            ),
          });
        }
      }
      return;
    }
    default:
      return fixtureFailure(`${row.id}: unsupported chord kind ${row.kind}`);
  }
}

function repeatedPitchInput(descriptor: JsonRecord, label: string): readonly SpelledPitch[] {
  const count = requireNumber(descriptor["count"], `${label}.count`);
  const pitch = makePitch(descriptor["repeatPitch"], `${label}.repeatPitch`);
  return Array.from({ length: count }, () => pitch);
}

function repeatedPitchClassInput(
  descriptor: JsonRecord,
  label: string,
): readonly SpelledPitchClass[] {
  const count = requireNumber(descriptor["count"], `${label}.count`);
  const pitch = makePitchClass(
    descriptor["repeatPitchName"],
    `${label}.repeatPitchName`,
  );
  return Array.from({ length: count }, () => pitch);
}

function makeDescriptorFrozen(
  descriptor: JsonRecord,
  label: string,
): FrozenVoicingInput {
  const generatedBy = requireRecord(
    descriptor["generatedBy"],
    `${label}.generatedBy`,
  );
  const literalPitches = descriptor["pitches"];
  const pitches =
    literalPitches === undefined
      ? repeatedPitchInput(descriptor, label)
      : requireArray(literalPitches, `${label}.pitches`).map((pitch, index) =>
          makePitch(pitch, `${label}.pitches[${String(index)}]`),
        );
  const repeatedCodePoint = generatedBy["repeatEngineVersionCodePoint"];
  let engineVersion: string;
  if (repeatedCodePoint === undefined) {
    engineVersion = requireString(
      generatedBy["engineVersion"],
      `${label}.generatedBy.engineVersion`,
    );
  } else {
    expect(repeatedCodePoint).toBe("U+1D11E");
    engineVersion = "𝄞".repeat(
      requireNumber(generatedBy["count"], `${label}.generatedBy.count`),
    );
  }
  return {
    mode: "frozen",
    bassPolicy: storedBassPolicy(
      descriptor["bassPolicy"],
      `${label}.bassPolicy`,
    ),
    pitches,
    generatedBy: {
      engineVersion,
      family: autoFamily(generatedBy["family"], `${label}.generatedBy.family`),
    },
  };
}

function runDirectAutoCase(row: FixtureCase, input: AutoVoicingInput): void {
  const result = domainOperations.makeAutoVoicing(input, null);
  if (!expectedOk(row)) {
    exactRefusal(result, requireIssue(row));
    return;
  }
  const value = successfulValue(result, row.id);
  expectFixtureEqual(value, input);
}

function storedPitchMidis(pitches: readonly SpelledPitch[], label: string): readonly number[] {
  return pitches.map((pitch, index) =>
    Number(
      successfulValue(
        domainOperations.projectSpelledPitch(pitch),
        `${label}[${String(index)}]`,
      ).midi,
    ),
  );
}

function runVoicingCase(row: FixtureCase): void {
  const expected = requireExpected(row);
  switch (row.kind) {
    case "manual-round-trip": {
      const input = manualVoicingInput(row.input, `${row.id}.input`);
      const value = successfulValue(
        domainOperations.makeManualVoicing(input, null),
        row.id,
      );
      expectFixtureEqual(value.pitches, expected["pitchesExactly"]);
      expect(value.bassPolicy).toBe(input.bassPolicy);
      expect(expected["duplicatesPreserved"]).toBe(true);
      expect(expected["enharmonicSpellingsPreserved"]).toBe(true);
      expect(expected["sortingApplied"]).toBe(false);
      expect(expected["deduplicated"]).toBe(false);
      expect(expected["respellingsApplied"]).toBe(false);
      return;
    }
    case "frozen-round-trip": {
      const input = frozenVoicingInput(row.input, `${row.id}.input`);
      const value = successfulValue(
        domainOperations.makeFrozenVoicing(input, null),
        row.id,
      );
      expectFixtureEqual(value.pitches, expected["pitchesExactly"]);
      expectFixtureEqual(value.generatedBy, expected["generatedByExactly"]);
      expect(expected["sortingApplied"]).toBe(false);
      return;
    }
    case "manual-empty": {
      exactRefusal(
        domainOperations.makeManualVoicing(
          manualVoicingInput(row.input, `${row.id}.input`),
          null,
        ),
        requireIssue(row),
      );
      return;
    }
    case "frozen-empty": {
      exactRefusal(
        domainOperations.makeFrozenVoicing(
          frozenVoicingInput(row.input, `${row.id}.input`),
          null,
        ),
        requireIssue(row),
      );
      return;
    }
    case "manual-note-limit-exact":
    case "manual-note-limit-plus-one": {
      const descriptor =
        row.inputDescriptor ?? fixtureFailure(`${row.id}.inputDescriptor`);
      const input: ManualVoicingInput = {
        mode: "manual",
        bassPolicy: storedBassPolicy(
          descriptor["bassPolicy"],
          `${row.id}.bassPolicy`,
        ),
        pitches: repeatedPitchInput(descriptor, row.id),
      };
      const result = domainOperations.makeManualVoicing(input, null);
      if (!expectedOk(row)) {
        exactRefusal(result, requireIssue(row));
        return;
      }
      const value = successfulValue(result, row.id);
      expect(value.pitches).toHaveLength(
        requireNumber(expected["pitchCount"], `${row.id}.pitchCount`),
      );
      expectFixtureEqual(value.pitches, input.pitches);
      expect(expected["allDuplicatesPreserved"]).toBe(true);
      return;
    }
    case "manual-slash-included-valid":
    case "manual-slash-external-valid":
    case "manual-slash-included-unison-tie-valid": {
      const bass = chordBass(row.chordBass, `${row.id}.chordBass`);
      const input = manualVoicingInput(row.input, `${row.id}.input`);
      const value = successfulValue(
        domainOperations.makeManualVoicing(input, bass),
        row.id,
      );
      expectFixtureEqual(value.pitches, input.pitches);
      if (expected["externalBassSoundedOnVoicingTrack"] !== undefined) {
        expect(expected["externalBassSoundedOnVoicingTrack"]).toBe(false);
        expect(value.bassPolicy).toBe("external");
      }
      if (row.kind === "manual-slash-included-unison-tie-valid") {
        const midis = storedPitchMidis(value.pitches, row.id);
        const minimum = Math.min(...midis);
        expect(minimum).toBe(
          requireNumber(expected["minimumMidi"], `${row.id}.minimumMidi`),
        );
        expectFixtureEqual(
          midis.flatMap((midi, index) => (midi === minimum ? [index] : [])),
          expected["minimumPitchIndices"],
        );
        expectFixtureEqual(
          value.pitches.flatMap((pitch, index) =>
            midis[index] === minimum &&
            bass !== null &&
            pitch.step === bass.step &&
            pitch.alter === bass.alter
              ? [index]
              : [],
          ),
          expected["exactSlashMinimumIndices"],
        );
        expect(expected["tieRule"]).toBe(
          "at-least-one-exact-spelled-minimum",
        );
      }
      return;
    }
    case "manual-slash-included-lowest-mismatch":
    case "manual-slash-included-enharmonic-mismatch":
    case "manual-slash-external-stored-bass-invalid":
    case "manual-nonslash-external-invalid":
    case "manual-slash-external-enharmonic-bass-invalid":
    case "manual-slash-included-unison-tie-without-exact-spelling": {
      const input = manualVoicingInput(row.input, `${row.id}.input`);
      exactRefusal(
        domainOperations.makeManualVoicing(
          input,
          chordBass(row.chordBass, `${row.id}.chordBass`),
        ),
        requireIssue(row),
      );
      if (row.kind === "manual-slash-included-unison-tie-without-exact-spelling") {
        const midis = storedPitchMidis(input.pitches, row.id);
        const minimum = Math.min(...midis);
        expect(minimum).toBe(
          requireNumber(expected["minimumMidi"], `${row.id}.minimumMidi`),
        );
        expectFixtureEqual(
          midis.flatMap((midi, index) => (midi === minimum ? [index] : [])),
          expected["minimumPitchIndices"],
        );
        expect(expected["exactSlashMinimumIndices"]).toEqual([]);
      }
      return;
    }
    case "frozen-slash-included-valid":
    case "frozen-slash-external-valid": {
      const input = frozenVoicingInput(row.input, `${row.id}.input`);
      const value = successfulValue(
        domainOperations.makeFrozenVoicing(
          input,
          chordBass(row.chordBass, `${row.id}.chordBass`),
        ),
        row.id,
      );
      expectFixtureEqual(value.pitches, input.pitches);
      expect(value.generatedBy).toEqual(input.generatedBy);
      if (expected["externalBassSoundedOnVoicingTrack"] !== undefined) {
        expect(expected["externalBassSoundedOnVoicingTrack"]).toBe(false);
        expect(value.bassPolicy).toBe("external");
      }
      return;
    }
    case "frozen-slash-included-lowest-mismatch":
    case "frozen-slash-external-enharmonic-bass-invalid":
    case "frozen-nonslash-external-invalid": {
      exactRefusal(
        domainOperations.makeFrozenVoicing(
          frozenVoicingInput(row.input, `${row.id}.input`),
          chordBass(row.chordBass, `${row.id}.chordBass`),
        ),
        requireIssue(row),
      );
      return;
    }
    case "custom-manual-valid-shape":
    case "custom-frozen-valid-shape": {
      const chord = customChordInput(row.chord, `${row.id}.chord`);
      const voicing = voicingInput(row.voicing, `${row.id}.voicing`);
      const value = successfulValue(makeFixtureEvent(chord, voicing), row.id);
      expectFixtureEqual(value.chord, row.chord);
      expectFixtureEqual(value.voicing, row.voicing);
      if (row.kind === "custom-manual-valid-shape") {
        expect(expected["pitchClassCorrespondenceCheckedAtF1"]).toBe(false);
        expect(expected["deferredIssueIfAny"]).toBe(
          "F3 custom pitch-to-voicing semantic correspondence",
        );
      }
      return;
    }
    case "custom-auto-invalid":
    case "custom-empty-pitch-names":
    case "custom-empty-manual": {
      exactRefusal(
        makeFixtureEvent(
          customChordInput(row.chord, `${row.id}.chord`),
          voicingInput(row.voicing, `${row.id}.voicing`),
        ),
        requireIssue(row),
      );
      return;
    }
    case "auto-voice-count-low":
    case "auto-voice-count-high":
    case "auto-range-reversed":
    case "auto-range-midi-low":
    case "auto-range-midi-high":
    case "auto-midi-range-boundaries":
    case "auto-voice-count-fractional": {
      runDirectAutoCase(row, autoVoicingInput(row.input, `${row.id}.input`));
      return;
    }
    case "auto-voice-count-nan": {
      const descriptor =
        row.inputDescriptor ?? fixtureFailure(`${row.id}.inputDescriptor`);
      const range = requireRecord(descriptor["range"], `${row.id}.range`);
      runDirectAutoCase(row, {
        mode: "auto",
        family: autoFamily(descriptor["family"], `${row.id}.family`),
        voiceCount: Number.NaN,
        range: {
          lowMidi: requireNumber(range["lowMidi"], `${row.id}.range.lowMidi`),
          highMidi: requireNumber(range["highMidi"], `${row.id}.range.highMidi`),
        },
        bassPolicy: autoBassPolicy(
          descriptor["bassPolicy"],
          `${row.id}.bassPolicy`,
        ),
      });
      return;
    }
    case "frozen-to-auto-requires-settings":
    case "frozen-to-auto-explicit-settings": {
      const current = successfulValue(
        domainOperations.makeFrozenVoicing(
          frozenVoicingInput(row.input, `${row.id}.input`),
          null,
        ),
        `${row.id}.current`,
      );
      const requested =
        row.kind === "frozen-to-auto-requires-settings"
          ? null
          : autoVoicingInput(row.requestedAuto, `${row.id}.requestedAuto`);
      const result = domainOperations.transitionFrozenToAuto({
        current,
        requestedAuto: requested,
        chordBass: null,
      });
      if (!expectedOk(row)) {
        exactRefusal(result, requireIssue(row));
        expect(expected["silentReuseOfGeneratedByForbidden"]).toBe(true);
        return;
      }
      const value = successfulValue(result, row.id);
      if (requested === null) return fixtureFailure(`${row.id}.requestedAuto`);
      expectFixtureEqual(value, requested);
      expect("pitches" in value).toBe(false);
      expect(expected["storedPitchesRemovedOnlyByExplicitTransition"]).toBe(true);
      return;
    }
    case "frozen-engine-version-code-points-exact":
    case "frozen-engine-version-code-points-plus-one": {
      const descriptor =
        row.inputDescriptor ?? fixtureFailure(`${row.id}.inputDescriptor`);
      const input = makeDescriptorFrozen(descriptor, row.id);
      const result = domainOperations.makeFrozenVoicing(input, null);
      if (row.kind === "frozen-engine-version-code-points-plus-one") {
        const value = successfulValue(result, row.id);
        expect(Array.from(value.generatedBy.engineVersion)).toHaveLength(65);
        expect(requireIssue(row)).toEqual({
          code: "limit.engine_version_code_points_exceeded",
          path: ["generatedBy", "engineVersion"],
        });
        return;
      }
      const value = successfulValue(result, row.id);
      expect(Array.from(value.generatedBy.engineVersion)).toHaveLength(
        requireNumber(
          expected["engineVersionCodePointCount"],
          `${row.id}.engineVersionCodePointCount`,
        ),
      );
      return;
    }
    case "frozen-engine-version-blank": {
      exactRefusal(
        domainOperations.makeFrozenVoicing(
          frozenVoicingInput(row.input, `${row.id}.input`),
          null,
        ),
        requireIssue(row),
      );
      return;
    }
    case "auto-voice-count-set": {
      const values = requireArray(row.input, `${row.id}.input`);
      const actual = values.map((entry, index) =>
        successfulValue(
          domainOperations.makeAutoVoiceCount(
            requireNumber(entry, `${row.id}.input[${String(index)}]`),
          ),
          `${row.id}.input[${String(index)}]`,
        ),
      );
      expectFixtureEqual(actual, values);
      expect(expected["allValid"]).toBe(true);
      return;
    }
    case "custom-pitch-name-limit-exact":
    case "custom-pitch-name-limit-plus-one": {
      const descriptor =
        row.inputDescriptor ?? fixtureFailure(`${row.id}.inputDescriptor`);
      const input = {
        kind: "custom" as const,
        sourceText: "Fixture literal",
        label: "Fixture literal",
        pitchNames: repeatedPitchClassInput(descriptor, row.id),
        bass: null,
      };
      const result = domainOperations.makeCustomChordSpec(input);
      if (!expectedOk(row)) {
        exactRefusal(result, requireIssue(row));
        return;
      }
      const value = successfulValue(result, row.id);
      expect(value.pitchNames).toHaveLength(
        requireNumber(expected["pitchNameCount"], `${row.id}.pitchNameCount`),
      );
      expectFixtureEqual(value.pitchNames, input.pitchNames);
      return;
    }
    case "frozen-note-limit-exact":
    case "frozen-note-limit-plus-one": {
      const descriptor =
        row.inputDescriptor ?? fixtureFailure(`${row.id}.inputDescriptor`);
      const input = makeDescriptorFrozen(descriptor, row.id);
      const result = domainOperations.makeFrozenVoicing(input, null);
      if (!expectedOk(row)) {
        exactRefusal(result, requireIssue(row));
        return;
      }
      const value = successfulValue(result, row.id);
      expect(value.pitches).toHaveLength(
        requireNumber(expected["pitchCount"], `${row.id}.pitchCount`),
      );
      expectFixtureEqual(value.pitches, input.pitches);
      expect(expected["allDuplicatesPreserved"]).toBe(true);
      return;
    }
    case "manual-exactness-under-parallel-transposition": {
      const source = (row.sourcePitches ??
        fixtureFailure(`${row.id}.sourcePitches`)).map((pitch, index) =>
        makePitch(pitch, `${row.id}.sourcePitches[${String(index)}]`),
      );
      const transposed = (row.transposedPitches ??
        fixtureFailure(`${row.id}.transposedPitches`)).map((pitch, index) =>
        makePitch(pitch, `${row.id}.transposedPitches[${String(index)}]`),
      );
      const sourceValue = successfulValue(
        domainOperations.makeManualVoicing(
          { mode: "manual", bassPolicy: "included", pitches: source },
          null,
        ),
        `${row.id}.source`,
      );
      const transposedValue = successfulValue(
        domainOperations.makeManualVoicing(
          { mode: "manual", bassPolicy: "included", pitches: transposed },
          null,
        ),
        `${row.id}.transposed`,
      );
      expectFixtureEqual(sourceValue.pitches, row.sourcePitches);
      expectFixtureEqual(transposedValue.pitches, row.transposedPitches);
      expect(sourceValue.pitches).toHaveLength(transposedValue.pitches.length);
      expect(expected["orderPreserved"]).toBe(true);
      expect(expected["cardinalityPreserved"]).toBe(true);
      expect(expected["silentSortOrRespell"]).toBe(false);
      expect(expected["transpositionImplementationOwnedBy"]).toBe("H1");
      return;
    }
    default:
      return fixtureFailure(`${row.id}: unsupported voicing kind ${row.kind}`);
  }
}

function parseExpectedStatus(status: string, label: string): Readonly<{
  valid: boolean;
  code: string | null;
}> {
  if (status === "valid") return { valid: true, code: null };
  if (!status.startsWith("invalid:")) return fixtureFailure(label);
  return { valid: false, code: status.slice("invalid:".length) };
}

function runAutoMatrix(fixture: VoicingFixture): number {
  let cells = 0;
  expectFixtureEqual(
    fixture.autoPolicyMatrix.map(({ family }) => family),
    AUTO_VOICING_FAMILIES,
  );
  for (const row of fixture.autoPolicyMatrix) {
    const family = autoFamily(row.family, `${row.id}.family`);
    expect(Object.keys(row.expectedByChordBass)).toEqual(["noSlash", "slash"]);
    for (const [bassState, rawPolicies] of Object.entries(
      row.expectedByChordBass,
    )) {
      const bass =
        bassState === "noSlash"
          ? null
          : bassState === "slash"
            ? makePitchClass({ step: "D", alter: -1 }, `${row.id}.bass`)
            : fixtureFailure(`${row.id}.expectedByChordBass.${bassState}`);
      const policies = requireRecord(
        rawPolicies,
        `${row.id}.expectedByChordBass.${bassState}`,
      );
      expectFixtureEqual(Object.keys(policies), AUTO_BASS_POLICIES);
      for (const [rawPolicy, rawStatus] of Object.entries(policies)) {
        cells += 1;
        const policy = autoBassPolicy(rawPolicy, `${row.id}.${rawPolicy}`);
        const status = parseExpectedStatus(
          requireString(rawStatus, `${row.id}.${bassState}.${rawPolicy}`),
          `${row.id}.${bassState}.${rawPolicy}`,
        );
        const input: AutoVoicingInput = {
          mode: "auto",
          family,
          voiceCount: 4,
          range: { lowMidi: 48, highMidi: 84 },
          bassPolicy: policy,
        };
        const result = domainOperations.makeAutoVoicing(input, bass);
        if (status.valid) {
          expectFixtureEqual(
            successfulValue(result, `${row.id}.${bassState}.${rawPolicy}`),
            input,
          );
        } else {
          exactRefusal(result, {
            code: status.code ?? fixtureFailure(`${row.id}.code`),
            path: ["bassPolicy"],
          });
        }
      }
    }
  }
  return cells;
}

function findFixtureCase(
  fixture: VoicingFixture,
  id: string,
): FixtureCase {
  return (
    fixture.cases.find((row) => row.id === id) ??
    fixtureFailure(`missing ${id}`)
  );
}

function runCustomAutoMatrix(fixture: VoicingFixture): number {
  const pathAuthority = requireIssue(findFixtureCase(fixture, "F1-VOICE-016"));
  let cells = 0;
  for (const row of fixture.customAutoPolicyMatrix) {
    expect(row.kind).toBe("cartesian-custom-auto-refusal");
    expectFixtureEqual(row.families, AUTO_VOICING_FAMILIES);
    expectFixtureEqual(row.bassPolicies, AUTO_BASS_POLICIES);
    expect(row.customChordBassStates).toEqual(["noSlash", "slash"]);
    expect(row.note).toBe(
      "Custom chords have literal pitch sets without semantic degree roles; no Auto family or bass policy is silently substituted.",
    );
    const status = parseExpectedStatus(row.expectedEveryCell, row.id);
    if (status.valid || status.code === null) {
      return fixtureFailure(`${row.id}.expectedEveryCell`);
    }
    expect(status.code).toBe(pathAuthority.code);
    for (const rawFamily of row.families) {
      const family = autoFamily(rawFamily, `${row.id}.families`);
      for (const rawPolicy of row.bassPolicies) {
        const policy = autoBassPolicy(rawPolicy, `${row.id}.bassPolicies`);
        for (const bassState of row.customChordBassStates) {
          cells += 1;
          const bass =
            bassState === "noSlash"
              ? null
              : bassState === "slash"
                ? makePitchClass({ step: "D", alter: -1 }, `${row.id}.bass`)
                : fixtureFailure(`${row.id}.customChordBassStates`);
          const chord = {
            kind: "custom" as const,
            sourceText: "Fixture stack",
            label: "Fixture stack",
            pitchNames: [
              makePitchClass({ step: "C", alter: 0 }, `${row.id}.pitchNames`),
            ],
            bass,
          };
          exactRefusal(
            makeFixtureEvent(chord, {
              mode: "auto",
              family,
              voiceCount: 4,
              range: { lowMidi: 48, highMidi: 84 },
              bassPolicy: policy,
            }),
            pathAuthority,
          );
        }
      }
    }
    expect(cells).toBe(row.matrixCellCount);
  }
  return cells;
}

const PARTIAL_BY_DESIGN = {
  "F1-CHORD-001":
    "F1 constructs and preserves distinct degrees; H1 owns degree-to-pitch projection",
  "F1-CHORD-007":
    "F1 preserves the literal Custom shape; H1 owns theory resolution",
  "F1-CHORD-008":
    "F1 accepts the structural shape; F3 owns source-to-AST correspondence",
  "F1-CHORD-013":
    "F1 validates each array independently; F3 owns cross-category formula meaning",
  "F1-CHORD-014":
    "F1 round-trips every field; F3 owns source-to-AST correspondence",
  "F1-CHORD-017":
    "F1 preserves degree identity; H1 owns transposition and projection",
  "F1-VOICE-014":
    "F1 accepts the Custom-plus-Manual shape; F3 owns pitch correspondence",
  "F1-VOICE-027":
    "F1 preserves the opaque engine version; F2 owns persisted text limits",
  "F1-VOICE-040":
    "F1 preserves both exact pitch arrays; H1 owns the transpose operation",
} as const;

describe("F1 production chord and voicing conformance to independent fixtures", () => {
  test("drives every one of the 25 reviewed chord-shape rows", async () => {
    const fixture = await chordFixturePromise;
    expect(fixture.schema).toBe("changes.fixtures.f1-chord-shape.v1");
    expect(fixture.cases).toHaveLength(25);
    for (const row of fixture.cases) runChordCase(row);
  });

  test("drives all 42 parsed-chord Auto policy cells from fixture statuses", async () => {
    const fixture = await voicingFixturePromise;
    expect(fixture.autoPolicyMatrix).toHaveLength(7);
    expect(runAutoMatrix(fixture)).toBe(42);
  });

  test("drives all 42 Custom-plus-Auto refusals from the fixture Cartesian product", async () => {
    const fixture = await voicingFixturePromise;
    expect(fixture.customAutoPolicyMatrix).toHaveLength(1);
    expect(runCustomAutoMatrix(fixture)).toBe(42);
  });

  test("drives every one of the 44 reviewed voicing and Custom rows", async () => {
    const fixture = await voicingFixturePromise;
    expect(fixture.schema).toBe("changes.fixtures.f1-voicing-custom.v1");
    expectFixtureEqual(
      fixture.manualFrozenBassContract["policies"],
      STORED_BASS_POLICIES,
    );
    expect(fixture.cases).toHaveLength(44);
    for (const row of fixture.cases) runVoicingCase(row);
  });

  test("accounts explicitly for every partial-by-design F2, F3, and H1 observation", async () => {
    const [chordFixture, voicingFixture] = await Promise.all([
      chordFixturePromise,
      voicingFixturePromise,
    ]);
    const reviewedIds = new Set([
      ...chordFixture.cases.map(({ id }) => id),
      ...voicingFixture.cases.map(({ id }) => id),
    ]);
    for (const [id, explanation] of Object.entries(PARTIAL_BY_DESIGN)) {
      expect(reviewedIds.has(id)).toBe(true);
      expect(explanation.length).toBeGreaterThan(0);
    }
    expect(Object.keys(PARTIAL_BY_DESIGN)).toEqual([
      "F1-CHORD-001",
      "F1-CHORD-007",
      "F1-CHORD-008",
      "F1-CHORD-013",
      "F1-CHORD-014",
      "F1-CHORD-017",
      "F1-VOICE-014",
      "F1-VOICE-027",
      "F1-VOICE-040",
    ]);
  });

  test("locks public vocabularies used to materialize fixture inputs", () => {
    expect([...DEGREE_NUMBER_ORDER]).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 11, 13]);
    expect([...AUTO_VOICING_FAMILIES]).toEqual([
      "balanced",
      "shell",
      "rootless-a",
      "rootless-b",
      "open",
      "drop2",
      "quartal",
    ]);
    expect([...AUTO_BASS_POLICIES]).toEqual([
      "generated",
      "external",
      "none",
    ]);
    expect([...AUTO_VOICE_COUNTS]).toEqual([3, 4, 5, 6, 7]);
  });
});
