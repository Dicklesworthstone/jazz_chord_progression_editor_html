import type {
  BeatDuration,
  BeatPosition,
  BeatRange,
  ChordEvent,
  ChordEventId,
  DocumentId,
  DocumentDecoderIssue,
  DocumentShapeIssueCode,
  DecodeDocumentShape,
  DomainCopyOperation,
  DomainPath,
  KeyContext,
  Measure,
  MeasureCompletion,
  MeasureId,
  PlaybackSettings,
  ProgressionDocumentV2,
  Section,
  SectionId,
  SectionVoiceLeadingBoundary,
  StableIdFactory,
  ValidatedDocument,
  Voicing,
} from "../domain";
import type {
  DocumentSemanticIssue,
  ValidateDocumentSemantics,
} from "./document-validation-contract";
import type {
  ApplyEditPlanCommand,
  ParseAtomicEditPlanFragment,
} from "./application-edit-plan-contract";

/** Versioned, code-facing A0 state/command contract. */
export const APPLICATION_STATE_CONTRACT_SCHEMA =
  "changes.application.state-contract.v1";
export const APPLICATION_STATE_POLICY_ID = "changes.application-state";
export const APPLICATION_STATE_POLICY_VERSION = 1;
export const APPLICATION_HISTORY_POLICY_ID = "changes.application-history";
export const APPLICATION_HISTORY_POLICY_VERSION = 1;
export const APPLICATION_STALE_RESULT_POLICY_ID =
  "changes.application-stale-result-gate";
export const APPLICATION_STALE_RESULT_POLICY_VERSION = 1;

export const MAX_APPLICATION_REVISION = Number.MAX_SAFE_INTEGER;
export const MAX_APPLICATION_SEQUENCE = Number.MAX_SAFE_INTEGER;
export const MAX_HISTORY_ENTRIES = 200;
export const MAX_HISTORY_RETAINED_BYTES = 16 * 1024 * 1024;
export const MAX_SELECTED_EVENT_IDS = 8_192;
export const MAX_DIALOG_STACK_DEPTH = 8;
export const MAX_NOTICES = 32;
export const MAX_PENDING_REQUESTS = 8;
export const MAX_COMMAND_ID_CODE_POINTS = 128;
export const MAX_COMMAND_LABEL_CODE_POINTS = 160;
export const MAX_FOCUS_SESSION_ID_CODE_POINTS = 128;
export const MAX_NOTICE_MESSAGE_CODE_POINTS = 512;
export const MAX_QUICK_ENTRY_CODE_POINTS = 4_096;
export const MAX_DRAFT_ISSUES = 64;
export const TEXT_COMMAND_COALESCE_WINDOW_MS = 1_000;

/**
 * A conservative structural estimate, never a JSON clone. Object identity is
 * counted once per entry traversal; adjacent entries are deliberately not
 * deduplicated so the cap errs toward earlier eviction.
 */
export const HISTORY_RETAINED_BYTE_ESTIMATE_POLICY = Object.freeze({
  id: "changes.history-retained-byte-estimate",
  version: 1,
  objectBytes: 32,
  arrayBytes: 24,
  arraySlotBytes: 8,
  stringBytes: 16,
  numberBytes: 8,
  booleanBytes: 4,
  nullBytes: 4,
  referenceBytes: 8,
  stringPayload: "utf8",
  sharedIdentityScope: "one-history-entry",
  jsonSerialization: "forbidden",
} as const);

/**
 * The first fifteen kinds are the accepted historical A0 tuple and must never
 * be reordered or renamed; `apply-edit-plan` is the sole authorized A0/U1
 * amendment suffix (R1, accepted 2026-07-24).
 */
export const APPLICATION_COMMAND_KINDS = Object.freeze([
  "insert",
  "delete",
  "move",
  "duplicate",
  "set-text",
  "set-duration",
  "set-measure-completion",
  "set-section",
  "set-chord",
  "set-voicing",
  "set-document-settings",
  "transpose",
  "apply-suggestion",
  "apply-reharmonization",
  "replace-document",
  "apply-edit-plan",
] as const);

