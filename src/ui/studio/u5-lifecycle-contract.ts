/**
 * U5 lifecycle-dialogs contract.
 *
 * This module is the code-facing U5 authority. It declares the lifecycle
 * dialog surface, its bounded public values, the closed operation inventory,
 * the replacement-confirmation requirement law, and the exact application
 * channel each operation is allowed to use. It contains no DOM access, no
 * Preact import, and no application, persistence, or export import: U5 adds
 * no lifecycle channel of its own, so the bindings to A0, A1, E0, C0, and U0
 * are declared as reviewed literal strings and proved against the live
 * tuples by the static contract test.
 *
 * The independent expectations live under `tests/fixtures/lifecycle-dialogs/`.
 * Production components may be compared with those fixtures; they may never
 * generate, rewrite, or bless their expectations.
 */

export const U5_LIFECYCLE_CONTRACT_SCHEMA =
  "changes.ui.u5-lifecycle-contract.v1";
export const U5_LIFECYCLE_PACKAGE = "U5";
export const U5_LIFECYCLE_POLICY_ID = "changes.ui.lifecycle-dialogs";
export const U5_LIFECYCLE_POLICY_VERSION = 1;
export const U5_LIFECYCLE_BEAD_ID = "jcpe-milestone-reliable-studio-l3a.13.1";

/**
 * The code-facing status of the U5 surface. No U5 production component is
 * claimed by this packet; moving this value requires the recorded human
 * acceptance owned by the U5 verify leg.
 */
export const U5_LIFECYCLE_IMPLEMENTATION_STATUS = "specified-not-implemented";

/* -------------------------------------------------------------------------- */
/* Frozen upstream bindings (reviewed literals; proved by the static test)     */
/* -------------------------------------------------------------------------- */

/** Mirrors `APPLICATION_DIALOG_KINDS` in the A0 state contract (base six). */
export const U5_A0_DIALOG_KINDS = /* @__PURE__ */ Object.freeze([
  "new-document",
  "lesson-load",
  "import-confirm",
  "discard-changes",
  "history-limit",
  "error-details",
] as const);

/**
 * The two additive dialog-kind proposals, following the U7 `midi-export`
 * append precedent. The accepted A0 v1 union neither imports nor consumes
 * them; the static test proves the base tuple still equals the live six.
 */
export const U5_PROPOSED_DIALOG_KINDS = /* @__PURE__ */ Object.freeze([
  "import-preview",
  "lifecycle-export",
] as const);

export const U5_DIALOG_KINDS_WITH_LIFECYCLE = /* @__PURE__ */ Object.freeze([
  ...U5_A0_DIALOG_KINDS,
  ...U5_PROPOSED_DIALOG_KINDS,
] as const);

/** Mirrors `DialogDescriptor["phase"]`. */
export const U5_DIALOG_PHASES = /* @__PURE__ */ Object.freeze([
  "open",
  "committing",
  "failed",
] as const);

/** Mirrors the A0 `DocumentTransitionState` kind union. */
export const U5_DOCUMENT_TRANSITION_STATES = /* @__PURE__ */ Object.freeze([
  "idle",
  "awaiting-confirmation",
  "retiring-transport",
  "committing",
] as const);

/** Mirrors `APPLICATION_REPLACEMENT_ORIGINS`. */
export const U5_REPLACEMENT_ORIGINS = /* @__PURE__ */ Object.freeze([
  "new",
  "lesson",
  "canonical-import",
  "legacy-import",
] as const);

/** Mirrors the A0 `RecoveryStatus` kind union. */
export const U5_RECOVERY_STATUS_KINDS = /* @__PURE__ */ Object.freeze([
  "unavailable",
  "clean",
  "pending",
  "failed",
] as const);

/** Mirrors the A0 `ImportDraft["status"]` union. */
export const U5_IMPORT_DRAFT_STATUSES = /* @__PURE__ */ Object.freeze([
  "reading",
  "invalid",
  "ready",
  "cancelled",
] as const);

/** Mirrors `RECOVERY_STARTUP_DISPOSITIONS` in the A1 recovery contract. */
export const U5_STARTUP_DISPOSITIONS = /* @__PURE__ */ Object.freeze([
  "open-current-automatically",
  "offer-keep-discard",
  "offer-previous",
  "report-unrecoverable",
  "none-available",
] as const);

