import {
  MAX_DOCUMENT_CHORD_EVENTS,
  MAX_DOCUMENT_SECTIONS,
  MAX_JSON_NESTING_DEPTH,
  MAX_SECTION_MEASURES,
  MAX_TIMELINE_QUARTER_NOTE_BEATS,
  addBeatValues,
  compareBeatValues,
  makeBeatDuration,
  makeBeatPosition,
  type BeatDuration,
  type BeatValue,
  type ChordEvent,
  type ChordEventId,
  type DocumentId,
  type DomainPath,
  type MeasureCompletion,
  type MeasureId,
  type ProgressionDocumentV2,
  type Section,
  type SectionId,
  type ValidatedDocument,
} from "../domain";
import type {
  ChartTextParseResult,
  InsertableChartChord,
} from "../theory";
import {
  A0_U1_ATOMIC_EDIT_PLAN_RECEIPT_SCHEMA,
  A0_U1_FRAGMENT_PARSE_ACCIDENTAL_STYLE,
  A0_U1_NEW_EVENT_AUTO_VOICING,
  A0_U1_RECOVERED_CHORD_LAYOUT_LOSS_ACKNOWLEDGEMENT,
  MAX_A0_U1_FRAGMENT_EVENTS,
  MAX_A0_U1_FRAGMENT_MEASURES,
  MAX_A0_U1_FRAGMENT_SECTIONS,
  MAX_A0_U1_FRAGMENT_SOURCE_CODE_POINTS,
  MAX_A0_U1_FRAGMENT_SOURCE_UTF8_BYTES,
  MAX_A0_U1_QUICK_ENTRY_ISSUE_CODES,
  MAX_A0_U1_RETAINED_DIAGNOSTICS,
  MAX_A0_U1_RETAINED_WARNING_ACKNOWLEDGEMENTS,
  type ApplyEditPlanCommand,
  type AtomicEditPlan,
  type AtomicEditPlanAllocatedIdentity,
  type AtomicEditPlanAppState,
  type AtomicEditPlanDependencies,
  type AtomicEditPlanDiagnostic,
  type AtomicEditPlanFailureForOuterCode,
  type AtomicEditPlanInsertSourceReceipt,
  type AtomicEditPlanOuterRefusalCode,
  type AtomicEditPlanPreplanOuterRefusalCode,
  type AtomicEditPlanReceipt,
  type AtomicEditPlanRefusalCode,
  type AtomicEditPlanRefusalCodeForOuter,
  type AtomicEditPlanTransitionResult,
  type AtomicEditPlanWorkEvidence,
  type ProposedAtomicEditPlanHistoryEntry,
  type RunAtomicEditPlan,
} from "./application-edit-plan-contract";
import { mapAtomicEditPlanBookmarks } from "./application-edit-plan-bookmarks";
import {
  decodeAtomicEditPlanRuntimeShape,
} from "./application-edit-plan-runtime-shape";
import {
  atomicEditPlanDiagnostic,
  createAtomicEditPlanWork,
  diagnosticsFromChartRefusal,
  diagnosticsFromSemanticRefusal,
  diagnosticsFromStructuralRefusal,
  freezeAtomicEditPlanWork,
  sortAndRetainAtomicEditPlanDiagnostics,
  type MutableAtomicEditPlanWork,
} from "./application-edit-plan-work";
import {
  MAX_APPLICATION_REVISION,
  MAX_APPLICATION_SEQUENCE,
  MAX_COMMAND_ID_CODE_POINTS,
  MAX_COMMAND_LABEL_CODE_POINTS,
  MAX_HISTORY_ENTRIES,
  MAX_HISTORY_RETAINED_BYTES,
  type ApplicationEffect,
  type StableBoundary,
  type StableUiBookmarks,
  type UiFocusTarget,
} from "./application-state-contract";
import {
  appendApplicationNotice,
  buildDocumentIndex,
  createWorkCounters,
  deepStructuralEqual,
  freezeWorkCounters,
  isBoundedToken,
  isNonnegativeSafeInteger,
  type ApplicationDocumentCandidate,
  type DocumentIndex,
  type MutableApplicationWorkCounters,
} from "./application-state-helpers";

type AtomicPreplanFailure = Readonly<{
  code: AtomicEditPlanPreplanOuterRefusalCode;
  path: DomainPath;
}>;

const ATOMIC_EDIT_REFUSAL_MESSAGE = "The edit was not applied.";

const EMPTY_EFFECTS_SOURCE: [] = [];
/** Frozen empty effect tuple; refusals publish no effects. */
const NO_ATOMIC_EDIT_EFFECTS: readonly [] = Object.freeze(
  EMPTY_EFFECTS_SOURCE,
);

type PlanFailure = Readonly<{
  code: AtomicEditPlanRefusalCode;
  path: DomainPath;
  diagnostics?: readonly AtomicEditPlanDiagnostic[];
  historyOuterCode?:
    | "history.entry_too_large"
    | "history.byte_estimate_invalid";
}>;

type AllocationSpec = Readonly<{
  kind: "section" | "measure" | "event";
  source: AtomicEditPlanAllocatedIdentity["source"];
}>;

type CompleteParseContract = Extract<ChartTextParseResult, { ok: true }>;
type FailedParseContract = Extract<ChartTextParseResult, { ok: false }>;
type DraftSectionContract =
  CompleteParseContract["draft"]["sections"][number];
type DraftMeasureContract = DraftSectionContract["measures"][number];
type DraftEventContract = DraftMeasureContract["events"][number];
type OperationalDraftEvent = Readonly<
  Pick<DraftEventContract, "ordinal" | "chord" | "duration" | "annotation">
>;
type OperationalDraftMeasure = Readonly<{
  ordinal: DraftMeasureContract["ordinal"];
  events: readonly OperationalDraftEvent[];
}>;
type OperationalDraftSection = Readonly<
  Pick<
    DraftSectionContract,
    "ordinal" | "kind" | "name" | "annotation"
  > & {
    measures: readonly OperationalDraftMeasure[];
  }
>;
type OperationalDraft = Readonly<{
  sourceText: string;
  sections: readonly OperationalDraftSection[];
}>;
type CompleteParse = Readonly<{
  ok: true;
  draft: OperationalDraft;
  canonicalText: string;
  warnings: CompleteParseContract["warnings"];
}>;
type FailedParse = Readonly<
  Pick<
    FailedParseContract,
    "ok" | "sourceText" | "diagnostics" | "insertableChords"
  > & {
    returnedInsertableChordCount: number;
  }
>;
type OperationalParse = CompleteParse | FailedParse;

type PreparedInsert = Readonly<{
  kind: "insert-fragment";
  parse: OperationalParse;
  selectedRecovery: InsertableChartChord | null;
  allocationSpecs: readonly AllocationSpec[];
  insertSource: AtomicEditPlanInsertSourceReceipt;
}>;

type PreparedNonInsert = Readonly<{
  kind:
    | "split-event-duration"
    | "join-event-durations"
    | "split-section"
    | "join-sections"
    | "split-measure";
  allocationSpecs: readonly AllocationSpec[];
}>;

type PreparedPlan = PreparedInsert | PreparedNonInsert;

type AnyInsertPlan = Extract<
  AtomicEditPlan,
  { kind: "insert-fragment" }
>;
type CompleteInsertPlan = Extract<
  AnyInsertPlan,
  { source: { kind: "complete-draft" } }
>;
function isCompleteInsertPlan(
  plan: AnyInsertPlan,
): plan is CompleteInsertPlan {
  return plan.source.kind === "complete-draft";
}

type MaterializedPlan = Readonly<{
  candidate: ApplicationDocumentCandidate;
  allocatedIdentities: readonly AtomicEditPlanAllocatedIdentity[];
  removedIdentities: readonly (
    | Readonly<{ kind: "section"; id: SectionId }>
    | Readonly<{ kind: "event"; id: ChordEventId }>
  )[];
  survivorId: SectionId | MeasureId | ChordEventId | null;
  insertSource: AtomicEditPlanInsertSourceReceipt | null;
  completionMeasureIds: readonly MeasureId[];
  timelineDisposition:
    | "splice-source-order-at-declared-boundary"
    | "insert-one-recovered-chord-at-declared-boundary"
    | "replace-one-span-with-two-exact-sum-spans"
    | "replace-two-equal-content-spans-with-one-exact-sum-span"
    | "preserve-flattened-event-order-and-durations";
  insertLane: "complete-draft" | "recovered-chord" | null;
  placementKind: "into-measure" | "into-section" | "into-document" | null;
}>;

function effect(
  kind: ApplicationEffect["kind"],
  revision: number,
  reasonCode: string,
): ApplicationEffect {
  return Object.freeze({
    kind,
    revision,
    requestId: null,
    reasonCode,
  });
}

type CapturedDependencyField = Readonly<{
  value: unknown;
}>;

function captureDependencyField(
  value: unknown,
  key: string,
): CapturedDependencyField | null {
  if (typeof value !== "object" || value === null) return null;
  try {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !Object.hasOwn(descriptor, "value")
    ) {
      return null;
    }
    const capturedValue: unknown = descriptor.value;
    return Object.freeze({ value: capturedValue });
  } catch {
    return null;
  }
}

function captureDependencyArrayLength(
  value: unknown,
  minimumLength: 0 | 1,
  maximumLength: number,
): number | null {
  try {
    if (!Array.isArray(value)) return null;
    const lengthDescriptor = Reflect.getOwnPropertyDescriptor(
      value,
      "length",
    );
    if (
      lengthDescriptor === undefined ||
      !Object.hasOwn(lengthDescriptor, "value")
    ) {
      return null;
    }
    const length: unknown = lengthDescriptor.value;
    if (
      typeof length !== "number" ||
      !Number.isSafeInteger(length) ||
      length < minimumLength ||
      length > maximumLength
    ) {
      return null;
    }
    return length;
  } catch {
    return null;
  }
}

function captureDependencyArrayItem(
  value: unknown,
  index: number,
): CapturedDependencyField | null {
  return captureDependencyField(value, String(index));
}

function captureDependencyArray(
  value: unknown,
  minimumLength: 0 | 1,
  maximumLength: number,
): readonly unknown[] | null {
  const length = captureDependencyArrayLength(
    value,
    minimumLength,
    maximumLength,
  );
  if (length === null) return null;
  const captured: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const item = captureDependencyArrayItem(value, index);
    if (item === null) return null;
    captured.push(item.value);
  }
  return Object.freeze(captured);
}

function hasNonemptyDependencyArray(value: unknown): boolean {
  try {
    if (!Array.isArray(value)) return false;
    const lengthDescriptor = Reflect.getOwnPropertyDescriptor(
      value,
      "length",
    );
    if (
      lengthDescriptor === undefined ||
      !Object.hasOwn(lengthDescriptor, "value")
    ) {
      return false;
    }
    const length: unknown = lengthDescriptor.value;
    if (
      typeof length !== "number" ||
      !Number.isSafeInteger(length) ||
      length < 1
    ) {
      return false;
    }
    const first = Reflect.getOwnPropertyDescriptor(value, "0");
    return first !== undefined && Object.hasOwn(first, "value");
  } catch {
    return false;
  }
}

function isDependencyRecord(value: unknown): value is object {
  if (typeof value !== "object" || value === null) return false;
  try {
    return !Array.isArray(value);
  } catch {
    return false;
  }
}

function isDependencyNonnegativeSafeInteger(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    isNonnegativeSafeInteger(value)
  );
}

type CapturedSourceRange =
  FailedParseContract["diagnostics"][number]["range"];

function captureDependencySourceRange(
  value: unknown,
): CapturedSourceRange | null {
  const start = captureDependencyField(value, "start");
  const end = captureDependencyField(value, "end");
  if (
    start === null ||
    end === null ||
    !isDependencyNonnegativeSafeInteger(start.value) ||
    !isDependencyNonnegativeSafeInteger(end.value) ||
    end.value < start.value
  ) {
    return null;
  }
  return Object.freeze({ start: start.value, end: end.value });
}

function captureDependencyDuration(
  value: unknown,
): BeatDuration | null {
  const numerator = captureDependencyField(value, "numerator");
  const denominator = captureDependencyField(value, "denominator");
  if (
    numerator === null ||
    denominator === null ||
    typeof numerator.value !== "number" ||
    typeof denominator.value !== "number"
  ) {
    return null;
  }
  const made = makeBeatDuration({
    numerator: numerator.value,
    denominator: denominator.value,
  });
  return made.ok &&
    made.value.numerator === numerator.value &&
    made.value.denominator === denominator.value
    ? made.value
    : null;
}

function captureDependencyWarning(
  value: unknown,
): CompleteParseContract["warnings"][number] | null {
  const code = captureDependencyField(value, "code");
  const range = captureDependencyField(value, "range");
  const message = captureDependencyField(value, "message");
  const capturedRange = captureDependencySourceRange(range?.value);
  if (
    code?.value !== "chart.comments_not_round_tripped" ||
    capturedRange === null ||
    message === null ||
    typeof message.value !== "string"
  ) {
    return null;
  }
  return Object.freeze({
    code: code.value,
    range: capturedRange,
    message: message.value,
  });
}

function captureDependencyDiagnostic(
  value: unknown,
): FailedParseContract["diagnostics"][number] | null {
  const code = captureDependencyField(value, "code");
  const range = captureDependencyField(value, "range");
  const message = captureDependencyField(value, "message");
  const capturedRange = captureDependencySourceRange(range?.value);
  if (
    code === null ||
    typeof code.value !== "string" ||
    !isBoundedToken(code.value, MAX_COMMAND_ID_CODE_POINTS) ||
    capturedRange === null ||
    message === null ||
    typeof message.value !== "string"
  ) {
    return null;
  }
  return Object.freeze({
    code: code.value,
    range: capturedRange,
    message: message.value,
  }) as FailedParseContract["diagnostics"][number];
}

function captureDependencyInsertableChord(
  value: unknown,
): InsertableChartChord | null {
  const ordinal = captureDependencyField(value, "ordinal");
  const chord = captureDependencyField(value, "chord");
  const annotation = captureDependencyField(value, "annotation");
  const range = captureDependencyField(value, "range");
  const symbolRange = captureDependencyField(value, "symbolRange");
  const duration = captureDependencyField(value, "duration");
  const layoutContextPreserved = captureDependencyField(
    value,
    "layoutContextPreserved",
  );
  const capturedRange = captureDependencySourceRange(range?.value);
  const capturedSymbolRange = captureDependencySourceRange(
    symbolRange?.value,
  );
  if (
    ordinal === null ||
    !isDependencyNonnegativeSafeInteger(ordinal.value) ||
    chord === null ||
    !isDependencyRecord(chord.value) ||
    annotation === null ||
    typeof annotation.value !== "string" ||
    capturedRange === null ||
    capturedSymbolRange === null ||
    duration === null ||
    layoutContextPreserved?.value !== false
  ) {
    return null;
  }
  const durationKind = captureDependencyField(duration.value, "kind");
  let capturedDuration: InsertableChartChord["duration"];
  if (durationKind?.value === "resolved") {
    const source = captureDependencyField(duration.value, "source");
    const durationValue = captureDependencyField(duration.value, "value");
    const capturedValue = captureDependencyDuration(durationValue?.value);
    if (
      (source?.value !== "explicit" &&
        source?.value !== "allocated") ||
      capturedValue === null
    ) {
      return null;
    }
    capturedDuration = Object.freeze({
      kind: "resolved",
      source: source.value,
      value: capturedValue,
    });
  } else if (durationKind?.value === "requires-caller") {
    const reason = captureDependencyField(duration.value, "reason");
    if (reason?.value !== "chart.layout_invalid") return null;
    capturedDuration = Object.freeze({
      kind: "requires-caller",
      reason: "chart.layout_invalid",
    });
  } else {
    return null;
  }
  return Object.freeze({
    ordinal: ordinal.value,
    chord: chord.value as InsertableChartChord["chord"],
    annotation: annotation.value,
    range: capturedRange,
    symbolRange: capturedSymbolRange,
    duration: capturedDuration,
    layoutContextPreserved: false,
  });
}