export type ApplicationCommandKind =
  (typeof APPLICATION_COMMAND_KINDS)[number];

export const APPLICATION_REPLACEMENT_ORIGINS = Object.freeze([
  "new",
  "lesson",
  "canonical-import",
  "legacy-import",
] as const);

export type ApplicationReplacementOrigin =
  (typeof APPLICATION_REPLACEMENT_ORIGINS)[number];

export const APPLICATION_REQUEST_KINDS = Object.freeze([
  "analysis",
  "import-read",
  "voicing-search",
  "suggestion-search",
  "route-search",
  "constraint-search",
  "reharmonization-search",
  "practice-generation",
  "playback-plan",
  "document-transition",
] as const);

export type ApplicationRequestKind =
  (typeof APPLICATION_REQUEST_KINDS)[number];

export const APPLICATION_TRANSPORT_STATUSES = Object.freeze([
  "unavailable",
  "ready",
  "starting",
  "playing",
  "paused",
  "stopping",
  "failed",
] as const);

export type ApplicationTransportStatus =
  (typeof APPLICATION_TRANSPORT_STATUSES)[number];

export const APPLICATION_PANEL_IDS = Object.freeze([
  "chart",
  "inspector",
  "history",
  "atlas",
  "continuation",
  "tonal-journey",
  "route-planner",
  "constraints",
  "reharmonization",
  "guide-tones",
  "color-lab",
  "practice",
  "document",
  "settings",
] as const);

export type ApplicationPanelId = (typeof APPLICATION_PANEL_IDS)[number];

export const APPLICATION_DIALOG_KINDS = Object.freeze([
  "new-document",
  "lesson-load",
  "import-confirm",
  "discard-changes",
  "history-limit",
  "error-details",
] as const);

export type ApplicationDialogKind =
  (typeof APPLICATION_DIALOG_KINDS)[number];

export const APPLICATION_REFUSAL_CODES = Object.freeze([
  "application.revision_exhausted",
  "application.sequence_exhausted",
  "command.id_invalid",
  "command.label_invalid",
  "command.logical_time_invalid",
  "command.stale_revision",
  "command.wrong_document",
  "command.target_missing",
  "command.target_kind_mismatch",
  "command.destination_invalid",
  "command.duplicate_target",
  "command.ancestor_descendant_overlap",
  "command.payload_invalid",
  "command.coalescing_invalid",
  "command.id_allocation_failed",
  "command.derived_patch_scope_mismatch",
  "command.derived_patch_stale",
  "command.structural_validation_failed",
  "command.semantic_validation_failed",
  "history.locked",
  "history.undo_empty",
  "history.redo_empty",
  "history.entry_too_large",
  "history.nonundoable_confirmation_required",
  "history.byte_estimate_invalid",
  "bookmark.invalid",
  "bookmark.selection_limit",
  "dialog.stack_limit",
  "ephemeral.intent_invalid",
  "request.limit",
  "request.slot_busy",
  "request.id_invalid",
  "request.base_revision_invalid",
  "transport.expectation_invalid",
  "transport.notification_invalid",
] as const);

export type ApplicationRefusalCode =
  (typeof APPLICATION_REFUSAL_CODES)[number];

export const APPLICATION_STATE_OPERATION_NAMES = Object.freeze([
  "createInitialAppState",
  "runDocumentCommand",
  "undoDocumentCommand",
  "redoDocumentCommand",
  "reduceEphemeralIntent",
  "beginApplicationRequest",
  "settleApplicationRequest",
  "acceptTransportNotification",
  "selectEventById",
  "selectSelectedEvents",
  "selectInsertionLocation",
  "selectBeatRange",
  "selectDirtyState",
  "selectHistoryAvailability",
] as const);

