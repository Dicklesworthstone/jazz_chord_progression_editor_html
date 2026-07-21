import inputLedgerValue from "../fixtures/interchange/input-fixture-ledger.json";
import minimalDocumentValue from "../fixtures/interchange/goldens/minimal.changes.json";
import nestedDocumentValue from "../fixtures/interchange/goldens/nested.changes.json";

import {
  APPLICATION_TRANSPORT_STATUSES,
  IMPORT_NONUNDOABLE_CONFIRMATION_SCHEMA,
  IMPORT_PREVIEW_POLICY_ID,
  IMPORT_PREVIEW_POLICY_VERSION,
  IMPORT_PREVIEW_SCHEMA,
  applicationHistoryRetainedByteEstimator,
  runDocumentCommand,
  type AppState,
  type ApplicationTransitionResult,
  type ApplicationTransportStatus,
  type CommittingDocumentTransition,
  type CommitImportReplacementRequest,
  type ExplicitlyUnavailableImportPreview,
  type HistoryEntry,
  type ImportNonUndoableConfirmationAcknowledgement,
  type ImportNonUndoableConfirmationRequirement,
  type ImportRequestIdentity,
  type RetireImportReplacementRequest,
  type ReplacementRetirementReceipt,
  type ReplaceDocumentCommand,
  type RetiringTransportDocumentTransition,
  type RetainedImportPreview,
  type StableUiBookmarks,
  type X1ReplacementRetirementAdapter,
} from "../../src/application";
import { makeBeatPosition } from "../../src/domain";
import { a0Dependencies, publishA0Candidate } from "./a0-application-fixture";

type JsonObject = Record<string, unknown>;

export type E0RetainedImportFlavor = "canonical" | "legacy";

type RetainedCommitRequest = Extract<
  CommitImportReplacementRequest,
  { preview: RetainedImportPreview }
>;

type ExplicitlyUnavailableCommitRequest = Extract<
  CommitImportReplacementRequest,
  { preview: ExplicitlyUnavailableImportPreview }
>;

/**
 * E0 may bind the X1 port before X1 exists. This adapter records the only
 * honest current runtime outcome and certifies that refusal changed no
 * transport authority.
 */
export const e0UnavailableX1ReplacementRetirementAdapter = Object.freeze({
  retireImportReplacement: () =>
    Promise.resolve(
      Object.freeze({
        ok: false as const,
        code: "transport.replacement_retirement_unavailable" as const,
        retirementEffect: "none" as const,
      }),
    ),
}) satisfies X1ReplacementRetirementAdapter;

export type E0RetainedTransportHandoffMaterialization = Readonly<{
  currentState: AppState;
  currentTransition: RetiringTransportDocumentTransition &
    Readonly<{ undoDisposition: "retained" }>;
  retirementRequest: RetireImportReplacementRequest;
  expectedEmbeddedReceipt: ReplacementRetirementReceipt;
  commitRequest: RetainedCommitRequest;
}>;

export type E0RetainedTransportHandoffMatrix = Readonly<
  Record<
    E0RetainedImportFlavor,
    Readonly<
      Record<
        ApplicationTransportStatus,
        E0RetainedTransportHandoffMaterialization
      >
    >
  >
>;

export type E0ExplicitlyUnavailableReplaceDocumentCommand =
  ReplaceDocumentCommand &
    Readonly<{
      undoDisposition: Extract<
        ReplaceDocumentCommand["undoDisposition"],
        { kind: "explicitly-unavailable" }
      >;
    }>;