function captureOperationalDraftEvent(
  value: unknown,
): OperationalDraftEvent | null {
  const ordinal = captureDependencyField(value, "ordinal");
  const chord = captureDependencyField(value, "chord");
  const duration = captureDependencyField(value, "duration");
  const annotation = captureDependencyField(value, "annotation");
  const capturedDuration = captureDependencyDuration(duration?.value);
  if (
    ordinal === null ||
    !isDependencyNonnegativeSafeInteger(ordinal.value) ||
    chord === null ||
    !isDependencyRecord(chord.value) ||
    capturedDuration === null ||
    annotation === null ||
    typeof annotation.value !== "string"
  ) {
    return null;
  }
  return Object.freeze({
    ordinal: ordinal.value,
    chord: chord.value as DraftEventContract["chord"],
    duration: capturedDuration,
    annotation: annotation.value,
  });
}

function captureOperationalDraft(
  value: unknown,
  expectedSourceText: string,
): OperationalDraft | null {
  const sourceText = captureDependencyField(value, "sourceText");
  const sections = captureDependencyField(value, "sections");
  const capturedSections = captureDependencyArray(
    sections?.value,
    0,
    MAX_A0_U1_FRAGMENT_SECTIONS + 1,
  );
  if (
    sourceText?.value !== expectedSourceText ||
    capturedSections === null
  ) {
    return null;
  }
  const result: OperationalDraftSection[] = [];
  let measureCount = 0;
  let eventCount = 0;
  for (const sectionValue of capturedSections) {
    const ordinal = captureDependencyField(sectionValue, "ordinal");
    const kind = captureDependencyField(sectionValue, "kind");
    const name = captureDependencyField(sectionValue, "name");
    const annotation = captureDependencyField(
      sectionValue,
      "annotation",
    );
    const measures = captureDependencyField(sectionValue, "measures");
    const capturedMeasures = captureDependencyArray(
      measures?.value,
      0,
      MAX_SECTION_MEASURES + 1,
    );
    if (
      ordinal === null ||
      !isDependencyNonnegativeSafeInteger(ordinal.value) ||
      (kind?.value !== "implicit" && kind?.value !== "named") ||
      name === null ||
      (name.value !== null && typeof name.value !== "string") ||
      annotation === null ||
      typeof annotation.value !== "string" ||
      capturedMeasures === null
    ) {
      return null;
    }
    measureCount += capturedMeasures.length;
    if (measureCount > MAX_A0_U1_FRAGMENT_MEASURES + 1) return null;
    const resultMeasures: OperationalDraftMeasure[] = [];
    for (const measureValue of capturedMeasures) {
      const measureOrdinal = captureDependencyField(
        measureValue,
        "ordinal",
      );
      const events = captureDependencyField(measureValue, "events");
      const capturedEvents = captureDependencyArray(
        events?.value,
        0,
        MAX_A0_U1_FRAGMENT_EVENTS + 1,
      );
      if (
        measureOrdinal === null ||
        !isDependencyNonnegativeSafeInteger(measureOrdinal.value) ||
        capturedEvents === null
      ) {
        return null;
      }
      eventCount += capturedEvents.length;
      if (eventCount > MAX_A0_U1_FRAGMENT_EVENTS + 1) return null;
      const resultEvents: OperationalDraftEvent[] = [];
      for (const eventValue of capturedEvents) {
        const event = captureOperationalDraftEvent(eventValue);
        if (event === null) return null;
        resultEvents.push(event);
      }
      resultMeasures.push(
        Object.freeze({
          ordinal: measureOrdinal.value,
          events: Object.freeze(resultEvents),
        }),
      );
    }
    result.push(
      Object.freeze({
        ordinal: ordinal.value,
        kind: kind.value,
        name: name.value,
        annotation: annotation.value,
        measures: Object.freeze(resultMeasures),
      }),
    );
  }
  return Object.freeze({
    sourceText: expectedSourceText,
    sections: Object.freeze(result),
  });
}

function captureChartTextParseResult(
  value: unknown,
  source: AnyInsertPlan["source"],
): OperationalParse | null {
  const expectedSourceText = source.quickEntrySnapshot.sourceText;
  const ok = captureDependencyField(value, "ok");
  if (ok === null || typeof ok.value !== "boolean") return null;
  if (ok.value) {
    const draft = captureDependencyField(value, "draft");
    const canonicalText = captureDependencyField(
      value,
      "canonicalText",
    );
    const warnings = captureDependencyField(value, "warnings");
    const warningValues = captureDependencyArray(
      warnings?.value,
      0,
      MAX_A0_U1_FRAGMENT_SOURCE_CODE_POINTS,
    );
    const capturedDraft = captureOperationalDraft(
      draft?.value,
      expectedSourceText,
    );
    if (
      capturedDraft === null ||
      canonicalText === null ||
      typeof canonicalText.value !== "string" ||
      warningValues === null
    ) {
      return null;
    }
    const capturedWarnings: CompleteParseContract["warnings"][number][] =
      [];
    for (const warningValue of warningValues) {
      const warning = captureDependencyWarning(warningValue);
      if (warning === null) return null;
      capturedWarnings.push(warning);
    }
    return Object.freeze({
      ok: true,
      draft: capturedDraft,
      canonicalText: canonicalText.value,
      warnings: Object.freeze(capturedWarnings),
    });
  }
  const sourceText = captureDependencyField(value, "sourceText");
  const diagnostics = captureDependencyField(value, "diagnostics");
  const insertableChords = captureDependencyField(
    value,
    "insertableChords",
  );
  const diagnosticValues = captureDependencyArray(
    diagnostics?.value,
    1,
    MAX_A0_U1_FRAGMENT_SOURCE_CODE_POINTS,
  );
  const insertableLength = captureDependencyArrayLength(
    insertableChords?.value,
    0,
    MAX_A0_U1_FRAGMENT_EVENTS,
  );
  if (
    sourceText?.value !== expectedSourceText ||
    diagnosticValues === null ||
    insertableLength === null
  ) {
    return null;
  }
  const capturedDiagnostics: FailedParseContract["diagnostics"][number][] =
    [];
  for (const diagnosticValue of diagnosticValues) {
    const diagnostic = captureDependencyDiagnostic(diagnosticValue);
    if (diagnostic === null) return null;
    capturedDiagnostics.push(diagnostic);
  }
  const capturedInsertableChords: InsertableChartChord[] = [];
  if (source.kind === "recovered-chord") {
    for (let index = 0; index < insertableLength; index += 1) {
      const insertableValue = captureDependencyArrayItem(
        insertableChords?.value,
        index,
      );
      if (insertableValue === null) return null;
      const insertable = captureDependencyInsertableChord(
        insertableValue.value,
      );
      if (insertable === null) return null;
      capturedInsertableChords.push(insertable);
      if (insertable.ordinal === source.selectedGlobalOrdinal) break;
    }
  }
  return Object.freeze({
    ok: false,
    sourceText: expectedSourceText,
    diagnostics:
      Object.freeze(
        capturedDiagnostics,
      ) as FailedParseContract["diagnostics"],
    insertableChords: Object.freeze(capturedInsertableChords),
    returnedInsertableChordCount: insertableLength,
  });
}

type CapturedStableIdFactoryResult =
  | Readonly<{ ok: true; value: string }>
  | Readonly<{ ok: false }>;

function captureStableIdFactoryResult(
  value: unknown,
): CapturedStableIdFactoryResult | null {
  const ok = captureDependencyField(value, "ok");
  if (ok === null || typeof ok.value !== "boolean") return null;
  if (!ok.value) {
    const refusal = captureDependencyField(value, "refusal");
    return refusal !== null && isDependencyRecord(refusal.value)
      ? Object.freeze({ ok: false })
      : null;
  }
  const id = captureDependencyField(value, "value");
  const source = captureDependencyField(value, "source");
  if (
    id === null ||
    typeof id.value !== "string" ||
    id.value.length === 0 ||
    source === null ||
    ![
      "crypto.randomUUID",
      "crypto.getRandomValues",
      "deterministic-test",
    ].some((candidate) => candidate === source.value)
  ) {
    return null;
  }
  return Object.freeze({ ok: true, value: id.value });
}

type CapturedStructuralResult =
  | Readonly<{
      ok: true;
      value: Extract<
        ReturnType<AtomicEditPlanDependencies["decodeDocumentShape"]>,
        { ok: true }
      >["value"];
    }>
  | Readonly<{ ok: false }>;

function captureStructuralResult(
  value: unknown,
): CapturedStructuralResult | null {
  const ok = captureDependencyField(value, "ok");
  if (ok === null || typeof ok.value !== "boolean") return null;
  if (!ok.value) {
    const errors = captureDependencyField(value, "errors");
    return !hasNonemptyDependencyArray(errors?.value)
      ? null
      : Object.freeze({ ok: false });
  }
  const candidate = captureDependencyField(value, "value");
  const warnings = captureDependencyField(value, "warnings");
  if (
    candidate === null ||
    !isDependencyRecord(candidate.value) ||
    captureDependencyArray(warnings?.value, 0, 0) === null
  ) {
    return null;
  }
  return Object.freeze({
    ok: true,
    value: candidate.value as Extract<
      ReturnType<AtomicEditPlanDependencies["decodeDocumentShape"]>,
      { ok: true }
    >["value"],
  });
}

type CapturedSemanticResult =
  | Readonly<{ ok: true; value: object }>
  | Readonly<{ ok: false }>;

function captureSemanticResult(
  value: unknown,
): CapturedSemanticResult | null {
  const ok = captureDependencyField(value, "ok");
  if (ok === null || typeof ok.value !== "boolean") return null;
  if (!ok.value) {
    const errors = captureDependencyField(value, "errors");
    return !hasNonemptyDependencyArray(errors?.value)
      ? null
      : Object.freeze({ ok: false });
  }
  const document = captureDependencyField(value, "value");
  const warnings = captureDependencyField(value, "warnings");
  if (
    document === null ||
    !isDependencyRecord(document.value) ||
    captureDependencyArray(warnings?.value, 0, 0) === null
  ) {
    return null;
  }
  return Object.freeze({
    ok: true,
    value: document.value,
  });
}

function isCapturedSemanticSuccess(
  value: ReturnType<
    AtomicEditPlanDependencies["validateDocumentSemantics"]
  >,
  captured: CapturedSemanticResult,
): value is Extract<
  ReturnType<
    AtomicEditPlanDependencies["validateDocumentSemantics"]
  >,
  { ok: true }
> {
  return captured.ok;
}

const MAX_F3_PUBLICATION_RECORDS = 1_000_000;
const MAX_F3_PUBLICATION_PROPERTIES = 1_000_000;

type DeepFrozenCaptureState = {
  records: number;
  properties: number;
  active: WeakSet<object>;
  visited: WeakSet<object>;
};

function isDeepFrozenDependencyValue(
  value: unknown,
  state: DeepFrozenCaptureState,
  depth: number,
): boolean {
  if (typeof value !== "object" || value === null) {
    return typeof value !== "function";
  }
  if (
    depth > MAX_JSON_NESTING_DEPTH ||
    state.active.has(value) ||
    state.records >= MAX_F3_PUBLICATION_RECORDS
  ) {
    return false;
  }
  if (state.visited.has(value)) return true;
  state.records += 1;
  state.active.add(value);
  try {
    if (!Object.isFrozen(value)) return false;
    const keys = Reflect.ownKeys(value);
    state.properties += keys.length;
    if (state.properties > MAX_F3_PUBLICATION_PROPERTIES) {
      return false;
    }
    for (const key of keys) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !Object.hasOwn(descriptor, "value")
      ) {
        return false;
      }
      const child: unknown = descriptor.value;
      if (!isDeepFrozenDependencyValue(child, state, depth + 1)) {
        return false;
      }
    }
    state.visited.add(value);
    return true;
  } catch {
    return false;
  } finally {
    state.active.delete(value);
  }
}

function isDeepFrozenDependencyDocument(value: unknown): boolean {
  return isDeepFrozenDependencyValue(
    value,
    {
      records: 0,
      properties: 0,
      active: new WeakSet(),
      visited: new WeakSet(),
    },
    0,
  );
}

type AtomicFailureParts = Readonly<{
  state: AtomicEditPlanAppState;
  outerWork: MutableApplicationWorkCounters;
  path: DomainPath;
  diagnostics: readonly AtomicEditPlanDiagnostic[];
  work: AtomicEditPlanWorkEvidence;
}>;

/**
 * Build one type-correlated postplan failure branch. The generic outer code
 * carries the frozen nested-to-outer refusal correlation through the result
 * type instead of laundering it with an assertion.
 */
function correlatedAtomicFailure<
  OuterCode extends AtomicEditPlanOuterRefusalCode,
>(
  outerCode: OuterCode,
  code: AtomicEditPlanRefusalCodeForOuter<OuterCode>,
  parts: AtomicFailureParts,
): AtomicEditPlanFailureForOuterCode<OuterCode> {
  const appended = appendApplicationNotice(
    parts.state,
    "error",
    outerCode,
    ATOMIC_EDIT_REFUSAL_MESSAGE,
  );
  return Object.freeze({
    ok: false,
    state: appended.state,
    refusal: Object.freeze({
      code: outerCode,
      path: Object.freeze([...parts.path]),
      message: ATOMIC_EDIT_REFUSAL_MESSAGE,
    }),
    notice: appended.notice,
    effects: NO_ATOMIC_EDIT_EFFECTS,
    counters: freezeWorkCounters(parts.outerWork),
    editPlanRefusal: Object.freeze({
      code,
      outerCode,
      path: Object.freeze([...parts.path]),
      diagnostics: parts.diagnostics,
      work: parts.work,
    }),
  });
}

