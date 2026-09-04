import type { ChordDegree, SpelledPitchClass } from "../domain";
import {
  H0_ANALYSIS_EVIDENCE_POLICY_ID,
  H0_ANALYSIS_EVIDENCE_POLICY_VERSION,
  H0_ANALYSIS_RULE_TABLE_ID,
  H0_ANALYSIS_RULE_TABLE_VERSION,
  H0_EXACT_WEIGHT_POLICY_ID,
  H0_EXACT_WEIGHT_POLICY_VERSION,
  H0_LITERAL_FACTS_RESULT_SCHEMA,
  MAX_H0_BASE_REVISION,
  MAX_H0_DEGREES_PER_REALIZATION,
  MAX_H0_MATCH_COMPONENTS,
  MAX_H0_REQUEST_ID_ASCII_LENGTH,
  MAX_H0_TRACKED_RECORDS,
  MIN_H0_BASE_REVISION,
  type H0BoundedNonEmptyTuple,
  type H0BoundedTuple,
  type H0LiteralFactsRequest,
  type H0LiteralFactsRequestRefusal,
  type H0LiteralFactsResult,
  type H0MatchComponent,
  type H0SelectedRealizationId,
} from "./analysis-contract";
import {
  CHORD_FORMULA_TABLE_ID,
  CHORD_FORMULA_TABLE_VERSION,
  DEGREE_ROLE_POLICY_ID,
  DEGREE_ROLE_POLICY_VERSION,
  DEGREE_SPELLING_POLICY_ID,
  DEGREE_SPELLING_POLICY_VERSION,
  RESOLVED_CHORD_SCHEMA,
  type IndexAlignedTuple,
  type ResolvedChord,
} from "./resolution-contract";

const POLICIES = Object.freeze({
  schema: H0_LITERAL_FACTS_RESULT_SCHEMA,
  analysisRuleTableId: H0_ANALYSIS_RULE_TABLE_ID,
  analysisRuleTableVersion: H0_ANALYSIS_RULE_TABLE_VERSION,
  evidencePolicyId: H0_ANALYSIS_EVIDENCE_POLICY_ID,
  evidencePolicyVersion: H0_ANALYSIS_EVIDENCE_POLICY_VERSION,
  exactWeightPolicyId: H0_EXACT_WEIGHT_POLICY_ID,
  exactWeightPolicyVersion: H0_EXACT_WEIGHT_POLICY_VERSION,
});

const EMPTY_INPUT_EVIDENCE = Object.freeze({
  t1ResolutionsVisited: 0,
  selectedRealizationDegreesVisited: 0,
  degreeComparisons: 0,
  emittedRecords: 0,
  peakTrackedRecords: 0,
  termination: "input-refusal" as const,
});

function inputRefusal(refusal: H0LiteralFactsRequestRefusal): H0LiteralFactsResult {
  return Object.freeze({ ok: false, refusal: Object.freeze(refusal), evidence: EMPTY_INPUT_EVIDENCE });
}

function snapshotPitch(pitch: SpelledPitchClass): SpelledPitchClass {
  return Object.freeze({ step: pitch.step, alter: pitch.alter });
}

function snapshotDegree(degree: ChordDegree): ChordDegree {
  return Object.freeze({ number: degree.number, alter: degree.alter });
}

/** Array.map preserves every index and tuple length; it never filters. */
function snapshotTuple<T extends readonly unknown[], U>(
  values: T,
  copy: (value: T[number], index: number) => U,
): IndexAlignedTuple<T, U> {
  return Object.freeze(values.map(copy)) as IndexAlignedTuple<T, U>;
}

function bounded<T>(values: readonly T[]): values is H0BoundedTuple<T, 16> {
  return values.length <= MAX_H0_DEGREES_PER_REALIZATION;
}

function nonEmpty<T>(values: readonly T[]): values is H0BoundedNonEmptyTuple<T, 16> {
  return values.length > 0 && bounded(values);
}

function availableIds(source: ResolvedChord): H0BoundedNonEmptyTuple<H0SelectedRealizationId, 4> {
  // The public T1 tuple has exactly one or four entries. Mapping preserves it.
  return snapshotTuple(source.realizations, (realization) => realization.id);
}

