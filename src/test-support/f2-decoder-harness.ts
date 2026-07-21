import {
  decodeDocumentShape,
  preflightDocumentImportBytes,
  type DocumentShapeDecodeResult,
} from "../domain";
import {
  decodeDocumentShapeWithEvidence,
  preflightDocumentImportBytesWithEvidence,
} from "../domain/document-decoder";
import type { DocumentDecoderEvidence } from "../domain/document-decoder-contract";
import {
  acyclicDescriptorFingerprint,
  cloneDescriptorTree,
  descriptorTreeEqual,
  hasContainerIdentityOverlap,
  isRecursivelyFrozen,
  ownFixtureValue,
  persistedDataEqual,
  requireFixtureArray,
  requireFixtureRecord,
  requireFixtureString,
  type ExpectedIssue,
  type FixtureRecord,
  type HarnessObservationCounters,
  type MaterializedFixtureCell,
} from "./f2-fixture-core";

export type F2CellProjection =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; errors: readonly ExpectedIssue[] }>;

export type F2CellRunObservation = Readonly<{
  caseId: string;
  cellId: string;
  projection: F2CellProjection;
  evidence: DocumentDecoderEvidence;
}>;

const DECODER_EVIDENCE_KEYS = Object.freeze([
  "bytesObserved",
  "maxDepthObserved",
  "recordsInspected",
  "arraysInspected",
  "scalarFieldsInspected",
  "descriptorReads",
  "arraySlotsRead",
  "collectionLengthsObserved",
  "sectionSlotsObserved",
  "maxMeasuresPerSectionObserved",
  "eventSlotsObserved",
  "maxPitchArraySlotsObserved",
  "sectionElementsSemanticallyDecoded",
  "measureElementsSemanticallyDecoded",
  "eventValuesSemanticallyDecoded",
  "pitchElementsSemanticallyDecoded",
  "sectionElementsCopied",
  "measureElementsCopied",
  "eventValuesCopied",
  "pitchElementsCopied",
  "candidateObjectsAllocated",
  "candidateArraysAllocated",
  "diagnosticCandidatesProduced",
  "idOccurrences",
  "idClusters",
  "idDuplicateWorkUnits",
  "timelineAdditions",
  "timelineTicksObserved",
] as const satisfies readonly (keyof DocumentDecoderEvidence)[]);

const OBSERVATION_KEYS = Object.freeze([
  "getterCallbacks",
  "propertyGetCallbacks",
  "prototypeCallbacks",
  "iteratorCallbacks",
  "toJSONCallbacks",
  "sourceMutations",
  "stateWrites",
] as const satisfies readonly (keyof HarnessObservationCounters)[]);

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function ownData(value: unknown, key: PropertyKey): unknown {
  if ((typeof value !== "object" || value === null) && typeof value !== "function") {
    throw new Error(`F2_HARNESS_CONTAINER:${String(key)}`);
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !("value" in descriptor)) {
    throw new Error(`F2_HARNESS_DATA:${String(key)}`);
  }
  return descriptor.value;
}

function ownKeysExactly(value: unknown, keys: readonly string[]): boolean {
  if (typeof value !== "object" || value === null) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function arrayEntries(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error("F2_HARNESS_ARRAY");
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) result.push(ownData(value, index));
  return result;
}

function checkPitchClass(value: unknown): boolean {
  return ownKeysExactly(value, ["step", "alter"]);
}

function checkPitch(value: unknown): boolean {
  return ownKeysExactly(value, ["step", "alter", "octave"]);
}

function checkBeat(value: unknown): boolean {
  return ownKeysExactly(value, ["numerator", "denominator"]);
}

function checkKey(value: unknown): boolean {
  return ownKeysExactly(value, ["tonic", "mode"]) && checkPitchClass(ownData(value, "tonic"));
}

function checkDegree(value: unknown): boolean {
  return ownKeysExactly(value, ["number", "alter"]);
}

