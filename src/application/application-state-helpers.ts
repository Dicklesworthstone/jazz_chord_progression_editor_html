import {
  addBeatValues,
  makeBeatPosition,
  type BeatPosition,
  type BeatValue,
  type ChordEvent,
  type ChordEventId,
  type DocumentId,
  type Measure,
  type MeasureCompletionShape,
  type MeasureId,
  type ProgressionDocumentV2,
  type Section,
  type SectionId,
} from "../domain";
import {
  APPLICATION_REFUSAL_CODES,
  MAX_APPLICATION_SEQUENCE,
  MAX_NOTICES,
  MAX_NOTICE_MESSAGE_CODE_POINTS,
  type AppState,
  type ApplicationRefusal,
  type ApplicationRefusalCode,
  type ApplicationTransitionResult,
  type ApplicationWorkCounters,
  type Notice,
  type StableBoundary,
} from "./application-state-contract";

export type CandidateMeasure = Readonly<{
  id: MeasureId;
  events: readonly unknown[];
  completion: MeasureCompletionShape;
}>;

export type CandidateSection = Readonly<{
  id: SectionId;
  name: string;
  annotation: string;
  keyOverride: Section["keyOverride"];
  voiceLeadingBoundary: Section["voiceLeadingBoundary"];
  measures: readonly CandidateMeasure[];
}>;

export type ApplicationDocumentCandidate = Readonly<
  Omit<ProgressionDocumentV2, "sections"> & {
    sections: readonly CandidateSection[];
  }
>;

export type MutableApplicationWorkCounters = {
  -readonly [Key in keyof ApplicationWorkCounters]: number;
};

const EMPTY_EFFECTS: readonly [] = Object.freeze([]);

export type SectionLocation = Readonly<{
  kind: "section";
  id: SectionId;
  section: Section;
  sectionIndex: number;
}>;

export type MeasureLocation = Readonly<{
  kind: "measure";
  id: MeasureId;
  measure: Measure;
  sectionId: SectionId;
  sectionIndex: number;
  measureIndex: number;
}>;

export type EventLocation = Readonly<{
  kind: "event";
  id: ChordEventId;
  event: ChordEvent;
  sectionId: SectionId;
  measureId: MeasureId;
  sectionIndex: number;
  measureIndex: number;
  eventIndex: number;
}>;

export type DocumentNodeLocation =
  | SectionLocation
  | MeasureLocation
  | EventLocation;

export type DocumentIndex = Readonly<{
  documentId: DocumentId;
  sections: ReadonlyMap<string, SectionLocation>;
  measures: ReadonlyMap<string, MeasureLocation>;
  events: ReadonlyMap<string, EventLocation>;
  sectionOrder: readonly SectionId[];
  measureOrder: readonly MeasureId[];
  eventOrder: readonly ChordEventId[];
}>;

export function createWorkCounters(): MutableApplicationWorkCounters {
  return {
    sectionsVisited: 0,
    measuresVisited: 0,
    eventsVisited: 0,
    stableIdsIndexed: 0,
    historyEntriesVisited: 0,
    historyBytesEstimated: 0,
    bookmarksRepaired: 0,
    requestsCompared: 0,
    transportNotificationsCompared: 0,
    validationCalls: 0,
  };
}

export function freezeWorkCounters(
  counters: MutableApplicationWorkCounters,
): ApplicationWorkCounters {
  return Object.freeze({ ...counters });
}

export function codePointLength(value: string): number {
  return Array.from(value).length;
}