function atomicFailure(
  state: AtomicEditPlanAppState,
  outerWork: MutableApplicationWorkCounters,
  planWork: MutableAtomicEditPlanWork,
  failure: PlanFailure,
  termination:
    | "input-refusal"
    | "allocation-refusal"
    | "publication-refusal"
    | "history-refusal",
): AtomicEditPlanTransitionResult {
  const sourceDiagnostics =
    failure.diagnostics ??
    Object.freeze([
      atomicEditPlanDiagnostic(failure.code, failure.path),
    ]);
  const parts: AtomicFailureParts = Object.freeze({
    state,
    outerWork,
    path: failure.path,
    diagnostics: sortAndRetainAtomicEditPlanDiagnostics(
      sourceDiagnostics,
      planWork,
    ),
    work: freezeAtomicEditPlanWork(planWork, termination),
  });
  switch (failure.code) {
    case "edit-plan.target-missing":
      return correlatedAtomicFailure(
        "command.target_missing",
        failure.code,
        parts,
      );
    case "edit-plan.destination-invalid":
    case "edit-plan.event-order-invalid":
    case "edit-plan.section-split-boundary-invalid":
    case "edit-plan.measure-split-boundary-invalid":
    case "edit-plan.section-order-invalid":
      return correlatedAtomicFailure(
        "command.destination_invalid",
        failure.code,
        parts,
      );
    case "edit-plan.id-factory-failed":
    case "edit-plan.id-collision":
      return correlatedAtomicFailure(
        "command.id_allocation_failed",
        failure.code,
        parts,
      );
    case "edit-plan.structural-publication-refused":
      return correlatedAtomicFailure(
        "command.structural_validation_failed",
        failure.code,
        parts,
      );
    case "edit-plan.semantic-publication-refused":
      return correlatedAtomicFailure(
        "command.semantic_validation_failed",
        failure.code,
        parts,
      );
    case "edit-plan.history-refused": {
      const historyOuterCode = failure.historyOuterCode ?? null;
      if (historyOuterCode === null) {
        throw new Error("A0_U1_INTERNAL_HISTORY_OUTER_CODE");
      }
      return historyOuterCode === "history.entry_too_large"
        ? correlatedAtomicFailure(
            "history.entry_too_large",
            failure.code,
            parts,
          )
        : correlatedAtomicFailure(
            "history.byte_estimate_invalid",
            failure.code,
            parts,
          );
    }
    case "edit-plan.command-shape-invalid":
    case "edit-plan.plan-shape-invalid":
    case "edit-plan.quick-entry-snapshot-mismatch":
    case "edit-plan.source-code-points-exceeded":
    case "edit-plan.source-unicode-invalid":
    case "edit-plan.source-utf8-bytes-exceeded":
    case "edit-plan.recovered-chord-placement-invalid":
    case "edit-plan.syntax-refused":
    case "edit-plan.recovered-chord-requires-parse-failure":
    case "edit-plan.recovered-chord-ordinal-missing":
    case "edit-plan.warning-acknowledgements-mismatch":
    case "edit-plan.fragment-placement-mismatch":
    case "edit-plan.completion-declarations-mismatch":
    case "edit-plan.section-metadata-mismatch":
    case "edit-plan.recovered-chord-layout-loss-unacknowledged":
    case "edit-plan.recovered-chord-duration-mismatch":
    case "edit-plan.duration-invalid":
    case "edit-plan.duration-sum-mismatch":
    case "edit-plan.measure-partition-mismatch":
    case "edit-plan.event-content-mismatch":
    case "edit-plan.right-annotation-not-empty":
    case "edit-plan.collection-limit-exceeded":
    case "edit-plan.timeline-limit-exceeded":
      return correlatedAtomicFailure(
        "command.payload_invalid",
        failure.code,
        parts,
      );
  }
}

function preplanFailure(
  state: AtomicEditPlanAppState,
  outerWork: MutableApplicationWorkCounters,
  failure: AtomicPreplanFailure,
): AtomicEditPlanTransitionResult {
  const appended = appendApplicationNotice(
    state,
    "error",
    failure.code,
    ATOMIC_EDIT_REFUSAL_MESSAGE,
  );
  const refusal = Object.freeze({
    code: failure.code,
    path: Object.freeze([...failure.path]),
    message: ATOMIC_EDIT_REFUSAL_MESSAGE,
  });
  const result: AtomicEditPlanTransitionResult = Object.freeze({
    ok: false,
    state: appended.state,
    refusal,
    notice: appended.notice,
    effects: NO_ATOMIC_EDIT_EFFECTS,
    counters: freezeWorkCounters(outerWork),
    editPlanRefusal: null,
  });
  return result;
}

function envelopeFailure(
  state: AtomicEditPlanAppState,
  command: ApplyEditPlanCommand,
): AtomicPreplanFailure | null {
  if (!isBoundedToken(command.id, MAX_COMMAND_ID_CODE_POINTS)) {
    return { code: "command.id_invalid", path: ["id"] };
  }
  if (!isBoundedToken(command.label, MAX_COMMAND_LABEL_CODE_POINTS)) {
    return { code: "command.label_invalid", path: ["label"] };
  }
  if (!isNonnegativeSafeInteger(command.logicalTimeMs)) {
    return {
      code: "command.logical_time_invalid",
      path: ["logicalTimeMs"],
    };
  }
  const latest = state.history.undo[state.history.undo.length - 1];
  if (
    latest !== undefined &&
    command.logicalTimeMs < latest.lastLogicalTimeMs
  ) {
    return {
      code: "command.logical_time_invalid",
      path: ["logicalTimeMs"],
    };
  }
  if (command.expectedDocumentId !== state.document.id) {
    return { code: "command.wrong_document", path: ["expectedDocumentId"] };
  }
  if (command.expectedRevision !== state.revision) {
    return { code: "command.stale_revision", path: ["expectedRevision"] };
  }
  if (state.revision >= MAX_APPLICATION_REVISION) {
    return {
      code: "application.revision_exhausted",
      path: ["revision"],
    };
  }
  if (state.nextSequence >= MAX_APPLICATION_SEQUENCE) {
    return {
      code: "application.sequence_exhausted",
      path: ["nextSequence"],
    };
  }
  if (
    state.documentTransition.kind === "retiring-transport" ||
    state.documentTransition.kind === "committing" ||
    state.dialogs.some(
      (dialog) => dialog.blocksHistory && dialog.phase === "committing",
    )
  ) {
    return { code: "history.locked", path: ["history"] };
  }
  return null;
}

function firstSequenceMismatch(
  left: readonly unknown[],
  right: readonly unknown[],
  equal: (leftValue: unknown, rightValue: unknown) => boolean,
): number | null {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (!equal(left[index], right[index])) return index;
  }
  return null;
}

function snapshotFailure(
  state: AtomicEditPlanAppState,
  plan: Extract<AtomicEditPlan, { kind: "insert-fragment" }>,
  work: MutableAtomicEditPlanWork,
): PlanFailure | null {
  const source = plan.source;
  const snapshot = source.quickEntrySnapshot;
  work.quickEntrySnapshotFieldsCompared += 1;
  if (snapshot.sourceText !== state.quickEntry.text) {
    return {
      code: "edit-plan.quick-entry-snapshot-mismatch",
      path: ["plan", "source", "quickEntrySnapshot", "sourceText"],
    };
  }
  work.quickEntrySnapshotFieldsCompared += 1;
  if (
    snapshot.baseRevision !== state.quickEntry.baseRevision ||
    snapshot.baseRevision !== state.revision
  ) {
    return {
      code: "edit-plan.quick-entry-snapshot-mismatch",
      path: ["plan", "source", "quickEntrySnapshot", "baseRevision"],
    };
  }
  work.quickEntrySnapshotFieldsCompared += 1;
  if (
    state.quickEntry.target === null ||
    !deepStructuralEqual(snapshot.target, state.quickEntry.target)
  ) {
    return {
      code: "edit-plan.quick-entry-snapshot-mismatch",
      path: ["plan", "source", "quickEntrySnapshot", "target"],
    };
  }
  work.quickEntrySnapshotFieldsCompared += 1;
  const issueMismatch = firstSequenceMismatch(
    snapshot.issueCodes,
    state.quickEntry.issueCodes,
    (left, right) => left === right,
  );
  work.quickEntryIssueCodesCompared =
    issueMismatch === null
      ? snapshot.issueCodes.length
      : Math.min(
          issueMismatch + 1,
          MAX_A0_U1_QUICK_ENTRY_ISSUE_CODES + 1,
        );
  if (issueMismatch !== null) {
    return {
      code: "edit-plan.quick-entry-snapshot-mismatch",
      path: [
        "plan",
        "source",
        "quickEntrySnapshot",
        "issueCodes",
        issueMismatch,
      ],
    };
  }
  work.quickEntrySnapshotFieldsCompared += 1;
  if (snapshot.expectedStatus !== state.quickEntry.status) {
    return {
      code: "edit-plan.quick-entry-snapshot-mismatch",
      path: ["plan", "source", "quickEntrySnapshot", "expectedStatus"],
    };
  }
  work.quickEntrySnapshotFieldsCompared += 1;
  if (
    snapshot.expectedLane !== source.kind ||
    (source.kind === "complete-draft" &&
      snapshot.expectedStatus !== "ready") ||
    (source.kind === "recovered-chord" &&
      snapshot.expectedStatus !== "invalid")
  ) {
    return {
      code: "edit-plan.quick-entry-snapshot-mismatch",
      path: ["plan", "source", "quickEntrySnapshot", "expectedLane"],
    };
  }
  return null;
}

function sourceFailure(
  sourceText: string,
  work: MutableAtomicEditPlanWork,
): PlanFailure | null {
  let codePoints = 0;
  for (let index = 0; index < sourceText.length; index += 1) {
    const unit = sourceText.charCodeAt(index);
    codePoints += 1;
    work.sourceCodePointsObserved = codePoints;
    if (codePoints > MAX_A0_U1_FRAGMENT_SOURCE_CODE_POINTS) {
      return {
        code: "edit-plan.source-code-points-exceeded",
        path: ["plan", "source", "quickEntrySnapshot", "sourceText"],
        diagnostics: Object.freeze([
          atomicEditPlanDiagnostic(
            "edit-plan.source-code-points-exceeded",
            ["plan", "source", "quickEntrySnapshot", "sourceText"],
            {
              observed: codePoints,
              maximum: MAX_A0_U1_FRAGMENT_SOURCE_CODE_POINTS,
            },
          ),
        ]),
      };
    }
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = sourceText.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return {
          code: "edit-plan.source-unicode-invalid",
          path: ["plan", "source", "quickEntrySnapshot", "sourceText"],
        };
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return {
        code: "edit-plan.source-unicode-invalid",
        path: ["plan", "source", "quickEntrySnapshot", "sourceText"],
      };
    }
  }
  const utf8Bytes = new TextEncoder().encode(sourceText).byteLength;
  work.sourceUtf8BytesObserved = Math.min(
    utf8Bytes,
    MAX_A0_U1_FRAGMENT_SOURCE_UTF8_BYTES + 1,
  );
  if (utf8Bytes > MAX_A0_U1_FRAGMENT_SOURCE_UTF8_BYTES) {
    return {
      code: "edit-plan.source-utf8-bytes-exceeded",
      path: ["plan", "source", "quickEntrySnapshot", "sourceText"],
      diagnostics: Object.freeze([
        atomicEditPlanDiagnostic(
          "edit-plan.source-utf8-bytes-exceeded",
          ["plan", "source", "quickEntrySnapshot", "sourceText"],
          {
            observed: Math.min(
              utf8Bytes,
              MAX_A0_U1_FRAGMENT_SOURCE_UTF8_BYTES + 1,
            ),
            maximum: MAX_A0_U1_FRAGMENT_SOURCE_UTF8_BYTES,
          },
        ),
      ]),
    };
  }
  return null;
}

type CanonicalSlot =
  | Readonly<{
      kind: "measure";
      parentId: MeasureId;
      beforeId: ChordEventId | null;
    }>
  | Readonly<{
      kind: "section";
      parentId: SectionId;
      beforeId: MeasureId | null;
    }>
  | Readonly<{
      kind: "document";
      parentId: DocumentId;
      beforeId: SectionId | null;
    }>;

function boundarySlot(
  boundary: StableBoundary,
  documentId: DocumentId,
  index: DocumentIndex,
): CanonicalSlot | null {
  switch (boundary.kind) {
    case "document-start":
      return {
        kind: "document",
        parentId: documentId,
        beforeId: index.sectionOrder[0] ?? null,
      };
    case "document-end":
      return { kind: "document", parentId: documentId, beforeId: null };
    case "before-section": {
      const section = index.sections.get(boundary.sectionId);
      return section === undefined
        ? null
        : {
            kind: "document",
            parentId: documentId,
            beforeId: section.id,
          };
    }
    case "after-section": {
      const section = index.sections.get(boundary.sectionId);
      if (section === undefined) return null;
      return {
        kind: "document",
        parentId: documentId,
        beforeId: index.sectionOrder[section.sectionIndex + 1] ?? null,
      };
    }
    case "section-start":
    case "section-end": {
      const section = index.sections.get(boundary.sectionId);
      if (section === undefined) return null;
      return {
        kind: "section",
        parentId: section.id,
        beforeId:
          boundary.kind === "section-start"
            ? section.section.measures[0]?.id ?? null
            : null,
      };
    }
    case "before-measure": {
      const measure = index.measures.get(boundary.measureId);
      return measure === undefined
        ? null
        : {
            kind: "section",
            parentId: measure.sectionId,
            beforeId: measure.id,
          };
    }
    case "after-measure": {
      const measure = index.measures.get(boundary.measureId);
      if (measure === undefined) return null;
      const section = index.sections.get(measure.sectionId);
      return section === undefined
        ? null
        : {
            kind: "section",
            parentId: measure.sectionId,
            beforeId:
              section.section.measures[measure.measureIndex + 1]?.id ?? null,
          };
    }
    case "measure-start":
    case "measure-end": {
      const measure = index.measures.get(boundary.measureId);
      if (measure === undefined) return null;
      return {
        kind: "measure",
        parentId: measure.id,
        beforeId:
          boundary.kind === "measure-start"
            ? measure.measure.events[0]?.id ?? null
            : null,
      };
    }
    case "before-event": {
      const event = index.events.get(boundary.eventId);
      return event === undefined
        ? null
        : {
            kind: "measure",
            parentId: event.measureId,
            beforeId: event.id,
          };
    }
    case "after-event": {
      const event = index.events.get(boundary.eventId);
      if (event === undefined) return null;
      const measure = index.measures.get(event.measureId);
      return measure === undefined
        ? null
        : {
            kind: "measure",
            parentId: event.measureId,
            beforeId:
              measure.measure.events[event.eventIndex + 1]?.id ?? null,
          };
    }
  }
}