export type ApplicationStateOperationName =
  (typeof APPLICATION_STATE_OPERATION_NAMES)[number];

/** All counters are deterministic work counts; elapsed time is never a cutoff. */
export const APPLICATION_WORK_COUNTER_NAMES = Object.freeze([
  "sectionsVisited",
  "measuresVisited",
  "eventsVisited",
  "stableIdsIndexed",
  "historyEntriesVisited",
  "historyBytesEstimated",
  "bookmarksRepaired",
  "requestsCompared",
  "transportNotificationsCompared",
  "validationCalls",
] as const);

export type ApplicationWorkCounters = Readonly<{
  sectionsVisited: number;
  measuresVisited: number;
  eventsVisited: number;
  stableIdsIndexed: number;
  historyEntriesVisited: number;
  historyBytesEstimated: number;
  bookmarksRepaired: number;
  requestsCompared: number;
  transportNotificationsCompared: number;
  validationCalls: number;
}>;

export type AppRevision = number;
export type ApplicationSequence = number;
export type ApplicationRequestId = number;
export type TransportGeneration = number;
export type TransportRequestId = number;
export type CommandId = string;
export type FocusSessionId = string;

export type StableEventSelection =
  | Readonly<{ kind: "none" }>
  | Readonly<{
      kind: "events";
      /** Canonical current-document order, duplicate-free. */
      eventIds: readonly [ChordEventId, ...ChordEventId[]];
      anchorEventId: ChordEventId;
      focusEventId: ChordEventId;
    }>;

export type StableBoundary =
  | Readonly<{ kind: "document-start" | "document-end" }>
  | Readonly<{
      kind: "before-section" | "after-section";
      sectionId: SectionId;
    }>
  | Readonly<{
      kind: "section-start" | "section-end";
      sectionId: SectionId;
    }>
  | Readonly<{
      kind: "before-measure" | "after-measure";
      measureId: MeasureId;
    }>
  | Readonly<{
      kind: "measure-start" | "measure-end";
      measureId: MeasureId;
    }>
  | Readonly<{
      kind: "before-event" | "after-event";
      eventId: ChordEventId;
    }>;

export type InsertionPoint = StableBoundary | null;

export type StableRangeSelection = Readonly<{
  /** Direction is retained for focus/extension; selectors derive ordered beats. */
  anchor: StableBoundary;
  focus: StableBoundary;
}>;

export type StableUiBookmarks = Readonly<{
  selection: StableEventSelection;
  insertion: InsertionPoint;
  range: StableRangeSelection | null;
}>;

export type UiFocusTarget =
  | Readonly<{ kind: "chart" }>
  | Readonly<{ kind: "section"; sectionId: SectionId }>
  | Readonly<{ kind: "measure"; measureId: MeasureId }>
  | Readonly<{ kind: "event"; eventId: ChordEventId }>
  | Readonly<{ kind: "dialog"; dialogId: string }>;

export type FocusRequest = Readonly<{
  sequence: ApplicationSequence;
  target: UiFocusTarget;
  reason:
    | "command"
    | "delete-repair"
    | "replacement"
    | "undo"
    | "redo"
    | "dialog-close";
}> | null;

export type PanelState = Readonly<{
  open: readonly ApplicationPanelId[];
  active: ApplicationPanelId;
  leftRailCollapsed: boolean;
  rightRailCollapsed: boolean;
}>;

export type DialogDescriptor = Readonly<{
  id: string;
  kind: ApplicationDialogKind;
  phase: "open" | "committing" | "failed";
  blocksHistory: boolean;
  requestId: ApplicationRequestId | null;
}>;

export type DialogStack = readonly DialogDescriptor[];

export type QuickEntryDraft = Readonly<{
  text: string;
  target: InsertionPoint;
  baseRevision: AppRevision;
  status: "idle" | "invalid" | "ready";
  issueCodes: readonly string[];
}>;