/** Mirrors `RECOVERY_REFUSAL_CODES` in the A1 recovery contract. */
export const U5_RECOVERY_REFUSAL_CODES = /* @__PURE__ */ Object.freeze([
  "recovery.unavailable",
  "recovery.probe_failed",
  "recovery.quota_exceeded",
  "recovery.write_denied",
  "recovery.envelope_too_large",
  "recovery.corrupt_envelope",
  "recovery.checksum_mismatch",
  "recovery.schema_unknown",
  "recovery.revision_invalid",
  "recovery.stale_completion",
  "recovery.export_marker_stale",
  "recovery.export_binding_invalid",
  "recovery.document_id_mismatch",
  "recovery.disposed",
] as const);

/**
 * The frozen A1 recovery status vocabulary keys. The status strip renders
 * these strings verbatim with their `{time}`/`{revision}` substitutions;
 * no other recovery wording exists anywhere in U5.
 */
export const U5_RECOVERY_VOCABULARY_KEYS = /* @__PURE__ */ Object.freeze([
  "recoveredLocally",
  "changesPending",
  "unavailable",
  "exportedAtRevision",
  "changedSinceExport",
] as const);

/** Mirrors `IMPORT_SOURCE_CHANNELS` in the E0 interchange contract. */
export const U5_IMPORT_SOURCE_CHANNELS = /* @__PURE__ */ Object.freeze([
  "file",
  "paste",
] as const);

/** Mirrors `IMPORT_FORMAT_HINTS` in the E0 interchange contract. */
export const U5_IMPORT_FORMAT_HINTS = /* @__PURE__ */ Object.freeze([
  "auto",
  "canonical-json",
  "legacy-json",
  "chart-text",
] as const);

/** Mirrors `IMPORT_SOURCE_FORMATS` in the E0 interchange contract. */
export const U5_IMPORT_SOURCE_FORMATS = /* @__PURE__ */ Object.freeze([
  "canonical-json-v2",
  "unversioned-legacy-json",
  "chart-text-v1",
] as const);
/** The E0 report retention policy literal. */
export const U5_IMPORT_REPORT_RETENTION_POLICY =
  "group-source-path-code-target-path-first-256";

/** Mirrors the C0 legacy migration report group order. */
export const U5_LEGACY_REPORT_GROUPS = /* @__PURE__ */ Object.freeze([
  "preserved",
  "canonicalized",
  "custom",
  "ignored",
  "rejected",
] as const);

/** The replacement-workflow and history refusal/notice codes U5 renders. */
export const U5_LIFECYCLE_WORKFLOW_CODES = /* @__PURE__ */ Object.freeze([
  "import.replacement_workflow_busy",
  "import.replacement_workflow_begin_failed",
  "history.nonundoable_confirmation_required",
  "history.replacement_not_undoable",
  "dialog.stack_limit",
] as const);

/** Mirrors the U0 overlay caps these dialogs inherit. */
export const U5_OVERLAY_LIMITS = /* @__PURE__ */ Object.freeze({
  maxModalScopes: 1,
  maxNonmodalSurfaces: 4,
  maxDismissAncestors: 8,
} as const);

/**
 * U5 dispatches exactly four A0 ephemeral intent kinds; every lifecycle
 * effect beyond dialog/draft/notice bookkeeping crosses a composition
 * method. The remaining union members are pinned forbidden so a future
 * implementation cannot smuggle a channel in.
 */
export const U5_AUTHORIZED_EPHEMERAL_INTENT_KINDS = /* @__PURE__ */ Object.freeze([
  "push-dialog",
  "pop-dialog",
  "set-import-draft",
  "dismiss-notice",
] as const);

export const U5_FORBIDDEN_EPHEMERAL_INTENT_KINDS = /* @__PURE__ */ Object.freeze([
  "set-bookmarks",
  "set-panels",
  "set-quick-entry",
  "mark-exported",
  "set-recovery",
  "set-document-transition",
  "expect-transport",
  "settle-transport-expectation",
  "acknowledge-focus",
] as const);