export type E0WorkflowMaterialization = Readonly<{
  baseState: AppState;
  transportStates: Readonly<Record<ApplicationTransportStatus, AppState>>;
  retainedTransportHandoffs: E0RetainedTransportHandoffMatrix;
  retainedPreview: RetainedImportPreview;
  unavailablePreview: ExplicitlyUnavailableImportPreview;
  unavailablePreviewReassessmentBytes: number;
  unavailableState: AppState;
  unavailableReplacementBookmarks: StableUiBookmarks;
  unavailableTransition: RetiringTransportDocumentTransition &
    Readonly<{ undoDisposition: "explicitly-unavailable" }>;
  unavailableCommittingTransition: CommittingDocumentTransition &
    Readonly<{ undoDisposition: "explicitly-unavailable" }>;
  unavailableRetirementRequest: RetireImportReplacementRequest;
  expectedUnavailableEmbeddedReceipt: ReplacementRetirementReceipt;
  acknowledgement: ImportNonUndoableConfirmationAcknowledgement;
  wrongAcknowledgement: ImportNonUndoableConfirmationAcknowledgement;
  unavailableReplacementCommand: E0ExplicitlyUnavailableReplaceDocumentCommand;
  unavailableReplacementResult: Extract<
    ApplicationTransitionResult,
    { ok: true }
  >;
  unavailableCommitRequest: ExplicitlyUnavailableCommitRequest;
  x1ReplacementRetirementAdapter: X1ReplacementRetirementAdapter;
  independentHistoryEstimates: Readonly<{
    undo: number;
    redo: number;
    replacement: number;
  }>;
}>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectAt(value: unknown, label: string): JsonObject {
  if (!isObject(value)) {
    throw new Error(`E0_FIXTURE_OBJECT:${label}`);
  }
  return value;
}

function beat(numerator: number, denominator: number) {
  const result = makeBeatPosition({ numerator, denominator });
  if (!result.ok) throw new Error("E0_FIXTURE_BEAT");
  return result.value;
}

function assertLedgerSentinels(): void {
  const root = objectAt(inputLedgerValue, "root");
  const shared = objectAt(root["sharedBases"], "sharedBases");
  const stateWrapper = objectAt(
    shared["workflow-state-revision-7"],
    "workflow-state-revision-7",
  );
  const state = objectAt(stateWrapper["value"], "workflow-state-value");
  const history = objectAt(state["history"], "history");
  const transport = objectAt(state["transport"], "transport");
  const preview = objectAt(
    shared["canonical-ready-import-preview"],
    "canonical-preview",
  );
  const impact = objectAt(preview["replacementImpact"], "retained-impact");
  if (
    stateWrapper["materializeAs"] !== "AppState" ||
    state["revision"] !== 7 ||
    history["retainedBytesEstimate"] !== 18_393 ||
    transport["commandRequestId"] !== 11 ||
    transport["notificationSequence"] !== 11 ||
    !("failureCode" in transport) ||
    "previewActive" in transport ||
    impact["historyEntryRetainedBytes"] !== 9_195 ||
    preview["nonUndoableConfirmationRequirement"] !== null
  ) {
    throw new Error("E0_FIXTURE_LEDGER_SENTINEL");
  }
}

function replacementEntryWithoutEstimate(
  state: AppState,
  candidate: AppState["document"],
  afterBookmarks: StableUiBookmarks,
): Omit<HistoryEntry, "retainedBytesEstimate"> {
  return Object.freeze({
    commandId: "command-e0-replace-1",
    commandKind: "replace-document",
    label: "Import Changes",
    before: state.document,
    after: candidate,
    beforeBookmarks: state.bookmarks,
    afterBookmarks,
    coalescing: null,
    firstLogicalTimeMs: 9_000,
    lastLogicalTimeMs: 9_000,
  });
}

function withoutRetainedBytes(
  entry: HistoryEntry,
): Omit<HistoryEntry, "retainedBytesEstimate"> {
  return Object.freeze({
    commandId: entry.commandId,
    commandKind: entry.commandKind,
    label: entry.label,
    before: entry.before,
    after: entry.after,
    beforeBookmarks: entry.beforeBookmarks,
    afterBookmarks: entry.afterBookmarks,
    coalescing: entry.coalescing,
    firstLogicalTimeMs: entry.firstLogicalTimeMs,
    lastLogicalTimeMs: entry.lastLogicalTimeMs,
  });
}