export type ImportDraft = Readonly<{
  id: string;
  origin: "canonical-import" | "legacy-import";
  baseRevision: AppRevision;
  readRequestId: ApplicationRequestId;
  status: "reading" | "invalid" | "ready" | "cancelled";
  candidate: ValidatedDocument | null;
  issueCodes: readonly string[];
}>;

export type Notice = Readonly<{
  sequence: ApplicationSequence;
  level: "info" | "success" | "warning" | "error";
  code: string;
  message: string;
  createdAtRevision: AppRevision;
  dismissible: boolean;
}>;

export type RecoveryStatus =
  | Readonly<{ kind: "unavailable"; reasonCode: string | null }>
  | Readonly<{ kind: "clean"; persistedRevision: AppRevision }>
  | Readonly<{
      kind: "pending";
      targetRevision: AppRevision;
      requestId: ApplicationRequestId;
    }>
  | Readonly<{
      kind: "failed";
      attemptedRevision: AppRevision;
      requestId: ApplicationRequestId;
      reasonCode: string;
    }>;

export type TransportViewState = Readonly<{
  status: ApplicationTransportStatus;
  generation: TransportGeneration;
  commandRequestId: TransportRequestId;
  notificationSequence: ApplicationSequence;
  documentId: DocumentId;
  planRevision: AppRevision;
  startBeat: BeatPosition;
  playhead: BeatPosition;
  failureCode: string | null;
}>;

export type PendingApplicationRequest = Readonly<{
  kind: ApplicationRequestKind;
  id: ApplicationRequestId;
  documentId: DocumentId;
  baseRevision: AppRevision;
  status: "running" | "cancelling";
}>;

export type DocumentTransitionState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{
      kind: "awaiting-confirmation" | "retiring-transport" | "committing";
      requestId: ApplicationRequestId;
      origin: ApplicationReplacementOrigin;
      baseRevision: AppRevision;
      candidateDocumentId: DocumentId;
      undoDisposition: "retained" | "explicitly-unavailable";
    }>;

export type HistoryEntry = Readonly<{
  commandId: CommandId;
  commandKind: ApplicationCommandKind;
  label: string;
  before: ValidatedDocument;
  after: ValidatedDocument;
  beforeBookmarks: StableUiBookmarks;
  afterBookmarks: StableUiBookmarks;
  retainedBytesEstimate: number;
  coalescing: TextCommandCoalescing | null;
  firstLogicalTimeMs: number;
  lastLogicalTimeMs: number;
}>;

export type HistoryState = Readonly<{
  undo: readonly HistoryEntry[];
  redo: readonly HistoryEntry[];
  retainedBytesEstimate: number;
}>;

export type AppState = Readonly<{
  document: ValidatedDocument;
  revision: AppRevision;
  exportRevision: AppRevision | null;
  recovery: RecoveryStatus;
  history: HistoryState;
  bookmarks: StableUiBookmarks;
  panels: PanelState;
  dialogs: DialogStack;
  quickEntry: QuickEntryDraft;
  importDraft: ImportDraft | null;
  transport: TransportViewState;
  pendingRequests: readonly PendingApplicationRequest[];
  documentTransition: DocumentTransitionState;
  focusRequest: FocusRequest;
  notices: readonly Notice[];
  nextSequence: ApplicationSequence;
}>;

export type TextCommandCoalescing = Readonly<{
  kind: "text-field";
  key: string;
  focusSessionId: FocusSessionId;
}>;

type CommandEnvelope<C extends TextCommandCoalescing | null> = Readonly<{
  id: CommandId;
  label: string;
  expectedDocumentId: DocumentId;
  expectedRevision: AppRevision;
  logicalTimeMs: number;
  coalescing: C;
}>;

export type DocumentNodeRef =
  | Readonly<{ kind: "section"; id: SectionId }>
  | Readonly<{ kind: "measure"; id: MeasureId }>
  | Readonly<{ kind: "event"; id: ChordEventId }>;