function upstreamRefusal(source: ResolvedChord): H0LiteralFactsRequestRefusal | null {
  if (differentPin(source.schema, RESOLVED_CHORD_SCHEMA)) {
    return {
      code: "harmony.upstream_contract_version_unsupported", path: Object.freeze(["source", "schema"]),
      position: "source", component: "resolved-chord-schema",
      expectedId: RESOLVED_CHORD_SCHEMA, expectedVersion: null,
      receivedId: source.schema, receivedVersion: null,
    };
  }
  const pins = [
    { component: "formula-table", idField: "formulaTableId", versionField: "formulaTableVersion", id: CHORD_FORMULA_TABLE_ID, version: CHORD_FORMULA_TABLE_VERSION },
    { component: "degree-spelling-policy", idField: "degreeSpellingPolicyId", versionField: "degreeSpellingPolicyVersion", id: DEGREE_SPELLING_POLICY_ID, version: DEGREE_SPELLING_POLICY_VERSION },
    { component: "degree-role-policy", idField: "degreeRolePolicyId", versionField: "degreeRolePolicyVersion", id: DEGREE_ROLE_POLICY_ID, version: DEGREE_ROLE_POLICY_VERSION },
  ] as const;
  for (const pin of pins) {
    if (differentPin(source[pin.idField], pin.id) || differentPin(source[pin.versionField], pin.version)) {
      return {
        code: "harmony.upstream_contract_version_unsupported",
        path: Object.freeze(["source", differentPin(source[pin.idField], pin.id) ? pin.idField : pin.versionField]),
        position: "source", component: pin.component, expectedId: pin.id, expectedVersion: pin.version,
        receivedId: source[pin.idField], receivedVersion: source[pin.versionField],
      };
    }
  }
  return null;
}

// The public T1 type pins literals; runtime inputs still require pin checks.
function differentPin(received: string | number, expected: string | number): boolean {
  return received !== expected;
}

function matchComponent(degree: ChordDegree, spelling: SpelledPitchClass, suspension: 2 | 4 | null): H0MatchComponent {
  const kind = degree.number === 1 ? "root"
    : degree.number === 3 || degree.number === suspension ? "third-or-suspension"
      : degree.number === 7 ? "seventh" : degree.number === 5 ? "fifth" : "color";
  const weight = kind === "root" || kind === "third-or-suspension" || kind === "seventh" ? 2 : 1;
  return Object.freeze({
    kind, weight, matchedWeight: weight, expectedDegree: degree, observedDegree: degree,
    expectedSpelling: spelling, observedSpelling: spelling, spellingAgreement: "exact",
  });
}

/** Count semantic input slots, conservatively counting repeated role references. */
function inputRecords(source: ResolvedChord): number {
  const spec = source.source;
  const sourceRecords = spec.kind === "custom" ? 1 + spec.pitchNames.length + (spec.bass === null ? 0 : 1)
    : 2 + (spec.bass === null ? 0 : 1) + (spec.sixth === null ? 0 : 1) +
      spec.extensions.length + spec.additions.length + spec.alterations.length;
  return 1 + sourceRecords + (source.bass === null ? 0 : 1) + source.realizations.reduce((sum, realization) =>
    sum + 1 + realization.spelledPitchNames.length + (realization.kind === "custom" ? realization.limitations.length
      : realization.degrees.length + realization.requiredDegrees.length + realization.optionalDegrees.length + realization.guideToneDegrees.length), 0);
}

/**
 * Literal projection only: no interpretation, resolution, or key inference.
 * Work counts one exact comparison and one match component per selected degree.
 * Records count the literal, its rule reference, degree/role/pitch records, and
 * match components (or two Custom limitations). Scalar fields are not records.
 * The complete T1 input and immutable output coexist; peak counts both. The
 * checked degree and role caps give <= 100 output records, with no scratch
 * semantic objects surviving separately from that output. Nothing is
 * allocated proportional to an unchecked degree or role collection.
 */
