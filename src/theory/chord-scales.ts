import {
  pitchClassOf,
  type ChordDegree,
  type ChordEventId,
  type KeyContext,
  type PitchClass,
  type SpelledPitchClass,
} from "../domain";
import { deriveLiteralFacts, h0UpstreamRefusal } from "./analysis";
import {
  H0_ANALYSIS_EVIDENCE_POLICY_ID,
  H0_ANALYSIS_EVIDENCE_POLICY_VERSION,
  H0_ANALYSIS_ORDER_POLICY_ID,
  H0_ANALYSIS_ORDER_POLICY_VERSION,
  H0_ANALYSIS_RULE_TABLE_ID,
  H0_ANALYSIS_RULE_TABLE_VERSION,
  H0_EVIDENCE_TIER_RANKS,
  H0_EXACT_WEIGHT_POLICY_ID,
  H0_EXACT_WEIGHT_POLICY_VERSION,
  MAX_H0_BASE_REVISION,
  MAX_H0_CLASHES_PER_SCALE,
  MAX_H0_DEGREE_COMPARISONS,
  MAX_H0_EMITTED_RECORDS,
  MAX_H0_EXCEPTIONS_PER_SCALE,
  MAX_H0_REQUEST_ID_ASCII_LENGTH,
  MAX_H0_SCALE_DEGREES,
  MAX_H0_SCALE_OPTIONS,
  MAX_H0_TENSIONS_PER_SCALE,
  MAX_H0_TRACKED_RECORDS,
  MIN_H0_BASE_REVISION,
  type H0AnalysisRuleId,
  type H0BoundedAtLeastTwoTuple,
  type H0BoundedNonEmptyTuple,
  type H0BoundedTuple,
  type H0ContextEvent,
  type H0ContextPosition,
  type H0EvidenceRecord,
  type H0EvidenceTier,
  type H0Limitation,
  type H0LiteralFacts,
  type H0MatchComponent,
  type H0MissingEvidence,
  type H0SelectedRealizationId,
} from "./analysis-contract";
import {
  H0_CHORD_SCALE_CONTAINMENT_POLICY_ID,
  H0_CHORD_SCALE_CONTAINMENT_POLICY_VERSION,
  H0_CHORD_SCALE_FAMILY_RANKS,
  H0_CHORD_SCALE_MAPPING_TABLE_ID,
  H0_CHORD_SCALE_MAPPING_TABLE_VERSION,
  H0_CHORD_SCALE_RESULT_SCHEMA,
  H0_DECLARED_SCALE_CONTEXT_KINDS,
  type EnumerateChordScaleOptions,
  type H0ChordScaleException,
  type H0ChordScaleFamily,
  type H0ChordScaleMappingId,
  type H0ChordScaleOption,
  type H0ChordScaleLimitRefusal,
  type H0ChordScaleRequestRefusal,
  type H0ChordScaleRequest,
  type H0ChordScaleResult,
  type H0ChordScaleTension,
  type H0ChordScaleWorkEvidence,
  type H0DeclaredScaleContext,
  type H0MinorNinthClash,
  type H0ScaleExceptionId,
} from "./chord-scales-contract";
import { spellChordDegree } from "./degree-spelling";

/**
 * H0 chord-scale options (docs/H0_CONTEXT_HARMONY_CONTRACT.md §10–§14).
 *
 * Thirteen mapping rows are evaluated in table order against the selected T1
 * realization only. Each row's required and forbidden degrees and its
 * degree-class containment are hard gates: failing one eliminates the row.
 * Its context premise then decides the tier: satisfied gives `exact`; absent
 * (no key, no caller declaration) gives `plausible` with the missing evidence
 * named; contradicted by the supplied key eliminates the row. Surviving rows
 * are plural options in the frozen (tier, family, rule ID, option ID) order,
 * never a single "best" scale.
 *
 * Containment is by exact degree class: 9≡2, 11≡4 and 13≡6 with the same
 * alteration. `#9` never matches `b3`, `#5` never `b13`, `bb7` never `6`.
 */

type Token = string;
type Premise =
  | "literal"
  | "ionian-tonic"
  | "lydian-sharp-four"
  | "altered-selected"
  | "diminished-dominant"
  | "dorian"
  | "melodic-minor"
  | "locrian-flat-nine"
  | "locrian-natural-nine";

type MappingRow = Readonly<{
  id: H0ChordScaleMappingId;
  family: H0ChordScaleFamily;
  scaleDegrees: readonly Token[];
  required: readonly Token[];
  forbidden: readonly Token[];
  available: readonly Token[];
  clashes: readonly Readonly<{ tension: Token; chordTone: Token }>[];
  exceptions: readonly Readonly<{ id: H0ScaleExceptionId; degree: Token; treatment: string }>[];
  premise: Premise;
}>;