function targetFailure(
  state: AtomicEditPlanAppState,
  plan: AtomicEditPlan,
  index: DocumentIndex,
  work: MutableAtomicEditPlanWork,
): PlanFailure | null {
  if (plan.kind === "insert-fragment") {
    if (plan.source.kind === "recovered-chord") {
      work.recoveryFieldsCompared = 1;
    }
    const placement = plan.placement;
    let declared: CanonicalSlot;
    if (placement.kind === "into-measure") {
      const measure = index.measures.get(placement.measureId);
      if (measure === undefined) {
        return {
          code: "edit-plan.target-missing",
          path: ["plan", "placement", "measureId"],
        };
      }
      if (placement.beforeEventId !== null) {
        const before = index.events.get(placement.beforeEventId);
        if (before === undefined) {
          return {
            code: "edit-plan.target-missing",
            path: ["plan", "placement", "beforeEventId"],
          };
        }
      }
      if (
        plan.source.kind === "complete-draft" &&
        (placement.beforeEventId !== null ||
          measure.measure.events.length !== 0 ||
          measure.measure.completion.kind !== "empty")
      ) {
        return {
          code: "edit-plan.destination-invalid",
          path: ["plan", "placement"],
        };
      }
      if (placement.beforeEventId !== null) {
        const before = index.events.get(placement.beforeEventId);
        if (before?.measureId !== measure.id) {
          return {
            code: "edit-plan.destination-invalid",
            path: ["plan", "placement", "beforeEventId"],
          };
        }
      }
      declared = {
        kind: "measure",
        parentId: measure.id,
        beforeId: placement.beforeEventId,
      };
    } else if (placement.kind === "into-section") {
      const section = index.sections.get(placement.sectionId);
      if (section === undefined) {
        return {
          code: "edit-plan.target-missing",
          path: ["plan", "placement", "sectionId"],
        };
      }
      if (placement.beforeMeasureId !== null) {
        const before = index.measures.get(placement.beforeMeasureId);
        if (before === undefined) {
          return {
            code: "edit-plan.target-missing",
            path: ["plan", "placement", "beforeMeasureId"],
          };
        }
        if (before.sectionId !== section.id) {
          return {
            code: "edit-plan.destination-invalid",
            path: ["plan", "placement", "beforeMeasureId"],
          };
        }
      }
      if (plan.source.kind === "recovered-chord") {
        return {
          code: "edit-plan.recovered-chord-placement-invalid",
          path: ["plan", "placement"],
        };
      }
      declared = {
        kind: "section",
        parentId: section.id,
        beforeId: placement.beforeMeasureId,
      };
    } else {
      if (
        placement.beforeSectionId !== null &&
        !index.sections.has(placement.beforeSectionId)
      ) {
        return {
          code: "edit-plan.target-missing",
          path: ["plan", "placement", "beforeSectionId"],
        };
      }
      if (plan.source.kind === "recovered-chord") {
        return {
          code: "edit-plan.recovered-chord-placement-invalid",
          path: ["plan", "placement"],
        };
      }
      declared = {
        kind: "document",
        parentId: state.document.id,
        beforeId: placement.beforeSectionId,
      };
    }
    const target = boundarySlot(
      plan.source.quickEntrySnapshot.target,
      state.document.id,
      index,
    );
    if (target === null) {
      return {
        code: "edit-plan.target-missing",
        path: ["plan", "source", "quickEntrySnapshot", "target"],
      };
    }
    if (!deepStructuralEqual(target, declared)) {
      return {
        code: "edit-plan.destination-invalid",
        path: ["plan", "placement"],
      };
    }
    if (
      plan.source.kind === "complete-draft" &&
      placement.kind === "into-measure" &&
      !(
        (plan.source.quickEntrySnapshot.target.kind === "measure-start" ||
          plan.source.quickEntrySnapshot.target.kind === "measure-end") &&
        plan.source.quickEntrySnapshot.target.measureId ===
          placement.measureId
      )
    ) {
      return {
        code: "edit-plan.destination-invalid",
        path: ["plan", "source", "quickEntrySnapshot", "target"],
      };
    }
    return null;
  }

  if (plan.kind === "split-event-duration") {
    if (!index.events.has(plan.eventId)) {
      return {
        code: "edit-plan.target-missing",
        path: ["plan", "eventId"],
      };
    }
    return null;
  }
  if (plan.kind === "join-event-durations") {
    const left = index.events.get(plan.leftEventId);
    if (left === undefined) {
      return {
        code: "edit-plan.target-missing",
        path: ["plan", "leftEventId"],
      };
    }
    const right = index.events.get(plan.rightEventId);
    if (right === undefined) {
      return {
        code: "edit-plan.target-missing",
        path: ["plan", "rightEventId"],
      };
    }
    if (
      left.measureId !== right.measureId ||
      right.eventIndex !== left.eventIndex + 1
    ) {
      return {
        code: "edit-plan.event-order-invalid",
        path: ["plan", "rightEventId"],
      };
    }
    return null;
  }
  if (plan.kind === "split-section") {
    const section = index.sections.get(plan.sectionId);
    if (section === undefined) {
      return {
        code: "edit-plan.target-missing",
        path: ["plan", "sectionId"],
      };
    }
    const boundary = index.measures.get(plan.beforeMeasureId);
    if (boundary === undefined) {
      return {
        code: "edit-plan.target-missing",
        path: ["plan", "beforeMeasureId"],
      };
    }
    if (
      boundary.sectionId !== section.id ||
      boundary.measureIndex <= 0 ||
      boundary.measureIndex >= section.section.measures.length
    ) {
      return {
        code: "edit-plan.section-split-boundary-invalid",
        path: ["plan", "beforeMeasureId"],
      };
    }
    return null;
  }
  if (plan.kind === "split-measure") {
    const measure = index.measures.get(plan.measureId);
    if (measure === undefined) {
      return {
        code: "edit-plan.target-missing",
        path: ["plan", "measureId"],
      };
    }
    const boundary = index.events.get(plan.beforeEventId);
    if (boundary === undefined) {
      return {
        code: "edit-plan.target-missing",
        path: ["plan", "beforeEventId"],
      };
    }
    /*
     * Strict interior: the boundary event must belong to the target measure,
     * at least one event must remain in the retained measure, and at least one
     * must move. Neither result may be empty, so the operation is never a
     * no-op dressed as a split.
     */
    if (
      boundary.measureId !== measure.id ||
      boundary.eventIndex <= 0 ||
      boundary.eventIndex >= measure.measure.events.length
    ) {
      return {
        code: "edit-plan.measure-split-boundary-invalid",
        path: ["plan", "beforeEventId"],
      };
    }
    return null;
  }
  const left = index.sections.get(plan.leftSectionId);
  if (left === undefined) {
    return {
      code: "edit-plan.target-missing",
      path: ["plan", "leftSectionId"],
    };
  }
  const right = index.sections.get(plan.rightSectionId);
  if (right === undefined) {
    return {
      code: "edit-plan.target-missing",
      path: ["plan", "rightSectionId"],
    };
  }
  if (right.sectionIndex !== left.sectionIndex + 1) {
    return {
      code: "edit-plan.section-order-invalid",
      path: ["plan", "rightSectionId"],
    };
  }
  return null;
}

type PrepareResult =
  | Readonly<{ ok: true; prepared: PreparedPlan }>
  | Readonly<{ ok: false; failure: PlanFailure }>;

function parserCall(
  state: AtomicEditPlanAppState,
  command: ApplyEditPlanCommand,
  dependencies: AtomicEditPlanDependencies,
  work: MutableAtomicEditPlanWork,
): OperationalParse | PlanFailure {
  if (command.plan.kind !== "insert-fragment") {
    throw new Error("A0_U1_INTERNAL_NONINSERT_PARSE");
  }
  work.syntaxParseCalls += 1;
  let returned: unknown;
  try {
    returned = dependencies.parseChartText(
      command.plan.source.quickEntrySnapshot.sourceText,
      Object.freeze({ mode: "fragment", meter: state.document.meter }),
      A0_U1_FRAGMENT_PARSE_ACCIDENTAL_STYLE,
    );
  } catch {
    return {
      code: "edit-plan.syntax-refused",
      path: ["plan", "source", "quickEntrySnapshot", "sourceText"],
    };
  }
  const captured = captureChartTextParseResult(
    returned,
    command.plan.source,
  );
  if (captured === null) {
    return {
      code: "edit-plan.syntax-refused",
      path: ["plan", "source", "quickEntrySnapshot", "sourceText"],
    };
  }
  return captured;
}

function warningAcknowledgementFailure(
  parse: CompleteParse,
  plan: Extract<
    AtomicEditPlan,
    { kind: "insert-fragment"; source: { kind: "complete-draft" } }
  >,
  work: MutableAtomicEditPlanWork,
): PlanFailure | null {
  const acknowledgements = plan.source.warningAcknowledgements;
  const warnings = parse.warnings;
  const mismatch = firstSequenceMismatch(
    acknowledgements,
    warnings,
    (left, right) => {
      if (
        typeof left !== "object" ||
        left === null ||
        typeof right !== "object" ||
        right === null ||
        !("code" in left) ||
        !("code" in right) ||
        !("range" in left) ||
        !("range" in right)
      ) {
        return false;
      }
      return (
        left.code === right.code &&
        deepStructuralEqual(left.range, right.range)
      );
    },
  );
  work.warningAcknowledgementsCompared =
    mismatch === null
      ? acknowledgements.length
      : Math.min(
          mismatch + 1,
          MAX_A0_U1_RETAINED_WARNING_ACKNOWLEDGEMENTS + 1,
        );
  return mismatch === null
    ? null
    : {
        code: "edit-plan.warning-acknowledgements-mismatch",
        path: ["plan", "source", "warningAcknowledgements", mismatch],
        diagnostics: Object.freeze([
          atomicEditPlanDiagnostic(
            "edit-plan.warning-acknowledgements-mismatch",
            ["plan", "source", "warningAcknowledgements", mismatch],
            {
              sourceRange:
                warnings[mismatch]?.range ??
                acknowledgements[mismatch]?.range ??
                null,
            },
          ),
        ]),
      };
}

function countDraft(
  draft: OperationalDraft,
  work: MutableAtomicEditPlanWork,
): boolean {
  let sectionCount = 0;
  let measureCount = 0;
  let eventCount = 0;
  let exceeded = false;
  for (const section of draft.sections) {
    sectionCount += 1;
    if (sectionCount > MAX_A0_U1_FRAGMENT_SECTIONS) {
      exceeded = true;
      break;
    }
    let sectionMeasureCount = 0;
    for (const measure of section.measures) {
      sectionMeasureCount += 1;
      measureCount += 1;
      if (
        sectionMeasureCount > MAX_SECTION_MEASURES ||
        measureCount > MAX_A0_U1_FRAGMENT_MEASURES
      ) {
        exceeded = true;
        break;
      }
      for (
        let eventIndex = 0;
        eventIndex < measure.events.length;
        eventIndex += 1
      ) {
        eventCount += 1;
        if (eventCount > MAX_A0_U1_FRAGMENT_EVENTS) {
          exceeded = true;
          break;
        }
      }
      if (exceeded) break;
    }
    if (exceeded) break;
  }
  work.draftSectionsVisited = sectionCount;
  work.draftMeasuresVisited = measureCount;
  work.draftEventsVisited = eventCount;
  work.planNodesVisited += sectionCount + measureCount + eventCount;
  work.peakPlanNodeRecords = Math.max(
    work.peakPlanNodeRecords,
    work.planNodesVisited,
  );
  return exceeded;
}

function retainedDraftRecordCount(draft: OperationalDraft): number {
  let records = 1;
  let sections = 0;
  let measures = 0;
  let events = 0;
  for (const section of draft.sections) {
    sections += 1;
    records += 1;
    if (sections > MAX_A0_U1_FRAGMENT_SECTIONS) break;
    let sectionMeasures = 0;
    for (const measure of section.measures) {
      sectionMeasures += 1;
      measures += 1;
      records += 1;
      if (
        sectionMeasures > MAX_SECTION_MEASURES ||
        measures > MAX_A0_U1_FRAGMENT_MEASURES
      ) {
        return records;
      }
      for (
        let eventIndex = 0;
        eventIndex < measure.events.length;
        eventIndex += 1
      ) {
        events += 1;
        records += 1;
        if (events > MAX_A0_U1_FRAGMENT_EVENTS) return records;
      }
    }
  }
  return records;
}

function completeInsertPreparation(
  parse: CompleteParse,
  plan: Extract<
    AtomicEditPlan,
    { kind: "insert-fragment"; source: { kind: "complete-draft" } }
  >,
  work: MutableAtomicEditPlanWork,
): PrepareResult {
  const warningFailure = warningAcknowledgementFailure(parse, plan, work);
  if (warningFailure !== null) return { ok: false, failure: warningFailure };
  const draftExceeded = countDraft(parse.draft, work);
  if (
    draftExceeded ||
    work.draftSectionsVisited > MAX_A0_U1_FRAGMENT_SECTIONS ||
    work.draftMeasuresVisited > MAX_A0_U1_FRAGMENT_MEASURES ||
    work.draftEventsVisited > MAX_A0_U1_FRAGMENT_EVENTS
  ) {
    return {
      ok: false,
      failure: {
        code: "edit-plan.collection-limit-exceeded",
        path: ["plan"],
      },
    };
  }

  const specs: AllocationSpec[] = [];
  const placement = plan.placement;
  if (placement.kind === "into-measure") {
    const section = parse.draft.sections[0];
    const measure = section?.measures[0];
    if (
      parse.draft.sections.length !== 1 ||
      section?.kind !== "implicit" ||
      section.measures.length !== 1 ||
      measure === undefined ||
      measure.events.length === 0
    ) {
      return {
        ok: false,
        failure: {
          code: "edit-plan.fragment-placement-mismatch",
          path: ["plan", "placement"],
        },
      };
    }
    for (const event of measure.events) {
      specs.push({
        kind: "event",
        source: Object.freeze({
          kind: "fragment-event",
          sourceEventOrdinal: event.ordinal,
        }),
      });
    }
  } else if (placement.kind === "into-section") {
    const section = parse.draft.sections[0];
    if (
      parse.draft.sections.length !== 1 ||
      section?.kind !== "implicit" ||
      section.measures.length === 0
    ) {
      return {
        ok: false,
        failure: {
          code: "edit-plan.fragment-placement-mismatch",
          path: ["plan", "placement"],
        },
      };
    }
    for (const measure of section.measures) {
      specs.push({
        kind: "measure",
        source: Object.freeze({
          kind: "fragment-measure",
          sourceSectionOrdinal: section.ordinal,
          sourceMeasureOrdinal: measure.ordinal,
        }),
      });
      for (const event of measure.events) {
        specs.push({
          kind: "event",
          source: Object.freeze({
            kind: "fragment-event",
            sourceEventOrdinal: event.ordinal,
          }),
        });
      }
    }
  } else {
    if (
      parse.draft.sections.length === 0 ||
      parse.draft.sections.some(
        (section) => section.kind !== "named" || section.name === null,
      )
    ) {
      return {
        ok: false,
        failure: {
          code: "edit-plan.fragment-placement-mismatch",
          path: ["plan", "placement"],
        },
      };
    }
    const declarations = placement.sectionDeclarations;
    const declarationMismatch = firstSequenceMismatch(
      declarations,
      parse.draft.sections,
      (left, right) =>
        typeof left === "object" &&
        left !== null &&
        typeof right === "object" &&
        right !== null &&
        "sourceSectionOrdinal" in left &&
        "ordinal" in right &&
        left.sourceSectionOrdinal === right.ordinal,
    );
    if (declarationMismatch !== null) {
      return {
        ok: false,
        failure: {
          code: "edit-plan.section-metadata-mismatch",
          path: [
            "plan",
            "placement",
            "sectionDeclarations",
            declarationMismatch,
          ],
        },
      };
    }
    for (const section of parse.draft.sections) {
      specs.push({
        kind: "section",
        source: Object.freeze({
          kind: "fragment-section",
          sourceSectionOrdinal: section.ordinal,
        }),
      });
      for (const measure of section.measures) {
        specs.push({
          kind: "measure",
          source: Object.freeze({
            kind: "fragment-measure",
            sourceSectionOrdinal: section.ordinal,
            sourceMeasureOrdinal: measure.ordinal,
          }),
        });
        for (const event of measure.events) {
          specs.push({
            kind: "event",
            source: Object.freeze({
              kind: "fragment-event",
              sourceEventOrdinal: event.ordinal,
            }),
          });
        }
      }
    }
  }
  return {
    ok: true,
    prepared: Object.freeze({
      kind: "insert-fragment",
      parse,
      selectedRecovery: null,
      allocationSpecs: Object.freeze(specs),
      insertSource: Object.freeze({
        kind: "complete-draft",
        parserOutcome: "success",
        quickEntrySnapshotMatched: true,
        canonicalTargetMatched: true,
        acknowledgedWarningCount: parse.warnings.length,
      }),
    }),
  };
}