function checkChord(value: unknown): boolean {
  const kind = ownData(value, "kind");
  if (kind === "parsed") {
    if (!ownKeysExactly(value, [
      "kind",
      "sourceText",
      "root",
      "triad",
      "sixth",
      "seventh",
      "extensions",
      "additions",
      "alterations",
      "omissions",
      "bass",
      "colorPolicy",
    ]) || !checkPitchClass(ownData(value, "root"))) return false;
    const sixth = ownData(value, "sixth");
    if (sixth !== null && !checkDegree(sixth)) return false;
    const bass = ownData(value, "bass");
    if (bass !== null && !checkPitchClass(bass)) return false;
    for (const field of ["extensions", "additions", "alterations"] as const) {
      if (!arrayEntries(ownData(value, field)).every(checkDegree)) return false;
    }
    return Array.isArray(ownData(value, "omissions"));
  }
  if (kind === "custom") {
    const bass = ownData(value, "bass");
    return ownKeysExactly(value, ["kind", "sourceText", "label", "pitchNames", "bass"]) &&
      arrayEntries(ownData(value, "pitchNames")).every(checkPitchClass) &&
      (bass === null || checkPitchClass(bass));
  }
  return false;
}

function checkVoicing(value: unknown): boolean {
  const mode = ownData(value, "mode");
  if (mode === "auto") {
    return ownKeysExactly(value, ["mode", "family", "voiceCount", "range", "bassPolicy"]) &&
      ownKeysExactly(ownData(value, "range"), ["lowMidi", "highMidi"]);
  }
  if (mode === "manual") {
    return ownKeysExactly(value, ["mode", "pitches", "bassPolicy"]) &&
      arrayEntries(ownData(value, "pitches")).every(checkPitch);
  }
  if (mode === "frozen") {
    return ownKeysExactly(value, ["mode", "pitches", "bassPolicy", "generatedBy"]) &&
      arrayEntries(ownData(value, "pitches")).every(checkPitch) &&
      ownKeysExactly(ownData(value, "generatedBy"), ["engineVersion", "family"]);
  }
  return false;
}

function checkCompletion(value: unknown): boolean {
  const kind = ownData(value, "kind");
  if (kind === "empty" || kind === "complete") return ownKeysExactly(value, ["kind"]);
  if (kind === "pickup" || kind === "incomplete") {
    return ownKeysExactly(value, ["kind", "expectedDuration", "reason"]) &&
      checkBeat(ownData(value, "expectedDuration"));
  }
  return false;
}

function checkEvent(value: unknown): boolean {
  return ownKeysExactly(value, ["id", "duration", "annotation", "chord", "voicing"]) &&
    checkBeat(ownData(value, "duration")) &&
    checkChord(ownData(value, "chord")) &&
    checkVoicing(ownData(value, "voicing"));
}

function checkMeasure(value: unknown): boolean {
  return ownKeysExactly(value, ["id", "events", "completion"]) &&
    arrayEntries(ownData(value, "events")).every(checkEvent) &&
    checkCompletion(ownData(value, "completion"));
}

function checkSection(value: unknown): boolean {
  const keyOverride = ownData(value, "keyOverride");
  return ownKeysExactly(value, [
    "id",
    "name",
    "annotation",
    "keyOverride",
    "voiceLeadingBoundary",
    "measures",
  ]) &&
    (keyOverride === null || checkKey(keyOverride)) &&
    arrayEntries(ownData(value, "measures")).every(checkMeasure);
}

function canonicalDocumentOrder(value: unknown): boolean {
  if (!ownKeysExactly(value, [
    "schema",
    "id",
    "title",
    "description",
    "meter",
    "tempoBpm",
    "key",
    "sections",
    "playback",
  ])) return false;
  const key = ownData(value, "key");
  return ownKeysExactly(ownData(value, "meter"), ["beatsPerBar", "beatUnit"]) &&
    (key === null || checkKey(key)) &&
    arrayEntries(ownData(value, "sections")).every(checkSection) &&
    ownKeysExactly(
      ownData(value, "playback"),
      ["instrumentId", "masterVolume", "reverbAmount", "countInBars"],
    );
}