/* -------------------------------------------------------------------------- */
/* Surfaces and components                                                     */
/* -------------------------------------------------------------------------- */

export const U5_LIFECYCLE_SURFACES = /* @__PURE__ */ Object.freeze([
  "startup",
  "lifecycle-dialogs",
  "import-export",
  "status-strip",
] as const);

export type U5LifecycleSurface = (typeof U5_LIFECYCLE_SURFACES)[number];

export const U5_COMPONENT_INVENTORY = /* @__PURE__ */ Object.freeze([
  { id: "U5-CMP-001", name: "StartupRecoveryOffer", surface: "startup" },
  { id: "U5-CMP-002", name: "StartupRecoveryFallbackOffer", surface: "startup" },
  {
    id: "U5-CMP-003",
    name: "StartupRecoveryUnrecoverableNotice",
    surface: "startup",
  },
  { id: "U5-CMP-004", name: "StartupRecoveryStatusLine", surface: "startup" },
  { id: "U5-CMP-005", name: "LifecycleDialogHost", surface: "lifecycle-dialogs" },
  { id: "U5-CMP-006", name: "NewDocumentDialog", surface: "lifecycle-dialogs" },
  { id: "U5-CMP-007", name: "LessonLoadDialog", surface: "lifecycle-dialogs" },
  { id: "U5-CMP-008", name: "ImportConfirmDialog", surface: "lifecycle-dialogs" },
  { id: "U5-CMP-009", name: "DiscardChangesDialog", surface: "lifecycle-dialogs" },
  { id: "U5-CMP-010", name: "HistoryLimitDialog", surface: "lifecycle-dialogs" },
  { id: "U5-CMP-011", name: "ErrorDetailsDialog", surface: "lifecycle-dialogs" },
  {
    id: "U5-CMP-012",
    name: "ReplacementPreservedWorkSummary",
    surface: "lifecycle-dialogs",
  },
  { id: "U5-CMP-013", name: "ImportPreviewDialog", surface: "import-export" },
  { id: "U5-CMP-014", name: "ImportFormatHintPicker", surface: "import-export" },
  { id: "U5-CMP-015", name: "ImportReportGroupList", surface: "import-export" },
  { id: "U5-CMP-016", name: "ImportReportRow", surface: "import-export" },
  { id: "U5-CMP-017", name: "ExportDialog", surface: "import-export" },
  { id: "U5-CMP-018", name: "ExportResultSurface", surface: "import-export" },
  { id: "U5-CMP-019", name: "LifecycleStatusStrip", surface: "status-strip" },
  { id: "U5-CMP-020", name: "RecoveryStatusLine", surface: "status-strip" },
  { id: "U5-CMP-021", name: "ExportMarkerLine", surface: "status-strip" },
  { id: "U5-CMP-022", name: "StorageStatusNotice", surface: "status-strip" },
] as const);

export type U5ComponentContract = (typeof U5_COMPONENT_INVENTORY)[number];
export type U5ComponentId = U5ComponentContract["id"];

export const U5_COMPONENT_COUNT = 22;

/* -------------------------------------------------------------------------- */
/* Limits                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Every bound is inherited from an upstream contract or derived from one:
 * the A0 dialog stack, notice, and pending-request caps; the U0 overlay
 * caps; the E0 report retention bound; and the draft/copy text caps.
 */
export const U5_LIFECYCLE_LIMITS = /* @__PURE__ */ Object.freeze({
  maxDialogStackDepth: 8,
  maxNotices: 32,
  maxPendingRequests: 8,
  maxModalScopes: 1,
  maxNonmodalSurfaces: 4,
  maxDismissAncestors: 8,
  maxReportItemsPerGroup: 256,
  maxDialogCopyCodePoints: 2_000,
  maxDialogTitleCodePoints: 128,
  maxRefusalDetailCodePoints: 512,
  maxOperations: 24,
  maxComponents: 22,
} as const);

/* -------------------------------------------------------------------------- */
/* Startup presentation law                                                    */
/* -------------------------------------------------------------------------- */