export function isUnicodeScalarString(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
      continue;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

export function isBoundedToken(value: string, maximum: number): boolean {
  return (
    value.trim().length > 0 &&
    isUnicodeScalarString(value) &&
    codePointLength(value) <= maximum
  );
}

export function isNonnegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isRuntimeRecord(
  value: unknown,
): value is Readonly<Record<PropertyKey, unknown>> {
  return typeof value === "object" && value !== null;
}

export function runtimeField(value: unknown, key: PropertyKey): unknown {
  return isRuntimeRecord(value) ? value[key] : undefined;
}

export function asCandidate(
  document: ProgressionDocumentV2,
): ApplicationDocumentCandidate {
  return {
    schema: document.schema,
    id: document.id,
    title: document.title,
    description: document.description,
    meter: document.meter,
    tempoBpm: document.tempoBpm,
    key: document.key,
    sections: document.sections,
    playback: document.playback,
  };
}

export function buildDocumentIndex(
  document: ProgressionDocumentV2,
  counters: MutableApplicationWorkCounters,
): DocumentIndex {
  const sections = new Map<string, SectionLocation>();
  const measures = new Map<string, MeasureLocation>();
  const events = new Map<string, EventLocation>();
  const sectionOrder: SectionId[] = [];
  const measureOrder: MeasureId[] = [];
  const eventOrder: ChordEventId[] = [];

  for (
    let sectionIndex = 0;
    sectionIndex < document.sections.length;
    sectionIndex += 1
  ) {
    const section = document.sections[sectionIndex];
    if (section === undefined) continue;
    counters.sectionsVisited += 1;
    counters.stableIdsIndexed += 1;
    sectionOrder.push(section.id);
    sections.set(section.id, {
      kind: "section",
      id: section.id,
      section,
      sectionIndex,
    });

    for (
      let measureIndex = 0;
      measureIndex < section.measures.length;
      measureIndex += 1
    ) {
      const measure = section.measures[measureIndex];
      if (measure === undefined) continue;
      counters.measuresVisited += 1;
      counters.stableIdsIndexed += 1;
      measureOrder.push(measure.id);
      measures.set(measure.id, {
        kind: "measure",
        id: measure.id,
        measure,
        sectionId: section.id,
        sectionIndex,
        measureIndex,
      });

      for (
        let eventIndex = 0;
        eventIndex < measure.events.length;
        eventIndex += 1
      ) {
        const event = measure.events[eventIndex];
        if (event === undefined) continue;
        counters.eventsVisited += 1;
        counters.stableIdsIndexed += 1;
        eventOrder.push(event.id);
        events.set(event.id, {
          kind: "event",
          id: event.id,
          event,
          sectionId: section.id,
          measureId: measure.id,
          sectionIndex,
          measureIndex,
          eventIndex,
        });
      }
    }
  }

  return {
    documentId: document.id,
    sections,
    measures,
    events,
    sectionOrder: Object.freeze(sectionOrder),
    measureOrder: Object.freeze(measureOrder),
    eventOrder: Object.freeze(eventOrder),
  };
}

export function findNode(
  index: DocumentIndex,
  kind: DocumentNodeLocation["kind"],
  id: string,
): DocumentNodeLocation | null {
  switch (kind) {
    case "section":
      return index.sections.get(id) ?? null;
    case "measure":
      return index.measures.get(id) ?? null;
    case "event":
      return index.events.get(id) ?? null;
  }
}

export function deepStructuralEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right) return false;
  if (left === null || right === null) return false;
  if (typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!deepStructuralEqual(left[index], right[index])) return false;
    }
    return true;
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (!deepStructuralEqual(leftKeys, rightKeys)) return false;
  for (const key of leftKeys) {
    if (!deepStructuralEqual(runtimeField(left, key), runtimeField(right, key))) {
      return false;
    }
  }
  return true;
}

export function positionAfterDurations(
  durations: readonly ChordEvent["duration"][],
): BeatPosition | null {
  const zero = makeBeatPosition({ numerator: 0, denominator: 1 });
  if (!zero.ok) return null;
  let total: BeatValue = zero.value;
  for (const duration of durations) {
    const next = addBeatValues(total, duration);
    if (!next.ok) return null;
    total = next.value;
  }
  const position = makeBeatPosition(total);
  return position.ok ? position.value : null;
}

export function boundaryTargetExists(
  boundary: StableBoundary,
  index: DocumentIndex,
): boolean {
  switch (boundary.kind) {
    case "document-start":
    case "document-end":
      return true;
    case "before-section":
    case "after-section":
    case "section-start":
    case "section-end":
      return index.sections.has(boundary.sectionId);
    case "before-measure":
    case "after-measure":
    case "measure-start":
    case "measure-end":
      return index.measures.has(boundary.measureId);
    case "before-event":
    case "after-event":
      return index.events.has(boundary.eventId);
  }
}