function issueProjection(result: unknown): F2CellProjection {
  const record = requireFixtureRecord(result, "decoder result");
  const ok = ownFixtureValue(record, "ok");
  if (ok === true) return { ok: true };
  invariant(ok === false, "F2_RESULT_OK_BOOLEAN");
  return {
    ok: false,
    errors: requireFixtureArray(ownFixtureValue(record, "errors"), "result.errors")
      .map((issueValue) => {
        const issueRecord = requireFixtureRecord(issueValue, "decoder issue");
        return {
          code: requireFixtureString(ownFixtureValue(issueRecord, "code"), "issue.code"),
          path: requireFixtureArray(ownFixtureValue(issueRecord, "path"), "issue.path")
            .map((segment) => {
              invariant(
                typeof segment === "string" || typeof segment === "number",
                "F2_ISSUE_PATH_SEGMENT",
              );
              return segment;
            }),
        };
      }),
  };
}

function validateExpected(
  cell: MaterializedFixtureCell,
  projection: F2CellProjection,
): void {
  invariant(projection.ok === cell.expectedOk, `${cell.cellId}:F2_EXPECTED_OK`);
  if (!projection.ok) {
    invariant(cell.expectedIssues !== undefined, `${cell.cellId}:F2_EXPECTED_ISSUES_MISSING`);
    invariant(
      persistedDataEqual(projection.errors, cell.expectedIssues),
      `${cell.cellId}:F2_ISSUE_CODE_PATH_MISMATCH`,
    );
  }
}

function validateIssueRecords(cell: MaterializedFixtureCell, result: FixtureRecord): void {
  const errors = requireFixtureArray(ownFixtureValue(result, "errors"), "errors");
  invariant(errors.length > 0, `${cell.cellId}:F2_EMPTY_ERRORS`);
  invariant(Object.isFrozen(errors), `${cell.cellId}:F2_ERRORS_NOT_FROZEN`);
  for (const issueValue of errors) {
    const issueRecord = requireFixtureRecord(issueValue, "issue");
    invariant(
      ownKeysExactly(issueRecord, ["code", "message", "path"]),
      `${cell.cellId}:F2_ISSUE_KEYS`,
    );
    invariant(Object.isFrozen(issueRecord), `${cell.cellId}:F2_ISSUE_NOT_FROZEN`);
    const message = requireFixtureString(ownFixtureValue(issueRecord, "message"), "message");
    invariant(message.trim().length > 0, `${cell.cellId}:F2_MESSAGE_BLANK`);
    invariant(!message.includes("LEAK SENTINEL 6f6f1e5a"), `${cell.cellId}:F2_MESSAGE_LEAK`);
    invariant(!message.includes("LEAK-UNKNOWN-KEY-a49e7d2c"), `${cell.cellId}:F2_KEY_LEAK`);
    invariant(!message.includes("LEAK-UNKNOWN-VALUE-b177f1c4"), `${cell.cellId}:F2_VALUE_LEAK`);
    const path = requireFixtureArray(ownFixtureValue(issueRecord, "path"), "issue.path");
    invariant(Object.isFrozen(path), `${cell.cellId}:F2_PATH_NOT_FROZEN`);
  }
}

function validateResult(
  cell: MaterializedFixtureCell,
  input: unknown,
  resultValue: unknown,
): F2CellProjection {
  const result = requireFixtureRecord(resultValue, "result");
  invariant(Object.isFrozen(result), `${cell.cellId}:F2_RESULT_NOT_FROZEN`);
  const projection = issueProjection(result);
  validateExpected(cell, projection);
  if (projection.ok) {
    invariant(
      [...Object.keys(result)].sort().join("|") === "ok|value|warnings",
      `${cell.cellId}:F2_SUCCESS_KEYS`,
    );
    const warnings = requireFixtureArray(ownFixtureValue(result, "warnings"), "warnings");
    invariant(warnings.length === 0, `${cell.cellId}:F2_WARNINGS_NONEMPTY`);
    invariant(Object.isFrozen(warnings), `${cell.cellId}:F2_WARNINGS_NOT_FROZEN`);
    const value = ownFixtureValue(result, "value");
    invariant(isRecursivelyFrozen(value), `${cell.cellId}:F2_VALUE_NOT_FROZEN`);
    if (cell.operation === "decodeDocumentShape") {
      invariant(!hasContainerIdentityOverlap(input, value), `${cell.cellId}:F2_INPUT_ALIAS`);
      invariant(persistedDataEqual(input, value), `${cell.cellId}:F2_PERSISTED_ROUND_TRIP`);
      invariant(canonicalDocumentOrder(value), `${cell.cellId}:F2_CANONICAL_FIELD_ORDER`);
    } else {
      invariant(
        Object.is(ownData(value, "utf8ByteLength"), input),
        `${cell.cellId}:F2_BYTE_VALUE_CHANGED`,
      );
    }
  } else {
    invariant(
      [...Object.keys(result)].sort().join("|") === "errors|ok",
      `${cell.cellId}:F2_FAILURE_KEYS`,
    );
    validateIssueRecords(cell, result);
  }
  return projection;
}