export type DocumentNodeDestination =
  | Readonly<{
      kind: "section";
      beforeSectionId: SectionId | null;
    }>
  | Readonly<{
      kind: "measure";
      sectionId: SectionId;
      beforeMeasureId: MeasureId | null;
    }>
  | Readonly<{
      kind: "event";
      measureId: MeasureId;
      beforeEventId: ChordEventId | null;
    }>;

export type MeasureCompletionUpdate = Readonly<{
  measureId: MeasureId;
  completion: MeasureCompletion;
}>;

export type InsertDocumentNodeCommand = CommandEnvelope<null> &
  Readonly<{
    kind: "insert";
    insertion:
      | Readonly<{
          nodeKind: "section";
          value: Section;
          destination: Extract<DocumentNodeDestination, { kind: "section" }>;
          completionUpdates: readonly MeasureCompletionUpdate[];
        }>
      | Readonly<{
          nodeKind: "measure";
          value: Measure;
          destination: Extract<DocumentNodeDestination, { kind: "measure" }>;
          completionUpdates: readonly MeasureCompletionUpdate[];
        }>
      | Readonly<{
          nodeKind: "event";
          value: ChordEvent;
          destination: Extract<DocumentNodeDestination, { kind: "event" }>;
          completionUpdates: readonly MeasureCompletionUpdate[];
        }>;
  }>;

export type DeleteDocumentNodesCommand = CommandEnvelope<null> &
  Readonly<{
    kind: "delete";
    targets: readonly [DocumentNodeRef, ...DocumentNodeRef[]];
    completionUpdates: readonly MeasureCompletionUpdate[];
  }>;

export type MoveDocumentNodesCommand = CommandEnvelope<null> &
  Readonly<{
    kind: "move";
    targets: readonly [DocumentNodeRef, ...DocumentNodeRef[]];
    destination: DocumentNodeDestination;
    completionUpdates: readonly MeasureCompletionUpdate[];
  }>;

export type DuplicateDocumentNodesCommand = CommandEnvelope<null> &
  Readonly<{
    kind: "duplicate";
    targets: readonly [DocumentNodeRef, ...DocumentNodeRef[]];
    destination: DocumentNodeDestination;
    completionUpdates: readonly MeasureCompletionUpdate[];
  }>;

export type TextFieldTarget =
  | Readonly<{ kind: "document-title" | "document-description" }>
  | Readonly<{
      kind: "section-name" | "section-annotation";
      sectionId: SectionId;
    }>
  | Readonly<{ kind: "event-annotation"; eventId: ChordEventId }>;

export type SetTextCommand = CommandEnvelope<TextCommandCoalescing> &
  Readonly<{
    kind: "set-text";
    target: TextFieldTarget;
    value: string;
  }>;

export type SetDurationCommand = CommandEnvelope<null> &
  Readonly<{
    kind: "set-duration";
    eventId: ChordEventId;
    duration: BeatDuration;
    completionUpdate: MeasureCompletionUpdate;
  }>;

export type SetMeasureCompletionCommand = CommandEnvelope<null> &
  Readonly<{
    kind: "set-measure-completion";
    measureId: MeasureId;
    completion: MeasureCompletion;
  }>;

export type SetSectionCommand = CommandEnvelope<null> &
  Readonly<{
    kind: "set-section";
    sectionId: SectionId;
    patch: Readonly<{
      name?: string;
      annotation?: string;
      keyOverride?: KeyContext | null;
      voiceLeadingBoundary?: SectionVoiceLeadingBoundary;
    }>;
  }>;

export type SetChordCommand = CommandEnvelope<null> &
  Readonly<{
    kind: "set-chord";
    eventId: ChordEventId;
    /**
     * Explicit complete replacement prevents a root/symbol edit from silently
     * relabeling stale Manual/Frozen pitches. ID, duration, and annotation must
     * equal the current event; chord and voicing are validated together.
     */
    replacement: ChordEvent;
  }>;

