import { createHash } from "node:crypto";

import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  makeCustomChordSpec,
  type Alteration,
  type ChordDegree,
  type ChordSpec,
  type CustomChordSpec,
  type DegreeNumber,
  type PitchClass,
  type SpelledPitchClass,
  type Step,
} from "../../src/domain";
import * as theory from "../../src/theory";
import { resolveChordWithEvidence } from "../../src/theory/chord-resolution";
import { spellChordDegreeWithEvidence } from "../../src/theory/degree-spelling";
import type {
  ResolveChordResult,
  SemanticRealization,
} from "../../src/theory/resolution-contract";
import type {
  ResolutionWorkEvidence,
  ResolveChordWithEvidenceResult,
} from "../../src/theory/resolution-evidence-contract";
import allRootFixtureValue from "../fixtures/resolution/all-root-cases.json";
import customFixtureValue from "../fixtures/resolution/custom-cases.json";
import formulaFixtureValue from "../fixtures/resolution/formula-rules.json";
import literalFixtureValue from "../fixtures/resolution/literal-cases.json";
import operationFixtureValue from "../fixtures/resolution/operation-state-cases.json";
import spellingFixtureValue from "../fixtures/resolution/spelling-cases.json";
import contractFixtureValue from "../fixtures/resolution/t1-resolution-contract.json";

setDefaultTimeout(600_000);

type FixtureRecord = Record<string, unknown>;
type ResolveSource = ChordSpec | CustomChordSpec;

type ResolvePair = Readonly<{
  result: ResolveChordResult;
  envelope: ResolveChordWithEvidenceResult;
}>;

const PRODUCTION_OBSERVATION_PRODUCER = Object.freeze({
  file: "tests/conformance/t1-production-conformance.test.ts",
  testcase: "executes the complete independent T1 authority and emits one bound observation",
} as const);

const contractFixture = record(contractFixtureValue, "contract fixture");
const formulaFixture = record(formulaFixtureValue, "formula fixture");
const allRootFixture = record(allRootFixtureValue, "all-root fixture");
const literalFixture = record(literalFixtureValue, "literal fixture");
const customFixture = record(customFixtureValue, "custom fixture");
const operationFixture = record(operationFixtureValue, "operation fixture");
const spellingFixture = record(spellingFixtureValue, "spelling fixture");
const identity = record(contractFixture["identity"], "contract identity");
const contractLimits = record(contractFixture["limits"], "contract limits");
const expectedMetadata = record(
  literalFixture["expectedMetadata"],
  "literal expected metadata",
);
const formulaRows = records(formulaFixture["rules"], "formula rules");
const formulaById = new Map(
  formulaRows.map((row) => [fixtureId(row), row] as const),
);
const publicRuleAssignments = record(
  formulaFixture["publicRuleAssignments"],
  "public rule assignments",
);
const alteredVariantRows = records(
  formulaFixture["alteredDominantVariants"],
  "altered dominant variants",
);
const customRows = records(customFixture["cases"], "custom cases");
const customById = new Map(
  customRows.map((row) => [fixtureId(row), row] as const),
);
const spellingById = new Map(
  records(spellingFixture["cases"], "spelling cases").map((row) => [
    fixtureId(row),
    row,
  ] as const),
);
const operationById = new Map(
  records(operationFixture["cases"], "operation cases").map((row) => [
    fixtureId(row),
    row,
  ] as const),
);
const degreeVocabulary = records(
  contractFixture["degreeTokenVocabulary"],
  "degree token vocabulary",
);
const degreeByToken = new Map(
  degreeVocabulary.map((row) => [
    stringValue(row["token"], "degree token"),
    row,
  ] as const),
);
const tokenByDegree = new Map(
  degreeVocabulary.map((row) => [
    degreeKey({
      number: degreeNumber(row["number"], "degree number"),
      alter: alteration(row["alter"], "degree alteration"),
    }),
    stringValue(row["token"], "degree token"),
  ] as const),
);

const productionFixtureDocuments = Object.freeze([
  allRootFixture,
  customFixture,
  formulaFixture,
  literalFixture,
  operationFixture,
  spellingFixture,
  contractFixture,
] as const);

const STEP_ORDER = Object.freeze(["C", "D", "E", "F", "G", "A", "B"] as const);
const NATURAL_SEMITONES = Object.freeze({
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
} satisfies Readonly<Record<Step, number>>);
const DEGREE_NATURAL_SEMITONES = Object.freeze({
  1: 0,
  2: 2,
  3: 4,
  4: 5,
  5: 7,
  6: 9,
  7: 11,
  9: 14,
  11: 17,
  13: 21,
} satisfies Readonly<Record<DegreeNumber, number>>);

const evidenceMaxima: Record<keyof Omit<ResolutionWorkEvidence, "termination">, number> = {
  inputDegreeRecordsVisited: 0,
  formulaPhaseTransitions: 0,
  candidateDegreesObserved: 0,
  duplicateDegreesCanonicalized: 0,
  realizationsProduced: 0,
  spellingAttempts: 0,
  degreesProduced: 0,
  warningsProduced: 0,
  peakCandidateDegreeRecords: 0,
};

let publicResolveExecutions = 0;
let privateResolveExecutions = 0;
let publicSpellExecutions = 0;
let privateSpellExecutions = 0;

function record(value: unknown, label: string): FixtureRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`T1_FIXTURE_RECORD:${label}`);
  }
  return value as FixtureRecord;
}

function records(value: unknown, label: string): readonly FixtureRecord[] {
  if (!Array.isArray(value)) throw new Error(`T1_FIXTURE_ARRAY:${label}`);
  return value.map((entry, index) => record(entry, `${label}[${String(index)}]`));
}

function values(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`T1_FIXTURE_ARRAY:${label}`);
  return value;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`T1_FIXTURE_STRING:${label}`);
  return value;
}

function numberValue(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`T1_FIXTURE_NUMBER:${label}`);
  }
  return value;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`T1_FIXTURE_BOOLEAN:${label}`);
  return value;
}

function fixtureId(row: FixtureRecord): string {
  return stringValue(row["id"], "fixture id");
}

function alteration(value: unknown, label: string): Alteration {
  const candidate = numberValue(value, label);
  if (
    candidate !== -2 &&
    candidate !== -1 &&
    candidate !== 0 &&
    candidate !== 1 &&
    candidate !== 2
  ) {
    throw new Error(`T1_FIXTURE_ALTERATION:${label}`);
  }
  return candidate;
}

function degreeNumber(value: unknown, label: string): DegreeNumber {
  const candidate = numberValue(value, label);
  if (
    candidate !== 1 &&
    candidate !== 2 &&
    candidate !== 3 &&
    candidate !== 4 &&
    candidate !== 5 &&
    candidate !== 6 &&
    candidate !== 7 &&
    candidate !== 9 &&
    candidate !== 11 &&
    candidate !== 13
  ) {
    throw new Error(`T1_FIXTURE_DEGREE_NUMBER:${label}`);
  }
  return candidate;
}

function degreeKey(degree: Readonly<{ number: number; alter: number }>): string {
  return `${String(degree.number)}:${String(degree.alter)}`;
}

function degreeFromToken(token: string): ChordDegree {
  const row = degreeByToken.get(token);
  if (row === undefined) throw new Error(`T1_FIXTURE_DEGREE_TOKEN:${token}`);
  return {
    number: degreeNumber(row["number"], `${token}.number`),
    alter: alteration(row["alter"], `${token}.alter`),
  };
}

function tokenForDegree(degree: ChordDegree): string {
  const token = tokenByDegree.get(degreeKey(degree));
  if (token === undefined) {
    throw new Error(`T1_RUNTIME_DEGREE_TOKEN:${degreeKey(degree)}`);
  }
  return token;
}

function tokenList(value: unknown, label: string): readonly string[] {
  return values(value, label).map((entry, index) =>
    stringValue(entry, `${label}[${String(index)}]`));
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [
      key,
      canonicalJsonValue(Reflect.get(value, key)),
    ]),
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalJsonValue(value));
}

function expectCanonicalEqual(actual: unknown, expected: unknown): void {
  expect(canonicalJson(actual)).toBe(canonicalJson(expected));
}

function sha256(value: unknown): string {
  return createHash("sha256").update(
    typeof value === "string" ? value : canonicalJson(value),
    "utf8",
  ).digest("hex");
}

function signedObservationDigest(caseId: string, payload: unknown): string {
  return sha256({
    caseId,
    producer: PRODUCTION_OBSERVATION_PRODUCER,
    payload: canonicalJsonValue(payload),
  });
}

function productionFixtureHashes(): Readonly<{
  ids: readonly string[];
  hashes: Readonly<Record<string, string>>;
}> {
  const hashes = new Map<string, string>();
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) collect(item);
      return;
    }
    if (value === null || typeof value !== "object") return;
    const candidate = record(value, "production fixture record");
    const id = candidate["id"];
    if (typeof id === "string" && /^(?:T1-|alt-)/.test(id)) {
      if (hashes.has(id)) throw new Error(`T1_DUPLICATE_PRODUCTION_CASE:${id}`);
      hashes.set(id, sha256(candidate));
    }
    for (const child of Object.values(candidate)) collect(child);
  };
  for (const document of productionFixtureDocuments) collect(document);
  const ids = [...hashes.keys()].sort();
  const entries = ids.map((id) => {
    const digest = hashes.get(id);
    if (digest === undefined) throw new Error(`T1_MISSING_PRODUCTION_HASH:${id}`);
    return [id, digest] as const;
  });
  return {
    ids,
    hashes: Object.fromEntries(entries),
  };
}

function assertDeeplyFrozen(
  value: unknown,
  label: string,
  seen = new Set<object>(),
): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (!Object.isFrozen(value)) throw new Error(`T1_NOT_FROZEN:${label}`);
  for (const [key, child] of Object.entries(value)) {
    assertDeeplyFrozen(child, `${label}.${key}`, seen);
  }
}

function assertDeeplyUnfrozen(
  value: unknown,
  label: string,
  seen = new Set<object>(),
): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Object.isFrozen(value)) throw new Error(`T1_INPUT_FROZEN:${label}`);
  for (const [key, child] of Object.entries(value)) {
    assertDeeplyUnfrozen(child, `${label}.${key}`, seen);
  }
}