function validateObservations(
  cell: MaterializedFixtureCell,
  observations: HarnessObservationCounters,
): void {
  for (const key of OBSERVATION_KEYS) {
    invariant(observations[key] === 0, `${cell.cellId}:F2_OBSERVATION_${key}`);
  }
}

function validateEvidence(
  cell: MaterializedFixtureCell,
  evidenceValue: unknown,
): DocumentDecoderEvidence {
  const evidence = requireFixtureRecord(evidenceValue, "evidence");
  invariant(Object.isFrozen(evidence), `${cell.cellId}:F2_EVIDENCE_NOT_FROZEN`);
  invariant(
    Object.keys(evidence).length === DECODER_EVIDENCE_KEYS.length &&
      Object.keys(evidence).every((key, index) => key === DECODER_EVIDENCE_KEYS[index]),
    `${cell.cellId}:F2_EVIDENCE_KEYS`,
  );
  if (cell.expectedEvidence !== undefined) {
    for (const [key, expected] of Object.entries(cell.expectedEvidence)) {
      invariant(
        ownFixtureValue(evidence, key) === expected,
        `${cell.cellId}:F2_EVIDENCE_${key}`,
      );
    }
  }
  return evidence as DocumentDecoderEvidence;
}

function runPublic(cell: MaterializedFixtureCell, input: unknown): unknown {
  if (cell.operation === "decodeDocumentShape") return decodeDocumentShape(input);
  return preflightDocumentImportBytes(input as number);
}

function runPrivate(
  cell: MaterializedFixtureCell,
  input: unknown,
): Readonly<{ result: unknown; evidence: unknown }> {
  if (cell.operation === "decodeDocumentShape") return decodeDocumentShapeWithEvidence(input);
  return preflightDocumentImportBytesWithEvidence(input as number);
}

type InputSnapshot =
  | Readonly<{ kind: "clone"; value: unknown }>
  | Readonly<{ kind: "fingerprint"; value: string }>;

function usesStreamingSnapshot(cell: MaterializedFixtureCell): boolean {
  return /^F2-LIMIT-00[5-9]$/.test(cell.caseId) || cell.caseId === "F2-LIMIT-010";
}

function safeSnapshot(
  cell: MaterializedFixtureCell,
  input: unknown,
): InputSnapshot | undefined {
  try {
    return usesStreamingSnapshot(cell)
      ? { kind: "fingerprint", value: acyclicDescriptorFingerprint(input) }
      : { kind: "clone", value: cloneDescriptorTree(input) };
  } catch {
    return undefined;
  }
}

function safeIdentityOverlap(left: unknown, right: unknown): boolean | undefined {
  try {
    return hasContainerIdentityOverlap(left, right);
  } catch {
    return undefined;
  }
}

function assertInputUnchanged(
  cell: MaterializedFixtureCell,
  snapshot: InputSnapshot | undefined,
  input: unknown,
): void {
  if (snapshot === undefined) return;
  let unchanged: boolean;
  try {
    unchanged = snapshot.kind === "clone"
      ? descriptorTreeEqual(snapshot.value, input)
      : snapshot.value === acyclicDescriptorFingerprint(input);
  } catch {
    return;
  }
  invariant(unchanged, `${cell.cellId}:F2_INPUT_MUTATED`);
}