function recoveredInsertPreparation(
  parse: FailedParse,
  plan: Extract<
    AtomicEditPlan,
    { kind: "insert-fragment"; source: { kind: "recovered-chord" } }
  >,
  work: MutableAtomicEditPlanWork,
): PrepareResult {
  work.peakDiagnosticRecords = Math.max(
    work.peakDiagnosticRecords,
    Math.min(
      parse.diagnostics.length,
      MAX_A0_U1_RETAINED_DIAGNOSTICS,
    ),
  );
  work.peakPlanNodeRecords = Math.max(
    work.peakPlanNodeRecords,
    1 + parse.returnedInsertableChordCount,
  );
  let selected: InsertableChartChord | null = null;
  for (const chord of parse.insertableChords) {
    work.insertableChordsExamined += 1;
    work.planNodesVisited += 1;
    if (chord.ordinal === plan.source.selectedGlobalOrdinal) {
      selected = chord;
      break;
    }
  }
  work.recoveryFieldsCompared = 2;
  if (selected === null) {
    return {
      ok: false,
      failure: {
        code: "edit-plan.recovered-chord-ordinal-missing",
        path: ["plan", "source", "selectedGlobalOrdinal"],
      },
    };
  }
  const durationSource =
    selected.duration.kind === "resolved"
      ? "t0-resolved"
      : "caller-required";
  return {
    ok: true,
    prepared: Object.freeze({
      kind: "insert-fragment",
      parse,
      selectedRecovery: selected,
      allocationSpecs: Object.freeze([
        Object.freeze({
          kind: "event",
          source: Object.freeze({
            kind: "recovered-chord",
            selectedGlobalOrdinal: plan.source.selectedGlobalOrdinal,
          }),
        }),
      ]),
      insertSource: Object.freeze({
        kind: "recovered-chord",
        parserOutcome: "failure",
        quickEntrySnapshotMatched: true,
        canonicalTargetMatched: true,
        selectedGlobalOrdinal: plan.source.selectedGlobalOrdinal,
        selectedRange: Object.freeze({ ...selected.range }),
        durationSource,
        siblingsApplied: 0,
        layoutLossAcknowledged: true,
      }),
    }),
  };
}

function insertPreparation(
  state: AtomicEditPlanAppState,
  command: ApplyEditPlanCommand,
  dependencies: AtomicEditPlanDependencies,
  work: MutableAtomicEditPlanWork,
): PrepareResult {
  if (command.plan.kind !== "insert-fragment") {
    throw new Error("A0_U1_INTERNAL_INSERT_PREP");
  }
  const plan = command.plan;
  const called = parserCall(state, command, dependencies, work);
  if ("code" in called) return { ok: false, failure: called };
  if (called.ok) {
    work.peakPlanNodeRecords = Math.max(
      work.peakPlanNodeRecords,
      retainedDraftRecordCount(called.draft),
    );
  }
  if (isCompleteInsertPlan(plan)) {
    if (!called.ok) {
      return {
        ok: false,
        failure: {
          code: "edit-plan.syntax-refused",
          path: ["plan", "source", "quickEntrySnapshot", "sourceText"],
          diagnostics: diagnosticsFromChartRefusal(
            "edit-plan.syntax-refused",
            called.diagnostics,
            ["plan", "source", "quickEntrySnapshot", "sourceText"],
          ),
        },
      };
    }
    return completeInsertPreparation(called, plan, work);
  }
  if (called.ok) {
    return {
      ok: false,
      failure: {
        code: "edit-plan.recovered-chord-requires-parse-failure",
        path: ["plan", "source", "kind"],
      },
    };
  }
  return recoveredInsertPreparation(called, plan, work);
}

function declarationArray(plan: AtomicEditPlan) {
  return plan.kind === "insert-fragment"
    ? plan.placement.completionDeclarations
    : plan.completionDeclarations;
}

function completionDeclarationFailure(
  state: AtomicEditPlanAppState,
  plan: AtomicEditPlan,
  index: DocumentIndex,
  work: MutableAtomicEditPlanWork,
): PlanFailure | null {
  const declarations = declarationArray(plan);
  let expected: readonly Readonly<{
    measureId: MeasureId;
    completion?: MeasureCompletion;
  }>[];
  if (plan.kind === "insert-fragment") {
    if (plan.placement.kind === "into-measure") {
      const target = index.measures.get(plan.placement.measureId);
      if (target === undefined) {
        throw new Error("A0_U1_INTERNAL_COMPLETION_TARGET");
      }
      expected = Object.freeze([
        Object.freeze({
          measureId: target.id,
          ...(plan.source.kind === "complete-draft"
            ? {
                completion: Object.freeze({
                  kind: "complete" as const,
                }),
              }
            : {}),
        }),
      ]);
    } else {
      expected = Object.freeze([]);
    }
  } else if (
    plan.kind === "split-event-duration" ||
    plan.kind === "join-event-durations"
  ) {
    const eventId =
      plan.kind === "split-event-duration"
        ? plan.eventId
        : plan.leftEventId;
    const event = index.events.get(eventId);
    const measure =
      event === undefined ? undefined : index.measures.get(event.measureId);
    if (measure === undefined) {
      throw new Error("A0_U1_INTERNAL_COMPLETION_EVENT");
    }
    expected = Object.freeze([
      Object.freeze({
        measureId: measure.id,
        completion: measure.measure.completion,
      }),
    ]);
  } else if (plan.kind === "split-measure") {
    /*
     * The retained measure keeps the source ID and is the single declared row.
     * Its completion value is caller-owned rather than compared: the retained
     * measure holds fewer beats after the split, so its old completion is
     * exactly the value that must not be carried forward silently. The suffix
     * carries the plan's explicit `newMeasureCompletion` instead, because a
     * caller cannot name an ID that does not exist yet.
     */
    if (!index.measures.has(plan.measureId)) {
      throw new Error("A0_U1_INTERNAL_COMPLETION_MEASURE");
    }
    expected = Object.freeze([Object.freeze({ measureId: plan.measureId })]);
  } else {
    expected = Object.freeze([]);
  }
  const length = Math.max(declarations.length, expected.length);
  for (let position = 0; position < length; position += 1) {
    if (position < declarations.length) {
      work.completionDeclarationsVisited += 1;
    }
    const declaration = declarations[position];
    const expectedDeclaration = expected[position];
    if (
      declaration === undefined ||
      expectedDeclaration === undefined ||
      declaration.measureId !== expectedDeclaration.measureId ||
      (expectedDeclaration.completion !== undefined &&
        !deepStructuralEqual(
          declaration.completion,
          expectedDeclaration.completion,
        ))
    ) {
      return {
        code: "edit-plan.completion-declarations-mismatch",
        path: [
          "plan",
          ...(plan.kind === "insert-fragment" ? ["placement"] : []),
          "completionDeclarations",
          position,
        ],
        ...(declarations.length === expected.length
          ? {}
          : {
              diagnostics: Object.freeze([
                atomicEditPlanDiagnostic(
                  "edit-plan.completion-declarations-mismatch",
                  [
                    "plan",
                    ...(plan.kind === "insert-fragment"
                      ? ["placement"]
                      : []),
                    "completionDeclarations",
                    position,
                  ],
                  {
                    observed: declarations.length,
                    maximum: expected.length,
                  },
                ),
              ]),
            }),
      };
    }
  }
  return null;
}

function metadataFailure(
  plan: AtomicEditPlan,
  index: DocumentIndex,
): PlanFailure | null {
  if (plan.kind !== "join-sections") return null;
  const left = index.sections.get(plan.leftSectionId);
  const right = index.sections.get(plan.rightSectionId);
  if (left === undefined || right === undefined) {
    throw new Error("A0_U1_INTERNAL_METADATA_TARGET");
  }
  const project = (section: Section) =>
    Object.freeze({
      name: section.name,
      annotation: section.annotation,
      keyOverride: section.keyOverride,
      voiceLeadingBoundary: section.voiceLeadingBoundary,
    });
  const fields = Object.freeze([
    "name",
    "annotation",
    "keyOverride",
    "voiceLeadingBoundary",
  ] as const);
  for (const [root, declared, current] of [
    [
      "expectedLeftMetadata",
      plan.expectedLeftMetadata,
      project(left.section),
    ],
    [
      "expectedRightMetadata",
      plan.expectedRightMetadata,
      project(right.section),
    ],
  ] as const) {
    for (const field of fields) {
      if (!deepStructuralEqual(declared[field], current[field])) {
        return {
          code: "edit-plan.section-metadata-mismatch",
          path: ["plan", root, field],
        };
      }
    }
  }
  return null;
}

function canonicalDuration(value: BeatDuration): BeatDuration | null {
  const made = makeBeatDuration(value);
  return made.ok &&
    made.value.numerator === value.numerator &&
    made.value.denominator === value.denominator
    ? made.value
    : null;
}

function operationLawFailure(
  plan: AtomicEditPlan,
  prepared: PreparedPlan,
  index: DocumentIndex,
  work: MutableAtomicEditPlanWork,
): PlanFailure | null {
  if (plan.kind === "insert-fragment") {
    if (plan.source.kind === "complete-draft") return null;
    work.recoveryFieldsCompared = 3;
    if (
      !deepStructuralEqual(
        plan.source.layoutLossAcknowledgement,
        A0_U1_RECOVERED_CHORD_LAYOUT_LOSS_ACKNOWLEDGEMENT,
      )
    ) {
      return {
        code: "edit-plan.recovered-chord-layout-loss-unacknowledged",
        path: ["plan", "source", "layoutLossAcknowledgement"],
      };
    }
    work.recoveryFieldsCompared = 4;
    const selected =
      prepared.kind === "insert-fragment"
        ? prepared.selectedRecovery
        : null;
    if (selected === null) {
      throw new Error("A0_U1_INTERNAL_RECOVERY_SELECTION");
    }
    if (selected.duration.kind === "resolved") {
      if (plan.source.callerDuration !== null) {
        return {
          code: "edit-plan.recovered-chord-duration-mismatch",
          path: ["plan", "source", "callerDuration"],
        };
      }
    } else if (
      plan.source.callerDuration === null ||
      canonicalDuration(plan.source.callerDuration) === null
    ) {
      return {
        code: "edit-plan.recovered-chord-duration-mismatch",
        path: ["plan", "source", "callerDuration"],
      };
    }
    return null;
  }

  if (plan.kind === "split-event-duration") {
    const event = index.events.get(plan.eventId);
    if (event === undefined) throw new Error("A0_U1_INTERNAL_SPLIT_TARGET");
    const first = canonicalDuration(plan.firstDuration);
    const second = canonicalDuration(plan.secondDuration);
    if (first === null) {
      return {
        code: "edit-plan.duration-invalid",
        path: ["plan", "firstDuration"],
      };
    }
    if (second === null) {
      return {
        code: "edit-plan.duration-invalid",
        path: ["plan", "secondDuration"],
      };
    }
    work.exactBeatAdditions += 1;
    const sum = addBeatValues(first, second);
    work.exactBeatComparisons += 1;
    if (
      !sum.ok ||
      compareBeatValues(sum.value, event.event.duration) !== 0
    ) {
      return {
        code: "edit-plan.duration-sum-mismatch",
        path: ["plan", "secondDuration"],
      };
    }
    return null;
  }

  if (plan.kind === "join-event-durations") {
    const left = index.events.get(plan.leftEventId);
    const right = index.events.get(plan.rightEventId);
    if (left === undefined || right === undefined) {
      throw new Error("A0_U1_INTERNAL_JOIN_TARGET");
    }
    const joined = canonicalDuration(plan.joinedDuration);
    if (joined === null) {
      return {
        code: "edit-plan.duration-invalid",
        path: ["plan", "joinedDuration"],
      };
    }
    work.exactBeatAdditions += 1;
    const sum = addBeatValues(left.event.duration, right.event.duration);
    work.exactBeatComparisons += 1;
    if (!sum.ok || compareBeatValues(sum.value, joined) !== 0) {
      return {
        code: "edit-plan.duration-sum-mismatch",
        path: ["plan", "joinedDuration"],
      };
    }
    if (
      !deepStructuralEqual(left.event.chord, right.event.chord) ||
      !deepStructuralEqual(left.event.voicing, right.event.voicing)
    ) {
      return {
        code: "edit-plan.event-content-mismatch",
        path: ["plan", "rightEventId"],
      };
    }
    if (right.event.annotation !== "") {
      return {
        code: "edit-plan.right-annotation-not-empty",
        path: ["plan", "rightEventId"],
      };
    }
  }

  if (plan.kind === "split-measure") {
    /*
     * A0-U1-ATOM-018. The two totals are the caller's exact statement of the
     * partition; nothing is computed for the caller, redistributed, rounded,
     * or repaired. A split moves a bar line, never a beat.
     */
    const measure = index.measures.get(plan.measureId);
    if (measure === undefined) {
      throw new Error("A0_U1_INTERNAL_SPLIT_MEASURE_TARGET");
    }
    const first = canonicalDuration(plan.firstMeasureTotal);
    if (first === null) {
      return {
        code: "edit-plan.measure-partition-mismatch",
        path: ["plan", "firstMeasureTotal"],
      };
    }
    const second = canonicalDuration(plan.secondMeasureTotal);
    if (second === null) {
      return {
        code: "edit-plan.measure-partition-mismatch",
        path: ["plan", "secondMeasureTotal"],
      };
    }
    const events = measure.measure.events;
    const splitIndex = events.findIndex(
      (event) => event.id === plan.beforeEventId,
    );
    if (splitIndex <= 0 || splitIndex >= events.length) {
      throw new Error("A0_U1_INTERNAL_SPLIT_MEASURE_BOUNDARY");
    }
    const exactSum = (
      spans: readonly ChordEvent[],
    ): BeatValue | null => {
      let total: BeatValue | null = null;
      for (const span of spans) {
        if (total === null) {
          total = span.duration;
          continue;
        }
        work.exactBeatAdditions += 1;
        const added = addBeatValues(total, span.duration);
        if (!added.ok) return null;
        total = added.value;
      }
      return total;
    };
    const retainedTotal = exactSum(events.slice(0, splitIndex));
    work.exactBeatComparisons += 1;
    if (
      retainedTotal === null ||
      compareBeatValues(retainedTotal, first) !== 0
    ) {
      return {
        code: "edit-plan.measure-partition-mismatch",
        path: ["plan", "firstMeasureTotal"],
      };
    }
    const movedTotal = exactSum(events.slice(splitIndex));
    work.exactBeatComparisons += 1;
    if (movedTotal === null || compareBeatValues(movedTotal, second) !== 0) {
      return {
        code: "edit-plan.measure-partition-mismatch",
        path: ["plan", "secondMeasureTotal"],
      };
    }
    work.exactBeatAdditions += 1;
    const declaredTotal = addBeatValues(first, second);
    work.exactBeatAdditions += 1;
    const sourceTotal = addBeatValues(retainedTotal, movedTotal);
    work.exactBeatComparisons += 1;
    if (
      !declaredTotal.ok ||
      !sourceTotal.ok ||
      compareBeatValues(declaredTotal.value, sourceTotal.value) !== 0
    ) {
      return {
        code: "edit-plan.measure-partition-mismatch",
        path: ["plan", "secondMeasureTotal"],
      };
    }
  }
  return null;
}