function oversizedHistoryDocumentRecipe(): JsonObject {
  const eventMeasureCount = 4_722;
  const measuresPerSection = 1_024;
  const sections = Array.from({ length: 48 }, (_, sectionIndex) => ({
    id: `s${String(sectionIndex)}`,
    name: "S",
    annotation: "",
    keyOverride: null,
    voiceLeadingBoundary: "continue",
    measures: Array.from({ length: measuresPerSection }, (_, measureIndex) => {
      const globalMeasure = sectionIndex * measuresPerSection + measureIndex;
      const containsEvent = globalMeasure < eventMeasureCount;
      return {
        id: `m${String(globalMeasure)}`,
        events: containsEvent
          ? [
              {
                id: `e${String(globalMeasure)}`,
                duration: { numerator: 4, denominator: 1 },
                annotation: "",
                chord: {
                  kind: "parsed",
                  sourceText: "C",
                  root: { step: "C", alter: 0 },
                  triad: "major",
                  sixth: null,
                  seventh: null,
                  extensions: [],
                  additions: [],
                  alterations: [],
                  omissions: [],
                  bass: null,
                  colorPolicy: "none",
                },
                voicing: {
                  mode: "auto",
                  family: "balanced",
                  voiceCount: 4,
                  range: { lowMidi: 48, highMidi: 72 },
                  bassPolicy: "generated",
                },
              },
            ]
          : [],
        completion: { kind: containsEvent ? "complete" : "empty" },
      };
    }),
  }));
  return {
    schema: "changes.progression.v2",
    id: "oversized",
    title: "O",
    description: "x".repeat(7),
    meter: { beatsPerBar: 4, beatUnit: 4 },
    tempoBpm: 120,
    key: { tonic: { step: "C", alter: 0 }, mode: "major" },
    sections,
    playback: {
      instrumentId: "mellow-keys",
      masterVolume: 0.8,
      reverbAmount: 0.2,
      countInBars: 0,
    },
  };
}