/** The normative table of §10, in evaluation order. */
const MAPPINGS: readonly MappingRow[] = Object.freeze([
  { id: "h0.scale.ionian", family: "ionian", scaleDegrees: ["1", "2", "3", "4", "5", "6", "7"],
    required: ["1", "3", "5"], forbidden: ["#11"], available: ["9", "13"],
    clashes: [{ tension: "11", chordTone: "3" }], exceptions: [], premise: "ionian-tonic" },
  { id: "h0.scale.lydian", family: "lydian", scaleDegrees: ["1", "2", "3", "#4", "5", "6", "7"],
    required: ["1", "3", "5", "7"], forbidden: ["11"], available: ["9", "#11", "13"],
    clashes: [], exceptions: [], premise: "lydian-sharp-four" },
  { id: "h0.scale.mixolydian", family: "mixolydian", scaleDegrees: ["1", "2", "3", "4", "5", "6", "b7"],
    required: ["1", "3", "5", "b7"], forbidden: ["#11", "b9", "#9", "b5", "#5"], available: ["9", "13"],
    clashes: [{ tension: "11", chordTone: "3" }], exceptions: [], premise: "literal" },
  { id: "h0.scale.lydian-dominant", family: "lydian-dominant", scaleDegrees: ["1", "2", "3", "#4", "5", "6", "b7"],
    required: ["1", "3", "5", "b7", "#11"], forbidden: ["11"], available: ["9", "#11", "13"],
    clashes: [], exceptions: [], premise: "literal" },
  { id: "h0.scale.altered", family: "altered", scaleDegrees: ["1", "b2", "#2", "3", "b5", "#5", "b7"],
    required: ["1", "3", "b7"], forbidden: ["5", "9", "11", "13"], available: ["b9", "#9", "b5", "#5"],
    clashes: [{ tension: "b9", chordTone: "1" }],
    exceptions: [{ id: "altered-root-b9", degree: "b9",
      treatment: "The b9 stays a named altered tension; its minor ninth over the root remains visible." }],
    premise: "altered-selected" },
  { id: "h0.scale.whole-tone", family: "whole-tone", scaleDegrees: ["1", "2", "3", "#4", "#5", "b7"],
    required: ["1", "3", "#5", "b7"], forbidden: ["5", "b9", "#9", "11", "b13"], available: ["9", "#11"],
    clashes: [], exceptions: [], premise: "literal" },
  { id: "h0.scale.half-whole-diminished", family: "half-whole-diminished",
    scaleDegrees: ["1", "b2", "#2", "3", "#4", "5", "6", "b7"],
    required: ["1", "3", "5", "b7"], forbidden: ["b5", "#5"], available: ["b9", "#9", "#11", "13"],
    clashes: [{ tension: "b9", chordTone: "1" }],
    exceptions: [{ id: "diminished-dominant-b9", degree: "b9",
      treatment: "The b9 stays a named altered tension; its minor ninth over the root remains visible." }],
    premise: "diminished-dominant" },
  { id: "h0.scale.whole-half-diminished", family: "whole-half-diminished",
    scaleDegrees: ["1", "2", "b3", "4", "b5", "b6", "bb7", "7"],
    required: ["1", "b3", "b5", "bb7"], forbidden: ["b7", "6"], available: ["9", "11", "b13", "7"],
    clashes: [], exceptions: [], premise: "literal" },
  { id: "h0.scale.dorian", family: "dorian", scaleDegrees: ["1", "2", "b3", "4", "5", "6", "b7"],
    required: ["1", "b3", "5", "b7"], forbidden: ["b13", "7"], available: ["9", "11", "13"],
    clashes: [], exceptions: [], premise: "dorian" },
  { id: "h0.scale.melodic-minor", family: "melodic-minor", scaleDegrees: ["1", "2", "b3", "4", "5", "6", "7"],
    required: ["1", "b3", "5"], forbidden: ["b7", "b13"], available: ["9", "11", "13"],
    clashes: [], exceptions: [], premise: "melodic-minor" },
  { id: "h0.scale.locrian", family: "locrian", scaleDegrees: ["1", "b2", "b3", "4", "b5", "b6", "b7"],
    required: ["1", "b3", "b5", "b7"], forbidden: ["9"], available: ["b9", "11", "b13"],
    clashes: [{ tension: "b9", chordTone: "1" }],
    exceptions: [{ id: "locrian-root-b9", degree: "b9",
      treatment: "The b9 is a scale member whose minor ninth over the root is shown, not a universal avoid note." }],
    premise: "locrian-flat-nine" },
  { id: "h0.scale.locrian-natural-2", family: "locrian-natural-2", scaleDegrees: ["1", "2", "b3", "4", "b5", "b6", "b7"],
    required: ["1", "b3", "b5", "b7", "9"], forbidden: ["b9"], available: ["9", "11", "b13"],
    clashes: [], exceptions: [], premise: "locrian-natural-nine" },
  { id: "h0.scale.suspended-dominant", family: "mixolydian", scaleDegrees: ["1", "2", "4", "5", "6", "b7"],
    required: ["1", "4", "5", "b7"], forbidden: ["3"], available: ["9", "13"],
    clashes: [],
    exceptions: [{ id: "suspended-fourth-is-chord-tone", degree: "4",
      treatment: "Degree 4 is the suspended chord tone, not an avoided eleventh." }],
    premise: "literal" },
] as const satisfies readonly MappingRow[]);

const PROVENANCE = Object.freeze({
  authorityClass: "reviewed-project-contract" as const,
  authorityIds: Object.freeze(["H0-AUTH-PLAN"] as const),
  citationIds: Object.freeze(["docs/REBUILD_PLAN.md#114-chord-scales-and-tensions"] as const),
});

/** Scale degrees of the four persisted key modes, relative to the tonic. */
const KEY_MODE_DEGREES = Object.freeze({
  major: ["1", "2", "3", "4", "5", "6", "7"],
  "natural-minor": ["1", "2", "b3", "4", "5", "b6", "b7"],
  "harmonic-minor": ["1", "2", "b3", "4", "5", "b6", "7"],
  "melodic-minor": ["1", "2", "b3", "4", "5", "6", "7"],
} as const);

const DIATONIC_RULE = Object.freeze({
  major: "h0.roman.diatonic-major",
  "natural-minor": "h0.roman.diatonic-natural-minor",
  "harmonic-minor": "h0.roman.diatonic-harmonic-minor",
  "melodic-minor": "h0.roman.diatonic-melodic-minor",
} as const satisfies Readonly<Record<KeyContext["mode"], H0AnalysisRuleId>>);