export type SetVoicingCommand = CommandEnvelope<null> &
  Readonly<{
    kind: "set-voicing";
    eventId: ChordEventId;
    voicing: Voicing;
  }>;

export type SetDocumentSettingsCommand = CommandEnvelope<null> &
  Readonly<{
    kind: "set-document-settings";
    patch: Readonly<{
      title?: string;
      description?: string;
      meter?: ProgressionDocumentV2["meter"];
      tempoBpm?: number;
      key?: KeyContext | null;
      playback?: PlaybackSettings;
    }>;
    completionUpdates: readonly MeasureCompletionUpdate[];
  }>;

export type DerivedDocumentPatch = Readonly<{
  baseRevision: AppRevision;
  sourceEventIds: readonly ChordEventId[];
  declaredChangedIds: readonly (
    | DocumentId
    | SectionId
    | MeasureId
    | ChordEventId
  )[];
  candidate: ProgressionDocumentV2;
  exactTimingPreserved: boolean;
  stableIdentityPolicy: "preserve-unmodified-allocate-new-inserts";
}>;

export type TransposeCommand = CommandEnvelope<null> &
  Readonly<{
    kind: "transpose";
    lawId: string;
    patch: DerivedDocumentPatch;
  }>;

export type ApplySuggestionCommand = CommandEnvelope<null> &
  Readonly<{
    kind: "apply-suggestion";
    suggestionId: string;
    providerId: string;
    requestId: ApplicationRequestId;
    patch: DerivedDocumentPatch;
  }>;

export type ApplyReharmonizationCommand = CommandEnvelope<null> &
  Readonly<{
    kind: "apply-reharmonization";
    branchId: string;
    transformationIds: readonly [string, ...string[]];
    requestId: ApplicationRequestId;
    patch: DerivedDocumentPatch;
  }>;

export type ReplacementRetirementReceipt = Readonly<{
  requestId: ApplicationRequestId;
  retiredTransportGeneration: TransportGeneration;
  progressionRetired: true;
  previewRetired: true;
  noFutureAttack: true;
}>;

export type ReplaceDocumentCommand = CommandEnvelope<null> &
  Readonly<{
    kind: "replace-document";
    origin: ApplicationReplacementOrigin;
    candidate: ProgressionDocumentV2;
    requestId: ApplicationRequestId;
    retirement: ReplacementRetirementReceipt;
    undoDisposition:
      | Readonly<{ kind: "retain" }>
      | Readonly<{
          kind: "explicitly-unavailable";
          confirmationId: string;
          exportRecommended: true;
        }>;
  }>;

export type DocumentCommand =
  | InsertDocumentNodeCommand
  | DeleteDocumentNodesCommand
  | MoveDocumentNodesCommand
  | DuplicateDocumentNodesCommand
  | SetTextCommand
  | SetDurationCommand
  | SetMeasureCompletionCommand
  | SetSectionCommand
  | SetChordCommand
  | SetVoicingCommand
  | SetDocumentSettingsCommand
  | TransposeCommand
  | ApplySuggestionCommand
  | ApplyReharmonizationCommand
  | ReplaceDocumentCommand
  | ApplyEditPlanCommand;

export type ApplicationRefusal = Readonly<{
  code: ApplicationRefusalCode;
  path: DomainPath;
  message: string;
  semanticIssues?: readonly DocumentSemanticIssue[];
  structuralIssues?: readonly DocumentDecoderIssue<DocumentShapeIssueCode>[];
}>;

export const APPLICATION_EFFECT_KINDS = Object.freeze([
  "queue-recovery",
  "compile-playback-plan",
  "restore-focus",
  "announce",
  "recommend-export",
] as const);

export type ApplicationEffectKind =
  (typeof APPLICATION_EFFECT_KINDS)[number];