function deeplyFreezeClone<Value>(value: Value): Value {
  const clone = structuredClone(value);
  const freeze = (candidate: unknown, seen = new Set<object>()): void => {
    if (candidate === null || typeof candidate !== "object" || seen.has(candidate)) return;
    seen.add(candidate);
    for (const child of Object.values(candidate)) freeze(child, seen);
    Object.freeze(candidate);
  };
  freeze(clone);
  return clone;
}

function writeTrappedClone<Value>(value: Value, label: string): Value {
  const clone = structuredClone(value);
  const proxies = new WeakMap<object, object>();
  const protect = (candidate: unknown, path: string): unknown => {
    if (candidate === null || typeof candidate !== "object") return candidate;
    const existing = proxies.get(candidate);
    if (existing !== undefined) return existing;
    const reject = (operation: string): never => {
      throw new Error(`T1_INPUT_WRITE:${label}:${path}:${operation}`);
    };
    const proxy = new Proxy(candidate, {
      get(target, property, receiver) {
        return protect(
          Reflect.get(target, property, receiver),
          `${path}.${String(property)}`,
        );
      },
      set: () => reject("set"),
      deleteProperty: () => reject("deleteProperty"),
      defineProperty: () => reject("defineProperty"),
      setPrototypeOf: () => reject("setPrototypeOf"),
      preventExtensions: () => reject("preventExtensions"),
    });
    proxies.set(candidate, proxy);
    return proxy;
  };
  return protect(clone, "input") as Value;
}

type ModifierArrayField =
  | "extensions"
  | "additions"
  | "alterations"
  | "omissions";

type ModifierReadCounts = Record<ModifierArrayField, number>;

const MODIFIER_ARRAY_FIELDS = Object.freeze([
  "extensions",
  "additions",
  "alterations",
  "omissions",
] as const satisfies readonly ModifierArrayField[]);

const POST_EXCESS_SENTINELS = Object.freeze({
  extensions: Object.freeze({ number: 9, alter: 0 }),
  additions: Object.freeze({ number: 2, alter: 0 }),
  alterations: Object.freeze({ number: 11, alter: 1 }),
  omissions: 3,
} as const);

function firstExcessReadTrappedSource(
  source: ResolveSource,
  decisiveField: ModifierArrayField,
  firstExcessIndex: number,
  label: string,
): Readonly<{
  source: ChordSpec;
  reads: ModifierReadCounts;
  recordReads: Readonly<Record<string, Readonly<{ number: number; alter: number }>>>;
  readState: Readonly<{ decisiveRecordFetched: boolean; decisiveReadComplete: boolean }>;
  firstForbiddenIndexes: Readonly<Record<ModifierArrayField, number>>;
}> {
  if (source.kind !== "parsed") {
    throw new TypeError(`${label} first-excess input must be parsed`);
  }
  const clone = structuredClone(source);
  const reads: ModifierReadCounts = {
    extensions: 0,
    additions: 0,
    alterations: 0,
    omissions: 0,
  };
  const firstForbiddenIndexes: Record<ModifierArrayField, number> = {
    extensions: Number.POSITIVE_INFINITY,
    additions: Number.POSITIVE_INFINITY,
    alterations: Number.POSITIVE_INFINITY,
    omissions: Number.POSITIVE_INFINITY,
  };
  const recordReads: Record<string, { number: number; alter: number }> = {};
  const readState = {
    decisiveRecordFetched: false,
    decisiveReadComplete: false,
  };
  const decisivePosition = MODIFIER_ARRAY_FIELDS.indexOf(decisiveField);
  const wrapped: Record<ModifierArrayField, readonly unknown[]> = {
    extensions: [],
    additions: [],
    alterations: [],
    omissions: [],
  };

  for (const [position, field] of MODIFIER_ARRAY_FIELDS.entries()) {
    const values = [...clone[field]] as unknown[];
    const isLaterField = position > decisivePosition;
    if (isLaterField && values.length === 0) {
      values.push(structuredClone(POST_EXCESS_SENTINELS[field]));
    }
    const firstForbiddenIndex = field === decisiveField
      ? firstExcessIndex + 1
      : isLaterField
        ? 0
        : Number.POSITIVE_INFINITY;
    firstForbiddenIndexes[field] = firstForbiddenIndex;
    const observedValues = values.map((value, index) => {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return value;
      }
      const readKey = `${field}[${index.toString()}]`;
      const propertyReads = { number: 0, alter: 0 };
      recordReads[readKey] = propertyReads;
      return new Proxy(value, {
        get(target, property, receiver) {
          if (readState.decisiveReadComplete) {
            throw new Error(`T1_POST_DECISIVE_RECORD_READ:${label}:${readKey}.${String(property)}`);
          }
          if (property === "number" || property === "alter") {
            propertyReads[property] += 1;
            if (propertyReads[property] !== 1) {
              throw new Error(`T1_MODIFIER_RECORD_REREAD:${label}:${readKey}.${property}`);
            }
            const result = Reflect.get(target, property, receiver) as unknown;
            if (
              field === decisiveField &&
              index === firstExcessIndex &&
              propertyReads.number === 1 &&
              propertyReads.alter === 1
            ) {
              readState.decisiveReadComplete = true;
            }
            return result;
          }
          return Reflect.get(target, property, receiver) as unknown;
        },
      });
    });
    wrapped[field] = new Proxy(observedValues, {
      get(target, property, receiver) {
        if (readState.decisiveReadComplete) {
          throw new Error(`T1_POST_DECISIVE_ARRAY_READ:${label}:${field}.${String(property)}`);
        }
        if (typeof property === "string" && /^(?:0|[1-9][0-9]*)$/.test(property)) {
          const index = Number(property);
          if (index >= firstForbiddenIndex) {
            throw new Error(
              `T1_POST_EXCESS_READ:${label}:${field}[${index.toString()}]`,
            );
          }
          reads[field] += 1;
          if (field === decisiveField && index === firstExcessIndex) {
            readState.decisiveRecordFetched = true;
            if (field === "omissions") readState.decisiveReadComplete = true;
          }
        }
        return Reflect.get(target, property, receiver) as unknown;
      },
    });
  }

  return {
    source: {
      ...clone,
      extensions: wrapped.extensions as ChordSpec["extensions"],
      additions: wrapped.additions as ChordSpec["additions"],
      alterations: wrapped.alterations as ChordSpec["alterations"],
      omissions: wrapped.omissions as ChordSpec["omissions"],
    },
    reads,
    recordReads,
    readState,
    firstForbiddenIndexes,
  };
}