const DEGREE_NUMBERS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 9, 11, 13] as const);
const ALTERATIONS = Object.freeze([-2, -1, 0, 1, 2] as const);

/** Parse one table token ("b7", "#11", "bb7"); the table is static, so a bad token is a programming error. */
function degreeOf(token: Token): ChordDegree {
  const match = /^(bb|b|##|#)?(\d+)$/.exec(token);
  const number = DEGREE_NUMBERS.find((candidate) => String(candidate) === match?.[2]);
  const accidental = match?.[1] ?? "";
  const alter = ALTERATIONS.find((candidate) =>
    candidate === (accidental === "bb" ? -2 : accidental === "b" ? -1 : accidental === "##" ? 2 : accidental === "#" ? 1 : 0));
  if (number === undefined || alter === undefined) throw new Error(`Invalid H0 degree token ${token}`);
  return Object.freeze({ number, alter });
}

/** The containment class of a degree: compound 9/11/13 fold to 2/4/6, alteration kept. */
function degreeClass(degree: ChordDegree): string {
  const simple = degree.number === 9 ? 2 : degree.number === 11 ? 4 : degree.number === 13 ? 6 : degree.number;
  return `${String(degree.alter)}:${String(simple)}`;
}

function sameSpelling(left: SpelledPitchClass, right: SpelledPitchClass): boolean {
  return left.step === right.step && left.alter === right.alter;
}

function spell(root: SpelledPitchClass, degree: ChordDegree): SpelledPitchClass | null {
  const spelled = spellChordDegree(root, degree);
  return spelled.ok ? Object.freeze({ step: spelled.value.spelled.step, alter: spelled.value.spelled.alter }) : null;
}

function isBounded<T, N extends number>(values: readonly T[], maximum: N): values is H0BoundedTuple<T, N> {
  return values.length <= maximum;
}
function isBoundedNonEmpty<T, N extends number>(values: readonly T[], maximum: N): values is H0BoundedNonEmptyTuple<T, N> {
  return values.length > 0 && values.length <= maximum;
}
function isAtLeastTwo<T, N extends number>(values: readonly T[], maximum: N): values is H0BoundedAtLeastTwoTuple<T, N> {
  return values.length >= 2 && values.length <= maximum;
}
function atLeastTwo<T, N extends number>(values: readonly T[], maximum: N): H0BoundedAtLeastTwoTuple<T, N> {
  const frozen = Object.freeze([...values]);
  if (!isAtLeastTwo(frozen, maximum)) throw new Error("H0 ambiguous collection needs two to maximum items");
  return frozen;
}
function bounded<T, N extends number>(values: readonly T[], maximum: N): H0BoundedTuple<T, N> {
  const frozen = Object.freeze([...values]);
  if (!isBounded(frozen, maximum)) throw new Error("H0 bounded collection overflow");
  return frozen;
}
function boundedNonEmpty<T, N extends number>(values: readonly T[], maximum: N): H0BoundedNonEmptyTuple<T, N> {
  const frozen = Object.freeze([...values]);
  if (!isBoundedNonEmpty(frozen, maximum)) throw new Error("H0 bounded nonempty collection overflow");
  return frozen;
}

type Counters = {
  contextEventsVisited: number;
  t1ResolutionsVisited: number;
  contextEdgesVisited: number;
  scaleMappingEvaluations: number;
  degreeComparisons: number;
  optionsEmitted: number;
  emittedRecords: number;
  peakTrackedRecords: number;
};

function workEvidence<T extends "complete" | "input-refusal" | "limit-refusal">(
  counters: Counters,
  termination: T,
): H0ChordScaleWorkEvidence<T> {
  return Object.freeze({ ...counters, analysisRuleEvaluations: 0, termination });
}

const POSITIONS = ["previous", "current", "next"] as const satisfies readonly H0ContextPosition[];

function eventAt(request: H0ChordScaleRequest, position: H0ContextPosition): H0ContextEvent | null {
  return position === "previous" ? request.previous : position === "next" ? request.next : request.current;
}

/** Shape → kind → tonic → equality with the current parsed root, in that order (§3.1). */
function declarationDefect(
  declaration: unknown,
  currentRoot: SpelledPitchClass | null,
): "shape" | "kind-unsupported" | "tonic-invalid" | "tonic-mismatch" | null {
  if (declaration === null) return null;
  if (typeof declaration !== "object" || Array.isArray(declaration)) return "shape";
  const keys = Object.keys(declaration).sort();
  if (keys.length !== 2 || keys[0] !== "kind" || keys[1] !== "tonic") return "shape";
  const record = declaration as Readonly<{ kind: unknown; tonic: unknown }>;
  if (!(H0_DECLARED_SCALE_CONTEXT_KINDS as readonly unknown[]).includes(record.kind)) return "kind-unsupported";
  const tonic = record.tonic;
  if (typeof tonic !== "object" || tonic === null || Array.isArray(tonic)) return "tonic-invalid";
  const tonicKeys = Object.keys(tonic).sort();
  const pitch = tonic as Readonly<{ step: unknown; alter: unknown }>;
  if (tonicKeys.length !== 2 || tonicKeys[0] !== "alter" || tonicKeys[1] !== "step" ||
    typeof pitch.step !== "string" || !/^[A-G]$/.test(pitch.step) ||
    typeof pitch.alter !== "number" || !Number.isInteger(pitch.alter) || pitch.alter < -2 || pitch.alter > 2) {
    return "tonic-invalid";
  }
  // A Custom chord has no authoritative root, so no declaration can match it.
  if (currentRoot === null || pitch.step !== currentRoot.step || pitch.alter !== currentRoot.alter) return "tonic-mismatch";
  return null;
}

/**
 * The one checked publication point for an option. The contract's option type
 * correlates `orderKey` with `strength` and `family` per member of a 12x4
 * distributed union, which the compiler cannot follow through runtime values.
 * Those correlations and the index alignment of the degree tuples are checked
 * here before the single assertion; nothing else in this module is cast.
 */
function publishOption(option: Readonly<{
  strength: H0EvidenceTier;
  family: H0ChordScaleFamily;
  orderKey: readonly [number, number];
  degrees: readonly unknown[];
  spelledPitchNames: readonly unknown[];
  pitchClasses: readonly unknown[];
}>): H0ChordScaleOption {
  if (option.orderKey[0] !== H0_EVIDENCE_TIER_RANKS[option.strength] ||
    option.orderKey[1] !== H0_CHORD_SCALE_FAMILY_RANKS[option.family] ||
    option.spelledPitchNames.length !== option.degrees.length ||
    option.pitchClasses.length !== option.degrees.length) {
    throw new Error("H0 chord-scale option failed its publication check");
  }
  return Object.freeze(option) as unknown as H0ChordScaleOption;
}

type Evaluation =
  | Readonly<{ kind: "eliminated" }>
  | Readonly<{
      kind: "kept";
      strength: H0EvidenceTier;
      premiseEvidence: readonly H0EvidenceRecord[];
      missing: readonly H0MissingEvidence[];
    }>;

export const enumerateChordScaleOptions: EnumerateChordScaleOptions = (request) => {
  const counters: Counters = {
    contextEventsVisited: 0, t1ResolutionsVisited: 0, contextEdgesVisited: 0, scaleMappingEvaluations: 0,
    degreeComparisons: 0, optionsEmitted: 0, emittedRecords: 0, peakTrackedRecords: 0,
  };
  const refuse = (refusal: H0ChordScaleRequestRefusal): H0ChordScaleResult =>
    Object.freeze({ ok: false, refusal: Object.freeze(refusal), evidence: workEvidence(counters, "input-refusal") });
  const refuseLimit = (refusal: H0ChordScaleLimitRefusal): H0ChordScaleResult =>
    Object.freeze({ ok: false, refusal: Object.freeze(refusal), evidence: workEvidence(counters, "limit-refusal") });

  // §14 precedence: request ID, base revision, upstream pins, rule tables,
  // selection required, selection unknown, duplicate IDs, scale declaration.
  const { requestId, baseRevision } = request;
  if (requestId.length === 0 || requestId.length > MAX_H0_REQUEST_ID_ASCII_LENGTH ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(requestId)) {
    return refuse({
      code: "harmony.request_id_invalid", path: Object.freeze(["requestId"]),
      reason: requestId.length === 0 ? "empty" : requestId.length > MAX_H0_REQUEST_ID_ASCII_LENGTH ? "too-long" : "non-ascii",
      maximum: MAX_H0_REQUEST_ID_ASCII_LENGTH,
    });
  }
  if (!Number.isSafeInteger(baseRevision) || baseRevision < MIN_H0_BASE_REVISION) {
    return refuse({
      code: "harmony.base_revision_invalid", path: Object.freeze(["baseRevision"]), received: baseRevision,
      minimum: MIN_H0_BASE_REVISION, maximum: MAX_H0_BASE_REVISION,
    });
  }
  for (const position of POSITIONS) {
    const event = eventAt(request, position);
    if (event === null) continue;
    const pin = h0UpstreamRefusal(event.resolved, position, [position, "resolved"]);
    if (pin !== null) return refuse(pin);
  }
  const ruleTable = request.analysisRuleTable;
  if (ruleTable.id !== H0_ANALYSIS_RULE_TABLE_ID || ruleTable.version !== H0_ANALYSIS_RULE_TABLE_VERSION) {
    return refuse({
      code: "harmony.rule_version_unsupported",
      path: Object.freeze(["analysisRuleTable", ruleTable.id !== H0_ANALYSIS_RULE_TABLE_ID ? "id" : "version"]),
      component: "analysis-rule-table", expectedId: H0_ANALYSIS_RULE_TABLE_ID,
      expectedVersion: H0_ANALYSIS_RULE_TABLE_VERSION, receivedId: ruleTable.id, receivedVersion: ruleTable.version,
    });
  }
  const mappingTable = request.chordScaleMappingTable;
  if (mappingTable.id !== H0_CHORD_SCALE_MAPPING_TABLE_ID || mappingTable.version !== H0_CHORD_SCALE_MAPPING_TABLE_VERSION) {
    return refuse({
      code: "harmony.rule_version_unsupported",
      path: Object.freeze(["chordScaleMappingTable", mappingTable.id !== H0_CHORD_SCALE_MAPPING_TABLE_ID ? "id" : "version"]),
      component: "chord-scale-mapping-table", expectedId: H0_CHORD_SCALE_MAPPING_TABLE_ID,
      expectedVersion: H0_CHORD_SCALE_MAPPING_TABLE_VERSION, receivedId: mappingTable.id, receivedVersion: mappingTable.version,
    });
  }
  for (const position of POSITIONS) {
    const event = eventAt(request, position);
    if (event !== null && event.selectedRealizationId === null && event.resolved.realizations.length > 1) {
      return refuse({
        code: "harmony.selected_realization_required", path: Object.freeze([position, "selectedRealizationId"]),
        position, received: null,
      });
    }
  }
  for (const position of POSITIONS) {
    const event = eventAt(request, position);
    if (event === null || event.selectedRealizationId === null) continue;
    const selected = event.selectedRealizationId;
    if (!event.resolved.realizations.some((realization) => realization.id === selected)) {
      const ids = event.resolved.realizations.map((realization) => realization.id);
      return refuse({
        code: "harmony.selected_realization_unknown", path: Object.freeze([position, "selectedRealizationId"]),
        position, received: selected, available: boundedNonEmpty<H0SelectedRealizationId, 4>(ids, 4),
      });
    }
  }
  const seen: { id: ChordEventId; position: H0ContextPosition }[] = [];
  for (const position of POSITIONS) {
    const event = eventAt(request, position);
    if (event === null) continue;
    const first = seen.find((entry) => entry.id === event.eventId);
    if (first !== undefined) {
      return refuse({
        code: "harmony.duplicate_event_id", path: Object.freeze([position, "eventId"]),
        eventId: event.eventId, firstPosition: first.position, duplicatePosition: position,
      });
    }
    seen.push({ id: event.eventId, position });
  }
  const current = request.current;
  const currentSource = current.resolved.source;
  const currentRoot = currentSource.kind === "parsed" ? currentSource.root : null;
  const defect = declarationDefect(request.declaredScaleContext, currentRoot);
  if (defect !== null) {
    return refuse({ code: "harmony.scale_context_invalid", field: "declaredScaleContext", defect });
  }
  const declaration: H0DeclaredScaleContext | null = request.declaredScaleContext === null ? null
    : Object.freeze({ kind: request.declaredScaleContext.kind,
      tonic: Object.freeze({ step: request.declaredScaleContext.tonic.step, alter: request.declaredScaleContext.tonic.alter }) });

  counters.contextEventsVisited = POSITIONS.filter((position) => eventAt(request, position) !== null).length;
  counters.t1ResolutionsVisited = counters.contextEventsVisited;
  counters.contextEdgesVisited = (request.previous === null ? 0 : 1) + (request.next === null ? 0 : 1);

  const literal = deriveLiteralFacts({
    requestId, baseRevision, source: current.resolved, selectedRealizationId: current.selectedRealizationId,
  });
  if (!literal.ok) {
    counters.degreeComparisons = literal.evidence.degreeComparisons;
    const refusal = literal.refusal;
    if (refusal.code === "limit.harmony_evidence_records_exceeded" || refusal.code === "limit.harmony_work_exceeded") {
      return refuseLimit(refusal);
    }
    // Every literal-facts input refusal was checked above with its context position.
    throw new Error(`H0 literal facts refused a validated request: ${refusal.code}`);
  }
  counters.degreeComparisons = literal.evidence.degreeComparisons;
  counters.emittedRecords = literal.evidence.emittedRecords;
  const declarationRecords = declaration === null ? 0 : 2;
  counters.peakTrackedRecords = literal.evidence.peakTrackedRecords + declarationRecords;

  const literalFacts: H0LiteralFacts = literal.value.literalFacts;
  const keyUsed = request.key === null ? null
    : Object.freeze({ tonic: Object.freeze({ step: request.key.tonic.step, alter: request.key.tonic.alter }), mode: request.key.mode });
  const base = {
    schema: H0_CHORD_SCALE_RESULT_SCHEMA,
    analysisRuleTableId: H0_ANALYSIS_RULE_TABLE_ID, analysisRuleTableVersion: H0_ANALYSIS_RULE_TABLE_VERSION,
    mappingTableId: H0_CHORD_SCALE_MAPPING_TABLE_ID, mappingTableVersion: H0_CHORD_SCALE_MAPPING_TABLE_VERSION,
    containmentPolicyId: H0_CHORD_SCALE_CONTAINMENT_POLICY_ID,
    containmentPolicyVersion: H0_CHORD_SCALE_CONTAINMENT_POLICY_VERSION,
    evidencePolicyId: H0_ANALYSIS_EVIDENCE_POLICY_ID, evidencePolicyVersion: H0_ANALYSIS_EVIDENCE_POLICY_VERSION,
    orderPolicyId: H0_ANALYSIS_ORDER_POLICY_ID, orderPolicyVersion: H0_ANALYSIS_ORDER_POLICY_VERSION,
    exactWeightPolicyId: H0_EXACT_WEIGHT_POLICY_ID, exactWeightPolicyVersion: H0_EXACT_WEIGHT_POLICY_VERSION,
    requestId, baseRevision, currentEventId: current.eventId, keyUsed, declaredSpan: request.declaredSpan,
  } as const;

  if (literalFacts.applicability === "not-applicable") {
    // Custom: literal pitch facts only; no root, degrees, family or tier (§11).
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        ...base, disposition: "not-applicable", declaredScaleContextUsed: null, selectedRealizationId: "custom",
        literalFacts, options: Object.freeze([] as const), limitations: literalFacts.limitations,
      }),
      evidence: workEvidence(counters, "complete"),
    });
  }

  const root = literalFacts.root;
  const selectedRealizationId = literalFacts.selectedRealizationId;
  const chordDegrees = literalFacts.degrees;
  const chordSpellings = literalFacts.spelledPitchNames;
  const chordClasses = chordDegrees.map(degreeClass);
  const hasClass = (token: Token): boolean => {
    const wanted = degreeClass(degreeOf(token));
    for (const present of chordClasses) {
      counters.degreeComparisons += 1;
      if (present === wanted) return true;
    }
    return false;
  };
  const chordDegreeFor = (token: Token): Readonly<{ degree: ChordDegree; spelling: SpelledPitchClass }> | null => {
    const wanted = degreeClass(degreeOf(token));
    const index = chordClasses.indexOf(wanted);
    const degree = chordDegrees[index];
    const spelling = chordSpellings[index];
    return index < 0 || degree === undefined || spelling === undefined ? null : { degree, spelling };
  };
  const functionalKey = request.declaredSpan === "tonal" || request.declaredSpan === "unspecified" ? keyUsed : null;
  const keyContains = (degreeFromRoot: Token): boolean => {
    if (functionalKey === null) return false;
    const wanted = spell(root, degreeOf(degreeFromRoot));
    if (wanted === null) return false;
    return KEY_MODE_DEGREES[functionalKey.mode].some((token) => {
      counters.degreeComparisons += 1;
      const member = spell(functionalKey.tonic, degreeOf(token));
      return member !== null && sameSpelling(member, wanted);
    });
  };
  const isTonic = functionalKey !== null && sameSpelling(functionalKey.tonic, root);
  const currentIds = boundedNonEmpty<ChordEventId, 3>([current.eventId], 3);
  const evidenceRecord = (
    id: string, kind: H0EvidenceRecord["kind"], ruleId: H0AnalysisRuleId,
    degree: ChordDegree | null, spelling: SpelledPitchClass | null, detail: string,
  ): H0EvidenceRecord => Object.freeze({
    id, kind, ruleId, sourceEventIds: currentIds, expectedDegree: degree, observedDegree: degree,
    expectedSpelling: spelling, observedSpelling: spelling, detail,
  });
  const missingRecord = (code: H0MissingEvidence["code"], ruleId: H0AnalysisRuleId, detail: string): H0MissingEvidence =>
    Object.freeze({ code, requiredForRuleIds: boundedNonEmpty<H0AnalysisRuleId, 8>([ruleId], 8), detail });
  const keyAbsentDetail = functionalKey === null && keyUsed !== null
    ? "The declared span is not tonal, so the key cannot settle this."
    : "No key is set, so this cannot be settled.";

  const evaluatePremise = (row: MappingRow): Evaluation => {
    const kept = (premiseEvidence: readonly H0EvidenceRecord[], missing: readonly H0MissingEvidence[]): Evaluation =>
      Object.freeze({ kind: "kept", strength: missing.length === 0 ? "exact" : "plausible", premiseEvidence, missing });
    switch (row.premise) {
      case "literal":
        return kept([], []);
      case "ionian-tonic": {
        if (!hasClass("7")) return kept([], []);
        if (functionalKey === null) {
          return kept([], [missingRecord("key-absent", "h0.roman.diatonic-major",
            `Ionian over a major seventh needs it to be the tonic of a major key. ${keyAbsentDetail}`)]);
        }
        if (!isTonic || functionalKey.mode !== "major") return { kind: "eliminated" };
        return kept([evidenceRecord(`${row.id}:tonic`, "key-membership", "h0.roman.diatonic-major", null, root,
          "The chord is the tonic of the declared major key.")], []);
      }
      case "lydian-sharp-four": {
        const sharpEleven = chordDegreeFor("#11");
        if (sharpEleven !== null) {
          return kept([evidenceRecord(`${row.id}:sharp-eleven`, "literal-degree", "h0.literal-facts",
            sharpEleven.degree, sharpEleven.spelling, "The chord names #11.")], []);
        }
        if (functionalKey === null) {
          return kept([], [missingRecord("key-absent", "h0.roman.diatonic-major",
            `Lydian needs an explicit #11 or a key in which this non-tonic major seventh has a raised fourth. ${keyAbsentDetail}`)]);
        }
        if (isTonic || !keyContains("#4")) return { kind: "eliminated" };
        return kept([evidenceRecord(`${row.id}:sharp-four`, "key-membership", DIATONIC_RULE[functionalKey.mode],
          degreeOf("#4"), spell(root, degreeOf("#4")), "The declared key contains this chord's raised fourth.")], []);
      }
      case "altered-selected":
        return selectedRealizationId.startsWith("alt-") ? kept([], []) : { kind: "eliminated" };
      case "diminished-dominant": {
        if (!hasClass("b9") && !hasClass("#9")) return { kind: "eliminated" };
        return declaration?.kind === "diminished-dominant"
          ? kept([evidenceRecord(`${row.id}:declared`, "literal-quality", "h0.literal-facts", null, root,
            "The request declares a diminished-dominant frame on this root.")], [])
          : kept([], [missingRecord("declared-context-insufficient", "h0.literal-facts",
            "Half-whole diminished needs a declared diminished-dominant frame.")]);
      }
      case "dorian": {
        if (declaration?.kind === "dorian" && request.declaredSpan === "modal") {
          return kept([evidenceRecord(`${row.id}:declared`, "literal-quality", "h0.outcome.modal", null, root,
            "The request declares a Dorian frame on this root within a modal span.")], []);
        }
        // A supplied key whose scale has this root's b6 contradicts Dorian's natural 6.
        if (keyContains("b6")) return { kind: "eliminated" };
        return kept([], [missingRecord("declared-context-insufficient", "h0.outcome.modal",
          "Dorian needs a declared Dorian frame within a modal span.")]);
      }
      case "melodic-minor": {
        if (hasClass("7")) return kept([], []);
        if (functionalKey === null) {
          return kept([], [missingRecord("key-absent", "h0.roman.diatonic-melodic-minor",
            `A minor triad or sixth chord needs to be the tonic of a melodic-minor key. ${keyAbsentDetail}`)]);
        }
        if (!isTonic || functionalKey.mode !== "melodic-minor") return { kind: "eliminated" };
        return kept([evidenceRecord(`${row.id}:tonic`, "key-membership", "h0.roman.diatonic-melodic-minor", null, root,
          "The chord is the tonic of the declared melodic-minor key.")], []);
      }
      case "locrian-flat-nine":
      case "locrian-natural-nine": {
        const wanted = row.premise;
        return declaration?.kind === wanted
          ? kept([evidenceRecord(`${row.id}:declared`, "literal-quality", "h0.literal-facts", null, root,
            `The request declares a ${wanted} frame on this root.`)], [])
          : kept([], [missingRecord("declared-context-insufficient", "h0.literal-facts",
            `This option needs a declared ${wanted} frame.`)]);
      }
    }
  };

  const options: H0ChordScaleOption[] = [];
  for (const row of MAPPINGS) {
    counters.scaleMappingEvaluations += 1;
    if (row.scaleDegrees.length > MAX_H0_SCALE_DEGREES) {
      return refuseLimit({ code: "limit.harmony_work_exceeded", path: Object.freeze(["options", "degrees"]),
        field: "scaleDegrees", received: row.scaleDegrees.length, maximum: MAX_H0_SCALE_DEGREES });
    }
    // Hard gates: required present, forbidden absent, every chord degree contained.
    if (!row.required.every(hasClass)) continue;
    if (row.forbidden.some(hasClass)) continue;
    const scaleClasses = row.scaleDegrees.map((token) => degreeClass(degreeOf(token)));
    const contained = chordClasses.every((chordClass) => scaleClasses.some((scaleClass) => {
      counters.degreeComparisons += 1;
      return scaleClass === chordClass;
    }));
    if (!contained) continue;
    const evaluation = evaluatePremise(row);
    if (evaluation.kind === "eliminated") continue;
    if (counters.degreeComparisons > MAX_H0_DEGREE_COMPARISONS) {
      return refuseLimit({ code: "limit.harmony_work_exceeded", path: Object.freeze(["evidence", "degreeComparisons"]),
        field: "degreeComparisons", received: counters.degreeComparisons, maximum: MAX_H0_DEGREE_COMPARISONS });
    }

    const scaleDegrees = row.scaleDegrees.map(degreeOf);
    const scaleSpellings = scaleDegrees.map((degree) => spell(root, degree));
    if (scaleSpellings.some((spelling) => spelling === null)) continue; // unspellable root: no invented spelling
    const spelledPitchNames = scaleSpellings.filter((spelling): spelling is SpelledPitchClass => spelling !== null);
    const pitchClasses = spelledPitchNames.map((spelling): PitchClass => pitchClassOf(spelling));
    const requiredDegrees = row.required.map(degreeOf);
    const components: H0MatchComponent[] = requiredDegrees.map((degree) => {
      const found = chordDegreeFor(`${degree.alter < 0 ? "b".repeat(-degree.alter) : "#".repeat(degree.alter)}${String(degree.number)}`);
      // A suspended dominant's 4 stands where the third would (§6 structural suspension).
      const kind = degree.number === 1 ? "root"
        : degree.number === 3 || (degree.number === 4 && row.id === "h0.scale.suspended-dominant") ? "third-or-suspension"
          : degree.number === 7 ? "seventh" : degree.number === 5 && degree.alter === 0 ? "fifth" : "color";
      const weight = kind === "root" || kind === "third-or-suspension" || kind === "seventh" ? 2 : 1;
      return Object.freeze({
        kind, weight, matchedWeight: weight, expectedDegree: degree, observedDegree: found?.degree ?? degree,
        expectedSpelling: spell(root, degree), observedSpelling: found?.spelling ?? null, spellingAgreement: "exact",
      });
    });
    const matchWeight = components.reduce((sum, component) => sum + component.weight, 0);
    const tensions: H0ChordScaleTension[] = [
      ...row.available.map((token) => {
        const degree = degreeOf(token);
        const exception = row.exceptions.find((entry) => entry.degree === token);
        return Object.freeze({
          degree, spelling: spell(root, degree) ?? root, availability: "available" as const,
          treatment: exception?.treatment ?? "Available tension.",
        });
      }),
      ...row.clashes.filter((clash) => !row.available.includes(clash.tension) && hasClass(clash.chordTone)).map((clash) => {
        const degree = degreeOf(clash.tension);
        return Object.freeze({
          degree, spelling: spell(root, degree) ?? root, availability: "unavailable" as const,
          treatment: `A minor ninth above chord degree ${clash.chordTone}.`,
        });
      }),
    ];
    const minorNinthClashes: H0MinorNinthClash[] = row.clashes.filter((clash) => hasClass(clash.chordTone)).map((clash) => {
      const tensionDegree = degreeOf(clash.tension);
      const chordToneDegree = degreeOf(clash.chordTone);
      const exception = row.exceptions.find((entry) => entry.degree === clash.tension);
      const shared = {
        kind: "minor-ninth" as const, mappingRuleId: row.id, tensionDegree,
        tensionSpelling: spell(root, tensionDegree) ?? root, chordToneDegree,
        chordToneSpelling: chordDegreeFor(clash.chordTone)?.spelling ?? root, directedSemitones: 13 as const,
      };
      return Object.freeze(exception === undefined
        ? { ...shared, exceptionApplied: false as const, exceptionId: null }
        : { ...shared, exceptionApplied: true as const, exceptionId: exception.id });
    });
    const exceptions: H0ChordScaleException[] = row.exceptions.map((entry) =>
      Object.freeze({ id: entry.id, degree: degreeOf(entry.degree), detail: entry.treatment }));
    const evidence = [
      ...requiredDegrees.map((degree, index) => {
        const found = components[index];
        return evidenceRecord(`${row.id}:required:${String(index)}`, "literal-degree", "h0.literal-facts",
          found?.observedDegree ?? degree, found?.observedSpelling ?? null, "The chord contains this required degree.");
      }),
      ...evaluation.premiseEvidence,
    ];
    const option = {
      kind: "option" as const, optionId: `${row.id}::${selectedRealizationId}`, family: row.family,
      mappingRuleId: row.id, mappingRuleIds: boundedNonEmpty<H0ChordScaleMappingId, 8>([row.id], 8),
      strength: evaluation.strength, selectedRealizationId,
      degrees: boundedNonEmpty(scaleDegrees, MAX_H0_SCALE_DEGREES),
      spelledPitchNames: Object.freeze(spelledPitchNames), pitchClasses: Object.freeze(pitchClasses),
      containment: Object.freeze({
        policyId: H0_CHORD_SCALE_CONTAINMENT_POLICY_ID, policyVersion: H0_CHORD_SCALE_CONTAINMENT_POLICY_VERSION,
        requiredChordDegrees: boundedNonEmpty(requiredDegrees, 16),
        containedChordDegrees: bounded(chordDegrees, 16),
        missingRequiredChordDegrees: bounded<ChordDegree, 16>([], 16),
        forbiddenScaleDegreesPresent: bounded<ChordDegree, 8>([], 8),
        match: Object.freeze({ numerator: matchWeight, denominator: matchWeight }),
        matchComponents: boundedNonEmpty(components, 16),
      }),
      tensions: bounded(tensions, MAX_H0_TENSIONS_PER_SCALE),
      minorNinthClashes: bounded(minorNinthClashes, MAX_H0_CLASHES_PER_SCALE),
      exceptions: bounded(exceptions, MAX_H0_EXCEPTIONS_PER_SCALE),
      evidence: boundedNonEmpty(evidence, 16),
      counterevidence: bounded<H0EvidenceRecord, 8>([], 8),
      missingEvidence: bounded(evaluation.missing, 8),
      limitations: bounded<H0Limitation, 8>([], 8),
      provenance: PROVENANCE,
      orderKey: Object.freeze([H0_EVIDENCE_TIER_RANKS[evaluation.strength], H0_CHORD_SCALE_FAMILY_RANKS[row.family]] as const),
    };
    options.push(publishOption(option));
    counters.optionsEmitted += 1;
    // Records: the option, its rule reference, degrees, tensions, clashes,
    // exceptions, evidence, missing evidence and match components.
    counters.emittedRecords += 2 + scaleDegrees.length + tensions.length + minorNinthClashes.length +
      exceptions.length + evidence.length + evaluation.missing.length + components.length;
  }
  if (options.length > MAX_H0_SCALE_OPTIONS) {
    return refuseLimit({ code: "limit.harmony_scale_options_exceeded", path: Object.freeze(["options"]),
      field: "scaleOptions", received: options.length, maximum: MAX_H0_SCALE_OPTIONS });
  }

  // §12: tier, family order, mapping-rule ID, option ID (code-unit order).
  const compareText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
  options.sort((left, right) =>
    left.orderKey[0] - right.orderKey[0] || left.orderKey[1] - right.orderKey[1] ||
    compareText(left.mappingRuleId, right.mappingRuleId) || compareText(left.optionId, right.optionId));

  const limitations: H0Limitation[] = [];
  if (keyUsed === null && options.some((option) => option.missingEvidence.some((missing) => missing.code === "key-absent"))) {
    limitations.push(Object.freeze({ code: "key-absent", detail: "No key is set; options that depend on one stay plausible." }));
  }
  const strongest = options[0]?.strength;
  const tied = options.filter((option) => option.strength === strongest).length;
  const disposition: "classified" | "ambiguous" | "unclassified" = options.length === 0 ? "unclassified" : tied > 1 ? "ambiguous" : "classified";
  if (disposition === "ambiguous" && limitations.length === 0) {
    limitations.push(Object.freeze({ code: "target-ambiguous", detail: "Several scale families fit equally well; none is chosen." }));
  }
  const classification = request.declaredSpan === "modal" ? "modal" as const
    : request.declaredSpan === "nonfunctional" ? "nonfunctional" as const : "unresolved" as const;
  if (disposition === "unclassified") {
    limitations.push(Object.freeze(classification === "modal"
      ? { code: "modal-key-not-representable" as const, detail: "No mapping fits this chord in the declared modal span." }
      : classification === "nonfunctional"
        ? { code: "nonfunctional-no-roman-claim" as const, detail: "No mapping fits this chord in the declared nonfunctional span." }
        : { code: "no-rule-match" as const, detail: "No chord-scale mapping fits this exact chord and context." }));
  }
  counters.emittedRecords += limitations.length;
  counters.peakTrackedRecords += counters.emittedRecords - literal.evidence.emittedRecords;
  if (counters.emittedRecords > MAX_H0_EMITTED_RECORDS) {
    return refuseLimit({ code: "limit.harmony_work_exceeded", path: Object.freeze(["evidence", "emittedRecords"]),
      field: "emittedRecords", received: counters.emittedRecords, maximum: MAX_H0_EMITTED_RECORDS });
  }
  if (counters.peakTrackedRecords > MAX_H0_TRACKED_RECORDS) {
    return refuseLimit({ code: "limit.harmony_work_exceeded", path: Object.freeze(["evidence", "peakTrackedRecords"]),
      field: "trackedRecords", received: counters.peakTrackedRecords, maximum: MAX_H0_TRACKED_RECORDS });
  }
  const shared = { ...base, declaredScaleContextUsed: declaration, selectedRealizationId, literalFacts };
  const evidence = workEvidence(counters, "complete");
  if (disposition === "unclassified") {
    return Object.freeze({ ok: true, evidence, value: Object.freeze({
      ...shared, disposition, classification, options: Object.freeze([] as const),
      limitations: boundedNonEmpty(limitations, 8) }) });
  }
  if (disposition === "ambiguous") {
    return Object.freeze({ ok: true, evidence, value: Object.freeze({
      ...shared, disposition, options: atLeastTwo(options, MAX_H0_SCALE_OPTIONS),
      limitations: boundedNonEmpty(limitations, 8) }) });
  }
  return Object.freeze({ ok: true, evidence, value: Object.freeze({
    ...shared, disposition, options: boundedNonEmpty(options, MAX_H0_SCALE_OPTIONS),
    limitations: bounded(limitations, 8) }) });
};