export type ApplicationEffect = Readonly<{
  kind: ApplicationEffectKind;
  revision: AppRevision;
  requestId: ApplicationRequestId | null;
  reasonCode: string;
}>;

export type ApplicationTransitionOutcome =
  | "initialized"
  | "committed"
  | "coalesced"
  | "undone"
  | "redone"
  | "ephemeral-updated"
  | "request-started"
  | "request-settled"
  | "request-cancelled"
  | "transport-accepted"
  | "ignored-stale";

export type ApplicationTransitionResult =
  | Readonly<{
      ok: true;
      state: AppState;
      outcome: ApplicationTransitionOutcome;
      effects: readonly ApplicationEffect[];
      counters: ApplicationWorkCounters;
    }>
  | Readonly<{
      ok: false;
      /** Only notices/nextSequence may differ from the input state. */
      state: AppState;
      refusal: ApplicationRefusal;
      notice: Notice;
      effects: readonly [];
      counters: ApplicationWorkCounters;
    }>;

export type HistoryRetainedByteEstimator = (
  entry: Omit<HistoryEntry, "retainedBytesEstimate">,
) => number;

export type ApplicationCommandDependencies = Readonly<{
  decodeDocumentShape: DecodeDocumentShape;
  validateDocumentSemantics: ValidateDocumentSemantics;
  copyDomain: DomainCopyOperation;
  stableIdFactory: StableIdFactory;
  estimateHistoryRetainedBytes: HistoryRetainedByteEstimator;
  /**
   * Synchronous public T0 fragment parser bound by the composition root; the
   * `apply-edit-plan` path calls it exactly once (A0/U1 amendment, R1
   * accepted 2026-07-24).
   */
  parseChartText: ParseAtomicEditPlanFragment;
}>;

export type CreateInitialAppStateRequest = Readonly<{
  document: ValidatedDocument;
  zeroBeat: BeatPosition;
  initialPanels: PanelState;
}>;

export type RunDocumentCommandRequest = Readonly<{
  state: AppState;
  command: DocumentCommand;
  dependencies: ApplicationCommandDependencies;
}>;

export type HistoryCommandRequest = Readonly<{
  state: AppState;
}>;

export type EphemeralIntent =
  | Readonly<{ kind: "set-bookmarks"; bookmarks: StableUiBookmarks }>
  | Readonly<{ kind: "set-panels"; panels: PanelState }>
  | Readonly<{ kind: "push-dialog"; dialog: DialogDescriptor }>
  | Readonly<{ kind: "pop-dialog"; dialogId: string }>
  | Readonly<{ kind: "set-quick-entry"; draft: QuickEntryDraft }>
  | Readonly<{ kind: "set-import-draft"; draft: ImportDraft | null }>
  | Readonly<{ kind: "dismiss-notice"; sequence: ApplicationSequence }>
  | Readonly<{ kind: "mark-exported"; revision: AppRevision }>
  | Readonly<{ kind: "set-recovery"; recovery: RecoveryStatus }>
  | Readonly<{
      kind: "set-document-transition";
      transition: DocumentTransitionState;
    }>
  | Readonly<{
      kind: "expect-transport";
      commandRequestId: TransportRequestId;
      documentId: DocumentId;
      planRevision: AppRevision;
      status: "starting" | "stopping";
      startBeat: BeatPosition;
      playhead: BeatPosition;
    }>
  | Readonly<{ kind: "acknowledge-focus"; sequence: ApplicationSequence }>;

export type ReduceEphemeralIntentRequest = Readonly<{
  state: AppState;
  intent: EphemeralIntent;
}>;

export type BeginApplicationRequestRequest = Readonly<{
  state: AppState;
  request: PendingApplicationRequest;
}>;