export function runF2FixtureCell(
  cell: MaterializedFixtureCell,
  collectGarbage?: () => void,
): F2CellRunObservation {
  const retainFullGraphs = cell.caseId === "F2-FRESH-001";
  const seenInputRoots = new WeakSet();
  const retainedInputs: unknown[] = [];
  const retainedResults: unknown[] = [];
  const failureResults: unknown[] = [];
  const projections: F2CellProjection[] = [];
  const privateEvidence: DocumentDecoderEvidence[] = [];

  for (let callIndex = 0; callIndex < 4; callIndex += 1) {
    if (usesStreamingSnapshot(cell) && collectGarbage !== undefined) {
      collectGarbage();
    }
    const created = cell.createInput();
    if (typeof created.input === "object" && created.input !== null) {
      invariant(!seenInputRoots.has(created.input), `${cell.cellId}:F2_FACTORY_ROOT_REUSED`);
      seenInputRoots.add(created.input);
    }
    const snapshot = safeSnapshot(cell, created.input);
    const privateCall = callIndex % 2 === 1;
    const privateResult = privateCall ? runPrivate(cell, created.input) : undefined;
    const result = privateResult === undefined
      ? runPublic(cell, created.input)
      : privateResult.result;
    const projection = validateResult(cell, created.input, result);
    projections.push(projection);
    validateObservations(cell, created.observations);
    assertInputUnchanged(cell, snapshot, created.input);
    if (privateResult !== undefined) {
      privateEvidence.push(validateEvidence(cell, privateResult.evidence));
    }
    if (!projection.ok) failureResults.push(cloneDescriptorTree(result));
    if (retainFullGraphs) {
      retainedInputs.push(created.input);
      retainedResults.push(result);
    }
    if (callIndex === 0 && cell.verify !== undefined) {
      cell.verify(created.input, result);
    }
  }

  for (let index = 1; index < failureResults.length; index += 1) {
    invariant(
      descriptorTreeEqual(failureResults[0], failureResults[index]),
      `${cell.cellId}:F2_FAILURE_RESULT_PARITY`,
    );
  }
  if (retainFullGraphs) {
    for (let left = 0; left < retainedInputs.length; left += 1) {
      for (let right = left + 1; right < retainedInputs.length; right += 1) {
        const overlap = safeIdentityOverlap(retainedInputs[left], retainedInputs[right]);
        invariant(overlap === undefined || !overlap, `${cell.cellId}:F2_FACTORY_ALIAS`);
        invariant(
          descriptorTreeEqual(retainedResults[left], retainedResults[right]),
          `${cell.cellId}:F2_PUBLIC_PRIVATE_PARITY`,
        );
        invariant(
          !hasContainerIdentityOverlap(retainedResults[left], retainedResults[right]),
          `${cell.cellId}:F2_RESULT_REUSED`,
        );
      }
    }
  }
  const firstEvidence = privateEvidence[0];
  const secondEvidence = privateEvidence[1];
  invariant(firstEvidence !== undefined && secondEvidence !== undefined, `${cell.cellId}:F2_EVIDENCE_CALLS`);
  invariant(
    descriptorTreeEqual(firstEvidence, secondEvidence),
    `${cell.cellId}:F2_EVIDENCE_NONDETERMINISTIC`,
  );
  invariant(
    persistedDataEqual(projections[0], projections[1]) &&
      persistedDataEqual(projections[0], projections[2]) &&
      persistedDataEqual(projections[0], projections[3]),
    `${cell.cellId}:F2_PROJECTION_NONDETERMINISTIC`,
  );
  const firstProjection = projections[0];
  invariant(firstProjection !== undefined, `${cell.cellId}:F2_FIRST_PROJECTION`);
  if (usesStreamingSnapshot(cell) && collectGarbage !== undefined) {
    collectGarbage();
  }
  return {
    caseId: cell.caseId,
    cellId: cell.cellId,
    projection: firstProjection,
    evidence: firstEvidence,
  };
}

export function groupF2CaseProjections(
  observations: readonly F2CellRunObservation[],
): ReadonlyMap<string, Readonly<{ cells: readonly F2CellProjection[] }>> {
  const grouped = new Map<string, F2CellProjection[]>();
  for (const observation of observations) {
    const cells = grouped.get(observation.caseId) ?? [];
    cells.push(observation.projection);
    grouped.set(observation.caseId, cells);
  }
  return new Map(
    [...grouped].map(([caseId, cells]) => [caseId, { cells }] as const),
  );
}

export function publicDecoderTypeWitness(
  result: DocumentShapeDecodeResult,
): DocumentShapeDecodeResult {
  return result;
}