export function deriveLiteralFacts(request: H0LiteralFactsRequest): H0LiteralFactsResult {
  const { requestId, baseRevision, source, selectedRealizationId } = request;
  if (requestId.length === 0 || requestId.length > MAX_H0_REQUEST_ID_ASCII_LENGTH ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(requestId)) {
    return inputRefusal({
      code: "harmony.request_id_invalid", path: Object.freeze(["requestId"]),
      reason: requestId.length === 0 ? "empty" : requestId.length > MAX_H0_REQUEST_ID_ASCII_LENGTH ? "too-long" : "non-ascii",
      maximum: MAX_H0_REQUEST_ID_ASCII_LENGTH,
    });
  }
  if (!Number.isSafeInteger(baseRevision) || baseRevision < MIN_H0_BASE_REVISION) {
    return inputRefusal({
      code: "harmony.base_revision_invalid", path: Object.freeze(["baseRevision"]), received: baseRevision,
      minimum: MIN_H0_BASE_REVISION, maximum: MAX_H0_BASE_REVISION,
    });
  }
  const versionRefusal = upstreamRefusal(source);
  if (versionRefusal !== null) return inputRefusal(versionRefusal);
  if (selectedRealizationId === null && source.realizations.length > 1) {
    return inputRefusal({
      code: "harmony.selected_realization_required", path: Object.freeze(["selectedRealizationId"]),
      position: "source", received: null,
    });
  }
  const selectedId = selectedRealizationId ?? source.realizations[0].id;
  const selectedIndex = source.realizations.findIndex((realization) => realization.id === selectedId);
  const selected = source.realizations[selectedIndex];
  if (selected === undefined) {
    return inputRefusal({
      code: "harmony.selected_realization_unknown", path: Object.freeze(["selectedRealizationId"]),
      position: "source", received: selectedId, available: availableIds(source),
    });
  }
  const degrees = selected.degrees;
  const count = degrees?.length ?? selected.spelledPitchNames.length;
  if (degrees !== null && degrees.length > MAX_H0_DEGREES_PER_REALIZATION) {
    return Object.freeze({
      ok: false,
      refusal: Object.freeze({
        code: "limit.harmony_evidence_records_exceeded", path: Object.freeze(["literalFacts", "matchComponents"]),
        field: "matchComponents", received: count, maximum: MAX_H0_MATCH_COMPONENTS,
      }),
      evidence: Object.freeze({ ...EMPTY_INPUT_EVIDENCE, t1ResolutionsVisited: 1, termination: "limit-refusal" }),
    });
  }
  const roleFields = ["requiredDegrees", "optionalDegrees", "guideToneDegrees"] as const;
  const roles = selected.kind === "semantic" ? roleFields.map((field) => selected[field]) : [];
  for (const field of roleFields) {
    const role = selected[field];
    if (role === null) continue;
    if (!bounded(role)) {
      return Object.freeze({
        ok: false,
        refusal: Object.freeze({
          code: "limit.harmony_work_exceeded", path: Object.freeze(["source", "realizations", selectedIndex, field]),
          field: "selectedRealizationDegrees", received: role.length, maximum: MAX_H0_DEGREES_PER_REALIZATION,
        }),
        evidence: Object.freeze({ ...EMPTY_INPUT_EVIDENCE, t1ResolutionsVisited: 1, termination: "limit-refusal" }),
      });
    }
  }
  if (count > MAX_H0_DEGREES_PER_REALIZATION) {
    return Object.freeze({
      ok: false,
      refusal: Object.freeze({
        code: "limit.harmony_work_exceeded", path: Object.freeze(["source", "realizations", selectedIndex, "spelledPitchNames"]),
        field: "selectedRealizationDegrees", received: count, maximum: MAX_H0_DEGREES_PER_REALIZATION,
      }),
      evidence: Object.freeze({ ...EMPTY_INPUT_EVIDENCE, t1ResolutionsVisited: 1, termination: "limit-refusal" }),
    });
  }
  const roleRecords = roles.reduce((sum, role) => sum + role.length, 0);
  const emittedRecords = (selected.kind === "custom" ? 4 + count : 3 + 3 * count + roleRecords) +
    (source.bass === null ? 0 : 1);
  const projectedRecords = emittedRecords + inputRecords(source);
  if (projectedRecords > MAX_H0_TRACKED_RECORDS) {
    return Object.freeze({
      ok: false,
      refusal: Object.freeze({
        code: "limit.harmony_work_exceeded", path: Object.freeze(["evidence", "peakTrackedRecords"]),
        field: "trackedRecords", received: projectedRecords, maximum: MAX_H0_TRACKED_RECORDS,
      }),
      evidence: Object.freeze({ ...EMPTY_INPUT_EVIDENCE, t1ResolutionsVisited: 1, termination: "limit-refusal" }),
    });
  }
  const bass = source.bass === null ? null : snapshotPitch(source.bass);
  const base = { ...POLICIES, requestId, baseRevision };
  if (selected.kind === "custom") {
    const limitations = Object.freeze([
      Object.freeze({ code: "custom.no_degree_analysis" as const, detail: "Custom pitches have no declared root or degree roles." }),
      Object.freeze({ code: "custom.no_auto_voicing" as const, detail: "Custom pitches preserve their exact supplied order and duplicates." }),
    ] as const);
    const literalFacts = Object.freeze({
      kind: "literal", ruleId: "h0.literal-facts", contextIndependent: true,
      applicability: "not-applicable", selectedRealizationId: "custom", root: null, bass,
      degrees: null, requiredDegrees: null, optionalDegrees: null, guideToneDegrees: null,
      spelledPitchNames: snapshotTuple(selected.spelledPitchNames, snapshotPitch),
      pitchClasses: snapshotTuple(selected.pitchClasses, (pitch) => pitch),
      match: null, matchComponents: Object.freeze([] as const), limitations,
    } as const);
    return Object.freeze({
      ok: true, value: Object.freeze({ ...base, disposition: "not-applicable", literalFacts, limitations }),
      evidence: Object.freeze({ t1ResolutionsVisited: 1, selectedRealizationDegreesVisited: 0,
        degreeComparisons: 0, emittedRecords, peakTrackedRecords: projectedRecords, termination: "complete" }),
    });
  }
  // T1 correlates semantic realizations with parsed sources; no new theory is
  // inferred from the label. Runtime guards below also narrow the public caps.
  if (source.source.kind !== "parsed" || degrees === null || !nonEmpty(degrees) ||
      !bounded(selected.requiredDegrees) || !bounded(selected.optionalDegrees) || !bounded(selected.guideToneDegrees)) {
    throw new Error("Invalid T1 resolved-chord invariant");
  }
  const copiedDegrees = snapshotTuple(degrees, snapshotDegree);
  // T1 guarantees index alignment. Each spelling is copied separately from the
  // source and then shared only between immutable output records.
  const spelledPitchNames = snapshotTuple(copiedDegrees, (_degree, index) => {
    const pitch = selected.spelledPitchNames[index];
    if (pitch === undefined) throw new Error("Invalid T1 spelling tuple");
    return snapshotPitch(pitch);
  });
  const pitchClasses = snapshotTuple(copiedDegrees, (_degree, index) => {
    const pitch = selected.pitchClasses[index];
    if (pitch === undefined) throw new Error("Invalid T1 pitch-class tuple");
    return pitch;
  });
  const suspension = source.source.triad === "sus2" ? 2 : source.source.triad === "sus4" ? 4 : null;
  const components = snapshotTuple(copiedDegrees, (degree, index) => {
    const spelling = spelledPitchNames[index];
    if (spelling === undefined) throw new Error("Invalid T1 degree/spelling alignment");
    return matchComponent(degree, spelling, suspension);
  });
  const weight = components.reduce((sum, component) => sum + component.weight, 0);
  const literalFacts = Object.freeze({
    kind: "literal", ruleId: "h0.literal-facts", contextIndependent: true,
    applicability: "applicable", selectedRealizationId: selected.id,
    root: snapshotPitch(source.source.root), bass, degrees: copiedDegrees,
    requiredDegrees: snapshotTuple(selected.requiredDegrees, snapshotDegree),
    optionalDegrees: snapshotTuple(selected.optionalDegrees, snapshotDegree),
    guideToneDegrees: snapshotTuple(selected.guideToneDegrees, snapshotDegree),
    spelledPitchNames, pitchClasses, match: Object.freeze({ numerator: weight, denominator: weight }),
    matchComponents: components, limitations: Object.freeze([] as const),
  } as const);
  return Object.freeze({
    ok: true, value: Object.freeze({ ...base, disposition: "classified", literalFacts, limitations: literalFacts.limitations }),
    evidence: Object.freeze({ t1ResolutionsVisited: 1, selectedRealizationDegreesVisited: count,
      degreeComparisons: count, emittedRecords,
      peakTrackedRecords: projectedRecords,
      termination: "complete" }),
  });
}