export type SettleApplicationRequestRequest = Readonly<{
  state: AppState;
  kind: ApplicationRequestKind;
  id: ApplicationRequestId;
  documentId: DocumentId;
  baseRevision: AppRevision;
  disposition: "complete" | "cancel";
}>;

export type TransportNotification = Readonly<{
  status: Exclude<ApplicationTransportStatus, "unavailable">;
  generation: TransportGeneration;
  commandRequestId: TransportRequestId;
  notificationSequence: ApplicationSequence;
  documentId: DocumentId;
  planRevision: AppRevision;
  startBeat: BeatPosition;
  playhead: BeatPosition;
  failureCode: string | null;
}>;

export type AcceptTransportNotificationRequest = Readonly<{
  state: AppState;
  notification: TransportNotification;
}>;

export type SelectedEventsResult = Readonly<{
  events: readonly ChordEvent[];
  missingIds: readonly ChordEventId[];
}>;

export type InsertionLocation =
  | Readonly<{ kind: "none" }>
  | Readonly<{
      kind: "section-boundary";
      beforeSectionId: SectionId | null;
    }>
  | Readonly<{
      kind: "measure-boundary";
      sectionId: SectionId;
      beforeMeasureId: MeasureId | null;
    }>
  | Readonly<{
      kind: "event-boundary";
      measureId: MeasureId;
      beforeEventId: ChordEventId | null;
    }>;

export type DirtyState = Readonly<{
  sinceExport: boolean;
  sinceRecovery: boolean;
}>;

export type HistoryAvailability = Readonly<{
  canUndo: boolean;
  canRedo: boolean;
  locked: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
}>;

export type CreateInitialAppState = (
  request: CreateInitialAppStateRequest,
) => ApplicationTransitionResult;
export type RunDocumentCommand = (
  request: RunDocumentCommandRequest,
) => ApplicationTransitionResult;
export type UndoDocumentCommand = (
  request: HistoryCommandRequest,
) => ApplicationTransitionResult;
export type RedoDocumentCommand = (
  request: HistoryCommandRequest,
) => ApplicationTransitionResult;
export type ReduceEphemeralIntent = (
  request: ReduceEphemeralIntentRequest,
) => ApplicationTransitionResult;
export type BeginApplicationRequest = (
  request: BeginApplicationRequestRequest,
) => ApplicationTransitionResult;
export type SettleApplicationRequest = (
  request: SettleApplicationRequestRequest,
) => ApplicationTransitionResult;
export type AcceptTransportNotification = (
  request: AcceptTransportNotificationRequest,
) => ApplicationTransitionResult;
export type SelectEventById = (
  state: AppState,
  eventId: ChordEventId,
) => ChordEvent | null;
export type SelectSelectedEvents = (state: AppState) => SelectedEventsResult;
export type SelectInsertionLocation = (state: AppState) => InsertionLocation;
export type SelectBeatRange = (state: AppState) => BeatRange | null;
export type SelectDirtyState = (state: AppState) => DirtyState;
export type SelectHistoryAvailability = (
  state: AppState,
) => HistoryAvailability;

export interface ApplicationStateOperations {
  readonly createInitialAppState: CreateInitialAppState;
  readonly runDocumentCommand: RunDocumentCommand;
  readonly undoDocumentCommand: UndoDocumentCommand;
  readonly redoDocumentCommand: RedoDocumentCommand;
  readonly reduceEphemeralIntent: ReduceEphemeralIntent;
  readonly beginApplicationRequest: BeginApplicationRequest;
  readonly settleApplicationRequest: SettleApplicationRequest;
  readonly acceptTransportNotification: AcceptTransportNotification;
  readonly selectEventById: SelectEventById;
  readonly selectSelectedEvents: SelectSelectedEvents;
  readonly selectInsertionLocation: SelectInsertionLocation;
  readonly selectBeatRange: SelectBeatRange;
  readonly selectDirtyState: SelectDirtyState;
  readonly selectHistoryAvailability: SelectHistoryAvailability;
}