/** One row per A1 startup disposition; all five render a designed state. */
export const U5_STARTUP_PRESENTATION = /* @__PURE__ */ Object.freeze([
  {
    disposition: "open-current-automatically",
    component: "U5-CMP-001",
    surfaceKind: "alertdialog-region",
    offers: ["discard", "new"],
  },
  {
    disposition: "offer-keep-discard",
    component: "U5-CMP-001",
    surfaceKind: "alertdialog-region",
    offers: ["keep", "discard"],
  },
  {
    disposition: "offer-previous",
    component: "U5-CMP-002",
    surfaceKind: "alertdialog-region",
    offers: ["keep-previous", "discard"],
  },
  {
    disposition: "report-unrecoverable",
    component: "U5-CMP-003",
    surfaceKind: "nonblocking-notice",
    offers: ["dismiss"],
  },
  {
    disposition: "none-available",
    component: null,
    surfaceKind: "none",
    offers: [],
  },
] as const);

/* -------------------------------------------------------------------------- */
/* Replacement-confirmation requirement law                                    */
/* -------------------------------------------------------------------------- */

/** The accepted transport statuses in which a run is active. */
export const U5_RUN_ACTIVE_STATUSES = /* @__PURE__ */ Object.freeze([
  "starting",
  "playing",
  "paused",
  "stopping",
] as const);

/**
 * Replacement confirmation is required exactly when the current document is
 * nonempty AND (dirty OR a run is active). Dirty means the revision differs
 * from the last export marker or recovery is not current for this revision.
 * The dialog-state matrix fixture expands this law; the validator recomputes
 * the expansion.
 */
export const U5_CONFIRMATION_REQUIREMENT_LAW = /* @__PURE__ */ Object.freeze({
  requiresWhen: "document-nonempty-and-(dirty-or-run-active)",
  pristineIdleReplaces: "without-dialog",
} as const);

/* -------------------------------------------------------------------------- */
/* Operations                                                                  */
/* -------------------------------------------------------------------------- */

export const U5_OPERATION_CHANNELS = /* @__PURE__ */ Object.freeze([
  "composition-method",
  "ephemeral-intent",
  "presentation-only",
] as const);

export type U5OperationChannel = (typeof U5_OPERATION_CHANNELS)[number];

export type U5OperationContract = Readonly<{
  id: string;
  label: string;
  component: U5ComponentId;
  channel: U5OperationChannel;
  /** The one composition-surface method the row may invoke; null otherwise. */
  compositionMethod: string | null;
  /** The one A0 ephemeral intent kind; null otherwise. */
  intentKind: (typeof U5_AUTHORIZED_EPHEMERAL_INTENT_KINDS)[number] | null;
  keyboardAccess: string;
  pointerAlternative: string;
}>;

export const U5_TRANSPORT_OPERATIONS_NOTE =
  "U5 owns no transport operation; replacement confirmation rides the serialized stop-and-swap below the UI boundary.";