function assertObjectGraphsDisjoint(left: unknown, right: unknown, label: string): void {
  const leftObjects = new Set<object>();
  const collect = (value: unknown): void => {
    if (value === null || typeof value !== "object" || leftObjects.has(value)) return;
    leftObjects.add(value);
    for (const child of Object.values(value)) collect(child);
  };
  collect(left);
  const visited = new Set<object>();
  const rejectShared = (value: unknown, path: string): void => {
    if (value === null || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (leftObjects.has(value)) throw new Error(`T1_OBJECT_REUSED:${label}:${path}`);
    for (const [key, child] of Object.entries(value)) {
      rejectShared(child, `${path}.${key}`);
    }
  };
  rejectShared(right, "result");
}

function assertFreshResults(left: ResolveChordResult, right: ResolveChordResult): void {
  if (left.ok !== right.ok) throw new Error("T1_FRESH_RESULT_BRANCH");
  assertObjectGraphsDisjoint(left, right, "resolution-results");
}

function normalizedWarnings(
  warnings: readonly Readonly<{
    code: string;
    path: readonly ["omissions", number];
    degreeNumber: number;
    message: string;
  }>[],
): readonly unknown[] {
  return warnings.map(({ code, path, degreeNumber }) => ({
    code,
    path,
    degreeNumber,
  }));
}

function normalizedResult(result: ResolveChordResult): unknown {
  if (!result.ok) return result;
  return {
    ok: true,
    value: {
      ...result.value,
      warnings: normalizedWarnings(result.value.warnings),
    },
  };
}

function expectedTermination(result: ResolveChordResult): ResolutionWorkEvidence["termination"] {
  if (result.ok) return "complete";
  if (result.refusal.code === "theory.spelling_accidental_out_of_range") {
    return "spelling-refusal";
  }
  if (result.refusal.code === "limit.theory_realization_degrees_exceeded") {
    return "output-limit-refusal";
  }
  return "formula-refusal";
}

function assertEvidenceBounds(
  result: ResolveChordResult,
  evidence: ResolutionWorkEvidence,
): void {
  const bounds: Readonly<Record<keyof Omit<ResolutionWorkEvidence, "termination">, number>> = {
    inputDegreeRecordsVisited: numberValue(
      contractLimits["inputDegreeRecordsVisited"],
      "input visit limit",
    ),
    formulaPhaseTransitions: numberValue(
      contractLimits["phaseTransitions"],
      "phase transition limit",
    ),
    candidateDegreesObserved: numberValue(
      contractLimits["candidateInsertions"],
      "candidate insertion limit",
    ),
    duplicateDegreesCanonicalized: numberValue(
      contractLimits["candidateInsertions"],
      "canonical duplicate limit",
    ),
    realizationsProduced: numberValue(
      contractLimits["realizationsPerChord"],
      "realization limit",
    ),
    spellingAttempts: numberValue(
      contractLimits["spellingAttempts"],
      "spelling attempt limit",
    ),
    degreesProduced: numberValue(
      contractLimits["semanticOutputRecords"],
      "semantic output limit",
    ),
    warningsProduced: numberValue(contractLimits["warnings"], "warning limit"),
    peakCandidateDegreeRecords: numberValue(
      contractLimits["peakCandidateDegrees"],
      "peak candidate limit",
    ),
  };
  for (const key of Object.keys(bounds) as readonly (keyof typeof bounds)[]) {
    const count = evidence[key];
    if (!Number.isSafeInteger(count) || count < 0 || count > bounds[key]) {
      throw new Error(`T1_EVIDENCE_BOUND:${key}:${String(count)}`);
    }
    evidenceMaxima[key] = Math.max(evidenceMaxima[key], count);
  }
  if (evidence.duplicateDegreesCanonicalized > evidence.candidateDegreesObserved) {
    throw new Error("T1_EVIDENCE_DUPLICATE_BOUND");
  }
  expect(evidence.termination).toBe(expectedTermination(result));
  if (!result.ok) {
    expect({
      realizationsProduced: evidence.realizationsProduced,
      degreesProduced: evidence.degreesProduced,
      warningsProduced: evidence.warningsProduced,
    }).toEqual({
      realizationsProduced: 0,
      degreesProduced: 0,
      warningsProduced: 0,
    });
  }
}

function runResolvePair(source: ResolveSource, label: string): ResolvePair {
  const publicInput = structuredClone(source);
  const privateInput = structuredClone(source);
  const publicSnapshot = canonicalJson(publicInput);
  const privateSnapshot = canonicalJson(privateInput);
  assertDeeplyUnfrozen(publicInput, `${label}.public-input.before`);
  assertDeeplyUnfrozen(privateInput, `${label}.private-input.before`);

  publicResolveExecutions += 1;
  const result = theory.resolveChord(publicInput);
  privateResolveExecutions += 1;
  const envelope = resolveChordWithEvidence(privateInput);
  const frozenInput = deeplyFreezeClone(source);
  const writeTrappedInput = writeTrappedClone(source, `${label}.write-trap`);
  const frozenPrivateInput = deeplyFreezeClone(source);
  const writeTrappedPrivateInput = writeTrappedClone(
    source,
    `${label}.private-write-trap`,
  );
  const writeTrappedSnapshot = canonicalJson(writeTrappedInput);
  const privateWriteTrappedSnapshot = canonicalJson(writeTrappedPrivateInput);
  publicResolveExecutions += 2;
  const frozenResult = theory.resolveChord(frozenInput);
  const writeTrappedResult = theory.resolveChord(writeTrappedInput);
  privateResolveExecutions += 2;
  const frozenEnvelope = resolveChordWithEvidence(frozenPrivateInput);
  const writeTrappedEnvelope = resolveChordWithEvidence(writeTrappedPrivateInput);

  expect(canonicalJson(publicInput)).toBe(publicSnapshot);
  expect(canonicalJson(privateInput)).toBe(privateSnapshot);
  assertDeeplyUnfrozen(publicInput, `${label}.public-input.after`);
  assertDeeplyUnfrozen(privateInput, `${label}.private-input.after`);
  expect(normalizedResult(result)).toEqual(normalizedResult(envelope.result));
  expect(normalizedResult(frozenResult)).toEqual(normalizedResult(result));
  expect(normalizedResult(writeTrappedResult)).toEqual(normalizedResult(result));
  expect(frozenEnvelope).toEqual(envelope);
  expect(writeTrappedEnvelope).toEqual(envelope);
  expect(canonicalJson(writeTrappedInput)).toBe(writeTrappedSnapshot);
  expect(canonicalJson(writeTrappedPrivateInput)).toBe(privateWriteTrappedSnapshot);
  assertFreshResults(result, envelope.result);
  assertFreshResults(result, frozenResult);
  assertFreshResults(result, writeTrappedResult);
  assertObjectGraphsDisjoint(envelope, frozenEnvelope, `${label}.frozen-envelope`);
  assertObjectGraphsDisjoint(
    envelope,
    writeTrappedEnvelope,
    `${label}.write-trapped-envelope`,
  );
  assertDeeplyFrozen(result, `${label}.public-result`);
  assertDeeplyFrozen(envelope, `${label}.private-envelope`);
  assertDeeplyFrozen(frozenResult, `${label}.frozen-input-result`);
  assertDeeplyFrozen(writeTrappedResult, `${label}.write-trapped-input-result`);
  assertDeeplyFrozen(frozenEnvelope, `${label}.frozen-input-envelope`);
  assertDeeplyFrozen(writeTrappedEnvelope, `${label}.write-trapped-input-envelope`);
  assertEvidenceBounds(envelope.result, envelope.evidence);
  if (result.ok) {
    expect(result.value.source).not.toBe(publicInput);
  }
  return { result, envelope };
}

function runPublicSpellingCell(
  root: SpelledPitchClass,
  degree: ChordDegree,
  label: string,
): ReturnType<typeof theory.spellChordDegree> {
  const firstRoot = structuredClone(root);
  const firstDegree = structuredClone(degree);
  const secondRoot = structuredClone(root);
  const secondDegree = structuredClone(degree);
  const firstSnapshot = canonicalJson({ root: firstRoot, degree: firstDegree });
  const secondSnapshot = canonicalJson({ root: secondRoot, degree: secondDegree });
  const frozenRoot = deeplyFreezeClone(root);
  const frozenDegree = deeplyFreezeClone(degree);
  const writeTrappedRoot = writeTrappedClone(root, `${label}.root-write-trap`);
  const writeTrappedDegree = writeTrappedClone(degree, `${label}.degree-write-trap`);
  const writeTrappedSnapshot = canonicalJson({
    root: writeTrappedRoot,
    degree: writeTrappedDegree,
  });
  assertDeeplyUnfrozen(firstRoot, `${label}.first-root.before`);
  assertDeeplyUnfrozen(firstDegree, `${label}.first-degree.before`);
  assertDeeplyUnfrozen(secondRoot, `${label}.second-root.before`);
  assertDeeplyUnfrozen(secondDegree, `${label}.second-degree.before`);

  publicSpellExecutions += 4;
  const first = theory.spellChordDegree(firstRoot, firstDegree);
  const second = theory.spellChordDegree(secondRoot, secondDegree);
  const frozen = theory.spellChordDegree(frozenRoot, frozenDegree);
  const writeTrapped = theory.spellChordDegree(writeTrappedRoot, writeTrappedDegree);

  expect(first).toEqual(second);
  expect(first).toEqual(frozen);
  expect(first).toEqual(writeTrapped);
  expect(canonicalJson({ root: firstRoot, degree: firstDegree })).toBe(firstSnapshot);
  expect(canonicalJson({ root: secondRoot, degree: secondDegree })).toBe(secondSnapshot);
  expect(canonicalJson({ root: writeTrappedRoot, degree: writeTrappedDegree })).toBe(
    writeTrappedSnapshot,
  );
  assertDeeplyUnfrozen(firstRoot, `${label}.first-root.after`);
  assertDeeplyUnfrozen(firstDegree, `${label}.first-degree.after`);
  assertDeeplyUnfrozen(secondRoot, `${label}.second-root.after`);
  assertDeeplyUnfrozen(secondDegree, `${label}.second-degree.after`);
  assertDeeplyFrozen(first, `${label}.first-result`);
  assertDeeplyFrozen(second, `${label}.second-result`);
  assertDeeplyFrozen(frozen, `${label}.frozen-result`);
  assertDeeplyFrozen(writeTrapped, `${label}.write-trapped-result`);
  assertObjectGraphsDisjoint(first, second, `${label}.spelling-results`);
  assertObjectGraphsDisjoint(first, frozen, `${label}.frozen-spelling-result`);
  assertObjectGraphsDisjoint(first, writeTrapped, `${label}.write-trapped-spelling-result`);
  return first;
}

function runSpellingPair(
  root: SpelledPitchClass,
  degree: ChordDegree,
  label: string,
): Readonly<{
  result: ReturnType<typeof theory.spellChordDegree>;
  envelope: ReturnType<typeof spellChordDegreeWithEvidence>;
}> {
  const publicRoot = structuredClone(root);
  const publicDegree = structuredClone(degree);
  const privateRoot = structuredClone(root);
  const privateDegree = structuredClone(degree);
  const publicSnapshot = canonicalJson({ root: publicRoot, degree: publicDegree });
  const privateSnapshot = canonicalJson({ root: privateRoot, degree: privateDegree });

  publicSpellExecutions += 1;
  const result = theory.spellChordDegree(publicRoot, publicDegree);
  privateSpellExecutions += 1;
  const envelope = spellChordDegreeWithEvidence(privateRoot, privateDegree);

  expect(result).toEqual(envelope.result);
  expect(canonicalJson({ root: publicRoot, degree: publicDegree })).toBe(publicSnapshot);
  expect(canonicalJson({ root: privateRoot, degree: privateDegree })).toBe(privateSnapshot);
  assertDeeplyUnfrozen(publicRoot, `${label}.public-root.after`);
  assertDeeplyUnfrozen(publicDegree, `${label}.public-degree.after`);
  assertDeeplyUnfrozen(privateRoot, `${label}.private-root.after`);
  assertDeeplyUnfrozen(privateDegree, `${label}.private-degree.after`);
  assertDeeplyFrozen(result, `${label}.public-result`);
  assertDeeplyFrozen(envelope, `${label}.private-envelope`);
  assertObjectGraphsDisjoint(result, envelope.result, `${label}.public-private`);
  return { result, envelope };
}

function parseChord(sourceText: string): ChordSpec {
  const parsed = theory.parseChordSymbol(sourceText, "ascii");
  if (!parsed.ok) {
    throw new Error(`T1_INPUT_PARSE:${sourceText}:${canonicalJson(parsed)}`);
  }
  return parsed.chord;
}

function parsedRecipe(value: unknown, label: string): ChordSpec {
  const recipe = record(value, label);
  if (recipe["kind"] === "parsed") {
    return structuredClone(recipe) as ChordSpec;
  }
  const base = parseChord(stringValue(recipe["base"], `${label}.base`));
  const overrides = Object.fromEntries(
    Object.entries(recipe)
      .filter(([key]) => key !== "base")
      .map(([key, entry]) => [key, structuredClone(entry)]),
  );
  return { ...base, ...overrides };
}

function literalInput(row: FixtureRecord): ChordSpec {
  if (row["inputAstRecipe"] !== undefined) {
    return parsedRecipe(row["inputAstRecipe"], `${fixtureId(row)}.inputAstRecipe`);
  }
  return parseChord(stringValue(row["sourceSymbol"], `${fixtureId(row)}.sourceSymbol`));
}

function customInput(value: unknown, label: string): CustomChordSpec {
  return structuredClone(record(value, label)) as CustomChordSpec;
}

function operationInput(value: unknown, label: string): ResolveSource {
  const recipe = record(value, label);
  if (typeof recipe["customCaseRef"] === "string") {
    const [caseId] = recipe["customCaseRef"].split(".");
    if (caseId === undefined) throw new Error(`T1_CUSTOM_REFERENCE:${label}`);
    const row = customById.get(caseId);
    if (row === undefined) throw new Error(`T1_CUSTOM_REFERENCE:${label}`);
    return customInput(row["input"], `${caseId}.input`);
  }
  return parsedRecipe(recipe, label);
}

function expectedMetadataValue(): FixtureRecord {
  return structuredClone(expectedMetadata);
}

function metadataProjection(value: Readonly<Record<string, unknown>>): FixtureRecord {
  return {
    schema: value["schema"],
    formulaTableId: value["formulaTableId"],
    formulaTableVersion: value["formulaTableVersion"],
    degreeSpellingPolicyId: value["degreeSpellingPolicyId"],
    degreeSpellingPolicyVersion: value["degreeSpellingPolicyVersion"],
    degreeRolePolicyId: value["degreeRolePolicyId"],
    degreeRolePolicyVersion: value["degreeRolePolicyVersion"],
  };
}

function directedSpelling(
  root: SpelledPitchClass,
  degree: ChordDegree,
): Readonly<{ step: Step; requiredAlteration: number; pitchClass: PitchClass }> {
  const rootIndex = STEP_ORDER.indexOf(root.step);
  const directedSteps = degree.number - 1;
  const targetIndex = rootIndex + directedSteps;
  const targetStep = STEP_ORDER[((targetIndex % 7) + 7) % 7];
  if (targetStep === undefined) {
    throw new Error(`T1_SPELLING_STEP:${degreeKey(degree)}`);
  }
  const sounding = NATURAL_SEMITONES[root.step] + root.alter +
    DEGREE_NATURAL_SEMITONES[degree.number] + degree.alter;
  const naturalTarget = NATURAL_SEMITONES[targetStep] +
    12 * Math.floor(targetIndex / 7);
  const requiredAlteration = sounding - naturalTarget;
  const normalized = ((sounding % 12) + 12) % 12;
  if (!Number.isInteger(normalized) || normalized < 0 || normalized > 11) {
    throw new Error(`T1_SPELLING_PITCH_CLASS:${degreeKey(degree)}`);
  }
  return {
    step: targetStep,
    requiredAlteration,
    pitchClass: normalized as PitchClass,
  };
}

function independentSpelling(
  root: SpelledPitchClass,
  degree: ChordDegree,
): Readonly<{ spelled: SpelledPitchClass; pitchClass: PitchClass }> {
  const directed = directedSpelling(root, degree);
  return {
    spelled: {
      step: directed.step,
      alter: alteration(directed.requiredAlteration, "required alteration"),
    },
    pitchClass: directed.pitchClass,
  };
}

function independentSpellingResult(
  root: SpelledPitchClass,
  degree: ChordDegree,
): ReturnType<typeof theory.spellChordDegree> {
  const directed = directedSpelling(root, degree);
  if (directed.requiredAlteration < -2 || directed.requiredAlteration > 2) {
    return {
      ok: false,
      refusal: {
        code: "theory.spelling_accidental_out_of_range",
        path: ["degree"] as const,
        phase: "spelling",
        degreeSpellingPolicyId: "changes.degree-spelling",
        degreeSpellingPolicyVersion: 1,
        root: structuredClone(root),
        degree: structuredClone(degree),
        requiredAlteration: directed.requiredAlteration,
        minimum: -2,
        maximum: 2,
      },
    };
  }
  return {
    ok: true,
    value: {
      policyId: "changes.degree-spelling",
      policyVersion: 1,
      root: structuredClone(root),
      degree: structuredClone(degree),
      spelled: {
        step: directed.step,
        alter: alteration(directed.requiredAlteration, "required alteration"),
      },
      pitchClass: directed.pitchClass,
    },
  };
}

function realizationDetail(realization: SemanticRealization): FixtureRecord {
  return {
    degrees: realization.degrees.map(tokenForDegree),
    required: realization.requiredDegrees.map(tokenForDegree),
    optional: realization.optionalDegrees.map(tokenForDegree),
    guide: realization.guideToneDegrees.map(tokenForDegree),
    spelledPitchNames: realization.spelledPitchNames,
    pitchClasses: realization.pitchClasses,
  };
}

function assertSemanticLaws(
  realization: SemanticRealization,
  root: SpelledPitchClass,
  label: string,
): void {
  const degreeKeys = realization.degrees.map(degreeKey);
  const requiredKeys = realization.requiredDegrees.map(degreeKey);
  const optionalKeys = realization.optionalDegrees.map(degreeKey);
  const guideKeys = realization.guideToneDegrees.map(degreeKey);
  expect(new Set(degreeKeys).size).toBe(degreeKeys.length);
  expect(new Set(requiredKeys).size).toBe(requiredKeys.length);
  expect(new Set(optionalKeys).size).toBe(optionalKeys.length);
  expect(new Set(guideKeys).size).toBe(guideKeys.length);
  expect(requiredKeys.filter((key) => optionalKeys.includes(key))).toEqual([]);
  expect([...requiredKeys, ...optionalKeys].sort()).toEqual([...degreeKeys].sort());
  expect(guideKeys.every((key) => requiredKeys.includes(key))).toBe(true);
  expect(requiredKeys).toEqual(
    degreeKeys.filter((key) => requiredKeys.includes(key)),
  );
  expect(optionalKeys).toEqual(
    degreeKeys.filter((key) => optionalKeys.includes(key)),
  );
  expect(guideKeys).toEqual(
    degreeKeys.filter((key) => guideKeys.includes(key)),
  );
  expect(realization.spelledPitchNames).toHaveLength(realization.degrees.length);
  expect(realization.pitchClasses).toHaveLength(realization.degrees.length);
  for (let index = 0; index < realization.degrees.length; index += 1) {
    const degree = realization.degrees[index];
    if (degree === undefined) throw new Error(`T1_DEGREE_INDEX:${label}`);
    const expected = independentSpelling(root, degree);
    expect(realization.spelledPitchNames[index]).toEqual(expected.spelled);
    expect(realization.pitchClasses[index]).toBe(expected.pitchClass);
    if (index > 0) {
      const previous = realization.degrees[index - 1];
      if (previous === undefined) throw new Error(`T1_DEGREE_PREVIOUS:${label}`);
      const ordered = previous.number < degree.number ||
        (previous.number === degree.number && previous.alter < degree.alter);
      if (!ordered) throw new Error(`T1_DEGREE_ORDER:${label}`);
    }
  }
}

function assertDetailFields(
  actual: FixtureRecord,
  expected: FixtureRecord,
  label: string,
): void {
  for (const key of [
    "degrees",
    "required",
    "optional",
    "guide",
    "spelledPitchNames",
    "pitchClasses",
  ] as const) {
    if (expected[key] !== undefined) {
      expect(actual[key], `${label}.${key}`).toEqual(expected[key]);
    }
  }
}

function formulaRow(id: string): FixtureRecord {
  const row = formulaById.get(id);
  if (row === undefined) throw new Error(`T1_FORMULA_REFERENCE:${id}`);
  return row;
}

function assertFormulaRow(
  realization: SemanticRealization,
  row: FixtureRecord,
  label: string,
): void {
  const expectedRule = stringValue(
    publicRuleAssignments[stringValue(row["familyId"], `${label}.familyId`)],
    `${label}.publicRule`,
  );
  expectCanonicalEqual(realization.formulaRuleId, expectedRule);
  assertDetailFields(realizationDetail(realization), row, label);
}

function assertLiteralCase(
  row: FixtureRecord,
  input: ChordSpec,
  pair: ResolvePair,
  priorResults: ReadonlyMap<string, ResolveChordResult>,
): void {
  const id = fixtureId(row);
  const expected = record(row["expected"], `${id}.expected`);
  if (expected["refusal"] !== undefined) {
    expectCanonicalEqual(pair.result, { ok: false, refusal: expected["refusal"] });
    if (expected["partialOutput"] === false) {
      expect(Object.hasOwn(pair.result, "value")).toBe(false);
    }
    return;
  }
  expect(pair.result.ok).toBe(true);
  if (!pair.result.ok) throw new Error(`T1_LITERAL_SUCCESS:${id}`);
  const value = pair.result.value;
  expectCanonicalEqual(metadataProjection(value), expectedMetadataValue());
  expect(value.source).toEqual(input);
  expect(value.bass).toEqual(input.bass);
  expectCanonicalEqual(normalizedWarnings(value.warnings), expected["warnings"] ?? []);
  expectCanonicalEqual(value.realizations.map(({ id: realizationId }) => realizationId),
    expected["realizationIds"],
  );
  if (expected["formulaRuleId"] !== undefined) {
    expect(value.realizations.every(
      ({ formulaRuleId }) => formulaRuleId === expected["formulaRuleId"],
    )).toBe(true);
  }
  if (expected["root"] !== undefined) expectCanonicalEqual(input.root, expected["root"]);
  if (expected["bass"] !== undefined) expectCanonicalEqual(value.bass, expected["bass"]);

  for (const realization of value.realizations) {
    if (realization.kind !== "semantic") {
      throw new Error(`T1_LITERAL_REALIZATION_KIND:${id}`);
    }
    assertSemanticLaws(realization, input.root, `${id}.${realization.id}`);
  }
  const first = value.realizations[0];
  if (first.kind !== "semantic") {
    throw new Error(`T1_LITERAL_REALIZATION:${id}`);
  }
  assertDetailFields(realizationDetail(first), expected, id);

  if (typeof expected["formulaId"] === "string" && expected["degrees"] === undefined) {
    assertFormulaRow(first, formulaRow(expected["formulaId"]), `${id}.formula`);
  }
  if (typeof expected["variantExpectationsRef"] === "string") {
    for (const variant of alteredVariantRows) {
      const realization = value.realizations.find(
        ({ id: realizationId }) => realizationId === fixtureId(variant),
      );
      if (realization === undefined || realization.kind !== "semantic") {
        throw new Error(`T1_ALT_VARIANT:${id}:${fixtureId(variant)}`);
      }
      assertDetailFields(realizationDetail(realization), variant, `${id}.${fixtureId(variant)}`);
    }
  }
  if (expected["realizationsById"] !== undefined) {
    const byId = record(expected["realizationsById"], `${id}.realizationsById`);
    for (const [realizationId, expectedValue] of Object.entries(byId)) {
      const realization = value.realizations.find(({ id: candidate }) => candidate === realizationId);
      if (realization === undefined || realization.kind !== "semantic") {
        throw new Error(`T1_REALIZATION_BY_ID:${id}:${realizationId}`);
      }
      assertDetailFields(
        realizationDetail(realization),
        record(expectedValue, `${id}.${realizationId}`),
        `${id}.${realizationId}`,
      );
    }
  }
  if (expected["degreesById"] !== undefined) {
    const byId = record(expected["degreesById"], `${id}.degreesById`);
    for (const [realizationId, expectedDegrees] of Object.entries(byId)) {
      const realization = value.realizations.find(({ id: candidate }) => candidate === realizationId);
      if (realization === undefined || realization.kind !== "semantic") {
        throw new Error(`T1_DEGREES_BY_ID:${id}:${realizationId}`);
      }
      const degrees = realization.degrees.map(tokenForDegree);
      expectCanonicalEqual(degrees, expectedDegrees);
      expect(realization.requiredDegrees.map(tokenForDegree)).toEqual(degrees);
      expect(realization.optionalDegrees).toEqual([]);
      expect(realization.guideToneDegrees.map(tokenForDegree)).toEqual(["3", "b7"]);
    }
  }
  if (expected["everyVariantAddsRequired"] !== undefined) {
    const additions = typeof expected["everyVariantAddsRequired"] === "string"
      ? [expected["everyVariantAddsRequired"]]
      : tokenList(expected["everyVariantAddsRequired"], `${id}.everyVariantAddsRequired`);
    for (const realization of value.realizations) {
      if (realization.kind !== "semantic") throw new Error(`T1_ALT_KIND:${id}`);
      const required = realization.requiredDegrees.map(tokenForDegree);
      expect(additions.every((token) => required.includes(token))).toBe(true);
      const seed = alteredVariantRows.find(({ id: variantId }) => variantId === realization.id);
      if (seed === undefined) throw new Error(`T1_ALT_SEED:${id}:${realization.id}`);
      const expectedDegrees = [
        ...tokenList(seed["degrees"], `${id}.seed.degrees`),
        ...additions,
      ].map(degreeFromToken).sort((left, right) =>
        left.number - right.number || left.alter - right.alter).map(tokenForDegree);
      expect(realization.degrees.map(tokenForDegree)).toEqual(expectedDegrees);
      const expectedRequired = [
        ...tokenList(seed["required"], `${id}.seed.required`),
        ...additions,
      ].map(degreeFromToken).sort((left, right) =>
        left.number - right.number || left.alter - right.alter).map(tokenForDegree);
      expect(realization.requiredDegrees.map(tokenForDegree)).toEqual(expectedRequired);
      expect(realization.optionalDegrees.map(tokenForDegree)).toEqual(
        [...tokenList(seed["optional"], `${id}.seed.optional`)],
      );
      expect(realization.guideToneDegrees.map(tokenForDegree)).toEqual(
        [...tokenList(seed["guide"], `${id}.seed.guide`)],
      );
    }
  }
  if (expected["naturalFiveOrNinePresent"] === false) {
    expect(value.realizations.every((realization) =>
      realization.kind === "semantic" && realization.degrees.every(
        (degree) => !(
          (degree.number === 5 || degree.number === 9) && degree.alter === 0
        ),
      ))).toBe(true);
  }
  if (expected["genericAdd3IsGuide"] === false) {
    expect(first.guideToneDegrees.some(
      (degree) => degree.number === 3 && degree.alter === 0,
    )).toBe(false);
  }
  if (expected["degreeSevenSpelling"] !== undefined) {
    const index = first.degrees.findIndex((degree) => degree.number === 7);
    expect(index).toBeGreaterThanOrEqual(0);
    expectCanonicalEqual(first.spelledPitchNames[index], expected["degreeSevenSpelling"]);
  }
  if (expected["duplicateDegreesCanonicalized"] !== undefined) {
    expect(pair.envelope.evidence.duplicateDegreesCanonicalized).toBe(
      numberValue(
        expected["duplicateDegreesCanonicalized"],
        `${id}.duplicateDegreesCanonicalized`,
      ),
    );
  }
  if (expected["naturalNineFamilyMarkerConsumedOnce"] === true) {
    expect(first.degrees.filter(
      (degree) => degree.number === 9 && degree.alter === 0,
    )).toHaveLength(1);
    expect(first.optionalDegrees.map(tokenForDegree)).toContain("9");
  }
  if (typeof expected["requiredSiblingAddition"] === "string") {
    expect(first.requiredDegrees.map(tokenForDegree)).toContain(
      expected["requiredSiblingAddition"],
    );
  }
  if (expected["guideUnionSources"] !== undefined) {
    const guideUnion = record(expected["guideUnionSources"], `${id}.guideUnionSources`);
    expect(first.guideToneDegrees.map(tokenForDegree).includes("3")).toBe(
      booleanValue(guideUnion["result"], `${id}.guideUnionSources.result`),
    );
  }
  if (expected["phaseCoexistenceById"] !== undefined) {
    const phaseRows = record(expected["phaseCoexistenceById"], `${id}.phaseCoexistenceById`);
    for (const [realizationId, phaseValue] of Object.entries(phaseRows)) {
      const realization = value.realizations.find(({ id: candidate }) => candidate === realizationId);
      if (realization === undefined || realization.kind !== "semantic") {
        throw new Error(`T1_PHASE_REALIZATION:${id}:${realizationId}`);
      }
      const phase = record(phaseValue, `${id}.${realizationId}.phase`);
      expectCanonicalEqual(
        realization.degrees.filter(({ number }) => number === 9).map(tokenForDegree),
        phase["canonicalNineOrder"],
      );
    }
  }
  if (expected["noVariantChosen"] === true) {
    expect(Object.hasOwn(value, "chosenRealizationId")).toBe(false);
  }
  if (expected["sourceTextIgnored"] === true) {
    expect(first.formulaRuleId).not.toBe(expected["sourceTextWouldImplyFormulaRuleId"]);
  }
  if (typeof expected["rootVariationOf"] === "string") {
    const reference = priorResults.get(expected["rootVariationOf"]);
    if (reference === undefined || !reference.ok) {
      throw new Error(`T1_ROOT_VARIATION_REFERENCE:${id}`);
    }
    const referenceRealization = reference.value.realizations[0];
    if (referenceRealization.kind !== "semantic") {
      throw new Error(`T1_ROOT_VARIATION_KIND:${id}`);
    }
    expect({
      degrees: first.degrees,
      required: first.requiredDegrees,
      optional: first.optionalDegrees,
      guide: first.guideToneDegrees,
    }).toEqual({
      degrees: referenceRealization.degrees,
      required: referenceRealization.requiredDegrees,
      optional: referenceRealization.optionalDegrees,
      guide: referenceRealization.guideToneDegrees,
    });
  }
}

function expectedFormulaResult(
  source: ChordSpec,
  root: SpelledPitchClass,
  formula: FixtureRecord,
): unknown {
  const degrees = tokenList(formula["degrees"], "formula degrees").map(degreeFromToken);
  const spellings = degrees.map((degree) => independentSpelling(root, degree));
  const familyId = stringValue(formula["familyId"], "formula familyId");
  return {
    ok: true,
    value: {
      ...expectedMetadataValue(),
      source: structuredClone(source),
      realizations: [{
        kind: "semantic",
        id: "literal",
        formulaRuleId: stringValue(
          publicRuleAssignments[familyId],
          `${familyId}.publicRule`,
        ),
        degrees,
        requiredDegrees: tokenList(formula["required"], `${familyId}.required`)
          .map(degreeFromToken),
        optionalDegrees: tokenList(formula["optional"], `${familyId}.optional`)
          .map(degreeFromToken),
        guideToneDegrees: tokenList(formula["guide"], `${familyId}.guide`)
          .map(degreeFromToken),
        spelledPitchNames: spellings.map(({ spelled }) => spelled),
        pitchClasses: spellings.map(({ pitchClass }) => pitchClass),
      }],
      bass: source.bass,
      warnings: [],
    },
  };
}

function expectedCustomResult(
  source: CustomChordSpec,
  pitchClasses: readonly unknown[],
): unknown {
  const shared = record(customFixture["sharedExpected"], "custom shared expected");
  const metadata = record(shared["resolvedChordMetadata"], "custom metadata");
  return {
    ok: true,
    value: {
      ...metadata,
      source: structuredClone(source),
      realizations: [{
        kind: shared["kind"],
        id: shared["id"],
        formulaRuleId: shared["formulaRuleId"],
        degrees: shared["degrees"],
        requiredDegrees: shared["requiredDegrees"],
        optionalDegrees: shared["optionalDegrees"],
        guideToneDegrees: shared["guideToneDegrees"],
        spelledPitchNames: structuredClone(source.pitchNames),
        pitchClasses: structuredClone(pitchClasses),
        limitations: structuredClone(shared["limitations"]),
      }],
      bass: structuredClone(source.bass),
      warnings: structuredClone(shared["warnings"]),
    },
  };
}

function customEvidenceExpectation(): FixtureRecord {
  const state = operationById.get("T1-OPSTATE-009");
  if (state === undefined) throw new Error("T1_OPERATION_STATE_009");
  const row = records(state["rows"], "operation state 009 rows").find(
    ({ id }) => id === "T1-EVIDENCE-CUSTOM-COMPLETE",
  );
  if (row === undefined) throw new Error("T1_CUSTOM_EVIDENCE_ROW");
  return record(row["expectedEvidence"], "custom expected evidence");
}

function transposePitch(
  pitch: SpelledPitchClass,
  diatonicSteps: number,
  semitones: number,
): SpelledPitchClass {
  const sourceIndex = STEP_ORDER.indexOf(pitch.step);
  const targetIndex = sourceIndex + diatonicSteps;
  const targetStep = STEP_ORDER[((targetIndex % 7) + 7) % 7];
  if (targetStep === undefined) throw new Error("T1_TRANSPOSE_STEP");
  const targetNatural = NATURAL_SEMITONES[targetStep] +
    12 * Math.floor(targetIndex / 7);
  return {
    step: targetStep,
    alter: alteration(
      NATURAL_SEMITONES[pitch.step] + pitch.alter + semitones - targetNatural,
      "transposed alteration",
    ),
  };
}

function spellingExpectedResult(
  row: FixtureRecord,
  input: FixtureRecord,
): unknown {
  const expected = record(row["expected"], `${fixtureId(row)}.expected`);
  if (expected["ok"] === false) return expected;
  return {
    ok: true,
    value: {
      policyId: identity["spellingPolicyId"],
      policyVersion: identity["spellingPolicyVersion"],
      root: input["root"],
      degree: input["degree"],
      spelled: expected["spelled"],
      pitchClass: expected["pitchClass"],
    },
  };
}

function updateCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

describe("T1 production chord-resolution conformance", () => {
  test("publishes exact immutable public operations while keeping evidence private", () => {
    expectCanonicalEqual(theory.RESOLUTION_OPERATION_NAMES, contractFixture["operationIds"]);
    expectCanonicalEqual(Object.keys(theory.resolutionOperations), contractFixture["operationIds"]);
    expect(Object.isFrozen(theory.resolutionOperations)).toBe(true);
    expect(theory.resolutionOperations.spellChordDegree).toBe(theory.spellChordDegree);
    expect(theory.resolutionOperations.resolveChord).toBe(theory.resolveChord);
    expect(Object.hasOwn(theory, "spellChordDegreeWithEvidence")).toBe(false);
    expect(Object.hasOwn(theory, "resolveChordWithEvidence")).toBe(false);
    expectCanonicalEqual({
      schema: theory.RESOLVED_CHORD_SCHEMA,
      formulaTableId: theory.CHORD_FORMULA_TABLE_ID,
      formulaTableVersion: theory.CHORD_FORMULA_TABLE_VERSION,
      degreeSpellingPolicyId: theory.DEGREE_SPELLING_POLICY_ID,
      degreeSpellingPolicyVersion: theory.DEGREE_SPELLING_POLICY_VERSION,
      degreeRolePolicyId: theory.DEGREE_ROLE_POLICY_ID,
      degreeRolePolicyVersion: theory.DEGREE_ROLE_POLICY_VERSION,
    }, expectedMetadataValue());
  });

  test("executes the complete independent T1 authority and emits one bound observation", () => {
    const literalObservations: unknown[] = [];
    const literalResults = new Map<string, ResolveChordResult>();
    const literalRows = records(literalFixture["cases"], "literal cases");
    expect(literalRows).toHaveLength(88);
    for (const row of literalRows) {
      const id = fixtureId(row);
      const input = literalInput(row);
      const pair = runResolvePair(input, id);
      assertLiteralCase(row, input, pair, literalResults);
      literalResults.set(id, pair.result);
      literalObservations.push({
        id,
        result: normalizedResult(pair.result),
        evidence: pair.envelope.evidence,
      });
    }

    const customObservations: unknown[] = [];
    const customEvidence = customEvidenceExpectation();
    expect(customRows).toHaveLength(9);
    for (const row of customRows) {
      const id = fixtureId(row);
      if (id === "T1-CUSTOM-006") {
        const baseRow = customById.get("T1-CUSTOM-005");
        if (baseRow === undefined) throw new Error("T1_CUSTOM_005");
        const baseInput = customInput(baseRow["input"], "T1-CUSTOM-005.input");
        const recipe = record(row["materializationRecipe"], `${id}.recipe`);
        const boundary = makeCustomChordSpec({
          kind: "custom",
          sourceText: "seventeen pitch names",
          label: "domain boundary",
          pitchNames: [
            ...baseInput.pitchNames,
            structuredClone(record(recipe["append"], `${id}.append`)) as SpelledPitchClass,
          ],
          bass: null,
        });
        const expected = record(row["expected"], `${id}.expected`);
        expectCanonicalEqual(boundary, {
          ok: false,
          refusal: expected["domainRefusal"],
        });
        customObservations.push({ id, domainResult: boundary, t1Invoked: false });
        continue;
      }

      const inputs: readonly Readonly<{ source: CustomChordSpec; pitchClasses: readonly unknown[] }>[] =
        id === "T1-CUSTOM-009"
          ? (() => {
              const expected = record(row["expected"], `${id}.expected`);
              return [
                {
                  source: customInput(row["sourceInput"], `${id}.sourceInput`),
                  pitchClasses: values(expected["sourcePitchClasses"], `${id}.sourcePitchClasses`),
                },
                {
                  source: customInput(row["transposedInput"], `${id}.transposedInput`),
                  pitchClasses: values(
                    expected["transposedPitchClasses"],
                    `${id}.transposedPitchClasses`,
                  ),
                },
              ];
            })()
          : (() => {
              const expected = record(row["expected"], `${id}.expected`);
              return [{
                source: customInput(row["input"], `${id}.input`),
                pitchClasses: values(expected["pitchClasses"], `${id}.pitchClasses`),
              }];
            })();

      const executions: unknown[] = [];
      for (let index = 0; index < inputs.length; index += 1) {
        const item = inputs[index];
        if (item === undefined) throw new Error(`T1_CUSTOM_INPUT:${id}`);
        const pair = runResolvePair(item.source, `${id}.${String(index)}`);
        expectCanonicalEqual(pair.result, expectedCustomResult(item.source, item.pitchClasses));
        expectCanonicalEqual(pair.envelope.evidence, customEvidence);
        executions.push({
          result: normalizedResult(pair.result),
          evidence: pair.envelope.evidence,
        });
      }
      if (id === "T1-CUSTOM-009") {
        const expected = record(row["expected"], `${id}.expected`);
        const recipe = record(row["transpositionRecipe"], `${id}.transpositionRecipe`);
        const interval = record(recipe["interval"], `${id}.interval`);
        const inverse = record(recipe["inverse"], `${id}.inverse`);
        const source = inputs[0]?.source;
        const transposed = inputs[1]?.source;
        if (source === undefined || transposed === undefined) {
          throw new Error(`T1_CUSTOM_TRANSPOSE_INPUT:${id}`);
        }
        const forward = source.pitchNames.map((pitch) => transposePitch(
          pitch,
          numberValue(interval["diatonicSteps"], `${id}.interval.steps`),
          numberValue(interval["semitones"], `${id}.interval.semitones`),
        ));
        expectCanonicalEqual(forward, transposed.pitchNames);
        const restored = transposed.pitchNames.map((pitch) => transposePitch(
          pitch,
          numberValue(inverse["diatonicSteps"], `${id}.inverse.steps`),
          numberValue(inverse["semitones"], `${id}.inverse.semitones`),
        ));
        expectCanonicalEqual(restored, source.pitchNames);
        expect(numberValue(expected["tupleLength"], `${id}.tupleLength`)).toBe(
          source.pitchNames.length,
        );
        expectCanonicalEqual(source.pitchNames[0], source.pitchNames[2]);
      }
      customObservations.push({ id, executions });
    }

    const allRootObservations: unknown[] = [];
    const roots = records(allRootFixture["roots"], "all-root roots");
    const seeds = records(allRootFixture["familySeeds"], "all-root family seeds");
    expect(roots).toHaveLength(12);
    expect(seeds).toHaveLength(33);
    for (const root of roots) {
      for (const seed of seeds) {
        const formula = formulaRow(stringValue(seed["formulaId"], "seed formulaId"));
        const symbol = stringValue(formula["symbolTemplate"], "formula symbol template")
          .replace("{root}", stringValue(root["symbol"], "root symbol"));
        const input = parseChord(symbol);
        const cellId = `${fixtureId(root)}::${stringValue(seed["formulaId"], "seed formulaId")}`;
        const pair = runResolvePair(input, cellId);
        const spelledRoot = structuredClone(record(root["spelled"], `${cellId}.root`)) as SpelledPitchClass;
        expectCanonicalEqual(pair.result, expectedFormulaResult(input, spelledRoot, formula));
        allRootObservations.push({
          id: cellId,
          result: normalizedResult(pair.result),
          evidence: pair.envelope.evidence,
        });
      }
    }
    expect(allRootObservations).toHaveLength(396);

    const publicDegreeMatrix = record(
      spellingFixture["publicDegreeMatrix"],
      "public degree matrix",
    );
    const publicDegreeExpected = record(
      publicDegreeMatrix["expected"],
      "public degree matrix expected",
    );
    const publicDegreeCells: unknown[] = [];
    const publicDegreeResults = new Map<
      string,
      ReturnType<typeof theory.spellChordDegree>
    >();
    const publicDegreeBuckets = new Map<
      number,
      { number: number; successCells: number; refusalCells: number }
    >();
    let publicDegreeSuccesses = 0;
    let publicDegreeRefusals = 0;
    let minimumRequiredAlteration = Number.POSITIVE_INFINITY;
    let maximumRequiredAlteration = Number.NEGATIVE_INFINITY;
    for (const rootStepValue of values(
      publicDegreeMatrix["rootSteps"],
      "public root steps",
    )) {
      if (
        typeof rootStepValue !== "string" ||
        !STEP_ORDER.includes(rootStepValue as Step)
      ) {
        throw new Error("T1_PUBLIC_ROOT_STEP");
      }
      const rootStep = rootStepValue as Step;
      for (const rootAlterValue of values(
        publicDegreeMatrix["rootAlterations"],
        "public root alterations",
      )) {
        const root: SpelledPitchClass = {
          step: rootStep,
          alter: alteration(rootAlterValue, "public root alteration"),
        };
        for (const degreeNumberValue of values(
          publicDegreeMatrix["degreeNumbers"],
          "public degree numbers",
        )) {
          const number = degreeNumber(degreeNumberValue, "public degree number");
          const bucket = publicDegreeBuckets.get(number) ?? {
            number,
            successCells: 0,
            refusalCells: 0,
          };
          publicDegreeBuckets.set(number, bucket);
          for (const degreeAlterValue of values(
            publicDegreeMatrix["degreeAlterations"],
            "public degree alterations",
          )) {
            const degree: ChordDegree = {
              number,
              alter: alteration(degreeAlterValue, "public degree alteration"),
            };
            const label = `${root.step}:${String(root.alter)}:${degreeKey(degree)}`;
            const expected = independentSpellingResult(root, degree);
            const actual = runPublicSpellingCell(root, degree, label);
            expect(actual).toEqual(expected);
            const directed = directedSpelling(root, degree);
            minimumRequiredAlteration = Math.min(
              minimumRequiredAlteration,
              directed.requiredAlteration,
            );
            maximumRequiredAlteration = Math.max(
              maximumRequiredAlteration,
              directed.requiredAlteration,
            );
            if (actual.ok) {
              publicDegreeSuccesses += 1;
              bucket.successCells += 1;
            } else {
              publicDegreeRefusals += 1;
              bucket.refusalCells += 1;
            }
            publicDegreeCells.push({ input: { root, degree }, expected });
            publicDegreeResults.set(label, actual);
          }
        }
      }
    }
    expect(publicDegreeCells).toHaveLength(1_750);
    expect(publicDegreeSuccesses).toBe(
      numberValue(publicDegreeExpected["successCells"], "public success cells"),
    );
    expect(publicDegreeRefusals).toBe(
      numberValue(publicDegreeExpected["refusalCells"], "public refusal cells"),
    );
    expect(minimumRequiredAlteration).toBe(
      numberValue(
        publicDegreeExpected["minimumRequiredAlteration"],
        "public minimum alteration",
      ),
    );
    expect(maximumRequiredAlteration).toBe(
      numberValue(
        publicDegreeExpected["maximumRequiredAlteration"],
        "public maximum alteration",
      ),
    );
    expectCanonicalEqual([...publicDegreeBuckets.values()],
      publicDegreeExpected["byDegreeNumber"],
    );
    const publicDegreeSemanticDigest = sha256(publicDegreeCells);
    expect(publicDegreeSemanticDigest).toBe(
      stringValue(
        publicDegreeExpected["orderedCellSemanticSha256"],
        "public degree semantic digest",
      ),
    );

    const focusedSpellingRows = records(spellingFixture["cases"], "spelling cases");
    expect(focusedSpellingRows).toHaveLength(16);
    for (const row of focusedSpellingRows) {
      const id = fixtureId(row);
      const root = structuredClone(record(row["root"], `${id}.root`)) as SpelledPitchClass;
      const degree = structuredClone(record(row["degree"], `${id}.degree`)) as ChordDegree;
      const observed = publicDegreeResults.get(
        `${root.step}:${String(root.alter)}:${degreeKey(degree)}`,
      );
      if (observed === undefined) throw new Error(`T1_PUBLIC_SPELLING_CASE:${id}`);
      expectCanonicalEqual(observed, spellingExpectedResult(row, { root, degree }));
    }

    const familyMatrix = record(formulaFixture["familyStateMatrix"], "family matrix");
    const axes = record(familyMatrix["axes"], "family matrix axes");
    const defaults = record(familyMatrix["sourceDefaults"], "family source defaults");
    const familyExpected = record(familyMatrix["expected"], "family expected");
    const familyPublicOutcomes: unknown[] = [];
    const familyOutcomeCounts: Record<string, number> = {};
    const familyAcceptedRuleCounts: Record<string, number> = {};
    const familyRefusalRuleCounts: Record<string, Record<string, number>> = {};
    const familyReasonAndConflictCounts: Record<string, number> = {};
    for (const triad of values(axes["triad"], "family triad axis")) {
      for (const sixth of values(axes["sixth"], "family sixth axis")) {
        for (const seventh of values(axes["seventh"], "family seventh axis")) {
          for (const extension of values(axes["extension"], "family extension axis")) {
            for (const naturalNineAddition of values(
              axes["naturalNineAddition"],
              "family add9 axis",
            )) {
              for (const colorPolicy of values(axes["colorPolicy"], "family color axis")) {
                const facts = {
                  triad,
                  sixth,
                  seventh,
                  extension,
                  naturalNineAddition,
                  colorPolicy,
                };
                const input = {
                  ...structuredClone(defaults),
                  triad,
                  sixth: structuredClone(sixth),
                  seventh,
                  extensions: extension === null ? [] : [{ number: extension, alter: 0 }],
                  additions: naturalNineAddition === true
                    ? [{ number: 9, alter: 0 }]
                    : [],
                  colorPolicy,
                } as unknown as ChordSpec;
                const pair = runResolvePair(
                  input,
                  `T1-FAMILY-${String(familyPublicOutcomes.length + 1)}`,
                );
                familyPublicOutcomes.push({
                  facts,
                  expected: normalizedResult(pair.result),
                });
                const outcome = pair.result.ok ? "accepted" : pair.result.refusal.code;
                updateCount(familyOutcomeCounts, outcome);
                const ruleId = pair.result.ok
                  ? pair.result.value.realizations[0].formulaRuleId
                  : record(pair.result.refusal, "family refusal")["ruleId"];
                if (typeof ruleId !== "string") throw new Error("T1_FAMILY_RULE_ID");
                if (pair.result.ok) {
                  updateCount(familyAcceptedRuleCounts, ruleId);
                } else {
                  const byRule = familyRefusalRuleCounts[outcome] ?? {};
                  familyRefusalRuleCounts[outcome] = byRule;
                  updateCount(byRule, ruleId);
                  if (pair.result.refusal.code === "theory.sixth_invalid") {
                    updateCount(familyReasonAndConflictCounts, "sixth-family");
                  } else if (
                    pair.result.refusal.code === "theory.formula_family_unsupported"
                  ) {
                    updateCount(familyReasonAndConflictCounts, "unsupported-seventh");
                  } else if (pair.result.refusal.code === "theory.extension_invalid") {
                    updateCount(familyReasonAndConflictCounts, "extension-family");
                  } else if (pair.result.refusal.code === "theory.color_policy_invalid") {
                    updateCount(familyReasonAndConflictCounts, "requires-dominant-seventh");
                  } else if (pair.result.refusal.code === "theory.modifier_conflict") {
                    updateCount(familyReasonAndConflictCounts, pair.result.refusal.conflict);
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(familyPublicOutcomes).toHaveLength(896);
    expectCanonicalEqual(familyOutcomeCounts, familyExpected["outcomeCounts"]);
    expectCanonicalEqual(
      familyAcceptedRuleCounts,
      familyExpected["acceptedRuleIdCounts"],
    );
    expectCanonicalEqual(familyRefusalRuleCounts, familyExpected["refusalRuleIdCounts"]);
    expectCanonicalEqual(familyReasonAndConflictCounts,
      familyExpected["reasonAndConflictCounts"],
    );
    const familyPublicDigest = sha256(familyPublicOutcomes);
    expect(familyPublicDigest).toBe(
      stringValue(
        familyExpected["orderedPublicOutcomeSemanticSha256"],
        "family outcome semantic digest",
      ),
    );

    const stateSeven = operationById.get("T1-OPSTATE-007");
    const stateTen = operationById.get("T1-OPSTATE-010");
    if (stateSeven === undefined || stateTen === undefined) {
      throw new Error("T1_PRECEDENCE_OPERATION_STATES");
    }
    const firstExcessRows = records(stateSeven["rows"], "first excess rows");
    const reasonRows = records(
      stateSeven["reasonPrecedenceRows"],
      "reason precedence rows",
    );
    const globalAndConflictRows = records(
      stateTen["rows"],
      "global and conflict precedence rows",
    );
    expect(firstExcessRows).toHaveLength(4);
    expect(reasonRows).toHaveLength(6);
    expect(globalAndConflictRows).toHaveLength(14);
    const precedenceObservations: unknown[] = [];
    for (const row of [...firstExcessRows, ...reasonRows, ...globalAndConflictRows]) {
      const id = typeof row["id"] === "string"
        ? row["id"]
        : `T1-FIRST-EXCESS-${String(row["field"])}`;
      const input = operationInput(row["inputRecipe"], `${id}.inputRecipe`);
      const pair = runResolvePair(input, id);
      const expected = row["expectedRefusal"] ?? row["expectedWinner"];
      expectCanonicalEqual(pair.result, { ok: false, refusal: expected });
      precedenceObservations.push({
        id,
        result: normalizedResult(pair.result),
        evidence: pair.envelope.evidence,
      });
    }
    expect(precedenceObservations).toHaveLength(24);
    const firstExcessTailObservations: unknown[] = [];
    const firstExcessTailReadTrapObservations: unknown[] = [];
    for (const row of firstExcessRows) {
      const field = stringValue(row["field"], "first excess field") as ModifierArrayField;
      if (!MODIFIER_ARRAY_FIELDS.includes(field)) {
        throw new TypeError(`T1_FIRST_EXCESS_FIELD:${field}`);
      }
      const recipe = record(row["inputRecipe"], `${field}.inputRecipe`);
      const collection = values(recipe[field], `${field}.collection`);
      const tailSeed = collection[0];
      if (tailSeed === undefined) throw new Error(`T1_FIRST_EXCESS_TAIL:${field}`);
      const tailedRecipe = {
        ...structuredClone(recipe),
        [field]: [
          ...structuredClone(collection),
          structuredClone(tailSeed),
          structuredClone(tailSeed),
          structuredClone(tailSeed),
        ],
      };
      const input = operationInput(tailedRecipe, `${field}.tailedInputRecipe`);
      if (input.kind !== "parsed") {
        throw new TypeError(`T1_FIRST_EXCESS_CUSTOM_INPUT:${field}`);
      }
      const parsedInput = input;
      const pair = runResolvePair(input, `T1-FIRST-EXCESS-TAIL-${field}`);
      expectCanonicalEqual(pair.result, {
        ok: false,
        refusal: row["expectedRefusal"],
      });
      expectCanonicalEqual(pair.envelope.evidence, {
        inputDegreeRecordsVisited:
          numberValue(row["firstExcessIndex"], `${field}.firstExcessIndex`) + 1,
        formulaPhaseTransitions: 0,
        candidateDegreesObserved: 0,
        duplicateDegreesCanonicalized: 0,
        realizationsProduced: 0,
        spellingAttempts: 0,
        degreesProduced: 0,
        warningsProduced: 0,
        peakCandidateDegreeRecords: 0,
        termination: "formula-refusal",
      });
      const firstExcessIndex = numberValue(
        row["firstExcessIndex"],
        `${field}.firstExcessIndex`,
      );
      const publicReadTrap = firstExcessReadTrappedSource(
        parsedInput,
        field,
        firstExcessIndex,
        `${field}.public`,
      );
      const privateReadTrap = firstExcessReadTrappedSource(
        parsedInput,
        field,
        firstExcessIndex,
        `${field}.private`,
      );
      publicResolveExecutions += 1;
      const readTrappedResult = theory.resolveChord(publicReadTrap.source);
      privateResolveExecutions += 1;
      const readTrappedEnvelope = resolveChordWithEvidence(privateReadTrap.source);
      expectCanonicalEqual(readTrappedResult, pair.result);
      expectCanonicalEqual(readTrappedEnvelope, pair.envelope);
      const expectedReadCounts = Object.fromEntries(
        MODIFIER_ARRAY_FIELDS.map((candidateField, position) => {
          const decisivePosition = MODIFIER_ARRAY_FIELDS.indexOf(field);
          const expectedReads = candidateField === field
            ? firstExcessIndex + 1
            : position < decisivePosition
              ? parsedInput[candidateField].length
              : 0;
          return [candidateField, expectedReads];
        }),
      );
      expectCanonicalEqual(publicReadTrap.reads, expectedReadCounts);
      expectCanonicalEqual(privateReadTrap.reads, expectedReadCounts);
      const expectedRecordReads = (recordReads: typeof publicReadTrap.recordReads) =>
        Object.fromEntries(Object.keys(recordReads).map((readKey) => {
          const match = /^(extensions|additions|alterations)\[([0-9]+)\]$/.exec(readKey);
          if (match === null) throw new Error(`T1_RECORD_READ_KEY:${readKey}`);
          const candidateField = match[1] as ModifierArrayField;
          const index = Number(match[2]);
          const candidatePosition = MODIFIER_ARRAY_FIELDS.indexOf(candidateField);
          const decisivePosition = MODIFIER_ARRAY_FIELDS.indexOf(field);
          const shouldRead = candidatePosition < decisivePosition ||
            (candidateField === field && index <= firstExcessIndex);
          return [readKey, shouldRead ? { number: 1, alter: 1 } : { number: 0, alter: 0 }];
        }));
      expectCanonicalEqual(
        publicReadTrap.recordReads,
        expectedRecordReads(publicReadTrap.recordReads),
      );
      expectCanonicalEqual(
        privateReadTrap.recordReads,
        expectedRecordReads(privateReadTrap.recordReads),
      );
      expectCanonicalEqual(publicReadTrap.readState, {
        decisiveRecordFetched: true,
        decisiveReadComplete: true,
      });
      expectCanonicalEqual(privateReadTrap.readState, {
        decisiveRecordFetched: true,
        decisiveReadComplete: true,
      });
      firstExcessTailReadTrapObservations.push({
        field,
        firstExcessIndex,
        firstForbiddenIndexes: publicReadTrap.firstForbiddenIndexes,
        publicReads: publicReadTrap.reads,
        privateReads: privateReadTrap.reads,
        publicRecordReads: publicReadTrap.recordReads,
        privateRecordReads: privateReadTrap.recordReads,
        publicReadState: publicReadTrap.readState,
        privateReadState: privateReadTrap.readState,
        result: normalizedResult(readTrappedResult),
        evidence: readTrappedEnvelope.evidence,
      });
      firstExcessTailObservations.push({
        field,
        totalSourceItems: values(tailedRecipe[field], `${field}.tailedCollection`).length,
        firstExcessIndex: row["firstExcessIndex"],
        result: normalizedResult(pair.result),
        evidence: pair.envelope.evidence,
      });
    }
    expect(firstExcessTailObservations).toHaveLength(4);
    expect(firstExcessTailReadTrapObservations).toHaveLength(4);

    const evidenceObservations: unknown[] = [];
    const evidenceCountersById: Record<string, unknown> = {};
    const operationEvidenceDigests: Record<string, string> = {};
    const operationEvidenceRecords: Array<Readonly<{
      caseId: string;
      producer: typeof PRODUCTION_OBSERVATION_PRODUCER;
      payload: unknown;
      observationDigest: string;
    }>> = [];
    const operationEvidenceIds: string[] = [];
    const spellingState = operationById.get("T1-OPSTATE-001");
    const resolutionState = operationById.get("T1-OPSTATE-009");
    if (spellingState === undefined || resolutionState === undefined) {
      throw new Error("T1_EVIDENCE_OPERATION_STATES");
    }
    const spellingEvidenceRows = records(
      spellingState["evidenceRows"],
      "spelling evidence rows",
    );
    for (const row of spellingEvidenceRows) {
      const id = fixtureId(row);
      const input = record(row["input"], `${id}.input`);
      const root = structuredClone(record(input["root"], `${id}.root`)) as SpelledPitchClass;
      const degree = structuredClone(record(input["degree"], `${id}.degree`)) as ChordDegree;
      const pair = runSpellingPair(root, degree, id);
      const referenceId = stringValue(row["expectedResultRef"], `${id}.expectedResultRef`);
      const reference = spellingById.get(referenceId);
      if (reference === undefined) throw new Error(`T1_SPELL_REFERENCE:${referenceId}`);
      expectCanonicalEqual(pair.result, spellingExpectedResult(reference, input));
      expectCanonicalEqual(pair.envelope.evidence, row["expectedEvidence"]);
      operationEvidenceIds.push(id);
      evidenceCountersById[id] = pair.envelope.evidence;
      const payload = {
        id,
        result: pair.result,
        evidence: pair.envelope.evidence,
        expectedEvidence: row["expectedEvidence"],
      };
      const observationDigest = signedObservationDigest(id, payload);
      operationEvidenceDigests[id] = observationDigest;
      operationEvidenceRecords.push({
        caseId: id,
        producer: PRODUCTION_OBSERVATION_PRODUCER,
        payload: canonicalJsonValue(payload),
        observationDigest,
      });
      evidenceObservations.push({
        id,
        result: pair.result,
        evidence: pair.envelope.evidence,
      });
    }

    const resolutionEvidenceRows = records(
      resolutionState["rows"],
      "resolution evidence rows",
    );
    for (const row of resolutionEvidenceRows) {
      const id = fixtureId(row);
      const input = operationInput(row["inputRecipe"], `${id}.inputRecipe`);
      const pair = runResolvePair(input, id);
      expectCanonicalEqual(pair.envelope.evidence, row["expectedEvidence"]);
      if (row["expectedRefusal"] !== undefined) {
        expectCanonicalEqual(pair.result, {
          ok: false,
          refusal: row["expectedRefusal"],
        });
      }
      operationEvidenceIds.push(id);
      const payload = {
        id,
        result: normalizedResult(pair.result),
        evidence: pair.envelope.evidence,
        expectedEvidence: row["expectedEvidence"],
      };
      const observationDigest = signedObservationDigest(id, payload);
      operationEvidenceDigests[id] = observationDigest;
      operationEvidenceRecords.push({
        caseId: id,
        producer: PRODUCTION_OBSERVATION_PRODUCER,
        payload: canonicalJsonValue(payload),
        observationDigest,
      });
      evidenceCountersById[id] = pair.envelope.evidence;
      evidenceObservations.push({
        id,
        result: normalizedResult(pair.result),
        evidence: pair.envelope.evidence,
      });
    }
    expect(spellingEvidenceRows).toHaveLength(2);
    expect(resolutionEvidenceRows).toHaveLength(12);
    expect(operationEvidenceIds).toHaveLength(14);
    expect(evidenceObservations).toHaveLength(14);
    operationEvidenceRecords.sort(({ caseId: left }, { caseId: right }) =>
      left < right ? -1 : left > right ? 1 : 0);
    expect(operationEvidenceRecords.map(({ caseId }) => caseId)).toEqual(
      [...operationEvidenceIds].sort(),
    );

    const corpusDigests = {
      literalResults: sha256(literalObservations),
      customResults: sha256(customObservations),
      allRootResults: sha256(allRootObservations),
      familyStatePublicOutcomes: familyPublicDigest,
      publicDegreeSpellingOutcomes: publicDegreeSemanticDigest,
      precedenceResults: sha256(precedenceObservations),
      firstExcessTailResults: sha256(firstExcessTailObservations),
      firstExcessTailReadTraps: sha256(firstExcessTailReadTrapObservations),
      operationEvidence: sha256(evidenceObservations),
    };
    const combinedCorpusDigest = sha256(corpusDigests);
    const operationStateRows = records(
      operationFixture["cases"],
      "operation state cases",
    );
    expect(operationStateRows).toHaveLength(10);
    expect(operationStateRows.map(fixtureId)).toEqual(
      Array.from(
        { length: 10 },
        (_, index) => `T1-OPSTATE-${String(index + 1).padStart(3, "0")}`,
      ),
    );
    const fixtureInventory = productionFixtureHashes();
    expect(fixtureInventory.ids).toHaveLength(256);
    const payload = {
      schema: "changes.evidence.t1-production-conformance-observation.v1",
      producer: PRODUCTION_OBSERVATION_PRODUCER,
      fixtureCaseIds: fixtureInventory.ids,
      fixtureCaseHashes: fixtureInventory.hashes,
      counts: {
        literalCases: literalRows.length,
        customCases: customRows.length,
        allRootCells: allRootObservations.length,
        familyStates: familyPublicOutcomes.length,
        publicDegreeSpellingCells: publicDegreeCells.length,
        operationStateCases: operationStateRows.length,
        evidenceRows: resolutionEvidenceRows.length,
      },
      executionCounts: {
        customResolutionExecutions: customObservations.reduce<number>(
          (total, observation) => total +
            (record(observation, "custom observation")["executions"] === undefined
              ? 0
              : values(
                  record(observation, "custom observation")["executions"],
                  "custom executions",
                ).length),
          0,
        ),
        customDomainBoundaryCases: 1,
        firstExcessRows: firstExcessRows.length,
        reasonPrecedenceRows: reasonRows.length,
        globalAndConflictPrecedenceRows: globalAndConflictRows.length,
        precedenceRows: precedenceObservations.length,
        firstExcessTailRows: firstExcessTailObservations.length,
        firstExcessTailReadTrapRows: firstExcessTailReadTrapObservations.length,
        standaloneSpellingEvidenceRows: spellingEvidenceRows.length,
        resolutionEvidenceRows: resolutionEvidenceRows.length,
        operationEvidenceRows: evidenceObservations.length,
        publicResolveExecutions,
        privateResolveExecutions,
        publicSpellExecutions,
        privateSpellExecutions,
      },
      familyStateOutcomeCounts: familyOutcomeCounts,
      familyStateAcceptedRuleIdCounts: familyAcceptedRuleCounts,
      familyStateRefusalRuleIdCounts: familyRefusalRuleCounts,
      evidenceCounterMaxima: evidenceMaxima,
      evidenceCountersById,
      operationEvidenceIds,
      operationEvidenceDigests,
      operationEvidenceRecords,
      firstExcessTailReadTrapObservations,
      corpusDigests,
      combinedCorpusDigest,
      reviewedFamilyStatePublicOutcomeDigest:
        familyExpected["orderedPublicOutcomeSemanticSha256"],
      reviewedPublicDegreeSpellingDigest:
        publicDegreeExpected["orderedCellSemanticSha256"],
      status: "pass",
    };
    const observation = {
      ...payload,
      semanticDigest: sha256(payload),
    };
    console.log(`T1_EVIDENCE_OBSERVATION ${JSON.stringify(observation)}`);
  });
});