export function materializeE0WorkflowValues(): E0WorkflowMaterialization {
  assertLedgerSentinels();
  const minimal = publishA0Candidate(minimalDocumentValue);
  const nested = publishA0Candidate(nestedDocumentValue);
  const oversized = publishA0Candidate(oversizedHistoryDocumentRecipe());
  const nestedEvent = nested.sections[0]?.measures[0]?.events[0];
  if (nestedEvent?.id !== "event-e0-auto") {
    throw new Error("E0_FIXTURE_NESTED_EVENT");
  }

  const emptyBookmarks = Object.freeze({
    selection: Object.freeze({ kind: "none" as const }),
    insertion: Object.freeze({ kind: "document-start" as const }),
    range: null,
  }) satisfies StableUiBookmarks;
  const replacementBookmarks = Object.freeze({
    selection: Object.freeze({ kind: "none" as const }),
    insertion: Object.freeze({ kind: "document-start" as const }),
    range: null,
  }) satisfies StableUiBookmarks;
  const nestedBookmarks = Object.freeze({
    selection: Object.freeze({
      kind: "events" as const,
      eventIds: Object.freeze([nestedEvent.id] as const),
      anchorEventId: nestedEvent.id,
      focusEventId: nestedEvent.id,
    }),
    insertion: Object.freeze({
      kind: "after-event" as const,
      eventId: nestedEvent.id,
    }),
    range: Object.freeze({
      anchor: Object.freeze({
        kind: "before-event" as const,
        eventId: nestedEvent.id,
      }),
      focus: Object.freeze({
        kind: "after-event" as const,
        eventId: nestedEvent.id,
      }),
    }),
  }) satisfies StableUiBookmarks;

  const undoEntry = Object.freeze({
    commandId: "history-e0-retained",
    commandKind: "replace-document" as const,
    label: "Import nested chart",
    before: minimal,
    after: nested,
    beforeBookmarks: emptyBookmarks,
    afterBookmarks: nestedBookmarks,
    retainedBytesEstimate: 9_199,
    coalescing: null,
    firstLogicalTimeMs: 7_000,
    lastLogicalTimeMs: 7_000,
  }) satisfies HistoryEntry;
  const redoEntry = Object.freeze({
    commandId: "history-e0-redo",
    commandKind: "replace-document" as const,
    label: "Import empty chart",
    before: nested,
    after: minimal,
    beforeBookmarks: nestedBookmarks,
    afterBookmarks: emptyBookmarks,
    retainedBytesEstimate: 9_194,
    coalescing: null,
    firstLogicalTimeMs: 7_500,
    lastLogicalTimeMs: 7_500,
  }) satisfies HistoryEntry;

  const zero = beat(0, 1);
  const one = beat(1, 1);
  const baseState = Object.freeze({
    document: nested,
    revision: 7,
    exportRevision: 3,
    recovery: Object.freeze({ kind: "clean" as const, persistedRevision: 7 }),
    history: Object.freeze({
      undo: Object.freeze([undoEntry]),
      redo: Object.freeze([redoEntry]),
      retainedBytesEstimate: 18_393,
    }),
    bookmarks: nestedBookmarks,
    panels: Object.freeze({
      open: Object.freeze(["chart", "inspector", "history"] as const),
      active: "chart" as const,
      leftRailCollapsed: false,
      rightRailCollapsed: false,
    }),
    dialogs: Object.freeze([]),
    quickEntry: Object.freeze({
      text: "",
      target: nestedBookmarks.insertion,
      baseRevision: 7,
      status: "idle" as const,
      issueCodes: Object.freeze([]),
    }),
    importDraft: null,
    transport: Object.freeze({
      status: "playing" as const,
      generation: 11,
      commandRequestId: 11,
      notificationSequence: 11,
      documentId: nested.id,
      planRevision: 7,
      startBeat: zero,
      playhead: one,
      failureCode: null,
    }),
    pendingRequests: Object.freeze([]),
    documentTransition: Object.freeze({ kind: "idle" as const }),
    focusRequest: null,
    notices: Object.freeze([]),
    nextSequence: 12,
  }) satisfies AppState;

  const withTransport = (
    status: ApplicationTransportStatus,
    failureCode: string | null,
    unavailable = false,
  ): AppState =>
    Object.freeze({
      ...baseState,
      transport: Object.freeze({
        ...baseState.transport,
        status,
        generation: unavailable ? 0 : 11,
        commandRequestId: unavailable ? 0 : 11,
        notificationSequence: unavailable ? 0 : 11,
        playhead: status === "ready" || unavailable ? zero : one,
        failureCode,
      }),
    });
  const transportStates = Object.freeze({
    unavailable: withTransport("unavailable", null, true),
    ready: withTransport("ready", null),
    starting: withTransport("starting", null),
    playing: withTransport("playing", null),
    paused: withTransport("paused", null),
    stopping: withTransport("stopping", null),
    failed: withTransport("failed", "transport.fixture_failure"),
  }) satisfies Readonly<Record<ApplicationTransportStatus, AppState>>;
  if (
    APPLICATION_TRANSPORT_STATUSES.some(
      (status) => transportStates[status].transport.status !== status,
    )
  ) {
    throw new Error("E0_FIXTURE_TRANSPORT_MATRIX");
  }

  const canonicalIdentity = Object.freeze({
    requestId: 101,
    documentId: nested.id,
    baseRevision: 7,
  }) satisfies ImportRequestIdentity;
  const previewBase = Object.freeze({
    schema: IMPORT_PREVIEW_SCHEMA,
    policyId: IMPORT_PREVIEW_POLICY_ID,
    policyVersion: IMPORT_PREVIEW_POLICY_VERSION,
    identity: canonicalIdentity,
    sourceFormat: "canonical-json-v2" as const,
    replacementOrigin: "canonical-import" as const,
    candidate: minimal,
    summary: Object.freeze({
      sections: 0,
      measures: 0,
      chordEvents: 0,
      emptyMeasures: 0,
      manualVoicings: 0,
      frozenVoicings: 0,
      customChords: 0,
      migrationWarnings: 0,
      migrationRejectedSections: 0,
      migrationRejectedEvents: 0,
    }),
    issues: Object.freeze({
      total: 0,
      retained: Object.freeze([]),
      omitted: 0,
      retentionPolicy: "stage-path-code-first-64" as const,
    }),
    report: Object.freeze({
      totalItems: 0,
      retainedItems: Object.freeze([]),
      omittedItems: 0,
      retentionPolicy: "group-source-path-code-target-path-first-256" as const,
    }),
    replacementCommandSeed: Object.freeze({
      id: "command-e0-replace-1",
      label: "Import Changes",
      logicalTimeMs: 9_000,
    }),
    rawSourceRetained: false as const,
    autoApplyAuthorized: false as const,
  });
  const retainedPreview = Object.freeze({
    ...previewBase,
    replacementImpact: Object.freeze({
      historyEntryRetainedBytes: 9_195,
      evictedUndoEntries: 0,
      redoEntriesCleared: 1,
      confirmationRequired: true as const,
      undoDisposition: "retained" as const,
      undoEntriesAfterCommit: 2,
      undoRetainedBytesAfterCommit: 18_394,
      exportRecommended: false as const,
    }),
    nonUndoableConfirmationRequirement: null,
  }) satisfies RetainedImportPreview;

  const legacyRetainedPreview = Object.freeze({
    ...retainedPreview,
    sourceFormat: "unversioned-legacy-json" as const,
    replacementOrigin: "legacy-import" as const,
  }) satisfies RetainedImportPreview;

  const retainedHandoff = (
    flavor: E0RetainedImportFlavor,
    transportState: AppState,
  ): E0RetainedTransportHandoffMaterialization => {
    const preview =
      flavor === "canonical" ? retainedPreview : legacyRetainedPreview;
    const currentTransition = Object.freeze({
      kind: "retiring-transport" as const,
      requestId: preview.identity.requestId,
      origin: preview.replacementOrigin,
      baseRevision: preview.identity.baseRevision,
      candidateDocumentId: preview.candidate.id,
      undoDisposition: "retained" as const,
    }) satisfies RetiringTransportDocumentTransition &
      Readonly<{ undoDisposition: "retained" }>;
    const currentState = Object.freeze({
      ...transportState,
      pendingRequests: Object.freeze([
        Object.freeze({
          kind: "document-transition" as const,
          id: preview.identity.requestId,
          documentId: preview.identity.documentId,
          baseRevision: preview.identity.baseRevision,
          status: "running" as const,
        }),
      ]),
      documentTransition: currentTransition,
    }) satisfies AppState;
    const retirementRequest = Object.freeze({
      identity: preview.identity,
      sourceFormat: preview.sourceFormat,
      candidateDocumentId: preview.candidate.id,
      expectedTransportGeneration: currentState.transport.generation,
      scope: "progression-and-preview" as const,
      requiredPostcondition: "zero-future-attack" as const,
    }) satisfies RetireImportReplacementRequest;
    const expectedEmbeddedReceipt = Object.freeze({
      requestId: preview.identity.requestId,
      retiredTransportGeneration: currentState.transport.generation,
      progressionRetired: true as const,
      previewRetired: true as const,
      noFutureAttack: true as const,
    }) satisfies ReplacementRetirementReceipt;
    const commitRequest = Object.freeze({
      preview,
      currentState,
      currentTransition,
      nonUndoableConfirmation: null,
    }) satisfies RetainedCommitRequest;
    return Object.freeze({
      currentState,
      currentTransition,
      retirementRequest,
      expectedEmbeddedReceipt,
      commitRequest,
    });
  };
  const retainedTransportHandoffs = Object.freeze({
    canonical: Object.freeze({
      unavailable: retainedHandoff("canonical", transportStates.unavailable),
      ready: retainedHandoff("canonical", transportStates.ready),
      starting: retainedHandoff("canonical", transportStates.starting),
      playing: retainedHandoff("canonical", transportStates.playing),
      paused: retainedHandoff("canonical", transportStates.paused),
      stopping: retainedHandoff("canonical", transportStates.stopping),
      failed: retainedHandoff("canonical", transportStates.failed),
    }),
    legacy: Object.freeze({
      unavailable: retainedHandoff("legacy", transportStates.unavailable),
      ready: retainedHandoff("legacy", transportStates.ready),
      starting: retainedHandoff("legacy", transportStates.starting),
      playing: retainedHandoff("legacy", transportStates.playing),
      paused: retainedHandoff("legacy", transportStates.paused),
      stopping: retainedHandoff("legacy", transportStates.stopping),
      failed: retainedHandoff("legacy", transportStates.failed),
    }),
  }) satisfies E0RetainedTransportHandoffMatrix;

  const unavailableIdentity = Object.freeze({
    requestId: 101,
    documentId: oversized.id,
    baseRevision: 7,
  }) satisfies ImportRequestIdentity;
  const unavailableTransition = Object.freeze({
    kind: "retiring-transport" as const,
    requestId: unavailableIdentity.requestId,
    origin: "canonical-import" as const,
    baseRevision: unavailableIdentity.baseRevision,
    candidateDocumentId: minimal.id,
    undoDisposition: "explicitly-unavailable" as const,
  }) satisfies RetiringTransportDocumentTransition &
    Readonly<{ undoDisposition: "explicitly-unavailable" }>;
  const unavailableCommittingTransition = Object.freeze({
    ...unavailableTransition,
    kind: "committing" as const,
  }) satisfies CommittingDocumentTransition &
    Readonly<{ undoDisposition: "explicitly-unavailable" }>;
  const unavailableState = Object.freeze({
    ...baseState,
    document: oversized,
    history: Object.freeze({
      undo: Object.freeze([]),
      redo: Object.freeze([]),
      retainedBytesEstimate: 0,
    }),
    bookmarks: emptyBookmarks,
    quickEntry: Object.freeze({
      text: "",
      target: emptyBookmarks.insertion,
      baseRevision: 7,
      status: "idle" as const,
      issueCodes: Object.freeze([]),
    }),
    transport: Object.freeze({
      ...baseState.transport,
      documentId: oversized.id,
    }),
    pendingRequests: Object.freeze([
      Object.freeze({
        kind: "document-transition" as const,
        id: unavailableIdentity.requestId,
        documentId: unavailableIdentity.documentId,
        baseRevision: unavailableIdentity.baseRevision,
        status: "running" as const,
      }),
    ]),
    documentTransition: unavailableTransition,
  }) satisfies AppState;
  const unavailableReplacementEntry = replacementEntryWithoutEstimate(
    unavailableState,
    minimal,
    replacementBookmarks,
  );
  const unavailablePreviewReassessmentBytes =
    applicationHistoryRetainedByteEstimator(unavailableReplacementEntry);
  if (unavailablePreviewReassessmentBytes !== 16_777_217) {
    throw new Error("E0_FIXTURE_OVERSIZED_HISTORY_ESTIMATOR");
  }
  const unavailableImpact = Object.freeze({
    historyEntryRetainedBytes: unavailablePreviewReassessmentBytes,
    evictedUndoEntries: 0,
    redoEntriesCleared: 0,
    confirmationRequired: true as const,
    undoDisposition: "explicitly-unavailable" as const,
    undoEntriesAfterCommit: 0 as const,
    undoRetainedBytesAfterCommit: 0 as const,
    exportRecommended: true as const,
  });
  const requirement = Object.freeze({
    schema: IMPORT_NONUNDOABLE_CONFIRMATION_SCHEMA,
    confirmationId: "confirm-e0-impact-1",
    identity: unavailableIdentity,
    candidateDocumentId: minimal.id,
    commandId: previewBase.replacementCommandSeed.id,
    disclosedImpact: unavailableImpact,
  }) satisfies ImportNonUndoableConfirmationRequirement;
  const unavailablePreview = Object.freeze({
    ...previewBase,
    identity: unavailableIdentity,
    replacementImpact: unavailableImpact,
    nonUndoableConfirmationRequirement: requirement,
  }) satisfies ExplicitlyUnavailableImportPreview;
  const unavailableRetirementRequest = Object.freeze({
    identity: unavailableIdentity,
    sourceFormat: unavailablePreview.sourceFormat,
    candidateDocumentId: unavailablePreview.candidate.id,
    expectedTransportGeneration: unavailableState.transport.generation,
    scope: "progression-and-preview" as const,
    requiredPostcondition: "zero-future-attack" as const,
  }) satisfies RetireImportReplacementRequest;
  const expectedUnavailableEmbeddedReceipt = Object.freeze({
    requestId: unavailableIdentity.requestId,
    retiredTransportGeneration: unavailableState.transport.generation,
    progressionRetired: true as const,
    previewRetired: true as const,
    noFutureAttack: true as const,
  }) satisfies ReplacementRetirementReceipt;
  const acknowledgement = Object.freeze({
    kind: "acknowledged" as const,
    requirement,
  }) satisfies ImportNonUndoableConfirmationAcknowledgement;
  const wrongRequirement = Object.freeze({
    ...requirement,
    confirmationId: "confirm-e0-impact-wrong",
  }) satisfies ImportNonUndoableConfirmationRequirement;
  const wrongAcknowledgement = Object.freeze({
    kind: "acknowledged" as const,
    requirement: wrongRequirement,
  }) satisfies ImportNonUndoableConfirmationAcknowledgement;
  const unavailableCommitRequest = Object.freeze({
    preview: unavailablePreview,
    currentState: unavailableState,
    currentTransition: unavailableTransition,
    nonUndoableConfirmation: acknowledgement,
  }) satisfies ExplicitlyUnavailableCommitRequest;
  const unavailableReplacementCommand = Object.freeze({
    id: unavailablePreview.replacementCommandSeed.id,
    label: unavailablePreview.replacementCommandSeed.label,
    expectedDocumentId: unavailableState.document.id,
    expectedRevision: unavailableState.revision,
    logicalTimeMs: unavailablePreview.replacementCommandSeed.logicalTimeMs,
    coalescing: null,
    kind: "replace-document" as const,
    origin: unavailablePreview.replacementOrigin,
    candidate: unavailablePreview.candidate,
    requestId: unavailablePreview.identity.requestId,
    retirement: expectedUnavailableEmbeddedReceipt,
    undoDisposition: Object.freeze({
      kind: "explicitly-unavailable" as const,
      confirmationId:
        unavailablePreview.nonUndoableConfirmationRequirement.confirmationId,
      exportRecommended:
        unavailablePreview.nonUndoableConfirmationRequirement.disclosedImpact
          .exportRecommended,
    }),
  }) satisfies E0ExplicitlyUnavailableReplaceDocumentCommand;
  const dependencies = a0Dependencies();
  if (
    dependencies.estimateHistoryRetainedBytes !==
    applicationHistoryRetainedByteEstimator
  ) {
    throw new Error("E0_FIXTURE_A0_ESTIMATOR_IDENTITY");
  }
  const unavailableReplacementResult = runDocumentCommand({
    state: Object.freeze({
      ...unavailableState,
      documentTransition: unavailableCommittingTransition,
    }),
    command: unavailableReplacementCommand,
    dependencies,
  });
  if (!unavailableReplacementResult.ok) {
    throw new Error(
      `E0_FIXTURE_OVERSIZED_REPLACEMENT:${unavailableReplacementResult.refusal.code}`,
    );
  }
  if (
    unavailableReplacementResult.state.document.id !== minimal.id ||
    unavailableReplacementResult.state.revision !== 8 ||
    unavailableReplacementResult.state.history.undo.length !== 0 ||
    unavailableReplacementResult.state.history.redo.length !== 0 ||
    unavailableReplacementResult.state.history.retainedBytesEstimate !== 0 ||
    unavailableReplacementResult.state.transport !==
      unavailableState.transport ||
    unavailableReplacementResult.counters.historyBytesEstimated !==
      unavailablePreviewReassessmentBytes ||
    unavailableReplacementResult.state.notices.at(-1)?.level !== "warning" ||
    unavailableReplacementResult.state.notices.at(-1)?.code !==
      "history.replacement_not_undoable" ||
    !unavailableReplacementResult.effects.some(
      (item) =>
        item.kind === "recommend-export" &&
        item.requestId === unavailableIdentity.requestId,
    )
  ) {
    throw new Error(
      `E0_FIXTURE_OVERSIZED_REPLACEMENT_RESULT:${JSON.stringify({
        documentId: unavailableReplacementResult.state.document.id,
        revision: unavailableReplacementResult.state.revision,
        undo: unavailableReplacementResult.state.history.undo.length,
        redo: unavailableReplacementResult.state.history.redo.length,
        retainedBytes:
          unavailableReplacementResult.state.history.retainedBytesEstimate,
        transportPreserved:
          unavailableReplacementResult.state.transport ===
          unavailableState.transport,
        historyBytesEstimated:
          unavailableReplacementResult.counters.historyBytesEstimated,
        notice: unavailableReplacementResult.state.notices.at(-1),
        effects: unavailableReplacementResult.effects,
      })}`,
    );
  }

  const replacement = replacementEntryWithoutEstimate(
    baseState,
    minimal,
    emptyBookmarks,
  );
  const independentHistoryEstimates = Object.freeze({
    undo: applicationHistoryRetainedByteEstimator(
      withoutRetainedBytes(undoEntry),
    ),
    redo: applicationHistoryRetainedByteEstimator(
      withoutRetainedBytes(redoEntry),
    ),
    replacement: applicationHistoryRetainedByteEstimator(replacement),
  });
  if (
    independentHistoryEstimates.undo !== 9_199 ||
    independentHistoryEstimates.redo !== 9_194 ||
    independentHistoryEstimates.replacement !== 9_195
  ) {
    throw new Error("E0_FIXTURE_HISTORY_ESTIMATOR");
  }

  return Object.freeze({
    baseState,
    transportStates,
    retainedTransportHandoffs,
    retainedPreview,
    unavailablePreview,
    unavailablePreviewReassessmentBytes,
    unavailableState,
    unavailableReplacementBookmarks: replacementBookmarks,
    unavailableTransition,
    unavailableCommittingTransition,
    unavailableRetirementRequest,
    expectedUnavailableEmbeddedReceipt,
    acknowledgement,
    wrongAcknowledgement,
    unavailableReplacementCommand,
    unavailableReplacementResult,
    unavailableCommitRequest,
    x1ReplacementRetirementAdapter: e0UnavailableX1ReplacementRetirementAdapter,
    independentHistoryEstimates,
  });
}