export const U5_LIFECYCLE_OPERATIONS: readonly U5OperationContract[] =
  /* @__PURE__ */ Object.freeze([
    {
      id: "open-new-document",
      label: "New chart",
      component: "U5-CMP-006",
      channel: "composition-method",
      compositionMethod: "openLifecycleDialog",
      intentKind: null,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "confirm-new-document",
      label: "Replace with new chart",
      component: "U5-CMP-006",
      channel: "composition-method",
      compositionMethod: "confirmReplacement",
      intentKind: null,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "open-lesson-load",
      label: "Load lesson",
      component: "U5-CMP-007",
      channel: "composition-method",
      compositionMethod: "openLifecycleDialog",
      intentKind: null,
      keyboardAccess: "list-item-keys",
      pointerAlternative: "list-item-activation",
    },
    {
      id: "confirm-lesson-load",
      label: "Replace with lesson",
      component: "U5-CMP-007",
      channel: "composition-method",
      compositionMethod: "confirmReplacement",
      intentKind: null,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "open-import-preview",
      label: "Import chart",
      component: "U5-CMP-013",
      channel: "composition-method",
      compositionMethod: "openLifecycleDialog",
      intentKind: null,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "pick-import-file",
      label: "Choose file",
      component: "U5-CMP-013",
      channel: "composition-method",
      compositionMethod: "readImportCandidate",
      intentKind: null,
      keyboardAccess: "file-input-keys",
      pointerAlternative: "file-input-activation",
    },
    {
      id: "paste-import-text",
      label: "Paste chart text",
      component: "U5-CMP-013",
      channel: "composition-method",
      compositionMethod: "readImportCandidate",
      intentKind: null,
      keyboardAccess: "text-entry",
      pointerAlternative: "text-entry",
    },
    {
      id: "set-import-format-hint",
      label: "Format hint",
      component: "U5-CMP-014",
      channel: "presentation-only",
      compositionMethod: null,
      intentKind: null,
      keyboardAccess: "select-keys",
      pointerAlternative: "select-activation",
    },
    {
      id: "commit-import-preview",
      label: "Commit import",
      component: "U5-CMP-013",
      channel: "composition-method",
      compositionMethod: "commitImportPreview",
      intentKind: null,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "discard-import-preview",
      label: "Discard import",
      component: "U5-CMP-013",
      channel: "ephemeral-intent",
      compositionMethod: null,
      intentKind: "set-import-draft",
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "open-discard-changes",
      label: "Discard changes",
      component: "U5-CMP-009",
      channel: "composition-method",
      compositionMethod: "openLifecycleDialog",
      intentKind: null,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "confirm-discard-changes",
      label: "Discard changes",
      component: "U5-CMP-009",
      channel: "composition-method",
      compositionMethod: "confirmReplacement",
      intentKind: null,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "acknowledge-history-limit",
      label: "Acknowledge history limit",
      component: "U5-CMP-010",
      channel: "ephemeral-intent",
      compositionMethod: null,
      intentKind: "pop-dialog",
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "open-error-details",
      label: "Error details",
      component: "U5-CMP-011",
      channel: "ephemeral-intent",
      compositionMethod: null,
      intentKind: "push-dialog",
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "open-export-dialog",
      label: "Export",
      component: "U5-CMP-017",
      channel: "composition-method",
      compositionMethod: "openLifecycleDialog",
      intentKind: null,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "export-canonical-json",
      label: "Export JSON",
      component: "U5-CMP-017",
      channel: "composition-method",
      compositionMethod: "deliverCanonicalExport",
      intentKind: null,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "export-lead-sheet-text",
      label: "Export text",
      component: "U5-CMP-017",
      channel: "composition-method",
      compositionMethod: "deliverCanonicalExport",
      intentKind: null,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "dismiss-export-result",
      label: "Dismiss export result",
      component: "U5-CMP-018",
      channel: "ephemeral-intent",
      compositionMethod: null,
      intentKind: "pop-dialog",
      keyboardAccess: "escape-or-button",
      pointerAlternative: "button-activation",
    },
    {
      id: "keep-recovered-current",
      label: "Keep recovered chart",
      component: "U5-CMP-001",
      channel: "composition-method",
      compositionMethod: "keepRecovered",
      intentKind: null,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "discard-recovered",
      label: "Discard",
      component: "U5-CMP-001",
      channel: "composition-method",
      compositionMethod: "discardRecovered",
      intentKind: null,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "keep-recovered-previous",
      label: "Keep previous copy",
      component: "U5-CMP-002",
      channel: "composition-method",
      compositionMethod: "keepRecovered",
      intentKind: null,
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "dismiss-unrecoverable-notice",
      label: "Dismiss recovery notice",
      component: "U5-CMP-003",
      channel: "ephemeral-intent",
      compositionMethod: null,
      intentKind: "dismiss-notice",
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
    {
      id: "cancel-lifecycle-dialog",
      label: "Cancel",
      component: "U5-CMP-005",
      channel: "composition-method",
      compositionMethod: "cancelLifecycleDialog",
      intentKind: null,
      keyboardAccess: "escape-or-button",
      pointerAlternative: "button-activation",
    },
    {
      id: "dismiss-status-notice",
      label: "Dismiss status notice",
      component: "U5-CMP-022",
      channel: "ephemeral-intent",
      compositionMethod: null,
      intentKind: "dismiss-notice",
      keyboardAccess: "button-focus-enter",
      pointerAlternative: "button-activation",
    },
  ] as const);

export type U5OperationId = (typeof U5_LIFECYCLE_OPERATIONS)[number]["id"];
export const U5_OPERATION_COUNT = 24;