function nonInsertPreparation(plan: AtomicEditPlan): PreparedNonInsert {
  switch (plan.kind) {
    case "split-event-duration":
      return Object.freeze({
        kind: plan.kind,
        allocationSpecs: Object.freeze([
          Object.freeze({
            kind: "event",
            source: Object.freeze({
              kind: "split-event-second",
              sourceEventId: plan.eventId,
            }),
          }),
        ]),
      });
    case "split-section":
      return Object.freeze({
        kind: plan.kind,
        allocationSpecs: Object.freeze([
          Object.freeze({
            kind: "section",
            source: Object.freeze({
              kind: "split-section-suffix",
              sourceSectionId: plan.sectionId,
            }),
          }),
        ]),
      });
    case "split-measure":
      return Object.freeze({
        kind: plan.kind,
        allocationSpecs: Object.freeze([
          Object.freeze({
            kind: "measure",
            source: Object.freeze({
              kind: "split-measure-suffix",
              sourceMeasureId: plan.measureId,
            }),
          }),
        ]),
      });
    case "join-event-durations":
    case "join-sections":
      return Object.freeze({
        kind: plan.kind,
        allocationSpecs: Object.freeze([]),
      });
    case "insert-fragment":
      throw new Error("A0_U1_INTERNAL_INSERT_NONINSERT_PREP");
  }
}

function parserEventDurations(
  prepared: PreparedInsert,
  plan: Extract<AtomicEditPlan, { kind: "insert-fragment" }>,
): readonly BeatDuration[] {
  if (plan.source.kind === "complete-draft") {
    if (!prepared.parse.ok) {
      throw new Error("A0_U1_INTERNAL_COMPLETE_PARSE_RESULT");
    }
    return Object.freeze(
      prepared.parse.draft.sections.flatMap((section) =>
        section.measures.flatMap((measure) =>
          measure.events.map((event) => event.duration),
        ),
      ),
    );
  }
  const selected = prepared.selectedRecovery;
  if (selected === null) {
    throw new Error("A0_U1_INTERNAL_RECOVERY_DURATION");
  }
  if (selected.duration.kind === "resolved") {
    return Object.freeze([selected.duration.value]);
  }
  if (plan.source.callerDuration === null) {
    throw new Error("A0_U1_INTERNAL_CALLER_DURATION");
  }
  return Object.freeze([plan.source.callerDuration]);
}

type FinalCollectionProjection = Readonly<{
  sections: number;
  totalMeasures: number;
  events: number;
  perSectionMeasures: readonly number[];
}>;

function finalCollectionProjection(
  state: AtomicEditPlanAppState,
  plan: AtomicEditPlan,
  prepared: PreparedPlan,
  index: DocumentIndex,
): FinalCollectionProjection {
  const baseMeasures = state.document.sections.map(
    (section) => section.measures.length,
  );
  let sections = state.document.sections.length;
  let totalMeasures = baseMeasures.reduce((sum, count) => sum + count, 0);
  let events = index.eventOrder.length;
  const perSectionMeasures = [...baseMeasures];

  if (plan.kind === "insert-fragment") {
    if (prepared.kind !== "insert-fragment") {
      throw new Error("A0_U1_INTERNAL_INSERT_PROJECTION");
    }
    const insertedDurations = parserEventDurations(prepared, plan);
    events += insertedDurations.length;
    if (plan.source.kind === "complete-draft") {
      if (!prepared.parse.ok) {
        throw new Error("A0_U1_INTERNAL_COMPLETE_PROJECTION");
      }
      if (plan.placement.kind === "into-section") {
        const target = index.sections.get(plan.placement.sectionId);
        if (target === undefined) {
          throw new Error("A0_U1_INTERNAL_SECTION_PROJECTION");
        }
        const insertedMeasures =
          prepared.parse.draft.sections[0]?.measures.length ?? 0;
        perSectionMeasures[target.sectionIndex] =
          (perSectionMeasures[target.sectionIndex] ?? 0) + insertedMeasures;
        totalMeasures += insertedMeasures;
      } else if (plan.placement.kind === "into-document") {
        const added = prepared.parse.draft.sections.map(
          (section) => section.measures.length,
        );
        const beforeIndex =
          plan.placement.beforeSectionId === null
            ? perSectionMeasures.length
            : index.sections.get(plan.placement.beforeSectionId)
                ?.sectionIndex ?? perSectionMeasures.length;
        perSectionMeasures.splice(beforeIndex, 0, ...added);
        sections += added.length;
        totalMeasures += added.reduce((sum, count) => sum + count, 0);
      }
    }
  } else if (plan.kind === "split-event-duration") {
    events += 1;
  } else if (plan.kind === "join-event-durations") {
    events -= 1;
  } else if (plan.kind === "split-section") {
    const section = index.sections.get(plan.sectionId);
    const boundary = index.measures.get(plan.beforeMeasureId);
    if (section === undefined || boundary === undefined) {
      throw new Error("A0_U1_INTERNAL_SPLIT_SECTION_PROJECTION");
    }
    const current = perSectionMeasures[section.sectionIndex] ?? 0;
    perSectionMeasures.splice(
      section.sectionIndex,
      1,
      boundary.measureIndex,
      current - boundary.measureIndex,
    );
    sections += 1;
  } else if (plan.kind === "split-measure") {
    /*
     * One measure becomes two inside one section. No event is created or
     * removed and no section boundary moves.
     */
    const boundary = index.measures.get(plan.measureId);
    if (boundary === undefined) {
      throw new Error("A0_U1_INTERNAL_SPLIT_MEASURE_PROJECTION");
    }
    const section = index.sections.get(boundary.sectionId);
    if (section === undefined) {
      throw new Error("A0_U1_INTERNAL_SPLIT_MEASURE_PROJECTION_SECTION");
    }
    perSectionMeasures[section.sectionIndex] =
      (perSectionMeasures[section.sectionIndex] ?? 0) + 1;
    totalMeasures += 1;
  } else {
    const left = index.sections.get(plan.leftSectionId);
    const right = index.sections.get(plan.rightSectionId);
    if (left === undefined || right === undefined) {
      throw new Error("A0_U1_INTERNAL_JOIN_SECTION_PROJECTION");
    }
    const combined =
      (perSectionMeasures[left.sectionIndex] ?? 0) +
      (perSectionMeasures[right.sectionIndex] ?? 0);
    perSectionMeasures.splice(left.sectionIndex, 2, combined);
    sections -= 1;
  }
  return Object.freeze({
    sections,
    totalMeasures,
    events,
    perSectionMeasures: Object.freeze(perSectionMeasures),
  });
}

const MAX_FINAL_MEASURES =
  MAX_DOCUMENT_SECTIONS * MAX_SECTION_MEASURES;
const MAX_OCCUPIED_ID_RECORDS =
  1 +
  MAX_DOCUMENT_SECTIONS +
  MAX_FINAL_MEASURES +
  MAX_DOCUMENT_CHORD_EVENTS;

function collectionFailure(
  projection: FinalCollectionProjection,
  work: MutableAtomicEditPlanWork,
): PlanFailure | null {
  if (projection.sections > MAX_DOCUMENT_SECTIONS) {
    return {
      code: "edit-plan.collection-limit-exceeded",
      path: ["plan"],
      diagnostics: Object.freeze([
        atomicEditPlanDiagnostic(
          "edit-plan.collection-limit-exceeded",
          ["plan"],
          {
            observed: Math.min(
              projection.sections,
              MAX_DOCUMENT_SECTIONS + 1,
            ),
            maximum: MAX_DOCUMENT_SECTIONS,
          },
        ),
      ]),
    };
  }
  for (const measureCount of projection.perSectionMeasures) {
    if (measureCount > MAX_SECTION_MEASURES) {
      return {
        code: "edit-plan.collection-limit-exceeded",
        path: ["plan"],
        diagnostics: Object.freeze([
          atomicEditPlanDiagnostic(
            "edit-plan.collection-limit-exceeded",
            ["plan"],
            {
              observed: Math.min(
                measureCount,
                MAX_SECTION_MEASURES + 1,
              ),
              maximum: MAX_SECTION_MEASURES,
            },
          ),
        ]),
      };
    }
  }
  if (projection.totalMeasures > MAX_FINAL_MEASURES) {
    return {
      code: "edit-plan.collection-limit-exceeded",
      path: ["plan"],
    };
  }
  if (projection.events > MAX_DOCUMENT_CHORD_EVENTS) {
    return {
      code: "edit-plan.collection-limit-exceeded",
      path: ["plan"],
      diagnostics: Object.freeze([
        atomicEditPlanDiagnostic(
          "edit-plan.collection-limit-exceeded",
          ["plan"],
          {
            observed: Math.min(
              projection.events,
              MAX_DOCUMENT_CHORD_EVENTS + 1,
            ),
            maximum: MAX_DOCUMENT_CHORD_EVENTS,
          },
        ),
      ]),
    };
  }
  const occupied =
    1 +
    projection.sections +
    projection.totalMeasures +
    projection.events;
  if (occupied > MAX_OCCUPIED_ID_RECORDS) {
    return {
      code: "edit-plan.collection-limit-exceeded",
      path: ["plan"],
    };
  }
  if (work.planNodesVisited > MAX_OCCUPIED_ID_RECORDS) {
    return {
      code: "edit-plan.collection-limit-exceeded",
      path: ["plan"],
    };
  }
  return null;
}

function finalDurations(
  state: AtomicEditPlanAppState,
  plan: AtomicEditPlan,
  prepared: PreparedPlan,
): readonly BeatDuration[] {
  const durations = state.document.sections.flatMap((section) =>
    section.measures.flatMap((measure) =>
      measure.events.map((event) => event.duration),
    ),
  );
  if (plan.kind === "insert-fragment") {
    if (prepared.kind !== "insert-fragment") {
      throw new Error("A0_U1_INTERNAL_INSERT_TIMELINE");
    }
    durations.push(...parserEventDurations(prepared, plan));
  } else if (plan.kind === "split-event-duration") {
    const position = state.document.sections
      .flatMap((section) => section.measures)
      .flatMap((measure) => measure.events)
      .findIndex((event) => event.id === plan.eventId);
    durations.splice(
      position,
      1,
      plan.firstDuration,
      plan.secondDuration,
    );
  } else if (plan.kind === "join-event-durations") {
    const position = state.document.sections
      .flatMap((section) => section.measures)
      .flatMap((measure) => measure.events)
      .findIndex((event) => event.id === plan.leftEventId);
    durations.splice(position, 2, plan.joinedDuration);
  }
  return Object.freeze(durations);
}

function timelineFailure(
  durations: readonly BeatDuration[],
  work: MutableAtomicEditPlanWork,
): PlanFailure | null {
  const zero = makeBeatPosition({ numerator: 0, denominator: 1 });
  const maximum = makeBeatPosition({
    numerator: MAX_TIMELINE_QUARTER_NOTE_BEATS,
    denominator: 1,
  });
  if (!zero.ok || !maximum.ok) {
    throw new Error("A0_U1_INTERNAL_TIMELINE_CONSTANT");
  }
  let total: BeatValue = zero.value;
  for (const duration of durations) {
    work.exactBeatAdditions += 1;
    const added = addBeatValues(total, duration);
    work.exactBeatComparisons += 1;
    if (
      !added.ok ||
      compareBeatValues(added.value, maximum.value) > 0
    ) {
      return {
        code: "edit-plan.timeline-limit-exceeded",
        path: ["plan"],
        diagnostics: Object.freeze([
          atomicEditPlanDiagnostic(
            "edit-plan.timeline-limit-exceeded",
            ["plan"],
            {
              maximum: MAX_TIMELINE_QUARTER_NOTE_BEATS,
            },
          ),
        ]),
      };
    }
    total = added.value;
  }
  return null;
}

function preparePlan(
  state: AtomicEditPlanAppState,
  command: ApplyEditPlanCommand,
  dependencies: AtomicEditPlanDependencies,
  index: DocumentIndex,
  work: MutableAtomicEditPlanWork,
): PrepareResult {
  let prepared: PreparedPlan;
  if (command.plan.kind === "insert-fragment") {
    const inserted = insertPreparation(
      state,
      command,
      dependencies,
      work,
    );
    if (!inserted.ok) return inserted;
    prepared = inserted.prepared;
  } else {
    prepared = nonInsertPreparation(command.plan);
  }

  const completionFailure = completionDeclarationFailure(
    state,
    command.plan,
    index,
    work,
  );
  if (completionFailure !== null) {
    return { ok: false, failure: completionFailure };
  }
  const metadata = metadataFailure(command.plan, index);
  if (metadata !== null) return { ok: false, failure: metadata };
  const law = operationLawFailure(command.plan, prepared, index, work);
  if (law !== null) return { ok: false, failure: law };
  const projection = finalCollectionProjection(
    state,
    command.plan,
    prepared,
    index,
  );
  const collections = collectionFailure(projection, work);
  if (collections !== null) return { ok: false, failure: collections };
  const timeline = timelineFailure(
    finalDurations(state, command.plan, prepared),
    work,
  );
  if (timeline !== null) return { ok: false, failure: timeline };
  return { ok: true, prepared };
}

type AllocationResult =
  | Readonly<{
      ok: true;
      identities: readonly AtomicEditPlanAllocatedIdentity[];
    }>
  | Readonly<{ ok: false; failure: PlanFailure }>;

function allocateStableIdentities(
  state: AtomicEditPlanAppState,
  index: DocumentIndex,
  specs: readonly AllocationSpec[],
  dependencies: AtomicEditPlanDependencies,
  work: MutableAtomicEditPlanWork,
): AllocationResult {
  const occupied = new Set<string>([
    state.document.id,
    ...index.sections.keys(),
    ...index.measures.keys(),
    ...index.events.keys(),
  ]);
  const identities: AtomicEditPlanAllocatedIdentity[] = [];
  for (const spec of specs) {
    work.idAllocationAttempts += 1;
    let returned: unknown = null;
    try {
      switch (spec.kind) {
        case "section":
          returned = dependencies.stableIdFactory.next("section");
          break;
        case "measure":
          returned = dependencies.stableIdFactory.next("measure");
          break;
        case "event":
          returned = dependencies.stableIdFactory.next("event");
          break;
      }
    } catch {
      returned = null;
    }
    const captured = captureStableIdFactoryResult(returned);
    if (captured === null || !captured.ok) {
      return {
        ok: false,
        failure: {
          code: "edit-plan.id-factory-failed",
          path: ["plan"],
        },
      };
    }
    work.idCollisionChecks += 1;
    if (occupied.has(captured.value)) {
      return {
        ok: false,
        failure: {
          code: "edit-plan.id-collision",
          path: ["plan"],
        },
      };
    }
    occupied.add(captured.value);
    const identity = Object.freeze({
      kind: spec.kind,
      id: captured.value,
      source: spec.source,
    }) as AtomicEditPlanAllocatedIdentity;
    identities.push(identity);
    work.peakAllocatedIdRecords = Math.max(
      work.peakAllocatedIdRecords,
      identities.length,
    );
  }
  return {
    ok: true,
    identities: Object.freeze(identities),
  };
}