function refusalMessage(code: ApplicationRefusalCode): string {
  switch (code) {
    case "application.revision_exhausted":
      return "The document revision limit has been reached.";
    case "application.sequence_exhausted":
      return "The application sequence limit has been reached.";
    case "command.stale_revision":
    case "command.derived_patch_stale":
      return "The chart changed before this operation could be applied.";
    case "command.wrong_document":
      return "This operation belongs to a different chart.";
    case "command.structural_validation_failed":
    case "command.semantic_validation_failed":
      return "The proposed edit would make the chart invalid.";
    case "history.locked":
      return "Undo and redo are unavailable during this document transition.";
    case "history.undo_empty":
      return "There is nothing to undo.";
    case "history.redo_empty":
      return "There is nothing to redo.";
    case "history.entry_too_large":
      return "This edit is too large to retain safely in Undo history.";
    case "history.nonundoable_confirmation_required":
      return "This replacement requires explicit confirmation that Undo is unavailable.";
    case "bookmark.selection_limit":
      return "The selection exceeds the supported event limit.";
    case "dialog.stack_limit":
      return "Too many dialogs are already open.";
    case "request.limit":
    case "request.slot_busy":
      return "A conflicting background operation is already active.";
    case "transport.notification_invalid":
      return "The transport update was malformed.";
    case "command.id_invalid":
    case "command.label_invalid":
    case "command.logical_time_invalid":
    case "command.target_missing":
    case "command.target_kind_mismatch":
    case "command.destination_invalid":
    case "command.duplicate_target":
    case "command.ancestor_descendant_overlap":
    case "command.payload_invalid":
    case "command.coalescing_invalid":
    case "command.id_allocation_failed":
    case "command.derived_patch_scope_mismatch":
    case "history.byte_estimate_invalid":
    case "bookmark.invalid":
    case "ephemeral.intent_invalid":
    case "request.id_invalid":
    case "request.base_revision_invalid":
    case "transport.expectation_invalid":
      return "The operation could not be applied.";
  }
}

export function appendApplicationNotice(
  state: AppState,
  level: Notice["level"],
  code: string,
  rawMessage: string,
  dismissible = true,
): Readonly<{ state: AppState; notice: Notice }> {
  const sequence = Math.min(state.nextSequence, MAX_APPLICATION_SEQUENCE);
  const message = Array.from(rawMessage)
    .slice(0, MAX_NOTICE_MESSAGE_CODE_POINTS)
    .join("");
  const notice: Notice = Object.freeze({
    sequence,
    level,
    code,
    message,
    createdAtRevision: state.revision,
    dismissible,
  });
  const notices = [...state.notices];
  if (notices.length >= MAX_NOTICES) {
    const dismissibleIndex = notices.findIndex((candidate) => candidate.dismissible);
    notices.splice(dismissibleIndex >= 0 ? dismissibleIndex : 0, 1);
  }
  notices.push(notice);
  return {
    state: Object.freeze({
      ...state,
      notices: Object.freeze(notices),
      nextSequence:
        sequence < MAX_APPLICATION_SEQUENCE ? sequence + 1 : sequence,
    }),
    notice,
  };
}

export function failureResult(
  state: AppState,
  counters: MutableApplicationWorkCounters,
  code: ApplicationRefusalCode,
  path: readonly (string | number)[],
  extras: Readonly<
    Pick<ApplicationRefusal, "semanticIssues" | "structuralIssues">
  > = {},
): ApplicationTransitionResult {
  if (!(APPLICATION_REFUSAL_CODES as readonly string[]).includes(code)) {
    throw new Error("A0_INTERNAL_UNKNOWN_REFUSAL");
  }
  const appended = appendApplicationNotice(
    state,
    "error",
    code,
    refusalMessage(code),
  );
  const refusal: ApplicationRefusal = Object.freeze({
    code,
    path: Object.freeze([...path]),
    message: refusalMessage(code),
    ...extras,
  });
  return Object.freeze({
    ok: false,
    state: appended.state,
    refusal,
    notice: appended.notice,
    effects: EMPTY_EFFECTS,
    counters: freezeWorkCounters(counters),
  });
}

export function successResult(
  state: AppState,
  counters: MutableApplicationWorkCounters,
  outcome: Extract<ApplicationTransitionResult, { ok: true }>["outcome"],
  effects: Extract<ApplicationTransitionResult, { ok: true }>["effects"] = [],
): ApplicationTransitionResult {
  return Object.freeze({
    ok: true,
    state,
    outcome,
    effects: Object.freeze([...effects]),
    counters: freezeWorkCounters(counters),
  });
}