type MutableCandidateMeasure = {
  id: MeasureId;
  events: ChordEvent[];
  completion: MeasureCompletion;
};

type MutableCandidateSection = {
  id: SectionId;
  name: string;
  annotation: string;
  keyOverride: Section["keyOverride"];
  voiceLeadingBoundary: Section["voiceLeadingBoundary"];
  measures: MutableCandidateMeasure[];
};

function mutableCandidate(
  document: ValidatedDocument,
): Readonly<{
  root: Omit<ProgressionDocumentV2, "sections"> & {
    sections: MutableCandidateSection[];
  };
  sections: MutableCandidateSection[];
}> {
  const sections = document.sections.map((section) => ({
    id: section.id,
    name: section.name,
    annotation: section.annotation,
    keyOverride: section.keyOverride,
    voiceLeadingBoundary: section.voiceLeadingBoundary,
    measures: section.measures.map((measure) => ({
      id: measure.id,
      events: [...measure.events],
      completion: measure.completion,
    })),
  }));
  const root = {
    schema: document.schema,
    id: document.id,
    title: document.title,
    description: document.description,
    meter: document.meter,
    tempoBpm: document.tempoBpm,
    key: document.key,
    sections,
    playback: document.playback,
  };
  return { root, sections };
}

function mutableMeasureById(
  sections: readonly MutableCandidateSection[],
  id: MeasureId,
): MutableCandidateMeasure | null {
  for (const section of sections) {
    const measure = section.measures.find((candidate) => candidate.id === id);
    if (measure !== undefined) return measure;
  }
  return null;
}

function mutableMeasureLocationById(
  sections: readonly MutableCandidateSection[],
  id: MeasureId,
): Readonly<{
  section: MutableCandidateSection;
  measure: MutableCandidateMeasure;
  index: number;
}> | null {
  for (const section of sections) {
    const index = section.measures.findIndex(
      (candidate) => candidate.id === id,
    );
    const measure = section.measures[index];
    if (index >= 0 && measure !== undefined) {
      return { section, measure, index };
    }
  }
  return null;
}

function mutableSectionById(
  sections: readonly MutableCandidateSection[],
  id: SectionId,
): Readonly<{ section: MutableCandidateSection; index: number }> | null {
  const index = sections.findIndex((section) => section.id === id);
  const section = sections[index];
  return index < 0 || section === undefined ? null : { section, index };
}

function mutableEventById(
  sections: readonly MutableCandidateSection[],
  id: ChordEventId,
): Readonly<{
  measure: MutableCandidateMeasure;
  event: ChordEvent;
  index: number;
}> | null {
  for (const section of sections) {
    for (const measure of section.measures) {
      const index = measure.events.findIndex((event) => event.id === id);
      const event = measure.events[index];
      if (index >= 0 && event !== undefined) {
        return { measure, event, index };
      }
    }
  }
  return null;
}

function applyCompletionDeclarations(
  sections: readonly MutableCandidateSection[],
  plan: AtomicEditPlan,
): void {
  for (const declaration of declarationArray(plan)) {
    const measure = mutableMeasureById(sections, declaration.measureId);
    if (measure === null) {
      throw new Error("A0_U1_INTERNAL_COMPLETION_MATERIALIZATION");
    }
    measure.completion = declaration.completion;
  }
}

function newEvent(
  id: ChordEventId,
  duration: BeatDuration,
  annotation: string,
  chord: InsertableChartChord["chord"],
): ChordEvent {
  return Object.freeze({
    id,
    duration,
    annotation,
    chord,
    voicing: A0_U1_NEW_EVENT_AUTO_VOICING,
  }) as ChordEvent;
}

function materializePlan(
  state: AtomicEditPlanAppState,
  plan: AtomicEditPlan,
  prepared: PreparedPlan,
  identities: readonly AtomicEditPlanAllocatedIdentity[],
): MaterializedPlan {
  const candidate = mutableCandidate(state.document);
  let cursor = 0;
  const nextIdentity = <
    Kind extends AtomicEditPlanAllocatedIdentity["kind"],
  >(
    kind: Kind,
  ): Extract<AtomicEditPlanAllocatedIdentity, { kind: Kind }> => {
    const identity = identities[cursor];
    cursor += 1;
    if (identity?.kind !== kind) {
      throw new Error("A0_U1_INTERNAL_ALLOCATION_ORDER");
    }
    return identity as Extract<
      AtomicEditPlanAllocatedIdentity,
      { kind: Kind }
    >;
  };
  let removedIdentities: MaterializedPlan["removedIdentities"] =
    Object.freeze([]);
  let survivorId: MaterializedPlan["survivorId"] = null;
  let insertSource: MaterializedPlan["insertSource"] = null;
  let completionMeasureIds: readonly MeasureId[] = Object.freeze([]);
  let timelineDisposition: MaterializedPlan["timelineDisposition"];
  let insertLane: MaterializedPlan["insertLane"] = null;
  let placementKind: MaterializedPlan["placementKind"] = null;

  if (plan.kind === "insert-fragment") {
    if (prepared.kind !== "insert-fragment") {
      throw new Error("A0_U1_INTERNAL_INSERT_MATERIALIZATION");
    }
    insertSource = prepared.insertSource;
    insertLane = plan.source.kind;
    placementKind = plan.placement.kind;
    if (plan.source.kind === "recovered-chord") {
      const selected = prepared.selectedRecovery;
      const placement = plan.placement;
      if (selected === null || placement.kind !== "into-measure") {
        throw new Error("A0_U1_INTERNAL_RECOVERY_MATERIALIZATION");
      }
      const identity = nextIdentity("event");
      const duration =
        selected.duration.kind === "resolved"
          ? selected.duration.value
          : plan.source.callerDuration;
      if (duration === null) {
        throw new Error("A0_U1_INTERNAL_RECOVERY_MATERIALIZATION_DURATION");
      }
      const event = newEvent(
        identity.id,
        duration,
        selected.annotation,
        selected.chord,
      );
      const measure = mutableMeasureById(
        candidate.sections,
        placement.measureId,
      );
      if (measure === null) {
        throw new Error("A0_U1_INTERNAL_RECOVERY_MATERIALIZATION_TARGET");
      }
      const insertionIndex =
        placement.beforeEventId === null
          ? measure.events.length
          : measure.events.findIndex(
              (candidateEvent) =>
                candidateEvent.id === placement.beforeEventId,
            );
      measure.events.splice(insertionIndex, 0, event);
      completionMeasureIds = Object.freeze([placement.measureId]);
      timelineDisposition =
        "insert-one-recovered-chord-at-declared-boundary";
    } else {
      const placement = plan.placement;
      if (!prepared.parse.ok) {
        throw new Error("A0_U1_INTERNAL_COMPLETE_MATERIALIZATION_PARSE");
      }
      const eventFromDraft = (
        event: CompleteParse["draft"]["sections"][number]["measures"][number]["events"][number],
      ): ChordEvent => {
        const identity = nextIdentity("event");
        return newEvent(
          identity.id,
          event.duration,
          event.annotation,
          event.chord,
        );
      };
      const measureFromDraft = (
        sectionOrdinal: number,
        measure: CompleteParse["draft"]["sections"][number]["measures"][number],
      ): MutableCandidateMeasure => {
        const identity = nextIdentity("measure");
        const events = measure.events.map(eventFromDraft);
        return {
          id: identity.id,
          events,
          completion:
            events.length === 0
              ? Object.freeze({ kind: "empty" })
              : Object.freeze({ kind: "complete" }),
        };
      };
      if (placement.kind === "into-measure") {
        const measure = mutableMeasureById(
          candidate.sections,
          placement.measureId,
        );
        const sourceMeasure =
          prepared.parse.draft.sections[0]?.measures[0];
        if (measure === null || sourceMeasure === undefined) {
          throw new Error("A0_U1_INTERNAL_MEASURE_INSERT_MATERIALIZATION");
        }
        measure.events.splice(
          0,
          0,
          ...sourceMeasure.events.map(eventFromDraft),
        );
        completionMeasureIds = Object.freeze([placement.measureId]);
      } else if (placement.kind === "into-section") {
        const target = mutableSectionById(
          candidate.sections,
          placement.sectionId,
        );
        const sourceSection = prepared.parse.draft.sections[0];
        if (target === null || sourceSection === undefined) {
          throw new Error("A0_U1_INTERNAL_SECTION_INSERT_MATERIALIZATION");
        }
        const measures = sourceSection.measures.map((measure) =>
          measureFromDraft(sourceSection.ordinal, measure),
        );
        const insertionIndex =
          placement.beforeMeasureId === null
            ? target.section.measures.length
            : target.section.measures.findIndex(
                (measure) =>
                  measure.id === placement.beforeMeasureId,
              );
        target.section.measures.splice(insertionIndex, 0, ...measures);
      } else {
        const declarations = new Map(
          placement.sectionDeclarations.map((declaration) => [
            declaration.sourceSectionOrdinal,
            declaration,
          ]),
        );
        const sections = prepared.parse.draft.sections.map((section) => {
          const identity = nextIdentity("section");
          const declaration = declarations.get(section.ordinal);
          if (declaration === undefined || section.name === null) {
            throw new Error("A0_U1_INTERNAL_DOCUMENT_INSERT_DECLARATION");
          }
          return {
            id: identity.id,
            name: section.name,
            annotation: section.annotation,
            keyOverride: null,
            voiceLeadingBoundary: declaration.voiceLeadingBoundary,
            measures: section.measures.map((measure) =>
              measureFromDraft(section.ordinal, measure),
            ),
          };
        });
        const insertionIndex =
          placement.beforeSectionId === null
            ? candidate.sections.length
            : candidate.sections.findIndex(
                (section) =>
                  section.id === placement.beforeSectionId,
              );
        candidate.sections.splice(insertionIndex, 0, ...sections);
      }
      timelineDisposition = "splice-source-order-at-declared-boundary";
    }
    applyCompletionDeclarations(candidate.sections, plan);
  } else if (plan.kind === "split-event-duration") {
    const source = mutableEventById(candidate.sections, plan.eventId);
    const secondIdentity = nextIdentity("event");
    if (source === null) {
      throw new Error("A0_U1_INTERNAL_SPLIT_MATERIALIZATION_TARGET");
    }
    const first: ChordEvent = Object.freeze({
      ...source.event,
      duration: plan.firstDuration,
    });
    const second: ChordEvent = Object.freeze({
      ...source.event,
      id: secondIdentity.id,
      duration: plan.secondDuration,
      annotation: "",
    });
    source.measure.events.splice(source.index, 1, first, second);
    applyCompletionDeclarations(candidate.sections, plan);
    survivorId = plan.eventId;
    const location = state.document.sections
      .flatMap((section) => section.measures)
      .find((measure) =>
        measure.events.some((event) => event.id === plan.eventId),
      );
    if (location === undefined) {
      throw new Error("A0_U1_INTERNAL_SPLIT_COMPLETION_ID");
    }
    completionMeasureIds = Object.freeze([location.id]);
    timelineDisposition =
      "replace-one-span-with-two-exact-sum-spans";
  } else if (plan.kind === "join-event-durations") {
    const left = mutableEventById(candidate.sections, plan.leftEventId);
    const right = mutableEventById(candidate.sections, plan.rightEventId);
    if (
      left === null ||
      right === null ||
      left.measure !== right.measure
    ) {
      throw new Error("A0_U1_INTERNAL_JOIN_MATERIALIZATION_TARGET");
    }
    const joined: ChordEvent = Object.freeze({
      ...left.event,
      duration: plan.joinedDuration,
    });
    left.measure.events.splice(left.index, 2, joined);
    applyCompletionDeclarations(candidate.sections, plan);
    removedIdentities = Object.freeze([
      Object.freeze({ kind: "event", id: plan.rightEventId }),
    ]);
    survivorId = plan.leftEventId;
    completionMeasureIds = Object.freeze([left.measure.id]);
    timelineDisposition =
      "replace-two-equal-content-spans-with-one-exact-sum-span";
  } else if (plan.kind === "split-section") {
    const source = mutableSectionById(candidate.sections, plan.sectionId);
    const boundary = state.document.sections
      .flatMap((section) => section.measures)
      .findIndex((measure) => measure.id === plan.beforeMeasureId);
    const suffixIdentity = nextIdentity("section");
    if (source === null) {
      throw new Error("A0_U1_INTERNAL_SPLIT_SECTION_MATERIALIZATION_TARGET");
    }
    const splitIndex = source.section.measures.findIndex(
      (measure) => measure.id === plan.beforeMeasureId,
    );
    if (boundary < 0 || splitIndex <= 0) {
      throw new Error("A0_U1_INTERNAL_SPLIT_SECTION_MATERIALIZATION_BOUNDARY");
    }
    const suffixMeasures = source.section.measures.splice(splitIndex);
    candidate.sections.splice(source.index + 1, 0, {
      id: suffixIdentity.id,
      ...plan.newSectionMetadata,
      measures: suffixMeasures,
    });
    survivorId = plan.sectionId;
    timelineDisposition =
      "preserve-flattened-event-order-and-durations";
  } else if (plan.kind === "split-measure") {
    const location = mutableMeasureLocationById(
      candidate.sections,
      plan.measureId,
    );
    const suffixIdentity = nextIdentity("measure");
    if (location === null) {
      throw new Error("A0_U1_INTERNAL_SPLIT_MEASURE_MATERIALIZATION_TARGET");
    }
    const splitIndex = location.measure.events.findIndex(
      (event) => event.id === plan.beforeEventId,
    );
    if (splitIndex <= 0 || splitIndex >= location.measure.events.length) {
      throw new Error("A0_U1_INTERNAL_SPLIT_MEASURE_MATERIALIZATION_BOUNDARY");
    }
    /*
     * Every moved event keeps its exact ID, chord, voicing, annotation, and
     * duration, and its order relative to every other event is unchanged. The
     * suffix's completion is the plan's explicit declaration; section 6.4's
     * conversion does not apply because this measure is not built from a
     * parsed fragment.
     */
    const suffixEvents = location.measure.events.splice(splitIndex);
    location.section.measures.splice(location.index + 1, 0, {
      id: suffixIdentity.id,
      events: suffixEvents,
      completion: plan.newMeasureCompletion,
    });
    applyCompletionDeclarations(candidate.sections, plan);
    survivorId = plan.measureId;
    completionMeasureIds = Object.freeze([plan.measureId]);
    timelineDisposition =
      "preserve-flattened-event-order-and-durations";
  } else {
    const left = mutableSectionById(candidate.sections, plan.leftSectionId);
    const right = mutableSectionById(candidate.sections, plan.rightSectionId);
    if (
      left === null ||
      right === null ||
      right.index !== left.index + 1
    ) {
      throw new Error("A0_U1_INTERNAL_JOIN_SECTION_MATERIALIZATION_TARGET");
    }
    left.section.name = plan.resultMetadata.name;
    left.section.annotation = plan.resultMetadata.annotation;
    left.section.keyOverride = plan.resultMetadata.keyOverride;
    left.section.voiceLeadingBoundary =
      plan.resultMetadata.voiceLeadingBoundary;
    left.section.measures.push(...right.section.measures);
    candidate.sections.splice(right.index, 1);
    removedIdentities = Object.freeze([
      Object.freeze({ kind: "section", id: plan.rightSectionId }),
    ]);
    survivorId = plan.leftSectionId;
    timelineDisposition =
      "preserve-flattened-event-order-and-durations";
  }

  if (cursor !== identities.length) {
    throw new Error("A0_U1_INTERNAL_UNUSED_ALLOCATION");
  }
  return Object.freeze({
    candidate: candidate.root,
    allocatedIdentities: identities,
    removedIdentities,
    survivorId,
    insertSource,
    completionMeasureIds,
    timelineDisposition,
    insertLane,
    placementKind,
  });
}

type AtomicHistoryResult =
  | Readonly<{
      ok: true;
      history: AtomicEditPlanAppState["history"];
    }>
  | Readonly<{
      ok: false;
      outerCode:
        | "history.entry_too_large"
        | "history.byte_estimate_invalid";
      observed?: number;
      maximum?: number;
    }>;

function appendAtomicHistory(
  state: AtomicEditPlanAppState,
  command: ApplyEditPlanCommand,
  after: ValidatedDocument,
  afterBookmarks: StableUiBookmarks,
  dependencies: AtomicEditPlanDependencies,
  outerWork: MutableApplicationWorkCounters,
): AtomicHistoryResult {
  const entryWithoutEstimate: Omit<
    ProposedAtomicEditPlanHistoryEntry,
    "retainedBytesEstimate"
  > = Object.freeze({
    commandId: command.id,
    commandKind: "apply-edit-plan",
    label: command.label,
    before: state.document,
    after,
    beforeBookmarks: state.bookmarks,
    afterBookmarks,
    coalescing: null,
    firstLogicalTimeMs: command.logicalTimeMs,
    lastLogicalTimeMs: command.logicalTimeMs,
  });
  let retainedBytesEstimate: number;
  try {
    retainedBytesEstimate =
      dependencies.estimateHistoryRetainedBytes(entryWithoutEstimate);
  } catch {
    return { ok: false, outerCode: "history.byte_estimate_invalid" };
  }
  if (
    !Number.isSafeInteger(retainedBytesEstimate) ||
    retainedBytesEstimate < 0
  ) {
    return { ok: false, outerCode: "history.byte_estimate_invalid" };
  }
  outerWork.historyBytesEstimated += retainedBytesEstimate;
  if (retainedBytesEstimate > MAX_HISTORY_RETAINED_BYTES) {
    return {
      ok: false,
      outerCode: "history.entry_too_large",
      observed: retainedBytesEstimate,
      maximum: MAX_HISTORY_RETAINED_BYTES,
    };
  }
  const entry: ProposedAtomicEditPlanHistoryEntry = Object.freeze({
    ...entryWithoutEstimate,
    retainedBytesEstimate,
  });
  const undo = [...state.history.undo, entry];
  let total = 0;
  for (const retained of undo) {
    if (
      !Number.isSafeInteger(retained.retainedBytesEstimate) ||
      retained.retainedBytesEstimate < 0
    ) {
      return { ok: false, outerCode: "history.byte_estimate_invalid" };
    }
    total += retained.retainedBytesEstimate;
    if (!Number.isSafeInteger(total)) {
      return { ok: false, outerCode: "history.byte_estimate_invalid" };
    }
  }
  while (
    undo.length > MAX_HISTORY_ENTRIES ||
    total > MAX_HISTORY_RETAINED_BYTES
  ) {
    const removed = undo.shift();
    if (removed === undefined) {
      return { ok: false, outerCode: "history.byte_estimate_invalid" };
    }
    total -= removed.retainedBytesEstimate;
  }
  return Object.freeze({
    ok: true,
    history: Object.freeze({
      undo: Object.freeze(undo),
      redo: Object.freeze([]),
      retainedBytesEstimate: total,
    }),
  });
}

function publishAtomicState(
  state: AtomicEditPlanAppState,
  document: ValidatedDocument,
  history: AtomicEditPlanAppState["history"],
  bookmarks: StableUiBookmarks,
  focusTarget: UiFocusTarget,
): AtomicEditPlanAppState {
  const revision = state.revision + 1;
  const sequence = state.nextSequence;
  return Object.freeze({
    ...state,
    document,
    revision,
    history,
    bookmarks,
    pendingRequests: Object.freeze([]),
    focusRequest: Object.freeze({
      sequence,
      target: focusTarget,
      reason: "command",
    }),
    quickEntry: Object.freeze({
      text: "",
      target: bookmarks.insertion,
      baseRevision: revision,
      status: "idle",
      issueCodes: Object.freeze([]),
    }),
    importDraft: null,
    documentTransition: Object.freeze({ kind: "idle" }),
    nextSequence: sequence + 1,
  });
}

function receiptForSuccess(
  state: AtomicEditPlanAppState,
  command: ApplyEditPlanCommand,
  materialized: MaterializedPlan,
  bookmarkReceipt: ReturnType<
    typeof mapAtomicEditPlanBookmarks
  >["receipt"],
  work: AtomicEditPlanWorkEvidence,
): AtomicEditPlanReceipt {
  const common = {
    schema: A0_U1_ATOMIC_EDIT_PLAN_RECEIPT_SCHEMA,
    commandKind: "apply-edit-plan" as const,
    commandId: command.id,
    documentId: state.document.id,
    baseRevision: state.revision,
    committedRevision: state.revision + 1,
    quickEntryDisposition:
      "clear-to-idle-at-committed-revision" as const,
    historyEntriesAppended: 1 as const,
    effects: Object.freeze([
      "queue-recovery",
      "compile-playback-plan",
      "restore-focus",
      "announce",
    ] as const),
    work,
  };
  return Object.freeze({
    ...common,
    planKind: command.plan.kind,
    insertLane: materialized.insertLane,
    placementKind: materialized.placementKind,
    allocatedIdentities: materialized.allocatedIdentities,
    removedIdentities: materialized.removedIdentities,
    survivorId: materialized.survivorId,
    insertSource: materialized.insertSource,
    completionMeasureIds: materialized.completionMeasureIds,
    timelineDisposition: materialized.timelineDisposition,
    bookmarks: bookmarkReceipt,
  }) as AtomicEditPlanReceipt;
}

function copyShapeWork(
  target: MutableAtomicEditPlanWork,
  source: Readonly<Partial<MutableAtomicEditPlanWork>>,
): void {
  for (const key of Object.keys(target) as (keyof MutableAtomicEditPlanWork)[]) {
    const value = source[key];
    if (value !== undefined) target[key] = value;
  }
}

export const runAtomicEditPlan: RunAtomicEditPlan = (request) => {
  const outerWork = createWorkCounters();
  const planWork = createAtomicEditPlanWork();
  const shape = decodeAtomicEditPlanRuntimeShape(request.command);
  copyShapeWork(planWork, shape.shapeWork);
  if (!shape.ok) {
    return atomicFailure(
      request.state,
      outerWork,
      planWork,
      {
        code: shape.code,
        path: shape.path,
        ...(shape.observed === undefined ||
        shape.maximum === undefined
          ? {}
          : {
              diagnostics: Object.freeze([
                atomicEditPlanDiagnostic(shape.code, shape.path, {
                  observed: shape.observed,
                  maximum: shape.maximum,
                }),
              ]),
            }),
      },
      "input-refusal",
    );
  }
  const command = shape.value;
  const envelope = envelopeFailure(request.state, command);
  if (envelope !== null) {
    return preplanFailure(request.state, outerWork, envelope);
  }

  if (command.plan.kind === "insert-fragment") {
    const snapshot = snapshotFailure(request.state, command.plan, planWork);
    if (snapshot !== null) {
      return atomicFailure(
        request.state,
        outerWork,
        planWork,
        snapshot,
        "input-refusal",
      );
    }
    const source = sourceFailure(
      command.plan.source.quickEntrySnapshot.sourceText,
      planWork,
    );
    if (source !== null) {
      return atomicFailure(
        request.state,
        outerWork,
        planWork,
        source,
        "input-refusal",
      );
    }
  }

  const beforeIndex = buildDocumentIndex(request.state.document, outerWork);
  const target = targetFailure(
    request.state,
    command.plan,
    beforeIndex,
    planWork,
  );
  if (target !== null) {
    return atomicFailure(
      request.state,
      outerWork,
      planWork,
      target,
      "input-refusal",
    );
  }
  const prepared = preparePlan(
    request.state,
    command,
    request.dependencies,
    beforeIndex,
    planWork,
  );
  if (!prepared.ok) {
    return atomicFailure(
      request.state,
      outerWork,
      planWork,
      prepared.failure,
      "input-refusal",
    );
  }
  const allocated = allocateStableIdentities(
    request.state,
    beforeIndex,
    prepared.prepared.allocationSpecs,
    request.dependencies,
    planWork,
  );
  if (!allocated.ok) {
    return atomicFailure(
      request.state,
      outerWork,
      planWork,
      allocated.failure,
      "allocation-refusal",
    );
  }
  const materialized = materializePlan(
    request.state,
    command.plan,
    prepared.prepared,
    allocated.identities,
  );

  planWork.structuralDecodeCalls += 1;
  let decodedValue: unknown;
  try {
    decodedValue = request.dependencies.decodeDocumentShape(
      materialized.candidate,
    );
  } catch {
    return atomicFailure(
      request.state,
      outerWork,
      planWork,
      {
        code: "edit-plan.structural-publication-refused",
        path: ["candidate"],
      },
      "publication-refusal",
    );
  }
  const decoded = captureStructuralResult(decodedValue);
  if (decoded === null) {
    return atomicFailure(
      request.state,
      outerWork,
      planWork,
      {
        code: "edit-plan.structural-publication-refused",
        path: ["candidate"],
      },
      "publication-refusal",
    );
  }
  if (!decoded.ok) {
    return atomicFailure(
      request.state,
      outerWork,
      planWork,
      {
        code: "edit-plan.structural-publication-refused",
        path: ["candidate"],
        diagnostics: diagnosticsFromStructuralRefusal(),
      },
      "publication-refusal",
    );
  }

  planWork.semanticValidationCalls += 1;
  outerWork.validationCalls += 1;
  let publishedResult: ReturnType<
    AtomicEditPlanDependencies["validateDocumentSemantics"]
  >;
  try {
    publishedResult =
      request.dependencies.validateDocumentSemantics(decoded.value);
  } catch {
    return atomicFailure(
      request.state,
      outerWork,
      planWork,
      {
        code: "edit-plan.semantic-publication-refused",
        path: ["candidate"],
      },
      "publication-refusal",
    );
  }
  const publishedShape = captureSemanticResult(publishedResult);
  if (publishedShape === null) {
    return atomicFailure(
      request.state,
      outerWork,
      planWork,
      {
        code: "edit-plan.semantic-publication-refused",
        path: ["candidate"],
      },
      "publication-refusal",
    );
  }
  if (!publishedShape.ok) {
    return atomicFailure(
      request.state,
      outerWork,
      planWork,
      {
        code: "edit-plan.semantic-publication-refused",
        path: ["candidate"],
        diagnostics: diagnosticsFromSemanticRefusal(),
      },
      "publication-refusal",
    );
  }

  if (!isCapturedSemanticSuccess(publishedResult, publishedShape)) {
    return atomicFailure(
      request.state,
      outerWork,
      planWork,
      {
        code: "edit-plan.semantic-publication-refused",
        path: ["candidate"],
      },
      "publication-refusal",
    );
  }
  let afterIndex: DocumentIndex;
  let mapped: ReturnType<typeof mapAtomicEditPlanBookmarks>;
  let publishedDocument: ValidatedDocument;
  try {
    publishedDocument = publishedResult.value;
    if (
      !Object.is(publishedDocument, publishedShape.value) ||
      !isDeepFrozenDependencyDocument(publishedDocument) ||
      !deepStructuralEqual(publishedDocument, decoded.value)
    ) {
      return atomicFailure(
        request.state,
        outerWork,
        planWork,
        {
          code: "edit-plan.semantic-publication-refused",
          path: ["candidate"],
        },
        "publication-refusal",
      );
    }
    afterIndex = buildDocumentIndex(publishedDocument, outerWork);
    mapped = mapAtomicEditPlanBookmarks(
      command.plan,
      request.state.bookmarks,
      materialized.allocatedIdentities,
      beforeIndex,
      afterIndex,
    );
  } catch {
    return atomicFailure(
      request.state,
      outerWork,
      planWork,
      {
        code: "edit-plan.semantic-publication-refused",
        path: ["candidate"],
      },
      "publication-refusal",
    );
  }
  planWork.bookmarkRecordsExamined = mapped.recordsExamined;
  planWork.bookmarkRecordsRewritten = mapped.recordsRewritten;
  outerWork.bookmarksRepaired += 1;
  const history = appendAtomicHistory(
    request.state,
    command,
    publishedDocument,
    mapped.bookmarks,
    request.dependencies,
    outerWork,
  );
  if (!history.ok) {
    return atomicFailure(
      request.state,
      outerWork,
      planWork,
      {
        code: "edit-plan.history-refused",
        path: ["history"],
        historyOuterCode: history.outerCode,
        ...(history.observed === undefined ||
        history.maximum === undefined
          ? {}
          : {
              diagnostics: Object.freeze([
                atomicEditPlanDiagnostic(
                  "edit-plan.history-refused",
                  ["history"],
                  {
                    observed: history.observed,
                    maximum: history.maximum,
                  },
                ),
              ]),
            }),
      },
      "history-refusal",
    );
  }

  const nextState = publishAtomicState(
    request.state,
    publishedDocument,
    history.history,
    mapped.bookmarks,
    mapped.focusTarget,
  );
  const revision = nextState.revision;
  const effects = Object.freeze([
    effect(
      "queue-recovery",
      revision,
      "document-command",
    ),
    effect(
      "compile-playback-plan",
      revision,
      "document-command",
    ),
    effect(
      "restore-focus",
      revision,
      "document-command",
    ),
    effect("announce", revision, "document-command"),
  ]);
  const completedWork = freezeAtomicEditPlanWork(planWork, "complete");
  const receipt = receiptForSuccess(
    request.state,
    command,
    materialized,
    mapped.receipt,
    completedWork,
  );
  return Object.freeze({
    ok: true,
    state: nextState,
    outcome: "committed",
    effects,
    counters: freezeWorkCounters(outerWork),
    editPlanReceipt: receipt,
  });
};
